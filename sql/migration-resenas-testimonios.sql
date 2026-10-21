-- ==============================================================================
-- MAXIMUS INMOBILIARIA: MIGRACIÓN DE RESEÑAS Y TESTIMONIOS CLIENTES
-- Tabla para almacenar reseñas enviadas desde el dashboard y mostrarlas
-- en el carrusel marquee del landing page en tiempo real.
-- ==============================================================================

-- 1. Crear tabla de reseñas
CREATE TABLE IF NOT EXISTS public.resenas (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    usuario_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
    nombre VARCHAR(255) NOT NULL,
    email VARCHAR(255),
    rol_cliente VARCHAR(100) DEFAULT 'Comprador' NOT NULL, -- 'Comprador', 'Vendedor', 'Inversionista', 'Inquilino'
    calificacion INTEGER DEFAULT 5 CHECK (calificacion >= 1 AND calificacion <= 5),
    comentario TEXT NOT NULL,
    avatar_url TEXT,
    aprobado BOOLEAN DEFAULT true, -- Aprobación automática o moderada
    destacado BOOLEAN DEFAULT true
);

-- Comentarios de documentación
COMMENT ON TABLE public.resenas IS 'Reseñas y testimonios de clientes de MAXIMUS Inmobiliaria para el carrusel del landing';

-- 2. Habilitar Row Level Security (RLS)
ALTER TABLE public.resenas ENABLE ROW LEVEL SECURITY;

-- 3. Políticas de Seguridad RLS
-- Lectura pública: cualquiera puede ver las reseñas aprobadas en el landing
DROP POLICY IF EXISTS "Lectura pública de reseñas aprobadas" ON public.resenas;
CREATE POLICY "Lectura pública de reseñas aprobadas" 
ON public.resenas FOR SELECT 
USING (aprobado = true);

-- Inserción: usuarios autenticados (o anónimos) pueden enviar su testimonio
DROP POLICY IF EXISTS "Permitir envío de reseñas" ON public.resenas;
CREATE POLICY "Permitir envío de reseñas" 
ON public.resenas FOR INSERT 
WITH CHECK (true);

-- Administración: permitir actualización para moderación
DROP POLICY IF EXISTS "Permitir actualizar reseñas" ON public.resenas;
CREATE POLICY "Permitir actualizar reseñas" 
ON public.resenas FOR UPDATE 
USING (true);

-- 4. Índices para máximo rendimiento
CREATE INDEX IF NOT EXISTS idx_resenas_created_at ON public.resenas (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_resenas_aprobado ON public.resenas (aprobado);

-- 5. Insertar reseñas semilla iniciales (si la tabla está vacía)
INSERT INTO public.resenas (nombre, email, rol_cliente, calificacion, comentario, avatar_url, aprobado, destacado)
SELECT * FROM (VALUES
    ('Roberto Suárez', 'roberto.suarez@gmail.com', 'Vendedor', 5, 'Excelente servicio. Me ayudaron a vender mi casa en menos de un mes y al precio que esperaba. Todo el proceso fue muy transparente y el respaldo legal impecable.', 'https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?w=150&q=80', true, true),
    ('Andrea Gómez', 'andrea.gomez@hotmail.com', 'Compradora', 5, 'Comprar mi primer apartamento con MAXIMUS fue la mejor decisión. La paciencia, asesoría y profesionalismo del equipo legal me dio absoluta seguridad.', 'https://images.unsplash.com/photo-1494790108377-be9c29b29330?w=150&q=80', true, true),
    ('Luis Castillo', 'luis.castillo@inversiones.com', 'Inversionista', 5, 'Llevo años invirtiendo en bienes raíces y el nivel de propiedades exclusivas y retorno que maneja MAXIMUS es incomparable en el estado Táchira.', 'https://images.unsplash.com/photo-1500648767791-00dcc994a43e?w=150&q=80', true, true),
    ('Dra. Carmen Mendoza', 'carmen.mendoza@clinica.com', 'Compradora', 5, 'La visita privada y el dossier VIP que nos prepararon superaron todas nuestras expectativas. Atención de primera categoría en San Cristóbal.', 'https://images.unsplash.com/photo-1573496359142-b8d87734a5a2?w=150&q=80', true, true),
    ('Ing. Fernando Colmenares', 'fernando.c@constructora.com', 'Vendedor', 5, 'Vendieron nuestro galpón industrial en tiempo récord con todas las garantías jurídicas y la comisión clara desde el día uno. 100% recomendados.', 'https://images.unsplash.com/photo-1472099645785-5658abf4ff4e?w=150&q=80', true, true)
) AS v(nombre, email, rol_cliente, calificacion, comentario, avatar_url, aprobado, destacado)
WHERE NOT EXISTS (SELECT 1 FROM public.resenas LIMIT 1);
