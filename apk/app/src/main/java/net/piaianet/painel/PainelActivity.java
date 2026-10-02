package net.piaianet.painel;

import android.app.Activity;
import android.app.AlertDialog;
import android.content.Context;
import android.content.SharedPreferences;
import android.graphics.Color;
import android.os.Build;
import android.os.Bundle;
import android.text.InputType;
import android.view.View;
import android.view.WindowManager;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.EditText;
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
    private static final String URL_PADRAO = "http://192.168.0.69:8766";

    private WebView web;

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

        web.loadUrl(endereco());
    }

    private SharedPreferences prefs() {
        return getSharedPreferences(PREFS, Context.MODE_PRIVATE);
    }

    private String endereco() {
        return prefs().getString(CHAVE_URL, URL_PADRAO);
    }

    private void perguntarEndereco() {
        final EditText campo = new EditText(this);
        campo.setInputType(InputType.TYPE_TEXT_VARIATION_URI);
        campo.setText(endereco());

        new AlertDialog.Builder(this)
            .setTitle("Endereço do painel")
            .setMessage("Onde o servidor está rodando. Em breve o app acha sozinho.")
            .setView(campo)
            .setPositiveButton("Salvar", (d, b) -> {
                String novo = campo.getText().toString().trim();
                if (novo.isEmpty()) return;
                prefs().edit().putString(CHAVE_URL, novo).apply();
                Toast.makeText(this, novo, Toast.LENGTH_SHORT).show();
                web.loadUrl(novo);
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
