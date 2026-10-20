/**
 * ============================================
 * MAXIMUS - Capa de Servicios de Datos
 * ============================================
 * 
 * ARQUITECTURA:
 * Cada servicio (InmuebleService, LeadService, etc.) expone
 * métodos CRUD estándar. Internamente, cada método decide
 * si usar datos MOCK o llamar a Supabase según APP_CONFIG.
 * 
 * Esto significa que tus páginas HTML NUNCA hablan directamente
 * con Supabase ni con datos mock. Solo llaman a estos servicios.
 * 
 * Ejemplo de uso en el dashboard:
 *   const propiedades = await InmuebleService.getAll();
 *   const lead = await LeadService.create({ nombre: '...', ... });
 */

// ============================================
// SERVICIO DE INMUEBLES
// ============================================
const InmuebleService = {

    async getAll(filtros = {}) {
        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
                if (sb) {
                    let query = sb.from(APP_CONFIG.TABLES.INMUEBLES).select('*');
                    if (filtros.operacion && filtros.operacion !== 'todos') query = query.eq('operacion', filtros.operacion);
                    if (filtros.estatus) query = query.eq('estatus', filtros.estatus);
                    if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
                    if (filtros.is_maximus !== undefined) {
                        try {
                            query = query.or(`is_maximus.eq.${filtros.is_maximus},en_oferta.eq.${filtros.is_maximus}`);
                        } catch(e) {}
                    }
                    if (filtros.busqueda) query = query.ilike('titulo', `%${filtros.busqueda}%`);
                    query = query.order('created_at', { ascending: false });
                    const res = await query;
                    if (res && !res.error && Array.isArray(res.data) && res.data.length > 0) {
                        return res;
                    }
                    if (res && res.error) {
                        console.warn('⚠️ MAXIMUS InmuebleService: Supabase devolvió error o no está autorizado. Usando respaldo de datos locales:', res.error);
                    }
                }
            } catch (err) {
                console.warn('⚠️ MAXIMUS InmuebleService: Excepción al conectar con Supabase. Usando respaldo de datos locales:', err);
            }
        }

        // ---- RESPALDO LOCAL / MOCK DATA ----
        let data = (typeof MOCK_DATA !== 'undefined' && Array.isArray(MOCK_DATA.inmuebles)) ? [...MOCK_DATA.inmuebles] : [];
        if (filtros.operacion && filtros.operacion !== 'todos') data = data.filter(i => i.operacion === filtros.operacion);
        if (filtros.estatus) data = data.filter(i => i.estatus === filtros.estatus);
        if (filtros.tipo) data = data.filter(i => i.tipo === filtros.tipo);
        if (filtros.is_maximus !== undefined) {
            data = data.filter(i => Boolean(i.is_maximus || i.en_oferta || (i.comision_porcentaje && i.comision_porcentaje >= 5)) === Boolean(filtros.is_maximus));
        }
        if (filtros.busqueda) {
            const q = filtros.busqueda.toLowerCase();
            data = data.filter(i => 
                (i.titulo && i.titulo.toLowerCase().includes(q)) || 
                (i.ubicacion && i.ubicacion.toLowerCase().includes(q))
            );
        }
        return { data, error: null };
    },

    async getById(id) {
        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
                if (sb) {
                    const res = await sb.from(APP_CONFIG.TABLES.INMUEBLES).select('*').eq('id', id).single();
                    if (res && !res.error && res.data) {
                        return res;
                    }
                }
            } catch (err) {
                console.warn('InmuebleService.getById: Excepción Supabase, usando respaldo local:', err);
            }
        }
        const item = (typeof MOCK_DATA !== 'undefined' && Array.isArray(MOCK_DATA.inmuebles)) 
            ? MOCK_DATA.inmuebles.find(i => i.id === id || i.id === 'inm-' + id || (id && id.endsWith(i.id)))
            : null;
        return { data: item || null, error: item ? null : 'No encontrado' };
    },

    async create(inmuebleData) {
        let res;
        if (APP_CONFIG.USE_MOCK_DATA) {
            const nuevo = { id: 'inm-' + Date.now(), ...inmuebleData, created_at: new Date().toISOString() };
            MOCK_DATA.inmuebles.unshift(nuevo);
            console.log('🟡 MOCK: Inmueble creado', nuevo);
            res = { data: nuevo, error: null };
        } else {
            try {
                const sb = getSupabase();
                res = await sb.from(APP_CONFIG.TABLES.INMUEBLES).insert(inmuebleData).select().single();
            } catch (err) {
                const nuevo = { id: 'inm-' + Date.now(), ...inmuebleData, created_at: new Date().toISOString() };
                res = { data: nuevo, error: null };
            }
        }

        if (typeof N8nService !== 'undefined' && res && res.data) {
            N8nService.notificarNuevoInmueble(res.data).catch(() => {});
        }
        return res;
    },

    async update(id, updates) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const idx = MOCK_DATA.inmuebles.findIndex(i => i.id === id);
            if (idx !== -1) {
                MOCK_DATA.inmuebles[idx] = { ...MOCK_DATA.inmuebles[idx], ...updates };
                return { data: MOCK_DATA.inmuebles[idx], error: null };
            }
            return { data: null, error: 'No encontrado' };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.INMUEBLES).update(updates).eq('id', id).select().single();
    },

    async delete(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            MOCK_DATA.inmuebles = MOCK_DATA.inmuebles.filter(i => i.id !== id);
            return { error: null };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.INMUEBLES).delete().eq('id', id);
    },
};


// ============================================
// SERVICIO DE LEADS (CLIENTES & CRM ASESORES)
// ============================================
const LeadService = {

    _getStoredLeads() {
        try {
            const raw = localStorage.getItem('maximus_crm_leads');
            if (raw) {
                const parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    if (typeof MOCK_DATA !== 'undefined') MOCK_DATA.leads = parsed;
                    return parsed;
                }
            }
        } catch (_) {}

        const defaultLeads = (typeof MOCK_DATA !== 'undefined' && Array.isArray(MOCK_DATA.leads))
            ? [...MOCK_DATA.leads]
            : [];
        this._saveStoredLeads(defaultLeads);
        return defaultLeads;
    },

    _saveStoredLeads(leads) {
        try {
            localStorage.setItem('maximus_crm_leads', JSON.stringify(leads));
        } catch (_) {}
        if (typeof MOCK_DATA !== 'undefined') {
            MOCK_DATA.leads = leads;
        }
    },

    async getAll(filtros = {}) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let data = this._getStoredLeads();
            if (filtros.estatus && filtros.estatus !== 'todos') {
                data = data.filter(l => l.estatus === filtros.estatus);
            }
            if (filtros.origen && filtros.origen !== 'todos') {
                data = data.filter(l => l.origen === filtros.origen);
            }
            if (filtros.asesor_id && filtros.asesor_id !== 'todos') {
                data = data.filter(l => l.asesor_id === filtros.asesor_id);
            }
            if (filtros.temperatura && filtros.temperatura !== 'todos') {
                data = data.filter(l => l.temperatura === filtros.temperatura);
            }
            if (filtros.busqueda) {
                const q = filtros.busqueda.toLowerCase().trim();
                data = data.filter(l =>
                    (l.nombre && l.nombre.toLowerCase().includes(q)) ||
                    (l.email && l.email.toLowerCase().includes(q)) ||
                    (l.telefono && l.telefono.toLowerCase().includes(q)) ||
                    (l.inmueble_interes_titulo && l.inmueble_interes_titulo.toLowerCase().includes(q))
                );
            }
            return { data, error: null };
        }
        const sb = getSupabase();
        let query = sb.from(APP_CONFIG.TABLES.LEADS).select('*');
        if (filtros.estatus && filtros.estatus !== 'todos') query = query.eq('estatus', filtros.estatus);
        if (filtros.origen && filtros.origen !== 'todos') query = query.eq('origen', filtros.origen);
        if (filtros.asesor_id && filtros.asesor_id !== 'todos') query = query.eq('asesor_id', filtros.asesor_id);
        if (filtros.temperatura && filtros.temperatura !== 'todos') query = query.eq('temperatura', filtros.temperatura);
        query = query.order('created_at', { ascending: false });
        return await query;
    },

    async getById(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const leads = this._getStoredLeads();
            const lead = leads.find(l => l.id === id);
            return { data: lead || null, error: lead ? null : 'Cliente no encontrado' };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.LEADS).select('*').eq('id', id).single();
    },

    async getByAsesor(asesorId) {
        return this.getAll({ asesor_id: asesorId });
    },

    async create(leadData) {
        let res;
        const nuevo = {
            id: leadData.id || ('lead-' + Date.now()),
            nombre: leadData.nombre || 'Nuevo Cliente',
            email: leadData.email || '',
            telefono: leadData.telefono || '',
            temperatura: leadData.temperatura || 'caliente',
            operacion: leadData.operacion || 'compra',
            tipo_inmueble: leadData.tipo_inmueble || 'casa',
            presupuesto: leadData.presupuesto ? Number(leadData.presupuesto) : 0,
            presupuesto_min: leadData.presupuesto_min ? Number(leadData.presupuesto_min) : 0,
            presupuesto_max: leadData.presupuesto_max ? Number(leadData.presupuesto_max) : (leadData.presupuesto ? Number(leadData.presupuesto) : 0),
            moneda: leadData.moneda || 'USD',
            zonas_interes: Array.isArray(leadData.zonas_interes) ? leadData.zonas_interes : (leadData.zonas_interes ? [leadData.zonas_interes] : []),
            requisitos: leadData.requisitos || '',
            inmueble_interes_id: leadData.inmueble_interes_id || '',
            inmueble_interes_titulo: leadData.inmueble_interes_titulo || '',
            inmueble_interes_precio: leadData.inmueble_interes_precio ? Number(leadData.inmueble_interes_precio) : 0,
            origen: leadData.origen || 'web',
            estatus: leadData.estatus || 'nuevo',
            asesor_id: leadData.asesor_id || 'asesor-1',
            asesor_nombre: leadData.asesor_nombre || 'Asesor MAXIMUS',
            notas: leadData.notas || '',
            actividades: leadData.actividades || [
                {
                    id: 'act-' + Date.now(),
                    tipo: 'nota',
                    titulo: 'Cliente Registrado en CRM',
                    descripcion: leadData.notas || 'Cliente ingresado a la cartera comercial.',
                    fecha: new Date().toISOString(),
                    autor: leadData.asesor_nombre || 'Asesor MAXIMUS'
                }
            ],
            created_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
            ...leadData
        };

        if (APP_CONFIG.USE_MOCK_DATA) {
            const leads = this._getStoredLeads();
            leads.unshift(nuevo);
            this._saveStoredLeads(leads);
            res = { data: nuevo, error: null };
        } else {
            try {
                const sb = getSupabase();
                res = await sb.from(APP_CONFIG.TABLES.LEADS).insert(leadData).select().single();
                if (res && res.error) {
                    res = { data: nuevo, error: null };
                }
            } catch (err) {
                res = { data: nuevo, error: null };
            }
        }

        if (typeof N8nService !== 'undefined' && res && res.data && !leadData._skipN8nLead) {
            N8nService.notificarNuevoLead(res.data).catch(() => {});
        }
        return res;
    },

    async updateEstatus(id, nuevoEstatus) {
        let res;
        const nombreEtapas = {
            'nuevo': 'Prospección / Nuevo',
            'contactado': 'Contactado / Calificación',
            'visita_agendada': 'Búsqueda / Visita Agendada',
            'en_negociacion': 'En Negociación / Propuesta',
            'en_tramite': 'En Trámite / Notaría',
            'cerrado': 'Cerrado / Ganado'
        };

        if (APP_CONFIG.USE_MOCK_DATA) {
            const leads = this._getStoredLeads();
            const lead = leads.find(l => l.id === id);
            if (lead) {
                lead.estatus = nuevoEstatus;
                lead.updated_at = new Date().toISOString();
                if (!Array.isArray(lead.actividades)) lead.actividades = [];
                lead.actividades.unshift({
                    id: 'act-' + Date.now(),
                    tipo: 'nota',
                    titulo: 'Fase de Pipeline Actualizada',
                    descripcion: `El cliente avanzó a la etapa: "${nombreEtapas[nuevoEstatus] || nuevoEstatus}".`,
                    fecha: new Date().toISOString(),
                    autor: lead.asesor_nombre || 'Asesor CRM'
                });
                this._saveStoredLeads(leads);
            }
            res = { data: lead || { id, estatus: nuevoEstatus }, error: null };
        } else {
            try {
                const sb = getSupabase();
                res = await sb.from(APP_CONFIG.TABLES.LEADS).update({ estatus: nuevoEstatus, updated_at: new Date().toISOString() }).eq('id', id).select().single();
            } catch (err) {
                res = { data: { id, estatus: nuevoEstatus }, error: null };
            }
        }

        if (typeof N8nService !== 'undefined') {
            const leadInfo = (res && res.data) ? res.data : { id, estatus: nuevoEstatus };
            N8nService.notificarAgente(
                leadInfo.asesor_id || 'admin',
                `Pipeline CRM: ${leadInfo.nombre || id}`,
                `El cliente ${leadInfo.nombre || id} (${leadInfo.email || 'sin correo'}) avanzó a "${nombreEtapas[nuevoEstatus] || nuevoEstatus}".`
            ).catch(() => {});
        }
        return res;
    },

    async updateDetalles(id, updates) {
        let res;
        if (APP_CONFIG.USE_MOCK_DATA) {
            const leads = this._getStoredLeads();
            const idx = leads.findIndex(l => l.id === id);
            if (idx !== -1) {
                leads[idx] = {
                    ...leads[idx],
                    ...updates,
                    updated_at: new Date().toISOString()
                };
                this._saveStoredLeads(leads);
                res = { data: leads[idx], error: null };
            } else {
                res = { data: null, error: 'Cliente no encontrado' };
            }
        } else {
            try {
                const sb = getSupabase();
                res = await sb.from(APP_CONFIG.TABLES.LEADS).update({ ...updates, updated_at: new Date().toISOString() }).eq('id', id).select().single();
            } catch (err) {
                res = { data: { id, ...updates }, error: null };
            }
        }
        return res;
    },

    async addActividad(leadId, actividad) {
        const itemActividad = {
            id: actividad.id || ('act-' + Date.now()),
            tipo: actividad.tipo || 'nota',
            titulo: actividad.titulo || 'Nota en Bitácora',
            descripcion: actividad.descripcion || actividad.texto || '',
            fecha: actividad.fecha || new Date().toISOString(),
            autor: actividad.autor || 'Asesor CRM'
        };

        if (APP_CONFIG.USE_MOCK_DATA) {
            const leads = this._getStoredLeads();
            const lead = leads.find(l => l.id === leadId);
            if (lead) {
                if (!Array.isArray(lead.actividades)) lead.actividades = [];
                lead.actividades.unshift(itemActividad);
                lead.updated_at = new Date().toISOString();
                this._saveStoredLeads(leads);
                return { data: itemActividad, lead, error: null };
            }
            return { data: null, error: 'Cliente no encontrado' };
        }

        return { data: itemActividad, error: null };
    },

    async delete(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let leads = this._getStoredLeads();
            leads = leads.filter(l => l.id !== id);
            this._saveStoredLeads(leads);
            return { error: null };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.LEADS).delete().eq('id', id);
    },
};


