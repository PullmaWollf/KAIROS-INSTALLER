# Segurança do KAIRÓS Installer

O Installer v0.1 é um site estático. **Não digite senhas, chaves, PAT, service_role, tokens OAuth, cookies ou credenciais bancárias aqui.** Os campos coletam apenas nome, URL de repositório e project reference público.

A implantação do PWA acontece nas **contas do administrador da célula**, não nas contas do mantenedor. As instruções e os links levam aos provedores oficiais, onde a autenticação acontece diretamente.

Não são enviados dados para servidor de onboarding e o progresso não é persistido.

**Limitações:** o checklist depende de confirmação manual, não valida o banco, o deploy nem as permissões reais. Não considere uma instalação homologada apenas porque todas as etapas foram marcadas. Para relatar vulnerabilidades sem publicar segredos, contate privadamente o mantenedor pelo GitHub.

O projeto futuro com OAuth precisará proteger sessões, consentimento, escopos, tokens cifrados, CSRF, idempotência, rate limits e trilhas de auditoria.
