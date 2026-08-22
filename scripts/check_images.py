import os
from PIL import Image

for folder in ['src/assets/cards/edicion-1', 'src/assets/cards/expansion-1']:
    files = os.listdir(folder)
    print(f"Folder: {folder}, files: {len(files)}")
    for f in files[:5]:
        path = os.path.join(folder, f)
        im = Image.open(path)
        print(f"  {f}: {im.size}, mode: {im.mode}")
