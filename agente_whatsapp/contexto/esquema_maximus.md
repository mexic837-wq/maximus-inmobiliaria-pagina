# Esquema Técnico y Mapeo de Base de Datos: MAXIMUS Inmobiliaria

> **Documento de Auditoría Técnica (Actualizado con Flujos Duales)**
> Basado en la inspección directa de `sql/supabase-schema.sql`, `sql/migration-inmuebles-sync-dashboard.sql`, `sql/update-captaciones-maximus.sql`, `sql/migration-asesores-maximus-rls.sql`, `sql/migration-equipo-web-rls.sql`, `dashboard-layout.html`, `js/services.js`, `js/config.js` y `n8n/workflow-nuevo-inmueble.json`.

---

## 1. Configuración de Conexión y Storage (Supabase & n8n)

- **Supabase URL:** `https://db.maximusinmobiliaria.tech`
- **Tabla Principal de Propiedades:** `public.inmuebles`
- **Tablas Oficiales de Asesores / Equipo MAXIMUS:**
  - `public.asesores_maximus` (creada en `sql/migration-asesores-maximus-rls.sql` y `sql/update-captaciones-maximus.sql`)
  - `public.equipo_web` (creada en `sql/migration-equipo-web-rls.sql`)
- **Bucket de Imágenes en Supabase Storage:** `inmuebles-fotos`
  - **Visibilidad:** Público (`public = true`), límite 50 MB, formatos `image/jpeg`, `image/png`, `image/webp`, `image/avif`.
  - **Formato de URL pública:** `https://db.maximusinmobiliaria.tech/storage/v1/object/public/inmuebles-fotos/<carpeta>/<archivo>`

---

## 2. Separación de Flujos por Carpeta: `captaciones_externas/` vs `captaciones_maximus/`

El comportamiento del Agente Captador cambia automáticamente según la carpeta raíz donde se ubique el lote dentro de `agente_whatsapp/proyectos/`:

| Regla / Columna | Bandeja A: `proyectos/captaciones_externas/` (Colegas de los 15 grupos) | Bandeja B: `proyectos/captaciones_maximus/` (Propiedades Directas MAXIMUS) |
| :--- | :--- | :--- |
| **`is_maximus`** (`#inm-ismaximus`) | `false` | **`true`** (Activa la insignia exclusiva Captación MAXIMUS) |
| **`en_oferta`** | `false` | **`true`** |
| **Selector `tipo_asesor`** | `externo` (**Asesor Externo**) | `maximus` (**Asesor Oficial MAXIMUS**) |
| **`asesor_nombre` / `asesor_telefono`** | Extraídos del remitente o firma del chat de WhatsApp (`+58 4XX XXXXXXX`). | Consultados de `public.asesores_maximus` / `public.equipo_web` en Supabase (vinculando al asesor mencionado en el texto o a **José Guerrero** por defecto). |
| **`agente_id`** | `NULL` | `UUID` del asesor en `public.asesores_maximus` (si aplica). |
| **Código (`codigo`)** | `#EXT-XXX` (o `#MAX-XXX` con `is_maximus: false` explícito). | `#MAX-XXX` correlativo oficial con `is_maximus: true`. |
| **`property-image-cleaner`** | **Divide collages + Aplica Smart Crop obligatorio** para recortar logos/cintillos de otras inmobiliarias. | **NO recorta bordes de marcas de agua (`Smart Crop = OFF`)**. Solo divide si hay collage (o recorta interfaz si es screenshot de WhatsApp Web) y sube en máxima calidad original. |

---

## 3. Catálogo de Asesores Oficiales MAXIMUS (`asesores_maximus` y `equipo_web`)

Cuando se procesa un lote en `proyectos/captaciones_maximus/`, el agente consulta en vivo `GET /rest/v1/asesores_maximus?activo=eq.true` y `GET /rest/v1/equipo_web?activo=eq.true`, contando además con el respaldo semilla de las migraciones SQL:

| ID Oficial (`asesores_maximus` / `equipo_web`) | Nombre Oficial | Cargo | Teléfono / WhatsApp |
| :--- | :--- | :--- | :--- |
| `a0000001-0000-0000-0000-000000000001` (`eq-002`) | **José Guerrero** *(Default Principal)* | Director / Captador Principal | `+58 424-1234567` / `+58 424-7835697` |
| `eq-001` | **Lic. Eva Camargo** | Directora Comercial | `+58 424-1234567` |
| `a0000001-0000-0000-0000-000000000002` | **Valeria Méndez** | Especialista en Apartamentos | `+58 414-9876543` |
| `a0000001-0000-0000-0000-000000000003` | **Carlos Santander / Carlos Alviarez** | Especialista Inversiones / Terrenos | `+58 412-5556677` |
| `a0000001-0000-0000-0000-000000000004` | **Andrea Colmenares / Mariángel Rivas** | Comercial & Industrial | `+58 416-3334455` |
| `eq-003` | **María Rodríguez** | Asesora Inmobiliaria | `+58 412-5557890` |
| `eq-004` | **Carlos Mendoza** | Asesor de Inversiones | `+58 424-7778899` |

