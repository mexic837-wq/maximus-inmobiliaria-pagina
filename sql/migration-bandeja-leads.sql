-- =============================================================================
-- MAXIMUS · BANDEJA DE LEADS CON CRONÓMETRO
-- Fecha: 2026-11-23 · Se puede ejecutar más de una vez.
--
-- Qué hace:
--   1. Columnas para medir la primera respuesta y no repetir avisos.
--   2. Quita la restricción de "origen" (los formularios usan etiquetas propias
--      como "ficha_detalle_web" y Supabase los rechazaba en silencio).
--   3. Asignación automática al crear un lead:
--        a) si ya trae un asesor del equipo, se respeta;
--        b) si es de un inmueble, va al asesor de ese inmueble;
--        c) si no, turno rotativo entre los asesores MAXIMUS activos.
--   4. Primera respuesta automática: al pasar de "nuevo" a otra etapa, o si el
--      lead lo crea el propio equipo desde el CRM. Una vez fijada no se cambia.
--   5. tomar_leads_para_avisar(): la llama n8n cada minuto. A los 5 min sin
--      respuesta avisa al asesor; a los 30 min, a dirección (admins). Deja
--      además una notificación dentro del panel.
-- =============================================================================

-- 0. ¿Quién es del equipo? (misma función de los permisos del CRM; se repite por si falta)
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
GRANT EXECUTE ON FUNCTION public.maximus_es_staff() TO anon, authenticated;

-- 1. Columnas ------------------------------------------------------------------
ALTER TABLE public.leads
    ADD COLUMN IF NOT EXISTS primera_respuesta_at TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS aviso_asesor_at      TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS aviso_direccion_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS asesor_id            TEXT,
    ADD COLUMN IF NOT EXISTS asesor_nombre        TEXT,
    ADD COLUMN IF NOT EXISTS agente_id            UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS ultimo_contacto_at   TIMESTAMPTZ,
    ADD COLUMN IF NOT EXISTS updated_at           TIMESTAMPTZ DEFAULT now();

CREATE INDEX IF NOT EXISTS idx_leads_sin_respuesta
    ON public.leads (created_at) WHERE primera_respuesta_at IS NULL;

-- 2. "origen" libre --------------------------------------------------------------
ALTER TABLE public.leads DROP CONSTRAINT IF EXISTS leads_origen_check;

-- 3. Datos que ya existían: lo trabajado cuenta como respondido y lo viejo no avisa
UPDATE public.leads
   SET primera_respuesta_at = COALESCE(updated_at, created_at)
 WHERE primera_respuesta_at IS NULL
   AND estatus IS DISTINCT FROM 'nuevo';

UPDATE public.leads
   SET aviso_asesor_at = now(), aviso_direccion_at = now()
 WHERE primera_respuesta_at IS NULL
   AND created_at < now() - interval '1 hour';

-- 4. Turno rotativo -------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.cola_leads (
    usuario_id           UUID PRIMARY KEY REFERENCES public.usuarios(id) ON DELETE CASCADE,
    ultima_asignacion_at TIMESTAMPTZ,
    total_asignados      INT NOT NULL DEFAULT 0
);
ALTER TABLE public.cola_leads ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.cola_leads FROM anon, authenticated;

-- 5. Al crear un lead: asignar y marcar ----------------------------------------
CREATE OR REPLACE FUNCTION public.leads_asignar_al_crear()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_id     uuid;
    v_nombre text;
    v_staff  boolean := public.maximus_es_staff();
