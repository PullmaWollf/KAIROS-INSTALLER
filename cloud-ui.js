import {runAssistedInstallation} from './cloud-assisted.js';
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
  $('create-form').querySelector('button[type=submit]').disabled=!session.signedIn;
  $('owner').value=session.user?.login||'';
  const list=$('providers');list.replaceChildren();
  for(const provider of ['github','supabase','vercel']){
   const card=el('div',undefined,'provider'),connected=session.providers?.includes(provider);
   card.append(el('strong',provider==='github'?'GitHub':provider==='supabase'?'Supabase':'Vercel'),
    el('span',connected?'Conta conectada':'Conexão pendente','state-label'));
   if(provider==='vercel'){
    if(session.vercelTeam)card.append(el('small','Equipe conectada: '+(session.vercelTeam.teamSlug||session.vercelTeam.teamId),'state-label'));
    const guide=el('div',undefined,'vercel-guide');
    guide.append(el('p','A hospedagem é sua: use a sua conta Vercel. Não precisa informar códigos técnicos.','state-label'));
    const instructions=el('p','1. Abra a Vercel e crie um token com acesso à equipe onde deseja hospedar.','state-label');
    const tokenLink=el('a','Abrir Vercel e criar token','link-button secondary');
    tokenLink.href='https://vercel.com/account/tokens';
    tokenLink.target='_blank';tokenLink.rel='noopener noreferrer';
    guide.append(instructions,tokenLink,el('p','2. Copie o token e cole abaixo. O KAIRÓS identifica sua equipe automaticamente.','state-label'));
    card.append(guide);
    const form=document.createElement('form');form.className='vercel-connect-form';
    form.autocomplete='off';
    const tokenLabel=el('label','Token de acesso da Vercel');
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
        options=null;status.textContent='Nenhuma equipe encontrada. Verifique se o token tem acesso a uma equipe Vercel. Tokens somente pessoais ainda não são aceitos nesta versão.';
        secret.value='';return;
       }
       if(found.hasMore){options=null;status.textContent='Sua conta tem muitas equipes. Entre em contato com o suporte para selecionar a equipe correta.';secret.value='';return;}
       if(options.length>1){
        choice=el('select');choice.setAttribute('aria-label','Escolha a equipe Vercel');
        for(const item of options){
         const option=el('option',item.name+(item.slug?' ('+item.slug+')':''));
         option.value=item.teamId;choice.append(option);
        }
        form.insertBefore(choice,submit);
        submit.textContent='Conectar equipe escolhida';
        status.textContent='3. Escolha sua equipe e clique novamente para concluir.';
        return;
       }
      }
      const teamId=choice?choice.value:options[0].teamId;
      if(!options.some(item=>item.teamId===teamId))throw Error('Equipe inválida');
      status.textContent='Verificando acesso à equipe…';
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
     card.append(button('Atualizar conexão',()=>{form.hidden=false;secret.focus();},'secondary'));
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
  selected=id;const box=$('detail');box.replaceChildren();
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
    const action=button(autoInstalling?'Instalando…':'Instalar automaticamente',()=>assisted(i),'primary');
    action.disabled=autoInstalling;
    actions.append(action,button('Executar somente esta etapa',()=>execute(i)));
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
 const approved=window.confirm('Autorizar toda a instalação da célula '+i.cellName+
  '?\n\nGitHub: '+i.owner+'/'+i.repository+'\nSupabase: '+i.supabaseOrgId+
  '\nVercel: '+i.vercelTeamId+
  '\nDomínio solicitado: '+i.proposedDomain+
  '\n\nOs provedores podem cobrar. O KAIRÓS executará as etapas em sequência; mantenha esta aba aberta até finalizar. Continuar?');
 if(!approved)return;
 autoInstalling=true;
 try{
  const consent={execute:true,acceptBilling:true,owner:i.owner,
   supabaseOrgId:i.supabaseOrgId,vercelTeamId:i.vercelTeamId};
  await runAssistedInstallation({request:api,installationId:i.id,consent,
   onProgress:message=>notify(message)});
  notify('Etapas do Installer concluídas; valide também login, permissões e PWA em dispositivos.');
 }catch(error){notify('Instalação pausada com segurança: '+error.message);}
 finally{autoInstalling=false;await loadInstallations();}
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
$('create-form').addEventListener('submit',async event=>{
 event.preventDefault();notify('');
 if(!session?.signedIn)return;
 const form=new FormData(event.currentTarget),payload=Object.fromEntries(form.entries());
 try{
  const out=await api('/api/installations',{method:'POST',body:JSON.stringify(payload)});
  event.currentTarget.reset();$('owner').value=session.user.login;
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
