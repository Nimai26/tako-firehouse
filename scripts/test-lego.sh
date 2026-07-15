#!/bin/bash
# Script de test rapide pour LEGO provider
# Lance les tests dans un conteneur Node.js temporaire

cd "$(dirname "$0")/.."

echo "═══════════════════════════════════════════════════════════"
echo "  TEST LEGO PROVIDER"
echo "═══════════════════════════════════════════════════════════"

# Vérifier que FlareSolverr tourne
FSR_STATUS=$(curl -sf http://localhost:8191/health 2>/dev/null | grep -o '"status": "ok"')
if [ -z "$FSR_STATUS" ]; then
    echo "❌ FlareSolverr n'est pas accessible sur localhost:8191"
    echo "   Lancez: docker compose up -d flaresolverr"
    exit 1
fi
echo "✅ FlareSolverr disponible"

# Lancer le test dans un conteneur Node temporaire
echo ""
echo "🚀 Lancement des tests dans un conteneur Node..."
echo ""

docker run --rm -it \
    --network tako_api_tako-network \
    -v "$(pwd)/src:/app/src:ro" \
    -v "$(pwd)/scripts:/app/scripts:ro" \
    -v "$(pwd)/package.json:/app/package.json:ro" \
    -e "FSR_URL=http://tako_flaresolverr:8191/v1" \
    -e "NODE_ENV=development" \
    -e "DEFAULT_LOCALE=fr-FR" \
    -w /app \
    node:20-slim \
    sh -c "npm install --silent 2>/dev/null && node scripts/test-lego.js"
