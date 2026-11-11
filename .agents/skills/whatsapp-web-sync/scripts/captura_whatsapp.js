#!/usr/bin/env node
/**
 * Captura de WhatsApp Web (Node + Playwright con el Chrome instalado).
 * Reemplaza a whatsapp_web_sync.py (Python no está disponible en el equipo).
 *
 *   node captura_whatsapp.js login                         # abre Chrome para escanear el QR (una sola vez)
 *   node captura_whatsapp.js listar                        # lista los grupos de "Archivados"
 *   node captura_whatsapp.js capturar --dias 7             # recorre TODOS los grupos archivados
 *   node captura_whatsapp.js capturar --grupos "SOLO VENTAS" --dias 3 --max-msgs 400
 *   Opciones: --headless  --sin-hd (no abre el visor; usa miniaturas)  --incluir-no-archivados
 *
 * Por cada grupo crea:
 *   agente_whatsapp/proyectos/<captaciones_externas|captaciones_maximus>/<grupo>_<AAAA_MM_DD>/
 *     mensajes.json   -> [{id, remitente, telefono, fecha, hora, texto, imagenes:[archivos]}]
 *     IMG-*.jpg       -> fotos en alta resolución (desde el visor de WhatsApp)
 *
 * Correcciones respecto a la versión Python:
 *  - Entra a la carpeta "Archivados" y recorre todos sus grupos.
 *  - Clave única = data-id del mensaje (antes los mensajes solo-foto del mismo remitente se fusionaban).
 *  - Remitente sacado del data-id (teléfono real), también en mensajes que solo traen foto.
 *  - Fecha tomada de los separadores de día; corta al llegar a --dias.
 *  - Fotos HD abriendo el visor (antes se guardaban miniaturas borrosas) y álbumes completos.
 */
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright-core');

const ROOT = path.resolve(__dirname, '../../../..');
const SESSION_DIR = path.join(ROOT, 'agente_whatsapp', '.wweb_session');
const PROYECTOS = path.join(ROOT, 'agente_whatsapp', 'proyectos');
const CHROME = ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe']
  .find(p => fs.existsSync(p));

const argv = process.argv.slice(2);
const cmd = argv[0] || 'listar';
const flag = n => argv.includes(n);
const val = (n, d) => { const i = argv.indexOf(n); return i >= 0 ? argv[i + 1] : d; };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const norm = s => String(s || '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/\s+/g, ' ').trim();
const hoy = () => new Date().toISOString().slice(0, 10).replace(/-/g, '_');

async function abrir() {
  fs.mkdirSync(SESSION_DIR, { recursive: true });
  const ctx = await chromium.launchPersistentContext(SESSION_DIR, {
    executablePath: CHROME, headless: flag('--headless'), viewport: { width: 1366, height: 900 },
    args: ['--no-first-run', '--disable-blink-features=AutomationControlled'],
  });
  const page = ctx.pages()[0] || await ctx.newPage();
  await page.goto('https://web.whatsapp.com', { waitUntil: 'domcontentloaded', timeout: 90000 });
  const t0 = Date.now(); let avisado = false;
  while (Date.now() - t0 < 180000) {
    if (await page.locator('#side').first().isVisible().catch(() => false)) { await sleep(2500); return { ctx, page }; }
    if (!avisado && await page.locator('canvas[aria-label], [data-ref]').first().isVisible().catch(() => false)) {
      console.log('\n[QR] Escanea el código: WhatsApp en el teléfono → Dispositivos vinculados → Vincular dispositivo.\n');
      avisado = true;
    }
    await sleep(2000);
  }
  await ctx.close();
  throw new Error('WhatsApp Web no cargó (¿sesión vencida? ejecuta: login)');
}

async function abrirArchivados(page) {
  // Botón "Archivados" en la lista de chats (o en el menú de filtros en versiones nuevas)
  const cand = page.locator('[aria-label^="Archived"], [aria-label^="Archivados"], [data-testid="archived"]');
  if (await cand.first().isVisible().catch(() => false)) { await cand.first().click(); await sleep(2500); return true; }
  const txt = page.getByText(/^(Archivados|Archived)$/i).first();
  if (await txt.isVisible().catch(() => false)) { await txt.click(); await sleep(2000); return true; }
  return false;
}

/** Lista los títulos del panel visible (archivados o principal), haciendo scroll para cargar todos. */
// El panel "Archived/Archivados" es distinto de #pane-side (lista principal): se excluye #pane-side cuando está abierto.
const JS_FILAS = `(arch) => [...document.querySelectorAll('[role="listitem"], [role="row"]')]
  .filter(r => !r.closest('#main') && r.getBoundingClientRect().left < 500 && (!arch || !r.closest('#pane-side')))`;

async function listarPanel(page, arch) {
  return page.evaluate(async ({ arch, JS_FILAS }) => {
    const filas = eval(JS_FILAS);
    const f0 = filas(arch)[0];
    let panel = f0; while (panel && !(panel.scrollHeight > panel.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(panel).overflowY))) panel = panel.parentElement;
    const titulos = new Set();
    // En cada fila, el PRIMER span[title] es el nombre del chat; el segundo es la vista previa del último mensaje
    const leer = () => filas(arch).forEach(li => { const s = li.querySelector('span[title]'); if (s) titulos.add(s.getAttribute('title')); });
    leer();
    if (panel) {
      for (let i = 0; i < 60; i++) {
        const antes = panel.scrollTop; panel.scrollTop += panel.clientHeight * 0.8;
        await new Promise(r => setTimeout(r, 500)); leer();
        if (panel.scrollTop === antes) break;
      }
      panel.scrollTop = 0;
    }
    return [...titulos].filter(Boolean);
  }, { arch, JS_FILAS });
}

