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

    // Cuentas de demostración de fábrica (no son personas reales del equipo)
    const CORREOS_DEMO = ['admin@maximus.com', 'asesor.maximus@maximus.com', 'asesor.externo@maximus.com',
        'agente@maximus.com', 'cliente@maximus.com', 'usuario@maximus.com', 'usuario.google@gmail.com'];

    function esCuentaDemo(u) {
        if (!u) return false;
        return !!(u._cuentaDemo || CORREOS_DEMO.includes(String(u.email || '').toLowerCase().trim()) || /^(mock-|google-usr-)/.test(String(u.id || '')));
    }

    // Cuenta real que, en localhost, entró con la copia local porque Supabase la rechazó
    function entroSinSupabase(u) {
        return !!(u && !esCuentaDemo(u) && (u._demo || u.id === 'asesor-miguel-durantt'));
    }

    const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    // El motivo que devolvió Supabase, dicho en palabras de todos los días
    function explicarMotivo(motivo) {
        const m = String(motivo || '');
        if (!m) return 'Cierra sesión y vuelve a entrar para ver el motivo exacto.';
        if (/not confirmed/i.test(m)) return 'Supabase dice que <b>el correo aún no está confirmado</b>. Confírmalo desde el correo de bienvenida o en Supabase → Authentication → Users.';
        if (/invalid login credentials|credenciales inv/i.test(m)) return 'Supabase <b>no reconoce ese correo con esa contraseña</b>: la cuenta no existe en Supabase Auth o allí tiene otra contraseña.';
        if (/sin respuesta|conexi|fetch|network/i.test(m)) return 'No hubo respuesta de Supabase al iniciar sesión (conexión).';
        return 'Supabase respondió: «' + esc(m) + '».';
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

    // tipo: 'demo' | 'local' (cuenta real que entró sin Supabase) | 'vencida'
    function pintar(u, tipo) {
        if (document.getElementById('aviso-sesion-demo')) return;
        const main = document.querySelector('main');
        if (!main) return;
        const nombre = esc((u && (u.name || u.nombre)) || '');
        const textos = {
            demo: `<b>Estás en una cuenta de demostración${nombre ? ' (' + nombre + ')' : ''}.</b> Sirve para recorrer el panel, pero no está conectada a la base de datos: no ves los clientes reales y lo que guardes no aparecerá aquí. Para trabajar de verdad, entra con tu cuenta de asesor.`,
            local: `<b>${nombre || 'Esta cuenta'} entró sin conectarse a la base de datos</b> (modo local de pruebas): no ves los clientes reales y lo que guardes no aparecerá aquí. ${explicarMotivo(u && u._motivoLocal)}`,
            vencida: `<b>Tu sesión con la base de datos venció.</b> El panel no puede leer ni guardar datos reales hasta que vuelvas a iniciar sesión.`
        };
        const texto = textos[tipo] || textos.vencida;
        const caja = document.createElement('div');
        caja.id = 'aviso-sesion-demo';
        caja.setAttribute('role', 'status');
        caja.className = 'max-w-[1400px] mx-auto mb-4 flex flex-col sm:flex-row sm:items-center gap-3 rounded-2xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950/30 px-4 py-3 text-sm text-amber-900 dark:text-amber-100';
        caja.innerHTML = `
            <i class="ph-fill ph-warning text-xl text-amber-500 shrink-0 hidden sm:block"></i>
            <p class="flex-1 leading-snug">${texto}</p>
            <div class="flex items-center gap-2 shrink-0">
                <button type="button" data-aviso-entrar class="h-9 px-4 rounded-xl bg-maximus-dark hover:bg-[#07362e] text-white text-xs font-bold cursor-pointer">${tipo === 'demo' ? 'Entrar con mi cuenta' : 'Volver a iniciar sesión'}</button>
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
        if (esCuentaDemo(u)) return pintar(u, 'demo');
        if (entroSinSupabase(u)) return pintar(u, 'local');
        if (!(await tieneSesionSupabase())) pintar(u, 'vencida');
    }

    window.AvisoDemo = { revisar, esCuentaDemo, entroSinSupabase, explicarMotivo };
    const iniciar = () => setTimeout(revisar, 1200);   // después de que auth.js restaure la sesión
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', iniciar);
    else iniciar();
})();
