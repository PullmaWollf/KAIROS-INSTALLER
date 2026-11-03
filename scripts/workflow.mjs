#!/usr/bin/env node
/** Orquestração v0.7: checkpoint sem segredos; cada ação externa continua opt-in via CLIs v0.2-v0.6. */
import {readFile} from 'node:fs/promises';
import {ProvisioningError} from '../provisioner/plan.js';
import {newWorkflow,validateWorkflow,completePhase,updateTargets,workflowSummary,nextPhase} from '../provisioner/workflow.js';
import {readJournal,writeJournal} from '../provisioner/journal.js';
const args=process.argv.slice(2);
const option=name=>{const index=args.indexOf(name);return index>=0?args[index+1]:undefined;};
function help(){console.log(`KAIRÓS Workflow v0.7 — instalação assistida e recuperável
  node scripts/workflow.mjs --init --config minha-celula.json --state .kairos-install/celula.json
  node scripts/workflow.mjs --status --state .kairos-install/celula.json
  node scripts/workflow.mjs --set-target supabaseRef=REF --state .kairos-install/celula.json
  node scripts/workflow.mjs --set-target vercelProjectId=prj_ID --state .kairos-install/celula.json
  node scripts/workflow.mjs --set-target pwaUrl=https://celula.vercel.app --state .kairos-install/celula.json
  node scripts/workflow.mjs --mark github --confirm-step github --state .kairos-install/celula.json
  node scripts/workflow.mjs --mark smoke --confirm-step smoke --state .kairos-install/celula.json

O registro guarda SOMENTE identificadores não secretos e confirmações manuais; não armazena tokens ou senhas.
--mark NÃO executa operações externas nem comprova a execução: apenas registra uma declaração do administrador.
Para executar operações reais, veja docs/WORKFLOW.md e use os comandos individuais com confirmação explícita.
`);}
try{
 if(args.includes('--help')||args.includes('-h')){help();process.exit(0);}
 const allowed=new Set(['--init','--status','--config','--state','--mark','--confirm-step','--set-target']);
 if(args.some(a=>a.startsWith('--')&&!allowed.has(a)))throw new ProvisioningError('USAGE','Opção desconhecida');
 const commands=['--init','--status','--mark','--set-target'].filter(x=>args.includes(x));
 if(commands.length!==1||!option('--state'))throw new ProvisioningError('USAGE','Escolha uma operação e informe --state. Veja --help');
 const file=option('--state'),cmd=commands[0];
 if(cmd==='--init'){
  if(!option('--config'))throw new ProvisioningError('USAGE','Informe --config');
  const obj=JSON.parse(await readFile(option('--config'),'utf8'));
  await writeJournal(file,newWorkflow(obj),{initial:true});
  console.log('Registro de instalação criado. Nenhuma operação remota executada.');
 }else if(cmd==='--status'){
  console.log(JSON.stringify(workflowSummary(await readJournal(file)),null,2));
 }else if(cmd==='--set-target'){
  const part=option('--set-target')||'',pos=part.indexOf('=');
  if(pos<=0)throw new ProvisioningError('USAGE','Use chave=valor');
  const state=await readJournal(file);
  const updated=updateTargets(state,{[part.slice(0,pos)]:part.slice(pos+1)});
  await writeJournal(file,updated);
  console.log('Destino atualizado. Nenhuma operação remota executada.');
 }else{
  const step=option('--mark');
  if(option('--confirm-step')!==step)throw new ProvisioningError('CONSENT','Confirme a etapa usando --confirm-step '+step);
  const state=await readJournal(file);
  const updated=completePhase(state,step);
  await writeJournal(file,updated);
  console.log('Etapa registrada como CONFIRMADA MANUALMENTE. Não foi verificada automaticamente.');
 }
 if(cmd!=='--status'){
  const s=await readJournal(file);
  console.log(JSON.stringify({next:nextPhase(s),...workflowSummary(s)},null,2));
 }
}catch(e){
 console.error('KAIRÓS:',e instanceof ProvisioningError?'['+e.code+'] '+e.message:'Não foi possível atualizar o registro. Confira o JSON e o caminho.');
 process.exitCode=1;
}
