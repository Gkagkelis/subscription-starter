"""Αποτελέσματα εκλογών από άρθρα Wikipedia (en/el) + ParlGov (έλεγχος).

Χρήση: python3 -I parse_results.py <raw_political_dir> <party_map_source.csv> <tidy_dir>

Έξοδοι: election_results.csv, turnout.csv, election_results_crosscheck_parlgov.csv
"""

import csv
import json
import os
import re
import sys
from collections import defaultdict

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup  # noqa: E402
from parse_polls import ELECTIONS, find_context, header_rows, nl  # noqa: E402,F401
from wikitables import PartyMap, cell_text, norm_label, parse_int, parse_pct, table_grid  # noqa: E402

RES_COLS = ["election_id", "date", "type", "level", "unit_code", "unit_name", "unit_name_el", "party_key", "party_label",
            "votes", "pct_valid", "seats", "source", "source_revid", "source_url", "notes"]
TURN_COLS = ["election_id", "date", "type", "level", "unit_code", "unit_name", "registered", "voters",
             "valid", "blank_invalid", "blank", "invalid", "turnout_pct", "source", "source_revid", "source_url"]

ETYPE = {"parl": "parliament", "ep": "european", "ref": "referendum"}


def eid_meta(eid):
    m = re.match(r"GR_(parl|ep|ref)_(\d{4}-\d{2}-\d{2})", eid)
    return (ETYPE[m.group(1)], m.group(2)) if m else (None, None)


SPECIAL = [
    ("valid", r"^valid|^εγκυρ|^total valid"),
    ("blank_invalid", r"invalid.*blank|blank.*invalid|ακυρ.*λευκ|λευκ.*ακυρ|^invalid/blank"),
    ("invalid", r"^invalid|^ακυρ|^null"),
    ("blank", r"^blank|^λευκ"),
    ("voters", r"^total votes|^votes cast|^ψηφισαν|^total$|^συνολο ψηφισαντ|^σύνολο|^turnout$"),
    ("registered", r"registered|εγγεγραμμ|electorate|^εκλογεις|^eligible"),
    ("total", r"^total|^συνολο"),
    ("source", r"^source|^πηγη"),
]


def special_kind(label):
    l = nl(label).strip()
    for k, pat in SPECIAL:
        if re.search(pat, l):
            return k
    return None


def find_label_col(hdr_labels):
    for j, l in enumerate(hdr_labels):
        if re.search(r"party|κομμα|choice|επιλογ|list|alliance|συνδυασμ|option|ψηφοδελτ", nl(l)):
            return j
    return None


