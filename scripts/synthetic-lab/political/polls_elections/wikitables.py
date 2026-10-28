"""Βοηθητικά για πίνακες Wikipedia (parsed HTML): grid με rowspan/colspan,
καθαρισμός footnotes, ανάλυση ημερομηνιών/αριθμών, αντιστοίχιση κομμάτων."""

import csv
import re
import unicodedata
from datetime import date

from bs4 import BeautifulSoup, NavigableString, Tag

# ---------------------------------------------------------------- text utils

def strip_accents(s):
    return "".join(c for c in unicodedata.normalize("NFD", s) if unicodedata.category(c) != "Mn")


def norm_label(s):
    s = strip_accents(s or "").lower()
    s = s.replace("ς", "σ")
    s = re.sub(r"\[[^\]]*\]", "", s)
    s = re.sub(r"[\s\.\-–—_'’\"«»()/,:;!]+", "", s)
    return s


def clean_cell(cell):
    """Επιστρέφει (lines, links, imgs, sortval) από ένα <td>/<th> χωρίς footnotes."""
    c = BeautifulSoup(str(cell), "lxml").find(cell.name)
    for bad in c.select("sup.reference, sup.noprint, style, .sortkey, span[style*='display:none'], .mw-ref"):
        bad.decompose()
    for br in c.find_all("br"):
        br.replace_with("\n")
    # μικρό κείμενο κάτω από την τιμή (π.χ. έδρες) σε ξεχωριστή γραμμή
    for sm in c.find_all(["small"]):
        sm.insert_before("\n")
    text = c.get_text("")
    text = text.replace("\xa0", " ").replace("​", "")
    lines = [re.sub(r"\s+", " ", ln).strip() for ln in text.split("\n")]
    lines = [ln for ln in lines if ln]
    links = [a.get("title") for a in cell.find_all("a") if a.get("title")]
    imgs = [i.get("alt") for i in cell.find_all("img") if i.get("alt")]
    return lines, links, imgs, cell.get("data-sort-value")


def table_grid(table):
    """Πίνακας -> λίστα γραμμών· κάθε κελί dict. Αναπτύσσει rowspan/colspan."""
    rows = []
    pending = {}  # col -> [cellinfo, remaining]
    trs = [tr for tr in table.find_all("tr") if tr.find_parent("table") is table]
    for ri, tr in enumerate(trs):
        row = []
        cells = tr.find_all(["th", "td"], recursive=False)
        col = 0
        ci = 0

        def fill_pending():
            nonlocal col
            while col in pending:
                info, rem = pending[col]
                row.append(dict(info, spanned=True))
                if rem <= 1:
                    del pending[col]
                else:
                    pending[col] = [info, rem - 1]
                col += 1

        fill_pending()
        while ci < len(cells):
            c = cells[ci]
            ci += 1
            try:
                cs = int(re.sub(r"\D", "", c.get("colspan", "1")) or 1)
            except ValueError:
                cs = 1
            try:
                rs = int(re.sub(r"\D", "", c.get("rowspan", "1")) or 1)
            except ValueError:
                rs = 1
            cs = max(1, min(cs, 200))
            rs = max(1, min(rs, 500))
            lines, links, imgs, sv = clean_cell(c)
            info = {"tag": c.name, "lines": lines, "links": links, "imgs": imgs, "sort": sv,
                    "colspan": cs, "rowspan": rs, "id": (ri, ci), "spanned": False,
                    "style": c.get("style", "")}
            for k in range(cs):
                row.append(dict(info, spanned=k > 0))
                if rs > 1:
                    pending[col] = [info, rs - 1]
                col += 1
            fill_pending()
        # trailing pending
        while col in pending or any(k > col for k in pending):
            if col in pending:
                fill_pending()
            else:
                row.append({"tag": "td", "lines": [], "links": [], "imgs": [], "sort": None,
                            "colspan": 1, "rowspan": 1, "id": (ri, -col), "spanned": False, "style": ""})
                col += 1
        rows.append(row)
    return rows


def cell_text(c):
    return " ".join(c["lines"]).strip() if c else ""


# ---------------------------------------------------------------- numbers

NUM_RE = re.compile(r"^[<>~≈]?\s*(\d{1,3}(?:[.,]\d+)?)\s*%?$")


def parse_pct(s):
    if s is None:
        return None
    s = s.strip().replace("−", "-")
    s = re.sub(r"\[[^\]]*\]", "", s).strip()
    s = s.replace("%", "").strip()
    m = NUM_RE.match(s)
    if not m:
        return None
    v = float(m.group(1).replace(",", "."))
    if v > 100:
        return None
    return v


def parse_int(s):
    if not s:
        return None
    s = re.sub(r"\[[^\]]*\]", "", s)
    s = s.replace("\xa0", " ")
    m = re.search(r"\d[\d,.\s]*\d|\d", s)
    if not m:
        return None
    digits = re.sub(r"[^\d]", "", m.group(0))
    return int(digits) if digits else None


