#!/usr/bin/env python3
"""Tira a grade de transparência que ficou achatada dentro de um GIF.

O QUE ACONTECEU: o `faiscas.gif` veio do Tenor com a faísca desenhada como um
quadriculado preto-e-branco. Não é arte: é a GRADE que editores de imagem
mostram atrás de áreas transparentes, achatada dentro do arquivo quando alguém
exportou sem alfa. No painel isso aparece como um bloco xadrez colado no
bichinho.

COMO ACHA: a grade é ACROMÁTICA — preto, branco e os cinzas do antisserrilhado
entre os dois. O corpo do bicho é terracota, bem saturado, então separar por
saturação pega a mancha inteira sem encostar nele. Os vizinhos acromáticos são
agrupados, e um grupo só vale como grade se tiver extremos claros E escuros: o
olho do bicho também é preto, e um grupo só escuro é olho. Apagar por cor
sozinha cegaria o personagem.

COMO CONSERTA: repinta o grupo inteiro com uma cor só. O padrão é o dourado que
o `fogos.gif` usa nas faíscas dele (240, 200, 118), para os dois bichinhos
falarem a mesma língua — e porque dourado se lê tanto no cartão escuro quanto
no bege do Windows XP, o que branco não faz.

SOBRE A PALETA: o GIF é reescrito com uma paleta mestra, calculada sobre todos
os quadros juntos, e com o índice transparente declarado em CADA quadro. Este
projeto já perdeu uma animação por não fazer isso: quadro sem transparência
declarada vira bloco opaco em decodificador estrito, e paleta por quadro faz a
cor escorrer ao longo da animação.

Uso:  python3 ferramentas/tirar_xadrez.py web/claude/faiscas.gif
      python3 ferramentas/tirar_xadrez.py web/claude/faiscas.gif --cor 248,248,240
      python3 ferramentas/tirar_xadrez.py web/claude/faiscas.gif --conferir
"""
import argparse
import os
import sys

from PIL import Image, ImageSequence

DOURADO = (240, 200, 118)     # a mesma faísca do fogos.gif
SATURACAO = 34      # acima disto é cor, não cinza
ESCURO = 90         # brilho abaixo disto conta como extremo escuro
CLARO = 170         # e acima disto, como extremo claro
VIZINHOS = ((1, 0), (-1, 0), (0, 1), (0, -1), (1, 1), (1, -1), (-1, 1), (-1, -1))


def acromatico(p):
    """Preto, branco ou cinza — o que a grade e os olhos têm em comum."""
    return max(p[:3]) - min(p[:3]) <= SATURACAO


def grupos_xadrez(q):
    """As manchas de quadriculado do quadro, como listas de coordenadas."""
    marca = {}
    larg, alt = q.size
    px = q.load()
    for y in range(alt):
        for x in range(larg):
            p = px[x, y]
            if p[3] <= 8 or not acromatico(p):
                continue
            brilho = sum(p[:3]) / 3.0
            marca[(x, y)] = ("e" if brilho <= ESCURO else
                             "c" if brilho >= CLARO else "m")

    vistos, achados = set(), []
    for ini in marca:
        if ini in vistos:
            continue
        pilha, comp = [ini], []
        vistos.add(ini)
        while pilha:
            x, y = pilha.pop()
            comp.append((x, y))
            for dx, dy in VIZINHOS:
                v = (x + dx, y + dy)
                if v in marca and v not in vistos:
                    vistos.add(v)
                    pilha.append(v)
        # Extremos claro E escuro juntos = grade. O olho é só escuro, e um
        # cinza solto no meio do nada não é grade nenhuma.
        cores = set(marca[p] for p in comp)
        if "e" in cores and "c" in cores:
            achados.append(comp)
    return achados


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("arquivo")
    ap.add_argument("--cor", default=",".join(str(c) for c in DOURADO),
                    help="r,g,b da cor que substitui a grade")
    ap.add_argument("--conferir", action="store_true",
                    help="só relata o que encontraria, sem gravar")
    args = ap.parse_args()

    cor = tuple(int(c) for c in args.cor.split(","))
    if len(cor) != 3:
        print("--cor precisa de três números: r,g,b")
        return 1

    im = Image.open(args.arquivo)
    duracoes = []
    quadros = []
    mexidos = 0

    for q in ImageSequence.Iterator(im):
        duracoes.append(q.info.get("duration", im.info.get("duration", 80)))
        rgba = q.convert("RGBA")
        px = rgba.load()
        for grupo in grupos_xadrez(rgba):
            mexidos += len(grupo)
            for x, y in grupo:
                px[x, y] = cor + (255,)
        quadros.append(rgba)

    print("%s: %d quadros, %d pixels de grade encontrados"
          % (os.path.basename(args.arquivo), len(quadros), mexidos))
    if args.conferir:
        return 0
    if not mexidos:
        print("nada a fazer.")
        return 0

    """Paleta MESTRA, uma para a animação inteira.

    Juntar os quadros numa tira e quantizar uma vez é o que impede a cor de
    escorrer: com paleta por quadro, o mesmo terracota ganha índices
    diferentes ao longo da animação e o bicho muda de tom sozinho.

    O índice 0 fica reservado para o transparente, e é declarado em todos os
    quadros — não só no primeiro, que era o defeito do arquivo original.
    """
    larg, alt = quadros[0].size
    tira = Image.new("RGBA", (larg * len(quadros), alt))
    for i, q in enumerate(quadros):
        tira.paste(q, (i * larg, 0))

    # Quantiza só o que é opaco; o transparente entra depois, no índice 0.
    plana = Image.new("RGB", tira.size, (255, 0, 255))
    plana.paste(tira.convert("RGB"), mask=tira.getchannel("A").point(lambda a: 255 if a > 8 else 0))
    mestra = plana.quantize(colors=255, method=Image.MEDIANCUT)

    saida = []
    for i in range(len(quadros)):
        pedaco = mestra.crop((i * larg, 0, (i + 1) * larg, alt))
        alfa = quadros[i].getchannel("A").point(lambda a: 255 if a > 8 else 0)
        pedaco = pedaco.convert("P")
        # Onde é transparente, força o índice reservado.
        dados = list(pedaco.getdata())
        mascara = list(alfa.getdata())
        pedaco.putdata([255 if m == 0 else d for d, m in zip(dados, mascara)])
        saida.append(pedaco)

    pal = mestra.getpalette()[: 255 * 3] + [255, 0, 255]
    for q in saida:
        q.putpalette(pal)

    saida[0].save(args.arquivo, save_all=True, append_images=saida[1:],
                  duration=duracoes, loop=0, transparency=255, disposal=2,
                  optimize=False)
    print("gravado: %s (%.0f KB)" % (args.arquivo, os.path.getsize(args.arquivo) / 1024))
    return 0


if __name__ == "__main__":
    sys.exit(main())
