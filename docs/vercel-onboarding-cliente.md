# KAIRÓS Installer — conexão Vercel sem termos técnicos

## Experiência do cliente

O usuário não precisa descobrir se possui "conta pessoal", "time" ou "Team ID".
Na instalação, ele abre a própria Vercel, gera uma chave de acesso, copia para
o KAIRÓS e clica para conectar. O KAIRÓS verifica os destinos acessíveis por
consultas somente de leitura. Se houver apenas um, seleciona automaticamente.
Quando houver vários destinos autorizados, apresenta os nomes das hospedagens.

**A cobrança da Vercel pertence ao titular da conta conectada.** O KAIRÓS
não cria uma equipe paga, não convida membros e não compra um plano.

## Proteção das credenciais

- O token é recebido exclusivamente por POST autenticado, com origem HTTPS e CSRF.
- A descoberta usa apenas GET nas APIs da Vercel, sem criar projetos.
- Cada destino é testado por consulta de projetos naquele escopo; não basta
  aparecer na lista de equipes associadas ao usuário.
- A autorização final confere identidade e destino novamente antes de gravar.
- O token permanece criptografado no backend e vinculado ao ID do usuário GitHub.
- Desconectar exclui a credencial do KAIRÓS. O titular também pode revogar
  a chave na página de tokens da própria Vercel.
- A instalação compara a conta selecionada à propriedade do projeto retornado,
  antes de configurar segredos e domínios.
- A hospedagem pessoal é identificada internamente como `personal_<userId>`,
  mas esse identificador sintético nunca é enviado como `teamId` à Vercel.
- A hospedagem de equipe recebe `teamId` explicitamente no escopo das
  requisições de projeto, variáveis, publicação e domínio.
- Sem aprovação dos custos e flags de escrita, nenhum projeto é provisionado.

## Limites e próximos passos

Uma conexão validada **não garante que o token tenha permissão de escrita**;
isso só pode ser homologado em uma instalação descartável e consentida.
O endereço `nome-da-celula.vercel.app` depende de disponibilidade.
O instalador atual acompanha o fluxo com a aba aberta.

Para eliminar até mesmo a criação manual do token, o produto deverá
registrar uma integração oficial *connectable account* na Vercel, com os
escopos adequados e fluxo OAuth de instalação. O OAuth de identidade do
Sign in with Vercel não substitui sozinho essa autorização de gerenciamento.

A Vercel restringe o plano Hobby a uso pessoal e não comercial.
Para uma instalação usada comercialmente, o titular deverá possuir o
plano exigido pela Vercel. O operador KAIRÓS não paga a hospedagem
do cliente e não faz alteração automática de planos.

Referências:
- https://vercel.com/docs/rest-api
- https://vercel.com/kb/guide/how-do-i-use-a-vercel-api-access-token
- https://vercel.com/docs/integrations/create-integration
- https://vercel.com/docs/plans/hobby
