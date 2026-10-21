---
name: agent-continuous-trainer
description: >-
  Motor de Auto-Entrenamiento del Agente Captador de WhatsApp MAXIMUS. Opera en dos modos:
  1) Modo Captura en Caliente: cuando el usuario corrige un resultado en el chat (un dato en Supabase,
  una jerga de Táchira o un recorte de imagen), actualiza el registro en Supabase y anota la regla
  en agente_whatsapp/memoria/aprendizajes.md.
  2) Modo Consolidación de Código: cuando el usuario pide "Consolida lo aprendido", toma las reglas
  nuevas de memoria/aprendizajes.md y actualiza directamente el código de los scripts y SKILL.md de
  las skills 1, 2, 3 y 4 para que el agente quede entrenado permanentemente.
---

# Skill 5: Motor de Auto-Entrenamiento Continuo (`agent-continuous-trainer`)

Esta skill implementa la **Regla de Oro 3 (Auto-aprendizaje)** de `agente_whatsapp/agents.md`. Permite que el Agente Captador aprenda y evolucione permanentemente con cada corrección humana.

---

## 1. Modo 1: Captura en Caliente (Hot-Capture Feedback)

Se activa **automáticamente cada vez que el usuario da feedback o corrige un resultado en el chat** (ej. *"En este local recortaste muy poco el logo inferior de RE/MAX"*, *"Cuando diga 'PB' significa Planta Baja"*, o *"El inmueble #MAX-108 en realidad queda en Pirineos II y cuesta $92.000"*).

### Flujo de Ejecución en Modo Captura en Caliente:
1. **Corregir inmediatamente el registro en Supabase** (si aplica a un inmueble ya publicado):
   ```bash
   python .agents/skills/agent-continuous-trainer/scripts/trainer_engine.py hot-fix \
     --codigo "#MAX-108" \
     --updates '{"precio": 92000, "sector_nombre": "Pirineos II", "ubicacion": "Pirineos II, San Cristóbal"}' \
     --seccion "1" \
     --regla "Cuando el anuncio mencione Urb. Don Bosco parte alta, normalizar sector como Pirineos II."
   ```
2. **Registrar la regla aprendida en `agente_whatsapp/memoria/aprendizajes.md`** dentro de la sección correspondiente:
   - `1`: Diccionario Inmobiliario Táchira / Jerga WhatsApp
   - `2`: Reglas de Validación de Campos
   - `3`: Parámetros de Recorte de Imágenes y Collages por Inmobiliaria
   - `4`: Historial de Casos de Deduplicación
3. **Confirmar al usuario en el chat:**
   - Qué se actualizó en Supabase (`public.inmuebles`).
   - Qué regla quedó grabada en `agente_whatsapp/memoria/aprendizajes.md`.

---

## 2. Modo 2: Consolidación de Código (`"Consolida lo aprendido"`)

Se activa cuando el usuario escribe en el chat:
- *"Consolida lo aprendido"*
- *"Entrena el código con los últimos aprendizajes"*

### Flujo de Ejecución en Modo Consolidación:
1. Ejecuta el motor de consolidación:
   ```bash
   python .agents/skills/agent-continuous-trainer/scripts/trainer_engine.py consolidate
   ```
2. **¿Qué hace la consolidación?**
   - Lee todas las entradas nuevas marcadas con `[PENDIENTE_CONSOLIDAR]` en `agente_whatsapp/memoria/aprendizajes.md`.
   - Inyecta automáticamente nuevas zonas/abreviaturas de Táchira en `ZONAS_TACHIRA` dentro de `.agents/skills/whatsapp-property-parser/scripts/parse_whatsapp_batch.py`.
   - Inyecta o actualiza parámetros de recorte de marcas de agua en `PERFILES_MARCA_AGUA` dentro de `.agents/skills/property-image-cleaner/scripts/clean_images.py`.
   - Además, el Agente revisa las reglas semánticas complejas y edita quirúrgicamente los scripts en `scripts/` y las instrucciones en `SKILL.md` de las skills 1, 2, 3 y 4.
   - Marca las reglas en `agente_whatsapp/memoria/aprendizajes.md` como `[CONSOLIDADO EN CÓDIGO - YYYY-MM-DD]`.
