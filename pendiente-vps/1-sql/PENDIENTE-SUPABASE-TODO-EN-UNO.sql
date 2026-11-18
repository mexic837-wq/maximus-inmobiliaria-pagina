-- =====================================================================
-- MAXIMUS INMOBILIARIA - SQL PENDIENTE DE EJECUTAR EN SUPABASE (TODO EN UNO)
-- =====================================================================
-- Aquí se acumula TODO lo de Supabase que se va agregando en el chat.
-- Cuando vuelvas a tener acceso: abre el SQL Editor, pega este archivo
-- completo y ejecútalo UNA vez. Es seguro repetirlo.
--
-- Requiere que ya estén ejecutados antes (si ya los corriste, no hagas nada):
--   sql/migration-pagos-suscripcion.sql
--   sql/migration-plan-platinum.sql
--
-- CONTENIDO (en orden):
--   PARTE 1 · Planes Bronce / Gold / Platinum + "Publica tu inmueble" con cola
--             rotativa de asesores Platinum
--             (tablas captaciones_web, cola_captaciones, config_captaciones;
--              funciones registrar_captacion_web, tomar_captacion_para_notificar;
--              activar_pago_suscripcion y listar_asesores_platinum con Gold)
--   PARTE 2 · Límite de inmuebles por plan: Bronce 3 · Gold 7 · Platinum ilimitado
--             (funciones limite_inmuebles_plan, contar_inmuebles_activos y
--              trigger trg_verificar_limite_inmuebles en la tabla inmuebles)
--   PARTE 3 · El plan Pro pasa a llamarse BRONCE (solo el nombre visible: actualiza
--             los títulos ya guardados en usuarios; el valor interno plan = 'pro'
--             y plan_id 'mensual' NO cambian)
--   PARTE 4 · Primer pago = 2 meses (1 mes de regalo) en todos los planes
--             (función es_primer_pago y nueva versión de activar_pago_suscripcion)
--   PARTE 5 · Tasa oficial BCV automática para Pago Móvil (tabla tasas_bcv:
--             caché, respaldo e historial; permite fijar una tasa manual)
--   PARTE 6 · Inmuebles captados de WhatsApp: José Guerrero como contacto público,
--             asesor original guardado en privado, lista para avisarle y traspaso
--             automático de sus inmuebles cuando paga un plan
--   PARTE 7 · Oficinas aliadas: registro de inmobiliarias, moderación del admin y
--             listado público para la sección "Oficinas aliadas" de la landing
--   PARTE 8 · Reseñas solo de quien contactó al asesor (WhatsApp / Llamar desde la
--             ficha), para TODOS los asesores; una por cuenta; 5.0 sin reseñas
--             (tabla contactos_asesor; funciones registrar_contacto_asesor,
--              asesor_auth_de_inmueble, contacto_verificado, resumen_resenas_inmueble)
--
-- DESPUÉS DE EJECUTAR, además:
--   · Volver a desplegar las Edge Functions: pagos, stripe-webhook, confirmar-pago,
--     binance-sync, renovaciones (todas usan _shared/) y desplegar la NUEVA: tasa-bcv
--   · Importar en n8n: workflow-captacion-inmueble.json, workflow-tasa-bcv.json (nuevo),
--     workflow-recordatorio-renovacion.json y workflow-confirmacion-pago.json (cambiaron)
--
-- REGISTRO DE CAMBIOS (agregar abajo cada vez que se sume algo):
--   2026-11-16  Parte 1: planes Gold/Platinum + captaciones web con cola
--   2026-11-16  Parte 2: límite de inmuebles (Bronce 3, Gold 7, Platinum ilimitado)
--   2026-11-16  Parte 3: el plan Pro se renombra a Bronce (títulos en usuarios)
--   2026-11-16  Parte 4: primer pago = 2 meses (1 mes de regalo) en todos los planes
--   2026-11-16  Parte 5: tasa BCV automática (tabla tasas_bcv)
--   2026-11-16  Parte 6: captados de WhatsApp → contacto José Guerrero + asesor original privado
--   2026-11-17  Parte 7: oficinas aliadas (registro + listado en la landing)
--   2026-11-17  Parte 7 ajustada: el admin crea/edita/oculta/borra oficinas desde el panel
--               (estado 'oculta', responsable y WhatsApp opcionales, permisos de admin)
--   2026-11-18  Parte 8: reseñas solo con contacto verificado, para todos los asesores
-- =====================================================================


-- #####################################################################
-- PARTE 1 · PLANES GOLD / PLATINUM + PUBLICA TU INMUEBLE
-- #####################################################################
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


-- #####################################################################
-- PARTE 2 · LÍMITE DE INMUEBLES POR PLAN
-- #####################################################################

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


-- #####################################################################
-- PARTE 3 · EL PLAN "PRO" PASA A LLAMARSE "BRONCE"
-- #####################################################################
-- Solo cambia el nombre que ve la gente. Por dentro el plan sigue siendo
-- usuarios.plan = 'pro' y los pagos siguen usando plan_id = 'mensual',
-- así nada de lo existente se rompe.
-- (activar_pago_suscripcion, de la PARTE 1, ya guarda el título nuevo.)

UPDATE public.usuarios
   SET titulo = 'Asesor Inmobiliario Bronce'
 WHERE titulo ILIKE 'Asesor Inmobiliario Pro';

NOTIFY pgrst, 'reload schema';


-- #####################################################################
-- PARTE 4 · PRIMER PAGO = 2 MESES (1 MES DE REGALO)
-- #####################################################################
-- Regla: el PRIMER pago aprobado de un usuario, en cualquier plan, le da
-- 2 meses de membresía (paga 1 y recibe 1 de regalo). Del segundo pago en
-- adelante cada pago da 1 mes. Quienes ya pagaron antes NO reciben el regalo.
-- Esta parte vuelve a definir activar_pago_suscripcion (la de la PARTE 1) con
-- la regla nueva; es la versión que queda activa.

-- 4.1 ¿Este usuario aún no tiene ningún pago aprobado? (lo usa la ventana de pago
--     para mostrar el aviso "paga 1 mes y recibe 2"; la regla real vive en 4.2)
CREATE OR REPLACE FUNCTION public.es_primer_pago()
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NOT NULL
       AND NOT EXISTS (
            SELECT 1 FROM public.pagos_suscripcion p
             WHERE p.auth_id = auth.uid() AND p.estado = 'aprobado'
       );
