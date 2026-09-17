#!/usr/bin/env python3
"""Servidor do painel do tablet.

O Mac é o cérebro: faz todas as chamadas externas (clima, e depois agenda,
e-mail, Chat) e mantém um dicionário de estado. O tablet é só vidro: abre a
página, escuta /events e redesenha o que chegar. Nenhuma credencial sai daqui.

Uso:  python3 server.py [--porta 8080]
"""
import argparse
import errno
import json
import mimetypes
import os
import queue
import socket
import subprocess
import threading
import time
import urllib.parse
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import agenda
import claude
import github
import maquina
import sistema
import weather

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
WEB_DIR = os.path.join(BASE_DIR, "web")
CONFIG_PATH = os.path.join(BASE_DIR, "config.json")
CLAUDE_PATH = os.path.join(BASE_DIR, "estado-claude.json")

# 8766 e não 8080 de propósito: 8080 é porta disputada (qualquer projeto quer
# ela) e este servidor tem que ficar de pé o ano inteiro sem brigar com nada.
# 8765 já é do sdpro-clock, então o painel fica no vizinho.
PADRAO = {
    "cidade": "Paulínia, SP",
    "porta": 8766,
    "clima_intervalo_s": 600,
    # Caminho absoluto de propósito: o LaunchAgent roda com um PATH mínimo e
    # não acha o adb sozinho.
    "adb": "/opt/homebrew/bin/adb",
    "tablet": "192.168.0.23:5555",
    "agenda_intervalo_s": 120,
}

# Cada chave vira um cartão na tela. None = ainda não implementado (fase futura),
# e a página desenha o cartão em cinza em vez de mentir um valor.
_estado = {
    "clima": None,     # fase 1
    "agenda": None,    # fase 2
    "email": None,     # fase 2
    "claude": None,    # fase 3
    "chat": None,      # fase 4 — vem da extensão
    "whatsapp": None,  # fase 4 — vem da extensão
    "sistema": None,   # bateria e Wi-Fi do tablet, pelo adb
    "maquina": None,   # saúde do Mac: carga, memória, swap
    "git": None,       # pull requests, pelo gh
    "ajustes": None,   # o que o painel de controle define
}

# Fontes que a extensão do navegador tem permissão de escrever. Lista fechada
# de propósito: um POST não pode inventar chave nova no estado.
FONTES_EXTERNAS = ("email", "chat", "whatsapp")
PADRAO_PAINEL = ("cartoes", "tempos", "cores", "recado", "ordem", "tema")

# Chaves do topo do config que o painel de controle pode mudar. Lista fechada
# de propósito: um POST não encosta em token, caminho de binário nem porta.
FONTES_EDITAVEIS = ("cidade", "repo_design", "clima_intervalo_s",
                    "agenda_intervalo_s", "github_intervalo_s", "maquina_intervalo_s")
TOKEN = ""

# Sessões do Claude Code, alimentadas pelos hooks. Vive fora de _estado porque
# é registro de trabalho, não coisa de tela: o que vai para a tela é o resumo.
_claude = {}
_claude_vivos = -1          # processos do Claude Code; atualizado pela poda
_trava_claude = threading.Lock()


# Pastas que não dizem nada sozinhas: "Trabalhando em Projects" não informa
# nada. Nesses casos vale mostrar o pai junto.
GENERICAS = {"projects", "documents", "repositorios", "repos", "src", "code",
             "dev", "workspace", "desktop", "home"}


def nome_projeto(cwd):
    partes = [p for p in cwd.rstrip("/").split("/") if p]
    if not partes:
        return ""
    if partes[-1].lower() in GENERICAS and len(partes) > 1:
        return "%s/%s" % (partes[-2], partes[-1])
    return partes[-1]


def publicar_claude():
    with _trava_claude:
        resumo = claude.resumo(_claude, _claude_vivos)
        copia = dict(_claude)
    publicar(claude=resumo)

    # Grava em disco para o registro sobreviver a reinício do serviço. Sem
    # isso, todo restart deixava o cartão em "sem leitura" até você digitar
    # alguma coisa — e um reboot do Mac faria o mesmo.
    try:
        with open(CLAUDE_PATH, "w", encoding="utf8") as fh:
            json.dump(copia, fh)
    except OSError:
        pass


