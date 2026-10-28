"""
Eurobarometer (Standard / Special / Flash) — πίνακες αποτελεσμάτων από τον κατάλογο DG COMM στο data.europa.eu.

Πηγή: data.europa.eu, catalog «commu» (~980 έρευνες). Άδεια: Commission Decision 2011/833/EU (επαναχρησιμοποίηση με αναφορά).
- Volume A (xlsx/xls ή zip): ένα φύλλο ανά ερώτηση, στήλες = χώρες → στήλη EL (ή GR στις παλαιότερες).
- Volume C (zip με ένα αρχείο ανά χώρα): για την Ελλάδα, διασπάσεις ανά φύλο, ηλικία, εκπαίδευση, περιφέρεια κ.λπ.

Επίπεδο τεκμηρίωσης B (λεπτομερή σταθμισμένα aggregates, εθνικά αντιπροσωπευτικά δείγματα ~1000 συνεντεύξεων).
Οι παλαιότερες (<2012) καταγράφονται αλλά δεν εισάγονται (εκτός περιόδου 2012–2025).
"""

import json
import os
import re
import urllib.parse
import zipfile

from . import db, net
from .topics import classify, dedup_key, norm, quality_score

SRC = "eurobarometer"
SEARCH = "https://data.europa.eu/api/hub/search/search"
LICENSE = "Commission Decision 2011/833/EU (επαναχρησιμοποίηση με αναφορά πηγής) — data.europa.eu"
COUNTRY_CODES = {"BE", "BG", "CZ", "DK", "DE", "EE", "IE", "EL", "GR", "ES", "FR", "HR", "IT", "CY", "LV", "LT", "LU", "HU", "MT", "NL",
                 "AT", "PL", "PT", "RO", "SI", "SK", "FI", "SE", "UK", "DE-W", "DE-E", "DEW", "DEE", "TR", "MK", "IS", "NO", "CH", "RS",
                 "ME", "AL", "BA", "XK", "MD", "UA", "GE", "CY(TCC)", "EU27", "EU28", "EU25", "EU 27", "EU 28"}
VOL_A = re.compile(r"(?:[Vv]olume|VOLUME|[Vv]ol|[Tt]able|TABLE)[ _\-]?A(?![a-zA]|P[_ .\-]|P$)")
VOL_C = re.compile(r"(?:[Vv]olumes?|VOLUMES?|[Vv]ol|[Tt]ables?|TABLES?)[ _\-]?C(?![a-z])")
TABULAR = (".xlsx", ".xls", ".zip")
MAX_VOLC = 150 * 1024 * 1024


def _en(d):
    if isinstance(d, dict):
        return d.get("en") or next(iter(d.values()), "")
    return d or ""


def _wave_year(rid, title):
    m = re.search(r"\b(20[0-2]\d)\b", title or "")
    if m:
        return int(m.group(1))
    m = re.search(r"(?i)flash eurobarometer\s+(?:FL)?\s*(\d{3})", title or "") or re.search(r"(?i)_fl(\d{3})", rid or "")
    if m:  # Flash EB: εκτίμηση έτους από τον αύξοντα αριθμό (σημεία αναφοράς από τον κατάλογο)
        n = int(m.group(1))
        pts = [(300, 2010), (350, 2012), (400, 2014), (430, 2016), (460, 2018), (480, 2019), (500, 2022), (520, 2023), (540, 2024), (560, 2025), (580, 2026)]
        for (a, ya), (b, yb) in zip(pts, pts[1:]):
            if a <= n <= b:
                return int(round(ya + (yb - ya) * (n - a) / (b - a)))
    m = re.match(r"s\d+_(\d+)_(\d)", rid or "")
    if m:  # Standard EB κύμα w ≈ 2012 + (w-77)/2 (2 κύματα/έτος· 77 = άνοιξη 2012)
        w = int(m.group(1)) + int(m.group(2)) / 10
        if 60 <= w <= 110:
            return int(round(2012 + (w - 77) / 2.0 - 0.25))
    return None


