# KAIRÓS — passagem controlada para produção

## Estado atual
A arquitetura foi preparada para multi-inquilino. **Não é homologação real**.
Nenhuma implantação de cliente foi executada no GitHub, Supabase e Vercel.
A aplicação do Installer pode estar publicada, mas criação automática permanece
bloqueada enquanto as flags de produção não estiverem ativadas.

## Modos exclusivos
- **Homologação:** `KAIROS_HOMOLOGATION_MODE=1`, escopo exato de **uma** instalação HML,
  expiração de no máximo 7 dias, sem afetar o mantenedor
- **Produção:** `KAIROS_PRODUCTION_MODE=1`, homologação desativada,
  e consentimento específico e persistido **para cada instalação/cliente**
- Com os dois modos ligados, nenhuma execução é permitida; com os dois
  desligados, nenhuma execução é permitida
- A configuração global de escrita, sozinha, **nunca** concede autorização

## Recursos do cliente
- GitHub: usuário autenticado como proprietário. Cada repositório privado
  deve começar com `kairos-` e não pode ser `kairos-hml-`
- Supabase: projeto criado na organização selecionada com a credencial
  do titular, nunca no projeto antigo ÁGAPE
- Vercel: projeto na hospedagem pessoal/equipe selecionada pelo titular,
  nunca na equipe proprietária do Installer
- Configuração da conexão Vercel/integração GitHub deve garantir acesso
  ao repositório privado criado. **Ainda precisa de teste real**
- Custos e regras de uso comercial dos provedores são responsabilidade do
  titular da infraestrutura. Criar recursos pode ser cobrado

## Uma autorização para criar; execução controlada
1. Usuário entra com GitHub, conecta Supabase e sua Vercel
2. Preenche o nome da célula; o Installer sugere um repositório
3. Consulta as contas em modo somente leitura
4. Registra o plano no banco de controle, sem criação externa
5. Confirma alvos e possíveis cobranças, uma vez, por instalação
6. RPC `kairos_control_automation_enqueue_production` verifica o
   proprietário, destinos, expiração, progresso e uma instalação ativa por
   usuário
7. O executor autenticado pelo GitHub Actions OIDC pega um lease
   e realiza **uma** etapa por iteração. Nenhuma criação incerta é repetida
8. A rota manual de execução de fases é bloqueada em produção, evitando
   concorrência com o executor
9. Operações incertas ficam pausadas para verificação; não são
   automaticamente repetidas

## Preparação de infraestrutura
- Aplicar `control/migrations/20261104000000_automation_queue.sql` e
  `control/migrations/20261104000001_production_tenant_automation.sql`
  **somente** no Supabase privado `kairos-installer-control`
- O agendador `.github/workflows/automation.yml` usa OIDC do GitHub;
  não exige token estático no runner
- Liberar `KAIROS_PRODUCTION_MODE=1`, `KAIROS_AUTOMATION_ENABLED=1`,
  `KAIROS_CONTROL_ENABLE_WRITES=1`, `KAIROS_VERCEL_MANAGEMENT_ENABLED=1`,
  `KAIROS_ENABLE_BETA_SQL=1`, `KAIROS_ENABLE_GIT_DEPLOY=1` **somente
  depois da homologação real autorizada e da revisão de limites/custos**
- Manter `KAIROS_HOMOLOGATION_MODE=0` em produção
- Monitorar estados pausados, falhas, expiração de credenciais e a
  qualidade do deploy; revogar tokens de teste ao encerrar

## Critérios de liberação comercial (pendentes)
- [ ] Autorização de criação real nos três provedores com conta descartável
- [ ] GitHub realmente gera repositório privado do template
- [ ] Supabase cria projeto, disponibiliza DB e aplica migrações auditadas
- [ ] Vercel consegue integrar repositório privado e publicar o Core
- [ ] Validação de domínio, HTTPS, login ADM, sessão, PWA, mobile, RLS
- [ ] Teste real de falha/interrupção com retomada e ausência de duplicatas
- [ ] Revisão de cobrança, limites, termos de uso comercial e suporte
- [ ] Teste de revogação de credenciais e isolamento entre dois clientes
- [ ] Validação de build/deploy de produção Vercel sem limite ou erro

**Não afirmar que a instalação comercial está homologada antes desta lista.**
