import {STAGES,TEMPLATE,SUPABASE_CREATE,VERCEL_IMPORT,normalizeSlug,validateName,validateRepo,validateProjectRef,supabaseCommands,vercelLink,progress} from './wizard.js';
const $=id=>document.getElementById(id);
let step=0;
const model={name:'',slug:'',repo:'',ref:'',completed:Object.fromEntries(STAGES.map(s=>[s.id,false]))};
function node(tag,text,attrs={}){const el=document.createElement(tag);el.textContent=text;for(const[k,v]of Object.entries(attrs))el.setAttribute(k,v);return el;}
function buttonLink(href,label){const a=node('a',label,{href,target:'_blank',rel:'noopener noreferrer',class:'button'});return a;}
function textField(parent,id,label,placeholder,help='',value=''){
 const l=node('label',label,{class:'field'}),input=node('input','',{id,placeholder,autocomplete:'off',value});input.value=value;l.append(input);
 if(help)l.append(node('small',help));parent.append(l);return input;
}
function para(parent,text){parent.append(node('p',text,{class:'lead'}));}
function heading(parent,title){parent.append(node('h2',title));}
function item(parent,title,description){const box=node('div','',{class:'item'});box.append(node('h3',title),node('p',description));parent.append(box);return box;}
function commands(parent,list){for(const cmd of list){const box=node('div','',{class:'command'}),pre=node('pre',cmd),b=node('button','Copiar',{type:'button'});b.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(cmd);b.textContent='Copiado!';}catch{b.textContent='Copie o comando ao lado';}});box.append(pre,b);parent.append(box);}}
function warning(parent,text,type='warning'){parent.append(node('p',text,{class:type}));}
function render(){
 $('steps').replaceChildren();
 STAGES.forEach((s,i)=>{const li=node('li',''),btn=node('button','',{type:'button',class:'step-btn'+(i===step?' current':'')+(model.completed[s.id]?' complete':'')});
 btn.append(node('span',model.completed[s.id]?'✓':String(i+1),{class:'step-number'}),node('span',s.label));
 btn.addEventListener('click',()=>{step=i;render();});li.append(btn);$('steps').append(li);});
 $('progress-title').textContent='Etapa '+(step+1)+' de '+STAGES.length;
 const percent=progress(model.completed);$('progress-count').textContent=percent+'% concluído';$('progress-fill').style.width=percent+'%';$('progressbar').setAttribute('aria-valuenow',String(percent));
 const screen=$('screen');screen.replaceChildren();const stage=STAGES[step].id;
 if(stage==='identity')identity(screen);
 else if(stage==='github')github(screen);
 else if(stage==='supabase')supabase(screen);
 else if(stage==='database')database(screen);
 else if(stage==='vercel')vercel(screen);
 else finish(screen);
 const confirm=node('label','',{class:'confirm'}),check=node('input','',{type:'checkbox'});check.checked=!!model.completed[stage];check.addEventListener('change',()=>{if(check.checked&&!canConfirm(stage)){check.checked=false;alert('Revise os campos obrigatórios antes de confirmar.');return;}model.completed[stage]=check.checked;render();});
 confirm.append(check,node('span',stage==='finish'?'Conferi os itens e a instância já passou pelos testes necessários.':'Concluí esta etapa na minha própria conta e conferi as instruções.'));screen.append(confirm);
 $('previous').disabled=step===0;$('previous').onclick=()=>{step=Math.max(0,step-1);render();};
 $('next').textContent=step===STAGES.length-1?'Revisar instalação':'Próxima etapa';
 $('next').onclick=()=>{step=step===STAGES.length-1?0:step+1;render();};
}
function canConfirm(s){return s==='identity'?validateName(model.name):s==='github'?!!validateRepo(model.repo):s==='supabase'?validateProjectRef(model.ref):true;}
function identity(box){
 heading(box,'Vamos configurar sua célula');para(box,'Escolha o nome que aparecerá no aplicativo. Não é preciso informar senhas, tokens ou dados pessoais.');
 const input=textField(box,'cell-name','Nome da célula','Ex.: Célula Esperança','Até 70 caracteres.',model.name);input.maxLength=70;
 input.addEventListener('input',()=>{model.name=input.value;model.slug=normalizeSlug(input.value);$('slug-preview').textContent=model.slug||'sua-celula';});
 const card=item(box,'Identificador sugerido','Pode ser usado como nome do projeto e do repositório na instalação.');
 card.append(node('code',model.slug||'sua-celula',{id:'slug-preview'}));
 warning(box,'A identidade visual poderá ser ajustada depois pelo administrador dentro do KAIRÓS. Nenhuma informação é enviada a servidores nesta página.','good');
}
function github(box){
 heading(box,'Repositório da sua célula');para(box,'Conecte-se ao GitHub com uma conta sua e crie uma cópia independente do KAIRÓS. O repositório não ficará sob o proprietário do template.');
 const c=item(box,'1. Crie seu repositório','Abra o template oficial. Se a opção Use this template ainda não estiver disponível, utilize fork ou importe o repositório na sua conta.');
 c.append(buttonLink(TEMPLATE,'Abrir KAIRÓS no GitHub'));
 const f=textField(box,'repo-url','URL do repositório da célula','https://github.com/seu-usuario/sua-celula','Informe somente o endereço público/privado do repositório, nunca um token.',model.repo);
 f.addEventListener('input',()=>{model.repo=f.value;});
}
function supabase(box){
 heading(box,'Seu próprio Supabase');para(box,'O administrador cria e mantém um projeto novo na própria conta. O instalador nunca utiliza a infraestrutura do mantenedor KAIRÓS.');
 const c=item(box,'2. Crie um projeto exclusivo','Entre no painel Supabase, crie sua organização/projeto, escolha região, plano e confira eventuais custos e limites.');
 c.append(buttonLink(SUPABASE_CREATE,'Criar projeto Supabase'));
 const i=textField(box,'project-ref','Project reference (não é segredo)','Ex.: abcdefghijklmnopqrst','Encontre o ID nas configurações do projeto. Não informe service_role ou senhas.',model.ref);
 i.addEventListener('input',()=>model.ref=i.value.trim());
 warning(box,'Nunca use o Supabase do AGAPE ou o de outra célula. Não cole chaves no instalador.');
}
function database(box){
 heading(box,'Preparar banco e conta ADM');para(box,'No computador do administrador, com o repositório já clonado, execute os comandos abaixo em um terminal confiável. A CLI fará a autenticação diretamente no Supabase.');
 if(validateProjectRef(model.ref))commands(box,supabaseCommands(model.ref));
 else warning(box,'Volte à etapa Supabase e preencha o Project reference para obter os comandos corretos.');
 const c=item(box,'3. Aplicar esquema do KAIRÓS','Use supabase db push no banco novo. Não execute simultaneamente a migração manual pelo SQL Editor, para evitar divergências no histórico.');
 c.append(buttonLink('https://supabase.com/docs/guides/deployment/database-migrations','Documentação Supabase'));
 commands(box,['npm ci','Copy-Item .env.example .env.local','npm run doctor','npm run create-admin']);
 warning(box,'Os comandos acima incluem etapas de configuração local. Preencha .env.local na sua máquina, nunca neste site. O cadastro do ADM exige uma senha forte e a chave secreta do Supabase apenas no ambiente local.');
}
function vercel(box){
 heading(box,'Publicar na sua Vercel');para(box,'Entre na Vercel com a conta da sua célula. Importe o repositório que você criou e configure as variáveis de ambiente na interface privada da Vercel.');
 const r=validateRepo(model.repo);const c=item(box,'4. Importe seu código','Selecione sua cópia do repositório no painel. Para começar, também é possível usar o botão de clonagem do template oficial.');
 c.append(buttonLink(VERCEL_IMPORT,'Abrir Vercel / New Project'));
 const link=r?'https://vercel.com/new/clone?repository-url='+encodeURIComponent(r.url)+'&env=SUPABASE_URL%2CSUPABASE_SERVICE_ROLE_KEY%2CSESSION_SECRET':vercelLink();
 c.append(buttonLink(link,'Importação orientada'));
 item(box,'Variáveis de ambiente','SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY e SESSION_SECRET — todos configurados diretamente no painel privado da Vercel. Nenhum valor será solicitado aqui.');
 warning(box,'O Deploy Button não cria o Supabase nem aplica o banco automaticamente. A Vercel deve pertencer à própria célula.');
}
function finish(box){
 heading(box,'Validação e entrega');para(box,'Antes de convidar membros, confirme que a aplicação publicada funciona com infraestrutura própria.');
 const c=node('div','',{class:'cards'});box.append(c);
 for(const [t,d] of [
 ['Infraestrutura','Projeto GitHub, Supabase e Vercel registrados na própria conta da célula'],
 ['Autenticação','Login e logout do ADM funcionam; senha não é exibida nem registrada'],
 ['Permissões','Membro não consegue alterar marca ou cadastrar usuários'],
 ['PWA','Manifesto, ícones e navegação HTTPS funcionando em dispositivo real'],
 ['Dados','Mural, encontros e escalas operam exclusivamente no banco da célula'],
 ['Segurança','Backups, proteção do login e termos de privacidade revisados antes do uso real']
 ])item(c,t,d);
 warning(box,'Esta versão do instalador guia a instalação. Ela não verifica automaticamente o conteúdo do banco nem executa deploy em seu nome.','warning');
 if(STAGES.every(s=>model.completed[s.id]))warning(box,'Checklist integralmente marcado. Conclua os testes reais antes de liberar para membros.','good');
}
render();
