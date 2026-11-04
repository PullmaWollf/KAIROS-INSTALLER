import test from 'node:test';
import assert from 'node:assert/strict';
import {executeCloudStep} from '../control/engine.js';
import {phaseFor} from '../control/plan.js';
const initial={id:'12345678-aaaa-bbbb-cccc-123456789012',phase_index:0,owner:'cliente',
 repository:'kairos-hml-celula',cell_name:'HML Célula',github_id:127,supabase_org_id:'org_cliente',vercel_team_id:'team_cliente',
 supabase_ref:null,vercel_project_id:null,pwa_origin:null};
test('cloud orchestration advances eight phases under exact consent, never reusing another tenant',async()=>{
 const row={...initial},attempts=new Map(),audit=[];
 const db={
  async claim(id,githubId,phase){
   assert.equal(id,row.id);assert.equal(githubId,127);
   assert.equal(phase,phaseFor(row.phase_index));
   if(attempts.has(phase))return {claimed:false,reason:'review_existing_attempt'};
   attempts.set(phase,'started');audit.push(['claimed',phase]);
   return {claimed:true,attempt_id:'12345678-1234-1234-1234-123456789012'};
  },
  async finish(_id,_user,phase,_attempt,receipt){
   assert.equal(attempts.get(phase),'started');attempts.set(phase,'confirmed');
   if(phase==='supabase')row.supabase_ref=receipt.projectRef;
   if(phase==='vercel')row.vercel_project_id=receipt.projectId;
   if(phase==='deploy')row.pwa_origin=receipt.url;
   row.phase_index++;audit.push(['confirmed',phase]);return true;
  }
 };
 const worker={
  async precheck(current,who,phase){assert.equal(who,127);
   assert.equal(current.owner,'cliente');
   if(['migrate','env','bootstrap'].includes(phase))assert.ok(current.supabase_ref);
   if(['env','deploy'].includes(phase))assert.ok(current.vercel_project_id);},
  async run(current,who,phase){
   const receipts={github:{repository:'cliente/kairos-hml-celula'},supabase:{projectRef:'abcdefghijklmnopqrst'},
    migrate:{},vercel:{projectId:'prj_abcdefghijklmno'},env:{},bootstrap:{},
    deploy:{url:'https://celula-testes.vercel.app'},smoke:{}};
   return {receipt:receipts[phase]};
  }
 };
 for(let index=0;index<8;index++){
  const phase=phaseFor(index);
  const res=await executeCloudStep({db,userId:127,row:{...row},worker,
   env:{KAIROS_CONTROL_ENABLE_WRITES:'1',KAIROS_HOMOLOGATION_MODE:'1',
    KAIROS_HML_GITHUB_ID:'127',KAIROS_HML_GITHUB_LOGIN:'cliente',
    KAIROS_HML_SUPABASE_ORG_ID:'org_cliente',KAIROS_HML_VERCEL_SCOPE:'team_cliente',
    KAIROS_HML_REPOSITORY:'kairos-hml-celula',
    KAIROS_HML_INSTALLATION_ID:row.id,
    KAIROS_HML_EXPIRES_AT:new Date(Date.now()+3600000).toISOString()},
   consent:{execute:true,acceptBilling:true,owner:'cliente',supabaseOrgId:'org_cliente',
    vercelTeamId:'team_cliente',expectedPhase:phase}});
  assert.equal(res.status,'recorded');assert.equal(res.phase,phase);
 }
 assert.equal(row.phase_index,8);assert.equal(phaseFor(row.phase_index),null);
 assert.equal(audit.length,16);assert.equal(attempts.size,8);
});
