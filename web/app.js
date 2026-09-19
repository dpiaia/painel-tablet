/* Painel do tablet — cliente.
 *
 * Sem framework de propósito: isto fica aberto 24/7 num aparelho com 1,5 GB de
 * RAM e WebView 64. Uma página que troca innerHTML de pedaços pequenos roda
 * semanas; uma árvore de componentes vaza e trava em dois dias.
 *
 * Por isso também: ES5 no que importa (var, function), nada de arrow nem de
 * template string — o WebView 64 aguenta, mas não há ganho em arriscar.
 */
'use strict';

var estado = {};
var deslocamento = 0;      // relógio do Mac menos o do tablet, em ms
var ultimoSinal = 0;
var ultimoMinuto = -1;
var versaoWeb = '';
var LIMITE_SILENCIO = 40000;

var DIAS = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira',
            'quinta-feira', 'sexta-feira', 'sábado'];
var MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho',
             'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

function dois(n) { return n < 10 ? '0' + n : '' + n; }
function $(id) { return document.getElementById(id); }

function escapar(t) {
  return String(t).replace(/[&<>"]/g, function (c) {
    return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
  });
}

function agoraS() { return (Date.now() + deslocamento) / 1000; }

// Preto ou branco por cima da imagem, conforme o tema seja escuro ou claro.
// A conta é a luminância relativa do WCAG — a mesma que decide contraste de
// texto —, e não a média dos canais: verde pesa muito mais que azul no olho, e
// um fundo azul-escuro seria julgado claro pela média.
function veu(hex, tema) {
  // Temas de vidro pedem véu leve. O véu existe para o relógio e a barra, que
  // ficam FORA dos cartões, não sobrarem sobre a foto — mas com 60% de branco
  // a foto some, e sem foto não há vidro nenhum para ver. No Apple a barra tem
  // fundo próprio, então só o relógio precisa de ajuda: menos véu basta.
  var forte = (tema === 'apple') ? 0.34 : 0.62;
  var h = (hex || '').replace('#', '');
  if (h.length !== 6) return 'rgba(0,0,0,0.55)';
  var c = [0, 2, 4].map(function (i) {
    var x = parseInt(h.substr(i, 2), 16) / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  var lum = 0.2126 * c[0] + 0.7152 * c[1] + 0.0722 * c[2];
  return lum > 0.4 ? 'rgba(255,255,255,' + forte + ')'
                   : 'rgba(0,0,0,' + (forte - 0.04) + ')';
}
function hhmm(ts) {
  var d = new Date(ts * 1000);
  return dois(d.getHours()) + ':' + dois(d.getMinutes());
}

/* ================================================================ relógio */
function tique() {
  var d = new Date(Date.now() + deslocamento);
  var hora = dois(d.getHours()) + ':' + dois(d.getMinutes());
  // Hora e minuto em pedaços separados, como no relógio grande: os
  // dois-pontos piscam, e reescrever o elemento inteiro a cada minuto
  // reiniciaria a animação bem no momento em que o número muda.
  var hh = hora.slice(0, 2), mm = hora.slice(3);
  if ($('h-h').textContent !== hh) $('h-h').textContent = hh;
  if ($('h-m').textContent !== mm) $('h-m').textContent = mm;

  var dia = DIAS[d.getDay()];
  var dataTxt = dia.charAt(0).toUpperCase() + dia.slice(1) + ', ' +
                d.getDate() + ' de ' + MESES[d.getMonth()];
  $('data').textContent = dataTxt;

  if (modoHora) {
    // Só os números mudam; os dois-pontos ficam de pé para a animação de um
    // tema não recomeçar a cada minuto.
    var hh = hora.slice(0, 2), mm = hora.slice(3);
    if ($('hg-h').textContent !== hh) $('hg-h').textContent = hh;
    if ($('hg-m').textContent !== mm) $('hg-m').textContent = mm;
    $('data-grande').textContent = dataTxt;
  }

  // O aviso de compromisso depende do relógio andar, não de o servidor mandar
  // coisa nova — por isso mora aqui, no tique, e não em conferirCenas.
  conferirAgenda();
  proximaCena();

  var mudo = Date.now() - ultimoSinal > LIMITE_SILENCIO;
  var selo = $('selo');
  selo.className = mudo ? 'selo off' : 'selo';
  selo.lastChild.nodeValue = mudo ? 'SEM CONTATO' : 'ONLINE';

  // Redesenhar a agenda e as mensagens só quando o minuto vira. Elas mudam de
  // aparência por minuto, não por segundo, e reconstruir esse HTML 86.400
  // vezes por dia numa Mali-400 seria desperdício puro.
  if (telaAberta) {
    if (Date.now() > telaAte) fecharTela();
    return;                       // com a tela aberta o painel nem é tocado
  }
  sliderMsg.girar();
  hostsSlide.forEach(function (h) { h.slider.girar(); });
  desenharSlides();   // barato: só refaz o DOM quando a assinatura muda

  var minuto = Math.floor((Date.now() + deslocamento) / 60000);
  if (minuto !== ultimoMinuto) {
    ultimoMinuto = minuto;
    desenharAgenda();
    desenharMensagens();
  }
}

/* ================================================================ sistema */
var WIFI = '<svg viewBox="0 0 24 24" style="width:1.1vw;height:1.1vw;fill:none;' +
           'stroke:currentColor;stroke-width:2;stroke-linecap:round;vertical-align:-0.2vw">' +
           '<path d="M2 8a16 16 0 0 1 20 0M5 12a11 11 0 0 1 14 0M8.5 15.5a6 6 0 0 1 7 0"/>' +
           '<circle cx="12" cy="19" r="1"/></svg>';

function desenharSistema() {
  var s = estado.sistema;
  if (!s) { $('sist').innerHTML = ''; return; }
  var html = '';
  if (s.ssid) html += WIFI + ' <b>' + escapar(s.ssid) + '</b><span class="div">|</span>';
  if (s.bateria !== null && s.bateria !== undefined) {
    var baixa = s.bateria <= 20 && !s.carregando;
    html += 'BAT <b class="' + (baixa ? 'baixa' : '') + '">' + s.bateria + '%</b>';
    if (s.carregando) html += ' <b>&#9889;</b>';
  }
  $('sist').innerHTML = html;
}

/* ================================================================== clima */
var TEMPO = {
  sol:        '<circle cx="32" cy="32" r="11"/><path d="M32 7v6M32 51v6M7 32h6M51 32h6M14 14l4 4M46 46l4 4M50 14l-4 4M18 46l-4 4"/>',
  nuvem:      '<path d="M20 47h26a10 10 0 0 0 1-20 15 15 0 0 0-28-4 9 9 0 0 0 1 24z"/>',
  'sol-nuvem':'<circle cx="24" cy="21" r="7"/><path d="M24 47h22a9 9 0 0 0 0-18 13 13 0 0 0-24-3 8 8 0 0 0 2 21z"/>',
  chuva:      '<path d="M20 40h26a10 10 0 0 0 1-20 15 15 0 0 0-28-4 9 9 0 0 0 1 24z"/><path d="M22 47l-3 8M33 47l-3 8M44 47l-3 8"/>',
  neve:       '<path d="M20 40h26a10 10 0 0 0 1-20 15 15 0 0 0-28-4 9 9 0 0 0 1 24z"/><path d="M22 49v6M19 52h6M40 49v6M37 52h6"/>',
  tempestade: '<path d="M20 38h26a10 10 0 0 0 1-20 15 15 0 0 0-28-4 9 9 0 0 0 1 24z"/><path d="M33 42l-8 11h7l-3 9 10-12h-7z"/>',
  neblina:    '<path d="M14 26h36M10 36h44M16 46h32"/>'
};

function desenharClima() {
  var c = estado.clima;
  if (!c) { $('clima-esq').innerHTML = '<div class="vazio">sem clima</div>'; return; }

  $('clima-cidade').textContent = c.cidade.toUpperCase();
  $('clima-esq').innerHTML =
    '<svg class="tempo" viewBox="0 0 64 64"><g class="traco">' +
      (TEMPO[c.icone] || TEMPO.nuvem) + '</g></svg>' +
    '<div><div class="clima-temp">' + c.temp + '°</div>' +
    '<div class="clima-txt">' + escapar(c.texto) + '</div></div>';

  var chuva = (c.chuva === null || c.chuva === undefined) ? '—' : c.chuva + '%';
  // Cada par embrulhado: em coluna eles empilham, na faixa estreita viram três
  // blocos lado a lado. Um <span> solto não daria para posicionar nos dois.
  $('clima-dir').innerHTML =
    '<div><span class="rot">SENSAÇÃO</span><span class="val">' + c.sensacao + '°C</span></div>' +
    '<div><span class="rot">EXTREMAS</span><span class="val">' + c.min + '° · ' + c.max + '°</span></div>' +
    '<div><span class="rot">CHUVA</span><span class="val chuva">' + chuva + '</span></div>';
}

/* ================================================================= agenda */
// O mockup tinha etiquetas (TRABALHO, DOCS, SYNC), mas categoria é dado que a
// agenda do Google simplesmente não guarda — inventar seria enfeite mentiroso.
// A duração ocupa o mesmo espaço e é real: ajuda a decidir se cabe antes da
// próxima reunião.
function duracaoDe(e) {
  var min = Math.round((e.fim_ts - e.inicio_ts) / 60);
  if (min <= 0 || min >= 1440) return '';
  var txt = min < 60 ? min + ' MIN'
          : (min % 60 ? Math.floor(min / 60) + 'H' + dois(min % 60)
                      : min / 60 + 'H');
  return '<span class="etq dur">' + txt + '</span>';
}

// À noite, quando o dia já acabou, o que sobra na lista é de amanhã. Mostrar
// só "12:30" aí seria enganoso — o dia tem que vir junto.
function horaDe(e, classe) {
  var hoje = new Date(Date.now() + deslocamento); hoje.setHours(0, 0, 0, 0);
  var dia = new Date(e.inicio_ts * 1000); dia.setHours(0, 0, 0, 0);
  var distancia = Math.round((dia - hoje) / 86400000);

  var prefixo = '';
  if (distancia === 1) prefixo = 'amanhã ';
  else if (distancia > 1) prefixo = DIAS[dia.getDay()].slice(0, 3) + ' ';

  return '<span class="hora-ev ' + (classe || '') + '"><i></i>' +
         prefixo + hhmm(e.inicio_ts) + '</span>';
}

function marcarAgenda(curta) {
  document.querySelector('.agenda').className = 'cartao agenda toque' + (curta ? ' sozinho' : '');

  // O canto conta o que ainda vem HOJE — não o total da semana. Num cartão de
  // relance, "3" querendo dizer "três nos próximos sete dias" seria pior que
  // nada: você olharia e se prepararia para um dia que não é esse.
  var canto = $('agenda-canto');
  if (canto) {
    var fim = new Date(Date.now() + deslocamento);
    fim.setHours(23, 59, 59, 999);
    var restam = (((estado.agenda || {}).itens) || []).filter(function (i) {
      return !i.dia_inteiro && i.fim_ts > agoraS() && i.inicio_ts <= fim.getTime() / 1000;
    }).length;
    canto.textContent = restam ? restam + (restam === 1 ? ' HOJE' : ' HOJE') : '';
  }
}

function desenharAgenda() {
  var a = estado.agenda;
  if (!a) { $('destaque').innerHTML = '<div class="vazio">carregando…</div>'; return; }

  var agora = agoraS();
  var meiaNoite = new Date(Date.now() + deslocamento);
  meiaNoite.setHours(0, 0, 0, 0);
  var hojeISO = meiaNoite.getFullYear() + '-' + dois(meiaNoite.getMonth() + 1) +
                '-' + dois(meiaNoite.getDate());

  /* O cartão obedece à mesma janela da tela expandida. Sem isso a lista
   * mostrava tudo o que o coletor trouxe: escolher "próximos 3 dias" no
   * controle encolhia a tela cheia e deixava o cartão listando a semana
   * inteira — duas agendas com o mesmo nome. */
  var ate = janelaAgenda().apos;

  // Dia inteiro ("Casa", férias) vira etiqueta ao lado da data: continua
  // visível sem ocupar uma linha da agenda, que é espaço nobre.
  var marcas = '';
  var comHora = [];
  (a.itens || []).forEach(function (e) {
    if (e.dia_inteiro) {
      if (e.inicio <= hojeISO && hojeISO < e.fim) {
        marcas += '<span class="marca-dia">' + escapar(e.titulo) + '</span>';
      }
    } else if (e.fim_ts > agora && isoDe(new Date(e.inicio_ts * 1000)) < ate) {
      comHora.push(e);            // só o que ainda não acabou, e dentro da janela
    }
  });
  $('marcas').innerHTML = marcas;

  // O destaque é sobre HOJE. Quando o dia acaba, mostrar "amanhã 12:30" ali
  // em cima responde a pergunta errada: você quer saber se ainda tem algo
  // hoje, e a resposta é não. O que vem depois fica na lista, com o dia.
  var meiaNoiteAmanha = meiaNoite.getTime() / 1000 + 86400;
  var temHoje = comHora.length && comHora[0].inicio_ts < meiaNoiteAmanha;

  if (!temHoje) {
    var resto = comHora.slice(0, 6);
    marcarAgenda(resto.length === 0);
    $('destaque').innerHTML = '<div class="vazio">Sem reuniões hoje</div>';
    $('lista').innerHTML = resto.map(linhaAgenda).join('');
    return;
  }

  var p = comHora[0];
  var rolando = p.inicio_ts <= agora;
  $('destaque').innerHTML =
    '<div class="d-topo">' + horaDe(p, rolando ? 'rolando' : '') + duracaoDe(p) + '</div>' +
    '<div class="d-titulo">' + escapar(p.titulo) + '</div>';

  var resto = comHora.slice(1, 6);   // cabe mais agora que a lista é larga
  marcarAgenda(resto.length === 0);
  $('lista').innerHTML = resto.map(linhaAgenda).join('');
}

function linhaAgenda(e) {
  return '<div class="ev">' +
           '<div class="ev-esq">' + horaDe(e) + '</div>' +
           '<div class="ev-titulo">' + escapar(e.titulo) + '</div>' +
           duracaoDe(e) +
         '</div>';
}

/* ================================================================= claude */
// Cada estado, com seu bicho. A pílula carrega o significado; o GIF carrega o
// humor. Quando não há leitura, nenhum GIF: ficar animando sem saber nada
// seria o painel fingindo que está medindo.
// Arquivos nomeados pelo que MOSTRAM, não pelo estado que representam. Assim
// trocar qual bichinho vai em qual estado é mudar uma linha aqui embaixo, sem
// renomear arquivo nenhum — e dá para ver de relance o que já existe.
/* As cinco cores do cartão de recado.
 *
 * Cada uma traz o próprio texto, não só o fundo: amarelo claro com o cinza do
 * tema escuro seria ilegível, e o recado é justamente o cartão que existe para
 * ser lido de longe. O tom do texto é uma versão bem escura da mesma cor, que
 * combina com o fundo e ainda passa longe do limite de contraste.
 */
/* O que vem depois do nome, por tema.
 *
 * "OS" é o padrão; cada tema que tem uma marca própria troca por ela. Os
 * ícones são desenhados com `fill: currentColor`, então pegam sozinhos a cor
 * de destaque do tema — inclusive o verde do Matrix, sem nenhuma regra extra.
 *
 * Sobre a maçã: é uma maçã, não O logotipo. Sem a mordida e sem a proporção
 * do original, porque a marca da Apple é registrada e este repositório é
 * público sob MIT — desenhar o logotipo aqui seria distribuir marca alheia
 * sob uma licença que não é nossa para dar. Fruta lê igual e não é de ninguém.
 */
var ICONE = {
  // Curtida: polegar genérico. O logotipo do Facebook é o "f" azul, que não
  // está aqui; polegar para cima é gesto, não marca.
  curtir: '<path d="M2.5 10h3.2v9.5H2.5zM7.6 10l3.4-6.4c.6-1.1 2.3-.7 2.2.6L12.6 9h5.6c1 0 1.8.9 1.6 1.9l-1.3 6.2c-.2 1-1 1.6-2 1.6H7.6z"/>',
  // Orkut: confiável, legal e sexy. Carinha, cubo de gelo e coração.
  carinha: '<path d="M8 1.2a6.8 6.8 0 1 0 0 13.6A6.8 6.8 0 0 0 8 1.2zm-2.6 4.6a1 1 0 1 1 0 2 1 1 0 0 1 0-2zm5.2 0a1 1 0 1 1 0 2 1 1 0 0 1 0-2zM8 12.2c-1.9 0-3.4-1.1-3.9-2.6h7.8c-.5 1.5-2 2.6-3.9 2.6z"/>',
  gelo:    '<path d="M8 .9 14.2 4.5v7.1L8 15.2 1.8 11.6V4.5zM8 3 4 5.3v4.6L8 12.2l4-2.3V5.3z"/>',
  coracao: '<path d="M8 14.6 2.7 9.4C1 7.7 1.1 4.9 2.9 3.4c1.6-1.3 3.8-1 5.1.6 1.3-1.6 3.5-1.9 5.1-.6 1.8 1.5 1.9 4.3.2 6z"/>',
  // Maçã (fruta), não o logotipo. Ver o comentário acima.
  maca: '<path d="M12 6.6c1.3-1 3.1-1 4.4.1 1.8 1.5 2.1 4.3 1 7.1-.9 2.3-2.5 4.2-3.9 4.2-.9 0-1.4-.4-2-.4s-1.1.4-2 .4c-1.4 0-3-1.9-3.9-4.2-1.1-2.8-.8-5.6 1-7.1 1.3-1.1 3.1-1.1 4.4-.1z"/>' +
        '<path d="M12.3 6c-.1-1.9 1.3-3.5 3.2-3.7.2 1.9-1.3 3.5-3.2 3.7z"/>'
};

function svg(caixa, d, classe) {
  return '<svg class="sufixo' + (classe ? ' ' + classe : '') + '" viewBox="0 0 ' +
         caixa + ' ' + caixa + '">' + d + '</svg>';
}

var SUFIXO = {
  win95:    '95',
  xp:       'XP',
  facebook: svg(24, ICONE.curtir),
  apple:    'OS'      // a maçã saiu daqui: agora é o selo colorido na ponta
};

/* Alguns temas ganham um ícone de arquivo, de web/marcas/<slug>.png.
 *
 * A pasta é opcional e fica fora do git (ícone de terceiro). Quando o arquivo
 * existe, ele vence o sufixo desenhado; quando não existe, o painel cai no
 * texto sem reclamar. É a mesma regra dos octocats e dos papéis de parede:
 * o inventário vem do disco, não de uma lista no código.
 */
function sufixoDe(tema) {
  var arquivo = tema + '.png';
  if ((estado.marcas || []).indexOf(arquivo) >= 0) {
    return '<img class="sufixo" src="marcas/' + arquivo + '" alt="">';
  }
  return SUFIXO[tema] || 'OS';
}

var CORES_RECADO = {
  amarelo: { fundo: '#fde68a', borda: '#f0c74a', texto: '#422006', fraco: '#7c5312' },
  verde:   { fundo: '#bbf7d0', borda: '#7fd6a0', texto: '#052e16', fraco: '#16603a' },
  azul:    { fundo: '#bfdbfe', borda: '#89b8f5', texto: '#0c2a4d', fraco: '#1d4f86' },
  rosa:    { fundo: '#fbcfe8', borda: '#f0a3ce', texto: '#500724', fraco: '#8d1447' },
  lilas:   { fundo: '#ddd6fe', borda: '#b6a8f7', texto: '#2e1065', fraco: '#5b32b0' }
};

/* As mesmas cinco escolhas, traduzidas para o Matrix.
 *
 * Um post-it amarelo no meio de um monitor de fósforo quebra o tema inteiro —
 * é a única coisa na tela que não é verde. Mas as cinco opções precisam
 * continuar distinguíveis, senão a escolha vira enfeite.
 *
 * A saída é trocar o eixo: fora do Matrix quem diferencia é o MATIZ, aqui é a
 * TEXTURA. Cinco tramas diferentes sobre o mesmo verde — listra, liso,
 * diagonal para um lado, para o outro, e xadrez. É o que um terminal
 * monocromático sempre fez para separar áreas sem ter uma segunda cor.
 */
var CORES_RECADO_MATRIX = {
  amarelo: { fundo: '#123d1c', borda: '#2a7a3e', texto: '#5cff8a', fraco: '#2fbf5e' },
  verde:   { fundo: '#0a2c12', borda: '#1d6b30', texto: '#43ff74', fraco: '#26a44e' },
  azul:    { fundo: '#07261c', borda: '#18664a', texto: '#3dffb0', fraco: '#21a877' },
  rosa:    { fundo: '#15331c', borda: '#2f7a45', texto: '#66ff95', fraco: '#33b866' },
  lilas:   { fundo: '#0d2a22', borda: '#1f6b55', texto: '#4dffc4', fraco: '#26a882' }
};

var GIFS = {
  picareta:  'claude/picareta.gif',   // bichinho cavando com picareta
  fogos:     'claude/fogos.gif',      // bichinho em pé, fogos na cabeça
  faiscas:   'claude/faiscas.gif',    // bichinho parado, faíscas no focinho
  asterisco: 'claude/asterisco.gif',  // o asterisco do Claude girando
  acenando:  'claude/acenando.gif',   // bracinhos pra cima, acenando
  dormindo:  'claude/dormindo.svg'    // ícone do icons8, estático de propósito
};

// Valores padrão; o painel de controle sobrescreve pelo SSE, sem recarregar.
var T = {
  slide: 8,      // segundos por slide
  animado: 60,   // até o bichinho congelar
  pronto: 120,   // até a sessão concluída sair do cartão
  ocioso: 1800,  // até a sessão só ABERTA sair do cartão
  sono: 600,     // até o Clawd dormir
  mascote: 30,   // troca entre picareta e faíscas
  tela: 45,      // até a tela de detalhe voltar sozinha
  festa: 5,      // a cena de conclusão do Claude, em cima de tudo
  cenagit: 4,    // a cena de pull request
  cenaagenda: 8, // a cena de compromisso começando
  antecedencia: 3, // MINUTOS de aviso antes do compromisso
  bichos: 3,     // sessões visíveis no cartão
  contas: 3      // contas de e-mail por slide
};

var CLAUDE = {
  // Dois mascotes em ação, sorteados por sessão: um cava, o outro solta
  // faíscas. Sorteio ESTÁVEL (pelo nome da sessão), não a cada redesenho —
  // senão o bichinho trocaria de figura a cada segundo.
  //
  // `sempre`: atividade em curso não congela. Um "processando" parado seria
  // indistinguível de um que terminou há uma hora.
  trabalhando:  { txt: 'PROCESSANDO',     classe: 'trabalhando',
                  gifs: [GIFS.picareta, GIFS.faiscas], sempre: true, fio: true,
                  padrao: 'O Claude está trabalhando no que você pediu.' },
  // Bracinhos pra cima, acenando: é o único estado que exige ação sua, e
  // precisa chamar de longe. O asterisco girava sem chamar ninguém.
  //
  // `sempre` tira este estado do congelamento de 60 s. Os outros três você
  // olha e segue a vida; este espera uma ação, e parar de acenar enquanto a
  // espera continua seria desligar o alarme sem resolver nada.
  atencao:      { txt: 'PRECISA DE VOCÊ', classe: 'atencao',     gif: GIFS.acenando,
                  sempre: true,
                  padrao: 'Ele devolveu a vez e está esperando você.' },
  pronto:       { txt: 'CONCLUÍDO',       classe: 'pronto',      gif: GIFS.fogos,
                  padrao: 'Terminou a última tarefa.' },
  // O asterisco é a marca do "nada acontecendo": sessão aberta, sem tarefa.
  // As faíscas mostravam o bicho em ação, que é o oposto de parado.
  parado:       { txt: 'PARADO',          classe: '',            gif: GIFS.asterisco,
                  padrao: 'Nenhuma sessão rodando agora.' },
  desconhecido: { txt: 'SEM LEITURA',     classe: 'atencao',     gif: '',
                  padrao: 'Há sessão rodando que os hooks não enxergam.' },
  ausente:      { txt: 'EM BREVE',        classe: '',            gif: '',
                  padrao: 'O estado das sessões do Claude Code vai aparecer aqui.' },
  // Estático de propósito: é o estado que fica horas na tela (a madrugada
  // inteira), e um ícone parado custa zero. Animar o que ninguém está
  // olhando é o único gasto que não se justifica.
  dormindo:     { txt: 'DORMINDO',        classe: '',            gif: GIFS.dormindo,
                  sempre: true,
                  padrao: 'Nada acontecendo há mais de 10 minutos.' }
};

var assinaturaClaude = '';

// Ordem no cartão: o que espera você primeiro, depois o que está rodando, e
// por último o que acabou. Com três vagas, a ordem decide o que você vê.
var PESO = { atencao: 0, trabalhando: 1, pronto: 2, parado: 3, desconhecido: 4 };

// Uma sessão concluída merece aparecer — você quer ver que terminou — mas não
// merece ocupar vaga para sempre. Passados 2 minutos ela sai do cartão e fica
// só na tela cheia, liberando espaço para o que ainda está em execução.
/* Quais sessões merecem um lugar no cartão.
 *
 * Duas saem por idade, e por motivos diferentes.
 *
 * A CONCLUÍDA some depois de T.pronto para liberar espaço: já foi vista, já
 * teve a festa, e quem está rodando agora importa mais.
 *
 * A PARADA some depois de T.ocioso, e essa regra nasceu de um caso concreto: o
 * app do Claude Code retoma sessões sozinho ao restaurar a janela, e isso
 * dispara SessionStart. Aparecia no cartão um projeto de dois dias atrás, sem
 * ninguém ter tocado nele — verdade técnica ("existe uma sessão aberta"), mas
 * não uma notícia. `parado` é o estado mais fraco que existe aqui: significa
 * apenas que a sessão existe. Merece um lugar por meia hora, não para sempre.
 *
 * As outras duas não saem nunca por idade. `trabalhando` é atividade em curso,
 * e `atencao` espera uma ação sua — espera ignorada não vira espera resolvida.
 */
function relevantes(sessoes, agora) {
  return sessoes.filter(function (s) {
    if (s.estado === 'pronto') return (agora - s.em) <= T.pronto;
    if (s.estado === 'parado') return (agora - s.em) <= T.ocioso;
    return true;
  }).sort(function (a, b) {
    // `PESO[x] || 9` seria uma armadilha: o peso do 'atencao' é ZERO, e zero
    // é falsy — o estado mais urgente cairia para o fim da fila.
    var pa = PESO[a.estado], pb = PESO[b.estado];
    var d = (pa === undefined ? 9 : pa) - (pb === undefined ? 9 : pb);
    return d || b.em - a.em;
  });
}

// O GIF animado custa ~30% de um núcleo do tablet, e fica repetindo a mesma
// animação o dia inteiro sem nada acontecer. Passado o primeiro minuto de um
// estado, trocamos pelo primeiro quadro em PNG: o desenho continua lá, o
// consumo cai para zero. O movimento vira sinal de "isto mudou agora".

// Alterna entre os mascotes de ação, trocando a cada 30 s. A fase vem do nome
// da sessão, então duas sessões lado a lado não trocam juntas — senão o
// cartão inteiro piscaria ao mesmo tempo e pareceria um defeito.
//
// Sortear a cada redesenho estava fora de questão: trocaria de figura a cada
// segundo. E sortear só pelo nome dava empate em metade dos casos (são duas
// opções), deixando as duas sessões com o mesmo bichinho.
function sorteio(opcoes, chave) {
  // djb2, não soma de caracteres: com duas opções, o que decide é o bit
  // final, e uma soma simples dá a mesma paridade para nomes parecidos — as
  // duas sessões ficavam com o mesmo bichinho e trocavam em sincronia.
  var h = 5381;
  var t = String(chave || '');
  for (var i = 0; i < t.length; i++) h = ((h * 33) ^ t.charCodeAt(i)) >>> 0;
  var passo = Math.floor(agoraS() / T.mascote);
  return opcoes[(h + passo) % opcoes.length];
}

// Qual arquivo representa este estado para esta sessão — um só, ou sorteado
// entre os disponíveis.
function gifDe(m, sessao) {
  if (m.gifs) return sorteio(m.gifs, sessao && (sessao.rotulo || sessao.projeto));
  return m.gif || '';
}

// A versão parada, para as telas que mostram várias sessões de uma vez.
function estaticoDe(m, sessao) {
  var g = gifDe(m, sessao);
  return g ? g.replace('.gif', '.png') : '';
}

function arquivoDe(m, sessao) {
  var meu = gifDe(m, sessao);
  if (!meu) return '';
  m = { gif: meu, sempre: m.sempre };
  var desde = sessao && sessao.em;
  // O bichinho conta o que ACONTECEU; o asterisco conta que o painel está vivo.
  // No primeiro minuto de cada estado aparece o bichinho daquele estado — é
  // quando o movimento carrega informação ("isto mudou agora"). Depois ele
  // descansa e entra o asterisco, que não finge que alguém está cavando há
  // meia hora.
  if (m.sempre) return m.gif;          // este não descansa: ver acima
  var descansando = desde && (agoraS() - desde) > T.animado;
  return descansando ? GIFS.asterisco : m.gif;
}

/* O símbolo do Claude (Anthropic), em traçado único. Vai com `ic cheio`, que
   preenche com a cor de destaque do tema — então ele fica verde no Matrix,
   rosa no Orkut, azul no Facebook, sem nenhuma regra por tema. */
var ICONE_CLAUDE = '<svg class="ic cheio" viewBox="0 0 100 100"><path d="m19.6 66.5 19.7-11 .3-1-.3-.5h-1l-3.3-.2-11.2-.3L14 53l-9.5-.5-2.4-.5L0 49l.2-1.5 2-1.3 2.9.2 6.3.5 9.5.6 6.9.4L38 49.1h1.6l.2-.7-.5-.4-.4-.4L29 41l-10.6-7-5.6-4.1-3-2-1.5-2-.6-4.2 2.7-3 3.7.3.9.2 3.7 2.9 8 6.1L37 36l1.5 1.2.6-.4.1-.3-.7-1.1L33 25l-6-10.4-2.7-4.3-.7-2.6c-.3-1-.4-2-.4-3l3-4.2L28 0l4.2.6L33.8 2l2.6 6 4.1 9.3L47 29.9l2 3.8 1 3.4.3 1h.7v-.5l.5-7.2 1-8.7 1-11.2.3-3.2 1.6-3.8 3-2L61 2.6l2 2.9-.3 1.8-1.1 7.7L59 27.1l-1.5 8.2h.9l1-1.1 4.1-5.4 6.9-8.6 3-3.5L77 13l2.3-1.8h4.3l3.1 4.7-1.4 4.9-4.4 5.6-3.7 4.7-5.3 7.1-3.2 5.7.3.4h.7l12-2.6 6.4-1.1 7.6-1.3 3.5 1.6.4 1.6-1.4 3.4-8.2 2-9.6 2-14.3 3.3-.2.1.2.3 6.4.6 2.8.2h6.8l12.6 1 3.3 2 1.9 2.7-.3 2-5.1 2.6-6.8-1.6-16-3.8-5.4-1.3h-.8v.4l4.6 4.5 8.3 7.5L89 80.1l.5 2.4-1.3 2-1.4-.2-9.2-7-3.6-3-8-6.8h-.5v.7l1.8 2.7 9.8 14.7.5 4.5-.7 1.4-2.6 1-2.7-.6-5.8-8-6-9-4.7-8.2-.5.4-2.9 30.2-1.3 1.5-3 1.2-2.5-2-1.4-3 1.4-6.2 1.6-8 1.3-6.4 1.2-7.9.7-2.6v-.2H49L43 72l-9 12.3-7.2 7.6-1.7.7-3-1.5.3-2.8L24 86l10-12.8 6-7.9 4-4.6-.1-.5h-.3L17.2 77.4l-4.7.6-2-2 .2-3 1-1 8-5.5Z"/></svg>';
var ICONE_GITHUB = '<svg class="ic cheio" viewBox="0 0 24 24"><path d="M12 .3a12 12 0 0 0-3.8 23.4c.6.1.8-.3.8-.6v-2c-3.3.7-4-1.6-4-1.6-.6-1.4-1.4-1.8-1.4-1.8-1-.7.1-.7.1-.7 1.2.1 1.8 1.2 1.8 1.2 1 1.8 2.8 1.3 3.5 1 0-.8.4-1.3.7-1.6-2.7-.3-5.5-1.3-5.5-6 0-1.2.5-2.3 1.3-3.1-.2-.4-.6-1.6.1-3.2 0 0 1-.3 3.3 1.2a11.5 11.5 0 0 1 6 0c2.3-1.5 3.3-1.2 3.3-1.2.7 1.6.2 2.8.1 3.2.8.8 1.3 1.9 1.3 3.2 0 4.6-2.8 5.6-5.5 5.9.5.4.9 1.1.9 2.3v3.3c0 .3.1.7.8.6A12 12 0 0 0 12 .3"/></svg>';


/* ------------------------------------------------------- estado dos PRs */
// O mesmo estado do GitHub quer dizer coisas opostas conforme o PR seja seu ou
// de outra pessoa. "REVIEW_REQUIRED" no seu PR é "espere alguém"; no PR alheio
// é "você precisa olhar". Por isso os rótulos mudam de lado.
function rotuloRevisao(pr, meu) {
  if (pr.rascunho) return { txt: 'RASCUNHO', cor: 'cinza' };
  if (pr.revisao === 'CHANGES_REQUESTED')
    return meu ? { txt: 'AJUSTAR', cor: 'vermelho' }
               : { txt: 'MUDANÇAS PEDIDAS', cor: 'vermelho' };
  if (pr.revisao === 'APPROVED') return { txt: 'APROVADO', cor: 'verde' };
  return meu ? { txt: 'AGUARDANDO', cor: 'amarelo' }
             : { txt: 'REVISAR', cor: 'amarelo' };
}

var CI_ICONE = {
  ok:      '<svg viewBox="0 0 24 24"><path d="M12 2l8 4v6c0 5-3.4 8.7-8 10-4.6-1.3-8-5-8-10V6z" fill="currentColor"/><path d="M8.5 12.2l2.4 2.4 4.6-4.9" fill="none" stroke="#0c0d10" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  falhou:  '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="9" fill="currentColor"/><path d="M6.5 17.5l11-11" stroke="#0c0d10" stroke-width="2.4" stroke-linecap="round"/></svg>',
  rodando: '<svg viewBox="0 0 24 24"><g fill="currentColor"><rect x="11" y="1.5" width="2" height="5" rx="1"/><rect x="11" y="17.5" width="2" height="5" rx="1"/><rect x="1.5" y="11" width="5" height="2" rx="1"/><rect x="17.5" y="11" width="5" height="2" rx="1"/><rect x="4" y="4" width="2" height="5" rx="1" transform="rotate(-45 5 6.5)"/><rect x="18" y="15" width="2" height="5" rx="1" transform="rotate(-45 19 17.5)"/><rect x="18" y="4" width="2" height="5" rx="1" transform="rotate(45 19 6.5)"/><rect x="4" y="15" width="2" height="5" rx="1" transform="rotate(45 5 17.5)"/></g></svg>'
};

function seloCI(pr) {
  var tipo = pr.ci === 'SUCCESS' ? 'ok'
           : (pr.ci === 'FAILURE' || pr.ci === 'ERROR') ? 'falhou'
           : pr.ci === 'PENDING' ? 'rodando' : '';
  // Repositório sem CI configurado não ganha selo: melhor vazio que inventado.
  if (!tipo) return '';
  return '<span class="pr-ci ' + tipo + '">CI ' + CI_ICONE[tipo] + '</span>';
}

function linhaPR(pr, mostrarRepo, eu) {
  var meu = pr.autor === eu;
  var r = rotuloRevisao(pr, meu);
  // Um PR pode estar aprovado e quebrado ao mesmo tempo. Quando o CI cai, a
  // bolinha vira vermelha: é o que impede o merge, independente da revisão.
  var cor = (pr.ci === 'FAILURE' || pr.ci === 'ERROR') ? 'vermelho' : r.cor;

  // Anel só no que exige ação SUA: PR de outra pessoa ainda sem aprovação.
  // No seu próprio PR o anel seria ansiedade, não informação.
  var anel = (!meu && pr.revisao !== 'APPROVED' && !pr.rascunho) ? ' anel' : '';
  var quieto = pr.revisao === 'APPROVED' && pr.ci === 'SUCCESS' ? ' quieto' : '';
  var onde = mostrarRepo ? (pr.repo || '').split('/').pop() : pr.autor;

  return '<div class="pr' + anel + quieto + '">' +
           '<span class="pr-num">#' + pr.numero + '</span>' +
           '<span class="pr-titulo">' + escapar(pr.titulo) + '</span>' +
           '<span class="pr-onde">' + escapar(onde) + '</span>' +
           '<span class="pr-estado ' + cor + '"><i></i>' + r.txt + '</span>' +
           seloCI(pr) +
         '</div>';
}

// O que exige ação sua vem primeiro. Numa lista cortada em 4, a ordem decide
// o que você enxerga.
function prioridade(p, eu) {
  var meu = p.autor === eu;
  if (!meu && p.revisao !== 'APPROVED' && !p.rascunho) return 0;  // esperando você
  if (p.ci === 'FAILURE' || p.ci === 'ERROR') return 1;           // quebrado
  if (p.revisao === 'CHANGES_REQUESTED') return 2;
  if (p.revisao !== 'APPROVED') return 3;
  return 4;                                                       // resolvido
}

// O cartão corta a lista; o rodapé diz quantos ficaram de fora. Sem isso você
// olharia três PRs e acharia que são todos.
function rodapeMais(quantos, singular, plural) {
  if (quantos < 1) return '';
  return '<div class="rodape-mais">Mais ' + quantos + ' ' +
         (quantos === 1 ? singular : plural) +
         '. Toque para ver detalhes</div>';
}

function slidePRs(titulo, lista, mostrarRepo, vazio, eu, erro) {
  var ordenada = lista.slice().sort(function (a, b) {
    return prioridade(a, eu) - prioridade(b, eu) || b.numero - a.numero;
  });
  // Todas as linhas são desenhadas; quantas ficam visíveis é decidido depois,
  // MEDINDO o cartão. Ver ajustarListas.
  // Lista vazia com contato: não há nada pendente, e isso é uma boa notícia —
  // vale mostrar com cara de boa notícia. SEM contato é outra coisa: aí a lista
  // está vazia porque estamos cegos, e dizer "tudo ok" seria justamente o tipo
  // de mentira tranquilizadora que este painel evita em todo lugar.
  var corpo = ordenada.length
    ? ordenada.map(function (p) { return linhaPR(p, mostrarRepo, eu); }).join('')
    : (erro ? '<div class="pr-vazio">' + vazio + '</div>'
            : '<div class="tudo-ok"><img src="' +
              (octocatDoCartao() || 'tudo-ok.svg') + '" alt="">' +
              '<p>Tudo ok por aqui</p></div>');
  // O rodapé nasce vazio e escondido: só ajustarListas sabe se sobrou alguma
  // coisa de fora, porque só ele mediu.
  if (ordenada.length) corpo += '<div class="rodape-mais" hidden></div>';
  return { classe: 'lista-slide', titulo: titulo, icone: ICONE_GITHUB,
           selo: erro ? 'SEM CONTATO' : 'ONLINE', html: corpo };
}

// Produz o DESCRITOR do widget do Claude — {titulo, icone, selo, html} —, em
// vez de empurrar direto para um slider. É o que permite a mesma coisa virar um
// cartão sozinho ou um slide dentro de um grupo, sem duas versões do código.
function slideClaude() {
  var c = estado.claude || {};
  var m = CLAUDE[c.estado] || CLAUDE.ausente;
  var todas = c.sessoes || [];
  var agora = agoraS();

  // Dorme quando nada acontece há 10 minutos — mas nunca com algo esperando
  // por você. Espera ignorada não vira sono; ela continua sendo espera.
  var esperando = todas.some(function (s) { return s.estado === 'atencao'; });
  var maisRecente = 0;
  todas.forEach(function (s) { if (s.em > maisRecente) maisRecente = s.em; });
  var quieto = !esperando && (!todas.length || (agora - maisRecente) > T.sono);

  var sessoes;
  if (quieto && c.estado !== 'ausente') {
    // Um Clawd dormindo no lugar da lista: com nada acontecendo, listar
    // sessões ociosas é ruído. O fluxo normal desenha daqui para baixo.
    m = CLAUDE.dormindo;
    sessoes = [{ estado: 'dormindo', rotulo: '', em: maisRecente }];
  } else {
    sessoes = relevantes(todas, agora).slice(0, T.bichos);
    if (!sessoes.length) sessoes = m.gif ? [{ estado: c.estado, rotulo: '' }] : [];
  }

  // ---- slide 1: as sessões, com os bichinhos
  var bichos = '<div class="bichos' + (sessoes.length > 1 ? ' varios' : '') + '">' +
    sessoes.map(function (s) {
      var e = CLAUDE[s.estado] || CLAUDE.parado;
      var arq = arquivoDe(e, s);
      var nome = s.rotulo || s.projeto || '';
      // A borda da caixa diz o estado de longe, antes de você ler a pílula.
      var fio = e.fio
        ? '<svg class="fio" viewBox="0 0 100 100" preserveAspectRatio="none">' +
          '<rect x="1" y="1" width="98" height="98" rx="7" pathLength="100"/></svg>'
        : '';
      return '<div class="sessao s-' + (s.estado || 'parado') + '">' + fio +
               (arq ? '<img class="bicho" src="' + arq + '" alt="">' : '') +
               '<span class="pilula ' + e.classe + '"><i></i>' + e.txt + '</span>' +
               (nome ? '<span class="proj">' + escapar(nome) + '</span>' : '') +
             '</div>';
    }).join('') + '</div>' +
    // Dormindo, o resumo do servidor ainda diria "Trabalhando em X" — a última
    // coisa que aconteceu, não o que está acontecendo. Aqui vale o texto do
    // estado.
    (sessoes.length > 1 ? ''
      : '<p>' + escapar(quieto ? m.padrao : (c.detalhe || m.padrao)) + '</p>') +
    // O rodapé conta tudo que ficou de fora — as concluídas escondidas e as que
    // não couberam. Todas aparecem na tela cheia.
    (quieto ? '' : rodapeMais(todas.length - sessoes.length, 'projeto', 'projetos'));

  var selo = !c.estado ? 'FASE 3'
           : quieto ? 'DORMINDO'
           : (c.estado === 'parado' || c.estado === 'desconhecido') ? 'OCIOSO'
           : ((c.sessoes || []).length > 1 ? c.sessoes.length + ' SESSÕES' : 'ONLINE');

  return { classe: '', titulo: 'CLAUDE CODE', icone: ICONE_CLAUDE,
           selo: selo, html: bichos, tela: 'claude' };
}

function slideGitMeus() {
  var g = estado.git;
  if (!g) return null;
  var d = slidePRs('GITHUB - MEUS PULL REQUESTS', g.meus || [], true,
                   'nenhum PR seu aberto', g.eu, g.erro);
  d.tela = 'claude';
  return d;
}

function slideGitDesign() {
  var g = estado.git;
  if (!g) return null;
  var d = slidePRs('GITHUB - REPO DESIGN', g.design || [], false,
                   'nada aberto no repositório', g.eu, g.erro);
  d.tela = 'claude';
  return d;
}

/* =============================================================== monitor */
function linhaMac(rot, valor, pct, classe) {
  return '<div class="linha ' + classe + '">' +
           '<span class="rot">' + rot + '</span>' +
           '<span class="val">' + valor + '</span>' +
           '<span class="barra"><span style="width:' + Math.min(100, pct) + '%"></span></span>' +
         '</div>';
}

function nivel(v, atencao, critico) {
  return v >= critico ? 'critico' : (v >= atencao ? 'atencao' : '');
}

var ICONE_MONITOR = '<svg class="ic" viewBox="0 0 24 24"><path d="M3 13h3l2.5-7 4 14L15.5 13H21"/></svg>';
var ICONE_USO = '<svg class="ic" viewBox="0 0 24 24"><path d="M12 3a9 9 0 1 0 9 9h-9z"/><path d="M12 3v9h9"/></svg>';

// O monitor virou widget de SLIDE, como os do Claude e do GitHub: é o que
// permite agrupá-lo com o uso do Claude num cartão que alterna. Sozinho ele
// continua sendo um cartão comum — grupo de um.
function slideMonitor() {
  var m = estado.maquina;
  var corpo;
  if (!m) {
    corpo = '<div class="vazio">sem leitura</div>';
  } else {
    // O swap é o que avisa que a máquina vai engasgar. CPU e memória altas são
    // rotina; swap cheio não é.
    var livre = m.swap_total_gb - m.swap_gb;
    var nivelSwap = livre < 1 ? 'critico' : (m.swap_gb >= 2 ? 'atencao' : '');
    var pctSwap = m.swap_total_gb ? (m.swap_gb / m.swap_total_gb * 100) : 0;
    corpo = linhaMac('CPU', m.cpu + '%', m.cpu, nivel(m.cpu, 85, 95)) +
            linhaMac('MEM', m.ram + '%', m.ram, nivel(m.ram, 85, 92)) +
            linhaMac('SWAP', m.swap_gb + 'G', pctSwap, nivelSwap);
  }
  return { classe: 'monitor-slide', titulo: 'MONITOR DO MAC', icone: ICONE_MONITOR,
           html: '<div class="corpo">' + corpo + '</div>', tela: 'monitor' };
}

/* O uso do plano do Claude Code.
 *
 * Duas barras, não quatro. O app grava em disco só o limite de 5 horas e o
 * semanal; o semanal do Fable e o contexto vivem dentro do processo de uma
 * sessão e nunca são escritos. Uma sessão pode empurrá-los para /uso, e aí
 * eles aparecem — até lá, não existem no cartão.
 *
 * O selo mostra a IDADE da leitura porque o app só grava enquanto está aberto:
 * "12%" de três horas atrás é outra informação que "12%" de agora, e sem a
 * idade as duas seriam indistinguíveis.
 */
function slideUso() {
  var u = estado.uso;
  if (!u || (u.cinco_horas === undefined && u.semanal === undefined)) {
    return { classe: 'monitor-slide', titulo: 'MONITOR DO CLAUDE', icone: ICONE_USO,
             html: '<div class="vazio">sem leitura do plano</div>', tela: 'uso' };
  }

  function barra(rot, pct) {
    if (pct === undefined || pct === null) return '';
    return linhaMac(rot, pct + '%', pct, nivel(pct, 75, 90));
  }

  var corpo = barra('5 HORAS', u.cinco_horas) + barra('SEMANA', u.semanal);
  if (u.fable !== undefined && u.fable !== null) corpo += barra('FABLE', u.fable);
  if (u.contexto && u.contexto.pct !== undefined) {
    corpo += linhaMac('CONTEXTO', u.contexto.pct + '%', u.contexto.pct,
                      nivel(u.contexto.pct, 80, 93));
  }

  var idade = u.em ? Math.round((agoraS() - u.em) / 60) : null;
  var selo = idade === null ? '' : (idade < 2 ? 'AGORA' : idade + ' MIN');

  return { classe: 'monitor-slide', titulo: 'MONITOR DO CLAUDE', icone: ICONE_USO,
           selo: selo, html: '<div class="corpo">' + corpo + '</div>',
           tela: 'uso' };
}

/* ============================================================== mensagens */

/* Um slider por cartão. Era código solto para as mensagens; virou objeto
   quando o cartão do Claude também precisou girar. O DOM só é reconstruído
   quando o conteúdo muda de verdade — refazer o innerHTML a cada ciclo
   cortaria a transição no meio. */
/* Mostra quantos couberem, e avisa só quando algo ficou de fora.
 *
 * O corte é MEDIDO, não estimado. A altura útil do cartão muda com o tema (o
 * Windows 95 tem relevo no lugar da borda, o Apple tem canto largo), com o
 * tamanho da tela e com a quantidade de texto de cada linha. Qualquer número
 * fixo acerta numa combinação e erra nas outras: três era o que cabia no Tab
 * E, e num iPad de 768px de altura deixava um vão embaixo.
 *
 * Esconde em vez de remover: na próxima medição tudo volta a aparecer e a
 * conta é refeita do zero, sem precisar redesenhar o cartão inteiro.
 */
function ajustarListas(palco) {
  if (typeof palco === 'string') palco = $(palco);
  if (!palco) return;
  var slides = palco.querySelectorAll('.slide');
  for (var s = 0; s < slides.length; s++) {
    var el = slides[s];
    var rodape = el.querySelector('.rodape-mais');
    var linhas = el.querySelectorAll('.pr');
    if (!rodape || !linhas.length) continue;

    for (var i = 0; i < linhas.length; i++) linhas[i].hidden = false;
    rodape.hidden = true;

    var fora = 0;
    // Uma linha sempre fica: cartão só com o aviso não informa nada.
    while (fora < linhas.length - 1 && el.scrollHeight > el.clientHeight + 1) {
      linhas[linhas.length - 1 - fora].hidden = true;
      fora++;
      // O aviso entra já na medição seguinte. Ele também ocupa altura, e
      // ignorar isso faria a última linha transbordar de volta.
      rodape.hidden = false;
      rodape.textContent = 'Mais ' + fora + ' pull request' +
                           (fora === 1 ? '' : 's') + '. Toque para ver detalhes';
    }
    if (!fora) rodape.hidden = true;
  }
}

function Slider(palco, pontos) {
  // Elementos, não ids: os hospedeiros agora nascem do layout e não têm id
  // fixo. Um cartão de slider pode existir duas vezes na tela.
  this.palco = palco;
  this.pontos = pontos;
  this.atual = 0;
  this.assinatura = '';
  this.trocaEm = 0;
}

// Cada slide é uma string, ou {html, classe} quando precisa de estilo próprio
// (as listas de PR começam no topo; os bichinhos e chips ficam centralizados).
Slider.prototype.atualizar = function (slides) {
  var nova = slides.map(function (x) {
    return typeof x === 'string' ? x : (x.classe + '\u0001' + x.html);
  }).join('|');
  if (nova === this.assinatura) return;
  this.assinatura = nova;
  this.palco.innerHTML = slides.map(function (x) {
    var html = typeof x === 'string' ? x : x.html;
    var cls = typeof x === 'string' ? '' : (x.classe || '');
    return '<div class="slide ' + cls + '" data-classe="' + cls + '">' + html + '</div>';
  }).join('');
  this.pontos.innerHTML = slides.map(function () { return '<i></i>'; }).join('');
  // Um slide só não é slider: os pontinhos viram enfeite que confunde.
  this.pontos.style.display = slides.length > 1 ? '' : 'none';
  // Os slides inativos são invisíveis por opacidade, não por display — então
  // têm altura medível e todos podem ser ajustados de uma vez, aqui.
  ajustarListas(this.palco);
  this.slides = slides;
  if (this.atual >= slides.length) this.atual = 0;
  this.mostrar(this.atual);
};

Slider.prototype.mostrar = function (i) {
  var todos = this.palco.querySelectorAll('.slide');
  if (!todos.length) return;
  this.atual = i % todos.length;
  for (var k = 0; k < todos.length; k++) {
    var extra = todos[k].getAttribute('data-classe') || '';
    todos[k].className = 'slide ' + extra + (k === this.atual ? ' ativo' : '');
  }
  var pts = this.pontos.querySelectorAll('i');
  for (var j = 0; j < pts.length; j++) pts[j].className = j === this.atual ? 'ativo' : '';

  // Um cartão que mostra coisas diferentes precisa de cabeçalho diferente:
  // "CLAUDE CODE" com os PRs do GitHub embaixo seria rótulo errado.
  var s = this.slides && this.slides[this.atual];
  if (this.aoTrocar && s && typeof s !== 'string') this.aoTrocar(s);
};

Slider.prototype.girar = function () {
  var n = this.palco.querySelectorAll('.slide').length;
  if (n < 2 || Date.now() < this.trocaEm) return;
  this.trocaEm = Date.now() + T.slide * 1000;
  this.mostrar(this.atual + 1);
};

var sliderMsg = new Slider($('palco'), $('pontos'));

/* ================================================================== layout
 *
 * A tela é montada a partir da configuração, não do HTML. Cada coluna recebe
 * uma lista de itens, e cada item é um de três:
 *
 *   {tipo:'solo',   ids:['agenda']}                 um widget ocupando a linha
 *   {tipo:'par',    ids:['clima','recado']}         dois lado a lado
 *   {tipo:'slider', ids:['claude','git-meus',...]}  um cartão que alterna
 *
 * Widgets vêm de dois lugares. Os de NÓ são seções prontas no estoque e são
 * MOVIDAS para a coluna — mover preserva o estado (o gif no meio da animação,
 * a rolagem de uma lista), coisa que recriar o HTML perderia a cada mudança.
 * Os de SLIDE produzem um descritor e são desenhados num molde; sozinhos viram
 * um cartão comum, agrupados viram um slider. Um grupo de um é o caso solo, e
 * por isso não existem dois caminhos.
 */
var WIDGETS_NO = ['relogio', 'clima', 'recado', 'agenda', 'mensagens'];

/* Widgets de conteúdo CURTO: três ou quatro linhas e acabou.
 *
 * Um cartão com eles não deve esticar — esticado, viram quatro linhas no topo
 * e meia tela de vazio embaixo, roubando altura de quem tem o que mostrar (a
 * agenda, em geral). Num grupo, o mais alto dos slides define a altura: ela
 * fica estável enquanto o slider gira, em vez de o cartão pular de tamanho a
 * cada troca. */
var WIDGETS_CURTOS = ['monitor', 'uso'];
var WIDGETS_SLIDE = {
  'claude':     slideClaude,
  'git-meus':   slideGitMeus,
  'git-design': slideGitDesign,
  'monitor':    slideMonitor,
  'uso':        slideUso
};

var LAYOUT_PADRAO = {
  esquerda: [
    { tipo: 'solo',   ids: ['relogio'] },
    { tipo: 'par',    ids: ['clima', 'recado'] },
    { tipo: 'slider', ids: ['claude', 'git-meus', 'git-design'] }
  ],
  direita: [
    { tipo: 'solo',   ids: ['agenda'] },
    { tipo: 'solo',   ids: ['mensagens'] },
    { tipo: 'slider', ids: ['monitor', 'uso'] }
  ]
};

var hostsSlide = [];        // {slider, ids} de cada cartão de slide na tela
var layoutAtual = '';       // assinatura, para não remontar à toa

function noDoWidget(id) {
  return document.querySelector('[data-widget="' + id + '"]');
}

function montarLayout(cfg) {
  var l = cfg && cfg.esquerda && cfg.direita ? cfg : LAYOUT_PADRAO;
  var assinatura = JSON.stringify(l);
  if (assinatura === layoutAtual) return;
  layoutAtual = assinatura;

  // Devolve todo mundo ao estoque antes de remontar. Sem isso, um widget que
  // mudou de coluna apareceria nas duas até alguém reparar.
  var estoque = $('estoque');
  for (var i = 0; i < WIDGETS_NO.length; i++) {
    var no = noDoWidget(WIDGETS_NO[i]);
    if (no) estoque.appendChild(no);
  }
  hostsSlide = [];

  montarColuna($('col-esq'), l.esquerda || []);
  montarColuna($('col-dir'), l.direita || []);

  // A conta de quantas linhas cabem só vale depois que a coluna inteira
  // existe: a altura de um cartão em flex depende dos irmãos, e medir no
  // meio da montagem dá um número que ainda vai mudar. Um quadro depois,
  // tudo já assentou.
  setTimeout(function () {
    for (var i = 0; i < hostsSlide.length; i++) {
      ajustarListas(hostsSlide[i].slider.palco);
    }
    ajustarListas(sliderMsg.palco);
  }, 0);
}

function montarColuna(coluna, itens) {
  coluna.innerHTML = '';
  for (var i = 0; i < itens.length; i++) {
    var it = itens[i] || {};
    var ids = (it.ids || []).filter(function (id) {
      return WIDGETS_NO.indexOf(id) >= 0 || WIDGETS_SLIDE[id];
    });
    if (!ids.length) continue;

    if (it.tipo === 'par' && ids.length > 1) {
      var dupla = document.createElement('div');
      // `abertura` é o pareamento do clima, que tem regra própria: o clima
      // abraça o conteúdo e o vizinho fica com o resto.
      dupla.className = 'dupla' + (ids.indexOf('clima') >= 0 ? ' abertura' : '');
      for (var k = 0; k < ids.length; k++) dupla.appendChild(pecaDe(ids[k]));
      coluna.appendChild(dupla);
    } else if (it.tipo === 'slider' && ids.length > 1) {
      coluna.appendChild(hospedeiro(ids));
    } else {
      coluna.appendChild(pecaDe(ids[0]));
    }
  }
}

// Um widget sozinho: nó movido do estoque, ou um hospedeiro de um slide só.
function pecaDe(id) {
  if (WIDGETS_SLIDE[id]) return hospedeiro([id]);
  return noDoWidget(id) || document.createComment('sem ' + id);
}

function hospedeiro(ids) {
  var el = document.getElementById('molde-host').content
             .firstElementChild.cloneNode(true);
  var curto = ids.every(function (id) { return WIDGETS_CURTOS.indexOf(id) >= 0; });
  if (curto) el.className += ' curto';
  el.setAttribute('data-cartao', ids.join('+'));
  var slider = new Slider(el.querySelector('.palco'), el.querySelector('.pontos'));
  var cabeca = el.querySelector('h2'), selo = el.querySelector('.etq');
  slider.aoTrocar = function (slide) {
    // A tela de detalhe segue o slide VISÍVEL. Antes era fixa em 'claude', o
    // que só funcionava enquanto o único slider da tela era aquele — agora o
    // monitor também mora num, e tocar nele tem que abrir a tela dele.
    if (slide.tela) el.setAttribute('data-tela', slide.tela);
    else el.removeAttribute('data-tela');
    cabeca.innerHTML = (slide.icone || '') + (slide.titulo || '');
    selo.textContent = slide.selo || '';
    selo.style.visibility = slide.selo ? '' : 'hidden';
  };
  hostsSlide.push({ slider: slider, ids: ids });
  return el;
}

// Preenche os hospedeiros com o conteúdo de cada widget de slide.
function desenharSlides() {
  for (var i = 0; i < hostsSlide.length; i++) {
    var h = hostsSlide[i], slides = [];
    for (var k = 0; k < h.ids.length; k++) {
      var d = WIDGETS_SLIDE[h.ids[k]]();
      if (d) slides.push(d);
    }
    if (slides.length) h.slider.atualizar(slides);
  }
}



function chip(rotulo, dado) {
  var classe = 'chip', valor;
  if (!dado) { classe += ' cego'; valor = 'SEM DADO'; }
  else if (dado.aberto === false) { classe += ' cego'; valor = 'SEM ABA'; }
  else if (!dado.contador) { classe += ' zerado'; valor = '0'; }
  else { valor = dado.contador; }
  return '<span class="' + classe + '"><span class="rot">' + escapar(rotulo) +
         '</span><span class="num">' + valor + '</span></span>';
}

function montarSlides() {
  var slides = [];

  slides.push('<div class="linhas">' +
    chip('CHAT', estado.chat) + chip('WHATSAPP', estado.whatsapp) + '</div>');

  // Uma conta de e-mail por linha. Ver "trabalho 0 / pessoal 131" separado
  // vale muito mais que um "140" somado que não diz de onde veio.
  var em = estado.email;
  var contas = (em && em.abas) ? em.abas.filter(function (a) { return a.conta; }) : [];

  if (!contas.length) {
    slides.push('<div class="linhas">' + chip('EMAIL', em) + '</div>');
    return slides;
  }

  // Em grupos de 3: mais que isso não cabe no cartão sem espremer a fonte, e
  // o slider já existe para isso. Com 5 contas viram dois slides de e-mail.
  for (var i = 0; i < contas.length; i += T.contas) {
    slides.push('<div class="linhas">' +
      contas.slice(i, i + T.contas).map(function (a) {
        return chip(a.conta, { aberto: true, contador: a.contador });
      }).join('') + '</div>');
  }
  return slides;
}

function desenharMensagens() {
  var slides = montarSlides();
  sliderMsg.atualizar(slides);

  var recente = 0;
  ['email', 'chat', 'whatsapp'].forEach(function (k) {
    var d = estado[k];
    if (d && d.atualizado_em > recente) recente = d.atualizado_em;
  });

  var aviso = $('msg-aviso');
  if (recente && agoraS() - recente > 300) {
    aviso.className = 'canto velho';
    aviso.textContent = 'sensor parado';
  } else {
    aviso.className = 'canto';
    aviso.textContent = '';
  }
}



/* ========================================================= tela de detalhe */
// Toque expande, nunca age. E volta sozinha: se você tocar e sair de perto,
// o painel não pode ficar preso numa tela de clima o resto do dia.
var telaAberta = '';
var telaAte = 0;

var DIA_CURTO = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function dataLocal(iso) {           // "2026-09-16" -> Date local, sem fuso
  var p = iso.split('-');
  return new Date(+p[0], +p[1] - 1, +p[2]);
}

function isoDe(d) {
  return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate());
}

function hojeISO() {
  return isoDe(new Date(Date.now() + deslocamento));
}

/* ------------------------------------------------------ a janela da agenda
 *
 * Quantos dias o painel olha para a frente. Era 7, escrito duas vezes — sete
 * colunas na tela expandida e "o que ainda não acabou" no cartão, sem limite
 * nenhum. Agora é uma decisão só, do painel de controle, e as duas leem daqui:
 * mostrar cinco dias na tela e dez no cartão seriam duas agendas diferentes
 * com o mesmo nome.
 *
 * Quatro modos: 3, 5, 7 dias a partir de hoje, ou a SEMANA do calendário.
 *
 * A semana é diferente em espécie, não em tamanho: ela inclui os dias que já
 * passaram. Por isso cada dia sai marcado com `passado`, e não filtrado —
 * quem pediu a semana quer ver a semana inteira, com a terça que já foi em
 * cinza. Domingo a sábado, como o calendário de parede brasileiro se lê; para
 * começar na segunda, é o `- hoje.getDay()` aqui embaixo que muda.
 */
function janelaAgenda() {
  var modo = ((estado.ajustes && estado.ajustes.agenda) || {}).dias;
  var hoje = dataLocal(hojeISO());
  var inicio, quantos;

  if (modo === 'semana') {
    inicio = new Date(hoje.getFullYear(), hoje.getMonth(), hoje.getDate() - hoje.getDay());
    quantos = 7;
  } else {
    inicio = hoje;
    quantos = (+modo === 3 || +modo === 5 || +modo === 7) ? +modo : 7;
  }

  var hojeIso = isoDe(hoje), dias = [];
  for (var i = 0; i < quantos; i++) {
    var d = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + i);
    dias.push({ iso: isoDe(d), dt: d, passado: isoDe(d) < hojeIso });
  }

  // `apos` é o dia seguinte ao último, para comparar com "<" sem erro de
  // fronteira — um evento que começa 23:50 do último dia ainda está dentro.
  var fim = new Date(inicio.getFullYear(), inicio.getMonth(), inicio.getDate() + quantos);
  return { dias: dias, de: dias[0].iso, apos: isoDe(fim) };
}

