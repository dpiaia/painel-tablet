# Painel do tablet

Transforma um Samsung Galaxy Tab E parado num painel de trabalho: hora, agenda,
clima, e-mail, Google Chat e o estado do Claude Code, numa tela só.

O Mac é o cérebro e o tablet é só vidro. Todas as chamadas externas acontecem no
Mac; o tablet abre uma página HTTP na rede local e escuta atualizações. Nenhuma
credencial chega perto do aparelho.

## Instalar

Precisa de macOS (os coletores usam `vm_stat`, `sysctl` e `launchd`), Python 3.9+
e um tablet Android na mesma rede. `adb` e `gh` são opcionais — sem eles a
agenda e o cartão do GitHub ficam vazios, o resto funciona.

```bash
git clone <este-repo> ~/painel-tablet
cd ~/painel-tablet
python3 ferramentas/instalar.py     # pergunta cidade e tablet, gera o token
python3 server.py
```

Abra <http://localhost:8766> no Mac e <http://IP-DO-MAC:8766> no tablet.

O instalador gera o `config.json`, cria um token e o espalha nos três lugares
que precisam dele (servidor, extensão do navegador, hook do Claude Code).
Nenhum desses arquivos vai para o git.

Depois, opcionalmente:

- **Extensão do navegador** — carregue `extensao/` em `opera://extensions` (ou
  `chrome://extensions`) com o modo de programador ligado. Ela conta os não
  lidos de Gmail, Chat e WhatsApp Web pelo título da aba.
- **Hooks do Claude Code** — aponte `SessionStart`, `UserPromptSubmit`,
  `Notification`, `Stop` e `SessionEnd` para `hooks/avisar.sh`.
- **Serviço** — veja "Serviço" abaixo para rodar no login e reiniciar sozinho.
- **Mascotes** — a pasta `web/claude/` vem vazia de propósito; veja o
  `LEIA-ME.md` de lá.

### O painel de controle

Com o servidor de pé, <http://localhost:8766/controle> abre a tela que define
tudo: quais cartões aparecem, em que ordem, os tempos, as cores, a cidade do
clima e um recado. Responde 403 para quem vem pela rede — só o próprio Mac.

## Serviço

Roda como LaunchAgent do launchd: sobe no login, volta sozinho se cair, e **não
depende de terminal, de sessão do Claude Code, nem de nada**.

- No Mac: <http://localhost:8766>
- No tablet: <http://192.168.0.10:8766>

```bash
launchctl list | grep painel-tablet        # está de pé? (PID e último código de saída)
tail -f ~/Library/Logs/painel-tablet.log   # o que ele anda dizendo
launchctl kickstart -k gui/$UID/com.voce.painel-tablet   # reiniciar agora
```

Ligar e desligar o serviço:

```bash
launchctl unload ~/Library/LaunchAgents/com.voce.painel-tablet.plist   # desliga
launchctl load   ~/Library/LaunchAgents/com.voce.painel-tablet.plist   # liga
```

Para remover de vez: `unload` e apague o `.plist`. Não deixa rastro em mais nada.

Para mexer no código sem o serviço atrapalhar, derrube o agente e rode à mão:
`python3 server.py`.

### Por que o projeto não mora em ~/Documents

Porque o macOS protege `Documents`, `Desktop` e `Downloads` (TCC), e um agente do
launchd não tem permissão de ler lá dentro — ele morre com `Operation not
permitted` antes mesmo de abrir o arquivo. `~/Projects` não é protegida. Se um
dia mover isto de volta para Documents, o serviço para de subir.

### Por que a porta 8766

8080 é porta disputada: qualquer projeto quer ela, e este servidor precisa ficar
de pé o ano inteiro sem brigar. 8765 já é do um projeto anterior meu, então o painel ficou
no vizinho. Se a porta estiver ocupada, o servidor morre na hora com uma
mensagem clara em vez de virar zumbi.

## O aparelho (medido, não suposto)

| | |
|---|---|
| Modelo | Samsung SM-T560 (Galaxy Tab E 9.6, só Wi-Fi — **sem GPS**) |
| ROM | dotOS `DOT-N-v1.2-v4-20201005-gtelwifixx-UNOFFICIAL` |
| Android | 7.1.2 (API 25), `armeabi-v7a` |
| RAM | 1,48 GB |
| Tela | 1280x800 físicos, densidade 180 → **1138x711 CSS px** em paisagem |
| Navegador | **WebView 64** (`com.android.webview`, Chrome 64 de jan/2018) |
| IP | 192.168.0.20 (Mac: 192.168.0.10) |

