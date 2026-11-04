import {ControlError} from './crypto.js';
import {phaseFor,safeInstallation} from './plan.js';
import {cloudOps} from './cloud-worker.js';
import {assertHomologationScope} from './homologation-guard.js';
const safeCode=e=>{
 const code=String(e?.code||'REMOTE_UNCERTAIN');
 return /^[A-Z0-9_]{2,40}$/.test(code)?code:'REMOTE_UNCERTAIN';
};
function checkedConsent(row,phase,consent){
 if(!consent||consent.execute!==true||consent.acceptBilling!==true||
  consent.expectedPhase!==phase||consent.owner!==row.owner||
  consent.supabaseOrgId!==row.supabase_org_id||consent.vercelTeamId!==row.vercel_team_id)
  throw new ControlError('CONSENT_REQUIRED','Confirme cada destino e os possíveis custos antes de executar');
}
export async function executeCloudStep({db,userId,row,consent,env=process.env,fetcher=fetch,worker}){
 if(env.KAIROS_CONTROL_ENABLE_WRITES!=='1')throw new ControlError('WRITES_DISABLED','Provisionamento real ainda desabilitado');
 const phase=phaseFor(Number(row.phase_index));
 if(!phase)return {status:'complete',homologated:false};
 checkedConsent(row,phase,consent);
 assertHomologationScope({env,userId,row});
 const ops=worker||cloudOps({db,env,fetcher});
 // All prereqs and account access are checked before reserving a remote operation.
 await ops.precheck(row,userId,phase);
 const claim=await db.claim(row.id,userId,phase);
 if(!claim?.claimed)return {status:'needs_review',phase,reason:claim?.reason||'CLAIM_FAILED',automaticRetry:false};
 const attemptId=claim.attempt_id;
 let result;
 try{
  result=await ops.run(row,userId,phase);
 }catch(e){
  await db.review(row.id,userId,phase,attemptId,safeCode(e));
  return {status:'needs_review',phase,reason:safeCode(e),automaticRetry:false};
 }
 if(result?.waiting){
  // Persistent 'started' attempt remains; later GET reconciliation may safely observe it.
  return {status:'waiting',phase,reason:result.reason||'REMOTE_PENDING',automaticRetry:false};
 }
 try{
  if(!await db.finish(row.id,userId,phase,attemptId,result?.receipt||{}))
   throw new ControlError('PERSISTENCE_UNCERTAIN');
 }catch{
  // Provider side effect may have occurred; NEVER reissue the POST.
  return {status:'needs_review',phase,reason:'PERSISTENCE_UNCERTAIN',automaticRetry:false};
 }
 return {status:'recorded',phase,receipt:result?.receipt||{},
  next:phaseFor(Number(row.phase_index)+1),homologated:false};
}
export async function reconcileCloudStep({db,userId,row,env=process.env,fetcher=fetch,worker}){
 const phase=phaseFor(Number(row.phase_index));
 if(!phase)return {status:'complete',homologated:false};
 const all=await db.operations(row.id);
 const attempt=all.find(op=>op.phase===phase);
 if(!attempt)return {status:'not_started',phase};
 if(attempt.status==='confirmed')return {status:'refresh_required',phase};
 if(!['started','needs_review'].includes(attempt.status))throw new ControlError('BAD_STATE');
 if(!['deploy','smoke'].includes(phase))
  return {status:'needs_review',phase,automaticRetry:false,reason:'MANUAL_REVIEW_REQUIRED'};
 const ops=worker||cloudOps({db,env,fetcher});
 let finding;
 try{finding=await ops.reconcile(row,userId,phase,attempt.started_at);}
 catch{return {status:'waiting',phase,automaticRetry:false};}
 if(finding.status!=='verified')
  return {status:'waiting',phase,automaticRetry:false};
 // Only GET-based verifications (deploy / smoke) may advance automatically.
 // The finish RPC validates owner, current phase and the receipt shape.
 const complete=await db.finish(row.id,userId,phase,attempt.id,finding.receipt||{});
 if(!complete)return {status:'needs_review',phase,reason:'PERSISTENCE_UNCERTAIN',automaticRetry:false};
 return {status:'recovered',phase,receipt:finding.receipt||{},automaticRetry:false};
}
export function statusForClient(row,operations=[]){
 return {installation:safeInstallation(row),
  operations:operations.map(op=>({
   phase:op.phase,status:op.status,startedAt:op.started_at,finishedAt:op.finished_at,
   errorCode:op.error_code,receipt:op.receipt
  })),
  homologated:false};
}
