-- ==============================================================================
-- MIGRACIÓN: POLÍTICAS RLS PARA ASESORES MAXIMUS
-- Ejecutar en el SQL Editor de Supabase para permitir guardar y editar asesores sin error 401
-- ==============================================================================

-- 1. Asegurar tabla asesores_maximus
CREATE TABLE IF NOT EXISTS public.asesores_maximus (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL,
    cargo TEXT NOT NULL,
    especialidad TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    whatsapp TEXT,
    avatar TEXT,
    rating NUMERIC(3,1) DEFAULT 5.0,
    cierres INT DEFAULT 0,
    badge_texto TEXT DEFAULT 'Asesor Certificado',
    destacado BOOLEAN DEFAULT false,
    activo BOOLEAN DEFAULT true,
    orden INT DEFAULT 1,
    bio TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar RLS
ALTER TABLE public.asesores_maximus ENABLE ROW LEVEL SECURITY;

-- 3. Limpiar políticas anteriores
DROP POLICY IF EXISTS "Asesores Maximus: lectura publica" ON public.asesores_maximus;
DROP POLICY IF EXISTS "Asesores Maximus: modificar auth" ON public.asesores_maximus;
DROP POLICY IF EXISTS "Asesores Maximus: modificacion total" ON public.asesores_maximus;
DROP POLICY IF EXISTS "Asesores Maximus: insercion publica" ON public.asesores_maximus;
DROP POLICY IF EXISTS "Asesores Maximus: actualizacion publica" ON public.asesores_maximus;
DROP POLICY IF EXISTS "Asesores Maximus: eliminacion publica" ON public.asesores_maximus;

-- 4. Permitir lectura pública a cualquier usuario o visitante
CREATE POLICY "Asesores Maximus: lectura publica" ON public.asesores_maximus
    FOR SELECT USING (true);

-- 5. Permitir inserción, actualización y eliminación completa para administración
CREATE POLICY "Asesores Maximus: modificacion total" ON public.asesores_maximus
    FOR ALL TO public
    USING (true)
    WITH CHECK (true);
