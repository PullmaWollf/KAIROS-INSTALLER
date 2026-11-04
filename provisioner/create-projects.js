import {ProvisioningError,TEMPLATE_OWNER} from './plan.js';
import {preflightSupabase,preflightVercelAccount} from './providers.js';
import {vercelScope,vercelQuery} from './vercel-scope.js';

const SUPABASE_API='https://api.supabase.com/v1/projects';
const VERCEL_API='https://api.vercel.com/v11/projects';
const projectPattern=/^[a-z0-9][a-z0-9-]{2,62}$/;
const regions=new Set(['us-east-1','us-west-1','us-west-2','sa-east-1','eu-west-1','eu-west-2','eu-central-1','ap-southeast-1','ap-southeast-2','ap-northeast-1']);
const idPattern=/^[a-z0-9_-]{4,64}$/i;
function value(v){return typeof v==='string'?v.trim():'';}
function notMaintainer(v,field){
 if(!v||v.toLowerCase()===TEMPLATE_OWNER.toLowerCase())throw new ProvisioningError('MAINTAINER_ACCOUNT',field+' não pode apontar para o mantenedor');
 return v;
}
export function supabaseProjectPlan({organizationId,projectName,region}){
 if(!idPattern.test(value(organizationId)))throw new ProvisioningError('BAD_ORG','Organização Supabase inválida');
 const name=value(projectName);
 if(!projectPattern.test(name))throw new ProvisioningError('BAD_PROJECT','Nome do projeto inválido');
 if(!regions.has(region))throw new ProvisioningError('BAD_REGION','Região não homologada; escolha uma região da lista suportada');
 return Object.freeze({provider:'supabase',organizationId,projectName:name,region,createsResources:true,mayIncurCharges:true});
}
export function vercelProjectPlan({teamId,projectName,repoOwner,repoName}){
 vercelScope(teamId);
 if(!projectPattern.test(value(projectName)))throw new ProvisioningError('BAD_PROJECT','Nome do projeto inválido');
 if(!/^[a-z\d][a-z\d-]{0,38}$/i.test(value(repoOwner)))throw new ProvisioningError('BAD_OWNER','Proprietário GitHub inválido');
 notMaintainer(repoOwner,'GitHub');
 if(!/^[a-z\d._-]{1,100}$/i.test(value(repoName)))throw new ProvisioningError('BAD_REPO','Repositório inválido');
 return Object.freeze({provider:'vercel',teamId,projectName,repository:repoOwner+'/'+repoName,createsResources:true,mayIncurCharges:true});
}
async function postJson({fetcher,token,url,body,provider}){
 if(!token)throw new ProvisioningError('NO_AUTH',provider+': credencial local não configurada');
 let response;
 try{
  response=await fetcher(url,{method:'POST',redirect:'error',signal:AbortSignal.timeout(20000),headers:{
   Authorization:'Bearer '+token,Accept:'application/json','Content-Type':'application/json',
   'User-Agent':'kairos-installer-provisioner/0.4'
  },body:JSON.stringify(body)});
 }catch{throw new ProvisioningError('NETWORK',provider+': conexão interrompida. Verifique no painel antes de repetir: o projeto pode ter sido criado');}
 if(!response||!Number.isInteger(response.status))throw new ProvisioningError('BAD_RESPONSE',provider+': retorno inválido; verifique no painel');
 if(response.status===401||response.status===403)throw new ProvisioningError('PERMISSION',provider+': autorização ou permissão insuficiente');
 if(response.status===409||response.status===422)throw new ProvisioningError('CONFLICT',provider+': conflito de nome/limite; confirme no painel antes de repetir');
 if(response.status<200||response.status>=300)throw new ProvisioningError('PROVIDER_ERROR',provider+': HTTP '+response.status+'; verifique se houve criação antes de repetir');
 try{return await response.json();}catch{throw new ProvisioningError('BAD_RESPONSE',provider+': resposta incompleta; confira no painel antes de repetir');}
}
export async function createSupabaseProject({fetcher=fetch,token,plan,dbPassword,approved=false}){
 if(!approved)throw new ProvisioningError('CONSENT','É necessário autorizar explicitamente a criação e os custos');
 const p=supabaseProjectPlan(plan);
 if(typeof dbPassword!=='string'||dbPassword.length<20||dbPassword.length>128)throw new ProvisioningError('BAD_PASSWORD','Defina senha aleatória forte com 20 a 128 caracteres por ambiente local');
 const pre=await preflightSupabase({fetcher,token,organizationId:p.organizationId});
 // Membership is not proof of ownership. Consent of the account holder is mandatory.
 if(!pre.accessible)throw new ProvisioningError('NOT_MEMBER','Organização inacessível');
 const created=await postJson({fetcher,token,url:SUPABASE_API,provider:'Supabase',
  body:{name:p.projectName,organization_slug:pre.organizationSlug,region:p.region,db_pass:dbPassword}});
 const id=created?.ref;
 if(typeof id!=='string'||!/^[a-z0-9]{8,32}$/i.test(id))throw new ProvisioningError('BAD_RESPONSE','Resposta sem identificador válido; confira o projeto no painel antes de repetir');
 return {provider:'supabase',projectRef:id,organizationId:p.organizationId,projectName:p.projectName,status:'created',next:'migrations-pending'};
}
export async function createVercelProject({fetcher=fetch,token,plan,approved=false,operatorMode=false}){
 if(!approved)throw new ProvisioningError('CONSENT','É necessário autorizar explicitamente a criação e os custos');
 const p=vercelProjectPlan(plan);
 const pre=await preflightVercelAccount({fetcher,token,teamId:p.teamId,operatorMode});
 if(!pre.accessible)throw new ProvisioningError('NOT_MEMBER','Time inacessível');
 const created=await postJson({fetcher,token,url:VERCEL_API+vercelQuery(p.teamId),provider:'Vercel',
  body:{name:p.projectName,framework:null,gitRepository:{type:'github',repo:p.repository}}});
 const id=created?.id,accountId=created?.accountId;
 if(typeof id!=='string'||!/^prj_[a-z0-9_-]+$/i.test(id)||accountId!==vercelScope(p.teamId).providerAccountId)
  throw new ProvisioningError('BAD_RESPONSE','A Vercel não confirmou o destino solicitado; confira o painel antes de repetir');
 return {provider:'vercel',projectId:id,teamId:p.teamId,repository:p.repository,status:'created',next:'environment-and-deploy-pending'};
}
