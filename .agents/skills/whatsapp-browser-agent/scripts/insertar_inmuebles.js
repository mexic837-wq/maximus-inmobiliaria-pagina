#!/usr/bin/env node
/**
 * Inserta en Supabase los inmuebles YA INTERPRETADOS por el agente (inmuebles_agente.json).
 * Port a Node de insertar_inmuebles.py con estas correcciones:
 *  - Exige al menos 1 FOTO REAL subida (antes se insertaban sin fotos y quedaban con una foto de stock).
 *  - Valida que cada ruta de foto exista y que la imagen se pueda leer.
 *  - Deduplica contra Supabase Y dentro del mismo lote.
 *  - Si el duplicado existente NO tiene fotos reales, lo COMPLETA con las fotos nuevas (repara los "sin foto").
 *  - Genera la portada "Editorial MAXIMUS" (alquiler/venta) y la pone como foto_principal.
 *
 *   node insertar_inmuebles.js --json <lote>/inmuebles_agente.json [--maximus] [--dry-run] [--sin-portada]
 */
const fs = require('fs');
const path = require('path');
const { loadImage } = require('@napi-rs/canvas');

const ROOT = path.resolve(__dirname, '../../../..');
const SK = path.join(ROOT, '.agents', 'skills');
const { UBICACIONES_TACHIRA_REGLAS, normalizarTelefonoVE } = require(path.join(SK, 'whatsapp-property-parser/scripts/parse_whatsapp_batch.js'));
const { loadSupabaseConfig, getNextCorrelativo, buildPayload } = require(path.join(SK, 'maximus-supabase-publisher/scripts/publish_to_supabase.js'));
const { generarPortada, seleccionarFotos } = require(path.join(SK, 'property-image-cleaner/scripts/collage_maximus.js'));
const { separarCollage } = require(path.join(SK, 'property-image-cleaner/scripts/collage_split.js'));

const BUCKET = 'inmuebles-fotos';

/** Jaccard de palabras clave del título (sin palabras genéricas), 0..1. */
const GENERICAS = new Set(['casa', 'venta', 'alquiler', 'apartamento', 'local', 'comercial', 'terreno', 'galpon', 'galpón', 'parcela', 'oficina',
  'sector', 'urb', 'urbanizacion', 'urbanización', 'calle', 'avenida', 'carrera', 'para', 'con', 'en', 'del', 'de', 'la', 'el', 'los', 'las',
  'san', 'cristobal', 'cristóbal', 'tachira', 'táchira', 'inmueble', 'amplio', 'amplia', 'excelente', 'niveles', 'nivel', 'habitaciones']);
function similitudTitulo(a, b, zona = '') {
  const norm = t => String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '');
  const deZona = new Set(norm(zona).split(/[^a-z0-9]+/));
  const pal = t => new Set(String(t || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').split(/[^a-z0-9]+/)
    .filter(w => (w.length >= 4 || /^\d+$/.test(w)) && !GENERICAS.has(w) && !deZona.has(w)));
  const A = pal(a), B = pal(b);
  if (!A.size) return null; // título existente genérico: no aporta evidencia ni a favor ni en contra
  if (!B.size) return 0;
  let comun = 0; for (const w of A) if (B.has(w)) comun++;
  return comun / (A.size + B.size - comun);
}

/** Portada: piezas limpias (sin rótulos ni zonas planas) primero; la más grande va como foto principal. */
function elegirParaPortada(piezas, seleccionarFotos) {
  const nota = g => g.plana + (g.texto || 0) * 6 - Math.min(0.25, (g.img.width * g.img.height) / 4e6);
  const limpias = piezas.filter(g => (g.texto || 0) <= 0.04);
  const base = (limpias.length >= 2 ? limpias : piezas).slice().sort((a, b) => nota(a) - nota(b));
  const elegidas = seleccionarFotos(base.map(g => ({ url: g.url, img: g.img })));
  return elegidas.sort((a, b) => b.img.width * b.img.height - a.img.width * a.img.height);
}
const UBIC = Object.fromEntries(UBICACIONES_TACHIRA_REGLAS.map(u => [u.key, u]));
const TIPOS = { casa: 'casa', townhouse: 'casa', casa_de_campo: 'casa', apartamento: 'apartamento', departamento: 'apartamento',
  local: 'local', oficina: 'local', consultorio: 'local', galpon: 'galpon', terreno: 'terreno', parcela: 'terreno', lote: 'terreno',
  finca: 'terreno', fincas: 'terreno' };

