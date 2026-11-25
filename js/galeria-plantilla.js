/**
 * MAXIMUS · Galería del detalle del inmueble con la portada "plantilla".
 *
 * La portada editorial (16:10) trae impresos el título, los datos y el precio. El mosaico del
 * detalle tiene una altura fija y un hueco muy ancho para la foto principal, así que la
 * recortaba y se perdía el precio. Aquí, si la primera foto tiene la proporción de la
 * plantilla, el mosaico se rearma para mostrarla completa:
 *
 *   Escritorio: la portada a la izquierda (sin recortar) y el resto de fotos al lado.
 *   Celular:    la portada a todo el ancho y debajo una fila de miniaturas.
 *
 * Si la primera foto NO es la plantilla (una foto normal), no se toca nada.
 *
 *   GaleriaPlantilla.preparar(contenedor, imagenPrincipal, totalFotos)
 *
 * Todo se aplica con estilos en línea (!important) para ganarle a las reglas del panel.
 */
(function () {
    'use strict';

    const RATIO = 1.6;      // 16:10
    const TOLERANCIA = 0.06;
    const mq = window.matchMedia ? window.matchMedia('(min-width: 768px)') : { matches: true, addEventListener() {} };

    const activos = new Set();      // contenedores con la plantilla activa
    const datos = new WeakMap();    // contenedor -> { n, w }
    const observadores = new WeakMap();
    let contador = 0;

    const imp = (el, prop, val) => el.style.setProperty(prop, val, 'important');
    const tiles = (c) => Array.from(c.children).filter(t => t.tagName === 'DIV' && t.querySelector('img'));

    // Quita solo lo que puso este módulo (los estilos !important); el display normal lo maneja cada página
    function limpiar(c) {
        activos.delete(c);
        datos.delete(c);
        c.classList.remove('galeria-plantilla');
        ['grid-template-columns', 'grid-template-rows', 'height', 'max-width'].forEach(p => {
            if (c.style.getPropertyPriority(p) === 'important') c.style.removeProperty(p);
        });
        tiles(c).forEach(t => {
            ['grid-column', 'grid-row', 'display'].forEach(p => {
                if (t.style.getPropertyPriority(p) === 'important') t.style.removeProperty(p);
            });
        });
    }

    function aplicar(c) {
        const d = datos.get(c);
        if (!d) return;
        const n = d.n;
        const W = c.clientWidth;
        d.w = W;
        if (W < 60) return;                       // todavía oculto: el observador lo reintenta al mostrarse

        const t = tiles(c);
        const escritorio = mq.matches;
        const gap = escritorio ? 8 : 6;

        if (escritorio) {
            const planes = {
                1: { cols: '1fr', f: 1 },
                2: { cols: '1fr 1fr', f: 0.5 },
                3: { cols: '5fr 4fr', f: 5 / 9 },
                4: { cols: '5fr 2fr 2fr', f: 5 / 9 },
                5: { cols: '5fr 2.5fr 2.5fr', f: 0.5 }
            };
            const plan = planes[Math.min(Math.max(n, 1), 5)];
            const ncols = plan.cols.split(' ').length;
            const anchoPortada = (W - gap * (ncols - 1)) * plan.f;
            const alto = Math.round(anchoPortada / RATIO);

            imp(c, 'grid-template-columns', plan.cols);
            imp(c, 'grid-template-rows', 'minmax(0, 1fr) minmax(0, 1fr)');
            imp(c, 'height', alto + 'px');
            if (n <= 1) imp(c, 'max-width', '640px');

            const sitio = (i, col, fila) => { imp(t[i], 'grid-column', col); imp(t[i], 'grid-row', fila); };
            sitio(0, '1', '1 / span 2');
            if (n === 2) sitio(1, '2', '1 / span 2');
            else if (n === 3) { sitio(1, '2', '1'); sitio(2, '2', '2'); }
            else if (n === 4) { sitio(1, '2', '1'); sitio(2, '3', '1'); sitio(3, '2 / span 2', '2'); }
            else if (n >= 5) { sitio(1, '2', '1'); sitio(2, '3', '1'); sitio(3, '2', '2'); sitio(4, '3', '2'); }
            t.forEach((el, i) => { if (i >= Math.min(n, 5)) imp(el, 'display', 'none'); });
        } else {
            const m = Math.max(1, Math.min(n - 1, 3));          // miniaturas debajo (máximo 3)
            const altoPortada = Math.round(W / RATIO);
            const anchoMini = (W - gap * (m - 1)) / m;
            const altoMini = Math.round(anchoMini * 0.62);

            if (n <= 1) {
                imp(c, 'grid-template-columns', '1fr');
                imp(c, 'grid-template-rows', altoPortada + 'px');
                imp(c, 'height', altoPortada + 'px');
            } else {
                imp(c, 'grid-template-columns', `repeat(${m}, minmax(0, 1fr))`);
                imp(c, 'grid-template-rows', `${altoPortada}px ${altoMini}px`);
                imp(c, 'height', (altoPortada + gap + altoMini) + 'px');
            }
            imp(t[0], 'grid-column', '1 / -1');
            imp(t[0], 'grid-row', '1');
            for (let i = 1; i <= m && t[i]; i++) { imp(t[i], 'grid-column', String(i)); imp(t[i], 'grid-row', '2'); }
            t.forEach((el, i) => { if (i > m || i >= n) imp(el, 'display', 'none'); });
        }
    }

    function observar(c) {
        if (observadores.has(c) || typeof ResizeObserver === 'undefined') return;
        const ro = new ResizeObserver(() => {
            const d = datos.get(c);
            if (d && Math.abs(c.clientWidth - d.w) > 1) aplicar(c);
        });
        ro.observe(c);
        observadores.set(c, ro);
    }

    function preparar(contenedor, imagen, total) {
        if (!contenedor || !imagen) return;
        limpiar(contenedor);
        const marca = String(++contador);
        contenedor.dataset.gpMarca = marca;
        const n = Math.max(1, Math.min(Number(total) || 1, 5));

        const evaluar = () => {
            if (contenedor.dataset.gpMarca !== marca) return;       // llegó tarde: ya se abrió otro inmueble
            const w = imagen.naturalWidth, h = imagen.naturalHeight;
            if (!w || !h || Math.abs(w / h - RATIO) > TOLERANCIA) return;
            contenedor.classList.add('galeria-plantilla');
            datos.set(contenedor, { n, w: 0 });
            activos.add(contenedor);
            observar(contenedor);
            aplicar(contenedor);
        };
        imagen.addEventListener('load', evaluar, { once: true });
        requestAnimationFrame(() => { if (imagen.complete && imagen.naturalWidth) evaluar(); });
    }

    if (mq.addEventListener) mq.addEventListener('change', () => activos.forEach(aplicar));

    window.GaleriaPlantilla = { preparar };
})();
