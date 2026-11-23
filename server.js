const http = require('http');
const fs = require('fs');
const path = require('path');
const { exec } = require('child_process');

const PORT = process.env.PORT || 3000;
const BASE_DIR = __dirname;

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.mp4': 'video/mp4'
};

const ROUTE_ALIASES = {
  '/': 'index.html',
  '/inicio': 'index.html',
  '/catalogo': 'catalog.html',
  '/catalog': 'catalog.html',
  '/login': 'login.html',
  '/dashboard': 'dashboard-layout.html',
  '/dashboard-layout': 'dashboard-layout.html',
  '/detalle-propiedad': 'property-detail.html',
  '/propiedad': 'property-detail.html',
  '/property-detail': 'property-detail.html',
  '/llegada': 'llegada.html' // Fase 3: QR de llegada a la visita
};

const LEGACY_REDIRECTS = {
  '/index.html': '/inicio',
  '/catalog.html': '/catalogo',
  '/login.html': '/login',
  '/dashboard-layout.html': '/dashboard',
  '/property-detail.html': '/detalle-propiedad'
};


// ---------- Envío optimizado: compresión (brotli/gzip), ETag/304 y caché ----------
// Antes cada visita bajaba ~1.4 MB sin comprimir y sin caché (el panel pesa eso solo en HTML).
const zlib = require('zlib');
const COMPRIMIBLES = new Set(['.html', '.css', '.js', '.json', '.svg', '.txt', '.xml', '.ico']);
const CACHE_LARGA = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp', '.woff', '.woff2', '.ttf', '.mp4', '.ico']);
const cacheComprimidos = new Map(); // clave: ruta|mtime|tamaño|codificación -> Buffer

function enviarArchivo(req, res, filePath, extraHeaders = {}) {
  let stat;
  try { stat = fs.statSync(filePath); } catch (_) {
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    return res.end('No encontrado');
  }
  const ext = path.extname(filePath).toLowerCase();
  const etag = 'W/"' + stat.size.toString(16) + '-' + Math.floor(stat.mtimeMs).toString(16) + '"';
  const headers = {
    'Content-Type': MIME_TYPES[ext] || 'application/octet-stream',
    'Access-Control-Allow-Origin': '*',
    'ETag': etag,
    'Last-Modified': stat.mtime.toUTCString(),
    'Vary': 'Accept-Encoding',
    // HTML/JS/CSS: el navegador guarda copia pero pregunta si cambió (304 sin cuerpo) -> despliegues al instante.
    // Imágenes y fuentes: 7 días sin preguntar.
    'Cache-Control': CACHE_LARGA.has(ext) ? 'public, max-age=604800' : 'no-cache',
    ...extraHeaders
  };

  if (req.headers['if-none-match'] === etag) {
    res.writeHead(304, headers);
    return res.end();
  }

  const acepta = String(req.headers['accept-encoding'] || '');
  const codif = !COMPRIMIBLES.has(ext) || stat.size < 1024 ? null
    : /\bbr\b/.test(acepta) ? 'br' : /\bgzip\b/.test(acepta) ? 'gzip' : null;

  if (!codif) {
    headers['Content-Length'] = stat.size;
    res.writeHead(200, headers);
    if (req.method === 'HEAD') return res.end();
    return fs.createReadStream(filePath).pipe(res);
  }

  const clave = filePath + '|' + stat.mtimeMs + '|' + stat.size + '|' + codif;
  let cuerpo = cacheComprimidos.get(clave);
  if (!cuerpo) {
    const crudo = fs.readFileSync(filePath);
    cuerpo = codif === 'br'
      ? zlib.brotliCompressSync(crudo, { params: { [zlib.constants.BROTLI_PARAM_QUALITY]: 9, [zlib.constants.BROTLI_PARAM_SIZE_HINT]: crudo.length } })
      : zlib.gzipSync(crudo, { level: 9 });
    // Descartar versiones anteriores del mismo archivo (tras un despliegue)
    for (const k of cacheComprimidos.keys()) {
      if (k.startsWith(filePath + '|') && k.endsWith('|' + codif)) cacheComprimidos.delete(k);
    }
    cacheComprimidos.set(clave, cuerpo);
  }
  headers['Content-Encoding'] = codif;
  headers['Content-Length'] = cuerpo.length;
  res.writeHead(200, headers);
  res.end(req.method === 'HEAD' ? undefined : cuerpo);
}

const server = http.createServer((req, res) => {
  let urlObj;
  try {
    urlObj = new URL(req.url, `http://localhost:${PORT}`);
  } catch (err) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    return res.end('Bad Request');
  }

  let pathname = decodeURIComponent(urlObj.pathname);

  // Redireccionar rutas con .html a sus nombres limpios (ej: /index.html -> /inicio)
  if (LEGACY_REDIRECTS[pathname]) {
    const redirectUrl = LEGACY_REDIRECTS[pathname] + (urlObj.search || '');
    res.writeHead(302, { Location: redirectUrl });
    return res.end();
  }

  // Tarjeta digital del asesor Platinum: /asesor/<enlace> (la página lee el enlace de la URL)
  if (/^\/asesor\/[a-z0-9-]{1,60}\/?$/i.test(pathname)) {
    const tarjeta = path.join(BASE_DIR, 'tarjeta-asesor.html');
    if (fs.existsSync(tarjeta)) {
      return enviarArchivo(req, res, tarjeta, { 'X-Robots-Tag': 'noindex' });
    }
  }

  // Verificar si la ruta tiene un alias directo
  if (ROUTE_ALIASES[pathname]) {
    const targetFile = path.join(BASE_DIR, ROUTE_ALIASES[pathname]);
    if (fs.existsSync(targetFile)) {
      return enviarArchivo(req, res, targetFile);
    }
  }

  let filePath = path.join(BASE_DIR, pathname);

  // Security check: stay within BASE_DIR
  if (!filePath.startsWith(BASE_DIR)) {
    res.writeHead(403, { 'Content-Type': 'text/plain' });
    return res.end('Forbidden');
  }

  // Si no tiene extensión, verificar si existe un archivo .html correspondiente
  if (!path.extname(filePath)) {
    const htmlCandidate = filePath + '.html';
    if (fs.existsSync(htmlCandidate) && fs.statSync(htmlCandidate).isFile()) {
      filePath = htmlCandidate;
    }
  }

  // If path is a directory, look for index.html
  if (fs.existsSync(filePath) && fs.statSync(filePath).isDirectory()) {
    filePath = path.join(filePath, 'index.html');
  }

  if (!fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    return res.end('<h1>404 - Página no encontrada</h1><p><a href="/inicio">Ir al inicio</a></p>');
  }

  return enviarArchivo(req, res, filePath);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/inicio`;
  console.log(`Servidor activo en: ${url}`);
  if (process.platform === 'win32' && !process.env.NO_AUTO_OPEN) {
    exec(`start ${url}`);
  }
});
