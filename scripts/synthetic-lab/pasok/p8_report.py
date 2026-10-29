#!/usr/bin/env python3
"""PHASE 8 — κατασκευή της διαδραστικής έκθεσης «ΠΑΣΟΚ — Πανελλαδική Πολιτική Έρευνα» (HTML, έτοιμη για εκτύπωση σε PDF).

Διαβάζει ΜΟΝΟ τα αποτελέσματα της γεννήτριας (report_data.json + PASOK_SYNTHETIC_RESPONDENTS.csv). Όλα τα κείμενα με αριθμούς
παράγονται από τα δεδομένα, ώστε μια νέα εκτέλεση να μένει συνεπής.
    python3 -I scripts/synthetic-lab/pasok/p8_report.py <data_dir> <out_html> [lab_tiers.json]
"""
import csv
import html
import json
import sys
from collections import OrderedDict
from pathlib import Path

DATA = Path(sys.argv[1])
OUT_HTML = Path(sys.argv[2])
TIERS = json.load(open(sys.argv[3], encoding="utf-8")) if len(sys.argv) > 3 else None
D = json.load(open(DATA / "report_data.json", encoding="utf-8"))
RESP = list(csv.DictReader(open(DATA / "PASOK_SYNTHETIC_RESPONDENTS.csv", encoding="utf-8")))
S = D["summary"]
CT = D["crosstabs"]
QN = D["questionnaire"]
QD = {q["id"]: q for q in QN["questions"]}
VE = D["voteEstimate"]
esc = html.escape


def f1(x):
    return f"{x:.1f}".replace(".", ",")


def f0(x):
    return f"{x:.0f}"


def pct(it, codes):
    r = {x["code"]: x["pct"] for x in S[it]["results"]}
    return sum(r.get(c, 0) for c in codes)


def lab(it, code):
    return next(x["label"] for x in S[it]["results"] if x["code"] == code)


# ------------------------------------------------------------------ χρώματα
PARTY = OrderedDict([
    ("ΝΔ", "#1f5baa"), ("ΕΛ.Α.Σ.", "#a3195b"), ("ΠΑΣΟΚ–ΚΙΝΑΛ", "#0b8a3e"), ("Ελληνική Λύση", "#4fa3dc"), ("ΚΚΕ", "#c8102e"),
    ("Πλεύση Ελευθερίας", "#6a3d9a"), ("Ελπίδα για τη Δημοκρατία", "#e0a01a"), ("Συμμαχία Ελλήνων", "#37474f"), ("Φωνή Λογικής", "#8d6e63"),
    ("ΜέΡΑ25", "#e8590c"), ("ΣΥΡΙΖΑ", "#e879a8"), ("ΝΙΚΗ", "#2e9c9a"), ("Δημοκράτες – Προοδευτικό Κέντρο", "#8e7cc3"), ("Νέα Αριστερά", "#9e9d24"),
    ("Σπαρτιάτες", "#5d4037"), ("Άλλο κόμμα", "#9e9e9e"), ("Λευκό / Άκυρο", "#bdbdbd"), ("Αποχή", "#d5d5d5"), ("Αναποφάσιστος/η", "#757575"),
    ("Δεν απαντώ", "#e3e3e3"), ("Κανένα", "#a0a0a0"), ("Κανένα άλλο κόμμα", "#a0a0a0"), ("ΔΓ/ΔΑ", "#e3e3e3"), ("Δεν ψήφισα", "#d5d5d5"),
    ("Δεν είχα δικαίωμα ψήφου", "#e9e9e9"), ("Δεν θυμάμαι / ΔΑ", "#e3e3e3"),
])
LEADER_COLOR = {"Κυριάκος Μητσοτάκης": "ΝΔ", "Αλέξης Τσίπρας": "ΕΛ.Α.Σ.", "Νίκος Ανδρουλάκης": "ΠΑΣΟΚ–ΚΙΝΑΛ", "Κυριάκος Βελόπουλος": "Ελληνική Λύση",
                "Δημήτρης Κουτσούμπας": "ΚΚΕ", "Μαρία Καρυστιανού": "Ελπίδα για τη Δημοκρατία", "Γιάνης Βαρουφάκης": "ΜέΡΑ25", "Αφροδίτη Λατινοπούλου": "Φωνή Λογικής",
                "Ζωή Κωνσταντοπούλου": "Πλεύση Ελευθερίας", "Στέφανος Κασσελάκης": "Δημοκράτες – Προοδευτικό Κέντρο", "Άλλος/η": "Άλλο κόμμα", "Κανένας/καμία": "Κανένα"}
DIV = ["#1d5f9e", "#7fb0dd", "#eba79d", "#c2423a"]
DIV_G = ["#0a6b37", "#79c393", "#eba79d", "#c2423a"]
SEQ = ["#123f6e", "#3b78b8", "#97bfe6", "#d6e5f5"]
DK = "#cfcfcf"
SPECIAL = "#e8e8e8"
ACCENT = "#24507e"
GREEN = "#0b8a3e"


def trim(t, n):
    return t if len(t) <= n else t[:n].rsplit(" ", 1)[0] + "…"


def qsort(xs):
    import re
    return sorted(xs, key=lambda q: [int(x) for x in re.findall(r"\d+", q)])


def pcolor(label):
    if label in PARTY:
        return PARTY[label]
    if label in LEADER_COLOR:
        return PARTY[LEADER_COLOR[label]]
    return "#9e9e9e"


# ------------------------------------------------------------------ SVG
def svg_hbar(rows, width=720, label_w=None, row_h=28, max_val=None, marker=None, big=False, fmt=f1):
    """rows: [(label, value, color)]· marker: {label: value} για λεπτή γραμμή αναφοράς."""
    if label_w is None:
        label_w = int(min(340, max(150, max(len(l) for l, _, _ in rows) * 7.0 + 16)))
    mv = max_val or max(v for _, v, _ in rows) * 1.12 or 1
    if len(rows) > 16 and row_h > 18:
        row_h = 18
    elif len(rows) > 14 and row_h > 19:
        row_h = 19
    elif len(rows) > 11 and row_h > 20:
        row_h = 20
    elif len(rows) > 9 and row_h > 22:
        row_h = 22
    h = row_h * len(rows) + 8
    bar_w = width - label_w - 70
    out = [f'<svg class="chart" viewBox="0 0 {width} {h}" role="img" preserveAspectRatio="xMinYMin meet">']
    for i, (l, v, c) in enumerate(rows):
        y = 4 + i * row_h
        bw = max(1.5, bar_w * v / mv)
        out.append(f'<g><title>{esc(l)}: {fmt(v)}%</title>')
        out.append(f'<text x="{label_w - 10}" y="{y + row_h * 0.62}" text-anchor="end" class="lbl">{esc(l)}</text>')
        out.append(f'<rect x="{label_w}" y="{y + 5}" width="{bw:.1f}" height="{row_h - 10}" rx="3" fill="{c}"/>')
        tx = label_w + bw + 7
        if marker and l in marker:
            tx = max(tx, label_w + bar_w * marker[l] / mv + 7)
        out.append(f'<text x="{tx:.1f}" y="{y + row_h * 0.64}" class="{"valbig" if big else "val"}">{fmt(v)}%</text>')
        if marker and l in marker:
            mx = label_w + bar_w * marker[l] / mv
            out.append(f'<line x1="{mx:.1f}" x2="{mx:.1f}" y1="{y + 2}" y2="{y + row_h - 2}" stroke="#111" stroke-width="2"/>')
        out.append("</g>")
    out.append("</svg>")
    return "".join(out)


def svg_stack(rows, cats, width=720, label_w=230, row_h=34, show_legend=True):
    """rows: [(label, [values])], cats: [(label, color)] — 100% οριζόντιες στήλες."""
    h = row_h * len(rows) + 6
    bar_w = width - label_w - 8
    out = [f'<svg class="chart" viewBox="0 0 {width} {h}" role="img" preserveAspectRatio="xMinYMin meet">']
    for i, (l, vals) in enumerate(rows):
        y = 3 + i * row_h
        tot = sum(vals) or 1
        x = label_w
        out.append(f'<text x="{label_w - 10}" y="{y + row_h * 0.6}" text-anchor="end" class="lbl">{esc(l)}</text>')
        for (cl, cc), v in zip(cats, vals):
            ww = bar_w * v / tot
            if ww <= 0:
                continue
            dark = cc in (DIV[0], DIV[3], DIV_G[0], DIV_G[3], SEQ[0], SEQ[1], "#1d5f9e", "#c2423a", GREEN, "#757575") or cc in PARTY.values() and cc not in ("#bdbdbd", "#d5d5d5", "#e3e3e3", "#e9e9e9", "#a0a0a0", "#9e9e9e", "#e0a01a", "#4fa3dc")
            out.append(f'<g><title>{esc(l)} — {esc(cl)}: {f1(v)}%</title><rect x="{x:.1f}" y="{y + 4}" width="{max(ww - 1.5, 0.5):.1f}" height="{row_h - 8}" fill="{cc}"/>')
            if ww >= 30:
                out.append(f'<text x="{x + ww / 2:.1f}" y="{y + row_h * 0.6}" text-anchor="middle" class="seg" fill="{"#fff" if dark else "#1a1a1a"}">{f0(v)}%</text>')
            out.append("</g>")
            x += ww
    out.append("</svg>")
    leg = "".join(f'<span><i style="background:{c}"></i>{esc(l)}</span>' for l, c in cats)
    return (f'<div class="legend">{leg}</div>' if show_legend else "") + "".join(out)


def svg_columns(vals, labels, colors, width=720, h=230, fmt=f1):
    mv = max(vals) * 1.15
    n = len(vals)
    gap = 8
    bw = (width - 20 - gap * (n - 1)) / n
    out = [f'<svg class="chart" viewBox="0 0 {width} {h + 26}" role="img" preserveAspectRatio="xMinYMin meet">']
    for i, (v, l, c) in enumerate(zip(vals, labels, colors)):
        x = 10 + i * (bw + gap)
        bh = (h - 30) * v / mv
        out.append(f'<g><title>{esc(l)}: {fmt(v)}%</title><rect x="{x:.1f}" y="{h - bh:.1f}" width="{bw:.1f}" height="{bh:.1f}" rx="3" fill="{c}"/>')
        out.append(f'<text x="{x + bw / 2:.1f}" y="{h - bh - 6:.1f}" text-anchor="middle" class="val">{fmt(v)}%</text>')
        out.append(f'<text x="{x + bw / 2:.1f}" y="{h + 18}" text-anchor="middle" class="lbl">{esc(l)}</text></g>')
    out.append(f'<line x1="6" x2="{width - 6}" y1="{h}" y2="{h}" stroke="#bbb"/></svg>')
    return "".join(out)


# ------------------------------------------------------------------ τεκμηρίωση
CLASS_TXT = {"A": ("Τεκμηριωμένη εκτίμηση", "cA"), "A/B": ("Τεκμηριωμένη εκτίμηση", "cA"), "B": ("Μοντελοποιημένη προσομοίωση", "cB"), "C": ("Υποθετικό σενάριο επίδειξης", "cC")}
SRC_SHORT = {"S1": "Eurobarometer 105 (άνοιξη 2026)", "S2": "μέσος όρος δημοσιευμένων εκτιμήσεων Οκτ. 2026", "S3": "Interview/POLITICAL, Οκτ. 2026", "S4": "Interview/POLITICAL, Σεπτ. 2026", "S5": "επίσημο αποτέλεσμα Ιουνίου 2023"}


def badge(it):
    c = S[it]["evidenceClass"]
    t, cls = CLASS_TXT[c]
    src = S[it].get("source") or ("S5" if S[it]["qid"] == "Q8" else "")
    extra = f' · άγκυρα: {SRC_SHORT.get(src, "")}' if src and c != "C" else (" · σενάριο Σ1" if c == "C" else "")
    return f'<span class="badge {cls}">{t}{extra}</span>'


def figcap(it, base_txt=None):
    sm = S[it]
    base = base_txt or f'{sm["base"]} · n = {sm["baseN"]}'
    return f'<div class="figcap"><span>Βάση: {esc(base)}</span><span class="synth">Συνθετικά δεδομένα — Greek Synthetic Research Lab</span></div>'


# ------------------------------------------------------------------ διασταυρώσεις
DIMS_SHOW = ["Φύλο", "Ηλικία", "Εκπαίδευση", "Περιοχή", "Τύπος περιοχής", "Οικονομική κατάσταση", "Πρόθεση ψήφου", "Ψήφος 2023"]
SHORT_GROUP = {"Κεντρική Ελλάδα & Θεσσαλία": "Κεντρ. Ελλάδα & Θεσσαλία", "Πελοπόννησος & Δυτική Ελλάδα": "Πελοπ. & Δυτ. Ελλάδα", "Νησιά (Κρήτη, Αιγαίο, Ιόνιο)": "Νησιά",
               "Χωρίς κομματική επιλογή": "Χωρίς κομμ. επιλογή", "Αγροτική / ημιαστική": "Αγροτική/ημιαστική", "Δεν ψήφισε / λοιπά": "Δεν ψήφισε/λοιπά"}


