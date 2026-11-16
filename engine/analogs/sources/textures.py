"""Global image mosaics of the Moon and Mars for the 3-D globe (NASA Solar System Treks)."""
from __future__ import annotations

import io
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path

from PIL import Image

from .http import SourceError, session
from .worldview import TEXTURE_DIR

TREK = {
    "moon": ("https://trek.nasa.gov/tiles/Moon/EQ/LRO_WAC_Mosaic_Global_303ppd_v02/1.0.0/default/default028mm/",
             "NASA Moon Trek · mosaico LRO WAC"),
    "mars": ("https://trek.nasa.gov/tiles/Mars/EQ/Mars_Viking_MDIM21_ClrMosaic_global_232m/1.0.0/default/default028mm/",
             "NASA Mars Trek · mosaico Viking MDIM 2.1"),
}
ZOOM = 3            # 16 x 8 tiles of 256 px = 4096 x 2048


def planet_texture(body: str) -> Path:
    """Stitch the Trek tile pyramid level into one equirectangular JPEG (cached)."""
    TEXTURE_DIR.mkdir(parents=True, exist_ok=True)
    path = TEXTURE_DIR / f"{body}.jpg"
    if path.exists() and path.stat().st_size > 50_000:
        return path
    base = TREK[body][0]
    cols, rows = 2 ** (ZOOM + 1), 2 ** ZOOM

    def tile(rc):
        r, c = rc
        resp = session().get(f"{base}{ZOOM}/{r}/{c}.jpg", timeout=60)
        if resp.status_code != 200:
            raise SourceError(f"Trek tile {ZOOM}/{r}/{c}: HTTP {resp.status_code}")
        return r, c, Image.open(io.BytesIO(resp.content)).convert("RGB")

    mosaic = Image.new("RGB", (cols * 256, rows * 256))
    with ThreadPoolExecutor(max_workers=8) as pool:
        for r, c, img in pool.map(tile, [(r, c) for r in range(rows) for c in range(cols)]):
            mosaic.paste(img, (c * 256, r * 256))
    mosaic.save(path, "JPEG", quality=88)
    return path
