#!/usr/bin/env node
/**
 * MAXIMUS Inmobiliaria - Skill 3: property-image-cleaner (Node.js Wrapper -> Python OpenCV/Pillow Engine)
 * =======================================================================================================
 * Invoca el motor completo de visión artificial `clean_images.py` (Pillow + OpenCV + NumPy) para
 * garantizar que tanto por CLI de Node como por CLI de Python se ejecute siempre la separación
 * automática de collages (3x2, 3x1, 2x2, 2x1, 1x2) y el recorte de marcas de agua / cintillos.
 */

const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

function findPythonExecutable() {
    const candidates = [
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python312', 'python.exe'),
        path.join(process.env.LOCALAPPDATA || '', 'Programs', 'Python', 'Python311', 'python.exe'),
        'python',
        'python3'
    ];
    for (const c of candidates) {
        if (!c) continue;
        if (c.includes(path.sep) && !fs.existsSync(c)) continue;
        try {
            const r = spawnSync(c, ['--version'], { encoding: 'utf8' });
            if (r.status === 0) return c;
        } catch (_) {}
    }
    return 'python';
}

if (require.main === module) {
    const pyExe = findPythonExecutable();
    const pyScript = path.join(__dirname, 'clean_images.py');
    const args = [pyScript, ...process.argv.slice(2)];
    const res = spawnSync(pyExe, args, { stdio: 'inherit', encoding: 'utf8' });
    process.exit(res.status || 0);
}
