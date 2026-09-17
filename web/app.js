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
function hhmm(ts) {
  var d = new Date(ts * 1000);
  return dois(d.getHours()) + ':' + dois(d.getMinutes());
}

/* ================================================================ relógio */
function tique() {
  var d = new Date(Date.now() + deslocamento);
  var hora = dois(d.getHours()) + ':' + dois(d.getMinutes());
  if ($('hora').textContent !== hora) $('hora').textContent = hora;

  var dia = DIAS[d.getDay()];
  $('data').textContent = dia.charAt(0).toUpperCase() + dia.slice(1) + ', ' +
                          d.getDate() + ' de ' + MESES[d.getMonth()];

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
  sliderClaude.girar();
  desenharClaude();   // barato: só refaz o DOM quando a assinatura muda

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

/* =========================================================== saúde do Mac */
function nivel(valor, atencao, critico) {
  if (valor >= critico) return 'critico';
  if (valor >= atencao) return 'atencao';
  return '';
}

function metrica(rotulo, texto, classe) {
  return '<span class="m ' + classe + '">' + rotulo + ' <b>' + texto + '</b></span>';
}

function desenharMaquina() {
  var m = estado.maquina;
  if (!m) { $('mac').innerHTML = ''; return; }

  // O swap é o número que importa: no macOS "memória livre" baixa é normal,
  // mas swap crescendo significa que a máquina já está paginando para o disco.
  var livre = m.swap_total_gb - m.swap_gb;
  var nivelSwap = livre < 1 ? 'critico' : (m.swap_gb >= 2 ? 'atencao' : '');

  $('mac').innerHTML =
    '<span class="rot">MAC</span>' +
    metrica('CPU', m.cpu + '%', nivel(m.cpu, 85, 95)) +
    metrica('MEM', m.ram + '%', nivel(m.ram, 85, 92)) +
    metrica('SWAP', m.swap_gb + 'G', nivelSwap) +
    '<span class="div">|</span>';
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
  document.querySelector('.agenda').className = 'cartao agenda' + (curta ? ' sozinho' : '');
}

function desenharAgenda() {
  var a = estado.agenda;
  if (!a) { $('destaque').innerHTML = '<div class="vazio">carregando…</div>'; return; }

  var agora = agoraS();
  var meiaNoite = new Date(Date.now() + deslocamento);
  meiaNoite.setHours(0, 0, 0, 0);
  var hojeISO = meiaNoite.getFullYear() + '-' + dois(meiaNoite.getMonth() + 1) +
                '-' + dois(meiaNoite.getDate());

  // Dia inteiro ("Casa", férias) vira etiqueta ao lado da data: continua
  // visível sem ocupar uma linha da agenda, que é espaço nobre.
  var marcas = '';
  var comHora = [];
  (a.itens || []).forEach(function (e) {
    if (e.dia_inteiro) {
      if (e.inicio <= hojeISO && hojeISO < e.fim) {
        marcas += '<span class="marca-dia">' + escapar(e.titulo) + '</span>';
      }
    } else if (e.fim_ts > agora) {
      comHora.push(e);            // só o que ainda não acabou
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
function relevantes(sessoes, agora) {
  return sessoes.filter(function (s) {
    if (s.estado !== 'pronto') return true;
    return (agora - s.em) <= T.pronto;
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

var ICONE_CLAUDE = '<svg class="ic" viewBox="0 0 24 24"><path d="M9 7l-5 5 5 5M15 7l5 5-5 5"/></svg>';
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
  var MOSTRA = 3;   // com o texto maior, mais que isso não cabe no cartão
  // Lista vazia com contato: não há nada pendente, e isso é uma boa notícia —
  // vale mostrar com cara de boa notícia. SEM contato é outra coisa: aí a lista
  // está vazia porque estamos cegos, e dizer "tudo ok" seria justamente o tipo
  // de mentira tranquilizadora que este painel evita em todo lugar.
  var corpo = ordenada.length
    ? ordenada.slice(0, MOSTRA).map(function (p) { return linhaPR(p, mostrarRepo, eu); }).join('')
    : (erro ? '<div class="pr-vazio">' + vazio + '</div>'
            : '<div class="tudo-ok"><img src="tudo-ok.svg" alt="">' +
              '<p>Tudo ok por aqui</p></div>');
  corpo += rodapeMais(ordenada.length - MOSTRA, 'pull request', 'pull requests');
  return { classe: 'lista-slide', titulo: titulo, icone: ICONE_GITHUB,
           selo: erro ? 'SEM CONTATO' : 'ONLINE', html: corpo };
}

function desenharClaude() {
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

  var slides = [{ classe: '', titulo: 'CLAUDE CODE', icone: ICONE_CLAUDE,
                  selo: selo, html: bichos }];

  // ---- slides 2 e 3: o GitHub, quando houver
  var g = estado.git;
  if (g) {
    slides.push(slidePRs('GITHUB - MEUS PULL REQUESTS', g.meus || [], true,
                         'nenhum PR seu aberto', g.eu, g.erro));
    slides.push(slidePRs('GITHUB - REPO DESIGN', g.design || [], false,
                         'nada aberto no repositório', g.eu, g.erro));
  }

  sliderClaude.atualizar(slides);
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

function desenharMaquina() {
  var m = estado.maquina;
  if (!m) { $('corpo-mac').innerHTML = '<div class="vazio">sem leitura</div>'; return; }

  // O swap fica, mesmo não estando no mockup: é ele que avisa que a máquina
  // vai engasgar. CPU e memória altas são rotina; swap cheio não é.
  var livre = m.swap_total_gb - m.swap_gb;
  var nivelSwap = livre < 1 ? 'critico' : (m.swap_gb >= 2 ? 'atencao' : '');
  var pctSwap = m.swap_total_gb ? (m.swap_gb / m.swap_total_gb * 100) : 0;

  $('corpo-mac').innerHTML =
    linhaMac('CPU', m.cpu + '%', m.cpu, nivel(m.cpu, 85, 95)) +
    linhaMac('MEM', m.ram + '%', m.ram, nivel(m.ram, 85, 92)) +
    linhaMac('SWAP', m.swap_gb + 'G', pctSwap, nivelSwap);
}

/* ============================================================== mensagens */

/* Um slider por cartão. Era código solto para as mensagens; virou objeto
   quando o cartão do Claude também precisou girar. O DOM só é reconstruído
   quando o conteúdo muda de verdade — refazer o innerHTML a cada ciclo
   cortaria a transição no meio. */
function Slider(idPalco, idPontos) {
  this.palco = idPalco;
  this.pontos = idPontos;
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
  $(this.palco).innerHTML = slides.map(function (x) {
    var html = typeof x === 'string' ? x : x.html;
    var cls = typeof x === 'string' ? '' : (x.classe || '');
    return '<div class="slide ' + cls + '" data-classe="' + cls + '">' + html + '</div>';
  }).join('');
  $(this.pontos).innerHTML = slides.map(function () { return '<i></i>'; }).join('');
  this.slides = slides;
  if (this.atual >= slides.length) this.atual = 0;
  this.mostrar(this.atual);
};

Slider.prototype.mostrar = function (i) {
  var todos = $(this.palco).querySelectorAll('.slide');
  if (!todos.length) return;
  this.atual = i % todos.length;
  for (var k = 0; k < todos.length; k++) {
    var extra = todos[k].getAttribute('data-classe') || '';
    todos[k].className = 'slide ' + extra + (k === this.atual ? ' ativo' : '');
  }
  var pts = $(this.pontos).querySelectorAll('i');
  for (var j = 0; j < pts.length; j++) pts[j].className = j === this.atual ? 'ativo' : '';

  // Um cartão que mostra coisas diferentes precisa de cabeçalho diferente:
  // "CLAUDE CODE" com os PRs do GitHub embaixo seria rótulo errado.
  var s = this.slides && this.slides[this.atual];
  if (this.aoTrocar && s && typeof s !== 'string') this.aoTrocar(s);
};

Slider.prototype.girar = function () {
  var n = $(this.palco).querySelectorAll('.slide').length;
  if (n < 2 || Date.now() < this.trocaEm) return;
  this.trocaEm = Date.now() + T.slide * 1000;
  this.mostrar(this.atual + 1);
};

var sliderMsg = new Slider('palco', 'pontos');
var sliderClaude = new Slider('palco-claude', 'pontos-claude');

// Precisa vir DEPOIS do objeto existir: como declaração `var`, sliderClaude
// estava içado mas ainda undefined lá em cima, e a página quebrava no load.
sliderClaude.aoTrocar = function (slide) {
  $('claude-titulo').innerHTML = (slide.icone || ICONE_CLAUDE) + (slide.titulo || '');
  var selo = $('claude-selo');
  selo.textContent = slide.selo || '';
  selo.style.visibility = slide.selo ? '' : 'hidden';
};

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

function hojeISO() {
  var d = new Date(Date.now() + deslocamento);
  return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate());
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

  // Sete colunas a partir de hoje, mesmo as vazias: dia sem compromisso é
  // informação, e coluna que some faz a semana mudar de forma todo dia.
  var dias = [];
  var base = dataLocal(hoje);
  for (var i = 0; i < 7; i++) {
    var d = new Date(base.getFullYear(), base.getMonth(), base.getDate() + i);
    dias.push({
      iso: d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate()),
      dt: d, itens: []
    });
  }
  var porISO = {};
  dias.forEach(function (d) { porISO[d.iso] = d; });

  (a.itens || []).forEach(function (e) {
    if (e.dia_inteiro) {
      dias.forEach(function (d) {
        if (e.inicio <= d.iso && d.iso < e.fim) d.itens.push(e);
      });
      return;
    }
    var dt = new Date(e.inicio_ts * 1000);
    var iso = dt.getFullYear() + '-' + dois(dt.getMonth() + 1) + '-' + dois(dt.getDate());
    if (porISO[iso]) porISO[iso].itens.push(e);
  });

  return '<div class="agenda-semana">' + dias.map(function (d) {
    var corpo = d.itens.length ? d.itens.map(function (e) {
      var passou = !e.dia_inteiro && e.fim_ts <= agora;
      return '<div class="compromisso' + (passou ? ' passou' : '') + '">' +
               '<div class="h">' + (e.dia_inteiro ? 'dia todo' : hhmm(e.inicio_ts)) + '</div>' +
               '<div class="t">' + escapar(e.titulo) + '</div>' +
             '</div>';
    }).join('') : '<div class="livre">livre</div>';

    return '<div class="coluna-dia' + (d.iso === hoje ? ' hoje' : '') + '">' +
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

var TELAS = {
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
  $('tela').hidden = false;
  // Esconde o painel de verdade: coberto não basta, os GIFs continuariam
  // decodificando atrás.
  document.querySelector('.painel').style.display = 'none';
  document.querySelector('.topo').style.display = 'none';
}

function fecharTela() {
  if (!telaAberta) return;
  telaAberta = '';
  $('tela').hidden = true;
  $('tela-corpo').innerHTML = '';
  document.querySelector('.painel').style.display = '';
  document.querySelector('.topo').style.display = '';
  assinaturaClaude = '';   // força redesenhar os bichinhos ao voltar
  desenhar();
}

document.addEventListener('click', function (ev) {
  if (telaAberta) { fecharTela(); return; }
  var alvo = ev.target;
  while (alvo && alvo !== document.body) {
    if (alvo.getAttribute && alvo.getAttribute('data-tela')) {
      abrirTela(alvo.getAttribute('data-tela'));
      return;
    }
    alvo = alvo.parentNode;
  }
});

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

  // --- ordem, calculada DENTRO de cada container
  //
  // Uma lista única aplicada a tudo embaralha o layout: a agenda e a dupla
  // (mensagens + monitor) são irmãs, mas só a agenda tem data-cartao — a dupla
  // ficava com order 0 e subia por cima. Aqui cada container ordena os
  // próprios filhos, e um container ganha a posição do primeiro cartão dentro
  // dele. O relógio, que não é cartão, fica onde sempre esteve.
  function posicao(el) {
    var id = el.getAttribute && el.getAttribute('data-cartao');
    if (id) return ordem.indexOf(id);
    var dentro = el.querySelectorAll ? el.querySelectorAll('[data-cartao]') : [];
    var menor = -1;
    for (var k = 0; k < dentro.length; k++) {
      var p = ordem.indexOf(dentro[k].getAttribute('data-cartao'));
      if (p >= 0 && (menor < 0 || p < menor)) menor = p;
    }
    return menor;
  }

  var caixas = document.querySelectorAll('.coluna, .dupla');
  for (var c = 0; c < caixas.length; c++) {
    var filhos = caixas[c].children;
    for (var f = 0; f < filhos.length; f++) {
      var pos = posicao(filhos[f]);
      filhos[f].style.order = pos < 0 ? '-1' : pos;   // não-cartões vêm antes
    }
  }

  // --- clima em meia largura quando divide a linha com o recado
  //
  // Sem container queries (Chrome 64 não tem), quem sabe que o cartão ficou
  // estreito é o JS: se os dois estão ligados, o clima muda de arranjo e os
  // detalhes descem para uma faixa embaixo em vez de disputar a direita.
  var clima = document.querySelector('[data-cartao="clima"]');
  if (clima) {
    var dividindo = cartoes.clima !== false && cartoes.recado !== false;
    clima.className = clima.className.replace(/ ?estreito/, '') + (dividindo ? ' estreito' : '');
  }

  // --- recado
  var r = a.recado || {};
  var t = $('recado-titulo'), x = $('recado-texto');
  if (t) t.textContent = (r.titulo || 'RECADO');
  if (x) x.textContent = r.texto || '';

  // Tempos novos podem mudar o que já está desenhado (uma sessão que passa a
  // caber, um slide que some): força o redesenho na próxima passada.
  assinaturaClaude = '';
  sliderMsg.assinatura = '';
  sliderClaude.assinatura = '';
  ultimoMinuto = -1;
}

/* ================================================================= desenho */
function desenhar() {
  aplicarAjustes();
  desenharMaquina();
  desenharSistema();
  desenharClima();
  desenharAgenda();
  desenharClaude();
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

function cenaGit(cor, rotulo, p) {
  enfileirar({
    cor: COR_GIT[cor] || COR_GIT.azul,
    figura: 'git',
    rotulo: rotulo,
    nome: '#' + p.numero + ' ' + p.titulo,
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

  el.style.background = c.cor;
  $('festa-nome').textContent = c.nome;
  $('festa-rot').textContent = c.rotulo;
  var invertido = c.figura === 'clawd' ? '' : ' invertido';
  texto.className = 'festa-texto' + invertido;

  var ehClawd = c.figura === 'clawd';
  clawd.style.display = ehClawd ? '' : 'none';
  git.removeAttribute('hidden');
  git.style.display = c.figura === 'git' ? '' : 'none';
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

ultimoSinal = Date.now();
conectar();
tique();
setInterval(tique, 1000);
