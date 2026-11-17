/*
 * Núcleo do chatbot Buy Off: interpreta o comando e monta o texto do relatório.
 *
 * Funções puras (sem n8n, sem rede): dá para testar com `node chatbot/test/teste.js`.
 * O build-workflow.js copia este arquivo para dentro dos nós "Code" do workflow do n8n.
 * Depois de mudar aqui, rode `node chatbot/build-workflow.js` e reimporte o workflow.
 */

var TZ = 'America/Sao_Paulo';

// Mesmos ids e nomes do app.js / Code.gs. "apelidos" = como o pessoal escreve no WhatsApp.
var SETORES = [
  { id: 'tagliabue', nome: 'TAGLIABUE', apelidos: ['tagliabue', 'taglia'] },
  { id: 'ibotic', nome: 'IBOTIC', apelidos: ['ibotic'] },
  { id: 'polimento', nome: 'POLIMENTO', apelidos: ['polimento'] },
  { id: 'madeirado-uv', nome: 'MADEIRADO UV', apelidos: ['madeirado uv', 'madeirado-uv', 'uv'] },
  { id: 'madeirado-colorido', nome: 'MADEIRADO COLORIDO', apelidos: ['madeirado colorido', 'madeirado-colorido', 'colorido'] }
];

// Turnos em que cada setor deveria ter lançamento (para o aviso "Faltando lançamento").
// Se um setor não trabalha à noite, deixe só ['Dia'].
var TURNOS_ESPERADOS = {
  'tagliabue': ['Dia', 'Noite'],
  'ibotic': ['Dia', 'Noite'],
  'polimento': ['Dia', 'Noite'],
  'madeirado-uv': ['Dia', 'Noite'],
  'madeirado-colorido': ['Dia', 'Noite']
};

// Mesma lista do Code.gs (o servidor devolve só o código; aqui fica a descrição).
var DEFEITOS = {
  Q1: 'Peça batida', Q65: 'Bordo madeirado não quebrado a quina', Q66: 'Falta pintar o vão padrão',
  Q72: 'Pintura escorrida', Q73: 'Peça na cor errada', Q74: 'Peça fora de tonalidade',
  Q76: 'Peça sem pintura', Q77: 'Empapelamento incorreto', Q79: 'Pintura manchada',
  Q80: 'Pintura desplacando', Q81: 'Pintura com impureza', Q86: 'Falta calafetação Paris',
  Q87: 'Cola da etiqueta', Q88: 'Marca de cola da lixa na peça', Q92: 'Pintura áspera',
  Q94: 'Buraco na peça', Q95: 'Preparação incorreta', Q96: 'Pintura com falha',
  Q99: 'Bordo descolado', Q109: 'Medida errada (espessura / tamanho)', Q111: 'Usinagem serrilhada',
  Q118: 'Falta de bordo', Q120: 'Bordo aberto', Q126: 'Bordo quebrado',
  Q147: 'Falta de identificação (etiqueta)', Q154: 'Peça na pilha errada (outro acabamento)',
  Q156: 'Peça batida do retrabalho', Q157: 'Peça do retrabalho sem identificação',
  Q170: 'Limpeza da esteira Sputzza', Q179: 'Etiqueta colocada do lado errado',
  Q201: 'Risco na peça', Q202: 'Marca da etiqueta na peça', Q206: 'Marca do rolo', Q207: 'Peça queimada'
};

var MAX_DIAS = 92;          // período máximo de uma consulta
var DIAS_SEM = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

// ---------------------------------------------------------------------------
// Datas (sempre 'aaaa-mm-dd', no fuso de São Paulo)
// ---------------------------------------------------------------------------

function hojeISO(agora) {
  // en-CA formata como aaaa-mm-dd
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' })
    .format(agora || new Date());
}

