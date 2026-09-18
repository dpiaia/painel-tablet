# Orientações para o Claude Code neste repositório

Um painel que roda no Mac e aparece num tablet na mesa: relógio, agenda,
clima, contadores de mensagem, estado das sessões do Claude Code, pull
requests do GitHub e saúde do Mac. O `README.md` conta *por que* cada peça é
como é — leia antes de mudar comportamento.

---

## Se a pessoa acabou de clonar, conduza a instalação

Ela provavelmente não leu o README e não sabe o que precisa decidir. **Pergunte
em vez de chutar** — três respostas mudam o que vai ser instalado. Faça uma
pergunta de cada vez e execute o passo antes de ir para a próxima.

### 1. Em que aparelho o painel vai aparecer?

Isto decide duas coisas, então pergunte primeiro.

| | Android com adb | iPad / iPhone |
|---|---|---|
| Agenda | do próprio aparelho, pelo `CalendarProvider` | precisa de outra fonte (passo 4) |
| Bateria e Wi-Fi | aparecem na barra do topo | não existem; o cartão some sozinho |
| Modo quiosque | Fully Kiosk Browser | "Adicionar à Tela de Início" + Acesso Guiado |
| Recarregar remoto | botão do painel de controle, via adb | não precisa: a página se recarrega sozinha |

O CSS serve aos dois sem mudança. Ele foi escrito para o WebView 64 de um
Galaxy Tab E de 2014 — qualquer Safari ou Chrome mais novo é um superconjunto
disso.

### 2. As dependências estão no lugar?

```
python3 --version          # 3.8+; o servidor é só biblioteca padrão
gh auth status             # para os pull requests
adb devices                # só no caminho Android
```

Se a pessoa não usa GitHub ou não quer o cartão, o `gh` é opcional — desligue
o cartão no painel de controle em vez de instalar por instalar.

### 3. Gere a configuração

```
python3 ferramentas/instalar.py
```

Ele cria `config.json`, sorteia o token e escreve `extensao/config.js` e
`hooks/avisar.sh` já preenchidos. **Esses três arquivos nunca vão para o git** —
estão no `.gitignore` porque carregam o token.

Pergunte a cidade do clima e, se houver, a URL do repositório que ela quer
vigiar para revisão. O painel de controle valida a URL e avisa na hora se a
conta não tem acesso.

### 4. De onde vem a agenda

No caminho Android já está resolvido. **No iPad, escolha com a pessoa:**

- **Calendar do macOS** — ela adiciona a conta em Ajustes do Sistema → Contas
  de Internet, e o servidor lê de `~/Library/Calendars`. Funciona com o
  aparelho desligado e sem navegador aberto. Peça para ela confirmar que
  aparecem eventos ali antes de escrever código.
- **Pela extensão** — a aba do Google Agenda aberta alimenta o painel. Sem
  configuração extra, mas depende da aba.
- **URL iCal secreta** — Google Agenda → configurações do calendário. Muitas
  contas corporativas bloqueiam; verifique antes de prometer.

### 5. Hooks do Claude Code

Em `~/.claude/settings.json`, apontando para o `hooks/avisar.sh` gerado, nos
eventos `SessionStart`, `UserPromptSubmit`, `Notification`, `Stop` e
`SessionEnd`. **Não use `PreToolUse`/`PostToolUse`** — disparam dezenas de
vezes por minuto e o painel não fica melhor por isso.

### 6. A extensão do navegador

Carregue `extensao/` sem empacotar, em qualquer navegador Chromium (Chrome,
Opera, Edge, Brave). Ela lê o **título** das abas de Gmail, Chat e WhatsApp e
nunca clica em nada.

### 6b. Octocats (opcional, e com uma regra de licença)

```
python3 ferramentas/baixar_octodex.py
```

Baixa os octocats do Octodex para `web/octodex/`, que o painel usa no cartão
do GitHub vazio e nas cenas de pull request.

**Nunca commite essa pasta.** As imagens são obra da GitHub. O FAQ deles
permite usá-las para *se referir à GitHub* — que é exatamente o que o painel
faz — mas elas continuam sendo "official GitHub artwork under GitHub's
trademark license". Trazê-las para dentro de um repositório MIT seria
republicar arte de terceiros sob uma licença que não é nossa para dar. Por
isso o repositório traz o script e cada um busca na fonte.

Metade delas vem com fundo branco, que numa cena de tela cheia aparece como
um selo retangular colado por cima. `ferramentas/limpar_octodex.py` tira — por
preenchimento a partir da borda, não por cor: nessas imagens o branco é de 40 a
75% do total, porque também é a armadura do stormtrooper e a camisa do Link.

Sem a pasta nada quebra: o painel volta ao mascote próprio.

### 7. O serviço

Um LaunchAgent com `KeepAlive`, para o painel subir sozinho e sobreviver a
reinício. O README tem o plist.

### 8. Abrir no aparelho e trancar

Android: Fully Kiosk apontando para `http://<ip-do-mac>:8766`.
iOS: Safari no mesmo endereço → Compartilhar → Adicionar à Tela de Início →
abrir pelo ícone → Acesso Guiado (triplo clique no botão home). Em ambos,
desligue o bloqueio automático de tela.

### 9. Conferir

`http://127.0.0.1:8766/controle` tem um diagnóstico linha a linha: telas
conectadas, extensão, adb, agenda, GitHub, clima e Claude Code. Use ele para
fechar a instalação, não "parece que está funcionando".

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

**A única exceção é `POST /tema`, e ela é estreita de propósito.** O seletor de
tema mora na tela de créditos do tablet, e o tablet chega pelo Wi-Fi: sem
exceção não haveria seletor. O que a torna aceitável é o tamanho. A rota não
aceita um corpo de ajustes — aceita UM slug, confere contra a lista fechada de
`temas.py` e grava duas chaves (`tema` e `cores`). Chaves extras no corpo são
ignoradas, não mescladas. O pior que alguém na rede de casa consegue é deixar
o painel verde. Se um dia outra rota precisar sair do Mac, o teste é este: ela
cabe numa frase que descreva o pior caso sem dar medo?

**Meça o custo no aparelho, não suponha.** O README tem a metodologia e o
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
