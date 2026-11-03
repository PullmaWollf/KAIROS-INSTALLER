# KAIRÓS — plano de conclusão técnica antes da homologação

## Já implementado e verificado por CI
- Core PWA, API e controle de tentativas de login persistente
- Verificação `/api/health` sem revelar dados internos
- Orquestrador local de instalação com confirmação de contas e possíveis cobranças
- OAuth local GitHub/Supabase (exige registro de apps e testes reais)
- Clonagem GitHub da célula, criação de projetos Supabase/Vercel, migrações, bootstrap ADM, ambiente e deploy via hook
- Progresso durável, bloqueio de repetição após timeout, comprovantes de operações confirmadas
- Pré-diagnóstico local sem rede, smoke test e checagem cruzada Core/Installer

## Dependências externas indispensáveis
1. **OAuth Vercel**: registrar integração com os escopos de gerenciamento necessários; confirmar se os tokens emitidos permitem os endpoints de criação. A autenticação de identidade por Sign in with Vercel não deve ser confundida com autorização para criar projetos.
2. **OAuth GitHub e Supabase**: registrar aplicativos, callbacks, escopos mínimos e passar por autorização com usuário independente.
3. **Infraestrutura do próprio Installer**: escolher e configurar backend hospedado seguro com sessões, armazenamento transacional e cofre de credenciais; GitHub Pages sozinho não atende a OAuth multicliente.
4. **Homologação real**: executar a instalação numa conta de teste independente. Sem isso, não podemos confirmar cobranças, disponibilidade das APIs, deploy, banco, permissões e PWA nos dispositivos.
5. **Operação e LGPD**: acordar backup, retenção, resposta a incidentes, termos e privacidade antes de cadastrar membros de verdade.

## Bloqueios de qualidade não negociáveis
- Não marcar instalação como “100%” com base apenas em CI ou smoke tests.
- Não guardar tokens, chaves Supabase, senhas ou Deploy Hooks em arquivos de progresso, frontend, repositórios ou logs.
- Não repetir automaticamente criação de projetos quando ocorrer timeout ou resposta incerta.
- Não utilizar a conta GitHub, Vercel ou Supabase do mantenedor do KAIRÓS como destino dos recursos da célula.
- Revisar os privilégios do token Vercel antes de permitir qualquer criação pelo navegador.

O próximo passo, depois do desenvolvimento local, é configurar apps OAuth e um ambiente de homologação **isolado**. O AGAPE não precisa sofrer alterações.

## Identidade Vercel (incremento v0.9)

O OAuth local aceita opcionalmente `KAIROS_VERCEL_CLIENT_ID` e `KAIROS_VERCEL_CLIENT_SECRET`, obtidos de um aplicativo *Sign in with Vercel* registrado pelo responsável do Installer. Callback de laboratório: `http://127.0.0.1:43117/callback/vercel`.

**Atenção:** as permissões OIDC `openid email profile offline_access` identificam a pessoa, **não** concedem automaticamente permissão para criar projetos Vercel. O token de identidade é mantido apenas na RAM e **não é passado ao provisionador**. Para criação automatizada com OAuth será necessário registrar uma **Vercel API Integration**, definir escopos de leitura/escrita e homologar os consentimentos.
