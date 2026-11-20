-- =============================================================================
-- MAXIMUS · FASE 2 (uso interno): permisos del CRM, agenda y colecciones
-- Fecha: 2026-11-19 · También va como PARTE 11 en PENDIENTE-SUPABASE-TODO-EN-UNO.sql
--
-- ANTES: leads, lead_actividades, citas y colecciones_vip tenían políticas
-- "USING (true)": cualquiera, incluso sin iniciar sesión, podía leer y cambiar
-- el CRM completo.
--
-- DESPUÉS:
--   · El equipo (admin, asesor_maximus, asesor_externo, agente) ve y edita todo,
--     igual que hoy.
--   · Un cliente solo LEE sus propias filas (las que tienen su mismo correo):
--     su lead del CRM, sus citas y las colecciones que le armaron.
--   · Los formularios públicos (valoración, contacto desde la ficha) pueden
--     CREAR leads, pero no leerlos.
--   · Función mi_asesor_cliente(): el cliente obtiene nombre, teléfono, foto y
--     título de su asesor, sin acceso al resto de la tabla usuarios.
--
-- Las cuentas demo del panel (admin@maximus.com, etc.) no tienen sesión real de
-- Supabase: después de aplicar esto verán el CRM vacío en localhost. Es lo esperado.
--
-- Se puede ejecutar más de una vez.
-- =============================================================================

-- 1. Funciones de apoyo --------------------------------------------------------
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

CREATE OR REPLACE FUNCTION public.maximus_email_actual()
RETURNS text
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT lower(trim(COALESCE(
        (SELECT email FROM public.usuarios WHERE auth_id = auth.uid() LIMIT 1),
        auth.jwt() ->> 'email'
    )))
$$;

GRANT EXECUTE ON FUNCTION public.maximus_es_staff()     TO authenticated;
GRANT EXECUTE ON FUNCTION public.maximus_email_actual() TO authenticated;

-- 2. Quitar TODAS las políticas viejas de estas tablas -------------------------
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN
        SELECT policyname, tablename FROM pg_policies
        WHERE schemaname = 'public'
          AND tablename IN ('leads', 'lead_actividades', 'citas', 'colecciones_vip')
    LOOP
        EXECUTE format('DROP POLICY %I ON public.%I', pol.policyname, pol.tablename);
    END LOOP;
END $$;

ALTER TABLE public.leads            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_actividades ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas            ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colecciones_vip  ENABLE ROW LEVEL SECURITY;

-- 3. LEADS (CRM) ---------------------------------------------------------------
CREATE POLICY "Leads: equipo gestiona todo" ON public.leads
    FOR ALL TO authenticated
    USING (public.maximus_es_staff()) WITH CHECK (public.maximus_es_staff());

CREATE POLICY "Leads: cliente ve lo suyo" ON public.leads
    FOR SELECT TO authenticated
    USING (lower(trim(email)) = public.maximus_email_actual());

CREATE POLICY "Leads: formularios web crean" ON public.leads
    FOR INSERT TO anon, authenticated
    WITH CHECK (true);

-- 4. BITÁCORA DEL CRM: solo el equipo -----------------------------------------
CREATE POLICY "Actividades: equipo gestiona todo" ON public.lead_actividades
    FOR ALL TO authenticated
    USING (public.maximus_es_staff()) WITH CHECK (public.maximus_es_staff());

-- 5. CITAS (agenda) ------------------------------------------------------------
CREATE POLICY "Citas: equipo gestiona todo" ON public.citas
    FOR ALL TO authenticated
    USING (public.maximus_es_staff()) WITH CHECK (public.maximus_es_staff());

CREATE POLICY "Citas: cliente ve las suyas" ON public.citas
    FOR SELECT TO authenticated
    USING (lower(trim(cliente_email)) = public.maximus_email_actual());

-- 6. COLECCIONES VIP -----------------------------------------------------------
CREATE POLICY "Colecciones: equipo gestiona todo" ON public.colecciones_vip
    FOR ALL TO authenticated
    USING (public.maximus_es_staff()) WITH CHECK (public.maximus_es_staff());

CREATE POLICY "Colecciones: cliente ve las suyas" ON public.colecciones_vip
    FOR SELECT TO authenticated
    USING (lower(trim(email)) = public.maximus_email_actual());

-- 7. Mi asesor (para la vista "Mi asesor" del cliente) -------------------------
-- Toma el lead más reciente del cliente que no esté descartado y devuelve solo
-- los datos de contacto de su asesor.
CREATE OR REPLACE FUNCTION public.mi_asesor_cliente()
RETURNS TABLE (nombre text, telefono text, avatar_url text, titulo text)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT u.nombre_completo::text, u.telefono::text, u.avatar_url::text, u.titulo::text
    FROM public.leads l
    JOIN public.usuarios u
      ON u.id::text = COALESCE(to_jsonb(l) ->> 'asesor_id', to_jsonb(l) ->> 'agente_id')
    WHERE lower(trim(l.email)) = public.maximus_email_actual()
      AND u.rol IN ('admin', 'asesor_maximus', 'asesor_externo', 'agente')
    ORDER BY (l.estatus = 'descartado'), l.updated_at DESC NULLS LAST
    LIMIT 1
$$;

REVOKE ALL ON FUNCTION public.mi_asesor_cliente() FROM public, anon;
GRANT EXECUTE ON FUNCTION public.mi_asesor_cliente() TO authenticated;

NOTIFY pgrst, 'reload schema';
