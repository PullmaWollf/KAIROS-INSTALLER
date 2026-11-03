# KAIRÓS Installer v0.7 — fluxo recuperável

O novo módulo `scripts/workflow.mjs` oferece **acompanhamento local de oito etapas** e retomada após interrupções. Ele **não** cria ou altera recursos remotos; para isso, use os comandos isolados descritos nos guias de provisionamento anteriores, com confirmação e tokens próprios da célula.

## 1. Preparar o fluxo

No computador do administrador, instale Node.js 24 e baixe o `KAIROS-INSTALLER`.

```powershell
Copy-Item examples/workflow.example.json workflow.local.json
notepad workflow.local.json
node scripts/workflow.mjs --init --config workflow.local.json --state .kairos-install/celula.json
node scripts/workflow.mjs --status --state .kairos-install/celula.json
```

O arquivo de configuração contém **apenas identificadores não secretos**. Preencha `owner` com o GitHub da própria célula, `supabaseOrgId` e `vercelTeamId` com as organizações escolhidas pela célula, `coreDir` com a pasta local da cópia do Core e `adminLogin` com seu login de ADM. **Não** coloque senhas, tokens, service_role ou `SESSION_SECRET`. Os arquivos `workflow.local.json` e `.kairos-install/` são ignorados pelo Git.

Se o estado já existe, `--init` recusa sobrescrever. Use `--status` para continuar.

## 2. Etapas e dependências

| Ordem | Etapa | Como concluir de verdade | Evidência registrada |
|---|---|---|---|
| 1 | github | `scripts/provision.mjs` com preflight/consentimento | Marcação manual |
| 2 | supabase | `scripts/create-project.mjs --provider supabase` | Marcação manual |
| 3 | migrate | `scripts/finalize.mjs --action migrate` | Marcação manual |
| 4 | vercel | `scripts/create-project.mjs --provider vercel` | Marcação manual |
| 5 | env | `scripts/finalize.mjs --action env` | Marcação manual |
| 6 | bootstrap | `scripts/finalize.mjs --action bootstrap` | Marcação manual |
| 7 | deploy | Publicar/retomar o deployment na Vercel e validar status | Marcação manual |
| 8 | smoke | `scripts/finalize.mjs --action smoke` | Marcação manual |

**Marcar não executa a operação.** Use os guias [PROVISIONER](PROVISIONER.md), [CREATE-PROJECTS](CREATE-PROJECTS.md) e [FINALIZE](FINALIZE.md) para realizar as ações reais.

Após confirmar no painel do serviço que a etapa correspondente foi realmente concluída:

```powershell
node scripts/workflow.mjs --mark github --confirm-step github --state .kairos-install/celula.json
```

O histórico guarda `attested`, nunca `verified` ou `homologated` apenas por uma confirmação manual.

## 3. Registrar IDs retornados pelos provedores

Após criar o projeto Supabase:

```powershell
node scripts/workflow.mjs --set-target supabaseRef=abcdefghijklmnopqrst --state .kairos-install/celula.json
```

Após criar o projeto Vercel:

```powershell
node scripts/workflow.mjs --set-target vercelProjectId=prj_EXEMPLO1234 --state .kairos-install/celula.json
```

Após o deploy, registre a origem HTTPS real da célula:

```powershell
node scripts/workflow.mjs --set-target pwaUrl=https://minha-celula.vercel.app --state .kairos-install/celula.json
```

Depois confirme as etapas respectivas com `--mark <etapa> --confirm-step <etapa>`. Confira `--status` antes de continuar. IDs já registrados **não podem ser substituídos** na instalação existente: em caso de destino errado, interrompa e investigue, em vez de tentar corrigir silenciosamente.

## 4. Recuperação de interrupções

Se a rede cair durante uma criação, consulte **o painel do provedor** antes de repetir o comando. A operação pode ter sido concluída mesmo quando a CLI informou timeout. O Workflow nunca repete ações remotamente por conta própria.

A escrita do registro usa arquivo temporário, lock local e conferência de versão esperada para evitar sobrescritas simultâneas. Contudo, **não é um banco de dados transacional distribuído**, nem detecta mudanças realizadas diretamente no GitHub/Supabase/Vercel.

Não apague `.kairos-install/celula.json` para forçar reexecução de operações: primeiro identifique o estado real dos recursos.

## 5. O que falta

- Integração do frontend a um backend OAuth seguro.
- Provisionamento automático orquestrado de verdade, com trilha de auditoria e idempotência junto aos provedores.
- Implantação real homologada, smoke test de login/permissões e backups.
- Armazenamento central seguro, criptografia e tratamento de falhas de várias instalações paralelas.

**Importante:** o estado de 100% do Workflow não significa que a instalação foi aprovada para produção. Significa que **todas as oito etapas foram declaradas concluídas manualmente**.