/* ------------------------------------------------------------------ clima */
function telaClima() {
  var c = estado.clima;
  if (!c || !c.semana) return '<div class="vazio">sem previsão</div>';
  var hoje = hojeISO();

  return '<div class="semana">' + c.semana.map(function (d) {
    var dt = dataLocal(d.data);
    var nome = d.data === hoje ? 'HOJE' : DIA_CURTO[dt.getDay()].toUpperCase();
    var chuva = (d.chuva === null || d.chuva === undefined) ? '—' : d.chuva + '%';
    return '<div class="dia' + (d.data === hoje ? ' hoje' : '') + '">' +
             '<span class="nome">' + nome + ' ' + dt.getDate() + '</span>' +
             '<svg viewBox="0 0 64 64"><g class="traco">' +
               (TEMPO[d.icone] || TEMPO.nuvem) + '</g></svg>' +
             '<div class="temp">' + d.max + '°<small> / ' + d.min + '°</small></div>' +
             '<div class="cond">' + escapar(d.texto) + '</div>' +
             '<div class="pe">chuva <b>' + chuva + '</b><br>' +
               escapar(d.nascer || '') + ' – ' + escapar(d.por || '') + '</div>' +
           '</div>';
  }).join('') + '</div>';
}

/* ----------------------------------------------------------------- agenda */
function telaAgenda() {
  var a = estado.agenda;
  if (!a || !(a.itens || []).length) return '<div class="vazio">semana vazia</div>';
  var agora = agoraS(), hoje = hojeISO();

  // Uma coluna por dia da janela, mesmo as vazias: dia sem compromisso é
  // informação, e coluna que some faz a semana mudar de forma todo dia.
  var dias = janelaAgenda().dias;
  var porISO = {};
  dias.forEach(function (d) { d.itens = []; porISO[d.iso] = d; });

  (a.itens || []).forEach(function (e) {
    if (e.dia_inteiro) {
      dias.forEach(function (d) {
        if (e.inicio <= d.iso && d.iso < e.fim) d.itens.push(e);
      });
      return;
    }
    var iso = isoDe(new Date(e.inicio_ts * 1000));
    if (porISO[iso]) porISO[iso].itens.push(e);
  });

  return '<div class="agenda-semana">' + dias.map(function (d) {
    /* Cada compromisso é um cartãozinho, não uma linha de texto. A coluna já
     * é uma caixa; sem uma segunda borda, dois eventos seguidos viram um
     * bloco de quatro linhas e você tem que contar horários para saber onde
     * um acaba. A barra de cor à esquerda é o que separa de longe. */
    /* Vazio não é sempre a mesma coisa. Quando a agenda vem da extensão (o
     * adb caiu), a leitura começa em HOJE — a janela apertada é o que impede
     * uma aba esquecida em março de virar "esta semana". Então os dias já
     * passados não estão livres: estão sem leitura, e dizer "livre" numa
     * terça cheia de reunião seria inventar. */
    var cego = d.passado && (a.origem === 'navegador');
    var vazio = cego ? '<div class="livre cego">sem leitura</div>'
                     : '<div class="livre">livre</div>';

    var corpo = d.itens.length ? d.itens.map(function (e) {
      var passou = !e.dia_inteiro && e.fim_ts <= agora;
      return '<div class="compromisso' + (passou ? ' passou' : '') +
               (e.dia_inteiro ? ' inteiro' : '') + '">' +
               '<div class="h">' + (e.dia_inteiro ? 'dia todo' : hhmm(e.inicio_ts)) + '</div>' +
               '<div class="t">' + escapar(e.titulo) + '</div>' +
             '</div>';
    }).join('') : vazio;

    return '<div class="coluna-dia' + (d.iso === hoje ? ' hoje' : '') +
             (d.passado ? ' passado' : '') + '">' +
             '<div class="cabeca">' + DIA_CURTO[d.dt.getDay()].toUpperCase() +
               ' ' + d.dt.getDate() + '</div>' + corpo +
           '</div>';
  }).join('') + '</div>';
}

