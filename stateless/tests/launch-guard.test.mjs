import test from 'node:test';
import assert from 'node:assert/strict';
import {assertHmlLaunchGuard} from '../src/launch-guard.mjs';
const now=Date.parse('2026-11-04T17:00:00.000Z');
const plan={githubLogin:'okarakimoto',repository:'kairos-hml-celula-teste',
 supabaseOrgId:'naebjiwsisztseydpupg',
 vercelScope:'team_STGezn81sJfLu0iiNiVRGklO'};
const env={
 KAIROS_STATELESS_HML_ENABLE_LAUNCH:'1',
 KAIROS_STATELESS_HML_GITHUB_OWNER:'okarakimoto',
 KAIROS_STATELESS_HML_REPOSITORY:plan.repository,
 KAIROS_STATELESS_HML_SUPABASE_ORG:plan.supabaseOrgId,
 KAIROS_STATELESS_HML_VERCEL_SCOPE:plan.vercelScope,
 KAIROS_STATELESS_HML_EXPIRES_AT:new Date(now+3600000).toISOString()
};
test('stateless launch is disabled by default',()=>{
 assert.throws(()=>assertHmlLaunchGuard(plan,{env:{},now}),{code:'HOMOLOGATION_LAUNCH_LOCKED'});
});
test('specific temporary scope permits only exact customer installation',()=>{
 assert.equal(assertHmlLaunchGuard(plan,{env,now}),true);
 for(const [key,value] of [
  ['githubLogin','PullmaWollf'],['githubLogin','different'],
  ['repository','kairos-hml-other'],['supabaseOrgId','other_org'],
  ['vercelScope','team_something_else123']
 ]){
  assert.throws(()=>assertHmlLaunchGuard({...plan,[key]:value},{env,now}),{code:'HOMOLOGATION_LAUNCH_LOCKED'});
 }
});
test('expired or excessively long authorizations and mismatching env are blocked',()=>{
 for(const bad of [
  {...env,KAIROS_STATELESS_HML_EXPIRES_AT:new Date(now-1).toISOString()},
  {...env,KAIROS_STATELESS_HML_EXPIRES_AT:new Date(now+8*86400000).toISOString()},
  {...env,KAIROS_STATELESS_HML_ENABLE_LAUNCH:'0'},
  {...env,KAIROS_STATELESS_HML_GITHUB_OWNER:'PullmaWollf'},
  {...env,KAIROS_STATELESS_HML_REPOSITORY:'kairos-hml-some-other'},
  {...env,KAIROS_STATELESS_HML_SUPABASE_ORG:'org_other'},
  {...env,KAIROS_STATELESS_HML_VERCEL_SCOPE:'team_other12345'}
 ]){
  assert.throws(()=>assertHmlLaunchGuard(plan,{env:bad,now}),{code:'HOMOLOGATION_LAUNCH_LOCKED'});
 }
});
