-- =============================================================================
-- MAXIMUS · FASE 4 (uso interno): sin Bronce / Gold / Platinum
-- Fecha: 2026-11-20 · También va como PARTE 13 en PENDIENTE-SUPABASE-TODO-EN-UNO.sql
-- Necesita las PARTES 6, 9 y 10 (usa las tablas y funciones que ellas crean).
--
-- En la página interna todos los asesores son "Asesor Inmobiliario MAXIMUS".
-- Lo que antes dependía del plan ahora depende solo del rol:
--   · Ficha del inmueble: cualquier asesor del equipo (admin, asesor_maximus,
--     asesor_externo, agente) sale como equipo MAXIMUS y muestra su Instagram.
--   · Tarjeta digital con QR: la tiene todo el equipo, sin plan ni vencimiento.
--
-- Se puede ejecutar más de una vez.
-- =============================================================================

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
    IF v_hay_usuario AND v_u.rol IN ('admin', 'asesor_maximus', 'asesor_externo', 'agente') THEN
        RETURN jsonb_build_object(
            'nombre', v_u.nombre_completo, 'plan', 'equipo',
            'cargo', COALESCE(NULLIF(v_u.titulo, ''), 'Asesor MAXIMUS'),
            'whatsapp', v_tel, 'avatar_url', COALESCE(NULLIF(v_u.avatar_url, ''), NULLIF(v_u.avatar, '')),
            'instagram', NULLIF(to_jsonb(v_u) ->> 'instagram', ''),
            'es_equipo', true);
    END IF;

    -- Cuenta con plan heredado de la versión pública: se muestra igual, como MAXIMUS
    IF v_hay_usuario AND v_u.plan IN ('pro', 'gold', 'platinum')
       AND COALESCE(v_u.activo, true)
       AND (v_u.plan_vence_at IS NULL OR v_u.plan_vence_at > now()) THEN
        RETURN jsonb_build_object(
            'nombre', v_u.nombre_completo,
            'plan', 'equipo',
            'cargo', 'Asesor Inmobiliario MAXIMUS',
            'whatsapp', COALESCE(NULLIF(v_tel, ''), regexp_replace(COALESCE(v_i.asesor_telefono, ''), '[^0-9]', '', 'g')),
            'avatar_url', COALESCE(NULLIF(v_u.avatar_url, ''), NULLIF(v_u.avatar, '')),
            -- Ventaja Platinum: enlace directo a su Instagram (Parte 9). to_jsonb evita
            -- depender de que la columna ya exista cuando se crea esta función.
            'instagram', NULLIF(to_jsonb(v_u) ->> 'instagram', ''),
            'es_equipo', true);
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

-- 13.2 Tarjeta digital con QR: todo el equipo, sin plan
CREATE OR REPLACE FUNCTION public.asegurar_tarjeta_asesor()
RETURNS TEXT
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_u    public.usuarios%ROWTYPE;
    v_base TEXT;
    v_slug TEXT;
    v_n    INT := 0;
BEGIN
    IF auth.uid() IS NULL THEN RETURN NULL; END IF;
    SELECT * INTO v_u FROM public.usuarios WHERE auth_id = auth.uid();
    IF NOT FOUND THEN RETURN NULL; END IF;

    IF NOT (v_u.rol IN ('admin', 'asesor_maximus', 'asesor_externo', 'agente') AND COALESCE(v_u.activo, true)) THEN
        RETURN NULL;
    END IF;
    IF v_u.tarjeta_slug IS NOT NULL THEN RETURN v_u.tarjeta_slug; END IF;

    -- "María Pérez Ñandú" → "maria-perez-nandu"
    v_base := lower(regexp_replace(
                  translate(COALESCE(NULLIF(trim(v_u.nombre_completo), ''), 'asesor'),
                            'áéíóúüñÁÉÍÓÚÜÑ', 'aeiouunAEIOUUN'),
                  '[^a-zA-Z0-9]+', '-', 'g'));
    v_base := trim(both '-' from left(trim(both '-' from v_base), 40));
    IF v_base = '' THEN v_base := 'asesor'; END IF;

    LOOP
        v_slug := CASE WHEN v_n = 0 THEN v_base ELSE v_base || '-' || (v_n + 1) END;
        EXIT WHEN NOT EXISTS (SELECT 1 FROM public.usuarios WHERE tarjeta_slug = v_slug);
        v_n := v_n + 1;
    END LOOP;

    PERFORM set_config('maximus.tarjeta_slug_ok', 'on', true);
    UPDATE public.usuarios SET tarjeta_slug = v_slug WHERE id = v_u.id;
    RETURN v_slug;