function partes(iso) { var p = iso.split('-').map(Number); return { y: p[0], m: p[1], d: p[2] }; }
function utc(iso) { var p = partes(iso); return Date.UTC(p.y, p.m - 1, p.d); }
function pad(n) { return (n < 10 ? '0' : '') + n; }
function deUtc(ms) { var t = new Date(ms); return t.getUTCFullYear() + '-' + pad(t.getUTCMonth() + 1) + '-' + pad(t.getUTCDate()); }
function somaDias(iso, n) { return deUtc(utc(iso) + n * 864e5); }
function diaDaSemana(iso) { return new Date(utc(iso)).getUTCDay(); } // 0 = domingo
function dias(ini, fim) { return Math.round((utc(fim) - utc(ini)) / 864e5) + 1; }
function br(iso) { var p = partes(iso); return pad(p.d) + '/' + pad(p.m) + '/' + p.y; }
function brCurto(iso) { var p = partes(iso); return pad(p.d) + '/' + pad(p.m); }

function semanaIso(iso) {
  var t = new Date(utc(iso));
  var dn = (t.getUTCDay() + 6) % 7;
  t.setUTCDate(t.getUTCDate() - dn + 3);
  var j4 = new Date(Date.UTC(t.getUTCFullYear(), 0, 4));
  return 1 + Math.round(((t - j4) / 864e5 - 3 + ((j4.getUTCDay() + 6) % 7)) / 7);
}

function segundaDaSemana(iso) { return somaDias(iso, -((diaDaSemana(iso) + 6) % 7)); }

// ---------------------------------------------------------------------------
// Interpretação do comando
// ---------------------------------------------------------------------------

function normaliza(s) {
  return String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .toLowerCase().replace(/\s+/g, ' ').trim();
}

/** Lê "dd/mm", "dd/mm/aa" ou "dd/mm/aaaa". Sem ano: o mais recente que não está no futuro. */
function lerData(dd, mm, aa, hoje) {
  var d = +dd, m = +mm, y;
  if (aa) { y = +aa; if (y < 100) y += 2000; } else y = partes(hoje).y;
  var iso = y + '-' + pad(m) + '-' + pad(d);
  var t = new Date(utc(iso));
  if (m < 1 || m > 12 || t.getUTCDate() !== d || t.getUTCMonth() !== m - 1) return null;
  if (!aa && iso > hoje) iso = (y - 1) + '-' + pad(m) + '-' + pad(d);
  return iso;
}

/**
 * Transforma a mensagem num comando.
 * Retorna { tipo: 'ajuda' } ou { tipo: 'resumo'|'defeitos'|'pendentes', ini, fim, rotulo, setor }
 * ou { tipo: 'erro', msg }.
 */
