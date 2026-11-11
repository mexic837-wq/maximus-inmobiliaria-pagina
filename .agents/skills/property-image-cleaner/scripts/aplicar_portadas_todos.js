#!/usr/bin/env node
/**
 * Aplica la portada "Editorial MAXIMUS" a TODOS los inmuebles de Supabase.
 *
 *   node aplicar_portadas_todos.js --muestra 6        # genera 6 portadas locales (no toca Supabase)
 *   node aplicar_portadas_todos.js --todos-local      # genera todas localmente (no toca Supabase)
 *   node aplicar_portadas_todos.js --aplicar          # sube y actualiza (requiere SUPABASE_SERVICE_ROLE_KEY en .env)
 *   node aplicar_portadas_todos.js --aplicar --codigo "#MAX-165"   # solo uno
 *
 * Antes de escribir guarda un respaldo (foto_principal + fotos originales) en portadas_maximus_out/respaldo_*.json.
 * Las fotos originales se conservan en la galería: fotos = [portada, ...originales].
 */
const fs = require('fs');
const path = require('path');
const { loadImage } = require('@napi-rs/canvas');
const { generarPortada, seleccionarFotos, plantillaPara, CFG } = require('./collage_maximus');

const ROOT = path.resolve(__dirname, '../../../..');
const OUT = path.join(ROOT, 'portadas_maximus_out');
const BUCKET = 'inmuebles-fotos';
const args = process.argv.slice(2);
const flag = n => args.includes(n);
const val = n => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };

function config() {
  const env = {};
  const envFile = path.join(ROOT, '.env');
  if (fs.existsSync(envFile)) for (const l of fs.readFileSync(envFile, 'utf8').split(/\r?\n/)) {
    const m = l.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/); if (m) env[m[1]] = m[2].replace(/^['"]|['"]$/g, '');
  }
  const js = fs.readFileSync(path.join(ROOT, 'js', 'config.js'), 'utf8');
  const url = (env.SUPABASE_URL || js.match(/SUPABASE_URL\s*:\s*['"]([^'"]+)['"]/)[1]).replace(/\/$/, '');
  global.atob = global.atob || (s => Buffer.from(s, 'base64').toString());
  const anon = env.SUPABASE_ANON_KEY || eval(js.match(/SUPABASE_ANON_KEY:\s*(\(function[\s\S]*?\}\)\(\))/)[1]);
  return { url, anon, service: env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || '' };
}

const hdr = k => ({ apikey: k, Authorization: `Bearer ${k}` });

async function descargar(u) {
  const r = await fetch(u); if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return loadImage(Buffer.from(await r.arrayBuffer()));
}

async function main() {
  const cfg = config();
  const aplicar = flag('--aplicar');
  const key = aplicar ? cfg.service : cfg.anon;
  if (aplicar && !cfg.service) { console.error('Falta SUPABASE_SERVICE_ROLE_KEY en .env'); process.exit(1); }
  fs.mkdirSync(OUT, { recursive: true });

  let q = `${cfg.url}/rest/v1/inmuebles?select=*&order=codigo`;
  if (val('--codigo')) q += `&codigo=eq.${encodeURIComponent(val('--codigo'))}`;
  let inms = await (await fetch(q, { headers: hdr(key) })).json();
  if (!Array.isArray(inms)) throw new Error(JSON.stringify(inms));
  if (val('--muestra')) {
    const n = +val('--muestra');
    const alq = inms.filter(i => plantillaPara(i.operacion) === 'alquiler'), ven = inms.filter(i => plantillaPara(i.operacion) === 'venta');
    inms = [...alq.slice(0, Math.ceil(n / 2)), ...ven.slice(0, Math.floor(n / 2))];
  }
  console.log(`Inmuebles: ${inms.length} | modo: ${aplicar ? 'APLICAR EN SUPABASE' : 'solo local'}`);

  if (aplicar) {
    const f = path.join(OUT, `respaldo_${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
    fs.writeFileSync(f, JSON.stringify(inms.map(i => ({ id: i.id, codigo: i.codigo, foto_principal: i.foto_principal, fotos: i.fotos, portada_collage: i.portada_collage })), null, 2));
    console.log('Respaldo:', f);
  }

  const res = { ok: 0, sin_fotos: 0, error: 0, errores: [] };
  for (const inm of inms) {
    const tag = `${inm.codigo || inm.id}`;
    try {
      const portadaPrev = /portada_maximus/i.test(inm.foto_principal || '') ? inm.foto_principal : null;
      const originales = [...new Set([inm.foto_principal, ...(inm.fotos || [])].filter(u => u && !/portada_maximus/i.test(u) && /\/storage\/v1\/object\/public\//.test(u)))]; // nunca fotos de stock (unsplash)
      const items = [];
      for (const u of originales) { try { items.push({ url: u, img: await descargar(u) }); } catch {} }
      let elegidas = seleccionarFotos(items);
      if (!elegidas.length && items.length) elegidas = [items.find(i => !/_collage/i.test(i.url)) || items[0]];
      if (!elegidas.length) { res.sin_fotos++; console.log(`  - ${tag}: sin fotos, se omite`); continue; }

      const jpg = await generarPortada(elegidas.map(e => e.img), inm);
      const nombreLocal = `${String(tag).replace(/[^\w-]/g, '')}_${plantillaPara(inm.operacion)}.jpg`;
      fs.writeFileSync(path.join(OUT, nombreLocal), jpg);

      if (aplicar) {
        const rel = `portadas/${inm.id}/portada_maximus.jpg`;
        const up = await fetch(`${cfg.url}/storage/v1/object/${BUCKET}/${rel}`, {
          method: 'POST', headers: { ...hdr(key), 'Content-Type': 'image/jpeg', 'x-upsert': 'true' }, body: jpg });
        if (!up.ok) throw new Error(`upload ${up.status} ${await up.text()}`);
        const pub = `${cfg.url}/storage/v1/object/public/${BUCKET}/${rel}?v=${Date.now()}`;
        const cuerpo = { foto_principal: pub, fotos: [pub, ...originales] };
        const pr = await fetch(`${cfg.url}/rest/v1/inmuebles?id=eq.${inm.id}`, {
          method: 'PATCH', headers: { ...hdr(key), 'Content-Type': 'application/json', Prefer: 'return=minimal' }, body: JSON.stringify(cuerpo) });
        if (!pr.ok) throw new Error(`update ${pr.status} ${await pr.text()}`);
      }
      res.ok++; console.log(`  ✓ ${tag} (${plantillaPara(inm.operacion)}, ${elegidas.length} fotos)${portadaPrev ? ' [regenerada]' : ''}`);
    } catch (e) {
      res.error++; res.errores.push({ codigo: tag, error: String(e.message || e) }); console.log(`  ✗ ${tag}: ${e.message}`);
    }
  }
  fs.writeFileSync(path.join(OUT, 'reporte.json'), JSON.stringify(res, null, 2));
  console.log(`\nListo: ${res.ok} ok, ${res.sin_fotos} sin fotos, ${res.error} errores. Salida: ${OUT}`);
}

main().catch(e => { console.error(e); process.exit(1); });
