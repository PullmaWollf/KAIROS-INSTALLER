import test from 'node:test';
import assert from 'node:assert/strict';
import {randomBytes} from 'node:crypto';
import {vercelScope,vercelQuery,personalAccountId} from '../provisioner/vercel-scope.js';
import {discoverVercelTeams,connectVercel,readVercelConnection} from '../control/vercel-connection.js';
import {createVercelProject} from '../provisioner/create-projects.js';
import {checkDeployment} from '../provisioner/deployment.js';
import {ensureCellDomain} from '../provisioner/cell-domain.js';
import {reconcileVercel} from '../provisioner/reconcile.js';
import {encryptControl} from '../control/crypto.js';

const team='team_client123456',person='personal_uid_customer123456',user='uid_customer123456';
const token='customer-secret-for-ci-only-123456';
const project='prj_personal123456';
const env={KAIROS_CONTROL_ENCRYPTION_KEY:randomBytes(32).toString('base64url'),
 KAIROS_VERCEL_TEAM_ID:'team_installer123456'};
const identity={user:{id:user,username:'customer'}};
test('Vercel personal accounts never generate a teamId query parameter',()=>{
 assert.deepEqual(vercelScope(person),{kind:'personal',accountId:person,providerAccountId:user});
 assert.equal(vercelQuery(person),'');
 assert.equal(vercelQuery(person,{limit:1}),'?limit=1');
 assert.equal(vercelQuery(team,{limit:1}),'?teamId='+team+'&limit=1');
 assert.equal(personalAccountId(identity.user),person);
 assert.throws(()=>vercelScope('personal_invalid'),{code:'BAD_TARGET'});
});
test('personal-only token is discovered without Vercel team membership',async()=>{
 let gets=0;
 const fetcher=async(url,opts)=>{
  gets++;assert.equal(opts.method,'GET');assert.equal(opts.headers.Authorization,'Bearer '+token);
  if(url.includes('/v2/teams?'))return {status:200,json:async()=>({teams:[]})};
  if(url.endsWith('/v2/user'))return {status:200,json:async()=>identity};
  if(url.endsWith('/v9/projects?limit=1'))return {status:200,json:async()=>({projects:[]})};
  throw Error('wrong endpoint');
 };
 const discovered=await discoverVercelTeams({userId:42,payload:{accessToken:token},env,fetcher});
 assert.equal(gets,3);assert.deepEqual(discovered,{teams:[{teamId:person,name:'Minha conta Vercel',slug:'customer'}],hasMore:false});
 assert.equal(JSON.stringify(discovered).includes(token),false);
});
test('personal customer credential is encrypted and bound to user ID',async()=>{
 let envelope=null;
 const db={async saveConnection(_id,_provider,value){envelope=value;},
  async connection(){return envelope;}};
 const fetcher=async(url,opts)=>{
  assert.equal(opts.method,'GET');assert.equal(opts.headers.Authorization,'Bearer '+token);
  assert.equal(url.includes('teamId='),false);
  if(url.endsWith('/v2/user'))return {status:200,json:async()=>identity};
  if(url.endsWith('/v9/projects?limit=1'))return {status:200,json:async()=>({projects:[]})};
  throw Error('unexpected');
 };
 const result=await connectVercel({db,userId:42,payload:{teamId:person,accessToken:token},env,fetcher});
 assert.equal(result.teamId,person);assert.equal(envelope.includes(token),false);
 assert.equal((await readVercelConnection({db,userId:42,env})).teamId,person);
 assert.equal(JSON.stringify(result).includes(token),false);
});
test('personal project creation uses owner account, never team query',async()=>{
 let posts=0;
 const fetcher=async(url,opts)=>{
  if(url.endsWith('/v2/user'))return {status:200,json:async()=>identity};
  if(url.endsWith('/v9/projects?limit=1'))return {status:200,json:async()=>({projects:[]})};
  if(url==='https://api.vercel.com/v11/projects'){
   posts++;assert.equal(opts.method,'POST');
   assert.equal(JSON.parse(opts.body).gitRepository.repo,'customer/kairos-celula');
   return {status:201,json:async()=>({id:project,accountId:user})};
  }
  throw Error('unexpected URL '+url);
 };
 const result=await createVercelProject({fetcher,token,approved:true,
  plan:{teamId:person,projectName:'celula-esperanca',repoOwner:'customer',repoName:'kairos-celula'}});
 assert.equal(result.projectId,project);assert.equal(posts,1);
});
test('domain and deployment verification remain scoped to personal project',async()=>{
 let posts=0;
 const fetcher=async(url,opts)=>{
  assert.equal(url.includes('teamId='),false);
  if(opts.method==='POST')posts++;
  if(url.includes('/v9/projects/')&&url.includes('/domains'))return {status:200,json:async()=>({
   domains:[{name:'celula-esperanca.vercel.app',projectId:project}]})};
  if(url.includes('/v9/projects/'))return {status:200,json:async()=>({id:project,accountId:user})};
  if(url.includes('/v6/deployments'))return {status:200,json:async()=>({deployments:[{
   projectId:project,target:'production',readyState:'READY',url:'demo.vercel.app',createdAt:42}]})};
  throw Error('unexpected: '+url);
 };
 const linked=await ensureCellDomain({fetcher,token,teamId:person,projectId:project,cellName:'Célula Esperança'});
 assert.equal(linked.status,'linked');assert.equal(posts,0);
 const deployment=await checkDeployment({fetcher,token,target:{teamId:person,projectId:project}});
 assert.equal(deployment.ready,true);
});
test('personal reconciliation rejects projects from other owners',async()=>{
 const fetcher=async()=>({status:200,json:async()=>({
  id:project,accountId:'uid_unrelated',name:'celula-esperanca',
  link:{type:'github',repo:'customer/kairos-celula'}})});
 await assert.rejects(reconcileVercel({fetcher,token,teamId:person,
  projectName:'celula-esperanca',repository:'customer/kairos-celula'}),{code:'WRONG_OWNER'});
});
test('personal token cannot impersonate a different personal user',async()=>{
 const fetcher=async(url)=>{
  if(url.endsWith('/v2/user'))return {status:200,json:async()=>identity};
  return {status:200,json:async()=>({projects:[]})};
 };
 await assert.rejects(connectVercel({db:{async saveConnection(){throw Error('must not save')}},
  userId:42,payload:{teamId:'personal_uid_otheruser9999',accessToken:token},env,fetcher}),
  {code:'VERCEL_VERIFICATION_FAILED'});
});
