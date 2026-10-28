"""Πίνακες δημοσκοπήσεων από Wikipedia (en/el) -> long-format CSV.

Χρήση: python3 -I parse_polls.py <raw_political_dir> <party_map_source.csv> <out_csv> <auto_party_map_csv>
"""

import csv
import hashlib
import json
import os
import re
import sys
from datetime import date

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from bs4 import BeautifulSoup  # noqa: E402
from wikitables import (PartyMap, cell_text, norm_label, parse_date_range, parse_int,  # noqa: E402
                        parse_pct, strip_accents, table_grid)

ELECTIONS = [
    ("GR_parl_2000-04-09", date(2000, 4, 9)), ("GR_parl_2004-03-07", date(2004, 3, 7)),
    ("GR_parl_2007-09-16", date(2007, 9, 16)), ("GR_parl_2009-10-04", date(2009, 10, 4)),
    ("GR_parl_2012-05-06", date(2012, 5, 6)), ("GR_parl_2012-06-17", date(2012, 6, 17)),
    ("GR_parl_2015-01-25", date(2015, 1, 25)), ("GR_parl_2015-09-20", date(2015, 9, 20)),
    ("GR_parl_2019-07-07", date(2019, 7, 7)), ("GR_parl_2023-05-21", date(2023, 5, 21)),
    ("GR_parl_2023-06-25", date(2023, 6, 25)),
    ("GR_ep_1999-06-13", date(1999, 6, 13)), ("GR_ep_2004-06-13", date(2004, 6, 13)),
    ("GR_ep_2009-06-07", date(2009, 6, 7)), ("GR_ep_2014-05-25", date(2014, 5, 25)),
    ("GR_ep_2019-05-26", date(2019, 5, 26)), ("GR_ep_2024-06-09", date(2024, 6, 9)),
    ("GR_ref_2015-07-05", date(2015, 7, 5)),
]
ELECTION_BY_DATE = {d: k for k, d in ELECTIONS}

COLS = ["poll_id", "source_page", "source_wiki", "source_revid", "source_url", "election_context",
        "table_index", "table_context", "scope", "scenario", "poll_type", "pollster", "client", "fieldwork_start",
        "fieldwork_end", "date_note", "sample_size", "measure", "option", "option_link", "party_key",
        "value_pct", "value_seats", "undecided_pct", "notes"]


def nl(s):
    return strip_accents((s or "").lower())


ROLE_PATTERNS = [
    ("lead", r"^(lead|διαφορα|προβαδισμα|διαφ\.?)$|^lead\b"),
    ("date", r"date|fieldwork|ημερ|ημ/ν|διεξαγ|περιοδ|last update|ημ\.|ημνια|^dates?$"),
    ("release", r"publication|release|published|δημοσιευ"),
    ("sample", r"sample|δειγμα"),
    ("margin", r"margin|σφαλμ|^moe"),
    ("method", r"^method|μεθοδ|^type$|^τυπος"),
    ("pollster", r"poll|firm|pollster|εταιρ|πηγη|δημοσκοπ|aggregator|^source|ινστιτουτ|εταιρεια|^εταιρ"),
    ("client", r"client|commission|πελατ|αναθε|^μεσο|^media|για λογαριασμο"),
]


def col_role(label):
    l = nl(label).strip()
    if not l:
        return None
    if re.search(r"poll|firm|εταιρ|πηγη", l) and re.search(r"commission|client|πελατ|μεσο|ανα", l):
        return "pollster_client"
    for role, pat in ROLE_PATTERNS:
        if re.search(pat, l):
            return role
    return None


