#!/usr/bin/env node
/**
 * MAXIMUS Inmobiliaria - Skill 1: whatsapp-property-parser (Node.js Multi-Formato & Dual-Flow)
 * ============================================================================================
 * Soporta:
 *   1. Separación estricta de flujos por carpeta:
 *      - `captaciones_externas/` -> is_maximus = false, Asesor Externo (PROHIBIDO usar "Gestión MAXIMUS")
 *      - `captaciones_maximus/`  -> is_maximus = true, Asesor Oficial MAXIMUS
 *   2. Plantilla Oficial Estricta de Ubicaciones (`UBICACIONES_TACHIRA` de `dashboard-layout.html`):
 *      - Usa exclusivamente las 39 zonas oficiales del desplegable `#inm-sector-select`.
 *      - Formato estricto:
 *          sector_nombre = loc.label
 *          ubicacion     = `${loc.label}, ${loc.municipio}, Táchira`
 *          sector_desc   = `Sector residencial ${loc.label}, Municipio ${loc.municipio}, Estado Táchira.`
 *      - Cero Invención: Si no coincide con ninguna zona de la plantilla, va a `pendientes_revision.md`.
 *   3. Agrupación Inteligente Anti-Mezcla (`groupMessagesBySenderWindow`):
 *      - Une álbumes de fotos + descripción del mismo inmueble, pero NUNCA mezcla anuncios
 *        distintos enviados por el mismo asesor en el mismo minuto.
 */

const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const ASESORES_MAXIMUS_FALLBACK = [
    { id: 'a0000001-0000-0000-0000-000000000001', nombre: 'José Guerrero', cargo: 'Director / Captador Principal', telefono: '+58 424-1234567', keywords: ['jose guerrero', 'josé guerrero', 'guerrero'], es_principal: true },
    { id: 'eq-001', nombre: 'Lic. Eva Camargo', cargo: 'Directora Comercial', telefono: '+58 424-1234567', keywords: ['eva camargo', 'camargo'], es_principal: false },
    { id: 'a0000001-0000-0000-0000-000000000002', nombre: 'Valeria Méndez', cargo: 'Especialista en Apartamentos', telefono: '+58 414-9876543', keywords: ['valeria mendez', 'valeria méndez', 'valeria'], es_principal: false },
    { id: 'a0000001-0000-0000-0000-000000000003', nombre: 'Carlos Santander', cargo: 'Especialista Inversiones', telefono: '+58 412-9876543', keywords: ['carlos santander', 'santander', 'carlos alviarez', 'alviarez'], es_principal: false },
    { id: 'a0000001-0000-0000-0000-000000000004', nombre: 'Andrea Colmenares', cargo: 'Comercial & Industrial', telefono: '+58 416-3334455', keywords: ['andrea colmenares', 'colmenares', 'mariangel rivas', 'mariángel rivas'], es_principal: false },
    { id: 'eq-003', nombre: 'María Rodríguez', cargo: 'Asesora Inmobiliaria', telefono: '+58 412-5557890', keywords: ['maria rodriguez', 'maría rodríguez'], es_principal: false },
    { id: 'eq-004', nombre: 'Carlos Mendoza', cargo: 'Asesor de Inversiones', telefono: '+58 424-7778899', keywords: ['carlos mendoza'], es_principal: false }
];

