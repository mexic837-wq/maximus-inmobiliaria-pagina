-- =====================================================================
-- MAXIMUS INMOBILIARIA - MIGRACIÓN SQL: MATERIAL INFORMATIVO & ACADEMIA
-- =====================================================================
-- Ejecuta este script directamente en el "SQL Editor" de tu panel de Supabase.
-- Es 100% seguro e idempotente (se puede ejecutar varias veces sin borrar datos).
-- =====================================================================

-- 1. CREAR TABLA: MATERIAL_INFORMATIVO
CREATE TABLE IF NOT EXISTS public.material_informativo (
    id TEXT PRIMARY KEY,
    orden INTEGER DEFAULT 1,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    categoria TEXT DEFAULT 'primeros-pasos',
    categoria_nombre TEXT DEFAULT 'Primeros pasos',
    tipo TEXT DEFAULT 'video', -- 'video', 'pdf', 'imagen', 'guia', 'documento'
    tipo_label TEXT DEFAULT 'Video Tutorial',
    duracion TEXT DEFAULT '05:00 min',
    badge TEXT DEFAULT 'PASO 1',
    badge_color TEXT DEFAULT 'bg-emerald-600',
    imagen TEXT DEFAULT 'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80',
    url_recurso TEXT DEFAULT '#',
    resumen_puntos TEXT[] DEFAULT '{}',
    activo BOOLEAN DEFAULT TRUE,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- 2. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.material_informativo ENABLE ROW LEVEL SECURITY;

-- 3. POLÍTICAS DE ACCESO TOTAL PÚBLICO (Lectura, Inserción, Actualización y Eliminación)
DROP POLICY IF EXISTS "material_informativo_select_all" ON public.material_informativo;
DROP POLICY IF EXISTS "material_informativo_write_auth" ON public.material_informativo;
DROP POLICY IF EXISTS "material_informativo_write_all" ON public.material_informativo;
DROP POLICY IF EXISTS "material_informativo_public_all" ON public.material_informativo;

CREATE POLICY "material_informativo_public_all" 
ON public.material_informativo 
FOR ALL 
TO public 
USING (true) 
WITH CHECK (true);

-- 4. INSERTAR DATOS INICIALES (SEMILLA 6 MATERIALES OFICIALES)
INSERT INTO public.material_informativo (
    id, orden, titulo, descripcion, categoria, categoria_nombre, 
    tipo, tipo_label, duracion, badge, badge_color, imagen, url_recurso, resumen_puntos, activo
) VALUES 
(
    'mat-1', 
    1, 
    'Cargar tu primer inmueble sin errores', 
    'Aprende los conceptos básicos para subir propiedades con fotos HD, geolocalización precisa y optimización de título para el catálogo MAXIMUS.', 
    'primeros-pasos', 
    'Primeros pasos', 
    'video', 
    'Video Tutorial', 
    '05:24 min', 
    'PASO 1', 
    'bg-emerald-600', 
    'https://images.unsplash.com/photo-1551288049-bebda4e38f71?w=800&q=80', 
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    ARRAY['Verificación previa de linderos y ficha catastral.', 'Carga secuencial de fotografías (sala, cocina, habitaciones, exteriores).', 'Configuración de precio, comisión y asignación al captador oficial.'], 
    true
),
(
    'mat-2', 
    2, 
    'Lectura avanzada del panel de métricas', 
    'Una guía completa para interpretar los gráficos de actividad, transacciones de ventas vs alquileres y liquidación de comisiones brutas.', 
    'metricas', 
    'Métricas & Finanzas', 
    'video', 
    'Video Tutorial', 
    '12:10 min', 
    'FINANZAS', 
    'bg-blue-600', 
    'https://images.unsplash.com/photo-1460925895917-afdab827c52f?w=800&q=80', 
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    ARRAY['Cálculo automático de comisión bruta y retención corporativa.', 'Seguimiento a transacciones en trámite vs liquidadas.', 'Análisis de conversión por zona y tipología de propiedad.'], 
    true
),
(
    'mat-3', 
    3, 
    'Guía de Captación Directa & Exclusividades', 
    'Protocolo formal para presentar la propuesta de valor MAXIMUS a propietarios, blindar acuerdos de exclusividad y fijar comisiones acordadas.', 
    'inmuebles', 
    'Inmuebles & Captaciones', 
    'guia', 
    'Guía Práctica', 
    'Lectura 7 min', 
    'CAPTACIÓN', 
    'bg-teal-600', 
    'https://images.unsplash.com/photo-1560518883-ce09059eeffa?w=800&q=80', 
    '#', 
    ARRAY['Argumentario de venta frente a ventas directas sin inmobiliaria.', 'Revisión legal de tradición de propiedad de 20 a 30 años.', 'Firma del contrato de mandato exclusivo de intermediación.'], 
    true
),
(
    'mat-4', 
    4, 
    'Manual de Cierre y Liquidación 70/30', 
    'Procedimiento operativo estándar para registrar una venta en notaría, documentar cheques/transferencias y emitir recibos contables oficiales.', 
    'ventas', 
    'Ventas & Negociación', 
    'video', 
    'Video Masterclass', 
    '08:45 min', 
    'CIERRES', 
    'bg-purple-600', 
    'https://images.unsplash.com/photo-1554224155-8d04cb21cd6c?w=800&q=80', 
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    ARRAY['Documentación obligatoria del comprador y vendedor.', 'Split de comisión oficial (70% asesor oficial / 50% externo).', 'Emisión del comprobante de liquidación y archivo digital.'], 
    true
),
(
    'mat-5', 
    5, 
    'Formato Legal: Opción a Compraventa & Arrendamiento', 
    'Modelos contractuales oficiales redactados por el departamento jurídico de MAXIMUS, listos para descargar y personalizar.', 
    'legal', 
    'Legal & Contratos', 
    'pdf', 
    'Documento PDF', 
    'Documento PDF', 
    'LEGAL', 
    'bg-amber-600', 
    'https://images.unsplash.com/photo-1450133064473-71024230f91b?w=800&q=80', 
    '#', 
    ARRAY['Cláusulas penales por desistimiento y arras.', 'Condiciones de pago en divisas y transferencias internacionales.', 'Tiempos de prórroga para finiquito de créditos y solvencias.'], 
    true
),
(
    'mat-6', 
    6, 
    'Presentación de Dossiers VIP y Matching de Clientes', 
    'Cómo utilizar el módulo de Colecciones VIP para enviar portafolios interactivos con tu marca personal y seguimiento automatizado n8n.', 
    'primeros-pasos', 
    'Primeros pasos', 
    'video', 
    'Video Tutorial', 
    '06:15 min', 
    'CRM VIP', 
    'bg-emerald-700', 
    'https://images.unsplash.com/photo-1522071820081-009f0129c71c?w=800&q=80', 
    'https://www.youtube.com/watch?v=dQw4w9WgXcQ', 
    ARRAY['Creación de colección temática para clientes inversionistas.', 'Envío por WhatsApp con mensaje predeterminado.', 'Disparo de webhooks n8n para confirmación de entrega por correo.'], 
    true
)
ON CONFLICT (id) DO UPDATE SET 
    titulo = EXCLUDED.titulo,
    descripcion = EXCLUDED.descripcion,
    categoria = EXCLUDED.categoria,
    categoria_nombre = EXCLUDED.categoria_nombre,
    tipo = EXCLUDED.tipo,
    tipo_label = EXCLUDED.tipo_label,
    duracion = EXCLUDED.duracion,
    badge = EXCLUDED.badge,
    badge_color = EXCLUDED.badge_color,
    imagen = EXCLUDED.imagen,
    url_recurso = EXCLUDED.url_recurso,
    resumen_puntos = EXCLUDED.resumen_puntos,
    activo = EXCLUDED.activo,
    updated_at = now();

NOTIFY pgrst, 'reload schema';
