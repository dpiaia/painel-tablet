"""Onde o painel está, para o clima não ficar mostrando outra cidade.

O PROBLEMA QUE ISTO RESOLVE: a cidade era fixa no `config.json`. Funciona até
você viajar — e aí o painel mostra 27° e sol de um lugar a 600 km com toda a
confiança do mundo, que é o tipo de mentira que este projeto não quer contar.

TRÊS FONTES, EM ORDEM DE PRECISÃO:

    navegador   coordenadas de verdade, da extensão, com permissão dada uma vez
    ip          a cidade do IP público: certa na região, errada por 10 ou 20 km
    config      o que você escreveu; manda quando `cidade_auto` está desligado

A precedência é por PRECISÃO e não por quem chegou primeiro, e cada leitura
carrega de onde veio. O cartão pode dizer "detectado" em vez de fingir que
alguém escolheu aquilo — e quando a detecção erra a cidade vizinha, você olha e
entende, em vez de achar que o painel enlouqueceu.

SOBRE MANDAR O IP PARA FORA: isto é a única coisa no projeto que fala de você
com um terceiro. O README diz isso com letras. Fica atrás de `cidade_auto`, que
vem DESLIGADO — quem liga, escolheu.
"""
import json
import time
import urllib.request

# Ordem importada: o primeiro que responder ganha. São três porque serviço
# gratuito de geolocalização cai, muda de política e passa a pedir chave —
# e um painel de mesa não pode perder o clima por causa disso.
#
# `uf` é o campo que traz a sigla do estado quando o serviço tem. Sem sigla o
# rótulo fica só com o nome da cidade, que é melhor que inventar a abreviação.
SERVICOS = [
    ("https://ipapi.co/json/",
     {"cidade": "city", "uf": "region_code", "lat": "latitude", "lon": "longitude"}),
    ("https://get.geojs.io/v1/ip/geo.json",
     {"cidade": "city", "uf": None, "lat": "latitude", "lon": "longitude"}),
    ("https://ipinfo.io/json",
     {"cidade": "city", "uf": None, "lat": None, "lon": None, "loc": "loc"}),
]

VALIDADE = 6 * 3600     # o IP não muda de cidade a cada minuto


def _pedir(url):
    req = urllib.request.Request(url, headers={
        # Serviço gratuito merece saber quem está batendo, e alguns recusam
        # requisição sem User-Agent.
        "User-Agent": "painel-tablet (github.com/dpiaia/painel-tablet)",
        "Accept": "application/json",
    })
    with urllib.request.urlopen(req, timeout=6) as r:
        return json.loads(r.read().decode("utf8"))


def por_ip():
    """A cidade do IP público, ou None se nenhum serviço respondeu."""
    for url, campos in SERVICOS:
        try:
            d = _pedir(url)
        except Exception:
            continue

        cidade = (d.get(campos["cidade"]) or "").strip()
        if not cidade:
            continue

        lat = lon = None
        if campos.get("lat"):
            lat, lon = d.get(campos["lat"]), d.get(campos["lon"])
        elif campos.get("loc") and d.get(campos["loc"]):
            # "-26.4861,-49.0667"
            try:
                lat, lon = [float(x) for x in str(d[campos["loc"]]).split(",")]
            except ValueError:
                pass
        if lat is None or lon is None:
            continue

        uf = (d.get(campos["uf"]) or "").strip() if campos.get("uf") else ""
        return {
            "nome": cidade,
            "rotulo": "%s/%s" % (cidade, uf) if uf else cidade,
            "lat": float(lat), "lon": float(lon),
            "fonte": "ip", "em": time.time(),
            "servico": url.split("/")[2],
        }
    return None


def do_navegador(bruto):
    """Coordenadas que a extensão mandou. O rótulo vem de quem souber o nome.

    A extensão tem as coordenadas boas e não tem o nome da cidade: pedir o
    nome exigiria um segundo serviço de terceiro, e não vale outra requisição
    sobre você para escrever o que o IP já acerta. Então as coordenadas são as
    dela — que são as que mudam o clima — e o nome fica emprestado.
    """
    try:
        lat, lon = float(bruto["lat"]), float(bruto["lon"])
    except (KeyError, TypeError, ValueError):
        return None
    if not (-90 <= lat <= 90 and -180 <= lon <= 180):
        return None
    return {"nome": "", "rotulo": "", "lat": lat, "lon": lon,
            "fonte": "navegador", "em": time.time(),
            "precisao_m": bruto.get("precisao")}


def escolher(config, ip, navegador):
    """Qual das três vale agora. Precisão primeiro, não quem chegou antes.

    O navegador ganha porque as coordenadas dele são de verdade; o IP entra
    quando não há navegador; e o config é o piso — ele também é o que ganha de
    todos quando `cidade_auto` está desligado, mas essa decisão é de quem
    chama, não daqui.
    """
    if navegador:
        # Empresta o nome de quem tiver: coordenadas sem rótulo deixariam o
        # cartão com o cabeçalho vazio, e "sua localização" não diz onde.
        emprestado = ip or config or {}
        return dict(navegador,
                    nome=emprestado.get("nome", ""),
                    rotulo=emprestado.get("rotulo") or "detectado")
    if ip:
        return ip
    if config:
        # O `local` que vem do geocodificador não carrega fonte — ele não sabe
        # que existe essa disputa. Estampar aqui em vez de deixar o servidor
        # supor com um `.get(..., "config")`: quem lê o retorno desta função
        # não devia precisar saber o que significa a ausência da chave.
        return dict(config, fonte="config")
    return None


if __name__ == "__main__":
    print(json.dumps(por_ip(), indent=2, ensure_ascii=False))
