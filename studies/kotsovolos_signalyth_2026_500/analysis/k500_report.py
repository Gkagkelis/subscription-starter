"""Τελική αναφορά (HTML → PDF) της συνθετικής μελέτης Κωτσόβολος από το analysis.json και τα κείμενα ερμηνείας (narrative.json).

ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ.
    python3 -I studies/kotsovolos_signalyth_2026_500/analysis/k500_report.py --analysis DIR --out DIR [--narrative FILE] [--no-pdf]
Κάθε αριθμός της αναφοράς διαβάζεται από το analysis.json (που υπολογίζεται από τις αποθηκευμένες εγγραφές του run).
"""
import argparse
import html
import json
import subprocess
from pathlib import Path

ROOT = Path(__file__).resolve().parents[3]
STUDY = ROOT / "studies" / "kotsovolos_signalyth_2026_500"
SYNTH = "ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ"
NAVY, TEAL, AMBER, GREY = "#12263a", "#0f766e", "#b54708", "#c9ced6"
DIV = ["#b42318", "#f0907f", "#d5d9e0", "#7cc0b5", "#0f766e"]            # 1 → 5 (αρνητικό → θετικό)
DK = "#eceef1"
SEGC = {"Πελάτες (24μ.)": TEAL, "Γνωρίζουν, όχι πελάτες": NAVY, "Δεν γνωρίζουν": AMBER}
esc = html.escape


def f1(x, d=1):
    return "—" if x is None else f"{float(x):.{d}f}".replace(".", ",")


def pct(x):
    return "—" if x is None else f"{f1(x)}%"


# ------------------------------------------------------------------ γραφήματα (inline SVG)
def hbar(rows, color=TEAL, maxv=None, W=720, L=290, RH=24, note=None):
    """rows: [(label, value_pct, n_or_None)]"""
    if not rows:
        return ""
    top = max((v or 0) for _, v, _ in rows)
    maxv = (top * 1.12 if maxv == "auto" else (maxv or 100)) or 1
    maxv = max(maxv, top) or 1
    h = RH * len(rows) + 6
    o = [f'<svg class="chart" viewBox="0 0 {W} {h}" role="img">']
    for i, (lab, v, n) in enumerate(rows):
        y = 3 + i * RH
        w = max(1.5, (W - L - 70) * float(v or 0) / maxv)
        o.append(_label(lab, L - 8, y + RH * .64, int(L / 6.6)) +
                 f'<rect x="{L}" y="{y + 5}" width="{w:.1f}" height="{RH - 10}" rx="3" fill="{color}"/>'
                 f'<text x="{L + w + 6}" y="{y + RH * .66}" class="val">{pct(v)}</text>')
    o.append("</svg>")
    return "".join(o)


