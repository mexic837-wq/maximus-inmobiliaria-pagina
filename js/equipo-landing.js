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
        <article class="group bg-white rounded-3xl border border-gray-100 shadow-sm hover:shadow-xl hover:-translate-y-1 transition-all duration-300 overflow-hidden flex flex-col">
            <div class="relative aspect-[4/5] bg-gradient-to-br from-emerald-600 to-maximus-dark overflow-hidden">
                <span class="absolute inset-0 flex items-center justify-center text-5xl font-extrabold text-white/90">${esc(iniciales(nombre))}</span>
                ${foto ? `<div class="absolute inset-0">${foto}</div>` : ''}
                <div class="absolute inset-x-0 bottom-0 h-24 bg-gradient-to-t from-black/60 to-transparent"></div>
                <span class="absolute left-3 bottom-3 inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-white/95 text-maximus-dark text-[10px] font-extrabold uppercase tracking-wider">
                    <i class="fas fa-circle-check text-maximus-accent"></i> MAXIMUS
                </span>
            </div>
            <div class="p-5 flex-1 flex flex-col">
                <h3 class="text-lg font-bold text-maximus-dark leading-tight">${esc(nombre)}</h3>
                <p class="text-xs font-semibold text-gray-500 mt-1">${esc(titulo(a.titulo))}</p>
                ${a.especialidad ? `<p class="text-xs text-gray-400 mt-1 line-clamp-2">${esc(a.especialidad)}</p>` : ''}
                <a href="https://wa.me/${esc(destino)}?text=${msg}" target="_blank" rel="noopener"
                   class="mt-5 w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-bold flex items-center justify-center gap-2 transition"
                   aria-label="Escribir por WhatsApp a ${esc(nombre)}">
                    <i class="fab fa-whatsapp text-lg"></i> WhatsApp
                </a>
            </div>
        </article>`;
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
        grid.innerHTML = equipo.map(tarjeta).join('');
        seccion.classList.remove('hidden');
        document.querySelectorAll('[data-enlace-asesores]').forEach(el => el.classList.remove('hidden'));
        const total = document.getElementById('asesores-total');
        if (total) total.textContent = `${equipo.length} asesor${equipo.length === 1 ? '' : 'es'}`;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
