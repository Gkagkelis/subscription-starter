"""HTTP με επαναπροσπάθειες, εκθετική αναμονή, σεβασμό σε Retry-After και ευγενικό ρυθμό ανά host."""

import hashlib
import json
import os
import time
import urllib.error
import urllib.parse
import urllib.request

UA = "GreekSyntheticResearchLab-DataLake/1.0 (research; contact: repository owner)"
_last_call = {}
MIN_INTERVAL = {"api.openalex.org": 0.25, "zenodo.org": 0.6, "api.figshare.com": 0.3, "dataverse.harvard.edu": 0.4,
                "ec.europa.eu": 0.15, "api.worldbank.org": 0.1, "datacatalogue.cessda.eu": 0.3, "api.openaire.eu": 0.5,
                "api.crossref.org": 0.3, "data.europa.eu": 0.3, "data.mendeley.com": 0.5}


class HttpError(Exception):
    def __init__(self, status, url, body=""):
        super().__init__(f"HTTP {status} {url} {body[:200]}")
        self.status = status


def _throttle(url):
    host = urllib.parse.urlparse(url).netloc
    gap = MIN_INTERVAL.get(host, 0.2)
    wait = _last_call.get(host, 0) + gap - time.time()
    if wait > 0:
        time.sleep(wait)
    _last_call[host] = time.time()


def get(url, params=None, headers=None, retries=4, timeout=60, binary=False, max_bytes=None):
    if params:
        url = url + ("&" if "?" in url else "?") + urllib.parse.urlencode(params, doseq=True)
    h = {"User-Agent": UA, "Accept": "*/*"}
    h.update(headers or {})
    last = None
    from . import db  # αποφυγή κυκλικής εισαγωγής

    db.commit_open()
    for attempt in range(retries + 1):
        _throttle(url)
        try:
            req = urllib.request.Request(url, headers=h)
            with urllib.request.urlopen(req, timeout=timeout) as r:
                if max_bytes is not None:
                    data = r.read(max_bytes + 1)
                    if len(data) > max_bytes:
                        raise HttpError(413, url, f"μεγαλύτερο από {max_bytes} bytes")
                else:
                    data = r.read()
                return data if binary else data.decode("utf-8", errors="replace")
        except urllib.error.HTTPError as e:
            body = ""
            try:
                body = e.read().decode("utf-8", errors="replace")
            except Exception:
                pass
            last = HttpError(e.code, url, body)
            if e.code in (429, 500, 502, 503, 504) and attempt < retries:
                ra = e.headers.get("Retry-After") if e.headers else None
                time.sleep(min(120, float(ra)) if ra and ra.isdigit() else 2 ** (attempt + 1))
                continue
            raise last
        except HttpError:
            raise
        except Exception as e:  # δίκτυο/timeout
            last = e
            if attempt < retries:
                time.sleep(2 ** (attempt + 1))
                continue
            raise
    raise last


def get_json(url, params=None, **kw):
    return json.loads(get(url, params=params, headers={"Accept": "application/json"}, **kw))


def download(url, dest, max_bytes=200 * 1024 * 1024, retries=3):
    """Λήψη σε αρχείο· επιστρέφει (sha256, size). Δεν ξανακατεβάζει αν υπάρχει ήδη."""
    os.makedirs(os.path.dirname(dest), exist_ok=True)
    if os.path.exists(dest) and os.path.getsize(dest) > 0:
        return sha256_file(dest), os.path.getsize(dest)
    data = get(url, binary=True, retries=retries, timeout=180, max_bytes=max_bytes)
    tmp = dest + ".part"
    with open(tmp, "wb") as fh:
        fh.write(data)
    os.replace(tmp, dest)
    return hashlib.sha256(data).hexdigest(), len(data)


def sha256_file(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for chunk in iter(lambda: fh.read(1 << 20), b""):
            h.update(chunk)
    return h.hexdigest()