def discover(con, limit=None):
    """Σελιδοποίηση του καταλόγου «commu»· κάθε έρευνα → study + εργασία λήψης."""
    page = db.checkpoint_get(con, "eb:discover_page", 0)
    n = 0
    while True:
        d = net.get_json(SEARCH, {"filters": "dataset", "limit": 100, "page": page, "facets": json.dumps({"catalog": ["commu"]})})
        rs = d["result"]["results"]
        for r in rs:
            rid = r["id"]
            title = _en(r.get("title"))
            dists = [{"title": _en(x.get("title")), "url": (x.get("access_url") or [None])[0], "format": (x.get("format") or {}).get("id"),
                      "license": (x.get("license") or {}).get("id")} for x in r.get("distributions", [])]
            year = _wave_year(rid, title)
            sid = f"{SRC}:{rid}"
            db.upsert_study(
                con, study_id=sid, source_id=SRC, external_id=rid, title=title, publisher="European Commission (DG COMM) — Eurobarometer",
                description=_en(r.get("description"))[:4000], country="EL", collection_year_start=year, collection_year_end=year,
                publication_year=int((r.get("issued") or "0")[:4]) or None, url=f"https://data.europa.eu/data/datasets/{rid}",
                license=LICENSE, license_open=1, access_restrictions="Δημόσια λήψη (data.europa.eu)", evidence_level="B",
                target_population="Κάτοικοι 15+ (Flash: συνήθως 15+ μέσω τηλεφώνου/online)", sampling_method="Πολυσταδιακή τυχαία δειγματοληψία / RDD (Flash)",
                representativeness="national_probability", topics=classify(title), dedup_key=dedup_key(title, year),
                raw_meta={"distributions": dists, "issued": r.get("issued"), "catalog": "commu"},
            )
            db.enqueue(con, sid, "eb_fetch", {"id": rid})
            n += 1
        page += 1
        db.checkpoint_set(con, "eb:discover_page", page)
        if len(rs) < 100 or (limit and n >= limit):
            break
    db.checkpoint_set(con, "eb:discover_page", 0)
    db.log(con, "discover", f"Eurobarometer: {n} έρευνες στον κατάλογο", source_id=SRC)
    con.commit()
    return n


# ---------------- Ανάγνωση πινάκων ----------------
def _sheets(path):
    """(όνομα, γραμμές) για κάθε φύλλο ενός xlsx/xls."""
    ext = os.path.splitext(path)[1].lower()
    if ext == ".xlsx":
        import openpyxl

        wb = openpyxl.load_workbook(path, read_only=True, data_only=True)
        for ws in wb.worksheets:
            yield ws.title, [list(r) for r in ws.iter_rows(values_only=True)]
        wb.close()
    elif ext == ".xls":
        import xlrd

        wb = xlrd.open_workbook(path, on_demand=True)
        for i in range(wb.nsheets):
            sh = wb.sheet_by_index(i)
            yield sh.name, [sh.row_values(r) for r in range(sh.nrows)]
            wb.unload_sheet(i)


def _cell(v):
    if v is None:
        return ""
    return str(v).strip()


def _num(v):
    if v is None:
        return None
    if isinstance(v, (int, float)):
        return float(v)
    s = str(v).strip().replace(",", ".").replace("%", "")
    if s in ("-", "–", "*", "0*"):
        return 0.0
    try:
        return float(s)
    except ValueError:
        return None


def _english(label):
    """«Homme\n-\nMan» → «Man»· «Très positive» μένει ως έχει."""
    parts = [p.strip() for p in re.split(r"\n\s*-\s*\n|\n", label) if p.strip() and p.strip() != "-"]
    return parts[-1] if parts else label.strip()


QCODE = re.compile(r"^(?:Q[A-Z]?\d+[A-Za-z0-9_.]*|[A-Z]{1,4}\d+[A-Za-z0-9_.]*)(?:\s*[.:)]|\s+(?=[A-Z«\"“(]))")
NOISE = re.compile(r"(?i)^(base|vol\.? ?[a-z]\b|eurobarom|flash eurobarom|special eurobarom|standard eurobarom|terrain|fieldwork|<<|weighted|"
                   r"volume|project|wave|home$|index$|significance|table of contents)")


def _code(t):
    m = QCODE.match(t or "")
    return m.group(0).rstrip(" .:)") if m else None


def _question(rows, lo, hi, coded_only=False):
    texts = []
    for r in rows[lo:hi]:
        for c in r:
            if isinstance(c, str) and len(c.strip()) > 6 and not NOISE.match(c.strip()):
                texts.append(c.strip())
    qs = [t for t in texts if _code(t)]
    pool = qs or ([] if coded_only else [t for t in texts if len(t) > 15])
    if not pool:
        return None, None
    q = pool[0]
    if len(pool) >= 2 and _code(pool[0]) and _code(pool[0]) == _code(pool[1]):
        q = pool[1]  # ζεύγος FR/EN → αγγλική διατύπωση
    return q, _code(q)


def _base_text(rows, lo, hi):
    last = None
    for r in rows[lo:hi]:
        for c in r:
            t = _cell(c)
            if re.match(r"(?i)base\s*:", t) and re.search(r"[a-z]{4}", t.lower()):
                last = t
    return last


