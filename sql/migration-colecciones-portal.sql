-- =============================================================================
-- MAXIMUS · COLECCIONES: enlace directo / QR, portal del cliente y reacciones
-- Fecha: 2026-11-25 · Necesita las funciones de apoyo de:
--   migration-fase2-cliente-asesor.sql  (maximus_es_staff, maximus_email_actual)
--   migration-historico-real.sql        (maximus_usuario_id, maximus_rol_actual)
--
--   A. Cada colección tiene un enlace secreto (token). Quien lo recibe la ve sin cuenta.
--   B. El cliente marca cada inmueble «Me interesa» / «No me interesa» (+ comentario).
--      Queda en la colección y, si está ligada a un cliente del CRM, en su bitácora.
--   C. Se cuentan las visitas del enlace (no cuentan las del equipo).
--   D. Permisos reales: el administrador ve todo; cada asesor solo las suyas; el cliente
--      solo las que llevan su correo. Antes cualquier miembro del equipo veía todas.
--
-- Se puede ejecutar más de una vez.
-- =============================================================================

-- 0. Funciones de apoyo (por si faltan) ----------------------------------------
CREATE OR REPLACE FUNCTION public.maximus_usuario_id()
RETURNS uuid LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.usuarios WHERE auth_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.maximus_rol_actual()
RETURNS text LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT rol FROM public.usuarios WHERE auth_id = auth.uid() LIMIT 1 $$;

CREATE OR REPLACE FUNCTION public.normalizar_tel_ve(p TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE
AS $$ SELECT CASE WHEN d ~ '^0[0-9]{10}$' THEN '58' || substr(d, 2) WHEN d ~ '^4[0-9]{9}$' THEN '58' || d ELSE d END
      FROM (SELECT regexp_replace(COALESCE(p, ''), '[^0-9]', '', 'g') AS d) x; $$;

GRANT EXECUTE ON FUNCTION public.maximus_usuario_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.maximus_rol_actual() TO authenticated;

-- 1. Columnas nuevas -----------------------------------------------------------
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS email         VARCHAR(255);
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS asesor_email  VARCHAR(255);
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS asesor_id     VARCHAR(100);
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS creado_por    VARCHAR(100);
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS token         TEXT;
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS reacciones    JSONB NOT NULL DEFAULT '{}'::jsonb;
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS vistas        INT   NOT NULL DEFAULT 0;
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS visto_at      TIMESTAMPTZ;
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS enviada_at    TIMESTAMPTZ;
ALTER TABLE public.colecciones_vip ADD COLUMN IF NOT EXISTS lead_id       UUID;

DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'colecciones_vip_lead_id_fkey') THEN
        ALTER TABLE public.colecciones_vip ADD CONSTRAINT colecciones_vip_lead_id_fkey
            FOREIGN KEY (lead_id) REFERENCES public.leads(id) ON DELETE SET NULL NOT VALID;
    END IF;
END $$;

-- Token secreto (sin extensiones: gen_random_uuid es parte de Postgres)
UPDATE public.colecciones_vip SET token = replace(gen_random_uuid()::text, '-', '') WHERE token IS NULL;
ALTER TABLE public.colecciones_vip ALTER COLUMN token SET DEFAULT replace(gen_random_uuid()::text, '-', '');
CREATE UNIQUE INDEX IF NOT EXISTS idx_colecciones_vip_token ON public.colecciones_vip(token);
CREATE INDEX IF NOT EXISTS idx_colecciones_vip_email_lower ON public.colecciones_vip (lower(email));

-- 2. Permisos reales -----------------------------------------------------------
ALTER TABLE public.colecciones_vip ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'colecciones_vip'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.colecciones_vip', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "Colecciones: admin gestiona todo" ON public.colecciones_vip
    FOR ALL TO authenticated
    USING (public.maximus_rol_actual() = 'admin')
    WITH CHECK (public.maximus_rol_actual() = 'admin');

CREATE POLICY "Colecciones: el asesor ve las suyas" ON public.colecciones_vip
    FOR SELECT TO authenticated
    USING (public.maximus_es_staff() AND (
        asesor_id::text = public.maximus_usuario_id()::text
        OR creado_por::text = public.maximus_usuario_id()::text
        OR lower(trim(asesor_email)) = public.maximus_email_actual()));

CREATE POLICY "Colecciones: el asesor crea las suyas" ON public.colecciones_vip
    FOR INSERT TO authenticated
    WITH CHECK (public.maximus_es_staff() AND (
        asesor_id::text = public.maximus_usuario_id()::text
        OR lower(trim(asesor_email)) = public.maximus_email_actual()));

