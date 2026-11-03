#!/usr/bin/env node
/** Execução explícita e única por provedor; nunca imprime variáveis secretas. */
import {supabaseProjectPlan,vercelProjectPlan,createSupabaseProject,createVercelProject} from '../provisioner/create-projects.js';
import {ProvisioningError} from '../provisioner/plan.js';
const args=process.argv.slice(2);
function flag(v){return args.includes(v);}
function opt(v){const idx=args.indexOf(v);return idx>=0?args[idx+1]:undefined;}
function help(){console.log(`KAIRÓS Installer — criação controlada de projetos
Uso:
  node scripts/create-project.mjs --provider supabase
  node scripts/create-project.mjs --provider vercel
  node scripts/create-project.mjs --provider supabase --execute --confirm-org ORG_ID --accept-billing
  node scripts/create-project.mjs --provider vercel --execute --confirm-team TEAM_ID --accept-billing

Simulação por padrão. A execução real só pode criar 1 projeto por chamada.
Variáveis Supabase: KAIROS_SUPABASE_ORG_ID, KAIROS_PROJECT_NAME, KAIROS_SUPABASE_REGION, SUPABASE_ACCESS_TOKEN, SUPABASE_DB_PASSWORD.
Variáveis Vercel: KAIROS_VERCEL_TEAM_ID, KAIROS_PROJECT_NAME, KAIROS_GITHUB_OWNER, KAIROS_GITHUB_REPO, VERCEL_TOKEN.
Configurar apenas no ambiente local do administrador. Nunca usar tokens de produção do mantenedor.
`);}
try{
 if(flag('--help')||flag('-h')){help();process.exit(0);}
 const provider=opt('--provider');
 if(!['supabase','vercel'].includes(provider))throw new ProvisioningError('USAGE','Selecione --provider supabase ou vercel');
 const allowed=new Set(['--provider','--execute','--confirm-org','--confirm-team','--accept-billing']);
 for(const arg of args)if(arg.startsWith('--')&&!allowed.has(arg))throw new ProvisioningError('USAGE','Argumento desconhecido');
 const e=process.env;
 const projectName=e.KAIROS_PROJECT_NAME;
 const plan=provider==='supabase'?
  supabaseProjectPlan({organizationId:e.KAIROS_SUPABASE_ORG_ID,projectName,region:e.KAIROS_SUPABASE_REGION}):
  vercelProjectPlan({teamId:e.KAIROS_VERCEL_TEAM_ID,projectName,repoOwner:e.KAIROS_GITHUB_OWNER,repoName:e.KAIROS_GITHUB_REPO});
 console.log(JSON.stringify({mode:'dry-run',plan},null,2));
 if(!flag('--execute')){console.log('SIMULAÇÃO: nenhuma chamada de rede e nenhum projeto criado.');process.exit(0);}
 if(!flag('--accept-billing'))throw new ProvisioningError('CONSENT','Confirme os possíveis custos com --accept-billing');
 if(provider==='supabase'&&opt('--confirm-org')!==plan.organizationId)throw new ProvisioningError('CONSENT','Confirme a organização de destino com --confirm-org');
 if(provider==='vercel'&&opt('--confirm-team')!==plan.teamId)throw new ProvisioningError('CONSENT','Confirme o time de destino com --confirm-team');
 const result=provider==='supabase'?
  await createSupabaseProject({token:e.SUPABASE_ACCESS_TOKEN,plan,dbPassword:e.SUPABASE_DB_PASSWORD,approved:true}):
  await createVercelProject({token:e.VERCEL_TOKEN,plan,approved:true});
 console.log(JSON.stringify(result,null,2));
 console.log('Projeto criado; ainda NÃO está pronto para uso. Configure migrações, segredos e deploy na conta da célula.');
}catch(err){
 console.error('KAIRÓS:',err instanceof ProvisioningError?'['+err.code+'] '+err.message:'Falha inesperada. Confira o provedor antes de repetir.');
 process.exitCode=1;
}
