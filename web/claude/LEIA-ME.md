# Os mascotes

O painel usa o mascote do Claude (o "Clawd") em seis arquivos, um por estado.

| arquivo | estado | o que mostra |
|---|---|---|
| `picareta.gif` | processando | o bicho cavando |
| `faiscas.gif` | processando | o bicho com faíscas — alterna com o anterior |
| `acenando.gif` | precisa de você | bracinhos pra cima |
| `fogos.gif` | concluído | fogos na cabeça |
| `asterisco.gif` | descanso | o asterisco girando |
| `dormindo.svg` | dormindo | deitado com Z — estático |

Cada GIF tem um `.png` do primeiro quadro ao lado, usado nas telas que mostram
várias sessões de uma vez (animar todas custaria caro à toa).

Trocar qual arquivo vai em qual estado é uma linha no registro `GIFS` do
`web/app.js`.

## Um conserto que vale lembrar

O `faiscas.gif` veio do Tenor com a faísca desenhada como um **quadriculado
preto-e-branco**. Não era arte: era a grade que editores de imagem mostram
atrás de área transparente, achatada dentro do arquivo por uma exportação sem
alfa. No painel aparecia como um bloco xadrez colado no bichinho.

Consertado com `ferramentas/tirar_xadrez.py`, que acha a mancha pela
**saturação** (a grade é acromática, o corpo é terracota saturado) e a repinta
com o mesmo dourado que o `fogos.gif` usa nas faíscas dele — dourado se lê
tanto no cartão escuro quanto no bege do Windows XP, o que branco não faz.

Se outro GIF chegar com o mesmo defeito, é o mesmo comando. Rode antes com
`--conferir`: ele relata quantos pixels tocaria sem gravar nada.

## Créditos

- As animações do Clawd vêm das que a **Anthropic** publica nas redes sociais,
  que circulam no Tenor.
- `dormindo.svg` é do **[icons8](https://icons8.com.br/icons/set/clawd)**, que
  tem o Clawd em várias poses e é uma boa fonte para estados novos.

Os arquivos aqui foram redimensionados e tratados (ver abaixo), não são os
originais.

## Gerar os seus

`ferramentas/bichos.py` desenha o mascote em pixel art e exporta GIF com fundo
transparente — animação, cor e tamanho definidos no código.

```bash
python3 ferramentas/bichos.py
```

## Tratar um GIF de fora: três armadilhas

1. **Uma paleta para a animação inteira.** Paleta por quadro faz a cor derivar —
   o bichinho troca de cor sozinho no meio do loop. Aconteceu aqui.
2. **Recorte na união das caixas de todos os quadros.** Recortar quadro a quadro
   faz o personagem pular de posição.
3. **Transparência por preenchimento a partir das bordas**, não "todo pixel
   preto vira transparente" — isso fura os contornos do desenho.

E se for instalar um SVG do icons8: os retângulos sem `fill` saem pretos (os que
ficam fora do corpo somem num fundo escuro), e não troque `width`/`height` por
`100%`, senão o `<img>` renderiza uma caixa vazia.

## Custo

Medido num Galaxy Tab E de 2015: um GIF animado custa ~33% de um núcleo. O mesmo
desenho em SVG animado suave custa 3,6x mais; em `step-end`, empata. Por isso o
painel congela os mascotes depois de 1 minuto — menos o "precisa de você", que
nunca para.