BASE_LAB = re.compile(r"^(total$|weighted total|weighted base|base|ensemble|n=|unweighted|total \(n\)|total n$)")
STOP_LAB = re.compile(r"^(total ['\"‘’«]|net\b|moyenne|mean|average|<<|median|mediane)")


def _options(rows, start, col, stop=None, lab_end=None):
    """Γραμμές επιλογών κάτω από την κεφαλίδα· επιστρέφει (επιλογές[(label, pct)], βάση n, πολλαπλή;).

    Υποστηρίζει: (α) ζεύγη γραμμών πλήθος/ποσοστό (FR/EN ή ετικέτα + κενή γραμμή ποσοστού),
    (β) διάταξη «N / Total % / Valid %», (γ) απλές γραμμές ποσοστών (0–1 ή 0–100)."""
    end = min(len(rows), stop if stop is not None else start + 250)
    cands, base, blank, cur = [], None, 0, None
    stacked = []
    for r in rows[start:end]:
        c0 = _cell(r[0]) if r else ""
        c1 = _cell(r[1]) if len(r) > 1 else ""
        val = r[col] if col < len(r) else None
        # (β) διάταξη N / Total % / Valid %
        if c1 in ("N", "Total %", "Valid %", "Col %", "%"):
            if c1 == "N":
                cur = c0 or cur
            elif c1 in ("Total %", "Col %", "%") and cur is not None:
                v = _num(val)
                if v is not None and not BASE_LAB.match(norm(cur)):
                    stacked.append((_english(cur), v))
            continue
        lab = next((_cell(c) for c in r[:lab_end if lab_end else max(2, col)] if isinstance(c, str) and _cell(c)), "")
        v = _num(val)
        if not lab and not cands:
            continue  # γραμμές χωρίς ετικέτα πριν από την πρώτη επιλογή (υπο-κεφαλίδες, «-»)
        if not lab and v is None:
            blank += 1
            if blank >= 6 and (cands or stacked):
                break
            continue
        blank = 0
        if lab and BASE_LAB.match(norm(lab).replace("base: ", "base ").strip()) or re.match(r"(?i)base\s*:", lab):
            if not cands:
                if v and v > 1 and (base is None or "weighted" in norm(lab)):
                    base = int(v)
                continue
            break
        if lab and STOP_LAB.match(norm(lab)):
            break
        if lab and _code(lab) and cands:
            break
        if v is None:
            continue
        cands.append((_english(lab) if lab else "", v, val))
    if stacked:
        opts = [(l, round(v, 2)) for l, v in stacked]
    else:
        if not cands:
            return [], base, False
        paired = None
        if len(cands) >= 4:
            for p in (1, 0):
                cnt = [cands[i][1] for i in range(1 - p, len(cands), 2)]
                pct = [cands[i][1] for i in range(p, len(cands), 2)]
                k = min(len(cnt), len(pct))
                if k < 2:
                    continue
                ok = 0
                for c, v in zip(cnt[:k], pct[:k]):
                    if base and base > 0:
                        e = 100.0 * c / base
                        ok += abs(v - e) <= max(1.5, 0.08 * e) or abs(100 * v - e) <= max(1.5, 0.08 * e)
                    else:
                        ok += v <= 1.0 and c >= 1
                if ok >= max(2, int(0.8 * k)) and (any(c > 1 for c in cnt) or base):
                    paired = p
                    break
        if paired is not None:
            pr = [(cands[i][0] or cands[i - 1][0] if i >= 1 else cands[i][0], cands[i][1]) for i in range(paired, len(cands), 2)]
            scale = 100.0 if all(v <= 1.0 for _, v in pr) else 1.0
            opts = [(l, round(scale * v, 2)) for l, v in pr]
        else:
            nums = [v for _, v, _ in cands]
            if all(v <= 1.0 for v in nums) and sum(nums) > 0.5:
                opts = [(l, round(100 * v, 2)) for l, v, _ in cands]
            elif all(v <= 100 for v in nums) and 85 <= sum(nums) <= 400:
                opts = [(l, round(v, 2)) for l, v, _ in cands]
            else:
                return [], base, False
    seen, out = set(), []
    for l, v in opts:
        k = norm(l)
        if k in seen or not k:
            continue
        seen.add(k)
        out.append((l[:200], v))
    tot = sum(v for _, v in out)
    if tot > 105:  # σφάλμα πηγής: γραμμή «Δεν ξέρω» που αντιγράφει την τιμή προηγούμενης επιλογής
        vals = [v for _, v in out]
        out = [(l, v) for i, (l, v) in enumerate(out)
               if not (re.search(r"(?i)don.?t know|ne sait pas|dk|refus", l) and v > 0 and v in vals[:i])]
        tot = sum(v for _, v in out)
    if len(out) < 2 or tot < 85:
        return [], base, False
    return out, base, tot > 110


