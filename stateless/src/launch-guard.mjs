import {InstallationError} from './validation.mjs';

const uuidRepo=/^kairos-hml-[a-z0-9][a-z0-9-]{2,44}$/;
const owner=/^[a-z0-9-]{1,39}$/i;
const org=/^[a-z0-9_-]{4,64}$/i;
const scope=/^(?:team_[a-z0-9_-]{6,54}|personal_[a-z0-9_-]{6,54})$/i;
const maxDuration=7*24*60*60*1000;

/** A disposable HML allowlist. This is a last-resort server-side barrier,
 * not a replacement for short-lived OAuth, anti-abuse controls or billing quotas.
 * It is inert by default, even if the prototype is deployed publicly.
 */
export function assertHmlLaunchGuard(plan,{env=process.env,now=Date.now()}={}){
 const expiry=Date.parse(env.KAIROS_STATELESS_HML_EXPIRES_AT||'');
 if(env.KAIROS_STATELESS_HML_ENABLE_LAUNCH!=='1'||
    !owner.test(env.KAIROS_STATELESS_HML_GITHUB_OWNER||'')||
    !uuidRepo.test(env.KAIROS_STATELESS_HML_REPOSITORY||'')||
    !org.test(env.KAIROS_STATELESS_HML_SUPABASE_ORG||'')||
    !scope.test(env.KAIROS_STATELESS_HML_VERCEL_SCOPE||'')||
    !Number.isFinite(expiry)||expiry<=now||expiry>now+maxDuration||
    plan.githubLogin.toLowerCase()!==env.KAIROS_STATELESS_HML_GITHUB_OWNER.toLowerCase()||
    plan.githubLogin.toLowerCase()==='pullmawollf'||
    plan.repository!==env.KAIROS_STATELESS_HML_REPOSITORY||
    plan.supabaseOrgId!==env.KAIROS_STATELESS_HML_SUPABASE_ORG||
    plan.vercelScope!==env.KAIROS_STATELESS_HML_VERCEL_SCOPE)
  throw new InstallationError('HOMOLOGATION_LAUNCH_LOCKED');
 return true;
}