O ponto que mais dita o código: **é o WebView do AOSP**, que a Play Store não
atualiza. Android 7.1 sugere um navegador de 2023; o que roda aqui é de 2018.

Consequências, todas já aplicadas em `web/style.css`:

- `gap` em flexbox não existe (Chrome 84+). Espaçamento de flex é margem.
- Em grid, o nome que ele entende é `grid-gap` (o `gap` virou alias no 66).
- Nada de `:has()`, container queries, `clamp()`, `aspect-ratio`, `backdrop-filter`.
- Animar só `transform` e `opacity` — a GPU Mali-400 não aguenta repaint grande.

Existe caminho para atualizar (instalar "Android System WebView" pela Play Store,
que está presente, e trocar o provedor nas Opções do desenvolvedor). Mas o código
é escrito para o Chrome 64 de propósito: assim funciona de qualquer jeito.

## adb

Já habilitado por Wi-Fi, sem cabo:

```bash
adb connect 192.168.0.20:5555
adb exec-out screencap -p > /tmp/tablet.png     # ver a tela
```

Travado em paisagem via `settings put system user_rotation 1`.

## Arquitetura

```
server.py     HTTP + SSE + laços de coleta; guarda o estado em memória
weather.py    Open-Meteo (sem chave, sem cadastro)
web/          página burra: sem framework, sem build
```

Sem framework não é preguiça: o painel fica aberto 24/7 em 1,5 GB de RAM.
Uma página que só troca `textContent` roda semanas; uma árvore de componentes
vaza memória e trava em dois dias.

O estado é um dicionário só. Cada chave vira um cartão; `None` significa "fase
ainda não construída", e a página desenha em cinza em vez de inventar um valor.
`publicar(**mudanca)` mescla e empurra para todo mundo conectado.

O batimento do SSE é um evento **nomeado** (`event: ping`), não um comentário.
Comentário mantém o TCP vivo mas é invisível para o JavaScript, e o tablet
precisa enxergar que o Mac respira para acender o aviso de desconectado.

## A extensão do navegador (`extensao/`)

Sensor que roda no Opera e conta não lidos de Gmail, Google Chat e WhatsApp Web.
Manda para `POST /ingest` com um token. Só lê — nunca clica, nunca marca como
lido, nunca abre nada.

**Instalar:** `opera://extensions` → ligar *Modo de programador* → *Carregar
extensão descompactada* → apontar para `~/Projects/tablet-dashboard/extensao`.
O token já vai embutido, não precisa configurar nada.

### Por que ela lê o título da aba, e não o DOM

Gmail, Chat e WhatsApp já publicam o número de não lidos no próprio título
(`Caixa de entrada (12) — …`, `(3) WhatsApp`). Um `/\((\d+)\)/` resolve os
três. Isso é estável há anos e sobrevive a redesenho de interface; seletor de
CSS não sobrevive, e quebra em silêncio.

O preço é que só dá o contador. Assunto e remetente — o que vai alimentar os
drawers — exigem raspar DOM de verdade, e isso fica numa fase separada, para
que quando quebrar (vai quebrar) os contadores continuem de pé.

### `aberto: false` não é `contador: 0`

A distinção mais importante do arquivo. Aba fechada significa que o sensor está
**cego**, não que a caixa está vazia. O painel mostra "aba fechada" em vermelho.
Exibir "0" nessa situação seria mentir com confiança — e é justamente quando
você confiaria e perderia alguma coisa.

Vale o mesmo para o Opera fechado: aí a extensão para de reportar, os números
congelam, e o cartão passa a dizer "sensor parado" depois de 5 minutos.

## Estado do Claude Code (`claude.py` + `hooks/`)

A verdade vem dos **hooks** do Claude Code, não de adivinhação. Cada evento vira
um `POST /claude` com o payload do hook inteiro; o servidor tira dali
`session_id`, `cwd` e `hook_event_name`.

| hook | vira |
|---|---|
| `SessionStart` | `parado` |
| `UserPromptSubmit` | `trabalhando` |
| `Notification` | `atencao` — pediu permissão ou resposta |
| `Stop` | `pronto` — devolveu a vez |
| `SessionEnd` | remove a sessão |

Instalados em `~/.claude/settings.json`, apontando para `hooks/avisar.sh`.
Para desligar, apague o bloco `hooks` de lá.

### Por que não usamos PreToolUse/PostToolUse

Disparam a cada chamada de ferramenta — dezenas por minuto — e não acrescentam
nada: entre o `UserPromptSubmit` e o `Stop` já se sabe que está trabalhando.
Seria pagar um processo por ferramenta para não descobrir nada novo.

### As duas regras do `avisar.sh`

