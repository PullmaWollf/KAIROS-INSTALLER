import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createHostedHandler} from '../api/index.js';
import {csrfFor} from '../control/http.js';
const env={KAIROS_INSTALLER_PUBLIC_ORIGIN:'https://installer.example.com',
 KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
 KAIROS_GITHUB_CLIENT_ID:'Iv1_local-integration-client',
 KAIROS_GITHUB_CLIENT_SECRET:'test-oauth-secret-do-not-use-live'};
function createResponse(){
 const headers={};
 return {headers,statusCode:200,setHeader(key,value){headers[key.toLowerCase()]=value;},
 end(body=''){this.body=body;},getHeader(k){return headers[k.toLowerCase()]}};
}
const request=(url,{method='GET',cookie='',origin,csrf,body}={})=>({
 url,method,body,headers:{host:'installer.example.com',...(cookie?{cookie}:{}),...(origin?{origin}:{}),...(csrf?{'x-kairos-csrf':csrf}:{})}
});
test('backend health is private-control only and fail-closed on no configuration',async()=>{
 const handler=createHostedHandler({env,storeFactory:()=>({async health(){return true}})});
 const res=createResponse();await handler(request('/api/health'),res);
 assert.equal(res.statusCode,200);assert.deepEqual(JSON.parse(res.body),{ok:true,ready:true});
});
test('GitHub hosted PKCE authorization binds callback state and sets HttpOnly session',async()=>{
 let savedToken;
 const db={
  async session(){return null;},
  async claimOAuth(hash){assert.match(hash,/^[a-f0-9]{64}$/);return true;},
  async upsertUser(v){assert.equal(v.login,'cliente');return v;},
  async createSession(v){assert.equal(v.id,12345);return '2026-12-01';},
  async saveConnection(_id,provider,envelope){assert.equal(provider,'github');savedToken=envelope;}
 };
 const fetcher=async(url)=>{
  if(url==='https://github.com/login/oauth/access_token')return {status:200,async json(){return {access_token:'test-github-access-token-123456'};}};
  if(url==='https://api.github.com/user')return {status:200,async json(){return {id:12345,login:'cliente'};}};
  throw Error('unexpected provider '+url);
 };
 const handler=createHostedHandler({env,storeFactory:()=>db,fetcher});
 const start=createResponse();await handler(request('/api/auth/start?provider=github'),start);
 assert.equal(start.statusCode,302);
 const authUrl=new URL(start.getHeader('Location'));
 assert.equal(authUrl.hostname,'github.com');
 const cookie=start.getHeader('Set-Cookie').split(';')[0];
 assert.match(cookie,/kairos_control_oauth=/);
 assert.equal(cookie.includes('test-github-access-token'),false);
 const callback=createResponse();await handler(request('/api/auth/callback?code=abc&state='+authUrl.searchParams.get('state'),{cookie}),callback);
 assert.equal(callback.statusCode,303);
 assert.ok(savedToken);assert.equal(savedToken.includes('test-github-access-token'),false);
 assert.match(JSON.stringify(callback.getHeader('Set-Cookie')),/HttpOnly/);
});
test('unauthenticated account creation and cross-origin mutation are blocked',async()=>{
 const db={async session(){return null;}};
 const handler=createHostedHandler({env,storeFactory:()=>db});
 const unauth=createResponse();await handler(request('/api/installations',{method:'POST',body:{}}),unauth);
 assert.equal(unauth.statusCode,401);
 const fakeSession='s'.repeat(43);
 const handler2=createHostedHandler({env,storeFactory:()=>({
  async session(){return {id:12345,login:'cliente'};},
  async createInstallation(){throw Error('must not insert');}
 })});
 const bad=createResponse();await handler2(request('/api/installations',{method:'POST',cookie:'kairos_control_session='+fakeSession,
  origin:'https://evil.example',csrf:csrfFor(fakeSession,{env}),body:{}}),bad);
 assert.equal(bad.statusCode,400);
});

test('OAuth callback rejects replay before exchanging authorization code',async()=>{
 let exchangeCount=0;
 const db={async session(){return null;},async claimOAuth(){return false;}};
 const handler=createHostedHandler({env,storeFactory:()=>db,fetcher:async()=>{exchangeCount++;throw Error('unexpected exchange');}});
 const start=createResponse();await handler(request('/api/auth/start?provider=github'),start);
 const cookie=start.getHeader('Set-Cookie').split(';')[0];
 const state=new URL(start.getHeader('Location')).searchParams.get('state');
 const callback=createResponse();await handler(request('/api/auth/callback?code=abc&state='+state,{cookie}),callback);
 assert.equal(callback.statusCode,400);
 assert.equal(JSON.parse(callback.body).error,'OAUTH_REPLAY');
 assert.equal(exchangeCount,0);
});
