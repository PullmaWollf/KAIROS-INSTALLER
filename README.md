<div align="center">

# 🚀 KAIRÓS Installer
### O instalador da sua célula, usando suas próprias contas.

**GitHub · Supabase · Vercel · Implantação independente**

[![Tests](https://github.com/PullmaWollf/KAIROS-INSTALLER/actions/workflows/quality.yml/badge.svg)](https://github.com/PullmaWollf/KAIROS-INSTALLER/actions/workflows/quality.yml)

[Instalação](#como-usar) · [Código-base KAIRÓS](https://github.com/PullmaWollf/KAIROS-CORE) · [Segurança](SECURITY.md) · [Plano de automação](docs/AUTOMATION.md)

</div>

---

## O que faz o Installer?

Este projeto é o **assistente de implantação do KAIRÓS**, um PWA de gestão de células cristãs. A proposta é que **cada célula tenha seus próprios serviços**, sem consumir os limites nem gerar cobranças no Supabase e Vercel do mantenedor.

```text
KAIRÓS Installer (Vercel + Supabase exclusivos do controle)
         │ OAuth, sessões cifradas, progresso e auditoria
         ├── GitHub da célula → cópia do KAIRÓS Core
         ├── Supabase da célula → banco PostgreSQL próprio
         └── Vercel da célula → deploy PWA próprio
```

**Importante:** o assistente visual é **guiado**. Desde a v0.2 existe também um **provisionador de repositório GitHub**, executado no computador do administrador, com pré-verificação e consentimento explícito. Também há adaptadores locais para criar projetos **Supabase e Vercel**, mediante consentimento, com simulação por padrão. A versão **v0.5** inclui migração Supabase via CLI local, configuração de variáveis privadas Vercel e consulta ao status de publicação. **Nenhuma dessas operações foi homologada em projeto real; não há deploy automático final.** Ele ajuda a configurar o processo e fornece comandos específicos do projeto do administrador. Não recebe chaves secretas.

## Provisionamento GitHub com validação (v0.2)

O primeiro recurso automatizável é **criar uma cópia privada do KAIRÓS Core no GitHub da própria célula**. Nunca usamos a conta do mantenedor como destino.

1. Baixe o Installer (`git clone`) e tenha Node.js 24.
2. Copie `examples/installation-plan.example.json` para `installation-plan.json` e preencha **somente** login GitHub da célula, nome do repositório, nome da célula e visibilidade. Não inclua senhas ou tokens.
3. Confira o plano sem acesso externo:

```bash
node scripts/provision.mjs --plan installation-plan.json
```

4. Crie um token GitHub na **conta da célula**, com privilégios mínimos exigidos pela API de template. Guarde-o apenas na variável de ambiente `GITHUB_TOKEN` no terminal local — nunca no JSON ou na interface pública. Execute:

```bash
node scripts/provision.mjs --plan installation-plan.json --preflight
```

5. Após confirmar titularidade, visibilidade e permissões, execute **uma única vez**:

```bash
node scripts/provision.mjs --plan installation-plan.json --execute --confirm-owner SEU-LOGIN
```

O comando confirma a identidade da conta e que o Core é um template válido. Sem `--execute`, **nenhum repositório é criado**. Para este recurso funcionar, o mantenedor precisa ativar *Template repository* nas configurações do `KAIROS-CORE`.

Leia [docs/PROVISIONER.md](docs/PROVISIONER.md) para segurança e limites do projeto.

## Diagnóstico de provedores (v0.3 — somente leitura)

Há agora um **pré-diagnóstico local** das contas de Supabase e Vercel: verifica se as credenciais do administrador conseguem enxergar a organização Supabase e o time Vercel escolhidos. **Não cria projetos, não recupera chaves de aplicações, não comprova titularidade de faturamento e não consome os limites de infraestrutura do mantenedor.**

No terminal do **próprio administrador da célula**, defina `SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`, `KAIROS_SUPABASE_ORG_ID` e `KAIROS_VERCEL_TEAM_ID` como variáveis de ambiente locais, sem commit nem envio pelo site. Depois execute:

```bash
npm run providers:check
```

O diagnóstico só envia requisições de leitura aos provedores oficiais, sem registrar tokens ou conteúdos sigilosos. Leia [o guia de validação](docs/PROVIDER-PREFLIGHT.md).

## Criação de projetos na própria conta (v0.4)

A nova CLI implementa chamadas de criação via APIs oficiais do **Supabase** e da **Vercel**. Por segurança, executa apenas **simulação** se não receber `--execute`. Cada criação é **uma operação separada**, confirmada no terminal pelo administrador da célula, com aceite expresso de possíveis cobranças.

```bash
npm run projects:help
```

Para prosseguir, consulte [Guia de provisionamento dos provedores](docs/CREATE-PROJECTS.md). **Não coloque tokens ou senhas no navegador, em arquivos versionados ou nesta conversa.** A criação dos projetos não significa que o app foi publicado: migrações, credenciais e implantação continuam pendentes.

## Finalização controlada da instalação (v0.5)

Com a cópia do Core, o projeto Supabase e a Vercel **da célula** já criados, o administrador pode usar a CLI local para:
- Executar `supabase db push` com prévia e confirmação do project ref.
- Enviar `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` e `SESSION_SECRET` **somente** para o projeto Vercel previamente validado, sem sobrescrever variáveis existentes.
- Consultar o status de deployments de produção, sem afirmar que o PWA está homologado.

```bash
npm run finalize:help
```

**[Guia completo da v0.5](docs/FINALIZE.md)**. O padrão é simulação sem acesso à rede. Operações reais exigem `--execute`, confirmação dos IDs e tokens exclusivos da célula no terminal privado.

## Bootstrap e verificação do PWA (v0.6)

A CLI agora disponibiliza `--action bootstrap` para criar **o primeiro ADM** executando o script de segurança do Core **na cópia local da célula**, e `--action smoke` para testar apenas endpoints públicos e a proteção de uma rota privada no endereço HTTPS `*.vercel.app`. Não envia senhas para a URL pública e não testa login com credenciais. Leia [docs/FINALIZE.md](docs/FINALIZE.md).

A v0.6 também corrige o fluxo de migração Supabase: vincula explicitamente o projeto via `supabase link --project-ref` antes de `supabase db push --linked`. **As operações reais ainda dependem de homologação numa instalação isolada.**

## Fluxo de instalação recuperável (v0.7)

O **KAIRÓS Workflow** agora acompanha todas as oito etapas da instalação com registro **local**. O arquivo armazena somente nomes e IDs não secretos, timestamps e confirmações **manuais**. Ele impede fases fora de ordem, sobrescritas de destino e atualização simultânea com registros desatualizados. **Não realiza uma instalação automática de ponta a ponta, nem confirma que uma operação realmente ocorreu.**

```bash
npm run workflow:help
```

Leia o guia [Workflow v0.7](docs/WORKFLOW.md) para iniciar, continuar após interrupções e conferir o próximo passo. As operações reais continuam exigindo os comandos específicos do provisionador com consentimento. Uma marcação `attested` é apenas declaração do administrador, não homologação.

## v0.8 — OAuth local, execução encadeada e recuperação conservadora

**Três frentes técnicas iniciadas:** (1) OAuth no navegador **local** para GitHub e Supabase, utilizando PKCE, state, cookies HttpOnly e tokens apenas em memória; (2) comando `scripts/operate.mjs` para tentar percorrer as oito fases em sequência, com confirmação explícita de contas/custos; (3) reconciliação **somente por leitura** e registro de tentativas antes dos efeitos externos para bloquear duplicidades depois de falhas.

```bash
npm run oauth:local
npm run operate:help
```

Consulte **[Guia técnico da v0.8](docs/AUTOMATION-V08.md)**. O modo padrão não acessa a rede nem cria recursos.

**Limites importantes:** as sessões OAuth podem acionar **uma fase por vez no servidor local**, com o modo explícito `KAIROS_ENABLE_LOCAL_OPERATIONS=1`; a CLI independente ainda usa tokens no ambiente. É necessário registrar aplicativos OAuth nos provedores, e a conexão Vercel exigirá integração própria. O fluxo integrado ainda exige a cópia Core clonada para aplicar migrações e aguarda deploy atualizado; não existe instalação de um clique nem homologação real.

## Publicar sem usar Supabase ou Vercel do mantenedor

Este Installer é **100% estático**. O dono do projeto pode hospedá-lo no **GitHub Pages**, sem banco, storage, tokens ou funções de servidor. Siga [o guia GitHub Pages](docs/PUBLISH.md). Cada aplicativo gerado continua usando as contas próprias da célula.

## Como usar

Abra `index.html` usando um servidor local HTTP ou publique como site estático:

```bash
npm test
npm run dev
```

Depois acesse `http://localhost:4173` e percorra as **seis etapas**.

| Etapa | Resultado |
|---|---|
| 1. Identidade | Nome da célula e slug sugerido |
| 2. GitHub | Repositório do KAIRÓS Core sob controle do administrador |
| 3. Supabase | Projeto novo na conta da célula |
| 4. Banco | Migrações e criação inicial do ADM em ambiente local |
| 5. Vercel | Implantação na conta da célula e configuração segura das variáveis |
| 6. Checklist | Verificação de login, permissões, PWA e isolamento |

O app não salva o progresso fora da sessão da página e não valida automaticamente dados de infraestrutura. A checagem de conclusão depende do usuário.

## Arquitetura

- HTML, CSS e JavaScript ES Modules.
- Sem backend, sem banco de dados e sem autenticação própria nesta versão.
- Nenhum token ou senha solicitado; os usuários acessam os provedores diretamente.
- Validação dos campos e comandos preparados por funções puras em `wizard.js`.
- Testes usando `node:test`; GitHub Actions executa o CI a cada push/PR.
- Pronto para hospedagem estática no GitHub Pages ou similar, após configuração do responsável.

## Qual repositório devo instalar?

O KAIRÓS distribuído às células está em **[KAIROS-CORE](https://github.com/PullmaWollf/KAIROS-CORE)**, não neste repositório. O Installer serve somente para orientar a instalação.

## Roadmap de automação

1. **v0.1** — assistente web sem segredos (entregue).
2. **v0.2** — provisionamento GitHub com confirmação local (entregue, execução real ainda não homologada).
3. **v0.3** — verificação local read-only de organizações Supabase e times Vercel (entregue; sem deploy).
4. **v0.4** — criação controlada dos projetos Supabase/Vercel por CLI (sem homologação real).
5. **v0.5** — migrações, variáveis privadas e consulta de deploy por CLI local (sem homologação real).
6. **v0.6** — bootstrap ADM e smoke test público sem enviar credenciais (código e testes).
7. **v0.7** — acompanhamento das oito etapas, retomada, bloqueio de ordem e registro local sem segredos (código e testes).
8. **v0.8** — execução sequencial opt-in, OAuth local GitHub/Supabase e recuperação fail-closed (código e testes; sem homologação real).
9. **v1** — OAuth hospedado e integrado consentido com provedores, validação de custos e provisionamento nas contas do cliente.
10. **v1+** — automação ponta a ponta e integração com servidor seguro e smoke tests completos idempotentes, testes de deploy, tratamento de erros e retomada segura.

A automação integral ainda depende das APIs, escopos OAuth, termos dos serviços e regras de faturamento. Não serão utilizadas credenciais do mantenedor para criar infraestrutura de terceiros.

## Desenvolvimento

```bash
git clone https://github.com/PullmaWollf/KAIROS-INSTALLER.git
cd KAIROS-INSTALLER
npm test
npm run dev
```

**Contribuição e licenciamento:** consulte [CONTRIBUTING.md](CONTRIBUTING.md) e [LICENSE-DECISION.md](LICENSE-DECISION.md).

---

<div align="center"><strong>KAIRÓS</strong> · Sua célula, sua identidade, sua infraestrutura.</div>

## Compatibilidade com o Core e liberação

O Installer já executa **verificação cruzada em CI** com o repositório público do Core, conferindo API, segurança do login, migrações, bootstrap e PWA. Veja **[Contrato dos repositórios](docs/COMPATIBILITY.md)**.

O bootstrap instala dependências fixadas do Core sem executar scripts de lifecycle (`npm ci --ignore-scripts`). O smoke test verifica API pública, sessão anônima, manifesto, HTML e Service Worker. Isso ainda não comprova login ADM, políticas do banco nem instalação real em celulares: siga os **[critérios de produção do Core](https://github.com/PullmaWollf/KAIROS-CORE/blob/main/docs/PRODUCTION-READINESS.md)**.

## v0.9 — Prontidão antes de homologar

A versão 0.9 inclui **pré-diagnóstico local sem chamadas remotas**, recuperação de operações confirmadas com comprovantes mínimos não secretos, inspeção de migrações obrigatórias no Core, endpoint `/api/health` validado no smoke test e painel local para acompanhar a instalação (quando o servidor OAuth tiver um estado configurado).

```bash
npm run readiness:help
node scripts/readiness.mjs --config workflow.local.json --phase github --check-core
```

O diagnóstico **não obtém credenciais automaticamente** e não habilita operações sem autorização. As etapas reais continuam dependendo de contas e permissões individuais dos provedores. Não é aprovação de produção.

Veja [pré-homologação](docs/PRE-HOMOLOGATION.md) para os bloqueios que só podem ser concluídos com autorização/configuração do administrador.

## Instalador integrado — primeira release candidate

O **backend do Installer** agora está implementado no próprio repositório e preparado para hospedagem em **projetos Vercel e Supabase exclusivos do controle**, sem reutilizar o AGAPE. Inclui:

- Login OAuth GitHub, conexão Supabase e Vercel com state/PKCE, sessão HttpOnly/CSRF e tokens cifrados;
- Painel responsivo em `/app.html` com contas, cadastro de instalação e oito fases;
- Controle transacional em PostgreSQL para reservar fases e bloquear repetições de POST após timeout;
- Motor de API para GitHub, Supabase, migrações auditadas, Vercel, ADM, deploy e testes, mediante permissões e consentimento;
- Recuperação automática somente quando há evidência por leitura (deployment/smoke), e entrega única da senha temporária do primeiro administrador;
- Testes de contrato e simulação de oito fases em CI.

**O código está em fase pré-homologação.** Ainda precisa de implantação dos projetos dedicados ao Installer, configuração das três OAuth Apps, escopos da Vercel, validação do endpoint SQL Beta e testes reais em conta de laboratório. O modo que cria recursos permanece **desativado por padrão**.

**[Guia completo de implantação do Installer](docs/HOSTED-INSTALLER.md)** · **[Modelo de riscos](docs/CONTROL-THREAT-MODEL.md)**.

A versão estática anterior continua acessível por `index.html` e não solicita credenciais. Para OAuth e instalações coordenadas, **hospede o backend em HTTPS com os segredos apenas no servidor**; o GitHub Pages isolado não suporta essa operação.
