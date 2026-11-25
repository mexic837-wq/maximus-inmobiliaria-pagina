/**
 * MAXIMUS · Vista "Mis colecciones" del cliente.
 *
 * El cliente ve las selecciones de inmuebles que su asesor le preparó (las que llevan su
 * correo; la base de datos solo deja leer las propias) y las abre en /coleccion, la misma
 * página que se comparte por enlace o QR, donde marca «Me interesa» / «No me interesa».
 */
(function () {
    'use strict';

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

    async function leer(email) {
        const cliente = sb();
        if (!cliente) return { data: [], error: { message: 'Sin conexión con la base de datos' } };
        const tabla = (window.APP_CONFIG && APP_CONFIG.TABLES && APP_CONFIG.TABLES.COLECCIONES_VIP) || 'colecciones_vip';
        try {
            const r = await cliente.from(tabla).select('*').ilike('email', email).order('created_at', { ascending: false });
            if (r.error) return { data: [], error: r.error };
            return { data: Array.isArray(r.data) ? r.data : [], error: null };
        } catch (e) { return { data: [], error: e }; }
    }

    function fotosDe(c) {
        const det = Array.isArray(c.inmuebles_detalle) ? c.inmuebles_detalle : [];
        const fotos = det.map(p => p && p.foto).filter(Boolean);
        if (fotos.length) return fotos.slice(0, 3);
        const ids = Array.isArray(c.inmuebles) ? c.inmuebles : [];
        try {
            if (typeof INMUEBLES_DETALLE_DATA !== 'undefined') {
                return ids.map(id => INMUEBLES_DETALLE_DATA[id] && INMUEBLES_DETALLE_DATA[id].fotos && INMUEBLES_DETALLE_DATA[id].fotos[0]).filter(Boolean).slice(0, 3);
            }
        } catch (_) {}
        return [];
    }

    function resumenReacciones(c) {
        const r = c.reacciones && typeof c.reacciones === 'object' ? Object.values(c.reacciones) : [];
        const si = r.filter(x => x && x.r === 'me_interesa').length;
        const no = r.filter(x => x && x.r === 'no_me_interesa').length;
        if (!si && !no) return '';
        return `<span class="inline-flex items-center gap-2 text-[11px] font-bold">
            ${si ? `<span class="text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full">♥ ${si} te interesa${si === 1 ? '' : 'n'}</span>` : ''}
            ${no ? `<span class="text-gray-500 bg-gray-100 dark:bg-[#0D2822] px-2 py-0.5 rounded-full">${no} descartado${no === 1 ? '' : 's'}</span>` : ''}
        </span>`;
    }

    function pintar(cols, error) {
        const el = $('mis-colecciones-lista');
        if (!el) return;
        if (error) {
            el.innerHTML = `<div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm"><i class="ph-fill ph-warning"></i> No pudimos cargar tus colecciones en este momento. Intenta de nuevo en unos minutos.</div>`;
            return;
        }
        if (!cols.length) {
            el.innerHTML = `
                <div class="bg-white dark:bg-[#0A1F1B] rounded-2xl border border-gray-200/70 dark:border-emerald-950/60 shadow-sm p-8 text-center">
                    <div class="w-14 h-14 mx-auto rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-600 flex items-center justify-center text-3xl"><i class="ph-fill ph-folder-star"></i></div>
                    <h2 class="mt-3 text-base font-extrabold text-maximus-dark dark:text-white">Aún no tienes selecciones</h2>
                    <p class="mt-1 text-sm text-gray-500 dark:text-gray-400">Cuando tu asesor te prepare una selección de inmuebles, aparecerá aquí y también te llegará por WhatsApp.</p>
                </div>`;
            return;
        }
        const hace14 = Date.now() - 14 * 86400000;
        el.innerHTML = cols.map(c => {
            const ids = Array.isArray(c.inmuebles) ? c.inmuebles : [];
            const fotos = fotosDe(c);
            const nueva = !c.reacciones || !Object.keys(c.reacciones).length ? (new Date(c.created_at || 0).getTime() > hace14) : false;
            const url = c.token ? `/coleccion?c=${encodeURIComponent(c.id)}&t=${encodeURIComponent(c.token)}` : '';
            const asesor = c.asesor_nombre || c.asesor || 'Tu asesor';
            return `
            <article class="bg-white dark:bg-[#0A1F1B] rounded-2xl border border-gray-200/70 dark:border-emerald-950/60 shadow-sm overflow-hidden">
                ${fotos.length ? `<div class="grid gap-0.5" style="grid-template-columns: repeat(${fotos.length}, 1fr)">${fotos.map(f => `<img src="${esc(f)}" alt="" loading="lazy" class="w-full h-28 sm:h-32 object-cover" onerror="this.style.display='none'">`).join('')}</div>` : ''}
                <div class="p-4 sm:p-5">
                    <div class="flex items-start justify-between gap-3">
                        <div class="min-w-0">
                            <h2 class="text-base font-extrabold text-maximus-dark dark:text-white leading-snug">${esc(c.titulo || 'Selección de inmuebles')}</h2>
                            <p class="text-[11px] text-gray-400 mt-0.5">${esc([asesor, c.fecha || c.fecha_str].filter(Boolean).join(' · '))} · ${ids.length} inmueble${ids.length === 1 ? '' : 's'}</p>
                        </div>
                        ${nueva ? '<span class="shrink-0 text-[10px] font-extrabold uppercase tracking-wider text-emerald-700 bg-emerald-50 dark:bg-emerald-950 dark:text-emerald-300 px-2 py-0.5 rounded-full">Nueva</span>' : ''}
                    </div>
                    ${c.nota ? `<p class="mt-2 text-xs text-gray-600 dark:text-gray-300 leading-relaxed italic line-clamp-3">“${esc(c.nota)}”</p>` : ''}
                    <div class="mt-3 flex flex-wrap items-center justify-between gap-2">
                        ${resumenReacciones(c) || '<span class="text-[11px] text-gray-400">Sin respuesta todavía</span>'}
                        ${url
                            ? `<a href="${esc(url)}" class="h-10 px-4 rounded-xl bg-maximus-dark hover:bg-[#07362e] text-white text-xs font-bold inline-flex items-center gap-1.5 transition"><i class="ph-bold ph-folder-open"></i> Abrir selección</a>`
                            : '<span class="text-[11px] text-gray-400">Pídele a tu asesor el enlace de esta selección.</span>'}
                    </div>
                </div>
            </article>`;
        }).join('');
    }

    let cargando = false;
    async function cargar() {
        if (cargando) return;
        cargando = true;
        try {
            const u = usuarioActual();
            const email = String((u && u.email) || '').toLowerCase().trim();
            if (!email) return;
            const { data, error } = await leer(email);
            pintar(data, error);
        } finally {
            cargando = false;
        }
    }

    window.ColeccionesCliente = { cargar };
})();