/* ----------------------------------------------------------------- claude */
function idade(seg) {
  if (seg < 60) return 'há ' + Math.round(seg) + 's';
  var min = Math.round(seg / 60);
  if (min < 60) return 'há ' + min + ' min';
  var h = Math.floor(min / 60);
  return 'há ' + h + 'h' + (min % 60 ? dois(min % 60) : '');
}

function telaClaude() {
  var c = estado.claude || {};
  var lista = c.sessoes || [];
  var g = estado.git;

  var esquerda = '<div class="sub-titulo">' + ICONE_CLAUDE + 'SESSÕES' +
                 (lista.length ? '<b>' + lista.length + '</b>' : '') + '</div>';
  esquerda += lista.length ? lista.map(function (s) {
    var m = CLAUDE[s.estado] || CLAUDE.parado;
    // O bichinho do ESTADO, não o asterisco de descanso: esta tela existe
    // justamente para ver quem está em quê. Em PNG — são várias de uma vez.
    var arq = estaticoDe(m, s);
    return '<div class="cartao-sessao">' +
             (arq ? '<img src="' + arq + '" alt="">' : '') +
             '<div class="info">' +
               '<div class="nome">' + escapar(s.rotulo || s.projeto || '?') + '</div>' +
               '<span class="pilula ' + m.classe + '"><i></i>' + m.txt + '</span>' +
               '<div class="quando">' + idade(agoraS() - s.em) + '</div>' +
             '</div></div>';
  }).join('') : '<div class="pr-vazio">' + escapar(c.detalhe || 'nenhuma sessão') + '</div>';

  var direita = '<div class="sub-titulo">' + ICONE_GITHUB + 'MEUS PULL REQUESTS' +
                (g && g.meus.length ? '<b>' + g.meus.length + '</b>' : '') + '</div>';
  if (!g) {
    direita += '<div class="pr-vazio">sem leitura do GitHub</div>';
  } else {
    direita += g.meus.length
      ? g.meus.slice().sort(function (a, b) { return prioridade(a, g.eu) - prioridade(b, g.eu); })
          .map(function (p) { return linhaPR(p, true, g.eu); }).join('')
      : '<div class="pr-vazio">nenhum PR seu aberto</div>';

    direita += '<div class="sub-titulo">' + ICONE_GITHUB + 'DESIGN' +
               (g.aguardando ? '<b>' + g.aguardando + ' a revisar</b>' : '') + '</div>';
    direita += g.design.length
      ? g.design.slice().sort(function (a, b) { return prioridade(a, g.eu) - prioridade(b, g.eu); })
          .map(function (p) { return linhaPR(p, false, g.eu); }).join('')
      : '<div class="pr-vazio">nada aberto no repositório</div>';
  }

  return '<div class="dividido"><div>' + esquerda + '</div><div>' + direita + '</div></div>';
}

