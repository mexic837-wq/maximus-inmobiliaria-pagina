-- =====================================================================
-- MAXIMUS INMOBILIARIA - Planes Gold / Platinum + "Publica tu inmueble"
--                        con cola rotativa de asesores Platinum
--
-- Requiere haber ejecutado antes: migration-pagos-suscripcion.sql
--                                 migration-plan-platinum.sql
-- Ejecutar COMPLETO en el SQL Editor de Supabase. Es seguro repetirlo.
--
-- Planes (usuarios.plan) desde esta migración:
--   free
--   (los precios reales los fija supabase/functions/_shared/pagos.ts)
--   pro       US$ 2.99  (plan_id 'mensual')
--   gold      US$ 4.99  (plan_id 'gold')      = el antiguo "Platinum":
--                        Captaciones Destacadas, reseñas, insignia
--   platinum  US$ 9.99  (plan_id 'platinum')  = todo lo de Gold + recibe,
--                         en cola rotativa, a los propietarios que llenan
--                         el formulario "Publica tu inmueble" del landing
-- =====================================================================

-- ---------------------------------------------------------------------
-- 0. Registro de migraciones de un solo uso
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.maximus_migraciones (
    nombre      TEXT PRIMARY KEY,
    ejecutada_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
ALTER TABLE public.maximus_migraciones ENABLE ROW LEVEL SECURITY;

-- ---------------------------------------------------------------------
-- 1. Renombrar: quienes ya tenían el Platinum anterior (Captaciones
--    Destacadas + reseñas) pasan a Gold, que es ese mismo paquete.
--    Se ejecuta UNA sola vez (si corres el archivo otra vez no toca a
--    los nuevos Platinum).
-- ---------------------------------------------------------------------
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.maximus_migraciones WHERE nombre = 'platinum_9_99_a_gold') THEN
        UPDATE public.usuarios
           SET plan = 'gold',
               titulo = CASE WHEN titulo ILIKE 'Asesor Inmobiliario Platinum%' THEN 'Asesor Inmobiliario Gold' ELSE titulo END
         WHERE plan = 'platinum';

        UPDATE public.pagos_suscripcion
           SET plan_id = 'gold'
         WHERE plan_id = 'platinum';

        INSERT INTO public.maximus_migraciones (nombre) VALUES ('platinum_9_99_a_gold');
    END IF;
END $$;

-- ---------------------------------------------------------------------
-- 2. ¿Tiene plan destacado vigente? (Gold o Platinum)
--    Lo usan las reseñas: ahora también se puede reseñar a los Gold.
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
           AND u.plan IN ('gold', 'platinum')
           AND COALESCE(u.activo, true)
           AND (u.plan_vence_at IS NULL OR u.plan_vence_at > now())
    );
$$;

GRANT EXECUTE ON FUNCTION public.es_asesor_platinum(UUID) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 3. Activar un pago: Bronce / Gold / Platinum (idempotente)
--    - Mismo plan: se suma 1 mes a lo que le quede.
--    - Cambio de plan: 1 mes desde hoy (sin prorrateo).
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

    v_plan := CASE v_pago.plan_id
                  WHEN 'platinum' THEN 'platinum'
                  WHEN 'gold'     THEN 'gold'
                  ELSE 'pro' END;
    v_titulo := CASE v_plan
                  WHEN 'platinum' THEN 'Asesor Inmobiliario Platinum'
                  WHEN 'gold'     THEN 'Asesor Inmobiliario Gold'
                  ELSE 'Asesor Inmobiliario Bronce' END;

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
-- 4. Vencimientos: Bronce, Gold y Platinum se pierden igual
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

    UPDATE public.usuarios
       SET plan = 'free'
     WHERE rol IN ('admin', 'asesor_maximus')
       AND plan IN ('pro', 'gold', 'platinum')
       AND plan_vence_at IS NOT NULL AND plan_vence_at < now();

    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.expirar_suscripciones() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirar_suscripciones() TO service_role;

-- ---------------------------------------------------------------------
-- 5. Listado público de Captaciones Destacadas: Gold + Platinum
--    (cambia el tipo de retorno: se agrega la columna "plan")
-- ---------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.listar_asesores_platinum();

