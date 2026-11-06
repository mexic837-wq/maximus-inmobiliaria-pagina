/**
 * ==============================================================================
 * MAXIMUS INMOBILIARIA - Script de Preparación para App Móvil (Capacitor)
 * ==============================================================================
 *
 * Empaqueta y optimiza los archivos web limpios en la carpeta `www/`
 * lista para sincronizar con Android Studio y Xcode (`npx cap sync`).
 *
 * Uso:
 *   node scripts/build-app.js
 */

const fs = require('fs');
const path = require('path');

const ROOT_DIR = path.resolve(__dirname, '..');
const WWW_DIR = path.resolve(ROOT_DIR, 'www');

console.log('🚀 [MAXIMUS] Iniciando empaquetado para App Store & Google Play...');

// 1. Limpiar o crear carpeta www/
if (fs.existsSync(WWW_DIR)) {
    fs.rmSync(WWW_DIR, { recursive: true, force: true });
}
fs.mkdirSync(WWW_DIR, { recursive: true });

// 2. Archivos raíz a copiar
const ROOT_FILES = [
    'index.html',
    'catalog.html',
    'dashboard-layout.html',
    'login.html',
    'property-detail.html',
    'terminos.html',
    'privacidad.html',
    'eliminar-cuenta.html',
    'manifest.json',
    'favicon.ico',
    'favicon.png',
    'favicon.svg',
    'favicon-16x16.png',
    'favicon-32x32.png',
    'apple-touch-icon.png'
];

ROOT_FILES.forEach(file => {
    const src = path.join(ROOT_DIR, file);
    const dest = path.join(WWW_DIR, file);
    if (fs.existsSync(src)) {
        fs.copyFileSync(src, dest);
    } else {
        console.warn(`  ⚠️ Archivo no encontrado (omitido): ${file}`);
    }
});

// 3. Copiar directorios completos de forma recursiva
function copyDirRecursive(srcDir, destDir) {
    if (!fs.existsSync(srcDir)) return;
    fs.mkdirSync(destDir, { recursive: true });
    const entries = fs.readdirSync(srcDir, { withFileTypes: true });
    for (const entry of entries) {
        const srcPath = path.join(srcDir, entry.name);
        const destPath = path.join(destDir, entry.name);
        if (entry.isDirectory()) {
            copyDirRecursive(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}

console.log('📦 Copiando módulos JavaScript y recursos multimedia...');
copyDirRecursive(path.join(ROOT_DIR, 'js'), path.join(WWW_DIR, 'js'));
copyDirRecursive(path.join(ROOT_DIR, 'assets'), path.join(WWW_DIR, 'assets'));

// Si existe carpeta legacy 'assest', sincronizar por compatibilidad
if (fs.existsSync(path.join(ROOT_DIR, 'assest'))) {
    copyDirRecursive(path.join(ROOT_DIR, 'assest'), path.join(WWW_DIR, 'assest'));
}

// 4. Auditoría y verificación de las páginas en www/
const htmlFiles = fs.readdirSync(WWW_DIR).filter(f => f.endsWith('.html'));
let issues = 0;

htmlFiles.forEach(file => {
    const filePath = path.join(WWW_DIR, file);
    const content = fs.readFileSync(filePath, 'utf8');

    if (!content.includes('viewport-fit=cover')) {
        console.warn(`  ⚠️ ${file}: Falta 'viewport-fit=cover' en el meta viewport.`);
        issues++;
    }
    if (!content.includes('native-bridge.js')) {
        console.warn(`  ⚠️ ${file}: Falta incluir 'js/native-bridge.js'.`);
        issues++;
    }
});

if (issues === 0) {
    console.log(`✅ [MAXIMUS] Auditoría superada: ${htmlFiles.length} páginas HTML verificadas con soporte seguro de notch y puente nativo.`);
} else {
    console.warn(`⚠️ [MAXIMUS] Se detectaron ${issues} advertencias en las páginas.`);
}

// 5. Conteo y tamaño total
function getDirSize(dir) {
    let total = 0;
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const e of entries) {
        const p = path.join(dir, e.name);
        if (e.isDirectory()) total += getDirSize(p);
        else total += fs.statSync(p).size;
    }
    return total;
}

const totalMB = (getDirSize(WWW_DIR) / (1024 * 1024)).toFixed(2);
console.log(`✨ [MAXIMUS] Carpeta www/ generada exitosamente (${totalMB} MB).`);
console.log('📱 Siguiente paso: ejecuta "npx cap sync" o "npm run cap:sync" para sincronizar con Android y iOS.');
