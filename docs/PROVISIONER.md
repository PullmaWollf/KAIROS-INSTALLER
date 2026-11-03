# Provisionador KAIRÓS v0.2 — operação GitHub real

## Escopo
Este provisionador pode **criar um repositório GitHub** a partir do template `PullmaWollf/KAIROS-CORE`, exclusivamente **na conta GitHub pessoal do administrador da célula**. As outras etapas permanecem guiadas. Não constrói infraestrutura do mantenedor.

## Pré-condição do mantenedor
No GitHub do `KAIROS-CORE`, abrir `Settings → General → Template repository` e **ativar**. Sem isso, o preflight se recusa a executar.

## Procedimento (Windows PowerShell)
```powershell
git clone https://github.com/PullmaWollf/KAIROS-INSTALLER.git
cd KAIROS-INSTALLER
Copy-Item examples/installation-plan.example.json installation-plan.json
notepad installation-plan.json
```
Preencha `owner` com **seu próprio login GitHub**, `repository` com um nome novo, `cellName` com a célula e `visibility` com `private` (padrão seguro). Não coloque tokens ou URLs privadas no JSON.

```powershell
node scripts/provision.mjs --plan installation-plan.json
```
O comando acima **não acessa a internet**, não cria projeto e exibe ações futuras.

Apenas quando estiver pronto, utilize um token gerado na conta da célula com **permissões de criação de repositório** e leitura do template, conforme a documentação oficial. Defina-o como `GITHUB_TOKEN` no ambiente do terminal, sem salvá-lo em arquivos versionados. Não cole o token em chats, URLs, logs ou prints.

```powershell
node scripts/provision.mjs --plan installation-plan.json --preflight
node scripts/provision.mjs --plan installation-plan.json --execute --confirm-owner SEU-LOGIN
```

Remova o token do processo terminal após o uso e revogue-o se não for mais necessário. Uma tentativa repetida com mesmo nome retornará conflito — o programa **não apaga nem sobrescreve** repositórios existentes.

## Política de segurança e limites
- `--execute` e `--confirm-owner` precisam aparecer simultaneamente.
- A identidade autenticada pelo token precisa coincidir com o `owner` do plano.
- O destino `PullmaWollf` é explicitamente proibido.
- O template oficial precisa ter `is_template=true` e `full_name` correto.
- A visibilidade padrão é privada; a execução imprime somente o endereço do repositório.
- O programa **não persiste tokens**, senhas ou dados do Supabase.
- Não há OAuth pelo navegador ainda. O token pessoal é usado **somente localmente** até termos autorização hospedada e fluxo com proteção de sessão.
- Não executa migrações, não configura Vercel, não cria Supabase e não gera conta ADM.
- No estágio atual, somente conta pessoal; suporte a organizações requer verificação e regras próprias.

## Referência
https://docs.github.com/en/rest/repos/repos#create-a-repository-using-a-template
