-- ==============================================================================
-- MAXIMUS INMOBILIARIA - ALERTAS DE BÚSQUEDA AUTOMÁTICAS (Cuenta gratuita)
-- ==============================================================================
-- Ejecuta este script en el SQL Editor de Supabase (una sola vez; es idempotente).
--
-- Flujo:
--   1. El cliente crea una alerta desde el catálogo (tabla alertas_busqueda).
--   2. El workflow n8n "workflow-alertas-busqueda.json" llama cada hora a
--      procesar_alertas_busqueda() con la service_role key.
--   3. La función cruza las alertas activas con los inmuebles publicados DESPUÉS
--      de crear cada alerta, registra lo enviado (sin duplicados), crea la
--      notificación dentro de la app y devuelve una fila por alerta con sus
--      inmuebles para que n8n envíe el correo.
-- ==============================================================================

-- 1. Tabla de alertas ----------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.alertas_busqueda (
    id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    auth_id          UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    email            TEXT,
    nombre           TEXT,
    telefono         TEXT,
    operacion        TEXT CHECK (operacion IS NULL OR operacion IN ('venta', 'alquiler')),
    tipo             TEXT,          -- casa, departamento, local, fincas, galpones, casa_de_campo
    zona             TEXT,          -- clave de zona (ej: pueblo-nuevo)
    zona_label       TEXT,          -- texto visible (ej: Pueblo Nuevo)
    precio_min       NUMERIC(14,2),
    precio_max       NUMERIC(14,2),
    habitaciones_min INT,
    banos_min        NUMERIC(3,1),
    texto            TEXT,
    resumen          TEXT NOT NULL,
    activa           BOOLEAN NOT NULL DEFAULT true,
    ultimo_aviso     TIMESTAMPTZ,
    total_avisos     INT NOT NULL DEFAULT 0,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alertas_busqueda_auth   ON public.alertas_busqueda (auth_id);
CREATE INDEX IF NOT EXISTS idx_alertas_busqueda_activa ON public.alertas_busqueda (activa) WHERE activa;

-- 2. Registro de avisos enviados (evita mandar el mismo inmueble dos veces) ----
CREATE TABLE IF NOT EXISTS public.alertas_busqueda_envios (
    alerta_id   UUID NOT NULL REFERENCES public.alertas_busqueda(id) ON DELETE CASCADE,
    inmueble_id TEXT NOT NULL,
    enviado_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    PRIMARY KEY (alerta_id, inmueble_id)
);

-- 3. RLS: cada cliente solo ve y gestiona sus propias alertas (máx. 10) --------
ALTER TABLE public.alertas_busqueda        ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alertas_busqueda_envios ENABLE ROW LEVEL SECURITY;  -- sin políticas: solo service_role

DROP POLICY IF EXISTS "Alertas: ver propias"        ON public.alertas_busqueda;
DROP POLICY IF EXISTS "Alertas: crear propias"      ON public.alertas_busqueda;
DROP POLICY IF EXISTS "Alertas: actualizar propias" ON public.alertas_busqueda;
DROP POLICY IF EXISTS "Alertas: borrar propias"     ON public.alertas_busqueda;

CREATE POLICY "Alertas: ver propias" ON public.alertas_busqueda
    FOR SELECT TO authenticated USING (auth_id = auth.uid());

CREATE POLICY "Alertas: crear propias" ON public.alertas_busqueda
    FOR INSERT TO authenticated
    WITH CHECK (
        auth_id = auth.uid()
        AND (SELECT count(*) FROM public.alertas_busqueda a WHERE a.auth_id = auth.uid()) < 10
    );

CREATE POLICY "Alertas: actualizar propias" ON public.alertas_busqueda
    FOR UPDATE TO authenticated USING (auth_id = auth.uid()) WITH CHECK (auth_id = auth.uid());

CREATE POLICY "Alertas: borrar propias" ON public.alertas_busqueda
    FOR DELETE TO authenticated USING (auth_id = auth.uid());

-- 4. Helper: convierte "$45,000", "45000.00", "3 hab" en número -----------------
CREATE OR REPLACE FUNCTION public.maximus_a_numero(valor TEXT)
RETURNS NUMERIC
LANGUAGE sql IMMUTABLE
AS $$
    SELECT CASE
        WHEN valor IS NULL OR btrim(valor) = '' THEN NULL
        WHEN btrim(valor) ~ '^\d+(\.\d+)?$' THEN btrim(valor)::numeric                 -- 45000 / 45000.00
        WHEN valor ~ '^\D*\d+([.,]\d+)?\D*$' AND valor !~ '[.,]\d{3}'                     -- "3 hab", "1,5"
            THEN replace(substring(valor FROM '\d+(?:[.,]\d+)?'), ',', '.')::numeric
        ELSE NULLIF(regexp_replace(valor, '[^0-9]', '', 'g'), '')::numeric               -- $45,000 / $270.000
    END
$$;

-- 5. Motor de coincidencias (lo ejecuta n8n cada hora) --------------------------
CREATE OR REPLACE FUNCTION public.procesar_alertas_busqueda(p_max_por_alerta INT DEFAULT 6)
RETURNS TABLE (
    alerta_id  UUID,
    email      TEXT,
    nombre     TEXT,
    telefono   TEXT,
    resumen    TEXT,
    total      INT,
    inmuebles  JSONB
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
#variable_conflict use_column
DECLARE
    r RECORD;
BEGIN
    FOR r IN
        WITH inm AS (
            -- to_jsonb tolera columnas que no existan en tu esquema real
            SELECT
                j->>'id'                                                   AS id,
                coalesce(j->>'titulo', 'Inmueble')                          AS titulo,
                lower(coalesce(j->>'operacion', ''))                        AS operacion,
                lower(replace(coalesce(j->>'tipo', ''), '_', ' '))          AS tipo,
                lower(concat_ws(' ', j->>'titulo', j->>'ubicacion', j->>'sector_nombre', j->>'subtitulo', j->>'codigo', j->>'tipo')) AS texto,
                coalesce(j->>'sector_nombre', j->>'ubicacion', 'Táchira')   AS zona,
                maximus_a_numero(j->>'precio')                              AS precio,
                coalesce(j->>'moneda', 'USD')                               AS moneda,
                maximus_a_numero(j->>'habitaciones')                        AS hab,
                maximus_a_numero(j->>'banos')                               AS banos,
                coalesce(j->>'metros_cuadrados', j->>'m2')                  AS m2,
                coalesce(j->>'foto_principal', j->'fotos'->>0)              AS foto,
                (j->>'created_at')::timestamptz                             AS creado,
                lower(coalesce(j->>'estatus', j->>'estado_publicacion', 'disponible')) AS estatus
            FROM (SELECT to_jsonb(i) AS j FROM public.inmuebles i) s
            WHERE (j->>'created_at')::timestamptz > now() - interval '7 days'
        ),
        candidatos AS (
            SELECT a.id AS a_id, inm.*,
                   row_number() OVER (PARTITION BY a.id ORDER BY inm.creado DESC) AS rn
            FROM public.alertas_busqueda a
            JOIN inm ON inm.creado > a.created_at
            WHERE a.activa
              AND inm.estatus NOT IN ('vendido', 'alquilado', 'inactivo', 'pausado', 'borrador')
              AND (a.operacion IS NULL OR inm.operacion = a.operacion)
              AND (a.tipo IS NULL
                   OR inm.tipo LIKE '%' || replace(a.tipo, '_', ' ') || '%'
                   OR (a.tipo = 'departamento' AND inm.tipo ~ 'apartamento|apto')
                   OR (a.tipo = 'fincas' AND inm.tipo ~ 'finca')
                   OR (a.tipo = 'galpones' AND inm.tipo ~ 'galp'))
              AND (a.zona IS NULL
                   OR inm.texto LIKE '%' || lower(replace(a.zona, '-', ' ')) || '%'
                   OR (a.zona_label IS NOT NULL AND inm.texto LIKE '%' || lower(a.zona_label) || '%'))
              AND (a.precio_min IS NULL OR inm.precio >= a.precio_min)
              AND (a.precio_max IS NULL OR inm.precio <= a.precio_max)
              AND (a.habitaciones_min IS NULL OR inm.hab >= a.habitaciones_min)
              AND (a.banos_min IS NULL OR inm.banos >= a.banos_min)
              AND (a.texto IS NULL OR inm.texto LIKE '%' || lower(a.texto) || '%')
              AND NOT EXISTS (
                  SELECT 1 FROM public.alertas_busqueda_envios e
                  WHERE e.alerta_id = a.id AND e.inmueble_id = inm.id
              )
        )
        SELECT a.id, a.email, a.nombre, a.telefono, a.resumen, a.auth_id,
               count(*)::int AS total,
               jsonb_agg(jsonb_build_object(
                   'id', c.id, 'titulo', c.titulo, 'zona', c.zona,
                   'precio', c.precio, 'moneda', c.moneda,
                   'habitaciones', c.hab, 'banos', c.banos, 'm2', c.m2,
                   'foto', c.foto, 'operacion', c.operacion,
                   'url', 'https://maximusinmobiliaria.tech/propiedad?id=' || c.id
               ) ORDER BY c.creado DESC) AS inmuebles,
               array_agg(c.id) AS ids
        FROM candidatos c
        JOIN public.alertas_busqueda a ON a.id = c.a_id
        WHERE c.rn <= p_max_por_alerta
        GROUP BY a.id
    LOOP
        -- Registrar lo enviado para no repetirlo
        INSERT INTO public.alertas_busqueda_envios (alerta_id, inmueble_id)
        SELECT r.id, unnest(r.ids)
        ON CONFLICT DO NOTHING;

        UPDATE public.alertas_busqueda
           SET ultimo_aviso = now(), total_avisos = total_avisos + r.total
         WHERE id = r.id;

        -- Notificación dentro de la app (campana). Si el esquema difiere, no bloquea el envío.
        BEGIN
            INSERT INTO public.notificaciones (usuario_id, tipo, titulo, mensaje, metadata)
            SELECT u.id, 'alerta',
                   CASE WHEN r.total = 1 THEN 'Nuevo inmueble para tu alerta'
                        ELSE r.total || ' inmuebles nuevos para tu alerta' END,
                   r.resumen,
                   jsonb_build_object('alerta_id', r.id, 'inmuebles', r.inmuebles)
              FROM public.usuarios u
             WHERE u.auth_id = r.auth_id;
        EXCEPTION WHEN others THEN
            RAISE NOTICE 'Notificación in-app omitida: %', SQLERRM;
        END;

        alerta_id := r.id; email := r.email; nombre := r.nombre; telefono := r.telefono;
        resumen := r.resumen; total := r.total; inmuebles := r.inmuebles;
        RETURN NEXT;
    END LOOP;
END;
$$;

-- Solo el backend (service_role, usado por n8n) puede ejecutar el motor
REVOKE ALL ON FUNCTION public.procesar_alertas_busqueda(INT) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.procesar_alertas_busqueda(INT) TO service_role;

-- Prueba manual (SQL Editor): SELECT * FROM public.procesar_alertas_busqueda();
-- ⚠️ Ojo: la prueba marca como enviados los inmuebles que devuelva.
