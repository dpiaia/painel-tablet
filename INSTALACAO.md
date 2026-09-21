# Instalação, passo a passo

Este é o roteiro escrito por extenso. Se você tem o Claude Code aberto neste
projeto, pode simplesmente dizer **"acabei de clonar, me ajuda a instalar"** —
ele segue o mesmo roteiro e faz as perguntas na ordem certa.

Não presumimos que você já tenha mexido em terminal. Onde for preciso, está
dito onde clicar.

---

## Antes: decida quanto você quer

A instalação completa tem oito passos. **A maioria das pessoas quer os quatro
primeiros.** Escolha o seu caminho:

- **"Só quero ver o painel numa tela."** Passos 1 a 4. Uns dez minutos.
- **"Quero agenda, mensagens e música também."** Some os passos 5 e 6.
- **"Quero que suba sozinho quando eu ligar o computador."** Passo 7.
- **"Quero mexer no código."** Leia o [DECISOES.md](DECISOES.md) depois.

Você pode parar em qualquer ponto e voltar depois. Nada quebra pela metade: o
painel mostra o que sabe e diz claramente o que não está vendo.

---

## Passo 1 — Abra o terminal

O terminal é uma janela onde você digita comandos. Não tem mistério: você vai
colar linhas prontas e apertar Enter.

- **macOS** — aperte `Cmd + Espaço`, digite `Terminal`, Enter.
- **Linux** — `Ctrl + Alt + T` na maioria das distribuições.
- **Windows** — tecla Windows, digite `PowerShell`, Enter.

Agora confira se o Python está aí. Cole isto e aperte Enter:

```bash
python3 --version
```

Você deve ver algo como `Python 3.11.5`. **Qualquer coisa a partir de 3.8
serve.**

- Se disser "command not found" ou "não é reconhecido": instale o Python em
  <https://python.org/downloads> e feche e abra o terminal de novo.
- No Windows, pode ser que o comando seja `python` em vez de `python3`.

---

## Passo 2 — Traga o projeto para o seu computador

```bash
cd ~
git clone https://github.com/dpiaia/painel-tablet.git
cd painel-tablet
```

**No macOS, não coloque o projeto em `Documents`, `Desktop` ou `Downloads`.** O
sistema protege essas três pastas, e mais tarde o serviço não vai conseguir ler
nada lá dentro — ele morre com "Operation not permitted" e a mensagem não
explica o motivo. `~/painel-tablet` ou `~/Projects/painel-tablet` estão bem.

Se `git` não existir no seu computador, baixe o projeto como ZIP pelo botão
verde do GitHub e descompacte.

---

## Passo 3 — Gere a sua configuração

```bash
python3 ferramentas/instalar.py
```

Ele vai perguntar algumas coisas — a porta, a cidade do clima, o repositório do
GitHub que você quer vigiar. **Pode apertar Enter em todas** e mudar depois,
pela tela de controle.

### Sobre a porta, que é a única pergunta que pode dar trabalho

Seu computador tem **um** endereço na rede, mas pode ter vários programas
atendendo nele. A porta é o número que diz qual deles responde — como o número
do apartamento num prédio com um endereço só. O painel usa a **8766**.

Por que não a 8080, que é a mais conhecida: justamente por ser a mais
conhecida. Qualquer projeto de desenvolvimento quer a 8080, e este servidor
precisa ficar de pé o ano inteiro sem brigar com nada.

**Você não precisa decidir nada.** O instalador tenta a 8766, e se já tiver
outro programa ali, ele procura a próxima livre e sugere. Aperte Enter.

Se quiser conferir por conta própria quem está usando uma porta:

```bash
lsof -nP -iTCP:8766 -sTCP:LISTEN
```

Sem resposta quer dizer que está livre.

> **O que realmente importa saber:** a porta fica escrita em **três** arquivos —
> o `config.json`, a extensão do navegador e o hook do Claude Code. Se um dia
> você quiser trocar, **rode o instalador de novo** em vez de editar o
> `config.json` na mão. Editando só ele, o painel sobe na porta nova e a
> extensão e os hooks continuam falando com a antiga — sem erro nenhum na
> tela, só coisas que param de aparecer.
>
> E lembre de atualizar o endereço no tablet, que também tem a porta dentro.

O que ele faz: cria o `config.json`, sorteia uma senha interna (um "token") e
escreve essa senha nos três lugares que precisam dela. **Esses arquivos nunca
vão para o GitHub** — eles estão no `.gitignore` de propósito, porque carregam
a sua senha.

---

## Passo 4 — Ligue e veja

```bash
python3 server.py
```

A janela vai ficar parada mostrando linhas de log. **Isso é normal** — é o
servidor rodando. Para desligar, `Ctrl + C`.

Ele imprime dois endereços:

```
painel no Mac:    http://localhost:8766
painel no tablet: http://192.168.0.66:8766
```

Abra o primeiro no navegador do seu computador. **O painel já deve aparecer.**

Agora o segundo, no tablet: abra o navegador dele e digite aquele endereço
(o número vai ser diferente no seu caso). Os dois precisam estar no mesmo
Wi-Fi.

Para deixar bonito no aparelho:

- **Android** — instale o Fully Kiosk Browser, aponte para o endereço e ligue o
  modo quiosque. Desligue o bloqueio automático de tela.
