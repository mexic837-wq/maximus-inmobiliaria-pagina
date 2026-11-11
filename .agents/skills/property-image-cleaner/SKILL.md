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
  4) (Opcional, flag) Genera la PORTADA COLLAGE MAXIMUS (diseño único "Editorial MAXIMUS" con
  variante ALQUILER acento esmeralda y VENTA acento plata, 1600x1000, logo + paleta MAXIMUS)
  y la asigna como foto_principal.
---

> [!IMPORTANT]
> **Separación de collages en Node (vigente desde 10/11/2026): `scripts/collage_split.js`.** Python no está instalado,
> así que `clean_images.py`/`clean_images.js` no se ejecutan. `insertar_inmuebles.js` llama a `separarCollage` en cada foto:
> - Detecta franjas divisorias y costuras sin margen (mitades/tercios) y completa cuadrículas donde una fila tiene la costura menos marcada.
> - Externas: recorta los rótulos de texto pegados a las costuras (filas con muchos tramos cortos de blanco = letras).
> - **No parte flyers diseñados** (plantillas RE/MAX, etc.): si en promedio las piezas son gráficas/planas (> 50 %), se deja entero.
> - Galería: piezas `foto_NN_MM.jpg` primero y el flyer completo al final (`foto_NN_collage.jpg`, nunca se usa en la portada).
> - Portada: se eligen las piezas sin rótulos y la más grande va como foto principal.
> - Prueba: `node .agents/skills/property-image-cleaner/scripts/collage_split.js foto.jpg --out carpeta`. Desactivar: `--sin-collage` en el insertador.
> - Limitación conocida: flyers con un rótulo gris sobre cada foto pueden salir con costuras sin separar o con texto.
> - El Smart Crop de marcas de agua del `.py` (bordes con logos de otras inmobiliarias) aún no está portado.

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

## 3. Portada Collage MAXIMUS (Plantillas Alquiler / Venta) — `EN PRODUCCIÓN`

> [!IMPORTANT]
> **Estado (09/11/2026): aplicada a todos los inmuebles del sistema.** Motor vigente en Node: `scripts/collage_maximus.js`
> (port fiel del `.py`, usa `@napi-rs/canvas` ≥ 1.0 para los pesos reales de Montserrat).
> - Nuevos inmuebles: `whatsapp-browser-agent/scripts/insertar_inmuebles.js` genera la portada automáticamente.
> - Todos / uno: `node .agents/skills/property-image-cleaner/scripts/aplicar_portadas_todos.js --muestra 6 | --todos-local | --aplicar [--codigo "#MAX-123"]`
>   (guarda respaldo en `portadas_maximus_out/respaldo_*.json`; nunca usa fotos de stock).
> - Las tarjetas de `index.html` y `catalog.html` detectan `portada_maximus` y la muestran completa en 16:10 sin badges duplicados.
>
> Lo de abajo describe el flag del pipeline Python (`habilitado` en el JSON), que ya no es el camino principal.

Cuando se activa, después de limpiar y puntuar las fotos (sección 2) la skill:
1. **Selecciona hasta 3 fotos** (`seleccionar_fotos_collage`): toma las de mayor score, **excluye flyers de terceros** (`_collage.jpg`, traen texto/logos ajenos), descarta **fotos casi idénticas** (hash perceptual, típico de reenvíos de WhatsApp) y recortes < 300 px.
2. **Aplica el diseño único "Editorial MAXIMUS"** (misma línea gráfica para ambas operaciones): panel lateral verde MAXIMUS con logo, pastilla de operación, título, ubicación, rejilla 2x2 de características y precio; a la derecha foto héroe + 2 miniaturas. Solo cambian los acentos según `operacion`:
   - `alquiler` → pastilla **esmeralda** `EN ALQUILER`, etiqueta **CANON MENSUAL**, sufijo `USD / mes`.
   - `venta` (y cualquier otra) → pastilla **plata** `EN VENTA`, etiqueta **PRECIO DE VENTA**, sufijo `USD`.
   - Los acentos se cambian en `plantillas.<operacion>` del JSON sin tocar código.
   - Ambas se adaptan a 1, 2 o 3 fotos; omiten características en cero (p. ej. terrenos solo muestran m²); el título se reduce/recorta a 2–3 líneas y el precio se ajusta al ancho.
3. Guarda `portada_maximus.jpg` (1600x1000, 16:10 = proporción de la tarjeta del catálogo), la sube a `whatsapp/<flujo>/<lote>/<temp_id>/portada_maximus.jpg`, la pone como `foto_principal` y `fotos[0]`, y deja la traza en `inm["portada_collage"]` (`plantilla`, `version`, `fotos_origen`).
4. Si algo falla al generar el collage, se registra un `[WARN]` y el inmueble conserva la portada normal (nunca rompe el lote).

**Activación (prioridad):** `--collage-portada` / `--sin-collage-portada` (CLI) › variable de entorno `MAXIMUS_COLLAGE_PORTADA=1|0` › `"habilitado"` en el JSON.

**Archivos:**
- `scripts/collage_maximus.py` — motor de plantillas (Pillow). También CLI para generar una portada suelta.
- `scripts/preview_plantillas.py` — genera las muestras para el equipo en `plantillas_collage_preview/`.
- `references/plantillas_collage.json` — flag, paleta, textos de etiquetas, tamaño del lienzo, nº de fotos.
- `assets/logo_maximus_icono_collage.png` — logo cromado rasterizado desde `assets/logo_maximus_chrome_icono.svg`.
- `assets/fonts/Montserrat-Variable.ttf` — tipografía de la marca (licencia OFL, `OFL.txt`).

> Nota: el precio queda "impreso" en la imagen. Si cambia el precio o la operación de un inmueble, hay que regenerar su portada.

---

## 4. Cómo Ejecutar el Script

```bash
# Con Python (Pillow + OpenCV + NumPy)
python .agents/skills/property-image-cleaner/scripts/clean_images.py --lote "agente_whatsapp/proyectos/captaciones_externas/lote_2026_10_21"

# O con Node.js
node .agents/skills/property-image-cleaner/scripts/clean_images.js --lote "agente_whatsapp/proyectos/captaciones_maximus/lote_2026_10_21"

# Probar la portada collage en un lote (sin activarla globalmente, y sin subir a Storage)
python .agents/skills/property-image-cleaner/scripts/clean_images.py --lote "<lote>" --collage-portada --skip-upload

# Regenerar las muestras de las plantillas para el equipo
python .agents/skills/property-image-cleaner/scripts/preview_plantillas.py

# Generar una portada suelta con fotos propias
python .agents/skills/property-image-cleaner/scripts/collage_maximus.py --operacion alquiler \
  --fotos f1.jpg f2.jpg f3.jpg --titulo "Local Comercial en Barrio Obrero" \
  --ubicacion "Barrio Obrero, San Cristóbal" --precio 2000 --tipo local --habitaciones 3 \
  --banos 6 --m2 160 --puestos 2 --codigo "#MAX-251" --out portada.jpg
```
