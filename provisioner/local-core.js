import {lstat} from 'node:fs/promises';
import {resolve,dirname} from 'node:path';
import {ProvisioningError,TEMPLATE_OWNER} from './plan.js';
import {inspectCore} from './migrations.js';
const ownerRule=/^[a-z\d][a-z\d-]{0,38}$/i,repoRule=/^[a-z\d._-]{1,100}$/i;
export async function validateCloneDestination({owner,repository,coreDir}){
 if(!ownerRule.test(owner||'')||!repoRule.test(repository||'')||owner.toLowerCase()===TEMPLATE_OWNER.toLowerCase())
  throw new ProvisioningError('BAD_REPO','GitHub de origem não autorizado');
 if(typeof coreDir!=='string'||coreDir.length<3)throw new ProvisioningError('BAD_DIR','Pasta Core inválida');
 const dir=resolve(coreDir);
 if(dir===resolve('.')||dir===dirname(dir))throw new ProvisioningError('BAD_DIR','Escolha um diretório dedicado');
 const parent=await lstat(dirname(dir)).catch(()=>null);
 if(!parent?.isDirectory()||parent.isSymbolicLink())throw new ProvisioningError('BAD_DIR','Pasta-pai precisa existir e não ser link simbólico');
 const existing=await lstat(dir).catch(()=>null);
 if(existing)throw new ProvisioningError('DEST_EXISTS','Destino já existe; verifique a pasta antes de clonar novamente');
 return dir;
}
export async function cloneCore({owner,repository,coreDir,token,runner}){
 if(!token||typeof token!=='string')throw new ProvisioningError('NO_AUTH','GITHUB_TOKEN local necessário para clonar');
 if(typeof runner!=='function')throw new ProvisioningError('NO_RUNNER','Runner local ausente');
 const dir=await validateCloneDestination({owner,repository,coreDir});
 const result=await runner('gh',['repo','clone',owner+'/'+repository,dir],{cwd:dirname(dir),env:{GH_TOKEN:token}});
 if(result.code!==0)throw new ProvisioningError('CLONE_FAILED','Falha no clone. Confira a pasta e o GitHub antes de repetir');
 const check=await inspectCore({plan:{coreDir:dir,repoOwner:owner},runner});
 if(check.repository.toLowerCase()!==(owner+'/'+repository).toLowerCase())throw new ProvisioningError('WRONG_REPO','Cópia local diferente do repositório autorizado');
 return {repository:check.repository,cloned:true,coreDir:dir};
}
