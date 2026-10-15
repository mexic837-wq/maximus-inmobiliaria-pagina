/**
 * ==============================================================================
 * MAXIMUS INMOBILIARIA - Servicio de Autenticación y Sesión Inteligente
 * ==============================================================================
 * 
 * Gestiona autenticación, roles, persistencia inteligente ("Recordar dispositivo"),
 * auto-redirección de sesión y cierre de sesión seguro tanto en MOCK como en Supabase.
 */

const AuthService = {

    KEYS: {
        USER: 'maximus_user',
        REMEMBER: 'maximus_remember_device',
        SAVED_EMAIL: 'maximus_saved_email',
        EXPLICIT_LOGOUT: 'maximus_logged_out',
        SESSION_TIMESTAMP: 'maximus_session_start'
    },

    /**
     * Iniciar sesión.
     * @param {string} email 
     * @param {string} password 
     * @param {boolean} rememberDevice - Si es true, la sesión se mantiene en este dispositivo indefinidamente.
     * @returns {Promise<{success: boolean, user?: object, error?: string}>}
     */
    async login(email, password, rememberDevice = false) {
        let result;
        if (APP_CONFIG.USE_MOCK_DATA) {
            result = this._mockLogin(email, password);
        } else {
            result = await this._supabaseLogin(email, password);
        }

        if (result.success && result.user) {
            this._saveSession(result.user, email, rememberDevice);
        }

        return result;
    },

    /**
     * Guardar sesión respetando la preferencia de "Recordar dispositivo".
     */
    _saveSession(user, email, rememberDevice) {
        // Limpiar marca de logout explícito
        localStorage.removeItem(this.KEYS.EXPLICIT_LOGOUT);

        const serialized = JSON.stringify(user);
        const timestamp = Date.now().toString();

        if (rememberDevice) {
            // Guardar permanentemente en localStorage
            localStorage.setItem(this.KEYS.USER, serialized);
            localStorage.setItem(this.KEYS.REMEMBER, 'true');
            localStorage.setItem(this.KEYS.SAVED_EMAIL, email || user.email);
            localStorage.setItem(this.KEYS.SESSION_TIMESTAMP, timestamp);
            sessionStorage.removeItem(this.KEYS.USER);
        } else {
            // Guardar solo para la sesión actual del navegador (se pierde al cerrar la ventana)
            sessionStorage.setItem(this.KEYS.USER, serialized);
            sessionStorage.setItem(this.KEYS.SESSION_TIMESTAMP, timestamp);
            localStorage.removeItem(this.KEYS.USER);
            localStorage.removeItem(this.KEYS.REMEMBER);
            localStorage.removeItem(this.KEYS.SAVED_EMAIL);
        }
    },

    /**
     * Cerrar sesión de manera explícita y segura.
     */
    async logout() {
        // Marcar que el usuario salió intencionalmente para no auto-loguearlo en la siguiente visita
        localStorage.setItem(this.KEYS.EXPLICIT_LOGOUT, 'true');
        localStorage.removeItem(this.KEYS.USER);
        sessionStorage.removeItem(this.KEYS.USER);

        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = typeof getSupabase === 'function' ? getSupabase() : null;
                if (sb && sb.auth) {
                    await sb.auth.signOut();
                }
            } catch (e) {
                console.warn('Aviso: error cerrando sesión en Supabase:', e);
            }
        }

        window.location.href = '/login';
    },

    /**
     * Obtener usuario actual (busca primero en sessionStorage y luego en localStorage).
     * @returns {object|null}
     */
    getCurrentUser() {
        const sessionData = sessionStorage.getItem(this.KEYS.USER);
        if (sessionData) {
            try { return JSON.parse(sessionData); } catch (e) {}
        }

        const localData = localStorage.getItem(this.KEYS.USER);
        if (localData) {
            try { return JSON.parse(localData); } catch (e) {}
        }

        return null;
    },

    /**
     * Consulta si el usuario tiene sesión activa actualmente.
     * @returns {boolean}
     */
    isAuthenticated() {
        if (localStorage.getItem(this.KEYS.EXPLICIT_LOGOUT) === 'true') {
            return false;
        }
        return this.getCurrentUser() !== null;
    },

    /**
     * Verificación inteligente asíncrona completa (compatible con Supabase Auth y Local/Session).
     * @returns {Promise<boolean>}
     */
    async checkSession() {
        // Si el usuario presionó "Cerrar Sesión", no lo auto-logueamos
        if (localStorage.getItem(this.KEYS.EXPLICIT_LOGOUT) === 'true') {
            return false;
        }

        // Si estamos en modo Supabase real, verificar token activo
        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = typeof getSupabase === 'function' ? getSupabase() : null;
                if (sb && sb.auth) {
                    const { data: { session }, error } = await sb.auth.getSession();
                    if (!error && session && session.user) {
                        // Si no tenemos el perfil en cache local, lo sincronizamos
                        let user = this.getCurrentUser();
                        if (!user) {
                            const { data: perfil } = await sb
                                .from(APP_CONFIG.TABLES.USUARIOS)
                                .select('*')
                                .eq('auth_id', session.user.id)
                                .single();

                            user = {
                                id: session.user.id,
                                name: perfil ? perfil.nombre_completo : (session.user.user_metadata?.nombre_completo || session.user.email.split('@')[0]),
                                email: session.user.email,
                                role: perfil ? perfil.rol : (session.user.user_metadata?.rol || 'asesor_maximus'),
                                title: perfil ? perfil.titulo : 'Asesor Inmobiliario',
                                avatar: perfil ? perfil.avatar_url : `https://ui-avatars.com/api/?name=${encodeURIComponent(session.user.email)}&background=0B4A3F&color=fff&bold=true`
                            };
                            this._saveSession(user, session.user.email, this.shouldRemember());
                        }
                        return true;
                    }
                }
            } catch (err) {
                console.warn('Aviso: Verificación de sesión Supabase fallback a local:', err);
            }
        }

        // En modo mock o como respaldo rápido
        return this.getCurrentUser() !== null;
    },

    /**
     * Verifica si se marcó previamente "Recordar dispositivo".
     * @returns {boolean}
     */
    shouldRemember() {
        return localStorage.getItem(this.KEYS.REMEMBER) === 'true';
    },

    /**
     * Retorna el correo recordado si existe.
     * @returns {string}
     */
    getSavedEmail() {
        return localStorage.getItem(this.KEYS.SAVED_EMAIL) || '';
    },

    /**
     * Verifica si el usuario actual tiene un rol específico.
     * @param {string} role
     * @returns {boolean}
     */
    hasRole(role) {
        const user = this.getCurrentUser();
        return user ? user.role === role : false;
    },

    isAdmin() {
        return this.hasRole(APP_CONFIG.ROLES.ADMIN);
    },

    isAsesorMaximus() {
        return this.hasRole(APP_CONFIG.ROLES.ASESOR_MAXIMUS) || this.hasRole('agente');
    },

    isAsesorExterno() {
        return this.hasRole(APP_CONFIG.ROLES.ASESOR_EXTERNO);
    },

    canAccessHistorico() {
        const user = this.getCurrentUser();
        if (!user) return false;
        return user.role === APP_CONFIG.ROLES.ADMIN || 
               user.role === APP_CONFIG.ROLES.ASESOR_MAXIMUS || 
               user.role === 'agente';
    },

    /**
     * Proteger página: redirige al login si no hay sesión.
     */
    async requireAuth(redirectTo = '/login') {
        const isAuth = await this.checkSession();
        if (!isAuth) {
            window.location.replace(redirectTo);
        }
    },

    /**
     * Proteger login: redirige al dashboard si ya hay sesión activa.
     */
    async redirectIfAuthenticated(targetUrl = '/dashboard') {
        const isAuth = await this.checkSession();
        if (isAuth) {
            window.location.replace(targetUrl);
        }
    },

    // ===== IMPLEMENTACIONES PRIVADAS =====

    /**
     * Login MOCK
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
                    tipo_asesor: 'maximus',
                    title: 'Director / Administrador',
                    avatar: 'https://ui-avatars.com/api/?name=Jose+Guerrero&background=0B4A3F&color=fff&bold=true',
                }
            },
            'asesor.maximus@maximus.com': {
                password: 'maximus123',
                user: {
                    id: 'asesor-2',
                    name: 'Valeria Méndez',
                    email: 'asesor.maximus@maximus.com',
                    role: APP_CONFIG.ROLES.ASESOR_MAXIMUS,
                    tipo_asesor: 'maximus',
                    title: 'Asesor MAXIMUS Oficial',
                    avatar: 'https://ui-avatars.com/api/?name=Valeria+Mendez&background=0A3D33&color=fff&bold=true',
                }
            },
            'asesor.externo@maximus.com': {
                password: 'externo123',
                user: {
                    id: 'asesor-5',
                    name: 'Pedro Rivas',
                    email: 'asesor.externo@maximus.com',
                    role: APP_CONFIG.ROLES.ASESOR_EXTERNO,
                    tipo_asesor: 'externo',
                    title: 'Asesor Externo / Colega Aliado',
                    avatar: 'https://ui-avatars.com/api/?name=Pedro+Rivas&background=1E3A8A&color=fff&bold=true',
                }
            },
            'agente@maximus.com': {
                password: 'agente123',
                user: {
                    id: 'mock-agente-001',
                    name: 'Carlos Pérez',
                    email: 'agente@maximus.com',
                    role: APP_CONFIG.ROLES.ASESOR_MAXIMUS,
                    tipo_asesor: 'maximus',
                    title: 'Asesor Inmobiliario MAXIMUS',
                    avatar: 'https://ui-avatars.com/api/?name=Carlos+Perez&background=0B4A3F&color=fff&bold=true',
                }
            }
        };

        const entry = mockUsers[email.toLowerCase().trim()];

        if (!entry) {
            return { success: false, error: 'Usuario no encontrado. Utilice una cuenta autorizada.' };
        }
        if (entry.password !== password) {
            return { success: false, error: 'Contraseña incorrecta.' };
        }

        return { success: true, user: entry.user };
    },

    /**
     * Login REAL con Supabase Auth.
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

            const user = {
                id: data.user.id,
                name: perfil ? perfil.nombre_completo : (data.user.user_metadata?.nombre_completo || data.user.email.split('@')[0]),
                email: data.user.email,
                role: perfil ? perfil.rol : (data.user.user_metadata?.rol || 'asesor_maximus'),
                title: perfil ? perfil.titulo : 'Asesor Inmobiliario',
                avatar: perfil ? perfil.avatar_url : `https://ui-avatars.com/api/?name=${encodeURIComponent(data.user.email)}&background=0B4A3F&color=fff&bold=true`,
            };

            return { success: true, user };

        } catch (err) {
            return { success: false, error: 'Error de conexión con el servidor Supabase: ' + (err.message || '') };
        }
    },
};

// Exportar globalmente
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}
