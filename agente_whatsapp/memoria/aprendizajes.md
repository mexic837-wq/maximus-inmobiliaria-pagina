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

### 1.2. Plantilla Oficial Estricta de Ubicaciones (`UBICACIONES_TACHIRA` en `dashboard-layout.html`)
> **REGLA ESTRICTA DE UBICACIONES (Cero Invención):** Prohibido usar `"San Cristóbal"` a secas o inventar sectores fuera del desplegable `#inm-sector-select` (`UBICACIONES_TACHIRA`). Todo inmueble DEBE mapearse exactamente a una de las 39 opciones de `UBICACIONES_TACHIRA` con el formato:
> - `sector_nombre`: `loc.label`
> - `ubicacion`: `${loc.label}, ${loc.municipio}, Táchira`
> - `sector_desc`: `Sector residencial ${loc.label}, Municipio ${loc.municipio}, Estado Táchira.`
> Si el mensaje no menciona ninguna referencia reconocible de la plantilla, se pausa en `pendientes_revision.md`.

| Clave Oficial (`UBICACIONES_TACHIRA`) | `sector_nombre` (`label`) | `ubicacion` (`${label}, ${municipio}, Táchira`) | Referencias / Abreviaturas del Chat Mapeadas |
| :--- | :--- | :--- | :--- |
| `centro` | `Centro de San Cristóbal` | `Centro de San Cristóbal, San Cristóbal, Táchira` | `"Centro"`, `"5ta Avenida"`, `"7ma Avenida"`, `"Casco Central"` |
| `barrio-obrero` | `Barrio Obrero` | `Barrio Obrero, San Cristóbal, Táchira` | `"B.O."`, `"Barrio Obrero"`, `"Pasaje Acueducto"`, `"Plaza Los Mangos"`, `"Av. Carabobo"`, `"Edif. Alcázar"`, `"Res. El Parque"` |
| `pueblo-nuevo` | `Pueblo Nuevo` | `Pueblo Nuevo, San Cristóbal, Táchira` | `"Pueblo Nuevo"`, `"Av. España"`, `"Plaza de Toros"`, `"Los Kioskos"`, `"Tierra Dorada"`, `"Edif. Terracota"`, `"Santa Teresa"`, `"Santa Cecilia"`, `"Las Acacias"` |
| `pirineos` | `Los Pirineos` | `Los Pirineos, San Cristóbal, Táchira` | `"Los Pirineos"`, `"Pirineos I"`, `"Don Bosco"`, `"Av. 19 de Abril"`, `"Doña Juanita"`, `"La Arboleda"` |
| `urb-pirineos` | `Urb. Pirineos II` | `Urb. Pirineos II, San Cristóbal, Táchira` | `"Pirineos II"`, `"Pirineos 2"` |
| `la-concordia` | `La Concordia` | `La Concordia, San Cristóbal, Táchira` | `"La Concordia"`, `"Al lado de TRT"`, `"Marginal del Torbes"`, `"Urb. Coromoto"`, `"Res. La Hacienda"` |
| `las-lomas` | `Las Lomas` | `Las Lomas, San Cristóbal, Táchira` | `"Las Lomas"`, `"Av. Libertador"`, `"Barrio Libertador"` |
| `la-romera` | `La Romera` | `La Romera, San Cristóbal, Táchira` | `"La Romera"` |
| `paramillo` | `Paramillo` | `Paramillo, San Cristóbal, Táchira` | `"Paramillo"`, `"Altos de Paramillo"`, `"Colinas de Paramillo"`, `"Z.I. Paramillo"`, `"Sambil"` |
| `urb-guaparo` | `Urb. Guaparo` | `Urb. Guaparo, San Cristóbal, Táchira` | `"Guaparo"`, `"Urb. Guaparo"` |
| `el-lobo` | `El Lobo` | `El Lobo, San Cristóbal, Táchira` | `"El Lobo"` |
| `la-ermita` | `La Ermita` | `La Ermita, San Cristóbal, Táchira` | `"La Ermita"`, `"Deporte Japonés"` |
| `la-castellana` | `La Castellana` | `La Castellana, San Cristóbal, Táchira` | `"La Castellana"`, `"Urb. Alto Pino"`, `"Terrazas de La Castellana"`, `"Av. Ferrero Tamayo"`, `"Paramillo Suite & Plaza"`, `"Colegio Montessori"` |
| `san-carlos` | `San Carlos` | `San Carlos, San Cristóbal, Táchira` | `"San Carlos"`, `"Barrio San Carlos"`, `"Edif. Hotel Moncricket"` |
| `la-popita` | `La Popita` | `La Popita, San Cristóbal, Táchira` | `"La Popita"` |
| `las-pilas` | `Las Pilas` | `Las Pilas, San Cristóbal, Táchira` | `"Las Pilas"`, `"Santa Eduvigis"` |
| `barrio-sucre` | `Barrio Sucre` | `Barrio Sucre, San Cristóbal, Táchira` | `"Barrio Sucre"`, `"Urb. Sucre"`, `"UNET"`, `"ULA"`, `"Barrio Bolívar"` |
| `unidad-vecinal` | `Unidad Vecinal` | `Unidad Vecinal, San Cristóbal, Táchira` | `"Unidad Vecinal"` |
| `madre-juana` | `Madre Juana` | `Madre Juana, San Cristóbal, Táchira` | `"Madre Juana"` |
| `santa-ines` | `Santa Inés` | `Santa Inés, San Cristóbal, Táchira` | `"Santa Inés"` |
| `quinimari` | `Quinimarí` | `Quinimarí, San Cristóbal, Táchira` | `"Quinimarí"`, `"Urb. Torbes"` |
| `tariba` | `Táriba` | `Táriba, Cárdenas, Táchira` | `"Táriba"`, `"Colinas de Táriba"`, `"Las Vegas de Táriba"`, `"Arjona"`, `"Colegio Virgen del Valle"`, `"Z.I. Barrancas"` |
| `palmira` | `Palmira` | `Palmira, Cárdenas, Táchira` | `"Palmira"`, `"El Abejal"`, `"La Flautera"`, `"Patiecitos"`, `"Caneyes"` |
| `palo-gordo` | `Palo Gordo` | `Palo Gordo, Cárdenas, Táchira` | `"Palo Gordo"`, `"Vía Palo Gordo"`, `"Altos de Palo Gordo"` |
| `san-josecito` | `San Josecito` | `San Josecito, Torbes, Táchira` | `"San Josecito"`, `"Torbes"` |
| `palmira-centro` | `Palmira Centro` | `Palmira Centro, Guásimos, Táchira` | `"Palmira Centro"` |
| `la-grita` | `La Grita` | `La Grita, Jáuregui, Táchira` | `"La Grita"` |
| `rubio` | `Rubio` | `Rubio, Junín, Táchira` | `"Rubio"`, `"Las Dantas"` |
| `capacho-nuevo` | `Capacho Nuevo` | `Capacho Nuevo, Independencia, Táchira` | `"Capacho Nuevo"`, `"Independencia"`, `"Peribeca"` |
| `capacho-viejo` | `Capacho Viejo` | `Capacho Viejo, Independencia, Táchira` | `"Capacho Viejo"`, `"Libertad"` |
| `san-antonio` | `San Antonio del Táchira` | `San Antonio del Táchira, Bolívar, Táchira` | `"San Antonio"`, `"Ureña"` |
| `lobatera` | `Lobatera` | `Lobatera, Lobatera, Táchira` | `"Lobatera"`, `"Borotá"` |
| `michelena` | `Michelena` | `Michelena, Michelena, Táchira` | `"Michelena"` |
| `santa-ana` | `Santa Ana del Táchira` | `Santa Ana del Táchira, Córdoba, Táchira` | `"Santa Ana"`, `"Córdoba"` |
| `tucape` | `Tucapé` | `Tucapé, Fernández Feo, Táchira` | `"Tucapé"` |
| `coloncito` | `Coloncito` | `Coloncito, Panamericano, Táchira` | `"Coloncito"` |
| `la-fria` | `La Fría` | `La Fría, García de Hevia, Táchira` | `"La Fría"` |
| `el-piñal` | `El Piñal` | `El Piñal, Fernández Feo, Táchira` | `"El Piñal"` |
| `pregonero` | `Pregonero` | `Pregonero, Uribante, Táchira` | `"Pregonero"`, `"Cordero"` |

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
7. **Exclusividad Absoluta de `"Gestión MAXIMUS"` (Regla Entrenada 2026-10-21):**
   - El aspecto destacado `{ icono: 'ph-check', titulo: 'Gestión MAXIMUS', ... }` o `'Gestión Comercial MAXIMUS'` **SOLO** se puede incluir cuando el inmueble proviene de la carpeta `captaciones_maximus/` (`is_maximus = true`).
   - En los inmuebles de `captaciones_externas/` (`is_maximus = false`), **PROHIBIDO** colocar `"Gestión MAXIMUS"` en `aspectos_destacados`, `amenidades` o `subtitulo`. En su lugar usar aspectos reales del inmueble o `{ icono: 'ph-CheckCircle', titulo: 'Disponibilidad Inmediata', desc: 'Propiedad lista para coordinar visita previa cita' }`.
