import test from 'node:test';
import assert from 'node:assert/strict';
import {productionReady,validateProductionScope,assertProductionAuthorization} from '../control/production-guard.js';
import {authorizeAutomation,automationReady,tickAutomation} from '../control/automation.js';
import {executeCloudStep} from '../control/engine.js';

const row={
 id:'12345678-1234-1234-1234-123456789012',
 github_id:42,owner:'customer',repository:'kairos-celula-esperanca',
 cell_name:'Célula Esperança',supabase_org_id:'org_customer1234',
 vercel_team_id:'personal_uid_customer1234',phase_index:0
};
const env={
 KAIROS_PRODUCTION_MODE:'1',KAIROS_HOMOLOGATION_MODE:'0',
 KAIROS_AUTOMATION_ENABLED:'1',KAIROS_CONTROL_ENABLE_WRITES:'1',
 KAIROS_VERCEL_MANAGEMENT_ENABLED:'1',KAIROS_ENABLE_BETA_SQL:'1',
 KAIROS_ENABLE_GIT_DEPLOY:'1',KAIROS_VERCEL_TEAM_ID:'team_installer1234'
};
const consent={
 execute:true,acceptBilling:true,expectedPhase:'github',owner:row.owner,
 repository:row.repository,supabaseOrgId:row.supabase_org_id,
 vercelTeamId:row.vercel_team_id
};
const job={
 installation_id:row.id,github_id:42,owner:row.owner,repository:row.repository,
 supabase_org_id:row.supabase_org_id,vercel_team_id:row.vercel_team_id,
 accept_billing:true,mode:'production',state:'queued',
 authorized_at:new Date(Date.now()-5000).toISOString(),
 expires_at:new Date(Date.now()+3600000).toISOString()
};

test('production needs exclusive mode and all independent safety switches',()=>{
 assert.equal(productionReady(env),true);
 assert.equal(automationReady(env),true);
 for(const off of ['KAIROS_CONTROL_ENABLE_WRITES','KAIROS_AUTOMATION_ENABLED',
  'KAIROS_VERCEL_MANAGEMENT_ENABLED','KAIROS_ENABLE_BETA_SQL','KAIROS_ENABLE_GIT_DEPLOY']){
  assert.equal(automationReady({...env,[off]:'0'}),false,off);
 }
 assert.equal(productionReady({...env,KAIROS_HOMOLOGATION_MODE:'1'}),false);
 assert.equal(automationReady({...env,KAIROS_HOMOLOGATION_MODE:'1'}),false);
 assert.equal(automationReady({...env,KAIROS_PRODUCTION_MODE:'0'}),false);
});

test('production refuses maintainer and cross-customer destinations, including HML names',()=>{
 assert.equal(validateProductionScope({env,userId:42,row,login:'Customer'}),true);
 for(const values of [
  {owner:'PullmaWollf'},{repository:'AGAPE'},
  {repository:'KAIROS-INSTALLER'},{repository:'kairos-hml-test123'},
  {repository:'other-project'},{cell_name:'HML Célula'},
  {github_id:99},{supabase_org_id:'?'},{vercel_team_id:env.KAIROS_VERCEL_TEAM_ID},
  {vercel_team_id:'personal_invalid'}
 ]){
  assert.throws(()=>validateProductionScope({env,userId:42,
   row:{...row,...values},login:'customer'}),{code:'PRODUCTION_SCOPE_DENIED'});
 }
 assert.throws(()=>validateProductionScope({env,userId:42,row,login:'attacker'}),
  {code:'PRODUCTION_SCOPE_DENIED'});
});

test('per-installation durable billing approval is mandatory before writes',async()=>{
 const db={async automation(id,installationId){
  assert.equal(id,42);assert.equal(installationId,row.id);return job;
 }};
 assert.equal(await assertProductionAuthorization({env,db,userId:42,row}),true);
 for(const variant of [
  {mode:'homologation'},{github_id:100},{owner:'other'},
  {repository:'kairos-other'},{supabase_org_id:'org_other1234'},
  {vercel_team_id:'team_other12345'},{accept_billing:false},
  {state:'paused'},{state:'completed'},
  {expires_at:'2020-01-01T00:00:00Z'}
 ]){
  await assert.rejects(assertProductionAuthorization({env,userId:42,row,
   db:{async automation(){return {...job,...variant};}}}),{code:'PRODUCTION_AUTH_REQUIRED'});
 }
});

