import {ProvisioningError} from './plan.js';

/** Small read-only provider client. Never echo response bodies, token values or provider errors. */
export async function providerGet({fetcher=fetch,base,path,token,provider}){
 if(typeof token!=='string'||!token.trim())throw new ProvisioningError('NO_AUTH',provider+': credencial local ausente');
 let response;
 try{
  response=await fetcher(base+path,{method:'GET',redirect:'error',headers:{
   Authorization:'Bearer '+token,
   Accept:'application/json',
   'User-Agent':'kairos-installer-preflight/0.3'
  },signal:AbortSignal.timeout(15000)});
 }catch{throw new ProvisioningError('NETWORK',provider+': falha de conexão ou timeout');}
 if(!response||!Number.isInteger(response.status))throw new ProvisioningError('BAD_RESPONSE',provider+': resposta inválida');
 if(response.status===401||response.status===403)throw new ProvisioningError('PERMISSION',provider+': autenticação ou permissão insuficiente');
 if(response.status===429)throw new ProvisioningError('RATE_LIMIT',provider+': limite de requisições atingido');
 if(response.status<200||response.status>=300)throw new ProvisioningError('PROVIDER_ERROR',provider+': resposta HTTP '+response.status);
 try{return await response.json();}catch{throw new ProvisioningError('BAD_RESPONSE',provider+': conteúdo inválido');}
}
