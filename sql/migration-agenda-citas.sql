-- ==============================================================================
-- MAXIMUS INMOBILIARIA - AGENDA DE VISITAS (tabla citas compatible con el CRM)
-- ==============================================================================
-- Ejecuta en el SQL Editor de Supabase (idempotente).
--
-- Problema: el CRM guarda las visitas con ids de texto ('lead-123', 'inm-5') y con
-- campos como cliente_nombre, ubicacion o asesor_nombre, pero la tabla original
-- usaba UUID con llaves foráneas y no tenía esas columnas. El guardado fallaba y
-- las visitas agendadas se perdían.
-- ==============================================================================

-- 1. Ids de texto: quitar las llaves foráneas a UUID y convertir las columnas
ALTER TABLE public.citas DROP CONSTRAINT IF EXISTS citas_inmueble_id_fkey;
ALTER TABLE public.citas DROP CONSTRAINT IF EXISTS citas_lead_id_fkey;

DO $$
BEGIN
    IF (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'citas' AND column_name = 'inmueble_id') <> 'text' THEN
        ALTER TABLE public.citas ALTER COLUMN inmueble_id TYPE TEXT USING inmueble_id::text;
    END IF;
    IF (SELECT data_type FROM information_schema.columns
         WHERE table_schema = 'public' AND table_name = 'citas' AND column_name = 'lead_id') <> 'text' THEN
        ALTER TABLE public.citas ALTER COLUMN lead_id TYPE TEXT USING lead_id::text;
    END IF;
END $$;

-- 2. Columnas que usa el CRM
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS cliente_nombre   TEXT;
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS cliente_email    TEXT;
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS cliente_telefono TEXT;
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS inmueble_titulo  TEXT;
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS ubicacion        TEXT;
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS asesor_nombre    TEXT;
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS estado           TEXT DEFAULT 'programada';

CREATE INDEX IF NOT EXISTS idx_citas_fecha_hora ON public.citas (fecha, hora);
CREATE INDEX IF NOT EXISTS idx_citas_lead_id    ON public.citas (lead_id);

-- 3. Permisos: los asesores pueden reprogramar y cancelar sus visitas
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Citas: actualizar auth" ON public.citas;
CREATE POLICY "Citas: actualizar auth" ON public.citas
    FOR UPDATE TO authenticated USING (true) WITH CHECK (true);

DROP POLICY IF EXISTS "Citas: borrar auth" ON public.citas;
CREATE POLICY "Citas: borrar auth" ON public.citas
    FOR DELETE TO authenticated USING (true);
