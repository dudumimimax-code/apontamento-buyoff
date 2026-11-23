# Chatbot de relatórios no WhatsApp (n8n + WAHA)

Quem estiver autorizado manda **relatorio** para o número do bot, escolhe no menu o relatório e o(s) setor(es) e recebe o relatório do Buy Off na hora. Todo dia às 07:00 o bot também manda o relatório de ontem para o grupo da produção (e o da semana passada às segundas).

```
WhatsApp ──► WAHA ──(webhook + token)──► n8n ──(acao "listar" + CHAVE_CONTROLE)──► Apps Script ──► Google Sheets
   ▲                                      │
   ├──────────── WAHA /api/sendText ◄─────┤   (texto do relatório)
   └──────────── WAHA /api/sendImage ◄── Gotenberg (HTML → PNG)   (foto com gráficos, nos períodos)
```

- **WAHA** é a ponte com o WhatsApp: o número do bot é ligado pelo QR code, como no WhatsApp Web.
- **n8n** recebe a mensagem, busca os lançamentos e monta o relatório.
- Os dados vêm da **mesma ação `listar`** que a aba Controle do formulário usa. Não precisa mudar o `Code.gs` nem dar acesso à planilha.

## Como funciona a conversa

```
Você:  relatorio

Bot:   📊 Buy Off · Pintura
       Escolha o relatório:

       1️⃣ Hoje
       2️⃣ Ontem
       3️⃣ Esta semana
       4️⃣ Semana passada
       5️⃣ Este mês
       6️⃣ Defeitos da semana
       7️⃣ Quem ainda não lançou hoje

       Responda com o número · sair para encerrar

Você:  3

Bot:   🏭 Qual setor? · Esta semana

       0️⃣ Todos
       1️⃣ Tagliabue   2️⃣ IBOTIC   3️⃣ Polimento
       4️⃣ Madeirado UV   5️⃣ Madeirado Colorido

       Pode escolher vários: 1 3 ou 1,3

Você:  2 3

Bot:   (foto com gráficos)
       📊 Buy Off · Pintura · IBOTIC, POLIMENTO
       Semana 47 · 16/11 a 22/11/2026

       Total: 24 peças ruins · 5 lançamentos

       IBOTIC
       15 peças ruins · 3 lançamentos
       Principais: Q81 Pintura com impureza (10) · Q73 Peça na cor errada (3)

       POLIMENTO
       9 peças ruins · 2 lançamentos
       Principais: Q74 Peça fora de tonalidade (6) · Q79 Pintura manchada (2)

       menu para outro relatório · sair para encerrar
```

- **`relatorio`** abre o menu (vale `Relatório`, `RELATORIO`, com ou sem acento). Fora disso o bot fica em silêncio, então o número pode ser usado para conversar normalmente.
- **Setores:** `0` = todos; um número = relatório detalhado do setor (por turno e por dia); vários números (`1 3`, `1,3`, `1 e 3`) = só esses setores. Também dá para escrever o nome (`ibotic e polimento`).
- **`menu`** volta ao menu a qualquer momento. **`sair`** encerra; ele também encerra sozinho depois de 30 minutos sem mensagens (`SESSAO_MINUTOS` no `nucleo.js`).
- O menu responde na hora: o bot só consulta a planilha quando vai montar o relatório.
- Os relatórios mostram **peças ruins e número de lançamentos** por setor, os principais defeitos e quem ainda não lançou. Produção e refugo % ficam de fora do texto.

### Comandos escritos (atalhos)

Quem já conhece pode pular o menu e escrever o pedido direto, com a conversa aberta ou junto com o `relatorio` (`relatorio semana ibotic`). Em **grupo** não há menu: valem estes comandos começando com barra (`/hoje`), para o bot não reagir à conversa.

| Mensagem | Resposta |
|---|---|
| `hoje`, `ontem`, `semana`, `semana passada`, `mes`, `mes passado` | Resumo de todos os setores |
| `17/11` ou `17/11/2026` | Um dia específico |
| `10/11 a 16/11` | Um período (até 92 dias) |
| `semana ibotic`, `ontem uv`, `mes polimento colorido` | Um ou mais setores |
| `defeitos semana` (ou `defeitos ontem ibotic`...) | Ranking dos códigos Q com % das peças ruins |
| `pendentes` (ou `pendentes ontem`) | Setor/turno que ainda não lançou |