async function abrirChat(page, titulo, arch) {
  // Escape (al cerrar el visor de fotos) también cierra el panel Archivados: reabrirlo si no está
  if (arch) {
    const abierto = await page.evaluate(JS => eval(JS)(true).length > 0, JS_FILAS);
    if (!abierto) await abrirArchivados(page);
  }
  // empezar la búsqueda desde arriba de la lista (antes solo bajaba y se saltaba chats ya pasados)
  await page.evaluate(({ arch, JS_FILAS }) => {
    let p = eval(JS_FILAS)(arch)[0];
    while (p && !(p.scrollHeight > p.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
    if (p) p.scrollTop = 0;
  }, { arch, JS_FILAS });
  await sleep(800);
  let caja = null;
  for (let i = 0; i < 40 && !caja; i++) {
    caja = await page.evaluate(({ titulo, arch, JS_FILAS }) => {
      const filas = eval(JS_FILAS)(arch);
      const fila = filas.find(r => r.querySelector('span[title]')?.getAttribute('title') === titulo);
      if (fila) { fila.scrollIntoView({ block: 'center' }); const b = fila.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; }
      let p = filas[0]; while (p && !(p.scrollHeight > p.clientHeight + 20 && /auto|scroll/.test(getComputedStyle(p).overflowY))) p = p.parentElement;
      if (p) p.scrollTop += p.clientHeight * 0.7;
      return null;
    }, { titulo, arch, JS_FILAS });
    if (!caja) await sleep(400);
  }
  if (!caja) throw new Error(`No encontré el chat "${titulo}"`);
  await sleep(500);
  const c2 = await page.evaluate(({ titulo, arch, JS_FILAS }) => {
    const fila = eval(JS_FILAS)(arch).find(r => r.querySelector('span[title]')?.getAttribute('title') === titulo);
    const b = fila.getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
  }, { titulo, arch, JS_FILAS });
  await page.mouse.click(c2.x, c2.y);
  await page.waitForSelector('#main', { timeout: 15000 });
  await sleep(2500);
}

/** Recorre el chat abierto hacia arriba hasta `dias` atrás y devuelve los mensajes (sin fotos HD). */
async function leerMensajes(page, dias, maxMsgs) {
  return page.evaluate(async ({ dias, maxMsgs }) => {
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    const limite = new Date(); limite.setHours(0, 0, 0, 0); limite.setDate(limite.getDate() - dias);
    const iso = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    // "[9:53 PM, 11/9/2026] +58 414-1234567: "  (M/D/AAAA en inglés, D/M/AAAA en español)
    const parsePre = pre => {
      const m = pre.match(/^\[([^,\]]+),\s*([^\]]+)\]\s*(.*?):\s*$/); if (!m) return null;
      const f = m[2].match(/(\d{1,2})\/(\d{1,2})\/(\d{2,4})/); if (!f) return null;
      const y = +(f[3].length === 2 ? '20' + f[3] : f[3]);
      const en = /[AP]M/i.test(m[1]);
      const d = en ? new Date(y, +f[1] - 1, +f[2]) : new Date(y, +f[2] - 1, +f[1]);
      return { hora: m[1].trim(), fecha: iso(d), remitente: m[3].trim() };
    };
    const main = document.querySelector('#main');
    const primera = main.querySelector('[role="row"]');
    let cont = primera; while (cont && !(cont.scrollHeight > cont.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(cont).overflowY))) cont = cont.parentElement;
    if (!cont) return { error: 'sin contenedor de scroll' };
    const mapa = new Map(); let orden = 0; let masViejo = null;

    function recolectar() {
      const filas = [...main.querySelectorAll('[role="row"]')];
      const pasada = [];
      for (const fila of filas) {
        const idEl = fila.querySelector('[data-id]'); if (!idEl) continue;
        const id = idEl.getAttribute('data-id');
        fila.querySelectorAll('[role="button"]').forEach(b => { if (/^(leer más|read more)$/i.test((b.innerText || '').trim())) try { b.click(); } catch {} });
        const preEl = fila.querySelector('[data-pre-plain-text]');
        const meta = preEl ? parsePre(preEl.getAttribute('data-pre-plain-text') || '') : null;
        const texto = [...fila.querySelectorAll('.selectable-text')].map(e => e.innerText.trim()).sort((a, b) => b.length - a.length)[0] || '';
        const imgs = [...fila.querySelectorAll('img')].filter(i => /^(blob:|data:image)/.test(i.src) && (i.naturalWidth > 120 || i.width > 120));
        const masN = ((fila.innerText || '').match(/^\+(\d{1,2})$/m) || [])[1];
        const horaVis = ((fila.innerText || '').match(/(\d{1,2}:\d{2}\s*(?:[AP]M|[ap]\.?\s?m\.?)?)\s*$/) || [])[1] || '';
        // Nombre visible en la burbuja (cuando no hay pre-plain-text, p. ej. fotos)
        const nombreVis = fila.querySelector('[aria-label][role="button"] span[dir="auto"], span[dir="auto"][aria-label]')?.innerText || '';
        // Mientras carga, cada foto tiene una vista previa borrosa (data:) además de la nítida (blob:): contar solo las nítidas
        const nitidas = imgs.filter(im => im.src.startsWith('blob:'));
        const tiles = nitidas.length ? new Set(nitidas.map(im => { const b = im.getBoundingClientRect(); return Math.round(b.top / 20) + ',' + Math.round(b.left / 20); })).size : (imgs.length ? 1 : 0);
        pasada.push({ id, mio: !!fila.querySelector('.message-out'), meta, texto, n: tiles ? tiles + (masN ? +masN - 1 : 0) : 0, horaVis, nombreVis, vacia: !(fila.innerText || '').trim() && !imgs.length });
      }
      // Heredar remitente/fecha: hacia atrás (la burbuja siguiente del mismo autor suele traer el pre) y hacia adelante
      for (let k = pasada.length - 2; k >= 0; k--) if (!pasada[k].meta && pasada[k + 1].meta && !pasada[k].nombreVis) pasada[k].heredado = pasada[k + 1].meta;
      let ult = null;
      for (const p of pasada) {
        if (p.meta) ult = p.meta;
        const m = p.meta || p.heredado || (ult && { ...ult, remitente: p.nombreVis || ult.remitente });
        if (p.vacia) continue;
        const prev = mapa.get(p.id) || { orden: orden++ };
        const reg = { ...prev, id: p.id,
          remitente: (p.meta && p.meta.remitente) || prev.remitente || (m && m.remitente) || p.nombreVis || '',
          fecha: (p.meta && p.meta.fecha) || prev.fecha || (m && m.fecha) || '',
          hora: (p.meta && p.meta.hora) || prev.hora || p.horaVis || (m && m.hora) || '',
          texto: p.texto.length > (prev.texto || '').length ? p.texto : (prev.texto || ''),
          // el conteo con fotos ya cargadas (blob) es el fiable: se usa el último no nulo
          n_imagenes: p.n || prev.n_imagenes || 0, es_mio: p.mio };
        if (reg.texto || reg.n_imagenes) mapa.set(p.id, reg);
        if (reg.fecha) { const d = new Date(reg.fecha + 'T00:00'); if (!masViejo || d < masViejo) masViejo = d; }
      }
    }
    cont.scrollTop = cont.scrollHeight; await sleep(1200); recolectar();
    let quietos = 0;
    for (let i = 0; i < 3000; i++) {
      if (mapa.size >= maxMsgs || (masViejo && masViejo < limite)) break;
      const antes = cont.scrollTop;
      cont.scrollTop = Math.max(0, cont.scrollTop - cont.clientHeight * 0.6);
      await sleep(cont.scrollTop === 0 ? 2000 : 800);
      recolectar();
      if (cont.scrollTop === antes) { if (++quietos >= 5) break; } else quietos = 0;
    }
    // orden cronológico: los recolectados primero (abajo) tienen orden menor -> invertir por fecha/hora no es fiable; ordenar por fecha y luego por aparición inversa
    const lista = [...mapa.values()].sort((a, b) => (a.fecha || '').localeCompare(b.fecha || '') || b.orden - a.orden);
    return { mensajes: lista, limite: iso(limite) };
  }, { dias, maxMsgs });
}