def carregar_claude():
    try:
        with open(CLAUDE_PATH, encoding="utf8") as fh:
            dados = json.load(fh)
    except (OSError, ValueError):
        return
    if isinstance(dados, dict):
        _claude.update(dados)
        # A poda decide o que ainda vale: se o Mac reiniciou, nenhum processo
        # do Claude está vivo e tudo isto vira fantasma na primeira varredura.
        claude.podar(_claude)
_trava = threading.Lock()
_inscritos = set()
_trava_inscritos = threading.Lock()


def recarregar_tablet(cfg):
    """Recarrega a página no tablet, contando cada passo.

    O adb cai sozinho o tempo todo (o tablet dorme, o Wi-Fi oscila), e antes
    isto falhava em silêncio: o botão piscava e nada acontecia. Agora ele
    reconecta quando precisa e devolve o que fez, passo a passo — se falhar,
    você lê por quê em vez de ficar apertando de novo.
    """
    adb = cfg.get("adb", "")
    serial = cfg.get("tablet", "")
    url = "http://%s:%d" % (ip_local(), int(cfg.get("porta", 8766)))
    passos = []

    def rodar(args, limite=15):
        return subprocess.run([adb] + args, capture_output=True, text=True, timeout=limite)

    if not (adb and serial):
        return {"ok": False, "passos": ["falta 'adb' ou 'tablet' no config"]}

    try:
        ligado = ("%s\tdevice" % serial) in rodar(["devices"], 10).stdout
        if not ligado:
            passos.append("adb estava fora — reconectando")
            rodar(["disconnect", serial], 10)
            rodar(["connect", serial], 12)
            ligado = ("%s\tdevice" % serial) in rodar(["devices"], 10).stdout
            if not ligado:
                passos.append("não respondeu: o tablet está ligado e na rede?")
                return {"ok": False, "passos": passos}
            passos.append("reconectado")

        rodar(["-s", serial, "shell", "input", "keyevent", "KEYCODE_WAKEUP"], 10)
        r = rodar(["-s", serial, "shell", "am", "start",
                   "-a", "android.intent.action.VIEW", "-d", url,
                   "-n", "de.ozerov.fully/.MainActivity"], 20)
        if r.returncode != 0 or "Error" in (r.stderr or ""):
            # Fully Kiosk pode não estar instalado; tenta o navegador padrão
            passos.append("Fully Kiosk não respondeu — tentando o navegador padrão")
            r = rodar(["-s", serial, "shell", "am", "start",
                       "-a", "android.intent.action.VIEW", "-d", url], 20)
            if r.returncode != 0:
                passos.append((r.stderr or "falhou").strip()[:80])
                return {"ok": False, "passos": passos}

        passos.append("página recarregada")
        return {"ok": True, "passos": passos}
    except subprocess.TimeoutExpired:
        passos.append("o adb travou — tablet dormindo ou fora da rede")
        return {"ok": False, "passos": passos}
    except Exception as erro:
        passos.append(str(erro)[:90])
        return {"ok": False, "passos": passos}