def _is_country_header(r):
    cells = [_cell(c).replace("\n", " ").upper() for c in r]
    codes = sum(1 for c in cells if c in COUNTRY_CODES or c.split(" ")[-1] in COUNTRY_CODES)
    if codes < 5:
        return None
    for j, c in enumerate(cells):
        if c in ("EL", "GR") or c.split(" ")[-1] in ("EL", "GR"):
            return j
    return None


def _segments(rows, finder):
    """Εντοπισμός κεφαλίδων (μία ή περισσότερες ερωτήσεις ανά φύλλο) → [(h, col, προηγούμενο_τέλος, επόμενη_κεφαλίδα)]."""
    heads = []
    for i, r in enumerate(rows):
        col = finder(rows, i)
        if col is not None:
            heads.append((i, col))
    out = []
    for k, (h, col) in enumerate(heads):
        lo = heads[k - 1][0] + 1 if k else 0
        nxt = heads[k + 1][0] if k + 1 < len(heads) else len(rows)
        out.append((h, col, lo, nxt))
    return out


def _qstop(rows, h, nxt):
    """Το τέλος των γραμμών επιλογών: λίγο πριν την επόμενη κεφαλίδα, στη γραμμή της επόμενης ερώτησης."""
    for i in range(nxt - 1, h, -1):
        r = rows[i]
        if any(isinstance(c, str) and _code(c.strip()) and len(c.strip()) > 12 for c in r[:3]):
            # κατεβαίνουμε στην πρώτη γραμμή του μπλοκ ερώτησης
            j = i
            while j - 1 > h and any(isinstance(c, str) and len(_cell(c)) > 12 for c in rows[j - 1][:3]) and _num(rows[j - 1][2] if len(rows[j - 1]) > 2 else None) is None:
                j -= 1
            return j
    return nxt


def parse_volume_a(path):
    """Πίνακες Volume A → [{code, question, base_text, options:[(label,pct)], n, multi}] για την Ελλάδα."""
    items = []
    for name, rows in _sheets(path):
        if norm(name) in ("content", "contents", "sommaire", "index", "note", "table of contents"):
            continue
        for h, col, lo, nxt in _segments(rows, lambda rs, i: _is_country_header(rs[i])):
            q, code = _question(rows, lo, h)
            first = next((j for j, c in enumerate(rows[h]) if _cell(c).replace("\n", " ").upper().split(" ")[-1] in COUNTRY_CODES
                          or re.match(r"(?i)(ue|eu)\s?\d", _cell(c))), col)
            opts, base, multi = _options(rows, h + 1, col, _qstop(rows, h, nxt), lab_end=max(1, first))
            if q and opts:
                items.append({"sheet": name, "code": code or name, "question": q, "base_text": _base_text(rows, lo, h),
                              "options": opts, "n": base, "multi": multi})
    return items


AGE4 = {"15-24", "25-39", "40-54", "55+"}
AGE7 = {"15-19": "15-24", "20-24": "15-24", "15-24": "15-24", "25-34": "25-34", "35-44": "35-44", "45-54": "45-54", "55-64": "55-64", "65-74": "65+", "75+": "65+", "65+": "65+"}
EDU_END = {"15-": "low_education", "-15": "low_education", "-15.0": "low_education", "16-19": "medium_education", "16-20": "medium_education",
           "20+": "high_education", "21+": "high_education"}


def _diploma(label):
    t = norm(label)
    if re.search(r"early childhood|primary|lower secondary|petite enfance|primaire|premier cycle", t):
        return "low_education"
    if re.search(r"upper secondary|post-secondary|deuxieme cycle|post-secondaire", t):
        return "medium_education"
    if re.search(r"tertiary|bachelor|master|doctor|licence|doctorat", t):
        return "high_education"
    return None


EXTRA_DIMS = {
    "subjective urbanisation": "urbanisation", "subjective urbanization": "urbanisation", "socio-professional category": "occupation",
    "respondent occupation": "occupation", "difficulties paying bills": "bills_difficulty", "consider belonging to": "social_class",
    "use of the internet": "internet_use", "greece": "region", "region": "region",
}
BUSINESS = re.compile(r"company size|sectors? \(nace|sectors grouped|number of employees|nace")