function interpretar(texto, hoje) {
  var s = ' ' + normaliza(texto).replace(/^[\/!#.]+/, '') + ' ';

  // setor (apelidos mais longos primeiro, para "madeirado uv" ganhar de "uv")
  var setor = null, lista = [];
  SETORES.forEach(function (st) { st.apelidos.forEach(function (a) { lista.push([a, st.id]); }); });
  lista.sort(function (a, b) { return b[0].length - a[0].length; });
  for (var i = 0; i < lista.length && !setor; i++) {
    var re = new RegExp('(^|[^a-z0-9])' + lista[i][0].replace(/[-]/g, '\\-') + '(?=[^a-z0-9]|$)');
    if (re.test(s)) { setor = lista[i][1]; s = s.replace(re, '$1 '); }
  }

  // datas explícitas
  var datas = [], m, reData = /(\d{1,2})[\/.-](\d{1,2})(?:[\/.-](\d{2}|\d{4}))?(?!\d)/g;
  while ((m = reData.exec(s)) && datas.length < 3) {
    var iso = lerData(m[1], m[2], m[3], hoje);
    if (!iso) return { tipo: 'erro', msg: 'Data inválida: ' + m[0] };
    datas.push(iso);
  }
  s = s.replace(reData, ' ');

  var palavras = s.split(/[^a-z0-9]+/).filter(Boolean);
  function tem() { for (var j = 0; j < arguments.length; j++) if (palavras.indexOf(arguments[j]) >= 0) return true; return false; }

  if (!palavras.length && !datas.length && !setor) return { tipo: 'ajuda' };
  if (tem('ajuda', 'menu', 'help', 'comandos', 'oi', 'ola', 'bom', 'boa', 'start')) return { tipo: 'ajuda' };

  var tipo = 'resumo';
  if (tem('defeito', 'defeitos', 'codigos', 'codigo', 'top')) tipo = 'defeitos';
  else if (tem('pendente', 'pendentes', 'pendencia', 'pendencias', 'faltando', 'falta', 'faltam')) tipo = 'pendentes';

  var anterior = tem('passada', 'passado', 'anterior', 'ultima', 'ultimo');
  var ini, fim, rotulo;
  if (datas.length >= 2) {
    ini = datas[0] < datas[1] ? datas[0] : datas[1];
    fim = datas[0] < datas[1] ? datas[1] : datas[0];
    rotulo = brCurto(ini) + ' a ' + br(fim);
  } else if (datas.length === 1) {
    ini = fim = datas[0];
    rotulo = DIAS_SEM[diaDaSemana(ini)] + ' ' + br(ini);
  } else if (tem('ontem')) {
    ini = fim = somaDias(hoje, -1);
    rotulo = 'Ontem · ' + DIAS_SEM[diaDaSemana(ini)] + ' ' + br(ini);
  } else if (tem('semana', 'semanal')) {
    ini = segundaDaSemana(hoje);
    if (anterior) { ini = somaDias(ini, -7); fim = somaDias(ini, 6); } else fim = hoje;
    rotulo = 'Semana ' + semanaIso(ini) + ' · ' + brCurto(ini) + ' a ' + br(fim);
  } else if (tem('mes', 'mensal')) {
    var p = partes(hoje);
    if (anterior) {
      var y = p.m === 1 ? p.y - 1 : p.y, mm = p.m === 1 ? 12 : p.m - 1;
      ini = y + '-' + pad(mm) + '-01'; fim = somaDias(p.y + '-' + pad(p.m) + '-01', -1);
    } else { ini = p.y + '-' + pad(p.m) + '-01'; fim = hoje; }
    rotulo = 'Mês ' + pad(partes(ini).m) + '/' + partes(ini).y + ' · ' + brCurto(ini) + ' a ' + br(fim);
  } else if (tem('hoje', 'dia', 'agora', 'resumo', 'relatorio', 'defeito', 'defeitos', 'codigos', 'codigo', 'top',
                 'pendente', 'pendentes', 'pendencia', 'pendencias', 'faltando', 'falta', 'faltam') || setor) {
    ini = fim = hoje;
    rotulo = 'Hoje · ' + DIAS_SEM[diaDaSemana(ini)] + ' ' + br(ini);
  } else {
    return { tipo: 'ajuda', naoEntendi: true };
  }

  if (ini > hoje) return { tipo: 'erro', msg: 'A data ' + br(ini) + ' ainda não chegou.' };
  if (fim > hoje) fim = hoje;
  if (dias(ini, fim) > MAX_DIAS) return { tipo: 'erro', msg: 'Período grande demais (máximo ' + MAX_DIAS + ' dias).' };
  if (tipo === 'pendentes' && ini !== fim) { ini = fim; rotulo = DIAS_SEM[diaDaSemana(fim)] + ' ' + br(fim); }

  return { tipo: tipo, ini: ini, fim: fim, rotulo: rotulo, setor: setor };
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

function filtrar(registros, cmd) {
  return (registros || []).filter(function (r) {
    return r && r.data >= cmd.ini && r.data <= cmd.fim && (!cmd.setor || r.setor === cmd.setor);
  });
}

/**
 * Soma um conjunto de lançamentos.
 * Refugo % = ruins / produção, só com lançamentos contados em peças
 * (em pilhas não dá para comparar, como no formulário e na planilha).
 */
function agrega(regs) {
  var a = { n: 0, pecas: 0, pilhas: 0, ruins: 0, ruinsPeca: 0, defeitos: {}, turnos: {} };
  regs.forEach(function (r) {
    a.n++;
    a.ruins += r.ruins || 0;
    a.turnos[r.turno] = (a.turnos[r.turno] || 0) + 1;
    if (r.unidade === 'Pilha') a.pilhas += r.producao || 0;
    else if (r.producao !== null && r.producao !== undefined) { a.pecas += r.producao; a.ruinsPeca += r.ruins || 0; }
    Object.keys(r.defeitos || {}).forEach(function (c) { a.defeitos[c] = (a.defeitos[c] || 0) + r.defeitos[c]; });
  });
  a.refugo = a.pecas > 0 ? a.ruinsPeca / a.pecas : null;
  return a;
}

function topDefeitos(defs, n) {
  return Object.keys(defs).map(function (c) { return [c, defs[c]]; })
    .sort(function (a, b) { return b[1] - a[1] || Number(a[0].slice(1)) - Number(b[0].slice(1)); })
    .slice(0, n);
}

// ---------------------------------------------------------------------------
// Texto (formatação do WhatsApp: *negrito*, _itálico_)
// ---------------------------------------------------------------------------

function num(n) { return String(Math.round(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, '.'); }
function pct(x) { return x === null || x === undefined ? '-' : (x * 100).toFixed(1).replace('.', ',') + '%'; }
function nomeSetor(id) { for (var i = 0; i < SETORES.length; i++) if (SETORES[i].id === id) return SETORES[i].nome; return id; }
function descDefeito(c) { return DEFEITOS[c] ? c + ' ' + DEFEITOS[c] : c; }

function linhaProducao(a) {
  var p = [];
  if (a.pecas || !a.pilhas) p.push(num(a.pecas) + ' pç');
  if (a.pilhas) p.push(num(a.pilhas) + (a.pilhas === 1 ? ' pilha' : ' pilhas'));
  p.push(num(a.ruins) + ' ruins');
  return p.join(' · ');
}

function cabecalho(cmd, titulo) {
  return '📊 *' + titulo + '*' + (cmd.setor ? ' · ' + nomeSetor(cmd.setor) : '') + '\n_' + cmd.rotulo + '_';
}

/** Setor/turno sem nenhum lançamento no dia. */
function faltando(registros, dia) {
  var out = [];
  SETORES.forEach(function (st) {
    var t = (TURNOS_ESPERADOS[st.id] || []).filter(function (turno) {
      return !registros.some(function (r) { return r.data === dia && r.setor === st.id && r.turno === turno; });
    });
    if (t.length) out.push({ setor: st.id, turnos: t });
  });
  return out;
}

function textoFaltando(registros, cmd, hoje) {
  if (cmd.ini !== cmd.fim) return '';
  var f = faltando(registros, cmd.fim).filter(function (x) { return !cmd.setor || x.setor === cmd.setor; });
  if (!f.length) return '';
  var titulo = cmd.fim === hoje ? 'Ainda sem lançamento hoje' : 'Sem lançamento';
  return '⚠️ *' + titulo + ':* ' + f.map(function (x) {
    return nomeSetor(x.setor) + ' (' + x.turnos.join(', ') + ')';
  }).join(' · ');
}

function relatorioResumo(cmd, registros, hoje) {
  var regs = filtrar(registros, cmd);
  var linhas = [cabecalho(cmd, 'Buy Off · Pintura'), ''];
  var total = agrega(regs);

  if (!regs.length) {
    linhas.push('Nenhum lançamento no período.');
  } else {
    linhas.push('*Total:* ' + linhaProducao(total) + (total.refugo !== null ? ' · *refugo ' + pct(total.refugo) + '*' : ''));
    linhas.push(total.n + (total.n === 1 ? ' lançamento' : ' lançamentos') +
      (total.pilhas ? ' _(refugo % só conta produção em peças)_' : ''));

    var setores = cmd.setor ? [cmd.setor] : SETORES.map(function (s) { return s.id; });
    setores.forEach(function (id) {
      var rs = regs.filter(function (r) { return r.setor === id; });
      linhas.push('');
      if (!rs.length) { linhas.push('*' + nomeSetor(id) + '* · sem lançamento'); return; }
      var a = agrega(rs);
      var marcas = cmd.ini === cmd.fim ? ['Dia', 'Noite'].map(function (t) { return t + (a.turnos[t] ? ' ✓' : ' ✗'); }).join(' ') : '';
      if (cmd.setor) {
        linhas.pop(); // o total já é o do setor: não repete o bloco
        if (marcas) linhas.push('Turnos: ' + marcas);
      } else {
        linhas.push('*' + nomeSetor(id) + '* · ' + (a.refugo !== null ? 'refugo ' + pct(a.refugo) : 'em pilhas'));
        linhas.push(linhaProducao(a) + (marcas ? ' · ' + marcas : ''));
      }
      var top = topDefeitos(a.defeitos, cmd.setor ? 5 : 3);
      if (top.length) linhas.push('Principais: ' + top.map(function (d) { return descDefeito(d[0]) + ' (' + num(d[1]) + ')'; }).join(' · '));

      if (cmd.setor) {
        ['Dia', 'Noite'].forEach(function (t) {
          var at = agrega(rs.filter(function (r) { return r.turno === t; }));
          if (at.n) linhas.push('  ' + t + ': ' + linhaProducao(at) + (at.refugo !== null ? ' · refugo ' + pct(at.refugo) : ''));
        });
        if (cmd.ini !== cmd.fim) {
          linhas.push('', '_Por dia:_');
          for (var d = cmd.ini; d <= cmd.fim; d = somaDias(d, 1)) {
            var ad = agrega(rs.filter(function (r) { return r.data === d; }));
            if (ad.n) linhas.push('  ' + DIAS_SEM[diaDaSemana(d)] + ' ' + brCurto(d) + ': ' + linhaProducao(ad) + (ad.refugo !== null ? ' · ' + pct(ad.refugo) : ''));
          }
        }
      }
    });
  }

  var f = textoFaltando(registros, cmd, hoje);
  if (f) linhas.push('', f);
  return linhas.join('\n');
}

function relatorioDefeitos(cmd, registros) {
  var regs = filtrar(registros, cmd);
  var a = agrega(regs);
  var linhas = [cabecalho(cmd, 'Defeitos'), ''];
  var top = topDefeitos(a.defeitos, 10);
  if (!top.length) {
    linhas.push(regs.length ? 'Nenhum defeito lançado no período. 👏' : 'Nenhum lançamento no período.');
    return linhas.join('\n');
  }
  linhas.push('*' + num(a.ruins) + ' peças ruins*' + (a.refugo !== null ? ' · refugo ' + pct(a.refugo) : ''), '');
  top.forEach(function (d, i) {
    linhas.push((i + 1) + '. *' + d[0] + '* ' + (DEFEITOS[d[0]] || '') + ': ' + num(d[1]) + ' (' + pct(a.ruins ? d[1] / a.ruins : 0) + ')');
  });
  if (!cmd.setor) {
    linhas.push('', '_Por setor:_');
    SETORES.forEach(function (st) {
      var as = agrega(regs.filter(function (r) { return r.setor === st.id; }));
      if (as.ruins) linhas.push('  ' + st.nome + ': ' + num(as.ruins) + ' ruins · ' + topDefeitos(as.defeitos, 1).map(function (d) { return d[0]; }).join(''));
    });
  }
  return linhas.join('\n');
}

function relatorioPendentes(cmd, registros, hoje) {
  var f = textoFaltando(registros, cmd, hoje);
  return cabecalho(cmd, 'Lançamentos') + '\n\n' + (f || '✅ Todos os setores e turnos já lançaram.');
}

function ajuda(naoEntendi) {
  return (naoEntendi ? 'Não entendi. ' : '') + '🤖 *Buy Off · Pintura*\n' +
    'Mande uma destas mensagens:\n\n' +
    '*hoje* · *ontem* · *semana* · *semana passada* · *mes* · *mes passado*\n' +
    '*17/11* (um dia) · *10/11 a 16/11* (período)\n\n' +
    'Acrescente o setor para detalhar: *hoje ibotic*, *semana polimento*, *ontem uv*, *mes colorido*, *hoje tagliabue*\n\n' +
    '*defeitos semana* · ranking dos códigos Q\n' +
    '*pendentes* · quem ainda não lançou hoje\n\n' +
    '_Em grupo, comece com barra: /hoje_';
}

/** Monta a resposta final. registros = lista devolvida pelo Apps Script (acao listar). */
function responder(cmd, registros, hoje) {
  if (cmd.tipo === 'ajuda') return ajuda(cmd.naoEntendi);
  if (cmd.tipo === 'erro') return '⚠️ ' + cmd.msg + '\n\nMande *ajuda* para ver os comandos.';
  if (cmd.tipo === 'defeitos') return relatorioDefeitos(cmd, registros);
  if (cmd.tipo === 'pendentes') return relatorioPendentes(cmd, registros, hoje);
  return relatorioResumo(cmd, registros, hoje);
}

// ---------------------------------------------------------------------------
// WhatsApp: quem mandou e se pode receber os números
// ---------------------------------------------------------------------------

/** Variantes de um número brasileiro com e sem o 9 do celular (o WhatsApp às vezes guarda sem). */
function variantesNumero(dig) {
  var v = [dig];
  if (/^55\d{2}9\d{8}$/.test(dig)) v.push(dig.slice(0, 4) + dig.slice(5));
  if (/^55\d{2}[6-9]\d{7}$/.test(dig)) v.push(dig.slice(0, 4) + '9' + dig.slice(4));
  return v;
}

/** Lê a lista de autorizados: números (só dígitos) ou ids completos (…@c.us, …@lid, …@g.us). */
function lerAutorizados(texto) {
  var ids = {}, numeros = {};
  String(texto || '').split(/[,;\s]+/).filter(Boolean).forEach(function (x) {
    x = x.toLowerCase();
    if (x.indexOf('@') >= 0) ids[x] = true;
    else { var d = x.replace(/\D/g, ''); if (d.length >= 10) variantesNumero(d).forEach(function (v) { numeros[v] = true; }); }
  });
  return { ids: ids, numeros: numeros };
}

/** Todos os ids que podem identificar quem escreveu (o formato muda conforme o engine do WAHA). */
function idsRemetente(p) {
  var c = [p.participant, p.author, p.from];
  var dk = (p._data && p._data.key) || {};
  c.push(dk.participant, dk.participantAlt, dk.participantPn, dk.senderPn, dk.remoteJid, dk.remoteJidAlt);
  var inf = (p._data && p._data.Info) || {};
  c.push(inf.Sender, inf.SenderAlt);
  if (p._data && p._data.id) c.push(p._data.id.participant);
  return c.filter(function (x) { return typeof x === 'string' && x && !/@g\.us$/.test(x) && !/@broadcast$/.test(x); })
    .map(function (x) { return x.toLowerCase().replace(/:\d+(?=@)/, ''); });
}

function autorizado(aut, chatId, remetentes) {
  if (aut.ids[String(chatId).toLowerCase()]) return true;
  return remetentes.some(function (id) {
    if (aut.ids[id]) return true;
    if (/@lid$/.test(id)) return false; // id interno do WhatsApp, não é telefone
    var d = id.split('@')[0].replace(/\D/g, '');
    return !!aut.numeros[d];
  });
}

/**
 * Decide o que fazer com um evento do WAHA.
 * Retorna null (ignorar) ou { chatId, texto, msgId } quando é para responder.
 */
function lerEvento(ev, autorizadosTexto) {
  if (!ev || (ev.event !== 'message' && ev.event !== 'message.any')) return null;
  var p = ev.payload || {};
  if (p.fromMe) return null;
  var texto = typeof p.body === 'string' ? p.body.trim() : '';
  if (!texto || texto.length > 200) return null;
  var chatId = String(p.from || '');
  if (!chatId || /@broadcast$/.test(chatId) || /@newsletter$/.test(chatId)) return null;
  var grupo = /@g\.us$/.test(chatId);
  if (grupo && !/^[\/!]/.test(texto)) return null; // em grupo só responde a comandos com barra
  var rem = idsRemetente(p);
  if (!autorizado(lerAutorizados(autorizadosTexto), chatId, rem)) return { negado: true, chatId: chatId, remetentes: rem };
  return { chatId: chatId, texto: texto, msgId: p.id || null };
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { interpretar: interpretar, responder: responder, lerEvento: lerEvento, hojeISO: hojeISO,
    somaDias: somaDias, diaDaSemana: diaDaSemana, agrega: agrega, filtrar: filtrar,
    faltando: faltando, lerAutorizados: lerAutorizados, autorizado: autorizado, semanaIso: semanaIso };
}
