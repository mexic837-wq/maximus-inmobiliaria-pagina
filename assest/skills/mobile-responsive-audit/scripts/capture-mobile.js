/**
 * Script de Captura Móvil para Auditoría Visual
 * Toma screenshots headless con Chrome a resoluciones móviles
 */
const { spawnSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const os = require('os');

const CHROME_PATH = process.env.CHROME_PATH || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

function captureMobile(url, outputFile, options = {}) {
    const width = options.width || 390;
    const height = options.height || 844;
    const waitMs = options.waitMs || 2500;
    const fullOutputPath = path.resolve(outputFile);

    const outDir = path.dirname(fullOutputPath);
    if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true });
    }

    const tempDir = path.join(os.tmpdir(), 'chrome_mobile_audit_' + Date.now());

    const args = [
        '--headless=new',
        '--disable-gpu',
        `--user-data-dir=${tempDir}`,
        `--window-size=${width},${height}`,
        `--virtual-time-budget=${waitMs}`,
        `--screenshot=${fullOutputPath}`,
        url
    ];

    try {
        const result = spawnSync(CHROME_PATH, args, { stdio: 'inherit' });
        if (fs.existsSync(fullOutputPath)) {
            console.log(`[OK] Captura guardada en: ${fullOutputPath}`);
            // Limpiar carpeta temporal si se puede
            try { fs.rmSync(tempDir, { recursive: true, force: true }); } catch (e) {}
            return true;
        } else {
            console.error(`[ERROR] No se generó el archivo en: ${fullOutputPath}`);
            return false;
        }
    } catch (err) {
        console.error('[ERROR] Error ejecutando Chrome:', err.message);
        return false;
    }
}

// CLI usage
if (require.main === module) {
    const args = process.argv.slice(2);
    const url = args[0] || 'http://localhost:3000/dashboard';
    const out = args[1] || 'assest/previews/mobile-preview.png';
    const w = parseInt(args[2]) || 390;
    const h = parseInt(args[3]) || 844;

    console.log(`Iniciando captura móvil: ${url} (${w}x${h}) -> ${out}`);
    captureMobile(url, out, { width: w, height: h });
}

module.exports = { captureMobile };
