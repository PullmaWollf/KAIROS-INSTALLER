import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encryptControl} from '../control/crypto.js';
import {createHostedHandler} from '../api/index.js';

const env={
 KAIROS_INSTALLER_PUBLIC_ORIGIN:'https://installer.example.com',
 KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url')
};
const session='z'.repeat(43), userId=42;
const organizationId='org_customer12345',slug='customer-test-org';
const teamId='personal_uid_customer12345';
const tokens={supabase:'test-supabase-key-123456789',vercel:'test-vercel-key-123456789'};
const envelopes={
 supabase:encryptControl({accessToken:tokens.supabase},'oauth:supabase:42',{env}),
 vercel:encryptControl({kind:'vercel-management-v1',teamId,teamSlug:'customer',
  accessToken:tokens.vercel},'oauth:vercel:42',{env})
};
function mock(){
 const methods=[];
 const fetcher=async(url,opts)=>{
  methods.push(opts.method);
  if(url.endsWith('/v1/organizations'))return {status:200,json:async()=>(
   [{id:organizationId,slug,name:'Customer'}])};
  if(url.endsWith('/v1/organizations/'+slug))return {status:200,json:async()=>(
   {id:organizationId,plan:'free'})};
  if(url.endsWith('/v1/projects'))return {status:200,json:async()=>([])};
  if(url.endsWith('/v2/user'))return {status:200,json:async()=>(
   {user:{id:'uid_customer12345',billing:{plan:'hobby'}}})};
  throw Error('unexpected request');
 };
 const db={
  async session(){return {id:userId,login:'customer'};},
  async connection(id,provider){assert.equal(id,userId);return envelopes[provider]||null;}
 };
 return {db,fetcher,methods};
}
function response(){return {statusCode:200,setHeader(){},end(body){this.body=body;}};}
test('logged-in user can audit free eligibility without mutating provider resources',async()=>{
 const {db,fetcher,methods}=mock();
 const handler=createHostedHandler({env,fetcher,storeFactory:()=>db});
 const res=response();
 await handler({url:'/api/zero-cost-audit?supabaseOrgId='+organizationId,method:'GET',
  headers:{host:'installer.example.com',cookie:'kairos_control_session='+session}},res);
 assert.equal(res.statusCode,200);
 const payload=JSON.parse(res.body);
 assert.equal(payload.eligible,true);
 assert.equal(payload.guaranteedZeroCost,false);
 assert.equal(payload.remoteWrites,0);
 assert.ok(methods.every(m=>m==='GET'));
 for(const token of Object.values(tokens))assert.equal(res.body.includes(token),false);
});
test('anonymous client cannot use provider billing audit',async()=>{
 let network=0;
 const handler=createHostedHandler({env,fetcher:async()=>{network++;},
  storeFactory:()=>({async session(){return null;}})});
 const res=response();
 await handler({url:'/api/zero-cost-audit?supabaseOrgId='+organizationId,method:'GET',
  headers:{host:'installer.example.com'}},res);
 assert.equal(res.statusCode,401);
 assert.equal(network,0);
});
