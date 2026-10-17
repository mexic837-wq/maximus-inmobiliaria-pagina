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

    async enviarValoracionLead(valoracionData) {
        return this.trigger('VALORACION_LEAD', valoracionData);
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

        if (APP_CONFIG.USE_MOCK_DATA) {
            let cierres = this._getStoredCierres();
            cierres.unshift(record);
            this._saveStoredCierres(cierres);

            // Actualizar contador en asesor si existe en MOCK_DATA
            if (MOCK_DATA.asesores) {
                const a = MOCK_DATA.asesores.find(item => item.id === record.asesor_id);
                if (a) a.cierres = (a.cierres || 0) + 1;
            }
            return { data: record, error: null };
        }

        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.CIERRES_VENTAS).insert(record).select().single();
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
            if (raw) return JSON.parse(raw);
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
        if (APP_CONFIG.USE_MOCK_DATA) {
            let data = this._getStoredColecciones();
            if (filtros.busqueda) {
                const q = filtros.busqueda.toLowerCase();
                data = data.filter(c => 
                    (c.cliente && c.cliente.toLowerCase().includes(q)) || 
                    (c.titulo && c.titulo.toLowerCase().includes(q)) ||
                    (c.nota && c.nota.toLowerCase().includes(q))
                );
            }
            return { data, error: null };
        }

        // Supabase Real
        const sb = getSupabase();
        let query = sb.from(APP_CONFIG.TABLES.COLECCIONES_VIP).select('*');
        if (filtros.busqueda) {
            query = query.or(`cliente.ilike.%${filtros.busqueda}%,titulo.ilike.%${filtros.busqueda}%`);
        }
        query = query.order('created_at', { ascending: false });
        return await query;
    },

    async getById(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const col = this._getStoredColecciones().find(c => c.id === id);
            return { data: col || null, error: col ? null : 'Colección no encontrada' };
        }
        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.COLECCIONES_VIP).select('*').eq('id', id).single();
    },

    async create(coleccionData) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            const nueva = {
                id: 'col-' + Date.now(),
                ...coleccionData,
                created_at: new Date().toISOString()
            };
            const cols = this._getStoredColecciones();
            cols.unshift(nueva);
            this._saveStoredColecciones(cols);
            return { data: nueva, error: null };
        }

        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.COLECCIONES_VIP).insert(coleccionData).select().single();
    },

    async update(id, updates) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let cols = this._getStoredColecciones();
            const idx = cols.findIndex(c => c.id === id);
            if (idx !== -1) {
                cols[idx] = { ...cols[idx], ...updates, updated_at: new Date().toISOString() };
                this._saveStoredColecciones(cols);
                return { data: cols[idx], error: null };
            }
            return { data: null, error: 'No encontrado' };
        }

        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.COLECCIONES_VIP).update(updates).eq('id', id).select().single();
    },

    async delete(id) {
        if (APP_CONFIG.USE_MOCK_DATA) {
            let cols = this._getStoredColecciones();
            cols = cols.filter(c => c.id !== id);
            this._saveStoredColecciones(cols);
            return { error: null };
        }

        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.COLECCIONES_VIP).delete().eq('id', id);
    }
};

// ============================================
// SERVICIO DE PERFIL & SEGURIDAD DEL ASESOR
// ============================================
const PerfilService = {

    _getCachedUser() {
        try {
            return JSON.parse(localStorage.getItem('maximus_user')) || null;
        } catch(e) {
            return null;
        }
    },

    _saveCachedUser(user) {
        try {
            localStorage.setItem('maximus_user', JSON.stringify(user));
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
     * Enviar código de verificación 2FA (OTP 6 dígitos) vía WhatsApp o Correo mediante n8n.
     */
    async enviarCodigo2FA(phone, method = 'whatsapp') {
        const otpCode = Math.floor(100000 + Math.random() * 900000).toString();
        sessionStorage.setItem('maximus_2fa_temp_code', otpCode);
        sessionStorage.setItem('maximus_2fa_temp_expiry', (Date.now() + 5 * 60 * 1000).toString());

        const user = this._getCachedUser();

        // Disparar Webhook n8n para enviar el mensaje real por WhatsApp o Email
        if (window.N8nService) {
            await N8nService.trigger('AUTH_VERIFICACION_2FA', {
                codigo: otpCode,
                metodo: method,
                telefono: phone || user?.telefono,
                email: user?.email,
                nombre: user?.name,
                validez_minutos: 5
            });
        }

        return { success: true, code: otpCode };
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
            return { success: false, error: 'El código ha expirado (validez: 5 minutos). Solicita otro código.' };
        }
        if (codigoIngresado.trim() !== storedCode) {
            return { success: false, error: 'Código incorrecto. Verifica los 6 dígitos recibidos.' };
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
        if (APP_CONFIG.USE_MOCK_DATA) {
            const nuevo = {
                id: 'eq-' + Date.now().toString().slice(-6),
                nombre: miembroData.nombre || 'Nuevo Asesor',
                cargo: miembroData.cargo || 'Asesor Inmobiliario',
                email: miembroData.email || '',
                telefono: miembroData.telefono || '',
                whatsapp: miembroData.whatsapp || (miembroData.telefono ? miembroData.telefono.replace(/\D/g, '') : ''),
                foto_url: miembroData.foto_url || 'https://images.unsplash.com/photo-1560250097-0b93528c311a?w=600&q=80',
                orden: parseInt(miembroData.orden || ((MOCK_DATA.equipo_web || []).length + 1), 10),
                mostrar_en_web: miembroData.mostrar_en_web !== undefined ? miembroData.mostrar_en_web : true,
                activo: true,
                bio: miembroData.bio || '',
                created_at: new Date().toISOString()
            };
            if (!MOCK_DATA.equipo_web) MOCK_DATA.equipo_web = [];
            MOCK_DATA.equipo_web.push(nuevo);
            return { data: nuevo, error: null };
        }

        const sb = getSupabase();
        const tabla = (APP_CONFIG.TABLES && APP_CONFIG.TABLES.EQUIPO_WEB) ? APP_CONFIG.TABLES.EQUIPO_WEB : 'equipo_web';
        return await sb.from(tabla).insert(miembroData).select().single();
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

        const sb = getSupabase();
        let query = sb.from(APP_CONFIG.TABLES.ASESORES_MAXIMUS).select('*');
        if (filtros.activo !== undefined) query = query.eq('activo', filtros.activo);
        if (filtros.busqueda) query = query.ilike('nombre', `%${filtros.busqueda}%`);
        query = query.order('orden', { ascending: true });
        return await query;
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
        if (APP_CONFIG.USE_MOCK_DATA) {
            const list = this._getLocal();
            const nuevo = {
                id: 'asesor-' + Date.now(),
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
            return { data: nuevo, error: null };
        }

        const sb = getSupabase();
        return await sb.from(APP_CONFIG.TABLES.ASESORES_MAXIMUS).insert([asesorData]).select().single();
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
}

