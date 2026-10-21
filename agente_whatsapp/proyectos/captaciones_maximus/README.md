# 🏛️ Bandeja B: Captaciones Directas MAXIMUS (`agente_whatsapp/proyectos/captaciones_maximus/`)

Esta carpeta está destinada exclusivamente a los **inmuebles propios y captaciones directas de nuestra agencia MAXIMUS Inmobiliaria**.

---

## ⚙️ Reglas Automáticas que Aplica el Agente en `captaciones_maximus/`

1. **En Supabase (`public.inmuebles`):**
   - `is_maximus = true` y `en_oferta = true` (**Captación Directa MAXIMUS activada** para que el inmueble luzca la insignia exclusiva en el catálogo y en la sección de Captaciones MAXIMUS).
2. **En `Asesor Responsable`:**
   - Selecciona siempre **Asesor Oficial MAXIMUS** (`tipo_asesor = "maximus"`).
   - Consulta en vivo nuestras tablas `public.asesores_maximus` y `public.equipo_web` en Supabase (según `sql/migration-asesores-maximus-rls.sql` y `sql/migration-equipo-web-rls.sql`):
     - Si el texto o chat menciona qué asesor de MAXIMUS lo captó (ej. *José Guerrero*, *Eva Camargo*, *Valeria Méndez*, *Carlos Santander / Carlos Alviarez*, *Andrea Colmenares*, *María Rodríguez*, *Mariángel Rivas*), vincula automáticamente su `id` (`agente_id`), `asesor_nombre` y `asesor_telefono` oficial.
     - Si no especifica el nombre del captador, asigna al asesor principal por defecto (**José Guerrero** — Director / Captador Principal) o te consulta antes de insertar.
3. **En `property-image-cleaner`:**
   - **NO recorta bordes de marcas de agua (`Smart Crop = OFF`)**, ya que son fotografías oficiales nuestras y debemos preservar el 100% del encuadre original en máxima calidad.
   - Únicamente separa collages si alguna imagen viene en cuadrícula/mosaico (o recorta el marco de WhatsApp Web si se subió mediante captura de pantalla) y sube las fotos originales en máxima calidad al bucket `inmuebles-fotos` de Supabase Storage.

---

## 📂 Los 3 Modos Soportados para Colocar Archivos Aquí

Crea una subcarpeta para el lote o captación (ej. `captaciones_maximus/lote_2026_10_21/`) usando cualquiera de los **3 modos**:

1. **Modo 1 (Exportación `.zip` o `.txt` + fotos de WhatsApp):** Descomprime automáticamente el `.zip` y agrupa las fotos consecutivas (`WA0010..WA0013.jpg`) con la descripción enviada por nuestro asesor en un rango de `±3 minutos`.
2. **Modo 2 (Captura de pantalla de WhatsApp Web):** Extrae por Visión/OCR los datos de la burbuja, recorta únicamente la fotografía interior eliminando la interfaz de WhatsApp y la sube sin recortar bordes internos.
3. **Modo 3 (Subcarpetas manuales `inmueble_01/`, `inmueble_02/`):** Coloca las fotos de alta resolución de la propiedad junto con un archivo `info.txt` con los datos y el nombre del asesor MAXIMUS captador.