8. **Separación de Inmuebles Distintos de un Mismo Asesor en el Mismo Minuto (Regla Entrenada 2026-10-21):**
   - Cuando un mismo asesor envía varios anuncios seguidos en el mismo minuto (ej. Jesús Cánchica enviando 4 flyers de locales distintos + 1 oficina en Barrio San Carlos + 1 habitación estudiantil + 1 local en Barrio Obrero), **NUNCA mezclar mensajes que ya tengan su propio texto descriptivo o pie de foto (`text.length > 0`)**.
   - Solo agrupar mensajes consecutivos del mismo autor en ventana de ±3 minutos cuando:
     1. El mensaje previo tiene la descripción completa (`>= 45` caracteres) y los mensajes siguientes son fotos sueltas del álbum sin texto (`msg.text === ""`).
     2. Varios mensajes seguidos son fotos sueltas sin texto (`prev.text === ""` y `msg.text === ""`) pertenecientes al mismo álbum.
     3. Un álbum de `>= 2` fotos sueltas sin texto es seguido inmediatamente por el mensaje con la descripción del inmueble.

---

## SECCIÓN 3: Parámetros de Recorte de Imágenes y Collages por Inmobiliaria

Parámetros utilizados por `property-image-cleaner` (`scripts/clean_images.py` y `scripts/clean_images.js`):

