# Orientações para o Claude Code neste repositório

Um painel que roda no computador da pessoa e aparece numa tela na mesa:
relógio, agenda, clima, contadores de mensagem, estado das sessões do Claude
Code, pull requests do GitHub, saúde da máquina e o que está tocando.

**Feito e testado em macOS.** Em Linux e Windows o núcleo deve funcionar e dois
cartões não — o passo 2 abaixo tem a tabela exata. Não esconda isso de quem
está instalando.

O `README.md` é a porta de entrada de quem chega. O `DECISOES.md` conta *por
que* cada peça é como é — **leia antes de mudar comportamento**: quase toda
escolha estranha no código tem um parágrafo lá explicando que não foi acaso.

---

## Se a pessoa acabou de clonar, conduza a instalação

Ela provavelmente não leu nada e não sabe o que precisa decidir. Seu trabalho
aqui não é executar comandos: é **conduzir**. Pergunte uma coisa de cada vez,
execute o passo, confirme que funcionou, e só então siga.

Parta do princípio de que ela pode nunca ter aberto um terminal. Quando pedir
para rodar algo, diga **onde** e **o que vai acontecer**. Quando um comando
falhar, leia a mensagem e traduza — não devolva o erro cru.

### Passo 0. Quanto ela quer, de verdade

**Pergunte isto antes de qualquer coisa.** As três respostas dão trabalhos
muito diferentes, e a maioria das pessoas quer a primeira:

1. **"Só quero o painel na tela."** Relógio, clima, recado e o que vier do
   GitHub. Não precisa de tablet configurado, nem de extensão, nem de adb —
   precisa do servidor de pé e de um navegador apontado para o endereço.
   São dez minutos. Faça só os passos 4, 9, 10 e 11.
2. **"Quero a agenda e as mensagens também."** Aí entram a extensão do
   navegador (passo 7) e, se o aparelho for Android e ela quiser a agenda de
   dentro dele, o adb (passo 3). Some também os passos 5 e 6.
3. **"Quero mexer no código."** Aí o `DECISOES.md` importa mais que este
   roteiro.

Não venda o caminho 3 para quem pediu o 1.

### Passo 1. O que ela precisa ter

Confira antes de começar, e seja honesto sobre o que é obrigatório:

| | Precisa? | Por quê |
|---|---|---|
| **Claude Code** | sim | O projeto inteiro foi feito com ele e é para continuar assim. É o que lê este arquivo e a mão que mexe no código. Sem ele a pessoa fica com um painel que funciona e que ela não consegue mudar. |
| **Python 3.8+** | sim | O servidor. Só biblioteca padrão — nada de instalar pacote. |
| **Um navegador Chromium** | só nos caminhos 2 e 3 | Chrome, Edge, Brave, Opera, Vivaldi, Arc ou o Chromium puro. Precisa aceitar extensão em modo desenvolvedor. **Safari e Firefox não servem**: a extensão é Manifest V3 com as APIs `chrome.*`. |
| **Uma tela** | sim, mas qualquer uma | Ver o passo 3. |
| **`gh` (GitHub CLI)** | opcional | Só para os cartões de pull request. Sem ele, desligue os cartões no painel de controle em vez de instalar por instalar. |
| **`adb`** | só Android com agenda | Ver o passo 3. |

### Passo 2. Em que sistema ela está

**Este projeto foi feito e testado em macOS.** Diga isso com todas as letras —
e diga também o que muda, que é menos do que parece:

| | macOS | Linux | Windows |
|---|---|---|---|
| Servidor, clima, GitHub, agenda por adb, extensão, música | funciona | deve funcionar (stdlib + `gh` + `adb`) | deve funcionar |
| Cartão "Monitor do Mac" | funciona | **não**: usa `vm_stat` e `sysctl`; no Linux seria `/proc/meminfo` | **não** |
| Cartão "Monitor do Claude" | funciona | **não sei**: lê `~/Library/Application Support/Claude/`; onde o app guarda isso em outro sistema é coisa a descobrir | **não sei** |
| Hooks (`hooks/avisar.sh`) | funciona | funciona (é `/bin/sh`) | precisa de WSL ou Git Bash |
| Serviço que sobe sozinho | `launchd` | `systemd --user` | Agendador de Tarefas |

