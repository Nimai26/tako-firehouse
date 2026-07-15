#!/usr/bin/env node
/**
 * Script de test pour le provider LEGO
 * 
 * Usage: node scripts/test-lego.js
 */

import { LegoProvider } from '../src/domains/construction-toys/providers/lego.provider.js';

const provider = new LegoProvider();

async function testHealthCheck() {
  console.log('\n🔍 Test Health Check...');
  try {
    const result = await provider.healthCheck();
    console.log('  Status:', result.healthy ? '✅ OK' : '❌ FAIL');
    console.log('  Latency:', result.latency, 'ms');
    console.log('  Message:', result.message);
    return result.healthy;
  } catch (error) {
    console.error('  ❌ Erreur:', error.message);
    return false;
  }
}

async function testSearch(query) {
  console.log(`\n🔍 Test Search: "${query}"...`);
  try {
    const result = await provider.search(query, { page: 1, pageSize: 5 });
    console.log('  ✅ Succès!');
    console.log('  Total résultats:', result.meta?.pagination?.totalResults || 'N/A');
    console.log('  Résultats retournés:', result.data?.length || 0);
    
    if (result.data?.length > 0) {
      console.log('\n  📦 Premiers résultats:');
      for (let i = 0; i < Math.min(3, result.data.length); i++) {
        const item = result.data[i];
        console.log(`\n    [${i+1}] ${item.title}`);
        console.log('        ID:', item.id);
        console.log('        Image:', item.images?.primary ? '✅ ' + item.images.primary.substring(0, 60) + '...' : '❌');
        if (item.details) {
          console.log('        Pièces:', item.details.pieceCount || 'N/A');
        }
      }
    }
    return true;
  } catch (error) {
    console.error('  ❌ Erreur:', error.message);
    if (error.stack) console.error(error.stack);
    return false;
  }
}

async function testGetById(id) {
  console.log(`\n🔍 Test GetById: "${id}"...`);
  try {
    const result = await provider.getById(id);
    console.log('  ✅ Succès!');
    console.log('  Titre:', result.data?.title || 'N/A');
    console.log('  Description:', result.data?.description?.substring(0, 100) + '...' || 'N/A');
    console.log('  Images:', result.data?.images?.gallery?.length || 0);
    console.log('  Image primaire:', result.data?.images?.primary ? '✅' : '❌');
    if (result.data?.details) {
      const d = result.data.details;
      console.log('  Détails:');
      console.log('    - Brand:', d.brand || 'N/A');
      console.log('    - Theme:', d.theme || 'N/A');
      console.log('    - Pièces:', d.pieceCount || 'N/A');
      console.log('    - Minifigs:', d.minifigCount || 'N/A');
      console.log('    - Âge:', d.ageRange || 'N/A');
      console.log('    - Prix:', d.price?.display || d.price?.amount || d.price?.value || 'N/A');
      console.log('    - Disponibilité:', d.availability || 'N/A');
      console.log('    - Vidéos:', d.videos?.length || 0);
      console.log('    - Manuels:', d.instructions?.count || 0);
      if (d.instructions?.manuals?.length > 0) {
        d.instructions.manuals.slice(0, 2).forEach((m, i) => {
          console.log(`      [${i+1}] ${m.pdfUrl?.substring(0, 65)}...`);
        });
      }
    }
    // Afficher le raw pour debug
    if (process.env.DEBUG) {
      console.log('\n  📋 RAW DATA:');
      console.log(JSON.stringify(result.data, null, 2).substring(0, 2000));
    }
    return true;
  } catch (error) {
    console.error('  ❌ Erreur:', error.message);
    if (error.stack) console.error(error.stack);
    return false;
  }
}

async function testGetLegoInstructions(id) {
  console.log(`\n🔍 Test GetLegoInstructions: "${id}"...`);
  try {
    const result = await provider.getLegoInstructions(id);
    console.log('  ✅ Succès!');
    console.log('  ID:', result.id);
    console.log('  Nom:', result.name || 'N/A');
    console.log('  Manuels:', result.manuals?.length || 0);
    if (result.manuals?.length > 0) {
      result.manuals.forEach((m, i) => {
        console.log(`    [${i+1}] ${m.description || 'Sans description'}`);
        console.log(`        ${m.pdfUrl}`);
      });
    }
    return true;
  } catch (error) {
    console.error('  ❌ Erreur:', error.message);
    return false;
  }
}

async function main() {
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  TEST PROVIDER LEGO');
  console.log('═══════════════════════════════════════════════════════════');

  const results = {
    healthCheck: false,
    search: false,
    getById: false
  };

  try {
    // Test 1: Health Check (FlareSolverr disponible?)
    results.healthCheck = await testHealthCheck();
    
    if (!results.healthCheck) {
      console.log('\n⚠️  FlareSolverr n\'est pas disponible!');
      console.log('   Assurez-vous que FlareSolverr est lancé sur http://flaresolverr:8191');
      console.log('   Ou définissez FSR_URL dans votre .env');
    }

    // Test 2: Recherche
    results.search = await testSearch('star wars');

    // Test 3: Détails produit (Millennium Falcon)
    results.getById = await testGetById('75192');

    // Test 4: Instructions LEGO
    results.instructions = await testGetLegoInstructions('75192');
  } finally {
    // IMPORTANT: Toujours nettoyer la session FlareSolverr
    console.log('\n🧹 Nettoyage de la session FlareSolverr...');
    await provider.destroySession();
  }

  // Résumé
  console.log('\n═══════════════════════════════════════════════════════════');
  console.log('  RÉSUMÉ');
  console.log('═══════════════════════════════════════════════════════════');
  console.log('  Health Check:', results.healthCheck ? '✅' : '❌');
  console.log('  Search:      ', results.search ? '✅' : '❌');
  console.log('  GetById:     ', results.getById ? '✅' : '❌');
  console.log('  Instructions:', results.instructions ? '✅' : '❌');
  
  const passed = Object.values(results).filter(Boolean).length;
  const total = Object.keys(results).length;
  console.log(`\n  Total: ${passed}/${total} tests passés`);
  
  process.exit(passed === total ? 0 : 1);
}

main().catch(error => {
  console.error('Erreur fatale:', error);
  process.exit(1);
});
