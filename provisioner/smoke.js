import {ProvisioningError} from './plan.js';
function validatedOrigin(url){
 let u;try{u=new URL(url);}catch{throw new ProvisioningError('BAD_URL','URL do aplicativo inválida');}
 if(u.protocol!=='https:'||u.username||u.password||u.search||u.hash||u.pathname!=='/'||!/^[a-z0-9-]+\.vercel\.app$/i.test(u.hostname))
  throw new ProvisioningError('BAD_URL','Use apenas o domínio HTTPS raiz *.vercel.app da célula, sem caminhos, credenciais ou parâmetros');
 return u.origin;
}
export function smokePlan({url}){return Object.freeze({origin:validatedOrigin(url),checks:['GET /api/health (200 esperado)','GET /api/public','GET /manifest.webmanifest','GET /api/me (401 esperado)','GET / (HTML)','GET /sw.js (Service Worker)'],writes:false,includesCredentials:false});}
async function get(fetcher,url){
 let resp;try{resp=await fetcher(url,{method:'GET',redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(12000)});}
 catch{throw new ProvisioningError('NETWORK','Não foi possível consultar o PWA. Confira o deploy e DNS');}
 if(!resp||!Number.isInteger(resp.status))throw new ProvisioningError('BAD_RESPONSE','Resposta inválida do aplicativo');
 let body;try{body=await resp.json();}catch{throw new ProvisioningError('BAD_JSON','API do PWA não retornou JSON válido');}
 return {status:resp.status,body};
}
async function getSiteText(fetcher,url){
 let resp;try{resp=await fetcher(url,{method:'GET',redirect:'error',headers:{Accept:'text/html,application/javascript'},signal:AbortSignal.timeout(12000)});}
 catch{throw new ProvisioningError('NETWORK','Não foi possível verificar os arquivos do PWA');}
 if(resp?.status!==200)throw new ProvisioningError('PWA_FAILED','Arquivo público do PWA não respondeu HTTP 200');
 const length=Number(resp.headers?.get?.('content-length')||0);
 if(length>512000)throw new ProvisioningError('PWA_FAILED','Arquivo do PWA excede limite esperado');
 let data;try{data=await resp.text();}catch{throw new ProvisioningError('PWA_FAILED','Falha na leitura de arquivo público do PWA');}
 if(typeof data!=='string'||data.length>512000)throw new ProvisioningError('PWA_FAILED','Arquivo PWA inválido');
 return data;
}
export async function smokeTest({url,fetcher=fetch,approved=false}){
 const p=smokePlan({url});
 if(!approved)throw new ProvisioningError('CONSENT','Confirme o domínio exclusivo da célula antes de consultar');
 const health=await get(fetcher,p.origin+'/api/health');
 if(health.status!==200||health.body?.ok!==true||health.body?.ready!==true)
  throw new ProvisioningError('HEALTH_FAILED','O Core não confirmou banco, guarda de login e Storage disponíveis');
 const publicData=await get(fetcher,p.origin+'/api/public');
 if(publicData.status!==200||publicData.body?.ok!==true||typeof publicData.body?.branding?.name!=='string'||!Array.isArray(publicData.body?.posts))
  throw new ProvisioningError('PUBLIC_FAILED','API pública do Core não respondeu como esperado');
 const manifest=await get(fetcher,p.origin+'/manifest.webmanifest');
 if(manifest.status!==200||manifest.body?.display!=='standalone'||!Array.isArray(manifest.body?.icons))
  throw new ProvisioningError('PWA_FAILED','Manifesto PWA não está pronto');
 const auth=await get(fetcher,p.origin+'/api/me');
 if(auth.status!==401||auth.body?.ok!==false)throw new ProvisioningError('AUTH_FAILED','Rota protegida não recusou acesso anônimo');
 const page=await getSiteText(fetcher,p.origin+'/');
 if(!/<!doctype html>/i.test(page)||!page.includes('/src/app.js')||!page.includes('/manifest.webmanifest'))
  throw new ProvisioningError('PWA_FAILED','Página inicial não contém estrutura esperada do KAIRÓS');
 const worker=await getSiteText(fetcher,p.origin+'/sw.js');
 if(!worker.includes('addEventListener')||!worker.includes("'/api/'"))
  throw new ProvisioningError('PWA_FAILED','Service Worker não possui proteção de cache da API');
 return {status:'smoke-passed',origin:p.origin,checks:['health','public','manifest','unauthenticated-protection','html-shell','service-worker'],note:'Não testa login ADM, permissões internas, RLS nem instalação em dispositivos reais'};
}
