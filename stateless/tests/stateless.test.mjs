import test from 'node:test';
import assert from 'node:assert/strict';
import {planFrom,validateCredentials,projectSlug,InstallationError} from '../src/validation.mjs';
import {audit} from '../src/providers.mjs';
import {launch} from '../src/handoff.mjs';
import {readFile} from 'node:fs/promises';
const request={
 githubLogin:'okarakimoto',repository:'kairos-hml-celula-teste',cellName:'HML Célula Teste',
 supabaseOrgId:'naebjiwsisztseydpupg',vercelScope:'personal_x4YO1nK4AxoR8npqTQwx9DNt',
 region:'sa-east-1',adminLogin:'administrador',approveFreeOnly:true,personalNonCommercial:true,
 githubToken:'github-long-test-credential-123456',supabaseToken:'supabase-long-test-credential-123456',
 vercelToken:'vercel-long-test-credential-123456',adminPassword:'temporary-password-for-admin-123456'
};
const plan=planFrom(request),credentials=validateCredentials(request);
function server(options={}){
 let calls=[];
 const ghRepo='/repos/'+plan.githubLogin+'/'+plan.repository;
 const respond=(body,status=200)=>({status,json:async()=>body});
 const fetcher=async(url,opts={})=>{
  calls.push({url,method:opts.method||'GET',body:opts.body});
  const path=url.replace(/^https:\/\/(?:api\.github\.com|api\.supabase\.com|api\.vercel\.com)/,'');
  if(opts.method==='GET'){
   if(path==='/user')return respond({login:options.githubLogin||'okarakimoto'});
   if(path==='/repos/PullmaWollf/KAIROS-CORE')return respond({is_template:true,private:false,default_branch:'main'});
   if(path==='/v1/organizations')return respond([{id:plan.supabaseOrgId,slug:plan.supabaseOrgId}]);
   if(path==='/v1/organizations/'+plan.supabaseOrgId)return respond({id:plan.supabaseOrgId,plan:options.supabasePlan||'free'});
   if(path==='/v1/projects')return respond(options.projects||[]);
   if(path==='/v2/user')return respond({user:{username:'okarakimoto',id:'x4YO1nK4AxoR8npqTQwx9DNt',billing:{plan:options.vercelPlan||'hobby'}}});
   if(path==='/v1/integrations/git-namespaces?provider=github')return respond(
    options.noGitLink?[]:options.restrictedLink?
     [{provider:'github',slug:'okarakimoto',isAccessRestricted:true}]:
     [{provider:'github',slug:'okarakimoto',isAccessRestricted:false,viewer:{canCreateApp:true}}]);
   if(path===ghRepo)return respond(null,404);
   if(path===ghRepo+'/actions/secrets/public-key')return respond({key:'A'.repeat(44),key_id:'key-a'});
   if(path===ghRepo+'/actions/workflows/kairos-install.yml')return respond({name:'KAIRÓS - instalação automática da célula',path:'.github/workflows/kairos-install.yml'});
  }
  if(opts.method==='POST'&&path==='/repos/PullmaWollf/KAIROS-CORE/generate')return respond({full_name:plan.githubLogin+'/'+plan.repository,private:true},201);
  if(opts.method==='PUT'&&path.startsWith(ghRepo+'/actions/secrets/'))return respond({},201);
  if(opts.method==='PUT'&&path.startsWith(ghRepo+'/contents/'))return respond({content:{sha:'a'}},201);
  if(opts.method==='POST'&&path.endsWith('/actions/workflows/kairos-install.yml/dispatches'))return respond(null,204);
  throw new Error('Unexpected request '+opts.method+' '+url);
 };
 return {fetcher,calls};
}
test('homologation plan refuses the maintainer, unrelated repositories and missing consent',()=>{
 assert.equal(planFrom(request).githubLogin,'okarakimoto');
 assert.equal(projectSlug(request.cellName),'hml-celula-teste');
 for(const v of [
  {githubLogin:'PullmaWollf'},{repository:'AGAPE'},
  {repository:'kairos-production'},{cellName:'Célula Prod'},{approveFreeOnly:false},
  {vercelScope:'team-maintainer'}
 ]) assert.throws(()=>planFrom({...request,...v}),InstallationError);
});
test('credential validation is in memory and does not stringify tokens',()=>{
 assert.deepEqual(Object.keys(credentials).sort(),['adminPassword','githubToken','supabaseToken','vercelToken']);
 assert.throws(()=>validateCredentials({...request,githubToken:'x'}),InstallationError);
});
test('preflight contacts providers with GET only and returns sanitized metadata',async()=>{
 const mock=server();const result=await audit({fetcher:mock.fetcher,plan,credentials});
 assert.equal(result.ok,true);assert.equal(result.supabase.activeProjectsObserved,0);
 assert.equal(result.readOnly,true);assert.ok(mock.calls.every(x=>x.method==='GET'));
 for(const secret of Object.values(credentials))assert.equal(JSON.stringify(result).includes(secret),false);
});
test('two active Free projects refuse creation before GitHub POST',async()=>{
 const mock=server({projects:[{status:'ACTIVE_HEALTHY'},{status:'COMING_UP'}]});
 await assert.rejects(launch({fetcher:mock.fetcher,request}),{code:'SUPABASE_QUOTA_FULL'});
 assert.ok(mock.calls.every(x=>x.method==='GET'));
});
test('Supabase paid plan, Vercel non-Hobby and absent GitHub integration refuse all POSTs',async()=>{
 for(const opts of [{supabasePlan:'pro'},{vercelPlan:'pro'},{noGitLink:true},{restrictedLink:true},{githubLogin:'other'}]){
  const mock=server(opts);
  await assert.rejects(launch({fetcher:mock.fetcher,request}),InstallationError);
  assert.ok(mock.calls.every(x=>x.method==='GET'));
 }
});
test('successful launch creates exactly one private customer repository, encrypted secrets and workflow',async()=>{
 const mock=server();let encrypted=0;
 const out=await launch({fetcher:mock.fetcher,request,
  encryptSecret:async(value,key)=>{encrypted++;assert.equal(key,'A'.repeat(44));
   assert.ok(value.length>=20);return 'sealed-test-value-ciphertext-12345';}});
 assert.equal(out.status,'queued');assert.equal(encrypted,5);
 assert.ok(out.githubRepository.includes('okarakimoto/kairos-hml-celula-teste'));
 assert.equal(out.createdResources.supabase,false);
 const creates=mock.calls.filter(x=>x.method==='POST'&&x.url.endsWith('/generate'));
 assert.equal(creates.length,1);
 assert.equal(JSON.parse(creates[0].body).private,true);
 const writes=mock.calls.filter(x=>x.method==='PUT'&&x.url.includes('/actions/secrets/'));
 assert.equal(writes.length,5);
 for(const call of writes){
  const body=JSON.parse(call.body);assert.equal(body.encrypted_value,'sealed-test-value-ciphertext-12345');
  for(const secret of Object.values(credentials))assert.equal(call.body.includes(secret),false);
 }
 const dispatch=mock.calls.filter(x=>x.url.includes('/dispatches'));
 assert.equal(dispatch.length,1);assert.equal(JSON.parse(dispatch[0].body).inputs.supabase_org_id,plan.supabaseOrgId);
 assert.equal(mock.calls.filter(x=>x.url.includes('supabase.com')&&x.method!=='GET').length,0);
 assert.equal(mock.calls.filter(x=>x.url.includes('vercel.com')&&x.method!=='GET').length,0);
});
test('GitHub error after creating the repository never starts another repo or leaks a token',async()=>{
 const mock=server();let encrypted=0;
 await assert.rejects(launch({fetcher:mock.fetcher,request,
  encryptSecret:async()=>{encrypted++;throw new Error('secret unexpected');}}),
  e=>e.code==='PARTIAL_INSTALL_NEEDS_REVIEW'&&
    e.repositoryUrl==='https://github.com/okarakimoto/kairos-hml-celula-teste');
 assert.equal(encrypted,1);assert.equal(mock.calls.filter(x=>x.url.endsWith('/generate')).length,1);
});
test('worker only uses customer-controlled repo variables and avoids Installer database',async()=>{
 const path=new URL('../worker/kairos-bootstrap.mjs',import.meta.url);
 const worker=await readFile(path,'utf8');
 assert.ok(worker.includes('KAIROS_INSTALL_STATE'));
 assert.ok(worker.includes('await claim('));
 assert.ok(!worker.includes('kairos_control_'));
 assert.ok(!worker.includes('lismteibqsgmryoykimu'));
 assert.ok(!worker.includes('pubrskqrsskiamzflpmj'));
 const yaml=await readFile(new URL('../worker/workflow.yml',import.meta.url),'utf8');
 assert.ok(yaml.includes('if: always()'));assert.ok(yaml.includes('concurrency:'));
});