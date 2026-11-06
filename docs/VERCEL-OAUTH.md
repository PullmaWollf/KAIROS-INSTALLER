# Conexão Vercel pelo navegador (Integration OAuth)

## Por que não é apenas “Sign in with Vercel”?

O login OIDC identifica o usuário, mas a autorização para APIs que gerenciam projetos pode ter restrições. O KAIRÓS precisa de uma **Vercel Integration**, com acesso explicitamente consentido e escopos de API necessários para provisionar projetos. Isso substitui o formulário manual de token no fluxo principal do usuário.

Referências:
- https://vercel.com/docs/integrations/create-integration
- https://vercel.com/docs/integrations/create-integration/vercel-api-integrations
- https://vercel.com/docs/integrations/create-integration/submit-integration
- https://vercel.com/docs/sign-in-with-vercel/scopes-and-permissions

## Preparação única do proprietário do KAIRÓS Installer

1. Abra a **Integrations Console** da Vercel, na conta que administrará o Installer. Crie uma *Integration* com slug exclusivo (a conta dos clientes não precisa criar integração).
2. Configure o Redirect URL de instalação exatamente como `https://SEU-DOMINIO-DO-INSTALLER/api/auth/callback`. O domínio precisa corresponder a `KAIROS_INSTALLER_PUBLIC_ORIGIN`.
3. Configure os escopos da integração **com as permissões mínimas exigidas para os endpoints realmente usados**: leitura de conta/equipe, criação/consulta de projeto, implantação, variáveis globais do projeto e domínio. A Vercel exige permissões de escrita para projeto e domínio na associação de domínios. Não marque permissões sem necessidade.
4. Configure, no **servidor**, `KAIROS_VERCEL_INTEGRATION_SLUG`, `KAIROS_VERCEL_CLIENT_ID` e `KAIROS_VERCEL_CLIENT_SECRET`. Mantenha o último valor em variáveis secretas, nunca no repositório ou navegador.
5. A Vercel pode exigir verificação/aceite de termos específicos para a Integration. Complete no painel do proprietário do Installer, sem colocar as credenciais de clientes no servidor do mantenedor.
6. Rode `npm run check` e `npm test`. Depois valide a autorização pela conta descartável `OKARAKIMOTO` **antes** de liberar provisionamento remoto.

## Fluxo esperado para a célula

1. Entre com GitHub no KAIRÓS e clique em **Conectar minha Vercel**.
2. O KAIRÓS redireciona para `https://vercel.com/integrations/<slug>/new?state=...`.
3. A Vercel solicita o escopo/equipe autorizados e redireciona ao callback do Installer com `code` e `state`.
4. O Installer valida `state`, a sessão GitHub e o uso único do callback; troca o código no endpoint oficial `/v2/oauth/access_token`, exclusivamente no servidor.
5. O backend verifica o destino com **GET** nas APIs Vercel e salva o token de integração cifrado na conexão pertencente àquela conta GitHub. O token nunca retorna para o navegador.
6. O painel mostra a hospedagem vinculada. Desconectar encerra o uso dessa conexão pelo Installer; revogar a Integration na Vercel é uma ação separada.

## Restrições

- **Não executa provisionamento** na autorização. A criação de projetos exige consentimento de custos e guardas do ambiente.
- `OKARAKIMOTO` é usada **somente em homologação**; em produção cada usuário instala a integração nas próprias contas Vercel/GitHub/Supabase.
- A instalação completa só é homologada depois de testar GitHub, banco, Vercel, deploy, variáveis, login ADM e PWA.
- Uma Integration ainda pode não conseguir importar um repositório se a integração GitHub ↔ Vercel não estiver autorizada; a interface já oferece diagnóstico.
- O método antigo de conexão manual permanece disponível no backend para compatibilidade de instalações existentes, mas **não aparece no painel principal**. É um fallback temporário sujeito a remoção posterior.
