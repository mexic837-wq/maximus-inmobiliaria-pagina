/**
 * MAXIMUS · Favoritos y comparador (reemplaza a "Descubre" en el panel).
 *
 *   - Lista los inmuebles que el usuario guardó con el corazón (localStorage 'maximus_favoritos').
 *   - Permite marcar de 2 a 3 y compararlos lado a lado (precio, precio por m², zona, cuartos…).
 *   - Sugiere "inmuebles parecidos" a los favoritos (mismo tipo, operación, zona y rango de precio).
 *
 * Usa los datos que el panel ya tiene cargados (INMUEBLES_DETALLE_DATA) y las funciones
 * getFavoritosDashboard / toggleFavoritoDashboard / abrirDetalleInmuebleAirbnb del panel.
 * No necesita cambios en la base de datos.
 */
(function () {
    'use strict';

    const MAX_COMPARAR = 3;
    const seleccion = new Set();

    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
    const $ = (id) => document.getElementById(id);

    function datos() { return window.INMUEBLES_DETALLE_DATA || {}; }

    function favoritosIds() {
        try { return typeof getFavoritosDashboard === 'function' ? getFavoritosDashboard() : []; } catch (_) { return []; }
    }

    // Un favorito puede guardarse con el id real o con ids de ejemplo tipo "inm-5"
    function dataDe(id) {
        const D = datos();
        if (D[id]) return D[id];
        if (!/^inm-/i.test(String(id))) return null;
        const dig = String(id).replace(/\D/g, '');
        return Object.values(D).find(x => /^inm-/i.test(String(x.id || '')) && String(x.id).replace(/\D/g, '') === dig) || null;
    }

    const num = (v) => {
        const n = parseFloat(String(v == null ? '' : v).replace(/[^0-9.]/g, ''));
        return isFinite(n) ? n : NaN;
    };
    const foto = (d) => {
        const f = d && Array.isArray(d.fotos) ? d.fotos[0] : null;
        return typeof f === 'string' ? f : (f && (f.url || f.src)) || '';
    };
    const sector = (d) => String((d && (d.sectorNombre || String(d.ubicacion || '').split(',')[0])) || '').trim().toLowerCase();
    const precioM2 = (d) => {
        const p = num(d.precio), m = num(d.m2);
        return p > 0 && m > 0 ? p / m : NaN;
    };
    const m2Texto = (v) => { const s = String(v == null ? '' : v).trim(); return /m/i.test(s) ? s : s + ' m²'; };
    const usd = (n) => isFinite(n) ? '$' + Math.round(n).toLocaleString('en-US') : '—';

    function favoritosConDatos() {
        const vistos = new Set();
        const out = [];
        favoritosIds().forEach(id => {
            const d = dataDe(id);
            if (d && !vistos.has(d.id)) { vistos.add(d.id); out.push(d); }
        });
        return out;
    }

    // ---------- Tarjetas ----------
    function tarjeta(d, { favorito }) {
        const id = esc(d.id);
        const img = foto(d);
        const marcado = seleccion.has(String(d.id));
        const datosLinea = [
            d.habitaciones && d.habitaciones !== 'N/D' ? `<span><i class="ph ph-bed"></i> ${esc(d.habitaciones)}</span>` : '',
            d.banos && d.banos !== 'N/D' ? `<span><i class="ph ph-bathtub"></i> ${esc(d.banos)}</span>` : '',
            d.m2 && d.m2 !== 'N/D' ? `<span><i class="ph ph-ruler"></i> ${esc(m2Texto(d.m2))}</span>` : ''
        ].filter(Boolean).join('');
        return `
        <article class="fav-card bg-white dark:bg-[#0A1F1B] rounded-2xl border ${marcado ? 'border-emerald-500 ring-2 ring-emerald-200 dark:ring-emerald-900' : 'border-gray-200/70 dark:border-emerald-950/60'} shadow-sm overflow-hidden flex flex-col">
            <button type="button" data-ver="${id}" class="relative block w-full aspect-[4/3] bg-gray-100 dark:bg-[#0D2822] text-left" aria-label="Ver ${esc(d.titulo)}">
                ${img ? `<img src="${esc(img)}" alt="" loading="lazy" class="absolute inset-0 w-full h-full object-cover">` : '<span class="absolute inset-0 flex items-center justify-center text-3xl text-gray-300"><i class="ph ph-house-line"></i></span>'}
                <span class="absolute left-2 top-2 px-2 py-0.5 rounded-full bg-black/60 text-white text-[10px] font-bold uppercase">${esc(d.operacion || '')}</span>
            </button>
            <div class="p-3.5 flex-1 flex flex-col gap-1.5">
                <p class="text-lg font-extrabold text-maximus-dark dark:text-white leading-none">${esc(d.precio || '')} <span class="text-[10px] font-semibold text-gray-400">${esc(d.moneda && d.moneda !== 'USD' ? d.moneda : '')}</span></p>
                <h3 class="text-sm font-bold text-gray-800 dark:text-gray-100 line-clamp-2 leading-snug">${esc(d.titulo)}</h3>
                <p class="text-xs text-gray-500 dark:text-gray-400 truncate"><i class="ph-fill ph-map-pin text-emerald-600"></i> ${esc(d.ubicacion || '')}</p>
                <div class="flex flex-wrap gap-x-3 gap-y-1 text-xs text-gray-600 dark:text-gray-300 mt-0.5">${datosLinea}</div>
                <div class="mt-auto pt-3 flex items-center gap-2">
                    ${favorito ? `
                    <label class="flex-1 h-9 px-3 rounded-xl border ${marcado ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-200' : 'border-gray-200 dark:border-emerald-900 text-gray-600 dark:text-gray-300'} text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer select-none">
                        <input type="checkbox" data-comparar="${id}" class="accent-emerald-600" ${marcado ? 'checked' : ''}> Comparar
                    </label>
                    <button type="button" data-quitar="${id}" title="Quitar de favoritos" aria-label="Quitar de favoritos" class="w-9 h-9 rounded-xl border border-gray-200 dark:border-emerald-900 text-red-500 hover:bg-red-50 flex items-center justify-center"><i class="ph-fill ph-heart"></i></button>`
                    : `
                    <button type="button" data-ver="${id}" class="flex-1 h-9 rounded-xl border border-gray-200 dark:border-emerald-900 text-gray-700 dark:text-gray-200 text-xs font-bold hover:bg-gray-50">Ver ficha</button>
                    <button type="button" data-agregar="${id}" title="Guardar en favoritos" aria-label="Guardar en favoritos" class="w-9 h-9 rounded-xl border border-gray-200 dark:border-emerald-900 text-gray-400 hover:text-red-500 hover:bg-red-50 flex items-center justify-center"><i class="ph ph-heart"></i></button>`}
                </div>
            </div>
        </article>`;
    }

    // ---------- Parecidos ----------
    function parecidos(favs) {
        if (!favs.length) return [];
        const idsFav = new Set(favs.map(f => String(f.id)));
        const base = seleccion.size ? favs.filter(f => seleccion.has(String(f.id))) : favs;
        const tipos = new Set(base.map(f => String(f.tipo || '').toLowerCase()));
        const ops = new Set(base.map(f => String(f.operacion || '').toLowerCase()));
        const zonas = new Set(base.map(sector).filter(Boolean));
        const precios = base.map(f => num(f.precio)).filter(n => n > 0);
        const out = [];
        Object.values(datos()).forEach(d => {
            if (!d || idsFav.has(String(d.id)) || !foto(d)) return;
            let puntos = 0;
            if (tipos.has(String(d.tipo || '').toLowerCase())) puntos += 3;
            if (ops.has(String(d.operacion || '').toLowerCase())) puntos += 2;
            if (zonas.has(sector(d))) puntos += 2;
            const p = num(d.precio);
            if (p > 0 && precios.some(b => Math.abs(p - b) / b <= 0.3)) puntos += 2;
            if (puntos >= 5) out.push({ d, puntos });
        });
        out.sort((a, b) => b.puntos - a.puntos || String(b.d.creadoEn || '').localeCompare(String(a.d.creadoEn || '')));
        return out.slice(0, 4).map(x => x.d);
    }

    // ---------- Vista ----------
    function pintar() {
        const lista = $('fav-lista');
        if (!lista) return;
        const favs = favoritosConDatos();
        // Quitar de la selección lo que ya no sea favorito
        [...seleccion].forEach(id => { if (!favs.some(f => String(f.id) === id)) seleccion.delete(id); });

        const cont = $('fav-contador');
        if (cont) cont.textContent = favs.length ? `${favs.length} guardado${favs.length === 1 ? '' : 's'}` : '';

        const vacio = $('fav-vacio'), conDatos = $('fav-con-datos');
        if (vacio) vacio.classList.toggle('hidden', favs.length > 0);
        if (conDatos) conDatos.classList.toggle('hidden', favs.length === 0);
        if (!favs.length) return;

        lista.innerHTML = favs.map(d => tarjeta(d, { favorito: true })).join('');

        const p = parecidos(favs);
        const secP = $('fav-parecidos-caja');
        if (secP) secP.classList.toggle('hidden', !p.length);
        const gridP = $('fav-parecidos');
        if (gridP) gridP.innerHTML = p.map(d => tarjeta(d, { favorito: false })).join('');

        actualizarBarra();
    }

    function actualizarBarra() {
        const barra = $('fav-barra');
        if (!barra) return;
        const n = seleccion.size;
        barra.classList.toggle('hidden', n === 0);
        const txt = $('fav-barra-texto');
        if (txt) txt.textContent = n === 1 ? 'Elige al menos uno más para comparar' : `${n} seleccionados`;
        const btn = $('fav-barra-comparar');
        if (btn) { btn.disabled = n < 2; btn.classList.toggle('opacity-50', n < 2); btn.classList.toggle('cursor-not-allowed', n < 2); }
    }

    function alternar(id, marcado) {
        id = String(id);
        if (marcado) {
            if (seleccion.size >= MAX_COMPARAR) {
                if (typeof mostrarToastNotificacion === 'function') mostrarToastNotificacion(`Puedes comparar hasta ${MAX_COMPARAR} inmuebles a la vez`);
                pintar();
                return;
            }
            seleccion.add(id);
        } else {
            seleccion.delete(id);
        }
        pintar();
    }

    // ---------- Comparación ----------
    function filaTabla(etiqueta, valores, { mejor } = {}) {
        // mejor: 'min' | 'max' sobre valores numéricos
        let idxMejor = -1;
        if (mejor) {
            const nums = valores.map(v => v.n);
            const validos = nums.filter(n => isFinite(n));
            if (validos.length >= 2 && new Set(validos).size > 1) {
                const objetivo = mejor === 'min' ? Math.min(...validos) : Math.max(...validos);
                idxMejor = nums.indexOf(objetivo);
            }
        }
        return `<tr class="border-t border-gray-100 dark:border-emerald-950/60">
            <th scope="row" class="sticky left-0 bg-white dark:bg-[#0A1F1B] text-left text-xs font-bold text-gray-500 dark:text-gray-400 px-3 py-3 whitespace-nowrap">${esc(etiqueta)}</th>
            ${valores.map((v, i) => `<td class="px-3 py-3 text-sm ${i === idxMejor ? 'font-extrabold text-emerald-700 dark:text-emerald-300 bg-emerald-50/70 dark:bg-emerald-950/40' : 'text-gray-800 dark:text-gray-100'} min-w-[160px]">${esc(v.t)}${i === idxMejor ? ' <span class="text-[10px] font-bold uppercase text-emerald-600">mejor</span>' : ''}</td>`).join('')}
        </tr>`;
    }

    function comparar() {
        const favs = favoritosConDatos().filter(f => seleccion.has(String(f.id)));
        if (favs.length < 2) return;
        cerrarComparacion();
        const v = (fn) => favs.map(fn);
        const cab = favs.map(d => `
            <th scope="col" class="px-3 pb-3 align-bottom min-w-[160px] text-left">
                <div class="aspect-[4/3] rounded-xl overflow-hidden bg-gray-100 dark:bg-[#0D2822] mb-2">${foto(d) ? `<img src="${esc(foto(d))}" alt="" class="w-full h-full object-cover">` : ''}</div>
                <p class="text-sm font-extrabold text-maximus-dark dark:text-white leading-snug line-clamp-2">${esc(d.titulo)}</p>
                <button type="button" data-ver="${esc(d.id)}" class="mt-2 h-8 px-3 rounded-lg bg-maximus-dark hover:bg-[#07362e] text-white text-xs font-bold">Ver ficha</button>
            </th>`).join('');
        const filas = [
            filaTabla('Precio', v(d => ({ t: d.precio || '—', n: num(d.precio) })), { mejor: 'min' }),
            filaTabla('Precio por m²', v(d => { const n = precioM2(d); return { t: usd(n), n }; }), { mejor: 'min' }),
            filaTabla('Operación', v(d => ({ t: d.operacion || '—', n: NaN }))),
            filaTabla('Tipo', v(d => ({ t: d.tipo || '—', n: NaN }))),
            filaTabla('Zona', v(d => ({ t: d.ubicacion || '—', n: NaN }))),
            filaTabla('Habitaciones', v(d => ({ t: d.habitaciones || '—', n: num(d.habitaciones) })), { mejor: 'max' }),
            filaTabla('Baños', v(d => ({ t: d.banos || '—', n: num(d.banos) })), { mejor: 'max' }),
            filaTabla('Superficie', v(d => ({ t: num(d.m2) > 0 ? m2Texto(d.m2) : 'N/D', n: num(d.m2) })), { mejor: 'max' }),
            filaTabla('Estacionamiento', v(d => ({ t: d.estacionamientos || '—', n: num(d.estacionamientos) })), { mejor: 'max' }),
            filaTabla('Código', v(d => ({ t: d.codigo || '—', n: NaN })))
        ].join('');

        const m = document.createElement('div');
        m.id = 'fav-modal';
        m.className = 'fixed inset-0 z-[400] flex items-end sm:items-center justify-center p-0 sm:p-4 bg-[#04110E]/70 backdrop-blur-sm';
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        m.innerHTML = `
            <div class="w-full max-w-4xl max-h-[92vh] overflow-hidden flex flex-col rounded-t-3xl sm:rounded-3xl bg-white dark:bg-[#0A1F1B] shadow-2xl">
                <div class="flex items-center justify-between gap-3 p-4 sm:p-5 border-b border-gray-100 dark:border-emerald-950/60">
                    <div>
                        <h2 class="text-lg font-extrabold text-maximus-dark dark:text-white">Comparar inmuebles</h2>
                        <p class="text-xs text-gray-500 dark:text-gray-400">Lo mejor de cada fila aparece resaltado en verde.</p>
                    </div>
                    <button type="button" data-cerrar aria-label="Cerrar" class="w-9 h-9 rounded-xl bg-gray-100 dark:bg-[#0D2822] text-gray-500 hover:text-gray-800 flex items-center justify-center"><i class="ph-bold ph-x"></i></button>
                </div>
                <div class="overflow-auto p-2 sm:p-4">
                    <table class="w-full border-collapse">
                        <thead><tr><th class="sticky left-0 bg-white dark:bg-[#0A1F1B] w-24"></th>${cab}</tr></thead>
                        <tbody>${filas}</tbody>
                    </table>
                </div>
            </div>`;
        m.addEventListener('click', (e) => {
            if (e.target === m || e.target.closest('[data-cerrar]')) return cerrarComparacion();
            const ver = e.target.closest('[data-ver]');
            if (ver) { cerrarComparacion(); abrirFicha(ver.getAttribute('data-ver')); }
        });
        document.addEventListener('keydown', teclaEsc);
        document.body.appendChild(m);
    }

    function teclaEsc(e) { if (e.key === 'Escape') cerrarComparacion(); }
    function cerrarComparacion() {
        const m = $('fav-modal');
        if (m) m.remove();
        document.removeEventListener('keydown', teclaEsc);
    }

    function abrirFicha(id) {
        if (typeof abrirDetalleInmuebleAirbnb === 'function') abrirDetalleInmuebleAirbnb(id, 'view-favoritos');
    }

    // ---------- Eventos ----------
    function enlazar() {
        const vista = $('view-favoritos');
        if (!vista || vista._enlazada) return;
        vista._enlazada = true;
        vista.addEventListener('click', (e) => {
            const ver = e.target.closest('[data-ver]');
            if (ver) return abrirFicha(ver.getAttribute('data-ver'));
            const quitar = e.target.closest('[data-quitar]');
            if (quitar) {
                const id = quitar.getAttribute('data-quitar');
                seleccion.delete(String(id));
                if (typeof toggleFavoritoDashboard === 'function') toggleFavoritoDashboard(id, quitar);
                return pintar();
            }
            const agregar = e.target.closest('[data-agregar]');
            if (agregar) {
                if (typeof toggleFavoritoDashboard === 'function') toggleFavoritoDashboard(agregar.getAttribute('data-agregar'), agregar);
                return pintar();
            }
            if (e.target.closest('#fav-barra-comparar')) return comparar();
            if (e.target.closest('#fav-barra-limpiar')) { seleccion.clear(); return pintar(); }
        });
        vista.addEventListener('change', (e) => {
            const chk = e.target.closest('[data-comparar]');
            if (chk) alternar(chk.getAttribute('data-comparar'), chk.checked);
        });
    }

    function cargar() {
        enlazar();
        pintar();
    }

    window.FavoritosComparador = { cargar, comparar, cerrarComparacion };
})();
