// Testes do núcleo do chatbot. Rode: node chatbot/test/teste.js
var assert = require('assert');
var n = require('../src/nucleo.js');
var dados = require('./dados-exemplo.js');

var HOJE = '2026-11-17'; // terça
var falhas = 0, ok = 0;
function t(nome, fn) {
  try { fn(); ok++; } catch (e) { falhas++; console.error('✗ ' + nome + '\n  ' + e.message); }
}
function cmd(txt) { return n.interpretar(txt, HOJE); }

// ---- interpretação --------------------------------------------------------
t('hoje', function () { var c = cmd('hoje'); assert.deepStrictEqual([c.tipo, c.ini, c.fim, c.setor], ['resumo', HOJE, HOJE, null]); });
t('barra e maiúsculas', function () { assert.strictEqual(cmd('/HOJE').ini, HOJE); });
t('ontem', function () { var c = cmd('ontem'); assert.strictEqual(c.ini, '2026-11-16'); assert.strictEqual(c.fim, '2026-11-16'); });
t('semana', function () { var c = cmd('semana'); assert.deepStrictEqual([c.ini, c.fim], ['2026-11-16', HOJE]); assert.ok(/Semana 47/.test(c.rotulo)); });
t('semana na segunda-feira tem um dia só', function () { assert.strictEqual(n.interpretar('semana', '2026-11-23').rotulo, 'Semana 48 · seg 23/11/2026'); });
t('mês no dia 1º', function () { assert.strictEqual(n.interpretar('mes', '2026-12-01').rotulo, 'Mês 12/2026 · ter 01/12/2026'); });
t('semana passada', function () { var c = cmd('semana passada'); assert.deepStrictEqual([c.ini, c.fim], ['2026-11-09', '2026-11-15']); });
t('mês com acento', function () { var c = cmd('mês'); assert.deepStrictEqual([c.ini, c.fim], ['2026-11-01', HOJE]); });
t('mes passado', function () { var c = cmd('mes passado'); assert.deepStrictEqual([c.ini, c.fim], ['2026-10-01', '2026-10-31']); });
t('mes passado em janeiro', function () { var c = n.interpretar('mes passado', '2027-01-10'); assert.deepStrictEqual([c.ini, c.fim], ['2026-12-01', '2026-12-31']); });
t('data dd/mm', function () { var c = cmd('13/11'); assert.deepStrictEqual([c.ini, c.fim], ['2026-11-13', '2026-11-13']); });
t('data sem ano no futuro vira ano anterior', function () { assert.strictEqual(n.interpretar('28/12', '2027-01-05').ini, '2026-12-28'); });
t('data inválida', function () { assert.strictEqual(cmd('31/02').tipo, 'erro'); });
t('período', function () { var c = cmd('10/11 a 16/11'); assert.deepStrictEqual([c.ini, c.fim], ['2026-11-10', '2026-11-16']); });
t('período invertido', function () { var c = cmd('16/11/2026 - 10/11/2026'); assert.deepStrictEqual([c.ini, c.fim], ['2026-11-10', '2026-11-16']); });
t('período grande demais', function () { assert.strictEqual(cmd('01/01/2026 a 16/11/2026').tipo, 'erro'); });
t('data futura', function () { assert.strictEqual(cmd('18/11/2026').tipo, 'erro'); });
t('setor', function () { var c = cmd('semana ibotic'); assert.strictEqual(c.setor, 'ibotic'); assert.strictEqual(c.ini, '2026-11-16'); });
t('setor sozinho = hoje', function () { var c = cmd('polimento'); assert.deepStrictEqual([c.ini, c.setor], [HOJE, 'polimento']); });
t('madeirado uv ganha de uv', function () { assert.strictEqual(cmd('ontem madeirado uv').setor, 'madeirado-uv'); });
t('uv', function () { assert.strictEqual(cmd('hoje uv').setor, 'madeirado-uv'); });
t('colorido', function () { assert.strictEqual(cmd('Madeirado Colorido semana').setor, 'madeirado-colorido'); });
t('defeitos', function () { var c = cmd('defeitos semana'); assert.deepStrictEqual([c.tipo, c.ini], ['defeitos', '2026-11-16']); });
t('pendentes', function () { var c = cmd('pendentes'); assert.deepStrictEqual([c.tipo, c.ini], ['pendentes', HOJE]); });
t('pendentes ontem', function () { assert.strictEqual(cmd('faltando ontem').ini, '2026-11-16'); });
t('ajuda', function () { assert.strictEqual(cmd('ajuda').tipo, 'ajuda'); assert.strictEqual(cmd('bom dia').tipo, 'ajuda'); });
t('não entendi', function () { var c = cmd('qual a previsão do tempo'); assert.strictEqual(c.tipo, 'ajuda'); assert.ok(c.naoEntendi); });

