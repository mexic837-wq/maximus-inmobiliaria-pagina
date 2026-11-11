/**
 * ====================================================================
 * MAXIMUS INMOBILIARIA - Pagos de suscripción Asesor Pro (US$ 4.99/mes)
 * ====================================================================
 * Métodos: Pago Móvil (Bs, tasa BCV) · Binance Pay (USDT) · Stripe (tarjetas)
 *
 * SEGURIDAD: este archivo NUNCA activa un plan. Solo pide al servidor crear el
 * pago (Edge Function "pagos"), muestra instrucciones y espera a que el servidor
 * confirme (Stripe webhook / n8n / binance-sync). El rol sube únicamente en la DB.
 *
 * Flujo del modal:  1 Cuenta → 2 Método → 3 Pagar → 4 Verificando/Activo
 */

const PaymentGatewayService = {

    getPlanes() {
        if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.PLANES_SUSCRIPCION) return APP_CONFIG.PLANES_SUSCRIPCION;
        return { MENSUAL: { id: 'mensual', nombre: 'Plan Mensual Pro', precio_usd: 4.99, periodo_label: '/mes' } };
    },

    getPlan(id) {
        const planes = this.getPlanes();
        return Object.values(planes).find(p => p.id === id) || planes.MENSUAL;
    },

    getMetodosPago() {
        return (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DATOS_PAGO_VENEZUELA)
            ? APP_CONFIG.DATOS_PAGO_VENEZUELA.METODOS : {};
    },

    formatUsd(n) { return '$' + Number(n).toFixed(2); },
    formatBs(n) { return Number(n).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 }); },

    async getUsuarioActual() {
        try {
            if (typeof AuthService !== 'undefined') {
                const u = AuthService.getCurrentUser();
                if (u) return u;
            }
            return JSON.parse(localStorage.getItem('maximus_user'));
        } catch (_) { return null; }
    },

    _sb() {
        const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
        if (!sb) throw new Error('El servicio de pagos no está disponible en este momento.');
        return sb;
    },

    // Llama a la Edge Function "pagos" con el JWT del usuario (lo adjunta supabase-js)
    async _invocar(body) {
        const { data, error } = await this._sb().functions.invoke('pagos', { body });
        if (error) {
            let msg = 'No se pudo procesar el pago. Intenta de nuevo.';
            try { const j = await error.context.json(); if (j && j.error) msg = j.error; } catch (_) {}
            throw new Error(msg);
        }
        return data;
    },

    async crearPago(planId, metodo) {
        const r = await this._invocar({ action: 'crear', plan_id: planId, metodo });
        return r; // { pago, checkout_url? }
    },

    async reportarReferencia(pagoId, referencia) {
        const r = await this._invocar({ action: 'reportar', pago_id: pagoId, referencia });
        return r.pago;
    },

    // Consulta el estado (RLS: solo ve sus propios pagos)
    async estadoPago(pagoId) {
        const { data } = await this._sb().from('pagos_suscripcion').select('estado').eq('id', pagoId).maybeSingle();
        return data ? data.estado : null;
    },

    // Espera la aprobación (la hace el servidor). Devuelve 'aprobado' | 'rechazado' | 'expirado' | 'timeout'
    async esperarAprobacion(pagoId, { intervaloMs = 5000, maxMs = 15 * 60 * 1000, cancelado = () => false } = {}) {
        const inicio = Date.now();
        while (Date.now() - inicio < maxMs && !cancelado()) {
            try {
                const estado = await this.estadoPago(pagoId);
                if (estado === 'aprobado' || estado === 'rechazado' || estado === 'expirado') return estado;
            } catch (_) { /* red intermitente: reintenta */ }
            await new Promise(r => setTimeout(r, intervaloMs));
        }
        return 'timeout';
    },

    // Trae rol/plan reales desde la DB (ya subidos por el servidor) y refresca la sesión local
    async refrescarPerfil() {
        try {
            const u = await this.getUsuarioActual();
            if (!u || !u.id) return;
            const { data } = await this._sb().from('usuarios')
                .select('rol, plan, plan_vence_at, titulo').eq('auth_id', u.id).maybeSingle();
            if (!data) return;
            u.role = data.rol; u.plan = data.plan; u.plan_vence_at = data.plan_vence_at; u.title = data.titulo;
            const s = JSON.stringify(u);
            localStorage.setItem('maximus_user', s);
            sessionStorage.setItem('maximus_user', s);
        } catch (_) {}
    },

    obtenerEnlaceWhatsAppConciliacion(pago, referencia) {
        const tel = ((typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DATOS_PAGO_VENEZUELA?.WHATSAPP_CONCILIACION) || '584247835697').replace(/[^0-9]/g, '');
        const texto = `Hola equipo MAXIMUS, hice el pago de mi membresía Asesor Pro y aún no se activa.\n\n` +
                      `Código: ${pago.codigo}\nMétodo: ${pago.metodo}\nReferencia: ${referencia || 'N/A'}\n` +
                      `Monto: ${this.formatUsd(pago.monto_usd)}${pago.monto_local ? ' (Bs. ' + this.formatBs(pago.monto_local) + ')' : ''}\n\nAdjunto mi comprobante.`;
        return `https://wa.me/${tel}?text=${encodeURIComponent(texto)}`;
    }
};

