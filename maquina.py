"""Saúde do Mac: carga, memória e swap.

O painel mostra isso porque o Mac é o cérebro de tudo. Quando ele começa a
engasgar, o tablet vira o primeiro lugar onde dá para perceber — antes da
bolinha girando, que já é tarde.

A métrica que mais engana no macOS é "memória livre": o sistema usa quase tudo
de propósito, então livre baixo é normal. O sinal de verdade é o **swap**.
Quando ele cresce, a máquina já está paginando para o disco, e a lentidão vem
logo atrás. Por isso ele aparece em GB, e não escondido numa porcentagem.

"Memória usada" aqui segue a conta do Monitor de Atividade — ativa + reservada
+ comprimida — para bater com o número que você vê quando vai investigar.
"""
import os
import re
import subprocess

GB = 1024.0 ** 3


def _rodar(cmd):
    return subprocess.run(cmd, capture_output=True, text=True, timeout=10).stdout


def _paginas():
    saida = _rodar(["vm_stat"])
    tam = 4096
    m = re.search(r"page size of (\d+) bytes", saida)
    if m:
        tam = int(m.group(1))
    p = {}
    for linha in saida.splitlines():
        m = re.match(r"(.+?):\s+(\d+)\.", linha)
        if m:
            p[m.group(1).strip().lower()] = int(m.group(2))
    return p, tam


def _swap():
    # "total = 12288.00M  used = 11805.56M  free = 482.44M"
    saida = _rodar(["sysctl", "-n", "vm.swapusage"])
    def mb(chave):
        m = re.search(r"%s\s*=\s*([\d.]+)M" % chave, saida)
        return float(m.group(1)) if m else 0.0
    return mb("used") / 1024.0, mb("total") / 1024.0    # em GB


def ler():
    nucleos = os.cpu_count() or 1
    carga = os.getloadavg()[0]
    cpu = min(100, round(carga / nucleos * 100))

    p, tam = _paginas()
    total = float(_rodar(["sysctl", "-n", "hw.memsize"]).strip() or 0)
    usada = (p.get("pages active", 0) + p.get("pages wired down", 0) +
             p.get("pages occupied by compressor", 0)) * tam
    ram = round(usada / total * 100) if total else 0

    swap_usado, swap_total = _swap()
    swap_livre = max(0.0, swap_total - swap_usado)

    # Um rótulo só, calculado aqui, para a tela não ter que saber de limiares.
    if swap_total and swap_livre < 1 or ram >= 92 or cpu >= 95:
        aperto = "critico"
    elif swap_usado >= 2 or ram >= 85 or cpu >= 85:
        aperto = "atencao"
    else:
        aperto = "ok"

    return {
        "cpu": cpu,
        "carga": round(carga, 2),
        "nucleos": nucleos,
        "ram": ram,
        "ram_gb": round(usada / GB, 1),
        "ram_total_gb": round(total / GB, 1),
        "swap_gb": round(swap_usado, 1),
        "swap_total_gb": round(swap_total, 1),
        "aperto": aperto,
    }


if __name__ == "__main__":
    print(ler())
