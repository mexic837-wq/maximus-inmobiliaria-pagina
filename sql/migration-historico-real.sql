-- =============================================================================
-- MAXIMUS · HISTÓRICO DE ASESORES & COMISIONES con datos reales
-- Fecha: 2026-11-24
--
-- Antes: cierres_ventas tenía políticas "USING (true)" para el rol público: cualquiera,
-- incluso sin iniciar sesión, podía leer, cambiar y BORRAR las comisiones. Además
-- tenía 6 filas de demostración (asesor_id vacío) y los cierres nuevos casi nunca
-- llegaban a Supabase (el panel mandaba ids que no eran UUID).
--
-- Después:
--   · Relaciones reales: cierres_ventas.asesor_id → usuarios, inmueble_id → inmuebles,
--     lead_id → leads (cliente del CRM) y registrado_por → usuarios.
--   · Las comisiones (bruta, neta, oficina) las calcula la base de datos, no el navegador.
--   · Permisos: admin y asesor_maximus ven y registran todo; cada asesor ve solo lo suyo;
--     solo el admin elimina.
--
-- Necesita las funciones de la Parte 11 (maximus_es_staff). Se puede ejecutar más de una vez.
-- =============================================================================

-- 1. Funciones de apoyo --------------------------------------------------------
CREATE OR REPLACE FUNCTION public.maximus_usuario_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.usuarios WHERE auth_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.maximus_rol_actual()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT rol FROM public.usuarios WHERE auth_id = auth.uid() LIMIT 1 $$;

GRANT EXECUTE ON FUNCTION public.maximus_usuario_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.maximus_rol_actual() TO authenticated;

-- 2. Columnas nuevas -----------------------------------------------------------
ALTER TABLE public.cierres_ventas ADD COLUMN IF NOT EXISTS lead_id        UUID;
ALTER TABLE public.cierres_ventas ADD COLUMN IF NOT EXISTS registrado_por UUID;
ALTER TABLE public.cierres_ventas ADD COLUMN IF NOT EXISTS liquidada_at   TIMESTAMPTZ;

-- 3. Llaves foráneas (solo si faltan; NOT VALID para no fallar por filas viejas) -
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cierres_ventas_asesor_id_fkey') THEN
        ALTER TABLE public.cierres_ventas ADD CONSTRAINT cierres_ventas_asesor_id_fkey
            FOREIGN KEY (asesor_id) REFERENCES public.usuarios(id) ON DELETE SET NULL NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cierres_ventas_inmueble_id_fkey') THEN
        ALTER TABLE public.cierres_ventas ADD CONSTRAINT cierres_ventas_inmueble_id_fkey
            FOREIGN KEY (inmueble_id) REFERENCES public.inmuebles(id) ON DELETE SET NULL NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cierres_ventas_lead_id_fkey') THEN
        ALTER TABLE public.cierres_ventas ADD CONSTRAINT cierres_ventas_lead_id_fkey
            FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL NOT VALID;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'cierres_ventas_registrado_por_fkey') THEN
        ALTER TABLE public.cierres_ventas ADD CONSTRAINT cierres_ventas_registrado_por_fkey
            FOREIGN KEY (registrado_por) REFERENCES public.usuarios(id) ON DELETE SET NULL NOT VALID;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_cierres_lead_id  ON public.cierres_ventas(lead_id);
CREATE INDEX IF NOT EXISTS idx_cierres_inmueble ON public.cierres_ventas(inmueble_id);

-- 4. Las comisiones las calcula la base de datos -------------------------------
CREATE OR REPLACE FUNCTION public.cierres_calcular()
RETURNS trigger LANGUAGE plpgsql
AS $$
BEGIN
    NEW.comision_bruta_monto   := round(NEW.precio_final * NEW.comision_bruta_porcentaje / 100);
    NEW.comision_neta_asesor   := round(NEW.comision_bruta_monto * NEW.asesor_porcentaje_neto / 100);
    NEW.comision_oficina_monto := NEW.comision_bruta_monto - NEW.comision_neta_asesor;
    IF NEW.estatus_comision = 'liquidada' THEN
        NEW.liquidada_at := COALESCE(NEW.liquidada_at, now());
    ELSE
        NEW.liquidada_at := NULL;
    END IF;
    NEW.updated_at := now();
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_cierres_calcular ON public.cierres_ventas;
CREATE TRIGGER trg_cierres_calcular
    BEFORE INSERT OR UPDATE OF precio_final, comision_bruta_porcentaje, asesor_porcentaje_neto, estatus_comision
    ON public.cierres_ventas
    FOR EACH ROW EXECUTE FUNCTION public.cierres_calcular();

-- 5. Permisos reales -----------------------------------------------------------
ALTER TABLE public.cierres_ventas ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'cierres_ventas'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.cierres_ventas', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "Cierres: admin y asesor MAXIMUS ven todo" ON public.cierres_ventas
    FOR SELECT TO authenticated
    USING (public.maximus_rol_actual() IN ('admin', 'asesor_maximus'));

CREATE POLICY "Cierres: cada asesor ve los suyos" ON public.cierres_ventas
    FOR SELECT TO authenticated
    USING (asesor_id IS NOT NULL AND asesor_id = public.maximus_usuario_id());

CREATE POLICY "Cierres: admin y asesor MAXIMUS registran" ON public.cierres_ventas
    FOR INSERT TO authenticated
    WITH CHECK (public.maximus_rol_actual() IN ('admin', 'asesor_maximus'));

CREATE POLICY "Cierres: admin y asesor MAXIMUS actualizan" ON public.cierres_ventas
    FOR UPDATE TO authenticated
    USING (public.maximus_rol_actual() IN ('admin', 'asesor_maximus'))
    WITH CHECK (public.maximus_rol_actual() IN ('admin', 'asesor_maximus'));

CREATE POLICY "Cierres: solo admin elimina" ON public.cierres_ventas
    FOR DELETE TO authenticated
    USING (public.maximus_rol_actual() = 'admin');

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- OPCIONAL (revisar antes): las 6 filas de demostración de la migración vieja
-- tienen asesor_id vacío y nombres inventados (Valeria Méndez, Pedro Rivas...).
-- Para verlas:
--     SELECT id, fecha_cierre, inmueble_titulo, asesor_nombre, precio_final
--       FROM public.cierres_ventas WHERE asesor_id IS NULL ORDER BY fecha_cierre DESC;
-- Si TODAS son de prueba, se borran con:
--     DELETE FROM public.cierres_ventas WHERE asesor_id IS NULL;
-- =============================================================================