def _c_header(rows, i):
    r = rows[i]
    cells = [_cell(c).upper() for c in r[:4]]
    if any(c in ("EL", "GR", "TOTAL EL") for c in cells) and i > 0 and sum(1 for c in r if _cell(c)) >= 4:
        return next(j for j, c in enumerate(r) if _cell(c).upper() in ("EL", "GR", "TOTAL EL"))
    return None


def parse_volume_c(path):
    """Volume C (αρχείο χώρας EL) → [{code, question, n, groups:{(dim,val):(opts, n)}, business}]."""
    items = []
    for name, rows in _sheets(path):
        if norm(name) in ("content", "contents", "sommaire", "index", "note", "table of contents"):
            continue
        raw = _segments(rows, _c_header)
        segs = []
        for s_ in raw:  # διαδοχικές γραμμές κεφαλίδας με EL (ομάδα / υποομάδα) → μία, με το lo της πρώτης
            if segs and s_[0] == segs[-1][0] + 1:
                segs[-1] = (s_[0], s_[1], segs[-1][2], s_[3])
            else:
                segs.append(s_)
        for h, tot_col, lo, nxt in segs:
            sub = rows[h]
            hdr_rows = []  # γραμμές-κεφαλίδες από την πλησιέστερη προς τα πάνω· σταματάμε σε γραμμή με αριθμούς
            for i in range(h - 1, max(lo, h - 5) - 1, -1):
                cells = [c for c in rows[i][tot_col + 1:] if _cell(c)]
                if cells and sum(1 for c in cells if _num(c) is not None and _cell(c) not in ("-", "–")) > 0.5 * len(cells):
                    break
                hdr_rows.append(rows[i])
            nxt_row = rows[h + 1] if h + 1 < len(rows) else []
            beyond = [c for c in nxt_row[tot_col + 1:] if _cell(c)]
            if len(beyond) >= 3 and sum(1 for c in beyond if _num(c) is None) >= 0.6 * len(beyond):
                # η γραμμή με EL περιέχει τις ομάδες και η επόμενη τις υποομάδες (παλαιότερη διάταξη)
                hdr_rows = [rows[h]] + hdr_rows
                h += 1
                sub = rows[h]
            q, code = _question(rows, lo, h, coded_only=True)
            if not q:
                q, code = _question(rows, lo, max(lo, h - 4))
            if not q:
                continue
            def htext(j):
                for hr in hdr_rows:
                    t = _cell(hr[j]) if j < len(hr) else ""
                    if t and t not in ("-", "–") and t.upper() not in ("EL", "GR"):
                        return _english(t).strip()
                return None
            starts = {j for j in range(len(sub)) if htext(j)}
            colmap, cur = {}, None
            for j in range(len(sub)):
                if j in starts:
                    cur = htext(j)
                if j <= tot_col or not _cell(sub[j]):
                    continue
                colmap[j] = (cur or "", _english(_cell(sub[j])))
            age4_heads = {hd for hd, v in colmap.values() if norm(v).replace(" ", "") in ("25-39", "40-54")}
            stop = _qstop(rows, h, nxt)
            tot_opts, tot_n, multi = _options(rows, h + 1, tot_col, stop, lab_end=max(1, tot_col))
            if not tot_opts:
                continue
            groups = {("all", "all"): (tot_opts, tot_n)}
            business = any(BUSINESS.search(norm(hd)) for hd, _ in colmap.values())
            acc = {}
            for j, (head, val) in colmap.items():
                hn = norm(head)
                dim = gval = None
                vn = norm(val).replace(" ", "")
                if (hn.startswith("gender") and not hn.startswith("gender and")) or hn in ("sex", "sexe"):
                    gval = {"man": "male", "male": "male", "men": "male", "homme": "male", "woman": "female", "female": "female", "women": "female",
                            "femme": "female"}.get(vn)
                    dim = "gender" if gval else None
                elif hn.startswith(("age-7", "age 7", "age (7", "age-6", "agegroup 7", "age group 7")) or hn in ("age", "age7", "agegroup", "age group", "age-4", "age 4"):
                    if head in age4_heads or re.search(r"\b4\b|-4\b", hn):
                        dim, gval = ("age_group4", vn) if vn in AGE4 else (None, None)
                    else:
                        gval = AGE7.get(vn)
                        dim = "age_band" if gval else None
                elif hn.startswith("level of diploma"):
                    gval = _diploma(val)
                    dim = "education_group" if gval else None
                elif hn.startswith("education (end of)") or hn.startswith("education"):
                    gval = EDU_END.get(vn)
                    dim = "education_end_proxy" if gval else None
                else:
                    for k, dname in EXTRA_DIMS.items():
                        if hn.startswith(k):
                            dim, gval = dname, val.strip()[:80]
                            break
                if not dim:
                    continue
                opts, n, _ = _options(rows, h + 1, j, stop, lab_end=max(1, tot_col))
                if not opts or not n:
                    continue
                acc.setdefault((dim, gval), []).append((opts, n))
            for key, parts in acc.items():
                if len(parts) == 1:
                    groups[key] = parts[0]
                else:  # π.χ. 65-74 + 75+ → 65+: σταθμισμένος μέσος με τις σταθμισμένες βάσεις
                    N = sum(n for _, n in parts)
                    labs = [l for l, _ in parts[0][0]]
                    groups[key] = ([(l, round(sum(dict(o).get(l, 0) * n for o, n in parts) / N, 2)) for l in labs], N)
            items.append({"sheet": name, "code": code or name, "question": q, "n": tot_n, "multi": multi, "groups": groups, "business": business})
    return items


