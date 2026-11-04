import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createHostedHandler} from '../api/index.js';
import {csrfFor} from '../control/http.js';

const id='12345678-1234-1234-1234-123456789012';
const row={id,github_id:42,phase_index:0,owner:'customer',
 repository:'kairos-hml-celula001',cell_name:'HML Célula 001',
 supabase_org_id:'org_test1234',vercel_team_id:'personal_uid_test1234'};
const session='x'.repeat(43);
const env={KAIROS_INSTALLER_PUBLIC_ORIGIN:'https://installer.example.com',
 KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
 KAIROS_AUTOMATION_ENABLED:'1',KAIROS_HOMOLOGATION_MODE:'1',
 KAIROS_CONTROL_ENABLE_WRITES:'1',KAIROS_VERCEL_MANAGEMENT_ENABLED:'1',
 KAIROS_ENABLE_BETA_SQL:'1',KAIROS_ENABLE_GIT_DEPLOY:'1',
 CRON_SECRET:'strong-long-secret-for-private-cron-12345',
 KAIROS_HML_GITHUB_ID:'42',KAIROS_HML_GITHUB_LOGIN:'customer',
 KAIROS_HML_REPOSITORY:row.repository,KAIROS_HML_SUPABASE_ORG_ID:row.supabase_org_id,
 KAIROS_HML_VERCEL_SCOPE:row.vercel_team_id,KAIROS_HML_INSTALLATION_ID:id,
 KAIROS_HML_EXPIRES_AT:new Date(Date.now()+3600000).toISOString()};
const approval={execute:true,acceptBilling:true,expectedPhase:'github',owner:row.owner,
 repository:row.repository,supabaseOrgId:row.supabase_org_id,vercelTeamId:row.vercel_team_id};
function req(path,{method='GET',body,cookie=session,origin=env.KAIROS_INSTALLER_PUBLIC_ORIGIN,csrf=true,authorization}={}){
 return {url:path,method,body,headers:{host:'installer.example.com',
  ...(origin?{origin}:{}),...(cookie?{cookie:'kairos_control_session='+cookie}:{}),
  ...(csrf?{'x-kairos-csrf':csrfFor(session,{env})}:{}),
  ...(authorization?{authorization}:{})}};
}
const res=()=>({statusCode:200,setHeader(){},end(body){this.body=body;}});
test('only owner can queue one automated installation with exact billing consent',async()=>{
 let queued=0;
 const db={async session(){return {id:42,login:'customer'};},
  async installation(_user,_id){return row;},
  async enqueueAutomation(args){
   queued++;assert.equal(args.userId,42);assert.equal(args.row.repository,row.repository);
   return {accepted:true,state:'queued'};},
  async automation(){return {state:'queued',expires_at:env.KAIROS_HML_EXPIRES_AT,
   last_error:null,next_run_at:new Date().toISOString(),updated_at:new Date().toISOString()};}};
 const handler=createHostedHandler({env,storeFactory:()=>db});
 const ok=res();
 await handler(req('/api/installations/'+id+'/automation/start',{method:'POST',body:approval}),ok);
 assert.equal(ok.statusCode,202);
 assert.equal(JSON.parse(ok.body).accepted,true);
 assert.equal(queued,1);
 const status=res();
 await handler(req('/api/installations/'+id+'/automation'),status);
 assert.equal(status.statusCode,200);
 assert.equal(JSON.parse(status.body).automation.state,'queued');
 assert.equal(status.body.includes(env.CRON_SECRET),false);
 const invalid=res();
 await handler(req('/api/installations/'+id+'/automation/start',{method:'POST',
  body:{...approval,repository:'kairos-hml-other'}}),invalid);
 assert.equal(invalid.statusCode,400);
 assert.equal(JSON.parse(invalid.body).error,'CONSENT_REQUIRED');
 assert.equal(queued,1);
});
test('queue requires authenticated session and CSRF and blocks disabled writes',async()=>{
 let attempted=0;
 const db={async session(){return {id:42,login:'customer'};},
  async installation(){return row;},
  async enqueueAutomation(){attempted++;}};
 const disabled=createHostedHandler({env:{...env,KAIROS_CONTROL_ENABLE_WRITES:'0'},
  storeFactory:()=>db});
 const denied=res();
 await disabled(req('/api/installations/'+id+'/automation/start',{method:'POST',body:approval}),denied);
 assert.equal(denied.statusCode,423);
 assert.equal(JSON.parse(denied.body).error,'AUTOMATION_DISABLED');
 const handler=createHostedHandler({env,storeFactory:()=>db});
 const csrf=res();
 await handler(req('/api/installations/'+id+'/automation/start',{method:'POST',
  body:approval,csrf:false}),csrf);
 assert.equal(csrf.statusCode,400);
 assert.equal(JSON.parse(csrf.body).error,'BAD_CSRF');
 const noLogin=createHostedHandler({env,storeFactory:()=>({async session(){return null;}})});
 const anon=res();
 await noLogin(req('/api/installations/'+id+'/automation/start',{method:'POST',
  body:approval,cookie:''}),anon);
 assert.equal(anon.statusCode,401);
 assert.equal(attempted,0);
});
test('scheduler endpoint rejects missing or wrong secret before processing jobs',async()=>{
 let calls=0;
 const db={async session(){return null;},async claimAutomation(){calls++;}};
 const handler=createHostedHandler({env,storeFactory:()=>db});
 for(const auth of [null,'Bearer not-the-same-secret']){
  const blocked=res();
  await handler(req('/api/automation/tick',{cookie:'',authorization:auth}),blocked);
  assert.equal(blocked.statusCode,401);
  assert.equal(JSON.parse(blocked.body).error,'WORKER_UNAUTHORIZED');
 }
 assert.equal(calls,0);
});
