/* Painel de controle — roda só no Mac.
 *
 * Cada mexida grava no config.json e viaja pelo SSE que já existe, então o
 * tablet aplica na hora, sem recarregar e sem ninguém tocar nele.
 */
'use strict';

const CARTOES = [
  ['clima',     'Clima',            'temperatura e previsão'],
  ['claude',    'Claude Code / Git', 'sessões e pull requests'],
  ['agenda',    'Agenda',           'compromissos do dia'],
  ['mensagens', 'Mensagens',        'Gmail, Chat e WhatsApp'],
  ['monitor',   'Monitor do Mac',   'CPU, memória e swap'],
  ['recado',    'Recado',           'o texto que você escrever abaixo'],
];

const TEMPOS = [
  ['slide',   'Troca de slide',        's',   'a cada quanto o cartão vira'],
  ['animado', 'Bichinho congela após', 's',   'depois vira o asterisco'],
  ['pronto',  'Concluído some após',   's',   'libera a vaga pro que está rodando'],
  ['sono',    'Clawd dorme após',      's',   'sem nada acontecendo'],
  ['mascote', 'Troca de mascote',      's',   'alterna picareta e faíscas'],
  ['tela',    'Tela de detalhe volta', 's',   'depois do toque'],
  ['bichos',  'Sessões no cartão',     'un.', 'o resto vai pro rodapé'],
  ['contas',  'Contas por slide',      'un.', 'no cartão de mensagens'],
];

const CORES = [
  ['fundo','Fundo'], ['cartao','Cartão'], ['dentro','Interior'], ['borda','Borda'],
  ['texto','Texto'], ['apagado','Texto fraco'], ['fraco','Texto apagado'],
  ['ciano','Destaque'], ['azul','Azul'], ['verde','Verde'],
  ['laranja','Laranja'], ['vermelho','Vermelho'],
];

const PADRAO_CORES = {fundo:'#000000',cartao:'#0c0d10',dentro:'#131620',borda:'#1d1f26',
  texto:'#ffffff',apagado:'#7c8089',fraco:'#4a4d55',ciano:'#22d3ee',azul:'#3b82f6',
  verde:'#22c55e',laranja:'#f59e0b',vermelho:'#ef4444'};

const FONTES = [
  ['cidade',              'texto',  'Cidade do clima',      'ex.: Paulínia, SP'],
  ['repo_design',         'texto',  'Repositório vigiado',  'ex.: sua-org/seu-repo'],
  ['clima_intervalo_s',   'numero', 'Buscar clima (s)',     'a cada quanto consulta'],
  ['agenda_intervalo_s',  'numero', 'Buscar agenda (s)',    'lê o tablet por adb'],
  ['github_intervalo_s',  'numero', 'Buscar GitHub (s)',    'três buscas por volta'],
  ['maquina_intervalo_s', 'numero', 'Medir o Mac (s)',      'CPU, memória e swap'],
];

let fontes = {};
let painel = null;
let pendente = null;

/* -------------------------------------------------------------- gravação */
function salvar(secao, chave, valor) {
  painel[secao] = painel[secao] || {};
  if (chave === null) painel[secao] = valor; else painel[secao][chave] = valor;

  // Junta as mexidas em rajada num POST só: arrastar um seletor de cor
  // dispara dezenas de eventos por segundo.
  clearTimeout(pendente);
  pendente = setTimeout(async () => {
    const corpo = {};
    corpo[secao] = painel[secao];
    await fetch('/ajustes', {method:'POST', headers:{'Content-Type':'application/json'},
                             body: JSON.stringify(corpo)});
    const s = document.getElementById('salvo');
    s.classList.add('ver');
    setTimeout(() => s.classList.remove('ver'), 1100);
  }, 250);
}

function desenharFontes() {
  const alvo = document.getElementById('fontes');
  alvo.innerHTML = '';
  FONTES.forEach(([id, tipo, nome, dica]) => {
    const inp = document.createElement('input');
    if (tipo === 'numero') {
      inp.type = 'number'; inp.min = 5; inp.value = fontes[id];
      inp.onchange = () => salvarFonte(id, Math.max(5, +inp.value || 60));
      alvo.appendChild(linha(nome, dica, inp));
    } else {
      inp.type = 'text'; inp.value = fontes[id] || ''; inp.placeholder = dica;
      inp.onchange = () => salvarFonte(id, inp.value.trim());
      alvo.appendChild(empilhado(nome, dica, inp));
    }
  });
}

// As fontes ficam no topo do config, fora da seção do painel — por isso vão
// num pacote próprio. Trocar a cidade não exige reiniciar nada: o laço do
// clima relê o config a cada volta e refaz a geocodificação.
function salvarFonte(chave, valor) {
  fontes[chave] = valor;
  clearTimeout(pendente);
  pendente = setTimeout(async () => {
    const r = await fetch('/ajustes', {method:'POST',
      headers:{'Content-Type':'application/json'},
      body: JSON.stringify({fontes: {[chave]: valor}})});
    const d = await r.json();
    if (d.fontes) fontes = d.fontes;
    const s = document.getElementById('salvo');
    s.classList.add('ver'); setTimeout(() => s.classList.remove('ver'), 1100);
    setTimeout(verDiag, 800);
  }, 400);
}

/* -------------------------------------------------------------- desenho */
function chave(ligado, aoMudar) {
  const l = document.createElement('label');
  l.className = 'chave';
  l.innerHTML = '<input type="checkbox"' + (ligado ? ' checked' : '') + '><i></i>';
  l.querySelector('input').onchange = e => aoMudar(e.target.checked);
  return l;
}

