#!/usr/bin/env node
/**
 * MAXIMUS Inmobiliaria - Skill 4: maximus-supabase-publisher (Node.js Dual-Flow Engine)
 * =====================================================================================
 * Inserta en `public.inmuebles` en Supabase respetando el flujo de carpeta:
 *   - `captaciones_externas/` -> is_maximus = false, en_oferta = false, Asesor Externo
 *   - `captaciones_maximus/`  -> is_maximus = true, en_oferta = true, Asesor Oficial MAXIMUS
 */

const fs = require('fs');
const path = require('path');

const ICONOS_VALIDOS = new Set([
    'ph-star', 'ph-waves', 'ph-lightning', 'ph-drop', 'ph-shield-check',
    'ph-car', 'ph-armchair', 'ph-cooking-pot', 'ph-wifi-high', 'ph-snowflake',
    'ph-sun-horizon', 'ph-tree', 'ph-storefront', 'ph-warehouse', 'ph-plant',
    'ph-lock-key', 'ph-bathtub', 'ph-elevator', 'ph-wine', 'ph-trend-up',
    'ph-buildings', 'ph-sparkle', 'ph-check'
]);

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

async function getNextCorrelativo(cfg) {
    let maxNum = 106;
    try {
        const res = await fetch(`${cfg.url}/rest/v1/inmuebles?select=codigo`, {
            headers: { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` }
        });
        if (res.ok) {
            const rows = await res.json();
            for (const r of rows) {
                const m = String(r.codigo || '').match(/(\d+)/);
                if (m) {
                    const n = parseInt(m[1], 10);
                    if (n >= 100 && n <= 99999 && n > maxNum) maxNum = n;
                }
            }
        }
    } catch (_) {}
    return maxNum + 1;
}

function buildPayload(inm, codigo, esLoteMaximus, useCanonTipo = false, omitAgenteId = false) {
    const operacion = String(inm.operacion || 'venta').toLowerCase();
    const precio = Number(inm.precio || 0);
    if (precio <= 0) throw new Error('Precio inválido (Regla de Oro 1)');

    const tipo = useCanonTipo
        ? String(inm.tipo_sql_canonical || 'casa').toLowerCase()
        : String(inm.tipo_sql_dashboard || 'casa').toLowerCase();

    const isMaximusFlag = Boolean(inm.is_maximus ?? esLoteMaximus);

    const aspectos = (inm.aspectos_destacados || []).slice(0, 4).map(a => ({
        icono: ICONOS_VALIDOS.has(a.icono) ? a.icono : 'ph-star',
        titulo: String(a.titulo || 'Destacado'),
        desc: String(a.desc || '')
    }));

    const fotos = (inm.fotos || []).filter(Boolean);
    const flujoLabel = isMaximusFlag ? 'Captación Directa MAXIMUS' : 'Captación Externa WhatsApp';
    return {
        codigo,
        titulo: String(inm.titulo || '').trim(),
        subtitulo: String(inm.subtitulo || '').trim(),
        descripcion: String(inm.descripcion || '').trim(),
        precio,
        moneda: String(inm.moneda || (operacion === 'alquiler' ? 'USD/mes' : 'USD')),
        operacion,
        tipo,
        estatus: 'disponible',
        ubicacion: String(inm.ubicacion || 'San Cristóbal, Táchira'),
        estado: 'Táchira',
        sector_nombre: String(inm.sector_nombre || 'San Cristóbal'),
        sector_desc: String(inm.sector_desc || ''),
        habitaciones: parseInt(inm.habitaciones || 0, 10),
        banos: parseFloat(inm.banos || 0),
        metros_cuadrados: parseFloat(inm.metros_cuadrados || 0),
        estacionamientos: parseInt(inm.estacionamientos || 0, 10),
        foto_principal: fotos[0] || inm.foto_principal || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=85',
        fotos,
        is_maximus: isMaximusFlag,
        en_oferta: isMaximusFlag,
        comision_porcentaje: 5.0,
        asesor_nombre: String(inm.asesor_nombre || (isMaximusFlag ? 'José Guerrero' : 'Asesor Externo')),
        asesor_telefono: String(inm.asesor_telefono || '+58 424-1234567'),
        aspectos_destacados: aspectos,
        amenidades: (inm.amenidades || []).map(a => ({ icono: 'ph-check', nombre: a.nombre || String(a) })),
        notas_privadas: `[${flujoLabel}] Modo: ${inm.modo_entrada || 'modo_1'} | Grupo: ${inm.grupo_origen} | Estac: ${inm.estacionamientos_ui} | Precio m²: $${inm.precio_m2 || 0} USD/m²`,
        agente_id: (!isMaximusFlag || omitAgenteId) ? null : (inm.agente_id || null)
    };
}

async function publishBatch(loteDir, repoRoot, dryRun = false) {
    const procesadosDir = path.join(loteDir, 'procesados');
    const dedupFile = path.join(procesadosDir, 'inmuebles_deduplicados.json');
    const extFile = path.join(procesadosDir, 'inmuebles_extraidos.json');
    const targetFile = fs.existsSync(dedupFile) ? dedupFile : extFile;

    const data = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    const extData = fs.existsSync(extFile) ? JSON.parse(fs.readFileSync(extFile, 'utf8')) : {};
    const esLoteMaximus = loteDir.toLowerCase().replace(/\\/g, '/').includes('captaciones_maximus') || Boolean(extData.is_maximus_default);

    const list = data.unicos_verificados || data.inmuebles || [];
    const duplicados = data.duplicados_descartados || [];
    const dudosos = data.dudosos_pausados || [];
    const pendientesRegla1 = extData.pendientes_revision || [];

    const cfg = loadSupabaseConfig(repoRoot);
    let corr = dryRun ? 107 : await getNextCorrelativo(cfg);
    const creados = [];

    for (const inm of list) {
        const codigo = `#MAX-${corr++}`;
        const row = buildPayload(inm, codigo, esLoteMaximus, false, false);
        if (dryRun) {
            creados.push({
                id: `dry-run-${inm.temp_id}`,
                codigo,
                titulo: row.titulo,
                tipo: inm.tipo_ui,
                operacion: row.operacion.toUpperCase(),
                precio: row.precio,
                moneda: row.moneda,
                precio_m2: inm.precio_m2,
                sector: row.sector_nombre,
                metros_cuadrados: row.metros_cuadrados,
                habitaciones: row.habitaciones,
                banos: row.banos,
                estacionamientos_ui: inm.estacionamientos_ui,
                is_maximus: row.is_maximus,
                tipo_asesor: row.is_maximus ? 'Oficial MAXIMUS' : 'Asesor Externo',
                asesor_info: `${row.asesor_nombre} (${row.asesor_telefono})`,
                fotos_count: row.fotos.length
            });
        } else {
            let inserted = null;
            for (const [useCanon, omitAg] of [[false, false], [true, false], [true, true]]) {
                const tryRow = buildPayload(inm, codigo, esLoteMaximus, useCanon, omitAg);
                const res = await fetch(`${cfg.url}/rest/v1/inmuebles`, {
                    method: 'POST',
                    headers: {
                        apikey: cfg.key,
                        Authorization: `Bearer ${cfg.key}`,
                        'Content-Type': 'application/json',
                        Prefer: 'return=representation'
                    },
                    body: JSON.stringify(tryRow)
                });
                if (res.ok) {
                    const arr = await res.json();
                    inserted = Array.isArray(arr) && arr[0] ? arr[0] : tryRow;
                    break;
                }
            }
            if (inserted) {
                creados.push({
                    id: inserted.id || 'N/D',
                    codigo: inserted.codigo || codigo,
                    titulo: row.titulo,
                    tipo: inm.tipo_ui,
                    operacion: row.operacion.toUpperCase(),
                    precio: row.precio,
                    moneda: row.moneda,
                    precio_m2: inm.precio_m2,
                    sector: row.sector_nombre,
                    metros_cuadrados: row.metros_cuadrados,
                    habitaciones: row.habitaciones,
                    banos: row.banos,
                    estacionamientos_ui: inm.estacionamientos_ui,
                    is_maximus: row.is_maximus,
                    tipo_asesor: row.is_maximus ? 'Oficial MAXIMUS' : 'Asesor Externo',
                    asesor_info: `${row.asesor_nombre} (${row.asesor_telefono})`,
                    fotos_count: row.fotos.length
                });
            }
        }
    }

    const flujoBadge = esLoteMaximus ? '🏛️ CAPTACIONES DIRECTAS MAXIMUS (`is_maximus = true`)' : '📥 CAPTACIONES EXTERNAS (`is_maximus = false`)';
    let md = `# 📊 Reporte de Ejecución del Agente Captador MAXIMUS — \`${path.basename(loteDir)}\`\n\n`;
    md += `- **Flujo de Carpeta:** **${flujoBadge}**\n`;
    md += `- **Modo:** ${dryRun ? '🧪 SIMULACIÓN (DRY-RUN)' : '🟢 PRODUCCIÓN (SUPABASE LIVE)'}\n`;
    md += `- **Inmuebles Creados / Validados:** \`${creados.length}\`\n`;
    md += `- **Duplicados Descartados:** \`${duplicados.length}\`\n`;
    md += `- **Casos Dudosos / Regla de Oro 1 (\`pendientes_revision.md\`):** \`${pendientesRegla1.length + dudosos.length}\`\n\n---\n\n`;
    md += `## 1. 🏛️ Inmuebles Creados en Catálogo (\`public.inmuebles\`)\n\n`;
    md += `| Código | ID Supabase | Título | Tipo | Operación | Precio | $/m² | Sector | Especificaciones | \`is_maximus\` | Asesor Responsable | Fotos |\n`;
    md += `| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: |\n`;
    for (const c of creados) {
        md += `| **${c.codigo}** | \`${c.id}\` | ${c.titulo} | ${c.tipo} | ${c.operacion} | **$${c.precio.toLocaleString('en-US')} ${c.moneda}** | $${c.precio_m2 || 0} | ${c.sector} | ${c.habitaciones}H · ${c.banos}B · ${c.estacionamientos_ui} · ${c.metros_cuadrados}m² | \`${c.is_maximus}\` | **${c.tipo_asesor}:** ${c.asesor_info} | ${c.fotos_count} |\n`;
    }

    fs.writeFileSync(path.join(loteDir, 'reporte_ejecucion.md'), md, 'utf8');
    return { flujo: esLoteMaximus ? 'captaciones_maximus' : 'captaciones_externas', creados: creados.length, duplicados: duplicados.length, pendientes: pendientesRegla1.length + dudosos.length };
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const loteIdx = args.indexOf('--lote');
    const dryRun = args.includes('--dry-run');
    if (loteIdx === -1 || !args[loteIdx + 1]) {
        console.log('Uso: node publish_to_supabase.js --lote <ruta_lote> [--dry-run]');
        process.exit(0);
    }
    const loteDir = path.resolve(args[loteIdx + 1]);
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
    publishBatch(loteDir, repoRoot, dryRun).then(res => {
        console.log(`[OK] Publicación completada (${res.flujo} | dryRun=${dryRun}): ${res.creados} creados, ${res.duplicados} duplicados, ${res.pendientes} en pendientes_revision.md.`);
    });
}
