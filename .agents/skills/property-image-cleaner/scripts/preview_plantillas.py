#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Genera las imágenes de muestra de las dos plantillas de collage (ALQUILER y VENTA) para que el
equipo las revise antes de activar el flag `habilitado` en references/plantillas_collage.json.

    python .agents/skills/property-image-cleaner/scripts/preview_plantillas.py [--out carpeta]

Usa fotos reales de un lote de prueba de WhatsApp (recortadas manualmente) y datos de ejemplo.
Cada plantilla se renderiza con 3, 2 y 1 foto para mostrar cómo se adapta.
"""

import sys
import argparse
from pathlib import Path

from PIL import Image

sys.path.insert(0, str(Path(__file__).resolve().parent))
from collage_maximus import generar_portada, cargar_config  # noqa: E402

REPO = Path(__file__).resolve().parents[4]
LOTE = REPO / "agente_whatsapp" / "proyectos" / "captaciones_externas" / "WhatsApp Chat with Real estate_2026_11_06_1023"

# (archivo, caja de recorte) — piezas limpias de collages del lote de prueba
FOTOS_VENTA = [("IMG-20261106-WA0089.jpg", (0, 920, 720, 1280)),   # fachada
               ("IMG-20261106-WA0089.jpg", (0, 0, 720, 330)),      # cocina / comedor
               ("IMG-20261106-WA0089.jpg", (0, 500, 720, 780))]    # habitación
FOTOS_ALQUILER = [("IMG-20261106-WA0017.jpg", None),                # sala / comedor
                  ("IMG-20261106-WA0053.jpg", (0, 0, 720, 560)),    # pasillo
                  ("IMG-20261106-WA0053.jpg", (0, 720, 720, 1280))] # habitación

INM_VENTA = {
    "operacion": "venta", "tipo": "casa", "codigo": "#MAX-300",
    "titulo": "Casa Moderna en Urbanización Colina de Pirineos",
    "ubicacion": "Pirineos, San Cristóbal", "estado": "Táchira",
    "precio": 260000, "habitaciones": 4, "banos": 3, "metros_cuadrados": 220, "estacionamientos": 2,
}
INM_ALQUILER = {
    "operacion": "alquiler", "tipo": "apartamento", "codigo": "#MAX-251",
    "titulo": "Apartamento Amoblado en Barrio Obrero",
    "ubicacion": "Barrio Obrero, San Cristóbal", "estado": "Táchira",
    "precio": 450, "habitaciones": 3, "banos": 2, "metros_cuadrados": 110, "estacionamientos": 1,
}


def _cargar(lista):
    out = []
    for nombre, caja in lista:
        im = Image.open(LOTE / nombre).convert("RGB")
        out.append(im.crop(caja) if caja else im)
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--out", default=str(REPO / "plantillas_collage_preview"))
    a = ap.parse_args()
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    q = cargar_config()["lienzo"]["jpeg_quality"]

    fv, fa = _cargar(FOTOS_VENTA), _cargar(FOTOS_ALQUILER)
    for n in (3, 2, 1):
        sufijo = "" if n == 3 else f"_{n}foto{'s' if n > 1 else ''}"
        generar_portada(fa[:n], INM_ALQUILER).save(out / f"plantilla_alquiler{sufijo}.jpg", quality=q)
        generar_portada(fv[:n], INM_VENTA).save(out / f"plantilla_venta{sufijo}.jpg", quality=q)

    # Caso borde: terreno (sin habitaciones/baños), título largo, precio alto
    terreno = dict(INM_VENTA, tipo="terreno", habitaciones=0, banos=0, estacionamientos=0,
                   metros_cuadrados=1450, precio=1250000, codigo="",
                   titulo="Terreno a Pie de Calle en Avenida Universidad, al lado de Villa Florida con Excelente Ubicación Comercial")
    generar_portada(fv, terreno).save(out / "caso_borde_venta_terreno.jpg", quality=q)
    print(f"[OK] Previews generadas en {out}")


if __name__ == "__main__":
    main()
