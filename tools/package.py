import os
import re
import shutil
import tempfile
import zipfile
from pathlib import Path

from validate_manifest import validate_manifest

ROOT = Path(__file__).resolve().parent.parent
DIST = ROOT / "dist"
RUNTIME_FILES = (
    "manifest.json",
    "background.js",
    "content/art.js",
    "popup/popup.html",
    "popup/popup.css",
    "popup/popup.js",
    "lib/artworks.js",
    "lib/quotes.js",
    "lib/museum.js",
    "lib/weekcard.js",
    "icons/icon16.png",
    "icons/icon32.png",
    "icons/icon48.png",
    "icons/icon128.png",
)
MOCK_SCRIPT_RE = re.compile(r"\s*<script\s+src=[\"']\.\./lib/mock\.js(?:\?[^\"']*)?[\"']\s*></script>\s*")


def build():
    manifest = validate_manifest()
    version = manifest["version"]
    DIST.mkdir(exist_ok=True)
    out_zip = DIST / f"hachi-v{version}.zip"
    with tempfile.TemporaryDirectory(prefix=".hachi-build-", dir=DIST) as temporary:
        temporary_root = Path(temporary)
        staging = temporary_root / "package"
        staging.mkdir()
        for relative in RUNTIME_FILES:
            source = ROOT / relative
            destination = staging / relative
            destination.parent.mkdir(parents=True, exist_ok=True)
            shutil.copy2(source, destination)

        popup_path = staging / "popup/popup.html"
        popup_text = popup_path.read_text(encoding="utf-8")
        cleaned_popup, removed = MOCK_SCRIPT_RE.subn("", popup_text)
        if removed != 1:
            raise ValueError("packaging expected exactly one development mock script")
        popup_path.write_text(cleaned_popup, encoding="utf-8")

        temporary_zip = temporary_root / out_zip.name
        with zipfile.ZipFile(temporary_zip, "w", zipfile.ZIP_DEFLATED) as archive:
            for path in sorted(staging.rglob("*")):
                if path.is_file():
                    archive.write(path, path.relative_to(staging).as_posix())

        expected = set(RUNTIME_FILES)
        with zipfile.ZipFile(temporary_zip) as archive:
            if archive.testzip() is not None:
                raise ValueError("generated ZIP failed integrity validation")
            names = archive.namelist()
            if set(names) != expected or len(names) != len(set(names)):
                raise ValueError("generated ZIP does not contain the exact runtime file set")
            if any(name.startswith("/") or ".." in Path(name).parts for name in names):
                raise ValueError("generated ZIP contains an unsafe path")

        output_dir = DIST / "package"
        if output_dir.exists():
            shutil.rmtree(output_dir)
        shutil.copytree(staging, output_dir)
        os.replace(temporary_zip, out_zip)

    print(f"packaged {out_zip}")
    for relative in RUNTIME_FILES:
        print(f"  {relative}")


if __name__ == "__main__":
    build()
