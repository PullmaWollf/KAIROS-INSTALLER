import test from 'node:test';
import assert from 'node:assert/strict';
import {validateDeployHook,triggerProductionDeploy,inspectProductionAfter} from '../provisioner/deploy-hook.js';
const target={teamId:'team_client123',projectId:'prj_client123'};
const hook='https://api.vercel.com/v1/integrations/deploy/prj_client123/token-abcdefghij123456';
const json=(status,body)=>({status,async json(){return body;}});
test('deploy hook preso a projeto confirmado e sem parâmetros',()=>{
 assert.equal(validateDeployHook({hookUrl:hook,projectId:target.projectId}),hook);
 assert.throws(()=>validateDeployHook({hookUrl:'https://evil.example/v1/integrations/deploy/prj_client123/token-abcdefghij123456',projectId:target.projectId}),e=>e.code==='BAD_HOOK');
 assert.throws(()=>validateDeployHook({hookUrl:hook+'?secret=x',projectId:target.projectId}),e=>e.code==='BAD_HOOK');
});
test('disparo de deploy usa POST no hook após verificar projeto',async()=>{
 let posts=0;
 const fetcher=async(url,options)=>{
  if(url.endsWith('/v2/user'))return json(200,{user:{username:'cliente'}});
  if(url.includes('/v2/teams'))return json(200,{teams:[{id:target.teamId,slug:'celula'}]});
  if(url.includes('/v9/projects/'))return json(200,{id:target.projectId,accountId:target.teamId,link:{type:'github',repo:'cliente/kairos'}});
  assert.equal(url,hook);assert.equal(options.method,'POST');posts++;return json(200,{job:{id:'job-123',state:'PENDING'}});
 };
 const out=await triggerProductionDeploy({fetcher,token:'mock',target,repoOwner:'cliente',repoName:'kairos',hookUrl:hook,approved:true});
 assert.equal(posts,1);assert.equal(out.ready,false);assert.equal(out.jobAccepted,true);
});
test('falha no hook não dispara segundo POST',async()=>{
 let posts=0;
 const fetcher=async url=>{
  if(url.endsWith('/v2/user'))return json(200,{user:{username:'cliente'}});
  if(url.includes('/v2/teams'))return json(200,{teams:[{id:target.teamId,slug:'celula'}]});
  if(url.includes('/v9/projects/'))return json(200,{id:target.projectId,accountId:target.teamId,link:{type:'github',repo:'cliente/kairos'}});
  posts++;throw Error('socket');
 };
 await assert.rejects(triggerProductionDeploy({fetcher,token:'mock',target,repoOwner:'cliente',repoName:'kairos',hookUrl:hook,approved:true}),e=>e.code==='DEPLOY_UNCERTAIN');
 assert.equal(posts,1);
});
test('inspeção exige deploy posterior à configuração',async()=>{
 const now=1760000000000;
 const fetcher=async()=>json(200,{deployments:[{projectId:target.projectId,target:'production',readyState:'READY',createdAt:now-1,url:'cell.vercel.app'}]});
 assert.equal((await inspectProductionAfter({fetcher,token:'mock',target,after:now})).ready,false);
});
