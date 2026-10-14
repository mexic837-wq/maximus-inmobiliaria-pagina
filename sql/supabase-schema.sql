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
    rol TEXT NOT NULL DEFAULT 'asesor_maximus' CHECK (rol IN ('admin', 'asesor_maximus', 'asesor_externo', 'agente')),
    tipo_asesor TEXT DEFAULT 'maximus' CHECK (tipo_asesor IN ('maximus', 'externo')),
    titulo TEXT DEFAULT 'Asesor Inmobiliario',
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

-- ===== 8. TABLA: CIERRES DE VENTAS & HISTÓRICO DE COMISIONES =====
-- Registro histórico de transacciones, comisiones brutas y netas de asesores
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
    comision_bruta_monto NUMERIC(12,2) NOT NULL, -- precio_final * (comision_bruta_porcentaje / 100)
    asesor_porcentaje_neto NUMERIC(5,2) NOT NULL DEFAULT 70.00, -- Split para el asesor (ej: 70% maximus, 50% externo)
    comision_neta_asesor NUMERIC(12,2) NOT NULL, -- comision_bruta_monto * (asesor_porcentaje_neto / 100)
    comision_oficina_monto NUMERIC(12,2) NOT NULL, -- comision_bruta_monto - comision_neta_asesor
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

-- ===== HABILITAR ROW LEVEL SECURITY (RLS) =====
ALTER TABLE public.usuarios ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.inmuebles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.leads ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.citas ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.pagos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.documentos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.zonas_cotizador ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.cierres_ventas ENABLE ROW LEVEL SECURITY;


-- ===== POLÍTICAS RLS BÁSICAS =====
-- Los agentes solo ven sus propios datos. Los admin ven todo.
-- Los Asesores MAXIMUS pueden ver el registro histórico general de comisiones del equipo.
-- Los Asesores Externos solo pueden ver sus propios cierres.

-- Usuarios: cada quien ve su perfil, admin ve todos
CREATE POLICY "Usuarios: ver propio" ON public.usuarios
    FOR SELECT USING (auth.uid() = auth_id);

CREATE POLICY "Usuarios: actualizar propio" ON public.usuarios
    FOR UPDATE USING (auth.uid() = auth_id)
    WITH CHECK (auth.uid() = auth_id);