END;
$$;

REVOKE ALL ON FUNCTION public.asegurar_tarjeta_asesor() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.asegurar_tarjeta_asesor() TO authenticated;

-- 13.3 Datos públicos de la tarjeta (sin plan)
CREATE OR REPLACE FUNCTION public.tarjeta_asesor(p_slug TEXT)
RETURNS JSONB
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
    v_u      public.usuarios%ROWTYPE;
    v_total  INT;
    v_prom   NUMERIC;
    v_inms   JSONB;
    v_cuenta INT;
BEGIN
    SELECT * INTO v_u
      FROM public.usuarios u
     WHERE u.tarjeta_slug = lower(trim(COALESCE(p_slug, '')))
       AND u.rol IN ('admin', 'asesor_maximus', 'asesor_externo', 'agente')
       AND COALESCE(u.activo, true);
    IF NOT FOUND THEN RETURN NULL; END IF;

    SELECT COUNT(*)::INT, ROUND(AVG(r.estrellas)::NUMERIC, 1)
      INTO v_total, v_prom
      FROM public.resenas_asesores r
     WHERE r.asesor_auth_id = v_u.auth_id AND r.oculto = false;

    SELECT COUNT(*)::INT INTO v_cuenta
      FROM public.inmuebles i
     WHERE COALESCE(i.estatus, 'disponible') = 'disponible'
       AND (i.agente_id = v_u.id OR i.asesor_id = v_u.id::TEXT OR i.asesor_id = v_u.auth_id::TEXT);

    SELECT COALESCE(jsonb_agg(x ORDER BY x_fecha DESC), '[]'::JSONB) INTO v_inms
      FROM (
        SELECT jsonb_build_object(
                   'id',               i.id,
                   'titulo',           i.titulo,
                   'precio',           i.precio,
                   'moneda',           COALESCE(NULLIF(to_jsonb(i) ->> 'moneda', ''), 'USD'),
                   'operacion',        i.operacion,
                   'tipo',             i.tipo,
                   'sector',           COALESCE(NULLIF(i.sector_nombre, ''), i.ubicacion),
                   'habitaciones',     i.habitaciones,
                   'banos',            i.banos,
                   'metros_cuadrados', i.metros_cuadrados,
                   'foto',             COALESCE(i.fotos[2], i.fotos[1], i.foto_principal)
               ) AS x,
               i.created_at AS x_fecha
          FROM public.inmuebles i
         WHERE COALESCE(i.estatus, 'disponible') = 'disponible'
           AND (i.agente_id = v_u.id OR i.asesor_id = v_u.id::TEXT OR i.asesor_id = v_u.auth_id::TEXT)
         ORDER BY i.created_at DESC
         LIMIT 12
      ) t;

    RETURN jsonb_build_object(
        'slug',            v_u.tarjeta_slug,
        'nombre',          v_u.nombre_completo,
        'titulo',          COALESCE(NULLIF(v_u.titulo, ''), 'Asesor Inmobiliario'),
        'avatar_url',      COALESCE(NULLIF(v_u.avatar_url, ''), NULLIF(v_u.avatar, '')),
        'bio',             NULLIF(v_u.bio, ''),
        'especialidad',    NULLIF(v_u.especialidad, ''),
        'zona',            COALESCE(NULLIF(v_u.zona, ''), NULLIF(v_u.estado, '')),
        'whatsapp',        public.normalizar_tel_ve(COALESCE(NULLIF(v_u.whatsapp, ''), NULLIF(v_u.telefono_e164, ''), v_u.telefono)),
        'instagram',       NULLIF(to_jsonb(v_u) ->> 'instagram', ''),
        'estrellas',       CASE WHEN v_total = 0 THEN 5.0 ELSE v_prom END,
        'total_resenas',   v_total,
        'total_inmuebles', v_cuenta,
        'inmuebles',       v_inms
    );
END;
$$;

GRANT EXECUTE ON FUNCTION public.tarjeta_asesor(TEXT) TO anon, authenticated;

-- 13.4 Títulos guardados con el nombre de un plan pasan a MAXIMUS
UPDATE public.usuarios
   SET titulo = 'Asesor Inmobiliario MAXIMUS'
 WHERE titulo ~* 'Inmobiliario (Pro|Bronce|Gold|Platinum)$';

NOTIFY pgrst, 'reload schema';
