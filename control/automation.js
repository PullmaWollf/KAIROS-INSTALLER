import {ControlError} from './crypto.js';
import {phaseFor} from './plan.js';
import {assertHomologationScope} from './homologation-guard.js';
import {validateProductionScope,assertExecutionScope} from './production-guard.js';
import {executeCloudStep,reconcileCloudStep} from './engine.js';
import {cloudOps} from './cloud-worker.js';
import {assertZeroCostEligibility} from './zero-cost-audit.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const allowedErrors=/^[A-Z0-9_]{2,40}$/;
const safeCode=e=>allowedErrors.test(String(e?.code||''))?e.code:'REMOTE_UNCERTAIN';

/** A durable worker is inert until explicitly configured. No fallback to OAuth tokens. */
export function automationReady(env=process.env){
 return env.KAIROS_AUTOMATION_ENABLED==='1'&&
  (env.KAIROS_HOMOLOGATION_MODE==='1')!==
   (env.KAIROS_PRODUCTION_MODE==='1')&&
  env.KAIROS_CONTROL_ENABLE_WRITES==='1'&&
  env.KAIROS_VERCEL_MANAGEMENT_ENABLED==='1'&&
  env.KAIROS_ENABLE_BETA_SQL==='1'&&
  env.KAIROS_ENABLE_GIT_DEPLOY==='1';
}
function requireLiveAutomation(env){
 if(!automationReady(env))throw new ControlError('AUTOMATION_DISABLED',
  'A execução automática não foi habilitada para a homologação isolada');
}
function matchesJob(job,row){
 return row&&row.id===job.installationId&&Number(row.github_id)===job.userId&&
  row.owner===job.owner&&row.repository===job.repository&&
  row.supabase_org_id===job.supabaseOrgId&&
  row.vercel_team_id===job.vercelTeamId&&job.acceptBilling===true;
}
/** Approval stored in DB as a snapshot of the exact authorized destinations.
 * Queueing does not run a provider POST and cannot run while any safety gate is off.
 */
export async function authorizeAutomation({db,userId,row,approval,login,env=process.env,fetcher=fetch}){
 requireLiveAutomation(env);
 if(!row||!uuid.test(row.id)||Number(row.phase_index)!==0||
  !approval||approval.execute!==true||approval.acceptBilling!==true||
  approval.expectedPhase!=='github'||approval.owner!==row.owner||
  approval.supabaseOrgId!==row.supabase_org_id||
  approval.vercelTeamId!==row.vercel_team_id||
  approval.repository!==row.repository)
  throw new ControlError('CONSENT_REQUIRED');
 const production=env.KAIROS_PRODUCTION_MODE==='1';
 if(production)validateProductionScope({env,userId,row,login});
 else assertHomologationScope({env,userId,row});
 if(env.KAIROS_ZERO_COST_ONLY==='1')
  await assertZeroCostEligibility({db,userId,organizationId:row.supabase_org_id,
   vercelTeamId:row.vercel_team_id,env,fetcher});
 const expiresAt=production?new Date(Date.now()+72*3600000).toISOString():
  env.KAIROS_HML_EXPIRES_AT;
 const receipt=await db.enqueueAutomation({
  installationId:row.id,userId,row,expiresAt,mode:production?'production':'homologation'
 });
 if(receipt?.accepted!==true)throw new ControlError('AUTOMATION_REJECTED');
 return {accepted:true,state:receipt.state,installationId:row.id};
}
/** Runs at most ONE phase per invocation. Database lease prevents concurrent runs.
 * A crashed worker can reacquire a lease but must NOT repeat an already claimed
 * provider POST: operations are always checked before execution.
 */
export async function tickAutomation({db,env=process.env,fetcher=fetch,worker}){
 requireLiveAutomation(env);
 const job=await db.claimAutomation();
 if(!job)return {status:'idle'};
 if(!uuid.test(job.installationId||'')||!uuid.test(job.claimId||'')||
  !Number.isSafeInteger(job.userId)||job.userId<=0)
  throw new ControlError('AUTOMATION_CLAIM_INVALID');
 let target={state:'paused',error:'REMOTE_UNCERTAIN',delaySeconds:0};
 let phase=null;
 try{
  const row=await db.installation(job.userId,job.installationId);
  if(!matchesJob(job,row))throw new ControlError('AUTOMATION_SCOPE_DENIED');
  await assertExecutionScope({
   env,db,userId:job.userId,row,homologationGuard:assertHomologationScope
  });
  if(Date.parse(job.expiresAt)<=Date.now())
   throw new ControlError('AUTOMATION_EXPIRED');
  phase=phaseFor(Number(row.phase_index));
  if(!phase){
   target={state:'completed',error:null,delaySeconds:0};
  }else{
   const operations=await db.operations(row.id);
   const attempt=operations.find(op=>op.phase===phase);
   if(attempt){
    if(attempt.status==='confirmed'){
     target={state:'waiting',error:null,delaySeconds:30};
    }else if(['deploy','smoke'].includes(phase)&&
             ['started','needs_review'].includes(attempt.status)){
     const outcome=await reconcileCloudStep({db,userId:job.userId,row,env,fetcher,worker});
     target=outcome.status==='recovered'||outcome.status==='refresh_required'?
      {state:'queued',error:null,delaySeconds:0}:
      outcome.status==='waiting'?
       {state:'waiting',error:null,delaySeconds:90}:
       {state:'paused',error:'MANUAL_REVIEW_REQUIRED',delaySeconds:0};
    }else{
     target={state:'paused',error:'MANUAL_REVIEW_REQUIRED',delaySeconds:0};
    }
   }else{
    // Before the FIRST remote mutation, validate ALL THREE connected destinations.
    // This is GET-only and prevents leaving a new GitHub repo behind if a
    // Supabase or Vercel token had already become unusable.
    if(phase==='github'){
     const check=worker||cloudOps({db,env,fetcher});
     for(const provider of ['github','supabase','vercel'])
      await check.precheck(row,job.userId,provider);
    }
    const consent={execute:true,acceptBilling:true,expectedPhase:phase,
     owner:job.owner,supabaseOrgId:job.supabaseOrgId,vercelTeamId:job.vercelTeamId};
    const outcome=await executeCloudStep({db,userId:job.userId,row,consent,env,fetcher,worker});
    target=outcome.status==='recorded'?
     {state:'queued',error:null,delaySeconds:0}:
     outcome.status==='complete'?
      {state:'completed',error:null,delaySeconds:0}:
     outcome.status==='waiting'?
      {state:'waiting',error:null,delaySeconds:90}:
      {state:'paused',error:allowedErrors.test(outcome.reason||'')?
       outcome.reason:'MANUAL_REVIEW_REQUIRED',delaySeconds:0};
   }
  }
 }catch(error){
  // These failures happen before any provider mutation or require a fresh
  // ownership/health read. Never retry a remote POST or an uncertain claim.
  const code=safeCode(error);
  target=code==='PROJECT_NOT_READY'?
   {state:'waiting',error:null,delaySeconds:90}:
   {state:'paused',error:code,delaySeconds:0};
 }
 // Only the holder of the current lease may settle this job.
 const saved=await db.settleAutomation({installationId:job.installationId,claimId:job.claimId,
  ...target});
 if(saved!==true)throw new ControlError('AUTOMATION_LEASE_LOST');
 return {status:target.state,phase,reason:target.error||null,automaticRetry:false};
}
