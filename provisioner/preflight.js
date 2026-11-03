import {ProvisioningError} from './plan.js';
import {validateWorkflowConfig,PHASES,nextPhase} from './workflow.js';
import {readJournal} from './journal.js';
import {readRecovery,recoveryStatus} from './recovery.js';
import {validateSecrets} from './vercel-env.js';
import {migrationPlan} from './migrations.js';
import {stat,readFile} from 'node:fs/promises';
import {join} from 'node:path';

const sensitive=['GITHUB_TOKEN','SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD','VERCEL_TOKEN','SUPABASE_SERVICE_ROLE_KEY','SESSION_SECRET','ADMIN_PASSWORD'];
export function readinessReport(input,env={},options={}){
 const c=validateWorkflowConfig(input);
 const findings=[],required=(code,ok,detail)=>findings.push({code,status:ok?'ready':'blocked',detail});
 required('github-destination',c.owner.toLowerCase()!=='pullmawollf','Destino GitHub da própria célula');
 required('supabase-organization',!!c.supabaseOrgId,'Organização Supabase da célula configurada');
 required('vercel-team',!!c.vercelTeamId,'Time Vercel da célula configurado');
 required('core-directory',!!c.coreDir,'Caminho da cópia local do Core configurado');
 required('admin-account',!!c.adminLogin,'Identificador do administrador configurado');
 const activePhase=options.phase||'github';
 if(!PHASES.some(x=>x.id===activePhase))throw new ProvisioningError('BAD_PHASE','Etapa não reconhecida');
 const phaseCredentials={
  github:['GITHUB_TOKEN'],supabase:['SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD'],
  migrate:['SUPABASE_ACCESS_TOKEN','SUPABASE_DB_PASSWORD'],vercel:['VERCEL_TOKEN'],
  env:['VERCEL_TOKEN','SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','SESSION_SECRET'],
  bootstrap:['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ADMIN_PASSWORD'],
  deploy:['VERCEL_TOKEN'],smoke:[]
 };
 for(const key of phaseCredentials[activePhase]){
  const configured=typeof env[key]==='string'&&env[key].length>0;
  required('credential-'+key,configured,'Variável local '+key+(configured?' presente':' ausente')+' (valor nunca é exibido)');
 }
 if(['migrate','env','bootstrap'].includes(activePhase))required('supabase-reference',!!c.supabaseRef,'Identificador Supabase gerado após criar projeto');
 if(['env','deploy'].includes(activePhase))required('vercel-project',!!c.vercelProjectId,'Identificador do projeto Vercel da célula');
 if(activePhase==='env'&&phaseCredentials[activePhase].every(k=>env[k])){
  let validated=false;
  try{validateSecrets(env);validated=env.SUPABASE_URL==='https://'+c.supabaseRef+'.supabase.co';}catch{}
  required('secrets-compatible',validated,'URL do banco, segredo de sessão e chave privada precisam corresponder ao projeto selecionado');
 }
 if(activePhase==='bootstrap'&&env.SUPABASE_URL)required('bootstrap-database-url',env.SUPABASE_URL==='https://'+c.supabaseRef+'.supabase.co','O banco do ADM deve corresponder ao ref escolhido');
 if(activePhase==='smoke')required('pwa-domain',!!c.pwaUrl,'URL HTTPS da célula precisa estar configurada');
 return Object.freeze({phase:activePhase,canProceed:findings.every(f=>f.status==='ready'),findings,remoteCalls:0,createsResources:false,
  homologated:false,warning:'Pré-diagnóstico local não valida permissões reais nos provedores nem autenticação do PWA'});
}
export async function inspectLocalCore(config,{checkFiles=true}={}){
 const c=validateWorkflowConfig(config),files=[
  'supabase/migrations/20261103000000_kairos_initial.sql',
  'supabase/migrations/20261103010000_kairos_login_throttle.sql',
  'scripts/create-admin.mjs','package.json','package-lock.json','vercel.json',
  'api/index.js','public/sw.js'
 ];
 const found=[];
 for(const file of files){
  const path=join(c.coreDir,file);
  const st=await stat(path).catch(()=>null);
  found.push({file,exists:!!st?.isFile()});
 }
 let schemaValid=false;
 if(found[0].exists&&found[1].exists){
  const [schema,guard]=await Promise.all([readFile(join(c.coreDir,files[0]),'utf8'),readFile(join(c.coreDir,files[1]),'utf8')]);
  schemaValid=/create table if not exists public\.app_users/i.test(schema)&&
   /enable row level security/i.test(schema)&&/kairos_login_guard/i.test(guard);
 }
 const ok=found.every(x=>x.exists)&&schemaValid;
 return {ok,files:found,securityMigrationPresent:found[1].exists,schemaValid,noRemoteCalls:true};
}
export async function statusReport({stateFile,recoveryFile,env={}}){
 const state=await readJournal(stateFile);
 const phase=nextPhase(state);
 let recoveryStatusValue='not-created';
 try{
  const journal=await readRecovery(recoveryFile);
  const c=state.config;
  if(journal.scope.owner!==c.owner||journal.scope.repository!==c.repository||
   journal.scope.supabaseOrgId!==c.supabaseOrgId||journal.scope.vercelTeamId!==c.vercelTeamId)
   throw new ProvisioningError('WRONG_SCOPE','Registro não corresponde à instalação');
  recoveryStatusValue=phase?recoveryStatus(journal,phase):'complete';
 }catch(e){if(e.code!=='ENOENT')throw e;}
 return {phase:phase||'completed',attempt:recoveryStatusValue,readiness:phase?readinessReport(state.config,env,{phase}):null,
  completed:PHASES.filter(p=>state.steps[p.id].state!=='pending').length,
  total:PHASES.length,requiresReview:['started','needs-review'].includes(recoveryStatusValue),
  homologated:false,remoteCalls:0};
}
