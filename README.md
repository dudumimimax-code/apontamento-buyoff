# Apontamento Buy Off · Pintura

Formulário de apontamento do Buy Off da pintura (Ornare). O site fica no **GitHub Pages**, e cada lançamento vira uma linha numa **planilha Google Sheets**, que pode ser baixada como Excel (.xlsx) a qualquer momento.

```
Celular / tablet  ──►  GitHub Pages (index.html + app.js)
                           │  POST com chave
                           ▼
                     Google Apps Script (Code.gs)  ──►  Google Sheets  ──►  Excel (.xlsx)
```

## Arquivos

| Arquivo | Onde vai |
|---|---|
| `index.html` | Repositório do GitHub (página do formulário) |
| `app.js` | Repositório do GitHub (lógica do formulário) |
| `Code.gs` | Editor do Apps Script da planilha (**não** suba para o GitHub se quiser, mas ele não contém segredos) |
| `README.md` | Repositório do GitHub (este guia) |

---

## Passo 1 · Criar a planilha e o servidor (Google)

1. Entre no Google com a conta que vai ser **dona dos dados** (de preferência uma conta da empresa; veja "Segurança").
2. Crie uma planilha nova em <https://sheets.new> e dê um nome, por exemplo **Apontamento Buy Off - Pintura**.
3. Na planilha: **Extensões > Apps Script**.
4. Apague o código que aparece, cole o conteúdo inteiro de `Code.gs` e clique em **Salvar** (ícone de disquete).
5. Em **Configurações do projeto** (engrenagem à esquerda), ajuste o **Fuso horário** para `(GMT-03:00) São Paulo`.
6. Volte ao editor, escolha a função **`setup`** no menu de funções e clique em **Executar**.
   - O Google vai pedir autorização. Clique em **Revisar permissões**, escolha sua conta.
   - Se aparecer "O Google não verificou este app", clique em **Avançado > Acessar (não seguro)**. É normal: o app é seu.
7. Abra **Registro de execução** (aparece embaixo). Ali estão as duas chaves:
   - `CHAVE_LANCAMENTO`: vai dentro do link do QR code.
   - `CHAVE_CONTROLE`: só para quem acompanha os números (você, James).
   Guarde as duas num lugar seguro (gerenciador de senhas). Para ver de novo depois, rode a função `mostrarChaves`.
8. A aba **Lançamentos** foi criada na planilha, com o cabeçalho.

## Passo 2 · Publicar o servidor como App da Web

1. No Apps Script: **Implantar > Nova implantação**.
2. Na engrenagem de "Selecionar tipo", escolha **App da Web**.
3. Preencha:
   - Descrição: `Buy Off v1`
   - **Executar como: Eu**
   - **Quem pode acessar: Qualquer pessoa**
4. Clique em **Implantar** e copie a **URL do app da Web** (termina em `/exec`).

> "Qualquer pessoa" é necessário para os celulares do chão de fábrica enviarem sem fazer login. Quem protege os dados são as chaves: sem a chave certa, o servidor recusa tudo.

## Passo 3 · Ligar o formulário ao servidor

Abra `app.js` e troque a linha:

```js
var ENDPOINT = 'COLE_AQUI_A_URL_DO_WEB_APP';
```

pela URL copiada, por exemplo:

```js
var ENDPOINT = 'https://script.google.com/macros/s/AKfycb...xyz/exec';
```

## Passo 4 · Publicar no GitHub Pages

1. Em <https://github.com/new>, crie um repositório (ex.: `apontamento-buyoff`). Pode ser público (veja "Segurança" sobre os nomes dos operadores).
2. **Add file > Upload files**: envie `index.html`, `app.js` e `README.md`. Confirme com **Commit changes**.
3. **Settings > Pages**: em *Build and deployment*, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**, e salve.
4. Em 1 a 2 minutos o site sai em `https://SEU-USUARIO.github.io/apontamento-buyoff/`.

## Passo 5 · Gerar o QR code (piloto: Lixação, Polimento e Tagliabue)

1. Abra o site e vá na aba **Controle**. Entre com a `CHAVE_CONTROLE`.
2. Abra **Link do QR code**, cole a `CHAVE_LANCAMENTO` e clique em **Gerar link**.
3. Copie o link e gere o QR code (ex.: no Chrome, menu ⋮ > *Compartilhar > Criar QR code*, que gera no aparelho, sem mandar o link a terceiros).
4. Imprima e cole o QR nos três setores do piloto.

Quando o operador lê o QR, a chave fica salva no aparelho e some da barra de endereço. Ele escolhe o setor (Lixação, Polimento ou Tagliabue) no próprio formulário; sem escolher, o envio é bloqueado.

> Ao ampliar para outros setores, adicione-os em `SETORES` no `app.js` **e** no `Code.gs` (o servidor recusa setor fora da lista) e publique uma nova versão do script. O mesmo QR continua valendo.

