/* Sensor do Painel — roda no Opera e conta mensagens não lidas.
 *
 * Não raspa DOM: lê o TÍTULO da aba, onde Gmail, Chat e WhatsApp já publicam o
 * número entre parênteses ("Caixa de entrada (12) — ...", "(3) WhatsApp").
 * Isso é estável há anos e sobrevive a redesenho da interface, ao contrário de
 * um seletor de CSS. O preço é só o contador — assunto e remetente ficam para
 * uma fase seguinte, isolada, que pode quebrar sem derrubar isto aqui.
 *
 * Só lê. Nunca clica, nunca marca como lido, nunca abre nada.
 */
'use strict';

// O endereço e o token vêm de config.js, que NÃO vai para o git. Rode
// `python3 ferramentas/instalar.py` para gerá-lo.
importScripts('config.js');

const FONTES = [
  { nome: 'email',    casa: (u) => /^https:\/\/mail\.google\.com\/mail\//.test(u) },
  { nome: 'chat',     casa: (u) => /^https:\/\/chat\.google\.com\//.test(u) ||
                                   /^https:\/\/mail\.google\.com\/chat\//.test(u) },
  { nome: 'whatsapp', casa: (u) => /^https:\/\/web\.whatsapp\.com\//.test(u) },
];

function contador(titulo) {
  const m = /\((\d+)\)/.exec(titulo || '');
  return m ? parseInt(m[1], 10) : 0;
}

function conta(titulo) {
  const m = /([\w.+-]+@[\w.-]+\.\w{2,})/.exec(titulo || '');
  return m ? m[1] : null;
}

// O Google numera as contas na própria URL (/mail/u/0/, /mail/u/1/...). Isso é
// chave estável: duas abas da MESMA conta compartilham o número, e somar as
// duas inflaria o contador — foi exatamente o que aconteceu no primeiro teste,
// com uma conta contada em dobro.
function chave(url, titulo) {
  const m = /\/u\/(\d+)\//.exec(url || '');
  if (m) return 'u' + m[1];
  return conta(titulo) || url || '?';
}

async function coletar() {
  const abas = await chrome.tabs.query({});
  const fontes = {};

  for (const f of FONTES) {
    const minhas = abas.filter((t) => t.url && f.casa(t.url));

    // Distinguir "zero mensagens" de "não estou vendo" é o ponto todo: sem
    // isso o painel mostraria 0 tranquilamente enquanto a aba está fechada.
    if (!minhas.length) {
      fontes[f.nome] = { aberto: false, contador: null, abas: [] };
      continue;
    }

    // Agrupa por conta: a mesma caixa aberta em duas abas é uma caixa só.
    const porConta = new Map();
    for (const t of minhas) {
      const k = chave(t.url, t.title);
      const n = contador(t.title);
      const atual = porConta.get(k);
      // Entre abas da mesma conta fica a maior: uma delas pode estar numa
      // pasta sem não lidos e mostrar 0 no título.
      if (!atual || n > atual.contador) {
        porConta.set(k, { conta: conta(t.title), contador: n });
      }
    }

    const detalhe = [...porConta.values()];
    const total = detalhe.reduce((a, b) => a + b.contador, 0);

    fontes[f.nome] = { aberto: true, contador: total, abas: detalhe };
  }
  return fontes;
}

let pendente = null;

// A agenda vem do content script, não daqui: só ele enxerga o DOM da aba. O
// service worker do MV3 morre ocioso, então o último envio fica guardado e
// segue junto com o próximo ciclo normal, em vez de abrir uma conexão só para
// ele.
let agenda = null;

chrome.runtime.onMessage.addListener((msg) => {
  if (msg && msg.tipo === 'agenda' && msg.dados) {
    agenda = msg.dados;
    agendar();
  }
});

async function enviar() {
  try {
    const fontes = await coletar();
    await fetch(PAINEL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        token: TOKEN,
        fontes: agenda ? Object.assign({}, fontes, { agenda_web: agenda }) : fontes,
      }),
    });
  } catch (e) {
    // Painel fora do ar (Mac dormindo, serviço parado). Não é erro: o próximo
    // ciclo resolve, e o tablet já mostra sozinho que está sem contato.
  }
}

function agendar() {
  // Rajada de eventos de título vira um envio só.
  if (pendente) clearTimeout(pendente);
  pendente = setTimeout(enviar, 800);
}

chrome.tabs.onUpdated.addListener((id, mudou) => {
  if (mudou.title || mudou.url) agendar();   // chega e-mail -> título muda -> empurra na hora
});
chrome.tabs.onRemoved.addListener(agendar);
chrome.tabs.onCreated.addListener(agendar);

// Batimento: o service worker do MV3 morre ocioso; o alarme o acorda. Serve
// também para o painel saber que o sensor continua vivo.
chrome.alarms.create('batimento', { periodInMinutes: 1 });
chrome.alarms.onAlarm.addListener(enviar);

chrome.runtime.onStartup.addListener(enviar);
chrome.runtime.onInstalled.addListener(enviar);
enviar();