function linha(titulo, dica, controle) {
  const d = document.createElement('div');
  d.className = 'linha';
  d.innerHTML = '<label>' + titulo + '<span class="dica">' + dica + '</span></label>';
  d.appendChild(controle);
  return d;
}

function desenharCartoes() {
  const alvo = document.getElementById('cartoes');
  alvo.innerHTML = '';
  CARTOES.forEach(([id, nome, dica]) => {
    const ligado = painel.cartoes[id] !== false;
    alvo.appendChild(linha(nome, dica, chave(ligado, v => salvar('cartoes', id, v))));
  });
}

function desenharOrdem() {
  const alvo = document.getElementById('ordem');
  alvo.innerHTML = '';
  const ordem = painel.ordem || CARTOES.map(c => c[0]);
  ordem.forEach((id, i) => {
    const nome = (CARTOES.find(c => c[0] === id) || [id, id])[1];
    const li = document.createElement('li');
    li.innerHTML = '<span class="nome">' + nome + '</span>';
    const sobe = document.createElement('button'); sobe.textContent = '↑';
    const desce = document.createElement('button'); desce.textContent = '↓';
    sobe.disabled = i === 0; desce.disabled = i === ordem.length - 1;
    sobe.onclick = () => mover(i, -1); desce.onclick = () => mover(i, +1);
    li.append(sobe, desce);
    alvo.appendChild(li);
  });
}

function mover(i, passo) {
  const o = (painel.ordem || CARTOES.map(c => c[0])).slice();
  const j = i + passo;
  [o[i], o[j]] = [o[j], o[i]];
  salvar('ordem', null, o);
  painel.ordem = o;
  desenharOrdem();
}

function desenharTempos() {
  const alvo = document.getElementById('tempos');
  alvo.innerHTML = '';
  TEMPOS.forEach(([id, nome, unidade, dica]) => {
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = 1; inp.value = painel.tempos[id];
    inp.onchange = () => salvar('tempos', id, Math.max(1, +inp.value || 1));
    alvo.appendChild(linha(nome + ' (' + unidade + ')', dica, inp));
  });
}

function desenharCores() {
  const alvo = document.getElementById('cores');
  alvo.innerHTML = '';
  CORES.forEach(([id, nome]) => {
    const d = document.createElement('div');
    d.className = 'cor';
    const inp = document.createElement('input');
    inp.type = 'color'; inp.value = painel.cores[id] || PADRAO_CORES[id];
    inp.oninput = () => salvar('cores', id, inp.value);
    d.append(inp, Object.assign(document.createElement('span'), {textContent: nome}));
    alvo.appendChild(d);
  });
}

function resetCores() {
  painel.cores = Object.assign({}, PADRAO_CORES);
  salvar('cores', null, painel.cores);
  desenharCores();
}

// Campo de texto largo não cabe ao lado do rótulo: aqui o rótulo vai em cima.
function empilhado(titulo, dica, controle) {
  const d = document.createElement('div');
  d.className = 'empilha';
  d.innerHTML = '<label>' + titulo + '<span class="dica">' + dica + '</span></label>';
  d.appendChild(controle);
  return d;
}

function desenharRecado() {
  const alvo = document.getElementById('recado');
  alvo.innerHTML = '';
  const t = document.createElement('input');
  t.type = 'text'; t.placeholder = 'Título (ex.: LEMBRETE)';
  t.value = (painel.recado || {}).titulo || '';
  t.onchange = () => salvar('recado', 'titulo', t.value);
  const c = document.createElement('input');
  c.type = 'text'; c.placeholder = 'O que aparece no tablet';
  c.value = (painel.recado || {}).texto || '';
  c.onchange = () => salvar('recado', 'texto', c.value);
  alvo.append(empilhado('Título', 'o cabeçalho do cartão', t),
              empilhado('Texto', 'ligue o cartão "Recado" acima', c));
}

/* ---------------------------------------------------------- diagnóstico */
async function verDiag() {
  const r = await fetch('/diagnostico');
  const d = await r.json();
  const alvo = document.getElementById('diag');
  alvo.innerHTML = d.itens.map(i =>
    '<div class="diag"><span class="bola ' + i.estado + '"></span>' +
    '<span class="nome">' + i.nome + '</span>' +
    '<span class="txt">' + i.texto + '</span>' +
    '<span class="quando">' + (i.idade == null ? '' : idade(i.idade)) + '</span></div>'
  ).join('');
}

function idade(s) {
  if (s < 60) return Math.round(s) + 's';
  if (s < 3600) return Math.round(s / 60) + 'min';
  return Math.round(s / 3600) + 'h';
}

async function acao(nome) {
  await fetch('/acao?nome=' + nome, {method: 'POST',
              headers: {'Content-Type': 'application/json'}, body: '{}'});
  setTimeout(verDiag, 1500);
}

/* ------------------------------------------------------------- arranque */
async function iniciar() {
  const r = await fetch('/api/estado');
  const e = await r.json();
  painel = e.ajustes || {};
  painel.cartoes = painel.cartoes || {};
  painel.tempos = painel.tempos || {};
  painel.cores = painel.cores || {};
  const rf = await fetch('/ajustes', {method:'POST',
    headers:{'Content-Type':'application/json'}, body:'{}'});
  fontes = (await rf.json()).fontes || {};

  desenharFontes(); desenharCartoes(); desenharOrdem(); desenharTempos();
  desenharCores(); desenharRecado(); verDiag();
  setInterval(verDiag, 15000);
}
iniciar();
