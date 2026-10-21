---
name: maximus-supabase-publisher
description: >-
  Inserta y sincroniza automáticamente el catálogo completo de inmuebles analizados directamente en Supabase
  leyendo credenciales desde .env (SUPABASE_URL y SUPABASE_SERVICE_ROLE_KEY / SUPABASE_ANON_KEY).
  Aplica upsert automático (on_conflict=codigo, resolution=merge-duplicates) para evitar colisiones,
  valida el payload estricto contra el esquema SQL oficial y genera reportes en tiempo real.
---

# Skill 4: Publicador Automático en Supabase (`maximus-supabase-publisher`)

Esta skill es el paso final del pipeline del Agente Captador de WhatsApp. Toma los inmuebles deduplicados con sus imágenes procesadas y los inserta **de forma 100% automática y en vivo** en la tabla `public.inmuebles` de Supabase sin intervención humana ni pasos manuales de SQL.

---

## 1. Características de Automatización

1. **Conexión Directa desde `.env`:**
   El motor lee automáticamente `SUPABASE_URL` y `SUPABASE_SERVICE_ROLE_KEY` (o `SUPABASE_ANON_KEY`) del archivo `.env` de la raíz del proyecto, con fallback automático a `js/config.js`.

2. **Inserción Vía API REST con Cláusula Upsert (`on_conflict=codigo`):**
   Envía cada propiedad al endpoint `/rest/v1/inmuebles?on_conflict=codigo` con la cabecera:
   ```http
   Prefer: resolution=merge-duplicates,return=representation
   ```
   Si el lote se ejecuta más de una vez o si una propiedad con el mismo código `#MAX-XXX` ya existe, actualiza los datos y fotografías en lugar de fallar o generar duplicados.

3. **Flujo Dual por Carpeta:**
   - **`captaciones_externas/`:**
     - `is_maximus = false`
     - `en_oferta = false`
     - `agente_id = null`
     - `asesor_nombre` y `asesor_telefono` extraídos del remitente del chat.
   - **`captaciones_maximus/`:**
     - `is_maximus = true`
     - `en_oferta = true`
     - Vinculado al Asesor Oficial MAXIMUS.

4. **Reporte de Éxito en Tiempo Real:**
   Imprime en terminal el estatus individual de cada propiedad y genera los reportes Markdown:
   - `reporte_ejecucion.md` dentro de la carpeta del lote.
   - `reporte_resultado.md` en el directorio de captaciones correspondiente.
   - `inmuebles_creados.json` con los IDs asignados por Supabase.

---

## 2. Comandos de Ejecución

### Ejecución en Python:
```bash
python .agents/skills/maximus-supabase-publisher/scripts/publish_to_supabase.py --lote "agente_whatsapp/proyectos/captaciones_externas/nombre_lote"
```

### Ejecución en Node.js:
```bash
node .agents/skills/maximus-supabase-publisher/scripts/publish_to_supabase.js --lote "agente_whatsapp/proyectos/captaciones_externas/nombre_lote"
```

### Opciones Disponibles:
- `--dry-run`: Valida el lote y genera el reporte sin insertar en la base de datos.
- `--notify-n8n`: Dispara el webhook de n8n para cada inmueble publicado.
