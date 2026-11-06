#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
=============================================================================
MODULO: WHATSAPP WEB LIVE SYNC & CAPTURE
MAXIMUS INMOBILIARIA — ESTADO TÁCHIRA
=============================================================================
Permite sincronizar y capturar publicaciones directamente desde WhatsApp Web
usando Google Chrome con sesión persistente (escaneas el QR solo 1 vez).
=============================================================================
"""

import os
import sys
import re
import time
import json
import base64
import argparse
import subprocess
import unicodedata
from datetime import datetime
from pathlib import Path

# Configurar salida UTF-8 para consola Windows
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

PROJECT_ROOT = Path(__file__).resolve().parent.parent.parent.parent.parent
SESSION_DIR = PROJECT_ROOT / "agente_whatsapp" / ".wweb_session"
PROYECTOS_DIR = PROJECT_ROOT / "agente_whatsapp" / "proyectos"
CAPTACIONES_EXTERNAS_DIR = PROYECTOS_DIR / "captaciones_externas"
CAPTACIONES_MAXIMUS_DIR = PROYECTOS_DIR / "captaciones_maximus"

ALT_SESSION_DIR = PROJECT_ROOT / ".agents" / "agente_whatsapp" / ".wweb_session"
if not SESSION_DIR.exists() and ALT_SESSION_DIR.exists():
    SESSION_DIR = ALT_SESSION_DIR

try:
    from playwright.sync_api import sync_playwright, TimeoutError as PlaywrightTimeoutError
except ImportError:
    print("[ERROR] Playwright no esta instalado en Python.")
    print("Instalalo ejecutando: python -m pip install playwright")
    sys.exit(1)


def normalize_str(s):
    """Normaliza texto eliminando acentos, asteriscos y mayúsculas para búsquedas flexibles."""
    if not s:
        return ""
    nfkd = unicodedata.normalize('NFKD', s)
    cleaned = ''.join(c for c in nfkd if not unicodedata.combining(c))
    for char in ("*", "_", "~", "•", "·", "#"):
        cleaned = cleaned.replace(char, " ")
    return " ".join(cleaned.lower().split())


def normalize_datetime(time_str, date_str):
    """Convierte cualquier formato de fecha/hora de WhatsApp Web a DD/MM/YYYY y HH:MM:SS estricto."""
    now = datetime.now()
    clean_date = now.strftime("%d/%m/%Y")
    clean_time = now.strftime("%H:%M:%S")
    
    if date_str:
        parts = [int(p) for p in re.findall(r'\d+', date_str)]
        if len(parts) == 3:
            p1, p2, p3 = parts[0], parts[1], parts[2]
            if p3 < 100: p3 += 2000
            if p1 > 12:
                clean_date = f"{p1:02d}/{p2:02d}/{p3:04d}"
            elif p2 > 12:
                clean_date = f"{p2:02d}/{p1:02d}/{p3:04d}"
            else:
                clean_date = f"{p1:02d}/{p2:02d}/{p3:04d}"

    if time_str:
        t_clean = time_str.strip().lower().replace(".", "").replace(" ", "")
        m = re.match(r"(\d{1,2}):(\d{2})(?::(\d{2}))?(am|pm)?", t_clean)
        if m:
            hh = int(m.group(1))
            mm = int(m.group(2))
            ss = int(m.group(3)) if m.group(3) else 0
            ampm = m.group(4)
            if ampm == "pm" and hh < 12: hh += 12
            if ampm == "am" and hh == 12: hh = 0
            clean_time = f"{hh:02d}:{mm:02d}:{ss:02d}"

    return clean_date, clean_time


def parse_arguments():
    parser = argparse.ArgumentParser(description="MAXIMUS WhatsApp Web Live Sync & Capture")
    parser.add_argument("--login-only", action="store_true", help="Abre WhatsApp Web para escanear el QR y guardar la sesion.")
    parser.add_argument("--lista-chats", action="store_true", help="Lista los chats y grupos visibles en WhatsApp Web.")
    parser.add_argument("--grupos", type=str, default="", help="Nombres de grupos o chats a capturar, separados por coma.")
    parser.add_argument("--limite", type=int, default=150, help="Numero maximo de inmuebles/mensajes a capturar por chat (def: 150).")
    parser.add_argument("--headless", action="store_true", help="Ejecuta Chrome en modo headless (oculto).")
    parser.add_argument("--destino", choices=["externas", "maximus", "auto"], default="auto", help="Bandeja de destino para el lote generado.")
    parser.add_argument("--auto-pipeline", action="store_true", help="Ejecuta automaticamente las 4 skills sobre el lote capturado.")
    parser.add_argument("--scroll-count", type=int, default=60, help="Ciclos de scroll hacia arriba para cargar el historial profundo (def: 60).")
    return parser.parse_args()


def init_browser_context(playwright_instance, headless=False):
    """Inicia el contexto persistente de Chrome apuntando a SESSION_DIR."""
    SESSION_DIR.mkdir(parents=True, exist_ok=True)
    
    args = [
        "--no-sandbox",
        "--disable-setuid-sandbox",
        "--disable-dev-shm-usage",
        "--disable-accelerated-2d-canvas",
        "--no-first-run",
        "--no-zygote",
        "--disable-gpu",
    ]
    
    print(f"[*] Iniciando Google Chrome con sesion persistente en:")
    print(f"    {SESSION_DIR}")
    
    context = playwright_instance.chromium.launch_persistent_context(
        user_data_dir=str(SESSION_DIR),
        channel="chrome",
        headless=headless,
        args=args,
        viewport={"width": 1280, "height": 850},
        user_agent="Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36"
    )
    return context


def wait_for_whatsapp_ready(page, timeout_sec=120):
    """
    Navega a web.whatsapp.com y espera que el usuario inicie sesion
    o detecta si la sesion ya esta activa.
    """
    print("[*] Conectando a https://web.whatsapp.com ...")
    page.goto("https://web.whatsapp.com", wait_until="domcontentloaded", timeout=60000)
    
    start_time = time.time()
    qr_notified = False
    
    SIDEBAR_SELECTOR = "#side, div[id='side'], div[aria-label='Chat list'], div[aria-label='Lista de chats']"
    QR_SELECTOR = "canvas[aria-label*='Scan'], div[data-ref], [data-testid='qrcode']"
    
    while time.time() - start_time < timeout_sec:
        try:
            if page.locator(SIDEBAR_SELECTOR).first.is_visible():
                print("[OK] Sesion de WhatsApp Web activa y cargada correctamente.")
                time.sleep(2)
                return True
        except Exception:
            pass
        
        try:
            if not qr_notified and page.locator(QR_SELECTOR).first.is_visible():
                print("=" * 60)
                print("[!] WHATSAPP WEB REQUIERE ESCANEAR EL CODIGO QR")
                print("    1. Abre WhatsApp en tu telefono celular.")
                print("    2. Toca Menu / Ajustes -> Dispositivos vinculados.")
                print("    3. Toca 'Vincular un dispositivo' y escanea el codigo en pantalla.")
                print("=" * 60)
                qr_notified = True
        except Exception:
            pass
        
        time.sleep(2)
        
    print(f"[ERROR] Tiempo de espera agotado ({timeout_sec}s) esperando inicio de sesion.")
    return False


def get_visible_chats(page):
    """Extrae la lista de titulos de chats y grupos visibles en el panel lateral."""
    chats = page.evaluate("""
        () => {
            const results = [];
            const side = document.querySelector('#side');
            if (!side) return results;
            
            const cells = side.querySelectorAll('div[role="listitem"], div[data-testid="cell-frame-container"]');
            cells.forEach(cell => {
                const titleEl = cell.querySelector('span[title], div[title]');
                if (titleEl) {
                    const title = titleEl.getAttribute('title') || titleEl.innerText;
                    if (title && !results.includes(title)) {
                        results.push(title.trim());
                    }
                }
            });
            return results;
        }
    """)
    return chats


def open_chat_by_name(page, group_name):
    """
    Busca y abre un chat o grupo por su nombre utilizando coincidencia flexible
    y clics nativos de Playwright.
    """
    print(f"[*] Buscando y abriendo chat: '{group_name}' ...")
    norm_target = normalize_str(group_name)
    target_words = [w for w in norm_target.split() if len(w) > 3]

    # Paso 1: Buscar entre los elementos visibles del sidebar (#side)
    try:
        spans = page.locator("#side span[title]").all()
        # Coincidencia exacta normalizada
        for s in spans:
            t = normalize_str(s.get_attribute("title") or "")
            if t == norm_target:
                print(f"    [OK] Coincidencia exacta visible: '{s.get_attribute('title')}', abriendo...")
                s.click()
                page.wait_for_selector("#main", timeout=8000)
                time.sleep(2.5)
                return True

        # Subcadena completa
        for s in spans:
            t = normalize_str(s.get_attribute("title") or "")
            if norm_target in t or (target_words and all(w in t for w in target_words)):
                print(f"    [OK] Coincidencia encontrada en sidebar: '{s.get_attribute('title')}', abriendo...")
                s.click()
                page.wait_for_selector("#main", timeout=8000)
                time.sleep(2.5)
                return True
    except Exception as e:
        print(f"    [!] Error en búsqueda directa en sidebar: {e}")

    # Paso 2: Usar barra de búsqueda de WhatsApp
    print(f"    Buscando en la barra de búsqueda con: '{group_name}'...")
    try:
        search_box = page.locator("div[contenteditable='true'][data-tab='3'], div#side div[role='textbox']").first
        if search_box.is_visible():
            search_box.click()
            search_box.fill("")
            time.sleep(0.3)
            search_box.fill(group_name)
            time.sleep(2.5)

            results = page.locator("#side div[role='listitem'] span[title]").all()
            for r in results:
                t = normalize_str(r.get_attribute("title") or "")
                if norm_target in t or (target_words and any(w in t for w in target_words)):
                    print(f"    [OK] Coincidencia encontrada en resultados: '{r.get_attribute('title')}', abriendo...")
                    r.click()
                    page.wait_for_selector("#main", timeout=8000)
                    time.sleep(3)
                    try:
                        page.locator("button[aria-label*='Cancelar'], button[aria-label*='Cerrar']").first.click()
                    except Exception:
                        pass
                    return True
    except Exception as e:
        print(f"    [!] Error usando barra de búsqueda: {e}")

    # Paso 3: Fallback si #main ya tiene el chat abierto
    try:
        active_title = page.evaluate("""
            () => {
                const header = document.querySelector('#main header');
                if (!header) return null;
                const el = header.querySelector('span[title], div[title]');
                return el ? (el.getAttribute('title') || el.innerText) : null;
            }
        """)
        if active_title and (norm_target in normalize_str(active_title)):
            print(f"    [OK] El chat ya se encontraba abierto en #main: '{active_title}'.")
            return True
    except Exception:
        pass

    print(f"[AVISO] No se pudo localizar el chat '{group_name}'.")
    return False


def extract_messages_with_accumulator(page, scroll_cycles=25, max_messages=60):
    """
    Acumulador Dinámico de Mensajes para Listas Virtualizadas de WhatsApp Web.
    Realiza ciclos sucesivos de scroll hacia arriba para cargar el historial diario completo
    y acumula en memoria tanto las descripciones completas como los blobs de fotos desencriptados.
    """
    print(f"[*] Extrayendo publicaciones mediante Acumulador Dinámico...")
    print(f"    - Ciclos de scroll configurados: {scroll_cycles}")
    print(f"    - Límite máximo de publicaciones: {max_messages}")

    extracted_data = page.evaluate("""
        async (params) => {
            const { cycles, maxCount } = params;
            const messagesMap = {};
            
            // Localizar el contenedor real que posee el scroll en #main
            const allDivs = Array.from(document.querySelectorAll('#main div'));
            const scrollContainer = allDivs.find(el => 
                el.scrollHeight > el.clientHeight && 
                (window.getComputedStyle(el).overflowY === 'scroll' || window.getComputedStyle(el).overflowY === 'auto')
            );

            if (!scrollContainer) {
                return { error: 'No se encontro el contenedor de scroll en #main' };
            }

            async function collectVisibleRows() {
                const rows = Array.from(document.querySelectorAll('#main div[role="row"]'));
                let newCount = 0;

                for (const row of rows) {
                    const copyable = row.querySelector('.copyable-text');
                    const preText = copyable ? (copyable.getAttribute('data-pre-plain-text') || '') : '';

                    // 1. Desplegar 'Read more' / 'Leer más' si el texto viene recortado por WhatsApp Web
                    const readMoreBtn = row.querySelector('div[role="button"][tabindex="0"], span[role="button"]');
                    if (readMoreBtn && (readMoreBtn.innerText.includes('Read more') || readMoreBtn.innerText.includes('Leer más') || readMoreBtn.innerText.includes('más'))) {
                        try { readMoreBtn.click(); } catch (e) {}
                    }

                    // 2. Texto descriptivo completo
                    let text = '';
                    const textEl = row.querySelector('.copyable-text, .selectable-text');
                    if (textEl && textEl.innerText.trim()) {
                        text = textEl.innerText.trim();
                    } else {
                        const raw = row.innerText.trim();
                        const lines = raw.split('\\n');
                        text = lines.filter(l => !l.match(/^\\d{1,2}:\\d{2}\\s*(AM|PM|a\\.?\\s*m\\.?|p\\.?\\s*m\\.?)?$/i)).join('\\n').trim();
                    }

                    // 3. Extraer remitente y timestamp desde preText
                    let sender = 'Desconocido';
                    let timeStr = '';
                    let dateStr = '';

                    if (preText) {
                        const m = preText.match(/\\[([^\\]]+)\\]\\s*([^:]+):/);
                        if (m) {
                            sender = m[2].trim();
                            const timeParts = m[1].split(',');
                            if (timeParts.length >= 2) {
                                timeStr = timeParts[0].trim();
                                dateStr = timeParts[1].trim();
                            } else {
                                timeStr = timeParts[0].trim();
                            }
                        }
                    }

                    // Fallback a autor si preText no vino
                    if (sender === 'Desconocido') {
                        const authorEl = row.querySelector('span[data-testid="author"], span._ao3e, span.color-1');
                        if (authorEl && authorEl.innerText.trim()) {
                            sender = authorEl.innerText.trim();
                        } else {
                            const pMatch = text.match(/(\\+58\\s*\\d{3}[-\\s]*\\d{7})/);
                            if (pMatch) sender = pMatch[1].replace(/\\s+/g, '');
                        }
                    }

                    // 3. Fotografias adjuntas en la fila
                    const imgEls = Array.from(row.querySelectorAll('img[src^="blob:"], img[src^="data:image"]'));
                    const validBlobs = [];

                    for (const img of imgEls) {
                        if (img.naturalWidth > 0 && img.naturalWidth < 100 && img.naturalHeight < 100) continue;
                        const src = img.src;
                        if (!src) continue;

                        if (src.startsWith('data:image/jpeg') && src.length > 500) {
                            validBlobs.push(src);
                        } else if (src.startsWith('blob:')) {
                            try {
                                const resp = await fetch(src);
                                const blob = await resp.blob();
                                const b64 = await new Promise((resolve) => {
                                    const reader = new FileReader();
                                    reader.onloadend = () => resolve(reader.result);
                                    reader.onerror = () => resolve(null);
                                    reader.readAsDataURL(blob);
                                });
                                if (b64 && b64.startsWith('data:image')) {
                                    validBlobs.push(b64);
                                }
                            } catch (e) {}
                        }
                    }

                    // Clave unica de mensaje para no duplicar en el acumulador
                    const key = preText || (sender + '_' + text.substring(0, 50));
                    
                    if (key && !messagesMap[key] && (text || validBlobs.length > 0)) {
                        messagesMap[key] = {
                            sender: sender,
                            dateStr: dateStr,
                            timeStr: timeStr,
                            preText: preText,
                            text: text,
                            images: validBlobs
                        };
                        newCount++;
                    }
                }
                return newCount;
            }

            // Recoleccion inicial en la vista actual
            await collectVisibleRows();

            // Ciclos de scroll hacia arriba para forzar a WhatsApp a cargar lotes anteriores
            let consecutiveZeroes = 0;
            for (let step = 0; step < cycles; step++) {
                if (Object.keys(messagesMap).length >= maxCount) {
                    break;
                }

                // Subir a la parte superior del contenedor
                const prevScrollHeight = scrollContainer.scrollHeight;
                scrollContainer.scrollTop = 0;
                
                // Pausa para que React descargue y monte el nuevo chunk en el DOM
                await new Promise(r => setTimeout(r, 1200));
                const added = await collectVisibleRows();

                // Si no agregó nuevos, dar un pequeño impulso de scroll relativo
                if (added === 0 && scrollContainer.scrollHeight === prevScrollHeight) {
                    consecutiveZeroes++;
                    scrollContainer.scrollBy(0, 100);
                    await new Promise(r => setTimeout(r, 400));
                    scrollContainer.scrollTop = 0;
                    await new Promise(r => setTimeout(r, 1200));
                    await collectVisibleRows();
                    if (consecutiveZeroes >= 8) {
                        // Se llegó al inicio absoluto del historial del chat
                        break;
                    }
                } else {
                    consecutiveZeroes = 0;
                }
            }

            return {
                total: Object.keys(messagesMap).length,
                messages: Object.values(messagesMap)
            };
        }
    """, {"cycles": scroll_cycles, "maxCount": max_messages})

    if "error" in extracted_data:
        print(f"[!] Error: {extracted_data['error']}")
        return []

    items = extracted_data.get("messages", [])
    print(f"[OK] Acumulador completado: {len(items)} publicaciones capturadas.")
    return items


def save_extracted_batch(chat_name, raw_messages, destino_mode="auto"):
    """
    Escribe los mensajes extraídos en el formato nativo estándar de WhatsApp export:
    Línea 1 con timestamp Android/iOS, y líneas sucesivas como texto continuo.
    """
    if not raw_messages:
        print("[!] No se encontraron mensajes con contenido para este chat.")
        return None

    is_maximus = False
    if destino_mode == "maximus":
        is_maximus = True
    elif destino_mode == "externas":
        is_maximus = False
    else:
        if "maximus" in chat_name.lower():
            is_maximus = True

    base_dir = CAPTACIONES_MAXIMUS_DIR if is_maximus else CAPTACIONES_EXTERNAS_DIR
    safe_chat_name = "".join(c for c in chat_name if c.isalnum() or c in (" ", "-", "_")).strip()
    timestamp_folder = datetime.now().strftime("%Y_%m_%d_%H%M")
    lot_folder_name = f"WhatsApp Chat with {safe_chat_name}_{timestamp_folder}"
    lot_path = base_dir / lot_folder_name
    lot_path.mkdir(parents=True, exist_ok=True)
    
    print(f"\n[*] Guardando lote capturado en:")
    print(f"    {lot_path}")
    print(f"    Tipo de Lote: {'MAXIMUS OFICIAL (is_maximus=True)' if is_maximus else 'EXTERNO (is_maximus=False)'}")

    chat_lines = []
    image_counter = 1
    total_images_saved = 0
    date_code = datetime.now().strftime("%Y%m%d")

    for msg in raw_messages:
        sender = msg.get("sender", "Usuario")
        raw_date = msg.get("dateStr", "")
        raw_time = msg.get("timeStr", "")
        clean_date, clean_time = normalize_datetime(raw_time, raw_date)
        text = msg.get("text", "").strip()
        images = msg.get("images", [])

        # Formato de adjunto con texto integrado o agrupado:
        # Si el mensaje trae fotos, emitimos las fotos primero
        for img_b64 in images:
            try:
                if "," in img_b64:
                    header, b64_data = img_b64.split(",", 1)
                else:
                    b64_data = img_b64
                
                img_bytes = base64.b64decode(b64_data)
                filename = f"IMG-{date_code}-WA{image_counter:04d}.jpg"
                img_file_path = lot_path / filename
                
                with open(img_file_path, "wb") as f_img:
                    f_img.write(img_bytes)
                
                # Formato Android estándar para archivos adjuntos
                chat_lines.append(f"{clean_date}, {clean_time} - {sender}: {filename} (archivo adjunto)")
                image_counter += 1
                total_images_saved += 1
            except Exception as e:
                print(f"[!] Error decodificando imagen {image_counter}: {e}")

        # Formato de texto continuo estándar:
        # En WhatsApp, cuando una foto viene con pie de foto o texto descriptivo en la misma burbuja,
        # lo asociamos bajo el mismo bloque para que el parser lo interprete unido.
        if text:
            lines = [l for l in text.split("\n") if l.strip()]
            if lines:
                # Si el mensaje tenía fotos, la descripción es el caption de ese mismo mensaje:
                # emitimos el texto como continuación del mismo mensaje o línea consecutiva
                chat_lines.append(f"{clean_date}, {clean_time} - {sender}: {lines[0]}")
                for extra_line in lines[1:]:
                    chat_lines.append(extra_line)

    chat_file_path = lot_path / "_chat.txt"
    with open(chat_file_path, "w", encoding="utf-8") as f_chat:
        f_chat.write("\n".join(chat_lines))

    metadata = {
        "origen_chat": chat_name,
        "tipo_lote": "captaciones_maximus" if is_maximus else "captaciones_externas",
        "is_maximus": is_maximus,
        "fecha_extraccion": datetime.now().isoformat(),
        "total_mensajes": len(raw_messages),
        "total_imagenes": total_images_saved,
        "ruta_lote": str(lot_path)
    }
    with open(lot_path / "lote_metadata.json", "w", encoding="utf-8") as f_meta:
        json.dump(metadata, f_meta, indent=2, ensure_ascii=False)

    print(f"[OK] Lote guardado con éxito:")
    print(f"     - Publicaciones procesadas: {len(raw_messages)}")
    print(f"     - Fotografias descargadas: {total_images_saved}")
    print(f"     - Archivo de chat generado: _chat.txt ({len(chat_lines)} lineas estructuradas)")
    
    return lot_path


def run_pipeline_for_lot(lot_path):
    """
    Ejecuta el pipeline completo de 4 skills para el lote generado.
    """
    print("\n" + "=" * 70)
    print("EJECUTANDO PIPELINE AUTOMATIZADO DE 4 SKILLS")
    print("=" * 70)

    python_exe = sys.executable

    # SKILL 1: Parser
    print("\n[PASO 1/4] Ejecutando Skill 1: Parser WhatsApp...")
    p1 = subprocess.run([
        python_exe,
        str(PROJECT_ROOT / ".agents" / "skills" / "whatsapp-property-parser" / "scripts" / "parse_whatsapp_batch.py"),
        "--lote", str(lot_path)
    ], capture_output=False)

    if p1.returncode != 0:
        print("[!] Error en el Paso 1 (Parser). Abortando pipeline.")
        return False

    # SKILL 2: Deduplicador
    print("\n[PASO 2/4] Ejecutando Skill 2: Deduplicador Inteligente...")
    p2 = subprocess.run([
        python_exe,
        str(PROJECT_ROOT / ".agents" / "skills" / "supabase-property-deduplicator" / "scripts" / "deduplicate_properties.py"),
        "--lote", str(lot_path)
    ], capture_output=False)

    # SKILL 3: Limpiador de Imagenes + Selector de Portada
    print("\n[PASO 3/4] Ejecutando Skill 3: Separador de Collages y Selector de Portadas...")
    p3 = subprocess.run([
        python_exe,
        str(PROJECT_ROOT / ".agents" / "skills" / "property-image-cleaner" / "scripts" / "clean_images.py"),
        "--lote", str(lot_path)
    ], capture_output=False)

    # SKILL 4: Publicador Supabase
    print("\n[PASO 4/4] Ejecutando Skill 4: Publicador Automatico en Supabase...")
    p4 = subprocess.run([
        python_exe,
        str(PROJECT_ROOT / ".agents" / "skills" / "maximus-supabase-publisher" / "scripts" / "publish_to_supabase.py"),
        "--lote", str(lot_path)
    ], capture_output=False)

    print("\n" + "=" * 70)
    print("PIPELINE AUTOMATICO FINALIZADO CON EXITO")
    print("=" * 70)
    return True


def main():
    args = parse_arguments()
    
    print("=" * 70)
    print("MAXIMUS INMOBILIARIA — EXTRACTOR EN VIVO DE WHATSAPP WEB")
    print("=" * 70)

    with sync_playwright() as p:
        context = init_browser_context(p, headless=args.headless)
        page = context.new_page()

        try:
            ready = wait_for_whatsapp_ready(page, timeout_sec=120)
            if not ready:
                context.close()
                sys.exit(1)

            if args.login_only:
                print("\n[OK] Sesion iniciada y guardada exitosamente en:")
                print(f"     {SESSION_DIR}")
                print("Ya puedes cerrar esta ventana o ejecutar las capturas automaticas.")
                context.close()
                return

            if args.lista_chats:
                print("\n[*] Obteniendo lista de chats visibles en WhatsApp Web:")
                chats = get_visible_chats(page)
                if chats:
                    for idx, c in enumerate(chats, 1):
                        print(f"    {idx:02d}. {c}")
                else:
                    print("    No se detectaron chats visibles en la vista actual.")
                context.close()
                return

            target_groups = []
            if args.grupos:
                target_groups = [g.strip() for g in args.grupos.split(",") if g.strip()]
            else:
                visible = get_visible_chats(page)
                inmo_keywords = ["ventas", "alquiler", "inmobiliaria", "captaciones", "maximus", "inmuebles", "tachira"]
                for c in visible:
                    if any(k in c.lower() for k in inmo_keywords):
                        target_groups.append(c)

                if not target_groups:
                    print("[!] No especificaste --grupos y no se detectaron grupos con palabras clave inmobiliarias.")
                    print("    Usa --lista-chats para ver tus chats o --grupos \"Nombre Exacto del Grupo\".")
                    context.close()
                    return

            print(f"\n[*] Grupos a procesar: {target_groups}")

            generated_lots = []
            for group_name in target_groups:
                print(f"\n--- Procesando Grupo: {group_name} ---")
                opened = open_chat_by_name(page, group_name)
                if not opened:
                    print(f"[!] Saltando grupo '{group_name}' (no se pudo abrir).")
                    continue

                raw_messages = extract_messages_with_accumulator(
                    page,
                    scroll_cycles=args.scroll_count,
                    max_messages=args.limite
                )
                
                lot_path = save_extracted_batch(group_name, raw_messages, destino_mode=args.destino)
                if lot_path:
                    generated_lots.append(lot_path)

            context.close()

            if args.auto_pipeline and generated_lots:
                for lot in generated_lots:
                    run_pipeline_for_lot(lot)

            print("\n[OK] Extraccion en vivo finalizada con exito.")

        except Exception as e:
            print(f"\n[ERROR NO ESPERADO]: {e}")
            try:
                context.close()
            except Exception:
                pass
            raise e


if __name__ == "__main__":
    main()
