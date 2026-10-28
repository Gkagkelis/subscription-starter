"""Polite downloader for OPEN political-archive files (no login, no click-through).

Usage (run with python3 -I):
  python3 -I fetch_open.py <dest_dir> <licence> <source_page> <url> [<url> ...]

- Saves each URL into <dest_dir> (created if missing; must be a new/dedicated dir).
- Writes/updates <dest_dir>/manifest.json with url, filename, bytes, sha256,
  licence, source_page, retrieved_at (UTC).
- 1 request per second per call, descriptive User-Agent, uses the system proxy
  (HTTPS_PROXY) and CA bundle via urllib defaults. Files are never executed.
"""
import hashlib
import json
import os
import sys
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone

UA = "SyntheticLabResearchBot/1.0 (Greek political-archives inventory; polite, 1 req/s)"


def fetch(url: str, dest_dir: str) -> dict:
    name = os.path.basename(urllib.parse.urlparse(url).path) or "index.html"
    name = urllib.parse.unquote(name).replace("/", "_")
    path = os.path.join(dest_dir, name)
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    h = hashlib.sha256()
    n = 0
    with urllib.request.urlopen(req, timeout=300) as r, open(path + ".part", "wb") as f:
        status = r.status
        ctype = r.headers.get("Content-Type", "")
        while True:
            chunk = r.read(1 << 20)
            if not chunk:
                break
            f.write(chunk)
            h.update(chunk)
            n += len(chunk)
    os.replace(path + ".part", path)
    return {
        "url": url,
        "filename": name,
        "http_status": status,
        "content_type": ctype,
        "bytes": n,
        "sha256": h.hexdigest(),
        "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
    }


def main() -> None:
    dest, licence, source_page, *urls = sys.argv[1:]
    os.makedirs(dest, exist_ok=True)
    mpath = os.path.join(dest, "manifest.json")
    manifest = {"licence": licence, "source_page": source_page, "files": []}
    if os.path.exists(mpath):
        with open(mpath) as f:
            manifest = json.load(f)
    done = {x["url"] for x in manifest["files"]}
    for u in urls:
        if u in done:
            print("skip (already in manifest)", u)
            continue
        try:
            rec = fetch(u, dest)
            manifest["files"].append(rec)
            print("ok", rec["bytes"], rec["sha256"][:12], u)
        except Exception as e:  # noqa: BLE001
            print("FAIL", u, repr(e))
        time.sleep(1.1)
    manifest["licence"] = licence
    manifest["source_page"] = source_page
    with open(mpath, "w") as f:
        json.dump(manifest, f, indent=2, ensure_ascii=False)


if __name__ == "__main__":
    main()
