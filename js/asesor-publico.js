/**
 * ====================================================================
 * MAXIMUS INMOBILIARIA - Tarjeta del asesor en la ficha de un inmueble
 * ====================================================================
 * Muestra SIEMPRE el nombre real del asesor y su plan (Bronce, Gold,
 * Platinum o Equipo MAXIMUS).
 *
 * Fuente: RPC public.asesor_publico_inmueble (sql/PENDIENTE-SUPABASE-TODO-EN-UNO.sql,
 * Parte 6). Reglas:
 *   · Inmueble de un asesor con plan vigente → su nombre + "Asesor Inmobiliario Gold"…
 *   · Inmueble del equipo MAXIMUS → su nombre + "Asesor MAXIMUS".
 *   · Inmueble captado de los grupos de WhatsApp (o sin nombre / nombre genérico)
 *     → José Guerrero, equipo MAXIMUS. El asesor original queda en privado.
 * Si el SQL aún no se ejecutó, aplica la misma regla con los datos locales.
 *
 * Uso:  AsesorPublico.aplicar('detail', inmueble)   // property-detail.html
 *       AsesorPublico.aplicar('airbnb', inmueble)   // dashboard (ficha del inmueble)
 * Los ids de la tarjeta son `${prefijo}-asesor-nombre`, `-cargo`, `-avatar`, `-plan`,
 * `-tel-btn` y `-whatsapp-btn`.
 */
