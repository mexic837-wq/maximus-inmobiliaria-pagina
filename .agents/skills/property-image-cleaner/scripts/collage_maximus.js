/**
 * Port a Node.js (@napi-rs/canvas) del motor "Editorial MAXIMUS" de collage_maximus.py.
 * Mismo layout, paleta y textos (leídos de references/plantillas_collage.json).
 */
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage, GlobalFonts } = require('@napi-rs/canvas');

const SKILL_DIR = path.resolve(__dirname, '..');
const CFG = JSON.parse(fs.readFileSync(path.join(SKILL_DIR, 'references', 'plantillas_collage.json'), 'utf8'));
const FONT_PATH = path.join(SKILL_DIR, 'assets', 'fonts', 'Montserrat-Variable.ttf');
const LOGO_PATH = path.join(SKILL_DIR, 'assets', 'logo_maximus_icono_collage.png');
GlobalFonts.registerFromPath(FONT_PATH, 'Montserrat');

const PESOS = { Medium: 500, SemiBold: 600, Bold: 700, ExtraBold: 800 };
const fuente = (size, peso = 'Bold') => `${PESOS[peso] || 700} ${size}px Montserrat`;

function color(nombre, alpha = 255) {
  const c = CFG.paleta[nombre].replace('#', '');
  const [r, g, b] = [0, 2, 4].map(i => parseInt(c.slice(i, i + 2), 16));
  return `rgba(${r},${g},${b},${(alpha / 255).toFixed(3)})`;
}

function ancho(ctx, texto, f, tracking = 0) {
  if (!texto) return 0;
  ctx.font = f;
  return Math.round(ctx.measureText(texto).width) + tracking * (texto.length - 1);
}

// baseline: 'top' ≈ anchor "la" de Pillow, 'alphabetic' = "ls", 'middle' = "lm"
// La fuente variable se carga en su peso por defecto (fino); el peso se simula con un trazo
// del mismo color proporcional al tamaño (equivale visualmente a Bold/ExtraBold).
const TRAZO = {}; // @napi-rs/canvas >= 1.0 ya aplica el peso real de la fuente variable
function pintar(ctx, ch, x, y, f, fill) {
  const [, peso, size] = f.match(/^(\d+) (\d+)px/).map(Number);
  const lw = (TRAZO[peso] || 0) * size;
  if (lw > 0) { ctx.strokeStyle = fill; ctx.lineWidth = lw; ctx.lineJoin = 'round'; ctx.strokeText(ch, x, y); }
  ctx.fillText(ch, x, y);
}

function texto(ctx, x, y, t, f, fill, tracking = 0, baseline = 'top') {
  ctx.font = f; ctx.fillStyle = fill; ctx.textBaseline = baseline;
  if (!tracking) { pintar(ctx, t, x, y, f, fill); return ancho(ctx, t, f); }
  let cx = x;
  for (const ch of t) { pintar(ctx, ch, cx, y, f, fill); cx += ctx.measureText(ch).width + tracking; }
  return Math.round(cx - x - tracking);
}

function ajustarLineas(ctx, t, peso, maxW, sizeMax, sizeMin, maxLineas) {
  const palabras = (t || '').split(/\s+/).filter(Boolean);
  let lineas = [];
  for (let size = sizeMax; size >= sizeMin; size -= 2) {
    const f = fuente(size, peso);
    lineas = []; let actual = '';
    for (const p of palabras) {
      const prueba = `${actual} ${p}`.trim();
      if (ancho(ctx, prueba, f) <= maxW) actual = prueba;
      else { if (actual) lineas.push(actual); actual = p; }
    }
    if (actual) lineas.push(actual);
    if (lineas.length <= maxLineas && lineas.every(l => ancho(ctx, l, f) <= maxW)) return { f, size, lineas };
  }
  const f = fuente(sizeMin, peso);
  lineas = lineas.slice(0, maxLineas);
  if (!lineas.length) lineas = [''];
  let ultima = lineas[lineas.length - 1];
  while (ultima && ancho(ctx, ultima + '…', f) > maxW) ultima = ultima.slice(0, -1);
  lineas[lineas.length - 1] = ultima.trimEnd() + '…';
  return { f, size: sizeMin, lineas };
}

function rrect(ctx, x0, y0, x1, y1, r) {
  ctx.beginPath(); ctx.roundRect(x0, y0, x1 - x0, y1 - y0, r);
}

