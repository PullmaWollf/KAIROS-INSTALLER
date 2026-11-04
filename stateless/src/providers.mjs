import {InstallationError,vercelQuery} from './validation.mjs';
export const URLS=Object.freeze({github:'https://api.github.com',supabase:'https://api.supabase.com',vercel:'https://api.vercel.com'});
export async function call(fetcher,provider,token,path,{method='GET',body,accepted=[200]}={}){
  if (!Object.hasOwn(URLS,provider) || !path.startsWith('/') || path.includes('://') || !token)
    throw new InstallationError('BAD_PROVIDER_REQUEST');
  let response;
  try {
    response=await fetcher(URLS[provider]+path,{
      method,redirect:'error',signal:AbortSignal.timeout(16000),
      headers:{'Authorization':'Bearer '+token,'Accept':'application/json',
        ...(provider==='github'?{'X-GitHub-Api-Version':'2022-11-28'}:{}),
        ...(body!==undefined?{'Content-Type':'application/json'}:{})},
      ...(body!==undefined?{body:JSON.stringify(body)}:{})
    });
  } catch {throw new InstallationError('REMOTE_UNCERTAIN',provider+' indisponível');}
  if(!accepted.includes(response?.status))throw new InstallationError(
    method==='GET'?'PREFLIGHT_FAILED':'REMOTE_UNCERTAIN',provider+' HTTP '+response?.status);
  if(response.status===204)return null;
  try{return await response.json();}catch{throw new InstallationError('INVALID_PROVIDER_RESPONSE');}
}
// All GET operations; no access tokens or raw provider objects leave this method.
export async function audit({fetcher=fetch,plan,credentials}){
  const {githubToken,supabaseToken,vercelToken}=credentials;
  const gh=await call(fetcher,'github',githubToken,'/user');
  if (gh.login?.toLowerCase()!==plan.githubLogin.toLowerCase()) throw new InstallationError('WRONG_GITHUB_OWNER');
  const template=await call(fetcher,'github',githubToken,'/repos/PullmaWollf/KAIROS-CORE');
  if (template.is_template!==true || template.private!==false || template.default_branch!=='main')
    throw new InstallationError('TEMPLATE_NOT_READY');
  const organizations=await call(fetcher,'supabase',supabaseToken,'/v1/organizations');
  if (!Array.isArray(organizations))throw new InstallationError('ORG_NOT_VERIFIED');
  const org=organizations.find(o=>o?.id===plan.supabaseOrgId);
  if(!org || !/^[a-z0-9_-]{4,64}$/i.test(org.slug||''))throw new InstallationError('ORG_NOT_VERIFIED');
  const [details,projects]=await Promise.all([
    call(fetcher,'supabase',supabaseToken,'/v1/organizations/'+encodeURIComponent(org.slug)),
    call(fetcher,'supabase',supabaseToken,'/v1/projects')
  ]);
  if(details.id!==org.id || String(details.plan).toLowerCase()!=='free' || !Array.isArray(projects))
    throw new InstallationError('SUPABASE_NOT_FREE');
  if(projects.some(x=>!x || typeof x.status!=='string'))throw new InstallationError('SUPABASE_QUOTA_UNKNOWN');
  const active=projects.filter(x=>!['PAUSED','INACTIVE'].includes(x.status.toUpperCase())).length;
  if(active>=2)throw new InstallationError('SUPABASE_QUOTA_FULL');
  const user=await call(fetcher,'vercel',vercelToken,'/v2/user');
  if(user.user?.username?.toLowerCase()!==plan.githubLogin.toLowerCase())
    throw new InstallationError('VERCEL_ACCOUNT_MISMATCH');
  if(user.user?.billing?.plan!=='hobby')throw new InstallationError('VERCEL_NOT_FREE');
  if(plan.vercelScope.startsWith('personal_')){
    if(plan.vercelScope!=='personal_'+user.user.id)throw new InstallationError('VERCEL_SCOPE_MISMATCH');
  }else{
    const team=await call(fetcher,'vercel',vercelToken,'/v2/teams/'+encodeURIComponent(plan.vercelScope));
    if(team.id!==plan.vercelScope || team.billing?.plan!=='hobby')throw new InstallationError('VERCEL_TEAM_NOT_FREE');
  }
  // The GitHub integration must be connected BEFORE a repository is created,
  // otherwise the installer could strand a private repo in the customer account.
  const namespaces=await call(fetcher,'vercel',vercelToken,
    '/v1/integrations/git-namespaces?provider=github');
  const items=Array.isArray(namespaces)?namespaces:namespaces?.namespaces;
  if(!Array.isArray(items)||!items.some(x=>String(x.name||x.slug||x.owner?.login||'').toLowerCase()===plan.githubLogin.toLowerCase()))
    throw new InstallationError('VERCEL_GITHUB_LINK_MISSING');
  return Object.freeze({ok:true,readOnly:true,createsResources:false,
    supabase:{plan:'free',activeProjectsObserved:active,organizationId:org.id},
    vercel:{plan:'hobby',scope:plan.vercelScope},github:{owner:gh.login,template:'PullmaWollf/KAIROS-CORE'},
    warning:'Planos observados, não garantem preço zero para qualquer uso futuro.'});
}