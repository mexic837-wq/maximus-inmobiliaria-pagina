-- =====================================================================
-- MAXIMUS INMOBILIARIA - Pagos de suscripción Asesor Pro (US$ 4.99/mes)
-- Métodos: Pago Móvil (Bs), Binance Pay (USDT), Stripe (tarjetas)
--
-- Principio: el navegador NUNCA activa un plan. Solo las Edge Functions
-- (service_role) o un admin pueden aprobar un pago y subir el rol.
-- Ejecutar completo en el SQL Editor de Supabase (es idempotente).
-- =====================================================================

-- ---------------------------------------------------------------------
-- 1. Columnas de plan en usuarios
-- ---------------------------------------------------------------------
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'free';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS plan_vence_at TIMESTAMPTZ;

-- ---------------------------------------------------------------------
-- 2. Blindaje: un usuario normal no puede cambiarse rol / plan / vencimiento.
--    (La política "actualizar propio" permitía auto-asignarse rol = 'admin'.)
--    Pasan: service_role, conexiones sin JWT de usuario (SQL editor) y admins.
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.proteger_campos_plan()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
    IF (NEW.rol IS DISTINCT FROM OLD.rol)
       OR (NEW.plan IS DISTINCT FROM OLD.plan)
       OR (NEW.plan_vence_at IS DISTINCT FROM OLD.plan_vence_at)
       OR (NEW.tipo_asesor IS DISTINCT FROM OLD.tipo_asesor) THEN

        IF auth.uid() IS NOT NULL
           AND COALESCE(auth.role(), '') <> 'service_role'
           AND NOT EXISTS (
               SELECT 1 FROM public.usuarios u
               WHERE u.auth_id = auth.uid() AND u.rol = 'admin'
           ) THEN
            RAISE EXCEPTION 'No autorizado para modificar rol/plan';
        END IF;
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_proteger_campos_plan ON public.usuarios;
CREATE TRIGGER trg_proteger_campos_plan
    BEFORE UPDATE ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.proteger_campos_plan();

-- ---------------------------------------------------------------------
-- 3. Pagos de suscripción (uno por intento de pago)
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pagos_suscripcion (
    id            UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    codigo        TEXT NOT NULL UNIQUE,                      -- MAX-XXXXXX (visible al usuario)
    auth_id       UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id       TEXT NOT NULL DEFAULT 'mensual',
    metodo        TEXT NOT NULL CHECK (metodo IN ('pago_movil', 'binance', 'stripe')),
    monto_usd     NUMERIC(10,2) NOT NULL,
    monto_local   NUMERIC(14,2),                             -- Bs. bloqueados al crear (solo pago móvil)
    tasa_bcv      NUMERIC(14,4),
    referencia    TEXT,                                      -- ref. bancaria o Binance ID que reporta el usuario
    proveedor_ref TEXT,                                      -- Stripe session id, etc.
    estado        TEXT NOT NULL DEFAULT 'pendiente'
                  CHECK (estado IN ('pendiente', 'verificando', 'aprobado', 'rechazado', 'expirado')),
    intentos      INT NOT NULL DEFAULT 0,                    -- veces que reportó referencia (anti fuerza bruta)
    expira_at     TIMESTAMPTZ NOT NULL DEFAULT (now() + interval '60 minutes'),
    aprobado_at   TIMESTAMPTZ,
    aprobado_por  TEXT,                                      -- stripe | n8n | binance-sync | admin
    metadata      JSONB DEFAULT '{}'::jsonb,
    created_at    TIMESTAMPTZ DEFAULT now(),
    updated_at    TIMESTAMPTZ DEFAULT now()
);

-- Una referencia bancaria / ID no puede usarse dos veces (salvo pagos rechazados)
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_susc_metodo_ref
    ON public.pagos_suscripcion (metodo, referencia)
    WHERE referencia IS NOT NULL AND estado <> 'rechazado';
