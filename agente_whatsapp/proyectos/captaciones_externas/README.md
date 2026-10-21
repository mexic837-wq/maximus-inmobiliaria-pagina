# 📥 Bandeja A: Captaciones Externas (`agente_whatsapp/proyectos/captaciones_externas/`)

Esta carpeta está destinada exclusivamente a los **lotes exportados de los ~15 grupos de WhatsApp de colegas e inmobiliarias aliadas del Estado Táchira**.

---

## ⚙️ Reglas Automáticas que Aplica el Agente en `captaciones_externas/`

1. **En Supabase (`public.inmuebles`):**
   - `is_maximus = false` y `en_oferta = false` (**Captación Directa MAXIMUS desmarcada**).
2. **En `Asesor Responsable`:**
   - Selecciona automáticamente **Asesor Externo** (`tipo_asesor = "externo"`, `agente_id = null`).
   - Extrae del chat o captura el **Nombre del Asesor Externo** (`asesor_nombre`) y su **Número de WhatsApp / Teléfono** normalizado a `+58 4XX XXXXXXX` (`asesor_telefono`).
3. **En `property-image-cleaner`:**
   - **Activa SIEMPRE** la detección y separación de collages (`_01.jpg`, `_02.jpg`, `_03.jpg`).
   - **Activa SIEMPRE el recorte inteligente de bordes (`Smart Crop`)** para eliminar marcas de agua, cintillos de precios o logos de otras inmobiliarias (RE/MAX, Cúspide, Century21, independientes).

---

## 📂 Los 3 Modos Soportados para Colocar Archivos Aquí

Crea una subcarpeta con la fecha del lote (ej. `captaciones_externas/lote_2026_10_21/`) y coloca tus archivos en cualquiera de estos **3 formatos** (incluso combinados dentro del mismo lote):

### Modo 1: Exportación Nativa de WhatsApp (`.zip` o `_chat.txt` + fotos)
- Puedes pegar directamente los archivos `.zip` descargados de WhatsApp (*"Exportar chat -> Incluir archivos multimedia"*). El agente los descomprime automáticamente.
- O pegar las carpetas descomprimidas con el `.txt` y las fotos (`IMG-YYYYMMDD-WAXXXX.jpg`, `PHOTO-...jpg`).
- El agente empareja bloques de fotos consecutivas (`WA0010.jpg..WA0013.jpg`) con el texto descriptivo enviado justo antes o después (ventana de `±3 minutos` del mismo remitente) sin mezclar remitentes distintos.

### Modo 2: Capturas de Pantalla de WhatsApp Web (`screenshot`)
- Si no exportaste el `.txt` y tomaste capturas de pantalla completas de WhatsApp Web (donde se ve la burbuja del mensaje con el teléfono arriba, la foto en el centro y la descripción abajo):
  1. Coloca los archivos de captura (`screenshot_01.png`, `captura_wa_02.jpg`, etc.) dentro del lote.
  2. El agente lee con Visión/OCR el teléfono del remitente y la descripción completa de la burbuja.
  3. El script recorta automáticamente **solo el recuadro interior de la fotografía del inmueble** (eliminando el fondo de WhatsApp y el texto de la burbuja) y luego lo pasa por el separador de collages y Smart Crop.

### Modo 3: Subcarpetas Manuales por Inmueble (`inmueble_01/`, `inmueble_02/`)
- Crea subcarpetas como `inmueble_01/`, `inmueble_02/` y mete dentro las fotos sueltas junto con un archivo `info.txt` (con el texto copiado de WhatsApp). Todo el contenido de esa subcarpeta se emparejará como **un único inmueble**.
