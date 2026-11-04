import {decryptControl,ControlError} from './crypto.js';
import {readVercelConnection} from './vercel-connection.js';
import {personalAccountId} from '../provisioner/vercel-scope.js';

const identifier=/^[a-z0-9_-]{4,64}$/i;
const statuses={free:'FREE_PLAN',full:'FREE_QUOTA_FULL',paid:'PAID_PLAN',
 unknown:'PLAN_NOT_VERIFIED',account:'NOT_CONNECTED',org:'ORG_NOT_FOUND',
 provider:'PROVIDER_UNAVAILABLE',ready:'FREE_SLOT_OBSERVED'};
const baseSupabase='https://api.supabase.com',baseVercel='https://api.vercel.com';

async function get(fetcher,url,token){
 const response=await fetcher(url,{method:'GET',redirect:'error',
  signal:AbortSignal.timeout(12000),
  headers:{Authorization:'Bearer '+token,Accept:'application/json'}});
 if(response?.status!==200)throw new Error('PROVIDER_UNAVAILABLE');
 const value=await response.json();
 if(!value||typeof value!=='object')throw new Error('INVALID_RESPONSE');
 return value;
}
function result(eligible,reason,details={}){return {eligible,reason,...details};}
/** READ ONLY. The free project quota is shared by Free organizations'
 * owners/admins, not simply by a selected organization's project count.
 * Count all projects visible to this account and reject ambiguous results.
 */
export async function zeroCostAudit({db,userId,organizationId,vercelTeamId,
 existingProjectRef=null,env=process.env,fetcher=fetch}){
 if(!Number.isSafeInteger(userId)||userId<=0)throw new ControlError('LOGIN_REQUIRED');
 if(!identifier.test(String(organizationId||'')))
  throw new ControlError('BAD_ORG');
 const supabase=result(false,statuses.account),vercel=result(false,statuses.account);
 let token=null;
 try{
  const encrypted=await db.connection(userId,'supabase');
  if(encrypted){
   const decoded=decryptControl(encrypted,'oauth:supabase:'+userId,{env});
   if(typeof decoded?.accessToken==='string'&&decoded.accessToken.length>=16&&
      (!decoded.expiresAt||decoded.expiresAt>Date.now()+30000))
    token=decoded.accessToken;
  }
 }catch{/* no trusted Supabase credential */}
 if(token){
  try{
   const organizations=await get(fetcher,baseSupabase+'/v1/organizations',token);
   if(!Array.isArray(organizations))throw new Error('BAD_ORGS');
   const match=organizations.find(o=>o?.id===organizationId&&
    identifier.test(String(o.slug||'')));
   if(!match)supabase.reason=statuses.org;
   else{
    const [details,projects]=await Promise.all([
     get(fetcher,baseSupabase+'/v1/organizations/'+encodeURIComponent(match.slug),token),
     get(fetcher,baseSupabase+'/v1/projects',token)
    ]);
    if(!Array.isArray(projects))throw new Error('INVALID_PROJECTS');
    // Inconsistent account-scoped membership must never be interpreted as free.
    if(details.id!==organizationId||
       String(details.plan||'').toLowerCase()!=='free')
     supabase.reason=details.id===organizationId&&details.plan?
      statuses.paid:statuses.unknown;
    else if(projects.some(p=>!p||typeof p.status!=='string'))
     supabase.reason=statuses.unknown;
    else{
     const active=projects.filter(p=>!['INACTIVE','PAUSED'].includes(p.status.toUpperCase())).length;
     supabase.activeProjectsObserved=active;
     supabase.observationScope='visible-projects-not-total-account-quota';
     // After the installer creates its own project, it may legitimately
     // occupy the second free slot. Never consider another project as ours.
     const isOurExistingProject=typeof existingProjectRef==='string'&&
      /^[a-z0-9]{10,30}$/i.test(existingProjectRef)&&projects.some(p=>
       (p.ref===existingProjectRef||p.id===existingProjectRef)&&
       (p.organization_id===organizationId||p.organization_slug===match.slug)&&
       !['INACTIVE','PAUSED'].includes(String(p.status||'').toUpperCase()));
     supabase.eligible=active<2||active<=2&&isOurExistingProject;
     supabase.reason=supabase.eligible?
      isOurExistingProject?'EXISTING_FREE_PROJECT':statuses.ready:statuses.full;
    }
   }
  }catch{supabase.reason=statuses.provider;}
 }
 let hosting=null;
 try{hosting=await readVercelConnection({db,userId,env});}catch{/* bad credential */}
 if(hosting&&hosting.teamId===vercelTeamId&&
    hosting.teamId!==env.KAIROS_VERCEL_TEAM_ID){
  try{
   if(hosting.teamId.startsWith('personal_')){
    const data=await get(fetcher,baseVercel+'/v2/user',hosting.accessToken);
    if(personalAccountId(data.user)!==hosting.teamId)
     throw new Error('WRONG_OWNER');
    vercel.eligible=data.user?.billing?.plan==='hobby';
    vercel.reason=vercel.eligible?statuses.free:
     data.user?.billing?.plan?statuses.paid:statuses.unknown;
   }else if(hosting.teamId.startsWith('team_')){
    const team=await get(fetcher,baseVercel+'/v2/teams/'+encodeURIComponent(hosting.teamId),
     hosting.accessToken);
    if(team.id!==hosting.teamId)throw new Error('WRONG_OWNER');
    vercel.eligible=team.billing?.plan==='hobby';
    vercel.reason=vercel.eligible?statuses.free:
     team.billing?.plan?statuses.paid:statuses.unknown;
   }else vercel.reason=statuses.unknown;
  }catch{vercel.reason=statuses.provider;}
 }
 // Free Hobby: ONLY for personal/noncommercial tests. Does not guarantee
 // future availability or bills from unrelated services/resources.
 return Object.freeze({
  mode:'read-only',remoteWrites:0,createsResources:false,
  eligible:supabase.eligible&&vercel.eligible,
  guaranteedZeroCost:false,
  github:{eligible:true,reason:'FREE_PRIVATE_REPOSITORY_AVAILABLE'},
  supabase,vercel,
  warning:'Planos e vagas observados, sem reservar quota. Apenas teste pessoal nao comercial. Nenhuma cobranca ou instalacao foi autorizada.'
 });
}
export async function assertZeroCostEligibility(args){
 const audit=await zeroCostAudit(args);
 if(!audit.eligible)throw new ControlError('ZERO_COST_NOT_VERIFIED',
  'Uma conta nao confirmou plano gratuito ou vaga disponivel. Nenhum recurso criado.');
 return audit;
}