// ============================================================================
// PLANTILLA OFICIAL ESTRICTA DE 39 UBICACIONES (`UBICACIONES_TACHIRA`)
// Idéntica al desplegable `#inm-sector-select` de `dashboard-layout.html`
// ============================================================================
const UBICACIONES_TACHIRA_REGLAS = [
    { key: 'urb-pirineos', label: 'Urb. Pirineos II', municipio: 'San Cristóbal', regex: /\b(pirineos\s+ii|pirineos\s+2|urb\.?\s+pirineos\s+ii)\b/i },
    { key: 'pirineos', label: 'Los Pirineos', municipio: 'San Cristóbal', regex: /\b(los\s+pirineos|pirineos\s+i\b|pirineos|don\s+bosco|do[ñn]a\s+juanita|la\s+arboleda|av\.?\s+19\s+de\s+abril|avenida\s+19\s+de\s+abril)\b/i },
    { key: 'urb-guaparo', label: 'Urb. Guaparo', municipio: 'San Cristóbal', regex: /\b(guaparo|urb\.?\s+guaparo)\b/i },
    { key: 'la-ermita', label: 'La Ermita', municipio: 'San Cristóbal', regex: /\b(la\s+ermita|deporte\s+japon[eé]s)\b/i },
    { key: 'san-carlos', label: 'San Carlos', municipio: 'San Cristóbal', regex: /\b(san\s+carlos|barrio\s+san\s+carlos|moncricket)\b/i },
    { key: 'madre-juana', label: 'Madre Juana', municipio: 'San Cristóbal', regex: /\b(madre\s+juana)\b/i },
    { key: 'unidad-vecinal', label: 'Unidad Vecinal', municipio: 'San Cristóbal', regex: /\b(unidad\s+vecinal)\b/i },
    { key: 'santa-ines', label: 'Santa Inés', municipio: 'San Cristóbal', regex: /\b(santa\s+in[eé]s)\b/i },
    { key: 'barrio-sucre', label: 'Barrio Sucre', municipio: 'San Cristóbal', regex: /\b(barrio\s+sucre|urb\.?\s+sucre|\bunet\b|\bula\b|barrio\s+bol[ií]var)\b/i },
    { key: 'la-castellana', label: 'La Castellana', municipio: 'San Cristóbal', regex: /\b(la\s+castellana|terrazas\s+de\s+la\s+castellana|urb\.?\s+alto\s+pino|alto\s+pino|ferrero\s+tamayo|colegio\s+montessori|el\s+bosque|res\.?\s+el\s+bosque)\b/i },
    { key: 'paramillo', label: 'Paramillo', municipio: 'San Cristóbal', regex: /\b(paramillo|altos\s+de\s+paramillo|colinas\s+de\s+paramillo|z\.?i\.?\s+paramillo|zona\s+industrial\s+paramillo|sambil)\b/i },
    { key: 'pueblo-nuevo', label: 'Pueblo Nuevo', municipio: 'San Cristóbal', regex: /\b(pueblo\s+nuevo|av\.?\s+espa[ñn]a|plaza\s+de\s+toros|pol[ií]gono\s+de\s+tiro|los\s+kioskos|los\s+kioscos|tierra\s+dorada|terracota|santa\s+teresa|santa\s+cecilia|hospital\s+central|las\s+acacias|av\.?\s+rotaria)\b/i },
    { key: 'barrio-obrero', label: 'Barrio Obrero', municipio: 'San Cristóbal', regex: /\b(barrio\s+obrero|b\.?o\.?|pasaje\s+acueducto|plaza\s+los\s+mangos|av\.?\s+carabobo|edificio\s+alc[aá]zar|residencias\s+el\s+parque|carrera\s+1[89]|calle\s+1[0-6])\b/i },
    { key: 'quinimari', label: 'Quinimarí', municipio: 'San Cristóbal', regex: /\b(quinimar[ií]|urb\.?\s+quinimar[ií]|urb\.?\s+torbes)\b/i },
    { key: 'las-lomas', label: 'Las Lomas', municipio: 'San Cristóbal', regex: /\b(las\s+lomas|av\.?\s+libertador|barrio\s+libertador)\b/i },
    { key: 'la-concordia', label: 'La Concordia', municipio: 'San Cristóbal', regex: /\b(la\s+concordia|al\s+lado\s+de\s+trt|marginal\s+del\s+torbes|urb\.?\s+coromoto|residencias\s+la\s+hacienda|la\s+castra)\b/i },
    { key: 'la-romera', label: 'La Romera', municipio: 'San Cristóbal', regex: /\b(la\s+romera)\b/i },
    { key: 'el-lobo', label: 'El Lobo', municipio: 'San Cristóbal', regex: /\b(el\s+lobo)\b/i },
    { key: 'la-popita', label: 'La Popita', municipio: 'San Cristóbal', regex: /\b(la\s+popita)\b/i },
    { key: 'las-pilas', label: 'Las Pilas', municipio: 'San Cristóbal', regex: /\b(las\s+pilas|santa\s+eduvig[ei]s)\b/i },
    { key: 'centro', label: 'Centro de San Cristóbal', municipio: 'San Cristóbal', regex: /\b(centro\s+de\s+san\s+crist[oó]bal|casco\s+central|5ta\s+avenida|7ma\s+avenida|quinta\s+avenida|s[eé]ptima\s+avenida|\bcentro\b)\b/i },
    { key: 'palo-gordo', label: 'Palo Gordo', municipio: 'Cárdenas', regex: /\b(palo\s+gordo|v[ií]a\s+palo\s+gordo|altos\s+de\s+palo\s+gordo)\b/i },
    { key: 'tariba', label: 'Táriba', municipio: 'Cárdenas', regex: /\b(t[aá]riba|colinas\s+de\s+t[aá]riba|las\s+vegas\s+de\s+t[aá]riba|arjona|colegio\s+virgen\s+del\s+valle|el\s+diamante|las\s+margaritas|barrancas|z\.?i\.?\s+barrancas)\b/i },
    { key: 'palmira-centro', label: 'Palmira Centro', municipio: 'Guásimos', regex: /\b(palmira\s+centro|casco\s+de\s+palmira)\b/i },
    { key: 'palmira', label: 'Palmira', municipio: 'Cárdenas', regex: /\b(palmira|el\s+abejal|la\s+flautera|patiecitos|gu[aá]simos|caneyes)\b/i },
    { key: 'san-josecito', label: 'San Josecito', municipio: 'Torbes', regex: /\b(san\s+josecito|torbes)\b/i },
    { key: 'la-grita', label: 'La Grita', municipio: 'Jáuregui', regex: /\b(la\s+grita|j[aá]uregui)\b/i },
    { key: 'rubio', label: 'Rubio', municipio: 'Junín', regex: /\b(rubio|jun[ií]n|las\s+dantas)\b/i },
    { key: 'capacho-nuevo', label: 'Capacho Nuevo', municipio: 'Independencia', regex: /\b(capacho\s+nuevo|independencia|capacho|peribeca)\b/i },
    { key: 'capacho-viejo', label: 'Capacho Viejo', municipio: 'Independencia', regex: /\b(capacho\s+viejo|libertad)\b/i },
    { key: 'san-antonio', label: 'San Antonio del Táchira', municipio: 'Bolívar', regex: /\b(san\s+antonio|ure[ñn]a|bol[ií]var)\b/i },
    { key: 'lobatera', label: 'Lobatera', municipio: 'Lobatera', regex: /\b(lobatera|borot[aá])\b/i },
    { key: 'michelena', label: 'Michelena', municipio: 'Michelena', regex: /\b(michelena)\b/i },
    { key: 'santa-ana', label: 'Santa Ana del Táchira', municipio: 'Córdoba', regex: /\b(santa\s+ana|c[oó]rdoba)\b/i },
    { key: 'tucape', label: 'Tucapé', municipio: 'Fernández Feo', regex: /\b(tucap[eé])\b/i },
    { key: 'coloncito', label: 'Coloncito', municipio: 'Panamericano', regex: /\b(coloncito|panamericano)\b/i },
    { key: 'la-fria', label: 'La Fría', municipio: 'García de Hevia', regex: /\b(la\s+fr[ií]a|garc[ií]a\s+de\s+hevia)\b/i },
    { key: 'el-piñal', label: 'El Piñal', municipio: 'Fernández Feo', regex: /\b(el\s+pi[ñn]al|fern[aá]ndez\s+feo)\b/i },
    { key: 'pregonero', label: 'Pregonero', municipio: 'Uribante', regex: /\b(pregonero|uribante|cordero|lomas\s+blancas)\b/i }
];

