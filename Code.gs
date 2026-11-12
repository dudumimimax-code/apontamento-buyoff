/**
 * Apontamento Buy Off - servidor (Google Apps Script)
 *
 * Como usar (detalhes no README):
 *  1. Abra a planilha no Google Sheets > Extensões > Apps Script.
 *  2. Cole este arquivo inteiro no lugar do código padrão e salve.
 *  3. Rode a função setup() uma vez e autorize.
 *  4. Implantar > Nova implantação > App da Web
 *     (Executar como: Eu | Quem pode acessar: Qualquer pessoa).
 *
 * Segurança:
 *  - Toda gravação exige a CHAVE_LANCAMENTO; toda leitura exige a CHAVE_CONTROLE.
 *    As chaves ficam nas Propriedades do script, nunca no código do site.
 *  - O servidor revalida tudo (setor, códigos, números, datas) e recalcula
 *    semana, peças ruins e refugo; não confia no que vem do navegador.
 *  - Textos que começam com = + - @ são gravados como texto (evita injeção de fórmula).
 *  - Limite de lançamentos por janela de 10 minutos e trava contra gravação simultânea.
 */

var ABA = 'Lançamentos';
var TZ = 'America/Sao_Paulo';

// Piloto: só estes 3 setores são aceitos
var SETORES = {
  'lixacao': 'LIXAÇÃO',
  'polimento': 'POLIMENTO',
  'tagliabue': 'TAGLIABUE'
};

var DEFEITOS = [
  ['Q1', 'Peça batida'],
  ['Q147', 'Falta de identificação (etiqueta)'],
  ['Q126', 'Bordo quebrado'],
  ['Q120', 'Bordo aberto'],
  ['Q118', 'Falta de bordo'],
  ['Q86', 'Falta calafetação Paris'],
  ['Q99', 'Bordo descolado'],
  ['Q156', 'Peça batida do retrabalho'],
  ['Q95', 'Preparação incorreta'],
  ['Q94', 'Buraco na peça'],
  ['Q69', 'Pintura escorrida'],
  ['Q157', 'Peça do retrabalho sem identificação'],
  ['Q72', 'Pintura escorrida'],
  ['Q170', 'Limpeza da esteira Sputzza']
];

var TURNOS = ['Dia', 'Noite'];

var LIMITES = {
  corpo: 8000,            // tamanho máximo da requisição (caracteres)
  operador: 60,
  obs: 500,
  producao: 100000,
  ciclo: 1440,
  diasPassado: 90,        // aceita lançamentos de até 90 dias atrás
  diasFuturo: 1,          // e no máximo 1 dia à frente
  lancamentos10min: 300,  // teto global de gravações por 10 minutos
  leitura: 2000           // máximo de linhas devolvidas ao Controle
};

// Posições das colunas (0 = coluna A). Não reordene as colunas da planilha.
var COL = { criado: 0, id: 1, data: 2, ano: 3, semana: 4, setor: 5, turno: 6, operador: 7,
            producao: 8, ciclo: 9, ruins: 10, refugo: 11, def0: 12 };
COL.obs = COL.def0 + DEFEITOS.length;

function cabecalho_() {
  return ['Registrado em', 'ID', 'Data', 'Ano', 'Semana', 'Setor', 'Turno', 'Operador',
          'Produção', 'Ciclo (min)', 'Peças ruins', 'Refugo %']
    .concat(DEFEITOS.map(function (d) { return d[0] + ' ' + d[1]; }))
    .concat(['Observação']);
}

// ---------------------------------------------------------------------------
// Funções para rodar manualmente no editor
// ---------------------------------------------------------------------------

/** Rode uma vez: cria a aba, o cabeçalho e as duas chaves. */
function setup() {
  SpreadsheetApp.getActiveSpreadsheet().setSpreadsheetTimeZone(TZ);
  aba_();
  var props = PropertiesService.getScriptProperties();
  ['CHAVE_LANCAMENTO', 'CHAVE_CONTROLE'].forEach(function (k) {
    if (!props.getProperty(k)) props.setProperty(k, novaChave_());
  });
  mostrarChaves();
}