1. **Sai 0 sempre.** Hook que falha pode travar o Claude Code.
2. **Não imprime nada no stdout.** No `UserPromptSubmit`, o que o script escreve
   no stdout **entra no contexto da conversa** — um respingo do curl viraria
   texto injetado no seu prompt. Daí o `>/dev/null 2>&1`.

### Os bichinhos (`web/claude/*.gif`)

Um GIF por estado, **servidos pelo Mac**, nunca do Tenor: o tablet tem
repositório de certificados de 2016 e falharia em HTTPS moderno sem avisar.
Local também é instantâneo e funciona sem internet.

Com 2 ou 3 sessões aparecem 2 ou 3 bichos lado a lado, cada um com o nome da
sessão embaixo. Três é o teto — além disso não cabe, e três já conta a história.

### Inventário

Arquivos nomeados pelo que **mostram**, não pelo estado. Assim trocar qual
bichinho representa qual estado é mudar uma linha no registro `GIFS` do
`app.js`, sem renomear arquivo.

| arquivo | o que mostra | estado |
|---|---|---|
| `picareta.gif` | bichinho cavando com picareta | Trabalhando |
| `fogos.gif` | bichinho em pé, fogos na cabeça | Concluído |
| `faiscas.gif` | bichinho parado, faíscas no focinho | Parado |
| `acenando.gif` | bichinho com os bracinhos pra cima, acenando | Precisa de você |
| `asterisco.gif` | o asterisco do Claude girando | descanso, depois de 60 s |
| `dormindo.svg` | Clawd deitado com Z — **estático** | nada acontecendo há 10 min |

O `fogos.gif` chegou como "chamando atenção", mas o que ele mostra é
comemoração: fogos na cabeça, patinhas pra cima. Num painel olhado de relance,
isso lido como "preciso de você" seria o oposto do que a imagem diz. Foi para o
Concluído, que era o estado sem GIF próprio.

O "Precisa de você" ficou órfão — nenhum dos quatro servia, e é o único estado
que exige ação sua. Resolveu com o `acenando.gif`, que você trouxe: o
bichinho de bracinhos pra cima. Acenar chama; o asterisco só girava.

Enquanto ele não chegou, geramos um substituto por código — e o gerador ficou:
`ferramentas/bichos.py` desenha o sprite (o mesmo, extraído dos GIFs originais)
e exporta GIF com a animação e a cor que quisermos. Não está em uso, mas
dissolve a dependência: estado novo não depende de existir um GIF pronto na
internet.

Estados sem GIF (mostram só a pílula): `desconhecido` e `ausente`. De propósito:
animar sem saber de nada seria o painel fingindo que está medindo.

O pipeline de tratamento (feito uma vez, não em tempo de execução):

1. **Redimensionar para 240 px.** Os originais eram ~500 px e apareceriam com
   ~150 px: o navegador reescalaria cada um dos 36 a 53 quadros, em looping.
2. **Fundo transparente por preenchimento a partir das bordas** — e não "todo
   pixel preto vira transparente", que furaria os contornos do personagem. Dois
   GIFs tinham fundo preto e dois branco; num cartão escuro os brancos eram
   insuportáveis.
3. **Recorte na união das caixas de todos os quadros** — recortar cada quadro na
   sua própria caixa faria o personagem pular de posição.
4. **Uma paleta única para a animação inteira.** Foi o bug mais chato: com
   paleta adaptativa por quadro, cada quadro escolhia cores próprias e o
   bichinho trocava de cor sozinho (o primeiro quadro saía verde, o resto
   salmão). Com paleta compartilhada a cor fica cravada.

Custo medido no aparelho, lendo `/proc/<pid>/stat`: a página sem GIF usa ~10% de
um núcleo; com GIF, ~13%. De quatro núcleos. Barato.

### Como medir custo no tablet sem se enganar

Errei três vezes antes de acertar, sempre pelo mesmo motivo: **medir a coisa
errada**. Fica aqui o método que funciona, porque a tentação de repetir os erros
é grande.

O que deu errado:

1. **Abas fantasma.** Cada `am start` com URL abre uma aba NOVA no navegador, e
   todas continuam animando em segundo plano. Depois de uma sessão de testes
   havia 7 abas; a medição somava todas. O sintoma que denunciou: *página em
   branco marcando 148%*.
2. **Tela apagada.** Tablet dormindo não desenha, e tudo mede 0%. Parece ótimo
   e não significa nada.
3. **Janela pegando o carregamento.** Medir logo depois de navegar mistura o
   custo de baixar, parsear e rasterizar a página com o custo de regime.
4. **`dumpsys cpuinfo`** devolve média de janela longa e não muda entre
   amostras — inútil para comparar.

O método que funciona:

- **Fully Kiosk**, que tem um WebView só e nenhuma aba para acumular.
- **Um carregamento só.** A página (`web/medir.html`) lê `web/modo.txt` a cada
  2 s e troca o conteúdo sozinha. Trocar o modo é escrever o arquivo no Mac —
  sem navegar, sem recarregar, sem tocar no aparelho.
- **Delta de `/proc/<pid>/stat`** (campos 14+15, em jiffies de 1/100 s), com 12 s
  de acomodação antes e janela de 25-30 s.
- **Duas passadas** de cada modo. Se não baterem, a medição está suja.

### O Clawd dormindo

Sem nada acontecendo há 10 minutos, o cartão troca a lista de sessões por um
Clawd dormindo. Listar sessões ociosas de madrugada é ruído; um bicho dormindo
diz a mesma coisa e diz melhor.

**Mas nunca dorme com algo esperando você.** Espera ignorada não vira sono — se
alguma sessão está em "precisa de você", o cartão continua chamando por mais
tempo que passe.

É **SVG estático**, não GIF animado, e de propósito: é o estado que fica horas
na tela (a madrugada inteira), e um ícone parado custa zero. Animar o que
ninguém está olhando é o único gasto que não se justifica.

Veio do icons8 (`icons8.com.br/icons/set/clawd`, que tem o Clawd em várias
poses). Dois cuidados na hora de instalar um ícone de lá:

- Os retângulos sem `fill` saem **pretos**. Os olhos ficam dentro do corpo
  salmão e ficam certos assim; os **Z ficam fora do corpo** e sumiriam no fundo
  escuro do painel. Precisam receber cor.
- Manter `width`/`height` no `<svg>`. Trocar por `100%` tira o tamanho
  intrínseco e o `<img>` renderiza uma caixa vazia.

### Por que o bichinho congela depois de 1 minuto

Medido no aparelho: **um GIF animado custa ~30% de um núcleo**; a página parada
custa ~1%. Com três sessões na tela, os bichinhos sozinhos comiam quase um
núcleo inteiro o dia todo — repetindo a mesma animação sem nada ter acontecido.

Passado um minuto no mesmo estado, o `<img>` troca do `.gif` para o `.png` do
primeiro quadro. O desenho continua na tela; o consumo cai para zero.

Efeito colateral bom: **movimento vira sinal.** Bichinho se mexendo passa a
significar "isto mudou agora", em vez de ser ruído de fundo permanente.

**Com uma exceção: o "Precisa de você" nunca congela.** Os outros três estados
você olha e segue a vida; esse espera uma ação sua, e parar de acenar enquanto
a espera continua seria desligar o alarme sem resolver nada. É o único gasto
permanente do painel (~33% de um núcleo) e só acontece quando de fato há algo
esperando por você.

O arquivo escolhido entra na assinatura que decide se o DOM é reconstruído,
então o congelamento dispara sozinho no minuto exato — sem um temporizador
dedicado só para isso.

### SVG ou GIF: medimos os dois

O bichinho é pixel art numa grade de 20x20 células; o corpo ocupa 13x8. Dá para
reconstruir em SVG com 12 retângulos, 1 KB contra os 444 KB dos quatro GIFs, e
com a cor trocando por CSS.

Medido no tamanho real do cartão (3 bichinhos a 6vw), com cada modo repetido
duas vezes — e as duplas bateram no dígito:

| | custo de um núcleo |
|---|---|
| página parada | 1,0% |
| GIF | **32,6%** · 32,6% |
| SVG animado suave | 117,1% · 116,8% |
| **SVG animado em passos** | **35,5%** · 35,5% |

Duas conclusões, e a segunda contradiz o que eu tinha escrito antes:

1. **Animação suave é o vilão, não o SVG.** Rodar na taxa da tela (60 fps)
   custa 3,6x mais que o GIF. Em `step-end` o valor salta em vez de
   interpolar, e o navegador repinta ~4x por segundo em vez de 60.
2. **Em passos, SVG e GIF empatam** (35,5% contra 32,6%). Não há penalidade
   real em usar vetor — desde que a animação seja quadro a quadro, que é o
   certo para pixel art de qualquer forma.

Também não houve diferença entre 6vw e 12vw: o custo não é de área, é de
quantos quadros por segundo o navegador precisa compor.

**Escolhemos GIF mesmo assim**, por encaixe e não por custo: o congelamento
depois de 60 s, o PNG do primeiro quadro e o slider já funcionam com GIF, e o
SVG exigiria reescrever tudo isso. A vantagem que o SVG teria — trocar de cor
por CSS — se resolve gerando o GIF já tingido.