Maiúsculas e acentos não importam (`Mês`, `MES`, `mes`).

### Foto com gráficos

Nos pedidos de **período** (`semana`, `semana passada`, `mes`, `10/11 a 16/11`, `defeitos semana`, `semana ibotic`...) o bot manda primeiro uma **foto com gráficos** e logo depois o texto de sempre. A foto tem:

- cartões com produção, peças ruins e número de lançamentos;
- produção por dia (ou por semana, em períodos acima de 35 dias);
- peças ruins por setor (ou Dia × Noite, quando o pedido é de um setor só), com o número de lançamentos;
- os 6 principais defeitos.

**Produção em pilhas:** quase todos os setores lançam a produção em pilhas, então o cartão e o gráfico de produção contam em **pilhas**. Lançamentos em peças (hoje só a IBOTIC) aparecem ao lado, no cartão ("+ 2.150 peças"), porque pilha e peça não se somam. Num relatório só da IBOTIC, a produção aparece em peças.

`hoje`, `ontem`, um dia só e `pendentes` continuam só em texto. O relatório automático de segunda (semana passada) também vai com a foto.

Quem desenha a foto é o **Gotenberg**, um terceiro serviço do `docker-compose.yml`. O n8n monta uma página só com SVG (sem JavaScript e sem nada de fora) e o Gotenberg devolve o PNG. Ele não tem porta aberta, roda com JavaScript desligado e não acessa nenhum endereço, então os números não saem da máquina. Se ele falhar, o texto vai assim mesmo.

---

## Antes de começar

1. **Um computador ou servidor sempre ligado com Docker** (Docker Desktop no Windows/Mac, ou Docker Engine no Linux). Uma VM pequena basta: 1 CPU e 1 GB de RAM sobrando.
2. **Um número de WhatsApp só para o bot** (um chip da empresa). O WAHA usa o WhatsApp Web por trás e **não é a API oficial da Meta**: o WhatsApp pode bloquear o número se ele mandar spam. Para relatórios internos e respostas a quem pergunta o risco é baixo, mas não use o número pessoal de ninguém.
3. A **URL do Apps Script** (a mesma do `ENDPOINT` no `app.js`) e a **`CHAVE_CONTROLE`** (no Apps Script, rode `mostrarChaves` e veja o Registro de execução).

## Passo 1 · Configurar

```bash
cd chatbot
```

```bash
cp .env.example .env
```

Abra o `.env` e preencha. Para os segredos internos (`WAHA_API_KEY`, `BUYOFF_WEBHOOK_TOKEN`, `N8N_ENCRYPTION_KEY`, `WAHA_PAINEL_SENHA`), gere um valor diferente para cada um com:

```bash
openssl rand -hex 24
```

Em `BUYOFF_AUTORIZADOS` ponha os números de quem pode pedir relatório, com 55 + DDD, só dígitos, separados por vírgula (ex.: `5511987654321,5511912345678`). O id do grupo você pega no Passo 4.

## Passo 2 · Subir

```bash
docker compose up -d
```

Se faltar algum valor obrigatório no `.env`, o comando avisa qual.

## Passo 3 · Ligar o WhatsApp do bot

1. Abra <http://localhost:3000/dashboard> e entre com `WAHA_PAINEL_USUARIO` / `WAHA_PAINEL_SENHA`.
2. Na primeira vez o painel pede a API key: use o valor de `WAHA_API_KEY`.
3. A sessão **default** aparece como `SCAN_QR_CODE`. Clique no ícone da câmera para ver o QR.
4. No celular do bot: **WhatsApp > ⋮ > Aparelhos conectados > Conectar um aparelho** e leia o QR.
5. A sessão passa para `WORKING`. Ela fica salva: reiniciar o Docker não pede QR de novo.

## Passo 4 · Importar o workflow no n8n