$$;

REVOKE ALL ON FUNCTION public.es_primer_pago() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.es_primer_pago() TO authenticated;

-- 4.2 Activar un pago (idempotente): primer pago = 2 meses
--    - Mismo plan: se suman los meses a lo que le quede.
--    - Cambio de plan: los meses cuentan desde hoy (sin prorrateo).
CREATE OR REPLACE FUNCTION public.activar_pago_suscripcion(p_pago_id UUID, p_por TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pago       public.pagos_suscripcion%ROWTYPE;
    v_plan       TEXT;
    v_titulo     TEXT;
    v_actual     TEXT;
    v_vence_act  TIMESTAMPTZ;
    v_base       TIMESTAMPTZ;
    v_vence      TIMESTAMPTZ;
    v_primer     BOOLEAN;
    v_meses      INT;
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

    -- ¿Es el primer pago aprobado de este usuario? (se mira antes de aprobar este)
    v_primer := NOT EXISTS (
        SELECT 1 FROM public.pagos_suscripcion p
         WHERE p.auth_id = v_pago.auth_id AND p.estado = 'aprobado' AND p.id <> p_pago_id
    );
    v_meses := CASE WHEN v_primer THEN 2 ELSE 1 END;

    SELECT plan, plan_vence_at INTO v_actual, v_vence_act
      FROM public.usuarios WHERE auth_id = v_pago.auth_id;

    IF v_actual = v_plan THEN
        v_base := GREATEST(now(), COALESCE(v_vence_act, now()));
    ELSE
        v_base := now();
    END IF;
    v_vence := v_base + make_interval(months => v_meses);

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

    RETURN jsonb_build_object(
        'ok', true, 'vence', v_vence, 'codigo', v_pago.codigo, 'plan', v_plan,
        'primer_pago', v_primer, 'meses', v_meses
    );
END;
$$;

REVOKE ALL ON FUNCTION public.activar_pago_suscripcion(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activar_pago_suscripcion(UUID, TEXT) TO service_role;

-- Consulta útil: quién recibió el mes de regalo
--   SELECT u.nombre_completo, p.codigo, p.aprobado_at
--     FROM public.pagos_suscripcion p JOIN public.usuarios u ON u.auth_id = p.auth_id
--    WHERE p.estado = 'aprobado'
--      AND p.aprobado_at = (SELECT MIN(x.aprobado_at) FROM public.pagos_suscripcion x
--                            WHERE x.auth_id = p.auth_id AND x.estado = 'aprobado')
--    ORDER BY p.aprobado_at DESC;

NOTIFY pgrst, 'reload schema';


-- #####################################################################
-- PARTE 5 · TASA OFICIAL BCV AUTOMÁTICA PARA PAGO MÓVIL
-- #####################################################################
-- Guarda cada tasa que el servidor consulta (Edge Functions "pagos" y "tasa-bcv",
-- archivo supabase/functions/_shared/tasa-bcv.ts). Sirve de caché (no se consulta
-- la API en cada pago), de respaldo si la API se cae y de historial.
-- Solo el servidor (service_role) escribe aquí; la tasa es pública, cualquiera puede leerla.

CREATE TABLE IF NOT EXISTS public.tasas_bcv (
    id           BIGSERIAL PRIMARY KEY,
    tasa         NUMERIC(14,4) NOT NULL CHECK (tasa > 1),   -- Bs por 1 US$
    fuente       TEXT NOT NULL,                             -- dolarapi/oficial, manual, ...
    fecha_valor  DATE,                                      -- fecha oficial de la tasa
    es_manual    BOOLEAN NOT NULL DEFAULT false,            -- true = la fijó un administrador
    obtenida_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasas_bcv_reciente ON public.tasas_bcv (obtenida_at DESC);
CREATE INDEX IF NOT EXISTS idx_tasas_bcv_manual ON public.tasas_bcv (obtenida_at DESC) WHERE es_manual;

ALTER TABLE public.tasas_bcv ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "tasas_bcv: lectura publica" ON public.tasas_bcv;
CREATE POLICY "tasas_bcv: lectura publica" ON public.tasas_bcv
    FOR SELECT TO anon, authenticated USING (true);

REVOKE INSERT, UPDATE, DELETE ON public.tasas_bcv FROM anon, authenticated;
GRANT SELECT ON public.tasas_bcv TO anon, authenticated;

-- Fijar la tasa A MANO (solo si la automática falla o está mal). Manda durante 36 h:
--   INSERT INTO public.tasas_bcv (tasa, fuente, fecha_valor, es_manual)
--   VALUES (914.0218, 'manual', CURRENT_DATE, true);
-- Para volver a la automática antes de las 36 h:
--   DELETE FROM public.tasas_bcv WHERE es_manual AND obtenida_at > now() - interval '36 hours';
-- Ver las últimas tasas:
--   SELECT tasa, fuente, fecha_valor, es_manual, obtenida_at FROM public.tasas_bcv ORDER BY obtenida_at DESC LIMIT 20;

NOTIFY pgrst, 'reload schema';


-- #####################################################################
-- PARTE 6 · INMUEBLES CAPTADOS DE WHATSAPP: CONTACTO PÚBLICO JOSÉ GUERRERO
--           + ASESOR ORIGINAL GUARDADO EN PRIVADO + AVISO + TRASPASO AL PAGAR
-- #####################################################################
-- Regla de negocio:
--   · Todo inmueble que el agente captador sube desde los grupos de WhatsApp
--     se publica con José Guerrero (equipo MAXIMUS) como contacto.
--   · El asesor que lo publicó en el grupo queda guardado en una tabla PRIVADA
--     (inmuebles_asesor_original). Su número ya no queda a la vista del público.
--   · Se le avisa por WhatsApp (script local del agente, con tope diario) de que su
--     inmueble está en la web y se le ofrece el plan Bronce.
--   · Si paga un plan con ese mismo número, sus inmuebles pasan a su nombre y
--     los clientes le escriben directo a él (reclamar_inmuebles_capturados).

-- 6.1 Datos del contacto público (editable)
ALTER TABLE public.config_captaciones ADD COLUMN IF NOT EXISTS contacto_nombre   TEXT NOT NULL DEFAULT 'José Guerrero';
ALTER TABLE public.config_captaciones ADD COLUMN IF NOT EXISTS contacto_telefono TEXT NOT NULL DEFAULT '+58 424-7835697';
INSERT INTO public.config_captaciones (id) VALUES (true) ON CONFLICT (id) DO NOTHING;

-- 6.2 Marca de origen en el inmueble ('whatsapp' = captado por el agente; 'whatsapp_reclamado' = ya pasó a su asesor)
ALTER TABLE public.inmuebles ADD COLUMN IF NOT EXISTS origen_captura TEXT;

-- 6.3 Normaliza teléfonos venezolanos a solo dígitos con 58 (0414… / 414… / +58 414… → 58414…)
CREATE OR REPLACE FUNCTION public.normalizar_tel_ve(p TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
AS $$
    SELECT CASE
             WHEN d ~ '^0[0-9]{10}$' THEN '58' || substr(d, 2)
             WHEN d ~ '^4[0-9]{9}$'  THEN '58' || d
             ELSE d
           END
      FROM (SELECT regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g') AS d) x;
$$;

-- 6.4 Asesor original (PRIVADO: solo administradores y el servidor)
CREATE TABLE IF NOT EXISTS public.inmuebles_asesor_original (
    inmueble_id        TEXT PRIMARY KEY,           -- inmuebles.id como texto
    nombre             TEXT,
    telefono_original  TEXT,
    telefono_digitos   TEXT,                       -- normalizado con normalizar_tel_ve
    creado_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
    avisado_at         TIMESTAMPTZ,                -- cuándo se le envió el aviso por WhatsApp
    avisos             INT NOT NULL DEFAULT 0,
    reclamado_por      UUID,                       -- auth_id del asesor si compró un plan
    reclamado_at       TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_asesor_original_tel ON public.inmuebles_asesor_original (telefono_digitos);

ALTER TABLE public.inmuebles_asesor_original ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "asesor_original: solo admin" ON public.inmuebles_asesor_original;
CREATE POLICY "asesor_original: solo admin" ON public.inmuebles_asesor_original
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin'));
REVOKE ALL ON public.inmuebles_asesor_original FROM anon;
REVOKE INSERT, UPDATE, DELETE ON public.inmuebles_asesor_original FROM authenticated;
GRANT SELECT ON public.inmuebles_asesor_original TO authenticated;

-- 6.5 Trigger: al entrar un inmueble captado, guarda al asesor original en privado
--     y deja a José Guerrero como contacto público.
--     Se considera "captado" si viene marcado origen_captura = 'whatsapp' o si lo
--     inserta el servidor (service_role, que es como entra el agente) sin asesor de la
--     plataforma y sin ser captación propia MAXIMUS.
CREATE OR REPLACE FUNCTION public.proteger_asesor_original()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_cfg public.config_captaciones%ROWTYPE;
    v_es_captado BOOLEAN;
BEGIN
    IF TG_OP = 'INSERT' THEN
        v_es_captado := COALESCE(NEW.origen_captura, '') = 'whatsapp'
            OR (COALESCE(auth.role(), '') = 'service_role'
                AND NOT COALESCE(NEW.is_maximus, false)
                AND NEW.asesor_id IS NULL AND NEW.agente_id IS NULL
                AND COALESCE(NEW.origen_captura, '') = '');
    ELSE
        -- En ediciones: solo si alguien intenta volver a poner datos de contacto
        -- distintos en un inmueble captado que todavía no fue reclamado
        v_es_captado := COALESCE(NEW.origen_captura, '') = 'whatsapp'
            AND (NEW.asesor_nombre IS DISTINCT FROM OLD.asesor_nombre
                 OR NEW.asesor_telefono IS DISTINCT FROM OLD.asesor_telefono);
    END IF;

    IF NOT v_es_captado THEN
        RETURN NEW;
    END IF;

    SELECT * INTO v_cfg FROM public.config_captaciones WHERE id;

    -- Guarda (o actualiza) al asesor original, salvo que sea el propio contacto público
    IF public.normalizar_tel_ve(NEW.asesor_telefono) IS DISTINCT FROM public.normalizar_tel_ve(v_cfg.contacto_telefono)
       AND (NULLIF(trim(COALESCE(NEW.asesor_telefono, '')), '') IS NOT NULL
            OR NULLIF(trim(COALESCE(NEW.asesor_nombre, '')), '') IS NOT NULL) THEN
        INSERT INTO public.inmuebles_asesor_original (inmueble_id, nombre, telefono_original, telefono_digitos)
        VALUES (NEW.id::TEXT, NEW.asesor_nombre, NEW.asesor_telefono, public.normalizar_tel_ve(NEW.asesor_telefono))
        ON CONFLICT (inmueble_id) DO UPDATE
           SET nombre = COALESCE(EXCLUDED.nombre, inmuebles_asesor_original.nombre),
               telefono_original = COALESCE(EXCLUDED.telefono_original, inmuebles_asesor_original.telefono_original),
               telefono_digitos = COALESCE(NULLIF(EXCLUDED.telefono_digitos, ''), inmuebles_asesor_original.telefono_digitos);
    END IF;

    NEW.origen_captura  := 'whatsapp';
    NEW.asesor_nombre   := v_cfg.contacto_nombre;
    NEW.asesor_telefono := v_cfg.contacto_telefono;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_asesor_original ON public.inmuebles;
CREATE TRIGGER trg_proteger_asesor_original
    BEFORE INSERT OR UPDATE OF asesor_nombre, asesor_telefono ON public.inmuebles
    FOR EACH ROW EXECUTE FUNCTION public.proteger_asesor_original();

-- 6.6 Inmuebles captados que YA están publicados: mismo tratamiento (una sola vez)
DO $$
DECLARE v_cfg public.config_captaciones%ROWTYPE;
BEGIN
    IF NOT EXISTS (SELECT 1 FROM public.maximus_migraciones WHERE nombre = 'captados_a_jose_guerrero') THEN
        SELECT * INTO v_cfg FROM public.config_captaciones WHERE id;

        INSERT INTO public.inmuebles_asesor_original (inmueble_id, nombre, telefono_original, telefono_digitos)
        SELECT i.id::TEXT, i.asesor_nombre, i.asesor_telefono, public.normalizar_tel_ve(i.asesor_telefono)
          FROM public.inmuebles i
         WHERE NOT COALESCE(i.is_maximus, false)
           AND i.asesor_id IS NULL AND i.agente_id IS NULL
           AND COALESCE(i.origen_captura, '') = ''
           AND public.normalizar_tel_ve(i.asesor_telefono) IS DISTINCT FROM public.normalizar_tel_ve(v_cfg.contacto_telefono)
        ON CONFLICT (inmueble_id) DO NOTHING;

        -- El trigger de edición sí se dispara aquí, pero como el teléfono nuevo es el de
        -- José no guarda nada extra: el asesor original ya quedó copiado en el INSERT anterior
        UPDATE public.inmuebles i
           SET origen_captura  = 'whatsapp',
               asesor_nombre   = v_cfg.contacto_nombre,
               asesor_telefono = v_cfg.contacto_telefono
         WHERE NOT COALESCE(i.is_maximus, false)
           AND i.asesor_id IS NULL AND i.agente_id IS NULL
           AND COALESCE(i.origen_captura, '') = '';

        INSERT INTO public.maximus_migraciones (nombre) VALUES ('captados_a_jose_guerrero');
    END IF;
END $$;

-- 6.7 Datos públicos del asesor de un inmueble: nombre + plan (lo usan la ficha del
--     inmueble y el panel). Nunca devuelve el teléfono del asesor original.
--     Uso: POST /rest/v1/rpc/asesor_publico_inmueble  { "p_inmueble_id": "..." }
CREATE OR REPLACE FUNCTION public.asesor_publico_inmueble(p_inmueble_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_i    public.inmuebles%ROWTYPE;
    v_u    public.usuarios%ROWTYPE;
    v_cfg  public.config_captaciones%ROWTYPE;
    v_hay_usuario BOOLEAN;
    v_tel  TEXT;
BEGIN
    SELECT * INTO v_i FROM public.inmuebles WHERE id::TEXT = p_inmueble_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO v_cfg FROM public.config_captaciones WHERE id;

    SELECT u.* INTO v_u
      FROM public.usuarios u
     WHERE (v_i.asesor_id IS NOT NULL AND (u.auth_id::TEXT = v_i.asesor_id OR u.id::TEXT = v_i.asesor_id))
        OR (v_i.agente_id IS NOT NULL AND u.id = v_i.agente_id)
     LIMIT 1;
    v_hay_usuario := FOUND;

    IF v_hay_usuario THEN
        v_tel := regexp_replace(COALESCE(NULLIF(v_u.whatsapp, ''), NULLIF(v_u.telefono_e164, ''), v_u.telefono, ''), '[^0-9]', '', 'g');
    END IF;

    -- Equipo MAXIMUS
    IF v_hay_usuario AND v_u.rol IN ('admin', 'asesor_maximus') THEN
        RETURN jsonb_build_object(
            'nombre', v_u.nombre_completo, 'plan', 'equipo',
            'cargo', COALESCE(NULLIF(v_u.titulo, ''), 'Asesor MAXIMUS'),
            'whatsapp', v_tel, 'avatar_url', COALESCE(NULLIF(v_u.avatar_url, ''), NULLIF(v_u.avatar, '')),
            'es_equipo', true);
    END IF;

    -- Asesor con plan vigente (Bronce / Gold / Platinum)
    IF v_hay_usuario AND v_u.plan IN ('pro', 'gold', 'platinum')
       AND COALESCE(v_u.activo, true)
       AND (v_u.plan_vence_at IS NULL OR v_u.plan_vence_at > now()) THEN
        RETURN jsonb_build_object(
            'nombre', v_u.nombre_completo,
            'plan', CASE v_u.plan WHEN 'pro' THEN 'bronce' ELSE v_u.plan END,
            'cargo', 'Asesor Inmobiliario ' || CASE v_u.plan WHEN 'platinum' THEN 'Platinum' WHEN 'gold' THEN 'Gold' ELSE 'Bronce' END,
            'whatsapp', COALESCE(NULLIF(v_tel, ''), regexp_replace(COALESCE(v_i.asesor_telefono, ''), '[^0-9]', '', 'g')),
            'avatar_url', COALESCE(NULLIF(v_u.avatar_url, ''), NULLIF(v_u.avatar, '')),
            'es_equipo', false);
    END IF;

    -- Captado por el agente, sin nombre o con nombre genérico → contacto MAXIMUS
    IF COALESCE(v_i.origen_captura, '') = 'whatsapp'
       OR NULLIF(trim(COALESCE(v_i.asesor_nombre, '')), '') IS NULL
       OR v_i.asesor_nombre ~* '^\s*asesor'
       OR v_i.asesor_nombre = v_cfg.contacto_nombre THEN
        RETURN jsonb_build_object(
            'nombre', v_cfg.contacto_nombre, 'plan', 'equipo', 'cargo', 'Asesor MAXIMUS',
            'whatsapp', public.normalizar_tel_ve(v_cfg.contacto_telefono), 'avatar_url', NULL, 'es_equipo', true);
    END IF;

    -- Otro caso (asesor con plan vencido, carga manual): lo guardado en el inmueble
    RETURN jsonb_build_object(
        'nombre', v_i.asesor_nombre, 'plan', NULL, 'cargo', 'Asesor Inmobiliario',
        'whatsapp', public.normalizar_tel_ve(v_i.asesor_telefono), 'avatar_url', NULL, 'es_equipo', false);
END;
$$;

GRANT EXECUTE ON FUNCTION public.asesor_publico_inmueble(TEXT) TO anon, authenticated;

-- 6.8 Lista para el aviso por WhatsApp (solo el servidor / script del agente)
--     Un registro por asesor (agrupa sus inmuebles). Excluye: ya avisados, ya
--     reclamados, números inválidos o de prueba y quienes ya tienen un plan vigente.
--     "consultas" = clientes reales del CRM interesados en esos inmuebles.
CREATE OR REPLACE FUNCTION public.asesores_originales_por_avisar(p_limite INT DEFAULT 15)
RETURNS TABLE (
    telefono   TEXT,
    nombre     TEXT,
    inmuebles  JSONB,
    total      INT,
    consultas  INT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH base AS (
        SELECT o.telefono_digitos AS tel, o.nombre, i.id::TEXT AS iid, i.codigo, i.titulo, i.created_at
          FROM public.inmuebles_asesor_original o
          JOIN public.inmuebles i ON i.id::TEXT = o.inmueble_id
         WHERE o.avisado_at IS NULL
           AND o.reclamado_por IS NULL
           AND o.telefono_digitos ~ '^58[0-9]{10}$'
           AND o.telefono_digitos !~ '1234567$'
           AND COALESCE(i.estatus, 'disponible') IN ('disponible', 'reservado')
           AND NOT EXISTS (
                SELECT 1 FROM public.usuarios u
                 WHERE u.plan IN ('pro', 'gold', 'platinum')
                   AND (u.plan_vence_at IS NULL OR u.plan_vence_at > now())
                   AND public.normalizar_tel_ve(COALESCE(NULLIF(u.whatsapp, ''), NULLIF(u.telefono_e164, ''), u.telefono)) = o.telefono_digitos)
    )
    SELECT b.tel,
           (array_agg(b.nombre ORDER BY (b.nombre ~* '^\s*(asesor|aliado|inmobiliaria)') , b.created_at DESC)
                FILTER (WHERE NULLIF(trim(COALESCE(b.nombre, '')), '') IS NOT NULL))[1],
           jsonb_agg(jsonb_build_object('id', b.iid, 'codigo', b.codigo, 'titulo', b.titulo) ORDER BY b.created_at DESC),
           COUNT(*)::INT,
           (SELECT COUNT(*)::INT FROM public.leads l WHERE l.inmueble_interes_id::TEXT = ANY (array_agg(b.iid)))
      FROM base b
     GROUP BY b.tel
     ORDER BY COUNT(*) DESC
     LIMIT GREATEST(1, LEAST(COALESCE(p_limite, 15), 50));
$$;

REVOKE ALL ON FUNCTION public.asesores_originales_por_avisar(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.asesores_originales_por_avisar(INT) TO service_role;

-- 6.9 Marca como avisados (el script la llama después de cada envío exitoso)
CREATE OR REPLACE FUNCTION public.marcar_asesor_avisado(p_telefono TEXT)
RETURNS INT
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    WITH x AS (
        UPDATE public.inmuebles_asesor_original
           SET avisado_at = now(), avisos = avisos + 1
         WHERE telefono_digitos = public.normalizar_tel_ve(p_telefono)
        RETURNING 1
    ) SELECT COUNT(*)::INT FROM x;
$$;

REVOKE ALL ON FUNCTION public.marcar_asesor_avisado(TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.marcar_asesor_avisado(TEXT) TO service_role;

-- 6.10 Traspaso: cuando un asesor paga un plan con el mismo número desde el que
--      publicó en el grupo, sus inmuebles captados pasan a su nombre.
--      Lo llama la Edge Function de pagos justo después de activar el pago.
CREATE OR REPLACE FUNCTION public.reclamar_inmuebles_capturados(p_auth_id UUID)
RETURNS INT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_u   public.usuarios%ROWTYPE;
    v_tel TEXT;
    v_n   INT := 0;
BEGIN
    SELECT * INTO v_u FROM public.usuarios WHERE auth_id = p_auth_id;
    IF NOT FOUND OR v_u.plan NOT IN ('pro', 'gold', 'platinum') THEN RETURN 0; END IF;

    v_tel := public.normalizar_tel_ve(COALESCE(NULLIF(v_u.whatsapp, ''), NULLIF(v_u.telefono_e164, ''), v_u.telefono));
    IF v_tel !~ '^58[0-9]{10}$' THEN RETURN 0; END IF;

    UPDATE public.inmuebles i
       SET origen_captura  = 'whatsapp_reclamado',
           asesor_id       = v_u.auth_id::TEXT,
           asesor_nombre   = v_u.nombre_completo,
           asesor_telefono = '+' || v_tel
      FROM public.inmuebles_asesor_original o
     WHERE o.inmueble_id = i.id::TEXT
       AND o.telefono_digitos = v_tel
       AND o.reclamado_por IS NULL
       AND COALESCE(i.origen_captura, '') = 'whatsapp';
    GET DIAGNOSTICS v_n = ROW_COUNT;

    UPDATE public.inmuebles_asesor_original
       SET reclamado_por = p_auth_id, reclamado_at = now()
     WHERE telefono_digitos = v_tel AND reclamado_por IS NULL;

    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.reclamar_inmuebles_capturados(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.reclamar_inmuebles_capturados(UUID) TO service_role;

-- Consultas útiles para el admin:
--   Asesores originales y si ya se les avisó:
--     SELECT nombre, telefono_digitos, COUNT(*) inmuebles, MAX(avisado_at) avisado, MAX(reclamado_at) reclamado
--       FROM public.inmuebles_asesor_original GROUP BY nombre, telefono_digitos ORDER BY inmuebles DESC;
--   Cambiar el contacto público:
--     UPDATE public.config_captaciones SET contacto_nombre = 'José Guerrero', contacto_telefono = '+58 424-7835697';

NOTIFY pgrst, 'reload schema';


-- #####################################################################
-- PARTE 7 · OFICINAS ALIADAS (inmobiliarias que se registran en la red)
-- #####################################################################
-- Dos formas de entrar a la lista:
--   a) La inmobiliaria se registra desde el panel ("¿Inmobiliaria? Regístrate aquí")
--      → queda "pendiente" → n8n avisa por correo al admin.
--   b) El admin la crea directamente en el panel: Sitio web → Oficinas aliadas.
-- El admin la publica, la oculta, sube su logo y decide el orden desde ese panel.
-- En la landing solo se muestran las "aprobada": logo, nombre, zona y enlace.
-- El correo y el responsable NO se publican.

CREATE TABLE IF NOT EXISTS public.oficinas_aliadas (
    id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    nombre         TEXT NOT NULL,
    responsable    TEXT,                       -- obligatorio en el registro público; opcional si la carga el admin
    whatsapp       TEXT,                       -- solo dígitos, con 58
    email          TEXT,
    zona           TEXT NOT NULL,
    num_asesores   INT CHECK (num_asesores IS NULL OR num_asesores BETWEEN 1 AND 500),
    sitio_web      TEXT,                       -- web o Instagram
    descripcion    TEXT,
    logo_url       TEXT,                       -- lo sube el admin desde el panel
    -- pendiente = por revisar · aprobada = visible en la landing · oculta = guardada pero no visible · rechazada
    estado         TEXT NOT NULL DEFAULT 'pendiente' CHECK (estado IN ('pendiente', 'aprobada', 'oculta', 'rechazada')),
    destacada      BOOLEAN NOT NULL DEFAULT false,  -- aparece primero
    orden          INT NOT NULL DEFAULT 100,
    creado_por     UUID,                       -- auth.uid() si estaba con sesión
    notificado_at  TIMESTAMPTZ,                -- lo marca n8n al avisar al admin
    aprobada_at    TIMESTAMPTZ,
    created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_oficinas_aliadas_estado ON public.oficinas_aliadas (estado, destacada DESC, orden);
CREATE INDEX IF NOT EXISTS idx_oficinas_aliadas_whatsapp ON public.oficinas_aliadas (whatsapp, created_at DESC);

ALTER TABLE public.oficinas_aliadas ENABLE ROW LEVEL SECURITY;

-- Solo el admin ve y modera la tabla completa (los demás usan las funciones de abajo)
DROP POLICY IF EXISTS "oficinas_aliadas: admin lee" ON public.oficinas_aliadas;
CREATE POLICY "oficinas_aliadas: admin lee" ON public.oficinas_aliadas
    FOR SELECT TO authenticated
    USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin'));
DROP POLICY IF EXISTS "oficinas_aliadas: admin modera" ON public.oficinas_aliadas;
CREATE POLICY "oficinas_aliadas: admin modera" ON public.oficinas_aliadas
    FOR UPDATE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin'))
    WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin'));
DROP POLICY IF EXISTS "oficinas_aliadas: admin crea" ON public.oficinas_aliadas;
CREATE POLICY "oficinas_aliadas: admin crea" ON public.oficinas_aliadas
    FOR INSERT TO authenticated
    WITH CHECK (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin'));
DROP POLICY IF EXISTS "oficinas_aliadas: admin borra" ON public.oficinas_aliadas;
CREATE POLICY "oficinas_aliadas: admin borra" ON public.oficinas_aliadas
    FOR DELETE TO authenticated
    USING (EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin'));
REVOKE ALL ON public.oficinas_aliadas FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.oficinas_aliadas TO authenticated;
-- Los logos se suben al bucket público que ya existe: inmuebles-fotos/oficinas-aliadas/

-- 7.1 Registro (lo llama el formulario; público)
CREATE OR REPLACE FUNCTION public.registrar_oficina_aliada(
    p_nombre       TEXT,
    p_responsable  TEXT,
    p_whatsapp     TEXT,
    p_zona         TEXT,
    p_email        TEXT DEFAULT NULL,
    p_num_asesores INT  DEFAULT NULL,
    p_sitio_web    TEXT DEFAULT NULL,
    p_descripcion  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_wa TEXT := regexp_replace(COALESCE(p_whatsapp, ''), '[^0-9]', '', 'g');
    v_id UUID;
BEGIN
    IF char_length(trim(COALESCE(p_nombre, ''))) NOT BETWEEN 2 AND 80
       OR char_length(trim(COALESCE(p_responsable, ''))) NOT BETWEEN 2 AND 80
       OR char_length(trim(COALESCE(p_zona, ''))) NOT BETWEEN 2 AND 120
       OR char_length(COALESCE(p_email, '')) > 120
       OR char_length(COALESCE(p_sitio_web, '')) > 160
       OR char_length(COALESCE(p_descripcion, '')) > 400 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'datos_invalidos');
    END IF;
    IF NULLIF(trim(COALESCE(p_email, '')), '') IS NOT NULL AND p_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RETURN jsonb_build_object('ok', false, 'error', 'email_invalido');
    END IF;

    IF v_wa ~ '^0[0-9]{10}$' THEN v_wa := '58' || substr(v_wa, 2); END IF;
    IF char_length(v_wa) NOT BETWEEN 10 AND 15 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'whatsapp_invalido');
    END IF;

    -- Anti-spam: 2 por número cada 24 h y 30 en total cada 10 min
    IF (SELECT COUNT(*) FROM public.oficinas_aliadas WHERE whatsapp = v_wa AND created_at > now() - interval '24 hours') >= 2 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'ya_registrada');
    END IF;
    IF (SELECT COUNT(*) FROM public.oficinas_aliadas WHERE created_at > now() - interval '10 minutes') >= 30 THEN
        RETURN jsonb_build_object('ok', false, 'error', 'limite_global');
    END IF;

    INSERT INTO public.oficinas_aliadas (nombre, responsable, whatsapp, email, zona, num_asesores, sitio_web, descripcion, creado_por)
    VALUES (trim(p_nombre), trim(p_responsable), v_wa, NULLIF(lower(trim(COALESCE(p_email, ''))), ''), trim(p_zona),
            p_num_asesores, NULLIF(trim(COALESCE(p_sitio_web, '')), ''), NULLIF(trim(COALESCE(p_descripcion, '')), ''), auth.uid())
    RETURNING id INTO v_id;

    RETURN jsonb_build_object('ok', true, 'id', v_id);
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_oficina_aliada(TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.registrar_oficina_aliada(TEXT, TEXT, TEXT, TEXT, TEXT, INT, TEXT, TEXT) TO anon, authenticated;

-- 7.2 Listado público para la landing (solo aprobadas y solo datos públicos)
CREATE OR REPLACE FUNCTION public.listar_oficinas_aliadas()
RETURNS TABLE (
    id            UUID,
    nombre        TEXT,
    zona          TEXT,
    logo_url      TEXT,
    sitio_web     TEXT,
    whatsapp      TEXT,
    num_asesores  INT,
    descripcion   TEXT,
    destacada     BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT o.id, o.nombre, o.zona, o.logo_url, o.sitio_web, o.whatsapp, o.num_asesores, o.descripcion, o.destacada
      FROM public.oficinas_aliadas o
     WHERE o.estado = 'aprobada'
     ORDER BY o.destacada DESC, o.orden, o.aprobada_at NULLS LAST, o.nombre;
$$;

GRANT EXECUTE ON FUNCTION public.listar_oficinas_aliadas() TO anon, authenticated;

-- 7.3 Para n8n: toma el registro nuevo y lo marca como notificado (una sola vez)
CREATE OR REPLACE FUNCTION public.tomar_oficina_para_notificar(p_id UUID)
RETURNS SETOF public.oficinas_aliadas
LANGUAGE sql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
    UPDATE public.oficinas_aliadas
       SET notificado_at = now()
     WHERE id = p_id AND notificado_at IS NULL
    RETURNING *;
$$;

REVOKE ALL ON FUNCTION public.tomar_oficina_para_notificar(UUID) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomar_oficina_para_notificar(UUID) TO service_role;

-- Moderación: lo normal es hacerlo en el panel (Sitio web → Oficinas aliadas).
-- Equivalente en el SQL Editor, por si hiciera falta:
--   Ver pendientes:
--     SELECT id, nombre, responsable, whatsapp, email, zona, num_asesores, sitio_web, created_at
--       FROM public.oficinas_aliadas WHERE estado = 'pendiente' ORDER BY created_at;
--   Aprobar (opcional: logo y destacarla):
--     UPDATE public.oficinas_aliadas
--        SET estado = 'aprobada', aprobada_at = now(), logo_url = NULL, destacada = false
--      WHERE id = 'PEGA-AQUI-EL-ID';
--   Rechazar:
--     UPDATE public.oficinas_aliadas SET estado = 'rechazada' WHERE id = 'PEGA-AQUI-EL-ID';

NOTIFY pgrst, 'reload schema';


-- #####################################################################
-- PARTE 8 · RESEÑAS SOLO DE QUIEN CONTACTÓ AL ASESOR (todos los asesores)
-- #####################################################################
-- Reglas:
--   · Se puede calificar a CUALQUIER asesor de una ficha (equipo MAXIMUS, Bronce,
--     Gold, Platinum), no solo a Gold/Platinum.
--   · Solo puede calificar quien lo contactó desde la plataforma con su cuenta
--     (botones WhatsApp / Llamar de la ficha). Cada clic queda en contactos_asesor.
--   · El asesor del contacto lo decide el SERVIDOR a partir del inmueble: no se
--     puede registrar un contacto falso con otro asesor.
--   · Una reseña por cuenta y asesor (UNIQUE): si vuelve, la edita.
--   · Sin reseñas, la calificación que se muestra es 5.0.
-- =====================================================================

-- 8.1 Tabla de reseñas (por si migration-plan-platinum.sql no se ejecutó)
CREATE TABLE IF NOT EXISTS public.resenas_asesores (
    id             UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    asesor_auth_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    autor_auth_id  UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    autor_nombre   TEXT,
    estrellas      SMALLINT NOT NULL CHECK (estrellas BETWEEN 1 AND 5),
    comentario     TEXT CHECK (comentario IS NULL OR char_length(comentario) <= 600),
    oculto         BOOLEAN NOT NULL DEFAULT false,
    created_at     TIMESTAMPTZ DEFAULT now(),
    updated_at     TIMESTAMPTZ DEFAULT now(),
    UNIQUE (asesor_auth_id, autor_auth_id),
    CHECK (asesor_auth_id <> autor_auth_id)
);
CREATE INDEX IF NOT EXISTS idx_resenas_asesores_asesor
    ON public.resenas_asesores (asesor_auth_id, created_at DESC) WHERE oculto = false;

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
        IF NOT v_admin THEN NEW.oculto := false; END IF;
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
GRANT SELECT ON public.resenas_asesores TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.resenas_asesores TO authenticated;

-- 8.2 Cuenta (auth) del asesor que se muestra en la ficha de un inmueble.
--     Misma regla que asesor_publico_inmueble (Parte 6.7):
--       · inmueble ligado a un usuario (asesor_id / agente_id) → ese usuario
--       · captado de WhatsApp / sin nombre → el contacto MAXIMUS (José Guerrero),
--         buscado en usuarios por su teléfono o nombre
--       · otro caso → el usuario con el mismo teléfono que el inmueble, si existe
CREATE OR REPLACE FUNCTION public.asesor_auth_de_inmueble(p_inmueble_id TEXT)
RETURNS UUID
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_i   public.inmuebles%ROWTYPE;
    v_cfg public.config_captaciones%ROWTYPE;
    v_id  UUID;
    v_tel TEXT;
BEGIN
    SELECT * INTO v_i FROM public.inmuebles WHERE id::TEXT = p_inmueble_id;
    IF NOT FOUND THEN RETURN NULL; END IF;
    SELECT * INTO v_cfg FROM public.config_captaciones WHERE id;

    SELECT u.auth_id INTO v_id
      FROM public.usuarios u
     WHERE u.auth_id IS NOT NULL
       AND ((v_i.asesor_id IS NOT NULL AND (u.auth_id::TEXT = v_i.asesor_id OR u.id::TEXT = v_i.asesor_id))
         OR (v_i.agente_id IS NOT NULL AND u.id = v_i.agente_id))
     LIMIT 1;
    IF v_id IS NOT NULL THEN RETURN v_id; END IF;

    IF COALESCE(v_i.origen_captura, '') = 'whatsapp'
       OR NULLIF(trim(COALESCE(v_i.asesor_nombre, '')), '') IS NULL
       OR v_i.asesor_nombre ~* '^\s*asesor'
       OR v_i.asesor_nombre = v_cfg.contacto_nombre THEN
        v_tel := public.normalizar_tel_ve(v_cfg.contacto_telefono);
        SELECT u.auth_id INTO v_id
          FROM public.usuarios u
         WHERE u.auth_id IS NOT NULL
           AND (public.normalizar_tel_ve(COALESCE(NULLIF(u.whatsapp, ''), NULLIF(u.telefono_e164, ''), u.telefono)) = v_tel
                OR lower(trim(u.nombre_completo)) = lower(trim(v_cfg.contacto_nombre)))
         ORDER BY (u.rol IN ('admin', 'asesor_maximus')) DESC,
                  (public.normalizar_tel_ve(COALESCE(NULLIF(u.whatsapp, ''), NULLIF(u.telefono_e164, ''), u.telefono)) = v_tel) DESC
         LIMIT 1;
        RETURN v_id;
    END IF;

    v_tel := public.normalizar_tel_ve(v_i.asesor_telefono);
    IF COALESCE(v_tel, '') = '' THEN RETURN NULL; END IF;
    SELECT u.auth_id INTO v_id
      FROM public.usuarios u
     WHERE u.auth_id IS NOT NULL
       AND public.normalizar_tel_ve(COALESCE(NULLIF(u.whatsapp, ''), NULLIF(u.telefono_e164, ''), u.telefono)) = v_tel
     LIMIT 1;
    RETURN v_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.asesor_auth_de_inmueble(TEXT) TO anon, authenticated;

-- 8.3 Contactos: quién contactó a qué asesor, por qué inmueble y por qué medio
CREATE TABLE IF NOT EXISTS public.contactos_asesor (
    id                 UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    autor_auth_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    asesor_auth_id     UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    inmueble_id        TEXT NOT NULL,
    canal              TEXT NOT NULL CHECK (canal IN ('whatsapp', 'llamada')),
    veces              INT  NOT NULL DEFAULT 1,
    primer_contacto_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    ultimo_contacto_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    UNIQUE (autor_auth_id, asesor_auth_id, inmueble_id, canal),
    CHECK (autor_auth_id <> asesor_auth_id)
);
CREATE INDEX IF NOT EXISTS idx_contactos_asesor_par
    ON public.contactos_asesor (autor_auth_id, asesor_auth_id);
CREATE INDEX IF NOT EXISTS idx_contactos_asesor_asesor
    ON public.contactos_asesor (asesor_auth_id, ultimo_contacto_at DESC);

ALTER TABLE public.contactos_asesor ENABLE ROW LEVEL SECURITY;

-- Lo ve el cliente (sus contactos), el asesor (los que recibió) y el admin.
-- Nadie escribe directo en la tabla: solo con registrar_contacto_asesor().
DROP POLICY IF EXISTS "contactos_asesor: leer propios" ON public.contactos_asesor;
CREATE POLICY "contactos_asesor: leer propios" ON public.contactos_asesor
    FOR SELECT TO authenticated
    USING (
        autor_auth_id = auth.uid()
        OR asesor_auth_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin')
    );
REVOKE INSERT, UPDATE, DELETE ON public.contactos_asesor FROM anon, authenticated;
GRANT SELECT ON public.contactos_asesor TO authenticated;

-- 8.4 Registrar un contacto (lo llama la ficha al tocar WhatsApp o Llamar)
CREATE OR REPLACE FUNCTION public.registrar_contacto_asesor(p_inmueble_id TEXT, p_canal TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_autor  UUID := auth.uid();
    v_asesor UUID;
BEGIN
    IF v_autor IS NULL OR p_canal NOT IN ('whatsapp', 'llamada') THEN RETURN false; END IF;
    v_asesor := public.asesor_auth_de_inmueble(p_inmueble_id);
    IF v_asesor IS NULL OR v_asesor = v_autor THEN RETURN false; END IF;

    INSERT INTO public.contactos_asesor (autor_auth_id, asesor_auth_id, inmueble_id, canal)
    VALUES (v_autor, v_asesor, p_inmueble_id, p_canal)
    ON CONFLICT (autor_auth_id, asesor_auth_id, inmueble_id, canal)
    DO UPDATE SET veces = public.contactos_asesor.veces + 1,
                  ultimo_contacto_at = now();
    RETURN true;
END;
$$;

REVOKE ALL ON FUNCTION public.registrar_contacto_asesor(TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.registrar_contacto_asesor(TEXT, TEXT) TO authenticated;

-- 8.5 ¿El usuario actual contactó a este asesor?
CREATE OR REPLACE FUNCTION public.contacto_verificado(p_asesor_auth_id UUID)
RETURNS BOOLEAN
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT auth.uid() IS NOT NULL AND EXISTS (
        SELECT 1 FROM public.contactos_asesor c
         WHERE c.autor_auth_id = auth.uid() AND c.asesor_auth_id = p_asesor_auth_id
    );
$$;

GRANT EXECUTE ON FUNCTION public.contacto_verificado(UUID) TO anon, authenticated;

-- 8.6 Políticas de reseñas: leer visibles, crear SOLO con contacto, editar/borrar la propia
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
        AND public.contacto_verificado(asesor_auth_id)
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

-- 8.7 Resumen para la ficha: asesor, estrellas (5.0 sin reseñas), total, nombre,
--     y si el usuario actual lo contactó / ya lo calificó.
--     Uso: POST /rest/v1/rpc/resumen_resenas_inmueble  { "p_inmueble_id": "..." }
CREATE OR REPLACE FUNCTION public.resumen_resenas_inmueble(p_inmueble_id TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_asesor UUID := public.asesor_auth_de_inmueble(p_inmueble_id);
    v_total  INT;
    v_prom   NUMERIC;
    v_nombre TEXT;
    v_avatar TEXT;
BEGIN
    IF v_asesor IS NULL THEN RETURN NULL; END IF;
    SELECT COUNT(*)::INT, ROUND(AVG(estrellas)::NUMERIC, 1)
      INTO v_total, v_prom
      FROM public.resenas_asesores WHERE asesor_auth_id = v_asesor AND oculto = false;
    SELECT u.nombre_completo, COALESCE(NULLIF(u.avatar_url, ''), NULLIF(u.avatar, ''))
      INTO v_nombre, v_avatar
      FROM public.usuarios u WHERE u.auth_id = v_asesor LIMIT 1;
    RETURN jsonb_build_object(
        'asesor_auth_id', v_asesor,
        'nombre',         v_nombre,
        'avatar_url',     v_avatar,
        'estrellas',      CASE WHEN v_total = 0 THEN 5.0 ELSE v_prom END,
        'total_resenas',  v_total,
        'es_yo',          COALESCE(auth.uid() = v_asesor, false),
        'contacto',       public.contacto_verificado(v_asesor),
        'ya_reseno',      EXISTS (SELECT 1 FROM public.resenas_asesores r
                                   WHERE r.asesor_auth_id = v_asesor AND r.autor_auth_id = auth.uid())
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.resumen_resenas_inmueble(TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
