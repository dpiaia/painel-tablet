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

## `web/marcas/` — selos de tema

Logotipos que aparecem na barra do topo conforme o tema:

| arquivo | de quem é |
|---|---|
| `win95-topo.png`, `xp-topo.png` | Microsoft |
| `apple-topo.png` | Apple |
| `orkut.png` | Google |

São **marcas registradas de seus donos**, aqui apenas para identificar o tema
que homenageiam — não para sugerir qualquer vínculo com eles. Não estão sob a
licença MIT deste repositório, e ninguém pode relicenciá-las.

Os dois logotipos do Windows tiveram o fundo branco removido
(`ferramentas/limpar_octodex.py`), para pousarem sobre a cor da barra. Isso é
uma adaptação, feita para exibição.

## `web/fundos/` — papéis de parede

| arquivo | de quem é |
|---|---|
| `win95-nuvens.jpg` | Microsoft — "Clouds", do Windows 95 |
| `winxp-colina.jpg` | Microsoft — "Bliss", do Windows XP |
| `matrix-chuva.jpg` | gerado para este projeto; cobertos pela MIT |

**Atenção a estes dois.** Os papéis de parede do Windows são fotografias
licenciadas pela Microsoft, e isso é mais delicado que os logotipos: logotipo
identificando um tema é uso comum, fotografia redistribuída não é. Eles vêm
aqui para o painel funcionar assim que alguém clona; quem for usar este projeto
para outra coisa deve trocá-los.

O do XP foi reduzido de 4500 para 1600px, porque o tablet tem 1,4 GB de RAM e o
navegador descomprime a imagem inteira antes de escalar.

Qualquer imagem que você colocar nessa pasta aparece no painel de controle, e é
sua — não deste repositório.
