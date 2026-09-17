#!/usr/bin/env python3
"""Baixa os octocats do Octodex para uso local no painel.

POR QUE ESTE SCRIPT EXISTE, em vez de os arquivos virem no repositório:

As imagens do Octodex são obra da GitHub. O FAQ deles permite usá-las para se
referir à GitHub — que é exatamente o que o painel faz — mas diz também que
são "official GitHub artwork under GitHub's trademark license". Commitá-las
aqui dentro seria republicar arte de terceiros sob a licença MIT deste
repositório, o que não é nosso para fazer. Então o repositório traz o código e
cada um busca as imagens na fonte, que é o uso que a GitHub sanciona.

POR QUE LOCAL, em vez de apontar direto para octodex.github.com:

  - O painel é local primeiro. Internet caída não pode apagar o mascote de uma
    tela que só depende do Mac e da rede de casa.
  - O cache do WebView do quiosque já custou três rodadas de depuração neste
    projeto. Quanto menos ele precisar buscar fora, melhor.
  - São 1,8 MB somados, e o tablet buscaria de novo a cada limpeza de cache.

Rode de novo quando quiser atualizar; o que já existe é pulado.
"""
import os
import sys
import urllib.request

BASE = "https://octodex.github.com/images/"

IMAGENS = [
    "daftpunktocat-guy.gif",
    "daftpunktocat-thomas.gif",
    "spidertocat.png",
    "stormtroopocat.png",
    "megacat.jpg",
    "linktocat.jpg",
    "plumber.jpg",
    "waldocat.png",
    "xtocat.jpg",
    "okal-eltocat.jpg",
    "ironcat.jpg",
    "octobiwan.jpg",
    "jetpacktocat.png",
    "hula_loop_octodex03.gif",
    "universetocat.png",
]

DESTINO = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                       "web", "octodex")


def main():
    os.makedirs(DESTINO, exist_ok=True)
    baixados = pulados = falhas = 0

    for nome in IMAGENS:
        caminho = os.path.join(DESTINO, nome)
        if os.path.exists(caminho) and os.path.getsize(caminho) > 0:
            pulados += 1
            continue
        try:
            with urllib.request.urlopen(BASE + nome, timeout=30) as r:
                dados = r.read()
            # Grava em arquivo temporário e só então renomeia: download cortado
            # no meio deixaria um arquivo truncado que o painel tentaria exibir.
            tmp = caminho + ".parcial"
            with open(tmp, "wb") as fh:
                fh.write(dados)
            os.replace(tmp, caminho)
            print("  baixado  %-28s %6.0f KB" % (nome, len(dados) / 1024))
            baixados += 1
        except Exception as erro:
            print("  FALHOU   %-28s %s" % (nome, erro))
            falhas += 1

    print("\n%d baixados, %d já existiam, %d falharam" % (baixados, pulados, falhas))
    print("em %s" % DESTINO)
    if falhas:
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
