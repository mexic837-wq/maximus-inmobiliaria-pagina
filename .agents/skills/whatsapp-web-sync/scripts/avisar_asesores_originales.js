#!/usr/bin/env node
/**
 * Aviso a los asesores ORIGINALES de los inmuebles captados de los grupos de WhatsApp.
 *
 * Contexto: los inmuebles que sube el agente captador se publican con José Guerrero
 * (equipo MAXIMUS) como contacto. El asesor que los publicó en el grupo queda guardado
 * en privado (tabla inmuebles_asesor_original). Este script le avisa que su inmueble ya
 * está en la web y le ofrece el plan Bronce: si paga con el MISMO número, sus inmuebles
 * pasan a su nombre automáticamente (reclamar_inmuebles_capturados).
 *
 *   node avisar_asesores_originales.js preparar [--max 15]            # arma el borrador (NO envía nada)
 *   node avisar_asesores_originales.js preparar --auto [--max 15]     # igual, pero ya aprobado
 *   node avisar_asesores_originales.js enviar --confirmo [--max 15]   # envía SOLO lo aprobado (con pausas)
 *   node avisar_asesores_originales.js auto --confirmo [--max 15]     # preparar --auto + enviar (para programarlo a diario)
 *
 * Reglas (protegen tu número de WhatsApp y a los colegas):
 *  - Nada sale sin `--confirmo`.
 *  - 1 mensaje por asesor (agrupa todos sus inmuebles) y una sola vez: la base marca
 *    avisado_at y ese asesor no vuelve a salir en la lista.
 *  - Tope diario (por defecto 15) y pausa aleatoria de 60–150 s entre mensajes.
 *  - El mensaje se presenta como "asistente virtual de José Guerrero"; no se hace pasar por una persona.
 *  - Solo dice que hay clientes interesados si de verdad hay consultas en el CRM.
 *
 * Requiere el SQL pendiente (Parte 6) y SUPABASE_SERVICE_ROLE_KEY en .env.
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '../../../..');
const DIR = path.join(ROOT, 'agente_whatsapp', 'contactos');
const BORRADOR = path.join(DIR, 'avisos_borrador.json');
const HISTORIAL = path.join(DIR, 'avisos_historial.json');
const SITIO = 'https://maximusinmobiliaria.tech';
const argv = process.argv.slice(2);
const cmd = argv[0];
const flag = n => argv.includes(n);
const val = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const leer = (f, d) => { try { return JSON.parse(fs.readFileSync(f, 'utf8')); } catch { return d; } };
const guardar = (f, o) => { fs.mkdirSync(path.dirname(f), { recursive: true }); fs.writeFileSync(f, JSON.stringify(o, null, 2)); };
const hoy = () => new Date().toISOString().slice(0, 10);
const esNombrePersona = n => n && !/asesor|aliado|externo|inmobiliaria|maximus|bienes|\d/i.test(n) && n.length <= 25;

// ---------- Texto del mensaje (editable aquí) ----------
const MAX_TITULOS = 3;
function armarMensaje(c) {
  const nombre = esNombrePersona(c.nombre) ? ' ' + c.nombre.trim().split(/\s+/)[0] : '';
  const inm = Array.isArray(c.inmuebles) ? c.inmuebles : [];
  const uno = inm.length === 1;
  const enlace = i => `${SITIO}/detalle-propiedad?id=${encodeURIComponent(i.id)}`;

  const publicados = uno
    ? `Tu inmueble "${inm[0].titulo}" ya está publicado en nuestra web:\n${enlace(inm[0])}`
    : `Tus ${inm.length} inmuebles ya están publicados en nuestra web:\n` +
      inm.slice(0, MAX_TITULOS).map(i => `• ${i.titulo}\n  ${enlace(i)}`).join('\n') +
      (inm.length > MAX_TITULOS ? `\n…y ${inm.length - MAX_TITULOS} más.` : '');

  // Solo se menciona interés si es real (consultas registradas en el CRM)
  const interes = c.consultas > 0
    ? `Ya ${c.consultas === 1 ? 'tenemos 1 cliente interesado' : `tenemos ${c.consultas} clientes interesados`} en ${uno ? 'él' : 'ellos'}.`
    : `Ya ${uno ? 'está visible' : 'están visibles'} para compradores de todo el Táchira.`;

  return [
    `Hola${nombre}, ¿cómo estás? 😊 Te escribe el asistente virtual de José Guerrero, de MAXIMUS Inmobiliaria.`,
    '',
    publicados,
    '',
    interes,
    `Por ahora a los clientes los atiende nuestro equipo. Con el plan *Bronce* (US$ 2.99 al mes, y tu primer pago te da 2 meses) ${uno ? 'el inmueble pasa' : 'los inmuebles pasan'} a tu nombre y los clientes te escriben directo a ti:`,
    `${SITIO}/#planes`,
    '',
    'Importante: regístrate con este mismo número de WhatsApp para que se te asignen automáticamente.',
    'Si no te interesa, puedes ignorar este mensaje; no te volveremos a escribir por esto.',
  ].join('\n');
}

// ---------- Supabase (service_role del .env) ----------
function config() {
  const env = fs.readFileSync(path.join(ROOT, '.env'), 'utf8');
  const key = (env.match(/SUPABASE_SERVICE_ROLE_KEY=(\S+)/) || [])[1];
  const url = ((env.match(/SUPABASE_URL=(\S+)/) || [])[1] || 'https://db.maximusinmobiliaria.tech').replace(/\/$/, '');
  if (!key) throw new Error('Falta SUPABASE_SERVICE_ROLE_KEY en .env');
  return { url, H: { apikey: key, Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' } };
}

async function rpc(nombre, body) {
  const { url, H } = config();
  const r = await fetch(`${url}/rest/v1/rpc/${nombre}`, { method: 'POST', headers: H, body: JSON.stringify(body) });
  const t = await r.text();
  if (!r.ok) {
    if (r.status === 404) throw new Error(`La función ${nombre} no existe todavía: ejecuta el SQL pendiente (Parte 6).`);
    throw new Error(`${nombre} → HTTP ${r.status}: ${t.slice(0, 200)}`);
  }
  return t ? JSON.parse(t) : null;
}

// ---------- Comandos ----------
async function preparar() {
  const max = Math.min(50, +val('--max', 15));
  const filas = await rpc('asesores_originales_por_avisar', { p_limite: max });
  const auto = flag('--auto');
  const contactos = (filas || []).map(f => ({
    telefono: f.telefono, nombre: f.nombre || '', total: f.total, consultas: f.consultas,
    inmuebles: f.inmuebles, aprobado: auto, mensaje: armarMensaje(f),
  }));
  guardar(BORRADOR, {
    creado: new Date().toISOString(),
    nota: auto ? 'Aprobado automáticamente (--auto).' : 'Revisa cada mensaje y pon "aprobado": true en los que quieras enviar. Luego: enviar --confirmo',
    contactos,
  });
  console.log(`Borrador: ${contactos.length} asesor(es) por avisar → ${path.relative(ROOT, BORRADOR)}`);
  contactos.slice(0, 3).forEach(c => console.log(`\n→ +${c.telefono} (${c.total} inmueble(s), ${c.consultas} consulta(s))\n${c.mensaje}`));
  return contactos.length;
}

async function abrirChatTelefono(page, tel) {
  await page.goto(`https://web.whatsapp.com/send?phone=${tel}`, { waitUntil: 'domcontentloaded', timeout: 90000 });
  const caja = page.locator('footer [contenteditable="true"]').first();
  await caja.waitFor({ timeout: 60000 });
  return caja;
}

async function enviar() {
  if (!flag('--confirmo')) return console.log('No se envió nada. Para enviar los avisos aprobados usa: enviar --confirmo');
  const b = leer(BORRADOR, null); if (!b) return console.log('No hay borrador. Ejecuta primero: preparar');
  const historial = leer(HISTORIAL, []);
  const enviadosHoy = historial.filter(h => h.fecha === hoy()).length;
  const max = Math.max(0, +val('--max', 15) - enviadosHoy);
  const cola = b.contactos.filter(c => c.aprobado === true && !historial.some(h => h.telefono === c.telefono)).slice(0, max);
  if (!cola.length) return console.log(`Nada que enviar (aprobados pendientes: 0, o tope diario alcanzado: ${enviadosHoy} hoy).`);

  const { abrir, sleep } = require('./captura_whatsapp.js');
  const { ctx, page } = await abrir();
  let ok = 0;
  try {
    for (const [i, c] of cola.entries()) {
      try {
        const caja = await abrirChatTelefono(page, c.telefono);
        await caja.click();
        const lineas = c.mensaje.split('\n');
        for (const [k, l] of lineas.entries()) {
          await page.keyboard.type(l, { delay: 25 });
          if (k < lineas.length - 1) await page.keyboard.press('Shift+Enter');
        }
        await page.keyboard.press('Enter');
        await sleep(2500);
        // Primero se marca en la base (así nunca se repite), luego en el historial local
        await rpc('marcar_asesor_avisado', { p_telefono: c.telefono }).catch(e => console.log(`  ! no se pudo marcar en la base: ${e.message.slice(0, 120)}`));
        historial.push({ telefono: c.telefono, nombre: c.nombre, inmuebles: (c.inmuebles || []).map(x => x.codigo), consultas: c.consultas, fecha: hoy(), enviado: new Date().toISOString() });
        guardar(HISTORIAL, historial);
        ok++;
        console.log(`✓ ${i + 1}/${cola.length} +${c.telefono}`);
      } catch (e) { console.log(`✗ +${c.telefono}: ${e.message.slice(0, 100)}`); }
      if (i < cola.length - 1) await sleep(60000 + Math.random() * 90000);
    }
  } finally { await ctx.close(); }
  console.log(`\nAvisos enviados: ${ok}/${cola.length}.`);
}

async function auto() {
  if (!flag('--confirmo')) return console.log('Para preparar y enviar automáticamente usa: auto --confirmo');
  argv.push('--auto');
  const n = await preparar();
  if (n) await enviar();
}

const cmds = { preparar, enviar, auto };
if (!cmds[cmd]) console.log('Uso: node avisar_asesores_originales.js <preparar [--auto] | enviar --confirmo | auto --confirmo> [--max 15]');
else cmds[cmd]().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

module.exports = { armarMensaje };
