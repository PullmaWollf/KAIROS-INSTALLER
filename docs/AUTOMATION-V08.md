# KAIRÓS Installer v0.8 — Execução, OAuth e recuperação

**Status: integração experimental, com testes unitários e simulações. NÃO homologado em contas de produção.**

## 1. OAuth no navegador — infraestrutura local

O comando `npm run oauth:local` inicia um servidor apenas em `http://127.0.0.1:43117`, **não acessível externamente**, para vincular GitHub e Supabase. O serviço exige apps OAuth registrados **pelo mantenedor do Installer** nos provedores, configurados com callbacks exatos:

- GitHub: `http://127.0.0.1:43117/callback/github`
- Supabase: `http://127.0.0.1:43117/callback/supabase`

Variáveis **locais** (nunca comitadas nem enviadas no chat):
- `KAIROS_GITHUB_CLIENT_ID`, `KAIROS_GITHUB_CLIENT_SECRET`
- `KAIROS_SUPABASE_CLIENT_ID`, `KAIROS_SUPABASE_CLIENT_SECRET`
- opcional `KAIROS_OAUTH_PORT` — atualizar callbacks no provedor para a mesma porta.

O navegador apresenta os links de autorização. Implementamos `state` aleatório, PKCE `S256`, validade de 10 minutos, sessão HttpOnly/Lax e uso único do código de autorização. Token/refresh token permanecem **somente em RAM**, sem endpoint para exportá-los. Fechar o processo descarta a sessão. Revogar acesso deve ser feito diretamente no provedor.

**Limitações:** não há conexão dessas sessões com `scripts/operate.mjs` nesta versão. É um protótipo **local** de OAuth, não deploy web público. A Vercel requer uma integração registrada no console, com URL de instalação e fluxo de troca específico; não podemos inventar `client_id` ou autorizar a conta de terceiros sem consentimento. OAuth no navegador **não pode ser publicado no GitHub Pages**, pois exige backend para a troca de códigos.

Referências: [GitHub OAuth](https://docs.github.com/en/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps), [Supabase OAuth](https://supabase.com/docs/guides/integrations/build-a-supabase-oauth-integration), [Vercel Integration](https://vercel.com/docs/integrations/create-integration/vercel-api-integrations).

## 2. Execução sequencial opt-in (CLI)

O antigo `scripts/workflow.mjs` continua servindo para criar um registro local. Prepare uma configuração conforme `examples/workflow.example.json` e inicialize:

```powershell
node scripts/workflow.mjs --init --config workflow.local.json --state .kairos-install/celula.json
```

**Simulação (zero chamadas externas):**
```powershell
node scripts/operate.mjs --state .kairos-install/celula.json --recovery .kairos-install/operations.json --run-all
```

A execução real requer `--execute`, `--accept-billing` e **três confirmações exatas de destino**. Antes disso, o administrador prepara variáveis de ambiente temporárias e autorizações **da própria célula**: `GITHUB_TOKEN`, `SUPABASE_ACCESS_TOKEN`, `SUPABASE_DB_PASSWORD`, `VERCEL_TOKEN`, `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SESSION_SECRET`, `ADMIN_PASSWORD`. O código nunca imprime esses valores.

```powershell
node scripts/operate.mjs --state .kairos-install/celula.json --recovery .kairos-install/operations.json --run-all --execute --accept-billing --confirm-owner <GITHUB-DA-CELULA> --confirm-org <ORG-SUPABASE-DA-CELULA> --confirm-team <TIME-VERCEL-DA-CELULA>
```

**Não execute ainda em contas produtivas**: a CLI está validada por simulações, mas não foi homologada. O pipeline pode iniciar chamadas que criam recursos sujeitos a cobrança. O Core precisa estar previamente clonado na pasta `coreDir` antes da fase de migração. Depois que as variáveis da Vercel são criadas, o fluxo só aceita deploy de produção criado **após** essa configuração e com status READY; não dispara um novo build nesta versão.

## 3. Recuperação segura

Antes de cada fase, o orquestrador grava `operations.json` com estado `started`; após sucesso, registra `confirmed`, e só então atualiza o progresso da instalação. Uma tentativa incerta (`started` ou `needs-review`) nunca dispara um segundo POST automaticamente.

Quando a execução é retomada, os módulos `reconcile.js` consultam GitHub, Supabase e Vercel usando **GET**, com seleção exata de conta, organização/time e nome do projeto. Resultado `exists-review` significa que o recurso **existe**, não que nossa operação o criou; um humano precisa conferir no painel. Se não for possível comprovar o resultado, permanece bloqueado.

Nenhum segredo entra no registro. Os arquivos `.kairos-install/` são ignorados pelo Git. O arquivo **não é idempotência remota** nem substitui auditoria de um backend transacional.

## 4. Bloqueios para produto de um clique

1. Registrar os aplicativos OAuth e uma integração Vercel, testar consentimento com contas independentes.
2. Conectar os tokens OAuth de sessão diretamente ao orquestrador (sem persistência insegura e sem expor ao frontend).
3. Automatizar a cópia **local** do Core com identidade GitHub confirmada, evitando tokens em URLs e comandos.
4. Disparar e monitorar novo deploy do projeto na conta da célula, garantindo que os segredos já foram definidos.
5. Usar um armazenamento transacional com idempotência, reconciliação robusta e auditoria para múltiplos clientes.
6. Homologar migrações, primeiro ADM, login, permissões e PWA numa conta de teste dedicada.