def parse_national(grid, hdr, pmap, year):
    """Πίνακας Party|Votes|%|Seats -> (rows, turnout dict)."""
    ncols = max(len(r) for r in grid)
    labs = []
    for j in range(ncols):
        parts = []
        for r in hdr:
            if j < len(r):
                t = cell_text(r[j])
                if t and t not in parts:
                    parts.append(t)
        labs.append(" ".join(parts))
    lc = find_label_col(labs)
    vc = next((j for j, l in enumerate(labs) if re.fullmatch(r"(votes|ψηφοι|ψηφοι ?#?|αριθμος ψηφων|ψηφοι \(#\))", nl(l).strip())), None)
    if vc is None:
        vc = next((j for j, l in enumerate(labs) if re.search(r"\bvotes\b|ψηφοι", nl(l)) and "%" not in l), None)
    pc = next((j for j, l in enumerate(labs) if l.strip() in ("%", "% ψήφων", "Ποσοστό", "%ψήφων") or re.fullmatch(r"(%|ποσοστο|ποσοστο %|% ψηφων)", nl(l).strip())), None)
    sc = next((j for j, l in enumerate(labs) if re.fullmatch(r"(seats|εδρες|εδρεσ|seats won|εδρες \(#\))", nl(l).strip().replace("ς", "σ")) or nl(l).strip() in ("seats", "εδρεσ")), None)
    if lc is None or vc is None or pc is None:
        return None, None
    out, turn = [], {}
    for r in grid[len(hdr):]:
        if not r or all(c["tag"] == "th" and not cell_text(c) for c in r):
            continue
        # ετικέτα: το πρώτο μη κενό κελί στη στήλη ετικέτας ή στις προηγούμενες (χρωματικό κελί)
        lab_cell = None
        for j in range(lc, -1, -1):
            if j < len(r) and cell_text(r[j]):
                lab_cell = r[j]
                break
        if lab_cell is None and lc + 1 < len(r):
            lab_cell = r[lc + 1] if cell_text(r[lc + 1]) else None
        if lab_cell is None:
            continue
        label = cell_text(lab_cell)
        votes = parse_int(cell_text(r[vc])) if vc < len(r) else None
        pct = parse_pct(cell_text(r[pc]).replace("%", "")) if pc < len(r) else None
        seats = None
        if sc is not None and sc < len(r):
            st = cell_text(r[sc])
            if re.fullmatch(r"\d{1,3}", st.split(" ")[0] if st else ""):
                seats = int(st.split(" ")[0])
        sk = special_kind(label)
        if sk:
            if sk == "source":
                continue
            if sk == "total":
                turn.setdefault("valid_total_row", votes)
                continue
            if votes is not None:
                turn[sk] = votes
            if sk == "voters" and pct is not None:
                turn["turnout_pct"] = pct
            if sk == "registered":
                # "Registered voters/turnout" -> % στο ίδιο κελί
                if pct is not None:
                    turn["turnout_pct"] = pct
            continue
        if votes is None and pct is None:
            continue
        link = lab_cell["links"][0] if lab_cell["links"] else ""
        key, _ = pmap.key_for([link, label], year)
        out.append(dict(party_key=key, party_label=label, votes=votes, pct_valid=pct, seats=seats))
    if len(out) < 2:
        return None, None
    return out, turn


def parse_units(grid, hdr, pmap, year):
    """Πίνακες ανά περιφέρεια/εκλ. περιφέρεια: πρώτη στήλη μονάδα, ομάδες ανά κόμμα (%, ±, S)."""
    if len(hdr) < 1:
        return None, None
    first = nl(cell_text(hdr[0][0])) if hdr[0] else ""
    if re.search(r"constituenc|εκλογικη περιφερ|νομος|νομοσ|prefecture", first):
        level = "constituency"
    elif re.search(r"region|περιφερεια|^περιφ", first):
        level = "region"
    elif re.search(r"municipal|δημος|δημοσ", first):
        level = "municipality"
    else:
        return None, None
    ncols = max(len(r) for r in grid)
    top = hdr[0]
    sub = hdr[1] if len(hdr) > 1 else None
    cols = []  # (j, party_label, link, kind)
    for j in range(1, ncols):
        if j >= len(top):
            continue
        plab = cell_text(top[j])
        plinks = top[j]["links"]
        kind = "pct"
        if sub is not None and j < len(sub):
            s = cell_text(sub[j]).strip()
            if s in ("%",):
                kind = "pct"
            elif s in ("S", "Seats", "Έδρες", "Ε", "Έ"):
                kind = "seats"
            elif s in ("Votes", "Ψήφοι", "#"):
                kind = "votes"
            elif s in ("±", "+/–", "+/-", "Δ"):
                kind = "delta"
            else:
                kind = "pct" if not s else "other"
        if re.search(r"turnout|συμμετοχ|lead|προβαδ|total|συνολ|seats|εδρ|διαφορ|differen|margin", nl(plab)) and not re.search(r"%", plab):
            kind = "meta:" + plab
        cols.append((j, plab, plinks[0] if plinks else "", kind))
    out = []
    for r in grid[len(hdr):]:
        if not r or not cell_text(r[0]):
            continue
        unit = cell_text(r[0])
        if re.search(r"^total|^συνολο|^greece$|^ελλαδα|^επικρατεια", nl(unit)):
            continue
        rec = defaultdict(dict)
        for j, plab, link, kind in cols:
            if j >= len(r) or kind in ("delta", "other") or kind.startswith("meta:"):
                continue
            t = cell_text(r[j])
            if kind == "pct":
                v = parse_pct(t)
            else:
                v = parse_int(t) if re.fullmatch(r"[\d.,\s]+", t or "x") else None
            if v is None:
                continue
            rec[(plab, link)][kind] = v
        for (plab, link), d in rec.items():
            key, _ = pmap.key_for([link, re.sub(r"\[.*?\]", "", plab).strip()], year)
            out.append(dict(unit_name=unit, unit_link=(r[0]["links"][0] if r[0]["links"] else ""),
                            party_key=key, party_label=plab, votes=d.get("votes"), pct_valid=d.get("pct"),
                            seats=d.get("seats")))
    if out and level == "region" and len({r["unit_name"] for r in out}) > 20:
        level = "constituency"  # η κεφαλίδα λέει "Region" αλλά οι μονάδες είναι εκλογικές περιφέρειες
    for r in out:
        r["level"] = level
        if level == "constituency" and norm_label(r["unit_name"]) in REGION_NAMES:
            r["level"] = "region"  # γραμμές-υποσύνολα περιφέρειας μέσα σε πίνακα εκλ. περιφερειών
    return (level, out) if out else (None, None)


