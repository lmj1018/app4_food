#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import re
import sys
import time
from dataclasses import dataclass
from http import HTTPStatus
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from typing import Any
from urllib.parse import parse_qs, urlsplit

SCRIPT_DIR = Path(__file__).resolve().parent
REPO_ROOT = SCRIPT_DIR.parent
MAPS_DIR = REPO_ROOT / "assets" / "ui" / "pinball" / "maps"
MANIFEST_PATH = MAPS_DIR / "manifest.json"
MAPS_DIR_DISPLAY = "assets/ui/pinball/maps"
SAFE_ID_PATTERN = re.compile(r"[^a-zA-Z0-9._-]+")


def sanitize_map_id(value: Any) -> str:
    raw = str(value or "").strip()
    cleaned = SAFE_ID_PATTERN.sub("_", raw)
    return cleaned or f"v2_map_{time.time_ns()}"


def sanitize_map_file_name(value: Any, fallback_map_id: str) -> str:
    raw = str(value or "").strip()
    if not raw:
        return f"{fallback_map_id}.json"
    base_name = Path(raw).name
    if not base_name.lower().endswith(".json"):
        base_name = f"{base_name}.json"
    safe_name = SAFE_ID_PATTERN.sub("_", base_name)
    if not safe_name.lower().endswith(".json"):
        safe_name = f"{safe_name}.json"
    return safe_name or f"{fallback_map_id}.json"


def ensure_maps_dir() -> None:
    MAPS_DIR.mkdir(parents=True, exist_ok=True)


def load_json_file(path: Path, default_value: Any) -> Any:
    if not path.exists():
        return default_value
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except Exception:
        return default_value


def write_json_file(path: Path, payload: Any) -> None:
    serialized = json.dumps(payload, ensure_ascii=False, indent=2) + "\n"
    temp_path = path.with_suffix(path.suffix + ".tmp")
    temp_path.write_text(serialized, encoding="utf-8")
    temp_path.replace(path)


def normalize_manifest(raw_manifest: Any) -> dict[str, Any]:
    if not isinstance(raw_manifest, dict):
        return {"version": 1, "maps": []}
    maps = raw_manifest.get("maps")
    if not isinstance(maps, list):
        maps = []
    safe_maps = []
    for entry in maps:
        if isinstance(entry, dict):
            safe_maps.append(entry)
    version = raw_manifest.get("version")
    if not isinstance(version, int):
        try:
            version = int(version)
        except Exception:
            version = 1
    return {
        "version": max(1, version),
        "maps": safe_maps,
    }


def _parse_sort_value(value: Any, fallback: int = 9999) -> int:
    try:
        return int(value)
    except Exception:
        return fallback


def _list_map_json_file_names() -> list[str]:
    ensure_maps_dir()
    file_names: list[str] = []
    for path in MAPS_DIR.glob("*.json"):
        name = path.name
        if name.lower() == "manifest.json":
            continue
        file_names.append(name)
    file_names.sort(key=lambda item: item.lower())
    return file_names