Se ela **não** estiver no macOS: não finja que está tudo pronto. Ajude a
levantar o que funciona, desligue no painel de controle os cartões que não
funcionam, e **convide a contribuir** — portar o `maquina.py` para Linux é uma
tarefa pequena e bem delimitada, e ela seria a primeira pessoa a fazer. Ofereça
ajudar a abrir o pull request.

### Passo 3. Em que aparelho o painel vai aparecer

Pergunte, e depois pergunte o **modelo**. Não é curiosidade: o modelo decide se
vai precisar de adb e de cabo.

| | Android | iPad / iPhone | Um navegador qualquer |
|---|---|---|---|
| Agenda | do próprio aparelho, via `adb` | precisa de outra fonte (passo 5) | outra fonte |
| Bateria e Wi-Fi na barra | sim | não existem; o cartão some sozinho | não |
| Modo quiosque | Fully Kiosk Browser | "Adicionar à Tela de Início" + Acesso Guiado | tela cheia |
| Recarregar de longe | botão no painel de controle | não precisa: a página se recarrega sozinha | idem |

**Se for Android e ela quiser a agenda do aparelho**, aí sim precisa de adb:

1. Peça o modelo e a versão do Android.
2. Peça para ela **ligar o cabo USB** no computador — a primeira autorização do
   adb só acontece por cabo.
3. Ative Opções do desenvolvedor (tocar sete vezes em "Número da versão", em
   Sobre o tablet) e depois Depuração USB.
4. `adb devices` — vai aparecer um aviso **no tablet** pedindo autorização.
   Avise antes, senão ela fica olhando o terminal parado.
5. Só então `adb tcpip 5555` e `adb connect <ip>:5555`, e o cabo pode sair.

**Se ela não quiser nada disso**, o tablet é o requisito mais leve do projeto:
abrir o endereço no navegador dele e pronto. Ofereça esse caminho primeiro.

O CSS serve a todos sem mudança: foi escrito para o WebView 64 de um Galaxy
Tab E de 2014, e qualquer navegador mais novo é um superconjunto disso.

### Passo 4. Gere a configuração

```
python3 ferramentas/instalar.py
```

Cria o `config.json`, sorteia um token e o escreve nos três lugares que
precisam dele: o servidor, a extensão e o hook. **Esses três arquivos nunca vão
para o git** — estão no `.gitignore` porque carregam o token.

Ele pergunta a **porta**, a cidade do clima e, se houver, o repositório que ela
quer vigiar. O painel de controle valida o repositório e avisa na hora se a
conta não tem acesso.

**Sobre a porta, explique em vez de deixar ela adivinhar.** O instalador testa
a 8766 e, se estiver ocupada, sugere a próxima livre — na prática é Enter. Mas
duas coisas você precisa dizer:

- a porta mora em **três** arquivos (`config.json`, `extensao/config.js`,
  `hooks/avisar.sh`). Trocar só no primeiro faz o painel subir na porta nova e
  a extensão e os hooks continuarem falando com a antiga, **sem erro nenhum** —
  só coisas que param de aparecer. Para trocar, é rodar o instalador de novo.
- o endereço no aparelho também tem a porta dentro.

Se ela perguntar "qual porta é melhor?": a resposta é qualquer uma livre acima
de 1024. A 8766 não tem nada de especial além de não ser a 8080, que todo
projeto de desenvolvimento disputa.

### Passo 5. De onde vem a agenda

No caminho Android com adb já está resolvido. Nos outros, escolha com ela:

