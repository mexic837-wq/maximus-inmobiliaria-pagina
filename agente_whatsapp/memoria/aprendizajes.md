# Memoria de Aprendizajes: Agente Captador MAXIMUS Inmobiliaria

> **Archivo Vivo de Entrenamiento Continuo (`agente_whatsapp/memoria/aprendizajes.md`)**
> Este documento contiene las reglas entrenadas, la jerga inmobiliaria regional del Estado Táchira, las validaciones de campos, los parámetros de recorte de marcas de agua por inmobiliaria y el historial de deduplicación.
> **REGLA DE ORO 2:** El agente DEBE leer este archivo antes de procesar cualquier lote en `proyectos/`.
> **REGLA DE ORO 3:** Cada corrección del usuario en el chat se registra inmediatamente aquí y se consolida en las skills mediante `agent-continuous-trainer`.

---

## SECCIÓN 1: Diccionario Inmobiliario Táchira / Jerga WhatsApp

### 1.1. Términos de Operación y Negociación
| Expresión en WhatsApp | Significado Normalizado MAXIMUS | Acción / Campo Destino |
| :--- | :--- | :--- |
| `"Canon"`, `"Canon mensual"`, `"Arriendo"` | Operación de **Alquiler** | `operacion = "alquiler"`, `moneda = "USD/mes"` |
| `"Inversión"`, `"Precio de oportunidad"`, `"Se vende"` | Operación de **Venta** | `operacion = "venta"`, `moneda = "USD"` |
| `"3M depósito"`, `"2M adelanto"`, `"1M adm"` | Condiciones de arrendamiento (meses de depósito, adelanto y comisión administrativa) | Incluir detalladamente en el párrafo final de `descripcion` |
| `"Perfil jurídico"` | Solo se alquila a empresas o personas con registro mercantil | Destacar en `descripcion` |
| `"A pie de calle"` / `"Frente a la vía"` | Acceso directo desde la acera/avenida sin entrar a centro comercial | En `estacionamientos` (UI) = `"A pie de calle"` / En `descripcion` resaltar visibilidad comercial |
| `"PB"` | Planta Baja | Mencionar en `subtitulo` o `descripcion` |
| `"PH"` | Penthouse | `tipo = "apartamento"` (`Departamento`), incluir `"Penthouse"` en `titulo` |
| `"TH"` / `"Town House"` | Townhouse | `tipo = "casa"` (`Casa`), incluir `"Townhouse"` en `titulo` |
| `"Obra gris"` / `"Obra blanca"` | Propiedad para remodelar o terminar acabados | Especificar en `descripcion` |
| `"Listo para firmar"` / `"Libre de hipoteca"` | Documentación solvente en Registro | Aspecto destacado con icono `ph-check` |