def _fieldwork_year(path):
    for k, (name, rows) in enumerate(_sheets(path)):
        if k > 4:
            break
        for r in rows[:15]:
            line = " ".join(_cell(x) for x in r)
            if re.search(r"(?i)fieldwork|terrain", line):
                ys = re.findall(r"(?<!\d)(19\d{2}|20[0-2]\d)(?!\d)", line)
                if ys:
                    return int(ys[0]), int(ys[-1])
                m = re.search(r"\b\d{1,2}/\d{1,2}/(\d{2})\b", line)  # μόνο πλήρης ημερομηνία ηη/μμ/εε (όχι «3/10 - 11/10»)
                if m:
                    return 2000 + int(m.group(1)), 2000 + int(m.group(1))
    return None


def _pick(dists, rx):
    for d in dists:
        t = d.get("title") or ""
        if rx.search(t.replace("Link to ", "")) and d.get("url"):
            yield d


def _extract_members(zpath, want):
    """Αποσυμπίεση μόνο των μελών που ικανοποιούν το want(name)."""
    out = []
    with zipfile.ZipFile(zpath) as z:
        for info in z.infolist():
            if info.is_dir() or "__MACOSX" in info.filename or info.file_size > 80 * 1024 * 1024:
                continue
            if os.path.splitext(info.filename)[1].lower() in (".xlsx", ".xls") and want(info.filename):
                dest = os.path.join(os.path.dirname(zpath), "unz", re.sub(r"[^\w.\-]", "_", os.path.basename(info.filename))[-120:])
                os.makedirs(os.path.dirname(dest), exist_ok=True)
                if not os.path.exists(dest):
                    with z.open(info) as src, open(dest, "wb") as fh:
                        fh.write(src.read())
                out.append(dest)
    return out


def _is_greek_member(name):
    b = os.path.basename(name).upper()
    return bool(re.search(r"(?<![A-Z])(EL|GR)(?![A-Z])", re.sub(r"\.XLSX?$", "", b))) or "GREECE" in b


def _save_file(con, sid, url, name, path, sha, size, role, status="DOWNLOADED", error=None):
    fid = f"{sid}#{name}"
    con.execute("INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                (fid, sid, url, name, path, sha, size, os.path.splitext(name)[1].lstrip(".").lower(), role, status, error, db.now(), None))
    return fid


def _write_items(con, sid, year, items_a, items_c):
    con.execute("DELETE FROM distributions WHERE study_id=?", (sid,))
    con.execute("DELETE FROM variables WHERE study_id=?", (sid,))
    by_code = {}
    for it in items_c:
        by_code[(it.get("code") or it["sheet"]).upper()] = it
    nvar = 0
    seen = set()
    for it in items_a + [c for c in items_c if (c.get("code") or c["sheet"]).upper() not in {(a.get("code") or a["sheet"]).upper() for a in items_a}]:
        key = (it.get("code") or it["sheet"]).upper()
        if key in seen:
            continue
        seen.add(key)
        c = by_code.get(key)
        groups = dict(c["groups"]) if c else {}
        if "options" in it:
            groups[("all", "all")] = (it["options"], it.get("n"))
        if ("all", "all") not in groups:
            continue
        vid = f"{sid}::{re.sub(r'[^A-Za-z0-9_.]', '_', key)[:60]}"
        opts = [l for l, _ in groups[("all", "all")][0]]
        if max(v for _, v in groups[("all", "all")][0]) >= 99:
            continue  # εκφυλισμένη (π.χ. χώρα πεδίου = 100% Ελλάδα)
        con.execute("INSERT OR REPLACE INTO variables VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (vid, sid, None, key, it["question"][:300], it["question"][:2000], json.dumps(opts, ensure_ascii=False), None,
                     groups[("all", "all")][1], None, "percent_multi" if it.get("multi") else "percent", "question",
                     json.dumps(classify(it["question"]), ensure_ascii=False)))
        for (dim, gval), (os_, n) in groups.items():
            for lab, v in os_:
                con.execute("INSERT INTO distributions (study_id,var_id,wave_year,group_dim,group_value,option_code,option_label,value,unit,n,weighted,flag,note) "
                            "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                            (sid, vid, year, dim, gval, None, lab, v, "percent", n, 1, "multi" if it.get("multi") else None,
                             "proxy: ηλικία ολοκλήρωσης εκπαίδευσης" if dim == "education_end_proxy" else None))
        nvar += 1
    return nvar


