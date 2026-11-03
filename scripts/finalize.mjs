#!/usr/bin/env node
/** Fluxo local KAIRÓS. Dry-run por padrão; não recebe tokens por parâmetros/arquivos. */
import {spawn} from 'node:child_process';
import {migrationPlan,migrateSupabase} from '../provisioner/migrations.js';
import {environmentPlan,configureVercelEnvironment} from '../provisioner/vercel-env.js';
import {checkDeployment,deployTarget} from '../provisioner/deployment.js';
import {ProvisioningError} from '../provisioner/plan.js';
import {bootstrapPlan,bootstrapAdmin} from '../provisioner/bootstrap.js';
import {smokePlan,smokeTest} from '../provisioner/smoke.js';

const argv=process.argv.slice(2),flag=x=>argv.includes(x),opt=x=>{const n=argv.indexOf(x);return n>=0?argv[n+1]:undefined};
function usage(){console.log(`KAIRÓS Installer v0.6 — finalização controlada
  node scripts/finalize.mjs --action migrate
  node scripts/finalize.mjs --action migrate --execute --confirm-project REF
  node scripts/finalize.mjs --action env
  node scripts/finalize.mjs --action env --execute --confirm-project prj_ID --confirm-team team_ID
  node scripts/finalize.mjs --action status --execute --confirm-project prj_ID --confirm-team team_ID
  node scripts/finalize.mjs --action bootstrap --execute --confirm-project REF
  node scripts/finalize.mjs --action smoke --execute --confirm-origin https://app-celula.vercel.app

Sem --execute, mostra apenas o plano, SEM acessar a rede.
migrate: SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD, KAIROS_SUPABASE_PROJECT_REF,
 KAIROS_GITHUB_OWNER, KAIROS_CORE_DIR (pasta da cópia do Core no computador).
env: VERCEL_TOKEN, KAIROS_VERCEL_TEAM_ID, KAIROS_VERCEL_PROJECT_ID,
 KAIROS_GITHUB_OWNER, KAIROS_GITHUB_REPO,
 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, SESSION_SECRET.
status: VERCEL_TOKEN, KAIROS_VERCEL_TEAM_ID, KAIROS_VERCEL_PROJECT_ID.
bootstrap: KAIROS_CORE_DIR, KAIROS_GITHUB_OWNER, KAIROS_SUPABASE_PROJECT_REF,
 SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, KAIROS_ADMIN_LOGIN, KAIROS_ADMIN_NAME, ADMIN_PASSWORD.
smoke: KAIROS_PWA_URL. Nenhuma senha é enviada à URL pública.
Somente credenciais do administrador da célula. Não cole tokens no site nem em logs.`);}
function runner(cmd,args,{cwd,env}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(cmd,args,{cwd,env:{...process.env,...env},shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  const read=(key,chunk)=>{const str=chunk.toString('utf8');if(key==='out')stdout=(stdout+str).slice(-8000);else stderr=(stderr+str).slice(-8000);};
  child.stdout.on('data',c=>read('out',c));child.stderr.on('data',c=>read('err',c));
  child.on('error',()=>reject(new ProvisioningError('TOOL_UNAVAILABLE',cmd+' não encontrado. Instale a CLI no seu computador.')));
  child.on('close',code=>resolve({code,stdout,stderr}));
 });
}
try{
 if(flag('--help')||flag('-h')){usage();process.exit(0);}
 const action=opt('--action'),env=process.env;
 if(!['migrate','env','status','bootstrap','smoke'].includes(action))throw new ProvisioningError('USAGE','Informe --action migrate, env, status, bootstrap ou smoke; consulte --help');
 const accepted=new Set(['--action','--execute','--confirm-project','--confirm-team','--confirm-origin']);
 if(argv.some(a=>a.startsWith('--')&&!accepted.has(a)))throw new ProvisioningError('USAGE','Parâmetro desconhecido');
 let plan;
 if(action==='migrate')plan=migrationPlan({projectRef:env.KAIROS_SUPABASE_PROJECT_REF,repoOwner:env.KAIROS_GITHUB_OWNER,coreDir:env.KAIROS_CORE_DIR});
 else if(action==='bootstrap')plan=bootstrapPlan({coreDir:env.KAIROS_CORE_DIR,repoOwner:env.KAIROS_GITHUB_OWNER,adminLogin:env.KAIROS_ADMIN_LOGIN,adminName:env.KAIROS_ADMIN_NAME});
 else if(action==='smoke')plan=smokePlan({url:env.KAIROS_PWA_URL});
 else if(action==='env')plan=environmentPlan({teamId:env.KAIROS_VERCEL_TEAM_ID,projectId:env.KAIROS_VERCEL_PROJECT_ID,repoOwner:env.KAIROS_GITHUB_OWNER,repoName:env.KAIROS_GITHUB_REPO});
 else plan=deployTarget({teamId:env.KAIROS_VERCEL_TEAM_ID,projectId:env.KAIROS_VERCEL_PROJECT_ID});
 console.log(JSON.stringify({mode:flag('--execute')?'authorized':'dry-run',action,target:plan},null,2));
 if(!flag('--execute')){console.log('SIMULAÇÃO: nenhuma requisição ou alteração executada.');process.exit(0);}
 if(action==='smoke'){
  if(opt('--confirm-origin')!==plan.origin)throw new ProvisioningError('CONSENT','Confirme a URL da célula com --confirm-origin');
  const result=await smokeTest({url:plan.origin,approved:true});console.log(JSON.stringify(result,null,2));
 }else{
 const projectId=action==='migrate'||action==='bootstrap'?env.KAIROS_SUPABASE_PROJECT_REF:plan.projectId;
 if(!projectId||opt('--confirm-project')!==projectId)throw new ProvisioningError('CONSENT','Confirme o projeto com --confirm-project '+projectId);
 if(action==='bootstrap'){
  const expected='https://'+projectId+'.supabase.co';
  if(env.SUPABASE_URL!==expected)throw new ProvisioningError('WRONG_SUPABASE','URL Supabase diferente do projeto confirmado');
  const result=await bootstrapAdmin({plan,runner,approved:true,environment:{
   SUPABASE_URL:env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY,
   ADMIN_PASSWORD:env.ADMIN_PASSWORD
  }});console.log(JSON.stringify(result,null,2));
 }else if(action==='migrate'){
  const r=await migrateSupabase({plan,runner,approved:true,environment:{SUPABASE_ACCESS_TOKEN:env.SUPABASE_ACCESS_TOKEN,SUPABASE_DB_PASSWORD:env.SUPABASE_DB_PASSWORD}});
  console.log(JSON.stringify(r,null,2));
 }else{
  if(opt('--confirm-team')!==plan.teamId)throw new ProvisioningError('CONSENT','Confirme o time Vercel com --confirm-team');
  if(action==='env'){
   const url=String(env.SUPABASE_URL||'');
   const supabaseRef=env.KAIROS_SUPABASE_PROJECT_REF;
   if(!supabaseRef||url!==`https://${supabaseRef}.supabase.co`)throw new ProvisioningError('WRONG_SUPABASE','A URL do Supabase precisa corresponder ao project ref explicitamente escolhido');
   const r=await configureVercelEnvironment({token:env.VERCEL_TOKEN,target:plan,approved:true,secrets:{
    SUPABASE_URL:env.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:env.SUPABASE_SERVICE_ROLE_KEY,SESSION_SECRET:env.SESSION_SECRET
   }});
   console.log(JSON.stringify(r,null,2));
  }else console.log(JSON.stringify(await checkDeployment({token:env.VERCEL_TOKEN,target:plan}),null,2));
 }
 }
}catch(e){
 console.error('KAIRÓS:',e instanceof ProvisioningError?'['+e.code+'] '+e.message:'Operação não concluída. Confira seu projeto nos painéis oficiais.');
 process.exitCode=1;
}
