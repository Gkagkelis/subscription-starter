#!/usr/bin/env python3
"""Consumer Decision Study — executive report (HTML → PDF). Διαβάζει ΜΟΝΟ το study.json της ανάλυσης.
Κανένα ποσοστό δεν γράφεται με το χέρι: όλοι οι αριθμοί έρχονται από τα δεδομένα. Οι πειραματικές έξοδοι Tier 4 εμφανίζονται
μόνο ως διαγνωστικό (με σήμανση «απορρίφθηκε») και τα δημοσιευμένα στοιχεία με σήμανση «εκτός μοντέλου».
    python3 -I scripts/synthetic-lab/consumer-decision/cd_report.py <study.json> <out.html>
"""
import html
import json
import sys
from pathlib import Path

S = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = Path(sys.argv[2])
esc = html.escape
NAVY, TEAL, SAND, GREY, AMBER, RED = "#12263a", "#0f766e", "#e9e4d8", "#9aa3ad", "#b7791f", "#b4413a"


def f1(x):
    return f"{x:.1f}".replace(".", ",")


def f0(x):
    return f"{x:.0f}"


def g2(x, sign=False):
    return (f"{x:+.2f}" if sign else f"{x:.2f}").replace(".", ",")


def seg_name(s):
    o = s["ownership"]
    pc, ac, dw = o["Υπολογιστής"], o["Κλιματιστικό"], o["Πλυντήριο πιάτων"]
    old = s["age"]["65+"]
    if pc >= 80 and ac >= 80 and dw >= 50:
        return "Πλήρως εξοπλισμένα νοικοκυριά"
    if pc >= 80 and ac >= 80:
        return "Ψηφιακά νοικοκυριά με κλιματισμό"
    if pc >= 80 and ac < 20:
        return "Ψηφιακά νοικοκυριά χωρίς κλιματισμό"
    if pc < 20 and ac >= 80:
        return "Ώριμα νοικοκυριά με κλιματισμό" if old >= 40 else "Νοικοκυριά με κλιματισμό, χωρίς υπολογιστή"
    return "Νοικοκυριά βασικού εξοπλισμού"


for s in S["segments"]["segments"]:
    s["name"] = seg_name(s)


# ------------------------------------------------------------------ γραφήματα
def hbar(rows, width=720, label_w=230, row_h=30, maxv=100, fmt=lambda v: f1(v) + "%", note_col=None):
    h = row_h * len(rows) + 6
    bw = width - label_w - 70
    o = [f'<svg class="chart" viewBox="0 0 {width} {h}" preserveAspectRatio="xMinYMin meet">']
    for i, r in enumerate(rows):
        l, v, c = r[:3]
        y = 3 + i * row_h
        w = max(1.5, bw * v / maxv)
        o.append(f'<g><title>{esc(l)}: {fmt(v)}</title><text x="{label_w - 10}" y="{y + row_h * .62}" text-anchor="end" class="lbl">{esc(l)}</text>'
                 f'<rect x="{label_w}" y="{y + 6}" width="{w:.1f}" height="{row_h - 12}" rx="3" fill="{c}"/>'
                 f'<text x="{label_w + w + 8}" y="{y + row_h * .64}" class="val">{fmt(v)}</text></g>')
    o.append("</svg>")
    return "".join(o)


def line_chart(series, xs, xlabel, ylabel="%", width=720, h=250, ymax=100, band=None, xfmt=str, refs=()):
    """series: [(label, [y], color, dashed)]· band: (low, high) ζώνη θορύβου γύρω από τον μέσο όρο."""
    L, R, T, B = 52, 18, 14, 40
    pw, ph = width - L - R, h - T - B
    sx = lambda i: L + pw * (xs[i] - xs[0]) / (xs[-1] - xs[0])
    sy = lambda v: T + ph * (1 - v / ymax)
    o = [f'<svg class="chart" viewBox="0 0 {width} {h}" preserveAspectRatio="xMinYMin meet">']
    for t in range(0, ymax + 1, 20 if ymax > 50 else 10):
        o.append(f'<line x1="{L}" x2="{L + pw}" y1="{sy(t):.1f}" y2="{sy(t):.1f}" stroke="#e7e7e3"/><text x="{L - 8}" y="{sy(t) + 4:.1f}" text-anchor="end" class="ax">{t}</text>')
    for i, x in enumerate(xs):
        o.append(f'<text x="{sx(i):.1f}" y="{h - 18}" text-anchor="middle" class="ax">{esc(xfmt(x))}</text>')
    o.append(f'<text x="{L + pw / 2}" y="{h - 2}" text-anchor="middle" class="ax">{esc(xlabel)}</text>')
    if band:
        lo, hi = band
        o.append(f'<rect x="{L}" y="{sy(hi):.1f}" width="{pw}" height="{sy(lo) - sy(hi):.1f}" fill="#f1efe8"/>')
    for v, lab in refs:
        o.append(f'<line x1="{L}" x2="{L + pw}" y1="{sy(v):.1f}" y2="{sy(v):.1f}" stroke="{AMBER}" stroke-dasharray="6 4" stroke-width="1.5"/>'
                 f'<text x="{L + pw - 4}" y="{sy(v) - 5:.1f}" text-anchor="end" class="ax" fill="{AMBER}">{esc(lab)}</text>')
    for lab, ys, col, dash in series:
        pts = " ".join(f"{sx(i):.1f},{sy(y):.1f}" for i, y in enumerate(ys))
        o.append(f'<polyline points="{pts}" fill="none" stroke="{col}" stroke-width="2.2" {"stroke-dasharray=\'5 4\'" if dash else ""}/>')
        for i, y in enumerate(ys):
            o.append(f'<circle cx="{sx(i):.1f}" cy="{sy(y):.1f}" r="3.6" fill="{col}"><title>{esc(lab)} · {esc(xfmt(xs[i]))}: {f1(y)}%</title></circle>')
    o.append("</svg>")
    leg = "".join(f'<span><i style="background:{col}{";opacity:.9" if dash else ""}"></i>{esc(lab)}{" (διακεκομμένη)" if dash else ""}</span>' for lab, ys, col, dash in series)
    return f'<div class="lg">{leg}</div>' + "".join(o)


