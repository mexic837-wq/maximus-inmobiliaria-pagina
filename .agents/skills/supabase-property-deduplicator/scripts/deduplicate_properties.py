#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAXIMUS Inmobiliaria - Skill 2: supabase-property-deduplicator
===============================================================
Consulta la tabla `public.inmuebles` en Supabase y verifica que cada inmueble
extraído del lote de WhatsApp no esté repetido:
  1. Deduplicación Intra-Lote (cuando varios asesores publican la misma propiedad en varios grupos).
  2. Deduplicación contra Supabase (Operación + Tipo + Sector Normalizado + Precio ±5% + Área m² ±10%).
  3. Casos dudosos (0.65 <= score < 0.85) se pausan en `pendientes_revision.md`.
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


def load_supabase_config(repo_root: Path) -> Tuple[str, str]:
    """Lee SUPABASE_URL y SUPABASE_ANON_KEY desde variables de entorno o js/config.js."""
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")
    if url and key:
        return url.rstrip("/"), key.strip()

    config_js = repo_root / "js" / "config.js"
    if config_js.exists():
        content = config_js.read_text(encoding="utf-8", errors="replace")
        m_url = re.search(r"SUPABASE_URL\s*:\s*['\"]([^'\"]+)['\"]", content)
        m_key = re.search(r"SUPABASE_ANON_KEY\s*:\s*['\"]([^'\"]+)['\"]", content)
        if m_url and m_key:
            return m_url.group(1).rstrip("/"), m_key.group(1).strip()

    raise RuntimeError("No se encontraron credenciales de Supabase en js/config.js ni en variables de entorno.")


