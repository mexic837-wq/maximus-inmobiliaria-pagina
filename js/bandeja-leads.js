/**
 * MAXIMUS · Bandeja de leads con cronómetro (panel de asesores y admin).
 *
 *   - Lista los contactos que aún no reciben respuesta, con el tiempo que llevan esperando:
 *     verde < 5 min, ámbar 5–30 min, rojo > 30 min.
 *   - Responder por WhatsApp, llamar o marcar "ya lo atendí" fija la primera respuesta
 *     (leads.primera_respuesta_at) y el lead sale de la bandeja.
 *   - El asesor ve los suyos; el admin ve todos y puede reasignar.
 *   - Revisa cada minuto: actualiza el contador del menú y avisa si entra un lead nuevo.
 *
 * Los avisos por WhatsApp a los 5 y 30 minutos los manda n8n
 * (n8n/workflow-leads-sin-responder.json + sql/migration-bandeja-leads.sql).
 */
(function () {
    'use strict';

    const MIN = 60000;
    const DIA = 24 * 60 * MIN;
    const REFRESCO_MS = 60000;

    let leads = [];
    let vistos = null;          // ids ya conocidos, para avisar solo de los nuevos
    let timerCronometros = null;
    let timerRefresco = null;
    let cargando = false;

    const $ = (id) => document.getElementById(id);
    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    // ---------- Usuario y permisos ----------
    function usuario() {
        try { return typeof getUsuarioActualCRM === 'function' ? getUsuarioActualCRM() : null; } catch (_) { return null; }
    }
    function esAdmin() {
        try { return typeof esUsuarioAdminCRM === 'function' && esUsuarioAdminCRM(); } catch (_) { return false; }
    }
    function esEquipo() {
        const u = usuario();
        const r = String((u && (u.role || u.rol)) || '').toLowerCase();
        return !!u && r !== 'cliente' && r !== 'usuario' && r !== '';
    }
    function esMio(l) {
        if (esAdmin()) return true;
        const u = usuario();
        try { return typeof leadPerteneceAUsuarioCRM === 'function' ? leadPerteneceAUsuarioCRM(l, u) : true; } catch (_) { return true; }
    }
    // Sin asesor: sin id, o con el valor por defecto del formulario ('asesor-1' + "Asesor MAXIMUS")
    function sinAsesor(l) {
        const id = String(l.agente_id || l.asesor_id || '').trim();
        const nombre = String(l.asesor_nombre || '').trim().toLowerCase();
        return !id || (id === 'asesor-1' && (!nombre || nombre === 'asesor maximus'));
    }

    // ---------- Datos ----------
    async function traerLeads() {
        const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
        const usarMock = typeof APP_CONFIG !== 'undefined' && APP_CONFIG.USE_MOCK_DATA;
        if (sb && !usarMock) {
            const desde = new Date(Date.now() - 7 * DIA).toISOString();
            const r = await sb.from((APP_CONFIG.TABLES && APP_CONFIG.TABLES.LEADS) || 'leads')
                .select('id,nombre,telefono,email,origen,estatus,inmueble_interes_id,inmueble_interes_titulo,asesor_id,asesor_nombre,agente_id,created_at,primera_respuesta_at')
                .or(`primera_respuesta_at.is.null,created_at.gte.${desde}`)
                .order('created_at', { ascending: false })
                .limit(500);
            if (r && !r.error && Array.isArray(r.data)) return r.data;
            // Sin la migración (columna primera_respuesta_at): leer como el CRM
        }
        if (window.LeadService) {
            const r = await LeadService.getAll();
            return (r && r.data) || [];
        }
        return [];
    }

    const pendiente = (l) => !l.primera_respuesta_at && String(l.estatus || 'nuevo') === 'nuevo';
    const edadMs = (l) => Date.now() - new Date(l.created_at || Date.now()).getTime();

    function misPendientes() {
        return leads.filter(l => pendiente(l) && (esMio(l) || sinAsesor(l)));
    }

    // ---------- Formato ----------
    function duracion(ms) {
        const m = Math.max(0, Math.floor(ms / MIN));
        if (m < 1) return 'menos de 1 min';
        if (m < 60) return m + ' min';
        const h = Math.floor(m / 60);
        if (h < 24) return h + ' h ' + (m % 60 ? (m % 60) + ' min' : '');
        const d = Math.floor(h / 24);
        return d + (d === 1 ? ' día' : ' días');
    }
    function nivel(ms) {
        if (ms < 5 * MIN) return { cls: 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/50 dark:text-emerald-300 dark:border-emerald-900', icono: 'ph-timer', txt: 'A tiempo' };
        if (ms < 30 * MIN) return { cls: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-900', icono: 'ph-warning', txt: 'Responde ya' };
        return { cls: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-950/40 dark:text-red-300 dark:border-red-900', icono: 'ph-siren', txt: 'Atrasado' };
    }
    const ORIGENES = {
        ficha_detalle_web: 'Ficha web', web: 'Web', whatsapp: 'WhatsApp', instagram: 'Instagram',
        meta_ads: 'Meta Ads', referido: 'Referido', llamada: 'Llamada', crm_manual: 'CRM',
        landing_lead_magnet_vende_con_nosotros: 'Valoración'
    };
    const origenTexto = (o) => ORIGENES[o] || String(o || 'Web');
    function telDigitos(t) {
        let d = String(t || '').replace(/\D/g, '');
        if (d.startsWith('0')) d = '58' + d.slice(1);          // 0424… → 58424…
        return d;
    }

    // ---------- Pintar ----------
    const CRONO_BASE = 'shrink-0 self-start md:self-center inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border text-xs font-bold';

    function fila(l) {
        const ms = edadMs(l);
        const n = nivel(ms);
        const tel = telDigitos(l.telefono);
        const admin = esAdmin();
        const libre = sinAsesor(l);
        const id = esc(l.id);
        return `
        <article class="bandeja-fila bg-white dark:bg-[#0A1F1B] rounded-2xl border border-gray-100 dark:border-emerald-950/60 shadow-sm p-4 flex flex-col xl:flex-row xl:items-center gap-3" data-lead="${id}">
            <div class="flex items-start sm:items-center gap-3 min-w-0 flex-1">
            <div data-crono="${esc(l.created_at || '')}" class="${CRONO_BASE} ${n.cls}">
                <i class="ph-bold ${n.icono}"></i><span data-crono-txt>${esc(duracion(ms))}</span>
            </div>
            <div class="min-w-0 flex-1">
                <p class="text-[15px] font-bold text-gray-900 dark:text-white truncate">${esc(l.nombre || 'Sin nombre')}</p>
                <p class="text-xs text-gray-500 dark:text-gray-400 truncate">
                    <span class="font-semibold text-emerald-700 dark:text-emerald-400">${esc(origenTexto(l.origen))}</span>
                    ${l.inmueble_interes_titulo ? ' · ' + esc(l.inmueble_interes_titulo) : ''}
                    ${l.telefono ? ' · ' + esc(l.telefono) : (l.email ? ' · ' + esc(l.email) : '')}
                </p>
                ${admin || libre ? `<p class="text-[11px] mt-0.5 ${libre ? 'text-amber-600 font-semibold' : 'text-gray-400'}">${libre ? 'Sin asesor asignado' : 'Asesor: ' + esc(l.asesor_nombre || '—')}</p>` : ''}
            </div>
            </div>
            <div class="flex flex-wrap items-center gap-2 xl:justify-end xl:shrink-0">
                ${tel ? `<button type="button" data-accion="whatsapp" class="h-9 px-3.5 rounded-xl bg-[#25D366] hover:bg-[#1ebe5b] text-white text-xs font-bold flex items-center gap-1.5"><i class="ph-bold ph-whatsapp-logo"></i> WhatsApp</button>
                <button type="button" data-accion="llamar" class="h-9 px-3.5 rounded-xl border border-gray-200 dark:border-emerald-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#0D2822] text-xs font-bold flex items-center gap-1.5"><i class="ph-bold ph-phone"></i> Llamar</button>`
                : l.email ? `<button type="button" data-accion="correo" class="h-9 px-3.5 rounded-xl border border-gray-200 dark:border-emerald-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#0D2822] text-xs font-bold flex items-center gap-1.5"><i class="ph-bold ph-envelope-simple"></i> Correo</button>` : ''}
                ${libre && !admin ? `<button type="button" data-accion="tomar" class="h-9 px-3.5 rounded-xl border border-amber-300 text-amber-700 hover:bg-amber-50 text-xs font-bold flex items-center gap-1.5"><i class="ph-bold ph-hand-grabbing"></i> Tomarlo</button>` : ''}
                <button type="button" data-accion="atendido" class="h-9 px-3.5 rounded-xl border border-gray-200 dark:border-emerald-900 text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-[#0D2822] text-xs font-bold flex items-center gap-1.5" title="Ya le respondiste por otro medio"><i class="ph-bold ph-check"></i> Ya lo atendí</button>
                <button type="button" data-accion="ficha" class="h-9 w-9 rounded-xl border border-gray-200 dark:border-emerald-900 text-gray-500 hover:text-maximus-dark hover:bg-gray-50 dark:hover:bg-[#0D2822] flex items-center justify-center" title="Ver ficha del cliente" aria-label="Ver ficha del cliente"><i class="ph-bold ph-identification-card"></i></button>
                ${admin ? selectorReasignar(l) : ''}
            </div>
        </article>`;
    }

    function asesores() {
        const lista = (typeof ASESORES_MAXIMUS_DATA !== 'undefined' && Array.isArray(ASESORES_MAXIMUS_DATA)) ? ASESORES_MAXIMUS_DATA : [];
        return lista.filter(a => a && a.id && a.nombre);
    }
    function selectorReasignar(l) {
        const lista = asesores();
        if (!lista.length) return '';
        const actual = String(l.agente_id || l.asesor_id || '');
        return `<select data-accion="reasignar" aria-label="Reasignar lead" class="h-9 pl-2.5 pr-7 rounded-xl border border-gray-200 dark:border-emerald-900 bg-white dark:bg-[#0D2822] text-xs font-semibold text-gray-700 dark:text-gray-200 max-w-[170px]">
            <option value="">Reasignar a…</option>
            ${lista.map(a => `<option value="${esc(a.id)}" ${String(a.id) === actual ? 'disabled' : ''}>${esc(a.nombre)}</option>`).join('')}
        </select>`;
    }

    function kpis() {
        const desde = Date.now() - 7 * DIA;
        const mios = leads.filter(l => esMio(l) && new Date(l.created_at).getTime() >= desde);
        const resp = mios.filter(l => l.primera_respuesta_at)
            .map(l => new Date(l.primera_respuesta_at).getTime() - new Date(l.created_at).getTime())
            .filter(ms => ms >= 0)
            .sort((a, b) => a - b);
        const set = (id, v) => { const el = $(id); if (el) el.textContent = v; };
        set('bandeja-kpi-pendientes', String(misPendientes().filter(l => edadMs(l) < DIA).length));
        set('bandeja-kpi-5min', resp.length ? Math.round(100 * resp.filter(ms => ms <= 5 * MIN).length / resp.length) + '%' : '–');
        const mitad = Math.floor(resp.length / 2);
        const mediana = resp.length % 2 ? resp[mitad] : (resp[mitad - 1] + resp[mitad]) / 2;
        set('bandeja-kpi-mediana', resp.length ? duracion(mediana) : '–');
    }

    function pintar() {
        const cont = $('bandeja-lista');
        if (!cont) return;
        const pend = misPendientes();
        const recientes = pend.filter(l => edadMs(l) < DIA).sort((a, b) => edadMs(b) - edadMs(a));
        const antiguos = pend.filter(l => edadMs(l) >= DIA).sort((a, b) => edadMs(a) - edadMs(b));

        kpis();
        actualizarContador();

        if (!pend.length) {
            cont.innerHTML = `
            <div class="bg-white dark:bg-[#0A1F1B] rounded-3xl border border-gray-100 dark:border-emerald-950/60 p-10 text-center">
                <div class="w-14 h-14 mx-auto rounded-2xl bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 flex items-center justify-center text-2xl"><i class="ph-fill ph-check-circle"></i></div>
                <p class="mt-3 text-lg font-extrabold text-maximus-dark dark:text-white">Bandeja al día</p>
                <p class="text-sm text-gray-500 dark:text-gray-400">No hay clientes esperando respuesta. Te avisaremos cuando entre uno nuevo.</p>
            </div>`;
        } else {
            cont.innerHTML = `
                ${recientes.length ? `<div class="space-y-2.5">${recientes.map(fila).join('')}</div>` : ''}
                ${antiguos.length ? `
                <details class="group bg-white/60 dark:bg-[#0A1F1B]/60 rounded-2xl border border-gray-100 dark:border-emerald-950/60" ${recientes.length ? '' : 'open'}>
                    <summary class="cursor-pointer select-none list-none px-4 py-3 text-sm font-bold text-gray-600 dark:text-gray-300 flex items-center gap-2">
                        <i class="ph-bold ph-caret-right transition-transform group-open:rotate-90"></i>
                        Pendientes de más de un día (${antiguos.length})
                    </summary>
                    <div class="space-y-2.5 p-2.5 pt-0">${antiguos.map(fila).join('')}</div>
                </details>` : ''}`;
        }
        pintarRespondidos();
    }

    function pintarRespondidos() {
        const cont = $('bandeja-respondidos');
        if (!cont) return;
        const hoy = new Date(); hoy.setHours(0, 0, 0, 0);
        const lista = leads
            .filter(l => esMio(l) && l.primera_respuesta_at && new Date(l.primera_respuesta_at) >= hoy)
            .sort((a, b) => new Date(b.primera_respuesta_at) - new Date(a.primera_respuesta_at))
            .slice(0, 8);
        if (!lista.length) { cont.innerHTML = '<p class="text-xs text-gray-400 px-1">Aún no has respondido leads hoy.</p>'; return; }
        cont.innerHTML = lista.map(l => {
            const ms = new Date(l.primera_respuesta_at) - new Date(l.created_at);
            const ok = ms <= 5 * MIN;
            return `<div class="flex items-center justify-between gap-3 px-3 py-2 rounded-xl bg-white dark:bg-[#0A1F1B] border border-gray-100 dark:border-emerald-950/60">
                <span class="text-sm font-semibold text-gray-800 dark:text-gray-100 truncate">${esc(l.nombre || 'Sin nombre')}</span>
                <span class="shrink-0 text-xs font-bold ${ok ? 'text-emerald-600' : 'text-amber-600'}">${esc(duracion(Math.max(0, ms)))}</span>
            </div>`;
        }).join('');
    }

    // Solo cambia el texto y color de los cronómetros (sin repintar la lista)
    function tickCronometros() {
        document.querySelectorAll('#bandeja-lista [data-crono]').forEach(el => {
            const ms = Date.now() - new Date(el.getAttribute('data-crono') || Date.now()).getTime();
            const n = nivel(ms);
            const txt = el.querySelector('[data-crono-txt]');
            if (txt) txt.textContent = duracion(ms);
            const icono = el.querySelector('i');
            if (icono) icono.className = 'ph-bold ' + n.icono;
            el.className = CRONO_BASE + ' ' + n.cls;
        });
    }

    function actualizarContador() {
        const n = misPendientes().filter(l => edadMs(l) < DIA).length;
        const badge = $('badge-bandeja-leads');
        if (badge) {
            badge.textContent = n > 99 ? '99+' : String(n);
            badge.classList.toggle('hidden', n === 0);
        }
    }

    // ---------- Acciones ----------
    function quitarDeBandeja(id, campos) {
        const l = leads.find(x => String(x.id) === String(id));
        if (l) Object.assign(l, campos);
        pintar();
    }

    async function registrar(id, tipo, descripcion) {
        const ahora = new Date().toISOString();
        quitarDeBandeja(id, { primera_respuesta_at: ahora });
        try {
            if (window.LeadService && tipo) {
                await LeadService.addActividad(id, { tipo, titulo: tipo === 'whatsapp' ? 'WhatsApp enviado' : tipo === 'llamada' ? 'Llamada' : 'Atendido', descripcion, autor: (usuario() || {}).name || 'Asesor' });
            }
            if (window.LeadService) await LeadService.marcarRespondido(id);
        } catch (e) { console.warn('Bandeja de leads:', e); }
    }

    async function accion(btn) {
        const art = btn.closest('[data-lead]');
        if (!art) return;
        const id = art.getAttribute('data-lead');
        const l = leads.find(x => String(x.id) === String(id));
        if (!l) return;
        const tipo = btn.getAttribute('data-accion');
        const u = usuario() || {};
        const nombreAsesor = u.name || u.nombre || 'tu asesor de MAXIMUS';

        if (tipo === 'whatsapp') {
            const primer = String(l.nombre || '').split(' ')[0];
            const sobre = l.inmueble_interes_titulo ? ` sobre ${l.inmueble_interes_titulo}` : '';
            const msg = `Hola ${primer} 👋 Te saluda ${nombreAsesor}, de MAXIMUS Inmobiliaria. Recibí tu consulta${sobre}. ¿Te puedo ayudar con más información o agendar una visita?`;
            window.open(`https://wa.me/${telDigitos(l.telefono)}?text=${encodeURIComponent(msg)}`, '_blank', 'noopener');
            return registrar(id, 'whatsapp', 'Primera respuesta por WhatsApp desde la bandeja de leads.');
        }
        if (tipo === 'llamar') {
            window.location.href = 'tel:+' + telDigitos(l.telefono);
            return registrar(id, 'llamada', 'Llamada desde la bandeja de leads.');
        }
        if (tipo === 'correo') {
            const asunto = 'Tu consulta en MAXIMUS Inmobiliaria';
            const cuerpo = `Hola ${String(l.nombre || '').split(' ')[0]},\n\nTe saluda ${nombreAsesor}, de MAXIMUS Inmobiliaria. Recibí tu consulta${l.inmueble_interes_titulo ? ' sobre ' + l.inmueble_interes_titulo : ''}. ¿Cuándo te puedo llamar?\n`;
            window.location.href = `mailto:${l.email}?subject=${encodeURIComponent(asunto)}&body=${encodeURIComponent(cuerpo)}`;
            return registrar(id, 'email', 'Primera respuesta por correo desde la bandeja de leads.');
        }
        if (tipo === 'atendido') {
            return registrar(id, null, '');
        }
        if (tipo === 'tomar') {
            const campos = { asesor_id: String(u.id || ''), asesor_nombre: u.name || u.nombre || '' };
            if (/^[0-9a-f-]{36}$/i.test(String(u.id || ''))) campos.agente_id = u.id;
            Object.assign(l, campos);
            pintar();
            try { await LeadService.updateDetalles(id, campos); } catch (_) {}
            if (typeof mostrarToastNotificacion === 'function') mostrarToastNotificacion('Lead asignado a ti');
            return;
        }
        if (tipo === 'ficha') {
            if (typeof activateTab === 'function') activateTab('view-mis-clientes', true);
            if (typeof abrirModalFichaCliente360 === 'function') setTimeout(() => abrirModalFichaCliente360(id), 150);
        }
    }

    async function reasignar(select) {
        const art = select.closest('[data-lead]');
        const id = art && art.getAttribute('data-lead');
        const a = asesores().find(x => String(x.id) === select.value);
        if (!id || !a) return;
        const campos = { asesor_id: String(a.id), asesor_nombre: a.nombre };
        if (/^[0-9a-f-]{36}$/i.test(String(a.id))) campos.agente_id = a.id;
        const l = leads.find(x => String(x.id) === String(id));
        if (l) Object.assign(l, campos);
        pintar();
        try { await LeadService.updateDetalles(id, campos); } catch (_) {}
        if (typeof mostrarToastNotificacion === 'function') mostrarToastNotificacion('Lead reasignado a ' + a.nombre);
    }

    // ---------- Carga y refresco ----------
    async function refrescar({ avisarNuevos } = {}) {
        if (cargando || !esEquipo()) return;
        cargando = true;
        try {
            leads = await traerLeads();
        } catch (e) {
            console.warn('Bandeja de leads:', e);
        } finally {
            cargando = false;
        }
        const pend = misPendientes();
        if (avisarNuevos && vistos) {
            const nuevos = pend.filter(l => !vistos.has(String(l.id)) && edadMs(l) < 15 * MIN);
            if (nuevos.length && typeof mostrarToastNotificacion === 'function') {
                mostrarToastNotificacion(nuevos.length === 1
                    ? `🔔 Nuevo lead: ${nuevos[0].nombre || 'cliente'} — respóndele ya`
                    : `🔔 ${nuevos.length} leads nuevos esperando respuesta`);
            }
        }
        vistos = new Set(pend.map(l => String(l.id)));
        actualizarContador();
        if (vistaActiva()) pintar();
    }

    const vistaActiva = () => { const v = $('view-bandeja-leads'); return !!(v && v.classList.contains('active')); };

    function enlazar() {
        const vista = $('view-bandeja-leads');
        if (!vista || vista._enlazada) return;
        vista._enlazada = true;
        vista.addEventListener('click', (e) => {
            const btn = e.target.closest('button[data-accion]');
            if (btn) accion(btn);
            if (e.target.closest('#bandeja-refrescar')) cargar();
        });
        vista.addEventListener('change', (e) => {
            const sel = e.target.closest('select[data-accion="reasignar"]');
            if (sel) reasignar(sel);
        });
    }

    async function cargar() {
        enlazar();
        const cont = $('bandeja-lista');
        if (cont && !leads.length) cont.innerHTML = '<p class="text-sm text-gray-400 text-center py-10"><i class="ph ph-spinner animate-spin"></i> Cargando bandeja…</p>';
        await refrescar();
        pintar();
        clearInterval(timerCronometros);
        timerCronometros = setInterval(() => { if (vistaActiva()) tickCronometros(); }, 15000);
    }

    function iniciar() {
        if (!esEquipo() || timerRefresco) return;
        refrescar();
        timerRefresco = setInterval(() => { if (!document.hidden) refrescar({ avisarNuevos: true }); }, REFRESCO_MS);
        document.addEventListener('visibilitychange', () => { if (!document.hidden) refrescar({ avisarNuevos: true }); });
    }

    window.BandejaLeads = { cargar, iniciar, refrescar };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', () => setTimeout(iniciar, 1500));
    else setTimeout(iniciar, 1500);
})();