const REGLAS_ASPECTOS = [
    [/\b(piscina|sol[aá]rium)\b/i, 'ph-waves', 'Piscina y Área Social', 'Espacio recreativo ideal para el disfrute familiar'],
    [/\b(planta\s+el[eé]ctrica|generador|planta\s+100%|planta\s+total|inversor)\b/i, 'ph-lightning', 'Autonomía Eléctrica', 'Respaldo de energía mediante planta eléctrica'],
    [/\b(tanque|pozo|hidroneum[aá]tico|reserva\s+de\s+agua|agua\s+constante)\b/i, 'ph-drop', 'Reserva Hídrica Garantizada', 'Sistema de almacenamiento de agua con hidroneumático'],
    [/\b(vigilancia|conjunto\s+cerrado|conjunto\s+privado|seguridad\s+24|garita|cerco\s+el[eé]ctrico|port[oó]n\s+el[eé]ctrico)\b/i, 'ph-shield-check', 'Seguridad Privada 24/7', 'Control de acceso y resguardo continuo en el conjunto'],
    [/\b(amoblad[oa]|equipad[oa])\b/i, 'ph-armchair', 'Equipamiento y Mobiliario', 'Se entrega con mobiliario y equipamiento listo para habitar'],
    [/\b(cocina\s+empotrada|tope\s+de\s+granito|cocina\s+moderna|cocina\s+equipada|cuarzo)\b/i, 'ph-cooking-pot', 'Cocina Moderna Equipada', 'Acabados de primera línea y excelente distribución funcional'],
    [/\b(fibra\s+[oó]ptica|internet|wifi)\b/i, 'ph-wifi-high', 'Conectividad Fibra Óptica', 'Servicio de internet de alta velocidad instalado'],
    [/\b(aire\s+acondicionado|a\/a|split|climatizad[oa])\b/i, 'ph-snowflake', 'Ambientes Climatizados', 'Unidades de aire acondicionado instaladas'],
    [/\b(terraza|balc[oó]n|vista\s+panor[aá]mica|vista\s+hacia\s+la\s+monta[ñn]a|vista\s+a\s+la\s+monta[ñn]a)\b/i, 'ph-sun-horizon', 'Terraza con Vista Panorámica', 'Iluminación natural y ventilación privilegiada'],
    [/\b(jard[ií]n|[aá]reas\s+verdes|patio|parrillera|social|boh[ií]o)\b/i, 'ph-tree', 'Jardín y Áreas Verdes', 'Espacios exteriores integrados para esparcimiento'],
    [/\b(estrenar|de\s+estreno|nuevo|remodelad[oa]|lujo|m[aá]rmol|porcelanato)\b/i, 'ph-sparkle', 'Acabados de Primera', 'Materiales modernos en excelente estado de conservación'],
    [/\b(jacuzzi|tina|spa)\b/i, 'ph-bathtub', 'Jacuzzi Privado', 'Área de confort y relajación en la propiedad'],
    [/\b(ascensor|ascensores)\b/i, 'ph-elevator', 'Ascensor Operativo', 'Fácil acceso vertical en la torre residencial']
];

function findFilesRecursive(dir, extFilter) {
    let results = [];
    if (!fs.existsSync(dir)) return results;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) {
            if (entry.name !== 'procesados') {
                results = results.concat(findFilesRecursive(fullPath, extFilter));
            }
        } else if (!extFilter || fullPath.toLowerCase().endsWith(extFilter.toLowerCase())) {
            results.push(fullPath);
        }
    }
    return results;
}

function unzipAllInLote(loteDir) {
    const zips = findFilesRecursive(loteDir, '.zip');
    const extracted = [];
    for (const z of zips) {
        const outDir = path.join(path.dirname(z), `unzipped_${path.basename(z, '.zip')}`);
        if (!fs.existsSync(outDir)) {
            fs.mkdirSync(outDir, { recursive: true });
            try {
                if (process.platform === 'win32') {
                    execFileSync('powershell.exe', ['-NoProfile', '-Command', `Expand-Archive -LiteralPath '${z}' -DestinationPath '${outDir}' -Force`]);
                } else {
                    execFileSync('unzip', ['-o', z, '-d', outDir]);
                }
                extracted.push(outDir);
            } catch (e) {
                console.warn(`[WARN] No se pudo descomprimir ${z}:`, e.message);
            }
        }
    }
    return extracted;
}

function isWhatsAppChatTxt(txtPath) {
    try {
        const sample = fs.readFileSync(txtPath, 'utf8').slice(0, 1500);
        return /(^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4},?\s+\d{1,2}:\d{2}|^\[\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})/m.test(sample);
    } catch (_) {
        return false;
    }
}

function parseWhatsAppDateTime(dateS, timeS) {
    try {
        const dParts = dateS.trim().split(/[\/\-\.]/).map(Number);
        if (dParts.length !== 3) return null;
        let [d, m, y] = dParts;
        if (y < 100) y += 2000;
        if (m > 12 && d <= 12) [d, m] = [m, d];

        const tLow = timeS.toLowerCase();
        const isPm = /p\.?\s*m\.?/.test(tLow);
        const isAm = /a\.?\s*m\.?/.test(tLow);
        const tNums = tLow.replace(/[^0-9:]/g, '').split(':').map(Number);
        let hr = tNums[0] || 0;
        const min = tNums[1] || 0;
        const sec = tNums[2] || 0;
        if (isPm && hr < 12) hr += 12;
        if (isAm && hr === 12) hr = 0;
        return new Date(y, m - 1, d, hr, min, sec);
    } catch (_) {
        return null;
    }
}

function parseTxtFile(txtPath) {
    const content = fs.readFileSync(txtPath, 'utf8');
    const lines = content.split(/\r?\n/);
    const messages = [];
    const baseStem = path.basename(txtPath, path.extname(txtPath));
    const groupName = ['_chat', 'chat'].includes(baseStem.toLowerCase()) ? path.basename(path.dirname(txtPath)) : baseStem;

    const patAndroid = /^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[apAP]\.?\s*[mM]\.?)?)\s*-\s*([^:]+):\s*(.*)$/;
    const patIos = /^\[(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[apAP]\.?\s*[mM]\.?)?)\]\s*([^:]+):\s*(.*)$/;
    const patAttach = /([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|webp))/gi;

    let currentMsg = null;

    for (const rawLine of lines) {
        const line = rawLine.replace(/[\u200e\u200f\u202a-\u202e\ufeff\u202f]/g, ' ').trim();
        if (!line) continue;

        const m = line.match(patAndroid) || line.match(patIos);
        if (m) {
            if (currentMsg) messages.push(currentMsg);
            const [, dateS, timeS, author, msgBody] = m;
            const attachments = [...new Set(msgBody.match(patAttach) || [])];
            const cleanBody = msgBody
                .replace(/<adjunto:\s*[^>]+>/gi, '')
                .replace(/<media omitted>/gi, '')
                .replace(/[a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|webp|mp4|pdf|opus)\s*\((?:archivo adjunto|file attached)\)/gi, '')
                .trim();

            currentMsg = {
                timestamp: parseWhatsAppDateTime(dateS, timeS),
                timestamp_str: `${dateS} ${timeS}`,
                author: author.trim(),
                text: cleanBody,
                attachments,
                group_name: groupName,
                source_file: txtPath,
                modo_entrada: 'modo_1_exportacion_whatsapp'
            };
        } else if (currentMsg) {
            if (/^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4},?\s+\d{1,2}:\d{2}/.test(line)) continue;
            const moreAtt = line.match(patAttach) || [];
            for (const a of moreAtt) {
                if (!currentMsg.attachments.includes(a)) currentMsg.attachments.push(a);
            }
            const cleanCont = line
                .replace(/<adjunto:\s*[^>]+>/gi, '')
                .replace(/<media omitted>/gi, '')
                .replace(/[a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|webp|mp4|pdf|opus)\s*\((?:archivo adjunto|file attached)\)/gi, '')
                .trim();
            if (cleanCont) {
                currentMsg.text = (currentMsg.text + '\n' + cleanCont).trim();
            }
        }
    }
    if (currentMsg) messages.push(currentMsg);
    return messages;
}

