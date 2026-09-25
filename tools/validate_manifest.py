import json
import re
import struct
from html.parser import HTMLParser
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
MANIFEST_PATH = ROOT / "manifest.json"
VERSION_RE = re.compile(r"^(0|[1-9]\d*)(\.(0|[1-9]\d*)){0,3}$")
ICON_SIZES = {"16", "32", "48", "128"}


class LocalReferenceParser(HTMLParser):
    def __init__(self):
        super().__init__()
        self.references = []

    def handle_starttag(self, tag, attrs):
        values = dict(attrs)
        for attribute in ("src", "href"):
            value = values.get(attribute)
            if value and "://" not in value and not value.startswith("data:"):
                self.references.append(value)


def require(condition, message):
    if not condition:
        raise ValueError(message)


def validate_png(path, expected_size):
    data = path.read_bytes()
    require(data[:8] == b"\x89PNG\r\n\x1a\n", f"invalid PNG signature: {path}")
    require(data[12:16] == b"IHDR", f"missing PNG header: {path}")
    width, height = struct.unpack(">II", data[16:24])
    require((width, height) == (expected_size, expected_size), f"wrong icon dimensions: {path}")


def validate_popup_references(popup_path):
    parser = LocalReferenceParser()
    parser.feed(popup_path.read_text(encoding="utf-8"))
    for reference in parser.references:
        if reference.startswith("#"):
            continue
        reference_path = reference.split("?", 1)[0]
        path = (popup_path.parent / reference_path).resolve()
        require(path.is_file(), f"missing popup reference: {reference}")
        require(path.is_relative_to(ROOT), f"popup reference escapes repository: {reference}")


def validate_manifest():
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    require(manifest.get("manifest_version") == 3, "manifest_version must be 3")
    require(isinstance(manifest.get("name"), str) and 1 <= len(manifest["name"]) <= 75, "name must be 1-75 characters")
    description = manifest.get("description", "")
    require(isinstance(description, str) and len(description) <= 132, "description must be at most 132 characters")
    version = manifest.get("version", "")
    require(isinstance(version, str) and VERSION_RE.fullmatch(version) and any(int(part) > 0 for part in version.split(".")), "invalid version")

    permissions = manifest.get("permissions", [])
    require(isinstance(permissions, list), "permissions must be an array")
    require("storage" in permissions, "storage permission is required")
    require("activeTab" in permissions, "activeTab permission is required for site controls")

    worker = manifest.get("background", {}).get("service_worker")
    require(isinstance(worker, str) and (ROOT / worker).is_file(), "background service worker is missing")
    popup = manifest.get("action", {}).get("default_popup")
    require(isinstance(popup, str) and (ROOT / popup).is_file(), "popup is missing")
    validate_popup_references(ROOT / popup)

    for content_script in manifest.get("content_scripts", []):
        require(isinstance(content_script.get("matches"), list) and content_script["matches"], "content script matches are required")
        for script in content_script.get("js", []):
            require((ROOT / script).is_file(), f"content script is missing: {script}")

    icons = {**manifest.get("icons", {}), **manifest.get("action", {}).get("default_icon", {})}
    require(set(icons) == ICON_SIZES, "manifest must declare 16, 32, 48, and 128 icons")
    for size, icon in icons.items():
        path = ROOT / icon
        require(path.is_file(), f"icon is missing: {icon}")
        validate_png(path, int(size))

    options_page = manifest.get("options_page")
    if options_page is not None:
        require((ROOT / options_page).is_file(), "options page is missing")

    background_text = (ROOT / worker).read_text(encoding="utf-8")
    for imported in re.findall(r"importScripts\((.*?)\)", background_text):
        for reference in re.findall(r"[\"']([^\"']+)[\"']", imported):
            require((ROOT / reference).is_file(), f"service worker import is missing: {reference}")

    print(f"manifest validation passed: MV{manifest['manifest_version']} {version}, {len(icons)} icons")
    return manifest


if __name__ == "__main__":
    validate_manifest()