def ct_val(it, dim, g, codes):
    x = CT[it][dim][g]
    return sum(x["pct"].get(str(c), 0) for c in codes), x["n"]


def ct_table(it, cols, skip_dims=()):
    """Στατικός πίνακας: βασικός δείκτης ανά ομάδα (δύο στήλες για εκτύπωση· οι υπόλοιπες διαστάσεις στον πλήρη πίνακα)."""
    left = ["Φύλο", "Ηλικία", "Εκπαίδευση", "Οικονομική κατάσταση"]
    right = ["Περιοχή", "Πρόθεση ψήφου"] if "Πρόθεση ψήφου" not in skip_dims else ["Περιοχή", "Τύπος περιοχής"]
    dims = left + right
    tot = [pct(it, c) for _, c in cols]
    allv = []
    blocks = []
    for d in dims:
        rows = []
        for g, x in CT[it][d].items():
            vals = [ct_val(it, d, g, c)[0] for _, c in cols]
            n = x["n"]
            rows.append((g, n, vals))
            if n >= 50:
                allv.append(vals[0])
        blocks.append((d, rows))
    lo, hi = (min(allv), max(allv)) if allv else (0, 1)

    def shade(v, n):
        if n < 50:
            return ""
        t = 0 if hi == lo else (v - lo) / (hi - lo)
        return f' style="background:rgba(36,80,126,{0.06 + 0.30 * t:.2f})"'

    head = "".join(f"<th>{esc(h if len(h) <= 18 else h[:17] + '…')}</th>" for h, _ in cols)
    half = len(left)
    parts = []
    for chunk in (blocks[:half], blocks[half:]):
        body = []
        for d, rows in chunk:
            body.append(f'<tr class="dim"><td colspan="{len(cols) + 2}">{esc(d)}</td></tr>')
            for g, n, vals in rows:
                small = n < 50
                cells = "".join(f"<td{shade(v, n) if j == 0 else ''}>{'' if n == 0 else f1(v)}</td>" for j, v in enumerate(vals))
                body.append(f'<tr class="{"small" if small else ""}"><td class="g">{esc(SHORT_GROUP.get(g, g))}{"†" if small else ""}</td><td class="n">{n}</td>{cells}</tr>')
        parts.append(f'<table class="ct"><thead><tr><th class="g">Ομάδα</th><th class="n">n</th>{head}</tr></thead><tbody>{"".join(body)}</tbody></table>')
    total_line = " · ".join(f"{esc(h)}: <b>{f1(v)}%</b>" for (h, _), v in zip(cols, tot))
    return (f'<div class="cthead">Διασταυρώσεις (%, σταθμισμένα) — Σύνολο: {total_line}</div><div class="ctwrap">{"".join(parts)}</div>'
            f'<div class="ctnote">† βάση κάτω από 50 συνθετικές εγγραφές — ενδεικτικό. Σκίαση: ένταση της πρώτης στήλης.</div>')


def ct_full(it):
    """Πλήρης διαδραστικός πίνακας (μόνο οθόνη)."""
    q = QD[S[it]["qid"]]
    opts = q["options"]
    tabs = []
    panes = []
    for k, d in enumerate(DIMS_SHOW):
        tabs.append(f'<button type="button" data-k="{k}" aria-pressed="{"true" if k == 0 else "false"}">{esc(d)}</button>')
        head = "".join(f"<th>{esc(l)}</th>" for _, l in opts)
        body = []
        for g, x in CT[it][d].items():
            cells = "".join(f"<td>{'' if x['n'] == 0 else f1(x['pct'].get(str(c), 0))}</td>" for c, _ in opts)
            body.append(f'<tr><td class="g">{esc(g)}</td><td class="n">{x["n"]}</td>{cells}</tr>')
        tot = "".join(f"<td><b>{f1(pct(it, [c]))}</b></td>" for c, _ in opts)
        body.insert(0, f'<tr class="tot"><td class="g">Σύνολο</td><td class="n">{S[it]["baseN"]}</td>{tot}</tr>')
        panes.append(f'<div class="pane" data-k="{k}"{"" if k == 0 else " hidden"}><div class="tw"><table class="full"><thead><tr><th class="g">Ομάδα</th><th class="n">n</th>{head}</tr></thead><tbody>{"".join(body)}</tbody></table></div></div>')
    return f'<details class="xt noprint"><summary>Πλήρης πίνακας διασταυρώσεων (όλες οι επιλογές)</summary><div class="tabs">{"".join(tabs)}</div>{"".join(panes)}</details>'


def insight(it, codes, label, dims=("Ηλικία", "Φύλο", "Εκπαίδευση", "Περιοχή", "Οικονομική κατάσταση"), pol=("Πρόθεση ψήφου",)):
    """Δημογραφική και πολιτική διαφοροποίηση του βασικού δείκτη (ομάδες ≥ 50 εγγραφών)."""
    tot = pct(it, codes)
    cand = []
    for d in dims:
        for g, x in CT[it][d].items():
            if x["n"] >= 50:
                cand.append((ct_val(it, d, g, codes)[0], d, g))
    out = []
    if cand:
        hi = max(cand)
        lo = min(cand)
        if hi[0] - lo[0] >= 6:
            out.append(f"Στις κοινωνικές ομάδες, το ποσοστό «{label}» κυμαίνεται από {f1(lo[0])}% ({lo[1].lower()}: {lo[2]}) έως {f1(hi[0])}% ({hi[1].lower()}: {hi[2]}).")
        else:
            out.append(f"Το ποσοστό «{label}» είναι σχετικά ομοιογενές στις κοινωνικές ομάδες ({f1(lo[0])}%–{f1(hi[0])}%).")
    pc = []
    for d in pol:
        for g, x in CT[it][d].items():
            if x["n"] >= 30 and g != "Άλλα κόμματα":
                pc.append((ct_val(it, d, g, codes)[0], g, x["n"]))
    if pc:
        pc.sort(reverse=True)
        out.append("Κατά πρόθεση ψήφου: " + ", ".join(f"{g} {f1(v)}%" for v, g, _ in pc) + f" (σύνολο {f1(tot)}%).")
    return " ".join(out)


# ------------------------------------------------------------------ σελίδες
PAGES = []
TOC = []


def page(body, cls="", sec=None, anchor=None):
    if isinstance(sec, tuple):
        sec, anchor = sec
    if sec:
        TOC.append((sec, anchor, len(PAGES) + 1))
    PAGES.append(f'<section class="page {cls}"{f" id={chr(34)}{anchor}{chr(34)}" if anchor else ""}>{body}</section>')


def sec_head(num, title, kicker=None, pasok=False):
    return f'<div class="sechead{" pasok" if pasok else ""}"><span class="num">{num}</span><div><h2>{esc(title)}</h2>{f"<p>{esc(kicker)}</p>" if kicker else ""}</div></div>'


def qhead(it, title=None):
    sm = S[it]
    q = QD[sm["qid"]]
    item = f' — {esc(sm["itemLabel"])}' if sm.get("itemLabel") else ""
    return (f'<div class="qhead"><div class="qid">{esc(sm["qid"])}{"" if not sm.get("itemLabel") else " · " + esc(it)}</div>'
            f'<h3>{esc(title or sm["short"])}{item}</h3><p class="wording">«{esc(q["text"])}»</p>{badge(it)}</div>')


def kpis(items):
    return '<div class="kpis">' + "".join(f'<div class="kpi"><div class="v" style="color:{c}">{v}</div><div class="l">{esc(l)}</div></div>' for v, l, c in items) + "</div>"


def ordinal_page(it, cols_lbl=("Θετικά", "Αρνητικά"), palette=DIV, title=None, text=None, sec=None, sec_html="", pasok=False, extra="", skip=()):
    sm = S[it]
    res = [r for r in sm["results"]]
    cats = []
    vals = []
    pal = list(palette)
    for r in res:
        if r["code"] in (1, 2, 3, 4):
            c = pal[r["code"] - 1]
        elif r["code"] == 98:
            c = SPECIAL
        else:
            c = DK
        cats.append((r["label"], c))
        vals.append(r["pct"])
    pos = pct(it, [1, 2])
    neg = pct(it, [3, 4])
    chart = svg_stack([("Σύνολο", vals)], cats, row_h=40)
    vote_rows = []
    for g, x in CT[it]["Πρόθεση ψήφου"].items():
        if x["n"] >= 30:
            vote_rows.append((f"{SHORT_GROUP.get(g, g)} (n={x['n']})", [x["pct"].get(str(r["code"]), 0) for r in res]))
    vchart = svg_stack(vote_rows, cats, row_h=25, show_legend=False) if vote_rows and it not in ("Q7", "Q10") else ""
    k = kpis([(f1(pos) + "%", cols_lbl[0], palette[0]), (f1(neg) + "%", cols_lbl[1], palette[3])])
    txt = text or ""
    body = (sec_html + qhead(it, title) + k + chart + (f'<div class="sub">Ανά πρόθεση ψήφου</div>{vchart}' if vchart else "") + figcap(it)
            + f'<p class="analysis">{txt} {insight(it, [1, 2], cols_lbl[0])}</p>' + extra
            + ct_table(it, [(cols_lbl[0], [1, 2]), (cols_lbl[1], [3, 4])], skip_dims=("Πρόθεση ψήφου",) if (vchart or "vote" in skip) else ()) + ct_full(it))
    page(body, "pasok" if pasok else "", sec=sec[0] if sec else None, anchor=sec[1] if sec else None)


SHORT_OPT = {("Q29", 1): "Πρόγραμμα", ("Q29", 2): "Ιδεολογία", ("Q29", 3): "Υποψ. πρωθυπουργός"}


def short_opt(it, r):
    if (it, r["code"]) in SHORT_OPT:
        return SHORT_OPT[(it, r["code"])]
    l = r["label"].split(" / ")[0]
    if it == "Q20" and " " in l:
        return l.split(" ")[-1]
    if len(l) <= 18:
        return l
    out = ""
    for wd in l.split(" "):
        if len(out) + len(wd) + 1 > 17:
            break
        out = (out + " " + wd).strip()
    return out + "…"


def nominal_page(it, title=None, text=None, color=ACCENT, party=False, sec=None, sec_html="", top_cols=3, marker=None, pasok=False, kpi=None, sort=True, multi_note=None):
    sm = S[it]
    res = list(sm["results"])
    if sort:
        res.sort(key=lambda r: (-1 if r["code"] in (97, 98, 99, 90, 91, 92, 93) else 0, r["pct"]), reverse=True)
        res = [r for r in res if r["code"] not in (97, 98, 99, 90, 91, 92, 93)] + [r for r in res if r["code"] in (97, 90, 91, 92, 93, 98, 99)]
    rows = [(r["label"], r["pct"], (pcolor(r["label"]) if party else (DK if r["code"] in (97, 98, 99) else color))) for r in res if not (r["code"] == 99 and r["pct"] == 0)]
    chart = svg_hbar(rows, big=True)
    top = [r for r in res if r["code"] not in (97, 98, 99, 90, 91, 92, 93)][:top_cols]
    cols = [(short_opt(it, r), [r["code"]]) for r in top]
    k = kpis(kpi) if kpi else ""
    body = (sec_html + qhead(it, title) + k + chart + figcap(it) + (f'<p class="note">{multi_note}</p>' if multi_note else "")
            + f'<p class="analysis">{text or ""} {insight(it, [top[0]["code"]], top[0]["label"])}</p>' + ct_table(it, cols) + ct_full(it))
    page(body, "pasok" if pasok else "", sec=sec[0] if sec else None, anchor=sec[1] if sec else None)


# ------------------------------------------------------------------ υπολογισμοί για κείμενα
def wsum(rows):
    return sum(float(r["weight"]) for r in rows)


def num(v):
    try:
        return int(v)
    except (TypeError, ValueError):
        return None


est = {int(k): v for k, v in VE["shares"].items()}
avgp = {int(k): v for k, v in VE["pollAverage"].items()}
Q6L = {c: l for c, l in QD["Q6"]["options"]}
pas_rows = [r for r in RESP if num(r["Q6"]) == 3]
ptv = [r for r in RESP if num(r["Q28"]) is not None and num(r["Q28"]) != 99]
W = wsum(RESP)
seg = OrderedDict([("Πυρήνας: δηλώνουν ΠΑΣΟΚ", [r for r in RESP if num(r["Q6"]) == 3]),
                   ("Δυνητικοί: 7–10, δεν δηλώνουν ΠΑΣΟΚ", [r for r in ptv if num(r["Q28"]) >= 7 and num(r["Q6"]) != 3]),
                   ("Ανοιχτοί: 5–6", [r for r in ptv if 5 <= num(r["Q28"]) <= 6 and num(r["Q6"]) != 3]),
                   ("Απομακρυσμένοι: 1–4", [r for r in ptv if 1 <= num(r["Q28"]) <= 4 and num(r["Q6"]) != 3]),
                   ("Κλειστοί: 0", [r for r in ptv if num(r["Q28"]) == 0 and num(r["Q6"]) != 3]),
                   ("ΔΓ/ΔΑ", [r for r in RESP if num(r["Q28"]) == 99 and num(r["Q6"]) != 3])])
