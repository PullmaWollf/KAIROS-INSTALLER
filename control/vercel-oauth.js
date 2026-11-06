import {ControlError,encryptControl} from './crypto.js';
import {preflightVercelAccount} from '../provisioner/providers.js';
import {personalAccountId,vercelQuery} from '../provisioner/vercel-scope.js';
import {providerGet} from '../provisioner/provider-http.js';

// Vercel's Integration OAuth grants a management-scoped, long-lived API token.
// This differs from "Sign in with Vercel": identity OIDC alone does NOT grant
// general project creation permissions.
const slug=/^[a-z0-9][a-z0-9-]{2,31}$/;
const tokenPattern=/^[A-Za-z0-9._~-]{20,512}$/;
const teamPattern=/^team_[A-Za-z0-9_-]{6,64}$/;
const purpose=id=>'oauth:vercel:'+id;

export function integrationConfig(env=process.env){
 const name=env.KAIROS_VERCEL_INTEGRATION_SLUG;
 const clientId=env.KAIROS_VERCEL_CLIENT_ID;
 const clientSecret=env.KAIROS_VERCEL_CLIENT_SECRET;
 if(!slug.test(name||'')||typeof clientId!=='string'||clientId.length<5||
  typeof clientSecret!=='string'||clientSecret.length<12)
  throw new ControlError('OAUTH_NOT_CONFIGURED','Configure a integração Vercel no servidor');
 return {slug:name,clientId,clientSecret};
}

export function integrationAuthorizationUrl({state,env=process.env}){
 if(typeof state!=='string'||! /^[A-Za-z0-9_-]{32,100}$/.test(state))
  throw new ControlError('OAUTH_STATE');
 const config=integrationConfig(env);
 const url=new URL('https://vercel.com/integrations/'+config.slug+'/new');
 url.searchParams.set('state',state);
 return url.toString();
}

export async function exchangeVercelIntegration({code,callbackUrl,env=process.env,fetcher=fetch}){
 if(typeof code!=='string'||!code||code.length>2000)
  throw new ControlError('OAUTH_FAILED');
 const config=integrationConfig(env);
 const form=new URLSearchParams({client_id:config.clientId,client_secret:config.clientSecret,
  code,redirect_uri:callbackUrl});
 let response;
 try{response=await fetcher('https://api.vercel.com/v2/oauth/access_token',{
  method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),
  headers:{Accept:'application/json','Content-Type':'application/x-www-form-urlencoded'},
  body:form.toString()
 });}catch{throw new ControlError('OAUTH_NETWORK');}
 if(response?.status!==200)throw new ControlError('OAUTH_FAILED');
 let value;try{value=await response.json();}catch{throw new ControlError('OAUTH_FAILED');}
 if(!tokenPattern.test(value?.access_token||'')||
  (value.team_id!=null&&!teamPattern.test(value.team_id)))
  throw new ControlError('OAUTH_FAILED');
 return {accessToken:value.access_token,teamId:value.team_id||null};
}

export async function connectVercelIntegration({db,userId,code,callbackUrl,
 callbackTeamId,env=process.env,fetcher=fetch}){
 if(!Number.isSafeInteger(userId)||userId<=0)throw new ControlError('LOGIN_REQUIRED');
 const result=await exchangeVercelIntegration({code,callbackUrl,env,fetcher});
 let selectedId=result.teamId,verified;
 // An external-flow teamId is only an untrusted hint. The token's team_id
 // and read-only provider preflight are authoritative.
 if(callbackTeamId!=null&&callbackTeamId!==result.teamId)
  throw new ControlError('VERCEL_TEAM_FORBIDDEN');
 if(!selectedId){
  const data=await providerGet({fetcher,base:'https://api.vercel.com',
   path:'/v2/user',token:result.accessToken,provider:'Vercel'});
  selectedId=personalAccountId(data?.user);
 }
 if(selectedId===env.KAIROS_VERCEL_TEAM_ID)
  throw new ControlError('VERCEL_TEAM_FORBIDDEN','A conta do Installer não é destino');
 try{
  verified=await preflightVercelAccount({
   fetcher,token:result.accessToken,teamId:selectedId
  });
  const projects=await providerGet({fetcher,base:'https://api.vercel.com',
   path:'/v9/projects'+vercelQuery(selectedId,{limit:1}),
   token:result.accessToken,provider:'Vercel'});
  if(!Array.isArray(projects?.projects))throw Error('no-project-access');
 }catch{throw new ControlError('VERCEL_VERIFICATION_FAILED');}
 if(verified?.accessible!==true||verified.teamId!==selectedId)
  throw new ControlError('VERCEL_VERIFICATION_FAILED');
 const record={kind:'vercel-management-v1',source:'integration-oauth',
  teamId:selectedId,teamSlug:String(verified.teamSlug||'').slice(0,100),
  accessToken:result.accessToken,verifiedAt:new Date().toISOString()};
 await db.saveConnection(userId,'vercel',
  encryptControl(record,purpose(userId),{env}));
 return {connected:true,teamId:selectedId,teamSlug:record.teamSlug};
}

// Vercel sends an optional "next" URL to complete the integration popup.
// Only follow Vercel-owned HTTPS origins; never redirect to arbitrary URLs.
export function safeVercelNext(value){
 if(typeof value!=='string'||value.length>2048)return null;
 let url;try{url=new URL(value);}catch{return null;}
 if(url.protocol!=='https:'||url.username||url.password||
  !['vercel.com','www.vercel.com'].includes(url.hostname))return null;
 return url.toString();
}
