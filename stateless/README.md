# KAIRÓS Installer — arquitetura sem banco central (protótipo)

## Objetivo
O Installer é um facilitador. Depois de conectar as contas, cria **um repositório privado do Core na conta do cliente** e transfere todo o provisionamento para **GitHub Actions desse repositório**. O app instalado utiliza exclusivamente banco Supabase e projeto Vercel próprios. Nenhum banco, login ou histórico de instaladores é necessário no Installer.

**Este pacote NÃO é um release de produção.** Não houve provisionamento real ponta a ponta. São necessários testes em ambientes autorizados e melhoria da experiência de conexão (OAuth) antes de liberar para usuários leigos.

## Componentes
- `public/index.html`: wizard mobile e desktop; credenciais somente na memória do formulário, sem localStorage
- `api/preflight.mjs`: consulta read-only plano Free, 2 projetos ativos, conta Hobby, template e GitHub↔Vercel
- `api/launch.mjs`: faz uma única entrega dos segredos por encrypted GitHub Actions Secrets; cria repositório exclusivo e dispara workflow
- `api/status.mjs`: leitura do andamento via GitHub Actions usando token da sessão atual do navegador
- `worker/workflow.yml`: workflow despachado, com `concurrency` e permissões reduzidas
- `worker/kairos-bootstrap.mjs`: 7 etapas remotas com **claims persistidos antes de cada POST** em GitHub Actions Repository Variables
- `worker/cleanup.mjs`: remove os tokens temporários (incluindo o token de limpeza), com execução `if: always()`

## Sem banco central
O instalador **não usa** `kairos-installer-control` e não toca no ÁGAPE original. GitHub Actions armazena somente o status não secreto no próprio repositório. O Supabase do cliente armazena apenas dados da sua célula. **Se o Installer desaparecer, a célula instalada continua funcionando.**

## Segurança e limitações de homologação
1. Exige repositório com prefixo `kairos-hml-`, célula `HML ...`, GitHub e Vercel com o mesmo login, organização Free e Vercel Hobby.
2. **O token GitHub do cliente será entregue temporariamente como secret ao workflow** para que ele consiga excluir os outros segredos. Se um runner for comprometido, o token poderá ser exposto. Para lançamento comercial substitua PATs amplos por OAuth/GitHub App com permissões mínimas e expiração curta.
3. Os tokens ficam criptografados nos GitHub Actions Secrets **durante** a execução. Se o runner for perdido antes do passo de limpeza, o cliente deverá revogar as credenciais nos provedores.
4. As operações remotas incertas **não são repetidas**. Após claim `started`, o workflow pede revisão manual; somente GETs podem ser executados novamente em condições explícitas.
5. A verificação do limite Supabase conta projetos observáveis, mas há cotas compartilhadas com outros membros proprietários/admins de organizações. API/planos podem mudar. Uma verificação gratuita **não reserva recursos nem garante custo zero futuro**.
6. O limite do plano Hobby e seu uso pessoal/não comercial devem ser respeitados.
7. O Core e o backend devem ser auditados antes de usar com dados pessoais reais; o teste automatizado não atesta isolamento de usuários finais.
8. A criação de um repositório seguida de falha no handoff exige conferência humana. Nunca disparar de novo automaticamente o mesmo POST.
9. Os exemplos de tokens na interface são para uma **primeira homologação técnica**. Um produto para pessoas leigas exigirá OAuth guiado e proteção adicional contra abusos (CSRF/replay/rate limiting).

## Execução local
`npm install` e `npm test && npm run check`. Para testar a interface sem as funções serverless, use um ambiente de desenvolvimento Vercel. Configure `KAIROS_INSTALLER_PUBLIC_ORIGIN` com a URL HTTPS exata do Installer. Nunca coloque tokens no `.env` ou no repositório.

## Ativação
A conexão GitHub App ↔ Vercel do cliente precisa ser autorizada. O GitHub token deve poder criar repositório privado a partir de template, enviar workflow e gerenciar Actions Secrets. O Supabase precisa permitir Management API e SQL no projeto criado. O Vercel precisa permitir a importação do repositório privado. **Não disparar instalações reais sem validar essas permissões e a isenção de custos no fluxo.**

### Detalhe técnico verificado sobre checkpoint
O token nativo `GITHUB_TOKEN` tem permissões limitadas. Para operar Repository Variables, esta primeira versão usa temporariamente o **token GitHub fornecido pelo próprio cliente** através do secret `KAIROS_GITHUB_AUTOMATION_TOKEN`. O workflow apaga os segredos temporários ao final. Para liberação pública, substituir por GitHub App com token curto e permissões mínimas para Variables, Actions e Secrets, com revogação verificada.

## Integração no monorepo
O protótipo é mantido em `stateless/` para revisão independente. O projeto Vercel existente continua usando os arquivos da raiz. Para testar este protótipo, configure **outro projeto Vercel** com Root Directory `stateless` e variáveis próprias; nenhuma flag ou ambiente do Installer atual deve ser reutilizado. Até OAuth/antirreplay e revisão de permissões, mantenha o endpoint de criação fora do público.
## Bloqueio adicional da rota de instalação (homologação)
A API `/api/launch` permanece **inativa por padrão** e aceita apenas um escopo de cliente explicitamente autorizado por prazo máximo de sete dias. São exigidas **todas** as variáveis `KAIROS_STATELESS_HML_ENABLE_LAUNCH=1`, `KAIROS_STATELESS_HML_GITHUB_OWNER`, `KAIROS_STATELESS_HML_REPOSITORY`, `KAIROS_STATELESS_HML_SUPABASE_ORG`, `KAIROS_STATELESS_HML_VERCEL_SCOPE` e `KAIROS_STATELESS_HML_EXPIRES_AT` (UTC ISO 8601). O código verifica os alvos exatos antes de realizar qualquer POST de criação.

**NÃO ATIVE ESSAS FLAGS EM UM SITE PÚBLICO SEM AUTENTICAÇÃO E CONTROLES DE ABUSO.** A allowlist evita destinos diferentes, mas qualquer visitante com tokens válidos ainda poderia enviar pedidos. Este protótipo não está pronto para disponibilização pública ou para células de produção. Os testes de GitHub Actions são simulados, e não provam o provisionamento real.
