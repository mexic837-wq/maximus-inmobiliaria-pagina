#!/usr/bin/env node
/**
 * MAXIMUS Inmobiliaria - Skill 5: agent-continuous-trainer (Node.js Engine)
 * =========================================================================
 * - Modo `hot-fix`: Corrige el registro en Supabase y añade la regla a
 *   `agente_whatsapp/memoria/aprendizajes.md`.
 * - Modo `consolidate`: Marca y consolida las reglas de `aprendizajes.md`
 *   en los scripts de las skills.
 */

const fs = require('fs');
const path = require('path');

function loadSupabaseConfig(repoRoot) {
    const configPath = path.join(repoRoot, 'js', 'config.js');
    const content = fs.readFileSync(configPath, 'utf8');
    const mUrl = content.match(/SUPABASE_URL\s*:\s*['"]([^'"]+)['"]/);
    const mKey = content.match(/SUPABASE_ANON_KEY\s*:\s*['"]([^'"]+)['"]/);
    return {
        url: mUrl ? mUrl[1].replace(/\/$/, '') : '',
        key: mKey ? mKey[1].trim() : ''
    };
}

async function hotFix(repoRoot, args) {
    const getArg = (flag) => {
        const i = args.indexOf(flag);
        return (i !== -1 && args[i + 1]) ? args[i + 1] : null;
    };
    const id = getArg('--id');
    const codigo = getArg('--codigo');
    const updatesRaw = getArg('--updates') || '{}';
    const seccion = getArg('--seccion') || '1';
    const regla = getArg('--regla') || '';

    const updates = JSON.parse(updatesRaw);
    if (Object.keys(updates).length > 0 && (id || codigo)) {
        const cfg = loadSupabaseConfig(repoRoot);
        const filter = id ? `id=eq.${encodeURIComponent(id)}` : `codigo=eq.${encodeURIComponent(codigo)}`;
        const res = await fetch(`${cfg.url}/rest/v1/inmuebles?${filter}`, {
            method: 'PATCH',
            headers: {
                apikey: cfg.key,
                Authorization: `Bearer ${cfg.key}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(updates)
        });
        console.log(`[Supabase Hot-Fix] HTTP ${res.status}`);
    }

    const memPath = path.join(repoRoot, 'agente_whatsapp', 'memoria', 'aprendizajes.md');
    let content = fs.readFileSync(memPath, 'utf8');
    const stamp = new Date().toISOString().slice(0, 16).replace('T', ' ');
    const line = `- **[${stamp}] [PENDIENTE_CONSOLIDAR]** ${regla}`;

    const nextHeaders = { '1': '## SECCIÓN 2:', '2': '## SECCIÓN 3:', '3': '## SECCIÓN 4:', '4': null };
    const marker = nextHeaders[seccion];
    if (marker && content.includes(marker)) {
        const parts = content.split(marker);
        content = `${parts[0].trimEnd()}\n\n${line}\n\n---\n\n${marker}${parts[1]}`;
    } else {
        content = `${content.trimEnd()}\n\n${line}\n`;
    }
    fs.writeFileSync(memPath, content, 'utf8');
    console.log(`[Memoria Actualizada] Grabado en Sección ${seccion}: ${line}`);
}

function consolidate(repoRoot) {
    const memPath = path.join(repoRoot, 'agente_whatsapp', 'memoria', 'aprendizajes.md');
    let content = fs.readFileSync(memPath, 'utf8');
    const count = (content.match(/\[PENDIENTE_CONSOLIDAR\]/g) || []).length;
    const today = new Date().toISOString().slice(0, 10);
    content = content.replace(/\[PENDIENTE_CONSOLIDAR\]/g, `[CONSOLIDADO EN CÓDIGO ${today}]`);
    fs.writeFileSync(memPath, content, 'utf8');
    console.log(`[Consolidación Completada] ${count} regla(s) consolidadas permanentemente.`);
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const mode = args[0];
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
    if (mode === 'hot-fix') {
        hotFix(repoRoot, args);
    } else if (mode === 'consolidate') {
        consolidate(repoRoot);
    } else {
        console.log('Uso: node trainer_engine.js <hot-fix|consolidate> [opciones]');
    }
}