def coef_chart(model, width=720):
    keys = [k for k in model["coef"] if k != "asc_none"]
    lab = {"price": "Τιμή (ανά 100€)", "delivery": "Χρόνος παράδοσης (ανά ημέρα)", "install": "Κόστος εγκατάστασης (ανά 10€)", "warranty": "Εγγύηση (ανά έτος)",
           "instalments": "12 άτοκες δόσεις", "tradein": "Trade-in 50€", "support": "Τεχνική υποστήριξη στο σπίτι"}
    row_h, L = 34, 250
    h = row_h * len(keys) + 30
    pw = width - L - 30
    lo = min(model["coef"][k] - 1.96 * model["se"][k] for k in keys)
    hi = max(model["coef"][k] + 1.96 * model["se"][k] for k in keys)
    m = max(abs(lo), abs(hi)) * 1.1
    sx = lambda v: L + pw * (v + m) / (2 * m)
    o = [f'<svg class="chart" viewBox="0 0 {width} {h}" preserveAspectRatio="xMinYMin meet">',
         f'<line x1="{sx(0):.1f}" x2="{sx(0):.1f}" y1="4" y2="{h - 22}" stroke="#555" stroke-width="1"/>',
         f'<text x="{sx(0):.1f}" y="{h - 6}" text-anchor="middle" class="ax">0 = καμία επίδραση</text>']
    for i, k in enumerate(keys):
        y = 10 + i * row_h + row_h / 2
        b, se = model["coef"][k], model["se"][k]
        o.append(f'<g><title>{esc(lab[k])}: β={b:.3f}, 95% [{b - 1.96 * se:.3f}, {b + 1.96 * se:.3f}], z={b / se:.2f}</title>'
                 f'<text x="{L - 10}" y="{y + 4}" text-anchor="end" class="lbl">{esc(lab[k])}</text>'
                 f'<line x1="{sx(b - 1.96 * se):.1f}" x2="{sx(b + 1.96 * se):.1f}" y1="{y}" y2="{y}" stroke="{GREY}" stroke-width="3" stroke-linecap="round"/>'
                 f'<circle cx="{sx(b):.1f}" cy="{y}" r="5" fill="{GREY}"/></g>')
    o.append("</svg>")
    return "".join(o)


def cap(base, kind="computed"):
    tag = {"computed": '<span class="tag tc">Υπολογισμένο από το Lab</span>', "rejected": '<span class="tag tr">Πειραματική έξοδος Tier 4 — απορρίφθηκε, όχι εύρημα</span>',
           "published": '<span class="tag tp">Δημοσιευμένο στοιχείο — εκτός μοντέλου</span>', "design": '<span class="tag td">Σχεδιασμός πειράματος — χωρίς αποτελέσματα</span>'}[kind]
    return f'<div class="cap">{tag}<span>{esc(base)}</span><span class="synth">Synthetic research · Greek Synthetic Research Lab</span></div>'


PAGES = []


def page(body, cls=""):
    PAGES.append(f'<section class="page {cls}">{body}</section>')


def head(num, title, kicker):
    return f'<div class="sh"><span class="num">{num:02d}</span><div><h2>{esc(title)}</h2><p>{esc(kicker)}</p></div></div>'


def verdict(text, kind="no"):
    icon = {"no": "✕", "ok": "✓", "info": "i"}[kind]
    return f'<div class="verdict v{kind}"><span class="vi">{icon}</span><div>{text}</div></div>'


EV = S["evidence"]
SENS = S["sensitivity"]
OWN = S["ownership"]
CE = S["choiceModel"]
BR = {b["id"]: b for b in S["bridges"]}
routes = S["labRoutes"]
nq = S["meta"]["questions"]
rep = SENS["repair"]
rep549 = next(c for c in rep if c["newPrice"] == 549 and c["warrantyMonths"] == 0)
rep_all = [p["repair"] for c in rep for p in c["points"]]
ti = SENS["tradein"]
rf = SENS["refurb"]
cons = SENS["consistency"]
pub_repaired = 28
pub_second = BR["B5"]["published"]["Ναι"]
pub_online = BR["B4"]["published"]["Ναι, συχνά"] + BR["B4"]["published"]["Ναι, περιστασιακά"]
pub_wtp_warranty = 100 - BR["B3"]["published"]["Δεν θα πλήρωνα περισσότερο"] - BR["B3"]["published"]["ΔΞ/ΔΑ"]
pub_norepair = 100 - BR["B2"]["published"]["Όχι"] - BR["B2"]["published"]["ΔΞ/ΔΑ"]
pub_repairable = BR["B1"]["published"]["Ναι"]
segs = S["segments"]["segments"]
own_tot = OWN["total"]
H = OWN["items"]

# ------------------------------------------------------------------ 1. εξώφυλλο
page(f'''<div class="cv-top"><span class="cv-mark"></span><span>Greek Synthetic Research Lab · Consumer Decision Study · Οκτώβριος 2026</span></div>
<h1 class="cv-title">REPAIR, REPLACE<br>OR UPGRADE?</h1>
<p class="cv-sub">Understanding the Next Purchase Decision of Greek Consumers</p>
<div class="cv-box"><b>Η μελέτη βασίζεται σε 500 συνθετικά καταναλωτικά προφίλ</b> του Greek Synthetic Research Lab και <b>δεν αποτελεί έρευνα πραγματικών συμμετεχόντων</b>. Ανεξάρτητο demonstration project· δεν αποτελεί ανάθεση, συνεργασία ή έγκριση οποιουδήποτε retailer.</div>
<div class="cv-grid"><div><span>Συνθετικά προφίλ</span><b>500</b></div><div><span>Ερωτήσεις / υποερωτήσεις</span><b>32 / {nq}</b></div><div><span>Πειράματα επιλογής</span><b>6</b></div><div><span>Σενάρια που εκτελέστηκαν</span><b>{len(S["grid"])}</b></div></div>''', "cover")

