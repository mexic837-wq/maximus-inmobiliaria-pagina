-- =============================================================================
-- MAXIMUS · FASE 3 (uso interno): funciones con QR
-- Fecha: 2026-11-19 · También va como PARTE 12 en PENDIENTE-SUPABASE-TODO-EN-UNO.sql
-- Necesita la PARTE 11 (usa maximus_es_staff y maximus_email_actual).
--
--   A. QR del letrero de cada inmueble: cuenta los escaneos (tabla qr_escaneos).
--   B. Invitación de cliente con QR: el asesor crea una invitación para el correo
--      del cliente; con ella el cliente puede crear su cuenta aunque el registro
--      público esté cerrado (tabla invitaciones_clientes).
--   C. QR de llegada a la visita: el cliente lo escanea en el inmueble y la cita
--      queda marcada como realizada (citas.qr_token, citas.llegada_at).
--
-- Se puede ejecutar más de una vez.
-- =============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- Por si la migración de notificaciones no se aplicó: id del usuario con sesión.
CREATE OR REPLACE FUNCTION public.maximus_usuario_id()
RETURNS uuid
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$ SELECT id FROM public.usuarios WHERE auth_id = auth.uid() LIMIT 1 $$;
GRANT EXECUTE ON FUNCTION public.maximus_usuario_id() TO authenticated;

