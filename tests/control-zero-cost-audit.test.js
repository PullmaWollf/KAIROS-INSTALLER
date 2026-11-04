import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encryptControl} from '../control/crypto.js';
import {zeroCostAudit,assertZeroCostEligibility} from '../control/zero-cost-audit.js';
import {authorizeAutomation} from '../control/automation.js';

const tokenS='supabase-customer-test-token-123456';
const tokenV='vercel-customer-test-token-123456';
const env={KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
 KAIROS_VERCEL_TEAM_ID:'team_maintainer123456'};
const userId=42,organizationId='org_customer12345',slug='customer-test-org';
const vercelTeamId='personal_uid_customer12345';
const orgs=[{id:organizationId,slug,name:'Customer Testing'}];
function db(){
 const map={
  supabase:encryptControl({accessToken:tokenS},'oauth:supabase:'+userId,{env}),
  vercel:encryptControl({kind:'vercel-management-v1',teamId:vercelTeamId,
   teamSlug:'customer',accessToken:tokenV},'oauth:vercel:'+userId,{env})
 };
 return {async connection(id,provider){assert.equal(id,userId);return map[provider]||null;}};
}
function simulate({plan='free',projects=[{status:'ACTIVE_HEALTHY'}],
 vercelPlan='hobby',organizations=orgs,fail}={}){
 const calls=[];
 const fetcher=async(url,request)=>{
  calls.push({url,method:request.method,body:request.body});
  assert.equal(request.method,'GET');
  assert.equal(request.body,undefined);
  if(fail&&url.includes(fail))throw Error('network failed');
  const routes={
   'https://api.supabase.com/v1/organizations':organizations,
   ['https://api.supabase.com/v1/organizations/'+slug]:{id:organizationId,plan},
   'https://api.supabase.com/v1/projects':projects,
   'https://api.vercel.com/v2/user':{user:{
    id:'uid_customer12345',username:'customer',billing:vercelPlan?{plan:vercelPlan}:null
   }}
  };
  if(!(url in routes))throw Error('unexpected URL '+url);
  return {status:200,json:async()=>routes[url]};
 };
 return {fetcher,calls};
}
function args(fetcher,overrides={}){
 return {db:db(),userId,organizationId,vercelTeamId,env,fetcher,...overrides};
}
test('zero-cost audit validates two free providers with read-only HTTP requests',async()=>{
 const {fetcher,calls}=simulate();
 const report=await zeroCostAudit(args(fetcher));
 assert.equal(report.eligible,true);
 assert.equal(report.guaranteedZeroCost,false);
 assert.equal(report.createsResources,false);
 assert.equal(report.remoteWrites,0);
 assert.equal(report.supabase.activeProjectsObserved,1);
 assert.equal(report.vercel.reason,'FREE_PLAN');
 assert.equal(calls.length,4);
 const output=JSON.stringify(report);
 for(const secret of [tokenS,tokenV])assert.equal(output.includes(secret),false);
});
test('no free Supabase project slots strictly denies remote creation',async()=>{
 const {fetcher}=simulate({projects:[{status:'ACTIVE_HEALTHY'},{status:'COMING_UP'}]});
 const result=await zeroCostAudit(args(fetcher));
 assert.equal(result.eligible,false);
 assert.equal(result.supabase.reason,'FREE_QUOTA_FULL');
 await assert.rejects(assertZeroCostEligibility(args(fetcher)),{code:'ZERO_COST_NOT_VERIFIED'});
});
test('after creating second Free project, its own exact ref remains eligible for remaining phases',async()=>{
 const projectRef='abcdefghijklmnopqrst';
 const {fetcher}=simulate({projects:[
  {status:'ACTIVE_HEALTHY',ref:'priorproject123456',organization_id:organizationId},
  {status:'ACTIVE_HEALTHY',ref:projectRef,organization_id:organizationId}
 ]});
 const report=await zeroCostAudit(args(fetcher,{existingProjectRef:projectRef}));
 assert.equal(report.eligible,true);
 assert.equal(report.supabase.reason,'EXISTING_FREE_PROJECT');
 const someoneElse=await zeroCostAudit(args(fetcher,{existingProjectRef:'notourproject1234567'}));
 assert.equal(someoneElse.eligible,false);
});
test('paid Supabase or Vercel plans and unknown billing are denied',async()=>{
 for(const variant of [{plan:'pro'},{vercelPlan:'pro'},{vercelPlan:null}]){
  const {fetcher}=simulate(variant);
  const report=await zeroCostAudit(args(fetcher));
  assert.equal(report.eligible,false);
 }
});
test('unconnected hosting, unexpected org and failed provider read fail closed',async()=>{
 for(const changed of [
  {fetcher:simulate().fetcher,overrides:{vercelTeamId:'personal_uid_someoneelse'}},
  {fetcher:simulate({organizations:[]}).fetcher},
  {fetcher:simulate({fail:'/v1/projects'}).fetcher},
  {fetcher:simulate({fail:'/v2/user'}).fetcher}
 ]){
  const report=await zeroCostAudit(args(changed.fetcher,changed.overrides||{}));
  assert.equal(report.eligible,false);
  assert.equal(report.remoteWrites,0);
 }
});
test('zero-cost-only authorization never queues a project when Vercel plan cannot be proven free',async()=>{
 const install={id:'12345678-1234-1234-1234-123456789012',phase_index:0,
  github_id:userId,owner:'customer',repository:'kairos-hml-celula123',
  cell_name:'HML Célula 123',supabase_org_id:organizationId,vercel_team_id:vercelTeamId};
 const testEnv={...env,KAIROS_HOMOLOGATION_MODE:'1',KAIROS_PRODUCTION_MODE:'0',
  KAIROS_ZERO_COST_ONLY:'1',KAIROS_AUTOMATION_ENABLED:'1',KAIROS_CONTROL_ENABLE_WRITES:'1',
  KAIROS_VERCEL_MANAGEMENT_ENABLED:'1',KAIROS_ENABLE_BETA_SQL:'1',
  KAIROS_ENABLE_GIT_DEPLOY:'1',KAIROS_HML_GITHUB_ID:String(userId),
  KAIROS_HML_GITHUB_LOGIN:'customer',KAIROS_HML_REPOSITORY:install.repository,
  KAIROS_HML_INSTALLATION_ID:install.id,KAIROS_HML_SUPABASE_ORG_ID:organizationId,
  KAIROS_HML_VERCEL_SCOPE:vercelTeamId,
  KAIROS_HML_EXPIRES_AT:new Date(Date.now()+3600000).toISOString()};
 const database=db();
 let jobs=0;database.enqueueAutomation=async()=>{jobs++;};
 const approval={execute:true,acceptBilling:true,expectedPhase:'github',owner:'customer',
  repository:install.repository,supabaseOrgId:organizationId,vercelTeamId};
 const {fetcher}=simulate({vercelPlan:'pro'});
 await assert.rejects(authorizeAutomation({db:database,userId,row:install,
  approval,env:testEnv,fetcher}),{code:'ZERO_COST_NOT_VERIFIED'});
 assert.equal(jobs,0);
});