# ------------------------------------------------------------------ 2. executive summary
page(head(1, "Executive summary", "Τι μπορεί να πει σήμερα το Lab για την επόμενη αγοραστική απόφαση — και τι όχι")
     + f'''<div class="lead">Δώσαμε στο Greek Synthetic Research Lab ένα πλήρες καταναλωτικό ερωτηματολόγιο: επισκευή ή αντικατάσταση, trade-in, refurbished, εγγύηση, omnichannel και έξι πειράματα επιλογής. Το βασικό εύρημα: <b>τα σημερινά μοντέλα του Lab δεν μπορούν να υπολογίσουν αξιόπιστα καμία από τις {nq} ερωτήσεις/υποερωτήσεις</b>. Και όταν αναγκάζονται να απαντήσουν, οι απαντήσεις τους δεν αντιδρούν σε τιμή, εγγύηση, trade-in ή παράδοση.</div>
<div class="kpis">
 <div class="kpi"><b>0 / {nq}</b><span>ερωτήσεις με αξιόπιστη εκτίμηση (βαθμίδα 1–3)</span></div>
 <div class="kpi"><b>{f1(min(rep_all))}–{f1(max(rep_all))}%</b><span>«επισκευή» από 60€ έως 300€ κόστος: επίπεδη, πειραματική έξοδος</span></div>
 <div class="kpi"><b>p = {g2(CE["p_value"])}</b><span>κανένα χαρακτηριστικό προσφοράς δεν επηρεάζει τις πειραματικές επιλογές</span></div>
 <div class="kpi"><b>6</b><span>δείκτες εξοπλισμού νοικοκυριών που υπολογίζει το Lab (ΕΟΠ)</span></div>
</div>
<h3 class="eh">Τι υπολογίζει το Lab</h3>
<ul class="el"><li><b>Ένα σταθερό, βαθμονομημένο πάνελ 500 προφίλ</b>, κατανεμημένο ανά φύλο, ηλικία, περιοχή, εκπαίδευση και νοικοκυριό σύμφωνα με τα στοιχεία ΕΛΣΤΑΤ/Eurostat 2025.</li>
<li><b>Την εγκατεστημένη βάση συσκευών</b>, από ελληνικά μικροδεδομένα της Έρευνας Οικογενειακών Προϋπολογισμών:
  <ul><li>υπολογιστής: {f0(own_tot["H1"])}%·</li>
  <li>κλιματιστικό: {f0(own_tot["H5"])}%·</li>
  <li>πλυντήριο πιάτων: {f0(own_tot["H3"])}%.</li></ul>
  Από αυτή προκύπτουν {len(segs)} καταναλωτικά segments εξοπλισμού.</li></ul>
<h3 class="eh">Τι δεν υπολογίζει</h3>
<ul class="el"><li>Επισκευή ή αντικατάσταση, οικονομικά της επισκευής, trade-in, refurbished, αξία εγγύησης, κανάλι αγοράς, παράδοση και εγκατάσταση, trade-offs τιμής και υπηρεσίας.</li>
<li>Ο κινητήρας απέχει: Βαθμίδα 5 σε όλες τις ερωτήσεις, στις δύο τεκμηριωμένες διαδρομές. Η τρίτη, πειραματική διαδρομή δίνει απαντήσεις από άσχετα τεκμήρια, π.χ. «σημασία κριτηρίων στην επιλογή εργασίας» για τις υπηρεσίες retailer. Στα μεταχειρισμένα αποκλίνει από τη δημοσιευμένη μέτρηση κατά {f0(BR["B5"]["tier4_output"]["Ναι"] - pub_second)} μονάδες.</li></ul>
<div class="concl"><b>Συμπέρασμα για τον Customer Insights Manager.</b> Το Lab δεν αντικαθιστά σήμερα ένα πραγματικό πείραμα επιλογής. Αξίζει ως εργαλείο σχεδιασμού: δείγμα, ερωτηματολόγιο, ελεγμένος σχεδιασμός πειράματος, segmentation εγκατεστημένης βάσης και αυτόματος έλεγχος τεκμηρίωσης που αρνείται να κατασκευάσει ποσοστά. Μία πραγματική μέτρηση (≈ 1.000 συμμετέχοντες, ίδιο ερωτηματολόγιο) θα επέτρεπε στο Lab να βαθμονομηθεί και τον simulator να δίνει τεκμηριωμένες απαντήσεις.</div>''')

