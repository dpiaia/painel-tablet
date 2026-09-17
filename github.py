"""Pull requests, pelo `gh` que já está autenticado na máquina.

Usa o CLI em vez de falar HTTP com a API porque o token já está no chaveiro do
macOS: nenhuma credencial nova para guardar, nada a expirar, nada a rodar no
config. O preço é depender do `gh` estar instalado e logado — se não estiver, o
painel diz isso em vez de mostrar uma lista vazia como se não houvesse PR.

Uma consulta só traz as três listas (minhas, do repo de design, e as que pedem
revisão minha): três buscas separadas seriam três idas à rede.
"""
import json
import subprocess

CAMPOS = """
  number title url isDraft
  repository { nameWithOwner }
  author { login }
  reviewDecision
  commits(last: 1) { nodes { commit { statusCheckRollup { state } } } }
"""

CONSULTA = """
{
  viewer { login }
  meus:    search(query: "is:pr is:open author:@me", type: ISSUE, first: 20)
           { nodes { ... on PullRequest { %s } } }
  design:  search(query: "is:pr is:open repo:%%s", type: ISSUE, first: 20)
           { nodes { ... on PullRequest { %s } } }
  pedidos: search(query: "is:pr is:open review-requested:@me", type: ISSUE, first: 20)
           { nodes { ... on PullRequest { %s } } }
}
""" % (CAMPOS, CAMPOS, CAMPOS)


def _limpar(no, pedidos_ids):
    if not no:
        return None
    commits = (no.get("commits") or {}).get("nodes") or [{}]
    rollup = (commits[0] or {}).get("commit", {}).get("statusCheckRollup") or {}
    return {
        "repo": (no.get("repository") or {}).get("nameWithOwner", ""),
        "numero": no.get("number"),
        "titulo": (no.get("title") or "").strip(),
        "autor": (no.get("author") or {}).get("login", "?"),
        "rascunho": bool(no.get("isDraft")),
        # REVIEW_REQUIRED / APPROVED / CHANGES_REQUESTED / None
        "revisao": no.get("reviewDecision"),
        # SUCCESS / FAILURE / PENDING / None (sem CI configurado)
        "ci": rollup.get("state"),
        "meu_review": no.get("number") in pedidos_ids,
    }


def ler(gh, repo_design, timeout=45):
    r = subprocess.run([gh, "api", "graphql", "-f", "query=" + (CONSULTA % repo_design)],
                       capture_output=True, text=True, timeout=timeout)
    if r.returncode != 0:
        erro = (r.stderr or r.stdout).strip().splitlines()
        raise RuntimeError(erro[-1] if erro else "gh falhou")

    dados = json.loads(r.stdout)["data"]
    pedidos = {n["number"] for n in (dados["pedidos"]["nodes"] or []) if n}

    def lista(chave):
        return [x for x in (_limpar(n, pedidos) for n in dados[chave]["nodes"]) if x]

    meus = lista("meus")
    design = lista("design")
    return {
        # Quem sou eu, para a tela distinguir "PR meu esperando revisão de
        # alguém" de "PR de outra pessoa esperando revisão minha" — mesmo
        # estado no GitHub, ações opostas.
        "eu": (dados.get("viewer") or {}).get("login", ""),
        "meus": meus,
        "design": design,
        # quantos realmente esperam uma ação sua no repo de design
        "aguardando": sum(1 for p in design
                          if p["revisao"] != "APPROVED" and p["autor"] != "dependabot"),
        "erro": None,
    }


if __name__ == "__main__":
    import sys
    print(json.dumps(ler(sys.argv[1] if len(sys.argv) > 1 else "/opt/homebrew/bin/gh",
                         "sua-org/seu-repo"), ensure_ascii=False, indent=2)[:1500])
