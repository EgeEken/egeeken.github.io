import json
import re
import shutil
import struct
import subprocess
from io import BytesIO
from pathlib import Path

from PIL import Image, ImageOps

root = Path(__file__).resolve().parents[1]
assets = root / 'assets'

for name in ('photography', 'art'):
    catalog = assets / f'{name}.json'
    entries = json.loads(catalog.read_text(encoding='utf-8'))
    for entry in entries:
        with Image.open(assets / name / entry['file']) as image:
            entry['width'], entry['height'] = ImageOps.exif_transpose(image).size
    catalog.write_text(json.dumps(entries, indent=4) + '\n', encoding='utf-8')

for name in ('ege', 'ege music'):
    source = assets / f'{name}.png'
    with Image.open(source) as image:
        output = BytesIO()
        image.save(output, format='PNG', optimize=True, compress_level=9)
        chunks = []
        for data in (source.read_bytes(), output.getvalue()):
            blocks = []
            offset = 8
            while offset < len(data):
                length = struct.unpack_from('>I', data, offset)[0] + 12
                blocks.append((data[offset + 4:offset + 8], data[offset:offset + length]))
                offset += length
            chunks.append(blocks)
        original, optimized = chunks
        assert original[0] == optimized[0], source
        compressed = b''.join(block for kind, block in optimized if kind == b'IDAT')
        result = b'\x89PNG\r\n\x1a\n'
        for kind, block in original:
            if kind == b'IDAT':
                result += compressed
                compressed = b''
            else:
                result += block
        with Image.open(BytesIO(result)) as check:
            assert image.tobytes() == check.tobytes(), source
    if len(result) < source.stat().st_size:
        print(f'{source.name}: {source.stat().st_size:,} -> {len(result):,} bytes')
        source.write_bytes(result)

for name in ('scuba-diving', 'typeracer', 'typeracer-certified',
             'monkeytype', 'human-benchmark', 'compression-spreadsheet'):
    source = assets / f'{name}.png'
    target = source.with_suffix('.webp')
    with Image.open(source) as image:
        image.save(target, lossless=True, exact=True, method=6,
                   icc_profile=image.info.get('icc_profile', b''))
        with Image.open(target) as result:
            assert image.convert('RGBA').tobytes() == result.convert('RGBA').tobytes(), source
    print(f'{source.name}: {source.stat().st_size:,} -> {target.stat().st_size:,} bytes')

pages = ''.join(re.sub(r'<!--.*?-->', '', page.read_text(encoding='utf-8'), flags=re.S)
                for page in root.glob('portfolio-*.html'))
for source in (*assets.glob('music/*.mp4'), *assets.glob('cs_portfolio/*.mp4')):
    if source.relative_to(root).as_posix() not in pages:
        continue
    with source.open('rb') as video:
        while header := video.read(8):
            size, kind = struct.unpack('>I4s', header)
            header_size = 8
            if size == 1:
                size = struct.unpack('>Q', video.read(8))[0]
                header_size = 16
            if kind == b'moov':
                break
            if kind == b'mdat':
                target = source.with_suffix('.faststart.mp4')
                subprocess.run(['ffmpeg', '-v', 'error', '-y', '-i', str(source),
                                '-map', '0', '-c', 'copy', '-map_metadata', '0',
                                '-movflags', '+faststart', str(target)], check=True)
                shutil.move(target, source)
                print(f'{source.name}: moved playback metadata to the start')
                break
            if size < header_size:
                break
            video.seek(size - header_size, 1)
