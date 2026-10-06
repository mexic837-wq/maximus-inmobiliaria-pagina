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
        if (APP_CONFIG.USE_MOCK_DATA) {
            let data = [...MOCK_DATA.inmuebles];
            if (filtros.operacion) data = data.filter(i => i.operacion === filtros.operacion);
            if (filtros.estatus) data = data.filter(i => i.estatus === filtros.estatus);
            if (filtros.tipo) data = data.filter(i => i.tipo === filtros.tipo);
            if (filtros.busqueda) {
                const q = filtros.busqueda.toLowerCase();
                data = data.filter(i => 
                    i.titulo.toLowerCase().includes(q) || 
                    i.ubicacion.toLowerCase().includes(q)
                );
            }
            return { data, error: null };
        }

        // ---- SUPABASE REAL ----
        const sb = getSupabase();
        let query = sb.from(APP_CONFIG.TABLES.INMUEBLES).select('*');
        if (filtros.operacion) query = query.eq('operacion', filtros.operacion);
        if (filtros.estatus) query = query.eq('estatus', filtros.estatus);
        if (filtros.tipo) query = query.eq('tipo', filtros.tipo);
        if (filtros.busqueda) query = query.ilike('titulo', `%${filtros.busqueda}%`);
        query = query.order('created_at', { ascending: false });
        return await query;
    },

    async getById(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const item = MOCK_DATA.inmuebles.find(i => i.id === id);
            return { data: item || null, error: item ? null : 'No encontrado' };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.INMUEBLES).select('*').eq('id', id).single();
    },

    async create(inmuebleData) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const nuevo = { id: 'inm-' + Date.now(), ...inmuebleData, created_at: new Date().toISOString() };
            MOCK_DATA.inmuebles.unshift(nuevo);
            console.log('🟡 MOCK: Inmueble creado', nuevo);
            return { data: nuevo, error: null };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.INMUEBLES).insert(inmuebleData).select().single();
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
// SERVICIO DE LEADS (CLIENTES)
// ============================================
const LeadService = {

    async getAll(filtros = {}) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let data = [...MOCK_DATA.leads];
            if (filtros.estatus) data = data.filter(l => l.estatus === filtros.estatus);
            if (filtros.origen) data = data.filter(l => l.origen === filtros.origen);
            return { data, error: null };
        }
        const sb = getSupabase();
        let query = sb.from(APP_CONFIG.TABLES.LEADS).select('*');
        if (filtros.estatus) query = query.eq('estatus', filtros.estatus);
        if (filtros.origen) query = query.eq('origen', filtros.origen);
        query = query.order('created_at', { ascending: false });
        return await query;
    },

    async create(leadData) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const nuevo = { id: 'lead-' + Date.now(), ...leadData, created_at: new Date().toISOString() };
            MOCK_DATA.leads.unshift(nuevo);
            return { data: nuevo, error: null };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.LEADS).insert(leadData).select().single();
    },

    async updateEstatus(id, nuevoEstatus) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const lead = MOCK_DATA.leads.find(l => l.id === id);
            if (lead) lead.estatus = nuevoEstatus;
            return { data: lead, error: null };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.LEADS).update({ estatus: nuevoEstatus }).eq('id', id).select().single();
    },

    async delete(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            MOCK_DATA.leads = MOCK_DATA.leads.filter(l => l.id !== id);
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
        if (APP_CONFIG.USE_MOCK_DATA) {
            const nueva = { id: 'cita-' + Date.now(), ...citaData };
            MOCK_DATA.citas.push(nueva);
            return { data: nueva, error: null };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.CITAS).insert(citaData).select().single();
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
        if (APP_CONFIG.USE_MOCK_DATA) {
            let data = [...MOCK_DATA.vendidos_global];
            if (filtros.operacion && filtros.operacion !== 'todos') {
                data = data.filter(v => v.operacion_cerrada === filtros.operacion);
            }
            return { data, error: null };
        }
        const sb = getSupabase();
        let query = sb.from(APP_CONFIG.TABLES.INMUEBLES)
            .select('*')
            .in('estatus', ['vendido', 'alquilado']);
        if (filtros.operacion && filtros.operacion !== 'todos') {
            query = query.eq('estatus', filtros.operacion);
        }
        return await query;
    },
};


// ============================================
// SERVICIO DE N8N (Webhooks / Automatizaciones)
// ============================================
const N8nService = {

    /**
     * Dispara un webhook de n8n.
     * @param {string} webhookKey - Clave del webhook en APP_CONFIG.N8N_WEBHOOKS
     * @param {object} payload - Datos a enviar
     */
    async trigger(webhookKey, payload = {}) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            console.log(`🟡 MOCK N8N: Webhook "${webhookKey}" disparado con:`, payload);
            return { success: true, mock: true };
        }

        const webhookPath = APP_CONFIG.N8N_WEBHOOKS[webhookKey];
        if (!webhookPath) {
            console.error(`❌ Webhook "${webhookKey}" no está definido en config.`);
            return { success: false, error: 'Webhook no definido.' };
        }

        try {
            const url = APP_CONFIG.N8N_BASE_URL + webhookPath;
            const response = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload),
            });
            const data = await response.json();
            return { success: true, data };
        } catch (err) {
            console.error('❌ Error llamando a n8n:', err);
            return { success: false, error: err.message };
        }
    },

    /**
     * Atajos para webhooks comunes
     */
    async notificarNuevoLead(leadData) {
        return this.trigger('NUEVO_LEAD', leadData);
    },

    async contactarWhatsApp(telefono, mensaje) {
        return this.trigger('CONTACTAR_WHATSAPP', { telefono, mensaje });
    },

    async notificarAgente(agenteId, titulo, mensaje) {
        return this.trigger('NOTIFICACION_AGENTE', { agente_id: agenteId, titulo, mensaje });
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
}
