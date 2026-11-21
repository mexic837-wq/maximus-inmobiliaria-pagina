-- =============================================================================
-- MAXIMUS · FASE 6: cuentas seguras ("Continuar con Google" solo crea clientes)
-- Fecha: 2026-11-21 · También va como PARTE 14 en PENDIENTE-SUPABASE-TODO-EN-UNO.sql
-- Necesita la PARTE 11 (usa maximus_es_staff y maximus_email_actual).
--
-- PROBLEMAS QUE CORRIGE (comprobado en producción el 21 nov 2026):
--   1. La tabla usuarios se podía LEER sin iniciar sesión (nombres, correos,
--      teléfonos y rol de todas las cuentas) y MODIFICAR por cualquiera
--      (políticas "USING (true)" para anon). Alguien podía ponerse rol admin.
--   2. Al registrarse, el rol salía de los datos que manda el navegador
--      (raw_user_meta_data ->> 'rol'): se podía crear una cuenta "admin".
--
-- DESPUÉS:
--   · Toda cuenta nueva (Google, correo o invitación) nace como CLIENTE.
--     El rol de asesor o admin solo lo puede poner un admin (o desde Supabase).
--   · Cada persona ve y edita solo su fila; el equipo ve todas.
--   · rol, plan, tipo_asesor, activo y mostrar_en_web solo los cambia un admin.
--   · Sin sesión no se ve la tabla (la portada usa listar_equipo_maximus, que sigue
--     funcionando porque es una función SECURITY DEFINER).
--
-- Para hacer asesor a alguien:  UPDATE public.usuarios SET rol = 'asesor_maximus',
--   titulo = 'Asesor Inmobiliario MAXIMUS' WHERE email = '...';   (en el SQL Editor)
--
-- Se puede ejecutar más de una vez.
-- =============================================================================

-- 1. ¿Quién hace el cambio? ----------------------------------------------------
CREATE OR REPLACE FUNCTION public.maximus_es_admin()
RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public
AS $$
    SELECT EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = auth.uid() AND rol = 'admin')
$$;
GRANT EXECUTE ON FUNCTION public.maximus_es_admin() TO authenticated;

-- Servidor (SQL Editor, n8n o funciones con service_role): no pasa por la web
CREATE OR REPLACE FUNCTION public.maximus_es_servidor()
RETURNS boolean
LANGUAGE sql STABLE
AS $$
    SELECT COALESCE(current_setting('request.jwt.claims', true)::jsonb ->> 'role', '')
           NOT IN ('anon', 'authenticated')
$$;

-- 2. Registro: toda cuenta nueva es cliente -------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
    v_nombre   TEXT;
    v_tel      TEXT;
    v_avatar   TEXT;
    v_origen   TEXT;
    v_proveedor TEXT := COALESCE(NEW.raw_app_meta_data ->> 'provider', 'email');
BEGIN
    v_nombre := COALESCE(
        NULLIF(trim(NEW.raw_user_meta_data ->> 'nombre_completo'), ''),
        NULLIF(trim(NEW.raw_user_meta_data ->> 'full_name'), ''),
        NULLIF(trim(NEW.raw_user_meta_data ->> 'name'), ''),
        split_part(NEW.email, '@', 1));
    v_tel    := NULLIF(trim(NEW.raw_user_meta_data ->> 'telefono'), '');
    v_avatar := COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'avatar_url', ''), NULLIF(NEW.raw_user_meta_data ->> 'picture', ''));
    v_origen := CASE v_proveedor WHEN 'google' THEN 'Google' WHEN 'apple' THEN 'Apple' ELSE 'Portal Web (Crear Cuenta)' END;

    BEGIN
        INSERT INTO public.usuarios (
            auth_id, nombre_completo, email, telefono, telefono_e164, prefijo,
            rol, tipo_asesor, titulo, avatar_url, origen)
        VALUES (
            NEW.id, v_nombre, lower(trim(NEW.email)), v_tel,
            COALESCE(NULLIF(trim(NEW.raw_user_meta_data ->> 'telefono_e164'), ''), v_tel),
            COALESCE(NULLIF(NEW.raw_user_meta_data ->> 'prefijo', ''), '+58'),
            'cliente', NULL, 'Usuario Registrado', v_avatar, v_origen)
        ON CONFLICT (auth_id) DO UPDATE SET
            -- Nunca cambia el rol ni el título de una cuenta que ya existe
            nombre_completo = COALESCE(public.usuarios.nombre_completo, EXCLUDED.nombre_completo),
            email           = EXCLUDED.email,
            telefono        = COALESCE(public.usuarios.telefono, EXCLUDED.telefono),
            avatar_url      = COALESCE(public.usuarios.avatar_url, EXCLUDED.avatar_url),
            updated_at      = now();
    EXCEPTION WHEN unique_violation THEN
        -- Ya había una fila con ese correo (p. ej. un asesor creado a mano): se enlaza, sin tocar su rol
        UPDATE public.usuarios
           SET auth_id = COALESCE(auth_id, NEW.id), updated_at = now()
         WHERE lower(email) = lower(trim(NEW.email));
    END;

    BEGIN
        INSERT INTO public.auditoria_actividad (user_id, email, tipo, titulo, detalle)
        VALUES (NEW.id, lower(trim(NEW.email)), 'registro', 'Registro de cuenta de cliente',
                'Cuenta creada desde ' || v_origen || '.');
    EXCEPTION WHEN OTHERS THEN NULL; -- la auditoría nunca debe impedir el registro
    END;

    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- 3. Campos que solo cambia un admin --------------------------------------------
