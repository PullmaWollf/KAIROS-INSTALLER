import test from 'node:test';
import assert from 'node:assert/strict';
import {discoverVercelTeams} from '../control/vercel-connection.js';

const env={KAIROS_VERCEL_TEAM_ID:'team_installer_123456'};
const token='test-scope-1234567890123456789';
const options={userId:321,payload:{accessToken:token},env};
test('team discovery is read-only and returns safe team labels without any token',async()=>{
 let calls=0;
 const fetcher=async(url,init)=>{
  calls++;
  assert.equal(init.method,'GET');
  assert.equal(init.headers.Authorization,'Bearer '+token);
  if(url.includes('/v2/teams?'))return {status:200,json:async()=>({teams:[
   {id:'team_client_123456',name:'Equipe Esperança',slug:'esperanca',secret:'not-public'},
   {id:'team_installer_123456',slug:'operator'},
   {id:'bad',slug:'bad'}]})};
  if(url.includes('teamId=team_client_123456'))return {status:200,json:async()=>({projects:[]})};
  if(url.endsWith('/v2/user'))return {status:200,json:async()=>({user:{id:'uid_client123456',username:'client'}})};
  if(url.endsWith('/v9/projects?limit=1'))return {status:403};
  throw Error('Unexpected provider URL');
 };
 const result=await discoverVercelTeams({...options,fetcher});
 assert.deepEqual(result,{teams:[{teamId:'team_client_123456',
  name:'Equipe Esperança',slug:'esperanca'}],hasMore:false});
 assert.equal(calls,4);
 assert.equal(JSON.stringify(result).includes(token),false);
});
test('invalid tokens and anonymous calls never reach Vercel',async()=>{
 let calls=0;const fetcher=async()=>{calls++;throw Error('no network');};
 await assert.rejects(discoverVercelTeams({...options,userId:0,fetcher}),{code:'LOGIN_REQUIRED'});
 await assert.rejects(discoverVercelTeams({...options,payload:{accessToken:'short'},fetcher}),
  {code:'BAD_VERCEL_CREDENTIAL'});
 await assert.rejects(discoverVercelTeams({...options,payload:{accessToken:token,teamId:'team_abc'},fetcher}),
  {code:'BAD_VERCEL_CREDENTIAL'});
 assert.equal(calls,0);
});
test('remote permission failures return generic status without token or provider body',async()=>{
 const fetcher=async()=>({status:403,json:async()=>({secret:'should-not-escape'})});
 await assert.rejects(discoverVercelTeams({...options,fetcher}),error=>{
  assert.equal(error.code,'VERCEL_VERIFICATION_FAILED');
  assert.equal(error.message.includes(token),false);
  assert.equal(error.message.includes('should-not-escape'),false);
  return true;
 });
});