REGION_NAMES = {norm_label(x) for x in [
    "C. Greece", "Central Greece", "C. Macedonia", "Central Macedonia", "Crete", "E. Macedonia",
    "East Macedonia and Thrace", "Eastern Macedonia and Thrace", "E. Macedonia and Thrace", "Epirus", "Ionian",
    "Ionian Islands", "N. Aegean", "North Aegean", "Peloponnese", "S. Aegean", "South Aegean", "Thessaly",
    "W. Greece", "West Greece", "Western Greece", "W. Macedonia", "West Macedonia", "Western Macedonia"]}


def wiki_results(raw, pmap):
    man = json.load(open(os.path.join(raw, "elections", "manifest.json"), encoding="utf-8"))
    res, turns = [], []
    for it in man["files"]:
        if not it["file"].startswith("wikipedia/"):
            continue
        eid = it.get("election_context", "")
        etype, edate = eid_meta(eid)
        if not etype:
            continue
        year = int(edate[:4])
        d = json.load(open(os.path.join(raw, "elections", it["file"]), encoding="utf-8"))["parse"]
        soup = BeautifulSoup(d["text"], "lxml")
        src = f"wikipedia:{it['wiki']}"
        got_nat = False
        for ti, (tbl, hpath, cap, _intro) in enumerate(find_context(soup)):
            if re.search(r"opinion poll|δημοσκοπ|exit poll", nl(hpath)):
                continue
            grid = table_grid(tbl)
            # οι πίνακες αποτελεσμάτων έχουν συχνά τίτλο σε 1η γραμμή th colspan
            hdr = header_rows(grid)
            if hdr and len({c["id"] for c in hdr[0]}) == 1 and len(hdr) > 1:
                hdr2 = hdr[1:]
                grid2 = grid[1:]
            else:
                hdr2, grid2 = hdr, grid
            if not hdr2:
                continue
            base = dict(election_id=eid, date=edate, type=etype, source=src, source_revid=it.get("revid"),
                        source_url=it.get("page_url"))
            if not got_nat:
                rows, turn = parse_national(grid2, hdr2, pmap, year)
                if rows:
                    got_nat = True
                    for r in rows:
                        res.append(dict(base, level="national", unit_code="GR", unit_name="Ελλάδα", **r,
                                        notes=f"table={ti}"))
                    if turn:
                        bi = turn.get("blank_invalid")
                        if bi is None and (turn.get("blank") is not None or turn.get("invalid") is not None):
                            bi = (turn.get("blank") or 0) + (turn.get("invalid") or 0)
                        tp = turn.get("turnout_pct")
                        if tp is None and turn.get("voters") and turn.get("registered"):
                            tp = round(100 * turn["voters"] / turn["registered"], 2)
                        turns.append(dict(base, level="national", unit_code="GR", unit_name="Ελλάδα",
                                          registered=turn.get("registered"), voters=turn.get("voters"),
                                          valid=turn.get("valid") or turn.get("valid_total_row"),
                                          blank_invalid=bi, blank=turn.get("blank"), invalid=turn.get("invalid"),
                                          turnout_pct=tp))
                    continue
            level, urows = parse_units(grid2, hdr2, pmap, year)
            if urows:
                for r in urows:
                    link = r.pop("unit_link")
                    lv = r.pop("level")
                    r["unit_name"] = canon_unit(r["unit_name"], lv)
                    res.append(dict(base, level=lv, unit_code=f"{lv[:3].upper()}-{norm_label(r['unit_name'])}", **r,
                                    notes=f"table={ti};section={hpath[:60]};unit_link={link}"))
    return res, turns