O banco de teste (`web/bicho.html`, `web/medir.html`, `web/vitrine.html`) ficou
no repositório, e o SVG segue viável se um dia compensar.

### O nome que aparece embaixo

É o **título da sessão no Claude Code**, lido do registro `custom-title` da
transcrição ("Projeto para tablet antigo"). O nome da pasta é reserva, e para
pastas genéricas (`Projects`, `src`, `repositorios`) mostra o pai junto — sozinho
não informa nada.

### O ponto cego dos hooks: permissão aprovada

O `Notification` dispara quando o Claude pede uma permissão. Quando você
**aprova**, ele volta a trabalhar — e **nenhum hook dispara**: não houve prompt
novo, então nem `UserPromptSubmit` nem `Stop` acontecem. A sessão ficava presa
em "precisa de você" para sempre.

Aconteceu de verdade: uma sessão passou **meia hora** pedindo atenção no painel
enquanto o Claude trabalhava sozinho nela.

O conserto não precisou de hook por ferramenta (que custaria caro). O sinal que
separa os dois casos é a **transcrição**: ela cresce enquanto ele trabalha e
fica parada enquanto ele espera você. Um laço a cada 10 s faz um `stat` em cada
sessão marcada "atenção" e, se o arquivo foi escrito depois do evento, devolve
o estado para "trabalhando".

Barato (um `stat`), preciso (é exatamente a diferença entre os dois casos) e
sem tocar na configuração do Claude Code.

### A rede de segurança

Hook tem um buraco: sessão que morre feio (crash, `kill`, reboot) nunca manda
`SessionEnd` e ficaria eternamente "trabalhando" na tela. Um laço a cada 60 s
poda o que passou de 6 h sem evento, e zera tudo se não houver processo do
Claude Code vivo.

E registro vazio **não** vira "nenhuma sessão aberta" quando há processo
rodando: vira `desconhecido` ("começou antes dos hooks"). Não saber e não ter
são coisas diferentes — mesma regra do "SEM ABA".

## O cartão de mensagens é um slider

O cartão alterna sozinho a cada 8 s: primeiro Chat e WhatsApp, depois as contas
de e-mail — uma linha por conta, em grupos de 3 por slide (mais que isso não
cabe sem espremer a fonte).

Ver `trabalho 0 / pessoal 131 / antigo 9` separado vale muito mais que um
"140" somado que não diz de onde veio.

A rotação anda no tique de 1 s que já existe, não num timer próprio, e o DOM só
é reconstruído quando o conteúdo muda de verdade — refazer o `innerHTML` a cada
ciclo mataria a transição no meio. A transição usa só `opacity` e `transform`.

### O bug das abas duplicadas

A primeira versão somava uma aba por vez e dava 271 não lidos, porque havia duas
abas da mesma conta (131 contado em dobro). Agora a extensão agrupa por conta,
usando o número que o Google põe na própria URL (`/mail/u/0/`) como chave — é
estável, ao contrário do título. Entre duas abas da mesma conta fica a maior:
uma delas pode estar numa pasta sem não lidos e mostrar 0 no título.

## Saúde do Mac (`maquina.py`)

Cartão próprio, ao lado das mensagens: CPU, MEM e SWAP com barra. Serve para
perceber o aperto antes da bolinha girando. (A barra do topo ficou só com o
Wi-Fi e a bateria **do tablet**.)

O SWAP ficou mesmo não estando no mockup: CPU e memória altas são rotina no
macOS, swap cheio não é.

**O swap é o número que importa.** "Memória livre" engana no macOS: o sistema
usa quase tudo de propósito, então livre baixo é o normal. Já swap crescendo
significa que a máquina está paginando para o disco — a lentidão vem atrás.

"MEM" segue a conta do Monitor de Atividade (ativa + reservada + comprimida),
para bater com o número que você vê quando for investigar. "CPU" é a carga de
1 minuto dividida pelos núcleos.

Cores: laranja em CPU/MEM ≥ 85%, ou swap ≥ 2 GB. Vermelho em CPU ≥ 95%,
MEM ≥ 92%, ou menos de 1 GB de swap livre.

## O visual

Desenhado a partir de um mockup do Denis ("PIAIA OS"): preto puro, acento ciano,
monoespaçada nos rótulos pequenos, cartões com borda sutil. O próximo
compromisso vem em destaque à esquerda e os seguintes numa lista à direita.

Três decisões que divergem do mockup, todas por falta de dado real:

- **Sem etiquetas de categoria** (o mockup tinha TRABALHO, DOCS, SYNC). A agenda
  do Google não guarda categoria. Cheguei a extrair `[Handover]` do título como
  etiqueta, mas aquilo é parte do nome da reunião — remover empobrecia o título.
  O espaço virou a **duração** (30 MIN, 1H), que é real e ajuda a decidir se
  algo cabe antes da próxima reunião.
