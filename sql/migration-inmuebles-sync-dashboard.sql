-- ==============================================================================
-- MAXIMUS INMOBILIARIA - SINCRONIZACIÓN 100% TABLA INMUEBLES CON EL DASHBOARD
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de tu consola Supabase.
-- Sincroniza exactamente los 6 inmuebles oficiales del catálogo del Dashboard
-- con soporte total de RLS pública (Lectura y Escritura instantánea).
-- ==============================================================================

-- 1. Crear / Asegurar estructura de la tabla inmuebles
CREATE TABLE IF NOT EXISTS public.inmuebles (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    precio NUMERIC(14,2) DEFAULT 0,
    moneda TEXT DEFAULT 'USD',
    operacion TEXT DEFAULT 'venta',
    tipo TEXT DEFAULT 'casa',
    estatus TEXT DEFAULT 'disponible',
    ubicacion TEXT,
    estado TEXT DEFAULT 'Táchira',
    habitaciones INT DEFAULT 0,
    banos NUMERIC(3,1) DEFAULT 0,
    metros_cuadrados NUMERIC(10,2) DEFAULT 0,
    estacionamientos INT DEFAULT 0,
    foto_principal TEXT,
    fotos TEXT[] DEFAULT '{}',
    is_maximus BOOLEAN DEFAULT false,
    en_oferta BOOLEAN DEFAULT false,
    codigo TEXT,
    subtitulo TEXT,
    sector_nombre TEXT,
    sector_desc TEXT,
    comision_porcentaje NUMERIC(5,2) DEFAULT 5.00,
    asesor_nombre TEXT,
    asesor_telefono TEXT,
    propietario_nombre TEXT,
    propietario_telefono TEXT,
    notas_privadas TEXT,
    orden INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Habilitar RLS total y permisos públicos
ALTER TABLE public.inmuebles ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Inmuebles: acceso total public" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: lectura publica de disponibles" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: insertar auth" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: actualizar propios o admin" ON public.inmuebles;

CREATE POLICY "Inmuebles: acceso total public" ON public.inmuebles
    FOR ALL TO public USING (true) WITH CHECK (true);

-- 3. Insertar / Actualizar los 6 inmuebles oficiales del Dashboard
INSERT INTO public.inmuebles (
    id, codigo, titulo, descripcion, precio, moneda, operacion, tipo, estatus,
    ubicacion, estado, habitaciones, banos, metros_cuadrados, foto_principal,
    fotos, is_maximus, en_oferta, asesor_nombre, asesor_telefono, comision_porcentaje, orden
)
VALUES
    (
        'inm-001',
        'MAX-001',
        'Quinta moderna con piscina y jardín',
        'Exclusiva quinta en excelente urbanismo privado con piscina, acabados de primera y amplias áreas verdes.',
        270000.00,
        'USD',
        'venta',
        'casa',
        'disponible',
        'Urbanización Guaparo, San Cristóbal',
        'Táchira',
        4,
        3.0,
        350.00,
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
        ARRAY[
            'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80',
            'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=800&q=80',
            'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80',
            'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
            'https://images.unsplash.com/photo-1613977257363-707ba9348227?w=800&q=80'
        ],
        true,
        true,
        'José Guerrero',
        '+58 424-7835697',
        5.00,
        1
    ),
    (
        'inm-002',
        'MAX-002',
        'Local comercial Nivel Feria',
        'Excelente local en pasillo principal de feria gastronómica con alto flujo garantizado y mezanina para oficinas.',
        1500.00,
        'USD',
        'alquiler',
        'local',
        'disponible',
        'C.C. Sambil, San Cristóbal',
        'Táchira',
        1,
        1.0,
        80.00,
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80',
        ARRAY[
            'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80',
            'https://images.unsplash.com/photo-1560448204-e02f11c3d0e2?w=800&q=80'
        ],
        false,
        false,
        'Carlos Santander',
        '+58 424-1234567',
        8.00,
        2
    ),
    (
        'inm-003',
        'MAX-003',
        'Apartamento amoblado piso medio',
        'Completamente amoblado con acabados de mármol, vista panorámica a la ciudad y planta eléctrica 100%.',
        120000.00,
        'USD',
        'venta',
        'apartamento',
        'disponible',
        'Residencias El Bosque, San Cristóbal',
        'Táchira',
        2,
        2.0,
        110.00,
        'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80',
        ARRAY[
            'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80',
            'https://images.unsplash.com/photo-1502672260266-1c1ef2d93688?w=800&q=80'
        ],
        true,
        false,
        'Valeria Méndez',
        '+58 414-2223344',
        4.00,
        3
    ),
    (
        'inm-004',
        'MAX-004',
        'Penthouse Dúplex con Terraza 360°',
        'Exclusivo penthouse de doble altura con terraza privada panorámica de 360 grados, jacuzzi y 4 puestos de estacionamiento techados.',
        340000.00,
        'USD',
        'venta',
        'apartamento',
        'disponible',
        'Pueblo Nuevo, San Cristóbal',
        'Táchira',
        4,
        4.0,
        290.00,
        'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80',
        ARRAY[
            'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80',
            'https://images.unsplash.com/photo-1600566753190-17f0baa2a6c3?w=800&q=80'
        ],
        true,
        true,
        'Carlos Santander',
        '+58 424-1234567',
        5.00,
        4
    ),
    (
        'inm-005',
        'MAX-005',
        'Townhouse a estrenar en conjunto cerrado',
        'Moderno townhouse por estrenar con vigilancia privada 24/7, tanque subterráneo y excelente distribución en zona de alta revalorización.',
        95000.00,
        'USD',
        'venta',
        'townhouse',
        'disponible',
        'Paramillo, San Cristóbal',
        'Táchira',
        3,
        3.0,
        160.00,
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
        ARRAY[
            'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=800&q=80',
            'https://images.unsplash.com/photo-1600585154526-990dced4db0d?w=800&q=80'
        ],
        false,
        false,
        'José Guerrero',
        '+58 424-7835697',
        5.00,
        5
    ),
    (
        'inm-006',
        'MAX-006',
        'Galpón Corporativo y Oficinas AAA',
        'Complejo industrial y corporativo con galpón de almacenamiento de doble altura, oficinas ejecutivas y patio de maniobras para carga pesada.',
        3200.00,
        'USD',
        'alquiler',
        'local',
        'disponible',
        'Zona Industrial Barrancas, San Cristóbal',
        'Táchira',
        2,
        4.0,
        850.00,
        'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&q=80',
        ARRAY[
            'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=800&q=80'
        ],
        true,
        false,
        'Andrea Colmenares',
        '+58 412-5556677',
        10.00,
        6
    )
ON CONFLICT (id) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    descripcion = EXCLUDED.descripcion,
    precio = EXCLUDED.precio,
    operacion = EXCLUDED.operacion,
    tipo = EXCLUDED.tipo,
    estatus = EXCLUDED.estatus,
    ubicacion = EXCLUDED.ubicacion,
    habitaciones = EXCLUDED.habitaciones,
    banos = EXCLUDED.banos,
    metros_cuadrados = EXCLUDED.metros_cuadrados,
    foto_principal = EXCLUDED.foto_principal,
    fotos = EXCLUDED.fotos,
    is_maximus = EXCLUDED.is_maximus,
    en_oferta = EXCLUDED.en_oferta,
    asesor_nombre = EXCLUDED.asesor_nombre,
    asesor_telefono = EXCLUDED.asesor_telefono,
    orden = EXCLUDED.orden,
    updated_at = now();

-- 4. Notificar a PostgREST
NOTIFY pgrst, 'reload schema';