def _label(text, x, y, maxc):
    """Ετικέτα έως 2 γραμμές (χωρίς αποκοπή νοήματος)."""
    t = str(text)
    if len(t) <= maxc:
        return f'<text x="{x}" y="{y:.1f}" text-anchor="end" class="lbl">{esc(t)}</text>'
    words, a = t.split(" "), ""
    for w_ in words:
        if len(a) + len(w_) + 1 > max(maxc, len(t) // 2 + 1) and a:
            break
        a = (a + " " + w_).strip()
    b = t[len(a):].strip()
    if len(b) > maxc:
        b = b[:maxc - 1] + "…"
    return (f'<text x="{x}" y="{y - 6:.1f}" text-anchor="end" class="lbl sm2"><tspan x="{x}">{esc(a)}</tspan>'
            f'<tspan x="{x}" dy="11.5">{esc(b)}</tspan></text>')


def hb2(rows, color=TEAL, maxv=None, L=170, RH=22, **k):
    """Οριζόντιες μπάρες για μισή στήλη (κείμενο σε κανονικό μέγεθος)."""
    return hbar(rows, color, maxv, W=400, L=min(L, 175), RH=RH)


def stack5(rows, W=720, L=230, RH=26, dk_label="Δεν ξέρω"):
    """rows: [(label, [p1,p2,p3,p4,p5], p_dk, n)] — 100% οριζόντια στοίβα, αρνητικό → θετικό, γκρι = δεν ξέρω."""
    if not rows:
        return ""
    h = RH * len(rows) + 30
    plot = W - L - 50
    o = [f'<svg class="chart" viewBox="0 0 {W} {h}" role="img">']
    for i, (lab, ps, dk, n) in enumerate(rows):
        y = 3 + i * RH
        x = L
        o.append(f'<text x="{L - 8}" y="{y + RH * .62}" text-anchor="end" class="lbl">{esc(str(lab)[:40])}</text>')
        for j, p in enumerate(list(ps) + [dk]):
            w = plot * (p or 0) / 100
            col = DIV[j] if j < 5 else DK
            o.append(f'<rect x="{x:.1f}" y="{y + 4}" width="{max(w - 1, 0):.1f}" height="{RH - 8}" fill="{col}"/>')
            if w > 24:
                o.append(f'<text x="{x + w / 2:.1f}" y="{y + RH * .64}" text-anchor="middle" class="sv" fill="{"#fff" if j in (0, 4) else "#16191d"}">{round(p)}</text>')
            x += w
        o.append(f'<text x="{L + plot + 6}" y="{y + RH * .64}" class="nb">n={n}</text>')
    ly = h - 14
    leg = [("1 (αρνητικό)", DIV[0]), ("2", DIV[1]), ("3", DIV[2]), ("4", DIV[3]), ("5 (θετικό)", DIV[4]), (dk_label, DK)]
    x = L
    for t, c in leg:
        o.append(f'<rect x="{x}" y="{ly - 9}" width="10" height="10" fill="{c}"/><text x="{x + 14}" y="{ly}" class="nb">{esc(t)}</text>')
        x += 16 + 7 * len(t) + 8
    o.append("</svg>")
    return "".join(o)


def gbar(cats, series, W=720, L=270, RH=None, maxv=None):
    """Ομαδοποιημένες οριζόντιες μπάρες: cats=[label], series=[(name, color, [values])]."""
    k = len(series)
    bh = 9
    RH = RH or (bh * k + 10)
    maxv = maxv or max(max((v or 0) for v in s[2]) for s in series) * 1.15 or 1
    h = RH * len(cats) + 24
    o = [f'<svg class="chart" viewBox="0 0 {W} {h}" role="img">']
    for i, c in enumerate(cats):
        y = 2 + i * RH
        o.append(f'<text x="{L - 8}" y="{y + RH / 2 + 4}" text-anchor="end" class="lbl">{esc(str(c)[:46])}</text>')
        for j, (name, col, vals) in enumerate(series):
            v = vals[i] or 0
            w = (W - L - 60) * v / maxv
            yy = y + 5 + j * bh
            o.append(f'<rect x="{L}" y="{yy}" width="{max(w, 1):.1f}" height="{bh - 2}" fill="{col}"/><text x="{L + w + 4:.1f}" y="{yy + bh - 2}" class="sv">{f1(v, 0)}</text>')
    x = L
    for name, col, _ in series:
        o.append(f'<rect x="{x}" y="{h - 14}" width="10" height="10" fill="{col}"/><text x="{x + 14}" y="{h - 5}" class="nb">{esc(name)}</text>')
        x += 24 + 7 * len(name)
    o.append("</svg>")
    return "".join(o)


def funnel(steps, W=720):
    RH = 34
    h = RH * len(steps) + 4
    o = [f'<svg class="chart" viewBox="0 0 {W} {h}" role="img">']
    for i, s in enumerate(steps):
        w = max(4, (W - 120) * s["pct"] / 100)
        x = (W - 120 - w) / 2
        y = 2 + i * RH
        o.append(f'<rect x="{x:.1f}" y="{y}" width="{w:.1f}" height="{RH - 6}" rx="4" fill="{TEAL if i < 3 else NAVY}" opacity="{1 - i * .06:.2f}"/>'
                 f'<text x="{(W - 120) / 2:.1f}" y="{y + RH * .58}" text-anchor="middle" class="fl" style="fill:{"#fff" if w > 7.2 * len(s["step"]) + 16 else NAVY}">{esc(s["step"])}</text>'
                 f'<text x="{W - 110}" y="{y + RH * .58}" class="val">{pct(s["pct"])}</text>')
    o.append("</svg>")
    return "".join(o)


def dots(rows, lo=1, hi=5, W=720, L=250, RH=22, fmt=lambda v: f1(v, 2)):
    """rows: [(label, value, n, color)] — σημεία σε κοινή κλίμακα (μέσοι όροι)."""
    if not rows:
        return ""
    h = RH * len(rows) + 22
    plot = W - L - 60
    o = [f'<svg class="chart" viewBox="0 0 {W} {h}" role="img">']
    for t in range(int(lo), int(hi) + 1):
        x = L + plot * (t - lo) / (hi - lo)
        o.append(f'<line x1="{x:.1f}" x2="{x:.1f}" y1="0" y2="{h - 18}" stroke="#eceef1"/><text x="{x:.1f}" y="{h - 4}" text-anchor="middle" class="nb">{t}</text>')
    for i, (lab, v, n, col) in enumerate(rows):
        y = 2 + i * RH + RH / 2
        o.append(f'<text x="{L - 8}" y="{y + 4}" text-anchor="end" class="lbl">{esc(str(lab)[:42])}</text>')
        if v is not None:
            x = L + plot * (v - lo) / (hi - lo)
            o.append(f'<circle cx="{x:.1f}" cy="{y}" r="6" fill="{col}"/><text x="{x + 10:.1f}" y="{y + 4}" class="sv">{fmt(v)} (n={n})</text>')
    o.append("</svg>")
    return "".join(o)


def table(head, rows, cls="t"):
    o = [f'<table class="{cls}"><thead><tr>' + "".join(f"<th>{esc(str(h))}</th>" for h in head) + "</tr></thead><tbody>"]
    for r in rows:
        o.append("<tr>" + "".join(f"<td>{c}</td>" for c in r) + "</tr>")
    o.append("</tbody></table>")
    return "".join(o)


def heat(v, lo=-1, hi=1):
    if v is None:
        return "—"
    a = min(abs(v), 1)
    col = f"rgba(15,118,110,{a * .8:.2f})" if v >= 0 else f"rgba(180,35,24,{a * .8:.2f})"
    fg = "#fff" if a > .55 else "#16191d"
    return f'<span class="hm" style="background:{col};color:{fg}">{f1(v, 2)}</span>'


# ------------------------------------------------------------------ βοηθητικά δεδομένων
class R:
    def __init__(self, A, N):
        self.A, self.N = A, N
        self.T = A["topline"]
        self.L = A["labels"]

    def rows(self, qid, drop=(), sort=False, short=None):
        t = self.T[qid]
        rs = [(r["label"], r["pct"], r["n"]) for r in t["rows"] if r["code"] not in drop]
        if sort:
            rs.sort(key=lambda x: -(x[1] or 0))
        return rs

    def base(self, qid):
        return self.T[qid]["n_base"]

    def scale_row(self, label, qid, rows=None, n=None):
        t = rows or self.T[qid]["rows"]
        n = n if n is not None else sum(r["n"] for r in t)
        p = {r["code"]: (100 * r["n"] / n if n else 0) for r in t}
        return (label, [p.get(str(c), 0) for c in range(1, 6)], p.get("6", 0), n)

    def text(self, key, default=""):
        v = self.N.get(key)
        if v is None:
            return f'<p class="todo">[ερμηνεία: {esc(key)}]</p>' if not default else default
        if isinstance(v, list):
            return "".join(f"<p>{x}</p>" for x in v)
        return f"<p>{v}</p>" if not str(v).lstrip().startswith("<") else v


def cap(qid, R_, extra=""):
    t = R_.T.get(qid, {})
    m = " · πολλαπλές απαντήσεις (άθροισμα > 100%)" if t.get("multi") else ""
    return f'<div class="cap">{esc(qid)}: «{esc(R_.L[qid]["text"])}» · βάση: {t.get("n_base")}{m}{extra}</div>'


def by_rows(rows, metric, label_key="group", order=None):
    rs = [r for r in rows if r.get(metric) is not None]
    if order:
        rs.sort(key=lambda r: order.index(r[label_key]) if r[label_key] in order else 99)
    return rs


CSS = """
:root{--navy:#12263a;--teal:#0f766e;--ink:#16191d;--ink2:#4b5360;--muted:#8b939d;--line:#e4e6e9;--soft:#f6f5f1}
*{box-sizing:border-box}body{margin:0;background:#fff;color:var(--ink);font:12.6px/1.55 Inter,"Segoe UI",Roboto,Arial,sans-serif}
main{max-width:900px;margin:0 auto;padding:0 28px 30px}
@page{size:A4;margin:15mm 0 16mm}@page :first{margin:0}
@media print{.sec{break-before:page}.card,table,svg,.kpi,.fig{break-inside:avoid}*{-webkit-print-color-adjust:exact;print-color-adjust:exact}main{padding:0 14mm}
.cover{margin:0 -14mm;min-height:297mm;padding:26mm 20mm 18mm;break-after:page}}
.cover{background:linear-gradient(160deg,#12263a 0%,#12263a 62%,#0f766e 140%);color:#fff;padding:46px 40px 34px;margin:0 -28px;min-height:860px;display:flex;flex-direction:column}
.cover .k{font-size:11px;letter-spacing:.14em;text-transform:uppercase;color:#c9d4de}.cover h1{font-size:38px;line-height:1.1;margin:80px 0 14px}
.cover .sub{font-size:16px;color:#d7e2ea}.cover .meta{margin-top:auto;display:grid;grid-template-columns:repeat(4,1fr);gap:12px;border-top:1px solid rgba(255,255,255,.25);padding-top:14px}
.cover .meta span{display:block;font-size:9.5px;letter-spacing:.08em;text-transform:uppercase;color:#a8b8c6}.cover .meta b{font-size:15px}
.synth{margin-top:22px;display:inline-block;background:#fff;color:#12263a;font-weight:800;letter-spacing:.04em;padding:8px 14px;border-radius:6px;font-size:13.5px}
.disc{margin-top:22px;background:rgba(255,255,255,.08);border-left:4px solid #5eead4;padding:12px 16px;font-size:12.8px}
h2{color:var(--navy);font-size:22px;margin:26px 0 6px;border-bottom:2px solid var(--navy);padding-bottom:6px}h3{color:var(--navy);font-size:14.5px;margin:16px 0 4px}
h2 .no{color:var(--teal);margin-right:8px}
.lead{font-size:14px;color:#22303d}.card{border:1px solid var(--line);border-radius:10px;padding:10px 14px;margin:10px 0}
.key{background:#eef7f5;border-left:4px solid var(--teal);padding:9px 14px;margin:10px 0;border-radius:0 8px 8px 0}
.warnbox{background:#fdf6ec;border-left:4px solid #b54708;padding:9px 14px;margin:10px 0;border-radius:0 8px 8px 0;font-size:12px}
.chart{width:100%;height:auto}.chart .lbl{font-size:12px;fill:var(--ink)}.chart .sm2{font-size:10.5px}.chart .val{font-size:12px;font-weight:700;fill:var(--ink)}
.chart .sv{font-size:10.5px;fill:var(--ink)}.chart .nb{font-size:10px;fill:var(--ink2)}.chart .fl{font-size:12px;font-weight:600;fill:#fff}
.cap{font-size:10px;color:var(--muted);border-top:1px solid var(--line);padding-top:4px;margin-top:2px}
.fig{margin:8px 0 12px}.fig h4{margin:0 0 4px;font-size:12.5px;color:var(--ink2)}
table.t{width:100%;border-collapse:collapse;font-size:11px;font-variant-numeric:tabular-nums;margin:6px 0}
table.t th,table.t td{padding:3.5px 6px;border-bottom:1px solid var(--line);text-align:right;vertical-align:top}
table.t th:first-child,table.t td:first-child{text-align:left}table.t th{color:var(--ink2);border-bottom:1.5px solid var(--navy);font-size:10px}
table.sm{font-size:10px}.hm{display:inline-block;min-width:38px;padding:1px 4px;border-radius:3px;text-align:center}
.kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:9px;margin:10px 0}.kpi{border:1px solid var(--line);border-top:4px solid var(--teal);border-radius:8px;padding:8px 10px}
.kpi b{font-size:21px;color:var(--navy);display:block}.kpi span{font-size:10.8px;color:var(--ink2)}
.two{display:grid;grid-template-columns:1fr 1fr;gap:14px}.todo{color:#b42318;font-style:italic}
.badge{display:inline-block;padding:1px 7px;border-radius:10px;font-size:10.5px;font-weight:700}
.b-s{background:#d1f0ea;color:#0b5a53}.b-p{background:#fdf0d5;color:#8a4b0f}.b-n{background:#fde2df;color:#8f1d14}.b-u{background:#eceef1;color:#4b5360}
.toc li{margin:2px 0}.small{font-size:11px;color:var(--ink2)}.synthbar{background:#12263a;color:#fff;text-align:center;font-weight:700;font-size:10px;letter-spacing:.06em;padding:4px;margin:16px 0 0}
ol.rec li{margin-bottom:8px}
"""


def render(A, N, gate=None, meta=None):
    r = R(A, N)
    T = r.T
    n = A["n_completes"]
    seg = A["sample"]["segment_l"]
    nps = T["Q25"]["nps"]
    o = []
    add = o.append
    meta = meta or {}
    # ---------------- εξώφυλλο
    add(f'''<section class="cover"><div class="k">Synthetic Research Lab · ASE · Συνθετική έρευνα καταναλωτών</div>
<h1>Κωτσόβολος:<br>εικόνα, εμπιστοσύνη και εμπειρία πελάτη</h1>
<div class="sub">Αναφορά αποτελεσμάτων · {n} ολοκληρωμένες συνθετικές συνεντεύξεις · Ενήλικοι 18+ στην Ελλάδα · Θεματολογία: Signalyth Brand Intelligence (Σεπ.–Οκτ. 2026)</div>
<div class="synth">{SYNTH}</div>
<div class="disc">Τα αποτελέσματα προέρχονται από <b>συνθετικά πρόσωπα</b> που απάντησαν μέσω μοντέλου τεχνητής νοημοσύνης, με δημογραφικό πλαίσιο από επίσημα στοιχεία (ΕΛΣΤΑΤ/Eurostat 2025) και περιορισμένη εμπειρική τεκμηρίωση. <b>Δεν είναι μετρήσεις πραγματικού πληθυσμού</b>, δεν έχουν περιθώριο σφάλματος δειγματοληψίας και δεν έχουν βαθμονομηθεί σε πραγματική έρευνα. Χρησιμοποιούνται για διερεύνηση υποθέσεων, σχεδιασμό και προτεραιοποίηση — όχι ως εκτίμηση μεριδίων ή επιπέδων της αγοράς.</div>
<div class="meta"><div><span>Ολοκληρωμένες</span><b>{n}</b></div><div><span>Run</span><b>{esc(A["run_id"])}</b></div><div><span>Ερωτηματολόγιο</span><b>37 στοιχεία · εγκεκριμένο</b></div><div><span>Ημερομηνία</span><b>{esc(meta.get("date", ""))}</b></div></div></section>''')
    add("<main>")
    # ---------------- περιεχόμενα
    add('<section><h2>Περιεχόμενα</h2><ol class="toc">' + "".join(f"<li>{t}</li>" for t in [
        "Σύνοψη για τη διοίκηση", "Μεθοδολογία και προφίλ του συνθετικού δείγματος", "Η αγορά: αγορές, κανάλια και κριτήρια επιλογής",
        "Εικόνα και εμπιστοσύνη στον Κωτσόβολο", "Εμπειρία πελάτη: παραδόσεις, προβλήματα, επιστροφές και after-sales",
        "Πώς συνδέονται εμπειρία, εμπιστοσύνη και πρόθεση αγοράς", "Πελάτες έναντι μη πελατών", "Ανταγωνιστική θέση και συμπεριφορά σύστασης",
        "Κοινωνική προσφορά έναντι εμπειρίας πελάτη", "Οδηγοί αποκατάστασης της εμπιστοσύνης", "Τμηματοποίηση", "Αξιολόγηση των υποθέσεων της Signalyth",
        "Στρατηγικά συμπεράσματα και προτεραιότητες", "Παράρτημα Α — Αποτελέσματα όλων των ερωτήσεων", "Παράρτημα Β — Μεθοδολογία, ποιότητα και ίχνος ελέγχου",
        "Παράρτημα Γ — Στατιστικοί έλεγχοι διαφορών"]) + "</ol></section>")
    # ---------------- 1. σύνοψη
    aw = 100 - (T["Q04"]["rows"][0]["pct"] or 0)
    add(f'''<section class="sec"><h2><span class="no">1</span>Σύνοψη για τη διοίκηση</h2>
<div class="kpis">
<div class="kpi"><b>{pct(aw)}</b><span>γνωρίζουν την αλυσίδα (βάση {n})</span></div>
<div class="kpi"><b>{pct(100 * seg.get("Πελάτες (24μ.)", 0) / n)}</b><span>αγόρασαν από τον Κωτσόβολο τους τελευταίους 24 μήνες</span></div>
<div class="kpi"><b>{pct(T["Q09"].get("top2"))}</b><span>τον εμπιστεύονται πολύ / πάρα πολύ (όσοι κρίνουν, n={T["Q09"].get("n_valid")})</span></div>
<div class="kpi"><b>{f1(nps["score"], 0)}</b><span>καθαρός δείκτης σύστασης (0–10, n={nps["n_valid"]}) — συνθετικός, όχι πραγματικό NPS</span></div>
<div class="kpi"><b>{pct(T["Q08"].get("top2"))}</b><span>θετική συνολική εικόνα (4–5)</span></div>
<div class="kpi"><b>{pct(A["cx"].get("problem_pct"))}</b><span>των πελατών είχαν πρόβλημα μετά την αγορά</span></div>
<div class="kpi"><b>{pct(T["Q24"].get("top2"))}</b><span>πιθανό να τον επιλέξουν στην επόμενη αγορά (4–5)</span></div>
<div class="kpi"><b>{pct(T["Q31"].get("top2"))}</b><span>θα έδιναν δεύτερη ευκαιρία μετά από γρήγορη και δίκαιη λύση</span></div>
</div>{r.text("exec_intro")}<h3>Κύρια ευρήματα</h3><ol class="f">{"".join(f"<li>{x}</li>" for x in N.get("exec_findings", ["[ευρήματα]"]))}</ol>
<h3>Τι σημαίνουν για τον Κωτσόβολο</h3>{r.text("exec_implications")}
<div class="warnbox">{r.text("exec_caveat", "<b>Πώς να διαβαστούν:</b> τα ποσοστά περιγράφουν το συνθετικό δείγμα. Οι σχέσεις (ποιοι παράγοντες κινούν την εμπιστοσύνη, πώς διαφέρουν οι ομάδες) είναι πιο χρήσιμες από τα απόλυτα επίπεδα, τα οποία εξαρτώνται από τη μη μετρημένη «βάση» της μάρκας στο μοντέλο.")}</div></section>''')
    # ---------------- 2. μεθοδολογία & δείγμα
    smp = A["sample"]
    def dist_rows(key, mapping=None, order=None):
        d = smp[key]
        ks = order or sorted(d, key=lambda k: -d[k])
        return [((mapping or {}).get(k, k), 100 * d.get(k, 0) / n, d.get(k, 0)) for k in ks if k in d]
    gmap = {"male": "Άνδρες", "female": "Γυναίκες"}
    emap = {"less_than_primary": "Κάτω από δημοτικό", "primary": "Δημοτικό", "lower_secondary": "Γυμνάσιο", "upper_secondary": "Λύκειο",
            "post_secondary": "Μεταλυκειακή", "tertiary": "Τριτοβάθμια"}
    add(f'''<section class="sec"><h2><span class="no">2</span>Μεθοδολογία και προφίλ του συνθετικού δείγματος</h2>{r.text("method_summary")}
<div class="two"><div class="fig"><h4>Ηλικία</h4>{hb2(dist_rows("age_band", order=["18-24", "25-34", "35-44", "45-54", "55-64", "65+"]), NAVY, maxv=40, L=120)}</div>
<div class="fig"><h4>Φύλο</h4>{hb2(dist_rows("gender", gmap), NAVY, maxv=70, L=120)}<h4>Εκπαίδευση</h4>{hb2(dist_rows("education", emap, ["less_than_primary", "primary", "lower_secondary", "upper_secondary", "post_secondary", "tertiary"]), NAVY, maxv=45, L=120)}</div></div>
<div class="fig"><h4>Περιφέρεια</h4>{hbar(dist_rows("region"), NAVY, maxv=45, L=230, RH=19)}</div>
<div class="two"><div class="fig"><h4>Εισοδηματικό πεμπτημόριο νοικοκυριού</h4>{hb2(dist_rows("income_quintile", None, ["1", "2", "3", "4", "5"]), NAVY, maxv=40, L=120)}</div>
<div class="fig"><h4>Σχέση με τον Κωτσόβολο (φυσική συχνότητα, χωρίς ποσόστωση)</h4>{hb2(dist_rows("segment_l", None, list(SEGC)), TEAL, maxv=80, L=170)}</div></div>
<div class="cap">Βάση: {n} ολοκληρωμένες συνθετικές συνεντεύξεις. Η σύνθεση ακολουθεί το πλαίσιο πληθυσμού ενηλίκων 2025· οι πελάτες του Κωτσόβολου δεν ορίστηκαν με ποσόστωση αλλά προέκυψαν από τις απαντήσεις.</div></section>''')
    # ---------------- 3. αγορά
    add(f'''<section class="sec"><h2><span class="no">3</span>Η αγορά: αγορές, κανάλια και κριτήρια επιλογής</h2>{r.text("market")}
<div class="two"><div class="fig"><h4>Αγορά ηλεκτρικής/ηλεκτρονικής συσκευής (24 μήνες)</h4>{hb2(r.rows("Q01"), NAVY, maxv=100, L=130)}{cap("Q01", r)}</div>
<div class="fig"><h4>Τύποι καταστημάτων που χρησιμοποιήθηκαν</h4>{hb2(r.rows("Q02", sort=True), NAVY, maxv="auto", L=200)}{cap("Q02", r)}</div></div>
<div class="fig"><h4>Τα σημαντικότερα κριτήρια επιλογής καταστήματος (έως 3)</h4>{hbar(r.rows("Q03", sort=True), TEAL, maxv="auto")}{cap("Q03", r)}</div>
<div class="fig"><h4>Τι επηρεάζει περισσότερο την εμπιστοσύνη σε κατάστημα ηλεκτρικών</h4>{hbar(r.rows("Q11", sort=True), TEAL, maxv="auto")}{cap("Q11", r)}</div>
{_imp_by(A, "Q03", r, "age3", ["18–34", "35–54", "55+"], "Κριτήρια επιλογής ανά ηλικία (%)")}</section>''')
    # ---------------- 4. εικόνα & εμπιστοσύνη
    sc = [r.scale_row("Συνολική εικόνα (Q08)", "Q08"), r.scale_row("Εμπιστοσύνη (Q09)", "Q09"), r.scale_row("Τηρεί τις δεσμεύσεις (Q10)", "Q10"),
          r.scale_row("Σε σύγκριση με ανταγωνιστές (Q22)", "Q22")]
    bb = A["brand_by"]
    rowsq9 = []
    for col, title in (("segment_l", "Σχέση"), ("age3", "Ηλικία"), ("gender_l", "Φύλο"), ("region4", "Περιοχή"), ("edu3", "Εκπαίδευση"), ("inc3", "Εισόδημα")):
        for x in bb[col]:
            rowsq9.append((f"{title}: {x['group']}", x["Q09_s_mean"], x["Q09_s_n"], SEGC.get(x["group"], NAVY)))
    fam = A["by_familiarity"]
    add(f'''<section class="sec"><h2><span class="no">4</span>Εικόνα και εμπιστοσύνη στον Κωτσόβολο</h2>{r.text("image_trust")}
<div class="fig"><h4>Από τη γνωριμία στη σύσταση (βάση: όλοι, n={n})</h4>{funnel(A["funnel"])}<div class="cap">Κάθε βήμα ως ποσοστό του συνόλου του δείγματος. Όσοι δεν γνωρίζουν την αλυσίδα δεν ερωτήθηκαν για εικόνα και εμπιστοσύνη.</div></div>
<div class="two"><div class="fig"><h4>Εξοικείωση με την αλυσίδα</h4>{hb2(r.rows("Q04"), NAVY, maxv="auto", L=180)}{cap("Q04", r)}</div>
<div class="fig"><h4>Αγορά από τον Κωτσόβολο (όσοι τον γνωρίζουν)</h4>{hb2(r.rows("Q05"), NAVY, maxv="auto", L=140)}{cap("Q05", r)}</div></div>
<div class="fig"><h4>Αξιολογήσεις μάρκας (όσοι γνωρίζουν την αλυσίδα)</h4>{stack5(sc, dk_label="Δεν ξέρω / δεν κρίνω")}<div class="cap">Ποσοστά επί όσων ερωτήθηκαν (n στη δεξιά στήλη). Κλίμακα 1–5· η γκρι περιοχή είναι «δεν γνωρίζω / δεν μπορώ να κρίνω / δεν μπορώ να συγκρίνω».</div></div>
{r.text("image_trust_2")}
<div class="fig"><h4>Μέση εμπιστοσύνη (1–5) ανά ομάδα — όσοι κρίνουν</h4>{dots(rowsq9, RH=19)}<div class="cap">Μέσος όρος της Q09 χωρίς το «δεν γνωρίζω». Ομάδες με n &lt; 15 ερμηνεύονται με επιφύλαξη.</div></div>
<div class="fig"><h4>Δείκτες μάρκας ανά βαθμό εξοικείωσης</h4>{table(["Εξοικείωση", "n", "Εικόνα 4–5", "Εμπιστοσύνη 4–5", "Δεσμεύσεις 4–5", "Πρόθεση 4–5", "Καθαρός δείκτης σύστασης"],
        [[esc(x["group"]), x["n"], pct(x["Q08_s_top2"]), pct(x["Q09_s_top2"]), pct(x["Q10_s_top2"]), pct(x["Q24_s_top2"]), f1(x["NPS_score"], 0)] for x in fam])}<div class="cap">Ποσοστά 4–5 επί όσων έδωσαν βαθμό (χωρίς «δεν ξέρω»).</div></div></section>''')
    # ---------------- 5. εμπειρία πελάτη
    cx = A["cx"]
    cxs = [r.scale_row("Συνολική εμπειρία αγοράς (Q12)", "Q12"), r.scale_row("Σαφήνεια ενημέρωσης παραγγελίας (Q13)", "Q13")]
    add(f'''<section class="sec"><h2><span class="no">5</span>Εμπειρία πελάτη: παραδόσεις, προβλήματα, επιστροφές και after-sales</h2>{r.text("cx")}
<div class="kpis"><div class="kpi"><b>{cx["n_customers"]}</b><span>πελάτες 24 μηνών στο δείγμα</span></div>
<div class="kpi"><b>{pct(cx["on_time_pct_of_applicable"])}</b><span>παράδοση/παραλαβή στον χρόνο (πλήρως ή με μικρή απόκλιση), όπου δόθηκε χρόνος</span></div>
<div class="kpi"><b>{pct(cx["problem_pct"])}</b><span>είχαν πρόβλημα μετά την αγορά</span></div>
<div class="kpi"><b>{pct(cx["contacted_pct_of_problem"])}</b><span>όσων είχαν πρόβλημα επικοινώνησαν με την εταιρεία</span></div></div>
<div class="two"><div class="fig"><h4>Κανάλι της πιο πρόσφατης αγοράς</h4>{hb2(r.rows("Q06"), TEAL, maxv="auto", L=170)}{cap("Q06", r)}</div>
<div class="fig"><h4>Κατηγορία προϊόντος</h4>{hb2(r.rows("Q07", sort=True), TEAL, maxv="auto", L=170)}{cap("Q07", r)}</div></div>
<div class="fig"><h4>Αξιολόγηση εμπειρίας (πελάτες)</h4>{stack5(cxs, dk_label="Δεν ξέρω / δεν εφαρμόζεται")}</div>
<div class="fig"><h4>Τήρηση χρόνου παράδοσης / παραλαβής</h4>{hbar(r.rows("Q14"), TEAL, maxv="auto", L=260)}{cap("Q14", r)}</div>
{r.text("cx_2")}
<div class="two"><div class="fig"><h4>Πρόβλημα μετά την αγορά</h4>{hb2(r.rows("Q15"), AMBER, maxv="auto", L=120)}{cap("Q15", r)}</div>
<div class="fig"><h4>Είδος προβλήματος</h4>{hb2(r.rows("Q16", sort=True), AMBER, maxv="auto", L=200)}{cap("Q16", r)}</div></div>
<div class="two"><div class="fig"><h4>Επικοινωνία με την εταιρεία</h4>{hb2(r.rows("Q17"), AMBER, maxv="auto", L=120)}{cap("Q17", r)}</div>
<div class="fig"><h4>Τρέχουσα κατάσταση του προβλήματος</h4>{hb2(r.rows("Q18"), AMBER, maxv="auto", L=160)}{cap("Q18", r)}</div></div>
<div class="fig"><h4>Ικανοποίηση από τον χειρισμό και μεταβολή εμπιστοσύνης</h4>{stack5([r.scale_row("Ικανοποίηση από τον χειρισμό (Q19)", "Q19"), r.scale_row("Η εμπιστοσύνη μετά την εμπειρία (Q20)", "Q20")], dk_label="Δεν κρίνω")}
<div class="cap">Q19: όσοι είχαν πρόβλημα και επικοινώνησαν (n={r.base("Q19")}) · Q20: όσοι είχαν πρόβλημα (n={r.base("Q20")}) · Q20: 1 = μειώθηκε πολύ … 3 = δεν άλλαξε … 5 = αυξήθηκε πολύ.</div></div>
<div class="fig"><h4>Συναίσθημα για το πρόβλημα</h4>{hbar(r.rows("Q21", sort=True), AMBER, maxv="auto", L=200)}{cap("Q21", r)}</div>
{_recovery_tables(A, r)}{r.text("cx_3")}</section>''')
    # ---------------- 6. σχέσεις
    cor = A["correlations"]
    vv = [("Q08_s", "Εικόνα"), ("Q09_s", "Εμπιστοσύνη"), ("Q10_s", "Δεσμεύσεις"), ("Q12_s", "Εμπειρία"), ("Q13_s", "Ενημέρωση"), ("Q22_s", "Έναντι ανταγων."),
          ("Q24_s", "Πρόθεση"), ("NPS", "Σύσταση 0–10")]
    def rho(a, b):
        x = cor.get(f"{a}~{b}") or cor.get(f"{b}~{a}")
        return x["rho"] if x else None
    ctab = [[f"<b>{l}</b>"] + [heat(rho(a, b)) if a != b else "1" for b, _ in vv] for a, l in vv]
    add(f'''<section class="sec"><h2><span class="no">6</span>Πώς συνδέονται εμπειρία, εμπιστοσύνη και πρόθεση αγοράς</h2>{r.text("relations")}
<div class="fig"><h4>Συσχετίσεις Spearman μεταξύ βασικών δεικτών</h4>{table([""] + [l for _, l in vv], ctab, "t sm")}<div class="cap">Ζεύγη με διαθέσιμες απαντήσεις (χωρίς «δεν ξέρω»). Οι Εμπειρία/Ενημέρωση αφορούν μόνο πελάτες.</div></div>
{_drivers(A)}{r.text("relations_2")}{_exp_group_table(A)}</section>''')
    # ---------------- 7. πελάτες vs μη πελάτες
    cvn = A["cust_vs_non"]
    add(f'''<section class="sec"><h2><span class="no">7</span>Πελάτες έναντι μη πελατών</h2>{r.text("cust_vs_non")}
{table(["Ομάδα", "n", "Εικόνα (μ.ο.)", "Εμπιστοσύνη (μ.ο.)", "Δεσμεύσεις (μ.ο.)", "Έναντι ανταγ. (μ.ο.)", "Πρόθεση (μ.ο.)", "Σύσταση 0–10 (μ.ο.)", "Καθαρός δείκτης σύστασης", "Επίδραση CSR (μ.ο.)", "CSR αντισταθμίζει (μ.ο.)", "Δεύτερη ευκαιρία (μ.ο.)"],
        [[esc(x["group"]), x["n"], f1(x["Q08_s_mean"], 2), f1(x["Q09_s_mean"], 2), f1(x["Q10_s_mean"], 2), f1(x["Q22_s_mean"], 2), f1(x["Q24_s_mean"], 2), f1(x["NPS_mean"], 1), f1(x["NPS_score"], 0),
          f1(x["Q28_s_mean"], 2), f1(x["Q29_s_mean"], 2), f1(x["Q31_s_mean"], 2)] for x in cvn], "t sm")}
<div class="cap">Μέσοι όροι κλιμάκων 1–5 (σύσταση 0–10) επί όσων έδωσαν βαθμό. Βάση: όσοι γνωρίζουν την αλυσίδα.</div>
{_seg_compare(A, r)}{r.text("cust_vs_non_2")}</section>''')
    # ---------------- 8. ανταγωνισμός & σύσταση
    q23 = A["competition"]["Q23"]
    segs = [s for s in SEGC if s in q23]
    opts23 = A["labels"]["Q23"]["options"]
    add(f'''<section class="sec"><h2><span class="no">8</span>Ανταγωνιστική θέση και συμπεριφορά σύστασης</h2>{r.text("competition")}
<div class="fig"><h4>Εναλλακτικές για την επόμενη αγορά (έως 3)</h4>{gbar(list(opts23.values()), [(s, SEGC[s], [q23[s].get(c) for c in opts23]) for s in segs])}
<div class="cap">Q23 · % ανά ομάδα · βάσεις: {", ".join(f"{s} {q23[s]['n_base']}" for s in segs)} · πολλαπλές απαντήσεις.</div></div>
<div class="fig"><h4>Πρόθεση επιλογής και σύσταση</h4>{stack5([r.scale_row("Πιθανότητα επιλογής στην επόμενη αγορά (Q24)", "Q24")], dk_label="Δεν σχεδιάζει / δεν ξέρει")}</div>
<div class="two"><div class="fig"><h4>Σύσταση 0–10 (Q25)</h4>{hb2([(x[0], x[1], x[2]) for x in r.rows("Q25")], NAVY, maxv="auto", L=120, RH=18)}{cap("Q25", r, f" · υποστηρικτές {pct(nps['promoters'])}, ουδέτεροι {pct(nps['passives'])}, επικριτές {pct(nps['detractors'])}")}</div>
<div class="fig"><h4>Σύσταση στην πράξη (12 μήνες)</h4>{hb2(r.rows("Q26"), NAVY, maxv="auto", L=200)}{cap("Q26", r)}{_q26_by_nps(A)}</div></div>
{r.text("competition_2")}</section>''')
    # ---------------- 9. CSR
    add(f'''<section class="sec"><h2><span class="no">9</span>Κοινωνική προσφορά έναντι εμπειρίας πελάτη</h2>{r.text("csr")}
<div class="fig"><h4>Γνώση κοινωνικών δράσεων του Κωτσόβολου</h4>{hbar(r.rows("Q27"), TEAL, maxv="auto", L=170)}{cap("Q27", r)}</div>
<div class="fig">{stack5([r.scale_row("Οι κοινωνικές δράσεις επηρεάζουν την εικόνα μου (Q28)", "Q28"), r.scale_row("Η κοινωνική προσφορά αποκαθιστά την εμπιστοσύνη μετά από κακή εξυπηρέτηση (Q29)", "Q29")])}</div>
{_csr_tables(A)}{r.text("csr_2")}</section>''')
    # ---------------- 10. αποκατάσταση
    q30 = A["recovery"]["Q30"]
    opts30 = A["labels"]["Q30"]["options"]
    add(f'''<section class="sec"><h2><span class="no">10</span>Οδηγοί αποκατάστασης της εμπιστοσύνης</h2>{r.text("recovery")}
<div class="fig"><h4>Ενέργειες που θα αύξαναν την εμπιστοσύνη (έως 3)</h4>{gbar(list(opts30.values()), [(s, SEGC[s], [q30[s].get(c) for c in opts30]) for s in SEGC if s in q30])}
<div class="cap">Q30 · % ανά ομάδα · ρωτήθηκε σε όλους · πολλαπλές απαντήσεις.</div></div>
<div class="two"><div class="fig"><h4>Το σημαντικότερο στοιχείο για να ξανακερδηθεί η εμπιστοσύνη</h4>{hb2(r.rows("Q33", sort=True), TEAL, maxv="auto", L=230)}{cap("Q33", r)}</div>
<div class="fig"><h4>Μέγιστο εύλογο διάστημα πρώτης ουσιαστικής απάντησης</h4>{hb2(r.rows("Q32"), TEAL, maxv="auto", L=200)}{cap("Q32", r)}</div></div>
<div class="fig">{stack5([r.scale_row("Δεύτερη ευκαιρία μετά από γρήγορη και δίκαιη λύση (Q31)", "Q31")])}</div>
<div class="fig"><h4>Πρώτη προτεραιότητα βελτίωσης για τον Κωτσόβολο</h4>{hbar(r.rows("Q34", sort=True), NAVY, maxv="auto", L=230)}{cap("Q34", r)}</div>
{_q30_by_exp(A)}{r.text("recovery_2")}</section>''')
    # ---------------- 11. τμηματοποίηση
    sg = A["segmentation"]
    names = N.get("segment_names", {})
    segrows = []
    for p in sorted(sg["profiles"], key=lambda p: p["cluster"]):
        nm = names.get(p["cluster"], {"name": f"Ομάδα {p['cluster']}" if p["cluster"] != "U" else "Αβέβαιοι", "desc": ""})
        segrows.append([f"<b>{esc(nm['name'])}</b><br><span class='small'>{nm.get('desc', '')}</span>", p["n"], pct(p["share_of_aware_pct"]), f1(p["Q08_s"], 2), f1(p["Q09_s"], 2),
                        f1(p["Q24_s"], 2), f1(p["NPS"], 1), pct(p["customers_pct"]), pct(p["familiar_pct"])])
    add(f'''<section class="sec"><h2><span class="no">11</span>Τμηματοποίηση</h2>{r.text("segmentation")}
{table(["Τμήμα", "n", "% όσων γνωρίζουν", "Εικόνα", "Εμπιστοσύνη", "Πρόθεση", "Σύσταση 0–10", "Πελάτες", "Γνωρίζουν καλά"], segrows, "t sm")}
<div class="cap">k-means (k={sg["k"]}, επιλογή με silhouette = {f1(sg["silhouette"], 2)}) σε τυποποιημένους δείκτες εικόνας, εμπιστοσύνης, δεσμεύσεων, σύγκρισης, πρόθεσης και σύστασης, επί όσων γνωρίζουν την αλυσίδα και έδωσαν βαθμό σε ≥ 5 από τους 6 δείκτες ({sg["n_clustered"]} από {sg["n_aware"]}). «Αβέβαιοι»: ≥ 2 «δεν ξέρω» στους βασικούς δείκτες.</div>
{r.text("segmentation_2")}</section>''')
    # ---------------- 12. υποθέσεις
    hyp = N.get("hypotheses", [])
    badge = {"Υποστηρίζεται": "b-s", "Μερικώς": "b-p", "Δεν υποστηρίζεται": "b-n", "Δεν κρίνεται": "b-u"}
    add(f'''<section class="sec"><h2><span class="no">12</span>Αξιολόγηση των υποθέσεων της Signalyth</h2>{r.text("hypotheses_intro")}
{table(["#", "Υπόθεση (από τη θεματολογία Signalyth)", "Ερωτήσεις", "Τι δείχνει η συνθετική μελέτη", "Αξιολόγηση"],
        [[esc(h["id"]), esc(h["statement"]), esc(h["questions"]), h["evidence"], f'<span class="badge {badge.get(h["verdict"], "b-u")}">{esc(h["verdict"])}</span>'] for h in hyp], "t sm")}
{r.text("hypotheses_note")}</section>''')
    # ---------------- 13. στρατηγική
    recs = N.get("recommendations", [])
    add(f'''<section class="sec"><h2><span class="no">13</span>Στρατηγικά συμπεράσματα και προτεραιότητες</h2>{r.text("strategy")}
<h3>Προτεραιοποιημένες συστάσεις</h3><ol class="rec">{"".join(f"<li><b>{esc(x['title'])}</b> <span class='badge b-s'>{esc(x.get('priority', ''))}</span><br>{x['why']}<br><span class='small'><b>Δείκτης παρακολούθησης:</b> {x.get('kpi', '')}</span></li>" for x in recs)}</ol>
{r.text("strategy_2")}<h3>Τι θα επιβεβαίωνε ή θα διέψευδε αυτά τα συμπεράσματα</h3>{r.text("validation_next")}</section>''')
    # ---------------- Παράρτημα Α: όλες οι ερωτήσεις
    add('<section class="sec"><h2>Παράρτημα Α — Αποτελέσματα όλων των ερωτήσεων</h2><p class="small">Ποσοστά επί όσων ερωτήθηκαν (βάση = όσοι πληρούσαν τη συνθήκη της ερώτησης). Πολλαπλές απαντήσεις: % ερωτώμενων που επέλεξαν κάθε επιλογή (άθροισμα > 100%).</p>')
    for qid, m in A["labels"].items():
        t = T[qid]
        cond = m["condition"] or "όλοι"
        if not t.get("asked"):
            add(f'<h3>{qid}. {esc(m["text"])}</h3><p class="small">Δεν ρωτήθηκε σε κανέναν (συνθήκη: {esc(cond)}).</p>')
            continue
        extra = f" · μέσος όρος 1–5: {f1(t['mean'], 2)} · 4–5: {pct(t['top2'])} · 1–2: {pct(t['bottom2'])} (n={t['n_valid']})" if t.get("mean") is not None else ""
        if qid == "Q25":
            extra = f" · μέσος 0–10: {f1(t['nps']['mean'], 2)} · καθαρός δείκτης: {f1(t['nps']['score'], 0)}"
        add(f'<h3>{qid}. {esc(m["text"])}</h3>' + table(["Επιλογή", "n", "%"], [[esc(x["label"]), x["n"], pct(x["pct"])] for x in t["rows"]], "t sm") +
            f'<div class="cap">Βάση: {t["n_base"]} · συνθήκη: {esc(cond)}{" · πολλαπλές απαντήσεις" if t.get("multi") else ""}{extra}</div>')
    add("</section>")
    # ---------------- Παράρτημα Β: μεθοδολογία
    add(f'<section class="sec"><h2>Παράρτημα Β — Μεθοδολογία, ποιότητα και ίχνος ελέγχου</h2>{r.text("appendix_method")}')
    if gate:
        add("<h3>Έλεγχοι ποιότητας (προκαθορισμένα κριτήρια)</h3>" + table(["Κριτήριο", "Αποτέλεσμα", "Λεπτομέρεια"],
            [[esc(c["criterion"]), f'<span class="badge {"b-s" if c["status"] == "PASS" else "b-n"}">{c["status"]}</span>', esc(c["detail"][:140])] for c in gate["checks"]], "t sm"))
        if gate.get("engine_warnings"):
            add("<p class='small'><b>Προειδοποιήσεις μηχανής (ενημερωτικές):</b> " + "; ".join(esc(f"{w['check']}: {w['detail'][:120]}") for w in gate["engine_warnings"]) + "</p>")
    add(r.text("appendix_evidence") + r.text("appendix_limits") + r.text("appendix_audit") + "</section>")
    # ---------------- Παράρτημα Γ: έλεγχοι
    tests = [(k.split("|"), v) for k, v in A["tests"].items() if v]
    blabel = {"segment_l": "Σχέση", "age3": "Ηλικία", "gender_l": "Φύλο", "region4": "Περιοχή", "edu3": "Εκπαίδευση", "inc3": "Εισόδημα"}
    add('<section class="sec"><h2>Παράρτημα Γ — Στατιστικοί έλεγχοι διαφορών</h2><p class="small">Έλεγχος χ² ανεξαρτησίας και V του Cramér για τις κύριες ερωτήσεις ανά ομάδα. '
        'Οι έλεγχοι περιγράφουν το <b>συνθετικό δείγμα</b>: δείχνουν αν μια διαφορά είναι συστηματική μέσα στην προσομοίωση, όχι αν υπάρχει στον πραγματικό πληθυσμό. '
        'V &lt; 0,10 αμελητέα · 0,10–0,20 μικρή · 0,20–0,30 μέτρια · &gt; 0,30 ισχυρή συσχέτιση.</p>' +
        table(["Ερώτηση", "Ομάδα", "n", "χ²", "β.ε.", "p", "V Cramér"], [[q, blabel.get(c, c), v["n"], f1(v["chi2"], 1), v["dof"], ("&lt;0,001" if v["p"] < .001 else f1(v["p"], 3)), f1(v["cramers_v"], 2)]
                                                                       for (q, c), v in tests], "t sm") + "</section>")
    add(f'<div class="synthbar">{SYNTH}</div></main>')
    return f'<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Κωτσόβολος — συνθετική έρευνα 500</title><style>{CSS}</style></head><body>{"".join(o)}</body></html>'


# ------------------------------------------------------------------ επιμέρους πίνακες
def _imp_by(A, qid, r, col, order, title):
    d = A["importance"][qid]
    opts = A["labels"][qid]["options"]
    keys = [k for k in order if k in d]
    if not keys:
        return ""
    rows = [[esc(l)] + [pct(d[k].get(c)) for k in keys] for c, l in opts.items()]
    return f'<div class="fig"><h4>{esc(title)}</h4>' + table(["Κριτήριο"] + [f"{k} (n={d[k]['n_base']})" for k in keys], rows, "t sm") + "</div>"


def _recovery_tables(A, r):
    tc = A["cx"]["trust_change_by_recovery"]
    if not tc:
        return ""
    opts = A["labels"]["Q20"]["options"]
    rows = [[esc(x["recovery"]), x["n_base"]] + [pct(y["pct"]) for y in x["rows"]] for x in tc]
    em = A["cx"]["emotion_by_recovery"]
    rows2 = [[esc(x["recovery"]), x["n_base"]] + [pct(y["pct"]) for y in x["rows"]] for x in em]
    return ('<div class="fig"><h4>Μεταβολή εμπιστοσύνης (Q20) ανά έκβαση του προβλήματος (Q18)</h4>' +
            table(["Έκβαση", "n"] + list(opts.values()), rows, "t sm") + '</div><div class="fig"><h4>Συναίσθημα (Q21) ανά έκβαση</h4>' +
            table(["Έκβαση", "n"] + list(A["labels"]["Q21"]["options"].values()), rows2, "t sm") + "</div>")


def _drivers(A):
    dv = A["drivers"]
    nm = {"Q08_s": "Συνολική εικόνα", "Q09_s": "Εμπιστοσύνη", "Q10_s": "Τήρηση δεσμεύσεων", "Q22_s": "Σύγκριση με ανταγωνιστές", "Q12_s": "Εμπειρία τελευταίας αγοράς",
          "Q13_s": "Σαφήνεια ενημέρωσης", "on_time": "Παράδοση στον χρόνο", "problem_b": "Πρόβλημα μετά την αγορά", "unresolved_b": "Πρόβλημα όχι πλήρως λυμένο",
          "Q24_s": "Πρόθεση επιλογής", "NPS": "Σύσταση 0–10"}
    o = []
    for key, title in (("aware:Q24_s", "Τι εξηγεί την πρόθεση επιλογής (όσοι γνωρίζουν)"), ("aware:NPS", "Τι εξηγεί τη σύσταση 0–10 (όσοι γνωρίζουν)"),
                       ("customers:Q09_s", "Τι εξηγεί την εμπιστοσύνη των πελατών"), ("customers:Q24_s", "Τι εξηγεί την πρόθεση των πελατών")):
        x = dv.get(key)
        if not x:
            continue
        rows = sorted(x["predictors"], key=lambda p: -(p["shapley_r2"] or 0))
        o.append(f'<div class="fig"><h4>{esc(title)} — R² = {f1(x["r2"], 2)}, n = {x["n"]}</h4>' +
                 hbar([(nm.get(p["var"], p["var"]) + f" (β={f1(p['std_beta'], 2)})", p["share_pct"], None) for p in rows], TEAL, maxv=100, L=330) +
                 '<div class="cap">Μερίδιο του R² ανά παράγοντα (αποσύνθεση Shapley/LMG σε γραμμική παλινδρόμηση)· β = τυποποιημένος συντελεστής. Συσχέτιση, όχι απόδειξη αιτιότητας.</div></div>')
    return "".join(o)


def _exp_group_table(A):
    eg = A["cx"]["by_exp_group"]
    if not eg:
        return ""
    return ('<div class="fig"><h4>Δείκτες μάρκας ανά εμπειρία πελάτη</h4>' +
            table(["Εμπειρία", "n", "Εμπιστοσύνη (μ.ο.)", "Εμπιστοσύνη 4–5", "Εικόνα 4–5", "Πρόθεση 4–5", "Καθαρός δείκτης σύστασης"],
                  [[esc(x["group"]), x["n"], f1(x["Q09_s_mean"], 2), pct(x["Q09_s_top2"]), pct(x["Q08_s_top2"]), pct(x["Q24_s_top2"]), f1(x["NPS_score"], 0)] for x in eg], "t sm") +
            '<div class="cap">Πελάτες 24 μηνών. Ομάδες με n &lt; 15: ενδεικτικά.</div></div>')


def _seg_compare(A, r):
    xt = A["competition"]["Q22_by_segment"]
    if not xt:
        return ""
    by = {}
    for x in xt:
        by.setdefault(x["group"], []).append(x)
    rows = [r.scale_row(g, "Q22", rows=[{"code": y["code"], "n": y["n"]} for y in v], n=v[0]["n_base"]) for g, v in by.items()]
    return '<div class="fig"><h4>Σύγκριση με ανταγωνιστές (Q22) ανά ομάδα</h4>' + stack5(rows, dk_label="Δεν μπορώ να συγκρίνω") + "</div>"


def _q26_by_nps(A):
    xt = A["competition"]["Q26_by_NPS"]
    if not xt:
        return ""
    by = {}
    for x in xt:
        by.setdefault(x["group"], {})[x["code"]] = (x["pct"], x["n_base"])
    order = ["Υποστηρικτές (9–10)", "Ουδέτεροι (7–8)", "Επικριτές (0–6)"]
    rows = [[g, list(by[g].values())[0][1], pct(by[g].get("1", (None,))[0]), pct(by[g].get("2", (None,))[0]), pct(by[g].get("4", (None,))[0])] for g in order if g in by]
    return table(["Πρόθεση σύστασης", "n", "Ενθάρρυνε", "Απέτρεψε", "Ούτε τα δύο"], rows, "t sm")


def _csr_tables(A):
    c = A["csr"]
    t1 = table(["Γνώση δράσεων (Q27)", "n", "Εμπιστοσύνη (μ.ο.)", "Εικόνα (μ.ο.)"],
               [[esc(A["labels"]["Q27"]["options"].get(x["group"], x["group"])), x["n"], f1(x["Q09_s_mean"], 2), f1(x["Q08_s_mean"], 2)] for x in c["trust_by_Q27"]], "t sm")
    t2 = table(["Επίδραση CSR στην εικόνα (Q28)", "n", "Αποκαθιστά μετά από κακή εξυπηρέτηση (Q29, μ.ο.)"],
               [[esc(A["labels"]["Q28"]["options"].get(x["group"], x["group"])), x["n"], f1(x["Q29_s_mean"], 2)] for x in c["Q29_by_Q28"]], "t sm")
    t3 = table(["Εμπειρία πελάτη", "n", "Επίδραση CSR (μ.ο.)", "CSR αποκαθιστά (μ.ο.)"],
               [[esc(x["group"]), x["n"], f1(x["Q28_s_mean"], 2), f1(x["Q29_s_mean"], 2)] for x in c["Q29_by_exp"]], "t sm") if c["Q29_by_exp"] else ""
    return f'<div class="two"><div class="fig">{t1}</div><div class="fig">{t2}</div></div><div class="fig">{t3}</div>'


def _q30_by_exp(A):
    d = A["recovery"]["Q30_by_problem"]
    if not d:
        return ""
    opts = A["labels"]["Q30"]["options"]
    keys = [k for k in d if k != "Σύνολο"]
    rows = [[esc(l)] + [pct(d[k].get(c)) for k in keys] for c, l in opts.items()]
    return '<div class="fig"><h4>Ενέργειες αύξησης εμπιστοσύνης ανά εμπειρία πελάτη (Q30, πελάτες)</h4>' + table(["Ενέργεια"] + [f"{k} (n={d[k]['n_base']})" for k in keys], rows, "t sm") + "</div>"


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--analysis", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--narrative")
    ap.add_argument("--gate")
    ap.add_argument("--date", default="")
    ap.add_argument("--no-pdf", action="store_true")
    a = ap.parse_args()
    A = json.loads((Path(a.analysis) / "analysis.json").read_text(encoding="utf-8"))
    N = json.loads(Path(a.narrative).read_text(encoding="utf-8")) if a.narrative else {}
    G = json.loads(Path(a.gate).read_text(encoding="utf-8")) if a.gate else None
    out = Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    h = out / "kotsovolos_synthetic_500_report.html"
    h.write_text(render(A, N, G, {"date": a.date}), encoding="utf-8")
    if not a.no_pdf:
        js = ROOT / "research-engine" / "ase" / "report" / "render_pdf.cjs"
        subprocess.run(["node", str(js), str(h), str(out / "kotsovolos_synthetic_500_report.pdf")], check=True, cwd="/tmp")
    print(h)


if __name__ == "__main__":
    main()
