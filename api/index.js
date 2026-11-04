import {createHash} from 'node:crypto';
import {controlStore} from '../control/store.js';
import {ControlError,encryptControl,decryptControl,randomToken} from '../control/crypto.js';
import {validateCloudPlan,safeInstallation,phaseFor} from '../control/plan.js';
import {configuredOrigin,cookieValue,makeCookie,csrfFor,requireMutation,sealOAuth,openOAuth,responseHeaders,json,redirect,readJSON} from '../control/http.js';
import {beginAuthorization,providerConfig,exchangeCode,safeEqual} from '../oauth/protocol.js';
import {executeCloudStep,reconcileCloudStep,statusForClient} from '../control/engine.js';
import {connectVercel,readVercelConnection,publicVercelConnection,discoverVercelTeams} from '../control/vercel-connection.js';
import {preinstallationAudit} from '../control/preinstall-audit.js';
import {vercelQuery} from '../provisioner/vercel-scope.js';
import {automationReady,assertAutomationCaller,authorizeAutomation,tickAutomation} from '../control/automation.js';

const sessionName='kairos_control_session',oauthName='kairos_control_oauth';
function errCode(e){return e instanceof ControlError?e.code:'INTERNAL_ERROR';}
async function githubIdentity(token,{fetcher=fetch}={}){
 let response;
 try{response=await fetcher('https://api.github.com/user',{method:'GET',redirect:'error',
  signal:AbortSignal.timeout(10000),headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});}
 catch{throw new ControlError('GITHUB_UNAVAILABLE');}
 if(response?.status!==200)throw new ControlError('GITHUB_UNAUTHORIZED');
 let value;try{value=await response.json();}catch{throw new ControlError('GITHUB_UNAUTHORIZED');}
 if(!Number.isSafeInteger(value.id)||value.id<=0||!/^[a-z0-9-]{1,39}$/i.test(value.login||''))
  throw new ControlError('GITHUB_UNAUTHORIZED','Identidade GitHub inválida');
 return {id:value.id,login:value.login};
}
export function createHostedHandler({env=process.env,fetcher=fetch,storeFactory}={}){
 return async function handler(req,res){
  responseHeaders(res);
  try{
   const origin=configuredOrigin(env),url=new URL(req.url,origin);
   if(req.headers.host!==new URL(origin).host||!['GET','POST'].includes(req.method))
    throw new ControlError('BAD_REQUEST','Requisição não permitida');
   const db=storeFactory?storeFactory():controlStore({fetcher,env});
   if(req.method==='GET'&&url.pathname==='/api/health'){
    const ready=await db.health();
    return json(res,ready?200:503,{ok:ready,ready});
   }
   // Private scheduler: a CRON_SECRET is mandatory; no browser session is accepted.
   if(req.method==='GET'&&url.pathname==='/api/automation/tick'){
    assertAutomationCaller(req.headers.authorization,env);
    return json(res,200,await tickAutomation({db,env,fetcher}));
   }
   const rawSession=cookieValue(req,sessionName);
   const user=rawSession?await db.session(rawSession):null;
   if(url.pathname==='/api/auth/start'&&req.method==='GET'){
    const provider=url.searchParams.get('provider');
    if(!['github','supabase'].includes(provider))throw new ControlError('BAD_PROVIDER');
    if(provider!=='github'&&!user)throw new ControlError('LOGIN_REQUIRED','Entre com GitHub antes de conectar outros provedores');
    const config=providerConfig(provider,env);
    const callbackUrl=origin+'/api/auth/callback';
    const {url:authUrl,transaction}=beginAuthorization({provider,callbackUrl,config});
    const sealed=sealOAuth(transaction,user?.id||null,{env});
    res.setHeader('Set-Cookie',makeCookie(oauthName,sealed,{age:600,path:'/api/auth'}));
    res.statusCode=302;res.setHeader('Location',authUrl);return res.end();
   }
   if(url.pathname==='/api/auth/callback'&&req.method==='GET'){
    const sealed=cookieValue(req,oauthName);
    if(!sealed)throw new ControlError('OAUTH_EXPIRED','Autorização não iniciada nesta sessão');
    const {transaction,subject}=openOAuth(sealed,{env});
    // Clear the state cookie before any external calls; code and state cannot be replayed.
    res.setHeader('Set-Cookie',makeCookie(oauthName,'',{age:0,path:'/api/auth'}));
    if(url.searchParams.has('error')||!safeEqual(url.searchParams.get('state'),transaction.state))
     throw new ControlError('OAUTH_STATE','Autorização recusada ou state inválido');
    // Atomic, durable claim BEFORE exchanging the authorization code.
    // A repeated or concurrent callback must never reach the token endpoint.
    const cookieHash=createHash('sha256').update(sealed).digest('hex');
    if(!await db.claimOAuth(cookieHash))throw new ControlError('OAUTH_REPLAY','Autorização já utilizada');
    if(transaction.provider==='vercel')throw new ControlError('BAD_PROVIDER');
    const config=providerConfig(transaction.provider,env);
    const token=await exchangeCode({transaction,code:url.searchParams.get('code'),config,fetcher});
    if(transaction.provider==='github'){
     const identity=await githubIdentity(token.accessToken,{fetcher});
     await db.upsertUser(identity);
     const sessionToken=randomToken();
     await db.createSession({id:identity.id,token:sessionToken});
     await db.saveConnection(identity.id,'github',encryptControl(token,'oauth:github:'+identity.id,{env}));
     res.setHeader('Set-Cookie',[
      makeCookie(oauthName,'',{age:0,path:'/api/auth'}),
      makeCookie(sessionName,sessionToken,{age:12*3600})
     ]);
    }else{
     if(!user||user.id!==subject)throw new ControlError('OAUTH_SUBJECT','A sessão mudou durante a autorização');
     // Vercel OIDC is identity-only until a dedicated management grant is configured.
     await db.saveConnection(user.id,transaction.provider,
      encryptControl(token,'oauth:'+transaction.provider+':'+user.id,{env}));
    }
    return redirect(res,origin+'/app.html');
   }
   if(url.pathname==='/api/session'&&req.method==='GET'){
    if(!user)return json(res,200,{signedIn:false,providers:[]});
    const credential=await readVercelConnection({db,userId:user.id,env});
    const providers=(await db.connections(user.id)).filter(p=>p!=='vercel');
    if(credential)providers.push('vercel');
    return json(res,200,{signedIn:true,user:{id:user.id,login:user.login},
     providers,vercelTeam:publicVercelConnection(credential),csrf:csrfFor(rawSession,{env})});
   }
   if(!user)throw new ControlError('LOGIN_REQUIRED','É necessário entrar com GitHub');
   if(url.pathname==='/api/logout'&&req.method==='POST'){
    requireMutation(req,rawSession,{env});
    await db.logout(rawSession);
    res.setHeader('Set-Cookie',makeCookie(sessionName,'',{age:0}));
    return json(res,200,{ok:true});
   }
   if(url.pathname==='/api/connections/disconnect'&&req.method==='POST'){
    requireMutation(req,rawSession,{env});
    const {provider}=await readJSON(req);
    await db.disconnect(user.id,provider);
    return json(res,200,{ok:true,provider});
   }
   if(url.pathname==='/api/connections/vercel/teams'&&req.method==='POST'){
    requireMutation(req,rawSession,{env});
    const teams=await discoverVercelTeams({userId:user.id,payload:await readJSON(req),env,fetcher});
    return json(res,200,teams);
   }
   if(url.pathname==='/api/connections/vercel'&&req.method==='POST'){
    requireMutation(req,rawSession,{env});
    const result=await connectVercel({db,userId:user.id,payload:await readJSON(req),env,fetcher});
    return json(res,200,{ok:true,...result});
   }
   if(url.pathname==='/api/connections/vercel'&&req.method==='GET'){
    const record=await readVercelConnection({db,userId:user.id,env});
    return json(res,200,{connected:!!record,team:publicVercelConnection(record)});
   }
   if(url.pathname==='/api/vercel/diagnostics'&&req.method==='GET'){
    // Never diagnose the maintainers global token in a customer session.
    const account=await readVercelConnection({db,userId:user.id,env});
    if(!account)return json(res,200,{configured:false,reachable:false,
     reason:'TOKEN_NOT_CONFIGURED',writesEnabled:false,managementEnabled:false});
    let response;
    try{
     response=await fetcher('https://api.vercel.com/v9/projects'+vercelQuery(account.teamId,{limit:1}),{
      method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),
      headers:{Authorization:'Bearer '+account.accessToken,Accept:'application/json'}
     });
    }catch{
     return json(res,200,{configured:true,reachable:false,teamId:account.teamId,
      reason:'NETWORK_UNAVAILABLE'});
    }
    const status=response?.status;
    return json(res,200,{configured:true,reachable:status===200,teamId:account.teamId,
     reason:status===200?'READ_ACCESS_CONFIRMED':
      status===401?'TOKEN_UNAUTHORIZED':status===403?'TEAM_ACCESS_FORBIDDEN':
      status===404?'TEAM_NOT_FOUND':'PROVIDER_UNAVAILABLE',
     writesEnabled:env.KAIROS_CONTROL_ENABLE_WRITES==='1',
     managementEnabled:env.KAIROS_VERCEL_MANAGEMENT_ENABLED==='1'});
   }
   if(url.pathname==='/api/preinstallation-audit'&&req.method==='GET'){
    const report=await preinstallationAudit({db,user,env,fetcher});
    return json(res,200,report);
   }
   if(url.pathname==='/api/installations'&&req.method==='GET'){
    return json(res,200,{installations:await db.installations(user.id)});
   }
   if(url.pathname==='/api/installations'&&req.method==='POST'){
    requireMutation(req,rawSession,{env});
    const plan=validateCloudPlan(await readJSON(req),user.login);
    const vercel=await readVercelConnection({db,userId:user.id,env});
    if(!vercel||vercel.teamId!==plan.vercel_team_id)
     throw new ControlError('VERCEL_TEAM_FORBIDDEN','Conecte primeiro a equipe Vercel selecionada');
    const installation=await db.createInstallation(user.id,plan);
    if(!installation)throw new ControlError('STORE_UNAVAILABLE');
    return json(res,201,{installation});
   }
   const automation=url.pathname.match(/^\/api\/installations\/([a-f0-9-]{36})\/automation(?:\/(start))?$/i);
   if(automation&&req.method==='GET'&&!automation[2]){
    const row=await db.installation(user.id,automation[1]);
    if(!row)throw new ControlError('NOT_FOUND');
    const job=await db.automation(user.id,row.id);
    return json(res,200,{enabled:automationReady(env),automation:job?{
     state:job.state,updatedAt:job.updated_at,nextRunAt:job.next_run_at,
     expiresAt:job.expires_at,lastError:job.last_error
    }:null});
   }
   if(automation&&req.method==='POST'&&automation[2]==='start'){
    requireMutation(req,rawSession,{env});
    const row=await db.installation(user.id,automation[1]);
    if(!row)throw new ControlError('NOT_FOUND');
    const approval=await readJSON(req);
    const result=await authorizeAutomation({db,userId:user.id,row,approval,env});
    return json(res,202,result);
   }
   const detail=url.pathname.match(/^\/api\/installations\/([a-f0-9-]{36})$/i);
   if(detail&&req.method==='GET'){
    const row=await db.installation(user.id,detail[1]);
    if(!row)throw new ControlError('NOT_FOUND','Instalação não encontrada');
    return json(res,200,statusForClient(row,await db.operations(row.id)));
   }
   const action=url.pathname.match(/^\/api\/installations\/([a-f0-9-]{36})\/(execute|reconcile|credentials)$/i);
   if(action&&req.method==='POST'){
    requireMutation(req,rawSession,{env});
    const row=await db.installation(user.id,action[1]);
    if(!row)throw new ControlError('NOT_FOUND');
    if(action[2]==='execute'){
     const consent=await readJSON(req);
     const result=await executeCloudStep({db,userId:user.id,row,consent,env,fetcher});
     return json(res,result.status==='waiting'?202:200,result);
    }
    if(action[2]==='reconcile'){
     const result=await reconcileCloudStep({db,userId:user.id,row,env,fetcher});
     return json(res,200,result);
    }
    if(action[2]==='credentials'){
     if(Number(row.phase_index)<6)throw new ControlError('NOT_READY','Primeiro ADM ainda não foi criado');
     const envelope=await db.takeAdminCredentials(row.id,user.id);
     if(!envelope)throw new ControlError('ALREADY_CLAIMED','A senha inicial já foi exibida ou está indisponível');
     const data=decryptControl(envelope,'install:'+row.id,{env});
     if(typeof data?.adminPassword!=='string')throw new ControlError('NO_PASSWORD');
     const {adminPassword,...remaining}=data;
     // Best-effort scrub the encrypted temporary password after the one-time claim.
     // A failed scrub never exposes it to logs and does not permit another claim.
     await db.saveInstallSecrets(row.id,encryptControl(remaining,'install:'+row.id,{env})).catch(()=>{});
     return json(res,200,{login:row.admin_login,temporaryPassword:adminPassword,
      warning:'Exibição única. Guarde em local privado e altere a senha após o primeiro acesso.'});
    }
   }
   if(url.pathname==='/api/readiness'&&req.method==='GET'){
    return json(res,200,{ready:await db.health(),oauthConnected:await db.connections(user.id),
     supportedPhases:phaseFor(0)?8:0,remoteProvisioningEnabled:env.KAIROS_CONTROL_ENABLE_WRITES==='1',
     backgroundAutomationEnabled:automationReady(env),homologated:false});
   }
   return json(res,404,{ok:false,error:'NOT_FOUND'});
  }catch(e){
   // Never expose provider error response bodies, access tokens or database details.
   const code=errCode(e);
   const status=code==='LOGIN_REQUIRED'?401:code==='NOT_FOUND'?404:
    code==='WORKER_UNAUTHORIZED'?401:
    code==='AUTOMATION_DISABLED'||code==='HOMOLOGATION_LOCKED'||
    code==='WRITES_DISABLED'||code==='BETA_SQL_DISABLED'||code==='VERCEL_SCOPE_REQUIRED'?423:
    code==='NOT_CONFIGURED'||code==='STORE_UNAVAILABLE'||code==='STORE_NETWORK'?503:
    code==='INTERNAL_ERROR'?500:400;
   return json(res,status,{ok:false,error:code});
  }
 };
}
export default createHostedHandler();
