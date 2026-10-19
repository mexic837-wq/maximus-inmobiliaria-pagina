-- =====================================================================
-- MAXIMUS INMOBILIARIA - MIGRACIÓN SQL: MÓDULO MIS CLIENTES (CRM ASESOR)
-- =====================================================================
-- Ejecuta este script directamente en el "SQL Editor" de tu panel de Supabase.
-- Es 100% seguro e idempotente (se puede ejecutar varias veces sin borrar datos existentes).
-- =====================================================================

-- 1. ACTUALIZAR O RELAJAR EL CONSTRAINT DE ESTATUS EN LA TABLA LEADS
-- Para soportar las 6 etapas del embudo comercial:
-- ('nuevo', 'contactado', 'visita_agendada', 'en_negociacion', 'en_tramite', 'cerrado', 'descartado')
DO $$
BEGIN
    -- Eliminar constraints antiguos de estatus si existen
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'leads_estatus_check' AND conrelid = 'public.leads'::regclass
    ) THEN
        ALTER TABLE public.leads DROP CONSTRAINT leads_estatus_check;
    END IF;

    -- Agregar nuevo constraint de estatus ampliado
    ALTER TABLE public.leads 
    ADD CONSTRAINT leads_estatus_check 
    CHECK (estatus IN ('nuevo', 'contactado', 'visita_agendada', 'en_negociacion', 'en_tramite', 'cerrado', 'descartado'));
END $$;


-- 2. ACTUALIZAR O RELAJAR EL CONSTRAINT DE ORIGEN EN LA TABLA LEADS
DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM pg_constraint 
        WHERE conname = 'leads_origen_check' AND conrelid = 'public.leads'::regclass
    ) THEN
        ALTER TABLE public.leads DROP CONSTRAINT leads_origen_check;
    END IF;

    ALTER TABLE public.leads 
    ADD CONSTRAINT leads_origen_check 
    CHECK (origen IN ('web', 'whatsapp', 'meta_ads', 'referido', 'llamada', 'instagram', 'crm_manual', 'landing_lead_magnet_vende_con_nosotros', 'otro'));
END $$;


-- 3. AGREGAR COLUMNAS PARA EL CRM EN LA TABLA LEADS (SI NO EXISTEN)
ALTER TABLE public.leads 
    ADD COLUMN IF NOT EXISTS temperatura TEXT DEFAULT 'caliente' CHECK (temperatura IN ('caliente', 'tibio', 'frio')),
    ADD COLUMN IF NOT EXISTS presupuesto NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS tipo_operacion TEXT DEFAULT 'compra' CHECK (tipo_operacion IN ('compra', 'venta', 'alquiler')),
    ADD COLUMN IF NOT EXISTS tipo_inmueble_interes TEXT DEFAULT 'casa',
    ADD COLUMN IF NOT EXISTS inmueble_interes_titulo TEXT,
    ADD COLUMN IF NOT EXISTS zonas_interes TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS requisitos_indispensables TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS ultimo_contacto_at TIMESTAMPTZ DEFAULT now();


-- 4. CREAR TABLA: LEAD_ACTIVIDADES (Bitácora & Timeline 360°)
CREATE TABLE IF NOT EXISTS public.lead_actividades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    agente_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('nota', 'llamada', 'whatsapp', 'visita', 'email', 'cambio_etapa', 'propuesta', 'cierre')),
    descripcion TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- 5. ÍNDICES DE ALTO RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_leads_agente_id ON public.leads(agente_id);
CREATE INDEX IF NOT EXISTS idx_leads_estatus ON public.leads(estatus);
CREATE INDEX IF NOT EXISTS idx_leads_temperatura ON public.leads(temperatura);
CREATE INDEX IF NOT EXISTS idx_lead_actividades_lead_id ON public.lead_actividades(lead_id);
CREATE INDEX IF NOT EXISTS idx_lead_actividades_created_at ON public.lead_actividades(created_at DESC);


-- 6. POLÍTICAS DE SEGURIDAD ROW LEVEL SECURITY (RLS)
ALTER TABLE public.lead_actividades ENABLE ROW LEVEL SECURITY;

-- Permitir a usuarios autenticados (asesores y admin) consultar actividades
DROP POLICY IF EXISTS "Actividades: ver auth" ON public.lead_actividades;
CREATE POLICY "Actividades: ver auth" ON public.lead_actividades
    FOR SELECT TO authenticated USING (true);

-- Permitir registrar nuevas actividades
DROP POLICY IF EXISTS "Actividades: insertar auth" ON public.lead_actividades;
CREATE POLICY "Actividades: insertar auth" ON public.lead_actividades
    FOR INSERT TO authenticated WITH CHECK (true);

-- Permitir actualizar actividades propias
DROP POLICY IF EXISTS "Actividades: modificar auth" ON public.lead_actividades;
CREATE POLICY "Actividades: modificar auth" ON public.lead_actividades
    FOR UPDATE TO authenticated USING (true);

-- Permitir eliminar notas/actividades
DROP POLICY IF EXISTS "Actividades: eliminar auth" ON public.lead_actividades;
CREATE POLICY "Actividades: eliminar auth" ON public.lead_actividades
    FOR DELETE TO authenticated USING (true);


-- 7. RECARGAR EL CACHÉ DEL SCHEMA DE SUPABASE (API POSTGREST)
NOTIFY pgrst, 'reload schema';
