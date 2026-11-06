// KAIRÓS — worker isolado por célula.
// Este arquivo é instalado DENTRO do repositório privado do cliente.
// Nenhum serviço do Installer ou banco central é consultado durante a execução.
import {randomBytes,scrypt as scryptCb} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
const scrypt=promisify(scryptCb);
const GITHUB='https://api.github.com',SUPABASE='https://api.supabase.com',VERCEL='https://api.vercel.com';
const STATE_NAME='KAIROS_INSTALL_STATE';
const STEP_NAMES=['supabase','migrate','vercel','env','bootstrap','deploy','smoke'];
const repoRx=/^[a-z0-9-]{1,39}\/kairos-hml-[a-z0-9][a-z0-9-]{2,44}$/i;
const scopeRx=/^(?:team_[a-z0-9_-]{6,54}|personal_[a-z0-9_-]{6,54})$/i;
const statusError=(code)=>Object.assign(new Error(code),{code});
const e=(key)=>process.env[key]||'';
const githubRepo=e('KAIROS_GITHUB_REPO');
const plan=Object.freeze({
 repo:githubRepo,org:e('KAIROS_SUPABASE_ORG'),vercel:e('KAIROS_VERCEL_SCOPE'),
 cell:e('KAIROS_CELL_NAME'),project:e('KAIROS_PROJECT_SLUG'),region:e('KAIROS_REGION'),
 admin:e('KAIROS_ADMIN_LOGIN')
});
const secrets={github:e('KAIROS_GITHUB_AUTOMATION_TOKEN'),supabase:e('KAIROS_SUPABASE_TOKEN'),
 vercel:e('KAIROS_VERCEL_TOKEN'),admin:e('KAIROS_ADMIN_PASSWORD'),db:e('KAIROS_DB_PASSWORD')};
