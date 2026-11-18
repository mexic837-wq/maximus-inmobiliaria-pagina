/**
 * ====================================================================
 * MAXIMUS INMOBILIARIA - Límite de inmuebles por plan (panel)
 * ====================================================================
 *   Bronce: 3 · Gold: 7 · Platinum: ilimitado  (APP_CONFIG.LIMITE_INMUEBLES_POR_PLAN)
 *
 * Solo aplica a asesores externos con plan de pago. Administración y equipo
 * MAXIMUS no tienen límite. Este archivo avisa y evita el trámite inútil;
 * quien realmente lo hace valer es la base de datos
 * (sql/migration-limite-inmuebles.sql), así que no se puede saltar desde el navegador.
 *
 * Uso:  const info = await LimitesInmuebles.verificar();
 *       if (!info.permitido) LimitesInmuebles.mostrarAviso(info);
 */
(function () {
    'use strict';

    const NOMBRES = { pro: 'Bronce', gold: 'Gold', platinum: 'Platinum' };
    const SIGUIENTE = { pro: 'gold', gold: 'platinum' };

    function usuarioActual() {
        try {
            const u = (typeof AuthService !== 'undefined' && AuthService.getCurrentUser && AuthService.getCurrentUser())
                || JSON.parse(localStorage.getItem('maximus_user') || 'null');
            return u || null;
        } catch (_) { return null; }
    }

    function planDe(u) {
        const p = String((u && u.plan) || '').toLowerCase();
        return (p === 'gold' || p === 'platinum') ? p : 'pro';
    }

    // null = ilimitado
    function limiteDe(u) {
        const rol = String((u && (u.role || u.rol)) || '').toLowerCase();
        if (rol !== 'asesor_externo') return null; // admin y equipo MAXIMUS
        const tabla = (window.APP_CONFIG && APP_CONFIG.LIMITE_INMUEBLES_POR_PLAN) || { pro: 3, gold: 7, platinum: null };
        const v = tabla[planDe(u)];
        return v == null ? null : Number(v);
    }

    async function contar(u) {
        if (!u || !u.id) return 0;
        try {
            const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
            if (!sb) return 0;
            const { count, error } = await sb.from('inmuebles')
                .select('id', { count: 'exact', head: true })
                .eq('asesor_id', String(u.id))
                .in('estatus', ['disponible', 'reservado']);
            if (error) throw error;
            return count || 0;
        } catch (e) {
            console.warn('Límite de inmuebles: no se pudo contar (la base de datos igual lo valida).', e);
            return 0;
        }
    }

    async function verificar() {
        const u = usuarioActual();
        const limite = limiteDe(u);
        const plan = planDe(u);
        if (limite === null) return { permitido: true, ilimitado: true, usados: 0, limite: null, plan };
        const usados = await contar(u);
        return { permitido: usados < limite, ilimitado: false, usados, limite, plan, restantes: Math.max(0, limite - usados) };
    }

    function texto(info) {
        const sig = SIGUIENTE[info.plan];
        const planes = (window.APP_CONFIG && APP_CONFIG.PLANES_SUSCRIPCION) || {};
        const sigPlan = sig && Object.values(planes).find(p => p.id === sig);
        const tabla = (window.APP_CONFIG && APP_CONFIG.LIMITE_INMUEBLES_POR_PLAN) || {};
        const sigLimite = sig ? tabla[sig] : null;
        return {
            sig,
            sigNombre: sig ? NOMBRES[sig] : '',
            sigPrecio: sigPlan ? '$' + Number(sigPlan.precio_usd).toFixed(2) : '',
            sigBeneficio: sig ? (sigLimite == null ? 'inmuebles ilimitados' : 'hasta ' + sigLimite + ' inmuebles') : ''
        };
    }

    function cerrarAviso() {
        const m = document.getElementById('modal-limite-inmuebles');
        if (!m) return;
        m.classList.add('opacity-0', 'pointer-events-none');
        setTimeout(() => m.remove(), 250);
    }

    function mostrarAviso(info) {
        cerrarAviso();
        const t = texto(info);
        const nombre = NOMBRES[info.plan] || 'Bronce';
        const m = document.createElement('div');
        m.id = 'modal-limite-inmuebles';
        m.className = 'fixed inset-0 z-[300] flex items-center justify-center p-4 bg-[#04110E]/70 backdrop-blur-sm opacity-0 transition-opacity duration-200';
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        m.innerHTML = `
            <div class="w-full max-w-sm rounded-3xl bg-white dark:bg-[#0A1F1B] shadow-2xl overflow-hidden scale-95 transition-transform duration-200" data-panel>
                <div class="px-6 pt-7 pb-5 text-center bg-gradient-to-b from-amber-50 to-white dark:from-[#102A23] dark:to-[#0A1F1B]">
                    <div class="w-14 h-14 mx-auto rounded-2xl bg-amber-100 text-amber-600 flex items-center justify-center text-3xl"><i class="ph-fill ph-buildings"></i></div>
                    <h3 class="mt-4 text-lg font-extrabold text-gray-900 dark:text-white">Llegaste a tu límite de inmuebles</h3>
                    <p class="mt-1.5 text-sm text-gray-500 dark:text-gray-300 leading-relaxed">Tu plan <strong>${nombre}</strong> permite hasta <strong>${info.limite}</strong> inmuebles publicados y ya tienes <strong>${info.usados}</strong>.</p>
                    <div class="mt-4 h-2 rounded-full bg-gray-100 dark:bg-white/10 overflow-hidden"><div class="h-full w-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500"></div></div>
                </div>
                <div class="px-6 pb-6 space-y-2.5">
                    ${t.sig ? `<button type="button" data-mejorar class="w-full h-12 rounded-2xl bg-gradient-to-r from-maximus-dark to-[#0E6352] hover:opacity-95 text-white font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg cursor-pointer"><i class="ph-bold ph-rocket-launch"></i> Mejorar a ${t.sigNombre} · ${t.sigPrecio}/mes</button>
                    <p class="text-center text-xs text-gray-500 dark:text-gray-400">Con ${t.sigNombre} puedes publicar ${t.sigBeneficio}.</p>` : ''}
                    <p class="text-center text-xs text-gray-500 dark:text-gray-400">También puedes marcar como vendido o eliminar un inmueble para liberar un espacio.</p>
                    <button type="button" data-cerrar class="w-full h-10 rounded-2xl text-sm font-semibold text-gray-500 hover:bg-gray-50 dark:hover:bg-white/5 cursor-pointer">Ahora no</button>
                </div>
            </div>`;
        document.body.appendChild(m);
        requestAnimationFrame(() => { m.classList.remove('opacity-0'); m.querySelector('[data-panel]').classList.remove('scale-95'); });
        m.addEventListener('click', (e) => {
            if (e.target === m || e.target.closest('[data-cerrar]')) cerrarAviso();
            if (e.target.closest('[data-mejorar]')) {
                cerrarAviso();
                if (typeof window.abrirModalSuscripcionPro === 'function') window.abrirModalSuscripcionPro(t.sig);
            }
        });
    }

    // Texto corto para el formulario: "Has publicado 2 de 3 inmuebles"
    async function pintarContador() {
        const el = document.getElementById('contador-limite-inmuebles');
        if (!el) return;
        const info = await verificar();
        if (info.ilimitado) { el.classList.add('hidden'); return; }
        el.classList.remove('hidden');
        const pct = Math.min(100, Math.round(info.usados / info.limite * 100));
        el.querySelector('[data-texto]').textContent = `Has publicado ${info.usados} de ${info.limite} inmuebles (plan ${NOMBRES[info.plan]})`;
        const barra = el.querySelector('[data-barra]');
        barra.style.width = pct + '%';
        barra.className = 'h-full rounded-full transition-all duration-500 ' + (pct >= 100 ? 'bg-amber-500' : 'bg-emerald-500');
    }

    // ¿El error de Supabase viene del límite?
    function esErrorDeLimite(err) {
        return !!(err && /LIMITE_INMUEBLES/.test(String(err.message || err.details || err)));
    }

    window.LimitesInmuebles = { verificar, mostrarAviso, cerrarAviso, pintarContador, esErrorDeLimite, limiteDe, usuarioActual };
})();
