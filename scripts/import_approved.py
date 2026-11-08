#!/usr/bin/env python3
"""One-time checksum-gated import of the approved PWA v0.8.3 into site/."""
import hashlib
from pathlib import Path
from urllib.request import Request, urlopen

BASE = "https://round-timer-pwa.pages.dev/"
EXPECTED = {
    "sw.js": "3ac186a4adbdc81689de2a3aeb20909ef8729731f1fce8eaf48e0db73ee79c83",
    "engine.mjs": "1f99d689ad8894bc89ab591b4447e1336dc2b5faf97781ad4e40abd0058416c8",
    "index.html": "4636aba0879a151d30cc64c98b91d9d3cc137e79bd2fb10e518619874d7a6f15",
    "app.mjs": "5724d1b66f66688871f6948a076c18ca91c3f2b96c60f7d1595acfc2e4c68fc1",
    "styles.css": "5ac2df0416beab144424a91d638266acf800b2ea5808076b91374799f3009a0a",
    "icons/apple-touch-icon.png": "f1d99987b223a62ed42925b34b4789d9901a6f358195bc7abf71c11efd81cc96",
    "icons/icon-192.png": "2b457b5b9d577dc69ed3564c740877259945618f3a287273dabda84b808ede00",
    "icons/icon-512.png": "b1ace2364d256b74d01113dfdf1b5fc9bcf69e7f5dab7c2ea8633a5686b994f3",
    "manifest.webmanifest": "2200fc4ffa9ce00db8f08e89122974faa74123e414767cf6ec70a7fd3a79816a",
    "sounds/gong-end.mp3": "13c66a498dfae6921fe77343550f29b06c4470e04e5c7373629f0639096e43d7",
    "sounds/gong-start.mp3": "b440d5440f2d104d15ac3e0553366e7bf0db13014599d14e5e8b94b3744a4333",
    "sounds/woodclack.mp3": "7bbc5e40111dbb7d61d50a7984cccc25bdc55c37ab1c056d5b18c6ae7147aa71",
}

def main() -> None:
    for name, expected_hash in sorted(EXPECTED.items()):
        destination = Path("site") / name
        destination.parent.mkdir(parents=True, exist_ok=True)
        req = Request(BASE + name, headers={"Cache-Control": "no-cache", "User-Agent": "FAST-LANE-Verified-Import"})
        with urlopen(req, timeout=35) as response:
            data = response.read()
        actual = hashlib.sha256(data).hexdigest()
        if actual != expected_hash:
            raise SystemExit(f"REFUSE import: SHA-256 mismatch for {name}")
        destination.write_bytes(data)
        print(f"PASS {name}: SHA-256 {actual}")
    Path("site/.nojekyll").write_text("")
    print(f"PASS: Imported {len(EXPECTED)} approved files into site/. No deployment.")


if __name__ == "__main__":
    main()
