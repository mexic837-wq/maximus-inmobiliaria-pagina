#!/usr/bin/env node
/**
 * Separador de collages en Node (port de `separar_collage` / `_find_true_collage_seams` de clean_images.py).
 * Detecta collages con líneas divisorias sólidas y collages SIN margen (2x1, 1x2, 2x2, 3x1, 2x3...) y devuelve
 * las fotos individuales. Sin Python/OpenCV: usa solo @napi-rs/canvas.
 *
 *   const { separarCollage } = require('./collage_split');
 *   const piezas = await separarCollage(bufferJpg, { esMaximus: false });   // [] si no es collage
 *
 *   node collage_split.js foto.jpg [--maximus] [--out carpeta]               // prueba por CLI
 */
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('@napi-rs/canvas');

const UMBRAL_PIEZA = 0.6;   // pieza con más de 60 % de píxeles planos = gráfico (franja, logo, rótulo)
const UMBRAL_FLYER = 0.5;   // flyer cuyo promedio supera 50 % = plantilla diseñada: no se parte
const mediana = a => { const s = [...a].sort((x, y) => x - y); const m = s.length >> 1; return s.length ? (s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2) : 0; };

/** Región RGB: acceso por (fila, col) relativo a la región dentro del arreglo RGBA completo. */
function region(img, x0, y0, x1, y1) {
  const W = img.w;
  return { x0, y0, w: x1 - x0, h: y1 - y0,
    g(y, x) { const i = ((y0 + y) * W + x0 + x) * 4; return (img.d[i] + img.d[i + 1] + img.d[i + 2]) / 3; },
    ch(y, x, c) { return img.d[((y0 + y) * W + x0 + x) * 4 + c]; } };
}

/** axis 0 = costuras horizontales (cortan en Y), axis 1 = verticales (cortan en X). */
function buscarCosturas(R, axis, minChunk = 160) {
  const length = axis === 0 ? R.h : R.w, otro = axis === 0 ? R.w : R.h;
  if (length < minChunk * 2) return [[0, length]];
  const px = (i, j, c) => (axis === 0 ? R.ch(i, j, c) : R.ch(j, i, c));
  const gris = (i, j) => (axis === 0 ? R.g(i, j) : R.g(j, i));

  // Perfil de saltos entre líneas consecutivas (se usa para validar franjas y costuras)
  const diff = (i, j) => (Math.abs(px(i + 1, j, 0) - px(i, j, 0)) + Math.abs(px(i + 1, j, 1) - px(i, j, 1)) + Math.abs(px(i + 1, j, 2) - px(i, j, 2))) / 3;
  const meanDiff = new Float32Array(length - 1);
  for (let i = 0; i < length - 1; i++) { let s = 0; for (let j = 0; j < otro; j++) s += diff(i, j); meanDiff[i] = s / otro; }

  // 1) Franjas divisorias sólidas (blanco/negro/color de 2 a 45 px): desviación baja a lo largo de la línea
  const lineStd = new Float32Array(length);
  for (let i = 0; i < length; i++) {
    let s = 0, s2 = 0; for (let j = 0; j < otro; j++) { const v = gris(i, j); s += v; s2 += v * v; }
    const m = s / otro; lineStd[i] = Math.sqrt(Math.max(0, s2 / otro - m * m));
  }
  const margen = Math.floor(length * 0.14);
  const esGutter = i => i >= margen && i < length - margen && lineStd[i] < 14.5;
  const splits = []; let enG = false, gIni = 0, ultFin = 0;
  for (let i = 0; i < length; i++) {
    const g = esGutter(i);
    if (g && !enG) { enG = true; gIni = i; }
    else if (!g && enG) { enG = false; const ancho = i - gIni; if (ancho >= 2 && ancho <= 45 && gIni - ultFin >= minChunk
      // una franja real tiene bordes marcados; el cielo o una pared lisa no (falsos positivos)
      && Math.max(meanDiff[Math.max(0, gIni - 1)], meanDiff[Math.min(meanDiff.length - 1, i - 1)]) >= 12) { splits.push([ultFin, gIni]); ultFin = i; } }
  }
  if (splits.length && length - ultFin >= minChunk) { splits.push([ultFin, length]); return splits; }

  // 2) Costuras rectas sin margen: salto cromático + pico sobre la mediana local + nitidez continua
  const valida = (idx, u = { val: 18, ratio: 2.8, frac: 0.32 }) => {
    if (idx < minChunk || length - idx < minChunk) return false;
    const ws = Math.max(10, idx - 35), we = Math.min(length - 10, idx + 35);
    const ventana = [...meanDiff.slice(ws, Math.max(ws + 1, idx - 3)), ...meanDiff.slice(Math.min(idx + 4, we), we)];
    const ratio = meanDiff[idx] / (mediana(ventana) + 1e-5);
    let nitidos = 0;
    const ip = Math.max(0, idx - 4), inx = Math.min(length - 2, idx + 4);
    for (let j = 0; j < otro; j++) {
      const s = diff(idx, j), vec = 0.5 * (diff(ip, j) + diff(inx, j));
      if (s > 10 && s > vec * 1.6 + 4) nitidos++;
    }
    return meanDiff[idx] >= u.val && ratio >= u.ratio && nitidos / otro >= u.frac;
  };
  const mejor = (a, b) => { let bi = a, bv = -1; for (let i = a; i < b && i < meanDiff.length; i++) if (meanDiff[i] > bv) { bv = meanDiff[i]; bi = i; } return bi; };

  const b1 = mejor(Math.floor(length * 0.30), Math.floor(length * 0.37));
  const b2 = mejor(Math.floor(length * 0.63), Math.floor(length * 0.70));
  if (valida(b1) && valida(b2) && b2 - b1 >= minChunk) return [[0, b1], [b1 + 1, b2], [b2 + 1, length]];
  const bm = mejor(Math.floor(length * 0.45), Math.floor(length * 0.55));
  if (valida(bm)) return [[0, bm], [bm + 1, length]];
  return [[0, length]];
}

