-- ==============================================================================
-- MIGRACIÓN: POLÍTICAS RLS PARA ZONAS Y PRECIOS POR M² (COTIZADOR MAXIMUS)
-- Ejecutar en el SQL Editor de Supabase para permitir lectura y escritura 100% sincronizada
-- ==============================================================================

-- 1. Asegurar que la tabla exista
CREATE TABLE IF NOT EXISTS public.zonas_cotizador (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    municipio TEXT NOT NULL DEFAULT 'San Cristóbal',
    precio_m2_base NUMERIC(10,2) NOT NULL,
    precio_min_m2 NUMERIC(10,2),
    precio_max_m2 NUMERIC(10,2),
    factor_apartamento NUMERIC(4,2) DEFAULT 1.00,
    factor_casa NUMERIC(4,2) DEFAULT 1.05,
    factor_terreno NUMERIC(4,2) DEFAULT 0.60,
    factor_local NUMERIC(4,2) DEFAULT 1.30,
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 2. Habilitar RLS
ALTER TABLE public.zonas_cotizador ENABLE ROW LEVEL SECURITY;

-- 3. Limpiar políticas anteriores
DROP POLICY IF EXISTS "Zonas cotizador: lectura publica" ON public.zonas_cotizador;
DROP POLICY IF EXISTS "Zonas cotizador: modificacion auth" ON public.zonas_cotizador;
DROP POLICY IF EXISTS "Zonas cotizador: modificacion total" ON public.zonas_cotizador;
DROP POLICY IF EXISTS "Zonas cotizador: insercion publica" ON public.zonas_cotizador;
DROP POLICY IF EXISTS "Zonas cotizador: actualizacion publica" ON public.zonas_cotizador;
DROP POLICY IF EXISTS "Zonas cotizador: eliminacion publica" ON public.zonas_cotizador;

-- 4. Permitir lectura pública a cualquier visitante o asesor
CREATE POLICY "Zonas cotizador: lectura publica" ON public.zonas_cotizador
    FOR SELECT USING (true);

-- 5. Permitir inserción, actualización y eliminación tanto para usuarios autenticados como administradores del portal
CREATE POLICY "Zonas cotizador: modificacion total" ON public.zonas_cotizador
    FOR ALL TO public
    USING (true)
    WITH CHECK (true);

-- 6. Insertar zona de prueba si no existe
INSERT INTO public.zonas_cotizador (nombre, municipio, precio_m2_base, precio_min_m2, precio_max_m2, factor_apartamento, factor_casa, factor_terreno, factor_local)
VALUES ('Miguel prueba', 'San Cristóbal', 300, 450, 600, 1.00, 1.05, 0.60, 1.30)
ON CONFLICT (nombre) DO UPDATE SET
    precio_m2_base = EXCLUDED.precio_m2_base,
    precio_min_m2 = EXCLUDED.precio_min_m2,
    precio_max_m2 = EXCLUDED.precio_max_m2;
