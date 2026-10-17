/**
 * Analizador Estático de Antipatrones Móviles
 * Escanea archivos HTML en busca de clases y patrones CSS que rompen la vista en teléfonos.
 */
const fs = require('fs');
const path = require('path');

const ARCHIVOS_OBJETIVO = [
    'dashboard-layout.html',
    'index.html'
];

function scanFile(filePath) {
    if (!fs.existsSync(filePath)) return [];
    const content = fs.readFileSync(filePath, 'utf8');
    const lines = content.split('\n');
    const issues = [];

    lines.forEach((line, index) => {
        const lineNum = index + 1;

        // 1. Detección de paddings horizontales excesivos en móvil (p. ej. px-8 sin sm:)
        if (/\bpx-8\b/.test(line) && !/\bsm:px-/.test(line) && !line.includes('hidden md:')) {
            issues.push({
                line: lineNum,
                type: 'PADDING_EXCESIVO',
                severity: 'warning',
                detail: 'Uso de px-8 sin prefijo responsive sm:. Puede desperdiciar hasta 64px de ancho en móviles.',
                snippet: line.trim().slice(0, 100),
                remedy: 'Reemplazar por px-3.5 sm:px-8 o px-4 sm:px-8'
            });
        }

        // 2. Anchos fijos grandes en píxeles (w-[...px] o min-w-[...px] mayor a 340px, ignorando max-w)
        const matchWidth = line.match(/(?<!max-)(?<![a-zA-Z0-9_-])(?:min-w|w)-\[(\d+)px\]/);
        if (matchWidth) {
            const pxVal = parseInt(matchWidth[1]);
            if (pxVal > 340 && !line.includes('hidden') && !/\bsm:/.test(line)) {
                issues.push({
                    line: lineNum,
                    type: 'ANCHO_FIJO_DESBORDANTE',
                    severity: 'critical',
                    detail: `Ancho fijo de ${pxVal}px sin adaptación móvil. En pantallas de 360-390px causa desbordamiento lateral.`,
                    snippet: line.trim().slice(0, 100),
                    remedy: 'Reemplazar con w-full sm:w-[...px] o max-w-full'
                });
            }
        }

        // 3. Títulos gigantes sin escala móvil (text-3xl o text-4xl sin sm:)
        if (/\btext-4xl\b/.test(line) && !/\bsm:text-/.test(line) && !line.includes('hidden')) {
            issues.push({
                line: lineNum,
                type: 'TIPOGRAFIA_DESPROPORCIONADA',
                severity: 'info',
                detail: 'text-4xl directo puede forzar saltos de línea indeseados en pantallas móviles.',
                snippet: line.trim().slice(0, 100),
                remedy: 'Usar escala móvil-primero: text-2xl sm:text-4xl'
            });
        }
    });

    return issues;
}

function runScanner() {
    console.log('====================================================');
    console.log('   ESCANER DE ANTIPATRONES MÓVILES (CODE CHECK)     ');
    console.log('====================================================\n');

    let totalIssues = 0;
    const report = {};

    ARCHIVOS_OBJETIVO.forEach(file => {
        const issues = scanFile(file);
        report[file] = issues;
        totalIssues += issues.length;
        console.log(`📄 Analizando ${file}: ${issues.length} observaciones encontradas.`);
        issues.slice(0, 5).forEach(iss => {
            console.log(`  [Línea ${iss.line}] [${iss.type}] ${iss.detail}`);
            console.log(`    ↳ Sugerencia: ${iss.remedy}\n`);
        });
        if (issues.length > 5) {
            console.log(`  ... y ${issues.length - 5} observaciones más.\n`);
        }
    });

    const outReportPath = 'assest/skills/mobile-responsive-fixer/diagnostico-movil.json';
    fs.writeFileSync(outReportPath, JSON.stringify(report, null, 2));
    console.log(`[OK] Diagnóstico completo exportado a: ${outReportPath}`);
    return report;
}

if (require.main === module) {
    runScanner();
}

module.exports = { runScanner, scanFile };
