import json
import re

cards_path = 'src/assets/data/cards.json'
with open(cards_path, 'r', encoding='utf-8') as f:
    cards = json.load(f)

def format_effect_dashes(effect):
    if not effect or not isinstance(effect, str):
        return effect
        
    text = effect.strip()
    
    # Replace pattern like "-PALABRA-" with newline around it
    # Match any -WORD- or -WORD: or -WORD -
    # Examples: -IDOLO-, -INMORTAL-, -OPORTUNISTA-, -CONTRALLAVE-, -HURANO-, -LEGADO-, -IMBATIBLE-
    
    # 1. Normalize dash patterns like -CONTRALLAVE: or -CONTRALLAVE - or -INMORTAL Este
    text = re.sub(r'-\s*([A-ZÁÉÍÓÚÑ]+)\s*[:\-]\s*', r'-\1-\n', text)
    # Fix cases where closing dash was missed before text: e.g. -INMORTAL Este -> -INMORTAL-\nEste
    text = re.sub(r'-\s*([A-ZÁÉÍÓÚÑ]{4,})\s+([A-ZÁÉÍÓÚÑa-záéíóúñ])', r'-\1-\n\2', text)
    
    # 2. Put newline before any "-WORD-" if it is not at the start
    text = re.sub(r'([^\n])\s*(-[A-ZÁÉÍÓÚÑ]+-)', r'\1\n\2', text)
    
    # 3. Put newline after any "-WORD-" if not followed by newline
    text = re.sub(r'(-[A-ZÁÉÍÓÚÑ]+-)\s*([^\n\s])', r'\1\n\2', text)
    
    # 4. Clean up multiple empty lines
    text = re.sub(r'\n{3,}', '\n\n', text).strip()
    
    return text

updated_count = 0
for card in cards:
    old_eff = card.get('effect')
    if old_eff:
        new_eff = format_effect_dashes(old_eff)
        if new_eff != old_eff:
            card['effect'] = new_eff
            updated_count += 1
            print(f"Card {card['number']} ({card['name']}):\nOLD:\n{old_eff}\nNEW:\n{new_eff}\n---")

print(f"\nTotal cards reformatted: {updated_count}")

with open(cards_path, 'w', encoding='utf-8') as f:
    json.dump(cards, f, ensure_ascii=False, indent=2)
