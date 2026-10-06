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
    USE_MOCK_DATA: true,

    // ========== SUPABASE ==========
    SUPABASE_URL: 'https://TU-PROYECTO.supabase.co',       // ← Cambia esto
    SUPABASE_ANON_KEY: 'TU-ANON-KEY-PUBLICA-AQUI',         // ← Cambia esto

    // ========== N8N (Webhooks de Automatización) ==========
    N8N_BASE_URL: 'https://n8n.tudominio.com',              // ← Cambia esto
    N8N_WEBHOOKS: {
        // Cada webhook es un endpoint de n8n que dispara un workflow
        NUEVO_LEAD:          '/webhook/nuevo-lead',
        CONTACTAR_WHATSAPP:  '/webhook/contactar-whatsapp',
        NUEVO_INMUEBLE:      '/webhook/nuevo-inmueble',
        NOTIFICACION_AGENTE: '/webhook/notificacion-agente',
        GENERAR_REPORTE:     '/webhook/generar-reporte',
        SUBIR_IMAGEN:        '/webhook/subir-imagen',
    },

    // ========== STORAGE (Imágenes de Inmuebles) ==========
    // Supabase Storage bucket donde se guardarán las fotos
    STORAGE_BUCKET: 'inmuebles-fotos',

    // ========== ROLES DE USUARIO ==========
    ROLES: {
        ADMIN: 'admin',
        AGENTE: 'agente',
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
    },
};

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.APP_CONFIG = APP_CONFIG;
}
