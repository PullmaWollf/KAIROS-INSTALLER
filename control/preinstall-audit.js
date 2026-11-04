import {decryptControl} from './crypto.js';
import {readVercelConnection} from './vercel-connection.js';
import {preflightVercelAccount} from '../provisioner/providers.js';

const TEMPLATE='PullmaWollf/KAIROS-CORE';
const timeout=ms=>AbortSignal.timeout(ms);
function state(provider,connected,access,reason){
 return {provider,connected,readAccess:access,reason,writePermission:'not-tested'};
}
async function storedOAuth({db,userId,provider,env}){
 const envelope=await db.connection(userId,provider);
 if(!envelope)return null;
 try{
  const record=decryptControl(envelope,'oauth:'+provider+':'+userId,{env});
  if(typeof record?.accessToken!=='string'||record.accessToken.length<16||
   record.expiresAt&&record.expiresAt<Date.now()+30000)return null;
  return record.accessToken;
 }catch{return null;}
}
async function get({fetcher,url,token,github=false}){
 const headers={Authorization:'Bearer '+token,Accept:github?'application/vnd.github+json':'application/json'};
 if(github){headers['X-GitHub-Api-Version']='2022-11-28';}
 const response=await fetcher(url,{method:'GET',redirect:'error',
  signal:timeout(10000),headers});
 if(response?.status!==200)throw Error('PROVIDER_NOT_READABLE');
 const value=await response.json();
 if(!value||typeof value!=='object')throw Error('PROVIDER_BAD_RESPONSE');
 return {value,response};
}
/** Only GET requests. This is NOT proof that the account can create resources. */
export async function preinstallationAudit({db,user,env=process.env,fetcher=fetch}){
 const github=state('github',false,false,'NOT_CONNECTED');
 const supabase=state('supabase',false,false,'NOT_CONNECTED');
 const vercel=state('vercel',false,false,'NOT_CONNECTED');
 const organizations=[];
 const [gToken,sToken,vAccount]=await Promise.all([
  storedOAuth({db,userId:user.id,provider:'github',env}),
  storedOAuth({db,userId:user.id,provider:'supabase',env}),
  readVercelConnection({db,userId:user.id,env}).catch(()=>null)
 ]);
 const tasks=[
  (async()=>{
   if(!gToken)return;
   github.connected=true;
   try{
    const {value:who,response}=await get({fetcher,url:'https://api.github.com/user',token:gToken,github:true});
    if(who.login?.toLowerCase()!==user.login.toLowerCase()||
       who.login?.toLowerCase()==='pullmawollf')throw Error('WRONG_GITHUB_OWNER');
    const {value:template}=await get({fetcher,
     url:'https://api.github.com/repos/'+TEMPLATE,token:gToken,github:true});
    if(template.full_name?.toLowerCase()!==TEMPLATE.toLowerCase()||
       template.is_template!==true||template.private!==false||
       template.default_branch!=='main')throw Error('TEMPLATE_NOT_READY');
    github.readAccess=true;github.reason='IDENTITY_AND_PUBLIC_TEMPLATE_VERIFIED';
    github.template=TEMPLATE;github.templateBranch='main';
    const scope=who?.login&&response.headers?.get?.('x-oauth-scopes');
    if(typeof scope==='string'){
     const scopes=scope.split(',').map(s=>s.trim());
     github.writePermission=scopes.includes('repo')?'oauth-repo-scope-observed':'repo-scope-missing';
    }
   }catch(e){github.reason=e.message==='WRONG_GITHUB_OWNER'?'WRONG_OWNER':
    e.message==='TEMPLATE_NOT_READY'?'TEMPLATE_NOT_READY':'READ_VERIFICATION_FAILED';}
  })(),
  (async()=>{
   if(!sToken)return;
   supabase.connected=true;
   try{
    const {value:list}=await get({fetcher,url:'https://api.supabase.com/v1/organizations',token:sToken});
    if(!Array.isArray(list))throw Error('BAD_ORGANIZATIONS');
    for(const org of list){
     if(org&&/^[a-z\d_-]{4,64}$/i.test(String(org.id||''))&&
        /^[a-z\d_-]{4,64}$/i.test(String(org.slug||''))&&
        String(org.name||'').toLowerCase()!=='pullmawollf'){
      organizations.push({id:org.id,name:String(org.name||org.slug).slice(0,80),slug:org.slug});
     }
    }
    supabase.readAccess=organizations.length>0;
    supabase.reason=organizations.length?'ORGANIZATION_ACCESS_VERIFIED':'NO_ELIGIBLE_ORGANIZATION';
   }catch{supabase.reason='READ_VERIFICATION_FAILED';}
  })(),
  (async()=>{
   if(!vAccount)return;
   vercel.connected=true;
   try{
    const proof=await preflightVercelAccount({fetcher,token:vAccount.accessToken,teamId:vAccount.teamId});
    if(proof?.accessible!==true||proof.teamId!==vAccount.teamId)throw Error('BAD_DESTINATION');
    vercel.readAccess=true;vercel.reason='HOSTING_ACCESS_VERIFIED';
    vercel.hostingName=String(proof.teamSlug||'Minha hospedagem').slice(0,80);
    vercel.hostingType=vAccount.teamId.startsWith('personal_')?'personal':'team';
   }catch{vercel.reason='READ_VERIFICATION_FAILED';}
  })()
 ];
 await Promise.all(tasks);
 const flags={
  provisioning:env.KAIROS_CONTROL_ENABLE_WRITES==='1',
  vercelManagement:env.KAIROS_VERCEL_MANAGEMENT_ENABLED==='1',
  supabaseMigrations:env.KAIROS_ENABLE_BETA_SQL==='1',
  deployment:env.KAIROS_ENABLE_GIT_DEPLOY==='1'
 };
 const accessValidated=[github,supabase,vercel].every(item=>item.readAccess);
 // A read-only preflight cannot grant approval or assert write permission.
 return {mode:'read-only',createsResources:false,remoteWrites:0,
  template:{repository:TEMPLATE,branch:'main',checked:github.readAccess},
  providers:[github,supabase,vercel],supabaseOrganizations:organizations,
  accessValidated,writePermissionsValidated:false,
  allStepsEnabled:Object.values(flags).every(Boolean),serverFlags:flags,
  fullyHomologated:false,
  note:'Verificação de leitura somente. Criação de repositório, banco e projeto Vercel precisa de instalação descartável e autorizada para comprovar escrita.'};
}
