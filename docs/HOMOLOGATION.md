# Homologação OKARAKIMOTO e isolamento de produção

## Ambientes separados (regra obrigatória)

- **Homologação:** usar a conta GitHub `OKARAKIMOTO` e somente a organização Supabase, escopo Vercel, repositório e ID de instalação descartáveis previamente autorizados para o teste. O administrador deve comprovar essa titularidade por OAuth/consulta somente leitura.
- **Produção:** usar exclusivamente as contas GitHub, Supabase e Vercel conectadas e autorizadas pelo **usuário final** no próprio Installer. Nunca reutilizar IDs, tokens, credenciais, projetos ou destino da homologação.
- Os modos `KAIROS_HOMOLOGATION_MODE=1` e `KAIROS_PRODUCTION_MODE=1` são **mutuamente exclusivos**. Caso ambos estejam habilitados, bloquear tudo (fail closed), inclusive status de prontidão.
- A conta mantenedora `PullmaWollf` não pode ser destino de novas células.

## Fluxo de homologação (sem executar recursos até validação)

1. Confirmar OAuth GitHub `OKARAKIMOTO`, acesso ao template `PullmaWollf/KAIROS-CORE` e que este é um *template repository* habilitado.
2. Confirmar organização Supabase isolada na mesma conta de homologação; confirmar plano, limite e região, sem presumir custo zero.
3. Confirmar equipe ou conta Vercel de homologação e vínculo de importação GitHub. A conexão Vercel atualmente usa uma credencial de gerenciamento; ainda não é OAuth completo.
4. Configurar o ambiente servidor do Installer com os sete parâmetros obrigatórios `KAIROS_HML_*`, janela máxima de sete dias e `KAIROS_HOMOLOGATION_MODE=1`, mantendo `KAIROS_PRODUCTION_MODE=0`.
5. Rodar auditoria somente leitura de provedores, quotas, vínculo GitHub/Vercel e escopo. Não habilitar escrita na falta de comprovação dos três destinos.
6. Somente após autorização explícita dos recursos e possíveis custos, habilitar os gates de escrita exigidos pelo worker e iniciar UMA instalação descartável.
7. Verificar cada resultado remoto (GitHub, Supabase, migrações, Vercel, variáveis, ADM, publicação e smoke). Não repetir operações incertas sem reconciliação manual.
8. Documentar resultado, custos, falhas, revogação de tokens e exclusão manual dos recursos de teste.

## Critérios de aceite

- A instalação de homologação não escreve nos serviços ÁGAPE originais nem em projetos/organizações do mantenedor.
- Mudança de usuário, repositório, organização, time Vercel, UUID ou prazo invalida a autorização.
- Modos HML e produção simultâneos nunca produzem `readyForWrites=true`.
- O usuário de produção deve autenticar e autorizar suas três contas; a conta `OKARAKIMOTO` não é fallback.
- A experiência 'um clique' só será anunciada quando os três provedores forem conectados no navegador, a instalação real for completada e todos os testes de aceite passarem.

## Estado ao criar este documento

O código contém orquestração automática e guardas, mas a instalação remota ponta a ponta **não foi homologada**. GitHub e Vercel conectados a este chat não equivalem automaticamente a sessões OAuth do Installer; não copiar tokens de plugins para o aplicativo. A API de gerenciamento Vercel ainda exige uma credencial informada pelo usuário. A execução de homologação permanece bloqueada até confirmação de destino, consentimento, testes e disponibilidade dos serviços.
