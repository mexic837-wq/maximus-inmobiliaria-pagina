#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAXIMUS Inmobiliaria - Skill 3: property-image-cleaner (Dual-Flow & Collage/Watermark Engine)
=============================================================================================
Limpia y procesa las imágenes de WhatsApp:
  1. Extractor de Fotografía desde Captura de Pantalla de WhatsApp Web (Modo 2):
     Recorta únicamente el recuadro interior de la fotografía del inmueble.
  2. Separador Automático de Collages (Con Margen y Sin Margen `Borderless` 3x2, 3x1, 2x2, 2x1, 1x2):
     Detecta líneas divisorias sólidas (blancas/negras/color) Y costuras rectas sin margen
     (`find_true_collage_seams`), dividiendo el collage en fotografías individuales numeradas
     (`_01.jpg`, `_02.jpg`, `_03.jpg`, ...) y recortando cintillos de texto sobre las costuras.
  3. Comportamiento Diferenciado por Carpeta:
     - `captaciones_externas/` -> Ejecuta SIEMPRE Smart Crop para recortar marcas de agua,
       logos y cintillos de otras inmobiliarias.
     - `captaciones_maximus/`  -> NO recorta bordes de marcas de agua (Smart Crop = OFF),
       conservando las fotos oficiales de MAXIMUS en máxima calidad (JPEG quality=95).
  4. Upload en vivo a Supabase Storage (`inmuebles-fotos`) leyendo credenciales desde `.env`.
