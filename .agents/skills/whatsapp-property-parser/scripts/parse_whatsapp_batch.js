#!/usr/bin/env node
/**
 * MAXIMUS Inmobiliaria - Skill 1: whatsapp-property-parser (Node.js Multi-Formato & Dual-Flow)
 * ============================================================================================
 * Soporta:
 *   1. Separación de flujos por carpeta:
 *      - `captaciones_externas/` -> is_maximus = false, Asesor Externo
 *      - `captaciones_maximus/`  -> is_maximus = true, Asesor Oficial MAXIMUS (consultando
 *        `public.asesores_maximus` y `public.equipo_web` en Supabase)
 *   2. 3 Modos de entrada:
 *      - Modo 1: Exportación nativa (.zip auto-descomprimido o _chat.txt + fotos), agrupando
 *        fotos + texto del mismo remitente en ventana de ±3 minutos sin mezclar otros autores.
 *      - Modo 2: Captura de pantalla completa de WhatsApp Web (`screenshot`).
 *      - Modo 3: Subcarpetas manuales (`inmueble_01/` con `info.txt` + fotos).
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

const ZONAS_TACHIRA = [
    [/\b(barrio\s+obrero|b\.?o\.?|pasaje\s+acueducto|plaza\s+los\s+mangos|carrera\s+1[89]|calle\s+1[0-5])\b/i, 'Barrio Obrero', 'Barrio Obrero, San Cristóbal', 'Zona comercial y residencial consolidada en el corazón de San Cristóbal, con acceso inmediato a servicios, gastronomía y transporte.'],
    [/\b(pueblo\s+nuevo|av\.?\s+espa[ñn]a|plaza\s+de\s+toros|pol[ií]gono\s+de\s+tiro|los\s+kioscos)\b/i, 'Pueblo Nuevo', 'Pueblo Nuevo, San Cristóbal', 'Sector residencial de altísima demanda y plusvalía continua en San Cristóbal, rodeado de centros empresariales, clínicas y comercios exclusivos.'],
    [/\b(guaparo|urb\.?\s+guaparo)\b/i, 'Urbanización Guaparo', 'Urbanización Guaparo, San Cristóbal', 'Ubicada en una de las zonas residenciales más consolidadas, seguras y cotizadas de San Cristóbal.'],
    [/\b(pirineos\s+ii|pirineos\s+2|pirineos\s+i|los\s+pirineos|pirineos|don\s+bosco)\b/i, 'Los Pirineos', 'Los Pirineos, San Cristóbal', 'Zona alta residencial caracterizada por su clima fresco de montaña, urbanismos organizados y excelente conectividad vial.'],
    [/\b(quinimar[ií]|urb\.?\s+quinimar[ií])\b/i, 'Quinimarí', 'Quinimarí, San Cristóbal', 'Sector residencial exclusivo al este de la ciudad con clima fresco, tranquilidad y excelente entorno familiar.'],
    [/\b(las\s+lomas|av\.?\s+libertador)\b/i, 'Las Lomas', 'Las Lomas, San Cristóbal', 'Sector residencial tranquilo, seguro y cercano a las principales arterias viales de San Cristóbal.'],
    [/\b(zona\s+industrial\s+paramillo|z\.?i\.?\s+paramillo)\b/i, 'Zona Industrial Paramillo', 'Zona Industrial Paramillo, San Cristóbal', 'Zona industrial consolidada al norte de la ciudad con fácil acceso para transporte pesado y logística.'],
    [/\b(paramillo|altos\s+de\s+paramillo|colinas\s+de\s+paramillo)\b/i, 'Paramillo', 'Paramillo, San Cristóbal', 'Sector de alto crecimiento urbanístico y residencial al norte de San Cristóbal, con excelente proyección de revalorización.'],
    [/\b(zona\s+industrial\s+barrancas|barrancas)\b/i, 'Zona Industrial Barrancas', 'Zona Industrial Barrancas, San Cristóbal', 'Complejo industrial y comercial estratégico con amplias vías de acceso para carga y operaciones corporativas.'],
    [/\b(av\.?\s+19\s+de\s+abril|19\s+de\s+abril)\b/i, 'Av. 19 de Abril', 'Av. 19 de Abril, San Cristóbal', 'Arteria comercial y empresarial neurálgica de la ciudad con máxima visibilidad para marcas líderes.'],
    [/\b(la\s+castellana|urb\.?\s+la\s+castellana|av\.?\s+ferrero\s+tamayo|ferrero\s+tamayo)\b/i, 'La Castellana', 'La Castellana, San Cristóbal', 'Excelente sector residencial y comercial de la parte alta de San Cristóbal con rápido acceso a toda la ciudad.'],
    [/\b(el\s+bosque|res\.?\s+el\s+bosque)\b/i, 'Residencias El Bosque', 'Residencias El Bosque, San Cristóbal', 'Conjunto residencial estratégico con excelente ubicación y acceso directo a las principales avenidas.'],
    [/\b(sambil|c\.?c\.?\s+sambil)\b/i, 'C.C. Sambil', 'C.C. Sambil, San Cristóbal', 'Principal centro comercial y de negocios del Estado Táchira con tráfico peatonal garantizado y seguridad integral.'],
    [/\b(la\s+concordia|marginal\s+del\s+torbes)\b/i, 'La Concordia', 'La Concordia, San Cristóbal', 'Zona de intensa actividad comercial, de transporte y de servicios en San Cristóbal.'],
    [/\b(la\s+ermita|centro|5ta\s+avenida|7ma\s+avenida|quinta\s+avenida|septima\s+avenida)\b/i, 'Centro de San Cristóbal', 'Centro, San Cristóbal', 'Núcleo comercial tradicional de San Cristóbal con altísimo flujo peatonal y conectividad urbana.'],
    [/\b(santa\s+teresa|hospital\s+central|av\.?\s+lucio\s+oquendo)\b/i, 'Santa Teresa', 'Santa Teresa, San Cristóbal', 'Sector estratégico cercano al complejo médico asistencial y universidades de la ciudad.'],
    [/\b(palo\s+gordo|las\s+vegas\s+de\s+t[aá]riba|v[ií]a\s+palo\s+gordo)\b/i, 'Palo Gordo', 'Palo Gordo, Cárdenas', 'Sector residencial tranquilo de clima fresco entre San Cristóbal y Cárdenas con alta demanda familiar.'],
    [/\b(t[aá]riba|colinas\s+de\s+t[aá]riba|tucap[eé]|el\s+diamante|las\s+margaritas)\b/i, 'Táriba', 'Táriba, Cárdenas', 'Zona residencial de clima agradable y tradición familiar en el Municipio Cárdenas, a pocos minutos de San Cristóbal.'],
    [/\b(palmira|el\s+abejal|la\s+flautera|patiecitos|gu[aá]simos)\b/i, 'Palmira', 'Palmira, Guásimos', 'Sector de clima frío de montaña y ambiente tranquilo en el Municipio Guásimos, con excelente calidad de vida.'],
    [/\b(cordero|lomas\s+blancas|andr[eé]s\s+bello)\b/i, 'Cordero', 'Cordero, Andrés Bello', 'Población andina de clima fresco de montaña y entorno agrícola y residencial seguro.'],
    [/\b(rubio|jun[ií]n|las\s+dantas)\b/i, 'Rubio', 'Rubio, Junín', 'Importante ciudad del eje sur-occidental del Táchira con pujante actividad comercial y cafetalera.'],
    [/\b(san\s+antonio|ure[ñn]a)\b/i, 'San Antonio del Táchira', 'San Antonio, Bolívar', 'Eje fronterizo comercial e industrial estratégico del Estado Táchira.'],
    [/\b(la\s+fr[ií]a|garc[ií]a\s+de\s+hevia)\b/i, 'La Fría', 'La Fría, García de Hevia', 'Centro agroindustrial y logístico de la zona norte del Estado Táchira.'],
    [/\b(la\s+grita|j[aá]uregui)\b/i, 'La Grita', 'La Grita, Jáuregui', 'Ciudad histórica y agrícola de alta montaña en el Estado Táchira.']
];

const REGLAS_ASPECTOS = [
    [/\b(piscina|sol[aá]rium)\b/i, 'ph-waves', 'Piscina y Área Social', 'Espacio recreativo ideal para el disfrute familiar'],
    [/\b(planta\s+el[eé]ctrica|generador|planta\s+100%|planta\s+total)\b/i, 'ph-lightning', 'Autonomía Eléctrica', 'Respaldo de energía mediante planta eléctrica'],
    [/\b(tanque|pozo|hidroneum[aá]tico|reserva\s+de\s+agua|agua\s+constante)\b/i, 'ph-drop', 'Reserva Hídrica Garantizada', 'Sistema de almacenamiento de agua con hidroneumático'],
    [/\b(vigilancia|conjunto\s+cerrado|seguridad\s+24|garita|cerco\s+el[eé]ctrico|port[oó]n\s+el[eé]ctrico)\b/i, 'ph-shield-check', 'Seguridad Privada 24/7', 'Control de acceso y resguardo continuo en el conjunto'],
    [/\b(amoblad[oa]|equipad[oa])\b/i, 'ph-armchair', 'Equipamiento y Mobiliario', 'Se entrega con mobiliario y equipamiento listo para habitar'],
    [/\b(cocina\s+empotrada|tope\s+de\s+granito|cocina\s+moderna|cocina\s+italiana|cuarzo)\b/i, 'ph-cooking-pot', 'Cocina Moderna Equipada', 'Acabados de primera línea y excelente distribución funcional'],
    [/\b(fibra\s+[oó]ptica|internet|wifi)\b/i, 'ph-wifi-high', 'Conectividad Fibra Óptica', 'Servicio de internet de alta velocidad instalado'],
    [/\b(aire\s+acondicionado|a\/a|split|climatizad[oa])\b/i, 'ph-snowflake', 'Ambientes Climatizados', 'Unidades de aire acondicionado instaladas'],
    [/\b(terraza|balc[oó]n|vista\s+panor[aá]mica|vista\s+a\s+la\s+monta[ñn]a)\b/i, 'ph-sun-horizon', 'Terraza con Vista Panorámica', 'Iluminación natural y ventilación privilegiada'],
    [/\b(jard[ií]n|[aá]reas\s+verdes|patio|parrillera|social)\b/i, 'ph-tree', 'Jardín y Áreas Verdes', 'Espacios exteriores integrados para esparcimiento'],
    [/\b(estrenar|nuevo|remodelad[oa]|lujo|m[aá]rmol|porcelanato)\b/i, 'ph-sparkle', 'Acabados de Primera', 'Materiales modernos en excelente estado de conservación'],
    [/\b(jacuzzi|tina|spa)\b/i, 'ph-bathtub', 'Jacuzzi Privado', 'Área de confort y relajación en la propiedad'],
    [/\b(ascensor)\b/i, 'ph-elevator', 'Ascensor Operativo', 'Fácil acceso vertical en la torre residencial']
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

function groupMessagesBySenderWindow(messages, windowMinutes = 3) {
    const activeByAuthor = new Map();
    const grouped = [];

    for (const msg of messages) {
        if (!msg.text && msg.attachments.length === 0) continue;
        if (/elimin[oó]\s+este\s+mensaje|multimedia\s+omitido/i.test(msg.text) && msg.attachments.length === 0) continue;

        const key = `${msg.group_name}:::${msg.author}`;
        const prev = activeByAuthor.get(key);

        if (prev) {
            let withinTime = true;
            if (prev.timestamp && msg.timestamp) {
                const diffSec = Math.abs(msg.timestamp.getTime() - prev.timestamp.getTime()) / 1000;
                withinTime = diffSec <= (windowMinutes * 60);
            }
            const bothLong = prev.text.trim().length > 120 && msg.text.trim().length > 120;
            if (withinTime && !bothLong) {
                if (msg.text) prev.text = (prev.text + '\n' + msg.text).trim();
                for (const a of msg.attachments) {
                    if (!prev.attachments.includes(a)) prev.attachments.push(a);
                }
                if (msg.timestamp) prev.timestamp = msg.timestamp;
                continue;
            }
        }

        const nuevo = { ...msg, attachments: [...msg.attachments] };
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
            .filter(e => e.isFile() && imgExts.has(path.extname(e.name).toLowerCase()))
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
    const m = raw.match(/(?:\+?58[\s\-]*|0)?(4(?:12|14|24|16|26)|276)[\s\-]*(\d{3})[\s\-]*(\d{2})[\s\-]*(\d{2})/);
    if (m) return `+58 ${m[1]} ${m[2]}${m[3]}${m[4]}`;
    const mCo = raw.match(/(?:\+?57[\s\-]*)(3\d{2})[\s\-]*(\d{3})[\s\-]*(\d{4})/);
    if (mCo) return `+57 ${mCo[1]} ${mCo[2]}${mCo[3]}`;
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
            const resolved = g.attachments.map(att => {
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
        const tLow = item.text.toLowerCase();
        const imgPaths = item.resolved_images || [];
        const modoEntrada = item.modo_entrada || 'modo_1_exportacion_whatsapp';
        const sonScreenshots = Boolean(item.imagenes_son_screenshots);

        if (modoEntrada !== 'modo_2_screenshot_whatsapp') {
            if (/\b(busco\s+(?:apartamento|apto|casa|local|galp[oó]n|terreno|inmueble|quinta)|cliente\s+(?:busca|solicita)|solicito\s+en\s+(?:alquiler|venta))\b/i.test(tLow) &&
                !/\b(en\s+venta|se\s+vende|se\s+alquila)\b/i.test(tLow)) {
                descartados.push({ grupo: item.group_name, autor: item.author, motivo: 'Requerimiento de búsqueda de cliente', extracto: item.text.slice(0, 120) });
                return;
            }
            if (tLow.length < 20 && imgPaths.length === 0) {
                descartados.push({ grupo: item.group_name, autor: item.author, motivo: 'Saludo / mensaje corto sin inmueble', extracto: item.text.slice(0, 120) });
                return;
            }
        }

        const esAlq = /\b(alquiler|alquila|alquilo|arriendo|canon)\b/i.test(tLow);
        const esVen = /\b(venta|vende|vendo|inversi[oó]n)\b/i.test(tLow);
        const operacion = esAlq && !esVen ? 'alquiler' : (esVen ? 'venta' : null);

        let tipoUi = null, tipoSqlDash = null, tipoSqlCanon = null;
        if (/\b(galp[oó]n|galpones|nave\s+industrial)\b/i.test(tLow)) [tipoUi, tipoSqlDash, tipoSqlCanon] = ['Galpones', 'galpones', 'galpon'];
        else if (/\b(local\s+comercial|local\b|oficina|consultorio)\b/i.test(tLow)) [tipoUi, tipoSqlDash, tipoSqlCanon] = ['Local Comercial', 'local_comercial', 'local'];
        else if (/\b(finca|terreno|parcela|hect[aá]reas)\b/i.test(tLow)) [tipoUi, tipoSqlDash, tipoSqlCanon] = ['Fincas', 'fincas', 'terreno'];
        else if (/\b(casa\s+de\s+campo|chalet)\b/i.test(tLow)) [tipoUi, tipoSqlDash, tipoSqlCanon] = ['Casa de campo', 'casa_de_campo', 'casa'];
        else if (/\b(apartamento|apto|departamento|penthouse|p\.?h\.?)\b/i.test(tLow)) [tipoUi, tipoSqlDash, tipoSqlCanon] = ['Departamento', 'departamento', 'apartamento'];
        else if (/\b(casa|quinta|townhouse|t\.?h\.?)\b/i.test(tLow)) [tipoUi, tipoSqlDash, tipoSqlCanon] = ['Casa', 'casa', 'casa'];

        let precio = null;
        const cleanForPrice = item.text.replace(/\d+[\.,]?\d*\s*(?:litros|lts|m2|mts2|mts|metros|m²)/gi, ' ');
        const mPrice = cleanForPrice.match(/(?:precio|inversi[oó]n|canon|valor|\$|usd)\s*:?\s*\$?\s*(\d{1,3}(?:[\.,]\d{3})+|\d{3,6})/i) ||
                       cleanForPrice.match(/(\d{1,3}(?:[\.,]\d{3})+|\d{3,6})\s*(?:\$|usd)/i);
        if (mPrice) {
            const rawVal = mPrice[1];
            precio = /^\d{1,3}([\.,]\d{3})+$/.test(rawVal) ? parseFloat(rawVal.replace(/[\.,]/g, '')) : parseFloat(rawVal.replace(',', '.'));
        }

        let [sectorNombre, ubicacion, sectorDesc] = ['San Cristóbal', 'San Cristóbal, Táchira', 'Ubicación estratégica en San Cristóbal, Estado Táchira.'];
        for (const [rgx, sNom, ubi, sDesc] of ZONAS_TACHIRA) {
            if (rgx.test(item.text)) {
                [sectorNombre, ubicacion, sectorDesc] = [sNom, ubi, sDesc];
                break;
            }
        }

        const mHab = tLow.match(/\b(\d{1,2})\s*(?:habitaciones|habitaci[oó]n|habs?\.?|dormitorios)\b/);
        const habitaciones = mHab ? parseInt(mHab[1], 10) : 0;
        const mBan = tLow.match(/\b(\d{1,2}(?:[\.,]5)?)\s*(?:ba[ñn]os?|sanitarios)\b/);
        const banos = mBan ? parseFloat(mBan[1].replace(',', '.')) : 0;
        const mEst = tLow.match(/\b(\d{1,2})\s*(?:puestos?|estacionamientos?|p\/e|veh[ií]culos?|garaje)\b/);
        const estacInt = mEst ? parseInt(mEst[1], 10) : 0;
        const estacUi = mEst ? `${estacInt} Puesto${estacInt === 1 ? '' : 's'}` : (/pie\s+de\s+calle/i.test(tLow) ? 'A pie de calle' : 'No especificado');
        const mM2 = tLow.match(/\b(\d{2,5}(?:[\.,]\d{1,2})?)\s*(?:m2|mts2|mts|m²)\b/);
        const m2 = mM2 ? parseFloat(mM2[1].replace(',', '.')) : 0;

        let asesorNombre, asesorTel, tipoAsesor, agenteId;
        if (esCaptacionMaximus) {
            const info = resolveAsesorMaximus(item.author, item.text, catalogoAsesores);
            asesorNombre = info.asesor_nombre;
            asesorTel = info.asesor_telefono;
            tipoAsesor = 'maximus';
            agenteId = info.agente_id;
        } else {
            asesorTel = normalizarTelefonoVE(item.author) || normalizarTelefonoVE(item.text) || '+58 414 0000000';
            asesorNombre = item.author.replace(/[\+\d\-\s\(\)~]/g, '').trim().length >= 3 && item.author !== 'Captura WhatsApp Web'
                ? item.author.replace(/~/g, '').trim()
                : 'Asesor Aliado Táchira';
            tipoAsesor = 'externo';
            agenteId = null;
        }

        const faltantes = [];
        if (!operacion) faltantes.push('Tipo de Operación');
        if (!tipoUi) faltantes.push('Tipo de Inmueble');
        if (!precio || precio <= 0) faltantes.push('Precio');

        if (faltantes.length > 0) {
            pendientesRevision.push({
                temp_id: `PEND-${String(idx).padStart(3, '0')}`,
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
                sector_detectado: sectorNombre,
                operacion_detectada: operacion,
                tipo_detectado: tipoUi,
                precio_detectado: precio,
                metros_cuadrados: m2,
                imagenes_locales: imgPaths,
                texto_original: item.text
            });
            return;
        }

        const aspectos = [];
        for (const [rgx, ico, tit, desc] of REGLAS_ASPECTOS) {
            if (rgx.test(item.text) && aspectos.length < 4) aspectos.push({ icono: ico, titulo: tit, desc });
        }
        while (aspectos.length < 4) {
            const fallbacks = [
                { icono: 'ph-trend-up', titulo: 'Zona de Alta Demanda', desc: `Ubicación consolidada en ${sectorNombre}` },
                { icono: 'ph-car', titulo: `Estacionamiento: ${estacUi}`, desc: 'Fácil acceso vehicular' },
                { icono: 'ph-star', titulo: 'Distribución Funcional', desc: 'Ambientes iluminados y ventilados' },
                { icono: 'ph-check', titulo: 'Gestión MAXIMUS', desc: 'Respaldo comercial en toda la negociación' }
            ];
            aspectos.push(fallbacks[aspectos.length]);
        }

        const precioM2 = m2 > 0 ? Math.round(precio / m2) : 0;
        inmueblesValidos.push({
            temp_id: `CAND-${String(inmueblesValidos.length + 1).padStart(3, '0')}`,
            modo_entrada: modoEntrada,
            imagenes_son_screenshots: sonScreenshots,
            flujo_carpeta: esCaptacionMaximus ? 'captaciones_maximus' : 'captaciones_externas',
            grupo_origen: item.group_name,
            fecha_mensaje: item.timestamp_str,
            titulo: `${tipoUi === 'Departamento' ? 'Apartamento' : tipoUi} en ${sectorNombre}`,
            subtitulo: esCaptacionMaximus
                ? `Captación Exclusiva MAXIMUS en ${ubicacion} con respaldo legal`
                : `Propiedad seleccionada en ${ubicacion} con excelente distribución`,
            tipo_ui: tipoUi,
            tipo_sql_dashboard: tipoSqlDash,
            tipo_sql_canonical: tipoSqlCanon,
            operacion_ui: operacion.toUpperCase(),
            operacion,
            precio,
            moneda: operacion === 'alquiler' ? 'USD/mes' : 'USD',
            precio_m2: precioM2,
            precio_m2_ui: precioM2 > 0 ? `$${precioM2} USD / m²` : 'N/D',
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
            descripcion: `Excelente opción de ${tipoUi.toLowerCase()} en ${operacion} ubicada en ${ubicacion}. Cuenta con ${habitaciones} habitación(es), ${banos} baño(s), ${m2} m² y estacionamiento (${estacUi}).\n\nDetalles: ${item.text.replace(/\s+/g, ' ')}`,
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
            md += `## 🔹 \`${p.temp_id}\` — Modo: \`${p.modo_entrada}\` — Sector: ${p.sector_detectado}\n- **Motivo:** ${p.motivo}\n- **Asesor (${p.tipo_asesor}):** ${p.asesor_nombre} (\`${p.asesor_telefono}\`)\n- **Imágenes:** \`${p.imagenes_locales.map(x => path.basename(x)).join(', ')}\`\n- **Texto:** \`${p.texto_original.replace(/\n/g, ' ')}\`\n\n`;
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
