-- =============================================================================
-- MAXIMUS · Bucket «avatars»: el equipo sube las fotos de los asesores
-- Fecha: 2026-11-25 · Necesita maximus_rol_actual() (migration-historico-real.sql)
--
-- El panel sube la foto de cada asesor a avatars/asesores/… y en la base solo guarda
-- su dirección. Estas políticas dejan subir, cambiar y borrar solo al administrador y a
-- los asesores MAXIMUS; ver las fotos sigue siendo público (el bucket es público).
-- Sin estas políticas el panel guarda la foto dentro del registro como respaldo.
--
-- Se puede ejecutar más de una vez.
-- =============================================================================

DROP POLICY IF EXISTS "Avatars: lectura publica" ON storage.objects;
CREATE POLICY "Avatars: lectura publica" ON storage.objects
    FOR SELECT USING (bucket_id = 'avatars');

DROP POLICY IF EXISTS "Avatars: subida del equipo" ON storage.objects;
CREATE POLICY "Avatars: subida del equipo" ON storage.objects
    FOR INSERT TO authenticated
    WITH CHECK (bucket_id = 'avatars' AND public.maximus_rol_actual() IN ('admin', 'asesor_maximus'));

DROP POLICY IF EXISTS "Avatars: edicion del equipo" ON storage.objects;
CREATE POLICY "Avatars: edicion del equipo" ON storage.objects
    FOR UPDATE TO authenticated
    USING (bucket_id = 'avatars' AND public.maximus_rol_actual() IN ('admin', 'asesor_maximus'))
    WITH CHECK (bucket_id = 'avatars' AND public.maximus_rol_actual() IN ('admin', 'asesor_maximus'));

DROP POLICY IF EXISTS "Avatars: borrado del equipo" ON storage.objects;
CREATE POLICY "Avatars: borrado del equipo" ON storage.objects
    FOR DELETE TO authenticated
    USING (bucket_id = 'avatars' AND public.maximus_rol_actual() IN ('admin', 'asesor_maximus'));