/* A tela "sobre", que abre tocando no nome.
 *
 * Os endereços vão como TEXTO, não como link. O tablet vive em quiosque: um
 * toque que navegasse para fora tiraria o painel da tela e alguém teria que ir
 * até lá para trazê-lo de volta. Aqui o toque só abre e só fecha, como em todo
 * o resto — quem quiser o endereço lê e digita.
 */
/* Créditos do que aparece na tela. Só o que tem origem conhecida — atribuir
 * errado é pior do que não atribuir. */
// Rótulos curtos de propósito: a coluna é estreita e qualquer um com mais de
// oito letras quebra em duas linhas, desalinhando a lista inteira.
var CREDITOS = [
  ['Clawd',    'Anthropic, via Tenor · icons8'],
  ['Octocats', 'Octodex, GitHub'],
  ['Clima',    'Open-Meteo'],
  ['Fundos',   'Microsoft — Windows 95 e XP'],
  ['Ícones',   'icon-icons.com']
];

var LINKS = [
  ['site',      'www.piaianet.com'],
  ['linkedin',  'linkedin.com/in/denispiaia'],
  ['instagram', 'instagram.com/denispiaia'],
  ['linktree',  'linktr.ee/denispiaia'],
  ['e-mail',    'denis@piaianet.com']
];


