#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAXIMUS Inmobiliaria - Skill 3: property-image-cleaner (Dual-Flow & Screenshot Extractor)
=========================================================================================
Limpia y procesa las imágenes de WhatsApp:
  1. Extractor de Fotografía desde Captura de Pantalla de WhatsApp Web (Modo 2):
     Si la imagen es un screenshot de WhatsApp Web (con burbuja de chat, teléfono arriba,
     foto en medio y descripción abajo), recorta primero únicamente el recuadro de la
     fotografía del inmueble eliminando el fondo de WhatsApp y el texto de la burbuja.
  2. Separador Automático de Collages (vertical, horizontal y cuadrícula 2x2):
     Detecta líneas rectas divisorias o saltos bruscos de borde y separa en imágenes
     individuales numeradas (_01.jpg, _02.jpg, _03.jpg).
  3. Comportamiento Diferenciado por Carpeta:
     - `captaciones_externas/` -> Ejecuta SIEMPRE Smart Crop para recortar marcas de agua,
       logos y cintillos de otras inmobiliarias.
     - `captaciones_maximus/`  -> NO recorta bordes de marcas de agua (Smart Crop = OFF),
       conservando las fotos oficiales de MAXIMUS en máxima calidad (JPEG quality=95).
  4. Upload a Supabase Storage (`inmuebles-fotos`) y generación de URLs separadas por coma.
