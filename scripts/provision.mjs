#!/usr/bin/env node
/** Execução local; nunca expõe credenciais ao navegador ou ao repositório. */
import {readFile} from 'node:fs/promises';
import {validatePlan,buildPlan,ProvisioningError} from '../provisioner/plan.js';
import {preflightGithub,createGithubFromTemplate} from '../provisioner/github.js';
const args=process.argv.slice(2);
const flag=n=>args.includes(n);
const option=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:undefined;};
function printHelp(){console.log(`
KAIRÓS Provisioner v0.2 — cópia segura do GitHub Core
  node scripts/provision.mjs --plan ./installation-plan.json
  node scripts/provision.mjs --plan ./installation-plan.json --preflight
  node scripts/provision.mjs --plan ./installation-plan.json --execute --confirm-owner SEU-LOGIN

O modo padrão apenas simula e NÃO faz requisições.
--preflight confere token pessoal e template, sem criar nada.
--execute cria UM repositório privado/público na conta que autorizou explicitamente.
GITHUB_TOKEN deve estar definido somente na sessão local do terminal.
Nenhuma chave Supabase ou Vercel é solicitada aqui.
`);}
try{
 if(flag('--help')||flag('-h')){printHelp();process.exit(0);}
 const file=option('--plan');
 if(!file||args.some((x,i)=>x.startsWith('--')&&!['--plan','--preflight','--execute','--confirm-owner'].includes(x)))throw new ProvisioningError('USAGE','Use --plan ./installation-plan.json; consulte --help');
 const data=JSON.parse(await readFile(file,'utf8'));
 const plan=validatePlan(data);
 if(flag('--execute')&&flag('--preflight'))throw new ProvisioningError('USAGE','Escolha preflight OU execute');
 if(flag('--execute')&&option('--confirm-owner')!==plan.owner)throw new ProvisioningError('CONSENT','Para criar recursos, informe --confirm-owner com o nome exato da SUA conta');
 const result=buildPlan(data);
 console.log(JSON.stringify(result,null,2));
 if(!flag('--execute')&&!flag('--preflight')){console.log('SIMULAÇÃO: nenhuma requisição enviada.');process.exit(0);}
 const token=process.env.GITHUB_TOKEN;
 await preflightGithub({token,plan});
 console.log('PREFLIGHT OK: conta própria e template verificados.');
 if(!flag('--execute'))process.exit(0);
 const created=await createGithubFromTemplate({token,plan});
 console.log('CÓPIA CRIADA: '+created.url);
 console.log('Próximas etapas: Supabase e Vercel da própria célula, conforme o assistente.');
}catch(e){
 console.error('KAIRÓS:',e instanceof ProvisioningError?'['+e.code+'] '+e.message:'Não foi possível concluir. Confira o plano e as permissões.');
 process.exitCode=1;
}
