import test from 'node:test';
import assert from 'node:assert/strict';
import {assertHomologationScope,homologationGuardStatus} from '../control/homologation-guard.js';
import {executeCloudStep} from '../control/engine.js';
const now=Date.UTC(2026,10,4,13,0,0);
const row={
 id:'12345678-1234-1234-1234-123456789012',
 github_id:42,phase_index:0,owner:'okarakimoto',
 repository:'kairos-hml-celula001',
 cell_name:'HML Célula 001',
 supabase_org_id:'org_test1234',
 vercel_team_id:'personal_uid_test1234'
};
const env={
 KAIROS_CONTROL_ENABLE_WRITES:'0',KAIROS_HOMOLOGATION_MODE:'0',
 KAIROS_VERCEL_MANAGEMENT_ENABLED:'0',KAIROS_ENABLE_BETA_SQL:'0',
 KAIROS_ENABLE_GIT_DEPLOY:'0',
 KAIROS_HML_GITHUB_ID:'42',
 KAIROS_HML_GITHUB_LOGIN:'okarakimoto',
 KAIROS_HML_SUPABASE_ORG_ID:'org_test1234',
 KAIROS_HML_VERCEL_SCOPE:'personal_uid_test1234',
 KAIROS_HML_REPOSITORY:'kairos-hml-celula001',
 KAIROS_HML_INSTALLATION_ID:'12345678-1234-1234-1234-123456789012',
 KAIROS_HML_EXPIRES_AT:'2026-11-04T15:00:00Z',
 KAIROS_VERCEL_TEAM_ID:'team_maintainer1234'
};
const consent={execute:true,acceptBilling:true,expectedPhase:'github',owner:row.owner,
 supabaseOrgId:row.supabase_org_id,vercelTeamId:row.vercel_team_id};
const locked={...env,KAIROS_HOMOLOGATION_MODE:'1'};
const allowed={...locked,KAIROS_CONTROL_ENABLE_WRITES:'1'};
test('homologation defaults disabled even with a complete allowlist',()=>{
 const s=homologationGuardStatus(env,{now});
 assert.equal(s.protected,true);
 assert.equal(s.enabled,false);
 assert.equal(s.readyForWrites,false);
 assert.equal(s.createsResources,false);
});
test('homologation is fail-closed if config is missing, expired or long-lived',()=>{
 assert.equal(homologationGuardStatus({KAIROS_HOMOLOGATION_MODE:'1'},{now}).enabled,false);
 assert.equal(homologationGuardStatus({...locked,KAIROS_HML_EXPIRES_AT:'2026-11-04T12:00:00Z'},{now}).protected,false);
 assert.equal(homologationGuardStatus({...locked,KAIROS_HML_EXPIRES_AT:'2026-12-04T15:00:00Z'},{now}).protected,false);
 assert.equal(homologationGuardStatus({...locked,KAIROS_HML_VERCEL_SCOPE:env.KAIROS_VERCEL_TEAM_ID},{now}).protected,false);
 assert.equal(homologationGuardStatus({...locked,KAIROS_HML_GITHUB_LOGIN:'PullmaWollf'},{now}).protected,false);
 assert.equal(homologationGuardStatus({...locked,KAIROS_HML_REPOSITORY:'AGAPE'},{now}).protected,false);
});
test('homologation only permits an exact disposable customer scope',()=>{
 assert.equal(assertHomologationScope({env:locked,userId:42,row,now}),true);
 const changes=[
  [41,row], [42,{...row,id:'abcd1234-1234-1234-1234-123456789012'}],
  [42,{...row,github_id:999}],
  [42,{...row,owner:'PullmaWollf'}],
  [42,{...row,repository:'KAIROS-CORE'}],
  [42,{...row,repository:'kairos-hml-evil'}],
  [42,{...row,cell_name:'Célula Produção'}],
  [42,{...row,supabase_org_id:'org_other1234'}],
  [42,{...row,vercel_team_id:'team_other1234'}]
 ];
 for(const [userId,target] of changes)
  assert.throws(()=>assertHomologationScope({env:locked,userId,row:target,now}),{code:'HOMOLOGATION_SCOPE_DENIED'});
});
test('safe status never leaks target identifiers or keys to browser',()=>{
 const report=homologationGuardStatus(locked,{now});
 const text=JSON.stringify(report);
 for(const secret of ['okarakimoto','org_test1234','personal_uid_test1234','kairos-hml-celula001','42'])
  assert.equal(text.includes(secret),false);
 assert.equal(report.readyForWrites,false);
});
test('executor refuses mismatched, unconfigured and explicitly disabled scope before precheck or claim',async()=>{
 let called=0;
 const worker={async precheck(){called++;throw Error('must not precheck');},async run(){called++;}};
 const db={async claim(){called++;}};
 const cases=[
  {env:{...env,KAIROS_CONTROL_ENABLE_WRITES:'1'},userId:42,row,code:'HOMOLOGATION_LOCKED'},
  {env:{...allowed,KAIROS_HML_EXPIRES_AT:'2020-01-01T00:00:00Z'},userId:42,row,code:'HOMOLOGATION_LOCKED'},
  {env:{...allowed},userId:43,row,code:'HOMOLOGATION_SCOPE_DENIED'},
  {env:{...allowed},userId:42,row:{...row,repository:'agape'},code:'HOMOLOGATION_SCOPE_DENIED'},
  {env:{...allowed},userId:42,row:{...row,vercel_team_id:'team_maintainer1234'},code:'HOMOLOGATION_SCOPE_DENIED'}
 ];
 for(const item of cases)
  await assert.rejects(executeCloudStep({db,worker,consent:{
   ...consent,owner:item.row.owner,vercelTeamId:item.row.vercel_team_id},...item}),
   e=>e.code===item.code);
 assert.equal(called,0);
});