/**
 * Agrupa únicamente álbumes de fotos + descripción del mismo inmueble,
 * NUNCA mezclando propiedades distintas enviadas por el mismo asesor en el mismo minuto.
 */
function groupMessagesBySenderWindow(messages, windowMinutes = 3) {
    const activeByAuthor = new Map();
    const grouped = [];

    for (const msg of messages) {
        const cleanMsgText = (msg.text || '').trim();
        if (!cleanMsgText && msg.attachments.length === 0) continue;
        if (/^(this message was deleted|elimin[oó]\s+este\s+mensaje|mensaje\s+eliminado|multimedia\s+omitido|media\s+omitted)$/i.test(cleanMsgText) && msg.attachments.length === 0) continue;

        const key = `${msg.group_name}:::${msg.author}`;
        const prev = activeByAuthor.get(key);

        if (prev) {
            let withinTime = true;
            if (prev.timestamp && msg.timestamp) {
                const diffSec = Math.abs(msg.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
                withinTime = diffSec <= (windowMinutes * 60);
            }

            if (withinTime) {
                const prevText = (prev.text || '').trim();
                const prevHasText = prevText.length > 0;
                const msgHasText = cleanMsgText.length > 0;
                const prevAttCount = prev.attachments.length;
                const msgAttCount = msg.attachments.length;

                // Caso 1: El mensaje anterior tiene la descripción del inmueble (>= 45 chars)
                // y los mensajes siguientes son fotos sueltas del álbum sin texto.
                const isAlbumFollowupPhotos = (prevText.length >= 45 && !msgHasText && msgAttCount > 0);

                // Caso 2: Fotos sueltas consecutivas sin texto (construyendo un álbum de varias fotos).
                const isConsecutiveUncaptionedPhotos = (!prevHasText && prevAttCount > 0 && !msgHasText && msgAttCount > 0);

                // Caso 3: Álbum de >= 2 fotos sin texto seguido inmediatamente por el mensaje con la descripción.
                const isCaptionAfterMultiPhotoAlbum = (!prevHasText && prevAttCount >= 2 && msgHasText);

                if (isAlbumFollowupPhotos || isConsecutiveUncaptionedPhotos || isCaptionAfterMultiPhotoAlbum) {
                    if (msgHasText) prev.text = (prevText ? `${prevText}\n${cleanMsgText}` : cleanMsgText).trim();
                    for (const a of msg.attachments) {
                        if (!prev.attachments.includes(a)) prev.attachments.push(a);
                    }
                    if (msg.timestamp) prev.timestamp = msg.timestamp;
                    continue;
                }
            }
        }

        const nuevo = { ...msg, text: cleanMsgText, attachments: [...msg.attachments] };
        grouped.push(nuevo);
        activeByAuthor.set(key, nuevo);
    }
    return grouped;
}

function collectModes2And3(loteDir, usedImagesSet) {
    const extraBlocks = [];
    const imgExts = new Set(['.jpg', '.jpeg', '.png', '.webp']);

    function getAllDirs(d) {
        let list = [d];
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
            if (e.isDirectory() && e.name !== 'procesados') {
                list = list.concat(getAllDirs(path.join(d, e.name)));
            }
        }
        return list;
    }

    for (const folder of getAllDirs(loteDir)) {
        const entries = fs.readdirSync(folder, { withFileTypes: true });
        const imgs = entries
            .filter(e => e.isFile() && imgExts.has(path.extname(e.name).toLowerCase()) && !/^stk-/i.test(e.name))
            .map(e => path.resolve(folder, e.name))
            .filter(p => !usedImagesSet.has(p));

        const txtsNoChat = entries
            .filter(e => e.isFile() && path.extname(e.name).toLowerCase() === '.txt')
            .map(e => path.resolve(folder, e.name))
            .filter(p => !isWhatsAppChatTxt(p));

        const isManualSubfolder = /(inmueble|propiedad|captacion|item)[_\-\s]*\d+/i.test(path.basename(folder));
        if (txtsNoChat.length > 0 || (isManualSubfolder && imgs.length > 0)) {
            const textoManual = txtsNoChat.map(p => fs.readFileSync(p, 'utf8').trim()).join('\n').trim();
            imgs.forEach(im => usedImagesSet.add(im));
            extraBlocks.push({
                timestamp_str: new Date().toISOString().slice(0, 16).replace('T', ' '),
                author: path.basename(folder),
                text: textoManual,
                attachments: imgs.map(p => path.basename(p)),
                resolved_images: imgs,
                group_name: path.basename(folder),
                source_file: txtsNoChat[0] || folder,
                modo_entrada: 'modo_3_subcarpeta_manual',
                imagenes_son_screenshots: false
            });
            continue;
        }

        for (const im of imgs) {
            usedImagesSet.add(im);
            extraBlocks.push({
                timestamp_str: new Date().toISOString().slice(0, 16).replace('T', ' '),
                author: 'Captura WhatsApp Web',
                text: '',
                attachments: [path.basename(im)],
                resolved_images: [im],
                group_name: path.basename(folder),
                source_file: im,
                modo_entrada: 'modo_2_screenshot_whatsapp',
                imagenes_son_screenshots: true
            });
        }
    }
    return extraBlocks;
}

