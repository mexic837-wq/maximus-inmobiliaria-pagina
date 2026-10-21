---
name: supabase-property-deduplicator
description: >-
  Consulta la tabla public.inmuebles en Supabase antes de insertar nuevas propiedades extraídas de WhatsApp.
  Calcula un score de similitud comparando Operación + Tipo de Inmueble + Sector Normalizado + Precio (margen ±5%)
  + Área m² (margen ±10%). Detecta duplicados dentro del mismo lote diario (entre los ~15 grupos de WhatsApp)
  y contra la base de datos en producción. Omite repetidos confirmados y pausa casos dudosos en pendientes_revision.md.
---

# Skill 2: Deduplicador de Propiedades contra Supabase (`supabase-property-deduplicator`)

Esta skill evita que el catálogo de **MAXIMUS Inmobiliaria** se contamine con propiedades repetidas cuando múltiples asesores externos publican el mismo inmueble en varios grupos de WhatsApp del Táchira o cuando la propiedad ya existe en `public.inmuebles` en **Supabase**.

---

## 1. Algoritmo de Similitud y Reglas de Decisión

El motor evalúa cada candidato en dos fases:
1. **Fase A (Deduplicación Intra-Lote):** Compara entre sí todos los inmuebles extraídos de los ~15 grupos del lote diario. Si dos o más anuncios corresponden al mismo inmueble, conserva el registro con **más fotografías adjuntas y descripción más completa**.
2. **Fase B (Deduplicación contra Supabase en Vivo):** Consulta `GET https://db.maximusinmobiliaria.tech/rest/v1/inmuebles?select=*` (leyendo las credenciales desde `js/config.js` o variables de entorno) y calcula el `similarity_score` (`0.00` a `1.00`):

### Pesos del Score (` Operación + Tipo + Sector Normalizado` son bloqueantes base):
- **Condición Base Obligatoria:** Misma `operacion` (`venta`/`alquiler`) y `tipo` compatible (`casa`, `apartamento`/`departamento`, `local`, `galpon`, `fincas`/`terreno`). Si difieren, el score es `0.0`.
- **Sector Normalizado (35%):** Coincidencia exacta o contenida en `sector_nombre` o `ubicacion` (ej. `"Barrio Obrero"` == `"Barrio Obrero, San Cristóbal"`).
- **Precio dentro de margen ±5% (35%):**
  - Diferencia `<= 5%`: suma `0.35` (100% del peso de precio).
  - Diferencia entre `5%` y `15%`: suma `0.15` (alerta de caso dudoso: posible ajuste de precio o comisión distinta entre asesores).
- **Área m² dentro de margen ±10% (25%):**
  - Diferencia `<= 10%`: suma `0.25`.
  - Si uno de los dos no especifica m² (`0`), se evalúa similitud textual de habitaciones/baños.
- **Habitaciones y Baños (5%):** Coincidencia exacta suma `0.05`.

### Umbrales de Acción:
- **`score >= 0.85` → DUPLICADO CONFIRMADO:** Se omite automáticamente y se registra en el log de `duplicados_descartados` para el `reporte_ejecucion.md`.
- **`0.65 <= score < 0.85` → CASO DUDOSO:** (Ej. mismo sector, mismo tipo y mismos m² `±10%`, pero precio distinto en un `12%`). Se pausa y se añade a `agente_whatsapp/proyectos/<lote>/pendientes_revision.md` mostrando lado a lado el candidato de WhatsApp y el inmueble existente en Supabase (`codigo`, `id`, `precio`, `asesor_nombre`).
- **`score < 0.65` → INMUEBLE ÚNICO VERIFICADO:** Pasa a la fase de limpieza de imágenes y publicación.

---

## 2. Cómo Ejecutar el Script

```bash
python .agents/skills/supabase-property-deduplicator/scripts/deduplicate_properties.py --lote "agente_whatsapp/proyectos/<nombre_lote>"
```

**Salidas:**
- Actualiza `<lote>/procesados/inmuebles_deduplicados.json` con las listas `unicos_verificados`, `duplicados_descartados` y `dudosos_pausados`.
- Añade cualquier caso dudoso a `<lote>/pendientes_revision.md`.
