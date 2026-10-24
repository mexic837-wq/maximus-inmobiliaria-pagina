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
        div.className = 'fixed inset-0 z-[100] flex items-center justify-center p-3 sm:p-5 bg-black/50 backdrop-blur-sm opacity-0 pointer-events-none transition-all duration-300';
        div.setAttribute('role', 'dialog');
        div.setAttribute('aria-modal', 'true');
        
        div.innerHTML = `
            <div id="modal-suscripcion-panel" class="relative w-full max-w-lg bg-white dark:bg-[#071F1A] rounded-3xl shadow-2xl border border-gray-200 dark:border-emerald-950/60 overflow-hidden flex flex-col max-h-[92vh] transform scale-95 transition-all duration-300">
                
                <!-- Encabezado Minimalista -->
                <div class="px-6 pt-6 pb-4 border-b border-gray-100 dark:border-emerald-950/50 flex items-start justify-between">
                    <div>
                        <div class="inline-flex items-center gap-1.5 text-xs font-bold uppercase tracking-wider text-emerald-600 dark:text-emerald-400 mb-1">
                            <i class="ph-fill ph-seal-check text-sm"></i> Membresía Asesor Pro
                        </div>
                        <h3 class="text-xl sm:text-2xl font-black text-gray-900 dark:text-white tracking-tight">
                            Pasarela de Suscripción
                        </h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">
                            Publica tu inventario con tu WhatsApp directo y accede al CRM.
                        </p>
                    </div>
                    <button type="button" onclick="cerrarModalSuscripcionPro()" class="w-8 h-8 rounded-full bg-gray-100 dark:bg-emerald-950/60 hover:bg-gray-200 dark:hover:bg-emerald-900/60 text-gray-500 dark:text-gray-300 flex items-center justify-center transition-all cursor-pointer">
                        <i class="ph-bold ph-x text-sm"></i>
                    </button>
                </div>

                <!-- Contenido Scrollable Limpio -->
                <div class="p-6 overflow-y-auto space-y-5 text-gray-800 dark:text-gray-100 flex-1">
                    
                    <!-- 1. Ciclo de Facturación (Segmented Pill) -->
                    <div>
                        <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Ciclo de Facturación</label>
                        <div class="grid grid-cols-2 gap-2" id="modal-planes-container">
                            <!-- Inyectado por JS -->
                        </div>
                    </div>

                    <!-- 2. Método de Pago (Pills minimalistas) -->
                    <div>
                        <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-2">Método de Pago</label>
                        <div class="grid grid-cols-2 sm:grid-cols-4 gap-2" id="modal-metodos-container">
                            <!-- Inyectado por JS -->
                        </div>
                    </div>

                    <!-- 3. Datos de Transferencia Minimalistas -->
                    <div id="modal-instrucciones-box" class="p-4 rounded-2xl bg-gray-50 dark:bg-[#0A241F] border border-gray-200/80 dark:border-emerald-950/60 space-y-3">
                        <!-- Inyectado dinámicamente -->
                    </div>

                    <!-- 4. Formulario de Confirmación -->
                    <div class="space-y-3 pt-1">
                        <div class="grid grid-cols-1 sm:grid-cols-2 gap-3">
                            <div>
                                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Tu Nombre Completo *</label>
                                <input type="text" id="modal-pago-nombre" required class="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-emerald-900/50 bg-white dark:bg-[#061814] text-xs font-medium text-gray-900 dark:text-white outline-none focus:border-emerald-500" placeholder="Ej: Carlos Mendoza">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">WhatsApp / Teléfono *</label>
                                <input type="tel" id="modal-pago-telefono" required class="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-emerald-900/50 bg-white dark:bg-[#061814] text-xs font-medium text-gray-900 dark:text-white outline-none focus:border-emerald-500" placeholder="+58 414 1234567">
                            </div>
                        </div>

                        <div>
                            <label class="block text-xs font-bold text-gray-700 dark:text-gray-300 mb-1">Nro. de Referencia o Comprobante *</label>
                            <input type="text" id="modal-pago-referencia" required class="w-full px-3.5 py-2.5 rounded-xl border border-gray-200 dark:border-emerald-900/50 bg-white dark:bg-[#061814] text-xs font-medium text-gray-900 dark:text-white outline-none focus:border-emerald-500" placeholder="Ej: 19842018 (Últimos 6-8 dígitos)">
                        </div>

                        <!-- Hidden email field for compatibility -->
                        <input type="hidden" id="modal-pago-email" value="">
                    </div>

                </div>

                <!-- Footer Minimalista -->
                <div class="px-6 py-4 bg-gray-50/80 dark:bg-[#061814] border-t border-gray-100 dark:border-emerald-950/60 flex flex-col gap-2 shrink-0">
                    <button type="button" id="modal-btn-confirmar-pago" onclick="procesarPagoSuscripcionModal()" class="w-full py-3.5 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-500 active:scale-[0.98] text-white font-black text-xs tracking-wide shadow-md transition-all flex items-center justify-center gap-2 cursor-pointer">
                        <span id="modal-btn-text">Confirmar y Activar Membresía Pro</span>
                        <i class="ph-bold ph-arrow-right text-xs"></i>
                    </button>
                    
                    <div class="flex items-center justify-between text-[11px] text-gray-400 dark:text-gray-500 pt-1">
                        <span id="modal-total-display">Total: $19.00 USD</span>
                        <a href="https://wa.me/584240000000?text=Hola,%20deseo%20asistencia%20con%20el%20pago%20de%20mi%20membres%C3%ADa%20MAXIMUS" target="_blank" class="hover:text-emerald-600 font-medium transition">
                            ¿Dudas? Chatear con Soporte
                        </a>
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
        
        // Expose only Mensual and Anual in the minimalist modal
        const planesList = [planes.MENSUAL, planes.ANUAL];
        
        container.innerHTML = planesList.map(p => {
            const isSel = p.id === planSeleccionadoId;
            return `
                <div onclick="seleccionarPlanModal('${p.id}')" class="cursor-pointer rounded-2xl border-2 p-3 transition-all ${isSel ? 'border-emerald-600 bg-white dark:bg-[#0B2A22] shadow-xs' : 'border-gray-200 dark:border-emerald-950/60 bg-gray-50 dark:bg-[#061814] hover:border-gray-300'}">
                    <div class="flex items-center justify-between">
                        <span class="text-xs font-bold text-gray-900 dark:text-white">${p.nombre}</span>
                        ${p.badge ? `<span class="px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300 text-[9px] font-black uppercase">${p.badge}</span>` : ''}
                    </div>
                    <div class="flex items-baseline gap-1 mt-1">
                        <span class="text-lg font-black text-gray-900 dark:text-white">$${p.precio_usd}</span>
                        <span class="text-[10px] text-gray-400 font-medium">${p.periodo_label}</span>
                    </div>
                </div>
            `;
        }).join('');
    }

    function renderizarMetodosEnModal() {
        const container = document.getElementById('modal-metodos-container');
        if (!container) return;

        const metodos = [
            { key: 'PAGO_MOVIL', nombre: 'Pago Móvil', icon: 'ph-device-mobile' },
            { key: 'ZELLE', nombre: 'Zelle', icon: 'ph-currency-dollar' },
            { key: 'BINANCE_PAY', nombre: 'Binance USDT', icon: 'ph-currency-btc' },
            { key: 'TARJETA_INTERNACIONAL', nombre: 'Tarjeta', icon: 'ph-credit-card' }
        ];

        container.innerHTML = metodos.map(m => {
            const isSel = m.key === metodoSeleccionadoKey;
            return `
                <button type="button" onclick="seleccionarMetodoModal('${m.key}')" class="py-2.5 px-3 rounded-xl border text-center transition-all cursor-pointer flex flex-col items-center gap-1 ${isSel ? 'border-emerald-600 bg-emerald-50/70 dark:bg-emerald-950/60 text-emerald-900 dark:text-emerald-200 font-bold' : 'border-gray-200 dark:border-emerald-950/60 bg-white dark:bg-[#061814] text-gray-600 dark:text-gray-300 hover:border-gray-300'}">
                    <i class="ph-bold ${m.icon} text-base ${isSel ? 'text-emerald-600 dark:text-emerald-400' : 'text-gray-400'}"></i>
                    <span class="text-[11px] leading-tight">${m.nombre}</span>
                </button>
            `;
        }).join('');
    }

    // Helper for sleek 1-click clipboard feedback
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

        const totalDisp = document.getElementById('modal-total-display');

        if (metodoSeleccionadoKey === 'PAGO_MOVIL') {
            if (totalDisp) totalDisp.innerHTML = `Total: <strong class="text-gray-900 dark:text-white">Bs. ${bolivares}</strong> ($${plan.precio_usd} USD a tasa BCV)`;
            box.innerHTML = `
                <div class="flex items-center justify-between border-b border-gray-200/60 dark:border-emerald-950/60 pb-2">
                    <span class="text-xs font-bold text-gray-800 dark:text-gray-200">Datos para Pago Móvil</span>
                    <span class="text-[10px] text-gray-500 font-mono">Tasa BCV: Bs. ${tasa.toFixed(2)}</span>
                </div>
                <div class="grid grid-cols-2 gap-3 text-xs pt-1">
                    <div>
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Banco:</span>
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
            if (totalDisp) totalDisp.innerHTML = `Total: <strong class="text-gray-900 dark:text-white">$${plan.precio_usd}.00 USD</strong>`;
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
                        <span class="text-gray-400 text-[10px] uppercase font-bold block">Titular:</span>
                        <strong class="text-gray-900 dark:text-white">${cfg.titular || 'MAXIMUS Real Estate Services LLC'}</strong>
                    </div>
                </div>
            `;
        } else if (metodoSeleccionadoKey === 'BINANCE_PAY') {
            if (totalDisp) totalDisp.innerHTML = `Total: <strong class="text-gray-900 dark:text-white">${plan.precio_usd}.00 USDT</strong>`;
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
            if (totalDisp) totalDisp.innerHTML = `Total: <strong class="text-gray-900 dark:text-white">$${plan.precio_usd}.00 USD</strong>`;
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
        const telefono = (document.getElementById('modal-pago-telefono')?.value || '').trim();
        const referencia = (document.getElementById('modal-pago-referencia')?.value || '').trim();
        let email = (document.getElementById('modal-pago-email')?.value || '').trim();

        if (!email) {
            email = (nombre.toLowerCase().replace(/\s+/g, '.') || 'asesor') + '@maximusinmobiliaria.com';
        }

        if (!nombre || !referencia) {
            alert('Por favor indica tu nombre y el número de referencia del pago.');
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
                notas: `Registro web asesor por ${telefono}`
            });

            if (res.success) {
                const urlWhatsApp = PaymentGatewayService.obtenerEnlaceWhatsAppConciliacion(res.pago);
                
                const panel = document.getElementById('modal-suscripcion-panel');
                if (panel) {
                    panel.innerHTML = `
                        <div class="p-8 sm:p-10 text-center space-y-4">
                            <div class="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center text-3xl">
                                <i class="ph-fill ph-check-circle"></i>
                            </div>
                            <h3 class="text-2xl font-black text-gray-900 dark:text-white">¡Membresía Activada!</h3>
                            <p class="text-xs sm:text-sm text-gray-500 max-w-sm mx-auto leading-relaxed">
                                Tu cuenta ahora cuenta con permisos de <strong>Asesor Pro</strong> para cargar inmuebles y gestionar prospectos.
                            </p>
                            <div class="p-3 rounded-xl bg-gray-50 text-xs font-mono text-gray-600 max-w-xs mx-auto">
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