/** Mostra as chaves atuais no registro de execução. */
function mostrarChaves() {
  var props = PropertiesService.getScriptProperties();
  Logger.log('CHAVE_LANCAMENTO (vai no QR code): ' + props.getProperty('CHAVE_LANCAMENTO'));
  Logger.log('CHAVE_CONTROLE (só para quem acompanha os números): ' + props.getProperty('CHAVE_CONTROLE'));
}

/** Gera chaves novas. Use se um QR code ou a chave de controle vazar. */
function trocarChaves() {
  var props = PropertiesService.getScriptProperties();
  props.setProperty('CHAVE_LANCAMENTO', novaChave_());
  props.setProperty('CHAVE_CONTROLE', novaChave_());
  mostrarChaves();
}

// ---------------------------------------------------------------------------
// Web App
// ---------------------------------------------------------------------------

function doGet() {
  return resp_({ ok: true });
}

function doPost(e) {
  try {
    var corpo = e && e.postData && e.postData.contents;
    if (!corpo || corpo.length > LIMITES.corpo) return resp_({ ok: false, erro: 'requisicao_invalida' });
    var req;
    try { req = JSON.parse(corpo); } catch (_) { return resp_({ ok: false, erro: 'requisicao_invalida' }); }
    if (!req || typeof req !== 'object' || Array.isArray(req)) return resp_({ ok: false, erro: 'requisicao_invalida' });

    switch (req.acao) {
      case 'verificar':
        if (!chaveOk_(req.chave, 'CHAVE_LANCAMENTO')) return resp_({ ok: false, erro: 'chave_invalida' });
        return resp_({ ok: true });
      case 'lancar':
        if (!chaveOk_(req.chave, 'CHAVE_LANCAMENTO')) return resp_({ ok: false, erro: 'chave_invalida' });
        return lancar_(req.dados);
      case 'listar':
        if (!chaveOk_(req.chave, 'CHAVE_CONTROLE')) return resp_({ ok: false, erro: 'chave_invalida' });
        return listar_();
      default:
        return resp_({ ok: false, erro: 'acao_invalida' });
    }
  } catch (err) {
    console.error(err && err.stack ? err.stack : err);
    return resp_({ ok: false, erro: 'interno' }); // não devolve detalhes internos
  }
}

// ---------------------------------------------------------------------------
// Gravação
// ---------------------------------------------------------------------------

function lancar_(dados) {
  var v = validar_(dados);
  if (v.erro) return resp_({ ok: false, erro: 'dados_invalidos', detalhe: v.erro });
  var r = v.registro;

  var lock = LockService.getScriptLock();
  if (!lock.tryLock(10000)) return resp_({ ok: false, erro: 'ocupado' });
  try {
    var cache = CacheService.getScriptCache();
    var janela = 'cnt:' + Math.floor(Date.now() / 600000);
    var n = Number(cache.get(janela) || 0);

    var aba = aba_();
    var busca = procurar_(aba, r);
    if (busca.repetido) return resp_({ ok: true, repetido: true, duplicados: 0 }); // reenvio do mesmo lançamento
    if (n >= LIMITES.lancamentos10min) return resp_({ ok: false, erro: 'limite' });

    aba.appendRow(linha_(r));
    cache.put(janela, String(n + 1), 700);
    return resp_({ ok: true, duplicados: busca.duplicados });
  } finally {
    lock.releaseLock();
  }
}

