/* Painel de controle — roda só no Mac.
 *
 * Cada mexida grava no config.json e viaja pelo SSE que já existe, então o
 * tablet aplica na hora, sem recarregar e sem ninguém tocar nele.
 */
'use strict';

// Os nove widgets. O antigo cartão "Claude Code e Git" virou três: o slider
// deixou de ser uma peça e passou a ser um arranjo possível entre elas.
const WIDGETS = [
  ['relogio',    'Relógio',            'hora, data e marcas do dia'],
  ['clima',      'Clima',              'temperatura; a semana no toque'],
  ['recado',     'Recado',             'o texto que você escrever'],
  ['claude',     'Claude Code',        'estado das sessões'],
  ['git-meus',   'Meus pull requests', 'os PRs que você abriu'],
  ['git-design', 'PRs do repositório', 'o repositório vigiado'],
  ['agenda',     'Agenda',             'compromissos de hoje e da semana'],
  ['mensagens',  'Mensagens',          'Gmail, Chat e WhatsApp pela extensão'],
  ['monitor',    'Monitor do Mac',     'CPU, memória e swap'],
];

// Espelha o LAYOUT_PADRAO do app.js. Duplicado de propósito: o painel de
// controle não carrega o app.js, e uma importação só para isto pagaria caro
// por uma constante.
const LAYOUT_PADRAO = {
  esquerda: [
    { tipo: 'solo',   ids: ['relogio'] },
    { tipo: 'par',    ids: ['clima', 'recado'] },
    { tipo: 'slider', ids: ['claude', 'git-meus', 'git-design'] }
  ],
  direita: [
    { tipo: 'solo',   ids: ['agenda'] },
    { tipo: 'par',    ids: ['mensagens', 'monitor'] }
  ]
};

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
  ['ocioso',  'Sessão parada some após','s',  'aberta, mas sem nada acontecendo'],
  ['sono',    'Clawd dorme após',      's',   'sem nada acontecendo'],
  ['tela',    'Tela de detalhe volta', 's',   'depois do toque'],
  ['festa',   'Cena de conclusão',     's',   'o Clawd quando uma tarefa termina'],
  ['cenagit', 'Cena do GitHub',        's',   'PR novo, status ou CI'],
  ['cenaagenda',   'Cena de compromisso', 's',   'quando a reunião vai começar'],
  ['antecedencia', 'Avisar com',          'min', 'de antecedência da reunião'],
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

  // Matrix: fósforo verde sobre preto. Duotone total — a gravidade vira
  // brilho, não matiz: "tudo bem" é o verde mais apagado da tela e "quebrado"
  // é quase branco, que é como um monitor monocromático sempre avisou.
  ['Matrix', 'matrix', {fundo:'#000000',cartao:'#020803',dentro:'#04140a',borda:'#0c4f22',
    texto:'#33ff66',apagado:'#1f9e45',fraco:'#0f5c28',ciano:'#39ff14',
    azul:'#00b34a',verde:'#148f3a',laranja:'#4dff7a',vermelho:'#b9ffcb'}],

  // Windows 95: o cinza das janelas sobre o teal da área de trabalho
  ['Windows 95', 'win95', {fundo:'#008080',cartao:'#c0c0c0',dentro:'#dfdfdf',borda:'#808080',
    texto:'#000000',apagado:'#404040',fraco:'#6b6b6b',ciano:'#000080',
    azul:'#000080',verde:'#006400',laranja:'#806000',vermelho:'#800000'}],
];

/* A cor que identifica cada tema, para a pílula no painel.
 *
 * É uma DECISÃO, não um campo da paleta: no Matrix e no Apple quem identifica
 * é o destaque, no Windows 95 e no XP é a área de trabalho (o teal e o azul
 * que todo mundo lembra), e no Orkut é o rosa das comunidades, que marca mais
 * que o azul do cabeçalho. Derivar isso de uma chave fixa acertaria em uns e
 * erraria justo nos que têm cara própria.
 */
