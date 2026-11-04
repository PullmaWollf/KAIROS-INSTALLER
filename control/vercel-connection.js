import {ControlError,encryptControl,decryptControl} from './crypto.js';
import {preflightVercel} from '../provisioner/providers.js';
import {providerGet} from '../provisioner/provider-http.js';

export const TEAM_ID=/^team_[A-Za-z0-9_-]{6,64}$/;
const TOKEN=/^[A-Za-z0-9._~-]{20,512}$/;
const KIND='vercel-management-v1';
const purpose=id=>'oauth:vercel:'+id;

export function validateVercelInput(value,env=process.env){
 if(!value||typeof value!=='object'||Array.isArray(value)||
    Object.keys(value).sort().join(',')!=='accessToken,teamId')
  throw new ControlError('BAD_VERCEL_CREDENTIAL','Informe somente ID do time e token');
 const {teamId,accessToken}=value;
 if(typeof teamId!=='string'||!TEAM_ID.test(teamId)||
    typeof accessToken!=='string'||!TOKEN.test(accessToken))
  throw new ControlError('BAD_VERCEL_CREDENTIAL','Credencial ou ID inválido');
 if(teamId===env.KAIROS_VERCEL_TEAM_ID)
  throw new ControlError('VERCEL_TEAM_FORBIDDEN','Use uma equipe de cliente, não a equipe do instalador');
 return {teamId,accessToken};
}

/** Never return provider tokens or raw provider bodies to the client. */
export async function connectVercel({db,userId,payload,env=process.env,fetcher=fetch}){
 if(!Number.isSafeInteger(userId)||userId<=0)throw new ControlError('LOGIN_REQUIRED');
 const {teamId,accessToken}=validateVercelInput(payload,env);
 let verified;
 try{
  verified=await preflightVercel({fetcher,token:accessToken,teamId});
  const projects=await providerGet({fetcher,base:'https://api.vercel.com',
   path:'/v9/projects?teamId='+encodeURIComponent(teamId)+'&limit=1',
   token:accessToken,provider:'Vercel'});
  if(!Array.isArray(projects?.projects))throw new Error('invalid-project-list');
 }catch{
  throw new ControlError('VERCEL_VERIFICATION_FAILED',
   'Não foi possível comprovar acesso à equipe com o token informado');
 }
 if(!verified?.accessible||verified.teamId!==teamId)
  throw new ControlError('VERCEL_VERIFICATION_FAILED');
 const record={kind:KIND,teamId,teamSlug:String(verified.teamSlug||'').slice(0,100),
  accessToken,verifiedAt:new Date().toISOString()};
 await db.saveConnection(userId,'vercel',encryptControl(record,purpose(userId),{env}));
 return {connected:true,teamId,teamSlug:record.teamSlug};
}
export async function readVercelConnection({db,userId,env=process.env}){
 if(!Number.isSafeInteger(userId)||userId<=0)throw new ControlError('LOGIN_REQUIRED');
 const envelope=await db.connection(userId,'vercel');
 if(!envelope)return null;
 const record=decryptControl(envelope,purpose(userId),{env});
 if(record?.kind!==KIND||!TEAM_ID.test(record.teamId||'')||
    typeof record.accessToken!=='string'||!TOKEN.test(record.accessToken)||
    record.teamId===env.KAIROS_VERCEL_TEAM_ID)return null;
 return record;
}
export function publicVercelConnection(record){
 return record?{teamId:record.teamId,teamSlug:record.teamSlug,verifiedAt:record.verifiedAt}:null;
}
