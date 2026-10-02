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
        // As três que faltavam, e que o provedor já entregava de graça:
        CalendarContract.Instances.CALENDAR_COLOR,
        CalendarContract.Instances.CALENDAR_DISPLAY_NAME,
        CalendarContract.Instances.AVAILABILITY,
        CalendarContract.Instances.DESCRIPTION,
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

                /* A COR DO CALENDÁRIO, convertida aqui para o mesmo "#rrggbb"
                 * que o CSS entende. O Android guarda como inteiro com sinal, e
                 * mandar o número cru obrigaria o painel a saber disso.
                 *
                 * Ela importa porque nove calendários de três contas caem numa
                 * lista só: sem cor, "Casa" da conta do trabalho fica
                 * indistinguível de "Design Sessions". A cor é a mesma que você
                 * já conhece do Google Agenda, então não há nada para aprender. */
                e.put("cor", String.format("#%06X", cur.getInt(6) & 0xFFFFFF));
                String agenda = cur.getString(7);
                e.put("agenda", agenda == null ? "" : agenda.trim());

                /* OCUPADO OU LIVRE. "Casa" e "Escritório" são marcadores de
                 * onde você está, não compromissos — o Google os marca como
                 * livres. Tratá-los igual a uma reunião enche o cartão de
                 * linhas que não exigem nada de você. */
                e.put("ocupado",
                      cur.getInt(8) == CalendarContract.Instances.AVAILABILITY_BUSY);

                /* Chamada ou presencial. O link do Meet vem enterrado na
                 * descrição; o painel não precisa dele (ele é vidro, não
                 * abre nada), mas saber que a reunião é remota muda o que
                 * você faz nos cinco minutos antes dela. */
                String desc = cur.getString(9);
                String onde = (desc == null ? "" : desc) + " " + (local == null ? "" : local);
                e.put("remoto", onde.contains("meet.google.com")
                             || onde.contains("zoom.us")
                             || onde.contains("teams.microsoft.com"));
                saida.put(e);
            }
        } finally {
            cur.close();
        }
        return saida;
    }
}
