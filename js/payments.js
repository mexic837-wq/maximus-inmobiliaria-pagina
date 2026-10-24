/**
 * ====================================================================
 * MAXIMUS INMOBILIARIA - Servicio de Pasarelas de Pago & Checkout Pro
 * ====================================================================
 * 
 * Infraestructura adaptada a la realidad bimonetaria de Venezuela:
 * - Pago Móvil / Transferencias en Bolívares (Tasa Oficial BCV)
 * - Zelle (Dólares USD directos)
 * - Binance Pay / USDT (Cripto sin comisiones)
 * - Zinli / Wally Tech
 * - Tarjeta Internacional (Stripe / Link ready)
 * 
 * Incluye el modal universal de upgrade 'abrirModalSuscripcionPro()'.
 */

const PaymentGatewayService = {

    /**
     * Retorna los planes disponibles desde la configuración central.
     */
    getPlanes() {
        if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.PLANES_SUSCRIPCION) {
            return APP_CONFIG.PLANES_SUSCRIPCION;
        }
        return {
            MENSUAL: { id: 'mensual', nombre: 'Plan Mensual Pro', precio_usd: 19, periodo_label: '/mes' },
            TRIMESTRAL: { id: 'trimestral', nombre: 'Plan Trimestral Pro', precio_usd: 49, periodo_label: '/trimestre' },
            ANUAL: { id: 'anual', nombre: 'Plan Anual Pro', precio_usd: 169, periodo_label: '/año' }
        };
    },

    /**
     * Retorna los métodos de pago configurados para Venezuela.
     */
    getMetodosPago() {
        if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DATOS_PAGO_VENEZUELA) {
            return APP_CONFIG.DATOS_PAGO_VENEZUELA.METODOS;
        }
        return {};
    },

    /**
     * Retorna la tasa oficial referencial en Bs.
     */
    getTasaBCV() {
        if (typeof APP_CONFIG !== 'undefined' && APP_CONFIG.DATOS_PAGO_VENEZUELA) {
            return APP_CONFIG.DATOS_PAGO_VENEZUELA.TASA_BCV_USD || 75.00;
        }
        return 75.00;
    },

    /**
     * Calcula el monto en Bolívares a la tasa oficial.
     */
    calcularBolivares(montoUsd) {
        const tasa = this.getTasaBCV();
        return (montoUsd * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
    },

    /**
     * Registra un pago de suscripción y activa el rol de Asesor Externo Pro.
     */
    async registrarPagoSuscripcion({ planId, metodo, referencia, titular, bancoOrigen, montoUsd, notas = '' }) {
        let currentUser = null;
        try {
            if (typeof AuthService !== 'undefined') {
                currentUser = AuthService.getCurrentUser();
            } else {
                currentUser = JSON.parse(localStorage.getItem('maximus_user'));
            }
        } catch (_) {}

        const planes = this.getPlanes();
        const plan = Object.values(planes).find(p => p.id === planId) || planes.MENSUAL;
        const montoFinal = montoUsd || plan.precio_usd;
        const codTransaccion = 'SUB-' + Math.floor(100000 + Math.random() * 900000);

        const registroPago = {
            id: 'pago-' + Date.now(),
            codigo_transaccion: codTransaccion,
            user_id: currentUser ? currentUser.id : null,
            user_email: currentUser ? currentUser.email : (document.getElementById('modal-pago-email')?.value || 'asesor@cliente.com'),
            user_nombre: currentUser ? currentUser.name : (document.getElementById('modal-pago-nombre')?.value || 'Asesor Externo'),
            user_telefono: currentUser ? (currentUser.telefono || '') : (document.getElementById('modal-pago-telefono')?.value || ''),
            plan_id: plan.id,
            plan_nombre: plan.nombre,
            monto_usd: montoFinal,
            metodo_pago: metodo,
            referencia: referencia ? referencia.trim() : 'N/A',
            banco_origen: bancoOrigen || '',
            titular_pago: titular || '',
            tasa_bcv: this.getTasaBCV(),
            estado: 'completado', // Auto-activación inmediata para experiencia sin fricción
            notas: notas,
            created_at: new Date().toISOString()
        };

        // 1. Guardar en Supabase o Mock
        try {
            if (typeof APP_CONFIG !== 'undefined' && !APP_CONFIG.USE_MOCK_DATA && typeof getSupabase === 'function') {
                const sb = getSupabase();
                if (sb) {
                    await sb.from(APP_CONFIG.TABLES?.PAGOS || 'pagos').insert({
                        monto: montoFinal,
                        moneda: 'USD',
                        metodo_pago: metodo,
                        referencia: referencia,
                        estado: 'completado',
                        concepto: `Suscripción Pro Asesor: ${plan.nombre}`,
                        metadata: registroPago
                    }).catch(e => console.warn('Aviso Supabase Pagos:', e));

                    // Actualizar rol del usuario en la tabla usuarios si está autenticado
                    if (currentUser && currentUser.id) {
                        await sb.from(APP_CONFIG.TABLES?.USUARIOS || 'usuarios')
                            .update({ rol: 'asesor_externo', plan: 'pro', titulo: 'Asesor Inmobiliario Externo (Pro)' })
                            .eq('auth_id', currentUser.id)
                            .catch(e => console.warn('Aviso Supabase update rol:', e));
                    }
                }
            }
        } catch (errDb) {
            console.warn('Aviso registro base de datos:', errDb);
        }

        // 2. Actualizar sesión local del usuario a Asesor Externo Pro
        if (currentUser) {
            currentUser.role = 'asesor_externo';
            currentUser.plan = 'pro';
            currentUser.title = 'Asesor Inmobiliario Externo (Pro)';
            const serialized = JSON.stringify(currentUser);
            localStorage.setItem('maximus_user', serialized);
            sessionStorage.setItem('maximus_user', serialized);
        }

        // Guardar en historial de pagos local
        try {
            const hist = JSON.parse(localStorage.getItem('maximus_historial_pagos') || '[]');
            hist.unshift(registroPago);
            localStorage.setItem('maximus_historial_pagos', JSON.stringify(hist));
        } catch (_) {}

        // 3. Disparar Webhook n8n para confirmación y factura digital
        try {
            if (typeof window !== 'undefined' && window.N8nService && typeof window.N8nService.trigger === 'function') {
                window.N8nService.trigger('CONFIRMACION_PAGO', {
                    evento: 'NUEVA_SUSCRIPCION_ASESOR_PRO',
                    ...registroPago
                }).catch(err => console.warn('Aviso webhook n8n pago:', err));
            }
        } catch (errN8n) {
            console.warn('Aviso al disparar n8n:', errN8n);
        }

        return { success: true, pago: registroPago };
    },

    /**
     * Genera el enlace de WhatsApp oficial para conciliar o enviar comprobante.
     */
    obtenerEnlaceWhatsAppConciliacion(pago) {
        const telefono = (APP_CONFIG.DATOS_PAGO_VENEZUELA?.WHATSAPP_CONCILIACION || '584247835697').replace(/[^0-9]/g, '');
        const texto = `👋 Hola equipo MAXIMUS Inmobiliaria, he completado mi suscripción al *Plan Asesor Externo Pro*.\n\n` +
                      `📋 *Transacción:* ${pago.codigo_transaccion}\n` +
                      `👤 *Nombre:* ${pago.user_nombre}\n` +
                      `📧 *Correo:* ${pago.user_email}\n` +
                      `💼 *Plan:* ${pago.plan_nombre} ($${pago.monto_usd} USD)\n` +
                      `💳 *Método:* ${pago.metodo_pago}\n` +
                      `🔢 *Referencia:* ${pago.referencia}\n\n` +
                      `Adjunto mi comprobante para respaldo contable. ¡Muchas gracias!`;
        return `https://wa.me/${telefono}?text=${encodeURIComponent(texto)}`;
    }
};

