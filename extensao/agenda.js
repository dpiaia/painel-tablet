/* Lê a agenda da aba do Google Agenda aberta, como reserva do adb.
 *
 * O painel tira a agenda do CalendarProvider do tablet, por adb. Funciona até
 * o tablet dormir, o Wi-Fi oscilar ou o adbd travar. Isto é a segunda fonte.
 *
 * O ALVO DA LEITURA é o `aria-label` dos blocos de evento, não classe de CSS:
 * o rótulo de acessibilidade é contrato que o Google mantém para leitores de
 * tela e sobrevive a redesenho; classe ofuscada muda toda semana.
 *
 * O rótulo vem em CAMPOS SEPARADOS POR VÍRGULA, algo como
 *
 *     2pm – 3pm, Reunião de equipe, Fulano de Tal, Aceito, Nenhum local
 *     Local de trabalho: Casa, Fulano de Tal, 21 – 25 setembro 2026
 *
 * A primeira versão tentou limpar isso com expressão regular e produziu
 * títulos como "2pm 3pm Reunião de equipe Fulano de Tal Aceito Nenhum local".
 * Separar por vírgula e jogar fora os campos reconhecíveis (hora, data,
 * status, local vazio) deixa o título ser o primeiro que sobra — sem precisar
 * saber o nome do dono da agenda.
 *
 * Só lê. Nunca clica, nunca abre, nunca marca nada.
 */
'use strict';

const MESES = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho',
               'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

// 12 horas ("2pm", "2:45pm", "11 am") e 24 horas ("14:30"). O Google segue a
// preferência da conta, e a desta é 12 horas — a primeira versão só entendia
// 24 e transformou 2pm em 02:45 da manhã.
const RE_HORA = /(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b|(\d{1,2}):(\d{2})/gi;

const STATUS = /^(aceito|recusado|talvez|pendente|sem resposta|convidado)$/i;
const SEM_LOCAL = /^(nenhum local|sem local)$/i;

// Botões da grade que não são compromisso.
const NAO_E_EVENTO = /^(mudar o local de trabalho|criar|adicionar)/i;


function horas(texto) {
  RE_HORA.lastIndex = 0;
  const achadas = [];
  let m;
  while ((m = RE_HORA.exec(texto)) !== null && achadas.length < 2) {
    let h, min;
    if (m[3]) {                                  // 12 horas
      h = parseInt(m[1], 10);
      min = m[2] ? parseInt(m[2], 10) : 0;
      const tarde = m[3].toLowerCase() === 'pm';
      if (tarde && h !== 12) h += 12;
      if (!tarde && h === 12) h = 0;             // 12am é meia-noite
    } else {                                     // 24 horas
      h = parseInt(m[4], 10);
      min = parseInt(m[5], 10);
    }
    if (h <= 23 && min <= 59) achadas.push([h, min]);
  }
  return achadas;
}

// "14 de setembro de 2026", "21 – 25 setembro 2026", "14 setembro"
function dataDoTexto(texto) {
  const baixo = texto.toLowerCase();
  for (let i = 0; i < MESES.length; i++) {
    const pos = baixo.indexOf(MESES[i]);
    if (pos < 0) continue;
    // O dia é o último número antes do nome do mês (num intervalo, o de
    // início é o primeiro; o painel só precisa saber em que dia começa).
    const antes = baixo.slice(0, pos).match(/(\d{1,2})(?!.*\d{1,2})/);
    const diaIntervalo = baixo.slice(0, pos).match(/(\d{1,2})\s*[–—-]/);
    const dia = parseInt((diaIntervalo ? diaIntervalo[1] : (antes && antes[1])) || '', 10);
    if (!dia || dia > 31) continue;
    const anoM = baixo.slice(pos).match(/(20\d{2})/);
    const ano = anoM ? parseInt(anoM[1], 10) : new Date().getFullYear();
    return new Date(ano, i, dia);
  }
  return null;
}

// O datekey da coluna, quando existe. Vale para a grade; os blocos de dia
// inteiro no cabeçalho não têm, e por isso a data também é procurada no texto.
function dataDoDatekey(el) {
  let p = el;
  for (let i = 0; i < 14 && p; i++) {
    const chave = p.getAttribute && p.getAttribute('data-datekey');
    if (chave) {
      const n = parseInt(chave, 10);
      if (n) {
        const ano = (n >> 9) + 1970, mes = (n >> 5) & 15, dia = n & 31;
        if (mes >= 1 && mes <= 12 && dia >= 1 && dia <= 31) {
          return new Date(ano, mes - 1, dia);
        }
      }
    }
    p = p.parentElement;
  }
  return null;
}

// O título é o primeiro campo que não é hora, data, status nem "nenhum local".
function titulo(campos) {
  for (let i = 0; i < campos.length; i++) {
    const c = campos[i].trim();
    if (!c) continue;
    if (STATUS.test(c) || SEM_LOCAL.test(c)) continue;
    if (dataDoTexto(c)) continue;
    const semHora = c.replace(RE_HORA, '').replace(/[–—-]/g, '').trim();
    if (!semHora) continue;                       // o campo era só o horário
    return c;
  }
  return '';
}


function coletar() {
  const blocos = document.querySelectorAll('[data-eventid]');
  const itens = [];
  const cru = [];
  const vistos = {};
  let semData = 0;

  for (let i = 0; i < blocos.length; i++) {
    const el = blocos[i];
    const rotulo = (el.getAttribute('aria-label') ||
                    (el.innerText || '').replace(/\n+/g, ', ')).trim();
    if (!rotulo) continue;

    // Dump cru de tudo: é o que permite consertar o parser sem ir até a aba.
    if (cru.length < 40) cru.push(rotulo.slice(0, 200));

    if (NAO_E_EVENTO.test(rotulo)) continue;

    const campos = rotulo.split(',');
    const dia = dataDoDatekey(el) || dataDoTexto(rotulo);
    if (!dia) { semData++; continue; }

    const hs = horas(rotulo);
    const nome = titulo(campos) || '(sem título)';

    let inicio, fim, diaInteiro;
    if (hs.length) {
      diaInteiro = false;
      inicio = new Date(dia);
      inicio.setHours(hs[0][0], hs[0][1], 0, 0);
      fim = new Date(inicio);
      if (hs.length > 1) {
        fim.setHours(hs[1][0], hs[1][1], 0, 0);
        if (fim <= inicio) fim = new Date(inicio.getTime() + 3600000);
      } else {
        fim = new Date(inicio.getTime() + 3600000);
      }
    } else {
      diaInteiro = true;
      inicio = new Date(dia);
      fim = new Date(dia.getTime() + 86400000);
    }

    // A mesma reunião aparece em mais de um bloco quando atravessa colunas.
    const chave = nome + '|' + inicio.getTime();
    if (vistos[chave]) continue;
    vistos[chave] = 1;

    itens.push({
      titulo: nome,
      inicio: diaInteiro ? isoDia(inicio) : isoLocal(inicio),
      fim: diaInteiro ? isoDia(fim) : isoLocal(fim),
      inicio_ts: inicio.getTime() / 1000,
      fim_ts: fim.getTime() / 1000,
      dia_inteiro: diaInteiro,
      local: ''
    });
  }

  itens.sort(function (a, b) { return a.inicio_ts - b.inicio_ts; });
  return { itens: itens, cru: cru, blocos: blocos.length, sem_data: semData };
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

// O Google monta a grade em etapas: ler no `load` pega a tela ainda vazia.
setTimeout(mandar, 4000);
setInterval(mandar, 60000);
