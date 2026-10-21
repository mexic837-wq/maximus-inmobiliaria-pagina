-- ==============================================================================
-- MIGRACIÓN SUPABASE: GESTIÓN Y AUDITORÍA DE USUARIOS COMPRADORES (PANEL ADMIN)
-- MAXIMUS Inmobiliaria · Auditoría 360°, Trazabilidad de Favoritos & n8n
-- ==============================================================================

-- 1. Ampliar tabla 'usuarios' con campos de auditoría, trazabilidad y prefijos
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS prefijo TEXT DEFAULT '+58';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS telefono_e164 TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS asesor_asignado_id TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS asesor_asignado_nombre TEXT DEFAULT 'Sin Asignar';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'Portal Web';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS score INT DEFAULT 70;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS temperatura TEXT DEFAULT 'activo';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS criterios_implicitos JSONB DEFAULT '{}'::jsonb;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS favoritos TEXT[] DEFAULT '{}';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS interacciones JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS notas_auditoria JSONB DEFAULT '[]'::jsonb;

-- 2. Asegurar que los roles permitan 'cliente' y 'usuario' sin restricciones
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'usuarios_rol_check'
    ) THEN
        ALTER TABLE public.usuarios DROP CONSTRAINT usuarios_rol_check;
    END IF;
END $$;

ALTER TABLE public.usuarios 
    ADD CONSTRAINT usuarios_rol_check 
    CHECK (rol IN ('admin', 'asesor_maximus', 'asesor_externo', 'agente', 'cliente', 'usuario'));

-- 3. Tabla relacional de Favoritos (Trazabilidad 1 a 1 de inmuebles guardados)
CREATE TABLE IF NOT EXISTS public.favoritos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    inmueble_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    UNIQUE(user_id, inmueble_id)
);

-- 4. Tabla de Auditoría de Actividad e Interacciones del Comprador
CREATE TABLE IF NOT EXISTS public.auditoria_actividad (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL, -- 'whatsapp', 'descarga_pdf', 'favorito', 'login', 'registro', 'portafolio_n8n'
    inmueble_id TEXT,
    titulo TEXT,
    detalle TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. Índices de alto rendimiento para búsqueda y filtrado rápido
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON public.usuarios(rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_temperatura ON public.usuarios(temperatura);
CREATE INDEX IF NOT EXISTS idx_usuarios_score ON public.usuarios(score DESC);
CREATE INDEX IF NOT EXISTS idx_favoritos_user ON public.favoritos(user_id);
CREATE INDEX IF NOT EXISTS idx_favoritos_inmueble ON public.favoritos(inmueble_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_user ON public.auditoria_actividad(user_id);

-- 6. Políticas de Seguridad RLS (Row Level Security)
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favoritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_actividad ENABLE ROW LEVEL SECURITY;

-- Política: Los administradores y asesores pueden ver todos los usuarios para auditoría
DROP POLICY IF EXISTS "Lectura total usuarios para administracion" ON public.usuarios;
CREATE POLICY "Lectura total usuarios para administracion" ON public.usuarios
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Actualizacion usuarios administracion" ON public.usuarios;
CREATE POLICY "Actualizacion usuarios administracion" ON public.usuarios
    FOR UPDATE TO authenticated
    USING (true);

-- Política: Usuarios pueden gestionar sus propios favoritos
DROP POLICY IF EXISTS "Usuarios gestionan sus favoritos" ON public.favoritos;
CREATE POLICY "Usuarios gestionan sus favoritos" ON public.favoritos
    FOR ALL TO authenticated
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Política: Administradores pueden auditar todos los favoritos
DROP POLICY IF EXISTS "Administracion lee todos los favoritos" ON public.favoritos;
CREATE POLICY "Administracion lee todos los favoritos" ON public.favoritos
    FOR SELECT TO authenticated
    USING (true);

-- Política: Auditoría accesible para lectura de la administración
DROP POLICY IF EXISTS "Administracion lee auditoria de actividad" ON public.auditoria_actividad;
CREATE POLICY "Administracion lee auditoria de actividad" ON public.auditoria_actividad
    FOR SELECT TO authenticated
    USING (true);

DROP POLICY IF EXISTS "Insercion libre de eventos de auditoria" ON public.auditoria_actividad;
CREATE POLICY "Insercion libre de eventos de auditoria" ON public.auditoria_actividad
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

-- 7. Recargar esquema en PostgREST de Supabase
NOTIFY pgrst, 'reload schema';
