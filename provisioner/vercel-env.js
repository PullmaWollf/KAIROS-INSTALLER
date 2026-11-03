import {ProvisioningError,TEMPLATE_OWNER} from './plan.js';
import {preflightVercel} from './providers.js';
import {providerGet} from './provider-http.js';

const BASE='https://api.vercel.com';
const id=/^prj_[A-Za-z0-9_-]{4,100}$/;
const requiredKeys=['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SESSION_SECRET'];
function checkTarget({teamId,projectId,repoOwner,repoName}){
 if(!/^[a-z0-9_-]{4,64}$/i.test(teamId||'')||!id.test(projectId||''))throw new ProvisioningError('BAD_TARGET','Destino Vercel inválido');
 if(!/^[a-z0-9-]{1,39}$/i.test(repoOwner||'')||!/^[a-z0-9._-]{1,100}$/i.test(repoName||''))throw new ProvisioningError('BAD_REPO','GitHub inválido');
 if(repoOwner.toLowerCase()===TEMPLATE_OWNER.toLowerCase())throw new ProvisioningError('MAINTAINER_ACCOUNT','Não é permitido configurar projeto apontando para o repositório do mantenedor');
 return {teamId,projectId,repository:repoOwner+'/'+repoName};
}
export function environmentPlan({teamId,projectId,repoOwner,repoName}){
 return Object.freeze({...checkTarget({teamId,projectId,repoOwner,repoName}),keys:requiredKeys,scope:'production',mode:'dry-run',overwrites:false});
}
export function validateSecrets(secrets){
 if(!secrets||typeof secrets!=='object')throw new ProvisioningError('NO_SECRETS','Variáveis locais não configuradas');
 const url=secrets.SUPABASE_URL||'';
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(url))throw new ProvisioningError('BAD_SUPABASE_URL','URL Supabase inválida');
 if(typeof secrets.SUPABASE_SERVICE_ROLE_KEY!=='string'||secrets.SUPABASE_SERVICE_ROLE_KEY.length<20)throw new ProvisioningError('NO_SECRETS','Chave privada Supabase ausente');
 if(typeof secrets.SESSION_SECRET!=='string'||secrets.SESSION_SECRET.length<48)throw new ProvisioningError('NO_SECRETS','SESSION_SECRET requer ao menos 48 caracteres');
 return requiredKeys.map(key=>({key,value:secrets[key],type:'encrypted',target:['production']}));
}
async function verifyProject({fetcher,token,teamId,projectId,repository}){
 const response=await providerGet({fetcher,token,base:BASE,path:'/v9/projects/'+encodeURIComponent(projectId)+'?teamId='+encodeURIComponent(teamId),provider:'Vercel'});
 if(response?.id!==projectId||response?.accountId!==teamId)throw new ProvisioningError('WRONG_PROJECT','Projeto não pertence ao time confirmado');
 const link=response.link;
 if(!link||link.type!=='github'||String(link.repo||'').toLowerCase()!==repository.toLowerCase())throw new ProvisioningError('WRONG_REPO','Vincule e confira o GitHub da própria célula no projeto Vercel antes de configurar segredos');
 return true;
}
export async function configureVercelEnvironment({fetcher=fetch,token,target,secrets,approved=false}){
 if(!approved)throw new ProvisioningError('CONSENT','Confirme a configuração de segredos no projeto correto');
 const plan=environmentPlan(target);
 const vars=validateSecrets(secrets);
 await preflightVercel({fetcher,token,teamId:plan.teamId});
 await verifyProject({fetcher,token,teamId:plan.teamId,projectId:plan.projectId,repository:plan.repository});
 const path='/v10/projects/'+encodeURIComponent(plan.projectId)+'/env?teamId='+encodeURIComponent(plan.teamId);
 const old=await providerGet({fetcher,token,base:BASE,path,provider:'Vercel'});
 if(!Array.isArray(old?.envs))throw new ProvisioningError('BAD_RESPONSE','Vercel não retornou lista de variáveis; não é seguro continuar');
 if(old.envs.some(x=>requiredKeys.includes(x.key)&&(!Array.isArray(x.target)||x.target.includes('production'))))
  throw new ProvisioningError('EXISTS','Variáveis de produção já existem. Verifique no painel; atualização automática bloqueada');
 let response;
 try{
  response=await fetcher(BASE+path,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{
   Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json',
   'User-Agent':'kairos-installer-provisioner/0.5'
  },body:JSON.stringify(vars)});
 }catch{throw new ProvisioningError('NETWORK','Falha de rede; verifique variáveis no painel Vercel antes de repetir');}
 if(!response||response.status<200||response.status>=300)throw new ProvisioningError('WRITE_FAILED','Verifique o resultado no painel Vercel antes de repetir');
 return {status:'configured',projectId:plan.projectId,teamId:plan.teamId,keys:requiredKeys,environment:'production',next:'redeploy-required'};
}
