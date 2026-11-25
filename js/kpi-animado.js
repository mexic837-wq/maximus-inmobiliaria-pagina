/**
 * MAXIMUS · Números de los indicadores (KPI) del panel: carga animada.
 *
 * El HTML trae números de ejemplo escritos a mano (45, 32, 13…) que se veían un instante
 * hasta que llegaban los datos reales. Ahora cada indicador marcado con data-kpi-estado
 * arranca con una barra de carga (sin mostrar el número de ejemplo) y, cuando la página
 * escribe el dato real, el número sube contando desde cero.
 *
 *   <h3 id="kpi-total" data-kpi-estado="cargando" data-kpi-ph="45">45</h3>
 *
 *   · No hace falta cambiar el código que escribe los números: se detecta el cambio solo.
 *   · Si después el dato cambia (se actualiza en vivo), el número se desliza al nuevo valor.
 *   · Si un indicador visible no recibe datos en ~4 s, se muestra tal cual (sin quedarse cargando).
 *   · Con «reducir movimiento» activado en el sistema no hay animación, solo el número.
 */
(function () {
    'use strict';

    const ESPERA_MAX_MS = 4000;
    const DURACION_PRIMERA = 1000;
    const DURACION_CAMBIO = 600;
    const reducirMovimiento = !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);

    const visible = (el) => el.getClientRects().length > 0;
    const ease = (p) => 1 - Math.pow(1 - p, 3);

    // Separa «prefijo + número + sufijo» y recuerda cómo estaba escrito el número ($1,200 · 1.234,5 · 35%…)
    function analizar(texto) {
        const m = /(-?\d[\d.,]*)/.exec(String(texto));
        if (!m) return null;
        const ns = m[1].replace(/[.,]+$/, '');
        let miles = '', decSep = '', entero = ns, dec = '';
        if (/^\d{1,3}(,\d{3})+(\.\d+)?$/.test(ns)) { miles = ','; decSep = '.'; [entero, dec = ''] = ns.split('.'); }
        else if (/^\d{1,3}(\.\d{3})+(,\d+)?$/.test(ns)) { miles = '.'; decSep = ','; [entero, dec = ''] = ns.split(','); }
        else if (/^\d+[.,]\d+$/.test(ns)) { decSep = ns.includes(',') ? ',' : '.'; [entero, dec = ''] = ns.split(decSep); }
        const limpio = entero.replace(/[.,]/g, '') + (dec ? '.' + dec : '');
        const valor = parseFloat(limpio);
        if (!isFinite(valor)) return null;
        return {
            valor, miles, decSep, decimales: dec.length,
            prefijo: String(texto).slice(0, m.index),
            sufijo: String(texto).slice(m.index + m[1].length)
        };
    }

    function formatear(v, a) {
        const fijo = Math.abs(v).toFixed(a.decimales);
        let [ent, dec = ''] = fijo.split('.');
        if (a.miles) ent = ent.replace(/\B(?=(\d{3})+(?!\d))/g, a.miles);
        return (v < 0 ? '-' : '') + ent + (dec ? a.decSep + dec : '');
    }

    function escribir(el, texto) {
        el._kpiUltimo = texto;
        el.textContent = texto;
    }

    function marcarListo(el) {
        if (el.getAttribute('data-kpi-estado') !== 'listo') el.setAttribute('data-kpi-estado', 'listo');
    }

    function cancelar(el) {
        if (el._kpiRaf) { cancelAnimationFrame(el._kpiRaf); el._kpiRaf = null; }
    }

    // Llegó un dato (texto final): se anima desde el valor que se estaba mostrando
    function aplicar(el, texto) {
        cancelar(el);
        const eraCargando = el.getAttribute('data-kpi-estado') === 'cargando';
        const a = analizar(texto);
        if (!a || reducirMovimiento || !visible(el)) {
            escribir(el, texto); el._kpiValor = a ? a.valor : null; marcarListo(el);
            return;
        }
        const desde = eraCargando ? 0 : (typeof el._kpiValor === 'number' ? el._kpiValor : 0);
        const hasta = a.valor;
        el._kpiValor = hasta;
        if (desde === hasta && !eraCargando) { escribir(el, texto); return; }

        escribir(el, a.prefijo + formatear(desde, a) + a.sufijo);
        marcarListo(el);
        const dur = eraCargando ? DURACION_PRIMERA : DURACION_CAMBIO;
        const t0 = performance.now();
        const paso = (t) => {
            const p = Math.min(1, (t - t0) / dur);
            if (p >= 1) { escribir(el, texto); el._kpiRaf = null; return; }
            escribir(el, a.prefijo + formatear(desde + (hasta - desde) * ease(p), a) + a.sufijo);
            el._kpiRaf = requestAnimationFrame(paso);
        };
        el._kpiRaf = requestAnimationFrame(paso);
    }

    function iniciar() {
        const lista = Array.from(document.querySelectorAll('[data-kpi-estado]'));
        if (!lista.length) return;

        const obs = new MutationObserver((cambios) => {
            const vistos = new Set();
            cambios.forEach(c => {
                let el = c.target.nodeType === 1 ? c.target : c.target.parentElement;
                while (el && !el.hasAttribute('data-kpi-estado')) el = el.parentElement;
                if (el) vistos.add(el);
            });
            vistos.forEach(el => {
                const t = el.textContent;
                if (t === el._kpiUltimo) return;           // lo escribimos nosotros (animación)
                aplicar(el, t);
            });
        });

        lista.forEach(el => {
            el._kpiUltimo = el.textContent;
            const ph = el.getAttribute('data-kpi-ph');
            // Si la página ya escribió el dato real antes de que cargara este archivo, se anima ahora
            if (ph !== null && el.textContent !== ph) aplicar(el, el.textContent);
            obs.observe(el, { childList: true, characterData: true, subtree: true });
        });

        // Un indicador visible que nunca recibe dato no se queda cargando para siempre
        const reloj = setInterval(() => {
            const ahora = Date.now();
            let pendientes = 0;
            lista.forEach(el => {
                if (el.getAttribute('data-kpi-estado') !== 'cargando') return;
                pendientes++;
                if (!visible(el)) { el._kpiDesde = null; return; }
                if (!el._kpiDesde) el._kpiDesde = ahora;
                if (ahora - el._kpiDesde > ESPERA_MAX_MS) marcarListo(el);
            });
            if (!pendientes && !document.querySelector('[data-kpi-estado="cargando"]')) clearInterval(reloj);
        }, 1000);
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();

    window.KpiAnimado = { aplicar };
})();
