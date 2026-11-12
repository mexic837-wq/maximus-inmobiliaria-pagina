-- ==============================================================================
-- MAXIMUS INMOBILIARIA - AUDITORÍA DE SEGURIDAD (RESUMEN EN UNA SOLA TABLA)
-- ==============================================================================
-- SOLO LECTURA: no modifica nada. Pega TODO este archivo en el SQL Editor de Supabase
-- y pulsa Run: verás una única tabla con todos los hallazgos.
--
-- Cada fila es un hallazgo. Si una sección no aparece, esa revisión salió limpia.
--   1 · SIN RLS .......... la tabla no tiene protección: cualquiera con la clave pública lee y escribe
--   2 · ABIERTA (ESCRIBE)  cualquiera, sin iniciar sesión, puede crear/modificar/borrar
--   3 · ABIERTA (LEE) .... cualquiera, sin iniciar sesión, puede leer
--   4 · SESIÓN: TODO ..... cualquier usuario con sesión (incluido un cliente) pasa la regla sin filtro
--   5 · COLUMNA SENSIBLE . dato privado en una tabla que "anon" puede leer
-- ==============================================================================

WITH sin_rls AS (
    SELECT '1 · SIN RLS' AS seccion, tablename::text AS tabla, 'RLS desactivado' AS detalle
    FROM pg_tables
    WHERE schemaname = 'public' AND NOT rowsecurity
),
abiertas AS (
    SELECT CASE WHEN cmd IN ('ALL', 'INSERT', 'UPDATE', 'DELETE')
                THEN '2 · ABIERTA (ESCRIBE)' ELSE '3 · ABIERTA (LEE)' END AS seccion,
           tablename::text AS tabla,
           cmd || ' · ' || policyname AS detalle
    FROM pg_policies
    WHERE schemaname = 'public' AND (roles && ARRAY['public', 'anon']::name[])
),
sesion_todo AS (
    SELECT '4 · SESIÓN: TODO' AS seccion, tablename::text AS tabla,
           cmd || ' · ' || policyname AS detalle
    FROM pg_policies
    WHERE schemaname = 'public'
      AND (qual = 'true' OR with_check = 'true')
      AND NOT (roles && ARRAY['public', 'anon']::name[])
),
legibles_anon AS (
    -- tablas que "anon" puede leer: por permiso directo o por una regla abierta de lectura
    SELECT DISTINCT table_name::text AS tabla
    FROM information_schema.role_table_grants
    WHERE table_schema = 'public' AND grantee = 'anon' AND privilege_type = 'SELECT'
    UNION
    SELECT DISTINCT tablename::text
    FROM pg_policies
    WHERE schemaname = 'public' AND (roles && ARRAY['public', 'anon']::name[]) AND cmd IN ('ALL', 'SELECT')
),
sensibles AS (
    SELECT '5 · COLUMNA SENSIBLE' AS seccion, c.table_name::text AS tabla, c.column_name::text AS detalle
    FROM information_schema.columns c
    JOIN legibles_anon l ON l.tabla = c.table_name
    WHERE c.table_schema = 'public'
      AND (c.column_name ILIKE '%propietario%' OR c.column_name ILIKE '%privad%' OR c.column_name ILIKE '%password%'
           OR c.column_name ILIKE '%token%' OR c.column_name ILIKE '%secret%' OR c.column_name ILIKE '%telefono%'
           OR c.column_name ILIKE '%email%' OR c.column_name ILIKE '%comision%')
)
SELECT * FROM sin_rls
UNION ALL SELECT * FROM abiertas
UNION ALL SELECT * FROM sesion_todo
UNION ALL SELECT * FROM sensibles
ORDER BY seccion, tabla, detalle;