if (typeof window !== 'undefined') window.PaymentGatewayService = PaymentGatewayService;

/**
 * ====================================================================
 * UI: MODAL DE SUSCRIPCIÓN
 * ====================================================================
 */
(function () {
    let modalElement = null;
    let planId = 'mensual';
    let metodo = 'pago_movil';        // pago_movil | binance | stripe
    let pagoActual = null;            // respuesta pública del servidor
    let referenciaEnviada = '';
    let cancelarEspera = false;

    const $ = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

    const OPCIONES = [
        { key: 'pago_movil', cfg: 'PAGO_MOVIL', icon: 'ph-device-mobile', color: 'bg-blue-50 text-blue-600', titulo: 'Pago Móvil (Bolívares)', sub: 'Tasa oficial BCV del día · Verificación automática' },
        { key: 'binance',    cfg: 'BINANCE',    icon: 'ph-currency-btc',  color: 'bg-amber-50 text-amber-600', titulo: 'Binance Pay / USDT', sub: 'Transferencia interna sin comisión' },
        { key: 'stripe',     cfg: 'STRIPE',     icon: 'ph-credit-card',   color: 'bg-emerald-50 text-emerald-600', titulo: 'Tarjeta Visa / Mastercard', sub: 'Pago seguro con Stripe · Activación inmediata' },
    ];

    function crearModalDOM() {
        if ($('modal-suscripcion-pro')) return;
        const div = document.createElement('div');
        div.id = 'modal-suscripcion-pro';
        div.className = 'fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm opacity-0 pointer-events-none transition-all duration-300';
        div.setAttribute('role', 'dialog');
        div.setAttribute('aria-modal', 'true');
        div.innerHTML = `
            <div id="modal-suscripcion-panel" class="relative w-full max-w-lg bg-white dark:bg-[#071F1A] rounded-3xl shadow-2xl border border-gray-200 dark:border-emerald-950/60 overflow-hidden flex flex-col max-h-[92vh] transform scale-95 transition-all duration-300">
                <div class="px-6 pt-5 pb-3.5 border-b border-gray-100 dark:border-emerald-950/40 bg-white dark:bg-[#071F1A] shrink-0">
                    <div class="flex items-center justify-between mb-2.5">
                        <span id="progresoBadge" class="text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60"></span>
                        <button type="button" onclick="cerrarModalSuscripcionPro()" aria-label="Cerrar" class="w-8 h-8 rounded-full bg-gray-100 dark:bg-emerald-950/60 hover:bg-gray-200 dark:hover:bg-emerald-900/60 text-gray-500 dark:text-gray-300 flex items-center justify-center transition cursor-pointer">
                            <i class="ph-bold ph-x text-xs"></i>
                        </button>
                    </div>
                    <div class="w-full bg-gray-100 dark:bg-emerald-950/60 h-1.5 rounded-full overflow-hidden">
                        <div id="progresoBarra" class="h-full bg-emerald-600 transition-all duration-300 w-1/4"></div>
                    </div>
                </div>
                <div id="modal-pago-cuerpo" class="p-6 overflow-y-auto space-y-5 text-gray-800 dark:text-gray-100 flex-1 bg-white dark:bg-[#071F1A]"></div>
            </div>`;
        document.body.appendChild(div);
        modalElement = div;
    }

    function pintarCabecera(paso, texto) {
        const b = $('progresoBadge'), bar = $('progresoBarra');
        if (b) b.textContent = `Paso ${paso} de 4 · ${texto}`;
        if (bar) bar.style.width = (paso * 25) + '%';
    }

    function cuerpo(html) { const c = $('modal-pago-cuerpo'); if (c) c.innerHTML = html; }

    const BTN_PRIMARIO = 'w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black text-xs sm:text-sm tracking-wide shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-60 disabled:cursor-not-allowed';

    // ---------- Paso 1: cuenta ----------
    function pasoCuenta() {
        pintarCabecera(1, 'Tu cuenta');
        cuerpo(`
            <div class="space-y-4">
                <div>
                    <h3 class="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">Inicia sesión para continuar</h3>
                    <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Tu membresía Pro se vincula a tu cuenta para activarse automáticamente al confirmar el pago.</p>
                </div>
                <button type="button" onclick="loginConGoogleDesdeModal()" class="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-xs sm:text-sm transition-all shadow-xs cursor-pointer">
                    <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24"><path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/><path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/><path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/><path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/></svg>
                    <span>Continuar con Google</span>
                </button>
                <a href="login.html" class="${BTN_PRIMARIO}"><span>Iniciar sesión o crear cuenta</span><i class="ph-bold ph-arrow-right text-xs"></i></a>
            </div>`);
    }

    // ---------- Paso 2: método ----------
    function pasoMetodo() {
        pintarCabecera(2, 'Elige cómo pagar');
        const plan = PaymentGatewayService.getPlan(planId);
        const cfg = PaymentGatewayService.getMetodosPago();
        const filas = OPCIONES.filter(o => !cfg[o.cfg] || cfg[o.cfg].activo !== false).map(o => `
            <button type="button" data-metodo="${o.key}" class="metodo-opcion w-full p-4 rounded-2xl border border-gray-200 dark:border-emerald-900/40 hover:border-emerald-500 hover:bg-emerald-50/20 bg-white dark:bg-[#0A241F] transition-all flex items-center justify-between group cursor-pointer text-left">
                <div class="flex items-center gap-3.5">
                    <div class="w-10 h-10 rounded-xl ${o.color} flex items-center justify-center text-lg shrink-0"><i class="ph-bold ${o.icon}"></i></div>
                    <div>
                        <strong class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white block">${o.titulo}</strong>
                        <span class="text-[11px] text-gray-500 dark:text-gray-400">${o.sub}</span>
                    </div>
                </div>
                <i class="ph-bold ph-caret-right text-gray-400 group-hover:text-emerald-600 transition-all"></i>
            </button>`).join('');
        cuerpo(`
            <div class="space-y-4">
                <div class="flex items-start gap-3">
                    <div class="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 flex items-center justify-center text-xl shrink-0"><i class="ph-fill ph-lock-key"></i></div>
                    <div>
                        <h3 class="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">Elige cómo quieres pagar</h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Confirmamos tu pago automáticamente. Sin permanencia.</p>
                    </div>
                </div>
                <div class="p-3.5 rounded-2xl bg-gray-50 dark:bg-[#0A241F] border border-gray-200/80 dark:border-emerald-900/50 flex items-center justify-between">
                    <span class="text-[10px] uppercase font-bold text-gray-400">${esc(plan.nombre)}</span>
                    <strong class="text-sm text-gray-900 dark:text-white">${PaymentGatewayService.formatUsd(plan.precio_usd)} USD ${esc(plan.periodo_label)}</strong>
                </div>
                <div id="metodo-error" class="hidden text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2"></div>
                <div class="space-y-2.5 pt-1">${filas}</div>
            </div>`);
        document.querySelectorAll('#modal-pago-cuerpo .metodo-opcion').forEach(b =>
            b.addEventListener('click', () => elegirMetodo(b.dataset.metodo, b)));
    }

    async function elegirMetodo(key, boton) {
        metodo = key;
        const errBox = $('metodo-error');
        if (errBox) errBox.classList.add('hidden');
        const original = boton.innerHTML;
        document.querySelectorAll('#modal-pago-cuerpo .metodo-opcion').forEach(b => b.disabled = true);
        boton.innerHTML = '<span class="text-xs font-bold text-gray-500 w-full text-center"><i class="ph-bold ph-spinner ph-spin mr-1"></i> Preparando tu pago…</span>';
        try {
            const r = await PaymentGatewayService.crearPago(planId, key);
            pagoActual = r.pago;
            if (key === 'stripe') {
                if (!r.checkout_url) throw new Error('No se pudo abrir el pago con tarjeta.');
                window.location.href = r.checkout_url; // Stripe Checkout (alojado por Stripe)
                return;
            }
            pasoPagar();
        } catch (e) {
            boton.innerHTML = original;
            document.querySelectorAll('#modal-pago-cuerpo .metodo-opcion').forEach(b => b.disabled = false);
            if (errBox) { errBox.textContent = e.message; errBox.classList.remove('hidden'); }
        }
    }

    // ---------- Paso 3: instrucciones + referencia ----------
    function filaCopiable(label, valor, mono = true) {
        return `<div>
            <span class="text-gray-400 text-[10px] uppercase font-bold block">${label}</span>
            <div class="flex items-center gap-2">
                <strong class="text-gray-900 dark:text-white ${mono ? 'font-mono' : ''}">${esc(valor)}</strong>
                <button type="button" data-copiar="${esc(valor)}" class="btn-copiar text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer">Copiar</button>
            </div></div>`;
    }

    function pasoPagar() {
        pintarCabecera(3, 'Realiza tu pago');
        const cfg = PaymentGatewayService.getMetodosPago();
        const p = pagoActual;
        let cajaDatos = '', etiquetaRef = '', placeholderRef = '', ayudaRef = '';

        if (metodo === 'pago_movil') {
            const c = cfg.PAGO_MOVIL || {};
            cajaDatos = `
                <div class="flex items-center justify-between border-b border-gray-200/60 dark:border-emerald-950/60 pb-2">
                    <span class="text-xs font-bold text-gray-800 dark:text-gray-200">Datos para Pago Móvil</span>
                    <span class="text-[10px] text-emerald-700 font-bold px-2 py-0.5 rounded-full bg-emerald-50">Tasa BCV: Bs. ${PaymentGatewayService.formatBs(p.tasa_bcv)}</span>
                </div>
                <div class="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div><span class="text-gray-400 text-[10px] uppercase font-bold block">Banco destino</span><strong class="text-gray-900 dark:text-white">${esc(c.banco)}</strong></div>
                    <div><span class="text-gray-400 text-[10px] uppercase font-bold block">Monto exacto</span><strong class="text-emerald-600 text-sm font-black">Bs. ${PaymentGatewayService.formatBs(p.monto_local)}</strong></div>
                    ${filaCopiable('Teléfono', c.telefono)}
                    ${filaCopiable('Cédula / RIF', c.ci_rif)}
                </div>
                <p class="text-[11px] text-gray-500 pt-1">Equivale a ${PaymentGatewayService.formatUsd(p.monto_usd)} USD. El monto en Bs queda fijado por 60 minutos.</p>`;
            etiquetaRef = 'Número de referencia del pago *';
            placeholderRef = 'Últimos 8 dígitos o más (ej: 00198420)';
            ayudaRef = 'Lo encuentras en el comprobante de tu banco.';
        } else {
            const c = cfg.BINANCE || {};
            cajaDatos = `
                <div class="flex items-center justify-between border-b border-gray-200/60 dark:border-emerald-950/60 pb-2">
                    <span class="text-xs font-bold text-gray-800 dark:text-gray-200">Binance Pay (USDT)</span>
                    <strong class="text-emerald-600 text-sm">${Number(p.monto_usd).toFixed(2)} USDT</strong>
                </div>
                <div class="space-y-2 text-xs pt-1">
                    ${filaCopiable('Binance Pay ID', c.pay_id)}
                    <div><span class="text-gray-400 text-[10px] uppercase font-bold block">Envía</span><strong class="text-gray-900 dark:text-white">${Number(p.monto_usd).toFixed(2)} USDT (o más) por Binance Pay</strong></div>
                </div>`;
            etiquetaRef = 'Tu Binance ID o ID de la transacción *';
            placeholderRef = 'Ej: 123456789 (tu Binance ID)';
            ayudaRef = 'Usamos este dato para reconocer tu pago. Tu Binance ID está en Perfil → Binance Pay.';
        }

        cuerpo(`
            <div class="space-y-4">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">Realiza tu pago</h3>
                        <p class="text-xs text-gray-500 mt-0.5">Código de tu pago: <strong class="font-mono">${esc(p.codigo)}</strong></p>
                    </div>
                    <button type="button" id="btn-cambiar-metodo" class="text-xs font-bold text-emerald-600 hover:underline cursor-pointer">← Cambiar método</button>
                </div>
                <div class="p-4 rounded-2xl bg-gray-50 dark:bg-[#0A241F] border border-gray-200/80 dark:border-emerald-900/50 space-y-3">${cajaDatos}</div>
                <div>
                    <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">${etiquetaRef}</label>
                    <input type="text" id="modal-pago-referencia" inputmode="text" autocomplete="off" placeholder="${placeholderRef}"
                           class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-emerald-900/50 bg-white dark:bg-[#061814] text-xs font-mono font-bold text-gray-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition">
                    <p class="text-[11px] text-gray-400 mt-1">${ayudaRef}</p>
                </div>
                <div id="pago-error" class="hidden text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-xl px-3 py-2"></div>
                <button type="button" id="modal-btn-confirmar-pago" class="${BTN_PRIMARIO}">
                    <span>Ya pagué, verificar</span><i class="ph-bold ph-check-circle text-sm"></i>
                </button>
                <p class="text-[11px] text-gray-400 text-center">Tu membresía se activa sola en cuanto detectemos el pago.</p>
            </div>`);

        $('btn-cambiar-metodo').addEventListener('click', pasoMetodo);
        $('modal-btn-confirmar-pago').addEventListener('click', enviarReferencia);
        document.querySelectorAll('#modal-pago-cuerpo .btn-copiar').forEach(b =>
            b.addEventListener('click', () => copiar(b, b.dataset.copiar)));
    }

    function copiar(btn, texto) {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(texto).then(() => {
            const o = btn.textContent;
            btn.textContent = 'Copiado';
            setTimeout(() => { btn.textContent = o; }, 1500);
        }).catch(() => {});
    }

    async function enviarReferencia() {
        const input = $('modal-pago-referencia');
        const btn = $('modal-btn-confirmar-pago');
        const err = $('pago-error');
        const ref = (input.value || '').trim();
        err.classList.add('hidden');
        if (!ref) { err.textContent = 'Ingresa la referencia para poder verificar tu pago.'; err.classList.remove('hidden'); return; }
        const original = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin mr-1"></i> Enviando…';
        try {
            referenciaEnviada = ref;
            pagoActual = await PaymentGatewayService.reportarReferencia(pagoActual.id, ref);
            pasoVerificando();
        } catch (e) {
            btn.disabled = false;
            btn.innerHTML = original;
            err.textContent = e.message;
            err.classList.remove('hidden');
        }
    }

    // ---------- Paso 4: verificando / activo ----------
    async function pasoVerificando() {
        pintarCabecera(4, 'Verificando pago');
        cancelarEspera = false;
        cuerpo(`
            <div class="text-center space-y-4 py-4">
                <div class="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-3xl"><i class="ph-bold ph-spinner ph-spin"></i></div>
                <h3 class="text-xl font-black text-gray-900 dark:text-white">Verificando tu pago…</h3>
                <p class="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">Normalmente toma menos de un minuto. Puedes dejar esta ventana abierta: se activará automáticamente.</p>
                <div class="p-3 rounded-2xl bg-gray-50 text-xs font-mono text-gray-700 max-w-xs mx-auto border border-gray-200/80">Código: <strong>${esc(pagoActual.codigo)}</strong></div>
            </div>`);
        const resultado = pagoActual.estado === 'aprobado'
            ? 'aprobado'
            : await PaymentGatewayService.esperarAprobacion(pagoActual.id, { cancelado: () => cancelarEspera });
        if (cancelarEspera) return;
        if (resultado === 'aprobado') return pasoActivo();
        pasoSinConfirmar(resultado);
    }

    async function pasoActivo() {
        pintarCabecera(4, 'Listo');
        await PaymentGatewayService.refrescarPerfil();
        cuerpo(`
            <div class="text-center space-y-4 py-2">
                <div class="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-3xl"><i class="ph-fill ph-check-circle"></i></div>
                <h3 class="text-2xl font-black text-gray-900 dark:text-white">¡Membresía activada!</h3>
                <p class="text-xs sm:text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">Tu cuenta ya tiene permisos de <strong>Asesor Pro</strong>: catálogo, CRM y cotizador.</p>
                <div class="p-3.5 rounded-2xl bg-gray-50 text-xs font-mono text-gray-700 max-w-xs mx-auto border border-gray-200/80">Ref: <strong>${esc(pagoActual.codigo)}</strong></div>
                <button type="button" class="${BTN_PRIMARIO}" onclick="window.location.href='/dashboard'">Ir a mi Dashboard</button>
            </div>`);
    }

    function pasoSinConfirmar(motivo) {
        pintarCabecera(4, 'Pendiente de confirmación');
        const wa = PaymentGatewayService.obtenerEnlaceWhatsAppConciliacion(pagoActual, referenciaEnviada);
        const texto = motivo === 'rechazado'
            ? 'No pudimos validar este pago. Escríbenos con tu comprobante y lo revisamos.'
            : 'Aún no vemos tu pago. Si ya lo hiciste, puede tardar unos minutos más; también puedes enviarnos tu comprobante y lo activamos manualmente.';
        cuerpo(`
            <div class="text-center space-y-4 py-2">
                <div class="w-14 h-14 mx-auto rounded-2xl bg-amber-50 text-amber-600 flex items-center justify-center text-3xl"><i class="ph-fill ph-clock"></i></div>
                <h3 class="text-xl font-black text-gray-900 dark:text-white">Seguimos esperando tu pago</h3>
                <p class="text-xs text-gray-500 max-w-sm mx-auto leading-relaxed">${texto}</p>
                <div class="flex flex-col sm:flex-row gap-2 justify-center">
                    <a href="${wa}" target="_blank" rel="noopener" class="px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs flex items-center justify-center gap-2"><i class="ph-bold ph-whatsapp-logo"></i> Enviar comprobante</a>
                    <button type="button" id="btn-reintentar-espera" class="px-5 py-3 rounded-xl bg-gray-900 hover:bg-black text-white font-bold text-xs cursor-pointer">Seguir esperando</button>
                </div>
            </div>`);
        const r = $('btn-reintentar-espera');
        if (r) r.addEventListener('click', pasoVerificando);
    }

    // ---------- API pública del modal ----------
    window.loginConGoogleDesdeModal = async function () {
        if (typeof AuthService !== 'undefined' && typeof AuthService.loginWithGoogle === 'function') {
            const res = await AuthService.loginWithGoogle();
            if (res && !res.success) alert('No pudimos iniciar sesión con Google. Usa "Iniciar sesión o crear cuenta".');
        } else {
            window.location.href = 'login.html';
        }
    };

    window.abrirModalSuscripcionPro = async function (planInicial = 'mensual') {
        crearModalDOM();
        // Solo existe el plan mensual (US$ 4.99); cualquier otro id cae en él
        planId = PaymentGatewayService.getPlan(planInicial).id;
        pagoActual = null;
        cancelarEspera = false;

        modalElement.classList.remove('opacity-0', 'pointer-events-none');
        const panel = $('modal-suscripcion-panel');
        if (panel) { panel.classList.remove('scale-95'); panel.classList.add('scale-100'); }

        const u = await PaymentGatewayService.getUsuarioActual();
        if (u && (u.email || u.name)) pasoMetodo(); else pasoCuenta();
    };

    window.cerrarModalSuscripcionPro = function () {
        cancelarEspera = true;
        if (!modalElement) return;
        modalElement.classList.add('opacity-0', 'pointer-events-none');
        const panel = $('modal-suscripcion-panel');
        if (panel) { panel.classList.remove('scale-100'); panel.classList.add('scale-95'); }
    };

    // Regreso desde Stripe Checkout: /dashboard?pago=stripe_ok&pid=<uuid>
    document.addEventListener('DOMContentLoaded', async function () {
        const q = new URLSearchParams(window.location.search);
        const pid = q.get('pid');
        if (q.get('pago') !== 'stripe_ok' || !/^[0-9a-f-]{36}$/i.test(pid || '')) return;
        crearModalDOM();
        pagoActual = { id: pid, codigo: 'Stripe', estado: 'verificando', metodo: 'stripe', monto_usd: 4.99 };
        modalElement.classList.remove('opacity-0', 'pointer-events-none');
        const panel = $('modal-suscripcion-panel');
        if (panel) { panel.classList.remove('scale-95'); panel.classList.add('scale-100'); }
        history.replaceState(null, '', window.location.pathname); // limpia la URL
        pasoVerificando();
    });
})();
