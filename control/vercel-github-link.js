import {ControlError} from './crypto.js';
import {readVercelConnection} from './vercel-connection.js';

const ENDPOINT='https://api.vercel.com/v1/integrations/git-namespaces?provider=github&viewerMetadata=true';

/**
 * Read-only Vercel Git integration check. Vercel's GitHub App must be
 * authorized by the customer on Vercel; we never install the App for them.
 * Never returns tokens, installation IDs or raw provider objects.
 */
export async function checkVercelGithubLink({db,user,env=process.env,fetcher=fetch}){
 if(!Number.isSafeInteger(user?.id)||user.id<=0||
    !/^[a-z0-9-]{1,39}$/i.test(user.login||''))
   throw new ControlError('LOGIN_REQUIRED');
 const account=await readVercelConnection({db,userId:user.id,env}).catch(()=>null);
 const result={mode:'read-only',createsResources:false,remoteWrites:0,
  connected:false,canImportNewRepositories:false,githubLogin:user.login,
  reason:'VERCEL_NOT_CONNECTED'};
 if(!account)return result;
 let items;
 try{
  const response=await fetcher(ENDPOINT,{method:'GET',redirect:'error',
   signal:AbortSignal.timeout(10000),
   headers:{Authorization:'Bearer '+account.accessToken,Accept:'application/json'}});
  if(response?.status!==200)throw Error('PROVIDER_NOT_READABLE');
  const value=await response.json();
  items=Array.isArray(value)?value:Array.isArray(value?.namespaces)?value.namespaces:null;
  if(!items)throw Error('INVALID_RESPONSE');
 }catch{return {...result,reason:'VERCEL_GITHUB_CHECK_UNAVAILABLE'};}
 const found=items.find(x=>x?.provider==='github'&&
  [x.slug,x.name].some(value=>typeof value==='string'&&
    value.toLowerCase()===user.login.toLowerCase()));
 if(!found)return {...result,reason:'GITHUB_NOT_CONNECTED_TO_VERCEL'};
 if(found.requireReauth===true)
  return {...result,connected:true,reason:'VERCEL_GITHUB_REAUTH_REQUIRED'};
 if(found.isAccessRestricted!==false)
  return {...result,connected:true,reason:found.isAccessRestricted===true?
   'VERCEL_GITHUB_REPOSITORIES_RESTRICTED':'VERCEL_GITHUB_ACCESS_UNKNOWN'};
 if(found.viewer?.canCreateApp===false)
  return {...result,connected:true,reason:'VERCEL_GITHUB_PERMISSION_UNCONFIRMED'};
 return {...result,connected:true,canImportNewRepositories:true,
  reason:'VERCEL_GITHUB_CONNECTED',hostingName:String(account.teamSlug||'').slice(0,80),
  warning:'Integracao observada; a criacao de um projeto real ainda requer permissao de importacao e verificacao especifica do repositorio.'};
}
