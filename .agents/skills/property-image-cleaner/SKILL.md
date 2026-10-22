---
name: property-image-cleaner
description: >-
  Limpia y procesa las imágenes de WhatsApp con Python (Pillow + OpenCV + NumPy) y Node.js:
  1) En Modo 2 (Captura de pantalla de WhatsApp Web), recorta primero únicamente el recuadro de la fotografía
  del inmueble eliminando el fondo de WhatsApp y el texto de la burbuja.
  2) Detecta y separa collages verticales, horizontales o cuadrículas en fotos individuales (_01.jpg, _02.jpg).
  3) Comportamiento diferenciado por carpeta: en captaciones_externas/ aplica SIEMPRE Smart Crop para recortar
  marcas de agua y logos de otras inmobiliarias; en captaciones_maximus/ NO recorta bordes de marcas de agua
  (Smart Crop = OFF), subiendo las fotos originales en máxima calidad a Supabase Storage.
---

# Skill 3: Limpiador de Imágenes, Extractor de Capturas, Separador de Collages y Upload (`property-image-cleaner`)

Esta skill adapta automáticamente el procesamiento visual según la bandeja de entrada (`captaciones_externas/` vs `captaciones_maximus/`) y el modo de captura de WhatsApp.

---

## 1. Reglas Diferenciadas por Carpeta

### A) En `agente_whatsapp/proyectos/captaciones_externas/`
- **Extractor de Foto de Screenshot (Modo 2):** Si la imagen proviene de una captura de pantalla de WhatsApp Web, recorta primero el recuadro interior de la fotografía eliminando el fondo de WhatsApp y el texto de la burbuja.
- **Separador de Collages con Margen y Sin Margen (`ON` — Sube Cortadas + Collage Completo):**
  - Detecta y divide tanto collages con líneas divisorias sólidas (blancas/negras/color) como **collages sin margen (`borderless` `3x2`, `3x1`, `2x2`, `2x1`, `1x2`)** analizando costuras rectas de alto salto de gradiente y baja varianza de segunda derivada (`_find_true_collage_seams`), generando fotos individuales (`_01.jpg`, `_02.jpg`, `_03.jpg`, ...).
  - **Conservación del Collage Completo:** Además de subir cada fotografía cortada individual (`_01.jpg`, `_02.jpg`, ...), guarda y sube también el **collage completo original (`_collage.jpg`)** al bucket de Supabase Storage y lo agrega al arreglo `fotos` del inmueble para no perder ninguna referencia visual o texto del flyer.
  - En cada sub-imagen extraída de un collage sin margen, recorta automáticamente cintillos de texto o teléfonos pegados sobre la costura interior (`_trim_inner_seam_text_banners`).
- **Smart Crop de Marcas de Agua (`ON` — OBLIGATORIO):** Recorta cintillos superiores/inferiores y bordes donde otras inmobiliarias (RE/MAX, Cúspide, Century21, etc.) colocan sus logos o precios sobrepuestos, y sube todas las fotografías individuales al bucket `inmuebles-fotos` de Supabase Storage leyendo `.env`.

### B) En `agente_whatsapp/proyectos/captaciones_maximus/`
- **Extractor de Foto de Screenshot (Modo 2):** Si se subió una captura de WhatsApp Web, extrae la fotografía interior sin interfaz de WhatsApp.
- **Separador de Collages (`ON`):** Solo separa si alguna imagen viene unida en collage.
- **Smart Crop de Marcas de Agua (`OFF` — DESACTIVADO):** **NO recorta bordes de marcas de agua**, ya que son fotografías oficiales de MAXIMUS Inmobiliaria. Sube las imágenes en máxima calidad (`quality=95`) al bucket `inmuebles-fotos` de Supabase Storage.

---

## 2. Selector Inteligente de Foto de Portada (`foto_principal` y `fotos[0]`)

Para evitar que una tarjeta en el portal o dashboard muestre una foto que desfavorezca al inmueble (ej. zanjas, tiras verticales angostas o cercas con números cortados), la skill evalúa algorítmicamente cada imagen mediante `evaluar_calidad_portada`:

1. **Preferencia al Collage/Flyer Completo (`_collage.jpg`):**
   - Si la propiedad cuenta con un collage o flyer publicitario diseñado por el corredor, recibe **fuerte bonificación (+65 pts)**. Esto garantiza que la tarjeta de portada muestre la panorámica completa del inmueble, fachadas y áreas sociales integradas.
2. **Proporción de Aspecto (Tarjetas Horizontales 16:9 / 4:3):**
   - **Apaisado ideal (1.25 a 1.85):** +35 pts.
   - **Castigo drástico a tiras verticales (ratio < 0.85):** -75 pts. Evita que recortes de 2x1 o 3x1 sufran zoom y deformación visual en la web.
3. **Resolución y Nitidez:**
   - Mayor resolución y tamaño (w >= 700 y h >= 500): +25 pts.
4. **Luminancia y Riqueza Cromática:**
   - Luminancia balanceada (+15 pts) y variedad cromática (+15 pts) para premiar fachadas y salas luminosas frente a paredes vacías o tomas oscuras.
5. **Reordenamiento Automático:**
   - La imagen ganadora se asigna a `inm["foto_principal"]` y se posiciona en el índice 0 del arreglo `inm["fotos"]`, dejando las demás fotos en la galería.

---

## 3. Cómo Ejecutar el Script

```bash
# Con Python (Pillow + OpenCV + NumPy)
python .agents/skills/property-image-cleaner/scripts/clean_images.py --lote "agente_whatsapp/proyectos/captaciones_externas/lote_2026_10_21"

# O con Node.js
node .agents/skills/property-image-cleaner/scripts/clean_images.js --lote "agente_whatsapp/proyectos/captaciones_maximus/lote_2026_10_21"
```
