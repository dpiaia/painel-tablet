package net.piaianet.painel;

import android.Manifest;
import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.content.pm.PackageManager;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.os.Handler;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
import android.widget.LinearLayout;
import android.widget.Toast;

/**
 * O painel em tela cheia, sem navegador por cima.
 *
 * POR QUE ESTE APP EXISTE: até aqui o tablet rodava o Fully Kiosk apontado
 * para o IP do Mac. Três coisas quebravam sozinhas, sempre:
 *
 *   · o IP do Mac mudava e o endereço salvo no quiosque apontava para o nada;
 *   · o `adb tcpip` morria em todo reinício, e com ele a agenda e a bateria;
 *   · o tablet reiniciava e ninguém o trazia de volta.
 *
 * Este primeiro passo resolve a terceira e aposenta o quiosque pago. A
 * descoberta por nome e a leitura do calendário vêm depois — mas vêm para
 * dentro deste app, que é o único lugar no tablet com permissão para isso.
 *
 * NADA DE INTERFACE PRÓPRIA. O painel inteiro já é HTML e foi medido para o
 * WebView 64 deste aparelho. Desenhar botão nativo aqui seria manter duas
 * telas que fazem a mesma coisa. O único controle é um toque longo, que abre
 * o endereço — e existe só porque sem ele um aparelho novo não tem como ser
 * configurado.
 */
public class PainelActivity extends Activity {

    private static final String PREFS = "painel";
    private static final String CHAVE_URL = "url";
    private static final String CHAVE_TOKEN = "token";
    private static final String URL_PADRAO = "http://192.168.0.69:8766";

    /** De quanto em quanto tempo a agenda do aparelho vai para o painel. */
    private static final long AGENDA_CADA = 2 * 60 * 1000L;

    /** A mesma janela que o coletor do Mac usava: a tela cheia precisa dos
     *  dias passados para o modo "semana atual" não mentir "livre". */
    private static final int DIAS_ATRAS = 6, DIAS_FRENTE = 7;

    private static final int PEDIDO_AGENDA = 1;

    private WebView web;
    private final Handler relogio = new Handler();

    @Override
    protected void onCreate(Bundle estado) {
        super.onCreate(estado);

        // A tela não apaga. É um painel de mesa: apagar é o mesmo que desligar.
        getWindow().addFlags(WindowManager.LayoutParams.FLAG_KEEP_SCREEN_ON);

        web = new WebView(this);
        web.setBackgroundColor(Color.BLACK);
        setContentView(web);

        WebSettings s = web.getSettings();
        s.setJavaScriptEnabled(true);
        s.setDomStorageEnabled(true);          // o painel guarda preferências locais
        s.setMediaPlaybackRequiresUserGesture(false);
        // Sem zoom e sem rolagem: é um painel, não uma página para navegar.
        s.setBuiltInZoomControls(false);
        s.setSupportZoom(false);
        web.setOverScrollMode(View.OVER_SCROLL_NEVER);
        web.setVerticalScrollBarEnabled(false);
        web.setHorizontalScrollBarEnabled(false);

        // Tudo abre aqui dentro. Sem isto, um link dispararia o navegador do
        // sistema por cima do painel — e no quiosque ninguém volta.
        web.setWebViewClient(new WebViewClient() {
            @Override
            public void onReceivedError(WebView v, int codigo, String descricao, String url) {
                // O servidor pode ainda estar subindo, ou o Wi-Fi voltando.
                // Tentar de novo em silêncio é melhor que a página de erro do
                // Android, que não diz nada para quem olha de longe.
                v.postDelayed(new Runnable() {
                    @Override public void run() { v.reload(); }
                }, 5000);
            }
        });

        // Toque longo abre o endereço. É o único controle nativo do app.
        web.setOnLongClickListener(new View.OnLongClickListener() {
            @Override public boolean onLongClick(View v) { perguntarEndereco(); return true; }
        });

        aplicarIntent(getIntent());
        web.loadUrl(endereco());
        pedirAgenda();
    }

    /**
     * Configuração por intent, para não ter que digitar um token de 32
     * caracteres no teclado do tablet:
     *
     *   adb shell am start -n net.piaianet.painel/.PainelActivity \
     *       -e url http://192.168.0.69:8766 -e token <token>
     *
     * Quem já tem adb no aparelho já pode instalar e desinstalar aplicativo —
     * isto não abre porta nenhuma que não estivesse aberta, e torna possível
     * preparar um tablet novo sem ninguém soletrar nada.
     */
    private void aplicarIntent(android.content.Intent i) {
        if (i == null) return;
        SharedPreferences.Editor e = prefs().edit();
        boolean mudou = false;
        String url = i.getStringExtra("url");
        if (url != null && !url.trim().isEmpty()) { e.putString(CHAVE_URL, url.trim()); mudou = true; }
        String token = i.getStringExtra("token");
        if (token != null && !token.trim().isEmpty()) { e.putString(CHAVE_TOKEN, token.trim()); mudou = true; }
        if (mudou) e.apply();
    }