// ============================================
// SERVICIO DE CITAS / AGENDA
// ============================================
const CitaService = {

    async getAll(filtros = {}) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let data = [...MOCK_DATA.citas];
            if (filtros.fecha) data = data.filter(c => c.fecha === filtros.fecha);
            return { data, error: null };
        }
        const sb = getSupabase();
        let query = sb.from(APP_CONFIG.TABLES.CITAS).select('*');
        if (filtros.fecha) query = query.eq('fecha', filtros.fecha);
        query = query.order('hora', { ascending: true });
        return await query;
    },

    async create(citaData) {
        let res;
        if (APP_CONFIG.USE_MOCK_DATA) {
            const nueva = { id: 'cita-' + Date.now(), ...citaData };
            if (typeof MOCK_DATA !== 'undefined' && Array.isArray(MOCK_DATA.citas)) {
                MOCK_DATA.citas.push(nueva);
            }
            res = { data: nueva, error: null };
        } else {
            try {
                const sb = getSupabase();
                res = await sb.from(APP_CONFIG.TABLES.CITAS).insert(citaData).select().single();
                if (res && res.error) {
                    res = { data: { id: 'cita-' + Date.now(), ...citaData }, error: null };
                }
            } catch (err) {
                res = { data: { id: 'cita-' + Date.now(), ...citaData }, error: null };
            }
        }

        if (typeof N8nService !== 'undefined' && res && res.data) {
            N8nService.notificarNuevaCita(res.data).catch(() => {});
        }
        return res;
    },

    async delete(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            MOCK_DATA.citas = MOCK_DATA.citas.filter(c => c.id !== id);
            return { error: null };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.CITAS).delete().eq('id', id);
    },
};


// ============================================
// SERVICIO DE PAGOS
// ============================================
const PagoService = {

    async getAll() {
        if (APP_CONFIG.USE_MOCK_DATA) {
            return { data: [...MOCK_DATA.pagos], error: null };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.PAGOS).select('*').order('fecha', { ascending: false });
    },
};


// ============================================
// SERVICIO DE DOCUMENTOS
// ============================================
const DocumentoService = {

    async getAll() {
        if (APP_CONFIG.USE_MOCK_DATA) {
            return { data: [...MOCK_DATA.documentos], error: null };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.DOCUMENTOS).select('*').order('updated_at', { ascending: false });
    },
};


// ============================================
// SERVICIO DE MÉTRICAS (KPIs)
// ============================================
const MetricaService = {

    async getResumen() {
        if (APP_CONFIG.USE_MOCK_DATA) {
            return { data: { ...MOCK_DATA.metricas }, error: null };
        }
        // En producción, esto podría ser una vista SQL de Supabase
        // o un endpoint de n8n que calcula las métricas
        const sb = getSupabase();
        const url = APP_CONFIG.N8N_BASE_URL + APP_CONFIG.N8N_WEBHOOKS.GENERAR_REPORTE;
        const res = await fetch(url);
        return await res.json();
    },
};


// ============================================
// SERVICIO DE VENDIDOS GLOBAL (Histórico)
// ============================================
const VendidoGlobalService = {

    async getAll(filtros = {}) {
        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
                if (sb) {
                    const tableName = APP_CONFIG.TABLES.CIERRES_VENTAS || 'cierres_ventas';
                    let query = sb.from(tableName).select('*').order('fecha_cierre', { ascending: false });
                    
                    if (filtros.operacion && filtros.operacion !== 'todos') {
                        query = query.eq('tipo_operacion', filtros.operacion);
                    }
                    if (filtros.busqueda) {
                        query = query.or(`inmueble_titulo.ilike.%${filtros.busqueda}%,ubicacion.ilike.%${filtros.busqueda}%`);
                    }

                    const res = await query;
                    if (res && !res.error && Array.isArray(res.data) && res.data.length > 0) {
                        return { data: res.data, error: null, source: 'supabase' };
                    }
                    if (res && res.error) {
                        console.warn('⚠️ MAXIMUS VendidoGlobalService: Supabase aviso. Usando respaldo:', res.error);
                    }
                }
            } catch (err) {
                console.warn('⚠️ MAXIMUS VendidoGlobalService: Excepción al conectar con Supabase:', err);
            }
        }

        // Respaldo local de cierres
        const cierres = (typeof window !== 'undefined' && window.MOCK_DATA && window.MOCK_DATA.cierres_ventas)
            ? [...window.MOCK_DATA.cierres_ventas]
            : ((typeof MOCK_DATA !== 'undefined' && MOCK_DATA.cierres_ventas) ? [...MOCK_DATA.cierres_ventas] : []);

        let data = cierres;
        if (filtros.operacion && filtros.operacion !== 'todos') {
            data = data.filter(v => v.tipo_operacion === filtros.operacion || v.operacion_cerrada === filtros.operacion);
        }
        if (filtros.busqueda) {
            const q = filtros.busqueda.toLowerCase();
            data = data.filter(v => 
                (v.inmueble_titulo && v.inmueble_titulo.toLowerCase().includes(q)) ||
                (v.ubicacion && v.ubicacion.toLowerCase().includes(q))
            );
        }
        return { data, error: null, source: 'mock' };
    },
};


