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

**Importante:** atualmente o assistente é **guiado**, não executa provisionamento automático por API. Ele ajuda a configurar o processo e fornece comandos específicos do projeto do administrador. Não recebe chaves secretas.

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
2. **v0.2** — UX de diagnóstico e hospedagem pública, sem criar recursos na conta do mantenedor.
3. **v1** — OAuth consentido com provedores, validação de custos e provisionamento nas contas do cliente.
4. **v1+** — migrações idempotentes, testes de deploy, tratamento de erros e retomada segura.

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
