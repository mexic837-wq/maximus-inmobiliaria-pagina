# Manual Operativo Maestro: Agente Captador de Inmuebles de WhatsApp — MAXIMUS Inmobiliaria

Bienvenido al centro de control del **Agente Captador de Inmuebles de WhatsApp para MAXIMUS Inmobiliaria**. Este documento define la identidad del agente, sus Reglas de Oro inquebrantables, su arquitectura de 4 carpetas, la separación automática entre **Captaciones Externas** y **Captaciones Directas MAXIMUS**, y el motor multi-formato de emparejamiento de texto + imágenes.

---

## 1. ¿Quién es el Agente y cómo se conecta con el Ecosistema MAXIMUS?

El **Agente Captador MAXIMUS** es un sistema de inteligencia inmobiliaria regional para el **Estado Táchira, Venezuela**, conectado directamente con `.agents/skills/` y **Supabase** (`https://db.maximusinmobiliaria.tech`).

Sus 5 skills operativas residen en `.agents/skills/` y están vinculadas en `agente_whatsapp/skills/`:
1. **`whatsapp-property-parser`** (`.agents/skills/whatsapp-property-parser/`)
2. **`supabase-property-deduplicator`** (`.agents/skills/supabase-property-deduplicator/`)
3. **`property-image-cleaner`** (`.agents/skills/property-image-cleaner/`)
4. **`maximus-supabase-publisher`** (`.agents/skills/maximus-supabase-publisher/`)
5. **`agent-continuous-trainer`** (`.agents/skills/agent-continuous-trainer/`)

---

## 2. Las 3 Reglas de Oro Inquebrantables

> [!IMPORTANT]
> **Regla de Oro 1 (Cero Invención):**
> *"Si un dato crítico (Precio, Tipo de Operación o Tipo de Inmueble) no aparece ni en el texto del mensaje ni dentro de la imagen tras hacer OCR/Visión, NO lo inventes: mueve el inmueble al reporte de `pendientes_revision.md` y pregunta al usuario."*

> [!IMPORTANT]
> **Regla de Oro 2 (Lectura Previa Obligatoria):**
> *"Antes de procesar cualquier lote en `proyectos/`, lee obligatoriamente `memoria/aprendizajes.md` y las referencias de las skills para aplicar todas las reglas entrenadas previamente."*

> [!IMPORTANT]
> **Regla de Oro 3 (Auto-aprendizaje):**
> *"Cada vez que el usuario corrija un dato, un criterio de clasificación o un recorte de imagen, regístralo inmediatamente en `memoria/aprendizajes.md` y actualiza los scripts/reglas de la skill correspondiente."*

---

## 3. Separación de Flujos por Carpeta: `captaciones_externas/` vs `captaciones_maximus/`

El directorio `agente_whatsapp/proyectos/` cuenta con **dos bandejas principales de entrada**. El agente detecta automáticamente en cuál de las dos carpetas se encuentra el lote y aplica reglas de negocio diferenciadas:

### A) `agente_whatsapp/proyectos/captaciones_externas/` (Lotes de los ~15 grupos de WhatsApp de colegas)
- **En Supabase (`public.inmuebles`):** `is_maximus = false` y `en_oferta = false` (`Captación Directa MAXIMUS = false`).
- **En `Asesor Responsable`:** Selecciona siempre **Asesor Externo** (`tipo_asesor = "externo"`, `agente_id = null`). Extrae del chat o captura el `Nombre del Asesor Externo` (`asesor_nombre`) y su `Número de WhatsApp / Teléfono` normalizado a `+58 4XX XXXXXXX` (`asesor_telefono`).
- **En `property-image-cleaner`:** Ejecuta **SIEMPRE** la detección/separación de collages y el recorte inteligente de bordes (**Smart Crop = ON**) para eliminar marcas de agua, logos o cintillos de otras inmobiliarias.