CONST_EL_EN = {
    "Αιτωλοακαρνανίας": "Aetolia-Akarnania", "Αργολίδας": "Argolida", "Αρκαδίας": "Arkadia", "Άρτας": "Arta",
    "Α΄ Αθηνών": "Athens A", "Β΄ Αθηνών": "Athens B", "Βόρειου Τομέα Αθηνών": "Athens B1 (North)",
    "Δυτικού Τομέα Αθηνών": "Athens B2 (West)", "Νότιου Τομέα Αθηνών": "Athens B3 (South)",
    "Αττικής": "Attica", "Ανατολικής Αττικής": "East Attica", "Δυτικής Αττικής": "West Attica",
    "Α΄ Πειραιώς": "Piraeus A", "Β΄ Πειραιώς": "Piraeus B", "Αχαΐας": "Achaea", "Βοιωτίας": "Boeotia",
    "Γρεβενών": "Grevena", "Δράμας": "Drama", "Δωδεκανήσου": "Dodecanese", "Έβρου": "Evros", "Ευβοίας": "Euboea",
    "Ευρυτανίας": "Evrytania", "Ζακύνθου": "Zakynthos", "Ηλείας": "Elis", "Ημαθίας": "Imathia",
    "Ηρακλείου": "Heraklion", "Θεσπρωτίας": "Thesprotia", "Α΄ Θεσσαλονίκης": "Thessaloniki A",
    "Β΄ Θεσσαλονίκης": "Thessaloniki B", "Ιωαννίνων": "Ioannina", "Καβάλας": "Kavala", "Καρδίτσας": "Karditsa",
    "Καστοριάς": "Kastoria", "Κέρκυρας": "Corfu", "Κεφαλληνίας": "Cephalonia", "Κιλκίς": "Kilkis",
    "Κοζάνης": "Kozani", "Κορινθίας": "Corinthia", "Κυκλάδων": "Cyclades", "Λακωνίας": "Laconia",
    "Λάρισας": "Larissa", "Λασιθίου": "Lasithi", "Λέσβου": "Lesvos", "Λευκάδας": "Lefkada", "Μαγνησίας": "Magnesia",
    "Μεσσηνίας": "Messenia", "Ξάνθης": "Xanthi", "Πέλλας": "Pella", "Πιερίας": "Pieria", "Πρέβεζας": "Preveza",
    "Ρεθύμνου": "Rethymno", "Ροδόπης": "Rhodope", "Σάμου": "Samos", "Σερρών": "Serres", "Τρικάλων": "Trikala",
    "Φθιώτιδας": "Phthiotis", "Φλώρινας": "Florina", "Φωκίδας": "Phocis", "Χαλκιδικής": "Chalkidiki",
    "Χανίων": "Chania", "Χίου": "Chios", "Επικρατείας": "State list",
}
CONST_EL_EN_N = {re.sub(r"[΄ʹ'’`´]", "", k): v for k, v in CONST_EL_EN.items()}
EN_ALIASES = {"athensb1": "Athens B1 (North)", "athensbnorth": "Athens B1 (North)", "athensnorth": "Athens B1 (North)",
              "athensb2": "Athens B2 (West)", "athensbwest": "Athens B2 (West)", "athenswest": "Athens B2 (West)",
              "athensb3": "Athens B3 (South)", "athensbsouth": "Athens B3 (South)", "athenssouth": "Athens B3 (South)",
              "eastattica": "East Attica", "westattica": "West Attica", "attica": "Attica", "naxos": "Cyclades",
              "argolis": "Argolida", "arcadia": "Arkadia", "kefalonia": "Cephalonia", "kerkyra": "Corfu",
              "ilia": "Elis", "evia": "Euboea", "fthiotida": "Phthiotis", "fokida": "Phocis", "lakonia": "Laconia",
              "larisa": "Larissa", "achaia": "Achaea", "aitoliaakarnania": "Aetolia-Akarnania", "rodopi": "Rhodope",
              "magnisia": "Magnesia", "messinia": "Messenia", "lesbos": "Lesvos", "chalcidice": "Chalkidiki",
              "halkidiki": "Chalkidiki", "dodecanese": "Dodecanese", "dodekanisa": "Dodecanese"}