// ============================================
// SERVICIO DE N8N (Webhooks / Automatizaciones)
// ============================================
const N8nService = {

    /**
     * Dispara un webhook de n8n con payload enriquecido estándar.
     * @param {string} webhookKey - Clave del webhook en APP_CONFIG.N8N_WEBHOOKS
     * @param {object} payload - Datos a enviar
     */
    async trigger(webhookKey, payload = {}) {
        const webhookPath = (APP_CONFIG && APP_CONFIG.N8N_WEBHOOKS) ? APP_CONFIG.N8N_WEBHOOKS[webhookKey] : null;
        if (!webhookPath) {
            console.warn(`⚠️ Webhook "${webhookKey}" no está definido en APP_CONFIG.N8N_WEBHOOKS.`);
            return { success: false, error: 'Webhook no definido.' };
        }

        const enrichedPayload = {
            ...payload,
            evento: payload.evento || webhookKey,
            source: 'maximus_crm',
            email_empresa: (APP_CONFIG && APP_CONFIG.COMPANY_NOTIFY_EMAIL) || 'contacto@maximusinmobiliaria.com',
            timestamp: payload.timestamp || new Date().toISOString(),
        };

        if (APP_CONFIG.USE_MOCK_DATA && !APP_CONFIG.ENABLE_N8N_WEBHOOKS) {
            console.log(`🟡 MOCK N8N: Webhook "${webhookKey}" disparado con:`, enrichedPayload);
            return { success: true, mock: true, payload: enrichedPayload };
        }

        const url = (APP_CONFIG.N8N_BASE_URL || 'https://n8n.maximusinmobiliaria.tech') + webhookPath;

        if (APP_CONFIG.ENABLE_N8N_WEBHOOKS) {
            console.log(`🚀 [N8N Webhook] Enviando evento "${webhookKey}" a: ${url}`, enrichedPayload);
            try {
                const response = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(enrichedPayload),
                });
                let data = null;
                try {
                    data = await response.json();
                } catch (_) {
                    data = { status: response.status };
                }
                console.log(`🟢 [N8N Webhook] "${webhookKey}" procesado exitosamente (${response.status}):`, data);
                return { success: response.ok, data, payload: enrichedPayload };
            } catch (err) {
                console.error(`⚠️ [N8N Webhook] Error al conectar con ${url}:`, err);
                return { success: false, queued: false, payload: enrichedPayload, warning: err.message };
            }
        }

        return { success: true, mock: true, payload: enrichedPayload };
    },

    /**
     * Atajos / Wrappers para todos los webhooks de MAXIMUS
     */
    async notificarNuevoLead(data = {}) {
        return this.trigger('NUEVO_LEAD', {
            evento: 'NUEVO_LEAD',
            nombre: data.nombre || 'Cliente Interesado',
            email: data.email || '',
            telefono: data.telefono || '',
            mensaje: data.mensaje || data.notas || 'Solicita información sobre propiedad del catálogo MAXIMUS.',
            origen: data.origen || 'web',
            inmueble_codigo: data.inmueble_codigo || data.codigo || 'MAX-CAT',
            inmueble_titulo: data.inmueble_titulo || data.titulo || 'Propiedad Exclusiva MAXIMUS',
            inmueble_precio: data.inmueble_precio || data.precio || 'Consultar',
            inmueble_ubicacion: data.inmueble_ubicacion || data.ubicacion || 'San Cristóbal, Táchira',
            asesor_nombre: data.asesor_nombre || 'Equipo Comercial MAXIMUS',
            asesor_email: data.asesor_email || (APP_CONFIG && APP_CONFIG.COMPANY_NOTIFY_EMAIL) || 'contacto@maximusinmobiliaria.com',
            ...data
        });
    },

    async enviarValoracionLead(data = {}) {
        return this.trigger('VALORACION_LEAD', {
            evento: 'VALORACION_LEAD',
            direccion: data.direccion || '',
            email: data.email || '',
            lead_id: data.lead_id || ('lead-' + Date.now()),
            fecha: data.fecha || new Date().toISOString(),
            origen: data.origen || 'landing_lead_magnet',
            ...data
        });
    },

    async contactarWhatsApp(telefono, mensaje, extra = {}) {
        return this.trigger('CONTACTAR_WHATSAPP', {
            evento: 'CONTACTAR_WHATSAPP',
            telefono,
            mensaje,
            ...extra
        });
    },

    async notificarNuevoInmueble(data = {}) {
        return this.trigger('NUEVO_INMUEBLE', {
            evento: 'NUEVO_INMUEBLE',
            codigo: data.codigo || data.id || '#MAX-NEW',
            titulo: data.titulo || 'Nueva Propiedad Captada',
            tipo: data.tipo || 'Inmueble',
            operacion: data.operacion || 'Venta',
            precio: data.precio || '$0',
            comision: data.comision || '5%',
            ubicacion: data.ubicacion || 'San Cristóbal, Táchira',
            habitaciones: data.habitaciones || 0,
            banos: data.banos || 0,
            m2: data.m2 || data.metros_cuadrados || '0 m²',
            asesor_nombre: data.asesor_nombre || data.asesor?.nombre || 'Asesor MAXIMUS',
            asesor_email: data.asesor_email || data.asesor?.email || (APP_CONFIG && APP_CONFIG.COMPANY_NOTIFY_EMAIL) || 'contacto@maximusinmobiliaria.com',
            ...data
        });
    },

    async notificarCierreVenta(data = {}) {
        return this.trigger('CIERRE_REGISTRADO', {
            evento: 'CIERRE_REGISTRADO',
            cierre_id: data.id || ('cierre-' + Date.now()),
            fecha_cierre: data.fecha_cierre || new Date().toISOString().split('T')[0],
            inmueble_id: data.inmueble_id || '',
            inmueble_titulo: data.inmueble_titulo || 'Inmueble Cerrado',
            ubicacion: data.ubicacion || 'San Cristóbal, Táchira',
            tipo_operacion: data.tipo_operacion || 'venta',
            precio_final: data.precio_final || 0,
            moneda: data.moneda || 'USD',
            comision_bruta_porcentaje: data.comision_bruta_porcentaje || 5,
            comision_bruta_monto: data.comision_bruta_monto || 0,
            asesor_porcentaje_neto: data.asesor_porcentaje_neto || 70,
            comision_neta_asesor: data.comision_neta_asesor || 0,
            comision_oficina_monto: data.comision_oficina_monto || 0,
            estatus_comision: data.estatus_comision || 'liquidada',
            asesor_id: data.asesor_id || '',
            asesor_nombre: data.asesor_nombre || 'Asesor MAXIMUS',
            asesor_email: data.asesor_email || (APP_CONFIG && APP_CONFIG.COMPANY_NOTIFY_EMAIL) || 'contacto@maximusinmobiliaria.com',
            comprador_nombre: data.comprador_nombre || data.cliente_comprador || 'Cliente Comprador',
            vendedor_nombre: data.vendedor_nombre || data.cliente_vendedor || 'Cliente Propietario',
            metodo_pago: data.metodo_pago || 'Transferencia',
            referencia_pago: data.referencia_pago || '',
            notas: data.notas || '',
            ...data
        });
    },

    async enviarDossierVip(data = {}) {
        return this.trigger('ENVIAR_DOSSIER_VIP', {
            evento: 'ENVIAR_DOSSIER_VIP',
            coleccion_id: data.id || ('col-' + Date.now()),
            cliente: data.cliente || 'Cliente VIP',
            cliente_email: data.cliente_email || data.email || '',
            telefono: data.telefono || '',
            titulo: data.titulo || 'Portafolio Exclusivo MAXIMUS',
            nota: data.nota || '',
            asesor: data.asesor || 'Asesor MAXIMUS',
            asesor_email: data.asesor_email || (APP_CONFIG && APP_CONFIG.COMPANY_NOTIFY_EMAIL) || 'contacto@maximusinmobiliaria.com',
            inmuebles: data.inmuebles_detalle || data.inmuebles || [],
            cantidad_inmuebles: Array.isArray(data.inmuebles) ? data.inmuebles.length : 0,
            ...data
        });
    },

    async enviarFichaVipCorreo(data = {}) {
        return this.trigger('ENVIAR_FICHA_VIP', {
            evento: 'ENVIAR_FICHA_VIP',
            cliente_email: data.cliente_email || data.email || '',
            cliente_nombre: data.cliente_nombre || 'Cliente Exclusivo',
            nota_personalizada: data.nota_personalizada || data.nota || '',
            codigo: data.codigo || '#MAX',
            titulo: data.titulo || 'Propiedad Exclusiva MAXIMUS',
            operacion: data.operacion || 'VENTA',
            precio: data.precio || '$0',
            ubicacion: data.ubicacion || 'San Cristóbal, Táchira',
            habitaciones: data.habitaciones || 0,
            banos: data.banos || 0,
            m2: data.m2 || '0 m²',
            foto: data.foto || '',
            asesor_nombre: data.asesor_nombre || 'Asesor MAXIMUS',
            asesor_telefono: data.asesor_telefono || '',
            asesor_email: data.asesor_email || (APP_CONFIG && APP_CONFIG.COMPANY_NOTIFY_EMAIL) || 'contacto@maximusinmobiliaria.com',
            ...data
        });
    },

    async notificarNuevaCita(data = {}) {
        return this.trigger('NUEVA_CITA', {
            evento: 'NUEVA_CITA',
            cita_id: data.id || ('cita-' + Date.now()),
            cliente_nombre: data.cliente_nombre || data.cliente || 'Cliente',
            cliente_email: data.cliente_email || data.email || '',
            cliente_telefono: data.cliente_telefono || data.telefono || '',
            inmueble_titulo: data.inmueble_titulo || data.propiedad || 'Inmueble MAXIMUS',
            ubicacion: data.ubicacion || 'San Cristóbal, Táchira',
            fecha: data.fecha || new Date().toISOString().split('T')[0],
            hora: data.hora || '10:00 AM',
            asesor_nombre: data.asesor_nombre || data.asesor || 'Asesor MAXIMUS',
            asesor_email: data.asesor_email || (APP_CONFIG && APP_CONFIG.COMPANY_NOTIFY_EMAIL) || 'contacto@maximusinmobiliaria.com',
            notas: data.notas || '',
            ...data
        });
    },

    async enviarBienvenidaAsesor(data = {}) {
        return this.trigger('BIENVENIDA_ASESOR', {
            evento: 'BIENVENIDA_ASESOR',
            asesor_id: data.id || ('asesor-' + Date.now()),
            nombre: data.nombre || 'Nuevo Asesor',
            email: data.email || '',
            telefono: data.telefono || '',
            cargo: data.cargo || 'Asesor Inmobiliario',
            especialidad: data.especialidad || 'Propiedades Exclusivas',
            tipo_cuenta: data.tipo_cuenta || 'maximus',
            split_comision: data.split_comision || (data.tipo_cuenta === 'externo' ? '50%' : '70%'),
            password_temporal: data.password_temporal || 'maximus123',
            url_portal: (typeof window !== 'undefined' ? window.location.origin : 'https://maximusinmobiliaria.com') + '/login',
            ...data
        });
    },

    async solicitarRecuperacionPassword(data = {}) {
        return this.trigger('AUTH_RECUPERAR_PASSWORD', {
            evento: 'AUTH_RECUPERAR_PASSWORD',
            email: data.email || '',
            fecha: data.fecha || new Date().toISOString(),
            ip: data.ip || 'Sesión Web MAXIMUS',
            dispositivo: (typeof navigator !== 'undefined' ? navigator.userAgent : 'Navegador Web'),
            token_recuperacion: data.token_recuperacion || ('REC-' + Math.floor(100000 + Math.random() * 900000)),
            ...data
        });
    },

    async notificarAgente(agenteId, titulo, mensaje, extra = {}) {
        return this.trigger('NOTIFICACION_AGENTE', {
            evento: 'NOTIFICACION_AGENTE',
            agente_id: agenteId,
            titulo,
            mensaje,
            ...extra
        });
    },
};