```bash
docker compose exec n8n n8n import:workflow --input=/workflows/buyoff-chatbot.json
```

```bash
docker compose exec n8n n8n publish:workflow --id=BuyOffChatbot001
```

```bash
docker compose restart n8n
```

Depois abra <http://localhost:5678> e crie a conta de dono do n8n (fica só nesta máquina). O workflow **Buy Off · Chatbot de relatórios (WhatsApp)** aparece publicado (ativo).

> Pela interface também dá: **Create workflow > ⋯ > Import from File** escolhendo `chatbot/workflows/buyoff-chatbot.json`, e depois **Publish**.

## Passo 5 · Testar

1. De um número autorizado, mande **relatorio** para o número do bot. Ele responde com o menu.
2. Mande **1** e depois **0**. Deve chegar o resumo de hoje de todos os setores.
3. Se não responder, veja **Executions** no n8n (dica: o nó **WAHA: mensagem recebida** mostra exatamente o que o WAHA mandou).

**Relatório automático no grupo:**

1. Adicione o número do bot ao grupo da produção.
2. Mande `/ajuda` no grupo. Em **Executions**, abra a execução e copie o `from` do nó **WAHA: mensagem recebida** (algo como `120363...@g.us`).
3. Ponha esse id em `BUYOFF_DESTINOS_AGENDADOS` (e em `BUYOFF_AUTORIZADOS`, se quiser que todos do grupo possam pedir com `/`).
4. Aplique a mudança:

```bash
docker compose up -d
```

O horário (07:00) fica no nó **Todo dia 07:00** do workflow. Às segundas vai também o relatório da semana passada. Domingo sem lançamento não gera mensagem.

---

## Segurança e LGPD

| Risco | Proteção |
|---|---|
| Alguém de fora pedir números da produção | Só responde a `BUYOFF_AUTORIZADOS` (números ou grupos). Quem não está na lista não recebe nada, nem mensagem de erro. |
| Alguém mandar mensagens falsas para o n8n | O WAHA envia um token secreto (`BUYOFF_WEBHOOK_TOKEN`) em cada chamada. Sem ele o n8n recusa (a execução aparece como erro). |
| n8n ou WAHA acessíveis pela rede | As portas abrem só em `127.0.0.1`. Para acessar de outra máquina, use um túnel SSH (`ssh -L 5678:localhost:5678 -L 3000:localhost:3000 usuario@servidor`), não abra as portas. |
| Chaves vazarem pelo GitHub | Segredos ficam só no `.env` (no `.gitignore`). O workflow lê tudo com `$env` e não tem nenhuma chave dentro. |
| Chatbot gravar ou alterar dados | Ele só tem a `CHAVE_CONTROLE`, que **só lê**. A `CHAVE_LANCAMENTO` não é usada. |
| Mensagens enviadas pelo bot | Usam a `WAHA_API_KEY`; o painel e o Swagger do WAHA têm usuário e senha. |

Cuidados que continuam:

1. **A `CHAVE_CONTROLE` fica no servidor do chatbot.** Quem tiver acesso ao `.env` lê todos os lançamentos. Proteja a máquina (usuário com senha, disco da empresa). Se vazar, rode `trocarChaves` no Apps Script e atualize o `.env` **e** quem usa a aba Controle.
2. **Os relatórios não mostram nomes de operadores**, só setor, turno e números. As execuções do n8n guardam a resposta da planilha (com nomes) por 7 dias e depois apagam (`EXECUTIONS_DATA_MAX_AGE`).
3. **Grupos:** o relatório vai para todos os participantes. Coloque no `BUYOFF_DESTINOS_AGENDADOS` só grupos internos.
4. **WAHA não é oficial.** Se o número do bot for bloqueado, os dados não se perdem; basta ligar outro número no Passo 3. Para algo oficial no futuro, a alternativa é a API do WhatsApp Business da Meta (paga, com aprovação de modelos de mensagem).

---

## Manutenção

