import hashlib
import json
import shutil
import subprocess
from pathlib import Path

from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
output = root / '_site'
if output.is_symlink() or output.resolve().parent != root:
    raise ValueError('The build directory must stay inside the repository')
if output.exists():
    shutil.rmtree(output)
output.mkdir()

files = subprocess.check_output(['git', 'ls-files', '-z'], cwd=root).decode().split('\0')
for filename in filter(None, files):
    source = Path(filename)
    if source.parts[0].startswith('.') or source.parts[0] == 'scripts' or filename == 'README.md':
        continue
    target = output / source
    target.parent.mkdir(parents=True, exist_ok=True)
    shutil.copy2(root / source, target)

preview_directory = output / 'assets/previews'
preview_directory.mkdir()
cache_directory = root / '.preview-cache'
cache_directory.mkdir(exist_ok=True)
generation = Path(__file__).read_bytes()


def preview(source):
    digest = hashlib.sha256(source.read_bytes() + generation).hexdigest()[:16]
    variants = []
    with Image.open(source) as original:
        width, height = original.size
        if original.getexif().get(274) in (5, 6, 7, 8):
            width, height = height, width
        image = None
        for size in sorted({min(size, width) for size in (400, 800, 1200, 1600)}):
            cached = cache_directory / f'{digest}-{size}.webp'
            if not cached.exists():
                if image is None:
                    image = ImageOps.exif_transpose(original)
                    image = image.convert('RGBA' if 'A' in image.getbands() else 'RGB')
                resized = image.resize((size, round(height * size / width)), Image.Resampling.LANCZOS)
                resized.save(cached, quality=90, method=4, icc_profile=original.info.get('icc_profile', b''))
            target = preview_directory / cached.name
            shutil.copy2(cached, target)
            variants.append((target.relative_to(output).as_posix(), size))
    return {'preview': variants[0][0], 'srcset': ', '.join(f'{path} {size}w' for path, size in variants),
            'width': width, 'height': height}


for name in ('photography', 'art'):
    catalog = output / f'assets/{name}.json'
    entries = json.loads(catalog.read_text(encoding='utf-8'))
    for entry in entries:
        entry.update(preview(root / 'assets' / name / entry['file']))
    catalog.write_text(json.dumps(entries, indent=4) + '\n', encoding='utf-8')

for page, source, sizes in (
    ('index.html', 'assets/ege.png', '(max-width: 666px) 200px, (min-width: 1667px) 500px, 30vw'),
    ('portfolio-MUSIC.html', 'assets/ege music.png', '(max-width: 500px) 200px, (min-width: 1250px) 500px, 40vw'),
    ('portfolio-PHOTO.html', 'assets/favorite_photo.jpg', '(max-width: 400px) calc(90vw - 52px), 308px'),
):
    image = preview(root / source)
    target = output / page
    text = target.read_text(encoding='utf-8')
    text = text.replace(f'src="{source}"',
                        f'data-original="{source}" style="aspect-ratio: {image["width"]} / {image["height"]}" '
                        f'src="{image["preview"]}" srcset="{image["srcset"]}" sizes="{sizes}"')
    target.write_text(text, encoding='utf-8')

(output / '.nojekyll').touch()
print(f'Built {output} with {len(list(preview_directory.iterdir()))} responsive previews')