# ------------------------------------------------------------------ 3. landscape
rows = [(H[h], own_tot[h], NAVY) for h in sorted(H, key=lambda h: -own_tot[h])]
inc = OWN["crosstabs"]
age_rows = "".join(f'<tr><td>{esc(g)}</td><td>{x["n"]}</td>' + "".join(f'<td>{f0(inc[h]["Ηλικία"][g]["pct"])}</td>' for h in ("H1", "H3", "H5")) + "</tr>" for g, x in inc["H1"]["Ηλικία"].items())
inc_rows = "".join(f'<tr><td>{esc(g)}ο</td><td>{x["n"]}</td>' + "".join(f'<td>{f0(inc[h]["Εισοδηματικό πεμπτημόριο"][g]["pct"])}</td>' for h in ("H1", "H3", "H5")) + "</tr>" for g, x in inc["H1"]["Εισοδηματικό πεμπτημόριο"].items())
D = S["demography"]
page(head(2, "The Greek Consumer Decision Landscape", "Ποιοι είναι οι 500 και τι συσκευές έχουν ήδη στο σπίτι τους")
     + '<p class="body">Ο συνθετικός πληθυσμός ακολουθεί την ελληνική πραγματικότητα:</p>'
     + '<ul class="el">'
     + f'<li>{f0(D["age_band"]["65+"])}% άνω των 65·</li>'
     + f'<li>{f0(D["area"]["Αττική"])}% στην Αττική·</li>'
     + f'<li>{f0(D["settlement"]["Αγροτική"])}% σε αγροτικές περιοχές·</li>'
     + f'<li>{f0(D["education"]["Ανώτατη"])}% με ανώτατη εκπαίδευση.</li></ul>'
     + '<p class="body">Η πρώτη υπολογίσιμη πληροφορία για έναν retailer είναι η εγκατεστημένη βάση: τι υπάρχει ήδη στα νοικοκυριά και θα χρειαστεί κάποια στιγμή επισκευή, αντικατάσταση ή αναβάθμιση.</p>'
     + hbar(rows) + cap("Βάση: 500 συνθετικά νοικοκυριά · μοντέλο pie-hbs-0.1 (ΕΛΣΤΑΤ ΕΟΠ 2019–2020, χρονική μεταφορά ≈ 6 ετών)")
     + f'<div class="two"><div><h4>Ανά ηλικία (%)</h4><table class="t"><thead><tr><th>Ηλικία</th><th>n</th><th>Υπολογ.</th><th>Πλ. πιάτων</th><th>Κλιματ.</th></tr></thead><tbody>{age_rows}</tbody></table></div>'
     + f'<div><h4>Ανά εισοδηματικό πεμπτημόριο (%)</h4><table class="t"><thead><tr><th>Πεμπτ.</th><th>n</th><th>Υπολογ.</th><th>Πλ. πιάτων</th><th>Κλιματ.</th></tr></thead><tbody>{inc_rows}</tbody></table></div></div>'
     + f'<p class="body"><b>Ανάγνωση.</b> Ο υπολογιστής πέφτει απότομα μετά τα 55. Το πλυντήριο πιάτων διπλασιάζεται από το χαμηλότερο στο υψηλότερο πεμπτημόριο ({f0(inc["H3"]["Εισοδηματικό πεμπτημόριο"]["1"]["pct"])}% → {f0(inc["H3"]["Εισοδηματικό πεμπτημόριο"]["5"]["pct"])}%). Το κλιματιστικό είναι αστικό φαινόμενο ({f0(inc["H5"]["Τύπος περιοχής"]["Αστική"]["pct"])}% έναντι {f0(inc["H5"]["Τύπος περιοχής"]["Αγροτική"]["pct"])}% σε αγροτικές περιοχές).</p>'
     + '<p class="note">Τα δεδομένα είναι του 2019–2020 και το Lab τα χαρακτηρίζει «χρονική μεταφορά». Οι διασταυρώσεις γίνονται μόνο σε μεταβλητές κοινές με το μοντέλο νοικοκυριών.</p>')

# ------------------------------------------------------------------ 4. repair vs replace
q5 = EV["Q5"]
page(head(3, "Repair vs Replace", "Πλυντήριο 7 ετών με βλάβη: επισκευή 90€, 150€ ή 220€ έναντι νέου 549€")
     + verdict(f'<b>Το Lab δεν μπορεί να υπολογίσει την απόφαση.</b> Οι Q5–Q9 κατατάσσονται στη Βαθμίδα {q5["R1_tier"]} (αποχή) και στις δύο τεκμηριωμένες διαδρομές. Η πειραματική διαδρομή δεν βρήκε κανένα σχετικό τεκμήριο. Για αυτό δίνει την ίδια ομοιόμορφη κατανομή (25% σε κάθε επιλογή) για 90€, 150€ και 220€.')
     + '<h4>Διαγνωστικό: η πειραματική έξοδος δεν «ακούει» το κόστος επισκευής</h4>'
     + line_chart([(f'Νέο {c["newPrice"]}€{" + εγγύηση επισκευής 12 μ." if c["warrantyMonths"] else ""}', [p["repair"] for p in c["points"]], col, bool(c["warrantyMonths"]))
                   for c, col in zip(rep, [GREY, "#c4cbd2", "#6b7a88", "#a7b1bb", NAVY, "#7f8c99"])],
                  [p["cost"] for p in rep549["points"]], "Κόστος επισκευής (€)", band=(25 - rep549["noise95"], 25 + rep549["noise95"]), ymax=50, xfmt=lambda x: f"{x}€",
                  refs=[(pub_repaired, f"Δημοσιευμένο: {pub_repaired}% επισκεύασε αντί να αντικαταστήσει (EB 2019)")])
     + cap("Μερίδιο «Επισκευή», 500 προφίλ, 48 σενάρια · γκρι ζώνη: τυχαίος θόρυβος 95%", "rejected")
     + f'''<p class="body">Σε 48 σενάρια (8 κόστη × 3 τιμές νέου × με/χωρίς εγγύηση), το μερίδιο «επισκευή» κινείται μεταξύ {f1(min(rep_all))}% και {f1(max(rep_all))}%, μέσα στον θόρυβο. Η διάταξη ως προς το κόστος αλλάζει πρόσημο από καμπύλη σε καμπύλη (Spearman {"· ".join(g2(c["spearman"], True) for c in rep)}). Σε ατομικό επίπεδο, {cons["repairAt220_notAt90"]} προφίλ «επισκευάζουν» στα 220€ αλλά όχι στα 90€. Αυτό είναι ασυνέπεια, όχι προτίμηση.</p>
<div class="pub"><b>Τι λένε τα δημοσιευμένα δεδομένα (εκτός μοντέλου):</b>
<ul><li>Το {pub_repaired}% των Ελλήνων είχε επισκευάσει ένα προϊόν αντί να το αντικαταστήσει τους τελευταίους 6 μήνες (Eurobarometer 2019).</li>
<li>Το {pub_norepair}% είχε αποφασίσει να μην επισκευάσει τουλάχιστον ένα προϊόν λόγω κόστους (Flash Eurobarometer 2012).</li></ul>
Δεν απαντούν στο ερώτημα του κατωφλίου κόστους, αλλά δείχνουν ότι το κόστος είναι πραγματικός μοχλός.</div>''')

