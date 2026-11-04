import {randomBytes} from 'node:crypto';
import {readFile} from 'node:fs/promises';
import {audit,call} from './providers.mjs';
import {InstallationError,planFrom,validateCredentials,projectSlug} from './validation.mjs';

async function sodiumEncrypt(plain,publicKey){
  const {default:sodium}=await import('libsodium-wrappers');
  await sodium.ready;
  return sodium.to_base64(sodium.crypto_box_seal(sodium.from_string(plain),
    sodium.from_base64(publicKey,sodium.base64_variants.ORIGINAL)),
   sodium.base64_variants.ORIGINAL);
}
function b64(input){return Buffer.from(input).toString('base64');}
const ghPath=(owner,repo)=>'/repos/'+encodeURIComponent(owner)+'/'+encodeURIComponent(repo);

/** The only stored state belongs to the customer's private GitHub repo.
 * No Installer database, cookies, localStorage, or server-side sessions.
 */
export async function launch({fetcher=fetch,request,encryptSecret=sodiumEncrypt,
  workerCode,workflowCode}={}){
 const plan=planFrom(request);
 const credentials=validateCredentials(request);
 const previous=await audit({fetcher,plan,credentials});
 if(!previous.ok)throw new InstallationError('PREFLIGHT_FAILED');
 const repoPath=ghPath(plan.githubLogin,plan.repository);
 // Refuse to overwrite an existing repo: creating a test must never touch an
 // application, deployment or organization already present.
 const probe=await fetcher('https://api.github.com'+repoPath,{
  method:'GET',redirect:'error',signal:AbortSignal.timeout(10000),
  headers:{Authorization:'Bearer '+credentials.githubToken,Accept:'application/vnd.github+json'}});
 if(probe?.status!==404)throw new InstallationError('REPOSITORY_ALREADY_EXISTS_OR_UNKNOWN');
 let created=false;
 try{
  let repo;
  try{
    repo=await call(fetcher,'github',credentials.githubToken,
      '/repos/PullmaWollf/KAIROS-CORE/generate',{
        method:'POST',accepted:[201],body:{owner:plan.githubLogin,name:plan.repository,
          private:true,include_all_branches:false,description:'KAIRÓS célula de homologação independente'}
      });
  }catch{
    // The provider may have accepted the POST despite a lost response.
    // Never claim the repo was not created and never retry automatically.
    const uncertain=new InstallationError('PARTIAL_INSTALL_NEEDS_REVIEW',
      'Confira o repositório da célula no GitHub antes de tentar novamente.');
    uncertain.repositoryUrl='https://github.com/'+plan.githubLogin+'/'+plan.repository;
    throw uncertain;
  }
  created=true;
  if(repo.full_name?.toLowerCase()!==(plan.githubLogin+'/'+plan.repository).toLowerCase() ||
     repo.private!==true)throw new InstallationError('REPOSITORY_OWNERSHIP_UNCERTAIN');
  // Never ship installer credentials into repository files: only GitHub Actions
  // encrypted secrets, using its own rotating sealed-box key.
  const publicKey=await call(fetcher,'github',credentials.githubToken,repoPath+'/actions/secrets/public-key');
  if(typeof publicKey.key!=='string'||typeof publicKey.key_id!=='string')throw new InstallationError('SECRET_KEY_INVALID');
  const secretData={
   KAIROS_GITHUB_AUTOMATION_TOKEN:credentials.githubToken,
   KAIROS_SUPABASE_TOKEN:credentials.supabaseToken,
   KAIROS_VERCEL_TOKEN:credentials.vercelToken,
   KAIROS_ADMIN_PASSWORD:credentials.adminPassword,
   KAIROS_DB_PASSWORD:randomBytes(36).toString('base64url')
  };
  for(const [name,value] of Object.entries(secretData)){
   const encrypted=await encryptSecret(value,publicKey.key);
   if(typeof encrypted!=='string'||encrypted.length<20)throw new InstallationError('SECRET_ENCRYPTION_FAILED');
   await call(fetcher,'github',credentials.githubToken,repoPath+'/actions/secrets/'+name,{
    method:'PUT',body:{encrypted_value:encrypted,key_id:publicKey.key_id},accepted:[201,204]});
  }
  const workflow=workflowCode??await readFile(new URL('../worker/workflow.yml',import.meta.url),'utf8');
  const worker=workerCode??await readFile(new URL('../worker/kairos-bootstrap.mjs',import.meta.url),'utf8');
  const cleanup=await readFile(new URL('../worker/cleanup.mjs',import.meta.url),'utf8');
  if(!workflow.includes('workflow_dispatch:')||!worker.includes('KAIRÓS')||
    !worker.includes('KAIROS_INSTALL_STATE'))throw new InstallationError('UNEXPECTED_WORKER_ASSET');
  // Bundle script BEFORE publishing the dispatchable workflow.
  for(const [path,text] of [
    ['.github/kairos/kairos-bootstrap.mjs',worker],
    ['.github/kairos/cleanup.mjs',cleanup],
    ['.github/workflows/kairos-install.yml',workflow]
  ]){
   await call(fetcher,'github',credentials.githubToken,repoPath+'/contents/'+path,{
    method:'PUT',accepted:[201],body:{message:'chore: preparar instalação isolada da célula',
      content:b64(text),branch:'main'}});
  }
  // GitHub may take a moment to register a newly committed workflow.
  // Never re-create the repo on dispatch failure.
  const inputs={supabase_org_id:plan.supabaseOrgId,vercel_scope:plan.vercelScope,
   cell_name:plan.cellName,region:plan.region,admin_login:plan.adminLogin,
   project_slug:projectSlug(plan.cellName)};
  // The workflow must be visible on the default branch before dispatch.
  // Poll GET only; do not repeat a possibly successful workflow dispatch POST.
  let discovered=false;
  for(let n=0;n<6;n++){
   try{
    const found=await call(fetcher,'github',credentials.githubToken,
     repoPath+'/actions/workflows/kairos-install.yml');
    if(found?.path==='.github/workflows/kairos-install.yml' || found?.name?.includes('KAIRÓS')){
     discovered=true;break;
    }
   }catch {/* GitHub may not have indexed the new workflow yet. */}
   if(n<5)await new Promise(resolve=>setTimeout(resolve,1200));
  }
  if(!discovered)throw new InstallationError('WORKFLOW_REGISTRATION_UNCONFIRMED');
  await call(fetcher,'github',credentials.githubToken,
    repoPath+'/actions/workflows/kairos-install.yml/dispatches',{
    method:'POST',body:{ref:'main',inputs},accepted:[204]});
  return {ok:true,status:'queued',createdResources:{githubRepo:true,supabase:false,vercel:false},
    githubRepository:'https://github.com/'+plan.githubLogin+'/'+plan.repository,
    actionsUrl:'https://github.com/'+plan.githubLogin+'/'+plan.repository+'/actions/workflows/kairos-install.yml',
    next:'Acompanhe o GitHub Actions na própria conta do cliente. O navegador pode ser fechado.'};
 }catch(error){
  if(created){
   const result=new InstallationError('PARTIAL_INSTALL_NEEDS_REVIEW',
    'Repositório privado criado; revise no GitHub antes de iniciar outro teste.');
   result.repositoryUrl='https://github.com/'+plan.githubLogin+'/'+plan.repository;
   throw result;
  }
  throw error;
 }
}