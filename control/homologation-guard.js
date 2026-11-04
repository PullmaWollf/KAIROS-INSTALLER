import {ControlError} from './crypto.js';

const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
const name=/^kairos-hml-[a-z0-9][a-z0-9-]{2,51}$/;
const githubLogin=/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/;
const scope=/^(?:team_[a-z0-9_-]{4,64}|personal_[a-z0-9_-]{6,54})$/i;
const org=/^[a-z0-9_-]{4,64}$/i;
const keys=Object.freeze([
 'KAIROS_HML_GITHUB_ID',
 'KAIROS_HML_GITHUB_LOGIN',
 'KAIROS_HML_SUPABASE_ORG_ID',
 'KAIROS_HML_VERCEL_SCOPE',
 'KAIROS_HML_REPOSITORY',
 'KAIROS_HML_INSTALLATION_ID',
 'KAIROS_HML_EXPIRES_AT'
]);

/** Safe diagnostic: only configuration presence, never owner/target values. */
export function homologationGuardStatus(env=process.env,{now=Date.now()}={}){
 const missing=keys.filter(k=>typeof env[k]!=='string'||!env[k].trim());
 const until=Date.parse(env.KAIROS_HML_EXPIRES_AT||'');
 const finiteWindow=Number.isFinite(until)&&until>now&&until-now<=7*86400000;
 const valid=!missing.length&&
  /^[1-9]\d{0,15}$/.test(env.KAIROS_HML_GITHUB_ID)&&
  githubLogin.test(env.KAIROS_HML_GITHUB_LOGIN)&&
  env.KAIROS_HML_GITHUB_LOGIN.toLowerCase()!=='pullmawollf'&&
  org.test(env.KAIROS_HML_SUPABASE_ORG_ID)&&
  scope.test(env.KAIROS_HML_VERCEL_SCOPE)&&
  env.KAIROS_HML_VERCEL_SCOPE!==env.KAIROS_VERCEL_TEAM_ID&&
  name.test(env.KAIROS_HML_REPOSITORY)&&
  uuid.test(env.KAIROS_HML_INSTALLATION_ID)&&
  /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/.test(env.KAIROS_HML_EXPIRES_AT)&&
  finiteWindow;
 return Object.freeze({
  mode:'isolated-homologation',
  protected:valid,
  enabled:valid&&env.KAIROS_HOMOLOGATION_MODE==='1'&&env.KAIROS_PRODUCTION_MODE!=='1',
  provisioningEnabled:env.KAIROS_CONTROL_ENABLE_WRITES==='1',
  missingKeys:missing,
  expiryValid:finiteWindow,
  readyForWrites:valid&&env.KAIROS_HOMOLOGATION_MODE==='1'&&env.KAIROS_PRODUCTION_MODE!=='1'&&
   env.KAIROS_CONTROL_ENABLE_WRITES==='1'&&
   env.KAIROS_VERCEL_MANAGEMENT_ENABLED==='1'&&
   env.KAIROS_ENABLE_BETA_SQL==='1'&&
   env.KAIROS_ENABLE_GIT_DEPLOY==='1',
  createsResources:false
 });
}

/** Must execute server-side immediately before provider precheck and durable claim.
 * Only a pre-authorized installation UUID in a disposable customer account may write.
 * This guard does not replace user consent, provider preflight or remote ownership checks.
 */
export function assertHomologationScope({env=process.env,userId,row,now=Date.now()}){
 const status=homologationGuardStatus(env,{now});
 if(!status.enabled)throw new ControlError('HOMOLOGATION_LOCKED',
  'Homologação com escopo e prazo explícitos ainda não habilitada');
 if(!row||!Number.isSafeInteger(userId)||userId<=0||
    String(userId)!==env.KAIROS_HML_GITHUB_ID||
    row.id!==env.KAIROS_HML_INSTALLATION_ID||
    row.owner?.toLowerCase()!==env.KAIROS_HML_GITHUB_LOGIN.toLowerCase()||
    row.repository!==env.KAIROS_HML_REPOSITORY||
    row.supabase_org_id!==env.KAIROS_HML_SUPABASE_ORG_ID||
    row.vercel_team_id!==env.KAIROS_HML_VERCEL_SCOPE||
    typeof row.cell_name!=='string'||!/^HML(?:\s|-)/i.test(row.cell_name)||
    row.github_id!=null&&Number(row.github_id)!==userId)
  throw new ControlError('HOMOLOGATION_SCOPE_DENIED',
   'Instalação fora do usuário, nome, ID e destinos autorizados para homologação');
 return true;
}
