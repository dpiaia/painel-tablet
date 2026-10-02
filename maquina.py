"""Saúde da máquina que serve o painel: carga, memória e swap.

O painel mostra isso porque o Mac é o cérebro de tudo. Quando ele começa a
engasgar, o tablet vira o primeiro lugar onde dá para perceber — antes da
bolinha girando, que já é tarde.

A métrica que mais engana no macOS é "memória livre": o sistema usa quase tudo
de propósito, então livre baixo é normal. O sinal de verdade é o **swap**.
Quando ele cresce, a máquina já está paginando para o disco, e a lentidão vem
logo atrás. Por isso ele aparece em GB, e não escondido numa porcentagem.

"Memória usada" não tem uma definição universal, e por isso cada sistema usa a
conta do PRÓPRIO monitor — o número do painel tem que bater com o que você vê
quando vai investigar, senão ele atrapalha em vez de ajudar:

    macOS   ativa + reservada + comprimida, como o Monitor de Atividade
    Linux   MemTotal menos MemAvailable, como o `free` e o monitor do GNOME

São contas diferentes porque os dois sistemas gerenciam memória de formas
diferentes; forçar uma fórmula só daria um número que não confere com nada.
"""
import os
import re
import subprocess
import sys

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


def _meminfo(caminho="/proc/meminfo"):
    """/proc/meminfo como um dicionário de bytes.

    O caminho é parâmetro para dar para testar o analisador sem um Linux à mão
    — o formato do arquivo é estável há vinte anos, e é ele que tem como ter
    bug aqui, não o `open`.

    O arquivo é `Chave: <número> kB` — e o kB ali é mesmo 1024, apesar do nome.
    Converter na entrada deixa o resto da função falando em bytes, como o lado
    do macOS já falava.
    """
    dados = {}
    with open(caminho, encoding="utf8") as fh:
        for linha in fh:
            partes = linha.split(":", 1)
            if len(partes) != 2:
                continue
            numero = partes[1].strip().split()
            if numero and numero[0].isdigit():
                dados[partes[0]] = int(numero[0]) * 1024
    return dados


def _ler_linux():
    m = _meminfo()
    total = float(m.get("MemTotal", 0))

    # MemAvailable e não MemFree: o Linux usa quase toda a RAM livre como cache
    # de disco de propósito, então "livre" é sempre baixo e não quer dizer
    # aperto. MemAvailable é a estimativa do próprio kernel de quanto dá para
    # entregar a um programa novo sem paginar — é a conta que o `free` mostra e
    # a única que corresponde ao que a pessoa sente.
    disponivel = float(m.get("MemAvailable", m.get("MemFree", 0)))
    usada = max(0.0, total - disponivel)

    # Do /proc/meminfo e não do /proc/swaps: o meminfo sempre existe, e o
    # /proc/swaps fica vazio em máquina sem swap configurado — que é o caso
    # comum num Raspberry com o dphys-swapfile desligado.
    swap_total = float(m.get("SwapTotal", 0))
    swap_usado = max(0.0, swap_total - float(m.get("SwapFree", 0)))
    return total, usada, swap_usado / GB, swap_total / GB


def _ler_macos():
    p, tam = _paginas()
    total = float(_rodar(["sysctl", "-n", "hw.memsize"]).strip() or 0)
    usada = (p.get("pages active", 0) + p.get("pages wired down", 0) +
             p.get("pages occupied by compressor", 0)) * tam
    swap_usado, swap_total = _swap()
    return total, usada, swap_usado, swap_total


def ler():
    nucleos = os.cpu_count() or 1
    # getloadavg e cpu_count existem nos dois sistemas — a carga é a única
    # métrica deste módulo que não precisou de porte.
    carga = os.getloadavg()[0]
    cpu = min(100, round(carga / nucleos * 100))

    total, usada, swap_usado, swap_total = \
        _ler_macos() if sys.platform == "darwin" else _ler_linux()
    ram = round(usada / total * 100) if total else 0
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


# Quantos processos por lista. Seis cabe na tela de detalhe sem rolar, e depois
# do sexto a informação já é ruído: quem está comendo a máquina está no topo.
QUANTOS = 6


def _nome_curto(caminho):
    """Um nome que dê para ler de longe, a partir do caminho do executável.

    O `comm` do ps devolve o caminho inteiro, e no macOS os caminhos interessantes
    são longos justamente nos processos que mais pesam:

        /Applications/Claude.app/Contents/Frameworks/Claude Helper.app/Contents/MacOS/Claude Helper

    O último componente já é o nome útil ("Claude Helper"), então é ele que fica.
    """
    nome = caminho.rsplit("/", 1)[-1].strip()
    return nome[:38] if nome else caminho[:38]


def processos(quantos=QUANTOS):
    """Os processos que mais consomem CPU e memória.

    NÃO há lista de swap. O macOS não expõe swap por processo de um jeito
    barato — só o total do sistema, que já aparece no cartão. `footprint` traria
    a memória comprimida de um processo, mas pede privilégio e demora, o que não
    cabe num laço que roda a cada poucos segundos. Mostrar uma coluna de swap
    inventada a partir do RSS seria pior do que não mostrar.

    Uma chamada só ao ps, duas ordenações aqui.
    """
    saida = _rodar(["ps", "-Ao", "pid,pcpu,rss,comm"])
    linhas = []
    for linha in saida.splitlines()[1:]:
        partes = linha.strip().split(None, 3)
        if len(partes) < 4:
            continue
        try:
            pid, cpu, rss = int(partes[0]), float(partes[1]), int(partes[2])
        except ValueError:
            continue
        linhas.append({"pid": pid, "cpu": round(cpu, 1),
                       "mem_mb": round(rss / 1024.0), "nome": _nome_curto(partes[3])})

    por_cpu = sorted(linhas, key=lambda p: -p["cpu"])[:quantos]
    por_mem = sorted(linhas, key=lambda p: -p["mem_mb"])[:quantos]
    return {"cpu": por_cpu, "memoria": por_mem, "total": len(linhas)}