def diagnostico(cfg):
    """Responde 'está tudo funcionando?' sem ninguém precisar perguntar.

    Cada item devolve estado (ok/aviso/ruim), um texto curto e a idade do dado
    quando ela existe. A pergunta que mais se repetiu construindo isto foi
    "a extensão está reportando?", e ela agora tem resposta na tela.
    """
    agora = time.time()
    fotos = retrato()
    itens = []

    def idade(ts):
        return None if not ts else agora - ts

    def linha(chave, nome, estado, texto, seg=None):
        itens.append({"chave": chave, "nome": nome, "estado": estado,
                      "texto": texto, "idade": seg})

    # --- telas ligadas neste momento (cada aba do painel segura um SSE)
    with _trava_inscritos:
        telas = len(_inscritos)
    linha("telas", "Telas conectadas", "ok" if telas else "aviso",
          "%d aberta%s" % (telas, "" if telas == 1 else "s"))

    # --- extensão do navegador
    fontes = [fotos.get(k) for k in FONTES_EXTERNAS]
    marcas = [f.get("atualizado_em") for f in fontes if isinstance(f, dict) and f.get("atualizado_em")]
    if not marcas:
        linha("extensao", "Extensão do Opera", "ruim", "nunca reportou")
    else:
        seg = idade(max(marcas))
        linha("extensao", "Extensão do Opera",
              "ok" if seg < 180 else "ruim",
              "reportando" if seg < 180 else "parada", seg)

    # --- adb / tablet
    adb, serial = cfg.get("adb", ""), cfg.get("tablet", "")
    try:
        saida = subprocess.run([adb, "devices"], capture_output=True, text=True,
                               timeout=8).stdout
        ligado = ("%s\tdevice" % serial) in saida
    except Exception:
        ligado = False
    linha("adb", "adb no tablet", "ok" if ligado else "aviso",
          serial if ligado else "fora de alcance")

    # --- agenda (depende do adb)
    ag = fotos.get("agenda") or {}
    if ag.get("erro"):
        linha("agenda", "Agenda", "ruim", str(ag["erro"])[:60], idade(ag.get("atualizado_em")))
    else:
        linha("agenda", "Agenda", "ok", "%d eventos na semana" % len(ag.get("itens") or []),
              idade(ag.get("atualizado_em")))

    # --- github
    g = fotos.get("git") or {}
    if not g:
        linha("github", "GitHub", "aviso", "ainda não leu")
    elif g.get("erro"):
        linha("github", "GitHub", "ruim", str(g["erro"])[:60])
    else:
        linha("github", "GitHub", "ok", "%d PRs seus · %d no design"
              % (len(g.get("meus") or []), len(g.get("design") or [])))

    # --- clima
    linha("clima", "Clima", "ok" if fotos.get("clima") else "ruim",
          (fotos.get("clima") or {}).get("cidade") or "sem leitura")

    # --- claude code
    c = fotos.get("claude") or {}
    linha("claude", "Claude Code", "ok" if c.get("sessoes") else "aviso",
          "%d sessão(ões)" % len(c.get("sessoes") or []))

    return {"quando": agora, "itens": itens}


def eh_local(handler):
    """Só o próprio Mac mexe nos ajustes.

    A leitura do painel é aberta na rede (o tablet precisa), e isso é aceitável.
    Mas uma tela que MUDA as coisas não pode ficar exposta no Wi-Fi: quem chega
    pelo IP leva 403, quem chega pelo localhost entra.
    """
    ip = handler.client_address[0]
    return ip in ("127.0.0.1", "::1", "localhost")


_versao_config = 0


def esperar(segundos):
    """Dorme o intervalo, mas acorda em até 2 s se o config mudar.

    Sem isto, trocar a cidade no painel de controle só valeria na próxima
    volta do laço — até 10 minutos depois. Ninguém espera 10 minutos para
    conferir se digitou o nome certo.
    """
    alvo = _versao_config
    fim = time.time() + segundos
    while True:
        resta = fim - time.time()
        if resta <= 0 or _versao_config != alvo:
            return
        time.sleep(min(2.0, max(0.1, resta)))


def gravar_config(cfg):
    tmp = CONFIG_PATH + ".tmp"
    with open(tmp, "w", encoding="utf8") as fh:
        json.dump(cfg, fh, indent=2, ensure_ascii=False)
    os.replace(tmp, CONFIG_PATH)   # troca atômica: nunca deixa o arquivo pela metade
    global _versao_config
    _versao_config += 1            # acorda os laços que estiverem dormindo


def carregar_config():
    cfg = dict(PADRAO)
    try:
        with open(CONFIG_PATH, encoding="utf8") as fh:
            cfg.update(json.load(fh))
    except (OSError, ValueError) as erro:
        print("config.json ilegível (%s); usando padrões" % erro)
    return cfg


def versao_web():
    """Impressão digital dos arquivos que o tablet carrega.

    Ajuste de cor viaja pelo SSE e vale na hora; mudança de HTML ou CSS, não —
    o tablet fica com a versão velha até alguém recarregar, e alguém precisa
    estar na frente dele. Com esta marca no estado, a própria página percebe
    que o código mudou e se recarrega.
    """
    marcas = []
    for nome in ("index.html", "app.js", "style.css", "temas.css"):
        try:
            st = os.stat(os.path.join(WEB_DIR, nome))
            marcas.append("%d-%d" % (st.st_mtime, st.st_size))
        except OSError:
            marcas.append("?")
    return "|".join(marcas)


