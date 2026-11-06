/**
 * ==============================================================================
 * MAXIMUS INMOBILIARIA - Puente Nativo (Capacitor) para App Store / Play Store
 * ==============================================================================
 *
 * Este archivo SOLO actúa cuando la web corre dentro de la app nativa (Capacitor).
 * En el navegador normal (Vercel / server.js) es un no-op absoluto.
 *
 * Responsabilidades:
 *  1. Detectar entorno nativo y marcar <html> con .maximus-native / .maximus-ios / .maximus-android
 *  2. Corregir rutas limpias (/inicio, /dashboard...) hacia los archivos .html locales
 *  3. Ocultar planes, precios y pasarelas de pago (reglas 3.1.1 Apple / Play Billing)
 *  4. Abrir enlaces externos (WhatsApp, tel:, mailto:, webs) fuera del WebView
 *  5. Compartir nativo (polyfill de navigator.share con @capacitor/share)
 *  6. Botón "Atrás" de Android, barra de estado, splash screen
 *  7. Login OAuth (Google / Apple) en navegador del sistema + deep link de retorno
 *  8. Notificaciones push (registro de token en Supabase: public.dispositivos_push)
 *  9. Aviso de "sin conexión"
 *
 * Se carga ANTES que el resto de scripts (lo inyecta scripts/build-app.js).
 */
