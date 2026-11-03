import test from 'node:test';
import assert from 'node:assert/strict';
import {executeCloudStep,reconcileCloudStep,statusForClient} from '../control/engine.js';
const row={id:'12345678-1234-1234-1234-123456789012',phase_index:0,owner:'cliente',repository:'kairos-cliente',
 supabase_org_id:'org_cliente',vercel_team_id:'team_cliente'};
const env={KAIROS_CONTROL_ENABLE_WRITES:'1'};
const consent={execute:true,acceptBilling:true,expectedPhase:'github',owner:'cliente',supabaseOrgId:'org_cliente',vercelTeamId:'team_cliente'};
test('cloud executor never invokes worker or providers without explicit billing and destination approval',async()=>{
 let called=0;
 const worker={async precheck(){called++},async run(){called++}};
 await assert.rejects(executeCloudStep({db:{},userId:1,row,worker,env:{},consent}),e=>e.code==='WRITES_DISABLED');
 await assert.rejects(executeCloudStep({db:{},userId:1,row,worker,env,consent:{...consent,owner:'wrong'}}),e=>e.code==='CONSENT_REQUIRED');
 assert.equal(called,0);
});
test('one atomic claim and finalize per phase, no secret in client status',async()=>{
 let claims=0,finishes=0;
 const db={
  async claim(_id,_user,phase){claims++;assert.equal(phase,'github');return {claimed:true,attempt_id:'attempt-1'};},
  async finish(_id,_user,phase,_attempt,receipt){finishes++;assert.deepEqual(receipt,{repository:'cliente/kairos-cliente'});return true;}
 };
 const worker={async precheck(){},async run(){return {receipt:{repository:'cliente/kairos-cliente'}};}};
 const result=await executeCloudStep({db,row,userId:1,consent,worker,env});
 assert.equal(result.status,'recorded');assert.equal(claims,1);assert.equal(finishes,1);
 assert.equal(result.homologated,false);
 assert.equal(JSON.stringify(statusForClient(row,[])).includes('serviceKey'),false);
});
test('a claimed remote error cannot trigger a second creation',async()=>{
 let operations=0,reviews=0;
 const db={
  async claim(){return {claimed:true,attempt_id:'attempt-1'};},
  async review(_id,_user,phase,_attempt,code){reviews++;assert.equal(code,'REMOTE_UNCERTAIN');return true;}
 };
 const worker={async precheck(){},async run(){operations++;throw new Error('private token leaked in lower-level error');}};
 const result=await executeCloudStep({db,row,userId:1,consent,worker,env});
 assert.equal(result.status,'needs_review');assert.equal(result.automaticRetry,false);
 assert.equal(result.reason,'REMOTE_UNCERTAIN');assert.equal(operations,1);assert.equal(reviews,1);
});
test('duplicate claim blocks creation, even when operator approves again',async()=>{
 const db={async claim(){return {claimed:false,reason:'review_existing_attempt'};}};
 const worker={async precheck(){},async run(){throw Error('must not POST')}};
 const out=await executeCloudStep({db,row,userId:1,consent,worker,env});
 assert.equal(out.status,'needs_review');assert.equal(out.automaticRetry,false);
});
test('GET-based deploy reconciliation can advance without remote POST',async()=>{
 const deploy={...row,phase_index:6,vercel_project_id:'prj_cliente123'};
 let post=0,finished=0;
 const db={async operations(){return [{id:'attempt',phase:'deploy',status:'started',started_at:'2026-11-03T10:00:00Z'}];},
  async finish(){finished++;return true;}};
 const worker={async reconcile(){return {status:'verified',receipt:{url:'https://cell.vercel.app'}};},
  async run(){post++}};
 const result=await reconcileCloudStep({db,userId:1,row:deploy,worker});
 assert.equal(result.status,'recovered');assert.equal(finished,1);assert.equal(post,0);
});
