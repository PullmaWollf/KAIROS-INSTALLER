import {ProvisioningError,TEMPLATE_OWNER} from './plan.js';
import {stat,readFile} from 'node:fs/promises';
import {join,resolve} from 'node:path';
const ref=/^[a-z0-9]{10,30}$/;
const baseline='20261103000000_kairos_initial.sql';
export function migrationPlan({projectRef,repoOwner,coreDir}){
 if(!ref.test(projectRef||''))throw new ProvisioningError('BAD_REF','Project ref Supabase inválido');
 if(!/^[a-z\d][a-z\d-]{0,38}$/i.test(repoOwner||''))throw new ProvisioningError('BAD_OWNER','GitHub owner inválido');
 if(repoOwner.toLowerCase()===TEMPLATE_OWNER.toLowerCase())throw new ProvisioningError('MAINTAINER_ACCOUNT','Não execute no Core original do mantenedor');
 if(!coreDir||typeof coreDir!=='string')throw new ProvisioningError('BAD_DIR','Informe a pasta local do Core clonado');
 return Object.freeze({projectRef,repoOwner,coreDir:resolve(coreDir),link:['link','--project-ref',projectRef],preview:['db','push','--linked','--dry-run'],apply:['db','push','--linked','--yes'],mode:'dry-run'});
}
export async function inspectCore({plan,runner}){
 const file=join(plan.coreDir,'supabase','migrations',baseline);
 const st=await stat(file).catch(()=>null);
 if(!st?.isFile())throw new ProvisioningError('MISSING_MIGRATION','Migração inicial não encontrada na pasta Core da célula');
 const sql=await readFile(file,'utf8');
 if(!/create table if not exists public\.app_users/i.test(sql)||!/enable row level security/i.test(sql))
  throw new ProvisioningError('INVALID_MIGRATION','A migração inicial não corresponde à base esperada do KAIRÓS');
 const securityFile=join(plan.coreDir,'supabase','migrations','20261103010000_kairos_login_throttle.sql');
 const securityStat=await stat(securityFile).catch(()=>null);
 if(!securityStat?.isFile())throw new ProvisioningError('MISSING_MIGRATION','Migração de segurança do login ausente; atualize a cópia do Core');
 const securitySql=await readFile(securityFile,'utf8');
 if(!/kairos_login_guard/i.test(securitySql)||!/enable row level security/i.test(securitySql))
  throw new ProvisioningError('INVALID_MIGRATION','Migração de proteção do login inválida');
 const git=await runner('git',['remote','get-url','origin'],{cwd:plan.coreDir});
 if(git.code!==0)throw new ProvisioningError('NO_REMOTE','Repositório Core sem origem Git verificável');
 const remote=git.stdout.trim().replace(/\.git$/,'').replace(/\/$/,'');
 const m=remote.match(/(?:https:\/\/github\.com\/|git@github\.com:)([a-z\d-]+)\/([a-z\d._-]+)$/i);
 if(!m||m[1].toLowerCase()!==plan.repoOwner.toLowerCase()||m[2].toLowerCase()==='kairos-core'&&m[1].toLowerCase()===TEMPLATE_OWNER.toLowerCase())
  throw new ProvisioningError('WRONG_REPO','Pasta local não pertence à conta GitHub da célula informada');
 return {repository:m[1]+'/'+m[2],migration:baseline};
}
export async function migrateSupabase({plan,runner,approved=false,environment={}}){
 await inspectCore({plan,runner});
 if(!environment.SUPABASE_ACCESS_TOKEN||!environment.SUPABASE_DB_PASSWORD)throw new ProvisioningError('NO_AUTH','Forneça credenciais temporárias Supabase apenas no terminal local');
 const linked=await runner('supabase',plan.link,{cwd:plan.coreDir,env:environment});
 if(linked.code!==0)throw new ProvisioningError('LINK_FAILED','Não foi possível vincular o projeto Supabase informado; nenhuma migração aplicada');
 const preview=await runner('supabase',plan.preview,{cwd:plan.coreDir,env:environment});
 if(preview.code!==0)throw new ProvisioningError('MIGRATION_PREVIEW_FAILED','Falha no dry-run. Verifique no terminal e no painel Supabase');
 if(!approved)return {status:'preview-complete',projectRef:plan.projectRef,applied:false};
 const apply=await runner('supabase',plan.apply,{cwd:plan.coreDir,env:environment});
 if(apply.code!==0)throw new ProvisioningError('MIGRATION_FAILED','Não foi possível confirmar a migração. Verifique histórico antes de repetir');
 return {status:'applied',projectRef:plan.projectRef,applied:true};
}
