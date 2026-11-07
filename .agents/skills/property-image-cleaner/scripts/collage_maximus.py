#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAXIMUS Inmobiliaria - Plantillas de Collage de Portada (foto_principal)
========================================================================
Genera la imagen principal de cada inmueble como un collage con la identidad MAXIMUS
(logo cromado, paleta verde/esmeralda/plata, tipografía Montserrat).

Un único diseño base "Editorial MAXIMUS" (1600x1000, 16:10 = tarjetas del catálogo
`h-60 object-cover`): panel lateral verde con logo, etiqueta de operación, título, ubicación,
características y precio; a la derecha foto héroe + 2 miniaturas. Las dos variantes siguen
la misma línea y solo cambian sus acentos:
  - ALQUILER -> pastilla esmeralda "EN ALQUILER", "CANON MENSUAL", "USD / mes".
  - VENTA    -> pastilla plata "EN VENTA", "PRECIO DE VENTA", "USD".

Uso como módulo (pipeline `clean_images.py`):
    from collage_maximus import generar_portada, seleccionar_fotos_collage
    fotos = seleccionar_fotos_collage(lista_paths_ordenados_por_score)
    img = generar_portada(fotos, inmueble_dict)          # elige plantilla por `operacion`

Uso por CLI (pruebas del equipo):
    python collage_maximus.py --fotos a.jpg b.jpg c.jpg --operacion venta \
        --titulo "Casa en Pirineos" --ubicacion "Pirineos, San Cristóbal" --precio 260000 \
        --habitaciones 4 --banos 3 --m2 220 --puestos 2 --codigo "#MAX-300" --out portada.jpg
