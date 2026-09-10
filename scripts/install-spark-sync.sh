#!/bin/bash
# Instala el puente Spark → FacturAI para que corra solo cada 30 minutos.
#
# Usa launchd (el programador de macOS). Solo corre cuando el Mac está
# encendido; si estaba apagado, al volver se pone al día en la siguiente
# ejecución. No necesita permisos de administrador.
#
# Uso:   bash scripts/install-spark-sync.sh
# Quitar: launchctl unload ~/Library/LaunchAgents/cloud.jamtech.facturai.sparksync.plist

set -e

PROJECT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node)"
PLIST="$HOME/Library/LaunchAgents/cloud.jamtech.facturai.sparksync.plist"
LOG_DIR="$HOME/Library/Logs/FacturAI"

if [ -z "$NODE_BIN" ]; then
    echo "No encuentro node en el PATH."
    exit 1
fi
if [ ! -f "$PROJECT_DIR/.env.local" ]; then
    echo "No encuentro .env.local en $PROJECT_DIR"
    exit 1
fi

mkdir -p "$LOG_DIR" "$HOME/Library/LaunchAgents"

cat > "$PLIST" <<PLISTEOF
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
    <key>Label</key>
    <string>cloud.jamtech.facturai.sparksync</string>
    <key>ProgramArguments</key>
    <array>
        <string>$NODE_BIN</string>
        <string>--env-file=$PROJECT_DIR/.env.local</string>
        <string>$PROJECT_DIR/scripts/spark-sync.mjs</string>
    </array>
    <key>WorkingDirectory</key>
    <string>$PROJECT_DIR</string>
    <key>StartInterval</key>
    <integer>1800</integer>
    <key>RunAtLoad</key>
    <true/>
    <key>StandardOutPath</key>
    <string>$LOG_DIR/spark-sync.log</string>
    <key>StandardErrorPath</key>
    <string>$LOG_DIR/spark-sync.error.log</string>
</dict>
</plist>
PLISTEOF

launchctl unload "$PLIST" 2>/dev/null || true
launchctl load "$PLIST"

echo "Puente instalado. Se ejecuta cada 30 minutos mientras el Mac esté encendido."
echo "Registro:  $LOG_DIR/spark-sync.log"
echo "Para quitarlo:  launchctl unload $PLIST"