BEGIN
    -- Nadie de fuera del equipo puede marcar su propio lead como atendido
    IF NOT v_staff THEN
        NEW.primera_respuesta_at := NULL;
        NEW.aviso_asesor_at := NULL;
        NEW.aviso_direccion_at := NULL;
    END IF;

    -- a) Asesor que ya trae el lead (solo si es del equipo y está activo)
    SELECT u.id, u.nombre_completo INTO v_id, v_nombre
      FROM public.usuarios u
     WHERE u.rol IN ('admin', 'asesor_maximus', 'asesor_externo', 'agente')
       AND COALESCE(u.activo, true)
       AND (u.id = NEW.agente_id OR u.id::text = NEW.asesor_id)
     LIMIT 1;

    -- b) Asesor del inmueble consultado
    IF v_id IS NULL AND NEW.inmueble_interes_id IS NOT NULL THEN
        SELECT u.id, u.nombre_completo INTO v_id, v_nombre
          FROM public.inmuebles i
          JOIN public.usuarios u
            ON u.id::text IN (to_jsonb(i) ->> 'agente_id', to_jsonb(i) ->> 'asesor_id')
         WHERE i.id = NEW.inmueble_interes_id
           AND u.rol IN ('admin', 'asesor_maximus', 'asesor_externo', 'agente')
           AND COALESCE(u.activo, true)
         LIMIT 1;
    END IF;

    -- c) Turno rotativo entre asesores MAXIMUS activos (el que lleva más sin recibir)
    IF v_id IS NULL THEN
        SELECT u.id, u.nombre_completo INTO v_id, v_nombre
          FROM public.usuarios u
          LEFT JOIN public.cola_leads c ON c.usuario_id = u.id
         WHERE u.rol = 'asesor_maximus'
           AND COALESCE(u.activo, true)
         ORDER BY c.ultima_asignacion_at NULLS FIRST, u.created_at
         LIMIT 1;
    END IF;

    IF v_id IS NOT NULL THEN
        NEW.agente_id     := v_id;
        NEW.asesor_id     := v_id::text;
        NEW.asesor_nombre := v_nombre;
        INSERT INTO public.cola_leads (usuario_id, ultima_asignacion_at, total_asignados)
        VALUES (v_id, now(), 1)
        ON CONFLICT (usuario_id) DO UPDATE
            SET ultima_asignacion_at = now(),
                total_asignados      = public.cola_leads.total_asignados + 1;
    END IF;

    -- Lead cargado por el propio equipo desde el CRM: ya está atendido
    IF NEW.primera_respuesta_at IS NULL AND (v_staff OR NEW.origen = 'crm_manual') THEN
        NEW.primera_respuesta_at := now();
    END IF;

    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_leads_asignar_al_crear ON public.leads;
CREATE TRIGGER trg_leads_asignar_al_crear
    BEFORE INSERT ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_asignar_al_crear();

-- 6. Al actualizar: primera respuesta y reasignación ---------------------------
CREATE OR REPLACE FUNCTION public.leads_marcar_respuesta()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
    IF OLD.primera_respuesta_at IS NOT NULL THEN
        NEW.primera_respuesta_at := OLD.primera_respuesta_at;          -- no se reescribe
    ELSIF NEW.primera_respuesta_at IS NULL AND NEW.estatus IS DISTINCT FROM 'nuevo' THEN
        NEW.primera_respuesta_at := now();                             -- cambió de etapa
    END IF;

    -- Reasignado sin responder: el nuevo asesor recibe su propio aviso
    IF NEW.primera_respuesta_at IS NULL AND NEW.agente_id IS DISTINCT FROM OLD.agente_id THEN
        NEW.aviso_asesor_at := NULL;
    END IF;
    RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_leads_marcar_respuesta ON public.leads;
CREATE TRIGGER trg_leads_marcar_respuesta
    BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION public.leads_marcar_respuesta();

