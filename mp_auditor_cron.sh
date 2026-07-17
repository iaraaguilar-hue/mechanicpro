#!/bin/zsh
# Corrida semanal del auditor de salud de Mechanic Pro (capa A: Supabase vivo + datos).
# Lo dispara el LaunchAgent com.mechanicpro.auditor. Log en ~/mechanic_pro_auditor.log
LOG="$HOME/mechanic_pro_auditor.log"
cd /Users/iaraaguilar/Desktop/mechanic_pro/frontend || exit 2
echo "===== $(date '+%Y-%m-%d %H:%M') =====" >> "$LOG"
/opt/homebrew/bin/node mp_healthcheck.cjs >> "$LOG" 2>&1
CODE=$?
if [ $CODE -ne 0 ]; then
  osascript -e 'display notification "El auditor detectó algo en Mechanic Pro. Mirá ~/mechanic_pro_auditor.log" with title "🩺 Mechanic Pro — revisar"' 2>/dev/null
fi
exit $CODE
