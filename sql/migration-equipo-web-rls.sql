-- ==============================================================================
-- MAXIMUS INMOBILIARIA - MIGRACIÓN SQL: EQUIPO EN WEB (LANDING PAGE)
-- ==============================================================================
-- Ejecuta este script directamente en el "SQL Editor" de tu panel de Supabase.
-- Es 100% seguro e idempotente (se puede ejecutar varias veces sin borrar datos).
-- ==============================================================================

-- 1. TABLA: EQUIPO WEB (Landing Page "Nuestro Equipo")
CREATE TABLE IF NOT EXISTS public.equipo_web (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    nombre TEXT NOT NULL,
    cargo TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    whatsapp TEXT,
    foto_url TEXT NOT NULL,
    orden INT DEFAULT 1,
    mostrar_en_web BOOLEAN DEFAULT true,
    activo BOOLEAN DEFAULT true,
    bio TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Si la tabla ya existía con id UUID, permitir compatibilidad
DO $$ 
BEGIN 
    ALTER TABLE public.equipo_web ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
EXCEPTION 
    WHEN others THEN NULL; 
END $$;

-- 2. TABLA OPCIONAL: SECCIONES WEB (Textos de Cabecera)
CREATE TABLE IF NOT EXISTS public.secciones_web (
    clave TEXT PRIMARY KEY,
    etiqueta TEXT,
    titulo TEXT,
    subtitulo TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 3. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.equipo_web ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.secciones_web ENABLE ROW LEVEL SECURITY;

-- 4. POLÍTICAS DE ACCESO TOTAL PÚBLICO (Lectura, Inserción, Modificación y Eliminación)
DROP POLICY IF EXISTS "Equipo Web: lectura publica" ON public.equipo_web;
DROP POLICY IF EXISTS "Equipo Web: ver todos auth" ON public.equipo_web;
DROP POLICY IF EXISTS "Equipo Web: modificar auth" ON public.equipo_web;
DROP POLICY IF EXISTS "equipo_web_public_all" ON public.equipo_web;

CREATE POLICY "equipo_web_public_all" 
ON public.equipo_web 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

DROP POLICY IF EXISTS "secciones_web_public_all" ON public.secciones_web;
CREATE POLICY "secciones_web_public_all" 
ON public.secciones_web 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- 5. SEMILLA INICIAL: 4 MIEMBROS OFICIALES DE MAXIMUS
INSERT INTO public.equipo_web (id, nombre, cargo, email, telefono, whatsapp, foto_url, orden, mostrar_en_web, activo, bio)
VALUES
    ('eq-001', 'Lic. Eva Camargo', 'Directora Comercial', 'eva.camargo@maximus.com', '+58 424-1234567', '584241234567', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', 1, true, true, 'Líder en estructuración comercial y ventas de residencias exclusivas en Táchira.'),
    ('eq-002', 'Abg. José Guerrero', 'Director Legal', 'jose.guerrero@maximus.com', '+58 414-9876543', '584149876543', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', 2, true, true, 'Especialista en derecho inmobiliario, blindaje de transacciones y contratos de inversión.'),
    ('eq-003', 'María Rodríguez', 'Asesora Inmobiliaria', 'maria.rodriguez@maximus.com', '+58 412-5557890', '584125557890', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', 3, true, true, 'Asesora de alta vocación con amplia cartera en apartamentos de lujo y alquileres diplomáticos.'),
    ('eq-004', 'Carlos Mendoza', 'Asesor de Inversiones', 'carlos.mendoza@maximus.com', '+58 424-7778899', '584247778899', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', 4, true, true, 'Consultor financiero y evaluador de rentabilidad en desarrollos urbanos y terrenos prime.')
ON CONFLICT (id) DO NOTHING;

-- 6. SEMILLA DE TEXTOS DE CABECERA
INSERT INTO public.secciones_web (clave, etiqueta, titulo, subtitulo)
VALUES (
    'nuestro_equipo',
    'NUESTRO EQUIPO',
    'Agentes Expertos a tu Servicio',
    'Profesionales con años de experiencia listos para asesorarte en cada paso de tu inversión.'
)
ON CONFLICT (clave) DO UPDATE SET
    etiqueta = EXCLUDED.etiqueta,
    titulo = EXCLUDED.titulo,
    subtitulo = EXCLUDED.subtitulo,
    updated_at = now();
