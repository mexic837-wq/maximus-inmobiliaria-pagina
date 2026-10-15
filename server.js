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
  '/property-detail': 'property-detail.html'
};

const LEGACY_REDIRECTS = {
  '/index.html': '/inicio',
  '/catalog.html': '/catalogo',
  '/login.html': '/login',
  '/dashboard-layout.html': '/dashboard',
  '/property-detail.html': '/detalle-propiedad'
};

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

  // Verificar si la ruta tiene un alias directo
  if (ROUTE_ALIASES[pathname]) {
    const targetFile = path.join(BASE_DIR, ROUTE_ALIASES[pathname]);
    if (fs.existsSync(targetFile)) {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Access-Control-Allow-Origin': '*'
      });
      return fs.createReadStream(targetFile).pipe(res);
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

  const ext = path.extname(filePath).toLowerCase();
  const contentType = MIME_TYPES[ext] || 'application/octet-stream';

  res.writeHead(200, {
    'Content-Type': contentType,
    'Access-Control-Allow-Origin': '*'
  });

  const stream = fs.createReadStream(filePath);
  stream.pipe(res);
});

server.listen(PORT, () => {
  const url = `http://localhost:${PORT}/inicio`;
  console.log(`Servidor local activo en: ${url}`);
  exec(`start ${url}`);
});
