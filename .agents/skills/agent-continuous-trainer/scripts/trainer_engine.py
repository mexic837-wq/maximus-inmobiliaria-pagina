#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAXIMUS Inmobiliaria - Skill 5: agent-continuous-trainer
=========================================================
Motor de Auto-Entrenamiento del Agente Captador de WhatsApp:
  - Modo 1 (`hot-fix`): Corrige un registro directamente en Supabase (`public.inmuebles`
    por `id` o `codigo`) y anota la regla aprendida en `agente_whatsapp/memoria/aprendizajes.md`.
  - Modo 2 (`consolidate`): Toma las reglas `[PENDIENTE_CONSOLIDAR]` de `memoria/aprendizajes.md`
    y actualiza automáticamente los diccionarios y parámetros en los scripts de las
    skills 1, 2, 3 y 4, marcándolas como `[CONSOLIDADO EN CÓDIGO]`.
"""

import os
import re
import json
import argparse
import urllib.request
import urllib.parse
import urllib.error
from datetime import datetime
from pathlib import Path
from typing import Dict, Any, Tuple, Optional, List


def load_supabase_config(repo_root: Path) -> Tuple[str, str]:
    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")
    config_js = repo_root / "js" / "config.js"
    if config_js.exists():
        content = config_js.read_text(encoding="utf-8", errors="replace")
        if not url:
            m_u = re.search(r"SUPABASE_URL\s*:\s*['\"]([^'\"]+)['\"]", content)
            if m_u:
                url = m_u.group(1).rstrip("/")
        if not key:
            m_k = re.search(r"SUPABASE_ANON_KEY\s*:\s*['\"]([^'\"]+)['\"]", content)
            if m_k:
                key = m_k.group(1).strip()
    return url, key


def actualizar_registro_supabase(
    repo_root: Path,
    inmueble_id: Optional[str],
    codigo: Optional[str],
    updates: Dict[str, Any],
) -> Tuple[bool, str]:
    """Actualiza en caliente un inmueble en `public.inmuebles` en Supabase."""
    if not updates:
        return True, "Sin cambios solicitados para Supabase"

    sb_url, sb_key = load_supabase_config(repo_root)
    if inmueble_id:
        filtro = f"id=eq.{urllib.parse.quote(str(inmueble_id))}"
    elif codigo:
        filtro = f"codigo=eq.{urllib.parse.quote(str(codigo))}"
    else:
        return False, "No se especificó --id ni --codigo para actualizar en Supabase"

    endpoint = f"{sb_url}/rest/v1/inmuebles?{filtro}"
    req = urllib.request.Request(
        endpoint,
        data=json.dumps(updates).encode("utf-8"),
        headers={
            "apikey": sb_key,
            "Authorization": f"Bearer {sb_key}",
            "Content-Type": "application/json",
            "Prefer": "return=representation",
        },
        method="PATCH",
    )
    try:
        with urllib.request.urlopen(req, timeout=15) as resp:
            body = json.loads(resp.read().decode("utf-8"))
            return True, f"Actualizado en Supabase ({len(body) if isinstance(body, list) else 1} fila(s))"
    except urllib.error.HTTPError as e:
        return False, f"HTTPError {e.code}: {e.read().decode('utf-8', errors='replace')}"
    except Exception as e:
        return False, str(e)


def registrar_aprendizaje_en_memoria(
    aprendizajes_path: Path,
    seccion: str,
    regla: str,
    zona_structured: Optional[Dict[str, str]] = None,
    crop_structured: Optional[Dict[str, Any]] = None,
) -> str:
    """Inserta la regla aprendida dentro de la sección correspondiente de `memoria/aprendizajes.md`."""
    content = aprendizajes_path.read_text(encoding="utf-8")
    fecha_hoy = datetime.now().strftime("%Y-%m-%d %H:%M")

    etiqueta = f"- **[{fecha_hoy}] [PENDIENTE_CONSOLIDAR]** {regla}"
    if zona_structured:
        etiqueta += (
            f"\n  - `[AUTO_ZONA]` `regex=\"{zona_structured['regex']}\"` | "
            f"`sector=\"{zona_structured['sector']}\"` | "
            f"`ubicacion=\"{zona_structured['ubicacion']}\"` | "
            f"`desc=\"{zona_structured['desc']}\"`"
        )
    if crop_structured:
        etiqueta += (
            f"\n  - `[AUTO_CROP]` `perfil=\"{crop_structured['perfil']}\"` | "
            f"`top_crop={crop_structured['top_crop']}` | "
            f"`bottom_crop={crop_structured['bottom_crop']}`"
        )

    mapa_secciones = {
        "1": "## SECCIÓN 2:",
        "2": "## SECCIÓN 3:",
        "3": "## SECCIÓN 4:",
        "4": None,
    }
    marker_siguiente = mapa_secciones.get(str(seccion))
    if marker_siguiente and marker_siguiente in content:
        partes = content.split(marker_siguiente, 1)
        nuevo_contenido = partes[0].rstrip() + "\n\n" + etiqueta + "\n\n---\n\n" + marker_siguiente + partes[1]
    else:
        nuevo_contenido = content.rstrip() + "\n\n" + etiqueta + "\n"

    aprendizajes_path.write_text(nuevo_contenido, encoding="utf-8")
    return etiqueta


def consolidar_aprendizajes_en_codigo(repo_root: Path) -> Dict[str, Any]:
    """
    Lee todas las reglas `[PENDIENTE_CONSOLIDAR]` en `agente_whatsapp/memoria/aprendizajes.md`,
    actualiza los scripts de las skills y marca las reglas como `[CONSOLIDADO EN CÓDIGO]`.
    """
    aprendizajes_path = repo_root / "agente_whatsapp" / "memoria" / "aprendizajes.md"
    parser_script = repo_root / ".agents" / "skills" / "whatsapp-property-parser" / "scripts" / "parse_whatsapp_batch.py"
    cleaner_script = repo_root / ".agents" / "skills" / "property-image-cleaner" / "scripts" / "clean_images.py"

    content = aprendizajes_path.read_text(encoding="utf-8")
    zonas_inyectadas = 0
    crops_inyectados = 0

    # 1. Consolidar etiquetas [AUTO_ZONA] en parse_whatsapp_batch.py
    pat_zona = re.compile(
        r'`\[AUTO_ZONA\]`\s*`regex="([^"]+)"`\s*\|\s*`sector="([^"]+)"`\s*\|\s*`ubicacion="([^"]+)"`\s*\|\s*`desc="([^"]+)"`'
    )
    if parser_script.exists():
        parser_code = parser_script.read_text(encoding="utf-8")
        for m in pat_zona.finditer(content):
            rgx, sec, ubi, desc = m.groups()
            if f'"{sec}"' not in parser_code:
                nueva_tupla = f'    (r"\\b({rgx})\\b",\n     "{sec}", "{ubi}",\n     "{desc}"),\n'
                parser_code = parser_code.replace("ZONAS_TACHIRA = [\n", "ZONAS_TACHIRA = [\n" + nueva_tupla, 1)
                zonas_inyectadas += 1
        parser_script.write_text(parser_code, encoding="utf-8")

    # 2. Consolidar etiquetas [AUTO_CROP] en clean_images.py
    pat_crop = re.compile(
        r'`\[AUTO_CROP\]`\s*`perfil="([^"]+)"`\s*\|\s*`top_crop=([0-9.]+)`\s*\|\s*`bottom_crop=([0-9.]+)`'
    )
    if cleaner_script.exists():
        cleaner_code = cleaner_script.read_text(encoding="utf-8")
        for m in pat_crop.finditer(content):
            perfil, top_c, bot_c = m.groups()
            perfil_low = perfil.lower().strip()
            entry_str = f'    "{perfil_low}": {{"top_crop": {float(top_c)}, "bottom_crop": {float(bot_c)}}},'
            if f'"{perfil_low}"' in cleaner_code:
                cleaner_code = re.sub(
                    rf'^\s*"{re.escape(perfil_low)}"\s*:\s*\{{[^\}}]+\}},?',
                    entry_str,
                    cleaner_code,
                    flags=re.MULTILINE,
                )
            else:
                cleaner_code = cleaner_code.replace(
                    "PERFILES_MARCA_AGUA = {\n",
                    "PERFILES_MARCA_AGUA = {\n" + entry_str + "\n",
                    1,
                )
            crops_inyectados += 1
        cleaner_script.write_text(cleaner_code, encoding="utf-8")

    # 3. Marcar [PENDIENTE_CONSOLIDAR] -> [CONSOLIDADO EN CÓDIGO]
    total_pendientes = content.count("[PENDIENTE_CONSOLIDAR]")
    fecha_cons = datetime.now().strftime("%Y-%m-%d")
    nuevo_content = content.replace("[PENDIENTE_CONSOLIDAR]", f"[CONSOLIDADO EN CÓDIGO {fecha_cons}]")
    aprendizajes_path.write_text(nuevo_content, encoding="utf-8")

    return {
        "reglas_consolidadas": total_pendientes,
        "zonas_inyectadas_en_parser": zonas_inyectadas,
        "perfiles_crop_actualizados_en_cleaner": crops_inyectados,
    }


def main():
    parser = argparse.ArgumentParser(description="Skill 5: Motor de Auto-Entrenamiento Continuo MAXIMUS")
    sub = parser.add_subparsers(dest="mode", required=True)

    # Subcomando 1: hot-fix (Captura en Caliente)
    p_hot = sub.add_parser("hot-fix", help="Corrige en Supabase y anota el aprendizaje en memoria/aprendizajes.md")
    p_hot.add_argument("--id", help="UUID o ID del inmueble en Supabase")
    p_hot.add_argument("--codigo", help="Código del inmueble en Supabase (ej. #MAX-107)")
    p_hot.add_argument("--updates", help="JSON string con campos a actualizar en Supabase", default="{}")
    p_hot.add_argument("--seccion", choices=["1", "2", "3", "4"], default="1", help="Sección de memoria/aprendizajes.md (1..4)")
    p_hot.add_argument("--regla", required=True, help="Descripción clara de la regla aprendida")
    p_hot.add_argument("--nueva-zona-json", help='Opcional JSON: {"regex":"...","sector":"...","ubicacion":"...","desc":"..."}')
    p_hot.add_argument("--nuevo-crop-json", help='Opcional JSON: {"perfil":"remax","top_crop":0.02,"bottom_crop":0.14}')

    # Subcomando 2: consolidate (Consolidación de Código)
    sub.add_parser("consolidate", help="Consolida las reglas de memoria/aprendizajes.md en el código de las skills")

    args = parser.parse_args()
    repo_root = Path(__file__).resolve().parents[4]
    aprendizajes_path = repo_root / "agente_whatsapp" / "memoria" / "aprendizajes.md"

    if args.mode == "hot-fix":
        updates_dict = json.loads(args.updates) if args.updates else {}
        if updates_dict and (args.id or args.codigo):
            ok, msg_sb = actualizar_registro_supabase(repo_root, args.id, args.codigo, updates_dict)
            print(f"[Supabase Hot-Fix] {msg_sb} (ok={ok})")

        zona_obj = json.loads(args.nueva_zona_json) if args.nueva_zona_json else None
        crop_obj = json.loads(args.nuevo_crop_json) if args.nuevo_crop_json else None
        etiqueta = registrar_aprendizaje_en_memoria(
            aprendizajes_path=aprendizajes_path,
            seccion=args.seccion,
            regla=args.regla,
            zona_structured=zona_obj,
            crop_structured=crop_obj,
        )
        print(f"[Memoria Actualizada] Se registró en Sección {args.seccion} de aprendizajes.md:\n{etiqueta}")

    elif args.mode == "consolidate":
        res = consolidar_aprendizajes_en_codigo(repo_root)
        print(
            f"[Consolidación Completada]\n"
            f"  - Reglas marcadas como consolidadas: {res['reglas_consolidadas']}\n"
            f"  - Zonas inyectadas en parse_whatsapp_batch.py: {res['zonas_inyectadas_en_parser']}\n"
            f"  - Perfiles de recorte actualizados en clean_images.py: {res['perfiles_crop_actualizados_en_cleaner']}"
        )


if __name__ == "__main__":
    main()
