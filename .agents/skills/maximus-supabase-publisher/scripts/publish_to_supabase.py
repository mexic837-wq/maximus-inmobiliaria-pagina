#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAXIMUS Inmobiliaria - Skill 4: maximus-supabase-publisher (100% Automático Vía API / Upsert)
=============================================================================================
Conecta directamente a Supabase leyendo credenciales de `.env` (o `js/config.js`),
ejecuta UPSERT (on_conflict=codigo, resolution=merge-duplicates) en la tabla `public.inmuebles`
y genera el reporte de ejecución en tiempo real sin requerir inserciones manuales en SQL.
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

# Asegurar codificación UTF-8 en stdout/stderr para Windows
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8', errors='replace')
if hasattr(sys.stderr, 'reconfigure'):
    sys.stderr.reconfigure(encoding='utf-8', errors='replace')

# Intentar importar requests y python-dotenv si están instalados
try:
    import requests
    HAS_REQUESTS = True
except ImportError:
    HAS_REQUESTS = False

try:
    from dotenv import load_dotenv
    HAS_DOTENV = True
except ImportError:
    HAS_DOTENV = False

ICONOS_VALIDOS_DASHBOARD = {
    "ph-star", "ph-waves", "ph-lightning", "ph-drop", "ph-shield-check",
    "ph-car", "ph-armchair", "ph-cooking-pot", "ph-wifi-high", "ph-snowflake",
    "ph-sun-horizon", "ph-tree", "ph-storefront", "ph-warehouse", "ph-plant",
    "ph-lock-key", "ph-bathtub", "ph-elevator", "ph-wine", "ph-trend-up",
    "ph-buildings", "ph-sparkle", "ph-check",
}


def load_config(repo_root: Path) -> Dict[str, str]:
    """Carga credenciales prioritariamente desde .env, con fallback a js/config.js"""
    env_file = repo_root / ".env"
    if env_file.exists():
        if HAS_DOTENV:
            load_dotenv(env_file, override=True)
        else:
            for line in env_file.read_text(encoding="utf-8", errors="replace").splitlines():
                line = line.strip()
                if not line or line.startswith("#"):
                    continue
                if "=" in line:
                    k, v = line.split("=", 1)
                    k, v = k.strip(), v.strip()
                    if k and v:
                        os.environ[k] = v

    url = os.environ.get("SUPABASE_URL", "").strip()
    key = os.environ.get("SUPABASE_SERVICE_ROLE_KEY", "") or os.environ.get("SUPABASE_ANON_KEY", "")
    n8n_url = os.environ.get("N8N_BASE_URL", "https://n8n.maximusinmobiliaria.tech")

    # Fallback a js/config.js si no están completas
    if not url or not key:
        config_js = repo_root / "js" / "config.js"
        if config_js.exists():
            content = config_js.read_text(encoding="utf-8", errors="replace")
            if not url:
                m_u = re.search(r"SUPABASE_URL\s*:\s*['\"]([^'\"]+)['\"]", content)
                if m_u:
                    url = m_u.group(1).rstrip("/")
            if not key:
                m_s = re.search(r"SERVICE_ROLE_KEY[^\n]*\n\s*//\s*([a-zA-Z0-9_\-\.]+)", content)
                if m_s:
                    key = m_s.group(1).strip()
                else:
                    m_k = re.search(r"SUPABASE_ANON_KEY\s*:\s*['\"]([^'\"]+)['\"]", content)
                    if m_k:
                        key = m_k.group(1).strip()

    return {"sb_url": url.rstrip("/"), "sb_key": key.strip(), "n8n_url": n8n_url}


def obtener_siguiente_correlativo_max(sb_url: str, sb_key: str) -> int:
    """Consulta los códigos existentes en Supabase para mantener la secuencia #MAX-XXX"""
    endpoint = f"{sb_url}/rest/v1/inmuebles?select=codigo"
    max_num = 106
    try:
        if HAS_REQUESTS:
            r = requests.get(endpoint, headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}"}, timeout=10)
            if r.status_code == 200:
                rows = r.json()
                for row in rows:
                    m = re.search(r"(\d+)", str(row.get("codigo") or ""))
                    if m:
                        val = int(m.group(1))
                        if 100 <= val <= 99999 and val > max_num:
                            max_num = val
        else:
            req = urllib.request.Request(endpoint, headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}"})
            with urllib.request.urlopen(req, timeout=10) as resp:
                rows = json.loads(resp.read().decode("utf-8"))
                for row in rows:
                    m = re.search(r"(\d+)", str(row.get("codigo") or ""))
                    if m:
                        val = int(m.group(1))
                        if 100 <= val <= 99999 and val > max_num:
                            max_num = val
    except Exception:
        pass
    return max_num + 1


