/**
 * Ciclo Completo de Corrección y Verificación Móvil
 * Conecta mobile-responsive-audit con mobile-responsive-fixer:
 * 1. Ejecuta auditoría visual con Chrome Headless.
 * 2. Analiza el código fuente en busca de problemas estáticos de proporción.
 * 3. Permite verificar las correcciones en caliente.
 */
const { execSync } = require('child_process');
const path = require('path');
const fs = require('fs');

async function runCycle() {
    console.log('========================================================');
    console.log('   CICLO DE OPTIMIZACIÓN Y CORRECCIÓN MÓVIL EN VIVO     ');
    console.log('========================================================\n');

    // 1. Ejecutar análisis estático de código
    console.log('PASO 1: Analizando antipatrones en el código fuente...');
    try {
        execSync('node assest/skills/mobile-responsive-fixer/scripts/check-mobile-antipatterns.js', { stdio: 'inherit' });
    } catch (e) {
        console.error('Error durante el análisis de código:', e.message);
    }

    // 2. Ejecutar capturas visuales en navegador
    console.log('\nPASO 2: Generando capturas visuales actualizadas...');
    try {
        execSync('node assest/skills/mobile-responsive-audit/scripts/audit-all-views.js', { stdio: 'inherit' });
    } catch (e) {
        console.error('Error durante las capturas visuales:', e.message);
    }

    console.log('\n========================================================');
    console.log('✓ CICLO COMPLETADO:');
    console.log('  1. Revisa assest/skills/mobile-responsive-fixer/diagnostico-movil.json');
    console.log('  2. Consulta assest/skills/mobile-responsive-fixer/references/remediation-catalog.md');
    console.log('  3. Aplica los cambios con replace_file_content.');
    console.log('  4. Vuelve a ejecutar este ciclo para validar que el resultado visual sea perfecto.');
    console.log('========================================================\n');
}

if (require.main === module) {
    runCycle();
}

module.exports = { runCycle };
