// Lançamentos fictícios no mesmo formato que o Code.gs devolve na ação "listar".
// Como na fábrica: todos os setores lançam em pilha, só a IBOTIC em peças.
function reg(id, data, setor, turno, producao, unidade, defeitos) {
  var ruins = 0;
  Object.keys(defeitos).forEach(function (k) { ruins += defeitos[k]; });
  var nomes = { 'tagliabue': 'TAGLIABUE', 'ibotic': 'IBOTIC', 'polimento': 'POLIMENTO',
    'madeirado-uv': 'MADEIRADO UV', 'madeirado-colorido': 'MADEIRADO COLORIDO' };
  return { id: id, criadoEm: data + 'T12:00:00.000Z', data: data, ano: 2026, semana: 0,
    setorNome: nomes[setor], setor: setor, turno: turno, operador: 'Operador Teste',
    producao: producao, unidade: unidade, ruins: ruins, defeitos: defeitos, obs: '', fotos: 0 };
}

module.exports = [
  // terça 17/11/2026 (hoje nos testes)
  reg('a1', '2026-11-17', 'tagliabue', 'Dia', 24, 'Pilha', { Q72: 12, Q1: 8, Q120: 2 }),
  reg('a2', '2026-11-17', 'ibotic', 'Dia', 800, 'Peça', { Q81: 10, Q179: 2 }),
  reg('a3', '2026-11-17', 'madeirado-uv', 'Dia', 15, 'Pilha', { Q201: 4 }),
  // segunda 16/11
  reg('b1', '2026-11-16', 'tagliabue', 'Dia', 20, 'Pilha', { Q72: 20 }),
  reg('b2', '2026-11-16', 'tagliabue', 'Noite', 18, 'Pilha', { Q1: 9 }),
  reg('b3', '2026-11-16', 'ibotic', 'Dia', 700, 'Peça', {}),
  reg('b4', '2026-11-16', 'ibotic', 'Noite', 650, 'Peça', { Q73: 3 }),
  reg('b5', '2026-11-16', 'polimento', 'Dia', 8, 'Pilha', { Q74: 6, Q77: 1 }),
  reg('b6', '2026-11-16', 'polimento', 'Noite', 7, 'Pilha', { Q79: 2 }),
  reg('b7', '2026-11-16', 'madeirado-uv', 'Dia', 12, 'Pilha', { Q201: 5 }),
  reg('b8', '2026-11-16', 'madeirado-uv', 'Noite', 11, 'Pilha', {}),
  reg('b9', '2026-11-16', 'madeirado-colorido', 'Dia', 10, 'Pilha', { Q87: 4 }),
  reg('b10', '2026-11-16', 'madeirado-colorido', 'Noite', 9, 'Pilha', { Q154: 1 }),
  // semana anterior (sexta 13/11) e outubro
  reg('c1', '2026-11-13', 'polimento', 'Dia', 10, 'Pilha', { Q74: 10 }),
  reg('c2', '2026-10-30', 'ibotic', 'Noite', 600, 'Peça', { Q81: 6 }),
  // lançamento antigo sem contagem de produção
  reg('c3', '2026-11-12', 'tagliabue', 'Dia', null, 'Peça', { Q1: 3 })
];