async function recortar(img, x0, y0, x1, y1, calidad) {
  const w = x1 - x0, h = y1 - y0;
  const c = createCanvas(w, h); c.getContext('2d').drawImage(img, x0, y0, w, h, 0, 0, w, h);
  return { buf: await c.encode('jpeg', calidad), w, h };
}

/** Fracción de píxeles "planos" (sin textura): alta en gráficos/plantillas, baja en fotos. */
function fraccionPlana(datos, x0, y0, x1, y1) {
  const W = datos.w, d = datos.d; let planos = 0, n = 0;
  const g = (x, y) => { const i = (y * W + x) * 4; return (d[i] + d[i + 1] + d[i + 2]) / 3; };
  for (let y = y0; y < y1 - 1; y += 2) for (let x = x0; x < x1 - 1; x += 2) { n++; if (Math.abs(g(x + 1, y) - g(x, y)) + Math.abs(g(x, y + 1) - g(x, y)) < 3) planos++; }
  return n ? planos / n : 1;
}

/** Costura vertical relajada en la posición esperada (para cuadrículas donde una fila tiene la costura menos marcada). */
function costuraRelajada(datos, y0, y1, xObj) {
  const W = datos.w, d = datos.d, alto = y1 - y0;
  const col = x => { let s = 0; for (let y = y0; y < y1; y++) { const i = (y * W + x) * 4, j = i + 4; s += (Math.abs(d[j] - d[i]) + Math.abs(d[j + 1] - d[i + 1]) + Math.abs(d[j + 2] - d[i + 2])) / 3; } return s / alto; };
  let bx = xObj, bv = -1;
  for (let x = Math.max(1, xObj - 6); x <= Math.min(W - 2, xObj + 6); x++) { const v = col(x); if (v > bv) { bv = v; bx = x; } }
  const vent = []; for (let x = Math.max(1, bx - 35); x < Math.min(W - 2, bx + 35); x++) if (Math.abs(x - bx) > 3) vent.push(col(x));
  return bv >= 9 && bv / (mediana(vent) + 1e-5) >= 1.8 ? bx : null;
}

/** ¿La fila y (entre x0 y x1) parece texto superpuesto? Muchos tramos cortos de blanco puro (letras), no una superficie blanca. */
function esFilaTexto(datos, x0, x1, y) {
  const W = datos.w, d = datos.d; let tramos = 0, largo = 0, blancos = 0;
  for (let x = x0; x < x1; x++) {
    const i = (y * W + x) * 4, blanco = Math.min(d[i], d[i + 1], d[i + 2]) >= 225;
    if (blanco) { largo++; blancos++; } else { if (largo >= 2 && largo <= 60) tramos++; largo = 0; }
  }
  return tramos >= 6 && blancos / (x1 - x0) >= 0.03;
}

/** Recorta rótulos de texto pegados al borde inferior (o superior) de una pieza. Devuelve [cy0, cy1]. */
function quitarRotulos(datos, x0, x1, cy0, cy1, { arriba, abajo }) {
  const h = cy1 - cy0, m = Math.floor((x1 - x0) * 0.05), xa = x0 + m, xb = x1 - m, PAD = Math.round(h * 0.02) + 6;
  let n0 = cy0, n1 = cy1;
  if (abajo) { // zona: 45 % inferior; cortar desde la primera fila con texto
    for (let y = cy0 + Math.floor(h * 0.55); y < cy1; y++) if (esFilaTexto(datos, xa, xb, y)) { n1 = Math.max(cy0 + Math.floor(h * 0.55), y - PAD); break; }
  }
  if (arriba) { // zona: 30 % superior; cortar después de la última fila con texto
    for (let y = cy0 + Math.floor(h * 0.30); y >= cy0; y--) if (esFilaTexto(datos, xa, xb, y)) { n0 = Math.min(cy0 + Math.floor(h * 0.30), y + PAD); break; }
  }
  return [n0, n1];
}

/**
 * @returns {Promise<Array<{buf:Buffer,w:number,h:number}>>} piezas (>=2) o [] si la imagen no es un collage.
 * En captaciones externas (esMaximus=false) recorta además los rótulos de texto pegados a las costuras.
 */
