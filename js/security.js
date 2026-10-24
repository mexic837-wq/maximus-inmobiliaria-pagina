/**
 * ==============================================================================
 * MAXIMUS INMOBILIARIA - Escudo de Ciberseguridad Frontend (js/security.js)
 * ==============================================================================
 * Implementa medidas de defensa en profundidad en el navegador:
 * - Detección y mitigación de Clickjacking (Frame-Busting)
 * - Sanitización estricta de entradas y contenidos (Anti-XSS)
 * - Limitador de tasa de peticiones del lado del cliente (Rate Limiter)
 * - Protección e integridad de variables globales de entorno
 */

(function (window) {
    'use strict';

    // 1. Anti-Clickjacking (Frame-Busting Protection)
    try {
        if (window.top !== window.self) {
            // Si la página está siendo embebida en un iframe no autorizado
            if (window.top.location.hostname !== window.self.location.hostname) {
                window.top.location = window.self.location.href;
            }
        }
    } catch (e) {
        // En caso de bloqueo por política de mismo origen cruzado
        if (window.top) {
            window.top.location = window.self.location.href;
        }
    }

    // 2. Módulo de Ciberseguridad y Sanitización
    const SecurityUtils = {
        /**
         * Sanitiza cadenas de texto para prevenir inyecciones XSS en el DOM
         * @param {string} str - Texto a escapar
         * @returns {string} - Texto seguro para renderizar
         */
        sanitizeHTML: function (str) {
            if (typeof str !== 'string') return '';
            const map = {
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                '"': '&quot;',
                "'": '&#x27;',
                '/': '&#x2F;',
                '`': '&#x60;'
            };
            return str.replace(/[&<>"'`/]/g, function (s) {
                return map[s];
            });
        },

        /**
         * Validador estricto de URLs seguras (previene javascript: o data: maliciosos)
         * @param {string} url - URL a validar
         * @returns {boolean}
         */
        isSafeURL: function (url) {
            if (typeof url !== 'string') return false;
            const trimmed = url.trim().toLowerCase();
            return (
                trimmed.startsWith('https://') ||
                trimmed.startsWith('http://') ||
                trimmed.startsWith('/') ||
                trimmed.startsWith('#') ||
                trimmed.startsWith('mailto:') ||
                trimmed.startsWith('tel:') ||
                trimmed.startsWith('https://wa.me/')
            );
        },

        /**
         * Limitador de tasa del cliente (Rate Limiter en memoria)
         * Evita spam masivo a webhooks de n8n o endpoints de base de datos
         */
        _rateLimits: {},
        checkRateLimit: function (actionKey, maxAllowed = 5, windowMs = 60000) {
            const now = Date.now();
            if (!this._rateLimits[actionKey]) {
                this._rateLimits[actionKey] = [];
            }
            // Filtrar timestamps fuera de la ventana actual
            this._rateLimits[actionKey] = this._rateLimits[actionKey].filter(ts => now - ts < windowMs);

            if (this._rateLimits[actionKey].length >= maxAllowed) {
                return false; // Límite superado
            }
            this._rateLimits[actionKey].push(now);
            return true; // Permitido
        },

        /**
         * Auditoría de SSL / HTTPS
         */
        enforceHTTPS: function () {
            if (location.protocol !== 'https:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1') {
                location.href = 'https:' + window.location.href.substring(window.location.protocol.length);
            }
        }
    };

    // Auto-ejecutar verificación HTTPS en producción
    SecurityUtils.enforceHTTPS();

    // Congelar objeto de seguridad para evitar manipulaciones externas
    if (typeof Object.freeze === 'function') {
        Object.freeze(SecurityUtils);
    }

    // Exportar al ámbito global
    window.SecurityUtils = SecurityUtils;

})(window);