REGION_CANON = {norm_label(a): b for a, b in [
    ("C. Greece", "Central Greece"), ("Central Greece", "Central Greece"), ("C. Macedonia", "Central Macedonia"),
    ("Central Macedonia", "Central Macedonia"), ("E. Macedonia", "East Macedonia and Thrace"),
    ("E. Macedonia and Thrace", "East Macedonia and Thrace"), ("Eastern Macedonia and Thrace", "East Macedonia and Thrace"),
    ("East Macedonia and Thrace", "East Macedonia and Thrace"), ("N. Aegean", "North Aegean"),
    ("North Aegean", "North Aegean"), ("S. Aegean", "South Aegean"), ("South Aegean", "South Aegean"),
    ("W. Greece", "West Greece"), ("Western Greece", "West Greece"), ("West Greece", "West Greece"),
    ("W. Macedonia", "West Macedonia"), ("Western Macedonia", "West Macedonia"), ("West Macedonia", "West Macedonia"),
    ("Ionian", "Ionian Islands"), ("Ionian Islands", "Ionian Islands"), ("Crete", "Crete"), ("Epirus", "Epirus"),
    ("Peloponnese", "Peloponnese"), ("Thessaly", "Thessaly"), ("Attica", "Attica"),
    ("Αττική", "Attica"), ("Κεντρική Μακεδονία", "Central Macedonia"), ("Ανατολική Μακεδονία και Θράκη", "East Macedonia and Thrace"),
    ("Δυτική Μακεδονία", "West Macedonia"), ("Ήπειρος", "Epirus"), ("Θεσσαλία", "Thessaly"), ("Ιόνια Νησιά", "Ionian Islands"),
    ("Δυτική Ελλάδα", "West Greece"), ("Στερεά Ελλάδα", "Central Greece"), ("Πελοπόννησος", "Peloponnese"),
    ("Βόρειο Αιγαίο", "North Aegean"), ("Νότιο Αιγαίο", "South Aegean"), ("Κρήτη", "Crete")]}


def canon_unit(name, level=None):
    n = re.sub(r"\s*\(constituency\)|\s*\(region\)|\s*\(περιφέρεια\)", "", name or "").strip()
    k = norm_label(n)
    if level == "region" and k in REGION_CANON:
        return REGION_CANON[k]
    if k in EN_ALIASES:
        return EN_ALIASES[k]
    return n


CELL_RE = re.compile(r"^(.*?)\s+(\d{1,3}(?:\.\d{3})*|\d+)\s*[–\-]\s*(\d{1,2}(?:[.,]\d+)?)\s*%\s*(?:\((\d+)\))?")