async function separarCollage(buffer, { esMaximus = false, calidad = 95 } = {}) {
  const img = await loadImage(buffer);
  const W = img.width, H = img.height;
  if (Math.min(W, H) < 320) return [];
  // Para detectar se trabaja a un máximo de 1600 px de lado (más rápido); los recortes salen de la imagen original
  const esc = Math.min(1, 1600 / Math.max(W, H));
  const dw = Math.round(W * esc), dh = Math.round(H * esc);
  const c = createCanvas(dw, dh), ctx = c.getContext('2d'); ctx.drawImage(img, 0, 0, dw, dh);
  const datos = { w: dw, h: dh, d: ctx.getImageData(0, 0, dw, dh).data };

  const minH = Math.max(160, Math.floor(dh * 0.22)), minW = Math.max(160, Math.floor(dw * 0.22));
  const filas = buscarCosturas(region(datos, 0, 0, dw, dh), 0, minH);
  const colsPorFila = filas.map(([y0, y1]) => buscarCosturas(region(datos, 0, y0, dw, y1), 1, minW));
  // Cuadrícula: si una fila tiene costuras verticales y otra no, buscarlas (relajado) en la misma posición
  const modelo = colsPorFila.find(cs => cs.length > 1);
  if (modelo) colsPorFila.forEach((cs, r) => {
    if (cs.length > 1) return;
    const xs = modelo.slice(0, -1).map(([, x1]) => costuraRelajada(datos, filas[r][0], filas[r][1], x1));
    if (xs.every(x => x !== null)) colsPorFila[r] = [0, ...xs].map((x, k) => [k ? x + 1 : 0, xs[k] ?? dw]);
  });

  const piezas = [];
  for (const [r, [y0, y1]] of filas.entries()) {
    for (const [x0, x1] of colsPorFila[r]) {
      let cy0 = y0, cy1 = y1;
      const multi = filas.length > 1 || colsPorFila[r].length > 1;
      if (!esMaximus && multi && cy1 - cy0 >= 200) [cy0, cy1] = quitarRotulos(datos, x0, x1, cy0, cy1, { arriba: r > 0, abajo: true });
      const cw = x1 - x0, ch = cy1 - cy0, aspecto = Math.max(cw / Math.max(ch, 1), ch / Math.max(cw, 1));
      if (cw >= 160 * esc && ch >= 140 * esc && aspecto <= 3.6)
        { let t = 0; for (let y = cy0; y < cy1; y += 2) if (esFilaTexto(datos, x0 + 4, x1 - 4, y)) t++;
          piezas.push({ plana: fraccionPlana(datos, x0, cy0, x1, cy1), texto: t / Math.max(1, (cy1 - cy0) / 2), area: cw * ch, caja: [x0, cy0, x1, cy1] }); }
    }
  }
  if (process.env.COLLAGE_DEBUG) console.log('  planas:', piezas.map(p => p.plana.toFixed(2)).join(' '));
  // Flyers diseñados (plantillas con logos y franjas de color) no se parten: exigir >= 2 piezas con aspecto de foto
  // que cubran la mayor parte del área; las piezas gráficas se descartan.
  const media = piezas.reduce((a, p) => a + p.plana, 0) / Math.max(1, piezas.length);
  if (media >= UMBRAL_FLYER) return [];
  const fotos = piezas.filter(p => p.plana < UMBRAL_PIEZA);
  const areaTotal = piezas.reduce((a, p) => a + p.area, 0), areaFotos = fotos.reduce((a, p) => a + p.area, 0);
  if (fotos.length < 2 || areaFotos < areaTotal * 0.6) return [];
  const out = [];
  for (const { plana, texto, caja: [x0, cy0, x1, cy1] } of fotos) {
    {
      out.push(Object.assign({ plana, texto }, await recortar(img, Math.round(x0 / esc), Math.round(cy0 / esc), Math.min(W, Math.round(x1 / esc)), Math.min(H, Math.round(cy1 / esc)), calidad)));
    }
  }
  return out;
}

module.exports = { separarCollage };

if (require.main === module) {
  (async () => {
    const a = process.argv.slice(2), f = a.find(x => !x.startsWith('--'));
    if (!f) return console.log('Uso: node collage_split.js foto.jpg [--maximus] [--out carpeta]');
    const out = a.includes('--out') ? a[a.indexOf('--out') + 1] : null;
    const piezas = await separarCollage(fs.readFileSync(f), { esMaximus: a.includes('--maximus') });
    console.log(piezas.length ? `${path.basename(f)}: collage → ${piezas.length} fotos (${piezas.map(p => p.w + 'x' + p.h).join(', ')})` : `${path.basename(f)}: no es collage`);
    if (out) { fs.mkdirSync(out, { recursive: true }); piezas.forEach((p, i) => fs.writeFileSync(path.join(out, `${path.basename(f, path.extname(f))}_${String(i + 1).padStart(2, '0')}.jpg`), p.buf)); }
  })();
}
