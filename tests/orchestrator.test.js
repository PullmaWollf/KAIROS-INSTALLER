import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {newWorkflow,nextPhase,completePhase,updateTargets} from '../provisioner/workflow.js';
import {writeJournal,readJournal} from '../provisioner/journal.js';
import {readRecovery,recoveryStatus,newRecovery,beginOperation,settleOperation,writeRecovery} from '../provisioner/recovery.js';
import {executeNext,executeSequence} from '../provisioner/orchestrator.js';
const config={owner:'cliente',repository:'kairos-cliente',cellName:'Célula Cliente',visibility:'private',
 supabaseOrgId:'org_abc123',supabaseRef:'',supabaseRegion:'sa-east-1',vercelTeamId:'team_abc123',vercelProjectId:'',
 coreDir:'/tmp/core-cliente',adminLogin:'admin-cliente',adminName:'Administrador',pwaUrl:''};
const consent={execute:true,acceptBilling:true,owner:'cliente',organizationId:'org_abc123',teamId:'team_abc123'};
async function setup(){
 const dir=await mkdtemp(join(tmpdir(),'kairos-orchestrator-'));
 const stateFile=join(dir,'state.json'),recoveryFile=join(dir,'operations.json');
 await writeJournal(stateFile,newWorkflow(config),{initial:true});
 return {dir,stateFile,recoveryFile};
}
test('dry-run não chama provedor nem cria recovery',async()=>{
 const s=await setup();
 try{
  const ops={precheck(){throw Error('should not run')},run(){throw Error('should not run')}};
  const r=await executeNext({stateFile:s.stateFile,recoveryFile:s.recoveryFile,ops});
  assert.equal(r.status,'dry-run');
  assert.equal(nextPhase(await readJournal(s.stateFile)),'github');
 }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('criação confirmada avança e armazena somente estágio, sem token',async()=>{
 const s=await setup();
 try{
  const ops={async precheck(){},async run(){return {repository:'cliente/kairos-cliente'}},async reconcile(){throw Error('not called')}};
  const r=await executeNext({stateFile:s.stateFile,recoveryFile:s.recoveryFile,ops,env:{GITHUB_TOKEN:'secret-to-never-store'},consent});
  assert.equal(r.status,'recorded');
  const saved=await readRecovery(s.recoveryFile);
  assert.equal(recoveryStatus(saved,'github'),'confirmed');
  assert.equal(JSON.stringify(saved).includes('secret-to-never-store'),false);
  assert.equal(nextPhase(await readJournal(s.stateFile)),'supabase');
 }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('falha remota não repete operações no resume, reconcilia somente leitura',async()=>{
 const s=await setup();let calls=0,reads=0;
 try{
  const ops={async precheck(){},async run(){calls++;throw Error('timeout after POST');},async reconcile(){reads++;return {status:'exists-review'}}};
  const first=await executeNext({stateFile:s.stateFile,recoveryFile:s.recoveryFile,ops,consent});
  assert.equal(first.status,'needs-review');
  const again=await executeNext({stateFile:s.stateFile,recoveryFile:s.recoveryFile,ops,consent,env:{GITHUB_TOKEN:'local-secret'}});
  assert.equal(again.automaticRetry,false);
  assert.equal(calls,1);assert.equal(reads,1);
  assert.equal(again.reconciliation.status,'exists-review');
 }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('sem confirmação correta nenhuma operação executa',async()=>{
 const s=await setup();
 try{
  await assert.rejects(executeNext({stateFile:s.stateFile,recoveryFile:s.recoveryFile,consent:{...consent,teamId:'time-mantenedor'},ops:{precheck(){throw Error('network used')}}}),e=>e.code==='CONSENT');
 }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('sequência pausa em etapa que precisa de intervenção',async()=>{
 const s=await setup();let count=0;
 try{
  const ops={async precheck(){},async run(phase){count++;if(phase==='supabase')throw Error('possible project creation');return {repository:'cliente/kairos-cliente'};},async reconcile(){return {status:'unknown'}}};
  const out=await executeSequence({stateFile:s.stateFile,recoveryFile:s.recoveryFile,ops,consent});
  assert.equal(count,2);assert.equal(out.completedAll,false);assert.equal(out.report.at(-1).status,'needs-review');
 }finally{await rm(s.dir,{recursive:true,force:true});}
});

test('read-only smoke recovery reconcilia sem repetir operações externas',async()=>{
 const s=await setup();
 try{
  let state=await readJournal(s.stateFile);
  state=completePhase(state,'github');state=completePhase(state,'supabase');
  state=updateTargets(state,{supabaseRef:'abcdefghijklmno'});state=completePhase(state,'migrate');
  state=completePhase(state,'vercel');state=updateTargets(state,{vercelProjectId:'prj_12345678'});
  state=completePhase(state,'env');state=completePhase(state,'bootstrap');state=completePhase(state,'deploy');
  state=updateTargets(state,{pwaUrl:'https://cliente.vercel.app'});
  const initial=await readJournal(s.stateFile);
  await writeJournal(s.stateFile,state,{expected:initial});
  const recovery=newRecovery(config);
  let uncertain=beginOperation(recovery,'smoke');
  uncertain=settleOperation(uncertain,'smoke',{confirmed:false});
  await writeRecovery(s.recoveryFile,uncertain,{initial:true});
  let remoteWrites=0;
  const ops={async reconcile(phase){assert.equal(phase,'smoke');return {status:'verified'};},
   async precheck(){remoteWrites++},async run(){remoteWrites++}};
  const out=await executeNext({stateFile:s.stateFile,recoveryFile:s.recoveryFile,env:{},consent,ops});
  assert.equal(out.status,'recovered');assert.equal(out.remoteWrites,0);assert.equal(remoteWrites,0);
  assert.equal((await readJournal(s.stateFile)).steps.smoke.state,'verified');
 }finally{await rm(s.dir,{recursive:true,force:true});}
});

test('recupera crash entre sucesso remoto e escrita de progresso sem novo POST',async()=>{
 const s=await setup();let writes=0;
 try{
  const r=newRecovery(config);
  const begun=beginOperation(r,'github');
  const confirmed=settleOperation(begun,'github',{confirmed:true,receipt:{repository:'cliente/kairos-cliente'}});
  await writeRecovery(s.recoveryFile,confirmed,{initial:true});
  const ops={async run(){writes++},async precheck(){writes++},async reconcile(){writes++}};
  const out=await executeNext({stateFile:s.stateFile,recoveryFile:s.recoveryFile,consent,ops});
  assert.equal(out.status,'recovered');assert.equal(out.source,'durable-receipt');
  assert.equal(out.remoteWrites,0);assert.equal(writes,0);
  assert.equal(nextPhase(await readJournal(s.stateFile)),'supabase');
 }finally{await rm(s.dir,{recursive:true,force:true});}
});
test('comprovante com destino diferente bloqueia recuperação',async()=>{
 const s=await setup();
 try{
  const r=newRecovery(config),begun=beginOperation(r,'github');
  await writeRecovery(s.recoveryFile,settleOperation(begun,'github',{confirmed:true,receipt:{repository:'outra/celula'}}),{initial:true});
  await assert.rejects(executeNext({stateFile:s.stateFile,recoveryFile:s.recoveryFile,consent}),e=>e.code==='WRONG_SCOPE');
 }finally{await rm(s.dir,{recursive:true,force:true});}
});
