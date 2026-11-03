import {ProvisioningError,TEMPLATE_OWNER} from './plan.js';
import {providerGet} from './provider-http.js';
const safe=(v,re)=>typeof v==='string'&&re.test(v);
export async function reconcileGithub({fetcher=fetch,token,owner,repository}){
 if(!safe(owner,/^[a-z0-9-]{1,39}$/i)||!safe(repository,/^[a-z0-9._-]{1,100}$/i)||owner.toLowerCase()===TEMPLATE_OWNER.toLowerCase())
  throw new ProvisioningError('BAD_TARGET','Conta de destino GitHub inválida');
 let response;
 try{
  response=await fetcher('https://api.github.com/repos/'+owner+'/'+repository,{method:'GET',redirect:'error',
   signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});
 }catch{throw new ProvisioningError('RECONCILE_NETWORK','GitHub indisponível; execução bloqueada até verificar o recurso');}
 if(response.status===404)return {status:'missing',provider:'github'};
 if(response.status!==200)throw new ProvisioningError('RECONCILE_FAILED','Não foi possível confirmar repositório GitHub');
 let data;try{data=await response.json();}catch{throw new ProvisioningError('RECONCILE_FAILED','Resposta GitHub inválida');}
 if(data.full_name?.toLowerCase()!==(owner+'/'+repository).toLowerCase()||data.owner?.login?.toLowerCase()!==owner.toLowerCase())
  throw new ProvisioningError('WRONG_OWNER','Repositório GitHub retornado não corresponde ao destino');
 return {status:'exists-review',provider:'github',repository:data.full_name,reason:'A existência não comprova origem a partir do template'};
}
export async function reconcileSupabase({fetcher=fetch,token,organizationId,projectName}){
 if(!safe(organizationId,/^[a-z0-9_-]{4,64}$/i)||!safe(projectName,/^[a-z0-9-]{3,63}$/))
  throw new ProvisioningError('BAD_TARGET','Organização/projeto Supabase inválidos');
 const data=await providerGet({fetcher,token,base:'https://api.supabase.com',path:'/v1/projects',provider:'Supabase'});
 if(!Array.isArray(data))throw new ProvisioningError('RECONCILE_FAILED','A API não retornou lista de projetos');
 const matches=data.filter(x=>x?.name===projectName&&String(x.organization_id||x.organization_slug||'')===organizationId);
 if(matches.length>1)throw new ProvisioningError('AMBIGUOUS','Mais de um projeto com este nome; verificar manualmente');
 if(!matches.length)return {status:'missing',provider:'supabase'};
 if(!safe(matches[0].id,/^[a-z0-9]{8,32}$/i))throw new ProvisioningError('RECONCILE_FAILED','ID Supabase inesperado');
 return {status:'exists-review',provider:'supabase',projectRef:matches[0].id,reason:'Projeto existente requer confirmação de que pertence à instalação'};
}
export async function reconcileVercel({fetcher=fetch,token,teamId,projectName,repository}){
 if(!safe(teamId,/^[a-z0-9_-]{4,64}$/i)||!safe(projectName,/^[a-z0-9-]{3,63}$/)||
 !safe(repository,/^[a-z0-9-]{1,39}\/[a-z0-9._-]{1,100}$/i)||repository.split('/')[0].toLowerCase()===TEMPLATE_OWNER.toLowerCase())
  throw new ProvisioningError('BAD_TARGET','Destino Vercel inválido');
 let response;
 try{
  response=await fetcher('https://api.vercel.com/v9/projects/'+projectName+'?teamId='+encodeURIComponent(teamId),
   {method:'GET',redirect:'error',signal:AbortSignal.timeout(12000),headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 }catch{throw new ProvisioningError('RECONCILE_NETWORK','Vercel indisponível; não repetir criação automaticamente');}
 if(response.status===404)return {status:'missing',provider:'vercel'};
 if(response.status!==200)throw new ProvisioningError('RECONCILE_FAILED','Não foi possível inspecionar o projeto Vercel');
 let data;try{data=await response.json();}catch{throw new ProvisioningError('RECONCILE_FAILED','Resposta Vercel inválida');}
 if(data.accountId!==teamId||data.name!==projectName||data.link?.type!=='github'||String(data.link?.repo||'').toLowerCase()!==repository.toLowerCase())
  throw new ProvisioningError('WRONG_OWNER','Projeto Vercel pertence a outro destino ou está ligado a outro GitHub');
 if(!safe(data.id,/^prj_[a-z0-9_-]{4,100}$/i))throw new ProvisioningError('RECONCILE_FAILED','ID Vercel inválido');
 return {status:'exists-review',provider:'vercel',projectId:data.id,reason:'Projeto existente pode ter sido criado por outra instalação'};
}
