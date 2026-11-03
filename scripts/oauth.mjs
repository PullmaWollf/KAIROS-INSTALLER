#!/usr/bin/env node
import {spawn} from 'node:child_process';
import {createOAuthServer} from '../oauth/server.js';
import {createOperations,executeNext} from '../provisioner/orchestrator.js';
import {ProvisioningError} from '../provisioner/plan.js';
function runner(command,args,{cwd,env}={}){
 return new Promise((resolve,reject)=>{
  const child=spawn(command,args,{cwd,env:{...process.env,...env},shell:false,windowsHide:true,stdio:['ignore','pipe','pipe']});
  let stdout='',stderr='';
  child.stdout.on('data',d=>stdout=(stdout+d).slice(-8192));
  child.stderr.on('data',d=>stderr=(stderr+d).slice(-8192));
  child.on('error',()=>reject(new ProvisioningError('TOOL_UNAVAILABLE','CLI local não encontrada')));
  child.on('close',code=>resolve({code,stdout,stderr}));
 });
}
const port=Number(process.env.KAIROS_OAUTH_PORT||43117);
if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('Porta inválida');
const enabled=process.env.KAIROS_ENABLE_LOCAL_OPERATIONS==='1';
if(enabled&&(!process.env.KAIROS_STATE_FILE||!process.env.KAIROS_RECOVERY_FILE))
 throw new Error('Configure KAIROS_STATE_FILE e KAIROS_RECOVERY_FILE antes de habilitar operações locais');
const operator=enabled?async({consent,tokens})=>{
 const environment={...process.env,
  ...(tokens.github?{GITHUB_TOKEN:tokens.github}:{}),
  ...(tokens.supabase?{SUPABASE_ACCESS_TOKEN:tokens.supabase}:{})};
 return await executeNext({stateFile:process.env.KAIROS_STATE_FILE,recoveryFile:process.env.KAIROS_RECOVERY_FILE,
  env:environment,consent,ops:createOperations({runner})});
}:null;
const server=createOAuthServer({port,operator});
try{
 const url=await server.start();
 console.log('KAIRÓS OAuth local disponível em '+url);
 console.log('Abra essa URL no mesmo computador. O backend não retorna credenciais ao navegador.');
 console.log(enabled?'Modo de operações locais explicitamente habilitado. Revise destinos e custos antes de cada clique.':'Modo seguro: somente OAuth, sem operações remotas.');
 console.log('Vercel depende de integração registrada. Ctrl+C encerra a sessão e descarta tokens em memória.');
 process.once('SIGINT',async()=>{await server.close();process.exit(0);});
 process.once('SIGTERM',async()=>{await server.close();process.exit(0);});
}catch{console.error('Não foi possível iniciar o servidor OAuth local. Verifique a porta e as configurações.');process.exitCode=1;}
