# Segurança do KAIRÓS Installer

O Installer v0.1 é um site estático. **Não digite senhas, chaves, PAT, service_role, tokens OAuth, cookies ou credenciais bancárias aqui.** Os campos coletam apenas nome, URL de repositório e project reference público.

A implantação do PWA acontece nas **contas do administrador da célula**, não nas contas do mantenedor. As instruções e os links levam aos provedores oficiais, onde a autenticação acontece diretamente.

Não são enviados dados para servidor de onboarding e o progresso não é persistido.

**Limitações:** o checklist depende de confirmação manual, não valida o banco, o deploy nem as permissões reais. Não considere uma instalação homologada apenas porque todas as etapas foram marcadas. Para relatar vulnerabilidades sem publicar segredos, contate privadamente o mantenedor pelo GitHub.

O projeto futuro com OAuth precisará proteger sessões, consentimento, escopos, tokens cifrados, CSRF, idempotência, rate limits e trilhas de auditoria.

## Diagnóstico dos provedores (v0.3)
O script `npm run providers:check` usa tokens locais para requisições **GET** às APIs oficiais de Supabase e Vercel. Nenhum token é coletado pela interface gráfica ou salvo em JSON. O diagnóstico limita a saída a identificadores não secretos, mas IDs de organizações/times ainda devem ser tratados com discrição em ambientes públicos. Verificar **acessibilidade não é verificar titularidade**, permissão de cobrança ou permissão de criar projetos. Antes de qualquer fluxo real de provisionamento, haverá checagem adicional de escopos, custos, autorizações e auditoria.
