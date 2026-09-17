/* Painel de controle — roda só no Mac.
 *
 * Cada mexida grava no config.json e viaja pelo SSE que já existe, então o
 * tablet aplica na hora, sem recarregar e sem ninguém tocar nele.
 */
'use strict';

const CARTOES = [
  ['clima',     'Clima',             'temperatura, previsão da semana no toque'],
  ['recado',    'Recado',            'o texto que você escrever abaixo'],
  ['claude',    'Claude Code e Git', 'sessões, seus PRs e os do repositório'],
  ['agenda',    'Agenda',            'compromissos de hoje e da semana'],
  ['mensagens', 'Mensagens',         'Gmail, Chat e WhatsApp pela extensão'],
  ['monitor',   'Monitor do Mac',    'CPU, memória e swap'],
];

const FONTES = [
  ['cidade',       'texto', 'Cidade do clima',    'ex.: Paulínia, SP'],
  ['repo_design',  'repo',  'Repositório vigiado','cole a URL do GitHub'],
  ['clima_intervalo_s',   'num', 'Buscar clima',   's', 'consulta o Open-Meteo'],
  ['agenda_intervalo_s',  'num', 'Buscar agenda',  's', 'lê o tablet por adb'],
  ['github_intervalo_s',  'num', 'Buscar GitHub',  's', 'três buscas por volta'],
  ['maquina_intervalo_s', 'num', 'Medir o Mac',    's', 'CPU, memória e swap'],
];

const TEMPOS = [
  ['slide',   'Troca de slide',        's',   'a cada quanto o cartão vira'],
  ['mascote', 'Troca de mascote',      's',   'alterna picareta e faíscas'],
  ['animado', 'Bichinho congela após', 's',   'depois vira o asterisco'],
  ['pronto',  'Concluído some após',   's',   'libera vaga pro que está rodando'],
  ['sono',    'Clawd dorme após',      's',   'sem nada acontecendo'],
  ['tela',    'Tela de detalhe volta', 's',   'depois do toque'],
  ['festa',   'Cena de conclusão',     's',   'o Clawd quando uma tarefa termina'],
  ['cenagit', 'Cena do GitHub',        's',   'PR novo, status ou CI'],
  ['bichos',  'Sessões no cartão',     'un.', 'o resto vai pro rodapé'],
  ['contas',  'Contas por slide',      'un.', 'no cartão de mensagens'],
];

const GRUPOS_COR = [
  ['SUPERFÍCIES', [['fundo','Fundo'],['cartao','Cartão'],['dentro','Interior'],
                   ['borda','Borda']]],
  ['TEXTO',       [['texto','Normal'],['apagado','Secundário'],['fraco','Apagado']]],
  ['ESTADOS',     [['ciano','Destaque'],['verde','Bom'],['laranja','Atenção'],
                   ['vermelho','Ruim'],['azul','Crachá']]],
];

const PADRAO_CORES = {fundo:'#000000',cartao:'#0c0d10',dentro:'#131620',borda:'#1d1f26',
  texto:'#ffffff',apagado:'#7c8089',fraco:'#4a4d55',ciano:'#22d3ee',azul:'#3b82f6',
  verde:'#22c55e',laranja:'#f59e0b',vermelho:'#ef4444'};

