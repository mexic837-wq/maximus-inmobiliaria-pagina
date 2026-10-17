/**
 * ==============================================================================
 * MAXIMUS INMOBILIARIA - Cliente Centralizado de Supabase
 * ==============================================================================
 * 
 * Inicializa y administra de forma segura la instancia del cliente Supabase.
 * Evita colisiones de identificadores en el ámbito global del navegador
 * y realiza auto-inicialización bajo demanda (Lazy Loading).
 */

(function () {
    'use strict';

    let _supabaseClientInstance = null;

    /**
     * Inicializa la conexión con Supabase utilizando la configuración de APP_CONFIG.
     */
    function initSupabase() {
        if (typeof APP_CONFIG === 'undefined') {
            console.warn('⚠️ MAXIMUS: APP_CONFIG aún no está disponible.');
            return null;
        }

        if (APP_CONFIG.USE_MOCK_DATA) {
            return null;
        }

        const supabaseLib = window.supabase || (typeof createClient === 'function' ? { createClient } : null);
        if (!supabaseLib || typeof supabaseLib.createClient !== 'function') {
            console.warn('⚠️ MAXIMUS: La librería @supabase/supabase-js aún no se ha cargado.');
            return null;
        }

        if (!APP_CONFIG.SUPABASE_URL || !APP_CONFIG.SUPABASE_ANON_KEY) {
            console.warn('⚠️ MAXIMUS: SUPABASE_URL o SUPABASE_ANON_KEY no están configurados.');
            return null;
        }

        try {
            _supabaseClientInstance = supabaseLib.createClient(APP_CONFIG.SUPABASE_URL, APP_CONFIG.SUPABASE_ANON_KEY, {
                auth: {
                    persistSession: true,
                    autoRefreshToken: true,
                    detectSessionInUrl: true
                }
            });
            console.log('✅ MAXIMUS: Supabase conectado correctamente.');
            return _supabaseClientInstance;
        } catch (err) {
            console.error('❌ MAXIMUS: Error al inicializar cliente Supabase:', err);
            return null;
        }
    }

    /**
     * Retorna la instancia activa de Supabase.
     * Si aún no fue creada, intenta inicializarla automáticamente.
     */
    function getSupabase() {
        if (!_supabaseClientInstance) {
            initSupabase();
        }
        return _supabaseClientInstance;
    }

    // Exportar al objeto global window sin colisionar con la librería Supabase
    if (typeof window !== 'undefined') {
        window.initSupabase = initSupabase;
        window.getSupabase = getSupabase;
    }
})();
