import os
import json
import re
import urllib.request
import ssl
import numpy as np
from PIL import Image
from rapidocr_onnxruntime import RapidOCR

engine = RapidOCR()

SUPABASE_URL = "https://oipexkponutwqxdnjbdl.supabase.co"
SUPABASE_KEY = "sb_publishable_c3DP1UiTAsAFsfWn9Vg1LQ_100r040c"

def clean_ocr_text(lines):
    if not lines:
        return ""
    
    cleaned_lines = []
    for l in lines:
        t = l.strip()
        if not t:
            continue
        # Fix common OCR spacing around punctuation & quotes
        t = re.sub(r'\"([A-Za-z0-9ÁÉÍÓÚáéíóúÑñ\s]+)\"', r'"\1"', t)
        t = re.sub(r'([a-z])\"([A-Z])', r'\1" \2', t)
        t = re.sub(r'\"([a-z])', r'" \1', t)
        t = re.sub(r'([A-Za-z])\"', r'\1"', t)
        t = re.sub(r'([,.:;])([A-Za-zÁÉÍÓÚáéíóú])', r'\1 \2', t)
        # Fix known words and common OCR characters
        t = t.replace('Cuadrilatero', 'Cuadrilátero')
        t = t.replace('Cuadriltero', 'Cuadrilátero')
        t = t.replace('dano', 'daño')
        t = t.replace('preparacion', 'preparación')
        t = t.replace('a O el', 'a 0 el')
        t = t.replace('a O ', 'a 0 ')
        t = t.replace('IDOLO', 'ÍDOLO')
        t = t.replace('agrgala', 'agrégala')
        
        cleaned_lines.append(t)
        
    # Join logically
    full_text = " ".join(cleaned_lines)
    # Fix double spaces
    full_text = re.sub(r'\s+', ' ', full_text).strip()
    
    # Format keywords like -IDOLO- -INMORTAL- on separate lines if at start
    full_text = re.sub(r'(-[A-ZÁÉÍÓÚÑ\-]+-)\s*', r'\1\n', full_text)
    
    return full_text

def extract_effect_from_image(image_rel_path):
    # Try finding the image file on disk
    possible_paths = [
        os.path.join('src', image_rel_path),
        image_rel_path,
        image_rel_path.replace('assets/cards/edicion-1/', 'Primer edición/'),
        image_rel_path.replace('assets/cards/expansion-1/', 'Primer expansión/')
    ]
    
    img_path = None
    for p in possible_paths:
        if os.path.exists(p):
            img_path = p
            break
            
    if not img_path:
        print(f"  [!] Image not found for: {image_rel_path}")
        return ""
        
    try:
        img = Image.open(img_path)
        w, h = img.size
        
        # Crop text box region: y: 63% to 92%, x: 7% to 93%
        crop_box = (int(w * 0.07), int(h * 0.63), int(w * 0.93), int(h * 0.925))
        cropped = img.crop(crop_box)
        
        np_img = np.array(cropped)
        results, _ = engine(np_img)
        
        if not results:
            return ""
            
        raw_lines = [r[1] for r in results if float(r[2]) > 0.4]
        return clean_ocr_text(raw_lines)
    except Exception as e:
        print(f"  [!] Error reading image {img_path}: {e}")
        return ""

def process_all_cards():
    cards_path = 'src/assets/data/cards.json'
    with open(cards_path, 'r', encoding='utf-8') as f:
        cards = json.load(f)
        
    print(f"Loaded {len(cards)} cards from {cards_path}. Starting OCR extraction...")
    
    updated_count = 0
    for idx, card in enumerate(cards, 1):
        name = card.get('name')
        img_rel = card.get('image', '')
        
        effect_text = extract_effect_from_image(img_rel)
        if effect_text:
            card['effect'] = effect_text
            updated_count += 1
            print(f"[{idx:03d}/{len(cards):03d}] {name} (#{card.get('number')}): {effect_text[:70]}...")
        else:
            card['effect'] = None
            print(f"[{idx:03d}/{len(cards):03d}] {name} (#{card.get('number')}): (Sin efecto de texto)")
            
    # Save cards.json
    with open(cards_path, 'w', encoding='utf-8') as f:
        json.dump(cards, f, ensure_ascii=False, indent=2)
    print(f"\nSuccessfully updated {cards_path} with {updated_count} card effects!")
    
    # Sync with Supabase REST API
    print("\nSynchronizing with Supabase...")
    sync_to_supabase(cards)

def sync_to_supabase(cards):
    ctx = ssl.create_default_context()
    
    # Prepare payload for upsert
    rows = []
    for c in cards:
        rows.append({
            "id": c["id"],
            "number": c["number"],
            "name": c["name"],
            "type": c["type"],
            "cost": c.get("cost"),
            "strength": c.get("strength"),
            "bando": c.get("bando") or "",
            "style": c.get("style") or "",
            "rarity": c.get("rarity", "Novato"),
            "artist": c.get("artist") or "",
            "set": c.get("set", ""),
            "set_id": c.get("setId", ""),
            "image": c.get("image", ""),
            "raw_description": c.get("rawDescription") or "",
            "effect": c.get("effect") or None
        })
        
    url = f"{SUPABASE_URL}/rest/v1/cards"
    headers = {
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates"
    }
    
    # Send in batches of 30
    batch_size = 30
    total_synced = 0
    
    for i in range(0, len(rows), batch_size):
        batch = rows[i:i + batch_size]
        req_data = json.dumps(batch).encode('utf-8')
        req = urllib.request.Request(url, data=req_data, headers=headers, method='POST')
        
        try:
            with urllib.request.urlopen(req, context=ctx) as response:
                total_synced += len(batch)
                print(f"  Synced batch {i//batch_size + 1}: {len(batch)} cards (Status: {response.getcode()})")
        except urllib.error.HTTPError as e:
            err_body = e.read().decode('utf-8')
            print(f"  [!] Supabase HTTP Error on batch {i//batch_size + 1}: {e.code} - {err_body}")
        except Exception as e:
            print(f"  [!] Supabase Error: {e}")
            
    print(f"Supabase sync finished: {total_synced}/{len(cards)} cards pushed successfully.")

if __name__ == '__main__':
    process_all_cards()
