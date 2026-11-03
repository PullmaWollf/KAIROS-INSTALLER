import test from 'node:test';
import assert from 'node:assert/strict';
import {environmentPlan,configureVercelEnvironment,validateSecrets} from '../provisioner/vercel-env.js';
import {migrationPlan,migrateSupabase} from '../provisioner/migrations.js';
import {checkDeployment} from '../provisioner/deployment.js';
const response=(status,body)=>({status,async json(){return body;}});
const target={teamId:'team_example',projectId:'prj_example123',repoOwner:'minha-celula',repoName:'app'};
const secrets={SUPABASE_URL:'https://abcdef123456.supabase.co',SUPABASE_SERVICE_ROLE_KEY:'s'.repeat(40),SESSION_SECRET:'x'.repeat(64)};
test('segredos só entram no payload; resultado não inclui valores',async()=>{
 assert.equal(environmentPlan(target).overwrites,false);
 assert.equal(validateSecrets(secrets).length,3);
 await assert.rejects(configureVercelEnvironment({target,secrets,token:'mock'}),e=>e.code==='CONSENT');
 let post;
 const fetcher=async(url,opts)=>{
  if(url.endsWith('/v2/user'))return response(200,{user:{username:'usuario-celula'}});
  if(url.includes('/v2/teams'))return response(200,{teams:[{id:'team_example',slug:'casa'}]});
  if(url.includes('/v9/projects'))return response(200,{id:target.projectId,accountId:target.teamId,link:{type:'github',repo:'minha-celula/app'}});
  if(opts.method==='GET')return response(200,{envs:[]});
  post=JSON.parse(opts.body);return response(201,{created:post.map(x=>({key:x.key}))});
 };
 const data=await configureVercelEnvironment({fetcher,target,token:'mock',secrets,approved:true});
 assert.deepEqual(data.keys,['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SESSION_SECRET']);
 assert.equal(post.every(x=>x.type==='encrypted'&&x.target.includes('production')),true);
 assert.equal(JSON.stringify(data).includes(secrets.SESSION_SECRET),false);
});
test('não sobrescreve variáveis e bloqueia repo do mantenedor',async()=>{
 assert.throws(()=>environmentPlan({...target,repoOwner:'PullmaWollf'}),e=>e.code==='MAINTAINER_ACCOUNT');
 const fetcher=async(url,opts)=>{
  if(url.endsWith('/v2/user'))return response(200,{user:{username:'usuario'}});
  if(url.includes('/v2/teams'))return response(200,{teams:[{id:target.teamId,slug:'celula'}]});
  if(url.includes('/v9/projects'))return response(200,{id:target.projectId,accountId:target.teamId,link:{type:'github',repo:'minha-celula/app'}});
  if(opts.method==='POST')throw Error('never write existing');
  return response(200,{envs:[{key:'SESSION_SECRET',target:['production']}]});
 };
 await assert.rejects(configureVercelEnvironment({fetcher,target,token:'mock',secrets,approved:true}),e=>e.code==='EXISTS');
});
test('migração exige repositório da célula e respeita dry-run',async()=>{
 assert.throws(()=>migrationPlan({projectRef:'abcdefghij',repoOwner:'PullmaWollf',coreDir:'/tmp/core'}),e=>e.code==='MAINTAINER_ACCOUNT');
 const plan=migrationPlan({projectRef:'abcdefghij',repoOwner:'celula',coreDir:'/tmp/core'});
 assert.deepEqual(plan.link,['link','--project-ref','abcdefghij']);
 assert.deepEqual(plan.preview,['db','push','--linked','--dry-run']);
 assert.equal(plan.apply.includes('--yes'),true);
});
test('deployment consulta GET e requer production READY',async()=>{
 const fetcher=async(url,opts)=>{assert.equal(opts.method,'GET');return response(200,{deployments:[{projectId:target.projectId,target:'production',readyState:'READY',url:'celula-abc.vercel.app'}]});};
 const d=await checkDeployment({fetcher,token:'mock',target});
 assert.equal(d.ready,true);assert.equal(d.url,'https://celula-abc.vercel.app');
});
test('deployment não aceita domínios arbitrários',async()=>{
 const fetcher=async()=>response(200,{deployments:[{projectId:target.projectId,target:'production',readyState:'READY',url:'evil.example'}]});
 const d=await checkDeployment({fetcher,token:'mock',target});
 assert.equal(d.url,null);
});
