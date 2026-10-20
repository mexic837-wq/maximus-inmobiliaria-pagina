-- ==============================================================================
-- MIGRACIÓN SUPABASE: Almacenamiento de Fotos de Perfil (Avatares) y Perfiles
-- ==============================================================================

-- 1. Asegurar que los buckets de almacenamiento existan y sean públicos
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES 
    ('inmuebles-fotos', 'inmuebles-fotos', true, 52428800, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/avif']),
    ('avatars', 'avatars', true, 10485760, ARRAY['image/jpeg', 'image/png', 'image/webp', 'image/gif'])
ON CONFLICT (id) DO UPDATE SET 
    public = true,
    allowed_mime_types = EXCLUDED.allowed_mime_types;

-- 2. Habilitar políticas de Storage para subida y lectura pública de fotos
DROP POLICY IF EXISTS "Acceso publico lectura fotos y avatares" ON storage.objects;
CREATE POLICY "Acceso publico lectura fotos y avatares" 
ON storage.objects FOR SELECT 
USING (bucket_id IN ('inmuebles-fotos', 'avatars'));

DROP POLICY IF EXISTS "Permitir subida de fotos y avatares" ON storage.objects;
CREATE POLICY "Permitir subida de fotos y avatares" 
ON storage.objects FOR INSERT 
TO public
WITH CHECK (bucket_id IN ('inmuebles-fotos', 'avatars'));

DROP POLICY IF EXISTS "Permitir actualizacion de fotos y avatares" ON storage.objects;
CREATE POLICY "Permitir actualizacion de fotos y avatares" 
ON storage.objects FOR UPDATE 
TO public
USING (bucket_id IN ('inmuebles-fotos', 'avatars'));

DROP POLICY IF EXISTS "Permitir eliminacion de fotos y avatares" ON storage.objects;
CREATE POLICY "Permitir eliminacion de fotos y avatares" 
ON storage.objects FOR DELETE 
TO public
USING (bucket_id IN ('inmuebles-fotos', 'avatars'));

-- 3. Asegurar que la tabla usuarios tenga todas las columnas de perfil necesarias
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS avatar_url TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS licencia_inmobiliaria TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS titulo TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS two_factor_enabled BOOLEAN DEFAULT false;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS two_factor_method TEXT DEFAULT 'whatsapp';
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS two_factor_phone TEXT;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS notif_whatsapp_leads BOOLEAN DEFAULT true;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS notif_whatsapp_citas BOOLEAN DEFAULT true;
ALTER TABLE public.usuarios ADD COLUMN IF NOT EXISTS notif_whatsapp_cierres BOOLEAN DEFAULT true;

-- 4. Asegurar que la tabla asesores_maximus tenga las columnas para fotos
ALTER TABLE public.asesores_maximus ADD COLUMN IF NOT EXISTS avatar TEXT;
ALTER TABLE public.asesores_maximus ADD COLUMN IF NOT EXISTS foto_url TEXT;
ALTER TABLE public.asesores_maximus ADD COLUMN IF NOT EXISTS bio TEXT;
ALTER TABLE public.asesores_maximus ADD COLUMN IF NOT EXISTS telefono TEXT;
ALTER TABLE public.asesores_maximus ADD COLUMN IF NOT EXISTS whatsapp TEXT;
