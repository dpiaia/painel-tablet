#!/usr/bin/env python3
"""Gerador dos bichinhos animados.

Os GIFs do Tenor cobriam só quatro estados, e faltava justamente o mais
importante — "precisa de você". Em vez de caçar na internet um GIF que talvez
não exista, desenhamos aqui: o sprite foi extraído dos próprios GIFs (grade de
20x20 células, o bicho ocupa 13x8), então o personagem é o mesmo.

Saímos em GIF e não em SVG animado de propósito: medido no tablet, rasterizar
vetor a cada quadro custa bem mais que copiar um bloco de pixels pronto. Aqui o
custo de desenhar é pago UMA vez, no Mac, e o aparelho só decodifica.

Uso:  python3 ferramentas/bichos.py
"""
import os
from PIL import Image, ImageDraw

CEL = 18                       # pixels por célula do sprite
LARG, ALT = 15, 13             # tela em células (sobra para pulo e balão)

PELE = (216, 112, 80)
OLHO = (0, 0, 0)
FOCINHO = (128, 64, 48)
VAZIO = (255, 0, 255)          # cor-chave que vira transparente no fim

CORPO = [
    "..#########..",
    "..#O####oO#..",
    "#############",
    "#############",
    "..#########..",
    "..#########..",
]
PERNAS_BAIXO = "..#.#..##.#.."
PERNAS_MEIO  = "..#.#..##.#.."

TINTA = {"#": PELE, "O": OLHO, "o": FOCINHO}


def bloco(d, cx, cy, cor, larg=1, alt=1):
    d.rectangle([cx * CEL, cy * CEL,
                 (cx + larg) * CEL - 1, (cy + alt) * CEL - 1], fill=cor)


def desenhar_corpo(d, x0, y0, pele, pernas):
    """pernas: 2 = esticadas, 1 = meio, 0 = recolhidas (no ar)."""
    tinta = dict(TINTA)
    tinta["#"] = pele
    for dy, linha in enumerate(CORPO):
        for dx, c in enumerate(linha):
            if c in tinta:
                bloco(d, x0 + dx, y0 + dy, tinta[c])
    if pernas:
        for dx, c in enumerate(PERNAS_BAIXO):
            if c == "#":
                bloco(d, x0 + dx, y0 + 6, pele, 1, pernas)


def exclamacao(d, cx, cy, cor):
    bloco(d, cx, cy, cor, 1, 2)
    bloco(d, cx, cy + 3, cor, 1, 1)


def quadro(altura, pernas, grito, pele):
    img = Image.new("RGB", (LARG * CEL, ALT * CEL), VAZIO)
    d = ImageDraw.Draw(img)
    base_y = 5 - altura
    desenhar_corpo(d, 1, base_y, pele, pernas)
    if grito:
        exclamacao(d, 13, base_y - 1, pele)
    return img


def salvar(nome, quadros, duracoes):
    # Recorte na união das caixas: cortar quadro a quadro faria o bicho pular
    # de posição sozinho.
    caixa = None
    for q in quadros:
        b = q.convert("RGB").point(lambda v: v).getbbox()
        # getbbox() olha o preto; aqui o fundo é magenta, então calculamos à mão
        m = Image.new("L", q.size, 0)
        px_q, px_m = q.load(), m.load()
        for y in range(q.height):
            for x in range(q.width):
                if px_q[x, y] != VAZIO:
                    px_m[x, y] = 255
        b = m.getbbox()
        if b:
            caixa = b if caixa is None else (min(caixa[0], b[0]), min(caixa[1], b[1]),
                                             max(caixa[2], b[2]), max(caixa[3], b[3]))
    m = 4
    caixa = (max(0, caixa[0]-m), max(0, caixa[1]-m),
             min(quadros[0].width, caixa[2]+m), min(quadros[0].height, caixa[3]+m))

    saida = []
    for q in quadros:
        c = q.crop(caixa)
        pal = c.convert("P", palette=Image.ADAPTIVE, colors=255)
        # a cor-chave vira o índice transparente
        mask = Image.new("1", c.size, 0)
        pc, pm = c.load(), mask.load()
        for y in range(c.height):
            for x in range(c.width):
                if pc[x, y] == VAZIO:
                    pm[x, y] = 1
        pal.paste(255, mask)
        pal.info["transparency"] = 255
        saida.append(pal)

    saida[0].save(nome, save_all=True, append_images=saida[1:],
                  duration=duracoes, loop=0, transparency=255, disposal=2)
    return saida[0].size, os.path.getsize(nome)


