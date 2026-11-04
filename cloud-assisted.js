/** One authorization, one write per phase. This browser runner deliberately
 * never repeats a remote write after an uncertain result. The server controls
 * atomic claims, ownership, and all actual provisioning permissions.
 */
const names=['GitHub','Supabase','Migrações','Vercel','Variáveis','Primeiro ADM','Deploy','Verificação'];
const delay=ms=>new Promise(resolve=>setTimeout(resolve,ms));
export async function runAssistedInstallation({
 request,installationId,consent,onProgress=()=>{},sleep=delay,maxPolls=40
}){
 if(typeof request!=='function'||typeof installationId!=='string'||
  !consent||consent.execute!==true||consent.acceptBilling!==true)
  throw Error('Autorização explícita obrigatória');
 let polls=0;
 for(let cycle=0;cycle<100;cycle++){
  const {installation:i,operations=[]}=await request('/api/installations/'+installationId);
  if(!i||i.id!==installationId)throw Error('Instalação inesperada');
  if(!i.phase)return {status:'steps-complete',installation:i};
  if(consent.owner!==i.owner||consent.supabaseOrgId!==i.supabaseOrgId||
   consent.vercelTeamId!==i.vercelTeamId)throw Error('Destino da instalação foi alterado');
  onProgress('Instalando '+i.cellName+': '+names[i.phaseIndex]+' ('+(i.phaseIndex+1)+'/8)');
  const previous=operations.find(operation=>operation.phase===i.phase);
  if(previous){
   if(previous.status==='confirmed'){
    if(++polls>maxPolls)throw Error('Progresso não atualizado');
    await sleep(4000);continue;
   }
   if(['deploy','smoke'].includes(i.phase)&&['started','needs_review'].includes(previous.status)){
    const result=await request('/api/installations/'+installationId+'/reconcile',
     {method:'POST',body:'{}'});
    if(result.status==='recovered'||result.status==='refresh_required'){polls=0;continue;}
    if(result.status==='waiting'){
     if(++polls>maxPolls)throw Error('Aguardando deploy ou domínio por tempo excessivo');
     await sleep(10000);continue;
    }
   }
   throw Error('A etapa '+i.phase+' precisa de revisão segura: '+
    (previous.errorCode||previous.status));
  }
  const result=await request('/api/installations/'+installationId+'/execute',{
   method:'POST',body:JSON.stringify({...consent,expectedPhase:i.phase})});
  if(result.status==='recorded'){polls=0;continue;}
  if(result.status==='waiting'){
   if(result.reason==='DEPLOY_NOT_TRIGGERED')
    throw Error('Gatilho automático de deploy está desabilitado no servidor');
   if(++polls>maxPolls)throw Error('Deploy ainda não confirmado');
   await sleep(10000);continue;
  }
  throw Error('Execução pausada em '+i.phase+': '+(result.reason||result.status));
 }
 throw Error('Limite de processamento alcançado sem confirmação final');
}
