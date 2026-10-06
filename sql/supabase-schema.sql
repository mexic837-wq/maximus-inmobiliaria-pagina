-- ============================================
-- MAXIMUS INMOBILIARIA - Esquema SQL para Supabase
-- ============================================
-- 
-- INSTRUCCIONES:
-- 1. Ve al panel de Supabase → SQL Editor
-- 2. Pega este script completo y ejecútalo
-- 3. Esto creará todas las tablas, políticas RLS y datos iniciales
--
-- Diseñado para funcionar con la capa de servicios JS del proyecto.
-- ============================================


-- ===== 1. TABLA: USUARIOS (Perfiles) =====
-- Se enlaza con Supabase Auth vía auth_id
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    telefono TEXT,
    rol TEXT NOT NULL DEFAULT 'agente' CHECK (rol IN ('admin', 'agente')),
    titulo TEXT DEFAULT 'Asesor Inmobiliario',
    avatar_url TEXT,
    estado TEXT DEFAULT 'Táchira',
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== 2. TABLA: INMUEBLES =====
CREATE TABLE IF NOT EXISTS public.inmuebles (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    titulo TEXT NOT NULL,
    descripcion TEXT,
    precio NUMERIC(12,2) NOT NULL,
    moneda TEXT DEFAULT 'USD',
    operacion TEXT NOT NULL CHECK (operacion IN ('venta', 'alquiler')),
    tipo TEXT NOT NULL CHECK (tipo IN ('casa', 'apartamento', 'local', 'terreno', 'oficina', 'galpon')),
    estatus TEXT DEFAULT 'disponible' CHECK (estatus IN ('disponible', 'reservado', 'vendido', 'alquilado')),
    -- Ubicación
    ubicacion TEXT,
    estado TEXT DEFAULT 'Táchira',
    latitud NUMERIC(10,7),
    longitud NUMERIC(10,7),
    -- Características
    habitaciones INT DEFAULT 0,
    banos NUMERIC(3,1) DEFAULT 0,
    metros_cuadrados NUMERIC(10,2) DEFAULT 0,
    -- Imágenes
    foto_principal TEXT,
    fotos TEXT[] DEFAULT '{}',   -- Array de URLs de Supabase Storage
    en_oferta BOOLEAN DEFAULT false,
    -- Datos Privados (solo visible para agentes/admin)
    propietario_nombre TEXT,
    propietario_telefono TEXT,
    comision_porcentaje NUMERIC(5,2) DEFAULT 0,
    notas_privadas TEXT,
    -- Relaciones
    agente_id UUID REFERENCES public.usuarios(id),
    -- Timestamps
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== 3. TABLA: LEADS (Clientes Potenciales) =====
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL,
    telefono TEXT,
    email TEXT,
    inmueble_interes_id UUID REFERENCES public.inmuebles(id) ON DELETE SET NULL,
    origen TEXT DEFAULT 'web' CHECK (origen IN ('web', 'whatsapp', 'meta_ads', 'referido', 'llamada', 'instagram')),
    estatus TEXT DEFAULT 'nuevo' CHECK (estatus IN ('nuevo', 'contactado', 'en_negociacion', 'cerrado', 'descartado')),
    notas TEXT,
    agente_id UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== 4. TABLA: CITAS (Agenda) =====
CREATE TABLE IF NOT EXISTS public.citas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    titulo TEXT NOT NULL,
    inmueble_id UUID REFERENCES public.inmuebles(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    tipo TEXT DEFAULT 'visita' CHECK (tipo IN ('visita', 'firma', 'reunion', 'llamada')),
    notas TEXT,
    agente_id UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== 5. TABLA: PAGOS =====
CREATE TABLE IF NOT EXISTS public.pagos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fecha DATE NOT NULL,
    metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'crypto', 'paypal', 'zelle')),
    referencia TEXT,
    monto NUMERIC(10,2) NOT NULL,
    moneda TEXT DEFAULT 'USD',
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('acreditado', 'pendiente', 'rechazado')),
    agente_id UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ DEFAULT now()
);