-- 7. Avisos de 5 y 30 minutos (lo llama n8n con la service_role) -----------------
CREATE OR REPLACE FUNCTION public.tomar_leads_para_avisar()
RETURNS TABLE (
    tipo             text,
    lead_id          uuid,
    cliente          text,
    cliente_telefono text,
    origen           text,
    inmueble         text,
    minutos          int,
    asesor_nombre    text,
    destino_nombre   text,
    destino_whatsapp text
)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
BEGIN
    -- 5 minutos: al asesor asignado
    RETURN QUERY
    WITH t AS (
        UPDATE public.leads l
           SET aviso_asesor_at = now()
         WHERE l.primera_respuesta_at IS NULL
           AND l.estatus = 'nuevo'
           AND l.aviso_asesor_at IS NULL
           AND l.created_at <= now() - interval '5 minutes'
           AND l.created_at >  now() - interval '1 day'
        RETURNING l.*
    ), notif AS (
        INSERT INTO public.notificaciones (usuario_id, tipo, titulo, mensaje, metadata)
        SELECT t.agente_id, 'lead', 'Lead sin responder (5 min)',
               t.nombre || ' espera tu respuesta' ||
               COALESCE(' · ' || NULLIF(t.inmueble_interes_titulo, ''), ''),
               jsonb_build_object('lead_id', t.id, 'vista', 'view-bandeja-leads')
          FROM t WHERE t.agente_id IS NOT NULL
        RETURNING 1
    )
    SELECT 'asesor'::text, t.id, t.nombre::text, t.telefono::text, t.origen::text,
           t.inmueble_interes_titulo::text,
           (extract(epoch FROM now() - t.created_at) / 60)::int,
           u.nombre_completo::text, u.nombre_completo::text,
           CASE WHEN COALESCE(u.notif_whatsapp_leads, true) THEN u.telefono::text END
      FROM t LEFT JOIN public.usuarios u ON u.id = t.agente_id;

    -- 30 minutos: a dirección (cada admin activo)
    RETURN QUERY
    WITH t AS (
        UPDATE public.leads l
           SET aviso_direccion_at = now()
         WHERE l.primera_respuesta_at IS NULL
           AND l.estatus = 'nuevo'
           AND l.aviso_direccion_at IS NULL
           AND l.created_at <= now() - interval '30 minutes'
           AND l.created_at >  now() - interval '1 day'
        RETURNING l.*
    ), notif AS (
        INSERT INTO public.notificaciones (usuario_id, tipo, titulo, mensaje, metadata)
        SELECT a.id, 'alerta', 'Lead sin responder (30 min)',
               t.nombre || ' lleva 30 min sin respuesta' ||
               COALESCE(' · asesor: ' || NULLIF(t.asesor_nombre, ''), ' · sin asesor'),
               jsonb_build_object('lead_id', t.id, 'vista', 'view-bandeja-leads')
          FROM t JOIN public.usuarios a ON a.rol = 'admin' AND COALESCE(a.activo, true)
        RETURNING 1
    )
    SELECT 'direccion'::text, t.id, t.nombre::text, t.telefono::text, t.origen::text,
           t.inmueble_interes_titulo::text,
           (extract(epoch FROM now() - t.created_at) / 60)::int,
           COALESCE(u.nombre_completo, 'Sin asesor')::text, a.nombre_completo::text, a.telefono::text
      FROM t
      LEFT JOIN public.usuarios u ON u.id = t.agente_id
      JOIN public.usuarios a ON a.rol = 'admin' AND COALESCE(a.activo, true);
END $$;

REVOKE ALL ON FUNCTION public.tomar_leads_para_avisar() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.tomar_leads_para_avisar() TO service_role;

NOTIFY pgrst, 'reload schema';

-- Consultas útiles (opcional):
--   Tiempo de primera respuesta por asesor, últimos 30 días:
--   SELECT asesor_nombre, count(*) AS leads,
--          round(avg(extract(epoch FROM primera_respuesta_at - created_at) / 60)) AS min_promedio,
--          round(100.0 * avg((primera_respuesta_at - created_at <= interval '5 minutes')::int)) AS pct_5min
--     FROM public.leads
--    WHERE created_at > now() - interval '30 days' AND primera_respuesta_at IS NOT NULL
--    GROUP BY 1 ORDER BY 3;
