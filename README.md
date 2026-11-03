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
KAIRÓS Installer (assistente estático; sem banco)
         │
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
5. **v0.5** — migrações, configuração de variáveis privadas e consulta de deploy por CLI local (código e testes, sem homologação real).
6. **v1** — OAuth consentido com provedores, validação de custos e provisionamento nas contas do cliente.
7. **v1+** — retomada segura e smoke tests completos idempotentes, testes de deploy, tratamento de erros e retomada segura.

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