def retrato():
    with _trava:
        dados = dict(_estado)
    # O tablet acerta o relógio por aqui: o relógio dele pode estar errado,
    # e o do Mac é o que manda nos horários da agenda.
    dados["servidor_ts"] = time.time()
    dados["versao_web"] = versao_web()
    return dados


def publicar(**mudanca):
    """Mescla no estado e empurra para todo mundo conectado."""
    with _trava:
        _estado.update(mudanca)
    carga = json.dumps(retrato(), ensure_ascii=False)
    with _trava_inscritos:
        alvos = list(_inscritos)
    for fila in alvos:
        try:
            fila.put_nowait(carga)
        except queue.Full:
            pass  # cliente lento; ele pega o estado inteiro no próximo evento


def ip_local():
    """IP desta máquina na LAN (sem depender de DNS nem de config)."""
    s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    try:
        s.connect(("8.8.8.8", 80))   # não envia nada, só resolve a rota
        return s.getsockname()[0]
    except OSError:
        return "127.0.0.1"
    finally:
        s.close()


class Handler(BaseHTTPRequestHandler):
    protocol_version = "HTTP/1.1"
    server_version = "painel/1.0"

    def log_message(self, fmt, *args):
        if self.path.startswith("/events"):
            return   # o SSE fica aberto por horas; não polui o log
        print("%s %s" % (self.command, self.path))

    def _cors(self):
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _corpo(self, limite=256 * 1024):
        tamanho = int(self.headers.get("Content-Length") or 0)
        if not 0 < tamanho <= limite:
            return None
        try:
            return json.loads(self.rfile.read(tamanho).decode("utf8"))
        except (ValueError, UnicodeDecodeError):
            return None

    def _vazio(self):
        self.send_response(204)
        self._cors()
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _hook_claude(self):
        """Evento vindo de um hook do Claude Code.

        Recebe o payload do hook inteiro, como ele sai: assim o script do hook
        é um curl de uma linha, sem parsear JSON em shell nem pagar a partida
        de um interpretador a cada evento.
        """
        if not TOKEN or self.headers.get("X-Painel-Token") != TOKEN:
            return self.send_error(403, "token invalido")

        dados = self._corpo(64 * 1024) or {}
        evento = dados.get("hook_event_name") or ""
        id_sessao = dados.get("session_id") or ""
        projeto = nome_projeto(dados.get("cwd") or "")

        with _trava_claude:
            mudou = claude.aplicar(_claude, evento, id_sessao, projeto,
                                   dados.get("transcript_path"))
        if mudou:
            publicar_claude()

        # 204 sempre, mesmo em evento ignorado: o hook não deve nem pensar em
        # repetir. Travar o Claude Code por causa do painel seria inaceitável.
        return self._vazio()

    def _ajustes(self):
        """Grava os ajustes vindos do painel de controle e empurra na hora.

        O tablet não precisa recarregar: a mudança viaja pelo mesmo SSE que já
        leva clima e agenda. Mexer numa cor no Mac acende a cor no tablet.
        """
        if not eh_local(self):
            return self.send_error(403, "so do proprio Mac")
        novos = self._corpo(64 * 1024)
        if not isinstance(novos, dict):
            return self.send_error(400, "json invalido")

        cfg = carregar_config()
        painel = cfg.get("painel") or {}

        # "fontes" mexe no topo do config (cidade, repo, intervalos), não na
        # seção do painel — por isso sai antes do laço.
        for chave, valor in (novos.pop("fontes", None) or {}).items():
            if chave not in FONTES_EDITAVEIS:
                continue
            # Guarda "org/repo" mesmo quando colaram a URL inteira: o resto do
            # código espera o formato curto.
            cfg[chave] = github.normalizar(valor) if chave == "repo_design" else valor

        for secao, valores in novos.items():
            if secao not in PADRAO_PAINEL:
                continue                      # lista fechada: POST não inventa seção
            if isinstance(valores, dict):
                painel.setdefault(secao, {}).update(valores)
            else:
                painel[secao] = valores
        cfg["painel"] = painel
        gravar_config(cfg)
        publicar(ajustes=painel)
        return self._json({"ok": True, "painel": painel,
                           "fontes": {k: cfg.get(k) for k in FONTES_EDITAVEIS}})

    def _acao(self):
        """Botões do painel de controle. Só coisas idempotentes e reversíveis."""
        if not eh_local(self):
            return self.send_error(403, "so do proprio Mac")
        nome = urllib.parse.parse_qs(urllib.parse.urlparse(self.path).query).get("nome", [""])[0]
        cfg = carregar_config()

        if nome == "recarregar":
            return self._json(recarregar_tablet(cfg))

        return self.send_error(400, "acao desconhecida")

    def do_POST(self):
        rota = self.path.split("?")[0]
        if rota == "/ajustes":
            return self._ajustes()
        if rota == "/acao":
            return self._acao()
        if rota == "/claude":
            return self._hook_claude()
        if rota != "/ingest":
            return self.send_error(404)

        dados = self._corpo()
        if dados is None:
            return self.send_error(400, "corpo ausente, grande demais ou json invalido")

        if not TOKEN or dados.get("token") != TOKEN:
            return self.send_error(403, "token invalido")

        agora = time.time()
        aceitas = {}
        for nome in FONTES_EXTERNAS:
            valor = (dados.get("fontes") or {}).get(nome)
            if isinstance(valor, dict):
                item = dict(valor)
                item["atualizado_em"] = agora
                aceitas[nome] = item
        if aceitas:
            publicar(**aceitas)

        corpo = b'{"ok":true}'
        self.send_response(200)
        self._cors()
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(corpo)))
        self.end_headers()
        self.wfile.write(corpo)

    def do_GET(self):
        rota = self.path.split("?")[0]
        if rota == "/events":
            return self._sse()
        if rota == "/api/estado":
            return self._json(retrato())
        if rota == "/controle":
            if not eh_local(self):
                return self.send_error(403, "o controle so abre no proprio Mac")
            return self._arquivo("controle.html")
        if rota == "/verificar-repo":
            if not eh_local(self):
                return self.send_error(403)
            alvo = urllib.parse.parse_qs(
                urllib.parse.urlparse(self.path).query).get("url", [""])[0]
            cfg = carregar_config()
            try:
                return self._json(github.verificar(cfg.get("gh", ""), alvo))
            except Exception as erro:
                return self._json({"ok": False, "repo": "", "motivo": str(erro)[:90]})
        if rota == "/diagnostico":
            if not eh_local(self):
                return self.send_error(403)
            return self._json(diagnostico(carregar_config()))
        if rota in ("/", "/index.html"):
            return self._indice()
        return self._arquivo(rota.lstrip("/"))

    # ------------------------------------------------------------ respostas
    def _cabecalho(self, tipo, tamanho):
        self.send_response(200)
        self.send_header("Content-Type", tipo)
        self.send_header("Content-Length", str(tamanho))
        # Três cabeçalhos para a mesma coisa porque o WebView 64 (e o cache do
        # Fully Kiosk por cima dele) ignora o Cache-Control sozinho: ele servia
        # o index.html velho, que por sua vez apontava para o app.js?v= antigo,
        # e o tablet ficava rodando código de meia hora atrás.
        self.send_header("Cache-Control", "no-store, no-cache, must-revalidate, max-age=0")
        self.send_header("Pragma", "no-cache")
        self.send_header("Expires", "0")
        self.end_headers()

    def _json(self, obj):
        corpo = json.dumps(obj, ensure_ascii=False).encode("utf8")
        self._cabecalho("application/json; charset=utf-8", len(corpo))
        self.wfile.write(corpo)

    def _indice(self):
        """Serve a página com ?v=<mtime> no CSS e no JS.

        O WebView do tablet guardava o app.js antigo mesmo com no-store, e a
        página ficava pedindo arquivos que tinham mudado de nome — 404 mudo e
        cartão vazio. Com a marca de tempo na URL, código novo é URL nova e não
        existe cache velho para servir.
        """
        caminho = os.path.join(WEB_DIR, "index.html")
        try:
            with open(caminho, encoding="utf8") as fh:
                html = fh.read()
        except OSError:
            return self.send_error(404)

        for arquivo in ("style.css", "temas.css", "app.js"):
            try:
                versao = int(os.path.getmtime(os.path.join(WEB_DIR, arquivo)))
            except OSError:
                continue
            html = html.replace('"%s"' % arquivo, '"%s?v=%d"' % (arquivo, versao))

        corpo = html.encode("utf8")
        self._cabecalho("text/html; charset=utf-8", len(corpo))
        self.wfile.write(corpo)

    def _arquivo(self, nome):
        # Trava de travessia feita no caminho RESOLVIDO, não proibindo barra:
        # subpasta é legítima (web/claude/*.gif), "../.." não é. A versão
        # anterior barrava as duas e os GIFs davam 404 em silêncio.
        caminho = os.path.realpath(os.path.join(WEB_DIR, nome))
        if not caminho.startswith(os.path.realpath(WEB_DIR) + os.sep):
            return self.send_error(404)
        if not os.path.isfile(caminho):
            return self.send_error(404)
        tipo = mimetypes.guess_type(caminho)[0] or "application/octet-stream"
        if tipo.startswith("text/") or "javascript" in tipo or "json" in tipo:
            tipo += "; charset=utf-8"
        with open(caminho, "rb") as fh:
            corpo = fh.read()
        self._cabecalho(tipo, len(corpo))
        self.wfile.write(corpo)

    def _sse(self):
        fila = queue.Queue(maxsize=4)
        with _trava_inscritos:
            _inscritos.add(fila)
        try:
            self.send_response(200)
            self.send_header("Content-Type", "text/event-stream; charset=utf-8")
            self.send_header("Cache-Control", "no-cache")
            self.send_header("Connection", "close")
            self.end_headers()
            self._emitir(json.dumps(retrato(), ensure_ascii=False))
            while True:
                try:
                    carga = fila.get(timeout=15)
                except queue.Empty:
                    # Batimento. Evento nomeado, não comentário SSE: o
                    # comentário mantém o TCP vivo mas é invisível para o
                    # JavaScript, e o tablet precisa VER que o Mac respira
                    # para poder acender o aviso de desconectado.
                    self.wfile.write(b"event: ping\ndata: {}\n\n")
                    self.wfile.flush()
                    continue
                self._emitir(carga)
        except (BrokenPipeError, ConnectionResetError, OSError):
            pass   # tablet desconectou; o EventSource dele reconecta sozinho
        finally:
            with _trava_inscritos:
                _inscritos.discard(fila)

    def _emitir(self, carga):
        self.wfile.write(b"data: " + carga.encode("utf8") + b"\n\n")
        self.wfile.flush()


