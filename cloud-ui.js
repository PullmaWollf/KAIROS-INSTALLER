// Background automation is handled by the server; this page only submits consent.
import {VERCEL_TOKEN_URL,VERCEL_TOKEN_NAME,VERCEL_TOKEN_STEPS,VERCEL_TOKEN_SAFETY} from './vercel-token-guide.js';
import {suggestRepositoryName} from './cell-repository-name.js';
const phases=['GitHub','Supabase','Migrações','Vercel','Variáveis','Primeiro ADM','Deploy','Verificação'];
const $=id=>document.getElementById(id);
let session=null,selected=null,autoInstalling=false;
function el(tag,text,cls){const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n;}
function button(text,handler,cls='secondary'){const b=el('button',text,cls);b.type='button';b.addEventListener('click',handler);return b;}
function notify(message){$('alert').textContent=message||'';}
async function api(path,options={}){
 const headers={Accept:'application/json',...(options.body?{'Content-Type':'application/json','X-Kairos-Csrf':session?.csrf||''}:{})};
 const r=await fetch(path,{credentials:'same-origin',headers,...options,cache:'no-store'});
 let data;try{data=await r.json();}catch{throw Error('O servidor não retornou JSON válido. Confirme a hospedagem do Installer.');}
 if(!r.ok)throw Error('Falha '+r.status+': '+(data.error||'indisponível'));
 return data;
}
async function initialize(){
 try{
  session=await api('/api/session');
  $('auth-status').textContent=session.signedIn?'Conectado: '+session.user.login:'Entre com GitHub para começar';
  $('logout').hidden=!session.signedIn;

  $('owner').value=session.user?.login||'';
  $('vercel-team-id').value=session.vercelTeam?.teamId||'';
  $('vercel-team-display').value=session.vercelTeam?
   'Hospedagem: '+(session.vercelTeam.teamSlug||session.vercelTeam.teamId):'';
  $('create-form').querySelector('button[type=submit]').disabled=
   !session.signedIn||!['github','supabase','vercel'].every(p=>session.providers?.includes(p));
  const list=$('providers');list.replaceChildren();
  for(const provider of ['github','supabase','vercel']){
   const card=el('div',undefined,'provider'+(provider==='vercel'?' provider-vercel':'')),connected=session.providers?.includes(provider);
   card.append(el('strong',provider==='github'?'GitHub':provider==='supabase'?'Supabase':'Vercel'),
    el('span',connected?'Conta conectada':'Conexão pendente','state-label'));
   if(provider==='vercel'){
    if(session.vercelTeam)card.append(el('small','Hospedagem conectada: '+(session.vercelTeam.teamSlug||session.vercelTeam.teamId),'state-label'));
    const guide=el('section',undefined,'vercel-guide');
    guide.setAttribute('aria-label','Como criar sua chave de acesso Vercel');
    guide.append(
     el('h3','Como conectar a sua Vercel'),
     el('p','Abra a Vercel e preencha estes 3 campos para criar sua chave. Não precisa entender contas pessoais nem equipes.','state-label'));
    const tokenLink=el('a','1. Abrir a Vercel e criar a chave','link-button primary');
    tokenLink.href=VERCEL_TOKEN_URL;
    tokenLink.target='_blank';tokenLink.rel='noopener noreferrer';
    guide.append(tokenLink);
    const steps=el('ol',undefined,'vercel-token-steps');
    for(const step of VERCEL_TOKEN_STEPS){
     const item=el('li',undefined,'vercel-token-step');
     const title=el('span',step.field,'vercel-step-label');
     const value=el('strong',step.value,'vercel-step-value');
     const note=el('p',step.explanation,'state-label');
     item.append(title,value,note);
     if(step.field==='TOKEN NAME'){
      const copy=button('Copiar nome',async()=>{
       try{await navigator.clipboard.writeText(VERCEL_TOKEN_NAME);
        copy.textContent='Copiado!';
       }catch{copy.textContent='Selecione o nome acima para copiar';}
      },'secondary');
      copy.classList.add('vercel-copy-name');
      item.append(copy);
     }
     steps.append(item);
    }
    guide.append(steps,el('p','Depois clique em Create, copie a chave gerada e cole no campo abaixo.','vercel-next'),
     el('p',VERCEL_TOKEN_SAFETY,'vercel-safety'));
    card.append(guide);
    const form=document.createElement('form');form.className='vercel-connect-form';
    form.autocomplete='off';
    const tokenLabel=el('label','Chave de acesso da Vercel');
    const secret=document.createElement('input');secret.type='password';
    secret.name='accessToken';secret.required=true;secret.minLength=20;secret.maxLength=512;
    secret.autocomplete='new-password';secret.placeholder='Cole o token aqui';
    tokenLabel.append(secret);
    const submit=el('button','Conectar minha Vercel','primary');
    submit.type='submit';
    const status=el('p','','state-label');
    status.setAttribute('role','status');
    form.append(tokenLabel,submit,status);
    let options=null,choice=null;
    secret.addEventListener('input',()=>{
     options=null;if(choice){choice.remove();choice=null;}
     submit.textContent='Conectar minha Vercel';status.textContent='';
    });
    form.addEventListener('submit',async event=>{
     event.preventDefault();submit.disabled=true;
     const accessToken=secret.value.trim();
     try{
      if(!options){
       status.textContent='Identificando suas equipes na Vercel…';
       const found=await api('/api/connections/vercel/teams',{method:'POST',
        body:JSON.stringify({accessToken})});
       options=found.teams;
       if(!Array.isArray(options)||!options.length){
        options=null;status.textContent='Não foi possível identificar sua hospedagem. Confira se criou a chave na conta correta.';
        secret.value='';return;
       }
       if(found.hasMore){options=null;status.textContent='Encontramos muitos espaços de hospedagem. Fale com o suporte para conectar o correto.';secret.value='';return;}
       if(options.length>1){
        choice=el('select');choice.setAttribute('aria-label','Escolha onde publicar');
        for(const item of options){
         const option=el('option',item.name+(item.slug?' ('+item.slug+')':''));
         option.value=item.teamId;choice.append(option);
        }
        form.insertBefore(choice,submit);
        submit.textContent='Conectar hospedagem selecionada';
        status.textContent='3. Escolha onde deseja publicar e confirme a conexão.';
        return;
       }
      }
      const teamId=choice?choice.value:options[0].teamId;
      if(!options.some(item=>item.teamId===teamId))throw Error('Hospedagem inválida');
      status.textContent='Verificando acesso à sua hospedagem…';
      await api('/api/connections/vercel',{method:'POST',
       body:JSON.stringify({teamId,accessToken})});
      secret.value='';notify('Sua Vercel foi conectada com segurança.');
      await initialize();
     }catch(error){
      secret.value='';options=null;
      if(choice){choice.remove();choice=null;}
      submit.textContent='Conectar minha Vercel';
      status.textContent='Não foi possível conectar. Confira o token e o acesso à equipe.';
      notify(error.message);
     }finally{submit.disabled=false;}
    });
    if(connected){
     form.hidden=true;
     guide.hidden=true;
     card.append(button('Atualizar conexão',()=>{guide.hidden=false;form.hidden=false;secret.focus();},'secondary'));
    }
    card.append(form);
   }else{
    const link=el('a',connected?'Reconectar':'Conectar','link-button '+(connected?'secondary':'primary'));
    link.href='/api/auth/start?provider='+provider;card.append(link);
   }
   if(connected)card.append(button('Desconectar',async()=>{
    if(!window.confirm('Desconectar '+provider+' neste instalador? Revogue também o acesso na conta do provedor se desejar.'))return;
    try{await api('/api/connections/disconnect',{method:'POST',body:JSON.stringify({provider})});await initialize();}
    catch(error){notify(error.message);}
   }));
   list.append(card);
  }
  if(session.signedIn)await loadInstallations();else{$('install-list').textContent='Conecte sua conta GitHub para ver instalações.';$('detail').replaceChildren();}
 }catch(error){
  notify(error.message);$('auth-status').textContent='Backend ainda não disponível';
 }
}

