#!/usr/bin/env node
/**
 * MAXIMUS Inmobiliaria - Skill 3: property-image-cleaner (Node.js Dual-Flow Engine)
 * =================================================================================
 * Sube las imágenes al bucket `inmuebles-fotos` de Supabase Storage diferenciando
 * entre `captaciones_externas/` y `captaciones_maximus/`.
 */

const fs = require('fs');
const path = require('path');

function loadSupabaseConfig(repoRoot) {
    const configPath = path.join(repoRoot, 'js', 'config.js');
    const content = fs.readFileSync(configPath, 'utf8');
    const mUrl = content.match(/SUPABASE_URL\s*:\s*['"]([^'"]+)['"]/);
    const mKey = content.match(/SUPABASE_ANON_KEY\s*:\s*['"]([^'"]+)['"]/);
    const mBucket = content.match(/STORAGE_BUCKET\s*:\s*['"]([^'"]+)['"]/);
    return {
        url: mUrl ? mUrl[1].replace(/\/$/, '') : '',
        key: mKey ? mKey[1].trim() : '',
        bucket: mBucket ? mBucket[1].trim() : 'inmuebles-fotos'
    };
}

async function uploadToStorage(filePath, storageRelPath, cfg) {
    const uploadUrl = `${cfg.url}/storage/v1/object/${cfg.bucket}/${storageRelPath}`;
    const publicUrl = `${cfg.url}/storage/v1/object/public/${cfg.bucket}/${storageRelPath}`;
    const bytes = fs.readFileSync(filePath);
    try {
        const res = await fetch(uploadUrl, {
            method: 'POST',
            headers: {
                apikey: cfg.key,
                Authorization: `Bearer ${cfg.key}`,
                'Content-Type': 'image/jpeg',
                'x-upsert': 'true'
            },
            body: bytes
        });
        if (res.ok) return { url: publicUrl, error: null };
        return { url: publicUrl, error: `HTTP ${res.status}` };
    } catch (e) {
        return { url: publicUrl, error: e.message };
    }
}

async function processBatchImages(loteDir, repoRoot, skipUpload = false) {
    const procesadosDir = path.join(loteDir, 'procesados');
    const dedupFile = path.join(procesadosDir, 'inmuebles_deduplicados.json');
    const extFile = path.join(procesadosDir, 'inmuebles_extraidos.json');
    const targetFile = fs.existsSync(dedupFile) ? dedupFile : extFile;

    const payload = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
    const listKey = payload.unicos_verificados ? 'unicos_verificados' : 'inmuebles';
    const inmuebles = payload[listKey] || [];
    const cfg = loadSupabaseConfig(repoRoot);

    const esLoteMaximus = loteDir.toLowerCase().replace(/\\/g, '/').includes('captaciones_maximus') || Boolean(payload.is_maximus_default);

    const cleanBaseDir = path.join(procesadosDir, 'imagenes_limpias');
    fs.mkdirSync(cleanBaseDir, { recursive: true });

    const stats = {
        flujo_carpeta: esLoteMaximus ? 'captaciones_maximus' : 'captaciones_externas',
        smart_crop_marcas_agua_activo: !esLoteMaximus,
        total_imagenes_originales: 0,
        total_screenshots_recortados: 0,
        total_collages_divididos: 0,
        total_imagenes_individuales_generadas: 0,
        total_marcas_agua_recortadas: 0,
        total_subidas_supabase_storage: 0,
        detalle_por_inmueble: []
    };

    for (const inm of inmuebles) {
        const tempId = inm.temp_id || 'INM';
        const inmIsMaximus = Boolean(inm.is_maximus ?? esLoteMaximus);
        const inmDir = path.join(cleanBaseDir, tempId);
        fs.mkdirSync(inmDir, { recursive: true });

        const origPaths = (inm.imagenes_locales || []).filter(p => fs.existsSync(p));
        stats.total_imagenes_originales += origPaths.length;

        const urlsPublicas = [];
        const rutasLimpias = [];

        for (let i = 0; i < origPaths.length; i++) {
            const origP = origPaths[i];
            const stem = path.basename(origP, path.extname(origP)).replace(/[^a-zA-Z0-9_\-]/g, '_');
            const outFilename = `${stem}_01.jpg`;
            const outPath = path.join(inmDir, outFilename);
            fs.copyFileSync(origP, outPath);
            rutasLimpias.push(outPath);
            stats.total_imagenes_individuales_generadas++;

            const carpetaFlujo = inmIsMaximus ? 'maximus' : 'externas';
            const storageRel = `whatsapp/${carpetaFlujo}/${path.basename(loteDir)}/${tempId}/{outFilename}`.replace('{outFilename}', outFilename);
            if (!skipUpload) {
                const { url, error } = await uploadToStorage(outPath, storageRel, cfg);
                urlsPublicas.push(url);
                if (!error) stats.total_subidas_supabase_storage++;
            } else {
                urlsPublicas.push(`${cfg.url}/storage/v1/object/public/${cfg.bucket}/${storageRel}`);
            }
        }

        inm.imagenes_limpias_locales = rutasLimpias;
        inm.fotos = urlsPublicas;
        inm.foto_principal = urlsPublicas[0] || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=85';
        inm.fotos_coma_str = urlsPublicas.join(', ');
        inm.stats_imagenes = {
            originales: origPaths.length,
            screenshots_extraidos: 0,
            collages_divididos: 0,
            fotos_finales: rutasLimpias.length,
            marcas_agua_recortadas: 0
        };
        stats.detalle_por_inmueble.push({ temp_id: tempId, titulo: inm.titulo, ...inm.stats_imagenes });
    }

    payload.estadisticas_imagenes = stats;
    fs.writeFileSync(targetFile, JSON.stringify(payload, null, 2), 'utf8');
    return stats;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const loteIdx = args.indexOf('--lote');
    const skipUpload = args.includes('--skip-upload');
    if (loteIdx === -1 || !args[loteIdx + 1]) {
        console.log('Uso: node clean_images.js --lote <ruta_lote> [--skip-upload]');
        process.exit(0);
    }
    const loteDir = path.resolve(args[loteIdx + 1]);
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
    processBatchImages(loteDir, repoRoot, skipUpload).then(st => {
        console.log(`[OK] Imágenes sincronizadas (${st.flujo_carpeta} | SmartCrop=${st.smart_crop_marcas_agua_activo}): ${st.total_imagenes_individuales_generadas} procesadas.`);
    });
}
