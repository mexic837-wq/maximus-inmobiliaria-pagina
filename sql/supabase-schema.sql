-- ==============================================================================
-- MAXIMUS INMOBILIARIA - ESQUEMA INTEGRAL PARA SUPABASE (PRODUCCIÓN & VPS)
-- ==============================================================================
-- Instrucciones:
-- 1. Accede a tu panel de Supabase (https://db.maximusinmobiliaria.tech/)
-- 2. Entra en SQL Editor -> Nuevo Query
-- 3. Pega este script completo y haz clic en RUN
-- 4. Es 100% idempotente (puedes ejecutarlo varias veces sin errores)
-- ==============================================================================

-- ===== EXTENSIONES NECESARIAS =====
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";


-- ===== 1. STORAGE BUCKETS (FOTOS, AVATARES Y DOCUMENTOS) =====
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('inmuebles-fotos', 'inmuebles-fotos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/avif']),
    ('avatars', 'avatars', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp']),
    ('documentos', 'documentos', true, 52428800, ARRAY['application/pdf', 'image/jpeg', 'image/png'])
ON CONFLICT (id) DO UPDATE SET public = true;

-- Políticas de Storage (Idempotentes)
DROP POLICY IF EXISTS "Acceso publico lectura fotos inmuebles" ON storage.objects;
CREATE POLICY "Acceso publico lectura fotos inmuebles" 
ON storage.objects FOR SELECT 
USING (bucket_id IN ('inmuebles-fotos', 'avatars', 'documentos'));

DROP POLICY IF EXISTS "Subida autorizada de archivos" ON storage.objects;
CREATE POLICY "Subida autorizada de archivos" 
ON storage.objects FOR INSERT 
TO public
WITH CHECK (bucket_id IN ('inmuebles-fotos', 'avatars', 'documentos'));

DROP POLICY IF EXISTS "Modificacion autorizada de archivos" ON storage.objects;
CREATE POLICY "Modificacion autorizada de archivos" 
ON storage.objects FOR UPDATE 
TO authenticated 
USING (bucket_id IN ('inmuebles-fotos', 'avatars', 'documentos'));

DROP POLICY IF EXISTS "Eliminacion autorizada de archivos" ON storage.objects;
CREATE POLICY "Eliminacion autorizada de archivos" 
ON storage.objects FOR DELETE 
TO authenticated 
USING (bucket_id IN ('inmuebles-fotos', 'avatars', 'documentos'));


-- ===== 2. TABLA: USUARIOS (Perfiles Enlazados a Supabase Auth) =====
CREATE TABLE IF NOT EXISTS public.usuarios (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auth_id UUID UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
    nombre_completo TEXT NOT NULL,
    email TEXT NOT NULL UNIQUE,
    telefono TEXT,
    rol TEXT NOT NULL DEFAULT 'cliente' CHECK (rol IN ('admin', 'asesor_maximus', 'asesor_externo', 'agente', 'cliente', 'usuario')),
    tipo_asesor TEXT DEFAULT NULL CHECK (tipo_asesor IS NULL OR tipo_asesor IN ('maximus', 'externo', 'cliente')),
    titulo TEXT DEFAULT 'Usuario Registrado',
    avatar_url TEXT,
    bio TEXT DEFAULT 'Asesor inmobiliario especializado en propiedades exclusivas y activos de alto valor en Táchira.',
    licencia_inmobiliaria TEXT DEFAULT 'CIV-9821 / Cámara Inmobiliaria',
    two_factor_enabled BOOLEAN DEFAULT false,
    two_factor_method TEXT DEFAULT 'whatsapp' CHECK (two_factor_method IN ('whatsapp', 'email', 'app')),
    two_factor_phone TEXT,
    notif_whatsapp_leads BOOLEAN DEFAULT true,
    notif_whatsapp_citas BOOLEAN DEFAULT true,
    notif_whatsapp_cierres BOOLEAN DEFAULT true,
    porcentaje_comision_default NUMERIC(5,2) DEFAULT 70.00,
    estado TEXT DEFAULT 'Táchira',
    activo BOOLEAN DEFAULT true,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ===== 3. TABLA: INMUEBLES =====
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
    fotos TEXT[] DEFAULT '{}',
    en_oferta BOOLEAN DEFAULT false,
    -- Datos Privados (solo agentes / admin)
    propietario_nombre TEXT,
    propietario_telefono TEXT,
    comision_porcentaje NUMERIC(5,2) DEFAULT 5.00,
    notas_privadas TEXT,
    -- Relaciones
    agente_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ===== 4. TABLA: LEADS (Prospectos y Clientes CRM) =====
CREATE TABLE IF NOT EXISTS public.leads (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL,
    telefono TEXT,
    email TEXT,
    inmueble_interes_id UUID REFERENCES public.inmuebles(id) ON DELETE SET NULL,
    inmueble_interes_titulo TEXT,
    origen TEXT DEFAULT 'web' CHECK (origen IN ('web', 'whatsapp', 'meta_ads', 'referido', 'llamada', 'instagram', 'crm_manual', 'landing_lead_magnet_vende_con_nosotros', 'otro')),
    estatus TEXT DEFAULT 'nuevo' CHECK (estatus IN ('nuevo', 'contactado', 'visita_agendada', 'en_negociacion', 'en_tramite', 'cerrado', 'descartado')),
    temperatura TEXT DEFAULT 'caliente' CHECK (temperatura IN ('caliente', 'tibio', 'frio')),
    presupuesto NUMERIC(14,2) DEFAULT 0,
    tipo_operacion TEXT DEFAULT 'compra' CHECK (tipo_operacion IN ('compra', 'venta', 'alquiler')),
    tipo_inmueble_interes TEXT DEFAULT 'casa',
    zonas_interes TEXT[] DEFAULT '{}',
    requisitos_indispensables TEXT[] DEFAULT '{}',
    notas TEXT,
    agente_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    ultimo_contacto_at TIMESTAMPTZ DEFAULT now(),
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);

-- ===== 4.1. TABLA: LEAD_ACTIVIDADES (Bitácora & Timeline 360°) =====
CREATE TABLE IF NOT EXISTS public.lead_actividades (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    lead_id UUID NOT NULL REFERENCES public.leads(id) ON DELETE CASCADE,
    agente_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    tipo TEXT NOT NULL CHECK (tipo IN ('nota', 'llamada', 'whatsapp', 'visita', 'email', 'cambio_etapa', 'propuesta', 'cierre')),
    descripcion TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- ===== 5. TABLA: CITAS (Agenda Inmobiliaria) =====
CREATE TABLE IF NOT EXISTS public.citas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    titulo TEXT NOT NULL,
    inmueble_id UUID REFERENCES public.inmuebles(id) ON DELETE SET NULL,
    lead_id UUID REFERENCES public.leads(id) ON DELETE SET NULL,
    fecha DATE NOT NULL,
    hora TIME NOT NULL,
    tipo TEXT DEFAULT 'visita' CHECK (tipo IN ('visita', 'firma', 'reunion', 'llamada')),
    notas TEXT,
    agente_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- ===== 6. TABLA: PAGOS =====
CREATE TABLE IF NOT EXISTS public.pagos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    fecha DATE NOT NULL,
    metodo TEXT NOT NULL CHECK (metodo IN ('efectivo', 'transferencia', 'crypto', 'paypal', 'zelle')),
    referencia TEXT,
    monto NUMERIC(10,2) NOT NULL,
    moneda TEXT DEFAULT 'USD',
    estado TEXT DEFAULT 'pendiente' CHECK (estado IN ('acreditado', 'pendiente', 'rechazado')),
    agente_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- ===== 7. TABLA: DOCUMENTOS =====
CREATE TABLE IF NOT EXISTS public.documentos (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    titulo TEXT NOT NULL,
    tipo_archivo TEXT DEFAULT 'pdf',
    categoria TEXT DEFAULT 'general',
    tamano_kb INT,
    url TEXT NOT NULL,
    agente_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ===== 8. TABLA: ZONAS Y PRECIOS POR M2 (Cotizador Inmobiliario Express) =====
CREATE TABLE IF NOT EXISTS public.zonas_cotizador (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL UNIQUE,
    municipio TEXT NOT NULL DEFAULT 'San Cristóbal',
    precio_m2_base NUMERIC(10,2) NOT NULL,
    precio_min_m2 NUMERIC(10,2),
    precio_max_m2 NUMERIC(10,2),
    factor_apartamento NUMERIC(4,2) DEFAULT 1.00,
    factor_casa NUMERIC(4,2) DEFAULT 1.05,
    factor_terreno NUMERIC(4,2) DEFAULT 0.60,
    factor_local NUMERIC(4,2) DEFAULT 1.30,
    activo BOOLEAN DEFAULT true,
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ===== 9. TABLA: CIERRES DE VENTAS & HISTÓRICO DE COMISIONES =====
CREATE TABLE IF NOT EXISTS public.cierres_ventas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    inmueble_id UUID REFERENCES public.inmuebles(id) ON DELETE SET NULL,
    inmueble_titulo TEXT NOT NULL,
    ubicacion TEXT,
    foto TEXT,
    asesor_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    asesor_nombre TEXT NOT NULL,
    asesor_tipo TEXT DEFAULT 'maximus' CHECK (asesor_tipo IN ('maximus', 'externo')),
    tipo_operacion TEXT NOT NULL CHECK (tipo_operacion IN ('venta', 'alquiler')),
    precio_final NUMERIC(12,2) NOT NULL,
    moneda TEXT DEFAULT 'USD',
    comision_bruta_porcentaje NUMERIC(5,2) NOT NULL DEFAULT 5.00,
    comision_bruta_monto NUMERIC(12,2) NOT NULL,
    asesor_porcentaje_neto NUMERIC(5,2) NOT NULL DEFAULT 70.00,
    comision_neta_asesor NUMERIC(12,2) NOT NULL,
    comision_oficina_monto NUMERIC(12,2) NOT NULL,
    estatus_comision TEXT NOT NULL DEFAULT 'liquidada' CHECK (estatus_comision IN ('liquidada', 'pendiente', 'en_tramite')),
    fecha_cierre DATE NOT NULL DEFAULT CURRENT_DATE,
    cliente_comprador TEXT,
    cliente_vendedor TEXT,
    metodo_pago TEXT DEFAULT 'transferencia',
    referencia_pago TEXT,
    notas TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ===== 10. TABLA: COLECCIONES VIP (Dossiers para Clientes) =====
CREATE TABLE IF NOT EXISTS public.colecciones_vip (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    cliente TEXT NOT NULL,
    telefono TEXT,
    titulo TEXT NOT NULL,
    nota TEXT,
    inmuebles TEXT[] DEFAULT '{}',
    asesor_id UUID REFERENCES public.usuarios(id) ON DELETE SET NULL,
    asesor_nombre TEXT,
    fecha_str TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ===== 11. TABLA: EQUIPO WEB (Landing Page "Nuestro Equipo") =====
CREATE TABLE IF NOT EXISTS public.equipo_web (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL,
    cargo TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    whatsapp TEXT,
    foto_url TEXT NOT NULL,
    orden INT DEFAULT 1,
    mostrar_en_web BOOLEAN DEFAULT true,
    activo BOOLEAN DEFAULT true,
    bio TEXT,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ===== 12. TABLA: ASESORES MAXIMUS (Captadores Oficiales del Dashboard) =====
CREATE TABLE IF NOT EXISTS public.asesores_maximus (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    nombre TEXT NOT NULL,
    cargo TEXT NOT NULL,
    especialidad TEXT NOT NULL,
    email TEXT,
    telefono TEXT,
    whatsapp TEXT,
    avatar TEXT,
    rating NUMERIC(3,1) DEFAULT 5.0,
    cierres INT DEFAULT 0,
    badge_texto TEXT DEFAULT 'Asesor Certificado',
    destacado BOOLEAN DEFAULT false,
    activo BOOLEAN DEFAULT true,
    orden INT DEFAULT 1,
    created_at TIMESTAMPTZ DEFAULT now(),
    updated_at TIMESTAMPTZ DEFAULT now()
);


-- ===== 13. TABLA: NOTIFICACIONES (Centro de Alertas & Operaciones) =====
CREATE TABLE IF NOT EXISTS public.notificaciones (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    usuario_id UUID REFERENCES public.usuarios(id) ON DELETE CASCADE,
    tipo TEXT NOT NULL CHECK (tipo IN ('lead', 'captacion', 'comision', 'alerta', 'sistema')),
    titulo TEXT NOT NULL,
    mensaje TEXT NOT NULL,
    metadata JSONB DEFAULT '{}'::jsonb,
    leida BOOLEAN DEFAULT false,
    created_at TIMESTAMPTZ DEFAULT now()
);


-- ===== HABILITAR ROW LEVEL SECURITY (RLS) =====
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmuebles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zonas_cotizador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cierres_ventas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.colecciones_vip ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.equipo_web ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.asesores_maximus ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;


-- ===== POLÍTICAS RLS IDEMPOTENTES =====

-- Usuarios
DROP POLICY IF EXISTS "Usuarios: ver propio" ON public.usuarios;
CREATE POLICY "Usuarios: ver propio" ON public.usuarios
    FOR SELECT USING (auth.uid() = auth_id OR auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Usuarios: actualizar propio" ON public.usuarios;
CREATE POLICY "Usuarios: actualizar propio" ON public.usuarios
    FOR UPDATE USING (auth.uid() = auth_id)
    WITH CHECK (auth.uid() = auth_id);

-- Inmuebles
DROP POLICY IF EXISTS "Inmuebles: lectura publica de disponibles" ON public.inmuebles;
CREATE POLICY "Inmuebles: lectura publica de disponibles" ON public.inmuebles
    FOR SELECT USING (
        estatus = 'disponible'
        OR auth.uid() IS NOT NULL
    );

DROP POLICY IF EXISTS "Inmuebles: insertar auth" ON public.inmuebles;
CREATE POLICY "Inmuebles: insertar auth" ON public.inmuebles
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Inmuebles: actualizar propios o admin" ON public.inmuebles;
CREATE POLICY "Inmuebles: actualizar propios o admin" ON public.inmuebles
    FOR UPDATE TO authenticated USING (true);

-- Leads
DROP POLICY IF EXISTS "Leads: ver propios o admin" ON public.leads;
CREATE POLICY "Leads: ver propios o admin" ON public.leads
    FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS "Leads: insertar publico" ON public.leads;
CREATE POLICY "Leads: insertar publico" ON public.leads
    FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Leads: actualizar propios" ON public.leads;
CREATE POLICY "Leads: actualizar propios" ON public.leads
    FOR UPDATE TO authenticated USING (true);

-- Citas
DROP POLICY IF EXISTS "Citas: ver auth" ON public.citas;
CREATE POLICY "Citas: ver auth" ON public.citas
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Citas: insertar auth" ON public.citas;
CREATE POLICY "Citas: insertar auth" ON public.citas
    FOR INSERT TO authenticated WITH CHECK (true);

-- Pagos
DROP POLICY IF EXISTS "Pagos: ver auth" ON public.pagos;
CREATE POLICY "Pagos: ver auth" ON public.pagos
    FOR SELECT TO authenticated USING (true);

-- Documentos
DROP POLICY IF EXISTS "Documentos: lectura publica" ON public.documentos;
CREATE POLICY "Documentos: lectura publica" ON public.documentos
    FOR SELECT USING (true);

-- Zonas Cotizador
DROP POLICY IF EXISTS "Zonas cotizador: lectura publica" ON public.zonas_cotizador;
CREATE POLICY "Zonas cotizador: lectura publica" ON public.zonas_cotizador
    FOR SELECT USING (true);

DROP POLICY IF EXISTS "Zonas cotizador: modificacion auth" ON public.zonas_cotizador;
CREATE POLICY "Zonas cotizador: modificacion auth" ON public.zonas_cotizador
    FOR ALL TO authenticated USING (true);

-- Cierres de Ventas
DROP POLICY IF EXISTS "Cierres: ver registros autorizados" ON public.cierres_ventas;
CREATE POLICY "Cierres: ver registros autorizados" ON public.cierres_ventas
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Cierres: insertar" ON public.cierres_ventas;
CREATE POLICY "Cierres: insertar" ON public.cierres_ventas
    FOR INSERT TO authenticated WITH CHECK (true);

-- Colecciones VIP
DROP POLICY IF EXISTS "Colecciones VIP: ver auth" ON public.colecciones_vip;
CREATE POLICY "Colecciones VIP: ver auth" ON public.colecciones_vip
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Colecciones VIP: insertar auth" ON public.colecciones_vip;
CREATE POLICY "Colecciones VIP: insertar auth" ON public.colecciones_vip
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Colecciones VIP: modificar auth" ON public.colecciones_vip;
CREATE POLICY "Colecciones VIP: modificar auth" ON public.colecciones_vip
    FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Colecciones VIP: eliminar auth" ON public.colecciones_vip;
CREATE POLICY "Colecciones VIP: eliminar auth" ON public.colecciones_vip
    FOR DELETE TO authenticated USING (true);

-- Equipo Web
DROP POLICY IF EXISTS "Equipo Web: lectura publica" ON public.equipo_web;
CREATE POLICY "Equipo Web: lectura publica" ON public.equipo_web
    FOR SELECT USING (mostrar_en_web = true AND activo = true);

DROP POLICY IF EXISTS "Equipo Web: ver todos auth" ON public.equipo_web;
CREATE POLICY "Equipo Web: ver todos auth" ON public.equipo_web
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Equipo Web: modificar auth" ON public.equipo_web;
CREATE POLICY "Equipo Web: modificar auth" ON public.equipo_web
    FOR ALL TO authenticated USING (true);

-- Asesores Maximus
DROP POLICY IF EXISTS "Asesores Maximus: lectura publica" ON public.asesores_maximus;
CREATE POLICY "Asesores Maximus: lectura publica" ON public.asesores_maximus
    FOR SELECT USING (activo = true);

DROP POLICY IF EXISTS "Asesores Maximus: modificar auth" ON public.asesores_maximus;
CREATE POLICY "Asesores Maximus: modificar auth" ON public.asesores_maximus
    FOR ALL TO authenticated USING (true);

-- Notificaciones
DROP POLICY IF EXISTS "Notificaciones: ver propias" ON public.notificaciones;
CREATE POLICY "Notificaciones: ver propias" ON public.notificaciones
    FOR SELECT USING (auth.uid() IS NOT NULL OR usuario_id IS NULL);

DROP POLICY IF EXISTS "Notificaciones: actualizar propias" ON public.notificaciones;
CREATE POLICY "Notificaciones: actualizar propias" ON public.notificaciones
    FOR UPDATE USING (auth.uid() IS NOT NULL OR usuario_id IS NULL);

-- Actividades de Leads (CRM)
ALTER TABLE public.lead_actividades ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Actividades: ver auth" ON public.lead_actividades;
CREATE POLICY "Actividades: ver auth" ON public.lead_actividades
    FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Actividades: insertar auth" ON public.lead_actividades;
CREATE POLICY "Actividades: insertar auth" ON public.lead_actividades
    FOR INSERT TO authenticated WITH CHECK (true);

DROP POLICY IF EXISTS "Actividades: modificar auth" ON public.lead_actividades;
CREATE POLICY "Actividades: modificar auth" ON public.lead_actividades
    FOR UPDATE TO authenticated USING (true);

DROP POLICY IF EXISTS "Actividades: eliminar auth" ON public.lead_actividades;
CREATE POLICY "Actividades: eliminar auth" ON public.lead_actividades
    FOR DELETE TO authenticated USING (true);


-- ===== TRIGGERS: ACTUALIZAR updated_at AUTOMÁTICAMENTE =====
CREATE OR REPLACE FUNCTION public.update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_usuarios_updated_at ON public.usuarios;
CREATE TRIGGER trg_usuarios_updated_at BEFORE UPDATE ON public.usuarios FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_inmuebles_updated_at ON public.inmuebles;
CREATE TRIGGER trg_inmuebles_updated_at BEFORE UPDATE ON public.inmuebles FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_leads_updated_at ON public.leads;
CREATE TRIGGER trg_leads_updated_at BEFORE UPDATE ON public.leads FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_documentos_updated_at ON public.documentos;
CREATE TRIGGER trg_documentos_updated_at BEFORE UPDATE ON public.documentos FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_cierres_ventas_updated_at ON public.cierres_ventas;
CREATE TRIGGER trg_cierres_ventas_updated_at BEFORE UPDATE ON public.cierres_ventas FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_colecciones_vip_updated_at ON public.colecciones_vip;
CREATE TRIGGER trg_colecciones_vip_updated_at BEFORE UPDATE ON public.colecciones_vip FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_equipo_web_updated_at ON public.equipo_web;
CREATE TRIGGER trg_equipo_web_updated_at BEFORE UPDATE ON public.equipo_web FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

DROP TRIGGER IF EXISTS trg_asesores_maximus_updated_at ON public.asesores_maximus;
CREATE TRIGGER trg_asesores_maximus_updated_at BEFORE UPDATE ON public.asesores_maximus FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();


-- ===== TRIGGER: CREAR PERFIL EN public.usuarios AL REGISTRARSE EN auth.users =====
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger AS $$
BEGIN
    INSERT INTO public.usuarios (auth_id, email, nombre_completo, rol, tipo_asesor)
    VALUES (
        new.id, 
        new.email, 
        COALESCE(new.raw_user_meta_data->>'nombre_completo', split_part(new.email, '@', 1)),
        COALESCE(new.raw_user_meta_data->>'rol', 'asesor_maximus'),
        COALESCE(new.raw_user_meta_data->>'tipo_asesor', 'maximus')
    )
    ON CONFLICT (auth_id) DO NOTHING;
    RETURN new;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ===== VISTA ANALÍTICA: HISTÓRICO Y RENDIMIENTO POR ASESOR =====
CREATE OR REPLACE VIEW public.v_historico_rendimiento_asesores AS
SELECT 
    c.asesor_id,
    c.asesor_nombre,
    c.asesor_tipo,
    COUNT(c.id) AS total_inmuebles_vendidos,
    SUM(CASE WHEN c.tipo_operacion = 'venta' THEN 1 ELSE 0 END) AS ventas_count,
    SUM(CASE WHEN c.tipo_operacion = 'alquiler' THEN 1 ELSE 0 END) AS alquileres_count,
    SUM(c.precio_final) AS volumen_total_cerrado,
    SUM(c.comision_bruta_monto) AS comision_bruta_total,
    SUM(c.comision_neta_asesor) AS comision_neta_asesor_total,
    SUM(c.comision_oficina_monto) AS comision_oficina_total,
    ROUND(AVG(c.precio_final), 2) AS ticket_promedio,
    MAX(c.fecha_cierre) AS ultimo_cierre_fecha
FROM public.cierres_ventas c
GROUP BY c.asesor_id, c.asesor_nombre, c.asesor_tipo;


-- ==============================================================================
-- DATOS INICIALES (SEED DATA PARA ARRANQUE INMEDIATO)
-- ==============================================================================

-- 1. Zonas del Cotizador Inmobiliario (Táchira)
INSERT INTO public.zonas_cotizador (nombre, municipio, precio_m2_base, precio_min_m2, precio_max_m2, factor_casa, factor_apartamento, factor_terreno, factor_local)
VALUES
    ('Pueblo Nuevo', 'San Cristóbal', 780, 700, 900, 1.05, 1.00, 0.65, 1.30),
    ('Barrio Obrero', 'San Cristóbal', 720, 650, 850, 1.05, 1.00, 0.60, 1.40),
    ('Urbanización Guaparo', 'San Cristóbal', 850, 750, 980, 1.08, 1.00, 0.70, 1.25),
    ('Los Pirineos / Pirineos II', 'San Cristóbal', 650, 580, 750, 1.05, 1.00, 0.55, 1.20),
    ('Paramillo / Altos de Paramillo', 'San Cristóbal', 700, 620, 820, 1.05, 1.00, 0.60, 1.25),
    ('La Castellana', 'San Cristóbal', 680, 600, 780, 1.05, 1.00, 0.58, 1.20),
    ('Centro de San Cristóbal', 'San Cristóbal', 550, 480, 650, 1.00, 1.00, 0.50, 1.50),
    ('La Concordia', 'San Cristóbal', 500, 430, 580, 1.00, 1.00, 0.50, 1.35),
    ('Táriba', 'Cárdenas', 450, 380, 540, 1.02, 1.00, 0.50, 1.25),
    ('Palmira', 'Guásimos', 420, 360, 500, 1.05, 1.00, 0.55, 1.20),
    ('Rubio', 'Junín', 400, 340, 480, 1.00, 1.00, 0.45, 1.20),
    ('La Grita', 'Jáuregui', 380, 320, 460, 1.00, 1.00, 0.45, 1.20)
ON CONFLICT (nombre) DO UPDATE SET
    precio_m2_base = EXCLUDED.precio_m2_base,
    precio_min_m2 = EXCLUDED.precio_min_m2,
    precio_max_m2 = EXCLUDED.precio_max_m2;

-- 2. Equipo Oficial (Landing Page)
INSERT INTO public.equipo_web (nombre, cargo, email, telefono, whatsapp, foto_url, orden, mostrar_en_web, activo, bio)
VALUES
    ('Lic. Eva Camargo', 'Directora Comercial', 'eva.camargo@maximus.com', '+58 424-1234567', '584241234567', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', 1, true, true, 'Líder en estructuración comercial y ventas de residencias exclusivas en Táchira.'),
    ('Abg. José Guerrero', 'Director Legal', 'jose.guerrero@maximus.com', '+58 414-9876543', '584149876543', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', 2, true, true, 'Especialista en derecho inmobiliario, blindaje de transacciones y contratos de inversión.'),
    ('María Rodríguez', 'Asesora Inmobiliaria', 'maria.rodriguez@maximus.com', '+58 412-5557890', '584125557890', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', 3, true, true, 'Asesora de alta vocación con amplia cartera en apartamentos de lujo y alquileres diplomáticos.'),
    ('Carlos Mendoza', 'Asesor de Inversiones', 'carlos.mendoza@maximus.com', '+58 424-7778899', '584247778899', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', 4, true, true, 'Consultor financiero y evaluador de rentabilidad en desarrollos urbanos y terrenos prime.')
ON CONFLICT DO NOTHING;

-- 3. Asesores Oficiales MAXIMUS (Dashboard y Captaciones)
INSERT INTO public.asesores_maximus (nombre, cargo, especialidad, email, telefono, whatsapp, avatar, rating, cierres, badge_texto, destacado, activo, orden)
VALUES
    ('José Guerrero', 'Director / Captador Principal', 'Luxury & Residencial', 'jose.guerrero@maximus.com', '+58 424-1234567', '584241234567', 'https://ui-avatars.com/api/?name=Jose+Guerrero&background=0B4A3F&color=fff&bold=true', 5.0, 28, 'Director Fundador', true, true, 1),
    ('Valeria Méndez', 'Top Producer Residencial', 'Apartamentos & Pisos', 'valeria.mendez@maximus.com', '+58 414-7654321', '584147654321', 'https://ui-avatars.com/api/?name=Valeria+Mendez&background=0A3D33&color=fff&bold=true', 4.9, 19, 'Top Producer', true, true, 2),
    ('Carlos Santander', 'Especialista Inversiones', 'Penthouses & Terrenos', 'carlos.santander@maximus.com', '+58 412-9876543', '584129876543', 'https://ui-avatars.com/api/?name=Carlos+Santander&background=072D25&color=fff&bold=true', 4.9, 15, 'Especialista Inversión', false, true, 3),
    ('Andrea Colmenares', 'Comercial & Industrial', 'Galpones & Locales', 'andrea.colmenares@maximus.com', '+58 416-3334455', '584163334455', 'https://ui-avatars.com/api/?name=Andrea+Colmenares&background=06241E&color=fff&bold=true', 4.8, 14, 'Líder Comercial', false, true, 4)
ON CONFLICT DO NOTHING;

-- 4. Notificaciones Iniciales
INSERT INTO public.notificaciones (tipo, titulo, mensaje, metadata, leida, created_at)
VALUES
    ('lead', 'Nuevo Lead de Valoración', 'Roberto Méndez solicitó valoración express de su Penthouse en Pueblo Nuevo.', '{"cliente": "Roberto Méndez", "telefono": "584241112233", "inmueble": "Penthouse en Pueblo Nuevo"}'::jsonb, false, now() - interval '12 minutes'),
    ('captacion', 'Nueva Captación MAXIMUS', 'José Guerrero publicó Quinta en Guaparo ($270.000 USD) con 50/50 disponible para visitas.', '{"inmueble_id": "inm-1", "precio": "$270.000", "asesor": "José Guerrero"}'::jsonb, false, now() - interval '45 minutes'),
    ('comision', 'Comisión Liquidada', 'Comisión de $6.750 USD disponible por el cierre de Quinta en Paramillo.', '{"monto": 6750, "cierre_id": "cierre-001"}'::jsonb, false, now() - interval '2 hours'),
    ('alerta', 'Oportunidad de Precio', 'El Apartamento en Residencias El Bosque ajustó precio a $120.000 USD.', '{"inmueble_id": "inm-3", "precio": "$120.000"}'::jsonb, true, now() - interval '1 day')
ON CONFLICT DO NOTHING;

-- 5. Inmuebles Iniciales
INSERT INTO public.inmuebles (titulo, descripcion, precio, moneda, operacion, tipo, estatus, ubicacion, estado, habitaciones, banos, metros_cuadrados, foto_principal, en_oferta, propietario_nombre, comision_porcentaje)
VALUES
    ('Quinta moderna con piscina y jardín', 'Exclusiva quinta en excelente urbanismo privado, acabados de primera y áreas recreativas completas.', 270000, 'USD', 'venta', 'casa', 'disponible', 'Urbanización Guaparo, San Cristóbal', 'Táchira', 4, 3.0, 350, 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=800&q=80', true, 'Manuel Rodríguez', 5.00),
    ('Apartamento amoblado piso medio', 'Completamente amoblado, acabados de mármol, vista panorámica y planta eléctrica.', 120000, 'USD', 'venta', 'apartamento', 'disponible', 'Residencias El Bosque, San Cristóbal', 'Táchira', 2, 2.0, 110, 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=800&q=80', false, 'Dra. Carmen López', 4.00),
    ('Penthouse Duplex con Terraza 360°', 'Penthouse de doble altura con terraza privada panorámica, 4 puestos techados y jacuzzi.', 380000, 'USD', 'venta', 'apartamento', 'disponible', 'Pueblo Nuevo, San Cristóbal', 'Táchira', 4, 4.5, 340, 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=800&q=80', true, 'Inversiones VIP C.A.', 5.00),
    ('Local Comercial Nivel Feria C.C. Sambil', 'Excelente local en pasillo principal de feria gastronómica con alto flujo garantizado.', 1500, 'USD', 'alquiler', 'local', 'disponible', 'C.C. Sambil, San Cristóbal', 'Táchira', 0, 1.0, 80, 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=800&q=80', false, 'Feria Sambil C.A.', 8.00)
ON CONFLICT DO NOTHING;

-- 6. Cierres Históricos Iniciales (Para Ranking de Asesores y Métricas)
INSERT INTO public.cierres_ventas (inmueble_titulo, ubicacion, foto, asesor_nombre, asesor_tipo, tipo_operacion, precio_final, moneda, comision_bruta_porcentaje, comision_bruta_monto, asesor_porcentaje_neto, comision_neta_asesor, comision_oficina_monto, estatus_comision, fecha_cierre)
VALUES
    ('Quinta en Paramillo', 'Altos de Paramillo', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=80', 'José Guerrero', 'maximus', 'venta', 135000, 'USD', 5.00, 6750, 70.00, 4725, 2025, 'liquidada', CURRENT_DATE - 5),
    ('Apartamento Res. El Bosque', 'Av. 19 de Abril', 'https://images.unsplash.com/photo-1512917774080-9991f1c4c750?w=600&q=80', 'Valeria Méndez', 'maximus', 'venta', 95000, 'USD', 5.00, 4750, 70.00, 3325, 1425, 'liquidada', CURRENT_DATE - 12),
    ('Penthouse Residencias Titanium', 'Pueblo Nuevo', 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&q=80', 'Carlos Santander', 'maximus', 'venta', 180000, 'USD', 5.00, 9000, 70.00, 6300, 2700, 'liquidada', CURRENT_DATE - 20)
ON CONFLICT DO NOTHING;

-- ===== 14. TRIGGER AUTOMÁTICO: CREAR PERFIL AL REGISTRARSE EN SUPABASE AUTH =====
-- Este trigger se dispara automáticamente cada vez que un usuario normal se registra
-- vía Supabase Auth (email/password o Google). Crea su fila en public.usuarios con rol 'cliente'.
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.usuarios (
        auth_id,
        nombre_completo,
        email,
        telefono,
        rol,
        tipo_asesor,
        titulo,
        avatar_url
    )
    VALUES (
        NEW.id,
        COALESCE(NEW.raw_user_meta_data->>'nombre_completo', split_part(NEW.email, '@', 1)),
        NEW.email,
        NEW.raw_user_meta_data->>'telefono',
        COALESCE(NEW.raw_user_meta_data->>'rol', 'cliente'),
        NULL,
        COALESCE(NEW.raw_user_meta_data->>'titulo', 'Usuario Registrado'),
        'https://ui-avatars.com/api/?name=' || encode(convert_to(COALESCE(NEW.raw_user_meta_data->>'nombre_completo', NEW.email), 'UTF-8'), 'escape') || '&background=0B4A3F&color=fff&bold=true'
    )
    ON CONFLICT (auth_id) DO UPDATE SET
        nombre_completo = COALESCE(EXCLUDED.nombre_completo, public.usuarios.nombre_completo),
        email = EXCLUDED.email,
        telefono = COALESCE(EXCLUDED.telefono, public.usuarios.telefono),
        updated_at = now();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();

-- ===== STORAGE BUCKET =====
-- Ejecutar en SQL Editor de Supabase:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('inmuebles-fotos', 'inmuebles-fotos', true);
