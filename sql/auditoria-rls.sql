-- ==============================================================================
-- MAXIMUS INMOBILIARIA - AUDITORÍA DE SEGURIDAD (SOLO LECTURA)
-- ==============================================================================
-- Ejecuta cada bloque en el SQL Editor de Supabase. NO modifica nada.
--
-- Contexto: la clave "anon" de Supabase viaja dentro de la página y de la app, así que
-- cualquier persona la puede usar. Lo único que protege tus datos son las reglas de
-- acceso (RLS). Estas consultas muestran qué puede hacer alguien SIN iniciar sesión.
-- ==============================================================================

-- 1) Tablas SIN protección RLS (cualquiera con la clave pública puede leer y escribir)
--    Resultado esperado: ninguna fila.
SELECT schemaname, tablename
FROM pg_tables
WHERE schemaname = 'public' AND NOT rowsecurity
ORDER BY tablename;

-- 2) Reglas abiertas al público o a "anon" (sin iniciar sesión)
--    Revisa especialmente las que tengan comando ALL, INSERT, UPDATE o DELETE:
--    significan que cualquiera puede crear, modificar o borrar esos datos.
SELECT tablename,
       policyname,
       cmd                          AS comando,
       roles,
       qual                         AS condicion_lectura,
       with_check                   AS condicion_escritura,
       CASE WHEN cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE') THEN '⚠️ ESCRITURA ABIERTA' ELSE 'lectura' END AS alcance
FROM pg_policies
WHERE schemaname = 'public'
  AND (roles && ARRAY['public', 'anon']::name[])
ORDER BY (cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')) DESC, tablename, policyname;

-- 3) Reglas que dejan pasar TODO (USING true) a usuarios con sesión: cualquier cliente
--    registrado vería o modificaría los datos de todos.
SELECT tablename, policyname, cmd AS comando, roles, qual AS condicion
FROM pg_policies
WHERE schemaname = 'public'
  AND (qual = 'true' OR with_check = 'true')
  AND NOT (roles && ARRAY['public', 'anon']::name[])
ORDER BY tablename, policyname;

-- 4) Permisos directos de "anon" sobre tablas (aparte de las reglas RLS)
SELECT table_name, string_agg(privilege_type, ', ' ORDER BY privilege_type) AS permisos_anon
FROM information_schema.role_table_grants
WHERE table_schema = 'public' AND grantee = 'anon'
GROUP BY table_name
ORDER BY table_name;

-- 5) Columnas privadas en tablas que el sitio público lee
--    (propietario_*, notas_privadas...): si "anon" puede leer la tabla, puede leer
--    también estas columnas, aunque la página no las muestre.
SELECT table_name, column_name
FROM information_schema.columns
WHERE table_schema = 'public'
  AND (column_name ILIKE '%propietario%' OR column_name ILIKE '%privad%' OR column_name ILIKE '%password%'
       OR column_name ILIKE '%telefono%' OR column_name ILIKE '%email%' OR column_name ILIKE '%comision%')
ORDER BY table_name, column_name;

-- ==============================================================================
-- CÓMO LEER EL RESULTADO
--   · Bloque 2 con "⚠️ ESCRITURA ABIERTA" en inmuebles, leads, usuarios, citas, pagos o
--     notificaciones = hay que cerrarlo antes de publicar la app. El archivo
--     sql/migration-inmuebles-sync-dashboard.sql crea justo una regla así
--     ("Inmuebles: acceso total public", FOR ALL TO public USING (true)).
--   · Bloque 5: si "inmuebles" aparece con propietario_telefono / notas_privadas y "anon"
--     puede leer inmuebles, esos datos son públicos. La solución es moverlos a una tabla
--     aparte que solo vea el personal (pídemelo y la preparo).
-- ==============================================================================
