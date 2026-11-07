# [egeeken.github.io](https://egeeken.github.io/)

My online resume and portfolio.

Media preparation requires Python with Pillow (`python -m pip install Pillow`),
and FFmpeg on PATH. After adding media, run `python scripts/optimize_media.py`
to update gallery dimensions, compress portraits as PNG, generate lossless WebP
images for other interests, and move MP4 playback metadata to the start without
re-encoding. The gallery JSON filler scripts also record dimensions; photography
tags are preserved.

Keep width and height attributes on portfolio media in sync with the source files
so lazy loading reserves the original layout. Original PNGs and gallery images
remain available; the lightbox uses full-resolution originals.

GitHub Actions builds the published site with `python scripts/build_site.py`.
This generates responsive WebP previews in `_site`, selects them by display size,
and keeps the originals for lightboxes. Preview files are cached between builds
and are never committed. Locally, install Pillow 11.3.0, run the same command,
then serve `_site` to preview the deployed version. Source HTML still works with
the original images when opened without a build.
