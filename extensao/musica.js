/* Sensor do Painel — o que está tocando, e os três botões.
 *
 * Roda no YouTube Music e no Spotify. A canalização é uma só — ler, relatar,
 * receber o comando de volta, clicar — e o que muda entre os dois é onde ficam
 * as coisas na página. Por isso um LEITOR por site, escolhido pelo hostname,
 * em vez de dois arquivos que iriam divergindo.
 *
 * POR QUE PELO NAVEGADOR: o jeito "certo" seria o Now Playing do macOS, que
 * sabe de qualquer tocador. A Apple fechou o MediaRemote para processos sem
 * entitlement a partir do 15.4 e este Mac está no 27 — não há caminho ali para
 * um script de fundo. A música toca numa aba do Opera, e nesta aba a extensão
 * já é bem-vinda.
 *
 * ESTE ARQUIVO CLICA, e é o único da extensão que clica. O background.js lê
 * títulos de aba e nunca encosta na página — essa regra continua valendo lá.
 * Aqui o clique é o recurso, não um efeito colateral: são os três botões do
 * próprio tocador, nada mais. Não abre aba, não muda fila, não curte faixa.
 *
 * O ESTADO VEM DO <video>, não do texto do botão. `paused` é propriedade do
 * elemento — mundo isolado enxerga o DOM igual — e não muda quando o site
 * redesenha a barra nem quando você troca o idioma da interface. O texto ainda
 * precisa de seletor, mas quando ele falha o painel diz que não está vendo em
 * vez de inventar.
 */
'use strict';

const CADENCIA = 2000;   // o bastante para o play/pause não parecer travado


function um(raiz, seletores) {
  for (const s of seletores) {
    const el = raiz && raiz.querySelector(s);
    if (el) return el;
  }
  return null;
}

function texto(el) {
  return (el && (el.textContent || '')).trim();
}

function tocandoNoVideo() {
  const v = document.querySelector('video, audio');
  if (!v) return null;                     // sem elemento: quem sabe é o site
  return !v.paused && !v.ended;
}

/* "3:45" -> 225. O Spotify não expõe os segundos como número em lugar
 * nenhum do DOM; o que ele mostra é o texto do relógio, e é dele que sai. */
function segundos(txt) {
  const p = (txt || '').trim().split(':').map(Number);
  if (!p.length || p.some(isNaN)) return null;
  return p.reduce((total, n) => total * 60 + n, 0);
}

/* ------------------------------------------------------- YouTube Music */
/* A byline junta artista, álbum e ano com "•". Separar aqui e não no painel
 * porque é aqui que se sabe o formato; o painel recebe campos, não uma string
 * para adivinhar. Nem toda faixa tem álbum (single, upload próprio), então o
 * que falta volta vazio em vez de virar o ano. */
function partesYtm(linha) {
  const p = linha.split('•').map((s) => s.trim()).filter(Boolean);
  const ano = p.length && /^\d{4}$/.test(p[p.length - 1]) ? p.pop() : '';
  return { artista: p[0] || '', album: p[1] || '', ano: ano };
}

const YTM = {
  fonte: 'ytm',
  raiz: () => document.querySelector('ytmusic-player-bar'),
  botoes: {
    'tocar-pausar': ['#play-pause-button'],
    'proxima':      ['.next-button'],
    'anterior':     ['.previous-button']
  },
  ler(b) {
    const titulo = texto(um(b, ['.title']));
    if (!titulo) return null;
    const info = partesYtm(texto(um(b, ['.byline'])));
    const v = document.querySelector('video');
    return {
      titulo: titulo,
      artista: info.artista,
      album: info.album,
      ano: info.ano,
      capa: capaDe(['#song-image img', 'ytmusic-player-bar img.image']),
      tocando: !!(v && !v.paused && !v.ended),
      posicao: v && isFinite(v.currentTime) ? Math.round(v.currentTime) : null,
      duracao: v && isFinite(v.duration) ? Math.round(v.duration) : null
    };
  }
};