### 1.2. Zonas, Urbanizaciones y Abreviaturas del Estado Táchira
| Abreviatura / Nombre en Chat | Sector Normalizado (`sector_nombre`) | Ubicación General (`ubicacion`) | Municipio |
| :--- | :--- | :--- | :--- |
| `"B.O."`, `"Barrio Obrero"`, `"Pasaje Acueducto"`, `"Plaza Los Mangos"` | `Barrio Obrero` | `Barrio Obrero, San Cristóbal` | San Cristóbal |
| `"Pueblo Nuevo"`, `"Av. España"`, `"Plaza de Toros"`, `"Polígono de Tiro"` | `Pueblo Nuevo` | `Pueblo Nuevo, San Cristóbal` | San Cristóbal |
| `"Urb. Guaparo"`, `"Guaparo"` | `Urbanización Guaparo` | `Urbanización Guaparo, San Cristóbal` | San Cristóbal |
| `"Pirineos"`, `"Pirineos I"`, `"Pirineos II"`, `"Don Bosco"` | `Los Pirineos` | `Los Pirineos, San Cristóbal` | San Cristóbal |
| `"Quinimarí"`, `"Urb. Quinimarí"` | `Quinimarí` | `Quinimarí, San Cristóbal` | San Cristóbal |
| `"Las Lomas"`, `"Av. Libertador"` | `Las Lomas` | `Las Lomas, San Cristóbal` | San Cristóbal |
| `"Paramillo"`, `"Altos de Paramillo"`, `"Colinas de Paramillo"` | `Paramillo` | `Paramillo, San Cristóbal` | San Cristóbal |
| `"Z.I. Paramillo"`, `"Zona Industrial Paramillo"` | `Zona Industrial Paramillo` | `Zona Industrial Paramillo, San Cristóbal` | San Cristóbal |
| `"Z.I. Barrancas"`, `"Barrancas"` | `Zona Industrial Barrancas` | `Zona Industrial Barrancas, San Cristóbal` | San Cristóbal |
| `"Av. 19 de Abril"`, `"19 de Abril"` | `Av. 19 de Abril` | `Av. 19 de Abril, San Cristóbal` | San Cristóbal |
| `"La Castellana"`, `"Urb. La Castellana"` | `La Castellana` | `La Castellana, San Cristóbal` | San Cristóbal |
| `"El Bosque"`, `"Res. El Bosque"` | `Residencias El Bosque` | `Residencias El Bosque, San Cristóbal` | San Cristóbal |
| `"La Concordia"`, `"Av. Marginal del Torbes"` | `La Concordia` | `La Concordia, San Cristóbal` | San Cristóbal |
| `"La Ermita"`, `"Centro"`, `"5ta Avenida"`, `"7ma Avenida"` | `Centro de San Cristóbal` | `Centro, San Cristóbal` | San Cristóbal |
| `"Santa Teresa"`, `"Urb. Santa Teresa"`, `"Hosp. Central"` | `Santa Teresa` | `Santa Teresa, San Cristóbal` | San Cristóbal |
| `"Palo Gordo"`, `"Vía Palo Gordo"`, `"Las Vegas de Táriba"` | `Palo Gordo` | `Palo Gordo, Cárdenas` | Cárdenas |
| `"Táriba"`, `"Colinas de Táriba"`, `"Tucapé"`, `"El Diamante"` | `Táriba` | `Táriba, Cárdenas` | Cárdenas |
| `"Palmira"`, `"La Flautera"`, `"El Abejal"`, `"Patiecitos"` | `Palmira` | `Palmira, Guásimos` | Guásimos |
| `"Cordero"`, `"Lomas Blancas"` | `Cordero` | `Cordero, Andrés Bello` | Andrés Bello |
| `"Rubio"`, `"Las Dantas"` | `Rubio` | `Rubio, Junín` | Junín |
| `"San Antonio"`, `"Ureña"` | `San Antonio del Táchira` | `San Antonio, Bolívar` | Bolívar |
| `"La Fría"` | `La Fría` | `La Fría, García de Hevia` | García de Hevia |
| `"La Grita"` | `La Grita` | `La Grita, Jáuregui` | Jáuregui |

---

## SECCIÓN 2: Reglas de Validación de Campos

1. **Regla Cero Invención (Datos Críticos):**
   - Si después de analizar el texto del mensaje Y aplicar OCR/Visión a las imágenes adjuntas falta el **Precio**, el **Tipo de Operación** (`venta`/`alquiler`) o el **Tipo de Inmueble**, **PROHIBIDO INVENTARLOS**. El registro se envía directamente a `pendientes_revision.md`.
2. **Validación Estricta de Habitaciones (`habitaciones`):**
   - Tipo de dato en SQL: `INT`.
   - En `Local Comercial` (`local`), `Galpones` (`galpon`) y `Terreno` / `Fincas` sin casa principal: si el texto no menciona explícitamente número de ambientes privados, cubículos u oficinas cerradas, asignar **`0`**. Nunca asumir `1` o `3` por defecto en inmuebles comerciales/terrenos.
3. **Validación de Baños (`banos`):**
   - Tipo de dato en SQL: `NUMERIC(3,1)`.
   - Si el anuncio dice *"2 baños y medio"* o *"2 + 1/2 baño"*, guardar `2.5`.
   - Si es un Terreno sin construcción, guardar `0`.
4. **Validación de Puestos de Estacionamiento (`estacionamientos`):**
   - En el formulario UI se permite texto descriptivo (`"A pie de calle"`, `"1 Puesto"`, `"Libre en CC"`).
   - En la columna SQL `estacionamientos` (`INT`) se guarda el entero (`0` si dice `"No posee"` o `"A pie de calle"` sin puesto propio; `1`, `2`, etc. según indique). El texto descriptivo (`"A pie de calle"`, `"Estacionamiento libre en Centro Comercial"`) se preserva en el objeto de detalle, en `notas_privadas` y en el aspecto destacado `ph-car`.
5. **Validación de Área (`metros_cuadrados`) y Precio por m² (`precioM2`):**
   - Si el inmueble tiene metraje de terreno y metraje de construcción (ej. *"Terreno 300 m², Construcción 220 m²"*):
     - En Casas/Apartamentos/Locales/Galpones, `metros_cuadrados` toma el área útil/construcción (`220`), y en la `descripcion` se detallan ambos metrajes.
     - En Terrenos/Fincas, `metros_cuadrados` toma el área total de terreno.
   - `precioM2` se calcula automáticamente como `round(precio / metros_cuadrados)` cuando `metros_cuadrados > 0`.