// ============================================
// SERVICIO DE STORAGE (Subida de Imágenes)
// ============================================
const StorageService = {

    /**
     * Sube una imagen al bucket de Supabase Storage.
     * @param {File} file - Archivo desde un input[type=file]
     * @param {string} folder - Carpeta destino (ej: 'inmuebles/inm-001')
     * @returns {Promise<{url: string|null, error: string|null}>}
     */
    async uploadImage(file, folder = 'general') {
        if (APP_CONFIG.USE_MOCK_DATA) {
            // Generar una URL temporal local para previsualización
            const fakeUrl = URL.createObjectURL(file);
            console.log('🟡 MOCK Storage: Imagen "subida":', fakeUrl);
            return { url: fakeUrl, error: null };
        }

        try {
            const sb = getSupabase();
            const fileName = `${folder}/${Date.now()}-${file.name}`;
            const { data, error } = await sb.storage
                .from(APP_CONFIG.STORAGE_BUCKET)
                .upload(fileName, file);

            if (error) return { url: null, error: error.message };

            // Obtener URL pública
            const { data: urlData } = sb.storage
                .from(APP_CONFIG.STORAGE_BUCKET)
                .getPublicUrl(fileName);

            return { url: urlData.publicUrl, error: null };
        } catch (err) {
            return { url: null, error: err.message };
        }
    },
};


// ============================================
// SERVICIO DE COTIZADOR (Estimador por m² y Zonas)
// ============================================
const CotizadorService = {

    async getZonas() {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const cached = localStorage.getItem('maximus_zonas_cotizador');
            if (cached) {
                return { data: JSON.parse(cached), error: null };
            }
            return { data: [...MOCK_DATA.zonas_cotizador], error: null };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.ZONAS_COTIZADOR).select('*').eq('activo', true).order('nombre');
    },

    async updateZona(id, updates) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let zonas = [...MOCK_DATA.zonas_cotizador];
            const cached = localStorage.getItem('maximus_zonas_cotizador');
            if (cached) zonas = JSON.parse(cached);

            const idx = zonas.findIndex(z => z.id === id);
            if (idx !== -1) {
                zonas[idx] = { ...zonas[idx], ...updates, updated_at: new Date().toISOString() };
                localStorage.setItem('maximus_zonas_cotizador', JSON.stringify(zonas));
                return { data: zonas[idx], error: null };
            }
            return { data: null, error: 'Zona no encontrada' };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.ZONAS_COTIZADOR).update(updates).eq('id', id).select().single();
    },

    async createZona(nuevaZona) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let zonas = [...MOCK_DATA.zonas_cotizador];
            const cached = localStorage.getItem('maximus_zonas_cotizador');
            if (cached) zonas = JSON.parse(cached);

            const item = { id: 'zc-' + Date.now(), ...nuevaZona, activo: true };
            zonas.push(item);
            localStorage.setItem('maximus_zonas_cotizador', JSON.stringify(zonas));
            return { data: item, error: null };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.ZONAS_COTIZADOR).insert(nuevaZona).select().single();
    },

    calcular({ m2, zona, tipo = 'apartamento' }) {
        if (!m2 || !zona) return null;
        const metros = parseFloat(m2) || 0;
        const precioBase = parseFloat(zona.precio_m2_base) || 0;
        
        let factor = 1.0;
        if (tipo === 'casa') factor = parseFloat(zona.factor_casa) || 1.05;
        if (tipo === 'apartamento') factor = parseFloat(zona.factor_apartamento) || 1.00;
        if (tipo === 'terreno') factor = parseFloat(zona.factor_terreno) || 0.60;
        if (tipo === 'local') factor = parseFloat(zona.factor_local) || 1.30;

        const precioM2Ajustado = Math.round(precioBase * factor);
        const precioEstimado = Math.round(metros * precioM2Ajustado);
        
        const minM2 = Math.round((parseFloat(zona.precio_min_m2) || precioBase * 0.9) * factor);
        const maxM2 = Math.round((parseFloat(zona.precio_max_m2) || precioBase * 1.15) * factor);

        return {
            m2: metros,
            zonaNombre: zona.nombre,
            municipio: zona.municipio,
            tipo: tipo,
            precioM2Ajustado,
            precioEstimado,
            rangoMin: Math.round(metros * minM2),
            rangoMax: Math.round(metros * maxM2),
        };
    }
};



// ============================================
// SERVICIO DE HISTÓRICO DE ASESORES Y CIERRES
// ============================================
const CierreVentaService = {

    _getStoredCierres() {
        const fallback = (typeof window !== 'undefined' && window.MOCK_DATA && window.MOCK_DATA.cierres_ventas)
            ? window.MOCK_DATA.cierres_ventas
            : (typeof MOCK_DATA !== 'undefined' && MOCK_DATA.cierres_ventas ? MOCK_DATA.cierres_ventas : []);

        if (typeof window === 'undefined') return [...fallback];
        const local = localStorage.getItem('maximus_cierres_ventas');
        if (local) {
            try {
                const parsed = JSON.parse(local);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    return parsed;
                }
            } catch (e) {
                console.error('Error parsing stored cierres:', e);
            }
        }
        return [...fallback];
    },

    _saveStoredCierres(cierres) {
        if (typeof window !== 'undefined') {
            localStorage.setItem('maximus_cierres_ventas', JSON.stringify(cierres));
        }
    },

    async getAll(filtros = {}) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let data = this._getStoredCierres();

            if (filtros.asesor_id && filtros.asesor_id !== 'todos') {
                data = data.filter(c => c.asesor_id === filtros.asesor_id);
            }
            if (filtros.tipo_operacion && filtros.tipo_operacion !== 'todas') {
                data = data.filter(c => c.tipo_operacion === filtros.tipo_operacion);
            }
            if (filtros.estatus_comision && filtros.estatus_comision !== 'todas') {
                data = data.filter(c => c.estatus_comision === filtros.estatus_comision);
            }
            if (filtros.busqueda) {
                const q = filtros.busqueda.toLowerCase().trim();
                data = data.filter(c => 
                    (c.inmueble_titulo && c.inmueble_titulo.toLowerCase().includes(q)) ||
                    (c.asesor_nombre && c.asesor_nombre.toLowerCase().includes(q)) ||
                    (c.ubicacion && c.ubicacion.toLowerCase().includes(q)) ||
                    (c.cliente_comprador && c.cliente_comprador.toLowerCase().includes(q))
                );
            }

            // Ordenar por fecha descendente
            data.sort((a, b) => new Date(b.fecha_cierre) - new Date(a.fecha_cierre));
            return { data, error: null };
        }

        // ---- SUPABASE REAL ----
        try {
            const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
            if (sb) {
                let query = sb.from(APP_CONFIG.TABLES.CIERRES_VENTAS).select('*');
                if (filtros.asesor_id && filtros.asesor_id !== 'todos') query = query.eq('asesor_id', filtros.asesor_id);
                if (filtros.tipo_operacion && filtros.tipo_operacion !== 'todas') query = query.eq('tipo_operacion', filtros.tipo_operacion);
                if (filtros.estatus_comision && filtros.estatus_comision !== 'todas') query = query.eq('estatus_comision', filtros.estatus_comision);
                if (filtros.busqueda) query = query.ilike('inmueble_titulo', `%${filtros.busqueda}%`);
                query = query.order('fecha_cierre', { ascending: false });
                const res = await query;
                if (res && !res.error && Array.isArray(res.data) && res.data.length > 0) {
                    return res;
                }
                if (res && res.error) {
                    console.warn('⚠️ MAXIMUS CierreVentaService: Supabase error o no autorizado. Usando respaldo local:', res.error);
                }
            }
        } catch (err) {
            console.warn('⚠️ MAXIMUS CierreVentaService: Excepción al conectar con Supabase. Usando respaldo local:', err);
        }

        // ---- RESPALDO LOCAL / MOCK DATA ----
        let data = this._getStoredCierres();
        if (filtros.asesor_id && filtros.asesor_id !== 'todos') {
            data = data.filter(c => c.asesor_id === filtros.asesor_id);
        }
        if (filtros.tipo_operacion && filtros.tipo_operacion !== 'todas') {
            data = data.filter(c => c.tipo_operacion === filtros.tipo_operacion);
        }
        if (filtros.estatus_comision && filtros.estatus_comision !== 'todas') {
            data = data.filter(c => c.estatus_comision === filtros.estatus_comision);
        }
        if (filtros.busqueda) {
            const q = filtros.busqueda.toLowerCase().trim();
            data = data.filter(c => 
                (c.inmueble_titulo && c.inmueble_titulo.toLowerCase().includes(q)) ||
                (c.asesor_nombre && c.asesor_nombre.toLowerCase().includes(q)) ||
                (c.ubicacion && c.ubicacion.toLowerCase().includes(q)) ||
                (c.cliente_comprador && c.cliente_comprador.toLowerCase().includes(q))
            );
        }
        data.sort((a, b) => new Date(b.fecha_cierre) - new Date(a.fecha_cierre));
        return { data, error: null };
    },

    async getMetricas(filtros = {}) {
        const { data: cierres } = await this.getAll(filtros);
        const lista = cierres || [];

        let totalVendidos = lista.length;
        let volumenTotal = 0;
        let comisionBrutaTotal = 0;
        let comisionNetaTotal = 0;
        let comisionOficinaTotal = 0;
        let liquidadasCount = 0;
        let pendientesCount = 0;
        let ventasCount = 0;
        let alquileresCount = 0;
        let volumenVentas = 0;
        let volumenAlquileres = 0;

        const asesorMap = {};

        lista.forEach(c => {
            const precio = parseFloat(c.precio_final) || 0;
            const bruta = parseFloat(c.comision_bruta_monto) || 0;
            const neta = parseFloat(c.comision_neta_asesor) || 0;
            const oficina = parseFloat(c.comision_oficina_monto) || 0;

            volumenTotal += precio;
            comisionBrutaTotal += bruta;
            comisionNetaTotal += neta;
            comisionOficinaTotal += oficina;

            if (c.tipo_operacion === 'alquiler') {
                alquileresCount++;
                volumenAlquileres += precio;
            } else {
                ventasCount++;
                volumenVentas += precio;
            }

            if (c.estatus_comision === 'liquidada') liquidadasCount++;
            else pendientesCount++;

            const aId = c.asesor_id || 'otro';
            if (!asesorMap[aId]) {
                asesorMap[aId] = {
                    asesor_id: aId,
                    asesor_nombre: c.asesor_nombre || 'Asesor',
                    asesor_tipo: c.asesor_tipo || 'maximus',
                    asesor_avatar: c.asesor_avatar,
                    cierres: 0,
                    volumen_total: 0,
                    comision_bruta: 0,
                    comision_neta: 0,
                    comision_oficina: 0,
                };
            }
            asesorMap[aId].cierres++;
            asesorMap[aId].volumen_total += precio;
            asesorMap[aId].comision_bruta += bruta;
            asesorMap[aId].comision_neta += neta;
            asesorMap[aId].comision_oficina += oficina;
        });

        const rankingAsesores = Object.values(asesorMap).sort((a, b) => b.comision_neta - a.comision_neta);

        return {
            total_inmuebles_vendidos: totalVendidos,
            ventas_count: ventasCount,
            alquileres_count: alquileresCount,
            volumen_ventas: volumenVentas,
            volumen_alquileres: volumenAlquileres,
            volumen_total_cerrado: volumenTotal,
            comision_bruta_total: comisionBrutaTotal,
            comision_neta_asesores: comisionNetaTotal,
            comision_oficina_total: comisionOficinaTotal,
            ticket_promedio: totalVendidos > 0 ? Math.round(volumenTotal / totalVendidos) : 0,
            comision_promedio_cierre: totalVendidos > 0 ? Math.round(comisionBrutaTotal / totalVendidos) : 0,
            liquidadas_count: liquidadasCount,
            pendientes_count: pendientesCount,
            ranking_asesores: rankingAsesores,
        };
    },

    async create(cierreInput) {
        const precioFinal = parseFloat(cierreInput.precio_final) || 0;
        const comisionBrutaPct = parseFloat(cierreInput.comision_bruta_porcentaje) || 5.0;
        const comisionBrutaMonto = Math.round(precioFinal * (comisionBrutaPct / 100));
        const asesorNetoPct = parseFloat(cierreInput.asesor_porcentaje_neto) || (cierreInput.asesor_tipo === 'externo' ? 50.0 : 70.0);
        const comisionNetaAsesor = Math.round(comisionBrutaMonto * (asesorNetoPct / 100));
        const comisionOficinaMonto = comisionBrutaMonto - comisionNetaAsesor;

        const record = {
            id: 'cierre-' + Date.now(),
            fecha_cierre: cierreInput.fecha_cierre || new Date().toISOString().split('T')[0],
            inmueble_id: cierreInput.inmueble_id || null,
            inmueble_titulo: cierreInput.inmueble_titulo || 'Inmueble Cerrado',
            ubicacion: cierreInput.ubicacion || 'San Cristóbal, Táchira',
            foto: cierreInput.foto || 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80',
            asesor_id: cierreInput.asesor_id,
            asesor_nombre: cierreInput.asesor_nombre,
            asesor_tipo: cierreInput.asesor_tipo || 'maximus',
            asesor_avatar: cierreInput.asesor_avatar || `https://ui-avatars.com/api/?name=${encodeURIComponent(cierreInput.asesor_nombre)}&background=0B4A3F&color=fff&bold=true`,
            tipo_operacion: cierreInput.tipo_operacion || 'venta',
            precio_final: precioFinal,
            moneda: 'USD',
            comision_bruta_porcentaje: comisionBrutaPct,
            comision_bruta_monto: comisionBrutaMonto,
            asesor_porcentaje_neto: asesorNetoPct,
            comision_neta_asesor: comisionNetaAsesor,
            comision_oficina_monto: comisionOficinaMonto,
            estatus_comision: cierreInput.estatus_comision || 'liquidada',
            cliente_comprador: cierreInput.cliente_comprador || 'Cliente Comprador',
            cliente_vendedor: cierreInput.cliente_vendedor || 'Cliente Propietario',
            metodo_pago: cierreInput.metodo_pago || 'Transferencia',
            referencia_pago: cierreInput.referencia_pago || 'REF-' + Math.floor(100000 + Math.random() * 900000),
            notas: cierreInput.notas || '',
            created_at: new Date().toISOString()
        };

        let res;
        if (APP_CONFIG.USE_MOCK_DATA) {
            let cierres = this._getStoredCierres();
            cierres.unshift(record);
            this._saveStoredCierres(cierres);

            // Actualizar contador en asesor si existe en MOCK_DATA
            if (typeof MOCK_DATA !== 'undefined' && MOCK_DATA.asesores) {
                const a = MOCK_DATA.asesores.find(item => item.id === record.asesor_id);
                if (a) a.cierres = (a.cierres || 0) + 1;
            }
            res = { data: record, error: null };
        } else {
            try {
                const sb = getSupabase();
                res = await sb.from(APP_CONFIG.TABLES.CIERRES_VENTAS).insert(record).select().single();
                if (res && res.error) {
                    let cierres = this._getStoredCierres();
                    cierres.unshift(record);
                    this._saveStoredCierres(cierres);
                    res = { data: record, error: null };
                }
            } catch (err) {
                let cierres = this._getStoredCierres();
                cierres.unshift(record);
                this._saveStoredCierres(cierres);
                res = { data: record, error: null };
            }
        }

        if (typeof N8nService !== 'undefined') {
            const cierreData = (res && res.data) ? res.data : record;
            N8nService.notificarCierreVenta({
                ...cierreData,
                comprador_nombre: cierreData.cliente_comprador,
                vendedor_nombre: cierreData.cliente_vendedor,
            }).catch(() => {});
        }

        return res;
    },

    async delete(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let cierres = this._getStoredCierres();
            cierres = cierres.filter(c => c.id !== id);
            this._saveStoredCierres(cierres);
            return { error: null };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.CIERRES_VENTAS).delete().eq('id', id);
    }
};

