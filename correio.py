"""E-mail por IMAP: quantos não lidos, de quem e sobre o quê.

POR QUE IMAP E NÃO A API DO GOOGLE: a API pede projeto no Google Cloud e, para
escopo de leitura de e-mail, verificação com avaliação de segurança paga e
anual. Isso faz sentido para um app publicado; para o seu próprio e-mail, é
cobrar um preço de produto por uma leitura pessoal. O IMAP entrega a mesma
coisa com uma senha de aplicativo, que leva dois minutos para gerar.

E o `imaplib` é biblioteca padrão — nada para instalar, que é a regra da casa.

POR QUE ELE É MELHOR QUE LER O TÍTULO DA ABA, que é o que a extensão faz hoje:

    aba          só o número, e só com o navegador aberto na conta
    IMAP         número, remetente, assunto e horário, com tudo fechado

NUNCA MARCA COMO LIDO. Duas precauções, e as duas importam: a caixa é aberta
em modo somente-leitura, e os cabeçalhos são buscados com `BODY.PEEK` em vez
de `BODY`. Sem o PEEK, o servidor marca a mensagem como vista no instante em
que o painel olha — e um painel que mexe na sua caixa de entrada para poder
mostrar a caixa de entrada é exatamente o oposto do que ele deve ser.

O painel é vidro: ele lê e não encosta.
"""
import email
import email.header
import email.utils
import imaplib
import time

QUANTOS = 5          # cabe na tela de detalhe sem rolar
TEMPO_LIMITE = 12    # segundos; servidor lento não pode travar o laço


def _texto(cru):
    """Cabeçalho MIME -> texto legível.

    Assunto em português chega como `=?UTF-8?B?...?=`, e às vezes partido em
    vários pedaços com codificações diferentes no mesmo cabeçalho. Sem decodificar,
    o painel mostraria o código em vez do assunto.
    """
    if not cru:
        return ""
    partes = []
    for pedaco, codigo in email.header.decode_header(cru):
        if isinstance(pedaco, bytes):
            partes.append(pedaco.decode(codigo or "utf8", "replace"))
        else:
            partes.append(pedaco)
    return " ".join("".join(partes).split())


def _quem(cru):
    """"Fulano <f@x.com>" -> "Fulano". Sem nome, fica o endereço."""
    nome, endereco = email.utils.parseaddr(_texto(cru))
    return nome or endereco


def _quando(cru):
    try:
        return email.utils.parsedate_to_datetime(cru).timestamp()
    except (TypeError, ValueError):
        return None


def _uma(conta):
    servidor = conta.get("servidor") or "imap.gmail.com"
    porta = int(conta.get("porta") or 993)
    pasta = conta.get("pasta") or "INBOX"
    nome = conta.get("nome") or (conta.get("usuario") or "").split("@")[0]

    M = imaplib.IMAP4_SSL(servidor, porta, timeout=TEMPO_LIMITE)
    try:
        M.login(conta["usuario"], conta["senha"])
        # readonly=True: a primeira das duas travas contra marcar como lido.
        M.select(pasta, readonly=True)

        ok, dados = M.search(None, "UNSEEN")
        if ok != "OK":
            raise RuntimeError("busca recusada pelo servidor")
        ids = (dados[0] or b"").split()

        ultimos = []
        # Os mais recentes primeiro: a lista do IMAP vem em ordem crescente.
        for ident in reversed(ids[-QUANTOS:]):
            ok, bruto = M.fetch(
                ident, "(BODY.PEEK[HEADER.FIELDS (FROM SUBJECT DATE)])")
            if ok != "OK" or not bruto or not isinstance(bruto[0], tuple):
                continue
            cab = email.message_from_bytes(bruto[0][1])
            ultimos.append({
                "de": _quem(cab.get("From")),
                "assunto": _texto(cab.get("Subject")) or "(sem assunto)",
                "em": _quando(cab.get("Date")),
            })

        return {"nome": nome, "aberto": True, "contador": len(ids),
                "ultimos": ultimos, "erro": None}
    finally:
        try:
            M.logout()
        except Exception:
            pass


def ler(contas):
    """Lê cada conta configurada. Uma que falha não derruba as outras.

    Conta que não respondeu volta com `aberto: False` e o motivo — nunca com
    zero. Zero não lido e "não consegui olhar" são coisas diferentes, e
    confundir as duas é o erro que este painel não comete.
    """
    saida = []
    for conta in contas or []:
        if not (conta.get("usuario") and conta.get("senha")):
            continue
        try:
            saida.append(_uma(conta))
        except Exception as erro:
            saida.append({
                "nome": conta.get("nome") or conta.get("usuario", "").split("@")[0],
                "aberto": False, "contador": None, "ultimos": [],
                "erro": str(erro)[:90],
            })
    return saida


def resumo(contas):
    """O formato que o cartão de mensagens já sabe desenhar.

    Ele espera `{aberto, contador, abas:[{conta, contador}]}` — o mesmo que a
    extensão manda. Falar a língua que já existe é o que deixa o IMAP entrar
    sem tocar no cartão.
    """
    por_conta = ler(contas)
    if not por_conta:
        return None

    vivas = [c for c in por_conta if c["aberto"]]
    return {
        "aberto": bool(vivas),
        # Soma só o que foi lido de verdade. Com uma conta fora, o total some
        # em vez de mentir um número menor que o real.
        "contador": sum(c["contador"] for c in vivas) if vivas else None,
        "abas": [{"conta": c["nome"], "contador": c["contador"]}
                 for c in por_conta],
        "contas": por_conta,
        "fonte": "imap",
        "em": time.time(),
    }


if __name__ == "__main__":
    import json
    import os
    cfg = json.load(open(os.path.join(os.path.dirname(os.path.abspath(__file__)),
                                      "config.json"), encoding="utf8"))
    print(json.dumps(resumo(cfg.get("correio")), indent=2, ensure_ascii=False))
