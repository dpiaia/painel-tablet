# Painel do tablet

Um tablet velho na mesa mostrando o que importa agora: a hora, a agenda do dia,
o clima, as mensagens que chegaram, os pull requests esperando revisão, o que o
Claude Code está fazendo e a música que está tocando.

Quem faz o trabalho é o seu computador. O tablet só mostra — ele é vidro.
Tudo acontece na rede local: nada sobe para lugar nenhum.

O painel tem oito temas que mudam **forma, fonte e ícones**, não só cor:
Escuro, Claro, Apple, Orkut, Facebook, Windows XP, Windows 95 e Matrix. No 95 e
no XP a barra vira barra de tarefas e o tocador de música vira um Winamp.

---

## Comece por aqui

**Abra este projeto no Claude Code e diga "acabei de clonar, me ajuda a
instalar".** Ele lê o [CLAUDE.md](CLAUDE.md), que tem um roteiro passo a passo
feito para conduzir você — inclusive se você nunca abriu um terminal. Ele
pergunta o que precisa saber antes de fazer qualquer coisa.

Se preferir ler antes de fazer, a [INSTALACAO.md](INSTALACAO.md) é o mesmo
roteiro em forma de texto, com as telas e os comandos escritos por extenso.

---

## O que você precisa ter

| | Precisa? | Por quê |
|---|---|---|
| **Claude Code** | **sim** | Este projeto inteiro foi construído com ele, e é para continuar assim. Sem ele você fica com um painel que funciona e que não consegue mudar. |
| **Python 3.8 ou mais novo** | sim | É o servidor. Só biblioteca padrão — você não vai instalar pacote nenhum. |
| **Uma tela para o painel** | sim | Qualquer uma. Ver abaixo. |
| **Um navegador Chromium** | só para agenda, mensagens e música | Chrome, Edge, Brave, Opera, Vivaldi, Arc ou Chromium. Precisa aceitar extensão em modo desenvolvedor. **Safari e Firefox não servem** — a extensão usa as APIs `chrome.*` do Manifest V3. |
| **`gh`, o CLI do GitHub** | opcional | Só para os cartões de pull request. Sem ele, desligue os cartões e pronto. |
| **`adb`** | só num caso | Android **e** você quer a agenda do próprio tablet. Detalhes abaixo. |

### A tela é o requisito mais leve

Pode ser um tablet Android de 2014, um iPad, um monitor velho com um Raspberry,
ou a janela do navegador em outra máquina. **Se você só quer abrir o endereço e
ver o painel, não precisa fazer quase nada**: o servidor sobe no seu computador
e você digita `http://<ip-do-computador>:8766` no aparelho.

O CSS foi escrito para o WebView 64 de um Galaxy Tab E de 2014 — sem `gap` em
flexbox, sem `:has()`, sem `clamp()`. Qualquer navegador mais novo que isso é um
superconjunto, então o mesmo painel serve num iPad de hoje sem uma linha de
mudança.

**Você só precisa de `adb` e de cabo USB** se for Android *e* quiser que a
agenda venha do calendário do próprio tablet. Nos outros casos a agenda vem do
computador, e o tablet não precisa de nada além do navegador.

### Em que sistema isto roda

Foi feito e testado em **macOS**. O que muda nos outros é menos do que parece:

| | macOS | Linux | Windows |
|---|---|---|---|
| Servidor, clima, GitHub, agenda por adb, mensagens, música | ✅ | deve funcionar | deve funcionar |
| Cartão **Monitor do Mac** | ✅ | ❌ usa `vm_stat` e `sysctl` | ❌ |
| Cartão **Monitor do Claude** | ✅ | ❓ lê um caminho do macOS | ❓ |
| Hooks do Claude Code | ✅ | ✅ é um script `/bin/sh` | precisa de WSL ou Git Bash |
| Subir sozinho no login | `launchd` | `systemd --user` | Agendador de Tarefas |

