#!/usr/bin/env python3
"""Prepara uma cópia nova do painel: config, token e atalhos.

Roda uma vez depois de clonar. Gera o `config.json` a partir do exemplo, cria
um token novo e o espalha nos três lugares que precisam dele — o servidor, a
extensão do navegador e o hook do Claude Code. Nenhum desses arquivos vai para
o git, então cada instalação tem o seu.

Uso:  python3 ferramentas/instalar.py
"""
import json
import os
import socket
import secrets
import shutil
import subprocess

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))


def caminho_de(programa, padroes):
    achado = shutil.which(programa)
    if achado:
        return achado
    for p in padroes:
        if os.path.exists(p):
            return p
    return ""


def quem_ocupa(porta):
    """Quem já está escutando nessa porta: ninguém, nós mesmos, ou outro.

    Distinguir "nós mesmos" importa porque rodar o instalador de novo com o
    painel de pé é normal — e dizer "porta ocupada" nesse caso mandaria a
    pessoa procurar um problema que não existe.
    """
    s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
    s.settimeout(0.4)
    try:
        s.connect(("127.0.0.1", porta))
    except OSError:
        return None                      # ninguém atende: está livre
    finally:
        s.close()

    try:
        import urllib.request
        with urllib.request.urlopen(
                "http://127.0.0.1:%d/temas.json" % porta, timeout=1) as r:
            if r.status == 200:
                return "nosso"
    except Exception:
        pass
    return "outro"


def escolher_porta(atual):
    """A porta do painel, conferida antes de virar configuração.

    Isto é pergunta e não constante porque 8766 pode estar ocupada na máquina
    de quem instala, e descobrir isso só na primeira vez que o servidor sobe —
    com o painel já apontado para o lugar errado na extensão e no hook — é
    perder uma tarde.
    """
    sugerida = atual
    while quem_ocupa(sugerida) == "outro" and sugerida < atual + 20:
        sugerida += 1
    if sugerida != atual:
        print("A porta %d está ocupada por outro programa; sugerindo %d."
              % (atual, sugerida))
        print("(para ver quem:  lsof -nP -iTCP:%d -sTCP:LISTEN)\n" % atual)

    while True:
        escolhida = int(perguntar("Porta do painel", sugerida) or sugerida)
        dono = quem_ocupa(escolhida)
        if dono is None or dono == "nosso":
            if dono == "nosso":
                print("  (essa porta já é do painel — seguindo)")
            return escolhida
        print("  %d está ocupada por outro programa. Escolha outra." % escolhida)
        print("  para ver quem:  lsof -nP -iTCP:%d -sTCP:LISTEN" % escolhida)


def perguntar(texto, padrao):
    resposta = input("  %s [%s]: " % (texto, padrao)).strip()
    return resposta or padrao


def main():
    cfg_path = os.path.join(RAIZ, "config.json")
    exemplo = os.path.join(RAIZ, "config.exemplo.json")

    if os.path.exists(cfg_path):
        cfg = json.load(open(cfg_path, encoding="utf8"))
        print("config.json já existe; completando o que faltar.\n")
    else:
        cfg = json.load(open(exemplo, encoding="utf8"))
        print("Criando config.json a partir do exemplo.\n")

    cfg["porta"] = escolher_porta(int(cfg.get("porta", 8766)))
    cfg["cidade"] = perguntar("Cidade do clima", cfg.get("cidade", "São Paulo, SP"))
    cfg["tablet"] = perguntar("Tablet no adb (ip:porta)", cfg.get("tablet", "192.168.0.20:5555"))
    cfg["repo_design"] = perguntar("Repositório a vigiar (org/repo, ou vazio)",
                                   cfg.get("repo_design", ""))
    cfg["adb"] = caminho_de("adb", ["/opt/homebrew/bin/adb", "/usr/local/bin/adb"])
    cfg["gh"] = caminho_de("gh", ["/opt/homebrew/bin/gh", "/usr/local/bin/gh"])
    cfg.setdefault("token_ingest", secrets.token_hex(16))

    with open(cfg_path, "w", encoding="utf8") as fh:
        json.dump(cfg, fh, indent=2, ensure_ascii=False)

    token = cfg["token_ingest"]
    porta = cfg.get("porta", 8766)

    # --- extensão do navegador
    with open(os.path.join(RAIZ, "extensao", "config.js"), "w", encoding="utf8") as fh:
        fh.write("// Gerado por ferramentas/instalar.py. Não versionar.\n"
                 "const PAINEL = 'http://127.0.0.1:%d/ingest';\n"
                 "const TOKEN  = '%s';\n" % (porta, token))

    # --- hook do Claude Code
    hook = os.path.join(RAIZ, "hooks", "avisar.sh")
    modelo = open(os.path.join(RAIZ, "hooks", "avisar.exemplo.sh"), encoding="utf8").read()
    with open(hook, "w", encoding="utf8") as fh:
        fh.write(modelo.replace("SEU-TOKEN-AQUI", token)
                       .replace("127.0.0.1:8766", "127.0.0.1:%d" % porta))
    os.chmod(hook, 0o700)

    print("\nPronto.")
    print("  config.json          token e porta %d" % porta)
    print("  extensao/config.js   escrito")
    print("  hooks/avisar.sh      escrito (chmod 700)")
    print("\nFalta você:")
    print("  1. python3 server.py            e abrir http://localhost:%d" % porta)
    print("     (e conferir o diagnóstico em /controle — é ele que fecha a")
    print("      instalação, não o 'parece que está funcionando')")
    print("  2. carregar extensao/ sem compactação, em chrome://extensions")
    print("     (ou edge://, brave://, opera://, vivaldi:// — qualquer Chromium)")
    print("  3. apontar os hooks do Claude Code para hooks/avisar.sh")
    print("     (veja a seção 'Estado do Claude Code' no DECISOES.md)")
    print("  4. python3 ferramentas/servico.py   para subir sozinho no login")
    print("\nSe travar em algo: abra este projeto no Claude Code e conte o que")
    print("aconteceu. O CLAUDE.md tem o roteiro e as armadilhas conhecidas.")
    if not cfg["adb"]:
        print("\n  aviso: adb não encontrado — a agenda e a bateria dependem dele")
    if not cfg["gh"]:
        print("  aviso: gh não encontrado — o cartão do GitHub fica vazio")


if __name__ == "__main__":
    main()
