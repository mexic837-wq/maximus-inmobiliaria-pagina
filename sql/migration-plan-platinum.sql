-- =====================================================================
-- MAXIMUS INMOBILIARIA - Plan Asesor Inmobiliario Platinum (US$ 9.99/mes)
--                        + reseñas de asesores Platinum
--
-- Requiere haber ejecutado antes: migration-pagos-suscripcion.sql
-- Ejecutar completo en el SQL Editor de Supabase (es idempotente).
--
-- Planes (usuarios.plan):  free | pro (US$ 4.99, plan_id 'mensual')
--                                | platinum (US$ 9.99, plan_id 'platinum')
-- El rol interno sigue siendo 'asesor_externo' para no romper RLS existentes;
-- lo que cambia es el título visible: "Asesor Inmobiliario Pro / Platinum".
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Datos públicos del perfil del asesor (tarjeta en Captaciones Destacadas)
-- ---------------------------------------------------------------------
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS whatsapp TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS especialidad TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS zona TEXT;
-- (ya existen si corriste las migraciones anteriores; se dejan por seguridad)
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS telefono_e164 TEXT;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS asesor_id TEXT;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS agente_id UUID;
-- El dashboard guarda aquí al asesor Pro/Platinum que carga el inmueble
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS asesor_nombre TEXT;
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS asesor_telefono TEXT;
CREATE INDEX IF NOT EXISTS idx_inmuebles_asesor_id ON public.inmuebles (asesor_id);

-- Títulos antiguos → nuevos
UPDATE public.usuarios
   SET titulo = CASE WHEN plan = 'platinum' THEN 'Asesor Inmobiliario Platinum'
                     ELSE 'Asesor Inmobiliario Pro' END
 WHERE titulo ILIKE 'Asesor Inmobiliario Externo%';

