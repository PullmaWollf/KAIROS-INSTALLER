import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {cloudOps} from '../control/cloud-worker.js';
import {encryptControl} from '../control/crypto.js';

const team='team_customer_123456',projectId='prj_customer123456';
const key='test-customer-credential-123456';
const env={KAIROS_VERCEL_TEAM_ID:'team_installer_123456',
 KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url')};
const record=encryptControl({kind:'vercel-management-v1',teamId:team,
 teamSlug:'customer',accessToken:key},'oauth:vercel:42',{env});
const row={id:'12345678-1234-1234-1234-123456789012',
 cell_name:'Célula Esperança',vercel_team_id:team,vercel_project_id:projectId,
 pwa_origin:'https://deployment-123.vercel.app'};
function fakeVercel(url,options){
 assert.equal(options.headers.Authorization,'Bearer '+key);
 if(url.includes('/domains?'))return {status:200,json:async()=>({
  domains:[{name:'celula-esperanca.vercel.app',projectId}]
 })};
 if(url.includes('/v9/projects/'))return {status:200,json:async()=>({id:projectId,accountId:team})};
 throw Error('Unexpected Vercel path');
}
const pwaOrigin='https://celula-esperanca.vercel.app';
const fetcher=async(url,options)=>{
 if(url.startsWith('https://api.vercel.com'))return fakeVercel(url,options);
 assert.ok(url.startsWith(pwaOrigin+'/'));
 if(url.endsWith('/api/health'))return {status:200,json:async()=>({ok:true,ready:true})};
 if(url.endsWith('/api/public'))return {status:200,json:async()=>({
  ok:true,branding:{name:'Demo'},posts:[]})};
 if(url.endsWith('/manifest.webmanifest'))return {status:200,json:async()=>({
  display:'standalone',icons:[{src:'/icon.png'}]})};
 if(url.endsWith('/api/me'))return {status:401,json:async()=>({ok:false})};
 if(url.endsWith('/sw.js'))return {status:200,text:async()=>(
  "self.addEventListener('fetch',()=>{ const blocked = '/api/' })")};
 if(url===pwaOrigin+'/')return {status:200,text:async()=>(
  '<!doctype html><html><script src="/src/app.js"></script><link href="/manifest.webmanifest"></html>')};
 throw Error('Unexpected core path');
};
const db={async connection(id,provider){
 assert.equal(id,42);assert.equal(provider,'vercel');return record;
}};
test('final smoke verifies vanity domain but submits only DB-allowed receipt fields',async()=>{
 const ops=cloudOps({db,env,fetcher});
 const result=await ops.run(row,42,'smoke');
 assert.deepEqual(result.receipt,{});
 const recovered=await ops.reconcile(row,42,'smoke',new Date().toISOString());
 assert.equal(recovered.status,'verified');
 assert.deepEqual(recovered.receipt,{});
});