seg_share = {k: wsum(v) / W * 100 for k, v in seg.items()}
pot = seg["Δυνητικοί: 7–10, δεν δηλώνουν ΠΑΣΟΚ"]
pot_from = OrderedDict()
for r in pot:
    c = num(r["Q6"])
    k = Q6L.get(c, "")
    k = k if c in (1, 2, 92) else ("Άλλα κόμματα" if c and c <= 15 else "Χωρίς κομματική επιλογή")
    pot_from[k] = pot_from.get(k, 0) + float(r["weight"])
pot_tot = sum(pot_from.values()) or 1
q9_pasok = [r for r in RESP if r["Q9_3"] == "1"]
q9_from = OrderedDict()
for r in q9_pasok:
    k = Q6L[num(r["Q6"])]
    q9_from[k] = q9_from.get(k, 0) + float(r["weight"])
q9_base = wsum([r for r in RESP if r["Q9_3"] != ""])
pos_items = OrderedDict([("Q11", "Συνολική εικόνα (θετική)"), ("Q12", "Αποτελεσματική αντιπολίτευση"), ("Q13", "Εμπιστοσύνη: οικονομία"), ("Q14", "Εμπιστοσύνη: δημόσια υγεία"),
                         ("Q15", "Εμπιστοσύνη: θεσμοί & διαφάνεια"), ("Q16", "Αξιόπιστη κυβερνητική πρόταση"), ("Q17", "Ισχυρή πολιτική παρουσία")])
pos_vals = {k: pct(k, [1, 2]) for k in pos_items}
best_dim = max(("Q13", "Q14", "Q15"), key=lambda k: pos_vals[k])
worst_dim = min(("Q13", "Q14", "Q15"), key=lambda k: pos_vals[k])
pasok_ct = CT["Q11"]["Πρόθεση ψήφου"]

# ================================================================== ΕΞΩΦΥΛΛΟ
page(f'''
<div class="cover-top"><div class="brandline"></div><div class="cover-kicker">Οκτώβριος 2026 · Πανελλαδική · Εκλογικό σώμα</div></div>
<div class="sim-banner">ΠΡΟΣΟΜΟΙΩΣΗ ΠΟΛΙΤΙΚΗΣ ΕΡΕΥΝΑΣ</div>
<h1 class="cover-title">ΠΑΣΟΚ — Πανελλαδική<br>Πολιτική Έρευνα</h1>
<p class="cover-sub">Πολιτικό κλίμα · Πρόθεση ψήφου · Εικόνα ΠΑΣΟΚ · Πολιτική ηγεσία · Προτεραιότητες · Εκλογική δυναμική</p>
<div class="cover-statement">
  <p>«Η παρούσα έκθεση βασίζεται σε 500 συνθετικούς ερωτώμενους που δημιουργήθηκαν με τεχνητή νοημοσύνη. Δεν πραγματοποιήθηκαν συνεντεύξεις πραγματικών πολιτών και τα αποτελέσματα δεν αποτελούν πραγματική δημοσκόπηση.»</p>
</div>
<div class="cover-flag">Υποθετική ανάθεση — Δεν αποτελεί επίσημη έρευνα του ΠΑΣΟΚ</div>
<div class="cover-grid">
  <div><span>Συνθετικό δείγμα</span><b>500 ερωτώμενοι</b></div>
  <div><span>Κάλυψη</span><b>Πανελλαδική</b></div>
  <div><span>Περίοδος αναφοράς</span><b>Οκτώβριος 2026</b></div>
  <div><span>Ερωτηματολόγιο</span><b>30 ερωτήσεις + 7 δημογραφικά</b></div>
</div>
<div class="cover-foot">
  <p>Συνθετικά δεδομένα — Greek Synthetic Research Lab. Το ΠΑΣΟΚ δεν έχει αναθέσει ούτε εγκρίνει την παρούσα εργασία. Η έκθεση δεν δημοσιεύεται ως δημοσκόπηση (ν. 3603/2007) και δεν προορίζεται για δημόσια διάδοση.</p>
</div>''', "cover")

# ================================================================== ΤΑΥΤΟΤΗΤΑ & ΠΕΡΙΕΧΟΜΕΝΑ (συμπληρώνεται στο τέλος)
TOC_SLOT = len(PAGES)
PAGES.append("")

# ================================================================== EXECUTIVE SUMMARY
lead = sorted(((v, c) for c, v in est.items()), reverse=True)
gap_elas = est[2] - est[3]
exec1 = f'''
{sec_head("01", "Executive summary", "Τα βασικά ευρήματα, χωρισμένα ανάλογα με τη βάση τεκμηρίωσής τους")}
<div class="exec-grid">
  <div class="exec-card cA"><div class="ec-k">Εκτίμηση ψήφου ΠΑΣΟΚ</div><div class="ec-v" style="color:{GREEN}">{f1(est[3])}%</div><div class="ec-t">Τρίτη θέση, {f1(gap_elas)} μονάδες πίσω από την ΕΛ.Α.Σ. ({f1(est[2])}%) και {f1(est[1] - est[3])} πίσω από τη ΝΔ ({f1(est[1])}%).</div></div>
  <div class="exec-card cA"><div class="ec-k">Κατεύθυνση της χώρας</div><div class="ec-v">{f0(pct("Q1", [2]))}%</div><div class="ec-t">θεωρεί ότι η χώρα κινείται σε λάθος κατεύθυνση· μόλις {f0(pct("Q1", [1]))}% σε σωστή.</div></div>
  <div class="exec-card cA"><div class="ec-k">Καταλληλότερος πρωθυπουργός</div><div class="ec-v">{f0(pct("Q20", [3]))}%</div><div class="ec-t">για τον Ν. Ανδρουλάκη, έναντι {f0(pct("Q20", [1]))}% για τον Κ. Μητσοτάκη και {f0(pct("Q20", [2]))}% για τον Α. Τσίπρα· «κανένας» {f0(pct("Q20", [97]))}%.</div></div>
  <div class="exec-card cA"><div class="ec-k">Κορυφαίο πρόβλημα</div><div class="ec-v">{f0(pct("Q2", [1]))}%</div><div class="ec-t">αναφέρει την ακρίβεια ως ένα από τα δύο σημαντικότερα προβλήματα· ακολουθεί η οικονομική κατάσταση ({f0(pct("Q2", [2]))}%).</div></div>
</div>
<h4 class="exec-h cA">Ευρήματα με άγκυρα σε πρόσφατα δημόσια δεδομένα</h4>
<ul class="exec-list">
  <li><b>Εκλογικός συσχετισμός.</b> Στην πρόθεση ψήφου (σύνολο δείγματος) η ΝΔ συγκεντρώνει {f1(pct("Q6", [1]))}%, η ΕΛ.Α.Σ. {f1(pct("Q6", [2]))}% και το ΠΑΣΟΚ {f1(pct("Q6", [3]))}%, με {f1(pct("Q6", [92]))}% αναποφάσιστους. Στην εκτίμηση επί των εγκύρων: ΝΔ {f1(est[1])}%, ΕΛ.Α.Σ. {f1(est[2])}%, ΠΑΣΟΚ {f1(est[3])}%, Ελληνική Λύση {f1(est[4])}%, ΚΚΕ {f1(est[5])}%.</li>
  <li><b>Δυσαρέσκεια και χαμηλή θεσμική εμπιστοσύνη.</b> Μόνο {f0(pct("Q27_3", [1]))}% εμπιστεύεται τα πολιτικά κόμματα και {f0(pct("Q27_1", [1]))}% την κυβέρνηση. Αντίθετα, την αστυνομία εμπιστεύεται το {f0(pct("Q27_5", [1]))}% και τη δικαιοσύνη το {f0(pct("Q27_4", [1]))}%.</li>
  <li><b>Οικονομική πίεση.</b> Το {f0(pct("Q24", [3]))}% δηλώνει ότι η οικονομική του κατάσταση είναι χειρότερη από πέρυσι και μόλις {f0(pct("Q24", [1]))}% καλύτερη.</li>
  <li><b>Τι κρίνει την ψήφο.</b> Το πρόγραμμα ({f0(pct("Q29", [1]))}%), η ιδεολογική ταύτιση ({f0(pct("Q29", [2]))}%) και ο υποψήφιος πρωθυπουργός ({f0(pct("Q29", [3]))}%) έχουν σχεδόν ίση βαρύτητα.</li>
</ul>
<h4 class="exec-h cB">Μοντελοποιημένα ευρήματα (συγγενείς δημόσιες πηγές και δηλωμένες παραδοχές)</h4>
<ul class="exec-list">
  <li><b>Κυβέρνηση.</b> Θετικά αξιολογεί το κυβερνητικό έργο το {f0(pct("Q3", [1, 2]))}%, αρνητικά το {f0(pct("Q3", [3, 4]))}%.</li>
  <li><b>Αντιπολίτευση.</b> Μόλις {f0(pct("Q4", [1, 2]))}% είναι ικανοποιημένο από τη λειτουργία της αντιπολίτευσης. Ότι το ΠΑΣΟΚ ασκεί αποτελεσματική αντιπολίτευση πιστεύει το {f0(pct("Q12", [1, 2]))}%.</li>
  <li><b>Προτεραιότητες.</b> Πρώτη προτεραιότητα για την επόμενη κυβέρνηση: η ακρίβεια ({f0(pct("Q23", [1]))}%), η εξωτερική πολιτική και άμυνα ({f0(pct("Q23", [3]))}%) και η οικονομία ({f0(pct("Q23", [2]))}%).</li>
  <li><b>Πολιτική προσφορά.</b> Ικανοποιημένο από τις διαθέσιμες πολιτικές επιλογές δηλώνει μόνο το {f0(pct("Q30", [1, 2]))}%.</li>
</ul>'''
page(exec1, sec=("Executive summary", "exec"), anchor="exec")

exec2 = f'''
<h4 class="exec-h cC">Υποθετικό σενάριο επίδειξης Σ1 — εικόνα και δυναμική ΠΑΣΟΚ</h4>
<p class="exec-note">Τα ευρήματα αυτής της ενότητας δεν αποτελούν πρόβλεψη. Προκύπτουν από δηλωμένα ποσοστά-στόχους του σεναρίου Σ1 (Τεχνικό παράρτημα), που συνδέονται με την πρόθεση ψήφου και την ιδεολογική θέση κάθε συνθετικού ερωτώμενου. Δείχνουν τι θα έδινε η ανάλυση αν ίσχυε το σενάριο.</p>
<ul class="exec-list">
  <li><b>Εικόνα.</b> Θετική εικόνα για το ΠΑΣΟΚ έχει το {f0(pct("Q11", [1, 2]))}% και για τον Ν. Ανδρουλάκη το {f0(pct("Q18", [1, 2]))}%. Στους ψηφοφόρους της ΕΛ.Α.Σ. το ποσοστό για το ΠΑΣΟΚ είναι {f0(ct_val("Q11", "Πρόθεση ψήφου", "ΕΛ.Α.Σ.", [1, 2])[0])}% και στους ψηφοφόρους της ΝΔ {f0(ct_val("Q11", "Πρόθεση ψήφου", "ΝΔ", [1, 2])[0])}%.</li>
  <li><b>Ισχυρότερο και ασθενέστερο πεδίο.</b> Η εμπιστοσύνη είναι υψηλότερη στη {esc(pos_items[best_dim].split(": ")[1])} ({f0(pos_vals[best_dim])}%) και χαμηλότερη στην {esc(pos_items[worst_dim].split(": ")[1])} ({f0(pos_vals[worst_dim])}%). Αξιόπιστη κυβερνητική πρόταση αναγνωρίζει το {f0(pos_vals["Q16"])}%.</li>
  <li><b>Δυναμικό.</b> Πέρα από τον πυρήνα ({f1(seg_share["Πυρήνας: δηλώνουν ΠΑΣΟΚ"])}% του δείγματος), ένα επιπλέον {f1(seg_share["Δυνητικοί: 7–10, δεν δηλώνουν ΠΑΣΟΚ"])}% δηλώνει πιθανότητα ψήφου 7–10. Το {f0(pot_from.get("Αναποφάσιστος/η", 0) / pot_tot * 100)}% αυτών είναι αναποφάσιστοι και το {f0(pot_from.get("ΕΛ.Α.Σ.", 0) / pot_tot * 100)}% ψηφοφόροι της ΕΛ.Α.Σ.</li>
  <li><b>Ως δεύτερη επιλογή</b> αναφέρει το ΠΑΣΟΚ το {f1(wsum(q9_pasok) / q9_base * 100)}% όσων δηλώνουν κόμμα.</li>
</ul>
<div class="exec-concl"><b>Συνολική εκτίμηση.</b> Η Ελλάδα του Οκτωβρίου 2026 εμφανίζεται δύσθυμη, με την ακρίβεια στην κορυφή και ελάχιστη εμπιστοσύνη στο κομματικό σύστημα. Στα τεκμηριωμένα στοιχεία, το ΠΑΣΟΚ κινείται σε τρίτη θέση, κοντά στην ΕΛ.Α.Σ. Το κρίσιμο ερώτημα για τη στρατηγική του, δηλαδή αν μπορεί να μετατρέψει τη δυσαρέσκεια σε εκλογική ενίσχυση, απαντάται εδώ μόνο σε επίπεδο σεναρίου. Απαιτεί πραγματική μέτρηση.</div>'''
page(exec2)