CREATE OR REPLACE FUNCTION public.usuarios_proteger_rol()
RETURNS TRIGGER
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
BEGIN
    IF public.maximus_es_servidor() OR public.maximus_es_admin() THEN
        RETURN NEW;
    END IF;

    IF TG_OP = 'INSERT' THEN
        -- Filas creadas desde la web: siempre cliente y ligadas a quien las crea
        NEW.rol         := 'cliente';
        NEW.tipo_asesor := NULL;
        NEW.titulo      := 'Usuario Registrado';
        IF to_jsonb(NEW) ? 'plan' THEN NEW := jsonb_populate_record(NEW, jsonb_build_object('plan', 'gratis')); END IF;
        RETURN NEW;
    END IF;

    -- UPDATE: se conservan los valores anteriores de los campos protegidos
    NEW.rol         := OLD.rol;
    NEW.tipo_asesor := OLD.tipo_asesor;
    NEW.auth_id     := OLD.auth_id;
    -- Un cliente no puede ponerse un título como "Director" (el panel lo usa para mostrar vistas)
    IF NOT public.maximus_es_staff() THEN
        NEW.titulo := OLD.titulo;
    END IF;
    -- (las columnas que no existan en esta base se ignoran)
    NEW := jsonb_populate_record(NEW, jsonb_build_object(
        'plan',           to_jsonb(OLD) -> 'plan',
        'plan_vence_at',  to_jsonb(OLD) -> 'plan_vence_at',
        'activo',         to_jsonb(OLD) -> 'activo',
        'mostrar_en_web', to_jsonb(OLD) -> 'mostrar_en_web'));
    RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS usuarios_proteger_rol ON public.usuarios;
CREATE TRIGGER usuarios_proteger_rol
    BEFORE INSERT OR UPDATE ON public.usuarios
    FOR EACH ROW EXECUTE FUNCTION public.usuarios_proteger_rol();

-- 4. Permisos de la tabla usuarios ----------------------------------------------
DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'usuarios' LOOP
        EXECUTE format('DROP POLICY %I ON public.usuarios', pol.policyname);
    END LOOP;
END $$;

ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios: ver la propia o equipo" ON public.usuarios
    FOR SELECT TO authenticated
    USING (auth_id = auth.uid()
           OR lower(email) = public.maximus_email_actual()
           OR public.maximus_es_staff());

CREATE POLICY "Usuarios: crear la propia" ON public.usuarios
    FOR INSERT TO authenticated
    WITH CHECK (auth_id = auth.uid());

CREATE POLICY "Usuarios: editar la propia o equipo" ON public.usuarios
    FOR UPDATE TO authenticated
    USING (auth_id = auth.uid()
           OR lower(email) = public.maximus_email_actual()
           OR public.maximus_es_staff())
    WITH CHECK (auth_id = auth.uid()
           OR lower(email) = public.maximus_email_actual()
           OR public.maximus_es_staff());

CREATE POLICY "Usuarios: borrar solo admin" ON public.usuarios
    FOR DELETE TO authenticated
    USING (public.maximus_es_admin());

NOTIFY pgrst, 'reload schema';
