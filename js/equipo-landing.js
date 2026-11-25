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
        <article class="group relative rounded-3xl overflow-hidden bg-white/[0.07] border border-white/15 backdrop-blur-sm shadow-xl shadow-black/25 hover:-translate-y-1.5 hover:border-emerald-300/60 hover:shadow-emerald-900/40 transition-all duration-300 flex flex-col">
            <div class="relative aspect-square bg-gradient-to-br from-emerald-500 via-emerald-700 to-[#06241E] overflow-hidden">
                <span class="absolute inset-0 flex items-center justify-center pb-10 text-6xl font-black text-white/25 tracking-tighter select-none">${esc(iniciales(nombre))}</span>
                ${foto ? `<div class="absolute inset-0 transition-transform duration-700 group-hover:scale-105">${foto}</div>` : ''}
                <div class="absolute inset-x-0 bottom-0 h-1/2 bg-gradient-to-t from-[#041713] via-[#041713]/60 to-transparent"></div>
                <span class="absolute left-3 top-3 inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-white/95 text-maximus-dark text-[9px] font-extrabold uppercase tracking-wider shadow">
                    <i class="fas fa-circle-check text-maximus-accent"></i> MAXIMUS
                </span>
                <div class="absolute inset-x-0 bottom-0 px-4 pb-3">
                    <h3 class="text-lg font-extrabold text-white leading-tight truncate">${esc(nombre)}</h3>
                    <p class="text-[11px] font-semibold text-emerald-300 mt-0.5 truncate">${esc(titulo(a.titulo))}</p>
                </div>
            </div>
            <div class="p-3">
                <a href="https://wa.me/${esc(destino)}?text=${msg}" target="_blank" rel="noopener"
                   class="relative overflow-hidden w-full h-11 rounded-2xl bg-gradient-to-r from-emerald-400 to-emerald-500 hover:from-emerald-300 hover:to-emerald-400 text-[#041713] text-[13px] font-extrabold flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/25 transition"
                   aria-label="Escribir por WhatsApp a ${esc(nombre)}">
                    <span class="asesor-wa-brillo absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none"></span>
                    <i class="fab fa-whatsapp text-lg relative"></i> <span class="relative">WhatsApp</span>
                </a>
            </div>
        </article>`;
    }

    // El broker (dirección de la inmobiliaria) se presenta aparte, arriba del carrusel.
    const RE_BROKER = /broker|director|administrador|direcci[oó]n|\bceo\b|fundador/i;
    const esBroker = (a) => RE_BROKER.test(String(a.titulo || ''));

    function fotoReal(a) {
        return a.avatar_url && !/ui-avatars\.com|svg\+xml/i.test(a.avatar_url) ? a.avatar_url : '';
    }

    function enlaceWa(a, texto) {
        const nombre = String(a.nombre || '').trim();
        const tel = telefonoWa(a.whatsapp);
        return `https://wa.me/${tel || WHATSAPP_OFICINA}?text=${encodeURIComponent(tel ? texto : `Hola, quiero hablar con ${nombre} de MAXIMUS.`)}`;
    }

    function tarjetaBroker(a) {
        const nombre = String(a.nombre || '').trim();
        const primer = nombre.split(/\s+/)[0] || '';
        const foto = fotoReal(a);
        const wa = enlaceWa(a, `Hola ${primer}, vi tu perfil en la página de MAXIMUS y quiero asesoría para comprar, vender o invertir en un inmueble.`);
        return `
        <article class="broker-card" aria-label="Broker de MAXIMUS: ${esc(nombre)}">
            <div class="broker-marco">
                <div class="broker-foto">
                    <span class="broker-ini">${esc(iniciales(nombre))}</span>
                    ${foto ? `<img src="${esc(foto)}" alt="${esc(nombre)}, Broker de MAXIMUS Inmobiliaria" loading="lazy" class="relative" onerror="this.remove()">` : ''}
                </div>
            </div>
            <div class="broker-info relative">
                <span class="broker-insignia broker-paso" style="--p:0"><i class="fas fa-crown"></i> Broker</span>
                <h3 class="broker-nombre broker-paso" style="--p:1">${esc(nombre)}</h3>
                <p class="broker-cargo broker-paso" style="--p:2">Director General · MAXIMUS Inmobiliaria</p>
                <div class="broker-linea"></div>
                <p class="broker-texto broker-paso" style="--p:3">Dirige el equipo MAXIMUS y acompaña a cada cliente en la compra, venta e inversión de su inmueble, con respaldo legal de principio a fin.</p>
                <a href="${esc(wa)}" target="_blank" rel="noopener" class="broker-wa broker-paso" style="--p:4" aria-label="Escribir por WhatsApp a ${esc(nombre)}">
                    <span class="asesor-wa-brillo absolute inset-y-0 left-0 w-1/3 bg-gradient-to-r from-transparent via-white/50 to-transparent pointer-events-none"></span>
                    <i class="fab fa-whatsapp relative"></i><span class="relative">Hablar con ${esc(primer)}</span>
                </a>
            </div>
        </article>`;
    }

    function pintarBroker(cont, a) {
        cont.innerHTML = tarjetaBroker(a);
        const card = cont.querySelector('.broker-card');
        const quieto = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (quieto || !('IntersectionObserver' in window)) { card.classList.add('broker-visible'); }
        else {
            const io = new IntersectionObserver((e) => {
                if (e.some(x => x.isIntersecting)) { card.classList.add('broker-visible'); io.disconnect(); }
            }, { threshold: 0.25 });
            io.observe(card);
        }
        // Inclinación 3D suave de la foto al mover el cursor (solo con mouse)
        const marco = card.querySelector('.broker-marco');
        const foto = card.querySelector('.broker-foto');
        if (quieto || !marco || !(window.matchMedia && window.matchMedia('(pointer: fine)').matches)) return;
        marco.addEventListener('pointermove', (ev) => {
            const r = marco.getBoundingClientRect();
            const x = (ev.clientX - r.left) / r.width - 0.5, y = (ev.clientY - r.top) / r.height - 0.5;
            foto.style.setProperty('--ry', (x * 10).toFixed(2) + 'deg');
            foto.style.setProperty('--rx', (-y * 10).toFixed(2) + 'deg');
        });
        marco.addEventListener('pointerleave', () => { foto.style.setProperty('--rx', '0deg'); foto.style.setProperty('--ry', '0deg'); });
    }

    // Cinta continua: la lista se repite hasta llenar la pantalla y se duplica la pista
    // para que el bucle no tenga saltos (igual que el carrusel de propiedades).
    function pintarCarrusel(grid, equipo) {
        const ancho = Math.max(grid.clientWidth || 0, window.innerWidth || 0, 1280);
        const porVuelta = equipo.length * (250 + 16);
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

        // Entrada en cascada cuando la sección aparece en pantalla (solo la primera vez)
        grid.querySelectorAll('.asesores-pista').forEach(p =>
            p.querySelectorAll('article').forEach((art, i) => art.style.setProperty('--i', Math.min(i, 7))));
        if (!('IntersectionObserver' in window)) { grid.classList.add('asesores-entrando'); return; }
        const io = new IntersectionObserver((entradas) => {
            if (entradas.some(e => e.isIntersecting)) { grid.classList.add('asesores-entrando'); io.disconnect(); }
        }, { threshold: 0.2 });
        io.observe(grid);
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
        // El primer broker va destacado arriba; el resto del equipo, en el carrusel
        const broker = equipo.find(esBroker);
        const resto = equipo.filter(a => a !== broker);
        const contBroker = document.getElementById('asesor-broker');
        if (broker && contBroker) pintarBroker(contBroker, broker);
        const usaBroker = !!(broker && contBroker);
        const lista = usaBroker ? resto : equipo;
        const sub = document.getElementById('equipo-subtitulo');
        if (sub) sub.classList.toggle('hidden', !(usaBroker && lista.length));
        if (lista.length) pintarCarrusel(grid, lista);
        else grid.classList.add('hidden');
        document.querySelectorAll('[data-enlace-asesores]').forEach(el => el.classList.remove('hidden'));
        const total = document.getElementById('asesores-total');
        if (total) total.textContent = `${equipo.length} asesor${equipo.length === 1 ? '' : 'es'} disponible${equipo.length === 1 ? '' : 's'}`;
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
