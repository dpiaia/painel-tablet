"""Os widgets do painel e o espaço que cada um precisa.

A GRADE: cada lado da tela tem 3 blocos de largura por 4 de altura — 12 blocos.
Internamente a largura é contada em 6 UNIDADES (meio bloco cada), e não em 3,
por um motivo só: duas peças do mesmo tamanho mínimo dividem a linha ao meio, e
metade de 3 não é inteiro. Com 6 unidades, meio a meio é 3 + 3.

    largura em blocos     1      2      3
    largura em unidades   2      4      6

O QUE CABE: os quatro cartões grandes (agenda, Claude, os dois do GitHub) pedem
3x2 = 6 blocos cada. Dois deles enchem um lado. Somando os mínimos de todos os
widgets dá 31 blocos para uma tela de 24 — por isso o SLIDER continua existindo:
um grupo de widgets alternando ocupa o espaço de um só.

`alterna` diz se o widget pode dividir uma célula com outros, revezando no
mesmo cartão. Só vale para os que são DESENHADOS por função a cada ciclo; o
relógio, o clima, o recado, a agenda e as mensagens são nós de verdade no HTML,
movidos para o lugar, e um nó não tem como estar em dois lugares ao mesmo
tempo. Não é preferência de desenho: é o que a peça é.

`min` é o mínimo, não o tamanho. Quem define o tamanho é o arranjo, no painel
de controle; aqui está só o piso abaixo do qual o cartão não tem como mostrar o
que promete.
"""

# Largura em BLOCOS (1 a 3) e altura em linhas (1 a 4).
LISTA = [
    {"id": "relogio", "alterna": False,    "nome": "Relógio",
     "dica": "hora, data e marcas do dia",            "min": [2, 1]},
    {"id": "clima", "alterna": False,      "nome": "Clima",
     "dica": "temperatura; a semana no toque",        "min": [1, 1]},
    {"id": "recado", "alterna": False,     "nome": "Recado",
     "dica": "o texto que você escrever",             "min": [1, 1]},
    {"id": "claude", "alterna": True,     "nome": "Claude Code",
     "dica": "estado das sessões",                    "min": [3, 2]},
    {"id": "git-meus", "alterna": True,   "nome": "Meus pull requests",
     "dica": "os PRs que você abriu",                 "min": [3, 2]},
    {"id": "git-design", "alterna": True, "nome": "PRs do repositório",
     "dica": "o repositório vigiado",                 "min": [3, 2]},
    {"id": "agenda", "alterna": False,     "nome": "Agenda",
     "dica": "compromissos de hoje e da semana",      "min": [3, 2]},
    {"id": "mensagens", "alterna": False,  "nome": "Mensagens",
     "dica": "Gmail, Chat e WhatsApp pela extensão",  "min": [2, 1]},
    {"id": "monitor", "alterna": True,    "nome": "Monitor do Mac",
     "dica": "CPU, memória e swap; processos no toque", "min": [1, 1]},
    {"id": "uso", "alterna": True,        "nome": "Monitor do Claude",
     "dica": "limite de 5 horas e semanal do plano",  "min": [1, 1]},
    {"id": "musica", "alterna": True,     "nome": "Música",
     "dica": "YouTube Music ou Spotify; tocador no toque", "min": [2, 1]},
]

IDS = [w["id"] for w in LISTA]
MINIMOS = {w["id"]: w["min"] for w in LISTA}
ALTERNA = {w["id"]: w["alterna"] for w in LISTA}

COLUNAS = 3       # blocos de largura por lado
UNIDADES = 6      # a mesma largura, em meios-blocos
LINHAS = 4        # blocos de altura por lado
POR_FAIXA = 2     # no máximo dois cartões na mesma linha


def minimo(ids):
    """O piso de um GRUPO: o maior mínimo entre os widgets que ele guarda.

    Um slider mostra um de cada vez, mas o cartão é um só — e ele precisa
    caber o mais exigente da leva, senão o dia em que aquele aparecer o
    conteúdo vaza.
    """
    larg, alt = 1, 1
    for i in ids:
        m = MINIMOS.get(i)
        if m:
            larg = max(larg, m[0])
            alt = max(alt, m[1])
    return [larg, alt]


