-- ==============================================================================
-- MAXIMUS INMOBILIARIA - MIGRACIÓN SQL DEFINITIVA: CRM MIS CLIENTES & RLS
-- ==============================================================================
-- Ejecuta este script en el "SQL Editor" de tu panel de Supabase.
-- Resuelve el error 401 Unauthorized y permite lectura/escritura total de leads.
-- ==============================================================================

-- 1. TABLA LEADS (Prospectos y Clientes Comerciales)
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL,
    telefono TEXT,
    email TEXT,
    inmueble_interes_id UUID REFERENCES public.inmuebles(id) ON DELETE SET NULL,
    inmueble_interes_titulo TEXT,
    inmueble_interes_precio NUMERIC(14,2) DEFAULT 0,
    origen TEXT DEFAULT 'web',
    estatus TEXT DEFAULT 'nuevo',
    temperatura TEXT DEFAULT 'caliente',
    operacion TEXT DEFAULT 'compra',
    tipo_inmueble TEXT DEFAULT 'casa',
    presupuesto NUMERIC(14,2) DEFAULT 0,
    presupuesto_min NUMERIC(14,2) DEFAULT 0,
    presupuesto_max NUMERIC(14,2) DEFAULT 0,
    moneda TEXT DEFAULT 'USD',
    zonas_interes TEXT[] DEFAULT '{}',
    requisitos TEXT,
    requisitos_indispensables TEXT[] DEFAULT '{}',
    asesor_id TEXT DEFAULT 'asesor-1',
    asesor_nombre TEXT DEFAULT 'Asesor MAXIMUS',
    agente_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- Asegurar columnas si la tabla ya existía previamente
ALTER TABLE public.leads 
    ADD COLUMN IF NOT EXISTS inmueble_interes_precio NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS operacion TEXT DEFAULT 'compra',
    ADD COLUMN IF NOT EXISTS tipo_inmueble TEXT DEFAULT 'casa',
    ADD COLUMN IF NOT EXISTS temperatura TEXT DEFAULT 'caliente',
    ADD COLUMN IF NOT EXISTS presupuesto NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS presupuesto_min NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS presupuesto_max NUMERIC(14,2) DEFAULT 0,
    ADD COLUMN IF NOT EXISTS moneda TEXT DEFAULT 'USD',
    ADD COLUMN IF NOT EXISTS zonas_interes TEXT[] DEFAULT '{}',
    ADD COLUMN IF NOT EXISTS requisitos TEXT,
    ADD COLUMN IF NOT EXISTS asesor_id TEXT DEFAULT 'asesor-1',
    ADD COLUMN IF NOT EXISTS asesor_nombre TEXT DEFAULT 'Asesor MAXIMUS',
    ADD COLUMN IF NOT EXISTS agente_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    ADD COLUMN IF NOT EXISTS notas TEXT,
    ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ DEFAULT now();

-- 2. TABLA LEAD_ACTIVIDADES (Bitácora & Timeline 360°)
CREATE TABLE IF NOT EXISTS public.lead_actividades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    agente_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL,
    titulo TEXT,
    descripcion TEXT NOT NULL,
    autor TEXT,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- 3. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.lead_actividades ENABLE ROW LEVEL SECURITY;

-- 4. LIMPIAR POLÍTICAS ANTERIORES QUE CAUSABAN 401
DROP POLICY IF EXISTS "Leads: ver propios o admin" ON public.leads;
DROP POLICY IF EXISTS "Leads: insertar publico" ON public.leads;
DROP POLICY IF EXISTS "Leads: actualizar propios" ON public.leads;
DROP POLICY IF EXISTS "Leads: acceso total public" ON public.leads;
DROP POLICY IF EXISTS "Leads: lectura publica" ON public.leads;
DROP POLICY IF EXISTS "Leads: modificacion total" ON public.leads;

DROP POLICY IF EXISTS "Actividades: ver auth" ON public.lead_actividades;
DROP POLICY IF EXISTS "Actividades: insertar auth" ON public.lead_actividades;
DROP POLICY IF EXISTS "Actividades: modificar auth" ON public.lead_actividades;
DROP POLICY IF EXISTS "Actividades: eliminar auth" ON public.lead_actividades;
DROP POLICY IF EXISTS "Lead Actividades: acceso total public" ON public.lead_actividades;

-- 5. CREAR POLÍTICAS PÚBLICAS PARA ACCESO COMPLETO (ANON / AUTHENTICATED)
CREATE POLICY "Leads: acceso total public" ON public.leads
    FOR ALL TO public
    USING (true)
    WITH CHECK (true);

CREATE POLICY "Lead Actividades: acceso total public" ON public.lead_actividades
    FOR ALL TO public
    USING (true)
    WITH CHECK (true);

-- 6. RECARGAR EL CACHÉ DEL SCHEMA DE SUPABASE (POSTGREST API)
NOTIFY pgrst, 'reload schema';