# ================================================================== ΠΟΛΙΤΙΚΟ ΚΛΙΜΑ
sh = sec_head("02", "Πολιτικό κλίμα", "Κατεύθυνση της χώρας, προβλήματα και ικανότητα διαχείρισης")
it = "Q1"
cats = [("Σωστή κατεύθυνση", "#1d5f9e"), ("Λάθος κατεύθυνση", "#c2423a"), ("Ούτε σωστή ούτε λάθος", "#bdbdbd"), ("ΔΓ/ΔΑ", SPECIAL)]
rows = [("Σύνολο", [pct(it, [c]) for c in (1, 2, 3, 99)])]
for d in ("Πρόθεση ψήφου",):
    for g, x in CT[it][d].items():
        if x["n"] >= 30:
            rows.append((f"{SHORT_GROUP.get(g, g)} (n={x['n']})", [x["pct"].get(str(c), 0) for c in (1, 2, 3, 99)]))
body = (sh + qhead(it) + kpis([(f1(pct(it, [2])) + "%", "Λάθος κατεύθυνση", "#c2423a"), (f1(pct(it, [1])) + "%", "Σωστή κατεύθυνση", "#1d5f9e")])
        + svg_stack(rows, cats, row_h=24) + figcap(it)
        + f'<p class="analysis">Περίπου οκτώ στους δέκα ({f0(pct(it, [2]))}%) θεωρούν ότι η χώρα κινείται σε λάθος κατεύθυνση. Η απαισιοδοξία είναι γενικευμένη. Η «σωστή κατεύθυνση» υπερισχύει μόνο στους ψηφοφόρους της ΝΔ ({f0(ct_val(it, "Πρόθεση ψήφου", "ΝΔ", [1])[0])}%), ενώ στους ψηφοφόρους του ΠΑΣΟΚ περιορίζεται στο {f0(ct_val(it, "Πρόθεση ψήφου", "ΠΑΣΟΚ", [1])[0])}%.</p>'
        + ct_table(it, [("Λάθος", [2]), ("Σωστή", [1])], skip_dims=("Πρόθεση ψήφου",)) + ct_full(it))
page(body, sec=("Πολιτικό κλίμα", "climate"), anchor="climate")

nominal_page("Q2", text=f"Η ακρίβεια κυριαρχεί στην ατζέντα: την αναφέρει το {f0(pct('Q2', [1]))}% των ερωτώμενων. Ακολουθούν η οικονομική κατάσταση ({f0(pct('Q2', [2]))}%), η διεθνής κατάσταση ({f0(pct('Q2', [3]))}%) και η σύγκρουση στη Μέση Ανατολή ({f0(pct('Q2', [4]))}%).",
             multi_note="Έως δύο απαντήσεις· τα ποσοστά αφορούν όσους ανέφεραν κάθε θέμα και αθροίζουν περίπου 200%.")
nominal_page("Q5", party=True, text=f"Κανένα κόμμα δεν συγκεντρώνει ευρεία εμπιστοσύνη διαχείρισης. Η ΝΔ προηγείται με {f0(pct('Q5', [1]))}%, ενώ το {f0(pct('Q5', [9]))}% απαντά «κανένα». Το ΠΑΣΟΚ ({f0(pct('Q5', [3]))}%) κινείται κοντά στην ΕΛ.Α.Σ. ({f0(pct('Q5', [2]))}%).")

# ================================================================== ΠΡΟΘΕΣΗ ΨΗΦΟΥ
sh = sec_head("03", "Πρόθεση ψήφου")
it = "Q6"
res = S[it]["results"]
rows = [(r["label"], r["pct"], pcolor(r["label"])) for r in res]
body = (sh + qhead(it) + svg_hbar(rows, row_h=19) + figcap(it)
        + f'<p class="analysis">Στο σύνολο του δείγματος, η ΝΔ προηγείται με {f1(pct(it, [1]))}%, με την ΕΛ.Α.Σ. ({f1(pct(it, [2]))}%) και το ΠΑΣΟΚ ({f1(pct(it, [3]))}%) να ακολουθούν. Το {f1(pct(it, [92]))}% δηλώνει αναποφάσιστο, ενώ λευκό/άκυρο, αποχή και άρνηση απάντησης αθροίζουν {f1(pct(it, [90, 91, 99]))}%.</p>'
        + ct_table(it, [("ΝΔ", [1]), ("ΕΛ.Α.Σ.", [2]), ("ΠΑΣΟΚ", [3]), ("Αναποφ.", [92])], skip_dims=("Πρόθεση ψήφου",)) + ct_full(it))
page(body, sec=("Πρόθεση ψήφου", "vote"), anchor="vote")

it = "Q6"
rows = [(Q6L[c], est[c], pcolor(Q6L[c])) for c in sorted(est, key=lambda c: -est[c])]
marker = {Q6L[c]: avgp[c] for c in est}
polls_txt = ", ".join(f'{p["pollster"]} ({p["fieldworkEnd"][8:10]}/{p["fieldworkEnd"][5:7]})' for p in VE["pollsUsed"])
body = (sec_head("04", "Εκτίμηση ψήφου", "Αναγωγή επί των εγκύρων — αναπαραγώγιμη μέθοδος")
        + f'<div class="qhead"><div class="qid">Q6 · εκτίμηση</div><h3>Εκτίμηση ψήφου</h3><p class="wording">Μερίδια των κομμάτων στους ερωτώμενους που δηλώνουν κόμμα (n = {VE["base_n"]}).</p><span class="badge cA">Τεκμηριωμένη εκτίμηση · άγκυρα: μέσος όρος δημοσιευμένων εκτιμήσεων Οκτ. 2026</span></div>'
        + kpis([(f1(est[1]) + "%", "ΝΔ", PARTY["ΝΔ"]), (f1(est[2]) + "%", "ΕΛ.Α.Σ.", PARTY["ΕΛ.Α.Σ."]), (f1(est[3]) + "%", "ΠΑΣΟΚ–ΚΙΝΑΛ", GREEN), (f1(est[4]) + "%", "Ελληνική Λύση", PARTY["Ελληνική Λύση"])])
        + '<div class="legend"><span><i style="background:#1f5baa"></i>Εκτίμηση από τις 500 συνθετικές εγγραφές</span><span><i class="tick"></i>Μέσος όρος δημοσιευμένων εκτιμήσεων</span></div>'
        + svg_hbar(rows, row_h=24, marker=marker) + f'<div class="figcap"><span>Βάση: όσοι δηλώνουν κόμμα · n = {VE["base_n"]}</span><span class="synth">Συνθετικά δεδομένα — Greek Synthetic Research Lab</span></div>'
        + f'<p class="analysis">Η εκτίμηση υπολογίζεται με αναγωγή επί των εγκύρων. Εξαιρούνται οι αναποφάσιστοι, το λευκό/άκυρο, η αποχή και η άρνηση απάντησης, άρα οι αναποφάσιστοι κατανέμονται αναλογικά. Δεν γίνεται καμία άλλη κατανομή ή διόρθωση.</p>'
        + f'<p class="analysis">Τα μερίδια των κομμάτων στο συνθετικό δείγμα έχουν βαθμονομηθεί στον μέσο όρο των δημοσιευμένων εκτιμήσεων Οκτωβρίου 2026 ({esc(polls_txt)}). Οι αποκλίσεις από τη γραμμή αναφοράς οφείλονται στην τυχαία κλήρωση 500 εγγραφών. Η μεγαλύτερη είναι {f1(max(abs(d["diff"]) for d in D["voteEstimateDeviation"]))} μονάδες. Αποτέλεσμα: ΠΑΣΟΚ {f1(est[3])}% έναντι μέσου όρου {f1(avgp[3])}%.</p>'
        + '<p class="note">Δεν εμφανίζεται περιθώριο σφάλματος: τα 500 πρόσωπα δεν είναι τυχαίο δείγμα πραγματικού πληθυσμού. Η εκτίμηση δεν είναι πρόβλεψη εκλογικού αποτελέσματος. Εξαιρούνται οι εκτιμήσεις των Metron Analysis και GPO (όροι χρήσης) και της Pulse RC (πολιτική του Lab).</p>')
page(body, sec=("Εκτίμηση ψήφου", "estimate"), anchor="estimate")

# ================================================================== ΒΕΒΑΙΟΤΗΤΑ / ΜΕΤΑΒΛΗΤΟΤΗΤΑ
sh = sec_head("05", "Βεβαιότητα και μεταβλητότητα ψήφου", "Πόσο σταθερές είναι οι επιλογές και πού κινούνται")
it = "Q7"
cert = []
for g, x in CT[it]["Πρόθεση ψήφου"].items():
    if x["n"] >= 30:
        cert.append((f"{SHORT_GROUP.get(g, g)} (n={x['n']})", [x["pct"].get(str(c), 0) for c in (1, 2, 3, 4, 99)]))
ordinal_page("Q7", cols_lbl=("Βέβαιοι", "Όχι βέβαιοι"), sec=("Βεβαιότητα και μεταβλητότητα", "volatility"), sec_html=sh,
             text=f"Το {f0(pct('Q7', [1]))}% όσων δηλώνουν κόμμα είναι απόλυτα βέβαιο για την επιλογή του και το {f0(pct('Q7', [1, 2]))}% συνολικά βέβαιο. Απόλυτα βέβαιοι: ΝΔ {f0(ct_val('Q7', 'Πρόθεση ψήφου', 'ΝΔ', [1])[0])}%, ΕΛ.Α.Σ. {f0(ct_val('Q7', 'Πρόθεση ψήφου', 'ΕΛ.Α.Σ.', [1])[0])}%, ΠΑΣΟΚ {f0(ct_val('Q7', 'Πρόθεση ψήφου', 'ΠΑΣΟΚ', [1])[0])}%.",
             extra=f'<div class="sub">Βεβαιότητα ανά κόμμα</div>{svg_stack(cert, [(lab("Q7", c), col) for c, col in zip((1, 2, 3, 4, 99), DIV + [DK])], row_h=24, show_legend=False)}', skip=("vote",))
ordinal_page("Q10", cols_lbl=("Πιθανό να αλλάξουν", "Μη πιθανό"), palette=list(reversed(DIV)),
             text=f"Το {f0(pct('Q10', [1, 2]))}% όσων δηλώνουν κόμμα θεωρεί πιθανό να αλλάξει επιλογή. Στους ψηφοφόρους του ΠΑΣΟΚ το ποσοστό είναι {f0(ct_val('Q10', 'Πρόθεση ψήφου', 'ΠΑΣΟΚ', [1, 2])[0])}%.")
nominal_page("Q9", party=True, multi_note="Έως δύο απαντήσεις· δεν περιλαμβάνεται το κόμμα της Q6. Τα ποσοστά αθροίζουν άνω του 100%.",
             text=f"Το {f0(pct('Q9', [97]))}% δεν βλέπει άλλη εκλογική επιλογή. Ως δεύτερη επιλογή προηγείται η ΝΔ ({f0(pct('Q9', [1]))}%), ακολουθούν η ΕΛ.Α.Σ. ({f0(pct('Q9', [2]))}%) και το ΠΑΣΟΚ ({f0(pct('Q9', [3]))}%).")

it = "Q8"
rows = [(r["label"], r["pct"], pcolor(r["label"])) for r in S[it]["results"]]
flow = []
for g, x in CT["Q6"]["Ψήφος 2023"].items():
    flow.append((f"{SHORT_GROUP.get(g, g)} (n={x['n']})", [x["pct"].get(str(c), 0) for c in (1, 2, 3)] + [sum(x["pct"].get(str(c), 0) for c in range(4, 16)), sum(x["pct"].get(str(c), 0) for c in (90, 91, 92, 99))]))
fcats = [("ΝΔ", PARTY["ΝΔ"]), ("ΕΛ.Α.Σ.", PARTY["ΕΛ.Α.Σ."]), ("ΠΑΣΟΚ", GREEN), ("Άλλα κόμματα", "#9e9e9e"), ("Χωρίς κομματική επιλογή", "#dcdcdc")]
pas_ret = ct_val("Q6", "Ψήφος 2023", "ΠΑΣΟΚ", [3])[0]
body = (qhead(it) + svg_hbar(rows, row_h=22) + figcap(it)
        + f'<div class="sub">Εκλογικές ροές: πρόθεση ψήφου 2026 ανά ψήφο 2023 <span class="badge cB">Μοντελοποιημένη προσομοίωση</span></div>' + svg_stack(flow, fcats, row_h=26)
        + f'<div class="figcap"><span>Βάση: σύνολο ανά ομάδα ψήφου 2023</span><span class="synth">Συνθετικά δεδομένα — Greek Synthetic Research Lab</span></div>'
        + f'<p class="analysis">Η ανάκληση ψήφου έχει σταθμιστεί στο επίσημο αποτέλεσμα του Ιουνίου 2023. Στις ροές, το ΠΑΣΟΚ διατηρεί το {f0(pas_ret)}% των ψηφοφόρων του 2023 και αντλεί {f0(ct_val("Q6", "Ψήφος 2023", "ΣΥΡΙΖΑ", [3])[0])}% από τους ψηφοφόρους του ΣΥΡΙΖΑ του 2023. Η ΕΛ.Α.Σ. αντλεί από τους ίδιους ψηφοφόρους το {f0(ct_val("Q6", "Ψήφος 2023", "ΣΥΡΙΖΑ", [2])[0])}%. Οι ροές προκύπτουν από τη δομή του μοντέλου εκλογικής επιλογής του Lab, βαθμονομημένη στα σημερινά μερίδια. Δεν είναι μετρημένες μετακινήσεις.</p>')
