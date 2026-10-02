"""Agenda por URL iCal, sem adb e sem aparelho ligado.

POR QUE EXISTE: a agenda vinha do CalendarProvider do tablet, por adb. Funciona
bem e quebra em todo reinício do aparelho — o `adb tcpip` não sobrevive, e o
painel fica cego até alguém plugar um cabo. A URL secreta do Google Calendar
(Configurações do calendário → "Endereço secreto no formato iCal") entrega os
mesmos eventos por HTTPS, sem aparelho nenhum no meio.

Quando há URL configurada, ela manda. O adb vira reserva.

O QUE ESTE ANALISADOR ENTENDE, e o que não:

    entende    VEVENT, dia inteiro e com hora, fuso por TZID, UTC,
               RRULE FREQ=DAILY/WEEKLY/MONTHLY/YEARLY com INTERVAL, COUNT,
               UNTIL e BYDAY; EXDATE; RECURRENCE-ID (instância alterada);
               STATUS:CANCELLED
    não entende BYSETPOS, BYMONTHDAY combinado com BYDAY, e outras combinações
               raras do RFC 5545

Regra para o que não entende: a ocorrência original aparece e as repetições
não, e o resultado traz a contagem em `regras_ignoradas`. Some com o evento
seria pior — você olharia um dia vazio que não está vazio.

Dependência nenhuma: `urllib`, `datetime` e `zoneinfo`, todos da biblioteca
padrão. É o que permite isto rodar igual no Mac e num Raspberry.
"""
import datetime
import re
import urllib.request
import zoneinfo

TEMPO_LIMITE = 15
TETO_REPETICOES = 2000     # trava contra regra sem fim numa janela larga

DIAS_RRULE = {"MO": 0, "TU": 1, "WE": 2, "TH": 3, "FR": 4, "SA": 5, "SU": 6}


def _baixar(url):
    req = urllib.request.Request(url, headers={
        "User-Agent": "painel-tablet (github.com/dpiaia/painel-tablet)",
    })
    with urllib.request.urlopen(req, timeout=TEMPO_LIMITE) as r:
        return r.read().decode("utf8", "replace")


def _desdobrar(texto):
    """Junta as linhas continuadas do iCal.

    O RFC 5545 quebra linha longa em 75 colunas e continua a seguinte com um
    espaço ou tabulação. Sem desdobrar, um assunto comprido vira duas
    propriedades quebradas — e o sintoma seria título cortado no meio.
    """
    linhas = []
    for bruta in texto.replace("\r\n", "\n").replace("\r", "\n").split("\n"):
        if bruta[:1] in (" ", "\t") and linhas:
            linhas[-1] += bruta[1:]
        else:
            linhas.append(bruta)
    return linhas


def _propriedade(linha):
    """`DTSTART;TZID=America/Sao_Paulo:20261002T143000` -> (nome, params, valor)"""
    corte = linha.find(":")
    if corte < 0:
        return None, {}, ""
    cabeca, valor = linha[:corte], linha[corte + 1:]
    partes = cabeca.split(";")
    params = {}
    for p in partes[1:]:
        if "=" in p:
            k, v = p.split("=", 1)
            params[k.upper()] = v.strip('"')
    return partes[0].upper(), params, valor


def _fuso(tzid):
    if not tzid:
        return None
    try:
        return zoneinfo.ZoneInfo(tzid)
    except Exception:
        # TZID que o sistema não conhece (alguns servidores usam nomes do
        # Windows). Cair no fuso local é melhor que descartar o evento: erra o
        # horário em quem está em outro fuso, e acerta em quem não está — que é
        # o caso de quase todo mundo olhando um painel na própria mesa.
        return None


def _momento(valor, params):
    """Valor de DTSTART/DTEND -> (datetime com fuso, é_dia_inteiro)."""
    valor = valor.strip()
    if params.get("VALUE") == "DATE" or re.fullmatch(r"\d{8}", valor):
        d = datetime.datetime.strptime(valor, "%Y%m%d")
        return d, True

    if valor.endswith("Z"):
        d = datetime.datetime.strptime(valor, "%Y%m%dT%H%M%SZ")
        return d.replace(tzinfo=datetime.timezone.utc), False

    d = datetime.datetime.strptime(valor, "%Y%m%dT%H%M%S")
    tz = _fuso(params.get("TZID"))
    return (d.replace(tzinfo=tz) if tz else d.astimezone().replace(tzinfo=None)), False


