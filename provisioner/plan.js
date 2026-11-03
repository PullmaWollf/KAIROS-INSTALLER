/** Contrato de provisionamento: sem credenciais, identidade de instalação ou segredos. */
export const TEMPLATE_OWNER='PullmaWollf';
export const TEMPLATE_REPO='KAIROS-CORE';
export class ProvisioningError extends Error { constructor(code,message){super(message);this.code=code;} }
const login=/^[a-z\d](?:[a-z\d-]{0,37}[a-z\d])?$/i;
const repoName=/^[a-z\d._-]{1,100}$/i;
export function validatePlan(input){
 if(!input||typeof input!=='object'||Array.isArray(input))throw new ProvisioningError('BAD_PLAN','Plano inválido');
 const owner=String(input.owner||'').trim();
 const name=String(input.repository||'').trim();
 const cell=String(input.cellName||'').trim();
 const visibility=input.visibility||'private';
 if(!login.test(owner))throw new ProvisioningError('BAD_OWNER','Conta GitHub inválida');
 if(owner.toLowerCase()===TEMPLATE_OWNER.toLowerCase())throw new ProvisioningError('MAINTAINER_ACCOUNT','Use o GitHub da própria célula, não o do mantenedor');
 if(!repoName.test(name)||name==='.'||name==='..')throw new ProvisioningError('BAD_REPO','Nome do repositório inválido');
 if(cell.length<3||cell.length>70)throw new ProvisioningError('BAD_NAME','Nome da célula deve ter entre 3 e 70 caracteres');
 if(!['private','public'].includes(visibility))throw new ProvisioningError('BAD_VISIBILITY','Visibilidade inválida');
 const known=new Set(['owner','repository','cellName','visibility']);
 for(const k of Object.keys(input))if(!known.has(k))throw new ProvisioningError('UNKNOWN_FIELD','Não coloque credenciais ou campos extras no plano: '+k);
 return Object.freeze({owner,repository:name,cellName:cell,visibility});
}
export function buildPlan(input){
 const p=validatePlan(input);
 return Object.freeze({
  version:1,
  mode:'simulation',
  target:{githubOwner:p.owner,repository:p.repository,visibility:p.visibility},
  source:{githubTemplate:TEMPLATE_OWNER+'/'+TEMPLATE_REPO},
  actions:[
   {id:'github-preflight',description:'Confirmar conta pessoal, acesso ao GitHub e disponibilidade do template',requires:'GITHUB_TOKEN local'},
   {id:'github-copy',description:'Criar cópia do Core na conta GitHub da célula',requires:'aprovação explícita'},
   {id:'supabase-create',description:'Criar projeto Supabase na organização da célula',status:'not-implemented',requires:'OAuth próprio e confirmação de cobrança'},
   {id:'database-migrate',description:'Executar migrações no projeto da célula',status:'not-implemented',requires:'projeto novo e credenciais temporárias autorizadas'},
   {id:'vercel-create',description:'Criar projeto Vercel na conta da célula',status:'not-implemented',requires:'OAuth próprio e consentimento'},
   {id:'smoke-tests',description:'Validar login, PWA, banco, permissões e link final',status:'not-implemented'}
  ]
 });
}
