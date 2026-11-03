import {ProvisioningError,TEMPLATE_OWNER} from './plan.js';
import {providerGet} from './provider-http.js';
const ref=/^[a-z0-9_-]{4,64}$/i;
function required(value,label){if(!ref.test(String(value||'')))throw new ProvisioningError('BAD_TARGET',label+' inválido');return String(value);}
function otherAccount(value,label){
 if(String(value||'').toLowerCase()===TEMPLATE_OWNER.toLowerCase())throw new ProvisioningError('MAINTAINER_ACCOUNT',label+' não pode ser a conta do mantenedor');
 return value;
}
export async function preflightSupabase({fetcher=fetch,token,organizationId}){
 const id=required(organizationId,'Identificador da organização Supabase');
 const body=await providerGet({fetcher,base:'https://api.supabase.com',path:'/v1/organizations',token,provider:'Supabase'});
 if(!Array.isArray(body))throw new ProvisioningError('BAD_RESPONSE','Supabase: lista de organizações inválida');
 const org=body.find(o=>o?.id===id);
 if(!org)throw new ProvisioningError('NOT_MEMBER','Supabase: organização não acessível pela credencial do administrador');
 otherAccount(org.name,'Organização Supabase');
 // API membership alone does not prove ownership. Explicit authorization remains necessary for writes.
 return Object.freeze({provider:'supabase',organizationId:id,organizationName:String(org.name||'').slice(0,90),accessible:true,ownership:'not-verified',createsResources:false});
}
export async function preflightVercel({fetcher=fetch,token,teamId}){
 const id=required(teamId,'Identificador do time Vercel');
 const user=await providerGet({fetcher,base:'https://api.vercel.com',path:'/v2/user',token,provider:'Vercel'});
 const login=user?.user?.username;
 if(!login||typeof login!=='string')throw new ProvisioningError('BAD_RESPONSE','Vercel: identidade inválida');
 otherAccount(login,'Conta Vercel');
 const body=await providerGet({fetcher,base:'https://api.vercel.com',path:'/v2/teams?limit=100',token,provider:'Vercel'});
 const teams=body?.teams;
 if(!Array.isArray(teams))throw new ProvisioningError('BAD_RESPONSE','Vercel: lista de times inválida');
 const team=teams.find(t=>t?.id===id);
 if(!team)throw new ProvisioningError('NOT_MEMBER','Vercel: time não acessível pelo administrador');
 otherAccount(team.slug,'Time Vercel');
 return Object.freeze({provider:'vercel',user:login,teamId:id,teamSlug:team.slug,accessible:true,ownership:'not-verified',createsResources:false});
}
export function targetsFromEnv(env=process.env){
 const organizationId=env.KAIROS_SUPABASE_ORG_ID;
 const teamId=env.KAIROS_VERCEL_TEAM_ID;
 if(!organizationId||!teamId)throw new ProvisioningError('MISSING_TARGET','Informe KAIROS_SUPABASE_ORG_ID e KAIROS_VERCEL_TEAM_ID no ambiente local');
 return {organizationId,teamId};
}