page(body)

# ================================================================== ΚΥΒΕΡΝΗΣΗ
sh = sec_head("06", "Αξιολόγηση κυβέρνησης και αντιπολίτευσης")
ordinal_page("Q3", sec=("Αξιολόγηση κυβέρνησης", "gov"), sec_html=sh,
             text=f"Η αποτίμηση του κυβερνητικού έργου είναι κατά πλειοψηφία αρνητική ({f0(pct('Q3', [3, 4]))}%), με το {f0(pct('Q3', [4]))}% να το αξιολογεί «πολύ αρνητικά». Θετική αποτίμηση καταγράφεται κυρίως στους ψηφοφόρους της ΝΔ ({f0(ct_val('Q3', 'Πρόθεση ψήφου', 'ΝΔ', [1, 2])[0])}%).")
ordinal_page("Q4", cols_lbl=("Ικανοποιημένοι", "Μη ικανοποιημένοι"),
             text=f"Η αντιπολίτευση δεν ωφελείται από την κυβερνητική φθορά: μόλις {f0(pct('Q4', [1, 2]))}% δηλώνει ικανοποιημένο από τη λειτουργία της, ενώ το {f0(pct('Q4', [4]))}% «καθόλου».")

# ================================================================== ΕΙΚΟΝΑ ΠΑΣΟΚ
sh = sec_head("07", "Εικόνα ΠΑΣΟΚ", "Συνολική αποτίμηση, αξιοπιστία ανά πεδίο πολιτικής και παρουσία", pasok=True)
score_rows = [(pos_items[k], pos_vals[k], GREEN) for k in pos_items]
vote_groups = [g for g, x in pasok_ct.items() if x["n"] >= 30]
mat = "".join(f'<tr><td class="g">{esc(pos_items[k])}</td><td><b>{f1(pos_vals[k])}</b></td>' + "".join(
    f'<td style="background:rgba(11,138,62,{0.05 + 0.5 * ct_val(k, "Πρόθεση ψήφου", g, [1, 2])[0] / 100:.2f})">{f1(ct_val(k, "Πρόθεση ψήφου", g, [1, 2])[0])}</td>' for g in vote_groups) + "</tr>" for k in pos_items)
body = (sh + '<div class="scenario-box"><b>Υποθετικό σενάριο επίδειξης Σ1.</b> Για την εικόνα του ΠΑΣΟΚ δεν υπάρχουν πρόσφατα δημόσια δεδομένα της ίδιας ερώτησης. Τα ποσοστά αυτής της ενότητας είναι δηλωμένοι στόχοι του σεναρίου, που συνδέονται με την ψήφο και την ιδεολογία κάθε συνθετικού ερωτώμενου. Δείχνουν τη μορφή της ανάλυσης, όχι μετρημένη ή προβλεπόμενη γνώμη. Εξαίρεση: η Q12 έχει συγγενή δημόσια άγκυρα (Interview, Οκτ. 2026).</div>'
        + '<h3 class="pg-title">Πίνακας αποτελεσμάτων ΠΑΣΟΚ</h3><p class="wording">Θετικές απαντήσεις (πολύ + αρκετά / ναι + μάλλον ναι) σε κάθε διάσταση.</p>'
        + svg_hbar(score_rows, big=True, label_w=270)
        + '<div class="figcap"><span>Βάση: σύνολο · n = 500</span><span class="synth">Συνθετικά δεδομένα — Greek Synthetic Research Lab</span></div>'
        + f'<div class="sub">Θετικές απαντήσεις ανά πρόθεση ψήφου (%)</div><div class="tw"><table class="ct mat"><thead><tr><th class="g">Διάσταση</th><th>Σύνολο</th>{"".join(f"<th>{esc(SHORT_GROUP.get(g, g))}</th>" for g in vote_groups)}</tr></thead><tbody>{mat}</tbody></table></div>'
        + f'<p class="analysis">Στο σενάριο Σ1, η εικόνα του ΠΑΣΟΚ έχει σαφές «ταβάνι»: σε καμία διάσταση οι θετικές απαντήσεις δεν ξεπερνούν το {f0(max(pos_vals.values()))}%. Ισχυρότερο πεδίο είναι η {esc(pos_items[best_dim].split(": ")[1])} ({f0(pos_vals[best_dim])}%) και ασθενέστερο η {esc(pos_items[worst_dim].split(": ")[1])} ({f0(pos_vals[worst_dim])}%). Η εικόνα στηρίζεται κυρίως στους δικούς του ψηφοφόρους. Στους ψηφοφόρους της ΕΛ.Α.Σ. η θετική εικόνα φτάνει το {f0(ct_val("Q11", "Πρόθεση ψήφου", "ΕΛ.Α.Σ.", [1, 2])[0])}%, πάνω από τη ΝΔ ({f0(ct_val("Q11", "Πρόθεση ψήφου", "ΝΔ", [1, 2])[0])}%).</p>')
page(body, "pasok", sec=("Εικόνα ΠΑΣΟΚ", "pasok"), anchor="pasok")
for k, lbl in [("Q11", ("Θετικά", "Αρνητικά")), ("Q12", ("Ναι / μάλλον ναι", "Όχι / μάλλον όχι")), ("Q13", ("Πολύ / αρκετά", "Λίγο / καθόλου")), ("Q14", ("Πολύ / αρκετά", "Λίγο / καθόλου")),
               ("Q15", ("Πολύ / αρκετά", "Λίγο / καθόλου")), ("Q16", ("Ναι / μάλλον ναι", "Όχι / μάλλον όχι")), ("Q17", ("Ισχυρή", "Αδύναμη"))]:
    ordinal_page(k, cols_lbl=lbl, palette=DIV_G, pasok=True,
                 text=f"«{lbl[0]}»: {f0(pct(k, [1, 2]))}% · «{lbl[1]}»: {f0(pct(k, [3, 4]))}% · ΔΓ/ΔΑ: {f0(pct(k, [99]))}%. Στους ψηφοφόρους του ΠΑΣΟΚ, «{lbl[0]}» απαντά το {f0(ct_val(k, 'Πρόθεση ψήφου', 'ΠΑΣΟΚ', [1, 2])[0])}%.")

# ================================================================== ΑΝΔΡΟΥΛΑΚΗΣ
sh = sec_head("08", "Αξιολόγηση Νίκου Ανδρουλάκη", pasok=True)
ordinal_page("Q18", cols_lbl=("Θετική γνώμη", "Αρνητική γνώμη"), palette=DIV_G, pasok=True, sec=("Νίκος Ανδρουλάκης", "androulakis"), sec_html=sh,
             text=f"Θετική γνώμη για τον Ν. Ανδρουλάκη έχει το {f0(pct('Q18', [1, 2]))}% και αρνητική το {f0(pct('Q18', [3, 4]))}%, ενώ {f0(pct('Q18', [98]))}% δηλώνει ότι δεν τον γνωρίζει επαρκώς. Η εικόνα του αρχηγού κινείται κοντά σε εκείνη του κόμματος ({f0(pct('Q11', [1, 2]))}% θετική για το ΠΑΣΟΚ).")

# ================================================================== ΑΡΧΗΓΟΙ
sh = sec_head("09", "Συγκριτική αξιολόγηση πολιτικών αρχηγών")
items = [("Ν. Ανδρουλάκης (ΠΑΣΟΚ)", "Q18")] + [(lbl, it) for it, lbl in QD["Q19"]["items"]]
items.sort(key=lambda x: -pct(x[1], [1, 2]))
cats = [("Πολύ θετική", DIV[0]), ("Μάλλον θετική", DIV[1]), ("Μάλλον αρνητική", DIV[2]), ("Πολύ αρνητική", DIV[3]), ("Δεν γνωρίζω επαρκώς", SPECIAL), ("ΔΓ/ΔΑ", DK)]
rows = [(l, [pct(i, [c]) for c in (1, 2, 3, 4, 98, 99)]) for l, i in items]
tbl = "".join(f'<tr><td class="g">{esc(l)}</td><td><b>{f1(pct(i, [1, 2]))}</b></td><td>{f1(pct(i, [3, 4]))}</td><td>{f1(pct(i, [1, 2]) - pct(i, [3, 4]))}</td>'
              f'<td>{f1(ct_val(i, "Πρόθεση ψήφου", "Χωρίς κομματική επιλογή", [1, 2])[0])}</td></tr>' for l, i in items)
body = (sh + '<div class="qhead"><div class="qid">Q19 + Q18</div><h3>Γνώμη για τους πολιτικούς αρχηγούς</h3><p class="wording">«Ποια είναι η γνώμη σας για καθέναν από τους παρακάτω πολιτικούς αρχηγούς;»</p><span class="badge cC">Υποθετικό σενάριο επίδειξης · σενάριο Σ1</span></div>'
        + svg_stack(rows, cats, row_h=34, label_w=260) + '<div class="figcap"><span>Βάση: σύνολο · n = 500</span><span class="synth">Συνθετικά δεδομένα — Greek Synthetic Research Lab</span></div>'
        + f'<table class="ct mat"><thead><tr><th class="g">Αρχηγός</th><th>Θετική</th><th>Αρνητική</th><th>Ισοζύγιο</th><th>Θετική στους χωρίς κομμ. επιλογή</th></tr></thead><tbody>{tbl}</tbody></table>'
        + f'<p class="analysis">Στο σενάριο Σ1 κανένας αρχηγός δεν έχει θετικό ισοζύγιο. Την υψηλότερη θετική γνώμη συγκεντρώνουν: {esc(items[0][0])} ({f0(pct(items[0][1], [1, 2]))}%) και {esc(items[1][0])} ({f0(pct(items[1][1], [1, 2]))}%). Ο Ν. Ανδρουλάκης καταλαμβάνει τη θέση {[i for _, i in items].index("Q18") + 1} από τις {len(items)}. Στους ψηφοφόρους χωρίς κομματική επιλογή, η θετική του γνώμη είναι {f0(ct_val("Q18", "Πρόθεση ψήφου", "Χωρίς κομματική επιλογή", [1, 2])[0])}%.</p>')
page(body, sec=("Πολιτικοί αρχηγοί", "leaders"), anchor="leaders")
for it, _ in QD["Q19"]["items"]:
    pass
nominal_page("Q20", party=True, kpi=[(f1(pct("Q20", [1])) + "%", "Κ. Μητσοτάκης", PARTY["ΝΔ"]), (f1(pct("Q20", [2])) + "%", "Α. Τσίπρας", PARTY["ΕΛ.Α.Σ."]), (f1(pct("Q20", [3])) + "%", "Ν. Ανδρουλάκης", GREEN), (f1(pct("Q20", [97])) + "%", "Κανένας", "#555")],
             text=f"Ο Κ. Μητσοτάκης προηγείται ως καταλληλότερος για πρωθυπουργός ({f1(pct('Q20', [1]))}%), με την απάντηση «κανένας» ({f1(pct('Q20', [97]))}%) δεύτερη. Ακολουθούν ο Α. Τσίπρας ({f1(pct('Q20', [2]))}%) και ο Ν. Ανδρουλάκης ({f1(pct('Q20', [3]))}%), σε απόσταση {f1(pct('Q20', [2]) - pct('Q20', [3]))} μονάδων. Η ερώτηση ακολουθεί τη δομή της πηγής-άγκυρας (χωρίς ΔΓ/ΔΑ).")
nominal_page("Q21", multi_note="Έως δύο απαντήσεις· τα ποσοστά αθροίζουν περίπου 200%.",
             text=f"Η εντιμότητα είναι το χαρακτηριστικό που ζητείται περισσότερο ({f0(pct('Q21', [1]))}%), με μεγάλη απόσταση από την επαφή με την κοινωνία ({f0(pct('Q21', [2]))}%) και την αποτελεσματικότητα ({f0(pct('Q21', [3]))}%).")
ordinal_page("Q22", cols_lbl=("Σημαντικό", "Μη σημαντικό"), palette=SEQ,
             text=f"Για το {f0(pct('Q22', [1, 2]))}% το πρόσωπο του αρχηγού είναι σημαντικό στην επιλογή κόμματος, και για το {f0(pct('Q22', [1]))}% «πολύ σημαντικό».")

