-- ==============================================================================
-- MAXIMUS INMOBILIARIA - NOTIFICACIONES PRIVADAS POR USUARIO / ROL
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de Supabase (idempotente).
--
-- Problema que corrige: la política original
--     USING (auth.uid() IS NOT NULL OR usuario_id IS NULL)
-- permitía que CUALQUIER usuario con sesión (incluidos clientes gratuitos) leyera
-- y marcara como leídas TODAS las notificaciones: leads con teléfonos de otras
-- personas, comisiones, captaciones, etc.
--
-- Regla nueva:
--   · Cada usuario ve y actualiza solo las notificaciones dirigidas a él.
--   · Las notificaciones generales (usuario_id NULL) las ven solo admin y asesores.
--   · Los clientes no pueden crear notificaciones; solo staff (o service_role / n8n).
-- ==============================================================================

-- 1. Helpers (SECURITY DEFINER para no chocar con el RLS de public.usuarios) -----
CREATE OR REPLACE FUNCTION public.maximus_usuario_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.usuarios WHERE auth_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.maximus_es_staff()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.usuarios
        WHERE auth_id = auth.uid()
          AND rol IN ('admin', 'asesor_maximus', 'asesor_externo', 'agente')
    )
$$;

GRANT EXECUTE ON FUNCTION public.maximus_usuario_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.maximus_es_staff()   TO authenticated;

-- 2. Políticas ---------------------------------------------------------------
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Notificaciones: ver propias"        ON public.notificaciones;
DROP POLICY IF EXISTS "Notificaciones: actualizar propias" ON public.notificaciones;
DROP POLICY IF EXISTS "Notificaciones: crear (staff)"      ON public.notificaciones;
DROP POLICY IF EXISTS "Notificaciones: borrar propias"     ON public.notificaciones;

CREATE POLICY "Notificaciones: ver propias" ON public.notificaciones
    FOR SELECT TO authenticated
    USING (
        usuario_id = public.maximus_usuario_id()
        OR (usuario_id IS NULL AND public.maximus_es_staff())
    );

CREATE POLICY "Notificaciones: actualizar propias" ON public.notificaciones
    FOR UPDATE TO authenticated
    USING (
        usuario_id = public.maximus_usuario_id()
        OR (usuario_id IS NULL AND public.maximus_es_staff())
    )
    WITH CHECK (
        usuario_id = public.maximus_usuario_id()
        OR (usuario_id IS NULL AND public.maximus_es_staff())
    );

CREATE POLICY "Notificaciones: crear (staff)" ON public.notificaciones
    FOR INSERT TO authenticated
    WITH CHECK (public.maximus_es_staff());

CREATE POLICY "Notificaciones: borrar propias" ON public.notificaciones
    FOR DELETE TO authenticated
    USING (usuario_id = public.maximus_usuario_id());

-- 3. (Opcional) Quitar las 4 notificaciones de DEMOSTRACIÓN del esquema inicial --
--    Son las de "Roberto Méndez", "Quinta en Guaparo", "Comisión Liquidada" y
--    "Oportunidad de Precio". Descomenta y ejecuta solo si ya no las quieres ver
--    en el panel de los asesores:
--
-- DELETE FROM public.notificaciones
--  WHERE usuario_id IS NULL
--    AND (mensaje LIKE 'Roberto Méndez solicitó valoración express%'
--      OR mensaje LIKE 'José Guerrero publicó Quinta en Guaparo%'
--      OR mensaje LIKE 'Comisión de $6.750 USD disponible%'
--      OR mensaje LIKE 'El Apartamento en Residencias El Bosque ajustó precio%');

-- 4. Evitar que una alerta repetida inunde la campana (índice de consulta) ------
CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario_fecha
    ON public.notificaciones (usuario_id, created_at DESC);
