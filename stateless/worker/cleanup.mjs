// Runs even when the provisioner stops for manual review.
// Uses the customer's own short-lived token. Never logs token values.
const repo=process.env.GITHUB_REPOSITORY||'';
const token=process.env.KAIROS_GITHUB_AUTOMATION_TOKEN||'';
const secretNames=['KAIROS_SUPABASE_TOKEN','KAIROS_VERCEL_TOKEN','KAIROS_ADMIN_PASSWORD',
 'KAIROS_DB_PASSWORD','KAIROS_GITHUB_AUTOMATION_TOKEN'];
if(!/^[a-z0-9-]{1,39}\/kairos-hml-[a-z0-9-]{3,50}$/i.test(repo)||token.length<20){
 console.error('KAIRÓS: impossivel limpar credenciais - confira o repositório e revogue os tokens nos provedores.');
 process.exitCode=1;
}else{
 let failed=false;
 // Delete cleanup credential last so the same token can authorize all removals.
 for(const key of secretNames){
  try{
   const r=await fetch('https://api.github.com/repos/'+repo+'/actions/secrets/'+key,{
    method:'DELETE',redirect:'error',signal:AbortSignal.timeout(15000),
    headers:{Authorization:'Bearer '+token,Accept:'application/vnd.github+json'}});
   if(r.status!==204 && r.status!==404)failed=true;
  }catch{failed=true;}
 }
 if(failed){console.error('KAIRÓS: limpeza parcial; revogue os tokens diretamente nos provedores.');process.exitCode=1;}
 else console.log('KAIRÓS: segredos temporários excluídos do repositório.');
}