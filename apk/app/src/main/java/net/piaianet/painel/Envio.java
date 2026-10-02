package net.piaianet.painel;

import org.json.JSONArray;
import org.json.JSONObject;

import java.io.OutputStream;
import java.net.HttpURLConnection;
import java.net.URL;

/**
 * Manda a leitura do aparelho para o painel.
 *
 * Mesma porta de entrada que a extensão do navegador usa — `/ingest`, com o
 * token do painel. Não inventamos um caminho novo: o servidor já sabe recusar
 * quem não tem token, e um segundo caminho seria uma segunda coisa para
 * proteger.
 *
 * Em linha de execução própria porque chamada de rede na principal trava a
 * tela — e aqui a tela é o produto.
 */
class Envio {

    interface Resposta { void quando(boolean deu); }

    static void mandar(final String base, final String token,
                       final String fonte, final JSONArray dados,
                       final Resposta aviso) {
        new Thread(new Runnable() {
            @Override public void run() {
                boolean deu = false;
                HttpURLConnection con = null;
                try {
                    JSONObject fontes = new JSONObject();
                    fontes.put(fonte, dados);
                    JSONObject corpo = new JSONObject();
                    corpo.put("token", token);
                    corpo.put("fontes", fontes);

                    con = (HttpURLConnection) new URL(base + "/ingest").openConnection();
                    con.setRequestMethod("POST");
                    con.setRequestProperty("Content-Type", "application/json");
                    con.setConnectTimeout(8000);
                    con.setReadTimeout(8000);
                    con.setDoOutput(true);

                    OutputStream os = con.getOutputStream();
                    os.write(corpo.toString().getBytes("UTF-8"));
                    os.close();

                    deu = con.getResponseCode() == 200;
                } catch (Exception e) {
                    // Painel desligado, Wi-Fi caindo, Mac dormindo. Não é erro
                    // que mereça aparecer na tela: o próximo ciclo resolve, e o
                    // painel já mostra sozinho quando está sem contato.
                } finally {
                    if (con != null) con.disconnect();
                }
                if (aviso != null) aviso.quando(deu);
            }
        }).start();
    }
}
