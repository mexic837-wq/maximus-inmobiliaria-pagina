/**
 * ============================================
 * MAXIMUS - Servicio de Autenticación
 * ============================================
 * 
 * Maneja login, logout, sesión y roles.
 * En modo MOCK usa localStorage.
 * En producción usa Supabase Auth.
 */

const AuthService = {

    /**
     * Iniciar sesión.
     * @param {string} email 
     * @param {string} password 
     * @returns {Promise<{success: boolean, user?: object, error?: string}>}
     */
    async login(email, password) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            return this._mockLogin(email, password);
        }
        return this._supabaseLogin(email, password);
    },

    /**
     * Cerrar sesión.
     */
    async logout() {
        if (APP_CONFIG.USE_MOCK_DATA) {
            localStorage.removeItem('maximus_user');
            localStorage.removeItem('maximus_session');
            window.location.href = 'login.html';
            return;
        }
        
        const sb = getSupabase();
        await sb.auth.signOut();
        localStorage.removeItem('maximus_user');
        window.location.href = 'login.html';
    },

    /**
     * Obtener usuario actual de la sesión.
     * @returns {object|null}
     */
    getCurrentUser() {
        const data = localStorage.getItem('maximus_user');
        return data ? JSON.parse(data) : null;
    },

    /**
     * Verificar si hay sesión activa.
     * @returns {boolean}
     */
    isAuthenticated() {
        return this.getCurrentUser() !== null;
    },

    /**
     * Verificar si el usuario actual tiene un rol específico.
     * @param {string} role - 'admin' o 'agente'
     * @returns {boolean}
     */
    hasRole(role) {
        const user = this.getCurrentUser();
        return user ? user.role === role : false;
    },

    /**
     * Proteger una página: redirige al login si no hay sesión.
     */
    requireAuth() {
        if (!this.isAuthenticated()) {
            window.location.href = 'login.html';
        }
    },

    // ===== IMPLEMENTACIONES PRIVADAS =====

    /**
     * Login MOCK (datos ficticios para desarrollo local).
     */
    _mockLogin(email, password) {
        const mockUsers = {
            'admin@maximus.com': {
                password: 'admin123',
                user: {
                    id: 'mock-admin-001',
                    name: 'José Guerrero',
                    email: 'admin@maximus.com',
                    role: APP_CONFIG.ROLES.ADMIN,
                    title: 'Director / Administrador',
                    avatar: null,
                }
            },
            'agente@maximus.com': {
                password: 'agente123',
                user: {
                    id: 'mock-agente-001',
                    name: 'Carlos Pérez',
                    email: 'agente@maximus.com',
                    role: APP_CONFIG.ROLES.AGENTE,
                    title: 'Asesor Inmobiliario',
                    avatar: null,
                }
            }
        };

        const entry = mockUsers[email.toLowerCase().trim()];

        if (!entry) {
            return { success: false, error: 'Usuario no encontrado.' };
        }
        if (entry.password !== password) {
            return { success: false, error: 'Contraseña incorrecta.' };
        }

        // Guardar sesión en localStorage
        localStorage.setItem('maximus_user', JSON.stringify(entry.user));
        return { success: true, user: entry.user };
    },

    /**
     * Login REAL con Supabase Auth.
     * Se activará cuando USE_MOCK_DATA sea false.
     */
    async _supabaseLogin(email, password) {
        try {
            const sb = getSupabase();

            // 1. Autenticar con Supabase Auth
            const { data, error } = await sb.auth.signInWithPassword({
                email: email,
                password: password,
            });

            if (error) {
                return { success: false, error: error.message };
            }

            // 2. Obtener perfil y rol del usuario desde la tabla 'usuarios'
            const { data: perfil, error: perfilError } = await sb
                .from(APP_CONFIG.TABLES.USUARIOS)
                .select('*')
                .eq('auth_id', data.user.id)
                .single();

            if (perfilError) {
                return { success: false, error: 'No se encontró el perfil del usuario.' };
            }

            const user = {
                id: data.user.id,
                name: perfil.nombre_completo,
                email: data.user.email,
                role: perfil.rol,
                title: perfil.titulo || 'Agente',
                avatar: perfil.avatar_url,
            };

            localStorage.setItem('maximus_user', JSON.stringify(user));
            return { success: true, user };

        } catch (err) {
            return { success: false, error: 'Error de conexión con el servidor.' };
        }
    },
};

// Exportar
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}
