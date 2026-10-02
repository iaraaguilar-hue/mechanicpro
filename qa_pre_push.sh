#!/bin/bash
# ─────────────────────────────────────────────────────────────
# PRE-PUSH: no se publica un commit que no pasó ./qa_todo.sh (2-oct-2026).
#
# Este repo deploya a producción con cada push a main (Vercel). Iara, 2-oct-2026: «no
# puede pasar más de que arreglemos algo y se arruine otra cosa». qa_todo.sh corre TODOS
# los candados y, si dan verde sobre un commit limpio, anota su árbol en .git/qa_ok. Acá
# se compara: el árbol que se va a publicar tiene que ser exactamente el que pasó.
#
# Instalación (una vez por compu; los hooks no viajan con el repo):
#   ln -sf ../../qa_pre_push.sh .git/hooks/pre-push
# ─────────────────────────────────────────────────────────────
cd "$(git rev-parse --show-toplevel)" || exit 1
MARCA="$(git rev-parse --git-dir)/qa_ok"
VERDE="$(cat "$MARCA" 2>/dev/null)"

while read -r local_ref local_sha remote_ref _; do
    [ "$remote_ref" = "refs/heads/main" ] || continue
    [ "$local_sha" = "0000000000000000000000000000000000000000" ] && continue
    ARBOL="$(git rev-parse "$local_sha^{tree}")"
    if [ "$ARBOL" != "$VERDE" ]; then
        echo ""
        echo "🔴 PUSH FRENADO: el commit $(git rev-parse --short "$local_sha") no pasó el chequeo completo."
        echo "   Correlo y, si da verde, volvé a pushear:"
        echo "     ./qa_todo.sh"
        echo "   (Cualquier cambio después del verde lo vuelve a pedir: se prueba lo que se publica.)"
        echo ""
        exit 1
    fi
done
exit 0
