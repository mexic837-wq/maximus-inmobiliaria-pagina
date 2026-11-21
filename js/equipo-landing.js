/**
 * MAXIMUS · Sección "Nuestros asesores" de la portada.
 *
 * Muestra a todo el equipo MAXIMUS (rol asesor_maximus o admin, activos y con
 * mostrar_en_web = true) con su foto y un botón de WhatsApp.
 * Datos: RPC pública listar_equipo_maximus() (sql/migration-plan-platinum.sql).
 * Para ocultar a alguien: UPDATE usuarios SET mostrar_en_web = false WHERE email = '...';
 *
 * Si la base no responde o no hay nadie, la sección queda oculta.
 */
(function () {
    'use strict';

    const WHATSAPP_OFICINA = '584247835697';

    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    function telefonoWa(t) {
        let d = String(t || '').replace(/\D/g, '');
        if (d.startsWith('0')) d = '58' + d.slice(1);           // 0414... → 58414...
        if (d.length === 10 && d.startsWith('4')) d = '58' + d;  // 414...  → 58414...
        return d.length >= 11 ? d : '';
    }

    // Los títulos con nombre de plan o genéricos se muestran como asesor MAXIMUS
    function titulo(t) {
        const s = String(t || '').trim();
        if (!s || /^asesor$/i.test(s) || /bronce|gold|platinum|inmobiliario pro\b|externo/i.test(s)) return 'Asesor Inmobiliario MAXIMUS';
        return s;
    }

    function iniciales(nombre) {
        return String(nombre || 'M').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'M';
    }

    function tarjeta(a) {
        const nombre = String(a.nombre || '').trim();
        const primer = nombre.split(/\s+/)[0] || '';
        const tel = telefonoWa(a.whatsapp);
        const destino = tel || WHATSAPP_OFICINA;
        const msg = encodeURIComponent(tel
            ? `Hola ${primer}, vi tu perfil en la página de MAXIMUS y quiero información sobre un inmueble.`
            : `Hola, quiero hablar con ${nombre} de MAXIMUS.`);
        // Los avatares generados (ui-avatars, SVG de iniciales) no son fotos: se usan las iniciales propias
        const esFotoReal = a.avatar_url && !/ui-avatars\.com|svg\+xml/i.test(a.avatar_url);
        const foto = esFotoReal
            ?`<img src="${esc(a.avatar_url)}" alt="${esc(nombre)}" loading="lazy" class="w-full h-full object-cover" onerror="this.remove()">`
            : '';
        return `
        <article class="group relative rounded-[28px] overflow-hidden bg-white/[0.07] border border-white/15 backdrop-blur-sm shadow-2xl shadow-black/30 hover:-translate-y-2 hover:border-emerald-300/60 transition-all duration-300 flex flex-col">
            <div class="relative aspect-[4/5] bg-gradient-to-br from-emerald-500 via-emerald-700 to-[#06241E] overflow-hidden">
                <span class="absolute inset-0 flex items-center justify-center text-7xl font-black text-white/25 tracking-tighter select-none">${esc(iniciales(nombre))}</span>
                ${foto ? `<div class="absolute inset-0 transition-transform duration-700 group-hover:scale-105">${foto}</div>` : ''}
                <div class="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-[#041713] via-[#041713]/70 to-transparent"></div>
                <span class="absolute left-4 top-4 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 text-maximus-dark text-[10px] font-extrabold uppercase tracking-wider shadow">
                    <i class="fas fa-circle-check text-maximus-accent"></i> MAXIMUS
                </span>
                <div class="absolute inset-x-0 bottom-0 p-5">
                    <h3 class="text-xl font-extrabold text-white leading-tight">${esc(nombre)}</h3>
                    <p class="text-xs font-semibold text-emerald-300 mt-1">${esc(titulo(a.titulo))}</p>
                    ${a.especialidad ? `<p class="text-xs text-white/60 mt-1 line-clamp-2">${esc(a.especialidad)}</p>` : ''}
                </div>
            </div>
            <div class="p-4">
                <a href="https://wa.me/${esc(destino)}?text=${msg}" target="_blank" rel="noopener"
                   class="w-full h-12 rounded-2xl bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-[#041713] text-sm font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition"
                   aria-label="Escribir por WhatsApp a ${esc(nombre)}">
                    <i class="fab fa-whatsapp text-xl"></i> Escribir por WhatsApp
                </a>
            </div>
        </article>`;
    }

    // Cinta continua: la lista se repite hasta llenar la pantalla y se duplica la pista
    // para que el bucle no tenga saltos (igual que el carrusel de propiedades).
    function pintarCarrusel(grid, equipo) {
        const ancho = Math.max(grid.clientWidth || 0, window.innerWidth || 0, 1280);
        const porVuelta = equipo.length * (300 + 16);
        const repeticiones = Math.max(1, Math.ceil(ancho / porVuelta));
        const lista = [];
        for (let i = 0; i < repeticiones; i++) equipo.forEach(a => lista.push({ a, repetido: i > 0 }));
        const html = lista.map(({ a, repetido }) =>
            repetido ? tarjeta(a).replace('<article class="', '<article class="asesor-repetido ') : tarjeta(a)).join('');
        const dur = Math.max(30, lista.length * 9);
        grid.className = 'asesores-carrusel relative z-10';
        grid.innerHTML =
            `<div class="asesores-pista" style="--dur:${dur}s">${html}</div>` +
            `<div class="asesores-pista" aria-hidden="true" inert style="--dur:${dur}s">${html}</div>`;
    }

    async function leerEquipo() {
        const cfg = window.APP_CONFIG || {};
        const url = String(cfg.SUPABASE_URL || '').replace(/\/$/, '');
        const key = cfg.SUPABASE_ANON_KEY;
        // 1) Cliente de Supabase del sitio
        try {
            const sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
            if (sb) {
                const r = await sb.rpc('listar_equipo_maximus');
                if (!r.error && Array.isArray(r.data)) return r.data;
            }
        } catch (_) {}
        // 2) Llamada directa (por si el cliente no se inicializó)
        if (!url || !key) return [];
        try {
            const r = await fetch(url + '/rest/v1/rpc/listar_equipo_maximus', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
                body: '{}'
            });
            return r.ok ? await r.json() : [];
        } catch (_) { return []; }
    }

    async function iniciar() {
        const seccion = document.getElementById('asesores');
        const grid = document.getElementById('grid-asesores');
        if (!seccion || !grid) return;
        const equipo = (await leerEquipo()).filter(a => a && String(a.nombre || '').trim());
        if (!equipo.length) { seccion.classList.add('hidden'); return; }
        seccion.classList.remove('hidden');
        pintarCarrusel(grid, equipo);
        document.querySelectorAll('[data-enlace-asesores]').forEach(el => el.classList.remove('hidden'));
        const total = document.getElementById('asesores-total');
        if (total) total.textContent = `${equipo.length} asesor${equipo.length === 1 ? '' : 'es'} disponible${equipo.length === 1 ? '' : 's'}`;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