# ================================================================== ΠΡΟΤΕΡΑΙΟΤΗΤΕΣ
sh = sec_head("10", "Πολιτικές προτεραιότητες", "Ατζέντα, οικονομική πίεση, ακρίβεια, στέγαση και θεσμοί")
nominal_page("Q23", sec=("Πολιτικές προτεραιότητες", "priorities"), sec_html=sh,
             text=f"Η ακρίβεια είναι η πρώτη προτεραιότητα για το {f0(pct('Q23', [1]))}%. Ακολουθούν η εξωτερική πολιτική και άμυνα ({f0(pct('Q23', [3]))}%) και η οικονομία και ανάπτυξη ({f0(pct('Q23', [2]))}%).")
it = "Q24"
rows = [(r["label"], r["pct"], {1: "#1d5f9e", 2: "#bdbdbd", 3: "#c2423a", 99: SPECIAL}[r["code"]]) for r in S[it]["results"] if not (r["code"] == 99 and r["pct"] == 0)]
body = (qhead(it) + kpis([(f1(pct(it, [3])) + "%", "Χειρότερη", "#c2423a"), (f1(pct(it, [2])) + "%", "Ίδια", "#777"), (f1(pct(it, [1])) + "%", "Καλύτερη", "#1d5f9e")])
        + svg_hbar(rows, big=True) + figcap(it)
        + f'<p class="analysis">Σχεδόν οι μισοί ({f0(pct(it, [3]))}%) βλέπουν επιδείνωση της οικονομικής τους κατάστασης μέσα στον τελευταίο χρόνο, και μόλις {f0(pct(it, [1]))}% βελτίωση. {insight(it, [3], "Χειρότερη")}</p>'
        + ct_table(it, [("Χειρότερη", [3]), ("Καλύτερη", [1])]) + ct_full(it))
page(body)
nominal_page("Q25", text=f"Για την αντιμετώπιση της ακρίβειας προκρίνεται η μείωση του ΦΠΑ στα βασικά αγαθά ({f0(pct('Q25', [1]))}%). Ακολουθούν οι αυξήσεις μισθών και συντάξεων ({f0(pct('Q25', [2]))}%) και ο έλεγχος της αισχροκέρδειας ({f0(pct('Q25', [3]))}%).")
ordinal_page("Q26", cols_lbl=("Σημαντικό", "Μη σημαντικό"), palette=SEQ,
             text=f"Το στεγαστικό θεωρείται σημαντικό πρόβλημα από το {f0(pct('Q26', [1, 2]))}%, και «πολύ σημαντικό» από το {f0(pct('Q26', [1]))}%.")
items27 = QD["Q27"]["items"]
rows = sorted([(lab_, [pct(i, [c]) for c in (1, 2, 99)]) for i, lab_ in items27], key=lambda r: -r[1][0])
tbl = "".join(f'<tr><td class="g">{esc(l)}</td>' + "".join(f'<td>{f1(ct_val(i, d, g, [1])[0])}</td>' for d, g in [("Πρόθεση ψήφου", "ΝΔ"), ("Πρόθεση ψήφου", "ΕΛ.Α.Σ."), ("Πρόθεση ψήφου", "ΠΑΣΟΚ"), ("Ηλικία", "17–34"), ("Ηλικία", "55+")]) + "</tr>" for i, l in items27)
body = ('<div class="qhead"><div class="qid">Q27</div><h3>Εμπιστοσύνη στους δημόσιους θεσμούς</h3><p class="wording">«' + esc(QD["Q27"]["text"]) + '»</p><span class="badge cA">Τεκμηριωμένη εκτίμηση · άγκυρα: Eurobarometer 105 (άνοιξη 2026)</span></div>'
        + svg_stack(rows, [("Τείνω να εμπιστεύομαι", "#1d5f9e"), ("Τείνω να μην εμπιστεύομαι", "#c2423a"), ("ΔΓ/ΔΑ", DK)], row_h=34)
        + '<div class="figcap"><span>Βάση: σύνολο · n = 500</span><span class="synth">Συνθετικά δεδομένα — Greek Synthetic Research Lab</span></div>'
        + f'<div class="sub">«Τείνω να εμπιστεύομαι» ανά ομάδα (%)</div><table class="ct mat"><thead><tr><th class="g">Θεσμός</th><th>ΝΔ</th><th>ΕΛ.Α.Σ.</th><th>ΠΑΣΟΚ</th><th>17–34</th><th>55+</th></tr></thead><tbody>{tbl}</tbody></table>'
        + f'<p class="analysis">Η εμπιστοσύνη ακολουθεί τη γνωστή ελληνική ιεράρχηση: η αστυνομία ({f0(pct("Q27_5", [1]))}%) και η δικαιοσύνη ({f0(pct("Q27_4", [1]))}%) προηγούνται. Η αυτοδιοίκηση ({f0(pct("Q27_6", [1]))}%), η Βουλή ({f0(pct("Q27_2", [1]))}%) και η κυβέρνηση ({f0(pct("Q27_1", [1]))}%) ακολουθούν, ενώ τα πολιτικά κόμματα είναι τελευταία ({f0(pct("Q27_3", [1]))}%). Η κομματική διαφοροποίηση είναι έντονη για την κυβέρνηση και τη Βουλή.</p>')
page(body)

# ================================================================== ΕΚΛΟΓΙΚΗ ΔΥΝΑΜΙΚΗ
sh = sec_head("11", "Εκλογική δυναμική ΠΑΣΟΚ", "Πιθανότητα ψήφου, δεξαμενή και κρίσιμοι παράγοντες", pasok=True)
it = "Q28"
vals = [pct(it, [c]) for c in range(11)]
body = (sh + qhead(it)
        + kpis([(f1(S[it]["mean"]).replace(",0", ""), "Μέσος όρος (0–10)", GREEN), (f1(pct(it, [7, 8, 9, 10])) + "%", "Πιθανότητα 7–10", GREEN), (f1(pct(it, [0])) + "%", "Μηδενική πιθανότητα", "#c2423a"), (f1(S[it]["mean_pasok_voters"]), "Μέσος όρος ψηφοφόρων ΠΑΣΟΚ", GREEN)])
        + svg_columns(vals, [str(c) for c in range(11)], h=150, colors=["#c2423a"] + ["#d9b9b5"] * 4 + ["#c9c9c9"] * 2 + ["#79c393"] * 3 + [GREEN]) + figcap(it)
        + f'<p class="analysis">Η κατανομή είναι πολωμένη. Το {f0(pct(it, [0]))}% αποκλείει πλήρως την ψήφο στο ΠΑΣΟΚ, ενώ το {f0(pct(it, [7, 8, 9, 10]))}% δηλώνει πιθανότητα 7–10. Ο μέσος όρος είναι {f1(S[it]["mean"])} στο σύνολο και {f1(S[it]["mean_pasok_voters"])} στους σημερινούς ψηφοφόρους του κόμματος. {insight(it, [7, 8, 9, 10], "7–10")}</p>'
        + ct_table(it, [("7–10", [7, 8, 9, 10]), ("0", [0])], skip_dims=()) + ct_full(it))
page(body, "pasok", sec=("Εκλογική δυναμική ΠΑΣΟΚ", "dynamics"), anchor="dynamics")

seg_rows = [(k, v, c) for (k, v), c in zip(seg_share.items(), [GREEN, "#79c393", "#c9c9c9", "#e2b4ae", "#c2423a", SPECIAL])]
pf = sorted(pot_from.items(), key=lambda kv: -kv[1])
pf_rows = [(k, v / pot_tot * 100, pcolor(k) if k in PARTY else ("#757575" if k == "Αναποφάσιστος/η" else "#9e9e9e")) for k, v in pf]


def profile(rows_):
    tot = wsum(rows_) or 1
    out = {}
    for key, labels in [("D2", {"1": "17–24", "2": "25–34", "3": "35–44", "4": "45–54", "5": "55–64", "6": "65+"}), ("D3", {"1": "Έως υποχρεωτική", "2": "Μέση", "3": "Ανώτατη"}), ("D1", {"1": "Άνδρες", "2": "Γυναίκες"})]:
        for c, l in labels.items():
            out[l] = sum(float(r["weight"]) for r in rows_ if r[key] == c) / tot * 100
    return out


prof_all = profile(RESP)
prof_core = profile(seg["Πυρήνας: δηλώνουν ΠΑΣΟΚ"])
prof_pot = profile(pot)
ptab = "".join(f'<tr><td class="g">{esc(k)}</td><td>{f1(prof_all[k])}</td><td>{f1(prof_core[k])}</td><td>{f1(prof_pot[k])}</td></tr>' for k in prof_all)
body = ('<h3 class="pg-title">Τμηματοποίηση δυναμικού ΠΑΣΟΚ</h3><p class="wording">Συνδυασμός πρόθεσης ψήφου (Q6) και πιθανότητας ψήφου ΠΑΣΟΚ (Q28). Ποσοστά επί του συνόλου του δείγματος.</p><span class="badge cC">Υποθετικό σενάριο επίδειξης · σενάριο Σ1</span>'
        + svg_hbar(seg_rows, big=True, label_w=290) + '<div class="figcap"><span>Βάση: σύνολο · n = 500</span><span class="synth">Συνθετικά δεδομένα — Greek Synthetic Research Lab</span></div>'
        + f'<div class="sub">Από πού προέρχονται οι «δυνητικοί» (n = {len(pot)})</div>' + svg_hbar(pf_rows, label_w=290, row_h=24)
        + f'<div class="sub">Προφίλ: σύνολο, πυρήνας και δυνητικοί (%)</div><table class="ct mat"><thead><tr><th class="g">Χαρακτηριστικό</th><th>Σύνολο</th><th>Πυρήνας (n={len(seg["Πυρήνας: δηλώνουν ΠΑΣΟΚ"])})</th><th>Δυνητικοί (n={len(pot)})</th></tr></thead><tbody>{ptab}</tbody></table>'
        + f'<p class="analysis">Στο σενάριο Σ1, ο πυρήνας του ΠΑΣΟΚ ({f1(seg_share["Πυρήνας: δηλώνουν ΠΑΣΟΚ"])}% του δείγματος) συνοδεύεται από μια δεξαμενή δυνητικών ψηφοφόρων ({f1(seg_share["Δυνητικοί: 7–10, δεν δηλώνουν ΠΑΣΟΚ"])}%). Οι δυνητικοί προέρχονται κυρίως από ψηφοφόρους των κατηγοριών «{esc(pf[0][0])}» ({f0(pf[0][1] / pot_tot * 100)}%) και «{esc(pf[1][0])}» ({f0(pf[1][1] / pot_tot * 100)}%). Οι βάσεις είναι μικρές (n = {len(pot)}). Η ανάλυση επιδεικνύει τη μέθοδο και δεν εκτιμά πραγματικό δυναμικό.</p>')
page(body, "pasok")
nominal_page("Q29", sort=False, text=f"Οι τρεις παράγοντες έχουν σχεδόν ίσο βάρος: πρόγραμμα {f0(pct('Q29', [1]))}%, ιδεολογική ταύτιση {f0(pct('Q29', [2]))}%, υποψήφιος πρωθυπουργός {f0(pct('Q29', [3]))}%. Η εικόνα αρχηγού και η προγραμματική πρόταση χρειάζονται εξίσου.")
ordinal_page("Q30", cols_lbl=("Ικανοποιημένοι", "Μη ικανοποιημένοι"),
             text=f"Μόλις {f0(pct('Q30', [1, 2]))}% είναι ικανοποιημένο από τις διαθέσιμες πολιτικές επιλογές, ενώ το {f0(pct('Q30', [4]))}% «καθόλου». Αυτό το κενό πολιτικής εκπροσώπησης αφορά άμεσα όλα τα κόμματα της αντιπολίτευσης.")

# ================================================================== ΔΗΜΟΓΡΑΦΙΚΕΣ ΑΝΑΛΥΣΕΙΣ
sh = sec_head("12", "Δημογραφικές αναλύσεις", "Πρόθεση ψήφου ανά κοινωνική ομάδα και σύνθεση του δείγματος")
VCOLS = [(1, "ΝΔ"), (2, "ΕΛ.Α.Σ."), (3, "ΠΑΣΟΚ"), (4, "ΕΛ"), (5, "ΚΚΕ"), (6, "Πλεύση"), (92, "Αναποφ.")]
rows_html = []
for d in ["Φύλο", "Ηλικία", "Εκπαίδευση", "Περιοχή", "Τύπος περιοχής", "Οικονομική κατάσταση"]:
    rows_html.append(f'<tr class="dim"><td colspan="{len(VCOLS) + 2}">{esc(d)}</td></tr>')
    for g, x in CT["Q6"][d].items():
        cells = []
        for c, _ in VCOLS:
            v = x["pct"].get(str(c), 0)
            col = "11,138,62" if c == 3 else "36,80,126"
            cells.append(f'<td style="background:rgba({col},{0.04 + v / 45:.2f})">{f1(v)}</td>')
        rows_html.append(f'<tr class="{"small" if x["n"] < 50 else ""}"><td class="g">{esc(SHORT_GROUP.get(g, g))}{"†" if x["n"] < 50 else ""}</td><td class="n">{x["n"]}</td>{"".join(cells)}</tr>')
