#!/usr/bin/env node
/*
 * Gera chatbot/workflows/buyoff-chatbot.json (para importar no n8n) a partir de src/nucleo.js.
 * Rode depois de mudar o nucleo.js:  node chatbot/build-workflow.js
 *
 * Segredos (chaves, tokens) NÃO entram no workflow: os nós leem do ambiente ($env),
 * que vem do arquivo .env do docker compose.
 */
var fs = require('fs');
var path = require('path');

var nucleo = fs.readFileSync(path.join(__dirname, 'src', 'nucleo.js'), 'utf8')
  .replace(/\nif \(typeof module[\s\S]*$/, '\n') // o export é só para os testes
  .trim();

var AVISO = '// GERADO por chatbot/build-workflow.js a partir de chatbot/src/nucleo.js.\n' +
  '// Para mudar a lógica, edite o nucleo.js, rode o build e reimporte (mudanças feitas aqui se perdem).\n\n';

var interpretar = AVISO + nucleo + '\n\n' + [
  '// ===================== nó: Interpretar =====================',
  'const cfg = $input.first().json;',
  'const hoje = hojeISO();',
  'const sessao = cfg.sessao || "default";',
  '',
  'if (cfg.headers || cfg.body) {',
  '  // Veio do WAHA (webhook). O token prova que foi o nosso WAHA que chamou.',
  '  if (!cfg.tokenOk) throw new Error("Webhook recusado: cabeçalho X-Buyoff-Token ausente ou errado.");',
  '  const ev = cfg.body || {};',
  '  if (ev.session && ev.session !== sessao) return [];',
  '  const m = lerEvento(ev, cfg.autorizados);',
  '  if (!m) return [];',
  '  if (m.negado) {',
  '    // Ninguém de fora recebe resposta. Para liberar, ponha um destes ids em BUYOFF_AUTORIZADOS:',
  '    console.log("Mensagem de remetente não autorizado:", m.chatId, m.remetentes.join(", "));',
  '    return [];',
  '  }',
  '  return [{ json: { chatId: m.chatId, replyTo: m.msgId, session: sessao, agendado: false, cmd: interpretar(m.texto, hoje) } }];',
  '}',
  '',
  '// Disparo agendado: relatório de ontem para cada destino (e o da semana passada às segundas).',
  'const destinos = String(cfg.destinos || "").split(/[,;\\s]+/).filter(d => /@(c\\.us|g\\.us|lid)$/.test(d));',
  'const ontem = somaDias(hoje, -1);',
  'const itens = [];',
  'for (const chatId of destinos) {',
  '  // domingo costuma não ter produção: só manda se houver lançamento',
  '  itens.push({ json: { chatId, session: sessao, agendado: true, pularSeVazio: diaDaSemana(ontem) === 0, cmd: interpretar("ontem", hoje) } });',
  '  if (diaDaSemana(hoje) === 1) itens.push({ json: { chatId, session: sessao, agendado: true, cmd: interpretar("semana passada", hoje) } });',
  '}',
  'return itens;'
].join('\n');

var montar = AVISO + nucleo + '\n\n' + [
  '// ===================== nó: Montar resposta =====================',
  'const res = $input.first().json || {};',
  'const hoje = hojeISO();',
  'let regs = null, erro = null;',
  'if (res.ok === true && Array.isArray(res.registros)) regs = res.registros;',
  'else if (res.erro === "chave_invalida") erro = "A chave de controle do chatbot está errada (BUYOFF_CHAVE_CONTROLE no .env).";',
  'else erro = "Não consegui ler a planilha agora. Tente de novo em alguns minutos.";',
  '',
  'const saida = [];',
  'for (const it of $("Interpretar").all()) {',
  '  const c = it.json;',
  '  const base = { session: c.session, chatId: c.chatId, replyTo: c.replyTo || null };',
  '  const precisaDados = c.cmd.tipo !== "ajuda" && c.cmd.tipo !== "erro";',
  '  if (precisaDados && erro) {',
  '    if (c.agendado) throw new Error("Relatório agendado não enviado: " + erro + " Resposta: " + JSON.stringify(res).slice(0, 300));',
  '    saida.push({ json: Object.assign(base, { text: "⚠️ " + erro }) });',
  '    continue;',
  '  }',
  '  if (c.pularSeVazio && !filtrar(regs, c.cmd).length) continue;',
  '  saida.push({ json: Object.assign(base, { text: responder(c.cmd, regs, hoje) }) });',
  '}',
  'return saida;'
].join('\n');

function no(id, name, type, typeVersion, position, parameters, extra) {
  return Object.assign({ id: id, name: name, type: type, typeVersion: typeVersion, position: position, parameters: parameters }, extra || {});
}

var nodes = [
  no('b0f4a3c2-0001-4e6a-9a51-000000000001', 'WAHA: mensagem recebida', 'n8n-nodes-base.webhook', 2, [0, 0], {
    httpMethod: 'POST', path: 'waha-buyoff', responseMode: 'onReceived', options: {}
  }, { webhookId: 'b0f4a3c2-0001-4e6a-9a51-0000000000aa' }),

  no('b0f4a3c2-0002-4e6a-9a51-000000000002', 'Todo dia 07:00', 'n8n-nodes-base.scheduleTrigger', 1.2, [0, 220], {
    rule: { interval: [{ field: 'cronExpression', expression: '0 7 * * *' }] }
  }),

  no('b0f4a3c2-0003-4e6a-9a51-000000000003', 'Config', 'n8n-nodes-base.set', 3.4, [240, 100], {
    mode: 'manual',
    includeOtherFields: true,
    assignments: { assignments: [
      { id: 'c1', name: 'tokenOk', type: 'boolean',
        value: "={{ !!$env.BUYOFF_WEBHOOK_TOKEN && (($json.headers || {})['x-buyoff-token'] === $env.BUYOFF_WEBHOOK_TOKEN) }}" },
      { id: 'c2', name: 'autorizados', type: 'string', value: "={{ $env.BUYOFF_AUTORIZADOS || '' }}" },
      { id: 'c3', name: 'destinos', type: 'string', value: "={{ $env.BUYOFF_DESTINOS_AGENDADOS || '' }}" },
      { id: 'c4', name: 'sessao', type: 'string', value: "={{ $env.WAHA_SESSAO || 'default' }}" }
    ] },
    options: {}
  }),

  no('b0f4a3c2-0004-4e6a-9a51-000000000004', 'Interpretar', 'n8n-nodes-base.code', 2, [480, 100], {
    jsCode: interpretar
  }),

  no('b0f4a3c2-0005-4e6a-9a51-000000000005', 'Buscar lançamentos (planilha)', 'n8n-nodes-base.httpRequest', 4.2, [720, 100], {
    method: 'POST',
    url: '={{ $env.BUYOFF_APPS_SCRIPT_URL }}',
    sendBody: true,
    contentType: 'raw',
    rawContentType: 'text/plain',
    body: "={{ JSON.stringify({ acao: 'listar', chave: $env.BUYOFF_CHAVE_CONTROLE }) }}",
    options: { timeout: 60000, response: { response: { responseFormat: 'json' } } }
  }, { executeOnce: true, retryOnFail: true, maxTries: 3, waitBetweenTries: 3000, onError: 'continueRegularOutput' }),

  no('b0f4a3c2-0006-4e6a-9a51-000000000006', 'Montar resposta', 'n8n-nodes-base.code', 2, [960, 100], {
    jsCode: montar
  }),

  no('b0f4a3c2-0007-4e6a-9a51-000000000007', 'Enviar no WhatsApp (WAHA)', 'n8n-nodes-base.httpRequest', 4.2, [1200, 100], {
    method: 'POST',
    url: "={{ ($env.WAHA_URL || 'http://waha:3000') + '/api/sendText' }}",
    sendHeaders: true,
    headerParameters: { parameters: [{ name: 'X-Api-Key', value: '={{ $env.WAHA_API_KEY }}' }] },
    sendBody: true,
    contentType: 'json',
    specifyBody: 'json',
    jsonBody: '={{ JSON.stringify(Object.assign({ session: $json.session, chatId: $json.chatId, text: $json.text }, $json.replyTo ? { reply_to: $json.replyTo } : {})) }}',
    options: { timeout: 30000 }
  }, { retryOnFail: true, maxTries: 3, waitBetweenTries: 2000 })
];

function liga(de, para) { return [{ node: para, type: 'main', index: 0 }]; }
var connections = {
  'WAHA: mensagem recebida': { main: [liga(0, 'Config')] },
  'Todo dia 07:00': { main: [liga(0, 'Config')] },
  'Config': { main: [liga(0, 'Interpretar')] },
  'Interpretar': { main: [liga(0, 'Buscar lançamentos (planilha)')] },
  'Buscar lançamentos (planilha)': { main: [liga(0, 'Montar resposta')] },
  'Montar resposta': { main: [liga(0, 'Enviar no WhatsApp (WAHA)')] }
};

var workflow = {
  id: 'BuyOffChatbot001',
  name: 'Buy Off · Chatbot de relatórios (WhatsApp)',
  nodes: nodes,
  connections: connections,
  settings: { executionOrder: 'v1', timezone: 'America/Sao_Paulo' },
  pinData: {},
  active: false
};

var saida = path.join(__dirname, 'workflows', 'buyoff-chatbot.json');
fs.mkdirSync(path.dirname(saida), { recursive: true });
fs.writeFileSync(saida, JSON.stringify(workflow, null, 2) + '\n');
console.log('Gerado: ' + path.relative(process.cwd(), saida));