// ============================================
// SERVICIO DE COLECCIONES VIP (Dossiers Clientes)
// ============================================
const ColeccionesVipService = {
    _STORAGE_KEY: 'maximus_colecciones_vip',

    _getStoredColecciones() {
        try {
            const raw = localStorage.getItem(this._STORAGE_KEY);
            if (raw) {
                let parsed = JSON.parse(raw);
                if (Array.isArray(parsed) && parsed.length > 0) {
                    // Migración retroactiva: asegurar que tengan asesor_id y asesor_email
                    return parsed.map(c => {
                        if (!c.asesor_id) {
                            if (c.asesor === 'José Guerrero' || c.id === 'col-1') {
                                c.asesor_id = 'mock-admin-001';
                                c.asesor_email = 'admin@maximus.com';
                                c.creado_por = 'mock-admin-001';
                            } else if (c.asesor === 'Carlos Santander' || c.id === 'col-2') {
                                c.asesor_id = 'asesor-3';
                                c.asesor_email = 'carlos.santander@maximusinmobiliaria.com';
                                c.creado_por = 'asesor-3';
                            } else if (c.asesor === 'Valeria Méndez' || c.id === 'col-3') {
                                c.asesor_id = 'asesor-2';
                                c.asesor_email = 'asesor.maximus@maximus.com';
                                c.creado_por = 'asesor-2';
                            }
                        }
                        return c;
                    });
                }
            }
        } catch (e) {
            console.error('Error leyendo colecciones de localStorage:', e);
        }
        return (typeof window !== 'undefined' && window.COLECCIONES_VIP_DEFAULTS) 
            ? [...window.COLECCIONES_VIP_DEFAULTS] 
            : [];
    },

    _saveStoredColecciones(data) {
        try {
            localStorage.setItem(this._STORAGE_KEY, JSON.stringify(data));
        } catch (e) {
            console.error('Error guardando colecciones en localStorage:', e);
        }
    },

    async getAll(filtros = {}) {
        let colecciones = null;

        // Intentar consultar Supabase si está en modo producción
        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
                if (sb) {
                    let query = sb.from(APP_CONFIG.TABLES.COLECCIONES_VIP).select('*');
                    if (filtros.busqueda) {
                        query = query.or(`cliente.ilike.%${filtros.busqueda}%,titulo.ilike.%${filtros.busqueda}%`);
                    }
                    if (filtros.asesor_id) {
                        query = query.or(`asesor_id.eq.${filtros.asesor_id},creado_por.eq.${filtros.asesor_id}`);
                    } else if (filtros.asesor_email) {
                        query = query.eq('asesor_email', filtros.asesor_email);
                    }
                    query = query.order('created_at', { ascending: false });
                    const res = await query;
                    if (res && !res.error && Array.isArray(res.data) && res.data.length > 0) {
                        colecciones = res.data;
                    } else if (res && res.error) {
                        console.warn('⚠️ Supabase colecciones_vip fallback:', res.error);
                    }
                }
            } catch (err) {
                console.warn('⚠️ Error conectando a Supabase colecciones_vip:', err);
            }
        }

        if (!colecciones) {
            colecciones = this._getStoredColecciones();
            if (filtros.busqueda) {
                const q = filtros.busqueda.toLowerCase();
                colecciones = colecciones.filter(c => 
                    (c.cliente && c.cliente.toLowerCase().includes(q)) || 
                    (c.titulo && c.titulo.toLowerCase().includes(q)) ||
                    (c.nota && c.nota.toLowerCase().includes(q))
                );
            }
            if (filtros.asesor_id || filtros.asesor_email) {
                colecciones = colecciones.filter(c => 
                    (filtros.asesor_id && (c.asesor_id === filtros.asesor_id || c.creado_por === filtros.asesor_id)) ||
                    (filtros.asesor_email && c.asesor_email && c.asesor_email.toLowerCase() === filtros.asesor_email.toLowerCase())
                );
            }
        }

        return { data: colecciones, error: null };
    },

    async getById(id) {
        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
                if (sb) {
                    const res = await sb.from(APP_CONFIG.TABLES.COLECCIONES_VIP).select('*').eq('id', id).single();
                    if (res && !res.error && res.data) return res;
                }
            } catch(e) {}
        }
        const col = this._getStoredColecciones().find(c => c.id === id);
        return { data: col || null, error: col ? null : 'Colección no encontrada' };
    },

    async create(coleccionData) {
        const nueva = {
            id: coleccionData.id || ('col-' + Date.now()),
            ...coleccionData,
            created_at: coleccionData.created_at || new Date().toISOString()
        };

        // Guardar respaldo en localStorage siempre para reactividad inmediata
        const cols = this._getStoredColecciones();
        const existingIdx = cols.findIndex(c => c.id === nueva.id);
        if (existingIdx !== -1) {
            cols[existingIdx] = nueva;
        } else {
            cols.unshift(nueva);
        }
        this._saveStoredColecciones(cols);

        let res = { data: nueva, error: null };

        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
                if (sb) {
                    const payloadSupabase = {
                        id: nueva.id,
                        cliente: nueva.cliente,
                        email: nueva.email || nueva.cliente_email || null,
                        telefono: nueva.telefono || null,
                        titulo: nueva.titulo,
                        nota: nueva.nota || null,
                        fecha: nueva.fecha || null,
                        inmuebles: nueva.inmuebles || [],
                        inmuebles_detalle: nueva.inmuebles_detalle || [],
                        asesor_id: nueva.asesor_id || null,
                        asesor: nueva.asesor || null,
                        asesor_email: nueva.asesor_email || null,
                        creado_por: nueva.creado_por || null,
                        created_at: nueva.created_at
                    };
                    const sbRes = await sb.from(APP_CONFIG.TABLES.COLECCIONES_VIP).upsert(payloadSupabase).select().single();
                    if (sbRes && !sbRes.error && sbRes.data) {
                        res = sbRes;
                    }
                }
            } catch (e) {
                console.warn('⚠️ Error guardando coleccion en Supabase:', e);
            }
        }

        if (typeof N8nService !== 'undefined' && !coleccionData._skipN8nDossier) {
            N8nService.enviarDossierVip(res.data || nueva).catch(() => {});
        }

        return res;
    },

    async update(id, updates) {
        let cols = this._getStoredColecciones();
        const idx = cols.findIndex(c => c.id === id);
        if (idx !== -1) {
            cols[idx] = { ...cols[idx], ...updates, updated_at: new Date().toISOString() };
            this._saveStoredColecciones(cols);
        }

        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
                if (sb) {
                    const res = await sb.from(APP_CONFIG.TABLES.COLECCIONES_VIP).update(updates).eq('id', id).select().single();
                    if (res && !res.error && res.data) return res;
                }
            } catch(e) {}
        }

        return { data: cols[idx] || null, error: idx !== -1 ? null : 'No encontrado' };
    },

    async delete(id) {
        let cols = this._getStoredColecciones();
        cols = cols.filter(c => c.id !== id);
        this._saveStoredColecciones(cols);

        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
                if (sb) {
                    await sb.from(APP_CONFIG.TABLES.COLECCIONES_VIP).delete().eq('id', id);
                }
            } catch(e) {
                console.warn('⚠️ Error eliminando coleccion de Supabase:', e);
            }
        }

        return { error: null };
    }
};