- **Calendar do macOS** — ela adiciona a conta em Ajustes do Sistema → Contas
  de Internet, e o servidor lê de `~/Library/Calendars`. Funciona com o
  aparelho desligado e sem navegador aberto. Peça para ela confirmar que
  aparecem eventos ali antes de escrever código.
- **Pela extensão** — a aba do Google Agenda aberta alimenta o painel. Sem
  configuração extra, mas depende da aba ficar aberta.
- **URL iCal secreta** — Google Agenda → configurações do calendário. Muitas
  contas corporativas bloqueiam; verifique antes de prometer.

### Passo 6. Hooks do Claude Code

Em `~/.claude/settings.json`, apontando para o `hooks/avisar.sh` gerado, nos
eventos `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop` e
`SessionEnd`. **Não use `PreToolUse`/`PostToolUse`** — disparam dezenas de
vezes por minuto e o painel não fica melhor por isso.

### Passo 7. A extensão do navegador

Ela alimenta os contadores de mensagem, o que está tocando e (se for o caso) a
agenda. Carregue `extensao/` **sem empacotar**, em modo desenvolvedor:

| Navegador | Endereço |
|---|---|
| Chrome | `chrome://extensions` |
| Edge | `edge://extensions` |
| Brave | `brave://extensions` |
| Opera | `opera://extensions` |
| Vivaldi | `vivaldi://extensions` |
| Arc / Chromium | `chrome://extensions` |

Ligue "Modo do desenvolvedor" e use "Carregar sem compactação" apontando para a
pasta `extensao/`.

**Duas coisas que sempre pegam quem instala:**

1. Arquivo novo na extensão só vale **depois de recarregá-la**. Toda vez que o
   código dela mudar, é um clique em recarregar.
2. Um *content script* só entra em aba **carregada depois** da extensão. A
   extensão injeta sozinha nas abas já abertas, mas se algo não aparecer, o
   primeiro teste é recarregar a aba.

### Passo 8. Octocats — já vêm no repositório

**Não mande a pessoa baixar nada aqui.** As imagens do Octodex vêm junto com o
clone, para o painel funcionar inteiro no primeiro arranque. Os scripts
`ferramentas/baixar_octodex.py` e `ferramentas/limpar_octodex.py` existem para
buscar de novo ou acrescentar, não para a instalação.

O que você precisa saber, e dizer se ela publicar a versão dela:

- Essas imagens **não estão sob a MIT** deste repositório. A `LICENSE` diz
  explicitamente que cobre o código, e o `TERCEIROS.md` lista cada pasta com os
  termos de origem. Isso é a razão de a licença ser escopada — não mexa nesse
  arranjo sem ler o `TERCEIROS.md` inteiro.
- Metade delas foi tratada para tirar o fundo branco, que numa cena de tela
  cheia virava um selo retangular colado por cima. O corte é por preenchimento
  a partir da borda, não por cor: nessas imagens o branco é de 40 a 75% do
  total, porque também é a armadura do stormtrooper e a camisa do Link.

### Passo 9. Deixar o painel de pé sozinho

```
python3 ferramentas/servico.py
```

No macOS ele escreve o LaunchAgent e carrega. Em Linux e Windows ele **não
instala nada** — imprime o arquivo que faltaria (unit do systemd, tarefa do
Agendador) para a pessoa colar, e diz que aquilo não foi testado por ninguém
ainda. Se ela fizer funcionar, é a melhor primeira contribuição possível.

Para desenvolver, derrube o serviço e rode à mão: `python3 server.py`.

### Passo 10. Abrir no aparelho e trancar

Android: Fully Kiosk apontando para `http://<ip-do-computador>:8766`.
iOS: Safari no mesmo endereço → Compartilhar → Adicionar à Tela de Início →
abrir pelo ícone → Acesso Guiado (triplo clique no botão lateral).
Em ambos, desligue o bloqueio automático de tela.

### Passo 11. Conferir de verdade

