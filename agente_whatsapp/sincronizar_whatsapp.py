#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
Acceso rápido al Extractor Automático de WhatsApp Web para MAXIMUS Inmobiliaria.
Ejecuta la sincronización directa desde el navegador.

Ejemplos de uso rápido:
1. Iniciar sesión por primera vez (escanear QR):
   python agente_whatsapp/sincronizar_whatsapp.py --login-only

2. Ver qué grupos de WhatsApp tienes visibles:
   python agente_whatsapp/sincronizar_whatsapp.py --lista-chats

3. Extraer y procesar 100% automático hasta Supabase:
   python agente_whatsapp/sincronizar_whatsapp.py --grupos "SOLO VENTAS - TACHIRA" --auto-pipeline

4. Extraer captaciones directas de MAXIMUS:
   python agente_whatsapp/sincronizar_whatsapp.py --grupos "Maximus captaciónes" --auto-pipeline
"""

import sys
from pathlib import Path

# Agregar ruta del script maestro
ROOT_DIR = Path(__file__).resolve().parent.parent
SCRIPT_PATH = ROOT_DIR / ".agents" / "skills" / "whatsapp-web-sync" / "scripts" / "whatsapp_web_sync.py"

if __name__ == "__main__":
    import subprocess
    cmd = [sys.executable, str(SCRIPT_PATH)] + sys.argv[1:]
    subprocess.run(cmd)
