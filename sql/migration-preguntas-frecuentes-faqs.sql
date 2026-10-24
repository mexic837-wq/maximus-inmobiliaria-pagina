-- ==============================================================================
-- MAXIMUS INMOBILIARIA - MIGRACIÓN SQL: PREGUNTAS FRECUENTES (FAQS WEB)
-- ==============================================================================
-- Ejecuta este script directamente en el "SQL Editor" de tu panel de Supabase.
-- Es 100% seguro e idempotente (se puede ejecutar varias veces sin borrar datos).
-- ==============================================================================

-- 1. TABLA: PREGUNTAS FRECUENTES (Landing Page & Dashboard)
CREATE TABLE IF NOT EXISTS public.preguntas_frecuentes (
    id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
    pregunta TEXT NOT NULL,
    respuesta TEXT NOT NULL,
    categoria TEXT DEFAULT 'General',
    icono TEXT DEFAULT 'ph-question',
    orden INT DEFAULT 1,
    mostrar_en_web BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Si la tabla ya existía, asegurar compatibilidad de id
DO $$ 
BEGIN 
    ALTER TABLE public.preguntas_frecuentes ALTER COLUMN id SET DEFAULT gen_random_uuid()::text;
EXCEPTION 
    WHEN others THEN NULL; 
END $$;

-- 2. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.preguntas_frecuentes ENABLE ROW LEVEL SECURITY;

-- 3. POLÍTICAS RLS PERMISIVAS (Lectura anónima/pública, escritura para usuarios y admin)
DROP POLICY IF EXISTS "Faqs: lectura publica" ON public.preguntas_frecuentes;
DROP POLICY IF EXISTS "Faqs: insertar" ON public.preguntas_frecuentes;
DROP POLICY IF EXISTS "Faqs: actualizar" ON public.preguntas_frecuentes;
DROP POLICY IF EXISTS "Faqs: eliminar" ON public.preguntas_frecuentes;

CREATE POLICY "Faqs: lectura publica" 
ON public.preguntas_frecuentes 
FOR SELECT 
USING (true);

CREATE POLICY "Faqs: insertar" 
ON public.preguntas_frecuentes 
FOR INSERT 
WITH CHECK (true);

CREATE POLICY "Faqs: actualizar" 
ON public.preguntas_frecuentes 
FOR UPDATE 
USING (true);

CREATE POLICY "Faqs: eliminar" 
ON public.preguntas_frecuentes 
FOR DELETE 
USING (true);

-- 4. INSERTAR PREGUNTAS INICIALES VERIFICADAS (Si la tabla está vacía)
INSERT INTO public.preguntas_frecuentes (id, pregunta, respuesta, categoria, icono, orden, mostrar_en_web)
SELECT 
    'faq-01',
    '¿Cómo funciona el pago en Bolívares desde Venezuela?',
    'Puedes pagar en Bolívares mediante <strong>Pago Móvil</strong> calculado a la tasa oficial del <strong>Banco Central de Venezuela (BCV)</strong> del día exacto, o en dólares vía <strong>Zelle</strong>, <strong>Binance Pay (USDT)</strong> y tarjetas internacionales Visa/Mastercard.',
    'Planes & Pagos',
    'fas fa-coins',
    1,
    true
WHERE NOT EXISTS (SELECT 1 FROM public.preguntas_frecuentes WHERE id = 'faq-01');

INSERT INTO public.preguntas_frecuentes (id, pregunta, respuesta, categoria, icono, orden, mostrar_en_web)
SELECT 
    'faq-02',
    '¿Mis clientes me contactan directamente a mí?',
    '<strong>Totalmente y sin intermediación.</strong> En cada propiedad que publiques se muestra tu ficha con tu fotografía, nombre y un botón de WhatsApp que abre una conversación directa a tu número de teléfono personal.',
    'Directo Asesor',
    'fab fa-whatsapp',
    2,
    true
WHERE NOT EXISTS (SELECT 1 FROM public.preguntas_frecuentes WHERE id = 'faq-02');

INSERT INTO public.preguntas_frecuentes (id, pregunta, respuesta, categoria, icono, orden, mostrar_en_web)
SELECT 
    'faq-03',
    '¿Puedo cancelar o cambiar de plan cuando quiera?',
    '<strong>Sí, sin ataduras ni contratos forzosos.</strong> Puedes cancelar tu suscripción con un solo clic desde tu panel y disfrutar de todas las funciones hasta el vencimiento del periodo pagado, sin cargos adicionales.',
    'Membresía & Cancelación',
    'fas fa-shield-alt',
    3,
    true
WHERE NOT EXISTS (SELECT 1 FROM public.preguntas_frecuentes WHERE id = 'faq-03');
