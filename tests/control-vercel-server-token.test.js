import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {cloudOps} from '../control/cloud-worker.js';
import {encryptControl} from '../control/crypto.js';

const team='team_customer_123456';
const credential='test-credential-for-customer-only-123456';
function setup(target=team,enabled='1'){
 const calls=[];
 const env={KAIROS_VERCEL_MANAGEMENT_ENABLED:enabled,KAIROS_VERCEL_TEAM_ID:'team_installer_123456',
  KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
  KAIROS_VERCEL_ACCESS_TOKEN:'server-token-must-never-be-used'};
 const encrypted=encryptControl({kind:'vercel-management-v1',teamId:team,teamSlug:'customer-team',
  accessToken:credential,verifiedAt:'2026-11-04T00:00:00.000Z'},'oauth:vercel:42',{env});
 const db={async connection(id,provider){assert.equal(id,42);assert.equal(provider,'vercel');return encrypted;}};
 const fetcher=async(url,options)=>{
  calls.push({url,authorization:options.headers.Authorization});
  if(url.endsWith('/v2/user'))return {status:200,json:async()=>({user:{username:'customer'}})};
  if(url.includes('/v2/teams?'))return {status:200,json:async()=>({teams:[{id:team,slug:'customer-team'}]})};
  throw Error('Unexpected network request');
 };
 return {ops:cloudOps({db,env,fetcher}),calls,row:{vercel_team_id:target}};
}
test('Vercel preflight uses encrypted customer credential and not global token',async()=>{
 const {ops,calls,row}=setup();
 await ops.precheck(row,42,'vercel');
 assert.equal(calls.length,2);
 assert.ok(calls.every(c=>c.authorization==='Bearer '+credential));
});
test('Vercel preflight blocks unauthorized team before remote network calls',async()=>{
 const {ops,calls,row}=setup('team_another_123456');
 await assert.rejects(ops.precheck(row,42,'vercel'),{code:'VERCEL_TEAM_FORBIDDEN'});
 assert.equal(calls.length,0);
});
test('Vercel management must be enabled explicitly',async()=>{
 const {ops,calls,row}=setup(team,'0');
 await assert.rejects(ops.precheck(row,42,'vercel'),{code:'VERCEL_SCOPE_REQUIRED'});
 assert.equal(calls.length,0);
});
