# Parámetros Técnicos de Limpieza de Imágenes y Collages

## 1. Heurísticas de Separación de Collages
- **Dimensión mínima de sub-imagen (`MIN_SUBIMAGE_PX`):** `220px` tanto en ancho como en alto. Evita que un cintillo publicitario sea confundido con una fotografía arquitectónica.
- **Varianza máxima de línea divisoria (`MAX_GUTTER_STD`):** `18.0` en escala de grises (`0-255`).
- **Relación de aspecto de collage vertical:** Si `height / width >= 1.65`, el algoritmo prioriza la búsqueda de cortes horizontales (2, 3 o 4 fotografías apiladas verticalmente).

## 2. Perfiles de Recorte de Marcas de Agua por Inmobiliaria (`perfiles_recorte.json`)
El script lee dinámicamente los parámetros de recorte entrenados por `agent-continuous-trainer`:
- `default`: Detecta cintillos automáticamente + recorte de seguridad de bordes.
- `remax`: Recorte inferior mínimo de `10%` (`0.10`).
- `century21`: Recorte inferior mínimo de `11%` (`0.11`).
- `cuspide`: Recorte superior `6%` e inferior `8%`.
