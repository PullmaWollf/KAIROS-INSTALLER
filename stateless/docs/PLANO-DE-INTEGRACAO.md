# KAIRÓS — Integração da arquitetura stateless

## Separação definitiva de responsabilidades

**Instalador (interface):** coleta consentimento e dados de conexão, executa preflight somente leitura, cria o repositório exclusivo e entrega a tarefa para GitHub Actions. Não mantém usuários, sessões, tokens ou operações em uma tabela central. Nenhuma leitura do `kairos-installer-control` é feita neste pacote.

**Repositório exclusivo do cliente:** recebe o `KAIROS-CORE` como template, arquivos de provisionamento, workflow e segredos transitórios. A variável `KAIROS_INSTALL_STATE` no GitHub armazena progresso e identificadores das contas/recursos — nunca credenciais. O processo encerra as etapas e entrega URL do PWA.

**Supabase da célula:** guarda usuários, sessões e dados daquela célula **exclusivamente**, sem compartilhar tabelas com outra célula nem com o banco de controle atual.

**Vercel da célula:** hospeda o aplicativo e recebe apenas suas variáveis. Nenhuma dependência operacional do Installer permanece no PWA.

## Migração sem risco

1. NÃO apagar `kairos-installer-control` enquanto a versão antiga estiver em uso; desligar e desativar o backend antigo somente depois da homologação da nova versão.
2. Publicar a interface stateless como **novo ambiente isolado**, sem aproveitar as variáveis da instalação original e sem habilitar flags antigas de escrita.
3. Configurar `KAIROS_INSTALLER_PUBLIC_ORIGIN` com a origem HTTPS desse novo ambiente.
4. Conectar GitHub ↔ Vercel da conta `okarakimoto`. A última consulta do plugin Vercel retornou **nenhum Git namespace**, então a autorização ainda não estava pronta.
5. Validar credenciais de curta duração e permissões nos três provedores em *modo leitura*.
6. Executar uma única instalação descartável `HML Célula Teste`; verificar evidências e ausência de cobrança.
7. Revogar os tokens temporários nos provedores e excluir os projetos de homologação caso não sejam mais necessários.
8. Somente depois de estabilizar o OAuth e a proteção contra replay, remover a infraestrutura antiga do Installer.

## Pontos de atenção antes do lançamento

- O frontend técnico ainda pede PATs, **não** é uma experiência para pessoas leigas. OAuth guiado deve substituir a digitação de tokens.
- Tokens GitHub com escopos amplos são temporários e só devem ser utilizados em contas descartáveis durante a homologação.
- O GitHub Actions depende das permissões para criar/atualizar Repository Variables e remover segredos temporários. Uma falha no `cleanup` exige revogação manual imediata.
- O fluxo sem banco central não tem armazenamento de replay ou rate limit no servidor. Namespaces únicos e revisão de repositórios ajudam, mas não bastam para liberar um SaaS público.
- A verificação da quota gratuita depende de APIs sujeitas a alterações e não substitui conferência de preço/cobrança no painel.
- O repositório `KAIROS-CORE` tem `LICENSE-DECISION.md`: direitos de distribuição comercial e marca ainda precisam ser formalizados antes de vender o White Label.
- O teste simulado não substitui a criação real e não comprova HTTPS, RLS, sessões de usuários nem publicação PWA em celulares reais.
- O plugin GitHub conectado como `okarakimoto` recebeu permissão de escrita no repositório `PullmaWollf/KAIROS-INSTALLER`. O protótipo deve ser integrado em um subdiretório isolado, sem alterar o deployment ou as flags da versão central até a homologação.

## Princípio de custo zero

O programa bloqueia etapas quando observa um plano não gratuito, quota sem vaga ou identidade divergente. **Não promete ausência de cobranças futuras por ações externas ao instalador**. É indispensável verificar os limites dos provedores e não ativar add-ons pagos.