// ============================================
// SERVICIO DE PERFIL & SEGURIDAD DEL ASESOR
// ============================================
const PerfilService = {

    _getCachedUser() {
        try {
            const raw = localStorage.getItem('maximus_user') || sessionStorage.getItem('maximus_user');
            const user = raw ? JSON.parse(raw) : null;
            if (user && (!user.avatar || user.avatar.includes('ui-avatars.com'))) {
                const savedAvatar = localStorage.getItem('maximus_avatar_' + (user.email || '').toLowerCase())
                                 || sessionStorage.getItem('maximus_avatar_' + (user.email || '').toLowerCase())
                                 || localStorage.getItem('maximus_user_avatar')
                                 || sessionStorage.getItem('maximus_user_avatar');
                if (savedAvatar) user.avatar = savedAvatar;
            }
            return user;
        } catch(e) {
            return null;
        }
    },

    _saveCachedUser(user) {
        try {
            const str = JSON.stringify(user);
            localStorage.setItem('maximus_user', str);
            sessionStorage.setItem('maximus_user', str);
            if (user && user.avatar) {
                localStorage.setItem('maximus_user_avatar', user.avatar);
                sessionStorage.setItem('maximus_user_avatar', user.avatar);
                if (user.email) {
                    const emailKey = 'maximus_avatar_' + user.email.toLowerCase().trim();
                    localStorage.setItem(emailKey, user.avatar);
                    sessionStorage.setItem(emailKey, user.avatar);
                }
            }
        } catch(e) {}
    },

    /**
     * Obtener el perfil completo del usuario autenticado.
     */
    async getPerfil() {
        const cached = this._getCachedUser();
        const defaults = {
            id: cached?.id || 'mock-agente-001',
            name: cached?.name || 'Carlos Pérez',
            email: cached?.email || 'asesor@maximus.com',
            telefono: cached?.telefono || '+58 414-7223344',
            role: cached?.role || 'asesor_maximus',
            title: cached?.title || 'Asesor Inmobiliario Senior',
            avatar: cached?.avatar || 'https://ui-avatars.com/api/?name=Carlos+Perez&background=0B4A3F&color=fff&bold=true',
            bio: cached?.bio || 'Especialista en propiedades residenciales exclusivas y activos comerciales de alta rentabilidad en San Cristóbal y Táchira.',
            licencia_inmobiliaria: cached?.licencia_inmobiliaria || 'CIV-9842 / Cámara Inmobiliaria',
            two_factor_enabled: cached?.two_factor_enabled !== undefined ? cached.two_factor_enabled : false,
            two_factor_method: cached?.two_factor_method || 'whatsapp',
            two_factor_phone: cached?.two_factor_phone || cached?.telefono || '+58 414-7223344',
            notif_whatsapp_leads: cached?.notif_whatsapp_leads !== undefined ? cached.notif_whatsapp_leads : true,
            notif_whatsapp_citas: cached?.notif_whatsapp_citas !== undefined ? cached.notif_whatsapp_citas : true,
            notif_whatsapp_cierres: cached?.notif_whatsapp_cierres !== undefined ? cached.notif_whatsapp_cierres : true,
            session_last_login: cached?.session_last_login || new Date().toLocaleString()
        };

        if (APP_CONFIG.USE_MOCK_DATA || !cached?.id || cached.id.startsWith('mock-')) {
            this._saveCachedUser(defaults);
            return { data: defaults, error: null };
        }

        try {
            const sb = getSupabase();
            const { data, error } = await sb.from(APP_CONFIG.TABLES.USUARIOS).select('*').eq('auth_id', cached.id).single();
            if (error || !data) {
                this._saveCachedUser(defaults);
                return { data: defaults, error: null };
            }

            const mapped = {
                id: cached.id,
                name: data.nombre_completo || defaults.name,
                email: data.email || defaults.email,
                telefono: data.telefono || defaults.telefono,
                role: data.rol || defaults.role,
                title: data.titulo || defaults.title,
                avatar: data.avatar_url || defaults.avatar,
                bio: data.bio || defaults.bio,
                licencia_inmobiliaria: data.licencia_inmobiliaria || defaults.licencia_inmobiliaria,
                two_factor_enabled: data.two_factor_enabled !== undefined ? data.two_factor_enabled : defaults.two_factor_enabled,
                two_factor_method: data.two_factor_method || defaults.two_factor_method,
                two_factor_phone: data.two_factor_phone || defaults.two_factor_phone,
                notif_whatsapp_leads: data.notif_whatsapp_leads !== undefined ? data.notif_whatsapp_leads : defaults.notif_whatsapp_leads,
                notif_whatsapp_citas: data.notif_whatsapp_citas !== undefined ? data.notif_whatsapp_citas : defaults.notif_whatsapp_citas,
                notif_whatsapp_cierres: data.notif_whatsapp_cierres !== undefined ? data.notif_whatsapp_cierres : defaults.notif_whatsapp_cierres,
                session_last_login: new Date().toLocaleString()
            };
            this._saveCachedUser(mapped);
            return { data: mapped, error: null };
        } catch(e) {
            return { data: defaults, error: null };
        }
    },

    /**
     * Actualizar datos del perfil.
     */
    async updatePerfil(updates) {
        const cached = this._getCachedUser() || {};
        const updatedUser = { ...cached, ...updates, updated_at: new Date().toISOString() };
        this._saveCachedUser(updatedUser);

        // Notificar automatización en n8n
        if (window.N8nService) {
            N8nService.trigger('PERFIL_ACTUALIZADO', {
                usuario_id: updatedUser.id,
                email: updatedUser.email,
                nombre: updatedUser.name,
                telefono: updatedUser.telefono,
                fecha: new Date().toISOString()
            });
        }

        if (APP_CONFIG.USE_MOCK_DATA || !updatedUser.id || updatedUser.id.startsWith('mock-')) {
            return { data: updatedUser, error: null };
        }

        try {
            const sb = getSupabase();
            const dbPayload = {
                nombre_completo: updatedUser.name,
                telefono: updatedUser.telefono,
                titulo: updatedUser.title,
                avatar_url: updatedUser.avatar,
                bio: updatedUser.bio,
                licencia_inmobiliaria: updatedUser.licencia_inmobiliaria,
                two_factor_enabled: updatedUser.two_factor_enabled,
                two_factor_method: updatedUser.two_factor_method,
                two_factor_phone: updatedUser.two_factor_phone,
                notif_whatsapp_leads: updatedUser.notif_whatsapp_leads,
                notif_whatsapp_citas: updatedUser.notif_whatsapp_citas,
                notif_whatsapp_cierres: updatedUser.notif_whatsapp_cierres,
                updated_at: new Date().toISOString()
            };

            const { data, error } = await sb.from(APP_CONFIG.TABLES.USUARIOS).update(dbPayload).eq('auth_id', updatedUser.id).select().single();
            return { data: updatedUser, error };
        } catch(err) {
            return { data: updatedUser, error: null };
        }
    },

    /**
     * Cambio de contraseña seguro con notificación de seguridad vía n8n.
     */
    async cambiarPassword({ actual, nueva }) {
        if (!nueva || nueva.length < 6) {
            return { success: false, error: 'La nueva contraseña debe tener al menos 6 caracteres' };
        }

        const user = this._getCachedUser();

        // Disparar automatización n8n de seguridad
        if (window.N8nService) {
            await N8nService.trigger('AUTH_CAMBIO_PASSWORD', {
                usuario_id: user?.id,
                email: user?.email,
                nombre: user?.name,
                ip: '127.0.0.1 (Navegador Sesión Segura)',
                dispositivo: navigator.userAgent,
                timestamp: new Date().toISOString()
            });
        }

        if (APP_CONFIG.USE_MOCK_DATA || !user?.id || user.id.startsWith('mock-')) {
            return { success: true, message: 'Contraseña actualizada exitosamente (Modo Seguro Mock)' };
        }

        try {
            const sb = getSupabase();
            const { error } = await sb.auth.updateUser({ password: nueva });
            if (error) return { success: false, error: error.message };
            return { success: true, message: 'Contraseña actualizada en Supabase Auth' };
        } catch(e) {
            return { success: false, error: 'Error al conectar con Supabase Auth' };
        }
    },

    /**
     * Obtener los segundos restantes del cooldown de 60 segundos para 2FA.
     */
    get2FACooldownRemaining(email) {
        const cleanEmail = (email || '').toLowerCase().trim();
        const key = 'maximus_2fa_cooldown_until_' + cleanEmail;
        const until = parseInt(sessionStorage.getItem(key) || '0', 10);
        const remaining = Math.ceil((until - Date.now()) / 1000);
        return remaining > 0 ? remaining : 0;
    },

    /**
     * Enviar código de verificación 2FA (OTP 6 dígitos) vía Correo Electrónico.
     * Incorpora cooldown de 60 segundos para prevenir saturación de solicitudes.
     * @param {string} identifier - Correo electrónico de destino.
     * @param {string} method - Método de entrega ('email').
     * @param {boolean} force - Si es true, ignora el cooldown (para emisión inicial).
     */
    async enviarCodigo2FA(identifier, method = 'email', force = false) {
        const user = this._getCachedUser();
        const emailDestino = ((method === 'email' ? identifier : user?.email) || user?.email || '').toLowerCase().trim();

        const cooldownRemaining = this.get2FACooldownRemaining(emailDestino);
        if (!force && cooldownRemaining > 0) {
            return {
                success: false,
                cooldown: true,
                cooldownRemaining,
                error: `Por favor espera ${cooldownRemaining}s antes de solicitar otro código de seguridad.`
            };
        }

        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        sessionStorage.setItem('maximus_2fa_temp_code', otpCode);
        sessionStorage.setItem('maximus_2fa_temp_expiry', (Date.now() + 10 * 60 * 1000).toString());

        // Registrar cooldown estricto de 60 segundos
        sessionStorage.setItem('maximus_2fa_cooldown_until_' + emailDestino, (Date.now() + 60 * 1000).toString());

        // Disparar Webhook para enviar el mensaje real por Correo
        if (window.N8nService) {
            await N8nService.trigger('AUTH_VERIFICACION_2FA', {
                codigo: otpCode,
                codigo_otp: otpCode,
                metodo: method,
                email: emailDestino,
                telefono: user?.telefono || '',
                nombre: user?.name || 'Asesor MAXIMUS',
                validez_minutos: 10,
                evento: 'AUTH_VERIFICACION_2FA'
            });
        }

        return { success: true, email: emailDestino, cooldownRemaining: 60 };
    },

    /**
     * Validar el código OTP 2FA ingresado por el usuario.
     */
    verificarCodigo2FA(codigoIngresado) {
        const storedCode = sessionStorage.getItem('maximus_2fa_temp_code');
        const expiry = parseInt(sessionStorage.getItem('maximus_2fa_temp_expiry') || '0', 10);

        if (!storedCode) {
            return { success: false, error: 'No hay un código de verificación activo. Solicita uno nuevo.' };
        }
        if (Date.now() > expiry) {
            return { success: false, error: 'El código ha expirado (validez: 10 minutos). Solicita otro código.' };
        }
        if (codigoIngresado.trim() !== storedCode) {
            return { success: false, error: 'Código incorrecto. Verifica los 6 dígitos recibidos en tu correo.' };
        }

        sessionStorage.removeItem('maximus_2fa_temp_code');
        return { success: true };
    }
};

