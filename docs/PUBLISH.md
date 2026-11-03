# Publicar o KAIRÓS Installer no GitHub Pages

A publicação do **Installer** pode acontecer num site estático, **sem Supabase ou Vercel**. Isso não publica o CORE das células — cada instalação do CORE continua isolada em suas próprias contas.

## Primeiro deploy

1. Abra https://github.com/PullmaWollf/KAIROS-INSTALLER/settings/pages (exige acesso de administrador).
2. Em **Build and deployment**, escolha **Deploy from a branch**, branch `main`, diretório `/(root)`, e salve.
3. Aguarde a publicação e confira o endereço mostrado pelo GitHub. Em geral, para repositórios públicos de usuário é `https://pullmawollf.github.io/KAIROS-INSTALLER/`, mas **use o endereço confirmado no painel**.
4. Abra o assistente e confira se CSS, JavaScript e ícone carregam sem erro, e se os botões abrem domínios oficiais.
5. Atualizações de `main` serão publicadas pelo GitHub Pages segundo as configurações escolhidas.

O Installer é um site que roda no navegador. Ele **não solicita chaves privadas**, não faz login em GitHub/Supabase/Vercel no próprio site e não provisiona recursos por trás da conta do mantenedor.

## Checklist antes de divulgação

- [ ] Os três provedores oficiais abrem em novas abas.
- [ ] O link para template aponta para `PullmaWollf/KAIROS-CORE`.
- [ ] Uma cópia independente do Core é criada na conta da célula.
- [ ] A pessoa aplica migrações somente no seu Supabase.
- [ ] A pessoa configura as variáveis privadas somente em seu ambiente local e Vercel.
- [ ] O domínio HTTPS do Installer abre sem erros de console.
- [ ] A política de privacidade do futuro provisionamento OAuth está pronta antes dessa funcionalidade existir.

**Atenção:** GitHub Pages não autentica nem provisiona infraestrutura. Para provisionamento automático real, será necessário um backend seguro independente, sujeito a custos e configuração de consentimento dos provedores.