def constituency_pages(raw, pmap):
    man = json.load(open(os.path.join(raw, "elections", "manifest.json"), encoding="utf-8"))
    out = []
    month_hint = [(r"μαι|μαΐ|μαϊ|may", 5), (r"ιουν|jun", 6), (r"ιαν|jan", 1), (r"σεπτ|sep", 9)]
    for it in man["files"]:
        if not it["file"].startswith("wikipedia_constituencies/"):
            continue
        d = json.load(open(os.path.join(raw, "elections", it["file"]), encoding="utf-8"))["parse"]
        name_el = d["title"].replace("Εκλογική περιφέρεια ", "")
        unit_en = CONST_EL_EN_N.get(re.sub(r"[΄ʹ'’`´]", "", name_el))
        if not unit_en or unit_en == "State list":
            continue
        soup = BeautifulSoup(d["text"], "lxml")
        for tbl in soup.select("table.wikitable"):
            grid = table_grid(tbl)
            hi = next((i for i, r in enumerate(grid) if r and nl(cell_text(r[0])).strip() in ("ετοσ", "ετος")), None)
            if hi is None:
                continue
            title = nl(" ".join(cell_text(c) for r in grid[:hi] for c in r[:1]) + " " + " ".join(
                x.get_text(" ") for x in tbl.find_all_previous(["h2", "h3"], limit=1)))
            etype = "european" if "ευρωεκλογ" in title else "parliament"
            pref = "GR_ep_" if etype == "european" else "GR_parl_"
            rows = grid[hi + 1:]
            years_seen = defaultdict(int)
            for r in rows:
                ytxt = cell_text(r[0]) if r else ""
                y = re.search(r"(19|20)\d{2}", ytxt)
                if not y or int(y.group(0)) < 2000:
                    continue
                y = int(y.group(0))
                cands = [(k, dt) for k, dt in ELECTIONS if k.startswith(pref) and dt.year == y]
                if not cands:
                    continue
                if len(cands) > 1:
                    mh = next((m for pat, m in month_hint if re.search(pat, nl(ytxt))), None)
                    if mh:
                        sel = [c for c in cands if c[1].month == mh]
                        cands = sel or cands
                    if len(cands) > 1:
                        idx = years_seen[y]
                        cands = [sorted(cands, key=lambda c: c[1])[min(idx, len(cands) - 1)]]
                years_seen[y] += 1
                eid, edt = cands[0]
                seen_ids = set()
                for c in r[1:]:
                    if c["id"] in seen_ids:
                        continue
                    seen_ids.add(c["id"])
                    t = cell_text(c)
                    m = CELL_RE.match(t)
                    if not m:
                        continue
                    lab = m.group(1).strip()
                    link = c["links"][0] if c["links"] else ""
                    key, _ = pmap.key_for([link, lab], y)
                    out.append(dict(election_id=eid, date=edt.isoformat(), type=etype, level="constituency",
                                    unit_code="CON-" + norm_label(unit_en), unit_name=unit_en, unit_name_el=name_el,
                                    party_key=key, party_label=lab, votes=int(m.group(2).replace(".", "")),
                                    pct_valid=float(m.group(3).replace(",", ".")),
                                    seats=int(m.group(4)) if m.group(4) else None, source="wikipedia:el-constituency-page",
                                    source_revid=it.get("revid"), source_url=it.get("page_url"),
                                    notes="top-5 parties only (el constituency page)"))
    return out


def parlgov(raw, pmap):
    p = os.path.join(raw, "elections", "parlgov", "view_election.csv")
    if not os.path.exists(p):
        return []
    out = []
    with open(p, encoding="utf-8") as f:
        for r in csv.DictReader(f):
            if r.get("country_name_short") != "GRC":
                continue
            if r.get("election_date", "") < "2000-01-01":
                continue
            et = {"parliament": "parliament", "ep": "european"}.get(r.get("election_type"))
            if not et:
                continue
            pref = "parl" if et == "parliament" else "ep"
            eid = f"GR_{pref}_{r['election_date']}"
            key, _ = pmap.key_for([r.get("party_name_english"), r.get("party_name_short"), r.get("party_name")],
                                  int(r["election_date"][:4]))
            out.append(dict(election_id=eid, date=r["election_date"], type=et, party_key=key,
                            party_label=r.get("party_name_english") or r.get("party_name_short"),
                            parlgov_party_id=r.get("party_id"), parlgov_vote_share=r.get("vote_share"),
                            parlgov_seats=r.get("seats"), parlgov_seats_total=r.get("seats_total")))
    return out