/* ------------------------------------------------------------- Spotify */
/* O ÁLBUM NÃO VEM. A barra do Spotify mostra faixa e artista, e só: o álbum
 * não está em lugar nenhum dela. Fica vazio, e o painel diz "sem álbum" em vez
 * de repetir o nome da faixa ali como se fosse o disco.
 *
 * O tempo vem do texto do relógio porque é o único lugar onde o Spotify põe a
 * posição — o <video> dele é do fluxo cifrado e o currentTime não acompanha a
 * faixa. No YouTube Music é o contrário, e por isso cada leitor tem o seu. */
const SPOTIFY = {
  fonte: 'spotify',
  raiz: () => document.querySelector('[data-testid="now-playing-widget"]') ||
               document.querySelector('footer'),
  botoes: {
    'tocar-pausar': ['[data-testid="control-button-playpause"]'],
    'proxima':      ['[data-testid="control-button-skip-forward"]'],
    'anterior':     ['[data-testid="control-button-skip-back"]']
  },
  ler(b) {
    const titulo = texto(um(b, [
      '[data-testid="context-item-info-title"]',
      '[data-testid="context-item-link"]'
    ]));
    if (!titulo) return null;

    const artista = texto(um(b, [
      '[data-testid="context-item-info-subtitles"]',
      '[data-testid="context-item-info-artist"]'
    ]));

    const pos = segundos(texto(um(document, ['[data-testid="playback-position"]'])));
    const dur = segundos(texto(um(document, ['[data-testid="playback-duration"]'])));

    // O aria-label é reserva do <video>, e casa com "Pause" e "Pausar" — o
    // mesmo prefixo nos dois idiomas em que este painel roda.
    let tocando = tocandoNoVideo();
    if (tocando === null) {
      const bt = um(document, ['[data-testid="control-button-playpause"]']);
      tocando = /paus/i.test((bt && bt.getAttribute('aria-label')) || '');
    }

    return {
      titulo: titulo,
      artista: artista,
      album: '',
      ano: '',
      capa: capaDe(['[data-testid="cover-art-image"]',
                    '[data-testid="now-playing-widget"] img']),
      tocando: tocando,
      posicao: pos,
      duracao: dur
    };
  }
};

/* Os dois sites servem a capa em miniatura na barra, e nos dois o tamanho
 * está na própria URL — então pedir a grande é trocar alguns caracteres, sem
 * requisição extra nem API. Na tela cheia do painel a capa ocupa 26vw, e a
 * miniatura viraria um borrão.
 *
 *   Google   =w60-h60-l90-rj      ->  =w544-h544-l90-rj
 *   Spotify  ab67616d00004851...  ->  ab67616d0000b273...   (64px -> 640px)
 *
 * Conferido nos dois: o CDN devolve 200 com a imagem grande. Se um dia mudar
 * o formato, a troca simplesmente não casa e a URL passa intacta — volta a
 * miniatura, não uma imagem quebrada.
 */
function capaDe(seletores) {
  const img = um(document, seletores);
  const src = (img && img.src) || '';
  if (!src) return '';
  return src
    .replace(/=w\d+-h\d+/, '=w544-h544')
    .replace(/\/ab67616d[0-9a-f]{8}/, '/ab67616d0000b273');
}

const LEITOR = location.hostname.indexOf('spotify') >= 0 ? SPOTIFY : YTM;

function ler() {
  const b = LEITOR.raiz();
  const faixa = b ? LEITOR.ler(b) : null;
  if (faixa) return { fonte: LEITOR.fonte, aberto: true, faixa: faixa };

  /* Sem faixa, duas coisas muito diferentes podem estar acontecendo: a fila
   * está vazia, ou o site mudou a barra e o seletor parou de achar. O <video>
   * desempata — se há som rolando e mesmo assim não achei o texto, o quebrado
   * sou eu, e o painel tem que dizer isso em vez de "nada tocando".
   *
   * É a diferença entre você olhar o painel e pensar "acabou a playlist" ou
   * "o sensor quebrou". A primeira faz você não fazer nada. */
  return { fonte: LEITOR.fonte, aberto: true, faixa: null,
           cego: tocandoNoVideo() === true };
}

