import {randomBytes,createHash} from 'node:crypto';
import {readFile,open,rename,unlink,mkdir,stat} from 'node:fs/promises';
import {resolve,dirname,basename,join} from 'node:path';
import {ProvisioningError} from './plan.js';
const kinds=['github','supabase','migrate','vercel','env','bootstrap','deploy','smoke'];
const fingerprint=x=>createHash('sha256').update(JSON.stringify(x)).digest('hex');
export function newRecovery(config){
 // Include only non-secret immutable destinations, never caller credential values.
 const scope={owner:config.owner,repository:config.repository,supabaseOrgId:config.supabaseOrgId,vercelTeamId:config.vercelTeamId};
 if(Object.values(scope).some(x=>typeof x!=='string'||!x))throw new ProvisioningError('BAD_TARGET','Destinos obrigatórios ausentes');
 return {version:1,scope,fingerprint:fingerprint(scope),operations:{}};
}
const receiptKeys={github:['repository'],supabase:['projectRef'],migrate:[],vercel:['projectId'],env:[],bootstrap:[],deploy:['url'],smoke:[]};
function safeReceipt(phase,receipt){
 if(receipt===undefined)return undefined;
 if(!receipt||typeof receipt!=='object'||Array.isArray(receipt))throw new ProvisioningError('BAD_RECOVERY','Comprovante inválido');
 const keys=Object.keys(receipt),allowed=receiptKeys[phase]||[];
 if(keys.length!==allowed.length||keys.some(k=>!allowed.includes(k)))throw new ProvisioningError('BAD_RECOVERY','Comprovante contém campo não permitido');
 for(const [k,v] of Object.entries(receipt)){
  if(typeof v!=='string'||v.length>250||!v)throw new ProvisioningError('BAD_RECOVERY','Comprovante contém valor inválido');
  if(k==='repository'&&!/^[a-z0-9-]{1,39}\/[a-z0-9._-]{1,100}$/i.test(v))throw new ProvisioningError('BAD_RECOVERY','Repositório inválido');
  if(k==='projectRef'&&!/^[a-z0-9]{10,30}$/i.test(v))throw new ProvisioningError('BAD_RECOVERY','Project ref inválido');
  if(k==='projectId'&&!/^prj_[a-z0-9_-]{4,100}$/i.test(v))throw new ProvisioningError('BAD_RECOVERY','Project ID inválido');
  if(k==='url'&&!/^https:\/\/[a-z0-9-]+\.vercel\.app$/i.test(v))throw new ProvisioningError('BAD_RECOVERY','Domínio do deploy inválido');
 }
 return receipt;
}
export function validateRecovery(data){
 if(!data||data.version!==1||!data.scope||data.fingerprint!==fingerprint(data.scope)||typeof data.operations!=='object'||Array.isArray(data.operations))
  throw new ProvisioningError('BAD_RECOVERY','Registro de recuperação inválido');
 if(Object.keys(data).some(k=>!['version','scope','fingerprint','operations'].includes(k)))throw new ProvisioningError('BAD_RECOVERY','Registro contém campos inesperados');
 for(const [name,e] of Object.entries(data.operations)){
  if(!kinds.includes(name)||!e||!['started','confirmed','needs-review'].includes(e.status)||!Number.isInteger(e.at)||
  Object.keys(e).some(k=>!['status','at','outcome','receipt'].includes(k))||e.outcome!==undefined&&!['manual','provider-confirmed','smoke-checked'].includes(e.outcome))
   throw new ProvisioningError('BAD_RECOVERY','Etapa de recuperação inválida');
  if(e.receipt!==undefined){if(e.status!=='confirmed')throw new ProvisioningError('BAD_RECOVERY','Comprovante exige confirmação');
   safeReceipt(name,e.receipt);}
 }
 return data;
}
export function beginOperation(data,name,now=Date.now()){
 const r=structuredClone(validateRecovery(data));
 if(!kinds.includes(name))throw new ProvisioningError('BAD_PHASE','Etapa desconhecida');
 if(r.operations[name])throw new ProvisioningError('REVIEW_REQUIRED','Já houve tentativa. Reconcilie antes de executar novamente');
 r.operations[name]={status:'started',at:now};
 return r;
}
export function settleOperation(data,name,{confirmed=false,outcome='provider-confirmed',receipt,now=Date.now()}={}){
 const r=structuredClone(validateRecovery(data));
 if(!['started','needs-review'].includes(r.operations[name]?.status))throw new ProvisioningError('BAD_ORDER','Nenhuma tentativa pendente para reconciliar');
 r.operations[name]={status:confirmed?'confirmed':'needs-review',at:now,...(confirmed?{outcome,...(receipt!==undefined?{receipt:safeReceipt(name,receipt)}:{})}:{})};
 return validateRecovery(r);
}
export function recoveryStatus(data,name){
 const r=validateRecovery(data);
 const op=r.operations[name];
 return !op?'never-attempted':op.status;
}
function validPath(filename){if(typeof filename!=='string'||!filename.endsWith('.json'))throw new ProvisioningError('BAD_FILE','Informe registro JSON');return resolve(filename);}
export async function readRecovery(filename){
 const path=validPath(filename);const st=await stat(path);
 if(!st.isFile()||st.size>24000)throw new ProvisioningError('BAD_RECOVERY','Registro muito grande');
 try{return validateRecovery(JSON.parse(await readFile(path,'utf8')));}
 catch(e){if(e instanceof ProvisioningError)throw e;throw new ProvisioningError('BAD_RECOVERY','Registro inválido');}
}
export async function writeRecovery(filename,data,{initial=false,expected}={}){
 const path=validPath(filename),r=validateRecovery(data),parent=dirname(path);
 await mkdir(parent,{recursive:true});
 const lockpath=path+'.lock',tmp=join(parent,'.'+basename(path)+'.'+randomBytes(8).toString('hex')+'.tmp');
 let lock,temp;
 try{
  lock=await open(lockpath,'wx',0o600);
  const exists=await stat(path).then(()=>true,()=>false);
  if(initial&&exists)throw new ProvisioningError('STATE_EXISTS','Registro de operações já existe');
  if(!initial&&!exists)throw new ProvisioningError('STATE_MISSING','Registro de operações não encontrado');
  if(!initial){
   if(!expected)throw new ProvisioningError('STALE_STATE','Atualização precisa apresentar estado anterior');
   const current=await readRecovery(path);
   if(fingerprint(current)!==fingerprint(validateRecovery(expected)))throw new ProvisioningError('STALE_STATE','Outro processo alterou o registro');
  }
  temp=await open(tmp,'wx',0o600);await temp.writeFile(JSON.stringify(r,null,2)+'\n');await temp.sync();await temp.close();temp=null;
  await rename(tmp,path);
 }catch(e){if(e?.code==='EEXIST')throw new ProvisioningError('BUSY','Registro ocupado');throw e;}
 finally{if(temp)await temp.close().catch(()=>{});await unlink(tmp).catch(()=>{});if(lock){await lock.close();await unlink(lockpath).catch(()=>{});}}
 return r;
}
