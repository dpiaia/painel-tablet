package net.piaianet.painel;

import android.content.ContentUris;
import android.content.Context;
import android.database.Cursor;
import android.net.Uri;
import android.provider.CalendarContract;

import org.json.JSONArray;
import org.json.JSONObject;

import java.util.Calendar;

/**
 * A agenda, lida de dentro do próprio tablet.
 *
 * POR QUE AQUI E NÃO PELA REDE: a agenda do trabalho não sai do Google por via
 * externa nenhuma — testamos todas. Feed público dá 404, endereço secreto está
 * desligado pelo administrador do domínio, a API pede verificação paga e o
 * banco do Calendar do macOS é bloqueado pelo sistema.
 *
 * O que funciona é ler de onde a conta JÁ está autorizada: este aparelho. O
 * administrador permitiu a conta aqui quando você fez login, e o Android
 * sincroniza os eventos sozinho. Um app com READ_CALENDAR só precisa olhar.
 *
 * ISTO SUBSTITUI O ADB. Era o adb que fazia esta leitura, de fora, e ele morria
 * em todo reinício do tablet — três vezes nas últimas semanas. De dentro, não
 * há nada para cair.
 *
 * USA `Instances` E NÃO `Events`: a tabela de eventos guarda a REGRA de
 * repetição ("toda segunda às 14h"), não as datas. A de instâncias é o próprio
 * Android expandindo a regra, com as exceções e as ocorrências remarcadas já
 * aplicadas — o mesmo trabalho que o analisador de .ics teve que fazer à mão, e
 * aqui sai de graça e certo.
 */
class Agenda {

    private static final String[] CAMPOS = {
        CalendarContract.Instances.TITLE,
        CalendarContract.Instances.BEGIN,
        CalendarContract.Instances.END,
        CalendarContract.Instances.ALL_DAY,
        CalendarContract.Instances.EVENT_LOCATION,
        CalendarContract.Instances.SELF_ATTENDEE_STATUS,
    };

    /** Convite recusado não é compromisso: ocupa linha e não vai acontecer. */
    private static final int RECUSADO = CalendarContract.Attendees.ATTENDEE_STATUS_DECLINED;

    /**
     * Os eventos da janela, no formato que o painel já desenha.
     *
     * A janela vai para TRÁS também: a tela cheia tem um modo "semana atual"
     * que mostra os dias já passados em cinza, e sem os eventos deles aquelas
     * colunas diriam "livre" num dia que foi cheio de reunião.
     */
    static JSONArray ler(Context ctx, int diasAtras, int diasFrente) throws Exception {
        Calendar c = Calendar.getInstance();
        c.set(Calendar.HOUR_OF_DAY, 0);
        c.set(Calendar.MINUTE, 0);
        c.set(Calendar.SECOND, 0);
        c.set(Calendar.MILLISECOND, 0);

        c.add(Calendar.DAY_OF_YEAR, -diasAtras);
        long de = c.getTimeInMillis();
        c.add(Calendar.DAY_OF_YEAR, diasAtras + diasFrente);
        long ate = c.getTimeInMillis();

        Uri.Builder uri = CalendarContract.Instances.CONTENT_URI.buildUpon();
        ContentUris.appendId(uri, de);
        ContentUris.appendId(uri, ate);

        JSONArray saida = new JSONArray();
        Cursor cur = ctx.getContentResolver().query(
            uri.build(), CAMPOS, null, null, CalendarContract.Instances.BEGIN + " ASC");
        if (cur == null) return saida;

        try {
            while (cur.moveToNext()) {
                if (cur.getInt(5) == RECUSADO) continue;

                JSONObject e = new JSONObject();
                String titulo = cur.getString(0);
                e.put("titulo", titulo == null || titulo.trim().isEmpty()
                                ? "(sem título)" : titulo.trim());
                e.put("inicio_ms", cur.getLong(1));
                e.put("fim_ms", cur.getLong(2));
                e.put("dia_inteiro", cur.getInt(3) == 1);
                String local = cur.getString(4);
                e.put("local", local == null ? "" : local.trim());
                saida.put(e);
            }
        } finally {
            cur.close();
        }
        return saida;
    }
}