6. **Validación de Asesor Externo:**
   - Siempre `is_maximus = false` y `en_oferta = false`.
   - Teléfono normalizado al estándar `+58 4XX XXXXXXX` (ej. `0414-7123456` → `+58 414 7123456`).

---

## SECCIÓN 3: Parámetros de Recorte de Imágenes y Collages por Inmobiliaria

Parámetros utilizados por `property-image-cleaner` (`scripts/clean_images.py`):

### 3.1. Detección y Separación de Collages
- **Líneas divisorias sólidas (blancas, negras o de color corporativo):**
  - Muchas fotos de WhatsApp unen 2, 3 o 4 fotografías en un solo archivo JPEG separadas por franjas rectas horizontales o verticales de entre `3px` y `35px` de grosor con varianza cromática baja (`std_dev < 18`).
- **Transiciones bruscas de borde (Grid sin margen):**
  - Collages 2x2 o 1x3 pegados sin borde blanco se detectan mediante el gradiente de Sobel horizontal/vertical a lo largo del 100% del ancho o alto en las zonas de tercios (`33%`, `50%`, `66%`).
- **Filtro de proporción mínima:**
  - Ningún sub-recorte de collage se guarda si su ancho o alto resultante es menor a `220px` o si su relación de aspecto es extrema (`> 3.5:1`), evitando recortar por error cintillos publicitarios como si fueran fotos independientes.

### 3.2. Recorte Inteligente de Marcas de Agua y Cintillos (Smart Crop)
| Franquicia / Estilo en Táchira | Ubicación Típica de Marca de Agua / Cintillo | Regla de Recorte (`Smart Crop`) |
| :--- | :--- | :--- |
| **Cintillos Inferiores / Superiores Sólidos** | Franja horizontal en el borde inferior (`6%` a `16%` de la altura) o superior (`5%` a `12%`) con fondo plano o degradado corporativo y texto de contacto/precio. | Recortar automáticamente la franja superior/inferior cuando presente color uniforme o alta densidad de bordes de texto aislados en los extremos verticales. |
| **RE/MAX (Momentum / Nobel / etc.)** | Globo o barra azul/roja/blanca en esquina inferior o cintillo inferior completo (`8%–12%`). | Recorte inferior del `10%` cuando se detecta banda azul/roja/blanca en el borde inferior. |
| **Cúspide Inmobiliaria** | Logo o cintillo en esquina superior/inferior con tipografía corporativa. | Recorte de margen afectado (`6%–10%`) preservando el centro arquitectónico. |
| **Century 21 (C21)** | Cintillo dorado/negro/gris en borde inferior (`8%–14%`). | Recorte inferior del `10%–12%` si se detecta franja oscura/dorada en la base. |
| **Asesores Independientes (Flyers con Precio Gigante)** | A veces la primera imagen es un "Flyer" donde el 40% de la foto está tapado por texto de características y precio. | **Primero** extraer con OCR/Visión todos los datos (Precio, m², Hab, Baños) de la imagen original; **segundo**, recortar los cintillos de borde o descartar el flyer si no tiene foto arquitectónica limpia y ya hay más fotos del inmueble en el álbum. |

---

## SECCIÓN 4: Historial de Casos de Deduplicación

Esta sección registra casos reales aprendidos durante la ejecución de lotes para afinar el motor `supabase-property-deduplicator`:

- **[Regla Base Inicial - 2026-10-21]:**
  - **Match Exacto / Duplicado Confirmado (`score >= 0.85`):** Misma `operacion` + mismo `tipo` + mismo `sector_nombre` normalizado + `precio` dentro de `±5%` + `metros_cuadrados` dentro de `±10%`. Acción: **Omitir inserción** y registrar en `reporte_ejecucion.md` bajo *Duplicados Descartados*.
  - **Match Dudoso (`0.65 <= score < 0.85`):** Mismo sector, tipo y metraje muy cercano (`±5%`), pero el precio varía más del `5%` (ej. un asesor lo publica en `$65.000` y otro en `$60.000`), o mismo teléfono de asesor y precio en el mismo sector pero sin metraje. Acción: **No insertar automáticamente**; enviar a `pendientes_revision.md` para decisión del usuario.
  - **Deduplicación Intra-Lote:** Cuando el mismo inmueble aparece repetido en 3 o más grupos dentro del mismo lote diario, conservar la versión que tenga **mayor cantidad de fotografías de alta resolución y descripción más completa**, fusionando cualquier dato faltante verificado.
