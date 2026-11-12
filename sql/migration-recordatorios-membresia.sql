-- =====================================================================
-- MAXIMUS INMOBILIARIA - Recordatorios de renovación de la membresía Pro
-- Registra qué avisos ya se enviaron para no repetirlos.
-- Ejecutar completo en el SQL Editor de Supabase (es idempotente).
-- =====================================================================

CREATE TABLE IF NOT EXISTS public.recordatorios_membresia (
    id         UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    auth_id    UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    tipo       TEXT NOT NULL CHECK (tipo IN ('aviso_5d', 'vence_hoy')),
    vence_at   TIMESTAMPTZ NOT NULL,                       -- vencimiento al que corresponde el aviso
    enviado_at TIMESTAMPTZ NOT NULL DEFAULT now(),
    -- Si el asesor renueva, su vencimiento cambia y vuelve a recibir avisos en la nueva fecha
    UNIQUE (auth_id, tipo, vence_at)
);

CREATE INDEX IF NOT EXISTS idx_recordatorios_auth ON public.recordatorios_membresia (auth_id, vence_at DESC);

-- Solo la usa la Edge Function (service_role). Nadie más la lee ni la escribe.
ALTER TABLE public.recordatorios_membresia ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.recordatorios_membresia FROM anon, authenticated;
