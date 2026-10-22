---
name: whatsapp-property-parser
description: >-
  Extractor multi-formato de inmuebles de WhatsApp para MAXIMUS Inmobiliaria. Detecta automáticamente si el lote
  pertenece a captaciones_externas/ (is_maximus = false, Asesor Externo) o captaciones_maximus/ (is_maximus = true,
  Asesor Oficial MAXIMUS vinculado con public.asesores_maximus y public.equipo_web). Soporta los 3 modos de entrada:
  1) Exportación nativa .zip o _chat.txt + fotos (descomprime .zip y empareja álbumes de fotos + texto del mismo
  remitente en ±3 minutos sin mezclar otros autores), 2) Capturas de pantalla completas de WhatsApp Web (screenshot),
  y 3) Subcarpetas manuales (inmueble_01/ con info.txt + fotos).
---

# Skill 1: Extractor Multi-Formato de Inmuebles de WhatsApp (`whatsapp-property-parser`)

Esta skill ejecuta la primera etapa del pipeline del **Agente Captador de Inmuebles de WhatsApp para MAXIMUS Inmobiliaria**, adaptando sus reglas según la bandeja de entrada (`captaciones_externas/` vs `captaciones_maximus/`) y soportando los **3 modos de ingesta de archivos**.

---

## 1. Detección Automática de Bandeja (`captaciones_externas` vs `captaciones_maximus`)

El script inspecciona la ruta del lote (o recibe `--modo-captacion externas|maximus`):
- **Si la ruta contiene `captaciones_externas`:**
  - `is_maximus = false`, `en_oferta = false`, `tipo_asesor = "externo"`, `agente_id = null`.
  - **Prohibición de `"Gestión MAXIMUS"`:** Nunca incluye `"Gestión MAXIMUS"` ni `"Gestión Comercial MAXIMUS"` en `aspectos_destacados`, subtítulo o descripción; usa `"Disponibilidad Inmediata"` (`"Inmueble captado en red de aliados inmobiliarios del Táchira"`).
  - Extrae del remitente o firma del chat el `asesor_nombre` y `asesor_telefono` (`+58 4XX XXXXXXX`).
- **Si la ruta contiene `captaciones_maximus`:**
  - `is_maximus = true`, `en_oferta = true`, `tipo_asesor = "maximus"`.
  - Incluye el aspecto destacado exclusivo `"Gestión MAXIMUS"` (`"Captación directa verificada por el equipo de MAXIMUS Inmobiliaria"`).
  - Consulta en vivo `public.asesores_maximus` y `public.equipo_web` en Supabase y vincula el inmueble al asesor oficial de MAXIMUS mencionado en el texto/chat (o asigna por defecto al captador principal **José Guerrero** si no se especifica).

---

## 2. Plantilla Oficial de Ubicaciones (`UBICACIONES_TACHIRA` — 39 Sectores)

El parser utiliza **única y exclusivamente** las 39 ubicaciones del desplegable `#inm-sector-select` (`UBICACIONES_TACHIRA` de `dashboard-layout.html`):
- Asigna exactamente:
  - `sector_nombre = loc.label` (ej. `"Pueblo Nuevo"`, `"Barrio Obrero"`, `"San Carlos"`, `"La Castellana"`, `"Madre Juana"`).
  - `ubicacion = "${loc.label}, ${loc.municipio}, Táchira"`.
  - `sector_desc = "Sector residencial ${loc.label}, Municipio ${loc.municipio}, Estado Táchira."`.
- **Cero Invención de Ubicaciones:** Nunca inventa `"San Cristóbal"` a secas ni nombres fuera de la plantilla. Si un mensaje no menciona ninguno de los 39 sectores oficiales, se envía a `pendientes_revision.md`.

---

## 3. Los 3 Modos de Emparejamiento Texto + Imágenes

### Modo 1: Exportación Nativa de WhatsApp (`.zip` o `_chat.txt` + fotos)
1. **Descompresión Automática de `.zip`:** Si encuentra archivos `.zip` dentro de la carpeta del lote, los descomprime automáticamente en subcarpetas antes de iniciar el parseo.
2. **Agrupación por Remitente en Ventana de `±3 minutos` + Regla Anti-Mezcla:**
   - Mantiene buffers separados por remitente (`author`) dentro de cada grupo.
   - Si un remitente envía un álbum de varias fotos sin texto (`WA0010.jpg`, `WA0011.jpg`, `WA0012.jpg`) y en la última foto o en el mensaje inmediatamente siguiente sin foto envía la descripción del inmueble, une las fotos + el texto como **UN SOLO INMUEBLE**.
   - **Corte Anti-Mezcla:** Si el mismo remitente envía dos mensajes consecutivos donde **ambos tienen texto descriptivo**, o envía un flyer suelto con foto seguido de un mensaje con **su propia foto + texto**, el parser corta el bloque inmediatamente para jamás mezclar fotografías de inmuebles distintos.
   - **Filtro de Requerimientos y Sin Fotos:** Descarta búsquedas de clientes (`"Requiero..."`, `"Se requiere..."`, `"Tengo el siguiente requerimiento..."`) y envía a `pendientes_revision.md` publicaciones sin fotografías adjuntas (ej. solo video `.mp4`).

### Modo 2: Captura de Pantalla Completa de WhatsApp Web (`screenshot`)
- Si en la carpeta o subcarpeta no hay archivo `.txt` sino imágenes de captura de pantalla (`screenshot`, `captura`, `whatsapp web` o imágenes con proporción/interfaz de burbuja de chat):
  1. Extrae mediante OCR/Visión el teléfono del remitente en la parte superior de la burbuja y el texto descriptivo en la parte inferior.
  2. Marca el registro con `"modo_entrada": "modo_2_screenshot_whatsapp"` e `"imagenes_son_screenshots": true` para que `property-image-cleaner` recorte primero únicamente el recuadro interior de la fotografía del inmueble (eliminando el fondo de WhatsApp y el texto de la burbuja) y luego pase la foto limpia por el detector de collages.

### Modo 3: Subcarpetas Manuales o Archivos Sueltos (`inmueble_01/`, `inmueble_02/`)
- Si detecta subcarpetas tipo `inmueble_01/`, `inmueble_02/` (o un archivo `info.txt` / `.txt` cuyo contenido es texto libre sin timestamps de chat de WhatsApp acompañado de fotos sueltas), empareja todas las imágenes y el texto de esa subcarpeta como **un único inmueble** (`"modo_entrada": "modo_3_subcarpeta_manual"`).

---

## 3. Cómo Ejecutar el Script

```bash
# Con Python
python .agents/skills/whatsapp-property-parser/scripts/parse_whatsapp_batch.py --lote "agente_whatsapp/proyectos/captaciones_externas/lote_2026_10_21"

# O con Node.js
node .agents/skills/whatsapp-property-parser/scripts/parse_whatsapp_batch.js --lote "agente_whatsapp/proyectos/captaciones_externas/lote_2026_10_21"
```
