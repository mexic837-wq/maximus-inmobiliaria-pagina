-- =============================================================================
-- MAXIMUS · HISTÓRICO FASE 2: marcar inmuebles vendidos, recibos y edición de cierres
-- Fecha: 2026-11-24 · Necesita sql/migration-historico-real.sql (usa maximus_rol_actual).
--
--   A. marcar_inmueble_estatus(): único camino para pasar un inmueble a vendido /
--      alquilado / disponible. Solo admin y asesor_maximus (lo comprueba la base de
--      datos, no solo el botón del panel). Al quedar "vendido" deja de salir en el
--      catálogo público (que solo muestra estatus = 'disponible').
--   B. Número de recibo consecutivo por cierre (R-2026-0001...).
--   C. Auditoría: quién y cuándo editó un cierre.
--
-- Se puede ejecutar más de una vez.
-- =============================================================================

-- A. Cambiar el estado de un inmueble ------------------------------------------
CREATE OR REPLACE FUNCTION public.marcar_inmueble_estatus(p_id uuid, p_estatus text)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_row public.inmuebles%ROWTYPE;
BEGIN
    IF COALESCE(public.maximus_rol_actual(), '') NOT IN ('admin', 'asesor_maximus') THEN
        RAISE EXCEPTION 'Solo el administrador y los asesores MAXIMUS pueden cambiar el estado de un inmueble';
    END IF;
    IF p_estatus IS NULL OR p_estatus NOT IN ('disponible', 'vendido', 'alquilado') THEN
        RAISE EXCEPTION 'Estado no válido';
    END IF;

    UPDATE public.inmuebles SET estatus = p_estatus WHERE id = p_id RETURNING * INTO v_row;
    IF NOT FOUND THEN
        RAISE EXCEPTION 'Inmueble no encontrado';
    END IF;
    RETURN jsonb_build_object('id', v_row.id, 'estatus', v_row.estatus);
END;
$$;
REVOKE ALL ON FUNCTION public.marcar_inmueble_estatus(uuid, text) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.marcar_inmueble_estatus(uuid, text) TO authenticated;

-- B. Número de recibo ----------------------------------------------------------
ALTER TABLE public.cierres_ventas ADD COLUMN IF NOT EXISTS numero_recibo TEXT;
ALTER TABLE public.cierres_ventas ADD COLUMN IF NOT EXISTS editado_por   UUID;
ALTER TABLE public.cierres_ventas ADD COLUMN IF NOT EXISTS editado_at    TIMESTAMPTZ;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cierres_ventas_editado_por_fkey') THEN
        ALTER TABLE public.cierres_ventas ADD CONSTRAINT cierres_ventas_editado_por_fkey
            FOREIGN KEY (editado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL NOT VALID;
    END IF;
END $$;

CREATE SEQUENCE IF NOT EXISTS public.cierres_recibo_seq;

CREATE OR REPLACE FUNCTION public.cierres_numerar()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
    IF NEW.numero_recibo IS NULL THEN
        NEW.numero_recibo := 'R-' || to_char(COALESCE(NEW.fecha_cierre, CURRENT_DATE), 'YYYY')
                             || '-' || lpad(nextval('public.cierres_recibo_seq')::text, 4, '0');
    END IF;
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cierres_numerar ON public.cierres_ventas;
CREATE TRIGGER trg_cierres_numerar
    BEFORE INSERT ON public.cierres_ventas
    FOR EACH ROW EXECUTE FUNCTION public.cierres_numerar();

-- Los cierres que ya existen reciben su número (del más antiguo al más reciente)
DO $$
DECLARE r record;
BEGIN
    FOR r IN SELECT id, fecha_cierre FROM public.cierres_ventas
             WHERE numero_recibo IS NULL ORDER BY fecha_cierre, created_at
    LOOP
        UPDATE public.cierres_ventas
           SET numero_recibo = 'R-' || to_char(r.fecha_cierre, 'YYYY') || '-' || lpad(nextval('public.cierres_recibo_seq')::text, 4, '0')
         WHERE id = r.id;
    END LOOP;
END $$;

CREATE UNIQUE INDEX IF NOT EXISTS idx_cierres_numero_recibo ON public.cierres_ventas(numero_recibo);

-- C. Quién editó un cierre -----------------------------------------------------
CREATE OR REPLACE FUNCTION public.cierres_marcar_edicion()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
    -- Asignar el número de recibo no cuenta como edición
    IF OLD.numero_recibo IS NULL AND NEW.numero_recibo IS NOT NULL THEN
        RETURN NEW;
    END IF;
    NEW.editado_por := public.maximus_usuario_id();
    NEW.editado_at  := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cierres_marcar_edicion ON public.cierres_ventas;
CREATE TRIGGER trg_cierres_marcar_edicion
    BEFORE UPDATE ON public.cierres_ventas
    FOR EACH ROW EXECUTE FUNCTION public.cierres_marcar_edicion();

NOTIFY pgrst, 'reload schema';
