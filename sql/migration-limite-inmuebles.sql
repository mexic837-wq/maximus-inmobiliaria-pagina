-- =====================================================================
-- MAXIMUS INMOBILIARIA - Límite de inmuebles publicados por plan
--
--   Bronce        3 inmuebles
--   Gold       7 inmuebles
--   Platinum  ilimitado
--
-- Aplica solo a asesores externos con plan de pago (rol 'asesor_externo').
-- Administración y equipo MAXIMUS no tienen límite.
-- Cuentan los inmuebles en estatus 'disponible' o 'reservado'; al marcar uno
-- como vendido/alquilado o eliminarlo, se libera un espacio.
--
-- Requiere: migration-pagos-suscripcion.sql y migration-plan-platinum.sql
-- (idealmente también migration-captaciones-platinum.sql, que crea el plan Gold).
-- Ejecutar COMPLETO en el SQL Editor de Supabase. Es seguro repetirlo.
--
-- Para cambiar un tope, edita limite_inmuebles_plan() y js/config.js
-- (LIMITE_INMUEBLES_POR_PLAN) para que la pantalla muestre el mismo número.
-- =====================================================================

-- 1. Tope por plan (NULL = ilimitado)
CREATE OR REPLACE FUNCTION public.limite_inmuebles_plan(p_plan TEXT)
RETURNS INT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE p_plan
               WHEN 'platinum' THEN NULL
               WHEN 'gold'     THEN 7
               ELSE 3              -- pro (y cualquier asesor externo sin plan reconocido)
           END;
$$;

-- 2. ¿Cuántos inmuebles activos tiene este usuario?
CREATE OR REPLACE FUNCTION public.contar_inmuebles_activos(p_auth_id UUID, p_excluir UUID DEFAULT NULL)
RETURNS INT
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT COUNT(*)::INT
      FROM public.inmuebles i
      JOIN public.usuarios u ON u.auth_id = p_auth_id
     WHERE COALESCE(i.estatus, 'disponible') IN ('disponible', 'reservado')
       AND (p_excluir IS NULL OR i.id <> p_excluir)
       AND (i.asesor_id = u.auth_id::TEXT
            OR i.asesor_id = u.id::TEXT
            OR i.agente_id = u.id);
$$;

REVOKE ALL ON FUNCTION public.contar_inmuebles_activos(UUID, UUID) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.contar_inmuebles_activos(UUID, UUID) TO authenticated, service_role;

-- 3. Trigger: rechaza el inmueble que pasa del tope
CREATE OR REPLACE FUNCTION public.verificar_limite_inmuebles()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_u       RECORD;
    v_limite  INT;
    v_usados  INT;
    v_activo_nuevo BOOLEAN := COALESCE(NEW.estatus, 'disponible') IN ('disponible', 'reservado');
BEGIN
    -- Procesos internos (service_role, scripts del servidor) y llamadas sin sesión no se limitan
    IF auth.uid() IS NULL OR COALESCE(auth.role(), '') = 'service_role' THEN
        RETURN NEW;
    END IF;

    -- Solo importa si el inmueble queda activo
    IF NOT v_activo_nuevo THEN
        RETURN NEW;
    END IF;

    -- En una edición, solo se revisa si pasa de inactivo (vendido/alquilado) a activo
    IF TG_OP = 'UPDATE' AND COALESCE(OLD.estatus, 'disponible') IN ('disponible', 'reservado') THEN
        RETURN NEW;
    END IF;

    SELECT u.id, u.auth_id, u.rol, u.plan
      INTO v_u
      FROM public.usuarios u
     WHERE u.auth_id = auth.uid();

    IF NOT FOUND OR v_u.rol IS DISTINCT FROM 'asesor_externo' THEN
        RETURN NEW; -- admin, equipo MAXIMUS y demás roles: sin límite
    END IF;

    v_limite := public.limite_inmuebles_plan(v_u.plan);
    IF v_limite IS NULL THEN
        RETURN NEW; -- Platinum
    END IF;

    -- Un asesor no puede publicar dos inmuebles a la vez "en carrera" y pasarse del tope
    PERFORM pg_advisory_xact_lock(hashtext('limite_inmuebles_' || v_u.auth_id::TEXT));

    v_usados := public.contar_inmuebles_activos(
        v_u.auth_id,
        CASE WHEN TG_OP = 'UPDATE' THEN NEW.id ELSE NULL END
    );

    IF v_usados >= v_limite THEN
        RAISE EXCEPTION 'LIMITE_INMUEBLES: tu plan % permite hasta % inmuebles publicados y ya tienes %.',
            COALESCE(v_u.plan, 'pro'), v_limite, v_usados
            USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_verificar_limite_inmuebles ON public.inmuebles;
CREATE TRIGGER trg_verificar_limite_inmuebles
    BEFORE INSERT OR UPDATE OF estatus ON public.inmuebles
    FOR EACH ROW EXECUTE FUNCTION public.verificar_limite_inmuebles();

-- 4. Consulta útil para el admin: quién está en su tope
--    SELECT u.nombre_completo, u.plan,
--           public.contar_inmuebles_activos(u.auth_id) AS publicados,
--           public.limite_inmuebles_plan(u.plan)       AS tope
--      FROM public.usuarios u
--     WHERE u.rol = 'asesor_externo'
--     ORDER BY publicados DESC;

-- NOTA: los asesores que YA tienen más inmuebles que el tope de su plan los conservan;
-- simplemente no podrán subir más hasta bajar del tope o mejorar de plan.

NOTIFY pgrst, 'reload schema';
