#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Inserta en Supabase inmuebles YA INTERPRETADOS por el agente (LLM), sin pasar por el
parser regex. Recibe un JSON con una lista de inmuebles y:
  1. Valida campos mínimos (operacion, tipo, precio, sector oficial UBICACIONES_TACHIRA).
  2. Deduplica contra Supabase (operación + tipo + sector + precio ±5%).
  3. Sube las fotos locales al bucket de Storage (si se pasan rutas locales).
  4. Hace upsert en public.inmuebles reutilizando el publicador de la Skill 4.

Uso:
  python .agents/skills/whatsapp-browser-agent/scripts/insertar_inmuebles.py --json ruta/inmuebles_agente.json [--maximus] [--dry-run]

Formato del JSON (lista o {"inmuebles": [...]}):
{
  "operacion": "venta" | "alquiler",
  "tipo": "casa" | "apartamento" | "local" | "galpon" | "terreno" | "casa_de_campo" | "fincas",
  "precio": 45000,
  "sector_clave": "palmira",            # clave oficial de UBICACIONES_TACHIRA
  "titulo": "Casa en Palmira",
  "descripcion": "...",
  "habitaciones": 3, "banos": 2, "metros_cuadrados": 120, "estacionamientos": 1,
  "asesor_nombre": "Gleyna Almeira", "asesor_telefono": "+58 412 6425361",
  "fotos": ["C:/ruta/IMG-1.jpg", "https://..."],
  "texto_original": "..."
}
"""
import sys
import json
import argparse
import importlib.util
import mimetypes
import re
import time
from pathlib import Path

if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

import requests

ROOT = Path(__file__).resolve().parents[4]
SKILLS = ROOT / ".agents" / "skills"


def _load(mod_name, path):
    spec = importlib.util.spec_from_file_location(mod_name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


publisher = _load("publisher", SKILLS / "maximus-supabase-publisher" / "scripts" / "publish_to_supabase.py")
parser_mod = _load("parser_mod", SKILLS / "whatsapp-property-parser" / "scripts" / "parse_whatsapp_batch.py")

UBIC = {clave: (label, muni) for clave, label, muni, _ in parser_mod.UBICACIONES_TACHIRA_REGLAS}

TIPOS = {
    "casa": ("Casa", "casa", "casa"),
    "apartamento": ("Departamento", "departamento", "apartamento"),
    "departamento": ("Departamento", "departamento", "apartamento"),
    "local": ("Local Comercial", "local_comercial", "local"),
    "oficina": ("Local Comercial", "local_comercial", "local"),
    "galpon": ("Galpones", "galpones", "galpon"),
    "terreno": ("Fincas", "fincas", "terreno"),
    "fincas": ("Fincas", "fincas", "terreno"),
    "finca": ("Fincas", "fincas", "terreno"),
    "casa_de_campo": ("Casa de campo", "casa_de_campo", "casa"),
}


def subir_foto(path_str, sb_url, sb_key, bucket):
    if path_str.startswith("http"):
        return path_str
    p = Path(path_str)
    if not p.exists():
        return None
    rel = f"agente_browser/{time.strftime('%Y%m%d')}/{int(time.time()*1000)}_{p.name}"
    mime = mimetypes.guess_type(p.name)[0] or "image/jpeg"
    r = requests.post(
        f"{sb_url}/storage/v1/object/{bucket}/{rel}",
        data=p.read_bytes(),
        headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}", "Content-Type": mime, "x-upsert": "true"},
        timeout=60,
    )
    if r.status_code in (200, 201):
        return f"{sb_url}/storage/v1/object/public/{bucket}/{rel}"
    print(f"   ⚠️ No se pudo subir {p.name}: HTTP {r.status_code} {r.text[:120]}")
    return None


def cargar_existentes(sb_url, sb_key):
    r = requests.get(
        f"{sb_url}/rest/v1/inmuebles?select=id,codigo,operacion,tipo,sector_nombre,precio,metros_cuadrados",
        headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}"},
        timeout=30,
    )
    return r.json() if r.status_code == 200 else []


def es_duplicado(inm, existentes):
    for e in existentes:
        if str(e.get("operacion")) != inm["operacion"]:
            continue
        if (e.get("sector_nombre") or "").lower() != inm["sector_nombre"].lower():
            continue
        if str(e.get("tipo")) not in (inm["tipo_sql_dashboard"], inm["tipo_sql_canonical"]):
            continue
        p = float(e.get("precio") or 0)
        if p and abs(p - inm["precio"]) / max(p, 1) <= 0.05:
            m_e, m_n = float(e.get("metros_cuadrados") or 0), float(inm.get("metros_cuadrados") or 0)
            if m_e and m_n and abs(m_e - m_n) / max(m_e, 1) > 0.10:
                continue
            return e
    return None


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--json", required=True)
    ap.add_argument("--maximus", action="store_true", help="Marca los inmuebles como captación directa MAXIMUS")
    ap.add_argument("--dry-run", action="store_true")
    args = ap.parse_args()

    data = json.loads(Path(args.json).read_text(encoding="utf-8"))
    lista = data.get("inmuebles", data) if isinstance(data, dict) else data

    cfg = publisher.load_config(ROOT)
    sb_url, sb_key = cfg["sb_url"], cfg["sb_key"]
    bucket = cfg.get("bucket") or "inmuebles-fotos"
    existentes = cargar_existentes(sb_url, sb_key)
    corr = publisher.obtener_siguiente_correlativo_max(sb_url, sb_key)

    ok, dup, rechazados = [], [], []
    print(f"📦 {len(lista)} inmuebles recibidos | {len(existentes)} existentes en Supabase\n")

    for i, raw in enumerate(lista, 1):
        op = str(raw.get("operacion") or "").lower().strip()
        tipo_key = str(raw.get("tipo") or "").lower().strip().replace(" ", "_")
        precio = float(raw.get("precio") or 0)
        sector_clave = str(raw.get("sector_clave") or "").strip()
        faltan = []
        if op not in ("venta", "alquiler"): faltan.append("operacion")
        if tipo_key not in TIPOS: faltan.append("tipo")
        if precio <= 0: faltan.append("precio")
        if sector_clave not in UBIC: faltan.append("sector_clave")
        if faltan:
            rechazados.append({"i": i, "titulo": raw.get("titulo"), "faltan": faltan})
            print(f"  ⏸️  [{i}] {raw.get('titulo')} -> falta: {', '.join(faltan)}")
            continue

        label, muni = UBIC[sector_clave]
        tipo_ui, tipo_dash, tipo_canon = TIPOS[tipo_key]
        inm = dict(raw)
        inm.update({
            "operacion": op, "precio": precio,
            "tipo_ui": tipo_ui, "tipo_sql_dashboard": tipo_dash, "tipo_sql_canonical": tipo_canon,
            "sector_nombre": label,
            "ubicacion": f"{label}, {muni}, Táchira",
            "sector_desc": f"Sector residencial {label}, Municipio {muni}, Estado Táchira.",
            "is_maximus": bool(args.maximus),
            "modo_entrada": "agente_browser_llm",
            "grupo_origen": raw.get("grupo_origen", "WhatsApp Web"),
        })
        if not inm.get("titulo"):
            inm["titulo"] = f"{tipo_ui} en {label}"

        d = es_duplicado(inm, existentes)
        if d:
            dup.append({"titulo": inm["titulo"], "existente": d.get("codigo")})
            print(f"  🔁 [{i}] {inm['titulo']} -> duplicado de {d.get('codigo')}")
            continue

        if args.dry_run:
            print(f"  [DRY] [{i}] {inm['titulo']} ${precio:,.0f} ({label})")
            ok.append(inm["titulo"])
            continue

        fotos_urls = [u for u in (subir_foto(f, sb_url, sb_key, bucket) for f in (raw.get("fotos") or [])) if u]
        inm["fotos"] = fotos_urls
        codigo = f"#MAX-{corr}"; corr += 1
        res, err = publisher.upsert_en_supabase(inm, codigo, bool(args.maximus), sb_url, sb_key)
        if res:
            ok.append(codigo)
            existentes.append({"codigo": codigo, "operacion": op, "tipo": tipo_dash, "sector_nombre": label,
                               "precio": precio, "metros_cuadrados": inm.get("metros_cuadrados")})
            print(f"  ✅ [{i}] {codigo} {inm['titulo']} ${precio:,.0f} | {len(fotos_urls)} fotos")
        else:
            rechazados.append({"i": i, "titulo": inm["titulo"], "error": err})
            print(f"  ❌ [{i}] {inm['titulo']} -> {err}")

    print(f"\n✨ RESUMEN: insertados={len(ok)} | duplicados={len(dup)} | pendientes/errores={len(rechazados)}")
    Path(args.json).with_suffix(".resultado.json").write_text(
        json.dumps({"insertados": ok, "duplicados": dup, "pendientes": rechazados}, indent=2, ensure_ascii=False),
        encoding="utf-8",
    )


if __name__ == "__main__":
    main()
