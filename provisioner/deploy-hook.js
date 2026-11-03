import {ProvisioningError} from './plan.js';
import {preflightVercel} from './providers.js';
import {providerGet} from './provider-http.js';
import {checkDeployment,deployTarget} from './deployment.js';
export function validateDeployHook({hookUrl,projectId}){
 deployTarget({teamId:'team_validation',projectId});
 if(typeof hookUrl!=='string')throw new ProvisioningError('BAD_HOOK','Hook Vercel ausente');
 let url;try{url=new URL(hookUrl);}catch{throw new ProvisioningError('BAD_HOOK','Deploy Hook inválido');}
 const prefix='/v1/integrations/deploy/'+projectId+'/';
 const token=url.pathname.startsWith(prefix)?url.pathname.slice(prefix.length):'';
 if(url.protocol!=='https:'||url.hostname!=='api.vercel.com'||url.port||url.username||url.password||url.search||url.hash||!/^[A-Za-z0-9_-]{10,256}$/.test(token))
  throw new ProvisioningError('BAD_HOOK','Hook deve pertencer ao projeto Vercel confirmado');
 return hookUrl;
}
export async function triggerProductionDeploy({fetcher=fetch,token,target,hookUrl,repoOwner,repoName,approved=false,after=Date.now()}){
 if(!approved)throw new ProvisioningError('CONSENT','Confirme deploy no projeto da célula');
 const {teamId,projectId}=deployTarget(target);
 validateDeployHook({hookUrl,projectId});
 if(!/^[a-z0-9-]{1,39}$/i.test(repoOwner||'')||!repoName||repoOwner.toLowerCase()==='pullmawollf')
  throw new ProvisioningError('BAD_REPO','Repositório de destino GitHub inválido');
 await preflightVercel({fetcher,token,teamId});
 const details=await providerGet({fetcher,token,base:'https://api.vercel.com',
  path:'/v9/projects/'+projectId+'?teamId='+encodeURIComponent(teamId),provider:'Vercel'});
 if(details?.id!==projectId||details?.accountId!==teamId||details?.link?.type!=='github'||
 String(details?.link?.repo||'').toLowerCase()!==(repoOwner+'/'+repoName).toLowerCase())
  throw new ProvisioningError('WRONG_PROJECT','Deploy bloqueado: time ou repositório GitHub diferente do confirmado');
 let response;
 try{response=await fetcher(hookUrl,{method:'POST',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Accept:'application/json'}});}
 catch{throw new ProvisioningError('DEPLOY_UNCERTAIN','Falha de rede ao disparar hook; não tente novamente antes de consultar Vercel');}
 if(![200,201,202].includes(response?.status))throw new ProvisioningError('DEPLOY_UNCERTAIN','Hook não confirmou criação. Verifique no painel Vercel');
 let job;try{job=await response.json();}catch{throw new ProvisioningError('DEPLOY_UNCERTAIN','Hook retornou resposta inesperada');}
 if(typeof job?.job?.id!=='string'||!job.job.id)throw new ProvisioningError('DEPLOY_UNCERTAIN','Deploy Hook sem ID de job');
 return {status:'triggered',projectId,teamId,jobAccepted:true,ready:false,after};
}
export async function inspectProductionAfter({fetcher=fetch,token,target,after}){
 const r=await checkDeployment({fetcher,token,target});
 if(!r.ready||!r.url||!Number.isFinite(r.createdAt)||r.createdAt<=after)return {status:'waiting',ready:false};
 return {status:'ready',ready:true,url:r.url,projectId:r.projectId,teamId:r.teamId};
}
