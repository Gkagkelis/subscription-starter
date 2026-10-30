"""Greece 500 — executive report (HTML → PDF). Κάθε αριθμός διαβάζεται από τα αποτελέσματα της εκτέλεσης
(_analysis.json, _validation.json, RESULTS.csv, CROSSTABS.csv). Δεν γράφεται κανένα ποσοστό με το χέρι.
    python3 -I studies/greece500/report.py <deliverables_dir>
"""
from __future__ import annotations

import html
import json
import sys
from pathlib import Path

import pandas as pd

D = Path(sys.argv[1])
A = json.loads((D / "_analysis.json").read_text(encoding="utf-8"))
V = json.loads((D / "_validation.json").read_text(encoding="utf-8"))
CT = pd.read_csv(D / "CROSSTABS.csv", dtype={"scenario_id": str})
SUM, META = A["summary"], A["meta"]
esc = html.escape
NAVY, TEAL = "#12263a", "#0f766e"
C1, C2, C3, C4 = "#2a78d6", "#eb6834", "#1baf7a", "#eda100"      # επικυρωμένη κατηγορική παλέτα (validate_palette.js)
AS_COL = {"T0": C1, "T1": C3, "T2": C2, "T3": C4}
AS_NAME = {"T0": "T0 βασικό (ε = 0,5)", "T1": "T1 μόνο PPP", "T2": "T2 μερίδιο εισοδήματος", "T3": "T3 ονομαστική ισοτιμία"}


def f1(x):
    return "—" if x is None else f"{x:.1f}".replace(".", ",")


def f0(x):
    return f"{x:.0f}"


def th(n):
    return f"{n:,}".replace(",", ".")


def eur(x):
    return f"{x:,.0f} €".replace(",", ".") if float(x).is_integer() else f"{x:.2f} €".replace(".", ",")


def get(q, sid, alt, aid="T0", k="sim"):
    try:
        return SUM[q][aid][sid][alt][k]
    except KeyError:
        return None


def scen(q):
    return next(x for x in META["questions"] if x["question_id"] == q)["scenarios"]


# ------------------------------------------------------------------ γραφήματα (SVG)
def line_chart(series, xs, xlabel, width=720, h=250, ymin=0, ymax=100, xfmt=str, ylab="% επιλογής"):
    """series: [(label, [y|None], color, dashed)]· None = σημείο εκτός πεδίου (δεν σχεδιάζεται)."""
    L, R, T, B = 52, 20, 12, 42
    pw, ph = width - L - R, h - T - B
    sx = lambda i: L + pw * i / max(1, len(xs) - 1)
    sy = lambda v: T + ph * (1 - (v - ymin) / (ymax - ymin))
    o = [f'<svg class="chart" viewBox="0 0 {width} {h}" role="img">']
    step = 10 if ymax - ymin <= 60 else 20
    for t in range(ymin, ymax + 1, step):
        o.append(f'<line x1="{L}" x2="{L + pw}" y1="{sy(t):.1f}" y2="{sy(t):.1f}" stroke="#ecebe7"/><text x="{L - 8}" y="{sy(t) + 4:.1f}" text-anchor="end" class="ax">{t}</text>')
    for i, x in enumerate(xs):
        o.append(f'<text x="{sx(i):.1f}" y="{h - 22}" text-anchor="middle" class="ax">{esc(xfmt(x))}</text>')
    o.append(f'<text x="{L + pw / 2}" y="{h - 4}" text-anchor="middle" class="ax">{esc(xlabel)}</text>')
    o.append(f'<text x="12" y="{T + ph / 2}" transform="rotate(-90 12 {T + ph / 2})" text-anchor="middle" class="ax">{esc(ylab)}</text>')
    for lab, ys, col, dash in series:
        segs, cur = [], []
        for i, y in enumerate(ys):
            if y is None:
                if cur:
                    segs.append(cur)
                cur = []
            else:
                cur.append((i, y))
        if cur:
            segs.append(cur)
        for sg in segs:
            pts = " ".join(f"{sx(i):.1f},{sy(y):.1f}" for i, y in sg)
            o.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="{1.6 if dash else 2.2}" {"stroke-dasharray=\'5 4\'" if dash else ""}/>')
        if not dash:
            for i, y in enumerate(ys):
                if y is not None:
                    o.append(f'<circle cx="{sx(i):.1f}" cy="{sy(y):.1f}" r="4" fill="{col}" stroke="#fff" stroke-width="1.5"><title>{esc(lab)} · {esc(xfmt(xs[i]))}: {f1(y)}%</title></circle>')
    o.append("</svg>")
    leg = "".join(f'<span style="color:{col}"><i class="{"dash" if dash else ""}" style="background:{col}"></i><span style="color:#4b5360">{esc(lab)}</span></span>' for lab, ys, col, dash in series)
    return f'<div class="lg">{leg}</div>' + "".join(o)


def hbar(rows, width=720, label_w=250, row_h=28, maxv=100, fmt=lambda v: f1(v) + "%"):
    h = row_h * len(rows) + 4
    bw = width - label_w - 70
    o = [f'<svg class="chart" viewBox="0 0 {width} {h}" role="img">']
    for i, r in enumerate(rows):
        l, v, c = r[:3]
        y = 2 + i * row_h
        w = max(1.5, bw * v / maxv)
        o.append(f'<g><title>{esc(l)}: {fmt(v)}</title><text x="{label_w - 10}" y="{y + row_h * .62}" text-anchor="end" class="lbl">{esc(l)}</text>'
                 f'<rect x="{label_w}" y="{y + 6}" width="{w:.1f}" height="{row_h - 12}" rx="3" fill="{c}"/>'
                 f'<text x="{label_w + w + 8}" y="{y + row_h * .64}" class="val">{fmt(v)}</text></g>')
    o.append("</svg>")
    return "".join(o)


