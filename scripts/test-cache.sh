#!/bin/bash
# Script de test du cache PostgreSQL discovery
# Tako API

set -e

echo "🧪 Test du cache PostgreSQL discovery"
echo "======================================"

# Couleurs
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

# Vérifier que PostgreSQL est configuré
if [ -z "$POSTGRES_URL" ]; then
  echo -e "${YELLOW}⚠️  POSTGRES_URL non configurée${NC}"
  echo "   Définir dans .env: POSTGRES_URL=postgresql://user:password@host:port/database"
  exit 1
fi

echo ""
echo "1️⃣  Exécution de la migration..."
psql "$POSTGRES_URL" -f scripts/migrations/001_create_discovery_cache.sql

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Migration exécutée avec succès${NC}"
else
  echo -e "${RED}❌ Erreur lors de la migration${NC}"
  exit 1
fi

echo ""
echo "2️⃣  Vérification de la table..."
RESULT=$(psql "$POSTGRES_URL" -t -c "SELECT COUNT(*) FROM discovery_cache;")

if [ $? -eq 0 ]; then
  echo -e "${GREEN}✅ Table discovery_cache accessible (${RESULT// /} entrées)${NC}"
else
  echo -e "${RED}❌ Impossible d'accéder à la table${NC}"
  exit 1
fi

echo ""
echo "3️⃣  Test INSERT..."
psql "$POSTGRES_URL" -c "
INSERT INTO discovery_cache (
  cache_key, provider, endpoint, category, period,
  data, total_results, expires_at
) VALUES (
  'test:endpoint:category',
  'test_provider',
  'test_endpoint',
  'test_category',
  'week',
  '{\"test\": true, \"data\": [1,2,3]}'::jsonb,
  3,
  NOW() + INTERVAL '24 hours'
) ON CONFLICT (cache_key) DO NOTHING;
" > /dev/null

echo -e "${GREEN}✅ Insertion test réussie${NC}"

echo ""
echo "4️⃣  Test SELECT..."
RESULT=$(psql "$POSTGRES_URL" -t -c "
  SELECT cache_key, total_results, 
         EXTRACT(EPOCH FROM (expires_at - NOW()))::int as ttl_seconds
  FROM discovery_cache 
  WHERE cache_key = 'test:endpoint:category';
")

if [ -n "$RESULT" ]; then
  echo -e "${GREEN}✅ Lecture test réussie${NC}"
  echo "   $RESULT"
else
  echo -e "${RED}❌ Erreur lecture${NC}"
  exit 1
fi

echo ""
echo "5️⃣  Test UPDATE (simulation fetch)..."
psql "$POSTGRES_URL" -c "
UPDATE discovery_cache 
SET fetch_count = fetch_count + 1, 
    last_accessed = NOW() 
WHERE cache_key = 'test:endpoint:category';
" > /dev/null

FETCH_COUNT=$(psql "$POSTGRES_URL" -t -c "
  SELECT fetch_count FROM discovery_cache 
  WHERE cache_key = 'test:endpoint:category';
")

echo -e "${GREEN}✅ Compteur fetch_count: ${FETCH_COUNT// /}${NC}"

echo ""
echo "6️⃣  Test fonction purge_old_cache_entries()..."
PURGED=$(psql "$POSTGRES_URL" -t -c "SELECT purge_old_cache_entries(180);")
echo -e "${GREEN}✅ Fonction purge OK (${PURGED// /} entrées purgées)${NC}"

echo ""
echo "7️⃣  Nettoyage..."
psql "$POSTGRES_URL" -c "DELETE FROM discovery_cache WHERE cache_key = 'test:endpoint:category';" > /dev/null
echo -e "${GREEN}✅ Données test supprimées${NC}"

echo ""
echo -e "${GREEN}🎉 Tous les tests sont passés !${NC}"
echo ""
echo "Prochaines étapes :"
echo "  1. Démarrer Tako API avec POSTGRES_URL configuré"
echo "  2. Tester l'endpoint : curl http://localhost:3000/api/cache/stats"
echo "  3. Tester un endpoint discovery : curl http://localhost:3000/api/media/tmdb/trending?category=movie"
