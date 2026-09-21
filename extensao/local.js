/* Pede a posição ao navegador e devolve para o background.
 *
 * POR QUE ESTE ARQUIVO EXISTE: no Manifest V3 o background é um service
 * worker, e service worker não tem `navigator.geolocation` — essa API precisa
 * de um documento. Então o background abre esta página fora de tela, pede, e
 * fecha. É o caminho que a própria Chrome documenta para isto.
 *
 * O QUE MELHORA E O QUE NÃO: as coordenadas daqui são de verdade, contra as do
 * IP que erram por dez ou vinte quilômetros. Para o CLIMA isso muda pouco —
 * vinte quilômetros costumam ter a mesma previsão. O que muda é a precisão do
 * ponto que o painel consulta; o NOME da cidade continua vindo do IP, porque
 * traduzir coordenada em nome exigiria mandar a sua posição exata para outro
 * serviço, e isso é uma decisão de quem instala, não uma escolha nossa.
 */
'use strict';

navigator.geolocation.getCurrentPosition(
  (pos) => {
    chrome.runtime.sendMessage({
      tipo: 'local',
      dados: {
        lat: pos.coords.latitude,
        lon: pos.coords.longitude,
        precisao: Math.round(pos.coords.accuracy || 0),
      },
    });
  },
  (erro) => {
    // Permissão negada, ou o sistema não deixou o navegador ver a posição.
    // Não é erro que mereça barulho: o painel cai para o IP sozinho.
    chrome.runtime.sendMessage({ tipo: 'local', dados: null, motivo: erro.code });
  },
  { enableHighAccuracy: false, timeout: 15000, maximumAge: 10 * 60 * 1000 }
);