const args = process.argv.slice(2);
const flag = n => args.includes(n);
const val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
const esFotoReal = u => /\/storage\/v1\/object\/public\//.test(u || '') && !/portada_maximus/.test(u);

async function main() {
  const jsonPath = path.resolve(val('--json') || '');
  if (!fs.existsSync(jsonPath)) throw new Error('Usa --json <ruta a inmuebles_agente.json>');
  const loteDir = path.dirname(jsonPath);
  let lista = JSON.parse(fs.readFileSync(jsonPath, 'utf8'));
  lista = Array.isArray(lista) ? lista : lista.inmuebles;
  const esMaximus = flag('--maximus') || /captaciones_maximus/.test(loteDir);
  const dry = flag('--dry-run');

  const cfg = loadSupabaseConfig(ROOT);
  if (!/eyJ/.test(cfg.key)) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env');
  const H = { apikey: cfg.key, Authorization: `Bearer ${cfg.key}` };
  const existentes = await (await fetch(`${cfg.url}/rest/v1/inmuebles?select=id,codigo,titulo,operacion,tipo,sector_nombre,precio,metros_cuadrados,fotos,foto_principal,habitaciones,banos,estacionamientos,ubicacion,estado`, { headers: H })).json();
  let corr = await getNextCorrelativo(cfg);
  const res = { insertados: [], completados: [], duplicados: [], pendientes: [] };
  console.log(`📦 ${lista.length} inmuebles | ${existentes.length} en Supabase | ${esMaximus ? 'MAXIMUS' : 'externas'}${dry ? ' | DRY-RUN' : ''}\n`);

  const subir = async (buf, rel, tipo = 'image/jpeg') => {
    const r = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${rel}`, { method: 'POST', headers: { ...H, 'Content-Type': tipo, 'x-upsert': 'true' }, body: buf });
    if (!r.ok) throw new Error(`Storage ${r.status}: ${(await r.text()).slice(0, 120)}`);
    return `${cfg.url}/storage/v1/object/public/${BUCKET}/${rel}`;
  };

  for (const [i, raw] of lista.entries()) {
    const n = i + 1;
    const op = String(raw.operacion || '').toLowerCase().trim();
    const tipo = TIPOS[String(raw.tipo || '').toLowerCase().trim().replace(/\s+/g, '_')];
    const precio = Number(String(raw.precio ?? '').replace(/[^\d.]/g, '')) || 0;
    const u = UBIC[String(raw.sector_clave || '').trim()];
    // Fotos: rutas locales (relativas al lote o absolutas) que existan y se puedan abrir
    const fotosLocales = [], vistas = new Set();
    for (const f of raw.fotos || []) {
      const p = path.isAbsolute(f) ? f : path.join(loteDir, f);
      if (!fs.existsSync(p)) continue;
      const buf = fs.readFileSync(p), h = require('crypto').createHash('sha1').update(buf).digest('hex');
      if (vistas.has(h)) continue; // misma foto reenviada dos veces
      vistas.add(h);
      try { const img = await loadImage(buf); fotosLocales.push({ p, img }); } catch {}
    }
    const faltan = [];
    if (!['venta', 'alquiler'].includes(op)) faltan.push('operacion');
    if (!tipo) faltan.push('tipo');
    if (precio <= 0) faltan.push('precio');
    if (!u) faltan.push('sector_clave');
    if (!fotosLocales.length) faltan.push('fotos');
    // Teléfono: si viene, debe ser un número venezolano completo (+58 4XX XXXXXXX); uno cortado/abreviado se rechaza
    if (raw.asesor_telefono && String(normalizarTelefonoVE(raw.asesor_telefono) || raw.asesor_telefono).replace(/\D/g, '').length !== 12) faltan.push('asesor_telefono (completo, copiado de mensajes.json)');
    if (faltan.length) { res.pendientes.push({ n, titulo: raw.titulo, faltan, texto_original: raw.texto_original }); console.log(`  ⏸️  [${n}] ${raw.titulo || '(sin título)'} → falta: ${faltan.join(', ')}`); continue; }

    const inm = { ...raw, operacion: op, precio, tipo_sql_dashboard: tipo, tipo_sql_canonical: tipo,
      sector_nombre: u.label, ubicacion: `${u.label}, ${u.municipio}, Táchira`, estado: 'Táchira',
      sector_desc: `Sector residencial ${u.label}, Municipio ${u.municipio}, Estado Táchira.`,
      asesor_telefono: raw.asesor_telefono ? (normalizarTelefonoVE(raw.asesor_telefono) || raw.asesor_telefono) : raw.asesor_telefono,
      is_maximus: esMaximus, modo_entrada: 'agente_whatsapp_node', grupo_origen: raw.grupo_origen || 'WhatsApp Web',
      moneda: op === 'alquiler' ? 'USD/mes' : 'USD' };
    inm.titulo = inm.titulo || `${tipo[0].toUpperCase() + tipo.slice(1)} en ${u.label}`;

    // Duplicado: misma operación + tipo + sector + precio ±5 %, Y además una evidencia de que es el mismo inmueble:
    // m² que coinciden (±10 %) o títulos con palabras clave en común. m² que difieren > 10 % = inmuebles distintos.
    const candidatos = existentes.filter(e => e.operacion === op && e.tipo === tipo && (e.sector_nombre || '').toLowerCase() === u.label.toLowerCase()
      && Math.abs((+e.precio || 0) - precio) <= Math.max(+e.precio || 0, 1) * 0.05)
      .map(e => {
        const ambos = +e.metros_cuadrados > 0 && +inm.metros_cuadrados > 0;
        const m2ok = ambos && Math.abs(e.metros_cuadrados - inm.metros_cuadrados) <= e.metros_cuadrados * 0.10;
        // mismas habitaciones con precio casi idéntico (±2 %) también cuenta (títulos viejos genéricos: "Casa en Pueblo Nuevo")
        const habOk = +e.habitaciones > 0 && +e.habitaciones === +inm.habitaciones && Math.abs((+e.precio || 0) - precio) <= Math.max(+e.precio || 0, 1) * 0.02;
        return { e, sim: similitudTitulo(e.titulo, inm.titulo, `${u.label} ${u.municipio}`), m2ok, habOk, m2choque: ambos && !m2ok };
      })
      .filter(c => !c.m2choque && (c.m2ok || c.habOk || c.sim >= 0.25
        || (c.sim === null && Math.abs((+c.e.precio || 0) - precio) <= Math.max(+c.e.precio || 0, 1) * 0.01)))
      .sort((a, b) => (b.sim ?? 0) - (a.sim ?? 0));
    const sinFoto = c => !(c.e.fotos || []).some(esFotoReal);
    // Para COMPLETAR fotos de uno sin foto se exige coincidencia de título (evita ponerle fotos de otro local parecido)
    // `"forzar_nuevo": true` en el JSON = el usuario confirmó que NO es duplicado (se inserta igual)
    const cand = raw.forzar_nuevo ? null : candidatos.find(c => !sinFoto(c)) || candidatos.find(c => sinFoto(c) && c.sim >= 0.25);
    const dup = cand && cand.e;
    const completar = dup && sinFoto(cand);
    if (dup && !completar) { res.duplicados.push({ n, titulo: inm.titulo, existente: dup.codigo }); console.log(`  🔁 [${n}] ${inm.titulo} → duplicado de ${dup.codigo}`); continue; }

    const codigo = completar ? dup.codigo : `#MAX-${corr++}`;
    if (dry) { console.log(`  [DRY] [${n}] ${completar ? 'COMPLETAR ' + codigo : codigo} ${inm.titulo} $${precio} (${u.label}) ${fotosLocales.length} fotos`); (completar ? res.completados : res.insertados).push(codigo); if (!completar) existentes.push({ ...inm, tipo, codigo, fotos: ['x/storage/v1/object/public/x'] }); continue; }

    try {
      const carpeta = `whatsapp/${esMaximus ? 'maximus' : 'externas'}/${codigo.replace(/\W/g, '')}_${Date.now()}`;
      // Galería: cada collage se separa en fotos individuales (_01, _02...) y el flyer completo se conserva al final (_collage)
      const piezas = [], flyers = [];
      for (const [k, f] of fotosLocales.entries()) {
        const buf = fs.readFileSync(f.p), base = `foto_${String(k + 1).padStart(2, '0')}`;
        const partes = flag('--sin-collage') ? [] : await separarCollage(buf, { esMaximus }).catch(() => []);
        if (partes.length) {
          for (const [j, p] of partes.entries()) piezas.push({ buf: p.buf, img: await loadImage(p.buf), nombre: `${base}_${String(j + 1).padStart(2, '0')}.jpg`, plana: p.plana, texto: p.texto });
          flyers.push({ buf, img: f.img, nombre: `${base}_collage${path.extname(f.p) || '.jpg'}` });
        } else piezas.push({ buf, img: f.img, nombre: `${base}${path.extname(f.p) || '.jpg'}`, plana: 0.3, texto: 0 });
      }
      const galeria = [...piezas, ...flyers];
      const urls = [];
      for (const g of galeria) { g.url = await subir(g.buf, `${carpeta}/${g.nombre}`); urls.push(g.url); }
      if (flyers.length) console.log(`     ✂️  ${flyers.length} collage(s) separados → ${piezas.length} fotos`);
      let fotos = urls;
      if (!flag('--sin-portada')) {
        // Portada: preferir las piezas con más aspecto de foto (menos zonas planas/rótulos), excluyendo flyers completos
        const elegidas = elegirParaPortada(piezas, seleccionarFotos);
        const jpg = await generarPortada((elegidas.length ? elegidas : [{ img: galeria[0].img }]).map(e => e.img), { ...inm, tipo, codigo });
        fotos = [await subir(jpg, `${carpeta}/portada_maximus.jpg`), ...urls];
      }
      if (completar) {
        const r = await fetch(`${cfg.url}/rest/v1/inmuebles?id=eq.${dup.id}`, { method: 'PATCH', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify({ fotos, foto_principal: fotos[0] }) });
        if (!r.ok) throw new Error(`PATCH ${r.status} ${await r.text()}`);
        dup.fotos = fotos; res.completados.push(codigo); console.log(`  🖼️  [${n}] ${codigo} ${inm.titulo} → fotos completadas (${piezas.length})`);
      } else {
        const payload = buildPayload({ ...inm, fotos }, codigo, esMaximus, true, true);
        payload.foto_principal = fotos[0];
        const r = await fetch(`${cfg.url}/rest/v1/inmuebles?on_conflict=codigo`, { method: 'POST', headers: { ...H, 'Content-Type': 'application/json', Prefer: 'resolution=merge-duplicates,return=minimal' }, body: JSON.stringify(payload) });
        if (!r.ok) throw new Error(`INSERT ${r.status} ${await r.text()}`);
        existentes.push({ ...payload });
        res.insertados.push(codigo); console.log(`  ✅ [${n}] ${codigo} ${inm.titulo} $${precio} | ${piezas.length} fotos`);
      }
    } catch (e) { res.pendientes.push({ n, titulo: inm.titulo, error: e.message }); console.log(`  ❌ [${n}] ${inm.titulo} → ${e.message}`); }
  }
  fs.writeFileSync(jsonPath.replace(/\.json$/, '.resultado.json'), JSON.stringify(res, null, 2));
  console.log(`\n✨ insertados=${res.insertados.length} | completados(sin foto→con foto)=${res.completados.length} | duplicados=${res.duplicados.length} | pendientes=${res.pendientes.length}`);
}
if (require.main === module) main().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

module.exports = { elegirParaPortada, similitudTitulo };