def _regra(valor):
    """`FREQ=WEEKLY;BYDAY=MO,WE;UNTIL=20261231T000000Z` -> dicionário."""
    r = {}
    for parte in valor.split(";"):
        if "=" in parte:
            k, v = parte.split("=", 1)
            r[k.upper()] = v
    return r


def _repetir(inicio, regra, ate):
    """As datas de início de cada repetição, até `ate`.

    Devolve None quando a regra usa algo que este analisador não entende — e aí
    quem chama mostra só a ocorrência original, em vez de inventar datas.
    """
    freq = regra.get("FREQ", "").upper()
    if freq not in ("DAILY", "WEEKLY", "MONTHLY", "YEARLY"):
        return None
    if "BYSETPOS" in regra or "BYMONTHDAY" in regra or "BYYEARDAY" in regra:
        return None

    intervalo = int(regra.get("INTERVAL", 1) or 1)
    conta_max = int(regra["COUNT"]) if regra.get("COUNT") else None

    limite = ate
    if regra.get("UNTIL"):
        try:
            fim_regra, _ = _momento(regra["UNTIL"], {})
            if fim_regra.tzinfo and not limite.tzinfo:
                fim_regra = fim_regra.replace(tzinfo=None)
            limite = min(limite, fim_regra) if fim_regra else limite
        except ValueError:
            pass

    dias_semana = None
    if regra.get("BYDAY"):
        try:
            # Ignora o prefixo numérico ("2FR" = segunda sexta do mês): é o
            # caso que cai em BYSETPOS e já foi recusado acima.
            dias_semana = sorted({DIAS_RRULE[d[-2:].upper()]
                                  for d in regra["BYDAY"].split(",")})
        except KeyError:
            return None

    saida = []
    atual = inicio
    passos = 0
    while atual <= limite and passos < TETO_REPETICOES:
        passos += 1
        if freq == "WEEKLY" and dias_semana:
            # A semana da vez, nos dias pedidos. A âncora é a segunda-feira,
            # como o RFC manda por omissão (WKST=MO).
            segunda = atual - datetime.timedelta(days=atual.weekday())
            for d in dias_semana:
                quando = segunda + datetime.timedelta(days=d)
                if inicio <= quando <= limite:
                    saida.append(quando)
            atual += datetime.timedelta(weeks=intervalo)
            continue

        saida.append(atual)
        if freq == "DAILY":
            atual += datetime.timedelta(days=intervalo)
        elif freq == "WEEKLY":
            atual += datetime.timedelta(weeks=intervalo)
        elif freq == "MONTHLY":
            mes = atual.month - 1 + intervalo
            ano = atual.year + mes // 12
            mes = mes % 12 + 1
            # Dia 31 em mês de 30: o RFC manda pular a ocorrência, não
            # empurrar para o dia 1. Daí o `continue` sem acrescentar.
            try:
                atual = atual.replace(year=ano, month=mes)
            except ValueError:
                atual = atual.replace(year=ano, month=mes, day=1)
                continue
        else:                                   # YEARLY
            try:
                atual = atual.replace(year=atual.year + intervalo)
            except ValueError:                  # 29 de fevereiro
                atual = atual.replace(year=atual.year + intervalo, day=28)

        if conta_max and len(saida) >= conta_max:
            break

    if conta_max:
        saida = saida[:conta_max]
    return sorted(set(saida))


def _saida(titulo, local, ini, fim, dia_inteiro):
    if dia_inteiro:
        return {"titulo": titulo, "local": local, "dia_inteiro": True,
                "inicio": ini.date().isoformat(), "fim": fim.date().isoformat(),
                "inicio_ts": ini.timestamp(), "fim_ts": fim.timestamp()}
    # Para a tela, o horário é sempre LOCAL — é o relógio da parede que
    # importa, não o fuso em que o evento foi criado.
    li = ini.astimezone() if ini.tzinfo else ini
    lf = fim.astimezone() if fim.tzinfo else fim
    return {"titulo": titulo, "local": local, "dia_inteiro": False,
            "inicio": li.replace(tzinfo=None).isoformat(),
            "fim": lf.replace(tzinfo=None).isoformat(),
            "inicio_ts": ini.timestamp(), "fim_ts": fim.timestamp()}