def categoria(larg_blocos, alt):
    """P, M ou G — o nome do tamanho que o arranjo deu ao cartão.

    P é um bloco. M começa em dois de largura e vai até dois de altura. G é
    de três de largura para cima E mais de dois de altura: é o único que pede
    as duas coisas, porque é o tamanho em que um cartão deixa de ser um
    resumo e passa a ser uma tela.
    """
    if larg_blocos >= 3 and alt > 2:
        return "G"
    if larg_blocos >= 2 or alt >= 2:
        return "M"
    return "P"


# --------------------------------------------------------------- migração
#
# O arranjo antigo era uma coluna de itens empilhados: {tipo, ids}, sem
# largura nem altura — quem decidia era o flex, dividindo o que sobrava. O
# novo é uma grade, e grade precisa de números.
#
# A conversão roda uma vez, na partida, e grava por cima. Fazer isso no
# navegador significaria carregar as duas leituras no app.js para sempre; aqui
# o formato velho morre no primeiro arranque e o tablet só conhece o novo.

def _altura_da_faixa(celulas):
    return max([minimo(c["ids"])[1] for c in celulas] or [1])


def _larguras(ids_a, ids_b):
    """Como duas peças dividem os 6 da linha.

    Mesmo mínimo, metade para cada — é a regra que o usuário pediu, e é a
    única divisão justa quando as duas pedem a mesma coisa. Mínimos
    diferentes: a menor leva o que precisa e a maior fica com o resto, porque
    apertar a maior é que quebra conteúdo.
    """
    a, b = minimo(ids_a)[0], minimo(ids_b)[0]
    if a + b > COLUNAS:
        return None                      # não cabem juntas
    if a == b:
        return [UNIDADES // 2, UNIDADES - UNIDADES // 2]
    if a < b:
        return [a * 2, UNIDADES - a * 2]
    return [UNIDADES - b * 2, b * 2]


def migrar_layout(velho):
    """Coluna de {tipo, ids} -> faixas com largura e altura. None se já é novo."""
    if not isinstance(velho, dict):
        return None
    if not all(isinstance(velho.get(l), list) for l in ("esquerda", "direita")):
        return None
    # Já migrado: as faixas têm "celulas".
    if any(isinstance(i, dict) and "celulas" in i
           for l in ("esquerda", "direita") for i in velho[l]):
        return None

    novo = {}
    for lado in ("esquerda", "direita"):
        faixas = []
        for item in velho[lado]:
            ids = [i for i in (item or {}).get("ids") or [] if i in IDS]
            if not ids:
                continue
            if (item.get("tipo") == "par" and len(ids) > 1):
                larg = _larguras(ids[:1], ids[1:2])
                if larg:
                    celulas = [{"ids": ids[:1], "larg": larg[0]},
                               {"ids": ids[1:2], "larg": larg[1]}]
                else:
                    celulas = [{"ids": ids[:1], "larg": UNIDADES}]
            else:
                # solo e slider viram a mesma coisa: uma célula. A diferença
                # entre eles nunca foi o espaço, e sim quantos widgets moram
                # dentro — e isso continua sendo o tamanho da lista de ids.
                celulas = [{"ids": ids, "larg": UNIDADES}]
            faixas.append({"alt": _altura_da_faixa(celulas), "celulas": celulas})

        novo[lado] = _encaixar(faixas)
    return novo


def _encaixar(faixas):
    """Ajusta as alturas para somarem exatamente as 4 linhas do lado.

    Sobrando linha, ela vai para a faixa de conteúdo mais faminto (a de maior
    mínimo): é onde uma linha a mais vira lista maior, e não ar. Faltando
    linha, as últimas faixas ficam de fora — cortar o começo mudaria o que
    está no alto da tela, que é onde o olho vai primeiro.
    """
    cabe, usado = [], 0
    for f in faixas:
        if usado + f["alt"] > LINHAS:
            break
        cabe.append(f)
        usado += f["alt"]

    while usado < LINHAS and cabe:
        alvo = max(cabe, key=lambda f: (f["alt"], cabe.index(f)))
        alvo["alt"] += 1
        usado += 1
    return cabe
