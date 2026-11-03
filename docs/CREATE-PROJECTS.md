# KAIRÓS Installer — provisionamento de projetos (v0.4)

**Atenção: este é um fluxo técnico local, ainda sem homologação de criação real em contas de teste.** Os projetos pertencem à organização/time autorizados pelo administrador, nunca ao AGAPE nem à conta do mantenedor. Poderão existir cobranças e limites de plano.

## Pré-requisitos

- Node.js 24 e código atualizado do `KAIROS-INSTALLER`.
- Organização no Supabase e time na Vercel, ambos próprios da célula. Escolha os IDs no painel dos serviços.
- Tokens de API criados **na conta da célula**, preferencialmente escopados, que permitem consultar organização/time e criar projetos.
- Para a Vercel, a cópia do `KAIROS-CORE` precisa já existir no GitHub da célula e estar acessível à integração Git da Vercel.
- **Não use contas ou tokens pessoais do mantenedor, nem o Supabase/Vercel do AGAPE.**

## Supabase: criar projeto sem SQL

No computador **do administrador**, configure estas variáveis no terminal (PowerShell, substitua placeholders em ambiente privado):

```powershell
$env:KAIROS_SUPABASE_ORG_ID = "<ID-ORGANIZACAO-DA-CELULA>"
$env:KAIROS_PROJECT_NAME = "kairos-minha-celula"
$env:KAIROS_SUPABASE_REGION = "sa-east-1"
$env:SUPABASE_ACCESS_TOKEN = "<TOKEN-CELULA>"
$env:SUPABASE_DB_PASSWORD = "<SENHA-ALEATORIA-FORTE>"
```

Prévia sem acesso à rede:

```powershell
node scripts/create-project.mjs --provider supabase
```

Somente após conferir identidade, custos e organização:

```powershell
node scripts/create-project.mjs --provider supabase --execute --confirm-org <ID-ORGANIZACAO-DA-CELULA> --accept-billing
```

O código consulta organizações acessíveis e faz POST apenas para a organização indicada. Ele devolve um **project ref**, sem exibir a senha. Armazene a senha de banco em gerenciador seguro. O banco está vazio até aplicar a migração do **KAIROS-CORE**. Não execute o mesmo comando repetidamente.

## Vercel: criar projeto vinculado ao GitHub

Na mesma sessão ou em outra sessão privada, configure:

```powershell
$env:KAIROS_VERCEL_TEAM_ID = "<ID-TIME-CELULA>"
$env:KAIROS_PROJECT_NAME = "kairos-minha-celula"
$env:KAIROS_GITHUB_OWNER = "<GITHUB-DA-CELULA>"
$env:KAIROS_GITHUB_REPO = "<REPOSITORIO-COPIADO-DO-CORE>"
$env:VERCEL_TOKEN = "<TOKEN-VERCEL-DA-CELULA>"
```

Simulação local:

```powershell
node scripts/create-project.mjs --provider vercel
```

Criação real, após aceitar custos e confirmar o time:

```powershell
node scripts/create-project.mjs --provider vercel --execute --confirm-team <ID-TIME-CELULA> --accept-billing
```

A API da Vercel receberá o nome do projeto e `gitRepository` apontando para **o repositório GitHub da célula**, nunca o Core original como projeto próprio do cliente. Criar um projeto **não garante deploy**: ainda será necessário adicionar variáveis secretas, conectar permissões Git e publicar.

## Segurança e recuperação

- `--execute` e `--accept-billing` são obrigatórios para chamar endpoints de criação.
- O destino de cada operação é explicitado em `--confirm-org` ou `--confirm-team`.
- O modo padrão é **simulação local**: não utiliza a rede.
- Checagem por leitura confirma acesso, **não** prova titularidade financeira; o administrador deve conferir o painel.
- Em falha HTTP ou timeout, **verifique se o projeto já foi criado no painel**, antes de tentar de novo. Esta versão não possui idempotência remota nem rollback automático.
- Sem OAuth no navegador, sem armazenar credenciais no Installer web, sem migrações automáticas e sem deploy final.
- Remova os tokens das variáveis após a instalação e revogue tokens temporários quando não forem necessários.
- **Nunca use tokens Supabase clássicos de longo prazo** se um token limitado com permissões adequadas estiver disponível.

## Fontes oficiais

- [Supabase Management API](https://supabase.com/docs/reference/api/introduction)
- [Supabase Personal Access Tokens](https://supabase.com/docs/guides/platform/personal-access-tokens)
- [Vercel Create Project](https://vercel.com/docs/rest-api/projects/create-a-new-project)
