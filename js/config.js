/**
 * ============================================
 * MAXIMUS INMOBILIARIA - Configuración Central
 * ============================================
 * 
 * Este archivo centraliza TODAS las configuraciones del proyecto.
 * Cuando instales Supabase y n8n en tu VPS, solo necesitas
 * cambiar los valores aquí y todo el frontend se conectará.
 * 
 * INSTRUCCIONES PARA PRODUCCIÓN:
 * 1. Reemplaza SUPABASE_URL con tu URL real (ej: https://xxxxx.supabase.co)
 * 2. Reemplaza SUPABASE_ANON_KEY con tu clave anon real
 * 3. Reemplaza N8N_BASE_URL con tu URL de n8n (ej: https://n8n.tudominio.com)
 * 4. Cambia USE_MOCK_DATA a false
 */

const APP_CONFIG = {

    // ========== MODO DE DATOS ==========
    // true  = Usa datos ficticios (desarrollo local sin backend)
    // false = Conecta a Supabase y n8n reales (producción)
    USE_MOCK_DATA: false,

    // ========== SUPABASE (VPS PRODUCCIÓN) ==========
    SUPABASE_URL: 'https://db.maximusinmobiliaria.tech',
    SUPABASE_ANON_KEY: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzkyMDg0NDk2LCJleHAiOjE5NDk3NjQ0OTZ9.KQWVxf3I0ZgLCCTvB8MfwmDugkozWFFUwgr3lhiCcg8',
    // SERVICE_ROLE_KEY para n8n (NO exponer en frontend):
    // eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIiwiaXNzIjoic3VwYWJhc2UiLCJpYXQiOjE3OTIwODQ0OTYsImV4cCI6MTk0OTc2NDQ5Nn0.knU9MwRLtyc10C1pjnHih-0xXtarvEqH8t7jMia7Oko

    // ========== N8N (Webhooks de Automatización) ==========
    ENABLE_N8N_WEBHOOKS: true,
    COMPANY_NOTIFY_EMAIL: 'contacto@maximusinmobiliaria.com',
    N8N_BASE_URL: 'https://n8n.maximusinmobiliaria.tech',
    N8N_WEBHOOKS: {
        // Cada webhook es un endpoint de n8n que dispara un workflow
        NUEVO_LEAD:              '/webhook/nuevo-lead',
        VALORACION_LEAD:         '/webhook/valoracion-lead',
        CONTACTAR_WHATSAPP:      '/webhook/contactar-whatsapp',
        NUEVO_INMUEBLE:          '/webhook/nuevo-inmueble',
        CIERRE_REGISTRADO:       '/webhook/cierre-registrado',
        ENVIAR_DOSSIER_VIP:      '/webhook/enviar-dossier-vip',
        ENVIAR_FICHA_VIP:        '/webhook/enviar-ficha-vip',
        NUEVA_CITA:              '/webhook/nueva-cita',
        BIENVENIDA_ASESOR:       '/webhook/bienvenida-asesor',
        NOTIFICACION_AGENTE:     '/webhook/notificacion-agente',
        GENERAR_REPORTE:         '/webhook/generar-reporte',
        SUBIR_IMAGEN:            '/webhook/subir-imagen',
        AUTH_CAMBIO_PASSWORD:    '/webhook/auth-cambio-password',
        AUTH_RECUPERAR_PASSWORD: '/webhook/auth-recuperar-password',
        AUTH_VERIFICACION_2FA:   '/webhook/auth-verificacion-2fa',
        AUTH_2FA_CAMBIO_ESTADO:  '/webhook/auth-2fa-cambio-estado',
        PERFIL_ACTUALIZADO:      '/webhook/perfil-actualizado',
        CONFIRMACION_PAGO:       '/webhook/confirmacion-pago',
    },

    // ========== STORAGE (Imágenes de Inmuebles) ==========
    // Supabase Storage bucket donde se guardarán las fotos
    STORAGE_BUCKET: 'inmuebles-fotos',

    // ========== ROLES DE USUARIO ==========
    ROLES: {
        ADMIN: 'admin',
        ASESOR_MAXIMUS: 'asesor_maximus',
        AGENTE: 'agente', // Compatibilidad hacia atrás
        ASESOR_EXTERNO: 'asesor_externo', // Cuenta de paga para Asesores Externos
        CLIENTE: 'cliente', // Usuario normal / cliente
        USUARIO: 'cliente', // Alias
    },

    // ========== PLANES DE SUSCRIPCIÓN (ASESORES EXTERNOS) ==========
    PLANES_SUSCRIPCION: {
        MENSUAL: {
            id: 'mensual',
            nombre: 'Plan Mensual Pro',
            precio_usd: 19,
            periodo_label: '/mes',
            descripcion: 'Acceso completo al CRM, cotizador, colecciones y carga de inmuebles.',
            badge: null
        },
        TRIMESTRAL: {
            id: 'trimestral',
            nombre: 'Plan Trimestral Pro',
            precio_usd: 49,
            periodo_label: '/trimestre',
            descripcion: 'Equivalente a $16.33/mes. Ahorra 15% con facturación trimestral.',
            badge: 'Ahorra 15%'
        },
        ANUAL: {
            id: 'anual',
            nombre: 'Plan Anual Pro',
            precio_usd: 169,
            periodo_label: '/año',
            descripcion: 'Equivalente a $14.08/mes. Recibe 2 meses completamente gratis.',
            badge: '2 Meses Gratis · Mejor Valor'
        }
    },

    // ========== CONFIGURACIÓN DE PASARELAS DE PAGO VENEZUELA ==========
    DATOS_PAGO_VENEZUELA: {
        TASA_BCV_USD: 75.00, // Tasa referencial oficial actualizable automáticamente o vía admin
        WHATSAPP_CONCILIACION: '584247835697',
        METODOS: {
            PAGO_MOVIL: {
                activo: true,
                nombre: 'Pago Móvil (Bolívares)',
                banco: '0102 - Banco de Venezuela / 0134 - Banesco',
                telefono: '04247835697',
                ci_rif: 'V-20123456',
                titular: 'MAXIMUS Inmobiliaria C.A.',
                instrucciones: 'Realiza el pago móvil al cambio oficial BCV del día. Al finalizar, ingresa el número de referencia y envía el comprobante.'
            },
            ZELLE: {
                activo: true,
                nombre: 'Zelle (Dólares USD)',
                correo: 'pagos@maximusinmobiliaria.com',
                titular: 'MAXIMUS Real Estate Services LLC',
                instrucciones: 'Envía el monto exacto vía Zelle colocando tu nombre y correo en la nota de transferencia.'
            },
            BINANCE_PAY: {
                activo: true,
                nombre: 'Binance Pay / USDT',
                pay_id: '849201938',
                red: 'USDT (Red BNB Smart Chain BEP20 / TRC20)',
                wallet: '0x71C949e29088523A3521b444bB47385203A90001',
                instrucciones: 'Paga de forma instantánea y sin comisiones con Binance Pay ID o transfiere USDT a la wallet institucional.'
            },
            ZINLI: {
                activo: true,
                nombre: 'Zinli / Wally Tech',
                correo: 'pagos@maximusinmobiliaria.com',
                instrucciones: 'Envía de billetera a billetera Zinli o Wally usando nuestro correo oficial.'
            },
            TARJETA_INTERNACIONAL: {
                activo: true,
                nombre: 'Tarjeta de Crédito / Débito Internacional (Stripe / Link)',
                modo: 'stripe_ready', // Preparado para conectar llave pública Stripe cuando esté lista
                instrucciones: 'Procesamiento seguro con cifrado TLS 256-bit compatible con Visa, Mastercard y American Express.'
            }
        }
    },

    // ========== TABLAS DE SUPABASE (Nombres) ==========
    // Referencia rápida de las tablas que crearás en Supabase
    TABLES: {
        USUARIOS: 'usuarios',
        INMUEBLES: 'inmuebles',
        LEADS: 'leads',
        CITAS: 'citas',
        PAGOS: 'pagos',
        DOCUMENTOS: 'documentos',
        ZONAS_COTIZADOR: 'zonas_cotizador',
        CIERRES_VENTAS: 'cierres_ventas',
        HISTORICO_ASESORES: 'cierres_ventas',
        COLECCIONES_VIP: 'colecciones_vip',
        EQUIPO_WEB: 'equipo_web',
        SECCIONES_WEB: 'secciones_web',
        ASESORES_MAXIMUS: 'asesores_maximus',
        NOTIFICACIONES: 'notificaciones',
        MATERIAL_INFORMATIVO: 'material_informativo',
        TUTORIALES: 'material_informativo',
    },
};

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.APP_CONFIG = APP_CONFIG;
}

