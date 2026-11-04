import test from 'node:test';
import assert from 'node:assert/strict';
import {generateKeyPairSync,sign} from 'node:crypto';
import {verifyAutomationIdentity,AUTOMATION_IDENTITY} from '../control/automation-oidc.js';
import {createHostedHandler} from '../api/index.js';
const {privateKey,publicKey}=generateKeyPairSync('rsa',{modulusLength:2048});
const jwk={...publicKey.export({format:'jwk'}),kid:'integration-fixture-kid',alg:'RS256',use:'sig'};
const now=Math.floor(Date.now()/1000);
const expected={
 iss:AUTOMATION_IDENTITY.issuer,aud:AUTOMATION_IDENTITY.audience,
 repository:AUTOMATION_IDENTITY.repository,repository_id:AUTOMATION_IDENTITY.repositoryId,
 workflow_ref:AUTOMATION_IDENTITY.workflowRef,ref:AUTOMATION_IDENTITY.ref,
 sub:AUTOMATION_IDENTITY.subject,event_name:'schedule',
 iat:now-10,exp:now+120
};
const base64=v=>Buffer.from(JSON.stringify(v)).toString('base64url');
function signed(changes={},headerChanges={}){
 const first=base64({alg:'RS256',kid:jwk.kid,typ:'JWT',...headerChanges});
 const second=base64({...expected,...changes});
 const signature=sign('RSA-SHA256',Buffer.from(first+'.'+second),privateKey).toString('base64url');
 return first+'.'+second+'.'+signature;
}
function provider(){
 let requests=0;
 const fetcher=async(url,options)=>{
  requests++;
  assert.equal(url,'https://token.actions.githubusercontent.com/.well-known/jwks');
  assert.equal(options.method,'GET');assert.equal(options.redirect,'error');
  assert.equal(options.headers.Accept,'application/json');
  return {status:200,json:async()=>({keys:[jwk]})};
 };
 return {fetcher,count:()=>requests};
}
test('accept only Github-signed token from original repo and workflow on main',async()=>{
 const {fetcher,count}=provider();
 const report=await verifyAutomationIdentity('Bearer '+signed(),{fetcher});
 assert.deepEqual(report,{valid:true,caller:'github-actions',repositoryId:'1444670066'});
 assert.equal(count(),1);
});
test('reject forged repo, audience, branch, source or expired claims before key lookup',async()=>{
 const mutations=[
  {aud:'https://other.example/api/automation/tick'},
  {repository:'attacker/KAIROS-INSTALLER'},
  {repository_id:'1'},
  {workflow_ref:'PullmaWollf/KAIROS-INSTALLER/.github/workflows/evil.yml@refs/heads/main'},
  {ref:'refs/heads/evil'}, {sub:'repo:attacker/KAIROS-INSTALLER:ref:refs/heads/main'},
  {event_name:'pull_request'},
  {iss:'https://identity.attacker.example'}, {exp:now-1},
  {iat:now+800},{iat:now-800}
 ];
 const {fetcher,count}=provider();
 for(const claims of mutations)
  await assert.rejects(verifyAutomationIdentity('Bearer '+signed(claims),{fetcher}),
   {code:'WORKER_UNAUTHORIZED'});
 assert.equal(count(),0);
});
test('reject incorrect signing, JOSE embedded keys and unknown algorithms',async()=>{
 const {fetcher}=provider();
 const valid=signed();
 const changed=valid.split('.');changed[2]=changed[2].slice(0,-2)+'xx';
 await assert.rejects(verifyAutomationIdentity('Bearer '+changed.join('.'),{fetcher}),
  {code:'WORKER_UNAUTHORIZED'});
 for(const header of [{alg:'none'},{jku:'https://attacker.example/keys'},{jwk:{kty:'RSA'}},{crit:['exp']}])
  await assert.rejects(verifyAutomationIdentity('Bearer '+signed({},header),{fetcher}),
   {code:'WORKER_UNAUTHORIZED'});
 for(const token of ['Bearer rubbish','Basic '+valid,'Bearer ','Bearer '+valid+'...'])
  await assert.rejects(verifyAutomationIdentity(token,{fetcher}),
   {code:'WORKER_UNAUTHORIZED'});
});
test('JWT verification rejects wrong provider JWKS, missing key and network errors',async()=>{
 for(const fetcher of [
  async()=>({status:403,json:async()=>({})}),
  async()=>({status:200,json:async()=>({keys:[]})}),
  async()=>{throw Error('network unavailable');}
 ]){
  await assert.rejects(verifyAutomationIdentity('Bearer '+signed(),{fetcher}),
   {code:'WORKER_UNAUTHORIZED'});
 }
});
test('only real cryptographic scheduler identity can hit the hosted tick endpoint',async()=>{
 const {fetcher}=provider();
 let calls=0;
 const db={async claimAutomation(){calls++;return null;}};
 const env={
  KAIROS_INSTALLER_PUBLIC_ORIGIN:'https://kairos-installer-homolog.vercel.app',
  KAIROS_AUTOMATION_ENABLED:'1',KAIROS_HOMOLOGATION_MODE:'1',
  KAIROS_CONTROL_ENABLE_WRITES:'1',KAIROS_VERCEL_MANAGEMENT_ENABLED:'1',
  KAIROS_ENABLE_BETA_SQL:'1',KAIROS_ENABLE_GIT_DEPLOY:'1'
 };
 const handler=createHostedHandler({env,fetcher,storeFactory:()=>db});
 const request=auth=>({url:'/api/automation/tick',method:'GET',
  headers:{host:'kairos-installer-homolog.vercel.app',
   ...(auth?{authorization:'Bearer '+auth}:{})}});
 const res=()=>({statusCode:200,setHeader(){},end(body=''){this.body=body;}});
 const success=res();await handler(request(signed()),success);
 assert.equal(success.statusCode,200);
 assert.deepEqual(JSON.parse(success.body),{status:'idle'});
 assert.equal(calls,1);
 const missing=res();await handler(request(null),missing);
 assert.equal(missing.statusCode,401);
 assert.equal(JSON.parse(missing.body).error,'WORKER_UNAUTHORIZED');
 assert.equal(calls,1);
});

test('signed scheduler call is a safe no-op when provision permissions stay disabled',async()=>{
 const {fetcher}=provider();
 let claims=0;
 const handler=createHostedHandler({env:{
  KAIROS_INSTALLER_PUBLIC_ORIGIN:'https://kairos-installer-homolog.vercel.app',
  KAIROS_AUTOMATION_ENABLED:'0',KAIROS_CONTROL_ENABLE_WRITES:'0'
 },fetcher,storeFactory:()=>({async claimAutomation(){claims++;throw Error('blocked');}})});
 const res={statusCode:200,setHeader(){},end(body=''){this.body=body;}};
 await handler({url:'/api/automation/tick',method:'GET',
  headers:{host:'kairos-installer-homolog.vercel.app',
   authorization:'Bearer '+signed()}},res);
 assert.equal(res.statusCode,200);
 assert.deepEqual(JSON.parse(res.body),{status:'disabled'});
 assert.equal(claims,0);
});
