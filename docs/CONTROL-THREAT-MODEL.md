# Riscos e controles do KAIRÓS Installer

| Risco | Controle no código | Verificação ainda necessária |
|---|---|---|
| Uso indevido das contas do mantenedor | Rejeição do owner `PullmaWollf`, seleção explícita de organização/time | Testar autorizações em contas independentes |
| Roubo de token OAuth via frontend | AES-256-GCM no backend, sessão opaca HttpOnly, nenhum token na resposta | Revisão de logs, rotação da chave, proteção de backups |
| Cross-site request forgery | Origin fixo e token CSRF por sessão | Testes no domínio Vercel real |
| Estado OAuth falsificado | State aleatório, PKCE S256, cookie autenticado e prazo de 10 minutos | Conferir callbacks e escopos reais |
| Confusão de contas | GitHub ID persistido; filtros por ID; validação de owner e org/time | Teste de duas células em usuários diferentes |
| Repetir criação após timeout | RPC transacional que recusa etapa já iniciada | Simulação de timeout durante POST real |
| SQL arbitrário remoto | Migrações imutáveis copiadas do Core e verificadas por contrato em CI | Homologar API experimental Supabase |
| Impedir revogação | Sessões expiradas; logout encerra sessão | Criar rotinas de revogação de autorizações e retenção |
| Vazamento de senha de ADM | Senha gerada no servidor, hash scrypt no Core, entrega de uso único | Conferir fim do ciclo e rotação de senha |
| Vercel apenas identidade OIDC | Escritas bloqueadas por padrão até app com permissão de gerenciamento | Verificar scopes e instalação Vercel |
| Uso de dados sensíveis sem LGPD | Backend de controle não contém dados operacionais das células | Política de retenção e contratos dos responsáveis |

**Não habilitar recursos de criação remota para usuários externos sem revisar as configurações e executar uma homologação isolada.**
