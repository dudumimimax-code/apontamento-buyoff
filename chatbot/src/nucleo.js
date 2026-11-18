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

// ---------------------------------------------------------------------------
// Conversa: "relatorio" liga o bot naquela conversa, "sair" desliga.
// Fora disso o bot fica em silêncio (o número pode ser usado para conversar normalmente).
// ---------------------------------------------------------------------------

var SESSAO_MINUTOS = 30; // desliga sozinho depois desse tempo sem mensagens

/**
 * Decide o que fazer com a mensagem conforme a conversa está ligada ou não.
 * ativoAte = até quando a conversa está ligada (ms) ou vazio; grupo = mensagem de grupo.
 * Retorna { acao: 'abrir'|'sair'|'comando'|'ignorar', resto, ativoAte }.
 * Em grupo não há liga/desliga: a barra (/hoje) já indica que é com o bot.
 */
function controleSessao(texto, ativoAte, agoraMs, grupo) {
  var s = normaliza(texto).replace(/^[\/!#.]+/, '').trim();
  var m = s.match(/^(relatorios?|sair)(?![a-z0-9])[\s,.;:!?-]*(.*)$/);
  var palavra = m ? m[1].replace(/s$/, '') : null;
  var ativo = !!ativoAte && ativoAte > agoraMs;
  var renova = agoraMs + SESSAO_MINUTOS * 60000;
  if (palavra === 'relatorio') return { acao: 'abrir', resto: m[2].trim(), ativoAte: renova };
  if (palavra === 'sair') return { acao: grupo || !ativo ? 'ignorar' : 'sair', ativoAte: null };
  if (grupo) return { acao: 'comando', resto: texto, ativoAte: null };
  return ativo ? { acao: 'comando', resto: texto, ativoAte: renova } : { acao: 'ignorar', ativoAte: null };
}

function textoSair() {
  return '👋 *Relatórios encerrados.*\nQuando precisar de novo, mande *relatorio*.';
}

function ajuda(naoEntendi, abertura) {
  return (abertura ? '✅ *Relatórios ativados.*\n\n' : '') + (naoEntendi ? 'Não entendi. ' : '') + '🤖 *Buy Off · Pintura*\n' +
    'Mande uma destas mensagens:\n\n' +
    '*hoje* · *ontem* · *semana* · *semana passada* · *mes* · *mes passado*\n' +
    '*17/11* (um dia) · *10/11 a 16/11* (período)\n\n' +
    'Acrescente o setor para detalhar: *hoje ibotic*, *semana polimento*, *ontem uv*, *mes colorido*, *hoje tagliabue*\n\n' +
    '*defeitos semana* · ranking dos códigos Q\n' +
    '*pendentes* · quem ainda não lançou hoje\n\n' +
    'Para encerrar, mande *sair* (encerra sozinho depois de ' + SESSAO_MINUTOS + ' min sem mensagens).\n' +
    '_Em grupo, comece com barra: /hoje_';
}

/** Monta a resposta final. registros = lista devolvida pelo Apps Script (acao listar). */
function responder(cmd, registros, hoje) {
  if (cmd.tipo === 'ajuda') return ajuda(cmd.naoEntendi, cmd.abertura);
  if (cmd.tipo === 'aviso') return cmd.msg;
  if (cmd.tipo === 'erro') return '⚠️ ' + cmd.msg + '\n\nMande *ajuda* para ver os comandos.';
  if (cmd.tipo === 'defeitos') return relatorioDefeitos(cmd, registros);
  if (cmd.tipo === 'pendentes') return relatorioPendentes(cmd, registros, hoje);
  return relatorioResumo(cmd, registros, hoje);
}

// ---------------------------------------------------------------------------
// Painel de gráficos: uma página HTML (só SVG, sem JavaScript nem nada de fora)
// que o Gotenberg transforma em foto PNG. Vai antes do texto nos relatórios de período.
// ---------------------------------------------------------------------------

var COR = { fundo: '#ffffff', texto: '#2C2C2A', sec: '#5F5E5A', fraco: '#888780', grade: '#E6E4DD',
  cartao: '#F4F3EE', barra: '#378ADD', refugo: '#D85A30', defeito: '#7F77DD' };
var LARG = 1080, MARGEM = 56;

function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
function r1(n) { return Math.round(n * 10) / 10; }

/** Teto "redondo" para o eixo: 1, 2, 2,5 ou 5 × potência de 10. */
function teto(v) {
  if (!(v > 0)) return 1;
  var p = Math.pow(10, Math.floor(Math.log(v) / Math.LN10)), f = v / p;
  return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p;
}
function pctCurto(x) { return String(Math.round(x * 1000) / 10).replace('.', ',') + '%'; }
function numCurto(n) { return n >= 10000 ? String(Math.round(n / 100) / 10).replace('.', ',') + ' mil' : num(n); }
function corta(s, max) { s = String(s); return s.length > max ? s.slice(0, max - 1).trim() + '…' : s; }

function svgTexto(x, y, s, o) {
  o = o || {};
  return '<text x="' + r1(x) + '" y="' + r1(y) + '" font-size="' + (o.t || 22) + '" fill="' + (o.cor || COR.texto) + '"' +
    (o.ancora ? ' text-anchor="' + o.ancora + '"' : '') + (o.peso ? ' font-weight="' + o.peso + '"' : '') + '>' + esc(s) + '</text>';
}
function svgRet(x, y, w, h, cor, raio) {
  return '<rect x="' + r1(x) + '" y="' + r1(y) + '" width="' + r1(Math.max(0, w)) + '" height="' + r1(Math.max(0, h)) +
    '" rx="' + (raio || 0) + '" fill="' + cor + '"/>';
}
function svgLinha(x1, y1, x2, y2, cor, esp) {
  return '<line x1="' + r1(x1) + '" y1="' + r1(y1) + '" x2="' + r1(x2) + '" y2="' + r1(y2) + '" stroke="' + cor + '" stroke-width="' + (esp || 1) + '"/>';
}

/** Título da seção com legenda (quadradinhos coloridos) alinhada à direita. */
function svgSecao(y, titulo, legenda) {
  var s = [svgTexto(MARGEM, y, titulo, { t: 26, peso: 700 })], x = LARG - MARGEM;
  (legenda || []).slice().reverse().forEach(function (l) {
    s.push(svgTexto(x, y, l[1], { t: 18, cor: COR.sec, ancora: 'end' }));
    x -= l[1].length * 9.5 + 10;
    s.push(svgRet(x - 14, y - 14, 14, 14, l[0], l[2] ? 7 : 2));
    x -= 34;
  });
  return s.join('');
}

/** Agrupa o período por dia (até 35 dias) ou por semana. */
function serieTempo(regs, cmd) {
  var n = dias(cmd.ini, cmd.fim), porSemana = n > 35, grupos = [], idx = {};
  for (var d = cmd.ini; d <= cmd.fim; d = somaDias(d, 1)) {
    var chave = porSemana ? 'S' + semanaIso(d) : d;
    if (!(chave in idx)) {
      idx[chave] = grupos.length;
      grupos.push({ regs: [],
        rotulo: porSemana ? 'S' + semanaIso(d) : (n <= 8 ? DIAS_SEM[diaDaSemana(d)] : String(partes(d).d)),
        rotulo2: porSemana || n <= 8 ? brCurto(d) : '' });
    }
    idx[d] = idx[chave];
  }
  regs.forEach(function (r) { if (r.data in idx) grupos[idx[r.data]].regs.push(r); });
  grupos.forEach(function (g) { g.a = agrega(g.regs); });
  return grupos;
}

/**
 * Colunas de produção embaixo e, numa faixa própria em cima, a linha de refugo %
 * (separadas para os números de uma não ficarem por cima dos da outra).
 */
function svgTempo(x, y, w, h, grupos, pilhas) {
  var s = [], n = grupos.length;
  var vals = grupos.map(function (g) { return pilhas ? g.a.pilhas : g.a.pecas; });
  var taxas = grupos.map(function (g) { return pilhas ? null : g.a.refugo; });
  var temTaxa = taxas.some(function (t) { return t !== null; });
  var maxV = teto(Math.max.apply(null, vals.concat([0])));
  var maxT = Math.max.apply(null, taxas.filter(function (t) { return t !== null; }).concat([0])) || 1;
  var px = x + 80, pw = w - 100, ph = h - 64, base = y + ph;
  var hb = temTaxa ? ph * 0.62 : ph;                 // altura máxima das colunas
  var fTopo = y + 30, fBase = y + ph * 0.30;         // faixa da linha de refugo

  for (var i = 0; i <= 4; i++) {
    var yy = base - hb * i / 4;
    s.push(svgLinha(px, yy, px + pw, yy, i ? COR.grade : COR.fraco, i ? 1 : 1.5));
    s.push(svgTexto(px - 12, yy + 6, numCurto(maxV * i / 4), { t: 17, cor: COR.sec, ancora: 'end' }));
  }
  if (temTaxa) {
    s.push('<line x1="' + px + '" y1="' + r1(fBase) + '" x2="' + (px + pw) + '" y2="' + r1(fBase) +
      '" stroke="' + COR.grade + '" stroke-width="1" stroke-dasharray="6 6"/>');
    s.push(svgTexto(px - 12, (fTopo + fBase) / 2 + 6, 'refugo', { t: 17, cor: COR.refugo, ancora: 'end' }));
  }

  var slot = pw / n, bw = Math.min(slot * 0.62, 96), passo = n > 20 ? 2 : 1, pontos = [];
  var rotulaTaxa = function (i) { return n <= 12 || taxas[i] === maxT; };
  grupos.forEach(function (g, i) {
    var cx = px + slot * i + slot / 2, bh = hb * vals[i] / maxV;
    s.push(svgRet(cx - bw / 2, base - bh, bw, bh, COR.barra, n > 20 ? 2 : 4));
    if (n <= 8 && vals[i] > 0) {
      s.push(bh > 40 ? svgTexto(cx, base - bh + 28, numCurto(vals[i]), { t: 18, cor: '#ffffff', ancora: 'middle', peso: 700 })
                     : svgTexto(cx, base - bh - 10, numCurto(vals[i]), { t: 18, cor: COR.sec, ancora: 'middle' }));
    }
    if (i % passo === 0) {
      s.push(svgTexto(cx, base + 28, g.rotulo, { t: n > 20 ? 16 : 19, cor: COR.texto, ancora: 'middle' }));
      if (g.rotulo2) s.push(svgTexto(cx, base + 52, g.rotulo2, { t: 16, cor: COR.sec, ancora: 'middle' }));
    }
    if (taxas[i] !== null) pontos.push([cx, fBase - (fBase - fTopo) * taxas[i] / maxT, taxas[i], i]);
  });

  if (pontos.length > 1) {
    s.push('<polyline fill="none" stroke="' + COR.refugo + '" stroke-width="3.5" stroke-linejoin="round" points="' +
      pontos.map(function (p) { return r1(p[0]) + ',' + r1(p[1]); }).join(' ') + '"/>');
  }
  pontos.forEach(function (p) {
    s.push('<circle cx="' + r1(p[0]) + '" cy="' + r1(p[1]) + '" r="' + (n > 20 ? 4.5 : 7) + '" fill="' + COR.refugo + '" stroke="#ffffff" stroke-width="2.5"/>');
    if (rotulaTaxa(p[3])) s.push(svgTexto(p[0], p[1] - 14, pct(p[2]), { t: n > 8 ? 15 : 18, cor: COR.refugo, ancora: 'middle', peso: 700 }));
  });
  if (!vals.some(function (v) { return v > 0; })) {
    s.push(svgTexto(px + pw / 2, y + ph / 2, 'Sem produção contada no período', { t: 22, cor: COR.sec, ancora: 'middle' }));
  }
  return s.join('');
}

/** Colunas simples com o valor em cima (refugo por setor ou por turno). */
function svgColunas(x, y, w, h, itens) {
  var s = [], n = itens.length, ph = h - 78, base = y + ph;
  var maxV = teto(Math.max.apply(null, itens.map(function (it) { return it.valor || 0; }).concat([0])));
  var slot = w / n, bw = Math.min(slot * 0.5, 130);
  s.push(svgLinha(x, base, x + w, base, COR.fraco, 1.5));
  itens.forEach(function (it, i) {
    var cx = x + slot * i + slot / 2, bh = it.valor ? (ph - 30) * it.valor / maxV : 0;
    if (bh) s.push(svgRet(cx - bw / 2, base - bh, bw, bh, COR.refugo, 4));
    s.push(svgTexto(cx, base - bh - 10, it.texto, { t: it.valor !== null ? 22 : 18, cor: it.valor !== null ? COR.texto : COR.fraco,
      ancora: 'middle', peso: it.valor !== null ? 700 : null }));
    it.rotulo.forEach(function (l, j) { s.push(svgTexto(cx, base + 28 + j * 22, l, { t: 18, ancora: 'middle', peso: j ? null : 700 })); });
    if (it.sub) s.push(svgTexto(cx, base + 28 + it.rotulo.length * 22, it.sub, { t: 16, cor: COR.sec, ancora: 'middle' }));
  });
  return s.join('');
}

/** Barras deitadas: ranking de defeitos. Devolve { svg, altura }. */
function svgRanking(x, y, w, itens, total) {
  var s = [], linha = 54, rotW = 430, numW = 150, bw = w - rotW - numW;
  var max = Math.max.apply(null, itens.map(function (it) { return it[1]; }).concat([1]));
  itens.forEach(function (it, i) {
    var yy = y + i * linha;
    s.push(svgTexto(x, yy + 30, it[0], { t: 20, peso: 700 }));
    s.push(svgTexto(x + 70, yy + 30, corta(DEFEITOS[it[0]] || '', 30), { t: 20, cor: COR.sec }));
    var l = Math.max(4, bw * it[1] / max);
    s.push(svgRet(x + rotW, yy + 10, l, 30, COR.defeito, 4));
    s.push(svgTexto(x + rotW + l + 12, yy + 32, num(it[1]) + (total ? ' · ' + pctCurto(it[1] / total) : ''), { t: 19, cor: COR.sec }));
  });
  return { svg: s.join(''), altura: itens.length * linha };
}

function svgCartao(x, y, w, rotulo, valor, cor) {
  return svgRet(x, y, w, 118, COR.cartao, 14) + svgTexto(x + 22, y + 40, rotulo, { t: 19, cor: COR.sec }) +
    svgTexto(x + 22, y + 92, valor, { t: 38, peso: 700, cor: cor || COR.texto });
}

/** Separa nomes longos em duas linhas ("MADEIRADO" / "COLORIDO"). */
function nomeEmLinhas(nome) { var p = nome.split(' '); return p.length > 1 ? [p[0], p.slice(1).join(' ')] : [nome]; }

/**
 * Painel com os gráficos de um relatório de período.
 * Retorna null quando não cabe gráfico (um dia só, ajuda, pendentes ou nada lançado),
 * ou { html, largura, altura, legenda } para o Gotenberg desenhar e o WAHA mandar como foto.
 */
function graficoRelatorio(cmd, registros) {
  if (!cmd || (cmd.tipo !== 'resumo' && cmd.tipo !== 'defeitos') || cmd.ini === cmd.fim) return null;
  var regs = filtrar(registros, cmd);
  if (!regs.length) return null;
  var total = agrega(regs), pilhas = !total.pecas && total.pilhas > 0;
  var titulo = (cmd.tipo === 'defeitos' ? 'Defeitos' : 'Buy Off · Pintura') + (cmd.setor ? ' · ' + nomeSetor(cmd.setor) : '');
  var s = [], y = 0, W = LARG - 2 * MARGEM;

  s.push(svgTexto(MARGEM, 88, titulo, { t: 44, peso: 700 }));
  s.push(svgTexto(MARGEM, 132, cmd.rotulo, { t: 26, cor: COR.sec }));

  var cw = (W - 3 * 18) / 4;
  s.push(svgCartao(MARGEM, 168, cw, 'Produção', pilhas ? num(total.pilhas) + ' pilhas' : num(total.pecas) + ' pç'));
  s.push(svgCartao(MARGEM + (cw + 18), 168, cw, 'Peças ruins', num(total.ruins)));
  s.push(svgCartao(MARGEM + 2 * (cw + 18), 168, cw, 'Refugo', pct(total.refugo), COR.refugo));
  s.push(svgCartao(MARGEM + 3 * (cw + 18), 168, cw, 'Lançamentos', num(total.n)));

  var grupos = serieTempo(regs, cmd), porSemana = dias(cmd.ini, cmd.fim) > 35;
  y = 362;
  s.push(svgSecao(y, 'Produção e refugo por ' + (porSemana ? 'semana' : 'dia'),
    pilhas ? [[COR.barra, 'pilhas']] : [[COR.barra, 'peças'], [COR.refugo, 'refugo %', true]]));
  s.push(svgTempo(MARGEM, y + 34, W, 380, grupos, pilhas));
  y += 34 + 380 + 64;

  var itens, tituloB;
  if (cmd.setor) {
    tituloB = 'Refugo por turno';
    itens = ['Dia', 'Noite'].map(function (t) {
      var a = agrega(regs.filter(function (r) { return r.turno === t; }));
      return { valor: a.refugo, texto: a.refugo !== null ? pct(a.refugo) : (a.n ? 'em pilhas' : 'sem lançamento'),
        rotulo: [t], sub: a.pecas ? num(a.pecas) + ' pç' : (a.pilhas ? num(a.pilhas) + ' pilhas' : '') };
    });
  } else {
    tituloB = 'Refugo por setor';
    itens = SETORES.map(function (st) {
      var a = agrega(regs.filter(function (r) { return r.setor === st.id; }));
      return { valor: a.refugo, texto: a.refugo !== null ? pct(a.refugo) : (a.n ? 'em pilhas' : 'sem lanç.'),
        rotulo: nomeEmLinhas(st.nome), sub: a.pecas ? num(a.pecas) + ' pç' : (a.pilhas ? num(a.pilhas) + ' pilhas' : '') };
    });
  }
  s.push(svgSecao(y, tituloB));
  s.push(svgColunas(MARGEM, y + 34, W, 290, itens));
  y += 34 + 290 + 60;

  var top = topDefeitos(total.defeitos, 6);
  s.push(svgSecao(y, 'Principais defeitos' + (top.length ? ' (' + num(total.ruins) + ' peças ruins)' : '')));
  if (top.length) {
    var rk = svgRanking(MARGEM, y + 20, W, top, total.ruins);
    s.push(rk.svg);
    y += 20 + rk.altura;
  } else {
    s.push(svgTexto(MARGEM, y + 56, 'Nenhum defeito lançado no período.', { t: 22, cor: COR.sec }));
    y += 72;
  }
  y += 40;
  s.push(svgLinha(MARGEM, y, LARG - MARGEM, y, COR.grade, 1));
  s.push(svgTexto(MARGEM, y + 36, 'Apontamento Buy Off · refugo % considera só a produção contada em peças', { t: 17, cor: COR.fraco }));
  var H = Math.ceil(y + 64);

  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + LARG + '" height="' + H + '" viewBox="0 0 ' + LARG + ' ' + H +
    '" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif">' + svgRet(0, 0, LARG, H, COR.fundo) + s.join('') + '</svg>';
  var html = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}' +
    'body{width:' + LARG + 'px;height:' + H + 'px;overflow:hidden}svg{display:block}</style></head><body>' + svg + '</body></html>';
  var legenda = '📊 *' + titulo + '*\n_' + cmd.rotulo + '_\n' + linhaProducao(total) +
    (total.refugo !== null ? ' · refugo ' + pct(total.refugo) : '');
  return { html: html, largura: LARG, altura: H, legenda: legenda };
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
    faltando: faltando, lerAutorizados: lerAutorizados, autorizado: autorizado, semanaIso: semanaIso,
    graficoRelatorio: graficoRelatorio, teto: teto, controleSessao: controleSessao, textoSair: textoSair,
    SESSAO_MINUTOS: SESSAO_MINUTOS };
}
