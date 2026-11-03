import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {newWorkflow,validateWorkflow,nextPhase,completePhase,updateTargets,workflowSummary} from '../provisioner/workflow.js';
import {readJournal,writeJournal} from '../provisioner/journal.js';
const config={owner:'celula-teste',repository:'kairos-teste',cellName:'Célula de Testes',visibility:'private',supabaseOrgId:'org_teste',supabaseRef:'',supabaseRegion:'sa-east-1',vercelTeamId:'team_teste',vercelProjectId:'',coreDir:'/tmp/kairos-cliente',adminLogin:'admin123',adminName:'Administrador',pwaUrl:''};
test('inicio com destinos escolhidos e sem segredos',()=>{
 const state=newWorkflow(config);
 assert.equal(nextPhase(state),'github');
 assert.equal(workflowSummary(state).progress,0);
 assert.equal(workflowSummary(state).homologated,false);
 assert.throws(()=>newWorkflow({...config,token:'secreto'}),e=>e.code==='UNKNOWN_FIELD');
 assert.throws(()=>newWorkflow({...config,owner:'PullmaWollf'}),e=>e.code==='MAINTAINER_ACCOUNT');
});
test('etapas seguem ordem e dependem de IDs criados',()=>{
 let s=newWorkflow(config);
 assert.throws(()=>completePhase(s,'migrate'),e=>e.code==='BAD_ORDER');
 s=completePhase(s,'github');
 s=completePhase(s,'supabase');
 assert.throws(()=>completePhase(s,'migrate'),e=>e.code==='MISSING_TARGET');
 s=updateTargets(s,{supabaseRef:'abcdefghij123456'});
 s=completePhase(s,'migrate');
 s=completePhase(s,'vercel');
 assert.throws(()=>completePhase(s,'env'),e=>e.code==='MISSING_TARGET');
 s=updateTargets(s,{vercelProjectId:'prj_123456'});
 s=completePhase(s,'env');
 s=completePhase(s,'bootstrap');
 s=completePhase(s,'deploy');
 s=updateTargets(s,{pwaUrl:'https://teste.vercel.app'});
 s=completePhase(s,'smoke');
 assert.equal(workflowSummary(s).progress,100);
 assert.equal(workflowSummary(s).homologated,false);
 assert.equal(workflowSummary(s).next,null);
 assert.equal(s.steps.smoke.state,'attested');
});
test('destinos não podem ser alterados depois de definidos',()=>{
 const s=updateTargets(newWorkflow(config),{supabaseRef:'abcdefghij123456'});
 assert.throws(()=>updateTargets(s,{supabaseRef:'xxxxxxxxxxxxxx'}),e=>e.code==='IMMUTABLE_CONFIG');
 assert.throws(()=>updateTargets(s,{SESSION_SECRET:'abc'}),e=>e.code==='IMMUTABLE_CONFIG');
 assert.throws(()=>completePhase(s,'github',{verified:true}),e=>e.code==='NOT_VERIFIED');
});
test('registro local pode ser retomado sem perder etapas e sem sobrescrever',async()=>{
 const folder=await mkdtemp(join(tmpdir(),'kairos-test-'));
 try{
  const file=join(folder,'state.json');
  let s=newWorkflow(config);
  await writeJournal(file,s,{initial:true});
  s=completePhase(await readJournal(file),'github');
  await writeJournal(file,s);
  const restored=await readJournal(file);
  assert.equal(restored.steps.github.state,'attested');
  assert.equal(nextPhase(restored),'supabase');
  assert.equal(JSON.parse(await readFile(file,'utf8')).steps.github.evidence,'manual');
  await assert.rejects(writeJournal(file,newWorkflow(config),{initial:true}),e=>e.code==='STATE_EXISTS');
 }finally{await rm(folder,{recursive:true,force:true});}
});
test('registros adulterados ou conclusão fora de ordem são recusados',()=>{
 const s=newWorkflow(config);
 s.steps.smoke={state:'attested',at:new Date().toISOString(),evidence:'manual'};
 assert.throws(()=>validateWorkflow(s),e=>e.code==='BAD_ORDER');
 const t=newWorkflow(config);t.steps.github={state:'verified',at:new Date().toISOString(),evidence:'smoke-checks'};
 assert.throws(()=>validateWorkflow(t),e=>e.code==='BAD_STATE');
});
