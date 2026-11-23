/*
 * Núcleo do chatbot Buy Off: interpreta o comando e monta o texto do relatório.
 *
 * Funções puras (sem n8n, sem rede): dá para testar com `node chatbot/test/teste.js`.
 * O build-workflow.js copia este arquivo para dentro dos nós "Code" do workflow do n8n.
 * Depois de mudar aqui, rode `node chatbot/build-workflow.js` e reimporte o workflow.
 */

var TZ = 'America/Sao_Paulo';

// Mesmos ids e nomes do app.js / Code.gs. "apelidos" = como o pessoal escreve no WhatsApp.
// A ordem aqui é a numeração do menu de setores (1 = Tagliabue ... 5 = Madeirado Colorido).
var SETORES = [
  { id: 'tagliabue', nome: 'TAGLIABUE', menu: 'Tagliabue', apelidos: ['tagliabue', 'taglia'] },
  { id: 'ibotic', nome: 'IBOTIC', menu: 'IBOTIC', apelidos: ['ibotic'] },
  { id: 'polimento', nome: 'POLIMENTO', menu: 'Polimento', apelidos: ['polimento'] },
  { id: 'madeirado-uv', nome: 'MADEIRADO UV', menu: 'Madeirado UV', apelidos: ['madeirado uv', 'madeirado-uv', 'uv'] },
  { id: 'madeirado-colorido', nome: 'MADEIRADO COLORIDO', menu: 'Madeirado Colorido', apelidos: ['madeirado colorido', 'madeirado-colorido', 'colorido'] }
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

/** "16/11 a 22/11/2026", ou "seg 23/11/2026" quando o período tem um dia só (ex.: semana na segunda-feira). */
function periodo(ini, fim) { return ini === fim ? DIAS_SEM[diaDaSemana(ini)] + ' ' + br(ini) : brCurto(ini) + ' a ' + br(fim); }

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

  // setores citados (pode ser mais de um: "semana ibotic polimento")
  var achados = acharSetores(s);
  var setores = achados.setores, setor = setores && setores.length === 1 ? setores[0] : null;
  s = achados.resto;

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

  if (!palavras.length && !datas.length && !setores) return { tipo: 'ajuda' };
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
    rotulo = 'Semana ' + semanaIso(ini) + ' · ' + periodo(ini, fim);
  } else if (tem('mes', 'mensal')) {
    var p = partes(hoje);
    if (anterior) {
      var y = p.m === 1 ? p.y - 1 : p.y, mm = p.m === 1 ? 12 : p.m - 1;
      ini = y + '-' + pad(mm) + '-01'; fim = somaDias(p.y + '-' + pad(p.m) + '-01', -1);
    } else { ini = p.y + '-' + pad(p.m) + '-01'; fim = hoje; }
    rotulo = 'Mês ' + pad(partes(ini).m) + '/' + partes(ini).y + ' · ' + periodo(ini, fim);
  } else if (tem('hoje', 'dia', 'agora', 'resumo', 'relatorio', 'defeito', 'defeitos', 'codigos', 'codigo', 'top',
                 'pendente', 'pendentes', 'pendencia', 'pendencias', 'faltando', 'falta', 'faltam') || setores) {
    ini = fim = hoje;
    rotulo = 'Hoje · ' + DIAS_SEM[diaDaSemana(ini)] + ' ' + br(ini);
  } else {
    return { tipo: 'ajuda', naoEntendi: true };
  }

  if (ini > hoje) return { tipo: 'erro', msg: 'A data ' + br(ini) + ' ainda não chegou.' };
  if (fim > hoje) fim = hoje;
  if (dias(ini, fim) > MAX_DIAS) return { tipo: 'erro', msg: 'Período grande demais (máximo ' + MAX_DIAS + ' dias).' };
  if (tipo === 'pendentes' && ini !== fim) { ini = fim; rotulo = DIAS_SEM[diaDaSemana(fim)] + ' ' + br(fim); }

  return { tipo: tipo, ini: ini, fim: fim, rotulo: rotulo, setor: setor, setores: setores };
}

/**
 * Procura nomes de setores no texto (apelidos mais longos primeiro, para "madeirado uv" ganhar de "uv").
 * Retorna { setores: [ids na ordem do menu] ou null, resto: texto sem os nomes }.
 */
