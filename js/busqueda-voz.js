/**
 * ====================================================================
 * MAXIMUS INMOBILIARIA - Búsqueda inteligente por voz (y por frase)
 * ====================================================================
 * El usuario dice o escribe algo como:
 *   "casas en alquiler en Pueblo Nuevo"
 *   "apartamentos en venta en Los Pirineos con 3 habitaciones hasta 80 mil dólares"
 *   "terrenos en Táriba de menos de 30 mil"
 * y se aplican los filtros del buscador de Inmuebles automáticamente.
 *
 * Partes:
 *   1. Intérprete (función pura, sin DOM): texto → { operacion, tipo, zona, hab, banos, precioMin, precioMax, orden }
 *   2. Motor de voz: Web Speech API (Chrome, Edge, Safari) o el plugin nativo
 *      @capacitor-community/speech-recognition dentro de la app (si está instalado).
 *   3. Interfaz: botón de micrófono en el buscador, botón flotante en celular,
 *      panel de escucha con transcripción en vivo y aplicación de filtros.
 *
 * Nota: en Chrome el reconocimiento de voz lo procesa Google en sus servidores.
 * ====================================================================
 */
(function (global) {
    'use strict';

    // ------------------------------------------------------------------
    // 1. INTÉRPRETE
    // ------------------------------------------------------------------
    const quitarAcentos = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '');
    const normalizar = (s) => quitarAcentos(String(s || '').toLowerCase())
        .replace(/[¿?¡!,;:"()]/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    const escRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const palabra = (alias) => new RegExp('(^|[^a-z0-9ñ])' + escRegex(alias) + '(?=$|[^a-z0-9ñ])');

    const NUM = {
        cero: 0, un: 1, uno: 1, una: 1, dos: 2, tres: 3, cuatro: 4, cinco: 5, seis: 6, siete: 7, ocho: 8, nueve: 9,
        diez: 10, once: 11, doce: 12, trece: 13, catorce: 14, quince: 15, dieciseis: 16, diecisiete: 17,
        dieciocho: 18, diecinueve: 19, veinte: 20, veintiun: 21, veintiuno: 21, veintidos: 22, veintitres: 23,
        veinticuatro: 24, veinticinco: 25, veintiseis: 26, veintisiete: 27, veintiocho: 28, veintinueve: 29,
        treinta: 30, cuarenta: 40, cincuenta: 50, sesenta: 60, setenta: 70, ochenta: 80, noventa: 90,
        cien: 100, ciento: 100, doscientos: 200, doscientas: 200, trescientos: 300, trescientas: 300,
        cuatrocientos: 400, cuatrocientas: 400, quinientos: 500, quinientas: 500, seiscientos: 600,
        seiscientas: 600, setecientos: 700, setecientas: 700, ochocientos: 800, ochocientas: 800,
        novecientos: 900, novecientas: 900, medio: 0.5
    };
    const PALABRA_NUM = Object.keys(NUM).join('|');

    // "80.000" | "80,000" | "1.5" | "80 mil" | "ochenta y cinco mil" | "1 millon" | "100k" | "medio millon"
    function leerCantidad(fragmento) {
        const t = normalizar(fragmento).replace(/\$/g, ' ');
        // a) Con dígitos
        // "millones|millon" antes que "mil" (si no, "1 millón" se leería como 1 mil)
        let m = t.match(/(\d+(?:[.,]\d+)*)\s*(millones|millon|mil|k|m\b)?/);
        if (m) {
            let raw = m[1];
            let n;
            if (/^\d{1,3}([.,]\d{3})+$/.test(raw)) n = parseFloat(raw.replace(/[.,]/g, '')); // separador de miles
            else n = parseFloat(raw.replace(',', '.'));
            const mult = m[2] || '';
            if (mult === 'k' || mult === 'mil') n *= 1000;
            else if (mult.startsWith('millon') || mult === 'm') n *= 1000000;
            return isFinite(n) && n > 0 ? Math.round(n) : 0;
        }
        // b) Con palabras
        const tokens = t.split(' ');
        let total = 0, actual = 0, vistos = 0;
        for (const tok of tokens) {
            if (tok === 'y') continue;
            if (tok in NUM) { actual += NUM[tok]; vistos++; continue; }
            if (tok === 'mil') { total += (actual || 1) * 1000; actual = 0; vistos++; continue; }
            if (/^millon(es)?$/.test(tok)) { total = (total + (actual || 1)) * 1000000; actual = 0; vistos++; continue; }
            if (vistos) break; // terminó la cifra
        }
        const n = total + actual;
        return vistos && n > 0 ? Math.round(n) : 0;
    }

    function leerEnteroCorto(s) {
        const t = normalizar(s);
        if (/^\d+$/.test(t)) return parseInt(t, 10);
        return NUM[t] !== undefined ? Math.round(NUM[t]) : 0;
    }

    const OPERACIONES = [
        { valor: 'alquiler', alias: ['en alquiler', 'para alquilar', 'alquiler', 'alquileres', 'alquilar', 'alquilo', 'alquilan', 'arriendo', 'arrendar', 'renta', 'rentar', 'rento'] },
        { valor: 'venta', alias: ['en venta', 'a la venta', 'para comprar', 'venta', 'ventas', 'vender', 'vendo', 'venden', 'comprar', 'compra', 'compro', 'adquirir'] }
    ];

    // Valores reales de la columna `tipo` en la base: casa, apartamento, terreno, local, galpon
    const TIPOS = [
        { valor: 'casa', etiqueta: 'Casa', plural: 'Casas', alias: ['casas de campo', 'casa de campo', 'casas', 'casa', 'quintas', 'quinta', 'townhouses', 'townhouse', 'viviendas', 'vivienda', 'chalet', 'chalets'] },
        { valor: 'apartamento', etiqueta: 'Apartamento', plural: 'Apartamentos', alias: ['apartamentos', 'apartamento', 'aptos', 'apto', 'departamentos', 'departamento', 'penthouses', 'penthouse', 'pent house', 'anexos', 'anexo', 'estudios', 'estudio'] },
        { valor: 'terreno', etiqueta: 'Terreno', plural: 'Terrenos', alias: ['terrenos', 'terreno', 'lotes', 'lote', 'parcelas', 'parcela', 'fincas', 'finca', 'haciendas', 'hacienda', 'solares', 'solar'] },
        { valor: 'local', etiqueta: 'Local comercial', plural: 'Locales comerciales', alias: ['locales comerciales', 'local comercial', 'locales', 'local', 'oficinas', 'oficina', 'consultorios', 'consultorio', 'comercios', 'comercio'] },
        { valor: 'galpon', etiqueta: 'Galpón', plural: 'Galpones', alias: ['galpones', 'galpon', 'depositos', 'deposito', 'bodegas', 'bodega', 'naves industriales', 'nave industrial', 'almacenes', 'almacen'] }
    ];

    // Apodos de zonas que la gente dice distinto a la etiqueta oficial
    const ALIAS_ZONAS = {
        'pirineos': 'pirineos', 'los pirineos': 'pirineos',
        'pirineos 2': 'urb-pirineos', 'pirineos dos': 'urb-pirineos', 'pirineos ii': 'urb-pirineos',
        'centro': 'centro', 'el centro': 'centro', 'centro de san cristobal': 'centro', 'san cristobal centro': 'centro',
        'obrero': 'barrio-obrero', 'barrio obrero': 'barrio-obrero',
        'sucre': 'barrio-sucre', 'barrio sucre': 'barrio-sucre',
        'san antonio': 'san-antonio', 'san antonio del tachira': 'san-antonio',
        'santa ana': 'santa-ana', 'santa ana del tachira': 'santa-ana',
        'capacho': 'capacho-nuevo', 'guaparo': 'urb-guaparo', 'la fria': 'la-fria',
        'el pinal': 'el-piñal', 'pinal': 'el-piñal', 'tucape': 'tucape', 'quinimari': 'quinimari'
    };

    function construirZonas(ubicaciones) {
        const lista = [];
        Object.entries(ubicaciones || {}).forEach(([key, loc]) => {
            if (!loc || loc.separator || key === 'todas') return;
            const base = normalizar(loc.label).replace(/\burb\.?\s*/g, 'urb ').trim();
            lista.push({ alias: base, key, label: loc.label });
            const sinUrb = base.replace(/^urb /, '');
            if (sinUrb !== base) lista.push({ alias: sinUrb, key, label: loc.label });
        });
        Object.entries(ALIAS_ZONAS).forEach(([alias, key]) => {
            const loc = ubicaciones && ubicaciones[key];
            if (loc) lista.push({ alias, key, label: loc.label });
        });
        // Más largo primero: "palmira centro" gana a "palmira", "urb pirineos ii" a "pirineos"
        return lista.sort((a, b) => b.alias.length - a.alias.length);
    }

    function buscarPrimero(texto, grupos) {
        let mejor = null;
        grupos.forEach(g => g.alias.forEach(a => {
            const m = texto.match(palabra(a));
            if (m) {
                const pos = m.index + m[1].length;
                if (!mejor || pos < mejor.pos || (pos === mejor.pos && a.length > mejor.alias.length)) mejor = { valor: g.valor, alias: a, pos };
            }
        }));
        return mejor;
    }

    /**
     * Interpreta una frase de búsqueda.
     * @param {string} frase
     * @param {object} opciones { ubicaciones: UBICACIONES_TACHIRA }
     */
    function interpretar(frase, opciones = {}) {
        const original = String(frase || '').trim();
        let t = ' ' + normalizar(original) + ' ';
        const r = { texto: original, operacion: '', tipo: '', zona: '', zonaLabel: '', hab: 0, banos: 0, precioMin: 0, precioMax: 0, orden: '', favoritos: false, reconocido: false, resto: '' };
        const consumir = (frag) => { t = t.replace(frag, ' '); };

        if (/\b(mis )?favoritos?\b/.test(t)) { r.favoritos = true; consumir(/\b(mis )?favoritos?\b/); }

        // Habitaciones y baños primero (para no confundir "3 habitaciones" con un precio)
        const reHab = new RegExp('(\\d+|' + PALABRA_NUM + ')\\s+(habitaciones|habitacion|habs?|cuartos|cuarto|dormitorios|dormitorio|recamaras|recamara|alcobas|alcoba)\\b');
        let m = t.match(reHab);
        if (m) { r.hab = leerEnteroCorto(m[1]); consumir(m[0]); }
        const reBanos = new RegExp('(\\d+(?:[.,]5)?|' + PALABRA_NUM + ')\\s+(banos|bano|sanitarios)\\b');
        m = t.match(reBanos);
        if (m) { r.banos = Math.floor(parseFloat(String(leerEnteroCorto(m[1]) || m[1]).replace(',', '.')) || 0); consumir(m[0]); }

        // Precios
        const cifra = '((?:\\$\\s*)?(?:\\d[\\d.,]*\\s*(?:millones|millon|mil|k)?|(?:(?:' + PALABRA_NUM + '|y|mil|millon|millones)\\s*)+))';
        const moneda = '(?:\\s*(?:dolares|dolar|usd|\\$|verdes))?';
        m = t.match(new RegExp('\\bentre\\s+' + cifra + moneda + '\\s+(?:y|a|hasta)\\s+' + cifra + moneda));
        if (m) {
            const a = leerCantidad(m[1]), b = leerCantidad(m[2]);
            if (a && b) { r.precioMin = Math.min(a, b); r.precioMax = Math.max(a, b); consumir(m[0]); }
        }
        if (!r.precioMax) {
            m = t.match(new RegExp('\\b(?:menos de|menor a|menor de|hasta|maximo|max|no mas de|por debajo de|tope de|presupuesto de|que no pase de|que no pasen de)\\s+' + cifra + moneda));
            if (m) { const n = leerCantidad(m[1]); if (n) { r.precioMax = n; consumir(m[0]); } }
        }
        if (!r.precioMin) {
            m = t.match(new RegExp('\\b(?:mas de|mayor a|mayor de|desde|minimo|a partir de|por encima de|arriba de)\\s+' + cifra + moneda));
            if (m) { const n = leerCantidad(m[1]); if (n) { r.precioMin = n; consumir(m[0]); } }
        }
        if (!r.precioMax && !r.precioMin) {
            // "casa de 80 mil dólares", "por 500 dólares": se toma como precio máximo
            m = t.match(new RegExp('\\b(?:de|por|en|a)\\s+' + cifra + '(\\s*(?:dolares|dolar|usd|\\$|verdes))'));
            if (!m) m = t.match(/\b(?:de|por|en|a)\s+((?:\$\s*)?\d[\d.,]*\s*(?:millones|millon|mil|k))\b/);
            if (m) { const n = leerCantidad(m[1]); if (n) { r.precioMax = n; consumir(m[0]); } }
        }

        // Orden
        if (/\b(mas )?(baratas?|baratos?|economicas?|economicos?)\b/.test(t)) r.orden = 'precio-asc';
        else if (/\b(mas caras?|mas caros?|de lujo|lujosas?|lujosos?)\b/.test(t)) r.orden = 'precio-desc';
        else if (/\b(mas grandes?|amplias?|amplios?|mas espaciosas?)\b/.test(t)) r.orden = 'm2-desc';

        // Operación y tipo
        const op = buscarPrimero(t, OPERACIONES);
        if (op) { r.operacion = op.valor; consumir(palabra(op.alias)); }
        const tipo = buscarPrimero(t, TIPOS);
        if (tipo) { r.tipo = tipo.valor; consumir(palabra(tipo.alias)); }

        // Zona (la coincidencia más larga)
        const zonas = construirZonas(opciones.ubicaciones);
        for (const z of zonas) {
            if (z.alias === 'centro' && /\bcentro comercial\b/.test(t)) continue;
            if (palabra(z.alias).test(t)) { r.zona = z.key; r.zonaLabel = z.label; consumir(palabra(z.alias)); break; }
        }

        r.reconocido = Boolean(r.operacion || r.tipo || r.zona || r.hab || r.banos || r.precioMin || r.precioMax || r.favoritos);
        // Lo que sobra (sin palabras de relleno) sirve como búsqueda de texto si no se reconoció nada
        r.resto = t.replace(/\b(busco|buscame|quiero|necesito|muestrame|ver|dame|hay|un|una|unos|unas|el|la|los|las|de|del|en|con|y|para|por|que|me|algo|alguna|alguno|sector|zona|urbanizacion|urb|tachira|san cristobal|cerca|por favor|favor|dolares|dolar|usd|mas|menos)\b/g, ' ').replace(/\s+/g, ' ').trim();
        return r;
    }

    const fmtUsd = (n) => '$' + Number(n).toLocaleString('es-VE');

    /** Etiquetas cortas para mostrar lo que se entendió */
    function describir(f) {
        const chips = [];
        const tipo = TIPOS.find(x => x.valor === f.tipo);
        if (tipo) chips.push({ icono: 'ph-house-line', texto: tipo.etiqueta });
        if (f.operacion) chips.push({ icono: 'ph-tag', texto: f.operacion === 'alquiler' ? 'En alquiler' : 'En venta' });
        if (f.zonaLabel) chips.push({ icono: 'ph-map-pin', texto: f.zonaLabel });
        if (f.hab) chips.push({ icono: 'ph-bed', texto: `${f.hab}+ hab.` });
        if (f.banos) chips.push({ icono: 'ph-bathtub', texto: `${f.banos}+ baños` });
        if (f.precioMin && f.precioMax) chips.push({ icono: 'ph-currency-dollar', texto: `${fmtUsd(f.precioMin)} – ${fmtUsd(f.precioMax)}` });
        else if (f.precioMax) chips.push({ icono: 'ph-currency-dollar', texto: `Hasta ${fmtUsd(f.precioMax)}` });
        else if (f.precioMin) chips.push({ icono: 'ph-currency-dollar', texto: `Desde ${fmtUsd(f.precioMin)}` });
        if (f.orden === 'precio-asc') chips.push({ icono: 'ph-sort-ascending', texto: 'Más económicos' });
        if (f.orden === 'precio-desc') chips.push({ icono: 'ph-sort-descending', texto: 'Más caros' });
        if (f.orden === 'm2-desc') chips.push({ icono: 'ph-arrows-out', texto: 'Más amplios' });
        if (f.favoritos) chips.push({ icono: 'ph-heart', texto: 'Mis favoritos' });
        return chips;
    }

    /** Frase natural: "Casas en alquiler en Pueblo Nuevo" */
    function resumen(f) {
        const tipo = TIPOS.find(x => x.valor === f.tipo);
        let s = tipo ? tipo.plural : 'Inmuebles';
        if (f.operacion) s += f.operacion === 'alquiler' ? ' en alquiler' : ' en venta';
        if (f.zonaLabel) s += ' en ' + f.zonaLabel;
        return s;
    }

    const API = { interpretar, describir, resumen, leerCantidad, TIPOS };
    if (typeof module !== 'undefined' && module.exports) module.exports = API; // pruebas en Node
    if (typeof window === 'undefined' || typeof document === 'undefined') return;
    global.BusquedaVozMaximus = API;

    // ------------------------------------------------------------------
    // 2. MOTOR DE VOZ
    // ------------------------------------------------------------------
    const IDIOMA = 'es-VE';

    function pluginNativo() {
        const cap = window.Capacitor;
        const nativo = cap && typeof cap.isNativePlatform === 'function' && cap.isNativePlatform();
        return nativo && cap.Plugins && cap.Plugins.SpeechRecognition ? cap.Plugins.SpeechRecognition : null;
    }
    function vozDisponible() {
        return Boolean(pluginNativo() || window.SpeechRecognition || window.webkitSpeechRecognition);
    }

    function crearMotor(cb) {
        const plugin = pluginNativo();
        if (plugin) return motorCapacitor(plugin, cb);
        const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
        if (SR) return motorWeb(SR, cb);
        return null;
    }

    function motorWeb(SR, cb) {
        const rec = new SR();
        rec.lang = IDIOMA;
        rec.interimResults = true;
        rec.continuous = false;
        rec.maxAlternatives = 3;
        let finalizado = false;
        rec.onresult = (ev) => {
            let interino = '';
            for (let i = ev.resultIndex; i < ev.results.length; i++) {
                const res = ev.results[i];
                if (res.isFinal) {
                    finalizado = true;
                    cb.onFinal(Array.from(res).map(a => a.transcript));
                } else {
                    interino += res[0].transcript;
                }
            }
            if (interino) cb.onParcial(interino);
        };
        rec.onerror = (ev) => cb.onError(ev.error || 'error');
        rec.onend = () => cb.onFin(finalizado);
        return {
            iniciar: () => { finalizado = false; rec.start(); },
            detener: () => { try { rec.stop(); } catch (_) {} },
            abortar: () => { try { rec.abort(); } catch (_) {} }
        };
    }

    // App nativa (Android / iOS): plugin @capacitor-community/speech-recognition
    function motorCapacitor(plugin, cb) {
        let ultimo = [];
        let manejadores = [];
        let terminado = false;
        let timerSilencio = null, timerMaximo = null;
        const SILENCIO_MS = 1800;   // iOS no se detiene solo al callarse: lo cortamos tras 1,8 s sin cambios
        const MAXIMO_MS = 15000;    // tope de seguridad

        const limpiar = () => {
            clearTimeout(timerSilencio); clearTimeout(timerMaximo);
            manejadores.forEach(h => { try { h.remove(); } catch (_) {} });
            manejadores = [];
        };
        const parar = () => { try { plugin.stop(); } catch (_) {} };
        // Un solo cierre aunque lleguen a la vez "stopped" y el resultado de start()
        const terminar = () => {
            if (terminado) return;
            terminado = true;
            limpiar();
            if (ultimo.length) cb.onFinal(ultimo);
            cb.onFin(ultimo.length > 0);
        };

        return {
            iniciar: async () => {
                terminado = false;
                ultimo = [];
                try {
                    const disp = await plugin.available();
                    if (disp && disp.available === false) { cb.onError('no-disponible'); terminado = true; cb.onFin(false); return; }
                    let perm = await plugin.checkPermissions();
                    if (perm && perm.speechRecognition !== 'granted') perm = await plugin.requestPermissions();
                    if (perm && perm.speechRecognition !== 'granted') { cb.onError('not-allowed'); terminado = true; cb.onFin(false); return; }

                    manejadores.push(await plugin.addListener('partialResults', (d) => {
                        if (d && d.matches && d.matches.length) {
                            ultimo = d.matches;
                            cb.onParcial(ultimo[0]);
                            clearTimeout(timerSilencio);
                            timerSilencio = setTimeout(parar, SILENCIO_MS);
                        }
                    }));
                    manejadores.push(await plugin.addListener('listeningState', (d) => {
                        if (d && d.status === 'stopped') terminar();
                    }));
                    timerMaximo = setTimeout(parar, MAXIMO_MS);

                    const res = await plugin.start({ language: IDIOMA, maxResults: 3, partialResults: true, popup: false });
                    if (res && res.matches && res.matches.length) { ultimo = res.matches; terminar(); }
                } catch (e) {
                    const msg = String((e && e.message) || e || '').toLowerCase();
                    limpiar();
                    if (!terminado) {
                        terminado = true;
                        cb.onError(/permis|denied|not allowed/.test(msg) ? 'not-allowed' : (/no match|no speech|didn't understand/.test(msg) ? 'no-speech' : 'error'));
                        cb.onFin(false);
                    }
                }
            },
            detener: parar,
            abortar: () => { terminado = true; parar(); limpiar(); }
        };
    }

    // ------------------------------------------------------------------
    // 3. INTERFAZ
    // ------------------------------------------------------------------
    const EJEMPLOS = [
        'Casas en alquiler en Pueblo Nuevo',
        'Apartamentos en venta en Los Pirineos con 3 habitaciones',
        'Terrenos en Táriba de menos de 30 mil dólares',
        'Locales comerciales en el centro'
    ];

    const ERRORES = {
        'not-allowed': 'Necesito permiso para usar el micrófono. Actívalo en los ajustes del teléfono o del navegador.',
        'service-not-allowed': 'El navegador bloqueó el reconocimiento de voz.',
        'no-speech': 'No te escuché. Toca el micrófono e intenta de nuevo.',
        'audio-capture': 'No encontramos un micrófono en este dispositivo.',
        'network': 'Sin conexión: el reconocimiento de voz necesita internet.',
        'no-disponible': 'El reconocimiento de voz no está disponible en este dispositivo.',
        'error': 'No pudimos escucharte. Intenta de nuevo o escribe tu búsqueda.'
    };

    let motor = null;
    let estado = 'inactivo'; // inactivo | escuchando | procesando
    let adaptador = null;
    let $ = {};

    function inyectarEstilos() {
        if (document.getElementById('voz-estilos')) return;
        const css = document.createElement('style');
        css.id = 'voz-estilos';
        css.textContent = `
            .voz-btn{position:relative;width:38px;height:38px;border-radius:9999px;display:inline-flex;align-items:center;justify-content:center;flex-shrink:0;
                background:linear-gradient(135deg,#0B4A3F,#10B981);color:#fff;font-size:17px;cursor:pointer;border:0;box-shadow:0 6px 16px -6px rgba(11,74,63,.55);transition:transform .15s}
            .voz-btn:hover{transform:scale(1.06)} .voz-btn:active{transform:scale(.95)}
            .voz-btn.escuchando{background:#ef4444;box-shadow:0 0 0 0 rgba(239,68,68,.6);animation:vozPulso 1.4s infinite}
            @keyframes vozPulso{0%{box-shadow:0 0 0 0 rgba(239,68,68,.55)}70%{box-shadow:0 0 0 14px rgba(239,68,68,0)}100%{box-shadow:0 0 0 0 rgba(239,68,68,0)}}
            #voz-fab{position:fixed;right:16px;bottom:calc(88px + env(safe-area-inset-bottom));z-index:101;display:none;align-items:center;gap:8px;height:56px;padding:0 18px 0 16px;border-radius:9999px;border:0;
                background:linear-gradient(135deg,#0B4A3F,#0E7A5F);color:#fff;font:800 13px/1 inherit;box-shadow:0 14px 30px -10px rgba(11,74,63,.65);cursor:pointer;transition:padding .3s,width .3s}
            #voz-fab i{font-size:22px} #voz-fab.compacto{padding:0;width:56px;justify-content:center} #voz-fab.compacto span{display:none}
            @media (max-width:767px){ body.voz-en-inmuebles #voz-fab{display:inline-flex} }
            #voz-panel{position:fixed;inset:0;z-index:1200;display:none;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.55);backdrop-filter:blur(4px)}
            #voz-panel.abierto{display:flex}
            @media (min-width:640px){ #voz-panel{align-items:center;padding:16px} }
            .voz-hoja{width:100%;max-width:520px;background:#fff;color:#0f172a;border-radius:28px 28px 0 0;padding:22px 20px calc(20px + env(safe-area-inset-bottom));box-shadow:0 -20px 60px rgba(0,0,0,.25);
                max-height:92vh;overflow-y:auto;animation:vozSube .28s ease-out}
            @media (min-width:640px){ .voz-hoja{border-radius:28px;padding:26px 26px 22px} }
            @keyframes vozSube{from{transform:translateY(30px);opacity:0}to{transform:none;opacity:1}}
            html.dark .voz-hoja{background:#071F1A;color:#e5f5ef}
            .voz-orbe{position:relative;width:96px;height:96px;margin:6px auto 4px;border-radius:9999px;display:flex;align-items:center;justify-content:center;border:0;cursor:pointer;
                background:linear-gradient(135deg,#0B4A3F,#10B981);color:#fff;font-size:40px;box-shadow:0 16px 36px -12px rgba(16,185,129,.7)}
            .voz-orbe::before,.voz-orbe::after{content:'';position:absolute;inset:0;border-radius:9999px;border:2px solid rgba(16,185,129,.45);opacity:0}
            .voz-orbe.escuchando{background:linear-gradient(135deg,#dc2626,#f87171);box-shadow:0 16px 36px -12px rgba(239,68,68,.7)}
            .voz-orbe.escuchando::before{animation:vozOnda 1.6s ease-out infinite;border-color:rgba(239,68,68,.45)}
            .voz-orbe.escuchando::after{animation:vozOnda 1.6s ease-out .8s infinite;border-color:rgba(239,68,68,.45)}
            @keyframes vozOnda{0%{transform:scale(1);opacity:.9}100%{transform:scale(1.9);opacity:0}}
            .voz-ondas{display:flex;gap:4px;justify-content:center;height:22px;align-items:center;margin-top:10px}
            .voz-ondas span{width:4px;border-radius:4px;background:#10B981;height:6px;opacity:.35}
            .voz-orbe.escuchando + .voz-ondas span{opacity:1;background:#ef4444;animation:vozBarra 0.9s ease-in-out infinite}
            .voz-ondas span:nth-child(2){animation-delay:.1s!important}.voz-ondas span:nth-child(3){animation-delay:.2s!important}
            .voz-ondas span:nth-child(4){animation-delay:.3s!important}.voz-ondas span:nth-child(5){animation-delay:.4s!important}
            @keyframes vozBarra{0%,100%{height:6px}50%{height:22px}}
            .voz-chip{display:inline-flex;align-items:center;gap:5px;padding:6px 10px;border-radius:12px;font-size:12px;font-weight:700;background:#ecfdf5;color:#065f46;border:1px solid #a7f3d0}
            html.dark .voz-chip{background:rgba(16,185,129,.12);color:#a7f3d0;border-color:rgba(16,185,129,.3)}
            .voz-ejemplo{display:flex;width:100%;align-items:center;gap:8px;text-align:left;padding:10px 12px;border-radius:14px;font-size:13px;font-weight:600;background:#f8fafc;color:#334155;border:1px solid #e2e8f0;cursor:pointer}
            .voz-ejemplo:hover{background:#f1f5f9} html.dark .voz-ejemplo{background:rgba(255,255,255,.04);color:#cbd5e1;border-color:rgba(255,255,255,.08)}
            .voz-input{flex:1;min-width:0;height:44px;border-radius:14px;padding:0 14px;font-size:14px;border:1px solid #e2e8f0;background:#fff;color:#0f172a;outline:none}
            .voz-input:focus{border-color:#10B981;box-shadow:0 0 0 3px rgba(16,185,129,.18)}
            html.dark .voz-input{background:#061814;color:#fff;border-color:rgba(16,185,129,.25)}
            #voz-resultado{display:none} #voz-resultado.visible{display:flex}
            @media (prefers-reduced-motion:reduce){.voz-btn.escuchando,.voz-orbe::before,.voz-orbe::after,.voz-ondas span{animation:none!important}}
        `;
        document.head.appendChild(css);
    }

    function crearPanel() {
        if (document.getElementById('voz-panel')) return;
        const panel = document.createElement('div');
        panel.id = 'voz-panel';
        panel.setAttribute('role', 'dialog');
        panel.setAttribute('aria-modal', 'true');
        panel.setAttribute('aria-labelledby', 'voz-titulo');
        panel.innerHTML = `
            <div class="voz-hoja">
                <div class="flex items-center justify-between">
                    <span class="inline-flex items-center gap-1.5 text-[10px] font-black uppercase tracking-[0.16em] text-emerald-600"><i class="ph-fill ph-sparkle"></i> Búsqueda inteligente</span>
                    <button type="button" data-voz="cerrar" aria-label="Cerrar" class="w-9 h-9 rounded-full bg-gray-100 dark:bg-emerald-950/60 text-gray-500 flex items-center justify-center cursor-pointer"><i class="ph-bold ph-x"></i></button>
                </div>
                <div class="text-center mt-2">
                    <button type="button" class="voz-orbe" data-voz="orbe" aria-label="Hablar"><i class="ph-fill ph-microphone"></i></button>
                    <div class="voz-ondas" aria-hidden="true"><span></span><span></span><span></span><span></span><span></span></div>
                    <h3 id="voz-titulo" class="mt-3 text-lg font-black">Toca el micrófono y dime qué buscas</h3>
                    <p id="voz-transcripcion" class="mt-1 min-h-[28px] text-base font-semibold text-gray-500 dark:text-gray-300" aria-live="polite"></p>
                    <div id="voz-chips" class="mt-2 flex flex-wrap justify-center gap-1.5"></div>
                    <p id="voz-error" class="hidden mt-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2"></p>
                </div>
                <div id="voz-ejemplos" class="mt-4">
                    <p class="text-[11px] font-bold uppercase tracking-wider text-gray-400 mb-2">Prueba decir</p>
                    <div class="space-y-1.5">${EJEMPLOS.map(e => `<button type="button" class="voz-ejemplo" data-voz-ejemplo="${e}"><i class="ph-bold ph-quotes text-emerald-500"></i>${e}</button>`).join('')}</div>
                </div>
                <form id="voz-form" class="mt-4 flex items-center gap-2" autocomplete="off">
                    <input id="voz-input" class="voz-input" type="text" enterkeyhint="search" placeholder="…o escríbelo aquí" aria-label="Escribe lo que buscas">
                    <button type="submit" class="h-11 px-4 rounded-xl bg-[#0B4A3F] hover:bg-[#07362e] text-white text-sm font-bold cursor-pointer shrink-0">Buscar</button>
                </form>
            </div>`;
        document.body.appendChild(panel);
        $.panel = panel;
        $.orbe = panel.querySelector('[data-voz="orbe"]');
        $.titulo = panel.querySelector('#voz-titulo');
        $.trans = panel.querySelector('#voz-transcripcion');
        $.chips = panel.querySelector('#voz-chips');
        $.error = panel.querySelector('#voz-error');
        $.ejemplos = panel.querySelector('#voz-ejemplos');
        $.input = panel.querySelector('#voz-input');

        panel.addEventListener('click', (e) => {
            if (e.target === panel || e.target.closest('[data-voz="cerrar"]')) return cerrarPanel();
            if (e.target.closest('[data-voz="orbe"]')) return estado === 'escuchando' ? motor && motor.detener() : escuchar();
            const ej = e.target.closest('[data-voz-ejemplo]');
            if (ej) { $.input.value = ej.getAttribute('data-voz-ejemplo'); procesarFrases([$.input.value]); }
        });
        panel.querySelector('#voz-form').addEventListener('submit', (e) => {
            e.preventDefault();
            const v = $.input.value.trim();
            if (v) procesarFrases([v]);
        });
        document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && panel.classList.contains('abierto')) cerrarPanel(); });
    }

    function pintarChips(f) {
        const chips = describir(f);
        $.chips.innerHTML = '';
        chips.forEach(c => {
            const el = document.createElement('span');
            el.className = 'voz-chip';
            el.innerHTML = `<i class="ph-bold ${c.icono}"></i>`;
            el.appendChild(document.createTextNode(c.texto));
            $.chips.appendChild(el);
        });
    }

    function ponerEstado(nuevo) {
        estado = nuevo;
        const escuchando = nuevo === 'escuchando';
        $.orbe.classList.toggle('escuchando', escuchando);
        document.querySelectorAll('.voz-btn').forEach(b => b.classList.toggle('escuchando', escuchando));
        if (escuchando) $.titulo.textContent = 'Te escucho…';
        else if (nuevo === 'procesando') $.titulo.textContent = 'Aplicando filtros…';
        else $.titulo.textContent = vozDisponible() ? 'Toca el micrófono y dime qué buscas' : 'Escribe lo que buscas';
    }

    function mostrarError(msg) {
        $.error.textContent = msg;
        $.error.classList.toggle('hidden', !msg);
    }

    function abrirPanel({ autoEscuchar = true } = {}) {
        inyectarEstilos();
        crearPanel();
        mostrarError('');
        $.trans.textContent = '';
        $.chips.innerHTML = '';
        $.input.value = '';
        $.ejemplos.classList.remove('hidden');
        $.orbe.style.display = vozDisponible() ? '' : 'none';
        $.panel.querySelector('.voz-ondas').style.display = vozDisponible() ? '' : 'none';
        ponerEstado('inactivo');
        $.panel.classList.add('abierto');
        document.body.style.overflow = 'hidden';
        if (!vozDisponible()) {
            mostrarError('Tu navegador no tiene búsqueda por voz. Usa Chrome o Safari, o escribe tu búsqueda aquí abajo.');
            setTimeout(() => $.input.focus(), 50);
            return;
        }
        if (autoEscuchar) escuchar();
    }

    function cerrarPanel() {
        if (motor) motor.abortar();
        ponerEstado('inactivo');
        if ($.panel) $.panel.classList.remove('abierto');
        document.body.style.overflow = '';
    }

    function escuchar() {
        mostrarError('');
        $.trans.textContent = '';
        $.chips.innerHTML = '';
        motor = crearMotor({
            onParcial: (texto) => {
                $.trans.textContent = texto;
                $.ejemplos.classList.add('hidden');
                pintarChips(interpretar(texto, { ubicaciones: adaptador.ubicaciones() }));
            },
            onFinal: (alternativas) => procesarFrases(alternativas),
            onError: (cod) => {
                if (cod === 'aborted') return;
                mostrarError(ERRORES[cod] || ERRORES.error);
                ponerEstado('inactivo');
            },
            onFin: (huboResultado) => { if (!huboResultado && estado === 'escuchando') ponerEstado('inactivo'); }
        });
        if (!motor) { mostrarError(ERRORES['no-disponible']); return; }
        try {
            if (navigator.vibrate) navigator.vibrate(25);
            ponerEstado('escuchando');
            motor.iniciar();
        } catch (e) {
            ponerEstado('inactivo');
            mostrarError(ERRORES.error);
        }
    }

    // Entre las alternativas del reconocedor, se queda con la que más filtros entiende
    function elegirMejor(frases) {
        const ubic = adaptador.ubicaciones();
        let mejor = null, puntos = -1;
        frases.filter(Boolean).forEach((fr, i) => {
            const f = interpretar(fr, { ubicaciones: ubic });
            const p = ['operacion', 'tipo', 'zona', 'hab', 'banos', 'precioMin', 'precioMax'].filter(k => f[k]).length * 10 - i;
            if (p > puntos) { puntos = p; mejor = f; }
        });
        return mejor;
    }

    function procesarFrases(frases) {
        const f = elegirMejor(frases);
        if (!f) return;
        $.trans.textContent = `«${f.texto}»`;
        $.ejemplos.classList.add('hidden');
        pintarChips(f);
        ponerEstado('procesando');
        setTimeout(() => {
            const total = adaptador.aplicar(f);
            cerrarPanel();
            mostrarResultado(f, total);
        }, 650);
    }

    function mostrarResultado(f, total) {
        const caja = document.getElementById('voz-resultado');
        if (!caja) return;
        const titulo = f.reconocido ? resumen(f) : `Resultados para «${f.texto}»`;
        caja.querySelector('[data-voz-res="titulo"]').textContent = titulo;
        caja.querySelector('[data-voz-res="frase"]').textContent = `Dijiste: «${f.texto}»`;
        caja.querySelector('[data-voz-res="total"]').textContent = `${total} ${total === 1 ? 'resultado' : 'resultados'}`;
        const chips = caja.querySelector('[data-voz-res="chips"]');
        chips.innerHTML = '';
        describir(f).forEach(c => {
            const el = document.createElement('span');
            el.className = 'voz-chip';
            el.innerHTML = `<i class="ph-bold ${c.icono}"></i>`;
            el.appendChild(document.createTextNode(c.texto));
            chips.appendChild(el);
        });
        const alerta = caja.querySelector('[data-voz-res="alerta"]');
        if (alerta) alerta.classList.toggle('hidden', total > 0 || typeof window.crearAlertaBusqueda !== 'function');
        caja.classList.add('visible');
        if (adaptador.alMostrarResultado) adaptador.alMostrarResultado(caja);
    }

    function ocultarResultado() {
        const caja = document.getElementById('voz-resultado');
        if (caja) caja.classList.remove('visible');
    }

    /**
     * Conecta la búsqueda por voz a un buscador.
     * adaptador = {
     *   ubicaciones: () => UBICACIONES_TACHIRA,
     *   aplicar: (filtros) => número de resultados visibles,
     *   limpiar: () => void,
     *   vistaActiva: () => boolean            (para mostrar el botón flotante en celular)
     *   alMostrarResultado?: (caja) => void
     * }
     */
    function montar(opts) {
        adaptador = opts;
        inyectarEstilos();

        // Botón dentro del buscador
        const input = document.getElementById(opts.inputId);
        if (input && !document.getElementById('btn-voz-' + opts.inputId)) {
            const btn = document.createElement('button');
            btn.type = 'button';
            btn.id = 'btn-voz-' + opts.inputId;
            btn.className = 'voz-btn';
            btn.title = 'Buscar por voz';
            btn.setAttribute('aria-label', 'Buscar por voz');
            btn.innerHTML = '<i class="ph-fill ph-microphone"></i>';
            btn.addEventListener('click', () => abrirPanel());
            input.insertAdjacentElement('afterend', btn);

            // Enter en el buscador = búsqueda inteligente si la frase trae filtros reconocibles
            input.addEventListener('keydown', (e) => {
                if (e.key !== 'Enter') return;
                const f = interpretar(input.value, { ubicaciones: opts.ubicaciones() });
                if (f.reconocido) {
                    e.preventDefault();
                    const total = opts.aplicar(f);
                    mostrarResultado(f, total);
                    input.blur();
                }
            });
        }

        // Botón flotante (solo celular, solo en la vista de inmuebles)
        if (!document.getElementById('voz-fab')) {
            const fab = document.createElement('button');
            fab.type = 'button';
            fab.id = 'voz-fab';
            fab.setAttribute('aria-label', 'Buscar inmuebles por voz');
            fab.innerHTML = '<i class="ph-fill ph-microphone"></i><span>Buscar por voz</span>';
            fab.addEventListener('click', () => abrirPanel());
            document.body.appendChild(fab);
            setTimeout(() => fab.classList.add('compacto'), 6000); // se encoge tras unos segundos
        }
        const sincronizarFab = () => document.body.classList.toggle('voz-en-inmuebles', Boolean(opts.vistaActiva && opts.vistaActiva()));
        sincronizarFab();
        if (opts.observar) new MutationObserver(sincronizarFab).observe(opts.observar, { attributes: true, attributeFilter: ['class'] });

        // Banner de resultado
        const caja = document.getElementById('voz-resultado');
        if (caja) {
            caja.querySelector('[data-voz-res="limpiar"]')?.addEventListener('click', () => { opts.limpiar(); ocultarResultado(); });
            caja.querySelector('[data-voz-res="otra"]')?.addEventListener('click', () => abrirPanel());
            caja.querySelector('[data-voz-res="alerta"]')?.addEventListener('click', () => window.crearAlertaBusqueda && window.crearAlertaBusqueda());
        }
    }

    global.BusquedaVozMaximus = Object.assign(API, { montar, abrir: abrirPanel, cerrar: cerrarPanel, ocultarResultado, disponible: vozDisponible });
})(typeof window !== 'undefined' ? window : globalThis);
