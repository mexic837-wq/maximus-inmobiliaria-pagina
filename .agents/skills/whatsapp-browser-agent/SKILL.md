---
name: whatsapp-browser-agent
description: Agente Captador Inteligente MAXIMUS. Lee los grupos de WhatsApp Web (vía navegador /browser o vía la captura Playwright) e INTERPRETA cada publicación con su propio razonamiento (no con regex), arma un JSON estructurado por inmueble y lo inserta directamente en Supabase (public.inmuebles + fotos en Storage) con deduplicación. Úsalo cuando el usuario pida "procesa el grupo X de WhatsApp", "mete los inmuebles de WhatsApp en la base de datos" o active /browser sobre WhatsApp Web.
---

# Skill: Agente Captador Inteligente de WhatsApp (`whatsapp-browser-agent`)

> [!IMPORTANT]
> **Por qué existe esta skill:** el parser por regex (Skill 1) descartaba ~90 % de los anuncios
> ("Precio. 66.000", "Inversión total 45.000$", sectores escritos libremente, fotos y texto en
> burbujas separadas, "Leer más"...). Aquí **TÚ (el agente) lees y entiendes cada mensaje** como lo
> haría un asesor humano, y solo usas scripts para descargar fotos e insertar en Supabase.

Lee antes: `agente_whatsapp/memoria/aprendizajes.md` (Regla de Oro 2).

> [!IMPORTANT]
> **Versión vigente: Node.** Captura con `whatsapp-web-sync/scripts/captura_whatsapp.js` y luego inserta con:
> ```bash
> node .agents/skills/whatsapp-browser-agent/scripts/insertar_inmuebles.js --json "<lote>/inmuebles_agente.json" --dry-run
> node .agents/skills/whatsapp-browser-agent/scripts/insertar_inmuebles.js --json "<lote>/inmuebles_agente.json"
> ```
> - **Sin fotos no se inserta nada** (falla del 06/11/2026: 47 inmuebles quedaron con foto de stock).
> - Las rutas de `fotos` pueden ser relativas al lote (`IMG-20261109-WA0003_1.jpg`).
> - Genera automáticamente la **portada Editorial MAXIMUS** (alquiler esmeralda / venta plata) como `foto_principal`.
> - Si el inmueble ya existe pero sin fotos reales, **le completa las fotos** en vez de marcarlo duplicado.
> - Los pasos 1–4 de abajo en Python quedan como referencia; el flujo completo está en `.claude/agents/captador-whatsapp.md`.

---

## Flujo de trabajo (sigue estos pasos en orden)

### Paso 1 — Capturar mensajes y fotos (elige A o B)

**A) Recomendado — Captura automática con Playwright (texto + fotos en disco):**
```powershell
python agente_whatsapp/sincronizar_whatsapp.py --grupos "NOMBRE DEL GRUPO" --scroll-count 300 --limite 500 --headless
```
(SIN `--auto-pipeline`). Esto crea `agente_whatsapp/proyectos/captaciones_externas/WhatsApp Chat with <grupo>_<fecha>/`
con `_chat.txt` + `IMG-*.jpg`. Si la sesión expiró, ejecuta primero `--login-only` y pide al usuario escanear el QR.
> Cierra cualquier Chrome que use la misma sesión antes de ejecutar.

**B) Modo navegador (/browser):** abre https://web.whatsapp.com, entra al grupo, haz scroll hacia
arriba hasta la fecha pedida y lee las burbujas en pantalla. Para cada inmueble con foto, abre la foto
y descárgala (menú ⋮ → Descargar) a una carpeta del lote, o toma captura de pantalla de la foto.

### Paso 2 — Interpretar CADA publicación tú mismo
Recorre `_chat.txt` completo (o las burbujas). Agrupa en un solo inmueble: las fotos + el texto del
**mismo remitente** enviados dentro de ~3 minutos (las líneas `IMG-... (archivo adjunto)` justo
antes/después del texto son sus fotos). Si es necesario, **mira las imágenes** (flyers) para leer
precio, m² o ubicación.

