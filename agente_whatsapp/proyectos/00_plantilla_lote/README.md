# Plantilla de Lote de WhatsApp (`00_plantilla_lote`)

Esta carpeta sirve como guía y plantilla para cargar cada exportación diaria o semanal de los grupos inmobiliarios de WhatsApp del Estado Táchira.

---

## ¿Cómo crear y preparar un nuevo lote?

1. **Crea una carpeta con la fecha del lote** dentro de `agente_whatsapp/proyectos/`:
   ```text
   agente_whatsapp/proyectos/lote_2026_10_21/
   ```

2. **Exporta los chats de WhatsApp (Con archivos multimedia):**
   - En cada uno de los ~15 grupos inmobiliarios de WhatsApp:
     - Abre el menú del grupo → **Más** → **Exportar chat** → **Incluir archivos multimedia**.
   - Descomprime el archivo `.zip` exportado dentro de la carpeta del lote (puedes poner cada grupo en su propia subcarpeta dentro del lote o todos juntos en `lote_YYYY_MM_DD/`):
     ```text
     agente_whatsapp/proyectos/lote_2026_10_21/
     ├── grupo_01_alianza_inmobiliaria_tachira/
     │   ├── Chat de WhatsApp con Alianza Inmobiliaria.txt
     │   ├── IMG-20261021-WA0001.jpg
     │   ├── IMG-20261021-WA0002.jpg
     │   └── ...
     ├── grupo_02_corredores_san_cristobal/
     │   ├── _chat.txt
     │   ├── PHOTO-2026-10-21-09-15-00.jpg
     │   └── ...
     ```

3. **Formatos de exportación soportados automáticamente:**
   - **Android (Español/Inglés):** `21/10/2026, 9:30 a. m. - +58 414-7123456: Se vende casa...` y adjuntos `IMG-20261021-WA0001.jpg (archivo adjunto)`
   - **iOS / iPhone:** `[21/10/26, 9:30:15 a. m.] Carlos Mendoza: <adjunto: 00000012-PHOTO-2026-10-21-09-30-15.jpg>`

4. **Pide al Agente que procese el lote:**
   Escribe en el chat:
   > *"Procesa el lote `agente_whatsapp/proyectos/lote_2026_10_21/`"*

5. **Archivos de salida que generará el Agente en tu carpeta del lote:**
   - `procesados/inmuebles_extraidos.json`: Propiedades estructuradas tras el parseo y OCR.
   - `procesados/inmuebles_deduplicados.json`: Propiedades únicas verificadas contra Supabase.
   - `procesados/imagenes_limpias/`: Fotografías individuales separadas de collages y sin marcas de agua, listas y subidas a Supabase Storage.
   - `pendientes_revision.md`: Propiedades que requieren tu confirmación (por falta de precio/operación/tipo según la Regla de Oro 1 o por duda de duplicado).
   - `reporte_ejecucion.md`: Tabla ejecutiva con los inmuebles creados (y su código `#MAX-` / `#EXT-`), duplicados descartados, imágenes divididas y casos dudosos.
