#!/usr/bin/env node
/* Cross-repository contract check; no network or credentials. */
import {readFile,stat} from 'node:fs/promises';
import {resolve,join} from 'node:path';
import {ProvisioningError} from '../provisioner/plan.js';
const args=process.argv.slice(2),idx=args.indexOf('--core-dir');
if(idx<0||!args[idx+1]||args.some(x=>x.startsWith('--')&&x!=='--core-dir')){
 console.error('Uso: node scripts/check-core-contract.mjs --core-dir CAMINHO-DO-CORE');
 process.exit(2);
}
const root=resolve(args[idx+1]);const checks=[];
async function file(path){const p=join(root,path);const s=await stat(p).catch(()=>null);if(!s?.isFile())throw new ProvisioningError('CORE_MISSING','Arquivo obrigatório ausente: '+path);return readFile(p,'utf8');}
function need(ok,rule){if(!ok)throw new ProvisioningError('CORE_MISMATCH','Contrato incompatível: '+rule);checks.push(rule);}
try{
 const [packageText,api,core,sql,guard,admin,manifest,vercel,worker,html]=await Promise.all([
  file('package.json'),file('api/index.js'),file('api/_core.js'),
  file('supabase/migrations/20261103000000_kairos_initial.sql'),
  file('supabase/migrations/20261103010000_kairos_login_throttle.sql'),
  file('scripts/create-admin.mjs'),file('vercel.json'),file('vercel.json'),file('public/sw.js'),file('index.html')
 ]);
 const pkg=JSON.parse(packageText),routing=JSON.parse(vercel);
 need(pkg.name==='kairos-core'&&pkg.dependencies?.['@supabase/supabase-js'],'Core Node e SDK Supabase');
 for(const route of ['health','public','me','login','logout'])need(api.includes("route==='"+route+"'"),'API /api/'+route);
 need(api.includes('loginThrottle')&&core.includes('loginThrottleKey'),'proteção de login');
 need(api.includes('readinessCheck')&&core.includes('readinessCheck'),'verificação de saúde do Core');
 need(/create table if not exists public\.app_users/i.test(sql)&&/enable row level security/i.test(sql),'esquema app_users e RLS');
 need(/function public\.kairos_login_guard/i.test(guard)&&/grant execute on function/i.test(guard),'migração de controle de acesso');
 for(const name of ['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ADMIN_PASSWORD','ADMIN_LOGIN'])
  need(admin.includes(name),'bootstrap '+name);
 need(routing.rewrites?.some(x=>x.source==='/manifest.webmanifest'&&String(x.destination).includes('route=manifest')),'rota de manifesto PWA');
 need(routing.rewrites?.some(x=>x.source==='/api/:route'&&String(x.destination).includes('route=:route')),'rewrites de API');
 need(worker.includes("'/api/'")&&worker.includes('addEventListener'),'Service Worker não armazena API');
 need(html.includes('/src/app.js')&&html.includes('/manifest.webmanifest'),'HTML e manifesto');
 console.log('KAIRÓS: contrato Core/Installer compatível ('+checks.length+' verificações).');
}catch(e){
 console.error('KAIRÓS: '+(e instanceof ProvisioningError?e.message:'Não foi possível validar o Core'));
 process.exitCode=1;
}