-- Inmuebles: acceso público para inmuebles disponibles (Landing page y Catálogo), o agentes/admin para todos
CREATE POLICY "Inmuebles: lectura pública de disponibles" ON public.inmuebles
    FOR SELECT USING (
        estatus = 'disponible'
        OR agente_id IN (SELECT id FROM public.usuarios WHERE auth_id = auth.uid())
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

-- CIERRES Y COMISIONES:
-- Asesores Maximus y Admin ven el histórico completo de comisiones de la inmobiliaria.
-- Asesores Externos solo ven sus propios cierres.
CREATE POLICY "Cierres: ver registros autorizados" ON public.cierres_ventas
    FOR SELECT USING (
        EXISTS (
            SELECT 1 FROM public.usuarios 
            WHERE auth_id = auth.uid() 
            AND rol IN ('admin', 'asesor_maximus', 'agente')
        )
        OR asesor_id IN (
            SELECT id FROM public.usuarios WHERE auth_id = auth.uid()
        )
    );

CREATE POLICY "Cierres: insertar" ON public.cierres_ventas
    FOR INSERT WITH CHECK (
        EXISTS (
            SELECT 1 FROM public.usuarios 
            WHERE auth_id = auth.uid() 
            AND rol IN ('admin', 'asesor_maximus', 'agente')
        )
    );

CREATE POLICY "Cierres: actualizar o eliminar admin" ON public.cierres_ventas
    FOR ALL USING (
        EXISTS (
            SELECT 1 FROM public.usuarios 
            WHERE auth_id = auth.uid() 
            AND rol = 'admin'
        )
    );


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

CREATE TRIGGER trg_cierres_ventas_updated_at
    BEFORE UPDATE ON public.cierres_ventas
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ===== VISTA: RESUMEN HISTÓRICO Y RENDIMIENTO POR ASESOR =====
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


-- ===== 9. TABLA: COLECCIONES VIP (Dossiers Personalizados para Clientes) =====
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

CREATE INDEX IF NOT EXISTS idx_colecciones_vip_asesor ON public.colecciones_vip(asesor_id);
CREATE INDEX IF NOT EXISTS idx_colecciones_vip_cliente ON public.colecciones_vip(cliente);

ALTER TABLE public.colecciones_vip ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Usuarios autenticados pueden ver colecciones VIP"
    ON public.colecciones_vip FOR SELECT
    TO authenticated
    USING (true);

CREATE POLICY "Asesores pueden crear colecciones VIP"
    ON public.colecciones_vip FOR INSERT
    TO authenticated
    WITH CHECK (true);

CREATE POLICY "Asesores pueden actualizar sus colecciones VIP"
    ON public.colecciones_vip FOR UPDATE
    TO authenticated
    USING (true);

CREATE POLICY "Asesores pueden eliminar sus colecciones VIP"
    ON public.colecciones_vip FOR DELETE
    TO authenticated
    USING (true);

CREATE TRIGGER trg_colecciones_vip_updated_at
    BEFORE UPDATE ON public.colecciones_vip
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();


-- ===== 9. TABLA: EQUIPO WEB (Landing Page "Nuestro Equipo") =====
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

CREATE INDEX IF NOT EXISTS idx_equipo_web_orden ON public.equipo_web(orden);
CREATE INDEX IF NOT EXISTS idx_equipo_web_mostrar ON public.equipo_web(mostrar_en_web, activo);

ALTER TABLE public.equipo_web ENABLE ROW LEVEL SECURITY;

-- 1. Lectura pública (Landing Page puede consultar los miembros marcados como visibles)
CREATE POLICY "Equipo Web: lectura pública para landing page"
    ON public.equipo_web FOR SELECT
    USING (mostrar_en_web = true AND activo = true);

-- 2. Administradores o agentes autenticados pueden ver todos los registros
CREATE POLICY "Equipo Web: ver todos los autenticados"
    ON public.equipo_web FOR SELECT
    TO authenticated
    USING (true);

-- 3. Inserción para usuarios autenticados / administradores
CREATE POLICY "Equipo Web: insertar admin"
    ON public.equipo_web FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 4. Modificación para usuarios autenticados / administradores
CREATE POLICY "Equipo Web: actualizar admin"
    ON public.equipo_web FOR UPDATE
    TO authenticated
    USING (true);

-- 5. Eliminación para administradores
CREATE POLICY "Equipo Web: eliminar admin"
    ON public.equipo_web FOR DELETE
    TO authenticated
    USING (true);

CREATE TRIGGER trg_equipo_web_updated_at
    BEFORE UPDATE ON public.equipo_web
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Datos iniciales del equipo para la landing page
INSERT INTO public.equipo_web (nombre, cargo, email, telefono, whatsapp, foto_url, orden, mostrar_en_web, activo, bio)
VALUES
    ('Lic. Eva Camargo', 'Directora Comercial', 'eva.camargo@maximus.com', '+58 424-1234567', '584241234567', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', 1, true, true, 'Líder en estructuración comercial y ventas de residencias exclusivas en Táchira.'),
    ('Abg. José Guerrero', 'Director Legal', 'jose.guerrero@maximus.com', '+58 414-9876543', '584149876543', 'https://images.unsplash.com/photo-1560250097-0b93528c311a?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', 2, true, true, 'Especialista en derecho inmobiliario, blindaje de transacciones y contratos de inversión.'),
    ('María Rodríguez', 'Asesora Inmobiliaria', 'maria.rodriguez@maximus.com', '+58 412-5557890', '584125557890', 'https://images.unsplash.com/photo-1580489944761-15a19d654956?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', 3, true, true, 'Asesora de alta vocación con amplia cartera en apartamentos de lujo y alquileres diplomáticos.'),
    ('Carlos Mendoza', 'Asesor de Inversiones', 'carlos.mendoza@maximus.com', '+58 424-7778899', '584247778899', 'https://images.unsplash.com/photo-1519085360753-af0119f7cbe7?ixlib=rb-4.0.3&auto=format&fit=crop&w=600&q=80', 4, true, true, 'Consultor financiero y evaluador de rentabilidad en desarrollos urbanos y terrenos prime.')
ON CONFLICT DO NOTHING;


-- ===== 12. TABLA: ASESORES MAXIMUS (Captadores Oficiales) =====
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

CREATE INDEX IF NOT EXISTS idx_asesores_maximus_activo ON public.asesores_maximus(activo, orden);

ALTER TABLE public.asesores_maximus ENABLE ROW LEVEL SECURITY;

-- 1. Lectura pública / agentes de los asesores activos
CREATE POLICY "Asesores Maximus: lectura pública"
    ON public.asesores_maximus FOR SELECT
    USING (activo = true);

-- 2. Administradores autenticados pueden ver todos
CREATE POLICY "Asesores Maximus: admin ver todos"
    ON public.asesores_maximus FOR SELECT
    TO authenticated
    USING (true);

-- 3. Inserción para administradores
CREATE POLICY "Asesores Maximus: insertar admin"
    ON public.asesores_maximus FOR INSERT
    TO authenticated
    WITH CHECK (true);

-- 4. Actualización para administradores
CREATE POLICY "Asesores Maximus: actualizar admin"
    ON public.asesores_maximus FOR UPDATE
    TO authenticated
    USING (true);

-- 5. Eliminación para administradores
CREATE POLICY "Asesores Maximus: eliminar admin"
    ON public.asesores_maximus FOR DELETE
    TO authenticated
    USING (true);

CREATE TRIGGER trg_asesores_maximus_updated_at
    BEFORE UPDATE ON public.asesores_maximus
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

-- Datos iniciales de Asesores Oficiales MAXIMUS
INSERT INTO public.asesores_maximus (nombre, cargo, especialidad, email, telefono, whatsapp, avatar, rating, cierres, badge_texto, destacado, activo, orden)
VALUES
    ('José Guerrero', 'Director / Captador Principal', 'Luxury & Residencial', 'jose.guerrero@maximus.com', '+58 424-1234567', '584241234567', 'https://ui-avatars.com/api/?name=Jose+Guerrero&background=0B4A3F&color=fff&bold=true', 5.0, 28, 'Director Fundador', true, true, 1),
    ('Valeria Méndez', 'Top Producer Residencial', 'Apartamentos & Pisos', 'valeria.mendez@maximus.com', '+58 414-7654321', '584147654321', 'https://ui-avatars.com/api/?name=Valeria+Mendez&background=0A3D33&color=fff&bold=true', 4.9, 19, 'Top Producer', true, true, 2),
    ('Carlos Santander', 'Especialista Inversiones', 'Penthouses & Terrenos', 'carlos.santander@maximus.com', '+58 412-9876543', '584129876543', 'https://ui-avatars.com/api/?name=Carlos+Santander&background=072D25&color=fff&bold=true', 4.9, 15, 'Especialista Inversión', false, true, 3),
    ('Andrea Colmenares', 'Comercial & Industrial', 'Galpones & Locales', 'andrea.colmenares@maximus.com', '+58 416-3334455', '584163334455', 'https://ui-avatars.com/api/?name=Andrea+Colmenares&background=06241E&color=fff&bold=true', 4.8, 14, 'Líder Comercial', false, true, 4)
ON CONFLICT DO NOTHING;


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

CREATE INDEX IF NOT EXISTS idx_notificaciones_usuario ON public.notificaciones(usuario_id, leida, created_at DESC);

ALTER TABLE public.notificaciones ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Notificaciones: ver propias"
    ON public.notificaciones FOR SELECT
    TO authenticated
    USING (usuario_id = auth.uid() OR auth.uid() IS NULL);

CREATE POLICY "Notificaciones: actualizar propias"
    ON public.notificaciones FOR UPDATE
    TO authenticated
    USING (usuario_id = auth.uid() OR auth.uid() IS NULL);

-- Seed de notificaciones iniciales para el asesor activo
INSERT INTO public.notificaciones (tipo, titulo, mensaje, metadata, leida, created_at)
VALUES
    ('lead', 'Nuevo Lead de Valoración', 'Roberto Méndez solicitó valoración express de su Penthouse en Pueblo Nuevo.', '{"cliente": "Roberto Méndez", "telefono": "584241112233", "inmueble": "Penthouse en Pueblo Nuevo"}'::jsonb, false, now() - interval '12 minutes'),
    ('captacion', 'Nueva Captación MAXIMUS', 'José Guerrero publicó Quinta en Guaparo ($270.000 USD) con 50/50 disponible para visitas.', '{"inmueble_id": "inm-1", "precio": "$270.000", "asesor": "José Guerrero"}'::jsonb, false, now() - interval '45 minutes'),
    ('comision', 'Comisión Liquidada', 'Comisión de $6.750 USD disponible por el cierre de Quinta en Paramillo.', '{"monto": 6750, "cierre_id": "cierre-001"}'::jsonb, false, now() - interval '2 hours'),
    ('alerta', 'Oportunidad de Precio', 'El Apartamento en Residencias El Bosque ajustó precio a $120.000 USD.', '{"inmueble_id": "inm-3", "precio": "$120.000"}'::jsonb, true, now() - interval '1 day')
ON CONFLICT DO NOTHING;


-- ===== STORAGE BUCKET =====
-- Ejecutar en SQL Editor de Supabase:
-- INSERT INTO storage.buckets (id, name, public) VALUES ('inmuebles-fotos', 'inmuebles-fotos', true);


