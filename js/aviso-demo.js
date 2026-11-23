/**
 * MAXIMUS · Aviso de "sesión sin datos reales" en el panel.
 *
 * Las cuentas de demostración (admin@maximus.com, asesor.maximus@maximus.com…) solo existen en
 * localhost y no inician sesión en Supabase. Para la base de datos son visitantes anónimos:
 * pueden crear leads (como los formularios de la web), pero no leer nada. El panel se veía vacío
 * y parecía que guardar no funcionaba. Este aviso lo explica arriba de cada sección.
 * También sale si una cuenta real perdió su sesión de Supabase (venció).
 */
(function () {
    'use strict';
    const CLAVE_OCULTO = 'maximus_aviso_demo_oculto';

    function usuarioActual() {
        try {
            if (window.AuthService && typeof AuthService.getCurrentUser === 'function') return AuthService.getCurrentUser();
        } catch (_) {}
        return null;
    }

    function esCuentaDemo(u) {
        return !!(u && (u._demo || /^(mock-|google-usr-)/.test(String(u.id || '')) || u.id === 'asesor-miguel-durantt'));
    }

    async function tieneSesionSupabase() {
        try {
            const sb = typeof getSupabase === 'function' ? getSupabase() : null;
            if (!sb || !sb.auth) return true;                 // sin cliente no se puede saber: no molestar
            const r = await sb.auth.getSession();
            return !!(r && r.data && r.data.session);
        } catch (_) {
            return true;
        }
    }

    function pintar(u, demo) {
        if (document.getElementById('aviso-sesion-demo')) return;
        const main = document.querySelector('main');
        if (!main) return;
        const nombre = String((u && (u.name || u.nombre)) || '').replace(/</g, '&lt;');
        const texto = demo
            ? `<b>Estás en una cuenta de demostración${nombre ? ' (' + nombre + ')' : ''}.</b> Sirve para recorrer el panel, pero no está conectada a la base de datos: no ves los clientes reales y lo que guardes no aparecerá aquí. Para trabajar de verdad, entra con tu cuenta de asesor.`
            : `<b>Tu sesión con la base de datos venció.</b> El panel no puede leer ni guardar datos reales hasta que vuelvas a iniciar sesión.`;
        const caja = document.createElement('div');
        caja.id = 'aviso-sesion-demo';
        caja.setAttribute('role', 'status');
        caja.className = 'max-w-[1400px] mx-auto mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100';
        caja.innerHTML = `
            <i class="ph-fill ph-warning text-xl text-amber-500 shrink-0 hidden sm:block"></i>
            <p class="flex-1 leading-snug">${texto}</p>
            <div class="flex items-center gap-2 shrink-0">
                <button type="button" data-aviso-entrar class="h-9 px-4 rounded-xl bg-maximus-dark hover:bg-[#07362e] text-white text-xs font-bold cursor-pointer">Entrar con mi cuenta</button>
                <button type="button" data-aviso-cerrar class="h-9 w-9 rounded-xl text-amber-700 dark:text-amber-200 hover:bg-amber-100 dark:hover:bg-amber-900/40 flex items-center justify-center cursor-pointer" title="Ocultar por ahora" aria-label="Ocultar aviso"><i class="ph-bold ph-x"></i></button>
            </div>`;
        caja.addEventListener('click', (e) => {
            if (e.target.closest('[data-aviso-entrar]')) {
                if (typeof logout === 'function') logout(); else location.href = '/login';
            }
            if (e.target.closest('[data-aviso-cerrar]')) {
                try { sessionStorage.setItem(CLAVE_OCULTO, '1'); } catch (_) {}
                caja.remove();
            }
        });
        main.insertBefore(caja, main.firstElementChild);
    }

    async function revisar() {
        if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.USE_MOCK_DATA) return;   // modo maqueta: todo es local
        try { if (sessionStorage.getItem(CLAVE_OCULTO) === '1') return; } catch (_) {}
        const u = usuarioActual();
        if (!u) return;
        const demo = esCuentaDemo(u);
        if (demo) return pintar(u, true);
        if (!(await tieneSesionSupabase())) pintar(u, false);
    }

    window.AvisoDemo = { revisar, esCuentaDemo };
    const iniciar = () => setTimeout(revisar, 1200);   // después de que auth.js restaure la sesión
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
