import os
import json
import re

def clean_text(raw_text, name="", tipo="", bando="", estilo="", costo=None, fuerza=None, artist="", carta_str="", rareza=""):
    if not raw_text:
        # Build clean fallback description from card properties
        lines = []
        if name: lines.append(f"Nombre: {name}")
        if tipo: lines.append(f"Tipo de carta: {tipo}")
        if bando: lines.append(f"Bando: {bando}")
        if estilo: lines.append(f"Estilo: {estilo}")
        if costo is not None: lines.append(f"Costo: {costo}")
        if fuerza is not None: lines.append(f"Fuerza: {fuerza}")
        if artist: lines.append(f"Ilustrador: {artist}")
        if carta_str: lines.append(f"Carta: {carta_str}")
        if rareza: lines.append(f"Rareza: {rareza}")
        return "\n".join(lines)
    
    lines = raw_text.split('\n')
    cleaned_lines = []
    
    for line in lines:
        l = line.strip()
        if not l:
            continue
            
        # Ignore dots and punctuation lines
        if l in ['·', '•', '.', '...']:
            continue
            
        # Ignore known UI artifacts
        if any(bad.lower() in l.lower() for bad in [
            'online status indicator', 'active', 'máscaras vs cabelleras tcg',
            'this photo is from a post', 'view post', 'scribblins',
            'no comments yet', 'be the first to comment', 'comment as',
            'most relevant', 'return fire', 'author', '@seguidores', '@fansdestacados',
            'view 1 reply', 'view 2 reply', 'view replies', 'by author'
        ]):
            continue
            
        # Ignore Facebook pirate and real dates (e.g. "Octobarrr 21, 2025", "Jul-aye! 6", "Month o' showers 1", "May 18")
        if re.search(r'(octobarrr|jul-aye|month o|january|february|march|april|may|june|july|august|september|october|november|december|\d+w\b)', l, re.IGNORECASE):
            continue
        if re.search(r'^\d{1,2}\s+(de\s+)?(enero|febrero|marzo|abril|mayo|junio|julio|agosto|septiembre|octubre|noviembre|diciembre)', l, re.IGNORECASE):
            continue
        if re.search(r'^[A-Z][a-z]+\s+\d{1,2}(,\s+\d{4})?$', l):
            continue
            
        # Ignore standalone reaction numbers (e.g. '1', '3', '14', '7' below Rareza)
        if re.match(r'^\d+$', l):
            continue
            
        # Ignore hashtags
        if l.startswith('#'):
            continue
            
        # Clean '... See more' / '… See more'
        l = re.sub(r'[\.…]*\s*See more', '', l, flags=re.IGNORECASE).strip()
        
        # Clean known artist typo in text
        if l.startswith('Ilustrador:') and 'James Darlo' in l:
            l = 'Ilustrador: James Darko'
            
        if l:
            cleaned_lines.append(l)
            
    # Filter to only keep card property lines or relevant text starting from Nombre:
    final_lines = []
    started = False
    for l in cleaned_lines:
        if any(l.startswith(p) for p in ['Nombre:', 'Tipo de carta:', 'Bando:', 'Estilo:', 'Costo:', 'Fuerza:', 'Ilustrador:', 'Carta:', 'Rareza:', 'Efecto:']):
            started = True
            final_lines.append(l)
        elif started:
            # Only keep lines if they aren't comment lines or garbage
            if not any(x in l.lower() for x in ['a huevo', 'entendí', 'donde compro', 'al rato', 'están bien', 'al estilo', 'genial', 'soporte']):
                # If it's not a comment, keep it
                pass
                
    if not final_lines and name:
        # Fallback to structured fields
        return clean_text("", name, tipo, bando, estilo, costo, fuerza, artist, carta_str, rareza)
        
    return "\n".join(final_lines)