# ---------------------------------------------------------------- dates

MONTHS = {
    "jan": 1, "feb": 2, "mar": 3, "apr": 4, "may": 5, "jun": 6, "jul": 7, "aug": 8,
    "sep": 9, "oct": 10, "nov": 11, "dec": 12,
    "ιαν": 1, "φεβ": 2, "μαρ": 3, "απρ": 4, "μαι": 5, "μαϊ": 5, "ιουν": 6, "ιουλ": 7,
    "αυγ": 8, "σεπ": 9, "οκτ": 10, "νοε": 11, "νοεμ": 11, "δεκ": 12,
}


LAT2GR = str.maketrans("IOAEKMNPTXYZBHiokaeuv", "ΙΟΑΕΚΜΝΡΤΧΥΖΒΗιοκαευν")


def fix_mixed_script(t):
    """'Iουλ' (λατινικό I + ελληνικά) -> 'Ιουλ'."""
    def fx(m):
        w = m.group(0)
        if re.search(r"[Α-Ωα-ωάέήίόύώ]", w) and re.search(r"[A-Za-z]", w):
            return w.translate(LAT2GR)
        return w
    return re.sub(r"[A-Za-zΑ-Ωα-ωάέήίόύώϊϋΐΰΆΈΉΊΌΎΏ]+", fx, t)


def month_of(tok):
    t = strip_accents(tok.lower()).replace("ς", "σ")
    t = t.replace("ϊ", "ι")
    for k in sorted(MONTHS, key=len, reverse=True):
        kk = strip_accents(k)
        if t.startswith(kk):
            # αποφυγή "μαρ" vs "μαιου": ok
            return MONTHS[k]
    return None


def _mk(y, m, d):
    try:
        return date(y, m, d)
    except (ValueError, TypeError):
        return None


def parse_date_range(text, default_year=None, sortval=None):
    """Επιστρέφει (start, end, note). Χειρίζεται '17–23 Jan 2004', '30 Dec 2003–5 Jan 2004',
    '30 Dec–5 Jan 2004', 'Jan 2004', '23/1/2004', '1-5 Ιουλ 2019', '2004-01-23'."""
    if not text:
        return None, None, "no_date"
    t = text.replace("\xa0", " ")
    t = re.sub(r"\[[^\]]*\]", "", t)
    t = re.sub(r"\(?\b\d{1,2}[:.]\d{2}\b(?![./]\d)\s*(?:[ap]\.?m\.?|EEST|EET)?\)?", " ", t)
    t = re.sub(r"\((?:exit poll|exit|απόγευμα|βράδυ)[^)]*\)", " ", t, flags=re.I)
    t = fix_mixed_script(t)
    t = t.replace("–", "-").replace("—", "-").replace("‒", "-").replace(" to ", "-")
    t = re.sub(r"\s*-\s*", "-", t).strip()
    # ISO
    isos = re.findall(r"(\d{4})-(\d{2})-(\d{2})", t)
    if isos:
        ds = [_mk(int(a), int(b), int(c)) for a, b, c in isos]
        ds = [d for d in ds if d]
        if ds:
            return min(ds), max(ds), ""
    # 'yy-mm-dd' ή 'dd-mm-yy' (π.χ. '09-03-09', '06-09-09' σε σελίδες 2009)
    m0 = re.fullmatch(r"(\d{2})-(\d{2})-(\d{2})", t)
    if m0 and default_year:
        yy = default_year % 100
        a, b, c = int(m0.group(1)), int(m0.group(2)), int(m0.group(3))
        if a == yy:
            d0, tag = _mk(default_year, b, c) or _mk(default_year, b, 1), ("yy-mm-dd" if _mk(default_year, b, c) else "yy-mm-dd;day_invalid_set_to_1")
        elif c == yy:
            d0, tag = _mk(default_year, b, a), "dd-mm-yy"
        else:
            d0, tag = None, ""
        if d0:
            return d0, d0, tag

    # numeric d/m/y or d.m.y
    nums = re.findall(r"(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})", t)
    if nums:
        ds = []
        for d, m, y in nums:
            y = int(y)
            y = y + 2000 if y < 100 else y
            dd = _mk(y, int(m), int(d))
            if dd:
                ds.append(dd)
        # '23-24/1/2004'
        m0 = re.match(r"^(\d{1,2})-(\d{1,2})[/.](\d{1,2})[/.](\d{2,4})$", t)
        if m0:
            y = int(m0.group(4)); y = y + 2000 if y < 100 else y
            s = _mk(y, int(m0.group(3)), int(m0.group(1)))
            e = _mk(y, int(m0.group(3)), int(m0.group(2)))
            if s and e:
                return s, e, ""
        if ds:
            return min(ds), max(ds), ""
    # tokens: numbers, month words, years
    toks = re.findall(r"\d{4}|\d{1,2}|[A-Za-zΑ-Ωα-ωάέήίόύώϊϋΐΰΆΈΉΊΌΎΏ]+|-", t)
    parts = []  # list of [day, month, year]
    cur = [None, None, None]
    seen_dash = False
    for tok in toks:
        if tok == "-":
            parts.append(cur)
            cur = [None, None, None]
            seen_dash = True
            continue
        if tok.isdigit():
            if len(tok) == 4:
                cur[2] = int(tok)
            else:
                if cur[0] is None:
                    cur[0] = int(tok)
                else:
                    parts.append(cur)
                    cur = [int(tok), None, None]
        else:
            m = month_of(tok)
            if m:
                cur[1] = m
    parts.append(cur)
    parts = [p for p in parts if any(x is not None for x in p)]
    if not parts:
        return None, None, "unparsed_date"
    # propagate month/year backwards (e.g. '17-23 Jan 2004')
    for i in range(len(parts) - 2, -1, -1):
        if parts[i][1] is None:
            parts[i][1] = parts[i + 1][1]
        if parts[i][2] is None:
            parts[i][2] = parts[i + 1][2]
    note = ""
    sv_year = None
    if sortval:
        m = re.search(r"(19|20)\d{2}", sortval)
        if m:
            sv_year = int(m.group(0))
    for p in parts:
        if p[2] is None:
            p[2] = sv_year or default_year
            if p[2] is not None and not note:
                note = "year_inferred"
    s, e = parts[0], parts[-1]
    if s[1] is None or s[2] is None:
        return None, None, "unparsed_date"
    if s[2] and e[2] and s[1] and e[1] and s[2] == e[2] and s[1] > e[1] and len(parts) > 1:
        # 'Dec-Jan 2004' => αρχή στο προηγούμενο έτος
        s[2] = e[2] - 1
    sd = _mk(s[2], s[1], s[0] or 1)
    ed = _mk(e[2], e[1], e[0] or (28 if e[0] is None else 1))
    if s[0] is None and e[0] is None:
        # μόνο μήνας: όλος ο μήνας
        import calendar
        sd = _mk(s[2], s[1], 1)
        ed = _mk(e[2], e[1], calendar.monthrange(e[2], e[1])[1])
        note = (note + ";month_only").strip(";")
    if sd and ed and sd > ed:
        sd, ed = ed, sd
        note = (note + ";swapped").strip(";")
    return sd, ed, note


