/* Painel de controle — roda só no Mac.
 *
 * Cada mexida grava no config.json e viaja pelo SSE que já existe, então o
 * tablet aplica na hora, sem recarregar e sem ninguém tocar nele.
 */
'use strict';

// Os nove widgets. O antigo cartão "Claude Code e Git" virou três: o slider
// deixou de ser uma peça e passou a ser um arranjo possível entre elas.
const FONTES = [
  ['cidade',       'texto', 'Cidade do clima',    'ex.: Paulínia, SP'],
  ['cidade_auto',  'liga',  'Seguir onde eu estou',
   'detecta a cidade sozinho; o campo acima vira só a reserva'],
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

/* A tabela de temas NÃO mora mais aqui, nem a dos widgets.
 *
 * Ela morava, enquanto o controle era a única tela que trocava tema. Agora a
 * menu de configurações do tablet também troca, e duas cópias das mesmas oito
 * paletas em dois arquivos JS divergem na primeira vez que alguém acerta um
 * verde e esquece a outra. O dono passou a ser temas.py, no servidor; as duas
 * telas buscam de /temas.json e nenhuma tem opinião sobre o assunto.
 *
 * Pelo mesmo motivo saiu daqui a lista de widgets: o painel e o editor
 * precisam concordar sobre quanto espaço cada cartão pede, e o dono disso
 * passou a ser widgets.py, servido em /widgets.json.
 */
let PADRAO_CORES = {};
let TEMAS = [];

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
  ['agenda',     'Agenda',          '\u25F4'],
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
 * A tela são três partes: a barra principal — que fica no topo ou no rodapé,
 * quem decide é o tema — e os dois lados, onde moram os widgets.
 *
 * CADA LADO É UMA GRADE de 3 blocos de largura por 4 de altura: 12 blocos.
 * Internamente a largura conta em 6 UNIDADES (meio bloco cada), por um motivo
 * só: duas peças do mesmo tamanho mínimo dividem a linha ao meio, e metade de
 * 3 não é inteiro. Com 6, meio a meio é 3 + 3.
 *
 * O arranjo é uma lista de FAIXAS. Uma faixa tem altura em linhas e uma ou
 * duas células; as larguras somam 6. Duas células por faixa é o teto — com
 * três, cada cartão fica com um bloco e nenhum deles cabe o próprio conteúdo.
 *
 * Uma célula guarda uma LISTA de widgets. Um é um cartão; vários alternam no
 * mesmo espaço. Alternar não é enfeite: os quatro cartões grandes pedem 3x2
 * cada, dois enchem um lado, e a soma dos mínimos de tudo dá 34 blocos para
 * uma tela de 24.
 *
 * O CATÁLOGO vem do servidor (/widgets.json), não de uma lista aqui. É a mesma
 * decisão dos temas: o painel e o editor precisam dos mesmos mínimos, e duas
 * cópias divergem na primeira vez que um widget muda de tamanho.
 */
let CATALOGO = [];
let GRADE = { colunas: 3, unidades: 6, linhas: 4, por_faixa: 2 };

const LAYOUT_PADRAO = {
  esquerda: [
    { alt: 1, celulas: [{ ids: ['relogio'], larg: 6 }] },
    { alt: 1, celulas: [{ ids: ['clima'], larg: 2 }, { ids: ['recado'], larg: 4 }] },
    { alt: 2, celulas: [{ ids: ['claude', 'git-meus', 'git-design'], larg: 6 }] }
  ],
  direita: [
    { alt: 2, celulas: [{ ids: ['agenda'], larg: 6 }] },
    { alt: 1, celulas: [{ ids: ['mensagens'], larg: 6 }] },
    { alt: 1, celulas: [{ ids: ['monitor'], larg: 3 }, { ids: ['uso'], larg: 3 }] }
  ]
};

const LADOS = [['esquerda', 'Lado esquerdo'], ['direita', 'Lado direito']];

function nomeWidget(id) {
  const w = CATALOGO.find(x => x.id === id);
  return w ? w.nome : id;
}

/* O piso de um grupo é o maior mínimo entre os widgets que ele guarda: o
 * cartão é um só, e precisa caber o mais exigente da leva — senão o dia em
 * que aquele aparecer, o conteúdo vaza. */
function alterna(id) {
  const w = CATALOGO.find(x => x.id === id);
  return !!(w && w.alterna);
}

function minimoDe(ids) {
  let larg = 1, alt = 1;
  (ids || []).forEach(id => {
    const w = CATALOGO.find(x => x.id === id);
    if (w) { larg = Math.max(larg, w.min[0]); alt = Math.max(alt, w.min[1]); }
  });
  return [larg, alt];
}

// Blocos -> unidades. Meio bloco é a menor medida do editor.
const unid = (blocos) => blocos * 2;

function categoria(unidades, alt) {
  const blocos = unidades / 2;
  if (blocos >= 3 && alt > 2) return 'G';
  if (blocos >= 2 || alt >= 2) return 'M';
  return 'P';
}

function emBlocos(unidades) {
  const b = unidades / 2;
  return (b === Math.floor(b) ? b : Math.floor(b) + '½') + (b > 1 ? ' blocos' : ' bloco');
}

/* Como duas peças dividem os 6 da linha.
 *
 * Mesmo mínimo, metade para cada — foi a regra pedida, e é a única divisão
 * justa quando as duas querem a mesma coisa. Mínimos diferentes: a menor leva
 * o que precisa e a maior fica com o resto, porque apertar a maior é o que
 * quebra conteúdo. Se não cabem juntas, devolve null. */
function divisao(idsA, idsB) {
  const a = minimoDe(idsA)[0], b = minimoDe(idsB)[0];
  if (a + b > GRADE.colunas) return null;
  if (a === b) return [GRADE.unidades / 2, GRADE.unidades / 2];
  return a < b ? [unid(a), GRADE.unidades - unid(a)]
               : [GRADE.unidades - unid(b), unid(b)];
}

/* As divisões que o usuário pode escolher numa faixa de duas células. Só
 * entram as que respeitam os dois mínimos — uma opção que corta conteúdo não
 * é uma opção, é uma armadilha. */
function divisoesPossiveis(faixa) {
  const [a, b] = faixa.celulas;
  const mA = unid(minimoDe(a.ids)[0]), mB = unid(minimoDe(b.ids)[0]);
  return [[2, 4], [3, 3], [4, 2]].filter(([x, y]) => x >= mA && y >= mB);
}

function layoutAtual() {
  const l = painel.layout;
  const bom = l && ['esquerda', 'direita'].every(k =>
    Array.isArray(l[k]) && l[k].every(f => Array.isArray(f.celulas)));
  return bom ? JSON.parse(JSON.stringify(l))
             : JSON.parse(JSON.stringify(LAYOUT_PADRAO));
}

function linhasUsadas(lado) {
  return lado.reduce((t, f) => t + (f.alt || 1), 0);
}

/* O lugar único onde o arranjo volta a ser legal.
 *
 * Toda mudança passa por aqui em vez de cada botão cuidar das próprias
 * consequências — foi assim que a versão anterior deste editor acumulou casos
 * (item que ficou vazio, par que virou trio) espalhados por cinco lugares.
 */
function normalizar(l) {
  ['esquerda', 'direita'].forEach(nome => {
    let lado = (l[nome] || [])
      .map(f => ({
        alt: f.alt || 1,
        celulas: (f.celulas || []).filter(c => (c.ids || []).length).slice(0, GRADE.por_faixa)
      }))
      .filter(f => f.celulas.length);

    lado.forEach(f => {
      if (f.celulas.length === 1) {
        f.celulas[0].larg = GRADE.unidades;
      } else {
        const atual = f.celulas.map(c => c.larg);
        const ok = divisoesPossiveis(f).some(d => d[0] === atual[0] && d[1] === atual[1]);
        if (!ok) {
          const d = divisao(f.celulas[0].ids, f.celulas[1].ids);
          if (d) { f.celulas[0].larg = d[0]; f.celulas[1].larg = d[1]; }
          else {
            // Não cabem juntas: a segunda sai da faixa e vira faixa própria.
            const fora = f.celulas.pop();
            f.celulas[0].larg = GRADE.unidades;
            lado.splice(lado.indexOf(f) + 1, 0,
                        { alt: minimoDe(fora.ids)[1], celulas: [fora] });
          }
        }
      }
      // A altura nunca fica abaixo do mínimo da faixa, nem passa da grade.
      f.alt = Math.max(minimoDe([].concat.apply([], f.celulas.map(c => c.ids)))[1],
                       Math.min(GRADE.linhas, f.alt));
    });

    /* Estourou as quatro linhas: as últimas faixas saem. Cortar do começo
     * mudaria o que está no alto da tela, que é onde o olho vai primeiro —
     * quem acabou de arrastar algo para baixo não espera o topo mudar. */
    const cabe = [];
    let usado = 0;
    lado.forEach(f => {
      if (usado + f.alt <= GRADE.linhas) { cabe.push(f); usado += f.alt; }
    });
    l[nome] = cabe;
  });
  return l;
}

function retirar(l, id) {
  ['esquerda', 'direita'].forEach(nome => {
    (l[nome] || []).forEach(f => {
      f.celulas = (f.celulas || []).map(c => ({
        larg: c.larg, ids: (c.ids || []).filter(x => x !== id)
      }));
    });
  });
  return l;
}

function salvarLayout(l) {
  normalizar(l);
  painel.layout = l;
  // O liga/desliga continua existindo para o app.js, mas quem o define é a
  // presença no arranjo. Escrever os dois mantém uma verdade só.
  const dentro = {};
  ['esquerda', 'direita'].forEach(n =>
    l[n].forEach(f => f.celulas.forEach(c => c.ids.forEach(x => dentro[x] = 1))));
  painel.cartoes = painel.cartoes || {};
  CATALOGO.forEach(w => { painel.cartoes[w.id] = !!dentro[w.id]; });

  salvar('layout', null, l);
  salvar('cartoes', null, painel.cartoes);
  desenharArranjo();
}

/* O que o editor recusou da última vez, para dizer por quê. Mora fora das
 * funções porque o desenho acontece depois do gesto, e a razão precisa
 * sobreviver à volta. */
let avisoArranjo = null;

function mexer(id, destino) {
  avisoArranjo = null;
  const l = retirar(layoutAtual(), id);
  if (destino.tipo === 'fora') { salvarLayout(l); return; }

  const lado = l[destino.lado];

  if (destino.tipo === 'celula') {
    const c = lado[destino.f] && lado[destino.f].celulas[destino.c];
    // Juntar no mesmo cartão é revezar, e nem todo widget reveza: o relógio,
    // o clima, o recado, a agenda e as mensagens são nós de verdade no HTML,
    // e um nó não fica em dois lugares. Quem não reveza vira faixa própria
    // logo abaixo, em vez de sumir — arrastar tem que fazer alguma coisa.
    if (c && alterna(id) && c.ids.every(alterna)) {
      c.ids.push(id);
    } else {
      lado.splice(destino.f + 1, 0,
                  { alt: minimoDe([id])[1], celulas: [{ ids: [id], larg: GRADE.unidades }] });
    }
  } else if (destino.tipo === 'ao-lado') {
    const f = lado[destino.f];
    if (f && f.celulas.length < GRADE.por_faixa) f.celulas.push({ ids: [id], larg: 3 });
  } else if (destino.tipo === 'faixa') {
    lado.splice(Math.max(0, Math.min(destino.indice, lado.length)), 0,
                { alt: minimoDe([id])[1], celulas: [{ ids: [id], larg: GRADE.unidades }] });
  }

  /* RECUSA em vez de despejar.
   *
   * O normalizar corta as faixas que não cabem nas quatro linhas, e isso é
   * tecnicamente um arranjo válido e humanamente um desastre: você arrasta
   * uma coisa para o topo e some outra lá embaixo, sem relação aparente com o
   * que você fez.
   *
   * Então a conta é feita numa cópia primeiro. Se alguém sumiu, nada é
   * gravado e o editor diz quem não coube — inclusive quando quem não coube
   * foi o próprio widget que você arrastou. Um guarda só, no fim, em vez de
   * um por caminho: todos os caminhos passam por aqui. */
  const perdidos = idsDentro(layoutAtual())
    .concat([id])
    .filter((x, i, a) => a.indexOf(x) === i)
    .filter(x => idsDentro(normalizar(JSON.parse(JSON.stringify(l)))).indexOf(x) < 0);

  if (perdidos.length) {
    /* A mensagem fala do GESTO, não da contabilidade. Quem arrastou quer
     * saber por que não deu — listar os três widgets que teriam sido
     * despejados conta a história pelo lado errado. */
    const outros = perdidos.filter(x => x !== id);
    avisoArranjo = { lado: destino.lado, texto:
      perdidos.indexOf(id) >= 0
        ? nomeWidget(id) + ' precisa de ' + minimoDe([id])[1] +
          (minimoDe([id])[1] > 1 ? ' linhas' : ' linha') +
          ', e as 4 deste lado já estão ocupadas'
        : 'não cabe aqui sem empurrar ' +
          (outros.length === 1 ? nomeWidget(outros[0]) : outros.length + ' widgets') +
          ' para fora da tela' };
    desenharArranjo();
    return;
  }
  salvarLayout(l);
}

function idsDentro(l) {
  const todos = [];
  ['esquerda', 'direita'].forEach(n =>
    (l[n] || []).forEach(f => (f.celulas || []).forEach(c => (c.ids || []).forEach(x => {
      if (todos.indexOf(x) < 0) todos.push(x);
    }))));
  return todos;
}

let arrastando = null;

function chipWidget(id) {
  const c = document.createElement('div');
  c.className = 'chip-w';
  c.draggable = true;
  c.textContent = nomeWidget(id);
  const m = minimoDe([id]);
  c.title = 'mínimo ' + m[0] + '×' + m[1];
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

function botao(texto, aoClicar, dica) {
  const b = document.createElement('button');
  b.textContent = texto;
  if (dica) b.title = dica;
  b.onclick = aoClicar;
  return b;
}

function desenharCelula(c, faixa, lado, iF, iC) {
  const cel = alvoSolta({ tipo: 'celula', lado: lado, f: iF, c: iC },
                        'celula' + (c.ids.every(alterna) ? '' : ' sem-reveza'));
  // A largura da célula no editor é a mesma proporção da tela: o editor é uma
  // maquete, não uma lista. Você escolhe olhando o formato.
  cel.style.flex = c.larg + ' 0 0';

  const chips = document.createElement('div');
  chips.className = 'chips';
  c.ids.forEach(id => chips.appendChild(chipWidget(id)));
  cel.appendChild(chips);

  const pe = document.createElement('div');
  pe.className = 'pe-celula';
  const etq = document.createElement('span');
  etq.className = 'tam';
  etq.textContent = categoria(c.larg, faixa.alt) + ' · ' + emBlocos(c.larg) +
                    ' × ' + faixa.alt + (faixa.alt > 1 ? ' linhas' : ' linha');
  pe.appendChild(etq);

  if (c.ids.length > 1) {
    const nota = document.createElement('span');
    nota.className = 'nota-celula';
    nota.textContent = 'alternando';
    pe.appendChild(nota);
    pe.appendChild(botao('separar', () => {
      const l = layoutAtual();
      const alvo = l[lado][iF].celulas[iC];
      const soltos = alvo.ids.slice(1);
      alvo.ids = [alvo.ids[0]];
      soltos.reverse().forEach(id => l[lado].splice(iF + 1, 0,
        { alt: minimoDe([id])[1], celulas: [{ ids: [id], larg: GRADE.unidades }] }));
      salvarLayout(l);
    }, 'cada widget vira um cartão próprio, em faixas novas'));
  }
  cel.appendChild(pe);
  return cel;
}

function desenharFaixa(f, lado, iF, livres) {
  const cx = document.createElement('div');
  cx.className = 'faixa';

  const corpo = document.createElement('div');
  corpo.className = 'faixa-corpo';
  f.celulas.forEach((c, iC) => corpo.appendChild(desenharCelula(c, f, lado, iF, iC)));

  /* A vaga ao lado só aparece quando alguma coisa cabe ali de verdade.
   *
   * Com uma célula de mínimo 3 (agenda, Claude, os dois do GitHub) a linha já
   * está tomada: qualquer companhia teria zero bloco. Oferecer a vaga nesse
   * caso seria prometer um encaixe que o normalizar desfaz no instante
   * seguinte — e um alvo que não cumpre é pior que alvo nenhum.
   */
  const sobra = GRADE.colunas - minimoDe([].concat.apply([], f.celulas.map(c => c.ids)))[0];
  if (f.celulas.length < GRADE.por_faixa && sobra >= 1) {
    const vaga = alvoSolta({ tipo: 'ao-lado', lado: lado, f: iF }, 'vaga');
    vaga.textContent = '+';
    vaga.title = 'arraste um widget para cá para dividir a linha';
    corpo.appendChild(vaga);
  }
  cx.appendChild(corpo);

  const pe = document.createElement('div');
  pe.className = 'pe-faixa';

  const minAlt = minimoDe([].concat.apply([], f.celulas.map(c => c.ids)))[1];
  const alt = document.createElement('span');
  alt.className = 'altura';
  alt.textContent = 'altura ' + f.alt;
  pe.appendChild(alt);
  pe.appendChild(botao('−', () => {
    const l = layoutAtual(); l[lado][iF].alt = f.alt - 1; salvarLayout(l);
  }, 'uma linha a menos')).disabled = f.alt <= minAlt;
  pe.appendChild(botao('+', () => {
    const l = layoutAtual(); l[lado][iF].alt = f.alt + 1; salvarLayout(l);
  }, 'uma linha a mais')).disabled = livres < 1;

  // As divisões possíveis, quando há duas células. Só as que respeitam os
  // dois mínimos aparecem.
  if (f.celulas.length === 2) {
    divisoesPossiveis(f).forEach(d => {
      const atual = d[0] === f.celulas[0].larg && d[1] === f.celulas[1].larg;
      const b = botao(emBlocos(d[0]).replace(/ .*/, '') + '+' + emBlocos(d[1]).replace(/ .*/, ''),
        () => {
          const l = layoutAtual();
          l[lado][iF].celulas[0].larg = d[0];
          l[lado][iF].celulas[1].larg = d[1];
          salvarLayout(l);
        }, 'larguras ' + emBlocos(d[0]) + ' e ' + emBlocos(d[1]));
      b.className = 'divisao' + (atual ? ' ativo' : '');
      pe.appendChild(b);
    });
  }
  cx.appendChild(pe);
  return cx;
}

function desenharArranjo() {
  const alvo = document.getElementById('cartoes');
  alvo.innerHTML = '';
  const l = layoutAtual();

  const grade = document.createElement('div');
  grade.className = 'colunas-editor';

  LADOS.forEach(([nome, titulo]) => {
    const caixa = document.createElement('div');
    caixa.className = 'col-editor';
    const usadas = linhasUsadas(l[nome]);
    const livres = GRADE.linhas - usadas;

    const topo = document.createElement('div');
    topo.className = 'topo-lado';
    topo.innerHTML = '<span class="titulo-col">' + titulo + '</span>' +
      '<span class="linhas-livres">' + usadas + ' de ' + GRADE.linhas + ' linhas' +
      (livres ? ' · ' + livres + ' livre' + (livres > 1 ? 's' : '') : ' · cheio') +
      '</span>';
    caixa.appendChild(topo);

    if (avisoArranjo && avisoArranjo.lado === nome) {
      const av = document.createElement('div');
      av.className = 'aviso-arranjo';
      av.textContent = avisoArranjo.texto;
      caixa.appendChild(av);
    }

    l[nome].forEach((f, i) => {
      caixa.appendChild(alvoSolta({ tipo: 'faixa', lado: nome, indice: i }, 'fenda'));
      caixa.appendChild(desenharFaixa(f, nome, i, livres));
    });
    const fim = alvoSolta({ tipo: 'faixa', lado: nome, indice: l[nome].length },
                          'fenda fenda-fim');
    if (!livres) fim.classList.add('sem-espaco');
    caixa.appendChild(fim);
    grade.appendChild(caixa);
  });
  alvo.appendChild(grade);

  // Bandeja do que está fora: arrastar para cá desliga, arrastar de volta liga.
  const dentro = {};
  ['esquerda', 'direita'].forEach(n =>
    l[n].forEach(f => f.celulas.forEach(c => c.ids.forEach(x => dentro[x] = 1))));
  const fora = CATALOGO.map(w => w.id).filter(id => !dentro[id]);

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
  acoes.appendChild(botao('Voltar ao arranjo padrão',
    () => salvarLayout(JSON.parse(JSON.stringify(LAYOUT_PADRAO)))));
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

    if (tipo === 'liga') {
      const [, , nome, dica] = def;
      const campo = document.createElement('div');
      campo.className = 'campo';
      campo.innerHTML = '<label><b>' + nome + '</b><span>' + dica + '</span></label>';

      const bt = document.createElement('button');
      const ligado = !!fontes[id];
      bt.className = 'interruptor' + (ligado ? ' ativo' : '');
      bt.textContent = ligado ? 'ligado' : 'desligado';
      bt.onclick = () => {
        enviar({fontes: {[id]: !fontes[id]}});
        fontes[id] = !fontes[id];
        desenharFontes();
      };
      campo.appendChild(bt);

      /* O aviso do IP fica junto do interruptor, não numa nota de rodapé:
         é a única coisa do painel que fala de você com um terceiro, e a hora
         de dizer isso é no momento de ligar. */
      const nota = document.createElement('p');
      nota.className = 'sobre';
      nota.textContent = ligado
        ? 'O servidor pergunta a um serviço externo em que cidade este IP está. '
          + 'É a única coisa aqui que sai da sua rede. A extensão, se você der '
          + 'permissão de localização a ela, manda coordenadas melhores e o IP '
          + 'deixa de ser usado para isso.'
        : 'Desligado, o painel usa só a cidade que você escreveu acima, e nada '
          + 'sobre você sai da rede local.';
      campo.appendChild(nota);
      alvo.appendChild(campo);
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
  TEMAS.forEach(({nome, slug, cor, cores}) => {
    const b = document.createElement('button');
    b.className = 'tema tema-cor';
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
  const nomeTema = (TEMAS.find(t => t.slug === tema) || {nome: 'este tema'}).nome;
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

/* ---------------------------------------------------------------- agenda */
/* Até onde o painel olha para a frente.
 *
 * Quatro opções e não um número livre: 1 dia deixa a tela cheia com uma
 * coluna só, 30 deixa trinta colunas de 3vw. As três contagens cobrem o uso
 * real, e a quarta é outra pergunta — "como está a semana?", que inclui o que
 * já passou.
 */
const JANELAS_AGENDA = [
  [3,        'Próximos 3 dias',  'hoje e mais dois'],
  [5,        'Próximos 5 dias',  'a semana útil pela frente'],
  [7,        'Próximos 7 dias',  'o padrão'],
  ['semana', 'Semana atual',     'domingo a sábado; os dias que já passaram aparecem apagados'],
];

function desenharAgendaOpc() {
  const alvo = document.getElementById('agenda-opc');
  alvo.innerHTML = '';

  const campo = document.createElement('div');
  campo.className = 'campo';
  campo.innerHTML = '<label><b>Dias listados</b>' +
                    '<span>quantas colunas a tela cheia mostra, e até onde o cartão lista</span></label>';

  const linha = document.createElement('div');
  linha.className = 'temas';
  const atual = (painel.agenda || {}).dias || 7;

  JANELAS_AGENDA.forEach(([id, nome, dica]) => {
    const b = document.createElement('button');
    b.className = 'tema' + (atual === id ? ' ativo' : '');
    b.title = dica;
    b.textContent = nome;
    b.onclick = () => { salvar('agenda', 'dias', id); desenharAgendaOpc(); };
    linha.appendChild(b);
  });

  campo.appendChild(linha);
  const nota = document.createElement('p');
  nota.className = 'sobre';
  nota.textContent = (JANELAS_AGENDA.find(j => j[0] === atual) || JANELAS_AGENDA[2])[2];
  campo.appendChild(nota);
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
  painel.agenda = painel.agenda || {};
  disponiveis.fundos = e.fundos || [];

  // O catálogo vem do servidor, não do disco do navegador: é ele que expande
  // o slug quando o tablet troca de tema, então é ele que tem a palavra.
  const cat = await (await fetch('/temas.json')).json();
  TEMAS = cat.temas || [];
  PADRAO_CORES = cat.padrao || {};

  // Os widgets e os mínimos deles também são do servidor, pelo mesmo motivo
  // dos temas: o painel e o editor têm que concordar sobre quanto espaço um
  // cartão precisa, e duas listas em dois arquivos JS divergem.
  const cg = await (await fetch('/widgets.json')).json();
  CATALOGO = cg.widgets || [];
  GRADE = cg.grade || GRADE;

  const d = await (await fetch('/ajustes', {method:'POST',
    headers:{'Content-Type':'application/json'}, body:'{}'})).json();
  fontes = d.fontes || {};

  desenharNav();
  desenharMarca(); desenharArranjo(); desenharFontes(); desenharRecado();
  desenharAgendaOpc();
  desenharFundos();
  desenharTempos(); desenharTemas(); desenharCores(); verDiag();
  setInterval(verDiag, 15000);
}
iniciar();
