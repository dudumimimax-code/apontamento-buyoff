# Migração para as contas oficiais da empresa (sem trocar os QR codes)

Objetivo: tirar o Buy Off (formulário, planilha e chatbot) das contas pessoais e colocar em
contas da empresa, **sem reimprimir os QR codes que já estão colados**.

Tempo estimado: 2 a 3 horas. Faça num horário sem lançamentos (ex.: depois do último turno).

---

## Por que os QR codes continuam valendo

O QR code impresso é um link assim:

```
https://dudumimimax-code.github.io/apontamento-buyoff/#&k=CHAVE_LANCAMENTO
```

Ele depende de duas coisas da conta pessoal. As duas têm solução:

| O que está no QR | Problema na migração | Solução |
|---|---|---|
| O endereço `dudumimimax-code.github.io` | O site novo terá outro endereço | O site antigo vira uma página que **redireciona** na hora para o novo, levando a chave junto (passo 7) |
| A chave `k=...` | O Apps Script novo criaria uma chave nova | Antes do `setup()`, você coloca a **chave antiga** no Apps Script novo (passo 3) |

> ⚠️ **Não transfira o repositório** (Settings > Transfer ownership). A transferência apaga o
> endereço `dudumimimax-code.github.io/apontamento-buyoff` e os QR codes param de abrir.
> Aqui o repositório é **copiado** para a conta nova, e o antigo fica só redirecionando.

O que continua na conta pessoal depois da migração (não apague):
- o repositório `dudumimimax-code/apontamento-buyoff`, só com a página de redirecionamento;
- a planilha antiga e a pasta de fotos antiga (os links das fotos antigas apontam para lá).

---

## 0. Antes de começar

- [ ] Nome neutro para as contas, sem nome de pessoa (ex.: `buyoff.pintura.empresa`).
- [ ] Senhas guardadas num lugar da empresa e **mais uma pessoa com acesso** (o gestor, no mínimo).
- [ ] Verificação em duas etapas com o **celular da empresa**, não o seu pessoal.
- [ ] Celular da empresa com **WhatsApp (ou WhatsApp Business)** instalado no número oficial.
      Esse número será o do bot. Use um chip só para isso.
- [ ] Tenha à mão a **chave de lançamento atual**. Na conta pessoal: planilha antiga >
      **Extensões > Apps Script** > escolha a função `mostrarChaves` > **Executar** > veja o
      **Registro de execução**. Copie a `CHAVE_LANCAMENTO` para um bloco de notas.
      **Não mande essa chave por WhatsApp, e-mail nem cole em chat.**

## 1. Juntar o chatbot na branch principal (conta pessoal)

O chatbot está na branch `claude/brave-sagan-v9im5k`. Para ele ir junto para a conta nova:

1. Abra <https://github.com/dudumimimax-code/apontamento-buyoff/compare/claude/brave-sagan-v9im5k>.
2. **Create pull request** > **Create pull request** > **Merge pull request** > **Confirm merge**.

Isso só acrescenta a pasta `chatbot/` e um trecho no `README.md`. O formulário não muda.

## 2. Conta Google nova

1. Crie a conta Gmail da empresa e ative a verificação em duas etapas (celular da empresa).
2. Na conta **pessoal**, compartilhe com a conta nova (como **Editor**):
   - a planilha atual do Buy Off;
   - a pasta do Drive **"Buy Off - Fotos"**.

## 3. Planilha e servidor na conta nova (mantendo a chave do QR)

A ordem aqui importa: **a chave antiga entra antes do `setup()`**.

1. Na conta nova, crie uma planilha em branco (ex.: "Apontamento Buy Off - Pintura").
2. **Extensões > Apps Script**: apague o código padrão, cole o `Code.gs` deste repositório e salve (💾).
3. No Apps Script, clique na **engrenagem (Configurações do projeto)** > role até
   **Propriedades do script** > **Adicionar propriedade do script**:
   - Propriedade: `CHAVE_LANCAMENTO`
   - Valor: a chave que você copiou no passo 0
   - **Salvar propriedades do script**
4. Volte ao editor (`< >`), escolha a função **`setup`** e clique em **Executar**. Autorize com a conta nova.
   - Ela cria a aba, a pasta de fotos nova e uma **`CHAVE_CONTROLE` nova**.
   - A `CHAVE_LANCAMENTO` **não muda**, porque já existe.
5. Rode **`mostrarChaves`** e confira: a `CHAVE_LANCAMENTO` tem que ser **igual** à antiga.
   Anote a `CHAVE_CONTROLE` nova (ela vai no chatbot e na aba Controle).
