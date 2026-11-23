/**
 * ====================================================================
 * MAXIMUS INMOBILIARIA - Panel admin: Oficinas aliadas
 * ====================================================================
 * Vista del panel: Sitio web → Oficinas aliadas (#view-admin-oficinas)
 *  · Ver solicitudes que llegan desde "¿Inmobiliaria? Regístrate aquí" y aprobarlas o rechazarlas.
 *  · Crear oficinas a mano, subir su logo, editar datos.
 *  · Publicar / ocultar, destacar y ordenar lo que sale en la landing.
 *
 * Datos: tabla public.oficinas_aliadas (Parte 7 del SQL). Solo el rol admin puede
 * leerla y modificarla (RLS). Logos: bucket público inmuebles-fotos/oficinas-aliadas/.
 */
(function () {
    'use strict';

    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const $ = (id) => document.getElementById(id);
    const BUCKET = 'inmuebles-fotos';
    const CARPETA = 'oficinas-aliadas';

    let lista = [];
    let filtro = 'todas';
    let editando = null;       // oficina en edición (null = nueva)
    let logoArchivo = null;    // archivo elegido para subir

    const ESTADOS = {
        aprobada:  { texto: 'Publicada',  clase: 'bg-emerald-50 text-emerald-700 border-emerald-200', icono: 'ph-eye' },
        pendiente: { texto: 'Por revisar', clase: 'bg-amber-50 text-amber-700 border-amber-200',     icono: 'ph-clock' },
        oculta:    { texto: 'Oculta',     clase: 'bg-gray-100 text-gray-600 border-gray-200',        icono: 'ph-eye-slash' },
        rechazada: { texto: 'Rechazada',  clase: 'bg-red-50 text-red-600 border-red-200',            icono: 'ph-x-circle' }
    };

    function sb() {
        const c = (typeof getSupabase === 'function') ? getSupabase() : null;
        if (!c) throw new Error('Supabase no está disponible.');
        return c;
    }

    function aviso(msg) {
        if (typeof mostrarToastNotificacion === 'function') mostrarToastNotificacion(msg);
        else console.log(msg);
    }

    const iniciales = (n) => String(n || '').split(/\s+/).filter(Boolean).slice(0, 2).map(w => w[0]).join('').toUpperCase() || 'MX';
    const logoHTML = (o, tam) => o.logo_url
        ? `<img src="${esc(o.logo_url)}" alt="${esc(o.nombre)}" class="w-full h-full object-contain p-1.5 bg-white" onerror="this.onerror=null;this.remove();">`
        : `<span class="${tam === 'xl' ? 'text-2xl' : 'text-base'} font-black text-white">${esc(iniciales(o.nombre))}</span>`;

    // ---------------- Carga ----------------
    async function cargar() {
        const cont = $('admin-oficinas-lista');
        if (cont) cont.innerHTML = '<div class="col-span-full py-16 text-center text-sm text-gray-400"><i class="ph-bold ph-spinner ph-spin text-2xl"></i><p class="mt-2">Cargando oficinas…</p></div>';
        try {
            const { data, error } = await sb().from('oficinas_aliadas').select('*')
                .order('destacada', { ascending: false }).order('orden', { ascending: true }).order('created_at', { ascending: false });
            if (error) throw error;
            lista = data || [];
            pintar();
        } catch (e) {
            console.warn('Oficinas aliadas (admin):', e);
            lista = [];
            if (cont) cont.innerHTML = `
                <div class="col-span-full p-6 rounded-2xl border border-amber-200 bg-amber-50 text-amber-800 text-sm">
                    <p class="font-bold flex items-center gap-2"><i class="ph-fill ph-warning"></i> No se pudo cargar la lista de oficinas.</p>
                    <p class="mt-1">Si todavía no se ejecutó el SQL pendiente, falta la <strong>Parte 7</strong> (tabla <code>oficinas_aliadas</code>). También puede ser que tu usuario no sea administrador.</p>
                </div>`;
            pintarKpis();
        }
    }

    // ---------------- Pintado ----------------
    function pintarKpis() {
        const n = (e) => lista.filter(o => o.estado === e).length;
        const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
        set('kpi-oficinas-publicadas', n('aprobada'));
        set('kpi-oficinas-pendientes', n('pendiente'));
        set('kpi-oficinas-ocultas', n('oculta') + n('rechazada'));
        set('kpi-oficinas-total', lista.length);
        const badge = $('badge-oficinas-pendientes');
        if (badge) { badge.textContent = n('pendiente'); badge.classList.toggle('hidden', !n('pendiente')); }
        document.querySelectorAll('[data-filtro-oficinas]').forEach(b => {
            const activo = b.dataset.filtroOficinas === filtro;
            b.className = 'h-9 px-4 rounded-full text-xs font-bold transition cursor-pointer ' + (activo
                ? 'bg-maximus-dark text-white shadow-sm'
                : 'bg-white text-gray-600 border border-gray-200 hover:border-maximus-accent hover:text-maximus-dark');
        });
    }

    function tarjeta(o) {
        const est = ESTADOS[o.estado] || ESTADOS.oculta;
        const id = esc(o.id);
        const acciones = o.estado === 'pendiente'
            ? `<button type="button" onclick="OficinasAdmin.cambiarEstado('${id}','aprobada')" class="flex-1 h-9 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"><i class="ph-bold ph-check"></i> Aprobar</button>
               <button type="button" onclick="OficinasAdmin.cambiarEstado('${id}','rechazada')" class="h-9 px-3 rounded-xl bg-red-50 hover:bg-red-100 text-red-600 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"><i class="ph-bold ph-x"></i> Rechazar</button>`
            : `<button type="button" onclick="OficinasAdmin.cambiarEstado('${id}','${o.estado === 'aprobada' ? 'oculta' : 'aprobada'}')" class="flex-1 h-9 rounded-xl ${o.estado === 'aprobada' ? 'bg-gray-100 hover:bg-gray-200 text-gray-700' : 'bg-emerald-600 hover:bg-emerald-700 text-white'} text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"><i class="ph-bold ${o.estado === 'aprobada' ? 'ph-eye-slash' : 'ph-eye'}"></i> ${o.estado === 'aprobada' ? 'Ocultar' : 'Publicar'}</button>`;
        return `
            <article class="relative flex flex-col gap-3.5 p-4 rounded-2xl bg-white dark:bg-[#0A1F1B] border ${o.estado === 'pendiente' ? 'border-amber-300 ring-2 ring-amber-100' : 'border-gray-100 dark:border-emerald-950/60'} shadow-sm">
                <div class="flex items-start gap-3">
                    <div class="w-16 h-16 shrink-0 rounded-2xl bg-gradient-to-br from-maximus-dark to-[#0E6352] flex items-center justify-center overflow-hidden border border-gray-100">${logoHTML(o)}</div>
                    <div class="min-w-0 flex-1">
                        <h4 class="font-extrabold text-gray-900 dark:text-white leading-tight line-clamp-2">${esc(o.nombre)}</h4>
                        <p class="text-xs text-gray-500 mt-0.5 flex items-center gap-1"><i class="ph-fill ph-map-pin text-maximus-accent"></i>${esc(o.zona || '—')}</p>
                        <div class="mt-1.5 flex flex-wrap items-center gap-1">
                            <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border text-[10px] font-bold ${est.clase}"><i class="ph-bold ${est.icono}"></i>${est.texto}</span>
                            ${o.destacada ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-amber-200 bg-amber-50 text-amber-700 text-[10px] font-bold"><i class="ph-fill ph-star"></i>Destacada</span>' : ''}
                            ${!o.logo_url ? '<span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full border border-gray-200 bg-gray-50 text-gray-500 text-[10px] font-bold"><i class="ph-bold ph-image"></i>Sin logo</span>' : ''}
                        </div>
                    </div>
                    <span class="shrink-0 text-[10px] font-bold text-gray-400" title="Orden en la landing">#${Number(o.orden ?? 100)}</span>
                </div>
                <div class="text-[11px] text-gray-500 space-y-0.5">
                    ${o.responsable ? `<p><i class="ph ph-user"></i> ${esc(o.responsable)}</p>` : ''}
                    ${o.whatsapp ? `<p><i class="ph ph-whatsapp-logo"></i> <a href="https://wa.me/${esc(o.whatsapp)}" target="_blank" rel="noopener" class="hover:text-emerald-700 hover:underline">+${esc(o.whatsapp)}</a></p>` : ''}
                    ${o.email ? `<p class="truncate"><i class="ph ph-envelope"></i> ${esc(o.email)}</p>` : ''}
                    ${o.sitio_web ? `<p class="truncate"><i class="ph ph-globe"></i> ${esc(o.sitio_web)}</p>` : ''}
                </div>
                <div class="mt-auto flex items-center gap-1.5">
                    ${acciones}
                    <button type="button" onclick="OficinasAdmin.alternarDestacada('${id}')" title="${o.destacada ? 'Quitar de destacadas' : 'Destacar (sale primero)'}" class="w-9 h-9 rounded-xl ${o.destacada ? 'bg-amber-100 text-amber-600' : 'bg-gray-50 text-gray-400 hover:text-amber-500'} flex items-center justify-center cursor-pointer"><i class="ph-fill ph-star"></i></button>
                    <button type="button" onclick="OficinasAdmin.editar('${id}')" title="Editar y subir logo" class="w-9 h-9 rounded-xl bg-gray-50 hover:bg-gray-100 text-gray-600 flex items-center justify-center cursor-pointer"><i class="ph-bold ph-pencil-simple"></i></button>
                    <button type="button" onclick="OficinasAdmin.eliminar('${id}')" title="Eliminar" class="w-9 h-9 rounded-xl bg-gray-50 hover:bg-red-50 text-gray-400 hover:text-red-600 flex items-center justify-center cursor-pointer"><i class="ph-bold ph-trash"></i></button>
                </div>
            </article>`;
    }

    function pintar() {
        pintarKpis();
        const cont = $('admin-oficinas-lista');
        if (!cont) return;
        const q = (($('buscador-oficinas') || {}).value || '').toLowerCase().trim();
        let vis = lista.filter(o => {
            if (filtro === 'publicadas' && o.estado !== 'aprobada') return false;
            if (filtro === 'pendientes' && o.estado !== 'pendiente') return false;
            if (filtro === 'ocultas' && !['oculta', 'rechazada'].includes(o.estado)) return false;
            return !q || `${o.nombre} ${o.zona} ${o.responsable || ''}`.toLowerCase().includes(q);
        });
        // Las pendientes siempre arriba
        vis = vis.sort((a, b) => (b.estado === 'pendiente') - (a.estado === 'pendiente'));
        cont.innerHTML = vis.length ? vis.map(tarjeta).join('') : `
            <div class="col-span-full py-14 text-center">
                <div class="w-14 h-14 mx-auto rounded-2xl bg-gray-100 text-gray-400 flex items-center justify-center text-2xl"><i class="ph-bold ph-buildings"></i></div>
                <p class="mt-3 text-sm font-bold text-gray-700">${lista.length ? 'Ninguna oficina coincide con el filtro.' : 'Todavía no hay oficinas aliadas.'}</p>
                <p class="text-xs text-gray-500 mt-1">${lista.length ? 'Prueba con otro filtro o búsqueda.' : 'Agrega la primera con su logo y aparecerá en la página de inicio.'}</p>
            </div>`;
    }

    // ---------------- Acciones ----------------
    async function actualizar(id, cambios, ok) {
        try {
            const { error } = await sb().from('oficinas_aliadas').update(cambios).eq('id', id);
            if (error) throw error;
            const o = lista.find(x => x.id === id);
            if (o) Object.assign(o, cambios);
            pintar();
            if (ok) aviso(ok);
        } catch (e) {
            console.warn(e);
            aviso('No se pudo guardar el cambio. Revisa tu conexión o permisos.');
        }
    }

    function cambiarEstado(id, estado) {
        const cambios = { estado };
        if (estado === 'aprobada') cambios.aprobada_at = new Date().toISOString();
        const textos = { aprobada: 'Oficina publicada en la página de inicio', oculta: 'Oficina oculta de la página de inicio', rechazada: 'Solicitud rechazada' };
        return actualizar(id, cambios, textos[estado]);
    }

    function alternarDestacada(id) {
        const o = lista.find(x => x.id === id);
        if (o) actualizar(id, { destacada: !o.destacada }, o.destacada ? 'Ya no está destacada' : 'Marcada como destacada');
    }

    async function eliminar(id) {
        const o = lista.find(x => x.id === id);
        if (!o) return;
        if (!(await MaxDialog.confirm({ peligro: true, icono: 'ph-buildings', titulo: '¿Eliminar "' + o.nombre + '"?', mensaje: 'Se quita de las oficinas aliadas y no se puede deshacer.\nSi solo quieres que no salga en la web, usa "Ocultar".', aceptar: 'Sí, eliminar', cancelar: 'Volver' }))) return;
        try {
            const { error } = await sb().from('oficinas_aliadas').delete().eq('id', id);
            if (error) throw error;
            lista = lista.filter(x => x.id !== id);
            pintar();
            aviso('Oficina eliminada');
        } catch (e) {
            console.warn(e);
            aviso('No se pudo eliminar la oficina.');
        }
    }

    // ---------------- Formulario crear / editar ----------------
    const CAJA = 'w-full h-11 rounded-xl bg-gray-50 dark:bg-[#071714] border border-gray-200 dark:border-emerald-900/50 px-3.5 text-sm text-gray-900 dark:text-white placeholder-gray-400 outline-none focus:border-maximus-accent focus:ring-2 focus:ring-emerald-500/20 transition';
    const ETQ = 'block text-[11px] font-bold uppercase tracking-wider text-gray-500 mb-1.5';

    function crearModal() {
        if ($('modal-admin-oficina')) return;
        const m = document.createElement('div');
        m.id = 'modal-admin-oficina';
        m.className = 'fixed inset-0 z-[200] hidden items-center justify-center p-4 bg-black/50 backdrop-blur-sm';
        m.innerHTML = `
            <div class="w-full max-w-lg max-h-[92vh] flex flex-col bg-white dark:bg-[#0A1F1B] rounded-3xl shadow-2xl overflow-hidden">
                <div class="shrink-0 flex items-center justify-between px-6 py-4 border-b border-gray-100 dark:border-emerald-950/60">
                    <h3 id="modal-admin-oficina-titulo" class="text-lg font-extrabold text-maximus-dark dark:text-white">Nueva oficina aliada</h3>
                    <button type="button" data-cerrar class="w-9 h-9 rounded-xl hover:bg-gray-100 text-gray-500 flex items-center justify-center cursor-pointer"><i class="ph-bold ph-x"></i></button>
                </div>
                <form id="form-admin-oficina" class="flex-1 min-h-0 overflow-y-auto px-6 py-5 space-y-4" novalidate>
                    <div class="flex items-center gap-4">
                        <div id="oa-logo-preview" class="w-24 h-24 shrink-0 rounded-2xl bg-gradient-to-br from-maximus-dark to-[#0E6352] flex items-center justify-center overflow-hidden border border-gray-200"></div>
                        <div class="flex-1 space-y-2">
                            <label class="${ETQ}">Logo</label>
                            <label class="inline-flex items-center gap-2 h-10 px-4 rounded-xl bg-maximus-dark hover:bg-black text-white text-xs font-bold cursor-pointer">
                                <i class="ph-bold ph-upload-simple"></i> Subir imagen
                                <input id="oa-logo-archivo" type="file" accept="image/png,image/jpeg,image/webp" class="hidden">
                            </label>
                            <p class="text-[11px] text-gray-400">PNG, JPG o WebP. Mejor cuadrado y con fondo blanco o transparente.</p>
                            <input id="oa-logo-url" placeholder="…o pega la URL de la imagen" class="${CAJA} !h-9 text-xs">
                        </div>
                    </div>
                    <div>
                        <label for="oa-nombre" class="${ETQ}">Nombre *</label>
                        <input id="oa-nombre" maxlength="80" placeholder="Nombre de la inmobiliaria" class="${CAJA}">
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label for="oa-zona" class="${ETQ}">Zona *</label><input id="oa-zona" maxlength="120" placeholder="Ej: San Cristóbal" class="${CAJA}"></div>
                        <div><label for="oa-whatsapp" class="${ETQ}">WhatsApp</label><input id="oa-whatsapp" type="tel" maxlength="20" placeholder="0424 123 4567" class="${CAJA}"></div>
                    </div>
                    <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div><label for="oa-web" class="${ETQ}">Web o Instagram</label><input id="oa-web" maxlength="160" placeholder="@usuario o www.sitio.com" class="${CAJA}"></div>
                        <div><label for="oa-responsable" class="${ETQ}">Responsable (no se publica)</label><input id="oa-responsable" maxlength="80" class="${CAJA}"></div>
                    </div>
                    <div>
                        <label for="oa-desc" class="${ETQ}">Descripción corta</label>
                        <textarea id="oa-desc" maxlength="400" rows="2" class="${CAJA} !h-auto py-2.5 resize-none"></textarea>
                    </div>
                    <div class="grid grid-cols-2 sm:grid-cols-3 gap-4 items-end">
                        <div><label for="oa-orden" class="${ETQ}">Orden</label><input id="oa-orden" type="number" min="0" max="999" class="${CAJA}" title="Número más bajo = aparece primero"></div>
                        <label class="flex items-center gap-2 h-11 text-sm font-semibold text-gray-700 dark:text-gray-200 cursor-pointer"><input id="oa-destacada" type="checkbox" class="w-4 h-4 accent-amber-500"> Destacada</label>
                        <label class="flex items-center gap-2 h-11 text-sm font-semibold text-gray-700 dark:text-gray-200 cursor-pointer col-span-2 sm:col-span-1"><input id="oa-publicada" type="checkbox" class="w-4 h-4 accent-emerald-600"> Visible en la web</label>
                    </div>
                    <p id="oa-error" class="hidden text-xs font-semibold text-red-600 bg-red-50 border border-red-100 rounded-xl px-3 py-2"></p>
                </form>
                <div class="shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 dark:border-emerald-950/60">
                    <button type="button" data-cerrar class="h-11 px-5 rounded-xl text-sm font-bold text-gray-600 hover:bg-gray-100 cursor-pointer">Cancelar</button>
                    <button type="button" id="oa-guardar" class="h-11 px-6 rounded-xl bg-maximus-dark hover:bg-black text-white text-sm font-bold shadow-md flex items-center gap-2 cursor-pointer"><i class="ph-bold ph-floppy-disk"></i> <span>Guardar</span></button>
                </div>
            </div>`;
        document.body.appendChild(m);
        m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-cerrar]')) cerrarModal(); });
        $('oa-logo-archivo').addEventListener('change', (e) => {
            const f = e.target.files && e.target.files[0];
            if (!f) return;
            if (f.size > 4 * 1024 * 1024) { error('El logo pesa más de 4 MB. Usa una imagen más liviana.'); e.target.value = ''; return; }
            logoArchivo = f;
            previsualizar(URL.createObjectURL(f));
        });
        $('oa-logo-url').addEventListener('input', (e) => { logoArchivo = null; previsualizar(e.target.value.trim()); });
        $('oa-guardar').addEventListener('click', guardar);
    }

    function previsualizar(url) {
        const p = $('oa-logo-preview');
        const nombre = ($('oa-nombre') || {}).value || '';
        p.innerHTML = url
            ? `<img src="${esc(url)}" alt="" class="w-full h-full object-contain p-2 bg-white" onerror="this.parentElement.innerHTML='<span class=&quot;text-2xl font-black text-white&quot;>?</span>'">`
            : `<span class="text-2xl font-black text-white">${esc(iniciales(nombre))}</span>`;
    }

    function error(msg) {
        const el = $('oa-error');
        if (el) { el.textContent = msg || ''; el.classList.toggle('hidden', !msg); }
    }

    function abrirModal(o) {
        crearModal();
        editando = o || null;
        logoArchivo = null;
        $('modal-admin-oficina-titulo').textContent = o ? 'Editar oficina aliada' : 'Nueva oficina aliada';
        const set = (id, v) => { $(id).value = v == null ? '' : v; };
        set('oa-nombre', o && o.nombre); set('oa-zona', o && o.zona); set('oa-whatsapp', o && o.whatsapp ? '+' + o.whatsapp : '');
        set('oa-web', o && o.sitio_web); set('oa-responsable', o && o.responsable); set('oa-desc', o && o.descripcion);
        set('oa-orden', o ? (o.orden ?? 100) : 100); set('oa-logo-url', o && o.logo_url); $('oa-logo-archivo').value = '';
        $('oa-destacada').checked = !!(o && o.destacada);
        $('oa-publicada').checked = o ? o.estado === 'aprobada' : true;
        previsualizar(o && o.logo_url);
        error('');
        const m = $('modal-admin-oficina');
        m.classList.remove('hidden'); m.classList.add('flex');
        setTimeout(() => $('oa-nombre').focus(), 50);
    }

    function cerrarModal() {
        const m = $('modal-admin-oficina');
        if (m) { m.classList.add('hidden'); m.classList.remove('flex'); }
    }

    async function subirLogo(archivo, idOficina) {
        const ext = (archivo.name.split('.').pop() || 'png').toLowerCase().replace(/[^a-z0-9]/g, '') || 'png';
        const ruta = `${CARPETA}/${idOficina}-${Date.now()}.${ext}`;
        const { error: err } = await sb().storage.from(BUCKET).upload(ruta, archivo, { upsert: true, contentType: archivo.type });
        if (err) throw err;
        return sb().storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
    }

    async function guardar() {
        const v = (id) => ($(id).value || '').trim();
        const nombre = v('oa-nombre'), zona = v('oa-zona');
        if (nombre.length < 2) return error('Escribe el nombre de la inmobiliaria.');
        if (zona.length < 2) return error('Escribe la zona.');
        let wa = v('oa-whatsapp').replace(/\D/g, '');
        if (/^0\d{10}$/.test(wa)) wa = '58' + wa.slice(1);
        if (wa && (wa.length < 10 || wa.length > 15)) return error('Revisa el WhatsApp (ej: 0424 123 4567).');
        error('');

        const btn = $('oa-guardar');
        btn.disabled = true; btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin"></i> <span>Guardando…</span>';
        try {
            const publicada = $('oa-publicada').checked;
            const datos = {
                nombre, zona, whatsapp: wa || null, sitio_web: v('oa-web') || null,
                responsable: v('oa-responsable') || null, descripcion: v('oa-desc') || null,
                orden: Math.max(0, Math.min(999, parseInt(v('oa-orden'), 10) || 100)),
                destacada: $('oa-destacada').checked,
                logo_url: v('oa-logo-url') || null
            };
            // Estado: "visible" publica; si no, se oculta (las pendientes siguen pendientes si no se marcan visibles)
            if (publicada) { datos.estado = 'aprobada'; if (!editando || editando.estado !== 'aprobada') datos.aprobada_at = new Date().toISOString(); }
            else datos.estado = editando && editando.estado === 'pendiente' ? 'pendiente' : 'oculta';

            let id = editando && editando.id;
            if (!id) {
                const { data, error: err } = await sb().from('oficinas_aliadas').insert(datos).select('id').single();
                if (err) throw err;
                id = data.id;
            } else {
                const { error: err } = await sb().from('oficinas_aliadas').update(datos).eq('id', id);
                if (err) throw err;
            }
            if (logoArchivo) {
                const url = await subirLogo(logoArchivo, id);
                const { error: err } = await sb().from('oficinas_aliadas').update({ logo_url: url }).eq('id', id);
                if (err) throw err;
            }
            cerrarModal();
            aviso(editando ? 'Oficina actualizada' : 'Oficina agregada');
            await cargar();
        } catch (e) {
            console.warn('Guardar oficina aliada:', e);
            error('No se pudo guardar: ' + (e && e.message ? e.message : 'revisa tu conexión o permisos.'));
        } finally {
            btn.disabled = false; btn.innerHTML = '<i class="ph-bold ph-floppy-disk"></i> <span>Guardar</span>';
        }
    }

    // ---------------- API pública ----------------
    let iniciado = false;
    function iniciar() {
        if (!iniciado) {
            iniciado = true;
            document.querySelectorAll('[data-filtro-oficinas]').forEach(b => b.addEventListener('click', () => { filtro = b.dataset.filtroOficinas; pintar(); }));
            const busc = $('buscador-oficinas');
            if (busc) busc.addEventListener('input', pintar);
        }
        cargar();
    }

    window.OficinasAdmin = {
        iniciar, cargar, cambiarEstado, alternarDestacada, eliminar,
        nueva: () => abrirModal(null),
        editar: (id) => abrirModal(lista.find(x => x.id === id))
    };
})();