(function () {
    'use strict';

    var Cap = window.Capacitor;
    var isNative = !!(Cap && typeof Cap.isNativePlatform === 'function' && Cap.isNativePlatform());
    window.MAXIMUS_NATIVE = isNative;
    if (!isNative) return;

    // ========== CONFIGURACIÓN DE LA APP ==========
    var CONFIG = {
        // Dominio público de la web (para enlaces compartidos y redirecciones de correo)
        publicOrigin: 'https://maximusinmobiliaria.tech',
        // Deep link de retorno del login OAuth (debe estar en la allow-list de Supabase Auth)
        authCallbackUrl: 'com.maximus.inmobiliaria://auth-callback',
        // Activar SOLO después de añadir google-services.json (Android) y la capacidad Push (iOS)
        pushEnabled: false,
        // Ocultar planes / precios / pagos externos dentro de la app (requisito de tiendas)
        hidePayments: true
    };

    var platform = Cap.getPlatform(); // 'ios' | 'android'
    window.MAXIMUS_PUBLIC_ORIGIN = CONFIG.publicOrigin;
    window.MaximusNative = { platform: platform, config: CONFIG };

    var root = document.documentElement;
    root.classList.add('maximus-native', 'maximus-' + platform);

    // ---------- Acceso a plugins nativos ----------
    var _plugins = {};
    function plugin(name) {
        if (_plugins[name]) return _plugins[name];
        var p = null;
        try {
            p = (Cap.Plugins && Cap.Plugins[name]) || (typeof Cap.registerPlugin === 'function' ? Cap.registerPlugin(name) : null);
        } catch (e) { p = null; }
        _plugins[name] = p;
        return p;
    }
    function safe(promiseFactory) {
        try {
            var r = promiseFactory();
            if (r && typeof r.catch === 'function') r.catch(function (e) { console.warn('[MaximusNative]', e); });
        } catch (e) { console.warn('[MaximusNative]', e); }
    }

    // ========== 1. RUTAS LIMPIAS → ARCHIVOS LOCALES ==========
    var ROUTES = {
        '/': 'index.html', '/inicio': 'index.html',
        '/catalogo': 'catalog.html', '/catalog': 'catalog.html',
        '/login': 'login.html',
        '/dashboard': 'dashboard-layout.html', '/dashboard-layout': 'dashboard-layout.html',
        '/detalle-propiedad': 'property-detail.html', '/propiedad': 'property-detail.html', '/property-detail': 'property-detail.html',
        '/terminos': 'terminos.html', '/privacidad': 'privacidad.html', '/eliminar-cuenta': 'eliminar-cuenta.html'
    };
    function resolveRoute(pathname) {
        var clean = (pathname || '/').replace(/\/+$/, '') || '/';
        return ROUTES[clean.toLowerCase()] || null;
    }
    (function fixCurrentRoute() {
        var p = location.pathname;
        if (p === '/' || /\.html$/i.test(p)) return;
        var target = resolveRoute(p);
        if (target) location.replace('/' + target + location.search + location.hash);
    })();

    // Convierte una URL local de la app (https://localhost/...) en URL pública de la web
    function toPublicUrl(url) {
        if (!url || typeof url !== 'string') return url;
        try {
            var u = new URL(url, location.href);
            if (u.origin !== location.origin) return url;
            return CONFIG.publicOrigin + u.pathname + u.search + u.hash;
        } catch (e) { return url; }
    }
    window.MaximusNative.toPublicUrl = toPublicUrl;

    // ========== 2. ESTILOS ESPECÍFICOS DE LA APP ==========
    var css = [
        'html.maximus-native, html.maximus-native body { -webkit-tap-highlight-color: transparent; overscroll-behavior-y: none; }',
        'html.maximus-ios [data-ios-only] { display: flex !important; }',
        'html.maximus-native [data-web-only] { display: none !important; }',
        // Páginas sin barra fija con safe-area: evitar que el notch tape el contenido
        'html.maximus-native body.maximus-safe-top { padding-top: env(safe-area-inset-top); }'
    ];
    if (CONFIG.hidePayments) {
        css.push(
            'html.maximus-native #planes,',
            'html.maximus-native a[href*="#planes"],',
            'html.maximus-native [data-target="view-planes"],',
            'html.maximus-native [data-target="view-pagos"],',
            'html.maximus-native [data-app-hide] { display: none !important; }',
            'html.maximus-native #view-planes > *, html.maximus-native #view-pagos > * { display: none !important; }',
            'html.maximus-native #view-planes::before, html.maximus-native #view-pagos::before {',
            '  content: "Esta sección no está disponible en la app."; display: block; text-align: center;',
            '  padding: 4rem 1.5rem; color: #6b7280; font-weight: 600; font-size: 0.95rem; }'
        );
    }
    var styleEl = document.createElement('style');
    styleEl.id = 'maximus-native-styles';
    styleEl.textContent = css.join('\n');
    (document.head || root).appendChild(styleEl);

    // ========== 3. AVISO NEUTRO (sin enlaces de compra externos) ==========
    function showNotice(title, message) {
        var old = document.getElementById('maximus-native-notice');
        if (old) old.remove();
        var wrap = document.createElement('div');
        wrap.id = 'maximus-native-notice';
        wrap.setAttribute('role', 'dialog');
        wrap.style.cssText = 'position:fixed;inset:0;z-index:2147483000;background:rgba(15,23,42,.55);display:flex;align-items:center;justify-content:center;padding:24px;';
        var box = document.createElement('div');
        box.style.cssText = 'background:#fff;border-radius:20px;max-width:360px;width:100%;padding:24px;text-align:center;font-family:inherit;box-shadow:0 20px 50px rgba(0,0,0,.25);';
        var h = document.createElement('h3');
        h.textContent = title;
        h.style.cssText = 'margin:0 0 8px;font-size:18px;font-weight:800;color:#0B4A3F;';
        var p = document.createElement('p');
        p.textContent = message;
        p.style.cssText = 'margin:0 0 18px;font-size:14px;color:#4b5563;line-height:1.5;';
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.textContent = 'Entendido';
        btn.style.cssText = 'width:100%;padding:12px;border:0;border-radius:12px;background:#0B4A3F;color:#fff;font-weight:700;font-size:14px;';
        btn.onclick = function () { wrap.remove(); };
        wrap.onclick = function (e) { if (e.target === wrap) wrap.remove(); };
        box.appendChild(h); box.appendChild(p); box.appendChild(btn); wrap.appendChild(box);
        document.body.appendChild(wrap);
    }
    window.MaximusNative.showNotice = showNotice;

    // ========== 4. BLOQUEO DE PAGOS EXTERNOS DENTRO DE LA APP ==========
    if (CONFIG.hidePayments) {
        var nativeProNotice = function () {
            showNotice('Funciones Pro', 'Esta función está disponible para cuentas con plan Pro activo. Si ya tienes un plan, inicia sesión con la misma cuenta.');
        };
        ['abrirModalSuscripcionPro', 'procesarPagoSuscripcionModal'].forEach(function (fn) {
            try {
                Object.defineProperty(window, fn, {
                    configurable: true,
                    get: function () { return nativeProNotice; },
                    set: function () { /* payments.js intenta registrarla: se ignora en la app */ }
                });
            } catch (e) { /* noop */ }
        });
    }

    // ========== 5. ENLACES EXTERNOS Y target="_blank" ==========
    var HANDOFF_RE = /^(tel:|mailto:|sms:|whatsapp:|geo:|maps:|intent:)|^https?:\/\/(wa\.me|api\.whatsapp\.com|chat\.whatsapp\.com|maps\.google\.|www\.google\.com\/maps|maps\.apple\.com|goo\.gl\/maps|maps\.app\.goo\.gl)/i;

    function openExternal(url) {
        if (HANDOFF_RE.test(url)) {
            // Capacitor delega al sistema operativo (abre WhatsApp, marcador, Mapas...)
            window.location.href = url;
            return;
        }
        var Browser = plugin('Browser');
        if (Browser) safe(function () { return Browser.open({ url: url, presentationStyle: 'popover' }); });
        else window.location.href = url;
    }
    window.MaximusNative.openExternal = openExternal;

    function isInternal(url) {
        try { return new URL(url, location.href).origin === location.origin; } catch (e) { return true; }
    }
    function internalHref(url) {
        var u = new URL(url, location.href);
        var target = /\.html$/i.test(u.pathname) ? null : resolveRoute(u.pathname);
        return target ? '/' + target + u.search + u.hash : u.pathname + u.search + u.hash;
    }

    document.addEventListener('click', function (e) {
        if (e.defaultPrevented) return;
        var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
        if (!a) return;
        var raw = a.getAttribute('href') || '';
        if (!raw || raw.charAt(0) === '#' || /^javascript:/i.test(raw)) return;
        var abs = a.href;
        if (HANDOFF_RE.test(raw) || !isInternal(abs)) {
            e.preventDefault();
            openExternal(abs);
            return;
        }
        // Enlaces internos: corregir rutas limpias y anular target=_blank (no hay pestañas)
        var fixed = internalHref(abs);
        if (a.target === '_blank' || fixed !== (new URL(abs).pathname + new URL(abs).search + new URL(abs).hash)) {
            e.preventDefault();
            window.location.href = fixed;
        }
    }, true);

    var _nativeOpen = window.open;
    window.open = function (url, target, features) {
        if (!url) return _nativeOpen ? _nativeOpen.call(window, url, target, features) : null;
        var abs = String(url);
        if (HANDOFF_RE.test(abs) || !isInternal(abs)) { openExternal(abs); return null; }
        window.location.href = internalHref(abs);
        return null;
    };

    // ========== 6. COMPARTIR NATIVO ==========
    var Share = plugin('Share');
    if (Share) {
        var origin = location.origin;
        var fixText = function (t) { return typeof t === 'string' ? t.split(origin).join(CONFIG.publicOrigin) : t; };
        try {
            navigator.share = function (data) {
                data = data || {};
                return Share.share({
                    title: data.title || 'MAXIMUS Inmobiliaria',
                    text: fixText(data.text),
                    url: data.url ? toPublicUrl(data.url) : undefined,
                    dialogTitle: 'Compartir'
                }).then(function () { return undefined; });
            };
            navigator.canShare = function (data) { return !(data && data.files && data.files.length); };
        } catch (e) { /* noop */ }
    }

    // ========== 7. LOGIN OAUTH NATIVO (Google / Apple) ==========
    // Google bloquea el login dentro de WebViews: se abre el navegador del sistema
    // y la app recibe el código por deep link (flujo PKCE de Supabase).
    window.MaximusNative.signInWithOAuth = function (provider) {
        var sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
        if (!sb || !sb.auth) return Promise.resolve({ success: false, error: 'Servicio de autenticación no disponible.' });
        try { localStorage.removeItem('maximus_logged_out'); } catch (e) { /* noop */ }
        return sb.auth.signInWithOAuth({
            provider: provider,
            options: { redirectTo: CONFIG.authCallbackUrl, skipBrowserRedirect: true }
        }).then(function (res) {
            if (res.error || !res.data || !res.data.url) {
                return { success: false, error: (res.error && res.error.message) || 'No se pudo iniciar el proveedor ' + provider + '.' };
            }
            var Browser = plugin('Browser');
            if (!Browser) return { success: false, error: 'Navegador del sistema no disponible.' };
            return Browser.open({ url: res.data.url, presentationStyle: 'popover' }).then(function () {
                return { success: true, redirecting: true };
            });
        });
    };

    var _handledAuthUrls = {};
    function handleAuthCallback(url) {
        if (!url || url.indexOf(CONFIG.authCallbackUrl) !== 0) return;
        // Evitar doble canje del mismo código (appUrlOpen + getLaunchUrl en arranque en frío)
        if (_handledAuthUrls[url] || sessionStorage.getItem('maximus_auth_cb') === url) return;
        _handledAuthUrls[url] = true;
        try { sessionStorage.setItem('maximus_auth_cb', url); } catch (e) { /* noop */ }
        var Browser = plugin('Browser');
        if (Browser) safe(function () { return Browser.close(); });
        var u;
        try { u = new URL(url.replace(/^[^:]+:\/\//, 'https://callback/')); } catch (e) { return; }
        var params = new URLSearchParams(u.search || '');
        var hash = new URLSearchParams((u.hash || '').replace(/^#/, ''));
        var errorDesc = params.get('error_description') || hash.get('error_description');
        if (errorDesc) { showNotice('Inicio de sesión cancelado', errorDesc); return; }
        var code = params.get('code');
        var sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
        if (!sb || !sb.auth) return;
        var done = function () {
            var go = function () { window.location.href = '/dashboard-layout.html'; };
            if (window.AuthService && typeof window.AuthService.handleOAuthCallback === 'function') {
                window.AuthService.handleOAuthCallback().then(go, go);
            } else go();
        };
        if (code) {
            sb.auth.exchangeCodeForSession(code).then(function (r) {
                if (r && r.error) showNotice('No se pudo iniciar sesión', r.error.message || 'Intenta nuevamente.');
                else done();
            });
        } else if (hash.get('access_token') && hash.get('refresh_token')) {
            sb.auth.setSession({ access_token: hash.get('access_token'), refresh_token: hash.get('refresh_token') }).then(done);
        }
    }

    // ========== 8. NOTIFICACIONES PUSH ==========
    function registerPush() {
        var Push = plugin('PushNotifications');
        if (!CONFIG.pushEnabled || !Push) return;
        safe(function () {
            return Push.checkPermissions().then(function (st) {
                if (st.receive === 'prompt' || st.receive === 'prompt-with-rationale') return Push.requestPermissions();
                return st;
            }).then(function (st) {
                if (st.receive !== 'granted') return;
                Push.addListener('registration', function (token) { saveDeviceToken(token && token.value); });
                Push.addListener('registrationError', function (err) { console.warn('[MaximusNative] Push error', err); });
                Push.addListener('pushNotificationActionPerformed', function (action) {
                    var data = (action && action.notification && action.notification.data) || {};
                    if (data.url) window.location.href = internalHref(data.url);
                });
                return Push.register();
            });
        });
    }
    function saveDeviceToken(token) {
        if (!token) return;
        var sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
        if (!sb || !sb.auth) return;
        sb.auth.getUser().then(function (r) {
            var user = r && r.data && r.data.user;
            if (!user) return;
            return sb.from('dispositivos_push').upsert({
                auth_id: user.id,
                token: token,
                plataforma: platform,
                actualizado_en: new Date().toISOString()
            }, { onConflict: 'token' });
        }).catch(function (e) { console.warn('[MaximusNative] No se guardó el token push', e); });
    }
    window.MaximusNative.registerPush = registerPush;

    // ========== 9. INICIALIZACIÓN ==========
    function init() {
        var path = location.pathname.toLowerCase();
        if (/\/(login|terminos|privacidad|eliminar-cuenta)\.html$/.test(path)) {
            document.body.classList.add('maximus-safe-top');
        }

        var StatusBar = plugin('StatusBar');
        if (StatusBar && platform === 'ios') safe(function () { return StatusBar.setStyle({ style: 'LIGHT' }); });

        var SplashScreen = plugin('SplashScreen');
        if (SplashScreen) safe(function () { return SplashScreen.hide({ fadeOutDuration: 250 }); });

        var App = plugin('App');
        if (App) {
            safe(function () {
                return App.addListener('backButton', function (ev) {
                    var notice = document.getElementById('maximus-native-notice');
                    if (notice) { notice.remove(); return; }
                    if (ev && ev.canGoBack) window.history.back();
                    else App.exitApp();
                });
            });
            safe(function () { return App.addListener('appUrlOpen', function (ev) { handleAuthCallback(ev && ev.url); }); });
            // Deep link que lanzó la app en frío
            safe(function () { return App.getLaunchUrl().then(function (r) { if (r && r.url) handleAuthCallback(r.url); }); });
        }

        var Network = plugin('Network');
        if (Network) {
            var banner;
            var setOffline = function (offline) {
                if (offline && !banner) {
                    banner = document.createElement('div');
                    banner.textContent = 'Sin conexión a internet. Algunas funciones no estarán disponibles.';
                    banner.style.cssText = 'position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom));z-index:2147482000;background:#111827;color:#fff;padding:12px 14px;border-radius:14px;font-size:13px;font-weight:600;text-align:center;box-shadow:0 10px 30px rgba(0,0,0,.3);';
                    document.body.appendChild(banner);
                } else if (!offline && banner) { banner.remove(); banner = null; }
            };
            safe(function () { return Network.getStatus().then(function (s) { setOffline(!s.connected); }); });
            safe(function () { return Network.addListener('networkStatusChange', function (s) { setOffline(!s.connected); }); });
        }

        // Registrar push solo cuando hay sesión iniciada
        if (CONFIG.pushEnabled) {
            setTimeout(function () {
                var sb = typeof window.getSupabase === 'function' ? window.getSupabase() : null;
                if (sb && sb.auth) sb.auth.getSession().then(function (r) { if (r && r.data && r.data.session) registerPush(); });
            }, 1500);
        }
    }

    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
    else init();
})();