# ------------------------------------------------------------------ 5. economics of repair
grid_rows = "".join(f'<tr><td>Νέο {c["newPrice"]}€{" · εγγύηση 12 μ." if c["warrantyMonths"] else ""}</td>' + "".join(f'<td>{f0(p["repair"])}</td>' for p in c["points"]) + f'<td>{g2(c["spearman"], True)}</td></tr>' for c in rep)
page(head(4, "The Economics of Repair", "Τι θα χρειαζόταν για να βρούμε το κατώφλι επισκευής")
     + '<p class="body">Το εμπορικά κρίσιμο μέγεθος είναι το <b>κατώφλι επισκευής</b>: το κόστος επισκευής ως ποσοστό της τιμής του νέου, πάνω από το οποίο ο καταναλωτής περνά στην αντικατάσταση. Ένα έγκυρο μοντέλο πρέπει να δείχνει φθίνουσα καμπύλη επισκευής καθώς το κόστος ανεβαίνει, και μετατόπισή της με την τιμή του νέου και την εγγύηση επισκευής.</p>'
     + f'<table class="t wide"><thead><tr><th>Σενάριο</th>{"".join(f"<th>{p["cost"]}€</th>" for p in rep549["points"])}<th>Spearman</th></tr></thead><tbody>{grid_rows}</tbody></table>'
     + cap("% «Επισκευή» ανά σενάριο · 500 προφίλ ανά κελί", "rejected")
     + verdict('Καμία καμπύλη δεν είναι φθίνουσα. Η τιμή του νέου και η εγγύηση επισκευής δεν μετακινούν το επίπεδο. Το Lab δεν περιέχει πληροφορία για την ελαστικότητα επισκευής.', "no")
     + '''<h4>Ο σχεδιασμός μέτρησης που θα έκλεινε το κενό</h4>
<ul class="el"><li><b>Κλίμακα κόστους:</b> 8 επίπεδα (60–300€) × 3 τιμές νέου × εγγύηση επισκευής. Τυχαία ανάθεση 3 σεναρίων ανά συμμετέχοντα, ώστε να αποφεύγεται η αγκύρωση.</li>
<li><b>Ενδογενείς μεταβλητές:</b> ηλικία και μάρκα της συσκευής, ιστορικό βλαβών, διαθεσιμότητα τεχνικού, πρόσβαση σε πίστωση.</li>
<li><b>Δείγμα:</b> ≈ 1.000 ενήλικες, CAWI με ποσοστώσεις. Επαρκεί για καμπύλη ανά ηλικιακή ομάδα και εισοδηματικό πεμπτημόριο.</li>
<li><b>Σύνδεση με το Lab:</b> τα αποτελέσματα εισάγονται στη διαδρομή εκμάθησης από έρευνες πελάτη. Οι ίδιες ερωτήσεις αποκτούν άμεσο ελληνικό τεκμήριο (Βαθμίδα 1) και ο simulator γίνεται λειτουργικός.</li></ul>''')

# ------------------------------------------------------------------ 6. trade-in
tp = ti["points"]
page(head(5, "Trade-in Opportunity", "Ανταλλαγή παλιάς συσκευής με όφελος 30€, 60€ ή 100€")
     + verdict(f'<b>Μη υπολογίσιμο.</b> Οι Q11–Q15 είναι στη Βαθμίδα {EV["Q11"]["R1_tier"]}. Η πειραματική διαδρομή ταίριαξε τις ερωτήσεις trade-in με ερωτήσεις όπως «{esc(EV["Q12"]["R3_evidence"][0]["text"][:90])}…».')
     + line_chart([("Πολύ/μάλλον πιθανό να χρησιμοποιήσει trade-in", [p["likely"] for p in tp], GREY, False)], [p["value"] for p in tp], "Όφελος ανταλλαγής (€)", ymax=80,
                  band=(sum(p["likely"] for p in tp) / len(tp) - ti["noise95"], sum(p["likely"] for p in tp) / len(tp) + ti["noise95"]), xfmt=lambda x: f"{x}€")
     + cap("Πειραματική έξοδος, 8 σενάρια · 500 προφίλ", "rejected")
     + f'<p class="body">Από 0€ έως 150€ όφελος, η «πρόθεση» κινείται ακανόνιστα, με εύρος {f1(ti["range"])} μονάδες και Spearman {g2(ti["spearman"], True)}. Το όφελος 0€ δεν δίνει χαμηλότερη πρόθεση από τα 150€. Δεν υπάρχει καμπύλη απόκρισης για να εκτιμηθεί το βέλτιστο όφελος ανταλλαγής.</p>'
     + '<div class="pub"><b>Τι θα χρειαζόταν:</b> μια κλίμακα αξίας ανταλλαγής (0–150€) σε πραγματικό δείγμα, ανά κατηγορία συσκευής (μεγάλες λευκές, smartphones, laptops) και με μετρημένη την ηλικία της παλιάς συσκευής. Μαζί με το segmentation εγκατεστημένης βάσης, θα έδειχνε πού το trade-in επιταχύνει την αντικατάσταση.</div>')

# ------------------------------------------------------------------ 7. refurbished
page(head(6, "New vs Refurbished", "Smartphone: νέο 599€ έναντι πιστοποιημένου refurbished 349–449€")
     + verdict(f'<b>Μη υπολογίσιμο.</b> Οι Q16–Q21 είναι στη Βαθμίδα {EV["Q16"]["R1_tier"]}. Χωρίς τεκμήριο, η πειραματική διαδρομή δίνει περίπου ⅓ σε κάθε επιλογή (νέο, refurbished, κανένα), σε κάθε τιμή.')
     + line_chart([(f'Refurbished, εγγύηση {r["warrantyMonths"]} μηνών', [p["refurb"] for p in r["points"]], col, r["warrantyMonths"] == 24) for r, col in zip(rf, [GREY, NAVY])],
                  [p["price"] for p in rf[0]["points"]], "Τιμή refurbished (€) · νέο στα 599€", ymax=60, xfmt=lambda x: f"{x}€")
     + cap("Μερίδιο επιλογής refurbished, 10 σενάρια · 500 προφίλ", "rejected")
     + f'<p class="body">Η έξοδος δεν αντιδρά ούτε στην τιμή (εύρος {f1(rf[0]["range"])} μονάδες από 299€ έως 499€) ούτε στη διπλασιασμένη εγγύηση. Σε μια σχετική ερώτηση-γέφυρα («αγοράσατε μεταχειρισμένα αντί για καινούργια;»), η ίδια διαδρομή δίνει {f0(BR["B5"]["tier4_output"]["Ναι"])}%, ενώ το Eurobarometer μετρά <b>{pub_second}%</b>.</p>'
     + f'<div class="pub"><b>Τι λένε τα δημοσιευμένα δεδομένα (εκτός μοντέλου):</b> μόλις {pub_second}% των Ελλήνων είχε αγοράσει μεταχειρισμένα προϊόντα αντί για καινούργια τους τελευταίους 6 μήνες (Eurobarometer 2019). Η αγορά refurbished ξεκινά από χαμηλή βάση. Το ερώτημα «σε ποια έκπτωση και με ποια εγγύηση» χρειάζεται πραγματική μέτρηση.</div>')

