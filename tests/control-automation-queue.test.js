import test from 'node:test';
import assert from 'node:assert/strict';
import {automationReady,assertAutomationCaller,authorizeAutomation,tickAutomation} from '../control/automation.js';

const row={id:'12345678-1234-1234-1234-123456789012',github_id:42,
 owner:'customer',repository:'kairos-hml-celula001',cell_name:'HML Célula 001',
 supabase_org_id:'org_test1234',vercel_team_id:'personal_uid_test1234',
 phase_index:0,supabase_ref:null,vercel_project_id:null};
const env={KAIROS_AUTOMATION_ENABLED:'1',KAIROS_HOMOLOGATION_MODE:'1',
 KAIROS_CONTROL_ENABLE_WRITES:'1',KAIROS_VERCEL_MANAGEMENT_ENABLED:'1',
 KAIROS_ENABLE_BETA_SQL:'1',KAIROS_ENABLE_GIT_DEPLOY:'1',
 CRON_SECRET:'server-generated-secret-with-32-plus-chars',
 KAIROS_HML_GITHUB_ID:'42',KAIROS_HML_GITHUB_LOGIN:'customer',
 KAIROS_HML_REPOSITORY:row.repository,KAIROS_HML_SUPABASE_ORG_ID:row.supabase_org_id,
 KAIROS_HML_VERCEL_SCOPE:row.vercel_team_id,KAIROS_HML_INSTALLATION_ID:row.id,
 KAIROS_HML_EXPIRES_AT:new Date(Date.now()+3600000).toISOString()};
const approval={execute:true,acceptBilling:true,expectedPhase:'github',owner:row.owner,
 repository:row.repository,supabaseOrgId:row.supabase_org_id,vercelTeamId:row.vercel_team_id};
const uuid='aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee';

test('disabled worker never obtains a lease or creates projects',async()=>{
 assert.equal(automationReady({...env,KAIROS_AUTOMATION_ENABLED:'0'}),false);
 assert.equal(automationReady({...env,KAIROS_CONTROL_ENABLE_WRITES:'0'}),false);
 let calls=0;
 const db={async claimAutomation(){calls++;}};
 await assert.rejects(tickAutomation({db,env:{...env,KAIROS_AUTOMATION_ENABLED:'0'}}),
  {code:'AUTOMATION_DISABLED'});
 assert.equal(calls,0);
});
test('scheduler endpoint must have a strong exact bearer token',()=>{
 assert.equal(assertAutomationCaller('Bearer '+env.CRON_SECRET,env),true);
 for(const value of ['Bearer wrong','Basic '+env.CRON_SECRET,'Bearer '+env.CRON_SECRET+'x',null])
  assert.throws(()=>assertAutomationCaller(value,env),{code:'WORKER_UNAUTHORIZED'});
 assert.throws(()=>assertAutomationCaller('Bearer '+env.CRON_SECRET,{
  ...env,CRON_SECRET:'short'}),{code:'WORKER_UNAUTHORIZED'});
});
test('one customer authorization persists only the exact disposable target',async()=>{
 let count=0;
 const db={async enqueueAutomation(args){
  count++;assert.equal(args.userId,42);assert.equal(args.installationId,row.id);
  assert.equal(args.row.owner,'customer');
  assert.equal(args.expiresAt,env.KAIROS_HML_EXPIRES_AT);
  return {accepted:true,state:'queued'};
 }};
 assert.equal((await authorizeAutomation({db,userId:42,row,approval,env})).state,'queued');
 assert.equal(count,1);
 await assert.rejects(authorizeAutomation({db,userId:42,
  row:{...row,repository:'AGAPE'},approval:{...approval,repository:'AGAPE'},env}),
  {code:'HOMOLOGATION_SCOPE_DENIED'});
 await assert.rejects(authorizeAutomation({db,userId:42,row,
  approval:{...approval,acceptBilling:false},env}),{code:'CONSENT_REQUIRED'});
 assert.equal(count,1);
});
test('server creates GitHub repo, Supabase project and Vercel project in sequence',async()=>{
 const state={...row};const executed=[];const operations=[];
 const job={installationId:row.id,claimId:uuid,userId:42,owner:row.owner,
  repository:row.repository,supabaseOrgId:row.supabase_org_id,
  vercelTeamId:row.vercel_team_id,expiresAt:env.KAIROS_HML_EXPIRES_AT,acceptBilling:true};
 const db={
  async claimAutomation(){return job;},
  async installation(id,installationId){assert.equal(id,42);assert.equal(installationId,row.id);return {...state};},
  async operations(){return [...operations];},
  async claim(id,who,phase){
   assert.equal(id,row.id);assert.equal(who,42);return {claimed:true,attempt_id:uuid};},
  async finish(_id,_who,phase,_attempt,receipt){
   operations.push({phase,status:'confirmed'});
   if(phase==='supabase')state.supabase_ref=receipt.projectRef;
   if(phase==='vercel')state.vercel_project_id=receipt.projectId;
   state.phase_index++;return true;
  },
  async settleAutomation(info){assert.equal(info.claimId,uuid);return true;}
 };
 const worker={
  async precheck(current,id,phase){
   assert.equal(id,42);assert.equal(current.owner,'customer');
   if(phase==='migrate')assert.equal(current.supabase_ref,'abcdefghijklmnopqrst');},
  async run(current,id,phase){
   executed.push(phase);
   if(phase==='github')return {receipt:{repository:'customer/kairos-hml-celula001'}};
   if(phase==='supabase')return {receipt:{projectRef:'abcdefghijklmnopqrst'}};
   if(phase==='migrate')return {receipt:{}};
   if(phase==='vercel')return {receipt:{projectId:'prj_customer12345'}};
   throw Error('Unexpected phase '+phase);
  }
 };
 for(let i=0;i<4;i++){
  const out=await tickAutomation({db,env,worker});
  assert.equal(out.status,'queued');
 }
 assert.deepEqual(executed,['github','supabase','migrate','vercel']);
 assert.equal(state.phase_index,4);
 assert.equal(state.supabase_ref,'abcdefghijklmnopqrst');
 assert.equal(state.vercel_project_id,'prj_customer12345');
});
test('a crashed worker will NEVER repeat uncertain GitHub, database or Vercel creates',async()=>{
 for(const phaseIndex of [0,1,3]){
  const phase=['github','supabase','migrate','vercel'][phaseIndex];
  let calls=0;
  const db={
   async claimAutomation(){return job;},
   async installation(){return {...row,phase_index:phaseIndex,
    supabase_ref:'abcdefghijklmnopqrst'};},
   async operations(){return [{phase,status:'started',id:uuid}]},
   async settleAutomation(info){assert.equal(info.state,'paused');return true;}
  };
  const job={installationId:row.id,claimId:uuid,userId:42,owner:row.owner,
   repository:row.repository,supabaseOrgId:row.supabase_org_id,
   vercelTeamId:row.vercel_team_id,expiresAt:env.KAIROS_HML_EXPIRES_AT,acceptBilling:true};
  const worker={async precheck(){calls++;},async run(){calls++;}};
  const out=await tickAutomation({db,env,worker});
  assert.equal(out.status,'paused');assert.equal(out.reason,'MANUAL_REVIEW_REQUIRED');
  assert.equal(calls,0);
 }
});