def classify_measure(ctx, intro=False):
    c = nl(ctx)
    if re.search(r"raw (responses|figures|data|vote)|before disregarding|ακατεργαστ|προθεση ψηφου|with undecided|including undecided|voting preferences", c):
        return "vote_intention_raw"
    if intro:
        if re.search(r"vote estimat|estimation of vote|εκτιμηση ψηφου|excluding (the )?undecided|exclude[sd]? (the )?undecided|χωρις τους αναποφασιστους|after (the )?(exclusion|redistribution)", c):
            return "vote_estimate"
        return None
    if re.search(r"seat|εδρ", c):
        return "other:seat_projection"
    if re.search(r"referendum|δημοψηφ", c):
        return "other:referendum_vote"
    if re.search(r"prime minister|πρωθυπουργ|preferred pm|καταλληλ|suitab|best pm|\bpm\b", c):
        return "pm_suitability"
    if re.search(r"leader|αρχηγ|popularit|δημοτικοτ|approval|favou?rab|θετικ.*γνωμ|γνωμη για|rating of", c):
        return "leader_preference"
    if re.search(r"government|κυβερνησ", c) and not re.search(r"vote|ψηφ", c):
        return "government_rating"
    if re.search(r"εκτιμησ|vote estimat|estimation of vote|projection|αναγωγ", c) and not re.search(r"προθεσ|intention", c):
        return "vote_estimate"
    if re.search(r"προθεσ|with undecided|including undecided|raw", c) and not re.search(r"εκτιμησ|estimat", c):
        return "vote_intention_raw"
    return None  # -> data-driven


def find_context(soup):
    """Αντιστοιχεί κάθε wikitable στη διαδρομή επικεφαλίδων πάνω από αυτήν."""
    out = []
    stack = {}
    for el in soup.find_all(["h2", "h3", "h4", "h5", "table"]):
        if el.name.startswith("h"):
            lvl = int(el.name[1])
            stack = {k: v for k, v in stack.items() if k < lvl}
            stack[lvl] = el.get_text(" ", strip=True)
            continue
        cls = el.get("class") or []
        if "wikitable" not in cls:
            continue
        if el.find_parent("table") is not None and "wikitable" in (el.find_parent("table").get("class") or []):
            continue
        cap = el.find("caption")
        path = " > ".join(stack[k] for k in sorted(stack))
        intro = []
        for prev in el.find_all_previous(["p", "h2", "h3", "h4", "table"], limit=8):
            if prev.name != "p":
                break
            intro.append(prev.get_text(" ", strip=True))
        out.append((el, path, (cap.get_text(" ", strip=True) if cap else ""), " ".join(reversed(intro))[:600]))
    return out


def header_rows(grid):
    """Αρχικές γραμμές όπου όλα τα κελιά είναι th."""
    hdr = []
    for r in grid:
        if r and all(c["tag"] == "th" for c in r):
            hdr.append(r)
        else:
            break
    return hdr


def col_labels(hdr, ncols):
    labels = []
    for j in range(ncols):
        parts = []
        links = []
        for r in hdr:
            if j < len(r):
                c = r[j]
                t = c["lines"][0] if c["lines"] else ""
                if t and t not in parts:
                    parts.append(t)
                for x in c["links"] + c["imgs"]:
                    if x not in links and not x.startswith("File:"):
                        links.append(x)
                if not t and (c["links"] or c["imgs"]):
                    lab = (c["links"] or c["imgs"])[0]
                    if lab not in parts:
                        parts.append(lab)
        labels.append((parts, links))
    return labels


def is_election_label(s):
    l = nl(s)
    return bool(re.search(r"election|εκλογ|result|αποτελεσ|referendum|δημοψηφισμ", l)) and not re.search(
        r"poll|δημοσκοπ|exit", l)


def election_date_from_label(lab):
    l = nl(lab)
    y = year_from_text(lab)
    if not y:
        return None, None, "unparsed_date"
    pref = "GR_ep_" if re.search(r"ευρω|europ", l) else ("GR_ref_" if re.search(r"referend|δημοψηφ", l) else "GR_parl_")
    cands = [(k, d) for k, d in ELECTIONS if k.startswith(pref) and d.year == y]
    if not cands:
        return None, None, "unparsed_date"
    if len(cands) > 1 and re.search(r"\bii\b|ιι|second|sep|jun|ιουν|σεπτ|β'", l):
        k, d = cands[-1]
    else:
        k, d = cands[0]
    return d, d, "election_date_from_label"


def year_from_text(s):
    m = re.search(r"\b(19|20)\d{2}\b", s or "")
    return int(m.group(0)) if m else None