tot_cells = "".join(f"<td><b>{f1(pct('Q6', [c]))}</b></td>" for c, _ in VCOLS)
body = (sh + '<h3 class="pg-title">Πρόθεση ψήφου ανά κοινωνική ομάδα</h3><span class="badge cB">Μοντελοποιημένη προσομοίωση · συνολικά μερίδια: τεκμηριωμένα</span>'
        + f'<table class="ct mat big"><thead><tr><th class="g">Ομάδα</th><th class="n">n</th>{"".join(f"<th>{esc(l)}</th>" for _, l in VCOLS)}</tr></thead><tbody><tr class="tot"><td class="g">Σύνολο</td><td class="n">500</td>{tot_cells}</tr>{"".join(rows_html)}</tbody></table>'
        + '<div class="figcap"><span>Βάση: σύνολο · % πρόθεσης ψήφου (όχι εκτίμηση)</span><span class="synth">Συνθετικά δεδομένα — Greek Synthetic Research Lab</span></div>'
        + f'<p class="analysis">Τα συνολικά μερίδια έχουν άγκυρα σε δημόσια δεδομένα. Η κατανομή τους στις κοινωνικές ομάδες προκύπτει από τον βαθμονομημένο πληθυσμό και το μοντέλο εκλογικής επιλογής του Lab (ψήφος 2023, ιδεολογική θέση, δημογραφικά). Το ΠΑΣΟΚ καταγράφει {f1(ct_val("Q6", "Ηλικία", "55+", [3])[0])}% στους 55+ και {f1(ct_val("Q6", "Ηλικία", "17–34", [3])[0])}% στους 17–34. Ως μοντελοποιημένη δομή, οι διαφορές μεταξύ ομάδων είναι ενδεικτικές.</p>')
page(body, sec=("Δημογραφικές αναλύσεις", "demo"), anchor="demo")


def comp(key, labels):
    out = []
    for c, l in labels:
        uw = sum(1 for r in RESP if r[key] == str(c)) / len(RESP) * 100
        wt = sum(float(r["weight"]) for r in RESP if r[key] == str(c)) / W * 100
        pw = sum(float(r["weight"]) for r in pas_rows if r[key] == str(c)) / (wsum(pas_rows) or 1) * 100
        out.append(f'<tr><td class="g">{esc(l)}</td><td>{f1(uw)}</td><td>{f1(wt)}</td><td>{f1(pw)}</td></tr>')
    return "".join(out)


comp_tabs = []
for keys in (["D1", "D2", "D3", "D6"], ["D4", "D5", "D7"]):
    rows_ = "".join(f'<tr class="dim"><td colspan="4">{esc(QD[key]["short"])}</td></tr>' + comp(key, QD[key]["options"]) for key in keys)
    comp_tabs.append(f'<table class="ct mat comp"><thead><tr><th class="g">Χαρακτηριστικό</th><th>Μη σταθμ.</th><th>Σταθμ.</th><th>ΠΑΣΟΚ</th></tr></thead><tbody>{rows_}</tbody></table>')
body = ('<h3 class="pg-title">Σύνθεση του συνθετικού δείγματος και προφίλ ψηφοφόρων ΠΑΣΟΚ</h3>'
        + f'<p class="wording">Σύνθεση των 500 εγγραφών, μη σταθμισμένη και σταθμισμένη, και σύνθεση όσων δηλώνουν ΠΑΣΟΚ (n = {len(pas_rows)}, σταθμισμένα). Τιμές σε %.</p>'
        + f'<div class="ctwrap">{"".join(comp_tabs)}</div>'
        + '<div class="figcap"><span>Βάση: σύνολο · n = 500</span><span class="synth">Συνθετικά δεδομένα — Greek Synthetic Research Lab</span></div>'
        + '<p class="note">Τα δημογραφικά προέρχονται από τον βαθμονομημένο πληθυσμό του Lab (GLOPOP-S + Eurostat/ΕΛΣΤΑΤ 2025). Η οικονομική κατάσταση και η απασχόληση προέρχονται από τις άγκυρες PIE, εκτιμημένες σε πραγματικά μικροδεδομένα. Η στάθμιση γίνεται σε ηλικία×φύλο, περιφέρεια, εκπαίδευση και ψήφο 2023.</p>')
page(body)

# ================================================================== ΣΥΜΠΕΡΑΣΜΑΤΑ
body = (sec_head("13", "Συγκεντρωτικά συμπεράσματα")
        + f'''<div class="concl"><h4 class="exec-h cA">Τι δείχνουν τα τεκμηριωμένα στοιχεία</h4><ol>
<li><b>Κλίμα δυσαρέσκειας χωρίς εναλλακτική.</b> Το {f0(pct("Q1", [2]))}% βλέπει λάθος κατεύθυνση, αλλά η εμπιστοσύνη στα κόμματα ({f0(pct("Q27_3", [1]))}%) και η «κανένας» για πρωθυπουργό ({f0(pct("Q20", [97]))}%) δείχνουν ότι η δυσαρέσκεια δεν κατευθύνεται αυτόματα στην αντιπολίτευση.</li>
<li><b>Τριπολικός ανταγωνισμός στην κεντροαριστερά και απέναντι στη ΝΔ.</b> Με εκτίμηση {f1(est[3])}% έναντι {f1(est[2])}% της ΕΛ.Α.Σ., η δεύτερη θέση είναι ανοιχτή. Η απόσταση είναι μικρότερη από τη διαφορά που προκαλούν οι αναποφάσιστοι ({f1(pct("Q6", [92]))}% του συνόλου).</li>
<li><b>Η ακρίβεια ορίζει την ατζέντα.</b> Είναι το κυρίαρχο πρόβλημα ({f0(pct("Q2", [1]))}%) και η πρώτη προτεραιότητα ({f0(pct("Q23", [1]))}%), με το {f0(pct("Q24", [3]))}% να βιώνει επιδείνωση. Κάθε στρατηγική επικοινωνίας περνά από εδώ.</li>
<li><b>Ηγεσία και πρόγραμμα μετρούν εξίσου.</b> Ο καθοριστικός παράγοντας μοιράζεται σε τρία ίσα μέρη, και η εντιμότητα είναι το ζητούμενο χαρακτηριστικό ({f0(pct("Q21", [1]))}%).</li></ol>
<h4 class="exec-h cC">Τι θα σήμαινε το σενάριο Σ1 για το ΠΑΣΟΚ</h4><ol>
<li>Μια εικόνα με «ταβάνι» γύρω στο {f0(pct("Q11", [1, 2]))}% θετικών και σχετικό πλεονέκτημα στη {esc(pos_items[best_dim].split(": ")[1])}. Αυτό είναι πιθανό πεδίο διαφοροποίησης, που πρέπει να ελεγχθεί με πραγματική μέτρηση.</li>
<li>Δεξαμενή δυνητικών ψηφοφόρων περίπου {f0(seg_share["Δυνητικοί: 7–10, δεν δηλώνουν ΠΑΣΟΚ"])}% του εκλογικού σώματος, κυρίως από αναποφάσιστους και ψηφοφόρους της ΕΛ.Α.Σ.</li></ol>
<div class="exec-concl"><b>Σύσταση μεθόδου.</b> Για αποφάσεις στρατηγικής, τα ευρήματα των ενοτήτων «Εικόνα ΠΑΣΟΚ», «Ν. Ανδρουλάκης», «Αρχηγοί» και «Εκλογική δυναμική» πρέπει να επιβεβαιωθούν με πραγματική έρευνα πεδίου (ενδεικτικά n ≥ 1.000, CATI/CAWI). Το παρόν συνθετικό εργαλείο είναι κατάλληλο για σχεδιασμό ερωτηματολογίου, προετοιμασία ανάλυσης και σενάρια, όχι για μέτρηση της κοινής γνώμης.</div></div>''')
page(body, sec=("Συμπεράσματα", "conclusions"), anchor="conclusions")

# ================================================================== ΤΕΧΝΙΚΟ ΠΑΡΑΡΤΗΜΑ
M = D["meta"]
srcs = "".join(f'<tr><td class="g">{k}</td><td>{esc(v["label"])}</td><td>{esc(v["publisher"])}</td><td>{esc(v["licence"])}</td></tr>' for k, v in D["sources"].items())
body = (sec_head("Π", "Τεχνικό παράρτημα και μεθοδολογία", "Πώς δημιουργήθηκαν τα δεδομένα, τι τεκμηριώνεται και τι όχι")
        + f'''<div class="appx"><h4>Π.1 Φύση της εργασίας</h4>
<p>Πρόκειται για <b>συνθετική προσομοίωση</b> σε υποθετική ανάθεση. Οι 500 «ερωτώμενοι» είναι συνθετικά πρόσωπα του Greek Synthetic Research Lab και δεν υπάρχουν πραγματικές συνεντεύξεις. Κανένα ποσοστό δεν προήλθε από γλωσσικό μοντέλο: όλα παράγονται από αναπαραγώγιμο κώδικα με σταθερό σπόρο ({M["seed"]}). Το ΠΑΣΟΚ δεν έχει αναθέσει ούτε εγκρίνει την εργασία, και η έκθεση δεν δημοσιεύεται ως δημοσκόπηση (ν. 3603/2007).</p>
<h4>Π.2 Διαδικασία σε πέντε βήματα</h4><ol>
<li><b>Πάνελ του Lab.</b> 500 πρόσωπα επιλέγονται από τον βαθμονομημένο πληθυσμό (GLOPOP-S + Eurostat/ΕΛΣΤΑΤ 2025) με πιθανότητα ανάλογη του βάρους. Κάθε πρόσωπο λαμβάνει από το staged μοντέλο PIE {esc(M["labModel"])} τις «άγκυρές» του: ψήφο 2023, αυτοτοποθέτηση, οικονομική κατάσταση, απασχόληση και ενδιαφέρον για την πολιτική. Οι άγκυρες είναι εκτιμημένες σε πραγματικά ελληνικά μικροδεδομένα. Η προεπιλογή παραγωγής pie-0.2 δεν αλλάζει.</li>
<li><b>Στάθμιση.</b> Raking σε ηλικία×φύλο, περιφέρεια, εκπαίδευση και ανάκληση ψήφου 2023 (επίσημο αποτέλεσμα). Βάρη στο διάστημα [{f1(M["raking"]["min"])}, {f1(M["raking"]["max"])}], επίδραση σχεδίου {f1(M["raking"]["designEffect"]).replace(",", ",")}.</li>
<li><b>Πιθανότητες απάντησης.</b> Για κάθε ερώτηση, κάθε πρόσωπο έχει πιθανότητα για κάθε επιλογή. Αυτή αποτελείται από μια δομή (το μοντέλο εκλογικής επιλογής του Lab ή ρητοί συντελεστές ως προς ψήφο, ιδεολογία και δημογραφικά) και σταθερές που βαθμονομούνται (IPF), ώστε το σταθμισμένο αναμενόμενο αποτέλεσμα να ισούται με τον στόχο της ερώτησης. Όπου η πηγή δίνει διασταυρώσεις (Eurobarometer: φύλο, ηλικία, εκπαίδευση), βαθμονομούνται και αυτές.</li>
<li><b>Κλήρωση</b> μίας απάντησης ανά πρόσωπο και ερώτηση, με κανόνες παράλειψης (Q7, Q9, Q10 μόνο για όσους δηλώνουν κόμμα) και έως δύο απαντήσεις στις Q2, Q9, Q21.</li>
<li><b>Ανάλυση.</b> Όλα τα αποτελέσματα και οι διασταυρώσεις υπολογίζονται από τις ίδιες 500 σταθμισμένες εγγραφές.</li></ol>
<h4>Π.3 Τρεις κλάσεις τεκμηρίωσης</h4>
<table class="ct mat"><thead><tr><th class="g">Κλάση</th><th>Τι σημαίνει</th><th>Ερωτήσεις</th></tr></thead><tbody>
<tr><td class="g"><span class="badge cA">Τεκμηριωμένη εκτίμηση</span></td><td>Ο στόχος προέρχεται από πρόσφατα δημόσια δεδομένα της ίδιας ή πολύ συγγενούς ερώτησης.</td><td>{", ".join(qsort(D["classCounts"]["A"] + D["classCounts"]["A/B"]))}</td></tr>
<tr><td class="g"><span class="badge cB">Μοντελοποιημένη προσομοίωση</span></td><td>Ο στόχος βασίζεται σε συγγενή δημόσια πηγή με δηλωμένη μετατροπή· η δομή είναι μοντέλο.</td><td>{", ".join(qsort(D["classCounts"]["B"]))}</td></tr>
<tr><td class="g"><span class="badge cC">Υποθετικό σενάριο επίδειξης</span></td><td>Δεν υπάρχει πρόσφατη δημόσια μέτρηση. Ο στόχος είναι δηλωμένη παραδοχή του σεναρίου Σ1, όχι πρόβλεψη.</td><td>{", ".join(qsort(D["classCounts"]["C"]))}</td></tr>
</tbody></table>
<p class="note">Οι διασταυρώσεις των ερωτήσεων κλάσης Α είναι τεκμηριωμένες μόνο όπου η πηγή δίνει την αντίστοιχη ανάλυση. Αυτό ισχύει για φύλο, ηλικία και εκπαίδευση στις ερωτήσεις του Eurobarometer. Οι υπόλοιπες διασταυρώσεις είναι μοντελοποιημένες.</p></div>''')
page(body, "appx", sec=("Τεχνικό παράρτημα", "appendix"), anchor="appendix")

