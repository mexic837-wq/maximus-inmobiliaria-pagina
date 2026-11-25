-- =============================================================================
-- MAXIMUS · La portada muestra a todo el equipo del directorio de Agentes
-- Fecha: 2026-11-25 · Necesita maximus_rol_actual() (migration-historico-real.sql)
--
-- PROBLEMA: la portada leía solo la tabla usuarios (cuentas con acceso). Un asesor
-- agregado en «Agentes» (tabla asesores_maximus) cuya cuenta no quedó registrada con
-- rol asesor_maximus no salía en la página, aunque sí en el directorio del panel.
--
--   A. listar_equipo_maximus() ahora suma los asesores activos de asesores_maximus
--      que no estén ya por su cuenta (se compara por correo y por nombre). Respeta
--      mostrar_en_web = false de usuarios para ocultar a alguien a propósito.
--   B. SEGURIDAD: asesores_maximus permitía a CUALQUIERA (sin iniciar sesión) crear,
--      cambiar y borrar asesores; con A, eso habría dejado a un desconocido publicar
--      un «asesor» en la portada. Ahora solo escriben admin y asesor_maximus; la
--      lectura sigue siendo pública.
--
-- Se puede ejecutar más de una vez.
-- =============================================================================

-- B. Permisos de asesores_maximus ----------------------------------------------
ALTER TABLE public.asesores_maximus ENABLE ROW LEVEL SECURITY;

DO $$
DECLARE pol record;
BEGIN
    FOR pol IN SELECT policyname FROM pg_policies WHERE schemaname = 'public' AND tablename = 'asesores_maximus'
    LOOP
        EXECUTE format('DROP POLICY %I ON public.asesores_maximus', pol.policyname);
    END LOOP;
END $$;

CREATE POLICY "Asesores Maximus: lectura publica" ON public.asesores_maximus
    FOR SELECT USING (true);

CREATE POLICY "Asesores Maximus: el equipo gestiona" ON public.asesores_maximus
    FOR ALL TO authenticated
    USING (public.maximus_rol_actual() IN ('admin', 'asesor_maximus'))
    WITH CHECK (public.maximus_rol_actual() IN ('admin', 'asesor_maximus'));

-- A. Equipo de la portada ------------------------------------------------------
CREATE OR REPLACE FUNCTION public.listar_equipo_maximus()
RETURNS TABLE (
    nombre       TEXT,
    titulo       TEXT,
    avatar_url   TEXT,
    especialidad TEXT,
    whatsapp     TEXT
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
    SELECT t.nombre, t.titulo, t.avatar_url, t.especialidad, t.whatsapp
    FROM (
        -- Cuentas con acceso (como antes)
        SELECT
            u.nombre_completo AS nombre,
            COALESCE(NULLIF(u.titulo, ''), CASE WHEN u.rol = 'admin' THEN 'Dirección MAXIMUS' ELSE 'Asesor MAXIMUS' END) AS titulo,
            COALESCE(NULLIF(u.avatar_url, ''), NULLIF(u.avatar, '')) AS avatar_url,
            u.especialidad AS especialidad,
            regexp_replace(COALESCE(NULLIF(u.whatsapp, ''), NULLIF(u.telefono_e164, ''), u.telefono, ''), '[^0-9]', '', 'g') AS whatsapp,
            (u.rol = 'admin') AS es_admin
        FROM public.usuarios u
        WHERE u.rol IN ('asesor_maximus', 'admin')
          AND COALESCE(u.activo, true)
          AND u.mostrar_en_web
          AND NULLIF(trim(u.nombre_completo), '') IS NOT NULL

        UNION ALL

        -- Directorio de «Agentes» que no está ya arriba
        SELECT
            a.nombre,
            COALESCE(NULLIF(trim(a.cargo), ''), 'Asesor MAXIMUS'),
            CASE WHEN a.avatar LIKE 'blob:%' THEN NULL ELSE NULLIF(a.avatar, '') END,
            NULLIF(trim(a.especialidad), ''),
            regexp_replace(COALESCE(NULLIF(a.whatsapp, ''), a.telefono, ''), '[^0-9]', '', 'g'),
            false
        FROM public.asesores_maximus a
        WHERE COALESCE(a.activo, true)
          AND NULLIF(trim(a.nombre), '') IS NOT NULL
          AND NOT EXISTS (
              SELECT 1 FROM public.usuarios u
               WHERE ((NULLIF(trim(a.email), '') IS NOT NULL AND lower(trim(u.email)) = lower(trim(a.email)))
                      OR lower(trim(u.nombre_completo)) = lower(trim(a.nombre)))
                 AND (u.rol IN ('asesor_maximus', 'admin') OR NOT u.mostrar_en_web)
          )
    ) t
    ORDER BY t.es_admin DESC, t.nombre;
$$;

GRANT EXECUTE ON FUNCTION public.listar_equipo_maximus() TO anon, authenticated;

NOTIFY pgrst, 'reload schema';
