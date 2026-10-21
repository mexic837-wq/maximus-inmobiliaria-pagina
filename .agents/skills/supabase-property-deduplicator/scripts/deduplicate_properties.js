#!/usr/bin/env node
/**
 * MAXIMUS Inmobiliaria - Skill 2: supabase-property-deduplicator (Node.js Engine)
 * ===============================================================================
 * Consulta `public.inmuebles` en Supabase y calcula el score de similitud
 * comparando Operación + Tipo + Sector Normalizado + Precio (±5%) + Área m² (±10%).
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

function normTipo(t) {
    const s = String(t || '').toLowerCase();
    if (/depto|departamento|apartamento|apto|penthouse/.test(s)) return 'apartamento';
    if (/casa|quinta|townhouse/.test(s)) return 'casa';
    if (/galpon|galpón/.test(s)) return 'galpon';
    if (/local|oficina|comercial/.test(s)) return 'local';
    if (/finca|terreno|parcela|campo/.test(s)) return 'terreno';
    return s;
}

function normSector(item) {
    return String(item.sector_nombre || item.ubicacion || '')
        .toLowerCase()
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .replace(/\b(urbanizacion|urb|residencias|res|sector|barrio|san cristobal|tachira)\b/g, ' ')
        .replace(/[^a-z0-9\s]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
}

function calcSimilarity(cand, ref) {
    if (String(cand.operacion || '').toLowerCase() !== String(ref.operacion || '').toLowerCase()) return { score: 0, det: {} };
    if (normTipo(cand.tipo_ui || cand.tipo) !== normTipo(ref.tipo_ui || ref.tipo)) return { score: 0, det: {} };

    const s1 = normSector(cand);
    const s2 = normSector(ref);
    if (!s1 || !s2 || !(s1.includes(s2) || s2.includes(s1))) return { score: 0.1, det: {} };

    let score = 0.35;
    const p1 = Number(cand.precio || 0), p2 = Number(ref.precio || 0);
    const diffP = (p1 > 0 && p2 > 0) ? Math.abs(p1 - p2) / Math.max(p1, p2) : 1;
    if (diffP <= 0.05) score += 0.35;
    else if (diffP <= 0.15) score += 0.15;

    const m1 = Number(cand.metros_cuadrados || 0), m2 = Number(ref.metros_cuadrados || 0);
    const diffM = (m1 > 0 && m2 > 0) ? Math.abs(m1 - m2) / Math.max(m1, m2) : null;
    if (diffM !== null && diffM <= 0.10) score += 0.25;
    else if (m1 === 0 || m2 === 0) {
        if (diffP <= 0.02 && Number(cand.habitaciones || 0) === Number(ref.habitaciones || 0)) score += 0.20;
    }

    if (Number(cand.habitaciones || 0) === Number(ref.habitaciones || 0) &&
        Math.abs(Number(cand.banos || 0) - Number(ref.banos || 0)) <= 0.5) {
        score += 0.05;
    }

    return {
        score: Number(score.toFixed(3)),
        det: {
            diff_precio_pct: Number((diffP * 100).toFixed(2)),
            diff_m2_pct: diffM !== null ? Number((diffM * 100).toFixed(2)) : 'N/D'
        }
    };
}

async function runDeduplication(loteDir, repoRoot) {
    const procesadosDir = path.join(loteDir, 'procesados');
    const inPath = path.join(procesadosDir, 'inmuebles_extraidos.json');
    const data = JSON.parse(fs.readFileSync(inPath, 'utf8'));
    const candidatos = data.inmuebles || [];

    const { url, key } = loadSupabaseConfig(repoRoot);
    let existentesSb = [];
    try {
        const res = await fetch(`${url}/rest/v1/inmuebles?select=*`, {
            headers: { apikey: key, Authorization: `Bearer ${key}` }
        });
        if (res.ok) existentesSb = await res.json();
    } catch (e) {
        console.warn('[WARN] Aviso al consultar Supabase:', e.message);
    }

    const unicosIntra = [];
    const duplicadosDescartados = [];
    const dudososPausados = [];

    for (const cand of candidatos) {
        let dup = false;
        for (const u of unicosIntra) {
            const { score, det } = calcSimilarity(cand, u);
            if (score >= 0.85) {
                dup = true;
                duplicadosDescartados.push({
                    temp_id: cand.temp_id,
                    titulo: cand.titulo,
                    sector: cand.sector_nombre,
                    precio: cand.precio,
                    metros_cuadrados: cand.metros_cuadrados,
                    origen_duplicado: `Intra-Lote (Repetido con ${u.temp_id})`,
                    score,
                    detalles: det
                });
                break;
            }
        }
        if (!dup) unicosIntra.push(cand);
    }

    const unicosVerificados = [];
    for (const cand of unicosIntra) {
        let bestScore = 0, bestMatch = null, bestDet = {};
        for (const sbItem of existentesSb) {
            const { score, det } = calcSimilarity(cand, sbItem);
            if (score > bestScore) {
                bestScore = score;
                bestMatch = sbItem;
                bestDet = det;
            }
        }
        if (bestScore >= 0.85 && bestMatch) {
            duplicadosDescartados.push({
                temp_id: cand.temp_id,
                titulo: cand.titulo,
                sector: cand.sector_nombre,
                precio: cand.precio,
                metros_cuadrados: cand.metros_cuadrados,
                origen_duplicado: `Supabase BD (Código: ${bestMatch.codigo || bestMatch.id} - ${bestMatch.titulo})`,
                score: bestScore,
                detalles: bestDet
            });
        } else if (bestScore >= 0.65 && bestMatch) {
            dudososPausados.push({
                temp_id: cand.temp_id,
                motivo: `Similitud Dudosa con Supabase (Score: ${bestScore})`,
                score: bestScore,
                detalles: bestDet,
                candidato: cand,
                match_supabase: bestMatch
            });
        } else {
            unicosVerificados.push(cand);
        }
    }

    const out = {
        lote: path.basename(loteDir),
        fecha_deduplicacion: new Date().toISOString(),
        total_inmuebles_en_supabase_consultados: existentesSb.length,
        total_candidatos_entrada: candidatos.length,
        total_unicos_verificados: unicosVerificados.length,
        total_duplicados_descartados: duplicadosDescartados.length,
        total_dudosos_pausados: dudososPausados.length,
        unicos_verificados: unicosVerificados,
        duplicados_descartados: duplicadosDescartados,
        dudosos_pausados: dudososPausados
    };
    fs.writeFileSync(path.join(procesadosDir, 'inmuebles_deduplicados.json'), JSON.stringify(out, null, 2), 'utf8');
    return out;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const loteIdx = args.indexOf('--lote');
    if (loteIdx === -1 || !args[loteIdx + 1]) {
        console.log('Uso: node deduplicate_properties.js --lote <ruta_lote>');
        process.exit(0);
    }
    const loteDir = path.resolve(args[loteIdx + 1]);
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
    runDeduplication(loteDir, repoRoot).then(res => {
        console.log(`[OK] Deduplicación en vivo contra Supabase (${res.total_inmuebles_en_supabase_consultados} propiedades en BD): ${res.total_unicos_verificados} únicos, ${res.total_duplicados_descartados} duplicados, ${res.total_dudosos_pausados} dudosos.`);
    });
}
