/**
 * MAXIMUS · Vista "Mi asesor" del cliente (Fase 2, uso interno).
 *
 * El cliente ve, en un solo lugar:
 *   - su asesor MAXIMUS (con WhatsApp),
 *   - el estado de su operación (etapa del CRM),
 *   - sus próximas visitas (agenda),
 *   - las colecciones de inmuebles que su asesor le preparó.
 *
 * El vínculo cliente ↔ asesor es el correo: el cliente aparece en el CRM (leads),
 * la agenda (citas.cliente_email) y las colecciones (colecciones_vip.email)
 * con el mismo correo de su cuenta. Los permisos de la base de datos
 * (sql/migration-fase2-cliente-asesor.sql) hacen que cada cliente solo
 * pueda leer sus propias filas.
 */
(function () {
    'use strict';

    const WHATSAPP_OFICINA = '584247835697';

    const ETAPAS = [
        { id: 'nuevo',           nombre: 'Recibimos tu solicitud' },
        { id: 'contactado',      nombre: 'Tu asesor te contactó' },
        { id: 'visita_agendada', nombre: 'Visitas' },
        { id: 'en_negociacion',  nombre: 'Negociación' },
        { id: 'en_tramite',      nombre: 'Trámites' },
        { id: 'cerrado',         nombre: 'Operación cerrada' }
    ];

    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const $ = (id) => document.getElementById(id);

    function usuarioActual() {
        try {
            if (window.AuthService && typeof AuthService.getCurrentUser === 'function') {
                const u = AuthService.getCurrentUser();
                if (u) return u;
            }
            const raw = localStorage.getItem('maximus_user') || sessionStorage.getItem('maximus_user');
            return raw ? JSON.parse(raw) : null;
        } catch (_) { return null; }
    }

    function sb() {
        try {
            if (window.APP_CONFIG && APP_CONFIG.USE_MOCK_DATA) return null;
            return typeof window.getSupabase === 'function' ? window.getSupabase() : null;
        } catch (_) { return null; }
    }

    function tabla(nombre, porDefecto) {
        return (window.APP_CONFIG && APP_CONFIG.TABLES && APP_CONFIG.TABLES[nombre]) || porDefecto;
    }

    function soloDigitos(tel) {
        let d = String(tel || '').replace(/\D/g, '');
        if (d.startsWith('0')) d = '58' + d.slice(1);
        return d;
    }

    function hoyISO() {
        const d = new Date();
        return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 10);
    }

    function fechaBonita(fecha, hora) {
        try {
            const d = new Date(fecha + 'T' + (hora || '00:00'));
            const f = d.toLocaleDateString('es-VE', { weekday: 'long', day: 'numeric', month: 'long' });
            const h = hora ? d.toLocaleTimeString('es-VE', { hour: 'numeric', minute: '2-digit' }) : '';
            return f.charAt(0).toUpperCase() + f.slice(1) + (h ? ' · ' + h : '');
        } catch (_) { return [fecha, hora].filter(Boolean).join(' '); }
    }

    function tituloInmueble(id) {
        try {
            if (typeof INMUEBLES_DETALLE_DATA !== 'undefined' && INMUEBLES_DETALLE_DATA[id]) {
                return INMUEBLES_DETALLE_DATA[id].titulo || 'Inmueble';
            }
        } catch (_) {}
        return 'Inmueble';
    }

    // ---------- Datos ----------

    async function leerLeads(email) {
        const cliente = sb();
        if (cliente) {
            try {
                const r = await cliente.from(tabla('LEADS', 'leads')).select('*')
                    .ilike('email', email).order('updated_at', { ascending: false });
                if (!r.error && Array.isArray(r.data)) return r.data;
            } catch (_) {}
        }
        // Respaldo local (modo demo / sin conexión)
        try {
            const raw = JSON.parse(localStorage.getItem('maximus_crm_leads') || '[]');
            return raw.filter(l => String(l.email || '').toLowerCase() === email);
        } catch (_) { return []; }
    }

    async function leerCitas(email) {
        const cliente = sb();
        if (!cliente) return [];
        try {
            const r = await cliente.from(tabla('CITAS', 'citas')).select('*')
                .ilike('cliente_email', email).gte('fecha', hoyISO())
                .order('fecha', { ascending: true }).order('hora', { ascending: true }).limit(10);
            return (!r.error && Array.isArray(r.data)) ? r.data.filter(c => c.estado !== 'cancelada') : [];
        } catch (_) { return []; }
    }

    async function leerColecciones(email) {
        const cliente = sb();
        if (!cliente) return [];
        try {
            const r = await cliente.from(tabla('COLECCIONES_VIP', 'colecciones_vip')).select('*')
                .ilike('email', email).order('created_at', { ascending: false }).limit(10);
            return (!r.error && Array.isArray(r.data)) ? r.data : [];
        } catch (_) { return []; }
    }

    async function leerAsesor(lead) {
        const base = {
            nombre: lead && lead.asesor_nombre ? lead.asesor_nombre : 'Equipo MAXIMUS',
            telefono: '', avatar: '', titulo: 'Asesor MAXIMUS'
        };
        const id = lead && (lead.asesor_id || lead.agente_id);
        const cliente = sb();
        if (!id || !cliente) return base;
        // 1) Función segura del SQL de la Fase 2 (solo devuelve datos de contacto del asesor)
        try {
            const r = await cliente.rpc('mi_asesor_cliente');
            const d = r && !r.error ? (Array.isArray(r.data) ? r.data[0] : r.data) : null;
            if (d && d.nombre) {
                return { nombre: d.nombre, telefono: d.telefono || '', avatar: d.avatar_url || '', titulo: d.titulo || base.titulo };
            }
        } catch (_) {}
        // 2) Respaldo mientras el SQL no esté aplicado
        try {
            const r = await cliente.from(tabla('USUARIOS', 'usuarios'))
                .select('nombre_completo, telefono, avatar_url, titulo').eq('id', id).maybeSingle();
            if (!r.error && r.data) {
                return {
                    nombre: r.data.nombre_completo || base.nombre,
                    telefono: r.data.telefono || '',
                    avatar: r.data.avatar_url || '',
                    titulo: r.data.titulo || base.titulo
                };
            }
        } catch (_) {}
        return base;
    }

    // ---------- Pintar ----------

    function pintarAsesor(asesor, lead) {
        const el = $('mi-asesor-card');
        if (!el) return;
        const tel = soloDigitos(asesor.telefono) || WHATSAPP_OFICINA;
        const texto = encodeURIComponent('Hola ' + asesor.nombre.split(' ')[0] + ', te escribo desde el portal de MAXIMUS.');
        const iniciales = asesor.nombre.split(/\s+/).slice(0, 2).map(p => p.charAt(0)).join('').toUpperCase();
        const foto = asesor.avatar
            ? `<img src="${esc(asesor.avatar)}" alt="" class="w-16 h-16 rounded-2xl object-cover">`
            : `<div class="w-16 h-16 rounded-2xl bg-gradient-to-br from-emerald-500 to-maximus-dark text-white flex items-center justify-center text-xl font-extrabold">${esc(iniciales)}</div>`;
        el.innerHTML = `
            <div class="flex items-center gap-4">
                ${foto}
                <div class="min-w-0 flex-1">
                    <p class="text-[11px] font-bold uppercase tracking-wider text-emerald-700 dark:text-emerald-400">${lead ? 'Tu asesor' : 'Te atiende'}</p>
                    <p class="text-lg font-extrabold text-maximus-dark dark:text-white truncate">${esc(asesor.nombre)}</p>
                    <p class="text-xs text-gray-500 dark:text-gray-400 truncate">${esc(asesor.titulo)}</p>
                </div>
            </div>
            <a href="https://wa.me/${esc(tel)}?text=${texto}" target="_blank" rel="noopener"
               class="mt-4 w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 transition">
                <i class="ph-fill ph-whatsapp-logo text-lg"></i> Escribir por WhatsApp
            </a>`;
    }

    function pintarEstado(lead) {
        const el = $('mi-asesor-estado');
        if (!el) return;
        if (!lead) {
            el.innerHTML = `<p class="text-sm text-gray-500 dark:text-gray-400">Todavía no tienes una operación abierta. Cuando tu asesor te registre, verás aquí cada paso.</p>`;
            return;
        }
        if (lead.estatus === 'descartado') {
            el.innerHTML = `<p class="text-sm text-gray-500 dark:text-gray-400">Esta búsqueda está en pausa. Escríbele a tu asesor cuando quieras retomarla.</p>`;
            return;
        }
        const idx = Math.max(0, ETAPAS.findIndex(e => e.id === lead.estatus));
        const interes = lead.inmueble_interes_titulo
            ? `<p class="text-xs text-gray-500 dark:text-gray-400 mb-3">Interés: <strong class="text-maximus-dark dark:text-white">${esc(lead.inmueble_interes_titulo)}</strong></p>` : '';
        el.innerHTML = interes + `<ol class="space-y-2.5">` + ETAPAS.map((e, i) => {
            const hecho = i < idx, actual = i === idx;
            const punto = hecho
                ? '<span class="w-6 h-6 rounded-full bg-emerald-500 text-white flex items-center justify-center"><i class="ph-bold ph-check text-xs"></i></span>'
                : actual
                    ? '<span class="w-6 h-6 rounded-full border-2 border-emerald-500 bg-emerald-50 dark:bg-emerald-950 flex items-center justify-center"><span class="w-2 h-2 rounded-full bg-emerald-500"></span></span>'
                    : '<span class="w-6 h-6 rounded-full border-2 border-gray-200 dark:border-gray-700"></span>';
            const clase = actual ? 'font-bold text-maximus-dark dark:text-white' : (hecho ? 'text-gray-700 dark:text-gray-300' : 'text-gray-400');
            return `<li class="flex items-center gap-3 text-sm ${clase}">${punto}<span>${esc(e.nombre)}</span>${actual ? '<span class="ml-auto text-[10px] font-bold uppercase text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full">Ahora</span>' : ''}</li>`;
        }).join('') + `</ol>`;
    }

    function pintarCitas(citas) {
        const el = $('mi-asesor-citas');
        if (!el) return;
        if (!citas.length) {
            el.innerHTML = `<p class="text-sm text-gray-500 dark:text-gray-400">No tienes visitas próximas. Pídele a tu asesor que agende una.</p>`;
            return;
        }
        el.innerHTML = citas.map(c => `
            <div class="flex items-start gap-3 p-3 rounded-xl bg-gray-50 dark:bg-[#0D2822]">
                <span class="w-9 h-9 rounded-lg bg-emerald-100 dark:bg-emerald-950 text-emerald-700 dark:text-emerald-300 flex items-center justify-center flex-shrink-0"><i class="ph-fill ph-calendar-check"></i></span>
                <div class="min-w-0">
                    <p class="text-sm font-bold text-maximus-dark dark:text-white">${esc(fechaBonita(c.fecha, String(c.hora || '').slice(0, 5)))}</p>
                    <p class="text-xs text-gray-600 dark:text-gray-300 truncate">${esc(c.inmueble_titulo || c.titulo || 'Visita')}</p>
                    ${c.ubicacion ? `<p class="text-[11px] text-gray-400 truncate"><i class="ph ph-map-pin"></i> ${esc(c.ubicacion)}</p>` : ''}
                </div>
            </div>`).join('');
    }

    function pintarColecciones(cols) {
        const el = $('mi-asesor-colecciones');
        if (!el) return;
        if (!cols.length) {
            el.innerHTML = `<p class="text-sm text-gray-500 dark:text-gray-400">Cuando tu asesor te prepare una selección de inmuebles, aparecerá aquí.</p>`;
            return;
        }
        el.innerHTML = cols.map(c => {
            const ids = Array.isArray(c.inmuebles) ? c.inmuebles : [];
            const chips = ids.slice(0, 8).map(id => tituloInmueble(id) === 'Inmueble' ? '' : `
                <button type="button" data-inmueble="${esc(id)}" class="mi-asesor-inm text-left text-xs font-semibold px-3 py-2 rounded-lg bg-white dark:bg-[#0A1F1B] border border-gray-200 dark:border-emerald-950 hover:border-emerald-400 transition truncate max-w-full">
                    <i class="ph ph-house-line text-emerald-600"></i> ${esc(tituloInmueble(id))}
                </button>`).join('');
            return `
            <div class="p-4 rounded-xl bg-gray-50 dark:bg-[#0D2822]">
                <p class="text-sm font-extrabold text-maximus-dark dark:text-white">${esc(c.titulo || 'Selección de inmuebles')}</p>
                <p class="text-[11px] text-gray-400 mb-2">${esc([c.asesor_nombre, c.fecha || c.fecha_str].filter(Boolean).join(' · '))} · ${ids.length} inmueble${ids.length === 1 ? '' : 's'}</p>
                ${c.nota ? `<p class="text-xs text-gray-600 dark:text-gray-300 mb-3 leading-relaxed">${esc(c.nota)}</p>` : ''}
                <div class="flex flex-wrap gap-2">${chips || '<p class="text-xs text-gray-400">Tu asesor te enviará los detalles por WhatsApp.</p>'}</div>
            </div>`;
        }).join('');
        el.querySelectorAll('.mi-asesor-inm').forEach(b => b.addEventListener('click', () => {
            if (typeof abrirDetalleInmuebleAirbnb === 'function') {
                abrirDetalleInmuebleAirbnb(b.getAttribute('data-inmueble'), 'view-mi-asesor');
            }
        }));
    }

    let cargando = false;
    async function cargar() {
        if (cargando) return;
        cargando = true;
        try {
            const u = usuarioActual();
            const email = String((u && u.email) || '').toLowerCase().trim();
            const saludo = $('mi-asesor-saludo');
            if (saludo) {
                const nombre = String((u && (u.nombre || u.nombre_completo || u.name)) || '').split(' ')[0];
                saludo.textContent = nombre ? `Hola, ${nombre}` : 'Mi asesor';
            }
            if (!email) return;
            const [leads, citas, cols] = await Promise.all([leerLeads(email), leerCitas(email), leerColecciones(email)]);
            const lead = leads.find(l => l.estatus !== 'descartado') || leads[0] || null;
            pintarAsesor(await leerAsesor(lead), lead);
            pintarEstado(lead);
            pintarCitas(citas);
            pintarColecciones(cols);
        } finally {
            cargando = false;
        }
    }

    window.MiAsesor = { cargar };
})();