function acharSetores(s) {
  var lista = [], achou = {};
  SETORES.forEach(function (st) { st.apelidos.forEach(function (a) { lista.push([a, st.id]); }); });
  lista.sort(function (a, b) { return b[0].length - a[0].length; });
  lista.forEach(function (l) {
    var re = new RegExp('(^|[^a-z0-9])' + l[0].replace(/[-]/g, '\\-') + '(?=[^a-z0-9]|$)', 'g');
    if (re.test(s)) { achou[l[1]] = true; s = s.replace(re, '$1 '); }
  });
  var ids = SETORES.filter(function (st) { return achou[st.id]; }).map(function (st) { return st.id; });
  return { setores: ids.length ? ids : null, resto: s };
}

/** Setores escolhidos no comando (null = todos). */
function selecao(cmd) { return cmd.setores || (cmd.setor ? [cmd.setor] : null); }

/** Grava a escolha de setores no comando (null = todos; um só = relatório detalhado do setor). */
function aplicarSetores(cmd, setores) {
  cmd.setores = setores && setores.length ? setores : null;
  cmd.setor = cmd.setores && cmd.setores.length === 1 ? cmd.setores[0] : null;
  return cmd;
}

// ---------------------------------------------------------------------------
// Cálculo
// ---------------------------------------------------------------------------

function filtrar(registros, cmd) {
  var sel = selecao(cmd);
  return (registros || []).filter(function (r) {
    return r && r.data >= cmd.ini && r.data <= cmd.fim && (!sel || sel.indexOf(r.setor) >= 0);
  });
}

/**
 * Soma um conjunto de lançamentos. Produção em pilhas e em peças fica separada
 * (não dá para somar uma com a outra); os defeitos são sempre contados por peça.
 */
