import {ControlError} from './crypto.js';
import {proposedCellDomain} from '../provisioner/cell-domain.js';
export const CLOUD_PHASES=Object.freeze(['github','supabase','migrate','vercel','env','bootstrap','deploy','smoke']);
const slug=/^[a-z\d][a-z\d-]{2,62}$/i;
const id=/^[a-z\d_-]{4,64}$/i;
export function validateCloudPlan(data,authenticatedLogin){
 if(!data||typeof data!=='object'||Array.isArray(data))throw new ControlError('BAD_PLAN','Plano inválido');
 const allowed=['owner','repository','cellName','supabaseOrgId','vercelTeamId','region','adminLogin'];
 if(Object.keys(data).some(k=>!allowed.includes(k)))throw new ControlError('BAD_PLAN','O plano não pode conter credenciais, tokens ou campos desconhecidos');
 if(typeof authenticatedLogin!=='string'||data.owner?.toLowerCase()!==authenticatedLogin.toLowerCase()||
  data.owner?.toLowerCase()==='pullmawollf'||!slug.test(data.owner))throw new ControlError('WRONG_OWNER','Só é permitido instalar na própria conta GitHub autorizada');
 if(!slug.test(data.repository)||typeof data.cellName!=='string'||data.cellName.trim().length<3||
  data.cellName.trim().length>70||!id.test(data.supabaseOrgId)||!id.test(data.vercelTeamId))
  throw new ControlError('BAD_PLAN','Destino GitHub/Supabase/Vercel inválido');
 if(!['sa-east-1','us-east-1','us-west-1','eu-west-1','eu-central-1'].includes(data.region))
  throw new ControlError('BAD_REGION','Região não permitida no plano de instalação');
 proposedCellDomain(data.cellName);
 if(typeof data.adminLogin!=='string'||!/^[a-z0-9._-]{3,40}$/.test(data.adminLogin))throw new ControlError('BAD_ADMIN','Login administrativo inválido');
 return Object.freeze({owner:authenticatedLogin,repository:data.repository.toLowerCase(),cell_name:data.cellName.trim(),supabase_org_id:data.supabaseOrgId,
  vercel_team_id:data.vercelTeamId,region:data.region,admin_login:data.adminLogin});
}
export function phaseFor(index){
 if(!Number.isInteger(index)||index<0||index>8)throw new ControlError('BAD_STATE');
 return CLOUD_PHASES[index]||null;
}
export function safeInstallation(row){
 if(!row)return null;
 const index=Number(row.phase_index);
 return {id:row.id,owner:row.owner,repository:row.repository,cellName:row.cell_name,
  supabaseOrgId:row.supabase_org_id,vercelTeamId:row.vercel_team_id,region:row.region,
  adminLogin:row.admin_login,phaseIndex:index,phase:phaseFor(index),completed:index,
  total:CLOUD_PHASES.length,homologated:false,supabaseRef:row.supabase_ref||null,
  vercelProjectId:row.vercel_project_id||null,pwaOrigin:row.pwa_origin||null,
  proposedDomain:proposedCellDomain(row.cell_name)};
}
