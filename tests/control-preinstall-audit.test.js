import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encryptControl} from '../control/crypto.js';
import {preinstallationAudit} from '../control/preinstall-audit.js';
import {createHostedHandler} from '../api/index.js';

const env={
 KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
 KAIROS_INSTALLER_PUBLIC_ORIGIN:'https://installer.example.com',
 KAIROS_VERCEL_TEAM_ID:'team_installer123456',
 KAIROS_CONTROL_ENABLE_WRITES:'0',KAIROS_VERCEL_MANAGEMENT_ENABLED:'0',
 KAIROS_ENABLE_BETA_SQL:'0',KAIROS_ENABLE_GIT_DEPLOY:'0'
};
const user={id:42,login:'customer'};
const tokens={github:'github-oauth-token-test-123456',
 supabase:'supabase-oauth-token-test-123456',vercel:'vercel-management-token-test-123456'};
function store(){
 const encrypted={
  github:encryptControl({accessToken:tokens.github},'oauth:github:42',{env}),
  supabase:encryptControl({accessToken:tokens.supabase},'oauth:supabase:42',{env}),
  vercel:encryptControl({kind:'vercel-management-v1',
   teamId:'personal_uid_customer123456',teamSlug:'customer',accessToken:tokens.vercel},
   'oauth:vercel:42',{env})
 };
 return {async connection(id,provider){assert.equal(id,42);return encrypted[provider];},
  async session(){return user;},
  async health(){return true;}};
}
function provider(organizations=[{id:'org_customer',slug:'customer-org',name:'Test Customer'}],gitScopes='repo'){
 const calls=[];
 const fetcher=async(url,opts)=>{
  assert.equal(opts.method,'GET','Preflight MUST NOT mutate provider resources');
  assert.equal(opts.body,undefined);
  calls.push(url);
  if(url==='https://api.github.com/user')return {status:200,
   headers:{get:key=>key==='x-oauth-scopes'?gitScopes:null},
   json:async()=>({login:'customer'})};
  if(url==='https://api.github.com/repos/PullmaWollf/KAIROS-CORE')return {
   status:200,json:async()=>({full_name:'PullmaWollf/KAIROS-CORE',
    is_template:true,private:false,default_branch:'main'})};
  if(url==='https://api.supabase.com/v1/organizations')return {status:200,json:async()=>organizations};
  if(url==='https://api.vercel.com/v2/user')return {status:200,
   json:async()=>({user:{id:'uid_customer123456',username:'customer'}})};
  if(url==='https://api.vercel.com/v9/projects?limit=1')return {status:200,json:async()=>({projects:[]})};
  throw Error('Unexpected provider URL '+url);
 };
 return {fetcher,calls};
}
test('audit checks three real provider routes and public template without a single write',async()=>{
 const {fetcher,calls}=provider();
 const report=await preinstallationAudit({db:store(),user,env,fetcher});
 assert.equal(report.accessValidated,true);
 assert.equal(report.writePermissionsValidated,false);
 assert.equal(report.fullyHomologated,false);
 assert.equal(report.remoteWrites,0);
 assert.equal(report.allStepsEnabled,false);
 assert.equal(report.template.checked,true);
 assert.equal(report.providers[0].writePermission,'oauth-repo-scope-observed');
 assert.equal(report.providers[1].reason,'ORGANIZATION_ACCESS_VERIFIED');
 assert.equal(report.providers[2].hostingType,'personal');
 assert.equal(report.supabaseOrganizations[0].id,'org_customer');
 assert.equal(calls.length,5);
 const json=JSON.stringify(report);
 for(const token of Object.values(tokens))assert.equal(json.includes(token),false);
});
test('read access does not conceal missing GitHub creation scope',async()=>{
 const {fetcher}=provider(undefined,'read:user');
 const result=await preinstallationAudit({db:store(),user,env,fetcher});
 assert.equal(result.providers[0].readAccess,true);
 assert.equal(result.providers[0].writePermission,'repo-scope-missing');
 assert.equal(result.writePermissionsValidated,false);
});
test('Supabase without an eligible org is not reported ready for planning',async()=>{
 const {fetcher}=provider([]);
 const report=await preinstallationAudit({db:store(),user,env,fetcher});
 assert.equal(report.accessValidated,false);
 assert.equal(report.providers[1].reason,'NO_ELIGIBLE_ORGANIZATION');
 assert.deepEqual(report.supabaseOrganizations,[]);
});
test('hosted readiness requires login and returns sanitized, read-only output',async()=>{
 const {fetcher}=provider();
 const db=store();
 const handler=createHostedHandler({env,fetcher,storeFactory:()=>db});
 const reply={statusCode:200,setHeader(){},end(body){this.body=body;}};
 await handler({url:'/api/preinstallation-audit',method:'GET',
  headers:{host:'installer.example.com',cookie:'kairos_control_session='+'z'.repeat(43)}},reply);
 assert.equal(reply.statusCode,200);
 assert.equal(JSON.parse(reply.body).accessValidated,true);
 assert.equal(reply.body.includes(tokens.vercel),false);
 const anon=createHostedHandler({env,storeFactory:()=>({async session(){return null;}})});
 const blocked={statusCode:200,setHeader(){},end(body){this.body=body;}};
 await anon({url:'/api/preinstallation-audit',method:'GET',
  headers:{host:'installer.example.com'}},blocked);
 assert.equal(blocked.statusCode,401);
});
