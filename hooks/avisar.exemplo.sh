#!/bin/sh
# Modelo. O instalador gera o avisar.sh de verdade com o seu token.
#
# Duas regras que não se negociam:
#   1. Sai 0 sempre. Hook que falha pode travar o Claude Code.
#   2. Não imprime nada no stdout. No hook UserPromptSubmit, o que o script
#      escreve no stdout entra no contexto da conversa.
curl -s --connect-timeout 1 --max-time 2 \
     -X POST \
     -H 'Content-Type: application/json' \
     -H 'X-Painel-Token: SEU-TOKEN-AQUI' \
     --data-binary @- \
     http://127.0.0.1:8766/claude >/dev/null 2>&1
exit 0
