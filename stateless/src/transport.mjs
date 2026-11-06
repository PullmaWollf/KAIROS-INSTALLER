import {InstallationError} from './validation.mjs';
export function headers(res){
 res.setHeader('Cache-Control','no-store, max-age=0');
 res.setHeader('Content-Type','application/json; charset=utf-8');
 res.setHeader('X-Content-Type-Options','nosniff');
 res.setHeader('Referrer-Policy','no-referrer');
 res.setHeader('Content-Security-Policy',"default-src 'none'");
}
export function respond(res,status,data){headers(res);res.statusCode=status;res.end(JSON.stringify(data));}
export function requireSameOrigin(req){
 const base=process.env.KAIROS_INSTALLER_PUBLIC_ORIGIN;
 if(!base || !/^https:\/\/[a-z0-9.-]+$/i.test(base))throw new InstallationError('HOST_NOT_CONFIGURED');
 const origin=req.headers.origin,host=req.headers.host;
 if(origin!==base||host!==new URL(base).host)throw new InstallationError('ORIGIN_DENIED');
}
export async function bodyFrom(req){
 if(req.body!==undefined){
  if(typeof req.body==='object'&&!Array.isArray(req.body)&&JSON.stringify(req.body).length<=12000)return req.body;
  throw new InstallationError('BAD_REQUEST');
 }
 let size=0,data='';
 for await(const chunk of req){size+=chunk.length;if(size>12000)throw new InstallationError('BAD_REQUEST');data+=chunk.toString('utf8');}
 try{const parsed=JSON.parse(data);if(parsed&&typeof parsed==='object'&&!Array.isArray(parsed))return parsed;}
 catch{}throw new InstallationError('BAD_REQUEST');
}
export function fail(res,e){
 const code=e instanceof InstallationError?e.code:'INTERNAL_ERROR';
 respond(res,code==='INTERNAL_ERROR'?500:code==='HOST_NOT_CONFIGURED'?503:400,
  {ok:false,error:code,...(code==='PARTIAL_INSTALL_NEEDS_REVIEW'?{repositoryUrl:e.repositoryUrl}: {})});
}