function renderPreinstallationAudit(report){
 const area=$('preinstall-results');area.replaceChildren();
 const names={github:'GitHub — repositório do modelo',supabase:'Supabase — banco de dados',vercel:'Vercel — hospedagem'};
 const messages={
  NOT_CONNECTED:'Não conectado ou sessão expirada',
  READ_VERIFICATION_FAILED:'Não foi possível verificar o acesso. Reconecte e tente novamente.',
  WRONG_OWNER:'Conta GitHub diferente da conta autorizada',
  TEMPLATE_NOT_READY:'Modelo KAIRÓS Core não está disponível',
  NO_ELIGIBLE_ORGANIZATION:'Nenhuma organização autorizada encontrada',
  IDENTITY_AND_PUBLIC_TEMPLATE_VERIFIED:'Conta e repositório-modelo confirmados',
  ORGANIZATION_ACCESS_VERIFIED:'Organização Supabase encontrada',
  HOSTING_ACCESS_VERIFIED:'Hospedagem Vercel acessível'
 };
 const grid=el('div',undefined,'preflight-cards');
 for(const item of report.providers||[]){
  const tile=el('div',undefined,'preflight-card '+(item.readAccess?'verified':'unverified'));
  tile.append(el('strong',names[item.provider]||item.provider),
   el('p',messages[item.reason]||'Conexão não comprovada','state-label'));
  tile.append(el('p',item.writePermission==='repo-scope-missing'?
   'Permissão repo ausente. Reconecte o GitHub.':
   'Criação automática ainda não foi testada.','preflight-caution'));
  grid.append(tile);
 }
 area.append(grid);
 const orgs=report.supabaseOrganizations||[];
 const list=$('supabase-org-list');list.replaceChildren();
 for(const o of orgs){const option=el('option');option.value=o.id;option.label=o.name;list.append(option);}
 if(orgs.length===1&&!$('supabase-org').value)$('supabase-org').value=orgs[0].id;
 const f=report.serverFlags||{};
 const missing=Object.entries({'Criação de recursos':f.provisioning,
  'Gerenciamento da Vercel':f.vercelManagement,'Migração do banco':f.supabaseMigrations,
  'Publicação automática':f.deployment}).filter(x=>!x[1]).map(x=>x[0]);
 if(missing.length)area.append(el('p','Ainda bloqueado no servidor: '+missing.join(', ')+
  '. Essas operações só serão habilitadas na homologação autorizada.','preflight-warning'));
 if(report.production){
  const isProduction=report.production.enabled;
  area.append(el('p',isProduction?
   'Modo de produção autorizado no servidor. Cada instalação ainda precisa de confirmação individual de custos e da propriedade das três contas.':
   report.production.selected?
    'Produção selecionada, mas ainda bloqueada por configurações de segurança. Nenhum recurso será criado.':
    'Modo de produção inativo: esta versão ainda não pode criar recursos de clientes.',
   isProduction?'preflight-info':'preflight-warning'));
 }
 const guard=report.homologation;
 if(guard)area.append(el('p',guard.readyForWrites?
  'Proteções de homologação configuradas para uma única instalação e com validade limitada. A criação real ainda requer confirmação de custos.':
  'A instalação automática permanece bloqueada até a ativação segura do ambiente e a autorização individual de custos.',
  guard.readyForWrites?'preflight-info':'preflight-warning'));
 area.append(el('p',report.accessValidated?
  'Acesso de LEITURA confirmado nas três contas. Criar recursos de verdade ainda precisa ser testado.':
  'Pelo menos uma conexão precisa ser corrigida antes de preparar a instalação.',
  report.accessValidated?'preflight-info':'preflight-warning'));
 area.append(el('p','Modelo: KAIRÓS Core. Operações de escrita executadas: 0. Nenhum recurso criado.','muted'));
}
async function runPreinstallationAudit(){
 const btn=$('preinstall-check');btn.disabled=true;btn.textContent='Verificando…';
 try{renderPreinstallationAudit(await api('/api/preinstallation-audit'));}
 catch(error){$('preinstall-results').replaceChildren(el('p',
  'Verificação indisponível: '+error.message,'preflight-warning'));}
 finally{btn.disabled=false;btn.textContent='Verificar novamente';}
}
$('preinstall-check').addEventListener('click',runPreinstallationAudit);
async function loadInstallations(){
 try{
  const {installations}=await api('/api/installations');
  const list=$('install-list');list.replaceChildren();
  if(!installations.length)list.append(el('p','Ainda não há instalações registradas.','muted'));
  for(const install of installations){
   const item=el('div',undefined,'install-item'),body=el('div');
   body.append(el('strong',install.cellName),el('small',install.owner+'/'+install.repository));
   item.append(body,el('span',install.completed+'/8 etapas','pill'),
    button('Acompanhar',()=>showDetail(install.id)));
   list.append(item);
  }
  if(selected&&installations.some(x=>x.id===selected))await showDetail(selected);
 }catch(err){notify(err.message);}
}
async function showDetail(id){
 try{
  const {installation:i,operations}=await api('/api/installations/'+id);
  const automatic=await api('/api/installations/'+id+'/automation').catch(()=>({enabled:false,automation:null}));
  selected=id;const box=$('detail');box.replaceChildren();
  if(automatic.automation){
   const info=automatic.automation;
   const status={queued:'Na fila',running:'Criando recursos',waiting:'Aguardando confirmação',
    paused:'Pausada para revisão',completed:'Concluída'}[info.state]||info.state;
   box.append(el('p','Automação no servidor: '+status+
    (info.lastError?' · '+info.lastError:''),'notice'));
   box.append(button('Atualizar andamento',()=>showDetail(id)));
  }else if(!automatic.enabled){
   box.append(el('p','Execução automática ainda não liberada pelo servidor. Nenhum projeto externo será criado enquanto estiver bloqueada.','warning'));
  }
  box.append(el('h2',i.cellName+' — acompanhamento'));
  if(i.proposedDomain)box.append(el('p','Domínio solicitado: https://'+i.proposedDomain+' (sujeito à disponibilidade)','notice'));
  const progress=el('ol',undefined,'steps');
  phases.forEach((name,index)=>progress.append(el('li',(index+1)+'. '+name,index<i.phaseIndex?'done':index===i.phaseIndex?'now':'')));
  box.append(progress);
  if(i.phase){
   const current=operations.find(o=>o.phase===i.phase);
   if(current){
    box.append(el('p','Estado: '+current.status+(current.errorCode?' · '+current.errorCode:''),'warning'));
   }else box.append(el('p','Próxima etapa: '+phases[i.phaseIndex],'notice'));
   const actions=el('div',undefined,'toolbar');
   if(!current){
    if(!automatic.automation){
     const action=button(autoInstalling?'Registrando…':'Criar repositório, banco e projeto automaticamente',()=>assisted(i),'primary');
     action.disabled=autoInstalling||!automatic.enabled;
     actions.append(action);
    }
    // Production deliberately has no direct write path: queue and lease only.
    // Legacy homologation-only manual endpoint stays server-side gated.
   }
   else actions.append(button('Verificar e reconciliar (somente leitura)',()=>reconcile(i)));
   box.append(actions);
  }else{
   box.append(el('p','Todas as oito etapas foram registradas. Ainda é necessária a homologação do login e do isolamento.','notice'));
   if(i.proposedDomain&&operations.some(o=>o.phase==='smoke'&&o.status==='confirmed')){
    const link=el('a','Abrir célula: https://'+i.proposedDomain,'link-button secondary');
    link.href='https://'+i.proposedDomain;link.target='_blank';link.rel='noopener noreferrer';
    box.append(link);
   }
  }
  if(i.phaseIndex>=6){
   const area=el('div',undefined,'toolbar');
   area.append(button('Exibir credencial inicial do ADM (uma única vez)',()=>showInitialCredential(i.id)));
   box.append(area);
  }
  box.append(el('p','A instalação usa exclusivamente as contas informadas. Revisões de operações incertas não repetem ações remotas.','muted'));
 }catch(err){notify(err.message);}
}
async function assisted(i){
 if(autoInstalling)return;
 const approved=window.confirm('Autorizar o KAIRÓS a criar automaticamente a infraestrutura da célula '+i.cellName+
  '?\n\nGitHub: '+i.owner+'/'+i.repository+
  '\nSupabase: '+i.supabaseOrgId+'\nVercel: '+i.vercelTeamId+
  '\nDomínio desejado: '+i.proposedDomain+
  '\n\nOs provedores podem cobrar. O KAIRÓS continuará no servidor mesmo com o navegador fechado. Autoriza?');
 if(!approved)return;
 autoInstalling=true;
 try{
  const approval={execute:true,acceptBilling:true,expectedPhase:'github',
   owner:i.owner,repository:i.repository,
   supabaseOrgId:i.supabaseOrgId,vercelTeamId:i.vercelTeamId};
  const out=await api('/api/installations/'+i.id+'/automation/start',{
   method:'POST',body:JSON.stringify(approval)});
  notify(out.accepted?'Instalação autorizada e colocada na fila do servidor. Você pode fechar o navegador.':
   'Não foi possível autorizar a automação.');
 }catch(error){
  notify('Automação bloqueada com segurança: '+error.message);
 }finally{autoInstalling=false;await loadInstallations();}
}
async function execute(i){
 const consent=window.confirm('Autoriza a etapa '+phases[i.phaseIndex]+'?\n\nGitHub: '+i.owner+
  '\nSupabase: '+i.supabaseOrgId+'\nVercel: '+i.vercelTeamId+
  '\n\nPodem existir custos nos provedores. A operação pode criar ou modificar recursos exclusivamente nas contas acima.');
 if(!consent)return;
 notify('Executando etapa autorizada. Não atualize a página até receber uma resposta.');
 try{
  const out=await api('/api/installations/'+i.id+'/execute',{
   method:'POST',body:JSON.stringify({execute:true,acceptBilling:true,expectedPhase:i.phase,
    owner:i.owner,supabaseOrgId:i.supabaseOrgId,vercelTeamId:i.vercelTeamId})});
  notify(out.status==='recorded'?'Etapa confirmada.':'Estado: '+out.status+'. Confira os detalhes antes de tentar novamente.');
  await loadInstallations();
 }catch(err){notify(err.message);}
}
async function reconcile(i){
 try{
  const data=await api('/api/installations/'+i.id+'/reconcile',{method:'POST',body:'{}'});
  notify(data.status==='recovered'?'Etapa recuperada sem repetir escrita remota.':
   'Resultado: '+data.status+'. Se continuar incerto, confira o painel oficial do provedor.');
  await loadInstallations();
 }catch(err){notify(err.message);}
}
async function showInitialCredential(id){
 if(!window.confirm('A senha será exibida uma única vez. Abra um local privado para salvá-la. Continuar?'))return;
 try{
  const data=await api('/api/installations/'+id+'/credentials',{method:'POST',body:'{}'});
  const view=el('div',undefined);
  view.append(el('p','Login: '+data.login),el('div',data.temporaryPassword,'notice'));
  view.append(el('p',data.warning,'muted'));
  $('detail').append(view);
 }catch(err){notify(err.message);}
}
// The client can override the suggestion if their name is already used.
let repositoryCustomized=false;
const repoField=$('repo-name'),cellField=$('cell-name');
cellField.addEventListener('input',()=>{
 if(!repositoryCustomized)repoField.value=suggestRepositoryName(cellField.value);
});
repoField.addEventListener('input',()=>{repositoryCustomized=repoField.value.length>0;});
$('create-form').addEventListener('submit',async event=>{
 event.preventDefault();notify('');
 if(!session?.signedIn)return;
 const form=new FormData(event.currentTarget),payload=Object.fromEntries(form.entries());
 try{
  const out=await api('/api/installations',{method:'POST',body:JSON.stringify(payload)});
  event.currentTarget.reset();repositoryCustomized=false;$('owner').value=session.user.login;
  $('vercel-team-id').value=session.vercelTeam?.teamId||'';
  $('vercel-team-display').value=session.vercelTeam?'Equipe: '+(session.vercelTeam.teamSlug||session.vercelTeam.teamId):'';
  notify('Instalação registrada. Nenhum projeto externo foi criado antes da autorização.');
  await loadInstallations();await showDetail(out.installation.id);
  await assisted(out.installation);
 }catch(err){notify(err.message);}
});
$('logout').addEventListener('click',async()=>{
 if(autoInstalling){notify('Aguarde a operação em andamento terminar ou interrompa a aba após confirmar o estado.');return;}
 try{await api('/api/logout',{method:'POST',body:'{}'});
  session=null;selected=null;await initialize();notify('Sessão encerrada. Entre com a conta GitHub desejada.');
 }catch(error){notify(error.message);}
});
$('reload').addEventListener('click',loadInstallations);
initialize();
