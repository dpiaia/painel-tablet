/* Sensor do Painel — o que está tocando no YouTube Music, e os três botões.
 *
 * POR QUE PELO NAVEGADOR: o jeito "certo" seria o Now Playing do macOS, que
 * sabe de qualquer tocador. Só que a Apple fechou o MediaRemote para processos
 * sem entitlement a partir do 15.4, e este Mac está no 27 — não há caminho ali
 * para um script de fundo. A música toca numa aba do Opera, e nesta aba a
 * extensão já é bem-vinda. É o caminho que existe.
 *
 * ESTE ARQUIVO CLICA, e é o único da extensão que clica. O background.js lê
 * títulos de aba e nunca encosta na página — essa regra continua valendo lá.
 * Aqui o clique é o recurso, não um efeito colateral: são os três botões do
 * próprio tocador, nada mais. Não abre aba, não muda fila, não curte faixa.
 *
 * O ESTADO VEM DO <video>, não do CSS. `paused`, `currentTime` e `duration`
 * são propriedades do elemento — mundo isolado enxerga o DOM igual — e não
 * mudam quando o YouTube redesenha a barra. O texto ainda precisa de seletor,
 * mas se ele quebrar o painel diz que não está vendo em vez de inventar.
 */
'use strict';

const CADENCIA = 2000;   // o bastante para o play/pause não parecer travado

function barra() {
  return document.querySelector('ytmusic-player-bar');
}

function texto(el) {
  return (el && (el.textContent || '')).trim();
}

/* A byline junta artista, álbum e ano com "•". Separar aqui e não no painel
 * porque é aqui que se sabe o formato; o painel recebe campos, não uma
 * string para adivinhar. Nem toda faixa tem álbum (single, upload próprio),
 * então o que falta volta vazio em vez de virar o ano.
 */
function partes(linha) {
  const p = linha.split('•').map((s) => s.trim()).filter(Boolean);
  const ano = p.length && /^\d{4}$/.test(p[p.length - 1]) ? p.pop() : '';
  return { artista: p[0] || '', album: p[1] || '', ano: ano };
}

/* A capa vem em miniatura de 60px na barra. O sufixo de tamanho é da própria
 * URL do Google, então pedir 544 é trocar dois números — e a tela cheia do
 * painel mostra a capa grande, onde 60px viraria um borrão.
 */
function capa() {
  const img = document.querySelector('#song-image img, ytmusic-player-bar img.image');
  const src = (img && img.src) || '';
  if (!src) return '';
  return src.replace(/=w\d+-h\d+/, '=w544-h544');
}

function ler() {
  const v = document.querySelector('video');
  const b = barra();
  const titulo = texto(b && b.querySelector('.title'));

  /* Sem título, duas coisas muito diferentes podem estar acontecendo: a fila
   * está vazia, ou o YouTube mudou a barra e o seletor parou de achar. O
   * <video> desempata — se há som rolando e mesmo assim não achei o texto, o
   * quebrado sou eu, e o painel tem que dizer isso em vez de "nada tocando".
   *
   * É a diferença entre você olhar o painel e pensar "acabou a playlist" ou
   * "o sensor quebrou". A primeira faz você não fazer nada. */
  if (!titulo) {
    const rolando = !!(v && !v.paused && !v.ended);
    return { aberto: true, faixa: null, cego: rolando };
  }

  const info = partes(texto(b.querySelector('.byline')));
  return {
    aberto: true,
    faixa: {
      titulo: titulo,
      artista: info.artista,
      album: info.album,
      ano: info.ano,
      capa: capa(),
      tocando: !!(v && !v.paused && !v.ended),
      posicao: v && isFinite(v.currentTime) ? Math.round(v.currentTime) : null,
      duracao: v && isFinite(v.duration) ? Math.round(v.duration) : null
    }
  };
}

/* Clicar no botão do tocador, e não chamar video.play(). O YouTube Music
 * guarda o próprio estado (fila, scrobble, a cara do botão) e mexer no
 * <video> por baixo deixa a página dizendo uma coisa e o som fazendo outra.
 */
const BOTAO = {
  'tocar-pausar': '#play-pause-button',
  'proxima':      '.next-button',
  'anterior':     '.previous-button'
};

function executar(comando) {
  const seletor = BOTAO[comando];
  if (!seletor) return;
  const b = barra();
  const alvo = b && b.querySelector(seletor);
  if (alvo) alvo.click();
}

/* Quem fala com o painel é o background, não esta aba: o token fica num
 * lugar só, em vez de ser injetado em toda página de música que você abrir.
 * A resposta dele traz o comando que o tablet apertou — este arquivo é a
 * única mão que o painel tem dentro do navegador.
 */
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