| Situação | O que fazer |
|---|---|
| Mudou alguma coisa no `.env` | `docker compose up -d` (recria só o que mudou). |
| Novo setor ou código Q no formulário | Atualize `SETORES`, `TURNOS_ESPERADOS` e `DEFEITOS` em `chatbot/src/nucleo.js`, rode `node chatbot/build-workflow.js` e repita os comandos do Passo 4 (o import substitui o workflow pelo novo). |
| Setor que não trabalha à noite | Em `TURNOS_ESPERADOS` (`nucleo.js`), deixe só `['Dia']` para ele não aparecer como "sem lançamento". |
| Trocar o horário do relatório automático | No n8n, nó **Todo dia 07:00** (formato cron: `0 7 * * *` = 07:00 todo dia). Publique de novo. |
| Celular do bot trocou ou desconectou | Painel do WAHA > sessão default > ler o QR de novo. |
| Atualizar versões do n8n/WAHA | Troque a versão em `image:` no `docker-compose.yml` e `docker compose pull` seguido de `docker compose up -d`. Teste antes num horário tranquilo. |
| Ver o que está acontecendo | `docker compose logs -f waha` ou `docker compose logs -f n8n`, e **Executions** no n8n. |

### Problemas comuns

- **Bot não responde, mas aparece execução que para no nó Interpretar:** a conversa não está ligada. Mande `relatorio` primeiro (ou ela encerrou sozinha depois de 30 minutos parada).
- **Bot não responde e não aparece execução no n8n:** a sessão do WAHA não está `WORKING`, ou o workflow não está publicado.
- **Execução com erro "Webhook recusado":** o `BUYOFF_WEBHOOK_TOKEN` do WAHA e do n8n estão diferentes. Rode `docker compose up -d` para os dois pegarem o mesmo `.env`.
- **Execução termina no nó Interpretar sem responder:** o remetente não está autorizado. Em alguns aparelhos o WhatsApp manda um id `…@lid` em vez do número. Copie o `from` (ou `participant`, em grupo) do nó **WAHA: mensagem recebida** e acrescente esse id em `BUYOFF_AUTORIZADOS`.
- **"A chave de controle do chatbot está errada":** confira `BUYOFF_CHAVE_CONTROLE` com `mostrarChaves` no Apps Script.
- **"Não consegui ler a planilha agora":** veja o nó **Buscar lançamentos (planilha)** na execução. Normalmente é a URL errada ou o Google lento (o n8n já tenta 3 vezes).
- **Não consigo fazer login no n8n acessando pelo IP da máquina:** o n8n exige HTTPS fora do `localhost`. Use o túnel SSH da tabela de segurança.
- **Veio o texto mas não a foto:** abra a execução e veja os nós **Desenhar gráfico (Gotenberg)** e **Enviar foto (WAHA)**. Confira se o Gotenberg está rodando (`docker compose ps`) e veja `docker compose logs gotenberg`.
- **Relatório não mostra lançamentos antigos:** a ação `listar` devolve as últimas 2.000 linhas da planilha (no ritmo do piloto, mais de 6 meses).

## Desenvolvimento

A lógica fica em `src/nucleo.js` (funções puras, sem n8n). O `build-workflow.js` copia esse arquivo para dentro dos dois nós de código e gera `workflows/buyoff-chatbot.json`. Não edite o código direto no n8n: a próxima importação sobrescreve.

```bash
node chatbot/build-workflow.js
```

```bash
node chatbot/test/teste.js --mostrar
```

Os testes usam lançamentos fictícios (`test/dados-exemplo.js`) e conferem os comandos, as contas, os textos, a autorização e se o workflow gerado está em dia com o núcleo. `--mostrar` imprime exemplos de cada relatório.

| Arquivo | O que é |
|---|---|
| `docker-compose.yml` | n8n + WAHA + Gotenberg (desenha a foto dos gráficos) |
| `.env.example` | Modelo da configuração (copie para `.env`) |
| `src/nucleo.js` | Interpretação dos comandos e montagem dos relatórios |
| `build-workflow.js` | Gera o workflow do n8n a partir do núcleo |
| `workflows/buyoff-chatbot.json` | Workflow pronto para importar |
| `test/` | Testes e dados fictícios |