`http://127.0.0.1:8766/controle` tem um diagnóstico linha a linha: telas
conectadas, extensão, adb, agenda, GitHub, clima e Claude Code. **Feche a
instalação por ele, não por "parece que está funcionando".** Cada linha
vermelha ali tem uma frase dizendo o que fazer.

---

## Regras que não se negociam

**Nunca mostre número quando o sistema está cego.** Aba fechada é `SEM ABA`,
não `0`. Sensor mudo é `SEM LEITURA`, não o último valor. Um zero falso faz a
pessoa confiar e ser traída; um aviso feio faz ela olhar. Isto vale para todo
cartão novo.

**Nunca comite `config.json`, `extensao/config.js` nem `hooks/avisar.sh`.**
Carregam o token do painel.

**As rotas de controle só respondem de 127.0.0.1.** `/controle`, `/ajustes`,
`/acao`, `/fundo`, `/uso` e `/diagnostico` verificam a origem. O resto é
aberto na rede local de propósito — o painel é uma tela, não um cofre.

**Duas exceções, e as duas são estreitas de propósito.** `POST /tema` e
`POST /musica` respondem pela rede porque os botões deles estão no TABLET, e o
tablet chega pelo Wi-Fi: sem exceção não haveria nem seletor de tema nem
tocador. O que as torna aceitáveis é o tamanho.

Nenhuma das duas aceita um corpo de ajustes. `/tema` aceita UM slug, confere
contra a lista fechada de `temas.py` e grava duas chaves (`tema` e `cores`).
`/musica` aceita UM nome de uma lista de três, não grava nada em disco e só
deixa o comando numa caixa de uma posição, com prazo de 12 segundos, até a
extensão vir buscar. Chaves extras no corpo são ignoradas, não mescladas.

O pior que alguém na rede de casa consegue é deixar o painel verde e pular a
sua música. **Se um dia outra rota precisar sair do Mac, o teste é este: ela
cabe numa frase que descreva o pior caso sem dar medo?**

**Meça o custo no aparelho, não suponha.** O `DECISOES.md` tem a metodologia e o
resultado de três medições que contrariaram a intuição. Numa GPU velha, a taxa
de quadros pesa mais que a técnica.

**CSS: o teto é o navegador do aparelho mais velho que vai exibir.** Para o Tab
E é o Chrome 64: sem `gap` em flex, sem `:has()`, sem `clamp()`, sem
`aspect-ratio`, sem `backdrop-filter`. Anime só `transform` e `opacity`.

---

## Onde as coisas estão

| | |
|---|---|
| `server.py` | HTTP, SSE, laços de coleta, painel de controle |
| `agenda.py` `weather.py` `github.py` `maquina.py` `sistema.py` | as fontes |
| `claude.py` | máquina de estados das sessões, alimentada pelos hooks |
| `web/` | a tela (`index.html`, `app.js`, `style.css`, `temas.css`) |
| `web/controle.html` `controle.js` | o painel de controle |
| `extensao/` | a extensão do navegador |
| `ferramentas/instalar.py` | gera config, token, hooks e config da extensão |

## Armadilhas que já custaram tempo

- **O log do servidor é lido com `flush`** desde que um log bufferizado levou a
  duas conclusões erradas seguidas sobre cache. Se estiver depurando o que o
  aparelho pede, `tail -f ~/Library/Logs/painel-tablet.log` mostra o IP de cada
  requisição.
- **A atividade do Fully Kiosk é `.FullyActivity`.** Com `.MainActivity` o
  `am start` falha e o código relata sucesso.
- **O WebView do quiosque ignora `Cache-Control`.** `location.reload()` relê do
  próprio cache; recarregar exige uma URL que ele nunca viu (`?r=<agora>`).
- **O projeto não mora em `~/Documents`.** O TCC do macOS bloqueia o acesso de
  um LaunchAgent àquela pasta, e o serviço morre sem explicar.
- **A porta é 8766**, não 8080: 8080 colide com servidores de desenvolvimento.
