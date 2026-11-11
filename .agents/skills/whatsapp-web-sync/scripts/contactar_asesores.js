#!/usr/bin/env node
/**
 * Contacto directo con el asesor que publicó un inmueble con una sola foto, para pedirle toda la info y las fotos.
 *
 *   node contactar_asesores.js preparar [--max 15]          # arma la lista (NO envía nada) → agente_whatsapp/contactos/borrador.json
 *   node contactar_asesores.js enviar --confirmo [--max 15]  # envía SOLO lo aprobado en borrador.json (con pausas)
 *   node contactar_asesores.js respuestas [--dias 7]         # lee lo que respondieron (texto + fotos HD) → lote nuevo
 *   node contactar_asesores.js respuestas --responder --confirmo   # además contesta "¿quién eres?" con el texto fijo
 *
 * Reglas (protegen el número de WhatsApp y a los colegas):
 *  - Nunca se envía nada sin `--confirmo` y sin que el contacto esté `"aprobado": true` en borrador.json.
 *  - 1 mensaje por asesor (agrupa sus inmuebles), nunca se repite a quien ya se contactó (historial.json).
 *  - Tope diario (por defecto 15) y pausa aleatoria de 60–150 s entre mensajes.
 *  - Si preguntan quién es: "asistente virtual de José Guerrero"; no se hace pasar por una persona.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const DIR = path.join(ROOT, 'agente_whatsapp', 'contactos');
const BORRADOR = path.join(DIR, 'borrador.json');
const HISTORIAL = path.join(DIR, 'historial.json');
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = n => argv.includes(n);
const val = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const guardar = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
const hoy = () => new Date().toISOString().slice(0, 10);

// Textos (editables aquí)
const SALUDO = nombre => `Hola${nombre ? ' ' + nombre : ''}, ¿cómo estás? 😊`;
const MAX_POR_MENSAJE = 4;
const PEDIDO = lista => lista.length === 1
  ? `¿Me puedes compartir la información completa y las fotos del inmueble "${lista[0]}" para publicarlo?`
  : `¿Me puedes compartir la información completa y las fotos de estos inmuebles para publicarlos?\n${lista.slice(0, MAX_POR_MENSAJE).map(t => '• ' + t).join('\n')}`
    + (lista.length > MAX_POR_MENSAJE ? `\n…y ${lista.length - MAX_POR_MENSAJE} más que publicaste.` : '');
const QUIEN_SOY = 'De parte del asistente virtual de José Guerrero, de MAXIMUS Inmobiliaria. 😊';
const PREGUNTA_QUIEN = /qui[eé]n (eres|es|habla|me escribe)|con qui[eé]n (hablo|tengo el gusto)|de parte de qui[eé]n|qui[eé]n sos/i;

const soloDigitos = t => String(t || '').replace(/\D/g, '');
const esNombrePersona = n => n && !/asesor|aliado|externo|inmobiliaria|maximus|\d/i.test(n) && n.length <= 25;

function config() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const key = (env.match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/) || [])[1];
  const url = ((env.match(/SUPABASE_URL=(\S+)/) || [])[1] || 'https://db.maximusinmobiliaria.tech').replace(/\/$/, '');
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env');
  return { url, H: { apikey: key, Authorization: `Bearer ${key}` } };
}

/** Inmuebles externos con 1 sola foto real (sin contar portada ni flyer completo) y con teléfono del asesor. */
async function preparar() {
  const { url, H } = config();
  const rows = await (await fetch(`${url}/rest/v1/inmuebles?select=codigo,titulo,operacion,precio,fotos,asesor_nombre,asesor_telefono,is_maximus&is_maximus=eq.false`, { headers: H })).json();
  const historial = leer(HISTORIAL, []);
  const yaContactados = new Set(historial.map(h => h.telefono));
  const porTel = new Map();
  for (const r of rows) {
    const reales = (r.fotos || []).filter(u => /\/storage\/v1\/object\/public\//.test(u) && !/portada_maximus|_collage/.test(u));
    const tel = soloDigitos(r.asesor_telefono);
    if (reales.length > 1 || !/^58\d{10}$/.test(tel) || tel.endsWith('1234567') || yaContactados.has(tel)) continue;
    const e = porTel.get(tel) || { telefono: tel, asesor_nombre: r.asesor_nombre || '', inmuebles: [] };
    e.inmuebles.push({ codigo: r.codigo, titulo: r.titulo, precio: r.precio, operacion: r.operacion });
    porTel.set(tel, e);
  }
  const max = +val('--max', 15);
  const lista = [...porTel.values()].slice(0, max).map(e => {
    const nombre = esNombrePersona(e.asesor_nombre) ? e.asesor_nombre.split(' ')[0] : '';
    return { ...e, aprobado: false, mensaje: `${SALUDO(nombre)}\n${PEDIDO(e.inmuebles.map(i => i.titulo))}` };
  });
  guardar(BORRADOR, { creado: new Date().toISOString(), nota: 'Revisa cada mensaje y pon "aprobado": true en los que quieras enviar. Luego: enviar --confirmo', contactos: lista });
  console.log(`Borrador: ${lista.length} asesores (de ${porTel.size} posibles) → ${path.relative(ROOT, BORRADOR)}`);
  lista.slice(0, 5).forEach(c => console.log(`\n→ +${c.telefono} (${c.inmuebles.map(i => i.codigo).join(', ')})\n${c.mensaje}`));
}

async function abrirChatTelefono(page, tel) {
  await page.goto(`https://web.whatsapp.com/send?phone=${tel}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const caja = page.locator('footer [contenteditable="true"]').first();
  await caja.waitFor({ timeout: 60000 });
  return caja;
}

async function enviar() {
  if (!flag('--confirmo')) return console.log('No se envió nada. Para enviar los contactos aprobados en borrador.json usa: enviar --confirmo');
  const b = leer(BORRADOR, null); if (!b) return console.log('No hay borrador. Ejecuta primero: preparar');
  const historial = leer(HISTORIAL, []);
  const enviadosHoy = historial.filter(h => h.fecha === hoy()).length;
  const max = Math.max(0, +val('--max', 15) - enviadosHoy);
  const cola = b.contactos.filter(c => c.aprobado === true && !historial.some(h => h.telefono === c.telefono)).slice(0, max);
  if (!cola.length) return console.log(`Nada que enviar (aprobados pendientes: 0, o tope diario alcanzado: ${enviadosHoy} hoy).`);
  const { abrir, sleep } = require('./captura_whatsapp.js');
  const { ctx, page } = await abrir();
  try {
    for (const [i, c] of cola.entries()) {
      try {
        const caja = await abrirChatTelefono(page, c.telefono);
        const lineas = c.mensaje.split('\n');
        await caja.click();
        for (const [k, l] of lineas.entries()) { await page.keyboard.type(l, { delay: 25 }); if (k < lineas.length - 1) await page.keyboard.press('Shift+Enter'); }
        await page.keyboard.press('Enter');
        await sleep(2500);
        historial.push({ telefono: c.telefono, asesor_nombre: c.asesor_nombre, inmuebles: c.inmuebles.map(x => x.codigo), fecha: hoy(), enviado: new Date().toISOString(), respondio_quien: false });
        guardar(HISTORIAL, historial);
        console.log(`✓ ${i + 1}/${cola.length} +${c.telefono}`);
      } catch (e) { console.log(`✗ +${c.telefono}: ${e.message.slice(0, 100)}`); }
      if (i < cola.length - 1) await sleep(60000 + Math.random() * 90000);
    }
  } finally { await ctx.close(); }
}

async function respuestas() {
  const historial = leer(HISTORIAL, []);
  if (!historial.length) return console.log('Todavía no se ha contactado a nadie.');
  if (flag('--responder') && !flag('--confirmo')) return console.log('Para contestar "¿quién eres?" automáticamente agrega --confirmo.');
  const { abrir, leerMensajes, descargarFotosHD, sleep } = require('./captura_whatsapp.js');
  const lote = path.join(ROOT, 'agente_whatsapp', 'proyectos', 'captaciones_externas', `contactos_directos_${hoy().replace(/-/g, '_')}`);
  const { ctx, page } = await abrir();
  const salida = [];
  try {
    for (const h of historial) {
      try {
        await abrirChatTelefono(page, h.telefono); await sleep(2500);
        const r = await leerMensajes(page, +val('--dias', 7), 200);
        if (r.error) continue;
        const desde = h.enviado.slice(0, 10);
        const suyos = r.mensajes.filter(m => (m.fecha || '') >= desde && !m.es_mio && m.remitente && !/^(t[uú]|you)$/i.test(m.remitente));
        if (!suyos.length) continue;
        const carpeta = path.join(lote, h.telefono); fs.mkdirSync(carpeta, { recursive: true });
        let i = 0;
        for (const m of suyos) { i++; m.imagenes = m.n_imagenes ? await descargarFotosHD(page, m, carpeta, i).catch(() => []) : []; }
        if (flag('--responder') && !h.respondio_quien && suyos.some(m => PREGUNTA_QUIEN.test(m.texto))) {
          const caja = page.locator('footer [contenteditable="true"]').first();
          await caja.click(); await page.keyboard.type(QUIEN_SOY, { delay: 25 }); await page.keyboard.press('Enter');
          h.respondio_quien = true; guardar(HISTORIAL, historial); console.log(`  ↩ +${h.telefono}: respondido "${QUIEN_SOY}"`);
        }
        guardar(path.join(carpeta, 'mensajes.json'), { grupo: `Contacto directo +${h.telefono}`, origen: 'contacto_directo', inmuebles_solicitados: h.inmuebles, mensajes: suyos });
        salida.push({ telefono: h.telefono, mensajes: suyos.length, fotos: suyos.reduce((a, m) => a + m.imagenes.length, 0) });
        console.log(`✓ +${h.telefono}: ${suyos.length} mensajes, ${salida.at(-1).fotos} fotos`);
      } catch (e) { console.log(`✗ +${h.telefono}: ${e.message.slice(0, 100)}`); }
    }
  } finally { await ctx.close(); }
  console.log(salida.length ? `\nRespuestas guardadas en ${path.relative(ROOT, lote)} (una carpeta por asesor). Procésalas con el agente captador-whatsapp.` : '\nNadie ha respondido todavía.');
}

const cmds = { preparar, enviar, respuestas };
if (!cmds[cmd]) console.log('Uso: node contactar_asesores.js <preparar|enviar --confirmo|respuestas [--responder --confirmo]> [--max 15]');
else cmds[cmd]().catch(e => { console.error('ERROR:', e.message); process.exit(1); });
