import {createHmac} from 'node:crypto';
import {ControlError,controlKey,equal,decryptControl,encryptControl,randomToken} from './crypto.js';

export function configuredOrigin(env=process.env){
 const origin=String(env.KAIROS_INSTALLER_PUBLIC_ORIGIN||'').replace(/\/$/,'');
 let parsed;
 try{parsed=new URL(origin);}catch{throw new ControlError('NOT_CONFIGURED','Configure o domínio HTTPS do Installer');}
 if(parsed.protocol!=='https:'||parsed.pathname!=='/'||parsed.search||parsed.hash||parsed.username||parsed.password)
  throw new ControlError('NOT_CONFIGURED','O Installer precisa de uma origem HTTPS fixa');
 return parsed.origin;
}
export function cookieValue(req,name){
 const raw=String(req.headers?.cookie||'');
 const segment=raw.split(';').map(s=>s.trim()).find(s=>s.startsWith(name+'='));
 return segment?segment.slice(name.length+1):null;
}
export function makeCookie(name,value,{age,path='/api'}={}){
 if(!/^[a-z0-9_]{3,48}$/i.test(name)||!/^[a-zA-Z0-9_.-]*$/.test(value||''))
  throw new ControlError('BAD_COOKIE');
 return name+'='+value+'; Path='+path+'; HttpOnly; Secure; SameSite=Lax; Max-Age='+age;
}
export function csrfFor(sessionToken,{env=process.env}={}){
 return createHmac('sha256',controlKey(env)).update('kairos-csrf-v1|'+sessionToken).digest('base64url');
}
export function requireMutation(req,sessionToken,{env=process.env}={}){
 const origin=configuredOrigin(env);
 if(req.headers.origin!==origin)throw new ControlError('BAD_ORIGIN','Origem não autorizada');
 if(!equal(String(req.headers['x-kairos-csrf']||''),csrfFor(sessionToken,{env})))
  throw new ControlError('BAD_CSRF','Confirmação de sessão inválida');
}
export function sealOAuth(transaction,subject,{env=process.env}={}){
 return encryptControl({transaction,subject,created:Date.now()},'oauth:pending',{env});
}
export function openOAuth(value,{env=process.env}={}){
 const decoded=decryptControl(value,'oauth:pending',{env});
 if(!decoded||typeof decoded.created!=='number'||Date.now()-decoded.created>600000||decoded.created>Date.now()+5000||
  !decoded.transaction?.state||!decoded.transaction?.verifier)
  throw new ControlError('OAUTH_EXPIRED','Autorização expirou; conecte novamente');
 return decoded;
}
export function responseHeaders(res){
 res.setHeader('Cache-Control','no-store');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('X-Frame-Options','DENY');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'none'; frame-ancestors 'none'");
 res.setHeader('Vary','Cookie');
}
export function json(res,status,data){
 res.statusCode=status;res.setHeader('Content-Type','application/json; charset=utf-8');
 res.end(JSON.stringify(data));
}
export function redirect(res,url){res.statusCode=303;res.setHeader('Location',url);res.end();}
export async function readJSON(req,{maxBytes=8192}={}){
 if(req.body!==undefined){
  const body=typeof req.body==='string'?JSON.parse(req.body):req.body;
  if(!body||typeof body!=='object'||Array.isArray(body)||JSON.stringify(body).length>maxBytes)
   throw new ControlError('BAD_JSON','Dados inválidos');
  return body;
 }
 const chunks=[];let total=0;
 for await(const chunk of req){
  total+=chunk.length;
  if(total>maxBytes)throw new ControlError('BAD_JSON','Limite de tamanho excedido');
  chunks.push(chunk);
 }
 let body;try{body=JSON.parse(Buffer.concat(chunks).toString('utf8'));}catch{throw new ControlError('BAD_JSON','JSON inválido');}
 if(!body||typeof body!=='object'||Array.isArray(body))throw new ControlError('BAD_JSON','Objeto esperado');
 return body;
}