def parse_page(path, meta, pmap, rows_out, tstats):
    d = json.load(open(path, encoding="utf-8"))["parse"]
    soup = BeautifulSoup(d["text"], "lxml")
    title = d["title"]
    wiki = meta["wiki"]
    revid = d.get("revid")
    page_url = meta.get("page_url")
    ectx = meta.get("election_context", "")
    ectx_date = next((dt for k, dt in ELECTIONS if k == ectx), None)
    default_year = ectx_date.year if ectx_date else None
    for ti, (tbl, hpath, cap, intro) in enumerate(find_context(soup)):
        grid = table_grid(tbl)
        if len(grid) < 2:
            continue
        hdr = header_rows(grid)
        if not hdr:
            continue
        ncols = max(len(r) for r in grid)
        labels = col_labels(hdr, ncols)
        roles = [(col_role(p[-1]) if p else None) or col_role(" ".join(p)) for p, _ in labels]
        if ("pollster" not in roles and "pollster_client" not in roles and roles and roles[0] is None
                and not labels[0][0] and ("date" in roles or "release" in roles)):
            roles[0] = "pollster_client"  # κενή κεφαλίδα 1ης στήλης (el σελίδες)
        if "pollster" not in roles and "pollster_client" not in roles:
            # el σελίδες: πρώτη στήλη "Πηγή" κ.λπ. — αλλιώς δεν είναι πίνακας δημοσκοπήσεων
            continue
        if "date" not in roles and "release" not in roles:
            continue
        opt_cols = [j for j, r in enumerate(roles) if r is None and labels[j][0]]
        if not opt_cols:
            continue
        # ομαδικές επικεφαλίδες (π.χ. "Εκτίμηση ψήφου" πάνω από κόμματα)
        group_labels = []
        if len(hdr) > 1:
            for c in hdr[0]:
                if c["colspan"] > 1 and cell_text(c):
                    group_labels.append(cell_text(c))
        ctx = " | ".join(x for x in [hpath, cap, " ".join(group_labels)] if x)
        ctx_full = ctx + (" || intro: " + intro if intro else "")
        measure_hdr = classify_measure(ctx)
        if measure_hdr is None and intro:
            measure_hdr = classify_measure(intro, intro=True)
        scenario = bool(re.search(r"scenario|σεναρι|hypothetic|υποθετ|new party|νεο κομμα|movement and", nl(ctx)))
        scope = "regional" if re.search(r"ανα νομο|νομος|regional|by region|constituenc|prefect|περιφερει|municipal", nl(ctx)) else "national"
        pc = roles.index("pollster") if "pollster" in roles else roles.index("pollster_client")
        cc = roles.index("client") if "client" in roles else None
        dc = roles.index("date") if "date" in roles else roles.index("release")
        sc = roles.index("sample") if "sample" in roles else None
        ctx_year = year_from_text(hpath.split(" > ")[-1] if hpath else "") or default_year
        seat_table = measure_hdr == "other:seat_projection"
        table_rows = []
        for ri, r in enumerate(grid[len(hdr):]):
            if not r:
                continue
            if all(c["tag"] == "th" for c in r):
                continue  # επαναλαμβανόμενη επικεφαλίδα
            first_ids = {c["id"] for c in r}
            if len(first_ids) == 1:
                # γραμμή-διαχωριστής (π.χ. έτος)
                y = year_from_text(cell_text(r[0]))
                if y:
                    ctx_year = y
                continue
            ptxt = cell_text(r[pc]) if pc < len(r) else ""
            if not ptxt:
                continue
            dtxt = cell_text(r[dc]) if dc < len(r) else ""
            dsort = r[dc]["sort"] if dc < len(r) else None
            fs, fe, dnote = parse_date_range(dtxt, ctx_year, dsort)
            if fe and "year_inferred" in dnote and ectx_date and (fe - ectx_date).days > 2:
                fe = fe.replace(year=fe.year - 1) if not (fe.month == 2 and fe.day == 29) else fe
                fs = fs.replace(year=fs.year - 1) if fs and not (fs.month == 2 and fs.day == 29) else fs
                dnote += ";year_shifted_before_election"
            if fe:
                ctx_year = fe.year if not dnote else ctx_year
            pollster, client = ptxt, ""
            if roles[pc] == "pollster_client" and "/" in ptxt:
                a, b = ptxt.split("/", 1)
                pollster, client = a.strip(), b.strip()
            if cc is not None and cc < len(r):
                client = cell_text(r[cc])
            pollster = re.sub(r"\s*Archived [^/]*? at the Wayback Machine", "", pollster)
            client = re.sub(r"\s*Archived [^/]*? at the Wayback Machine", "", client)
            pollster = re.sub(r"\s*\[\s*\w+\s*\]\s*", " ", pollster).strip()
            client = re.sub(r"\s*\[\s*\w+\s*\]\s*", " ", client).strip()
            is_elec = is_election_label(ptxt)
            notes = []
            sample = parse_int(cell_text(r[sc])) if sc is not None and sc < len(r) else None
            if sample is not None and sample < 50:
                sample = None
            if is_elec and not fe:
                fs, fe, dnote = election_date_from_label(ptxt)
            if is_elec:
                ek = ELECTION_BY_DATE.get(fe) if fe else None
                notes.append(f"election_row:{ptxt}" + (f";election_id={ek}" if ek else ""))
                pollster, client, sample = "ELECTION", "", None
            vals = []
            for j in opt_cols:
                if j >= len(r):
                    continue
                c = r[j]
                if c["spanned"] and c["colspan"] > 1:
                    # κελί που καλύπτει πολλές στήλες (π.χ. "με ΣΥΡΙΖΑ")
                    continue
                lines = c["lines"]
                txt = " ".join(lines)
                v, seats, rest = None, None, ""
                if seat_table:
                    mm = re.fullmatch(r"(\d{1,3})(?:\s*[/–\-]\s*(\d{1,3}))?.*", lines[0].strip()) if lines else None
                    if mm:
                        seats = int(mm.group(1)) if not mm.group(2) else (int(mm.group(1)) + int(mm.group(2))) / 2
                else:
                    mr = re.match(r"^(\d{1,2}(?:[.,]\d+)?)\s*%?\s*[–\-]\s*(\d{1,2}(?:[.,]\d+)?)\s*%?(?:\s+(.*))?$", txt.strip())
                    if mr:
                        a, b = float(mr.group(1).replace(",", ".")), float(mr.group(2).replace(",", "."))
                        v = round((a + b) / 2, 2)
                        rest = mr.group(3) or ""
                        notes.append(f"{labels[j][0][-1]}=range {a}-{b} (midpoint)")
                    elif lines:
                        v = parse_pct(lines[0])
                        rest = " ".join(lines[1:])
                    ms = re.fullmatch(r"(\d{1,3})(?:\s*/\s*(\d{1,3})?)?", rest.strip()) if rest else None
                    if ms:
                        seats = int(ms.group(1)) if not ms.group(2) else (int(ms.group(1)) + int(ms.group(2))) / 2
                if v is None and seats is None:
                    if txt and txt not in ("–", "-", "—", "N/A", "n/a", "N/a", "—N/a") and not re.fullmatch(r"[–\-—\s]*", txt):
                        if c["colspan"] > 1 or re.search(r"[A-Za-zΑ-Ωα-ω]", txt):
                            notes.append(f"{labels[j][0][-1]}={txt[:40]}")
                    continue
                vals.append((j, v, seats))
            if not any(v is not None or (seat_table and sv is not None) for _, v, sv in vals):
                continue
            ptype = "exit_poll" if re.search(r"exit", nl(ptxt + " " + dtxt)) else ("election" if is_elec else (
                "aggregator" if re.search(r"aggregat", nl(ctx)) else "poll"))
            if ptype == "poll" and fe and ectx_date and fe == ectx_date:
                ptype = "election_night_projection"
            table_rows.append(dict(ptype=ptype, pollster=pollster, client=client, fs=fs, fe=fe, dnote=dnote, sample=sample,
                                   vals=vals, notes=notes, is_elec=is_elec, ptxt=ptxt))
        if not table_rows:
            continue
        # measure: από επικεφαλίδες, αλλιώς από δεδομένα
        und_cols = set()
        for j in (opt_cols if not seat_table else []):
            k, _ = pmap.key_for([labels[j][0][-1]] + labels[j][1], default_year, auto_ok=False)
            if k == "UNDECIDED":
                und_cols.add(j)
        measure = measure_hdr
        inferred = False
        if measure is None:
            sums = sorted(sum(v for j, v, _ in tr["vals"] if v is not None and j not in und_cols)
                          for tr in table_rows if not tr["is_elec"])
            med = sums[len(sums) // 2] if sums else 100
            has_und = any(j in und_cols for tr in table_rows for j, v, _ in tr["vals"] if v is not None)
            measure = "vote_intention_raw" if (has_und or med < 92) else "vote_estimate"
            inferred = True
        party_measure = measure.startswith("vote") or measure in ("other:referendum_vote", "other:seat_projection")
        tstats.append(dict(page=title, wiki=wiki, table=ti, ctx=ctx_full, measure=measure, inferred=inferred,
                           rows=len(table_rows), options=[labels[j][0][-1] for j in opt_cols], scope=scope,
                           scenario=scenario))
        for ri, tr in enumerate(table_rows):
            pid_src = f"{wiki}|{title}|{ti}|{ri}"
            pid = hashlib.sha1(pid_src.encode()).hexdigest()[:12]
            year = tr["fe"].year if tr["fe"] else default_year
            und = None
            for j, v, _ in tr["vals"]:
                if j in und_cols:
                    und = v
            m_row = measure
            if tr["is_elec"]:
                m_row = "election_result" if party_measure else measure
            for j, v, seats in tr["vals"]:
                opt = labels[j][0][-1]
                grp = labels[j][0][0] if len(labels[j][0]) > 1 else ""
                m_col = m_row
                if grp and re.search(r"only|excl|valid|εγκυρ|χωρις|decided", nl(grp)):
                    if m_row.startswith("election"):
                        continue
                    m_col = m_row + "_decided_only"
                link = labels[j][1][0] if labels[j][1] else ""
                key, prow = pmap.key_for([link, opt] + labels[j][1][1:] + labels[j][0][:-1], year,
                                         auto_ok=party_measure)
                if party_measure and key.startswith("LDR_"):
                    # σενάρια "κόμμα του Χ"
                    if key in ("LDR_TSIPRAS", "LDR_SAMARAS") and year and year >= 2025:
                        key = "NEW_" + key[4:] + "_PARTY"
                    elif prow and prow.get("lineage_key"):
                        key = prow["lineage_key"]
                base = dict(poll_id=pid, source_page=title, source_wiki=wiki, source_revid=revid,
                            source_url=page_url, election_context=ectx, table_index=ti, table_context=ctx[:200],
                            scope=scope, scenario=int(scenario), poll_type=tr["ptype"], pollster=tr["pollster"], client=tr["client"],
                            fieldwork_start=tr["fs"].isoformat() if tr["fs"] else "",
                            fieldwork_end=tr["fe"].isoformat() if tr["fe"] else "", date_note=tr["dnote"],
                            sample_size=tr["sample"] or "", option=opt, option_link=link, party_key=key,
                            undecided_pct="" if und is None else und,
                            notes=";".join(tr["notes"] + (["measure_inferred_from_row_sums"] if inferred else [])))
                if v is not None:
                    rows_out.append(dict(base, measure=m_col, value_pct=v, value_seats=""))
                if seats is not None:
                    rows_out.append(dict(base, measure=("election_seats" if tr["is_elec"] else "other:seat_projection"),
                                         value_pct="", value_seats=seats))


def main():
    raw, pm_path, out_csv, auto_csv = sys.argv[1:5]
    pmap = PartyMap(pm_path)
    rows, tstats = [], []
    for sub in ("polls", "elections"):
        man = json.load(open(os.path.join(raw, sub, "manifest.json"), encoding="utf-8"))
        for it in man["files"]:
            if not it["file"].startswith("wikipedia/"):
                continue
            try:
                parse_page(os.path.join(raw, sub, it["file"]), it, pmap, rows, tstats)
            except Exception as e:  # noqa: BLE001
                print("PARSE-FAIL", it["file"], repr(e), file=sys.stderr)
                raise
    with open(out_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=COLS)
        w.writeheader()
        for r in rows:
            w.writerow({k: r.get(k, "") for k in COLS})
    with open(auto_csv, "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["party_key", "entity_type", "lineage_key", "name_el", "name_en", "abbr", "active_from",
                    "active_to", "aliases"])
        for k, r in sorted(pmap.auto.items()):
            w.writerow([k, "party_auto", k, "", r["name_en"], "", "", "", "|".join(sorted(r["aliases"]))])
    with open(out_csv + ".tables.json", "w", encoding="utf-8") as f:
        json.dump(tstats, f, ensure_ascii=False, indent=1)
    print(f"rows={len(rows)} tables={len(tstats)} auto_keys={len(pmap.auto)}")


if __name__ == "__main__":
    main()
