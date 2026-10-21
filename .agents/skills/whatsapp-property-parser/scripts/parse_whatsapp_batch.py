#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
MAXIMUS Inmobiliaria - Skill 1: whatsapp-property-parser (Multi-Formato & Dual-Flow)
====================================================================================
Soporta:
  A) Flujo por Carpeta:
     - `captaciones_externas/` -> is_maximus = False, Asesor Externo (+58 4XX XXXXXXX)
     - `captaciones_maximus/`  -> is_maximus = True, Asesor Oficial MAXIMUS (vinculado con
       `public.asesores_maximus` y `public.equipo_web` en Supabase).
  B) 3 Modos de Emparejamiento Texto + Imágenes:
     - Modo 1: Exportación Nativa de WhatsApp (.zip auto-descomprimido o _chat.txt + fotos),
       agrupando álbumes de fotos + texto del mismo remitente en un rango de ±3 minutos
       sin mezclar mensajes de otros remitentes.
     - Modo 2: Captura de Pantalla Completa de WhatsApp Web (`screenshot`), extrayendo con
       OCR/Visión el teléfono arriba, la foto en medio y la descripción abajo, y marcando
       la captura para recorte de recuadro fotográfico interior en `property-image-cleaner`.
     - Modo 3: Subcarpetas Manuales (`inmueble_01/`, `inmueble_02/` con `info.txt` + fotos sueltas).