def sync_manifest_with_map_files(manifest: dict[str, Any]) -> tuple[dict[str, Any], bool]:
    safe_manifest = normalize_manifest(manifest)
    maps = safe_manifest.get("maps")
    if not isinstance(maps, list):
        maps = []
    available_files = _list_map_json_file_names()
    available_set = set(available_files)
    normalized_maps: list[dict[str, Any]] = []
    used_files: set[str] = set()
    used_ids: set[str] = set()
    changed = False
    max_sort = 100

    for entry in maps:
        if not isinstance(entry, dict):
            changed = True
            continue
        map_id = sanitize_map_id(entry.get("id"))
        if not map_id:
            changed = True
            continue
        file_name = sanitize_map_file_name(entry.get("file"), map_id)
        if file_name.lower() == "manifest.json":
            changed = True
            continue
        if file_name not in available_set:
            fallback_file = f"{map_id}.json"
            if fallback_file in available_set:
                file_name = fallback_file
                changed = True
            else:
                changed = True
                continue
        if file_name in used_files:
            changed = True
            continue
        if map_id in used_ids:
            changed = True
            suffix = 2
            next_id = f"{map_id}_{suffix}"
            while next_id in used_ids:
                suffix += 1
                next_id = f"{map_id}_{suffix}"
            map_id = next_id

        sort_value = _parse_sort_value(entry.get("sort"), 9999)
        max_sort = max(max_sort, sort_value)
        normalized_maps.append(
            {
                "id": map_id,
                "title": str(entry.get("title", map_id)).strip() or map_id,
                "engine": str(entry.get("engine", "v2")).strip() or "v2",
                "file": file_name,
                "enabled": entry.get("enabled", True) is not False,
                "sort": sort_value,
            }
        )
        used_files.add(file_name)
        used_ids.add(map_id)

    for file_name in available_files:
        if file_name in used_files:
            continue
        base_id = sanitize_map_id(Path(file_name).stem)
        if not base_id:
            base_id = f"v2_map_{time.time_ns()}"
        map_id = base_id
        if map_id in used_ids:
            suffix = 2
            candidate = f"{base_id}_{suffix}"
            while candidate in used_ids:
                suffix += 1
                candidate = f"{base_id}_{suffix}"
            map_id = candidate
        max_sort += 10
        normalized_maps.append(
            {
                "id": map_id,
                "title": map_id,
                "engine": "v2",
                "file": file_name,
                "enabled": True,
                "sort": max_sort,
            }
        )
        used_ids.add(map_id)
        changed = True

    normalized_maps.sort(key=lambda item: (_parse_sort_value(item.get("sort"), 9999), str(item.get("id", ""))))
    safe_manifest["maps"] = normalized_maps
    return safe_manifest, changed


def load_manifest() -> dict[str, Any]:
    ensure_maps_dir()
    manifest = normalize_manifest(load_json_file(MANIFEST_PATH, {"version": 1, "maps": []}))
    manifest, changed = sync_manifest_with_map_files(manifest)
    if not MANIFEST_PATH.exists() or changed:
        write_json_file(MANIFEST_PATH, manifest)
    return manifest


def save_manifest(manifest: dict[str, Any]) -> None:
    ensure_maps_dir()
    synced_manifest, _ = sync_manifest_with_map_files(normalize_manifest(manifest))
    write_json_file(MANIFEST_PATH, synced_manifest)


def list_maps_for_response(manifest: dict[str, Any]) -> list[dict[str, Any]]:
    maps = manifest.get("maps") if isinstance(manifest, dict) else []
    if not isinstance(maps, list):
        return []
    normalized: list[dict[str, Any]] = []
    for entry in maps:
        if not isinstance(entry, dict):
            continue
        map_id = str(entry.get("id", "")).strip()
        file_name = str(entry.get("file", "")).strip()
        if not map_id or not file_name:
            continue
        sort_value = entry.get("sort", 9999)
        try:
            sort_value = int(sort_value)
        except Exception:
            sort_value = 9999
        normalized.append(
            {
                "id": map_id,
                "title": str(entry.get("title", map_id)).strip() or map_id,
                "engine": str(entry.get("engine", "v2")).strip() or "v2",
                "file": sanitize_map_file_name(file_name, map_id),
                "enabled": entry.get("enabled", True) is not False,
                "sort": sort_value,
            }
        )
    normalized.sort(key=lambda item: item.get("sort", 9999))
    return normalized


def find_manifest_entry(manifest: dict[str, Any], map_id: str) -> tuple[int, dict[str, Any]] | tuple[None, None]:
    maps = manifest.get("maps")
    if not isinstance(maps, list):
        return None, None
    for index, entry in enumerate(maps):
        if not isinstance(entry, dict):
            continue
        if str(entry.get("id", "")).strip() == map_id:
            return index, entry
    return None, None


@dataclass
class SaveResult:
    map_id: str
    title: str
    file_name: str


