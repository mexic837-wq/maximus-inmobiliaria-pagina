# Patrones de Exportación de WhatsApp y Jerga Inmobiliaria del Táchira

## 1. Expresiones Regulares de Cabecera de WhatsApp

- **Formato Android (ES/LATAM):**
  `^(\d{1,2}/\d{1,2}/\d{2,4}),?\s+(\d{1,2}:\d{2}(?:\s*[ap]\.?\s*m\.?)?)\s*-\s*([^:]+):\s*(.*)$`
  Ejemplo: `21/10/2026, 10:15 a. m. - +58 414-7123456: En venta hermosa quinta...`

- **Formato iOS / macOS:**
  `^\[(\d{1,2}/\d{1,2}/\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap]\.?[Mm]\.?)?)\]\s*([^:]+):\s*(.*)$`
  Ejemplo: `[21/10/26, 10:15:32 a. m.] Lic. Ana Pérez: <adjunto: 00000142-PHOTO-2026-10-21.jpg>`

## 2. Detección de Archivos Adjuntos en el `.txt`
- `((?:IMG|PHOTO|PTT|VID|DOC)-[^\s()<>]+\.(?:jpg|jpeg|png|webp))`
- `<adjunto:\s*([^>]+?\.(?:jpg|jpeg|png|webp))>`
- `([^\s()<>]+\.(?:jpg|jpeg|png|webp))\s*\((?:archivo adjunto|file attached)\)`

## 3. Patrones de Descarte (Requerimientos de Búsqueda vs Oferta Real)
Un mensaje se clasifica como **Búsqueda de Cliente (Descartar)** cuando contiene frases como:
- `busco apartamento`, `busco casa`, `busco local`, `busco galpón`, `busco terreno`
- `cliente busca`, `para cliente directo`, `solicito en alquiler`, `requiero inmueble`
- `quien tiene disponible`, `colegas quién tiene`, `necesito con urgencia para cliente`

*(Excepción: Si dice "¿Buscas casa en Barrio Obrero? Te ofrezco esta propiedad...", sí es una oferta real porque va seguida de especificaciones de venta/alquiler).*
