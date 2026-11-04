import {ControlError} from '../control/crypto.js';

/** Vercel generates its default .vercel.app hostname from the project name.
 * User-friendly names must be normalized before any provisioning POST.
 * The hostname is an expectation until Vercel reports the production alias.
 */
export function projectSlugForCell(cellName){
 if(typeof cellName!=='string'||cellName.trim().length<3||cellName.length>70)
  throw new ControlError('BAD_CELL_NAME');
 const label=cellName.normalize('NFKD').replace(/[\u0300-\u036f]/g,'')
  .toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'')
  .slice(0,55).replace(/-+$/g,'');
 if(!/^[a-z0-9][a-z0-9-]{1,54}$/.test(label))
  throw new ControlError('BAD_CELL_NAME','Escolha um nome com letras e números para o endereço Vercel');
 return label;
}
export function proposedCellDomain(cellName){
 return projectSlugForCell(cellName)+'.vercel.app';
}

const projectIdPattern=/^prj_[a-z0-9_-]{4,100}$/i;
const teamIdPattern=/^team_[a-z0-9_-]{6,64}$/i;
function checked({token,teamId,projectId,cellName}){
 if(typeof token!=='string'||!token||!teamIdPattern.test(teamId||'')||
  !projectIdPattern.test(projectId||''))throw new ControlError('BAD_TARGET');
 return {teamId,projectId,domain:proposedCellDomain(cellName)};
}
async function getJson(fetcher,url,token){
 let response;
 try{response=await fetcher(url,{method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),
  headers:{Authorization:'Bearer '+token,Accept:'application/json'}});}
 catch{throw new ControlError('DOMAIN_NETWORK','Não foi possível verificar o domínio na Vercel');}
 if(response?.status!==200)throw new ControlError('DOMAIN_READ_FAILED');
 try{return await response.json();}catch{throw new ControlError('DOMAIN_BAD_RESPONSE');}
}
export async function verifiedCellDomain({fetcher=fetch,token,teamId,projectId,cellName}){
 const target=checked({token,teamId,projectId,cellName});
 const base='https://api.vercel.com';
 const scope='?teamId='+encodeURIComponent(teamId);
 const project=await getJson(fetcher,base+'/v9/projects/'+encodeURIComponent(projectId)+scope,token);
 if(project?.id!==projectId||project.accountId!==teamId)throw new ControlError('WRONG_PROJECT');
 const list=await getJson(fetcher,base+'/v9/projects/'+encodeURIComponent(projectId)+'/domains'+scope,token);
 if(!Array.isArray(list?.domains))throw new ControlError('DOMAIN_BAD_RESPONSE');
 const linked=list.domains.find(d=>d?.name===target.domain&&
  (!d.projectId||d.projectId===projectId));
 return linked?{status:'linked',url:'https://'+target.domain,domain:target.domain}:null;
}
export async function ensureCellDomain({fetcher=fetch,token,teamId,projectId,cellName}){
 const target=checked({token,teamId,projectId,cellName});
 const existing=await verifiedCellDomain({fetcher,token,teamId,projectId,cellName});
 if(existing)return existing;
 let response;
 try{
  response=await fetcher('https://api.vercel.com/v10/projects/'+encodeURIComponent(projectId)+
   '/domains?teamId='+encodeURIComponent(teamId),{
   method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),
   headers:{Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json'},
   body:JSON.stringify({name:target.domain})
  });
 }catch{throw new ControlError('DOMAIN_UNCERTAIN','A criação do domínio pode ter ocorrido; verificar antes de repetir');}
 if(!response||response.status===401||response.status===403)
  throw new ControlError('DOMAIN_PERMISSION');
 if(response.status===409||response.status===400)
  throw new ControlError('DOMAIN_UNAVAILABLE','Endereço indisponível; nunca substituir domínio de terceiros');
 if(response.status<200||response.status>=300)
  throw new ControlError('DOMAIN_UNCERTAIN');
 let body;try{body=await response.json();}catch{throw new ControlError('DOMAIN_UNCERTAIN');}
 if(body?.name!==target.domain||(body.projectId&&body.projectId!==projectId))
  throw new ControlError('DOMAIN_UNCERTAIN');
 return {status:'added',url:'https://'+target.domain,domain:target.domain};
}