def stack100(rows, keys, colors, names, width=720, label_w=230, row_h=34):
    """rows: [(label, {key: pct})]· 100% οριζόντιες ράβδοι με 2px κενό μεταξύ τμημάτων."""
    h = row_h * len(rows) + 4
    bw = width - label_w - 10
    o = [f'<svg class="chart" viewBox="0 0 {width} {h}" role="img">']
    for i, (l, d) in enumerate(rows):
        y = 2 + i * row_h
        o.append(f'<text x="{label_w - 10}" y="{y + row_h * .6}" text-anchor="end" class="lbl">{esc(l)}</text>')
        x = label_w
        for k, c in zip(keys, colors):
            w = bw * d.get(k, 0) / 100
            if w > 0:
                o.append(f'<g><title>{esc(l)} · {esc(names[k])}: {f1(d.get(k, 0))}%</title><rect x="{x:.1f}" y="{y + 5}" width="{max(0, w - 2):.1f}" height="{row_h - 10}" rx="2" fill="{c}"/>')
                if w > 34:
                    o.append(f'<text x="{x + w / 2 - 1:.1f}" y="{y + row_h * .62}" text-anchor="middle" style="font-size:11.5px;font-weight:700;fill:{'#3a2a00' if c == C4 else '#fff'}">{f0(d.get(k, 0))}%</text>')
                o.append("</g>")
            x += w
    o.append("</svg>")
    leg = "".join(f'<span><i style="background:{c}"></i>{esc(names[k])}</span>' for k, c in zip(keys, colors))
    return f'<div class="lg">{leg}</div>' + "".join(o)


def cap(text, kind="tr"):
    tag = {"tr": '<span class="tag tx">Μεταφορά μοντέλου · EXPERIMENTAL_CROSS_COUNTRY_TRANSFER</span>',
           "gr": '<span class="tag tc">Ελληνικά δεδομένα του Lab</span>'}[kind]
    return f'<div class="cap">{tag}<span>{esc(text)}</span><span class="synth">500 συνθετικοί καταναλωτές</span></div>'


PAGES = []


def page(body, cls=""):
    PAGES.append(f'<section class="page {cls}">{body}</section>')


def head(num, title, kicker):
    return f'<div class="sh"><span class="num">{num:02d}</span><div><h2>{esc(title)}</h2><p>{esc(kicker)}</p></div></div>'


def kpis(items):
    return '<div class="kpis">' + "".join(f'<div class="kpi"><b>{v}</b><span>{esc(t)}</span></div>' for v, t in items) + "</div>"


def curve_series(q, alt, aids=("T0",), with_p=True, label=None):
    xs = scen(q)
    out = []
    for aid in aids:
        out.append((label or (AS_NAME[aid] if len(aids) > 1 else "Κληρωμένες επιλογές (500)"), [get(q, s, alt, aid) for s in xs], AS_COL[aid] if len(aids) > 1 else C1, False))
    if with_p:
        out.append(("Μέση προβλεπόμενη πιθανότητα", [get(q, s, alt, "T0", "p") for s in xs], C2, True))
    return xs, out


def table(headers, rows, cls="t xs"):
    th = "".join(f"<th>{esc(h)}</th>" for h in headers)
    tr = "".join("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>" for r in rows)
    return f'<table class="{cls}"><thead><tr>{th}</tr></thead><tbody>{tr}</tbody></table>'


def ci_txt(q, sid, alt):
    c = SUM[q]["T0"][sid][alt]["ci"]
    return f"[{f1(c[0])}–{f1(c[1])}]" if c else "—"


def pp100(q, alt="A"):
    """Μεταβολή (μονάδες) της μέσης πιθανότητας ανά +100 € στο εύρος της καμπύλης, στη βασική υπόθεση."""
    xs = [float(s) for s in scen(q)]
    ps = [get(q, s, alt, "T0", "p") for s in scen(q)]
    return (ps[-1] - ps[0]) / (xs[-1] - xs[0]) * 100


fac = {mk: META["assumptions"]["T0"]["factors"][mk]["factor"] for mk in META["models"]}
st = A["status_counts"]
n_runs = sum(st["EXPERIMENTAL_CROSS_COUNTRY_TRANSFER"].values())
n_rej = sum(st["EXTRAPOLATION_REJECTED"].values())
n_records = V["1_shares_vs_records"]["runs"] * 500

# ================================================================== 1. εξώφυλλο
page(f'''<div class="cv-top"><span class="cv-mark"></span>Greek Synthetic Research Lab · Consumer Choice Engine 0.1</div>
<div class="cv-title">REPAIR,<br>REPLACE OR<br>UPGRADE?</div>
<p class="cv-sub">500 Synthetic Greek Consumers — Experimental Choice Modeling Study · Greece 2026</p>
<div class="cv-flag"><div><b>Συνθετικοί καταναλωτές</b>Οι 500 καταναλωτές είναι <u>συνθετικά</u> προφίλ με ελληνική δημογραφική κατανομή από τον πληθυσμό του Lab. Δεν είναι πραγματικοί ερωτώμενοι.</div>
<div><b>Ξένοι συντελεστές προτίμησης</b>Οι προτιμήσεις προέρχονται από μοντέλα εκπαιδευμένα σε πραγματικές επιλογές <u>εκτός Ελλάδας</u> (Ελβετία 2021-22, ΗΠΑ 2019 και 2022). Πειραματική μεταφορά, χωρίς ελληνική επικύρωση.</div></div>
<div class="cv-grid"><div><span>Συνθετικά προφίλ</span><b>500</b></div><div><span>Σενάρια</span><b>{sum(len(q["scenarios"]) for q in META["questions"] if q["kind"] != "unsupported")}</b></div>
<div><span>Ατομικές επιλογές</span><b>{th(n_records)}</b></div><div><span>Υποθέσεις μεταφοράς</span><b>4</b></div></div>''', "cover")

# ================================================================== 2. executive summary
wm6 = scen("WM6")
f_wm4_hi = get("WM4", "899", "A")
page(head(1, "Executive Summary", "Τι δίνει το CCE 0.1 όταν εφαρμόζεται σε 500 συνθετικούς Έλληνες καταναλωτές")
     + kpis([(f1(get("WM4", "899", "A")) + "%", "επιλέγει το «κυκλικό» πλυντήριο στα 899 € έναντι βασικού στα 549 €"),
             (f1(get("WM8", "A(A) vs G(B)", "A")) + "%", "προτιμά κλάση A αντί G στην ίδια τιμή (πλυντήριο)"),
             (f1(get("RF2", "κατασκευαστής", "refurb_A") - get("RF2", "μη εξουσιοδοτημένος τρίτος", "refurb_A")) + " μον.", "περισσότεροι επιλέγουν refurbished όταν το πιστοποιεί ο κατασκευαστής"),
             (f1(get("DL4", "με προστασία", "drone") - get("DL4", "χωρίς προστασία", "drone")) + " μον.", "μείωση της προτίμησης για drone χωρίς προστασία δεδομένων")])
     + f'''<div class="find"><p><b class="n">1</b><b>Τα χαρακτηριστικά βαραίνουν περισσότερο από την τιμή στα πλυντήρια.</b> Το πλήρως επισκευάσιμο μοντέλο επιλέγεται από το {f1(get("WM1", "549", "A"))}% στην ίδια τιμή (549 €) και διατηρεί {f1(get("WM1", "899", "A"))}% ακόμη και στα 899 €. Η ενεργειακή κλάση είναι το ισχυρότερο μεμονωμένο χαρακτηριστικό: A έναντι G στην ίδια τιμή {f1(get("WM8", "A(A) vs G(B)", "A"))}%.</p></div>
<div class="find"><p><b class="n">2</b><b>Τα smartphones αντιδρούν περισσότερο στην τιμή.</b> Για το πλήρως επισκευάσιμο smartphone, το μερίδιο πέφτει από {f1(get("SP1", "249", "A"))}% στα 249 € σε {f1(get("SP1", "449", "A"))}% στα 449 € (έναντι βασικού 299 €): {f1(abs(pp100("SP1")))} μονάδες ανά 100 €, έναντι {f1(abs(pp100("WM1")))} στα πλυντήρια.</p></div>
<div class="find"><p><b class="n">3</b><b>Το refurbished κερδίζει με έκπτωση και εμπιστοσύνη.</b> Ανακατασκευασμένο από τον κατασκευαστή: {f1(get("RF1", "10%", "refurb_A"))}% στο −10% → {f1(get("RF1", "60%", "refurb_A"))}% στο −60%. Το νέο (299 €) διατηρεί {f1(get("RF1", "60%", "new"))}–{f1(get("RF1", "10%", "new"))}%.</p></div>
<div class="find"><p><b class="n">4</b><b>Η γρήγορη παράδοση έχει αξία, αλλά είναι ευαίσθητη στη χρέωση.</b> Ψώνια με drone σε 20′: {f1(get("DL1", "0.00", "drone"))}% χωρίς χρέωση, {f1(get("DL1", "2.25", "drone"))}% στα 2,25 €. Οι 65+ επιλέγουν λιγότερο drone (όρος ηλικίας του μοντέλου).</p></div>
<div class="find"><p><b class="n">5</b><b>Τα αποτελέσματα αντέχουν στις υποθέσεις μεταφοράς, με όρια.</b> Οι διαφορές μεταξύ βασικής υπόθεσης και PPP-only φτάνουν τις {f1(max(v["T1"] for v in V["8_transfer_effect_max_abs_pp"].values() if v["T1"] is not None))} μονάδες. Με απλή ονομαστική ισοτιμία φτάνουν τις {f1(max(v["T3"] for v in V["8_transfer_effect_max_abs_pp"].values() if v["T3"] is not None))}. Η υπόθεση ίσου μεριδίου εισοδήματος βγάζει τα smartphones εκτός πεδίου εκπαίδευσης ({st["EXTRAPOLATION_REJECTED"]["T2"]} σενάρια απορρίφθηκαν).</p></div>
<div class="concl"><b>Πώς να διαβαστεί.</b> Οι αριθμοί είναι πραγματικές έξοδοι του CCE 0.1 στα 500 προφίλ: {th(n_records)} ατομικές επιλογές, όλα τα ποσοστά υπολογισμένα από αυτές.''' + f''' Δείχνουν τι <i>θα έκαναν</i> οι Έλληνες καταναλωτές αν είχαν τις προτιμήσεις των Ελβετών ή Αμερικανών ερωτωμένων, μετά από οικονομική προσαρμογή τιμών. Δεν είναι μέτρηση της ελληνικής αγοράς. Το ελβετικό μοντέλο είχε ήδη στην πηγή του ασθενή ευαισθησία στην τιμή, οπότε οι καμπύλες τιμής των πλυντηρίων πιθανότατα υποεκτιμούν την αντίδραση.</div>''')

# ================================================================== 3. βασικά νούμερα
key = [("Πλυντήριο πλήρως επισκευάσιμο 649 € vs βασικό 549 €", "WM1", "649", "A"), ("Πλυντήριο 15 ετών 649 € vs 10 ετών 549 €", "WM2", "649", "A"),
       ("Πλυντήριο κλάσης A 649 € vs C 549 €", "WM3", "649", "A"), ("«Κυκλικό» πλυντήριο 749 € vs βασικό 549 €", "WM4", "749", "A"),
       ("Μη επισκευάσιμο 449 € vs βασικό 549 €", "WM5", "449", "A"), ("Premium 799 € vs βασικό 549 €", "WM6", "Premium(A) vs Βασικό(B)", "A"),
       ("Βασικό 549 € vs οικονομικό 399 €", "WM6", "Βασικό(A) vs Οικονομικό(B)", "A"), ("Smartphone επισκευάσιμο 349 € vs 299 €", "SP1", "349", "A"),
       ("Smartphone 8 ετών 349 € vs 4 ετών 299 €", "SP2", "349", "A"), ("Smartphone κλάσης A 349 € vs C 299 €", "SP3", "349", "A"),
       ("Smartphone premium 429 € vs βασικό 299 €", "SP5", "Premium(A) vs Βασικό(B)", "A"), ("Refurbished κατασκευαστή −30% (209 €)", "RF1", "30%", "refurb_A"),
       ("Νέο smartphone 299 € (ίδιο σενάριο)", "RF1", "30%", "new"), ("Drone ψώνια 20′ / 1 € vs επίγεια 45′ / 1 €", "DL1", "1.00", "drone"),
       ("Drone φαγητό 15′ / 1 € vs επίγεια 45′ / 1 €", "DL2", "1.00", "drone"), ("Drone φάρμακα 30′ / 2 € vs δωρεάν σε 6 ώρες", "DL3", "2.00", "drone")]
rows = [(esc(l), f1(get(q, s, a)), f1(get(q, s, a, "T0", "p")), ci_txt(q, s, a), " / ".join(f1(get(q, s, a, x)) for x in ("T1", "T2", "T3"))) for l, q, s, a in key]
page(head(2, "Key Numbers", "Βασικά σενάρια · βασική υπόθεση μεταφοράς T0 · 500 προφίλ")
     + table(["Σενάριο (επιλογή που μετράται)", "Κληρωμένες επιλογές %", "Μέση πιθανότητα %", "95% διάστημα παραμέτρων", "T1 / T2 / T3 %"], rows)
     + cap("Κληρωμένες επιλογές = ποσοστό των 500 ατομικών επιλογών· μέση πιθανότητα = μέσος όρος των 500 ατομικών πιθανοτήτων· διάστημα = Krinsky–Robb (200 κληρώσεις)· «—» = εκτός πεδίου εκπαίδευσης στην υπόθεση")
     + '<p class="body">Οι δύο μετρήσεις απαντούν σε διαφορετικά ερωτήματα. Η <b>μέση πιθανότητα</b> είναι η αναμενόμενη τιμή του μοντέλου για τα 500 προφίλ. Οι <b>κληρωμένες επιλογές</b> είναι μία συγκεκριμένη πραγματοποίηση: κάθε καταναλωτής επιλέγει μία εναλλακτική. Η απόκλισή τους (συνήθως ≤ 3 μονάδες) είναι θόρυβος 500 προσώπων. Το <b>διάστημα</b> αποτυπώνει μόνο την αβεβαιότητα των συντελεστών στη χώρα προέλευσης· η αβεβαιότητα της μεταφοράς φαίνεται στη στήλη T1/T2/T3.</p>')

# ================================================================== 4. σχεδιασμός
mods = META["models"]
mrows = [(esc(k), esc(v["source_population"]), esc(v["source_years"]), esc(v["licence"]), f'{fac[k]:.3f}'.replace(".", ",")) for k, v in mods.items()]
page(head(3, "Study Design", "Τι είναι ελληνικό, τι μεταφέρεται και τι δεν απαντάται")
     + '<div class="srcbar"><div class="gr"><b>Ελληνικό</b>500 συνθετικά προφίλ (φύλο, ηλικία, περιφέρεια, εκπαίδευση, νοικοκυριό, εισόδημα) από τον βαθμονομημένο πληθυσμό του Lab· τιμές σεναρίων σε ευρώ 2025· ελληνικός HICP για την αναγωγή τιμών.</div>'
       '<div class="tr2"><b>Μεταφερόμενο</b>Συντελεστές προτίμησης τεσσάρων μοντέλων CCE 0.1, εκπαιδευμένων σε πραγματικές επιλογές στην Ελβετία και τις ΗΠΑ. Οι συντελεστές δεν αλλάζουν· μετατρέπονται μόνο τα ευρώ στις μονάδες του μοντέλου.</div></div>'
     + table(["Μοντέλο", "Χώρα", "Πεδίο", "Άδεια", "Μονάδες ανά € (T0)"], mrows)
     + cap("Μονάδες νομίσματος πηγής ανά 1 € του 2025 στη βασική υπόθεση (TRANSFER_ASSUMPTIONS.md)")
     + '<h4>Ροή εκτέλεσης</h4><ol class="el"><li>Κάθε σενάριο ορίζεται σε ευρώ (π.χ. πλυντήριο 649 €, 15 έτη, κλάση A).</li><li>Τα ευρώ μετατρέπονται στις μονάδες του μοντέλου με τη ρητή υπόθεση μεταφοράς.</li><li>Η πύλη εφαρμοσιμότητας ελέγχει κατηγορία, χαρακτηριστικά και εύρη. Ό,τι βγαίνει εκτός εύρους απορρίπτεται και δεν απαντάται.</li><li>Κάθε καταναλωτής έχει σταθερούς ατομικούς συντελεστές από το mixed logit και σταθερά τυχαία σφάλματα ανά ερώτηση. Επιλέγει μία εναλλακτική.</li><li>Τα ποσοστά υπολογίζονται από τις 500 επιλογές.</li></ol>'
     + f'<h4>Τι δεν απαντάται</h4><p class="body">Επισκευή παλιάς συσκευής έναντι νέας, trade-in, πρόσθετη εγγύηση, άτοκες δόσεις, κανάλι αγοράς και παράδοση συσκευών (ημέρες). Δεν υπάρχουν εκπαιδευμένοι συντελεστές· η πύλη επέστρεψε <code>NOT_SUPPORTED</code> σε {len(V["11_unsupported"])} ερωτήσεις-δοκιμές και δεν παράχθηκε καμία απάντηση. Οι ερωτήσεις μένουν στο ερωτηματολόγιο για την πραγματική μέτρηση.</p>'
     + f'<p class="mini">Σύνολο: {n_runs} εκτελέσεις σεναρίου × υπόθεσης με 500 απαντήσεις η καθεμία· {n_rej} απορρίψεις εκτός πεδίου (κυρίως στην υπόθεση T2). Η σήμανση κάθε αποτελέσματος είναι EXPERIMENTAL_CROSS_COUNTRY_TRANSFER.</p>')

# ================================================================== 5. consumer landscape
dem = A["demographics"]
age = [(k, v, C1) for k, v in sorted(dem["age_band"].items())]
reg = sorted(dem["region"].items(), key=lambda x: -x[1])
own = pd.read_csv(Path(__file__).resolve().parents[4] / "docs" / "synthetic-lab" / "consumer-decision-study" / "RESULTS.csv")
own = own[own["question_id"].str.match(r"^H\d$") & (own["option"] == "Ναι")]
page(head(4, "Consumer Landscape", "Ποιοι είναι οι 500 συνθετικοί Έλληνες καταναλωτές")
     + '<div class="two"><div><h4>Ηλικία</h4>' + hbar(age, width=360, label_w=70, row_h=24, maxv=35) + '</div><div><h4>Φύλο και εισόδημα</h4>'
     + hbar([(k, v, C3) for k, v in dem["gender"].items()] + [(f"{k}ο πεμπτημόριο", v, C4) for k, v in sorted(dem["income_quintile"].items())], width=360, label_w=130, row_h=24, maxv=60) + "</div></div>"
     + cap("% των 500 προφίλ · πληθυσμός του Lab βαθμονομημένος σε ΕΛΣΤΑΤ/Eurostat (μελέτη Repair, Replace or Upgrade?, ίδια προφίλ)", "gr")
     + "<h4>Περιφέρεια</h4>" + hbar([(k, v, C1) for k, v in reg[:8]], label_w=260, row_h=22, maxv=45)
     + cap("% των 500 προφίλ · οκτώ μεγαλύτερες περιφέρειες", "gr")
     + "<h4>Εγκατεστημένη βάση συσκευών (νοικοκυριά των προφίλ)</h4>" + hbar([(r.question.replace("Το νοικοκυριό διαθέτει ", ""), r.pct, C3) for r in own.itertuples()], label_w=200, row_h=22)
     + cap("% νοικοκυριών · pie-hbs-0.1, εκτιμημένο σε μικροδεδομένα ΕΛΣΤΑΤ ΕΟΠ 2019/2020, με χρονική μεταφορά στο 2025", "gr")
     + '<p class="mini">Η δημογραφική εικόνα είναι η μόνη ελληνική πληροφορία που μπαίνει στις επιλογές, και μόνο όπου το μοντέλο έχει αντίστοιχο όρο: ηλικία και φύλο στο μοντέλο παράδοσης. Τα μοντέλα πλυντηρίου, smartphone και refurbished δεν έχουν δημογραφικούς όρους, άρα δεν δημιουργούνται δημογραφικές διαφορές.</p>')

# ================================================================== 6. appliance purchase choices
offers = [("Βασικό 549 € vs Οικονομικό 399 €", "Βασικό(A) vs Οικονομικό(B)"), ("Premium 799 € vs Βασικό 549 €", "Premium(A) vs Βασικό(B)"), ("Premium 799 € vs Οικονομικό 399 €", "Premium(A) vs Οικονομικό(B)")]
xs5, s5 = curve_series("WM5", "A")
page(head(5, "Appliance Purchase Choices", "Πλυντήρια: σύγκριση προσφορών και η τιμή της «φθηνής» επιλογής")
     + '<p class="lead">Τρεις προσφορές πλυντηρίου σε ζεύγη. <b>Οικονομικό:</b> 399 €, 5 έτη, μη επισκευάσιμο, κλάση E. <b>Βασικό:</b> 549 €, 10 έτη, περιορισμένη επισκευασιμότητα, κλάση C. <b>Premium:</b> 799 €, 15 έτη, πλήρως επισκευάσιμο, κλάση A, ανακυκλώσιμο.</p>'
     + stack100([(l, {"A": get("WM6", s, "A"), "B": get("WM6", s, "B")}) for l, s in offers], ["A", "B"], [C1, C2], {"A": "Πρώτη (ακριβότερη) προσφορά", "B": "Δεύτερη (φθηνότερη) προσφορά"})
     + cap("% των 500 κληρωμένων επιλογών · T0")
     + f'<p class="body">Η αναβάθμιση από το οικονομικό στο βασικό κερδίζει {f1(get("WM6", offers[0][1], "A"))}%, παρά τη διαφορά 150 €. Το premium κερδίζει το βασικό με {f1(get("WM6", offers[1][1], "A"))}% (διάστημα παραμέτρων {ci_txt("WM6", offers[1][1], "A")}). Η διαφορά διάρκειας ζωής (5 → 10 → 15 έτη) και ενεργειακής κλάσης αντισταθμίζει πλήρως τη διαφορά τιμής.</p>'
     + "<h4>Πόση έκπτωση χρειάζεται ένα μη επισκευάσιμο πλυντήριο;</h4>" + line_chart(s5, xs5, "Τιμή μη επισκευάσιμου πλυντηρίου (έναντι βασικού 549 € με περιορισμένη επισκευασιμότητα)", h=220, ymax=60, xfmt=lambda x: f"{x} €")
     + cap("% που επιλέγει το μη επισκευάσιμο · T0")
     + f'<p class="body">Ακόμη και με έκπτωση 200 € (349 €), το μη επισκευάσιμο μοντέλο επιλέγεται μόνο από το {f1(get("WM5", "349", "A"))}%. Στην ίδια τιμή πέφτει στο {f1(get("WM5", "549", "A"))}%.</p>')

# ================================================================== 7. repairability
xs1, s1 = curve_series("WM1", "A")
lv = [("Περιορισμένη vs καθόλου", "περιορισμένη(A) vs καθόλου(B)"), ("Πλήρης vs περιορισμένη", "πλήρης(A) vs περιορισμένη(B)"), ("Πλήρης vs καθόλου", "πλήρης(A) vs καθόλου(B)")]
page(head(6, "Repairability", "Επισκευασιμότητα νέου πλυντηρίου (ιδιότητα του προϊόντος, όχι απόφαση επισκευής)")
     + line_chart(s1, xs1, "Τιμή του πλήρως επισκευάσιμου πλυντηρίου (έναντι βασικού 549 € με περιορισμένη επισκευασιμότητα)", ymin=40, ymax=80, xfmt=lambda x: f"{x} €")
     + cap("% που επιλέγει το πλήρως επισκευάσιμο · T0 · συνεχής: κληρωμένες επιλογές· διακεκομμένη: μέση πιθανότητα")
     + f'<p class="body">Η πλήρης επισκευασιμότητα (έναντι περιορισμένης) προσελκύει {f1(get("WM1", "549", "A"))}% στην ίδια τιμή. Η προτίμηση μειώνεται σταδιακά με την τιμή, κατά περίπου {f1(abs(pp100("WM1")))} μονάδες ανά 100 €, αλλά παραμένει πάνω από 50% σε όλο το εύρος έως 899 €.</p>'
     + "<h4>Επίπεδα επισκευασιμότητας στην ίδια τιμή (549 €)</h4>" + hbar([(l, get("WM7", s, "A"), C1) for l, s in lv], label_w=220)
     + cap("% που επιλέγει την πιο επισκευάσιμη εκδοχή · T0")
     + f'<p class="body">Το μεγαλύτερο άλμα είναι από «καθόλου» σε «περιορισμένη» ({f1(get("WM7", lv[0][1], "A"))}%). Η πλήρης επισκευασιμότητα προσθέτει επιπλέον αξία ({f1(get("WM7", lv[1][1], "A"))}% έναντι περιορισμένης). <b>Σημείωση:</b> αυτό αφορά την επιλογή <i>νέου</i> προϊόντος βάσει επισκευασιμότητας. Η απόφαση «επισκευάζω το παλιό ή αγοράζω νέο» δεν καλύπτεται από κανένα εκπαιδευμένο μοντέλο.</p>')

# ================================================================== 8. lifespan
xs2, s2 = curve_series("WM2", "A")
xsp2, ssp2 = curve_series("SP2", "A")
page(head(7, "Product Lifespan", "Πόσο μετρά η λειτουργική διάρκεια ζωής")
     + "<h4>Πλυντήριο 15 ετών έναντι 10 ετών (549 €)</h4>" + line_chart(s2, xs2, "Τιμή του πλυντηρίου 15 ετών", h=225, ymin=40, ymax=90, xfmt=lambda x: f"{x} €")
     + cap("% που επιλέγει το πλυντήριο 15 ετών · T0")
     + "<h4>Smartphone 8 ετών έναντι 4 ετών (299 €)</h4>" + line_chart(ssp2, xsp2, "Τιμή του smartphone 8 ετών", h=225, ymin=40, ymax=90, xfmt=lambda x: f"{x} €")
     + cap("% που επιλέγει το smartphone 8 ετών · T0")
     + f'<p class="body">Πέντε επιπλέον χρόνια ζωής στο πλυντήριο επιλέγονται από το {f1(get("WM2", "549", "A"))}% στην ίδια τιμή και από το {f1(get("WM2", "899", "A"))}% με +350 €. Στο smartphone, ο διπλασιασμός της διάρκειας (4 → 8 έτη) επιλέγεται από το {f1(get("SP2", "299", "A"))}% στην ίδια τιμή, αλλά η προτίμηση πέφτει ταχύτερα με την τιμή: {f1(get("SP2", "449", "A"))}% με +150 €.</p>')

# ================================================================== 9. energy
xs3, s3 = curve_series("WM3", "A")
en = [("E vs G", "E(A) vs G(B)"), ("C vs G", "C(A) vs G(B)"), ("A vs G", "A(A) vs G(B)")]
page(head(8, "Energy Efficiency", "Ενεργειακή κλάση: το ισχυρότερο μεμονωμένο χαρακτηριστικό στα μοντέλα συσκευών")
     + "<h4>Ίδια τιμή (549 €), διαφορετική ενεργειακή κλάση</h4>" + hbar([(l, get("WM8", s, "A"), C1) for l, s in en], label_w=120)
     + cap("% που επιλέγει την αποδοτικότερη κλάση · T0")
     + "<h4>Κλάση A με επιπλέον τιμή, έναντι κλάσης C στα 549 €</h4>" + line_chart(s3, xs3, "Τιμή του πλυντηρίου κλάσης A", h=225, ymin=40, ymax=90, xfmt=lambda x: f"{x} €")
     + cap("% που επιλέγει την κλάση A · T0")
     + f'<p class="body">Η μετάβαση από G σε A στην ίδια τιμή επιλέγεται από το {f1(get("WM8", en[2][1], "A"))}%. Από C σε A επιλέγεται από το {f1(get("WM3", "549", "A"))}% στην ίδια τιμή και από το {f1(get("WM3", "899", "A"))}% με +350 €. Στο smartphone, η κλάση A έναντι C στην ίδια τιμή (299 €) επιλέγεται από το {f1(get("SP3", "299", "A"))}%. Ο συντελεστής ενεργειακής κλάσης είναι κοινός για όλους στο μοντέλο: δεν διαφοροποιεί segments, μόνο το συνολικό επίπεδο.</p>')

# ================================================================== 10. circular upgrade
xs4, s4 = curve_series("WM4", "A")
cmp = [("Μόνο επισκευασιμότητα", "WM1"), ("Μόνο διάρκεια", "WM2"), ("Μόνο ενεργειακή κλάση", "WM3"), ("Όλα μαζί (κυκλικό)", "WM4")]
page(head(9, "The Upgrade Bundle", "Το «κυκλικό» πλυντήριο: πλήρως επισκευάσιμο, 15 έτη, κλάση A, ανακυκλώσιμο")
     + line_chart(s4, xs4, "Τιμή του κυκλικού πλυντηρίου (έναντι βασικού 549 €)", h=230, ymin=80, ymax=100, xfmt=lambda x: f"{x} €")
     + cap("% που επιλέγει το κυκλικό πλυντήριο · T0")
     + "<h4>Κάθε αναβάθμιση χωριστά και όλες μαζί, στα 749 €</h4>" + hbar([(l, get(q, "749", "A"), [C1, C3, C4, C2][i]) for i, (l, q) in enumerate(cmp)], label_w=200)
     + cap("% που επιλέγει την αναβαθμισμένη εκδοχή στα 749 € έναντι βασικού στα 549 € · T0")
     + f'<p class="body">Ο συνδυασμός των αναβαθμίσεων κρατά το {f1(get("WM4", "749", "A"))}% στα 749 € (διάστημα {ci_txt("WM4", "749", "A")}) και το {f1(get("WM4", "899", "A"))}% στα 899 €. Μεμονωμένα, οι αναβαθμίσεις στα 749 € κινούνται μεταξύ {f1(min(get(q, "749", "A") for _, q in cmp[:3]))}% και {f1(max(get(q, "749", "A") for _, q in cmp[:3]))}%. Σε αυτό το μοντέλο τα οφέλη αθροίζονται και υπερκαλύπτουν τη διαφορά τιμής.</p>')

# ================================================================== 11. smartphones
xsp1, ssp1 = curve_series("SP1", "A")
xsp3, ssp3 = curve_series("SP3", "A")
xsp4, ssp4 = curve_series("SP4", "A")
page(head(10, "Smartphone Choices", "Επισκευασιμότητα, ενεργειακή κλάση και τιμή στα smartphones (βασικό: 299 €, 4 έτη, κλάση C)")
     + "<h4>Πλήρως επισκευάσιμο smartphone με επιπλέον τιμή</h4>" + line_chart(ssp1, xsp1, "Τιμή του πλήρως επισκευάσιμου", h=210, ymin=40, ymax=80, xfmt=lambda x: f"{x} €")
     + cap("% που επιλέγει το πλήρως επισκευάσιμο · T0")
     + "<h4>Κλάση A με επιπλέον τιμή</h4>" + line_chart(ssp3, xsp3, "Τιμή του smartphone κλάσης A", h=210, ymin=40, ymax=80, xfmt=lambda x: f"{x} €")
     + cap("% που επιλέγει την κλάση A · T0")
     + f'<p class="body">Στα smartphones η τιμή βαραίνει περισσότερο: η επισκευασιμότητα πέφτει κάτω από το 50% γύρω στα {next((s for s in scen("SP1") if get("SP1", s, "A") < 50), "—")} €. Ένα μη επισκευάσιμο smartphone χρειάζεται έκπτωση 75–100 € για να ισοφαρίσει: {f1(get("SP4", "224", "A"))}% στα 224 € και {f1(get("SP4", "199", "A"))}% στα 199 €, έναντι {f1(get("SP4", "299", "A"))}% στην ίδια τιμή. Το εύρος τιμών περιορίζεται έως ~459 € από το πεδίο του μοντέλου στη βασική υπόθεση.</p>')

# ================================================================== 12. smartphone offers + segments
sp_off = [("Βασικό 299 € vs Οικονομικό 199 €", "Βασικό(A) vs Οικονομικό(B)"), ("Premium 429 € vs Βασικό 299 €", "Premium(A) vs Βασικό(B)"), ("Premium 429 € vs Οικονομικό 199 €", "Premium(A) vs Οικονομικό(B)")]
segsp = A["segments"]["smartphone"]
ctsp = CT[(CT.question_id == "SP1") & (CT.scenario_id == "349") & (CT.alt_id == "A") & (CT.variable == "segment_smartphone")]
page(head(11, "Smartphone Offers", "Σύγκριση προσφορών και ποιοι καταναλωτές τις επιλέγουν")
     + '<p class="lead"><b>Οικονομικό:</b> 199 €, 2 έτη, μη επισκευάσιμο, κλάση E. <b>Βασικό:</b> 299 €, 4 έτη, περιορισμένη επισκευασιμότητα, κλάση C. <b>Premium:</b> 429 €, 8 έτη, πλήρως επισκευάσιμο, κλάση A, ανακυκλώσιμο.</p>'
     + stack100([(l, {"A": get("SP5", s, "A"), "B": get("SP5", s, "B")}) for l, s in sp_off], ["A", "B"], [C1, C2], {"A": "Ακριβότερη προσφορά", "B": "Φθηνότερη προσφορά"})
     + cap("% των 500 κληρωμένων επιλογών · T0")
     + "<h4>Segments smartphone (από τους ατομικούς συντελεστές)</h4>" + hbar([(k, v["pct"], [C1, C2, C3, C4][i]) for i, (k, v) in enumerate(sorted(segsp.items(), key=lambda x: -x[1]["pct"]))], label_w=260, maxv=50)
     + cap("% των 500 · k-means στα σχετικά μερίδια σημασίας τιμής, διάρκειας, επισκευασιμότητας, ενεργειακής κλάσης")
     + "<h4>Επισκευάσιμο smartphone 349 € vs 299 €, ανά segment</h4>" + hbar([(r.level, r.pct, C1) for r in ctsp.itertuples()], label_w=260)
     + cap("% που επιλέγει το επισκευάσιμο · T0 · CROSSTABS.csv"))

# ================================================================== 13. refurbished (discount)
rf_keys = ["refurb_A", "refurb_B", "new"]
rf_names = {"refurb_A": "Refurbished κατασκευαστή (με έκπτωση)", "refurb_B": "Μεταχειρισμένο από τρίτο, 150 €", "new": "Νέο, 299 €"}
page(head(12, "Refurbished Preference Scenarios", "Νέο smartphone 299 € έναντι ανακατασκευασμένου (μοντέλο ΗΠΑ 2019, άδεια CC BY-NC)")
     + '<p class="lead">Κάθε σενάριο έχει τρεις επιλογές, όπως το αρχικό πείραμα: νέο στα 299 €, ανακατασκευασμένο από τον κατασκευαστή με έκπτωση d, και μεταχειρισμένο από μη εξουσιοδοτημένο τρίτο στο μισό της τιμής (150 €).</p>'
     + stack100([(f"Έκπτωση {s}", {k: get("RF1", s, k) for k in rf_keys}) for s in scen("RF1")], rf_keys, [C1, C4, C3], rf_names)
     + cap("% των 500 κληρωμένων επιλογών · T0")
     + line_chart([("Refurbished κατασκευαστή", [get("RF1", s, "refurb_A") for s in scen("RF1")], C1, False), ("Νέο", [get("RF1", s, "new") for s in scen("RF1")], C3, False),
                   ("Refurbished (μέση πιθανότητα)", [get("RF1", s, "refurb_A", "T0", "p") for s in scen("RF1")], C2, True)], scen("RF1"), "Έκπτωση του ανακατασκευασμένου έναντι της τιμής του νέου", h=210, ymax=80)
     + cap("% επιλογής · T0")
     + f'<p class="body">Η έκπτωση είναι ο κύριος μοχλός: το ανακατασκευασμένο ανεβαίνει από {f1(get("RF1", "10%", "refurb_A"))}% σε {f1(get("RF1", "60%", "refurb_A"))}%. Παίρνει μερίδιο κυρίως από το μεταχειρισμένο και λιγότερο από το νέο, που κινείται μόνο από {f1(get("RF1", "10%", "new"))}% σε {f1(get("RF1", "60%", "new"))}%. Η πηγή είναι δείγμα MTurk με ισχυρή προτίμηση για refurbished. Το επίπεδο του «νέου» είναι από τα πιο αβέβαια μεγέθη της μεταφοράς.</p>')

# ================================================================== 14. refurbished (seller/condition)
sel = scen("RF2")
cond = scen("RF3")
page(head(13, "Who Sells It, and in What Condition", "Εμπιστοσύνη στον πωλητή και κατάσταση του προϊόντος (έκπτωση 30%)")
     + "<h4>Ποιος πωλεί το ανακατασκευασμένο</h4>" + stack100([(s, {k: get("RF2", s, k) for k in rf_keys}) for s in sel], rf_keys, [C1, C4, C3],
                                                              {**rf_names, "refurb_A": "Ανακατασκευασμένο −30% (209 €)"})
     + cap("% των 500 κληρωμένων επιλογών · T0")
     + "<h4>Κατάσταση του προϊόντος (εξουσιοδοτημένος πωλητής)</h4>" + stack100([(s, {k: get("RF3", s, k) for k in rf_keys}) for s in cond], rf_keys, [C1, C4, C3],
                                                                              {**rf_names, "refurb_A": "Προσφορά −30% (209 €)"})
     + cap("% των 500 κληρωμένων επιλογών · T0")
     + f'<p class="body">Ο πωλητής μετρά περισσότερο από την κατάσταση. Από μη εξουσιοδοτημένο τρίτο σε κατασκευαστή, το μερίδιο της προσφοράς ανεβαίνει από {f1(get("RF2", sel[0], "refurb_A"))}% σε {f1(get("RF2", sel[2], "refurb_A"))}%. Από μεταχειρισμένο σε «open box» ανεβαίνει από {f1(get("RF3", cond[0], "refurb_A"))}% σε {f1(get("RF3", cond[2], "refurb_A"))}%. Η πιστοποίηση από τον κατασκευαστή ή από εξουσιοδοτημένο συνεργάτη είναι το πιο ισχυρό εργαλείο στο μοντέλο, μαζί με την έκπτωση.</p>'
     + '<p class="mini">Το μοντέλο refurbished βασίζεται σε δεδομένα με άδεια CC BY-NC 4.0 (Kurdhi, Dabadghao &amp; Fransoo). Τα αποτελέσματα αυτής της ενότητας προορίζονται για μη εμπορική ερευνητική χρήση· για εμπορική χρήση απαιτείται άδεια των δημιουργών. Το εύρος τιμών του μοντέλου (νέο έως ~311 € στη βασική υπόθεση) δεν καλύπτει ακριβά smartphones.</p>')

# ================================================================== 15. delivery
xd1, sd1 = curve_series("DL1", "drone")
xd2, sd2 = curve_series("DL2", "drone")
page(head(14, "Delivery Preferences", "Γρήγορη παράδοση εντός ημέρας: χρόνος, χρέωση και ιδιωτικότητα (μοντέλο ΗΠΑ 2022)")
     + "<h4>Ψώνια τελευταίας στιγμής: drone σε 20′ με χρέωση έναντι επίγειας σε 45′ με 1 €</h4>" + line_chart(sd1, xd1, "Χρέωση παράδοσης με drone", h=215, ymin=20, ymax=100, xfmt=lambda x: f"{float(x):.2f} €".replace(".", ","))
     + cap("% που επιλέγει drone · T0")
     + "<h4>Φαγητό σε πακέτο: drone σε 15′ έναντι επίγειας σε 45′ με 1 €</h4>" + line_chart(sd2, xd2, "Χρέωση παράδοσης με drone", h=215, ymin=20, ymax=100, xfmt=lambda x: f"{float(x):.2f} €".replace(".", ","))
     + cap("% που επιλέγει drone · T0")
     + f'<p class="body">Με ίση χρέωση (1 €), η ταχύτερη παράδοση επιλέγεται από το {f1(get("DL1", "1.00", "drone"))}% (ψώνια) και το {f1(get("DL2", "1.00", "drone"))}% (φαγητό). Κάθε επιπλέον 0,25 € μειώνει την προτίμηση κατά 4–9 μονάδες στο εύρος 1–2 €. <b>Πεδίο:</b> το μοντέλο αφορά παράδοση σε λεπτά ή ώρες· η παράδοση οικιακών συσκευών σε ημέρες είναι εκτός πεδίου και δεν απαντήθηκε.</p>')

# ================================================================== 16. delivery 2 + crosstabs
xd3, sd3 = curve_series("DL3", "drone")
ag = CT[(CT.question_id == "DL1") & (CT.scenario_id == "1.00") & (CT.alt_id == "drone") & (CT.variable == "age_band")].sort_values("level")
gd = CT[(CT.question_id == "DL1") & (CT.scenario_id == "1.00") & (CT.alt_id == "drone") & (CT.variable == "gender")]
page(head(15, "Delivery: Pharmacy, Privacy and Who Chooses Drones", "Φάρμακα με συνταγή, προστασία δεδομένων, ηλικία και φύλο")
     + "<h4>Φάρμακα: drone σε 30′ με χρέωση έναντι δωρεάν επίγειας σε 6 ώρες</h4>" + line_chart(sd3, xd3, "Χρέωση παράδοσης με drone", h=200, ymax=60, xfmt=lambda x: f"{float(x):.2f} €".replace(".", ","))
     + cap("% που επιλέγει drone · T0")
     + '<div class="two"><div><h4>Ψώνια, drone 1 € σε 20′: ανά ηλικία</h4>' + hbar([(r.level, r.pct, C1) for r in ag.itertuples()], width=360, label_w=70, row_h=24) + "</div>"
     + '<div><h4>Ανά φύλο · και προστασία δεδομένων</h4>' + hbar([(r.level, r.pct, C3) for r in gd.itertuples()] + [("Με προστασία δεδομένων", get("DL4", "με προστασία", "drone"), C4), ("Χωρίς προστασία", get("DL4", "χωρίς προστασία", "drone"), C2)], width=360, label_w=175, row_h=24) + "</div></div>"
     + cap("% που επιλέγει drone · T0 · ηλικία και φύλο είναι όροι του μοντέλου παράδοσης (CROSSTABS.csv)")
     + f'<p class="body">Για φάρμακα, η άμεση παράδοση δεν αξίζει πολλά όταν η εναλλακτική είναι δωρεάν: {f1(get("DL3", "0.00", "drone"))}% χωρίς χρέωση, {f1(get("DL3", "2.00", "drone"))}% στα 2 €. Οι 65+ επιλέγουν drone σε μικρότερο ποσοστό ({f1(float(ag[ag.level == "65+"].pct.iloc[0]))}% έναντι {f1(float(ag[ag.level == "25-34"].pct.iloc[0]))}% στους 25-34). Η έλλειψη προστασίας δεδομένων μειώνει την προτίμηση από {f1(get("DL4", "με προστασία", "drone"))}% σε {f1(get("DL4", "χωρίς προστασία", "drone"))}%. Οι ηλικιακές διαφορές προέρχονται από τους όρους του μοντέλου (ΗΠΑ) και εφαρμόζονται στην ελληνική ηλικιακή κατανομή.</p>')

# ================================================================== 17. price sensitivity
ps_rows = []
for q, lab_, alt, unit in [("WM1", "Πλυντήριο: πλήρως επισκευάσιμο", "A", 100), ("WM2", "Πλυντήριο: 15 έτη", "A", 100), ("WM3", "Πλυντήριο: κλάση A", "A", 100), ("WM4", "Πλυντήριο: κυκλικό", "A", 100),
                           ("WM5", "Πλυντήριο: μη επισκευάσιμο", "A", 100), ("SP1", "Smartphone: επισκευάσιμο", "A", 100), ("SP2", "Smartphone: 8 έτη", "A", 100), ("SP3", "Smartphone: κλάση A", "A", 100),
                           ("SP4", "Smartphone: μη επισκευάσιμο", "A", 100), ("DL1", "Drone ψώνια (ανά 1 €)", "drone", 1), ("DL2", "Drone φαγητό (ανά 1 €)", "drone", 1), ("DL3", "Drone φάρμακα (ανά 1 €)", "drone", 1)]:
    xs_ = scen(q)
    xv = [float(s) for s in xs_]
    ps = [get(q, s, alt, "T0", "p") for s in xs_]
    slope = (ps[-1] - ps[0]) / (xv[-1] - xv[0]) * unit
    sl = {}
    for aid in ("T1", "T2", "T3"):
        pts = [(x, get(q, s, alt, aid, "p")) for x, s in zip(xv, xs_) if get(q, s, alt, aid, "p") is not None]
        sl[aid] = f1((pts[-1][1] - pts[0][1]) / (pts[-1][0] - pts[0][0]) * unit) if len(pts) >= 2 and pts[-1][0] > pts[0][0] else "—"
    ps_rows.append((esc(lab_), f"{eur(xv[0])} – {eur(xv[-1])}", f1(ps[0]), f1(ps[-1]), f"<b>{f1(slope)}</b>", sl["T1"], sl["T2"], sl["T3"]))
page(head(16, "Price Sensitivity", "Πόσο αλλάζει η επιλογή όταν αλλάζει η τιμή, ανά κατηγορία και υπόθεση μεταφοράς")
     + table(["Καμπύλη", "Εύρος τιμής", "Πιθ. στην αρχή %", "Πιθ. στο τέλος %", "Μονάδες ανά 100 € (T0)", "T1", "T2", "T3"], ps_rows)
     + cap("Μέση μεταβολή της μέσης πιθανότητας στο εύρος της καμπύλης· για παράδοση ανά 1 € · «—» = λιγότερα από 2 σημεία εντός πεδίου")
     + '<p class="body"><b>Ανάγνωση.</b> Η ίδια αύξηση τιμής μειώνει την προτίμηση περίπου 2–3 φορές περισσότερο στα smartphones απ\' ό,τι στα πλυντήρια. Αυτό απηχεί κυρίως τη διαφορά των δύο ελβετικών υπο-δειγμάτων: όσοι αξιολόγησαν smartphones ήταν πιο ευαίσθητοι στην τιμή σε σχέση με το εύρος τιμών τους. Η χρέωση παράδοσης έχει τη μεγαλύτερη σχετική επίδραση, γιατί αφορά μικρά ποσά σε αγορές μικρής αξίας.</p>'
     + '<p class="body"><b>Ως προς τις υποθέσεις.</b> Όσο υψηλότερος ο συντελεστής μετατροπής (T2 > T0 > T1 > T3), τόσο πιο «βαριά» μεταφράζεται το ευρώ στο ξένο μοντέλο. Τότε οι καμπύλες γίνονται πιο απότομες. Με απλή ονομαστική ισοτιμία (T3), η αντίδραση στην τιμή υποεκτιμάται συστηματικά, γιατί αγνοεί ότι οι Έλληνες έχουν χαμηλότερο εισόδημα και χαμηλότερο επίπεδο τιμών.</p>'
     + '<p class="mini">Οι μεταβολές αυτές περιγράφουν τη συμπεριφορά του μεταφερμένου μοντέλου. Δεν είναι ελληνικές ελαστικότητες τιμής και δεν μεταφράζονται σε ελληνικά ποσά προθυμίας πληρωμής.</p>')

# ================================================================== 18. segments (washing machine)
segwm = A["segments"]["washing_machine"]
order = sorted(segwm.items(), key=lambda x: -x[1]["pct"])
imp_rows = [(esc(k), f1(v["pct"]) + "%", *[f'{v["mean_importance"][c]:.2f}'.replace(".", ",") for c in ("price", "lifespan", "repairability", "energy")]) for k, v in order]
sc_ = A["segment_choice"]
sc_rows = [(esc(k),) + tuple(f1(sc_[key_].get(k)) for key_ in ("WM1|649", "WM2|649", "WM3|649", "WM4|749", "WM6|Premium(A) vs Βασικό(B)")) for k, _ in order]
page(head(17, "Consumer Segments", "Πλυντήρια: τέσσερα segments από τους ατομικούς συντελεστές του μοντέλου")
     + hbar([(k, v["pct"], [C1, C2, C3, C4][i]) for i, (k, v) in enumerate(order)], label_w=270, maxv=50)
     + cap("% των 500 · k-means (k = 4, σταθερό seed) στα σχετικά μερίδια σημασίας των χαρακτηριστικών · T0")
     + table(["Segment", "Μέγεθος", "Τιμή (450 €)", "Διάρκεια (10 έτη)", "Επισκευασιμότητα", "Ενεργειακή κλάση"], imp_rows)
     + cap("Μέση σημασία = εύρος χρησιμότητας που αποδίδει το άτομο σε κάθε χαρακτηριστικό (μονάδες χρησιμότητας)")
     + table(["Segment", "Επισκευάσιμο 649 €", "15 έτη 649 €", "Κλάση A 649 €", "Κυκλικό 749 €", "Premium vs βασικό"], sc_rows)
     + cap("% που επιλέγει την αναβαθμισμένη εκδοχή · T0 · CROSSTABS.csv")
     + '<p class="body">Τα segments δεν προκύπτουν από δημογραφικά: το μοντέλο πλυντηρίου δεν έχει τέτοιους όρους. Προκύπτουν από την ετερογένεια προτιμήσεων που εκτιμήθηκε στο πείραμα (mixed logit). Είναι ενδεικτικά του <i>είδους</i> των τμημάτων που θα αναζητούσε μια πραγματική μέτρηση. Δεν αποτελούν απογραφή της ελληνικής αγοράς. Το segment με έμφαση στην τιμή επιλέγει σαφώς λιγότερο τις ακριβότερες αναβαθμίσεις· τα υπόλοιπα διαφέρουν κυρίως στο ποια αναβάθμιση προτιμούν.</p>')

# ================================================================== 19. sensitivity analysis
xs1 = scen("WM1")
sens_wm = [(AS_NAME[a], [get("WM1", s, "A", a) for s in xs1], AS_COL[a], False) for a in ("T0", "T1", "T2", "T3")]
xd = scen("DL1")
sens_dl = [(AS_NAME[a], [get("DL1", s, "drone", a) for s in xd], AS_COL[a], False) for a in ("T0", "T1", "T2", "T3")]
page(head(18, "Sensitivity Analysis: Transfer Assumptions", "Πόσο αλλάζουν τα αποτελέσματα ανά υπόθεση οικονομικής μεταφοράς")
     + "<h4>Πλήρως επισκευάσιμο πλυντήριο (WM1)</h4>" + line_chart(sens_wm, xs1, "Τιμή του πλήρως επισκευάσιμου πλυντηρίου", h=215, ymin=30, ymax=90, xfmt=lambda x: f"{x} €")
     + cap("% κληρωμένων επιλογών · κενά σημεία = εκτός πεδίου εκπαίδευσης στην υπόθεση (απορρίφθηκαν)")
     + "<h4>Drone για ψώνια (DL1)</h4>" + line_chart(sens_dl, xd, "Χρέωση παράδοσης με drone", h=215, ymin=0, ymax=100, xfmt=lambda x: f"{float(x):.2f} €".replace(".", ","))
     + cap("% κληρωμένων επιλογών")
     + f'<p class="body">Η υπόθεση μεταφοράς αλλάζει το <b>μέγεθος</b> της αντίδρασης στην τιμή, όχι την κατεύθυνση ή τη σειρά των ευρημάτων. Σε κάθε υπόθεση, για τα σενάρια εντός πεδίου, ισχύουν τα ίδια: το κυκλικό πλυντήριο κερδίζει, η κλάση A προτιμάται, το drone χάνει έδαφος με τη χρέωση. Το refurbished κατασκευαστή ξεπερνά το μεταχειρισμένο τρίτου στις T0, T1 και T3· στην T2 τα σενάρια refurbished είναι εκτός πεδίου. Οι αποκλίσεις από το T0 φτάνουν έως {f1(max(v["T1"] for v in V["8_transfer_effect_max_abs_pp"].values() if v["T1"] is not None))} μονάδες (T1), {f1(max(v["T2"] for v in V["8_transfer_effect_max_abs_pp"].values() if v["T2"] is not None))} (T2) και {f1(max(v["T3"] for v in V["8_transfer_effect_max_abs_pp"].values() if v["T3"] is not None))} (T3).</p>')

# ================================================================== 20. sensitivity table
eff = V["8_transfer_effect_max_abs_pp"]
QORD = ["WM1", "WM2", "WM3", "WM4", "WM5", "WM6", "WM7", "WM8", "SP1", "SP2", "SP3", "SP4", "SP5", "RF1", "RF2", "RF3", "DL1", "DL2", "DL3", "DL4"]
eff = {q: eff[q] for q in QORD if q in eff}
erows = [(q, f1(v["T1"]), f1(v["T2"]), f1(v["T3"]), f'{v["T2_T3_answered_share"].get("T2", 0) * 100:.0f}%', f'{v["T2_T3_answered_share"].get("T3", 0) * 100:.0f}%') for q, v in eff.items()]
segs_ = A["segment_sensitivity_wm"]
names_seg = {"price": "Τιμή", "lifespan": "Διάρκεια", "energy": "Ενεργ. κλάση", "balanced": "Ισορροπημένοι", "repairability": "Επισκευασιμότητα", "moderate_price": "Μέτρια τιμή"}
allk = sorted({k for v in segs_.values() for k in v})
srow = [(AS_NAME[a],) + tuple(f1(segs_[a].get(k)) for k in allk) for a in ("T0", "T1", "T2", "T3")]
page(head(19, "Sensitivity Analysis: Summary", "Μέγιστη απόκλιση από τη βασική υπόθεση και κάλυψη ανά ερώτηση")
     + table(["Ερώτηση", "Μέγ. |Δ| T1 (μον.)", "Μέγ. |Δ| T2", "Μέγ. |Δ| T3", "Σενάρια εντός πεδίου T2", "Σενάρια εντός πεδίου T3"], erows)
     + cap("Μέγιστη απόλυτη διαφορά μεριδίου (κληρωμένες επιλογές) από το T0 σε κοινά σενάρια · VALIDATION.md")
     + "<h4>Μέγεθος segments πλυντηρίου ανά υπόθεση (%)</h4>" + table(["Υπόθεση"] + [names_seg.get(k, k) for k in allk], srow)
     + cap("Η σημασία της τιμής εξαρτάται από τον συντελεστή μετατροπής· τα segments επανυπολογίζονται σε κάθε υπόθεση")
     + '<p class="body">Η υπόθεση <b>T2</b> (ίσο μερίδιο εισοδήματος) αφήνει εκτός πεδίου όλα τα σενάρια smartphone και refurbished: οι ελληνικές τιμές μεταφράζονται σε ποσά πάνω από όσα είδαν οι ξένοι ερωτώμενοι. Η <b>T3</b> αφήνει εκτός τα φθηνά πλυντήρια. Η πύλη απορρίπτει όπου το μοντέλο δεν έχει δεδομένα.</p>')

# ================================================================== 21. commercial implications
page(head(20, "Commercial Implications", "Υποθέσεις για δράση και έλεγχο, με βάση τη μεταφορά των μοντέλων")
     + f'''<div class="imp"><div class="ic"><h4>1 · Πουλήστε «συνολικό κόστος ζωής», όχι τιμή</h4><p>Στα πλυντήρια, η ενεργειακή κλάση και η διάρκεια ζωής αντισταθμίζουν διαφορές 150–350 € (π.χ. κυκλικό {f1(get("WM4", "899", "A"))}% στα 899 €). Η προβολή κόστους λειτουργίας και διάρκειας στο ράφι και online είναι η πρώτη υπόθεση προς δοκιμή.</p></div>
<div class="ic"><h4>2 · Η επισκευασιμότητα ως χαρακτηριστικό προϊόντος</h4><p>Ένα μη επισκευάσιμο πλυντήριο χρειάζεται μεγάλη έκπτωση για να ανταγωνιστεί ({f1(get("WM5", "349", "A"))}% στα 349 €). Η εμφανής σήμανση επισκευασιμότητας (ανταλλακτικά, δείκτης) μπορεί να στηρίξει μίγμα υψηλότερης αξίας.</p></div>
<div class="ic"><h4>3 · Refurbished: πιστοποίηση πριν από την έκπτωση</h4><p>Η μετάβαση από μη εξουσιοδοτημένο τρίτο σε πιστοποίηση κατασκευαστή αυξάνει την επιλογή κατά {f1(get("RF2", "κατασκευαστής", "refurb_A") - get("RF2", "μη εξουσιοδοτημένος τρίτος", "refurb_A"))} μονάδες στην ίδια έκπτωση. Ένα πρόγραμμα certified refurbished σε συνεργασία με κατασκευαστές είναι η ισχυρότερη υπόθεση.</p></div>
<div class="ic"><h4>4 · Smartphones: πιο ευαίσθητα στην τιμή</h4><p>Οι αναβαθμίσεις χάνουν την πλειοψηφία με +100–150 €. Οι προσφορές επισκευάσιμων ή μακρόβιων smartphones χρειάζονται μικρότερη διαφορά τιμής απ' ό,τι στις λευκές συσκευές.</p></div>
<div class="ic"><h4>5 · Γρήγορη παράδοση με χαμηλή χρέωση</h4><p>Η ταχύτερη παράδοση κερδίζει με ίση χρέωση, αλλά χάνει γρήγορα πάνω από ~1,5 €. Οι μεγαλύτερες ηλικίες είναι λιγότερο δεκτικές. Η εμπιστοσύνη στα δεδομένα (ιδιωτικότητα) μετρά σχεδόν όσο η χρέωση.</p></div>
<div class="ic"><h4>6 · Επόμενο βήμα: ελληνική μέτρηση</h4><p>Το σχέδιο πειράματος της CCE (CHOICE_EXPERIMENT_DESIGN) μετατρέπει αυτές τις υποθέσεις σε ελληνικές εκτιμήσεις. Καλύπτει επίσης όσα δεν απαντήθηκαν εδώ: επισκευή ή αντικατάσταση, trade-in, εγγύηση, δόσεις. Pilot 150 ατόμων και κύριο πεδίο περίπου 800–1.650.</p></div></div>'''
     + '<p class="body" style="margin-top:4mm">Οι προτάσεις βασίζονται σε προτιμήσεις ξένων ερωτωμένων εφαρμοσμένες σε ελληνικά προφίλ. Είναι κατάλληλες για ιεράρχηση υποθέσεων και για τον σχεδιασμό δοκιμών και μετρήσεων, όχι για τελική τιμολόγηση.</p>')

# ================================================================== 22. methodology
v1 = V["1_shares_vs_records"]
c23 = V["2_3_consistency_monotonicity"]
page(head(21, "Methodology", "Πάνελ, μοντέλα, μεταφορά, προσομοίωση")
     + f'''<div class="meth"><p><b>Συνθετικοί καταναλωτές.</b> 500 συνθετικά προφίλ (C001–C500) από τον βαθμονομημένο πληθυσμό του Lab, τα ίδια με τη μελέτη «Repair, Replace or Upgrade?». Ηλικία, φύλο, περιφέρεια, εκπαίδευση, νοικοκυριό και εισόδημα ακολουθούν ΕΛΣΤΑΤ/Eurostat. <b>Δεν είναι πραγματικοί ερωτώμενοι.</b></p>
<p><b>Συντελεστές προτίμησης: εκπαιδευμένοι εκτός Ελλάδας.</b> Τέσσερα artifacts του CCE 0.1 (panel mixed logit), εκτιμημένα σε πραγματικές επιλογές:</p>
<ul><li>Ελβετία 2021-22: πλυντήρια, 1.118 ερωτώμενοι· smartphones, 1.145. Πείραμα κυκλικών προϊόντων, CC BY 4.0.</li>
<li>ΗΠΑ 2019: νέο ή refurbished smartphone, 202 ερωτώμενοι, CC BY-NC 4.0.</li>
<li>ΗΠΑ 2022: παράδοση, 3.625 ερωτώμενοι.</li></ul>
<p>Η απόδοσή τους σε νέους ερωτώμενους της χώρας προέλευσης τεκμηριώνεται στο VALIDATION_REPORT της CCE. Οι συντελεστές <b>δεν τροποποιήθηκαν</b>: το SHA-256 κάθε artifact ελέγχθηκε πριν και μετά.</p>
<p><b>experimental_transfer_mode.</b> Ξεχωριστή λειτουργία (<code>cce/transfer.py</code>) που ενεργοποιείται μόνο ρητά. Μετατρέπει τα ευρώ στις μονάδες του μοντέλου: αναγωγή με ελληνικό HICP στο έτος του πειράματος, PPP ιδιωτικής κατανάλωσης, προσαρμογή εισοδήματος με εκθέτη ε. Τέσσερις υποθέσεις:</p>
<ul><li><b>T0:</b> ε = 0,5 (βασική).</li><li><b>T1:</b> ε = 0.</li><li><b>T2:</b> ε = 1.</li><li><b>T3:</b> ονομαστική ισοτιμία.</li></ul>
<p>Η πύλη εφαρμοσιμότητας μένει ενεργή: σενάρια εκτός εύρους απορρίπτονται. Κάθε αποτέλεσμα σφραγίζεται EXPERIMENTAL_CROSS_COUNTRY_TRANSFER.</p>
<p><b>Προσομοίωση.</b> Κάθε καταναλωτής έχει σταθερές κληρώσεις από την εκτιμημένη κατανομή προτιμήσεων: seed 20261030 και το ID του. Σε κάθε ερώτηση έχει επίσης σταθερά σφάλματα Gumbel (κοινοί τυχαίοι αριθμοί). Έτσι, όποιος απορρίπτει μια προσφορά σε χαμηλή τιμή δεν την επιλέγει σε υψηλότερη. Κάθε άτομο έχει ατομική πιθανότητα για κάθε εναλλακτική και επιλέγει τη μέγιστη χρησιμότητα. Τα ποσοστά υπολογίζονται από τις 500 επιλογές. Οι μέσες πιθανότητες αναφέρονται χωριστά. Τα διαστήματα 95% είναι Krinsky–Robb με 200 κληρώσεις παραμέτρων· παράμετροι με εκφυλισμένο SE κρατήθηκαν σταθερές.</p>
<p><b>Segments.</b> k-means (k = 4) στα σχετικά μερίδια σημασίας τιμής, διάρκειας, επισκευασιμότητας και ενεργειακής κλάσης, από τους ατομικούς συντελεστές.</p>
<p><b>Διασταυρώσεις.</b> Μόνο για μεταβλητές που επηρεάζουν το μοντέλο: ηλικία και φύλο στην παράδοση· segments. Για ηλικία, εισόδημα ή περιοχή στα μοντέλα συσκευών δεν παράγονται, γιατί το μοντέλο δεν έχει τέτοιους όρους.</p>
<p><b>Επικύρωση εκτέλεσης.</b></p>
<ul><li>{v1["result_rows_checked"]} γραμμές αποτελεσμάτων έναντι των εγγραφών: {v1["share_mismatches"]} αποκλίσεις.</li>
<li>{c23["total_choice_reversals"]} ατομικές αντιστροφές σε όλες τις καμπύλες τιμής, έκπτωσης και χρέωσης.</li>
<li>Επανεκτέλεση: πανομοιότυπα αποτελέσματα.</li>
<li>Ανεξάρτητος επανυπολογισμός των πιθανοτήτων: μέγιστη διαφορά {V["5_independent_recomputation"]["max_abs_probability_diff"]:.1e}.</li></ul>
<p>Αυτό επικυρώνει την <b>εκτέλεση</b>, όχι την εγκυρότητα για την Ελλάδα.</p></div>''')

# ================================================================== 23. validity & coverage
uns = "".join(f'<li><b>{esc(q["question_id"])}</b> {esc(q["text"])}: <code>{esc(q["gate"])}</code></li>' for q in V["11_unsupported"])
page(head(22, "What the Results Can and Cannot Support", "Επιτυχής εκτέλεση έναντι εξωτερικής εγκυρότητας")
     + '<div class="two"><div class="ic" style="border-top-color:#0f766e"><h4>Τι αποδεικνύει η εκτέλεση</h4><p>Το CCE 0.1 εφαρμόστηκε με συνέπεια σε 500 ελληνικά προφίλ. Οι αριθμοί είναι αναπαραγώγιμοι, συνεπείς ανά άτομο και μονότονοι ως προς την τιμή, και προέρχονται αποκλειστικά από εκπαιδευμένους συντελεστές. Δείχνει τι συνεπάγονται οι ξένες προτιμήσεις για ελληνικές τιμές, υπό ρητές υποθέσεις.</p></div>'
     + '<div class="ic" style="border-top-color:#b4413a"><h4>Τι δεν αποδεικνύει</h4><p>Ότι οι Έλληνες καταναλωτές έχουν αυτές τις προτιμήσεις. Δεν υπάρχει ελληνική εξωτερική επικύρωση, ελληνική ελαστικότητα τιμής ή ελληνική WTP. Το ελβετικό μοντέλο είχε ήδη στην πηγή ασθενή ευαισθησία στην τιμή, και το δείγμα refurbished (MTurk) είναι μικρό.</p></div></div>'
     + f'<h4>Ερωτήσεις χωρίς εκπαιδευμένους συντελεστές (καμία απάντηση)</h4><ul class="el">{uns}</ul>'
     + '<p class="body">Οι ερωτήσεις αυτές, μαζί με τις υπόλοιπες του αρχικού ερωτηματολογίου, βρίσκονται στο QUESTIONNAIRE.md με την ένδειξη «χωρίς μοντέλο». Το ελάχιστο ελληνικό πείραμα της CCE καλύπτει επισκευή ή αντικατάσταση, trade-in, εγγύηση και παράδοση συσκευών.</p>'
     + '<h4>Παραδοτέα</h4><p class="mini">SYNTHETIC_PANEL.csv · INDIVIDUAL_CHOICES.csv · CHOICE_PROBABILITIES.csv · SCENARIOS.csv · RESULTS.csv · CROSSTABS.csv · QUESTIONNAIRE.md · TRANSFER_ASSUMPTIONS.md · VALIDATION.md · INTERACTIVE_LAB/ · κώδικας: models/consumer-choice-engine/studies/greece500/</p>')

CSS = (Path(__file__).with_name("report.css")).read_text(encoding="utf-8")
doc = f'''<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Repair, Replace or Upgrade? — Greece 500</title><style>{CSS}</style></head><body><main>{"".join(PAGES)}</main></body></html>'''
(D / "EXECUTIVE_REPORT.html").write_text(doc, encoding="utf-8")
print(f"OK {len(PAGES)} σελίδες")