-- ===== 6. TABLA: DOCUMENTOS =====
CREATE TABLE IF NOT EXISTS public.documentos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    titulo TEXT NOT NULL,
    tipo_archivo TEXT DEFAULT 'pdf',
    categoria TEXT DEFAULT 'general',
    tamano_kb INT,
    url TEXT NOT NULL,
    agente_id UUID REFERENCES public.usuarios(id),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== 7. TABLA: ZONAS Y PRECIOS POR M2 (Cotizador Inmobiliario) =====
CREATE TABLE IF NOT EXISTS public.zonas_cotizador (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    municipio TEXT NOT NULL DEFAULT 'San Cristóbal',
    precio_m2_base NUMERIC(10,2) NOT NULL, -- Precio base por metro cuadrado en USD
    precio_min_m2 NUMERIC(10,2),           -- Rango inferior sugerido
    precio_max_m2 NUMERIC(10,2),           -- Rango superior sugerido
    factor_apartamento NUMERIC(4,2) DEFAULT 1.00,
    factor_casa NUMERIC(4,2) DEFAULT 1.05,
    factor_terreno NUMERIC(4,2) DEFAULT 0.60,
    factor_local NUMERIC(4,2) DEFAULT 1.30,
    activo BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== HABILITAR ROW LEVEL SECURITY (RLS) =====
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmuebles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zonas_cotizador ENABLE ROW LEVEL SECURITY;


-- ===== POLÍTICAS RLS BÁSICAS =====
-- Los agentes solo ven sus propios datos. Los admin ven todo.

-- Usuarios: cada quien ve su perfil, admin ve todos
CREATE POLICY "Usuarios: ver propio" ON public.usuarios
    FOR SELECT USING (auth.uid() = auth_id);

-- Inmuebles: agentes ven los suyos, admin ve todos
CREATE POLICY "Inmuebles: ver propios o admin" ON public.inmuebles
    FOR SELECT USING (
        agente_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = auth.uid() AND rol = 'admin')
    );

CREATE POLICY "Inmuebles: insertar propios" ON public.inmuebles
    FOR INSERT WITH CHECK (
        agente_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
    );

CREATE POLICY "Inmuebles: actualizar propios o admin" ON public.inmuebles
    FOR UPDATE USING (
        agente_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = auth.uid() AND rol = 'admin')
    );

-- Leads: mismo patrón
CREATE POLICY "Leads: ver propios o admin" ON public.leads
    FOR SELECT USING (
        agente_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = auth.uid() AND rol = 'admin')
    );

CREATE POLICY "Leads: insertar" ON public.leads
    FOR INSERT WITH CHECK (true);

CREATE POLICY "Leads: actualizar propios" ON public.leads
    FOR UPDATE USING (
        agente_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = auth.uid() AND rol = 'admin')
    );

-- Citas
CREATE POLICY "Citas: ver propias o admin" ON public.citas
    FOR SELECT USING (
        agente_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = auth.uid() AND rol = 'admin')
    );

CREATE POLICY "Citas: insertar" ON public.citas
    FOR INSERT WITH CHECK (true);

-- Pagos: solo ver los propios
CREATE POLICY "Pagos: ver propios o admin" ON public.pagos
    FOR SELECT USING (
        agente_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.usuarios WHERE auth_id = auth.uid() AND rol = 'admin')
    );

-- Documentos: acceso público para lectura
CREATE POLICY "Documentos: lectura pública" ON public.documentos
    FOR SELECT USING (true);


-- ===== TRIGGER: ACTUALIZAR updated_at AUTOMÁTICAMENTE =====
CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_inmuebles_updated_at
    BEFORE UPDATE ON public.inmuebles
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_leads_updated_at
    BEFORE UPDATE ON public.leads
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_documentos_updated_at
    BEFORE UPDATE ON public.documentos
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ===== STORAGE BUCKET =====
-- Ejecutar en SQL Editor de Supabase:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('inmuebles-fotos', 'inmuebles-fotos', true);