function brilloRadial(ctx, cx, cy, radio, c, alpha) {
  const R = radio * 1.6;
  const g = ctx.createRadialGradient(cx, cy, 0, cx, cy, R);
  g.addColorStop(0, color(c, alpha)); g.addColorStop(0.55, color(c, alpha * 0.55)); g.addColorStop(1, color(c, 0));
  ctx.fillStyle = g; ctx.fillRect(cx - R, cy - R, R * 2, R * 2);
}

function pegarFoto(ctx, img, [x0, y0, x1, y1], radio) {
  const w = x1 - x0, h = y1 - y0;
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,0.47)'; ctx.shadowBlur = 28; ctx.shadowOffsetY = 8;
  ctx.fillStyle = color('verde_profundo'); rrect(ctx, x0, y0, x1, y1, radio); ctx.fill();
  ctx.restore();
  ctx.save(); rrect(ctx, x0, y0, x1, y1, radio); ctx.clip();
  const esc = Math.max(w / img.width, h / img.height);
  const sw = w / esc, sh = h / esc;
  const focoY = img.height > img.width ? 0.42 : 0.5;
  ctx.drawImage(img, (img.width - sw) / 2, (img.height - sh) * focoY, sw, sh, x0, y0, w, h);
  ctx.restore();
  ctx.strokeStyle = 'rgba(255,255,255,0.15)'; ctx.lineWidth = 2;
  rrect(ctx, x0 + 1, y0 + 1, x1 - 1, y1 - 1, radio); ctx.stroke();
}

function pastilla(ctx, x, y, t, size, peso, fondo, fill, { pad = [22, 12], tracking = 3, borde = null, fondo2 = null } = {}) {
  const f = fuente(size, peso);
  const tw = ancho(ctx, t, f, tracking);
  const th = Math.round(size * 0.97) - 4;
  const box = [x, y, x + tw + pad[0] * 2, y + th + pad[1] * 2];
  const r = (box[3] - box[1]) / 2;
  if (fondo2) {
    const g = ctx.createLinearGradient(box[0], box[1], box[2], box[3]);
    g.addColorStop(0, fondo); g.addColorStop(1, fondo2); ctx.fillStyle = g;
  } else ctx.fillStyle = fondo;
  rrect(ctx, ...box, r); ctx.fill();
  if (borde) { ctx.strokeStyle = borde; ctx.lineWidth = 2; rrect(ctx, ...box, r); ctx.stroke(); }
  texto(ctx, x + pad[0], y + pad[1] + th / 2 + 1, t, f, fill, tracking, 'middle');
  return box;
}

function pin(ctx, x, y, r, c) {
  ctx.fillStyle = c;
  ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
  ctx.beginPath(); ctx.moveTo(x - r * 0.82, y + r * 0.45); ctx.lineTo(x + r * 0.82, y + r * 0.45); ctx.lineTo(x, y + r * 2.1); ctx.fill();
  ctx.fillStyle = color('verde_profundo');
  ctx.beginPath(); ctx.arc(x, y, r * 0.4, 0, Math.PI * 2); ctx.fill();
}

let _logoImg = null;
async function marca(ctx, x, y, altoIcono, sizeTxt) {
  _logoImg = _logoImg || await loadImage(LOGO_PATH);
  const lw = Math.round(_logoImg.width * altoIcono / _logoImg.height);
  ctx.drawImage(_logoImg, x, y, lw, altoIcono);
  const tx = x + lw + Math.round(sizeTxt * 0.45);
  const cy = y + altoIcono / 2;
  const f1 = fuente(sizeTxt, 'ExtraBold');
  const w = texto(ctx, tx, cy - Math.round(sizeTxt * 0.08), 'MAXIMUS', f1, color('blanco'), 1, 'alphabetic');
  texto(ctx, tx + w + 2, cy - Math.round(sizeTxt * 0.08), '.', f1, color('esmeralda'), 0, 'alphabetic');
  texto(ctx, tx + 2, cy + Math.round(sizeTxt * 0.42), 'INMOBILIARIA', fuente(Math.max(11, Math.round(sizeTxt * 0.34)), 'SemiBold'),
    color('plata'), Math.round(sizeTxt * 0.22), 'alphabetic');
}

const num = v => { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; };
const g = n => String(+n.toFixed(2));

function formatearPrecio(p) {
  const v = parseFloat(p);
  if (!Number.isFinite(v) || v <= 0) return 'Consultar';
  return '$' + Math.round(v).toLocaleString('en-US');
}

