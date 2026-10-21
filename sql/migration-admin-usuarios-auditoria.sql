-- ==============================================================================
-- MAXIMUS INMOBILIARIA - MIGRACIÓN COMPLETA PARA SUPABASE
-- AUDITORÍA DE USUARIOS REGISTRADOS, TRAZABILIDAD DE FAVORITOS & PERMISOS RLS
-- ==============================================================================
-- 
-- INSTRUCCIONES:
-- 1. Ve a tu proyecto de Supabase (https://supabase.com/dashboard) o a tu VPS.
-- 2. Entra a "SQL Editor" en el menú izquierdo y haz clic en "New query".
-- 3. Pega todo el contenido de este archivo y presiona "RUN" (Ejecutar).
-- 4. ¡Listo! La base de datos sincronizará automáticamente todos los usuarios
--    que se registren, sus inmuebles favoritos y su actividad.
-- ==============================================================================

-- 1. EXTENSIONES NECESARIAS
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- 2. ACTUALIZAR RESTRICCIONES DE ROL EN public.usuarios
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'usuarios_rol_check' 
        AND conrelid = 'public.usuarios'::regclass
    ) THEN
        ALTER TABLE public.usuarios DROP CONSTRAINT usuarios_rol_check;
    END IF;
END $$;

ALTER TABLE public.usuarios 
    ADD CONSTRAINT usuarios_rol_check 
    CHECK (rol IN ('admin', 'asesor_maximus', 'asesor_externo', 'agente', 'cliente', 'usuario'));

ALTER TABLE public.usuarios ALTER COLUMN rol SET DEFAULT 'cliente';
ALTER TABLE public.usuarios ALTER COLUMN tipo_asesor DROP NOT NULL;

-- 3. AÑADIR COLUMNAS DE AUDITORÍA Y TRAZABILIDAD EN public.usuarios
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS prefijo TEXT DEFAULT '+58';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS telefono_e164 TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS asesor_asignado_id TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS asesor_asignado_nombre TEXT DEFAULT 'Sin Asignar';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS origen TEXT DEFAULT 'Portal Web (Crear Cuenta)';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS score INT DEFAULT 70;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS temperatura TEXT DEFAULT 'activo';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS criterios_implicitos JSONB DEFAULT '{"presupuesto_estimado": 200000, "tipo_preferido": "Residencial", "zonas_interes": ["San Cristóbal"]}'::jsonb;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS favoritos TEXT[] DEFAULT '{}';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS interacciones JSONB DEFAULT '[]'::jsonb;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS notas_auditoria JSONB DEFAULT '[]'::jsonb;

-- 4. TABLA RELACIONAL DE FAVORITOS (Inmuebles a los que el cliente dio "Me Gusta")
CREATE TABLE IF NOT EXISTS public.favoritos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    email TEXT,
    inmueble_id TEXT NOT NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 5. TABLA DE AUDITORÍA DE ACTIVIDAD E INTERACCIONES EN VIVO
