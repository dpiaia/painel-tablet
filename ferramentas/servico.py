#!/usr/bin/env python3
"""Deixa o painel de pé sozinho: sobe no login e volta se cair.

POR QUE ISTO EXISTE: o painel não serve para nada se depender de alguém
lembrar de rodar `python3 server.py` toda manhã. Ele precisa estar lá quando
você olha para a mesa, inclusive depois de um reinício às três da manhã.

O QUE ESTE SCRIPT FAZ, POR SISTEMA:

    macOS     escreve o LaunchAgent e carrega. Testado.
    Linux     IMPRIME a unit do systemd para você conferir e colar. Não
              instala, porque ninguém testou ainda.
    Windows   IMPRIME o comando do Agendador de Tarefas, pelo mesmo motivo.

Imprimir em vez de instalar não é preguiça: é a diferença entre "isto funciona"
e "isto deveria funcionar". Instalar calado um serviço que ninguém verificou
deixa a pessoa com um processo fantasma e nenhuma pista. Se você fizer funcionar
no seu sistema, mande o pull request — é a contribuição mais útil que este
projeto pode receber agora.

Uso:  python3 ferramentas/servico.py
"""
import getpass
import json
import os
import subprocess
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
ROTULO = "com.%s.painel-tablet" % getpass.getuser()


def porta():
    try:
        with open(os.path.join(RAIZ, "config.json"), encoding="utf8") as fh:
            return int(json.load(fh).get("porta", 8766))
    except (OSError, ValueError, TypeError):
        return 8766


# Escrito para ser LIDO depois. Um plist é um arquivo que a pessoa vai abrir
# daqui a um ano querendo entender por que o painel subiu sozinho, e XML sem
# comentário não ajuda ninguém.
PLIST = """<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>{rotulo}</string>

  <!-- O interpretador é o mesmo que rodou o instalador: é o que você
       verificou que funciona. Se um dia ele sumir (um Python de venv
       apagado, por exemplo), troque aqui para /usr/bin/python3. -->
  <key>ProgramArguments</key>
  <array>
    <string>{python}</string>
    <string>{raiz}/server.py</string>
  </array>
  <key>WorkingDirectory</key>
  <string>{raiz}</string>

  <!-- sobe no login -->
  <key>RunAtLoad</key>
  <true/>

  <!-- e volta sozinho se cair, sempre -->
  <key>KeepAlive</key>
  <true/>
  <key>ThrottleInterval</key>
  <integer>10</integer>

  <key>StandardOutPath</key>
  <string>{log}</string>
  <key>StandardErrorPath</key>
  <string>{log}</string>
</dict>
</plist>
"""

SYSTEMD = """[Unit]
Description=Painel do tablet
After=network-online.target

[Service]
Type=simple
WorkingDirectory={raiz}
ExecStart={python} {raiz}/server.py
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
"""


def macos():
    destino = os.path.expanduser("~/Library/LaunchAgents/%s.plist" % ROTULO)
    log = os.path.expanduser("~/Library/Logs/painel-tablet.log")
    os.makedirs(os.path.dirname(destino), exist_ok=True)

    # O macOS protege Documents, Desktop e Downloads (TCC), e um agente do
    # launchd não consegue ler lá dentro — ele morre com "Operation not
    # permitted" antes de abrir o primeiro arquivo, e a mensagem não diz isso.
    for protegida in ("/Documents/", "/Desktop/", "/Downloads/"):
        if protegida in RAIZ + "/":
            print("ATENÇÃO: o projeto está em %s." % protegida.strip("/"))
            print("O macOS não deixa um serviço ler essa pasta, e ele vai morrer")
            print("com 'Operation not permitted' sem explicar por quê.")
            print("Mova o projeto para ~/Projects (ou qualquer pasta fora dessas)")
            print("e rode isto de novo.")
            return 1

    with open(destino, "w", encoding="utf8") as fh:
        fh.write(PLIST.format(rotulo=ROTULO, python=sys.executable,
                              raiz=RAIZ, log=log))

    subprocess.run(["launchctl", "unload", destino],
                   capture_output=True)          # se já existia
    r = subprocess.run(["launchctl", "load", destino], capture_output=True, text=True)
    if r.returncode != 0:
        print("launchctl load falhou: %s" % (r.stderr or r.stdout).strip())
        return 1

    print("Serviço instalado: %s" % destino)
    print("Log:               %s" % log)
    print()
    print("Comandos que você vai querer um dia:")
    print("  launchctl list | grep painel-tablet                 está de pé?")
    print("  tail -f %s   o que ele diz" % log)
    print("  launchctl kickstart -k gui/$UID/%s   reiniciar" % ROTULO)
    print("  launchctl unload %s   desligar" % destino)
    return 0


def linux():
    destino = os.path.expanduser("~/.config/systemd/user/painel-tablet.service")
    print("Linux: este script NÃO vai instalar nada, porque ninguém testou")
    print("ainda o painel aqui. Abaixo está a unit que deveria servir.\n")
    print("Salve em %s:\n" % destino)
    print(SYSTEMD.format(raiz=RAIZ, python=sys.executable))
    print("Depois:")
    print("  systemctl --user daemon-reload")
    print("  systemctl --user enable --now painel-tablet")
    print("  systemctl --user status painel-tablet")
    print("  journalctl --user -u painel-tablet -f")
    print()
    print("Para o painel subir sem você ter feito login numa sessão gráfica:")
    print("  sudo loginctl enable-linger $USER")
    print()
    print("DOIS CARTÕES NÃO VÃO FUNCIONAR AQUI, e é bom saber antes:")
    print("  · Monitor do Mac    — maquina.py usa vm_stat e sysctl, que são do")
    print("                        macOS. No Linux seria /proc/meminfo e")
    print("                        /proc/swaps. É uma função pequena de portar.")
    print("  · Monitor do Claude — claude_uso.py lê o histórico do app em")
    print("                        ~/Library/Application Support/Claude/. Onde")
    print("                        ele fica no Linux é coisa a descobrir.")
    print("Desligue os dois no painel de controle, ou porte e mande o PR.")
    return 0


def windows():
    print("Windows: este script NÃO vai instalar nada, porque ninguém testou")
    print("ainda o painel aqui. O caminho provável é o Agendador de Tarefas:\n")
    print('  schtasks /Create /TN "Painel do tablet" /SC ONLOGON ^')
    print('    /TR "\\"%s\\" \\"%s\\server.py\\"" /RL LIMITED'
          % (sys.executable, RAIZ))
    print()
    print("Três coisas que provavelmente vão aparecer no caminho:")
    print("  · o hook do Claude Code é um script /bin/sh — precisa de WSL ou")
    print("    Git Bash para rodar;")
    print("  · Monitor do Mac e Monitor do Claude não funcionam (vm_stat,")
    print("    sysctl e caminhos do macOS). Desligue os dois no controle;")
    print("  · o Firewall do Windows vai perguntar se libera a porta %d na"
          % porta())
    print("    rede local — sem liberar, o tablet não enxerga o painel.")
    return 0


def main():
    print("Painel do tablet — serviço")
    print("Projeto em: %s" % RAIZ)
    print("Python:     %s" % sys.executable)
    print("Porta:      %d\n" % porta())

    if sys.platform == "darwin":
        return macos()
    if sys.platform.startswith("linux"):
        return linux()
    if os.name == "nt":
        return windows()

    print("Sistema não reconhecido (%s). O servidor é só `python3 server.py`;"
          % sys.platform)
    print("o que falta é o seu sistema saber subir isso no login.")
    return 1


if __name__ == "__main__":
    sys.exit(main())
