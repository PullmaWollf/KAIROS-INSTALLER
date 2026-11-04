import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encryptControl} from '../control/crypto.js';
import {checkVercelGithubLink} from '../control/vercel-github-link.js';
import {createHostedHandler} from '../api/index.js';

const env={
 KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
 KAIROS_INSTALLER_PUBLIC_ORIGIN:'https://installer.example.com',
 KAIROS_VERCEL_TEAM_ID:'team_maintainer123456'
};
const user={id:42,login:'okarakimoto'};
const token='vercel-customer-credential-1234567890';
const teamId='personal_uidcustomer1234567';
const encrypted=encryptControl({kind:'vercel-management-v1',teamId,
 teamSlug:'okarakimoto',accessToken:token},'oauth:vercel:42',{env});
function store(connected=true){
 return {
  async connection(id,provider){assert.equal(id,42);return connected&&provider==='vercel'?encrypted:null;},
  async session(){return user;}
 };
}
function provider(namespaces, status=200){
 const calls=[];
 return {calls,fetcher:async(url,options)=>{
  calls.push({url,options});
  assert.equal(options.method,'GET');
  assert.equal(options.body,undefined);
  assert.match(url,/^https:\/\/api\.vercel\.com\/v1\/integrations\/git-namespaces\?/);
  return {status,json:async()=>namespaces};
 }};
}
test('customer GitHub linked to Vercel is verified without any write',async()=>{
 const p=provider([{provider:'github',slug:'okarakimoto',isAccessRestricted:false,
  viewer:{canCreateApp:true},installationId:178646219}]);
 const result=await checkVercelGithubLink({db:store(),user,env,fetcher:p.fetcher});
 assert.equal(result.connected,true);
 assert.equal(result.canImportNewRepositories,true);
 assert.equal(result.reason,'VERCEL_GITHUB_CONNECTED');
 assert.equal(result.remoteWrites,0);
 assert.equal(result.createsResources,false);
 assert.equal(p.calls.length,1);
 assert.equal(JSON.stringify(result).includes(token),false);
 assert.equal(JSON.stringify(result).includes('178646219'),false);
});
test('missing integration, wrong account and restricted apps fail closed',async()=>{
 const variants=[
  {items:[],reason:'GITHUB_NOT_CONNECTED_TO_VERCEL'},
  {items:[{provider:'github',slug:'someoneelse',isAccessRestricted:false}],reason:'GITHUB_NOT_CONNECTED_TO_VERCEL'},
  {items:[{provider:'github',slug:'okarakimoto',isAccessRestricted:true}],reason:'VERCEL_GITHUB_REPOSITORIES_RESTRICTED'},
  {items:[{provider:'github',slug:'okarakimoto'}],reason:'VERCEL_GITHUB_ACCESS_UNKNOWN'},
  {items:[{provider:'github',slug:'okarakimoto',isAccessRestricted:false,viewer:{canCreateApp:false}}],reason:'VERCEL_GITHUB_PERMISSION_UNCONFIRMED'},
  {items:[{provider:'github',slug:'okarakimoto',isAccessRestricted:false,requireReauth:true}],reason:'VERCEL_GITHUB_REAUTH_REQUIRED'}
 ];
 for(const {items,reason} of variants){
  const p=provider(items);
  const result=await checkVercelGithubLink({db:store(),user,env,fetcher:p.fetcher});
  assert.equal(result.canImportNewRepositories,false);
  assert.equal(result.reason,reason);
 }
});
test('unconnected account and provider outage are safe and read only',async()=>{
 const disconnected=await checkVercelGithubLink({db:store(false),user,env,
  fetcher:async()=>{throw Error('must not call provider');}});
 assert.equal(disconnected.reason,'VERCEL_NOT_CONNECTED');
 assert.equal(disconnected.connected,false);
 const outage=await checkVercelGithubLink({db:store(),user,env,
  fetcher:async()=>({status:403})});
 assert.equal(outage.reason,'VERCEL_GITHUB_CHECK_UNAVAILABLE');
 assert.equal(outage.canImportNewRepositories,false);
});
test('route requires login and never exposes a credential',async()=>{
 const p=provider([{provider:'github',slug:'okarakimoto',isAccessRestricted:false}]);
 const handler=createHostedHandler({env,fetcher:p.fetcher,storeFactory:()=>store()});
 const res={statusCode:200,setHeader(){},end(body){this.body=body;}};
 await handler({method:'GET',url:'/api/vercel/github-link',headers:{
  host:'installer.example.com',cookie:'kairos_control_session='+'z'.repeat(43)
 }},res);
 assert.equal(res.statusCode,200);
 const data=JSON.parse(res.body);
 assert.equal(data.connected,true);
 assert.equal(data.canImportNewRepositories,true);
 assert.equal(res.body.includes(token),false);
 const anonymous=createHostedHandler({env,storeFactory:()=>({
  async session(){return null;}
 })});
 const denial={statusCode:200,setHeader(){},end(body){this.body=body;}};
 await anonymous({method:'GET',url:'/api/vercel/github-link',
  headers:{host:'installer.example.com'}},denial);
 assert.equal(denial.statusCode,401);
});
