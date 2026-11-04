import test from 'node:test';
import assert from 'node:assert/strict';
import {runAssistedInstallation} from '../cloud-assisted.js';

const phases=['github','supabase','migrate','vercel','env','bootstrap','deploy','smoke'];
const id='12345678-1234-1234-1234-123456789012';
const consent={execute:true,acceptBilling:true,owner:'client',
 supabaseOrgId:'org_client',vercelTeamId:'team_customer_123456'};
const installation=phase=>({id,phase,phaseIndex:phases.indexOf(phase),cellName:'Demo',
 owner:'client',supabaseOrgId:'org_client',vercelTeamId:'team_customer_123456'});
test('a single up-front approval carries all eight exact step scopes',async()=>{
 let index=0,writes=0;
 const request=async(path,opt)=>{
  if(!opt)return {installation:installation(phases[index]||null),operations:[]};
  assert.equal(opt.method,'POST');
  const body=JSON.parse(opt.body);
  assert.equal(body.expectedPhase,phases[index]);
  assert.equal(body.owner,consent.owner);
  writes++;index++;return {status:'recorded'};
 };
 const result=await runAssistedInstallation({request,installationId:id,consent});
 assert.equal(result.status,'steps-complete');
 assert.equal(writes,8);
});
test('an uncertain phase cannot be reissued automatically',async()=>{
 let writes=0;
 const request=async(path,opt)=>{
  if(!opt)return {installation:installation('github'),operations:[{
   phase:'github',status:'needs_review',errorCode:'NETWORK'}]};
  writes++;throw Error('unexpected remote mutation');
 };
 await assert.rejects(runAssistedInstallation({request,installationId:id,consent}),
  /precisa de revisão/);
 assert.equal(writes,0);
});
test('a deploy in progress uses reconciliation, never repeats a write',async()=>{
 let reconciliations=0,writes=0,done=false;
 const request=async(path,opt)=>{
  if(!opt)return {installation:installation(done?null:'deploy'),operations:done?[]:[{
   phase:'deploy',status:'started'}]};
  if(path.endsWith('/reconcile')){reconciliations++;done=true;return {status:'recovered'};}
  writes++;throw Error('unexpected remote POST');
 };
 const result=await runAssistedInstallation({request,installationId:id,consent});
 assert.equal(result.status,'steps-complete');
 assert.equal(reconciliations,1);assert.equal(writes,0);
});
test('unauthorized or wrong-destination runs fail without writes',async()=>{
 await assert.rejects(runAssistedInstallation({request:async()=>{},installationId:id,
  consent:{...consent,acceptBilling:false}}),/Autorização/);
 let writes=0;
 const request=async(path,opt)=>{
  if(opt)writes++;
  return {installation:{...installation('github'),owner:'another'},operations:[]};
 };
 await assert.rejects(runAssistedInstallation({request,installationId:id,consent}),
  /Destino/);
 assert.equal(writes,0);
});