function caracteristicas(inm, maximo = 4) {
  const out = [];
  const hab = num(inm.habitaciones), ban = num(inm.banos), m2 = num(inm.metros_cuadrados), pto = num(inm.estacionamientos);
  const tipo = String(inm.tipo || '').toLowerCase();
  const pl = (n, uno, varios) => (n === 1 ? uno : varios);
  if (hab > 0) out.push(['local', 'oficina', 'galpon'].includes(tipo)
    ? [g(hab), pl(hab, 'OFICINA', 'OFICINAS')] : [g(hab), pl(hab, 'HABITACIÓN', 'HABITACIONES')]);
  if (ban > 0) out.push([g(ban), pl(ban, 'BAÑO', 'BAÑOS')]);
  if (m2 > 0) out.push([`${Math.round(m2).toLocaleString('en-US')} m²`, 'SUPERFICIE']);
  if (pto > 0) out.push([g(pto), pl(pto, 'PUESTO', 'PUESTOS')]);
  return out.slice(0, maximo);
}

function ubicacion(inm) {
  let u = inm.ubicacion || inm.sector_nombre || '';
  if (!u && inm.sector_clave) u = String(inm.sector_clave).replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
  const estado = inm.estado || 'Táchira';
  return u && !u.toLowerCase().includes(estado.toLowerCase()) ? `${u}, ${estado}` : (u || estado);
}

function plantillaPara(op) {
  op = String(op || '').toLowerCase();
  return /alquil|renta|arriendo/.test(op) ? 'alquiler' : 'venta';
}

/** imgs: objetos Image de @napi-rs/canvas (1 a 3). Devuelve Buffer JPEG. */
async function generarPortada(imgs, inm, clave = plantillaPara(inm.operacion)) {
  if (!imgs.length) throw new Error('Se necesita al menos 1 foto para el collage.');
  const W = CFG.lienzo.ancho, H = CFG.lienzo.alto;
  const pl = CFG.plantillas[clave];
  const canvas = createCanvas(W, H);
  const ctx = canvas.getContext('2d');
  const M = 32, G = 16, R = 24, PANEL_W = 560;

  ctx.fillStyle = color('verde_profundo'); ctx.fillRect(0, 0, W, H);
  const grad = ctx.createLinearGradient(0, 0, PANEL_W * 0.35, H * 0.65);
  grad.addColorStop(0, color('verde_profundo')); grad.addColorStop(1, color('verde_maximus'));
  ctx.fillStyle = grad; ctx.fillRect(0, 0, PANEL_W, H);
  brilloRadial(ctx, PANEL_W - 60, H - 80, 300, 'esmeralda', 60);
  brilloRadial(ctx, 60, 80, 260, 'plata', 22);
  ctx.strokeStyle = color('esmeralda', 160); ctx.lineWidth = 3;
  ctx.beginPath(); ctx.moveTo(PANEL_W - 2, M); ctx.lineTo(PANEL_W - 2, H - M); ctx.stroke();

  const fx0 = PANEL_W + 24, fx1 = W - M;
  let hero;
  if (imgs.length >= 3) {
    hero = [fx0, M, fx1, 640];
    const midx = fx0 + Math.floor((fx1 - fx0 - G) / 2);
    pegarFoto(ctx, imgs[0], hero, R);
    pegarFoto(ctx, imgs[1], [fx0, 640 + G, midx, H - M], R);
    pegarFoto(ctx, imgs[2], [midx + G, 640 + G, fx1, H - M], R);
  } else if (imgs.length === 2) {
    hero = [fx0, M, fx1, 640];
    pegarFoto(ctx, imgs[0], hero, R);
    pegarFoto(ctx, imgs[1], [fx0, 640 + G, fx1, H - M], R);
  } else {
    hero = [fx0, M, fx1, H - M];
    pegarFoto(ctx, imgs[0], hero, R);
  }

  if (inm.codigo) {
    const tw = ancho(ctx, inm.codigo, fuente(20, 'Bold'), 1);
    pastilla(ctx, hero[2] - tw - 44 - 24, hero[1] + 24, inm.codigo, 20, 'Bold', color('verde_profundo', 185), color('blanco'),
      { tracking: 1, borde: 'rgba(255,255,255,0.35)' });
  }

  const X = 52;
  await marca(ctx, X, 52, 92, 34);
  let y = 196;
  pastilla(ctx, X, y, pl.etiqueta, 21, 'ExtraBold', color(pl.pastilla_desde), color('verde_profundo'), { fondo2: color(pl.pastilla_hasta) });
  y += 80;
  const tit = ajustarLineas(ctx, inm.titulo || '', 'ExtraBold', PANEL_W - X - 44, 46, 30, 3);
  for (const ln of tit.lineas) { texto(ctx, X, y, ln, tit.f, color('blanco')); y += Math.round(tit.size * 1.16); }
  y += 14;
  pin(ctx, X + 10, y + 12, 9, color('esmeralda'));
  const ub = ajustarLineas(ctx, ubicacion(inm), 'Medium', PANEL_W - X - 80, 22, 17, 1);
  texto(ctx, X + 32, y, ub.lineas[0], ub.f, color('plata'));

  const feats = caracteristicas(inm);
  const gy = Math.max(y + 62, 560);
  const colW = Math.floor((PANEL_W - X - 44) / 2);
  feats.forEach(([valor, etiqueta], i) => {
    const cx = X + (i % 2) * colW, cy = gy + Math.floor(i / 2) * 92;
    ctx.strokeStyle = color('esmeralda'); ctx.lineWidth = 3;
    ctx.beginPath(); ctx.moveTo(cx + 1.5, cy); ctx.lineTo(cx + 1.5, cy + 64); ctx.stroke();
    texto(ctx, cx + 18, cy - 4, valor, fuente(34, 'ExtraBold'), color('blanco'));
    texto(ctx, cx + 19, cy + 42, etiqueta, fuente(14, 'SemiBold'), color('plata_oscura'), 3);
  });

  const py = H - 186;
  ctx.strokeStyle = 'rgba(255,255,255,0.16)'; ctx.lineWidth = 1;
  ctx.beginPath(); ctx.moveTo(X, py + 0.5); ctx.lineTo(PANEL_W - 44, py + 0.5); ctx.stroke();
  texto(ctx, X, py + 26, pl.etiqueta_precio, fuente(16, 'Bold'), color(pl.acento_texto), 4);
  const fSuf = fuente(24, 'Bold');
  const anchoSuf = ancho(ctx, pl.sufijo_precio, fSuf) + 14;
  const pr = ajustarLineas(ctx, formatearPrecio(inm.precio), 'ExtraBold', PANEL_W - X - 40 - anchoSuf, 80, 40, 1);
  texto(ctx, X - 3, py + 52, pr.lineas[0], pr.f, color('blanco'));
  const pw = ancho(ctx, pr.lineas[0], pr.f);
  texto(ctx, X + pw + 14, py + 52 + pr.size - 4, pl.sufijo_precio, fSuf, color('plata'), 0, 'alphabetic');

  return canvas.encode('jpeg', CFG.lienzo.jpeg_quality || 92);
}

