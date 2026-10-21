# Catálogo de Skills del Agente Captador de WhatsApp

Todas las skills operativas siguen el estándar modular de Antigravity en `.agents/skills/` y están enlazadas desde esta carpeta para mantener la estructura de 4 pilares (`contexto/`, `skills/`, `memoria/`, `proyectos/`):

1. **[whatsapp-property-parser](../../.agents/skills/whatsapp-property-parser/SKILL.md)**
   - **Propósito:** Agrupa mensajes consecutivos por autor/ventana temporal en los `.txt` de WhatsApp, filtra ruido/búsquedas, combina texto + OCR/Visión de imágenes y valida campos según tipo de propiedad.
   - **Script principal:** [parse_whatsapp_batch.py](../../.agents/skills/whatsapp-property-parser/scripts/parse_whatsapp_batch.py)

2. **[supabase-property-deduplicator](../../.agents/skills/supabase-property-deduplicator/SKILL.md)**
   - **Propósito:** Calcula el score de similitud intra-lote y contra `public.inmuebles` en Supabase (`Operación` + `Tipo` + `Sector` + `Precio ±5%` + `Área m² ±10%`).
   - **Script principal:** [deduplicate_properties.py](../../.agents/skills/supabase-property-deduplicator/scripts/deduplicate_properties.py)

3. **[property-image-cleaner](../../.agents/skills/property-image-cleaner/SKILL.md)**
   - **Propósito:** Detecta y separa collages (verticales, horizontales y cuadrículas) en fotos individuales (`_01.jpg`, `_02.jpg`...), recorta marcas de agua/cintillos con `Pillow` + `OpenCV` y sube las fotos limpias al bucket `inmuebles-fotos` de Supabase Storage.
   - **Script principal:** [clean_images.py](../../.agents/skills/property-image-cleaner/scripts/clean_images.py)

4. **[maximus-supabase-publisher](../../.agents/skills/maximus-supabase-publisher/SKILL.md)**
   - **Propósito:** Valida el payload completo contra `#view-admin-cargar-inmueble` (`dashboard-layout.html`) y `js/services.js`, inserta los inmuebles en Supabase y genera `reporte_ejecucion.md`.
   - **Script principal:** [publish_to_supabase.py](../../.agents/skills/maximus-supabase-publisher/scripts/publish_to_supabase.py)

5. **[agent-continuous-trainer](../../.agents/skills/agent-continuous-trainer/SKILL.md)**
   - **Propósito:** Motor de auto-entrenamiento en dos modos: *Modo Captura en Caliente* (corrige en Supabase y anota en `memoria/aprendizajes.md`) y *Modo Consolidación de Código* (actualiza las reglas y scripts de las skills 1 a 4).
   - **Script principal:** [trainer_engine.py](../../.agents/skills/agent-continuous-trainer/scripts/trainer_engine.py)
