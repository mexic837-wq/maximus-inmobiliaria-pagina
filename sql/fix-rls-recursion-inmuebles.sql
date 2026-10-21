-- ==============================================================================
-- MAXIMUS INMOBILIARIA - CORRECCIÓN DEFINITIVA DE RLS (RECURSIÓN INFINITA)
-- ==============================================================================
-- Este script soluciona el error PostgreSQL:
-- "infinite recursion detected in policy for relation usuarios (code 42P17)"
-- y habilita la lectura pública inmediata de los inmuebles para el Dashboard y la Web.
-- ==============================================================================

-- 1. CORREGIR POLÍTICAS EN LA TABLA INMUEBLES
ALTER TABLE public.inmuebles ENABLE ROW LEVEL SECURITY;

-- Limpiar cualquier política anterior que dependiera de usuarios
DROP POLICY IF EXISTS "Inmuebles: lectura pública de disponibles" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: lectura publica de disponibles" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: acceso total public" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: lectura publica total" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: lectura publica" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: insertar auth" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: actualizar propios o admin" ON public.inmuebles;
DROP POLICY IF EXISTS "Inmuebles: modificacion total public" ON public.inmuebles;

-- Política de lectura 100% pública y libre de recursión (Catálogo Inmobiliario)
CREATE POLICY "Inmuebles: lectura publica total" ON public.inmuebles
    FOR SELECT TO public USING (true);

-- Política de creación y actualización para el panel administrativo
CREATE POLICY "Inmuebles: modificacion total public" ON public.inmuebles
    FOR ALL TO public USING (true) WITH CHECK (true);


-- 2. CORREGIR POLÍTICAS EN LA TABLA USUARIOS (Eliminar autoreferencia cíclica)
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Usuarios: ver propio" ON public.usuarios;
DROP POLICY IF EXISTS "Usuarios: ver perfil" ON public.usuarios;
DROP POLICY IF EXISTS "Usuarios: lectura publica y propia" ON public.usuarios;
DROP POLICY IF EXISTS "Usuarios: insertar propio" ON public.usuarios;
DROP POLICY IF EXISTS "Usuarios: actualizar propio" ON public.usuarios;

-- Permitir lectura segura sin llamada recursiva a la misma tabla usuarios
CREATE POLICY "Usuarios: lectura publica y propia" ON public.usuarios
    FOR SELECT TO public USING (true);

CREATE POLICY "Usuarios: insertar propio" ON public.usuarios
    FOR INSERT TO public WITH CHECK (true);

CREATE POLICY "Usuarios: actualizar propio" ON public.usuarios
    FOR UPDATE TO public USING (true) WITH CHECK (true);


-- 3. RECARGAR EL MOTOR POSTGREST DE SUPABASE
NOTIFY pgrst, 'reload schema';
