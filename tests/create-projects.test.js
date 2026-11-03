import test from 'node:test';
import assert from 'node:assert/strict';
import {supabaseProjectPlan,vercelProjectPlan,createSupabaseProject,createVercelProject} from '../provisioner/create-projects.js';
const data=(status,payload)=>({status,async json(){return payload;}});
const supabase={organizationId:'org_123456',projectName:'celula-exemplo',region:'sa-east-1'};
const vercel={teamId:'team_123456',projectName:'celula-exemplo',repoOwner:'conta-celula',repoName:'app-celula'};
test('simulação valida destino sem credenciais',()=>{
 assert.equal(supabaseProjectPlan(supabase).mayIncurCharges,true);
 assert.equal(vercelProjectPlan(vercel).repository,'conta-celula/app-celula');
 assert.throws(()=>vercelProjectPlan({...vercel,repoOwner:'PullmaWollf'}),e=>e.code==='MAINTAINER_ACCOUNT');
 assert.throws(()=>supabaseProjectPlan({...supabase,region:'whatever'}),e=>e.code==='BAD_REGION');
});
test('operações não executam POST sem consentimento',async()=>{
 const fetcher=()=>{throw Error('network must not be used')};
 await assert.rejects(createSupabaseProject({fetcher,plan:supabase,dbPassword:'x'.repeat(32)}),e=>e.code==='CONSENT');
 await assert.rejects(createVercelProject({fetcher,plan:vercel}),e=>e.code==='CONSENT');
});
test('Supabase usa somente organização da célula, e não retorna senha',async()=>{
 let calls=[];
 const fetcher=async(url,opts)=>{
  calls.push([url,opts.method,opts.body?JSON.parse(opts.body):null]);
  return url.endsWith('/organizations')?data(200,[{id:'org_123456',slug:'comunidade-testes',name:'Comunidade'}]):data(201,{id:'project-id-other',ref:'abcdefghijklmno'});
 };
 const r=await createSupabaseProject({fetcher,token:'mock',plan:supabase,dbPassword:'q'.repeat(24),approved:true});
 assert.equal(calls.length,2);assert.equal(calls[0][1],'GET');assert.equal(calls[1][1],'POST');
 assert.equal(calls[1][2].organization_slug,'comunidade-testes');assert.equal(calls[1][2].db_pass,'q'.repeat(24));
 assert.equal(r.projectRef,'abcdefghijklmno');assert.equal(JSON.stringify(r).includes('qqqqqq'),false);
});
test('Vercel usa teamId próprio e GitHub do cliente',async()=>{
 let calls=[];
 const fetcher=async(url,opts)=>{
  calls.push([url,opts.method,opts.body?JSON.parse(opts.body):null]);
  if(url.endsWith('/v2/user'))return data(200,{user:{username:'operador'}});
  if(url.includes('/v2/teams'))return data(200,{teams:[{id:'team_123456',slug:'celula'}]});
  return data(201,{id:'prj_123456',accountId:'team_123456'});
 };
 const r=await createVercelProject({fetcher,token:'mock',plan:vercel,approved:true});
 assert.equal(calls.length,3);assert.deepEqual(calls.map(x=>x[1]),['GET','GET','POST']);
 assert.match(calls[2][0],/teamId=team_123456/);assert.equal(calls[2][2].gitRepository.repo,'conta-celula/app-celula');
 assert.equal(r.next,'environment-and-deploy-pending');
});
test('falhas de rede exigem conferir painel antes de repetir',async()=>{
 const fetcher=async(url)=>{
  if(url.endsWith('/organizations'))return data(200,[{id:'org_123456',slug:'comunidade-testes',name:'Comunidade'}]);
  throw Error('raw secret');
 };
 await assert.rejects(createSupabaseProject({fetcher,token:'mock',plan:supabase,dbPassword:'q'.repeat(24),approved:true}),e=>e.code==='NETWORK'&&!e.message.includes('raw secret'));
});
