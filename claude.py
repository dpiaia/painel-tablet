"""Estado das sessões do Claude Code.

A verdade vem dos **hooks**: o próprio Claude Code avisa quando começou a
trabalhar, quando precisa de você e quando terminou. Isso é evento exato, no
instante exato — diferente de espiar o fim da transcrição e adivinhar, que é o
que o `sdpro-clock` faz hoje.

Mas hook tem um buraco: se a sessão morre de forma feia (crash, `kill`, o Mac
reiniciando), o `SessionEnd` nunca chega e ela fica eternamente "trabalhando"
na tela. É para isso que existe a poda aqui embaixo — a rede de segurança.
"""
import glob
import json
import os
import subprocess
import time

# O que cada evento significa para a tela.
MAPA = {
    "SessionStart":     "parado",
    "UserPromptSubmit": "trabalhando",
    "Notification":     "atencao",       # pedindo permissão ou uma resposta
    "Stop":             "pronto",        # devolveu a vez: acabou o turno
    "SessionEnd":       "remover",
}

# Qual estado ganha quando há várias sessões. "Precisa de você" vem primeiro
# porque é o único que exige ação sua — o resto é informação.
PRIORIDADE = ["atencao", "trabalhando", "pronto", "parado"]

VALIDADE = 6 * 3600     # sessão sem nenhum evento por 6h é considerada morta


def _sessoes(n):
    """Plural de 'sessão' é 'sessões' — não 'sessãoes'."""
    return "1 sessão" if n == 1 else "%d sessões" % n


def titulo(caminho):
    """O nome que a sessão tem no Claude Code, lido da transcrição.

    Vale muito mais que o nome da pasta: "Projeto para tablet antigo" diz o que
    é; "Projects" não diz nada. Fica gravado como um registro `custom-title` no
    .jsonl, e o último vence (o título pode mudar durante a sessão).
    """
    if not caminho or not os.path.exists(caminho):
        return None
    achado = None
    try:
        with open(caminho, encoding="utf8", errors="replace") as fh:
            for linha in fh:
                # Filtro por texto antes de parsear: a transcrição tem milhares
                # de linhas e quase nenhuma é esta.
                if '"custom-title"' not in linha:
                    continue
                try:
                    t = json.loads(linha).get("customTitle")
                except ValueError:
                    continue
                if t:
                    achado = t.strip()
    except OSError:
        return None
    return achado or None


def processos_vivos():
    """Quantos processos do Claude Code existem. -1 se não deu para saber."""
    try:
        ps = subprocess.run(["ps", "-axo", "command="],
                            capture_output=True, text=True, timeout=5).stdout
    except (subprocess.SubprocessError, OSError):
        return -1
    return sum(1 for l in ps.splitlines()
               if "/claude.app/Contents/MacOS/claude" in l and "--type=" not in l)


def aplicar(sessoes, evento, id_sessao, projeto, transcricao=None):
    """Aplica um evento de hook ao registro. Devolve True se mudou algo."""
    estado = MAPA.get(evento)
    if not estado or not id_sessao:
        return False                      # SubagentStop, PreToolUse etc: ignora

    if estado == "remover":
        return sessoes.pop(id_sessao, None) is not None

    antigo = sessoes.get(id_sessao) or {}

    # O título é relido de vez em quando, não a cada evento: varrer o .jsonf
    # inteiro em todo PreToolUse seria caro, mas o título pode mudar no meio.
    rotulo = antigo.get("rotulo")
    lido_em = antigo.get("titulo_em", 0)
    if transcricao and (not rotulo or time.time() - lido_em > 120):
        rotulo = titulo(transcricao) or rotulo
        lido_em = time.time()

    sessoes[id_sessao] = {
        "projeto": projeto or antigo.get("projeto") or "?",
        "transcricao": transcricao or antigo.get("transcricao"),
        "rotulo": rotulo or projeto or antigo.get("projeto") or "?",
        "estado": estado,
        "em": time.time(),
        "titulo_em": lido_em,
    }
    return antigo.get("estado") != estado or antigo.get("rotulo") != rotulo


def transcricao_de(id_sessao, guardada=None):
    if guardada and os.path.exists(guardada):
        return guardada
    achados = glob.glob(os.path.expanduser("~/.claude/projects/*/%s.jsonl" % id_sessao))
    return achados[0] if achados else None


def reconciliar(sessoes, margem=4):
    """Conserta 'precisa de você' que na verdade voltou a trabalhar.

    O hook `Notification` dispara quando o Claude pede uma permissão. Quando
    você aprova, ele volta a trabalhar **sem disparar hook nenhum** — não houve
    prompt novo, então nem UserPromptSubmit nem Stop acontecem. A sessão ficava
    presa em 'atencao' para sempre, e o painel pedia sua atenção enquanto o
    Claude trabalhava sozinho. Aconteceu de verdade, por meia hora.

    O sinal que separa os dois casos: a transcrição **cresce** enquanto ele
    trabalha e fica **parada** enquanto ele espera você. É barato de checar
    (um `stat`) e não precisa de hook por ferramenta.
    """
    mudou = False
    for id_sessao, s in sessoes.items():
        if s.get("estado") != "atencao":
            continue
        caminho = transcricao_de(id_sessao, s.get("transcricao"))
        if not caminho:
            continue
        try:
            escrita = os.path.getmtime(caminho)
        except OSError:
            continue
        if escrita > s["em"] + margem:
            s["estado"] = "trabalhando"
            s["em"] = escrita
            s["transcricao"] = caminho
            mudou = True
    return mudou


def podar(sessoes):
    """Tira sessões que morreram sem avisar. Devolve True se mudou algo."""
    antes = len(sessoes)

    vivos = processos_vivos()
    if vivos == 0:
        # Nenhum Claude rodando: o que sobrou no registro é fantasma.
        sessoes.clear()
        return antes > 0

    agora = time.time()
    for k in [k for k, s in sessoes.items() if agora - s["em"] > VALIDADE]:
        del sessoes[k]
    return len(sessoes) != antes


def resumo(sessoes, vivos=None):
    """O que o cartão mostra: um estado só, e uma frase.

    `vivos` é a contagem de processos do Claude Code. Sem ela, registro vazio
    vira "nenhuma sessão aberta" — o que é mentira quando existe sessão que
    começou antes dos hooks serem instalados. Não saber e não ter são coisas
    diferentes, e o painel não pode confundir as duas.
    """
    if not sessoes:
        if vivos and vivos > 0:
            quem = "ela começou" if vivos == 1 else "começaram"
            return {"estado": "desconhecido", "sessoes": [],
                    "detalhe": "Há %s rodando, mas %s antes dos hooks. "
                               "Abra uma nova para aparecer aqui."
                               % (_sessoes(vivos), quem)}
        return {"estado": "parado", "detalhe": "Nenhuma sessão aberta.",
                "sessoes": []}

    lista = sorted(sessoes.values(), key=lambda s: -s["em"])
    for estado in PRIORIDADE:
        iguais = [s for s in lista if s["estado"] == estado]
        if iguais:
            break

    projeto = iguais[0].get("rotulo") or iguais[0]["projeto"]
    outras = len(lista) - 1
    mais = " (e mais %s)" % _sessoes(outras) if outras > 0 else ""

    frases = {
        "atencao":     "%s está esperando a sua resposta." % projeto,
        "trabalhando": "Trabalhando em %s." % projeto,
        "pronto":      "Terminou em %s." % projeto,
        "parado":      "Sessão aberta em %s, sem tarefa." % projeto,
    }
    return {"estado": estado, "detalhe": frases[estado] + mais, "sessoes": lista}
