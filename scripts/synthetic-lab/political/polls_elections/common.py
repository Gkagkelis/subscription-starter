"""Κοινά εργαλεία: ευγενικό HTTP (throttle, Retry-After, maxlag) + manifest.

Τα κατεβασμένα αρχεία είναι ΜΗ ΕΜΠΙΣΤΑ δεδομένα: αποθηκεύονται ως bytes,
ποτέ δεν εκτελούνται. Όλα τα scripts τρέχουν με `python3 -I`.
"""

import hashlib
import json
import os
import time
import urllib.parse
import urllib.request
import urllib.error
from datetime import datetime, timezone

UA = "SyntheticLabResearch/1.0 (contact via repo owner)"
MIN_INTERVAL = 2.1  # δευτερόλεπτα ανάμεσα σε αιτήματα (<=1 req / 2s)
_last = [0.0]


def _sleep_until_allowed():
    dt = time.time() - _last[0]
    if dt < MIN_INTERVAL:
        time.sleep(MIN_INTERVAL - dt)


def http_get(url, params=None, max_tries=8, timeout=90):
    """GET με throttle και backoff σε 429/503/maxlag. Επιστρέφει bytes."""
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    backoff = 5.0
    last_err = None
    for _ in range(max_tries):
        _sleep_until_allowed()
        _last[0] = time.time()
        req = urllib.request.Request(url, headers={"User-Agent": UA, "Accept-Encoding": "identity"})
        try:
            with urllib.request.urlopen(req, timeout=timeout) as r:
                body = r.read()
                # MediaWiki maxlag: HTTP 200 + error code maxlag ή header Retry-After
                if b'"code":"maxlag"' in body[:500] or b'"code": "maxlag"' in body[:500]:
                    ra = float(r.headers.get("Retry-After") or backoff)
                    time.sleep(ra)
                    backoff = min(backoff * 2, 120)
                    continue
                return body
        except urllib.error.HTTPError as e:
            last_err = e
            if e.code in (429, 503, 502, 504):
                ra = e.headers.get("Retry-After")
                wait = float(ra) if ra and ra.isdigit() else backoff
                time.sleep(min(wait, 300))
                backoff = min(backoff * 2, 300)
                continue
            raise
        except (urllib.error.URLError, TimeoutError, ConnectionError) as e:
            last_err = e
            time.sleep(backoff)
            backoff = min(backoff * 2, 300)
    raise RuntimeError(f"failed after retries: {url}: {last_err}")


def sha256_bytes(b):
    return hashlib.sha256(b).hexdigest()


class Manifest:
    def __init__(self, path):
        self.path = path
        self.items = {}
        if os.path.exists(path):
            try:
                with open(path, encoding="utf-8") as f:
                    for it in json.load(f).get("files", []):
                        self.items[it["file"]] = it
            except Exception:
                self.items = {}

    def add(self, file, url, data, licence, **extra):
        it = {
            "file": file,
            "url": url,
            "sha256": sha256_bytes(data),
            "bytes": len(data),
            "licence": licence,
            "retrieved_at": datetime.now(timezone.utc).isoformat(timespec="seconds"),
        }
        it.update(extra)
        self.items[file] = it

    def save(self):
        os.makedirs(os.path.dirname(self.path), exist_ok=True)
        with open(self.path, "w", encoding="utf-8") as f:
            json.dump({"files": sorted(self.items.values(), key=lambda x: x["file"])}, f,
                      ensure_ascii=False, indent=1)


def write_bytes(path, data):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "wb") as f:
        f.write(data)