CREATE POLICY "Colecciones: el asesor edita las suyas" ON public.colecciones_vip
    FOR UPDATE TO authenticated
    USING (public.maximus_es_staff() AND (
        asesor_id::text = public.maximus_usuario_id()::text
        OR lower(trim(asesor_email)) = public.maximus_email_actual()))
    WITH CHECK (public.maximus_es_staff() AND (
        asesor_id::text = public.maximus_usuario_id()::text
        OR lower(trim(asesor_email)) = public.maximus_email_actual()));

CREATE POLICY "Colecciones: el asesor borra las suyas" ON public.colecciones_vip
    FOR DELETE TO authenticated
    USING (public.maximus_es_staff() AND (
        asesor_id::text = public.maximus_usuario_id()::text
        OR lower(trim(asesor_email)) = public.maximus_email_actual()));

CREATE POLICY "Colecciones: el cliente ve las suyas" ON public.colecciones_vip
    FOR SELECT TO authenticated
    USING (lower(trim(email)) = public.maximus_email_actual());

-- 3. Ver una colección con su enlace (sin cuenta) -------------------------------
CREATE OR REPLACE FUNCTION public.ver_coleccion_publica(p_id TEXT, p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    c       public.colecciones_vip%ROWTYPE;
    v_inm   jsonb;
    v_ase   jsonb;
    v_ids   jsonb;
BEGIN
    IF p_id IS NULL OR p_token IS NULL OR char_length(p_token) < 16 THEN
        RETURN jsonb_build_object('ok', false);
    END IF;

    SELECT * INTO c FROM public.colecciones_vip WHERE id::text = p_id AND token = p_token;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false);
    END IF;

    -- Las visitas del equipo no cuentan
    IF NOT public.maximus_es_staff() THEN
        UPDATE public.colecciones_vip SET vistas = vistas + 1, visto_at = now() WHERE id = c.id;
    END IF;

    -- Ids de inmuebles (la columna puede ser jsonb o text[])
    v_ids := COALESCE(to_jsonb(c.inmuebles), '[]'::jsonb);

    SELECT COALESCE(jsonb_agg(jsonb_build_object(
               'id', i.id,
               'codigo', to_jsonb(i) ->> 'codigo',
               'titulo', i.titulo,
               'precio', i.precio,
               'moneda', COALESCE(i.moneda, 'USD'),
               'operacion', i.operacion,
               'estatus', COALESCE(i.estatus, 'disponible'),
               'ubicacion', i.ubicacion,
               'habitaciones', i.habitaciones,
               'banos', i.banos,
               'm2', i.metros_cuadrados,
               'estacionamientos', to_jsonb(i) ->> 'estacionamientos',
               'foto', COALESCE(NULLIF(to_jsonb(i) ->> 'foto_principal', ''), (to_jsonb(i) -> 'fotos') ->> 0)
           ) ORDER BY (SELECT ord FROM jsonb_array_elements_text(v_ids) WITH ORDINALITY AS t(val, ord) WHERE t.val = i.id::text LIMIT 1)), '[]'::jsonb)
      INTO v_inm
      FROM public.inmuebles i
     WHERE i.id::text IN (SELECT jsonb_array_elements_text(v_ids));

    -- Si los inmuebles ya no existen, se usa la copia guardada al crear la colección
    IF jsonb_array_length(v_inm) = 0 AND jsonb_typeof(c.inmuebles_detalle) = 'array' THEN
        v_inm := c.inmuebles_detalle;
    END IF;

    SELECT jsonb_build_object(
               'nombre', u.nombre_completo,
               'telefono', public.normalizar_tel_ve(u.telefono),
               'avatar', u.avatar_url,
               'titulo', u.titulo)
      INTO v_ase
      FROM public.usuarios u
     WHERE u.id::text = c.asesor_id::text OR lower(u.email) = lower(trim(c.asesor_email))
     LIMIT 1;

    RETURN jsonb_build_object(
        'ok', true,
        'id', c.id,
        'cliente', split_part(COALESCE(c.cliente, ''), ' ', 1),
        'titulo', c.titulo,
        'nota', c.nota,
        'fecha', c.fecha,
        'asesor', COALESCE(v_ase, jsonb_build_object(
            'nombre', COALESCE(NULLIF(c.asesor_nombre, ''), NULLIF(c.asesor, ''), 'Tu asesor MAXIMUS'),
            'telefono', NULL, 'avatar', NULL, 'titulo', 'Asesor MAXIMUS')),
        'inmuebles', v_inm,
        'reacciones', COALESCE(c.reacciones, '{}'::jsonb)
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.ver_coleccion_publica(TEXT, TEXT) TO anon, authenticated;

-- 4. Reaccionar a un inmueble de la colección ----------------------------------
CREATE OR REPLACE FUNCTION public.reaccionar_coleccion(
    p_id TEXT, p_token TEXT, p_inmueble TEXT, p_reaccion TEXT, p_comentario TEXT DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    c        public.colecciones_vip%ROWTYPE;
    v_com    TEXT := NULLIF(left(trim(COALESCE(p_comentario, '')), 500), '');
    v_titulo TEXT;
    v_nueva  jsonb;
    v_ids    jsonb;
BEGIN
    IF p_id IS NULL OR p_token IS NULL OR char_length(p_token) < 16 THEN
        RETURN jsonb_build_object('ok', false);
    END IF;
    IF p_reaccion IS NULL OR p_reaccion NOT IN ('me_interesa', 'no_me_interesa', 'quitar') THEN
        RETURN jsonb_build_object('ok', false);
    END IF;

    SELECT * INTO c FROM public.colecciones_vip WHERE id::text = p_id AND token = p_token;
    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false);
    END IF;

    v_ids := COALESCE(to_jsonb(c.inmuebles), '[]'::jsonb);
    IF NOT EXISTS (SELECT 1 FROM jsonb_array_elements_text(v_ids) e WHERE e = p_inmueble) THEN
        RETURN jsonb_build_object('ok', false);
    END IF;

    IF p_reaccion = 'quitar' THEN
        v_nueva := COALESCE(c.reacciones, '{}'::jsonb) - p_inmueble;
    ELSE
        v_nueva := COALESCE(c.reacciones, '{}'::jsonb)
                   || jsonb_build_object(p_inmueble, jsonb_build_object('r', p_reaccion, 'c', v_com, 'at', now()));
    END IF;

    UPDATE public.colecciones_vip SET reacciones = v_nueva WHERE id = c.id;

    -- Nota en la bitácora del cliente del CRM (si la colección está ligada a uno)
    IF c.lead_id IS NOT NULL AND p_reaccion <> 'quitar' THEN
        SELECT titulo INTO v_titulo FROM public.inmuebles WHERE id::text = p_inmueble;
        BEGIN
            INSERT INTO public.lead_actividades (lead_id, tipo, descripcion, metadata)
            VALUES (c.lead_id, 'nota',
                    COALESCE(NULLIF(split_part(c.cliente, ' ', 1), ''), 'El cliente')
                      || CASE WHEN p_reaccion = 'me_interesa' THEN ' marcó «Me interesa»' ELSE ' marcó «No me interesa»' END
                      || ' en «' || COALESCE(v_titulo, 'un inmueble') || '» de la colección «' || COALESCE(c.titulo, '') || '».'
                      || COALESCE(' Comentó: ' || v_com, ''),
                    jsonb_build_object('titulo', 'Reacción a la colección', 'autor', COALESCE(c.cliente, 'Cliente'), 'tipo', 'nota'));
        EXCEPTION WHEN OTHERS THEN
            NULL;  -- la reacción ya quedó guardada; la bitácora es un extra
        END;
    END IF;

    RETURN jsonb_build_object('ok', true, 'reacciones', v_nueva);
END;
$$;
GRANT EXECUTE ON FUNCTION public.reaccionar_coleccion(TEXT, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated;

-- 5. Renovar el enlace (el anterior deja de funcionar) --------------------------
CREATE OR REPLACE FUNCTION public.renovar_token_coleccion(p_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_token TEXT;
BEGIN
    UPDATE public.colecciones_vip
       SET token = replace(gen_random_uuid()::text, '-', '')
     WHERE id::text = p_id
       AND (public.maximus_rol_actual() = 'admin'
            OR (public.maximus_es_staff() AND (
                  asesor_id::text = public.maximus_usuario_id()::text
                  OR lower(trim(asesor_email)) = public.maximus_email_actual())))
    RETURNING token INTO v_token;

    IF v_token IS NULL THEN
        RAISE EXCEPTION 'No tienes permiso para renovar este enlace';
    END IF;
    RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.renovar_token_coleccion(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.renovar_token_coleccion(TEXT) TO authenticated;

NOTIFY pgrst, 'reload schema';

-- =============================================================================
-- OPCIONAL (revisar antes): las 3 colecciones de demostración de la migración vieja
-- (col-1, col-2, col-3) tienen asesores de prueba. Para verlas:
--     SELECT id, cliente, titulo, asesor FROM public.colecciones_vip ORDER BY created_at DESC;
-- Si son de prueba, se borran con:
--     DELETE FROM public.colecciones_vip WHERE id IN ('col-1', 'col-2', 'col-3');
-- =============================================================================