def process(con, sid, rid, with_c=True):
    st = con.execute("SELECT * FROM studies WHERE study_id=?", (sid,)).fetchone()
    meta = json.loads(st["raw_meta"] or "{}")
    dists = meta.get("distributions", [])
    base = os.path.join(db.LAKE, "raw", SRC, re.sub(r"[^\w.\-]", "_", rid))
    os.makedirs(base, exist_ok=True)
    a_files, c_files = [], []
    for d in list(_pick(dists, VOL_A))[:2]:
        name = re.sub(r"[^\w.\-]", "_", (d["title"] or "volA").replace("Link to ", ""))[-120:]
        if not name.lower().endswith(TABULAR):
            name += ".xlsx" if (d.get("format") or "").upper() == "XLSX" else ".zip"
        p = os.path.join(base, name)
        sha, size = net.download(d["url"], p, max_bytes=MAX_VOLC)
        _save_file(con, sid, d["url"], name, p, sha, size, "volume_A")
        if p.lower().endswith(".zip"):
            a_files += _extract_members(p, lambda n: True)
        else:
            a_files.append(p)
    if with_c:
        for d in list(_pick(dists, VOL_C)):
            t = (d["title"] or "")
            m = re.search(r"C_([A-Z]{2})-([A-Z]{2})", t)
            if m and not (m.group(1) <= "EL" <= m.group(2)):
                continue  # διαχωρισμένα zip (π.χ. AL-IT / LT-XK): μόνο αυτό που περιέχει EL
            name = re.sub(r"[^\w.\-]", "_", t.replace("Link to ", ""))[-120:]
            if not name.lower().endswith(TABULAR):
                name += ".zip"
            p = os.path.join(base, name)
            try:
                sha, size = net.download(d["url"], p, max_bytes=MAX_VOLC)
            except net.HttpError as e:
                _save_file(con, sid, d["url"], name, None, None, None, "volume_C", "FAILED", str(e)[:300])
                continue
            _save_file(con, sid, d["url"], name, p, sha, size, "volume_C")
            if p.lower().endswith(".zip"):
                c_files += _extract_members(p, _is_greek_member)
                os.remove(p)  # κρατάμε μόνο το ελληνικό αρχείο (sha256 του zip στο files)
            elif _is_greek_member(p):
                c_files.append(p)
    if not a_files and not c_files:
        db.upsert_study(con, study_id=sid, evidence_level="C")
        db.set_status(con, sid, "VERIFIED", "Δεν βρέθηκαν μηχαναγνώσιμοι πίνακες Volume A/C (μόνο PDF/άλλη μορφή)")
        return "no_tables"
    db.set_status(con, sid, "DOWNLOADED")
    items_a, items_c, years = [], [], None
    for f in a_files:
        try:
            years = years or _fieldwork_year(f)
            items_a += parse_volume_a(f)
        except Exception as e:  # noqa: BLE001
            db.log(con, "parse", f"{os.path.basename(f)}: {e}", ok=False, source_id=SRC, study_id=sid)
    for f in c_files:
        try:
            years = years or _fieldwork_year(f)
            items_c += parse_volume_c(f)
        except Exception as e:  # noqa: BLE001
            db.log(con, "parse", f"{os.path.basename(f)}: {e}", ok=False, source_id=SRC, study_id=sid)
    if years:
        y0, y1 = years
    else:  # εκτίμηση από κύμα/αριθμό, με άνω όριο το έτος δημοσίευσης (για καταχωρίσεις μετά το 2016)
        y0, y1 = st["collection_year_start"], st["collection_year_end"]
        iy = int((meta.get("issued") or "0")[:4] or 0)
        if iy >= 2016:
            y0, y1 = (min(y0, iy) if y0 else iy), (min(y1, iy) if y1 else iy)
    if not items_a and not items_c:
        db.upsert_study(con, study_id=sid, evidence_level="C", collection_year_start=y0, collection_year_end=y1)
        db.set_status(con, sid, "VERIFIED", "Πίνακες κατέβηκαν αλλά δεν εντοπίστηκε στήλη Ελλάδας (EL/GR) σε αναγνώσιμη μορφή")
        return "no_greek_column"
    nvar = _write_items(con, sid, y1, items_a, items_c)
    n = next((it["n"] for it in items_a + items_c if it.get("n")), None)
    qtexts = " ".join(it["question"] for it in (items_a + items_c)[:60])
    in_period = y1 is not None and 2012 <= y1 <= 2026
    b2b_q = sum(1 for it in items_a + items_c if re.search(r"(?i)your (company|enterprise|business|firm|organisation)|employees in your", it["question"]))
    business = (any(it.get("business") for it in items_c) or bool(re.search(r"(?i)\bSMEs?\b|companies|enterprises|businesses|retailers", st["title"] or ""))
                or b2b_q >= max(2, 0.3 * len(items_a + items_c)))
    db.upsert_study(
        con, study_id=sid, collection_year_start=y0, collection_year_end=y1, sample_size=n,
        fieldwork_dates=str(y0) if y0 == y1 else f"{y0}–{y1}", topics=classify(st["title"], qtexts),
        age_groups=sorted({k[1] for it in items_c for k in it["groups"] if k[0] == "age_band"}),
        sex_categories=["male", "female"] if items_c and not business else None,
        target_population="Επιχειρήσεις (B2B δείγμα)" if business else None,
        representativeness="business_sample" if business else "national_probability", weight_vars=["Σταθμισμένα αποτελέσματα (VOL weighted)"],
        geographic_coverage="Ελλάδα (εθνικό δείγμα" + ("· και ανά περιφέρεια NUTS2)" if any(k[0] == "region" for it in items_c for k in it["groups"]) else ")"),
        quality_score=quality_score("B", n, "national_probability", True, True, (2026 - y1) if y1 else None),
        status="VALIDATED" if in_period else "PARSED",
        status_reason=(f"{nvar} ερωτήσεις με ελληνικά αποτελέσματα" + (f", διασπάσεις φύλου/ηλικίας/εκπαίδευσης για {len(items_c)}" if items_c else "")
                       + ("" if in_period else f" — εκτός περιόδου 2012–2026 (έτος {y1})")
                       + (" · έτος πεδίου εκτιμημένο από τον αριθμό/κύμα της έρευνας" if not years else "")),
    )
    return "ok"