"""

import os
import re
import sys
import json
import argparse
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8", errors="replace")

try:
    from PIL import Image, ImageOps, ImageStat
    import numpy as np
except ImportError as e:
    raise RuntimeError("Se requiere Pillow y numpy instalados (pip install Pillow numpy opencv-python-headless).") from e

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False


PERFILES_MARCA_AGUA = {
    "remax": {"top_crop": 0.02, "bottom_crop": 0.09},
    "century21": {"top_crop": 0.02, "bottom_crop": 0.10},
    "c21": {"top_crop": 0.02, "bottom_crop": 0.10},
    "cuspide": {"top_crop": 0.05, "bottom_crop": 0.08},
    "default": {"top_crop": 0.00, "bottom_crop": 0.04},
}


def load_supabase_config(repo_root: Path) -> Tuple[str, str, str]:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "").strip() or os.environ.get("SUPABASE_ANON_KEY", "").strip()
    bucket = os.environ.get("STORAGE_BUCKET", "inmuebles-fotos").strip()

    env_path = repo_root / ".env"
    if env_path.exists():
        for raw_line in env_path.read_text(encoding="utf-8", errors="replace").splitlines():
            line = raw_line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            k, v = line.split("=", 1)
            k, v = k.strip(), v.strip()
            if k == "SUPABASE_URL" and not url:
                url = v
            elif k == "SUPABASE_SERVICE_ROLE_KEY" and v:
                key = v
            elif k == "SUPABASE_ANON_KEY" and not key:
                key = v
            elif k == "STORAGE_BUCKET" and v:
                bucket = v

    config_js = repo_root / "js" / "config.js"
    if config_js.exists() and (not url or not key):
        content = config_js.read_text(encoding="utf-8", errors="replace")
        if not url:
            m_url = re.search(r"SUPABASE_URL\s*:\s*['\"]([^'\"]+)['\"]", content)
            if m_url:
                url = m_url.group(1).rstrip("/")
        if not key:
            m_key = re.search(r"SUPABASE_ANON_KEY\s*:\s*['\"]([^'\"]+)['\"]", content)
            if m_key:
                key = m_key.group(1).strip()

    if not url or not key:
        raise RuntimeError("No se encontraron credenciales de Supabase en .env ni en js/config.js.")
    return url.rstrip("/"), key, bucket


# ==============================================================================
# 0. MODO 2: EXTRACTOR DEL RECUADRO FOTOGRÁFICO DESDE SCREENSHOT DE WHATSAPP WEB
# ==============================================================================
def extraer_foto_de_screenshot_whatsapp(img: Image.Image) -> Tuple[Image.Image, bool]:
    rgb = img.convert("RGB")
    arr = np.array(rgb)
    h, w, _ = arr.shape

    if HAS_CV2:
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        edges = cv2.Canny(gray, 35, 120)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        best_box = None
        best_area = 0
        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            area = cw * ch
            if (w * h * 0.12) <= area <= (w * h * 0.92) and cw >= 180 and ch >= 180:
                roi_std = float(np.std(arr[y:y + ch, x:x + cw]))
                if roi_std > 28.0 and area > best_area:
                    best_area = area
                    best_box = (x, y, x + cw, y + ch)

        if best_box is not None:
            x0, y0, x1, y1 = best_box
            sub_arr = arr[y0:y1, x0:x1]
            sh, sw, _ = sub_arr.shape
            sat = np.max(sub_arr, axis=2) - np.min(sub_arr, axis=2)
            row_sat = np.mean(sat, axis=1)

            r_top = 0
            for r in range(int(sh * 0.25)):
                if row_sat[r] < 12.0:
                    r_top = r + 1
                else:
                    break
            r_bot = sh
            for r in range(sh - 1, int(sh * 0.60), -1):
                if row_sat[r] < 12.0:
                    r_bot = r
                else:
                    break

            if (r_bot - r_top) >= 160:
                return rgb.crop((x0, y0 + r_top, x1, y0 + r_bot)), True
            return rgb.crop(best_box), True

    return rgb, False


# ==============================================================================
# 1. DETECTOR Y SEPARADOR AUTOMÁTICO DE COLLAGES (CON MARGEN Y BORDERLESS)
# ==============================================================================
def _find_true_collage_seams(arr_rgb: np.ndarray, axis: int, min_chunk: int = 160) -> List[Tuple[int, int]]:
    """
    Detecta divisiones de collage a lo largo de `axis` (0 = horizontal, 1 = vertical):
      1) Líneas divisorias sólidas (blancas, negras o de color uniforme de 2 a 45px).
      2) Costuras rectas sin margen (`Borderless Seams`) en proporciones 1/3 + 2/3 o 1/2,
         verificando salto cromático (`mean_diff >= 18.0`), pico sobre mediana local (`>= 2.8x`)
         y nitidez continua a lo largo de la costura (`frac_sharp >= 0.32`).
    """
    arr = arr_rgb.astype(np.float32)
    length = arr.shape[axis]
    if length < min_chunk * 2:
        return [(0, length)]

    other_axis = 1 if axis == 0 else 0
    arr_gray = np.mean(arr, axis=2)
    line_std = np.std(arr_gray, axis=other_axis)

    # 1. Buscar franjas divisorias sólidas (gutters)
    margin = int(length * 0.14)
    is_gutter = np.zeros(length, dtype=bool)
    is_gutter[margin:length - margin] = line_std[margin:length - margin] < 14.5

    splits: List[Tuple[int, int]] = []
    in_gutter = False
    g_start = 0
    last_end = 0
    for i in range(length):
        if is_gutter[i] and not in_gutter:
            in_gutter = True
            g_start = i
        elif not is_gutter[i] and in_gutter:
            in_gutter = False
            g_width = i - g_start
            if 2 <= g_width <= 45 and (g_start - last_end) >= min_chunk:
                splits.append((last_end, g_start))
                last_end = i
    if splits and (length - last_end) >= min_chunk:
        splits.append((last_end, length))
        return splits

    # 2. Buscar costuras rectas sin margen (Borderless Seams: 3x2, 3x1, 2x2, 2x1, 1x2)
    diffs = np.mean(np.abs(np.diff(arr, axis=axis)), axis=2)
    mean_diff = np.mean(diffs, axis=other_axis)

    def is_valid_seam(idx: int) -> Tuple[bool, float]:
        if idx < min_chunk or (length - idx) < min_chunk:
            return False, 0.0
        w_start = max(10, idx - 35)
        w_end = min(length - 10, idx + 35)
        window = np.concatenate([mean_diff[w_start:max(w_start + 1, idx - 3)], mean_diff[min(idx + 4, w_end):w_end]])
        loc_med = float(np.median(window)) + 1e-5
        val = float(mean_diff[idx])
        ratio = val / loc_med

        if axis == 0:
            seam_line = diffs[idx, :]
            prev_line = diffs[max(0, idx - 4), :]
            next_line = diffs[min(diffs.shape[0] - 1, idx + 4), :]
        else:
            seam_line = diffs[:, idx]
            prev_line = diffs[:, max(0, idx - 4)]
            next_line = diffs[:, min(diffs.shape[1] - 1, idx + 4)]

        neighbor_avg = 0.5 * (prev_line + next_line)
        sharp = (seam_line > 10.0) & (seam_line > neighbor_avg * 1.6 + 4.0)
        frac_sharp = float(np.mean(sharp))
        ok = (val >= 18.0) and (ratio >= 2.8) and (frac_sharp >= 0.32)
        return ok, val

    # Probar división en tercios (1/3 y 2/3)
    z1 = range(int(length * 0.30), int(length * 0.37))
    z2 = range(int(length * 0.63), int(length * 0.70))
    if z1 and z2:
        b1 = max(z1, key=lambda i: mean_diff[i])
        b2 = max(z2, key=lambda i: mean_diff[i])
        ok1, _ = is_valid_seam(b1)
        ok2, _ = is_valid_seam(b2)
        if ok1 and ok2 and (b2 - b1) >= min_chunk:
            return [(0, b1), (b1 + 1, b2), (b2 + 1, length)]

    # Probar división a la mitad (1/2)
    zm = range(int(length * 0.45), int(length * 0.55))
    if zm:
        bm = max(zm, key=lambda i: mean_diff[i])
        okm, _ = is_valid_seam(bm)
        if okm:
            return [(0, bm), (bm + 1, length)]

    return [(0, length)]


def separar_collage(img: Image.Image, is_maximus: bool = False) -> List[Image.Image]:
    """
    Separa un collage (horizontal, vertical o cuadrícula 3x2 / 2x2) en fotografías individuales.
    En `captaciones_externas/` (`is_maximus=False`), recorta automáticamente los cintillos de
    texto que suelen colocarse sobre las costuras horizontales (`11%`) y el borde inferior (`8%`).
    """
    rgb = img.convert("RGB")
    arr_rgb = np.array(rgb)
    h, w, _ = arr_rgb.shape

    min_h = max(160, int(h * 0.22))
    min_w = max(160, int(w * 0.22))

    y_ranges = _find_true_collage_seams(arr_rgb, axis=0, min_chunk=min_h)
    sub_images: List[Image.Image] = []
    num_rows = len(y_ranges)

    for r_idx, (y0, y1) in enumerate(y_ranges):
        strip_rgb = arr_rgb[y0:y1, :, :]
        x_ranges = _find_true_collage_seams(strip_rgb, axis=1, min_chunk=min_w)
        for (x0, x1) in x_ranges:
            cy0, cy1 = y0, y1
            sh = cy1 - cy0
            sw = x1 - x0

            # En captaciones externas, si es un collage de múltiples filas, recortar
            # cintillos publicitarios pegados a las costuras horizontales y pie de foto
            if not is_maximus and num_rows > 1 and sh >= 200:
                if r_idx < num_rows - 1:
                    cy1 -= int(sh * 0.11)
                if r_idx > 0:
                    cy0 += int(sh * 0.08)
                if r_idx == num_rows - 1:
                    cy1 -= int(sh * 0.08)

            crop_w = x1 - x0
            crop_h = cy1 - cy0
            aspect = max(crop_w / max(crop_h, 1), crop_h / max(crop_w, 1))
            if crop_w >= 160 and crop_h >= 140 and aspect <= 3.6:
                sub_images.append(rgb.crop((x0, cy0, x1, cy1)))

    return sub_images if len(sub_images) > 1 else [rgb]


# ==============================================================================
# 2. SMART CROP DE MARCAS DE AGUA (ACTIVO SOLO EN CAPTACIONES EXTERNAS)
# ==============================================================================
def detectar_perfil_inmobiliaria(texto_anuncio: str) -> Dict[str, float]:
    t = (texto_anuncio or "").lower()
    for key, params in PERFILES_MARCA_AGUA.items():
        if key != "default" and key in t:
            return params
    return PERFILES_MARCA_AGUA["default"]


def smart_crop_watermark(
    img: Image.Image,
    extra_top_crop: float = 0.0,
    extra_bottom_crop: float = 0.0,
    texto_anuncio: str = "",
    from_collage: bool = False,
) -> Tuple[Image.Image, bool]:
    rgb = img.convert("RGB")
    gray = np.array(rgb.convert("L"))
    h, w = gray.shape

    if h < 140 or w < 140:
        return rgb, False

    row_std = np.std(gray, axis=1)

    top_cut = 0
    for y in range(int(h * 0.14)):
        if row_std[y] < 20.0:
            top_cut = y + 1
        else:
            break

    bottom_cut = h
    for y in range(h - 1, int(h * 0.85), -1):
        if row_std[y] < 22.0:
            bottom_cut = y
        else:
            break

    row_diffs = np.mean(np.abs(np.diff(gray.astype(np.float32), axis=0)), axis=1)
    for y in range(int(h * 0.86), h - 8):
        if row_diffs[y] > 32.0 and np.median(row_std[y + 2:]) < 36.0:
            bottom_cut = min(bottom_cut, y)
            break

    perfil = detectar_perfil_inmobiliaria(texto_anuncio)
    # Si ya se recortaron las costuras en `separar_collage`, aplicar un recorte adicional suave
    factor_collage = 0.4 if from_collage else 1.0
    min_top_px = int(h * max(extra_top_crop, perfil["top_crop"] * factor_collage))
    min_bot_px = int(h * max(extra_bottom_crop, perfil["bottom_crop"] * factor_collage))

    final_top = max(top_cut, min_top_px)
    final_bottom = min(bottom_cut, h - min_bot_px)

    if final_bottom - final_top < int(h * 0.72):
        final_top = min_top_px
        final_bottom = h - min_bot_px

    col_std = np.std(gray[final_top:final_bottom, :], axis=0)
    left_cut = 0
    for x in range(int(w * 0.04)):
        if col_std[x] < 16.0:
            left_cut = x + 1
        else:
            break
    right_cut = w
    for x in range(w - 1, int(w * 0.96), -1):
        if col_std[x] < 16.0:
            right_cut = x
        else:
            break

    fue_recortada = (final_top > 2) or (final_bottom < h - 2) or (left_cut > 2) or (right_cut < w - 2) or from_collage
    cropped = rgb.crop((left_cut, final_top, right_cut, final_bottom))
    return cropped, fue_recortada


# ==============================================================================
# 3. UPLOAD A SUPABASE STORAGE (`inmuebles-fotos`)
# ==============================================================================
def upload_to_supabase_storage(
    img_path: Path,
    storage_rel_path: str,
    sb_url: str,
    sb_key: str,
    bucket: str = "inmuebles-fotos",
) -> Tuple[Optional[str], Optional[str]]:
    upload_url = f"{sb_url}/storage/v1/object/{bucket}/{storage_rel_path}"
    public_url = f"{sb_url}/storage/v1/object/public/{bucket}/{storage_rel_path}"

    file_bytes = img_path.read_bytes()
    req = urllib.request.Request(
        upload_url,
        data=file_bytes,
        headers={
            "apikey": sb_key,
            "Authorization": f"Bearer {sb_key}",
            "Content-Type": "image/jpeg",
            "x-upsert": "true",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=30) as resp:
            if 200 <= resp.status < 300:
                return public_url, None
            return None, f"HTTP {resp.status}"
    except urllib.error.HTTPError as e:
        err_body = e.read().decode("utf-8", errors="replace")
        return None, f"HTTPError {e.code}: {err_body}"
    except Exception as e:
        return None, str(e)


def evaluar_calidad_portada(img_path: Path) -> float:
    """
    Evalúa la idoneidad estética y comercial de una fotografía para ser la portada principal
    (foto_principal y fotos[0]) del inmueble en las tarjetas del portal y dashboard MAXIMUS:
      1. Preferencia por Collage/Flyer Completo: Si el archivo es un collage/flyer (_collage.jpg),
         recibe fuerte bonificación (+65 pts) porque presenta la composición completa diseñada por el corredor.
      2. Aspect Ratio (Tarjetas web horizontales 16:9 / 4:3):
         - Apaisado óptimo (1.25 <= ratio <= 1.85): +35 pts
         - Cuadrado aceptable (0.95 <= ratio < 1.25): +15 pts
         - Tiras verticales angostas (ratio < 0.85): -75 pts (¡Evita zanjas o cercas cortadas vistas en portada!)
         - Panorámicas extremas (ratio > 2.3): -30 pts
      3. Resolución y nitidez:
         - Alta resolución (w >= 700 y h >= 500): +25 pts
         - Mediana resolución (w >= 550 y h >= 400): +15 pts
         - Baja resolución / recortes pequeños (w < 380 o h < 380): -40 pts
      4. Luminancia y riqueza cromática:
         - Luminancia balanceada (0.32 <= luma <= 0.78): +15 pts
         - Oscura o sobreexpuesta (luma < 0.20 o luma > 0.88): -30 pts
         - Variedad de color (std_color > 35): +15 pts (premia fachadas/espacios sobre paredes lisas monocromáticas)
    """
    try:
        name_lower = img_path.name.lower()
        with Image.open(img_path) as im:
            w, h = im.size
            if w <= 0 or h <= 0:
                return 0.0
            ratio = w / float(h)
            score = 50.0

            # 1. Regla del Usuario: Prioridad al collage/flyer publicitario si existe
            if "_collage" in name_lower or "collage" in name_lower:
                score += 65.0

            # 2. Relación de aspecto
            if 1.25 <= ratio <= 1.85:
                score += 35.0
            elif 0.95 <= ratio < 1.25:
                score += 15.0
            elif ratio < 0.85:
                score -= 75.0
            elif ratio > 2.3:
                score -= 30.0

            # 3. Resolución
            if w >= 700 and h >= 500:
                score += 25.0
            elif w >= 550 and h >= 400:
                score += 15.0
            elif w < 380 or h < 380:
                score -= 40.0

            # 4. Luminancia y varianza de color
            stat = ImageStat.Stat(im.convert("RGB"))
            mean_luma = sum(stat.mean) / 3.0 / 255.0
            mean_std = sum(stat.stddev) / 3.0

            if 0.32 <= mean_luma <= 0.78:
                score += 15.0
            elif mean_luma < 0.20 or mean_luma > 0.88:
                score -= 30.0

            if mean_std > 35.0:
                score += 15.0
            elif mean_std < 18.0:
                score -= 25.0

            return max(score, 0.0)
    except Exception:
        return 0.0


def procesar_imagenes_lote(
    lote_dir: Path,
    repo_root: Path,
    extra_top_crop: float = 0.0,
    extra_bottom_crop: float = 0.0,
    skip_upload: bool = False,
) -> Dict[str, Any]:
    if not lote_dir.exists():
        alt1 = repo_root / "agente_whatsapp" / "proyectos" / "captaciones_externas" / lote_dir.name
        alt2 = repo_root / "agente_whatsapp" / "proyectos" / "captaciones_maximus" / lote_dir.name
        if alt1.exists():
            lote_dir = alt1
        elif alt2.exists():
            lote_dir = alt2
        else:
            raise FileNotFoundError(f"No existe el directorio del lote: {lote_dir}")

    procesados_dir = lote_dir / "procesados"
    dedup_json = procesados_dir / "inmuebles_deduplicados.json"
    extraidos_json = procesados_dir / "inmuebles_extraidos.json"

    target_json = dedup_json if dedup_json.exists() else extraidos_json
    if not target_json.exists():
        raise FileNotFoundError(f"No se encontró archivo de inmuebles en {procesados_dir}")

    payload = json.loads(target_json.read_text(encoding="utf-8"))
    key_list = "unicos_verificados" if "unicos_verificados" in payload else "inmuebles"
    inmuebles = payload.get(key_list, [])

    ruta_lote_str = str(lote_dir.resolve()).lower().replace("\\", "/")
    es_lote_maximus = ("captaciones_maximus" in ruta_lote_str) or bool(payload.get("is_maximus_default", False))

    sb_url, sb_key, bucket = load_supabase_config(repo_root)
    clean_base_dir = procesados_dir / "imagenes_limpias"
    clean_base_dir.mkdir(parents=True, exist_ok=True)
    lote_folder_clean = re.sub(r"[^a-zA-Z0-9_\-]", "_", lote_dir.name)

    estadisticas_imagenes = {
        "flujo_carpeta": "captaciones_maximus" if es_lote_maximus else "captaciones_externas",
        "smart_crop_marcas_agua_activo": not es_lote_maximus,
        "total_imagenes_originales": 0,
        "total_screenshots_recortados": 0,
        "total_collages_divididos": 0,
        "total_imagenes_individuales_generadas": 0,
        "total_marcas_agua_recortadas": 0,
        "total_subidas_supabase_storage": 0,
        "detalle_por_inmueble": [],
    }

    for inm in inmuebles:
        temp_id = inm.get("temp_id", "INM")
        inm_is_maximus = bool(inm.get("is_maximus", es_lote_maximus))
        son_screenshots = bool(inm.get("imagenes_son_screenshots", False)) or (inm.get("modo_entrada") == "modo_2_screenshot_whatsapp")

        inm_clean_dir = clean_base_dir / temp_id
        inm_clean_dir.mkdir(parents=True, exist_ok=True)
        # Limpiar imágenes viejas en la carpeta del candidato antes de regenerar
        for old_f in inm_clean_dir.glob("*.jpg"):
            try:
                old_f.unlink()
            except Exception:
                pass

        orig_paths = [Path(p) for p in inm.get("imagenes_locales", []) if Path(p).exists()]
        estadisticas_imagenes["total_imagenes_originales"] += len(orig_paths)

        urls_publicas: List[str] = []
        rutas_limpias_locales: List[str] = []
        collages_en_inm = 0
        recortes_en_inm = 0
        screenshots_en_inm = 0

        for orig_p in orig_paths:
            try:
                img_orig = Image.open(orig_p)
                img_orig = ImageOps.exif_transpose(img_orig)
            except Exception as e:
                print(f"[WARN] No se pudo abrir imagen {orig_p}: {e}")
                continue

            es_nombre_screenshot = bool(re.search(r"(screenshot|captura|whatsapp\s*web|screen)", orig_p.stem, re.I))
            if son_screenshots or es_nombre_screenshot:
                img_orig, recorte_sc = extraer_foto_de_screenshot_whatsapp(img_orig)
                if recorte_sc:
                    screenshots_en_inm += 1
                    estadisticas_imagenes["total_screenshots_recortados"] += 1

            # Paso A: Separar collage (con margen o borderless 3x2, 3x1, 2x2, 2x1)
            partes = separar_collage(img_orig, is_maximus=inm_is_maximus)
            es_collage = len(partes) > 1
            if es_collage:
                collages_en_inm += 1
                estadisticas_imagenes["total_collages_divididos"] += 1

            for idx_part, sub_img in enumerate(partes, start=1):
                if not inm_is_maximus:
                    limpia_img, fue_recortada = smart_crop_watermark(
                        sub_img,
                        extra_top_crop=extra_top_crop,
                        extra_bottom_crop=extra_bottom_crop,
                        texto_anuncio=inm.get("texto_original", ""),
                        from_collage=es_collage,
                    )
                    if fue_recortada:
                        recortes_en_inm += 1
                        estadisticas_imagenes["total_marcas_agua_recortadas"] += 1
                    jpg_quality = 92
                else:
                    limpia_img = sub_img.convert("RGB")
                    jpg_quality = 95

                stem_clean = re.sub(r"[^a-zA-Z0-9_\-]", "_", orig_p.stem)
                out_filename = f"{stem_clean}_{idx_part:02d}.jpg" if es_collage else f"{stem_clean}_01.jpg"

                out_path = inm_clean_dir / out_filename
                limpia_img.save(out_path, format="JPEG", quality=jpg_quality, optimize=True)
                rutas_limpias_locales.append(str(out_path))
                estadisticas_imagenes["total_imagenes_individuales_generadas"] += 1

                carpeta_flujo = "maximus" if inm_is_maximus else "externas"
                storage_rel = f"whatsapp/{carpeta_flujo}/{lote_folder_clean}/{temp_id}/{out_filename}"
                if not skip_upload:
                    pub_url, err = upload_to_supabase_storage(out_path, storage_rel, sb_url, sb_key, bucket)
                    if pub_url:
                        urls_publicas.append(pub_url)
                        estadisticas_imagenes["total_subidas_supabase_storage"] += 1
                    else:
                        print(f"[WARN] Falló subida a Storage para {out_filename}: {err}")
                        urls_publicas.append(f"{sb_url}/storage/v1/object/public/{bucket}/{storage_rel}")
                else:
                    urls_publicas.append(f"{sb_url}/storage/v1/object/public/{bucket}/{storage_rel}")

            # Si era un collage, conservar y subir TAMBIÉN el collage completo además de las fotos cortadas
            if es_collage:
                stem_clean = re.sub(r"[^a-zA-Z0-9_\-]", "_", orig_p.stem)
                collage_filename = f"{stem_clean}_collage.jpg"
                collage_path = inm_clean_dir / collage_filename
                img_orig.convert("RGB").save(collage_path, format="JPEG", quality=93, optimize=True)
                rutas_limpias_locales.append(str(collage_path))
                estadisticas_imagenes["total_imagenes_individuales_generadas"] += 1

                carpeta_flujo = "maximus" if inm_is_maximus else "externas"
                storage_rel_col = f"whatsapp/{carpeta_flujo}/{lote_folder_clean}/{temp_id}/{collage_filename}"
                if not skip_upload:
                    pub_url_col, err_col = upload_to_supabase_storage(collage_path, storage_rel_col, sb_url, sb_key, bucket)
                    if pub_url_col:
                        urls_publicas.append(pub_url_col)
                        estadisticas_imagenes["total_subidas_supabase_storage"] += 1
                    else:
                        print(f"[WARN] Falló subida a Storage para {collage_filename}: {err_col}")
                        urls_publicas.append(f"{sb_url}/storage/v1/object/public/{bucket}/{storage_rel_col}")
                else:
                    urls_publicas.append(f"{sb_url}/storage/v1/object/public/{bucket}/{storage_rel_col}")

        # Selector Inteligente de Foto de Portada (Mejor imagen para foto_principal y fotos[0])
        if rutas_limpias_locales and urls_publicas:
            pares = list(zip(rutas_limpias_locales, urls_publicas))
            puntuados = []
            for r_local, r_url in pares:
                sc = evaluar_calidad_portada(Path(r_local))
                puntuados.append((sc, r_local, r_url))
            puntuados.sort(key=lambda x: x[0], reverse=True)
            mejor_score, mejor_local, mejor_url = puntuados[0]

            otras_locales = [x[1] for x in puntuados if x[1] != mejor_local]
            otras_urls = [x[2] for x in puntuados if x[2] != mejor_url]

            rutas_limpias_locales = [mejor_local] + otras_locales
            urls_publicas = [mejor_url] + otras_urls
            inm["foto_principal"] = mejor_url
        else:
            inm["foto_principal"] = urls_publicas[0] if urls_publicas else ""

        inm["imagenes_limpias_locales"] = rutas_limpias_locales
        inm["fotos"] = urls_publicas
        inm["fotos_coma_str"] = ", ".join(urls_publicas)
        inm["stats_imagenes"] = {
            "originales": len(orig_paths),
            "screenshots_extraidos": screenshots_en_inm,
            "collages_divididos": collages_en_inm,
            "fotos_finales": len(rutas_limpias_locales),
            "marcas_agua_recortadas": recortes_en_inm,
        }

        estadisticas_imagenes["detalle_por_inmueble"].append({
            "temp_id": temp_id,
            "titulo": inm.get("titulo"),
            **inm["stats_imagenes"],
        })

    payload["estadisticas_imagenes"] = estadisticas_imagenes
    payload["fecha_limpieza_imagenes"] = datetime.now().isoformat()
    target_json.write_text(json.dumps(payload, indent=2, ensure_ascii=False), encoding="utf-8")

    return estadisticas_imagenes


def main():
    parser = argparse.ArgumentParser(description="Skill 3: Extractor de Screenshots, Separador de Collages, Smart Crop y Upload")
    parser.add_argument("--lote", required=True, help="Ruta a la carpeta del lote")
    parser.add_argument("--extra-top-crop", type=float, default=0.0, help="Porcentaje adicional de recorte superior (solo externas)")
    parser.add_argument("--extra-bottom-crop", type=float, default=0.0, help="Porcentaje adicional de recorte inferior (solo externas)")
    parser.add_argument("--skip-upload", action="store_true", help="Procesar localmente sin subir a Supabase Storage")
    args = parser.parse_args()

    lote_dir = Path(args.lote).resolve()
    repo_root = Path(__file__).resolve().parents[4]
    stats = procesar_imagenes_lote(
        lote_dir=lote_dir,
        repo_root=repo_root,
        extra_top_crop=args.extra_top_crop,
        extra_bottom_crop=args.extra_bottom_crop,
        skip_upload=args.skip_upload,
    )
    print(
        f"[OK] Limpieza de imágenes completada ({stats['flujo_carpeta']} | SmartCrop={stats['smart_crop_marcas_agua_activo']}):\n"
        f"  - Imágenes originales analizadas: {stats['total_imagenes_originales']}\n"
        f"  - Capturas WhatsApp Web recortadas: {stats['total_screenshots_recortados']}\n"
        f"  - Collages detectados y divididos: {stats['total_collages_divididos']}\n"
        f"  - Fotografías individuales generadas: {stats['total_imagenes_individuales_generadas']}\n"
        f"  - Marcas de agua recortadas: {stats['total_marcas_agua_recortadas']}\n"
        f"  - Imágenes subidas a Supabase Storage: {stats['total_subidas_supabase_storage']}"
    )


if __name__ == "__main__":
    main()
