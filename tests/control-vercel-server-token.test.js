import test from 'node:test';
import assert from 'node:assert/strict';
import {cloudOps} from '../control/cloud-worker.js';

const team='team_aJr2RmvNXTI1eJSKI5ASIyAG';
const secret='test-token-not-a-real-secret';
function setup(target=team){
 const calls=[];
 const fetcher=async (url,options)=>{
  calls.push({url,auth:options.headers.Authorization});
  if(url.endsWith('/v2/user'))return {status:200,json:async()=>({user:{username:'operator'}})};
  if(url.includes('/v2/teams'))return {status:200,json:async()=>({teams:[{id:team,slug:'my-team'}]})};
  throw Error('Unexpected provider request');
 };
 const db={connection:async()=>{throw Error('OAuth token must not be used')}};
 const env={KAIROS_VERCEL_MANAGEMENT_ENABLED:'1',KAIROS_VERCEL_TEAM_ID:team,
  KAIROS_VERCEL_ACCESS_TOKEN:secret};
 return {ops:cloudOps({db,env,fetcher}),calls,row:{vercel_team_id:target}};
}
test('Vercel preflight uses server credential without OAuth fallback',async()=>{
 const {ops,calls,row}=setup();
 await ops.precheck(row,42,'vercel');
 assert.equal(calls.length,2);
 assert.ok(calls.every(x=>x.auth==='Bearer test-token-not-a-real-secret'));
});
test('Vercel preflight refuses any team outside configured scope',async()=>{
 const {ops,calls,row}=setup('team_other');
 await assert.rejects(ops.precheck(row,42,'vercel'),{code:'VERCEL_TEAM_FORBIDDEN'});
 assert.equal(calls.length,0);
});
test('Vercel preflight remains disabled behind management flag',async()=>{
 const {ops,calls,row}=setup();
 const blocked=cloudOps({db:{},env:{KAIROS_VERCEL_MANAGEMENT_ENABLED:'0',
  KAIROS_VERCEL_TEAM_ID:team,KAIROS_VERCEL_ACCESS_TOKEN:secret}});
 await assert.rejects(blocked.precheck(row,42,'vercel'),{code:'VERCEL_SCOPE_REQUIRED'});
 assert.equal(calls.length,0);
});
