import {randomBytes,createHash,timingSafeEqual} from 'node:crypto';
import {ProvisioningError} from '../provisioner/plan.js';
const ascii=/^[a-zA-Z0-9_.-]{5,180}$/;
export function safeEqual(a,b){
 if(typeof a!=='string'||typeof b!=='string')return false;
 const x=Buffer.from(a),y=Buffer.from(b);
 return x.length===y.length&&timingSafeEqual(x,y);
}
export function providerConfig(provider,env=process.env){
 if(!['github','supabase','vercel'].includes(provider))throw new ProvisioningError('PROVIDER_UNAVAILABLE','OAuth deste provedor ainda não habilitado');
 const prefix=provider.toUpperCase();
 const clientId=env['KAIROS_'+prefix+'_CLIENT_ID'],clientSecret=env['KAIROS_'+prefix+'_CLIENT_SECRET'];
 if(!ascii.test(clientId||'')||!clientSecret||clientSecret.length<12)throw new ProvisioningError('OAUTH_NOT_CONFIGURED','Configure seu aplicativo OAuth '+provider+' no ambiente local');
 return {clientId,clientSecret,provider,
  authorizationUrl:provider==='github'?'https://github.com/login/oauth/authorize':provider==='vercel'?'https://vercel.com/oauth/authorize':'https://api.supabase.com/v1/oauth/authorize',
  tokenUrl:provider==='github'?'https://github.com/login/oauth/access_token':provider==='vercel'?'https://api.vercel.com/login/oauth/token':'https://api.supabase.com/v1/oauth/token'};
}
export function beginAuthorization({provider,callbackUrl,config,now=Date.now()}){
 const state=randomBytes(32).toString('base64url');
 const verifier=randomBytes(48).toString('base64url');
 const challenge=createHash('sha256').update(verifier).digest('base64url');
 const url=new URL(config.authorizationUrl);
 url.searchParams.set('response_type','code');
 url.searchParams.set('client_id',config.clientId);
 url.searchParams.set('redirect_uri',callbackUrl);
 url.searchParams.set('state',state);
 url.searchParams.set('code_challenge',challenge);
 url.searchParams.set('code_challenge_method','S256');
 if(provider==='github')url.searchParams.set('scope','repo');
 if(provider==='vercel')url.searchParams.set('scope','openid email profile offline_access');
 return {url:url.toString(),transaction:{provider,state,verifier,callbackUrl,expiresAt:now+600000}};
}
export async function exchangeCode({transaction,code,config,fetcher=fetch}){
 if(!transaction||!config||!code||typeof code!=='string'||code.length>2000)throw new ProvisioningError('OAUTH_FAILED','Código de autorização inválido');
 const body=new URLSearchParams({code,redirect_uri:transaction.callbackUrl,code_verifier:transaction.verifier});
 let auth;
 if(transaction.provider==='supabase'){
  body.set('grant_type','authorization_code');
  auth='Basic '+Buffer.from(config.clientId+':'+config.clientSecret).toString('base64');
 }else{
  body.set('client_id',config.clientId);body.set('client_secret',config.clientSecret);
  if(transaction.provider==='vercel')body.set('grant_type','authorization_code');
 }
 let response;
 try{
  response=await fetcher(config.tokenUrl,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{
   Accept:'application/json','Content-Type':'application/x-www-form-urlencoded',
   ...(auth?{Authorization:auth}:{})
  },body:body.toString()});
 }catch{throw new ProvisioningError('OAUTH_NETWORK','Falha ao conectar no provedor OAuth');}
 if(!response||response.status!==200)throw new ProvisioningError('OAUTH_FAILED','Provedor recusou o código OAuth');
 let data;try{data=await response.json();}catch{throw new ProvisioningError('OAUTH_FAILED','Resposta OAuth inválida');}
 if(data.error||typeof data.access_token!=='string'||data.access_token.length<16)
  throw new ProvisioningError('OAUTH_FAILED','Não foi possível concluir autorização OAuth');
 return {accessToken:data.access_token,refreshToken:typeof data.refresh_token==='string'?data.refresh_token:null,
  expiresAt:typeof data.expires_in==='number'?Date.now()+data.expires_in*1000:null};
}