- **Wi-Fi e bateria são de verdade**, lidos do tablet por adb (`sistema.py`).
  O navegador não alcança nenhum dos dois.
- **Eventos de dia inteiro viram etiqueta ao lado da data**, não linha da
  agenda: continuam visíveis sem gastar espaço nobre.

**O destaque é sobre hoje.** Sem reunião hoje ele diz "Sem reuniões hoje", e o
que vem depois desce para a lista. Antes ele promovia o compromisso de amanhã
para o lugar de honra, o que respondia a pergunta errada: você olha ali para
saber se ainda tem algo hoje, e a resposta era "sim, amanhã".

Na lista, a hora vem prefixada com o dia ("amanhã 12:30"). Sem isso o painel
mostraria "12:30" às 23h e enganaria.

A agenda é **empilhada** (destaque em cima ocupando a largura, lista embaixo) e
não lado a lado: com a largura inteira cabem 6 compromissos em vez de 3, e os
títulos param de ser cortados.

O cartão do Claude Code já sabe desenhar os quatro estados — `trabalhando`
(asterisco girando), `atencao`, `pronto`, `parado`. Falta só a fase 3 preencher
`estado.claude`. Sem esse dado ele diz "EM BREVE" em vez de fingir "parado":
"nenhuma sessão rodando" e "não estou medindo" são coisas diferentes.

## GitHub (`github.py`)

O cartão do Claude Code gira entre três slides, e o **cabeçalho acompanha**:
"CLAUDE CODE" com o ícone `<>` nas sessões, "GITHUB" com a marca do octocat nos
pull requests. Cartão que mostra coisas diferentes com o mesmo título mente.

| slide | conteúdo | selo |
|---|---|---|
| Sessões | os bichinhos, um por sessão | `4 SESSÕES` |
| Meus PRs | seus PRs abertos, em todos os repos | `3 MEUS` |
| Design | PRs abertos em `sua-org/seu-repo` | `1 A REVISAR` |

Cada linha traz número, título, onde/quem, o estado da revisão e o do CI. O que
**exige ação sua vem primeiro**: revisão pedida a você, depois o não aprovado,
por último o que já passou — numa lista cortada em 5, a ordem decide o que você
enxerga.

### Os rótulos mudam de lado

O mesmo estado do GitHub quer dizer coisas **opostas** conforme o PR seja seu ou
de outra pessoa. `REVIEW_REQUIRED` no seu PR é "espere alguém"; no PR alheio é
"você precisa olhar". Por isso:

| estado | no seu PR | no PR de outro |
|---|---|---|
| `REVIEW_REQUIRED` | AGUARDANDO | **REVISAR** |
| `CHANGES_REQUESTED` | **AJUSTAR** | MUDANÇAS PEDIDAS |
| `APPROVED` | APROVADO | APROVADO |

A bolinha do rótulo fica **vermelha quando o CI cai**, mesmo em PR aprovado: é
o que impede o merge, independente da revisão. Um PR pode estar aprovado e
quebrado ao mesmo tempo, e é o quebrado que importa.

### O que o cartão do Claude mostra, e em que ordem

Três vagas, e elas vão para o que ainda pede algo de você:

1. **Precisa de você** — o único estado que exige ação
2. **Processando** — está rodando agora
3. **Concluído**, mas só nos **primeiros 2 minutos**

Depois de 2 minutos, uma sessão concluída sai do cartão e fica só na tela
cheia. Você quer ver que terminou; não quer que ela ocupe vaga para sempre
enquanto outra está rodando.

Cuidado ao mexer na ordenação: o peso do `atencao` é **zero**, e escrever
`PESO[estado] || 9` manda o estado mais urgente para o fim da fila — zero é
falsy em JavaScript. Já aconteceu aqui.

### A borda diz o estado antes de você ler

| estado | borda |
|---|---|
| Concluído | verde |
| Precisa de você | laranja |
| Processando | fio ciano correndo em volta |

O fio é traço de SVG com `stroke-dasharray` animado, **não `conic-gradient`** —
conic só existe do Chrome 69 em diante e o tablet está no 64. O `pathLength="100"`
normaliza o perímetro, então o traço mede 22% da volta seja qual for o tamanho
da caixa, e `vector-effect: non-scaling-stroke` mantém a espessura mesmo com o
viewBox esticado. Animado em `steps(50)`, ~18 repintes por segundo.

O fio usa o **mesmo ciano da pílula PROCESSANDO** que fica dentro do cartão:
borda e rótulo em cores diferentes para o mesmo estado confundem.

