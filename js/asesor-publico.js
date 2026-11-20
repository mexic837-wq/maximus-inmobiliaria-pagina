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
        bronce:   { texto: 'MAXIMUS',        icono: 'ph-seal-check', estilo: 'background:#D1FAE5;color:#065F46;' }, // Fase 4: sin planes
        gold:     { texto: 'MAXIMUS',        icono: 'ph-seal-check', estilo: 'background:#D1FAE5;color:#065F46;' },
        platinum: { texto: 'MAXIMUS',        icono: 'ph-seal-check', estilo: 'background:#D1FAE5;color:#065F46;' },
        equipo:   { texto: 'MAXIMUS', icono: 'ph-seal-check', estilo: 'background:#D1FAE5;color:#065F46;' },
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
        if (c) c.textContent = String(info.cargo || '').replace(/\s+(Bronce|Gold|Platinum|Pro)\s*$/i, ' MAXIMUS');

        const chip = $('plan');
        if (chip) {
            chip.style.cssText = et.estilo + 'display:inline-flex;align-items:center;gap:3px;';
            chip.innerHTML = `<i class="ph-fill ${et.icono}"></i>${et.texto}`;
            chip.title = 'Asesor del equipo MAXIMUS';
        }

        // Ventaja Platinum: enlace directo al Instagram. Solo el usuario (validado) y el enlace
        // lo armamos nosotros, así nunca se abre una dirección ajena. El servidor solo manda
        // 'instagram' cuando el plan Platinum está vigente.
        const ig = $('instagram');
        if (ig) {
            const usuario = /^[A-Za-z0-9._]{1,30}$/.test(String(info.instagram || '')) ? info.instagram : '';
            if (usuario) {
                ig.href = `https://instagram.com/${usuario}`;
                const t = $('instagram-texto');
                if (t) t.textContent = '@' + usuario;
                ig.title = `Instagram de ${info.nombre}`;
                ig.style.display = 'inline-flex';
            } else {
                ig.style.display = 'none';
                ig.removeAttribute('href');
            }
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

    // ------------------------------------------------------------------
    // Contactos y reseñas (sql/PENDIENTE-SUPABASE-TODO-EN-UNO.sql, Parte 8)
    //   · Al tocar WhatsApp / Llamar con sesión iniciada se registra el contacto.
    //     El servidor decide quién es el asesor a partir del inmueble.
    //   · Solo quien contactó puede calificar (lo exige la base de datos).
    //   · La ficha muestra "★ 5.0 · Sin reseñas aún" o "★ 4.8 · 7 reseñas".
    // ------------------------------------------------------------------
    const actuales = {};   // prefijo → inmueble en pantalla

    function cliente() {
        return (typeof window.getSupabase === 'function') ? window.getSupabase() : null;
    }

    async function rpc(nombre, params) {
        const sb = cliente();
        if (sb) {
            const { data, error } = await sb.rpc(nombre, params);
            if (error) throw error;
            return data;
        }
        const url = window.APP_CONFIG && APP_CONFIG.SUPABASE_URL;
        const key = window.APP_CONFIG && APP_CONFIG.SUPABASE_ANON_KEY;
        if (!url || !key) throw new Error('Supabase no configurado');
        const r = await fetch(url.replace(/\/$/, '') + '/rest/v1/rpc/' + nombre, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', apikey: key, Authorization: 'Bearer ' + key },
            body: JSON.stringify(params)
        });
        if (!r.ok) throw new Error('HTTP ' + r.status);
        return r.json();
    }

    async function haySesion() {
        const sb = cliente();
        if (!sb) return false;
        try { const { data } = await sb.auth.getSession(); return !!(data && data.session); } catch (_) { return false; }
    }

    // Registra el contacto (sin bloquear la apertura de WhatsApp o de la llamada)
    async function registrarContacto(inmuebleId, canal) {
        if (!inmuebleId || /^inm-/i.test(String(inmuebleId))) return false;
        if (!(await haySesion())) return false;
        try {
            const ok = await rpc('registrar_contacto_asesor', { p_inmueble_id: String(inmuebleId), p_canal: canal });
            if (ok) {
                Object.keys(actuales).forEach(p => {
                    if (actuales[p] && String(actuales[p].id) === String(inmuebleId)) pintarResenas(p, actuales[p]);
                });
            }
            return !!ok;
        } catch (_) { return false; } // p. ej. el SQL aún no se ejecutó
    }

    function estrellasHTML(v) {
        let h = '';
        for (let i = 1; i <= 5; i++) {
            const ic = v >= i ? 'ph-fill ph-star' : (v >= i - 0.5 ? 'ph-fill ph-star-half' : 'ph ph-star');
            h += `<i class="${ic}"></i>`;
        }
        return h;
    }

    // Línea de calificación bajo el nombre del asesor
    async function pintarResenas(prefijo, inm) {
        const btn = document.getElementById(`${prefijo}-asesor-resenas`);
        if (!btn || !inm || !inm.id) return;
        const id = String(inm.id);
        pintarResenas._marca = pintarResenas._marca || {};
        pintarResenas._marca[prefijo] = id;
        let r = null;
        try { r = /^inm-/i.test(id) ? null : await rpc('resumen_resenas_inmueble', { p_inmueble_id: id }); } catch (_) { r = null; }
        if (pintarResenas._marca[prefijo] !== id) return; // ya se abrió otra ficha
        if (!r || !r.asesor_auth_id) { btn.classList.add('hidden'); btn.classList.remove('inline-flex'); btn._resumen = null; return; }

        const est = Number(r.estrellas || 5);
        const n = Number(r.total_resenas || 0);
        const e = document.getElementById(`${prefijo}-asesor-resenas-estrellas`);
        const t = document.getElementById(`${prefijo}-asesor-resenas-texto`);
        if (e) e.innerHTML = estrellasHTML(est);
        if (t) t.textContent = `${est.toFixed(1)} · ${n > 0 ? `${n} ${n === 1 ? 'reseña' : 'reseñas'}` : 'Sin reseñas aún'}`;
        btn._resumen = r;
        btn.title = r.ya_reseno ? 'Ver o editar tu reseña' : (r.contacto ? 'Califica a este asesor' : 'Ver reseñas');
        btn.onclick = () => {
            if (typeof window.abrirModalResenasAsesor === 'function') {
                window.abrirModalResenasAsesor({
                    auth_id: r.asesor_auth_id,
                    nombre: r.nombre || (inm.asesor && inm.asesor.nombre) || 'Asesor',
                    avatar_url: r.avatar_url,
                    estrellas: est,
                    total_resenas: n,
                    plan: inm.asesor && inm.asesor.plan,
                    contacto: !!r.contacto
                });
            }
        };
        btn.classList.remove('hidden'); btn.classList.add('inline-flex');
    }

    // Registra el contacto al tocar los botones de la tarjeta del asesor (una sola vez por botón)
    function enlazarContacto(prefijo) {
        [['whatsapp-btn', 'whatsapp'], ['tel-btn', 'llamada']].forEach(([sufijo, canal]) => {
            const el = document.getElementById(`${prefijo}-asesor-${sufijo}`);
            if (!el || el._mxContacto) return;
            el._mxContacto = true;
            el.addEventListener('click', () => { const inm = actuales[prefijo]; if (inm) registrarContacto(inm.id, canal); });
        });
    }

    async function aplicar(prefijo, inm) {
        const id = inm && inm.id;
        // Marca qué inmueble se está pintando (evita que una respuesta lenta pise a otra ficha)
        const marca = `${prefijo}:${id}:${Date.now()}`;
        aplicar._ultimo = aplicar._ultimo || {};
        aplicar._ultimo[prefijo] = marca;
        actuales[prefijo] = inm;
        enlazarContacto(prefijo);
        pintarResenas(prefijo, inm);

        pintar(prefijo, desdeLocal(inm), inm);          // inmediato, con datos locales
        const remoto = await desdeBase(id);              // luego, la verdad de la base
        if (remoto && aplicar._ultimo[prefijo] === marca) pintar(prefijo, remoto, inm);
    }

    window.AsesorPublico = {
        aplicar, desdeLocal, EQUIPO, registrarContacto, pintarResenas,
        inmuebleActual: (prefijo) => actuales[prefijo] || null
    };
})();