/* ------------------------------------------------- menu de configurações
 *
 * Aberto pelo NOME na barra do topo. Os créditos saíram dali e foram para o
 * "i" depois da bateria: ajuste e crédito não são a mesma gaveta, e misturar
 * os dois fazia com que quem queria trocar o tema tivesse que passar por um
 * texto sobre o projeto.
 *
 * Este é o único lugar do tablet onde um toque MUDA alguma coisa. A regra da
 * casa é "toque expande, nunca age" — o tablet é vidro. A troca de tema cabe
 * na regra em vez de quebrá-la: não age sobre o mundo, muda como o próprio
 * vidro se parece, para quem já está na frente dele.
 *
 * O MENU MUDA DE FORMA COM O TEMA, e essa é a graça. A marcação é uma só —
 * caixa, título, lista de itens — e cada tema decide o que ela é: um cartão
 * no Escuro, no Claro, no Apple e no Orkut; um cartão de topo azul no
 * Facebook; o menu Iniciar sobre a barra de tarefas no 95 e no XP; uma lista
 * de texto num terminal no Matrix. Trocar de tema com o menu aberto redesenha
 * o menu na hora, o que é a demonstração mais direta do que o tema faz.
 *
 * A tabela não mora aqui. O servidor manda as oito paletas em /temas.json,
 * buscadas uma vez, e o tablet devolve só o SLUG — ele nunca precisa saber
 * que "Windows 95" tem um teal no fundo.
 */
var TEMAS_DISP = [];
var menuAberto = false;

function carregarTemas() {
  var x = new XMLHttpRequest();
  x.open('GET', '/temas.json', true);
  x.onload = function () {
    if (x.status !== 200) return;
    try { TEMAS_DISP = (JSON.parse(x.responseText) || {}).temas || []; }
    catch (e) { return; }
    if (menuAberto) desenharMenu();
  };
  x.send();
}

function temaAtual() {
  return (estado.ajustes && estado.ajustes.tema) || 'escuro';
}

/* O quadradinho de cada tema. Dois tipos, escolhidos pelo próprio tema em
 * temas.py: quem tem marca mostra a marca, quem não tem mostra a hora.
 *
 * A hora é a de AGORA, não uma fixa bonita. Num painel que existe para dizer
 * as horas, um relógio de enfeite marcando 12:17 às três da tarde seria a
 * primeira coisa a mentir na tela.
 *
 * A marca vem de web/marcas/<slug>.png quando o arquivo está no disco, com o
 * desenho de SUFIXO como reserva. É a mesma regra do sufixo do nome: a pasta
 * é opcional e fica fora do git, então o painel cai no desenho sem reclamar.
 */
function previaDe(t) {
  var c = t.cores || {};

  if (t.previa === 'marca') {
    /* Dois nomes de arquivo, na ordem em que servem. O `-topo.png` é o
     * logotipo cheio que ancora o canto da barra — é ele que a prévia quer.
     * O `<slug>.png` é a versão miúda que cola no nome, e serve de reserva.
     * Sem nenhum dos dois, cai no desenho de SUFIXO, e sem ele na inicial. */
    var tem = estado.marcas || [];
    var arq = tem.indexOf(t.slug + '-topo.png') >= 0 ? t.slug + '-topo.png'
            : (tem.indexOf(t.slug + '.png') >= 0 ? t.slug + '.png' : '');
    var dentro = arq
      ? '<img src="marcas/' + arq + '" alt="">'
      : (String(SUFIXO[t.slug] || '').indexOf('<svg') === 0
          ? SUFIXO[t.slug]
          : '<span class="menu-sigla">' + escapar(SUFIXO[t.slug] || t.nome.charAt(0)) + '</span>');
    // A marca desenhada usa fill:currentColor, então herda a cor de destaque
    // do tema — o polegar do Facebook sai azul, não cinza.
    return '<span class="menu-previa" style="background:' + c.fundo +
           ';color:' + c.ciano + '">' + dentro + '</span>';
  }

  // A hora é a de AGORA, não uma fixa bonita. Num painel que existe para dizer
  // as horas, um relógio de enfeite marcando 12:17 às quatro da tarde seria a
  // primeira coisa a mentir na tela.
  var d = new Date(Date.now() + deslocamento);
  return '<span class="menu-previa previa-hora" style="background:' + c.fundo +
         ';color:' + (t.slug === 'matrix' ? c.ciano : c.texto) + '">' +
           dois(d.getHours()) + ':' + dois(d.getMinutes()) +
         '</span>';
}

function desenharMenu() {
  var lista = $('menu-lista');
  if (!TEMAS_DISP.length) {
    lista.innerHTML = '<div class="menu-vazio">a lista de temas não chegou do Mac</div>';
    return;
  }
  var atual = temaAtual();
  lista.innerHTML = TEMAS_DISP.map(function (t) {
    return '<button class="menu-item' + (t.slug === atual ? ' ativo' : '') +
             '" data-tema-slug="' + t.slug + '">' +
             previaDe(t) +
             '<span class="menu-rot">' +
               '<span class="menu-nome">' + escapar(t.nome) + '</span>' +
               '<span class="menu-ativo">ativo</span>' +
             '</span>' +
           '</button>';
  }).join('');
}

function abrirMenu() {
  menuAberto = true;
  desenharMenu();
  $('menu').hidden = false;
  // Mesma marca que a tela de detalhe usa: os temas do Windows precisam saber
  // que há algo aberto para manter a barra de tarefas visível por baixo.
  document.documentElement.classList.add('menu-aberto');
}

function fecharMenu() {
  if (!menuAberto) return;
  menuAberto = false;
  $('menu').hidden = true;
  document.documentElement.classList.remove('menu-aberto');
}

function escolherTema(slug) {
  // Escolheu, fecha. O menu existe para tomar uma decisão, e depois de tomada
  // ele vira obstáculo entre você e o painel que acabou de mudar de cara.
  fecharMenu();
  if (slug === temaAtual()) return;

  /* Pinta antes de perguntar. A resposta volta pelo SSE em menos de um
   * segundo, mas num tablet de 2015 um botão que só reage quando a rede reage
   * parece quebrado, e o dedo aperta de novo. Aqui só a forma é antecipada
   * (data-tema); a paleta vem do servidor junto com o resto, e se o POST
   * falhar o próximo empurrão devolve o tema de verdade — a mentira dura um
   * ciclo e se desfaz sozinha. */
  document.documentElement.setAttribute('data-tema', slug);

  var x = new XMLHttpRequest();
  x.open('POST', '/tema', true);
  x.setRequestHeader('Content-Type', 'application/json');
  x.onload = function () {
    if (x.status === 200) return;
    document.documentElement.setAttribute('data-tema', temaAtual());
  };
  x.onerror = x.onload;
  x.send(JSON.stringify({ tema: slug }));
}