-- ---------------------------------------------------------------------
-- 2. ¿Tiene Platinum vigente?  (lo usan las reseñas y el listado público)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.es_asesor_platinum(p_auth_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT EXISTS (
        SELECT 1 FROM public.usuarios u
         WHERE u.auth_id = p_auth_id
           AND u.plan = 'platinum'
           AND COALESCE(u.activo, true)
           AND (u.plan_vence_at IS NULL OR u.plan_vence_at > now())
    );
$$;

GRANT EXECUTE ON FUNCTION public.es_asesor_platinum(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Activar un pago: ahora distingue Pro / Platinum (idempotente)
--    - Mismo plan: se suma 1 mes a lo que le quede.
--    - Cambio de plan (Pro → Platinum o al revés): 1 mes desde hoy.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activar_pago_suscripcion(p_pago_id UUID, p_por TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pago      public.pagos_suscripcion%ROWTYPE;
    v_plan      TEXT;
    v_titulo    TEXT;
    v_actual    TEXT;
    v_vence_act TIMESTAMPTZ;
    v_base      TIMESTAMPTZ;
    v_vence     TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_pago FROM public.pagos_suscripcion WHERE id = p_pago_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'pago_no_existe');
    END IF;
    IF v_pago.estado = 'aprobado' THEN
        RETURN jsonb_build_object('ok', true, 'ya_aprobado', true);
    END IF;

    v_plan   := CASE v_pago.plan_id WHEN 'platinum' THEN 'platinum' ELSE 'pro' END;
    v_titulo := CASE v_plan WHEN 'platinum' THEN 'Asesor Inmobiliario Platinum' ELSE 'Asesor Inmobiliario Pro' END;

    SELECT plan, plan_vence_at INTO v_actual, v_vence_act
      FROM public.usuarios WHERE auth_id = v_pago.auth_id;

    IF v_actual = v_plan THEN
        v_base := GREATEST(now(), COALESCE(v_vence_act, now()));
    ELSE
        v_base := now();
    END IF;
    v_vence := v_base + interval '1 month';

    UPDATE public.pagos_suscripcion
       SET estado = 'aprobado', aprobado_at = now(), aprobado_por = p_por
     WHERE id = p_pago_id;

    UPDATE public.usuarios
       SET rol = CASE WHEN rol IN ('admin', 'asesor_maximus') THEN rol ELSE 'asesor_externo' END,
           tipo_asesor = CASE WHEN rol IN ('admin', 'asesor_maximus') THEN tipo_asesor ELSE 'externo' END,
           titulo = CASE WHEN rol IN ('admin', 'asesor_maximus') THEN titulo ELSE v_titulo END,
           plan = v_plan,
           plan_vence_at = v_vence
     WHERE auth_id = v_pago.auth_id;

    RETURN jsonb_build_object('ok', true, 'vence', v_vence, 'codigo', v_pago.codigo, 'plan', v_plan);
END;
$$;

REVOKE ALL ON FUNCTION public.activar_pago_suscripcion(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activar_pago_suscripcion(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- 4. Vencimientos: Pro y Platinum se pierden igual
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.expirar_suscripciones()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE v_n INT;
BEGIN
    UPDATE public.pagos_suscripcion
       SET estado = 'expirado'
     WHERE estado IN ('pendiente', 'verificando') AND expira_at < now() - interval '1 day';

    UPDATE public.usuarios
       SET rol = 'cliente', tipo_asesor = NULL, plan = 'free',
           titulo = 'Usuario Registrado'
     WHERE rol = 'asesor_externo' AND plan_vence_at IS NOT NULL AND plan_vence_at < now();
    GET DIAGNOSTICS v_n = ROW_COUNT;

    -- Admins / equipo MAXIMUS que compraron un plan: conservan su rol, pierden el plan
    UPDATE public.usuarios
       SET plan = 'free'
     WHERE rol IN ('admin', 'asesor_maximus')
       AND plan IN ('pro', 'platinum')
       AND plan_vence_at IS NOT NULL AND plan_vence_at < now();

    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.expirar_suscripciones() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirar_suscripciones() TO service_role;

-- ---------------------------------------------------------------------
-- 5. Reseñas de asesores Platinum (1 a 5 estrellas, una por usuario y asesor)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.resenas_asesores (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    asesor_auth_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    autor_auth_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    autor_nombre   TEXT,                      -- lo rellena el trigger desde usuarios (no se puede falsear)
    estrellas      SMALLINT NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
    comentario     TEXT CHECK (comentario IS NULL OR char_length(comentario) <= 600),
    oculto         BOOLEAN NOT NULL DEFAULT false,   -- moderación: solo admin
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE (asesor_auth_id, autor_auth_id),
    CHECK (asesor_auth_id <> autor_auth_id)
);

CREATE INDEX IF NOT EXISTS idx_resenas_asesores_asesor
    ON public.resenas_asesores (asesor_auth_id, created_at DESC) WHERE oculto = false;

-- Trigger: fija autor y nombre, impide cambiar de asesor y protege "oculto"
CREATE OR REPLACE FUNCTION public.resenas_asesores_guard()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_admin BOOLEAN := EXISTS (
        SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin'
    );
BEGIN
    IF TG_OP = 'INSERT' THEN
        IF NOT v_admin THEN
            NEW.oculto := false;
        END IF;
    ELSE
        IF NEW.asesor_auth_id IS DISTINCT FROM OLD.asesor_auth_id
           OR NEW.autor_auth_id IS DISTINCT FROM OLD.autor_auth_id THEN
            RAISE EXCEPTION 'No se puede cambiar el asesor ni el autor de una reseña';
        END IF;
        IF NEW.oculto IS DISTINCT FROM OLD.oculto AND NOT v_admin
           AND COALESCE(auth.role(), '') <> 'service_role' THEN
            RAISE EXCEPTION 'Solo un administrador puede ocultar reseñas';
        END IF;
        NEW.updated_at := now();
    END IF;

    SELECT COALESCE(NULLIF(trim(u.nombre_completo), ''), 'Usuario MAXIMUS')
      INTO NEW.autor_nombre
      FROM public.usuarios u WHERE u.auth_id = NEW.autor_auth_id;
    NEW.autor_nombre := COALESCE(NEW.autor_nombre, 'Usuario MAXIMUS');
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_resenas_asesores_guard ON public.resenas_asesores;
CREATE TRIGGER trg_resenas_asesores_guard
    BEFORE INSERT OR UPDATE ON public.resenas_asesores
    FOR EACH ROW EXECUTE FUNCTION public.resenas_asesores_guard();

ALTER TABLE public.resenas_asesores ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "resenas_asesores: leer visibles" ON public.resenas_asesores;
CREATE POLICY "resenas_asesores: leer visibles" ON public.resenas_asesores
    FOR SELECT TO anon, authenticated
    USING (
        oculto = false
        OR autor_auth_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin')
    );

DROP POLICY IF EXISTS "resenas_asesores: crear propia" ON public.resenas_asesores;
CREATE POLICY "resenas_asesores: crear propia" ON public.resenas_asesores
    FOR INSERT TO authenticated
    WITH CHECK (
        autor_auth_id = auth.uid()
        AND asesor_auth_id <> auth.uid()
        AND public.es_asesor_platinum(asesor_auth_id)
    );

DROP POLICY IF EXISTS "resenas_asesores: editar propia o admin" ON public.resenas_asesores;
CREATE POLICY "resenas_asesores: editar propia o admin" ON public.resenas_asesores
    FOR UPDATE TO authenticated
    USING (
        autor_auth_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin')
    )
    WITH CHECK (
        autor_auth_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin')
    );

DROP POLICY IF EXISTS "resenas_asesores: borrar propia o admin" ON public.resenas_asesores;
CREATE POLICY "resenas_asesores: borrar propia o admin" ON public.resenas_asesores
    FOR DELETE TO authenticated
    USING (
        autor_auth_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin')
    );

GRANT SELECT ON public.resenas_asesores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resenas_asesores TO authenticated;

-- ---------------------------------------------------------------------
-- 6. Listado público de asesores Platinum (solo campos seguros)
--    Estrellas: promedio de reseñas visibles; con 0 reseñas = 5.0
--    Uso desde JS:  sb.rpc('listar_asesores_platinum')
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_asesores_platinum()
RETURNS TABLE (
    auth_id         UUID,
    usuario_id      UUID,
    nombre          TEXT,
    titulo          TEXT,
    avatar_url      TEXT,
    bio             TEXT,
    especialidad    TEXT,
    zona            TEXT,
    whatsapp        TEXT,
    estrellas       NUMERIC,
    total_resenas   INT,
    total_inmuebles INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        u.auth_id,
        u.id,
        u.nombre_completo,
        'Asesor Inmobiliario Platinum'::TEXT,
        COALESCE(NULLIF(u.avatar_url, ''), NULLIF(u.avatar, '')),
        u.bio,
        u.especialidad,
        COALESCE(NULLIF(u.zona, ''), u.estado),
        regexp_replace(COALESCE(NULLIF(u.whatsapp, ''), NULLIF(u.telefono_e164, ''), u.telefono, ''), '[^0-9]', '', 'g'),
        CASE WHEN COUNT(r.id) = 0 THEN 5.0 ELSE ROUND(AVG(r.estrellas)::NUMERIC, 1) END,
        COUNT(r.id)::INT,
        (SELECT COUNT(*)::INT FROM public.inmuebles i
          WHERE COALESCE(i.estatus, 'disponible') = 'disponible'
            AND (i.agente_id = u.id
                 OR i.asesor_id = u.id::TEXT
                 OR i.asesor_id = u.auth_id::TEXT))
    FROM public.usuarios u
    LEFT JOIN public.resenas_asesores r
           ON r.asesor_auth_id = u.auth_id AND r.oculto = false
    WHERE u.plan = 'platinum'
      AND COALESCE(u.activo, true)
      AND (u.plan_vence_at IS NULL OR u.plan_vence_at > now())
    GROUP BY u.id
    ORDER BY 10 DESC, 11 DESC, u.nombre_completo;
$$;

GRANT EXECUTE ON FUNCTION public.listar_asesores_platinum() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 7. Equipo MAXIMUS en la web pública ("Agentes Expertos a tu Servicio")
--    Solo cuentas reales registradas con rol asesor_maximus o admin.
--    Para ocultar a alguien (p. ej. una cuenta técnica):
--      UPDATE public.usuarios SET mostrar_en_web = false WHERE email = '...';
--    Uso desde JS:  POST /rest/v1/rpc/listar_equipo_maximus
-- ---------------------------------------------------------------------
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS mostrar_en_web BOOLEAN NOT NULL DEFAULT true;

CREATE OR REPLACE FUNCTION public.listar_equipo_maximus()
RETURNS TABLE (
    nombre       TEXT,
    titulo       TEXT,
    avatar_url   TEXT,
    especialidad TEXT,
    whatsapp     TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT
        u.nombre_completo,
        COALESCE(NULLIF(u.titulo, ''), CASE WHEN u.rol = 'admin' THEN 'Dirección MAXIMUS' ELSE 'Asesor MAXIMUS' END),
        COALESCE(NULLIF(u.avatar_url, ''), NULLIF(u.avatar, '')),
        u.especialidad,
        regexp_replace(COALESCE(NULLIF(u.whatsapp, ''), NULLIF(u.telefono_e164, ''), u.telefono, ''), '[^0-9]', '', 'g')
    FROM public.usuarios u
    WHERE u.rol IN ('asesor_maximus', 'admin')
      AND COALESCE(u.activo, true)
      AND u.mostrar_en_web
      AND NULLIF(trim(u.nombre_completo), '') IS NOT NULL
    ORDER BY (u.rol = 'admin') DESC, u.nombre_completo;
$$;

GRANT EXECUTE ON FUNCTION public.listar_equipo_maximus() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
