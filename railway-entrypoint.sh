#!/bin/sh
# Railway Session Proxy — entrypoint
#
# Ejecuta refresh-inmovilla-session.ts en un loop cada SESSION_REFRESH_INTERVAL_S
# (default: 14400 = 4 horas). Si el script detecta que la sesión aún es válida
# (>60 min restantes), no hace login innecesario.

set -e

INTERVAL="${SESSION_REFRESH_INTERVAL_S:-14400}"

echo "[railway] Session proxy iniciado (intervalo=${INTERVAL}s)"
echo "[railway] DB host: $(echo $DATABASE_URL | sed 's/.*@\([^/]*\).*/\1/')"

while true; do
  echo ""
  echo "[railway] $(date -u +%Y-%m-%dT%H:%M:%SZ) — Ejecutando refresh de sesión..."
  npx tsx scripts/refresh-inmovilla-session.ts --force || echo "[railway] refresh falló (exit $?), reintentando en el próximo ciclo"
  echo "[railway] Próximo refresh en ${INTERVAL}s"
  sleep "$INTERVAL"
done