E cada cartão entra com atraso negativo diferente. Três fios no mesmo ponto da
volta pareciam defeito de renderização, não três coisas acontecendo.

### Quase nada congela mais

O congelamento de 60 s foi ficando sem alcance conforme o painel amadureceu:
`trabalhando` e `atencao` foram isentados (atividade em curso ou espera por
você não podem parar de se mexer), e `pronto` some do cartão depois de 2 min.
Sobrou o `parado`, que é raro.

Na prática o custo dos mascotes voltou a ser permanente. Medido: **44-46% de um
núcleo** com duas sessões ativas animando, de quatro núcleos. É aceitável, e
some quando não há sessão ativa — mas não é mais o "quase zero" que o
congelamento tinha alcançado.

### O rodapé de excedente

O cartão mostra 3 itens (sessões ou PRs) e o rodapé diz quantos ficaram de
fora: *"Mais 1 projeto em andamento. Toque para ver detalhes"*. Sem ele você
olharia três e acharia que são todos — e é justamente quando a lista cresce
que o painel mais precisa ser honesto.

Os textos do GitHub e da agenda foram aumentados ~15% para leitura de longe.
O preço é que os títulos de PR cortam mais cedo no cartão; a tela cheia tem a
largura para mostrá-los inteiros.

### O anel âmbar

Só em PR que **depende de você**: de outra pessoa e ainda sem aprovação. No seu
próprio PR o anel seria ansiedade, não informação — você já sabe que ele existe.

Aprovado e com CI verde fica a meia opacidade: resolvido sai da frente.

### O ícone de CI rodando gira em passos

`steps(8)` e não rotação contínua: são 8 raios, então girar de oitavo em oitavo
dá o mesmo efeito com ~7 repintes por segundo em vez de 60. A área é pequena
(~14 px), então deve ser barato — mas isto **não foi medido em isolamento**,
porque exige um CI em andamento na hora certa.

### Por que pelo `gh` e não pela API

O `gh` já está autenticado na máquina, com o token no chaveiro do macOS.
Nenhuma credencial nova para guardar no `config.json`, nada para expirar.
Testado com `env -i` para garantir que o LaunchAgent (que roda com ambiente
mínimo) consegue ler o chaveiro — conseguia.

Uma consulta GraphQL só traz as três listas; três buscas separadas seriam três
idas à rede. Intervalo de 5 minutos: PR não muda de minuto em minuto.

### O índice de busca do GitHub pisca

`is:pr is:open author:@me` é **eventualmente consistente**: já devolveu 1 PR num
instante e 3 no seguinte, com os mesmos PRs abertos (conferido repo a repo com
`gh pr list`). Não é bug nosso e se corrige no ciclo seguinte. Se um dia a lista
parecer curta, espere 5 minutos antes de investigar.

## As telas de detalhe

Tocar num cartão abre uma tela cheia, só leitura. Toque em qualquer lugar volta,
e ela **volta sozinha depois de 45 s** — senão o painel ficaria preso numa tela
de clima o resto do dia se você tocasse e saísse de perto.

| cartão | o que abre |
|---|---|
| Clima | 7 dias: máx/mín, condição, chuva, nascer e pôr do sol |
| Agenda | a semana em 7 colunas, incluindo os dias livres |
| Claude Code | **tela dividida**: todas as sessões à esquerda, GitHub à direita |

A tela dividida junta o que no painel são três slides girando: à esquerda todas
as sessões (o cartão mostra no máximo 3), à direita **os dois** grupos de PR de
uma vez — os seus e os do repositório de design. No painel eles se revezam por
falta de espaço; na tela cheia cabem juntos, e ver os dois lado a lado é o
ponto de abrir.

Os bichinhos aqui são o **do estado**, não o asterisco de descanso: esta tela
existe para você ver quem está em quê. Em PNG, parados — são várias sessões de
uma vez e animar todas custaria caro à toa.

Três detalhes de implementação que não são óbvios:

- Ao abrir, o painel recebe `display:none`. Cobrir não basta: os GIFs
  continuariam decodificando atrás da tela.
- Os dados da semana já vêm no estado, então a tela abre instantânea, sem ida
  ao servidor no toque.
- A agenda desenha as 7 colunas sempre, mesmo as vazias. Dia livre é
  informação, e coluna que some faria a semana mudar de forma todo dia.

### O cache do Fully Kiosk

O WebView 64 com o cache do Fully Kiosk por cima **ignora o `Cache-Control`**.
O sintoma foi cruel de diagnosticar: o `index.html` velho ficava em cache e
apontava para o `app.js?v=` antigo, então o tablet rodava código de meia hora
atrás enquanto o navegador do Mac mostrava a versão nova — e eu culpei o código
duas vezes antes de desconfiar do cache.