"""

import os
import re
import json
import argparse
import urllib.request
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Tuple, Optional

try:
    from PIL import Image, ImageOps
    import numpy as np
except ImportError as e:
    raise RuntimeError("Se requiere Pillow y numpy instalados (pip install Pillow numpy opencv-python).") from e

try:
    import cv2
    HAS_CV2 = True
except ImportError:
    HAS_CV2 = False


PERFILES_MARCA_AGUA = {
    "remax": {"top_crop": 0.02, "bottom_crop": 0.10},
    "century21": {"top_crop": 0.02, "bottom_crop": 0.11},
    "c21": {"top_crop": 0.02, "bottom_crop": 0.11},
    "cuspide": {"top_crop": 0.06, "bottom_crop": 0.08},
    "default": {"top_crop": 0.00, "bottom_crop": 0.04},
}


def load_supabase_config(repo_root: Path) -> Tuple[str, str, str]:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")
    bucket = os.environ.get("SUPABASE_STORAGE_BUCKET", "inmuebles-fotos")

    config_js = repo_root / "js" / "config.js"
    if config_js.exists():
        content = config_js.read_text(encoding="utf-8", errors="replace")
        if not url:
            m_url = re.search(r"SUPABASE_URL\s*:\s*['\"]([^'\"]+)['\"]", content)
            if m_url:
                url = m_url.group(1).rstrip("/")
        if not key:
            m_key = re.search(r"SUPABASE_ANON_KEY\s*:\s*['\"]([^'\"]+)['\"]", content)
            if m_key:
                key = m_key.group(1).strip()
        m_b = re.search(r"STORAGE_BUCKET\s*:\s*['\"]([^'\"]+)['\"]", content)
        if m_b:
            bucket = m_b.group(1).strip()

    if not url or not key:
        raise RuntimeError("No se encontraron credenciales de Supabase en js/config.js.")
    return url, key, bucket


# ==============================================================================
# 0. MODO 2: EXTRACTOR DEL RECUADRO FOTOGRÁFICO DESDE SCREENSHOT DE WHATSAPP WEB
# ==============================================================================
def extraer_foto_de_screenshot_whatsapp(img: Image.Image) -> Tuple[Image.Image, bool]:
    """
    Recibe una captura de pantalla completa de WhatsApp Web (donde se ve el fondo
    del chat, la burbuja con el teléfono arriba, la foto en medio y el texto abajo)
    y recorta únicamente el recuadro interior de la fotografía del inmueble.
    """
    rgb = img.convert("RGB")
    arr = np.array(rgb)
    h, w, _ = arr.shape

    if HAS_CV2:
        gray = cv2.cvtColor(arr, cv2.COLOR_RGB2GRAY)
        # En WhatsApp Web (modo claro o modo oscuro), el fondo de chat y la burbuja de texto
        # tienen baja varianza local en comparación con la riqueza cromática de la foto del inmueble.
        edges = cv2.Canny(gray, 35, 120)
        kernel = cv2.getStructuringElement(cv2.MORPH_RECT, (11, 11))
        closed = cv2.morphologyEx(edges, cv2.MORPH_CLOSE, kernel)
        contours, _ = cv2.findContours(closed, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        best_box = None
        best_area = 0
        for cnt in contours:
            x, y, cw, ch = cv2.boundingRect(cnt)
            area = cw * ch
            # El recuadro de la fotografía debe ocupar al menos 15% de la captura y no ser toda la pantalla
            if (w * h * 0.12) <= area <= (w * h * 0.92) and cw >= 180 and ch >= 180:
                roi_std = float(np.std(arr[y:y + ch, x:x + cw]))
                if roi_std > 28.0 and area > best_area:
                    best_area = area
                    best_box = (x, y, x + cw, y + ch)

        if best_box is not None:
            x0, y0, x1, y1 = best_box
            # Refinar verticalmente para excluir el encabezado del teléfono (arriba) y el bloque de texto (abajo)
            sub_arr = arr[y0:y1, x0:x1]
            sh, sw, _ = sub_arr.shape
            # Calcular saturación y desviación por fila: el texto sobre fondo blanco/oscuro tiene menor saturación media
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

    # Heurística NumPy pura si OpenCV no está instalado:
    # Detectar la ventana rectangular con mayor saturación y varianza cromática
    sat = np.max(arr, axis=2).astype(np.float32) - np.min(arr, axis=2).astype(np.float32)
    row_score = np.mean(sat, axis=1) + np.std(arr.mean(axis=2), axis=1) * 0.5
    col_score = np.mean(sat, axis=0) + np.std(arr.mean(axis=2), axis=0) * 0.5

    active_rows = np.where(row_score > 22.0)[0]
    active_cols = np.where(col_score > 22.0)[0]

    if len(active_rows) > 160 and len(active_cols) > 160:
        y0, y1 = int(active_rows[0]), int(active_rows[-1])
        x0, x1 = int(active_cols[0]), int(active_cols[-1])
        if (y1 - y0) >= 160 and (x1 - x0) >= 160 and ((y1 - y0) < h * 0.96 or (x1 - x0) < w * 0.96):
            return rgb.crop((x0, y0, x1, y1)), True

    return rgb, False


# ==============================================================================
# 1. DETECTOR Y SEPARADOR AUTOMÁTICO DE COLLAGES
# ==============================================================================
def _find_gutter_splits(arr_gray: np.ndarray, axis: int, min_chunk: int = 200) -> List[Tuple[int, int]]:
    length = arr_gray.shape[axis]
    if length < min_chunk * 2:
        return [(0, length)]

    line_std = np.std(arr_gray, axis=(1 if axis == 0 else 0))
    margin = int(length * 0.14)
    is_gutter = np.zeros(length, dtype=bool)
    is_gutter[margin:length - margin] = line_std[margin:length - margin] < 14.5

    splits = []
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

    if splits:
        if (length - last_end) >= min_chunk:
            splits.append((last_end, length))
            return splits

    row_diffs = np.mean(np.abs(np.diff(arr_gray.astype(np.float32), axis=axis)), axis=(1 if axis == 0 else 0))
    median_diff = float(np.median(row_diffs)) + 1e-5

    mid_zone = range(int(length * 0.47), int(length * 0.53))
    best_mid = max(mid_zone, key=lambda idx: row_diffs[idx]) if mid_zone else None
    if best_mid and row_diffs[best_mid] > max(38.0, median_diff * 4.2) and (best_mid >= min_chunk) and (length - best_mid >= min_chunk):
        return [(0, best_mid), (best_mid + 1, length)]

    return [(0, length)]


def separar_collage(img: Image.Image) -> List[Image.Image]:
    rgb = img.convert("RGB")
    arr_gray = np.array(rgb.convert("L"))
    h, w = arr_gray.shape

    min_h = max(180, int(h * 0.22))
    min_w = max(180, int(w * 0.22))

    y_ranges = _find_gutter_splits(arr_gray, axis=0, min_chunk=min_h)
    sub_images: List[Image.Image] = []

    for (y0, y1) in y_ranges:
        strip_gray = arr_gray[y0:y1, :]
        x_ranges = _find_gutter_splits(strip_gray, axis=1, min_chunk=min_w)
        for (x0, x1) in x_ranges:
            crop_w = x1 - x0
            crop_h = y1 - y0
            aspect = max(crop_w / max(crop_h, 1), crop_h / max(crop_w, 1))
            if crop_w >= 180 and crop_h >= 180 and aspect <= 3.6:
                sub_images.append(rgb.crop((x0, y0, x1, y1)))

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
) -> Tuple[Image.Image, bool]:
    rgb = img.convert("RGB")
    gray = np.array(rgb.convert("L"))
    h, w = gray.shape

    if h < 160 or w < 160:
        return rgb, False

    row_std = np.std(gray, axis=1)

    top_cut = 0
    for y in range(int(h * 0.15)):
        if row_std[y] < 22.0:
            top_cut = y + 1
        else:
            break

    bottom_cut = h
    for y in range(h - 1, int(h * 0.84), -1):
        if row_std[y] < 24.0:
            bottom_cut = y
        else:
            break

    row_diffs = np.mean(np.abs(np.diff(gray.astype(np.float32), axis=0)), axis=1)
    for y in range(int(h * 0.85), h - 10):
        if row_diffs[y] > 32.0 and np.median(row_std[y + 2:]) < 38.0:
            bottom_cut = min(bottom_cut, y)
            break

    perfil = detectar_perfil_inmobiliaria(texto_anuncio)
    min_top_px = int(h * max(extra_top_crop, perfil["top_crop"]))
    min_bot_px = int(h * max(extra_bottom_crop, perfil["bottom_crop"]))

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

    fue_recortada = (final_top > 2) or (final_bottom < h - 2) or (left_cut > 2) or (right_cut < w - 2)
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


def procesar_imagenes_lote(
    lote_dir: Path,
    repo_root: Path,
    extra_top_crop: float = 0.0,
    extra_bottom_crop: float = 0.0,
    skip_upload: bool = False,
) -> Dict[str, Any]:
    procesados_dir = lote_dir / "procesados"
    dedup_json = procesados_dir / "inmuebles_deduplicados.json"
    extraidos_json = procesados_dir / "inmuebles_extraidos.json"

    target_json = dedup_json if dedup_json.exists() else extraidos_json
    if not target_json.exists():
        raise FileNotFoundError(f"No se encontró archivo de inmuebles en {procesados_dir}")

    payload = json.loads(target_json.read_text(encoding="utf-8"))
    key_list = "unicos_verificados" if "unicos_verificados" in payload else "inmuebles"
    inmuebles = payload.get(key_list, [])

    # Detectar si el lote pertenece a `captaciones_maximus/`
    ruta_lote_str = str(lote_dir.resolve()).lower().replace("\\", "/")
    es_lote_maximus = ("captaciones_maximus" in ruta_lote_str) or bool(payload.get("is_maximus_default", False))

    sb_url, sb_key, bucket = load_supabase_config(repo_root)
    clean_base_dir = procesados_dir / "imagenes_limpias"
    clean_base_dir.mkdir(parents=True, exist_ok=True)

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

            # Paso 0 (Modo 2): Si es una captura de pantalla de WhatsApp Web, recortar primero el recuadro de la fotografía
            es_nombre_screenshot = bool(re.search(r"(screenshot|captura|whatsapp\s*web|screen)", orig_p.stem, re.I))
            if son_screenshots or es_nombre_screenshot:
                img_orig, recorte_sc = extraer_foto_de_screenshot_whatsapp(img_orig)
                if recorte_sc:
                    screenshots_en_inm += 1
                    estadisticas_imagenes["total_screenshots_recortados"] += 1

            # Paso A: Separar collage si contiene múltiples fotos
            partes = separar_collage(img_orig)
            es_collage = len(partes) > 1
            if es_collage:
                collages_en_inm += 1
                estadisticas_imagenes["total_collages_divididos"] += 1

            for idx_part, sub_img in enumerate(partes, start=1):
                # Paso B: Comportamiento diferenciado según carpeta:
                # - En `captaciones_externas/` (inm_is_maximus == False): ejecutar SIEMPRE Smart Crop de marcas de agua
                # - En `captaciones_maximus/`  (inm_is_maximus == True):  NO recortar bordes de marcas de agua
                if not inm_is_maximus:
                    limpia_img, fue_recortada = smart_crop_watermark(
                        sub_img,
                        extra_top_crop=extra_top_crop,
                        extra_bottom_crop=extra_bottom_crop,
                        texto_anuncio=inm.get("texto_original", ""),
                    )
                    if fue_recortada:
                        recortes_en_inm += 1
                        estadisticas_imagenes["total_marcas_agua_recortadas"] += 1
                    jpg_quality = 90
                else:
                    limpia_img = sub_img.convert("RGB")
                    jpg_quality = 95  # Máxima calidad para Captaciones Directas MAXIMUS

                stem_clean = re.sub(r"[^a-zA-Z0-9_\-]", "_", orig_p.stem)
                out_filename = f"{stem_clean}_{idx_part:02d}.jpg" if es_collage else f"{stem_clean}_01.jpg"

                out_path = inm_clean_dir / out_filename
                limpia_img.save(out_path, format="JPEG", quality=jpg_quality, optimize=True)
                rutas_limpias_locales.append(str(out_path))
                estadisticas_imagenes["total_imagenes_individuales_generadas"] += 1

                # Paso C: Subir a Supabase Storage
                carpeta_flujo = "maximus" if inm_is_maximus else "externas"
                storage_rel = f"whatsapp/{carpeta_flujo}/{lote_dir.name}/{temp_id}/{out_filename}"
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

        inm["imagenes_limpias_locales"] = rutas_limpias_locales
        inm["fotos"] = urls_publicas
        inm["foto_principal"] = urls_publicas[0] if urls_publicas else "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=85"
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