`python3 ferramentas/servico.py` instala o serviço no macOS e, nos outros,
**imprime** o arquivo que faltaria em vez de instalar calado algo que ninguém
testou.

Se você for a primeira pessoa a rodar isto em Linux ou Windows: portar o
`maquina.py` é uma tarefa pequena e bem delimitada, e seria a contribuição mais
útil que este projeto pode receber. Peça ajuda ao Claude Code e mande o pull
request.

---

## Como as peças se encaixam

```
   seu computador                          o tablet
   ┌──────────────────────────┐            ┌──────────────┐
   │ server.py                │            │              │
   │  ├ clima (Open-Meteo)    │  ──SSE──▶  │  o painel    │
   │  ├ agenda (adb ou Mac)   │            │  (só mostra) │
   │  ├ GitHub (gh)           │  ◀─toque─  │              │
   │  ├ Claude Code (hooks)   │            └──────────────┘
   │  └ máquina (ps, sysctl)  │
   └──────────────────────────┘
            ▲
            │ extensão do navegador
            │ (mensagens, música, agenda de reserva)
```

O servidor coleta, guarda tudo em memória e empurra por SSE. O tablet recebe e
desenha. As únicas coisas que voltam do tablet são trocar o tema e mexer no
tocador de música — o resto é só vidro.

---

## Os arquivos de documentação

| Arquivo | Para quem | Quando ler |
|---|---|---|
| **README.md** | você, agora | o que é isto e o que você precisa |
| **[INSTALACAO.md](INSTALACAO.md)** | você, instalando | o passo a passo escrito por extenso |
| **[CLAUDE.md](CLAUDE.md)** | o Claude Code | o roteiro que ele segue para te conduzir, e as regras que ele não pode quebrar |
| **[DECISOES.md](DECISOES.md)** | quem vai mudar o código | *por que* cada peça é como é — o que foi medido e o que já custou tempo |
| **[TERCEIROS.md](TERCEIROS.md)** | todo mundo | de onde vem cada imagem e sob que termos |

---

## Se você quiser ajudar

Tarefas pequenas, bem delimitadas e que ninguém fez ainda — todas boas para uma
primeira contribuição:

| Tarefa | O que envolve |
|---|---|
| **Portar o `maquina.py` para Linux** | Trocar `vm_stat` e `sysctl` por `/proc/meminfo` e `/proc/swaps`. Uma função, umas 30 linhas. |
| **O mesmo para Windows** | Provavelmente via `wmic` ou `psutil`. |
| **Achar o histórico do Claude fora do macOS** | O `claude_uso.py` lê `~/Library/Application Support/Claude/plan-usage-history.json`. Onde o app guarda isso em Linux e Windows é pergunta em aberto. |
| **Testar o serviço** | O `ferramentas/servico.py` imprime uma unit do systemd e uma tarefa do Agendador que ninguém rodou. Se funcionar aí, corrija o que faltou e marque como testado. |
| **Um tema novo** | Os temas vivem em `temas.py` (a paleta) e `web/temas.css` (a forma). Nenhum deles sabe que os outros existem. |

Peça ajuda ao Claude Code: ele conhece o projeto pelo `CLAUDE.md` e pelo
`DECISOES.md`, e sabe abrir o pull request com você.

**Uma regra ao contribuir:** o painel nunca mostra número quando está cego.
Aba fechada é "SEM ABA", leitura velha é "sem leitura". Se a sua mudança faz o
painel adivinhar um valor para preencher espaço, ela vai ser recusada — é a
única coisa que este projeto leva a sério de verdade.

---

## Licença

O **código** é MIT — veja [LICENSE](LICENSE).

As **imagens não são todas nossas**, e a MIT não se aplica a elas. Os octocats
são da GitHub e nem vêm no repositório: há um script que busca na fonte. O
[TERCEIROS.md](TERCEIROS.md) diz de onde vem cada coisa e o que você pode fazer
com ela. Se for publicar a sua versão, leia esse arquivo antes.
