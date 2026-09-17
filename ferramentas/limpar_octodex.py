#!/usr/bin/env python3
"""Tira o fundo branco dos octocats, para eles pousarem na cor da cena.

Metade das imagens do Octodex vem com fundo branco sólido — numa cena azul ou
verde de tela cheia, aparecem como um selo retangular colado por cima.

O DETALHE QUE FAZ A DIFERENÇA: não dá para apagar "todo pixel branco". Nessas
imagens o branco é de 40 a 75% do total, porque também é a armadura do
stormtrooper, o brilho do capacete, o miolo dos olhos. Apagar por cor comeria
o desenho.

O que funciona é preencher a partir das BORDAS: só some o branco que está
ligado ao lado de fora. Branco cercado de desenho fica onde está.

Depois do preenchimento sobra a franja da antisserrilha — aquele halo claro
de um ou dois pixels que o desenho tinha contra o fundo original. A segunda
passada resolve: pixel quase branco que faz fronteira com o transparente vira
semitransparente na medida do quanto é branco.

Idempotente: imagem que já está transparente é pulada.
"""
import os
import sys
from collections import deque

try:
    from PIL import Image, ImageSequence
except ImportError:
    print("falta o Pillow:  python3 -m pip install Pillow")
    sys.exit(1)

PASTA = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                     "web", "octodex")

# Tolerância generosa: JPEG não guarda branco exato, ele chega com ruído.
LIMIAR_FUNDO = 218      # a partir daqui o pixel conta como fundo, no preenchimento
LIMIAR_FRANJA = 200     # a partir daqui entra no cálculo de franja


def sem_fundo(rgba):
    """Devolve a imagem com o fundo branco ligado às bordas transparente."""
    largura, altura = rgba.size
    px = rgba.load()

    fundo = bytearray(largura * altura)
    fila = deque()

    def talvez(x, y):
        i = y * largura + x
        if fundo[i]:
            return
        p = px[x, y]
        if p[3] < 10:                      # já transparente: também é fundo
            fundo[i] = 1
            fila.append((x, y))
            return
        if min(p[0], p[1], p[2]) >= LIMIAR_FUNDO:
            fundo[i] = 1
            fila.append((x, y))

    for x in range(largura):
        talvez(x, 0)
        talvez(x, altura - 1)
    for y in range(altura):
        talvez(0, y)
        talvez(largura - 1, y)

    while fila:
        x, y = fila.popleft()
        if x > 0:           talvez(x - 1, y)
        if x < largura - 1: talvez(x + 1, y)
        if y > 0:           talvez(x, y - 1)
        if y < altura - 1:  talvez(x, y + 1)

    # Primeira passada: o fundo some.
    for y in range(altura):
        base = y * largura
        for x in range(largura):
            if fundo[base + x]:
                px[x, y] = (255, 255, 255, 0)

    # Segunda passada: a franja da antisserrilha vira semitransparente. Quanto
    # mais claro o pixel, menos opaco ele fica — é a mistura com o fundo antigo
    # sendo desfeita, não um corte.
    for y in range(altura):
        base = y * largura
        for x in range(largura):
            if fundo[base + x]:
                continue
            p = px[x, y]
            if p[3] < 250 or min(p[0], p[1], p[2]) < LIMIAR_FRANJA:
                continue
            vizinho_vazio = (
                (x > 0 and fundo[base + x - 1]) or
                (x < largura - 1 and fundo[base + x + 1]) or
                (y > 0 and fundo[base - largura + x]) or
                (y < altura - 1 and fundo[base + largura + x]))
            if not vizinho_vazio:
                continue
            claro = min(p[0], p[1], p[2])
            alfa = int(255 * (255 - claro) / float(255 - LIMIAR_FRANJA))
            px[x, y] = (p[0], p[1], p[2], max(0, min(255, alfa)))

    return rgba


def quadros_gif(im, caminho):
    """GIF animado sem fundo, mantendo a animação.

    Duas coisas do formato ditam o método. A transparência do GIF é de um bit
    só — um índice da paleta vale "vazio", e não existe meio transparente —,
    então a franja suave da segunda passada precisa virar decisão binária. E a
    paleta tem que ser ÚNICA para todos os quadros: paleta por quadro faz a cor
    derivar entre eles, o que já aconteceu neste projeto, com um bichinho que
    saía verde no primeiro quadro e certo nos outros.

    O índice 255 fica reservado para o vazio, e por isso a paleta é de 255
    cores em vez de 256.
    """
    limpos = [sem_fundo(q.convert("RGBA")) for q in ImageSequence.Iterator(im)]
    duracoes = [q.info.get("duration", 80) for q in ImageSequence.Iterator(im)]
    largura, altura = limpos[0].size

    # Paleta mestra tirada de todos os quadros empilhados, não do primeiro.
    pilha = Image.new("RGB", (largura, altura * len(limpos)), (255, 255, 255))
    for i, q in enumerate(limpos):
        pilha.paste(q.convert("RGB"), (0, i * altura))
    mestra = pilha.quantize(colors=255, method=Image.MEDIANCUT)

    saida = []
    for q in limpos:
        indexado = q.convert("RGB").quantize(palette=mestra, dither=Image.NONE)
        px = indexado.load()
        alfa = q.split()[3].load()
        for y in range(altura):
            for x in range(largura):
                if alfa[x, y] < 128:        # um bit: ou está, ou não está
                    px[x, y] = 255
        saida.append(indexado)

    destino = os.path.splitext(caminho)[0] + ".gif"
    saida[0].save(destino, save_all=True, append_images=saida[1:],
                  duration=duracoes, loop=0,
                  transparency=255, disposal=2, optimize=False)
    if destino != caminho:
        os.remove(caminho)


def ja_limpa(im):
    rgba = im.convert("RGBA")
    l, a = rgba.size
    return all(rgba.getpixel(p)[3] < 10
               for p in [(0, 0), (l - 1, 0), (0, a - 1), (l - 1, a - 1)])


def main():
    if not os.path.isdir(PASTA):
        print("rode antes:  python3 ferramentas/baixar_octodex.py")
        return 1

    mexidos = pulados = 0
    for nome in sorted(os.listdir(PASTA)):
        if not nome.lower().endswith((".png", ".jpg", ".jpeg", ".gif")):
            continue
        caminho = os.path.join(PASTA, nome)
        im = Image.open(caminho)

        if ja_limpa(im):
            pulados += 1
            continue

        if getattr(im, "n_frames", 1) > 1:
            quadros_gif(im, caminho)
            print("  %-28s animado, %d quadros, sem fundo"
                  % (nome, getattr(im, "n_frames", 1)))
            mexidos += 1
            continue

        limpa = sem_fundo(im.convert("RGBA"))
        saida = os.path.splitext(caminho)[0] + ".png"       # jpeg não tem alfa
        limpa.save(saida)
        if saida != caminho:
            os.remove(caminho)
        print("  %-28s -> %s" % (nome, os.path.basename(saida)))
        mexidos += 1

    print("\n%d sem fundo, %d já estavam limpas" % (mexidos, pulados))
    return 0


if __name__ == "__main__":
    sys.exit(main())
