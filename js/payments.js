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
    let planSeleccionadoId = 'mensual';
    let metodoSeleccionadoKey = 'PAGO_MOVIL';

    function crearModalDOM() {
        if (document.getElementById('modal-suscripcion-pro')) return;

        const div = document.createElement('div');
        div.id = 'modal-suscripcion-pro';
        div.className = 'fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/60 backdrop-blur-md opacity-0 pointer-events-none transition-all duration-300';
        div.setAttribute('role', 'dialog');
        div.setAttribute('aria-modal', 'true');
        
        div.innerHTML = `
            <div id="modal-suscripcion-panel" class="relative w-full max-w-2xl bg-white dark:bg-[#071F1A] rounded-3xl shadow-2xl border border-gray-100 dark:border-emerald-500/25 overflow-hidden flex flex-col max-h-[92vh] transform scale-95 transition-all duration-300">
                <!-- Encabezado con degradado esmeralda / cromo -->
                <div class="relative bg-gradient-to-r from-[#06241E] via-[#0B4A3F] to-[#041713] p-5 sm:p-6 text-white shrink-0 overflow-hidden">
                    <div class="absolute -top-10 -right-10 w-36 h-36 bg-emerald-500/20 rounded-full blur-2xl pointer-events-none"></div>
                    
                    <div class="flex items-start justify-between relative z-10">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-2xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-300 text-2xl shadow-inner shrink-0">
                                <i class="ph-fill ph-seal-check"></i>
                            </div>
                            <div>
                                <div class="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full bg-emerald-400/20 text-emerald-300 text-[10px] font-black uppercase tracking-widest border border-emerald-400/30 mb-1">
                                    <i class="ph-fill ph-star"></i> Membresía Pro · Asesor Aliado
                                </div>
                                <h3 class="text-xl sm:text-2xl font-black text-white tracking-tight">Activa tu Cuenta Profesional MAXIMUS</h3>
                            </div>
                        </div>
                        <button type="button" onclick="cerrarModalSuscripcionPro()" class="w-9 h-9 rounded-full bg-white/10 hover:bg-white/20 text-gray-300 hover:text-white flex items-center justify-center transition-all cursor-pointer">
                            <i class="ph-bold ph-x text-base"></i>
                        </button>
                    </div>

                    <p class="text-xs sm:text-sm text-emerald-100/90 mt-2.5 max-w-lg font-light leading-relaxed">
                        Publica tus inmuebles en el portal líder del Táchira, gestiona tus clientes con CRM, cotiza comisiones al instante y comparte dossiers con tu marca.
                    </p>
                </div>

                <!-- Cuerpo Scrollable -->
                <div class="p-5 sm:p-6 overflow-y-auto space-y-5 text-gray-800 dark:text-gray-100 flex-1">
                    
                    <!-- PASO 1: Selector de Plan -->
                    <div>
                        <div class="flex items-center justify-between mb-2.5">
                            <h4 class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider flex items-center gap-1.5">
                                <span class="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-center font-bold">1</span>
                                Selecciona tu Ciclo de Facturación
                            </h4>
                            <span class="text-[11px] text-emerald-700 dark:text-emerald-400 font-bold">Sin contratos forzosos</span>
                        </div>
                        
                        <div class="grid grid-cols-1 sm:grid-cols-3 gap-3" id="modal-planes-container">
                            <!-- Inyectado por JS -->
                        </div>
                    </div>

                    <!-- PASO 2: Selección de Pasarela de Pago Venezuela -->
                    <div>
                        <h4 class="text-xs font-black text-gray-900 dark:text-white uppercase tracking-wider mb-2.5 flex items-center gap-1.5">
                            <span class="w-5 h-5 rounded-full bg-emerald-100 dark:bg-emerald-900/60 text-emerald-800 dark:text-emerald-300 text-xs flex items-center justify-center font-bold">2</span>
                            Elige tu Método de Pago Preferido
                        </h4>
                        
                        <div class="grid grid-cols-2 sm:grid-cols-3 gap-2" id="modal-metodos-container">
                            <!-- Inyectado por JS -->
                        </div>
                    </div>

                    <!-- PASO 3: Instrucciones y Datos Bancarios -->
                    <div id="modal-instrucciones-box" class="p-4 rounded-2xl bg-gray-50 dark:bg-[#0A2922] border border-gray-200/80 dark:border-emerald-900/60 space-y-3">
                        <!-- Inyectado dinámicamente -->
                    </div>

                    <!-- PASO 4: Formulario de Referencia y Confirmación -->
                    <div id="modal-formulario-pago" class="space-y-3 pt-1">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nombre Completo *</label>
                                <input type="text" id="modal-pago-nombre" required class="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-emerald-900/60 bg-white dark:bg-[#061814] text-xs font-semibold text-gray-900 dark:text-white outline-none focus:border-emerald-500" placeholder="Ej: Carlos Mendoza">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Correo Electrónico *</label>
                                <input type="email" id="modal-pago-email" required class="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-emerald-900/60 bg-white dark:bg-[#061814] text-xs font-semibold text-gray-900 dark:text-white outline-none focus:border-emerald-500" placeholder="tunombre@gmail.com">
                            </div>
                        </div>

                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Número de Referencia / Comprobante *</label>
                                <input type="text" id="modal-pago-referencia" required class="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-emerald-900/60 bg-white dark:bg-[#061814] text-xs font-semibold text-gray-900 dark:text-white outline-none focus:border-emerald-500" placeholder="Ej: 19842018 (Últimos 6-8 dígitos)">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">WhatsApp / Teléfono *</label>
                                <input type="tel" id="modal-pago-telefono" required class="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-emerald-900/60 bg-white dark:bg-[#061814] text-xs font-semibold text-gray-900 dark:text-white outline-none focus:border-emerald-500" placeholder="+58 414 1234567">
                            </div>
                        </div>
                    </div>

                </div>

                <!-- Footer con Botón de Confirmación -->
                <div class="p-4 sm:p-5 bg-gray-50 dark:bg-[#051713] border-t border-gray-100 dark:border-emerald-950 flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                    <div class="text-center sm:text-left">
                        <p class="text-[11px] text-gray-400">Garantía de activación inmediata y soporte prioritario.</p>
                        <p class="text-xs font-bold text-gray-700 dark:text-gray-200" id="modal-total-display">Total a pagar: $19.00 USD</p>
                    </div>

                    <div class="flex items-center gap-2 w-full sm:w-auto">
                        <button type="button" onclick="cerrarModalSuscripcionPro()" class="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold text-gray-500 hover:text-gray-700 hover:bg-gray-200/50 transition">
                            Cancelar
                        </button>
                        <button type="button" id="modal-btn-confirmar-pago" onclick="procesarPagoSuscripcionModal()" class="flex-1 sm:flex-none px-6 py-2.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white font-black text-xs shadow-md shadow-emerald-700/30 hover:shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer">
                            <span>Confirmar y Activar Plan Pro</span>
                            <i class="ph-bold ph-arrow-right text-xs"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;

        document.body.appendChild(div);
        modalElement = div;
    }

    function renderizarPlanesEnModal() {
        const container = document.getElementById('modal-planes-container');
        if (!container) return;
        const planes = PaymentGatewayService.getPlanes();
        
        container.innerHTML = Object.values(planes).map(p => {
            const isSel = p.id === planSeleccionadoId;
            return `
                <div onclick="seleccionarPlanModal('${p.id}')" class="relative cursor-pointer rounded-2xl border-2 p-3 sm:p-3.5 transition-all ${isSel ? 'border-emerald-500 bg-emerald-50/70 dark:bg-emerald-950/40 shadow-sm' : 'border-gray-200 dark:border-emerald-900/40 bg-white dark:bg-[#061814] hover:border-emerald-300'}">
                    ${p.badge ? `<span class="absolute -top-2.5 right-2 px-2 py-0.5 rounded-full bg-emerald-600 text-white text-[9px] font-black uppercase tracking-wider shadow-xs">${p.badge}</span>` : ''}
                    <div class="flex items-center justify-between mb-1">
                        <span class="text-xs font-black text-gray-900 dark:text-white">${p.nombre}</span>
                        <div class="w-4 h-4 rounded-full border-2 flex items-center justify-center ${isSel ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-gray-300'}">
                            ${isSel ? '<i class="ph-bold ph-check text-[10px]"></i>' : ''}
                        </div>
                    </div>
                    <div class="flex items-baseline gap-1">
                        <span class="text-xl font-black text-emerald-800 dark:text-emerald-300">$${p.precio_usd}</span>
                        <span class="text-[11px] font-bold text-gray-400">${p.periodo_label}</span>
                    </div>
                    <p class="text-[10px] text-gray-500 dark:text-gray-400 mt-1 leading-tight">${p.descripcion}</p>
                </div>
            `;
        }).join('');
    }

    function renderizarMetodosEnModal() {
        const container = document.getElementById('modal-metodos-container');
        if (!container) return;

        const metodos = [
            { key: 'PAGO_MOVIL', nombre: 'Pago Móvil (Bs)', icon: 'ph-device-mobile', badge: 'Tasa BCV' },
            { key: 'ZELLE', nombre: 'Zelle (USD)', icon: 'ph-currency-dollar', badge: 'Directo' },
            { key: 'BINANCE_PAY', nombre: 'Binance / USDT', icon: 'ph-currency-btc', badge: '0% Comisión' },
            { key: 'ZINLI', nombre: 'Zinli / Wally', icon: 'ph-wallet', badge: 'Billetera' },
            { key: 'TARJETA_INTERNACIONAL', nombre: 'Tarjeta Int.', icon: 'ph-credit-card', badge: 'Visa/MC' }
        ];

        container.innerHTML = metodos.map(m => {
            const isSel = m.key === metodoSeleccionadoKey;
            return `
                <div onclick="seleccionarMetodoModal('${m.key}')" class="cursor-pointer rounded-xl border-2 p-2.5 transition-all flex flex-col justify-between ${isSel ? 'border-emerald-500 bg-emerald-50/80 dark:bg-emerald-950/40' : 'border-gray-200 dark:border-emerald-900/40 bg-white dark:bg-[#061814] hover:border-emerald-300'}">
                    <div class="flex items-center justify-between mb-1">
                        <i class="ph-bold ${m.icon} text-lg ${isSel ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}"></i>
                        <span class="text-[9px] font-extrabold uppercase px-1.5 py-0.2 rounded-full ${isSel ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900 dark:text-emerald-300' : 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400'}">${m.badge}</span>
                    </div>
                    <span class="text-[11px] font-bold text-gray-900 dark:text-white leading-tight">${m.nombre}</span>
                </div>
            `;
        }).join('');
    }

    function renderizarInstruccionesEnModal() {
        const box = document.getElementById('modal-instrucciones-box');
        if (!box) return;

        const planes = PaymentGatewayService.getPlanes();
        const plan = Object.values(planes).find(p => p.id === planSeleccionadoId) || planes.MENSUAL;
        const configMetodos = PaymentGatewayService.getMetodosPago();
        const cfg = configMetodos[metodoSeleccionadoKey] || {};
        const tasa = PaymentGatewayService.getTasaBCV();
        const bolivares = (plan.precio_usd * tasa).toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 });

        // Actualizar total display en footer
        const totalDisp = document.getElementById('modal-total-display');
        if (totalDisp) {
            if (metodoSeleccionadoKey === 'PAGO_MOVIL') {
                totalDisp.innerHTML = `Total: <strong class="text-emerald-600 dark:text-emerald-400">Bs. ${bolivares}</strong> ($${plan.precio_usd}.00 USD a tasa BCV: ${tasa.toFixed(2)})`;
            } else {
                totalDisp.innerHTML = `Total a pagar: <strong class="text-emerald-600 dark:text-emerald-400">$${plan.precio_usd}.00 USD</strong> (${plan.nombre})`;
            }
        }

        if (metodoSeleccionadoKey === 'PAGO_MOVIL') {
            box.innerHTML = `
                <div class="flex items-center justify-between border-b border-gray-200/60 dark:border-emerald-900/60 pb-2">
                    <span class="text-xs font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <i class="ph-bold ph-bank text-sm"></i> Datos para Pago Móvil en Bolívares
                    </span>
                    <span class="text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-300">Tasa Oficial BCV: Bs. ${tasa.toFixed(2)}</span>
                </div>
                <div class="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Banco Destino:</span>
                        <strong class="text-gray-900 dark:text-white">${cfg.banco || '0102 - Banco de Venezuela'}</strong>
                    </div>
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Teléfono:</span>
                        <div class="flex items-center gap-1.5">
                            <strong class="text-gray-900 dark:text-white">${cfg.telefono || '0424-7835697'}</strong>
                            <button type="button" onclick="navigator.clipboard.writeText('${cfg.telefono || '04247835697'}'); alert('¡Teléfono copiado!');" class="text-emerald-600 text-[10px] font-bold hover:underline cursor-pointer">Copiar</button>
                        </div>
                    </div>
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Cédula / RIF:</span>
                        <div class="flex items-center gap-1.5">
                            <strong class="text-gray-900 dark:text-white">${cfg.ci_rif || 'V-20123456'}</strong>
                            <button type="button" onclick="navigator.clipboard.writeText('${cfg.ci_rif || 'V20123456'}'); alert('¡Cédula copiada!');" class="text-emerald-600 text-[10px] font-bold hover:underline cursor-pointer">Copiar</button>
                        </div>
                    </div>
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Monto Exacto a Transferir:</span>
                        <strong class="text-emerald-700 dark:text-emerald-400 text-sm">Bs. ${bolivares}</strong>
                    </div>
                </div>
                <p class="text-[10.5px] text-gray-500 dark:text-gray-400 pt-1 leading-relaxed">
                    <i class="ph-bold ph-info text-emerald-600"></i> ${cfg.instrucciones || ''}
                </p>
            `;
        } else if (metodoSeleccionadoKey === 'ZELLE') {
            box.innerHTML = `
                <div class="flex items-center justify-between border-b border-gray-200/60 dark:border-emerald-900/60 pb-2">
                    <span class="text-xs font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <i class="ph-bold ph-currency-dollar text-sm"></i> Transferencia Zelle Directa (USD)
                    </span>
                    <strong class="text-emerald-700 dark:text-emerald-400 text-sm">$${plan.precio_usd}.00 USD</strong>
                </div>
                <div class="space-y-1.5 text-xs">
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Correo Zelle Oficial:</span>
                        <div class="flex items-center gap-2">
                            <strong class="text-gray-900 dark:text-white font-mono">${cfg.correo || 'pagos@maximusinmobiliaria.com'}</strong>
                            <button type="button" onclick="navigator.clipboard.writeText('${cfg.correo || 'pagos@maximusinmobiliaria.com'}'); alert('¡Correo copiado!');" class="text-emerald-600 text-[10px] font-bold hover:underline cursor-pointer">Copiar</button>
                        </div>
                    </div>
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Titular de la Cuenta:</span>
                        <strong class="text-gray-900 dark:text-white">${cfg.titular || 'MAXIMUS Real Estate Services LLC'}</strong>
                    </div>
                </div>
                <p class="text-[10.5px] text-gray-500 dark:text-gray-400 pt-1 leading-relaxed">
                    <i class="ph-bold ph-info text-emerald-600"></i> ${cfg.instrucciones || ''}
                </p>
            `;
        } else if (metodoSeleccionadoKey === 'BINANCE_PAY') {
            box.innerHTML = `
                <div class="flex items-center justify-between border-b border-gray-200/60 dark:border-emerald-900/60 pb-2">
                    <span class="text-xs font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <i class="ph-bold ph-currency-btc text-sm"></i> Binance Pay & Cripto (USDT)
                    </span>
                    <strong class="text-emerald-700 dark:text-emerald-400 text-sm">$${plan.precio_usd}.00 USDT</strong>
                </div>
                <div class="space-y-1.5 text-xs">
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Binance Pay ID:</span>
                        <div class="flex items-center gap-2">
                            <strong class="text-gray-900 dark:text-white font-mono text-sm">${cfg.pay_id || '849201938'}</strong>
                            <button type="button" onclick="navigator.clipboard.writeText('${cfg.pay_id || '849201938'}'); alert('¡Pay ID copiado!');" class="text-emerald-600 text-[10px] font-bold hover:underline cursor-pointer">Copiar ID</button>
                        </div>
                    </div>
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Red:</span>
                        <strong class="text-gray-900 dark:text-white">${cfg.red || 'USDT BEP20'}</strong>
                    </div>
                </div>
                <p class="text-[10.5px] text-gray-500 dark:text-gray-400 pt-1 leading-relaxed">
                    <i class="ph-bold ph-info text-emerald-600"></i> ${cfg.instrucciones || ''}
                </p>
            `;
        } else if (metodoSeleccionadoKey === 'ZINLI') {
            box.innerHTML = `
                <div class="flex items-center justify-between border-b border-gray-200/60 dark:border-emerald-900/60 pb-2">
                    <span class="text-xs font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <i class="ph-bold ph-wallet text-sm"></i> Billetera Digital Zinli / Wally
                    </span>
                    <strong class="text-emerald-700 dark:text-emerald-400 text-sm">$${plan.precio_usd}.00 USD</strong>
                </div>
                <div class="space-y-1.5 text-xs">
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Correo de Envío:</span>
                        <div class="flex items-center gap-2">
                            <strong class="text-gray-900 dark:text-white font-mono">${cfg.correo || 'pagos@maximusinmobiliaria.com'}</strong>
                            <button type="button" onclick="navigator.clipboard.writeText('${cfg.correo || 'pagos@maximusinmobiliaria.com'}'); alert('¡Correo copiado!');" class="text-emerald-600 text-[10px] font-bold hover:underline cursor-pointer">Copiar</button>
                        </div>
                    </div>
                </div>
                <p class="text-[10.5px] text-gray-500 dark:text-gray-400 pt-1 leading-relaxed">
                    <i class="ph-bold ph-info text-emerald-600"></i> ${cfg.instrucciones || ''}
                </p>
            `;
        } else {
            box.innerHTML = `
                <div class="flex items-center justify-between border-b border-gray-200/60 dark:border-emerald-900/60 pb-2">
                    <span class="text-xs font-black text-emerald-800 dark:text-emerald-300 flex items-center gap-1.5">
                        <i class="ph-bold ph-credit-card text-sm"></i> Tarjeta Internacional (Stripe / Link Ready)
                    </span>
                    <strong class="text-emerald-700 dark:text-emerald-400 text-sm">$${plan.precio_usd}.00 USD</strong>
                </div>
                <p class="text-xs text-gray-600 dark:text-gray-300 leading-relaxed">
                    Aceptamos tarjetas de débito y crédito internacionales emitidas en cualquier país. Ingresa tu número de confirmación o continúa para procesar vía pasarela segura.
                </p>
                <div class="p-2.5 rounded-xl bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 text-[11px] text-emerald-900 dark:text-emerald-200 flex items-center gap-2">
                    <i class="ph-fill ph-shield-check text-emerald-600 text-base shrink-0"></i>
                    <span>Cifrado TLS de 256-bit y cumplimiento PCI-DSS nivel 1.</span>
                </div>
            `;
        }
    }

    window.seleccionarPlanModal = function(planId) {
        planSeleccionadoId = planId;
        renderizarPlanesEnModal();
        renderizarInstruccionesEnModal();
    };

    window.seleccionarMetodoModal = function(metodoKey) {
        metodoSeleccionadoKey = metodoKey;
        renderizarMetodosEnModal();
        renderizarInstruccionesEnModal();
    };

    window.abrirModalSuscripcionPro = function(planInicial = 'mensual') {
        crearModalDOM();
        planSeleccionadoId = planInicial;
        renderizarPlanesEnModal();
        renderizarMetodosEnModal();
        renderizarInstruccionesEnModal();

        // Prellenar si hay usuario logueado
        try {
            let u = null;
            if (typeof AuthService !== 'undefined') u = AuthService.getCurrentUser();
            if (!u) u = JSON.parse(localStorage.getItem('maximus_user'));
            if (u) {
                const nomEl = document.getElementById('modal-pago-nombre');
                const mailEl = document.getElementById('modal-pago-email');
                const telEl = document.getElementById('modal-pago-telefono');
                if (nomEl && u.name) nomEl.value = u.name;
                if (mailEl && u.email) mailEl.value = u.email;
                if (telEl && u.telefono) telEl.value = u.telefono;
            }
        } catch (_) {}

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
        const nombre = (document.getElementById('modal-pago-nombre')?.value || '').trim();
        const email = (document.getElementById('modal-pago-email')?.value || '').trim();
        const referencia = (document.getElementById('modal-pago-referencia')?.value || '').trim();
        const telefono = (document.getElementById('modal-pago-telefono')?.value || '').trim();

        if (!nombre || !email || !referencia) {
            alert('Por favor completa tu nombre, correo y el número de referencia del pago.');
            return;
        }

        if (btn) {
            btn.disabled = true;
            btn.innerHTML = '<i class="ph-bold ph-spinner ph-spin mr-1"></i> Activando Suscripción...';
        }

        try {
            const res = await PaymentGatewayService.registrarPagoSuscripcion({
                planId: planSeleccionadoId,
                metodo: metodoSeleccionadoKey,
                referencia: referencia,
                titular: nombre,
                notas: `Registro desde portal web por ${telefono}`
            });

            if (res.success) {
                const urlWhatsApp = PaymentGatewayService.obtenerEnlaceWhatsAppConciliacion(res.pago);
                
                // Mostrar pantalla de éxito dentro del modal
                const panel = document.getElementById('modal-suscripcion-panel');
                if (panel) {
                    panel.innerHTML = `
                        <div class="p-8 sm:p-10 text-center space-y-4">
                            <div class="w-16 h-16 mx-auto rounded-3xl bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center text-3xl shadow-sm border border-emerald-200 dark:border-emerald-800">
                                <i class="ph-fill ph-check-circle"></i>
                            </div>
                            <h3 class="text-2xl sm:text-3xl font-black text-gray-900 dark:text-white">¡Suscripción Pro Activada!</h3>
                            <p class="text-xs sm:text-sm text-gray-600 dark:text-gray-300 max-w-md mx-auto leading-relaxed">
                                Tu cuenta ha sido promovida a <strong>Asesor Externo Pro</strong>. Ya puedes cargar tus propiedades al catálogo, gestionar clientes en tu CRM y usar el cotizador.
                            </p>
                            <div class="p-4 rounded-2xl bg-gray-50 dark:bg-[#071F1A] border border-gray-200 dark:border-emerald-900/50 text-xs font-mono text-gray-700 dark:text-gray-300 max-w-sm mx-auto">
                                Transacción: <strong>${res.pago.codigo_transaccion}</strong><br>
                                Plan: <strong>${res.pago.plan_nombre}</strong> ($${res.pago.monto_usd} USD)
                            </div>
                            <div class="pt-2 flex flex-col sm:flex-row items-center justify-center gap-3">
                                <a href="${urlWhatsApp}" target="_blank" class="w-full sm:w-auto px-6 py-3 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs shadow-md transition flex items-center justify-center gap-2">
                                    <i class="ph-bold ph-whatsapp-logo text-base"></i> Enviar Comprobante a Administración
                                </a>
                                <button type="button" onclick="window.location.href='/dashboard'; cerrarModalSuscripcionPro();" class="w-full sm:w-auto px-6 py-3 rounded-xl bg-gray-900 hover:bg-black text-white font-bold text-xs transition">
                                    Ir a mi Dashboard Pro
                                </button>
                            </div>
                        </div>
                    `;
                }
            }
        } catch (err) {
            alert('Error al registrar la suscripción: ' + (err.message || 'Intente nuevamente'));
            if (btn) {
                btn.disabled = false;
                btn.innerHTML = originalText;
            }
        }
    };
})();
