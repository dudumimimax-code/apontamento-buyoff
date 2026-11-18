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

// ---- cálculo ---------------------------------------------------------------
t('agrega hoje', function () {
  var a = n.agrega(n.filtrar(dados, cmd('hoje')));
  assert.strictEqual(a.n, 3);
  assert.strictEqual(a.pecas, 2000);
  assert.strictEqual(a.pilhas, 15);
  assert.strictEqual(a.ruins, 38);
  assert.strictEqual(a.ruinsPeca, 34);          // os 4 da pilha não entram no refugo
  assert.ok(Math.abs(a.refugo - 34 / 2000) < 1e-9);
});
t('produção não contada não entra no refugo', function () {
  var a = n.agrega(n.filtrar(dados, cmd('12/11')));
  assert.strictEqual(a.ruins, 3); assert.strictEqual(a.pecas, 0); assert.strictEqual(a.refugo, null);
});
t('faltando hoje', function () {
  var f = n.faltando(dados, HOJE);
  var m = {}; f.forEach(function (x) { m[x.setor] = x.turnos.join('+'); });
  assert.deepStrictEqual(m, { 'tagliabue': 'Noite', 'ibotic': 'Noite', 'polimento': 'Dia+Noite',
    'madeirado-uv': 'Noite', 'madeirado-colorido': 'Dia+Noite' });
});
t('ninguém faltando ontem', function () { assert.strictEqual(n.faltando(dados, '2026-11-16').length, 0); });

// ---- texto ------------------------------------------------------------------
t('texto do resumo de hoje', function () {
  var s = n.responder(cmd('hoje'), dados, HOJE);
  assert.ok(s.indexOf('*Total:* 2.000 pç · 15 pilhas · 38 ruins · *refugo 1,7%*') >= 0, s);
  assert.ok(s.indexOf('*TAGLIABUE* · refugo 1,8%') >= 0, s);
  assert.ok(s.indexOf('Q72 Pintura escorrida (12)') >= 0, s);
  assert.ok(s.indexOf('*POLIMENTO* · sem lançamento') >= 0, s);
  assert.ok(s.indexOf('Ainda sem lançamento hoje') >= 0, s);
});
t('texto do setor na semana tem quebra por dia', function () {
  var s = n.responder(cmd('semana tagliabue'), dados, HOJE);
  assert.ok(/Por dia/.test(s) && /seg 16\/11: 1\.900 pç/.test(s), s);
  assert.ok(/Noite: 900 pç/.test(s), s);
});
t('texto de defeitos', function () {
  var s = n.responder(cmd('defeitos ontem'), dados, HOJE);
  assert.ok(s.indexOf('1. *Q72* Pintura escorrida: 20') >= 0, s);
});
t('sem lançamentos', function () { assert.ok(/Nenhum lançamento/.test(n.responder(cmd('01/11'), dados, HOJE))); });
t('pendentes ontem ok', function () { assert.ok(/Todos os setores/.test(n.responder(cmd('pendentes ontem'), dados, HOJE))); });
t('erro vira mensagem', function () { assert.ok(/Data inválida/.test(n.responder(cmd('31/02'), dados, HOJE))); });