function normalizarTelefonoVE(raw) {
    if (!raw) return null;
    const m = raw.match(/(?:\+?58[\s\-\.]*|0)?(4(?:12|14|24|16|26|22)|276)[\s\-\.]*(\d{3})[\s\-\.]*(\d{2})[\s\-\.]*(\d{2})/);
    if (m) return `+58 ${m[1]} ${m[2]}${m[3]}${m[4]}`;
    const mCo = raw.match(/(?:\+?57[\s\-\.]*)(3\d{2})[\s\-\.]*(\d{3})[\s\-\.]*(\d{4})/);
    if (mCo) return `+57 ${mCo[1]} ${mCo[2]}${mCo[3]}`;
    return null;
}

function extraerAsesorExterno(author, text) {
    const tel = normalizarTelefonoVE(author) || normalizarTelefonoVE(text) || '+58 414 0000000';
    const cleanAuthor = String(author || '').replace(/[\+\d\-\s\(\)~]/g, '').trim();
    if (cleanAuthor.length >= 3 && !/^captura/i.test(cleanAuthor)) {
        return { nombre: String(author).replace(/~/g, '').trim(), telefono: tel };
    }
    const mCap = text.match(/(?:captador(?:a)?|asesor(?:a)?|corredor(?:a)?|lic\.?|ing\.?)[\s:\*]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,2})/i);
    if (mCap) {
        return { nombre: mCap[1].replace(/[\*📲]/g, '').trim(), telefono: tel };
    }
    const mRemax = text.match(/([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+)\s*\r?\n\s*(?:RE\/?MAX|C[ÚU]SPIDE|RENT[\-\s]*A[\-\s]*HOUSE|CENTURY|BROTHERS)/i);
    if (mRemax) {
        return { nombre: mRemax[1].trim(), telefono: tel };
    }
    return { nombre: 'Asesor Aliado Táchira', telefono: tel };
}

function esRequerimientoOBasura(text, hasImages, modoEntrada) {
    if (modoEntrada === 'modo_2_screenshot_whatsapp' && hasImages) return { basura: false, motivo: '' };
    const tLow = String(text || '').toLowerCase().trim();
    if (!tLow && !hasImages) return { basura: true, motivo: 'Mensaje vacío sin texto ni imágenes' };

    // Detectar requerimientos de búsqueda de clientes (NO son propiedades en oferta)
    const patRequerimiento = /\b(requiero|requerimos|se\s+requiere|tengo\s+el\s+siguiente\s+requerimiento|siguientes?\s+requerimientos?|requerimiento\s+de\s+(?:alquiler|compra|venta)|busco\s+(?:alquiler|apartamento|apto|casa|local|galp[oó]n|terreno|inmueble|quinta|propiedad|el\s+captador)|se\s+busca\s+(?:casa|apartamento|local|terreno)|solicito\s*:|solicito\s+en\s+(?:alquiler|venta)|tengo\s+un\s+excelente\s+cliente|para\s+cliente\s+repetido|quien\s+con\s+alquiler|quien\s+lleva\s+esta\s+captacion)\b/i;
    if (patRequerimiento.test(tLow)) {
        return { basura: true, motivo: 'Requerimiento de búsqueda de cliente / consulta de colega' };
    }

    if (tLow.length < 20 && !hasImages) {
        return { basura: true, motivo: 'Saludo / mensaje corto sin inmueble' };
    }
    return { basura: false, motivo: '' };
}

function resolverUbicacionOficialTachira(text) {
    for (const loc of UBICACIONES_TACHIRA_REGLAS) {
        if (loc.regex.test(text)) {
            return {
                sector_key: loc.key,
                sector_nombre: loc.label,
                municipio: loc.municipio,
                ubicacion: `${loc.label}, ${loc.municipio}, Táchira`,
                sector_desc: `Sector residencial ${loc.label}, Municipio ${loc.municipio}, Estado Táchira.`
            };
        }
    }
    return null;
}