const ghPath='/repos/'+githubRepo;
function verifyScope(){
 if(!repoRx.test(githubRepo)||githubRepo.split('/')[0].toLowerCase()==='pullmawollf'||
  !/^[a-z0-9_-]{4,64}$/i.test(plan.org)||!scopeRx.test(plan.vercel)||
  !/^hml-[a-z0-9-]{3,55}$/.test(plan.project)||
  !/^HML(?:\s|-)/i.test(plan.cell)||!['sa-east-1','us-east-1','us-west-1','eu-west-1','eu-central-1'].includes(plan.region)||
  !/^[a-z0-9._-]{3,40}$/.test(plan.admin)||
  Object.values(secrets).some(t=>t.length<20))throw statusError('SCOPE_OR_TOKEN_INVALID');
}
function vercelScope(){return plan.vercel.startsWith('team_')?'?teamId='+encodeURIComponent(plan.vercel):'';}
function providerId(){return plan.vercel.startsWith('personal_')?plan.vercel.slice(9):plan.vercel;}
async function request(provider,path,{method='GET',body,accepted=[200],timeout=30000}={}){
 const base={github:GITHUB,supabase:SUPABASE,vercel:VERCEL}[provider];
 const token=secrets[provider];
 if(!base||!token||!path.startsWith('/')||path.includes('://'))throw statusError('BAD_PROVIDER_REQUEST');
 let r;
 try{r=await fetch(base+path,{method,redirect:'error',signal:AbortSignal.timeout(timeout),
  headers:{Authorization:'Bearer '+token,Accept:'application/json',
   ...(provider==='github'?{'X-GitHub-Api-Version':'2022-11-28'}:{}),
   ...(body!==undefined?{'Content-Type':'application/json'}:{})},
  ...(body!==undefined?{body:JSON.stringify(body)}:{})});}
 catch{throw statusError(method==='GET'?'READ_FAILED':'REMOTE_UNCERTAIN');}
 if(!accepted.includes(r?.status))throw statusError(method==='GET'?'READ_FAILED':'REMOTE_UNCERTAIN');
 if(r.status===204)return null;
 try{return await r.json();}catch{throw statusError('INVALID_RESPONSE');}
}
let state;
async function persist(){
 const data={name:STATE_NAME,value:JSON.stringify(state)};
 const options={method:state.persisted?'PATCH':'POST',
  body:state.persisted?{value:data.value}:data,accepted:state.persisted?[204]:[201]};
 await request('github',ghPath+'/actions/variables'+(state.persisted?'/'+STATE_NAME:''),options);
 state.persisted=true;
}
async function readState(){
 let res;
 try{res=await fetch(GITHUB+ghPath+'/actions/variables/'+STATE_NAME,{method:'GET',redirect:'error',
  signal:AbortSignal.timeout(15000),headers:{Authorization:'Bearer '+secrets.github,Accept:'application/json'}});}
 catch{throw statusError('CHECKPOINT_READ_FAILED');}
 if(res.status===404){state={version:1,plan,phase:'new',steps:{},createdAt:new Date().toISOString(),persisted:false};await persist();return;}
 if(res.status!==200)throw statusError('CHECKPOINT_READ_FAILED');
 let raw;try{raw=await res.json();state=JSON.parse(raw.value);}catch{throw statusError('CHECKPOINT_CORRUPT');}
 if(state.version!==1||JSON.stringify(state.plan)!==JSON.stringify(plan)||!state.steps||
  state.phase==='needs_review')throw statusError('MANUAL_REVIEW_REQUIRED');
 state.persisted=true;
}
function confirmed(name){return state.steps[name]?.status==='confirmed';}
async function claim(name){
 if(!STEP_NAMES.includes(name))throw statusError('BAD_STEP');
 const prev=state.steps[name];
 if(prev?.status==='confirmed')return false;
 if(prev)throw statusError('MANUAL_REVIEW_REQUIRED');
 state.steps[name]={status:'started',at:new Date().toISOString()};
 state.phase=name;
 await persist(); // DURABLE claim before external POST
 return true;
}
async function finish(name,receipt={}){
 if(state.steps[name]?.status!=='started')throw statusError('BAD_STEP');
 state.steps[name]={status:'confirmed',at:state.steps[name].at,
  finishedAt:new Date().toISOString(),receipt};
 state.phase=name;
 await persist();
}
async function checkFree(){
 const [orgs,projects,user]=await Promise.all([
  request('supabase','/v1/organizations'),
  request('supabase','/v1/projects'),
  request('vercel','/v2/user')
 ]);
 const org=Array.isArray(orgs)?orgs.find(x=>x.id===plan.org):null;
 if(!org?.slug)throw statusError('SUPABASE_SCOPE_DENIED');
 const details=await request('supabase','/v1/organizations/'+encodeURIComponent(org.slug));
 if(details.id!==plan.org||String(details.plan).toLowerCase()!=='free'||!Array.isArray(projects))
  throw statusError('SUPABASE_NOT_FREE');
 if(projects.some(x=>!x||typeof x.status!=='string'))throw statusError('QUOTA_UNKNOWN');
 const active=projects.filter(x=>!['PAUSED','INACTIVE'].includes(x.status.toUpperCase()));
 const existing=state.steps.supabase?.receipt?.projectRef;
 const own=typeof existing==='string'&&active.some(x=>
  (x.ref===existing||x.id===existing)&&(x.organization_id===plan.org||x.organization_slug===org.slug));
 if(active.length>=2&&!(active.length===2&&own))throw statusError('SUPABASE_QUOTA_FULL');
 if(user.user?.username?.toLowerCase()!==githubRepo.split('/')[0].toLowerCase()||
    user.user?.billing?.plan!=='hobby')throw statusError('VERCEL_NOT_FREE_OR_WRONG_OWNER');
 if(plan.vercel.startsWith('personal_')){
  if('personal_'+user.user.id!==plan.vercel)throw statusError('VERCEL_SCOPE_DENIED');
 }else{
  const team=await request('vercel','/v2/teams/'+encodeURIComponent(plan.vercel));
  if(team.id!==plan.vercel||team.billing?.plan!=='hobby')throw statusError('VERCEL_TEAM_NOT_FREE');
 }
 return {orgSlug:org.slug};
}
async function waitProject(ref){
 for(let n=0;n<45;n++){
  const data=await request('supabase','/v1/projects/'+ref);
  if(data.ref===ref&&data.status==='ACTIVE_HEALTHY')return;
  if(n!==44)await new Promise(r=>setTimeout(r,12000));
 }
 throw statusError('PROJECT_NOT_READY');
}
async function supabasePhase(orgSlug){
 if(confirmed('supabase'))return;
 const projects=await request('supabase','/v1/projects');
 if(projects.some(x=>x.name===plan.repo.split('/')[1]&&(x.organization_id===plan.org||x.organization_slug===orgSlug)))
  throw statusError('PROJECT_ALREADY_EXISTS_REVIEW_REQUIRED');
 if(!await claim('supabase'))return;
 const result=await request('supabase','/v1/projects',{method:'POST',accepted:[200,201],
  body:{name:plan.repo.split('/')[1],organization_slug:orgSlug,region:plan.region,db_pass:secrets.db}});
 if(!/^[a-z0-9]{8,32}$/i.test(result.ref||''))throw statusError('PROJECT_CREATION_UNCERTAIN');
 await finish('supabase',{projectRef:result.ref});
}
async function migratePhase(ref){
 if(confirmed('migrate'))return;
 if(!await claim('migrate'))return;
 const names=['20261103000000_kairos_initial.sql','20261103010000_kairos_login_throttle.sql'];
 const sql=[];
 for(const name of names){
  const source=await readFile(new URL('../../supabase/migrations/'+name,import.meta.url),'utf8');
  if(!source.includes('row level security')||source.length>20000)throw statusError('MIGRATION_UNTRUSTED');
  sql.push(source);
 }
 await request('supabase','/v1/projects/'+ref+'/database/query',{method:'POST',
  body:{query:'BEGIN;\n'+sql.join('\n\n')+'\nCOMMIT;',read_only:false},timeout:60000});
 await finish('migrate',{});
}
async function vercelPhase(){
 if(confirmed('vercel'))return;
 const listing=await request('vercel','/v9/projects'+vercelScope()+(vercelScope()?'&':'?')+'limit=100');
 if(!Array.isArray(listing.projects))throw statusError('VERCEL_LIST_UNAVAILABLE');
 if(listing.projects.some(x=>x.name===plan.project))throw statusError('VERCEL_PROJECT_ALREADY_EXISTS');
 if(!await claim('vercel'))return;
 const result=await request('vercel','/v11/projects'+vercelScope(),{method:'POST',accepted:[200,201],
  body:{name:plan.project,framework:null,gitRepository:{type:'github',repo:plan.repo}}});
 if(!/^prj_[a-z0-9_-]+$/i.test(result.id||'')||result.accountId!==providerId())
  throw statusError('VERCEL_CREATION_UNCERTAIN');
 await finish('vercel',{projectId:result.id});
}
async function serviceKey(ref,orgSlug){
 const list=await request('supabase','/v1/projects');
 if(!list.some(x=>(x.ref===ref||x.id===ref)&&
  (x.organization_id===plan.org||x.organization_slug===orgSlug)))throw statusError('SUPABASE_WRONG_OWNER');
 const keys=await request('supabase','/v1/projects/'+ref+'/api-keys?reveal=true');
 if(!Array.isArray(keys))throw statusError('SERVICE_KEY_MISSING');
 const candidates=keys.filter(x=>x.name==='service_role'||x.type==='secret'&&x.secret_jwt_template?.role==='service_role')
  .map(x=>x.api_key||x.value||x.key).filter(x=>typeof x==='string'&&x.length>20);
 if(candidates.length!==1)throw statusError('SERVICE_KEY_MISSING');
 return candidates[0];
}
async function envPhase(projectId,ref,privateKey){
 if(confirmed('env'))return;
 const path='/v10/projects/'+projectId+'/env'+vercelScope();
 const project=await request('vercel','/v9/projects/'+projectId+vercelScope());
 if(project.id!==projectId||project.accountId!==providerId()||
  project.link?.type!=='github'||String(project.link.repo||'').toLowerCase()!==plan.repo.toLowerCase())
  throw statusError('VERCEL_REPO_LINK_WRONG');
 const old=await request('vercel',path);
 const needed=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SESSION_SECRET'];
 if(!Array.isArray(old.envs)||old.envs.some(x=>needed.includes(x.key)&&x.target?.includes('production')))
  throw statusError('VERCEL_ENV_ALREADY_EXISTS');
 if(!await claim('env'))return;
 await request('vercel',path,{method:'POST',accepted:[200,201],body:[
  {key:'SUPABASE_URL',value:'https://'+ref+'.supabase.co',type:'encrypted',target:['production']},
  {key:'SUPABASE_SERVICE_ROLE_KEY',value:privateKey,type:'encrypted',target:['production']},
  {key:'SESSION_SECRET',value:randomBytes(48).toString('base64url'),type:'encrypted',target:['production']}
 ]});
 await finish('env',{});
}
async function rest(ref,key,path,body){
 let r;
 try{r=await fetch('https://'+ref+'.supabase.co'+path,{method:body?'POST':'GET',
  redirect:'error',signal:AbortSignal.timeout(15000),headers:{apikey:key,Authorization:'Bearer '+key,
   Accept:'application/json',...(body?{'Content-Type':'application/json',Prefer:'return=minimal'}:{})},
   ...(body?{body:JSON.stringify(body)}:{})});}
 catch{throw statusError('CUSTOMER_DB_UNCERTAIN');}
 if(r?.status<200||r.status>=300)throw statusError('CUSTOMER_DB_UNCERTAIN');
 if(body)return null;
 try{return await r.json();}catch{throw statusError('CUSTOMER_DB_BAD_RESPONSE');}
}
async function bootstrapPhase(ref,key){
 if(confirmed('bootstrap'))return;
 const list=await rest(ref,key,'/rest/v1/app_users?role=eq.admin&select=id&limit=1');
 if(!Array.isArray(list)||list.length)throw statusError('ADMIN_EXISTS_REVIEW');
 if(!await claim('bootstrap'))return;
 const salt=randomBytes(16).toString('hex');
 const hash=await scrypt(secrets.admin,salt,64);
 await rest(ref,key,'/rest/v1/app_users',{name:'Administrador',login:plan.admin,role:'admin',
  password_hash:'scrypt:'+salt+':'+hash.toString('hex')});
 await finish('bootstrap',{});
}
async function deploymentCheck(projectId,notBefore){
 const data=await request('vercel','/v6/deployments'+vercelScope()+
  (vercelScope()?'&':'?')+'projectId='+encodeURIComponent(projectId)+'&limit=10');
 if(!Array.isArray(data.deployments))throw statusError('DEPLOY_LIST_BAD_RESPONSE');
 return data.deployments.find(x=>x.projectId===projectId&&x.target==='production'&&
  Number(x.createdAt)>notBefore&&x.readyState==='READY'&&
  /^[a-z\d.-]+\.vercel\.app$/i.test(x.url||''));
}
async function deployPhase(projectId){
 if(confirmed('deploy'))return;
 const envAt=Date.parse(state.steps.env?.finishedAt||'');
 if(!Number.isFinite(envAt))throw statusError('ENV_NOT_READY');
 const found=await deploymentCheck(projectId,envAt);
 if(found){await claim('deploy');await finish('deploy',{url:'https://'+found.url});return;}
 if(!await claim('deploy'))return;
 // Explicit POST only once; an uncertain remote response MUST NOT be repeated.
 const project=await request('vercel','/v9/projects/'+projectId+vercelScope());
 const repoId=Number(project.link?.repoId);
 if(!Number.isSafeInteger(repoId)||repoId<=0||
  String(project.link.repo||'').toLowerCase()!==plan.repo.toLowerCase())
  throw statusError('VERCEL_LINK_UNVERIFIED');
 await request('vercel','/v13/deployments'+vercelScope(),{method:'POST',accepted:[200,201,202],
  body:{name:plan.project,project:projectId,target:'production',
   gitSource:{type:'github',repoId,ref:'main'}}});
 for(let i=0;i<35;i++){
  await new Promise(r=>setTimeout(r,12000));
  const d=await deploymentCheck(projectId,envAt);
  if(d){await finish('deploy',{url:'https://'+d.url});return;}
 }
 throw statusError('DEPLOY_NOT_CONFIRMED');
}
async function smokePhase(url){
 if(confirmed('smoke'))return;
 if(!/^https:\/\/[a-z0-9.-]+\.vercel\.app$/i.test(url||''))throw statusError('BAD_PWA_URL');
 const get=async p=>{
  let r;try{r=await fetch(url+p,{redirect:'error',signal:AbortSignal.timeout(12000)});}
  catch{throw statusError('SMOKE_UNAVAILABLE');}return r;};
 const [health,manifest,unauth]=await Promise.all([get('/api/health'),get('/manifest.webmanifest'),get('/api/me')]);
 if(health.status!==200||manifest.status!==200||unauth.status!==401)throw statusError('SMOKE_FAILED');
 const body=await health.json().catch(()=>null);
 if(body?.ok!==true||body?.ready!==true)throw statusError('SMOKE_NOT_READY');
 await claim('smoke');await finish('smoke',{url});
}
export async function run(){
 verifyScope();
 await readState();
 if(state.phase==='completed')return;
 const {orgSlug}=await checkFree();
 await supabasePhase(orgSlug);
 const ref=state.steps.supabase?.receipt?.projectRef;
 if(!ref)throw statusError('NO_PROJECT_REF');
 await waitProject(ref);
 await checkFree();
 await migratePhase(ref);
 await checkFree();
 await vercelPhase();
 const projectId=state.steps.vercel?.receipt?.projectId;
 await checkFree();
 const privateKey=await serviceKey(ref,orgSlug);
 await envPhase(projectId,ref,privateKey);
 await checkFree();
 await bootstrapPhase(ref,privateKey);
 await checkFree();
 await deployPhase(projectId);
 await smokePhase(state.steps.deploy.receipt.url);
 state.phase='completed';state.finishedAt=new Date().toISOString();
 await persist();
 console.log('KAIRÓS: instalação finalizada, célula independente disponível em '+state.steps.deploy.receipt.url);
}
if(process.env.KAIROS_RUN_WORKER==='1'){
 run().catch(error=>{
  console.error('KAIRÓS: instalação interrompida em segurança. Código: '+
    (typeof error?.code==='string'?error.code:'REMOTE_UNCERTAIN'));
  process.exitCode=1;
 });
}