## Passo 6 · Testar

1. Leia o QR com o celular, escolha um dos três setores, faça um lançamento de teste e confira a linha nova na planilha.
2. No Controle, toque em **Atualizar** e veja o lançamento.
3. Apague a linha de teste direto na planilha.

## Usando os dados no Excel

- **Download manual:** na planilha, **Arquivo > Fazer download > Microsoft Excel (.xlsx)**.
- **Pelo formulário:** aba Controle > **Exportar CSV** (abre no Excel com acentos corretos).
- Correções e exclusões: edite a linha direto na planilha. **Não mude a ordem das colunas** (o servidor depende dela).

---

## Manutenção

| Situação | O que fazer |
|---|---|
| Mudou o `Code.gs` | **Implantar > Gerenciar implantações > ✏️ editar > Versão: Nova versão > Implantar**. A URL continua a mesma. |
| Novo setor (fim do piloto) ou código de defeito | Adicione nos **dois** arquivos (`Code.gs` e `app.js`), na mesma ordem. Código novo deve ir **no fim** da lista para não deslocar colunas antigas. |
| QR code ou chave vazou | Rode `trocarChaves` no Apps Script, gere o link de novo e reimprima o QR code. Aparelhos com a chave antiga passam a ser recusados. |
| Um operador saiu da empresa | Basta tirar o nome da lista `ops` em `app.js` (a lista é só sugestão). |

---

## Segurança

### O que está protegido

| Risco | Proteção |
|---|---|
| Qualquer pessoa com a URL do servidor enviar dados | Gravação exige `CHAVE_LANCAMENTO` (32 caracteres aleatórios, ~120 bits). Comparação em tempo constante. |
| Operador ou estranho ler os dados de produção | Leitura exige `CHAVE_CONTROLE`, separada. A chave de lançamento **não** lê nada. |
| Chaves expostas no GitHub | As chaves ficam nas Propriedades do script, nunca no código. O repositório só tem a URL do servidor, que sozinha não dá acesso. |
| Dados adulterados (números negativos, setor inventado, ruins > produção, data absurda) | O servidor revalida tudo e **recalcula** semana, peças ruins e refugo. Lista fechada de setores (só os 3 do piloto), turnos e códigos Q. Datas só de até 90 dias atrás e 1 dia à frente. |
| Injeção de fórmula na planilha/Excel (ex.: operador `=IMPORTXML(...)`) | Textos que começam com `= + - @` são gravados como texto. O CSV exportado aplica a mesma regra. |
| XSS (código malicioso digitado num campo aparecer no Controle) | Tudo é exibido como texto puro (`textContent`), nunca como HTML. Política de Segurança de Conteúdo (CSP) só permite scripts do próprio site e conexões com o Google. |
| Lançamento duplicado por internet ruim (clicar duas vezes, reenviar) | Cada lançamento tem um ID único; reenvio do mesmo ID não grava de novo. Aviso quando já existe lançamento do mesmo setor/data/turno. |
| Enxurrada de envios | Teto de 300 gravações a cada 10 minutos e limite de tamanho por requisição. |
| Vazamento de detalhes técnicos | Erros internos voltam só como `interno`; o detalhe fica no log do Apps Script. |
| Chave aparecendo em logs de servidor | A chave viaja no corpo do POST, não na URL. No link do QR ela fica depois do `#`, que o navegador não envia ao servidor, e é apagada da barra ao abrir. |

### Riscos que continuam (e como lidar)

1. **Quem tiver a foto do QR code consegue lançar.** É o preço de não exigir login no chão de fábrica. Se o QR vazar, rode `trocarChaves` e reimprima. Para lançar só com login, a alternativa é mudar o acesso para "Qualquer pessoa da [empresa]" (exige Google Workspace na empresa).
2. **Repositório público mostra os nomes dos operadores** (lista de sugestões em `app.js`) e o código. Se isso for um problema, apague a lista `ops` (o campo continua livre) ou use repositório privado (GitHub Pages privado exige plano pago).
3. **LGPD:** a planilha guarda nomes de funcionários ligados à produção e ao refugo. Avise a equipe sobre o registro, compartilhe a planilha só com quem precisa e evite conta pessoal de Gmail: os dados da empresa ficariam numa conta sua. Confirme com o James/TI qual conta usar.
4. **O dono da planilha é o ponto de controle.** O script roda com as permissões dele. Ative a verificação em duas etapas nessa conta e não compartilhe a planilha como "qualquer pessoa com o link".
5. **GitHub Pages não permite cabeçalhos HTTP próprios** (ex.: proibir a página de ser embutida em outro site). O risco é baixo aqui, porque não há botão perigoso de um clique.
6. **Rede da fábrica:** confirme com o TI que os aparelhos acessam `github.io`, `script.google.com` e `script.googleusercontent.com`.
