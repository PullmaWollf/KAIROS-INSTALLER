# Validação independente dos provedores — v0.3

Este diagnóstico é **somente leitura** e executado no computador do administrador da célula. Não utilize tokens do mantenedor do KAIRÓS e não cole nenhuma credencial no assistente web, GitHub, chats, screenshots ou arquivos versionados.

## Passo a passo (PowerShell)

1. Crie uma conta Supabase e uma conta Vercel **da sua célula**.
2. Crie, se necessário, uma organização Supabase e um time Vercel na sua conta. Confirme limites e eventuais cobranças diretamente nos painéis.
3. Gere credenciais temporárias de acesso às APIs **nas suas próprias contas**, com as permissões mínimas compatíveis com as APIs de leitura. Consulte a documentação oficial de cada serviço.
4. Defina no mesmo terminal, sem guardar em arquivo:

```powershell
$env:SUPABASE_ACCESS_TOKEN = "<TOKEN-SUPABASE-DA-CELULA>"
$env:VERCEL_TOKEN = "<TOKEN-VERCEL-DA-CELULA>"
$env:KAIROS_SUPABASE_ORG_ID = "<ID-ORGANIZACAO-SUPABASE>"
$env:KAIROS_VERCEL_TEAM_ID = "<ID-TIME-VERCEL>"
npm run providers:check
```

Os valores entre `<...>` são **placeholders**, não comandos literais. Não copie tokens reais para uma conversa.

5. O resultado indica acessibilidade da organização/time e informa `ownership: not-verified`. Nenhum projeto é criado.
6. Remova os tokens da sessão PowerShell ou feche o terminal; revogue os tokens temporários se não houver mais necessidade.

## Garantias do diagnóstico

- Supabase: consulta **GET** `https://api.supabase.com/v1/organizations`.
- Vercel: consulta **GET** `https://api.vercel.com/v2/user` e `GET /v2/teams?limit=100`.
- Não faz chamadas de criação, edição, exclusão ou leitura de dados das células.
- Tokens são enviados apenas nas requisições oficiais HTTPS, e não aparecem no resultado.
- Não pressupõe que a conta é a proprietária do time/organização nem que a cobrança está habilitada.
- Somente a conta do administrador deve realizar as operações. Contas de terceiros não são autorizadas automaticamente.

## Limitações

- A listagem Vercel usa até 100 times: se o time não estiver no resultado, o diagnóstico falha de maneira conservadora.
- Pode haver alterações futuras nas APIs oficiais; conferir contratos e respostas antes de habilitar operações POST.
- Ainda não existem OAuth, gestão de tokens em servidor, provisionamento de Supabase/Vercel, migrações automáticas ou criação remota do administrador.
- **Nunca executar este script com tokens do AGAPE ou da conta Supabase/Vercel do mantenedor do KAIRÓS**.

Fontes oficiais:
- https://supabase.com/docs/reference/api/introduction
- https://vercel.com/docs/rest-api