"""

import os
import re
import sys
import json
import zipfile
import argparse
import urllib.request
from datetime import datetime
from pathlib import Path
from typing import List, Dict, Any, Optional, Tuple

try:
    import pytesseract
    from PIL import Image
    HAS_OCR = True
except ImportError:
    HAS_OCR = False


# ==============================================================================
# ASESORES OFICIALES MAXIMUS (Respaldo Semilla de migration-asesores-maximus-rls.sql
# y migration-equipo-web-rls.sql + Consulta en vivo a Supabase)
# ==============================================================================
ASESORES_MAXIMUS_FALLBACK = [
    {
        "id": "a0000001-0000-0000-0000-000000000001",
        "nombre": "José Guerrero",
        "cargo": "Director / Captador Principal",
        "telefono": "+58 424-1234567",
        "keywords": ["jose guerrero", "josé guerrero", "guerrero"],
        "es_principal": True,
    },
    {
        "id": "eq-001",
        "nombre": "Lic. Eva Camargo",
        "cargo": "Directora Comercial",
        "telefono": "+58 424-1234567",
        "keywords": ["eva camargo", "camargo"],
        "es_principal": False,
    },
    {
        "id": "a0000001-0000-0000-0000-000000000002",
        "nombre": "Valeria Méndez",
        "cargo": "Especialista en Apartamentos",
        "telefono": "+58 414-9876543",
        "keywords": ["valeria mendez", "valeria méndez", "valeria"],
        "es_principal": False,
    },
    {
        "id": "a0000001-0000-0000-0000-000000000003",
        "nombre": "Carlos Santander",
        "cargo": "Especialista Inversiones",
        "telefono": "+58 412-9876543",
        "keywords": ["carlos santander", "santander", "carlos alviarez", "alviarez"],
        "es_principal": False,
    },
    {
        "id": "a0000001-0000-0000-0000-000000000004",
        "nombre": "Andrea Colmenares",
        "cargo": "Comercial & Industrial",
        "telefono": "+58 416-3334455",
        "keywords": ["andrea colmenares", "colmenares", "mariangel rivas", "mariángel rivas"],
        "es_principal": False,
    },
    {
        "id": "eq-003",
        "nombre": "María Rodríguez",
        "cargo": "Asesora Inmobiliaria",
        "telefono": "+58 412-5557890",
        "keywords": ["maria rodriguez", "maría rodríguez"],
        "es_principal": False,
    },
    {
        "id": "eq-004",
        "nombre": "Carlos Mendoza",
        "cargo": "Asesor de Inversiones",
        "telefono": "+58 424-7778899",
        "keywords": ["carlos mendoza"],
        "es_principal": False,
    },
]


# ==============================================================================
# DICCIONARIO DE ZONAS Y SECTORES DEL ESTADO TÁCHIRA
# ==============================================================================
ZONAS_TACHIRA = [
    (r"\b(barrio\s+obrero|b\.?o\.?|pasaje\s+acueducto|plaza\s+los\s+mangos|carrera\s+1[89]|calle\s+1[0-5])\b",
     "Barrio Obrero", "Barrio Obrero, San Cristóbal",
     "Zona comercial y residencial consolidada en el corazón de San Cristóbal, con acceso inmediato a servicios, gastronomía y transporte."),
    (r"\b(pueblo\s+nuevo|av\.?\s+espa[ñn]a|plaza\s+de\s+toros|pol[ií]gono\s+de\s+tiro|los\s+kioscos)\b",
     "Pueblo Nuevo", "Pueblo Nuevo, San Cristóbal",
     "Sector residencial de altísima demanda y plusvalía continua en San Cristóbal, rodeado de centros empresariales, clínicas y comercios exclusivos."),
    (r"\b(guaparo|urb\.?\s+guaparo)\b",
     "Urbanización Guaparo", "Urbanización Guaparo, San Cristóbal",
     "Ubicada en una de las zonas residenciales más consolidadas, seguras y cotizadas de San Cristóbal."),
    (r"\b(pirineos\s+ii|pirineos\s+2|pirineos\s+i|los\s+pirineos|pirineos|don\s+bosco)\b",
     "Los Pirineos", "Los Pirineos, San Cristóbal",
     "Zona alta residencial caracterizada por su clima fresco de montaña, urbanismos organizados y excelente conectividad vial."),
    (r"\b(quinimar[ií]|urb\.?\s+quinimar[ií])\b",
     "Quinimarí", "Quinimarí, San Cristóbal",
     "Sector residencial exclusivo al este de la ciudad con clima fresco, tranquilidad y excelente entorno familiar."),
    (r"\b(las\s+lomas|av\.?\s+libertador)\b",
     "Las Lomas", "Las Lomas, San Cristóbal",
     "Sector residencial tranquilo, seguro y cercano a las principales arterias viales de San Cristóbal."),
    (r"\b(zona\s+industrial\s+paramillo|z\.?i\.?\s+paramillo)\b",
     "Zona Industrial Paramillo", "Zona Industrial Paramillo, San Cristóbal",
     "Zona industrial consolidada al norte de la ciudad con fácil acceso para transporte pesado y logística."),
    (r"\b(paramillo|altos\s+de\s+paramillo|colinas\s+de\s+paramillo)\b",
     "Paramillo", "Paramillo, San Cristóbal",
     "Sector de alto crecimiento urbanístico y residencial al norte de San Cristóbal, con excelente proyección de revalorización."),
    (r"\b(zona\s+industrial\s+barrancas|barrancas)\b",
     "Zona Industrial Barrancas", "Zona Industrial Barrancas, San Cristóbal",
     "Complejo industrial y comercial estratégico con amplias vías de acceso para carga y operaciones corporativas."),
    (r"\b(av\.?\s+19\s+de\s+abril|19\s+de\s+abril)\b",
     "Av. 19 de Abril", "Av. 19 de Abril, San Cristóbal",
     "Arteria comercial y empresarial neurálgica de la ciudad con máxima visibilidad para marcas líderes."),
    (r"\b(la\s+castellana|urb\.?\s+la\s+castellana|av\.?\s+ferrero\s+tamayo|ferrero\s+tamayo)\b",
     "La Castellana", "La Castellana, San Cristóbal",
     "Excelente sector residencial y comercial de la parte alta de San Cristóbal con rápido acceso a toda la ciudad."),
    (r"\b(el\s+bosque|res\.?\s+el\s+bosque)\b",
     "Residencias El Bosque", "Residencias El Bosque, San Cristóbal",
     "Conjunto residencial estratégico con excelente ubicación y acceso directo a las principales avenidas."),
    (r"\b(sambil|c\.?c\.?\s+sambil)\b",
     "C.C. Sambil", "C.C. Sambil, San Cristóbal",
     "Principal centro comercial y de negocios del Estado Táchira con tráfico peatonal garantizado y seguridad integral."),
    (r"\b(la\s+concordia|marginal\s+del\s+torbes)\b",
     "La Concordia", "La Concordia, San Cristóbal",
     "Zona de intensa actividad comercial, de transporte y de servicios en San Cristóbal."),
    (r"\b(la\s+ermita|centro|5ta\s+avenida|7ma\s+avenida|quinta\s+avenida|septima\s+avenida)\b",
     "Centro de San Cristóbal", "Centro, San Cristóbal",
     "Núcleo comercial tradicional de San Cristóbal con altísimo flujo peatonal y conectividad urbana."),
    (r"\b(santa\s+teresa|hospital\s+central|av\.?\s+lucio\s+oquendo)\b",
     "Santa Teresa", "Santa Teresa, San Cristóbal",
     "Sector estratégico cercano al complejo médico asistencial y universidades de la ciudad."),
    (r"\b(las\s+acacias|av\.?\s+rotaria|rotaria)\b",
     "Las Acacias", "Las Acacias, San Cristóbal",
     "Zona residencial fresca y tradicional con fácil acceso hacia el este y sur de San Cristóbal."),
    (r"\b(palo\s+gordo|las\s+vegas\s+de\s+t[aá]riba|v[ií]a\s+palo\s+gordo)\b",
     "Palo Gordo", "Palo Gordo, Cárdenas",
     "Sector residencial tranquilo de clima fresco entre San Cristóbal y Cárdenas con alta demanda familiar."),
    (r"\b(t[aá]riba|colinas\s+de\s+t[aá]riba|tucap[eé]|el\s+diamante|las\s+margaritas)\b",
     "Táriba", "Táriba, Cárdenas",
     "Zona residencial de clima agradable y tradición familiar en el Municipio Cárdenas, a pocos minutos de San Cristóbal."),
    (r"\b(palmira|el\s+abejal|la\s+flautera|patiecitos|gu[aá]simos)\b",
     "Palmira", "Palmira, Guásimos",
     "Sector de clima frío de montaña y ambiente tranquilo en el Municipio Guásimos, con excelente calidad de vida."),
    (r"\b(cordero|lomas\s+blancas|andr[eé]s\s+bello)\b",
     "Cordero", "Cordero, Andrés Bello",
     "Población andina de clima fresco de montaña y entorno agrícola y residencial seguro."),
    (r"\b(rubio|jun[ií]n|las\s+dantas)\b",
     "Rubio", "Rubio, Junín",
     "Importante ciudad del eje sur-occidental del Táchira con pujante actividad comercial y cafetalera."),
    (r"\b(san\s+antonio|ure[ñn]a)\b",
     "San Antonio del Táchira", "San Antonio, Bolívar",
     "Eje fronterizo comercial e industrial estratégico del Estado Táchira."),
    (r"\b(la\s+fr[ií]a|garc[ií]a\s+de\s+hevia)\b",
     "La Fría", "La Fría, García de Hevia",
     "Centro agroindustrial y logístico de la zona norte del Estado Táchira."),
    (r"\b(la\s+grita|j[aá]uregui)\b",
     "La Grita", "La Grita, Jáuregui",
     "Ciudad histórica y agrícola de alta montaña en el Estado Táchira.")
]

REGLAS_ASPECTOS_DESTACADOS = [
    (r"\b(piscina|sol[aá]rium)\b", "ph-waves", "Piscina y Área Social", "Espacio recreativo ideal para el disfrute familiar"),
    (r"\b(planta\s+el[eé]ctrica|generador|planta\s+100%|planta\s+total)\b", "ph-lightning", "Autonomía Eléctrica", "Respaldo de energía mediante planta eléctrica"),
    (r"\b(tanque|pozo|hidroneum[aá]tico|reserva\s+de\s+agua|agua\s+constante)\b", "ph-drop", "Reserva Hídrica Garantizada", "Sistema de almacenamiento de agua con hidroneumático"),
    (r"\b(vigilancia|conjunto\s+cerrado|seguridad\s+24|garita|cerco\s+el[eé]ctrico|port[oó]n\s+el[eé]ctrico)\b", "ph-shield-check", "Seguridad Privada 24/7", "Control de acceso y resguardo continuo en el conjunto"),
    (r"\b(amoblad[oa]|equipad[oa])\b", "ph-armchair", "Equipamiento y Mobiliario", "Se entrega con mobiliario y equipamiento listo para habitar"),
    (r"\b(cocina\s+empotrada|tope\s+de\s+granito|cocina\s+moderna|cocina\s+italiana|cuarzo)\b", "ph-cooking-pot", "Cocina Moderna Equipada", "Acabados de primera línea y excelente distribución funcional"),
    (r"\b(fibra\s+[oó]ptica|internet|wifi)\b", "ph-wifi-high", "Conectividad Fibra Óptica", "Servicio de internet de alta velocidad instalado"),
    (r"\b(aire\s+acondicionado|a\/a|split|climatizad[oa])\b", "ph-snowflake", "Ambientes Climatizados", "Unidades de aire acondicionado instaladas"),
    (r"\b(terraza|balc[oó]n|vista\s+panor[aá]mica|vista\s+a\s+la\s+monta[ñn]a)\b", "ph-sun-horizon", "Terraza con Vista Panorámica", "Iluminación natural y ventilación privilegiada"),
    (r"\b(jard[ií]n|[aá]reas\s+verdes|patio|parrillera|social)\b", "ph-tree", "Jardín y Áreas Verdes", "Espacios exteriores integrados para esparcimiento"),
    (r"\b(estrenar|nuevo|remodelad[oa]|lujo|m[aá]rmol|porcelanato)\b", "ph-sparkle", "Acabados de Primera", "Materiales modernos en excelente estado de conservación"),
    (r"\b(jacuzzi|tina|spa)\b", "ph-bathtub", "Jacuzzi Privado", "Área de confort y relajación en la propiedad"),
    (r"\b(ascensor)\b", "ph-elevator", "Ascensor Operativo", "Fácil acceso vertical en la torre residencial"),
]


# ==============================================================================
# DETECCIÓN DE FLUJO (CAPTACIONES EXTERNAS vs CAPTACIONES MAXIMUS) Y ASESORES
# ==============================================================================
def detectar_flujo_captacion(lote_dir: Path, override_modo: Optional[str] = None) -> bool:
    """
    Retorna True si el lote pertenece a `captaciones_maximus/` (Captación Directa MAXIMUS),
    o False si pertenece a `captaciones_externas/`.
    """
    if override_modo:
        return override_modo.lower().strip() == "maximus"
    ruta_str = str(lote_dir.resolve()).lower().replace("\\", "/")
    if "captaciones_maximus" in ruta_str:
        return True
    return False


def consultar_asesores_maximus_supabase(repo_root: Path) -> List[Dict[str, Any]]:
    """
    Consulta `public.asesores_maximus` y `public.equipo_web` en Supabase
    (según sql/migration-asesores-maximus-rls.sql y sql/migration-equipo-web-rls.sql).
    """
    config_js = repo_root / "js" / "config.js"
    sb_url, sb_key = "", ""
    if config_js.exists():
        content = config_js.read_text(encoding="utf-8", errors="replace")
        m_u = re.search(r"SUPABASE_URL\s*:\s*['\"]([^'\"]+)['\"]", content)
        m_k = re.search(r"SUPABASE_ANON_KEY\s*:\s*['\"]([^'\"]+)['\"]", content)
        if m_u and m_k:
            sb_url, sb_key = m_u.group(1).rstrip("/"), m_k.group(1).strip()

    asesores_combinados = list(ASESORES_MAXIMUS_FALLBACK)
    if not sb_url or not sb_key:
        return asesores_combinados

    for tabla in ("asesores_maximus", "equipo_web"):
        try:
            req = urllib.request.Request(
                f"{sb_url}/rest/v1/{tabla}?select=*",
                headers={"apikey": sb_key, "Authorization": f"Bearer {sb_key}", "Accept": "application/json"},
                method="GET",
            )
            with urllib.request.urlopen(req, timeout=10) as resp:
                rows = json.loads(resp.read().decode("utf-8"))
                if isinstance(rows, list):
                    for r in rows:
                        nom = str(r.get("nombre") or "").strip()
                        if nom and not any(a["nombre"].lower() == nom.lower() for a in asesores_combinados):
                            asesores_combinados.append({
                                "id": str(r.get("id") or ""),
                                "nombre": nom,
                                "cargo": str(r.get("cargo") or "Asesor Oficial MAXIMUS"),
                                "telefono": str(r.get("telefono") or r.get("whatsapp") or "+58 424-1234567"),
                                "keywords": [nom.lower(), nom.split()[-1].lower()],
                                "es_principal": False,
                            })
        except Exception:
            pass
    return asesores_combinados


def resolver_asesor_oficial_maximus(author: str, text: str, catalogo_asesores: List[Dict[str, Any]]) -> Dict[str, Any]:
    """
    Busca si en el remitente o en el texto se menciona a un Asesor Oficial MAXIMUS.
    Si no se especifica, asigna al asesor principal por defecto (José Guerrero).
    """
    combinado = f"{author} {text}".lower()
    for asesor in catalogo_asesores:
        for kw in asesor.get("keywords", []):
            if kw and kw in combinado:
                is_uuid = bool(re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", str(asesor.get("id", "")), re.I))
                return {
                    "tipo_asesor": "maximus",
                    "asesor_nombre": asesor["nombre"],
                    "asesor_telefono": asesor["telefono"],
                    "agente_id": asesor["id"] if is_uuid else None,
                    "asignacion_metodo": "Detectado en texto/chat",
                }

    # Default: Asesor Principal Oficial MAXIMUS (José Guerrero)
    principal = next((a for a in catalogo_asesores if a.get("es_principal")), catalogo_asesores[0])
    is_uuid = bool(re.match(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$", str(principal.get("id", "")), re.I))
    return {
        "tipo_asesor": "maximus",
        "asesor_nombre": principal["nombre"],
        "asesor_telefono": principal["telefono"],
        "agente_id": principal["id"] if is_uuid else None,
        "asignacion_metodo": "Asesor Principal por defecto (No especificado en texto)",
    }


# ==============================================================================
# MODO 1: DESCOMPRESIÓN AUTOMÁTICA DE .ZIP Y AGRUPACIÓN POR REMITENTE (±3 MIN)
# ==============================================================================
def descomprimir_zips_en_lote(lote_dir: Path) -> List[Path]:
    """
    Si detecta archivos .zip dentro de la carpeta del lote, los descomprime
    automáticamente en subcarpetas dentro del lote.
    """
    extraidos = []
    for zip_path in sorted(lote_dir.rglob("*.zip")):
        if "procesados" in zip_path.parts:
            continue
        target_folder = zip_path.parent / f"unzipped_{zip_path.stem}"
        if not target_folder.exists() or not any(target_folder.iterdir()):
            target_folder.mkdir(parents=True, exist_ok=True)
            try:
                with zipfile.ZipFile(zip_path, "r") as zf:
                    zf.extractall(target_folder)
                extraidos.append(target_folder)
            except Exception as e:
                print(f"[WARN] Error al descomprimir {zip_path}: {e}")
    return extraidos


def normalizar_telefono_ve(raw_text: str) -> Optional[str]:
    if not raw_text:
        return None
    pat_ve = re.compile(r"(?:\+?58[\s\-]*|0)?(4(?:12|14|24|16|26)|276)[\s\-]*(\d{3})[\s\-]*(\d{2})[\s\-]*(\d{2})")
    m = pat_ve.search(raw_text)
    if m:
        operadora, p1, p2, p3 = m.groups()
        return f"+58 {operadora} {p1}{p2}{p3}"

    pat_co = re.compile(r"(?:\+?57[\s\-]*)(3\d{2})[\s\-]*(\d{3})[\s\-]*(\d{4})")
    m_co = pat_co.search(raw_text)
    if m_co:
        op, p1, p2 = m_co.groups()
        return f"+57 {op} {p1}{p2}"
    return None


def parse_whatsapp_datetime(date_str: str, time_str: str) -> Optional[datetime]:
    date_clean = date_str.strip()
    time_clean = time_str.strip().lower()
    is_pm = any(x in time_clean for x in ["p. m.", "p.m.", "pm", "p. m"])
    is_am = any(x in time_clean for x in ["a. m.", "a.m.", "am", "a. m"])
    time_nums = re.sub(r"[^0-9:]", "", time_clean)

    parts_d = re.split(r"[\/\-\.]", date_clean)
    if len(parts_d) != 3:
        return None
    try:
        d, m, y = int(parts_d[0]), int(parts_d[1]), int(parts_d[2])
        if y < 100:
            y += 2000
        if m > 12 and d <= 12:
            d, m = m, d

        parts_t = [int(x) for x in time_nums.split(":") if x]
        hour = parts_t[0] if len(parts_t) > 0 else 0
        minute = parts_t[1] if len(parts_t) > 1 else 0
        second = parts_t[2] if len(parts_t) > 2 else 0

        if is_pm and hour < 12:
            hour += 12
        elif is_am and hour == 12:
            hour = 0

        return datetime(y, m, d, hour, minute, second)
    except Exception:
        return None


def es_archivo_chat_whatsapp(txt_path: Path) -> bool:
    """Distingue un log de exportación de WhatsApp (Modo 1) de un info.txt libre (Modo 3)."""
    try:
        sample = txt_path.read_text(encoding="utf-8", errors="replace")[:1500]
    except Exception:
        return False
    pat_header = re.compile(r"(^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4},?\s+\d{1,2}:\d{2}|^\[\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4})", re.M)
    return bool(pat_header.search(sample))


def parse_txt_file(txt_path: Path) -> List[Dict[str, Any]]:
    messages = []
    group_name = txt_path.parent.name if txt_path.stem.lower() in ("_chat", "chat") else txt_path.stem

    pat_android = re.compile(
        r"^(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[apAP]\.?\s*[mM]\.?)?)\s*-\s*([^:]+):\s*(.*)$"
    )
    pat_ios = re.compile(
        r"^\[(\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[apAP]\.?\s*[mM]\.?)?)\]\s*([^:]+):\s*(.*)$"
    )
    pat_attach = re.compile(r"([a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|webp))", re.IGNORECASE)

    try:
        content = txt_path.read_text(encoding="utf-8", errors="replace")
    except Exception:
        return []

    current_msg = None
    for raw_line in content.splitlines():
        line = re.sub(r"[\u200e\u200f\u202a-\u202e\ufeff]", "", raw_line).strip()
        if not line:
            if current_msg:
                current_msg["text"] += "\n"
            continue

        m = pat_android.match(line) or pat_ios.match(line)
        if m:
            if current_msg:
                messages.append(current_msg)
            date_s, time_s, author, msg_body = m.groups()
            dt = parse_whatsapp_datetime(date_s, time_s)
            attachments = pat_attach.findall(msg_body)
            clean_body = re.sub(r"<adjunto:\s*[^>]+>", "", msg_body, flags=re.IGNORECASE)
            clean_body = re.sub(
                r"[a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|webp|mp4|pdf|opus)\s*\((?:archivo adjunto|file attached)\)",
                "", clean_body, flags=re.IGNORECASE
            ).strip()

            current_msg = {
                "timestamp": dt,
                "timestamp_str": f"{date_s} {time_s}",
                "author": author.strip(),
                "text": clean_body,
                "attachments": list(dict.fromkeys(attachments)),
                "group_name": group_name,
                "source_file": str(txt_path),
                "modo_entrada": "modo_1_exportacion_whatsapp",
            }
        else:
            if re.match(r"^\d{1,2}[\/\-\.]\d{1,2}[\/\-\.]\d{2,4},?\s+\d{1,2}:\d{2}", line):
                continue
            if current_msg:
                more_att = pat_attach.findall(line)
                for att in more_att:
                    if att not in current_msg["attachments"]:
                        current_msg["attachments"].append(att)
                clean_cont = re.sub(r"<adjunto:\s*[^>]+>", "", line, flags=re.IGNORECASE)
                clean_cont = re.sub(
                    r"[a-zA-Z0-9_\-\.]+\.(?:jpg|jpeg|png|webp|mp4|pdf|opus)\s*\((?:archivo adjunto|file attached)\)",
                    "", clean_cont, flags=re.IGNORECASE
                ).strip()
                if clean_cont:
                    current_msg["text"] = (current_msg["text"] + "\n" + clean_cont).strip()

    if current_msg:
        messages.append(current_msg)
    return messages


def group_messages_by_sender_window(messages: List[Dict[str, Any]], window_minutes: int = 3) -> List[Dict[str, Any]]:
    """
    Agrupa mensajes por remitente (`author`) dentro de una ventana de ±3 minutos.
    Si un remitente envía 4 fotos seguidas (WA0010..WA0013.jpg) y en la última foto o en el
    mensaje inmediatamente siguiente envía el texto descriptivo, los une como UN SOLO INMUEBLE,
    sin mezclarlos jamás con mensajes de otros remitentes aunque hayan escrito entre medias.
    """
    active_by_author: Dict[Tuple[str, str], Dict[str, Any]] = {}
    grouped: List[Dict[str, Any]] = []

    for msg in messages:
        if not msg["text"] and not msg["attachments"]:
            continue
        if re.search(r"(elimin[oó]\s+este\s+mensaje|mensaje\s+eliminado|multimedia\s+omitido|media\s+omitted)", msg["text"], re.I) and not msg["attachments"]:
            continue

        key = (msg["group_name"], msg["author"])
        prev = active_by_author.get(key)

        if prev is not None:
            within_time = True
            if prev["timestamp"] and msg["timestamp"]:
                diff_sec = abs((msg["timestamp"] - prev["timestamp"]).total_seconds())
                within_time = diff_sec <= (window_minutes * 60)

            both_have_full_descriptions = (
                len(prev["text"].strip()) > 120 and len(msg["text"].strip()) > 120
            )

            if within_time and not both_have_full_descriptions:
                if msg["text"]:
                    prev["text"] = (prev["text"] + "\n" + msg["text"]).strip()
                for att in msg["attachments"]:
                    if att not in prev["attachments"]:
                        prev["attachments"].append(att)
                if msg["timestamp"]:
                    prev["timestamp"] = msg["timestamp"]
                continue

        nuevo_bloque = {
            **msg,
            "attachments": list(msg["attachments"]),
        }
        grouped.append(nuevo_bloque)
        active_by_author[key] = nuevo_bloque

    return grouped


# ==============================================================================
# MODO 2 (CAPTURAS DE PANTALLA WHATSAPP WEB) Y MODO 3 (SUBCARPETAS MANUALES)
# ==============================================================================
def recolectar_modos_2_y_3(lote_dir: Path, imagenes_usadas_modo1: set) -> List[Dict[str, Any]]:
    """
    Recorre subcarpetas e imágenes no referenciadas por Modo 1 para detectar:
      - Modo 3: Subcarpetas manuales (`inmueble_01/`, etc.) con `info.txt` (o texto libre) + fotos sueltas.
      - Modo 2: Capturas de pantalla completas de WhatsApp Web (`screenshot`) sin `.txt`.
    """
    bloques_extra: List[Dict[str, Any]] = []
    exts_img = {".jpg", ".jpeg", ".png", ".webp"}

    # Buscar todos los directorios candidatos dentro del lote
    dirs_to_check = [lote_dir] + [
        d for d in sorted(lote_dir.rglob("*"))
        if d.is_dir() and "procesados" not in d.parts
    ]

    for folder in dirs_to_check:
        imgs_in_folder = [
            p for p in sorted(folder.iterdir())
            if p.is_file() and p.suffix.lower() in exts_img and str(p.resolve()) not in imagenes_usadas_modo1
        ]
        txts_no_chat = [
            p for p in sorted(folder.iterdir())
            if p.is_file() and p.suffix.lower() == ".txt" and not es_archivo_chat_whatsapp(p)
        ]

        # MODO 3: Subcarpeta con info.txt (o texto pegado) + fotos sueltas, o carpeta nombrada inmueble_XX
        es_subcarpeta_inmueble = bool(re.search(r"(inmueble|propiedad|captacion|item)[_\-\s]*\d+", folder.name, re.I))
        if txts_no_chat or (es_subcarpeta_inmueble and imgs_in_folder):
            texto_manual = "\n".join(
                t.read_text(encoding="utf-8", errors="replace").strip() for t in txts_no_chat
            ).strip()
            for im in imgs_in_folder:
                imagenes_usadas_modo1.add(str(im.resolve()))
            bloques_extra.append({
                "timestamp": datetime.now(),
                "timestamp_str": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "author": folder.name,
                "text": texto_manual,
                "attachments": [im.name for im in imgs_in_folder],
                "resolved_images": [str(im.resolve()) for im in imgs_in_folder],
                "group_name": folder.name,
                "source_file": str(txts_no_chat[0]) if txts_no_chat else str(folder),
                "modo_entrada": "modo_3_subcarpeta_manual",
                "imagenes_son_screenshots": False,
            })
            continue

        # MODO 2: Capturas de pantalla completas de WhatsApp Web (sin archivo .txt)
        for im in imgs_in_folder:
            imagenes_usadas_modo1.add(str(im.resolve()))
            bloques_extra.append({
                "timestamp": datetime.now(),
                "timestamp_str": datetime.now().strftime("%Y-%m-%d %H:%M"),
                "author": "Captura WhatsApp Web",
                "text": "",
                "attachments": [im.name],
                "resolved_images": [str(im.resolve())],
                "group_name": folder.name,
                "source_file": str(im.resolve()),
                "modo_entrada": "modo_2_screenshot_whatsapp",
                "imagenes_son_screenshots": True,
            })

    return bloques_extra


# ==============================================================================
# CLASIFICACIÓN, EXTRACCIÓN Y REGLAS DE NEGOCIO
# ==============================================================================
def es_requerimiento_o_basura(text: str, has_images: bool, modo_entrada: str) -> Tuple[bool, str]:
    if modo_entrada == "modo_2_screenshot_whatsapp" and has_images:
        return False, ""
    t_low = text.lower().strip()
    if not t_low and not has_images:
        return True, "Mensaje vacío sin texto ni imágenes"

    pat_busqueda = re.compile(
        r"\b(busco\s+(?:apartamento|apto|casa|local|galp[oó]n|terreno|inmueble|quinta|townhouse|oficina|habitaci[oó]n)|"
        r"cliente\s+(?:busca|solicita|requiere|necesita)|"
        r"solicito\s+en\s+(?:alquiler|venta|arriendo)|"
        r"requiero\s+(?:apartamento|casa|local|galp[oó]n|inmueble)|"
        r"necesito\s+con\s+urgencia\s+para\s+cliente|"
        r"colegas\s+qui[eé]n\s+tiene)\b",
        re.IGNORECASE
    )
    if pat_busqueda.search(t_low) and not re.search(r"\b(en\s+venta|se\s+vende|se\s+alquila|disponible\s+en\s+venta)\b", t_low):
        return True, "Requerimiento de búsqueda de cliente (No es oferta de inmueble)"

    palabras_inm = re.search(
        r"\b(venta|vende|alquiler|alquila|canon|casa|apto|apartamento|quinta|townhouse|local|galp[oó]n|terreno|finca|m2|mts|hab|ba[ñn]os)\b",
        t_low
    )
    if not palabras_inm and not has_images:
        return True, "Conversación general / saludo sin contenido inmobiliario"

    if len(t_low) < 20 and not has_images:
        return True, "Texto demasiado breve sin adjuntos"

    return False, ""


def extraer_ocr_imagenes(image_paths: List[Path]) -> str:
    if not HAS_OCR or not image_paths:
        return ""
    textos = []
    for p in image_paths:
        if p.exists():
            try:
                img = Image.open(p)
                txt = pytesseract.image_to_string(img, lang="spa+eng")
                if txt and txt.strip():
                    textos.append(txt.strip())
            except Exception:
                pass
    return "\n".join(textos)


def clasificar_operacion(texto: str) -> Optional[str]:
    t = texto.lower()
    es_alquiler = bool(re.search(r"\b(alquiler|alquila|alquilo|arriendo|arrendamiento|canon\s+mensual|canon\b|meses\s+de\s+dep[oó]sito|mes\s+adelantado)\b", t))
    es_venta = bool(re.search(r"\b(en\s+venta|se\s+vende|vendo|venta\s+de|oportunidad\s+de\s+compra|listo\s+para\s+firmar)\b", t))
    if es_alquiler and not es_venta:
        return "alquiler"
    if es_venta and not es_alquiler:
        return "venta"
    if es_venta and es_alquiler:
        idx_v = re.search(r"\b(venta|vende|vendo)\b", t)
        idx_a = re.search(r"\b(alquiler|alquila|canon)\b", t)
        if idx_a and idx_v:
            return "alquiler" if idx_a.start() < idx_v.start() else "venta"
        return "venta"
    return None


def clasificar_tipo_inmueble(texto: str) -> Tuple[Optional[str], Optional[str], Optional[str]]:
    t = texto.lower()
    if re.search(r"\b(galp[oó]n|galpones|complejo\s+industrial|nave\s+industrial)\b", t):
        return "Galpones", "galpones", "galpon"
    if re.search(r"\b(local\s+comercial|local\b|oficina\s+comercial|consultorio|punto\s+comercial|nivel\s+feria)\b", t):
        return "Local Comercial", "local_comercial", "local"
    if re.search(r"\b(finca|hacienda|agropecuaria|hect[aá]reas)\b", t):
        return "Fincas", "fincas", "terreno"
    if re.search(r"\b(casa\s+de\s+campo|chalet\s+de\s+monta[ñn]a|posada\s+campestre)\b", t):
        return "Casa de campo", "casa_de_campo", "casa"
    if re.search(r"\b(apartamento|apto\.?|departamento|penthouse|p\.?h\.?|apartaestudio|anexo)\b", t):
        return "Departamento", "departamento", "apartamento"
    if re.search(r"\b(casa|quinta|townhouse|town\s+house|t\.?h\.?|chalet|residencia\s+unifamiliar)\b", t):
        return "Casa", "casa", "casa"
    if re.search(r"\b(terreno|parcela|lote\s+de\s+terreno|solar)\b", t):
        return "Fincas", "fincas", "terreno"
    return None, None, None


def extraer_precio(texto: str, operacion: Optional[str]) -> Optional[float]:
    t_clean = re.sub(r"\d+[\.,]?\d*\s*(?:litros|lts|l\b|m2|mts2|mts|metros|m²|hab|ba[ñn]os)", " ", texto, flags=re.IGNORECASE)
    t_clean = re.sub(r"(?:\+?58|0414|0424|0412|0416|0426)[\d\s\-]{7,12}", " ", t_clean)
    patrones = [
        r"(?:precio|inversi[oó]n|canon|valor|costo|oferta|monto)[\s:]*?(?:de\s*)?(?:usd|us\$|\$|ref\.?)?\s*(\d{1,3}(?:[\.,]\d{3})+|\d{2,6})(?:\s*(?:usd|us\$|\$|d[oó]lares|mensual))?",
        r"(?:usd|us\$|\$)\s*(\d{1,3}(?:[\.,]\d{3})+|\d{2,6})\b",
        r"\b(\d{1,3}(?:[\.,]\d{3})+|\d{2,6})\s*(?:\$|usd|us\$|d[oó]lares)",
        r"(?:precio|inversi[oó]n|\$)\s*(\d{2,3}(?:[\.,]\d)?)\s*[kK]\b",
    ]
    for pat in patrones:
        for m in re.finditer(pat, t_clean, flags=re.IGNORECASE):
            raw_val = m.group(1)
            if m.group(0).lower().endswith("k"):
                val = float(raw_val.replace(",", ".")) * 1000.0
            else:
                if re.match(r"^\d{1,3}([\.,]\d{3})+$", raw_val):
                    val = float(re.sub(r"[\.,]", "", raw_val))
                else:
                    val = float(raw_val.replace(",", "."))
            if operacion == "alquiler" and 80 <= val <= 25000:
                return val
            elif operacion == "venta" and 5000 <= val <= 5000000:
                return val
            elif operacion is None and 100 <= val <= 5000000:
                return val
    return None


def extraer_sector_tachira(texto: str) -> Tuple[str, str, str]:
    for regex, sec_nombre, ubicacion, sec_desc in ZONAS_TACHIRA:
        if re.search(regex, texto, flags=re.IGNORECASE):
            return sec_nombre, ubicacion, sec_desc
    m = re.search(r"\b(?:urb(?:anizaci[oó]n)?|sector|res(?:idencias)?|barrio|conjunto\s+residencial|av(?:enida)?)\.?\s+([A-ZÁÉÍÓÚÑa-záéíóúñ0-9\s]{3,28})", texto)
    if m:
        sec_custom = m.group(1).strip().title()
        sec_custom = re.split(r"[,.\n\-]", sec_custom)[0].strip()
        if len(sec_custom) >= 3:
            return (
                sec_custom,
                f"{sec_custom}, San Cristóbal",
                f"Sector residencial y comercial ubicado en {sec_custom}, Estado Táchira, con excelente conectividad y servicios cercanos."
            )
    return (
        "San Cristóbal",
        "San Cristóbal, Táchira",
        "Ubicación estratégica dentro del área metropolitana de San Cristóbal, Estado Táchira."
    )


def extraer_caracteristicas(texto: str, tipo_ui: Optional[str]) -> Dict[str, Any]:
    t = texto.lower()
    habs = None
    m_hab = re.search(r"\b(\d{1,2})\s*(?:amplias\s+|c[oó]modas\s+)?(?:habitaciones|habitaci[oó]n|habs?\.?|dormitorios|alcobas|cuartos)\b", t)
    if not m_hab:
        m_hab = re.search(r"\b(?:habitaciones|habs?\.?)[\s:]*(\d{1,2})\b", t)
    if m_hab:
        habs = int(m_hab.group(1))
        if re.search(r"\+\s*(?:1\s*)?(?:hab(?:itaci[oó]n)?\s+de\s+)?servicio", t):
            habs += 1
    else:
        if tipo_ui in ("Local Comercial", "Galpones"):
            m_ofi = re.search(r"\b(\d{1,2})\s*(?:oficinas|ambientes|cub[ií]culos)\b", t)
            habs = int(m_ofi.group(1)) if m_ofi else 0
        else:
            habs = 0

    banos = 0.0
    if re.search(r"\b(\d{1,2})\s*ba[ñn]os?\s+y\s+medio\b", t):
        m_b = re.search(r"\b(\d{1,2})\s*ba[ñn]os?\s+y\s+medio\b", t)
        banos = float(m_b.group(1)) + 0.5
    elif re.search(r"\b(\d{1,2}[\.,]5)\s*(?:ba[ñn]os?|b\b|salas?\s+de\s+ba[ñn]o)", t):
        m_b = re.search(r"\b(\d{1,2}[\.,]5)\s*(?:ba[ñn]os?|b\b|salas?\s+de\s+ba[ñn]o)", t)
        banos = float(m_b.group(1).replace(",", "."))
    else:
        m_b = re.search(r"\b(\d{1,2})\s*(?:ba[ñn]os?|salas?\s+de\s+ba[ñn]o|sanitarios)\b", t)
        if not m_b:
            m_b = re.search(r"\b(?:ba[ñn]os?|sanitarios)[\s:]*(\d{1,2})\b", t)
        if m_b:
            banos = float(m_b.group(1))

    estac_int = 0
    estac_str = "No especificado"
    m_est = re.search(r"\b(\d{1,2})\s*(?:puestos?\s+de\s+estacionamiento|puestos?\s+de\s+garaje|estacionamientos?|p\/e|puestos?\s+techados?|veh[ií]culos?|carros?)\b", t)
    if not m_est:
        m_est = re.search(r"\b(?:estacionamiento|garaje|puestos?)[\s:]*(\d{1,2})\b", t)
    if m_est:
        estac_int = int(m_est.group(1))
        estac_str = f"{estac_int} Puesto" if estac_int == 1 else f"{estac_int} Puestos"
    elif re.search(r"a\s+pie\s+de\s+calle", t):
        estac_int = 0
        estac_str = "A pie de calle"
    elif re.search(r"(?:libre\s+en\s+c\.?c\.?|estacionamiento\s+(?:de\s+visitantes|comercial|libre))", t):
        estac_int = 1
        estac_str = "Libre en CC"

    m2 = 0.0
    m2_matches = re.findall(r"\b(\d{2,5}(?:[\.,]\d{1,2})?)\s*(?:m2|mts2|mts|m²|metros\s+cuadrados)\b", t)
    if m2_matches:
        vals = [float(x.replace(",", ".")) for x in m2_matches if float(x.replace(",", ".")) >= 12]
        if vals:
            m2 = vals[0]

    return {
        "habitaciones": habs,
        "banos": banos,
        "estacionamientos_int": estac_int,
        "estacionamientos_ui": estac_str,
        "metros_cuadrados": m2,
    }


def generar_textos_maximus(
    raw_text: str,
    tipo_ui: str,
    operacion: str,
    precio: Optional[float],
    sector_nombre: str,
    ubicacion: str,
    sector_desc: str,
    caract: Dict[str, Any],
    is_maximus: bool,
) -> Dict[str, Any]:
    t_low = raw_text.lower()
    m2 = caract["metros_cuadrados"]
    habs = caract["habitaciones"]
    banos = caract["banos"]
    estac_ui = caract["estacionamientos_ui"]

    etiqueta_prop = tipo_ui
    if "penthouse" in t_low or re.search(r"\bp\.?h\.?\b", t_low):
        etiqueta_prop = "Penthouse"
    elif "townhouse" in t_low or "town house" in t_low or re.search(r"\bt\.?h\.?\b", t_low):
        etiqueta_prop = "Townhouse"
    elif "quinta" in t_low:
        etiqueta_prop = "Quinta"
    elif tipo_ui == "Departamento":
        etiqueta_prop = "Apartamento"

    gancho = f"en {sector_nombre}"
    if "amoblad" in t_low:
        gancho = f"amoblado en {sector_nombre}"
    elif "estrenar" in t_low:
        gancho = f"a estrenar en {sector_nombre}"
    elif "piscina" in t_low:
        gancho = f"con piscina en {sector_nombre}"
    elif "pie de calle" in t_low and tipo_ui == "Local Comercial":
        gancho = f"a pie de calle en {sector_nombre}"

    titulo = f"{etiqueta_prop} {gancho}"
    if len(titulo) > 68:
        titulo = f"{etiqueta_prop} en {sector_nombre}"

    if is_maximus:
        subtitulo = f"Captación Exclusiva MAXIMUS en {ubicacion} con respaldo legal y acabados verificados"
    elif tipo_ui in ("Local Comercial", "Galpones"):
        subtitulo = f"Espacio corporativo y comercial estratégico en {ubicacion} con alto potencial operativo"
    else:
        subtitulo = f"Propiedad seleccionada en {ubicacion} con excelente distribución e iluminación natural"

    aspectos = []
    amenidades_nombres = []
    usados_iconos = set()

    for regex, icono, tit_asp, desc_asp in REGLAS_ASPECTOS_DESTACADOS:
        if re.search(regex, t_low):
            amenidades_nombres.append(tit_asp)
            if len(aspectos) < 4 and icono not in usados_iconos:
                aspectos.append({"icono": icono, "titulo": tit_asp, "desc": desc_asp})
                usados_iconos.add(icono)

    if caract["estacionamientos_int"] > 0 or estac_ui in ("A pie de calle", "Libre en CC"):
        amenidades_nombres.append(f"Estacionamiento ({estac_ui})")
        if len(aspectos) < 4 and "ph-car" not in usados_iconos:
            aspectos.append({
                "icono": "ph-car",
                "titulo": f"Estacionamiento: {estac_ui}",
                "desc": "Comodidad de acceso y estacionamiento vehicular"
            })
            usados_iconos.add("ph-car")

    defaults_por_tipo = [
        ("ph-trend-up", "Zona de Alta Demanda", f"Excelente ubicación y revalorización en {sector_nombre}"),
        ("ph-star", "Distribución Funcional", "Espacios bien iluminados y ventilación natural"),
        ("ph-check", "Gestión Comercial MAXIMUS", "Atención personalizada y acompañamiento integral en la negociación"),
        ("ph-shield-check", "Documentación Verificada", "Estatus legal revisado para una operación segura"),
    ]
    for ico, tit_d, desc_d in defaults_por_tipo:
        if len(aspectos) >= 4:
            break
        if ico not in usados_iconos:
            aspectos.append({"icono": ico, "titulo": tit_d, "desc": desc_d})
            usados_iconos.add(ico)

    if not amenidades_nombres:
        amenidades_nombres = ["Ubicación Estratégica", "Servicios Básicos Operativos", "Acceso Vehicular"]

    m2_str = f" de {int(m2) if m2.is_integer() else m2} m²" if m2 > 0 else ""
    p1 = (
        f"Presentamos esta excelente opción de {etiqueta_prop.lower()}{m2_str} en {operacion}, "
        f"ubicada estratégicamente en el sector {sector_nombre} ({ubicacion}). "
    )
    if tipo_ui in ("Local Comercial", "Galpones"):
        p1 += f"Cuenta con {habs} ambiente(s)/oficina(s), {int(banos) if banos.is_integer() else banos} baño(s) y estacionamiento ({estac_ui})."
    else:
        p1 += f"Su distribución interior ofrece {habs} habitaciones, {int(banos) if banos.is_integer() else banos} baño(s) y estacionamiento ({estac_ui})."

    lineas_limpias = [
        re.sub(r"[^\w\s,.:;\/\-+$%áéíóúÁÉÍÓÚñÑüÜ()]", "", ln).strip()
        for ln in raw_text.splitlines()
        if len(ln.strip()) > 4
    ]
    resumen_detalles = re.sub(r"\s+", " ", " ".join(lineas_limpias)).strip()
    p2 = f"Especificaciones de la propiedad: {resumen_detalles}" if resumen_detalles else ""

    precio_fmt = f"${precio:,.0f} USD" if precio else "A consultar"
    sello_str = "Captación Directa Exclusiva de MAXIMUS Inmobiliaria" if is_maximus else "Propiedad comercializada con respaldo de gestión de MAXIMUS Inmobiliaria"
    p3 = f"Valor ({operacion}): {precio_fmt}. {sello_str} en el Estado Táchira."

    return {
        "titulo": titulo,
        "subtitulo": subtitulo,
        "sector_desc": sector_desc,
        "descripcion": "\n\n".join([p for p in (p1, p2, p3) if p]),
        "aspectos_destacados": aspectos,
        "amenidades_str": ", ".join(amenidades_nombres),
        "amenidades": [{"icono": "ph-check", "nombre": x} for x in amenidades_nombres],
    }


def extraer_asesor_externo(author: str, text: str) -> Tuple[str, str]:
    tel = normalizar_telefono_ve(author) or normalizar_telefono_ve(text) or "+58 414 0000000"
    nombre = None
    m_firma = re.search(
        r"(?:asesor(?:a)?|corredor(?:a)?|lic\.?|ing\.?|abg\.?|contacto)[\s:]+([A-ZÁÉÍÓÚÑ][a-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][a-záéíóúñ]+){1,2})",
        text
    )
    if m_firma:
        nombre = m_firma.group(1).strip()
    if not nombre:
        author_clean = re.sub(r"[\+\d\-\s\(\)~]", "", author).strip()
        if len(author_clean) >= 3 and author_clean.lower() != "capturawhatsappweb":
            nombre = author.replace("~", "").strip()
        else:
            nombre = "Asesor Aliado Táchira"
    return nombre, tel


def resolver_rutas_imagenes(lote_dir: Path, source_txt: Path, attachment_names: List[str]) -> List[str]:
    resolved = []
    txt_parent = source_txt.parent
    for att in attachment_names:
        cand1 = txt_parent / att
        if cand1.exists():
            resolved.append(str(cand1.resolve()))
            continue
        matches = list(lote_dir.rglob(att))
        if matches:
            resolved.append(str(matches[0].resolve()))
    return resolved


# ==============================================================================
# PIPELINE INTEGRAL DE LA SKILL 1
# ==============================================================================
def procesar_lote(lote_dir: Path, repo_root: Path, window_minutes: int = 3, modo_captacion: Optional[str] = None) -> Dict[str, Any]:
    if not lote_dir.exists():
        raise FileNotFoundError(f"No existe el directorio del lote: {lote_dir}")

    es_captacion_maximus = detectar_flujo_captacion(lote_dir, modo_captacion)
    catalogo_asesores_maximus = consultar_asesores_maximus_supabase(repo_root) if es_captacion_maximus else []

    procesados_dir = lote_dir / "procesados"
    procesados_dir.mkdir(parents=True, exist_ok=True)

    # Paso 0: Si hay archivos .zip (Modo 1), descomprimirlos automáticamente
    zips_descomprimidos = descomprimir_zips_en_lote(lote_dir)

    # Paso 1: Buscar archivos .txt de exportación de WhatsApp (Modo 1)
    txt_files_modo1 = [
        p for p in sorted(lote_dir.rglob("*.txt"))
        if "procesados" not in p.parts and es_archivo_chat_whatsapp(p)
    ]

    todos_bloques: List[Dict[str, Any]] = []
    imagenes_usadas_modo1 = set()

    for txt_file in txt_files_modo1:
        msgs = parse_txt_file(txt_file)
        grouped = group_messages_by_sender_window(msgs, window_minutes=window_minutes)
        for g in grouped:
            resolved_imgs = resolver_rutas_imagenes(lote_dir, Path(g["source_file"]), g["attachments"])
            g["resolved_images"] = resolved_imgs
            g["imagenes_son_screenshots"] = False
            for r_im in resolved_imgs:
                imagenes_usadas_modo1.add(r_im)
            todos_bloques.append(g)

    # Paso 2: Recolectar entradas de Modo 2 (Screenshots WhatsApp Web) y Modo 3 (Subcarpetas Manuales)
    bloques_m2_m3 = recolectar_modos_2_y_3(lote_dir, imagenes_usadas_modo1)
    todos_bloques.extend(bloques_m2_m3)

    inmuebles_validos = []
    pendientes_revision = []
    descartados_basura = []

    for idx, item in enumerate(todos_bloques, start=1):
        img_paths_str = item.get("resolved_images", [])
        img_paths = [Path(p) for p in img_paths_str]
        modo_entrada = item.get("modo_entrada", "modo_1_exportacion_whatsapp")
        son_screenshots = bool(item.get("imagenes_son_screenshots", False))

        es_basura, motivo_basura = es_requerimiento_o_basura(item["text"], len(img_paths) > 0, modo_entrada)
        if es_basura:
            descartados_basura.append({
                "grupo": item["group_name"],
                "autor": item["author"],
                "fecha": item["timestamp_str"],
                "modo_entrada": modo_entrada,
                "motivo": motivo_basura,
                "extracto": item["text"][:140].replace("\n", " "),
            })
            continue

        ocr_text = extraer_ocr_imagenes(img_paths)
        texto_combinado = (item["text"] + "\n" + ocr_text).strip()

        operacion = clasificar_operacion(texto_combinado)
        tipo_ui, tipo_sql_dash, tipo_sql_canon = clasificar_tipo_inmueble(texto_combinado)
        precio = extraer_precio(texto_combinado, operacion)
        sector_nombre, ubicacion, sector_desc = extraer_sector_tachira(texto_combinado)
        caract = extraer_caracteristicas(texto_combinado, tipo_ui)

        # Asignación diferenciada de Asesor según Bandeja (captaciones_externas vs captaciones_maximus)
        if es_captacion_maximus:
            info_asesor = resolver_asesor_oficial_maximus(item["author"], texto_combinado, catalogo_asesores_maximus)
            asesor_nombre = info_asesor["asesor_nombre"]
            asesor_telefono = info_asesor["asesor_telefono"]
            tipo_asesor = "maximus"
            agente_id = info_asesor["agente_id"]
        else:
            asesor_nombre, asesor_telefono = extraer_asesor_externo(item["author"], texto_combinado)
            tipo_asesor = "externo"
            agente_id = None

        # Regla de Oro 1 (Cero Invención)
        campos_faltantes = []
        if not operacion:
            campos_faltantes.append("Tipo de Operación (Venta/Alquiler)")
        if not tipo_ui:
            campos_faltantes.append("Tipo de Inmueble")
        if precio is None or precio <= 0:
            campos_faltantes.append("Precio")

        m2 = caract["metros_cuadrados"]
        precio_m2_num = round(precio / m2) if (precio and m2 > 0) else 0
        precio_m2_str = f"${precio_m2_num} USD / m²" if precio_m2_num > 0 else "N/D"
        moneda = "USD/mes" if operacion == "alquiler" else "USD"

        if campos_faltantes:
            motivo_str = f"Regla de Oro 1 (Cero Invención) — Faltan datos críticos: {', '.join(campos_faltantes)}"
            if son_screenshots:
                motivo_str += " [Modo 2 Screenshot WhatsApp Web: Requiere lectura por Visión del Agente]"
            pendientes_revision.append({
                "temp_id": f"PEND-{idx:03d}",
                "modo_entrada": modo_entrada,
                "imagenes_son_screenshots": son_screenshots,
                "es_captacion_maximus": es_captacion_maximus,
                "motivo": motivo_str,
                "campos_faltantes": campos_faltantes,
                "requiere_vision_llm": len(img_paths) > 0,
                "grupo_origen": item["group_name"],
                "fecha_mensaje": item["timestamp_str"],
                "tipo_asesor": tipo_asesor,
                "asesor_nombre": asesor_nombre,
                "asesor_telefono": asesor_telefono,
                "agente_id": agente_id,
                "sector_detectado": sector_nombre,
                "operacion_detectada": operacion,
                "tipo_detectado": tipo_ui,
                "precio_detectado": precio,
                "metros_cuadrados": m2,
                "imagenes_locales": img_paths_str,
                "texto_original": texto_combinado,
            })
            continue

        textos_ed = generar_textos_maximus(
            raw_text=texto_combinado,
            tipo_ui=tipo_ui,
            operacion=operacion,
            precio=precio,
            sector_nombre=sector_nombre,
            ubicacion=ubicacion,
            sector_desc=sector_desc,
            caract=caract,
            is_maximus=es_captacion_maximus,
        )

        registro = {
            "temp_id": f"CAND-{len(inmuebles_validos) + 1:03d}",
            "modo_entrada": modo_entrada,
            "imagenes_son_screenshots": son_screenshots,
            "flujo_carpeta": "captaciones_maximus" if es_captacion_maximus else "captaciones_externas",
            "grupo_origen": item["group_name"],
            "fecha_mensaje": item["timestamp_str"],
            "titulo": textos_ed["titulo"],
            "subtitulo": textos_ed["subtitulo"],
            "tipo_ui": tipo_ui,
            "tipo_sql_dashboard": tipo_sql_dash,
            "tipo_sql_canonical": tipo_sql_canon,
            "operacion_ui": operacion.upper(),
            "operacion": operacion,
            "precio": precio,
            "moneda": moneda,
            "precio_m2": precio_m2_num,
            "precio_m2_ui": precio_m2_str,
            "ubicacion": ubicacion,
            "estado": "Táchira",
            "sector_nombre": sector_nombre,
            "sector_desc": textos_ed["sector_desc"],
            "habitaciones": caract["habitaciones"],
            "banos": caract["banos"],
            "estacionamientos": caract["estacionamientos_int"],
            "estacionamientos_ui": caract["estacionamientos_ui"],
            "metros_cuadrados": m2,
            # Regla diferenciada por carpeta (captaciones_externas vs captaciones_maximus)
            "is_maximus": es_captacion_maximus,
            "en_oferta": es_captacion_maximus,
            "tipo_asesor": tipo_asesor,
            "asesor_nombre": asesor_nombre,
            "asesor_telefono": asesor_telefono,
            "agente_id": agente_id,
            "comision_porcentaje": 5.0,
            "descripcion": textos_ed["descripcion"],
            "aspectos_destacados": textos_ed["aspectos_destacados"],
            "amenidades_str": textos_ed["amenidades_str"],
            "amenidades": textos_ed["amenidades"],
            "imagenes_locales": img_paths_str,
            "fotos": [],
            "foto_principal": None,
            "texto_original": texto_combinado,
            "requiere_vision_llm": (m2 == 0 and len(img_paths) > 0) or son_screenshots,
        }
        inmuebles_validos.append(registro)

    out_json = procesados_dir / "inmuebles_extraidos.json"
    resultado = {
        "lote": lote_dir.name,
        "flujo_carpeta": "captaciones_maximus" if es_captacion_maximus else "captaciones_externas",
        "is_maximus_default": es_captacion_maximus,
        "fecha_procesamiento": datetime.now().isoformat(),
        "zips_descomprimidos": [str(z) for z in zips_descomprimidos],
        "archivos_txt_modo1_leidos": len(txt_files_modo1),
        "entradas_modo2_y_modo3": len(bloques_m2_m3),
        "total_bloques_analizados": len(todos_bloques),
        "total_extraidos_completos": len(inmuebles_validos),
        "total_pendientes_revision": len(pendientes_revision),
        "total_descartados_basura_o_busqueda": len(descartados_basura),
        "inmuebles": inmuebles_validos,
        "pendientes_revision": pendientes_revision,
        "descartados": descartados_basura,
    }
    out_json.write_text(json.dumps(resultado, indent=2, ensure_ascii=False), encoding="utf-8")
    generar_markdown_pendientes(lote_dir, pendientes_revision)
    return resultado


def generar_markdown_pendientes(lote_dir: Path, pendientes: List[Dict[str, Any]]) -> None:
    md_path = lote_dir / "pendientes_revision.md"
    lines = [
        f"# Reporte de Inmuebles Pendientes de Revisión (`{lote_dir.name}`)",
        "",
        "> **Regla de Oro 1 (Cero Invención):** Ninguno de estos inmuebles fue inventado ni subido a Supabase porque les falta al menos un dato crítico (`Precio`, `Tipo de Operación` o `Tipo de Inmueble`) o requieren lectura multimodal de captura de pantalla.",
        "",
    ]
    if not pendientes:
        lines.append("✅ **No hay inmuebles pendientes de revisión en este lote.**")
    else:
        for p in pendientes:
            lines.extend([
                f"## 🔹 `{p['temp_id']}` — Modo: `{p.get('modo_entrada')}` — Sector: {p.get('sector_detectado', 'Por definir')}",
                f"- **Motivo de Pausa:** {p['motivo']}",
                f"- **Grupo / Carpeta:** `{p.get('grupo_origen', 'N/D')}` ({p.get('fecha_mensaje', '')})",
                f"- **Asesor ({p.get('tipo_asesor')}):** {p.get('asesor_nombre', 'N/D')} (`{p.get('asesor_telefono', 'N/D')}`)",
                f"- **Imágenes adjuntas ({len(p.get('imagenes_locales', []))}):** `{', '.join(Path(x).name for x in p.get('imagenes_locales', [])) or 'Ninguna'}`",
                "- **Texto extraído:**",
                "  ```text",
                f"  {p.get('texto_original', '').strip()}",
                "  ```",
                "",
            ])
    md_path.write_text("\n".join(lines), encoding="utf-8")


def main():
    parser = argparse.ArgumentParser(description="Skill 1: Extractor Multi-Formato de Inmuebles de WhatsApp MAXIMUS")
    parser.add_argument("--lote", required=True, help="Ruta a la carpeta del lote (en captaciones_externas/ o captaciones_maximus/)")
    parser.add_argument("--window-minutes", type=int, default=3, help="Ventana en minutos (±3 min por defecto) para agrupar fotos + texto del mismo remitente")
    parser.add_argument("--modo-captacion", choices=["externas", "maximus"], help="Opcional: Forzar flujo externas o maximus (por defecto se autodetecta de la ruta)")
    args = parser.parse_args()

    lote_dir = Path(args.lote).resolve()
    repo_root = Path(__file__).resolve().parents[4]
    res = procesar_lote(lote_dir, repo_root, window_minutes=args.window_minutes, modo_captacion=args.modo_captacion)
    print(
        f"[OK] Lote '{res['lote']}' ({res['flujo_carpeta']}) procesado:\n"
        f"  - Archivos .zip descomprimidos: {len(res['zips_descomprimidos'])}\n"
        f"  - Chats Modo 1 (.txt): {res['archivos_txt_modo1_leidos']} | Entradas Modo 2/3: {res['entradas_modo2_y_modo3']}\n"
        f"  - Inmuebles completos extraídos: {res['total_extraidos_completos']}\n"
        f"  - Pausados en pendientes_revision.md: {res['total_pendientes_revision']}\n"
        f"  - Descartados (búsquedas/saludos): {res['total_descartados_basura_o_busqueda']}"
    )


if __name__ == "__main__":
    main()