CREATE UNIQUE INDEX IF NOT EXISTS uq_pagos_susc_proveedor_ref
    ON public.pagos_suscripcion (proveedor_ref) WHERE proveedor_ref IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_pagos_susc_auth ON public.pagos_suscripcion (auth_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_pagos_susc_estado ON public.pagos_suscripcion (estado, metodo);

DROP TRIGGER IF EXISTS trg_pagos_susc_updated ON public.pagos_suscripcion;
CREATE TRIGGER trg_pagos_susc_updated BEFORE UPDATE ON public.pagos_suscripcion
    FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- ---------------------------------------------------------------------
-- 4. Eventos entrantes (SMS del banco, movimientos de Binance)
--    Los llena n8n / binance-sync; la conciliación los cruza con los pagos.
-- ---------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.pagos_entrantes (
    id          UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    metodo      TEXT NOT NULL CHECK (metodo IN ('pago_movil', 'binance')),
    referencia  TEXT NOT NULL,                               -- ref. del banco / transactionId de Binance
    pagador     TEXT,                                        -- Binance ID del que paga, teléfono emisor, etc.
    monto       NUMERIC(14,2) NOT NULL,                      -- Bs (pago_movil) o USDT (binance)
    moneda      TEXT NOT NULL DEFAULT 'VES',
    ocurrido_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    usado       BOOLEAN NOT NULL DEFAULT false,
    pago_id     UUID REFERENCES public.pagos_suscripcion(id) ON DELETE SET NULL,
    raw         JSONB,
    created_at  TIMESTAMPTZ DEFAULT now(),
    UNIQUE (metodo, referencia)
);

-- ---------------------------------------------------------------------
-- 5. RLS: el usuario solo LEE sus pagos. Nadie escribe desde el cliente.
-- ---------------------------------------------------------------------
ALTER TABLE public.pagos_suscripcion ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos_entrantes   ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "pagos_susc: ver propios" ON public.pagos_suscripcion;
CREATE POLICY "pagos_susc: ver propios" ON public.pagos_suscripcion
    FOR SELECT TO authenticated
    USING (
        auth_id = auth.uid()
        OR EXISTS (SELECT 1 FROM public.usuarios u WHERE u.auth_id = auth.uid() AND u.rol = 'admin')
    );
-- pagos_entrantes: sin políticas = solo service_role (RLS bloquea al resto)

REVOKE INSERT, UPDATE, DELETE ON public.pagos_suscripcion FROM anon, authenticated;
REVOKE ALL ON public.pagos_entrantes FROM anon, authenticated;

-- ---------------------------------------------------------------------
-- 6. Activar un pago: aprueba y sube el plan (idempotente)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.activar_pago_suscripcion(p_pago_id UUID, p_por TEXT)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_pago  public.pagos_suscripcion%ROWTYPE;
    v_meses INT;
    v_base  TIMESTAMPTZ;
    v_vence TIMESTAMPTZ;
BEGIN
    SELECT * INTO v_pago FROM public.pagos_suscripcion WHERE id = p_pago_id FOR UPDATE;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false, 'error', 'pago_no_existe');
    END IF;
    IF v_pago.estado = 'aprobado' THEN
        RETURN jsonb_build_object('ok', true, 'ya_aprobado', true);
    END IF;

    v_meses := CASE v_pago.plan_id WHEN 'mensual' THEN 1 ELSE 1 END;

    SELECT GREATEST(now(), COALESCE(plan_vence_at, now())) INTO v_base
    FROM public.usuarios WHERE auth_id = v_pago.auth_id;
    v_vence := COALESCE(v_base, now()) + make_interval(months => v_meses);

    UPDATE public.pagos_suscripcion
       SET estado = 'aprobado', aprobado_at = now(), aprobado_por = p_por
     WHERE id = p_pago_id;

    UPDATE public.usuarios
       SET rol = CASE WHEN rol IN ('admin', 'asesor_maximus') THEN rol ELSE 'asesor_externo' END,
           tipo_asesor = CASE WHEN rol IN ('admin', 'asesor_maximus') THEN tipo_asesor ELSE 'externo' END,
           titulo = CASE WHEN rol IN ('admin', 'asesor_maximus') THEN titulo ELSE 'Asesor Inmobiliario Externo (Pro)' END,
           plan = 'pro',
           plan_vence_at = v_vence
     WHERE auth_id = v_pago.auth_id;

    RETURN jsonb_build_object('ok', true, 'vence', v_vence, 'codigo', v_pago.codigo);
END;
$$;

REVOKE ALL ON FUNCTION public.activar_pago_suscripcion(UUID, TEXT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.activar_pago_suscripcion(UUID, TEXT) TO service_role;

-- ---------------------------------------------------------------------
-- 7. Conciliación: cruza pagos "verificando" con eventos entrantes sin usar
--    - pago_movil: referencia termina igual + monto Bs dentro de ±2%
--    - binance: transactionId coincide O el Binance ID del pagador coincide,
--               y el monto recibido >= precio (acepta propina de centavos)
-- ---------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.conciliar_pagos()
RETURNS INT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    r        RECORD;
    v_total  INT := 0;
    v_por    TEXT;
BEGIN
    FOR r IN
        SELECT DISTINCT ON (e.id) p.id AS pago_id, e.id AS evento_id, e.metodo
          FROM public.pagos_suscripcion p
          JOIN public.pagos_entrantes e
            ON e.metodo = p.metodo
           AND e.usado = false
           AND e.ocurrido_at >= p.created_at - interval '2 minutes'
         WHERE p.estado = 'verificando'
           AND p.expira_at > now() - interval '1 day'   -- tolera confirmaciones tardías del banco
           AND p.referencia IS NOT NULL
           AND (
                (p.metodo = 'pago_movil'
                 AND length(p.referencia) >= 8
                 AND right(e.referencia, length(p.referencia)) = p.referencia
                 AND abs(e.monto - p.monto_local) <= p.monto_local * 0.02)
             OR (p.metodo = 'binance'
                 AND (e.referencia = p.referencia OR e.pagador = p.referencia)
                 AND e.monto >= p.monto_usd - 0.01)
           )
         ORDER BY e.id, p.created_at
    LOOP
        v_por := CASE r.metodo WHEN 'binance' THEN 'binance-sync' ELSE 'n8n' END;
        PERFORM public.activar_pago_suscripcion(r.pago_id, v_por);
        UPDATE public.pagos_entrantes SET usado = true, pago_id = r.pago_id WHERE id = r.evento_id;
        v_total := v_total + 1;
    END LOOP;
    RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.conciliar_pagos() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.conciliar_pagos() TO service_role;

-- ---------------------------------------------------------------------
-- 8. Vencimientos: baja a 'cliente' a quien no renovó
--    Programar diario (requiere extensión pg_cron):
--      SELECT cron.schedule('expirar-suscripciones', '5 4 * * *',
--             $$SELECT public.expirar_suscripciones()$$);
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
    RETURN v_n;
END;
$$;

REVOKE ALL ON FUNCTION public.expirar_suscripciones() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.expirar_suscripciones() TO service_role;
