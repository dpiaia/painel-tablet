"""Bateria e Wi-Fi do tablet, pelo adb.

O navegador não consegue nada disso: a Battery Status API foi sendo restringida
e o SSID nunca esteve ao alcance de uma página. Mas o canal do adb já está
aberto para a agenda, então sai de graça.
"""
import re
import subprocess

# Uma ida só ao aparelho em vez de duas: latência de adb por Wi-Fi não é nula.
COMANDO = ("dumpsys battery | grep -E 'level|USB powered|AC powered'; "
           "echo ---; "
           "dumpsys wifi | grep -m1 -oE 'SSID: [^,]*'; "
           "dumpsys wifi | grep -m1 -oE 'RSSI: -?[0-9]+'")


def _num(texto, chave):
    m = re.search(r"%s:\s*(-?\d+)" % chave, texto)
    return int(m.group(1)) if m else None


def ler(adb, serial, timeout=20):
    r = subprocess.run([adb, "-s", serial, "shell", COMANDO],
                       capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        raise RuntimeError((r.stderr or r.stdout).strip() or "adb falhou")
    saida = r.stdout

    ssid = None
    m = re.search(r"SSID:\s*(.+)", saida)
    if m:
        ssid = m.group(1).strip().strip('"')
        # O dumpsys às vezes devolve o BSSID na mesma pegada; um MAC não é nome
        # de rede, então descartamos em vez de mostrar 08:7b:12:... na tela.
        if re.fullmatch(r"(?:[0-9a-f]{2}:){5}[0-9a-f]{2}", ssid, re.I):
            ssid = None

    return {
        "bateria": _num(saida, "level"),
        "carregando": "USB powered: true" in saida or "AC powered: true" in saida,
        "ssid": ssid,
        "sinal": _num(saida, "RSSI"),
    }


if __name__ == "__main__":
    print(ler("/opt/homebrew/bin/adb", "192.168.0.20:5555"))
