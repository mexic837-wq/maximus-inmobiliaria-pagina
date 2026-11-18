/**
 * ====================================================================
 * MAXIMUS INMOBILIARIA - Formulario "Cargar Nuevo Inmueble" (panel)
 * ====================================================================
 * Mejora el formulario #form-cargar-inmueble sin cambiar cómo se guarda
 * (guardarInmuebleAdmin sigue leyendo los mismos ids):
 *
 *  · Menús desplegables con el diseño de la página (con buscador en listas largas,
 *    grupos, íconos y teclado). El <select> original queda oculto y sincronizado.
 *  · Operación como botones (Venta / Alquiler) y moneda automática.
 *  · Fotos: arrastrar o elegir → se comprimen y suben directo a Supabase Storage
 *    (bucket inmuebles-fotos/inmuebles/AAAA-MM/). Ordenar, portada, eliminar, pegar URL.
 *  · Amenidades con botón + y sugerencias (sin comas).
 *  · Botones − / + para habitaciones, baños y puestos; precio con miles; precio m² automático.
 *  · Revisión de campos obligatorios y borrador guardado en el navegador.
 */
(function () {
    'use strict';

    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const FORM = () => $('form-cargar-inmueble');
    const BUCKET = 'inmuebles-fotos';
    const CLAVE_BORRADOR = 'maximus_borrador_inmueble';
    const MAX_FOTOS = 30;

    const SUGERENCIAS = ['Piscina', 'Vigilancia 24/7', 'Estacionamiento techado', 'Ascensor', 'Planta eléctrica', 'Tanque de agua',
        'Áreas verdes', 'Parque infantil', 'Gimnasio', 'Salón de fiestas', 'Cancha deportiva', 'Pozo de agua', 'Aire acondicionado',
        'Cocina empotrada', 'Terraza', 'Balcón', 'Cerco eléctrico', 'Portón eléctrico', 'Internet fibra óptica', 'Amoblado'];

    let iniciado = false;
    let fotos = [];          // [{ id, url, preview, estado: 'subiendo'|'lista'|'error', error }]
    let amenidades = [];     // ['Piscina', ...]
    let precioM2Auto = true; // el precio m² se calcula solo hasta que el usuario lo escriba
    const selectsMejorados = [];

    // ================================================================
    // 1. MENÚS DESPLEGABLES CON EL DISEÑO DE LA PÁGINA
    // ================================================================
    const limpiarEtiqueta = (t) => String(t || '').replace(/^[^\p{L}\p{N}(+]+/u, '').trim();

    function mejorarSelect(sel) {
        if (!sel || sel.dataset.mejorado) return;
        sel.dataset.mejorado = '1';
        const ancho = (sel.className.match(/(^|\s)(w-\S+)/) || [])[2] || 'w-full';
        const chico = /text-xs/.test(sel.className) || sel.id.startsWith('asp-ico');

        const caja = document.createElement('div');
        caja.className = `cs-caja relative ${ancho} ${ancho === 'w-full' ? '' : 'shrink-0'}`;
        sel.parentNode.insertBefore(caja, sel);
        caja.appendChild(sel);
        sel.classList.add('hidden');
        sel.tabIndex = -1;

        const boton = document.createElement('button');
        boton.type = 'button';
        boton.className = `cs-boton w-full flex items-center justify-between gap-2 ${chico ? 'px-3 py-2 text-xs' : 'px-4 py-3 text-sm'} bg-gray-50 border border-gray-200 rounded-xl font-bold text-maximus-dark text-left outline-none hover:border-emerald-300 focus:border-maximus-accent focus:ring-2 focus:ring-emerald-500/20 transition cursor-pointer`;
        boton.setAttribute('aria-haspopup', 'listbox');
        boton.setAttribute('aria-expanded', 'false');
        caja.insertBefore(boton, sel);

        const panel = document.createElement('div');
        panel.className = 'cs-panel hidden absolute left-0 mt-2 z-[70] min-w-full w-max max-w-[min(92vw,28rem)] bg-white rounded-2xl border border-gray-100 shadow-2xl shadow-emerald-950/10 p-1.5 origin-top';
        panel.setAttribute('role', 'listbox');
        caja.appendChild(panel);

        let activo = -1;
        const opcionesValidas = () => [...sel.options].filter(o => o.value !== '' && !o.disabled);

        function pintarBoton() {
            const o = sel.selectedOptions[0];
            const vacio = !o || o.value === '';
            const icono = !vacio && /^ph-/.test(o.value) ? `<i class="ph-bold ${esc(o.value)} text-emerald-600 text-base shrink-0"></i>` : '';
            const texto = vacio ? limpiarEtiqueta((sel.options[0] && sel.options[0].text) || 'Selecciona…').replace(/^-+\s*|\s*-+$/g, '') : limpiarEtiqueta(o.text);
            boton.innerHTML = `<span class="flex items-center gap-2 min-w-0">${icono}<span class="truncate ${vacio ? 'text-gray-400 font-semibold' : ''}">${esc(texto)}</span></span><i class="ph-bold ph-caret-down text-gray-400 shrink-0 transition-transform"></i>`;
            boton.classList.toggle('border-red-300', false);
        }

        function construirLista(filtro) {
            const q = String(filtro || '').toLowerCase().trim();
            let html = '';
            let grupoPrevio = null;
            let idx = 0;
            [...sel.options].forEach(o => {
                if (o.value === '' || o.disabled) return;
                const etq = limpiarEtiqueta(o.text);
                if (q && !etq.toLowerCase().includes(q)) return;
                const grupo = o.parentElement && o.parentElement.tagName === 'OPTGROUP' ? o.parentElement.label : null;
                if (grupo && grupo !== grupoPrevio) {
                    html += `<p class="px-3 pt-3 pb-1 text-[10px] font-black uppercase tracking-wider text-gray-400">${esc(grupo)}</p>`;
                    grupoPrevio = grupo;
                }
                const sel_ = o.value === sel.value;
                const icono = /^ph-/.test(o.value) ? `<i class="ph-bold ${esc(o.value)} text-emerald-600 text-base shrink-0"></i>` : '';
                html += `<button type="button" role="option" data-valor="${esc(o.value)}" data-idx="${idx++}" aria-selected="${sel_}" class="cs-opcion w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-left text-sm font-semibold transition ${sel_ ? 'bg-emerald-50 text-emerald-800' : 'text-gray-700 hover:bg-gray-50'}">
                    ${icono}<span class="flex-1 truncate">${esc(etq)}</span>${sel_ ? '<i class="ph-bold ph-check text-emerald-600 shrink-0"></i>' : ''}</button>`;
            });
            return html || '<p class="px-3 py-4 text-sm text-gray-400 text-center">Sin resultados</p>';
        }

        const conBuscador = () => opcionesValidas().length > 8;

        function pintarPanel(filtro) {
            panel.innerHTML = (conBuscador()
                ? `<div class="p-1.5 pb-2"><div class="relative"><i class="ph-bold ph-magnifying-glass absolute left-3 top-1/2 -translate-y-1/2 text-gray-400 text-sm"></i><input type="text" class="cs-buscar w-full h-10 pl-9 pr-3 rounded-xl bg-gray-50 border border-gray-200 text-sm outline-none focus:border-maximus-accent" placeholder="Buscar…" value="${esc(filtro || '')}"></div></div>`
                : '') + `<div class="cs-lista max-h-72 overflow-y-auto pi-scroll">${construirLista(filtro)}</div>`;
            const b = panel.querySelector('.cs-buscar');
            if (b) {
                b.addEventListener('input', () => { panel.querySelector('.cs-lista').innerHTML = construirLista(b.value); activo = -1; });
                b.addEventListener('keydown', teclado);
            }
        }

        function abrir() {
            document.querySelectorAll('.cs-panel').forEach(p => { if (p !== panel) p.classList.add('hidden'); });
            pintarPanel('');
            panel.classList.remove('hidden');
            boton.setAttribute('aria-expanded', 'true');
            boton.querySelector('.ph-caret-down')?.classList.add('rotate-180');
            const b = panel.querySelector('.cs-buscar');
            if (b) setTimeout(() => b.focus(), 0);
            const elegido = panel.querySelector('[aria-selected="true"]');
            if (elegido) elegido.scrollIntoView({ block: 'nearest' });
        }
        function cerrar() {
            panel.classList.add('hidden');
            boton.setAttribute('aria-expanded', 'false');
            boton.querySelector('.ph-caret-down')?.classList.remove('rotate-180');
            activo = -1;
        }
        function elegir(valor) {
            sel.value = valor;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
            cerrar();
            boton.focus();
        }
        function marcarActivo() {
            const items = [...panel.querySelectorAll('.cs-opcion')];
            items.forEach((el, i) => el.classList.toggle('ring-2', i === activo));
            items.forEach((el, i) => el.classList.toggle('ring-emerald-300', i === activo));
            if (items[activo]) items[activo].scrollIntoView({ block: 'nearest' });
        }
        function teclado(e) {
            const items = [...panel.querySelectorAll('.cs-opcion')];
            if (e.key === 'ArrowDown') { e.preventDefault(); activo = Math.min(items.length - 1, activo + 1); marcarActivo(); }
            else if (e.key === 'ArrowUp') { e.preventDefault(); activo = Math.max(0, activo - 1); marcarActivo(); }
            else if (e.key === 'Enter') { e.preventDefault(); if (items[activo]) elegir(items[activo].dataset.valor); else if (items.length === 1) elegir(items[0].dataset.valor); }
            else if (e.key === 'Escape') { e.preventDefault(); cerrar(); boton.focus(); }
        }

        boton.addEventListener('click', () => (panel.classList.contains('hidden') ? abrir() : cerrar()));
        boton.addEventListener('keydown', (e) => {
            if (['ArrowDown', 'Enter', ' '].includes(e.key) && panel.classList.contains('hidden')) { e.preventDefault(); abrir(); }
            else if (!panel.classList.contains('hidden')) teclado(e);
        });
        panel.addEventListener('click', (e) => { const o = e.target.closest('.cs-opcion'); if (o) elegir(o.dataset.valor); });
        document.addEventListener('click', (e) => { if (!caja.contains(e.target)) cerrar(); });
        sel.addEventListener('change', pintarBoton);
        new MutationObserver(pintarBoton).observe(sel, { childList: true, subtree: true });

        pintarBoton();
        selectsMejorados.push({ sel, pintarBoton, boton });
    }

    const refrescarSelects = () => selectsMejorados.forEach(s => s.pintarBoton());

    // Operación como dos botones grandes
    function segmentarOperacion() {
        const sel = $('inm-operacion');
        if (!sel || sel.dataset.mejorado) return;
        sel.dataset.mejorado = '1';
        sel.classList.add('hidden');
        const caja = document.createElement('div');
        caja.className = 'grid grid-cols-2 gap-1 p-1 rounded-xl bg-gray-100';
        sel.parentNode.insertBefore(caja, sel);
        const pintar = () => {
            caja.innerHTML = [...sel.options].map(o => {
                const on = o.value === sel.value;
                const ic = /alquil/i.test(o.text) ? 'ph-key' : 'ph-tag';
                return `<button type="button" data-valor="${esc(o.value)}" class="h-[42px] rounded-lg text-sm font-bold flex items-center justify-center gap-2 transition cursor-pointer ${on ? 'bg-maximus-dark text-white shadow' : 'text-gray-600 hover:text-maximus-dark'}"><i class="ph-bold ${ic}"></i>${esc(o.text)}</button>`;
            }).join('');
        };
        caja.addEventListener('click', (e) => {
            const b = e.target.closest('[data-valor]');
            if (!b) return;
            sel.value = b.dataset.valor;
            sel.dispatchEvent(new Event('change', { bubbles: true }));
        });
        sel.addEventListener('change', pintar);
        selectsMejorados.push({ sel, pintarBoton: pintar });
        pintar();
    }

    // ================================================================
    // 2. NÚMEROS: precio con miles, steppers − / +, precio m² automático
    // ================================================================
    const soloNumero = (t) => parseFloat(String(t || '').replace(/[^\d,]/g, '').replace(',', '.')) || 0;
    const formatoMiles = (t) => {
        const limpio = String(t || '').replace(/[^\d,]/g, '');
        const [ent, dec] = limpio.split(',');
        const conPuntos = (ent || '').replace(/^0+(?=\d)/, '').replace(/\B(?=(\d{3})+(?!\d))/g, '.');
        return dec !== undefined ? `${conPuntos},${dec.slice(0, 2)}` : conPuntos;
    };

    function prepararNumeros() {
        const precio = $('inm-precio');
        if (precio && !precio.dataset.mejorado) {
            precio.dataset.mejorado = '1';
            envolverConPrefijo(precio, '$');
            precio.addEventListener('input', () => { precio.value = formatoMiles(precio.value); calcularPrecioM2(); });
        }
        const m2 = $('inm-m2');
        if (m2 && !m2.dataset.mejorado) {
            m2.dataset.mejorado = '1';
            m2.setAttribute('inputmode', 'decimal');
            m2.placeholder = 'Ej: 350';
            envolverConSufijo(m2, 'm²');
            m2.addEventListener('input', () => { m2.value = m2.value.replace(/[^\d,.]/g, ''); calcularPrecioM2(); });
        }
        const pm2 = $('inm-preciom2');
        if (pm2) pm2.addEventListener('input', () => { precioM2Auto = !pm2.value.trim(); });
        [['inm-habs', 'Ej: 3'], ['inm-banos', 'Ej: 2'], ['inm-estac', 'Ej: 1']].forEach(([id, ph]) => crearStepper($(id), ph));

        const op = $('inm-operacion');
        if (op) op.addEventListener('change', () => {
            const mon = $('inm-moneda');
            if (!mon) return;
            mon.value = /alquil/i.test(op.value) ? 'USD/mes' : 'USD';
            mon.dispatchEvent(new Event('change', { bubbles: true }));
        });
    }

    function envolverConPrefijo(input, texto) {
        const caja = document.createElement('div');
        caja.className = 'relative';
        input.parentNode.insertBefore(caja, input);
        caja.appendChild(input);
        caja.insertAdjacentHTML('afterbegin', `<span class="absolute left-4 top-1/2 -translate-y-1/2 text-sm font-black text-emerald-600 pointer-events-none">${texto}</span>`);
        input.classList.add('!pl-8');
    }
    function envolverConSufijo(input, texto) {
        const caja = document.createElement('div');
        caja.className = 'relative';
        input.parentNode.insertBefore(caja, input);
        caja.appendChild(input);
        caja.insertAdjacentHTML('beforeend', `<span class="absolute right-4 top-1/2 -translate-y-1/2 text-xs font-bold text-gray-400 pointer-events-none">${texto}</span>`);
        input.classList.add('!pr-10');
    }

    function crearStepper(input, ph) {
        if (!input || input.dataset.mejorado) return;
        input.dataset.mejorado = '1';
        input.setAttribute('inputmode', 'numeric');
        input.placeholder = ph;
        const caja = document.createElement('div');
        caja.className = 'flex items-stretch rounded-xl border border-gray-200 bg-gray-50 overflow-hidden focus-within:border-maximus-accent focus-within:ring-2 focus-within:ring-emerald-500/20 transition';
        input.parentNode.insertBefore(caja, input);
        const btn = (s, ic) => `<button type="button" data-paso="${s}" class="w-11 shrink-0 flex items-center justify-center text-gray-500 hover:text-maximus-dark hover:bg-emerald-50 transition cursor-pointer" aria-label="${s > 0 ? 'Sumar' : 'Restar'}"><i class="ph-bold ${ic}"></i></button>`;
        caja.insertAdjacentHTML('beforeend', btn(-1, 'ph-minus'));
        caja.appendChild(input);
        caja.insertAdjacentHTML('beforeend', btn(1, 'ph-plus'));
        input.className = 'flex-1 min-w-0 w-full px-2 py-3 bg-transparent text-center text-sm font-bold text-maximus-dark outline-none border-0';
        input.addEventListener('input', () => { input.value = input.value.replace(/[^\d.,]/g, ''); });
        caja.addEventListener('click', (e) => {
            const b = e.target.closest('[data-paso]');
            if (!b) return;
            const paso = Number(b.dataset.paso);
            const esBano = input.id === 'inm-banos';
            const actual = parseFloat(String(input.value).replace(',', '.')) || 0;
            const nuevo = Math.max(0, Math.min(99, actual + paso * (esBano && e.shiftKey ? 0.5 : 1)));
            input.value = String(nuevo).replace('.', ',');
            input.dispatchEvent(new Event('input', { bubbles: true }));
        });
    }

    function calcularPrecioM2() {
        const pm2 = $('inm-preciom2');
        if (!pm2 || !precioM2Auto) return;
        const p = soloNumero(($('inm-precio') || {}).value);
        const a = soloNumero(($('inm-m2') || {}).value);
        pm2.value = p > 0 && a > 0 ? `$${Math.round(p / a).toLocaleString('es-VE')} USD / m²` : '';
    }

    // ================================================================
    // 3. FOTOS: subida directa a Supabase Storage
    // ================================================================
    function sincronizarFotos() {
        const listas = fotos.filter(f => f.estado === 'lista' && f.url).map(f => f.url);
        const h = $('inm-fotos');
        if (h) h.value = listas.join(',');
        const c = $('fotos-contador');
        if (c) {
            const sub = fotos.filter(f => f.estado === 'subiendo').length;
            c.textContent = sub ? `Subiendo ${sub}…` : `${listas.length} ${listas.length === 1 ? 'foto' : 'fotos'}`;
            c.className = `text-[11px] font-bold px-2.5 py-1 rounded-full border ${sub ? 'text-amber-700 bg-amber-50 border-amber-200' : listas.length ? 'text-emerald-700 bg-emerald-50 border-emerald-200' : 'text-gray-500 bg-gray-50 border-gray-200'}`;
        }
        guardarBorrador();
    }

    function pintarFotos() {
        const cont = $('fotos-uploader');
        if (!cont) return;
        const tarjetas = fotos.map((f, i) => `
            <div class="foto-item group relative aspect-[4/3] rounded-2xl overflow-hidden bg-gray-100 border ${i === 0 ? 'border-emerald-400 ring-2 ring-emerald-200' : 'border-gray-200'}" draggable="${f.estado === 'lista'}" data-id="${f.id}">
                <img src="${esc(f.preview || f.url)}" alt="" class="w-full h-full object-cover ${f.estado !== 'lista' ? 'opacity-60' : ''}">
                ${i === 0 && f.estado === 'lista' ? '<span class="absolute top-2 left-2 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[10px] font-black uppercase tracking-wider shadow">Portada</span>' : ''}
                ${f.estado === 'subiendo' ? '<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-black/30 text-white text-xs font-bold"><i class="ph-bold ph-spinner ph-spin text-2xl"></i>Subiendo…</div>' : ''}
                ${f.estado === 'error' ? `<div class="absolute inset-0 flex flex-col items-center justify-center gap-1 bg-red-600/80 text-white text-[11px] font-bold p-2 text-center"><i class="ph-bold ph-warning text-xl"></i>${esc(f.error || 'No se pudo subir')}<button type="button" data-accion="reintentar" class="mt-1 px-2 py-1 rounded-lg bg-white text-red-700 cursor-pointer">Reintentar</button></div>` : ''}
                <div class="absolute bottom-0 inset-x-0 p-1.5 flex items-center justify-end gap-1 bg-gradient-to-t from-black/60 to-transparent opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition">
                    ${i > 0 && f.estado === 'lista' ? '<button type="button" data-accion="portada" title="Usar como portada" class="h-8 px-2 rounded-lg bg-white/90 hover:bg-white text-gray-800 text-[11px] font-bold flex items-center gap-1 cursor-pointer"><i class="ph-fill ph-star text-amber-500"></i>Portada</button>' : ''}
                    ${i > 0 ? '<button type="button" data-accion="izq" title="Mover a la izquierda" class="w-8 h-8 rounded-lg bg-white/90 hover:bg-white text-gray-700 flex items-center justify-center cursor-pointer"><i class="ph-bold ph-caret-left"></i></button>' : ''}
                    ${i < fotos.length - 1 ? '<button type="button" data-accion="der" title="Mover a la derecha" class="w-8 h-8 rounded-lg bg-white/90 hover:bg-white text-gray-700 flex items-center justify-center cursor-pointer"><i class="ph-bold ph-caret-right"></i></button>' : ''}
                    <button type="button" data-accion="borrar" title="Quitar foto" class="w-8 h-8 rounded-lg bg-white/90 hover:bg-red-50 text-red-600 flex items-center justify-center cursor-pointer"><i class="ph-bold ph-trash"></i></button>
                </div>
            </div>`).join('');

        cont.innerHTML = `
            <label id="fotos-zona" class="flex flex-col items-center justify-center gap-2 p-6 sm:p-8 rounded-2xl border-2 border-dashed border-emerald-300 bg-emerald-50/40 hover:bg-emerald-50 text-center cursor-pointer transition">
                <span class="w-14 h-14 rounded-2xl bg-white text-emerald-600 shadow-sm flex items-center justify-center text-3xl"><i class="ph-bold ph-cloud-arrow-up"></i></span>
                <span class="text-sm font-extrabold text-maximus-dark">Arrastra las fotos aquí o <span class="text-emerald-700 underline">elígelas</span></span>
                <span class="text-[11px] text-gray-500">JPG, PNG o WebP · hasta ${MAX_FOTOS} fotos · se optimizan solas antes de subir</span>
                <input id="fotos-input" type="file" accept="image/jpeg,image/png,image/webp,image/avif" multiple class="hidden">
            </label>
            ${fotos.length ? `<div id="fotos-grid" class="mt-4 grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">${tarjetas}</div>` : ''}
            <details class="mt-3 group">
                <summary class="text-xs font-bold text-gray-500 hover:text-maximus-dark cursor-pointer select-none list-none flex items-center gap-1"><i class="ph-bold ph-link"></i> ¿La foto ya está en internet? Pega su enlace</summary>
                <div class="mt-2 flex gap-2">
                    <input id="fotos-url" type="url" placeholder="https://…/foto.jpg" class="flex-1 min-w-0 px-4 py-2.5 bg-gray-50 border border-gray-200 rounded-xl text-sm outline-none focus:border-maximus-accent">
                    <button type="button" id="fotos-url-agregar" class="px-4 rounded-xl bg-maximus-dark hover:bg-black text-white text-xs font-bold cursor-pointer">Agregar</button>
                </div>
            </details>`;

        const zona = $('fotos-zona');
        $('fotos-input').addEventListener('change', (e) => { agregarArchivos(e.target.files); e.target.value = ''; });
        ['dragenter', 'dragover'].forEach(ev => zona.addEventListener(ev, (e) => { if (e.dataTransfer && [...e.dataTransfer.types].includes('Files')) { e.preventDefault(); zona.classList.add('!bg-emerald-100', '!border-emerald-500'); } }));
        ['dragleave', 'drop'].forEach(ev => zona.addEventListener(ev, () => zona.classList.remove('!bg-emerald-100', '!border-emerald-500')));
        zona.addEventListener('drop', (e) => { if (e.dataTransfer && e.dataTransfer.files.length) { e.preventDefault(); agregarArchivos(e.dataTransfer.files); } });
        $('fotos-url-agregar').addEventListener('click', agregarUrl);
        $('fotos-url').addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); agregarUrl(); } });

        const grid = $('fotos-grid');
        if (grid) {
            grid.addEventListener('click', (e) => {
                const b = e.target.closest('[data-accion]');
                if (!b) return;
                const id = b.closest('.foto-item').dataset.id;
                const i = fotos.findIndex(f => f.id === id);
                if (i < 0) return;
                const a = b.dataset.accion;
                if (a === 'borrar') fotos.splice(i, 1);
                else if (a === 'portada') fotos.unshift(fotos.splice(i, 1)[0]);
                else if (a === 'izq' && i > 0) [fotos[i - 1], fotos[i]] = [fotos[i], fotos[i - 1]];
                else if (a === 'der' && i < fotos.length - 1) [fotos[i + 1], fotos[i]] = [fotos[i], fotos[i + 1]];
                else if (a === 'reintentar') { subir(fotos[i]); return; }
                pintarFotos(); sincronizarFotos();
            });
            // Arrastrar para reordenar (escritorio)
            let arrastrando = null;
            grid.addEventListener('dragstart', (e) => { const it = e.target.closest('.foto-item'); if (it) { arrastrando = it.dataset.id; e.dataTransfer.effectAllowed = 'move'; it.classList.add('opacity-50'); } });
            grid.addEventListener('dragend', () => { arrastrando = null; pintarFotos(); });
            grid.addEventListener('dragover', (e) => { if (arrastrando) e.preventDefault(); });
            grid.addEventListener('drop', (e) => {
                if (!arrastrando) return;
                e.preventDefault();
                const destino = e.target.closest('.foto-item');
                if (!destino || destino.dataset.id === arrastrando) return;
                const de = fotos.findIndex(f => f.id === arrastrando);
                const a = fotos.findIndex(f => f.id === destino.dataset.id);
                fotos.splice(a, 0, fotos.splice(de, 1)[0]);
                arrastrando = null;
                pintarFotos(); sincronizarFotos();
            });
        }
    }

    function agregarUrl() {
        const inp = $('fotos-url');
        const v = (inp.value || '').trim();
        if (!/^https?:\/\/\S+$/i.test(v)) { inp.classList.add('border-red-300'); return; }
        fotos.push({ id: 'u' + Date.now() + Math.random().toString(36).slice(2, 6), url: v, preview: v, estado: 'lista' });
        inp.value = '';
        pintarFotos(); sincronizarFotos();
    }

    function agregarArchivos(lista) {
        const archivos = [...(lista || [])].filter(f => /^image\//.test(f.type));
        const espacio = MAX_FOTOS - fotos.length;
        if (!archivos.length) return;
        if (espacio <= 0) return aviso(`Máximo ${MAX_FOTOS} fotos por inmueble.`);
        archivos.slice(0, espacio).forEach(archivo => {
            const f = { id: 'f' + Date.now() + Math.random().toString(36).slice(2, 7), archivo, preview: URL.createObjectURL(archivo), estado: 'subiendo' };
            fotos.push(f);
            subir(f);
        });
        if (archivos.length > espacio) aviso(`Solo se agregaron ${espacio}; el máximo es ${MAX_FOTOS} fotos.`);
        pintarFotos(); sincronizarFotos();
    }

    // Reduce a máx. 2000 px y JPG 85 % (fotos de celular de 6 MB quedan en ~400 KB)
    async function optimizar(archivo) {
        if (archivo.size < 600 * 1024 && /jpe?g|webp/.test(archivo.type)) return archivo;
        try {
            const bmp = await createImageBitmap(archivo);
            const escala = Math.min(1, 2000 / Math.max(bmp.width, bmp.height));
            const c = document.createElement('canvas');
            c.width = Math.round(bmp.width * escala);
            c.height = Math.round(bmp.height * escala);
            c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
            const blob = await new Promise(r => c.toBlob(r, 'image/jpeg', 0.85));
            return blob && blob.size < archivo.size ? new File([blob], archivo.name.replace(/\.\w+$/, '') + '.jpg', { type: 'image/jpeg' }) : archivo;
        } catch (_) { return archivo; }
    }

    async function subir(f) {
        f.estado = 'subiendo'; f.error = null;
        pintarFotos(); sincronizarFotos();
        try {
            if (f.archivo.size > 25 * 1024 * 1024) throw new Error('La foto pesa más de 25 MB');
            const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
            if (!sb) throw new Error('Sin conexión con el servidor');
            const archivo = await optimizar(f.archivo);
            const ext = (archivo.type.split('/')[1] || 'jpg').replace('jpeg', 'jpg');
            const mes = new Date().toISOString().slice(0, 7);
            const ruta = `inmuebles/${mes}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
            const { error } = await sb.storage.from(BUCKET).upload(ruta, archivo, { contentType: archivo.type, upsert: false, cacheControl: '31536000' });
            if (error) throw error;
            f.url = sb.storage.from(BUCKET).getPublicUrl(ruta).data.publicUrl;
            f.estado = 'lista';
        } catch (e) {
            console.warn('Subida de foto:', e);
            f.estado = 'error';
            f.error = (e && e.message && e.message.length < 60) ? e.message : 'No se pudo subir';
        }
        pintarFotos(); sincronizarFotos();
    }

    // ================================================================
    // 4. AMENIDADES con botón +
    // ================================================================
    function sincronizarAmenidades() {
        const h = $('inm-amenidades');
        if (h) h.value = amenidades.join(',');
        guardarBorrador();
    }

    function pintarAmenidades() {
        const cont = $('amenidades-editor');
        if (!cont) return;
        const sugeridas = SUGERENCIAS.filter(s => !amenidades.some(a => a.toLowerCase() === s.toLowerCase()));
        cont.innerHTML = `
            <div class="flex gap-2">
                <input id="amenidad-nueva" type="text" maxlength="40" placeholder="Ej: Piscina climatizada" class="flex-1 min-w-0 px-4 py-3 bg-gray-50 border border-gray-200 rounded-xl text-sm font-semibold text-maximus-dark outline-none focus:border-maximus-accent focus:ring-2 focus:ring-emerald-500/20 placeholder-gray-400">
                <button type="button" id="amenidad-agregar" class="w-12 shrink-0 rounded-xl bg-maximus-dark hover:bg-black text-white text-xl flex items-center justify-center shadow-sm cursor-pointer" aria-label="Agregar amenidad"><i class="ph-bold ph-plus"></i></button>
            </div>
            <div id="amenidades-lista" class="mt-3 flex flex-wrap gap-2 ${amenidades.length ? '' : 'hidden'}">
                ${amenidades.map((a, i) => `<span class="inline-flex items-center gap-1.5 pl-3 pr-1.5 h-9 rounded-full bg-emerald-50 border border-emerald-200 text-emerald-800 text-sm font-semibold"><i class="ph-bold ph-check text-xs"></i>${esc(a)}<button type="button" data-quitar="${i}" class="w-6 h-6 rounded-full hover:bg-emerald-200 flex items-center justify-center cursor-pointer" aria-label="Quitar ${esc(a)}"><i class="ph-bold ph-x text-xs"></i></button></span>`).join('')}
            </div>
            ${sugeridas.length ? `<p class="mt-4 mb-2 text-[11px] font-bold uppercase tracking-wider text-gray-400">Sugerencias</p>
            <div class="flex flex-wrap gap-1.5">${sugeridas.slice(0, 14).map(s => `<button type="button" data-sugerencia="${esc(s)}" class="inline-flex items-center gap-1 h-8 px-3 rounded-full border border-dashed border-gray-300 text-gray-600 text-xs font-semibold hover:border-emerald-400 hover:text-emerald-700 hover:bg-emerald-50 transition cursor-pointer"><i class="ph-bold ph-plus text-[10px]"></i>${esc(s)}</button>`).join('')}</div>` : ''}`;

        const inp = $('amenidad-nueva');
        inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ',') { e.preventDefault(); agregarAmenidad(inp.value); }
            else if (e.key === 'Backspace' && !inp.value && amenidades.length) { amenidades.pop(); pintarAmenidades(); sincronizarAmenidades(); $('amenidad-nueva').focus(); }
        });
    }

    function agregarAmenidad(texto) {
        const t = String(texto || '').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
        if (!t) return;
        if (!amenidades.some(a => a.toLowerCase() === t.toLowerCase())) amenidades.push(t);
        pintarAmenidades(); sincronizarAmenidades();
        const n = $('amenidad-nueva'); if (n) n.focus();
    }

    // Un solo manejador para botones +, quitar y sugerencias (el contenido se redibuja)
    function escucharAmenidades() {
        const cont = $('amenidades-editor');
        if (!cont) return;
        cont.addEventListener('click', (e) => {
            if (e.target.closest('#amenidad-agregar')) { agregarAmenidad(($('amenidad-nueva') || {}).value); return; }
            const q = e.target.closest('[data-quitar]');
            if (q) { amenidades.splice(Number(q.dataset.quitar), 1); pintarAmenidades(); sincronizarAmenidades(); return; }
            const s = e.target.closest('[data-sugerencia]');
            if (s) agregarAmenidad(s.dataset.sugerencia);
        });
    }

    // ================================================================
    // 5. VALIDACIÓN, BORRADOR Y LIMPIEZA
    // ================================================================
    function aviso(msg) {
        if (typeof mostrarToastNotificacion === 'function') mostrarToastNotificacion(msg);
    }

    function marcar(el, mal) {
        if (!el) return;
        const blanco = el.classList.contains('hidden') ? el.parentElement.querySelector('.cs-boton') || el.parentElement : el;
        blanco.classList.toggle('!border-red-400', mal);
        blanco.classList.toggle('!ring-2', mal);
        blanco.classList.toggle('!ring-red-100', mal);
    }

    // Devuelve true si falta algo (y lo muestra)
    function validar() {
        const faltan = [];
        const chequeo = (id, cond, texto) => { const el = $(id); const mal = !cond; marcar(el, mal); if (mal) faltan.push({ el, texto }); };
        chequeo('inm-titulo', (($('inm-titulo') || {}).value || '').trim().length >= 5, 'Título del inmueble (mínimo 5 letras)');
        chequeo('inm-precio', soloNumero(($('inm-precio') || {}).value) > 0, 'Precio');
        chequeo('inm-sector-select', !!(($('inm-sector-select') || {}).value), 'Zona o sector');
        chequeo('inm-asesor-nombre', (($('inm-asesor-nombre') || {}).value || '').trim().length >= 2, 'Nombre del asesor de contacto');
        chequeo('inm-asesor-telefono', (($('inm-asesor-telefono') || {}).value || '').replace(/\D/g, '').length >= 7, 'WhatsApp del asesor de contacto');
        const subiendo = fotos.some(f => f.estado === 'subiendo');
        const listas = fotos.filter(f => f.estado === 'lista').length;
        const zonaFotos = $('fotos-zona');
        if (zonaFotos) zonaFotos.classList.toggle('!border-red-400', !listas);
        if (!listas) faltan.push({ el: zonaFotos, texto: 'Al menos 1 foto' });

        const caja = $('cargar-resumen-faltantes');
        if (subiendo && !faltan.length) {
            aviso('⏳ Espera a que terminen de subir las fotos');
            return true;
        }
        if (caja) {
            caja.classList.toggle('hidden', !faltan.length);
            caja.innerHTML = faltan.length ? `<p class="font-bold flex items-center gap-2"><i class="ph-fill ph-warning-circle text-lg"></i> Antes de publicar falta completar:</p><ul class="mt-2 ml-7 list-disc space-y-0.5">${faltan.map(f => `<li>${esc(f.texto)}</li>`).join('')}</ul>` : '';
        }
        if (faltan.length) {
            const primero = faltan[0].el;
            if (primero) primero.scrollIntoView({ behavior: 'smooth', block: 'center' });
            return true;
        }
        if (subiendo) { aviso('⏳ Espera a que terminen de subir las fotos'); return true; }
        return false;
    }

    let temporizador = null;
    function guardarBorrador() {
        clearTimeout(temporizador);
        temporizador = setTimeout(() => {
            try {
                const form = FORM();
                if (!form) return;
                const campos = {};
                form.querySelectorAll('input[id], select[id], textarea[id]').forEach(el => {
                    if (el.type === 'file' || el.id === 'inm-fotos' || el.id === 'inm-amenidades' || el.id.startsWith('fotos-') || el.id === 'amenidad-nueva') return;
                    campos[el.id] = el.value;
                });
                const datos = { campos, fotos: fotos.filter(f => f.estado === 'lista').map(f => f.url), amenidades, guardado: Date.now() };
                const tieneAlgo = datos.fotos.length || amenidades.length || ['inm-titulo', 'inm-precio', 'inm-descripcion'].some(k => (campos[k] || '').trim());
                if (tieneAlgo) localStorage.setItem(CLAVE_BORRADOR, JSON.stringify(datos));
                else localStorage.removeItem(CLAVE_BORRADOR);
            } catch (_) { /* sin almacenamiento: no pasa nada */ }
        }, 600);
    }

    function restaurarBorrador() {
        let d = null;
        try { d = JSON.parse(localStorage.getItem(CLAVE_BORRADOR) || 'null'); } catch (_) {}
        if (!d || !d.campos) return;
        // Borradores de más de 7 días se descartan
        if (Date.now() - (d.guardado || 0) > 7 * 864e5) { try { localStorage.removeItem(CLAVE_BORRADOR); } catch (_) {} return; }
        // Al abrir la página el formulario está recién cargado: el borrador manda
        Object.entries(d.campos).forEach(([id, v]) => {
            const el = $(id);
            if (el && !/asesor/.test(id)) { el.value = v; }
        });
        fotos = (d.fotos || []).map((u, i) => ({ id: 'b' + i + Date.now(), url: u, preview: u, estado: 'lista' }));
        amenidades = Array.isArray(d.amenidades) ? d.amenidades : [];
        ['inm-sector-select', 'inm-operacion', 'inm-moneda'].forEach(id => { const el = $(id); if (el) el.dispatchEvent(new Event('change', { bubbles: true })); });
        for (let i = 1; i <= 4; i++) { const el = $('asp-ico-' + i); if (el) el.dispatchEvent(new Event('change', { bubbles: true })); }
        precioM2Auto = !(d.campos['inm-preciom2'] || '').trim() || /USD \/ m²$/.test(d.campos['inm-preciom2']);
        const banner = document.createElement('div');
        banner.id = 'aviso-borrador';
        banner.className = 'mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-2xl bg-sky-50 border border-sky-200 text-sm text-sky-900';
        banner.innerHTML = `<p class="flex items-center gap-2"><i class="ph-fill ph-floppy-disk text-lg text-sky-600"></i> Recuperamos el inmueble que estabas cargando.</p>
            <button type="button" class="shrink-0 h-9 px-4 rounded-xl bg-white border border-sky-200 hover:bg-sky-100 font-bold text-xs cursor-pointer">Empezar de cero</button>`;
        banner.querySelector('button').addEventListener('click', () => limpiar(false));
        const form = FORM();
        if (form && !$('aviso-borrador')) form.parentNode.insertBefore(banner, form);
    }

    function limpiar(preguntar) {
        if (preguntar && !confirm('¿Borrar todo lo que llenaste en este formulario?')) return;
        const form = FORM();
        if (form) form.reset();
        fotos = []; amenidades = []; precioM2Auto = true;
        try { localStorage.removeItem(CLAVE_BORRADOR); } catch (_) {}
        $('aviso-borrador')?.remove();
        const caja = $('cargar-resumen-faltantes');
        if (caja) caja.classList.add('hidden');
        document.querySelectorAll('#form-cargar-inmueble .\\!border-red-400').forEach(el => el.classList.remove('!border-red-400', '!ring-2', '!ring-red-100'));
        for (let i = 1; i <= 4; i++) { const el = $('asp-ico-' + i); if (el && typeof window.actualizarPreviewIcono === 'function') window.actualizarPreviewIcono(i, el.value); }
        if (typeof window.alCambiarSectorInmueble === 'function') window.alCambiarSectorInmueble();
        refrescarSelects();
        pintarFotos(); sincronizarFotos();
        pintarAmenidades(); sincronizarAmenidades();
        prellenarAsesor();
    }

    function prellenarAsesor() {
        let u = null;
        try { u = (typeof AuthService !== 'undefined' && AuthService.getCurrentUser()) || JSON.parse(localStorage.getItem('maximus_user') || 'null'); } catch (_) {}
        const n = $('inm-asesor-nombre'), t = $('inm-asesor-telefono');
        if (n && !n.value && u && u.name) n.value = u.name;
        const tel = u && (u.whatsapp || u.telefono);
        if (t && !t.value && tel) t.value = String(tel).replace(/^\+?(58|57)\s*/, '');
    }

    // ================================================================
    // 6. ARRANQUE
    // ================================================================
    function iniciar() {
        const form = FORM();
        if (!form) return;
        if (!iniciado) {
            iniciado = true;
            // Que Chrome no rellene el formulario con valores viejos al recargar (eso lo hace el borrador)
            form.setAttribute('autocomplete', 'off');
            segmentarOperacion();
            form.querySelectorAll('select').forEach(s => { if (s.id !== 'inm-operacion') mejorarSelect(s); });
            prepararNumeros();
            const tit = $('inm-titulo');
            if (tit) {
                tit.maxLength = 90;
                tit.insertAdjacentHTML('afterend', '<p id="inm-titulo-contador" class="mt-1 text-[11px] text-gray-400 text-right">0/90</p>');
                tit.addEventListener('input', () => { $('inm-titulo-contador').textContent = `${tit.value.length}/90`; });
            }
            form.addEventListener('input', guardarBorrador);
            form.addEventListener('change', guardarBorrador);
            // Al corregir un campo marcado en rojo, se quita la marca
            form.addEventListener('input', (e) => marcar(e.target, false));
            form.addEventListener('change', (e) => marcar(e.target, false));
            escucharAmenidades();
            pintarFotos();
            pintarAmenidades();
            restaurarBorrador();
            pintarFotos(); sincronizarFotos();
            pintarAmenidades(); sincronizarAmenidades();
            refrescarSelects();
            calcularPrecioM2();
        }
        prellenarAsesor();
    }

    window.CargaInmuebleUI = {
        iniciar, validar, limpiar,
        subiendo: () => fotos.some(f => f.estado === 'subiendo'),
        fotos: () => fotos.filter(f => f.estado === 'lista').map(f => f.url)
    };

    // Si la vista ya está en pantalla al cargar (recarga con #view-admin-cargar-inmueble)
    document.addEventListener('DOMContentLoaded', () => setTimeout(() => { if ($('form-cargar-inmueble')) iniciar(); }, 300));
})();
