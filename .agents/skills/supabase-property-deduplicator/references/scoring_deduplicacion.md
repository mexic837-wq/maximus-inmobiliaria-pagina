# Matriz de Pesos del Score de Deduplicación MAXIMUS

| Dimensión Comparada | Tolerancia Oficial | Peso en Score | Comportamiento en Caso de Desviación |
| :--- | :--- | :--- | :--- |
| `operacion` (`venta` / `alquiler`) | Exacta | Filtro duro | Si difiere, no es duplicado (`score = 0`). |
| `tipo` (`casa`, `apartamento`, `local`...) | Equivalencia semántica | Filtro duro | Si difiere, no es duplicado (`score = 0`). |
| `sector_nombre` normalizado | Normalización Táchira | `0.35` | Si no coincide el sector, `score < 0.65`. |
| `precio` (USD) | Margen `±5%` | `0.35` | Si varía entre `5%` y `15%` con mismo sector y m², suma `0.15` y dispara **Caso Dudoso** (`0.65 <= score < 0.85`). |
| `metros_cuadrados` (m²) | Margen `±10%` | `0.25` | Si varía `<= 10%`, suma `0.25`. |
| `habitaciones` + `banos` | Exacta | `0.05` | Refuerzo de confirmación. |
