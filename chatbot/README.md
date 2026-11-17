# Chatbot de relatórios no WhatsApp (n8n + WAHA)

Quem estiver autorizado manda uma mensagem como **hoje**, **semana ibotic** ou **defeitos ontem** para o número do bot, e recebe o relatório do Buy Off na hora. Todo dia às 07:00 o bot também manda o relatório de ontem para o grupo da produção (e o da semana passada às segundas).

```
WhatsApp ──► WAHA ──(webhook + token)──► n8n ──(acao "listar" + CHAVE_CONTROLE)──► Apps Script ──► Google Sheets
   ▲                                      │
   └──────────── WAHA /api/sendText ◄─────┘   (texto do relatório)
```

- **WAHA** é a ponte com o WhatsApp: o número do bot é ligado pelo QR code, como no WhatsApp Web.
- **n8n** recebe a mensagem, busca os lançamentos e monta o relatório.
- Os dados vêm da **mesma ação `listar`** que a aba Controle do formulário usa. Não precisa mudar o `Code.gs` nem dar acesso à planilha.

## Exemplo de resposta

```
📊 Buy Off · Pintura
Ontem · seg 16/11/2026

Total: 5.100 pç · 51 ruins · refugo 1,0%
10 lançamentos

TAGLIABUE · refugo 1,5%
1.900 pç · 29 ruins · Dia ✓ Noite ✓
Principais: Q72 Pintura escorrida (20) · Q1 Peça batida (9)

IBOTIC · refugo 0,2%
1.350 pç · 3 ruins · Dia ✓ Noite ✓
Principais: Q73 Peça na cor errada (3)
...
⚠️ Sem lançamento: POLIMENTO (Noite)
```

## Comandos

| Mensagem | Resposta |
|---|---|
| `hoje`, `ontem`, `semana`, `semana passada`, `mes`, `mes passado` | Resumo por setor: produção, peças ruins, refugo %, turnos lançados e principais defeitos |
| `17/11` ou `17/11/2026` | Um dia específico |
| `10/11 a 16/11` | Um período (até 92 dias) |
| `hoje ibotic`, `semana polimento`, `ontem uv`, `mes colorido`, `hoje tagliabue` | Detalhe do setor: por turno, top 5 defeitos e, em períodos, por dia |
| `defeitos semana` (ou `defeitos ontem ibotic`...) | Ranking dos códigos Q com % das peças ruins |
| `pendentes` (ou `pendentes ontem`) | Setor/turno que ainda não lançou |
| `ajuda` | Lista de comandos |

- Maiúsculas e acentos não importam (`Mês`, `MES`, `mes`).
- **Em grupo**, o bot só responde a mensagens que começam com barra (`/hoje`), para não reagir à conversa.
- O refugo % segue a regra do formulário: só conta lançamentos com produção **em peças**. Produção em pilhas aparece separada.

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

1. De um número autorizado, mande **ajuda** para o número do bot. Ele responde a lista de comandos.
2. Mande **hoje**. Deve chegar o resumo do dia.
3. Se não responder, veja **Executions** no n8n (dica: o nó **WAHA: mensagem recebida** mostra exatamente o que o WAHA mandou).

**Relatório automático no grupo:**

1. Adicione o número do bot ao grupo da produção.
2. Mande qualquer `/ajuda` no grupo. Em **Executions**, abra a execução e copie o `from` do nó **WAHA: mensagem recebida** (algo como `120363...@g.us`).
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

- **Bot não responde e não aparece execução no n8n:** a sessão do WAHA não está `WORKING`, ou o workflow não está publicado.
- **Execução com erro "Webhook recusado":** o `BUYOFF_WEBHOOK_TOKEN` do WAHA e do n8n estão diferentes. Rode `docker compose up -d` para os dois pegarem o mesmo `.env`.
- **Execução termina no nó Interpretar sem responder:** o remetente não está autorizado. Em alguns aparelhos o WhatsApp manda um id `…@lid` em vez do número. Copie o `from` (ou `participant`, em grupo) do nó **WAHA: mensagem recebida** e acrescente esse id em `BUYOFF_AUTORIZADOS`.
- **"A chave de controle do chatbot está errada":** confira `BUYOFF_CHAVE_CONTROLE` com `mostrarChaves` no Apps Script.
- **"Não consegui ler a planilha agora":** veja o nó **Buscar lançamentos (planilha)** na execução. Normalmente é a URL errada ou o Google lento (o n8n já tenta 3 vezes).
- **Não consigo fazer login no n8n acessando pelo IP da máquina:** o n8n exige HTTPS fora do `localhost`. Use o túnel SSH da tabela de segurança.
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
| `docker-compose.yml` | n8n + WAHA |
| `.env.example` | Modelo da configuração (copie para `.env`) |
| `src/nucleo.js` | Interpretação dos comandos e montagem dos relatórios |
| `build-workflow.js` | Gera o workflow do n8n a partir do núcleo |
| `workflows/buyoff-chatbot.json` | Workflow pronto para importar |
| `test/` | Testes e dados fictícios |
