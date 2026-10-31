"""Global Behavioral Evidence Layer — λήψη Eurostat (Dissemination API, JSON-stat 2.0) για ΕΕ-27, με ρητές μονάδες.

Κάθε λήψη:
  * περιορίζεται σε συγκεκριμένους δείκτες/μονάδες/ομάδες/έτη (όχι μαζική λήψη)·
  * αποθηκεύεται κανονικοποιημένη: dataset, indic_is, unit, ind_type, geo, year, value, flag (σήμανση Eurostat: u = αναξιόπιστο,
    b = διακοπή σειράς κ.λπ.)·
  * έχει manifest (URL, ημερομηνία, άδεια, sha256, πλήθος τιμών)· επανεκκίνηση = παράλειψη ήδη κατεβασμένων τμημάτων·
  * ελέγχει ελεύθερο δίσκο πριν από κάθε λήψη.
Η απουσία τιμής (π.χ. Ελλάδα 2025) καταγράφεται ως απουσία — ποτέ ως μηδέν."""
from __future__ import annotations

import hashlib
import json
import shutil
import time
import urllib.parse
from pathlib import Path

import pandas as pd
import requests

from ..paths import ASE_DATA
from ..util import now_iso

API = "https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/{ds}"
EU27 = ["AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE", "SI", "SK"]
# ομάδες ατόμων: σύνολο, ηλικία, φύλο, εκπαίδευση, και διασταυρώσεις ηλικία×εκπαίδευση / φύλο×εκπαίδευση (μερική από κοινού δομή)
IND_TYPES = ["IND_TOTAL", "Y16_24", "Y25_34", "Y35_44", "Y45_54", "Y55_64", "Y65_74", "Y75_MAX", "M_Y16_74", "F_Y16_74", "I0_2", "I3_4", "I5_8",
             "Y16_24LO", "Y16_24ME", "Y16_24HI", "Y25_54LO", "Y25_54ME", "Y25_54HI", "Y55_74LO", "Y55_74ME", "Y55_74HI",
             "M_I0_2", "M_I3_4", "M_I5_8", "F_I0_2", "F_I3_4", "F_I5_8"]
ROOT = ASE_DATA / "global" / "eurostat"
MIN_FREE_BYTES = 1_000_000_000


class SourceUnavailable(RuntimeError):
    """Η πηγή δεν απάντησε / δεν είναι προσβάσιμη (διαφορετικό από «δεν υπάρχουν τιμές»)."""


def decode(js: dict, dataset: str) -> pd.DataFrame:
    ids, size = js["id"], js["size"]
    cats = {d: {v: k for k, v in js["dimension"][d]["category"]["index"].items()} for d in ids}
    flags = js.get("status") or {}
    rows = []
    for flat, val in (js.get("value") or {}).items():
        f, pos = int(flat), []
        for s in reversed(size):
            pos.append(f % s)
            f //= s
        key = {d: cats[d][p] for d, p in zip(ids, reversed(pos))}
        rows.append({"dataset": dataset, "indic_is": key.get("indic_is"), "unit": key.get("unit"), "ind_type": key.get("ind_type"),
                     "geo": key.get("geo"), "year": int(key.get("time")), "value": float(val), "flag": flags.get(flat, "")})
    return pd.DataFrame(rows)


def fetch(dataset: str, indicators: list[str], units: list[str], years: list[int], geos: list[str] = EU27, ind_types: list[str] = IND_TYPES,
          *, retries: int = 4, session: requests.Session | None = None) -> Path:
    """Λήψη (ή επαναχρησιμοποίηση) ενός τμήματος. Επιστρέφει τη διαδρομή του κανονικοποιημένου αρχείου."""
    params = [("lang", "en")] + [("indic_is", i) for i in indicators] + [("unit", u) for u in units] + [("time", str(y)) for y in years] + \
             [("geo", g) for g in geos] + [("ind_type", t) for t in ind_types]
    url = API.format(ds=dataset) + "?" + urllib.parse.urlencode(params)
    key = hashlib.sha256(url.encode()).hexdigest()[:20]
    out = ROOT / dataset / f"{key}.csv.gz"
    man = out.with_suffix("").with_suffix(".manifest.json")
    if out.exists() and man.exists():
        return out                                                        # επανεκκίνηση: ήδη κατεβασμένο
    if shutil.disk_usage(ASE_DATA if ASE_DATA.exists() else Path("/")).free < MIN_FREE_BYTES:
        raise SourceUnavailable("Ανεπαρκής ελεύθερος δίσκος (<1 GB) — η λήψη ακυρώθηκε")
    s = session or requests.Session()
    last = None
    for k in range(retries):
        try:
            r = s.get(url, timeout=120)
            if r.status_code == 200:
                js = r.json()
                break
            last = f"HTTP {r.status_code}"
            if r.status_code in (400, 404):
                raise SourceUnavailable(f"{dataset}: {last}")
        except requests.RequestException as e:
            last = str(e)
        time.sleep(2 ** (k + 1))
    else:
        raise SourceUnavailable(f"{dataset}: αποτυχία λήψης ({last})")
    df = decode(js, dataset)
    out.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(out, index=False, compression="gzip")
    man.write_text(json.dumps({"dataset": dataset, "label": js.get("label"), "url": url, "retrieved_at": now_iso(), "source_updated": js.get("updated"),
                               "licence": "CC BY 4.0 (Eurostat)", "rows": len(df), "sha256": hashlib.sha256(out.read_bytes()).hexdigest(),
                               "requested": {"indicators": indicators, "units": units, "years": years, "geos": geos, "ind_types": ind_types}},
                              ensure_ascii=False, indent=1), encoding="utf-8")
    return out


def load(dataset: str) -> pd.DataFrame:
    files = sorted((ROOT / dataset).glob("*.csv.gz"))
    if not files:
        raise SourceUnavailable(f"{dataset}: δεν έχει γίνει λήψη (ase_cli.py global-ingest)")
    df = pd.concat([pd.read_csv(f, dtype={"flag": str}, keep_default_na=False) for f in files], ignore_index=True)
    return df.drop_duplicates(["dataset", "indic_is", "unit", "ind_type", "geo", "year"], keep="last")


def ingest_catalog(catalog: list[dict], years=(2021, 2022, 2023, 2024, 2025)) -> list[dict]:
    log = []
    for src in catalog:
        if src.get("access") != "eurostat_api":
            log.append({"id": src["id"], "status": src.get("status"), "note": "όχι Eurostat API — δεν κατεβαίνει αυτόματα"})
            continue
        try:
            p = fetch(src["dataset"], src["indicators"], src["units"], list(years))
            df = pd.read_csv(p, keep_default_na=False)
            log.append({"id": src["id"], "status": "ingested", "file": str(p), "rows": len(df), "greek_rows": int((df["geo"] == "EL").sum())})
        except SourceUnavailable as e:
            log.append({"id": src["id"], "status": "UNAVAILABLE_SOURCE", "error": str(e)})
    return log