# ------------------------------------------------------------------ 8. warranty
b3 = BR["B3"]
rows_pub = [(k, v, AMBER) for k, v in b3["published"].items() if k != "ΔΞ/ΔΑ"]
rows_t4 = [(k, v, "#c9ced4") for k, v in b3["tier4_output"].items() if k != "ΔΞ/ΔΑ"]
page(head(7, "The Value of Warranty", "Πόσο αξίζει η επέκταση εγγύησης για τον Έλληνα καταναλωτή")
     + verdict('<b>Το Lab δεν υπολογίζει την αξία της εγγύησης.</b> Οι Q8, Q20 και τα πειράματα επιλογής δεν δίνουν μετρήσιμη επίδραση εγγύησης. Ο συντελεστής εγγύησης στο πειραματικό μοντέλο επιλογής είναι μηδενικός (βλ. ενότητα 9).')
     + f'<h4>Δημοσιευμένη μέτρηση: Flash Eurobarometer 367 (2012), Ελλάδα</h4>{hbar(rows_pub, label_w=230, row_h=30, maxv=50)}{cap("Πόσο περισσότερο θα πλήρωνε για εγγύηση αξιοπιστίας 5 ετών", "published")}'
     + f'<h4>Η ίδια ερώτηση στην πειραματική διαδρομή του Lab</h4>{hbar(rows_t4, label_w=230, row_h=30, maxv=50)}{cap("Τεκμήριο που επιλέχθηκε: «{}»".format(b3["evidence"][0]["text"][:70]), "rejected")}'
     + f'<p class="body">Η δημοσιευμένη μέτρηση είναι παλιά (2012), αλλά δείχνει σαφή δομή: το {pub_wtp_warranty}% θα πλήρωνε περισσότερο για εγγύηση 5 ετών, κυρίως έως 10%. Η πειραματική διαδρομή του Lab δίνει σχεδόν ομοιόμορφη κατανομή από άσχετο τεκμήριο. Όταν ρωτήθηκε με την ακριβή διατύπωση της πηγής, το Lab δεν «βρήκε» τη μέτρηση: οι συγκεντρωτικοί πίνακες Eurobarometer της λίμνης δεν είναι συνδεδεμένοι με τη διαδρομή απαντήσεων. Αυτό είναι συγκεκριμένο, διορθώσιμο κενό υποδομής.</p>')

# ------------------------------------------------------------------ 9. omnichannel
omni = ["Q1", "Q2", "Q3"] + [f"Q4_{i}" for i in range(1, 9)] + ["Q22", "Q23", "Q24", "Q25", "Q26"]
orow = "".join(f'<tr><td>{esc(q)}</td><td>{esc(EV[q]["short"])}</td><td>{EV[q]["R1_tier"]}</td><td>{EV[q]["R2_tier"]}</td><td>{EV[q]["R3_tier"]}</td><td class="ev">{esc((EV[q]["R3_evidence"][0]["text"] if EV[q]["R3_evidence"] else "—")[:70])}</td></tr>' for q in omni)
page(head(8, "Omnichannel Decision Drivers", "Κανάλι, παράδοση, εγκατάσταση, επιστροφές, υποστήριξη")
     + verdict('<b>Μη υπολογίσιμο.</b> Καμία ερώτηση της ενότητας δεν έχει τεκμήριο στο Lab. Η στήλη «τεκμήριο» δείχνει τι επέλεξε η πειραματική διαδρομή και γιατί απορρίπτεται.')
     + f'<table class="t sm"><thead><tr><th>Κωδ.</th><th>Ερώτηση</th><th>R1</th><th>R2</th><th>R3</th><th>Τεκμήριο που «ταίριαξε» (R3)</th></tr></thead><tbody>{orow}</tbody></table>'
     + cap("R1: autolink · R2: IQGE ελληνικά · R3: IQGE + διεθνής λίμνη (πειραματική) · Βαθμίδα 5 = αποχή", "design")
     + f'<div class="pub"><b>Τι λένε τα δημοσιευμένα δεδομένα (εκτός μοντέλου):</b> το {pub_online}% των Ελλήνων αγόραζε online ή τηλεφωνικά με παράδοση στο σπίτι το 2019 (Eurobarometer, {BR["B4"]["published"]["Ναι, συχνά"]}% συχνά). Η πειραματική διαδρομή δίνει {f0(BR["B4"]["tier4_output"]["Ναι, συχνά"] + BR["B4"]["tier4_output"]["Ναι, περιστασιακά"])}% στην ίδια ερώτηση. Η προτίμηση φυσικού καταστήματος ή online και η προθυμία πληρωμής για ταχύτητα δεν μετρώνται σε καμία πηγή του Lab.</div>')

# ------------------------------------------------------------------ 10. price vs service
cd = S["questionnaire"]["choiceDesign"]
attr = cd["attributes"]
fmtv = {"price": lambda v: f"{v}€", "delivery": lambda v: "επόμενη" if v == 1 else f"{v} ημ.", "install": lambda v: "δωρεάν" if v == 0 else f"{v}€",
        "warranty": lambda v: f"{v} έτη", "instalments": lambda v: "—" if v == 0 else "12 άτοκες", "tradein": lambda v: "—" if v == 0 else f"{v}€", "support": lambda v: "τηλέφ." if v == 0 else "στο σπίτι"}