    /* ----------------------------------------------------------- agenda
     *
     * A permissão é pedida UMA vez, na primeira abertura. Negada, o app segue
     * mostrando o painel — ele continua sendo um navegador em tela cheia, e o
     * painel continua pegando a agenda pelo adb como antes. Nada quebra por
     * recusar; só deixa de melhorar.
     */
    private void pedirAgenda() {
        if (checkSelfPermission(Manifest.permission.READ_CALENDAR)
                == PackageManager.PERMISSION_GRANTED) {
            iniciarAgenda();
        } else {
            requestPermissions(new String[]{Manifest.permission.READ_CALENDAR},
                               PEDIDO_AGENDA);
        }
    }

    @Override
    public void onRequestPermissionsResult(int pedido, String[] quais, int[] r) {
        if (pedido == PEDIDO_AGENDA && r.length > 0
                && r[0] == PackageManager.PERMISSION_GRANTED) {
            iniciarAgenda();
        }
    }

    private void iniciarAgenda() {
        relogio.removeCallbacksAndMessages(null);
        relogio.post(new Runnable() {
            @Override public void run() {
                enviarAgenda();
                relogio.postDelayed(this, AGENDA_CADA);
            }
        });
    }

    private void enviarAgenda() {
        String token = prefs().getString(CHAVE_TOKEN, "");
        if (token.isEmpty()) return;        // sem token o /ingest recusa
        try {
            Envio.mandar(endereco(), token, "agenda_tablet",
                         Agenda.ler(this, DIAS_ATRAS, DIAS_FRENTE), null);
        } catch (Exception e) {
            // Sem permissão, ou provider indisponível. O painel segue com o
            // que tiver — e diz de qual fonte veio, então a troca não é muda.
        }
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String endereco() {
        return prefs().getString(CHAVE_URL, URL_PADRAO);
    }

    private void perguntarEndereco() {
        final EditText url = new EditText(this);
        url.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        url.setHint("http://ip-do-servidor:8766");
        url.setText(endereco());

        // O token é o mesmo do painel (config.json, chave token_ingest). Sem
        // ele o app mostra a tela mas não consegue MANDAR a agenda — o
        // /ingest recusa, e é bom que recuse: senão qualquer um na rede
        // escreveria na sua agenda.
        final EditText token = new EditText(this);
        token.setHint("token do painel (token_ingest)");
        token.setText(prefs().getString(CHAVE_TOKEN, ""));

        LinearLayout caixa = new LinearLayout(this);
        caixa.setOrientation(LinearLayout.VERTICAL);
        int p = (int) (16 * getResources().getDisplayMetrics().density);
        caixa.setPadding(p, p, p, 0);
        caixa.addView(url);
        caixa.addView(token);

        new AlertDialog.Builder(this)
            .setTitle("Painel")
            .setMessage("Onde o servidor está e qual o token. Em breve o app acha sozinho.")
            .setView(caixa)
            .setPositiveButton("Salvar", (d, b) -> {
                String novo = url.getText().toString().trim();
                if (novo.isEmpty()) return;
                prefs().edit()
                       .putString(CHAVE_URL, novo)
                       .putString(CHAVE_TOKEN, token.getText().toString().trim())
                       .apply();
                Toast.makeText(this, novo, Toast.LENGTH_SHORT).show();
                web.loadUrl(novo);
                pedirAgenda();
            })
            .setNegativeButton("Cancelar", null)
            .show();
    }

    /**
     * Esconde as barras do sistema.
     *
     * Chamado em onResume e a cada vez que o foco volta porque o Android as
     * traz de volta sozinho — depois de um diálogo, de uma notificação, de um
     * toque na borda. Esconder só uma vez no onCreate deixa a barra reaparecer
     * no primeiro toque e nunca mais sair.
     */
    private void esconderBarras() {
        int flags = View.SYSTEM_UI_FLAG_LAYOUT_STABLE
                  | View.SYSTEM_UI_FLAG_LAYOUT_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_LAYOUT_FULLSCREEN
                  | View.SYSTEM_UI_FLAG_HIDE_NAVIGATION
                  | View.SYSTEM_UI_FLAG_FULLSCREEN;
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.KITKAT) {
            flags |= View.SYSTEM_UI_FLAG_IMMERSIVE_STICKY;
        }
        getWindow().getDecorView().setSystemUiVisibility(flags);
    }

    @Override
    protected void onResume() {
        super.onResume();
        esconderBarras();
    }

    @Override
    public void onWindowFocusChanged(boolean comFoco) {
        super.onWindowFocusChanged(comFoco);
        if (comFoco) esconderBarras();
    }

    /**
     * O botão voltar não sai do painel.
     *
     * Num quiosque, sair é o acidente mais fácil de cometer e o mais chato de
     * desfazer — alguém encosta, cai na tela inicial do Android, e o painel só
     * volta se outra pessoa reabrir o app. Voltar dentro do histórico do
     * WebView continua valendo.
     */
    @Override
    public void onBackPressed() {
        if (web.canGoBack()) web.goBack();
    }
}
