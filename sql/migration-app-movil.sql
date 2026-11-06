-- ==============================================================================
-- MAXIMUS INMOBILIARIA - Migración App Móvil (App Store / Google Play)
-- ==============================================================================
-- 1. Función segura para que cada usuario elimine SU PROPIA cuenta
--    (obligatorio en Apple App Store 5.1.1(v) y Google Play "Account deletion").
-- 2. Tabla de tokens de notificaciones push por dispositivo (FCM / APNs).
--
-- Ejecutar en el SQL Editor de Supabase (rol postgres / service_role).
-- ==============================================================================


-- ===== 1. ELIMINAR MI CUENTA =====
-- Borra el usuario de auth.users. Las tablas relacionadas ya están preparadas:
--   public.usuarios.auth_id            -> ON DELETE CASCADE
--   leads/clientes/inmuebles agente_id -> ON DELETE SET NULL (los inmuebles quedan sin asesor)
--   resenas.usuario_id                 -> ON DELETE SET NULL
CREATE OR REPLACE FUNCTION public.eliminar_mi_cuenta()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, auth
AS $$
DECLARE
    v_uid UUID := auth.uid();
BEGIN
    IF v_uid IS NULL THEN
        RAISE EXCEPTION 'No autenticado' USING ERRCODE = '42501';
    END IF;

    -- Proteger cuentas de administrador de borrados accidentales desde la app
    IF EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = v_uid AND rol = 'admin') THEN
        RAISE EXCEPTION 'Las cuentas de administrador deben eliminarse desde el panel de Supabase.' USING ERRCODE = '42501';
    END IF;

    -- Tokens push del usuario
    DELETE FROM public.dispositivos_push WHERE auth_id = v_uid;

    -- Perfil público (por si existiera sin la FK en cascada)
    DELETE FROM public.usuarios WHERE auth_id = v_uid;

    -- Usuario de autenticación (identidades y sesiones se eliminan en cascada)
    DELETE FROM auth.users WHERE id = v_uid;
END;
$$;

REVOKE ALL ON FUNCTION public.eliminar_mi_cuenta() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.eliminar_mi_cuenta() TO authenticated;


-- ===== 2. TOKENS DE NOTIFICACIONES PUSH =====
CREATE TABLE IF NOT EXISTS public.dispositivos_push (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auth_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    token TEXT NOT NULL UNIQUE,
    plataforma TEXT NOT NULL CHECK (plataforma IN ('ios', 'android', 'web')),
    creado_en TIMESTAMPTZ DEFAULT now(),
    actualizado_en TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_dispositivos_push_auth_id ON public.dispositivos_push(auth_id);

ALTER TABLE public.dispositivos_push ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "dispositivos_push_select_propios" ON public.dispositivos_push;
CREATE POLICY "dispositivos_push_select_propios" ON public.dispositivos_push
    FOR SELECT TO authenticated USING (auth_id = auth.uid());

DROP POLICY IF EXISTS "dispositivos_push_insert_propios" ON public.dispositivos_push;
CREATE POLICY "dispositivos_push_insert_propios" ON public.dispositivos_push
    FOR INSERT TO authenticated WITH CHECK (auth_id = auth.uid());

DROP POLICY IF EXISTS "dispositivos_push_update_propios" ON public.dispositivos_push;
CREATE POLICY "dispositivos_push_update_propios" ON public.dispositivos_push
    FOR UPDATE TO authenticated USING (auth_id = auth.uid()) WITH CHECK (auth_id = auth.uid());

DROP POLICY IF EXISTS "dispositivos_push_delete_propios" ON public.dispositivos_push;
CREATE POLICY "dispositivos_push_delete_propios" ON public.dispositivos_push
    FOR DELETE TO authenticated USING (auth_id = auth.uid());

-- n8n / backend envía notificaciones leyendo esta tabla con la service_role key.
