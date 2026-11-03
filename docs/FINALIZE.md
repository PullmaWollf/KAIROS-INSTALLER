# KAIRÓS Installer v0.5 — migrar, configurar e inspecionar

Este módulo é uma ferramenta local **opt-in** para o administrador da célula. Não usa Supabase/Vercel do mantenedor. **Sem `--execute`, nenhum acesso à rede é realizado.** Não há OAuth nem backend de hospedagem compartilhado.

## Preparação

Tenha: Node.js 24, CLI Supabase instalada e acessível como comando `supabase`, repositório **Core copiado para seu GitHub**, pasta local desse repositório, projeto Supabase novo próprio e projeto Vercel próprio.

Trabalhe apenas na própria conta. Mantenha tokens/chaves em variáveis de ambiente temporárias, nunca no GitHub, README, logs, páginas web ou chats. A validação por acesso **não comprova responsabilidade financeira** — confirme custos no painel.

## 1. Migrações Supabase

Use apenas em projeto **novo e dedicado à célula**, com o arquivo `supabase/migrations/20261103000000_kairos_initial.sql` presente na cópia local do Core.

No PowerShell, configure as variáveis com valores **da célula**:

```powershell
$env:KAIROS_SUPABASE_PROJECT_REF = "<REF-SUPABASE-DA-CELULA>"
$env:KAIROS_GITHUB_OWNER = "<LOGIN-GITHUB-DA-CELULA>"
$env:KAIROS_CORE_DIR = "C:\\Projetos\\minha-celula"
$env:SUPABASE_ACCESS_TOKEN = "<TOKEN-DA-CELULA>"
$env:SUPABASE_DB_PASSWORD = "<SENHA-DO-BANCO-DA-CELULA>"
```

Prévia **sem rede**:
```powershell
node scripts/finalize.mjs --action migrate
```

Somente após confirmar o destino e o SQL:
```powershell
node scripts/finalize.mjs --action migrate --execute --confirm-project <REF-SUPABASE-DA-CELULA>
```

O wrapper verifica o `git remote` da cópia Core, confirma o arquivo de migração e roda o `supabase db push --remote=REF --dry-run` antes do `supabase db push --remote=REF --yes`. O histórico de migrações evita reaplicações, mas **não é uma transação atômica do provisionamento inteiro**. **Não faça SQL Editor e db push manual no mesmo projeto**. Não use `supabase db reset` em banco remoto.

## 2. Variáveis privadas na Vercel

Defina no terminal, sem salvar em arquivos versionados:

```powershell
$env:KAIROS_VERCEL_TEAM_ID = "<TIME-VERCEL-DA-CELULA>"
$env:KAIROS_VERCEL_PROJECT_ID = "<PROJETO-VERCEL-DA-CELULA>"
$env:KAIROS_GITHUB_OWNER = "<LOGIN-GITHUB-DA-CELULA>"
$env:KAIROS_GITHUB_REPO = "<REPOSITORIO-COPIADO>"
$env:KAIROS_SUPABASE_PROJECT_REF = "<REF-SUPABASE-DA-CELULA>"
$env:SUPABASE_URL = "https://<REF-SUPABASE-DA-CELULA>.supabase.co"
$env:SUPABASE_SERVICE_ROLE_KEY = "<CHAVE-PRIVADA-DA-CELULA>"
$env:SESSION_SECRET = "<VALOR-ALEATORIO-COM-48-CARACTERES-OU-MAIS>"
$env:VERCEL_TOKEN = "<TOKEN-VERCEL-DA-CELULA>"
```

Prévia sem rede:
```powershell
node scripts/finalize.mjs --action env
```

Após confirmar time, projeto, repositório e variáveis:
```powershell
node scripts/finalize.mjs --action env --execute --confirm-project <PROJETO-VERCEL-DA-CELULA> --confirm-team <TIME-VERCEL-DA-CELULA>
```

O código verifica o projeto e GitHub vinculado, e configura **apenas** `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SESSION_SECRET` como **encrypted / production**, sem sobrescrever valores existentes. Se uma variável já existe, **bloqueia a execução** para revisão manual. A saída não inclui os valores.

**Depois de adicionar variáveis, faça um novo deploy pela Vercel.** Variáveis novas não modificam deployments anteriores. O script não dispara o deploy automaticamente.

## 3. Consultar publicação

```powershell
node scripts/finalize.mjs --action status --execute --confirm-project <PROJETO-VERCEL-DA-CELULA> --confirm-team <TIME-VERCEL-DA-CELULA>
```

A consulta é somente leitura e retorna status e URL de um deployment de produção da Vercel, quando disponível. Status `READY` **não comprova** que login, banco, permissões e PWA estão funcionando. Teste manualmente a instalação antes de cadastrar usuários reais.

## Faltam para automação 100%

- OAuth em backend seguro para conectar as contas pelo navegador.
- Bootstrap ADM autorizado, sem exposição de senha.
- Gatilho de deploy e smoke tests reais, com consentimento.
- Recuperação idempotente de falhas e auditoria.
- Homologação real com contas independentes (todas as operações atuais estão validadas em testes simulados).

## Referências oficiais

- [Supabase CLI db push](https://supabase.com/docs/reference/cli)
- [Vercel environment variables](https://vercel.com/docs/rest-api/projects/create-one-or-more-environment-variables)
- [Vercel deployments](https://vercel.com/docs/rest-api)
