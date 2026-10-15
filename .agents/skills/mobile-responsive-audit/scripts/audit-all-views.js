/**
 * Auditor Automatizado de Vistas Móviles
 * Captura y valida todas las pantallas clave de la aplicación en resolución móvil.
 */
const { captureMobile } = require('./capture-mobile');
const path = require('path');

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

const VISTAS = [
    { name: 'landing', url: `${BASE_URL}/`, desc: 'Página de Inicio / Landing' },
    { name: 'dashboard-resumen', url: `${BASE_URL}/dashboard#view-resumen`, desc: 'Panorama Inmobiliario' },
    { name: 'dashboard-inmuebles', url: `${BASE_URL}/dashboard#view-inmuebles`, desc: 'Catálogo de Inmuebles' },
    { name: 'dashboard-captaciones', url: `${BASE_URL}/dashboard#view-exclusivas-maximus`, desc: 'Captaciones Exclusivas MAXIMUS' },
    { name: 'dashboard-cotizador', url: `${BASE_URL}/dashboard#view-cotizador`, desc: 'Cotizador Express' },
    { name: 'dashboard-perfil', url: `${BASE_URL}/dashboard#view-perfil`, desc: 'Perfil del Asesor' }
];

async function runAudit() {
    console.log('====================================================');
    console.log('   AUDITORÍA VISUAL MÓVIL - MAXIMUS INMOBILIARIA    ');
    console.log('====================================================');
    console.log(`Resolución objetivo: 390x844 (Mobile Viewport iPhone/Android Standard)`);
    console.log(`URL Base: ${BASE_URL}\n`);

    const results = [];

    for (const vista of VISTAS) {
        const outPath = `assest/previews/mobile-${vista.name}.png`;
        console.log(`📸 Capturando [${vista.desc}] -> ${vista.url}`);
        const ok = captureMobile(vista.url, outPath, { width: 390, height: 844, waitMs: 2000 });
        results.push({ name: vista.name, desc: vista.desc, ok, path: outPath });
    }

    console.log('\n--- RESUMEN DE CAPTURAS GENERADAS ---');
    results.forEach(r => {
        console.log(` ${r.ok ? '✓' : '✗'} ${r.desc} -> ${r.path}`);
    });
    console.log('\nPuedes revisar visualmente cada archivo PNG o usar la herramienta view_file para inspeccionar proporciones.');
}

if (require.main === module) {
    runAudit();
}

module.exports = { runAudit };