CREATE FUNCTION public.listar_asesores_platinum()
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
    total_inmuebles INT,
    plan            TEXT
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
        CASE u.plan WHEN 'platinum' THEN 'Asesor Inmobiliario Platinum' ELSE 'Asesor Inmobiliario Gold' END,
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
                 OR i.asesor_id = u.auth_id::TEXT)),
        u.plan
    FROM public.usuarios u
    LEFT JOIN public.resenas_asesores r
           ON r.asesor_auth_id = u.auth_id AND r.oculto = false
    WHERE u.plan IN ('gold', 'platinum')
      AND COALESCE(u.activo, true)
      AND (u.plan_vence_at IS NULL OR u.plan_vence_at > now())
    GROUP BY u.id
    ORDER BY (u.plan = 'platinum') DESC, 10 DESC, 11 DESC, u.nombre_completo;
$$;

GRANT EXECUTE ON FUNCTION public.listar_asesores_platinum() TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Solicitudes del formulario "Publica tu inmueble"
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.captaciones_web (
    id                 UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    codigo             TEXT NOT NULL UNIQUE,
    operacion          TEXT NOT NULL CHECK (operacion IN ('venta', 'alquiler', 'compra')),
    tipo_inmueble      TEXT NOT NULL,
    zona               TEXT NOT NULL,
    precio_estimado    TEXT,
    comentario         TEXT,
    nombre             TEXT NOT NULL,
    whatsapp           TEXT NOT NULL,                 -- solo dígitos, con código de país
    asesor_auth_id     UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    asesor_usuario_id  UUID,
    asesor_nombre      TEXT,
    asesor_whatsapp    TEXT,
    asesor_email       TEXT,
    es_equipo_maximus  BOOLEAN NOT NULL DEFAULT false, -- true = no había Platinum en la cola
    estado             TEXT NOT NULL DEFAULT 'nuevo'
                       CHECK (estado IN ('nuevo', 'contactado', 'captado', 'descartado')),
    notificado_at      TIMESTAMPTZ,                   -- lo marca n8n al enviar el WhatsApp
    created_at         TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at         TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_captaciones_web_asesor ON public.captaciones_web (asesor_auth_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_captaciones_web_whatsapp ON public.captaciones_web (whatsapp, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_captaciones_web_pendientes ON public.captaciones_web (created_at) WHERE notificado_at IS NULL;

ALTER TABLE public.captaciones_web ENABLE ROW LEVEL SECURITY;

-- Nadie inserta directo: solo la función registrar_captacion_web().
-- El asesor asignado ve y actualiza las suyas; el admin ve todas.
DROP POLICY IF EXISTS "captaciones_web: ver propias o admin" ON public.captaciones_web;
CREATE POLICY "captaciones_web: ver propias o admin" ON public.captaciones_web
    FOR SELECT TO authenticated
    USING (
        asesor_auth_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin')
    );

DROP POLICY IF EXISTS "captaciones_web: actualizar propias o admin" ON public.captaciones_web;
CREATE POLICY "captaciones_web: actualizar propias o admin" ON public.captaciones_web
    FOR UPDATE TO authenticated
    USING (
        asesor_auth_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin')
    )
    WITH CHECK (
        asesor_auth_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin')
    );

REVOKE ALL ON public.captaciones_web FROM anon;
GRANT SELECT, UPDATE ON public.captaciones_web TO authenticated;

-- ---------------------------------------------------------------------
-- 7. Cola rotativa (round-robin) de asesores Platinum
--    Tabla aparte, sin políticas: ningún usuario puede "adelantarse".
--    Regla: recibe el Platinum que lleva MÁS tiempo sin recibir una
--    solicitud (los nuevos entran primero). Si no hay ninguno, la
--    solicitud va al equipo MAXIMUS.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cola_captaciones (
    auth_id              UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    ultima_asignacion_at TIMESTAMPTZ,
    total_asignadas      INT NOT NULL DEFAULT 0
);
ALTER TABLE public.cola_captaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cola_captaciones FROM anon, authenticated;

-- Datos del equipo MAXIMUS (respaldo cuando no hay Platinum)
CREATE TABLE IF NOT EXISTS public.config_captaciones (
    id               BOOLEAN PRIMARY KEY DEFAULT true CHECK (id),
    nombre_respaldo  TEXT NOT NULL DEFAULT 'Equipo MAXIMUS',
    whatsapp_respaldo TEXT NOT NULL DEFAULT '584247114483',
    email_respaldo   TEXT
);
INSERT INTO public.config_captaciones (id) VALUES (true) ON CONFLICT (id) DO NOTHING;
ALTER TABLE public.config_captaciones ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.config_captaciones FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 8. Registrar la solicitud y asignar asesor (lo llama el landing)
--    Uso desde JS: POST /rest/v1/rpc/registrar_captacion_web
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.registrar_captacion_web(
    p_operacion       TEXT,
    p_tipo_inmueble   TEXT,
    p_zona            TEXT,
    p_nombre          TEXT,
    p_whatsapp        TEXT,
    p_precio_estimado TEXT DEFAULT NULL,
    p_comentario      TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wa      TEXT := regexp_replace(COALESCE(p_whatsapp, ''), '[^0-9]', '', 'g');
    v_op      TEXT := lower(trim(COALESCE(p_operacion, '')));
    v_asesor  RECORD;
    v_cfg     public.config_captaciones%ROWTYPE;
    v_codigo  TEXT;
    v_id      UUID;
    v_equipo  BOOLEAN := false;
    v_nombre_a TEXT;
    v_wa_a    TEXT;
BEGIN
    -- Validación básica
    IF v_op NOT IN ('venta', 'alquiler', 'compra') THEN
        RETURN jsonb_build_object('ok', false, 'error', 'operacion_invalida');
    END IF;
    IF char_length(trim(COALESCE(p_nombre, ''))) NOT BETWEEN 2 AND 80
       OR char_length(trim(COALESCE(p_tipo_inmueble, ''))) NOT BETWEEN 2 AND 40
       OR char_length(trim(COALESCE(p_zona, ''))) NOT BETWEEN 2 AND 120
       OR char_length(COALESCE(p_precio_estimado, '')) > 60
       OR char_length(COALESCE(p_comentario, '')) > 500 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'datos_invalidos');
    END IF;

    -- WhatsApp venezolano escrito en local (0424...) → 58424...
    IF v_wa ~ '^0[0-9]{10}$' THEN
        v_wa := '58' || substr(v_wa, 2);
    END IF;
    IF char_length(v_wa) NOT BETWEEN 10 AND 15 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'whatsapp_invalido');
    END IF;

    -- Anti-spam: 3 por número cada 24 h y 60 en total cada 10 min
    IF (SELECT COUNT(*) FROM public.captaciones_web
         WHERE whatsapp = v_wa AND created_at > now() - interval '24 hours') >= 3 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'limite_por_numero');
    END IF;
    IF (SELECT COUNT(*) FROM public.captaciones_web
         WHERE created_at > now() - interval '10 minutes') >= 60 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'limite_global');
    END IF;

    -- Un solo turno a la vez (dos solicitudes simultáneas no caen en el mismo asesor)
    PERFORM pg_advisory_xact_lock(hashtext('maximus_cola_captaciones'));

    SELECT u.auth_id,
           u.id AS usuario_id,
           COALESCE(NULLIF(trim(u.nombre_completo), ''), 'Asesor MAXIMUS') AS nombre,
           regexp_replace(COALESCE(NULLIF(u.whatsapp, ''), NULLIF(u.telefono_e164, ''), u.telefono, ''), '[^0-9]', '', 'g') AS wa,
           u.email
      INTO v_asesor
      FROM public.usuarios u
      LEFT JOIN public.cola_captaciones c ON c.auth_id = u.auth_id
     WHERE u.plan = 'platinum'
       AND u.auth_id IS NOT NULL
       AND COALESCE(u.activo, true)
       AND (u.plan_vence_at IS NULL OR u.plan_vence_at > now())
       AND char_length(regexp_replace(COALESCE(NULLIF(u.whatsapp, ''), NULLIF(u.telefono_e164, ''), u.telefono, ''), '[^0-9]', '', 'g')) >= 10
     ORDER BY c.ultima_asignacion_at ASC NULLS FIRST, u.id
     LIMIT 1;

    IF v_asesor.auth_id IS NOT NULL THEN
        INSERT INTO public.cola_captaciones AS c (auth_id, ultima_asignacion_at, total_asignadas)
        VALUES (v_asesor.auth_id, now(), 1)
        ON CONFLICT (auth_id) DO UPDATE
           SET ultima_asignacion_at = now(), total_asignadas = c.total_asignadas + 1;
        v_nombre_a := v_asesor.nombre;
        v_wa_a := v_asesor.wa;
    ELSE
        SELECT * INTO v_cfg FROM public.config_captaciones WHERE id;
        v_equipo := true;
        v_nombre_a := COALESCE(v_cfg.nombre_respaldo, 'Equipo MAXIMUS');
        v_wa_a := COALESCE(v_cfg.whatsapp_respaldo, '584247114483');
    END IF;

    v_codigo := 'CAP-' || to_char(now() AT TIME ZONE 'America/Caracas', 'YYMMDD') || '-'
                || upper(substr(md5(gen_random_uuid()::TEXT), 1, 5));

    INSERT INTO public.captaciones_web (
        codigo, operacion, tipo_inmueble, zona, precio_estimado, comentario, nombre, whatsapp,
        asesor_auth_id, asesor_usuario_id, asesor_nombre, asesor_whatsapp, asesor_email, es_equipo_maximus
    ) VALUES (
        v_codigo, v_op, trim(p_tipo_inmueble), trim(p_zona), NULLIF(trim(COALESCE(p_precio_estimado, '')), ''),
        NULLIF(trim(COALESCE(p_comentario, '')), ''), trim(p_nombre), v_wa,
        CASE WHEN v_equipo THEN NULL ELSE v_asesor.auth_id END,
        CASE WHEN v_equipo THEN NULL ELSE v_asesor.usuario_id END,
        v_nombre_a, v_wa_a,
        CASE WHEN v_equipo THEN v_cfg.email_respaldo ELSE v_asesor.email END,
        v_equipo
    )
    RETURNING id INTO v_id;

    -- Al navegador solo vuelve lo público (nombre y WhatsApp del asesor, que ya se muestran en la web)
    RETURN jsonb_build_object(
        'ok', true,
        'captacion_id', v_id,
        'codigo', v_codigo,
        'asesor_nombre', v_nombre_a,
        'asesor_whatsapp', v_wa_a,
        'es_equipo_maximus', v_equipo
    );
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_captacion_web(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_captacion_web(TEXT, TEXT, TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- ---------------------------------------------------------------------
-- 9. Para n8n: toma la solicitud pendiente y la marca como notificada
--    (solo service_role; si se llama dos veces con el mismo id, la
--    segunda devuelve vacío y no se repite el WhatsApp)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.tomar_captacion_para_notificar(p_id UUID)
RETURNS SETOF public.captaciones_web
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.captaciones_web
       SET notificado_at = now(), updated_at = now()
     WHERE id = p_id AND notificado_at IS NULL
    RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.tomar_captacion_para_notificar(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomar_captacion_para_notificar(UUID) TO service_role;

-- ---------------------------------------------------------------------
-- 10. Consultas útiles (opcional, para el admin)
-- ---------------------------------------------------------------------
-- Ver la cola y cuántas solicitudes recibió cada Platinum:
--   SELECT u.nombre_completo, c.total_asignadas, c.ultima_asignacion_at
--     FROM public.cola_captaciones c JOIN public.usuarios u ON u.auth_id = c.auth_id
--    ORDER BY c.ultima_asignacion_at NULLS FIRST;
-- Cambiar el WhatsApp / correo de respaldo del equipo MAXIMUS:
--   UPDATE public.config_captaciones SET whatsapp_respaldo = '58424XXXXXXX', email_respaldo = 'correo@dominio.com';

NOTIFY pgrst, 'reload schema';
