#!/usr/bin/env python3

import json
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError as exc:
    raise SystemExit("Pillow is required. Install it with: pip install Pillow") from exc


ROOT = Path(__file__).resolve().parents[1]
IMAGE_DIR = ROOT / "assets" / "rfk_jr"
OUTPUT_PATH = ROOT / "assets" / "rfk_jr_histograms.json"

BINS_PER_CHANNEL = 32
CHANNELS = ("r", "g", "b")
JPEG_EXTENSIONS = {".jpg", ".jpeg"}


def compute_histogram(path):
    with Image.open(path) as image:
        image = ImageOps.exif_transpose(image).convert("RGB")
        width, height = image.size
        raw_histogram = image.histogram()

    pixel_count = width * height
    values_per_bin = 256 // BINS_PER_CHANNEL
    histogram = []

    for channel in range(3):
        channel_histogram = raw_histogram[channel * 256:(channel + 1) * 256]

        for bin_index in range(BINS_PER_CHANNEL):
            start = bin_index * values_per_bin
            end = start + values_per_bin
            value = sum(channel_histogram[start:end]) / pixel_count
            histogram.append(round(value, 8))

    return histogram, width, height


def main():
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    image_paths = sorted(
        (
            path
            for path in IMAGE_DIR.rglob("*")
            if path.is_file() and path.suffix.lower() in JPEG_EXTENSIONS
        ),
        key=lambda path: path.as_posix().lower(),
    )

    images = []

    for path in image_paths:
        try:
            histogram, width, height = compute_histogram(path)
        except Exception as exc:
            print(f"Skipping {path}: {exc}")
            continue

        images.append(
            {
                "file": path.relative_to(IMAGE_DIR).as_posix(),
                "width": width,
                "height": height,
                "histogram": histogram,
            }
        )

    payload = {
        "version": 1,
        "bins_per_channel": BINS_PER_CHANNEL,
        "channels": list(CHANNELS),
        "images": images,
    }

    OUTPUT_PATH.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")) + "\n",
        encoding="utf-8",
    )

    print(f"Wrote {len(images)} histograms to {OUTPUT_PATH}")


if __name__ == "__main__":
    main()
