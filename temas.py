"""Os temas do painel, num lugar só.

POR QUE AQUI E NÃO NO NAVEGADOR: até agora a tabela morava no painel de
controle, que era a única tela que trocava tema. Agora o menu de configurações
do TABLET também troca — e duas cópias da mesma tabela em dois arquivos JS
divergem na primeira vez que alguém mexe num verde e esquece a outra.

O servidor passou a ser o dono: ele serve a tabela em `/temas.json` para quem
desenha o seletor, e expande o slug sozinho em `POST /tema`. Assim o cliente
só precisa saber o NOME do tema, nunca as doze cores.

Um tema são duas coisas que viajam por caminhos diferentes: a paleta, que vira
variável CSS no <html>, e a forma (canto, moldura, fonte, traço do ícone), que
é uma folha escolhida por data-tema. As duas saem juntas daqui, mas depois
podem ser mexidas em separado — dá para ficar no Windows 95 e trocar só o
verde.

`previa` diz o que o seletor desenha no quadradinho de cada tema:

    "relogio"  a hora de agora, nas cores do tema
    "marca"    o ícone do tema (web/marcas/<slug>.png, ou o desenho de reserva)

É decisão de tema, não de quem desenha o menu: o Escuro e o Matrix não têm
marca nenhuma, e o relógio é o que eles têm de mais reconhecível.
"""

PADRAO = {
    "fundo": "#000000", "cartao": "#0c0d10", "dentro": "#131620",
    "borda": "#1d1f26", "texto": "#ffffff", "apagado": "#7c8089",
    "fraco": "#4a4d55", "ciano": "#22d3ee", "azul": "#3b82f6",
    "verde": "#22c55e", "laranja": "#f59e0b", "vermelho": "#ef4444",
}

# A `cor` de cada tema é uma DECISÃO, não um campo da paleta: no Matrix e no
# Apple quem identifica é o destaque; no Windows 95 e no XP é a área de
# trabalho (o teal e o azul que todo mundo lembra); no Orkut é o rosa das
# comunidades, que marca mais que o azul do cabeçalho. Derivar isso de uma
# chave fixa acertaria em uns e erraria justo nos que têm cara própria.
LISTA = [
    {"nome": "Escuro", "slug": "escuro", "previa": "relogio", "cor": "#22d3ee", "cores": dict(PADRAO)},

    {"nome": "Claro", "slug": "claro", "previa": "relogio", "cor": "#2563eb", "cores": {
        "fundo": "#eef1f5", "cartao": "#ffffff", "dentro": "#f6f8fa",
        "borda": "#d8dee6", "texto": "#14181d", "apagado": "#59616c",
        "fraco": "#98a1ac", "ciano": "#0e7490", "azul": "#2563eb",
        "verde": "#15803d", "laranja": "#b45309", "vermelho": "#b91c1c"}},

    {"nome": "Apple", "slug": "apple", "previa": "marca", "cor": "#0071e3", "cores": {
        "fundo": "#f5f5f7", "cartao": "#ffffff", "dentro": "#fbfbfd",
        "borda": "#d2d2d7", "texto": "#1d1d1f", "apagado": "#6e6e73",
        "fraco": "#a1a1a6", "ciano": "#0071e3", "azul": "#0071e3",
        "verde": "#248a3d", "laranja": "#c04c00", "vermelho": "#d70015"}},

    # Orkut: o azul dos perfis e o rosa das comunidades, sobre fundo claro
    {"nome": "Orkut", "slug": "orkut", "previa": "marca", "cor": "#c0187a", "cores": {
        "fundo": "#e6eef8", "cartao": "#ffffff", "dentro": "#f2f7fd",
        "borda": "#b8cce4", "texto": "#1c3d6b", "apagado": "#4d76ab",
        "fraco": "#8ba7ca", "ciano": "#c0187a", "azul": "#6699cc",
        "verde": "#5c8a00", "laranja": "#d98c00", "vermelho": "#c00000"}},

    # Facebook clássico, o azul #3b5998 de antes do redesenho
    {"nome": "Facebook", "slug": "facebook", "previa": "marca", "cor": "#3b5998", "cores": {
        "fundo": "#e9ebee", "cartao": "#ffffff", "dentro": "#f6f7f9",
        "borda": "#dfe3ee", "texto": "#1d2129", "apagado": "#4b4f56",
        "fraco": "#8d949e", "ciano": "#3b5998", "azul": "#4267b2",
        "verde": "#2e9e1e", "laranja": "#c98a00", "vermelho": "#e02a34"}},

    # Windows XP Luna: o azul da barra de título sobre o bege das janelas
    {"nome": "Windows XP", "slug": "xp", "previa": "marca", "cor": "#245edb", "cores": {
        "fundo": "#3a6ea5", "cartao": "#ece9d8", "dentro": "#ffffff",
        "borda": "#7f9db9", "texto": "#0b0b0b", "apagado": "#4a4a45",
        "fraco": "#8a8a80", "ciano": "#0054e3", "azul": "#0054e3",
        "verde": "#2f8a2f", "laranja": "#d07b00", "vermelho": "#c00000"}},

    # Matrix: fósforo verde sobre preto. Duotone total — a gravidade vira
    # brilho, não matiz: "tudo bem" é o verde mais apagado da tela e
    # "quebrado" é quase branco, que é como um monitor monocromático sempre
    # avisou.
    {"nome": "Matrix", "slug": "matrix", "previa": "relogio", "cor": "#39ff14", "cores": {
        "fundo": "#000000", "cartao": "#020803", "dentro": "#04140a",
        "borda": "#0c4f22", "texto": "#33ff66", "apagado": "#1f9e45",
        "fraco": "#0f5c28", "ciano": "#39ff14", "azul": "#00b34a",
        "verde": "#148f3a", "laranja": "#4dff7a", "vermelho": "#b9ffcb"}},

    # Windows 95: o cinza das janelas sobre o teal da área de trabalho
    {"nome": "Windows 95", "slug": "win95", "previa": "marca", "cor": "#008080", "cores": {
        "fundo": "#008080", "cartao": "#c0c0c0", "dentro": "#dfdfdf",
        "borda": "#808080", "texto": "#000000", "apagado": "#404040",
        "fraco": "#6b6b6b", "ciano": "#000080", "azul": "#000080",
        "verde": "#006400", "laranja": "#806000", "vermelho": "#800000"}},
]

SLUGS = [t["slug"] for t in LISTA]


def por_slug(slug):
    """O tema, ou None. Lista fechada: nenhum POST inventa um tema novo."""
    for t in LISTA:
        if t["slug"] == slug:
            return t
    return None
