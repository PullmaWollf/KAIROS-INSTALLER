import test from 'node:test';
import assert from 'node:assert/strict';
import {homologationGuardStatus,assertHomologationScope} from '../control/homologation-guard.js';
import {automationReady} from '../control/automation.js';

const id='123e4567-e89b-42d3-a456-426614174000';
const env={
 KAIROS_HML_GITHUB_ID:'12345678',
 KAIROS_HML_GITHUB_LOGIN:'okarakimoto',
 KAIROS_HML_SUPABASE_ORG_ID:'test_org',
 KAIROS_HML_VERCEL_SCOPE:'team_test1234',
 KAIROS_HML_REPOSITORY:'kairos-hml-testcase',
 KAIROS_HML_INSTALLATION_ID:id,
 KAIROS_HML_EXPIRES_AT:'2026-11-06T12:00:00Z',
 KAIROS_HOMOLOGATION_MODE:'1',
 KAIROS_CONTROL_ENABLE_WRITES:'1',
 KAIROS_VERCEL_MANAGEMENT_ENABLED:'1',
 KAIROS_ENABLE_BETA_SQL:'1',
 KAIROS_ENABLE_GIT_DEPLOY:'1',
 KAIROS_VERCEL_TEAM_ID:'team_installer999'
};
const now=Date.parse('2026-11-04T12:00:00Z');
const row={id,owner:'okarakimoto',repository:'kairos-hml-testcase',
 supabase_org_id:'test_org',vercel_team_id:'team_test1234',
 cell_name:'HML Célula de teste',github_id:12345678};

test('homologation explicitly rejects concurrent production mode',()=>{
 const mixed={...env,KAIROS_PRODUCTION_MODE:'1'};
 const status=homologationGuardStatus(mixed,{now});
 assert.equal(status.protected,true);
 assert.equal(status.enabled,false);
 assert.equal(status.readyForWrites,false);
 assert.throws(()=>assertHomologationScope({env:mixed,userId:12345678,row,now}),
  e=>e.code==='HOMOLOGATION_LOCKED');
});

test('homologation accepts correctly scoped test when production is off',()=>{
 const status=homologationGuardStatus(env,{now});
 assert.equal(status.enabled,true);
 assert.equal(status.readyForWrites,true);
 assert.equal(assertHomologationScope({env,userId:12345678,row,now}),true);
});

test('homologation never permits another GitHub user',()=>{
 assert.throws(()=>assertHomologationScope({env,userId:87654321,row,now}),
  e=>e.code==='HOMOLOGATION_SCOPE_DENIED');
});


test('automatic worker refuses incomplete or expired homologation settings',()=>{
 const ready={...env,KAIROS_AUTOMATION_ENABLED:'1',
 KAIROS_HML_EXPIRES_AT:new Date(Date.now()+3600000).toISOString()};
 assert.equal(automationReady(ready),true);
 assert.equal(automationReady({...ready,KAIROS_HML_GITHUB_LOGIN:''}),false);
 assert.equal(automationReady({...ready,KAIROS_HML_REPOSITORY:'kairos-hml-other'}),true);
 assert.equal(automationReady({...ready,KAIROS_HML_EXPIRES_AT:'2020-01-01T00:00:00Z'}),false);
 assert.equal(automationReady({...ready,KAIROS_PRODUCTION_MODE:'1'}),false);
});