def save_map_payload(payload: dict[str, Any]) -> SaveResult:
    mode = str(payload.get("mode", "")).strip().lower()
    map_json = payload.get("mapJson")
    if not isinstance(map_json, dict):
        raise ValueError("mapJson payload is required")

    manifest = load_manifest()
    maps = manifest.setdefault("maps", [])
    if not isinstance(maps, list):
        manifest["maps"] = []
        maps = manifest["maps"]

    if mode == "selected":
        selected_map_id = sanitize_map_id(payload.get("selectedMapId"))
        index, entry = find_manifest_entry(manifest, selected_map_id)
        if entry is None or index is None:
            raise ValueError("Selected map not found in manifest")
        file_name = sanitize_map_file_name(entry.get("file"), selected_map_id)
        title = str(map_json.get("title") or entry.get("title") or selected_map_id).strip() or selected_map_id
    elif mode == "new":
        selected_map_id = sanitize_map_id(payload.get("newMapId"))
        title = str(payload.get("newMapTitle") or map_json.get("title") or selected_map_id).strip() or selected_map_id
        file_name = f"{selected_map_id}.json"
        index, entry = find_manifest_entry(manifest, selected_map_id)
    else:
        raise ValueError("Unsupported save mode")

    map_json["id"] = selected_map_id
    map_json["title"] = title
    schema_version = map_json.get("schemaVersion", 1)
    try:
        schema_version = int(schema_version)
    except Exception:
        schema_version = 1
    map_json["schemaVersion"] = max(1, schema_version)

    ensure_maps_dir()
    target_map_path = (MAPS_DIR / file_name).resolve()
    if target_map_path.parent != MAPS_DIR.resolve():
        raise ValueError("Invalid target map file path")
    write_json_file(target_map_path, map_json)

    if entry is None or index is None:
        existing_sorts = []
        for item in maps:
            if isinstance(item, dict):
                try:
                    existing_sorts.append(int(item.get("sort", 0)))
                except Exception:
                    continue
        next_sort = (max(existing_sorts) + 10) if existing_sorts else 100
        maps.append(
            {
                "id": selected_map_id,
                "title": title,
                "engine": "v2",
                "file": file_name,
                "enabled": True,
                "sort": next_sort,
            }
        )
    else:
        entry["id"] = selected_map_id
        entry["title"] = title
        entry["engine"] = "v2"
        entry["file"] = file_name
        if "enabled" not in entry:
            entry["enabled"] = True
        if "sort" not in entry:
            entry["sort"] = 9999

    save_manifest(manifest)
    return SaveResult(
        map_id=selected_map_id,
        title=title,
        file_name=file_name,
    )


def delete_map_payload(payload: dict[str, Any]) -> dict[str, str]:
    raw_map_id = str(payload.get("mapId") or "").strip()
    if not raw_map_id:
        raise ValueError("mapId is required")
    map_id = sanitize_map_id(raw_map_id)

    manifest = load_manifest()
    maps = manifest.get("maps")
    if not isinstance(maps, list):
        raise ValueError("Manifest is invalid")

    index, entry = find_manifest_entry(manifest, map_id)
    if entry is None or index is None:
        raise ValueError("Map not found")

    file_name = sanitize_map_file_name(entry.get("file"), map_id)
    target_map_path = (MAPS_DIR / file_name).resolve()
    if target_map_path.parent != MAPS_DIR.resolve():
        raise ValueError("Invalid map file path")

    del maps[index]
    save_manifest(manifest)

    if target_map_path.exists():
        try:
            target_map_path.unlink()
        except Exception:
            # Manifest delete succeeded; file cleanup best-effort.
            pass

    return {
        "mapId": map_id,
        "file": file_name,
    }


