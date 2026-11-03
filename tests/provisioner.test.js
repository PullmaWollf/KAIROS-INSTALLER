import test from 'node:test';
import assert from 'node:assert/strict';
import {validatePlan,buildPlan,ProvisioningError} from '../provisioner/plan.js';
import {preflightGithub,createGithubFromTemplate} from '../provisioner/github.js';
const input={owner:'celula-exemplo',repository:'minha-celula',cellName:'Célula Esperança',visibility:'private'};
const json=(status,body)=>({status,async json(){return body;}});
test('o plano aceita somente campos públicos e target diferente do mantenedor',()=>{
 assert.equal(validatePlan(input).owner,'celula-exemplo');
 assert.throws(()=>validatePlan({...input,owner:'PullmaWollf'}),e=>e.code==='MAINTAINER_ACCOUNT');
 assert.throws(()=>validatePlan({...input,service_role:'segredo'}),e=>e.code==='UNKNOWN_FIELD');
 assert.throws(()=>validatePlan({...input,repository:'../p'}),ProvisioningError);
 assert.equal(buildPlan(input).actions.filter(x=>x.status==='not-implemented').length,4);
});
test('preflight impede token de outra pessoa e template desativado',async()=>{
 let called=0;
 const fetcher=async()=>{called++;return json(200,{login:'outra-conta'});};
 await assert.rejects(preflightGithub({fetcher,token:'mock',plan:input}),e=>e.code==='WRONG_OWNER');
 assert.equal(called,1);
 const f2=async url=>json(200,url.endsWith('/user')?{login:input.owner}:{is_template:false,full_name:'PullmaWollf/KAIROS-CORE'});
 await assert.rejects(preflightGithub({fetcher:f2,token:'mock',plan:input}),e=>e.code==='NOT_TEMPLATE');
});
test('preflight aceita somente template oficial e conta confirmada',async()=>{
 const fetcher=async url=>json(200,url.endsWith('/user')?{login:input.owner}:{is_template:true,full_name:'PullmaWollf/KAIROS-CORE'});
 assert.deepEqual(await preflightGithub({fetcher,token:'mock',plan:input}),{owner:input.owner,source:'PullmaWollf/KAIROS-CORE',ready:true});
});
test('criação envia owner da célula e repositório privado, nunca mantenedor',async()=>{
 let body,endpoint,auth;
 const fetcher=async (url,opts)=>{endpoint=url;body=JSON.parse(opts.body);auth=opts.headers.Authorization;return json(201,{full_name:input.owner+'/'+input.repository,owner:{login:input.owner},html_url:'https://github.com/'+input.owner+'/'+input.repository,private:true});};
 const r=await createGithubFromTemplate({fetcher,token:'mock',plan:input});
 assert.equal(body.owner,input.owner);
 assert.equal(body.private,true);
 assert.match(endpoint,/PullmaWollf\/KAIROS-CORE\/generate$/);
 assert.equal(auth,'Bearer mock');
 assert.equal(r.private,true);
});
test('erros do GitHub ocultam detalhes do token',async()=>{
 const fetcher=async()=>json(403,{message:'contains secret'});
 await assert.rejects(preflightGithub({fetcher,token:'private-value',plan:input}),e=>e.code==='GITHUB_PERMISSION'&&!e.message.includes('private-value'));
});
