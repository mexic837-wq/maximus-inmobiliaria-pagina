-- ==============================================================================
-- MIGRACIÓN: Actualización de Tabla colecciones_vip (Privacidad por Asesor)
-- ==============================================================================

-- 1. Crear tabla si no existe
CREATE TABLE IF NOT EXISTS public.colecciones_vip (
    id TEXT PRIMARY KEY,
    cliente VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    telefono VARCHAR(100),
    titulo VARCHAR(255) NOT NULL,
    nota TEXT,
    fecha VARCHAR(50),
    inmuebles JSONB DEFAULT '[]'::jsonb,
    inmuebles_detalle JSONB DEFAULT '[]'::jsonb,
    asesor_id VARCHAR(100),
    asesor VARCHAR(255),
    asesor_nombre VARCHAR(255),
    asesor_email VARCHAR(255),
    creado_por VARCHAR(100),
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Asegurar que las columnas existan si la tabla ya había sido creada previamente
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS email VARCHAR(255);
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS asesor_email VARCHAR(255);
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS asesor VARCHAR(255);
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS asesor_nombre VARCHAR(255);
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS asesor_id VARCHAR(100);
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS creado_por VARCHAR(100);
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS fecha VARCHAR(50);
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS inmuebles_detalle JSONB DEFAULT '[]'::jsonb;

-- 3. Liberar restricciones de tipo o claves foráneas estrictas si existían
DO $$
BEGIN
    -- Permitir que id sea TEXT
    BEGIN
        ALTER TABLE public.colecciones_vip ALTER COLUMN id TYPE TEXT;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Eliminar FK restrictiva en asesor_id si existía
    BEGIN
        ALTER TABLE public.colecciones_vip DROP CONSTRAINT IF EXISTS colecciones_vip_asesor_id_fkey;
    EXCEPTION WHEN OTHERS THEN NULL;
    END;

    -- Permitir que asesor_id sea VARCHAR/TEXT
    BEGIN
        ALTER TABLE public.colecciones_vip ALTER COLUMN asesor_id TYPE VARCHAR(100);
    EXCEPTION WHEN OTHERS THEN NULL;
    END;
END $$;

-- 4. Índices para acelerar el filtrado por asesor
CREATE INDEX IF NOT EXISTS idx_colecciones_vip_asesor_id ON public.colecciones_vip(asesor_id);
CREATE INDEX IF NOT EXISTS idx_colecciones_vip_asesor_email ON public.colecciones_vip(asesor_email);
CREATE INDEX IF NOT EXISTS idx_colecciones_vip_created_at ON public.colecciones_vip(created_at DESC);

-- 5. Habilitar RLS y recrear políticas sin errores de colisión
ALTER TABLE public.colecciones_vip ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Permitir lectura colecciones_vip" ON public.colecciones_vip;
CREATE POLICY "Permitir lectura colecciones_vip" ON public.colecciones_vip FOR SELECT USING (true);

DROP POLICY IF EXISTS "Permitir insercion colecciones_vip" ON public.colecciones_vip;
CREATE POLICY "Permitir insercion colecciones_vip" ON public.colecciones_vip FOR INSERT WITH CHECK (true);

DROP POLICY IF EXISTS "Permitir actualizacion colecciones_vip" ON public.colecciones_vip;
CREATE POLICY "Permitir actualizacion colecciones_vip" ON public.colecciones_vip FOR UPDATE USING (true);

DROP POLICY IF EXISTS "Permitir eliminacion colecciones_vip" ON public.colecciones_vip;
CREATE POLICY "Permitir eliminacion colecciones_vip" ON public.colecciones_vip FOR DELETE USING (true);

-- 6. Insertar o actualizar datos de prueba con la autoría de cada asesor
INSERT INTO public.colecciones_vip (id, cliente, email, telefono, titulo, nota, fecha, asesor_id, asesor, asesor_nombre, asesor_email, creado_por)
VALUES 
(
    'col-1',
    'Dr. Carlos Mendoza',
    'carlos.mendoza@clinica.com',
    '+58 414-9876543',
    'Selección Exclusiva de Quintas en Guaparo y Pueblo Nuevo',
    'Estimado Dr. Mendoza, he preparado personalmente esta selección de quintas de primer nivel que cumplen con sus requerimientos de privacidad, piscina climatizada y planta eléctrica 100% operativa.',
    '14 Oct 2026',
    'mock-admin-001',
    'José Guerrero',
    'José Guerrero',
    'admin@maximus.com',
    'mock-admin-001'
),
(
    'col-2',
    'Grupo Inmobiliario Los Andes',
    'inversiones@losandes.com',
    '+58 424-5551234',
    'Activos Comerciales & Corporativos de Alta Rentabilidad',
    'Estimado equipo de inversión, adjunto los activos comerciales con mayor flujo peatonal e industrial del Táchira disponibles para arrendamiento inmediato.',
    '12 Oct 2026',
    'asesor-3',
    'Carlos Santander',
    'Carlos Santander',
    'carlos.santander@maximusinmobiliaria.com',
    'asesor-3'
),
(
    'col-3',
    'Arq. Mariana Rivas',
    'mariana.rivas@estudio.com',
    '+58 412-3344556',
    'Residencias Modernas para Confort y Familia',
    'Hola Mariana, te comparto estas dos excelentes opciones residenciales en Paramillo y El Bosque ideales para vivienda familiar de alto estándar.',
    '10 Oct 2026',
    'asesor-2',
    'Valeria Méndez',
    'Valeria Méndez',
    'asesor.maximus@maximus.com',
    'asesor-2'
)
ON CONFLICT (id) DO UPDATE SET
    email = EXCLUDED.email,
    asesor_id = EXCLUDED.asesor_id,
    asesor = EXCLUDED.asesor,
    asesor_nombre = EXCLUDED.asesor_nombre,
    asesor_email = EXCLUDED.asesor_email,
    creado_por = EXCLUDED.creado_por;
