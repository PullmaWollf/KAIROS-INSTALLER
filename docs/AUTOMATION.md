# Projeto técnico: provisionamento automático BYO

## Objetivo
Onboarding autorizável e replicável, criando **projetos e recursos sob a titularidade da própria célula**.

## Fase inicial implantada
Wizard web estático que ensina a criar GitHub, Supabase e Vercel próprios, copia comandos, valida parâmetros básicos e gera URLs de implantação. Não pede tokens nem envia dados a backend.

## Etapa de OAuth — não implementada
Uma integração futura poderá usar consentimento dos provedores para:
- Criar repositório a partir do template `KAIROS-CORE` na conta escolhida.
- Escolher organização e criar novo projeto Supabase na conta da célula (dependente das APIs e políticas vigentes).
- Aplicar migrações e gerar bootstrap seguro no projeto da célula.
- Criar o projeto Vercel da célula associado ao repositório e configurar variáveis privadas.
- Acompanhar deploy, registrar resultados e executar smoke tests.

## Arquitetura de segurança planejada
1. Fluxos OAuth com state/PKCE quando aplicável, escopos mínimos e revogação.
2. Backend exclusivo do Installer, com proteção contra CSRF, abuso e replay.
3. Cofre de credenciais temporárias cifradas; nunca enviar tokens ao frontend ou URLs.
4. Consentimento explícito antes de criar projetos, potencialmente sujeitos a cobrança.
5. Fila idempotente, rastreamento de status e reversão/recuperação de operações parciais.
6. Nenhuma infraestrutura de célula provisionada na conta do proprietário do KAIRÓS.
7. Retenção mínima, LGPD, logs expurgados e nenhuma informação sensível em analytics.

## Dependências externas
A criação de contas em nome de novos usuários continua exigindo interação do usuário com os provedores. O provisionamento efetivo via APIs depende de recursos, autorizações, limites e termos disponíveis. Não prometer um clique antes de testes oficiais com contas independentes.

Referências:
- https://vercel.com/docs/deploy-button
- https://vercel.com/docs/rest-api
- https://supabase.com/docs/guides/deployment/database-migrations
- https://supabase.com/docs/reference/api/introduction
- https://docs.github.com/en/rest/repos/repos#create-a-repository-using-a-template

## Incremento implementado v0.2 — criação do GitHub

O provisionador local em `provisioner/` e `scripts/provision.mjs` permite simular plano, confirmar identidade e gerar repositório a partir do template oficial usando token do **próprio cliente** definido localmente. A verificação rejeita qualquer destino sob a conta do mantenedor. Não há backend nem sessão OAuth; o token não sai da máquina do cliente exceto para a API do GitHub, ao executar os comandos explicitamente.

**Pendente:** ativar o marcador *Template repository* no KAIROS-CORE; criar identidade OAuth hospedada para futuras operações; Supabase/Vercel só com autorização e consentimento de custos. O CLI não está conectado à interface gráfica do assistente.