# ---------------------------------------------------------------- coletores
def laco_clima(_):
    # Relê o config a cada volta em vez de guardar no arranque: trocar a cidade
    # no painel de controle tem que valer sem reiniciar o serviço.
    local, cidade_lida = None, None
    while True:
        cfg = carregar_config()
        cidade = cfg.get("cidade", "")
        try:
            if local is None or cidade != cidade_lida:
                local = weather.geocodificar(cidade)
                cidade_lida = cidade
                if local is None:
                    print("clima: cidade %r não encontrada" % cidade)
            if local:
                publicar(clima=weather.agora(local))
        except Exception as erro:          # rede cai; o painel segue vivo
            print("clima falhou: %s" % erro)
        esperar(max(60, int(cfg.get("clima_intervalo_s", 600))))


def laco_agenda(cfg):
    intervalo = max(30, int(cfg.get("agenda_intervalo_s", 120)))
    adb = cfg.get("adb", "")
    serial = cfg.get("tablet", "")
    if not (adb and serial):
        print("agenda: falta 'adb' ou 'tablet' no config.json; laço desligado")
        return

    ultimos, ultimo_ts = [], None
    while True:
        try:
            ultimos = agenda.eventos(adb, serial, dias=7)
            ultimo_ts = time.time()
            publicar(agenda={"itens": ultimos, "atualizado_em": ultimo_ts, "erro": None})
        except Exception as erro:
            print("agenda falhou: %s" % erro)
            # Mantém o último resultado bom e marca como velho. Apagar a agenda
            # da tela seria pior: você olharia e acharia que o dia está livre.
            publicar(agenda={"itens": ultimos, "atualizado_em": ultimo_ts,
                             "erro": str(erro)})
        esperar(intervalo)