function telaSobre() {
  var links = LINKS.map(function (l) {
    return '<div class="link"><span class="rot">' + l[0] + '</span>' +
           '<span class="val">' + escapar(l[1]) + '</span></div>';
  }).join('');

  var creditos = CREDITOS.map(function (c) {
    return '<div class="link"><span class="rot">' + escapar(c[0]) + '</span>' +
           '<span class="val">' + escapar(c[1]) + '</span></div>';
  }).join('');

  return '<div class="sobre">' +
    '<div class="sobre-txt">' +
      '<p class="lead">Um tablet Android de 2015 virou painel de mesa.</p>' +
      '<p>O Mac reúne agenda, clima, mensagens, pull requests e o estado das ' +
      'sessões do Claude Code. O tablet só mostra. Tudo na rede local — ' +
      'nada sobe para lugar nenhum.</p>' +
      '<p class="repo">Código aberto em <b>github.com/dpiaia/painel-tablet</b></p>' +
    '</div>' +
    '<div class="sobre-creditos">' +
      '<div class="titulo-col">Créditos</div>' +
      creditos +
      '<p class="nota">As imagens são de seus autores e mantêm os termos de ' +
      'origem. O código é MIT.</p>' +
    '</div>' +
    '<div class="sobre-autor">' +
      '<div class="quem">Denis Piaia</div>' +
      '<div class="oque">design engineer</div>' +
      links +
    '</div>' +
  '</div>';
}

/* A tela do monitor: quem está comendo a máquina.
 *
 * Duas listas, não três. O cartão mostra CPU, memória e SWAP, mas swap POR
 * PROCESSO o macOS não entrega de um jeito barato — só o total do sistema. O
 * `footprint` traria a memória comprimida de um processo, mas pede privilégio
 * e demora, o que não cabe num laço de poucos segundos.
 *
 * Em vez de uma terceira coluna estimada a partir do RSS, a tela diz o que
 * sabe e o que não sabe. Número inventado num painel de diagnóstico é pior que
 * coluna ausente: você agiria em cima dele.
 */
function linhaProc(p, valor, classe, pct) {
  var largura = Math.max(2, Math.min(100, pct));   // 2% para a barra existir
  return '<div class="proc ' + (classe || '') + '">' +
           '<div class="proc-topo">' +
             '<span class="proc-val">' + valor + '</span>' +
             '<span class="proc-nome">' + escapar(p.nome) + '</span>' +
             '<span class="proc-pid">' + p.pid + '</span>' +
           '</div>' +
           '<div class="proc-barra"><span style="width:' + largura + '%"></span></div>' +
         '</div>';
}

function telaMaquina() {
  var m = estado.maquina || {};
  var ps = m.processos;
  if (!ps || !ps.cpu) {
    return '<div class="vazio">sem leitura da máquina</div>';
  }

  /* A barra da CPU é absoluta: 100% é um núcleo inteiro, e o que passa disso
   * (um processo com várias linhas de execução chega a 300%) enche a barra e
   * fica marcado em vermelho pelo próprio número. Encolher a escala para caber
   * o maior esconderia justamente o caso grave. */
  var cpu = ps.cpu.map(function (p) {
    return linhaProc(p, p.cpu.toFixed(1) + '%',
                     p.cpu >= 80 ? 'critico' : (p.cpu >= 40 ? 'atencao' : ''),
                     p.cpu);
  }).join('');

  /* A da memória é RELATIVA ao maior da lista, e o texto continua em MB. Não
   * existe "porcentagem de memória" que sirva aqui: sobre o total da máquina
   * todas as barras ficariam quase vazias (600 MB em 16 GB é 4%) e a
   * comparação — que é a pergunta real, quem está comendo mais — sumiria. A
   * barra compara; o número informa. */
  var maior = ps.memoria.reduce(function (m, p) {
    return Math.max(m, p.mem_mb); }, 1);
  var mem = ps.memoria.map(function (p) {
    var mb = p.mem_mb;
    var txt = mb >= 1024 ? (mb / 1024).toFixed(1) + ' GB' : mb + ' MB';
    return linhaProc(p, txt,
                     mb >= 4096 ? 'critico' : (mb >= 2048 ? 'atencao' : ''),
                     mb * 100 / maior);
  }).join('');

  // Uma caixa em coluna: o bloco de duas colunas toma o que sobra e a nota
  // fica embaixo. Sem ela, `.dividido` tem height:100% e empurra a nota para
  // fora do corte do .tela-corpo — some sem avisar.
  return '<div class="tela-proc">' +
    '<div class="dividido">' +
      '<div><div class="titulo-col">Mais CPU</div>' + cpu + '</div>' +
      '<div><div class="titulo-col">Mais memória</div>' + mem + '</div>' +
    '</div>' +
    '<div class="nota-proc">' +
      'A barra da CPU é sobre um núcleo (acima de 100% enche). A da memória ' +
      'compara com o maior da lista. Swap não aparece por processo: o macOS ' +
      'só informa o total do sistema — <b>' +
      (m.swap_gb === undefined ? '?' : m.swap_gb) + ' GB</b> agora. ' +
      ps.total + ' processos vistos.' +
    '</div>' +
  '</div>';
}


/* ---------------------------------------- monitor do Claude (tela expandida)
 *
 * O cartão mostra duas porcentagens; esta tela mostra o que elas estão
 * FAZENDO. "3%" sozinho não diz se a janela acabou de virar ou se está para
 * estourar, e é essa a pergunta de quem olha o painel antes de começar uma
 * tarefa longa.
 *
 * Nada aqui vem de fonte nova: é a mesma série que o cartão já lê, só que
 * inteira em vez do último ponto. O horário da janela é DERIVADO das quedas
 * dela — a janela de 5 horas começa quando você mandou a primeira mensagem,
 * não numa hora redonda, e o arquivo não guarda esse horário em lugar nenhum.
 * Sem queda na série, a tela diz que não sabe em vez de calcular para trás.
 */
function relogioDe(seg) {
  var d = new Date(seg * 1000);
  return dois(d.getHours()) + ':' + dois(d.getMinutes());
}

function duracao(seg) {
  var m = Math.max(0, Math.round(seg / 60));
  var h = Math.floor(m / 60);
  m = m % 60;
  if (h && m) return h + 'h ' + m + 'min';
  return h ? h + 'h' : m + 'min';
}

/* A curva das últimas 24 horas, em SVG escrito à mão.
 *
 * SVG e não canvas: o painel redesenha por innerHTML e o canvas exigiria
 * guardar um contexto e repintar fora do fluxo. E o SVG escala com o viewBox,
 * então a mesma marcação serve para o Tab E e para o iPad sem medir nada.
 *
 * O eixo Y é fixo em 0-100%, nunca ajustado ao maior valor: a pergunta é
 * "quanto do limite eu já gastei", e uma escala que se estica faria 12%
 * parecer cheio.
 */
function graficoUso(serie) {
  var L = 600, topo = 10, base = 150, pe = base + 16;
  var i, a;

  var pontos = [];
  for (i = 0; i < (serie || []).length; i++) {
    if (serie[i].fh !== null && serie[i].fh !== undefined) pontos.push(serie[i]);
  }
  if (pontos.length < 2) {
    return '<div class="uso-sem-curva">A série do dia ainda não tem dois ' +
           'pontos. O app do Claude só grava enquanto está aberto — com ele ' +
           'fechado, não há curva para desenhar.</div>';
  }

  var t0 = pontos[0].t, t1 = pontos[pontos.length - 1].t;
  var vao = Math.max(60, t1 - t0);
  function px(t) { return Math.round((t - t0) * L / vao * 10) / 10; }
  function py(p) { return Math.round((base - Math.min(100, p) / 100 * (base - topo)) * 10) / 10; }

  var linhaFh = [], areaFh = [], linhaSd = [], quedas = [], ant = null;
  for (i = 0; i < serie.length; i++) {
    a = serie[i];
    if (a.fh !== null && a.fh !== undefined) {
      linhaFh.push(px(a.t) + ',' + py(a.fh));
      if (ant !== null && a.fh < ant) quedas.push(px(a.t));
      ant = a.fh;
    }
    if (a.sd !== null && a.sd !== undefined) linhaSd.push(px(a.t) + ',' + py(a.sd));
  }
  areaFh = [px(t0) + ',' + base].concat(linhaFh, [px(t1) + ',' + base]);

  /* As viradas entram como traço vertical. São a única marca do gráfico que
     não é um valor: contam quantas vezes a janela recomeçou no dia, que é o
     jeito mais direto de ver "usei o dia todo" contra "usei uma vez". */
  var viradas = '';
  for (i = 0; i < quedas.length; i++) {
    viradas += '<line class="g-virada" x1="' + quedas[i] + '" y1="' + topo +
               '" x2="' + quedas[i] + '" y2="' + base + '"/>';
  }

  /* Só 50% e 100% ganham rótulo: o 0% cairia em cima da linha de base e da
     própria curva, que passa rente ao chão quase o dia inteiro. */
  var grade = '<line class="g-grade" x1="0" y1="' + base + '" x2="' + L + '" y2="' + base + '"/>';
  for (i = 1; i <= 2; i++) {
    var v = i * 50, y = py(v);
    grade += '<line class="g-grade" x1="0" y1="' + y + '" x2="' + L + '" y2="' + y + '"/>' +
             '<text class="g-eixo" x="' + (L - 2) + '" y="' + (y - 3) + '" text-anchor="end">' +
             v + '%</text>';
  }

  var horas = '';
  for (i = 0; i <= 4; i++) {
    var t = t0 + vao * i / 4;
    horas += '<text class="g-hora" x="' + px(t) + '" y="' + pe + '" text-anchor="' +
             (i === 0 ? 'start' : (i === 4 ? 'end' : 'middle')) + '">' +
             relogioDe(t) + '</text>';
  }

  return '<svg class="g-uso" viewBox="0 0 ' + L + ' ' + (pe + 4) + '">' +
           grade + viradas +
           '<polygon class="g-area" points="' + areaFh.join(' ') + '"/>' +
           '<polyline class="g-fh" points="' + linhaFh.join(' ') + '"/>' +
           (linhaSd.length > 1
             ? '<polyline class="g-sd" points="' + linhaSd.join(' ') + '"/>' : '') +
           horas +
         '</svg>' +
         '<div class="g-legenda">' +
           '<span class="g-chave fh">janela de 5 horas</span>' +
           '<span class="g-chave sd">semanal</span>' +
           (quedas.length
             ? '<span class="g-chave virada">' + quedas.length +
               (quedas.length === 1 ? ' virada' : ' viradas') + '</span>' : '') +
         '</div>';
}

function telaUso() {
  var u = estado.uso;
  if (!u || (u.cinco_horas === undefined && u.semanal === undefined)) {
    return '<div class="vazio">sem leitura do plano</div>';
  }

  function bloco(rot, pct, extra) {
    if (pct === undefined || pct === null) {
      return '<div class="titulo-col">' + rot + '</div>' +
             '<div class="uso-ausente">sem leitura</div>' + (extra || '');
    }
    var cls = nivel(pct, 75, 90);
    return '<div class="titulo-col">' + rot + '</div>' +
           '<div class="uso-grande ' + cls + '">' + pct + '<i>%</i></div>' +
           '<div class="uso-barra ' + cls + '"><span style="width:' +
             Math.min(100, pct) + '%"></span></div>' + (extra || '');
  }

  /* Quando fecha, e quanto falta. Só aparece se a série mostrou a virada. */
  var janela;
  if (u.virou_em) {
    var fim = u.virou_em + 5 * 3600;
    var resta = fim - agoraS();
    janela = '<div class="uso-quando">abriu <b>' + relogioDe(u.virou_em) +
             '</b> · fecha <b>' + relogioDe(fim) + '</b></div>' +
             (resta > 0
               ? '<div class="uso-resta">faltam ' + duracao(resta) + '</div>'
               : '<div class="uso-resta apagada">o fim já passou e a virada ' +
                 'seguinte não apareceu na série</div>');
  } else {
    janela = '<div class="uso-quando apagada">a série do dia não tem nenhuma ' +
             'virada, então não dá para dizer quando esta janela abriu</div>';
  }

  /* Fable e contexto não estão no arquivo — só chegam empurrados por uma
     sessão. Ausência declarada, nunca estimada. A classe `monitor-slide` é
     emprestada de propósito: são as mesmas linhas do cartão, com o mesmo
     desenho, e duas leituras do mesmo tipo não deveriam ter dois estilos. */
  var extras = '';
  if (u.fable !== undefined && u.fable !== null) {
    extras += linhaMac('FABLE', u.fable + '%', u.fable, nivel(u.fable, 75, 90));
  }
  if (u.contexto && u.contexto.pct !== undefined) {
    extras += linhaMac('CONTEXTO', u.contexto.pct + '%', u.contexto.pct,
                       nivel(u.contexto.pct, 80, 93));
  }
  extras = extras
    ? '<div class="monitor-slide uso-extras">' + extras + '</div>'
    : '<div class="uso-ausente">O semanal do Fable e o contexto da sessão não ' +
      'existem no arquivo do plano: aparecem só quando uma sessão do Claude ' +
      'Code os empurra para <b>/uso</b>.</div>';

  var idade = u.em ? Math.round((agoraS() - u.em) / 60) : null;
  var quando = idade === null ? 'sem horário'
             : (idade < 2 ? 'agora mesmo' : 'há ' + duracao(idade * 60));

  return '<div class="tela-uso">' +
    '<div class="dividido">' +
      '<div>' + bloco('Janela de 5 horas', u.cinco_horas, janela) + '</div>' +
      '<div>' + bloco('Semana · todos os modelos', u.semanal, extras) + '</div>' +
    '</div>' +
    '<div class="uso-curva">' +
      '<div class="titulo-col">Últimas 24 horas</div>' +
      graficoUso(u.historico) +
    '</div>' +
    '<div class="nota-proc">' +
      'Os números vêm do histórico que o app do Claude grava no Mac — última ' +
      'amostra <b>' + quando + '</b>, ' + (u.amostras || 0) + ' guardadas. ' +
      'O app só grava enquanto está aberto, e os horários da janela são ' +
      'deduzidos das quedas da curva: o arquivo não registra quando ela vira.' +
    '</div>' +
  '</div>';
}

var TELAS = {
  monitor: { titulo: 'Monitor do Mac · processos', render: telaMaquina },
  uso:    { titulo: 'Monitor do Claude · plano', render: telaUso },
  sobre:  { titulo: 'Sobre o painel',   render: telaSobre },
  clima:  { titulo: 'Clima da semana',  render: telaClima },
  agenda: { titulo: 'Agenda da semana', render: telaAgenda },
  claude: { titulo: 'Claude Code · GitHub', render: telaClaude }
};

function abrirTela(tipo) {
  var t = TELAS[tipo];
  if (!t) return;
  telaAberta = tipo;
  telaAte = Date.now() + T.tela * 1000;
  $('tela-titulo').textContent = t.titulo;
  $('tela-corpo').innerHTML = t.render();
  // Qual tela está aberta vira atributo: é assim que o Windows 95 e o XP
  // sabem apagar a própria moldura só nos créditos, onde o conteúdo já traz
  // duas janelas suas.
  $('tela').setAttribute('data-tela-tipo', tipo);
  $('tela').hidden = false;
  // Classe em vez de estilo embutido: assim um tema pode decidir o contrário.
  // No Windows 95 e no XP a tela vira uma janela, e a barra de tarefas tem que
  // continuar aparecendo atrás dela — estilo embutido não daria essa escolha.
  //
  // O painel some de verdade, não coberto: escondido, os gifs param de
  // decodificar; cobertos, continuariam gastando CPU atrás.
  document.documentElement.classList.add('tela-aberta');
}

function fecharTela() {
  if (!telaAberta) return;
  telaAberta = '';
  $('tela').hidden = true;
  $('tela-corpo').innerHTML = '';
  document.documentElement.classList.remove('tela-aberta');
  assinaturaClaude = '';   // força redesenhar os bichinhos ao voltar
  desenhar();
}

