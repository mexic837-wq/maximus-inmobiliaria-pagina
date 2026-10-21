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
- **Separador de Collages (`ON`):** Divide mosaicos y collages en imágenes individuales numeradas (`_01.jpg`, `_02.jpg`, `_03.jpg`).
- **Smart Crop de Marcas de Agua (`ON` — OBLIGATORIO):** Recorta cintillos superiores/inferiores y bordes donde otras inmobiliarias (RE/MAX, Cúspide, Century21, etc.) colocan sus logos o precios sobrepuestos.

### B) En `agente_whatsapp/proyectos/captaciones_maximus/`
- **Extractor de Foto de Screenshot (Modo 2):** Si se subió una captura de WhatsApp Web, extrae la fotografía interior sin interfaz de WhatsApp.
- **Separador de Collages (`ON`):** Solo separa si alguna imagen viene unida en collage.
- **Smart Crop de Marcas de Agua (`OFF` — DESACTIVADO):** **NO recorta bordes de marcas de agua**, ya que son fotografías oficiales de MAXIMUS Inmobiliaria. Sube las imágenes en máxima calidad (`quality=95`) al bucket `inmuebles-fotos` de Supabase Storage.

---

## 2. Cómo Ejecutar el Script

```bash
# Con Python (Pillow + OpenCV + NumPy)
python .agents/skills/property-image-cleaner/scripts/clean_images.py --lote "agente_whatsapp/proyectos/captaciones_externas/lote_2026_10_21"

# O con Node.js
node .agents/skills/property-image-cleaner/scripts/clean_images.js --lote "agente_whatsapp/proyectos/captaciones_maximus/lote_2026_10_21"
```