ev_rows = []
for it_, sm in S.items():
    if sm["section"] == "Z":
        continue
    c = sm["evidenceClass"]
    ev_rows.append(f'<tr><td class="g">{esc(it_)}</td><td>{esc(sm["short"] + (" — " + sm["itemLabel"] if sm.get("itemLabel") else ""))}</td><td><span class="badge {CLASS_TXT[c][1]}">{c}</span></td><td>{esc(sm.get("source") or ("S5" if it_ == "Q8" else "—"))}</td><td>{esc(trim(sm.get("construct") or "", 110))}</td></tr>')
EVH = '<thead><tr><th class="g">Κωδ.</th><th>Ερώτηση</th><th>Κλάση</th><th>Πηγή</th><th>Σχέση με την πηγή</th></tr></thead>'
half_ev = (len(ev_rows) + 1) // 2
page(f'<div class="appx"><h4>Π.4 Χάρτης τεκμηρίωσης ανά ερώτηση (1/2)</h4><table class="ct mat evmap">{EVH}<tbody>{"".join(ev_rows[:half_ev])}</tbody></table></div>', "appx")
page(f'<div class="appx"><h4>Π.4 Χάρτης τεκμηρίωσης ανά ερώτηση (2/2)</h4><table class="ct mat evmap">{EVH}<tbody>{"".join(ev_rows[half_ev:])}</tbody></table>'
     + '<p class="note">Κλάσεις: A = τεκμηριωμένη εκτίμηση · B = μοντελοποιημένη προσομοίωση · C = υποθετικό σενάριο επίδειξης Σ1. Οι πηγές S1–S6 περιγράφονται στο Π.5.</p></div>', "appx")
SOURCES_HTML = f'<h4>Π.5 Πηγές</h4><table class="ct mat"><thead><tr><th class="g">Κωδ.</th><th>Πηγή</th><th>Φορέας</th><th>Άδεια / χρήση</th></tr></thead><tbody>{srcs}</tbody></table>'

dev = D["anchorDeviation"]
mad = sum(abs(d["diff"]) for d in dev) / len(dev)
mx = max(dev, key=lambda d: abs(d["diff"]))
lab_nv = D["labNoPollsVote"]
KEYL = {"nd": "ΝΔ", "elas": "ΕΛ.Α.Σ.", "pasok": "ΠΑΣΟΚ", "syriza": "ΣΥΡΙΖΑ", "undecided": "Αναποφάσιστοι", "abstain": "Αποχή"}
nv = " · ".join(f"{KEYL[k]} {f1(lab_nv.get(k, 0))}%" for k in ("nd", "syriza", "pasok", "elas", "undecided", "abstain"))
tier_txt = ""
if TIERS:
    from collections import Counter
    cnt = Counter(str(t["tier"]) for t in TIERS["tiers"])
    tier_txt = f"Ο κινητήρας του Lab ({esc(TIERS['model'])}, πολιτική τεκμηρίωσης evidence-1), αν εφαρμοστεί χωρίς χειροκίνητους συνδέσμους, κατατάσσει και τις {len(TIERS['tiers'])} ερωτήσεις/υποερωτήσεις στη <b>Βαθμίδα 5 (αποχή: «δεν εκτιμάται αξιόπιστα»)</b>. Κατανομή: " + ", ".join(f"Βαθμίδα {k}: {v}" for k, v in sorted(cnt.items())) + "."
checks = D["checks"]
nok = sum(c["pass"] for c in checks)
body = (f'''<div class="appx">{SOURCES_HTML}<h4>Π.6 Τι δεν μπορεί να υπολογίσει απευθείας το Lab, και γιατί η βαθμονόμηση</h4>
<p>{tier_txt} Αυτό συμφωνεί με την Phase 7A: σε νέες ελληνικές πολιτικές ερωτήσεις το σύστημα δεν ήταν καλύτερο από μια ομοιόμορφη εικασία, ενώ η πιο πρόσφατη πραγματική μέτρηση ήταν πολύ ακριβέστερη. Γι' αυτό η παρούσα έκθεση αγκυρώνει κάθε δυνατό μέγεθος σε πρόσφατα δημόσια δεδομένα και δηλώνει ρητά τα υπόλοιπα ως σενάριο.</p>
<p>Ενδεικτικά, χωρίς δημοσκοπήσεις το μοντέλο εκλογικής επιλογής του Lab θα έδινε στο ίδιο πάνελ: {nv}. Το μοντέλο αγνοεί, δηλαδή, την άνοδο της ΕΛ.Α.Σ. και την κατάρρευση του ΣΥΡΙΖΑ το 2026. Η δομή του (ψήφος 2023, ιδεολογική απόσταση, γενεαλογία κομμάτων) διατηρείται για τις διασταυρώσεις, αλλά τα επίπεδα βαθμονομούνται στις δημοσιευμένες εκτιμήσεις.</p>
</div>''')
page(body, "appx")
body = (f'''<div class="appx"><h4>Π.7 Έλεγχοι ποιότητας</h4>
<p><b>{nok} από {len(checks)} έλεγχοι πέρασαν.</b> Οι έλεγχοι καλύπτουν:</p>
<ul>
<li>500 μοναδικές εγγραφές·</li>
<li>άθροισμα 100% σε κάθε ερώτηση με αμοιβαία αποκλειόμενες απαντήσεις·</li>
<li>έως δύο αναφορές, χωρίς κανονικοποίηση, στις ερωτήσεις πολλαπλής επιλογής·</li>
<li>κανόνες παράλειψης·</li>
<li>η Q9 δεν περιέχει το κόμμα της Q6·</li>
<li>η απάντηση «δεν είχα δικαίωμα ψήφου» εμφανίζεται μόνο σε ηλικίες 17–24·</li>
<li>όλες οι διασταυρώσεις αθροίζουν στη βάση της ερώτησης·</li>
<li>στάθμιση.</li>
</ul>
<p><b>Απόκλιση από τις άγκυρες (κλάση Α).</b> Μέση απόλυτη απόκλιση {f1(mad)} μονάδες σε {len(dev)} τιμές. Η μέγιστη είναι {f1(abs(mx["diff"]))} μονάδες, στην {esc(mx["item"])} «{esc(mx["label"])}». Οι αποκλίσεις οφείλονται αποκλειστικά στην τυχαία κλήρωση 500 εγγραφών, και η αναμενόμενη τιμή κάθε ερώτησης ισούται με τον στόχο.</p>
<h4>Π.8 Περιορισμοί</h4><ul>
<li>Δεν πρόκειται για τυχαίο δείγμα πραγματικού πληθυσμού. Δεν δίνεται περιθώριο σφάλματος ούτε διάστημα εμπιστοσύνης δειγματοληψίας.</li>
<li>Οι άγκυρες έχουν διαφορετική ημερομηνία και μέθοδο. Το Eurobarometer 105 είναι της άνοιξης 2026, με πρόσωπο-με-πρόσωπο συνεντεύξεις. Τα στοιχεία της Interview είναι CAWI και προέρχονται από μία μόνο πηγή.</li>
<li>Συγγενείς ερωτήσεις (Q3, Q4, Q12, Q20, Q21, Q23, Q24, Q30) δεν ταυτίζονται με τη διατύπωση της πηγής.</li>
<li>Οι διασταυρώσεις εκτός των δημογραφικών του Eurobarometer, καθώς και οι συσχετίσεις μεταξύ ερωτήσεων, είναι μοντελοποιημένες. Δεν είναι μετρημένες.</li>
<li>Οι ερωτήσεις κλάσης C (σενάριο Σ1) δεν έχουν προγνωστική αξία.</li></ul>
<h4>Π.9 Αναπαραγωγιμότητα</h4>
<p>Σπόρος {M["seed"]}· μοντέλο {esc(M["labModel"])} (snapshot {esc(M["labModelSnapshot"][:12])}…)· πληθυσμός {esc(M["population_id"])}· σενάριο κομμάτων {esc(M["voteScenario"])}· SHA-256 εγγραφών <code>{M["respondentsSha256"][:24]}…</code>.</p>
<p>Εντολές: <code>tsx scripts/synthetic-lab/pasok/p8_lab_panel.ts</code> → <code>python3 -I scripts/synthetic-lab/pasok/p8_generate.py</code> → <code>p8_report.py</code>. Λεπτομέρειες στα PASOK_METHODS.md και PASOK_VALIDATION.md.</p></div>''')
page(body, "appx")

# ================================================================== ΤΑΥΤΟΤΗΤΑ (τώρα που ξέρουμε τις σελίδες)
toc_rows = "".join(f'<li><a href="#{a}"><span>{esc(t)}</span><span class="dots"></span><span>{p}</span></a></li>' for t, a, p in TOC)
PAGES[TOC_SLOT] = f'''<section class="page"><h2 class="pg-h">Ταυτότητα της προσομοίωσης</h2>
<table class="ident"><tbody>
<tr><td>Τίτλος</td><td>ΠΑΣΟΚ — Πανελλαδική Πολιτική Έρευνα</td></tr>
<tr><td>Χαρακτήρας</td><td>Υποθετική ανάθεση / συνθετική προσομοίωση. Δεν αποτελεί επίσημη έρευνα του ΠΑΣΟΚ ούτε δημοσκόπηση.</td></tr>
<tr><td>Πληθυσμός αναφοράς</td><td>Εκλογικό σώμα Ελλάδας (μόνιμοι κάτοικοι 17+), πανελλαδικά</td></tr>
<tr><td>Συνθετικό δείγμα</td><td>500 συνθετικοί ερωτώμενοι από τον βαθμονομημένο πληθυσμό του Greek Synthetic Research Lab</td></tr>
<tr><td>Περίοδος αναφοράς</td><td>Οκτώβριος 2026</td></tr>
<tr><td>Στάθμιση</td><td>Ηλικία×φύλο, περιφέρεια, εκπαίδευση (ΕΛΣΤΑΤ/Eurostat 2025) και ψήφος 2023 (επίσημο αποτέλεσμα)</td></tr>
<tr><td>Ερωτηματολόγιο</td><td>30 ερωτήσεις σε 6 ενότητες (με υποερωτήσεις: 40 δείκτες) και 7 δημογραφικά</td></tr>
<tr><td>Πηγές αγκύρωσης</td><td>Eurobarometer 105 (άνοιξη 2026)· δημοσιευμένες εκτιμήσεις ψήφου Οκτωβρίου 2026 (Interview, Opinion Poll, Alco, Marc)· Interview/POLITICAL Σεπτ.–Οκτ. 2026· επίσημο αποτέλεσμα 2023</td></tr>
<tr><td>Περιθώριο σφάλματος</td><td>Δεν εφαρμόζεται (μη τυχαίο, συνθετικό δείγμα)</td></tr>
</tbody></table>
<div class="legend-box"><b>Πώς διαβάζεται κάθε γράφημα.</b> Κάθε γράφημα φέρει μία από τρεις ενδείξεις τεκμηρίωσης:
<div><span class="badge cA">Τεκμηριωμένη εκτίμηση</span> άγκυρα σε πρόσφατα δημόσια δεδομένα</div>
<div><span class="badge cB">Μοντελοποιημένη προσομοίωση</span> συγγενής πηγή + παραδοχές</div>
<div><span class="badge cC">Υποθετικό σενάριο επίδειξης</span> δηλωμένο σενάριο Σ1, όχι πρόβλεψη</div></div>
<h2 class="pg-h">Περιεχόμενα</h2><ol class="toc">{toc_rows}</ol></section>'''

CSS = open(Path(__file__).with_name("report.css"), encoding="utf-8").read()
JS = open(Path(__file__).with_name("report.js"), encoding="utf-8").read()
nav = "".join(f'<a href="#{a}">{esc(t)}</a>' for t, a, _ in TOC)
doc = f'''<!doctype html>
<html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>ΠΑΣΟΚ — Πανελλαδική Πολιτική Έρευνα (προσομοίωση)</title>
<meta name="description" content="Συνθετική προσομοίωση πολιτικής έρευνας — 500 συνθετικοί ερωτώμενοι — δεν αποτελεί δημοσκόπηση ούτε επίσημη έρευνα του ΠΑΣΟΚ">
<style>{CSS}</style></head>
<body><header class="topbar noprint"><div class="tb-in"><b>ΠΑΣΟΚ — Πανελλαδική Πολιτική Έρευνα</b><span class="tb-sim">ΠΡΟΣΟΜΟΙΩΣΗ · συνθετικά δεδομένα</span><nav>{nav}</nav><button type="button" onclick="window.print()">Εκτύπωση / PDF</button></div></header>
<main>{"".join(PAGES)}</main><script>{JS}</script></body></html>'''
OUT_HTML.write_text(doc, encoding="utf-8")
print(f"OK {len(PAGES)} σελίδες → {OUT_HTML}")