def laco_sistema(cfg):
    adb, serial = cfg.get("adb", ""), cfg.get("tablet", "")
    if not (adb and serial):
        return
    while True:
        try:
            publicar(sistema=sistema.ler(adb, serial))
        except Exception as erro:
            print("sistema falhou: %s" % erro)
            publicar(sistema=None)
        time.sleep(max(30, int(cfg.get("sistema_intervalo_s", 60))))


def laco_github(cfg):
    gh = cfg.get("gh", "")
    if not gh:
        print("github: falta 'gh' no config.json; laço desligado")
        return
    ultimo = None
    while True:
        # 5 minutos por padrão: PR não muda de minuto em minuto, e cada volta
        # são 3 buscas na API. Relido a cada ciclo, como a cidade.
        cfg = carregar_config()
        repo = cfg.get("repo_design", "")
        intervalo = max(60, int(cfg.get("github_intervalo_s", 300)))
        try:
            if not repo:
                raise RuntimeError("sem repo_design no config")
            ultimo = github.ler(gh, repo)
            publicar(git=ultimo)
        except Exception as erro:
            print("github falhou: %s" % erro)
            # Mantém a última lista boa e marca o erro: sumir com os PRs faria
            # você achar que não tem nada aberto.
            publicar(git=dict(ultimo or {"meus": [], "design": [], "aguardando": 0},
                              erro=str(erro)[:120]))
        esperar(intervalo)


