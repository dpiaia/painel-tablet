"""Agenda lida do próprio tablet, via adb.

A conta do Google já está logada no Android e o CalendarProvider já tem tudo
sincronizado. Ler dali dispensa API do Google, OAuth e aprovação de admin — que
é exatamente o que está bloqueado na conta do trabalho. O aparelho que ia só
mostrar a agenda acabou virando a fonte dela.

O preço: depende do adb alcançar o tablet. Quando não alcança, quem chama fica
com o último resultado bom e o painel avisa que está velho — melhor do que
apagar a agenda da tela e deixar você achar que o dia está livre.
"""
import datetime
import re
import subprocess

URI = "content://com.android.calendar/instances/when/%d/%d"
CAMPOS = ["begin", "end", "allDay", "selfAttendeeStatus", "eventLocation", "title"]

# Só corta a vírgula que vem imediatamente antes de um campo conhecido. Título
# com vírgula é comum ("Handover, parte 2") e quebraria um split ingênuo.
SEPARADOR = re.compile(r",\s*(?=(?:%s)=)" % "|".join(CAMPOS))

RECUSADO = "2"   # Calendar.Attendees.ATTENDEE_STATUS_DECLINED


def _adb(args, adb, serial=None, timeout=25):
    cmd = [adb] + (["-s", serial] if serial else []) + args
    return subprocess.run(cmd, capture_output=True, text=True, timeout=timeout)


def _conectado(adb, serial):
    """Garante que o adb enxerga o tablet, reconectando se o Wi-Fi caiu."""
    achado = _adb(["devices"], adb, timeout=10).stdout
    if "%s\tdevice" % serial in achado:
        return True
    _adb(["connect", serial], adb, timeout=10)
    return "%s\tdevice" % serial in _adb(["devices"], adb, timeout=10).stdout


def _campos(linha):
    if not linha.startswith("Row:"):
        return None
    partes = linha.split(" ", 2)
    if len(partes) < 3:
        return None
    saida = {}
    for pedaco in SEPARADOR.split(partes[2]):
        if "=" in pedaco:
            chave, valor = pedaco.split("=", 1)
            saida[chave.strip()] = valor
    return saida


def _converter(c):
    dia_inteiro = c.get("allDay") == "1"
    try:
        inicio_ms = int(c["begin"])
        fim_ms = int(c["end"])
    except (KeyError, ValueError):
        return None

    if dia_inteiro:
        # Evento de dia inteiro é gravado como meia-noite UTC. Converter para o
        # fuso local jogaria "hoje" para ontem aqui no Brasil (UTC-3).
        inicio = datetime.datetime.utcfromtimestamp(inicio_ms / 1000).date().isoformat()
        fim = datetime.datetime.utcfromtimestamp(fim_ms / 1000).date().isoformat()
    else:
        inicio = datetime.datetime.fromtimestamp(inicio_ms / 1000).isoformat()
        fim = datetime.datetime.fromtimestamp(fim_ms / 1000).isoformat()

    # O título vai inteiro, como está na agenda. Já tentei extrair "[Handover]"
    # como categoria e estava errado: aquilo é parte do nome da reunião, e
    # remover empobrecia o título. O Google não guarda categoria nenhuma aqui.
    return {
        "titulo": (c.get("title") or "(sem título)").strip(),
        "inicio": inicio,
        "fim": fim,
        "inicio_ts": inicio_ms / 1000.0,
        "fim_ts": fim_ms / 1000.0,
        "dia_inteiro": dia_inteiro,
        "local": (c.get("eventLocation") or "").strip(),
    }


def eventos(adb, serial, dias=2):
    """Instâncias de hoje até `dias` à frente, já sem as que você recusou."""
    if not _conectado(adb, serial):
        raise RuntimeError("tablet inalcançável pelo adb (%s)" % serial)

    hoje = datetime.date.today()
    ini = int(datetime.datetime.combine(hoje, datetime.time.min).timestamp() * 1000)
    fim = int(datetime.datetime.combine(
        hoje + datetime.timedelta(days=dias), datetime.time.min).timestamp() * 1000)

    r = _adb(["shell", "content", "query",
              "--uri", URI % (ini, fim),
              "--projection", ":".join(CAMPOS)], adb, serial)
    if r.returncode != 0:
        raise RuntimeError("content query falhou: %s" % (r.stderr or r.stdout).strip())

    achados = []
    for linha in r.stdout.splitlines():
        c = _campos(linha.strip())
        if not c or c.get("selfAttendeeStatus") == RECUSADO:
            continue
        item = _converter(c)
        if item:
            achados.append(item)

    # Ordenar aqui e não no aparelho: o --sort do content query precisa de aspas
    # que sobrevivam a duas camadas de shell, e não vale o risco por isto.
    achados.sort(key=lambda e: (e["inicio_ts"], e["titulo"]))
    return achados


if __name__ == "__main__":
    import json
    import sys
    print(json.dumps(eventos(sys.argv[1] if len(sys.argv) > 1 else "/opt/homebrew/bin/adb",
                             "192.168.0.20:5555"), ensure_ascii=False, indent=2))
