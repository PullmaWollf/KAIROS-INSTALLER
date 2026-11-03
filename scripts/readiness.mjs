#!/usr/bin/env node
import {readFile} from 'node:fs/promises';
import {newWorkflow} from '../provisioner/workflow.js';
import {readinessReport,inspectLocalCore,statusReport} from '../provisioner/preflight.js';
import {ProvisioningError} from '../provisioner/plan.js';
const args=process.argv.slice(2),option=x=>{const i=args.indexOf(x);return i===-1?undefined:args[i+1];};
try{
 if(args.includes('--help')){
  console.log('KAIRÓS v0.9: node scripts/readiness.mjs --config workflow.local.json --phase github\n'+
   'ou: node scripts/readiness.mjs --state .kairos-install/celula.json --recovery .kairos-install/operations.json\n'+
   'Use --check-core com --config para validar arquivos locais. Somente leitura, sem rede nem tokens impressos.');
  process.exit(0);
 }
 const allowed=new Set(['--config','--phase','--check-core','--state','--recovery']);
 if(args.some(x=>x.startsWith('--')&&!allowed.has(x)))throw new ProvisioningError('USAGE','Opção inválida');
 if(option('--state')){
  const out=await statusReport({stateFile:option('--state'),recoveryFile:option('--recovery'),env:process.env});
  console.log(JSON.stringify(out,null,2));
  if(out.readiness&&!out.readiness.canProceed)process.exitCode=2;
 }else{
  const file=option('--config');
  if(!file)throw new ProvisioningError('USAGE','Informe --config ou --state');
  const config=JSON.parse(await readFile(file,'utf8'));
  const data=newWorkflow(config).config;
  const report=readinessReport(data,process.env,{phase:option('--phase')||'github'});
  const core=args.includes('--check-core')?await inspectLocalCore(data):undefined;
  console.log(JSON.stringify({...report,...(core?{localCore:core}:{})},null,2));
  if(!report.canProceed||core&&!core.ok)process.exitCode=2;
 }
}catch(e){console.error('KAIRÓS:',e instanceof ProvisioningError?'['+e.code+'] '+e.message:'Configuração inválida. Confira o arquivo.');process.exitCode=1;}
