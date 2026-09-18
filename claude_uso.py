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


def _amostras():
    """A série crua, ou lista vazia se o arquivo não existe/não abre."""
    try:
        with open(ARQUIVO, encoding="utf8") as fh:
            return json.load(fh).get("samples") or []
    except (OSError, ValueError):
        return []


def ler():
    """A leitura atual do plano: números de agora, a série do dia e a janela.

    Devolve `em` (quando a amostra foi tirada) para o painel poder dizer a
    idade: o app só grava enquanto está aberto, então uma leitura de três horas
    atrás é informação diferente de uma de agora.

    Lê o arquivo UMA vez e compõe tudo daí. Ele passa de um mega, e o laço do
    servidor chama isto a cada minuto — abrir três vezes para responder três
    perguntas sobre os mesmos dados seria desperdício puro.
    """
    amostras = _amostras()
    if not amostras:
        return None

    ultima = amostras[-1]
    u = ultima.get("u") or {}
    if "fh" not in u and "sd" not in u:
        return None

    serie = _recortar(amostras)
    return {
        "cinco_horas": u.get("fh"),
        "semanal": u.get("sd"),
        "em": (ultima.get("t") or 0) / 1000.0,
        "amostras": len(amostras),
        "historico": serie,
        "virou_em": zerou_em(serie),
    }


def _recortar(amostras, horas=24, teto=96):
    """As amostras das últimas `horas`, para a tela expandida desenhar a curva.

    O arquivo guarda mais de mil amostras, uma a cada ~15 minutos — cerca de
    doze dias. Mandar tudo para o tablet junto de cada atualização seria
    desperdício: a pergunta que a curva responde ("estou queimando rápido?")
    se responde com o dia de hoje.

    `teto` limita o número de pontos. Num gráfico de meia tela de largura, mais
    de umas cem amostras viram traços em cima de traços — e a série viaja no
    mesmo empurrão SSE que tudo o mais, a cada quinze segundos.
    """
    corte = (time.time() - horas * 3600) * 1000
    recentes = [a for a in amostras if (a.get("t") or 0) >= corte]
    if len(recentes) > teto:
        # Amostragem uniforme, mas o ÚLTIMO ponto é sempre mantido: é ele que
        # tem que bater com o número grande mostrado ao lado do gráfico.
        passo = len(recentes) / float(teto)
        escolhidos = [recentes[int(i * passo)] for i in range(teto)]
        if escolhidos[-1] is not recentes[-1]:
            escolhidos.append(recentes[-1])
        recentes = escolhidos

    saida = []
    for a in recentes:
        u = a.get("u") or {}
        saida.append({"t": round((a.get("t") or 0) / 1000.0),
                      "fh": u.get("fh"), "sd": u.get("sd")})
    return saida


def zerou_em(serie):
    """Quando a janela de 5 horas virou pela última vez, olhando a série.

    O arquivo não guarda horário de reinício; ele aparece como uma QUEDA. A
    porcentagem só sobe enquanto a janela dura, então QUALQUER queda é uma
    janela nova — não é preciso limiar, e um limiar erraria justamente os
    reinícios calmos (3% que voltam a 0).

    Derivar é melhor que estimar pelo relógio: a janela não começa numa hora
    redonda, começa quando você mandou a primeira mensagem dela. Devolve None
    quando não houve queda nenhuma na série — aí o painel diz que não sabe, em
    vez de chutar "cinco horas atrás".
    """
    anterior = None
    quando = None
    for a in serie:
        atual = a.get("fh")
        if atual is None:
            continue
        if anterior is not None and atual < anterior:
            quando = a.get("t")
        anterior = atual
    return quando


if __name__ == "__main__":
    d = ler() or {}
    serie = d.pop("historico", [])
    print(json.dumps(d, indent=2, ensure_ascii=False))
    print("historico: %d pontos" % len(serie))
    z = d.get("virou_em")
    if z:
        print("janela de 5h começou %s, fecha %s" % (
            time.strftime("%H:%M", time.localtime(z)),
            time.strftime("%H:%M", time.localtime(z + 5 * 3600))))
