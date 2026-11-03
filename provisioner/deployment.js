import {ProvisioningError} from './plan.js';
import {providerGet} from './provider-http.js';
const id=/^prj_[a-z0-9_-]{4,100}$/i;
export function deployTarget({teamId,projectId}){
 if(!/^[a-z0-9_-]{4,64}$/i.test(teamId||'')||!id.test(projectId||''))throw new ProvisioningError('BAD_TARGET','Projeto ou time Vercel inválido');
 return {teamId,projectId};
}
export async function checkDeployment({fetcher=fetch,token,target}){
 const {teamId,projectId}=deployTarget(target);
 const data=await providerGet({fetcher,token,base:'https://api.vercel.com',
  path:'/v6/deployments?teamId='+encodeURIComponent(teamId)+'&projectId='+encodeURIComponent(projectId)+'&limit=10',provider:'Vercel'});
 if(!Array.isArray(data?.deployments))throw new ProvisioningError('BAD_RESPONSE','A API não retornou deployments válidos');
 const latest=data.deployments.find(d=>d.projectId===projectId&&d.target==='production');
 if(!latest)return {projectId,teamId,status:'no-production-deployment',ready:false};
 const state=String(latest.readyState||'UNKNOWN');
 const url=typeof latest.url==='string'&&/^[a-z\d.-]+\.vercel\.app$/i.test(latest.url)?'https://'+latest.url:null;
 return {projectId,teamId,status:state,ready:state==='READY',url,warning:state==='READY'?'Verifique manualmente API, login e permissões antes de divulgar':'Aguarde a publicação ou verifique erros no painel'};
}