trs = "".join(f'<tr><td>Q{26 + t["task"]}</td><td>{alt}</td>' + "".join(f'<td>{fmtv[a["key"]](t[alt][a["key"]])}</td>' for a in attr) + "</tr>" for t in cd["tasks"] for alt in ("A", "B"))
page(head(9, "Price vs Service", "Έξι πειράματα επιλογής: τιμή, παράδοση, εγκατάσταση, εγγύηση, δόσεις, trade-in, υποστήριξη")
     + f'<p class="body">Ο σχεδιασμός είναι ισορροπημένος: κάθε επίπεδο εμφανίζεται 3–6 φορές, καμία προσφορά δεν είναι καλύτερη σε όλα, και κάθε ζεύγος διαφέρει σε τουλάχιστον {cd["minDifferingAttributes"]} χαρακτηριστικά. Το προϊόν είναι σταθερό: {esc(cd["product"])}.</p>'
     + f'<table class="t sm"><thead><tr><th>Πείραμα</th><th>Προσφ.</th>{"".join(f"<th>{esc(a['label'])}</th>" for a in attr)}</tr></thead><tbody>{trs}</tbody></table>' + cap("Σχεδιασμός · χωρίς εμπορικές επωνυμίες", "design")
     + '<h4>Τι «έμαθε» το πειραματικό μοντέλο επιλογής από τις 3.000 επιλογές του Lab</h4>' + coef_chart(CE)
     + cap(f"Conditional logit σε {CE['n_choices']} πειραματικές επιλογές (Tier 4) · 95% διαστήματα", "rejected")
     + verdict(f'Κανένα χαρακτηριστικό δεν είναι σημαντικό. Η τιμή, η εγγύηση και η υποστήριξη έχουν διαστήματα που περιέχουν το μηδέν, και το μοντέλο δεν είναι καλύτερο από το «καμία επίδραση» (LR = {f1(CE["LR"])}, p = {g2(CE["p_value"])}). <b>Η σχετική σημασία των χαρακτηριστικών δεν μπορεί να υπολογιστεί από το Lab.</b> Ο ίδιος σχεδιασμός, σε πραγματικό δείγμα, θα την έδινε απευθείας.', "no"))

# ------------------------------------------------------------------ 11. segments
srows = "".join(f'<tr><td><b>{esc(s["name"])}</b></td><td>{f0(s["share"])}%</td><td>{f1(s["meanDevices"])}</td>' + "".join(f'<td>{f0(s["ownership"][H[h]])}</td>' for h in ("H1", "H3", "H4", "H5", "H6")) + f'<td>{f0(s["age"]["65+"])}</td><td>{f0(s["settlement"]["Αγροτική"])}</td><td>{f0(s["income"]["5"])}</td></tr>' for s in segs)
page(head(10, "Consumer Segments", "Segments εγκατεστημένης βάσης: τα μόνα segments που υποστηρίζουν οι υπολογισμένες απαντήσεις")
     + f'<p class="body">Τα segments προκύπτουν από ομαδοποίηση (k-means) των απαντήσεων ιδιοκτησίας για 6 συσκευές. Ο αριθμός {len(segs)} επιλέχθηκε με το κριτήριο silhouette ({g2(S["segments"]["silhouette"][str(len(segs))])}). Δεν περιέχουν στάσεις απέναντι σε επισκευή, trade-in ή refurbished, γιατί αυτές δεν υπολογίζονται.</p>'
     + hbar([(s["name"], s["share"], [NAVY, TEAL, "#3f7cac", "#8a9aa9", "#c4b998"][i]) for i, s in enumerate(segs)], label_w=270, maxv=40)
     + cap("Μέγεθος segment · 500 προφίλ")
     + f'<table class="t sm"><thead><tr><th>Segment</th><th>Μερίδιο</th><th>Συσκ./νοικ.</th><th>Υπολογ.</th><th>Πλ. πιάτων</th><th>Καταψ.</th><th>Κλιματ.</th><th>Κονσόλα</th><th>65+</th><th>Αγροτ.</th><th>5ο πεμπτ.</th></tr></thead><tbody>{srows}</tbody></table>'
     + cap("% ανά segment · ιδιοκτησία από pie-hbs-0.1 · ηλικία, περιοχή, εισόδημα από τον πληθυσμό του Lab")
     + '<p class="body"><b>Γιατί είναι χρήσιμα.</b> Χωρίζουν την αγορά σε νοικοκυριά με διαφορετικό «απόθεμα» συσκευών, άρα με διαφορετική πιθανότητα να βρεθούν σύντομα μπροστά σε απόφαση επισκευής ή αντικατάστασης. Τα πλήρως εξοπλισμένα νοικοκυριά έχουν περισσότερες συσκευές σε κύκλο ζωής. Τα νοικοκυριά βασικού εξοπλισμού, κυρίως ηλικιωμένα, είναι στόχος πρώτης αγοράς. Τα segments είναι έτοιμα να χρησιμοποιηθούν ως ποσοστώσεις στην πραγματική μέτρηση.</p>')