/** Hash perceptual promedio 8x8 (equivalente a _ahash). */
function ahash(img) {
  const c = createCanvas(8, 8), ctx = c.getContext('2d');
  ctx.drawImage(img, 0, 0, 8, 8);
  const d = ctx.getImageData(0, 0, 8, 8).data;
  const px = []; for (let i = 0; i < 64; i++) px.push(0.299 * d[i * 4] + 0.587 * d[i * 4 + 1] + 0.114 * d[i * 4 + 2]);
  const avg = px.reduce((a, b) => a + b, 0) / 64;
  let h = 0n; px.forEach((p, i) => { if (p >= avg) h |= 1n << BigInt(i); });
  return h;
}
const bits = x => { let n = 0; while (x) { n += Number(x & 1n); x >>= 1n; } return n; };

/** items: [{url, img}] en orden de preferencia. Devuelve hasta max_fotos elegidas. */
function seleccionarFotos(items, maxFotos = CFG.max_fotos || 3) {
  const umbral = CFG.umbral_duplicado_hash ?? 6;
  const out = [], hashes = [];
  for (const it of items) {
    if (CFG.excluir_flyers_de_terceros !== false && /_collage/i.test(it.url)) continue;
    if (/portada_maximus/i.test(it.url)) continue;
    if (Math.min(it.img.width, it.img.height) < 300) continue;
    const h = ahash(it.img);
    if (hashes.some(o => bits(h ^ o) <= umbral)) continue;
    hashes.push(h); out.push(it);
    if (out.length >= maxFotos) break;
  }
  return out;
}

module.exports = { generarPortada, seleccionarFotos, plantillaPara, CFG };
