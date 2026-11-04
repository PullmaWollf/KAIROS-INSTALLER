# KAIRÓS Installer — criação automática ponta a ponta

## Objetivo

O cliente conecta GitHub, Supabase e Vercel e informa os destinos e o nome
da célula. Com uma única autorização de custos, o KAIRÓS cria automaticamente:

1. Repositório privado GitHub a partir do template `PullmaWollf/KAIROS-CORE`
2. Projeto Supabase na organização autorizada do cliente, com senha aleatória
   guardada criptografada antes da requisição de criação
3. Migrações auditadas do KAIRÓS Core (bloqueio se o recurso não estiver pronto)
4. Projeto Vercel no espaço pessoal ou na equipe autorizada, conectado
   ao repositório GitHub recém-criado
5. Variáveis seguras, usuário administrador inicial, deploy e domínio
   `nome-da-celula.vercel.app`, sujeito à disponibilidade

## Execução sem navegador

A autorização de instalação vai para
`public.kairos_control_automation_jobs` no banco privado de controle.
Cada passagem pelo worker executa no máximo uma fase. O backend aplica
as travas exatas da homologação e não depende de sessão/cookie do cliente.

O workflow `.github/workflows/automation.yml` verifica a fila a cada 5 minutos
e processa até oito fases durante uma execução. O endpoint
`GET /api/automation/tick` exige um token **OIDC assinado pelo GitHub**,
válido por poucos minutos, vinculado ao identificador imutável deste
repositório, à branch `main`, ao workflow exato e ao endereço do endpoint.
O servidor verifica a assinatura RSA com a chave pública oficial do GitHub
em uma URL fixada no código. O token não é salvo, registrado nem mostrado ao
cliente. O GitHub Actions não recebe credenciais dos clientes; elas continuam
criptografadas no banco de controle. Nenhum segredo compartilhado precisa
ser criado ou copiado entre GitHub e Vercel.

Um claim atômico no Supabase evita que workers concorrentes iniciem a mesma
fase. Se uma criação remota responder de forma ambígua, o estado fica
`paused` para revisão — jamais repete automaticamente o POST. Apenas
`deploy` e `smoke` possuem reconciliação automática de leitura.

## Preparação administrativa (NÃO EXECUTADA NESTE PR)

1. Aplicar manualmente **somente** a migração aditiva revisada
   `control/migrations/20261104000000_automation_queue.sql` no projeto
   Supabase **kairos-installer-control**. Não executar no banco do AGAPE.
2. Confirmar que o workflow agendado possui permissão **id-token: write**.
   O token OIDC é solicitado automaticamente a cada execução, sem nenhum
   segredo permanente configurado nos dois serviços.
3. Registrar plano de homologação isolado no Installer, obtendo o UUID.
   Configurar os IDs exatos e o vencimento curto do
   `docs/homologacao-isolada.md`.
4. **Só após consentimento explícito para a criação real e possíveis custos**:
   configurar `KAIROS_AUTOMATION_ENABLED=1`, `KAIROS_CONTROL_ENABLE_WRITES=1`,
   `KAIROS_HOMOLOGATION_MODE=1`, `KAIROS_VERCEL_MANAGEMENT_ENABLED=1`,
   `KAIROS_ENABLE_BETA_SQL=1` e `KAIROS_ENABLE_GIT_DEPLOY=1`.
5. Homologar primeiro com contas e nomes descartáveis de teste;
   validar GitHub, Supabase, Vercel, DNS, login e PWA.

**Ao fazer merge deste PR, todas as flags existentes permanecem intocadas e
o executor está inerte.** Nenhum projeto, banco, repositório, domínio ou cobrança
é criado somente pelo merge.

## Limites

A API experimental de migração Supabase continua exigindo homologação.
Um recurso já reclamado e sem comprovação persistida exige revisão segura.
A execução periódica GitHub Actions pode ter alguns minutos de latência e
requer a configuração do segredo. Até que esses passos sejam concluídos,
o botão informa que a automação permanece bloqueada.