-- A. ESCANEOS DE QR ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS public.qr_escaneos (
    id        BIGSERIAL PRIMARY KEY,
    tipo      TEXT NOT NULL CHECK (tipo IN ('inmueble')),
    ref       TEXT NOT NULL CHECK (char_length(ref) BETWEEN 1 AND 100),
    creado_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_qr_escaneos_ref ON public.qr_escaneos (tipo, ref, creado_at DESC);
ALTER TABLE public.qr_escaneos ENABLE ROW LEVEL SECURITY;
-- Sin políticas: solo se usa a través de las funciones de abajo.

-- Cualquiera que escanee el letrero suma 1 (sin datos personales).
CREATE OR REPLACE FUNCTION public.registrar_escaneo_qr(p_tipo TEXT, p_ref TEXT)
RETURNS void
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF p_tipo IS DISTINCT FROM 'inmueble' OR p_ref IS NULL OR char_length(p_ref) NOT BETWEEN 1 AND 100 THEN
        RETURN;
    END IF;
    INSERT INTO public.qr_escaneos (tipo, ref) VALUES (p_tipo, p_ref);
END;
$$;
GRANT EXECUTE ON FUNCTION public.registrar_escaneo_qr(TEXT, TEXT) TO anon, authenticated;

-- El equipo ve cuántas veces se escaneó (total y últimos 7 días).
CREATE OR REPLACE FUNCTION public.contar_escaneos_qr(p_tipo TEXT, p_ref TEXT)
RETURNS TABLE (total BIGINT, ultimos_7_dias BIGINT, ultimo TIMESTAMPTZ)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT count(*),
           count(*) FILTER (WHERE creado_at > now() - interval '7 days'),
           max(creado_at)
    FROM public.qr_escaneos
    WHERE public.maximus_es_staff() AND tipo = p_tipo AND ref = p_ref
$$;
REVOKE ALL ON FUNCTION public.contar_escaneos_qr(TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.contar_escaneos_qr(TEXT, TEXT) TO authenticated;

-- B. INVITACIONES DE CLIENTES --------------------------------------------------
CREATE TABLE IF NOT EXISTS public.invitaciones_clientes (
    token      TEXT PRIMARY KEY DEFAULT encode(gen_random_bytes(18), 'hex'),
    email      TEXT NOT NULL,
    nombre     TEXT,
    asesor_id  UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    destino    TEXT DEFAULT 'view-mi-asesor',
    creado_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    expira_at  TIMESTAMPTZ NOT NULL DEFAULT now() + interval '30 days',
    usada_at   TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS idx_invitaciones_email ON public.invitaciones_clientes (lower(email));
ALTER TABLE public.invitaciones_clientes ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Invitaciones: equipo ve" ON public.invitaciones_clientes;
CREATE POLICY "Invitaciones: equipo ve" ON public.invitaciones_clientes
    FOR SELECT TO authenticated USING (public.maximus_es_staff());

-- El asesor crea (o reutiliza, si sigue vigente) la invitación de un cliente.
CREATE OR REPLACE FUNCTION public.crear_invitacion_cliente(p_email TEXT, p_nombre TEXT DEFAULT NULL, p_destino TEXT DEFAULT 'view-mi-asesor')
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_email TEXT := lower(trim(p_email));
    v_token TEXT;
BEGIN
    IF NOT public.maximus_es_staff() THEN
        RAISE EXCEPTION 'Solo el equipo MAXIMUS puede invitar clientes';
    END IF;
    IF v_email IS NULL OR v_email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' THEN
        RAISE EXCEPTION 'Correo inválido';
    END IF;
    IF p_destino IS NULL OR p_destino !~ '^view-[a-z0-9-]{1,40}$' THEN
        p_destino := 'view-mi-asesor';
    END IF;

    SELECT token INTO v_token FROM public.invitaciones_clientes
    WHERE lower(email) = v_email AND usada_at IS NULL AND expira_at > now()
    ORDER BY creado_at DESC LIMIT 1;

    IF v_token IS NULL THEN
        INSERT INTO public.invitaciones_clientes (email, nombre, asesor_id, destino)
        VALUES (v_email, NULLIF(trim(p_nombre), ''), public.maximus_usuario_id(), p_destino)
        RETURNING token INTO v_token;
    END IF;
    RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.crear_invitacion_cliente(TEXT, TEXT, TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.crear_invitacion_cliente(TEXT, TEXT, TEXT) TO authenticated;

-- La página de login lee la invitación (solo con el token, que es secreto).
CREATE OR REPLACE FUNCTION public.ver_invitacion(p_token TEXT)
RETURNS TABLE (email TEXT, nombre TEXT, asesor_nombre TEXT, destino TEXT, vigente BOOLEAN, ya_tiene_cuenta BOOLEAN)
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT i.email, i.nombre, u.nombre_completo, i.destino,
           (i.usada_at IS NULL AND i.expira_at > now()),
           EXISTS (SELECT 1 FROM public.usuarios x WHERE lower(x.email) = lower(i.email))
    FROM public.invitaciones_clientes i
    LEFT JOIN public.usuarios u ON u.id = i.asesor_id
    WHERE i.token = p_token
$$;
GRANT EXECUTE ON FUNCTION public.ver_invitacion(TEXT) TO anon, authenticated;

-- Al entrar con la invitación, se marca como usada (solo el dueño del correo).
CREATE OR REPLACE FUNCTION public.usar_invitacion(p_token TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    UPDATE public.invitaciones_clientes
       SET usada_at = now()
     WHERE token = p_token AND usada_at IS NULL
       AND lower(email) = public.maximus_email_actual();
    RETURN FOUND;
END;
$$;
REVOKE ALL ON FUNCTION public.usar_invitacion(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.usar_invitacion(TEXT) TO authenticated;

-- C. LLEGADA A LA VISITA -------------------------------------------------------
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS qr_token   TEXT;
ALTER TABLE public.citas ADD COLUMN IF NOT EXISTS llegada_at TIMESTAMPTZ;

-- El asesor obtiene el código de llegada de una cita (se crea la primera vez).
CREATE OR REPLACE FUNCTION public.token_llegada_cita(p_cita_id TEXT)
RETURNS TEXT
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE v_token TEXT;
BEGIN
    IF NOT public.maximus_es_staff() THEN
        RAISE EXCEPTION 'Solo el equipo MAXIMUS';
    END IF;
    UPDATE public.citas
       SET qr_token = COALESCE(qr_token, encode(gen_random_bytes(12), 'hex'))
     WHERE id::text = p_cita_id
    RETURNING qr_token INTO v_token;
    RETURN v_token;
END;
$$;
REVOKE ALL ON FUNCTION public.token_llegada_cita(TEXT) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.token_llegada_cita(TEXT) TO authenticated;

-- El cliente escanea en el inmueble: la cita queda como realizada.
-- Devuelve lo justo para la pantalla de bienvenida.
CREATE OR REPLACE FUNCTION public.registrar_llegada_visita(p_cita_id TEXT, p_token TEXT)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_c   public.citas%ROWTYPE;
    v_ase TEXT;
    v_tel TEXT;
    v_nom TEXT;
BEGIN
    IF p_token IS NULL OR char_length(p_token) < 16 THEN
        RETURN jsonb_build_object('ok', false);
    END IF;

    UPDATE public.citas
       SET llegada_at = COALESCE(llegada_at, now()),
           estado     = 'realizada'
     WHERE id::text = p_cita_id AND qr_token = p_token
       AND COALESCE(estado, '') <> 'cancelada'
    RETURNING * INTO v_c;

    IF NOT FOUND THEN
        RETURN jsonb_build_object('ok', false);
    END IF;

    SELECT u.nombre_completo, u.telefono INTO v_nom, v_tel
    FROM public.usuarios u
    WHERE u.id::text = COALESCE(to_jsonb(v_c) ->> 'agente_id', to_jsonb(v_c) ->> 'asesor_id');

    v_ase := COALESCE(v_nom, to_jsonb(v_c) ->> 'asesor_nombre', 'tu asesor MAXIMUS');

    RETURN jsonb_build_object(
        'ok',              true,
        'cliente',         split_part(COALESCE(to_jsonb(v_c) ->> 'cliente_nombre', ''), ' ', 1),
        'inmueble',        COALESCE(to_jsonb(v_c) ->> 'inmueble_titulo', v_c.titulo),
        'ubicacion',       to_jsonb(v_c) ->> 'ubicacion',
        'asesor',          v_ase,
        'asesor_telefono', public.normalizar_tel_ve(v_tel)
    );
END;
$$;
GRANT EXECUTE ON FUNCTION public.registrar_llegada_visita(TEXT, TEXT) TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