t('vários setores no comando', function () {
  var c = cmd('semana ibotic polimento');
  assert.deepStrictEqual([c.setor, c.setores], [null, ['ibotic', 'polimento']]);
  assert.deepStrictEqual(cmd('ontem uv e colorido').setores, ['madeirado-uv', 'madeirado-colorido']);
  assert.deepStrictEqual(cmd('hoje ibotic').setores, ['ibotic']);
});

// ---- cálculo ---------------------------------------------------------------
t('agrega hoje (pilhas e peças separadas)', function () {
  var a = n.agrega(n.filtrar(dados, cmd('hoje')));
  assert.deepStrictEqual([a.n, a.pecas, a.pilhas, a.ruins], [3, 800, 39, 38]);
});
t('produção não contada não soma', function () {
  var a = n.agrega(n.filtrar(dados, cmd('12/11')));
  assert.deepStrictEqual([a.ruins, a.pecas, a.pilhas], [3, 0, 0]);
});
t('filtro com vários setores', function () {
  var c = n.aplicarSetores(cmd('semana'), ['ibotic', 'polimento']);
  assert.strictEqual(n.filtrar(dados, c).length, 5);
});
t('faltando hoje', function () {
  var f = n.faltando(dados, HOJE);
  var m = {}; f.forEach(function (x) { m[x.setor] = x.turnos.join('+'); });
  assert.deepStrictEqual(m, { 'tagliabue': 'Noite', 'ibotic': 'Noite', 'polimento': 'Dia+Noite',
    'madeirado-uv': 'Noite', 'madeirado-colorido': 'Dia+Noite' });
});
t('ninguém faltando ontem', function () { assert.strictEqual(n.faltando(dados, '2026-11-16').length, 0); });

// ---- texto (só peças ruins e lançamentos: sem produção e sem refugo) ----------------
function semProducao(s) { assert.ok(!/refugo|\d pilhas?|pç|produç/i.test(s), 'texto com refugo/produção:\n' + s); }
t('texto do resumo de hoje', function () {
  var s = n.responder(cmd('hoje'), dados, HOJE);
  assert.ok(s.indexOf('*Total:* 38 peças ruins · 3 lançamentos') >= 0, s);
  assert.ok(s.indexOf('*TAGLIABUE* · Dia ✓ Noite ✗\n22 peças ruins · 1 lançamento') >= 0, s);
  assert.ok(s.indexOf('Q72 Pintura escorrida (12)') >= 0, s);
  assert.ok(s.indexOf('*POLIMENTO* · sem lançamento') >= 0, s);
  assert.ok(s.indexOf('Ainda sem lançamento hoje') >= 0, s);
  semProducao(s);
});
t('texto com dois setores mostra só os dois', function () {
  var s = n.responder(n.aplicarSetores(cmd('semana'), ['ibotic', 'polimento']), dados, HOJE);
  assert.ok(/· IBOTIC, POLIMENTO/.test(s) && /\*Total:\* 24 peças ruins · 5 lançamentos/.test(s), s);
  assert.ok(s.indexOf('TAGLIABUE') < 0, s);
  semProducao(s);
});
t('texto do setor na semana tem turno e dia', function () {
  var s = n.responder(cmd('semana tagliabue'), dados, HOJE);
  assert.ok(/Por dia/.test(s) && /seg 16\/11: 29 peças ruins · 2 lançamentos/.test(s), s);
  assert.ok(/Noite: 9 peças ruins · 1 lançamento/.test(s), s);
  semProducao(s);
});
t('texto de defeitos', function () {
  var s = n.responder(cmd('defeitos ontem'), dados, HOJE);
  assert.ok(s.indexOf('1. *Q72* Pintura escorrida: 20') >= 0, s);
  assert.ok(s.indexOf('*Total:* 51 peças ruins · 10 lançamentos') >= 0, s);
  semProducao(s);
});
t('sem lançamentos', function () { assert.ok(/Nenhum lançamento/.test(n.responder(cmd('01/11'), dados, HOJE))); });
t('pendentes ontem ok', function () { assert.ok(/Todos os setores/.test(n.responder(cmd('pendentes ontem'), dados, HOJE))); });
t('erro vira mensagem', function () { assert.ok(/Data inválida/.test(n.responder(cmd('31/02'), dados, HOJE))); });

