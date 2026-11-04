import {ControlError} from './crypto.js';
import {vercelScope} from '../provisioner/vercel-scope.js';

const repo=/^kairos-(?!hml-)[a-z0-9][a-z0-9-]{2,55}$/;
const githubLogin=/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const org=/^[a-z0-9_-]{4,64}$/i;
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;

/** Production runs on customer-owned scopes with a durable, per-installation
 * authorization. A global flag alone can NEVER authorize customer provisioning.
 */
export function productionReady(env=process.env){
 return env.KAIROS_PRODUCTION_MODE==='1'&&
  env.KAIROS_HOMOLOGATION_MODE!=='1'&&
  env.KAIROS_AUTOMATION_ENABLED==='1'&&
  env.KAIROS_CONTROL_ENABLE_WRITES==='1'&&
  env.KAIROS_VERCEL_MANAGEMENT_ENABLED==='1'&&
  env.KAIROS_ENABLE_BETA_SQL==='1'&&
  env.KAIROS_ENABLE_GIT_DEPLOY==='1';
}
export function validateProductionScope({env=process.env,userId,row,login}){
 if(!productionReady(env))throw new ControlError('PRODUCTION_LOCKED',
  'Modo de produção e proteções de escrita ainda não habilitados');
 if(!Number.isSafeInteger(userId)||userId<=0||!row||
   !uuid.test(String(row.id||''))||Number(row.github_id)!==userId||
   typeof row.owner!=='string'||!githubLogin.test(row.owner)||
   row.owner.toLowerCase()==='pullmawollf'||
   (login!==undefined&&row.owner.toLowerCase()!==login.toLowerCase())||
   !repo.test(String(row.repository||''))||
   typeof row.cell_name!=='string'||row.cell_name.trim().length<3||
   row.cell_name.length>70||/^HML(?:\s|-)/i.test(row.cell_name)||
   !org.test(String(row.supabase_org_id||''))||
   row.vercel_team_id===env.KAIROS_VERCEL_TEAM_ID)
  throw new ControlError('PRODUCTION_SCOPE_DENIED',
   'O destino deve pertencer à conta conectada e a uma instalação de produção isolada');
 try{vercelScope(row.vercel_team_id);}catch{
  throw new ControlError('PRODUCTION_SCOPE_DENIED');
 }
 return true;
}
/** Rechecks the durable consent from the CONTROL DB before EACH remote write.
 * This prevents direct calls to /execute from bypassing production billing
 * approval, even when the global write flags are enabled.
 */
export async function assertProductionAuthorization({env=process.env,db,userId,row,now=Date.now()}){
 validateProductionScope({env,userId,row});
 if(typeof db?.automation!=='function')throw new ControlError('PRODUCTION_AUTH_REQUIRED');
 const job=await db.automation(userId,row.id);
 if(!job||job.mode!=='production'||job.github_id!==userId||
    job.installation_id!==row.id||job.owner!==row.owner||
    job.repository!==row.repository||
    job.supabase_org_id!==row.supabase_org_id||
    job.vercel_team_id!==row.vercel_team_id||
    job.accept_billing!==true||
    !['queued','running','waiting'].includes(job.state)||
    !Number.isFinite(Date.parse(job.expires_at))||
    Date.parse(job.expires_at)<=now||
    Date.parse(job.authorized_at)>now)
  throw new ControlError('PRODUCTION_AUTH_REQUIRED',
   'Autorize esta instalação e os possíveis custos antes de criar recursos');
 return true;
}
export async function assertExecutionScope({env=process.env,db,userId,row,now=Date.now(),homologationGuard}){
 const production=env.KAIROS_PRODUCTION_MODE==='1';
 const homologation=env.KAIROS_HOMOLOGATION_MODE==='1';
 if(production&&homologation)throw new ControlError('PROVISIONING_SCOPE_LOCKED');
 if(production)return assertProductionAuthorization({env,db,userId,row,now});
 // Preserve the original fail-closed HML error when both modes are disabled.
 if(typeof homologationGuard!=='function')throw new ControlError('PROVISIONING_SCOPE_LOCKED');
 return homologationGuard({env,userId,row,now});
}
