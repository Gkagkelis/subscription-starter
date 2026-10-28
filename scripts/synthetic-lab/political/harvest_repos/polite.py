"""Polite HTTP helper for the political repository harvest (stdlib only).

- descriptive User-Agent
- <= 1 request / second per host (configurable)
- honours Retry-After on 429/503
"""

import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

# Same descriptive UA as the project lake pipeline (scripts/synthetic-lab/lake/net.py)
UA = "GreekSyntheticResearchLab-DataLake/1.0 (research; contact: repository owner)"
_last = {}
MIN_GAP = 1.0


class HttpError(Exception):
    def __init__(self, status, url, body=""):
        super().__init__(f"HTTP {status} {url} {body[:300]}")
        self.status = status
        self.body = body


def _throttle(url, gap=None):
    host = urllib.parse.urlparse(url).netloc
    g = MIN_GAP if gap is None else gap
    wait = _last.get(host, 0) + g - time.time()
    if wait > 0:
        time.sleep(wait)
    _last[host] = time.time()


def request(url, params=None, data=None, headers=None, retries=4, timeout=60, binary=False, max_bytes=None, method=None):
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params, doseq=True)
    h = {"User-Agent": UA, "Accept": "*/*"}
    h.update(headers or {})
    body = None
    if data is not None:
        body = json.dumps(data).encode()
        h["Content-Type"] = "application/json"
    last = None
    for attempt in range(retries + 1):
        _throttle(url)
        try:
            req = urllib.request.Request(url, data=body, headers=h, method=method)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                if max_bytes is not None:
                    raw = r.read(max_bytes + 1)
                    if len(raw) > max_bytes:
                        raise HttpError(413, url, f"larger than {max_bytes}")
                else:
                    raw = r.read()
                return raw if binary else raw.decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            txt = ""
            try:
                txt = e.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            last = HttpError(e.code, url, txt)
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                ra = e.headers.get("Retry-After") if e.headers else None
                try:
                    w = float(ra)
                except (TypeError, ValueError):
                    w = 2 ** (attempt + 2)
                time.sleep(min(180, w))
                continue
            raise last
        except HttpError:
            raise
        except Exception as e:
            last = e
            if attempt < retries:
                time.sleep(2 ** (attempt + 1))
                continue
            raise
    raise last


def get_json(url, params=None, **kw):
    hd = {"Accept": "application/json"}
    hd.update(kw.pop("headers", {}) or {})
    return json.loads(request(url, params=params, headers=hd, **kw))


def post_json(url, data, **kw):
    return json.loads(request(url, data=data, headers={"Accept": "application/json"}, **kw))


def download(url, dest, max_bytes=500 * 1024 * 1024):
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return sha256_file(dest), os.path.getsize(dest)
    raw = request(url, binary=True, timeout=600, max_bytes=max_bytes, retries=3)
    tmp = dest + ".part"
    with open(tmp, "wb") as fh:
        fh.write(raw)
    os.replace(tmp, dest)
    return hashlib.sha256(raw).hexdigest(), len(raw)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
