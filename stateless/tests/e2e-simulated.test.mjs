import test from 'node:test';
import assert from 'node:assert/strict';
import {mkdir,writeFile,rm,readFile,mkdtemp} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
const login='okarakimoto',repo='kairos-hml-celula-teste',org='naebjiwsisztseydpupg',ref='abcdefghijklmnopq';
const projectId='prj_test_install_project1234',accountId='x4YO1nK4AxoR8npqTQwx9DNt';
Object.assign(process.env,{
 KAIROS_GITHUB_REPO:login+'/'+repo,
 KAIROS_GITHUB_AUTOMATION_TOKEN:'ghs_test_token_12345678901234567890',
 KAIROS_SUPABASE_TOKEN:'sbp_test_token_12345678901234567890',
 KAIROS_VERCEL_TOKEN:'vct_test_token_12345678901234567890',
 KAIROS_ADMIN_PASSWORD:'test-very-strong-admin-password-123',
 KAIROS_DB_PASSWORD:'test-very-strong-database-password-123',
 KAIROS_SUPABASE_ORG:org,KAIROS_VERCEL_SCOPE:'personal_'+accountId,
 KAIROS_CELL_NAME:'HML Célula Teste',KAIROS_PROJECT_SLUG:'hml-celula-teste',
 KAIROS_REGION:'sa-east-1',KAIROS_ADMIN_LOGIN:'administrador'
});
function reply(body,status=200){return {status,json:async()=>body};}
test('simulated end-to-end completes 7 phases, independently in customer GitHub, Supabase and Vercel',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'kairos-worker-e2e-'));
 const root=pathToFileURL(join(temp,'supabase','migrations')+'/');
 await mkdir(root,{recursive:true});
 const script=join(temp,'.github','kairos','kairos-bootstrap.mjs');
 await mkdir(join(temp,'.github','kairos'),{recursive:true});
 await writeFile(script,await readFile(new URL('../worker/kairos-bootstrap.mjs',import.meta.url)));
 const {run}=await import(pathToFileURL(script).href);
 const initial=new URL('20261103000000_kairos_initial.sql',root),throttle=new URL('20261103010000_kairos_login_throttle.sql',root);
 await writeFile(initial,'-- row level security\ncreate table if not exists public.app_users(id uuid);');
 await writeFile(throttle,'-- row level security\ncreate table if not exists public.login_throttle(id uuid);');
 const oldFetch=globalThis.fetch;
 const urlBase='https://kairos-hml-celula-teste.vercel.app';
 const variableBase='/repos/'+login+'/'+repo+'/actions/variables';
 let state=null,createdRef=false,createdVercel=false,envSaved=false,adminSaved=false;
 const postCounts={supabase:0,sql:0,vercel:0,env:0,admin:0,deploy:0};
 globalThis.fetch=async(url,opts={})=>{
  const uri=new URL(url),method=opts.method||'GET',path=uri.pathname+uri.search;
  if(path===variableBase+'/KAIROS_INSTALL_STATE'&&method==='GET')
   return state?reply({value:JSON.stringify(state)}):reply({},404);
  if(path===variableBase&&method==='POST'){
   state=JSON.parse(JSON.parse(opts.body).value);return reply({},201);
  }
  if(path===variableBase+'/KAIROS_INSTALL_STATE'&&method==='PATCH'){
   state=JSON.parse(JSON.parse(opts.body).value);
   const json=JSON.stringify(state);
   for(const k of ['KAIROS_DB_PASSWORD','KAIROS_ADMIN_PASSWORD','KAIROS_VERCEL_TOKEN','KAIROS_SUPABASE_TOKEN'])
    assert.ok(!json.includes(process.env[k]));
   return reply({},204);
  }
  if(path==='/v1/organizations')return reply([{id:org,slug:org}]);
  if(path==='/v1/organizations/'+org)return reply({id:org,plan:'free'});
  if(path==='/v1/projects'&&method==='GET')return reply(createdRef?[{name:repo,ref,id:ref,status:'ACTIVE_HEALTHY',organization_id:org}]:[]);
  if(path==='/v1/projects'&&method==='POST'){
   postCounts.supabase++;createdRef=true;const payload=JSON.parse(opts.body);
   assert.equal(payload.organization_slug,org);assert.equal(payload.name,repo);
   return reply({ref},201);
  }
  if(path==='/v1/projects/'+ref)return reply({ref,status:'ACTIVE_HEALTHY'});
  if(path==='/v1/projects/'+ref+'/database/query'&&method==='POST'){
   postCounts.sql++;assert.ok(JSON.parse(opts.body).query.startsWith('BEGIN;'));
   return reply([],200);
  }
  if(path==='/v2/user')return reply({user:{username:login,id:accountId,billing:{plan:'hobby'}}});
  if(path==='/v9/projects?limit=100')return reply({projects:createdVercel?[{name:'hml-celula-teste',id:projectId}]:[]});
  if(path==='/v11/projects'&&method==='POST'){
   postCounts.vercel++;createdVercel=true;
   assert.equal(JSON.parse(opts.body).gitRepository.repo,login+'/'+repo);
   return reply({id:projectId,accountId},201);
  }
  if(path==='/v1/projects/'+ref+'/api-keys?reveal=true')return reply([{name:'service_role',api_key:'service-role-test-0123456789012345678901234567890'}]);
  if(path==='/v9/projects/'+projectId)return reply({id:projectId,accountId,
   link:{repo:login+'/'+repo,type:'github',repoId:123456789}});
  if(path==='/v10/projects/'+projectId+'/env'&&method==='GET')return reply({envs:envSaved?[{key:'SUPABASE_URL',target:['production']}]:[]});
  if(path==='/v10/projects/'+projectId+'/env'&&method==='POST'){
   postCounts.env++;envSaved=true;
   const items=JSON.parse(opts.body);assert.deepEqual(items.map(i=>i.key),
    ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SESSION_SECRET']);
   return reply({},201);
  }
  if(uri.hostname===ref+'.supabase.co'&&path.startsWith('/rest/v1/app_users')&&method==='GET')return reply(adminSaved?[{id:'one'}]:[]);
  if(uri.hostname===ref+'.supabase.co'&&path==='/rest/v1/app_users'&&method==='POST'){
   postCounts.admin++;adminSaved=true;
   const user=JSON.parse(opts.body);assert.equal(user.login,'administrador');
   assert.ok(user.password_hash.startsWith('scrypt:'));
   return reply({},201);
  }
  if(path==='/v6/deployments?projectId='+projectId+'&limit=10')return reply({deployments:[
   {projectId,target:'production',createdAt:Date.now()+10000,readyState:'READY',
    url:'kairos-hml-celula-teste.vercel.app'}]});
  if(uri.origin===urlBase){
   if(path==='/api/health')return reply({ok:true,ready:true});
   if(path==='/manifest.webmanifest')return reply({display:'standalone'});
   if(path==='/api/me')return reply({ok:false},401);
  }
  throw Error('Unexpected API request '+method+' '+uri.href);
 };
 try{
  await run();
  assert.equal(state.phase,'completed');
  assert.deepEqual(Object.keys(state.steps),['supabase','migrate','vercel','env','bootstrap','deploy','smoke']);
  assert.ok(Object.values(state.steps).every(x=>x.status==='confirmed'));
  assert.deepEqual(postCounts,{supabase:1,sql:1,vercel:1,env:1,admin:1,deploy:0});
  await run();assert.deepEqual(postCounts,{supabase:1,sql:1,vercel:1,env:1,admin:1,deploy:0});
 }finally{
  globalThis.fetch=oldFetch;
  await rm(temp,{recursive:true,force:true});
 }
});