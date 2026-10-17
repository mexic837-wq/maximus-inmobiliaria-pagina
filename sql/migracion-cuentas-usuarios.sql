-- ==============================================================================
-- MAXIMUS INMOBILIARIA - MIGRACIÓN SQL PARA SUPABASE
-- SOPORTE PARA CUENTAS DE USUARIO NORMAL (CLIENTES)
-- ==============================================================================
--
-- INSTRUCCIONES:
-- 1. Abre el panel de tu proyecto en Supabase (https://supabase.com/dashboard)
-- 2. Ve a la sección "SQL Editor" en el menú lateral izquierdo
-- 3. Haz clic en "New query" (Nueva consulta)
-- 4. Pega todo el contenido de este archivo y presiona "Run" (Ejecutar)
-- 5. ¡Listo! Ya tu base de datos aceptará registros de usuarios normales.
-- ==============================================================================

-- 1. ACTUALIZAR CHECK CONSTRAINT DE ROL EN LA TABLA USUARIOS
-- Permite los 3 roles principales: 'admin', 'asesor_maximus' (y agentes), y 'cliente' (o 'usuario')
DO $$
BEGIN
    -- Eliminar restricción de rol anterior si existe
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'usuarios_rol_check' 
        AND conrelid = 'public.usuarios'::regclass
    ) THEN
        ALTER TABLE public.usuarios DROP CONSTRAINT usuarios_rol_check;
    END IF;

    -- Agregar la nueva restricción que admite 'cliente' y 'usuario'
    ALTER TABLE public.usuarios 
        ADD CONSTRAINT usuarios_rol_check 
        CHECK (rol IN ('admin', 'asesor_maximus', 'asesor_externo', 'agente', 'cliente', 'usuario'));
END $$;


-- 2. ACTUALIZAR CHECK CONSTRAINT DE TIPO DE ASESOR
-- Permite que los usuarios normales tengan tipo_asesor NULL o 'cliente'
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'usuarios_tipo_asesor_check' 
        AND conrelid = 'public.usuarios'::regclass
    ) THEN
        ALTER TABLE public.usuarios DROP CONSTRAINT usuarios_tipo_asesor_check;
    END IF;

    ALTER TABLE public.usuarios 
        ADD CONSTRAINT usuarios_tipo_asesor_check 
        CHECK (tipo_asesor IS NULL OR tipo_asesor IN ('maximus', 'externo', 'cliente'));
END $$;


-- 3. ESTABLECER ROL POR DEFECTO PARA NUEVOS USUARIOS
ALTER TABLE public.usuarios ALTER COLUMN rol SET DEFAULT 'cliente';
ALTER TABLE public.usuarios ALTER COLUMN tipo_asesor DROP NOT NULL;
ALTER TABLE public.usuarios ALTER COLUMN tipo_asesor SET DEFAULT NULL;


-- 4. POLÍTICAS ROW LEVEL SECURITY (RLS) PARA PERFILES DE USUARIOS
-- Habilitar RLS en la tabla
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

-- Política de lectura: cada usuario ve su propio perfil, los admins ven todos
DROP POLICY IF EXISTS "Usuarios: ver propio" ON public.usuarios;
CREATE POLICY "Usuarios: ver propio" ON public.usuarios
    FOR SELECT USING (
        auth.uid() = auth_id 
        OR EXISTS (SELECT 1 FROM public.usuarios u2 WHERE u2.auth_id = auth.uid() AND u2.rol = 'admin')
    );

-- Política de inserción: permite que un usuario cree su propio perfil al registrarse
DROP POLICY IF EXISTS "Usuarios: insertar propio" ON public.usuarios;
CREATE POLICY "Usuarios: insertar propio" ON public.usuarios
    FOR INSERT WITH CHECK (auth.uid() = auth_id);

-- Política de actualización: cada usuario actualiza su propio perfil
DROP POLICY IF EXISTS "Usuarios: actualizar propio" ON public.usuarios;
CREATE POLICY "Usuarios: actualizar propio" ON public.usuarios
    FOR UPDATE USING (auth.uid() = auth_id)
    WITH CHECK (auth.uid() = auth_id);


-- 5. TRIGGER AUTOMÁTICO DE REGISTRO EN SUPABASE AUTH
-- Cuando un usuario se registra con email/contraseña en Supabase Auth,
-- este trigger inserta de inmediato su fila en public.usuarios con rol 'cliente'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.usuarios (
        auth_id,
        nombre_completo,
        email,
        telefono,
        rol,
        tipo_asesor,
        titulo,
        avatar_url
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nombre_completo', split_part(NEW.email, '@', 1)),
        NEW.email,
        NEW.raw_user_meta_data->>'telefono',
        COALESCE(NEW.raw_user_meta_data->>'rol', 'cliente'),
        NULL,
        COALESCE(NEW.raw_user_meta_data->>'titulo', 'Usuario Registrado'),
        'https://ui-avatars.com/api/?name=' || encode(convert_to(COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email), 'UTF-8'), 'escape') || '&background=0B4A3F&color=fff&bold=true'
    )
    ON CONFLICT (auth_id) DO UPDATE SET
        nombre_completo = COALESCE(EXCLUDED.nombre_completo, public.usuarios.nombre_completo),
        email = EXCLUDED.email,
        telefono = COALESCE(EXCLUDED.telefono, public.usuarios.telefono),
        updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Asociar el trigger a la tabla auth.users
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- 6. VERIFICAR POLÍTICA DE LECTURA DE INMUEBLES PARA USUARIOS
-- Asegura que cualquier persona (pública o cliente registrado) pueda consultar inmuebles disponibles
DROP POLICY IF EXISTS "Inmuebles: lectura pública de disponibles" ON public.inmuebles;
CREATE POLICY "Inmuebles: lectura pública de disponibles" ON public.inmuebles
    FOR SELECT USING (
        estatus = 'disponible'
        OR agente_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = auth.uid() AND rol = 'admin')
    );