6. **Implantar > Nova implantação** > tipo **App da Web**:
   - Executar como: **Eu** (a conta nova)
   - Quem pode acessar: **Qualquer pessoa**
7. Copie a URL que termina em `/exec`. É o **servidor novo**.

## 4. Copiar o histórico de lançamentos

1. Abra a planilha **antiga** (já compartilhada com a conta nova) logado na conta nova.
2. Clique com o botão direito na aba **"Lançamentos Piloto 5 Setores"** > **Copiar para >
   Planilha existente** > escolha a planilha nova.
   (Se quiser guardar também as abas mais antigas, como "Lançamentos IBOTIC", copie do mesmo jeito.)
3. Na planilha nova, apague a aba **vazia** "Lançamentos Piloto 5 Setores" criada pelo `setup()`
   e renomeie a cópia ("Cópia de Lançamentos Piloto 5 Setores") para **"Lançamentos Piloto 5 Setores"**.
   O nome precisa ser exatamente esse.

> Fotos antigas: os links das linhas copiadas continuam abrindo a pasta da conta pessoal,
> que está compartilhada. Se um dia a conta pessoal for fechada, mova antes as fotos para o Drive da conta nova.

## 5. GitHub novo (cópia do repositório, com o histórico)

1. Crie a conta GitHub da empresa com o Gmail novo. Ative a verificação em duas etapas.
2. Logado na conta nova, crie um repositório **vazio** em <https://github.com/new>:
   - Nome: `apontamento-buyoff`
   - **Public** (o GitHub Pages grátis exige; veja "Segurança" no `README.md`)
   - **Não** marque README, .gitignore nem licença
3. No computador, abra o PowerShell **na pasta do repositório** (`apontamento-buyoff`) e rode um comando
   por vez (troque `USUARIO-NOVO` pelo usuário da conta nova):

   ```powershell
   git checkout main
   ```
   ```powershell
   git pull
   ```
   ```powershell
   git remote rename origin pessoal
   ```
   ```powershell
   git remote add origin https://github.com/USUARIO-NOVO/apontamento-buyoff.git
   ```
   ```powershell
   git config user.name "USUARIO-NOVO"
   ```
   ```powershell
   git push -u origin main
   ```
   Na hora do `push` abre o navegador para login: **entre com a conta nova**, não com a pessoal.
4. Na conta nova: repositório > **Settings > Pages** > Source: **Deploy from a branch** > `main` / `(root)` > **Save**.
5. Em 1 a 2 minutos o site novo sai em `https://USUARIO-NOVO.github.io/apontamento-buyoff/`.

## 6. Ligar o site novo ao servidor novo e testar

1. No `app.js`, troque a URL da linha `var ENDPOINT = '...'` pela URL `/exec` do passo 3.
2. No `index.html`, troque `app.js?v=9` por `app.js?v=10` (os celulares baixam o arquivo novo).
3. Envie:
   ```powershell
   git commit -am "Servidor da conta oficial"
   ```
   ```powershell
   git push
   ```
4. **Teste antes de mexer no site antigo.** No celular, abra
   `https://USUARIO-NOVO.github.io/apontamento-buyoff/#&k=CHAVE_LANCAMENTO` (com a chave do passo 0),
   faça um lançamento de teste **com foto** e confira a linha na **planilha nova** e a foto na **pasta nova**.
   Depois apague a linha de teste.
5. Abra a aba **Controle** do site novo com a **CHAVE_CONTROLE nova** e confira se os números aparecem.

## 7. Site antigo vira redirecionamento (é isso que mantém os QR codes)

Só faça depois que o teste do passo 6 funcionar.

1. Logado na conta **pessoal**, abra <https://github.com/dudumimimax-code/apontamento-buyoff/edit/main/index.html>.
2. Apague **todo** o conteúdo e cole o código abaixo (troque `USUARIO-NOVO` nos **dois** lugares):

   ```html
   <!doctype html>
   <html lang="pt-BR">
   <head>
   <meta charset="utf-8">
   <meta name="viewport" content="width=device-width,initial-scale=1">
   <meta name="robots" content="noindex">
   <title>Apontamento Buy Off</title>
   <script>location.replace('https://USUARIO-NOVO.github.io/apontamento-buyoff/' + location.hash);</script>
   </head>
   <body style="font-family:sans-serif;padding:24px">
   <p>O apontamento mudou de endereço. <a id="ir" href="https://USUARIO-NOVO.github.io/apontamento-buyoff/">Toque aqui para abrir</a>.</p>
   <script>document.getElementById('ir').href += location.hash;</script>
   </body>
   </html>
   ```