Por isso o servidor manda `Cache-Control`, `Pragma` e `Expires` juntos. Se
voltar a acontecer, desligue também *Web Content Settings → Enable Caching* no
Fully Kiosk.

## O painel de controle (`/controle`)

Abra <http://localhost:8766/controle> **no Mac**. Tudo que ele muda grava no
`config.json` e viaja pelo mesmo SSE que já leva clima e agenda — o tablet
aplica **na hora**, sem recarregar e sem ninguém tocar nele.

| seção | o que faz |
|---|---|
| Diagnóstico | responde "está tudo funcionando?" — extensão, adb, gh, telas conectadas |
| Cartões | liga e desliga cada um |
| Ordem | sobe e desce cartões dentro da coluna |
| Tempos | os 8 valores que antes eram constantes no `app.js` |
| Cores | os 12 tokens da paleta |
| Recado | um texto seu que vira cartão na tela |

### Só do próprio Mac

`/controle`, `/ajustes`, `/diagnostico` e `/acao` respondem **403 para quem vem
pela rede**. Ler o painel é aberto (o tablet precisa), e isso é aceitável; uma
tela que *muda* as coisas não pode ficar exposta no Wi-Fi.

### Por que trocar cor é uma linha

A folha de estilo inteira usa variáveis (`--ciano`, `--laranja`...). O painel
sobrescreve a variável em `document.documentElement`, e tudo que depende dela
muda junto — logo, ícones, barras, bordas. Nenhum seletor precisa saber disso.

### Dois tropeços que valem lembrar

- **`hidden` não esconde quando o CSS define `display`.** `.cartao` é flex, e o
  flex do autor ganha do `display:none` da folha do navegador. Precisou de
  `[hidden]{display:none!important}`.
- **A ordem é calculada por container, não globalmente.** Uma lista única
  embaralhava tudo: a agenda e a dupla (mensagens+monitor) são irmãs, mas só a
  agenda é cartão — a dupla ficava com `order: 0` e subia por cima. Agora cada
  container ordena os próprios filhos, e um container herda a posição do
  primeiro cartão dentro dele.

**Limite conhecido:** dá para reordenar *dentro* de cada coluna, não entre
colunas, e ainda não dá para redimensionar. Isso é o item "layout" completo, e
é um trabalho à parte.

## Segurança: o painel é aberto na rede local

O servidor escuta em `0.0.0.0` porque o tablet precisa alcançá-lo. Consequência:
**qualquer aparelho no mesmo Wi-Fi consegue ler `/api/estado`** — títulos de
reunião, contadores, clima. Não tem senha na leitura.

O token protege só a **escrita** (`/ingest`), para que ninguém injete dado falso
no seu painel.

Isso é aceitável numa rede doméstica e foi uma escolha, não um descuido. Se um
dia isto for para um Wi-Fi compartilhado, o certo é exigir o token também na
leitura ou prender o servidor a uma interface específica.

## Fases

- [x] **1** — servidor, SSE, página, hora, data, clima
- [x] **2** — agenda do dia (via adb, do CalendarProvider do Android)
- [x] **4** — contadores de Gmail, Chat e WhatsApp (via extensão do Opera)
- [x] **3** — estado do Claude Code (via hooks)
- [ ] **6** — drawers: tocar num cartão abre o detalhe (só leitura)
- [ ] **5** — a carinha em vídeo, polimento

### Sobre o acesso ao Google

O Google Cloud Console é bloqueado pela conta de trabalho, então a via
oficial (Gmail API + Calendar API + Chat API) está fechada. Nenhuma das soluções
adotadas precisa dela:

- **Agenda** — `agenda.py` lê o CalendarProvider do próprio tablet por adb. A
  conta já está logada no Android e o Google já sincronizou tudo. Dado
  estruturado, de um contrato do Android estável há uma década.
- **Gmail / Chat / WhatsApp** — a extensão do Opera, pelo título da aba.

Vale notar que a via oficial seria **pior** mesmo se estivesse aberta: um app
OAuth em modo "Testing" tem o refresh token expirando a cada 7 dias com escopos
sensíveis, o que obrigaria a reautenticar toda semana.

### Fase 3, quando chegar

`~/outro-projeto/cards.py` já tem `claude_sessions()` e `session_state()`
funcionando — vale reaproveitar. Mas ali o estado é **deduzido** lendo o fim da
transcrição; com hooks (`Notification`, `Stop`, `PreToolUse`) o Claude Code
avisa o estado exato no momento exato. A heurística vira rede de segurança.
