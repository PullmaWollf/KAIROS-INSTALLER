# Contrato Core ↔ Installer

O instalador depende de rotas, arquivos de migração, variáveis de ambiente e PWA do Core. Para impedir que uma mudança isolada quebre a instalação em novas células, execute:

```bash
node scripts/check-core-contract.mjs --core-dir ../KAIROS-CORE
```

O comando é somente leitura, não acessa a internet nem necessita de senhas. Valida estrutura de API, SQL, segurança de login, bootstrap ADM, rewrites Vercel, manifesto e Service Worker. Os pipelines de CI de **ambos** os repositórios executam esse contrato sobre o código atual do outro repositório, desde que os checkouts públicos do GitHub estejam acessíveis.

**Limitação:** o verificador é estático e não substitui uma implantação real, testes HTTP contra a instância publicada, revisão de SQL ou verificação de permissões no Supabase. Alterações simultâneas nos dois repositórios devem ser coordenadas.