// Exportar al ámbito global
if (typeof window !== 'undefined') {
    window.PaymentGatewayService = PaymentGatewayService;
}

/**
 * ====================================================================
 * UI: MODAL UNIVERSAL DE SUSCRIPCIÓN & PASARELAS DE PAGO
 * ====================================================================
 */
(function() {
    let modalElement = null;
    let pasoActual = 1; // 1: Cuenta / Identificación, 2: Plan & Método (Netflix style), 3: Indicaciones & Referencia
    let planSeleccionadoId = 'mensual';
    let metodoSeleccionadoKey = 'PAGO_MOVIL';
    let usuarioDatos = {
        nombre: '',
        email: '',
        telefono: ''
    };

    function crearModalDOM() {
        if (document.getElementById('modal-suscripcion-pro')) return;

        const div = document.createElement('div');
        div.id = 'modal-suscripcion-pro';
        div.className = 'fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-slate-900/60 backdrop-blur-sm opacity-0 pointer-events-none transition-all duration-300';
        div.setAttribute('role', 'dialog');
        div.setAttribute('aria-modal', 'true');

        div.innerHTML = `
            <div id="modal-suscripcion-panel" class="relative w-full max-w-lg bg-white dark:bg-[#071F1A] rounded-3xl shadow-2xl border border-gray-200 dark:border-emerald-950/60 overflow-hidden flex flex-col max-h-[92vh] transform scale-95 transition-all duration-300">
                
                <!-- Header con Barra de Progreso Progresiva (Netflix / Canva Style) -->
                <div class="px-6 pt-5 pb-3.5 border-b border-gray-100 dark:border-emerald-950/40 bg-white dark:bg-[#071F1A] shrink-0">
                    <div class="flex items-center justify-between mb-2.5">
                        <span id="progresoBadge" class="text-[10.5px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950/50 text-emerald-800 dark:text-emerald-300 border border-emerald-200/80 dark:border-emerald-800/60">
                            Paso 1 de 3 · Identificación
                        </span>
                        <button type="button" onclick="cerrarModalSuscripcionPro()" class="w-8 h-8 rounded-full bg-gray-100 dark:bg-emerald-950/60 hover:bg-gray-200 dark:hover:bg-emerald-900/60 text-gray-500 dark:text-gray-300 flex items-center justify-center transition cursor-pointer">
                            <i class="ph-bold ph-x text-xs"></i>
                        </button>
                    </div>
                    <!-- Barra de progreso lineal -->
                    <div class="w-full bg-gray-100 dark:bg-emerald-950/60 h-1.5 rounded-full overflow-hidden">
                        <div id="progresoBarra" class="h-full bg-emerald-600 transition-all duration-300 w-1/3"></div>
                    </div>
                </div>

                <!-- Contenedor de Pasos (Fondo Blanco Limpio / Slate, Sin Sobrecarga Verde) -->
                <div class="p-6 overflow-y-auto space-y-5 text-gray-800 dark:text-gray-100 flex-1 bg-white dark:bg-[#071F1A]">
                    
                    <!-- ==================== PASO 1: IDENTIFICACIÓN / CUENTA ==================== -->
                    <div id="pasoContenido1" class="space-y-4">
                        <div>
                            <h3 class="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">Comienza tu suscripción</h3>
                            <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">Identifícate en segundos para vincular tu membresía Pro.</p>
                        </div>

                        <!-- Botón Google OAuth Destacado (CapCut / Canva Style) -->
                        <button type="button" onclick="loginConGoogleDesdeModal()"
                                class="w-full flex items-center justify-center gap-3 py-3 px-4 rounded-xl border border-gray-200 hover:border-gray-300 bg-white hover:bg-gray-50 text-gray-700 font-semibold text-xs sm:text-sm transition-all shadow-xs hover:shadow active:scale-[0.99] cursor-pointer">
                            <svg class="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                                <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
                                <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
                                <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"/>
                                <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"/>
                            </svg>
                            <span>Continuar con Google</span>
                        </button>

                        <div class="relative flex my-2 items-center">
                            <div class="flex-grow border-t border-gray-200 dark:border-emerald-950/60"></div>
                            <span class="flex-shrink mx-3 text-gray-400 text-[10.5px] uppercase font-semibold">o ingresa tus datos</span>
                            <div class="flex-grow border-t border-gray-200 dark:border-emerald-950/60"></div>
                        </div>

                        <div class="space-y-3">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nombre Completo *</label>
                                <input type="text" id="modalPaso1Nombre" required placeholder="Ej: Carlos Mendoza"
                                       class="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-emerald-900/50 bg-gray-50 dark:bg-[#061814] focus:bg-white text-xs font-medium text-gray-900 dark:text-white outline-none focus:border-emerald-500 transition">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Correo Electrónico *</label>
                                <input type="email" id="modalPaso1Email" required placeholder="tunombre@gmail.com"
                                       class="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-emerald-900/50 bg-gray-50 dark:bg-[#061814] focus:bg-white text-xs font-medium text-gray-900 dark:text-white outline-none focus:border-emerald-500 transition">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">WhatsApp / Teléfono *</label>
                                <input type="tel" id="modalPaso1Telefono" required placeholder="+58 414 1234567"
                                       class="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-emerald-900/50 bg-gray-50 dark:bg-[#061814] focus:bg-white text-xs font-medium text-gray-900 dark:text-white outline-none focus:border-emerald-500 transition">
                            </div>
                        </div>

                        <button type="button" onclick="avanzarPaso2()"
                                class="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-bold text-xs tracking-wide shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer mt-2">
                            <span>Continuar a Selección de Método</span>
                            <i class="ph-bold ph-arrow-right text-xs"></i>
                        </button>
                    </div>

                    <!-- ==================== PASO 2: ELIGE CÓMO QUIERES PAGAR (ESTILO NETFLIX) ==================== -->
                    <div id="pasoContenido2" class="hidden space-y-4">
                        <div class="flex items-start gap-3">
                            <div class="w-10 h-10 rounded-2xl bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-xl shrink-0">
                                <i class="ph-fill ph-lock-key"></i>
                            </div>
                            <div>
                                <h3 class="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">Elige cómo quieres pagar</h3>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5">Tu forma de pago está encriptada y segura. Cancela cuando quieras.</p>
                            </div>
                        </div>

                        <!-- Resumen del Plan con Toggle Rápido Mensual / Anual -->
                        <div class="p-3.5 rounded-2xl bg-gray-50 dark:bg-[#0A241F] border border-gray-200/80 dark:border-emerald-900/50 flex items-center justify-between">
                            <div>
                                <span class="text-[10px] uppercase font-bold text-gray-400 block" id="paso2PlanTitulo">Plan Seleccionado</span>
                                <strong class="text-xs sm:text-sm text-gray-900 dark:text-white" id="paso2PlanPrecio">$19.00 USD / mes</strong>
                            </div>
                            <button type="button" onclick="alternarPlanPaso2()" id="paso2BtnAlternarPlan" class="text-[11px] font-bold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer">
                                Cambiar a Anual (-26%)
                            </button>
                        </div>

                        <!-- Lista de Opciones de Pago (Filas Clickeables Estilo Netflix) -->
                        <div class="space-y-2.5 pt-1">
                            <!-- Opción 1: Pago Móvil -->
                            <button type="button" onclick="seleccionarMetodoYContinuar('PAGO_MOVIL')"
                                    class="w-full p-4 rounded-2xl border border-gray-200 dark:border-emerald-900/40 hover:border-emerald-500 dark:hover:border-emerald-400 hover:bg-emerald-50/20 bg-white dark:bg-[#0A241F] transition-all flex items-center justify-between group cursor-pointer text-left shadow-2xs">
                                <div class="flex items-center gap-3.5">
                                    <div class="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center text-lg shrink-0">
                                        <i class="ph-bold ph-device-mobile"></i>
                                    </div>
                                    <div>
                                        <strong class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white block group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">Pago Móvil (Bolívares)</strong>
                                        <span class="text-[11px] text-gray-500 dark:text-gray-400">Tasa oficial BCV · Banco de Venezuela / Banesco</span>
                                    </div>
                                </div>
                                <i class="ph-bold ph-caret-right text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all"></i>
                            </button>

                            <!-- Opción 2: Zelle -->
                            <button type="button" onclick="seleccionarMetodoYContinuar('ZELLE')"
                                    class="w-full p-4 rounded-2xl border border-gray-200 dark:border-emerald-900/40 hover:border-emerald-500 dark:hover:border-emerald-400 hover:bg-emerald-50/20 bg-white dark:bg-[#0A241F] transition-all flex items-center justify-between group cursor-pointer text-left shadow-2xs">
                                <div class="flex items-center gap-3.5">
                                    <div class="w-10 h-10 rounded-xl bg-purple-50 text-purple-600 flex items-center justify-center text-lg shrink-0">
                                        <i class="ph-bold ph-currency-dollar"></i>
                                    </div>
                                    <div>
                                        <strong class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white block group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">Transferencia Zelle (USD)</strong>
                                        <span class="text-[11px] text-gray-500 dark:text-gray-400">Directo en dólares sin comisión internacional</span>
                                    </div>
                                </div>
                                <i class="ph-bold ph-caret-right text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all"></i>
                            </button>

                            <!-- Opción 3: Binance Pay -->
                            <button type="button" onclick="seleccionarMetodoYContinuar('BINANCE_PAY')"
                                    class="w-full p-4 rounded-2xl border border-gray-200 dark:border-emerald-900/40 hover:border-emerald-500 dark:hover:border-emerald-400 hover:bg-emerald-50/20 bg-white dark:bg-[#0A241F] transition-all flex items-center justify-between group cursor-pointer text-left shadow-2xs">
                                <div class="flex items-center gap-3.5">
                                    <div class="w-10 h-10 rounded-xl bg-amber-50 text-amber-600 flex items-center justify-center text-lg shrink-0">
                                        <i class="ph-bold ph-currency-btc"></i>
                                    </div>
                                    <div>
                                        <strong class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white block group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">Binance Pay / USDT</strong>
                                        <span class="text-[11px] text-gray-500 dark:text-gray-400">Cripto instantáneo · Red BEP20 / TRC20</span>
                                    </div>
                                </div>
                                <i class="ph-bold ph-caret-right text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all"></i>
                            </button>

                            <!-- Opción 4: Tarjeta Internacional -->
                            <button type="button" onclick="seleccionarMetodoYContinuar('TARJETA_INTERNACIONAL')"
                                    class="w-full p-4 rounded-2xl border border-gray-200 dark:border-emerald-900/40 hover:border-emerald-500 dark:hover:border-emerald-400 hover:bg-emerald-50/20 bg-white dark:bg-[#0A241F] transition-all flex items-center justify-between group cursor-pointer text-left shadow-2xs">
                                <div class="flex items-center gap-3.5">
                                    <div class="w-10 h-10 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-lg shrink-0">
                                        <i class="ph-bold ph-credit-card"></i>
                                    </div>
                                    <div>
                                        <strong class="text-xs sm:text-sm font-bold text-gray-900 dark:text-white block group-hover:text-emerald-700 dark:group-hover:text-emerald-300 transition-colors">Tarjeta Internacional</strong>
                                        <span class="text-[11px] text-gray-500 dark:text-gray-400">Visa / Mastercard / Zinli</span>
                                    </div>
                                </div>
                                <i class="ph-bold ph-caret-right text-gray-400 group-hover:text-emerald-600 group-hover:translate-x-1 transition-all"></i>
                            </button>
                        </div>

                        <div class="pt-2 text-center" id="paso2BotonAtrasContainer">
                            <button type="button" onclick="irAlPasoModal(1)" class="text-xs text-gray-400 hover:text-gray-600 transition">
                                ← Modificar mis datos de contacto
                            </button>
                        </div>
                    </div>

                    <!-- ==================== PASO 3: INDICACIONES BANCARIAS & COMPROBANTE ==================== -->
                    <div id="pasoContenido3" class="hidden space-y-4">
                        <div class="flex items-center justify-between">
                            <div>
                                <h3 class="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">Realiza tu pago</h3>
                                <p class="text-xs text-gray-500 dark:text-gray-400 mt-0.5" id="paso3SubtituloMetodo">Datos para transferir</p>
                            </div>
                            <button type="button" onclick="irAlPasoModal(2)" class="text-xs font-bold text-emerald-600 hover:underline cursor-pointer">
                                ← Cambiar método
                            </button>
                        </div>

                        <!-- Caja de Datos de Transferencia Minimalista con 1-Click Copy -->
                        <div id="modal-instrucciones-box" class="p-4 rounded-2xl bg-gray-50 dark:bg-[#0A241F] border border-gray-200/80 dark:border-emerald-900/50 space-y-3">
                            <!-- Inyectado dinámicamente -->
                        </div>

                        <!-- Campo de Referencia / Comprobante -->
                        <div>
                            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">
                                Número de Referencia o Comprobante *
                            </label>
                            <input type="text" id="modal-pago-referencia" required placeholder="Ej: 19842018 (Últimos 6 a 8 dígitos)"
                                   class="w-full px-4 py-3 rounded-xl border border-gray-200 dark:border-emerald-900/50 bg-white dark:bg-[#061814] text-xs font-mono font-bold text-gray-900 dark:text-white outline-none focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 transition">
                        </div>

                        <!-- Botón de Confirmación Directo -->
                        <div class="pt-2 space-y-2">
                            <button type="button" id="modal-btn-confirmar-pago" onclick="procesarPagoSuscripcionModal()"
                                    class="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black text-xs sm:text-sm tracking-wide shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer">
                                <span id="modal-btn-text">Confirmar Pago y Activar Cuenta</span>
                                <i class="ph-bold ph-check-circle text-sm"></i>
                            </button>
                            
                            <p class="text-[11px] text-gray-400 text-center">
                                Activación automática y soporte directo vía WhatsApp.
                            </p>
                        </div>
                    </div>

                </div>
            </div>
        `;

        document.body.appendChild(div);
        modalElement = div;
    }

    // Navegación entre pasos
    window.irAlPasoModal = function(paso) {
        pasoActual = paso;
        const c1 = document.getElementById('pasoContenido1');
        const c2 = document.getElementById('pasoContenido2');
        const c3 = document.getElementById('pasoContenido3');
        const badge = document.getElementById('progresoBadge');
        const barra = document.getElementById('progresoBarra');

        if (c1) c1.classList.toggle('hidden', paso !== 1);
        if (c2) c2.classList.toggle('hidden', paso !== 2);
        if (c3) c3.classList.toggle('hidden', paso !== 3);

        if (badge && barra) {
            if (paso === 1) {
                badge.textContent = 'Paso 1 de 3 · Identificación';
                barra.style.width = '33%';
            } else if (paso === 2) {
                badge.textContent = 'Paso 2 de 3 · Elige cómo quieres pagar';
                barra.style.width = '66%';
                actualizarResumenPlanPaso2();
            } else if (paso === 3) {
                badge.textContent = 'Paso 3 de 3 · Indicaciones & Confirmación';
                barra.style.width = '100%';
                renderizarInstruccionesEnModal();
            }
        }
    };

    window.avanzarPaso2 = function() {
        const nom = (document.getElementById('modalPaso1Nombre')?.value || '').trim();
        const email = (document.getElementById('modalPaso1Email')?.value || '').trim();
        const tel = (document.getElementById('modalPaso1Telefono')?.value || '').trim();

        if (!nom || !email) {
            alert('Por favor ingresa tu nombre y correo para continuar.');
            return;
        }

        usuarioDatos.nombre = nom;
        usuarioDatos.email = email;
        usuarioDatos.telefono = tel;

        irAlPasoModal(2);
    };

    window.alternarPlanPaso2 = function() {
        planSeleccionadoId = (planSeleccionadoId === 'mensual') ? 'anual' : 'mensual';
        actualizarResumenPlanPaso2();
    };

    function actualizarResumenPlanPaso2() {
        const planes = PaymentGatewayService.getPlanes();
        const plan = Object.values(planes).find(p => p.id === planSeleccionadoId) || planes.MENSUAL;
        const precioEl = document.getElementById('paso2PlanPrecio');
        const btnAlternar = document.getElementById('paso2BtnAlternarPlan');

        if (precioEl) {
            precioEl.textContent = `$${plan.precio_usd}.00 USD ${plan.periodo_label}`;
        }
        if (btnAlternar) {
            btnAlternar.textContent = (planSeleccionadoId === 'mensual') ? 'Cambiar a Anual (-26% OFF)' : 'Cambiar a Mensual';
        }
    }

    window.seleccionarMetodoYContinuar = function(metodoKey) {
        metodoSeleccionadoKey = metodoKey;
        irAlPasoModal(3);
    };

    window.loginConGoogleDesdeModal = async function() {
        if (typeof AuthService !== 'undefined' && typeof AuthService.loginWithGoogle === 'function') {
            const res = await AuthService.loginWithGoogle();
            if (res && !res.success && res.providerNotConfigured) {
                // Fallback de demostración en modal si Google Cloud aún no está activo en Supabase
                usuarioDatos.nombre = 'Usuario Google';
                usuarioDatos.email = 'usuario.google@gmail.com';
                usuarioDatos.telefono = '+58 414 1234567';
                irAlPasoModal(2);
            }
        } else {
            usuarioDatos.nombre = 'Usuario Google';
            usuarioDatos.email = 'usuario.google@gmail.com';
            usuarioDatos.telefono = '+58 414 1234567';
            irAlPasoModal(2);
        }
    };

    // Helper para copiar sin alert() invasivo
    window.copiarDatoModal = function(btn, texto) {
        if (!navigator.clipboard) return;
        navigator.clipboard.writeText(texto).then(() => {
            const originalHTML = btn.innerHTML;
            btn.innerHTML = '<i class="ph-bold ph-check text-emerald-600"></i> Copiado';
            btn.classList.add('text-emerald-600');
            setTimeout(() => {
                btn.innerHTML = originalHTML;
                btn.classList.remove('text-emerald-600');
            }, 1800);
        }).catch(() => {});
    };

    function renderizarInstruccionesEnModal() {
        const box = document.getElementById('modal-instrucciones-box');
        if (!box) return;

        const planes = PaymentGatewayService.getPlanes();
        const plan = Object.values(planes).find(p => p.id === planSeleccionadoId) || planes.MENSUAL;
        const configMetodos = PaymentGatewayService.getMetodosPago();
        const cfg = configMetodos[metodoSeleccionadoKey] || {};
        const tasa = PaymentGatewayService.getTasaBCV();
        const bolivares = (plan.precio_usd * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        const subEl = document.getElementById('paso3SubtituloMetodo');

        if (metodoSeleccionadoKey === 'PAGO_MOVIL') {
            if (subEl) subEl.textContent = `Pago Móvil en Bolívares (Tasa Oficial BCV: Bs. ${tasa.toFixed(2)})`;
            box.innerHTML = `
                <div class="flex items-center justify-between border-b border-gray-200/60 dark:border-emerald-950/60 pb-2">
                    <span class="text-xs font-bold text-gray-800 dark:text-gray-200">Datos para Pago Móvil</span>
                    <span class="text-[10px] text-emerald-700 dark:text-emerald-300 font-bold px-2 py-0.5 rounded-full bg-emerald-50 dark:bg-emerald-950">Tasa BCV: Bs. ${tasa.toFixed(2)}</span>
                </div>
                <div class="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Banco Destino:</span>
                        <strong class="text-gray-900 dark:text-white">${cfg.banco || '0102 - Banco de Venezuela'}</strong>
                    </div>
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Monto Exacto:</span>
                        <strong class="text-emerald-600 dark:text-emerald-400 text-sm font-black">Bs. ${bolivares}</strong>
                    </div>
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Teléfono:</span>
                        <div class="flex items-center gap-2">
                            <strong class="text-gray-900 dark:text-white font-mono">${cfg.telefono || '0424-7835697'}</strong>
                            <button type="button" onclick="copiarDatoModal(this, '${cfg.telefono || '04247835697'}')" class="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer">Copiar</button>
                        </div>
                    </div>
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Cédula / RIF:</span>
                        <div class="flex items-center gap-2">
                            <strong class="text-gray-900 dark:text-white font-mono">${cfg.ci_rif || 'V-20123456'}</strong>
                            <button type="button" onclick="copiarDatoModal(this, '${cfg.ci_rif || 'V20123456'}')" class="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer">Copiar</button>
                        </div>
                    </div>
                </div>
            `;
        } else if (metodoSeleccionadoKey === 'ZELLE') {
            if (subEl) subEl.textContent = 'Transferencia directa Zelle (USD)';
            box.innerHTML = `
                <div class="flex items-center justify-between border-b border-gray-200/60 dark:border-emerald-950/60 pb-2">
                    <span class="text-xs font-bold text-gray-800 dark:text-gray-200">Transferencia Zelle</span>
                    <strong class="text-emerald-600 dark:text-emerald-400 text-sm">$${plan.precio_usd}.00 USD</strong>
                </div>
                <div class="space-y-2 text-xs pt-1">
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Correo Zelle:</span>
                        <div class="flex items-center gap-2">
                            <strong class="text-gray-900 dark:text-white font-mono">${cfg.correo || 'pagos@maximusinmobiliaria.com'}</strong>
                            <button type="button" onclick="copiarDatoModal(this, '${cfg.correo || 'pagos@maximusinmobiliaria.com'}')" class="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer">Copiar</button>
                        </div>
                    </div>
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Titular de la Cuenta:</span>
                        <strong class="text-gray-900 dark:text-white">${cfg.titular || 'MAXIMUS Real Estate Services LLC'}</strong>
                    </div>
                </div>
            `;
        } else if (metodoSeleccionadoKey === 'BINANCE_PAY') {
            if (subEl) subEl.textContent = 'Binance Pay / USDT Cripto';
            box.innerHTML = `
                <div class="flex items-center justify-between border-b border-gray-200/60 dark:border-emerald-950/60 pb-2">
                    <span class="text-xs font-bold text-gray-800 dark:text-gray-200">Binance Pay (USDT)</span>
                    <strong class="text-emerald-600 dark:text-emerald-400 text-sm">${plan.precio_usd}.00 USDT</strong>
                </div>
                <div class="space-y-2 text-xs pt-1">
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Binance Pay ID:</span>
                        <div class="flex items-center gap-2">
                            <strong class="text-gray-900 dark:text-white font-mono text-sm">${cfg.pay_id || '849201938'}</strong>
                            <button type="button" onclick="copiarDatoModal(this, '${cfg.pay_id || '849201938'}')" class="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 cursor-pointer">Copiar</button>
                        </div>
                    </div>
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Red:</span>
                        <strong class="text-gray-900 dark:text-white">${cfg.red || 'USDT BEP20 / TRC20'}</strong>
                    </div>
                </div>
            `;
        } else {
            if (subEl) subEl.textContent = 'Tarjeta de Crédito / Débito Internacional';
            box.innerHTML = `
                <div class="flex items-center justify-between border-b border-gray-200/60 dark:border-emerald-950/60 pb-2">
                    <span class="text-xs font-bold text-gray-800 dark:text-gray-200">Tarjeta Internacional</span>
                    <strong class="text-emerald-600 dark:text-emerald-400 text-sm">$${plan.precio_usd}.00 USD</strong>
                </div>
                <p class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed pt-1">
                    Aceptamos Visa, Mastercard y tarjetas internacionales. Introduce tu número de referencia o continúa para confirmación.
                </p>
            `;
        }
    }

    window.abrirModalSuscripcionPro = function(planInicial = 'mensual') {
        crearModalDOM();
        planSeleccionadoId = planInicial;

        // Verificar si el usuario ya está autenticado
        let u = null;
        try {
            if (typeof AuthService !== 'undefined') u = AuthService.getCurrentUser();
            if (!u) u = JSON.parse(localStorage.getItem('maximus_user'));
        } catch (_) {}

        if (u && (u.email || u.name)) {
            // Usuario ya tiene cuenta y está logueado: saltar directo al Paso 2 (Netflix style)
            usuarioDatos.nombre = u.name || 'Asesor';
            usuarioDatos.email = u.email || 'asesor@maximus.com';
            usuarioDatos.telefono = u.telefono || '';
            
            const p1Nom = document.getElementById('modalPaso1Nombre');
            const p1Mail = document.getElementById('modalPaso1Email');
            const p1Tel = document.getElementById('modalPaso1Telefono');
            if (p1Nom) p1Nom.value = usuarioDatos.nombre;
            if (p1Mail) p1Mail.value = usuarioDatos.email;
            if (p1Tel) p1Tel.value = usuarioDatos.telefono;

            // Ocultar botón atrás hacia el paso 1 ya que ya tiene cuenta
            const atrasBtnCont = document.getElementById('paso2BotonAtrasContainer');
            if (atrasBtnCont) {
                atrasBtnCont.innerHTML = `<span class="text-[11px] text-gray-400">Identificado como: <strong class="text-gray-700 dark:text-gray-200">${usuarioDatos.email}</strong></span>`;
            }

            irAlPasoModal(2);
        } else {
            // Usuario no logueado: empezar por el Paso 1
            const atrasBtnCont = document.getElementById('paso2BotonAtrasContainer');
            if (atrasBtnCont) {
                atrasBtnCont.innerHTML = `<button type="button" onclick="irAlPasoModal(1)" class="text-xs text-gray-400 hover:text-gray-600 transition">← Modificar mis datos de contacto</button>`;
            }
            irAlPasoModal(1);
        }

        modalElement.classList.remove('opacity-0', 'pointer-events-none');
        const panel = document.getElementById('modal-suscripcion-panel');
        if (panel) {
            panel.classList.remove('scale-95');
            panel.classList.add('scale-100');
        }
    };

    window.cerrarModalSuscripcionPro = function() {
        if (!modalElement) return;
        modalElement.classList.add('opacity-0', 'pointer-events-none');
        const panel = document.getElementById('modal-suscripcion-panel');
        if (panel) {
            panel.classList.remove('scale-100');
            panel.classList.add('scale-95');
        }
    };

    window.procesarPagoSuscripcionModal = async function() {
        const btn = document.getElementById('modal-btn-confirmar-pago');
        const originalText = btn ? btn.innerHTML : '';
        const referencia = (document.getElementById('modal-pago-referencia')?.value || '').trim();

        if (!referencia) {
            alert('Por favor ingresa el número de referencia o comprobante de tu transferencia.');
            return;
        }

        const nombre = usuarioDatos.nombre || (document.getElementById('modalPaso1Nombre')?.value || 'Asesor Pro').trim();
        const email = usuarioDatos.email || (document.getElementById('modalPaso1Email')?.value || 'asesor@maximus.com').trim();
        const telefono = usuarioDatos.telefono || (document.getElementById('modalPaso1Telefono')?.value || '').trim();

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin mr-1"></i> Confirmando Membresía...';
        }

        try {
            const res = await PaymentGatewayService.registrarPagoSuscripcion({
                planId: planSeleccionadoId,
                metodo: metodoSeleccionadoKey,
                referencia: referencia,
                titular: nombre,
                notas: `Registro progresivo asesor por ${telefono} (${email})`
            });

            if (res.success) {
                const urlWhatsApp = PaymentGatewayService.obtenerEnlaceWhatsAppConciliacion(res.pago);
                
                const panel = document.getElementById('modal-suscripcion-panel');
                if (panel) {
                    panel.innerHTML = `
                        <div class="p-8 sm:p-10 text-center space-y-4 bg-white dark:bg-[#071F1A]">
                            <div class="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-3xl">
                                <i class="ph-fill ph-check-circle"></i>
                            </div>
                            <h3 class="text-2xl font-black text-gray-900 dark:text-white">¡Membresía Activada con Éxito!</h3>
                            <p class="text-xs sm:text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
                                Tu cuenta ahora cuenta con permisos de <strong>Asesor Pro</strong> para publicar en el catálogo, usar el CRM y el cotizador.
                            </p>
                            <div class="p-3.5 rounded-2xl bg-gray-50 dark:bg-[#0A241F] text-xs font-mono text-gray-700 dark:text-gray-300 max-w-xs mx-auto border border-gray-200/80 dark:border-emerald-900/50">
                                Ref: <strong>${res.pago.codigo_transaccion}</strong> · Plan: <strong>${res.pago.plan_nombre}</strong>
                            </div>
                            <div class="pt-2 flex flex-col sm:flex-row items-center justify-center gap-2">
                                <a href="${urlWhatsApp}" target="_blank" class="w-full sm:w-auto px-5 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs transition flex items-center justify-center gap-2">
                                    <i class="ph-bold ph-whatsapp-logo"></i> Notificar a Administración
                                </a>
                                <button type="button" onclick="window.location.href='/dashboard'; cerrarModalSuscripcionPro();" class="w-full sm:w-auto px-5 py-3 rounded-xl bg-gray-900 hover:bg-black text-white font-bold text-xs transition">
                                    Ir a mi Dashboard
                                </button>
                            </div>
                        </div>
                    `;
                }
            }
        } catch (err) {
            alert('Aviso al procesar: ' + (err.message || 'Intente nuevamente'));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    };
})();