// ---- relatorio liga, sair desliga ------------------------------------------------
var AGORA = Date.UTC(2026, 10, 17, 15, 0, 0), MIN = 60000;
function cs(txt, ativoAte, grupo) { return n.controleSessao(txt, ativoAte, AGORA, !!grupo); }
t('relatorio liga (maiúscula, minúscula e acento)', function () {
  ['relatorio', 'Relatorio', 'RELATÓRIO', 'relatório', ' Relatório! ', '/relatorio', 'Relatórios'].forEach(function (x) {
    var r = cs(x, null);
    assert.strictEqual(r.acao, 'abrir', x); assert.strictEqual(r.resto, '', x);
    assert.strictEqual(r.ativoAte, AGORA + n.SESSAO_MINUTOS * MIN, x);
  });
});
t('relatorio com comando já responde', function () {
  var r = cs('Relatório semana ibotic', null);
  assert.deepStrictEqual([r.acao, r.resto], ['abrir', 'semana ibotic']);
});
t('sem relatorio antes, o bot fica quieto', function () {
  ['hoje', 'oi', 'tudo bem?', 'semana'].forEach(function (x) { assert.strictEqual(cs(x, null).acao, 'ignorar', x); });
});
t('conversa ligada responde e renova o prazo', function () {
  var r = cs('semana', AGORA + 5 * MIN);
  assert.deepStrictEqual([r.acao, r.resto, r.ativoAte], ['comando', 'semana', AGORA + n.SESSAO_MINUTOS * MIN]);
});
t('conversa vencida volta a ficar quieta', function () { assert.strictEqual(cs('hoje', AGORA - 1).acao, 'ignorar'); });
t('sair desliga (maiúscula e minúscula)', function () {
  ['sair', 'Sair', 'SAIR', 'sair.', '/sair'].forEach(function (x) {
    assert.deepStrictEqual(cs(x, AGORA + MIN), { acao: 'sair', ativoAte: null }, x);
  });
});
t('sair com a conversa desligada não responde', function () { assert.strictEqual(cs('sair', null).acao, 'ignorar'); });
t('palavras parecidas não ligam nem desligam', function () {
  assert.strictEqual(cs('relatoriozinho', null).acao, 'ignorar');
  assert.strictEqual(cs('sairam 3 peças', AGORA + MIN).acao, 'comando');
});
t('em grupo a barra basta e sair é ignorado', function () {
  assert.strictEqual(cs('/hoje', null, true).acao, 'comando');
  assert.strictEqual(cs('/sair', null, true).acao, 'ignorar');
  assert.strictEqual(cs('/relatorio', null, true).ativoAte > AGORA, true);
});
t('mensagens de ligar e sair', function () {
  assert.ok(/Relatórios ativados/.test(n.responder({ tipo: 'ajuda', abertura: true })));
  assert.ok(/sair/.test(n.responder({ tipo: 'ajuda' })));
  assert.ok(/encerrados/.test(n.responder({ tipo: 'aviso', msg: n.textoSair() })));
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
t('gráfico da semana', function () {
  var g = n.graficoRelatorio(cmd('semana'), dados);
  assert.ok(g && g.largura === 1080 && g.altura > 1000 && g.altura < 2200, JSON.stringify(g && [g.largura, g.altura]));
  assert.ok(g.html.indexOf('Semana 47') >= 0);
  assert.ok(g.html.indexOf('Refugo por setor') >= 0 && g.html.indexOf('TAGLIABUE') >= 0);
  assert.ok(g.html.indexOf('Pintura escorrida') >= 0);
  assert.ok(/refugo 1,\d%/.test(g.legenda), g.legenda);
});
t('gráfico não carrega nada de fora nem roda script', function () {
  var h = n.graficoRelatorio(cmd('mes'), dados).html.replace('xmlns="http://www.w3.org/2000/svg"', '');
  assert.ok(!/<script|src=|href=|url\(|@import|https?:/i.test(h), 'achou referência externa');
});
t('gráfico do setor compara turnos', function () {
  var g = n.graficoRelatorio(cmd('semana tagliabue'), dados);
  assert.ok(g.html.indexOf('Refugo por turno') >= 0 && g.html.indexOf('Pintura · TAGLIABUE') >= 0);
});
t('gráfico de defeitos', function () {
  assert.ok(n.graficoRelatorio(cmd('defeitos semana'), dados).html.indexOf('Defeitos') >= 0);
});
t('período longo agrupa por semana', function () {
  var g = n.graficoRelatorio(cmd('01/10 a 17/11'), dados);
  assert.ok(g.html.indexOf('por semana') >= 0 && g.html.indexOf('>S47<') >= 0);
});
t('gráfico só com pilhas não quebra', function () {
  var g = n.graficoRelatorio(cmd('16/11 a 17/11 uv'), dados.filter(function (r) { return r.unidade === 'Pilha'; }));
  assert.ok(g.html.indexOf('pilhas') >= 0 && !/NaN|undefined|Infinity/.test(g.html));
});
t('números do gráfico sempre válidos', function () {
  ['semana', 'semana passada', 'mes', 'defeitos semana', 'semana ibotic', '12/11 a 17/11'].forEach(function (c) {
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
  ['ajuda', 'hoje', 'ontem', 'semana tagliabue', 'defeitos semana', 'pendentes'].forEach(function (c) {
    console.log('\n──── ' + c + ' ────\n' + n.responder(cmd(c), dados, HOJE));
  });
}
process.exit(falhas ? 1 : 0);
