import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {newRecovery,beginOperation,settleOperation,recoveryStatus,readRecovery,writeRecovery} from '../provisioner/recovery.js';
import {reconcileGithub,reconcileSupabase,reconcileVercel} from '../provisioner/reconcile.js';
const config={owner:'cliente',repository:'kairos-cliente',supabaseOrgId:'org_abc123',vercelTeamId:'team_abc123'};
const result=(status,body)=>({status,async json(){return body;}});
test('recovery bloqueia reexecução de escrita ambígua e não salva credenciais',()=>{
 let r=newRecovery(config);
 r=beginOperation(r,'supabase');
 assert.equal(recoveryStatus(r,'supabase'),'started');
 assert.throws(()=>beginOperation(r,'supabase'),e=>e.code==='REVIEW_REQUIRED');
 r=settleOperation(r,'supabase',{confirmed:false});
 assert.equal(recoveryStatus(r,'supabase'),'needs-review');
 assert.throws(()=>beginOperation(r,'supabase'),e=>e.code==='REVIEW_REQUIRED');
 assert.equal(JSON.stringify(r).includes('TOKEN'),false);
});
test('registros de operação são retomáveis e alterações concorrentes bloqueadas',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'kairos-recovery-'));
 try{
  const file=join(dir,'journal.json'),initial=newRecovery(config);
  await writeRecovery(file,initial,{initial:true});
  const r=await readRecovery(file);
  await writeRecovery(file,beginOperation(r,'github'),{expected:r});
  const later=await readRecovery(file);
  assert.equal(recoveryStatus(later,'github'),'started');
  await assert.rejects(writeRecovery(file,beginOperation(r,'supabase'),{expected:r}),e=>e.code==='STALE_STATE');
 }finally{await rm(dir,{recursive:true,force:true});}
});
test('reconciliação Github identifica conflito sem reexecutar POST',async()=>{
 const fetcher=async(_u,o)=>{assert.equal(o.method,'GET');return result(200,{full_name:'cliente/kairos-cliente',owner:{login:'cliente'}});};
 const r=await reconcileGithub({fetcher,token:'mock',owner:'cliente',repository:'kairos-cliente'});
 assert.equal(r.status,'exists-review');
 await assert.rejects(reconcileGithub({owner:'PullmaWollf',repository:'KAIROS-CORE'}),e=>e.code==='BAD_TARGET');
});
test('Supabase reconcilia por organização e nome, rejeita resultados ambíguos',async()=>{
 const fetcher=async()=>result(200,[{name:'kairos-cliente',organization_id:'org_abc123',id:'abcdefghijklmnopqrst'}]);
 const r=await reconcileSupabase({fetcher,token:'mock',organizationId:'org_abc123',projectName:'kairos-cliente'});
 assert.equal(r.projectRef,'abcdefghijklmnopqrst');
 const ambiguous=async()=>result(200,[{name:'kairos-cliente',organization_id:'org_abc123',id:'abcdefghij'},{name:'kairos-cliente',organization_id:'org_abc123',id:'1234567890'}]);
 await assert.rejects(reconcileSupabase({fetcher:ambiguous,token:'mock',organizationId:'org_abc123',projectName:'kairos-cliente'}),e=>e.code==='AMBIGUOUS');
});
test('Vercel só aceita projeto no time e repo exatos',async()=>{
 const fetcher=async()=>result(200,{id:'prj_abcdefgh',name:'kairos-cliente',accountId:'team_abc123',link:{type:'github',repo:'cliente/kairos-cliente'}});
 const r=await reconcileVercel({fetcher,token:'mock',teamId:'team_abc123',projectName:'kairos-cliente',repository:'cliente/kairos-cliente'});
 assert.equal(r.status,'exists-review');
 await assert.rejects(reconcileVercel({fetcher:async()=>result(200,{id:'prj_abcdefgh',name:'kairos-cliente',accountId:'other',link:{type:'github',repo:'cliente/kairos-cliente'}}),token:'mock',teamId:'team_abc123',projectName:'kairos-cliente',repository:'cliente/kairos-cliente'}),e=>e.code==='WRONG_OWNER');
});

test('receipt só inclui identificadores não secretos autorizados por etapa',()=>{
 const r=beginOperation(newRecovery(config),'supabase');
 assert.throws(()=>settleOperation(r,'supabase',{confirmed:true,receipt:{projectRef:'abcdefghijklmnop',token:'secret'}}),e=>e.code==='BAD_RECOVERY');
 const ok=settleOperation(r,'supabase',{confirmed:true,receipt:{projectRef:'abcdefghijklmnop'}});
 assert.equal(ok.operations.supabase.receipt.projectRef,'abcdefghijklmnop');
});