// Cada tema é só um conjunto dos 12 tokens. Nada no painel sabe que temas
// existem — ele recebe cores e obedece.
const TEMAS = [
  ['Escuro', 'escuro', {fundo:'#000000',cartao:'#0c0d10',dentro:'#131620',borda:'#1d1f26',
    texto:'#ffffff',apagado:'#7c8089',fraco:'#4a4d55',ciano:'#22d3ee',
    azul:'#3b82f6',verde:'#22c55e',laranja:'#f59e0b',vermelho:'#ef4444'}],

  ['Claro', 'claro', {fundo:'#eef1f5',cartao:'#ffffff',dentro:'#f6f8fa',borda:'#d8dee6',
    texto:'#14181d',apagado:'#59616c',fraco:'#98a1ac',ciano:'#0e7490',
    azul:'#2563eb',verde:'#15803d',laranja:'#b45309',vermelho:'#b91c1c'}],

  ['Apple', 'apple', {fundo:'#f5f5f7',cartao:'#ffffff',dentro:'#fbfbfd',borda:'#d2d2d7',
    texto:'#1d1d1f',apagado:'#6e6e73',fraco:'#a1a1a6',ciano:'#0071e3',
    azul:'#0071e3',verde:'#248a3d',laranja:'#c04c00',vermelho:'#d70015'}],

  // Orkut: o azul dos perfis e o rosa das comunidades, sobre fundo claro
  ['Orkut', 'orkut', {fundo:'#e6eef8',cartao:'#ffffff',dentro:'#f2f7fd',borda:'#b8cce4',
    texto:'#1c3d6b',apagado:'#4d76ab',fraco:'#8ba7ca',ciano:'#c0187a',
    azul:'#6699cc',verde:'#5c8a00',laranja:'#d98c00',vermelho:'#c00000'}],

  // Facebook clássico, o azul #3b5998 de antes do redesenho
  ['Facebook', 'facebook', {fundo:'#e9ebee',cartao:'#ffffff',dentro:'#f6f7f9',borda:'#dfe3ee',
    texto:'#1d2129',apagado:'#4b4f56',fraco:'#8d949e',ciano:'#3b5998',
    azul:'#4267b2',verde:'#2e9e1e',laranja:'#c98a00',vermelho:'#e02a34'}],

  // Windows XP Luna: o azul da barra de título sobre o bege das janelas
  ['Windows XP', 'xp', {fundo:'#3a6ea5',cartao:'#ece9d8',dentro:'#ffffff',borda:'#7f9db9',
    texto:'#0b0b0b',apagado:'#4a4a45',fraco:'#8a8a80',ciano:'#0054e3',
    azul:'#0054e3',verde:'#2f8a2f',laranja:'#d07b00',vermelho:'#c00000'}],

  // Windows 95: o cinza das janelas sobre o teal da área de trabalho
  ['Windows 95', 'win95', {fundo:'#008080',cartao:'#c0c0c0',dentro:'#dfdfdf',borda:'#808080',
    texto:'#000000',apagado:'#404040',fraco:'#6b6b6b',ciano:'#000080',
    azul:'#000080',verde:'#006400',laranja:'#806000',vermelho:'#800000'}],
];

let painel = null, fontes = {}, pendente = null;

/* -------------------------------------------------------------- gravação */
function piscarSalvo() {
  const s = document.getElementById('salvo');
  s.classList.add('ver');
  setTimeout(() => s.classList.remove('ver'), 1100);
}

// Junta as mexidas em rajada num POST só: arrastar um seletor de cor dispara
// dezenas de eventos por segundo.
function enviar(corpo, depois) {
  clearTimeout(pendente);
  pendente = setTimeout(async () => {
    const r = await fetch('/ajustes', {method:'POST',
      headers:{'Content-Type':'application/json'}, body: JSON.stringify(corpo)});
    const d = await r.json();
    if (d.fontes) fontes = d.fontes;
    piscarSalvo();
    if (depois) depois(d);
  }, 250);
}

function salvar(secao, chave, valor) {
  painel[secao] = painel[secao] || {};
  if (chave === null) painel[secao] = valor; else painel[secao][chave] = valor;
  const corpo = {}; corpo[secao] = painel[secao];
  enviar(corpo);
}

/* ------------------------------------------------------------- pedaços */
function chave(ligado, aoMudar) {
  const l = document.createElement('label');
  l.className = 'chave';
  l.innerHTML = '<input type="checkbox"' + (ligado ? ' checked' : '') + '><i></i>';
  l.querySelector('input').onchange = e => aoMudar(e.target.checked);
  return l;
}

function rotulo(titulo, dica) {
  const d = document.createElement('div');
  d.className = 'rot';
  d.innerHTML = '<b>' + titulo + '</b><span>' + dica + '</span>';
  return d;
}

function linha(...filhos) {
  const d = document.createElement('div');
  d.className = 'linha';
  filhos.forEach(f => d.appendChild(f));
  return d;
}

/* ------------------------------------- cartões e ordem, na mesma lista */
// Eram duas listas separadas, e são a mesma coisa: ligar e posicionar o mesmo
// cartão. Juntar tira metade da tela e some com o vaivém entre dois lugares.
function ordemAtual() {
  const salva = painel.ordem || [];
  return salva.concat(CARTOES.map(c => c[0]).filter(id => !salva.includes(id)));
}

function desenharCartoes() {
  const alvo = document.getElementById('cartoes');
  alvo.innerHTML = '';
  const ordem = ordemAtual();
  ordem.forEach((id, i) => {
    const def = CARTOES.find(c => c[0] === id);
    if (!def) return;
    const ligado = painel.cartoes[id] !== false;

    const mover = document.createElement('div');
    mover.className = 'mover';
    const sobe = document.createElement('button'); sobe.textContent = '↑';
    const desce = document.createElement('button'); desce.textContent = '↓';
    sobe.disabled = i === 0; desce.disabled = i === ordem.length - 1;
    sobe.onclick = () => mover_(i, -1); desce.onclick = () => mover_(i, +1);
    mover.append(sobe, desce);

    const l = linha(chave(ligado, v => { salvar('cartoes', id, v); desenharCartoes(); }),
                    rotulo(def[1], def[2]), mover);
    if (!ligado) l.classList.add('off');
    alvo.appendChild(l);
  });
}

