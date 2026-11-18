/**
 * ====================================================================
 * MAXIMUS INMOBILIARIA - Oficinas aliadas
 * ====================================================================
 *  · abrirRegistroInmobiliaria(origen)  → formulario "¿Inmobiliaria? Regístrate aquí"
 *  · OficinasAliadas.pintar(contenedor) → sección "Oficinas aliadas" de la landing
 *
 * Flujo: registro → queda "pendiente" → n8n avisa al admin por correo →
 * el admin la aprueba → aparece en la landing.
 * SQL: Parte 7 de sql/PENDIENTE-SUPABASE-TODO-EN-UNO.sql
 * n8n: n8n/workflow-oficina-aliada.json
 */
(function () {
    'use strict';

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = (id) => document.getElementById(id);
    const digitos = (t) => String(t || '').replace(/\D/g, '');

    function normalizarWhatsapp(v) {
        let d = digitos(v);
        if (/^0\d{10}$/.test(d)) d = '58' + d.slice(1);
        return d;
    }

    function cfg() {
        const url = window.APP_CONFIG && APP_CONFIG.SUPABASE_URL;
        const key = window.APP_CONFIG && APP_CONFIG.SUPABASE_ANON_KEY;
        return url && key ? { url: url.replace(/\/$/, ''), key } : null;
    }

    async function rpc(nombre, body) {
        const c = cfg();
        if (!c) throw new Error('sin_config');
        const r = await fetch(`${c.url}/rest/v1/rpc/${nombre}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: c.key, Authorization: 'Bearer ' + c.key },
            body: JSON.stringify(body || {})
        });
        if (!r.ok) throw new Error('http_' + r.status);
        return r.json();
    }

    // ================================================================
    // 1. FORMULARIO DE REGISTRO
    // ================================================================
    let modal = null;
    let origenRegistro = 'web';
    let enviando = false;

    const ETIQUETA = 'block text-[11px] font-extrabold uppercase tracking-wider text-gray-500 mb-1.5';
    const CAJA = 'w-full h-11 rounded-xl bg-gray-50 border-2 border-transparent px-3.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-maximus-accent transition';

    function crearModal() {
        if (modal) return;
        modal = document.createElement('div');
        modal.id = 'modal-registro-inmobiliaria';
        modal.className = 'fixed inset-0 z-[80] flex items-end sm:items-center justify-center bg-[#04110E]/70 backdrop-blur-sm opacity-0 pointer-events-none transition-opacity duration-300';
        modal.setAttribute('role', 'dialog');
        modal.setAttribute('aria-modal', 'true');
        modal.setAttribute('aria-labelledby', 'registro-inmo-titulo');
        modal.innerHTML = `
            <div id="registro-inmo-panel" class="relative w-full sm:max-w-[460px] max-h-[94vh] flex flex-col overflow-hidden bg-white rounded-t-[28px] sm:rounded-[28px] shadow-2xl translate-y-10 sm:translate-y-4 sm:scale-95 transition-all duration-300 ease-out">
                <div class="relative shrink-0 overflow-hidden bg-gradient-to-br from-[#0B2A3F] via-[#0B4A3F] to-[#0E5C4D] text-white px-6 pt-6 pb-5">
                    <div class="absolute -top-10 -right-8 w-40 h-40 rounded-full bg-sky-400/20 blur-2xl pointer-events-none"></div>
                    <button type="button" data-cerrar class="absolute top-4 right-4 z-10 w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 flex items-center justify-center transition cursor-pointer" aria-label="Cerrar"><i class="fas fa-times"></i></button>
                    <div class="relative flex items-center gap-3.5 pr-10">
                        <span class="shrink-0 w-12 h-12 rounded-2xl bg-white/10 border border-white/20 flex items-center justify-center text-xl text-sky-300"><i class="fas fa-building"></i></span>
                        <div>
                            <p class="text-[10px] font-black uppercase tracking-[0.2em] text-sky-300">Red de oficinas aliadas</p>
                            <h3 id="registro-inmo-titulo" class="text-[22px] leading-tight font-extrabold">Registra tu inmobiliaria</h3>
                        </div>
                    </div>
                    <p class="relative text-[13px] text-emerald-50/75 mt-3">Revisamos tu solicitud y, al aprobarla, tu oficina aparece en la web de MAXIMUS.</p>
                </div>
                <div id="registro-inmo-cuerpo" class="pi-scroll flex-1 min-h-0 overflow-y-auto overscroll-contain px-6 pt-5 pb-6"></div>
            </div>`;
        document.body.appendChild(modal);
        modal.addEventListener('click', (e) => {
            if (e.target === modal || e.target.closest('[data-cerrar]')) cerrarRegistro();
        });
        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && modal && !modal.classList.contains('pointer-events-none')) cerrarRegistro();
        });
    }

    function pintarFormulario() {
        $('registro-inmo-cuerpo').innerHTML = `
            <form id="form-registro-inmo" class="space-y-4" novalidate>
                <div>
                    <label for="ri-nombre" class="${ETIQUETA}">Nombre de la inmobiliaria *</label>
                    <input id="ri-nombre" maxlength="80" autocomplete="organization" placeholder="Ej: Inversiones Táchira Bienes Raíces" class="${CAJA}">
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label for="ri-responsable" class="${ETIQUETA}">Tu nombre *</label>
                        <input id="ri-responsable" maxlength="80" autocomplete="name" placeholder="Nombre y apellido" class="${CAJA}">
                    </div>
                    <div>
                        <label for="ri-whatsapp" class="${ETIQUETA}">WhatsApp de la oficina *</label>
                        <input id="ri-whatsapp" type="tel" inputmode="tel" maxlength="20" autocomplete="tel" placeholder="0424 123 4567" class="${CAJA}">
                    </div>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                        <label for="ri-zona" class="${ETIQUETA}">Zona o ciudad *</label>
                        <input id="ri-zona" maxlength="120" placeholder="Ej: San Cristóbal" class="${CAJA}">
                    </div>
                    <div>
                        <label for="ri-asesores" class="${ETIQUETA}">N.º de asesores</label>
                        <input id="ri-asesores" type="number" min="1" max="500" inputmode="numeric" placeholder="Ej: 5" class="${CAJA}">
                    </div>
                </div>
                <div>
                    <label for="ri-email" class="${ETIQUETA}">Correo <span class="normal-case font-medium text-gray-400">(opcional, no se publica)</span></label>
                    <input id="ri-email" type="email" maxlength="120" autocomplete="email" placeholder="oficina@correo.com" class="${CAJA}">
                </div>
                <div>
                    <label for="ri-web" class="${ETIQUETA}">Web o Instagram <span class="normal-case font-medium text-gray-400">(opcional)</span></label>
                    <input id="ri-web" maxlength="160" placeholder="@tuinmobiliaria o www.tuinmobiliaria.com" class="${CAJA}">
                </div>
                <div>
                    <label for="ri-desc" class="${ETIQUETA}">Cuéntanos de tu oficina <span class="normal-case font-medium text-gray-400">(opcional)</span></label>
                    <textarea id="ri-desc" maxlength="400" rows="3" placeholder="Especialidad, años en el mercado, zonas que atienden…" class="w-full rounded-xl bg-gray-50 border-2 border-transparent px-3.5 py-2.5 text-sm text-gray-900 placeholder-gray-400 outline-none focus:bg-white focus:border-maximus-accent transition resize-none"></textarea>
                </div>
                <label class="flex items-start gap-2.5 text-xs text-gray-600 cursor-pointer select-none">
                    <input id="ri-acepto" type="checkbox" class="mt-0.5 w-4 h-4 accent-emerald-600 shrink-0">
                    <span>Acepto que, si aprueban mi oficina, se muestren en la web su nombre, zona, WhatsApp, web/Instagram y descripción.</span>
                </label>
                <input id="ri-trampa" type="text" tabindex="-1" autocomplete="off" class="hidden" aria-hidden="true">
                <p id="ri-error" role="alert" class="hidden text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2.5"></p>
                <button type="submit" id="ri-enviar" class="w-full h-12 rounded-2xl bg-gradient-to-r from-maximus-dark to-[#0E6352] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg hover:-translate-y-0.5 active:translate-y-0 transition-all cursor-pointer">
                    <i class="fas fa-paper-plane"></i> <span>Enviar solicitud</span>
                </button>
            </form>`;
        $('form-registro-inmo').addEventListener('submit', enviar);
    }

    function leer() {
        const v = (id) => (($(id) || {}).value || '').trim();
        return {
            nombre: v('ri-nombre'), responsable: v('ri-responsable'), whatsapp: v('ri-whatsapp'),
            zona: v('ri-zona'), asesores: v('ri-asesores'), email: v('ri-email'), web: v('ri-web'),
            desc: v('ri-desc'), acepto: !!($('ri-acepto') && $('ri-acepto').checked), trampa: v('ri-trampa')
        };
    }

    function mostrarError(msg, campo) {
        const el = $('ri-error');
        if (el) { el.textContent = msg || ''; el.classList.toggle('hidden', !msg); }
        if (campo && $(campo)) { $(campo).focus(); $(campo).classList.add('border-red-300'); }
    }

    function validar(d) {
        if (d.nombre.length < 2) return ['Escribe el nombre de la inmobiliaria.', 'ri-nombre'];
        if (d.responsable.length < 2) return ['Escribe tu nombre.', 'ri-responsable'];
        const wa = normalizarWhatsapp(d.whatsapp);
        if (wa.length < 10 || wa.length > 15) return ['Revisa el WhatsApp (ej: 0424 123 4567).', 'ri-whatsapp'];
        if (d.zona.length < 2) return ['Escribe la zona o ciudad de la oficina.', 'ri-zona'];
        if (d.asesores && !(Number(d.asesores) >= 1 && Number(d.asesores) <= 500)) return ['El número de asesores debe estar entre 1 y 500.', 'ri-asesores'];
        if (d.email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(d.email)) return ['Revisa el correo.', 'ri-email'];
        if (!d.acepto) return ['Marca la casilla para aceptar que se publiquen los datos de la oficina.', 'ri-acepto'];
        return ['', null];
    }

    function avisarN8n(id) {
        try {
            const base = window.APP_CONFIG && APP_CONFIG.N8N_BASE_URL;
            const ruta = window.APP_CONFIG && APP_CONFIG.N8N_WEBHOOKS && APP_CONFIG.N8N_WEBHOOKS.OFICINA_ALIADA;
            if (!base || !ruta) return;
            fetch(base + ruta, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ oficina_id: id, origen: origenRegistro }), keepalive: true }).catch(() => {});
        } catch (_) { /* el registro igual quedó guardado */ }
    }

    function pintarExito(d, ok) {
        const wa = (window.APP_CONFIG && APP_CONFIG.WHATSAPP_EQUIPO_MAXIMUS) || '584247114483';
        const msg = `Hola MAXIMUS, quiero registrar mi inmobiliaria "${d.nombre}" (${d.zona}) en la red de oficinas aliadas. Mi nombre es ${d.responsable}.`;
        $('registro-inmo-cuerpo').innerHTML = `
            <div class="text-center space-y-4 py-2">
                <div class="w-16 h-16 mx-auto rounded-2xl ${ok ? 'bg-emerald-50 text-maximus-accent' : 'bg-amber-50 text-amber-600'} flex items-center justify-center text-3xl"><i class="fas ${ok ? 'fa-circle-check' : 'fa-comments'}"></i></div>
                <div>
                    <h4 class="text-xl font-extrabold text-gray-900">${ok ? '¡Solicitud enviada!' : 'Terminemos por WhatsApp'}</h4>
                    <p class="text-sm text-gray-500 mt-1.5 leading-relaxed">${ok
                        ? `Recibimos los datos de <strong class="text-gray-900">${esc(d.nombre)}</strong>. Nuestro equipo la revisa y te escribe al WhatsApp que dejaste. Al aprobarla, tu oficina aparece en la web.`
                        : 'No pudimos guardar tu solicitud automáticamente. Escríbenos y la registramos nosotros.'}</p>
                </div>
                ${ok ? '' : `<a href="https://wa.me/${wa}?text=${encodeURIComponent(msg)}" target="_blank" rel="noopener" class="w-full h-12 rounded-2xl bg-[#25D366] hover:bg-[#1EBE5A] text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg transition"><i class="fab fa-whatsapp text-lg"></i> Escribir a MAXIMUS</a>`}
                <button type="button" data-cerrar class="w-full h-11 rounded-2xl text-sm font-semibold text-gray-500 hover:bg-gray-50 cursor-pointer">Cerrar</button>
            </div>`;
    }

    async function enviar(e) {
        e.preventDefault();
        if (enviando) return;
        const d = leer();
        if (d.trampa) { cerrarRegistro(); return; }
        ['ri-nombre', 'ri-responsable', 'ri-whatsapp', 'ri-zona', 'ri-asesores', 'ri-email'].forEach(id => $(id) && $(id).classList.remove('border-red-300'));
        const [err, campo] = validar(d);
        mostrarError(err, campo);
        if (err) return;

        enviando = true;
        const btn = $('ri-enviar');
        if (btn) { btn.disabled = true; btn.innerHTML = '<i class="fas fa-circle-notch fa-spin"></i> <span>Enviando…</span>'; }
        let ok = false;
        try {
            const res = await rpc('registrar_oficina_aliada', {
                p_nombre: d.nombre, p_responsable: d.responsable, p_whatsapp: normalizarWhatsapp(d.whatsapp), p_zona: d.zona,
                p_email: d.email || null, p_num_asesores: d.asesores ? Number(d.asesores) : null,
                p_sitio_web: d.web || null, p_descripcion: d.desc || null
            });
            if (res && !res.ok) {
                const MSG = {
                    ya_registrada: 'Ya recibimos una solicitud de este WhatsApp hoy. Te escribiremos pronto.',
                    whatsapp_invalido: 'Revisa el WhatsApp (ej: 0424 123 4567).',
                    email_invalido: 'Revisa el correo.',
                    datos_invalidos: 'Revisa los datos del formulario.'
                };
                if (MSG[res.error]) { mostrarError(MSG[res.error]); return; }
            }
            ok = !!(res && res.ok);
            if (ok && res.id) avisarN8n(res.id);
        } catch (ex) {
            console.warn('Registro de inmobiliaria: no se pudo guardar (¿falta el SQL de la Parte 7?)', ex);
        } finally {
            enviando = false;
            if (btn && document.body.contains(btn)) { btn.disabled = false; btn.innerHTML = '<i class="fas fa-paper-plane"></i> <span>Enviar solicitud</span>'; }
        }
        pintarExito(d, ok);
    }

    function abrirRegistro(origen) {
        crearModal();
        origenRegistro = origen || 'web';
        pintarFormulario();
        modal.classList.remove('opacity-0', 'pointer-events-none');
        const p = $('registro-inmo-panel');
        if (p) p.classList.remove('translate-y-10', 'sm:translate-y-4', 'sm:scale-95');
        document.documentElement.style.overflow = 'hidden';
    }

    function cerrarRegistro() {
        if (!modal) return;
        modal.classList.add('opacity-0', 'pointer-events-none');
        const p = $('registro-inmo-panel');
        if (p) p.classList.add('translate-y-10', 'sm:translate-y-4', 'sm:scale-95');
        document.documentElement.style.overflow = '';
    }

    // ================================================================
    // 2. SECCIÓN "OFICINAS ALIADAS" (landing): muro de logos
    //    Se configura en el panel (Sitio web → Oficinas aliadas). Sin registro aquí.
    // ================================================================
    function enlaceWeb(s) {
        const t = String(s || '').trim();
        if (!t) return null;
        // "@usuario" o una palabra sin punto → Instagram
        if (/^@[\w.]{2,30}$/.test(t) || /^[\w]{2,30}$/.test(t)) return `https://instagram.com/${t.replace(/^@/, '')}`;
        const u = /^https?:\/\//i.test(t) ? t : 'https://' + t;
        try { return new URL(u).href; } catch (_) { return null; }
    }

    function iniciales(n) {
        return String(n || '').split(/\s+/).filter(w => w.length > 2 || /^[A-ZÁÉÍÓÚ]/.test(w)).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'MX';
    }

    // Cada logo lleva a la web/Instagram de la oficina o, si no tiene, a su WhatsApp
    function tarjeta(o) {
        const web = enlaceWeb(o.sitio_web);
        const wa = digitos(o.whatsapp);
        const href = web || (wa ? `https://wa.me/${wa}?text=${encodeURIComponent(`Hola ${o.nombre}, los encontré en MAXIMUS Inmobiliaria y quisiera asesoría.`)}` : null);
        const etiqueta = href ? 'a' : 'div';
        const attrs = href ? `href="${esc(href)}" target="_blank" rel="noopener nofollow" title="${esc(o.nombre)} · ${esc(o.zona)}"` : `title="${esc(o.nombre)} · ${esc(o.zona)}"`;
        const logo = o.logo_url
            ? `<img src="${esc(o.logo_url)}" alt="${esc(o.nombre)}" loading="lazy" class="max-h-16 max-w-full object-contain grayscale opacity-70 group-hover:grayscale-0 group-hover:opacity-100 transition duration-300" onerror="this.onerror=null;this.replaceWith(Object.assign(document.createElement('span'),{className:'w-14 h-14 rounded-2xl bg-gradient-to-br from-maximus-dark to-[#0E6352] text-white font-black text-lg flex items-center justify-center',textContent:'${esc(iniciales(o.nombre))}'}))">`
            : `<span class="w-14 h-14 rounded-2xl bg-gradient-to-br from-maximus-dark to-[#0E6352] text-white font-black text-lg flex items-center justify-center">${esc(iniciales(o.nombre))}</span>`;
        return `
            <${etiqueta} ${attrs} class="oficina-aliada group relative flex flex-col items-center justify-center gap-3 p-5 h-40 rounded-3xl bg-white border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 hover:border-emerald-200 transition-all duration-300 text-center">
                ${o.destacada ? '<span class="absolute top-2.5 right-2.5 w-6 h-6 rounded-full bg-amber-50 text-amber-500 flex items-center justify-center text-[10px]" title="Oficina destacada"><i class="fas fa-star"></i></span>' : ''}
                <div class="h-16 w-full flex items-center justify-center">${logo}</div>
                <div class="min-w-0 w-full">
                    <p class="text-[13px] font-bold text-gray-800 leading-tight line-clamp-2 group-hover:text-maximus-dark">${esc(o.nombre)}</p>
                    <p class="text-[11px] text-gray-400 mt-0.5 truncate">${esc(o.zona)}</p>
                </div>
            </${etiqueta}>`;
    }

    async function pintar(idContenedor) {
        const cont = $(idContenedor);
        if (!cont) return;
        let lista = [];
        try { lista = await rpc('listar_oficinas_aliadas', {}); } catch (_) { lista = []; } // sin SQL aún → la sección queda oculta
        lista = Array.isArray(lista) ? lista : [];
        const seccion = $('oficinas-aliadas');
        const enlaceMenu = $('menu-link-oficinas');
        if (!lista.length) {
            if (seccion) seccion.classList.add('hidden');
            if (enlaceMenu) enlaceMenu.classList.add('hidden');
            return;
        }
        cont.innerHTML = lista.map(tarjeta).join('');
        if (seccion) seccion.classList.remove('hidden');
        if (enlaceMenu) enlaceMenu.classList.remove('hidden');
        const contador = $('oficinas-aliadas-total');
        if (contador) contador.textContent = `${lista.length} ${lista.length === 1 ? 'inmobiliaria aliada' : 'inmobiliarias aliadas'}`;
    }

    window.abrirRegistroInmobiliaria = abrirRegistro;
    window.cerrarRegistroInmobiliaria = cerrarRegistro;
    window.OficinasAliadas = { pintar, abrirRegistro, tarjeta };

    // Enlace directo al registro (para compartir con inmobiliarias): ?registro=inmobiliaria
    document.addEventListener('DOMContentLoaded', () => {
        const q = new URLSearchParams(location.search);
        if (q.get('registro') === 'inmobiliaria' || location.hash === '#registro-inmobiliaria') setTimeout(() => abrirRegistro('enlace'), 400);
        if ($('grid-oficinas-aliadas')) pintar('grid-oficinas-aliadas');
    });
})();