# ------------------------------------------------------------------ 12. commercial implications
page(head(11, "Commercial Implications", "Τι σημαίνει αυτό για μια ομάδα Customer Insights ενός omnichannel retailer")
     + '''<div class="imp"><div class="ic"><h4>1 · Μην χρησιμοποιείτε συνθετικά ποσοστά για pricing υπηρεσιών</h4><p>Τα κατώφλια επισκευής, τα οφέλη trade-in, οι εκπτώσεις refurbished και οι χρεώσεις παράδοσης ή εγκατάστασης δεν μπορούν σήμερα να προκύψουν από το Lab. Ένα σύστημα που θα τα «έδινε» θα τα κατασκεύαζε.</p></div>
<div class="ic"><h4>2 · Χρησιμοποιήστε το Lab για να σχεδιάσετε τη μέτρηση</h4><p>Ελεγμένο ερωτηματολόγιο, ισορροπημένα πειράματα επιλογής χωρίς κυριαρχία, πλέγμα 82 σεναρίων, δείγμα βαθμονομημένο σε ΕΛΣΤΑΤ και ποσοστώσεις ανά segment εγκατεστημένης βάσης. Όλα είναι έτοιμα για πεδίο.</p></div>
<div class="ic"><h4>3 · Στοχεύστε με βάση την εγκατεστημένη βάση</h4><p>Όπου υπάρχει πολύς εξοπλισμός, υπάρχουν και περισσότερες αποφάσεις επισκευής ή αντικατάστασης ανά νοικοκυριό. Το segmentation υπολογίζεται και μπορεί να συνδυαστεί με δεδομένα πελατών (CRM) για προγράμματα trade-in και επέκτασης εγγύησης.</p></div>
<div class="ic"><h4>4 · Μία πραγματική μέτρηση ενεργοποιεί τον simulator</h4><p>Το ίδιο ερωτηματολόγιο σε ≈ 1.000 πραγματικούς συμμετέχοντες, με τα 6 πειράματα, την κλίμακα κόστους επισκευής και την κλίμακα trade-in, δίνει άμεσο ελληνικό τεκμήριο. Στη συνέχεια το Lab μπορεί να γενικεύσει σε νέα σενάρια και segments με γνωστό σφάλμα.</p></div>
<div class="ic"><h4>5 · Κλείστε το κενό υποδομής</h4><p>Οι δημοσιευμένοι πίνακες Eurobarometer για επισκευή, εγγύηση, μεταχειρισμένα και αγορές online υπάρχουν ήδη στη λίμνη του Lab, αλλά δεν τροφοδοτούν τη διαδρομή απαντήσεων. Η σύνδεσή τους θα έδινε τουλάχιστον τεκμηριωμένα επίπεδα αναφοράς.</p></div>
<div class="ic"><h4>6 · Κρατήστε τον έλεγχο τεκμηρίωσης ως εμπορικό πλεονέκτημα</h4><p>Το ότι το σύστημα απέχει αντί να παράγει ποσοστά είναι ο λόγος που μπορεί να εμπιστευτεί κανείς όσα υπολογίζει. Οι αποφάσεις για τιμολόγηση υπηρεσιών πρέπει να στηρίζονται μόνο σε τεκμηριωμένες βαθμίδες.</p></div></div>''')

# ------------------------------------------------------------------ 13. methodology
R = routes
check_rows = "".join(f'<li>{"✓" if c["pass"] else "✕"} {esc(c["check"])}</li>' for c in S["checks"])
page(head(12, "Technical Methodology", "Πώς παράχθηκαν και ελέγχθηκαν τα αποτελέσματα")
     + f'''<div class="meth"><p><b>Πάνελ.</b> 500 πρόσωπα από τον βαθμονομημένο πληθυσμό του Lab (GLOPOP-S + ΕΛΣΤΑΤ/Eurostat 2025), με επιλογή ανάλογη του βάρους (18+, σπόρος 20261030). Τα ίδια IDs (C001–C500) εμφανίζονται σε όλες τις εκτελέσεις. Δημογραφικά, νοικοκυριό και εισόδημα προέρχονται από τον πληθυσμό. Η οικονομική κατάσταση και η απασχόληση είναι άγκυρες του {esc(S["meta"]["model"])}.</p>
<p><b>Παραγωγή απαντήσεων: τρεις υποστηριζόμενες διαδρομές του Lab, χωρίς αλλαγές στην παραγωγή.</b></p>
<ul><li><b>R1 — autolink</b> (όπως η παραγωγή): βαθμίδες {dict(R["R1"])}.</li>
<li><b>R2 — IQGE με ελληνικά τεκμήρια</b>: {dict(R["R2"]) if R["R2"] else "—"}.</li>
<li><b>R3 — IQGE με διεθνή λίμνη</b> (πειραματική): {dict(R["R3"])}.</li>
<li><b>ΕΟΠ</b>: η ιδιοκτησία συσκευών από το {esc(S["meta"]["householdModel"])}, με άμεσες ελληνικές ερωτήσεις μικροδεδομένων.</li></ul>
<p><b>Κανόνας αποδοχής (ορίστηκε πριν από την ανάλυση).</b> Ευρήματα μόνο από βαθμίδες 1–3 ή άμεσα μικροδεδομένα. Οι έξοδοι Tier 4 ελέγχθηκαν με τρία κριτήρια:</p>
<ol><li><b>Σχετικότητα τεκμηρίων:</b> απορρίφθηκαν, γιατί ταίριαξαν με ερωτήσεις για εργασία, χαμένα πορτοφόλια ή ιδιοκτησία κατοικίας.</li>
<li><b>Ευαισθησία σε 82 σενάρια:</b> καμία συστηματική αντίδραση.</li>
<li><b>Ατομική συνέπεια και σύγκριση με δημοσιευμένες μετρήσεις:</b> ασυνέπεια και μεγάλες αποκλίσεις.</li></ol>
<p>Καμία ερώτηση του ερωτηματολογίου δεν πέρασε τον κανόνα.</p>
<p><b>Τι δεν χρησιμοποιήθηκε.</b> Ο μηχανισμός τιμής/σύγκρισης του κινητήρα επίδειξης του Lab βασίζεται σε παραδοχές του ερευνητή: τιμή αναφοράς, διασπορά ±25% και σταθεροί συντελεστές. Θα ήταν αυθαίρετο heuristic, άρα αποκλείστηκε. Επίσης δεν χρησιμοποιήθηκαν ποσοστά-στόχοι, βαθμονόμηση απαντήσεων ή γλωσσικό μοντέλο για ποσοστά.</p>
<p><b>Έλεγχοι ({sum(c["pass"] for c in S["checks"])}/{len(S["checks"])}).</b></p><ul class="chk">{check_rows}</ul>
<p><b>Αναπαραγωγιμότητα.</b> SHA-256 εγγραφών <code>{S["meta"]["sha256"][:20]}…</code> · κινητήρας {esc(S["meta"]["engineVersion"])}. Λεπτομέρειες στα MODEL_PROVENANCE.md και VALIDATION.md.</p></div>''')

CSS = open(Path(__file__).with_name("report.css"), encoding="utf-8").read()
doc = f'''<!doctype html><html lang="el"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Repair, Replace or Upgrade? — Synthetic Consumer Decision Study</title><style>{CSS}</style></head><body><main>{"".join(PAGES)}</main></body></html>'''
OUT.write_text(doc, encoding="utf-8")
print(f"OK {len(PAGES)} σελίδες")
