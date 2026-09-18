"""Uso do plano do Claude Code, lido do histórico que o app grava em disco.

DE ONDE VEM: o app do Claude mantém
`~/Library/Application Support/Claude/plan-usage-history.json`, com uma amostra
a cada ~15 minutos. Cada amostra tem duas porcentagens:

    fh  o limite de 5 horas   (dá para ver a janela zerando na série)
    sd  o semanal, todos os modelos

É a única fonte que um serviço de fundo alcança sem token, sem API e sem falar
com o app. Por isso é a base do cartão.

O QUE NÃO ESTÁ AQUI: o semanal do Fable e o contexto da sessão. O arquivo nunca
teve mais que essas duas chaves (conferido nas 1173 amostras), e o contexto é
um número do processo de cada sessão, que não é escrito em lugar nenhum. Esses
dois só chegam se uma sessão do Claude Code os EMPURRAR para /uso — e, até
empurrarem, o cartão diz que não tem leitura em vez de inventar.
"""
import json
import os
import time

ARQUIVO = os.path.expanduser(
    "~/Library/Application Support/Claude/plan-usage-history.json")


def ler():
    """A amostra mais recente, ou None se o arquivo não existe/não abre.

    Devolve também `em` (quando a amostra foi tirada) para o painel poder dizer
    a idade: o app só grava enquanto está aberto, então uma leitura de três
    horas atrás é informação diferente de uma de agora.
    """
    try:
        with open(ARQUIVO, encoding="utf8") as fh:
            dados = json.load(fh)
    except (OSError, ValueError):
        return None

    amostras = dados.get("samples") or []
    if not amostras:
        return None

    ultima = amostras[-1]
    u = ultima.get("u") or {}
    if "fh" not in u and "sd" not in u:
        return None

    return {
        "cinco_horas": u.get("fh"),
        "semanal": u.get("sd"),
        "em": (ultima.get("t") or 0) / 1000.0,
        "amostras": len(amostras),
    }


if __name__ == "__main__":
    print(json.dumps(ler(), indent=2, ensure_ascii=False))
