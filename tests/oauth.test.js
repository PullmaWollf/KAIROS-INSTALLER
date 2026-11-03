import test from 'node:test';
import assert from 'node:assert/strict';
import {beginAuthorization,exchangeCode,safeEqual,providerConfig} from '../oauth/protocol.js';
import {createOAuthServer} from '../oauth/server.js';
const env={KAIROS_GITHUB_CLIENT_ID:'Iv1_example012345',KAIROS_GITHUB_CLIENT_SECRET:'test-secret-for-github-123456789',
 KAIROS_SUPABASE_CLIENT_ID:'example-client-id',KAIROS_SUPABASE_CLIENT_SECRET:'test-secret-for-supabase-12345'};
test('PKCE state e token exchange GitHub sem revelar segredos',async()=>{
 const config=providerConfig('github',env);
 const auth=beginAuthorization({provider:'github',callbackUrl:'http://127.0.0.1:43117/callback/github',config});
 const u=new URL(auth.url);
 assert.equal(u.searchParams.get('code_challenge_method'),'S256');
 assert.equal(u.searchParams.get('state'),auth.transaction.state);
 let params;
 const fetcher=async(_url,options)=>{params=new URLSearchParams(options.body);return {status:200,async json(){return {access_token:'gho_mock-token-for-tests-only'};}};};
 const result=await exchangeCode({transaction:auth.transaction,code:'temporary-code',config,fetcher});
 assert.equal(params.get('code_verifier'),auth.transaction.verifier);
 assert.equal(result.accessToken,'gho_mock-token-for-tests-only');
 assert.equal(safeEqual('abc','abd'),false);
});
test('Supabase usa basic auth e verifier no corpo',async()=>{
 const config=providerConfig('supabase',env),transaction=beginAuthorization({provider:'supabase',callbackUrl:'http://127.0.0.1:43117/callback/supabase',config}).transaction;
 const fetcher=async(url,opt)=>{assert.equal(url,'https://api.supabase.com/v1/oauth/token');assert.match(opt.headers.Authorization,/^Basic /);assert.equal(new URLSearchParams(opt.body).get('grant_type'),'authorization_code');return {status:200,async json(){return {access_token:'supabase-oauth-token-for-tests'};}};};
 assert.ok((await exchangeCode({transaction,code:'code',config,fetcher})).accessToken);
});
test('OAuth local não expõe token, recusa host falso e state inválido',async()=>{
 const port=43861;
 const server=createOAuthServer({env,port,fetcher:async()=>{throw Error('must not exchange')}});
 await server.start();
 try{
  const base='http://127.0.0.1:'+port;
  const page=await fetch(base,{redirect:'manual'});
  assert.equal(page.status,200);
  const cookie=page.headers.get('set-cookie').split(';')[0];
  // Node fetch can overwrite Host; verify invalid host with the low-level HTTP client.
  const {request}=await import('node:http');
  const badStatus=await new Promise((resolve,reject)=>{
   const req=request({hostname:'127.0.0.1',port,path:'/status',headers:{Host:'evil.local',Cookie:cookie}},res=>{res.resume();resolve(res.statusCode);});
   req.on('error',reject);req.end();
  });
  assert.equal(badStatus,400);
  const start=await fetch(base+'/connect/github',{redirect:'manual',headers:{Cookie:cookie,Referer:base+'/'}});
  assert.equal(start.status,302);
  assert.equal(new URL(start.headers.get('location')).hostname,'github.com');
  const cb=await fetch(base+'/callback/github?code=a&state=invalid',{headers:{Cookie:cookie}});
  assert.equal(cb.status,403);
  const status=await fetch(base+'/status',{headers:{Cookie:cookie}});
  const body=await status.json();
  assert.deepEqual(body.connected,[]);
  assert.equal(JSON.stringify(body).includes('access_token'),false);
 }finally{await server.close();}
});