(function () {
    'use strict';

    const EQUIPO = { nombre: 'José Guerrero', whatsapp: '584247835697', cargo: 'Asesor MAXIMUS' };

    // Colores de la etiqueta del plan (estilos en línea: la ficha pública usa CSS compilado)
    const ETIQUETAS = {
        bronce:   { texto: 'Bronce',         icono: 'ph-medal',      estilo: 'background:#FFEDD5;color:#9A3412;' },
        gold:     { texto: 'Gold',           icono: 'ph-crown',      estilo: 'background:#FEF3C7;color:#92400E;' },
        platinum: { texto: 'Platinum',       icono: 'ph-diamond',    estilo: 'background:#E2E8F0;color:#1E293B;' },
        equipo:   { texto: 'Equipo MAXIMUS', icono: 'ph-seal-check', estilo: 'background:#D1FAE5;color:#065F46;' },
        ninguno:  { texto: 'Verificado',     icono: 'ph-check',      estilo: 'background:#D1FAE5;color:#065F46;' }
    };

    const esGenerico = (n) => !n || !String(n).trim() || /^\s*asesor/i.test(n) || /aliado|externo/i.test(String(n));
    const digitos = (t) => String(t || '').replace(/\D/g, '');

    function svgIniciales(nombre) {
        const ini = String(nombre || 'M').split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || 'M';
        return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='100' height='100' viewBox='0 0 100 100'><rect width='100' height='100' rx='22' fill='%230B4A3F'/><text x='50%' y='55%' dominant-baseline='middle' text-anchor='middle' fill='%23ffffff' font-family='sans-serif' font-weight='800' font-size='38'>${encodeURIComponent(ini)}</text></svg>`;
    }

    // Regla local (sin base de datos)
    function desdeLocal(inm) {
        const a = (inm && inm.asesor) || {};
        const nombre = a.nombre || (inm && inm.asesor_nombre) || '';
        const origen = inm && (inm.origen_captura || inm.origenCaptura);
        // Captado de los grupos: externo y sin asesor de la plataforma vinculado
        const sinAsesorPlataforma = inm && !(inm.asesor_id || inm.asesorRefId || inm.agente_id || inm.agenteId);
        const esExterno = inm && (inm.isMaximus === false || inm.is_maximus === false || a.tipo === 'externo');
        if (esGenerico(nombre) || origen === 'whatsapp' || (esExterno && sinAsesorPlataforma)) {
            return { nombre: EQUIPO.nombre, cargo: EQUIPO.cargo, plan: 'equipo', whatsapp: EQUIPO.whatsapp, avatar_url: null, es_equipo: true };
        }
        const texto = `${a.cargo || ''} ${a.experiencia || ''} ${a.tipo || ''}`;
        const plan = /platinum/i.test(texto) ? 'platinum' : /gold/i.test(texto) ? 'gold' : /bronce|pro\b/i.test(texto) ? 'bronce'
            : (a.tipo === 'maximus' || /maximus/i.test(texto) || nombre === EQUIPO.nombre) ? 'equipo' : null;
        return {
            nombre,
            cargo: plan === 'equipo' ? (/maximus|director/i.test(a.cargo || '') ? a.cargo : EQUIPO.cargo)
                : plan ? `Asesor Inmobiliario ${ETIQUETAS[plan].texto}` : (a.cargo || 'Asesor Inmobiliario'),
            plan,
            whatsapp: digitos(a.whatsapp || a.telefono || (inm && inm.asesor_telefono)),
            avatar_url: a.avatar && !/ui-avatars|svg\+xml/.test(a.avatar) ? a.avatar : null,
            es_equipo: plan === 'equipo'
        };
    }

    async function desdeBase(id) {
        // Los ids de ejemplo locales ("inm-5") no existen en la base
        if (!id || /^inm-/i.test(String(id))) return null;
        const url = window.APP_CONFIG && APP_CONFIG.SUPABASE_URL;
        const key = window.APP_CONFIG && APP_CONFIG.SUPABASE_ANON_KEY;
        if (!url || !key) return null;
        try {
            const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/asesor_publico_inmueble', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
                body: JSON.stringify({ p_inmueble_id: String(id) }),
                signal: AbortSignal.timeout ? AbortSignal.timeout(6000) : undefined
            });
            if (!r.ok) return null; // p. ej. 404 si el SQL aún no se ejecutó
            const d = await r.json();
            return d && d.nombre ? d : null;
        } catch (_) { return null; }
    }

    function pintar(prefijo, info, inm) {
        const $ = (s) => document.getElementById(`${prefijo}-asesor-${s}`);
        const et = ETIQUETAS[info.plan] || ETIQUETAS.ninguno;

        const n = $('nombre');
        if (n) n.textContent = info.nombre;
        const c = $('cargo');
        if (c) c.textContent = info.cargo;

        const chip = $('plan');
        if (chip) {
            chip.style.cssText = et.estilo + 'display:inline-flex;align-items:center;gap:3px;';
            chip.innerHTML = `<i class="ph-fill ${et.icono}"></i>${et.texto}`;
            chip.title = info.es_equipo ? 'Asesor del equipo MAXIMUS' : `Asesor con plan ${et.texto}`;
        }

        const av = $('avatar');
        if (av) {
            const fallback = svgIniciales(info.nombre);
            av.onerror = function () { this.onerror = null; this.src = fallback; };
            av.src = info.avatar_url || fallback;
            av.alt = info.nombre;
        }

        const tel = digitos(info.whatsapp);
        const btnTel = $('tel-btn');
        if (btnTel && tel) btnTel.href = `tel:+${tel}`;
        const btnWa = $('whatsapp-btn');
        if (btnWa && tel && btnWa.tagName === 'A') {
            const codigo = (inm && inm.codigo) || '';
            const titulo = (inm && inm.titulo) || 'el inmueble';
            const msg = `Hola ${info.nombre.split(' ')[0]}, te escribo desde la plataforma MAXIMUS por la propiedad ${codigo} (${titulo}). Me gustaría coordinar una visita.`;
            btnWa.href = `https://wa.me/${tel}?text=${encodeURIComponent(msg)}`;
        }

        // Que el resto de la página (botón de WhatsApp de la ficha pública) use el mismo contacto
        if (inm) {
            inm.asesor = Object.assign({}, inm.asesor || {}, {
                nombre: info.nombre, cargo: info.cargo, telefono: tel ? '+' + tel : (inm.asesor && inm.asesor.telefono), whatsapp: tel, plan: info.plan
            });
        }
    }

    async function aplicar(prefijo, inm) {
        const id = inm && inm.id;
        // Marca qué inmueble se está pintando (evita que una respuesta lenta pise a otra ficha)
        const marca = `${prefijo}:${id}:${Date.now()}`;
        aplicar._ultimo = aplicar._ultimo || {};
        aplicar._ultimo[prefijo] = marca;

        pintar(prefijo, desdeLocal(inm), inm);          // inmediato, con datos locales
        const remoto = await desdeBase(id);              // luego, la verdad de la base
        if (remoto && aplicar._ultimo[prefijo] === marca) pintar(prefijo, remoto, inm);
    }

    window.AsesorPublico = { aplicar, desdeLocal, EQUIPO };
})();