function validar_(d) {
  if (!d || typeof d !== 'object' || Array.isArray(d)) return { erro: 'Dados ausentes.' };

  var id = String(d.id || '');
  if (!/^[A-Za-z0-9-]{8,64}$/.test(id)) return { erro: 'Identificador do lançamento inválido.' };

  var setor = String(d.setor || '');
  if (!Object.prototype.hasOwnProperty.call(SETORES, setor)) return { erro: 'Setor inválido.' };

  var operador = texto_(d.operador, LIMITES.operador);
  if (!operador) return { erro: 'Informe o operador.' };

  var data = String(d.data || '');
  var m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(data);
  if (!m) return { erro: 'Data inválida.' };
  var y = +m[1], mo = +m[2], dd = +m[3];
  var dt = Date.UTC(y, mo - 1, dd);
  var chk = new Date(dt);
  if (chk.getUTCFullYear() !== y || chk.getUTCMonth() !== mo - 1 || chk.getUTCDate() !== dd) return { erro: 'Data inválida.' };
  var h = Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd').split('-').map(Number);
  var dias = (dt - Date.UTC(h[0], h[1] - 1, h[2])) / 864e5;
  if (dias > LIMITES.diasFuturo) return { erro: 'A data está no futuro.' };
  if (dias < -LIMITES.diasPassado) return { erro: 'A data é antiga demais (mais de ' + LIMITES.diasPassado + ' dias).' };

  var turno = String(d.turno || '');
  if (TURNOS.indexOf(turno) < 0) return { erro: 'Turno inválido.' };

  var producao = inteiro_(d.producao, 0, LIMITES.producao);
  if (producao === null) return { erro: 'Produção inválida.' };

  var ciclo = null;
  if (d.ciclo !== null && d.ciclo !== undefined && d.ciclo !== '') {
    ciclo = Number(d.ciclo);
    if (!isFinite(ciclo) || ciclo < 0 || ciclo > LIMITES.ciclo) return { erro: 'Tempo de ciclo inválido.' };
  }

  var defeitos = {}, ruins = 0, codigos = {};
  DEFEITOS.forEach(function (x) { codigos[x[0]] = true; });
  var bruto = d.defeitos || {};
  if (typeof bruto !== 'object' || Array.isArray(bruto)) return { erro: 'Defeitos inválidos.' };
  var chaves = Object.keys(bruto);
  for (var i = 0; i < chaves.length; i++) {
    var k = chaves[i];
    if (!Object.prototype.hasOwnProperty.call(codigos, k)) return { erro: 'Código de defeito desconhecido: ' + String(k).slice(0, 10) };
    var q = inteiro_(bruto[k], 0, LIMITES.producao);
    if (q === null) return { erro: 'Quantidade inválida no código ' + k + '.' };
    if (q > 0) { defeitos[k] = q; ruins += q; }
  }
  if (ruins > producao) return { erro: 'Peças ruins (' + ruins + ') passam da produção (' + producao + ').' };

  var obs = texto_(d.obs, LIMITES.obs) || '';
  var w = semanaIso_(y, mo, dd);

  return { registro: { id: id, setor: setor, operador: operador, data: data, ano: w.ano, semana: w.sem,
    turno: turno, producao: producao, ciclo: ciclo, defeitos: defeitos, ruins: ruins, obs: obs } };
}

function linha_(r) {
  return [
    new Date(),
    r.id,
    Utilities.parseDate(r.data, TZ, 'yyyy-MM-dd'),
    r.ano,
    r.semana,
    SETORES[r.setor],
    r.turno,
    seguro_(r.operador),
    r.producao,
    r.ciclo === null ? '' : r.ciclo,
    r.ruins,
    r.producao > 0 ? r.ruins / r.producao : ''
  ].concat(DEFEITOS.map(function (x) { return r.defeitos[x[0]] || ''; }))
   .concat([seguro_(r.obs)]);
}

/** Procura o mesmo ID (reenvio) e conta lançamentos do mesmo setor/data/turno nas últimas 1000 linhas. */
function procurar_(aba, r) {
  var ult = aba.getLastRow();
  if (ult < 2) return { repetido: false, duplicados: 0 };
  var ini = Math.max(2, ult - 999);
  var vals = aba.getRange(ini, COL.id + 1, ult - ini + 1, COL.turno - COL.id + 1).getValues();
  var nome = SETORES[r.setor], dup = 0;
  for (var i = 0; i < vals.length; i++) {
    var l = vals[i];
    if (String(l[0]) === r.id) return { repetido: true, duplicados: 0 };
    var dStr = ehData_(l[COL.data - COL.id]) ? Utilities.formatDate(l[COL.data - COL.id], TZ, 'yyyy-MM-dd') : String(l[COL.data - COL.id]);
    if (dStr === r.data && l[COL.setor - COL.id] === nome && l[COL.turno - COL.id] === r.turno) dup++;
  }
  return { repetido: false, duplicados: dup };
}

// ---------------------------------------------------------------------------
// Leitura (aba Controle)
// ---------------------------------------------------------------------------