/* ------------------------------------------------------------ modo relógio
 *
 * Tocar no relógio esconde os cartões e deixa só a hora, grande, no meio.
 *
 * Ao contrário das telas de detalhe, este modo NÃO volta sozinho. Elas
 * respondem a uma curiosidade ("quero ver a semana") e devolvem o painel
 * depois de T.tela; este responde a uma decisão ("agora quero só a hora"), e
 * um painel que reaparece sozinho desfaz a decisão de quem pediu.
 */
var modoHora = false;

function entrarModoHora() {
  fecharMenu();   // a hora toma a tela inteira; o menu ficaria flutuando nela
  modoHora = true;
  document.documentElement.classList.add('modo-hora-on');
  $('modo-hora').hidden = false;
  tique();                       // preenche antes de aparecer, sem piscar --:--
  desenhar();
}

function sairModoHora() {
  modoHora = false;
  document.documentElement.classList.remove('modo-hora-on');
  $('modo-hora').hidden = true;
}

document.addEventListener('click', function (ev) {
  // O modo relógio vem antes de tudo: enquanto ele está ligado, o único
  // clique que importa é o que sai dele.
  if (modoHora) { sairModoHora(); return; }

  /* A ordem aqui é a ordem das camadas na tela, da mais de cima para a mais
   * de baixo. Escolher um tema tem que ser lido ANTES de "clique com algo
   * aberto fecha o que está aberto", senão o toque no tema só fecharia o
   * menu; e fechar o menu tem que vir antes da tela, porque o menu abre por
   * cima dela. */
  var btn = subirAte(ev.target, 'data-tema-slug');
  if (btn) { escolherTema(btn.getAttribute('data-tema-slug')); return; }

  if (menuAberto) { fecharMenu(); return; }
  if (telaAberta) { fecharTela(); return; }

  var alvo = ev.target;
  while (alvo && alvo !== document.body) {
    if (alvo.className && String(alvo.className).indexOf('relogio') >= 0) {
      entrarModoHora();
      return;
    }
    alvo = alvo.parentNode;
  }
  var config = subirAte(ev.target, 'data-menu');
  if (config) { abrirMenu(); return; }

  var aberto = subirAte(ev.target, 'data-tela');
  if (aberto) abrirTela(aberto.getAttribute('data-tela'));
});

// Sobe do que foi tocado até quem carrega o atributo. O dedo acerta o texto
// ou o ícone dentro do botão, quase nunca o botão.
function subirAte(el, atributo) {
  while (el && el !== document.body) {
    if (el.getAttribute && el.getAttribute(atributo)) return el;
    el = el.parentNode;
  }
  return null;
}

/* ================================================================ ajustes */
// O que o painel de controle define chega pelo mesmo SSE do resto. Aplicar é
// barato — variáveis CSS e display — então roda a cada atualização sem dó.
var assinaturaAjustes = '';

function aplicarAjustes() {
  var a = estado.ajustes;
  if (!a) return;

  var nova = JSON.stringify(a);
  if (nova === assinaturaAjustes) return;
  assinaturaAjustes = nova;

  // --- tempos: o resto do código lê de T, então basta sobrescrever
  if (a.tempos) {
    for (var k in a.tempos) {
      var v = +a.tempos[k];
      if (v > 0) T[k] = v;
    }
  }

  // --- tema: veste a folha (canto, moldura, fonte, traço do ícone). A cor
  //     não vem daqui — vem logo abaixo, como estilo inline, que ganha de
  //     qualquer seletor. Assim trocar de tema não apaga uma cor escolhida a
  //     dedo, e mexer numa cor não desmancha a forma.
  document.documentElement.setAttribute('data-tema', a.tema || 'escuro');
  // O tema muda a altura útil do cartão (o 95 troca borda por relevo, o Apple
  // tem canto largo), então a conta de quantas linhas cabem tem que ser
  // refeita — e ela não roda sozinha, porque o conteúdo não mudou.
  setTimeout(function () { hostsSlide.forEach(function (h) { ajustarListas(h.slider.palco); });
  ajustarListas(sliderMsg.palco); }, 60);
  agendarTremor();

  // --- cores: a folha inteira usa variáveis, então trocar a variável troca
  //     tudo que depende dela. Nenhum seletor precisa saber disso.
  if (a.cores) {
    var raiz = document.documentElement.style;
    for (var c in a.cores) raiz.setProperty('--' + c, a.cores[c]);
  }

  // --- cartões ligados
  var ordem = a.ordem || [];
  var cartoes = a.cartoes || {};
  var todos = document.querySelectorAll('[data-cartao]');
  for (var i = 0; i < todos.length; i++) {
    var el = todos[i];
    el.hidden = cartoes[el.getAttribute('data-cartao')] === false;
  }

  // A ordem agora é o LAYOUT: montarLayout() põe cada widget no lugar, e o
  // truque antigo de `order` no CSS brigaria com ele — dois donos da mesma
  // decisão, e o que perdesse deixaria a tela embaralhada de um jeito difícil
  // de explicar.

  // --- clima em meia largura quando divide a linha com o recado
  //
  // Sem container queries (Chrome 64 não tem), quem sabe que o cartão ficou
  // estreito é o JS: se os dois estão ligados, o clima muda de arranjo e os
  // detalhes descem para uma faixa embaixo em vez de disputar a direita.
  var clima = document.querySelector('[data-cartao="clima"]');
  if (clima) {
    // Antes isto perguntava se o recado estava ligado. Agora a pergunta certa é
    // se o clima está DIVIDINDO a linha — ele pode estar pareado com o monitor,
    // ou sozinho com o recado em outra coluna.
    var dividindo = !!(clima.parentNode && clima.parentNode.className &&
                       clima.parentNode.className.indexOf('dupla') >= 0);
    clima.className = clima.className.replace(/ ?estreito/, '') + (dividindo ? ' estreito' : '');
  }

  /* --- papel de parede, por tema
   *
   * O véu por cima da imagem acompanha o BRILHO do tema, não uma cor fixa:
   * preto nos temas escuros, branco nos claros. Sem ele o relógio e a barra do
   * topo, que ficam fora dos cartões, sumiriam sobre uma foto clara — e um véu
   * preto num tema claro deixaria a tela suja.
   */
  var fundo = (a.fundos || {})[a.tema || 'escuro'];
  var corpo = document.body;
  if (fundo) {
    var v = veu(((a.cores || {}).fundo) || '#000000', a.tema);
    corpo.style.backgroundImage =
      'linear-gradient(' + v + ',' + v + '), url("fundos/' +
      encodeURIComponent(fundo) + '")';
    corpo.style.backgroundSize = 'cover';
    corpo.style.backgroundPosition = 'center';
    corpo.style.backgroundRepeat = 'no-repeat';
  } else {
    corpo.style.backgroundImage = '';
  }

  // --- nome no topo
  //
  // Só o pedaço antes do "OS" é seu. Mexo no primeiro nó de TEXTO em vez de no
  // innerHTML do elemento: o <span> do "OS" fica de pé, com a cor de destaque
  // que ele já tem, sem precisar remontar nada.
  // .marca é CLASSE, não id — $() é getElementById e devolvia nulo, pulando o
  // bloco inteiro sem erro nenhum. O nome ficava eternamente em PIAIA OS.
  // O nome tem elemento próprio. Antes eu mexia no primeiro nó de texto do
  // .marca, o que funcionava só enquanto ele era o primeiro — e no Windows o
  // logo entra ANTES dele, dentro do botão Iniciar.
  var nomeEl = $('marca-nome'), fim = $('marca-fim');
  if (nomeEl) {
    var nome = (a.marca === undefined || a.marca === null) ? 'PIAIA' : a.marca;
    if (nomeEl.textContent !== nome) nomeEl.textContent = nome;
  }
  if (fim) {
    var suf = sufixoDe(a.tema);
    if (fim.innerHTML !== suf) fim.innerHTML = suf;
  }

  // --- selo do tema, na ponta direita da barra
  //
  // Mesmo inventário de web/marcas/ que o sufixo usa, com outro sufixo de
  // arquivo: <slug>.png fica colado no nome, <slug>-topo.png ancora o canto.
  // Sem o arquivo, some — nada quebra num tema que não tem selo.
  var seloTema = $('selo-tema');
  if (seloTema) {
    var arq = (a.tema || '') + '-topo.png';
    var tem = (estado.marcas || []).indexOf(arq) >= 0;
    seloTema.hidden = !tem;
    if (tem && seloTema.getAttribute('src') !== 'marcas/' + arq) {
      seloTema.src = 'marcas/' + arq;
    }

    // No Windows o logo mora DENTRO do botão Iniciar, à esquerda do nome. Nos
    // outros temas ele é um selo de canto. É a única coisa aqui que muda de
    // lugar no DOM por causa do tema — CSS move aparência, não elemento.
    // No Windows o logo entra no botão Iniciar; no Apple ele vai na frente do
    // nome, como a maçã da barra de menus do macOS. Nos dois casos o destino é
    // o mesmo elemento — muda só a aparência, no CSS.
    var noBotao = (a.tema === 'win95' || a.tema === 'xp' || a.tema === 'apple');
    var marcaEl = document.querySelector('.marca');
    var ondeDeveria = noBotao ? marcaEl : $('topo-barra');
    if (ondeDeveria && seloTema.parentNode !== ondeDeveria) {
      if (noBotao) marcaEl.insertBefore(seloTema, marcaEl.firstChild);
      else ondeDeveria.appendChild(seloTema);
    }
  }

  // --- recado
  //
  // As cores do cartão são escritas como VARIÁVEIS no próprio elemento, e não
  // como `color` em cada pedaço. Variável é herdada, então o título, o traço
  // do ícone e o texto seguem sozinhos — eles já leem --texto e --ciano. Uma
  // linha aqui alcança tudo lá dentro, e um pedaço novo no cartão nasce com a
  // cor certa sem que ninguém precise lembrar disso.
  var r = a.recado || {};
  var t = $('recado-titulo'), x = $('recado-texto');
  if (t) t.textContent = (r.titulo || 'RECADO');
  if (x) x.textContent = r.texto || '';

  var cartaoRecado = document.querySelector('[data-cartao="recado"]');
  if (cartaoRecado) {
    var noMatrix = (a.tema === 'matrix');
    var paleta = (noMatrix ? CORES_RECADO_MATRIX : CORES_RECADO)[r.cor] || null;
    var est = cartaoRecado.style;
    // A textura é do CSS e entra por background-IMAGE. Por isso aqui vai
    // backgroundColor e não o atalho `background`: o atalho zera a imagem
    // junto, e a trama sumiria no instante em que a cor fosse aplicada.
    if (noMatrix && r.cor) cartaoRecado.setAttribute('data-textura', r.cor);
    else cartaoRecado.removeAttribute('data-textura');
    if (paleta) {
      est.backgroundColor = paleta.fundo;
      est.borderColor = paleta.borda;
      est.setProperty('--texto', paleta.texto);
      est.setProperty('--apagado', paleta.fraco);
      est.setProperty('--ciano', paleta.texto);
    } else {
      // Volta ao tema: remover é diferente de escrever o valor padrão. Se eu
      // escrevesse, o cartão ficaria preso naquela cor quando você trocasse
      // de tema, enquanto todos os outros mudariam.
      est.backgroundColor = '';
      est.borderColor = '';
      est.removeProperty('--texto');
      est.removeProperty('--apagado');
      est.removeProperty('--ciano');
    }
  }

  // Tempos novos podem mudar o que já está desenhado (uma sessão que passa a
  // caber, um slide que some): força o redesenho na próxima passada.
  assinaturaClaude = '';
  sliderMsg.assinatura = '';
  hostsSlide.forEach(function (h) { h.slider.assinatura = ''; });
  ultimoMinuto = -1;
}

/* ================================================================= desenho */
function desenhar() {
  // O layout PRIMEIRO. aplicarAjustes pergunta onde cada cartão está (o clima
  // só encolhe se estiver dividindo a linha), e na carga inicial ele ainda
  // estava no estoque — dava um piscar do arranjo largo antes de assentar.
  montarLayout((estado.ajustes || {}).layout);
  aplicarAjustes();
  desenharSistema();
  desenharClima();
  desenharAgenda();
  desenharSlides();
  desenharMensagens();
}

/* ================================================================ conexão */
/* ------------------------------------------------------------------ cenas
 *
 * A tela inteira por alguns segundos, quando acontece algo que vale
 * interromper: uma tarefa do Claude terminou, chegou um pull request para
 * revisar, o status de um PR seu mudou, o CI virou.
 *
 * Três regras evitam que isto vire ruído — e as três já foram necessárias:
 *
 *  - na primeira mensagem do SSE só se ANOTA o que já existe, sem encenar.
 *    Sem isso a tela encenaria tudo a cada recarregamento, e ela recarrega
 *    sozinha quando o código muda no Mac.
 *
 *  - fato com mais de 30 s não vira cena. Reconexão, servidor reiniciado ou
 *    tablet que acabou de acordar trazem o mesmo estado de volta, e uma cena
 *    atrasada faz você procurar na tela uma coisa que já passou.
 *
 *  - no máximo 3 na fila. Se a busca do GitHub falhar e voltar, tudo parece
 *    novo de uma vez; sem teto, a tela ficaria minutos sequestrada.
 */
var TETO_FILA = 3;
var filaCena = [];
var cenaAtiva = false;
var relogiosCena = [];

// As cores semânticas do próprio GitHub, e não os tokens do tema. O --laranja
// do tema Escuro é um âmbar claro: ótimo para um selo de 10px, ilegível como
// fundo de tela cheia com texto branco. Estas cinco seguram texto branco.
var COR_GIT = {
  azul:     '#1f6feb',
  verde:    '#1a7f37',
  vermelho: '#cf222e',
  amarelo:  '#9a6700',
  cinza:    '#57606a'
};

/* ---------------------------------------------------- gatilho: Claude Code */
var festejadas = null;

function chaveSessao(s) { return s.transcricao || s.rotulo || s.projeto || '?'; }

function conferirFesta() {
  var lista = ((estado.claude || {}).sessoes) || [];
  var concluidas = {};
  for (var i = 0; i < lista.length; i++) {
    if (lista[i].estado === 'pronto') concluidas[chaveSessao(lista[i])] = lista[i].em;
  }

  if (festejadas === null) { festejadas = concluidas; return; }

  for (var i = 0; i < lista.length; i++) {
    var s = lista[i];
    if (s.estado !== 'pronto') continue;
    var k = chaveSessao(s);
    if (festejadas[k] === s.em) continue;          // já vista, mesma conclusão
    if ((agoraS() - s.em) > 30) continue;          // velha demais para encenar
    enfileirar({
      cor: '#d97757',
      figura: 'clawd',
      rotulo: 'FINALIZADO',
      nome: s.rotulo || s.projeto || 'Tarefa concluída',
      intro: ENTRA_TEXTO,
      espera: T.festa
    });
  }
  festejadas = concluidas;
}

/* --------------------------------------------------------- gatilho: GitHub */
var vistosGit = null;
var vistosMerge = null;

function chavePR(p) { return p.repo + '#' + p.numero; }

/* ------------------------------------------------------ octocats do Octodex
 *
 * A pasta web/octodex/ é opcional (fica fora do git: é arte da GitHub). O
 * servidor manda a lista do que existe; sem nada, tudo abaixo devolve '' e o
 * painel volta ao mascote próprio, sem quebrar.
 *
 * O cartão e a cena seguem regras diferentes, e a diferença é medida: um gif
 * animado custa cerca de um terço de um núcleo neste tablet. Na cena, que dura
 * quatro segundos, isso não se sente. No cartão, que fica a tela inteira do
 * dia, seria um terço de núcleo queimando para sempre — por isso ali só entram
 * os estáticos.
 */
function listaOctodex(comAnimados) {
  var todos = estado.octodex || [];
  if (comAnimados) return todos;
  var estaticos = [];
  for (var i = 0; i < todos.length; i++) {
    if (!/\.gif$/i.test(todos[i])) estaticos.push(todos[i]);
  }
  return estaticos;
}

