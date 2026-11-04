# Homologação isolada — KAIRÓS Installer

## Objetivo
O fluxo real de provisionamento **não pode** tocar a infraestrutura original do
ÁGAPE nem projetos do mantenedor. A homologação usa exclusivamente uma
conta GitHub descartável, uma organização Supabase autorizada e uma hospedagem
Vercel autorizada, com confirmação de possíveis custos pelo operador.

Este PR instala a camada de proteção. **Não ativa provisionamento, migrações,
gerenciamento Vercel ou deploy** e não cria nenhuma célula.

## Mecanismo de isolamento

`control/homologation-guard.js` executa dentro do endpoint autenticado de
instalação, antes de qualquer preflight remoto, claim persistente ou POST do
provisionador. Sem todas as condições abaixo, a operação falha:

- `KAIROS_CONTROL_ENABLE_WRITES=1` (chave global já existente, **manter 0**)
- `KAIROS_HOMOLOGATION_MODE=1` (**manter 0**)
- `KAIROS_HML_GITHUB_ID`: ID numérico do usuário de teste autenticado
- `KAIROS_HML_GITHUB_LOGIN`: login GitHub exato do usuário de teste
- `KAIROS_HML_SUPABASE_ORG_ID`: ID autorizado da organização de teste
- `KAIROS_HML_VERCEL_SCOPE`: ID interno do escopo pessoal ou de equipe
- `KAIROS_HML_REPOSITORY`: repositório *exato*, com prefixo `kairos-hml-`
- `KAIROS_HML_INSTALLATION_ID`: UUID exato de uma instalação já registrada
- `KAIROS_HML_EXPIRES_AT`: UTC ISO 8601, futuro, válido por no máximo 7 dias

A célula deve começar com `HML ` ou `HML-`, tornando o domínio solicitado
um subdomínio descartável de homologação. O mantenedor
`PullmaWollf` e sua equipe Vercel não podem ser alvos.

O ID da instalação só existe **depois do registro do plano no banco de controle**.
Por isso, primeiro registramos o plano sem escritas externas, auditamos
seus destinos e só em uma fase posterior, expressamente autorizada, se
configuram as variáveis e se ativa a execução real.

A inspeção pré-instalação mostra apenas indicadores e nomes de variáveis
faltantes; não revela IDs autorizados, tokens, chaves, senhas, nem permite
mudar as variáveis pelo navegador.

## Travas adicionais preexistentes

- Exige sessão GitHub autenticada, CSRF/origem e aprovação explícita dos custos
- Requer fase exata e que destinos do consentimento coincidam com o plano
- Mantém cada credencial criptografada, associada ao ID de seu proprietário
- Valida titularidade em preflight e nos resultados dos provedores
- Reivindica cada etapa atomicamente antes do POST; erro remoto ambíguo não
  autoriza nova tentativa automática
- Continua exigindo as flags específicas `KAIROS_VERCEL_MANAGEMENT_ENABLED`,
  `KAIROS_ENABLE_BETA_SQL` e `KAIROS_ENABLE_GIT_DEPLOY` para fases que as usem

## O que NÃO está homologado

Um diagnóstico somente de leitura **não prova** permissão para criar
repositório GitHub, projeto Supabase ou projeto Vercel. A criação real,
a compatibilidade das migrações Supabase, a integração GitHub–Vercel,
o primeiro deploy, o domínio e os testes reais do Core ainda precisam
de validação em recursos descartáveis — após autorização expressa.
O usuário não deve inserir dados de clientes reais na homologação.

Antes de habilitar qualquer flag em etapa futura: confirmar plano e possíveis
custos, confirmar os destinos pelo painel do cliente, validar a janela de
expiração e garantir rollback/revisão de operações incertas.
