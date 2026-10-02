#!/usr/bin/env python3
"""Casos que já quebraram o analisador de iCal, para não quebrarem de novo.

Sem framework de teste: roda com `python3 ferramentas/testar_ical.py` e grita
se algo mudou. O projeto não tem dependência, e isto também não precisa ter.

Cada caso aqui existe porque ERROU uma vez. O mais caro foi o último — ele só
apareceu quando rodamos contra uma agenda de verdade, com 1838 eventos.
"""
import datetime
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import ical                                                  # noqa: E402

HOJE = datetime.date(2026, 10, 5)


def ics(*linhas):
    return "\r\n".join(("BEGIN:VCALENDAR", "VERSION:2.0") + linhas + ("END:VCALENDAR",))


def eventos(texto):
    return ical.analisar(texto, dias=7, atras=6, hoje=HOJE)["itens"]


FALHAS = []


def confere(nome, obtido, esperado):
    if obtido == esperado:
        print("  ok    %s" % nome)
    else:
        FALHAS.append(nome)
        print("  FALHA %s\n        esperado: %r\n        obtido:   %r"
              % (nome, esperado, obtido))


# --- dia inteiro: fim EXCLUSIVO, como o painel espera
e = eventos(ics("BEGIN:VEVENT", "UID:1", "DTSTART;VALUE=DATE:20261005",
                "DTEND;VALUE=DATE:20261006", "SUMMARY:Feriado", "END:VEVENT"))
confere("dia inteiro com fim exclusivo",
        (e[0]["inicio"], e[0]["fim"], e[0]["dia_inteiro"]),
        ("2026-10-05", "2026-10-06", True))

# --- UTC vira horário local
e = eventos(ics("BEGIN:VEVENT", "UID:2", "DTSTART:20261006T170000Z",
                "DTEND:20261006T173000Z", "SUMMARY:UTC", "END:VEVENT"))
confere("UTC convertido para local", e[0]["inicio"][11:16],
        datetime.datetime.fromtimestamp(e[0]["inicio_ts"]).strftime("%H:%M"))

# --- dobra de linha do RFC 5545
e = eventos(ics("BEGIN:VEVENT", "UID:3", "DTSTART;TZID=America/Sao_Paulo:20261006T080000",
                "SUMMARY:Titulo que o Google quebra em duas li", " nhas",
                "END:VEVENT"))
confere("dobra de linha remontada", e[0]["titulo"],
        "Titulo que o Google quebra em duas linhas")

# --- COUNT limita as repetições
e = eventos(ics("BEGIN:VEVENT", "UID:4", "DTSTART;TZID=America/Sao_Paulo:20261002T090000",
                "RRULE:FREQ=DAILY;COUNT=3", "SUMMARY:Tres", "END:VEVENT"))
confere("COUNT=3 gera três", len(e), 3)

# --- EXDATE remove a ocorrência
e = eventos(ics("BEGIN:VEVENT", "UID:5", "DTSTART;TZID=America/Sao_Paulo:20261002T090000",
                "RRULE:FREQ=DAILY;COUNT=3",
                "EXDATE;TZID=America/Sao_Paulo:20261003T090000",
                "SUMMARY:Dois", "END:VEVENT"))
confere("EXDATE tira uma das três", len(e), 2)

# --- cancelado não aparece
e = eventos(ics("BEGIN:VEVENT", "UID:6", "DTSTART;TZID=America/Sao_Paulo:20261005T100000",
                "STATUS:CANCELLED", "SUMMARY:Cancelado", "END:VEVENT"))
confere("STATUS:CANCELLED some", len(e), 0)

# --- regra que o analisador não entende: mostra a original e CONTA
r = ical.analisar(ics("BEGIN:VEVENT", "UID:7",
                      "DTSTART;TZID=America/Sao_Paulo:20261006T160000",
                      "RRULE:FREQ=MONTHLY;BYMONTHDAY=1,15", "SUMMARY:Nao sei",
                      "END:VEVENT"), hoje=HOJE)
confere("regra desconhecida conta e mostra a original",
        (len(r["itens"]), r["regras_ignoradas"]), (1, 1))

# --- O CASO CARO: instância remarcada não pode duplicar.
#
# Uma série semanal com UMA ocorrência alterada vira, no arquivo, a série com
# RRULE mais um VEVENT separado com RECURRENCE-ID. Expandir a regra sem olhar
# o segundo gera a data original E a alterada — a reunião aparece duas vezes
# no mesmo dia. E o VEVENT da alteração vem DEPOIS no arquivo, às vezes
# centenas de eventos depois, que é por que o analisador lê tudo antes de
# expandir qualquer coisa.
e = eventos(ics(
    "BEGIN:VEVENT", "UID:serie@google.com",
    "DTSTART;TZID=America/Sao_Paulo:20260511T140000",
    "RRULE:FREQ=WEEKLY;BYDAY=MO", "SUMMARY:Design Sync", "END:VEVENT",
    "BEGIN:VEVENT", "UID:serie@google.com",
    "RECURRENCE-ID;TZID=America/Sao_Paulo:20261005T140000",
    "DTSTART;TZID=America/Sao_Paulo:20261005T160000",
    "SUMMARY:Design Sync", "END:VEVENT"))
em_05 = [x for x in e if x["inicio"].startswith("2026-10-05")]
confere("instância remarcada não duplica", len(em_05), 1)
confere("e vale o horário novo, não o da regra",
        em_05[0]["inicio"][11:16] if em_05 else None, "16:00")

print()
if FALHAS:
    print("%d falha(s): %s" % (len(FALHAS), ", ".join(FALHAS)))
    sys.exit(1)
print("todos os casos passaram")
