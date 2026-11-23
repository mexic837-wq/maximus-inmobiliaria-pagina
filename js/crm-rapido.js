/**
 * MAXIMUS · Registro rápido de clientes (CRM "Mis clientes").
 *
 *   - parsear(texto): entiende una línea tipo "María Pérez 0414-1234567 busca casa en Pueblo Nuevo
 *     hasta $80.000" y devuelve nombre, teléfono, operación, tipo, zona, presupuesto y temperatura.
 *   - Botones de selección (interés, operación, origen) que mueven los <select> originales,
 *     así el resto del CRM (guardar, editar) sigue funcionando igual.
 *   - Aviso si el teléfono ya está en tu cartera.
 *   - diasSinContacto(lead): para el filtro "Sin contacto" y la etiqueta de las tarjetas.
 *
 * Funciona en el navegador y en Node (para las pruebas).
 */
(function (root) {
    'use strict';

    const norm = (s) => String(s == null ? '' : s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();

    // ---------- Entender el texto ----------
    function extraerTelefono(texto) {
        // 10 a 13 dígitos, con espacios, guiones, paréntesis o + (0414-1234567, +58 424 7835697)
        const m = texto.match(/\+?\(?\d[\d\s().-]{8,}\d/);
        if (!m) return { telefono: '', resto: texto };
        const dig = m[0].replace(/\D/g, '');
        if (dig.length < 10 || dig.length > 13) return { telefono: '', resto: texto };
        return { telefono: m[0].trim().replace(/\s{2,}/g, ' '), resto: texto.replace(m[0], ' ') };
    }

    function aNumero(txt, sufijo) {
        let t = String(txt).replace(/\s/g, '');
        if (/^\d{1,3}([.,]\d{3})+$/.test(t)) t = t.replace(/[.,]/g, '');            // 80.000 / 1,250,000
        else t = t.replace(',', '.');                                                // 80,5 -> 80.5
        let n = parseFloat(t);
        if (!isFinite(n)) return 0;
        if (sufijo && /^(k|mil)$/i.test(sufijo)) n *= 1000;
        if (sufijo && /^(m|mm|millon|millones)$/i.test(sufijo)) n *= 1000000;
        return Math.round(n);
    }

    function extraerPresupuesto(texto) {
        const patrones = [
            /(?:hasta|maximo|presupuesto(?:\s+de)?|alrededor\s+de|unos?|con)?\s*\$\s*([\d.,]+)\s*(k|mil|millones|millon|mm|m)?\b/i,
            /(?:hasta|maximo|presupuesto(?:\s+de)?|alrededor\s+de|unos?|con)\s+([\d.,]+)\s*(k|mil|millones|millon|mm|m)?\s*(?:usd|dolares|\$)?/i,
            /\b([\d.,]+)\s*(k|mil)\b\s*(?:usd|dolares|\$)?/i,
            /\b([\d.,]+)\s*(?:usd|dolares)\b/i
        ];
        const sinTilde = texto.normalize('NFD').replace(/[̀-ͯ]/g, '');
        for (const re of patrones) {
            const m = sinTilde.match(re);
            if (m) {
                const n = aNumero(m[1], m[2]);
                if (n >= 100) return { presupuesto: n, resto: texto.replace(new RegExp(escapar(m[0]), 'i'), ' ') };
            }
        }
        return { presupuesto: 0, resto: texto };
    }

    const escapar = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    function detectarTipo(t) {
        if (/casa\s+de\s+campo|quinta/.test(t)) return 'casa_de_campo';
        if (/apartamento|apto|departamento|penthouse|\bph\b/.test(t)) return 'departamento';
        if (/finca|hacienda|parcela agricola/.test(t)) return 'fincas';
        if (/galpon|deposito|bodega/.test(t)) return 'galpones';
        if (/local|comercial|oficina/.test(t)) return 'local';
        if (/terreno|parcela|lote/.test(t)) return 'terreno';
        if (/\bcasa\b|townhouse|vivienda/.test(t)) return 'casa';
        return '';
    }

    function detectarOperacion(t) {
        if (/alquil|arrend|rentar|\brenta\b/.test(t)) return 'alquiler';
        if (/\bvender\b|\bvende\b|quiere vender|captacion|poner en venta/.test(t)) return 'venta';
        if (/compra|comprar|busca|adquirir|interesad/.test(t)) return 'compra';
        return '';
    }

    function detectarTemperatura(t) {
        if (/urgente|lo antes posible|ya mismo|inmediat|esta semana|listo para|al contado|contado|tiene el dinero|aprobad/.test(t)) return 'caliente';
        if (/a futuro|mas adelante|sin prisa|no tiene prisa|solo (mirando|curiosidad)|curios|el proximo ano|cotizando/.test(t)) return 'frio';
        return '';
    }

    function detectarZona(textoOriginal, zonasConocidas) {
        const t = norm(textoOriginal);
        // 1) zonas que ya existen en tus inmuebles (la más larga primero: "Pueblo Nuevo" antes que "Pueblo")
        const lista = (zonasConocidas || []).filter(Boolean).slice().sort((a, b) => b.length - a.length);
        for (const z of lista) {
            const zn = norm(z);
            if (zn.length >= 4 && new RegExp('(^|[^a-z])' + escapar(zn) + '([^a-z]|$)').test(t)) return z;
        }
        // 2) "en <lugar>" hasta una palabra que corte
        const m = textoOriginal.match(/\ben\s+(?:la\s+|el\s+|los\s+|las\s+)?(?:zona\s+|urb(?:anizaci[oó]n)?\.?\s+|sector\s+)?([A-ZÁÉÍÓÚÑa-záéíóúñ][\wÁÉÍÓÚÑáéíóúñ.]*(?:\s+(?:de\s+|del\s+)?[A-ZÁÉÍÓÚÑ][\wÁÉÍÓÚÑáéíóúñ.]*){0,3})/);
        if (m) {
            const lugar = m[1].replace(/\s+(hasta|con|para|por|que|y|de)$/i, '').trim();
            if (lugar.length >= 4 && !/^(compra|venta|alquiler|dolares|usd)$/i.test(lugar)) return lugar;
        }
        return '';
    }

    function detectarNombre(resto) {
        let s = resto.replace(/[,;:|]+/g, ' ').replace(/\s{2,}/g, ' ').trim();
        // El nombre llega antes de la primera palabra "de pedido"
        const corte = s.search(/\b(busca|buscando|quiere|quiero|necesita|interesad[oa]|presupuesto|para\s+(comprar|alquilar|vender)|desea|prefiere|est[aá]\s+buscando|pregunt[oó]|escribi[oó]|en\s+(la\s+|el\s+)?[A-ZÁÉÍÓÚ]|hasta)\b/i);
        if (corte > 0) s = s.slice(0, corte);
        s = s.replace(/\b(cliente|sr\.?|sra\.?|se[nñ]or(a)?|contacto|nuevo|lead)\b\.?/gi, ' ')
            .replace(/[^A-Za-zÁÉÍÓÚÜÑáéíóúüñ' -]/g, ' ').replace(/\s{2,}/g, ' ').trim();
        // El nombre termina donde empieza el pedido (tipo de inmueble, verbo, "en", "hasta"…)
        const PARAR = new Set(['casa', 'apartamento', 'apto', 'departamento', 'penthouse', 'finca', 'galpon', 'local', 'terreno', 'quinta',
            'townhouse', 'oficina', 'comprar', 'compra', 'alquilar', 'alquiler', 'vender', 'venta', 'urgente', 'en', 'hasta', 'con', 'al',
            'sin', 'para', 'su', 'un', 'una', 'que', 'y', 'a', 'por', 'usd', 'dolares']);
        const UNION = new Set(['de', 'del', 'los', 'las', 'la']);      // "María de los Ángeles", "Juan de Dios"
        const toks = s.split(' ').filter(Boolean);
        const mayus = (w) => /^[A-ZÁÉÍÓÚÑ]/.test(w || '');
        const palabras = [];
        for (let i = 0; i < toks.length; i++) {
            const w = toks[i], n = norm(w);
            if (UNION.has(n)) {
                // Se queda solo si va entre partes del nombre ("de los Ángeles"), no si anuncia el pedido ("de 80 mil")
                let j = i; while (j < toks.length && UNION.has(norm(toks[j]))) j++;
                if (palabras.length && mayus(toks[j])) { palabras.push(w); continue; }
                break;
            }
            if (PARAR.has(n)) { if (palabras.length) break; continue; }
            palabras.push(w);
            if (palabras.length === 5) break;                     // es un nombre, no una frase
        }
        return palabras.join(' ');
    }

    function parsear(texto, opciones) {
        const original = String(texto || '').trim();
        const out = { nombre: '', telefono: '', operacion: '', tipo: '', zona: '', presupuesto: 0, temperatura: '' };
        if (!original) return out;

        const conTel = extraerTelefono(original);
        out.telefono = conTel.telefono;
        const conPres = extraerPresupuesto(conTel.resto);
        out.presupuesto = conPres.presupuesto;

        const t = norm(original);
        out.tipo = detectarTipo(t);
        out.operacion = detectarOperacion(t);
        out.temperatura = detectarTemperatura(t);
        out.zona = detectarZona(conPres.resto, opciones && opciones.zonas);
        out.nombre = detectarNombre(conPres.resto);
        return out;
    }

    // ---------- Días sin contacto ----------
    function ultimoContacto(lead) {
        const fechas = [];
        const add = (v) => { const d = new Date(v); if (v && !isNaN(d)) fechas.push(d.getTime()); };
        add(lead.ultimo_contacto_at);
        add(lead.primera_respuesta_at);
        if (Array.isArray(lead.actividades) && lead.actividades[0]) add(lead.actividades[0].fecha || lead.actividades[0].created_at);
        add(lead.updated_at);
        add(lead.created_at);
        return fechas.length ? Math.max.apply(null, fechas) : Date.now();
    }
    function diasSinContacto(lead, ahora) {
        return Math.floor(((ahora || Date.now()) - ultimoContacto(lead)) / 86400000);
    }
    const etapaCerrada = (lead) => ['cerrado', 'descartado'].includes(String(lead.estatus || ''));

    const API = { parsear, diasSinContacto, ultimoContacto, etapaCerrada, norm };
    if (typeof module !== 'undefined' && module.exports) module.exports = API;
    root.CRMRapido = Object.assign(root.CRMRapido || {}, API);
})(typeof window !== 'undefined' ? window : globalThis);

// =====================================================================================
// Parte visual (solo navegador): botones de selección, texto rápido y teléfono repetido
// =====================================================================================
(function () {
    'use strict';
    if (typeof document === 'undefined') return;
    const $ = (id) => document.getElementById(id);
    const API = window.CRMRapido;

    // Mantiene los <select> originales y pinta los botones según su valor
    function sincronizarBotones() {
        document.querySelectorAll('#modalNuevoClienteCRM [data-crm-opciones]').forEach(grupo => {
            const sel = $(grupo.getAttribute('data-crm-opciones'));
            if (!sel) return;
            grupo.querySelectorAll('button[data-v]').forEach(b => {
                b.setAttribute('aria-pressed', String(b.getAttribute('data-v') === sel.value));
            });
        });
    }

    function poner(idCampo, valor) {
        const el = $(idCampo);
        if (!el || valor === '' || valor == null) return false;
        if (el.tagName === 'SELECT' && ![...el.options].some(o => o.value === String(valor))) return false;
        el.value = valor;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        return true;
    }

    function zonasConocidas() {
        const out = new Set();
        try {
            Object.values(window.INMUEBLES_DETALLE_DATA || {}).forEach(d => {
                const z = d && (d.sectorNombre || String(d.ubicacion || '').split(',')[0]);
                if (z && String(z).trim()) out.add(String(z).trim());
            });
        } catch (_) {}
        return [...out];
    }

    const NOMBRES = { compra: 'Compra', alquiler: 'Alquiler', venta: 'Venta', caliente: '🔥 Caliente', tibio: '⚡ Tibio', frio: '❄️ Frío', casa: 'Casa', departamento: 'Apartamento', casa_de_campo: 'Casa de campo', fincas: 'Finca', galpones: 'Galpón', local: 'Local', terreno: 'Terreno' };

    function aplicarTextoRapido() {
        const caja = $('crm-rapido-texto');
        const resumen = $('crm-rapido-resumen');
        if (!caja) return;
        const r = API.parsear(caja.value, { zonas: zonasConocidas() });
        const detectado = [];
        if (r.nombre) { poner('crm-input-nombre', r.nombre); detectado.push('👤 ' + r.nombre); }
        if (r.telefono) { poner('crm-input-telefono', r.telefono); detectado.push('📱 ' + r.telefono); }
        if (r.operacion && poner('crm-input-operacion', r.operacion)) detectado.push(NOMBRES[r.operacion]);
        if (r.tipo && poner('crm-input-tipo-inmueble', r.tipo)) detectado.push(NOMBRES[r.tipo] || r.tipo);
        if (r.zona) { poner('crm-input-zonas', r.zona); detectado.push('📍 ' + r.zona); }
        if (r.presupuesto) { poner('crm-input-presupuesto', r.presupuesto); detectado.push('💵 $' + r.presupuesto.toLocaleString('en-US')); }
        if (r.temperatura && poner('crm-input-temperatura', r.temperatura)) detectado.push(NOMBRES[r.temperatura]);
        sincronizarBotones();
        revisarTelefonoRepetido();
        if (resumen) {
            resumen.innerHTML = detectado.length
                ? '<span class="font-bold text-emerald-700 dark:text-emerald-300">Entendido:</span> ' + detectado.map(d => `<span class="inline-block px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/60 text-emerald-800 dark:text-emerald-200 text-[11px] font-semibold mr-1 mb-1">${d.replace(/</g, '&lt;')}</span>`).join('')
                : '';
        }
    }

    function digitos(t) { return String(t || '').replace(/\D/g, '').slice(-10); }

    function revisarTelefonoRepetido() {
        const aviso = $('crm-aviso-repetido');
        const tel = digitos(($('crm-input-telefono') || {}).value);
        if (!aviso) return;
        aviso.classList.add('hidden');
        if (tel.length < 10) return;
        const idActual = ($('crm-input-id') || {}).value;
        let lista = [];
        try { lista = typeof crmLeadsList !== 'undefined' ? crmLeadsList : []; } catch (_) {}
        const igual = lista.find(l => l && String(l.id) !== String(idActual) && digitos(l.telefono) === tel);
        if (igual) {
            aviso.innerHTML = `<i class="ph-fill ph-warning"></i> <span><b>${String(igual.nombre || 'Un cliente').replace(/</g, '&lt;')}</b> ya está en la cartera con este número. <button type="button" class="underline font-bold" data-ver-repetido="${String(igual.id).replace(/"/g, '')}">Ver ficha</button></span>`;
            aviso.classList.remove('hidden');
        }
    }

    function alternarDetalles(abrir) {
        const d = $('crm-mas-detalles');
        if (d) d.open = !!abrir;
    }

    document.addEventListener('click', (e) => {
        const modal = $('modalNuevoClienteCRM');
        if (!modal || !modal.contains(e.target)) return;
        const btn = e.target.closest('[data-crm-opciones] button[data-v]');
        if (btn) {
            const sel = $(btn.parentElement.getAttribute('data-crm-opciones'));
            if (sel) { sel.value = btn.getAttribute('data-v'); sincronizarBotones(); }
            return;
        }
        const pres = e.target.closest('[data-crm-presupuesto]');
        if (pres) { poner('crm-input-presupuesto', pres.getAttribute('data-crm-presupuesto')); return; }
        const ver = e.target.closest('[data-ver-repetido]');
        if (ver && typeof abrirModalFichaCliente360 === 'function') {
            const id = ver.getAttribute('data-ver-repetido');
            if (typeof cerrarModalNuevoClienteCRM === 'function') cerrarModalNuevoClienteCRM();
            abrirModalFichaCliente360(id);
        }
    });

    let temporizador = null;
    document.addEventListener('input', (e) => {
        if (e.target && e.target.id === 'crm-rapido-texto') {
            clearTimeout(temporizador);
            temporizador = setTimeout(aplicarTextoRapido, 350);
        }
        if (e.target && e.target.id === 'crm-input-telefono') revisarTelefonoRepetido();
    });

    // Lo llama abrirModalNuevoClienteCRM() cada vez que se abre el formulario
    API.alAbrirFormulario = function (esEdicion) {
        sincronizarBotones();
        const rap = $('crm-rapido-caja');
        if (rap) rap.classList.toggle('hidden', !!esEdicion);
        const resumen = $('crm-rapido-resumen'); if (resumen) resumen.innerHTML = '';
        const caja = $('crm-rapido-texto'); if (caja) caja.value = '';
        const aviso = $('crm-aviso-repetido'); if (aviso) aviso.classList.add('hidden');
        const otro = $('crm-btn-guardar-otro'); if (otro) otro.classList.toggle('hidden', !!esEdicion);
        // En edición se muestran los detalles; al crear, quedan recogidos para que sea corto
        alternarDetalles(!!esEdicion);
        setTimeout(() => {
            const foco = esEdicion ? $('crm-input-nombre') : (caja || $('crm-input-nombre'));
            if (foco && typeof foco.focus === 'function') foco.focus({ preventScroll: true });
        }, 60);
    };
    API.sincronizarBotones = sincronizarBotones;
    API.revisarTelefonoRepetido = revisarTelefonoRepetido;
})();
