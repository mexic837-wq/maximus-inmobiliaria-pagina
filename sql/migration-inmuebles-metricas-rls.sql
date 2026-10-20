-- ==============================================================================
-- MAXIMUS INMOBILIARIA - RLS POLICIES PARA INMUEBLES & MÉTRICAS DEL PORTAFOLIO
-- ==============================================================================
-- Ejecuta este script en Supabase SQL Editor si deseas habilitar la lectura y
-- escritura pública completa de la tabla de inmuebles para sincronizar el Dashboard.
-- ==============================================================================

-- 1. Asegurar tabla inmuebles
CREATE TABLE IF NOT EXISTS public.inmuebles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
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
    agente_id UUID,
    asesor_id TEXT,
    asesor_nombre TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. Habilitar RLS
ALTER TABLE public.inmuebles ENABLE ROW LEVEL SECURITY;

-- 3. Limpiar políticas anteriores restrictivas
DROP POLICY IF EXISTS "Inmuebles: acceso total public" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: lectura publica de disponibles" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: insertar auth" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: actualizar propios o admin" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: lectura publica" ON public.inmuebles;

-- 4. Crear política pública permisiva (Lectura y Escritura para sincronización instantánea)
CREATE POLICY "Inmuebles: acceso total public" ON public.inmuebles
    FOR ALL TO public USING (true) WITH CHECK (true);

-- 5. Recargar esquema de PostgREST
NOTIFY pgrst, 'reload schema';
