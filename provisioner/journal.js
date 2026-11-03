import {open,readFile,rename,stat,unlink,mkdir} from 'node:fs/promises';
import {dirname,resolve,basename,join} from 'node:path';
import {randomBytes} from 'node:crypto';
import {ProvisioningError} from './plan.js';
import {validateWorkflow} from './workflow.js';
function pathOk(filename){
 if(!filename||typeof filename!=='string'||!filename.endsWith('.json'))throw new ProvisioningError('BAD_FILE','Use um arquivo JSON local específico');
 return resolve(filename);
}
export async function readJournal(filename){
 const path=pathOk(filename);
 const info=await stat(path);
 if(!info.isFile()||info.size>32000)throw new ProvisioningError('BAD_STATE','Registro não é arquivo JSON válido');
 try{return validateWorkflow(JSON.parse(await readFile(path,'utf8')));}
 catch(e){if(e instanceof ProvisioningError)throw e;throw new ProvisioningError('BAD_STATE','Registro JSON inválido');}
}
export async function writeJournal(filename,workflow,{initial=false}={}){
 const path=pathOk(filename),state=validateWorkflow(workflow),parent=dirname(path);
 await mkdir(parent,{recursive:true});
 const lockPath=path+'.lock',tmp=join(parent,'.'+basename(path)+'.'+randomBytes(8).toString('hex')+'.tmp');
 let lock,temp;
 try{
  lock=await open(lockPath,'wx',0o600);
  const exists=await stat(path).then(()=>true,()=>false);
  if(initial&&exists)throw new ProvisioningError('STATE_EXISTS','Instalação já existe. Use status; não sobrescreva o registro');
  if(!initial&&!exists)throw new ProvisioningError('STATE_MISSING','Registro não encontrado');
  temp=await open(tmp,'wx',0o600);
  await temp.writeFile(JSON.stringify(state,null,2)+'\n','utf8');
  await temp.sync();await temp.close();temp=null;
  await rename(tmp,path);
 }catch(e){
  if(e.code==='EEXIST')throw new ProvisioningError('BUSY','Outro processo está modificando este registro');
  throw e;
 }finally{
  if(temp)await temp.close().catch(()=>{});
  await unlink(tmp).catch(()=>{});
  if(lock){await lock.close();await unlink(lockPath).catch(()=>{});}
 }
 return state;
}
