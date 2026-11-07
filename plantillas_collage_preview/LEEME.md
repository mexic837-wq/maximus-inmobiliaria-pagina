# Plantillas de Collage MAXIMUS — Propuesta v2 (diseño unificado) (para revisión del equipo)

| Archivo | Qué muestra |
|---|---|
| `plantilla_alquiler.jpg` | **ALQUILER** — diseño "Editorial MAXIMUS", acento esmeralda, canon mensual |
| `plantilla_venta.jpg` | **VENTA** — mismo diseño, acento plata, precio de venta |
| `*_2fotos.jpg` / `*_1foto.jpg` | Cómo se adapta cada plantilla si el inmueble trae pocas fotos |
| `caso_borde_venta_terreno.jpg` | Terreno sin habitaciones/baños, título muy largo y precio de 7 cifras |

- Ambas plantillas comparten la misma estructura, logo, tipografía y colores; solo cambian la etiqueta de operación, su color y el texto del precio.
- Tamaño 1600x1000 (16:10), la misma proporción de las tarjetas del catálogo web.
- Las fotos son de un lote real de WhatsApp de baja resolución; con fotos propias de MAXIMUS se ve más nítido.
- Para aprobar: poner `"habilitado": true` en `.agents/skills/property-image-cleaner/references/plantillas_collage.json`.
- Para regenerar estas muestras: `python .agents/skills/property-image-cleaner/scripts/preview_plantillas.py`
