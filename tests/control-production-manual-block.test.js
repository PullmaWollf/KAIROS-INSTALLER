import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {createHostedHandler} from '../api/index.js';
import {csrfFor} from '../control/http.js';
const env={
 KAIROS_INSTALLER_PUBLIC_ORIGIN:'https://installer.example.com',
 KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
 KAIROS_PRODUCTION_MODE:'1',KAIROS_AUTOMATION_ENABLED:'1',
 KAIROS_CONTROL_ENABLE_WRITES:'1'
};
const sid='x'.repeat(43),id='12345678-1234-1234-1234-123456789012';
const row={id,github_id:42,phase_index:0,owner:'customer',repository:'kairos-celula',
 cell_name:'Celula',supabase_org_id:'org_1234',vercel_team_id:'personal_uid_customer1234'};
function response(){return {statusCode:200,setHeader(){},end(body){this.body=body;}};}
test('production refuses manual execution of provider POST even with full consent and connected user',async()=>{
 let remoteWrites=0;
 const db={async session(){return {id:42,login:'customer'};},
  async installation(){return row;},
  async claim(){remoteWrites++;throw Error('forbidden');}};
 const handler=createHostedHandler({env,storeFactory:()=>db,
  fetcher:async()=>{remoteWrites++;throw Error('forbidden');}});
 const result=response();
 await handler({method:'POST',url:'/api/installations/'+id+'/execute',
  body:{execute:true,acceptBilling:true,expectedPhase:'github',owner:'customer',
   supabaseOrgId:row.supabase_org_id,vercelTeamId:row.vercel_team_id},
  headers:{host:'installer.example.com',origin:'https://installer.example.com',
   cookie:'kairos_control_session='+sid,
   'x-kairos-csrf':csrfFor(sid,{env})}},result);
 assert.equal(result.statusCode,423);
 assert.equal(JSON.parse(result.body).error,'AUTOMATION_ONLY');
 assert.equal(remoteWrites,0);
});