def laco_maquina(cfg):
    # Mais frequente que os outros porque carga de CPU muda em segundos, e o
    # ponto deste número é justamente pegar o aperto enquanto ele acontece.
    intervalo = max(5, int(cfg.get("maquina_intervalo_s", 15)))
    while True:
        try:
            publicar(maquina=maquina.ler())
        except Exception as erro:
            print("maquina falhou: %s" % erro)
        time.sleep(intervalo)


def laco_claude():
    """Corrige o registro do que os hooks não conseguem contar sozinhos.

    Duas coisas: sessões que morreram sem mandar SessionEnd (crash, kill,
    reboot), e 'precisa de você' que voltou a trabalhar depois que você
    aprovou uma permissão — caso em que nenhum hook dispara.

    A reconciliação roda a cada 10 s (é só um `stat` por sessão em atenção),
    e a poda a cada 60 s (chama `ps`, que é mais caro).
    """
    global _claude_vivos
    volta = 0
    while True:
        try:
            with _trava_claude:
                mudou = claude.reconciliar(_claude)
            if volta % 6 == 0:
                vivos = claude.processos_vivos()
                with _trava_claude:
                    mudou = claude.podar(_claude) or mudou
                    mudou = mudou or vivos != _claude_vivos
                    _claude_vivos = vivos
            if mudou:
                publicar_claude()
        except Exception as erro:
            print("reconciliacao do claude falhou: %s" % erro)
        volta += 1
        time.sleep(10)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--porta", type=int, help="padrão: o do config.json")
    args = ap.parse_args()

    cfg = carregar_config()
    porta = args.porta or int(cfg.get("porta", PADRAO["porta"]))

    publicar(ajustes=cfg.get("painel") or {})
    carregar_claude()

    global TOKEN
    TOKEN = cfg.get("token_ingest") or ""
    if not TOKEN:
        print("aviso: sem token_ingest no config.json — /ingest vai recusar tudo")

    # Abre a porta ANTES de ligar os coletores: se a porta estiver ocupada,
    # é melhor morrer na hora com uma mensagem clara do que ficar um processo
    # zumbi buscando clima que ninguém vai ler.
    try:
        srv = ThreadingHTTPServer(("0.0.0.0", porta), Handler)
    except OSError as erro:
        if erro.errno == errno.EADDRINUSE:
            print("porta %d ocupada. Veja por quem:  lsof -nP -iTCP:%d -sTCP:LISTEN"
                  % (porta, porta))
            print("ou troque a porta em config.json")
            raise SystemExit(1)
        raise
    srv.daemon_threads = True

    threading.Thread(target=laco_clima, args=(cfg,), daemon=True).start()
    threading.Thread(target=laco_agenda, args=(cfg,), daemon=True).start()
    threading.Thread(target=laco_sistema, args=(cfg,), daemon=True).start()
    threading.Thread(target=laco_maquina, args=(cfg,), daemon=True).start()
    threading.Thread(target=laco_github, args=(cfg,), daemon=True).start()
    threading.Thread(target=laco_claude, daemon=True).start()
    print("painel no Mac:  http://localhost:%d" % porta)
    print("painel no tablet: http://%s:%d" % (ip_local(), porta))
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        print("\ntchau")


if __name__ == "__main__":
    main()
