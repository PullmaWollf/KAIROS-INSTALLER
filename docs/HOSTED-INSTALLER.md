# KAIRÓS — Backend independente do Installer (release candidate)

**Estado:** implementação de código para pré-homologação. Ainda **não** é um serviço de produção comprovado. Não utilizar dados reais de membros antes do teste em contas isoladas.

## 1. Separação obrigatória

- **Installer (controle):** repositório `KAIROS-INSTALLER`, projeto Vercel **dedicado ao Installer** e projeto Supabase **dedicado ao Installer**; apenas identidades administrativas, autorizações cifradas e históricos mínimos das instalações.
- **Célula 1:** GitHub, Supabase e Vercel **da própria célula**.
- **Célula 2:** outros projetos e contas próprios; sem compartilhamento de chaves, banco ou PWA.
- **AGAPE original:** permanece isolado. Nunca execute `control/migrations/` no Supabase do AGAPE.

O plano de controle pode ser hospedado pelo mantenedor, mas **não** hospeda tabelas de membros, presença, contatos ou outras informações operacionais das células.

## 2. Implantação do controle (ambiente de teste)

1. Na conta do responsável pelo Installer, crie **um novo projeto Supabase chamado, por exemplo, `kairos-installer-control`**. Escolha explicitamente a organização, região e o plano, conferindo preços e cotas. Não reutilize o projeto `AGAPE APP`.
2. No **novo** projeto, aplique uma única vez `control/migrations/20261103000000_control_plane.sql`. As tabelas possuem RLS e os endpoints de controle utilizam somente a chave privada do backend.
3. Na Vercel do responsável pelo Installer, crie um projeto **separado**, apontando para `PullmaWollf/KAIROS-INSTALLER`, com Node.js 24, HTTPS e diretório raiz do repositório. O arquivo `vercel.json` já configura as rotas da API e inclui as migrações auditadas do Core no bundle.
4. Configure **somente no painel privado da Vercel** as variáveis obrigatórias abaixo; marque como Production e não coloque em arquivos do GitHub, respostas de chat ou HTML.
5. Execute `npm test` e `npm run check`; confirme que `GET /api/health` retorna `{"ok":true,"ready":true}` ao utilizar o banco dedicado.
6. Só depois configure os três aplicativos OAuth e as URLs de callback; não ative chamadas que criam projetos enquanto o ambiente de homologação não for escolhido.

## 3. Variáveis de ambiente do backend

| Nome | Origem | Obrigatória |
|---|---|---|
| `KAIROS_INSTALLER_PUBLIC_ORIGIN` | URL HTTPS fixa da Vercel do Installer, sem barra final | Sim |
| `KAIROS_CONTROL_SUPABASE_URL` | URL do **novo Supabase do Installer** | Sim |
| `KAIROS_CONTROL_SERVICE_ROLE_KEY` | Chave privada do **novo Supabase do Installer**, somente no servidor | Sim |
| `KAIROS_CONTROL_ENCRYPTION_KEY` | 32 bytes aleatórios codificados em base64url | Sim |
| `KAIROS_GITHUB_CLIENT_ID` / `_CLIENT_SECRET` | GitHub OAuth App registrada para o Installer | Para GitHub |
| `KAIROS_SUPABASE_CLIENT_ID` / `_CLIENT_SECRET` | Supabase OAuth App, com permissões de projetos e banco configuradas | Para Supabase |
| `KAIROS_VERCEL_CLIENT_ID` / `_CLIENT_SECRET` | Vercel App e permissões de API configuradas | Para Vercel |
| `KAIROS_CONTROL_ENABLE_WRITES` | `0` por padrão, `1` somente durante instalações autorizadas | Não |
| `KAIROS_VERCEL_MANAGEMENT_ENABLED` | `0` por padrão; `1` **apenas após confirmar escopos de gerenciamento** da integração Vercel | Não |
| `KAIROS_ENABLE_BETA_SQL` | `0` por padrão; `1` após aprovação do endpoint experimental de SQL da Supabase | Não |
| `KAIROS_ENABLE_GIT_DEPLOY` | `0` por padrão; `1` para permitir POST de novo deployment Git na Vercel da célula | Não |

Gere a chave de criptografia **em um terminal privado**:

```powershell
node -e "console.log(require('node:crypto').randomBytes(32).toString('base64url'))"
```