/** Abre cada mensaje con imagen en el visor y descarga las fotos en alta resolución. */
/** WhatsApp quita del DOM los mensajes fuera de pantalla: desplazarse por el chat hasta que el mensaje exista. */
async function buscarFila(page, id) {
  for (let intento = 0; intento < 2; intento++) {
    for (let i = 0; i < 250; i++) {
      const r = await page.evaluate(id => {
        const el = document.querySelector(`#main [data-id="${id}"]`);
        if (el) { el.scrollIntoView({ block: 'center' }); return 'ok'; }
        let c = document.querySelector('#main [role="row"]');
        while (c && !(c.scrollHeight > c.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(c).overflowY))) c = c.parentElement;
        if (!c) return 'sin';
        const antes = c.scrollTop; c.scrollTop += c.clientHeight * 0.6;
        return c.scrollTop === antes ? 'fondo' : 'sigue';
      }, id);
      if (r === 'ok') { await sleep(900); return true; }
      if (r === 'sin') return false;
      if (r === 'fondo') break;
      await sleep(350);
    }
    // llegó al final sin verlo: volver arriba y recorrer una vez más
    await page.evaluate(() => { let c = document.querySelector('#main [role="row"]'); while (c && !(c.scrollHeight > c.clientHeight + 50 && /auto|scroll/.test(getComputedStyle(c).overflowY))) c = c.parentElement; if (c) c.scrollTop = 0; });
    await sleep(1500);
  }
  return false;
}

