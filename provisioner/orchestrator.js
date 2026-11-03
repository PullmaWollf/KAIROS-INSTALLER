import {ProvisioningError} from './plan.js';
import {readJournal,writeJournal} from './journal.js';
import {nextPhase,completePhase,updateTargets,workflowSummary} from './workflow.js';
import {readRecovery,writeRecovery,newRecovery,beginOperation,settleOperation,recoveryStatus} from './recovery.js';
import {preflightGithub,createGithubFromTemplate} from './github.js';
import {createSupabaseProject,createVercelProject} from './create-projects.js';
import {migrationPlan,migrateSupabase,inspectCore} from './migrations.js';
import {environmentPlan,configureVercelEnvironment,validateSecrets} from './vercel-env.js';
import {bootstrapPlan,bootstrapAdmin} from './bootstrap.js';
import {checkDeployment} from './deployment.js';
import {smokeTest} from './smoke.js';
import {reconcileGithub,reconcileSupabase,reconcileVercel} from './reconcile.js';

export function guardConsent(config,consent){
 if(!consent?.execute||!consent?.acceptBilling||
  consent.owner!==config.owner||consent.organizationId!==config.supabaseOrgId||consent.teamId!==config.vercelTeamId)
  throw new ProvisioningError('CONSENT','Confirme execução, possíveis custos, proprietário GitHub, organização Supabase e time Vercel');
}
export function operationEnvironment(phase,env={}){
 const groups={
  github:['GITHUB_TOKEN'],
  supabase:['SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD'],
  migrate:['SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD'],
  vercel:['VERCEL_TOKEN'],
  env:['VERCEL_TOKEN','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SESSION_SECRET'],
  bootstrap:['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ADMIN_PASSWORD'],
  deploy:['VERCEL_TOKEN'],
  smoke:[]
 };
 const missing=(groups[phase]||[]).filter(k=>typeof env[k]!=='string'||!env[k]);
 if(missing.length)throw new ProvisioningError('NO_AUTH','Variáveis locais obrigatórias para '+phase+': '+missing.join(', '));
}
export function createOperations({fetcher=fetch,runner}={}){
 const run=runner||(()=>{throw new ProvisioningError('NO_RUNNER','Runner local não configurado');});
 return {
  async precheck(phase,c,e){
   operationEnvironment(phase,e);
   if(['migrate','bootstrap'].includes(phase)){
    const p=migrationPlan({projectRef:c.supabaseRef,repoOwner:c.owner,coreDir:c.coreDir});
    await inspectCore({plan:p,runner:run});
   }
   if(phase==='env'){
    environmentPlan({teamId:c.vercelTeamId,projectId:c.vercelProjectId,repoOwner:c.owner,repoName:c.repository});
    validateSecrets({SUPABASE_URL:e.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:e.SUPABASE_SERVICE_ROLE_KEY,SESSION_SECRET:e.SESSION_SECRET});
    if(e.SUPABASE_URL!=='https://'+c.supabaseRef+'.supabase.co')throw new ProvisioningError('WRONG_SUPABASE','URL do banco não pertence ao projeto esperado');
   }
   if(phase==='bootstrap'&&e.SUPABASE_URL!=='https://'+c.supabaseRef+'.supabase.co')throw new ProvisioningError('WRONG_SUPABASE','URL Supabase difere do ref escolhido');
  },
  async run(phase,c,e){
   if(phase==='github'){
    const p={owner:c.owner,repository:c.repository,cellName:c.cellName,visibility:c.visibility};
    await preflightGithub({fetcher,token:e.GITHUB_TOKEN,plan:p});
    return await createGithubFromTemplate({fetcher,token:e.GITHUB_TOKEN,plan:p});
   }
   if(phase==='supabase')return await createSupabaseProject({fetcher,token:e.SUPABASE_ACCESS_TOKEN,approved:true,dbPassword:e.SUPABASE_DB_PASSWORD,
    plan:{organizationId:c.supabaseOrgId,projectName:c.repository,region:c.supabaseRegion}});
   if(phase==='migrate')return await migrateSupabase({plan:migrationPlan({projectRef:c.supabaseRef,repoOwner:c.owner,coreDir:c.coreDir}),runner:run,approved:true,environment:e});
   if(phase==='vercel')return await createVercelProject({fetcher,token:e.VERCEL_TOKEN,approved:true,
    plan:{teamId:c.vercelTeamId,projectName:c.repository,repoOwner:c.owner,repoName:c.repository}});
   if(phase==='env')return await configureVercelEnvironment({fetcher,token:e.VERCEL_TOKEN,approved:true,
    target:{teamId:c.vercelTeamId,projectId:c.vercelProjectId,repoOwner:c.owner,repoName:c.repository},
    secrets:{SUPABASE_URL:e.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:e.SUPABASE_SERVICE_ROLE_KEY,SESSION_SECRET:e.SESSION_SECRET}});
   if(phase==='bootstrap')return await bootstrapAdmin({plan:bootstrapPlan({coreDir:c.coreDir,repoOwner:c.owner,adminLogin:c.adminLogin,adminName:c.adminName}),
    runner:run,approved:true,environment:{SUPABASE_URL:e.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:e.SUPABASE_SERVICE_ROLE_KEY,ADMIN_PASSWORD:e.ADMIN_PASSWORD}});
   if(phase==='deploy'){
    const d=await checkDeployment({fetcher,token:e.VERCEL_TOKEN,target:{teamId:c.vercelTeamId,projectId:c.vercelProjectId}});
    if(!d.ready||!d.url)throw new ProvisioningError('DEPLOY_WAITING','Aguarde deployment de produção READY após configuração das variáveis');
    return d;
   }
   if(phase==='smoke')return await smokeTest({fetcher,url:c.pwaUrl,approved:true});
   throw new ProvisioningError('BAD_PHASE','Etapa desconhecida');
  },
  async reconcile(phase,c,e){
   if(phase==='github')return await reconcileGithub({fetcher,token:e.GITHUB_TOKEN,owner:c.owner,repository:c.repository});
   if(phase==='supabase')return await reconcileSupabase({fetcher,token:e.SUPABASE_ACCESS_TOKEN,organizationId:c.supabaseOrgId,projectName:c.repository});
   if(phase==='vercel')return await reconcileVercel({fetcher,token:e.VERCEL_TOKEN,teamId:c.vercelTeamId,projectName:c.repository,repository:c.owner+'/'+c.repository});
   return {status:'manual-review',reason:'Esta etapa não possui reconciliação remota confiável'};
  }
 };
}
/** Persistent intent-before-effect. Once a remote write starts, a timeout NEVER causes an automatic retry. */
export async function executeNext({stateFile,recoveryFile,env={},consent={},ops=createOperations()}){
 let state=await readJournal(stateFile);
 const phase=nextPhase(state);
 if(!phase)return {status:'all-recorded',...workflowSummary(state)};
 if(!consent.execute)return {status:'dry-run',phase,requiresConsent:true,doesNotAccessProviders:true};
 guardConsent(state.config,consent);
 let recovery;
 try{recovery=await readRecovery(recoveryFile);}
 catch(e){
  if(e.code!=='ENOENT')throw e;
  recovery=await writeRecovery(recoveryFile,newRecovery(state.config),{initial:true});
 }
 const scope=recovery.scope;
 if(scope.owner!==state.config.owner||scope.repository!==state.config.repository||scope.supabaseOrgId!==state.config.supabaseOrgId||
 scope.vercelTeamId!==state.config.vercelTeamId)throw new ProvisioningError('WRONG_SCOPE','Registro de operações pertence a outra instalação');
 const previous=recoveryStatus(recovery,phase);
 if(previous!=='never-attempted'){
  // Reconcile only read-only. Even if matching resource exists, don't claim it was created by us.
  if(previous==='confirmed')throw new ProvisioningError('STATE_DRIFT','Operação confirmada, mas etapa ausente no progresso. Inspecione antes de continuar');
  operationEnvironment(phase,env);
  let finding;
  try{finding=await ops.reconcile(phase,state.config,env);}
  catch{finding={status:'unknown'};}
  return {status:'needs-review',phase,reconciliation:finding,automaticRetry:false};
 }
 await ops.precheck(phase,state.config,env);
 const started=beginOperation(recovery,phase);
 await writeRecovery(recoveryFile,started,{expected:recovery});
 let result;
 try{result=await ops.run(phase,state.config,env);}
 catch(e){
  const uncertain=settleOperation(started,phase,{confirmed:false});
  await writeRecovery(recoveryFile,uncertain,{expected:started});
  return {status:'needs-review',phase,reason:e instanceof ProvisioningError?e.code:'UNEXPECTED',automaticRetry:false};
 }
 let updated=state;
 if(phase==='supabase')updated=updateTargets(updated,{supabaseRef:result.projectRef});
 if(phase==='vercel')updated=updateTargets(updated,{vercelProjectId:result.projectId});
 if(phase==='deploy')updated=updateTargets(updated,{pwaUrl:result.url});
 // No secrets, response bodies or access tokens written in either journal.
 const completed=settleOperation(started,phase,{confirmed:true,outcome:phase==='smoke'?'smoke-checked':'provider-confirmed'});
 await writeRecovery(recoveryFile,completed,{expected:started});
 const next=completePhase(updated,phase,{verified:phase==='smoke'});
 await writeJournal(stateFile,next,{expected:state});
 return {status:'recorded',phase,completed:workflowSummary(next).completed,next:nextPhase(next)};
}
export async function executeSequence(input){
 const report=[];
 for(let i=0;i<8;i++){
  const step=await executeNext(input);
  report.push(step);
  if(step.status!=='recorded')break;
 }
 return {report,completedAll:report.at(-1)?.status==='all-recorded'||report.length===8&&report.at(-1)?.next===null};
}
