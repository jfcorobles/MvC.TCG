import json

with open('Primer edición/metadatos.json', encoding='utf-8') as f:
    ed1 = json.load(f)
with open('Primer expansión/metadatos.json', encoding='utf-8') as f:
    exp1 = json.load(f)

print(f"Ed1 entries: {len(ed1)}, Exp1 entries: {len(exp1)}")
print("Ed1 sample keys:", ed1[0].keys())

effects_found = 0
for idx, c in enumerate(ed1 + exp1):
    raw = c.get('raw_text', '')
    name = c.get('Nombre', c.get('name', ''))
    # look for effect patterns
    for line in raw.split('\n'):
        if any(k in line.lower() for k in ['efecto', 'habilidad', 'regla', 'cuando', 'al entrar', 'puede', 'roba', 'destruye', 'anula', 'suma']):
            print(f"[{name}]: {line.strip()}")
            effects_found += 1

print(f"\nTotal potential effect lines found in metadata: {effects_found}")
