"""Clima pelo Open-Meteo.

Escolhido por não pedir chave nem cadastro: uma dependência a menos para
apodrecer. O Mac é quem chama — o tablet nunca fala com a internet.
"""
import json
import urllib.parse
import urllib.request

TIMEOUT = 10
GEO = "https://geocoding-api.open-meteo.com/v1/search"
PREVISAO = "https://api.open-meteo.com/v1/forecast"

# Códigos WMO -> (texto, ícone). O ícone é uma palavra que o CSS entende.
WMO = {
    0: ("Céu limpo", "sol"),
    1: ("Quase limpo", "sol"),
    2: ("Parcialmente nublado", "sol-nuvem"),
    3: ("Nublado", "nuvem"),
    45: ("Névoa", "neblina"),
    48: ("Névoa gelada", "neblina"),
    51: ("Garoa fraca", "chuva"),
    53: ("Garoa", "chuva"),
    55: ("Garoa forte", "chuva"),
    61: ("Chuva fraca", "chuva"),
    63: ("Chuva", "chuva"),
    65: ("Chuva forte", "chuva"),
    66: ("Chuva congelante", "chuva"),
    67: ("Chuva congelante forte", "chuva"),
    71: ("Neve fraca", "neve"),
    73: ("Neve", "neve"),
    75: ("Neve forte", "neve"),
    77: ("Grãos de neve", "neve"),
    80: ("Pancadas fracas", "chuva"),
    81: ("Pancadas", "chuva"),
    82: ("Pancadas fortes", "chuva"),
    85: ("Pancadas de neve", "neve"),
    86: ("Pancadas de neve fortes", "neve"),
    95: ("Tempestade", "tempestade"),
    96: ("Tempestade com granizo", "tempestade"),
    99: ("Tempestade com granizo", "tempestade"),
}


def _buscar(url, params):
    alvo = url + "?" + urllib.parse.urlencode(params)
    req = urllib.request.Request(alvo, headers={"User-Agent": "painel-tablet/1.0"})
    with urllib.request.urlopen(req, timeout=TIMEOUT) as resp:
        return json.loads(resp.read().decode("utf8"))


def geocodificar(cidade):
    """Nome da cidade -> {nome, lat, lon}. None se não achar."""
    dados = _buscar(GEO, {"name": cidade.split(",")[0].strip(),
                          "count": 5, "language": "pt", "format": "json"})
    achados = dados.get("results") or []
    if not achados:
        return None
    # Se o usuário escreveu "Cidade, UF", prefere o resultado do estado certo.
    partes = [p.strip().lower() for p in cidade.split(",")]
    if len(partes) > 1:
        uf = partes[1]
        for a in achados:
            regiao = (a.get("admin1") or "").lower()
            if uf in regiao or regiao.startswith(uf):
                achados = [a]
                break
    a = achados[0]
    # Rótulo vem do que o usuário escreveu no config ("Paulínia, SP"), não do
    # geocoder: ele devolve "São Paulo" no admin1, e "Paulínia/São Paulo" na
    # tela fica pior que a sigla que a pessoa já digitou.
    partes = [x.strip() for x in cidade.split(",") if x.strip()]
    rotulo = "/".join(partes) if len(partes) > 1 else a["name"]
    return {"nome": a["name"], "rotulo": rotulo,
            "lat": a["latitude"], "lon": a["longitude"]}


def agora(local):
    """Condição atual + máxima/mínima e chance de chuva do dia."""
    dados = _buscar(PREVISAO, {
        "latitude": local["lat"],
        "longitude": local["lon"],
        "current": "temperature_2m,apparent_temperature,relative_humidity_2m,weather_code,is_day",
        "daily": ("temperature_2m_max,temperature_2m_min,"
                  "precipitation_probability_max,weather_code,sunrise,sunset"),
        "timezone": "auto",
        "forecast_days": 7,
    })
    atual = dados.get("current") or {}
    dia = dados.get("daily") or {}
    codigo = int(atual.get("weather_code", 3))
    texto, icone = WMO.get(codigo, ("—", "nuvem"))

    def primeiro(chave):
        valores = dia.get(chave) or []
        return valores[0] if valores else None

    return {
        "cidade": local.get("rotulo") or local["nome"],
        "temp": round(atual.get("temperature_2m", 0)),
        "sensacao": round(atual.get("apparent_temperature", 0)),
        "umidade": atual.get("relative_humidity_2m"),
        "texto": texto,
        "icone": icone,
        "dia": bool(atual.get("is_day", 1)),
        "max": round(primeiro("temperature_2m_max") or 0),
        "min": round(primeiro("temperature_2m_min") or 0),
        "chuva": primeiro("precipitation_probability_max"),
        # A semana inteira vai junto para a tela de detalhe abrir instantânea,
        # sem ida ao servidor no toque.
        "semana": semana(dia),
    }


def semana(dia):
    datas = dia.get("time") or []
    saida = []
    for i, data in enumerate(datas):
        def pega(chave, padrao=None):
            valores = dia.get(chave) or []
            return valores[i] if i < len(valores) else padrao
        codigo = int(pega("weather_code", 3) or 3)
        texto, icone = WMO.get(codigo, ("—", "nuvem"))
        saida.append({
            "data": data,
            "max": round(pega("temperature_2m_max") or 0),
            "min": round(pega("temperature_2m_min") or 0),
            "chuva": pega("precipitation_probability_max"),
            "texto": texto,
            "icone": icone,
            "nascer": (pega("sunrise") or "")[-5:],
            "por": (pega("sunset") or "")[-5:],
        })
    return saida