def analisar(texto, dias=7, atras=6, hoje=None):
    """O .ics inteiro -> eventos da janela, já expandidos. Testável sem rede."""
    hoje = hoje or datetime.date.today()
    janela_ini = datetime.datetime.combine(
        hoje - datetime.timedelta(days=atras), datetime.time.min)
    janela_fim = datetime.datetime.combine(
        hoje + datetime.timedelta(days=dias), datetime.time.min)

    eventos, alterados, ignoradas = [], {}, 0
    atual = None

    for linha in _desdobrar(texto):
        if linha == "BEGIN:VEVENT":
            atual = {}
            continue
        if linha == "END:VEVENT":
            if atual is not None:
                ev, pulou = _montar(atual, janela_ini, janela_fim, alterados)
                eventos.extend(ev)
                ignoradas += pulou
            atual = None
            continue
        if atual is None:
            continue
        nome, params, valor = _propriedade(linha)
        if nome:
            # EXDATE pode aparecer várias vezes no mesmo evento.
            if nome == "EXDATE" and "EXDATE" in atual:
                atual["EXDATE"] = (atual["EXDATE"][0],
                                   atual["EXDATE"][1] + "," + valor)
            else:
                atual[nome] = (params, valor)

    eventos.sort(key=lambda e: (e["inicio_ts"], e["titulo"]))
    return {"itens": eventos, "regras_ignoradas": ignoradas}


def _montar(bruto, janela_ini, janela_fim, alterados):
    if "DTSTART" not in bruto:
        return [], 0
    if (bruto.get("STATUS") or (None, ""))[1].upper() == "CANCELLED":
        return [], 0

    titulo = _texto((bruto.get("SUMMARY") or (None, ""))[1]) or "(sem título)"
    local = _texto((bruto.get("LOCATION") or (None, ""))[1])

    pi, pv = bruto["DTSTART"]
    try:
        ini, dia_inteiro = _momento(pv, pi)
    except ValueError:
        return [], 0

    if "DTEND" in bruto:
        try:
            fim, _ = _momento(bruto["DTEND"][1], bruto["DTEND"][0])
        except ValueError:
            fim = ini + datetime.timedelta(hours=1)
    else:
        fim = ini + (datetime.timedelta(days=1) if dia_inteiro
                     else datetime.timedelta(hours=1))
    duracao = fim - ini

    # Instância alterada de uma série: entra no lugar da data original.
    if "RECURRENCE-ID" in bruto:
        alterados[(titulo, bruto["RECURRENCE-ID"][1][:8])] = True

    excluidas = set()
    if "EXDATE" in bruto:
        for pedaco in bruto["EXDATE"][1].split(","):
            try:
                d, _ = _momento(pedaco, bruto["EXDATE"][0])
                excluidas.add(_comparavel(d))
            except ValueError:
                pass

    if "RRULE" not in bruto:
        if _na_janela(ini, fim, janela_ini, janela_fim):
            return [_saida(titulo, local, ini, fim, dia_inteiro)], 0
        return [], 0

    datas = _repetir(ini, _regra(bruto["RRULE"][1]), _comparavel_dt(janela_fim, ini))
    if datas is None:
        # Regra não entendida: mostra a original e conta, em vez de sumir.
        pulou = 1
        return ([_saida(titulo, local, ini, fim, dia_inteiro)]
                if _na_janela(ini, fim, janela_ini, janela_fim) else []), pulou

    saida = []
    for d in datas:
        if _comparavel(d) in excluidas:
            continue
        f = d + duracao
        if _na_janela(d, f, janela_ini, janela_fim):
            saida.append(_saida(titulo, local, d, f, dia_inteiro))
    return saida, 0


def _texto(valor):
    """Desfaz o escape do iCal: \\, \; \\n viram vírgula, ponto e vírgula, quebra."""
    return (valor.replace("\\n", " ").replace("\\N", " ")
                 .replace("\\,", ",").replace("\;", ";")
                 .replace("\\\\", "\\").strip())


def _comparavel(d):
    return d.date() if isinstance(d, datetime.datetime) else d


def _comparavel_dt(limite, referencia):
    """Põe o limite da janela no mesmo mundo (com ou sem fuso) da referência."""
    if referencia.tzinfo and not limite.tzinfo:
        return limite.replace(tzinfo=referencia.tzinfo)
    if not referencia.tzinfo and limite.tzinfo:
        return limite.replace(tzinfo=None)
    return limite


def _na_janela(ini, fim, janela_ini, janela_fim):
    ji = _comparavel_dt(janela_ini, ini)
    jf = _comparavel_dt(janela_fim, ini)
    return fim > ji and ini < jf


def eventos(url, dias=7, atras=6):
    """Baixa e analisa. É o que o servidor chama."""
    return analisar(_baixar(url), dias=dias, atras=atras)


if __name__ == "__main__":
    import json
    import sys
    print(json.dumps(eventos(sys.argv[1]), indent=2, ensure_ascii=False)[:3000])