function mover_(i, passo) {
  const o = ordemAtual();
  const j = i + passo;
  [o[i], o[j]] = [o[j], o[i]];
  painel.ordem = o;
  salvar('ordem', null, o);
  desenharCartoes();
}

/* --------------------------------------------------------------- fontes */
function desenharFontes() {
  const alvo = document.getElementById('fontes');
  alvo.innerHTML = '';
  FONTES.forEach(def => {
    const [id, tipo] = def;
    if (tipo === 'num') {
      const [, , nome, un, dica] = def;
      const inp = document.createElement('input');
      inp.type = 'number'; inp.min = 5; inp.value = fontes[id];
      inp.onchange = () => enviar({fontes: {[id]: Math.max(5, +inp.value || 60)}});
      const u = document.createElement('span'); u.className = 'unidade'; u.textContent = un;
      alvo.appendChild(linha(rotulo(nome, dica), inp, u));
      return;
    }

    const [, , nome, dica] = def;
    const campo = document.createElement('div');
    campo.className = 'campo';
    campo.innerHTML = '<label><b>' + nome + '</b><span>' + dica + '</span></label>';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = fontes[id] || ''; inp.placeholder = dica;
    campo.appendChild(inp);

    if (tipo === 'repo') {
      const aviso = document.createElement('div');
      aviso.className = 'aviso';
      campo.appendChild(aviso);
      inp.onchange = () => conferirRepo(inp, aviso);
      if (inp.value) conferirRepo(inp, aviso, true);
    } else {
      inp.onchange = () => enviar({fontes: {[id]: inp.value.trim()}});
    }
    alvo.appendChild(campo);
  });
}

// Só grava o repositório depois de confirmar que a sua conta consegue lê-lo.
// Gravar um repositório sem acesso deixaria o cartão vazio sem explicar por quê.
async function conferirRepo(inp, aviso, soConferir) {
  const url = inp.value.trim();
  if (!url) { aviso.className = 'aviso'; aviso.textContent = ''; return; }
  aviso.className = 'aviso indo'; aviso.textContent = 'conferindo…';

  const r = await fetch('/verificar-repo?url=' + encodeURIComponent(url));
  const d = await r.json();
  aviso.className = 'aviso ' + (d.ok ? 'ok' : 'ruim');
  aviso.textContent = (d.ok ? '✓ ' : '✗ ') + (d.repo || url) + ' — ' + d.motivo;

  if (d.ok && !soConferir) {
    inp.value = d.repo;                       // guarda no formato curto
    enviar({fontes: {repo_design: d.repo}});
  }
}

/* --------------------------------------------------------------- tempos */
function desenharTempos() {
  const alvo = document.getElementById('tempos');
  alvo.innerHTML = '';
  TEMPOS.forEach(([id, nome, un, dica]) => {
    const inp = document.createElement('input');
    inp.type = 'number'; inp.min = 1; inp.value = painel.tempos[id];
    inp.onchange = () => salvar('tempos', id, Math.max(1, +inp.value || 1));
    const u = document.createElement('span'); u.className = 'unidade'; u.textContent = un;
    alvo.appendChild(linha(rotulo(nome, dica), inp, u));
  });
}

/* ---------------------------------------------------------------- cores */
function desenharCores() {
  const alvo = document.getElementById('cores');
  alvo.innerHTML = '';
  GRUPOS_COR.forEach(([titulo, itens]) => {
    const g = document.createElement('div');
    g.className = 'grupo-cor';
    g.innerHTML = '<h3>' + titulo + '</h3>';
    const grade = document.createElement('div');
    grade.className = 'cores';
    itens.forEach(([id, nome]) => {
      const d = document.createElement('div');
      d.className = 'cor';
      const inp = document.createElement('input');
      inp.type = 'color'; inp.value = painel.cores[id] || PADRAO_CORES[id];
      inp.oninput = () => salvar('cores', id, inp.value);
      d.append(inp, Object.assign(document.createElement('span'), {textContent: nome}));
      grade.appendChild(d);
    });
    g.appendChild(grade);
    alvo.appendChild(g);
  });
}