3. **Commit changes** > **Commit changes**. Em 1 a 2 minutos o site antigo passa a redirecionar.
4. **Teste com um QR code colado de verdade:** leia o QR com um celular. Ele deve abrir o
   **endereço novo** (confira na barra) e deixar lançar. A linha tem que aparecer na **planilha nova**.

> Celulares que salvaram o site na tela inicial abrem o endereço antigo **sem** a chave.
> Eles vão para o site novo e mostram "Abra o formulário pelo QR code". Basta ler o QR uma vez.

## 8. Chatbot no número da empresa

O chatbot continua rodando neste computador (Docker). Mudam a planilha, a chave e o número do bot.

1. No arquivo `chatbot\.env`, atualize:

   | Variável | Novo valor |
   |---|---|
   | `BUYOFF_APPS_SCRIPT_URL` | URL `/exec` do passo 3 |
   | `BUYOFF_CHAVE_CONTROLE` | `CHAVE_CONTROLE` nova do passo 3 |
   | `BUYOFF_AUTORIZADOS` | números de quem pode pedir relatório (o seu pessoal pode ficar). Tire os números de teste |
   | `WAHA_API_KEY` | uma chave nova |
   | `WAHA_PAINEL_SENHA` | uma senha nova, se quiser |

   **Não mude** a `N8N_ENCRYPTION_KEY`.
2. Aplique, com o PowerShell aberto na pasta `chatbot` do repositório:
   ```powershell
   docker compose up -d
   ```
3. Desconecte o seu número pessoal do bot: abra <http://localhost:3000/dashboard> (atualize a API key
   do painel com a `WAHA_API_KEY` nova), sessão **default** > **Logout**. No seu celular pessoal, em
   **WhatsApp > Dispositivos conectados**, confira se o WAHA sumiu.
4. Na mesma sessão, clique em **Start** e leia o QR do painel com o **celular da empresa**
   (WhatsApp > **Dispositivos conectados** > **Conectar dispositivo**). O status vira **WORKING**.
   > Esse QR é só o de conectar o WhatsApp ao WAHA. Não tem relação com os QR codes do formulário.
5. Reimporte o workflow (garante a versão da `main`):
   ```powershell
   docker compose exec n8n n8n import:workflow --input=/workflows/buyoff-chatbot.json
   ```
   ```powershell
   docker compose exec n8n n8n publish:workflow --id=BuyOffChatbot001
   ```
   ```powershell
   docker compose restart n8n
   ```
6. Teste do seu celular pessoal para o **número da empresa**: `relatorio`, `semana` (foto + texto) e `sair`.
7. Se for mandar o relatório das 07:00 para um grupo: adicione o número da empresa ao grupo e siga
   o "Passo 4" do `chatbot/README.md` para preencher `BUYOFF_DESTINOS_AGENDADOS`.

> O computador precisa ficar **ligado e com o Docker aberto** para o chatbot responder e mandar
> o relatório das 07:00. Para levar o chatbot a outra máquina da empresa: instale o Docker Desktop,
> faça `git clone` do repositório novo, copie o `.env` e repita os passos 2 a 5.

## 9. Desligar o sistema antigo

Espere **alguns dias** com tudo funcionando pelo redirecionamento.

1. Na conta pessoal, no Apps Script **antigo**: **Implantar > Gerenciar implantações** > arquive a implantação.
   A URL antiga deixa de aceitar lançamentos.
   - ⚠️ **Não** rode `trocarChaves` no Apps Script **novo**: isso invalida os QR codes impressos.
     (No antigo pode rodar, não afeta nada.)
2. Mantenha a planilha antiga como backup (pelo menos algumas semanas) e **não apague** a pasta de fotos antiga.
3. **Não apague** o repositório `dudumimimax-code/apontamento-buyoff` nem a conta GitHub pessoal:
   eles mantêm o redirecionamento dos QR codes vivo.

## 10. Depois da migração

- [ ] QR codes **novos** (setores novos, reposição) devem usar o endereço novo: aba **Controle** do site novo > **Link do QR code**.
- [ ] Quando todos os QR antigos tiverem sido trocados pelo endereço novo, o redirecionamento deixa de ser necessário.
- [ ] Gestor (ou outra pessoa) com acesso às contas novas (Google, GitHub) e ao computador do chatbot.
- [ ] Confirmar com a TI que a rede da fábrica libera `github.io`, `script.google.com` e
      `script.googleusercontent.com` (não muda com a migração).
- [ ] Se um QR code vazar: aí sim rode `trocarChaves` no Apps Script novo e reimprima todos.
