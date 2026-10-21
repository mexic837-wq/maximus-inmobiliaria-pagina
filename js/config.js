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
    },

    // ========== STORAGE (Imágenes de Inmuebles) ==========
    // Supabase Storage bucket donde se guardarán las fotos
    STORAGE_BUCKET: 'inmuebles-fotos',

    // ========== ROLES DE USUARIO ==========
    ROLES: {
        ADMIN: 'admin',
        ASESOR_MAXIMUS: 'asesor_maximus',
        AGENTE: 'agente', // Compatibilidad hacia atrás
        CLIENTE: 'cliente', // Usuario normal / cliente
        USUARIO: 'cliente', // Alias
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