def fetch_existing_inmuebles_supabase(sb_url: str, sb_key: str) -> List[Dict[str, Any]]:
    """Consulta todas las propiedades actuales en `public.inmuebles` vía REST API."""
    endpoint = f"{sb_url}/rest/v1/inmuebles?select=*"
    req = urllib.request.Request(
        endpoint,
        headers={
            "apikey": sb_key,
            "Authorization": f"Bearer {sb_key}",
            "Accept": "application/json",
        },
        method="GET",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            data = json.loads(resp.read().decode("utf-8"))
            if isinstance(data, list):
                return data
    except Exception as e:
        print(f"[WARN] No se pudo consultar Supabase en vivo ({e}). Se usará deduplicación intra-lote.")
    return []


def normalizar_tipo_familia(tipo_raw: str) -> str:
    """Agrupa sinónimos de tipo de inmueble en una misma familia canónica para comparar."""
    t = (tipo_raw or "").lower().strip()
    if any(k in t for k in ["depto", "departamento", "apartamento", "apto", "penthouse"]):
        return "apartamento"
    if any(k in t for k in ["casa", "quinta", "townhouse", "chalet"]):
        return "casa"
    if any(k in t for k in ["galpon", "galpón", "industrial"]):
        return "galpon"
    if any(k in t for k in ["local", "oficina", "comercial", "consultorio"]):
        return "local"
    if any(k in t for k in ["finca", "terreno", "parcela", "campo", "lote"]):
        return "terreno"
    return t


def normalizar_sector_comparacion(item: Dict[str, Any]) -> str:
    """Extrae una cadena limpia y sin acentos del sector/ubicación para comparación."""
    sec = str(item.get("sector_nombre") or item.get("ubicacion") or "").lower()
    # Quitar acentos comunes
    reemplazos = str.maketrans("áéíóúñ", "aeioun")
    sec = sec.translate(reemplazos)
    sec = re.sub(r"\b(urbanizacion|urb|residencias|res|sector|barrio|san cristobal|tachira|estado)\b", " ", sec)
    sec = re.sub(r"[^a-z0-9\s]", " ", sec)
    sec = re.sub(r"\s+", " ", sec).strip()
    return sec


def sectores_coinciden(sec1: str, sec2: str) -> bool:
    if not sec1 or not sec2:
        return False
    if sec1 == sec2 or sec1 in sec2 or sec2 in sec1:
        return True
    tokens1 = {w for w in sec1.split() if len(w) > 2}
    tokens2 = {w for w in sec2.split() if len(w) > 2}
    if tokens1 and tokens2 and len(tokens1.intersection(tokens2)) >= 1:
        return True
    return False


def calcular_score_similitud(cand: Dict[str, Any], ref: Dict[str, Any]) -> Tuple[float, Dict[str, Any]]:
    """
    Calcula el score de similitud (0.00 a 1.00) entre un candidato y un inmueble existente:
      - Operación (exacta) + Tipo (misma familia): filtro obligatorio
      - Sector Normalizado: 0.35
      - Precio (margen ±5% -> 0.35 | margen ±15% -> 0.15)
      - Área m² (margen ±10% -> 0.25)
      - Habitaciones y baños iguales: 0.05
    """
    op1 = str(cand.get("operacion") or "").lower().strip()
    op2 = str(ref.get("operacion") or "").lower().strip()
    if op1 != op2:
        return 0.0, {"motivo": "Operación distinta"}

    t1 = normalizar_tipo_familia(cand.get("tipo_ui") or cand.get("tipo") or "")
    t2 = normalizar_tipo_familia(ref.get("tipo_ui") or ref.get("tipo") or "")
    if t1 != t2:
        return 0.0, {"motivo": "Tipo de inmueble distinto"}

    sec1 = normalizar_sector_comparacion(cand)
    sec2 = normalizar_sector_comparacion(ref)
    mismo_sector = sectores_coinciden(sec1, sec2)
    if not mismo_sector:
        return 0.10, {"motivo": "Sector distinto"}

    score = 0.35  # Sector coincide

    # Comparar Precio (±5%)
    p1 = float(cand.get("precio") or 0)
    p2 = float(ref.get("precio") or 0)
    diff_precio_pct = abs(p1 - p2) / max(p1, p2, 1.0) if (p1 > 0 and p2 > 0) else 1.0

    if diff_precio_pct <= 0.05:
        score += 0.35
    elif diff_precio_pct <= 0.15:
        score += 0.15

    # Comparar Área m² (±10%)
    m2_1 = float(cand.get("metros_cuadrados") or 0)
    m2_2 = float(ref.get("metros_cuadrados") or 0)
    diff_m2_pct = None
    if m2_1 > 0 and m2_2 > 0:
        diff_m2_pct = abs(m2_1 - m2_2) / max(m2_1, m2_2, 1.0)
        if diff_m2_pct <= 0.10:
            score += 0.25
        elif diff_m2_pct <= 0.18:
            score += 0.10
    elif m2_1 == 0 or m2_2 == 0:
        # Si alguno no tiene m², evaluar coincidencia exacta de habitaciones, baños y precio ±2%
        if diff_precio_pct <= 0.02 and int(cand.get("habitaciones") or 0) == int(ref.get("habitaciones") or 0):
            score += 0.20

    # Comparar Habitaciones y Baños (0.05)
    h1, h2 = int(cand.get("habitaciones") or 0), int(ref.get("habitaciones") or 0)
    b1, b2 = float(cand.get("banos") or 0), float(ref.get("banos") or 0)
    if h1 == h2 and abs(b1 - b2) <= 0.5:
        score += 0.05

    detalles = {
        "mismo_sector": mismo_sector,
        "diff_precio_pct": round(diff_precio_pct * 100, 2),
        "diff_m2_pct": round(diff_m2_pct * 100, 2) if diff_m2_pct is not None else "N/D",
    }
    return round(score, 3), detalles


def calidad_registro(item: Dict[str, Any]) -> int:
    """Puntúa qué anuncio dentro del mismo lote es más completo (más fotos y mejor texto)."""
    num_fotos = len(item.get("imagenes_locales") or [])
    tiene_m2 = 1 if float(item.get("metros_cuadrados") or 0) > 0 else 0
    len_texto = len(item.get("texto_original") or "")
    return (num_fotos * 100) + (tiene_m2 * 50) + min(len_texto, 500)


def ejecutar_deduplicacion(lote_dir: Path, repo_root: Path) -> Dict[str, Any]:
    procesados_dir = lote_dir / "procesados"
    in_json = procesados_dir / "inmuebles_extraidos.json"
    if not in_json.exists():
        raise FileNotFoundError(f"No existe {in_json}. Ejecuta primero Skill 1 (whatsapp-property-parser).")

    data_extraida = json.loads(in_json.read_text(encoding="utf-8"))
    candidatos = data_extraida.get("inmuebles", [])

    sb_url, sb_key = load_supabase_config(repo_root)
    existentes_sb = fetch_existing_inmuebles_supabase(sb_url, sb_key)

    unicos_intra_lote: List[Dict[str, Any]] = []
    duplicados_descartados: List[Dict[str, Any]] = []
    dudosos_pausados: List[Dict[str, Any]] = []

    # 1. Deduplicación Intra-Lote (entre los ~15 grupos del mismo día)
    for cand in candidatos:
        es_dup_interno = False
        for idx_u, unico in enumerate(unicos_intra_lote):
            score, det = calcular_score_similitud(cand, unico)
            if score >= 0.85:
                es_dup_interno = True
                # Conservar el que tenga más fotos y mejor descripción
                if calidad_registro(cand) > calidad_registro(unico):
                    descartado = unico
                    unicos_intra_lote[idx_u] = cand
                    ganador_id = cand["temp_id"]
                else:
                    descartado = cand
                    ganador_id = unico["temp_id"]

                duplicados_descartados.append({
                    "temp_id": descartado["temp_id"],
                    "titulo": descartado["titulo"],
                    "sector": descartado["sector_nombre"],
                    "precio": descartado["precio"],
                    "metros_cuadrados": descartado["metros_cuadrados"],
                    "origen_duplicado": f"Intra-Lote (Repetido con {ganador_id} en grupo '{descartado.get('grupo_origen')}')",
                    "score": score,
                    "detalles": det,
                })
                break

        if not es_dup_interno:
            unicos_intra_lote.append(cand)

    # 2. Deduplicación contra Supabase (public.inmuebles)
    unicos_verificados: List[Dict[str, Any]] = []
    for cand in unicos_intra_lote:
        best_score = 0.0
        best_match = None
        best_det = {}

        for sb_item in existentes_sb:
            score, det = calcular_score_similitud(cand, sb_item)
            if score > best_score:
                best_score = score
                best_match = sb_item
                best_det = det

        if best_score >= 0.85 and best_match:
            duplicados_descartados.append({
                "temp_id": cand["temp_id"],
                "titulo": cand["titulo"],
                "sector": cand["sector_nombre"],
                "precio": cand["precio"],
                "metros_cuadrados": cand["metros_cuadrados"],
                "origen_duplicado": f"Supabase BD (ID: {best_match.get('id')} | Código: {best_match.get('codigo')} | '{best_match.get('titulo')}')",
                "score": best_score,
                "detalles": best_det,
            })
        elif 0.65 <= best_score < 0.85 and best_match:
            dudosos_pausados.append({
                "temp_id": cand["temp_id"],
                "motivo": f"Similitud Dudosa con Supabase (Score: {best_score}) — Revisar variación de precio/m²",
                "score": best_score,
                "detalles": best_det,
                "candidato": cand,
                "match_supabase": {
                    "id": best_match.get("id"),
                    "codigo": best_match.get("codigo"),
                    "titulo": best_match.get("titulo"),
                    "precio": best_match.get("precio"),
                    "metros_cuadrados": best_match.get("metros_cuadrados"),
                    "ubicacion": best_match.get("ubicacion"),
                    "asesor_nombre": best_match.get("asesor_nombre"),
                },
            })
        else:
            cand["dedup_score_max"] = best_score
            unicos_verificados.append(cand)

    out_data = {
        "lote": lote_dir.name,
        "fecha_deduplicacion": datetime.now().isoformat(),
        "total_inmuebles_en_supabase_consultados": len(existentes_sb),
        "total_candidatos_entrada": len(candidatos),
        "total_unicos_verificados": len(unicos_verificados),
        "total_duplicados_descartados": len(duplicados_descartados),
        "total_dudosos_pausados": len(dudosos_pausados),
        "unicos_verificados": unicos_verificados,
        "duplicados_descartados": duplicados_descartados,
        "dudosos_pausados": dudosos_pausados,
    }

    out_json = procesados_dir / "inmuebles_deduplicados.json"
    out_json.write_text(json.dumps(out_data, indent=2, ensure_ascii=False), encoding="utf-8")

    # Si hay casos dudosos, agregarlos a pendientes_revision.md
    if dudosos_pausados:
        anexar_dudosos_a_pendientes(lote_dir, dudosos_pausados)

    return out_data


def anexar_dudosos_a_pendientes(lote_dir: Path, dudosos: List[Dict[str, Any]]) -> None:
    md_path = lote_dir / "pendientes_revision.md"
    existing = md_path.read_text(encoding="utf-8") if md_path.exists() else f"# Reporte de Inmuebles Pendientes de Revisión (`{lote_dir.name}`)\n"
    lines = [
        existing.rstrip(),
        "",
        "---",
        "",
        "## ⚠️ Casos Pausados por Deduplicación Dudosa (`0.65 <= score < 0.85`)",
        "",
    ]
    for d in dudosos:
        c = d["candidato"]
        m = d["match_supabase"]
        lines.extend([
            f"### 🔸 `{d['temp_id']}`: {c['titulo']} (Score: `{d['score']}`)",
            f"- **Candidato en WhatsApp:** `{c['operacion'].upper()}` | `${c['precio']:,.0f}` | `{c['metros_cuadrados']} m²` | Sector: `{c['sector_nombre']}` | Asesor: `{c['asesor_nombre']} ({c['asesor_telefono']})`",
            f"- **Posible coincidencia en Supabase:** Código `{m.get('codigo')}` (`{m.get('id')}`) — *{m.get('titulo')}* | `${m.get('precio')}` | `{m.get('metros_cuadrados')} m²` | Ubicación: `{m.get('ubicacion')}`",
            f"- **Diferencias:** Precio: `{d['detalles'].get('diff_precio_pct')}%` | Área m²: `{d['detalles'].get('diff_m2_pct')}%`",
            "",
        ])
    md_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Skill 2: Deduplicador de Inmuebles contra Supabase MAXIMUS")
    parser.add_argument("--lote", required=True, help="Ruta a la carpeta del lote")
    args = parser.parse_args()

    lote_dir = Path(args.lote).resolve()
    repo_root = Path(__file__).resolve().parents[4]
    res = ejecutar_deduplicacion(lote_dir, repo_root)
    print(
        f"[OK] Deduplicación completada para '{res['lote']}':\n"
        f"  - Inmuebles en Supabase consultados: {res['total_inmuebles_en_supabase_consultados']}\n"
        f"  - Candidatos de entrada: {res['total_candidatos_entrada']}\n"
        f"  - Únicos verificados: {res['total_unicos_verificados']}\n"
        f"  - Duplicados descartados: {res['total_duplicados_descartados']}\n"
        f"  - Casos dudosos pausados: {res['total_dudosos_pausados']}"
    )


if __name__ == "__main__":
    main()