---

## 4. Estructura Exacta de la Tabla `public.inmuebles` en Supabase

| Columna SQL | Tipo de Dato | Default | Restricciones / Notas Técnicas |
| :--- | :--- | :--- | :--- |
| `id` | `TEXT` / `UUID` | `gen_random_uuid()::text` | Clave primaria (`PRIMARY KEY`). |
| `codigo` | `TEXT` | `NULL` | `#MAX-107`, etc. |
| `titulo` | `TEXT` | `NOT NULL` | Título comercial de la propiedad. |
| `subtitulo` | `TEXT` | `NULL` | Subtítulo ejecutivo de apoyo. |
| `descripcion` | `TEXT` | `NULL` | Descripción larga comercial redactada con estilo editorial MAXIMUS. |
| `precio` | `NUMERIC(14,2)` | `0` | Valor numérico puro en USD. |
| `moneda` | `TEXT` | `'USD'` | `'USD'` (Venta) o `'USD/mes'` (Alquiler). |
| `operacion` | `TEXT` | `'venta'` | `'venta'` o `'alquiler'`. |
| `tipo` | `TEXT` | `'casa'` | Soporta el mapeo de `#inm-tipo` (`casa`, `departamento`, `casa_de_campo`, `fincas`, `galpones`, `local_comercial`) con fallback automático a `'casa'`, `'apartamento'`, `'local'`, `'terreno'`, `'oficina'`, `'galpon'`. |
| `estatus` | `TEXT` | `'disponible'` | `'disponible'`, `'reservado'`, `'vendido'`, `'alquilado'`. |
| `ubicacion` | `TEXT` | `NULL` | Ubicación General (ej. `"Barrio Obrero, San Cristóbal"`). |
| `estado` | `TEXT` | `'Táchira'` | Siempre `'Táchira'`. |
| `sector_nombre` | `TEXT` | `NULL` | Nombre corto del sector o urbanización (ej. `"Barrio Obrero"`). |
| `sector_desc` | `TEXT` | `NULL` | Descripción ejecutiva del sector. |
| `habitaciones` | `INT` | `0` | Entero. Si es Local, Galpón o Terreno sin ambientes/oficinas, poner `0`. |
| `banos` | `NUMERIC(3,1)` | `0` | Soporta medios baños (`2.5`) o enteros (`2`). |
| `metros_cuadrados` | `NUMERIC(10,2)` | `0` | Área numérica en m². |
| `estacionamientos` | `INT` | `0` | Cantidad entera de puestos en BD. |
| `foto_principal` | `TEXT` | `NULL` | URL pública de la primera imagen (`fotos[0]`). |
| `fotos` | `TEXT[]` | `'{}'` | Array PostgreSQL de URLs públicas de Supabase Storage. |
| `is_maximus` | `BOOLEAN` | `false` | `false` para `captaciones_externas/` · `true` para `captaciones_maximus/`. |
| `en_oferta` | `BOOLEAN` | `false` | `false` para `captaciones_externas/` · `true` para `captaciones_maximus/`. |
| `comision_porcentaje` | `NUMERIC(5,2)` | `5.00` | Porcentaje de comisión estándar (`5.00`). |
| `aspectos_destacados` | `JSONB` | `'[]'::jsonb` | Array JSON de 4 objetos con los 23 iconos válidos de `#view-admin-cargar-inmueble`. |
| `amenidades` | `JSONB` | `'[]'::jsonb` | Array JSON de objetos `[{"icono": "ph-check", "nombre": "..."}]`. |
| `asesor_nombre` | `TEXT` | `NULL` | Nombre del Asesor Externo o del Asesor Oficial MAXIMUS. |
| `asesor_telefono` | `TEXT` | `NULL` | Teléfono normalizado (`+58 4XX XXXXXXX`). |
| `notas_privadas` | `TEXT` | `NULL` | Metadatos de trazabilidad del lote (modo de entrada, grupo, fecha, estacionamiento UI, precio/m²). |
| `agente_id` | `UUID` | `NULL` | `NULL` en externas; UUID del asesor oficial en `captaciones_maximus/` cuando aplica. |

---

## 5. Los 23 Iconos Oficiales de Aspectos Destacados (`dashboard-layout.html`)
`ph-star`, `ph-waves`, `ph-lightning`, `ph-drop`, `ph-shield-check`, `ph-car`, `ph-armchair`, `ph-cooking-pot`, `ph-wifi-high`, `ph-snowflake`, `ph-sun-horizon`, `ph-tree`, `ph-storefront`, `ph-warehouse`, `ph-plant`, `ph-lock-key`, `ph-bathtub`, `ph-elevator`, `ph-wine`, `ph-trend-up`, `ph-buildings`, `ph-sparkle`, `ph-check`.