Não publique nem envie esse valor em conversas. Mantenha backup seguro da chave e defina uma política de rotação antes de operar com várias células. Sua perda impede descriptografar as conexões.

## 4. OAuth: identidade não significa autorização de recursos

Configure o **mesmo callback HTTPS** em cada aplicativo:

```
https://DOMINIO-DO-INSTALLER/api/auth/callback
```

- **GitHub:** login principal do administrador. O backend verifica `GET /user` e restringe a instalação ao próprio `login`; organizações GitHub ainda não são suportadas no fluxo de nuvem.
- **Supabase:** vincula ao usuário GitHub já autenticado. A OAuth App precisa permitir acesso à organização e a projetos; a execução SQL experimental requer `database:write`, quando disponível.
- **Vercel:** um token de identidade OIDC, com escopos `openid/email/profile`, **não** autoriza modificar projetos. O operador deve configurar a Vercel App com permissões de gerenciamento adequadas e confirmar o token em API com a conta de teste. O backend só tenta usar essas permissões quando `KAIROS_VERCEL_MANAGEMENT_ENABLED=1`.

Sessões utilizam token opaco com hash no banco, cookie HttpOnly/Secure/SameSite=Lax e CSRF para todas as alterações. Tokens dos provedores ficam cifrados em AES-256-GCM, vinculados ao usuário e ao provedor; nenhum valor é retornado ao frontend.

## 5. Fluxo de oito fases

O dashboard em `/app.html` mostra GitHub → projeto Supabase → migrações → projeto Vercel → segredos Vercel → primeiro ADM → deployment → smoke test.

Cada fase recebe confirmação expressa de **owner GitHub, organização Supabase, time Vercel e possibilidade de cobranças**. O Supabase do controle registra uma tentativa **antes** de qualquer POST externo, com exclusividade transacional por instalação e fase.

As migrações do Core são **cópias congeladas e auditadas no repositório** em `control/core-migrations/`; o navegador nunca fornece SQL. A API `POST /v1/projects/{ref}/database/query` é **Beta/experimental**. Se o provedor não aceitar múltiplos comandos ou não conceder a permissão necessária, a instalação fica bloqueada em revisão e não faz repetição automática.

O primeiro administrador é criado com hash `scrypt` compatível com o Core. A senha temporária é gerada no servidor, cifrada e disponibilizada ao responsável **uma única vez** após sucesso.

O deploy via API Vercel precisa do projeto vinculado ao GitHub da célula e aguarda um deployment de produção novo, posterior às variáveis. O smoke test inclui `/api/health`, rotas públicas/privadas, HTML e Service Worker.

## 6. Recuperação, auditoria e falhas

- `started`: tentativa registrada; pode ter produzido efeito remoto. Não repetir POST.
- `confirmed`: recibo mínimo, sem credenciais, e avanço da fase **na mesma transação SQL**.
- `needs_review`: execução incerta; verificar o painel do provedor e investigar.
- Apenas **deploy e smoke**, reconfirmáveis por GET, podem avançar automaticamente após uma interrupção.
- GitHub/Supabase/Vercel com projeto aparentemente existente **não** significa que foi criado pela tentativa atual; exige reconciliação humana.

Não apague ou edite diretamente linhas da base do Installer para forçar outro POST. Evite criar duas instalações com o mesmo owner/repositório.

## 7. Critérios para iniciar homologação

1. CI dos dois repositórios aprovado e contrato Core↔Installer sem divergências.
2. Backend do Installer rodando em projeto **dedicado**, com RLS, chaves criptográficas, OAuth e domínio fixo.
3. Apps OAuth registradas nos três provedores, scopes relevantes aprovados, sem utilizar credenciais do AGAPE.
4. Conta GitHub/Supabase/Vercel de laboratório **da célula**, e cotas/custos aceitos pelo titular.
5. Migrações, segredos, ADM, deploy e permissões testados contra essa conta, sem dados reais.
6. Falhas de rede, duplicidade, acesso entre usuários, CSRF e logout avaliados.
7. Manual de backup, retenção de dados e canal de suporte definido.

**Conceitos distintos:** código pronto para homologação ≠ hospedagem configurada ≠ homologação aprovada ≠ produto 100% de produção.

Referências:
- https://supabase.com/docs/reference/api/v1-run-a-query
- https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration/oauth-scopes
- https://vercel.com/docs/sign-in-with-vercel/manage-from-dashboard
- https://vercel.com/docs/rest-api