CREATE TABLE IF NOT EXISTS public.auditoria_actividad (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID,
    email TEXT,
    tipo TEXT NOT NULL, -- 'registro', 'favorito', 'whatsapp', 'visita', 'descarga_pdf', 'portafolio_n8n'
    inmueble_id TEXT,
    titulo TEXT,
    detalle TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 6. ÍNDICES DE RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_usuarios_rol ON public.usuarios(rol);
CREATE INDEX IF NOT EXISTS idx_usuarios_email ON public.usuarios(email);
CREATE INDEX IF NOT EXISTS idx_usuarios_temperatura ON public.usuarios(temperatura);
CREATE INDEX IF NOT EXISTS idx_favoritos_user_id ON public.favoritos(user_id);
CREATE INDEX IF NOT EXISTS idx_favoritos_email ON public.favoritos(email);
CREATE INDEX IF NOT EXISTS idx_favoritos_inmueble ON public.favoritos(inmueble_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_user_id ON public.auditoria_actividad(user_id);
CREATE INDEX IF NOT EXISTS idx_auditoria_email ON public.auditoria_actividad(email);

-- 7. TRIGGER AUTOMÁTICO PARA REGISTRO DE NUEVOS USUARIOS DESDE SUPABASE AUTH
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
DECLARE
    nombre_val TEXT;
    tel_val TEXT;
    pref_val TEXT;
    e164_val TEXT;
BEGIN
    nombre_val := COALESCE(NEW.raw_user_meta_data->>'nombre_completo', split_part(NEW.email, '@', 1));
    tel_val := NEW.raw_user_meta_data->>'telefono';
    pref_val := COALESCE(NEW.raw_user_meta_data->>'prefijo', '+58');
    e164_val := COALESCE(NEW.raw_user_meta_data->>'telefono_e164', tel_val);

    INSERT INTO public.usuarios (
        auth_id,
        nombre_completo,
        email,
        telefono,
        telefono_e164,
        prefijo,
        rol,
        tipo_asesor,
        titulo,
        avatar_url,
        origen,
        score,
        temperatura,
        asesor_asignado_nombre,
        favoritos,
        interacciones
    )
    VALUES (
        NEW.id,
        nombre_val,
        LOWER(TRIM(NEW.email)),
        tel_val,
        e164_val,
        pref_val,
        COALESCE(NEW.raw_user_meta_data->>'rol', 'cliente'),
        NULL,
        'Usuario Registrado',
        'https://ui-avatars.com/api/?name=' || encode(convert_to(nombre_val, 'UTF-8'), 'escape') || '&background=0B4A3F&color=fff&bold=true',
        'Portal Web (Crear Cuenta)',
        70,
        'activo',
        'Sin Asignar',
        '{}'::text[],
        jsonb_build_array(
            jsonb_build_object(
                'id', 'int-' || extract(epoch from now())::bigint::text,
                'tipo', 'registro',
                'titulo', 'Creación de Cuenta en Portal',
                'detalle', 'El usuario completó el formulario de registro de comprador.',
                'timestamp', now()
            )
        )
    )
    ON CONFLICT (auth_id) DO UPDATE SET
        nombre_completo = COALESCE(EXCLUDED.nombre_completo, public.usuarios.nombre_completo),
        email = EXCLUDED.email,
        telefono = COALESCE(EXCLUDED.telefono, public.usuarios.telefono),
        telefono_e164 = COALESCE(EXCLUDED.telefono_e164, public.usuarios.telefono_e164),
        prefijo = COALESCE(EXCLUDED.prefijo, public.usuarios.prefijo),
        updated_at = now();

    -- Registrar evento en la tabla de auditoría
    INSERT INTO public.auditoria_actividad (
        user_id,
        email,
        tipo,
        titulo,
        detalle
    ) VALUES (
        NEW.id,
        LOWER(TRIM(NEW.email)),
        'registro',
        'Registro de Cuenta en Portal Web',
        'El usuario completó el formulario de registro desde la página web.'
    );

    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 8. POLÍTICAS DE ACCESO RLS (PERMITE LECTURA Y ESCRITURA UNIVERSAL PARA anon Y authenticated)
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.favoritos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.auditoria_actividad ENABLE ROW LEVEL SECURITY;

-- Políticas para usuarios
DROP POLICY IF EXISTS "Lectura total usuarios" ON public.usuarios;
CREATE POLICY "Lectura total usuarios" ON public.usuarios
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Actualizacion usuarios" ON public.usuarios;
CREATE POLICY "Actualizacion usuarios" ON public.usuarios
    FOR UPDATE TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Insercion usuarios" ON public.usuarios;
CREATE POLICY "Insercion usuarios" ON public.usuarios
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

-- Políticas para favoritos
DROP POLICY IF EXISTS "Lectura favoritos" ON public.favoritos;
CREATE POLICY "Lectura favoritos" ON public.favoritos
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Insercion favoritos" ON public.favoritos;
CREATE POLICY "Insercion favoritos" ON public.favoritos
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

DROP POLICY IF EXISTS "Borrado favoritos" ON public.favoritos;
CREATE POLICY "Borrado favoritos" ON public.favoritos
    FOR DELETE TO authenticated, anon
    USING (true);

-- Políticas para auditoria_actividad
DROP POLICY IF EXISTS "Lectura auditoria" ON public.auditoria_actividad;
CREATE POLICY "Lectura auditoria" ON public.auditoria_actividad
    FOR SELECT TO authenticated, anon
    USING (true);

DROP POLICY IF EXISTS "Insercion auditoria" ON public.auditoria_actividad;
CREATE POLICY "Insercion auditoria" ON public.auditoria_actividad
    FOR INSERT TO authenticated, anon
    WITH CHECK (true);

-- 9. OTORGAR PERMISOS GRANT A LOS ROLES DE SUPABASE (EVITA ERRORES 401)
GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.usuarios TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.favoritos TO anon, authenticated, service_role;
GRANT ALL ON TABLE public.auditoria_actividad TO anon, authenticated, service_role;
GRANT ALL ON ALL SEQUENCES IN SCHEMA public TO anon, authenticated, service_role;

-- 10. RECARGAR EL ESQUEMA EN POSTGREST
NOTIFY pgrst, 'reload schema';