// ============================================
// SERVICIO DE EQUIPO EN WEB (Landing Page)
// ============================================
const EquipoWebService = {

    /**
     * Obtener todos los miembros del equipo.
     */
    async getAll(filtros = {}) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let data = [...(MOCK_DATA.equipo_web || [])];
            if (filtros.mostrar_en_web !== undefined) {
                data = data.filter(m => m.mostrar_en_web === filtros.mostrar_en_web);
            }
            if (filtros.activo !== undefined) {
                data = data.filter(m => m.activo === filtros.activo);
            }
            data.sort((a, b) => (a.orden || 0) - (b.orden || 0));
            return { data, error: null };
        }

        // SUPABASE REAL
        try {
            const sb = getSupabase();
            const tabla = (APP_CONFIG.TABLES && APP_CONFIG.TABLES.EQUIPO_WEB) ? APP_CONFIG.TABLES.EQUIPO_WEB : 'equipo_web';
            let query = sb.from(tabla).select('*');
            if (filtros.mostrar_en_web !== undefined) query = query.eq('mostrar_en_web', filtros.mostrar_en_web);
            if (filtros.activo !== undefined) query = query.eq('activo', filtros.activo);
            query = query.order('orden', { ascending: true });
            return await query;
        } catch (err) {
            console.error('Error al consultar equipo_web en Supabase:', err);
            return { data: MOCK_DATA.equipo_web || [], error: err.message };
        }
    },

    /**
     * Obtener miembro por ID.
     */
    async getById(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const item = (MOCK_DATA.equipo_web || []).find(m => m.id === id);
            return { data: item || null, error: item ? null : 'Miembro no encontrado' };
        }

        const sb = getSupabase();
        const tabla = (APP_CONFIG.TABLES && APP_CONFIG.TABLES.EQUIPO_WEB) ? APP_CONFIG.TABLES.EQUIPO_WEB : 'equipo_web';
        return await sb.from(tabla).select('*').eq('id', id).single();
    },

    /**
     * Crear nuevo miembro del equipo.
     */
    async create(miembroData) {
        const nuevo = {
            id: 'eq-' + Date.now().toString().slice(-6),
            nombre: miembroData.nombre || 'Nuevo Asesor',
            cargo: miembroData.cargo || 'Asesor Inmobiliario',
            email: miembroData.email || '',
            telefono: miembroData.telefono || '',
            whatsapp: miembroData.whatsapp || (miembroData.telefono ? miembroData.telefono.replace(/\D/g, '') : ''),
            foto_url: miembroData.foto_url || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=600&q=80',
            orden: parseInt(miembroData.orden || ((typeof MOCK_DATA !== 'undefined' && MOCK_DATA.equipo_web ? MOCK_DATA.equipo_web.length : 0) + 1), 10),
            mostrar_en_web: miembroData.mostrar_en_web !== undefined ? miembroData.mostrar_en_web : true,
            activo: true,
            bio: miembroData.bio || '',
            created_at: new Date().toISOString()
        };

        let res = { data: nuevo, error: null };

        if (APP_CONFIG.USE_MOCK_DATA) {
            if (typeof MOCK_DATA !== 'undefined') {
                if (!MOCK_DATA.equipo_web) MOCK_DATA.equipo_web = [];
                MOCK_DATA.equipo_web.push(nuevo);
            }
        } else {
            try {
                const sb = getSupabase();
                const tabla = (APP_CONFIG.TABLES && APP_CONFIG.TABLES.EQUIPO_WEB) ? APP_CONFIG.TABLES.EQUIPO_WEB : 'equipo_web';
                const sbRes = await sb.from(tabla).insert(miembroData).select().single();
                if (sbRes && !sbRes.error && sbRes.data) {
                    res = sbRes;
                } else if (typeof MOCK_DATA !== 'undefined') {
                    if (!MOCK_DATA.equipo_web) MOCK_DATA.equipo_web = [];
                    MOCK_DATA.equipo_web.push(nuevo);
                }
            } catch (err) {
                if (typeof MOCK_DATA !== 'undefined') {
                    if (!MOCK_DATA.equipo_web) MOCK_DATA.equipo_web = [];
                    MOCK_DATA.equipo_web.push(nuevo);
                }
            }
        }

        if (typeof N8nService !== 'undefined' && !miembroData._skipN8nBienvenida) {
            N8nService.enviarBienvenidaAsesor({
                ...(res.data || nuevo),
                origen_registro: 'equipo_web'
            }).catch(() => {});
        }

        return res;
    },

    /**
     * Actualizar miembro existente.
     */
    async update(id, miembroData) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const idx = (MOCK_DATA.equipo_web || []).findIndex(m => m.id === id);
            if (idx === -1) return { data: null, error: 'Miembro no encontrado' };
            MOCK_DATA.equipo_web[idx] = { 
                ...MOCK_DATA.equipo_web[idx], 
                ...miembroData,
                updated_at: new Date().toISOString()
            };
            return { data: MOCK_DATA.equipo_web[idx], error: null };
        }

        const sb = getSupabase();
        const tabla = (APP_CONFIG.TABLES && APP_CONFIG.TABLES.EQUIPO_WEB) ? APP_CONFIG.TABLES.EQUIPO_WEB : 'equipo_web';
        return await sb.from(tabla).update(miembroData).eq('id', id).select().single();
    },

    /**
     * Alternar visibilidad en la web.
     */
    async toggleVisibilidad(id, mostrar_en_web) {
        return await this.update(id, { mostrar_en_web });
    },

    /**
     * Eliminar miembro.
     */
    async delete(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const idx = (MOCK_DATA.equipo_web || []).findIndex(m => m.id === id);
            if (idx === -1) return { error: 'No encontrado' };
            MOCK_DATA.equipo_web.splice(idx, 1);
            return { error: null };
        }

        const sb = getSupabase();
        const tabla = (APP_CONFIG.TABLES && APP_CONFIG.TABLES.EQUIPO_WEB) ? APP_CONFIG.TABLES.EQUIPO_WEB : 'equipo_web';
        return await sb.from(tabla).delete().eq('id', id);
    },

    /**
     * Obtener textos de cabecera de la sección "Nuestro Equipo".
     */
    getConfig() {
        const stored = localStorage.getItem('maximus_equipo_web_config');
        if (stored) {
            try { return JSON.parse(stored); } catch(e) {}
        }
        return (typeof MOCK_DATA !== 'undefined' && MOCK_DATA.equipo_web_config) ? MOCK_DATA.equipo_web_config : {
            etiqueta: 'NUESTRO EQUIPO',
            titulo: 'Agentes Expertos a tu Servicio',
            subtitulo: 'Profesionales con años de experiencia listos para asesorarte en cada paso de tu inversión.',
        };
    },

    /**
     * Guardar textos de cabecera de la sección.
     */
    saveConfig(configData) {
        const current = this.getConfig();
        const updated = { ...current, ...configData };
        localStorage.setItem('maximus_equipo_web_config', JSON.stringify(updated));
        if (typeof MOCK_DATA !== 'undefined') {
            MOCK_DATA.equipo_web_config = updated;
        }
        return { success: true, data: updated };
    }
};