async function fetchAsesoresMaximus(repoRoot) {
    const catalog = [...ASESORES_MAXIMUS_FALLBACK];
    try {
        const cfgContent = fs.readFileSync(path.join(repoRoot, 'js', 'config.js'), 'utf8');
        const mUrl = cfgContent.match(/SUPABASE_URL\s*:\s*['"]([^'"]+)['"]/);
        const mKey = cfgContent.match(/SUPABASE_ANON_KEY\s*:\s*['"]([^'"]+)['"]/);
        if (!mUrl || !mKey) return catalog;
        const url = mUrl[1].replace(/\/$/, ''), key = mKey[1].trim();
        for (const tb of ['asesores_maximus', 'equipo_web']) {
            const res = await fetch(`${url}/rest/v1/${tb}?select=*`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
            if (res.ok) {
                const rows = await res.json();
                for (const r of rows) {
                    const nom = String(r.nombre || '').trim();
                    if (nom && !catalog.some(c => c.nombre.toLowerCase() === nom.toLowerCase())) {
                        catalog.push({
                            id: String(r.id || ''),
                            nombre: nom,
                            cargo: String(r.cargo || 'Asesor Oficial MAXIMUS'),
                            telefono: String(r.telefono || r.whatsapp || '+58 424-1234567'),
                            keywords: [nom.toLowerCase(), nom.split(/\s+/).pop().toLowerCase()],
                            es_principal: false
                        });
                    }
                }
            }
        }
    } catch (_) {}
    return catalog;
}

function resolveAsesorMaximus(author, text, catalog) {
    const comb = `${author} ${text}`.toLowerCase();
    const uuidRgx = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    for (const a of catalog) {
        if ((a.keywords || []).some(kw => kw && comb.includes(kw))) {
            return {
                tipo_asesor: 'maximus',
                asesor_nombre: a.nombre,
                asesor_telefono: a.telefono,
                agente_id: uuidRgx.test(String(a.id)) ? a.id : null
            };
        }
    }
    const def = catalog.find(a => a.es_principal) || catalog[0];
    return {
        tipo_asesor: 'maximus',
        asesor_nombre: def.nombre,
        asesor_telefono: def.telefono,
        agente_id: uuidRgx.test(String(def.id)) ? def.id : null
    };
}

async function procesarLote(loteDir, repoRoot, windowMinutes = 3, overrideModo = null) {
    const rutaNorm = loteDir.toLowerCase().replace(/\\/g, '/');
    const esCaptacionMaximus = overrideModo ? overrideModo === 'maximus' : rutaNorm.includes('captaciones_maximus');
    const catalogoAsesores = esCaptacionMaximus ? await fetchAsesoresMaximus(repoRoot) : [];

    const procesadosDir = path.join(loteDir, 'procesados');
    fs.mkdirSync(procesadosDir, { recursive: true });

    const zipsDescomprimidos = unzipAllInLote(loteDir);
    const txtFilesModo1 = findFilesRecursive(loteDir, '.txt').filter(isWhatsAppChatTxt);

    const todosBloques = [];
    const usedImgs = new Set();

    for (const tf of txtFilesModo1) {
        const grouped = groupMessagesBySenderWindow(parseTxtFile(tf), windowMinutes);
        for (const g of grouped) {
            const resolved = g.attachments
                .filter(att => !/^stk-/i.test(att))
                .map(att => {
                    const p1 = path.resolve(path.dirname(g.source_file), att);
                    if (fs.existsSync(p1)) return p1;
                    const found = findFilesRecursive(loteDir, att);
                    return found.length > 0 ? path.resolve(found[0]) : null;
                }).filter(Boolean);
            g.resolved_images = resolved;
            g.imagenes_son_screenshots = false;
            resolved.forEach(im => usedImgs.add(im));
            todosBloques.push(g);
        }
    }

    const extraM2M3 = collectModes2And3(loteDir, usedImgs);
    todosBloques.push(...extraM2M3);

    const inmueblesValidos = [];
    const pendientesRevision = [];
    const descartados = [];

    todosBloques.forEach((item, i) => {
        const idx = i + 1;
        const tLow = (item.text || '').toLowerCase();
        const imgPaths = item.resolved_images || [];
        const modoEntrada = item.modo_entrada || 'modo_1_exportacion_whatsapp';
        const sonScreenshots = Boolean(item.imagenes_son_screenshots);

        const checkBasura = esRequerimientoOBasura(item.text, imgPaths.length > 0, modoEntrada);
        if (checkBasura.basura) {
            descartados.push({
                grupo: item.group_name,
                autor: item.author,
                motivo: checkBasura.motivo,
                extracto: (item.text || '').replace(/\s+/g, ' ').slice(0, 120)
            });
            return;
        }

        const esAlq = /\b(alquiler|alquila|alquilo|arriendo|canon|cano\b)\b/i.test(tLow);
        const esVen = /\b(venta|vende|vendo|inversi[oó]n|se\s+traspasa)\b/i.test(tLow);
        const operacion = esAlq && !esVen ? 'alquiler' : (esVen ? 'venta' : null);

        let tipoUi = null, tipoSqlDash = null, tipoSqlCanon = null;
        if (/\b(galp[oó]n|galpones|nave\s+industrial)\b/i.test(tLow)) [tipoUi, tipoSqlDash, tipoSqlCanon] = ['Galpones', 'galpones', 'galpon'];
        else if (/\b(local\s+comercial|local\b|oficina|consultorio|tienda\s+de\s+ropa|lavander[ií]a|fondo\s+de\s+comercio)\b/i.test(tLow)) [tipoUi, tipoSqlDash, tipoSqlCanon] = ['Local Comercial', 'local_comercial', 'local'];
        else if (/\b(finca|terreno|parcela|hect[aá]reas)\b/i.test(tLow)) [tipoUi, tipoSqlDash, tipoSqlCanon] = ['Fincas', 'fincas', 'terreno'];
        else if (/\b(casa\s+de\s+campo|chalet)\b/i.test(tLow)) [tipoUi, tipoSqlDash, tipoSqlCanon] = ['Casa de campo', 'casa_de_campo', 'casa'];
        else if (/\b(apartamento|apto|departamento|penthouse|p\.?h\.?|anexo|habitaciones\s+estudiantiles|habitaci[oó]n\s+en\s+alquiler|alquiler\s+de\s+habitaci[oó]n)\b/i.test(tLow)) [tipoUi, tipoSqlDash, tipoSqlCanon] = ['Departamento', 'departamento', 'apartamento'];
        else if (/\b(casa|quinta|townhouse|t\.?h\.?|terrazas\s+de\s+la\s+castellana)\b/i.test(tLow)) [tipoUi, tipoSqlDash, tipoSqlCanon] = ['Casa', 'casa', 'casa'];

        let precio = null;
        const cleanForPrice = item.text
            .replace(/\d+[\.,]?\d*\s*(?:litros|lts|m2|mts2|mts|mtrs2|metros|m²)/gi, ' ')
            .replace(/(?:\+?58|0414|0424|0412|0416|0426|0422)[\d\s\-\.]{7,12}/g, ' ');
        const priceRegexes = [
            /(?:precio|inversi[oó]n|canon|cano|valor)\s*:?\s*\*?\s*\$?\s*(\d{1,3}(?:[\.,]\d{3})+|\d{2,6})/gi,
            /(?:\$|usd)\s*(\d{1,3}(?:[\.,]\d{3})+|\d{2,6})/gi,
            /(\d{1,3}(?:[\.,]\d{3})+|\d{2,6})\s*(?:\$|💲|🇺🇸|usd|d[oó]lares)/gi
        ];
        for (const rgx of priceRegexes) {
            let m;
            while ((m = rgx.exec(cleanForPrice)) !== null) {
                const rawVal = m[1];
                const val = /^\d{1,3}([\.,]\d{3})+$/.test(rawVal) ? parseFloat(rawVal.replace(/[\.,]/g, '')) : parseFloat(rawVal.replace(',', '.'));
                if (operacion === 'venta' && val >= 5000) { precio = val; break; }
                if (operacion === 'alquiler' && val >= 50 && val <= 25000) { precio = val; break; }
                if (!operacion && val >= 50) { precio = val; break; }
            }
            if (precio) break;
        }

        // Resolución estricta de ubicación contra la plantilla oficial UBICACIONES_TACHIRA
        const locOficial = resolverUbicacionOficialTachira(item.text);

        let habitaciones = 0;
        const mHab = tLow.match(/\b(\d{1,2})\s*(?:habitaciones|habitaci[oó]n|habs?\.?|dormitorios|cub[ií]culos|[aá]reas\s+de\s+oficina)\b/);
        if (mHab) {
            habitaciones = parseInt(mHab[1], 10);
        } else if (/\btres\s+habitaciones\b/i.test(tLow)) {
            habitaciones = 3;
        } else if (/\bdos\s+(?:habitaciones|cub[ií]culos|[aá]reas\s+de\s+oficina)\b/i.test(tLow) || (/\bhabitaci[oó]n\s+principal\b/i.test(tLow) && /\buna\s+habitaciones?\s+auxiliar/i.test(tLow))) {
            habitaciones = 2;
        } else if (/\b(?:habitaciones\s+estudiantiles|habitaci[oó]n\s+en\s+alquiler|alquiler\s+de\s+habitaci[oó]n)\b/i.test(tLow)) {
            habitaciones = 1;
        }
        if (/\bhabitaci[oó]n\s+principal\b/i.test(tLow) && /\b2\s+habitaciones\s+auxiliares\b/i.test(tLow)) {
            habitaciones = 3;
        }

        let banos = 0;
        const mBan = tLow.match(/\b(\d{1,2}(?:[\.,]5)?)\s*(?:ba[ñn]os?|sanitarios)\b/);
        if (mBan) {
            banos = parseFloat(mBan[1].replace(',', '.'));
        } else if (/\bdos\s+ba[ñn]os\b/i.test(tLow) || (/\bba[ñn]o\s+de\s+uso\s+com[uú]n\b/i.test(tLow) && /\bba[ñn]o\s+privado\b/i.test(tLow))) {
            banos = 2;
        } else if (/\bba[ñn]o\s+privado\b|\bba[ñn]o\s+compartido\b|\b1\s+ba[ñn]o\b/i.test(tLow)) {
            banos = 1;
        }

        const mEst = tLow.match(/\b(\d{1,2})\s*(?:puestos?|estacionamientos?|p\.?\s*e\.?|veh[ií]culos?|garaje|garage)\b/);
        const estacInt = mEst ? parseInt(mEst[1], 10) : (/\b(un\s+puesto\s+de\s+estacionamiento|estacionamiento\s+techado|garage|garaje)\b/i.test(tLow) && !/sin\s+estacionamiento/i.test(tLow) ? 1 : 0);
        const estacUi = estacInt > 0 ? `${estacInt} Puesto${estacInt === 1 ? '' : 's'}` : (/pie\s+de\s+calle/i.test(tLow) ? 'A pie de calle' : 'Sin puesto propio');

        const mM2 = tLow.match(/\b(\d{2,5}(?:[\.,]\d{1,2})?)\s*(?:m2\b|mts2\b|mtrs2\b|mts\b|metros\b|m²|mts²)/i);
        const m2 = mM2 ? parseFloat(mM2[1].replace(',', '.')) : 0;

        let asesorNombre, asesorTel, tipoAsesor, agenteId;
        if (esCaptacionMaximus) {
            const info = resolveAsesorMaximus(item.author, item.text, catalogoAsesores);
            asesorNombre = info.asesor_nombre;
            asesorTel = info.asesor_telefono;
            tipoAsesor = 'maximus';
            agenteId = info.agente_id;
        } else {
            const extInfo = extraerAsesorExterno(item.author, item.text);
            asesorNombre = extInfo.nombre;
            asesorTel = extInfo.telefono;
            tipoAsesor = 'externo';
            agenteId = null;
        }

        const faltantes = [];
        if (!operacion) faltantes.push('Tipo de Operación');
        if (!tipoUi) faltantes.push('Tipo de Inmueble');
        if (!precio || precio <= 0) faltantes.push('Precio');
        if (!locOficial) faltantes.push('Ubicación Oficial (Plantilla UBICACIONES_TACHIRA)');
        if (imgPaths.length === 0) faltantes.push('Fotografías del Inmueble (Mensaje sin foto adjunta)');

        if (faltantes.length > 0) {
            pendientesRevision.push({
                temp_id: `PEND-${String(pendientesRevision.length + 1).padStart(3, '0')}`,
                modo_entrada: modoEntrada,
                imagenes_son_screenshots: sonScreenshots,
                es_captacion_maximus: esCaptacionMaximus,
                motivo: `Regla de Oro 1 (Cero Invención) — Faltan: ${faltantes.join(', ')}${sonScreenshots ? ' [Screenshot WhatsApp Web: Requiere lectura por Visión del Agente]' : ''}`,
                campos_faltantes: faltantes,
                requiere_vision_llm: imgPaths.length > 0,
                grupo_origen: item.group_name,
                fecha_mensaje: item.timestamp_str,
                tipo_asesor: tipoAsesor,
                asesor_nombre: asesorNombre,
                asesor_telefono: asesorTel,
                agente_id: agenteId,
                sector_detectado: locOficial ? locOficial.sector_nombre : 'No especificada en plantilla',
                operacion_detectada: operacion,
                tipo_detectado: tipoUi,
                precio_detectado: precio,
                metros_cuadrados: m2,
                imagenes_locales: imgPaths,
                texto_original: item.text
            });
            return;
        }

        const { sector_key: sectorKey, sector_nombre: sectorNombre, ubicacion, sector_desc: sectorDesc } = locOficial;

        const aspectos = [];
        for (const [rgx, ico, tit, desc] of REGLAS_ASPECTOS) {
            if (rgx.test(item.text) && aspectos.length < 4) {
                aspectos.push({ icono: ico, titulo: tit, desc });
            }
        }

        // Fallbacks diferenciados: "Gestión MAXIMUS" es EXCLUSIVO de `captaciones_maximus/`
        const fallbacks = esCaptacionMaximus
            ? [
                { icono: 'ph-trend-up', titulo: 'Zona de Alta Demanda', desc: `Ubicación consolidada en ${sectorNombre}` },
                { icono: 'ph-car', titulo: `Estacionamiento: ${estacUi}`, desc: 'Fácil acceso vehicular' },
                { icono: 'ph-star', titulo: 'Distribución Funcional', desc: 'Ambientes iluminados y ventilados' },
                { icono: 'ph-check', titulo: 'Gestión MAXIMUS', desc: 'Captación directa exclusiva con respaldo de nuestra agencia' }
            ]
            : [
                { icono: 'ph-trend-up', titulo: 'Zona de Alta Demanda', desc: `Ubicación consolidada en ${sectorNombre}` },
                { icono: 'ph-car', titulo: `Estacionamiento: ${estacUi}`, desc: 'Comodidad de acceso en la propiedad' },
                { icono: 'ph-star', titulo: 'Distribución Funcional', desc: 'Ambientes iluminados y ventilados' },
                { icono: 'ph-shield-check', titulo: 'Disponibilidad Verificada', desc: 'Propiedad activa disponible para visitas previa cita' }
            ];

        for (const fb of fallbacks) {
            if (aspectos.length >= 4) break;
            if (!aspectos.some(a => a.titulo === fb.titulo)) {
                aspectos.push(fb);
            }
        }

        const precioM2 = m2 > 0 ? Math.round(precio / m2) : 0;
        let etiquetaTitulo = tipoUi === 'Departamento' ? 'Apartamento' : tipoUi;
        if (/\boficina\b/i.test(tLow)) etiquetaTitulo = 'Oficina Comercial';
        else if (/\bhabitaciones\s+estudiantiles|habitaci[oó]n\s+en\s+alquiler|alquiler\s+de\s+habitaci[oó]n\b/i.test(tLow)) etiquetaTitulo = 'Habitación Equipada';
        else if (/\banexo\b/i.test(tLow)) etiquetaTitulo = 'Apartamento Anexo';

        inmueblesValidos.push({
            temp_id: `CAND-${String(inmueblesValidos.length + 1).padStart(3, '0')}`,
            modo_entrada: modoEntrada,
            imagenes_son_screenshots: sonScreenshots,
            flujo_carpeta: esCaptacionMaximus ? 'captaciones_maximus' : 'captaciones_externas',
            grupo_origen: item.group_name,
            fecha_mensaje: item.timestamp_str,
            titulo: `${etiquetaTitulo} en ${sectorNombre}`,
            subtitulo: esCaptacionMaximus
                ? `Captación Exclusiva MAXIMUS en ${ubicacion} con respaldo legal`
                : `Propiedad en ${operacion} ubicada en ${ubicacion}`,
            tipo_ui: tipoUi,
            tipo_sql_dashboard: tipoSqlDash,
            tipo_sql_canonical: tipoSqlCanon,
            operacion_ui: operacion.toUpperCase(),
            operacion,
            precio,
            moneda: operacion === 'alquiler' ? 'USD/mes' : 'USD',
            precio_m2: precioM2,
            precio_m2_ui: precioM2 > 0 ? `$${precioM2} USD / m²` : 'N/D',
            sector_key: sectorKey,
            ubicacion,
            estado: 'Táchira',
            sector_nombre: sectorNombre,
            sector_desc: sectorDesc,
            habitaciones,
            banos,
            estacionamientos: estacInt,
            estacionamientos_ui: estacUi,
            metros_cuadrados: m2,
            is_maximus: esCaptacionMaximus,
            en_oferta: esCaptacionMaximus,
            tipo_asesor: tipoAsesor,
            asesor_nombre: asesorNombre,
            asesor_telefono: asesorTel,
            agente_id: agenteId,
            comision_porcentaje: 5.0,
            descripcion: `Excelente opción de ${etiquetaTitulo.toLowerCase()} en ${operacion} ubicada en ${ubicacion}. Cuenta con ${habitaciones} habitación(es)/ambiente(s), ${banos} baño(s)${m2 > 0 ? `, ${m2} m²` : ''} y estacionamiento (${estacUi}).\n\nDetalles: ${item.text.replace(/\s+/g, ' ')}`,
            aspectos_destacados: aspectos,
            amenidades_str: aspectos.map(a => a.titulo).join(', '),
            amenidades: aspectos.map(a => ({ icono: 'ph-check', nombre: a.titulo })),
            imagenes_locales: imgPaths,
            fotos: [],
            foto_principal: null,
            texto_original: item.text
        });
    });

    const outData = {
        lote: path.basename(loteDir),
        flujo_carpeta: esCaptacionMaximus ? 'captaciones_maximus' : 'captaciones_externas',
        is_maximus_default: esCaptacionMaximus,
        fecha_procesamiento: new Date().toISOString(),
        zips_descomprimidos: zipsDescomprimidos,
        archivos_txt_modo1_leidos: txtFilesModo1.length,
        entradas_modo2_y_modo3: extraM2M3.length,
        total_extraidos_completos: inmueblesValidos.length,
        total_pendientes_revision: pendientesRevision.length,
        total_descartados_basura_o_busqueda: descartados.length,
        inmuebles: inmueblesValidos,
        pendientes_revision: pendientesRevision,
        descartados
    };
    fs.writeFileSync(path.join(procesadosDir, 'inmuebles_extraidos.json'), JSON.stringify(outData, null, 2), 'utf8');

    let md = `# Reporte de Inmuebles Pendientes de Revisión (\`${path.basename(loteDir)}\`)\n\n> **Regla de Oro 1 (Cero Invención):** Ninguno de estos inmuebles fue inventado ni subido a Supabase.\n\n`;
    if (pendientesRevision.length === 0) {
        md += `✅ **No hay inmuebles pendientes de revisión en este lote.**\n`;
    } else {
        for (const p of pendientesRevision) {
            md += `## 🔹 \`${p.temp_id}\` — Modo: \`${p.modo_entrada}\` — Sector: ${p.sector_detectado}\n- **Motivo:** ${p.motivo}\n- **Asesor (${p.tipo_asesor}):** ${p.asesor_nombre} (\`${p.asesor_telefono}\`)\n- **Imágenes:** \`${p.imagenes_locales.map(x => path.basename(x)).join(', ')}\`\n- **Texto:** \`${(p.texto_original || '').replace(/\n/g, ' ')}\`\n\n`;
        }
    }
    fs.writeFileSync(path.join(loteDir, 'pendientes_revision.md'), md, 'utf8');
    return outData;
}

if (require.main === module) {
    const args = process.argv.slice(2);
    const loteIdx = args.indexOf('--lote');
    if (loteIdx === -1 || !args[loteIdx + 1]) {
        console.log('Uso: node parse_whatsapp_batch.js --lote <ruta_lote> [--window-minutes 3] [--modo-captacion externas|maximus]');
        process.exit(0);
    }
    const winIdx = args.indexOf('--window-minutes');
    const winMin = (winIdx !== -1 && args[winIdx + 1]) ? parseInt(args[winIdx + 1], 10) : 3;
    const modoIdx = args.indexOf('--modo-captacion');
    const overrideModo = (modoIdx !== -1 && args[modoIdx + 1]) ? args[modoIdx + 1] : null;
    const repoRoot = path.resolve(__dirname, '..', '..', '..', '..');
    procesarLote(path.resolve(args[loteIdx + 1]), repoRoot, winMin, overrideModo).then(res => {
        console.log(`[OK] Lote '${res.lote}' (${res.flujo_carpeta}) procesado: ${res.total_extraidos_completos} completos, ${res.total_pendientes_revision} en pendientes_revision.md, ${res.total_descartados_basura_o_busqueda} descartados.`);
    });
}