def olho_fechado(d, cx, cy, cor):
    """Olho dormindo é um traço, não um quadrado: meia altura, no meio da célula."""
    y = cy * CEL + CEL // 2 - CEL // 8
    d.rectangle([cx * CEL, y, (cx + 1) * CEL - 1, y + CEL // 4 - 1], fill=cor)


def letra_z(d, cx, cy, cor, tam):
    """Z em pixel art: barra em cima, diagonal no meio, barra embaixo."""
    u = max(1, int(CEL * tam))
    x, y = int(cx * CEL), int(cy * CEL)
    d.rectangle([x, y, x + 3*u - 1, y + u - 1], fill=cor)               # topo
    d.rectangle([x + u, y + u, x + 2*u - 1, y + 2*u - 1], fill=cor)     # meio
    d.rectangle([x, y + 2*u, x + 3*u - 1, y + 3*u - 1], fill=cor)       # base


def quadro_dormindo(desloca_z, pele, escuro):
    """O bicho deitado, e três Z subindo em alturas diferentes."""
    img = Image.new("RGB", (LARG * CEL, ALT * CEL), VAZIO)
    d = ImageDraw.Draw(img)

    # Corpo uma célula mais baixo e sem pernas: ele está deitado, não de pé.
    y0 = 6
    for dy, linha in enumerate(CORPO):
        for dx, c in enumerate(linha):
            if c == "#":
                bloco(d, 1 + dx, y0 + dy, pele)
            elif c == "o":
                bloco(d, 1 + dx, y0 + dy, escuro)
    olho_fechado(d, 1 + 3, y0 + 1, escuro)
    olho_fechado(d, 1 + 9, y0 + 1, escuro)

    # Três Z em fila, subindo. O deslocamento faz cada um percorrer a trilha
    # e sumir no topo — sem opacidade, que o GIF não tem.
    trilha = [(11.4, 4.6, .34), (12.3, 3.0, .45), (13.2, 1.2, .58)]
    for i, (tx, ty, tam) in enumerate(trilha):
        fase = (desloca_z + i) % 4
        if fase == 3:
            continue                      # um dos três sempre apagado: pisca
        letra_z(d, tx, ty, pele, tam)
    return img


def dormindo(destino, pele=(216, 112, 80), escuro=(90, 46, 33)):
    passos = []
    for k in range(8):
        passos.append((k % 4, 420))       # lento: sono não tem pressa
    qs = [quadro_dormindo(f, pele, escuro) for f, _ in passos]
    return salvar(destino, qs, [d for _, d in passos])


def chamando(destino, pele=(240, 160, 75)):
    """'Precisa de você': o bicho pula e solta um ! — insistente, não decorativo."""
    passos = [
        (0, 2, 0, 160),   # parado
        (0, 1, 0, 90),    # agacha
        (2, 0, 1, 90),    # salta, grita
        (3, 0, 1, 120),   # ápice
        (2, 0, 1, 90),
        (0, 1, 1, 90),    # aterrissa
        (0, 2, 0, 200),   # pausa
        (0, 1, 0, 90),
        (2, 0, 1, 90),
        (3, 0, 1, 120),
        (2, 0, 1, 90),
        (0, 1, 0, 90),
    ]
    qs = [quadro(a, p, g, pele) for a, p, g, _ in passos]
    return salvar(destino, qs, [d for _, _, _, d in passos])


if __name__ == "__main__":
    base = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                        "web", "claude")
    tam, bytes_ = dormindo(os.path.join(base, "dormindo.gif"))
    print("dormindo.gif  %dx%d  %.1f KB" % (tam[0], tam[1], bytes_ / 1024))