/* Clicar no botão do tocador, e não chamar video.play(). Os dois sites guardam
 * o próprio estado (fila, scrobble, a cara do botão) e mexer no <video> por
 * baixo deixa a página dizendo uma coisa e o som fazendo outra. */
function executar(comando) {
  const alvo = um(LEITOR.raiz() || document, LEITOR.botoes[comando] || []) ||
               um(document, LEITOR.botoes[comando] || []);
  if (alvo) alvo.click();
}

/* Quem fala com o painel é o background, não esta aba: o token fica num lugar
 * só, em vez de ser injetado em toda página de música que você abrir. A
 * resposta dele traz o comando que o tablet apertou — este arquivo é a única
 * mão que o painel tem dentro do navegador. */
function mandar() {
  let leitura;
  try { leitura = ler(); } catch (e) { return; }

  try {
    chrome.runtime.sendMessage({ tipo: 'musica', dados: leitura }, (resposta) => {
      if (chrome.runtime.lastError) return;   // extensão recarregada por baixo
      if (resposta && resposta.comando) executar(resposta.comando);
    });
  } catch (e) {
    // Painel desligado, ou extensão recarregada. O próximo ciclo resolve.
  }
}

mandar();
setInterval(mandar, CADENCIA);

/* Play e pause também disparam o relatório na hora.
 *
 * O temporizador acima é estrangulado pelo Chrome quando a aba fica escondida
 * e sem som — vira um por minuto. Os eventos do <video> não são: eles chegam
 * no instante em que acontecem. Sem isto, pausar pela própria página deixava
 * o painel com o ícone errado por até um minuto.
 *
 * Em captura porque eventos de mídia não sobem: só assim um listener no
 * documento os enxerga, e não importa quantas vezes o site troque o elemento
 * de vídeo entre uma faixa e outra.
 */
['play', 'pause', 'ended', 'loadedmetadata'].forEach(function (evento) {
  document.addEventListener(evento, mandar, true);
});

/* A campainha: uma conexão aberta com o painel, só para saber quando vir
 * buscar um comando.
 *
 * O temporizador lá em cima é estrangulado pelo Chrome quando a aba está
 * escondida e sem som — vira um por minuto. Isso quebrava justamente o caso
 * mais comum: música pausada, você aperta play no tablet, e o comando vencia
 * na caixa antes de a aba aparecer para pegá-lo.
 *
 * O estrangulamento é de temporizador, não de rede. Uma mensagem que chega
 * por uma conexão aberta acorda a aba na hora. A campainha não traz o
 * comando — ela diz que existe um, e a resposta é o relatório de sempre, que
 * já sabe colher o comando. Um caminho de entrega só.
 *
 * O endereço vem do background, que é onde o config.js mora: escrever
 * "127.0.0.1:8766" aqui seria uma segunda cópia para divergir no dia em que a
 * porta mudar. O token continua fora desta aba — a campainha não devolve nada
 * além de um nome de tocador.
 *
 * O EventSource reconecta sozinho quando o Mac dorme ou o painel reinicia, e
 * a aba volta a ser alcançável sem ninguém recarregar nada.
 */
chrome.runtime.sendMessage({ tipo: 'painel-base' }, function (resposta) {
  if (chrome.runtime.lastError || !resposta || !resposta.base) return;
  try {
    const campainha = new EventSource(resposta.base + '/campainha');
    campainha.addEventListener('comando', function (ev) {
      let d;
      try { d = JSON.parse(ev.data); } catch (e) { return; }
      if (d && d.fonte === LEITOR.fonte) mandar();
    });
  } catch (e) {
    // Sem campainha o tocador continua funcionando: o relatório periódico
    // ainda colhe o comando, só que devagar quando a aba está pausada.
  }
});