// ---- conversa: relatorio → menu → setor → relatório; sair encerra -----------------
var AGORA = Date.UTC(2026, 10, 17, 15, 0, 0), MIN = 60000;
function cv(txt, estado, grupo) { return n.conversa(txt, estado, AGORA, HOJE, !!grupo); }
function aberto(etapa, opcao) { var e = { ate: AGORA + 10 * MIN, etapa: etapa || 'menu' }; if (opcao !== undefined) e.opcao = opcao; return e; }
t('relatorio abre o menu (maiúscula, minúscula e acento)', function () {
  ['relatorio', 'Relatorio', 'RELATÓRIO', 'relatório', ' Relatório! ', '/relatorio', 'Relatórios'].forEach(function (x) {
    var r = cv(x, null);
    assert.strictEqual(r.cmd.tipo, 'menu', x);
    assert.deepStrictEqual(r.estado, { ate: AGORA + n.SESSAO_MINUTOS * MIN, etapa: 'menu' }, x);
  });
});
t('texto do menu', function () {
  var s = n.responder({ tipo: 'menu' });
  assert.ok(/1️⃣ Hoje/.test(s) && /7️⃣ Quem ainda não lançou hoje/.test(s) && /sair/.test(s), s);
  assert.ok(!/ativad|bem-vindo/i.test(s), s);
});
t('número do menu pergunta o setor', function () {
  var r = cv('3', aberto());
  assert.deepStrictEqual([r.cmd.tipo, r.cmd.opcao, r.estado.etapa, r.estado.opcao], ['menuSetor', 2, 'setor', 2]);
  var s = n.responder(r.cmd);
  assert.ok(/Qual setor\?\* · Esta semana/.test(s) && /0️⃣ Todos/.test(s) && /5️⃣ Madeirado Colorido/.test(s) && /vários/.test(s), s);
});
t('setor 0 = todos', function () {
  var r = cv('0', aberto('setor', 2));
  assert.deepStrictEqual([r.cmd.tipo, r.cmd.ini, r.cmd.setores, r.estado.etapa], ['resumo', '2026-11-16', null, 'menu']);
  assert.ok(r.cmd.rodape);
});
t('vários setores: "2 3", "2,3", "2 e 3", "23"', function () {
  ['2 3', '2,3', '2 e 3', '23', '3, 2'].forEach(function (x) {
    assert.deepStrictEqual(cv(x, aberto('setor', 0)).cmd.setores, ['ibotic', 'polimento'], x);
  });
});
t('um setor só vira relatório detalhado', function () {
  var c = cv('1', aberto('setor', 2)).cmd;
  assert.deepStrictEqual([c.setor, c.setores], ['tagliabue', ['tagliabue']]);
});
t('setor pelo nome também vale', function () {
  assert.deepStrictEqual(cv('ibotic e polimento', aberto('setor', 2)).cmd.setores, ['ibotic', 'polimento']);
});
t('setor inválido pergunta de novo', function () {
  var r = cv('9', aberto('setor', 1));
  assert.deepStrictEqual([r.cmd.tipo, r.estado.etapa, r.estado.opcao], ['menuSetor', 'setor', 1]);
  assert.ok(/Opção inválida/.test(n.responder(r.cmd)));
});
t('defeitos da semana com setor', function () {
  var c = cv('2', aberto('setor', 5)).cmd;
  assert.deepStrictEqual([c.tipo, c.ini, c.setor], ['defeitos', '2026-11-16', 'ibotic']);
});
t('quem não lançou não pergunta setor', function () {
  var r = cv('7', aberto());
  assert.deepStrictEqual([r.cmd.tipo, r.estado.etapa], ['pendentes', 'menu']);
});
t('número fora do menu', function () { assert.ok(/Opção inválida/.test(n.responder(cv('9', aberto()).cmd))); });
t('menu volta ao início', function () { assert.strictEqual(cv('menu', aberto('setor', 2)).cmd.tipo, 'menu'); });
t('comandos escritos continuam valendo', function () {
  var c = cv('semana ibotic', aberto()).cmd;
  assert.deepStrictEqual([c.tipo, c.setor], ['resumo', 'ibotic']);
  assert.strictEqual(cv('Relatório semana ibotic', null).cmd.setor, 'ibotic');
});
t('texto qualquer mostra o menu com "não entendi"', function () {
  assert.ok(/Não entendi/.test(n.responder(cv('qual a previsão do tempo', aberto()).cmd)));
});
t('relatório tem rodapé com menu e sair', function () {
  assert.ok(/\*menu\* para outro relatório · \*sair\* para encerrar/.test(n.responder(cv('0', aberto('setor', 0)).cmd, dados, HOJE)));
});
t('sem relatorio antes, o bot fica quieto', function () {
  ['hoje', 'oi', 'tudo bem?', 'semana', '1'].forEach(function (x) { assert.strictEqual(cv(x, null).cmd, null, x); });
});
t('conversa vencida volta a ficar quieta', function () { assert.strictEqual(cv('1', { ate: AGORA - 1, etapa: 'menu' }).cmd, null); });
t('estado no formato antigo (só o prazo) ainda funciona', function () { assert.strictEqual(cv('7', AGORA + MIN).cmd.tipo, 'pendentes'); });
t('sair encerra (maiúscula e minúscula)', function () {
  ['sair', 'Sair', 'SAIR', 'sair.', '/sair'].forEach(function (x) {
    var r = cv(x, aberto());
    assert.deepStrictEqual([r.estado, r.cmd.tipo], [null, 'aviso'], x);
    assert.ok(/encerrados/.test(n.responder(r.cmd)));
  });
});
t('sair com a conversa fechada não responde', function () { assert.strictEqual(cv('sair', null).cmd, null); });
t('palavras parecidas não abrem nem fecham', function () {
  assert.strictEqual(cv('relatoriozinho', null).cmd, null);
  assert.notStrictEqual(cv('sairam 3 peças', aberto()).estado, null);
});
t('em grupo valem os comandos com barra', function () {
  assert.strictEqual(cv('/hoje', null, true).cmd.tipo, 'resumo');
  assert.strictEqual(cv('/sair', null, true).cmd, null);
  assert.ok(/Comandos/.test(n.responder(cv('/relatorio', null, true).cmd)));
  assert.strictEqual(cv('/semana ibotic uv', null, true).cmd.setores.length, 2);
  assert.strictEqual(cv('/hoje', null, true).estado, null);
});