"""

import json
import argparse
from functools import lru_cache
from pathlib import Path
from typing import Any, Dict, List, Optional, Sequence, Tuple, Union

import numpy as np
from PIL import Image, ImageDraw, ImageFilter, ImageFont, ImageOps

SKILL_DIR = Path(__file__).resolve().parents[1]
ASSETS_DIR = SKILL_DIR / "assets"
CONFIG_PATH = SKILL_DIR / "references" / "plantillas_collage.json"
FONT_PATH = ASSETS_DIR / "fonts" / "Montserrat-Variable.ttf"
LOGO_PATH = ASSETS_DIR / "logo_maximus_icono_collage.png"

FALLBACK_FONTS = [
    "C:/Windows/Fonts/segoeuib.ttf",
    "C:/Windows/Fonts/arialbd.ttf",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
    "DejaVuSans-Bold.ttf",
]

PathLike = Union[str, Path]


# ==============================================================================
# Configuración, colores y tipografía
# ==============================================================================
@lru_cache(maxsize=1)
def cargar_config() -> Dict[str, Any]:
    return json.loads(CONFIG_PATH.read_text(encoding="utf-8"))


def _hex(c: str, alpha: int = 255) -> Tuple[int, int, int, int]:
    c = c.lstrip("#")
    return (int(c[0:2], 16), int(c[2:4], 16), int(c[4:6], 16), alpha)


def color(nombre: str, alpha: int = 255) -> Tuple[int, int, int, int]:
    return _hex(cargar_config()["paleta"][nombre], alpha)


@lru_cache(maxsize=64)
def fuente(size: int, peso: str = "Bold") -> ImageFont.FreeTypeFont:
    """Montserrat (variable) con el peso pedido; si no existe, cae a Segoe/Arial/DejaVu."""
    if FONT_PATH.exists():
        f = ImageFont.truetype(str(FONT_PATH), size)
        try:
            f.set_variation_by_name(peso)
        except Exception:
            pass
        return f
    for fb in FALLBACK_FONTS:
        try:
            return ImageFont.truetype(fb, size)
        except Exception:
            continue
    return ImageFont.load_default()


def _ancho(draw: ImageDraw.ImageDraw, texto: str, f: ImageFont.FreeTypeFont, tracking: int = 0) -> int:
    if not texto:
        return 0
    return int(draw.textlength(texto, font=f)) + tracking * (len(texto) - 1)


def _texto(draw, xy, texto, f, fill, tracking: int = 0, anchor: str = "la") -> int:
    """Dibuja texto con espaciado entre letras opcional. Devuelve el ancho dibujado."""
    x, y = xy
    if tracking == 0:
        draw.text((x, y), texto, font=f, fill=fill, anchor=anchor)
        return _ancho(draw, texto, f)
    for ch in texto:
        draw.text((x, y), ch, font=f, fill=fill, anchor=anchor)
        x += draw.textlength(ch, font=f) + tracking
    return int(x - xy[0] - tracking)


def _ajustar_lineas(draw, texto: str, peso: str, max_w: int, size_max: int, size_min: int,
                    max_lineas: int) -> Tuple[ImageFont.FreeTypeFont, List[str]]:
    """Reduce el tamaño hasta que el texto quepa en `max_lineas`; si no cabe, recorta con '…'."""
    palabras = (texto or "").split()
    for size in range(size_max, size_min - 1, -2):
        f = fuente(size, peso)
        lineas, actual = [], ""
        for p in palabras:
            prueba = f"{actual} {p}".strip()
            if _ancho(draw, prueba, f) <= max_w:
                actual = prueba
            else:
                if actual:
                    lineas.append(actual)
                actual = p
        if actual:
            lineas.append(actual)
        if len(lineas) <= max_lineas and all(_ancho(draw, ln, f) <= max_w for ln in lineas):
            return f, lineas
    f = fuente(size_min, peso)
    lineas = lineas[:max_lineas]
    ultima = lineas[-1]
    while ultima and _ancho(draw, ultima + "…", f) > max_w:
        ultima = ultima[:-1]
    lineas[-1] = ultima.rstrip() + "…"
    return f, lineas


# ==============================================================================
# Primitivas gráficas
# ==============================================================================
def _gradiente(size: Tuple[int, int], c1, c2, diagonal: bool = False) -> Image.Image:
    w, h = size
    base = Image.new("RGBA", (w, h), c1)
    top = Image.new("RGBA", (w, h), c2)
    if diagonal:
        xs = np.linspace(0.0, 1.0, w, dtype=np.float32)[None, :]
        ys = np.linspace(0.0, 1.0, h, dtype=np.float32)[:, None]
        t = (xs * 0.35 + ys * 0.65)
        mask = Image.fromarray((t / t.max() * 255).astype(np.uint8), "L")
    else:
        mask = Image.linear_gradient("L").resize((w, h))
    return Image.composite(top, base, mask)


def _brillo_radial(canvas: Image.Image, centro, radio: int, c, alpha: int) -> None:
    capa = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    d = ImageDraw.Draw(capa)
    cx, cy = centro
    d.ellipse((cx - radio, cy - radio, cx + radio, cy + radio), fill=c[:3] + (alpha,))
    capa = capa.filter(ImageFilter.GaussianBlur(radio // 2))
    canvas.alpha_composite(capa)


def _mascara_redondeada(size: Tuple[int, int], radio: int) -> Image.Image:
    escala = 3  # supersampling para bordes suaves
    m = Image.new("L", (size[0] * escala, size[1] * escala), 0)
    ImageDraw.Draw(m).rounded_rectangle((0, 0, m.width - 1, m.height - 1), radio * escala, fill=255)
    return m.resize(size, Image.LANCZOS)


def _cubrir(img: Image.Image, w: int, h: int) -> Image.Image:
    """Recorte tipo `object-cover` con foco ligeramente superior (fachadas/techos)."""
    img = ImageOps.exif_transpose(img).convert("RGB")
    foco_y = 0.42 if img.height > img.width else 0.5
    return ImageOps.fit(img, (w, h), Image.LANCZOS, centering=(0.5, foco_y))


def _pegar_foto(canvas: Image.Image, img: Image.Image, box: Tuple[int, int, int, int], radio: int,
                sombra: bool = True) -> None:
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    if sombra:
        capa = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
        ImageDraw.Draw(capa).rounded_rectangle((x0, y0 + 8, x1, y1 + 8), radio, fill=(0, 0, 0, 120))
        canvas.alpha_composite(capa.filter(ImageFilter.GaussianBlur(14)))
    foto = _cubrir(img, w, h).convert("RGBA")
    canvas.paste(foto, (x0, y0), _mascara_redondeada((w, h), radio))
    # filo de luz sutil
    borde = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    ImageDraw.Draw(borde).rounded_rectangle(box, radio, outline=(255, 255, 255, 38), width=2)
    canvas.alpha_composite(borde)


def _velo_inferior(canvas: Image.Image, box, radio: int, alto_frac: float = 0.42, alpha: int = 190) -> None:
    """Degradado oscuro en la base de una foto para que el texto encima sea legible."""
    x0, y0, x1, y1 = box
    w, h = x1 - x0, y1 - y0
    gh = int(h * alto_frac)
    grad = Image.linear_gradient("L").resize((w, gh)).point(lambda v: int(v * alpha / 255))
    velo = Image.new("RGBA", (w, gh), color("verde_profundo")[:3] + (0,))
    velo.putalpha(grad)
    full = Image.new("RGBA", (w, h), (0, 0, 0, 0))
    full.paste(velo, (0, h - gh))
    mask = _mascara_redondeada((w, h), radio)
    a = Image.composite(full.getchannel("A"), Image.new("L", (w, h), 0), mask)
    full.putalpha(a)
    canvas.alpha_composite(full, (x0, y0))


def _pastilla(canvas: Image.Image, xy, texto: str, f, fondo, fill, pad=(22, 12), tracking: int = 3,
              borde=None, fondo2=None) -> Tuple[int, int, int, int]:
    d = ImageDraw.Draw(canvas)
    tw = _ancho(d, texto, f, tracking)
    asc, desc = f.getmetrics()
    th = asc - 4
    x, y = xy
    box = (x, y, x + tw + pad[0] * 2, y + th + pad[1] * 2)
    capa = Image.new("RGBA", canvas.size, (0, 0, 0, 0))
    dc = ImageDraw.Draw(capa)
    r = (box[3] - box[1]) // 2
    if fondo2 is not None:
        g = _gradiente((box[2] - box[0], box[3] - box[1]), fondo, fondo2, diagonal=True)
        capa.paste(g, (box[0], box[1]), _mascara_redondeada(g.size, r))
    else:
        dc.rounded_rectangle(box, r, fill=fondo)
    if borde:
        dc.rounded_rectangle(box, r, outline=borde, width=2)
    canvas.alpha_composite(capa)
    _texto(ImageDraw.Draw(canvas), (x + pad[0], y + pad[1] + th // 2 + 2), texto, f, fill, tracking, anchor="lm")
    return box


def _pin(draw, x: int, y: int, r: int, c) -> None:
    """Icono de ubicación (gota)."""
    draw.ellipse((x - r, y - r, x + r, y + r), fill=c)
    draw.polygon([(x - r * 0.82, y + r * 0.45), (x + r * 0.82, y + r * 0.45), (x, y + r * 2.1)], fill=c)
    draw.ellipse((x - r * 0.4, y - r * 0.4, x + r * 0.4, y + r * 0.4), fill=color("verde_profundo"))


@lru_cache(maxsize=8)
def _logo(alto: int) -> Image.Image:
    im = Image.open(LOGO_PATH).convert("RGBA")
    ancho = int(im.width * alto / im.height)
    return im.resize((ancho, alto), Image.LANCZOS)


def _marca(canvas: Image.Image, x: int, y: int, alto_icono: int, size_txt: int) -> int:
    """Logo cromado + wordmark 'MAXIMUS.' + 'INMOBILIARIA'. Devuelve el x final."""
    logo = _logo(alto_icono)
    canvas.alpha_composite(logo, (x, y))
    d = ImageDraw.Draw(canvas)
    tx = x + logo.width + int(size_txt * 0.45)
    f1 = fuente(size_txt, "ExtraBold")
    f2 = fuente(max(11, int(size_txt * 0.34)), "SemiBold")
    cy = y + alto_icono // 2
    w = _texto(d, (tx, cy - int(size_txt * 0.08)), "MAXIMUS", f1, color("blanco"), tracking=1, anchor="ls")
    d.text((tx + w + 2, cy - int(size_txt * 0.08)), ".", font=f1, fill=color("esmeralda"), anchor="ls")
    w2 = _texto(d, (tx + 2, cy + int(size_txt * 0.42)), "INMOBILIARIA", f2, color("plata"),
                tracking=int(size_txt * 0.22), anchor="ls")
    return tx + max(w + 20, w2)


# ==============================================================================
# Datos del inmueble
# ==============================================================================
def formatear_precio(precio: Any) -> str:
    try:
        v = float(precio)
    except (TypeError, ValueError):
        return "Consultar"
    if v <= 0:
        return "Consultar"
    return f"${v:,.0f}"


def _num(v: Any) -> float:
    try:
        return float(v or 0)
    except (TypeError, ValueError):
        return 0.0


def caracteristicas(inm: Dict[str, Any], maximo: int = 4) -> List[Tuple[str, str]]:
    """[(valor, etiqueta)] omitiendo valores en cero (p.ej. terrenos solo muestran m²)."""
    out: List[Tuple[str, str]] = []
    hab, ban = _num(inm.get("habitaciones")), _num(inm.get("banos"))
    m2, pto = _num(inm.get("metros_cuadrados")), _num(inm.get("estacionamientos"))
    tipo = str(inm.get("tipo", "")).lower()
    def pl(n: float, uno: str, varios: str) -> str:
        return uno if n == 1 else varios

    if hab > 0:
        if tipo in ("local", "oficina", "galpon"):
            out.append((f"{hab:g}", pl(hab, "OFICINA", "OFICINAS")))
        else:
            out.append((f"{hab:g}", pl(hab, "HABITACIÓN", "HABITACIONES")))
    if ban > 0:
        out.append((f"{ban:g}", pl(ban, "BAÑO", "BAÑOS")))
    if m2 > 0:
        out.append((f"{m2:,.0f} m²", "SUPERFICIE"))
    if pto > 0:
        out.append((f"{pto:g}", pl(pto, "PUESTO", "PUESTOS")))
    return out[:maximo]


def _ubicacion(inm: Dict[str, Any]) -> str:
    u = inm.get("ubicacion") or inm.get("sector_nombre") or ""
    if not u and inm.get("sector_clave"):
        u = str(inm["sector_clave"]).replace("-", " ").title()
    estado = inm.get("estado") or "Táchira"
    return f"{u}, {estado}" if u and estado.lower() not in u.lower() else (u or estado)


def _abrir(fotos: Sequence[Union[PathLike, Image.Image]]) -> List[Image.Image]:
    out = []
    for f in fotos:
        if isinstance(f, Image.Image):
            out.append(f)
        else:
            try:
                out.append(Image.open(f))
            except Exception:
                continue
    return out


# ==============================================================================
# DISEÑO BASE ÚNICO — "Editorial MAXIMUS"
# Ambas plantillas (ALQUILER y VENTA) comparten exactamente la misma estructura,
# tipografía, logo, fondo y rejilla de fotos. Solo cambian los acentos definidos en
# `plantillas.<operacion>` del JSON: color de la pastilla, etiqueta y sufijo del precio.
# ==============================================================================
def _render_editorial(fotos: Sequence[Union[PathLike, Image.Image]], inm: Dict[str, Any],
                      clave: str) -> Image.Image:
    cfg = cargar_config()
    W, H = cfg["lienzo"]["ancho"], cfg["lienzo"]["alto"]
    pl = cfg["plantillas"][clave]
    pastilla_c1 = color(pl["pastilla_desde"])
    pastilla_c2 = color(pl["pastilla_hasta"])
    acento = color(pl["acento_texto"])
    imgs = _abrir(fotos)
    if not imgs:
        raise ValueError("Se necesita al menos 1 foto para el collage.")

    c = Image.new("RGBA", (W, H), color("verde_profundo"))
    M, G, R = 32, 16, 24
    PANEL_W = 560

    # Panel editorial izquierdo (idéntico en ambas plantillas)
    panel = _gradiente((PANEL_W, H), color("verde_profundo"), color("verde_maximus"), diagonal=True)
    c.paste(panel, (0, 0))
    _brillo_radial(c, (PANEL_W - 60, H - 80), 300, color("esmeralda"), 60)
    _brillo_radial(c, (60, 80), 260, color("plata"), 22)
    d = ImageDraw.Draw(c)
    d.line((PANEL_W - 2, M, PANEL_W - 2, H - M), fill=color("esmeralda", 160), width=3)

    # Rejilla de fotos a la derecha (idéntica en ambas plantillas)
    fx0, fx1 = PANEL_W + 24, W - M
    if len(imgs) >= 3:
        hero = (fx0, M, fx1, 640)
        midx = fx0 + (fx1 - fx0 - G) // 2
        _pegar_foto(c, imgs[0], hero, R)
        _pegar_foto(c, imgs[1], (fx0, 640 + G, midx, H - M), R)
        _pegar_foto(c, imgs[2], (midx + G, 640 + G, fx1, H - M), R)
    elif len(imgs) == 2:
        hero = (fx0, M, fx1, 640)
        _pegar_foto(c, imgs[0], hero, R)
        _pegar_foto(c, imgs[1], (fx0, 640 + G, fx1, H - M), R)
    else:
        hero = (fx0, M, fx1, H - M)
        _pegar_foto(c, imgs[0], hero, R)

    if inm.get("codigo"):
        f = fuente(20, "Bold")
        tw = _ancho(ImageDraw.Draw(c), inm["codigo"], f, 1)
        _pastilla(c, (hero[2] - tw - 44 - 24, hero[1] + 24), inm["codigo"], f,
                  color("verde_profundo", 185), color("blanco"), tracking=1, borde=(255, 255, 255, 90))

    # Contenido del panel
    X = 52
    _marca(c, X, 52, 92, 34)
    y = 196
    _pastilla(c, (X, y), pl["etiqueta"], fuente(21, "ExtraBold"), pastilla_c1,
              color("verde_profundo"), fondo2=pastilla_c2)
    d = ImageDraw.Draw(c)
    y += 80
    f_tit, lineas = _ajustar_lineas(d, inm.get("titulo", ""), "ExtraBold", PANEL_W - X - 44, 46, 30, 3)
    for ln in lineas:
        d.text((X, y), ln, font=f_tit, fill=color("blanco"))
        y += int(f_tit.size * 1.16)
    y += 14
    _pin(d, X + 10, y + 12, 9, color("esmeralda"))
    f_ub, ub = _ajustar_lineas(d, _ubicacion(inm), "Medium", PANEL_W - X - 80, 22, 17, 1)
    d.text((X + 32, y), ub[0], font=f_ub, fill=color("plata"))

    # Rejilla de características 2x2
    feats = caracteristicas(inm)
    gy = max(y + 62, 560)
    col_w = (PANEL_W - X - 44) // 2
    for i, (valor, etiqueta) in enumerate(feats):
        cx = X + (i % 2) * col_w
        cy = gy + (i // 2) * 92
        d.line((cx, cy, cx, cy + 64), fill=color("esmeralda"), width=3)
        d.text((cx + 18, cy - 4), valor, font=fuente(34, "ExtraBold"), fill=color("blanco"))
        _texto(d, (cx + 19, cy + 42), etiqueta, fuente(14, "SemiBold"), color("plata_oscura"), tracking=3)

    # Precio
    py = H - 186
    d.line((X, py, PANEL_W - 44, py), fill=(255, 255, 255, 40), width=1)
    _texto(d, (X, py + 26), pl["etiqueta_precio"], fuente(16, "Bold"), acento, tracking=4)
    f_suf = fuente(24, "Bold")
    ancho_suf = _ancho(d, pl["sufijo_precio"], f_suf) + 14
    f_p, lp = _ajustar_lineas(d, formatear_precio(inm.get("precio")), "ExtraBold",
                              PANEL_W - X - 40 - ancho_suf, 80, 40, 1)
    d.text((X - 3, py + 52), lp[0], font=f_p, fill=color("blanco"))
    pw = _ancho(d, lp[0], f_p)
    d.text((X + pw + 14, py + 52 + f_p.size - 4), pl["sufijo_precio"], font=f_suf,
           fill=color("plata"), anchor="ls")
    return c.convert("RGB")


def render_alquiler(fotos: Sequence[Union[PathLike, Image.Image]], inm: Dict[str, Any]) -> Image.Image:
    """ALQUILER: diseño base con acento esmeralda, 'CANON MENSUAL' y 'USD / mes'."""
    return _render_editorial(fotos, inm, "alquiler")


def render_venta(fotos: Sequence[Union[PathLike, Image.Image]], inm: Dict[str, Any]) -> Image.Image:
    """VENTA: diseño base con acento plata, 'PRECIO DE VENTA' y 'USD'."""
    return _render_editorial(fotos, inm, "venta")


# ==============================================================================
# API pública para el pipeline
# ==============================================================================
PLANTILLAS = {"alquiler": render_alquiler, "venta": render_venta}


def plantilla_para(operacion: Optional[str]) -> str:
    op = (operacion or "").lower()
    return "alquiler" if ("alquil" in op or "renta" in op or "arriendo" in op) else "venta"


def generar_portada(fotos: Sequence[Union[PathLike, Image.Image]], inm: Dict[str, Any],
                    plantilla: Optional[str] = None) -> Image.Image:
    nombre = plantilla or plantilla_para(inm.get("operacion"))
    return PLANTILLAS[nombre](fotos, inm)


def _ahash(img: Image.Image) -> int:
    g = ImageOps.exif_transpose(img).convert("L").resize((8, 8), Image.LANCZOS)
    px = list(g.getdata())
    avg = sum(px) / 64.0
    return sum(1 << i for i, p in enumerate(px) if p >= avg)


def seleccionar_fotos_collage(paths_ordenados: Sequence[PathLike], max_fotos: Optional[int] = None) -> List[Path]:
    """
    Toma las fotos ya ordenadas por `evaluar_calidad_portada` y elige las mejores para el collage:
      - excluye flyers/collages de terceros (`_collage`) que traen texto y logos ajenos,
      - descarta fotos casi idénticas (hash perceptual), muy comunes en reenvíos de WhatsApp,
      - descarta recortes demasiado pequeños (< 300 px).
    """
    cfg = cargar_config()
    max_fotos = max_fotos or int(cfg.get("max_fotos", 3))
    umbral = int(cfg.get("umbral_duplicado_hash", 6))
    elegidas: List[Path] = []
    hashes: List[int] = []
    for p in paths_ordenados:
        p = Path(p)
        if cfg.get("excluir_flyers_de_terceros", True) and "_collage" in p.name.lower():
            continue
        if p.name == cfg.get("nombre_archivo_salida"):
            continue
        try:
            with Image.open(p) as im:
                if min(im.size) < 300:
                    continue
                h = _ahash(im)
        except Exception:
            continue
        if any(bin(h ^ o).count("1") <= umbral for o in hashes):
            continue
        hashes.append(h)
        elegidas.append(p)
        if len(elegidas) >= max_fotos:
            break
    return elegidas


def collage_habilitado(forzar: Optional[bool] = None) -> bool:
    """Feature flag: CLI (--collage-portada) > variable de entorno MAXIMUS_COLLAGE_PORTADA > JSON."""
    import os
    if forzar is not None:
        return forzar
    env = os.environ.get("MAXIMUS_COLLAGE_PORTADA", "").strip().lower()
    if env in ("1", "true", "si", "sí", "on"):
        return True
    if env in ("0", "false", "no", "off"):
        return False
    return bool(cargar_config().get("habilitado", False))


def main() -> None:
    ap = argparse.ArgumentParser(description="Genera una portada collage MAXIMUS (alquiler / venta).")
    ap.add_argument("--fotos", nargs="+", required=True)
    ap.add_argument("--operacion", default="venta", choices=["venta", "alquiler"])
    ap.add_argument("--titulo", default="Inmueble MAXIMUS")
    ap.add_argument("--ubicacion", default="San Cristóbal")
    ap.add_argument("--precio", type=float, default=0)
    ap.add_argument("--tipo", default="casa")
    ap.add_argument("--habitaciones", type=float, default=0)
    ap.add_argument("--banos", type=float, default=0)
    ap.add_argument("--m2", type=float, default=0)
    ap.add_argument("--puestos", type=float, default=0)
    ap.add_argument("--codigo", default="")
    ap.add_argument("--out", default="portada_maximus.jpg")
    a = ap.parse_args()
    inm = {
        "operacion": a.operacion, "titulo": a.titulo, "ubicacion": a.ubicacion, "precio": a.precio,
        "tipo": a.tipo, "habitaciones": a.habitaciones, "banos": a.banos, "metros_cuadrados": a.m2,
        "estacionamientos": a.puestos, "codigo": a.codigo,
    }
    img = generar_portada(a.fotos, inm)
    img.save(a.out, format="JPEG", quality=cargar_config()["lienzo"]["jpeg_quality"], optimize=True)
    print(f"[OK] Portada {plantilla_para(a.operacion).upper()} generada: {a.out} ({img.width}x{img.height})")


if __name__ == "__main__":
    main()