# ---------------------------------------------------------------- party map

def clean_label(x):
    if not x:
        return x
    x = re.sub(r"\s*\(page does not exist\)", "", x)
    x = re.sub(r"\s*\(δεν έχει γραφτεί ακόμα\)", "", x)
    x = re.sub(r"\s*\[(el|en|a|b|c|d|e|\d+)\]", "", x)
    return x.strip()


class PartyMap:
    def __init__(self, path):
        self.rows = list(csv.DictReader(open(path, encoding="utf-8")))
        self.alias = {}
        for r in self.rows:
            names = [r["party_key"], r["name_el"], r["name_en"], r["abbr"]] + (r["aliases"] or "").split("|")
            for a in names:
                if not a:
                    continue
                k = norm_label(a)
                if not k:
                    continue
                self.alias.setdefault(k, [])
                if r not in self.alias[k]:
                    self.alias[k].append(r)
        self.auto = {}

    def _pick(self, cands, year):
        if len(cands) == 1 or year is None:
            return cands[0]
        best = None
        for r in cands:
            f = int(r["active_from"]) if r["active_from"] else 1900
            t = int(r["active_to"]) if r["active_to"] else 2100
            if f <= year <= t:
                if best is None or (r["active_from"] or "0") > (best["active_from"] or "0"):
                    best = r
        return best or cands[0]

    def match(self, labels, year=None):
        """labels: λίστα υποψηφίων (link title, κείμενο, alt). Επιστρέφει row ή None."""
        labels = [clean_label(x) for x in labels]
        for lab in labels:
            if not lab:
                continue
            for variant in (lab, re.sub(r"\s*\([^)]*\)\s*$", "", lab)):
                k = norm_label(variant)
                if k in self.alias:
                    return self._pick(self.alias[k], year)
        return None

    def key_for(self, labels, year=None, auto_ok=True):
        labels = [clean_label(x) for x in labels]
        r = self.match(labels, year)
        if r:
            return r["party_key"], r
        if not auto_ok:
            return "", None
        lab = next((x for x in labels if x), "")
        if not lab:
            return "", None
        base = re.sub(r"\s*\((?:Greek )?(?:political party|Greece|party|κόμμα)[^)]*\)\s*$", "", lab)
        key = "AUTO_" + re.sub(r"[^A-Z0-9Α-Ω]+", "_", strip_accents(base).upper()).strip("_")[:40]
        if key not in self.auto:
            self.auto[key] = {"party_key": key, "entity_type": "party_auto", "lineage_key": key,
                              "name_el": "", "name_en": base, "abbr": "", "active_from": "",
                              "active_to": "", "aliases": set()}
        for x in labels:
            if x:
                self.auto[key]["aliases"].add(x)
        return key, None
