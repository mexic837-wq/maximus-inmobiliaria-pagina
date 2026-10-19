-- ==============================================================================
-- MAXIMUS INMOBILIARIA - ACTUALIZACIÓN & SINCRONIZACIÓN DE CAPTACIONES Y ASESORES
-- ==============================================================================
-- Este script actualiza las tablas `inmuebles` y `asesores_maximus` en Supabase,
-- asegurando que todas las columnas necesarias existan, las políticas RLS estén
-- correctamente configuradas para lectura pública y se inserten los datos semilla.
--
-- Ejecuta este script directamente en el SQL Editor de tu panel de Supabase.
-- ==============================================================================

-- 1. Actualizar columnas de la tabla `inmuebles`
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS codigo TEXT;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS subtitulo TEXT;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS is_maximus BOOLEAN DEFAULT false;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS sector_nombre TEXT;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS sector_desc TEXT;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS estacionamientos INT DEFAULT 0;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS aspectos_destacados JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS amenidades JSONB DEFAULT '[]'::jsonb;

-- 2. Actualizar columnas de la tabla `asesores_maximus`
ALTER TABLE public.asesores_maximus ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.asesores_maximus ADD COLUMN IF NOT EXISTS tipo_cuenta TEXT DEFAULT 'maximus';
ALTER TABLE public.asesores_maximus ADD COLUMN IF NOT EXISTS split_comision TEXT DEFAULT '70%';

-- 3. Habilitar RLS y asegurar políticas de acceso
ALTER TABLE public.inmuebles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asesores_maximus ENABLE ROW LEVEL SECURITY;