def parse_card(c, set_name, set_id, folder_name):
    raw = c.get('raw_text', '')
    
    # Extract Bando
    bando = ""
    b_match = re.search(r'Bando:\s*([^\n\r]+)', raw)
    if b_match:
        b_val = b_match.group(1).strip()
        if 'T' in b_val and ('nico' in b_val or 'ecnico' in b_val):
            bando = "Técnico"
        elif 'Rudo' in b_val:
            bando = "Rudo"
            
    # Extract Estilo
    estilo = ""
    e_match = re.search(r'Estilo:\s*([^\n\r]+)', raw)
    if e_match:
        e_val = e_match.group(1).strip()
        if 'Cl' in e_val or 'cl' in e_val:
            estilo = "Clásico"
        elif 'A' in e_val and 'reo' in e_val:
            estilo = "Aéreo"
        elif 'Fantas' in e_val or 'fantas' in e_val:
            estilo = "Fantasía"
        elif 'Extremo' in e_val or 'extremo' in e_val:
            estilo = "Extremo"
        elif 'Mini' in e_val or 'mini' in e_val:
            estilo = "Mini"
        else:
            estilo = e_val
            
    # Extract Fuerza
    fuerza = None
    f_match = re.search(r'Fuerza:\s*(\d+)', raw)
    if f_match:
        fuerza = int(f_match.group(1))
        
    # Extract Costo
    costo_val = str(c.get('Costo', '')).strip()
    costo = int(costo_val) if costo_val.isdigit() else None
    if costo is None:
        c_match = re.search(r'Costo:\s*(\d+)', raw)
        if c_match:
            costo = int(c_match.group(1))
    
    # Tipo
    tipo = c.get('Tipo de carta', '').strip()
    if tipo in ['Obj', 'Obj ']:
        tipo = 'Objeto'
    if not tipo:
        t_match = re.search(r'Tipo de carta:\s*([^\n\r]+)', raw)
        if t_match:
            tipo = t_match.group(1).strip()
            if tipo in ['Obj', 'Obj ']:
                tipo = 'Objeto'
                
    # Rareza
    rareza = c.get('Rareza', '').strip()
    if not rareza:
        r_match = re.search(r'Rareza:\s*([^\n\r]+)', raw)
        if r_match:
            rareza = r_match.group(1).strip()
    if not rareza:
        rareza = 'Novato'
        
    # Normalize card number
    carta_str = str(c.get('Carta', '')).replace('…', '').replace(' ', '').replace('?', '').strip()
    if not carta_str:
        num_match = re.search(r'Carta:\s*(\d+)', raw)
        if num_match:
            carta_str = num_match.group(1).strip()
        else:
            carta_str = "000"
            
    # Normalize artist
    artist = c.get('Ilustrador', '').strip()
    if not artist:
        a_match = re.search(r'Ilustrador:\s*([^\n\r]+)', raw)
        if a_match:
            artist = a_match.group(1).strip()
    if artist == 'James Darlo':
        artist = 'James Darko'
    if artist == 'Marii-San':
        artist = 'Marii-san'
        
    name = c.get('Nombre', '').strip()
    filename = c.get('saved_filename', '')
    
    # Compute clean description without dates, dots, or reaction numbers
    cleaned_desc = clean_text(raw, name, tipo, bando, estilo, costo, fuerza, artist, carta_str, rareza)
    
    # ID
    slug_name = re.sub(r'[^a-zA-Z0-9]+', '-', name.lower()).strip('-')
    card_id = f"{set_id}-{carta_str}-{slug_name}"
    
    return {
        "id": card_id,
        "number": carta_str,
        "name": name,
        "type": tipo,
        "cost": costo,
        "strength": fuerza,
        "bando": bando,
        "style": estilo,
        "rarity": rareza,
        "artist": artist,
        "set": set_name,
        "setId": set_id,
        "image": f"assets/cards/{folder_name}/{filename}",
        "rawDescription": cleaned_desc
    }

