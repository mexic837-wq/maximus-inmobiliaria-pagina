const fs = require('fs');
const path = require('path');

const rootDir = path.join(__dirname, '..');
const tmpDir = path.join(__dirname, 'favicons_tmp');

// 1. Vector SVG Favicon con máxima fidelidad, sin fondo blanco y agrandado
const faviconSvgContent = `<svg viewBox="0 0 32 32" fill="none" xmlns="http://www.w3.org/2000/svg">
    <defs>
        <!-- Gradiente Metálico Cromado / Plateado para la Casa y Monograma M -->
        <linearGradient id="max-house-silver" x1="4" y1="4" x2="28" y2="28" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#FFFFFF"/>
            <stop offset="40%" stop-color="#F8FAFC"/>
            <stop offset="80%" stop-color="#E2E8F0"/>
            <stop offset="100%" stop-color="#CBD5E1"/>
        </linearGradient>

        <!-- Gradiente Esmeralda Joya Vibrante para la Flecha Ascendente -->
        <linearGradient id="max-arrow-green" x1="10" y1="24" x2="30" y2="2" gradientUnits="userSpaceOnUse">
            <stop offset="0%" stop-color="#059669"/>
            <stop offset="45%" stop-color="#10B981"/>
            <stop offset="100%" stop-color="#34D399"/>
        </linearGradient>

        <!-- Sombra para contraste y relieve en temas claros y oscuros -->
        <filter id="max-contrast-shadow" x="-30%" y="-30%" width="160%" height="160%">
            <feDropShadow dx="0" dy="1.2" stdDeviation="1.2" flood-color="#041512" flood-opacity="0.85"/>
        </filter>
    </defs>

    <!-- Ícono Agrandado y Centrado (Escala ~1.18x para llenar el favicon sin recuadro blanco) -->
    <g transform="translate(16, 16) scale(1.18) translate(-16, -15.5)" filter="url(#max-contrast-shadow)">
        <!-- Chimenea clásica del logo -->
        <rect x="7.4" y="6" width="2.4" height="6.5" rx="0.5" fill="url(#max-house-silver)"/>

        <!-- Pilares laterales de soporte -->
        <path d="M6 17.5V26.5" stroke="url(#max-house-silver)" stroke-width="2.6" stroke-linecap="round"/>
        <path d="M24.5 17.5V26.5" stroke="url(#max-house-silver)" stroke-width="2.6" stroke-linecap="round"/>

        <!-- Techo a dos aguas con alero -->
        <path d="M3.5 17.5L15 7.5L26.5 17.5" stroke="url(#max-house-silver)" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/>

        <!-- Flecha Dinámica Verde Ascendente -->
        <path d="M10.5 15.5L15 21L24.2 9.2" stroke="url(#max-arrow-green)" stroke-width="3.4" stroke-linecap="round" stroke-linejoin="round"/>
        
        <!-- Punta de flecha superior derecha en ángulo de proyección -->
        <polygon points="29,4 21.5,6.8 26.2,13.8" fill="url(#max-arrow-green)"/>
    </g>
</svg>
`;

fs.writeFileSync(path.join(rootDir, 'favicon.svg'), faviconSvgContent, 'utf8');
const assetsDir = path.join(rootDir, 'assets');
if (fs.existsSync(assetsDir)) {
    fs.writeFileSync(path.join(assetsDir, 'favicon.svg'), faviconSvgContent, 'utf8');
}
console.log('✅ favicon.svg generado con éxito.');

// 2. Construir ICO multi-resolución a partir de los PNGs renderizados
function createIco(images) {
    // images: array of { width, height, buffer }
    const numImages = images.length;
    const headerSize = 6;
    const dirEntrySize = 16;
    const dirSize = headerSize + numImages * dirEntrySize;

    let offset = dirSize;
    const entries = [];

    for (const img of images) {
        const entry = Buffer.alloc(16);
        entry.writeUInt8(img.width >= 256 ? 0 : img.width, 0);
        entry.writeUInt8(img.height >= 256 ? 0 : img.height, 1);
        entry.writeUInt8(0, 2); // color count
        entry.writeUInt8(0, 3); // reserved
        entry.writeUInt16LE(1, 4); // color planes
        entry.writeUInt16LE(32, 6); // bits per pixel
        entry.writeUInt32LE(img.buffer.length, 8); // image size
        entry.writeUInt32LE(offset, 12); // image offset
        entries.push(entry);
        offset += img.buffer.length;
    }

    const header = Buffer.alloc(6);
    header.writeUInt16LE(0, 0); // reserved
    header.writeUInt16LE(1, 2); // ICO type
    header.writeUInt16LE(numImages, 4); // image count

    return Buffer.concat([header, ...entries, ...images.map(p => p.buffer)]);
}

const fav16 = fs.readFileSync(path.join(tmpDir, 'fav_16.png'));
const fav32 = fs.readFileSync(path.join(tmpDir, 'fav_32.png'));
const fav48 = fs.readFileSync(path.join(tmpDir, 'fav_48.png'));
const fav64 = fs.readFileSync(path.join(tmpDir, 'fav_64.png'));
const fav180 = fs.readFileSync(path.join(tmpDir, 'fav_180.png'));

const icoBuffer = createIco([
    { width: 16, height: 16, buffer: fav16 },
    { width: 32, height: 32, buffer: fav32 },
    { width: 48, height: 48, buffer: fav48 }
]);

// Guardar favicon.ico
fs.writeFileSync(path.join(rootDir, 'favicon.ico'), icoBuffer);
if (fs.existsSync(assetsDir)) {
    fs.writeFileSync(path.join(assetsDir, 'favicon.ico'), icoBuffer);
}
console.log('✅ favicon.ico generado con éxito (16x16, 32x32, 48x48).');

// Guardar favicon.png (64x64) y variantes
fs.writeFileSync(path.join(rootDir, 'favicon.png'), fav64);
fs.writeFileSync(path.join(rootDir, 'favicon-32x32.png'), fav32);
fs.writeFileSync(path.join(rootDir, 'favicon-16x16.png'), fav16);
fs.writeFileSync(path.join(rootDir, 'apple-touch-icon.png'), fav180);

if (fs.existsSync(assetsDir)) {
    fs.writeFileSync(path.join(assetsDir, 'favicon.png'), fav64);
}
const assestDir = path.join(rootDir, 'assest');
if (fs.existsSync(assestDir)) {
    fs.writeFileSync(path.join(assestDir, 'favicon.png'), fav64);
}

console.log('✅ favicon.png y todos los recursos distribuidos correctamente.');