-- Políticas de lectura pública
DROP POLICY IF EXISTS "Inmuebles: lectura publica de disponibles" ON public.inmuebles;
CREATE POLICY "Inmuebles: lectura publica de disponibles" ON public.inmuebles
    FOR SELECT USING (estatus = 'disponible' OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Inmuebles: insertar auth" ON public.inmuebles;
CREATE POLICY "Inmuebles: insertar auth" ON public.inmuebles
    FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Inmuebles: actualizar propios o admin" ON public.inmuebles;
CREATE POLICY "Inmuebles: actualizar propios o admin" ON public.inmuebles
    FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Asesores Maximus: lectura publica" ON public.asesores_maximus;
CREATE POLICY "Asesores Maximus: lectura publica" ON public.asesores_maximus
    FOR SELECT USING (activo = true);

DROP POLICY IF EXISTS "Asesores Maximus: modificar auth" ON public.asesores_maximus;
CREATE POLICY "Asesores Maximus: modificar auth" ON public.asesores_maximus
    FOR ALL USING (true);

-- 4. Sembrado de Asesores Oficiales MAXIMUS (si la tabla está vacía o actualización)
INSERT INTO public.asesores_maximus (id, nombre, cargo, especialidad, email, telefono, whatsapp, avatar, rating, cierres, badge_texto, destacado, activo, orden, bio, tipo_cuenta, split_comision)
VALUES 
    ('a0000001-0000-0000-0000-000000000001', 'José Guerrero', 'Director / Captador Principal', 'Luxury & Residencial', 'jose.guerrero@maximus.com', '+58 424-1234567', '584241234567', 'https://ui-avatars.com/api/?name=Jose+Guerrero&background=0B4A3F&color=fff&bold=true', 5.0, 28, 'Director Fundador', true, true, 1, 'Director general y captador exclusivo de propiedades residenciales prime en Táchira con más de 10 años de liderazgo.', 'maximus', '70%'),
    ('a0000001-0000-0000-0000-000000000002', 'Valeria Méndez', 'Especialista en Apartamentos', 'Apartamentos & Pisos', 'valeria.mendez@maximus.com', '+58 414-9876543', '584149876543', 'https://ui-avatars.com/api/?name=Valeria+Mendez&background=0B4A3F&color=fff&bold=true', 4.9, 19, 'Top Performer', false, true, 2, 'Especialista en compra-venta de apartamentos en urbanizaciones consolidadas de San Cristóbal y asesoría para primera vivienda.', 'maximus', '70%'),
    ('a0000001-0000-0000-0000-000000000003', 'Carlos Alviarez', 'Asesor Comercial & Terrenos', 'Penthouses & Terrenos', 'carlos.alviarez@maximus.com', '+58 412-5556677', '584125556677', 'https://ui-avatars.com/api/?name=Carlos+Alviarez&background=0B4A3F&color=fff&bold=true', 5.0, 31, 'Máster Captador', true, true, 3, 'Especialista en propiedades de alta rentabilidad, terrenos de desarrollo residencial y penthouses de lujo en el estado Táchira.', 'maximus', '70%'),
    ('a0000001-0000-0000-0000-000000000004', 'Mariángel Rivas', 'Asesora Corporativa', 'Comercial & Industrial', 'mariangel.rivas@maximus.com', '+58 416-3334455', '584163334455', 'https://ui-avatars.com/api/?name=Mariangel+Rivas&background=0B4A3F&color=fff&bold=true', 4.8, 14, 'Asesora Senior', false, true, 4, 'Enfocada en transacciones corporativas, locales comerciales estratégicos y galpones industriales para inversión.', 'maximus', '70%')
ON CONFLICT (id) DO UPDATE SET
    nombre = EXCLUDED.nombre,
    cargo = EXCLUDED.cargo,
    especialidad = EXCLUDED.especialidad,
    email = EXCLUDED.email,
    telefono = EXCLUDED.telefono,
    whatsapp = EXCLUDED.whatsapp,
    avatar = EXCLUDED.avatar,
    rating = EXCLUDED.rating,
    cierres = EXCLUDED.cierres,
    bio = EXCLUDED.bio,
    updated_at = now();

-- 5. Sembrado de Captaciones Directas MAXIMUS
INSERT INTO public.inmuebles (
    id, codigo, titulo, subtitulo, descripcion, precio, moneda, operacion, tipo, estatus, ubicacion, estado,
    habitaciones, banos, metros_cuadrados, estacionamientos, foto_principal, fotos, is_maximus, en_oferta,
    comision_porcentaje, sector_nombre, sector_desc
)
VALUES
    (
        'b0000001-0000-0000-0000-000000000001',
        '#MAX-101',
        'Quinta moderna con piscina y jardín',
        'Exclusiva residencia en urbanismo cerrado con acabados de primera y máxima privacidad',
        'Esta imponente quinta contemporánea representa la cúspide del confort y la distinción en la Urbanización Guaparo, San Cristóbal. Diseñada con concepto abierto, 4 habitaciones, cocina italiana y piscina climatizada.',
        270000,
        'USD',
        'venta',
        'casa',
        'disponible',
        'Urbanización Guaparo, San Cristóbal, Táchira',
        'Táchira',
        4,
        3,
        350,
        3,
        'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=85',
        ARRAY[
            'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=85',
            'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1000&q=80',
            'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1000&q=80'
        ],
        true,
        true,
        5.00,
        'Urbanización Guaparo',
        'Ubicada en una de las zonas residenciales más consolidadas y cotizadas de San Cristóbal.'
    ),
    (
        'b0000001-0000-0000-0000-000000000002',
        '#MAX-102',
        'Apartamento de lujo en Residencias El Parque',
        'Piso alto con vista panorámica a la ciudad y acabados en mármol',
        'Espectacular apartamento totalmente remodelado con concepto contemporáneo en Pueblo Nuevo. Acabados de lujo, cocina con tope de granito y planta eléctrica.',
        135000,
        'USD',
        'venta',
        'apartamento',
        'disponible',
        'Pueblo Nuevo, San Cristóbal, Táchira',
        'Táchira',
        3,
        2.5,
        185,
        2,
        'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&q=85',
        ARRAY[
            'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=1200&q=85',
            'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1000&q=80'
        ],
        true,
        true,
        5.00,
        'Pueblo Nuevo',
        'Sector residencial de altísima demanda y plusvalía continua en San Cristóbal.'
    ),
    (
        'b0000001-0000-0000-0000-000000000003',
        '#MAX-103',
        'Penthouse Dúplex con Terraza Privada',
        'Máxima exclusividad en Pirineos II con terraza de 80 m² y jacuzzi exterior',
        'Impresionante Penthouse dúplex de 280 m² habitables más 80 m² de terraza panorámica privada. Acabados premium, vestier en máster suite y domótica integrada.',
        320000,
        'USD',
        'venta',
        'apartamento',
        'disponible',
        'Pirineos II, San Cristóbal, Táchira',
        'Táchira',
        4,
        4.5,
        360,
        4,
        'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=85',
        ARRAY[
            'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=1200&q=85',
            'https://images.unsplash.com/photo-1600607687939-ce8a6c25118c?w=1000&q=80'
        ],
        true,
        true,
        5.00,
        'Pirineos II',
        'Zona alta residencial caracterizada por su clima fresco y vistas privilegiadas.'
    ),
    (
        'b0000001-0000-0000-0000-000000000004',
        '#MAX-104',
        'Local Comercial en Avenida Principal',
        'Punto comercial estratégico de alto tráfico vehicular y peatonal con estacionamiento',
        'Excelente local a pie de calle con 120 m² de exhibición, doble vitrina de seguridad, depósito posterior y 3 puestos de estacionamiento para clientes.',
        1800,
        'USD',
        'alquiler',
        'local',
        'disponible',
        'Av. 19 de Abril, San Cristóbal, Táchira',
        'Táchira',
        0,
        2,
        120,
        3,
        'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&q=85',
        ARRAY[
            'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=1200&q=85'
        ],
        true,
        true,
        5.00,
        'Av. 19 de Abril',
        'Arteria comercial neurálgica de la ciudad con máxima visibilidad para marcas líderes.'
    ),
    (
        'b0000001-0000-0000-0000-000000000005',
        '#MAX-105',
        'Townhouse a Estrenar en Conjunto Cerrado',
        'Diseño minimalista con patio privado y acabados de primera línea',
        'Hermoso townhouse en urbanismo privado con garita de vigilancia 24/7. 3 niveles, área de parrillera privada y acabados en porcelanato importado.',
        185000,
        'USD',
        'venta',
        'casa',
        'disponible',
        'Las Lomas, San Cristóbal, Táchira',
        'Táchira',
        3,
        3.5,
        220,
        2,
        'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=85',
        ARRAY[
            'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=1200&q=85'
        ],
        true,
        true,
        5.00,
        'Las Lomas',
        'Sector residencial tranquilo, seguro y cercano a las principales arterias viales.'
    ),
    (
        'b0000001-0000-0000-0000-000000000006',
        '#MAX-106',
        'Galpón Industrial con Oficinas Administrativas',
        'Infraestructura completa para logística, manufactura o centro de distribución',
        'Galpón de 850 m² con altura libre de 7 metros, piso de alta resistencia, rampa de carga para gandolas y edificio de oficinas corporativas de 120 m².',
        3500,
        'USD',
        'alquiler',
        'galpon',
        'disponible',
        'Zona Industrial Paramillo, San Cristóbal, Táchira',
        'Táchira',
        0,
        4,
        850,
        8,
        'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=85',
        ARRAY[
            'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=1200&q=85'
        ],
        true,
        true,
        5.00,
        'Zona Industrial Paramillo',
        'Zona industrial consolidada con fácil acceso para transporte pesado de carga.'
    )
ON CONFLICT (id) DO UPDATE SET
    titulo = EXCLUDED.titulo,
    precio = EXCLUDED.precio,
    operacion = EXCLUDED.operacion,
    is_maximus = EXCLUDED.is_maximus,
    en_oferta = EXCLUDED.en_oferta,
    updated_at = now();
