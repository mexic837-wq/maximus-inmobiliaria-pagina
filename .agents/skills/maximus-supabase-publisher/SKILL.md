---
name: maximus-supabase-publisher
description: >-
  Valida el payload completo de inmuebles contra el esquema de sql/migration-inmuebles-sync-dashboard.sql,
  dashboard-layout.html (#view-admin-cargar-inmueble) y js/services.js, respetando el flujo de origen:
  1) En captaciones_externas/ inserta como Asesor Externo (is_maximus = false, en_oferta = false, agente_id = null).
  2) En captaciones_maximus/ inserta como Captación Directa MAXIMUS (is_maximus = true, en_oferta = true,
  vinculado al Asesor Oficial MAXIMUS en public.asesores_maximus / public.equipo_web).
  Genera el informe detallado en reporte_ejecucion.md.
---

# Skill 4: Publicador de Inmuebles en Supabase y Generador de Reporte (`maximus-supabase-publisher`)

Esta skill ejecuta la inserción final en `public.inmuebles` en **Supabase** respetando automáticamente si el lote proviene de `captaciones_externas/` o `captaciones_maximus/`, y genera `reporte_ejecucion.md`.

---

## 1. Reglas de Inserción Diferenciadas por Carpeta

### A) Lotes en `agente_whatsapp/proyectos/captaciones_externas/`
- `is_maximus = false` y `en_oferta = false`.
- `asesor_nombre`: Nombre del Asesor Externo extraído del chat.
- `asesor_telefono`: Número de WhatsApp / Teléfono normalizado (`+58 4XX XXXXXXX`).
- `agente_id = null`.

### B) Lotes en `agente_whatsapp/proyectos/captaciones_maximus/`
- `is_maximus = true` y `en_oferta = true` (Aparece con insignia **Captación Directa MAXIMUS** en la sección exclusiva).
- `asesor_nombre` y `asesor_telefono`: Datos oficiales del Asesor MAXIMUS consultados de `public.asesores_maximus` / `public.equipo_web` (`sql/migration-asesores-maximus-rls.sql` y `sql/migration-equipo-web-rls.sql`).
- `agente_id`: UUID relacional del asesor cuando aplique.

---

## 2. Cómo Ejecutar el Script

```bash
# Con Python
python .agents/skills/maximus-supabase-publisher/scripts/publish_to_supabase.py --lote "agente_whatsapp/proyectos/captaciones_externas/lote_2026_10_21"

# O con Node.js
node .agents/skills/maximus-supabase-publisher/scripts/publish_to_supabase.js --lote "agente_whatsapp/proyectos/captaciones_maximus/lote_2026_10_21"
```
