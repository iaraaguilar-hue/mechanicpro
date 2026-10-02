#!/bin/bash
# ─────────────────────────────────────────────────────────────
# EL CHEQUEO COMPLETO, ANTES DE PUBLICAR CUALQUIER PARCHE (2-oct-2026).
#
# 🔴 POR QUÉ EXISTE: Iara, 2-oct-2026: «no puede pasar más de que arreglemos algo y se
# arruine otra cosa, tiene que estar todo chequeado todo el tiempo, cada vez que hay un
# parche». Los candados existían (uno por cada cosa que ya se rompió una vez), pero se
# corrían sueltos y a mano: cada arreglo corría el suyo y ninguno los de al lado. Ahora
# es un solo comando, y el push no sale si no dio verde sobre ESE commit (pre-push).
#
# QUÉ CORRE, en orden:
#   1. tipos (tsc -b) y build (vite);
#   2. las pruebas de lógica (src/lib/*.test.ts, harness propio con esbuild);
#   3. TODOS los candados de pantalla (qa_*.cjs) contra `npm run dev` con la base real
#      y el Taller Demo. Si uno falla se reintenta UNA vez: un «Failed to fetch» suelto
#      tumba una corrida sana (skill mp-app-iteracion). Dos rojos seguidos = rojo.
#
# Un candado nuevo entra solo: alcanza con que se llame qa_<algo>.cjs. Los que NO son
# candados (ayudantes, auditorías) van en NO_SON_CANDADOS.
#
# Si todo da verde y no hay cambios sin commitear en lo que se publica, anota el árbol del
# commit en .git/qa_ok (fuera del repo publicado). El pre-push compara contra eso.
#
#   ./qa_todo.sh            (todo)
#   ./qa_todo.sh rapido     (solo 1 y 2: para iterar; NO habilita el push)
# ─────────────────────────────────────────────────────────────
set -u
cd "$(dirname "$0")"
MODO="${1:-todo}"
NO_SON_CANDADOS="qa_playwright.cjs qa_recorrido_capturas.cjs"
SALIDA="${TMPDIR:-/tmp}/mp_qa_$(date +%Y%m%d_%H%M%S)"
mkdir -p "$SALIDA"

set -a; . "$HOME/Documents/estudio_iara/.secrets/mp_demo_meta_review.env"; set +a
export DEMO_PASS="${MP_DEMO_PASSWORD:-}"

ROJOS=()
VERDES=0
fila() { printf '  %-4s %-38s %s\n' "$1" "$2" "$3"; }
correr() {   # correr <nombre> <comando…>
    local nombre="$1"; shift
    local t0=$SECONDS
    if "$@" > "$SALIDA/$nombre.log" 2>&1; then
        fila "✅" "$nombre" "$((SECONDS - t0)) s"; VERDES=$((VERDES + 1)); return 0
    fi
    return 1
}

echo "── 1. tipos y build"
correr typecheck npm run typecheck || { fila "❌" typecheck "ver $SALIDA/typecheck.log"; ROJOS+=(typecheck); }
correr build npm run build         || { fila "❌" build "ver $SALIDA/build.log"; ROJOS+=(build); }

echo "── 2. pruebas de lógica"
for t in src/lib/*.test.ts; do
    n=$(basename "$t" .test.ts)
    correr "test:$n" sh -c "./node_modules/.bin/esbuild '$t' --bundle --platform=node --format=cjs --log-level=error --alias:@=./src --define:import.meta.env='{\"VITE_SUPABASE_URL\":\"http://x\",\"VITE_SUPABASE_ANON_KEY\":\"x\"}' --outfile='$SALIDA/$n.test.cjs' && node '$SALIDA/$n.test.cjs'" \
        || { fila "❌" "test:$n" "ver $SALIDA/test:$n.log"; ROJOS+=("test:$n"); }
done

if [ "$MODO" = "rapido" ]; then
    echo; [ ${#ROJOS[@]} -eq 0 ] && echo "🟢 rápido: $VERDES verdes (los candados de pantalla NO corrieron: esto no habilita el push)" || echo "🔴 ${#ROJOS[@]} en rojo: ${ROJOS[*]}"
    [ ${#ROJOS[@]} -eq 0 ]; exit $?
fi

echo "── 3. candados de pantalla (Taller Demo, base real)"
DEV_PID=""
if ! lsof -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1; then
    npm run dev > "$SALIDA/dev.log" 2>&1 &
    DEV_PID=$!
    for _ in $(seq 1 60); do lsof -iTCP:5173 -sTCP:LISTEN >/dev/null 2>&1 && break; sleep 1; done
fi
trap '[ -n "$DEV_PID" ] && kill $DEV_PID 2>/dev/null' EXIT

for c in qa_*.cjs; do
    case " $NO_SON_CANDADOS " in *" $c "*) continue ;; esac
    n="${c%.cjs}"
    correr "$n" node "$c" || correr "$n" node "$c" \
        || { fila "❌" "$n" "dos veces rojo · ver $SALIDA/$n.log"; ROJOS+=("$n"); }
done
# Los colores los elige el cliente: el contraste se mide también con los de un taller que
# eligió un color claro (Leira: rojo y blanco).
correr "qa_contraste (colores Leira)" node qa_contraste.cjs --colores '#e90c0c,#FFFFFF' \
    || correr "qa_contraste (colores Leira)" node qa_contraste.cjs --colores '#e90c0c,#FFFFFF' \
    || { fila "❌" "qa_contraste (colores Leira)" "ver el log"; ROJOS+=("qa_contraste-leira"); }

echo
if [ ${#ROJOS[@]} -eq 0 ]; then
    # Solo se habilita el push si lo que se probó es exactamente lo commiteado.
    SUCIO=$(git status --porcelain -- src public index.html package.json package-lock.json vite.config.ts tailwind.config.cjs vercel.json)
    if [ -z "$SUCIO" ]; then
        git rev-parse 'HEAD^{tree}' > "$(git rev-parse --git-dir)/qa_ok"
        echo "🟢 $VERDES verdes. Habilitado el push de $(git rev-parse --short HEAD)."
    else
        echo "🟢 $VERDES verdes, pero hay cambios sin commitear en lo que se publica: commiteá y volvé a correrlo para poder pushear."
    fi
    exit 0
fi
echo "🔴 ${#ROJOS[@]} en rojo: ${ROJOS[*]}"
echo "   logs: $SALIDA"
exit 1
