import json
import re

def sync_rarities():
    with open('src/assets/data/cards.json', 'r', encoding='utf-8') as f:
        cards = json.load(f)

    with open('Primer edición/metadatos.json', 'r', encoding='utf-8') as f:
        meta_ed1 = json.load(f)

    with open('Primer expansión/metadatos.json', 'r', encoding='utf-8') as f:
        meta_exp1 = json.load(f)

    cards_by_img_ed1 = {c['image'].split('/')[-1]: c for c in cards if c['setId'] == 'ed1'}
    cards_by_img_exp1 = {c['image'].split('/')[-1]: c for c in cards if c['setId'] == 'exp1'}

    # 1. Check & fix any rawDescription in cards.json where Rareza: was mentioned
    cards_fixed = 0
    for c in cards:
        raw = c.get('rawDescription', '')
        if 'Rareza:' in raw:
            old_raw = raw
            new_raw = re.sub(r'Rareza:\s*[^\n\r]+', f"Rareza: {c['rarity']}", raw)
            if old_raw != new_raw:
                c['rawDescription'] = new_raw
                cards_fixed += 1
                print(f"Updated rawDescription in cards.json for #{c['number']} {c['name']} -> Rareza: {c['rarity']}")

    if cards_fixed > 0:
        with open('src/assets/data/cards.json', 'w', encoding='utf-8') as f:
            json.dump(cards, f, ensure_ascii=False, indent=2)
        print(f"Saved {cards_fixed} rawDescription updates to cards.json")

    # 2. Sync Primer edición/metadatos.json
    ed1_updated = 0
    for i, m in enumerate(meta_ed1):
        fname = m.get('saved_filename')
        card = cards_by_img_ed1.get(fname)
        if not card:
            matches = [c for c in cards if c['setId'] == 'ed1' and c['name'].strip() == m.get('Nombre', '').strip()]
            if matches:
                card = matches[0]

        if card:
            target_rarity = card['rarity']
            old_rarity = m.get('Rareza', '')
            if old_rarity != target_rarity:
                m['Rareza'] = target_rarity
                ed1_updated += 1
                print(f"ED1 #{card['number']} {card['name']}: '{old_rarity}' -> '{target_rarity}'")

            # Also update raw_text if Rareza: is present in raw_text
            raw_text = m.get('raw_text', '')
            if 'Rareza:' in raw_text:
                m['raw_text'] = re.sub(r'Rareza:\s*[^\n\r]+', f"Rareza: {target_rarity}", raw_text)

    with open('Primer edición/metadatos.json', 'w', encoding='utf-8') as f:
        json.dump(meta_ed1, f, ensure_ascii=False, indent=2)
    print(f"Primer edición/metadatos.json saved ({ed1_updated} updated out of {len(meta_ed1)} total).")

    # 3. Sync Primer expansión/metadatos.json
    exp1_updated = 0
    for i, m in enumerate(meta_exp1):
        fname = m.get('saved_filename')
        card = cards_by_img_exp1.get(fname)
        if not card:
            matches = [c for c in cards if c['setId'] == 'exp1' and c['name'].strip() == m.get('Nombre', '').strip()]
            if matches:
                card = matches[0]

        if card:
            target_rarity = card['rarity']
            old_rarity = m.get('Rareza', '')
            if old_rarity != target_rarity:
                m['Rareza'] = target_rarity
                exp1_updated += 1
                print(f"EXP1 #{card['number']} {card['name']}: '{old_rarity}' -> '{target_rarity}'")

            # Also update raw_text if Rareza: is present in raw_text
            raw_text = m.get('raw_text', '')
            if 'Rareza:' in raw_text:
                m['raw_text'] = re.sub(r'Rareza:\s*[^\n\r]+', f"Rareza: {target_rarity}", raw_text)

    with open('Primer expansión/metadatos.json', 'w', encoding='utf-8') as f:
        json.dump(meta_exp1, f, ensure_ascii=False, indent=2)
    print(f"Primer expansión/metadatos.json saved ({exp1_updated} updated out of {len(meta_exp1)} total).")

if __name__ == '__main__':
    sync_rarities()