class PinballMapMakerHandler(SimpleHTTPRequestHandler):
    server_version = "PinballMapMakerV2HTTP/1.0"

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        super().__init__(*args, directory=str(REPO_ROOT), **kwargs)

    def log_message(self, fmt: str, *args: Any) -> None:
        message = fmt % args
        sys.stdout.write(f"[http] {self.address_string()} - {message}\n")

    def do_GET(self) -> None:  # noqa: N802
        parsed = urlsplit(self.path)
        if parsed.path.startswith("/__pinball_v2_api/"):
            self.handle_api_get(parsed)
            return
        super().do_GET()

    def do_POST(self) -> None:  # noqa: N802
        parsed = urlsplit(self.path)
        if parsed.path.startswith("/__pinball_v2_api/"):
            self.handle_api_post(parsed)
            return
        self.send_json(
            HTTPStatus.NOT_FOUND,
            {"ok": False, "reason": "Unsupported endpoint"},
        )

    def parse_json_body(self) -> dict[str, Any]:
        length_raw = self.headers.get("Content-Length")
        if not length_raw:
            return {}
        length = int(length_raw)
        raw_bytes = self.rfile.read(length)
        raw_text = raw_bytes.decode("utf-8")
        if not raw_text.strip():
            return {}
        payload = json.loads(raw_text)
        if not isinstance(payload, dict):
            raise ValueError("JSON body must be an object")
        return payload

    def send_json(self, status: HTTPStatus, payload: dict[str, Any]) -> None:
        raw = json.dumps(payload, ensure_ascii=False).encode("utf-8")
        self.send_response(status.value)
        self.send_header("Content-Type", "application/json; charset=utf-8")
        self.send_header("Cache-Control", "no-store")
        self.send_header("Content-Length", str(len(raw)))
        self.end_headers()
        self.wfile.write(raw)

    def handle_api_get(self, parsed: Any) -> None:
        path = parsed.path
        query = parse_qs(parsed.query or "")
        try:
            if path == "/__pinball_v2_api/maps":
                manifest = load_manifest()
                self.send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "mapsDir": MAPS_DIR_DISPLAY,
                        "maps": list_maps_for_response(manifest),
                    },
                )
                return

            if path == "/__pinball_v2_api/map":
                raw_map_id = query.get("mapId", [""])[0]
                map_id = str(raw_map_id or "").strip()
                if not map_id:
                    self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "reason": "mapId is required"})
                    return
                manifest = load_manifest()
                _, entry = find_manifest_entry(manifest, map_id)
                if entry is None:
                    self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "reason": "Map not found"})
                    return
                file_name = sanitize_map_file_name(entry.get("file"), map_id)
                target = (MAPS_DIR / file_name).resolve()
                if target.parent != MAPS_DIR.resolve() or not target.exists():
                    self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "reason": "Map file not found"})
                    return
                map_json = load_json_file(target, None)
                if not isinstance(map_json, dict):
                    self.send_json(HTTPStatus.INTERNAL_SERVER_ERROR, {"ok": False, "reason": "Map file is invalid"})
                    return
                self.send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "mapId": map_id,
                        "file": file_name,
                        "mapJson": map_json,
                    },
                )
                return

            self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "reason": "Unsupported endpoint"})
        except Exception as error:  # pragma: no cover
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"ok": False, "reason": str(error)},
            )

    def handle_api_post(self, parsed: Any) -> None:
        path = parsed.path
        try:
            if path == "/__pinball_v2_api/save":
                payload = self.parse_json_body()
                result = save_map_payload(payload)
                manifest = load_manifest()
                self.send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "mapsDir": MAPS_DIR_DISPLAY,
                        "mapId": result.map_id,
                        "title": result.title,
                        "file": result.file_name,
                        "maps": list_maps_for_response(manifest),
                    },
                )
                return

            if path == "/__pinball_v2_api/delete":
                payload = self.parse_json_body()
                deleted = delete_map_payload(payload)
                manifest = load_manifest()
                self.send_json(
                    HTTPStatus.OK,
                    {
                        "ok": True,
                        "mapsDir": MAPS_DIR_DISPLAY,
                        "deletedMapId": deleted["mapId"],
                        "deletedFile": deleted["file"],
                        "maps": list_maps_for_response(manifest),
                    },
                )
                return

            self.send_json(HTTPStatus.NOT_FOUND, {"ok": False, "reason": "Unsupported endpoint"})
        except ValueError as error:
            self.send_json(HTTPStatus.BAD_REQUEST, {"ok": False, "reason": str(error)})
        except Exception as error:  # pragma: no cover
            self.send_json(
                HTTPStatus.INTERNAL_SERVER_ERROR,
                {"ok": False, "reason": str(error)},
            )


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Pinball Map Maker V2 local server")
    parser.add_argument("--host", default="127.0.0.1")
    parser.add_argument("--port", type=int, default=8080)
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    ensure_maps_dir()
    load_manifest()
    server = ThreadingHTTPServer((args.host, args.port), PinballMapMakerHandler)
    url = f"http://{args.host}:{args.port}/tools/pinball_map_maker_v2.html"
    print(f"Pinball Map Maker V2 server ready: {url}")
    print(f"Maps directory (fixed): {MAPS_DIR_DISPLAY}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        print("\nServer stopped.")
    finally:
        server.server_close()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
