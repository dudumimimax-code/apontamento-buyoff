(function () {
  'use strict';

  // ======================= CONFIGURAÇÃO =======================
  // Cole aqui a URL do App da Web do Apps Script (termina em /exec).
  var ENDPOINT = 'https://script.google.com/macros/s/AKfycbxq6a3mYLYgveTELreicTyj7dkFtLGvx0SR10SFsZ_sDPQ1gcwbXLM1C6zkBN9RkNPK/exec';
  // ============================================================

  var LS_LANC = 'buyoff_chave_lancamento'; // localStorage: fica no aparelho do setor
  var SS_CTRL = 'buyoff_chave_controle';   // sessionStorage: some ao fechar a aba

  // Códigos conforme o Diário de Produção em papel (mesma lista do Code.gs)
  // Piloto: 3 setores com um QR code único (o operador escolhe o setor no formulário)
  var SETORES = [
    {id:'lixacao', nome:'LIXAÇÃO', ops:['Vinicius','Maicon da Silva Souza']},
    {id:'polimento', nome:'POLIMENTO', ops:['Thigo','Ari']},
    {id:'tagliabue', nome:'TAGLIABUE', ops:['Fernando Maciel','Maicon da Silva Souza']}
  ];
  var DEFEITOS = [
    ['Q1','Peça batida'],
    ['Q147','Falta de identificação (etiqueta)'],
    ['Q126','Bordo quebrado'],
    ['Q120','Bordo aberto'],
    ['Q118','Falta de bordo'],
    ['Q86','Falta calafetação Paris'],
    ['Q99','Bordo descolado'],
    ['Q156','Peça batida do retrabalho'],
    ['Q95','Preparação incorreta'],
    ['Q94','Buraco na peça'],
    ['Q69','Pintura escorrida','conferir código'],
    ['Q157','Peça do retrabalho sem identificação'],
    ['Q72','Pintura escorrida','conferir código'],
    ['Q170','Limpeza da esteira Sputzza']
  ];
  var DESC = {}; DEFEITOS.forEach(function (d) { DESC[d[0]] = d[1]; });

  // ---------- Utilidades ----------
  function $(id) { return document.getElementById(id); }
  function h(tag, attrs) {
    var el = document.createElement(tag);
    if (attrs) for (var k in attrs) { if (k === 'class') el.className = attrs[k]; else el.setAttribute(k, attrs[k]); }
    for (var i = 2; i < arguments.length; i++) {
      var c = arguments[i]; if (c == null) continue;
      el.appendChild(typeof c === 'string' ? document.createTextNode(c) : c);
    }
    return el;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function hoje() { var d = new Date(); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function isoWeek(s) {
    var p = String(s || '').split('-').map(Number); if (p.length < 3 || p.some(isNaN)) return null;
    var t = new Date(Date.UTC(p[0], p[1] - 1, p[2])); var dn = (t.getUTCDay() + 6) % 7;
    t.setUTCDate(t.getUTCDate() - dn + 3);
    var fy = t.getUTCFullYear(); var j4 = new Date(Date.UTC(fy, 0, 4));
    var w = 1 + Math.round(((t - j4) / 864e5 - 3 + ((j4.getUTCDay() + 6) % 7)) / 7);
    return {ano: fy, sem: w};
  }
  function brData(s) { var p = String(s || '').split('-'); return p.length === 3 ? p[2] + '/' + p[1] + '/' + p[0] : String(s || ''); }
  function pct(a, b) { return b > 0 ? (a / b * 100).toFixed(1).replace('.', ',') + '%' : '-'; }
  function nfmt(n) { return Number(n || 0).toLocaleString('pt-BR'); }
  function setorPorId(id) { for (var i = 0; i < SETORES.length; i++) if (SETORES[i].id === id) return SETORES[i]; return null; }
  function turnoSugerido() { var hr = new Date().getHours(); return (hr >= 6 && hr < 18) ? 'Dia' : 'Noite'; }
  function guardaGet(tipo, k) { try { return window[tipo].getItem(k); } catch (e) { return null; } }
  function guardaSet(tipo, k, v) { try { if (v == null) window[tipo].removeItem(k); else window[tipo].setItem(k, v); } catch (e) {} }
  function chaveValida(k) { return typeof k === 'string' && /^[A-Za-z0-9]{16,64}$/.test(k); }
  function novoId() {
    try { if (window.crypto && crypto.randomUUID) return crypto.randomUUID(); } catch (e) {}
    var a = new Uint8Array(16); crypto.getRandomValues(a);
    return Array.prototype.map.call(a, function (b) { return (b < 16 ? '0' : '') + b.toString(16); }).join('');
  }

  // ---------- Comunicação com o Apps Script ----------
  function configurado() { return /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/.test(ENDPOINT); }

  function api(acao, extra, tempoMs) {
    if (!configurado()) return Promise.reject({erro: 'nao_configurado'});
    var corpo = {acao: acao}; for (var k in extra) corpo[k] = extra[k];
    var ctrl = ('AbortController' in window) ? new AbortController() : null;
    var timer = ctrl ? setTimeout(function () { ctrl.abort(); }, tempoMs || 25000) : null;
    // text/plain evita o "preflight" de CORS, que o Apps Script não responde.
    return fetch(ENDPOINT, {
      method: 'POST', body: JSON.stringify(corpo), headers: {'Content-Type': 'text/plain;charset=utf-8'},
      redirect: 'follow', credentials: 'omit', cache: 'no-store', referrerPolicy: 'no-referrer',
      signal: ctrl ? ctrl.signal : undefined
    }).then(function (r) {
      if (!r.ok) throw {erro: 'http'};
      return r.json();
    }).then(function (j) {
      if (timer) clearTimeout(timer);
      if (!j || j.ok !== true) throw (j && j.erro ? j : {erro: 'resposta'});
      return j;
    }, function (e) {
      if (timer) clearTimeout(timer);
      throw (e && e.erro) ? e : {erro: 'rede'};
    });
  }

  function msgErro(e) {
    var c = e && e.erro;
    if (c === 'nao_configurado') return 'O formulário ainda não foi ligado à planilha (URL do App da Web não configurada).';
    if (c === 'chave_invalida') return 'Este aparelho não tem acesso válido. Abra o formulário de novo pelo QR code.';
    if (c === 'dados_invalidos') return 'Lançamento recusado: ' + (typeof e.detalhe === 'string' ? e.detalhe : 'confira os campos.');
    if (c === 'limite') return 'Muitos lançamentos em pouco tempo. Aguarde alguns minutos e tente de novo.';
    if (c === 'ocupado') return 'O servidor está ocupado. Tente de novo em instantes.';
    return 'Não foi possível registrar agora. Seus dados continuam na tela: tente de novo em instantes.';
  }

  // ---------- Estado ----------
  var registros = [], carregou = false, carregando = false;
  var somenteLeitura = false, turnoTocado = false, salvando = false;
  var chaveLanc = guardaGet('localStorage', LS_LANC);
  var chaveCtrl = guardaGet('sessionStorage', SS_CTRL);
  var MAX_FOTOS = 3, FOTO_LADO = 1280, FOTO_MAX_BYTES = 450000;
  var fotos = [], processandoFotos = false; // fotos já comprimidas (data URL JPEG)
  var idAtual = null; // identifica o lançamento; reenvio após falha de rede não duplica
  if (!chaveValida(chaveLanc)) chaveLanc = null;
  if (!chaveValida(chaveCtrl)) chaveCtrl = null;

  function aviso(t) { var b = $('banner'); b.textContent = t || ''; b.hidden = !t; }
  function estadoEnvio() {
    var msg = !configurado() ? 'O formulário ainda não foi ligado à planilha. Quem administra precisa configurar a URL do App da Web.'
      : !chaveLanc ? 'Este aparelho ainda não tem acesso para lançar. Abra o formulário pelo QR code.'
      : '';
    somenteLeitura = !!msg;
    $('enviar').disabled = somenteLeitura || salvando;
    aviso(msg);
  }
  function verificaChave() {
    if (!chaveLanc || !configurado()) return estadoEnvio();
    estadoEnvio();
    api('verificar', {chave: chaveLanc}).catch(function (e) {
      if (e && e.erro === 'chave_invalida') { chaveLanc = null; guardaSet('localStorage', LS_LANC, null); estadoEnvio(); }
      // falha de rede não bloqueia: o envio tenta de novo e informa
    });
  }

  // ---------- Formulário ----------
  var selSetor = $('setor');
  selSetor.appendChild(h('option', {value: ''}, 'Escolha o setor'));
  SETORES.forEach(function (s) { selSetor.appendChild(h('option', {value: s.id}, s.nome)); });

  var cont = $('defeitos');
  DEFEITOS.forEach(function (d) {
    var code = d[0];
    var inp = h('input', {id: 'q-' + code, type: 'number', inputmode: 'numeric', min: '0', step: '1', placeholder: '0', 'aria-label': 'Quantidade ' + code + ' ' + d[1]});
    var menos = h('button', {type: 'button', 'aria-label': 'Diminuir ' + code}, '−');
    var mais = h('button', {type: 'button', 'aria-label': 'Aumentar ' + code}, '+');
    var row = h('div', {class: 'defrow', id: 'row-' + code},
      h('span', {class: 'code'}, code),
      h('span', {class: 'desc'}, d[1], d[2] ? h('span', {class: 'tag'}, d[2]) : null),
      h('div', {class: 'step'}, menos, inp, mais));
    menos.addEventListener('click', function () { inp.value = Math.max(0, (parseInt(inp.value, 10) || 0) - 1) || ''; atualizaTotais(); });
    mais.addEventListener('click', function () { inp.value = (parseInt(inp.value, 10) || 0) + 1; atualizaTotais(); });
    inp.addEventListener('input', atualizaTotais);
    cont.appendChild(row);
  });

  function qtdDefeitos() {
    var o = {}; DEFEITOS.forEach(function (d) { var v = parseInt($('q-' + d[0]).value, 10); if (v > 0) o[d[0]] = v; }); return o;
  }
  function somaRuins(o) { var t = 0; for (var k in o) t += o[k]; return t; }
  function producao() { var v = parseInt($('producao').value, 10); return isNaN(v) ? null : v; }
  function atualizaTotais() {
    idAtual = null;
    var o = qtdDefeitos(), r = somaRuins(o), p = producao();
    $('tot-ruins').textContent = nfmt(r);
    $('tot-pct').textContent = p ? pct(r, p) : '-';
    DEFEITOS.forEach(function (d) { $('row-' + d[0]).classList.toggle('on', !!o[d[0]]); });
  }
  $('producao').addEventListener('input', atualizaTotais);
  // qualquer edição gera um novo lançamento
  $('form').addEventListener('input', function () { idAtual = null; });
  $('form').addEventListener('change', function () { idAtual = null; });

  function turnoAtual() { return $('turno-noite').checked ? 'Noite' : 'Dia'; }
  function setTurno(t) { $('turno-dia').checked = t === 'Dia'; $('turno-noite').checked = t === 'Noite'; }
  document.querySelectorAll('input[name="turno"]').forEach(function (r) {
    r.addEventListener('change', function () { turnoTocado = true; $('turno-h').textContent = 'Turno escolhido manualmente.'; verificaDuplicado(); });
  });

  function atualizaSemana() {
    var w = isoWeek($('data').value);
    $('semana').textContent = w ? 'Semana ' + w.sem + ' · ' + w.ano : '-';
    verificaDuplicado();
  }
  $('data').addEventListener('change', atualizaSemana);

  function atualizaOperadores() {
    var s = setorPorId(selSetor.value), dl = $('ops'); dl.textContent = '';
    (s ? s.ops : []).forEach(function (n) { dl.appendChild(h('option', {value: n})); });
    verificaDuplicado();
  }
  selSetor.addEventListener('change', atualizaOperadores);

  // Aviso prévio só funciona com os lançamentos carregados (aparelho com acesso ao Controle).
  // O servidor também avisa depois do envio.
  function verificaDuplicado() {
    var box = $('dup'); var id = selSetor.value, d = $('data').value, t = turnoAtual();
    var achou = id && d ? registros.filter(function (r) { return r.setor === id && r.data === d && r.turno === t; }) : [];
    if (achou.length) {
      box.hidden = false;
      box.textContent = 'Já existe lançamento deste setor em ' + brData(d) + ', turno ' + t + ' (operador: ' + (achou[0].operador || 'sem nome') + '). Se for outro lançamento, pode continuar.';
    } else box.hidden = true;
  }

  function travaSetor(id) {
    var s = setorPorId(id); if (!s) return;
    selSetor.value = id; atualizaOperadores();
    $('setor-lock-txt').textContent = s.nome; $('setor-lock').hidden = false;
    $('setor-label').hidden = true;
  }
  $('setor-unlock').addEventListener('click', function () {
    $('setor-lock').hidden = true; $('setor-label').hidden = false; selSetor.focus();
  });

  // ---------- Fotos (opcionais) ----------
  function lerArquivo(file) {
    return new Promise(function (res, rej) { var fr = new FileReader(); fr.onload = function () { res(fr.result); }; fr.onerror = rej; fr.readAsDataURL(file); });
  }
  function carregaImg(src) {
    return new Promise(function (res, rej) { var im = new Image(); im.onload = function () { res(im); }; im.onerror = rej; im.src = src; });
  }
  function bytesDataUrl(u) { return Math.floor((u.length - u.indexOf(',') - 1) * 3 / 4); }
  // Reduz para no máximo 1280 px e recodifica em JPEG (~200-400 KB). Também remove os dados EXIF (GPS etc.).
  function comprime(file) {
    return lerArquivo(file).then(carregaImg).then(function (im) {
      var w = im.naturalWidth || im.width, hh = im.naturalHeight || im.height;
      if (!w || !hh) throw new Error('imagem');
      var esc = Math.min(1, FOTO_LADO / Math.max(w, hh));
      var c = document.createElement('canvas'); c.width = Math.round(w * esc); c.height = Math.round(hh * esc);
      var ctx = c.getContext('2d'); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); ctx.drawImage(im, 0, 0, c.width, c.height);
      var qs = [0.75, 0.6, 0.45];
      for (var i = 0; i < qs.length; i++) {
        var u = c.toDataURL('image/jpeg', qs[i]);
        if (u.indexOf('data:image/jpeg;base64,') === 0 && bytesDataUrl(u) <= FOTO_MAX_BYTES) return u;
      }
      throw new Error('grande');
    });
  }
  function renderFotos() {
    var box = $('fotos'); box.textContent = '';
    fotos.forEach(function (u, i) {
      var rm = h('button', {type: 'button', 'aria-label': 'Remover foto ' + (i + 1)}, '×');
      rm.addEventListener('click', function () { fotos.splice(i, 1); idAtual = null; renderFotos(); });
      box.appendChild(h('div', {class: 'foto'}, h('img', {src: u, alt: 'Foto ' + (i + 1)}), rm));
    });
    $('foto-cont').textContent = processandoFotos ? 'Preparando foto…' : fotos.length + ' de ' + MAX_FOTOS;
    var cheio = processandoFotos || fotos.length >= MAX_FOTOS;
    [['foto-cam', 'foto-cam-btn'], ['foto-inp', 'foto-add']].forEach(function (p) {
      $(p[0]).disabled = cheio;
      $(p[1]).classList.toggle('off', cheio);
      $(p[1]).setAttribute('aria-disabled', cheio ? 'true' : 'false');
    });
  }
  function recebeFotos() {
    var inp = this, arqs = Array.prototype.slice.call(inp.files || [], 0, MAX_FOTOS - fotos.length);
    try { inp.value = ''; } catch (e) {}
    if (!arqs.length) return;
    processandoFotos = true; renderFotos(); mostraErro('');
    arqs.reduce(function (p, f) {
      return p.then(function () {
        return comprime(f).then(function (u) { if (fotos.length < MAX_FOTOS) fotos.push(u); },
          function () { mostraErro('Não foi possível usar uma das fotos. Tente tirar de novo.'); });
      });
    }, Promise.resolve()).then(function () { processandoFotos = false; idAtual = null; renderFotos(); });
  }
  $('foto-cam').addEventListener('change', recebeFotos);
  $('foto-inp').addEventListener('change', recebeFotos);

  function mostraErro(msg) { var e = $('erro'); e.textContent = msg || ''; e.hidden = !msg; if (msg) e.scrollIntoView({block: 'center'}); }

  $('form').addEventListener('submit', function (ev) {
    ev.preventDefault(); if (salvando) return;
    mostraErro('');
    var setor = setorPorId(selSetor.value), op = $('operador').value.trim(), data = $('data').value, p = producao();
    var def = qtdDefeitos(), ruins = somaRuins(def), w = isoWeek(data);
    if (somenteLeitura) return mostraErro($('banner').textContent || 'Envio indisponível neste aparelho.');
    if (!setor) return mostraErro('Escolha o setor.');
    if (!op) return mostraErro('Informe o nome do operador.');
    if (!w) return mostraErro('Informe a data.');
    if (p === null || p < 0) return mostraErro('Informe a produção total, mesmo que seja zero.');
    if (ruins > p) return mostraErro('As peças ruins (' + ruins + ') passam da produção total (' + p + '). Confira os números.');
    if (processandoFotos) return mostraErro('Aguarde a foto terminar de carregar.');
    var ciclo = parseFloat($('ciclo').value);
    if (!idAtual) idAtual = novoId();
    var dados = {id: idAtual, setor: setor.id, operador: op, data: data, turno: turnoAtual(), producao: p,
      ciclo: isNaN(ciclo) ? null : ciclo, defeitos: def, obs: $('obs').value.trim(),
      fotos: fotos.map(function (u) { return u.slice(u.indexOf(',') + 1); })};
    var nFotos = dados.fotos.length;

    salvando = true; $('enviar').disabled = true; $('enviar').textContent = nFotos ? 'Enviando fotos…' : 'Registrando…';
    api('lancar', {chave: chaveLanc, dados: dados}, nFotos ? 120000 : 25000).then(function (j) {
      var txt = setor.nome + ' · ' + brData(data) + ' · turno ' + dados.turno + ': ' + nfmt(p) + ' peças, ' + nfmt(ruins) + ' ruins (' + pct(ruins, p) + ').';
      if (nFotos) txt += ' ' + nFotos + (nFotos > 1 ? ' fotos anexadas.' : ' foto anexada.');
      if (j.repetido) txt += ' (Este lançamento já tinha chegado na primeira tentativa.)';
      else if (j.duplicados > 0) txt += ' Atenção: já havia ' + nfmt(j.duplicados) + ' lançamento(s) deste setor nesta data e turno.';
      $('done-txt').textContent = txt;
      $('form').hidden = true; $('done').hidden = false; window.scrollTo(0, 0);
      idAtual = null;
      if (chaveCtrl && carregou) carregaControle();
    }).catch(function (e) {
      if (e && e.erro === 'chave_invalida') { chaveLanc = null; guardaSet('localStorage', LS_LANC, null); estadoEnvio(); }
      mostraErro(msgErro(e));
    }).then(function () {
      salvando = false; $('enviar').disabled = somenteLeitura; $('enviar').textContent = 'Registrar lançamento';
    });
  });

  $('novo').addEventListener('click', function () {
    DEFEITOS.forEach(function (d) { $('q-' + d[0]).value = ''; });
    $('producao').value = ''; $('ciclo').value = ''; $('obs').value = '';
    fotos = []; renderFotos();
    if (!turnoTocado) setTurno(turnoSugerido());
    atualizaTotais(); verificaDuplicado();
    $('done').hidden = true; $('form').hidden = false; window.scrollTo(0, 0);
  });

  // ---------- Controle ----------
  var selSem = $('f-sem'), selFS = $('f-setor'), selFT = $('f-turno');
  selFS.appendChild(h('option', {value: ''}, 'Todos'));
  SETORES.forEach(function (s) { selFS.appendChild(h('option', {value: s.id}, s.nome)); });
  [selSem, selFS, selFT].forEach(function (s) { s.addEventListener('change', renderControle); });

  function msgCtrl(t, k) { var m = $('ctrl-msg'); m.className = 'note ' + (k || 'ok'); m.textContent = t || ''; m.hidden = !t; }
  function mostraLogin(sim) {
    $('login').hidden = !sim; $('filtros').hidden = sim; $('ctrl-dados').hidden = sim;
  }

  $('login-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var k = $('ctrl-chave').value.trim();
    if (!chaveValida(k)) return msgCtrl('Chave de controle em formato inválido.', 'bad');
    chaveCtrl = k; $('ctrl-chave').value = '';
    guardaSet('sessionStorage', SS_CTRL, k);
    carregaControle();
  });
  $('sair').addEventListener('click', function () {
    chaveCtrl = null; guardaSet('sessionStorage', SS_CTRL, null);
    registros = []; carregou = false; $('links').textContent = '';
    msgCtrl(''); mostraLogin(true); verificaDuplicado();
  });
  $('atualizar').addEventListener('click', function () { carregaControle(); });

  function carregaControle() {
    if (!chaveCtrl) { mostraLogin(true); return; }
    if (carregando) return;
    if (!configurado()) { msgCtrl(msgErro({erro: 'nao_configurado'}), 'warn'); return; }
    mostraLogin(false); carregando = true; msgCtrl('Carregando lançamentos…', 'ok');
    api('listar', {chave: chaveCtrl}).then(function (j) {
      registros = Array.isArray(j.registros) ? j.registros : [];
      carregou = true;
      var d = new Date(); msgCtrl('Atualizado às ' + pad(d.getHours()) + ':' + pad(d.getMinutes()) + '.', 'ok');
      atualizaSemanas(); verificaDuplicado(); renderControle();
    }, function (e) {
      if (e && e.erro === 'chave_invalida') {
        chaveCtrl = null; guardaSet('sessionStorage', SS_CTRL, null); mostraLogin(true);
        msgCtrl('Chave de controle inválida.', 'bad');
      } else msgCtrl('Não foi possível ler os lançamentos agora. Tente "Atualizar".', 'bad');
    }).then(function () { carregando = false; });
  }

  function chaveSem(r) { return r.ano + '-' + pad(r.semana); }
  function atualizaSemanas() {
    var atual = selSem.value, set = {};
    registros.forEach(function (r) { set[chaveSem(r)] = 1; });
    var ks = Object.keys(set).sort().reverse();
    selSem.textContent = '';
    selSem.appendChild(h('option', {value: ''}, 'Todas'));
    ks.forEach(function (k) { var p = k.split('-'); selSem.appendChild(h('option', {value: k}, 'Semana ' + Number(p[1]) + ' · ' + p[0])); });
    selSem.value = ks.indexOf(atual) >= 0 ? atual : '';
  }
  function filtrados() {
    return registros.filter(function (r) {
      return (!selSem.value || chaveSem(r) === selSem.value) && (!selFS.value || r.setor === selFS.value) && (!selFT.value || r.turno === selFT.value);
    });
  }
  function renderControle() {
    var lista = filtrados(), prod = 0, ruins = 0, porCod = {};
    lista.forEach(function (r) {
      prod += Number(r.producao) || 0; ruins += Number(r.ruins) || 0;
      var d = r.defeitos || {};
      for (var k in d) if (Object.prototype.hasOwnProperty.call(DESC, k)) porCod[k] = (porCod[k] || 0) + (Number(d[k]) || 0);
    });
    $('k-n').textContent = nfmt(lista.length); $('k-prod').textContent = nfmt(prod);
    $('k-ruins').textContent = nfmt(ruins); $('k-pct').textContent = pct(ruins, prod);

    var par = $('pareto'); par.textContent = '';
    var cods = Object.keys(porCod).filter(function (k) { return porCod[k] > 0; }).sort(function (a, b) { return porCod[b] - porCod[a]; });
    if (!cods.length) par.appendChild(h('div', {class: 'empty'}, 'Sem defeitos nos lançamentos filtrados.'));
    var max = cods.length ? porCod[cods[0]] : 1, soma = cods.reduce(function (t, k) { return t + porCod[k]; }, 0);
    cods.forEach(function (k) {
      var fill = h('div', {class: 'fill'}); fill.style.width = (porCod[k] / max * 100) + '%';
      par.appendChild(h('div', {class: 'par'},
        h('span', {class: 'code'}, k),
        h('div', null, h('div', null, DESC[k]), h('div', {class: 'track'}, fill)),
        h('span', {class: 'n'}, nfmt(porCod[k]) + ' · ' + pct(porCod[k], soma))));
    });

    var tb = $('tbody'); tb.textContent = '';
    lista.slice(0, 200).forEach(function (r) {
      tb.appendChild(h('tr', null,
        h('td', null, brData(r.data)), h('td', null, String(r.setorNome || r.setor || '')), h('td', null, String(r.turno || '')),
        h('td', null, String(r.operador || '')), h('td', {class: 'num'}, nfmt(r.producao)), h('td', {class: 'num'}, nfmt(r.ruins)),
        h('td', {class: 'num'}, pct(Number(r.ruins) || 0, Number(r.producao) || 0)),
        h('td', {class: 'num'}, Number(r.fotos) > 0 ? nfmt(r.fotos) : '-')));
    });
    var tv = $('tvazio');
    if (!lista.length) {
      tv.hidden = false; tv.textContent = '';
      tv.appendChild(h('b', null, carregou ? 'Nenhum lançamento encontrado' : 'Carregando lançamentos…'));
      tv.appendChild(document.createTextNode(carregou ? 'Os lançamentos da aba Lançar aparecem aqui ao tocar em "Atualizar".' : ''));
    } else tv.hidden = true;
    $('exportar').hidden = !lista.length;
  }

  // Exportação CSV (com proteção contra fórmulas ao abrir no Excel)
  $('exportar').addEventListener('click', function () {
    var lista = filtrados();
    var head = ['Data','Ano','Semana','Setor','Turno','Operador','Produção','Ciclo (min)','Peças ruins','Refugo %']
      .concat(DEFEITOS.map(function (d) { return d[0] + ' ' + d[1]; }), ['Observação', 'Fotos', 'Registrado em']);
    function esc(v) {
      v = v == null ? '' : String(v);
      if (/^[=+\-@\t\r]/.test(v)) v = "'" + v;
      return /[;"\n\r]/.test(v) ? '"' + v.replace(/"/g, '""') + '"' : v;
    }
    var linhas = [head.map(esc).join(';')];
    lista.forEach(function (r) {
      var d = r.defeitos || {};
      linhas.push([brData(r.data), r.ano, r.semana, r.setorNome || r.setor, r.turno, r.operador, r.producao,
        r.cicloMin == null ? '' : String(r.cicloMin).replace('.', ','), r.ruins,
        r.producao > 0 ? (r.ruins / r.producao * 100).toFixed(1).replace('.', ',') : '']
        .concat(DEFEITOS.map(function (x) { return d[x[0]] || ''; }), [r.obs || '', Number(r.fotos) || 0, r.criadoEm || ''])
        .map(esc).join(';'));
    });
    var blob = new Blob(['\ufeff' + linhas.join('\r\n')], {type: 'text/csv;charset=utf-8'});
    var url = URL.createObjectURL(blob);
    var a = h('a', {href: url, download: 'apontamentos_buyoff.csv'});
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 2000);
  });

  // Link único para o QR code (o setor é escolhido no formulário)
  $('links-form').addEventListener('submit', function (ev) {
    ev.preventDefault();
    var k = $('link-chave').value.trim(), lk = $('links'); lk.textContent = '';
    if (!chaveValida(k)) { lk.appendChild(h('div', {class: 'hint'}, 'Chave em formato inválido.')); return; }
    var url = location.origin + location.pathname + '#&k=' + encodeURIComponent(k);
    var b = h('button', {type: 'button', class: 'btn ghost small'}, 'Copiar');
    b.addEventListener('click', function () {
      var fim = function (ok) { b.textContent = ok ? 'Copiado' : 'Selecione o texto'; setTimeout(function () { b.textContent = 'Copiar'; }, 1600); };
      try { navigator.clipboard.writeText(url).then(function () { fim(true); }, function () { fim(false); }); } catch (e) { fim(false); }
    });
    lk.appendChild(h('div', null, h('span', null, 'Link do QR code'), h('code', null, url), b));
  });

  // ---------- Abas e rota por hash ----------
  function mostra(v) {
    var f = v === 'form';
    $('view-form').hidden = !f; $('view-ctrl').hidden = f;
    $('tab-form').setAttribute('aria-selected', f); $('tab-ctrl').setAttribute('aria-selected', !f);
    if (!f) {
      if (!chaveCtrl) mostraLogin(true);
      else if (!carregou) carregaControle();
      renderControle();
    }
  }
  $('tab-form').addEventListener('click', function () { mostra('form'); });
  $('tab-ctrl').addEventListener('click', function () { mostra('ctrl'); });

  // Formato do link: .../#&k=CHAVE (QR único) ou .../#polimento&k=CHAVE (setor já escolhido)
  function aplicaHash() {
    var partes = (location.hash || '').replace(/^#/, '').split('&');
    var rota = (partes[0] || '').toLowerCase(), chave = null;
    partes.slice(1).forEach(function (p) {
      var i = p.indexOf('=');
      if (i > 0 && p.slice(0, i) === 'k') { try { chave = decodeURIComponent(p.slice(i + 1)); } catch (e) { chave = null; } }
    });
    if (partes.length > 1) {
      // tira a chave da barra de endereço para não ser copiada ou compartilhada sem querer
      try { history.replaceState(null, '', location.pathname + location.search + (rota ? '#' + rota : '')); } catch (e) {}
    }
    if (chave && chaveValida(chave)) { chaveLanc = chave; guardaSet('localStorage', LS_LANC, chave); verificaChave(); }
    if (rota === 'controle') return mostra('ctrl');
    if (setorPorId(rota)) travaSetor(rota);
    mostra('form');
  }
  window.addEventListener('hashchange', aplicaHash);

  // ---------- Inicialização ----------
  $('data').value = hoje(); setTurno(turnoSugerido()); atualizaSemana(); atualizaTotais();
  atualizaSemanas();
  verificaChave();
  aplicaHash();
})();
