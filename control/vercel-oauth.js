import {ControlError,encryptControl,decryptControl} from './crypto.js';
import {providerGet} from '../provisioner/provider-http.js';
import {vercelQuery,personalAccountId} from '../provisioner/vercel-scope.js';
import {TEAM_ID} from './vercel-connection.js';

const pendingPurpose=id=>'oauth:vercel:pending:'+id;
const connectedPurpose=id=>'oauth:vercel:'+id;
const TOKEN=/^[A-Za-z0-9._~-]{20,512}$/;
const personal=/^personal_[A-Za-z0-9_-]{6,54}$/;

export async function vercelOAuthScopes({token,env=process.env,fetcher=fetch}){
 const list=await providerGet({fetcher,base:'https://api.vercel.com',
  path:'/v2/teams?limit=100',token,provider:'Vercel'}).catch(()=>({teams:[]}));
 if(!Array.isArray(list.teams))throw new ControlError('VERCEL_VERIFICATION_FAILED');
 const teams=[];
 for(const t of list.teams.slice(0,12)){
  if(!TEAM_ID.test(t?.id||'')||t.id===env.KAIROS_VERCEL_TEAM_ID)continue;
  try{
   const projects=await providerGet({fetcher,base:'https://api.vercel.com',
    path:'/v9/projects'+vercelQuery(t.id,{limit:1}),token,provider:'Vercel'});
   if(Array.isArray(projects?.projects))
    teams.push({teamId:t.id,name:String(t.name||t.slug||'Equipe Vercel').slice(0,80),
     slug:String(t.slug||'').slice(0,80)});
  }catch{/* Limited team scope is not a connection. */}
 }
 try{
  const identity=await providerGet({fetcher,base:'https://api.vercel.com',
   path:'/v2/user',token,provider:'Vercel'});
  const username=identity?.user?.username;
  if(typeof username!=='string'||!username||
     username.toLowerCase()==='pullmawollf')throw Error('no-personal');
  const teamId=personalAccountId(identity.user);
  const projects=await providerGet({fetcher,base:'https://api.vercel.com',
   path:'/v9/projects?limit=1',token,provider:'Vercel'});
  if(Array.isArray(projects?.projects)&&teamId!==env.KAIROS_VERCEL_TEAM_ID)
   teams.unshift({teamId,name:'Minha conta Vercel',slug:username.slice(0,80)});
 }catch{/* Not all app grants allow personal account access. */}
 return {teams,hasMore:!!list.pagination?.next||list.teams.length>12};
}

export async function stageVercelOAuth({db,userId,token,env=process.env,fetcher=fetch}){
 if(!Number.isSafeInteger(userId)||userId<=0||!TOKEN.test(token?.accessToken||''))
  throw new ControlError('VERCEL_VERIFICATION_FAILED');
 const found=await vercelOAuthScopes({token:token.accessToken,env,fetcher});
 if(!found.teams.length||found.hasMore)throw new ControlError('VERCEL_SCOPE_REQUIRED');
 const record={kind:'vercel-oauth-pending-v1',...token,issuedAt:Date.now()};
 await db.saveConnection(userId,'vercel-pending',
  encryptControl(record,pendingPurpose(userId),{env}));
 return found;
}

export async function pendingVercelOAuth({db,userId,env=process.env,fetcher=fetch}){
 const sealed=await db.connection(userId,'vercel-pending');
 if(!sealed)return {teams:[],hasMore:false};
 let record;
 try{record=decryptControl(sealed,pendingPurpose(userId),{env});}catch{return {teams:[],hasMore:false};}
 if(record?.kind!=='vercel-oauth-pending-v1'||!TOKEN.test(record.accessToken||'')||
    record.expiresAt<=Date.now()+30000)return {teams:[],hasMore:false};
 return vercelOAuthScopes({token:record.accessToken,env,fetcher});
}

export async function selectVercelOAuth({db,userId,teamId,env=process.env,fetcher=fetch}){
 if(typeof teamId!=='string'||!(TEAM_ID.test(teamId)||personal.test(teamId))||
   teamId===env.KAIROS_VERCEL_TEAM_ID)throw new ControlError('VERCEL_TEAM_FORBIDDEN');
 const sealed=await db.connection(userId,'vercel-pending');
 if(!sealed)throw new ControlError('OAUTH_REQUIRED');
 const record=decryptControl(sealed,pendingPurpose(userId),{env});
 if(record?.kind!=='vercel-oauth-pending-v1'||!TOKEN.test(record.accessToken||'')||
    record.expiresAt<=Date.now()+30000)throw new ControlError('OAUTH_EXPIRED');
 const options=await vercelOAuthScopes({token:record.accessToken,env,fetcher});
 if(options.hasMore)throw new ControlError('VERCEL_SCOPE_REQUIRED');
 const selected=options.teams.find(item=>item.teamId===teamId);
 if(!selected)throw new ControlError('VERCEL_TEAM_FORBIDDEN');
 await db.saveConnection(userId,'vercel',encryptControl({
  kind:'vercel-management-v1',source:'oauth',teamId,
  teamSlug:selected.slug,accessToken:record.accessToken,refreshToken:record.refreshToken,
  expiresAt:record.expiresAt,verifiedAt:new Date().toISOString()
 },connectedPurpose(userId),{env}));
 await db.disconnect(userId,'vercel-pending');
 return {connected:true,teamId,teamSlug:selected.slug};
}