// ---- painel de gráficos (foto) -------------------------------------------------
t('sem gráfico para um dia só, ajuda, pendentes e erro', function () {
  ['hoje', 'ontem', '13/11', 'ajuda', 'pendentes', '31/02'].forEach(function (c) {
    assert.strictEqual(n.graficoRelatorio(cmd(c), dados), null, c);
  });
});
t('sem gráfico quando não há lançamento no período', function () {
  assert.strictEqual(n.graficoRelatorio(cmd('01/10 a 20/10'), dados), null);
});
t('gráfico da semana: produção em pilhas, sem refugo', function () {
  var g = n.graficoRelatorio(cmd('semana'), dados);
  assert.ok(g && g.largura === 1080 && g.altura > 1000 && g.altura < 2200, JSON.stringify(g && [g.largura, g.altura]));
  assert.ok(g.html.indexOf('Semana 47') >= 0);
  assert.ok(g.html.indexOf('>134 pilhas<') >= 0, 'cartão de produção em pilhas');
  assert.ok(g.html.indexOf('+ 2.150 peças') >= 0, 'peças da IBOTIC ao lado');
  assert.ok(g.html.indexOf('Peças ruins por setor') >= 0 && g.html.indexOf('TAGLIABUE') >= 0);
  assert.ok(g.html.indexOf('>Principais defeitos<') >= 0, 'título sem parênteses');
  assert.ok(!/refugo/i.test(g.html), 'achou refugo no gráfico');
  assert.strictEqual(g.legenda, '📊 *Buy Off · Pintura*\n_Semana 47 · 16/11 a 17/11/2026_\n89 peças ruins · 13 lançamentos');
});
t('gráfico não carrega nada de fora nem roda script', function () {
  var h = n.graficoRelatorio(cmd('mes'), dados).html.replace('xmlns="http://www.w3.org/2000/svg"', '');
  assert.ok(!/<script|src=|href=|url\(|@import|https?:/i.test(h), 'achou referência externa');
});
t('gráfico do setor compara turnos', function () {
  var g = n.graficoRelatorio(cmd('semana tagliabue'), dados);
  assert.ok(g.html.indexOf('Peças ruins por turno') >= 0 && g.html.indexOf('Pintura · TAGLIABUE') >= 0);
});
t('gráfico só da IBOTIC mostra a produção em peças', function () {
  var g = n.graficoRelatorio(cmd('semana ibotic'), dados);
  assert.ok(g.html.indexOf('>2.150 peças<') >= 0 && g.html.indexOf('>peças<') >= 0);
});
t('gráfico com dois setores mostra só os dois', function () {
  var g = n.graficoRelatorio(n.aplicarSetores(cmd('semana'), ['ibotic', 'polimento']), dados);
  assert.ok(g.html.indexOf('IBOTIC, POLIMENTO') >= 0 && g.html.indexOf('>TAGLIABUE<') < 0);
});
t('gráfico de defeitos', function () {
  assert.ok(n.graficoRelatorio(cmd('defeitos semana'), dados).html.indexOf('Defeitos') >= 0);
});
t('período longo agrupa por semana', function () {
  var g = n.graficoRelatorio(cmd('01/10 a 17/11'), dados);
  assert.ok(g.html.indexOf('por semana') >= 0 && g.html.indexOf('>S47<') >= 0);
});
t('números do gráfico sempre válidos', function () {
  ['semana', 'semana passada', 'mes', 'defeitos semana', 'semana ibotic', '12/11 a 17/11', 'semana uv colorido'].forEach(function (c) {
    var g = n.graficoRelatorio(cmd(c), dados);
    assert.ok(g && !/NaN|undefined|Infinity/.test(g.html), c);
  });
});
t('escala redonda do eixo', function () {
  assert.deepStrictEqual([n.teto(0), n.teto(7), n.teto(1900), n.teto(2300), n.teto(6400)], [1, 10, 2000, 2500, 10000]);
});

// ---- eventos do WAHA ---------------------------------------------------------
var AUT = '5511987654321, 120363000000000001@g.us, 99887766@lid';
function ev(payload, event) { return { event: event || 'message', session: 'default', payload: payload }; }
t('mensagem privada autorizada (número com 9)', function () {
  var r = n.lerEvento(ev({ id: 'm1', from: '5511987654321@c.us', body: 'hoje', fromMe: false }), AUT);
  assert.deepStrictEqual(r, { chatId: '5511987654321@c.us', texto: 'hoje', msgId: 'm1' });
});
t('número sem o 9 também vale', function () {
  assert.ok(n.lerEvento(ev({ from: '551187654321@c.us', body: 'hoje' }), AUT).texto);
});
t('lid autorizado', function () { assert.ok(n.lerEvento(ev({ from: '99887766@lid', body: 'hoje' }), AUT).texto); });
t('lid com telefone no _data (NOWEB)', function () {
  assert.ok(n.lerEvento(ev({ from: '11112222@lid', body: 'hoje', _data: { key: { remoteJidAlt: '5511987654321@s.whatsapp.net' } } }), AUT).texto);
});
t('não autorizado', function () { assert.ok(n.lerEvento(ev({ from: '5521999990000@c.us', body: 'hoje' }), AUT).negado); });
t('grupo autorizado com barra', function () {
  var r = n.lerEvento(ev({ from: '120363000000000001@g.us', participant: '5521999990000@c.us', body: '/semana' }), AUT);
  assert.strictEqual(r.chatId, '120363000000000001@g.us');
});
t('grupo sem barra é ignorado', function () {
  assert.strictEqual(n.lerEvento(ev({ from: '120363000000000001@g.us', participant: '5511987654321@c.us', body: 'hoje' }), AUT), null);
});
t('pessoa autorizada em grupo qualquer', function () {
  assert.ok(n.lerEvento(ev({ from: '120363999@g.us', participant: '5511987654321@c.us', body: '/hoje' }), AUT).texto);
});
t('mensagem própria ignorada', function () { assert.strictEqual(n.lerEvento(ev({ from: '5511987654321@c.us', body: 'hoje', fromMe: true }), AUT), null); });
t('status ignorado', function () { assert.strictEqual(n.lerEvento(ev({ from: 'status@broadcast', body: 'hoje' }), AUT), null); });
t('outro evento ignorado', function () { assert.strictEqual(n.lerEvento(ev({ from: '5511987654321@c.us', body: 'x' }, 'session.status'), AUT), null); });
t('mídia sem texto ignorada', function () { assert.strictEqual(n.lerEvento(ev({ from: '5511987654321@c.us', body: '', hasMedia: true }), AUT), null); });
t('lista vazia nega tudo', function () { assert.ok(n.lerEvento(ev({ from: '5511987654321@c.us', body: 'hoje' }), '').negado); });

// ---- datas no fuso de São Paulo -----------------------------------------------
t('hoje no fuso de SP (01:30 UTC ainda é o dia anterior)', function () {
  assert.strictEqual(n.hojeISO(new Date('2026-11-18T01:30:00Z')), '2026-11-17');
});

// ---- workflow gerado está em dia com o núcleo -------------------------------
t('workflows/buyoff-chatbot.json atualizado (rode node chatbot/build-workflow.js)', function () {
  var fs = require('fs'), path = require('path');
  var corpo = fs.readFileSync(path.join(__dirname, '..', 'src', 'nucleo.js'), 'utf8').replace(/\nif \(typeof module[\s\S]*$/, '\n').trim();
  var wf = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'workflows', 'buyoff-chatbot.json'), 'utf8'));
  var codigos = wf.nodes.filter(function (x) { return x.type === 'n8n-nodes-base.code'; });
  assert.strictEqual(codigos.length, 2);
  codigos.forEach(function (x) { assert.ok(x.parameters.jsCode.indexOf(corpo) >= 0, 'nó ' + x.name + ' desatualizado'); });
});

console.log((falhas ? '✗ ' : '✓ ') + ok + ' ok, ' + falhas + ' falha(s)');
if (process.argv.indexOf('--mostrar') >= 0) {
  console.log('\n──── menu ────\n' + n.responder({ tipo: 'menu' }));
  console.log('\n──── menu de setores ────\n' + n.responder({ tipo: 'menuSetor', opcao: 2 }));
  ['hoje', 'ontem', 'semana tagliabue', 'defeitos semana', 'pendentes'].forEach(function (c) {
    console.log('\n──── ' + c + ' ────\n' + n.responder(cmd(c), dados, HOJE));
  });
}
process.exit(falhas ? 1 : 0);
