/**
 * ============================================
 * MAXIMUS - Datos Mock (Ficticios)
 * ============================================
 * 
 * Contiene TODOS los datos de prueba para desarrollo local.
 * Cuando conectes Supabase, estos datos ya no se usarán.
 * 
 * Estructura diseñada para replicar exactamente las tablas
 * de Supabase que crearás después.
 */

const MOCK_DATA = {

    // ===== INMUEBLES =====
    inmuebles: [
        {
            id: 'inm-001',
            titulo: 'Quinta moderna con piscina y jardín',
            descripcion: 'Hermosa quinta en excelente ubicación, con acabados de primera.',
            precio: 270000,
            moneda: 'USD',
            operacion: 'venta',       // 'venta' | 'alquiler'
            tipo: 'casa',             // 'casa' | 'apartamento' | 'local' | 'terreno' | 'oficina'
            estatus: 'disponible',    // 'disponible' | 'reservado' | 'vendido' | 'alquilado'
            ubicacion: 'Urbanización Guaparo, San Cristóbal',
            estado: 'Táchira',
            habitaciones: 4,
            banos: 3,
            metros_cuadrados: 350,
            foto_principal: 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
            fotos: [],
            en_oferta: true,
            // Datos privados (solo agentes)
            propietario_nombre: 'Manuel Rodríguez',
            propietario_telefono: '+58 424-1234567',
            comision_porcentaje: 5,
            notas_privadas: 'Las llaves las tiene el conserje. No mostrar los domingos.',
            agente_id: 'mock-agente-001',
            created_at: '2024-09-15T10:00:00Z',
        },
        {
            id: 'inm-002',
            titulo: 'Local comercial Nivel Feria',
            descripcion: 'Excelente ubicación en centro comercial de alto tráfico.',
            precio: 1500,
            moneda: 'USD',
            operacion: 'alquiler',
            tipo: 'local',
            estatus: 'disponible',
            ubicacion: 'C.C. Sambil, Nivel Feria',
            estado: 'Táchira',
            habitaciones: 0,
            banos: 1,
            metros_cuadrados: 80,
            foto_principal: null, // SIN FOTO
            fotos: [],
            en_oferta: false,
            propietario_nombre: 'Inversiones ABC C.A.',
            propietario_telefono: '+58 412-9876543',
            comision_porcentaje: 8,
            notas_privadas: 'Precio negociable por contrato largo.',
            agente_id: 'mock-agente-001',
            created_at: '2024-10-01T14:30:00Z',
        },
        {
            id: 'inm-003',
            titulo: 'Apartamento amoblado piso medio',
            descripcion: 'Completamente amoblado, listo para mudarse. Vista panorámica.',
            precio: 120000,
            moneda: 'USD',
            operacion: 'venta',
            tipo: 'apartamento',
            estatus: 'reservado',
            ubicacion: 'Residencias El Bosque, Piso 8',
            estado: 'Táchira',
            habitaciones: 2,
            banos: 2,
            metros_cuadrados: 110,
            foto_principal: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80',
            fotos: [],
            en_oferta: false,
            propietario_nombre: 'Dra. Carmen López',
            propietario_telefono: '+58 416-3334455',
            comision_porcentaje: 4,
            notas_privadas: 'La propietaria viaja frecuente, coordinar con anticipación.',
            agente_id: 'mock-agente-001',
            created_at: '2024-08-20T09:15:00Z',
        },
    ],

    // ===== LEADS / CLIENTES =====
    leads: [
        {
            id: 'lead-001',
            nombre: 'María Antonieta Rojas',
            telefono: '+58 424-1234567',
            email: 'maria.rojas@email.com',
            inmueble_interes_id: 'inm-001',
            inmueble_interes_titulo: 'Quinta moderna con piscina y jardín',
            origen: 'whatsapp',       // 'web' | 'whatsapp' | 'meta_ads' | 'referido' | 'llamada'
            estatus: 'nuevo',         // 'nuevo' | 'contactado' | 'en_negociacion' | 'cerrado' | 'descartado'
            notas: 'Busca algo con piscina para su familia.',
            agente_id: 'mock-agente-001',
            created_at: '2024-10-06T08:00:00Z',
        },
        {
            id: 'lead-002',
            nombre: 'Dr. Fernando Gómez',
            telefono: '+58 414-7654321',
            email: 'fgomez@clinica.com',
            inmueble_interes_id: 'inm-003',
            inmueble_interes_titulo: 'Apartamento amoblado piso medio',
            origen: 'meta_ads',
            estatus: 'en_negociacion',
            notas: 'Interesado en invertir, puede pagar de contado.',
            agente_id: 'mock-agente-001',
            created_at: '2024-10-06T09:30:00Z',
        },
        {
            id: 'lead-003',
            nombre: 'Inversiones Andinas CA',
            telefono: '+58 212-5551234',
            email: 'contacto@andinasca.com',
            inmueble_interes_id: 'inm-002',
            inmueble_interes_titulo: 'Local comercial Nivel Feria',
            origen: 'web',
            estatus: 'contactado',
            notas: 'Empresa que busca local para franquicia.',
            agente_id: 'mock-agente-001',
            created_at: '2024-10-05T16:00:00Z',
        },
    ],

    // ===== CITAS / AGENDA =====
    citas: [
        {
            id: 'cita-001',
            titulo: 'Mostrar Inmueble',
            inmueble_id: 'inm-003',
            inmueble_titulo: 'Apto. Centro',
            lead_id: 'lead-002',
            lead_nombre: 'Luis Pérez',
            fecha: '2024-10-06',
            hora: '10:00',
            tipo: 'visita',           // 'visita' | 'firma' | 'reunion' | 'llamada'
            notas: 'Cliente puntual, llegar 15 min antes.',
            agente_id: 'mock-agente-001',
        },
        {
            id: 'cita-002',
            titulo: 'Firma de Reserva',
            inmueble_id: 'inm-001',
            inmueble_titulo: 'Quinta Paramillo',
            lead_id: null,
            lead_nombre: 'Notaría 2da',
            fecha: '2024-10-06',
            hora: '15:30',
            tipo: 'firma',
            notas: 'Llevar 3 copias del contrato.',
            agente_id: 'mock-agente-001',
        },
    ],

    // ===== PAGOS =====
    pagos: [
        {
            id: 'pago-001',
            fecha: '2024-10-01',
            metodo: 'efectivo',       // 'efectivo' | 'transferencia' | 'crypto' | 'paypal'
            referencia: 'REF-00123',
            monto: 25.00,
            moneda: 'USD',
            estado: 'acreditado',     // 'acreditado' | 'pendiente' | 'rechazado'
            agente_id: 'mock-agente-001',
        },
        {
            id: 'pago-002',
            fecha: '2024-09-01',
            metodo: 'crypto',
            referencia: 'TX-99881A',
            monto: 25.00,
            moneda: 'USD',
            estado: 'acreditado',
            agente_id: 'mock-agente-001',
        },
        {
            id: 'pago-003',
            fecha: '2024-08-01',
            metodo: 'transferencia',
            referencia: '001299994',
            monto: 25.00,
            moneda: 'USD',
            estado: 'acreditado',
            agente_id: 'mock-agente-001',
        },
    ],

    // ===== DOCUMENTOS =====
    documentos: [
        {
            id: 'doc-001',
            titulo: 'Modelo Contrato Compra-Venta 2024',
            tipo_archivo: 'pdf',
            categoria: 'legal',
            tamano_kb: 245,
            url: '#',
            updated_at: '2024-10-04',
        },
        {
            id: 'doc-002',
            titulo: 'Recibo de Reserva de Inmueble',
            tipo_archivo: 'pdf',
            categoria: 'administrativo',
            tamano_kb: 120,
            url: '#',
            updated_at: '2024-10-10',
        },
    ],

    // ===== VENDIDOS GLOBAL (Histórico) =====
    vendidos_global: [
        {
            id: 'vg-001',
            titulo: 'Quinta en Paramillo',
            precio_final: 410000,
            moneda: 'USD',
            operacion_cerrada: 'vendido',
            ubicacion: 'San Cristóbal, Táchira',
            foto: 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=600&q=80',
            fecha_cierre: '2023-10-15',
        },
        {
            id: 'vg-002',
            titulo: 'Apto Las Pilas',
            precio_final: 1100,
            moneda: 'USD',
            operacion_cerrada: 'alquilado',
            ubicacion: 'Pueblo Nuevo',
            foto: 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&q=80',
            fecha_cierre: '2023-09-02',
        },
    ],

    // ===== MÉTRICAS (KPIs) =====
    metricas: {
        total_propiedades: 45,
        en_venta: 32,
        en_alquiler: 13,
        leads_nuevos_mes: 12,
        vistas_web: 1402,
        cierres_mes: 3,
        total_cerrados_global: 1240,
        total_vendidos_global: 850,
        total_alquilados_global: 390,
        distribucion_tipo: {
            casa: 55,
            apartamento: 25,
            local: 20,
        },
    },

    // ===== ZONAS Y PRECIOS POR M² (Cotizador Inmobiliario) =====
    zonas_cotizador: [
        { id: 'zc-001', nombre: 'Pueblo Nuevo', municipio: 'San Cristóbal', precio_m2_base: 780, precio_min_m2: 700, precio_max_m2: 900, factor_casa: 1.05, factor_apartamento: 1.00, factor_terreno: 0.65, factor_local: 1.30 },
        { id: 'zc-002', nombre: 'Barrio Obrero', municipio: 'San Cristóbal', precio_m2_base: 720, precio_min_m2: 650, precio_max_m2: 850, factor_casa: 1.05, factor_apartamento: 1.00, factor_terreno: 0.60, factor_local: 1.40 },
        { id: 'zc-003', nombre: 'Urbanización Guaparo', municipio: 'San Cristóbal', precio_m2_base: 850, precio_min_m2: 750, precio_max_m2: 980, factor_casa: 1.08, factor_apartamento: 1.00, factor_terreno: 0.70, factor_local: 1.25 },
        { id: 'zc-004', nombre: 'Los Pirineos / Pirineos II', municipio: 'San Cristóbal', precio_m2_base: 650, precio_min_m2: 580, precio_max_m2: 750, factor_casa: 1.05, factor_apartamento: 1.00, factor_terreno: 0.55, factor_local: 1.20 },
        { id: 'zc-005', nombre: 'Paramillo / Altos de Paramillo', municipio: 'San Cristóbal', precio_m2_base: 700, precio_min_m2: 620, precio_max_m2: 820, factor_casa: 1.05, factor_apartamento: 1.00, factor_terreno: 0.60, factor_local: 1.25 },
        { id: 'zc-006', nombre: 'La Castellana', municipio: 'San Cristóbal', precio_m2_base: 680, precio_min_m2: 600, precio_max_m2: 780, factor_casa: 1.05, factor_apartamento: 1.00, factor_terreno: 0.58, factor_local: 1.20 },
        { id: 'zc-007', nombre: 'Centro de San Cristóbal', municipio: 'San Cristóbal', precio_m2_base: 550, precio_min_m2: 480, precio_max_m2: 650, factor_casa: 1.00, factor_apartamento: 1.00, factor_terreno: 0.50, factor_local: 1.50 },
        { id: 'zc-008', nombre: 'La Concordia', municipio: 'San Cristóbal', precio_m2_base: 500, precio_min_m2: 430, precio_max_m2: 580, factor_casa: 1.00, factor_apartamento: 1.00, factor_terreno: 0.50, factor_local: 1.35 },
        { id: 'zc-009', nombre: 'Táriba', municipio: 'Cárdenas', precio_m2_base: 450, precio_min_m2: 380, precio_max_m2: 540, factor_casa: 1.02, factor_apartamento: 1.00, factor_terreno: 0.50, factor_local: 1.25 },
        { id: 'zc-010', nombre: 'Palmira', municipio: 'Guásimos', precio_m2_base: 420, precio_min_m2: 360, precio_max_m2: 500, factor_casa: 1.05, factor_apartamento: 1.00, factor_terreno: 0.55, factor_local: 1.20 },
        { id: 'zc-011', nombre: 'Rubio', municipio: 'Junín', precio_m2_base: 400, precio_min_m2: 340, precio_max_m2: 480, factor_casa: 1.00, factor_apartamento: 1.00, factor_terreno: 0.45, factor_local: 1.20 },
        { id: 'zc-012', nombre: 'La Grita', municipio: 'Jáuregui', precio_m2_base: 380, precio_min_m2: 320, precio_max_m2: 460, factor_casa: 1.00, factor_apartamento: 1.00, factor_terreno: 0.45, factor_local: 1.20 },
    ],
};

// Exportar
if (typeof window !== 'undefined') {
    window.MOCK_DATA = MOCK_DATA;
}
