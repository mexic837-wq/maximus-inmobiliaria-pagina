import sys, json, urllib.request
from pathlib import Path

# Agregar carpeta al path
scripts_dir = Path(__file__).resolve().parent
sys.path.insert(0, str(scripts_dir))
import publish_to_supabase as p

repo_root = Path(__file__).resolve().parents[4]
cfg = p.load_config(repo_root)

# 1. Total count
url_count = f"{cfg['sb_url']}/rest/v1/inmuebles?select=id"
req_c = urllib.request.Request(url_count, headers={'apikey': cfg['sb_key'], 'Authorization': f"Bearer {cfg['sb_key']}"})
with urllib.request.urlopen(req_c) as resp:
    total_rows = len(json.loads(resp.read().decode('utf-8')))

# 2. Ultimos registros
url_last = f"{cfg['sb_url']}/rest/v1/inmuebles?select=codigo,titulo,precio,moneda,sector_nombre,is_maximus,fotos&order=codigo.desc&limit=10"
req_l = urllib.request.Request(url_last, headers={'apikey': cfg['sb_key'], 'Authorization': f"Bearer {cfg['sb_key']}"})
with urllib.request.urlopen(req_l) as resp:
    data = json.loads(resp.read().decode('utf-8'))

print(f"TOTAL_INMUEBLES_EN_SUPABASE={total_rows}")
print("ULTIMOS_REGISTROS:")
for r in data:
    n_fotos = len(r.get('fotos') or [])
    print(f"  {r['codigo']} | {r['titulo']} | ${r['precio']:,.0f} {r['moneda']} | {r['sector_nombre']} | {n_fotos} fotos")
