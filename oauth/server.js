import {createServer} from 'node:http';
import {randomBytes} from 'node:crypto';
import {ProvisioningError} from '../provisioner/plan.js';
import {beginAuthorization,exchangeCode,providerConfig,safeEqual} from './protocol.js';
function cookies(header=''){return Object.fromEntries(header.split(';').map(s=>s.trim().split('=').slice(0,2)).filter(x=>x.length===2));}
function headers(res){res.setHeader('Cache-Control','no-store');res.setHeader('X-Content-Type-Options','nosniff');res.setHeader('Referrer-Policy','no-referrer');res.setHeader('Content-Security-Policy',"default-src 'none'; style-src 'unsafe-inline'; form-action 'self'; base-uri 'none'; frame-ancestors 'none'");}
function respond(res,code,body,type='text/plain; charset=utf-8'){res.writeHead(code,{'Content-Type':type});res.end(body);}
export function createOAuthServer({env=process.env,fetcher=fetch,port=43117}={}){
 const sessions=new Map();
 const MAX_SESSIONS=8,MAX_TTL=30*60*1000;
 let base;
 const http=createServer(async(req,res)=>{
  headers(res);
  try{
   if(!base||req.headers.host!=='127.0.0.1:'+port)throw new ProvisioningError('BAD_HOST','Host inválido');
   if(!['GET','POST'].includes(req.method))return respond(res,405,'Método não permitido');
   const u=new URL(req.url,base);
   if(u.origin!==base)return respond(res,400,'URL inválida');
   const sid=cookies(req.headers.cookie).kairos_sid;
   let session=sid&&sessions.get(sid);
   if(session&&session.createdAt+MAX_TTL<Date.now()){sessions.delete(sid);session=null;}
   if(u.pathname==='/'){
    if(!session){
     if(sessions.size>=MAX_SESSIONS)return respond(res,429,'Limite de sessões atingido');
     const key=randomBytes(32).toString('base64url');
     session={createdAt:Date.now(),pending:new Map(),tokens:new Map()};
     sessions.set(key,session);
     res.setHeader('Set-Cookie','kairos_sid='+key+'; HttpOnly; SameSite=Lax; Path=/; Max-Age=1800');
    }
    const configured=['github','supabase'].filter(p=>{try{providerConfig(p,env);return true;}catch{return false;}});
    const enabled=configured.map(p=>'<li><a href="/connect/'+p+'">Conectar '+p+'</a></li>').join('');
    const html='<!doctype html><html lang="pt-BR"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>KAIRÓS — OAuth local</title><body><h1>KAIRÓS — Conexões locais</h1><p>Autorizações somente nesta máquina. Tokens em memória, nunca no navegador ou disco.</p><ul>'+enabled+'</ul><p>Provedores conectados: consulte <a href="/status">status</a>.</p><p>Vercel exige integração registrada; ainda não disponível neste fluxo.</p></body></html>';
    return respond(res,200,html,'text/html; charset=utf-8');
   }
   if(!session)return respond(res,401,'Abra primeiro a página inicial do instalador local');
   if(u.pathname==='/status'&&req.method==='GET'){
    return respond(res,200,JSON.stringify({connected:[...session.tokens.keys()],pending:[...session.pending.keys()]}),'application/json; charset=utf-8');
   }
   const start=u.pathname.match(/^\/connect\/(github|supabase)$/);
   if(start&&req.method==='GET'){
    // Blocking cross-site navigations prevents unauthenticated login initiation.
    const referer=req.headers.referer;
    if(!referer||!referer.startsWith(base+'/'))return respond(res,403,'Abra o link pela página local');
    const provider=start[1],config=providerConfig(provider,env);
    const callbackUrl=base+'/callback/'+provider;
    const auth=beginAuthorization({provider,config,callbackUrl});
    session.pending.set(provider,auth.transaction);
    res.writeHead(302,{Location:auth.url});return res.end();
   }
   const cb=u.pathname.match(/^\/callback\/(github|supabase)$/);
   if(cb&&req.method==='GET'){
    const provider=cb[1],pending=session.pending.get(provider);
    if(!pending||pending.expiresAt<Date.now()||!safeEqual(pending.state,u.searchParams.get('state')))
     return respond(res,403,'Autorização expirada ou state inválido');
    session.pending.delete(provider); // single use before token exchange
    const config=providerConfig(provider,env);
    const token=await exchangeCode({transaction:pending,code:u.searchParams.get('code'),config,fetcher});
    session.tokens.set(provider,token);
    return respond(res,200,'Conexão '+provider+' concluída. Pode fechar esta aba. Tokens permanecem apenas na memória local.');
   }
   if(u.pathname==='/disconnect'&&req.method==='POST'){
    if(req.headers.origin!==base)return respond(res,403,'Origem inválida');
    session.pending.clear();session.tokens.clear();sessions.delete(sid);
    res.setHeader('Set-Cookie','kairos_sid=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0');
    return respond(res,200,'Sessão local encerrada. Revogue permissões também no provedor se necessário.');
   }
   return respond(res,404,'Não encontrado');
  }catch(e){return respond(res,typeof e?.code==='string'?400:500,'Não foi possível concluir a autorização; verifique configurações locais.');}
 });
 return {
  async start(){
   await new Promise((resolve,reject)=>http.once('error',reject).listen(port,'127.0.0.1',resolve));
   base='http://127.0.0.1:'+port;
   return base;
  },
  async close(){sessions.clear();await new Promise(resolve=>http.close(resolve));},
  // Tokens are deliberately not exposed through HTTP. An orchestrator running in the same
  // trusted process may receive tokens through a separately authenticated, explicit binding.
  getTokensForLocalSession(sid){return sessions.get(sid)?.tokens||null;}
 };
}
