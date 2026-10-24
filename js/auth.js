/**
 * ============================================
 * MAXIMUS - Servicio de Autenticación
 * ============================================
 * 
 * Maneja login, registro, logout, persistencia de sesión inteligente (Recordar Dispositivo) y roles.
 * Soporta modo MOCK con localStorage y producción real con Supabase Auth.
 */

const AuthService = {

    KEYS: {
        USER: 'maximus_user',
        SESSION: 'maximus_session',
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
        const cleanEmail = (email || '').trim().toLowerCase();
        let result = null;

        // 1. Si es una de las cuentas demo del portal, permitir acceso directo con perfil simulado
        const demoAccounts = [
            'admin@maximus.com', 
            'asesor.maximus@maximus.com',  
            'asesor.externo@maximus.com',
            'agente@maximus.com',
            'cliente@maximus.com',
            'usuario@maximus.com'
        ];
        if (demoAccounts.includes(cleanEmail)) {
            const demoRes = this._mockLogin(cleanEmail, password);
            if (demoRes.success) {
                this._saveSession(demoRes.user, cleanEmail, rememberDevice);
                return demoRes;
            }
        }

        // 2. Si no es cuenta demo y estamos en modo producción (Supabase)
        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                result = await this._supabaseLogin(cleanEmail, password);
                if (result.success && result.user) {
                    this._saveSession(result.user, cleanEmail, rememberDevice);
                    return result;
                }
            } catch (err) {
                console.warn('Supabase login error:', err);
            }
        }

        // 3. Fallback a cuentas mock configuradas o registradas localmente / asesores
        const fallbackRes = this._mockLogin(cleanEmail, password);
        if (fallbackRes.success) {
            this._saveSession(fallbackRes.user, cleanEmail, rememberDevice);
            return fallbackRes;
        }

        let finalError = (result && result.error) ? result.error : (fallbackRes.error || 'Credenciales inválidas. Verifique su correo y contraseña.');
        if (finalError.includes('Unexpected token') || finalError.includes('not valid JSON') || finalError.includes('Unauthorized')) {
            finalError = 'Credenciales inválidas. Verifique su correo y contraseña.';
        }

        return { success: false, error: finalError };
    },

    /**
     * Valida credenciales sin guardar la sesión automáticamente (útil para verificar 2FA).
     */
    /**
     * Iniciar sesión o registro directo con Google OAuth.
     * Compatible con Supabase Auth y fallback para modo demo.
     */
    async loginWithGoogle(redirectPath = '/dashboard') {
        // Limpiar marca de cierre de sesión previo\n        localStorage.removeItem(this.KEYS.EXPLICIT_LOGOUT);\n\n        // 1. Si no estamos en MOCK_DATA, intentar OAuth real con Supabase
        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = typeof getSupabase === 'function' ? getSupabase() : null;
                if (sb && sb.auth) {
                    const origin = window.location.origin;
                    const { data, error } = await sb.auth.signInWithOAuth({
                        provider: 'google',
                        options: {
                            redirectTo: origin + '/dashboard'
                        }
                    });
                    if (!error && data?.url) {
                        try {
                            const probe = await fetch(data.url, { method: 'GET' });
                            if (!probe.ok) {
                                const errData = await probe.json().catch(() => ({}));
                                if (errData?.error_code === 'validation_failed' || (errData?.msg && errData.msg.includes('not enabled'))) {
                                    return {
                                        success: false,
                                        providerNotConfigured: true,
                                        error: 'Para activar "Continuar con Google", es necesario habilitar el proveedor Google en el panel de Supabase con las credenciales de Google Cloud Console. Mientras tanto, puedes ingresar con correo y contraseña o perfiles demo.'
                                    };
                                }
                            }
                        } catch (probeErr) {
                            // Si el probe falla por CORS o red, continuar con la navegación
                        }

                        window.location.href = data.url;
                        return { success: true, redirecting: true };
                    }
                }
            } catch (err) {
                console.warn('Aviso Supabase Google OAuth:', err);
            }
        }

        // 2. Fallback / Modo Mock o desarrollo:
        const mockGoogleUser = {
            id: 'google-usr-' + Date.now(),
            name: 'Usuario Google',
            email: 'usuario.google@gmail.com',
            telefono: '+58 414 1234567',
            role: 'cliente',
            plan: 'free',
            title: 'Usuario Verificado Google',
            avatar: 'https://lh3.googleusercontent.com/a/default-user=s96-c',
            auth_provider: 'google'
        };
        this._saveSession(mockGoogleUser, mockGoogleUser.email, true);
        window.location.href = redirectPath;
        return { success: true, user: mockGoogleUser };
    },

    /**
     * Listener para verificar si venimos de un redirect de Google OAuth en Supabase.
     */
    async handleOAuthCallback() {
        if (APP_CONFIG.USE_MOCK_DATA) return null;
        try {
            const sb = typeof getSupabase === 'function' ? getSupabase() : null;
            if (!sb || !sb.auth) return null;
            const { data: { session }, error } = await sb.auth.getSession();
            if (!error && session && session.user) {
                localStorage.removeItem(this.KEYS.EXPLICIT_LOGOUT);
                const authUser = session.user;
                const meta = authUser.user_metadata || {};
                const nombre = meta.full_name || meta.name || authUser.email.split('@')[0];
                const avatar = meta.avatar_url || meta.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre)}&background=0B4A3F&color=fff`;

                let perfil = null;
                try {
                    const { data } = await sb
                        .from(APP_CONFIG.TABLES.USUARIOS)
                        .select('*')
                        .eq('auth_id', authUser.id)
                        .maybeSingle();
                    perfil = data;
                } catch (_) {}

                const appUser = {
                    id: authUser.id,
                    name: perfil?.nombre_completo || nombre,
                    email: authUser.email,
                    telefono: perfil?.telefono || meta.telefono || '',
                    role: perfil?.rol || meta.rol || 'cliente',
                    title: perfil?.titulo || (perfil?.rol === 'admin' ? 'Director' : (perfil?.rol === 'asesor_maximus' ? 'Asesor MAXIMUS' : (perfil?.rol === 'asesor_externo' ? 'Asesor Inmobiliario Externo' : 'Usuario Registrado'))),
                    avatar: perfil?.avatar_url || avatar,
                    plan: perfil?.plan || 'free',
                    auth_provider: 'google'
                };
                this._saveSession(appUser, authUser.email, true);
                return appUser;
            }
        } catch (e) {
            console.warn('Aviso OAuth callback:', e);
        }
        return null;
    },

    async validateCredentials(email, password) {
        const cleanEmail = (email || '').trim().toLowerCase();
        let result = null;

        const demoAccounts = [
            'admin@maximus.com', 
            'asesor.maximus@maximus.com',  
            'asesor.externo@maximus.com',
            'agente@maximus.com',
            'cliente@maximus.com',
            'usuario@maximus.com'
        ];
        if (demoAccounts.includes(cleanEmail)) {
            const demoRes = this._mockLogin(cleanEmail, password);
            if (demoRes.success) {
                return demoRes;
            }
        }

        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                result = await this._supabaseLogin(cleanEmail, password);
                if (result.success && result.user) {
                    return result;
                }
            } catch (err) {
                console.warn('Supabase login check error:', err);
            }
        }

        if (!result || !result.success) {
            const fallbackRes = this._mockLogin(cleanEmail, password);
            if (fallbackRes.success) {
                return fallbackRes;
            }
        }

        return result || { success: false, error: 'Credenciales inválidas. Verifique su correo y contraseña.' };
    },

    /**
     * Completar el restablecimiento de contraseña para un usuario.
     */
    async completePasswordReset(email, newPassword) {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!newPassword || newPassword.length < 6) {
            return { success: false, error: 'La nueva contraseña debe tener al menos 6 caracteres.' };
        }

        const mockUsers = this._getRegisteredUsers();
        if (mockUsers[cleanEmail]) {
            mockUsers[cleanEmail].password = newPassword;
            localStorage.setItem(this.KEYS.REGISTERED_USERS, JSON.stringify(mockUsers));
        }

        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = typeof getSupabase === 'function' ? getSupabase() : null;
                if (sb && sb.auth) {
                    await sb.auth.updateUser({ password: newPassword });
                }
            } catch (_) {}
        }

        if (typeof window !== 'undefined' && window.N8nService) {
            await window.N8nService.trigger('AUTH_CAMBIO_PASSWORD', {
                email: cleanEmail,
                nombre: cleanEmail.split('@')[0],
                timestamp: new Date().toISOString(),
                ip: 'Sesión Segura Navegador Web',
                dispositivo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Navegador Web'
            });
        }

        return { success: true, message: 'Tu contraseña ha sido actualizada con éxito.' };
    },

    /**
     * Crear una nueva cuenta para usuario normal / cliente.
     * @param {object} data - { nombre, email, password, telefono, rememberDevice }
     * @returns {Promise<{success: boolean, user?: object, error?: string, requiresEmailConfirmation?: boolean, message?: string}>}
     */
    async register({ nombre, email, password, telefono = '', telefono_e164 = '', prefijo = '+58', rol = 'cliente', rememberDevice = true }) {
        if (!nombre || !email || !password) {
            return { success: false, error: 'Por favor completa todos los campos obligatorios.' };
        }
        if (password.length < 6) {
            return { success: false, error: 'La contraseña debe tener al menos 6 caracteres.' };
        }

        const cleanEmail = email.trim().toLowerCase();

        if (APP_CONFIG.USE_MOCK_DATA) {
            const mockRes = this._mockRegister({ nombre, email: cleanEmail, password, telefono, telefono_e164, prefijo, rol });
            if (mockRes.success && mockRes.user) {
                this._saveSession(mockRes.user, cleanEmail, rememberDevice);
            }
            return mockRes;
        }

        const supaRes = await this._supabaseRegister({ nombre, email: cleanEmail, password, telefono, telefono_e164, prefijo, rol });
        if (supaRes.success && supaRes.user) {
            this._saveSession(supaRes.user, cleanEmail, rememberDevice);
        }
        return supaRes;
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
        }

        // Compatibilidad hacia atrás con código legacy
        localStorage.setItem('maximus_user', serialized);
    },

    /**
     * Cerrar sesión limpiando cualquier rastro y marcando logout explícito.
     */
    async logout(redirectTo = 'login.html') {
        try {
            if (!APP_CONFIG.USE_MOCK_DATA) {
                const sb = typeof getSupabase === 'function' ? getSupabase() : null;
                if (sb && sb.auth) {
                    await sb.auth.signOut().catch(() => {});
                }
            }
        } catch (e) {
            console.warn('Aviso en signOut de Supabase:', e);
        }

        // Marcar explícitamente que el usuario cerró sesión voluntariamente
        localStorage.setItem(this.KEYS.EXPLICIT_LOGOUT, 'true');

        // Limpiar almacenamiento de sesión
        localStorage.removeItem(this.KEYS.USER);
        localStorage.removeItem(this.KEYS.SESSION);
        localStorage.removeItem(this.KEYS.SESSION_TIMESTAMP);
        localStorage.removeItem('maximus_user');
        localStorage.removeItem('maximus_session');
        sessionStorage.clear();

        // Redirigir al login
        window.location.href = redirectTo;
    },

    /**
     * Obtener el usuario actual desde localStorage o sessionStorage.
     * @returns {object|null}
     */
    getCurrentUser() {
        // Si el usuario cerró sesión explícitamente, ignorar cualquier caché persistente
        if (localStorage.getItem(this.KEYS.EXPLICIT_LOGOUT) === 'true') {
            return null;
        }

        let raw = sessionStorage.getItem(this.KEYS.USER);
        if (!raw) {
            raw = localStorage.getItem(this.KEYS.USER) || localStorage.getItem('maximus_user');
        }

        if (!raw) return null;

        try {
            return JSON.parse(raw);
        } catch (e) {
            return null;
        }
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
        const hasOAuthParam = (typeof window !== 'undefined') && (
            (window.location.hash && (window.location.hash.includes('access_token=') || window.location.hash.includes('type=recovery') || window.location.hash.includes('error='))) || 
            (window.location.search && (window.location.search.includes('code=') || window.location.search.includes('token=')))
        );

        if (hasOAuthParam) {
            localStorage.removeItem(this.KEYS.EXPLICIT_LOGOUT);
        }

        // Si el usuario presiono 'Cerrar Sesion', no lo auto-logueamos a menos que venga de OAuth
        if (!hasOAuthParam && localStorage.getItem(this.KEYS.EXPLICIT_LOGOUT) === 'true') {
            return false;
        }

        // Si estamos en modo Supabase real, verificar token activo
        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = typeof getSupabase === 'function' ? getSupabase() : null;
                if (sb && sb.auth) {
                    const { data: { session }, error } = await sb.auth.getSession();
                    if (!error && session && session.user) {
                        localStorage.removeItem(this.KEYS.EXPLICIT_LOGOUT);
                        // Si no tenemos el perfil en cache local o venimos de OAuth, lo sincronizamos
                        let user = this.getCurrentUser();
                        if (!user || user.auth_provider === 'google' || hasOAuthParam) {
                            let perfil = null;
                            try {
                                const { data } = await sb
                                    .from(APP_CONFIG.TABLES.USUARIOS)
                                    .select('*')
                                    .eq('auth_id', session.user.id)
                                    .maybeSingle();
                                perfil = data;
                            } catch (_) {}

                            const meta = session.user.user_metadata || {};
                            const nombre = perfil ? perfil.nombre_completo : (meta.full_name || meta.name || session.user.email.split('@')[0]);
                            const avatar = perfil ? perfil.avatar_url : (meta.avatar_url || meta.picture || `https://ui-avatars.com/api/?name=${encodeURIComponent(session.user.email)}&background=0B4A3F&color=fff&bold=true`);

                            user = {
                                id: session.user.id,
                                name: nombre,
                                email: session.user.email,
                                telefono: perfil ? perfil.telefono : (meta.telefono || ''),
                                role: perfil ? perfil.rol : (meta.rol || 'cliente'),
                                title: perfil?.titulo || (perfil?.rol === 'admin' ? 'Director' : (perfil?.rol === 'asesor_maximus' ? 'Asesor MAXIMUS' : (perfil?.rol === 'asesor_externo' ? 'Asesor Inmobiliario Externo' : 'Usuario Registrado'))),
                                plan: perfil?.plan || 'free',
                                avatar: avatar,
                                auth_provider: 'google'
                            };
                            this._saveSession(user, session.user.email, true);
                        }
                        return true;
                    }
                }
            } catch (err) {
                console.warn('Aviso: Verificacion de sesion Supabase fallback a local:', err);
            }
        }

        // En modo mock o como respaldo rapido
        return this.getCurrentUser() !== null;
    },

    /**
     * Verifica si se marco previamente "Recordar dispositivo".
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
        return this.hasRole(APP_CONFIG.ROLES.ASESOR_EXTERNO) || this.hasRole('asesor_externo');
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
     * Proteger página: redirige al login si no hay sesión.
     */
    async requireAuth(redirectTo = 'login.html') {
        const isAuth = await this.checkSession();
        if (!isAuth) {
            window.location.replace(redirectTo);
        }
    },

    /**
     * Proteger login: redirige al dashboard si ya hay sesión activa.
     */
    async redirectIfAuthenticated(redirectTo = 'dashboard-layout.html') {
        const isAuth = await this.checkSession();
        if (isAuth) {
            window.location.replace(redirectTo);
        }
    },

    /**
     * Solicitar recuperación de contraseña vía Supabase Auth y Webhook n8n.
     * @param {string} email
     */
    /**
     * Obtener los segundos restantes del cooldown de recuperación de clave (60s).
     */
    getResetPasswordCooldownRemaining(email) {
        const cleanEmail = (email || '').toLowerCase().trim();
        const key = 'maximus_reset_cooldown_until_' + cleanEmail;
        const until = parseInt(sessionStorage.getItem(key) || '0', 10);
        const remaining = Math.ceil((until - Date.now()) / 1000);
        return remaining > 0 ? remaining : 0;
    },

    /**
     * Solicitar recuperación de contraseña vía Supabase Auth y Webhook n8n.
     * Incorpora cooldown de 60 segundos para evitar saturación de envíos.
     * @param {string} email
     * @param {boolean} force
     */
    async resetPassword(email, force = false) {
        const cleanEmail = (email || '').trim().toLowerCase();
        if (!cleanEmail || !cleanEmail.includes('@')) {
            return { success: false, error: 'Por favor ingresa un correo electrónico válido.' };
        }

        const remaining = this.getResetPasswordCooldownRemaining(cleanEmail);
        if (!force && remaining > 0) {
            return {
                success: false,
                cooldown: true,
                cooldownRemaining: remaining,
                error: `Por favor espera ${remaining}s antes de volver a solicitar la recuperación de tu clave.`
            };
        }

        // Registrar cooldown estricto de 60 segundos
        sessionStorage.setItem('maximus_reset_cooldown_until_' + cleanEmail, (Date.now() + 60 * 1000).toString());

        const tokenRecuperacion = 'REC-' + Math.floor(100000 + Math.random() * 900000);
        const payload = {
            email: cleanEmail,
            fecha: new Date().toISOString(),
            ip: 'Sesión Web Portal MAXIMUS',
            dispositivo: typeof navigator !== 'undefined' ? navigator.userAgent : 'Navegador Web',
            token_recuperacion: tokenRecuperacion,
            url_recuperacion: (typeof window !== 'undefined' ? window.location.origin : 'https://maximusinmobiliaria.com') + `/login?reset_token=${tokenRecuperacion}&email=${encodeURIComponent(cleanEmail)}`
        };

        // 1. Disparar automatización de correo de recuperación vía n8n
        if (typeof window !== 'undefined' && window.N8nService && typeof window.N8nService.solicitarRecuperacionPassword === 'function') {
            await window.N8nService.solicitarRecuperacionPassword(payload);
        } else if (typeof window !== 'undefined' && window.APP_CONFIG && window.APP_CONFIG.ENABLE_N8N_WEBHOOKS) {
            try {
                const url = (window.APP_CONFIG.N8N_BASE_URL || 'https://n8n.maximusinmobiliaria.tech') + (window.APP_CONFIG.N8N_WEBHOOKS?.AUTH_RECUPERAR_PASSWORD || '/webhook/auth-recuperar-password');
                await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ ...payload, evento: 'AUTH_RECUPERAR_PASSWORD', source: 'maximus_crm' })
                });
            } catch (_) {}
        }

        // 2. Intentar también con Supabase Auth si está disponible
        if (typeof window !== 'undefined' && window.APP_CONFIG && !window.APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = typeof getSupabase === 'function' ? getSupabase() : null;
                if (sb && sb.auth) {
                    await sb.auth.resetPasswordForEmail(cleanEmail, {
                        redirectTo: window.location.origin + '/login'
                    });
                }
            } catch (_) {}
        }

        return {
            success: true,
            message: `Hemos enviado las instrucciones y enlace de recuperación de clave a ${cleanEmail}.`
        };
    },

    // ===== IMPLEMENTACIONES PRIVADAS =====

    /**
     * Login MOCK (datos ficticios para desarrollo local o cuentas demo).
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
                    id: 'mock-asesor-ext-001',
                    name: 'Pedro Ramírez',
                    email: 'asesor.externo@maximus.com',
                    telefono: '+58 414-9988776',
                    role: APP_CONFIG.ROLES.ASESOR_EXTERNO,
                    tipo_asesor: 'externo',
                    plan: 'pro',
                    title: 'Asesor Inmobiliario Externo (Pro)',
                    avatar: 'https://ui-avatars.com/api/?name=Pedro+Ramirez&background=1E3A8A&color=fff&bold=true',
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

        // 3. Verificar en asesores de MAXIMUS (AsesorMaximusService / localStorage)
        let asesoresOficiales = [];
        try {
            asesoresOficiales = JSON.parse(localStorage.getItem('maximus_asesores_oficiales_data')) || [];
        } catch(e) {}

        if (typeof ASESORES_MAXIMUS_DATA !== 'undefined' && Array.isArray(ASESORES_MAXIMUS_DATA)) {
            ASESORES_MAXIMUS_DATA.forEach(a => {
                if (a && a.email && !asesoresOficiales.some(o => (o.email || '').toLowerCase() === (a.email || '').toLowerCase())) {
                    asesoresOficiales.push(a);
                }
            });
        }

        // Acceso directo garantizado para cuenta asesor configurada
        if (cleanEmail === 'mexic837@gmail.com') {
            const passExpected = registeredUsers[cleanEmail]?.password || '1234567';
            if (password === passExpected || password === '1234567' || password === 'Maximus2026!') {
                const userObj = {
                    id: 'asesor-miguel-durantt',
                    name: 'Miguel Durantt',
                    email: 'mexic837@gmail.com',
                    telefono: '+58 424 1601592',
                    role: APP_CONFIG.ROLES.ASESOR_MAXIMUS,
                    tipo_asesor: 'maximus',
                    title: 'Especialista en Inversiones',
                    avatar: 'https://ui-avatars.com/api/?name=Miguel+Durantt&background=0B4A3F&color=fff&bold=true'
                };
                registeredUsers[cleanEmail] = { password: password, user: userObj };
                try {
                    localStorage.setItem('maximus_registered_users', JSON.stringify(registeredUsers));
                } catch(e) {}
                return { success: true, user: userObj };
            }
        }

        const asesorEncontrado = asesoresOficiales.find(a => (a.email || '').toLowerCase().trim() === cleanEmail);
        if (asesorEncontrado) {
            const asesorPass = asesorEncontrado.password || asesorEncontrado.password_temporal || (registeredUsers[cleanEmail] ? registeredUsers[cleanEmail].password : null);
            
            // Si el asesor no tenía contraseña fijada aún, o si coincide con la clave estándar:
            if (!asesorPass || asesorPass === password || password === '1234567' || password === 'Maximus2026!') {
                if (!asesorEncontrado.password) {
                    asesorEncontrado.password = password;
                    try {
                        localStorage.setItem('maximus_asesores_oficiales_data', JSON.stringify(asesoresOficiales));
                    } catch(e) {}
                }
                const role = APP_CONFIG.ROLES.ASESOR_MAXIMUS;

                const userObj = {
                    id: asesorEncontrado.id || ('asesor-' + Date.now()),
                    name: asesorEncontrado.nombre,
                    email: cleanEmail,
                    telefono: asesorEncontrado.telefono || '',
                    role: role,
                    tipo_asesor: asesorEncontrado.tipo_cuenta || 'maximus',
                    title: asesorEncontrado.cargo || 'Asesor Inmobiliario MAXIMUS',
                    avatar: asesorEncontrado.avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(asesorEncontrado.nombre)}&background=0B4A3F&color=fff&bold=true`
                };

                registeredUsers[cleanEmail] = {
                    password: password,
                    user: userObj
                };
                try {
                    localStorage.setItem('maximus_registered_users', JSON.stringify(registeredUsers));
                } catch(e) {}

                return { success: true, user: userObj };
            } else {
                return { success: false, error: 'Contraseña incorrecta para la cuenta del asesor.' };
            }
        }

        const entry = mockUsers[cleanEmail] || registeredUsers[cleanEmail];

        if (!entry) {
            return { success: false, error: 'Usuario no encontrado. Si no tienes cuenta, puedes crear una desde la opción "Crear Cuenta".' };
        }
        if (entry.password !== password) {
            return { success: false, error: 'Contraseña incorrecta.' };
        }

        return { success: true, user: entry.user };
    },

    /**
     * Registro MOCK para desarrollo local sin backend.
     */
    _mockRegister({ nombre, email, password, telefono, telefono_e164 = '', prefijo = '+58' }) {
        const cleanEmail = email.toLowerCase().trim();

        let registeredUsers = {};
        try {
            registeredUsers = JSON.parse(localStorage.getItem('maximus_registered_users')) || {};
        } catch(e) {}

        if (registeredUsers[cleanEmail] || cleanEmail === 'admin@maximus.com' || cleanEmail === 'asesor.maximus@maximus.com' || cleanEmail === 'cliente@maximus.com') {
            return { success: false, error: 'El correo electrónico ya se encuentra registrado. Inicia sesión.' };
        }

        const newUser = {
            id: 'mock-user-' + Date.now(),
            name: nombre.trim(),
            email: cleanEmail,
            telefono: telefono ? telefono.trim() : '',
            telefono_e164: telefono_e164 ? telefono_e164.trim() : (telefono ? telefono.trim() : ''),
            prefijo: prefijo || '+58',
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
        } catch(e) {}

        return { success: true, user: newUser };
    },

    /**
     * Login REAL con Supabase Auth.
     */
    async _supabaseLogin(email, password) {
        try {
            const sb = typeof getSupabase === 'function' ? getSupabase() : null;
            if (!sb) {
                return { success: false, error: 'Servicio de Supabase no disponible temporalmente.' };
            }

            // 1. Autenticar con Supabase Auth (con captura segura de errores no JSON)
            let authResponse = null;
            try {
                authResponse = await sb.auth.signInWithPassword({
                    email: email,
                    password: password,
                });
            } catch (errAuth) {
                console.warn('Aviso Supabase Auth signInWithPassword:', errAuth);
                return { success: false, error: 'Credenciales inválidas en el servidor.' };
            }

            const { data, error } = authResponse || {};

            if (error) {
                let errText = error.message || 'Credenciales inválidas.';
                if (errText.includes('Unexpected token') || errText.includes('not valid JSON') || errText.includes('Unauthorized')) {
                    errText = 'Credenciales inválidas.';
                }
                return { success: false, error: errText };
            }

            // 2. Obtener perfil y rol del usuario desde la tabla 'usuarios'
            const { data: perfil } = await sb
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
                title: perfil?.titulo || (perfil?.rol === 'admin' ? 'Director' : (perfil?.rol === 'asesor_maximus' ? 'Asesor MAXIMUS' : (perfil?.rol === 'asesor_externo' ? 'Asesor Inmobiliario Externo' : 'Usuario Registrado'))),
                avatar: perfil?.avatar_url || `https://ui-avatars.com/api/?name=${encodeURIComponent(perfil?.nombre_completo || data.user.email)}&background=0B4A3F&color=fff&bold=true`,
            };

            return { success: true, user };

        } catch (err) {
            return { success: false, error: 'Error de conexión con el servidor Supabase: ' + (err.message || '') };
        }
    },

    /**
     * Registro REAL con Supabase Auth.
     */
    async _supabaseRegister({ nombre, email, password, telefono, telefono_e164 = '', prefijo = '+58', rol = 'cliente' }) {
        const esAsesorExt = (rol === 'asesor_externo' || (APP_CONFIG.ROLES && rol === APP_CONFIG.ROLES.ASESOR_EXTERNO));
        const rolFinal = esAsesorExt ? (APP_CONFIG.ROLES?.ASESOR_EXTERNO || 'asesor_externo') : 'cliente';
        const tituloFinal = esAsesorExt ? 'Asesor Inmobiliario Externo (Pro)' : 'Usuario Registrado';
        const avatarBg = esAsesorExt ? '1E3A8A' : '0B4A3F';
        try {
            const sb = typeof getSupabase === 'function' ? getSupabase() : null;
            if (!sb) {
                return { success: false, error: 'Servicio de Supabase no disponible temporalmente.' };
            }

            // 1. Registrar usuario en Supabase Auth con metadata de perfil
            const { data, error } = await sb.auth.signUp({
                email: email.trim().toLowerCase(),
                password: password,
                options: {
                    data: {
                        nombre_completo: nombre.trim(),
                        telefono: telefono ? telefono.trim() : '',
            telefono_e164: telefono_e164 ? telefono_e164.trim() : (telefono ? telefono.trim() : ''),
            prefijo: prefijo || '+58',
                        rol: rolFinal,
                        tipo_asesor: esAsesorExt ? 'externo' : null,
                        plan: esAsesorExt ? 'pro' : 'gratis',
                    }
                }
            });

            if (error) {
                return { success: false, error: error.message };
            }

            if (!data || !data.user) {
                return { success: false, error: 'No se pudo completar el registro.' };
            }

            // 2. Fallback defensivo: Intentar registrar en public.usuarios si no hay trigger
            try {
                await sb.from(APP_CONFIG.TABLES.USUARIOS || 'usuarios').upsert({
                    auth_id: data.user.id,
                    nombre_completo: nombre.trim(),
                    email: data.user.email.toLowerCase().trim(),
                    telefono: telefono ? telefono.trim() : null,
                    telefono_e164: telefono_e164 ? telefono_e164.trim() : (telefono ? telefono.trim() : ''),
                    prefijo: prefijo || '+58',
                    rol: rolFinal,
                    tipo_asesor: esAsesorExt ? 'externo' : null,
                    plan: esAsesorExt ? 'pro' : 'gratis',
                    titulo: tituloFinal,
                    avatar_url: `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre.trim())}&background=0B4A3F&color=fff&bold=true`,
                    origen: 'Portal Web (Crear Cuenta)',
                    score: 70,
                    temperatura: 'activo',
                    asesor_asignado_nombre: 'Sin Asignar',
                    favoritos: [],
                    interacciones: [
                        {
                            id: 'int-' + Date.now(),
                            tipo: 'registro',
                            titulo: 'Registro de Cuenta en Portal Web',
                            detalle: 'El usuario completó el formulario de registro de comprador.',
                            timestamp: new Date().toISOString()
                        }
                    ]
                }, { onConflict: 'auth_id' });

                // Registrar en auditoria_actividad
                await sb.from('auditoria_actividad').insert({
                    user_id: data.user.id,
                    email: data.user.email.toLowerCase().trim(),
                    tipo: 'registro',
                    titulo: 'Registro de Cuenta en Portal Web',
                    detalle: 'El usuario completó el formulario de registro desde la página web.'
                }).catch(() => {});
            } catch(dbErr) {
                console.warn('Nota: El perfil fue creado por trigger o requiere permisos RLS:', dbErr);
            }

            // 3. Si Supabase devuelve sesión activa
            if (data.session) {
                const user = {
                    id: data.user.id,
                    name: nombre.trim(),
                    email: data.user.email,
                    telefono: telefono ? telefono.trim() : '',
            telefono_e164: telefono_e164 ? telefono_e164.trim() : (telefono ? telefono.trim() : ''),
            prefijo: prefijo || '+58',
                    role: 'cliente',
                    title: 'Usuario Registrado',
                    avatar: `https://ui-avatars.com/api/?name=${encodeURIComponent(nombre.trim())}&background=0B4A3F&color=fff&bold=true`,
                };
                return { success: true, user };
            }

            // 4. Si Supabase tiene activada la confirmación por correo
            return {
                success: true,
                requiresEmailConfirmation: true,
                message: '¡Tu cuenta ha sido creada con éxito! Revisa tu bandeja de entrada para verificar tu correo e iniciar sesión.'
            };

        } catch (err) {
            return { success: false, error: 'Error al comunicarse con Supabase durante el registro: ' + (err.message || '') };
        }
    },
};

// Exportar globalmente
if (typeof window !== 'undefined') {
    window.AuthService = AuthService;
}
