import {ProvisioningError} from './plan.js';
import {inspectCore} from './migrations.js';
const login=/^[a-z0-9._-]{3,40}$/;
export function bootstrapPlan({coreDir,repoOwner,adminLogin,adminName}){
 const name=String(adminName||'Administrador').trim();
 const user=String(adminLogin||'').trim();
 if(!coreDir||typeof coreDir!=='string')throw new ProvisioningError('BAD_DIR','Informe a pasta local da cópia do Core');
 if(!/^[a-z\d][a-z\d-]{0,38}$/i.test(repoOwner||'')||repoOwner.toLowerCase()==='pullmawollf')throw new ProvisioningError('MAINTAINER_ACCOUNT','Use o GitHub da célula');
 if(!login.test(user))throw new ProvisioningError('BAD_ADMIN','Login administrativo inválido');
 if(name.length<2||name.length>120)throw new ProvisioningError('BAD_ADMIN','Nome administrativo inválido');
 return Object.freeze({coreDir,repoOwner,adminLogin:user,adminName:name,requires:['SUPABASE_URL','SUPABASE_SERVICE_ROLE_KEY','ADMIN_PASSWORD'],createsAdmin:true,mode:'dry-run'});
}
export async function bootstrapAdmin({plan,runner,environment={},approved=false}){
 if(!approved)throw new ProvisioningError('CONSENT','Confirme a criação do primeiro ADM');
 if(!/^https:\/\/[a-z0-9-]+\.supabase\.co$/i.test(String(environment.SUPABASE_URL||'')))throw new ProvisioningError('BAD_SUPABASE_URL','URL Supabase inválida');
 if(!environment.SUPABASE_SERVICE_ROLE_KEY||environment.SUPABASE_SERVICE_ROLE_KEY.length<20)throw new ProvisioningError('NO_AUTH','Chave privada Supabase ausente');
 if(!environment.ADMIN_PASSWORD||environment.ADMIN_PASSWORD.length<12)throw new ProvisioningError('BAD_PASSWORD','Senha ADM precisa de pelo menos 12 caracteres');
 const repo=await inspectCore({plan:{coreDir:plan.coreDir,repoOwner:plan.repoOwner},runner});
 const out=await runner('node',['scripts/create-admin.mjs'],{cwd:plan.coreDir,env:{
   SUPABASE_URL:environment.SUPABASE_URL,SUPABASE_SERVICE_ROLE_KEY:environment.SUPABASE_SERVICE_ROLE_KEY,
   ADMIN_NAME:plan.adminName,ADMIN_LOGIN:plan.adminLogin,ADMIN_PASSWORD:environment.ADMIN_PASSWORD
 }});
 if(out.code!==0)throw new ProvisioningError('ADMIN_FAILED','Não foi possível criar ADM. Verifique no painel antes de repetir; conta anterior não deve ser sobrescrita');
 return {status:'created',repository:repo.repository,adminLogin:plan.adminLogin,passwordIncluded:false};
}
