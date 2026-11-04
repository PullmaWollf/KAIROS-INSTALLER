import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createHostedHandler} from '../api/index.js';
import {csrfFor} from '../control/http.js';

const token='test-user-credential-123456789';
const teamId='team_customer_123456';
const env={
 KAIROS_INSTALLER_PUBLIC_ORIGIN:'https://installer.example.com',
 KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
 KAIROS_VERCEL_TEAM_ID:'team_installer_123456'
};
const sessionToken='s'.repeat(43);
function response(){
 const headers={};
 return {statusCode:200,headers,setHeader(key,value){headers[key.toLowerCase()]=value;},
  end(body=''){this.body=body;}};
}
function request(url,{method='GET',origin=env.KAIROS_INSTALLER_PUBLIC_ORIGIN,
 csrf=csrfFor(sessionToken,{env}),body,cookie=sessionToken}={}){
 return {url,method,body,headers:{
  host:'installer.example.com',...(origin?{origin}:{}),
  ...(cookie?{cookie:'kairos_control_session='+cookie}:{}),
  ...(csrf?{'x-kairos-csrf':csrf}:{})
 }};
}
const mockProvider=async(url,options)=>{
 assert.equal(options.method,'GET');
 assert.equal(options.headers.Authorization,'Bearer '+token);
 if(url.endsWith('/v2/user'))return {status:200,json:async()=>({user:{username:'customer'}})};
 if(url.includes('/v2/teams?'))return {status:200,json:async()=>({teams:[{id:teamId,slug:'customer-team'}]})};
 if(url.includes('/v9/projects?'))return {status:200,json:async()=>({projects:[]})};
 throw Error('Unexpected provider call');
};
test('authenticated Vercel connection is stored encrypted and absent from session output',async()=>{
 const memory=new Map();
 let saves=0;
 const db={
  async session(){return {id:42,login:'customer'};},
  async saveConnection(id,provider,envelope){assert.equal(id,42);assert.equal(provider,'vercel');saves++;memory.set(id,envelope);},
  async connection(id,provider){return provider==='vercel'?memory.get(id)||null:null;},
  async connections(){return ['github','vercel'];}
 };
 const handler=createHostedHandler({env,fetcher:mockProvider,storeFactory:()=>db});
 const connect=response();
 await handler(request('/api/connections/vercel',{method:'POST',body:{teamId,accessToken:token}}),connect);
 assert.equal(connect.statusCode,200);assert.equal(saves,1);
 assert.equal(JSON.stringify(connect.body).includes(token),false);
 assert.equal(memory.get(42).includes(token),false);
 const session=response();await handler(request('/api/session'),session);
 const data=JSON.parse(session.body);
 assert.equal(data.signedIn,true);
 assert.deepEqual(data.providers,['github','vercel']);
 assert.equal(data.vercelTeam.teamId,teamId);
 assert.equal(JSON.stringify(data).includes(token),false);
});
test('cross-origin Vercel connection is rejected before any secret is persisted',async()=>{
 let writes=0;
 const db={async session(){return {id:42,login:'customer'};},
  async saveConnection(){writes++;}};
 const handler=createHostedHandler({env,fetcher:mockProvider,storeFactory:()=>db});
 const blocked=response();
 await handler(request('/api/connections/vercel',{method:'POST',origin:'https://attacker.example',
  body:{teamId,accessToken:token}}),blocked);
 assert.equal(blocked.statusCode,400);
 assert.equal(JSON.parse(blocked.body).error,'BAD_ORIGIN');
 assert.equal(writes,0);
});
test('new installation refuses a Vercel team different from the connected team',async()=>{
 const db={async session(){return {id:42,login:'customer'};},
  async connection(_id,provider){
   if(provider==='vercel')return null;
   return null;
  },
  async createInstallation(){throw Error('must not create installation');}};
 const handler=createHostedHandler({env,storeFactory:()=>db});
 const blocked=response();
 await handler(request('/api/installations',{method:'POST',body:{
  owner:'customer',repository:'kairos-demo',cellName:'Célula Esperança',
  supabaseOrgId:'org_customer',vercelTeamId:teamId,region:'sa-east-1',adminLogin:'admin'
 }}),blocked);
 assert.equal(blocked.statusCode,400);
 assert.equal(JSON.parse(blocked.body).error,'VERCEL_TEAM_FORBIDDEN');
});
test('a logged-out caller cannot connect Vercel',async()=>{
 const db={async session(){return null;},async saveConnection(){throw Error('must not write');}};
 const handler=createHostedHandler({env,storeFactory:()=>db});
 const blocked=response();
 await handler(request('/api/connections/vercel',{method:'POST',cookie:'',
  body:{teamId,accessToken:token}}),blocked);
 assert.equal(blocked.statusCode,401);
});