- **iPad / iPhone** — abra no Safari → botão Compartilhar → "Adicionar à Tela
  de Início". Abra pelo ícone criado e ligue o Acesso Guiado (triplo clique no
  botão lateral) para ninguém sair do painel sem querer.

### A tela de controle

Abra `http://localhost:8766/controle` **no seu computador** (ela só responde
ali, de propósito). É onde você:

- arrasta os widgets para montar o painel do seu jeito;
- troca o tema;
- escreve o recado;
- põe papel de parede;
- e, no topo, vê um **diagnóstico linha a linha**: o que está funcionando, o que
  não está e o que fazer. Use ele para conferir a instalação, não o "parece que
  está funcionando".

---

## Passo 5 — A extensão do navegador (opcional)

Ela é quem alimenta os contadores de Gmail, Chat e WhatsApp, o que está tocando
no YouTube Music ou Spotify, e serve de reserva para a agenda.

Precisa de um navegador **Chromium**: Chrome, Edge, Brave, Opera, Vivaldi, Arc
ou Chromium. Safari e Firefox não servem.

1. Abra o endereço de extensões do seu navegador:

   | Navegador | Endereço |
   |---|---|
   | Chrome, Arc, Chromium | `chrome://extensions` |
   | Edge | `edge://extensions` |
   | Brave | `brave://extensions` |
   | Opera | `opera://extensions` |
   | Vivaldi | `vivaldi://extensions` |

2. Ligue o **Modo do desenvolvedor** (um interruptor no canto).
3. Clique em **Carregar sem compactação** e escolha a pasta `extensao/` de
   dentro do projeto.

**Duas coisas que pegam todo mundo:**

- Sempre que o código da extensão mudar, é preciso **recarregá-la** naquela
  mesma tela. Arquivo novo não entra sozinho.
- Uma aba que já estava aberta antes da extensão pode não ser lida. Se a música
  não aparecer, **recarregue a aba** uma vez.

---

## Passo 6 — A agenda do tablet Android (opcional)

**Pule este passo** se o seu aparelho for iPad, ou se você preferir que a
agenda venha do computador. Ele existe só para ler o calendário de dentro de um
tablet Android.

Você vai precisar do `adb` (Android Debug Bridge) e de **um cabo USB** — a
primeira autorização só acontece por cabo.

1. No tablet: Ajustes → Sobre o tablet → toque **sete vezes** em "Número da
   versão". Vai aparecer "Você agora é um desenvolvedor".
2. Ajustes → Opções do desenvolvedor → ligue a **Depuração USB**.
3. Ligue o cabo no computador e rode:

   ```bash
   adb devices
   ```

   **Olhe para o tablet**: vai aparecer uma janela pedindo autorização. Aceite e
   marque "sempre permitir". Sem isso o terminal fica parado sem explicar.

4. Agora solte o cabo e conecte pela rede:

   ```bash
   adb tcpip 5555
   adb connect <ip-do-tablet>:5555
   ```

5. Ponha esse `<ip-do-tablet>:5555` na tela de controle, em Fontes de dados.

---

## Passo 7 — Fazer subir sozinho (opcional)

```bash
python3 ferramentas/servico.py
```

- **macOS** — instala e liga. A partir daí o painel sobe no login e volta
  sozinho se cair.
- **Linux e Windows** — ele **não instala**: imprime o arquivo que você
  precisaria (unit do systemd, tarefa do Agendador) para você conferir e colar.
  Isso não é preguiça — é que ninguém testou ainda, e instalar calado um serviço
  não verificado deixa você com um processo fantasma e nenhuma pista. Se
  funcionar aí, mande um pull request.

---

## Passo 8 — Os octocats já estão aí

**Você não precisa fazer nada.** Os mascotes da GitHub que aparecem quando não
há pull request nenhum vêm junto com o projeto, para ele funcionar inteiro já
no primeiro arranque.

Os scripts `ferramentas/baixar_octodex.py` e `ferramentas/limpar_octodex.py`
existem caso você queira buscar de novo ou acrescentar outros.

**Uma coisa para saber se você for publicar a sua versão:** essas imagens não
são nossas e **não estão sob a licença MIT**. A `LICENSE` deste projeto cobre o
código; o [TERCEIROS.md](TERCEIROS.md) diz de onde vem cada imagem e sob que
termos. Vale a leitura antes de republicar.

---

## Quando alguma coisa não funciona

**A primeira parada é sempre `http://localhost:8766/controle`.** O diagnóstico
no topo diz, linha por linha, o que está vendo e o que não está.

| Sintoma | Provável causa |
|---|---|
| O tablet não abre o endereço | Não estão no mesmo Wi-Fi, ou o firewall do computador está bloqueando a porta 8766. |
| "Address already in use" ao subir | Já tem um painel rodando. Feche o outro, ou troque a porta no `config.json`. |
| Mensagens e música não aparecem | A extensão não foi carregada, ou foi carregada e a aba é mais antiga que ela. Recarregue as duas. |
| A agenda está vazia | Se for Android, o `adb` caiu — reconecte. Se for outro caminho, confira no passo 5 do roteiro do Claude. |
| O painel diz "SEM ABA" ou "sem leitura" | **Isso não é erro.** É o painel dizendo que não está enxergando aquilo, em vez de mostrar um número inventado. É proposital. |

Se travar em algo, abra o projeto no Claude Code e descreva o que aconteceu.
Ele tem o [CLAUDE.md](CLAUDE.md) com o roteiro e as armadilhas conhecidas.
