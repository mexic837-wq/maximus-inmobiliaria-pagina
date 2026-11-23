/**
 * MAXIMUS · Ventanas emergentes propias (reemplazan prompt / confirm / alert del navegador).
 *
 *   await MaxDialog.prompt({ titulo, mensaje, etiqueta, placeholder, valor, tipo, validar, aceptar })
 *        -> texto escrito, o null si cancela
 *   await MaxDialog.confirm({ titulo, mensaje, aceptar, cancelar, peligro })
 *        -> true / false
 *   await MaxDialog.alert({ titulo, mensaje, tono: 'ok' | 'error' | 'info' })
 *   await MaxDialog.copiar({ titulo, mensaje, texto })      -> muestra el texto con botón "Copiar"
 *
 * Sin dependencias: trae su propio CSS (claro y oscuro), funciona en cualquier página del sitio.
 * Teclado: Enter acepta, Esc cancela, Tab se queda dentro de la ventana.
 */
(function (root) {
    'use strict';
    if (!root.document) return;
    const doc = root.document;

    const CSS = `
    .mxd-fondo{position:fixed;inset:0;z-index:1000000;display:flex;align-items:center;justify-content:center;padding:16px;background:rgba(4,17,14,.62);-webkit-backdrop-filter:blur(6px);backdrop-filter:blur(6px);opacity:0;transition:opacity .18s ease}
    .mxd-fondo.mxd-visible{opacity:1}
    .mxd-caja{width:100%;max-width:420px;background:#fff;color:#0B4A3F;border-radius:26px;box-shadow:0 30px 80px -20px rgba(0,0,0,.45);border:1px solid rgba(15,23,42,.06);overflow:hidden;transform:translateY(14px) scale(.97);transition:transform .22s cubic-bezier(.2,.8,.2,1);font-family:inherit}
    .mxd-visible .mxd-caja{transform:none}
    .mxd-caja{display:flex;flex-direction:column;max-height:calc(100vh - 32px);max-height:calc(100dvh - 32px)}
    .mxd-cuerpo{padding:26px 26px 8px;overflow-y:auto;flex:1 1 auto;min-height:0}
    .mxd-acciones{flex:none}
    .mxd-icono{width:52px;height:52px;border-radius:18px;display:flex;align-items:center;justify-content:center;font-size:26px;margin-bottom:14px;background:#ecfdf5;color:#059669}
    .mxd-icono.mxd-peligro{background:#fff1f2;color:#e11d48}
    .mxd-icono.mxd-error{background:#fff1f2;color:#e11d48}
    .mxd-icono.mxd-info{background:#eff6ff;color:#2563eb}
    .mxd-titulo{margin:0;font-size:19px;line-height:1.25;font-weight:800;letter-spacing:-.01em;color:#0B4A3F}
    .mxd-mensaje{margin:8px 0 0;font-size:14px;line-height:1.5;color:#4b5563;white-space:pre-line}
    .mxd-etiqueta{display:block;margin:18px 0 6px;font-size:11px;font-weight:700;letter-spacing:.03em;text-transform:uppercase;color:#6b7280}
    .mxd-entrada{width:100%;box-sizing:border-box;padding:12px 14px;border-radius:14px;border:1.5px solid #e5e7eb;background:#f9fafb;color:#0B4A3F;font-size:15px;font-weight:600;outline:none;transition:border-color .15s,box-shadow .15s,background .15s;font-family:inherit}
    .mxd-entrada:focus{border-color:#10b981;background:#fff;box-shadow:0 0 0 4px rgba(16,185,129,.15)}
    .mxd-entrada.mxd-mala{border-color:#f43f5e;box-shadow:0 0 0 4px rgba(244,63,94,.12)}
    .mxd-entrada::placeholder{color:#9ca3af;font-weight:500}
    .mxd-error-txt{display:none;margin:7px 2px 0;font-size:12px;font-weight:600;color:#e11d48}
    .mxd-error-txt.mxd-ver{display:block}
    .mxd-acciones{display:flex;gap:10px;justify-content:flex-end;padding:20px 26px 24px}
    .mxd-btn{appearance:none;border:0;cursor:pointer;padding:12px 20px;border-radius:14px;font-size:14px;font-weight:700;font-family:inherit;transition:background .15s,transform .05s,box-shadow .15s}
    .mxd-btn:active{transform:scale(.98)}
    .mxd-btn:focus-visible{outline:3px solid rgba(16,185,129,.45);outline-offset:2px}
    .mxd-cancelar{background:transparent;color:#4b5563}
    .mxd-cancelar:hover{background:#f3f4f6}
    .mxd-aceptar{background:linear-gradient(135deg,#059669,#0f766e);color:#fff;box-shadow:0 8px 20px -8px rgba(5,150,105,.7)}
    .mxd-aceptar:hover{filter:brightness(1.07)}
    .mxd-aceptar.mxd-peligro{background:linear-gradient(135deg,#e11d48,#be123c);box-shadow:0 8px 20px -8px rgba(225,29,72,.7)}
    .mxd-copiar-fila{display:flex;gap:8px;align-items:flex-start;margin-top:16px}
    .mxd-copiar-fila .mxd-entrada{font-size:13px;font-family:ui-monospace,Menlo,Consolas,monospace}
    .mxd-copiar-btn{flex:none;padding:0 16px;border-radius:14px;border:1.5px solid #10b981;background:#ecfdf5;color:#047857;font-weight:700;font-size:13px;cursor:pointer;font-family:inherit}
    .mxd-copiar-btn:hover{background:#d1fae5}
    html.dark .mxd-caja{background:#0A1F1B;color:#e6f2ef;border-color:rgba(16,185,129,.18)}
    html.dark .mxd-titulo{color:#fff}
    html.dark .mxd-mensaje{color:#a9bdb7}
    html.dark .mxd-etiqueta{color:#8fa8a1}
    html.dark .mxd-entrada{background:#071714;border-color:rgba(6,78,59,.7);color:#fff}
    html.dark .mxd-entrada:focus{background:#0A1F1B}
    html.dark .mxd-icono{background:rgba(16,185,129,.14);color:#34d399}
    html.dark .mxd-icono.mxd-peligro,html.dark .mxd-icono.mxd-error{background:rgba(244,63,94,.14);color:#fb7185}
    html.dark .mxd-icono.mxd-info{background:rgba(59,130,246,.15);color:#60a5fa}
    html.dark .mxd-cancelar{color:#b6c9c3}
    html.dark .mxd-cancelar:hover{background:#0F2B26}
    html.dark .mxd-copiar-btn{background:#0E352C;color:#a7f3d0}
    @media (max-width:520px){.mxd-fondo{align-items:flex-end;padding:0}.mxd-caja{max-width:none;border-radius:26px 26px 0 0}.mxd-entrada{font-size:16px}.mxd-acciones{padding-bottom:calc(24px + env(safe-area-inset-bottom))}.mxd-btn{flex:1}}
    @media (prefers-reduced-motion:reduce){.mxd-fondo,.mxd-caja{transition:none}}
    `;

    let estiloPuesto = false;
    function ponerEstilo() {
        if (estiloPuesto) return;
        const s = doc.createElement('style');
        s.id = 'mxd-estilos';
        s.textContent = CSS;
        doc.head.appendChild(s);
        estiloPuesto = true;
    }

    const esc = (v) => String(v == null ? '' : v).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

    // Una ventana a la vez: las demás esperan su turno
    let cola = Promise.resolve();
    const enCola = (fn) => { const p = cola.then(fn, fn); cola = p.catch(() => {}); return p; };

    const ICONOS = { correo: 'ph-envelope-simple', enlace: 'ph-link', foto: 'ph-image', peligro: 'ph-trash', pregunta: 'ph-question', ok: 'ph-check-circle', error: 'ph-warning-circle', info: 'ph-info', copiar: 'ph-copy', llave: 'ph-key' };

    function abrir({ icono, tono, titulo, mensaje, campo, botones, copiar }) {
        ponerEstilo();
        return new Promise((resolver) => {
            const previo = doc.activeElement;
            const fondo = doc.createElement('div');
            fondo.className = 'mxd-fondo';
            const idT = 'mxd-t-' + Date.now();
            fondo.innerHTML = `
                <div class="mxd-caja" role="dialog" aria-modal="true" aria-labelledby="${idT}">
                    <div class="mxd-cuerpo">
                        <div class="mxd-icono ${tono ? 'mxd-' + tono : ''}"><i class="ph-fill ${esc(ICONOS[icono] || icono || 'ph-info')}"></i></div>
                        <h3 class="mxd-titulo" id="${idT}">${esc(titulo || '')}</h3>
                        ${mensaje ? `<p class="mxd-mensaje">${esc(mensaje)}</p>` : ''}
                        ${campo ? `
                            <label class="mxd-etiqueta" for="mxd-campo">${esc(campo.etiqueta || '')}</label>
                            <input id="mxd-campo" class="mxd-entrada" type="${esc(campo.tipo || 'text')}" placeholder="${esc(campo.placeholder || '')}" value="${esc(campo.valor || '')}" autocomplete="${campo.tipo === 'email' ? 'email' : 'off'}" inputmode="${campo.tipo === 'email' ? 'email' : campo.tipo === 'url' ? 'url' : 'text'}" spellcheck="false">
                            <p class="mxd-error-txt" id="mxd-error" role="alert"></p>` : ''}
                        ${copiar ? `
                            <div class="mxd-copiar-fila">
                                ${String(copiar).includes('\n') ? `<textarea id="mxd-copiar-txt" class="mxd-entrada" rows="7" readonly style="resize:none">${esc(copiar)}</textarea>` : `<input id="mxd-copiar-txt" class="mxd-entrada" type="text" readonly value="${esc(copiar)}">`}
                                <button type="button" class="mxd-copiar-btn" id="mxd-copiar-btn">Copiar</button>
                            </div>` : ''}
                    </div>
                    <div class="mxd-acciones">
                        ${botones.map((b, i) => `<button type="button" class="mxd-btn ${b.clase}" data-i="${i}">${esc(b.texto)}</button>`).join('')}
                    </div>
                </div>`;
            doc.body.appendChild(fondo);
            const caja = fondo.querySelector('.mxd-caja');
            const entrada = fondo.querySelector('#mxd-campo');
            const errorTxt = fondo.querySelector('#mxd-error');
            const bloqueado = doc.body.style.overflow;
            doc.body.style.overflow = 'hidden';
            requestAnimationFrame(() => fondo.classList.add('mxd-visible'));

            let cerrado = false;
            function cerrar(valor) {
                if (cerrado) return;
                cerrado = true;
                doc.removeEventListener('keydown', teclas, true);
                fondo.classList.remove('mxd-visible');
                doc.body.style.overflow = bloqueado;
                setTimeout(() => { fondo.remove(); try { previo && previo.focus && previo.focus({ preventScroll: true }); } catch (_) {} }, 180);
                resolver(valor);
            }
            function mostrarError(txt) {
                if (!entrada || !errorTxt) return;
                errorTxt.textContent = txt || '';
                errorTxt.classList.toggle('mxd-ver', !!txt);
                entrada.classList.toggle('mxd-mala', !!txt);
            }
            function aceptar(b) {
                if (campo) {
                    const valor = entrada.value.trim();
                    const msg = campo.validar ? campo.validar(valor) : null;
                    if (msg) { mostrarError(msg); entrada.focus(); return; }
                    return cerrar(valor);
                }
                cerrar(b.valor);
            }
            function teclas(e) {
                if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); return cerrar(botones[0].valorCancelar); }
                if (e.key === 'Enter' && !(e.target && e.target.tagName === 'BUTTON')) {
                    e.preventDefault(); e.stopPropagation();
                    return aceptar(botones[botones.length - 1]);
                }
                if (e.key === 'Tab') {
                    const foco = [...caja.querySelectorAll('input,button')].filter(x => !x.disabled && x.offsetParent !== null);
                    if (!foco.length) return;
                    const i = foco.indexOf(doc.activeElement);
                    if (e.shiftKey && (i <= 0)) { e.preventDefault(); foco[foco.length - 1].focus(); }
                    else if (!e.shiftKey && (i === foco.length - 1 || i === -1)) { e.preventDefault(); foco[0].focus(); }
                }
            }
            doc.addEventListener('keydown', teclas, true);
            fondo.addEventListener('mousedown', (e) => { if (e.target === fondo) cerrar(botones[0].valorCancelar); });
            if (entrada) entrada.addEventListener('input', () => mostrarError(''));
            fondo.querySelectorAll('.mxd-acciones .mxd-btn').forEach(el => {
                el.addEventListener('click', () => {
                    const b = botones[Number(el.getAttribute('data-i'))];
                    if (b.esCancelar) return cerrar(b.valorCancelar);
                    aceptar(b);
                });
            });
            const bc = fondo.querySelector('#mxd-copiar-btn');
            if (bc) bc.addEventListener('click', async () => {
                const txt = fondo.querySelector('#mxd-copiar-txt');
                try { await navigator.clipboard.writeText(txt.value); }
                catch (_) { txt.select(); try { doc.execCommand('copy'); } catch (__) {} }
                bc.textContent = '¡Copiado!';
                setTimeout(() => { bc.textContent = 'Copiar'; }, 1600);
            });
            setTimeout(() => {
                const foco = entrada || fondo.querySelector('.mxd-aceptar') || fondo.querySelector('.mxd-btn');
                if (foco) { foco.focus({ preventScroll: true }); if (entrada && entrada.value) entrada.select(); }
            }, 60);
        });
    }

    const VALIDAR_CORREO = (v) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v) ? null : 'Escribe un correo válido, por ejemplo nombre@correo.com';
    const VALIDAR_URL = (v) => /^https?:\/\/\S+\.\S+/i.test(v) ? null : 'Escribe una dirección completa que empiece por https://';

    const MaxDialog = {
        prompt(o) {
            o = o || {};
            const tipo = o.tipo || 'text';
            const validar = o.validar || (tipo === 'email' ? VALIDAR_CORREO : tipo === 'url' ? VALIDAR_URL : null);
            const obligatorio = o.obligatorio !== false;
            return enCola(() => abrir({
                icono: o.icono || (o.peligro ? 'peligro' : tipo === 'email' ? 'correo' : tipo === 'url' ? 'enlace' : 'pregunta'), tono: o.peligro ? 'peligro' : '',
                titulo: o.titulo, mensaje: o.mensaje,
                campo: { etiqueta: o.etiqueta, tipo, placeholder: o.placeholder, valor: o.valor,
                    validar: (v) => (!v && obligatorio) ? 'Este dato es necesario para continuar.' : (v && validar ? validar(v) : null) },
                botones: [
                    { texto: o.cancelar || 'Cancelar', clase: 'mxd-cancelar', esCancelar: true, valorCancelar: null },
                    { texto: o.aceptar || 'Continuar', clase: 'mxd-aceptar' + (o.peligro ? ' mxd-peligro' : '') }
                ]
            }));
        },
        confirm(o) {
            o = o || {};
            return enCola(() => abrir({
                icono: o.icono || (o.peligro ? 'peligro' : 'pregunta'), tono: o.peligro ? 'peligro' : '',
                titulo: o.titulo || '¿Continuar?', mensaje: o.mensaje,
                botones: [
                    { texto: o.cancelar || 'Cancelar', clase: 'mxd-cancelar', esCancelar: true, valorCancelar: false },
                    { texto: o.aceptar || 'Aceptar', clase: 'mxd-aceptar' + (o.peligro ? ' mxd-peligro' : ''), valor: true }
                ]
            }));
        },
        alert(o) {
            o = typeof o === 'string' ? { mensaje: o } : (o || {});
            const tono = o.tono || 'info';
            return enCola(() => abrir({
                icono: o.icono || (tono === 'ok' ? 'ok' : tono === 'error' ? 'error' : 'info'), tono: tono === 'ok' ? '' : tono,
                titulo: o.titulo || (tono === 'error' ? 'Algo no salió bien' : tono === 'ok' ? 'Listo' : 'Aviso'), mensaje: o.mensaje,
                botones: [{ texto: o.aceptar || 'Entendido', clase: 'mxd-aceptar' + (tono === 'error' ? ' mxd-peligro' : ''), valor: true, valorCancelar: undefined }]
            }).then(() => undefined));
        },
        copiar(o) {
            o = o || {};
            return enCola(() => abrir({
                icono: 'copiar', titulo: o.titulo || 'Copia el enlace', mensaje: o.mensaje, copiar: o.texto || '',
                botones: [{ texto: o.aceptar || 'Listo', clase: 'mxd-aceptar', valor: true }]
            }).then(() => undefined));
        }
    };

    root.MaxDialog = MaxDialog;
})(typeof window !== 'undefined' ? window : globalThis);