function listar_() {
  var aba = aba_();
  var ult = aba.getLastRow();
  if (ult < 2) return resp_({ ok: true, registros: [] });
  var ini = Math.max(2, ult - LIMITES.leitura + 1);
  var vals = aba.getRange(ini, 1, ult - ini + 1, cabecalho_().length).getValues();
  var inv = {};
  Object.keys(SETORES).forEach(function (k) { inv[SETORES[k]] = k; });

  var regs = [];
  vals.forEach(function (l) {
    if (!l[COL.id]) return;
    var def = {};
    DEFEITOS.forEach(function (x, i) { var q = Number(l[COL.def0 + i]); if (q > 0) def[x[0]] = q; });
    var ciclo = l[COL.ciclo] === '' ? null : Number(l[COL.ciclo]);
    regs.push({
      id: String(l[COL.id]),
      criadoEm: ehData_(l[COL.criado]) ? l[COL.criado].toISOString() : String(l[COL.criado]),
      data: ehData_(l[COL.data]) ? Utilities.formatDate(l[COL.data], TZ, 'yyyy-MM-dd') : String(l[COL.data]),
      ano: Number(l[COL.ano]) || 0,
      semana: Number(l[COL.semana]) || 0,
      setorNome: String(l[COL.setor]),
      setor: inv[l[COL.setor]] || '',
      turno: String(l[COL.turno]),
      operador: String(l[COL.operador]),
      producao: Number(l[COL.producao]) || 0,
      cicloMin: isFinite(ciclo) ? ciclo : null,
      ruins: Number(l[COL.ruins]) || 0,
      defeitos: def,
      obs: String(l[COL.obs] || '')
    });
  });
  regs.reverse(); // mais recentes primeiro
  return resp_({ ok: true, registros: regs });
}

// ---------------------------------------------------------------------------
// Utilidades
// ---------------------------------------------------------------------------

function aba_() {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var aba = ss.getSheetByName(ABA) || ss.insertSheet(ABA);
  if (aba.getLastRow() === 0) {
    var cab = cabecalho_();
    aba.getRange(1, 1, 1, cab.length).setValues([cab]).setFontWeight('bold');
    aba.setFrozenRows(1);
    aba.getRange('A:A').setNumberFormat('dd/MM/yyyy HH:mm:ss');
    aba.getRange('C:C').setNumberFormat('dd/MM/yyyy');
    aba.getRange('L:L').setNumberFormat('0.0%');
  }
  return aba;
}

function ehData_(v) {
  return !!v && typeof v === 'object' && typeof v.getTime === 'function';
}

function resp_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

function novaChave_() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 32);
}

/** Comparação em tempo constante. */
function chaveOk_(recebida, nome) {
  var certa = PropertiesService.getScriptProperties().getProperty(nome);
  if (!certa || typeof recebida !== 'string' || recebida.length !== certa.length) return false;
  var dif = 0;
  for (var i = 0; i < certa.length; i++) dif |= certa.charCodeAt(i) ^ recebida.charCodeAt(i);
  return dif === 0;
}

function texto_(v, max) {
  if (v === null || v === undefined) return '';
  return String(v).replace(/[\u0000-\u001F\u007F-\u009F\u200B-\u200F\u2028\u2029]/g, ' ')
                  .replace(/\s+/g, ' ').trim().slice(0, max);
}

/** Impede que o texto vire fórmula na planilha (ou no Excel). */
function seguro_(s) {
  s = String(s || '');
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}

function inteiro_(v, min, max) {
  if (v === '' || v === null || v === undefined || typeof v === 'boolean') return null;
  var n = Number(v);
  if (!isFinite(n) || Math.floor(n) !== n || n < min || n > max) return null;
  return n;
}

function semanaIso_(y, m, d) {
  var t = new Date(Date.UTC(y, m - 1, d));
  var dn = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dn + 3);
  var fy = t.getUTCFullYear();
  var j4 = new Date(Date.UTC(fy, 0, 4));
  var w = 1 + Math.round(((t - j4) / 864e5 - 3 + ((j4.getUTCDay() + 6) % 7)) / 7);
  return { ano: fy, sem: w };
}