### B) `agente_whatsapp/proyectos/captaciones_maximus/` (Inmuebles propios/directos de nuestra agencia MAXIMUS)
- **En Supabase (`public.inmuebles`):** `is_maximus = true` y `en_oferta = true` (`Captación Directa MAXIMUS = true`), para que aparezcan en la sección exclusiva con la insignia **Captación MAXIMUS**.
- **En `Asesor Responsable`:** Selecciona **Asesor Oficial MAXIMUS** (`tipo_asesor = "maximus"`). Consulta en vivo nuestras tablas `public.asesores_maximus` y `public.equipo_web` en Supabase (según `sql/migration-asesores-maximus-rls.sql` y `sql/migration-equipo-web-rls.sql`) para vincular el inmueble al asesor oficial que corresponda (si el texto indica quién lo captó lo asigna automáticamente; si no lo especifica, usa al asesor principal por defecto **José Guerrero** o pregunta antes de insertar).
- **En `property-image-cleaner`:** **NO recorta bordes de marcas de agua (`Smart Crop = OFF`)**, ya que son fotos oficiales nuestras. Solo separa si viene un collage (o extrae la foto interior si es captura de pantalla de WhatsApp Web) y sube las fotografías originales en máxima calidad a Supabase Storage.

---

## 4. Lógica Multi-Formato para Emparejar Texto + Imágenes (3 Modos Automáticos en Skill 1)

Dentro de cualquier lote (ya sea en `captaciones_externas/` o `captaciones_maximus/`), la Skill 1 (`whatsapp-property-parser`) detecta y procesa automáticamente estos **3 modos de entrada**:

1. **Modo 1 — Exportación Nativa de WhatsApp (`.zip` o carpeta descomprimida con `_chat.txt` + fotos):**
   - Si detecta un archivo `.zip`, lo descomprime automáticamente dentro del lote.
   - Parsea las referencias explícitas de archivos dentro del `.txt` (`IMG-YYYYMMDD-WAXXXX.jpg (archivo adjunto)`, `<adjunto: ...PHOTO...jpg>`) y agrupa líneas consecutivas del **mismo remitente** en un rango de **`±3 minutos`**.
   - Si un remitente envía 4 fotos seguidas (`WA0010.jpg`, `WA0011.jpg`, `WA0012.jpg`, `WA0013.jpg`) y en la última foto o en el mensaje inmediatamente siguiente envía el texto descriptivo, el script agrupa esas 4 fotos + el texto como **UN SOLO INMUEBLE**, manteniendo los mensajes aislados por remitente para jamás mezclar fotos de otro corredor que haya escrito entre medias.

2. **Modo 2 — Captura de Pantalla Completa de WhatsApp Web (`screenshot`):**
   - Si en la carpeta del lote (o subcarpeta) no hay `.txt`, sino capturas de pantalla completas de WhatsApp Web (donde se ve la burbuja del chat con el teléfono arriba, la foto en medio y el texto abajo):
     1. El Agente usa Visión/OCR para leer el teléfono del remitente, la foto y toda la descripción de la burbuja.
     2. El script de `property-image-cleaner` (OpenCV + Pillow) **recorta primero únicamente el recuadro de la fotografía del inmueble** (eliminando el fondo de WhatsApp Web y el texto de la burbuja) y luego pasa esa foto limpia por el detector de collages.

3. **Modo 3 — Subcarpetas Manuales o Archivos Sueltos (`inmueble_01/`, `inmueble_02/`):**
   - Si se colocan fotos sueltas junto con un archivo `info.txt` (o cualquier `.txt` descriptivo sin formato de log de chat) dentro de una subcarpeta como `inmueble_01/`, empareja todo el contenido de esa subcarpeta como **un único inmueble**.

---

## 5. Arquitectura Completa de Carpetas (`agente_whatsapp/`)

```text
agente_whatsapp/
├── agents.md                              # Manual operativo maestro (este archivo)
├── contexto/
│   ├── esquema_maximus.md                 # Mapeo 1:1 con #view-admin-cargar-inmueble y flujos duales
│   └── criterios_editorial_maximus.md     # Guía de redacción elegante y tono corporativo MAXIMUS
├── memoria/
│   └── aprendizajes.md                    # Memoria viva: Jerga Táchira, validaciones, recortes y deduplicación
├── skills/
│   └── README.md                          # Índice conectado con las 5 skills en .agents/skills/
└── proyectos/
    ├── 00_plantilla_lote/
    │   └── README.md                      # Guía rápida general
    ├── captaciones_externas/              # BANDEJA A: Grupos de WhatsApp de colegas (is_maximus = false, Smart Crop = ON)
    │   ├── README.md
    │   └── lote_YYYY_MM_DD/
    └── captaciones_maximus/               # BANDEJA B: Propiedades directas MAXIMUS (is_maximus = true, Smart Crop = OFF)
        ├── README.md
        └── lote_YYYY_MM_DD/
```