def run_c(con, max_tasks=None):
    """2η φάση: Volume C (zip ~20–40MB/έρευνα) → διασπάσεις φύλου/ηλικίας/εκπαίδευσης/περιφέρειας για την Ελλάδα."""
    return run(con, max_tasks, kind="eb_volc")


def run(con, max_tasks=None, kind="eb_fetch"):
    done = 0
    while True:
        tasks = db.next_tasks(con, kind, 20)
        if not tasks:
            break
        for t in tasks:
            p = json.loads(t["payload"])
            sid = t["task_id"].split("#")[0]
            try:
                res = process(con, sid, p["id"], with_c=(kind == "eb_volc"))
                db.task_done(con, t["task_id"])
                st = con.execute("SELECT collection_year_end, raw_meta, status FROM studies WHERE study_id=?", (sid,)).fetchone()
                if kind == "eb_fetch" and st and (st["collection_year_end"] or 0) >= 2012 and st["status"] in ("VALIDATED", "PARSED") \
                        and list(_pick(json.loads(st["raw_meta"] or "{}").get("distributions", []), VOL_C)):
                    db.enqueue(con, sid + "#C", "eb_volc", p)
                db.log(con, "fetch", f"{p['id']}: {res}", source_id=SRC, study_id=sid)
            except net.HttpError as e:
                if e.status in (404, 410, 403):
                    if kind == "eb_fetch":
                        db.upsert_study(con, study_id=sid, status="FAILED", status_reason=f"HTTP {e.status} στη λήψη πινάκων")
                    db.task_done(con, t["task_id"], "failed", str(e))
                else:
                    db.task_done(con, t["task_id"], "retry", str(e))
                db.log(con, "fetch", str(e), ok=False, source_id=SRC, study_id=sid)
            except Exception as e:  # noqa: BLE001
                db.task_done(con, t["task_id"], "retry", repr(e))
                db.log(con, "fetch", repr(e)[:500], ok=False, source_id=SRC, study_id=sid)
            con.commit()
            done += 1
            if done % 10 == 0:
                print(f"  eurobarometer {kind}: {done} εργασίες", flush=True)
            if max_tasks and done >= max_tasks:
                return done
    return done