def main():
    raw, pm_path, tidy = sys.argv[1:4]
    pmap = PartyMap(pm_path)
    res, turns = wiki_results(raw, pmap)
    # προτίμηση: en για εθνικό επίπεδο· el μόνο αν λείπει το en
    by_e_level = defaultdict(set)
    for r in res:
        by_e_level[(r["election_id"], r["level"])].add(r["source"])
    keep = []
    for r in res:
        srcs = by_e_level[(r["election_id"], r["level"])]
        if r["level"] == "national" and len(srcs) > 1 and r["source"] != "wikipedia:en":
            continue
        keep.append(r)
    # διπλότυπα μονάδων από en+el: κρατάμε en αν υπάρχουν και τα δύο
    seen_units = defaultdict(set)
    for r in keep:
        seen_units[(r["election_id"], r["level"], r["source"])].add(r["unit_name"])
    final = []
    for r in keep:
        if r["level"] != "national":
            srcs = {s for (e, l, s) in seen_units if e == r["election_id"] and l == r["level"]}
            if len(srcs) > 1 and r["source"] != "wikipedia:en":
                continue
        final.append(r)
    covered = {(r["election_id"], r["unit_code"]) for r in final if r["level"] == "constituency"}
    cp = constituency_pages(raw, pmap)
    added = 0
    for r in cp:
        if (r["election_id"], r["unit_code"]) in covered:
            continue
        final.append(r)
        added += 1
    print(f"constituency-page rows parsed={len(cp)} added={added}")
    tsel = []
    tsrc = defaultdict(set)
    for t in turns:
        tsrc[t["election_id"]].add(t["source"])
    for t in turns:
        if len(tsrc[t["election_id"]]) > 1 and t["source"] != "wikipedia:en":
            # κρατάμε και el μόνο αν το en δεν έχει εγγεγραμμένους
            en = [x for x in turns if x["election_id"] == t["election_id"] and x["source"] == "wikipedia:en"]
            if en and en[0].get("registered"):
                continue
        tsel.append(t)
    seen_k = set()
    dedup = []
    for r in final:
        k = (r["election_id"], r["level"], r["unit_code"], r["party_key"], r["party_label"])
        if k in seen_k:
            continue
        seen_k.add(k)
        dedup.append(r)
    final = dedup
    final.sort(key=lambda r: (r["date"], ["national", "region", "constituency", "municipality"].index(r["level"]),
                              r["unit_name"], -(r["pct_valid"] or 0)))
    with open(os.path.join(tidy, "election_results.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=RES_COLS)
        w.writeheader()
        for r in final:
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in RES_COLS})
    with open(os.path.join(tidy, "turnout.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=TURN_COLS)
        w.writeheader()
        for r in sorted(tsel, key=lambda x: (x["date"], x["source"])):
            w.writerow({k: ("" if r.get(k) is None else r.get(k)) for k in TURN_COLS})
    # cross-check με ParlGov
    pg = parlgov(raw, pmap)
    nat = {(r["election_id"], r["party_key"]): r for r in final if r["level"] == "national"}
    cc_cols = ["election_id", "date", "type", "party_key", "party_label", "parlgov_party_id", "parlgov_vote_share",
               "parlgov_seats", "wiki_pct_valid", "wiki_seats", "abs_diff_pct"]
    with open(os.path.join(tidy, "election_results_crosscheck_parlgov.csv"), "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=cc_cols)
        w.writeheader()
        for r in pg:
            wv = nat.get((r["election_id"], r["party_key"]))
            diff = ""
            if wv and wv.get("pct_valid") is not None and r["parlgov_vote_share"]:
                try:
                    diff = round(abs(float(r["parlgov_vote_share"]) - float(wv["pct_valid"])), 2)
                except ValueError:
                    diff = ""
            w.writerow({**{k: r.get(k, "") for k in cc_cols}, "wiki_pct_valid": wv.get("pct_valid") if wv else "",
                        "wiki_seats": wv.get("seats") if wv else "", "abs_diff_pct": diff})
    print(f"results={len(final)} turnout={len(tsel)} parlgov={len(pg)}")
    cov = defaultdict(lambda: defaultdict(set))
    for r in final:
        cov[r["election_id"]][r["level"]].add(r["unit_name"])
    for e in sorted(cov):
        print(e, {l: len(u) for l, u in cov[e].items()})


if __name__ == "__main__":
    main()