def main():
    os.makedirs('src/assets/data', exist_ok=True)
    
    with open('Primer edición/metadatos.json', encoding='utf-8') as f:
        ed1_raw = json.load(f)
        
    with open('Primer expansión/metadatos.json', encoding='utf-8') as f:
        exp1_raw = json.load(f)
        
    cards = []
    for c in ed1_raw:
        cards.append(parse_card(c, "Primera Edición", "ed1", "edicion-1"))
        
    for c in exp1_raw:
        cards.append(parse_card(c, "Primera Expansión", "exp1", "expansion-1"))
        
    print(f"Total cards processed: {len(cards)}")
    
    with open('src/assets/data/cards.json', 'w', encoding='utf-8') as f:
        json.dump(cards, f, ensure_ascii=False, indent=2)
        
    artists = [
        {
            "name": "James Darko",
            "role": "Ilustrador Principal y Diseñador",
            "bio": "Creador visual de la mayoría de personajes, contratos, objetos y castigos emblemáticos de Máscaras vs Cabelleras TCG.",
            "social": {
                "instagram": "https://www.instagram.com/mascarasvscabelleras_tcg/",
                "facebook": "https://www.facebook.com/mascarasvscabellerastcg"
            },
            "cardCount": len([c for c in cards if c["artist"] == "James Darko"])
        },
        {
            "name": "Araceli Salazar",
            "role": "Ilustradora Invitada",
            "bio": "Artista visual e ilustradora de personajes destacados del pancracio.",
            "social": {
                "instagram": "https://www.instagram.com/araa_vss"
            },
            "cardCount": len([c for c in cards if c["artist"] == "Araceli Salazar"])
        },
        {
            "name": "Víctor Chang",
            "role": "Ilustrador Invitado",
            "bio": "Ilustrador conceptual y dibujante de gladiadores de alta intensidad.",
            "social": {
                "instagram": "https://www.instagram.com/victorchang_21"
            },
            "cardCount": len([c for c in cards if "Chang" in c["artist"] or "Victor" in c["artist"]])
        },
        {
            "name": "Neomgon",
            "role": "Ilustrador Invitado",
            "bio": "Diseñador de personajes y arte digital estilizado.",
            "social": {
                "instagram": "https://www.instagram.com/neomgon"
            },
            "cardCount": len([c for c in cards if c["artist"] == "Neomgon"])
        },
        {
            "name": "Jack Coatl",
            "role": "Ilustrador Invitado",
            "bio": "Creador de escenarios y arenas míticas como el Ring de los Sueños.",
            "cardCount": len([c for c in cards if c["artist"] == "Jack Coatl"])
        },
        {
            "name": "Sam Purata",
            "role": "Ilustrador Invitado",
            "bio": "Ilustrador de cartas de castigo icónicas.",
            "cardCount": len([c for c in cards if c["artist"] == "Sam Purata"])
        },
        {
            "name": "Akuro",
            "role": "Ilustrador Invitado",
            "bio": "Ilustrador de promotores e impulsores del juego.",
            "cardCount": len([c for c in cards if c["artist"] == "Akuro"])
        },
        {
            "name": "Izumi Mortem",
            "role": "Ilustradora Invitada",
            "bio": "Ilustradora con estilo gótico y fantasía para rudos y gladiadores.",
            "cardCount": len([c for c in cards if c["artist"] == "Izumi Mortem"])
        },
        {
            "name": "Kanio Necroz",
            "role": "Ilustrador Invitado",
            "bio": "Artista de personajes místicos del roster.",
            "cardCount": len([c for c in cards if c["artist"] == "Kanio Necroz"])
        },
        {
            "name": "Marii-san",
            "role": "Ilustradora Invitada",
            "bio": "Ilustradora con arte anime y vibrante.",
            "cardCount": len([c for c in cards if c["artist"] == "Marii-san"])
        },
        {
            "name": "Pegoztino",
            "role": "Ilustrador Invitado",
            "bio": "Creador de arte dinámico para cartas clave.",
            "cardCount": len([c for c in cards if c["artist"] == "Pegoztino"])
        },
        {
            "name": "Esty Sempai",
            "role": "Ilustrador Invitado",
            "bio": "Ilustrador de luchadores aéreos y técnicos.",
            "cardCount": len([c for c in cards if c["artist"] == "Esty Sempai"])
        }
    ]
    
    with open('src/assets/data/artists.json', 'w', encoding='utf-8') as f:
        json.dump(artists, f, ensure_ascii=False, indent=2)
        
    print("Generated cards.json and artists.json successfully!")

if __name__ == '__main__':
    main()
