/**
 * ============================================
 * MAXIMUS - Cliente de Supabase
 * ============================================
 * 
 * Inicializa la conexión con Supabase.
 * En modo MOCK no carga la librería, evitando errores.
 * 
 * PARA PRODUCCIÓN:
 * Agrega este script en tu HTML ANTES de este archivo:
 * <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
 */

let supabase = null;

function initSupabase() {
    if (APP_CONFIG.USE_MOCK_DATA) {
        console.log('🟡 MAXIMUS: Modo MOCK activo. Supabase no se conectará.');
        return null;
    }

    if (typeof window.supabase === 'undefined' && typeof createClient === 'undefined') {
        console.error('❌ MAXIMUS: La librería de Supabase no está cargada. Agrega el CDN en tu HTML.');
        return null;
    }

    // Crear cliente de Supabase
    const { createClient } = window.supabase || window;
    supabase = createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY);
    console.log('✅ MAXIMUS: Supabase conectado correctamente.');
    return supabase;
}

/**
 * Retorna la instancia activa de Supabase.
 * Lanza error si se intenta usar sin inicializar.
 */
function getSupabase() {
    if (!supabase) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            return null; // En modo mock, devuelve null silenciosamente
        }
        throw new Error('Supabase no ha sido inicializado. Llama a initSupabase() primero.');
    }
    return supabase;
}

// Exportar para uso global
if (typeof window !== 'undefined') {
    window.initSupabase = initSupabase;
    window.getSupabase = getSupabase;
}