Para cada publicación decide:
| Campo | Regla |
| :--- | :--- |
| `operacion` | `venta` / `alquiler`. "Canon", "meses de depósito" ⇒ alquiler. Precio ≥ 8.000 $ sin canon ⇒ venta. Si dice "venta o alquiler", crea 2 registros solo si da ambos precios; si no, usa el que tenga precio. |
| `tipo` | `casa`, `apartamento`, `local` (incluye oficina/consultorio/punto comercial), `galpon`, `terreno` (parcela/lote), `fincas`, `casa_de_campo`. Townhouse ⇒ casa. PH ⇒ apartamento. |
| `precio` | Número en USD (66.000 ⇒ 66000; "45 mil" ⇒ 45000). Alquiler = canon mensual. |
| `sector_clave` | **Obligatorio una de las 39 claves oficiales** (tabla abajo). Usa tu conocimiento de San Cristóbal/Táchira: "Policlínica Táchira / Av. 19 de Abril" ⇒ `pirineos`; "La Hacienda" ⇒ `la-concordia`. Si NO estás seguro de la zona, NO inventes: déjalo en pendientes. |
| resto | `titulo` (ej. "Casa en Palmira, La Flautera"), `descripcion` (redacción elegante 2–3 párrafos, sin teléfonos de terceros), `habitaciones`, `banos`, `metros_cuadrados`, `estacionamientos`, `asesor_nombre`, `asesor_telefono` (+58 4XX XXXXXXX), `fotos` (rutas absolutas de los IMG del inmueble), `texto_original`. |

**Descarta**: búsquedas ("Requiero...", "busco..."), saludos, "busco el captador", mensajes
borrados, y anuncios sin precio (van a pendientes, nunca se inventa el precio — Regla de Oro 1).
En grupos externos **nunca** escribas "Gestión MAXIMUS".

### Paso 3 — Guardar el JSON
Escribe `inmuebles_agente.json` dentro de la carpeta del lote: una lista de objetos con los campos
de arriba. Procesa en bloques de 30–50 inmuebles si el grupo es muy grande (un JSON por bloque).

### Paso 4 — Insertar en Supabase
```powershell
python .agents/skills/whatsapp-browser-agent/scripts/insertar_inmuebles.py --json "<ruta>/inmuebles_agente.json"
```
- Añade `--maximus` si el lote viene de `captaciones_maximus/`.
- Usa `--dry-run` primero si quieres revisar.
- El script valida, **deduplica contra Supabase** (operación + tipo + sector + precio ±5 % + m² ±10 %),
  sube las fotos al bucket `inmuebles-fotos` y hace upsert. Genera `inmuebles_agente.resultado.json`.

### Paso 5 — Reportar al usuario
Indica: mensajes leídos, inmuebles detectados, insertados, duplicados y pendientes (con el motivo).

---

## Claves oficiales `sector_clave` (UBICACIONES_TACHIRA)
`centro`, `barrio-obrero`, `pueblo-nuevo`, `pirineos`, `urb-pirineos`, `la-concordia`, `las-lomas`,
`la-romera`, `paramillo`, `urb-guaparo`, `el-lobo`, `la-ermita`, `la-castellana`, `san-carlos`,
`la-popita`, `las-pilas`, `barrio-sucre`, `unidad-vecinal`, `madre-juana`, `santa-ines`, `quinimari`,
`tariba`, `palmira`, `palo-gordo`, `san-josecito`, `palmira-centro`, `la-grita`, `rubio`,
`capacho-nuevo`, `capacho-viejo`, `san-antonio`, `lobatera`, `michelena`, `santa-ana`, `tucape`,
`coloncito`, `la-fria`, `el-piñal`, `pregonero`, `cordero`, `chorro-del-indio` (41 zonas desde el 11/11/2026).

Referencias de barrios → clave: ver tabla 1.2 de `agente_whatsapp/memoria/aprendizajes.md`.
Si un sector frecuente no tiene clave clara (ej. Cordero, Agua Clara), pregunta al usuario una sola vez
y registra la respuesta en `aprendizajes.md` (Regla de Oro 3) para no volver a preguntar.
