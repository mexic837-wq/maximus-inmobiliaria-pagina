/**
 * MAXIMUS · Funciones con QR del panel (Fase 3, uso interno).
 *
 *   QrMaximus.inmueble()        → QR del letrero del inmueble abierto (cuenta escaneos)
 *   QrMaximus.coleccion(id)     → QR para que el cliente vea su colección (invitación)
 *   QrMaximus.invitarLead()     → QR de invitación al portal para el cliente abierto en el CRM
 *   QrMaximus.llegadaCita(id)   → QR que el cliente escanea al llegar a la visita
 *
 * Usa el generador que ya carga el panel (cargarLibreriaQr / qrcodejs) y las funciones
 * de la PARTE 12 del SQL (sql/migration-fase3-qr.sql).
 */
(function () {
    'use strict';

    const esc = (v) => String(v == null ? '' : v)
        .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

    const FALTA_SQL = 'Esta función necesita que se aplique la Parte 12 del SQL en Supabase (pendiente-vps).';

    function origen() {
        return /^https?:$/.test(location.protocol) ? location.origin : 'https://maximusinmobiliaria.tech';
    }

    function sb() {
        try { return typeof window.getSupabase === 'function' ? window.getSupabase() : null; } catch (_) { return null; }
    }

    async function rpc(nombre, args) {
        const c = sb();
        if (!c) return { error: { message: 'Sin conexión con la base de datos' } };
        try { return await c.rpc(nombre, args || {}); } catch (e) { return { error: e }; }
    }

    async function cargarQr() {
        if (window.QRCode) return;
        if (typeof cargarLibreriaQr === 'function') return cargarLibreriaQr();
        await new Promise((ok, fallo) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/qrcodejs/1.0.0/qrcode.min.js';
            s.onload = ok; s.onerror = () => fallo(new Error('No se pudo cargar el generador de QR'));
            document.head.appendChild(s);
        });
    }

    function lienzoQr(texto, tam) {
        const caja = document.createElement('div');
        new QRCode(caja, { text: texto, width: tam, height: tam, colorDark: '#0B2B25', colorLight: '#FFFFFF', correctLevel: QRCode.CorrectLevel.H });
        return caja.querySelector('canvas');
    }

    function nombreArchivo(base) {
        return 'maximus-qr-' + String(base || 'codigo').toLowerCase()
            .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 50) + '.png';
    }

    // Cartel imprimible (mismo estilo que la tarjeta del asesor)
    async function descargarCartel(url, cartel, archivo) {
        await cargarQr();
        if (document.fonts && document.fonts.load) { try { await document.fonts.load('800 40px "Plus Jakarta Sans"'); } catch (_) {} }
        const qr = lienzoQr(url, 640);
        if (!qr) throw new Error('sin lienzo');
        const W = 900, H = 1180;
        const c = document.createElement('canvas'); c.width = W; c.height = H;
        const g = c.getContext('2d');
        const fuente = '"Plus Jakarta Sans", Arial, sans-serif';
        g.fillStyle = '#FFFFFF'; g.fillRect(0, 0, W, H);
        const grad = g.createLinearGradient(0, 0, W, 220);
        grad.addColorStop(0, '#0B2B25'); grad.addColorStop(1, '#0B4A3F');
        g.fillStyle = grad; g.fillRect(0, 0, W, 190);
        g.font = `800 64px ${fuente}`; g.textAlign = 'left';
        const a1 = g.measureText('MAXIMUS').width, a2 = g.measureText('.').width;
        const x0 = (W - (a1 + a2)) / 2;
        g.fillStyle = '#FFFFFF'; g.fillText('MAXIMUS', x0, 118);
        g.fillStyle = '#10B981'; g.fillText('.', x0 + a1, 118);
        g.textAlign = 'center';
        g.fillStyle = '#FFFFFF'; g.strokeStyle = '#E5E7EB'; g.lineWidth = 3;
        g.beginPath();
        if (g.roundRect) g.roundRect(110, 250, 680, 680, 36); else g.rect(110, 250, 680, 680);
        g.fill(); g.stroke();
        g.drawImage(qr, 130, 270, 640, 640);
        const recortar = (t, max) => {
            t = String(t || '');
            if (g.measureText(t).width <= max) return t;
            while (t && g.measureText(t + '…').width > max) t = t.slice(0, -1);
            return t + '…';
        };
        g.fillStyle = '#0B2B25'; g.font = `800 50px ${fuente}`;
        g.fillText(recortar(cartel.titulo, 820), W / 2, 1000);
        g.fillStyle = '#374151'; g.font = `700 34px ${fuente}`;
        g.fillText(recortar(cartel.linea1, 820), W / 2, 1052);
        g.fillStyle = '#9CA3AF'; g.font = `600 26px ${fuente}`;
        g.fillText(recortar(cartel.linea2 || '', 820), W / 2, 1100);
        const a = document.createElement('a');
        a.href = c.toDataURL('image/png');
        a.download = archivo;
        document.body.appendChild(a); a.click(); a.remove();
    }

    // ---------- Ventana ----------
    function cerrar() {
        const m = document.getElementById('qr-maximus-modal');
        if (m) m.remove();
        document.removeEventListener('keydown', teclaEsc);
    }
    function teclaEsc(e) { if (e.key === 'Escape') cerrar(); }

    function abrirModal({ titulo, subtitulo, cargando }) {
        cerrar();
        const m = document.createElement('div');
        m.id = 'qr-maximus-modal';
        m.className = 'fixed inset-0 z-[400] flex items-center justify-center p-4 bg-[#04110E]/70 backdrop-blur-sm';
        m.setAttribute('role', 'dialog');
        m.setAttribute('aria-modal', 'true');
        m.innerHTML = `
            <div class="w-full max-w-sm max-h-[92vh] overflow-y-auto rounded-3xl bg-white dark:bg-[#0A1F1B] shadow-2xl">
                <div class="flex items-start justify-between gap-3 p-5 pb-3">
                    <div class="min-w-0">
                        <h3 class="text-lg font-extrabold text-maximus-dark dark:text-white leading-tight">${esc(titulo)}</h3>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${esc(subtitulo || '')}</p>
                    </div>
                    <button type="button" data-cerrar aria-label="Cerrar" class="w-9 h-9 shrink-0 rounded-xl bg-gray-100 dark:bg-[#0D2822] text-gray-500 hover:text-gray-800 flex items-center justify-center"><i class="ph-bold ph-x"></i></button>
                </div>
                <div data-cuerpo class="px-5 pb-5">
                    <div class="py-12 text-center text-sm text-gray-400"><i class="ph ph-circle-notch animate-spin text-2xl"></i><p class="mt-2">${esc(cargando || 'Preparando el código…')}</p></div>
                </div>
            </div>`;
        m.addEventListener('click', (e) => { if (e.target === m || e.target.closest('[data-cerrar]')) cerrar(); });
        document.addEventListener('keydown', teclaEsc);
        document.body.appendChild(m);
        return m.querySelector('[data-cuerpo]');
    }

    function mostrarError(cuerpo, texto) {
        cuerpo.innerHTML = `<div class="p-4 rounded-2xl bg-amber-50 dark:bg-amber-950/40 text-amber-900 dark:text-amber-200 text-sm leading-relaxed"><i class="ph-fill ph-warning"></i> ${esc(texto)}</div>`;
    }

    async function pintarQr(cuerpo, { url, cartel, archivo, compartirTexto, telefono, extraHtml, alCompartir }) {
        try { await cargarQr(); } catch (e) { return mostrarError(cuerpo, e.message); }
        const wa = String(telefono || '').replace(/\D/g, '');
        const waUrl = `https://wa.me/${wa}?text=${encodeURIComponent((compartirTexto ? compartirTexto + '\n' : '') + url)}`;
        cuerpo.innerHTML = `
            <div class="mx-auto w-56 h-56 p-3 rounded-2xl bg-white border border-gray-200 flex items-center justify-center" data-qr></div>
            <p class="mt-3 text-[11px] text-center text-gray-400 break-all select-all">${esc(url.replace(/^https?:\/\//, ''))}</p>
            ${extraHtml || ''}
            <div class="mt-4 grid grid-cols-1 gap-2">
                <button type="button" data-descargar class="h-11 rounded-xl bg-maximus-dark hover:bg-[#07362e] text-white text-sm font-bold flex items-center justify-center gap-2"><i class="ph-bold ph-download-simple"></i> Descargar cartel para imprimir</button>
                <div class="grid grid-cols-2 gap-2">
                    <button type="button" data-copiar class="h-10 rounded-xl bg-gray-100 dark:bg-[#0D2822] hover:bg-gray-200 text-gray-700 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-1.5"><i class="ph-bold ph-copy"></i> <span>Copiar enlace</span></button>
                    <a href="${esc(waUrl)}" target="_blank" rel="noopener" class="h-10 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-xs font-bold flex items-center justify-center gap-1.5"><i class="ph-fill ph-whatsapp-logo"></i> WhatsApp</a>
                </div>
            </div>`;
        const qr = lienzoQr(url, 400);
        if (qr) {
            // qrcodejs esconde su lienzo poco después (muestra una <img>): se copia a uno propio
            const copia = document.createElement('canvas');
            copia.width = qr.width; copia.height = qr.height;
            copia.getContext('2d').drawImage(qr, 0, 0);
            copia.style.width = '100%'; copia.style.height = '100%';
            copia.setAttribute('role', 'img');
            copia.setAttribute('aria-label', 'Código QR');
            cuerpo.querySelector('[data-qr]').appendChild(copia);
        }
        cuerpo.querySelector('[data-descargar]').addEventListener('click', async (e) => {
            const b = e.currentTarget; b.disabled = true;
            try { await descargarCartel(url, cartel, archivo); } catch (err) { MaxDialog.alert({ tono: 'error', titulo: 'No se pudo generar el cartel', mensaje: err.message }); }
            b.disabled = false;
        });
        cuerpo.querySelector('[data-copiar]').addEventListener('click', async (e) => {
            const span = e.currentTarget.querySelector('span');
            try { await navigator.clipboard.writeText(url); span.textContent = '¡Copiado!'; }
            catch (_) { MaxDialog.copiar({ titulo: 'Copia este enlace', texto: url }); }
            setTimeout(() => { span.textContent = 'Copiar enlace'; }, 1800);
        });
        // Aviso opcional cuando el asesor lo comparte (copiar, WhatsApp o descargar el cartel)
        if (typeof alCompartir === 'function') {
            cuerpo.querySelectorAll('[data-copiar], [data-descargar], a[href^="https://wa.me"]').forEach(b => {
                b.addEventListener('click', () => { try { alCompartir(); } catch (_) {} });
            });
        }
    }

    function asesorNombre() {
        try { if (typeof currentUserProfile !== 'undefined' && currentUserProfile && currentUserProfile.name) return currentUserProfile.name; } catch (_) {}
        try { const u = JSON.parse(localStorage.getItem('maximus_user') || '{}'); return u.nombre || u.name || 'Asesor MAXIMUS'; } catch (_) { return 'Asesor MAXIMUS'; }
    }

    // ---------- 1. Letrero del inmueble ----------
    async function inmueble() {
        const d = (typeof currentInmuebleAirbnb !== 'undefined') ? currentInmuebleAirbnb : null;
        if (!d || !d.id) return MaxDialog.alert({ titulo: 'Abre un inmueble', mensaje: 'Abre primero la ficha de un inmueble para crear su QR.' });
        const cuerpo = abrirModal({ titulo: 'QR para el letrero', subtitulo: d.titulo || 'Inmueble' });
        const url = `${origen()}/detalle-propiedad?id=${encodeURIComponent(d.id)}&qr=1`;
        let extra = '';
        const r = await rpc('contar_escaneos_qr', { p_tipo: 'inmueble', p_ref: String(d.id) });
        const fila = r && !r.error ? (Array.isArray(r.data) ? r.data[0] : r.data) : null;
        if (fila) {
            const ult = fila.ultimo ? new Date(fila.ultimo).toLocaleDateString('es-VE', { day: 'numeric', month: 'short' }) : '—';
            extra = `<div class="mt-3 grid grid-cols-3 gap-2 text-center">
                <div class="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40"><p class="text-lg font-extrabold text-emerald-800 dark:text-emerald-200">${Number(fila.total || 0)}</p><p class="text-[10px] text-gray-500">escaneos</p></div>
                <div class="p-2 rounded-xl bg-gray-50 dark:bg-[#0D2822]"><p class="text-lg font-extrabold text-maximus-dark dark:text-white">${Number(fila.ultimos_7_dias || 0)}</p><p class="text-[10px] text-gray-500">últimos 7 días</p></div>
                <div class="p-2 rounded-xl bg-gray-50 dark:bg-[#0D2822]"><p class="text-sm font-extrabold text-maximus-dark dark:text-white mt-1">${esc(ult)}</p><p class="text-[10px] text-gray-500">último</p></div>
            </div>`;
        } else {
            extra = `<p class="mt-3 text-[11px] text-center text-gray-400">El conteo de escaneos se activa al aplicar la Parte 12 del SQL.</p>`;
        }
        await pintarQr(cuerpo, {
            url,
            cartel: { titulo: 'Escanea y conoce este inmueble', linea1: d.titulo || 'Inmueble MAXIMUS', linea2: [d.codigo, d.ubicacion].filter(Boolean).join(' · ') },
            archivo: nombreArchivo('letrero-' + (d.codigo || d.titulo)),
            compartirTexto: 'Mira este inmueble de MAXIMUS:',
            extraHtml: extra
        });
    }

    // ---------- 2 y 3. Invitación del cliente (CRM o colección) ----------
    async function invitar({ email, nombre, telefono, destino, titulo, subtitulo, cartelTitulo, lead }) {
        email = String(email || '').trim().toLowerCase();
        if (!email) {
            const escrito = await MaxDialog.prompt({
                icono: 'correo',
                titulo: '¿A qué correo lo invitamos?',
                mensaje: (nombre || 'Tu cliente') + ' crea su cuenta con este correo y queda ligado a ti. Se guarda en su ficha para no pedírtelo otra vez.',
                etiqueta: 'Correo del cliente',
                placeholder: 'cliente@correo.com',
                tipo: 'email',
                aceptar: 'Crear invitación'
            });
            if (!escrito) return;
            email = escrito.toLowerCase();
            // Se guarda en la ficha del cliente
            if (lead && lead.id) {
                lead.email = email;
                try { if (window.LeadService) LeadService.updateDetalles(lead.id, { email }); } catch (_) {}
            }
        }
        const cuerpo = abrirModal({ titulo, subtitulo, cargando: 'Creando la invitación…' });
        const r = await rpc('crear_invitacion_cliente', { p_email: email, p_nombre: nombre || null, p_destino: destino || 'view-mi-asesor' });
        if (!r || r.error || !r.data) {
            const msg = r && r.error && r.error.message ? r.error.message : '';
            return mostrarError(cuerpo, /function|does not exist|schema cache|404/i.test(msg) || !msg ? FALTA_SQL : msg);
        }
        const url = `${origen()}/login?invitacion=${encodeURIComponent(r.data)}`;
        const primer = String(nombre || '').split(' ')[0];
        await pintarQr(cuerpo, {
            url,
            cartel: { titulo: cartelTitulo || 'Tu portal MAXIMUS', linea1: nombre ? `Para ${nombre}` : 'Escanea para entrar', linea2: `Te invita ${asesorNombre()}` },
            archivo: nombreArchivo('invitacion-' + (nombre || email.split('@')[0])),
            compartirTexto: `Hola${primer ? ' ' + primer : ''}, te invito al portal de MAXIMUS. Ahí verás tus visitas, cómo va tu operación y los inmuebles que elegí para ti:`,
            telefono,
            extraHtml: `<p class="mt-3 text-[11px] text-center text-gray-500">Invitación para <strong>${esc(email)}</strong>. Vale 30 días y solo sirve para ese correo.</p>`
        });
    }

    function invitarLead() {
        const lead = (typeof crmLeadsList !== 'undefined' && typeof crmSelectedLeadId !== 'undefined')
            ? crmLeadsList.find(l => l.id === crmSelectedLeadId) : null;
        if (!lead) return MaxDialog.alert({ titulo: 'Abre un cliente', mensaje: 'Abre primero la ficha de un cliente para invitarlo al portal.' });
        return invitar({
            email: lead.email, nombre: lead.nombre, telefono: lead.telefono,
            titulo: 'Invitar al portal', subtitulo: 'Tu cliente crea su cuenta y queda ligado a ti.', lead
        });
    }

    // Enlace directo / QR de la colección: el cliente la ve sin cuenta (página /coleccion) y marca
    // «Me interesa». Desde aquí también se puede invitarlo al portal o renovar el enlace.
    async function coleccion(id) {
        const col = (typeof coleccionesVipList !== 'undefined') ? coleccionesVipList.find(c => String(c.id) === String(id)) : null;
        if (!col) return;
        const cuerpo = abrirModal({ titulo: 'Enlace y QR de la colección', subtitulo: col.titulo || 'Selección de inmuebles', cargando: 'Preparando el enlace…' });
        if (!col.token) {
            return mostrarError(cuerpo, 'Esta colección todavía no tiene enlace. Falta ejecutar en Supabase el SQL de colecciones del portal (sql/migration-colecciones-portal.sql) y recargar el panel.');
        }
        const url = `${origen()}/coleccion?c=${encodeURIComponent(col.id)}&t=${encodeURIComponent(col.token)}`;
        const vistas = Number(col.vistas || 0);
        const respuestas = col.reacciones && typeof col.reacciones === 'object' ? Object.keys(col.reacciones).length : 0;
        const primer = String(col.cliente || '').split(' ')[0];
        const extra = `
            <div class="mt-3 grid grid-cols-2 gap-2 text-center">
                <div class="p-2 rounded-xl bg-emerald-50 dark:bg-emerald-950/40"><p class="text-lg font-extrabold text-emerald-800 dark:text-emerald-200">${vistas}</p><p class="text-[10px] text-gray-500">veces abierta</p></div>
                <div class="p-2 rounded-xl bg-gray-50 dark:bg-[#0D2822]"><p class="text-lg font-extrabold text-maximus-dark dark:text-white">${respuestas}</p><p class="text-[10px] text-gray-500">inmuebles con respuesta</p></div>
            </div>
            <p class="mt-3 text-[11px] text-center text-gray-500">Quien tenga este enlace la ve <strong>sin crear cuenta</strong> y puede marcar «Me interesa». Si lo compartiste por error, renuévalo.</p>
            <div class="mt-3 grid grid-cols-2 gap-2">
                <button type="button" data-invitar class="h-10 rounded-xl border border-gray-200 dark:border-emerald-950 text-gray-700 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-gray-50 dark:hover:bg-[#0D2822]"><i class="ph-bold ph-user-plus"></i> Invitar al portal</button>
                <button type="button" data-renovar class="h-10 rounded-xl border border-gray-200 dark:border-emerald-950 text-gray-700 dark:text-gray-200 text-xs font-bold flex items-center justify-center gap-1.5 hover:bg-gray-50 dark:hover:bg-[#0D2822]"><i class="ph-bold ph-arrows-clockwise"></i> Renovar enlace</button>
            </div>`;
        await pintarQr(cuerpo, {
            url,
            cartel: { titulo: 'Tu selección de inmuebles', linea1: col.cliente ? `Para ${col.cliente}` : (col.titulo || 'Selección MAXIMUS'), linea2: `La preparó ${asesorNombre()}` },
            archivo: nombreArchivo('coleccion-' + (col.cliente || col.titulo)),
            compartirTexto: `Hola${primer ? ' ' + primer : ''}, preparé una selección de inmuebles para ti. Ábrela con fotos y dime cuáles te interesan:`,
            telefono: col.telefono,
            extraHtml: extra,
            alCompartir: () => marcarEnviada(col)
        });

        const btnInv = cuerpo.querySelector('[data-invitar]');
        if (btnInv) btnInv.addEventListener('click', () => invitar({
            email: col.email || col.cliente_email, nombre: col.cliente, telefono: col.telefono,
            destino: 'view-mis-colecciones', titulo: 'Invitar al portal',
            subtitulo: 'Crea su cuenta y verá sus colecciones ahí.', cartelTitulo: 'Tu portal MAXIMUS'
        }));
        const btnRen = cuerpo.querySelector('[data-renovar]');
        if (btnRen) btnRen.addEventListener('click', async () => {
            const ok = await MaxDialog.confirm({ peligro: true, icono: 'ph-arrows-clockwise', titulo: '¿Renovar el enlace?', mensaje: 'El enlace y el QR anteriores dejan de funcionar. Tendrás que enviarle el nuevo al cliente.', aceptar: 'Sí, renovar', cancelar: 'Cancelar' });
            if (!ok) return;
            const r = await window.ColeccionesVipService.renovarToken(col.id);
            if (!r || r.error || !r.data) {
                return MaxDialog.alert({ titulo: 'No se pudo renovar', mensaje: (r && r.error && r.error.message) || 'Revisa que el SQL de colecciones esté aplicado.' });
            }
            col.token = r.data;
            coleccion(id);
        });
    }

    // Borrador → enviada, la primera vez que el asesor la comparte
    function marcarEnviada(col) {
        if (!col || col.enviada_at || !window.ColeccionesVipService) return;
        col.enviada_at = new Date().toISOString();
        Promise.resolve(window.ColeccionesVipService.marcarEnviada(col.id)).then(() => {
            if (typeof renderColeccionesVIP === 'function') renderColeccionesVIP();
        }).catch(() => {});
    }

    // ---------- 4. Llegada a la visita ----------
    async function llegadaCita(id) {
        const cita = (window._agendaCitas || []).find(c => String(c.id) === String(id));
        const titulo = cita ? (cita.inmueble_titulo || String(cita.titulo || 'Visita').replace(/^Visita Guiada:\s*/i, '')) : 'Visita';
        const cuerpo = abrirModal({ titulo: 'QR de llegada', subtitulo: 'El cliente lo escanea al llegar al inmueble.', cargando: 'Preparando el código de la visita…' });
        const r = await rpc('token_llegada_cita', { p_cita_id: String(id) });
        if (!r || r.error || !r.data) {
            const msg = r && r.error && r.error.message ? r.error.message : '';
            return mostrarError(cuerpo, /function|does not exist|schema cache|404/i.test(msg) || !msg ? FALTA_SQL : msg);
        }
        const url = `${origen()}/llegada?c=${encodeURIComponent(id)}&t=${encodeURIComponent(r.data)}`;
        await pintarQr(cuerpo, {
            url,
            cartel: { titulo: '¡Bienvenido! Escanea al llegar', linea1: titulo, linea2: `Te recibe ${asesorNombre()}` },
            archivo: nombreArchivo('llegada-' + titulo),
            compartirTexto: 'Cuando llegues a la visita, abre este enlace:',
            telefono: cita && cita.cliente_telefono,
            extraHtml: `<p class="mt-3 text-[11px] text-center text-gray-500">Al escanearlo, la visita queda marcada como realizada en tu agenda.</p>`
        });
    }

    window.QrMaximus = { inmueble, coleccion, invitarLead, llegadaCita, cerrar };
})();