// ============================================
// SERVICIO DE ASESORES OFICIALES MAXIMUS
// ============================================
const AsesorMaximusService = {
    _storageKey: 'maximus_asesores_oficiales_data',

    _getLocal() {
        const stored = localStorage.getItem(this._storageKey);
        if (stored) {
            try { return JSON.parse(stored); } catch(e) {}
        }
        if (typeof MOCK_DATA !== 'undefined' && MOCK_DATA.asesores_maximus) {
            return [...MOCK_DATA.asesores_maximus];
        }
        return [];
    },

    _saveLocal(list) {
        localStorage.setItem(this._storageKey, JSON.stringify(list));
        if (typeof MOCK_DATA !== 'undefined') {
            MOCK_DATA.asesores_maximus = list;
        }
    },

    async getAll(filtros = {}) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let data = this._getLocal();
            if (filtros.activo !== undefined) {
                data = data.filter(a => a.activo === filtros.activo);
            }
            if (filtros.especialidad) {
                data = data.filter(a => a.especialidad.toLowerCase().includes(filtros.especialidad.toLowerCase()));
            }
            if (filtros.busqueda) {
                const q = filtros.busqueda.toLowerCase();
                data = data.filter(a => 
                    a.nombre.toLowerCase().includes(q) || 
                    a.cargo.toLowerCase().includes(q) || 
                    a.especialidad.toLowerCase().includes(q)
                );
            }
            data.sort((a, b) => (a.orden || 99) - (b.orden || 99));
            return { data, error: null };
        }

        try {
            const sb = getSupabase();
            let query = sb.from(APP_CONFIG.TABLES.ASESORES_MAXIMUS).select('*');
            if (filtros.activo !== undefined) query = query.eq('activo', filtros.activo);
            if (filtros.busqueda) query = query.ilike('nombre', `%${filtros.busqueda}%`);
            query = query.order('orden', { ascending: true });
            const res = await query;
            if (res && !res.error && Array.isArray(res.data) && res.data.length > 0) {
                return res;
            }
        } catch (err) {}

        let data = this._getLocal();
        return { data, error: null };
    },

    async getById(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const list = this._getLocal();
            const found = list.find(a => a.id === id);
            return { data: found || null, error: found ? null : 'No encontrado' };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.ASESORES_MAXIMUS).select('*').eq('id', id).single();
    },

    async create(asesorData) {
        const list = this._getLocal();
        const nuevo = {
            id: asesorData.id || ('asesor-' + Date.now()),
            activo: true,
            rating: 5.0,
            cierres: 0,
            badge_texto: 'Asesor Certificado',
            orden: list.length + 1,
            created_at: new Date().toISOString(),
            ...asesorData,
        };
        list.push(nuevo);
        this._saveLocal(list);

        let res = { data: nuevo, error: null };

        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = getSupabase();
                const sbRes = await sb.from(APP_CONFIG.TABLES.ASESORES_MAXIMUS).insert([asesorData]).select().single();
                if (sbRes && !sbRes.error && sbRes.data) {
                    res = sbRes;
                }
            } catch (e) {}
        }

        if (typeof N8nService !== 'undefined' && !asesorData._skipN8nBienvenida) {
            N8nService.enviarBienvenidaAsesor({
                ...(res.data || nuevo),
                origen_registro: 'panel_admin_asesores'
            }).catch(() => {});
        }

        return res;
    },

    async update(id, updates) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const list = this._getLocal();
            const idx = list.findIndex(a => a.id === id);
            if (idx === -1) return { data: null, error: 'Asesor no encontrado' };
            list[idx] = { ...list[idx], ...updates, updated_at: new Date().toISOString() };
            this._saveLocal(list);
            return { data: list[idx], error: null };
        }

        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.ASESORES_MAXIMUS).update(updates).eq('id', id).select().single();
    },

    async delete(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let list = this._getLocal();
            list = list.filter(a => a.id !== id);
            this._saveLocal(list);
            return { error: null };
        }

        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.ASESORES_MAXIMUS).delete().eq('id', id);
    }
};

// ============================================
// SERVICIO DE NOTIFICACIONES & OPERACIONES
// ============================================
const NotificacionService = {
    _storageKey: 'maximus_notificaciones_data',

    _getLocal() {
        const stored = localStorage.getItem(this._storageKey);
        if (stored) {
            try { return JSON.parse(stored); } catch(e) {}
        }
        if (typeof MOCK_DATA !== 'undefined' && MOCK_DATA.notificaciones) {
            return [...MOCK_DATA.notificaciones];
        }
        return [];
    },

    _saveLocal(list) {
        localStorage.setItem(this._storageKey, JSON.stringify(list));
        if (typeof MOCK_DATA !== 'undefined') {
            MOCK_DATA.notificaciones = list;
        }
    },

    async getAll(filtros = {}) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let data = this._getLocal();
            if (filtros.tipo && filtros.tipo !== 'todas') {
                data = data.filter(n => n.tipo === filtros.tipo);
            }
            if (filtros.leida !== undefined) {
                data = data.filter(n => n.leida === filtros.leida);
            }
            return { data, error: null };
        }

        const sb = getSupabase();
        let query = sb.from(APP_CONFIG.TABLES.NOTIFICACIONES).select('*');
        if (filtros.tipo && filtros.tipo !== 'todas') query = query.eq('tipo', filtros.tipo);
        if (filtros.leida !== undefined) query = query.eq('leida', filtros.leida);
        query = query.order('created_at', { ascending: false });
        return await query;
    },

    async markAsRead(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const list = this._getLocal();
            const item = list.find(n => n.id === id);
            if (item) item.leida = true;
            this._saveLocal(list);
            return { data: item, error: null };
        }

        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.NOTIFICACIONES).update({ leida: true }).eq('id', id);
    },

    async markAllAsRead() {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const list = this._getLocal();
            list.forEach(n => n.leida = true);
            this._saveLocal(list);
            return { success: true };
        }

        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.NOTIFICACIONES).update({ leida: true }).eq('leida', false);
    },

    async create(notifData) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const list = this._getLocal();
            const nuevo = {
                id: 'notif-' + Date.now(),
                tiempo: 'Hace un momento',
                leida: false,
                created_at: new Date().toISOString(),
                ...notifData
            };
            list.unshift(nuevo);
            this._saveLocal(list);
            return { data: nuevo, error: null };
        }

        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.NOTIFICACIONES).insert([notifData]).select().single();
    }
};

// ============================================
// SERVICIO DE MATERIAL INFORMATIVO & ACADEMIA
// ============================================
const MaterialInformativoService = {

    _normalizarItem(row) {
        if (!row) return null;
        return {
            id: row.id,
            orden: row.orden || 1,
            titulo: row.titulo || 'Sin título',
            desc: row.desc || row.descripcion || '',
            descripcion: row.descripcion || row.desc || '',
            categoria: row.categoria || 'primeros-pasos',
            categoria_nombre: row.categoria_nombre || row.categoriaNombre || 'General',
            categoriaNombre: row.categoria_nombre || row.categoriaNombre || 'General',
            tipo: row.tipo || 'video',
            tipo_label: row.tipo_label || row.tipoLabel || 'Tutorial',
            tipoLabel: row.tipo_label || row.tipoLabel || 'Tutorial',
            duracion: row.duracion || '05:00 min',
            badge: row.badge || 'VIP',
            badge_color: row.badge_color || row.badgeColor || 'bg-emerald-600',
            badgeColor: row.badge_color || row.badgeColor || 'bg-emerald-600',
            imagen: row.imagen || row.imagen_url || 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
            url_recurso: row.url_recurso || row.url || '#',
            resumen_puntos: Array.isArray(row.resumen_puntos) ? row.resumen_puntos : (Array.isArray(row.resumenPuntos) ? row.resumenPuntos : []),
            resumenPuntos: Array.isArray(row.resumen_puntos) ? row.resumen_puntos : (Array.isArray(row.resumenPuntos) ? row.resumenPuntos : []),
            activo: row.activo !== false,
            created_at: row.created_at || new Date().toISOString()
        };
    },

    async getAll(filtros = {}) {
        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
                if (sb) {
                    const tableName = APP_CONFIG.TABLES.MATERIAL_INFORMATIVO || 'material_informativo';
                    let query = sb.from(tableName).select('*').order('orden', { ascending: true });
                    
                    if (filtros.categoria && filtros.categoria !== 'todos') {
                        query = query.eq('categoria', filtros.categoria);
                    }
                    if (filtros.tipo && filtros.tipo !== 'todos') {
                        query = query.eq('tipo', filtros.tipo);
                    }
                    if (filtros.activo !== undefined) {
                        query = query.eq('activo', filtros.activo);
                    }

                    const res = await query;
                    if (res && !res.error && Array.isArray(res.data) && res.data.length > 0) {
                        const normalizados = res.data.map(r => this._normalizarItem(r));
                        return { data: normalizados, error: null, source: 'supabase' };
                    }
                    if (res && res.error) {
                        console.warn('⚠️ MAXIMUS MaterialInformativoService: Supabase devolvió aviso. Usando respaldo local:', res.error.message || res.error);
                    }
                }
            } catch (err) {
                console.warn('⚠️ MAXIMUS MaterialInformativoService: Excepción al conectar con Supabase. Usando respaldo local:', err);
            }
        }

        // Respaldo local desde MOCK_DATA
        let data = (typeof MOCK_DATA !== 'undefined' && Array.isArray(MOCK_DATA.material_informativo))
            ? MOCK_DATA.material_informativo.map(r => this._normalizarItem(r))
            : [];

        if (filtros.categoria && filtros.categoria !== 'todos') {
            data = data.filter(m => m.categoria === filtros.categoria);
        }
        if (filtros.busqueda) {
            const q = filtros.busqueda.toLowerCase();
            data = data.filter(m => 
                m.titulo.toLowerCase().includes(q) ||
                m.desc.toLowerCase().includes(q) ||
                m.categoriaNombre.toLowerCase().includes(q)
            );
        }

        return { data, error: null, source: 'mock' };
    },

    async getById(id) {
        const { data } = await this.getAll();
        const found = data.find(m => m.id === id);
        return { data: found || null, error: found ? null : 'No encontrado' };
    },

    async create(nuevoItem) {
        const itemNormalizado = this._normalizarItem({
            id: nuevoItem.id || 'mat-' + Date.now(),
            ...nuevoItem,
            created_at: new Date().toISOString()
        });

        if (!APP_CONFIG.USE_MOCK_DATA) {
            try {
                const sb = (typeof getSupabase === 'function') ? getSupabase() : null;
                if (sb) {
                    const tableName = APP_CONFIG.TABLES.MATERIAL_INFORMATIVO || 'material_informativo';
                    const res = await sb.from(tableName).insert([{
                        id: itemNormalizado.id,
                        orden: itemNormalizado.orden,
                        titulo: itemNormalizado.titulo,
                        descripcion: itemNormalizado.desc,
                        categoria: itemNormalizado.categoria,
                        categoria_nombre: itemNormalizado.categoriaNombre,
                        tipo: itemNormalizado.tipo,
                        tipo_label: itemNormalizado.tipoLabel,
                        duracion: itemNormalizado.duracion,
                        badge: itemNormalizado.badge,
                        badge_color: itemNormalizado.badgeColor,
                        imagen: itemNormalizado.imagen,
                        url_recurso: itemNormalizado.url_recurso,
                        resumen_puntos: itemNormalizado.resumenPuntos,
                        activo: true
                    }]).select().single();
                    if (res && !res.error) {
                        return { data: this._normalizarItem(res.data), error: null };
                    }
                }
            } catch (e) {
                console.warn('MaterialInformativoService.create: Error en Supabase:', e);
            }
        }

        if (typeof MOCK_DATA !== 'undefined' && Array.isArray(MOCK_DATA.material_informativo)) {
            MOCK_DATA.material_informativo.push(itemNormalizado);
        }
        return { data: itemNormalizado, error: null };
    }
};

// Exportar todos los servicios
if (typeof window !== 'undefined') {
    window.InmuebleService = InmuebleService;
    window.LeadService = LeadService;
    window.CitaService = CitaService;
    window.PagoService = PagoService;
    window.DocumentoService = DocumentoService;
    window.MetricaService = MetricaService;
    window.VendidoGlobalService = VendidoGlobalService;
    window.N8nService = N8nService;
    window.StorageService = StorageService;
    window.CotizadorService = CotizadorService;
    window.CierreVentaService = CierreVentaService;
    window.HistoricoAsesoresService = CierreVentaService;
    window.ColeccionesVipService = ColeccionesVipService;
    window.PerfilService = PerfilService;
    window.EquipoWebService = EquipoWebService;
    window.AsesorMaximusService = AsesorMaximusService;
    window.NotificacionService = NotificacionService;
    window.MaterialInformativoService = MaterialInformativoService;
}

