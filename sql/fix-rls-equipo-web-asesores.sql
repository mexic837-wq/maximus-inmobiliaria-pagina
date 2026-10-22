-- ==============================================================================
-- MAXIMUS INMOBILIARIA - DESBLOQUEO RLS: EQUIPO WEB Y ASESORES
-- ==============================================================================
-- Ejecuta este script directamente en el "SQL Editor" de tu panel de Supabase:
-- https://db.maximusinmobiliaria.tech (o panel web de Supabase)
--
-- Este script soluciona definitivamente el problema donde los miembros eliminados
-- o editados en "Equipo en Web" o "Asesores MAXIMUS" volvían a aparecer al recargar
-- debido a que las políticas RLS bloqueaban el DELETE/UPDATE para el cliente web.
-- ==============================================================================

-- 1. TABLA: EQUIPO WEB (Landing Page "Nuestro Equipo")
ALTER TABLE public.equipo_web ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Equipo Web: lectura publica" ON public.equipo_web;
DROP POLICY IF EXISTS "Equipo Web: ver todos auth" ON public.equipo_web;
DROP POLICY IF EXISTS "Equipo Web: modificar auth" ON public.equipo_web;
DROP POLICY IF EXISTS "equipo_web_public_all" ON public.equipo_web;
DROP POLICY IF EXISTS "Equipo Web: modificacion total public" ON public.equipo_web;

-- Permitir lectura, inserción, actualización y eliminación completa para administración
CREATE POLICY "equipo_web_public_all" 
ON public.equipo_web 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);


-- 2. TABLA: ASESORES MAXIMUS (Gestión de Asesores Oficiales)
ALTER TABLE public.asesores_maximus ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Asesores Maximus: lectura publica" ON public.asesores_maximus;
DROP POLICY IF EXISTS "Asesores Maximus: modificar auth" ON public.asesores_maximus;
DROP POLICY IF EXISTS "Asesores Maximus: modificacion total" ON public.asesores_maximus;
DROP POLICY IF EXISTS "Asesores Maximus: insercion publica" ON public.asesores_maximus;
DROP POLICY IF EXISTS "Asesores Maximus: actualizacion publica" ON public.asesores_maximus;
DROP POLICY IF EXISTS "Asesores Maximus: eliminacion publica" ON public.asesores_maximus;

-- Permitir lectura, inserción, actualización y eliminación completa
CREATE POLICY "Asesores Maximus: modificacion total" 
ON public.asesores_maximus 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);


-- 3. TABLA: SECCIONES WEB (Textos de cabecera de la Landing)
CREATE TABLE IF NOT EXISTS public.secciones_web (
    clave TEXT PRIMARY KEY,
    etiqueta TEXT,
    titulo TEXT,
    subtitulo TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.secciones_web ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "secciones_web_public_all" ON public.secciones_web;

CREATE POLICY "secciones_web_public_all" 
ON public.secciones_web 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);


-- 4. RECARGAR EL MOTOR POSTGREST DE SUPABASE
NOTIFY pgrst, 'reload schema';
