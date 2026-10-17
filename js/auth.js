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
     * Crear una nueva cuenta para usuario normal / cliente.
     * @param {object} data - { nombre, email, password, telefono }
     * @returns {Promise<{success: boolean, user?: object, error?: string, requiresEmailConfirmation?: boolean, message?: string}>}
     */
    async register({ nombre, email, password, telefono = '' }) {
        if (!nombre || !email || !password) {
            return { success: false, error: 'Por favor completa todos los campos obligatorios.' };
        }
        if (password.length < 6) {
            return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
        }

        if (APP_CONFIG.USE_MOCK_DATA) {
            return this._mockRegister({ nombre, email, password, telefono });
        }
        return this._supabaseRegister({ nombre, email, password, telefono });
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
     * @param {string} role - 'admin', 'asesor_maximus', 'asesor_externo', 'agente' o 'cliente'
     * @returns {boolean}
     */
    hasRole(role) {
        const user = this.getCurrentUser();
        if (!user) return false;
        if (role === 'cliente' && (user.role === 'cliente' || user.role === 'usuario')) return true;
        return user.role === role;
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

    isCliente() {
        return this.hasRole(APP_CONFIG.ROLES.CLIENTE) || this.hasRole('usuario');
    },

    canAccessHistorico() {
        const user = this.getCurrentUser();
        if (!user) return false;
        // Permitido únicamente para Asesores Maximus y Administradores
        return user.role === APP_CONFIG.ROLES.ADMIN || 
               user.role === APP_CONFIG.ROLES.ASESOR_MAXIMUS || 
               user.role === 'agente';
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
        const cleanEmail = email.toLowerCase().trim();

        // 1. Cuentas demo predeterminadas
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
            // Usuario Normal / Cliente
            'cliente@maximus.com': {
                password: 'cliente123',
                user: {
                    id: 'mock-cliente-001',
                    name: 'Carlos Mendoza',
                    email: 'cliente@maximus.com',
                    telefono: '+58 414-7890123',
                    role: APP_CONFIG.ROLES.CLIENTE,
                    tipo_asesor: null,
                    title: 'Usuario Registrado',
                    avatar: 'https://ui-avatars.com/api/?name=Carlos+Mendoza&background=0B4A3F&color=fff&bold=true',
                }
            },
            'usuario@maximus.com': {
                password: 'usuario123',
                user: {
                    id: 'mock-cliente-002',
                    name: 'Mariana Duarte',
                    email: 'usuario@maximus.com',
                    telefono: '+58 424-5556677',
                    role: APP_CONFIG.ROLES.CLIENTE,
                    tipo_asesor: null,
                    title: 'Usuario Registrado',
                    avatar: 'https://ui-avatars.com/api/?name=Mariana+Duarte&background=0B4A3F&color=fff&bold=true',
                }
            },
            // Alias y compatibilidad previa
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

        // 2. Verificar usuarios registrados dinámicamente en MOCK
        let registeredUsers = {};
        try {
            registeredUsers = JSON.parse(localStorage.getItem('maximus_registered_users')) || {};
        } catch(e) {}

        const entry = mockUsers[cleanEmail] || registeredUsers[cleanEmail];

        if (!entry) {
            return { success: false, error: 'Usuario no encontrado. Si no tienes cuenta, puedes crear una desde la opción "Crear Cuenta".' };
        }
        if (entry.password !== password) {
            return { success: false, error: 'Contraseña incorrecta.' };
        }

        // Guardar sesión en localStorage
        localStorage.setItem('maximus_user', JSON.stringify(entry.user));
        return { success: true, user: entry.user };
    },

    /**
     * Registro MOCK para desarrollo local sin backend.
     */
    _mockRegister({ nombre, email, password, telefono }) {
        const cleanEmail = email.toLowerCase().trim();

        let registeredUsers = {};
        try {
            registeredUsers = JSON.parse(localStorage.getItem('maximus_registered_users')) || {};
        } catch(e) {}

        // Verificar si ya existe
        if (registeredUsers[cleanEmail] || cleanEmail === 'admin@maximus.com' || cleanEmail === 'asesor.maximus@maximus.com' || cleanEmail === 'cliente@maximus.com') {
            return { success: false, error: 'El correo electrónico ya se encuentra registrado. Inicia sesión.' };
        }

        const newUser = {
            id: 'mock-user-' + Date.now(),
            name: nombre.trim(),
            email: cleanEmail,
            telefono: telefono ? telefono.trim() : '',
            role: APP_CONFIG.ROLES.CLIENTE,
            tipo_asesor: null,
            title: 'Usuario Registrado',
            avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre.trim())}&background=0B4A3F&color=fff&bold=true`,
            created_at: new Date().toISOString()
        };

        registeredUsers[cleanEmail] = {
            password: password,
            user: newUser
        };

        try {
            localStorage.setItem('maximus_registered_users', JSON.stringify(registeredUsers));
            localStorage.setItem('maximus_user', JSON.stringify(newUser));
        } catch(e) {}

        return { success: true, user: newUser };
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
                .maybeSingle();

            const user = {
                id: data.user.id,
                name: perfil?.nombre_completo || data.user.user_metadata?.nombre_completo || data.user.email.split('@')[0],
                email: data.user.email,
                telefono: perfil?.telefono || data.user.user_metadata?.telefono || '',
                role: perfil?.rol || data.user.user_metadata?.rol || 'cliente',
                title: perfil?.titulo || (perfil?.rol === 'admin' ? 'Director' : (perfil?.rol === 'asesor_maximus' ? 'Asesor MAXIMUS' : 'Usuario Registrado')),
                avatar: perfil?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(perfil?.nombre_completo || data.user.email)}&background=0B4A3F&color=fff&bold=true`,
            };

            localStorage.setItem('maximus_user', JSON.stringify(user));
            return { success: true, user };

        } catch (err) {
            return { success: false, error: 'Error de conexión con el servidor Supabase.' };
        }
    },

    /**
     * Registro REAL con Supabase Auth.
     * Se activará cuando USE_MOCK_DATA sea false.
     */
    async _supabaseRegister({ nombre, email, password, telefono }) {
        try {
            const sb = getSupabase();

            // 1. Registrar usuario en Supabase Auth con metadata de perfil
            const { data, error } = await sb.auth.signUp({
                email: email.trim().toLowerCase(),
                password: password,
                options: {
                    data: {
                        nombre_completo: nombre.trim(),
                        telefono: telefono ? telefono.trim() : '',
                        rol: 'cliente',
                        tipo_asesor: null,
                    }
                }
            });

            if (error) {
                return { success: false, error: error.message };
            }

            if (!data || !data.user) {
                return { success: false, error: 'No se pudo completar el registro.' };
            }

            // 2. Fallback defensivo: Garantizar registro en public.usuarios si no hay trigger
            try {
                await sb.from(APP_CONFIG.TABLES.USUARIOS).upsert({
                    auth_id: data.user.id,
                    nombre_completo: nombre.trim(),
                    email: data.user.email,
                    telefono: telefono ? telefono.trim() : null,
                    rol: 'cliente',
                    tipo_asesor: null,
                    titulo: 'Usuario Registrado',
                    avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre.trim())}&background=0B4A3F&color=fff&bold=true`
                }, { onConflict: 'auth_id' });
            } catch(dbErr) {
                console.warn('Nota: El perfil fue creado por trigger o requiere permisos RLS:', dbErr);
            }

            // 3. Si Supabase devuelve sesión activa (sin requerir confirmación por correo)
            if (data.session) {
                const user = {
                    id: data.user.id,
                    name: nombre.trim(),
                    email: data.user.email,
                    telefono: telefono ? telefono.trim() : '',
                    role: 'cliente',
                    title: 'Usuario Registrado',
                    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre.trim())}&background=0B4A3F&color=fff&bold=true`,
                };
                localStorage.setItem('maximus_user', JSON.stringify(user));
                return { success: true, user };
            }

            // 4. Si Supabase tiene activada la confirmación por correo
            return {
                success: true,
                requiresEmailConfirmation: true,
                message: '¡Tu cuenta ha sido creada con éxito! Revisa tu bandeja de entrada para verificar tu correo e iniciar sesión.'
            };

        } catch (err) {
            return { success: false, error: 'Error al comunicarse con Supabase durante el registro.' };
        }
    },
};

// Exportar
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}
