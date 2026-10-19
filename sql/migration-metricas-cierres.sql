-- ==============================================================================
-- MAXIMUS INMOBILIARIA - MIGRACIÓN SQL: HISTÓRICO DE ASESORES & COMISIONES
-- Tabla: public.cierres_ventas (Métricas de Ventas, Alquileres y Comisión Bruta)
-- ==============================================================================

-- 1. CREACIÓN O ACTUALIZACIÓN DE LA TABLA CIERRES_VENTAS
CREATE TABLE IF NOT EXISTS public.cierres_ventas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    inmueble_id UUID,
    inmueble_titulo TEXT NOT NULL,
    ubicacion TEXT,
    foto TEXT,
    asesor_id UUID,
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

-- 2. HABILITAR ROW LEVEL SECURITY (RLS)
ALTER TABLE public.cierres_ventas ENABLE ROW LEVEL SECURITY;

-- 3. POLÍTICAS DE ACCESO
DROP POLICY IF EXISTS "Cierres: lectura pública autenticada" ON public.cierres_ventas;
CREATE POLICY "Cierres: lectura pública autenticada" ON public.cierres_ventas
    FOR SELECT TO public USING (true);

DROP POLICY IF EXISTS "Cierres: inserción autenticada" ON public.cierres_ventas;
CREATE POLICY "Cierres: inserción autenticada" ON public.cierres_ventas
    FOR INSERT TO public WITH CHECK (true);

DROP POLICY IF EXISTS "Cierres: actualización autenticada" ON public.cierres_ventas;
CREATE POLICY "Cierres: actualización autenticada" ON public.cierres_ventas
    FOR UPDATE TO public USING (true);

DROP POLICY IF EXISTS "Cierres: eliminación autenticada" ON public.cierres_ventas;
CREATE POLICY "Cierres: eliminación autenticada" ON public.cierres_ventas
    FOR DELETE TO public USING (true);

-- 4. ÍNDICES PARA ALTO RENDIMIENTO
CREATE INDEX IF NOT EXISTS idx_cierres_tipo_operacion ON public.cierres_ventas(tipo_operacion);
CREATE INDEX IF NOT EXISTS idx_cierres_fecha_cierre ON public.cierres_ventas(fecha_cierre DESC);
CREATE INDEX IF NOT EXISTS idx_cierres_asesor_id ON public.cierres_ventas(asesor_id);
CREATE INDEX IF NOT EXISTS idx_cierres_estatus ON public.cierres_ventas(estatus_comision);

-- 5. DATOS DE ARRANQUE / DEMOSTRACIÓN (VENTAS Y ALQUILERES REALISTAS)
INSERT INTO public.cierres_ventas (
    inmueble_titulo, ubicacion, foto, asesor_nombre, asesor_tipo, tipo_operacion, 
    precio_final, moneda, comision_bruta_porcentaje, comision_bruta_monto, 
    asesor_porcentaje_neto, comision_neta_asesor, comision_oficina_monto, 
    estatus_comision, fecha_cierre, cliente_comprador, cliente_vendedor
)
VALUES
    ('Quinta en Paramillo', 'San Cristóbal, Táchira', 'https://images.unsplash.com/photo-1600607687920-4e2a09cf159d?w=600&q=80', 'José Guerrero', 'maximus', 'venta', 410000, 'USD', 5.00, 20500, 75.00, 15375, 5125, 'liquidada', CURRENT_DATE - 4, 'Familia Morales Duarte', 'Ing. Carlos Mendoza'),
    ('Casa Quinta Contemporánea', 'Altos de Paramillo, San Cristóbal', 'https://images.unsplash.com/photo-1600585154340-be6161a56a0c?w=600&q=80', 'José Guerrero', 'maximus', 'venta', 210000, 'USD', 5.00, 10500, 75.00, 7875, 2625, 'liquidada', CURRENT_DATE - 7, 'Dr. Alejandro Peña', 'Arq. Roberto Fuentes'),
    ('Quinta en Urbanización Guaparo', 'Guaparo, San Cristóbal', 'https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=600&q=80', 'Valeria Méndez', 'maximus', 'venta', 265000, 'USD', 5.00, 13250, 70.00, 9275, 3975, 'liquidada', CURRENT_DATE - 11, 'Lic. Sofía Rincón', 'Dra. Elena Vargas'),
    ('Apartamento Amoblado Las Pilas', 'Pueblo Nuevo, San Cristóbal', 'https://images.unsplash.com/photo-1545324418-cc1a3fa10c00?w=600&q=80', 'Pedro Rivas', 'externo', 'venta', 78000, 'USD', 5.00, 3900, 50.00, 1950, 1950, 'liquidada', CURRENT_DATE - 17, 'Ing. Mauricio Gómez', 'Sra. Carmen Villamizar'),
    ('Local Comercial Nivel Feria', 'C.C. Sambil San Cristóbal', 'https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=600&q=80', 'Carlos Santander', 'maximus', 'alquiler', 1800, 'USD', 100.00, 1800, 70.00, 1260, 540, 'liquidada', CURRENT_DATE - 21, 'Franquicia Café Gourmet C.A.', 'Inversiones Plaza Sambil'),
    ('Galpón Corporativo y Oficinas AAA', 'Zona Industrial Barrancas', 'https://images.unsplash.com/photo-1586528116311-ad8dd3c8310d?w=600&q=80', 'Andrea Colmenares', 'maximus', 'alquiler', 3200, 'USD', 100.00, 3200, 70.00, 2240, 960, 'liquidada', CURRENT_DATE - 26, 'Distribuidora FarmaAndina', 'Complejo Logístico Los Andes')
ON CONFLICT DO NOTHING;