function agrega(regs) {
  var a = { n: 0, pecas: 0, pilhas: 0, ruins: 0, defeitos: {}, turnos: {} };
  regs.forEach(function (r) {
    a.n++;
    a.ruins += r.ruins || 0;
    a.turnos[r.turno] = (a.turnos[r.turno] || 0) + 1;
    if (r.unidade === 'Pilha') a.pilhas += r.producao || 0;
    else if (r.producao !== null && r.producao !== undefined) a.pecas += r.producao;
    Object.keys(r.defeitos || {}).forEach(function (c) { a.defeitos[c] = (a.defeitos[c] || 0) + r.defeitos[c]; });
  });
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

/** "38 peças ruins · 3 lançamentos" (é o que os relatórios mostram de cada grupo). */
function linhaRuins(a) {
  return num(a.ruins) + (a.ruins === 1 ? ' peça ruim' : ' peças ruins') + ' · ' +
    num(a.n) + (a.n === 1 ? ' lançamento' : ' lançamentos');
}

function nomesSelecao(cmd) {
  var sel = selecao(cmd);
  return sel ? sel.map(nomeSetor).join(', ') : '';
}

function cabecalho(cmd, titulo) {
  var nomes = nomesSelecao(cmd);
  return '📊 *' + titulo + '*' + (nomes ? ' · ' + nomes : '') + '\n_' + cmd.rotulo + '_';
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
  var sel = selecao(cmd);
  var f = faltando(registros, cmd.fim).filter(function (x) { return !sel || sel.indexOf(x.setor) >= 0; });
  if (!f.length) return '';
  var titulo = cmd.fim === hoje ? 'Ainda sem lançamento hoje' : 'Sem lançamento';
  return '⚠️ *' + titulo + ':* ' + f.map(function (x) {
    return nomeSetor(x.setor) + ' (' + x.turnos.join(', ') + ')';
  }).join(' · ');
}

function principais(defs, n) {
  var top = topDefeitos(defs, n);
  return top.length ? 'Principais: ' + top.map(function (d) { return descDefeito(d[0]) + ' (' + num(d[1]) + ')'; }).join(' · ') : '';
}

function relatorioResumo(cmd, registros, hoje) {
  var regs = filtrar(registros, cmd);
  var linhas = [cabecalho(cmd, 'Buy Off · Pintura'), ''];
  var total = agrega(regs);

  if (!regs.length) {
    linhas.push('Nenhum lançamento no período.');
  } else if (cmd.setor) {
    // um setor só: detalhe por turno e, em períodos, por dia
    linhas.push('*Total:* ' + linhaRuins(total));
    if (cmd.ini === cmd.fim) linhas.push('Turnos: ' + marcasTurno(total));
    var p = principais(total.defeitos, 5);
    if (p) linhas.push(p);
    ['Dia', 'Noite'].forEach(function (t) {
      var at = agrega(regs.filter(function (r) { return r.turno === t; }));
      if (at.n) linhas.push('  ' + t + ': ' + linhaRuins(at));
    });
    if (cmd.ini !== cmd.fim) {
      linhas.push('', '_Por dia:_');
      for (var d = cmd.ini; d <= cmd.fim; d = somaDias(d, 1)) {
        var ad = agrega(regs.filter(function (r) { return r.data === d; }));
        if (ad.n) linhas.push('  ' + DIAS_SEM[diaDaSemana(d)] + ' ' + brCurto(d) + ': ' + linhaRuins(ad));
      }
    }
  } else {
    linhas.push('*Total:* ' + linhaRuins(total));
    (selecao(cmd) || SETORES.map(function (st) { return st.id; })).forEach(function (id) {
      var rs = regs.filter(function (r) { return r.setor === id; });
      linhas.push('');
      if (!rs.length) { linhas.push('*' + nomeSetor(id) + '* · sem lançamento'); return; }
      var a = agrega(rs);
      linhas.push('*' + nomeSetor(id) + '*' + (cmd.ini === cmd.fim ? ' · ' + marcasTurno(a) : ''));
      linhas.push(linhaRuins(a));
      var pr = principais(a.defeitos, 3);
      if (pr) linhas.push(pr);
    });
  }

  var f = textoFaltando(registros, cmd, hoje);
  if (f) linhas.push('', f);
  return linhas.join('\n');
}

function marcasTurno(a) {
  return ['Dia', 'Noite'].map(function (t) { return t + (a.turnos[t] ? ' ✓' : ' ✗'); }).join(' ');
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
  linhas.push('*Total:* ' + linhaRuins(a), '');
  top.forEach(function (d, i) {
    linhas.push((i + 1) + '. *' + d[0] + '* ' + (DEFEITOS[d[0]] || '') + ': ' + num(d[1]) + ' (' + pct(a.ruins ? d[1] / a.ruins : 0) + ')');
  });
  var sel = selecao(cmd);
  if (!cmd.setor) {
    linhas.push('', '_Por setor:_');
    SETORES.forEach(function (st) {
      if (sel && sel.indexOf(st.id) < 0) return;
      var as = agrega(regs.filter(function (r) { return r.setor === st.id; }));
      if (as.ruins) linhas.push('  ' + st.nome + ': ' + num(as.ruins) + (as.ruins === 1 ? ' peça ruim' : ' peças ruins') +
        ' · mais comum ' + topDefeitos(as.defeitos, 1)[0][0]);
    });
  }
  return linhas.join('\n');
}

function relatorioPendentes(cmd, registros, hoje) {
  var f = textoFaltando(registros, cmd, hoje);
  return cabecalho(cmd, 'Lançamentos') + '\n\n' + (f || '✅ Todos os setores e turnos já lançaram.');
}

// ---------------------------------------------------------------------------
// Conversa no privado: "relatorio" abre o menu, o número escolhe o relatório,
// depois vem a escolha do(s) setor(es). "sair" encerra.
// Fora disso o bot fica em silêncio (o número pode ser usado para conversar normalmente).
// Em grupo não há menu: valem os comandos com barra (/hoje, /semana ibotic).
// ---------------------------------------------------------------------------

var SESSAO_MINUTOS = 30; // encerra sozinho depois desse tempo sem mensagens

// Opções do menu principal, na ordem dos números. semSetor = não pergunta o setor.
var MENU = [
  { texto: 'Hoje', comando: 'hoje' },
  { texto: 'Ontem', comando: 'ontem' },
  { texto: 'Esta semana', comando: 'semana' },
  { texto: 'Semana passada', comando: 'semana passada' },
  { texto: 'Este mês', comando: 'mes' },
  { texto: 'Defeitos da semana', comando: 'defeitos semana' },
  { texto: 'Quem ainda não lançou hoje', comando: 'pendentes', semSetor: true }
];
var NUM_EMOJI = ['0️⃣', '1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣', '6️⃣', '7️⃣', '8️⃣', '9️⃣'];

function textoMenu(aviso) {
  return (aviso ? aviso + '\n\n' : '') + '📊 *Buy Off · Pintura*\nEscolha o relatório:\n\n' +
    MENU.map(function (m, i) { return NUM_EMOJI[i + 1] + ' ' + m.texto; }).join('\n') +
    '\n\n_Responda com o número · *sair* para encerrar_';
}

function textoMenuSetor(opcao, aviso) {
  var e = function (i) { return NUM_EMOJI[i + 1] + ' ' + SETORES[i].menu; };
  return (aviso ? aviso + '\n\n' : '') + '🏭 *Qual setor?*' + (MENU[opcao] ? ' · ' + MENU[opcao].texto : '') + '\n\n' +
    NUM_EMOJI[0] + ' Todos\n' + e(0) + '   ' + e(1) + '   ' + e(2) + '\n' + e(3) + '   ' + e(4) +
    '\n\n_Pode escolher vários: *1 3* ou *1,3*_';
}

function textoSair() {
  return '👋 *Relatórios encerrados.*\nQuando precisar de novo, mande *relatorio*.';
}

/** Ajuda dos grupos, onde não há menu: comandos com barra. */
function ajudaGrupo(naoEntendi) {
  return (naoEntendi ? 'Não entendi. ' : '') + '📊 *Buy Off · Pintura*\nComandos (comece com barra):\n\n' +
    '*/hoje* · */ontem* · */semana* · */semana passada* · */mes*\n' +
    '*/17/11* (um dia) · */10/11 a 16/11* (período)\n' +
    '*/defeitos semana* · */pendentes*\n\n' +
    'Para escolher setores, acrescente o nome: */semana ibotic*, */ontem polimento uv*';
}

/**
 * Lê a escolha de setores: números do menu ("0" = todos, "1 3", "1,3", "1 e 3", "13") ou nomes.
 * Retorna null (não é uma escolha), { erro } ou { setores: [ids] ou null para todos }.
 */
function lerSetores(s) {
  if (/^[\d\s,;.e+-]+$/.test(s) && /\d/.test(s)) {
    var nums = [];
    s.split(/[^\d]+/).filter(Boolean).forEach(function (t) {
      if (t.length > 1 && /^[0-5]+$/.test(t)) nums = nums.concat(t.split('').map(Number)); else nums.push(Number(t));
    });
    if (nums.some(function (k) { return k > SETORES.length; })) return { erro: 'Opção inválida.' };
    if (nums.indexOf(0) >= 0) return { setores: null };
    var ids = SETORES.filter(function (st, i) { return nums.indexOf(i + 1) >= 0; }).map(function (st) { return st.id; });
    return { setores: ids };
  }
  if (/^(todos|todas|tudo|geral)$/.test(s)) return { setores: null };
  var a = acharSetores(' ' + s + ' ');
  if (a.setores && !a.resto.replace(/\b(e|o|a|os|as|de|do|da)\b/g, '').replace(/[^a-z0-9]/g, '')) return { setores: a.setores };
  return null;
}

function comRodape(cmd) {
  if (cmd.tipo === 'resumo' || cmd.tipo === 'defeitos' || cmd.tipo === 'pendentes') cmd.rodape = true;
  return cmd;
}

/**
 * Um passo da conversa. estado = o que ficou guardado para aquele chat (ou vazio):
 *   { ate: ms até quando a conversa fica aberta, etapa: 'menu' | 'setor', opcao: índice do MENU }.
 * Retorna { estado (novo, ou null para apagar), cmd (o que responder, ou null para ficar quieto) }.
 */
function conversa(texto, estado, agoraMs, hoje, grupo) {
  if (typeof estado === 'number') estado = { ate: estado, etapa: 'menu' }; // formato antigo
  var ativo = !!(estado && estado.ate > agoraMs);
  var renova = agoraMs + SESSAO_MINUTOS * 60000;
  var s = normaliza(texto).replace(/^[\/!#.]+/, '').trim();
  var m = s.match(/^(relatorios?|sair)(?![a-z0-9])[\s,.;:!?-]*(.*)$/);
  var palavra = m ? m[1].replace(/s$/, '') : null, resto = m ? m[2].trim() : '';
  var menu = { ate: renova, etapa: 'menu' };

  if (grupo) {
    if (palavra === 'sair') return { estado: null, cmd: null };
    var tg = palavra === 'relatorio' ? resto : texto;
    var cg = interpretar(tg, hoje);
    if (cg.tipo === 'ajuda') cg.grupo = true;
    return { estado: null, cmd: cg };
  }

  if (palavra === 'relatorio') {
    if (!resto) return { estado: menu, cmd: { tipo: 'menu' } };
    var cr = interpretar(resto, hoje);
    return { estado: menu, cmd: cr.tipo === 'ajuda' ? { tipo: 'menu' } : comRodape(cr) };
  }
  if (palavra === 'sair') return { estado: null, cmd: ativo ? { tipo: 'aviso', msg: textoSair() } : null };
  if (!ativo) return { estado: null, cmd: null };

  if (/^(menu|ajuda|help|comandos|voltar|inicio|oi|ola)$/.test(s)) return { estado: menu, cmd: { tipo: 'menu' } };

  if (estado.etapa === 'setor' && MENU[estado.opcao]) {
    var sel = lerSetores(s);
    if (sel && sel.erro) {
      return { estado: { ate: renova, etapa: 'setor', opcao: estado.opcao }, cmd: { tipo: 'menuSetor', opcao: estado.opcao, aviso: '⚠️ ' + sel.erro } };
    }
    if (sel) return { estado: menu, cmd: comRodape(aplicarSetores(interpretar(MENU[estado.opcao].comando, hoje), sel.setores)) };
  }

  if (/^\d{1,2}$/.test(s)) {
    var k = Number(s) - 1, item = MENU[k];
    if (!item) return { estado: menu, cmd: { tipo: 'menu', aviso: '⚠️ Opção inválida.' } };
    if (item.semSetor) return { estado: menu, cmd: comRodape(interpretar(item.comando, hoje)) };
    return { estado: { ate: renova, etapa: 'setor', opcao: k }, cmd: { tipo: 'menuSetor', opcao: k } };
  }

  // comandos escritos continuam valendo ("semana ibotic", "17/11"...)
  var c = interpretar(texto, hoje);
  if (c.tipo === 'ajuda') return { estado: menu, cmd: { tipo: 'menu', aviso: c.naoEntendi ? 'Não entendi. 🤔' : '' } };
  return { estado: menu, cmd: comRodape(c) };
}

/** Monta a resposta final. registros = lista devolvida pelo Apps Script (acao listar). */
function responder(cmd, registros, hoje) {
  var txt;
  if (cmd.tipo === 'menu') return textoMenu(cmd.aviso);
  if (cmd.tipo === 'menuSetor') return textoMenuSetor(cmd.opcao, cmd.aviso);
  if (cmd.tipo === 'ajuda') return cmd.grupo ? ajudaGrupo(cmd.naoEntendi) : textoMenu(cmd.naoEntendi ? 'Não entendi. 🤔' : '');
  if (cmd.tipo === 'aviso') return cmd.msg;
  if (cmd.tipo === 'erro') return '⚠️ ' + cmd.msg + '\n\nMande *menu* para ver as opções.';
  if (cmd.tipo === 'defeitos') txt = relatorioDefeitos(cmd, registros);
  else if (cmd.tipo === 'pendentes') txt = relatorioPendentes(cmd, registros, hoje);
  else txt = relatorioResumo(cmd, registros, hoje);
  return txt + (cmd.rodape ? '\n\n_*menu* para outro relatório · *sair* para encerrar_' : '');
}

// ---------------------------------------------------------------------------
// Painel de gráficos: uma página HTML (só SVG, sem JavaScript nem nada de fora)
// que o Gotenberg transforma em foto PNG. Vai antes do texto nos relatórios de período.
// ---------------------------------------------------------------------------

var COR = { fundo: '#ffffff', texto: '#2C2C2A', sec: '#5F5E5A', fraco: '#888780', grade: '#E6E4DD',
  cartao: '#F4F3EE', barra: '#378ADD', ruins: '#D85A30', defeito: '#7F77DD' };
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

/** Colunas de produção por dia (ou semana), em pilhas ou em peças. */
function svgTempo(x, y, w, h, grupos, pilhas) {
  var s = [], n = grupos.length;
  var vals = grupos.map(function (g) { return pilhas ? g.a.pilhas : g.a.pecas; });
  var maxV = teto(Math.max.apply(null, vals.concat([0])));
  var px = x + 80, pw = w - 100, ph = h - 64, base = y + ph, hb = ph - 20;

  for (var i = 0; i <= 4; i++) {
    var yy = base - hb * i / 4;
    s.push(svgLinha(px, yy, px + pw, yy, i ? COR.grade : COR.fraco, i ? 1 : 1.5));
    s.push(svgTexto(px - 12, yy + 6, numCurto(maxV * i / 4), { t: 17, cor: COR.sec, ancora: 'end' }));
  }

  var slot = pw / n, bw = Math.min(slot * 0.62, 96), passo = n > 20 ? 2 : 1;
  grupos.forEach(function (g, i) {
    var cx = px + slot * i + slot / 2, bh = hb * vals[i] / maxV;
    s.push(svgRet(cx - bw / 2, base - bh, bw, bh, COR.barra, n > 20 ? 2 : 4));
    if (n <= 12 && vals[i] > 0) {
      s.push(bh > 40 ? svgTexto(cx, base - bh + 28, numCurto(vals[i]), { t: n > 8 ? 16 : 18, cor: '#ffffff', ancora: 'middle', peso: 700 })
                     : svgTexto(cx, base - bh - 10, numCurto(vals[i]), { t: n > 8 ? 16 : 18, cor: COR.sec, ancora: 'middle' }));
    }
    if (i % passo === 0) {
      s.push(svgTexto(cx, base + 28, g.rotulo, { t: n > 20 ? 16 : 19, cor: COR.texto, ancora: 'middle' }));
      if (g.rotulo2) s.push(svgTexto(cx, base + 52, g.rotulo2, { t: 16, cor: COR.sec, ancora: 'middle' }));
    }
  });
  if (!vals.some(function (v) { return v > 0; })) {
    s.push(svgTexto(px + pw / 2, y + ph / 2, 'Sem produção contada no período', { t: 22, cor: COR.sec, ancora: 'middle' }));
  }
  return s.join('');
}

/** Colunas simples com o valor em cima (peças ruins por setor ou por turno). */
function svgColunas(x, y, w, h, itens) {
  var s = [], n = itens.length, ph = h - 78, base = y + ph;
  // sem eixo: a maior coluna ocupa a altura toda
  var maxV = Math.max.apply(null, itens.map(function (it) { return it.valor || 0; }).concat([0])) || 1;
  var slot = w / n, bw = Math.min(slot * 0.5, 130);
  s.push(svgLinha(x, base, x + w, base, COR.fraco, 1.5));
  itens.forEach(function (it, i) {
    var cx = x + slot * i + slot / 2, bh = it.valor ? (ph - 30) * it.valor / maxV : 0;
    if (bh) s.push(svgRet(cx - bw / 2, base - bh, bw, bh, COR.ruins, 4));
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

/** Cartão de total. extra = texto pequeno no canto (ex.: a produção em peças ao lado da em pilhas). */
function svgCartao(x, y, w, rotulo, valor, extra) {
  return svgRet(x, y, w, 118, COR.cartao, 14) + svgTexto(x + 22, y + 40, rotulo, { t: 19, cor: COR.sec }) +
    (extra ? svgTexto(x + w - 22, y + 40, extra, { t: 18, cor: COR.sec, ancora: 'end' }) : '') +
    svgTexto(x + 22, y + 92, valor, { t: 38, peso: 700 });
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
  // Produção em pilhas (como quase todos os setores lançam); em peças só se não houver pilha no período.
  var total = agrega(regs), pilhas = total.pilhas > 0 || !total.pecas;
  var nomes = nomesSelecao(cmd);
  // Nomes curtos vão no título; muitos setores ganham uma linha própria embaixo (não cabem no título).
  var noTitulo = nomes && nomes.length <= 18, linhaNomes = nomes && !noTitulo ? 36 : 0;
  var titulo = (cmd.tipo === 'defeitos' ? 'Defeitos' : 'Buy Off · Pintura') + (noTitulo ? ' · ' + nomes : '');
  var s = [], y = 0, W = LARG - 2 * MARGEM;

  s.push(svgTexto(MARGEM, 88, titulo, { t: 44, peso: 700 }));
  s.push(svgTexto(MARGEM, 132, cmd.rotulo, { t: 26, cor: COR.sec }));
  if (linhaNomes) s.push(svgTexto(MARGEM, 168, corta(nomes, 80), { t: 22, peso: 700, cor: COR.sec }));

  var cw = (W - 2 * 18) / 3;
  s.push(svgCartao(MARGEM, 168 + linhaNomes, cw, 'Produção', pilhas ? num(total.pilhas) + (total.pilhas === 1 ? ' pilha' : ' pilhas') : num(total.pecas) + ' peças',
    pilhas && total.pecas ? '+ ' + numCurto(total.pecas) + ' peças' : ''));
  s.push(svgCartao(MARGEM + (cw + 18), 168 + linhaNomes, cw, 'Peças ruins', num(total.ruins)));
  s.push(svgCartao(MARGEM + 2 * (cw + 18), 168 + linhaNomes, cw, 'Lançamentos', num(total.n)));

  var grupos = serieTempo(regs, cmd), porSemana = dias(cmd.ini, cmd.fim) > 35;
  y = 362 + linhaNomes;
  s.push(svgSecao(y, 'Produção por ' + (porSemana ? 'semana' : 'dia'), [[COR.barra, pilhas ? 'pilhas' : 'peças']]));
  s.push(svgTempo(MARGEM, y + 34, W, 380, grupos, pilhas));
  y += 34 + 380 + 64;

  var itens, tituloB, sel = selecao(cmd);
  function coluna(a, rotulo) {
    return { valor: a.n ? a.ruins : null, texto: a.n ? num(a.ruins) : 'sem lanç.', rotulo: rotulo,
      sub: a.n ? num(a.n) + (a.n === 1 ? ' lançamento' : ' lançamentos') : '' };
  }
  if (cmd.setor) {
    tituloB = 'Peças ruins por turno';
    itens = ['Dia', 'Noite'].map(function (t) { return coluna(agrega(regs.filter(function (r) { return r.turno === t; })), [t]); });
  } else {
    tituloB = 'Peças ruins por setor';
    itens = SETORES.filter(function (st) { return !sel || sel.indexOf(st.id) >= 0; }).map(function (st) {
      return coluna(agrega(regs.filter(function (r) { return r.setor === st.id; })), nomeEmLinhas(st.nome));
    });
  }
  s.push(svgSecao(y, tituloB));
  s.push(svgColunas(MARGEM, y + 34, W, 290, itens));
  y += 34 + 290 + 60;

  var top = topDefeitos(total.defeitos, 6);
  s.push(svgSecao(y, 'Principais defeitos'));
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
  s.push(svgTexto(MARGEM, y + 36, 'Apontamento Buy Off' +
    (pilhas && total.pecas ? ' · produção em pilhas; lançamentos em peças só no total' : ''), { t: 17, cor: COR.fraco }));
  var H = Math.ceil(y + 64);

  var svg = '<svg xmlns="http://www.w3.org/2000/svg" width="' + LARG + '" height="' + H + '" viewBox="0 0 ' + LARG + ' ' + H +
    '" font-family="Liberation Sans, DejaVu Sans, Arial, sans-serif">' + svgRet(0, 0, LARG, H, COR.fundo) + s.join('') + '</svg>';
  var html = '<!doctype html><html><head><meta charset="utf-8"><style>html,body{margin:0;padding:0;background:#fff}' +
    'body{width:' + LARG + 'px;height:' + H + 'px;overflow:hidden}svg{display:block}</style></head><body>' + svg + '</body></html>';
  var legenda = '📊 *' + titulo + '*\n_' + cmd.rotulo + '_\n' + linhaRuins(total);
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
    graficoRelatorio: graficoRelatorio, teto: teto, conversa: conversa, textoSair: textoSair,
    lerSetores: lerSetores, aplicarSetores: aplicarSetores, MENU: MENU, SESSAO_MINUTOS: SESSAO_MINUTOS };
}
