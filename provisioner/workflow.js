import {ProvisioningError,TEMPLATE_OWNER,validatePlan} from './plan.js';
import {supabaseProjectPlan,vercelProjectPlan} from './create-projects.js';
import {environmentPlan} from './vercel-env.js';
import {migrationPlan} from './migrations.js';
import {bootstrapPlan} from './bootstrap.js';
import {smokePlan} from './smoke.js';
export const PHASES=Object.freeze([
 {id:'github',label:'Cópia GitHub da célula'},
 {id:'supabase',label:'Projeto Supabase da célula'},
 {id:'migrate',label:'Migrações do banco'},
 {id:'vercel',label:'Projeto Vercel da célula'},
 {id:'env',label:'Variáveis privadas da Vercel'},
 {id:'bootstrap',label:'Administrador inicial'},
 {id:'deploy',label:'Deploy de produção'},
 {id:'smoke',label:'Verificação das APIs do PWA'}
]);
const keys=Object.freeze(['owner','repository','cellName','visibility','supabaseOrgId','supabaseRef','supabaseRegion','vercelTeamId','vercelProjectId','coreDir','adminLogin','adminName','pwaUrl']);
function clean(value){return typeof value==='string'?value.trim():'';}
export function validateWorkflowConfig(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new ProvisioningError('BAD_CONFIG','Configuração inválida');
 for(const key of Object.keys(input))if(!keys.includes(key))throw new ProvisioningError('UNKNOWN_FIELD','Campo não permitido. Não informe credenciais ou segredos: '+key);
 const p=validatePlan({owner:input.owner,repository:input.repository,cellName:input.cellName,visibility:input.visibility});
 // All external destinations must be explicitly chosen by the customer. No maintainer defaults.
 const config={...p,supabaseOrgId:clean(input.supabaseOrgId),supabaseRef:clean(input.supabaseRef),
  supabaseRegion:clean(input.supabaseRegion),vercelTeamId:clean(input.vercelTeamId),
  vercelProjectId:clean(input.vercelProjectId),coreDir:clean(input.coreDir),
  adminLogin:clean(input.adminLogin),adminName:clean(input.adminName),pwaUrl:clean(input.pwaUrl)};
 if(!config.supabaseOrgId||!config.vercelTeamId||!config.coreDir||!config.adminLogin)throw new ProvisioningError('MISSING_TARGET','Informe organizações, diretório Core e login administrativo');
 supabaseProjectPlan({organizationId:config.supabaseOrgId,projectName:p.repository,region:config.supabaseRegion});
 // This plan does not require project IDs until the provider has returned them.
 if(config.vercelProjectId)vercelProjectPlan({teamId:config.vercelTeamId,projectName:p.repository,repoOwner:p.owner,repoName:p.repository});
 else if(!/^[a-z0-9_-]{4,64}$/i.test(config.vercelTeamId))throw new ProvisioningError('BAD_TEAM','Time Vercel inválido');
 if(config.supabaseRef)migrationPlan({projectRef:config.supabaseRef,repoOwner:p.owner,coreDir:config.coreDir});
 bootstrapPlan({coreDir:config.coreDir,repoOwner:p.owner,adminLogin:config.adminLogin,adminName:config.adminName||'Administrador'});
 if(config.vercelProjectId)environmentPlan({teamId:config.vercelTeamId,projectId:config.vercelProjectId,repoOwner:p.owner,repoName:p.repository});
 if(config.pwaUrl)smokePlan({url:config.pwaUrl});
 if(p.owner.toLowerCase()===TEMPLATE_OWNER.toLowerCase())throw new ProvisioningError('MAINTAINER_ACCOUNT','Conta do mantenedor é proibida');
 return Object.freeze(config);
}
export function requiredForPhase(phase,c){
 const byPhase={github:[],supabase:[],migrate:['supabaseRef'],vercel:[],
  env:['vercelProjectId','supabaseRef'],bootstrap:['supabaseRef'],deploy:['vercelProjectId'],smoke:['pwaUrl']};
 return (byPhase[phase]||[]).filter(k=>!c[k]);
}
export function newWorkflow(input){
 const config=validateWorkflowConfig(input);
 return {format:1,config,steps:Object.fromEntries(PHASES.map(x=>[x.id,{state:'pending'}]))};
}
export function validateWorkflow(state){
 if(!state||state.format!==1||!state.steps||typeof state.steps!=='object')throw new ProvisioningError('BAD_STATE','Registro de instalação inválido');
 const config=validateWorkflowConfig(state.config);
 const statuses=new Set(['pending','attested','verified']);
 const steps={};
 let priorComplete=true;
 for(const phase of PHASES){
  const entry=state.steps[phase.id];
  if(!entry||!statuses.has(entry.state)||Object.keys(entry).some(k=>!['state','at','evidence'].includes(k)))throw new ProvisioningError('BAD_STATE','Etapa inválida: '+phase.id);
  if(entry.state!=='pending'){
   if(!priorComplete)throw new ProvisioningError('BAD_ORDER','Etapas concluídas fora de ordem');
   if(requiredForPhase(phase.id,config).length)throw new ProvisioningError('MISSING_TARGET','Destino não configurado para '+phase.id);
   if(typeof entry.at!=='string'||Number.isNaN(Date.parse(entry.at)))throw new ProvisioningError('BAD_STATE','Data inválida');
   if(entry.state==='verified'&&phase.id!=='smoke')throw new ProvisioningError('BAD_STATE','Somente smoke test possui verificação automática nesta versão');
   if(entry.evidence!==undefined&&!['manual','smoke-checks'].includes(entry.evidence))throw new ProvisioningError('BAD_STATE','Evidência inválida');
  }
  steps[phase.id]={...entry};
  priorComplete=entry.state!=='pending';
 }
 if(Object.keys(state.steps).length!==PHASES.length)throw new ProvisioningError('BAD_STATE','Etapas inesperadas');
 return {format:1,config,steps};
}
export function nextPhase(state){
 const s=validateWorkflow(state);
 return PHASES.find(p=>s.steps[p.id].state==='pending')?.id||null;
}
export function completePhase(state,id,{verified=false,now=new Date()}={}){
 const s=validateWorkflow(state);
 if(!PHASES.some(x=>x.id===id))throw new ProvisioningError('BAD_PHASE','Etapa desconhecida');
 if(s.steps[id].state!=='pending')throw new ProvisioningError('ALREADY_COMPLETE','Etapa já marcada; não repita operações reais sem conferir o painel');
 if(nextPhase(s)!==id)throw new ProvisioningError('BAD_ORDER','Conclua as etapas anteriores antes');
 if(requiredForPhase(id,s.config).length)throw new ProvisioningError('MISSING_TARGET','Faltam identificadores para a etapa '+id);
 if(verified&&id!=='smoke')throw new ProvisioningError('NOT_VERIFIED','Esta etapa não dispõe de verificação automática');
 if(!Number.isFinite(now.getTime()))throw new ProvisioningError('BAD_DATE','Data inválida');
 s.steps[id]={state:verified?'verified':'attested',at:now.toISOString(),evidence:verified?'smoke-checks':'manual'};
 return s;
}
export function updateTargets(state,updates){
 const s=validateWorkflow(state);
 if(!updates||typeof updates!=='object'||Array.isArray(updates)||Object.keys(updates).some(k=>!['supabaseRef','vercelProjectId','pwaUrl'].includes(k)))
  throw new ProvisioningError('IMMUTABLE_CONFIG','Somente IDs produzidos durante a instalação podem ser acrescentados');
 for(const [key,val] of Object.entries(updates)){
  if(s.config[key]&&s.config[key]!==val)throw new ProvisioningError('IMMUTABLE_CONFIG','Destino já definido; não altere em andamento');
 }
 return validateWorkflow({...s,config:{...s.config,...updates}});
}
export function workflowSummary(state){
 const s=validateWorkflow(state);
 const done=PHASES.filter(p=>s.steps[p.id].state!=='pending').length;
 return {progress:Math.round(100*done/PHASES.length),completed:done,total:PHASES.length,
  next:nextPhase(s),ready:PHASES.every(p=>s.steps[p.id].state!=='pending'),
  homologated:false,steps:PHASES.map(p=>({id:p.id,label:p.label,state:s.steps[p.id].state}))};
}