const COR_DO_TEMA = {
  escuro:   '#22d3ee',
  claro:    '#2563eb',
  apple:    '#0071e3',
  orkut:    '#c0187a',
  facebook: '#3b5998',
  matrix:   '#39ff14',
  win95:    '#008080',
  xp:       '#245edb',
};

let painel = null, fontes = {}, pendente = null;

// O que o servidor encontrou no disco: papéis de parede, octocats. Não é
// configuração, é inventário — por isso vem do estado e não do painel.
let disponiveis = { fundos: [] };

// O que está esperando para ser enviado. Precisa ACUMULAR, e não ser
// substituído: duas gravações seguidas (o tema grava cores e slug) caíam no
// mesmo debounce, e a segunda cancelava a primeira. O tema chegava ao servidor
// sem as cores dele, sem erro nenhum para explicar.
let acumulado = {};

/* -------------------------------------------------------------- gravação */
function piscarSalvo() {
  const s = document.getElementById('salvo');
  s.classList.add('ver');
  setTimeout(() => s.classList.remove('ver'), 1100);
}

// Junta as mexidas em rajada num POST só: arrastar um seletor de cor dispara
// dezenas de eventos por segundo.
function enviar(corpo, depois) {
  // Junta as seções em vez de trocar. O debounce continua valendo para quem
  // digita num campo de texto, mas nenhuma seção se perde pelo caminho.
  Object.assign(acumulado, corpo);
  clearTimeout(pendente);
  pendente = setTimeout(async () => {
    const carga = acumulado;
    acumulado = {};
    const r = await fetch('/ajustes', {method:'POST',
      headers:{'Content-Type':'application/json'}, body: JSON.stringify(carga)});
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

/* Recarrega o painel de controle buscando tudo de novo do servidor.
 *
 * Endereço novo a cada vez, e não location.reload(): o reload relê do cache, e
 * esta página já ficou rodando código de horas antes enquanto o disco tinha a
 * versão nova. Um conserto de gravação chegou a parecer não ter funcionado por
 * causa disso.
 */
function atualizarPainel() {
  location.replace('/controle?r=' + Date.now());
}

/* ---------------------------------------------------------- navegação
 *
 * Sete seções empilhadas viravam uma rolagem longa: mexer numa cor exigia
 * passar por identidade, cartões, fontes, recado, papel de parede e ritmo. A
 * barra lateral mostra uma de cada vez.
 *
 * A escolha fica no localStorage porque "Atualizar painel" recarrega a página
 * inteira — sem isso, toda atualização jogava você de volta na primeira seção,
 * justamente quando você estava iterando numa.
 */
const SECOES = [
  ['estado',     'Estado',          '\u25C9'],
  ['identidade', 'Identidade',      '\u2318'],
  ['cartoes',    'O que aparece',   '\u25A6'],
  ['fontes',     'Fontes de dados', '\u21C4'],
  ['recado',     'Recado',          '\u270E'],
  ['fundo',      'Papel de parede', '\u25A3'],
  ['ritmo',      'Ritmo',           '\u23F1'],
  ['cores',      'Cores e temas',   '\u25D0'],
];

function secaoGuardada() {
  try { return localStorage.getItem('controle-secao') || 'estado'; }
  catch (e) { return 'estado'; }
}

function mostrarSecao(id) {
  document.querySelectorAll('main section').forEach(s => {
    s.hidden = s.getAttribute('data-sec') !== id;
  });
  document.querySelectorAll('#nav button').forEach(b => {
    b.classList.toggle('ativo', b.getAttribute('data-sec') === id);
  });
  try { localStorage.setItem('controle-secao', id); } catch (e) {}
}

function desenharNav() {
  const nav = document.getElementById('nav');
  nav.innerHTML = '';
  SECOES.forEach(([id, nome, ico]) => {
    const b = document.createElement('button');
    b.setAttribute('data-sec', id);
    b.innerHTML = '<span class="ico">' + ico + '</span>' + nome +
                  '<span class="aviso"></span>';
    b.onclick = () => mostrarSecao(id);
    nav.appendChild(b);
  });
  mostrarSecao(secaoGuardada());
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
/* ============================================================ arranjo
 *
 * Arrastar um widget para qualquer posição de qualquer coluna, e juntar
 * widgets num par (lado a lado) ou num slider (alternando no mesmo cartão).
 *
 * Um widget fora das colunas é um widget desligado — não existem duas
 * verdades. Antes havia um interruptor por cartão E uma ordem separada; com
 * posição livre isso viraria três lugares para dizer a mesma coisa.
 */
function layoutAtual() {
  const l = painel.layout;
  if (l && Array.isArray(l.esquerda) && Array.isArray(l.direita)) return l;
  return JSON.parse(JSON.stringify(LAYOUT_PADRAO));
}

function nomeWidget(id) {
  const d = WIDGETS.find(w => w[0] === id);
  return d ? d[1] : id;
}

// Tira o widget de onde estiver e deixa o layout íntegro: item que ficou vazio
// some, item que ficou com um só volta a ser solo, com três ou mais vira
// slider (dois lado a lado ainda cabem, três não).
function retirar(l, id) {
  ['esquerda', 'direita'].forEach(col => {
    l[col] = l[col].map(it => ({
      tipo: it.tipo,
      ids: (it.ids || []).filter(x => x !== id)
    })).filter(it => it.ids.length);
    l[col].forEach(it => {
      if (it.ids.length === 1) it.tipo = 'solo';
      else if (it.ids.length > 2 && it.tipo !== 'slider') it.tipo = 'slider';
    });
  });
}

function salvarLayout(l) {
  painel.layout = l;
  // O liga/desliga continua existindo para o app.js, mas quem o define agora é
  // a presença no layout. Escrever os dois mantém uma verdade só.
  const dentro = {};
  ['esquerda', 'direita'].forEach(c => l[c].forEach(it => it.ids.forEach(x => dentro[x] = 1)));
  painel.cartoes = painel.cartoes || {};
  WIDGETS.forEach(([id]) => { painel.cartoes[id] = !!dentro[id]; });

  salvar('layout', null, l);
  salvar('cartoes', null, painel.cartoes);
  desenharArranjo();
}

function mexer(id, destino) {
  const l = layoutAtual();
  retirar(l, id);
  if (destino.tipo === 'fora') { salvarLayout(l); return; }

  const col = l[destino.coluna];
  if (destino.tipo === 'junta') {
    const it = col[destino.indice];
    if (!it) return;
    it.ids.push(id);
    if (it.ids.length === 2 && it.tipo === 'solo') it.tipo = 'par';
    if (it.ids.length > 2) it.tipo = 'slider';
  } else {
    col.splice(Math.max(0, Math.min(destino.indice, col.length)), 0,
               { tipo: 'solo', ids: [id] });
  }
  salvarLayout(l);
}

let arrastando = null;

function chipWidget(id) {
  const c = document.createElement('div');
  c.className = 'chip-w';
  c.draggable = true;
  c.textContent = nomeWidget(id);
  c.ondragstart = (e) => {
    arrastando = id;
    c.classList.add('levando');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', id);
  };
  c.ondragend = () => { arrastando = null; c.classList.remove('levando'); };
  return c;
}

function alvoSolta(destino, classe) {
  const z = document.createElement('div');
  z.className = classe;
  z.ondragover = (e) => { e.preventDefault(); z.classList.add('sobre'); };
  z.ondragleave = () => z.classList.remove('sobre');
  z.ondrop = (e) => {
    e.preventDefault(); e.stopPropagation();
    z.classList.remove('sobre');
    if (arrastando) mexer(arrastando, destino);
  };
  return z;
}

function blocoItem(it, coluna, i) {
  const b = alvoSolta({ tipo: 'junta', coluna: coluna, indice: i }, 'bloco');
  const chips = document.createElement('div');
  chips.className = 'chips' + (it.tipo === 'par' ? ' lado-a-lado' : '');
  it.ids.forEach(id => chips.appendChild(chipWidget(id)));
  b.appendChild(chips);

  if (it.ids.length > 1) {
    const pe = document.createElement('div');
    pe.className = 'pe-bloco';
    const nome = document.createElement('span');
    nome.textContent = it.tipo === 'par' ? 'lado a lado' : 'alternando no mesmo cartão';
    pe.appendChild(nome);

    // Dois widgets cabem lado a lado; três não — por isso a troca só aparece
    // no par. Com três, alternar é a única forma que cabe.
    if (it.ids.length === 2) {
      const troca = document.createElement('button');
      troca.textContent = it.tipo === 'par' ? 'alternar' : 'lado a lado';
      troca.onclick = () => {
        const l = layoutAtual();
        const alvo = l[coluna][i];
        alvo.tipo = alvo.tipo === 'par' ? 'slider' : 'par';
        salvarLayout(l);
      };
      pe.appendChild(troca);
    }

    const sep = document.createElement('button');
    sep.textContent = 'separar';
    sep.onclick = () => {
      const l = layoutAtual();
      const alvo = l[coluna][i];
      const soltos = alvo.ids.map(x => ({ tipo: 'solo', ids: [x] }));
      l[coluna].splice(i, 1, ...soltos);
      salvarLayout(l);
    };
    pe.appendChild(sep);
    b.appendChild(pe);
  }
  return b;
}

function desenharArranjo() {
  const alvo = document.getElementById('cartoes');
  alvo.innerHTML = '';
  const l = layoutAtual();

  const grade = document.createElement('div');
  grade.className = 'colunas-editor';

  [['esquerda', 'Coluna esquerda'], ['direita', 'Coluna direita']].forEach(([col, titulo]) => {
    const caixa = document.createElement('div');
    caixa.className = 'col-editor';
    caixa.innerHTML = '<div class="titulo-col">' + titulo + '</div>';
    l[col].forEach((it, i) => {
      caixa.appendChild(alvoSolta({ tipo: 'pos', coluna: col, indice: i }, 'fenda'));
      caixa.appendChild(blocoItem(it, col, i));
    });
    caixa.appendChild(alvoSolta({ tipo: 'pos', coluna: col, indice: l[col].length },
                                'fenda fenda-fim'));
    grade.appendChild(caixa);
  });
  alvo.appendChild(grade);

  // Bandeja do que está fora: arrastar para cá desliga, arrastar de volta liga.
  const dentro = {};
  ['esquerda', 'direita'].forEach(c => l[c].forEach(it => it.ids.forEach(x => dentro[x] = 1)));
  const fora = WIDGETS.map(w => w[0]).filter(id => !dentro[id]);

  const bandeja = alvoSolta({ tipo: 'fora' }, 'bandeja');
  bandeja.innerHTML = '<div class="titulo-col">Fora da tela</div>';
  const chips = document.createElement('div');
  chips.className = 'chips';
  if (!fora.length) {
    const v = document.createElement('span');
    v.className = 'dica-vazia';
    v.textContent = 'Tudo está na tela. Arraste um widget para cá para desligá-lo.';
    chips.appendChild(v);
  } else {
    fora.forEach(id => chips.appendChild(chipWidget(id)));
  }
  bandeja.appendChild(chips);
  alvo.appendChild(bandeja);

  const acoes = document.createElement('div');
  acoes.className = 'acoes';
  const padrao = document.createElement('button');
  padrao.textContent = 'Voltar ao arranjo padrão';
  padrao.onclick = () => salvarLayout(JSON.parse(JSON.stringify(LAYOUT_PADRAO)));
  acoes.appendChild(padrao);
  alvo.appendChild(acoes);
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
    b.className = 'tema tema-cor';
    const cor = COR_DO_TEMA[slug] || cores.ciano;
    // A cor do tema pinta a própria pílula, em vez de virar cinco quadradinhos
    // que a gente precisa decodificar. A faixa da esquerda é a cor cheia; o
    // fundo é a mesma cor bem diluída, para a pílula inteira já dizer de qual
    // tema se trata antes de você ler o nome.
    b.style.setProperty('--cor-tema', cor);
    b.innerHTML = '<span class="amostra">' +
      ['fundo','cartao','ciano'].map(k =>
        '<i style="background:' + cores[k] + '"></i>').join('') +
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
  desenharFundos();   // cada tema tem o seu; trocar de tema troca a escolha
}

function resetCores() {
  painel.cores = Object.assign({}, PADRAO_CORES);
  salvar('cores', null, painel.cores);
  desenharCores();
}

/* --------------------------------------------------------------- recado */
// As mesmas cinco do app.js, com o texto que cada uma leva junto. Ficam
// duplicadas de propósito: aqui elas só pintam a amostra do botão, e o painel
// nunca precisa saber por que a combinação é aquela.
const CORES_RECADO = [
  ['',        'Padrão',  '',        'var(--texto)'],
  ['amarelo', 'Amarelo', '#fde68a', '#422006'],
  ['verde',   'Verde',   '#bbf7d0', '#052e16'],
  ['azul',    'Azul',    '#bfdbfe', '#0c2a4d'],
  ['rosa',    'Rosa',    '#fbcfe8', '#500724'],
  ['lilas',   'Lilás',   '#ddd6fe', '#2e1065'],
];

function desenharMarca() {
  const alvo = document.getElementById('marca');
  alvo.innerHTML = '';
  const campo = document.createElement('div');
  campo.className = 'campo';
  campo.innerHTML = '<label><b>Nome no topo</b>' +
                    '<span>o "OS" continua ao lado</span></label>';
  const inp = document.createElement('input');
  inp.type = 'text';
  inp.maxLength = 18;          // mais que isso empurra o relógio do tablet
  inp.value = painel.marca === undefined ? 'PIAIA' : painel.marca;
  inp.placeholder = 'PIAIA';
  // oninput e não onchange: onchange só dispara ao SAIR do campo, e ninguém
  // sai do campo para conferir — você digita e olha para o tablet. Parecia
  // quebrado sem estar. O debounce de 250ms do enviar() já segura a rajada.
  inp.oninput = () => salvar('marca', null, inp.value.trim());
  campo.appendChild(inp);
  alvo.appendChild(campo);
}

function desenharFundos() {
  const alvo = document.getElementById('fundos');
  alvo.innerHTML = '';
  const tema = painel.tema || 'escuro';
  const nomeTema = (TEMAS.find(t => t[1] === tema) || ['este tema'])[0];
  const lista = disponiveis.fundos || [];

  const campo = document.createElement('div');
  campo.className = 'campo';
  campo.innerHTML = '<label><b>Papel de parede</b><span>vale para o tema ' +
                    nomeTema + '; cada tema guarda o seu</span></label>';

  if (!lista.length) {
    const vazio = document.createElement('div');
    vazio.className = 'dica-vazia';
    vazio.textContent = 'Nenhuma imagem em web/fundos/. Solte arquivos ali e ' +
                        'eles aparecem aqui, sem reiniciar nada.';
    campo.appendChild(vazio);
    // sem `return`: mesmo sem nenhuma imagem, o botão de enviar precisa
    // existir — é justamente o caso em que ele serve.
  }

  const atual = (painel.fundos || {})[tema] || '';
  const linha = document.createElement('div');
  linha.className = 'temas';

  const escolher = (nome) => {
    const fundos = Object.assign({}, painel.fundos || {});
    if (nome) fundos[tema] = nome; else delete fundos[tema];
    salvar('fundos', null, fundos);
    desenharFundos();
  };

  const nenhum = document.createElement('button');
  nenhum.className = 'tema' + (atual ? '' : ' ativo');
  nenhum.textContent = 'Nenhum';
  nenhum.onclick = () => escolher('');
  linha.appendChild(nenhum);

  lista.forEach((nome) => {
    const b = document.createElement('button');
    b.className = 'tema' + (atual === nome ? ' ativo' : '');
    b.innerHTML = '<span class="mini-fundo" style="background-image:url(\'fundos/' +
                  encodeURIComponent(nome) + '\')"></span>' +
                  nome.replace(/\.[a-z]+$/i, '');
    b.onclick = () => escolher(nome);
    linha.appendChild(b);
  });

  campo.appendChild(linha);

  // Enviar um arquivo novo. O File vai cru no corpo do fetch, com o nome na
  // query — sem multipart, que do lado do servidor custaria um parser inteiro.
  const envio = document.createElement('div');
  envio.className = 'acoes';
  const arquivo = document.createElement('input');
  arquivo.type = 'file';
  arquivo.accept = 'image/png,image/jpeg,image/webp,image/gif';
  arquivo.style.display = 'none';
  arquivo.onchange = async () => {
    const f = arquivo.files && arquivo.files[0];
    if (!f) return;
    aviso.textContent = 'enviando ' + f.name + '…';
    try {
      const r = await fetch('/fundo?nome=' + encodeURIComponent(f.name),
                            {method: 'POST', body: f});
      const d = await r.json();
      if (!d.ok) throw new Error('recusado');
      disponiveis.fundos = d.fundos || [];
      aviso.textContent = d.reduzida
        ? d.nome + ' enviado (reduzido para caber no tablet)'
        : d.nome + ' enviado';
      desenharFundos();
    } catch (e) {
      aviso.textContent = 'não deu para enviar — formato ou tamanho recusado';
    }
    arquivo.value = '';
  };

  const bt = document.createElement('button');
  bt.textContent = 'Enviar imagem';
  bt.onclick = () => arquivo.click();

  const limpar = document.createElement('button');
  limpar.textContent = 'Limpar todos os temas';
  limpar.onclick = () => {
    painel.fundos = {};
    salvar('fundos', null, {});
    desenharFundos();
  };

  const aviso = document.createElement('span');
  aviso.className = 'aviso-envio';

  envio.append(arquivo, bt, limpar, aviso);
  campo.appendChild(envio);
  alvo.appendChild(campo);
}

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
    inp.oninput = () => salvar('recado', id, inp.value);   // ver desenharMarca
    campo.appendChild(inp);
    alvo.appendChild(campo);
  });

  // A cor do cartão. Cada amostra já mostra o texto na cor que vai valer, para
  // a escolha ser pelo resultado e não pelo nome.
  const campo = document.createElement('div');
  campo.className = 'campo';
  campo.innerHTML = '<label><b>Cor do cartão</b>' +
                    '<span>o texto acompanha</span></label>';
  const linha = document.createElement('div');
  linha.className = 'temas';
  const atual = (painel.recado || {}).cor || '';

  CORES_RECADO.forEach(([id, nome, fundo, texto]) => {
    const b = document.createElement('button');
    b.className = 'tema' + (atual === id ? ' ativo' : '');
    b.innerHTML = '<span class="amostra-recado" style="background:' +
                  (fundo || 'var(--alto)') + ';color:' + texto + '">Aa</span>' + nome;
    b.onclick = () => { salvar('recado', 'cor', id); desenharRecado(); };
    linha.appendChild(b);
  });

  campo.appendChild(linha);
  alvo.appendChild(campo);
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

  // Antes o diagnóstico ficava sempre à vista na lateral. Agora é uma seção
  // entre sete, e um adb caído passaria despercebido até alguém ir olhar — o
  // ponto no menu devolve o aviso que a barra dava de graça.
  const ruim = d.itens.some(i => i.estado === 'ruim' || i.estado === 'aviso');
  const bt = document.querySelector('#nav button[data-sec="estado"]');
  if (bt) bt.classList.toggle('tem-aviso', ruim);
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
  disponiveis.fundos = e.fundos || [];

  const d = await (await fetch('/ajustes', {method:'POST',
    headers:{'Content-Type':'application/json'}, body:'{}'})).json();
  fontes = d.fontes || {};

  desenharNav();
  desenharMarca(); desenharArranjo(); desenharFontes(); desenharRecado();
  desenharFundos();
  desenharTempos(); desenharTemas(); desenharCores(); verDiag();
  setInterval(verDiag, 15000);
}
iniciar();
