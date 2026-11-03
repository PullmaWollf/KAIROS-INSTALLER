#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {ProvisioningError} from '../provisioner/plan.js';
import {executeNext,executeSequence,createOperations} from '../provisioner/orchestrator.js';
const args=process.argv.slice(2);
const arg=n=>{const i=args.indexOf(n);return i>=0?args[i+1]:undefined};
function help(){console.log(`KAIRÓS Orchestrator — v0.8 (execução local)
 node scripts/operate.mjs --state .kairos-install/celula.json --recovery .kairos-install/operations.json
 node scripts/operate.mjs --state .kairos-install/celula.json --recovery .kairos-install/operations.json --execute --accept-billing --confirm-owner SEU_LOGIN --confirm-org SUA_ORG --confirm-team SEU_TIME
 Inclua --run-all para percorrer as etapas até o primeiro bloqueio.

O padrão não acessa provedores. Com --execute, cria recursos SOMENTE nos destinos confirmados.
Em caso de timeout/crash, a próxima execução NÃO repete POST automaticamente: reconcilia e exige revisão.
Tokens/senhas apenas em variáveis de ambiente locais. O arquivo de recovery nunca contém segredos.
Exige Core previamente clonado para aplicar migrações e criar ADM. A etapa de deploy aguarda
produção READY na Vercel; não aciona um novo deployment nesta versão.`);}
function runner(command,cmdArgs,{cwd,env}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,cmdArgs,{cwd,env:{...process.env,...env},shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',d=>{stdout=(stdout+d).slice(-8192);});
  child.stderr.on('data',d=>{stderr=(stderr+d).slice(-8192);});
  child.on('error',()=>reject(new ProvisioningError('TOOL_UNAVAILABLE','CLI local necessária não encontrada')));
  child.on('close',code=>resolve({code,stdout,stderr}));
 });
}
try{
 if(args.includes('--help')){help();process.exit(0);}
 const allowed=new Set(['--state','--recovery','--execute','--accept-billing','--confirm-owner','--confirm-org','--confirm-team','--run-all']);
 if(args.some(a=>a.startsWith('--')&&!allowed.has(a)))throw new ProvisioningError('USAGE','Parâmetro inválido; consulte --help');
 const stateFile=arg('--state'),recoveryFile=arg('--recovery');
 if(!stateFile||!recoveryFile)throw new ProvisioningError('USAGE','Informe --state e --recovery');
 const options={stateFile,recoveryFile,env:process.env,ops:createOperations({runner}),
  consent:{execute:args.includes('--execute'),acceptBilling:args.includes('--accept-billing'),
  owner:arg('--confirm-owner'),organizationId:arg('--confirm-org'),teamId:arg('--confirm-team')}};
 const out=args.includes('--run-all')?await executeSequence(options):await executeNext(options);
 console.log(JSON.stringify(out,null,2));
 if(out.status==='needs-review'||out.report?.some(x=>x.status==='needs-review'))process.exitCode=2;
}catch(e){
 console.error('KAIRÓS:',e instanceof ProvisioningError?'['+e.code+'] '+e.message:'Erro não esperado. Verifique os registros locais antes de repetir');
 process.exitCode=1;
}
