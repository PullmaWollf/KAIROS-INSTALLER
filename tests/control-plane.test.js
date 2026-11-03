import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {encryptControl,decryptControl,tokenHash,ControlError} from '../control/crypto.js';
import {validateCloudPlan,phaseFor,safeInstallation} from '../control/plan.js';
import {controlStore} from '../control/store.js';
const env={KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
 KAIROS_CONTROL_SUPABASE_URL:'https://abcdefghijklmno.supabase.co',
 KAIROS_CONTROL_SERVICE_ROLE_KEY:'private-server-service-key-only-test'};
test('AES-GCM binds ciphertext to purpose and never serializes plaintext',()=>{
 const secret='test-token-content-123456';
 const encrypted=encryptControl({token:secret},'provider:123:github',{env});
 assert.equal(encrypted.includes(secret),false);
 assert.deepEqual(decryptControl(encrypted,'provider:123:github',{env}),{token:secret});
 assert.throws(()=>decryptControl(encrypted,'provider:123:supabase',{env}),e=>e.code==='CANNOT_DECRYPT');
 assert.match(tokenHash('a'.repeat(43)),/^[a-f0-9]{64}$/);
});
test('cloud plan strictly limits destinations and rejects injected secrets',()=>{
 const p={owner:'cliente',repository:'kairos-cliente',cellName:'Célula de Teste',supabaseOrgId:'org_cliente',
  vercelTeamId:'team_cliente',region:'sa-east-1',adminLogin:'admin-celula'};
 assert.equal(validateCloudPlan(p,'cliente').repository,'kairos-cliente');
 assert.throws(()=>validateCloudPlan({...p,owner:'PullmaWollf'},'PullmaWollf'),e=>e.code==='WRONG_OWNER');
 assert.throws(()=>validateCloudPlan({...p,SUPABASE_SERVICE_ROLE_KEY:'token'},'cliente'),e=>e.code==='BAD_PLAN');
 assert.equal(phaseFor(8),null);
 assert.equal(safeInstallation({phase_index:1}).phase,'supabase');
});
test('store sends key only to configured Supabase host and never emits it in result',async()=>{
 let calls=[];
 const fetcher=async(url,opts)=>{
  calls.push({url,method:opts.method,headers:opts.headers});
  return {status:200,async json(){return []}};
 };
 const db=controlStore({fetcher,env});
 await db.health();
 assert.equal(calls[0].url.startsWith(env.KAIROS_CONTROL_SUPABASE_URL+'/rest/v1/'),true);
 assert.equal(calls[0].headers.apikey,env.KAIROS_CONTROL_SERVICE_ROLE_KEY);
 assert.equal(JSON.stringify(await db.installations(25)).includes(env.KAIROS_CONTROL_SERVICE_ROLE_KEY),false);
});