function desenharTemas() {
  const alvo = document.getElementById('temas');
  alvo.innerHTML = '';
  TEMAS.forEach(([nome, slug, cores]) => {
    const b = document.createElement('button');
    b.className = 'tema';
    // Amostra com as cores que mais mudam a cara: fundo, cartão, destaque.
    b.innerHTML = '<span class="amostra">' +
      ['fundo','cartao','ciano','verde','laranja']
        .map(k => '<i style="background:' + cores[k] + '"></i>').join('') +
      '</span>' + nome;
    if ((painel.tema || 'escuro') === slug) b.classList.add('ativo');
    b.onclick = () => aplicarTema(slug, cores);
    alvo.appendChild(b);
  });
}

function aplicarTema(slug, cores) {
  // Um tema são duas coisas que viajam por caminhos diferentes: a paleta, que
  // vira variável no <html> do tablet, e a forma (canto, moldura, fonte,
  // traço do ícone), que é uma folha de estilo escolhida por data-tema. As
  // duas vão juntas daqui, mas depois podem ser mexidas em separado — dá para
  // ficar no Windows 95 e trocar só o verde.
  painel.cores = Object.assign({}, cores);
  painel.tema = slug;
  salvar('cores', null, painel.cores);
  salvar('tema', null, slug);
  desenharCores();
  desenharTemas();
}

function resetCores() {
  painel.cores = Object.assign({}, PADRAO_CORES);
  salvar('cores', null, painel.cores);
  desenharCores();
}

/* --------------------------------------------------------------- recado */
function desenharRecado() {
  const alvo = document.getElementById('recado');
  alvo.innerHTML = '';
  [['titulo', 'Título', 'o cabeçalho do cartão'],
   ['texto',  'Texto',  'o que aparece na tela']].forEach(([id, nome, dica]) => {
    const campo = document.createElement('div');
    campo.className = 'campo';
    campo.innerHTML = '<label><b>' + nome + '</b><span>' + dica + '</span></label>';
    const inp = document.createElement('input');
    inp.type = 'text'; inp.value = (painel.recado || {})[id] || '';
    inp.placeholder = dica;
    inp.onchange = () => salvar('recado', id, inp.value);
    campo.appendChild(inp);
    alvo.appendChild(campo);
  });
}

/* ---------------------------------------------------------- diagnóstico */
function idade(s) {
  if (s < 60) return Math.round(s) + 's';
  if (s < 3600) return Math.round(s / 60) + 'min';
  return Math.round(s / 3600) + 'h';
}

async function verDiag() {
  const d = await (await fetch('/diagnostico')).json();
  document.getElementById('diag').innerHTML = d.itens.map(i =>
    '<div class="diag"><span class="bola ' + i.estado + '"></span>' +
    '<span class="nome">' + i.nome + '</span>' +
    '<span class="txt">' + i.texto + '</span>' +
    '<span class="quando">' + (i.idade == null ? '' : idade(i.idade)) + '</span></div>'
  ).join('');
}

// O adb cai sozinho o tempo todo. Antes o botão piscava e nada acontecia;
// agora ele mostra cada passo — inclusive a reconexão e o motivo da falha.
async function recarregar() {
  const bt = document.getElementById('btRecarregar');
  const passos = document.getElementById('passos');
  bt.disabled = true;
  passos.className = '';
  passos.innerHTML = '<div>recarregando…</div>';

  try {
    const d = await (await fetch('/acao?nome=recarregar', {method:'POST',
      headers:{'Content-Type':'application/json'}, body:'{}'})).json();
    passos.className = d.ok ? 'ok' : 'ruim';
    passos.innerHTML = (d.passos || []).map(p => '<div>' + p + '</div>').join('');
  } catch (e) {
    passos.className = 'ruim';
    passos.innerHTML = '<div>o servidor não respondeu</div>';
  }
  bt.disabled = false;
  setTimeout(verDiag, 1200);
}

/* ------------------------------------------------------------- arranque */
async function iniciar() {
  const e = await (await fetch('/api/estado')).json();
  painel = e.ajustes || {};
  painel.cartoes = painel.cartoes || {};
  painel.tempos = painel.tempos || {};
  painel.cores = painel.cores || {};

  const d = await (await fetch('/ajustes', {method:'POST',
    headers:{'Content-Type':'application/json'}, body:'{}'})).json();
  fontes = d.fontes || {};

  desenharCartoes(); desenharFontes(); desenharRecado();
  desenharTempos(); desenharTemas(); desenharCores(); verDiag();
  setInterval(verDiag, 15000);
}
iniciar();
