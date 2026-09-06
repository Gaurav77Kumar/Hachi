# Builds the Chrome Web Store zip for Ads → Art from the project files.
# Excludes dev-only assets (lib/mock.js, tools/, dist/) and strips the mock
# <script> tags from the packaged HTML. Run from anywhere:
#  python tools/package.py
import re
import shutil
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"

COPY_ITEMS = [
    "manifest.json",
    "background.js",
    "content",
    "popup",
    "lib",
    "icons",
]
EXCLUDE = {"lib/mock.js"}


def main():
    manifest = (ROOT / "manifest.json").read_text(encoding="utf-8")
    version = re.search(r'"version"\s*:\s*"([^"]+)"', manifest).group(1)
    out_dir = DIST / "package"
    out_zip = DIST / f"ads-art-v{version}.zip"

    if out_dir.exists():
        shutil.rmtree(out_dir)
    out_dir.mkdir(parents=True)

    for item in COPY_ITEMS:
        src = ROOT / item
        dst = out_dir / item
        if src.is_dir():
            shutil.copytree(src, dst)
        else:
            shutil.copy2(src, dst)
    for excl in EXCLUDE:
        p = out_dir / excl
        if p.exists():
            p.unlink()

    # Remove the dev-only mock script tags from the packaged HTML.
    for html in (out_dir / "popup" / "popup.html",):
        text = html.read_text(encoding="utf-8")
        cleaned = "\n".join(
            line for line in text.splitlines() if "lib/mock.js" not in line
        )
        html.write_text(cleaned + "\n", encoding="utf-8")

    out_zip.parent.mkdir(exist_ok=True)
    if out_zip.exists():
        out_zip.unlink()
    with zipfile.ZipFile(out_zip, "w", zipfile.ZIP_DEFLATED) as zf:
        for p in sorted(out_dir.rglob("*")):
            if p.is_file():
                zf.write(p, p.relative_to(out_dir))

    print(f"packaged {out_zip}")
    with zipfile.ZipFile(out_zip) as zf:
        for name in zf.namelist():
            print("  ", name)


if __name__ == "__main__":
    main()