### 3.1. Detección y Separación de Collages (Con Margen y Sin Margen `Borderless`)
- **Líneas divisorias sólidas (blancas, negras o de color corporativo):**
  - Detecta franjas divisorias rectas horizontales o verticales de entre `2px` y `45px` de grosor con baja desviación estándar (`std_dev < 14.5`).
- **Costuras Rectas Sin Margen (`Borderless Seam Detection` 3x2, 3x1, 2x2, 2x1, 1x2):**
  - Muchos flyers de Táchira (ej. `IMG-20261021-WA0030.jpg` de RE/MAX o `IMG-20261016-WA0051.jpg`) unen 3 o 6 fotos sin línea blanca intermedia.
  - Se detectan calculando el salto cromático entre píxeles adyacentes (`mean_diff >= 18.0`, ratio contra mediana local `>= 2.8` y fracción de nitidez de costura `frac_sharp >= 0.32`) primero en el eje horizontal (`1/3 + 2/3` o `1/2`) y luego independientemente en cada franja sobre el eje vertical (`1/3 + 2/3` o `1/2`).
- **Recorte de Cintillos Interiores de Costura (`Inner Seam Banner Trim`):**
  - En collages de `captaciones_externas/`, los asesores suelen colocar cintillos de texto (`"Alquiler de Amplia Oficina"`, `"Canon 260$"`, `"REMAX"`) justo sobre las costuras horizontales o en la base del collage. Al separar cada sub-foto, se recorta automáticamente el `11%` del borde adyacente a la costura interior y el `8%` inferior externo para entregar fotografías limpias sin texto superpuesto.
- **Filtro de proporción mínima:**
  - Ningún sub-recorte de collage se guarda si su ancho o alto resultante es menor a `180px` o si su relación de aspecto es extrema (`> 3.6:1`).

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
