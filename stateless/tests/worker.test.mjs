import test from 'node:test';
import assert from 'node:assert/strict';
const login='okarakimoto',name='kairos-hml-celula-teste';
Object.assign(process.env,{
 KAIROS_GITHUB_REPO:login+'/'+name,
 KAIROS_GITHUB_AUTOMATION_TOKEN:'ghs_test_github_token_12345678',
 KAIROS_SUPABASE_TOKEN:'sbp_test_supabase_token_123456',
 KAIROS_VERCEL_TOKEN:'vct_test_vercel_token_1234567',
 KAIROS_ADMIN_PASSWORD:'super-long-random-password-12345678',
 KAIROS_DB_PASSWORD:'super-long-db-password-12345678',
 KAIROS_SUPABASE_ORG:'naebjiwsisztseydpupg',
 KAIROS_VERCEL_SCOPE:'personal_x4YO1nK4AxoR8npqTQwx9DNt',
 KAIROS_CELL_NAME:'HML Célula Teste',
 KAIROS_PROJECT_SLUG:'hml-celula-teste',
 KAIROS_REGION:'sa-east-1',
 KAIROS_ADMIN_LOGIN:'administrador'
});
const {run}=await import('../worker/kairos-bootstrap.mjs');
function reply(body,status=200){return {status,json:async()=>body};}

test('a failed SQL preparation never re-creates Supabase: first claim is persisted to customer GitHub',async()=>{
 let state=null,created=0,sqlPosts=0;const steps=[];
 const key='/repos/'+login+'/'+name+'/actions/variables/KAIROS_INSTALL_STATE';
 const oldFetch=globalThis.fetch;
 globalThis.fetch=async(url,opts={})=>{
  const p=new URL(url),method=opts.method||'GET',path=p.pathname+p.search;
  if(path===key&&method==='GET')return state?reply({name:'KAIROS_INSTALL_STATE',value:JSON.stringify(state)}):reply({},404);
  if(path===key.replace('/KAIROS_INSTALL_STATE','')&&method==='POST'){
   assert.equal(state,null);state=JSON.parse(JSON.parse(opts.body).value);steps.push(state.phase);return reply({},201);
  }
  if(path===key&&method==='PATCH'){
   const body=JSON.parse(opts.body);state=JSON.parse(body.value);steps.push(state.phase);
   const encoded=JSON.stringify(body);
   for(const password of [process.env.KAIROS_ADMIN_PASSWORD,process.env.KAIROS_SUPABASE_TOKEN,
    process.env.KAIROS_VERCEL_TOKEN,process.env.KAIROS_DB_PASSWORD])
    assert.ok(!encoded.includes(password),'provider tokens never go into GitHub variables');
   return reply({},204);
  }
  if(path==='/v1/organizations')return reply([{id:process.env.KAIROS_SUPABASE_ORG,slug:process.env.KAIROS_SUPABASE_ORG}]);
  if(path==='/v1/projects'&&method==='GET')return reply(created?[{name,ref:'abcdefghijklmnopq',status:'ACTIVE_HEALTHY',organization_id:process.env.KAIROS_SUPABASE_ORG}]:[]);
  if(path==='/v1/organizations/'+process.env.KAIROS_SUPABASE_ORG)return reply({id:process.env.KAIROS_SUPABASE_ORG,plan:'free'});
  if(path==='/v2/user')return reply({user:{username:login,id:'x4YO1nK4AxoR8npqTQwx9DNt',billing:{plan:'hobby'}}});
  if(path==='/v1/projects'&&method==='POST'){
   created++;
   assert.equal(JSON.parse(opts.body).organization_slug,process.env.KAIROS_SUPABASE_ORG);
   return reply({ref:'abcdefghijklmnopq'},201);
  }
  if(path==='/v1/projects/abcdefghijklmnopq')return reply({ref:'abcdefghijklmnopq',status:'ACTIVE_HEALTHY'});
  if(path.includes('/database/query')){sqlPosts++;throw Error('must never write SQL from missing files');}
  throw Error('unexpected fake '+method+' '+path);
 };
 try{
  await assert.rejects(run(),e=>e.code==='ENOENT');
  assert.equal(created,1);
  assert.equal(state.steps.supabase.status,'confirmed');
  assert.equal(state.steps.migrate.status,'started');
  await assert.rejects(run(),e=>e.code==='MANUAL_REVIEW_REQUIRED');
  assert.equal(created,1);
  assert.equal(sqlPosts,0);
  assert.ok(steps.includes('supabase'));
 }finally{globalThis.fetch=oldFetch;}
});