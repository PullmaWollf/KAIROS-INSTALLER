import {ControlError,tokenHash} from './crypto.js';
import {safeInstallation} from './plan.js';
const uuid=/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i;
function settings(env=process.env){
 const base=env.KAIROS_CONTROL_SUPABASE_URL,key=env.KAIROS_CONTROL_SERVICE_ROLE_KEY;
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(base||''))||!key||key.length<20)
  throw new ControlError('NOT_CONFIGURED','Banco exclusivo do Installer não configurado');
 return {base:base.replace(/\/$/,''),key};
}
export function controlStore({fetcher=fetch,env=process.env}={}){
 const {base,key}=settings(env);
 async function query(path,{method='GET',body,headers={}}={}){
  if(!path.startsWith('/rest/v1/')||path.includes('://'))throw new ControlError('BAD_REQUEST');
  let r;
  try{r=await fetcher(base+path,{method,redirect:'error',signal:AbortSignal.timeout(12000),
   headers:{apikey:key,Authorization:'Bearer '+key,Accept:'application/json',...(body!==undefined?{'Content-Type':'application/json'}:{}),...headers},
   ...(body!==undefined?{body:JSON.stringify(body)}:{})});}
  catch{throw new ControlError('STORE_NETWORK','Banco de controle indisponível');}
  if(!r||r.status<200||r.status>=300)throw new ControlError('STORE_UNAVAILABLE','Falha na operação persistente');
  if(r.status===204||r.status===201&&!(r.headers?.get?.('content-type')||'').includes('json'))return null;
  try{return await r.json();}catch{throw new ControlError('STORE_RESPONSE','Resposta de controle inválida');}
 }
 function list(table,filters,fields='*'){
  const params=new URLSearchParams({select:fields,...filters});
  return query('/rest/v1/'+table+'?'+params.toString());
 }
 return Object.freeze({
  health:()=>list('kairos_control_users',{limit:'1'},'github_id').then(()=>true),
  async user(id){
   const rows=await list('kairos_control_users',{github_id:'eq.'+Number(id)},'github_id,login');
   return rows[0]||null;
  },
  async upsertUser({id,login}){
   if(!Number.isSafeInteger(id)||id<=0||!/^[a-z0-9-]{1,39}$/i.test(login))throw new ControlError('BAD_IDENTITY');
   const data=await query('/rest/v1/kairos_control_users?on_conflict=github_id',{
    method:'POST',headers:{Prefer:'resolution=merge-duplicates,return=representation'},
    body:[{github_id:id,login,updated_at:new Date().toISOString()}]});
   return data?.[0]||null;
  },
  async createSession({id,token}){
   const expires=new Date(Date.now()+12*3600000).toISOString();
   await query('/rest/v1/kairos_control_sessions',{method:'POST',body:{token_hash:tokenHash(token),github_id:id,expires_at:expires}});
   return expires;
  },
  async session(token){
   let hash;try{hash=tokenHash(token);}catch{return null;}
   const rows=await list('kairos_control_sessions',{token_hash:'eq.'+hash,expires_at:'gt.'+new Date().toISOString(),limit:'1'},
    'github_id,expires_at');
   if(!Array.isArray(rows)||!rows.length)return null;
   const user=await this.user(rows[0].github_id);
   return user?{id:user.github_id,login:user.login,expiresAt:rows[0].expires_at}:null;
  },
  async logout(token){
   let hash;try{hash=tokenHash(token);}catch{return;}
   await query('/rest/v1/kairos_control_sessions?token_hash=eq.'+hash,{method:'DELETE'});
  },
  async saveConnection(id,provider,envelope){
   if(!Number.isSafeInteger(id)||!['github','supabase','vercel'].includes(provider))throw new ControlError('BAD_PROVIDER');
   await query('/rest/v1/kairos_control_connections?on_conflict=github_id%2Cprovider',{
    method:'POST',headers:{Prefer:'resolution=merge-duplicates'},body:{github_id:id,provider,envelope,connected_at:new Date().toISOString()}});
  },
  async connections(id){
   const rows=await list('kairos_control_connections',{github_id:'eq.'+id},'provider');
   return rows.map(r=>r.provider);
  },
  async connection(id,provider){
   if(!['github','supabase','vercel'].includes(provider))throw new ControlError('BAD_PROVIDER');
   const rows=await list('kairos_control_connections',{github_id:'eq.'+id,provider:'eq.'+provider,limit:'1'},'envelope');
   return rows?.[0]?.envelope||null;
  },
  async createInstallation(id,plan){
   const rows=await query('/rest/v1/kairos_control_installations',{
    method:'POST',headers:{Prefer:'return=representation'},body:{github_id:id,...plan}});
   return safeInstallation(rows?.[0]);
  },
  async installations(id){
   const rows=await list('kairos_control_installations',{github_id:'eq.'+id,order:'created_at.desc',limit:'100'});
   return rows.map(safeInstallation);
  },
  async installation(id,installationId){
   if(!uuid.test(String(installationId||'')))throw new ControlError('BAD_ID');
   const rows=await list('kairos_control_installations',{id:'eq.'+installationId,github_id:'eq.'+id,limit:'1'});
   return rows.length?rows[0]:null;
  },
  async operations(installationId){
   if(!uuid.test(installationId||''))throw new ControlError('BAD_ID');
   return list('kairos_control_operations',{installation_id:'eq.'+installationId,order:'started_at.asc'},'phase,status,started_at,finished_at,error_code,receipt');
  },
  async claim(installationId,id,phase){
   return query('/rest/v1/rpc/kairos_control_claim',{method:'POST',
    body:{p_installation:installationId,p_github_id:id,p_phase:phase}});
  },
  async finish(installationId,id,phase,attemptId,receipt){
   return query('/rest/v1/rpc/kairos_control_finish',{method:'POST',
    body:{p_installation:installationId,p_github_id:id,p_phase:phase,p_attempt:attemptId,p_receipt:receipt}});
  },
  async review(installationId,id,phase,attemptId,reason){
   return query('/rest/v1/rpc/kairos_control_review',{method:'POST',
    body:{p_installation:installationId,p_github_id:id,p_phase:phase,p_attempt:attemptId,p_error_code:reason}});
  },
  async saveInstallSecrets(installationId,envelope){
   await query('/rest/v1/kairos_control_install_secrets?on_conflict=installation_id',{
    method:'POST',headers:{Prefer:'resolution=merge-duplicates'},
    body:{installation_id:installationId,envelope,updated_at:new Date().toISOString()}});
  },
  async installSecrets(installationId){
   const rows=await list('kairos_control_install_secrets',{installation_id:'eq.'+installationId,limit:'1'},'envelope');
   return rows[0]?.envelope||null;
  },
  async takeAdminCredentials(installationId,userId){
   return query('/rest/v1/rpc/kairos_control_take_admin_credentials',{
    method:'POST',body:{p_installation:installationId,p_github_id:userId}});
  }
 });
}
