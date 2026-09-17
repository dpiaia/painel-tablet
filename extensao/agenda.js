/* Lê a agenda da aba do Google Agenda aberta, como reserva do adb.
 *
 * O painel pega a agenda do CalendarProvider do tablet, por adb. Funciona bem
 * até o tablet dormir, o Wi-Fi oscilar ou o adbd travar — e aí a tela fica sem
 * agenda justamente no dia de trabalho. Isto aqui é a segunda fonte.
 *
 * O ALVO DA LEITURA é o atributo `aria-label` dos blocos de evento, e não
 * classe de CSS. Pelo mesmo motivo do contador de e-mails: o rótulo de
 * acessibilidade é contrato que o Google mantém para leitores de tela, e
 * sobrevive a redesenho; classe ofuscada muda toda semana.
 *
 * Só lê. Nunca clica, nunca abre, nunca marca nada.
 */
'use strict';

// Formatos que o Google usa no aria-label, em português. A ordem importa: o
// primeiro que casar vence.
const HORA = /(\d{1,2}):(\d{2})/g;

// O Google guarda a data da coluna num inteiro. A fórmula é conhecida e
// estável há anos, mas é palpite até bater com a tela — por isso a leitura
// manda também a amostra crua, e o servidor mostra as duas coisas.
function dataDoDatekey(chave) {
  const n = parseInt(chave, 10);
  if (!n || isNaN(n)) return null;
  const ano = (n >> 9) + 1970;
  const mes = (n >> 5) & 15;
  const dia = n & 31;
  if (mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  return new Date(ano, mes - 1, dia);
}

function diaDoElemento(el) {
  let p = el;
  for (let i = 0; i < 12 && p; i++) {
    const chave = p.getAttribute && p.getAttribute('data-datekey');
    if (chave) {
      const d = dataDoDatekey(chave);
      if (d) return d;
    }
    p = p.parentElement;
  }
  return null;
}

function horas(texto) {
  HORA.lastIndex = 0;
  const achadas = [];
  let m;
  while ((m = HORA.exec(texto)) !== null) {
    const h = parseInt(m[1], 10), min = parseInt(m[2], 10);
    if (h <= 23 && min <= 59) achadas.push([h, min]);
    if (achadas.length === 2) break;
  }
  return achadas;
}

function tituloLimpo(texto) {
  // Tira horários, datas e as palavras de ligação, e fica com o resto.
  return texto
    .replace(/\d{1,2}:\d{2}/g, ' ')
    .replace(/\b(até|as|às|de|a)\b/gi, ' ')
    .replace(/\d{1,2}\s+de\s+\p{L}+(\s+de\s+\d{4})?/giu, ' ')
    .replace(/[,–—-]+/g, ' ')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

function coletar() {
  const blocos = document.querySelectorAll('[data-eventid]');
  const itens = [];
  const amostras = [];
  const vistos = {};

  for (let i = 0; i < blocos.length; i++) {
    const el = blocos[i];
    const rotulo = (el.getAttribute('aria-label') ||
                    (el.innerText || '').replace(/\n+/g, ', ')).trim();
    if (!rotulo) continue;

    if (amostras.length < 6) {
      amostras.push({
        rotulo: rotulo.slice(0, 160),
        datekey: (function () {
          let p = el;
          for (let k = 0; k < 12 && p; k++) {
            const c = p.getAttribute && p.getAttribute('data-datekey');
            if (c) return c;
            p = p.parentElement;
          }
          return null;
        })()
      });
    }

    const dia = diaDoElemento(el);
    if (!dia) continue;

    const hs = horas(rotulo);
    const titulo = tituloLimpo(rotulo) || '(sem título)';

    let inicio, fim, diaInteiro;
    if (hs.length) {
      diaInteiro = false;
      inicio = new Date(dia);
      inicio.setHours(hs[0][0], hs[0][1], 0, 0);
      fim = new Date(inicio);
      if (hs.length > 1) fim.setHours(hs[1][0], hs[1][1], 0, 0);
      else fim.setTime(inicio.getTime() + 3600000);
    } else {
      diaInteiro = true;
      inicio = new Date(dia);
      fim = new Date(dia.getTime() + 86400000);
    }

    // A mesma reunião aparece em mais de um bloco quando atravessa colunas.
    const chave = titulo + '|' + inicio.getTime();
    if (vistos[chave]) continue;
    vistos[chave] = 1;

    itens.push({
      titulo: titulo,
      inicio: diaInteiro ? isoDia(inicio) : isoLocal(inicio),
      fim: diaInteiro ? isoDia(fim) : isoLocal(fim),
      inicio_ts: inicio.getTime() / 1000,
      fim_ts: fim.getTime() / 1000,
      dia_inteiro: diaInteiro,
      local: ''
    });
  }

  itens.sort(function (a, b) { return a.inicio_ts - b.inicio_ts; });
  return { itens: itens, amostras: amostras, blocos: blocos.length };
}

function dois(n) { return n < 10 ? '0' + n : '' + n; }
function isoDia(d) {
  return d.getFullYear() + '-' + dois(d.getMonth() + 1) + '-' + dois(d.getDate());
}
function isoLocal(d) {
  return isoDia(d) + 'T' + dois(d.getHours()) + ':' + dois(d.getMinutes()) + ':00';
}

function mandar() {
  try {
    chrome.runtime.sendMessage({ tipo: 'agenda', dados: coletar() });
  } catch (e) {
    // Extensão recarregada por baixo da aba; o próximo ciclo resolve.
  }
}

// A cada minuto, e um pouco depois de carregar: o Google monta a grade em
// etapas, e ler no `load` pega a tela ainda vazia.
setTimeout(mandar, 4000);
setInterval(mandar, 60000);
