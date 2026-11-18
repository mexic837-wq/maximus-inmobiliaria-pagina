/**
 * ====================================================================
 * MAXIMUS INMOBILIARIA - "Publica tu inmueble" (landing)
 * ====================================================================
 * Formulario corto para propietarios que quieren VENDER o ALQUILAR su
 * inmueble. Flujo:
 *
 *   1. RPC registrar_captacion_web (Supabase) guarda la solicitud y
 *      asigna el siguiente asesor Platinum de la cola rotativa
 *      (si no hay ninguno, va al equipo MAXIMUS).
 *   2. Webhook n8n /webhook/captacion-inmueble envía el WhatsApp al
 *      asesor (y una confirmación al cliente). Solo recibe el id.
 *   3. El cliente ve a su asesor y puede escribirle ya por WhatsApp.
 *
 * Si Supabase no responde (p. ej. falta ejecutar el SQL), el cliente
 * igual puede escribir al equipo MAXIMUS con sus datos ya redactados.
 *
 * SQL: sql/migration-captaciones-platinum.sql
 * n8n: n8n/workflow-captacion-inmueble.json
 */
(function () {
    'use strict';

    const OPERACIONES = [
        { id: 'venta',    texto: 'Vender',   icono: 'fa-tag', ayuda: 'Busco comprador' },
        { id: 'alquiler', texto: 'Alquilar', icono: 'fa-key', ayuda: 'Busco inquilino' }
    ];
    const TIPOS = [
        { id: 'Casa', icono: 'fa-house' },
        { id: 'Apartamento', icono: 'fa-building' },
        { id: 'Terreno', icono: 'fa-mountain-sun' },
        { id: 'Local comercial', icono: 'fa-store' },
        { id: 'Galpón', icono: 'fa-warehouse' },
        { id: 'Finca', icono: 'fa-tree' },
        { id: 'Oficina', icono: 'fa-briefcase' },
        { id: 'Otro', icono: 'fa-ellipsis' }
    ];
    const TOTAL_PASOS = 5;
    const WA_RESPALDO = (window.APP_CONFIG && APP_CONFIG.WHATSAPP_EQUIPO_MAXIMUS) || '584247114483';

    let modal = null;
    let operacion = 'venta';
    let tipo = '';
    let origenCta = 'landing';
    let enviando = false;

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = (id) => document.getElementById(id);

    // ---------- Estilos y animaciones propios del formulario ----------
    function inyectarEstilos() {
        if ($('publica-estilos')) return;
        const css = document.createElement('style');
        css.id = 'publica-estilos';
        css.textContent = `
            #modal-publica-inmueble .pi-in { opacity: 0; animation: piSube .45s cubic-bezier(.16,1,.3,1) forwards; }
            @keyframes piSube { from { opacity: 0; transform: translateY(12px); } to { opacity: 1; transform: none; } }
            @keyframes piSacude { 0%,100% { transform: translateX(0); } 20%,60% { transform: translateX(-6px); } 40%,80% { transform: translateX(6px); } }
            .pi-sacude { animation: piSacude .4s ease-in-out; }
            @keyframes piPop { 0% { transform: scale(.4); opacity: 0; } 70% { transform: scale(1.15); } 100% { transform: scale(1); opacity: 1; } }
            .pi-ok { animation: piPop .35s cubic-bezier(.16,1,.3,1) both; }
            @keyframes piBrillo { 0%, 70% { transform: translateX(-120%) skewX(-20deg); } 100% { transform: translateX(320%) skewX(-20deg); } }
            .pi-brillo { animation: piBrillo 3.2s ease-in-out infinite; }
            @keyframes piFlota { 0%,100% { transform: translate(0,0) scale(1); } 50% { transform: translate(14px,-10px) scale(1.12); } }
            .pi-blob { animation: piFlota 7s ease-in-out infinite; }
            .pi-blob.b2 { animation-duration: 9s; animation-delay: -3s; }
            @keyframes piIcono { 0%,100% { transform: translateY(0) rotate(0); } 50% { transform: translateY(-4px) rotate(-6deg); } }
            .pi-icono-flota { animation: piIcono 3.4s ease-in-out infinite; }
            .pi-chip { transition: transform .18s ease, background-color .18s ease, color .18s ease, border-color .18s ease, box-shadow .18s ease; }
            .pi-chip:active { transform: scale(.94); }
            .pi-chip[aria-pressed="true"] { animation: piPop .3s cubic-bezier(.16,1,.3,1); }
            .pi-op[aria-pressed="true"] .pi-op-icono { animation: piPop .35s cubic-bezier(.16,1,.3,1); }
            @keyframes piTrazo { to { stroke-dashoffset: 0; } }
            .pi-check-circulo { stroke-dasharray: 160; stroke-dashoffset: 160; animation: piTrazo .6s ease-out forwards; }
            .pi-check-marca { stroke-dasharray: 40; stroke-dashoffset: 40; animation: piTrazo .35s .5s ease-out forwards; }
            @keyframes piConfeti { 0% { transform: translate(0,0) scale(1); opacity: 1; } 100% { transform: translate(var(--dx), var(--dy)) scale(.4) rotate(220deg); opacity: 0; } }
            .pi-confeti { position: absolute; left: 50%; top: 50%; width: 7px; height: 7px; border-radius: 2px; animation: piConfeti .9s .35s ease-out forwards; opacity: 0; }
            /* Barra de scroll fina y verde, dentro del contenido (el encabezado queda fijo) */
            .pi-scroll { scrollbar-width: thin; scrollbar-color: #6EE7B7 transparent; scroll-behavior: smooth; }
            .pi-scroll::-webkit-scrollbar { width: 10px; }
            .pi-scroll::-webkit-scrollbar-track { background: transparent; margin: 10px 0; }
            .pi-scroll::-webkit-scrollbar-thumb {
                background: linear-gradient(180deg, #34D399, #0B4A3F);
                border: 3px solid #fff; border-radius: 9999px; min-height: 40px;
            }
            .pi-scroll::-webkit-scrollbar-thumb:hover { background: linear-gradient(180deg, #10B981, #06231D); }
            .pi-scroll::-webkit-scrollbar-button { display: none; height: 0; }
            @media (prefers-reduced-motion: reduce) {
                .pi-scroll { scroll-behavior: auto; }
                #modal-publica-inmueble .pi-in, .pi-brillo, .pi-blob, .pi-icono-flota, .pi-confeti { animation: none !important; opacity: 1 !important; }
                .pi-check-circulo, .pi-check-marca { animation: none !important; stroke-dashoffset: 0 !important; }
            }`;
        document.head.appendChild(css);
    }

    function crearModal() {
        if (modal) return;
        inyectarEstilos();
        modal = document.createElement('div');
        modal.id = 'modal-publica-inmueble';
        modal.className = 'fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-[#04110E]/70 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-300';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'publica-titulo');
        modal.innerHTML = `
            <div id="publica-panel" class="relative w-full sm:max-w-[440px] max-h-[94vh] flex flex-col overflow-hidden bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl shadow-black/40 translate-y-10 sm:translate-y-4 sm:scale-95 transition-all duration-300 ease-out">
                <div class="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#06231D] via-[#0B4A3F] to-[#0E5C4D] text-white px-6 pt-6 pb-5 rounded-t-[28px]">
                    <div class="pi-blob absolute -top-10 -right-8 w-40 h-40 rounded-full bg-emerald-400/25 blur-2xl pointer-events-none"></div>
                    <div class="pi-blob b2 absolute -bottom-14 -left-10 w-36 h-36 rounded-full bg-teal-300/15 blur-2xl pointer-events-none"></div>
                    <button type="button" data-cerrar class="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 hover:rotate-90 flex items-center justify-center transition-all duration-300 cursor-pointer" aria-label="Cerrar"><i class="fas fa-times"></i></button>
                    <div class="relative flex items-center gap-3.5 pr-10">
                        <span class="pi-icono-flota shrink-0 w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-xl text-emerald-300 shadow-inner"><i class="fas fa-house-circle-check"></i></span>
                        <div>
                            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-emerald-300">Asesoría sin costo</p>
                            <h3 id="publica-titulo" class="text-[22px] leading-tight font-extrabold">Publica tu inmueble</h3>
                        </div>
                    </div>
                    <p id="publica-subtitulo" class="relative text-[13px] text-emerald-50/75 mt-3">Responde 5 preguntas y un asesor te escribe por WhatsApp.</p>
                    <div id="publica-progreso-wrap" class="relative mt-4">
                        <div class="flex items-center justify-between text-[10px] font-bold uppercase tracking-wider text-emerald-100/70 mb-1.5">
                            <span>Tu solicitud</span><span id="publica-progreso-texto">1 de ${TOTAL_PASOS}</span>
                        </div>
                        <div class="h-1.5 rounded-full bg-white/10 overflow-hidden">
                            <div id="publica-progreso" class="h-full rounded-full bg-gradient-to-r from-emerald-400 to-teal-300 shadow-[0_0_12px_rgba(52,211,153,.7)] transition-all duration-500 ease-out" style="width:20%"></div>
                        </div>
                    </div>
                </div>
                <div id="publica-cuerpo" class="pi-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pt-5 pb-6"></div>
            </div>`;
        document.body.appendChild(modal);

        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('[data-cerrar]')) cerrar();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && !modal.classList.contains('pointer-events-none')) cerrar();
        });
    }

    const ETIQUETA = 'flex items-center gap-2 text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-2';
    const NUM = (n) => `<span class="w-5 h-5 rounded-full bg-emerald-50 text-maximus-dark text-[10px] font-black flex items-center justify-center">${n}</span>`;

    function campo(id, n, etiqueta, icono, attrs) {
        return `
            <div class="pi-campo">
                <label for="${id}" class="${ETIQUETA}">${NUM(n)}${etiqueta}</label>
                <div class="pi-caja relative flex items-center h-12 rounded-2xl bg-gray-50 border-2 border-transparent transition-all duration-200 focus-within:bg-white focus-within:border-maximus-accent focus-within:shadow-[0_0_0_4px_rgba(16,185,129,.12)]">
                    <i class="${icono} w-11 text-center text-gray-400 text-sm transition-colors"></i>
                    <input id="${id}" ${attrs} class="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-[15px] text-gray-900 placeholder-gray-400 pr-10">
                    <span data-ok class="absolute right-3.5 hidden items-center text-maximus-accent"><i class="fas fa-circle-check"></i></span>
                </div>
            </div>`;
    }

    function pintarFormulario() {
        const ops = OPERACIONES.map(o => `
            <button type="button" data-op="${o.id}" aria-pressed="${o.id === operacion}" class="pi-op relative z-10 flex items-center justify-center gap-2.5 h-14 rounded-xl transition-colors duration-300 cursor-pointer ${o.id === operacion ? 'text-white' : 'text-gray-600 hover:text-gray-900'}">
                <span class="pi-op-icono w-8 h-8 rounded-lg flex items-center justify-center text-sm transition-colors duration-300 ${o.id === operacion ? 'bg-white/15' : 'bg-white shadow-sm'}"><i class="fas ${o.icono}"></i></span>
                <span class="text-left leading-tight"><strong class="block text-sm">${o.texto}</strong><span class="block text-[10px] font-semibold opacity-75">${o.ayuda}</span></span>
            </button>`).join('');

        const chips = TIPOS.map(t => `
            <button type="button" data-tipo="${esc(t.id)}" aria-pressed="${t.id === tipo}" class="pi-chip inline-flex items-center gap-1.5 h-9 px-3.5 rounded-full border text-[13px] font-semibold cursor-pointer ${t.id === tipo
                ? 'bg-maximus-dark border-maximus-dark text-white shadow-md shadow-emerald-900/25'
                : 'bg-white border-gray-200 text-gray-600 hover:border-maximus-accent hover:text-maximus-dark'}">
                <i class="fas ${t.icono} text-[11px] ${t.id === tipo ? 'text-emerald-300' : 'text-gray-400'}"></i>${esc(t.id)}
            </button>`).join('');

        $('publica-cuerpo').innerHTML = `
            <form id="form-publica-inmueble" class="space-y-5" novalidate>
                <div class="pi-in" style="animation-delay:.05s">
                    <span class="${ETIQUETA}">${NUM(1)}¿Qué quieres hacer?</span>
                    <div class="relative grid grid-cols-2 gap-1 p-1 rounded-2xl bg-gray-100">
                        <span id="publica-op-indicador" class="absolute top-1 bottom-1 left-1 w-[calc(50%-6px)] rounded-xl bg-gradient-to-br from-maximus-dark to-[#0E6352] shadow-lg shadow-emerald-900/30 transition-transform duration-300 ease-[cubic-bezier(.16,1,.3,1)]" style="transform:translateX(${operacion === 'alquiler' ? 'calc(100% + 4px)' : '0'})"></span>
                        ${ops}
                    </div>
                </div>
                <div class="pi-in" style="animation-delay:.1s">
                    <span class="${ETIQUETA}">${NUM(2)}Tipo de inmueble</span>
                    <div id="publica-tipos" class="flex flex-wrap gap-2">${chips}</div>
                </div>
                <div class="pi-in" style="animation-delay:.15s">
                    ${campo('pub-zona', 3, 'Zona o barrio', 'fas fa-location-dot','required maxlength="120" autocomplete="address-level2" placeholder="Ej: El Parral, San Cristóbal"')}
                </div>
                <div class="pi-in space-y-5" style="animation-delay:.2s">
                    ${campo('pub-nombre', 4, 'Tu nombre', 'fas fa-user', 'required maxlength="80" autocomplete="name" placeholder="Nombre y apellido"')}
                    ${campo('pub-whatsapp', 5, 'Tu WhatsApp', 'fab fa-whatsapp','required type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="0424 123 4567"')}
                </div>
                <div class="pi-in" style="animation-delay:.25s">
                    <button type="button" id="publica-mostrar-precio" class="inline-flex items-center gap-1.5 text-xs font-bold text-maximus-dark hover:text-maximus-accent cursor-pointer transition-colors">
                        <i class="fas fa-plus-circle"></i> Agregar precio aproximado <span class="font-medium text-gray-400">(opcional)</span>
                    </button>
                    <div id="publica-precio-wrap" class="grid grid-rows-[0fr] transition-all duration-300 ease-out">
                        <div class="overflow-hidden">
                            <div class="pt-3">
                                <div class="pi-caja relative flex items-center h-12 rounded-2xl bg-gray-50 border-2 border-transparent transition-all duration-200 focus-within:bg-white focus-within:border-maximus-accent focus-within:shadow-[0_0_0_4px_rgba(16,185,129,.12)]">
                                    <i class="fas fa-dollar-sign w-11 text-center text-gray-400 text-sm"></i>
                                    <input id="pub-precio" maxlength="60" placeholder="Ej: 45.000 USD" class="flex-1 min-w-0 h-full bg-transparent border-0 outline-none text-[15px] text-gray-900 placeholder-gray-400 pr-4">
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
                <!-- Trampa para bots: las personas no ven este campo -->
                <input id="pub-web" type="text" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true">
                <p id="publica-error" role="alert" class="hidden items-center gap-2 text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5"></p>
                <div class="pi-in" style="animation-delay:.3s">
                    <button type="submit" id="publica-enviar" class="group relative w-full h-14 rounded-2xl overflow-hidden bg-gradient-to-r from-maximus-dark via-[#0E6352] to-maximus-dark text-white font-extrabold text-[15px] flex items-center justify-center gap-2.5 shadow-xl shadow-emerald-900/30 hover:shadow-emerald-700/40 hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer">
                        <span class="pi-brillo absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none"></span>
                        <span class="relative w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center shadow-md group-hover:scale-110 transition-transform"><i class="fab fa-whatsapp text-lg"></i></span>
                        <span class="relative">Quiero que me contacten</span>
                        <i class="relative fas fa-arrow-right text-xs opacity-70 group-hover:translate-x-1 transition-transform"></i>
                    </button>
                    <p class="mt-3 text-[11px] text-center text-gray-400 flex items-center justify-center gap-1.5"><i class="fas fa-lock text-[10px]"></i> Usamos tus datos solo para contactarte sobre esta solicitud.</p>
                </div>
            </form>`;

        const form = $('form-publica-inmueble');
        form.querySelectorAll('.pi-op').forEach(b => b.addEventListener('click', () => elegirOperacion(b.dataset.op)));
        form.querySelectorAll('.pi-chip').forEach(b => b.addEventListener('click', () => elegirTipo(b.dataset.tipo)));
        ['pub-zona', 'pub-nombre', 'pub-whatsapp'].forEach(id => $(id).addEventListener('input', () => { marcarCampo(id); actualizarProgreso(); }));
        $('publica-mostrar-precio').addEventListener('click', () => {
            $('publica-precio-wrap').classList.replace('grid-rows-[0fr]', 'grid-rows-[1fr]');
            $('publica-mostrar-precio').classList.add('hidden');
            setTimeout(() => $('pub-precio').focus(), 200);
        });
        form.addEventListener('submit', enviar);
        actualizarProgreso();
    }

    // Cambia de Vender / Alquilar sin redibujar el formulario: el indicador se desliza
    function elegirOperacion(op) {
        if (op === operacion) return;
        operacion = op;
        const ind = $('publica-op-indicador');
        if (ind) ind.style.transform = 'translateX(' + (op === 'alquiler' ? 'calc(100% + 4px)' : '0') + ')';
        document.querySelectorAll('#form-publica-inmueble .pi-op').forEach(b => {
            const activo = b.dataset.op === op;
            b.setAttribute('aria-pressed', activo);
            b.classList.toggle('text-white', activo);
            b.classList.toggle('text-gray-600', !activo);
            b.classList.toggle('hover:text-gray-900', !activo);
            const ic = b.querySelector('.pi-op-icono');
            ic.classList.toggle('bg-white/15', activo);
            ic.classList.toggle('bg-white', !activo);
            ic.classList.toggle('shadow-sm', !activo);
        });
    }

    function elegirTipo(t) {
        tipo = t;
        document.querySelectorAll('#publica-tipos .pi-chip').forEach(b => {
            const activo = b.dataset.tipo === t;
            b.setAttribute('aria-pressed', activo);
            ['bg-maximus-dark', 'border-maximus-dark', 'text-white', 'shadow-md', 'shadow-emerald-900/25'].forEach(c => b.classList.toggle(c, activo));
            ['bg-white', 'border-gray-200', 'text-gray-600', 'hover:border-maximus-accent', 'hover:text-maximus-dark'].forEach(c => b.classList.toggle(c, !activo));
            const ic = b.querySelector('i');
            ic.classList.toggle('text-emerald-300', activo);
            ic.classList.toggle('text-gray-400', !activo);
        });
        $('publica-tipos').classList.remove('pi-sacude');
        actualizarProgreso();
    }

    function esValido(id) {
        const v = (($(id) || {}).value || '').trim();
        if (id === 'pub-whatsapp') { const w = normalizarWhatsapp(v); return w.length >= 10 && w.length <= 15; }
        return v.length >= 2;
    }

    function marcarCampo(id) {
        const caja = $(id).closest('.pi-caja');
        const ok = caja.querySelector('[data-ok]');
        const valido = esValido(id);
        if (valido && ok.classList.contains('hidden')) { ok.classList.remove('hidden'); ok.classList.add('flex', 'pi-ok'); }
        if (!valido) { ok.classList.add('hidden'); ok.classList.remove('flex', 'pi-ok'); }
        caja.classList.remove('border-red-300', 'bg-red-50/50');
        const icono = caja.querySelector('i');
        icono.classList.toggle('text-maximus-accent', valido);
        icono.classList.toggle('text-gray-400', !valido);
    }

    function actualizarProgreso() {
        const hechos = 1 + (tipo ? 1 : 0) + ['pub-zona', 'pub-nombre', 'pub-whatsapp'].filter(esValido).length;
        const barra = $('publica-progreso');
        if (barra) barra.style.width = (hechos / TOTAL_PASOS * 100) + '%';
        const txt = $('publica-progreso-texto');
        if (txt) txt.textContent = hechos === TOTAL_PASOS ? '¡Listo para enviar!' : `${hechos} de ${TOTAL_PASOS}`;
    }

    function leerFormulario() {
        return {
            tipo,
            zona: (($('pub-zona') || {}).value || '').trim(),
            nombre: (($('pub-nombre') || {}).value || '').trim(),
            whatsapp: (($('pub-whatsapp') || {}).value || '').trim(),
            precio: (($('pub-precio') || {}).value || '').trim(),
            trampa: (($('pub-web') || {}).value || '').trim()
        };
    }

    function mostrarError(msg) {
        const el = $('publica-error');
        if (!el) return;
        el.innerHTML = msg ? '<i class="fas fa-circle-exclamation"></i><span></span>' : '';
        if (msg) el.querySelector('span').textContent = msg;
        el.classList.toggle('hidden', !msg);
        el.classList.toggle('flex', !!msg);
    }

    // 0424-1234567 → 584241234567 ; +58 424... → 58424...
    function normalizarWhatsapp(v) {
        let d = String(v || '').replace(/\D/g, '');
        if (/^0\d{10}$/.test(d)) d = '58' + d.slice(1);
        return d;
    }

    // Devuelve el mensaje y el elemento que hay que señalar
    function validar(d) {
        if (!d.tipo) return ['Elige el tipo de inmueble.', $('publica-tipos')];
        if (d.zona.length < 2) return ['Escribe la zona o el barrio del inmueble.', $('pub-zona')];
        if (d.nombre.length < 2) return ['Escribe tu nombre.', $('pub-nombre')];
        const wa = normalizarWhatsapp(d.whatsapp);
        if (wa.length < 10 || wa.length > 15) return ['Revisa tu número de WhatsApp (ej: 0424 123 4567).', $('pub-whatsapp')];
        return ['', null];
    }

    function sacudir(el) {
        if (!el) return;
        const blanco = el.closest('.pi-caja') || el;
        blanco.classList.remove('pi-sacude');
        void blanco.offsetWidth; // reinicia la animación
        blanco.classList.add('pi-sacude');
        if (blanco.classList.contains('pi-caja')) blanco.classList.add('border-red-300', 'bg-red-50/50');
        if (el.focus && el.tagName === 'INPUT') el.focus();
    }

    async function registrarEnSupabase(d) {
        const url = window.APP_CONFIG && APP_CONFIG.SUPABASE_URL;
        const key = window.APP_CONFIG && APP_CONFIG.SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error('sin_config');
        const ctrl = new AbortController();
        const t = setTimeout(() => ctrl.abort(), 12000);
        try {
            const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/registrar_captacion_web', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
                body: JSON.stringify({
                    p_operacion: operacion,
                    p_tipo_inmueble: d.tipo,
                    p_zona: d.zona,
                    p_nombre: d.nombre,
                    p_whatsapp: normalizarWhatsapp(d.whatsapp),
                    p_precio_estimado: d.precio || null,
                    p_comentario: origenCta ? ('Origen: ' + origenCta) : null
                }),
                signal: ctrl.signal
            });
            if (!r.ok) throw new Error('http_' + r.status);
            return await r.json();
        } finally {
            clearTimeout(t);
        }
    }

    function avisarN8n(captacionId) {
        try {
            const base = window.APP_CONFIG && APP_CONFIG.N8N_BASE_URL;
            const ruta = window.APP_CONFIG && APP_CONFIG.N8N_WEBHOOKS && APP_CONFIG.N8N_WEBHOOKS.CAPTACION_INMUEBLE;
            if (!base || !ruta) return;
            // keepalive: el aviso sale aunque el usuario cierre la pestaña al tocar WhatsApp
            fetch(base + ruta, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ captacion_id: captacionId }),
                keepalive: true
            }).catch(() => {});
        } catch (_) { /* el WhatsApp del cliente igual funciona */ }
    }

    function textoOperacion() {
        return ({ venta: 'vender', alquiler: 'poner en alquiler' })[operacion] || operacion;
    }

    function confeti() {
        const colores = ['#10B981', '#34D399', '#0B4A3F', '#FBBF24', '#A7F3D0'];
        return Array.from({ length: 14 }, (_, i) => {
            const ang = (i / 14) * Math.PI * 2;
            const r = 46 + (i % 3) * 14;
            return `<span class="pi-confeti" style="background:${colores[i % colores.length]};--dx:${Math.round(Math.cos(ang) * r)}px;--dy:${Math.round(Math.sin(ang) * r)}px"></span>`;
        }).join('');
    }

    function pintarExito(d, res) {
        const ok = !!(res && res.ok);
        const asesor = ok ? res.asesor_nombre : 'Equipo MAXIMUS';
        const wa = (ok && res.asesor_whatsapp) || WA_RESPALDO;
        const codigo = ok ? res.codigo : '';
        const esEquipo = !ok || res.es_equipo_maximus;
        const saludo = esEquipo ? 'MAXIMUS' : asesor.split(' ')[0];
        const pedido = `${textoOperacion()} ${d.tipo.toLowerCase()} en ${d.zona}${d.precio ? ` (aprox. ${d.precio})` : ''}`;
        const msg = `Hola ${saludo}, soy ${d.nombre}. ${codigo ? `Te escribo por la solicitud ${codigo}: quiero ${pedido}.` : `Quiero ${pedido}.`}`;
        const href = `https://wa.me/${encodeURIComponent(wa)}?text=${encodeURIComponent(msg)}`;
        const iniciales = asesor.split(' ').filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase();

        const barra = $('publica-progreso');
        if (barra) barra.style.width = '100%';
        const txt = $('publica-progreso-texto');
        if (txt) txt.textContent = ok ? '¡Enviada!' : 'Último paso';

        $('publica-cuerpo').innerHTML = `
            <div class="text-center space-y-5 py-1">
                <div class="relative w-20 h-20 mx-auto pi-in">
                    ${confeti()}
                    <svg viewBox="0 0 56 56" class="w-20 h-20" aria-hidden="true">
                        <circle class="pi-check-circulo" cx="28" cy="28" r="25" fill="#ECFDF5" stroke="#10B981" stroke-width="3"/>
                        <path class="pi-check-marca" d="M17 29l7 7 15-16" fill="none" stroke="#0B4A3F" stroke-width="4" stroke-linecap="round" stroke-linejoin="round"/>
                    </svg>
                </div>
                <div class="pi-in" style="animation-delay:.15s">
                    <h4 class="text-xl font-extrabold text-gray-900">${ok ? '¡Solicitud recibida!' : 'Te atendemos por WhatsApp'}</h4>
                    <p class="text-sm text-gray-500 mt-1.5 leading-relaxed">${ok
                        ? 'Ya avisamos a tu asesor. Te escribirá muy pronto a tu WhatsApp.'
                        : 'No pudimos registrar tu solicitud automáticamente. Escríbenos y te atendemos de inmediato.'}</p>
                </div>
                <div class="pi-in flex items-center gap-3 p-3.5 rounded-2xl bg-gradient-to-r from-emerald-50 to-white border border-emerald-100 text-left" style="animation-delay:.25s">
                    <span class="w-12 h-12 rounded-2xl bg-gradient-to-br from-maximus-dark to-[#0E6352] text-white font-black flex items-center justify-center shrink-0">${esc(iniciales || 'M')}</span>
                    <div class="min-w-0 flex-1">
                        <p class="text-[10px] font-black uppercase tracking-wider text-maximus-accent">${esEquipo ? 'Te atiende' : 'Tu asesor asignado'}</p>
                        <p class="font-extrabold text-gray-900 truncate">${esc(asesor)}</p>
                        ${!esEquipo ? '<p class="text-[11px] font-semibold text-slate-500"><i class="fas fa-gem text-[10px]"></i> Asesor Platinum</p>' : ''}
                    </div>
                    ${codigo ? `<span class="shrink-0 text-[10px] font-mono font-bold text-gray-500 bg-white border border-gray-200 rounded-lg px-2 py-1">${esc(codigo)}</span>` : ''}
                </div>
                <div class="pi-in space-y-2" style="animation-delay:.35s">
                    <a href="${href}" target="_blank" rel="noopener" class="group relative w-full h-14 rounded-2xl overflow-hidden bg-[#25D366] hover:bg-[#1EBE5A] text-white font-extrabold text-[15px] flex items-center justify-center gap-2 shadow-xl shadow-green-600/25 hover:-translate-y-0.5 transition-all">
                        <span class="pi-brillo absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/30 to-transparent pointer-events-none"></span>
                        <i class="relative fab fa-whatsapp text-xl"></i> <span class="relative">Escribir ${ok ? 'ya a ' + esc(asesor.split(' ')[0]) : 'a MAXIMUS'}</span>
                    </a>
                    <button type="button" data-cerrar class="w-full h-11 rounded-2xl text-sm font-semibold text-gray-500 hover:bg-gray-50 cursor-pointer">Cerrar</button>
                </div>
            </div>`;
    }

    function textoBotonNormal() {
        return '<span class="pi-brillo absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/25 to-transparent pointer-events-none"></span>'
            + '<span class="relative w-8 h-8 rounded-full bg-[#25D366] flex items-center justify-center shadow-md group-hover:scale-110 transition-transform"><i class="fab fa-whatsapp text-lg"></i></span>'
            + '<span class="relative">Quiero que me contacten</span>'
            + '<i class="relative fas fa-arrow-right text-xs opacity-70 group-hover:translate-x-1 transition-transform"></i>';
    }

    async function enviar(e) {
        e.preventDefault();
        if (enviando) return;
        const d = leerFormulario();
        if (d.trampa) { cerrar(); return; } // bot
        const [err, campoMal] = validar(d);
        mostrarError(err);
        if (err) { sacudir(campoMal); return; }

        enviando = true;
        const btn = $('publica-enviar');
        if (btn) { btn.disabled = true; btn.classList.add('opacity-90', 'cursor-wait'); btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> <span>Buscando tu asesor…</span>'; }

        let res = null;
        try {
            res = await registrarEnSupabase(d);
            if (res && !res.ok) {
                const MSG = {
                    limite_por_numero: 'Ya recibimos varias solicitudes de este número hoy. Tu asesor te contactará pronto.',
                    whatsapp_invalido: 'Revisa tu número de WhatsApp (ej: 0424 123 4567).',
                    datos_invalidos: 'Revisa los datos del formulario.'
                };
                if (MSG[res.error]) { mostrarError(MSG[res.error]); return; }
            }
            if (res && res.ok && res.captacion_id) avisarN8n(res.captacion_id);
        } catch (ex) {
            console.warn('Publica tu inmueble: no se pudo registrar en Supabase, se ofrece WhatsApp directo.', ex);
            res = null;
        } finally {
            enviando = false;
            if (btn && document.body.contains(btn)) { btn.disabled = false; btn.classList.remove('opacity-90', 'cursor-wait'); btn.innerHTML = textoBotonNormal(); }
        }
        pintarExito(d, res);
    }

    function abrir(origen) {
        crearModal();
        origenCta = origen || 'landing';
        operacion = 'venta';
        tipo = '';
        pintarFormulario();
        modal.classList.remove('opacity-0', 'pointer-events-none');
        const panel = $('publica-panel');
        if (panel) panel.classList.remove('translate-y-10', 'sm:translate-y-4', 'sm:scale-95');
        document.documentElement.style.overflow = 'hidden';
    }

    function cerrar() {
        if (!modal) return;
        modal.classList.add('opacity-0', 'pointer-events-none');
        const panel = $('publica-panel');
        if (panel) panel.classList.add('translate-y-10', 'sm:translate-y-4', 'sm:scale-95');
        document.documentElement.style.overflow = '';
    }

    window.abrirPublicaInmueble = abrir;
    window.cerrarPublicaInmueble = cerrar;

    // Enlace directo: /inicio#publicar o /inicio?publicar=1
    document.addEventListener('DOMContentLoaded', () => {
        const q = new URLSearchParams(location.search);
        if (location.hash === '#publicar' || q.get('publicar') === '1') setTimeout(() => abrir('enlace'), 400);
    });
})();