def construir_payload_supabase(
    inm: Dict[str, Any],
    codigo: str,
    es_lote_maximus: bool,
    use_canonical_tipo: bool = False,
    omit_agente_id: bool = False,
) -> Dict[str, Any]:
    operacion = str(inm.get("operacion") or "venta").lower().strip()
    if operacion not in ("venta", "alquiler"):
        raise ValueError(f"Operación inválida: {operacion}")

    precio = float(inm.get("precio") or 0)
    if precio <= 0:
        raise ValueError(f"Precio inválido ({precio}) — Regla de Oro 1 prohíbe publicar sin precio.")

    tipo_dash = str(inm.get("tipo_sql_dashboard") or "casa").lower()
    tipo_canon = str(inm.get("tipo_sql_canonical") or "casa").lower()
    tipo_final = tipo_canon if use_canonical_tipo else tipo_dash

    habs = int(inm.get("habitaciones") or 0)
    if tipo_canon in ("local", "galpon", "terreno") and habs < 0:
        habs = 0

    banos = float(inm.get("banos") or 0.0)
    m2 = float(inm.get("metros_cuadrados") or 0.0)
    estac_int = int(inm.get("estacionamientos") or 0)
    estac_ui = str(inm.get("estacionamientos_ui") or f"{estac_int} Puestos")
    precio_m2 = round(precio / m2) if m2 > 0 else 0

    is_maximus_flag = bool(inm.get("is_maximus", es_lote_maximus))

    aspectos_raw = inm.get("aspectos_destacados") or []
    aspectos_limpios = []
    for asp in aspectos_raw[:4]:
        titulo_asp = str(asp.get("titulo") or "Destacado")
        desc_asp = str(asp.get("desc") or "")
        if not is_maximus_flag and ("maximus" in titulo_asp.lower() or "maximus" in desc_asp.lower()):
            titulo_asp = "Disponibilidad Inmediata"
            desc_asp = "Inmueble captado en red de aliados inmobiliarios del Táchira."
        ico = asp.get("icono", "ph-star")
        if ico not in ICONOS_VALIDOS_DASHBOARD:
            ico = "ph-star"
        aspectos_limpios.append({
            "icono": ico,
            "titulo": titulo_asp,
            "desc": desc_asp,
        })

    amenidades_raw = inm.get("amenidades") or []
    amenidades_limpias = [
        {"icono": "ph-check", "nombre": str(a.get("nombre") if isinstance(a, dict) else a)}
        for a in amenidades_raw
    ]

    fotos = [f for f in (inm.get("fotos") or []) if f]
    foto_principal = fotos[0] if fotos else (
        inm.get("foto_principal") or "https://images.unsplash.com/photo-1600596542815-ffad4c1539a9?w=1200&q=85"
    )

    flujo_txt = "Captación Directa MAXIMUS" if is_maximus_flag else "Captación Externa WhatsApp"
    notas_privadas = (
        f"[{flujo_txt}] Modo: {inm.get('modo_entrada', 'modo_1')} | "
        f"Grupo/Carpeta: {inm.get('grupo_origen', 'N/D')} | "
        f"Estacionamiento UI: {estac_ui} | Precio m²: ${precio_m2} USD/m²"
    )

    agente_id_val = None if (not is_maximus_flag or omit_agente_id) else inm.get("agente_id")

    return {
        "codigo": codigo,
        "titulo": str(inm.get("titulo") or "").strip(),
        "subtitulo": str(inm.get("subtitulo") or "").strip(),
        "descripcion": str(inm.get("descripcion") or "").strip(),
        "precio": precio,
        "moneda": str(inm.get("moneda") or ("USD/mes" if operacion == "alquiler" else "USD")),
        "operacion": operacion,
        "tipo": tipo_final,
        "estatus": "disponible",
        "ubicacion": str(inm.get("ubicacion") or "San Cristóbal, Táchira"),
        "estado": "Táchira",
        "sector_nombre": str(inm.get("sector_nombre") or "San Cristóbal"),
        "sector_desc": str(inm.get("sector_desc") or ""),
        "habitaciones": habs,
        "banos": banos,
        "metros_cuadrados": m2,
        "estacionamientos": estac_int,
        "foto_principal": foto_principal,
        "fotos": fotos,
        "is_maximus": is_maximus_flag,
        "en_oferta": is_maximus_flag,
        "comision_porcentaje": float(inm.get("comision_porcentaje") or 5.0),
        "asesor_nombre": str(inm.get("asesor_nombre") or ("José Guerrero" if is_maximus_flag else "Asesor Externo")),
        "asesor_telefono": str(inm.get("asesor_telefono") or "+58 424-1234567"),
        "aspectos_destacados": aspectos_limpios,
        "amenidades": amenidades_limpias,
        "notas_privadas": notas_privadas,
        "agente_id": agente_id_val,
    }