async function descargarFotosHD(page, msg, carpeta, idx) {
  if (!(await buscarFila(page, msg.id))) { console.log(`   · no encontré el mensaje ${idx} para bajar su foto`); return []; }
  const fila = page.locator(`[data-id="${msg.id}"]`).first();
  // esperar a que la foto (blob) esté cargada
  for (let k = 0; k < 10 && !(await fila.locator('img[src^="blob:"]').count()); k++) await sleep(500);
  const img = fila.locator('img[src^="blob:"]').first();
  const archivos = [];
  const guardar = async (dataUrl, k) => {
    const nombre = `IMG-${(msg.fecha || '').replace(/-/g, '')}-WA${String(idx).padStart(4, '0')}_${k + 1}.jpg`;
    fs.writeFileSync(path.join(carpeta, nombre), Buffer.from(dataUrl.split(',')[1], 'base64'));
    archivos.push(nombre);
  };
  try {
    await img.click({ timeout: 4000 });
    let firmaInicial = null;
    for (let k = 0; k < Math.max(1, Math.min(msg.n_imagenes || 1, 40)); k++) {
      await sleep(1500);
      const r = await page.evaluate(async () => {
        // Solo la imagen del visor (fuera del chat #main): las fotos del chat también son blob: y confundían el emparejamiento
        const visor = [...document.querySelectorAll('img[src^="blob:"]')].filter(i => i.naturalWidth >= 400 && !i.closest('#main') && i.getBoundingClientRect().width > 300)
          .sort((a, b) => b.naturalWidth * b.naturalHeight - a.naturalWidth * a.naturalHeight)[0];
        if (!visor) return null;
        const head = document.querySelector('[data-animate-media-viewer], [role="dialog"]')?.innerText?.split('\n').slice(0, 3).join('|') || '';
        const b = await (await fetch(visor.src)).blob();
        const data = await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); });
        return { data, src: visor.src, head };
      });
      if (!r) break;
      if (k === 0) firmaInicial = r.head;
      else if (firmaInicial && r.head && r.head !== firmaInicial) break; // pasó a otro mensaje
      if (archivos.length && r.src === archivos._ultimo) break;
      await guardar(r.data, k); archivos._ultimo = r.src;
      if (k + 1 < (msg.n_imagenes || 1)) await page.keyboard.press('ArrowRight');
    }
  } catch (e) {
    // Fallback: miniaturas del chat
    const thumbs = await fila.evaluate(async el => {
      const out = [];
      for (const i of el.querySelectorAll('img[src^="blob:"]')) {
        if (i.naturalWidth < 120) continue;
        const b = await (await fetch(i.src)).blob();
        out.push(await new Promise(res => { const fr = new FileReader(); fr.onload = () => res(fr.result); fr.readAsDataURL(b); }));
      }
      return out;
    }).catch(() => []);
    for (let k = 0; k < thumbs.length; k++) await guardar(thumbs[k], k);
  }
  await page.keyboard.press('Escape').catch(() => {}); await sleep(600);
  delete archivos._ultimo;
  return archivos;
}

