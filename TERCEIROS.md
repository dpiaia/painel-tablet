# Material de terceiros

A licença MIT deste repositório cobre **o código**. As imagens abaixo não são
nossas: vêm com os arquivos para o painel funcionar assim que alguém clona, mas
continuam pertencendo a quem as fez, sob os termos de cada um.

Se você for usar este projeto para outra coisa que não um painel pessoal,
confira os termos antes — principalmente os do Octodex.

## `web/octodex/` — octocats da GitHub

Baixados de <https://octodex.github.com>, pelo `ferramentas/baixar_octodex.py`.

O FAQ do Octodex permite usar as imagens **para se referir à GitHub**, que é
exatamente o que o painel faz: elas só aparecem no cartão do GitHub e nas cenas
de pull request. O mesmo FAQ diz que tudo ali é *"official GitHub artwork and is
under GitHub's trademark license"*, e que nenhuma adaptação é permitida sem
autorização por escrito.

Duas coisas para quem clonar saber:

- Estas imagens **não estão sob a licença MIT** deste repositório. Ninguém pode
  relicenciá-las, e incluí-las aqui não as relicencia.
- Metade delas foi **tratada**: o fundo branco foi removido
  (`ferramentas/limpar_octodex.py`), porque numa cena de tela cheia ele
  aparecia como um selo retangular. Isso é uma adaptação, feita para exibição
  local. Os originais continuam disponíveis na fonte.

GITHUB®, o logotipo da GITHUB®, OCTOCAT® e o desenho do OCTOCAT® são marcas
registradas da GitHub, Inc.

## `web/claude/` — o Clawd

As animações vêm das que a **Anthropic** publica nas redes sociais e circulam no
Tenor. O `dormindo.svg` é do **[icons8](https://icons8.com.br/icons/set/clawd)**.
Todos foram redimensionados e tratados para caber no orçamento de CPU do
tablet — ver `web/claude/LEIA-ME.md`.

## Ícones desenhados aqui

O polegar do tema Facebook e a maçã do tema Apple foram **desenhados para este
projeto** e são cobertos pela MIT como o resto do código. São propositalmente
genéricos: um gesto e uma fruta. O logotipo do Facebook é o "f" azul e o da
Apple é a maçã mordida — nenhum dos dois está aqui, porque são marcas
registradas e não seriam nossas para distribuir sob MIT.

## Pastas que continuam fora do git

- `web/fundos/` — papéis de parede, que são de quem os colocar lá.
- `web/marcas/` — ícones de marca por tema, pelo mesmo motivo.