test('production manual execute cannot skip per-job owner-bound approval',async()=>{
 let remoteCalls=0,claims=0;
 const db={async automation(){return null;},async claim(){claims++;}};
 const worker={async precheck(){remoteCalls++;},async run(){remoteCalls++;}};
 await assert.rejects(executeCloudStep({env,db,userId:42,row,worker,
  consent}),{code:'PRODUCTION_AUTH_REQUIRED'});
 assert.equal(remoteCalls,0);assert.equal(claims,0);
});

test('production enqueues exactly the customer plan and never HML destinations',async()=>{
 let created=0;
 const db={
  async enqueueAutomation(params){
   created++;assert.equal(params.mode,'production');
   assert.equal(params.userId,42);
   assert.equal(params.row.repository,row.repository);
   assert.ok(Date.parse(params.expiresAt)>Date.now());
   return {accepted:true,state:'queued'};
  }
 };
 const result=await authorizeAutomation({env,db,userId:42,login:'customer',row,
  approval:consent});
 assert.equal(result.accepted,true);assert.equal(created,1);
 await assert.rejects(authorizeAutomation({env,db,userId:42,login:'attacker',row,
  approval:consent}),{code:'PRODUCTION_SCOPE_DENIED'});
 await assert.rejects(authorizeAutomation({env,db,userId:42,login:'customer',
  row:{...row,repository:'kairos-hml-bad'},
  approval:{...consent,repository:'kairos-hml-bad'}}),
  {code:'PRODUCTION_SCOPE_DENIED'});
 assert.equal(created,1);
});

test('production executor performs a confirmed step only after checking durable authorization',async()=>{
 const attemptId='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';
 const lease={
  installationId:row.id,claimId:attemptId,userId:42,owner:row.owner,
  repository:row.repository,supabaseOrgId:row.supabase_org_id,
  vercelTeamId:row.vercel_team_id,expiresAt:job.expires_at,acceptBilling:true
 };
 const phases=[],calls=[];
 const db={
  async claimAutomation(){return lease;},
  async installation(){return row;},
  async automation(){return job;},
  async operations(){return [];},
  async claim(_id,_user,phase){calls.push('claim:'+phase);return {claimed:true,attempt_id:attemptId};},
  async finish(){calls.push('finish');return true;},
  async settleAutomation({state}){assert.equal(state,'queued');return true;}
 };
 const worker={
  async precheck(_row,_user,phase){phases.push(phase);},
  async run(_row,_user,phase){calls.push('POST:'+phase);return {receipt:{repository:'customer/kairos-celula-esperanca'}};}
 };
 const status=await tickAutomation({env,db,worker});
 assert.equal(status.status,'queued');
 assert.deepEqual(phases,['github','supabase','vercel','github']);
 assert.deepEqual(calls,['claim:github','POST:github','finish']);
});
test('production executor never performs writes when durable authorization is revoked',async()=>{
 let claims=0;
 const lease={installationId:row.id,claimId:'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee',
  userId:42,owner:row.owner,repository:row.repository,
  supabaseOrgId:row.supabase_org_id,vercelTeamId:row.vercel_team_id,
  expiresAt:job.expires_at,acceptBilling:true};
 const db={async claimAutomation(){return lease;},async installation(){return row;},
  async automation(){return {...job,state:'paused'};},
  async settleAutomation({state}){assert.equal(state,'paused');return true;}};
 const worker={async precheck(){claims++;},async run(){claims++;}};
 const result=await tickAutomation({db,env,worker});
 assert.equal(result.status,'paused');
 assert.equal(result.reason,'PRODUCTION_AUTH_REQUIRED');
 assert.equal(claims,0);
});