async function capturarGrupo(page, titulo, dias, maxMsgs, arch) {
  console.log(`\n▶ ${titulo}`);
  await abrirChat(page, titulo, arch);
  const r = await leerMensajes(page, dias, maxMsgs);
  if (r.error) { console.log('   ✗', r.error); return null; }
  const destino = /maximus/i.test(titulo) ? 'captaciones_maximus' : 'captaciones_externas';
  let carpeta = path.join(PROYECTOS, destino, `${titulo.replace(/[^\w\s-]/g, '').trim().replace(/\s+/g, '_')}_${hoy()}`);
  // no sobrescribir un lote ya interpretado/insertado
  const base = carpeta; for (let k = 2; fs.existsSync(path.join(carpeta, 'inmuebles_agente.json')); k++) carpeta = `${base}_v${k}`;
  fs.mkdirSync(carpeta, { recursive: true });
  const desde = r.limite;
  const msgs = r.mensajes.filter(m => !m.fecha || m.fecha >= desde);
  // Teléfono del remitente cuando WhatsApp lo muestra como número (contacto no guardado)
  msgs.forEach(m => { const t = (m.remitente || '').replace(/[^\d+]/g, ''); m.telefono = /^\+\d{10,15}$/.test(t) ? t : ''; });
  // Guardar los textos ANTES de bajar fotos (si la captura se corta, no se pierde la relación foto-mensaje)
  const escribir = () => fs.writeFileSync(path.join(carpeta, 'mensajes.json'), JSON.stringify({ grupo: titulo, destino, desde, capturado: new Date().toISOString(), mensajes: msgs }, null, 2));
  msgs.forEach(m => { m.imagenes = []; }); escribir();
  let i = 0, nFotos = 0;
  for (const m of msgs) {
    i++;
    try { m.imagenes = m.n_imagenes ? (flag('--sin-hd') ? [] : await descargarFotosHD(page, m, carpeta, i)) : []; } catch (e) { m.imagenes = []; console.log('   · foto', i, e.message.slice(0, 80)); await page.keyboard.press('Escape').catch(() => {}); }
    nFotos += m.imagenes.length;
    if (i % 10 === 0) escribir();
  }
  fs.writeFileSync(path.join(carpeta, 'mensajes.json'), JSON.stringify({ grupo: titulo, destino, desde, capturado: new Date().toISOString(), mensajes: msgs }, null, 2));
  console.log(`   ✓ ${msgs.length} mensajes, ${nFotos} fotos → ${path.relative(ROOT, carpeta)}`);
  return carpeta;
}

if (require.main === module) (async () => {
  if (!['login', 'listar', 'capturar'].includes(cmd)) {
    console.log('Uso: node captura_whatsapp.js <login|listar|capturar> [--grupos "a,b"] [--dias 7] [--max-msgs 600] [--headless] [--sin-hd]');
    return;
  }
  const { ctx, page } = await abrir();
  try {
    if (cmd === 'login') { console.log('Sesión lista. Sincronizando 60 s (no cierres la ventana)...'); await sleep(60000); return; }
    const archivados = await abrirArchivados(page);
    if (!archivados && !flag('--incluir-no-archivados')) console.log('[!] No encontré la carpeta "Archivados"; uso la lista principal.');
    const grupos = await listarPanel(page, archivados);
    if (cmd === 'listar') { console.log(`${archivados ? 'Archivados' : 'Chats'} (${grupos.length}):`); grupos.forEach(g => console.log(' -', g)); return; }
    if (cmd === 'capturar') {
      const filtro = val('--grupos'); const dias = +val('--dias', 7); const maxMsgs = +val('--max-msgs', 600);
      const sel = filtro ? grupos.filter(g => filtro.split(',').some(f => norm(g).includes(norm(f)))) : grupos;
      console.log(`Capturando ${sel.length} grupos, últimos ${dias} días`);
      const lotes = [];
      for (const g of sel) { try { const c = await capturarGrupo(page, g, dias, maxMsgs, archivados); if (c) lotes.push(c); } catch (e) { console.log('   ✗', e.message); } }
      fs.writeFileSync(path.join(PROYECTOS, 'ultima_captura.json'), JSON.stringify({ fecha: new Date().toISOString(), lotes }, null, 2));
      console.log(`\nListo: ${lotes.length} lotes. Índice en agente_whatsapp/proyectos/ultima_captura.json`);
    }
  } finally { await ctx.close(); }
})().catch(e => { console.error('ERROR:', e.message); process.exit(1); });

module.exports = { abrir, leerMensajes, descargarFotosHD, sleep };
