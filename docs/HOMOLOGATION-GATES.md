# KAIRÓS — Gates de homologação

Estado: checklist de critérios, não aprovação de homologação.

## P0 — Segurança

- [x] Implementado claim atômico de callback OAuth e testes de replay/concorrência no código; **aplicar migração e validar em banco real antes de aprovar**.
- [ ] Validar `state`, PKCE, vinculação da sessão e rotação/revogação de credenciais.
- [ ] Testar CSRF, origem, cookies seguros, autorização por usuário e isolamento entre instalações.
- [ ] Confirmar que tokens e senhas não aparecem em logs, erros ou respostas não autorizadas.

## P0 — Operações remotas

- [ ] Simular timeout após POST remoto: operação deve ficar em revisão, sem repetição automática.
- [ ] Verificar exclusividade de claim por instalação/fase e idempotência em concorrência.
- [ ] Reconciliar somente operações verificáveis por GET; ações ambíguas exigem revisão humana.

## P1 — Integração

- [ ] `npm test`, `npm run check`, `npm run check:cloud` aprovados no commit candidato.
- [ ] Testar 401, 403, 429, 500, timeouts e respostas inválidas dos três provedores.
- [ ] Executar migrações em Supabase exclusivo do Installer e verificar RLS/RPC.
- [ ] Validar API em Vercel exclusiva, domínio HTTPS, health e secrets no servidor.

## P1 — Observabilidade

- [ ] Registrar IDs de correlação, fase, timestamps e código de erro sem dados secretos.
- [ ] Exibir status `waiting`, `needs_review`, `recorded` e `recovered` sem sugerir sucesso indevido.

## Gate final

Uma instalação real em contas de laboratório de GitHub, Supabase e Vercel deve concluir Core, banco, ADM, deploy e smoke. O AGAPE original não pode ser usado como ambiente de controle. Sem essas evidências, o estado permanece **pré-homologação**.

## Implantação da correção OAuth

Aplicar `control/migrations/20261103000001_oauth_claims.sql` **após** `20261103000000_control_plane.sql` somente no Supabase dedicado ao Installer. O backend exige a RPC `kairos_control_claim_oauth`; sem a migração o callback falha fechado e o login não conclui. Implantar banco antes do código, sem misturar com o projeto AGAPE.

A tabela de claims acumula hashes sem tokens. Planejar limpeza periódica de registros expirados (`expires_at < now()`) por tarefa administrativa autenticada, sem reintroduzir aceitação de callbacks expirados. O callback verifica expiração do cookie antes do claim.
