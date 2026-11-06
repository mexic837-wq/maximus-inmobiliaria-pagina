---
name: whatsapp-web-sync
description: Sincroniza y extrae en vivo inmuebles y fotografías directamente desde WhatsApp Web sin requerir exportaciones manuales ni zips. Utiliza Google Chrome con sesión persistente (QR escaneado 1 sola vez) y conecta directamente con el pipeline de 4 skills para subir a Supabase de forma 100% automática.
---

# Skill: WhatsApp Web Live Sync & Capture (`whatsapp-web-sync`)

Permite al Agente MAXIMUS acceder directamente a WhatsApp Web a través del navegador Google Chrome local, navegar por los grupos inmobiliarios de San Cristóbal / Táchira (como *SOLO VENTAS - TACHIRA*, *Maximus captaciónes*, etc.), extraer los mensajes descriptivos junto con sus fotografías adjuntas en máxima resolución, y volcarlos automáticamente en las bandejas `captaciones_externas/` o `captaciones_maximus/`.

---

## 1. Características Principales

1. **Sesión Persistente:** Guarda las cookies, cache e IndexedDB en `agente_whatsapp/.wweb_session/` (ignorado en `.gitignore`). El usuario escanea el código QR una sola vez desde su teléfono celular.
2. **Descarga de Medios Desencriptados:** Extrae las imágenes directamente de los blobs y memoria del navegador convirtiéndolos a Data URLs y guardándolos como archivos `IMG-YYYYMMDD-WAXXXX.jpg`.
3. **Generación Nativa de `_chat.txt`:** Genera un archivo de chat estructurado idéntico a las exportaciones oficiales de WhatsApp, compatible al 100% con la Skill 1 (`whatsapp-property-parser`).
4. **Enrutamiento Inteligente:** Clasifica automáticamente como `captaciones_maximus/` si el grupo contiene la palabra "maximus", o `captaciones_externas/` en caso contrario.
5. **Flag `--auto-pipeline`:** Desencadena automáticamente en cadena las 4 skills:
   - `whatsapp-property-parser` (extracción estructurada y validación con `UBICACIONES_TACHIRA`).
   - `supabase-property-deduplicator` (detección de duplicados contra base de datos).
   - `property-image-cleaner` (separación de collages, smart crop y selección inteligente de portada).
   - `maximus-supabase-publisher` (publicación y subida de imágenes a Supabase).

---

## 2. Comandos de Uso

### A) Primer Uso: Iniciar Sesión y Escanear QR
Abre una ventana de Google Chrome para escanear el código QR con el celular:
```bash
python agente_whatsapp/sincronizar_whatsapp.py --login-only
```

### B) Ver Chats Visibles en tu WhatsApp
Lista los grupos y conversaciones disponibles:
```bash
python agente_whatsapp/sincronizar_whatsapp.py --lista-chats
```

### C) Extraer y Procesar Automáticamente (Pipeline Completo)
Captura los últimos mensajes y fotos del grupo y los sube directo a Supabase:
```bash
python agente_whatsapp/sincronizar_whatsapp.py --grupos "SOLO VENTAS - TACHIRA" --auto-pipeline
```

Para captaciones directas de MAXIMUS:
```bash
python agente_whatsapp/sincronizar_whatsapp.py --grupos "Maximus captaciónes" --auto-pipeline
```

### D) Opciones Adicionales
- `--limite 50`: Número de mensajes recientes a evaluar (por defecto: 40).
- `--scroll-count 4`: Cantidad de veces que sube el historial para capturar mensajes más antiguos.
- `--headless`: Ejecuta el navegador en segundo plano sin ventana gráfica (requiere haber iniciado sesión previamente).
- `--destino auto|externas|maximus`: Forzar la carpeta de destino del lote.
