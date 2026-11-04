import {randomBytes,scrypt as scryptCb} from 'node:crypto';
import {promisify} from 'node:util';
import {readFile} from 'node:fs/promises';
import {ControlError,encryptControl,decryptControl} from './crypto.js';
import {phaseFor} from './plan.js';
import {preflightGithub,createGithubFromTemplate} from '../provisioner/github.js';
import {createSupabaseProject,createVercelProject} from '../provisioner/create-projects.js';
import {preflightSupabase,preflightVercel} from '../provisioner/providers.js';
import {configureVercelEnvironment} from '../provisioner/vercel-env.js';
import {checkDeployment} from '../provisioner/deployment.js';
import {smokeTest} from '../provisioner/smoke.js';
import {reconcileGithub,reconcileSupabase,reconcileVercel} from '../provisioner/reconcile.js';
const scrypt=promisify(scryptCb);
const ID=/^[a-z0-9]{10,30}$/i;
const customerUrl=ref=>'https://'+ref+'.supabase.co';

async function management(token,path,{fetcher=fetch,method='GET',body}={}){
 if(!token||!path.startsWith('/v1/')||path.includes('://'))throw new ControlError('NO_AUTH');
 let response;
 try{response=await fetcher('https://api.supabase.com'+path,{method,redirect:'error',signal:AbortSignal.timeout(25000),
  headers:{Authorization:'Bearer '+token,Accept:'application/json',...(body?{'Content-Type':'application/json'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});}
 catch{throw new ControlError('PROVIDER_UNCERTAIN','Supabase indisponível; conferir painel antes de repetir');}
 if(!response||response.status<200||response.status>=300)
  throw new ControlError('PROVIDER_ERROR','Requisição Supabase recusada');
 try{return await response.json();}catch{throw new ControlError('PROVIDER_RESPONSE','Resposta Supabase inválida');}
}
async function customerKeys({token,projectRef,organizationId,fetcher}){
 if(!ID.test(projectRef||''))throw new ControlError('BAD_TARGET');
 const list=await management(token,'/v1/projects',{fetcher});
 if(!Array.isArray(list)||!list.some(x=>(x.ref===projectRef||x.id===projectRef)&&
  (x.organization_id===organizationId||x.organization_slug===organizationId)))
  throw new ControlError('WRONG_OWNER','Banco pertence a outra organização');
 const keys=await management(token,'/v1/projects/'+projectRef+'/api-keys?reveal=true',{fetcher});
 if(!Array.isArray(keys))throw new ControlError('KEY_UNAVAILABLE');
 const values=keys.filter(k=>k?.name==='service_role'||k?.type==='secret'&&k?.secret_jwt_template?.role==='service_role')
  .map(k=>k.api_key||k.value||k.key).filter(x=>typeof x==='string'&&x.length>=20);
 if(values.length!==1)throw new ControlError('KEY_UNAVAILABLE','Chave de serviço privada indisponível ou ambígua');
 return values[0];
}
async function restCustomer(ref,key,path,{fetcher=fetch,method='GET',body}={}){
 if(!ID.test(ref)||!path.startsWith('/rest/v1/'))throw new ControlError('BAD_TARGET');
 let r;
 try{r=await fetcher(customerUrl(ref)+path,{method,redirect:'error',signal:AbortSignal.timeout(15000),
  headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json',
   ...(body?{'Content-Type':'application/json'}:{}),...(method==='POST'?{Prefer:'return=minimal'}:{})},
  ...(body?{body:JSON.stringify(body)}:{})});}
 catch{throw new ControlError('CUSTOMER_DB_UNCERTAIN','Banco da célula indisponível; não repita cadastros');}
 if(!r||r.status<200||r.status>=300)throw new ControlError('CUSTOMER_DB_ERROR','Operação recusada no banco da célula');
 if(r.status===201||r.status===204)return [];
 try{return await r.json();}catch{throw new ControlError('CUSTOMER_DB_ERROR');}
}
async function approvedMigration({token,projectRef,fetcher}){
 const files=['20261103000000_kairos_initial.sql','20261103010000_kairos_login_throttle.sql'];
 const sources=[];
 for(const file of files){
  const sql=await readFile(new URL('./core-migrations/'+file,import.meta.url),'utf8');
  if(!sql.includes('row level security')||sql.length>20000)throw new ControlError('BAD_MIGRATION','Migração auditada ausente');
  sources.push(sql);
 }
 // One fixed script from the Installer bundle, NEVER client-supplied SQL.
 const query='BEGIN;\n'+sources.join('\n\n')+'\nCOMMIT;';
 await management(token,'/v1/projects/'+projectRef+'/database/query',
  {fetcher,method:'POST',body:{query,read_only:false}});
 return {};
}
export function cloudOps({db,env=process.env,fetcher=fetch}){
 const secretPurpose=id=>'install:'+id;
 async function secrets(row){
  const envelope=await db.installSecrets(row.id);
  return envelope?decryptControl(envelope,secretPurpose(row.id),{env}):{};
 }
 async function storeSecrets(row,data){
  await db.saveInstallSecrets(row.id,encryptControl(data,secretPurpose(row.id),{env}));
 }
 async function token(id,provider){
  const envelope=await db.connection(id,provider);
  if(!envelope)throw new ControlError('OAUTH_REQUIRED','Conecte a conta '+provider+' para continuar');
  const auth=decryptControl(envelope,'oauth:'+provider+':'+id,{env});
  if(typeof auth.accessToken!=='string'||auth.expiresAt&&auth.expiresAt<Date.now()+30000)
   throw new ControlError('OAUTH_EXPIRED','Reconecte '+provider);
  return auth.accessToken;
 }
 async function vercelToken(teamId,ownerId){
  const envelope=await db.connection(ownerId,'vercel');
  if(!envelope)throw new ControlError('VERCEL_TOKEN_REQUIRED','Conecte um token de gerenciamento da sua equipe Vercel');
  const auth=decryptControl(envelope,'oauth:vercel:'+ownerId,{env});
  if(auth?.kind!=='customer-management-token'||auth.teamId!==teamId||
     typeof auth.accessToken!=='string'||auth.accessToken.length<12)
   throw new ControlError('VERCEL_TEAM_FORBIDDEN','Credencial Vercel não corresponde à equipe da instalação');
  return auth.accessToken;
 }
 async function precheck(row,ownerId,phase){
  if(phase==='github')await preflightGithub({fetcher,token:await token(ownerId,'github'),
   plan:{owner:row.owner,repository:row.repository}});
  if(['supabase','migrate','env','bootstrap'].includes(phase))
   await preflightSupabase({fetcher,token:await token(ownerId,'supabase'),organizationId:row.supabase_org_id});
  if(['vercel','env','deploy'].includes(phase)){
   if(env.KAIROS_VERCEL_MANAGEMENT_ENABLED!=='1')throw new ControlError('VERCEL_SCOPE_REQUIRED','Permissões de gerenciamento da Vercel ainda não habilitadas');
   await preflightVercel({fetcher,token:await vercelToken(row.vercel_team_id,ownerId),teamId:row.vercel_team_id,operatorMode:true});
  }
  if(phase==='migrate'&&env.KAIROS_ENABLE_BETA_SQL!=='1')
   throw new ControlError('BETA_SQL_DISABLED','Endpoint de migrações Supabase beta não autorizado');
  if(phase==='migrate'){
   const project=await management(await token(ownerId,'supabase'),'/v1/projects/'+row.supabase_ref,{fetcher});
   if((project?.ref||project?.id)!==row.supabase_ref||
      ![row.supabase_org_id].includes(project?.organization_id)&&![row.supabase_org_id].includes(project?.organization_slug))
    throw new ControlError('WRONG_OWNER','Projeto Supabase pertence a outro destino');
   if(project?.status!=='ACTIVE_HEALTHY')
    throw new ControlError('PROJECT_NOT_READY','Aguarde o Supabase ficar ACTIVE_HEALTHY antes de aplicar migrações');
  }
  if(['migrate','env','bootstrap'].includes(phase)&&!ID.test(row.supabase_ref||''))
   throw new ControlError('MISSING_TARGET','Projeto Supabase ainda não foi criado');
  if(['env','deploy'].includes(phase)&&!/^prj_[a-z0-9_-]+$/i.test(row.vercel_project_id||''))
   throw new ControlError('MISSING_TARGET','Projeto Vercel ainda não foi criado');
  if(phase==='smoke'&&!row.pwa_origin)throw new ControlError('MISSING_TARGET');
 }
 async function run(row,ownerId,phase){
  if(phase==='github'){
   const result=await createGithubFromTemplate({fetcher,token:await token(ownerId,'github'),
    plan:{owner:row.owner,repository:row.repository,cellName:row.cell_name,visibility:'private'}});
   return {receipt:{repository:result.repository}};
  }
  if(phase==='supabase'){
   const credentials=await secrets(row);
   if(!credentials.dbPassword){
    credentials.dbPassword=randomBytes(36).toString('base64url');
    await storeSecrets(row,credentials); // durable before sending external POST
   }
   const result=await createSupabaseProject({fetcher,token:await token(ownerId,'supabase'),
    plan:{organizationId:row.supabase_org_id,projectName:row.repository,region:row.region},
    dbPassword:credentials.dbPassword,approved:true});
   return {receipt:{projectRef:result.projectRef}};
  }
  if(phase==='migrate'){
   await approvedMigration({fetcher,token:await token(ownerId,'supabase'),projectRef:row.supabase_ref});
   return {receipt:{}};
  }
  if(phase==='vercel'){
   const result=await createVercelProject({fetcher,token:await vercelToken(row.vercel_team_id,ownerId),approved:true,operatorMode:true,
    plan:{teamId:row.vercel_team_id,projectName:row.repository,repoOwner:row.owner,repoName:row.repository}});
   return {receipt:{projectId:result.projectId}};
  }
  if(phase==='env'){
   const credentials=await secrets(row);
   credentials.serviceKey ||= await customerKeys({fetcher,token:await token(ownerId,'supabase'),
    projectRef:row.supabase_ref,organizationId:row.supabase_org_id});
   credentials.sessionSecret ||= randomBytes(48).toString('base64url');
   await storeSecrets(row,credentials); // never in response or audit
   await configureVercelEnvironment({fetcher,token:await vercelToken(row.vercel_team_id,ownerId),approved:true,
    target:{teamId:row.vercel_team_id,projectId:row.vercel_project_id,repoOwner:row.owner,repoName:row.repository},
    secrets:{SUPABASE_URL:customerUrl(row.supabase_ref),SUPABASE_SERVICE_ROLE_KEY:credentials.serviceKey,
     SESSION_SECRET:credentials.sessionSecret}});
   return {receipt:{}};
  }
  if(phase==='bootstrap'){
   const credentials=await secrets(row);
   credentials.serviceKey ||= await customerKeys({fetcher,token:await token(ownerId,'supabase'),
    projectRef:row.supabase_ref,organizationId:row.supabase_org_id});
   credentials.adminPassword ||= randomBytes(24).toString('base64url');
   await storeSecrets(row,credentials); // persisted before remote write
   const admins=await restCustomer(row.supabase_ref,credentials.serviceKey,'/rest/v1/app_users?role=eq.admin&select=id&limit=1',{fetcher});
   if(!Array.isArray(admins)||admins.length>0)throw new ControlError('ADMIN_EXISTS','Administrador já existe; conferir antes de repetir');
   const salt=randomBytes(16).toString('hex'),hash=await scrypt(credentials.adminPassword,salt,64);
   await restCustomer(row.supabase_ref,credentials.serviceKey,'/rest/v1/app_users',{fetcher,method:'POST',
    body:{name:'Administrador',login:row.admin_login,role:'admin',password_hash:'scrypt:'+salt+':'+hash.toString('hex')}});
   return {receipt:{}};
  }
  if(phase==='deploy'){
   const vToken=await vercelToken(row.vercel_team_id,ownerId);
   const target={teamId:row.vercel_team_id,projectId:row.vercel_project_id};
   const prior=await db.operations(row.id);
   const configuredAt=Date.parse(prior.find(x=>x.phase==='env'&&x.status==='confirmed')?.finished_at||'');
   if(!Number.isFinite(configuredAt))throw new ControlError('BAD_STATE','Etapa de ambiente sem comprovante');
   const previous=await checkDeployment({fetcher,token:vToken,target});
   if(previous.ready&&previous.url&&previous.createdAt>configuredAt)
    return {receipt:{url:previous.url},readOnly:true};
   if(env.KAIROS_ENABLE_GIT_DEPLOY!=='1')
    return {waiting:true,reason:'DEPLOY_NOT_TRIGGERED'};
   const info=await fetcher('https://api.vercel.com/v9/projects/'+encodeURIComponent(row.vercel_project_id)+
    '?teamId='+encodeURIComponent(row.vercel_team_id),{
    method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+vToken,Accept:'application/json'}});
   if(info?.status!==200)throw new ControlError('VERCEL_PROJECT_UNAVAILABLE');
   const details=await info.json();
   if(details.id!==row.vercel_project_id||details.accountId!==row.vercel_team_id||details.link?.type!=='github'||
    String(details.link.repo||'').toLowerCase()!==(row.owner+'/'+row.repository).toLowerCase())
    throw new ControlError('WRONG_PROJECT','Deploy recusado: vínculo GitHub inesperado');
   const repoId=Number(details.link.repoId);
   if(!Number.isSafeInteger(repoId)||repoId<=0)throw new ControlError('GITHUB_REPO_ID_MISSING');
   let response;
   try{response=await fetcher('https://api.vercel.com/v13/deployments?teamId='+
     encodeURIComponent(row.vercel_team_id)+'&forceNew=1',{
     method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
     headers:{Authorization:'Bearer '+vToken,Accept:'application/json','Content-Type':'application/json'},
     body:JSON.stringify({name:row.repository,project:row.vercel_project_id,target:'production',
      gitSource:{type:'github',repoId,ref:'main'}})
    });}catch{throw new ControlError('DEPLOY_UNCERTAIN','Verifique o painel antes de repetir');}
   if(!response||![200,201,202].includes(response.status))throw new ControlError('DEPLOY_UNCERTAIN');
   const created=await response.json().catch(()=>null);
   if(!created?.id||created.projectId&&created.projectId!==row.vercel_project_id)
    throw new ControlError('DEPLOY_UNCERTAIN');
   // A successful POST is merely queued, NOT proof that the PWA is ready.
   return {waiting:true,reason:'DEPLOY_TRIGGERED'};
  }
  if(phase==='smoke'){
   await smokeTest({url:row.pwa_origin,fetcher,approved:true});
   return {receipt:{},readOnly:true};
  }
  throw new ControlError('BAD_PHASE');
 }
 async function reconcile(row,ownerId,phase,startedAt){
  // Reconciling only GET never repeats external POST; existence of a preexisting
  // resource cannot prove that this attempt created it.
  if(phase==='deploy'){
   const v=await checkDeployment({fetcher,token:await vercelToken(row.vercel_team_id,ownerId),
    target:{teamId:row.vercel_team_id,projectId:row.vercel_project_id}});
   if(v.ready&&v.url&&v.createdAt>Date.parse(startedAt))return {status:'verified',receipt:{url:v.url}};
   return {status:'waiting'};
  }
  if(phase==='smoke'){
   await smokeTest({url:row.pwa_origin,fetcher,approved:true});
   return {status:'verified',receipt:{}};
  }
  if(phase==='github'){
   return reconcileGithub({fetcher,token:await token(ownerId,'github'),owner:row.owner,repository:row.repository});
  }
  if(phase==='supabase'){
   return reconcileSupabase({fetcher,token:await token(ownerId,'supabase'),
    organizationId:row.supabase_org_id,projectName:row.repository});
  }
  if(phase==='vercel'){
   return reconcileVercel({fetcher,token:await vercelToken(row.vercel_team_id,ownerId),
    teamId:row.vercel_team_id,projectName:row.repository,repository:row.owner+'/'+row.repository});
  }
  if(phase==='bootstrap'){
   const credential=await secrets(row);
   if(!credential.serviceKey)return {status:'manual-review'};
   const admins=await restCustomer(row.supabase_ref,credential.serviceKey,
    '/rest/v1/app_users?role=eq.admin&select=id,login&limit=2',{fetcher});
   return Array.isArray(admins)&&admins.some(x=>x.login===row.admin_login)?
    {status:'exists-review',reason:'ADM encontrado. Conferir a identidade no painel Supabase'}:
    {status:'manual-review'};
  }
  // Migrations and environment writes may be partially applied. Only a human
  // can acknowledge these after reviewing SQL history and the provider dashboard.
  return {status:'manual-review',reason:'Conferência humana das alterações exigida'};
 }
 return {precheck,run,reconcile};
}
