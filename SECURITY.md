# Segurança do KAIRÓS Installer

O Installer v0.1 é um site estático. **Não digite senhas, chaves, PAT, service_role, tokens OAuth, cookies ou credenciais bancárias aqui.** Os campos coletam apenas nome, URL de repositório e project reference público.

A implantação do PWA acontece nas **contas do administrador da célula**, não nas contas do mantenedor. As instruções e os links levam aos provedores oficiais, onde a autenticação acontece diretamente.

Não são enviados dados para servidor de onboarding e o progresso não é persistido.

**Limitações:** o checklist depende de confirmação manual, não valida o banco, o deploy nem as permissões reais. Não considere uma instalação homologada apenas porque todas as etapas foram marcadas. Para relatar vulnerabilidades sem publicar segredos, contate privadamente o mantenedor pelo GitHub.

O projeto futuro com OAuth precisará proteger sessões, consentimento, escopos, tokens cifrados, CSRF, idempotência, rate limits e trilhas de auditoria.

## Diagnóstico dos provedores (v0.3)
O script `npm run providers:check` usa tokens locais para requisições **GET** às APIs oficiais de Supabase e Vercel. Nenhum token é coletado pela interface gráfica ou salvo em JSON. O diagnóstico limita a saída a identificadores não secretos, mas IDs de organizações/times ainda devem ser tratados com discrição em ambientes públicos. Verificar **acessibilidade não é verificar titularidade**, permissão de cobrança ou permissão de criar projetos. Antes de qualquer fluxo real de provisionamento, haverá checagem adicional de escopos, custos, autorizações e auditoria.

## Provisionamento controlado v0.4

`scripts/create-project.mjs` somente cria recursos após receber **--execute**, confirmação exata do destino (`--confirm-org` ou `--confirm-team`) e `--accept-billing`. Usa tokens **da célula no ambiente local**. Não imprime senhas, tokens ou resposta bruta do provedor. Timeout pode ocorrer **depois** da criação: antes de repetir, confira o painel para evitar duplicidade ou cobranças. A criação de projeto Supabase exige senha de banco forte, definida somente em `SUPABASE_DB_PASSWORD`. Tokens Supabase clássicos podem conceder acesso muito amplo: usar tokens com escopo quando disponíveis e revogar após concluir.

## v0.5 — Segurança na finalização

Os módulos de migração, variáveis privadas e status usam somente tokens locais da célula. O provisionador valida a origem GitHub clonada antes de aplicar SQL; a Vercel exige identificação exata do projeto/time e vínculo GitHub da célula, e **rejeita sobrescrita de variáveis existentes**. Não registra valores secretos, ainda não faz rollback nem verifica login em ambiente real. Uma publicação `READY` é apenas estado da Vercel e não equivale a aprovação de segurança. Leia `docs/FINALIZE.md`.

## v0.6 — Bootstrap e smoke tests

O cadastro inicial reutiliza o script do Core exclusivamente na cópia local da célula. A confirmação exige o **ref do Supabase** e valida que `SUPABASE_URL` corresponde a ele. A senha de ADM permanece em variável de ambiente local. Os smoke tests somente realizam GET em domínio HTTPS `*.vercel.app` e **não enviam cookies ou senhas**. A execução real ainda não foi homologada em provedores independentes.

## v0.8 — OAuth local e operações recuperáveis

O serviço OAuth experimental escuta **exclusivamente 127.0.0.1**, usa state aleatório, PKCE S256, sessão HttpOnly SameSite=Lax e redirecionamentos pré-definidos. Tokens de GitHub e Supabase ficam apenas em memória e não são expostos por endpoints HTTP. É uma prova de integração **local**, não um serviço público multicliente; não implemente acesso remoto por túnel, proxy ou host 0.0.0.0. Cada provedor requer client ID/secret próprios para ambiente de teste. OAuth da Vercel exige integração registrada e não foi ativado.

O orquestrador v0.8 registra tentativas **antes** de qualquer operação externa. Após timeout, crash ou erro de POST, evita repetição automática e devolve estado `needs-review`. A reconciliação lê recursos existentes, mas não prova que pertencem à tentativa anterior: só o administrador pode liberar uma revisão. O registro não é um banco distribuído e não garante rollback, deduplicação transacional nem sucesso após crash. Nunca armazene tokens/segredos no JSON de instalação.

## OAuth local com execução (incremento v0.8)

A execução pelo navegador é **opt-in** usando `KAIROS_ENABLE_LOCAL_OPERATIONS=1`, arquivos de estado definidos no processo e um formulário com CSRF, Origin estrito e aceite de custos. GitHub e Supabase utilizam **somente** os tokens da sessão OAuth em memória; valores preexistentes `GITHUB_TOKEN` e `SUPABASE_ACCESS_TOKEN` são ignorados no modo navegador. A operação executa uma etapa por requisição, nunca a instalação inteira silenciosamente. É experimental, somente `127.0.0.1`. OAuth hospedado e integração Vercel continuam pendentes.
