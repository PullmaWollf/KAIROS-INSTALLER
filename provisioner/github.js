import {ProvisioningError,TEMPLATE_OWNER,TEMPLATE_REPO} from './plan.js';
const BASE='https://api.github.com';
async function request(fetcher,token,method,path,payload){
 if(!token||typeof token!=='string')throw new ProvisioningError('NO_AUTH','GITHUB_TOKEN não configurado no ambiente local');
 const response=await fetcher(BASE+path,{
  method,redirect:'error',headers:{
   'Authorization':'Bearer '+token,
   'Accept':'application/vnd.github+json',
   'X-GitHub-Api-Version':'2022-11-28',
   'User-Agent':'kairos-installer-provisioner/0.2',
   ...(payload?{'Content-Type':'application/json'}:{})
  },...(payload?{body:JSON.stringify(payload)}:{})
 });
 if(!response||typeof response.status!=='number')throw new ProvisioningError('BAD_RESPONSE','Resposta do provedor inválida');
 let body;try{body=await response.json();}catch{throw new ProvisioningError('BAD_RESPONSE','Resposta inválida do GitHub');}
 if(response.status===401||response.status===403)throw new ProvisioningError('GITHUB_PERMISSION','Token inválido, sem permissão ou limite excedido');
 if(response.status===422)throw new ProvisioningError('REPO_CONFLICT','Nome inválido ou repositório já existente na conta');
 if(response.status===404)throw new ProvisioningError('NOT_FOUND','Conta, repositório ou template não encontrado');
 if(response.status<200||response.status>=300)throw new ProvisioningError('GITHUB_ERROR','Falha no GitHub (HTTP '+response.status+')');
 return body;
}
export async function preflightGithub({fetcher=fetch,token,plan}){
 const me=await request(fetcher,token,'GET','/user');
 if(!me.login||String(me.login).toLowerCase()!==plan.owner.toLowerCase())throw new ProvisioningError('WRONG_OWNER','O token não pertence ao proprietário escolhido. Utilize a conta da célula');
 if(String(me.login).toLowerCase()===TEMPLATE_OWNER.toLowerCase())throw new ProvisioningError('MAINTAINER_ACCOUNT','Não instale na conta do mantenedor');
 const template=await request(fetcher,token,'GET','/repos/'+TEMPLATE_OWNER+'/'+TEMPLATE_REPO);
 if(template.is_template!==true)throw new ProvisioningError('NOT_TEMPLATE','O mantenedor ainda precisa ativar "Template repository" no KAIROS-CORE');
 if(template.full_name?.toLowerCase()!==(TEMPLATE_OWNER+'/'+TEMPLATE_REPO).toLowerCase())throw new ProvisioningError('WRONG_TEMPLATE','Fonte do template inesperada');
 return {owner:me.login,source:template.full_name,ready:true};
}
export async function createGithubFromTemplate({fetcher=fetch,token,plan}){
 const repo=await request(fetcher,token,'POST','/repos/'+TEMPLATE_OWNER+'/'+TEMPLATE_REPO+'/generate',{
  owner:plan.owner,name:plan.repository,description:'KAIRÓS — '+plan.cellName,
  include_all_branches:false,private:plan.visibility==='private'
 });
 if(repo.full_name?.toLowerCase()!==(plan.owner+'/'+plan.repository).toLowerCase()||repo.owner?.login?.toLowerCase()!==plan.owner.toLowerCase())
  throw new ProvisioningError('RESULT_MISMATCH','GitHub retornou repositório com proprietário inesperado. Verifique manualmente');
 return {repository:repo.full_name,url:repo.html_url,private:repo.private===true};
}
