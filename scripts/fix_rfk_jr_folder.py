#!/usr/bin/env python3

from pathlib import Path
from PIL import Image, ImageOps

try:
    import pillow_avif  # noqa: F401
except ImportError:
    pass


ROOT = Path(__file__).resolve().parents[1]
INPUT_DIR = ROOT / "assets" / "rfk_jr"
OUTPUT_DIR = ROOT / "assets" / "rfk_jr_processed"

OUTPUT_SIZE = (320, 240)
JPEG_QUALITY = 30

SUPPORTED_EXTENSIONS = {
    ".jpg",
    ".jpeg",
    ".png",
    ".webp",
    ".avif",
    ".bmp",
    ".tif",
    ".tiff",
}


def convert_image(source: Path, destination: Path):
    with Image.open(source) as image:
        image = ImageOps.exif_transpose(image)

        if image.mode in ("RGBA", "LA") or (
            image.mode == "P" and "transparency" in image.info
        ):
            rgba = image.convert("RGBA")
            background = Image.new("RGBA", rgba.size, "white")
            background.alpha_composite(rgba)
            image = background.convert("RGB")
        else:
            image = image.convert("RGB")

        image = ImageOps.fit(
            image,
            OUTPUT_SIZE,
            method=Image.Resampling.LANCZOS,
            centering=(0.5, 0.5),
        )

        destination.parent.mkdir(parents=True, exist_ok=True)

        image.save(
            destination,
            "JPEG",
            quality=JPEG_QUALITY,
            optimize=True,
            progressive=True,
        )


def main():
    OUTPUT_DIR.mkdir(parents=True, exist_ok=True)

    sources = sorted(
        path
        for path in INPUT_DIR.rglob("*")
        if path.is_file() and path.suffix.lower() in SUPPORTED_EXTENSIONS
    )

    converted = 0
    failed = 0

    for index, source in enumerate(sources, start=1):
        relative = source.relative_to(INPUT_DIR)
        destination = OUTPUT_DIR / relative.with_suffix(".jpg")

        try:
            convert_image(source, destination)
            converted += 1
            print(f"[{index}/{len(sources)}] {relative} -> {destination.relative_to(OUTPUT_DIR)}")
        except Exception as exc:
            failed += 1
            print(f"[{index}/{len(sources)}] FAILED {relative}: {exc}")

    print()
    print(f"Converted: {converted}")
    print(f"Failed:    {failed}")
    print(f"Output:    {OUTPUT_DIR}")


if __name__ == "__main__":
    main()