def upsert_en_supabase(
    inm_raw: Dict[str, Any],
    codigo: str,
    es_lote_maximus: bool,
    sb_url: str,
    sb_key: str,
) -> Tuple[Optional[Dict[str, Any]], Optional[str]]:
    """Ejecuta Upsert directo en Supabase usando Prefer: resolution=merge-duplicates y on_conflict=codigo"""
    endpoint = f"{sb_url}/rest/v1/inmuebles?on_conflict=codigo"
    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates,return=representation",
    }

    # Intentar combinaciones seguras si la BD tiene restricciones de tipo canónico o agente_id
    attempts = [
        (False, False),
        (True, False),
        (True, True),
    ]
    last_err = None
    for use_canon, omit_ag in attempts:
        row_try = construir_payload_supabase(
            inm_raw, codigo=codigo, es_lote_maximus=es_lote_maximus,
            use_canonical_tipo=use_canon, omit_agente_id=omit_ag
        )
        if HAS_REQUESTS:
            try:
                r = requests.post(endpoint, json=row_try, headers=headers, timeout=20)
                if r.status_code in (200, 201):
                    res_arr = r.json()
                    return (res_arr[0] if isinstance(res_arr, list) and len(res_arr) > 0 else row_try), None
                else:
                    last_err = f"HTTP {r.status_code}: {r.text}"
                    continue
            except Exception as e:
                return None, str(e)
        else:
            req = urllib.request.Request(
                endpoint,
                data=json.dumps(row_try).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            try:
                with urllib.request.urlopen(req, timeout=20) as resp:
                    res_data = json.loads(resp.read().decode("utf-8"))
                    if isinstance(res_data, list) and len(res_data) > 0:
                        return res_data[0], None
                    return row_try, None
            except urllib.error.HTTPError as e:
                err_body = e.read().decode("utf-8", errors="replace")
                last_err = f"HTTPError {e.code}: {err_body}"
                continue
            except Exception as e:
                return None, str(e)

    return None, last_err


def limpiar_externos_en_supabase(sb_url: str, sb_key: str) -> int:
    """Elimina los registros externos anteriores (is_maximus=false) para re-sincronizar limpio"""
    endpoint = f"{sb_url}/rest/v1/inmuebles?is_maximus=eq.false"
    headers = {
        "apikey": sb_key,
        "Authorization": f"Bearer {sb_key}",
        "Prefer": "return=representation",
    }
    try:
        if HAS_REQUESTS:
            r = requests.delete(endpoint, headers=headers, timeout=20)
            if r.status_code in (200, 204):
                rows = r.json() if r.text else []
                return len(rows)
        else:
            req = urllib.request.Request(endpoint, headers=headers, method="DELETE")
            with urllib.request.urlopen(req, timeout=20) as resp:
                raw = resp.read().decode("utf-8")
                rows = json.loads(raw) if raw else []
                return len(rows)
    except Exception as e:
        print(f"  ⚠️ Aviso limpiando registros externos previos: {e}")
    return 0


def publicar_lote(lote_dir: Path, repo_root: Path, dry_run: bool = False, notify_n8n: bool = False, clean_external: bool = False) -> Dict[str, Any]:
    procesados_dir = lote_dir / "procesados"
    dedup_json = procesados_dir / "inmuebles_deduplicados.json"
    extraidos_json = procesados_dir / "inmuebles_extraidos.json"

    target_json = dedup_json if dedup_json.exists() else extraidos_json
    if not target_json.exists():
        raise FileNotFoundError(f"No existe archivo de inmuebles procesados en {procesados_dir}")

    data = json.loads(target_json.read_text(encoding="utf-8"))
    extraidos_data = json.loads(extraidos_json.read_text(encoding="utf-8")) if extraidos_json.exists() else {}

    ruta_lote_str = str(lote_dir.resolve()).lower().replace("\\", "/")
    es_lote_maximus = ("captaciones_maximus" in ruta_lote_str) or bool(extraidos_data.get("is_maximus_default", False))

    inmuebles_a_publicar = data.get("unicos_verificados") if "unicos_verificados" in data else data.get("inmuebles", [])
    duplicados_descartados = data.get("duplicados_descartados", [])
    dudosos_pausados = data.get("dudosos_pausados", [])
    pendientes_regla1 = extraidos_data.get("pendientes_revision", [])
    stats_img = data.get("estadisticas_imagenes", {})

    cfg = load_config(repo_root)
    if clean_external and not dry_run:
        borrados = limpiar_externos_en_supabase(cfg["sb_url"], cfg["sb_key"])
        print(f"🧹 Limpieza previa en Supabase: {borrados} registros externos anteriores eliminados.")
    corr_num = obtener_siguiente_correlativo_max(cfg["sb_url"], cfg["sb_key"]) if not dry_run else 107

    creados = []
    errores_publicacion = []

    print(f"\n🚀 Iniciando sincronización 100% automatizada con Supabase ({'DRY-RUN' if dry_run else 'EN VIVO'})...")
    print(f"📡 Endpoint: {cfg['sb_url']}/rest/v1/inmuebles?on_conflict=codigo")
    print(f"📦 Total inmuebles únicos a procesar: {len(inmuebles_a_publicar)}\n")

    for i, inm in enumerate(inmuebles_a_publicar):
        codigo = f"#MAX-{corr_num}"
        corr_num += 1
        try:
            payload_sb = construir_payload_supabase(inm, codigo=codigo, es_lote_maximus=es_lote_maximus)
        except Exception as val_err:
            errores_publicacion.append({
                "temp_id": inm.get("temp_id"),
                "titulo": inm.get("titulo"),
                "error": str(val_err),
            })
            continue

        if dry_run:
            creados.append({
                "id": f"dry-run-{inm.get('temp_id')}",
                "codigo": codigo,
                "titulo": payload_sb["titulo"],
                "tipo": inm.get("tipo_ui"),
                "operacion": payload_sb["operacion"].upper(),
                "precio": payload_sb["precio"],
                "moneda": payload_sb["moneda"],
                "precio_m2": inm.get("precio_m2"),
                "sector": payload_sb["sector_nombre"],
                "metros_cuadrados": payload_sb["metros_cuadrados"],
                "habitaciones": payload_sb["habitaciones"],
                "banos": payload_sb["banos"],
                "estacionamientos_ui": inm.get("estacionamientos_ui"),
                "is_maximus": payload_sb["is_maximus"],
                "tipo_asesor": "Oficial MAXIMUS" if payload_sb["is_maximus"] else "Asesor Externo",
                "asesor_info": f"{payload_sb['asesor_nombre']} ({payload_sb['asesor_telefono']})",
                "fotos_count": len(payload_sb["fotos"]),
                "modo": "DRY-RUN (Simulación)",
            })
            print(f"  [{i+1}/{len(inmuebles_a_publicar)}] [DRY-RUN] {codigo} | {payload_sb['titulo']} (${payload_sb['precio']:,.0f} {payload_sb['moneda']})")
        else:
            inserted, err = upsert_en_supabase(inm, codigo, es_lote_maximus, cfg["sb_url"], cfg["sb_key"])
            if inserted:
                inserted_id = inserted.get("id", "OK")
                creados.append({
                    "id": inserted_id,
                    "codigo": inserted.get("codigo", codigo),
                    "titulo": payload_sb["titulo"],
                    "tipo": inm.get("tipo_ui"),
                    "operacion": payload_sb["operacion"].upper(),
                    "precio": payload_sb["precio"],
                    "moneda": payload_sb["moneda"],
                    "precio_m2": inm.get("precio_m2"),
                    "sector": payload_sb["sector_nombre"],
                    "metros_cuadrados": payload_sb["metros_cuadrados"],
                    "habitaciones": payload_sb["habitaciones"],
                    "banos": payload_sb["banos"],
                    "estacionamientos_ui": inm.get("estacionamientos_ui"),
                    "is_maximus": payload_sb["is_maximus"],
                    "tipo_asesor": "Oficial MAXIMUS" if payload_sb["is_maximus"] else "Asesor Externo",
                    "asesor_info": f"{payload_sb['asesor_nombre']} ({payload_sb['asesor_telefono']})",
                    "fotos_count": len(payload_sb["fotos"]),
                    "modo": "SUPABASE LIVE (UPSERT)",
                })
                print(f"  ✅ [{i+1}/{len(inmuebles_a_publicar)}] [UPSERT] {codigo} | {payload_sb['titulo']} (${payload_sb['precio']:,.0f} {payload_sb['moneda']}) -> BD OK (ID: {inserted_id})")
            else:
                errores_publicacion.append({
                    "temp_id": inm.get("temp_id"),
                    "titulo": inm.get("titulo"),
                    "error": err,
                })
                print(f"  ❌ [{i+1}/{len(inmuebles_a_publicar)}] [ERROR] {codigo} | {payload_sb['titulo']} -> {err}")

    # Guardar archivo de salida json de creados
    creados_json_path = procesados_dir / "inmuebles_creados.json"
    creados_json_path.write_text(json.dumps({"total": len(creados), "inmuebles": creados}, indent=2, ensure_ascii=False), encoding="utf-8")

    generar_reporte_ejecucion(
        lote_dir=lote_dir,
        es_lote_maximus=es_lote_maximus,
        creados=creados,
        duplicados=duplicados_descartados,
        stats_img=stats_img,
        pendientes_regla1=pendientes_regla1,
        dudosos=dudosos_pausados,
        errores=errores_publicacion,
        dry_run=dry_run,
    )

    return {
        "lote": lote_dir.name,
        "flujo_carpeta": "captaciones_maximus" if es_lote_maximus else "captaciones_externas",
        "dry_run": dry_run,
        "total_creados": len(creados),
        "total_duplicados_descartados": len(duplicados_descartados),
        "total_casos_dudosos_o_pendientes": len(pendientes_regla1) + len(dudosos_pausados),
        "errores_count": len(errores_publicacion),
    }


def generar_reporte_ejecucion(
    lote_dir: Path,
    es_lote_maximus: bool,
    creados: List[Dict[str, Any]],
    duplicados: List[Dict[str, Any]],
    stats_img: Dict[str, Any],
    pendientes_regla1: List[Dict[str, Any]],
    dudosos: List[Dict[str, Any]],
    errores: List[Dict[str, Any]],
    dry_run: bool,
) -> None:
    report_path = lote_dir / "reporte_ejecucion.md"
    parent_report = lote_dir.parent / "reporte_resultado.md"
    modo_badge = "🧪 SIMULACIÓN (DRY-RUN)" if dry_run else "🟢 PRODUCCIÓN (SUPABASE LIVE)"
    flujo_badge = "🏛️ CAPTACIONES DIRECTAS MAXIMUS (`is_maximus = true`)" if es_lote_maximus else "📥 CAPTACIONES EXTERNAS (`is_maximus = false`)"

    lines = [
        f"# 📊 Reporte de Ejecución del Agente Captador MAXIMUS — `{lote_dir.name}`",
        "",
        f"- **Fecha y Hora de Ejecución:** `{datetime.now().strftime('%Y-%m-%d %H:%M:%S')}`",
        f"- **Flujo de Carpeta:** **{flujo_badge}**",
        f"- **Modo de Ejecución:** **{modo_badge}**",
        f"- **Inmuebles Insertados/Actualizados en Supabase:** `{len(creados)}`",
        f"- **Duplicados Descartados (Skill 2):** `{len(duplicados)}`",
        f"- **Fotografías Procesadas y Subidas a Storage:** `{stats_img.get('total_subidas_supabase_storage', stats_img.get('total_imagenes_individuales_generadas', 0))}`",
        f"- **Casos en Revisión Humana (`pendientes_revision.md`):** `{len(pendientes_regla1) + len(dudosos)}`",
        "",
        "---",
        "",
        "## 1. 🏛️ Inmuebles Registrados en Catálogo Oficial (`public.inmuebles`)",
        "",
    ]

    if not creados:
        lines.append("_No se insertaron inmuebles en esta corrida._\n")
    else:
        lines.extend([
            "| Código | ID Supabase | Título | Tipo | Operación | Precio | $/m² | Sector | Especificaciones | `is_maximus` | Asesor Responsable | Fotos |",
            "| :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :--- | :---: | :--- | :---: |",
        ])
        for c in creados:
            precio_str = f"${c['precio']:,.0f} {c['moneda']}"
            pm2_str = f"${c['precio_m2']}" if c.get("precio_m2") else "N/D"
            specs = f"{c['habitaciones']}H · {c['banos']}B · {c['estacionamientos_ui']} · {c['metros_cuadrados']}m²"
            lines.append(
                f"| **{c['codigo']}** | `{c['id']}` | {c['titulo']} | {c['tipo']} | {c['operacion']} | **{precio_str}** | {pm2_str} | {c['sector']} | {specs} | `{c['is_maximus']}` | **{c['tipo_asesor']}:** {c['asesor_info']} | {c['fotos_count']} |"
            )
        lines.append("")

    if duplicados:
        lines.extend([
            "---",
            "",
            "## 2. 🚫 Inmuebles Duplicados Descartados (Skill 2: Deduplicador)",
            "",
            "| Candidato | Título / Propiedad | Sector | Precio | Área m² | Score | Causa del Descarte |",
            "| :--- | :--- | :--- | :--- | :--- | :---: | :--- |",
        ])
        for d in duplicados:
            lines.append(
                f"| `{d.get('temp_id')}` | {d.get('titulo')} | {d.get('sector')} | ${float(d.get('precio') or 0):,.0f} | {d.get('metros_cuadrados')} m² | `{d.get('score')}` | {d.get('origen_duplicado')} |"
            )
        lines.append("")

    if pendientes_regla1 or dudosos:
        lines.extend([
            "---",
            "",
            "## 3. ⚠️ Casos Pendientes de Revisión (Regla de Oro 1: Cero Invención)",
            "",
            f"Se preservaron **{len(pendientes_regla1) + len(dudosos)}** mensajes sin publicar automáticamente debido a datos incompletos en el chat o solicitudes. Ver [`pendientes_revision.md`](./procesados/pendientes_revision.md).\n",
        ])

    contenido_md = "\n".join(lines)
    report_path.write_text(contenido_md, encoding="utf-8")
    parent_report.write_text(contenido_md, encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Skill 4: Publicador Automático de Inmuebles en Supabase MAXIMUS (Upsert Live)")
    parser.add_argument("--lote", required=True, help="Ruta a la carpeta del lote")
    parser.add_argument("--dry-run", action="store_true", help="Simula validación sin enviar a Supabase")
    parser.add_argument("--notify-n8n", action="store_true", help="Dispara el webhook de n8n por cada inmueble publicado")
    parser.add_argument("--clean-external", action="store_true", help="Elimina registros externos anteriores antes de insertar")
    args = parser.parse_args()

    lote_dir = Path(args.lote).resolve()
    repo_root = Path(__file__).resolve().parents[4]
    res = publicar_lote(lote_dir, repo_root, dry_run=args.dry_run, notify_n8n=args.notify_n8n, clean_external=args.clean_external)
    print(
        f"\n✨ [COMPLETADO] Publicación finalizada para '{res['lote']}':\n"
        f"  - Inmuebles insertados/actualizados en Supabase: {res['total_creados']}\n"
        f"  - Duplicados descartados: {res['total_duplicados_descartados']}\n"
        f"  - Casos en pendientes_revision.md: {res['total_casos_dudosos_o_pendientes']}\n"
        f"  - Errores de API: {res['errores_count']}\n"
        f"  - Reporte: {lote_dir / 'reporte_ejecucion.md'}\n"
    )


if __name__ == "__main__":
    main()