// Estável entre redesenhos, e troca a cada meia hora. Sortear aqui faria a
// figura piscar várias vezes por minuto, porque o cartão se redesenha a cada
// mensagem do SSE.
function octocatDoCartao() {
  var lista = listaOctodex(false);
  if (!lista.length) return '';
  var fatia = Math.floor((Date.now() + deslocamento) / 1800000);
  return 'octodex/' + lista[fatia % lista.length];
}

// Aqui sim, sorteio a cada cena: é o que faz valer a brincadeira.
function octocatDaCena() {
  var lista = listaOctodex(true);
  if (!lista.length) return '';
  return 'octodex/' + lista[Math.floor(Math.random() * lista.length)];
}

function cenaGit(cor, rotulo, p) {
  enfileirar({
    cor: COR_GIT[cor] || COR_GIT.azul,
    figura: 'git',
    rotulo: rotulo,
    nome: '#' + p.numero + ' ' + p.titulo,
    foto: octocatDaCena(),
    intro: 700,          // o gato não tem roteiro; o texto entra quase junto
    espera: T.cenagit
  });
}

function conferirGit() {
  var g = estado.git || {};
  var meus = g.meus || [];
  var design = g.design || [];

  // Busca falhando devolve listas vazias. Se eu anotasse esse vazio como
  // baseline, tudo pareceria novo quando ela voltasse.
  if (g.erro || (!meus.length && !design.length)) return;

  var agora = {};
  var i;
  for (i = 0; i < meus.length; i++) {
    agora[chavePR(meus[i])] = { revisao: meus[i].revisao, ci: meus[i].ci, meu: true };
  }
  for (i = 0; i < design.length; i++) {
    var k = chavePR(design[i]);
    if (!agora[k]) agora[k] = { revisao: design[i].revisao, ci: design[i].ci, meu: false };
  }

  /* Mesclados: um merge some do "is:open", e sumir não é um evento — por isso
   * o servidor traz uma quarta lista com os seus PRs já mesclados. O que
   * aparece nela e não estava antes acabou de ser mesclado.
   *
   * A lista vem ordenada por atualização, então um PR antigo pode voltar ao
   * topo só porque alguém comentou nele. Por isso o mergedAt também precisa
   * ser recente: sem essa checagem, comentário em PR de semana passada viraria
   * comemoração.
   */
  var mesclados = g.mesclados || [];
  var agoraMerge = {};
  for (i = 0; i < mesclados.length; i++) agoraMerge[chavePR(mesclados[i])] = 1;

  if (vistosMerge === null) { vistosMerge = agoraMerge; }
  else {
    for (i = 0; i < mesclados.length; i++) {
      var m = mesclados[i];
      if (vistosMerge[chavePR(m)]) continue;
      var quando = Date.parse(m.mesclado_em || '');
      if (!quando || (Date.now() + deslocamento - quando) > 3600000) continue;
      cenaGit('verde', 'MESCLADO', m);
    }
    vistosMerge = agoraMerge;
  }

  if (vistosGit === null) { vistosGit = agora; return; }

  // PR novo no repositório de design, de outra pessoa, esperando revisão.
  for (i = 0; i < design.length; i++) {
    var d = design[i];
    if (vistosGit[chavePR(d)]) continue;
    if (d.autor === g.eu || d.rascunho || d.revisao === 'APPROVED') continue;
    cenaGit('azul', 'A REVISAR', d);
  }

  // Meus PRs: mudança de status e virada do CI. Só os meus — um PR alheio
  // mudando de status é assunto de outra pessoa.
  for (i = 0; i < meus.length; i++) {
    var p = meus[i];
    var antes = vistosGit[chavePR(p)];
    if (!antes) continue;                      // PR recém-aberto por mim não é notícia

    if (antes.revisao !== p.revisao) {
      var r = rotuloRevisao(p, true);
      cenaGit(r.cor, r.txt, p);
    }
    if (antes.ci !== p.ci) {
      if (p.ci === 'SUCCESS') cenaGit('verde', 'CI PASSOU', p);
      else if (p.ci === 'FAILURE' || p.ci === 'ERROR') cenaGit('vermelho', 'CI QUEBROU', p);
    }
  }

  vistosGit = agora;
}

/* -------------------------------------------------------- gatilho: agenda */
/* Este é o único gatilho que não vem de um fato novo no servidor: nada muda
 * no estado, é o relógio que anda. Por isso ele roda no tique de cada
 * segundo, e não na chegada do SSE.
 *
 * O que já foi avisado fica no localStorage, não só na memória. Com a página
 * se recarregando sozinha quando o código muda, guardar só em memória faria
 * a tela avisar de novo da mesma reunião — e a janela de 3 minutos é
 * justamente quando isso mais atrapalharia.
 */
var avisados = null;

function chaveEvento(e) { return (e.inicio || '') + '|' + (e.titulo || ''); }

function lerAvisados() {
  try { return JSON.parse(localStorage.getItem('painel-avisados') || '{}'); }
  catch (e) { return {}; }          // navegação privada, cota cheia, WebView sem storage
}

function gravarAvisados(mapa) {
  try { localStorage.setItem('painel-avisados', JSON.stringify(mapa)); }
  catch (e) {}                      // sem storage o aviso ainda funciona, só não sobrevive ao reload
}

function conferirAgenda() {
  var itens = ((estado.agenda || {}).itens) || [];
  if (!itens.length) return;
  if (avisados === null) avisados = lerAvisados();

  var agora = agoraS();
  var janela = Math.max(1, T.antecedencia) * 60;
  var mudou = false;

  for (var i = 0; i < itens.length; i++) {
    var e = itens[i];
    // Evento de dia inteiro não "começa" numa hora: avisar dele seria avisar
    // à meia-noite de uma coisa que dura o dia.
    if (e.dia_inteiro || !e.inicio_ts) continue;

    var falta = e.inicio_ts - agora;
    if (falta <= 0 || falta > janela) continue;

    var k = chaveEvento(e);
    if (avisados[k]) continue;
    avisados[k] = agora;
    mudou = true;

    var min = Math.max(1, Math.round(falta / 60));
    enfileirar({
      cor: '#5e35b1',
      figura: 'relogio',
      rotulo: 'COMEÇA EM ' + min + (min === 1 ? ' MINUTO' : ' MINUTOS'),
      nome: e.titulo || 'Compromisso',
      hora_ts: e.inicio_ts,
      intro: 700,
      espera: T.cenaagenda
    });
  }

  // Poda: sem isso o localStorage cresceria para sempre. Meio dia é folgado
  // para qualquer compromisso já ter acontecido.
  for (var k2 in avisados) {
    if (agora - avisados[k2] > 43200) { delete avisados[k2]; mudou = true; }
  }
  if (mudou) gravarAvisados(avisados);
}

function conferirCenas() {
  conferirFesta();
  conferirGit();
  proximaCena();
}

/* ------------------------------------------------------------ encenação */
/* O roteiro do Clawd. Tempos em milissegundos desde o começo.
 *
 * Corte seco entre os olhares: é pixel art, e transição suave entre dois
 * olhos vira borrão. O texto só entra depois dos óculos — antes disso a cena
 * é do bichinho, e nome de projeto competindo com ele estraga as duas coisas.
 */
var ROTEIRO = [
  [0,    'frente'],
  [700,  'esquerda'],
  [1300, 'direita'],
  [1900, 'frente'],
  [2350, 'pisca'],
  [2800, 'frente'],
  [3050, 'oculos']
];
var ENTRA_TEXTO = 3300;

function fase(nome) {
  var gs = document.querySelectorAll('.festa-clawd .olhos');
  for (var i = 0; i < gs.length; i++) {
    gs[i].setAttribute('class',
      'olhos' + (gs[i].getAttribute('data-fase') === nome ? ' ativa' : ''));
  }
}

// O confete é montado uma vez e fica guardado: recriar 22 nós a cada cena
// custaria layout justo no quadro em que a tela acende.
function montarConfete() {
  var caixa = $('festa-confete');
  if (caixa.childNodes.length) return;
  var html = '';
  for (var i = 0; i < 22; i++) {
    var lado = (0.5 + Math.random() * 0.7).toFixed(2);       // vw
    var dur = (2.6 + Math.random() * 2.2).toFixed(2);
    var atraso = (-Math.random() * dur).toFixed(2);          // já caindo ao abrir
    html += '<i style="left:' + (Math.random() * 100).toFixed(1) + '%;' +
            'width:' + lado + 'vw;height:' + lado + 'vw;' +
            'animation:cair ' + dur + 's linear ' + atraso + 's infinite;' +
            '-webkit-animation:cair ' + dur + 's linear ' + atraso + 's infinite;' +
            '"></i>';
  }
  caixa.innerHTML = html;
}

function enfileirar(cena) {
  if (filaCena.length >= TETO_FILA) return;
  filaCena.push(cena);
}

function proximaCena() {
  // Uma de cada vez: dois fatos juntos viram duas cenas em fila, não uma
  // sobre a outra.
  if (cenaAtiva || !filaCena.length) return;
  var c = filaCena.shift();
  cenaAtiva = true;

  for (var i = 0; i < relogiosCena.length; i++) clearTimeout(relogiosCena[i]);
  relogiosCena = [];

  var el = $('festa');
  var texto = $('festa-texto');
  var clawd = document.querySelector('.festa-clawd');
  var git = $('festa-git');
  var relogio = $('festa-relogio');
  var foto = $('festa-foto');

  el.style.background = c.cor;
  $('festa-nome').textContent = c.nome;
  $('festa-rot').textContent = c.rotulo;
  var invertido = c.figura === 'clawd' ? '' : ' invertido';
  texto.className = 'festa-texto' + invertido;

  var ehClawd = c.figura === 'clawd';
  clawd.style.display = ehClawd ? '' : 'none';
  // Com octocat baixado ele entra no lugar da marca; sem, a marca fica.
  var comFoto = c.figura === 'git' && c.foto;
  foto.removeAttribute('hidden');
  foto.style.display = comFoto ? '' : 'none';
  if (comFoto) foto.src = c.foto;

  git.removeAttribute('hidden');
  git.style.display = (c.figura === 'git' && !comFoto) ? '' : 'none';
  relogio.removeAttribute('hidden');
  relogio.style.display = c.figura === 'relogio' ? '' : 'none';
  $('festa-confete').style.display = ehClawd ? '' : 'none';

  // Os ponteiros marcam a hora da reunião. 30 graus por hora, 6 por minuto, e
  // o das horas anda junto com os minutos — senão às 10h55 ele apontaria o 10
  // cravado, que é errado e a gente percebe sem saber por quê.
  if (c.figura === 'relogio' && c.hora_ts) {
    var d2 = new Date(c.hora_ts * 1000);
    var m = d2.getMinutes();
    $('ponteiro-h').setAttribute('transform',
      'rotate(' + ((d2.getHours() % 12) * 30 + m * 0.5) + ' 24 24)');
    $('ponteiro-m').setAttribute('transform', 'rotate(' + (m * 6) + ' 24 24)');
  }

  if (ehClawd) { montarConfete(); fase('frente'); }

  el.hidden = false;
  void el.offsetWidth;          // força o layout: sem isso a transição não roda
  el.className = 'festa ver';

  if (ehClawd) {
    ROTEIRO.forEach(function (passo) {
      if (!passo[0]) return;
      relogiosCena.push(setTimeout(function () { fase(passo[1]); }, passo[0]));
    });
  }

  relogiosCena.push(setTimeout(function () {
    texto.className = 'festa-texto ver' + invertido;
  }, c.intro));

  // A espera conta a partir da cena final: o nome aparece e fica parado esses
  // segundos. O teatro antes dele não entra na conta.
  relogiosCena.push(setTimeout(function () {
    el.className = 'festa';
    relogiosCena.push(setTimeout(function () {
      el.hidden = true;
      cenaAtiva = false;
      proximaCena();
    }, 420));
  }, c.intro + Math.max(1, c.espera) * 1000));
}


/* O glitch do Matrix: um tranco de 120ms a cada 18-50 segundos.
 *
 * Por temporizador e não por animação CSS infinita. Uma animação de 30
 * segundos em que 29 não têm movimento nenhum ainda faz a GPU compor um quadro
 * por vez o tempo todo — num Mali-400 isso é custo permanente para um efeito
 * que aparece uma vez por minuto. Com temporizador, o custo existe só nos
 * 120ms em que a tela treme.
 *
 * Intervalo sorteado: em cadência fixa o olho aprende o ritmo e o defeito
 * deixa de parecer defeito.
 */
var relogioTremor = null;

function agendarTremor() {
  clearTimeout(relogioTremor);
  if (document.documentElement.getAttribute('data-tema') !== 'matrix') {
    document.documentElement.classList.remove('tremendo');
    return;
  }
  relogioTremor = setTimeout(function () {
    var raiz = document.documentElement;
    raiz.classList.add('tremendo');
    setTimeout(function () { raiz.classList.remove('tremendo'); }, 120);
    agendarTremor();
  }, 18000 + Math.random() * 32000);
}


function conectar() {
  var fonte = new EventSource('/events');

  fonte.onmessage = function (ev) {
    ultimoSinal = Date.now();
    try { estado = JSON.parse(ev.data); } catch (e) { return; }

    // O código mudou no Mac: a própria página se recarrega.
    //
    // Ajuste de cor ou de tempo viaja pelo SSE e vale na hora, mas mudança de
    // HTML ou CSS não — o tablet ficava com a versão velha até alguém ir até
    // lá e recarregar. Isto fecha o buraco: não precisa de adb, nem da API do
    // quiosque, nem de encostar no aparelho.
    if (estado.versao_web) {
      if (!versaoWeb) versaoWeb = estado.versao_web;
      else if (versaoWeb !== estado.versao_web) {
        // Endereço novo, e não location.reload(): o WebView do quiosque relê
        // do próprio cache e ignora Cache-Control, então a página voltava
        // idêntica sem nem tocar no servidor — recarregava e continuava
        // velha, em silêncio. Uma URL que o cache nunca viu ele é obrigado a
        // buscar.
        location.replace(location.pathname + '?r=' + Date.now());
        return;
      }
    }
    if (estado.servidor_ts) deslocamento = estado.servidor_ts * 1000 - Date.now();
    ultimoMinuto = -1;
    desenhar();
    tique();
    conferirCenas();
  };

  // Batimento: não traz dado, só prova que o Mac continua respirando.
  fonte.addEventListener('ping', function () { ultimoSinal = Date.now(); });

  fonte.onerror = function () {
    $('selo').className = 'selo off';   // o EventSource reconecta sozinho
  };
}

// Virar o tablet, mudar a janela no Mac: a altura do cartão muda e a conta de
// quantas linhas cabem precisa ser refeita.
window.addEventListener('resize', function () {
  hostsSlide.forEach(function (h) { ajustarListas(h.slider.palco); });
  ajustarListas(sliderMsg.palco);
});

/* O WebView 64 do Tab E não tem backdrop-filter. No Mac e no iPad o cartão de
 * vidro desfoca a foto atrás e o texto pousa num borrão uniforme; lá ele
 * pousaria na foto crua, e sobre um trecho escuro isso vira texto ilegível.
 *
 * Detectar e marcar a raiz deixa o CSS decidir: onde há desfoque, vidro de
 * verdade; onde não há, um cartão mais fechado. É a mesma ideia do véu — o
 * efeito é bem-vindo, a legibilidade não é negociável.
 */
(function () {
  var tem = window.CSS && CSS.supports &&
            (CSS.supports('backdrop-filter', 'blur(1px)') ||
             CSS.supports('-webkit-backdrop-filter', 'blur(1px)'));
  if (!tem) document.documentElement.classList.add('sem-desfoque');
})();

ultimoSinal = Date.now();
carregarTemas();
conectar();
tique();
setInterval(tique, 1000);
