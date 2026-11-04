export class InstallationError extends Error {
  constructor(code, message=code) { super(message); this.code=code; }
}
const gh=/^[a-z0-9](?:[a-z0-9-]{0,37}[a-z0-9])?$/i;
const repo=/^kairos-hml-[a-z0-9][a-z0-9-]{2,44}$/;
const org=/^[a-z0-9_-]{4,64}$/i;
const scope=/^(?:team_[a-z0-9_-]{6,54}|personal_[a-z0-9_-]{6,54})$/i;
const regions=new Set(['sa-east-1','us-east-1','us-west-1','eu-west-1','eu-central-1']);
const banned=new Set(['pullmawollf']);
export function planFrom(input) {
  if (!input || typeof input!=='object' || Array.isArray(input)) throw new InstallationError('INVALID_PLAN');
  const {githubLogin,repository,cellName,supabaseOrgId,vercelScope,region,adminLogin} = input;
  if (!gh.test(githubLogin||'') || banned.has(githubLogin?.toLowerCase())) throw new InstallationError('WRONG_GITHUB_OWNER');
  if (!repo.test(repository||'')) throw new InstallationError('INVALID_REPOSITORY');
  if (!org.test(supabaseOrgId||'') || !scope.test(vercelScope||'')) throw new InstallationError('INVALID_DESTINATIONS');
  if (!regions.has(region)) throw new InstallationError('INVALID_REGION');
  if (typeof cellName!=='string' || cellName.trim().length<3 || cellName.length>70 || !/^HML(?:\s|-)/i.test(cellName)) throw new InstallationError('TEST_ONLY');
  if (!/^[a-z0-9._-]{3,40}$/.test(adminLogin||'')) throw new InstallationError('INVALID_ADMIN');
  if (input.approveFreeOnly!==true || input.personalNonCommercial!==true) throw new InstallationError('CONSENT_REQUIRED');
  return Object.freeze({githubLogin,repository,cellName:cellName.trim(),supabaseOrgId,vercelScope,region,adminLogin});
}
export function validateCredentials(input) {
  const keys=['githubToken','supabaseToken','vercelToken','adminPassword'];
  const out={};
  for (const key of keys) {
    if (typeof input?.[key]!=='string' || input[key].length<20 || input[key].length>1024) throw new InstallationError('CREDENTIAL_REQUIRED');
    out[key]=input[key];
  }
  return out;
}
export function projectSlug(name){
  const slug=name.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase()
    .replace(/[^a-z0-9]+/g,'-').replace(/^-+|-+$/g,'').slice(0,55).replace(/-+$/g,'');
  if (slug.length<3 || slug.startsWith('agape')) throw new InstallationError('BAD_CELL_NAME');
  return slug;
}
export function vercelQuery(vercelScope){
  if(!scope.test(vercelScope||''))throw new InstallationError('BAD_VERCEL_SCOPE');
  return vercelScope.startsWith('team_')?'?teamId='+encodeURIComponent(vercelScope):'';
}