"""CLIENT REPORT — παρουσίαση πελάτη Viewscope (PDF + επεξεργάσιμο PowerPoint) από μια εκτέλεση του γρήγορου μηχανισμού.

Περιεχόμενο πελάτη ΜΟΝΟ: ευρήματα, γραφήματα, ανάλυση ομάδων, ερμηνεία, σύντομη μεθοδολογία, διακριτικά σήματα τεκμηρίωσης
(πράσινο βιβλίο = εμπειρικά τεκμηριωμένη, μωβ PC = συνθετική εκτίμηση σεναρίου, βιβλίο + «μεταφ.» = μεταφερόμενη εκτίμηση).
Τα αναλυτικά στοιχεία τεκμηρίωσης ΔΕΝ μπαίνουν εδώ — μένουν στον εσωτερικό φάκελο.

    python3 -I scripts/synthetic-lab/structured/client_report.py --study studies/kotsovolos_lab_pilot_2026
"""
from __future__ import annotations

import argparse
import base64
import html
import json
import subprocess
import sys
from pathlib import Path

import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(Path(__file__).resolve().parent))
from analyze import kpis  # noqa: E402

ICONS = ROOT / "public" / "viewscope" / "evidence-icons"
LABEL = "ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ"
INK, SLATE, MUTED, LINE, PANEL = "#1D2433", "#4A5468", "#8A93A6", "#E3E6EC", "#F5F6F9"
ACCENT, ACCENT2, ACCENT3 = "#2F4B7C", "#7FA0C9", "#C9D6EA"
DIV5 = ["#B4533C", "#E5A58F", "#D8DCE3", "#93B9A6", "#3F7A62"]          # αρνητικό → θετικό
GREY = "#B8BECA"


# ------------------------------------------------------------------------------------------------ δεδομένα
def load(study: Path):
    ip = study / "internal_package"
    spec = json.loads((study / "spec.json").read_text(encoding="utf-8"))
    run = json.loads((ip / "runs" / "main.json").read_text(encoding="utf-8"))
    dist = pd.read_csv(ip / "qc" / "distributions.csv", dtype={"option": str})
    cls = pd.read_csv(ip / "qc" / "evidence_classes.csv").set_index("question")["effective"].to_dict()
    nar = yaml.safe_load((study / "narrative.yaml").read_text(encoding="utf-8")) if (study / "narrative.yaml").exists() else {}
    return spec, run, dist, cls, nar


def respondents(run) -> pd.DataFrame:
    rows = []
    for r in run["respondents"]:
        d = dict(r["answers"])
        d.update({f"c_{k}": v for k, v in r["covariates"].items()})
        rows.append(d)
    df = pd.DataFrame(rows)
    df["age3"] = df["c_age_band"].map(lambda a: "18–34" if a in ("15-24", "25-34") else "35–54" if a in ("35-44", "45-54") else "55+")
    df["sex"] = df["c_gender"].map({"female": "Γυναίκες", "male": "Άνδρες"})
    df["reg3"] = df["c_region"].map(lambda r: "Αττική" if r == "GRCr101" else "Κεντρ. Μακεδονία" if r == "GRCr106" else "Λοιπή Ελλάδα")
    df["cust"] = df.apply(lambda x: "Πελάτες 24μ" if x["Q05"] == "1" else ("Γνωρίζουν, μη πελάτες" if x["Q04"] in ("2", "3", "4") else "Δεν γνωρίζουν"), axis=1)
    df["fam"] = df["Q04"].map({"2": "Μόνο ως όνομα", "3": "Αρκετά", "4": "Πολύ καλά", "1": "Δεν γνωρίζουν"})
    return df


def t2b(s: pd.Series, top=("4", "5"), dk=("6",)) -> float | None:
    s = s.dropna()
    s = s[~s.isin(dk)]
    return float(s.isin(top).mean()) if len(s) else None


def nps(s: pd.Series) -> float | None:
    s = s.dropna()
    s = s[s != "12"].astype(int) - 1
    return float(((s >= 9).mean() - (s <= 6).mean()) * 100) if len(s) else None


def has(s: pd.Series, code: str) -> float | None:
    s = s.dropna()
    return float(s.map(lambda v: code in (v if isinstance(v, list) else [v])).mean()) if len(s) else None


def group_table(df: pd.DataFrame, by: str, order: list) -> list[dict]:
    out = []
    for g in order:
        x = df[df[by] == g]
        out.append({"group": g, "n": len(x), "trust": t2b(x["Q09"]), "image": t2b(x["Q08"]), "choose": t2b(x["Q24"]), "nps": nps(x["Q25"]), "consider": has(x["Q23"], "7")})
    return out


def facts(run, df) -> dict:
    k = kpis(run)
    cust = df[df["Q05"] == "1"]
    f = {"n": len(df), "n_aware": int(df["Q04"].isin(["2", "3", "4"]).sum()), "n_cust": len(cust), "n_problem": int((cust["Q15"] == "1").sum()), "k": k}
    f["by_age"] = group_table(df, "age3", ["18–34", "35–54", "55+"])
    f["by_sex"] = group_table(df, "sex", ["Γυναίκες", "Άνδρες"])
    f["by_reg"] = group_table(df, "reg3", ["Αττική", "Κεντρ. Μακεδονία", "Λοιπή Ελλάδα"])
    f["by_cust"] = group_table(df, "cust", ["Πελάτες 24μ", "Γνωρίζουν, μη πελάτες"])
    f["by_fam"] = group_table(df, "fam", ["Μόνο ως όνομα", "Αρκετά", "Πολύ καλά"])
    pos = cust[cust["Q12"].isin(["4", "5"])]
    neg = cust[cust["Q12"].isin(["1", "2", "3"])]
    f["exp_rel"] = [{"group": "Θετική εμπειρία (4–5)", "n": len(pos), "trust": t2b(pos["Q09"]), "nps": nps(pos["Q25"]), "choose": t2b(pos["Q24"])},
                    {"group": "Ουδέτερη/αρνητική (1–3)", "n": len(neg), "trust": t2b(neg["Q09"]), "nps": nps(neg["Q25"]), "choose": t2b(neg["Q24"])}]
    nop = cust[cust["Q15"] == "2"]
    pr = cust[cust["Q15"] == "1"]
    f["prob_rel"] = [{"group": "Χωρίς πρόβλημα", "n": len(nop), "trust": t2b(nop["Q09"]), "nps": nps(nop["Q25"])},
                     {"group": "Με πρόβλημα", "n": len(pr), "trust": t2b(pr["Q09"]), "nps": nps(pr["Q25"])}]
    return f


def pct(x, d=0):
    return "—" if x is None else f"{x * 100:.{d}f}%"


def fmt_facts(f) -> dict:
    """Τιμές για τα κείμενα ερμηνείας (narrative.yaml: {όνομα})."""
    k = f["k"]
    g = {r["group"]: r for r in f["by_cust"]}
    fam = {r["group"]: r for r in f["by_fam"]}
    age = {r["group"]: r for r in f["by_age"]}
    e = {r["group"]: r for r in f["exp_rel"]}
    return {
        "n": f["n"], "n_aware": f["n_aware"], "n_cust": f["n_cust"], "n_problem": f["n_problem"],
        "buy24": pct(k["Αγορά συσκευής 24μ (Q01)"]), "online": pct(k["Online κανάλι στους αγοραστές (Q02)"]),
        "know": pct(k["Γνωρίζουν αρκετά/πολύ καλά (Q04)"]), "cust": pct(k["Πελάτες 24μ — όλοι (Q05)"]),
        "image": pct(k["Θετική εικόνα (Q08 4–5)"]), "trust": pct(k["Εμπιστοσύνη πολύ/πάρα πολύ (Q09)"]), "commit": pct(k["Τηρεί δεσμεύσεις (Q10 4–5)"]),
        "exp": pct(k["Θετική εμπειρία πελατών (Q12 4–5)"]), "delay": pct(k["Σημαντική καθυστέρηση (Q14=3)"]), "problem": pct(k["Πρόβλημα στην αγορά (Q15)"]),
        "resolved": pct(k["Πλήρης επίλυση (Q18)"]), "consider": pct(k["Εξετάζουν την αλυσίδα (Q23)"]), "choose": pct(k["Πιθανή επιλογή (Q24 4–5)"]),
        "nps": f"{k['NPS (Q25)']:+.0f}", "advocacy": pct(k["Ενθάρρυνε άλλους (Q26)"]), "csr": pct(k["CSR επηρεάζει (Q28 4–5)"]),
        "csr_offset": pct(k["CSR αντισταθμίζει κακή εξυπηρέτηση (Q29 4–5)"]), "second": pct(k["Δεύτερη ευκαιρία μετά από δίκαιη επίλυση (Q31 4–5)"]),
        "trust_cust": pct(g["Πελάτες 24μ"]["trust"]), "trust_noncust": pct(g["Γνωρίζουν, μη πελάτες"]["trust"]),
        "nps_cust": f"{g['Πελάτες 24μ']['nps']:+.0f}", "nps_noncust": f"{g['Γνωρίζουν, μη πελάτες']['nps']:+.0f}",
        "trust_name": pct(fam["Μόνο ως όνομα"]["trust"]), "trust_well": pct(fam["Πολύ καλά"]["trust"]),
        "trust_young": pct(age["18–34"]["trust"]), "trust_old": pct(age["55+"]["trust"]),
        "trust_exp_pos": pct(e["Θετική εμπειρία (4–5)"]["trust"]), "trust_exp_neg": pct(e["Ουδέτερη/αρνητική (1–3)"]["trust"]),
        "nps_exp_pos": f"{e['Θετική εμπειρία (4–5)']['nps']:+.0f}", "nps_exp_neg": f"{e['Ουδέτερη/αρνητική (1–3)']['nps']:+.0f}",
    }


# ------------------------------------------------------------------------------------------------ εικονίδια / σήματα
def icon_uri(name: str) -> str:
    return "data:image/png;base64," + base64.b64encode((ICONS / f"{name}_96.png").read_bytes()).decode()


TIPS: dict = {}   # qid → σύντομο κείμενο πηγής/μεθόδου για το tooltip της διαδραστικής (HTML) έκδοσης


def badge_html(c: str, qid: str | None = None) -> str:
    tip = TIPS.get(qid, "") if qid else ""
    if c == "S":
        title = "Συνθετική εκτίμηση σεναρίου — ρητές παραδοχές, χωρίς άμεση μέτρηση" + (f" · {tip}" if tip else "")
        return f'<span class="badge" title="{html.escape(title)}"><img src="{icon_uri("viewscope_synthetic_pc")}" alt="S"></span>'
    note = '<span class="bnote">μεταφ.</span>' if c == "T" else ""
    title = ("Μεταφερόμενη εκτίμηση από συγγενή μέτρηση" if c == "T" else "Εμπειρικά τεκμηριωμένη εκτίμηση") + (f" · {tip}" if tip else "")
    return f'<span class="badge" title="{html.escape(title)}"><img src="{icon_uri("viewscope_empirical_book")}" alt="{c}">{note}</span>'


# ------------------------------------------------------------------------------------------------ SVG γραφήματα
def esc(s) -> str:
    return html.escape(str(s))


def wrap(label: str, width: int = 34) -> list[str]:
    words, lines, cur = label.split(), [], ""
    for w in words:
        if len(cur) + len(w) + 1 > width and cur:
            lines.append(cur)
            cur = w
        else:
            cur = (cur + " " + w).strip()
    lines.append(cur)
    return lines[:2]


def hbar(items: list[tuple[str, float]], w=560, row=30, color=ACCENT, label_w=230, maxv=None, highlight=None, fmt=lambda v: f"{v:.0f}%") -> str:
    maxv = maxv or max([v for _, v in items] + [1])
    h = row * len(items) + 6
    bw = w - label_w - 52
    out = [f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" class="chart">']
    for i, (lab, v) in enumerate(items):
        y = i * row + 4
        lines = wrap(lab, 32)
        ty = y + row / 2 - (len(lines) - 1) * 6.5 + 4
        for j, ln in enumerate(lines):
            out.append(f'<text x="{label_w - 10}" y="{ty + j * 13:.1f}" text-anchor="end" class="lab">{esc(ln)}</text>')
        bl = max(2, bw * v / maxv)
        c = highlight[1] if highlight and lab == highlight[0] else color
        out.append(f'<rect x="{label_w}" y="{y + 6}" width="{bl:.1f}" height="{row - 13}" rx="3" fill="{c}"/>')
        out.append(f'<text x="{label_w + bl + 6:.1f}" y="{y + row / 2 + 4:.1f}" class="val">{fmt(v)}</text>')
    out.append("</svg>")
    return "".join(out)


def stack5(rows: list[tuple[str, list[float], float | None]], cats: list[str], w=820, row=40, label_w=250) -> str:
    """Γραμμές 100%: 5 κατηγορίες κλίμακας (αρνητικό → θετικό) + δεξιά «Δεν γνωρίζω»."""
    h = row * len(rows) + 46
    bw = w - label_w - 70
    out = [f'<svg width="{w}" height="{h}" viewBox="0 0 {w} {h}" class="chart">']
    for i, (lab, vals, dk) in enumerate(rows):
        y = i * row + 4
        lines = wrap(lab, 34)
        ty = y + row / 2 - (len(lines) - 1) * 6.5 + 4
        for j, ln in enumerate(lines):
            out.append(f'<text x="{label_w - 10}" y="{ty + j * 13:.1f}" text-anchor="end" class="lab">{esc(ln)}</text>')
        x = label_w
        tot = sum(vals) or 1
        for k, v in enumerate(vals):
            ww = bw * v / tot
            out.append(f'<rect x="{x:.1f}" y="{y + 6}" width="{max(0, ww - 1.5):.1f}" height="{row - 14}" fill="{DIV5[k]}"/>')
            if ww > 26:
                col = "#fff" if k in (0, 4) else INK
                out.append(f'<text x="{x + ww / 2:.1f}" y="{y + row / 2 + 4:.1f}" text-anchor="middle" class="sv" fill="{col}">{v:.0f}</text>')
            x += ww
        if dk is not None:
            out.append(f'<text x="{label_w + bw + 10}" y="{y + row / 2 + 4:.1f}" class="dk">ΔΓ {dk:.0f}%</text>')
    ly = row * len(rows) + 22
    lx = label_w
    for k, c in enumerate(cats):
        out.append(f'<rect x="{lx}" y="{ly - 9}" width="10" height="10" rx="2" fill="{DIV5[k]}"/><text x="{lx + 14}" y="{ly}" class="leg">{esc(c)}</text>')
        lx += 16 + 7.2 * len(c) + 14
    out.append("</svg>")
    return "".join(out)


def nps_bar(det: float, pas: float, pro: float, score: float, w=560) -> str:
    bw = w - 20
    out = [f'<svg width="{w}" height="96" viewBox="0 0 {w} 96" class="chart">']
    x = 10
    for v, c, lab in [(det, DIV5[0], "Επικριτές 0–6"), (pas, DIV5[2], "Ουδέτεροι 7–8"), (pro, DIV5[4], "Υποστηρικτές 9–10")]:
        ww = bw * v / 100
        out.append(f'<rect x="{x:.1f}" y="10" width="{max(0, ww - 2):.1f}" height="34" fill="{c}"/>')
        col = "#fff" if c != DIV5[2] else INK
        out.append(f'<text x="{x + ww / 2:.1f}" y="32" text-anchor="middle" class="sv" fill="{col}">{v:.0f}%</text>')
        out.append(f'<text x="{x + ww / 2:.1f}" y="64" text-anchor="middle" class="leg">{lab}</text>')
        x += ww
    out.append("</svg>")
    return "".join(out)


def grid_table(rows: list[dict], cols: list[tuple[str, str, str]]) -> str:
    """Πίνακας ομάδων με θερμική απόχρωση ανά στήλη."""
    out = ['<table class="gt"><tr><th></th>' + "".join(f"<th>{esc(t)}</th>" for _, t, _ in cols) + '<th class="nb">n</th></tr>']
    for c in cols:
        vals = [r[c[0]] for r in rows if r[c[0]] is not None]
        c_ = (min(vals), max(vals)) if vals else (0, 1)
        for r in rows:
            r.setdefault("_rng", {})[c[0]] = c_
    for r in rows:
        tds = []
        for key, _, kind in cols:
            v = r[key]
            if v is None:
                tds.append("<td>—</td>")
                continue
            lo, hi = r["_rng"][key]
            a = 0.12 + 0.55 * ((v - lo) / (hi - lo) if hi > lo else 0.5)
            txt = f"{v:+.0f}" if kind == "nps" else f"{v * 100:.0f}%"
            tds.append(f'<td style="background:rgba(47,75,124,{a:.2f});color:{"#fff" if a > 0.45 else INK}">{txt}</td>')
        small = ' <span class="sb">μικρή βάση</span>' if r["n"] < 50 else ""
        out.append(f'<tr><td class="g">{esc(r["group"])}{small}</td>' + "".join(tds) + f'<td class="nb">{r["n"]}</td></tr>')
    out.append("</table>")
    return "".join(out)


# ------------------------------------------------------------------------------------------------ διαφάνειες (HTML)
CSS = f"""
@page {{ size: 1280px 720px; margin: 0 }}
* {{ box-sizing: border-box }}
body {{ margin: 0; font-family: Inter, 'DejaVu Sans', sans-serif; color: {INK}; background: #fff }}
.slide {{ width: 1280px; height: 720px; position: relative; overflow: hidden; page-break-after: always; padding: 52px 64px 0 64px; background: #fff }}
.slide:last-child {{ page-break-after: auto }}
.kicker {{ font: 600 12px Inter; letter-spacing: .14em; text-transform: uppercase; color: {MUTED}; margin-bottom: 10px }}
h1 {{ font: 600 30px 'Inter Display', Inter; margin: 0 0 8px 0; letter-spacing: -.01em }}
.insight {{ font: 400 16px/1.45 Inter; color: {SLATE}; max-width: 1080px; margin: 0 0 22px 0 }}
.cols {{ display: flex; gap: 44px }}
.col {{ flex: 1; min-width: 0 }}
.ctitle {{ font: 600 14px Inter; color: {INK}; margin: 0 0 4px 0; display: flex; align-items: center; gap: 7px }}
.cq {{ font: 400 11.5px/1.4 Inter; color: {MUTED}; margin: 0 0 10px 0 }}
.badge {{ display: inline-flex; align-items: center; gap: 3px }}
.badge img {{ width: 15px; height: 15px; vertical-align: middle; opacity: .95 }}
.bnote {{ font: 500 9px Inter; color: {MUTED}; letter-spacing: .02em }}
.chart text {{ font-family: Inter, sans-serif }}
.lab {{ font-size: 12px; fill: {SLATE} }}
.val {{ font-size: 12px; font-weight: 600; fill: {INK} }}
.sv {{ font-size: 11px; font-weight: 600 }}
.dk {{ font-size: 11px; fill: {MUTED} }}
.leg {{ font-size: 11px; fill: {SLATE} }}
.base {{ font: 400 10.5px Inter; color: {MUTED}; margin-top: 6px }}
.foot {{ position: absolute; left: 64px; right: 64px; bottom: 18px; display: flex; justify-content: space-between; align-items: center;
         font: 400 9.5px Inter; color: {MUTED}; border-top: 1px solid {LINE}; padding-top: 9px }}
.foot .brand {{ font: 600 11px 'Inter Display', Inter; color: {INK}; letter-spacing: .02em }}
.foot .brand i {{ color: {ACCENT}; font-style: normal }}
.foot .mini img {{ width: 10px; height: 10px; vertical-align: -1px; margin: 0 2px 0 8px }}
.foot .lbl {{ letter-spacing: .06em }}
.kpis {{ display: flex; gap: 16px; margin: 6px 0 24px 0 }}
.kpi {{ flex: 1; background: {PANEL}; border-radius: 10px; padding: 16px 18px 14px 18px; position: relative }}
.kpi .v {{ font: 600 34px 'Inter Display', Inter; color: {ACCENT}; letter-spacing: -.02em }}
.kpi .t {{ font: 500 12.5px/1.35 Inter; color: {SLATE}; margin-top: 2px }}
.kpi .badge {{ position: absolute; top: 12px; right: 12px }}
ul.find {{ margin: 0; padding: 0; list-style: none }}
ul.find li {{ font: 400 15px/1.45 Inter; color: {INK}; padding: 9px 0 9px 22px; border-bottom: 1px solid {LINE}; position: relative }}
ul.find li:before {{ content: ''; position: absolute; left: 2px; top: 17px; width: 8px; height: 8px; border-radius: 50%; background: {ACCENT} }}
ul.find li b {{ font-weight: 600 }}
table.gt {{ border-collapse: separate; border-spacing: 3px; font: 500 13px Inter; width: 100% }}
table.gt th {{ font: 600 11.5px Inter; color: {SLATE}; text-align: center; padding: 4px 6px }}
table.gt td {{ text-align: center; padding: 9px 6px; border-radius: 4px }}
table.gt td.g {{ text-align: left; color: {INK}; background: none; font-weight: 500 }}
table.gt .nb {{ color: {MUTED}; font-weight: 400; font-size: 11px }}
.sb {{ font: 500 9px Inter; color: #B4533C; margin-left: 6px }}
.cover {{ background: {INK}; color: #fff; padding: 0 }}
.cover .inner {{ position: absolute; left: 88px; top: 150px; right: 88px }}
.cover .vs {{ font: 600 22px 'Inter Display', Inter; letter-spacing: .04em; color: #fff }}
.cover .vs i {{ color: {ACCENT2}; font-style: normal }}
.cover h1 {{ font: 600 52px/1.08 'Inter Display', Inter; color: #fff; margin: 46px 0 18px 0; max-width: 1000px }}
.cover .sub {{ font: 400 19px/1.5 Inter; color: #C9D0DD; max-width: 880px }}
.cover .meta {{ position: absolute; left: 88px; bottom: 64px; font: 500 13px Inter; color: #9AA4B8; letter-spacing: .04em }}
.cover .bar {{ position: absolute; left: 0; top: 0; bottom: 0; width: 10px; background: linear-gradient({ACCENT2}, {ACCENT}) }}
.legend-box {{ background: {PANEL}; border-radius: 10px; padding: 14px 18px; font: 400 12.5px/1.6 Inter; color: {SLATE} }}
.legend-box img {{ width: 16px; height: 16px; vertical-align: -3px; margin-right: 6px }}
.mtable {{ font: 400 13px/1.5 Inter; color: {SLATE}; border-collapse: collapse; width: 100% }}
.mtable td {{ padding: 7px 10px 7px 0; border-bottom: 1px solid {LINE}; vertical-align: top }}
.mtable td:first-child {{ font-weight: 600; color: {INK}; width: 210px }}
.rec {{ display: flex; gap: 14px; margin-bottom: 12px }}
.rec .n {{ font: 600 22px 'Inter Display', Inter; color: {ACCENT}; width: 30px }}
.rec .b {{ font: 400 14px/1.45 Inter; color: {SLATE} }}
.rec .b b {{ color: {INK}; font-weight: 600 }}
"""


def footer(page: int, title: str) -> str:
    return (f'<div class="foot"><span><span class="brand">view<i>scope</i></span> &nbsp;·&nbsp; {esc(title)}</span>'
            f'<span class="mini"><img src="{icon_uri("viewscope_empirical_book")}">Εμπειρικά τεκμηριωμένη'
            f'<img src="{icon_uri("viewscope_empirical_book")}">μεταφ.: μεταφερόμενη'
            f'<img src="{icon_uri("viewscope_synthetic_pc")}">Συνθετική εκτίμηση σεναρίου</span>'
            f'<span class="lbl">{LABEL} · {page}</span></div>')


def build_html(spec, run, dist, cls, nar, f, F) -> tuple[str, list[dict]]:
    """Επιστρέφει HTML και περιγραφή διαφανειών (για το PowerPoint)."""
    Q = {q["id"]: q for q in spec["questions"]}
    D = {qid: g for qid, g in dist.groupby("question")}
    T = lambda key, default="": (nar.get(key, default) or "").format(**F)  # noqa: E731
    short = nar.get("short_title", "Κωτσόβολος 2026")
    slides, model = [], []

    def opts(qid, drop=(), sort=True, top=None):
        g = D[qid]
        g = g[~g["option"].isin(drop)]
        it = [(r.label, r.pct) for r in g.itertuples()]
        if sort:
            it.sort(key=lambda x: -x[1])
        return it[:top] if top else it

    def base(qid):
        return int(D[qid]["n_base"].iloc[0])

    def chart_block(qid, title, svg, extra=""):
        sb = ' <span class="sb">μικρή βάση — ενδεικτικά</span>' if base(qid) < 30 else ""
        return (f'<div class="ctitle">{esc(title)} {badge_html(cls[qid], qid)}</div><div class="cq">{esc(Q[qid]["text"])}</div>{svg}'
                f'<div class="base">Βάση: {base(qid)} {esc(extra)}{sb}</div>')

    def scale_row(qid, lab):
        g = D[qid]
        vals = [float(g[g["option"] == c]["pct"].iloc[0]) for c in ["1", "2", "3", "4", "5"]]
        dk = g[~g["option"].isin(["1", "2", "3", "4", "5"])]["pct"].sum()
        tot = sum(vals)
        return (lab, [v / tot * 100 for v in vals], dk)

    def add(kicker, title, insight, body, pptx):
        n = len(slides) + 1
        slides.append(f'<section class="slide"><div class="kicker">{esc(kicker)}</div><h1>{esc(title)}</h1>'
                      f'<p class="insight">{esc(insight)}</p>{body}{footer(n, short)}</section>')
        model.append({"kicker": kicker, "title": title, "insight": insight, **pptx})

    # 1. εξώφυλλο
    slides.append(f'<section class="slide cover"><div class="bar"></div><div class="inner"><div class="vs">view<i>scope</i></div>'
                  f'<h1>{esc(nar.get("cover_title", spec["title"]))}</h1><div class="sub">{esc(T("cover_sub"))}</div></div>'
                  f'<div class="meta">{esc(nar.get("cover_meta", ""))} &nbsp;·&nbsp; {LABEL}</div></section>')
    model.append({"cover": True, "title": nar.get("cover_title", spec["title"]), "sub": T("cover_sub"), "meta": nar.get("cover_meta", "")})

    # 2. ταυτότητα έρευνας + υπόμνημα
    ident = "".join(f"<tr><td>{esc(k)}</td><td>{esc(str(v).format(**F))}</td></tr>" for k, v in (nar.get("identity") or {}).items())
    legend = (f'<div class="legend-box"><div style="font:600 13px Inter;color:{INK};margin-bottom:6px">Σήματα τεκμηρίωσης</div>'
              f'<div><img src="{icon_uri("viewscope_empirical_book")}">Εμπειρικά τεκμηριωμένη εκτίμηση</div>'
              f'<div><img src="{icon_uri("viewscope_empirical_book")}">με «μεταφ.»: μεταφερόμενη εκτίμηση από συγγενή μέτρηση (π.χ. Eurostat)</div>'
              f'<div><img src="{icon_uri("viewscope_synthetic_pc")}">Συνθετική εκτίμηση σεναρίου (ρητές παραδοχές)</div></div>')
    add("Ταυτότητα έρευνας", "Η έρευνα με μια ματιά", T("identity_insight"),
        f'<div class="cols"><div class="col" style="flex:1.6"><table class="mtable">{ident}</table></div><div class="col">{legend}</div></div>',
        {"kind": "identity", "rows": [(k, str(v).format(**F)) for k, v in (nar.get("identity") or {}).items()]})

    # 3. βασικά ευρήματα
    k = f["k"]
    tiles = [("Γνωρίζουν την αλυσίδα αρκετά ή πολύ καλά", F["know"], "Q04"), ("Εμπιστεύονται πολύ / πάρα πολύ", F["trust"], "Q09"),
             ("Πιθανή επιλογή στην επόμενη αγορά", F["choose"], "Q24"), ("Net Promoter Score", F["nps"], "Q25")]
    th = "".join(f'<div class="kpi">{badge_html(cls[q])}<div class="v">{esc(v)}</div><div class="t">{esc(t)}</div></div>' for t, v, q in tiles)
    finds = "".join(f"<li>{x.format(**F)}</li>" for x in nar.get("key_findings", []))
    add("Βασικά ευρήματα", T("exec_title", "Βασικά ευρήματα"), T("exec_insight"), f'<div class="kpis">{th}</div><ul class="find">{finds}</ul>',
        {"kind": "exec", "tiles": [(t, v, cls[q]) for t, v, q in tiles], "bullets": [x.format(**F) for x in nar.get("key_findings", [])]})

    # 4. αγορά & κανάλια
    c1 = chart_block("Q01", "Αγορά ηλεκτρικής/ηλεκτρονικής συσκευής (24 μήνες)", hbar(opts("Q01", sort=False), w=520))
    c2 = chart_block("Q02", "Από πού αγόρασαν", hbar(opts("Q02", drop=("7",)), w=560, label_w=250), "αγοραστές · πολλαπλές απαντήσεις")
    add("Η αγορά", T("market_title", "Αγορά ηλεκτρικών ειδών και κανάλια"), T("market_insight"),
        f'<div class="cols"><div class="col">{c1}</div><div class="col">{c2}</div></div>',
        {"kind": "two", "charts": [("Q01", "Αγορά συσκευής (24 μήνες)", opts("Q01", sort=False)), ("Q02", "Από πού αγόρασαν (πολλαπλές)", opts("Q02", drop=("7",)))]})

    # 5. κριτήρια επιλογής
    c = chart_block("Q03", "Τα 3 σημαντικότερα κριτήρια επιλογής καταστήματος", hbar(opts("Q03", top=10), w=760, label_w=300), "έως 3 απαντήσεις")
    add("Κριτήρια επιλογής", T("criteria_title", "Τι κρίνει την επιλογή καταστήματος"), T("criteria_insight"), c,
        {"kind": "one", "charts": [("Q03", "Τα 3 σημαντικότερα κριτήρια επιλογής", opts("Q03", top=10))]})

    # 6. γνώση & πελατειακή βάση
    c1 = chart_block("Q04", "Εξοικείωση με την αλυσίδα", hbar(opts("Q04", sort=False), w=520))
    c2 = chart_block("Q06", "Κανάλι πιο πρόσφατης αγοράς", hbar(opts("Q06", sort=False), w=520), "πελάτες 24 μηνών")
    c3 = chart_block("Q07", "Κατηγορία πιο πρόσφατης αγοράς", hbar(opts("Q07", top=6), w=520), "πελάτες 24 μηνών")
    add("Γνώση & πελάτες", T("aware_title", "Αναγνωρισιμότητα και πελατειακή βάση"), T("aware_insight"),
        f'<div class="cols"><div class="col">{c1}<div style="height:16px"></div>{c2}</div><div class="col">{c3}</div></div>',
        {"kind": "two", "charts": [("Q04", "Εξοικείωση με την αλυσίδα", opts("Q04", sort=False)), ("Q07", "Κατηγορία πιο πρόσφατης αγοράς", opts("Q07", top=6))]})

    # 7. εικόνα, εμπιστοσύνη, δεσμεύσεις
    rows = [scale_row("Q08", "Συνολική εικόνα"), scale_row("Q09", "Εμπιστοσύνη ως κατάστημα"), scale_row("Q10", "Τηρεί τις δεσμεύσεις του"),
            scale_row("Q22", "Σε σύγκριση με τον ανταγωνισμό")]
    cats = ["Πολύ αρνητικά", "Μάλλον αρνητικά", "Ουδέτερα", "Μάλλον θετικά", "Πολύ θετικά"]
    body = (f'<div class="ctitle">Αξιολόγηση της αλυσίδας {badge_html(cls["Q08"])}</div><div class="cq">Όσοι γνωρίζουν την αλυσίδα · % επί όσων απάντησαν (ΔΓ = δεν γνωρίζω, εκτός βάσης)</div>'
            f'{stack5(rows, cats, w=1000, label_w=260)}<div class="base">Βάση: {base("Q08")} που γνωρίζουν την αλυσίδα</div>')
    add("Εικόνα & εμπιστοσύνη", T("image_title", "Εικόνα, εμπιστοσύνη και αξιοπιστία"), T("image_insight"), body,
        {"kind": "stack", "qid": "Q08", "rows": rows, "cats": cats})

    # 8. τι χτίζει εμπιστοσύνη
    c = chart_block("Q11", "Τι επηρεάζει περισσότερο την εμπιστοσύνη σε ένα κατάστημα", hbar(opts("Q11", top=10), w=760, label_w=300), "έως 3 απαντήσεις")
    add("Οδηγοί εμπιστοσύνης", T("drivers_title", "Τι χτίζει εμπιστοσύνη"), T("drivers_insight"), c,
        {"kind": "one", "charts": [("Q11", "Τι επηρεάζει την εμπιστοσύνη", opts("Q11", top=10))]})

    # 9. εμπειρία πελάτη
    c1 = chart_block("Q12", "Συνολική αξιολόγηση πιο πρόσφατης εμπειρίας", hbar(opts("Q12", sort=False), w=520), "πελάτες 24 μηνών")
    c2 = chart_block("Q14", "Παράδοση / παραλαβή στον χρόνο που δεσμεύτηκε", hbar(opts("Q14", sort=False), w=520, row=24, label_w=250), "πελάτες 24 μηνών")
    c3 = chart_block("Q16", "Είδος προβλήματος", hbar(opts("Q16", top=5), w=520, row=24, label_w=250), "όσοι είχαν πρόβλημα · πολλαπλές")
    add("Εμπειρία πελάτη", T("cx_title", "Εμπειρία αγοράς, παραδόσεις και προβλήματα"), T("cx_insight"),
        f'<div class="cols"><div class="col">{c1}</div><div class="col">{c2}<div style="height:10px"></div>{c3}</div></div>',
        {"kind": "two", "charts": [("Q12", "Αξιολόγηση πιο πρόσφατης εμπειρίας", opts("Q12", sort=False)), ("Q14", "Παράδοση στον χρόνο που δεσμεύτηκε", opts("Q14", sort=False))]})

    # 10. χειρισμός προβλημάτων
    c1 = chart_block("Q18", "Κατάσταση του προβλήματος", hbar(opts("Q18", sort=False), w=520))
    c2 = chart_block("Q20", "Μετά την εμπειρία, η εμπιστοσύνη", hbar(opts("Q20", sort=False), w=520))
    add("Μετά την πώληση", T("recovery_title", "Χειρισμός προβλημάτων"), T("recovery_insight"),
        f'<div class="cols"><div class="col">{c1}</div><div class="col">{c2}</div></div>',
        {"kind": "two", "charts": [("Q18", "Κατάσταση του προβλήματος", opts("Q18", sort=False)), ("Q20", "Μετά την εμπειρία, η εμπιστοσύνη", opts("Q20", sort=False))]})

    # 11. ανταγωνισμός & πρόθεση
    c1 = chart_block("Q23", "Εναλλακτικές για την επόμενη αγορά", hbar(opts("Q23", drop=("9",), top=8), w=520, highlight=(Q["Q23"]["options"][6]["label"], ACCENT), color=ACCENT3), "έως 3 απαντήσεις")
    g = D["Q24"]
    c2 = chart_block("Q24", "Πιθανότητα επιλογής της αλυσίδας στην επόμενη αγορά", hbar(opts("Q24", sort=False), w=520))
    add("Ανταγωνισμός", T("comp_title", "Ανταγωνιστική θέση και πρόθεση επιλογής"), T("comp_insight"),
        f'<div class="cols"><div class="col">{c1}</div><div class="col">{c2}</div></div>',
        {"kind": "two", "charts": [("Q23", "Εναλλακτικές για την επόμενη αγορά", opts("Q23", drop=("9",), top=8)), ("Q24", "Πιθανότητα επιλογής", opts("Q24", sort=False))]})

    # 12. σύσταση
    q25 = D["Q25"]
    vals = {r.option: r.pct for r in q25.itertuples()}
    tot = sum(v for c, v in vals.items() if c != "12")
    det = sum(vals[str(i)] for i in range(1, 8)) / tot * 100
    pas = sum(vals[str(i)] for i in (8, 9)) / tot * 100
    pro = sum(vals[str(i)] for i in (10, 11)) / tot * 100
    c1 = (f'<div class="ctitle">Πιθανότητα σύστασης σε φίλο ή συγγενή (0–10) {badge_html(cls["Q25"])}</div><div class="cq">{esc(Q["Q25"]["text"])}</div>'
          f'<div style="display:flex;align-items:center;gap:26px"><div><div style="font:600 64px \'Inter Display\';color:{ACCENT}">{F["nps"]}</div>'
          f'<div style="font:500 12px Inter;color:{SLATE}">Net Promoter Score</div></div>{nps_bar(det, pas, pro, k["NPS (Q25)"], w=600)}</div>'
          f'<div class="base">Βάση: {base("Q25")} που γνωρίζουν την αλυσίδα (εκτός «δεν γνωρίζω»)</div>')
    c2 = chart_block("Q26", "Ενθάρρυνση ή αποτροπή άλλων (12 μήνες)", hbar(opts("Q26", sort=False), w=520))
    add("Σύσταση", T("nps_title", "Σύσταση και διάδοση"), T("nps_insight"), f'{c1}<div style="height:18px"></div><div style="width:620px">{c2}</div>',
        {"kind": "nps", "nps": F["nps"], "parts": [("Επικριτές 0–6", det), ("Ουδέτεροι 7–8", pas), ("Υποστηρικτές 9–10", pro)], "charts": [("Q26", "Ενθάρρυνση ή αποτροπή άλλων", opts("Q26", sort=False))]})

    # 13. κοινωνική προσφορά
    rows = [scale_row("Q28", "Οι κοινωνικές δράσεις επηρεάζουν την εικόνα μου για μια εταιρεία"),
            scale_row("Q29", "Η κοινωνική προσφορά αντισταθμίζει κακή εξυπηρέτηση")]
    cats = ["Καθόλου", "Λίγο", "Μέτρια", "Πολύ", "Πάρα πολύ"]
    c2 = chart_block("Q27", "Γνώριζαν κοινωνική δράση της αλυσίδας", hbar(opts("Q27", sort=False), w=480))
    body = (f'<div class="ctitle">Κοινωνική προσφορά και εξυπηρέτηση {badge_html(cls["Q28"])}</div><div class="cq">Όλοι οι ερωτώμενοι</div>'
            f'{stack5(rows, cats, w=1000, label_w=330)}<div class="base">Βάση: {base("Q28")}</div><div style="height:14px"></div><div style="width:560px">{c2}</div>')
    add("Κοινωνική προσφορά", T("csr_title", "Κοινωνική προσφορά έναντι εμπειρίας πελάτη"), T("csr_insight"), body,
        {"kind": "stack", "qid": "Q28", "rows": rows, "cats": cats})

    # 14. ανάκτηση εμπιστοσύνης
    c1 = chart_block("Q30", "Ενέργειες που θα αύξαναν την εμπιστοσύνη", hbar(opts("Q30", drop=("10", "11"), top=9), w=560, label_w=270), "έως 3 απαντήσεις")
    c2 = chart_block("Q33", "Σημαντικότερο μετά από αρνητική εμπειρία", hbar(opts("Q33", top=7), w=520, label_w=250))
    add("Ανάκτηση εμπιστοσύνης", T("recover_title", "Τι θα επανέφερε την εμπιστοσύνη"), T("recover_insight"),
        f'<div class="cols"><div class="col">{c1}</div><div class="col">{c2}</div></div>',
        {"kind": "two", "charts": [("Q30", "Ενέργειες που θα αύξαναν την εμπιστοσύνη", opts("Q30", drop=("10", "11"), top=9)), ("Q33", "Σημαντικότερο μετά από αρνητική εμπειρία", opts("Q33", top=7))]})

    # 15. προτεραιότητες
    c1 = chart_block("Q34", "Η πρώτη προτεραιότητα βελτίωσης", hbar(opts("Q34", top=8), w=560, label_w=270))
    c2 = chart_block("Q32", "Εύλογος χρόνος πρώτης ουσιαστικής απάντησης", hbar(opts("Q32", sort=False), w=520, label_w=250))
    add("Προτεραιότητες", T("prio_title", "Προτεραιότητες βελτίωσης"), T("prio_insight"),
        f'<div class="cols"><div class="col">{c1}</div><div class="col">{c2}</div></div>',
        {"kind": "two", "charts": [("Q34", "Πρώτη προτεραιότητα βελτίωσης", opts("Q34", top=8)), ("Q32", "Εύλογος χρόνος πρώτης απάντησης", opts("Q32", sort=False))]})

    # 16. ομάδες
    cols = [("trust", "Εμπιστοσύνη 4–5", "pct"), ("image", "Θετική εικόνα", "pct"), ("choose", "Πιθανή επιλογή", "pct"), ("consider", "Στις εναλλακτικές", "pct"), ("nps", "NPS", "nps")]
    allrows = f["by_age"] + f["by_sex"] + f["by_reg"] + f["by_cust"]
    body = (f'<div class="ctitle">Βασικοί δείκτες ανά ομάδα {badge_html("S")}</div><div class="cq">Όσοι γνωρίζουν την αλυσίδα · η απόχρωση δείχνει τη σχετική θέση κάθε ομάδας ανά στήλη</div>'
            f'{grid_table([dict(r) for r in allrows], cols)}')
    add("Ανάλυση ομάδων", T("groups_title", "Διαφορές ανά δημογραφική ομάδα και σχέση με την αλυσίδα"), T("groups_insight"), body,
        {"kind": "table", "cols": cols, "rows": allrows})

    # 17. σχέσεις
    exp = [(r["group"], (r["trust"] or 0) * 100) for r in f["exp_rel"]]
    fam = [(r["group"], (r["trust"] or 0) * 100) for r in f["by_fam"]]
    c1 = (f'<div class="ctitle">Εμπιστοσύνη ανάλογα με την εμπειρία αγοράς {badge_html("S")}</div><div class="cq">Πελάτες 24 μηνών · % «πολύ/πάρα πολύ»</div>'
          f'{hbar(exp, w=540, label_w=240, color=ACCENT)}<div class="base">Βάσεις: {", ".join(str(r["n"]) for r in f["exp_rel"])} · NPS {F["nps_exp_pos"]} έναντι {F["nps_exp_neg"]}</div>')
    c2 = (f'<div class="ctitle">Εμπιστοσύνη ανάλογα με την εξοικείωση {badge_html("S")}</div><div class="cq">Όσοι γνωρίζουν την αλυσίδα · % «πολύ/πάρα πολύ»</div>'
          f'{hbar(fam, w=540, label_w=240, color=ACCENT2)}<div class="base">Βάσεις: {", ".join(str(r["n"]) for r in f["by_fam"])}</div>')
    add("Σχέσεις", T("rel_title", "Εμπειρία → εμπιστοσύνη → σύσταση"), T("rel_insight"),
        f'<div class="cols"><div class="col">{c1}</div><div class="col">{c2}</div></div>',
        {"kind": "two", "charts": [(None, "Εμπιστοσύνη ανάλογα με την εμπειρία (πελάτες)", exp), (None, "Εμπιστοσύνη ανάλογα με την εξοικείωση", fam)]})

    # 18. συμπεράσματα & προτάσεις
    recs = "".join(f'<div class="rec"><div class="n">{i + 1}</div><div class="b"><b>{esc(r["title"])}</b> — {esc(r["text"].format(**F))}</div></div>'
                   for i, r in enumerate(nar.get("recommendations", [])))
    add("Συμπεράσματα", T("concl_title", "Συμπεράσματα και προτάσεις"), T("concl_insight"), recs,
        {"kind": "recs", "recs": [(r["title"], r["text"].format(**F)) for r in nar.get("recommendations", [])]})

    # 19. μεθοδολογία
    mrows = "".join(f"<tr><td>{esc(k)}</td><td>{esc(str(v).format(**F))}</td></tr>" for k, v in (nar.get("method") or {}).items())
    add("Μεθοδολογία", "Σύντομη μεθοδολογία", T("method_insight"),
        f'<div class="cols"><div class="col" style="flex:1.7"><table class="mtable">{mrows}</table></div><div class="col">{legend}</div></div>',
        {"kind": "identity", "rows": [(k, str(v).format(**F)) for k, v in (nar.get("method") or {}).items()]})

    doc = f'<!doctype html><html lang="el"><head><meta charset="utf-8"><title>{esc(short)}</title><style>{CSS}</style></head><body>{"".join(slides)}</body></html>'
    return doc, model


# ------------------------------------------------------------------------------------------------ PowerPoint (επεξεργάσιμο)
def build_pptx(model: list[dict], out: Path, short: str):
    from pptx import Presentation
    from pptx.chart.data import CategoryChartData
    from pptx.dml.color import RGBColor
    from pptx.enum.chart import XL_CHART_TYPE, XL_LABEL_POSITION, XL_LEGEND_POSITION
    from pptx.enum.text import PP_ALIGN
    from pptx.util import Emu, Inches, Pt

    rgb = lambda h: RGBColor.from_string(h.lstrip("#"))  # noqa: E731
    prs = Presentation()
    prs.slide_width, prs.slide_height = Inches(13.333), Inches(7.5)
    blank = prs.slide_layouts[6]
    book = str(ICONS / "viewscope_empirical_book_96.png")
    pc = str(ICONS / "viewscope_synthetic_pc_96.png")

    def text(s, x, y, w, h, t, size=12, bold=False, color=INK, align=None, font="Inter"):
        tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
        tf = tb.text_frame
        tf.word_wrap = True
        p = tf.paragraphs[0]
        r = p.add_run()
        r.text = t
        r.font.size, r.font.bold, r.font.name = Pt(size), bold, font
        r.font.color.rgb = rgb(color)
        if align:
            p.alignment = align
        return tb

    def badge(s, cls_, x, y):
        s.shapes.add_picture(pc if cls_ == "S" else book, Inches(x), Inches(y), Inches(0.17), Inches(0.17))
        if cls_ == "T":
            text(s, x + 0.17, y - 0.03, 0.6, 0.2, "μεταφ.", 7.5, color=MUTED)

    def foot(s, n):
        ln = s.shapes.add_connector(1, Inches(0.67), Inches(7.05), Inches(12.67), Inches(7.05))
        ln.line.color.rgb = rgb(LINE)
        text(s, 0.62, 7.08, 5, 0.3, f"viewscope  ·  {short}", 8, color=MUTED)
        s.shapes.add_picture(book, Inches(5.2), Inches(7.13), Inches(0.12), Inches(0.12))
        text(s, 5.33, 7.08, 1.6, 0.3, "Εμπειρικά τεκμηριωμένη", 7.5, color=MUTED)
        s.shapes.add_picture(pc, Inches(6.85), Inches(7.13), Inches(0.12), Inches(0.12))
        text(s, 6.98, 7.08, 1.9, 0.3, "Συνθετική εκτίμηση σεναρίου", 7.5, color=MUTED)
        text(s, 8.6, 7.08, 4.1, 0.3, f"{LABEL} · {n}", 7.5, color=MUTED, align=PP_ALIGN.RIGHT)

    def bar_chart(s, items, x, y, w, h, color=ACCENT, title=None, cls_=None):
        if title:
            text(s, x, y - 0.42, w - 0.3, 0.35, title, 12, True)
            if cls_:
                badge(s, cls_, x + min(w - 0.3, 0.095 * len(title) + 0.25), y - 0.36)
        cd = CategoryChartData()
        items = list(items)
        cd.categories = [lab[:46] for lab, _ in items]
        cd.add_series("%", [round(v, 1) for _, v in items])
        gf = s.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Inches(x), Inches(y), Inches(w), Inches(h), cd)
        ch = gf.chart
        ch.has_title = False
        ch.has_legend = False
        ch.plots[0].gap_width = 45
        ser = ch.plots[0].series[0]
        ser.format.fill.solid()
        ser.format.fill.fore_color.rgb = rgb(color)
        ch.plots[0].has_data_labels = True
        dl = ch.plots[0].data_labels
        dl.number_format, dl.number_format_is_linked = '0"%"', False
        dl.font.size = Pt(10)
        dl.position = XL_LABEL_POSITION.OUTSIDE_END
        ch.category_axis.tick_labels.font.size = Pt(10)
        ch.category_axis.reverse_order = True
        ch.category_axis.format.line.color.rgb = rgb(LINE)
        ch.value_axis.visible = False
        ch.value_axis.has_major_gridlines = False
        ch.value_axis.maximum_scale = max([v for _, v in items] + [1]) * 1.18
        return ch

    def stack_chart(s, rows, cats, x, y, w, h):
        cd = CategoryChartData()
        cd.categories = [r[0] for r in rows]
        for k, c in enumerate(cats):
            cd.add_series(c, [round(r[1][k], 1) for r in rows])
        gf = s.shapes.add_chart(XL_CHART_TYPE.BAR_STACKED_100, Inches(x), Inches(y), Inches(w), Inches(h), cd)
        ch = gf.chart
        ch.has_title = False
        ch.has_legend = True
        ch.legend.position = XL_LEGEND_POSITION.BOTTOM
        ch.legend.include_in_layout = False
        ch.legend.font.size = Pt(9)
        ch.plots[0].gap_width = 40
        ch.plots[0].overlap = 100
        for k, ser in enumerate(ch.plots[0].series):
            ser.format.fill.solid()
            ser.format.fill.fore_color.rgb = rgb(DIV5[k])
        ch.plots[0].has_data_labels = True
        ch.plots[0].data_labels.number_format, ch.plots[0].data_labels.number_format_is_linked = "0", False
        ch.plots[0].data_labels.font.size = Pt(9)
        ch.category_axis.tick_labels.font.size = Pt(10)
        ch.category_axis.reverse_order = True
        ch.value_axis.visible = False
        ch.value_axis.has_major_gridlines = False

    n = 0
    for m in model:
        s = prs.slides.add_slide(blank)
        n += 1
        if m.get("cover"):
            bg = s.background.fill
            bg.solid()
            bg.fore_color.rgb = rgb(INK)
            text(s, 0.92, 1.4, 6, 0.5, "viewscope", 20, True, "#FFFFFF", font="Inter Display")
            text(s, 0.92, 2.2, 11, 2.0, m["title"], 38, True, "#FFFFFF", font="Inter Display")
            text(s, 0.92, 4.3, 10, 1.2, m["sub"], 16, False, "#C9D0DD")
            text(s, 0.92, 6.6, 11, 0.4, f'{m["meta"]}  ·  {LABEL}', 10, False, "#9AA4B8")
            continue
        text(s, 0.67, 0.42, 8, 0.3, m["kicker"].upper(), 9, True, MUTED)
        text(s, 0.67, 0.66, 12, 0.6, m["title"], 22 if len(m["title"]) < 62 else 19, True, font="Inter Display")
        text(s, 0.67, 1.3, 12, 0.7, m["insight"], 12, False, SLATE)
        kind = m["kind"]
        if kind == "identity" and m["rows"]:
            tb = s.shapes.add_table(len(m["rows"]), 2, Inches(0.67), Inches(2.1), Inches(8.2), Inches(0.35 * len(m["rows"]))).table
            tb.columns[0].width, tb.columns[1].width = Inches(2.3), Inches(5.9)
            for i, (a, b) in enumerate(m["rows"]):
                for j, v in enumerate((a, b)):
                    c = tb.cell(i, j)
                    c.text = v
                    c.fill.background()
                    for p in c.text_frame.paragraphs:
                        for r in p.runs:
                            r.font.size, r.font.bold = Pt(10.5), j == 0
                            r.font.color.rgb = rgb(INK if j == 0 else SLATE)
            text(s, 9.3, 2.1, 3.4, 0.3, "Σήματα τεκμηρίωσης", 11, True)
            for i, (img, lab) in enumerate([(book, "Εμπειρικά τεκμηριωμένη εκτίμηση"), (book, "με «μεταφ.»: μεταφερόμενη εκτίμηση"), (pc, "Συνθετική εκτίμηση σεναρίου")]):
                s.shapes.add_picture(img, Inches(9.3), Inches(2.5 + i * 0.36), Inches(0.2), Inches(0.2))
                text(s, 9.55, 2.45 + i * 0.36, 3.3, 0.3, lab, 10, color=SLATE)
        elif kind == "exec":
            for i, (t, v, c) in enumerate(m["tiles"]):
                x = 0.67 + i * 3.02
                box = s.shapes.add_shape(1, Inches(x), Inches(2.05), Inches(2.85), Inches(1.25))
                box.fill.solid()
                box.fill.fore_color.rgb = rgb(PANEL)
                box.line.fill.background()
                text(s, x + 0.15, 2.12, 2.5, 0.6, v, 28, True, ACCENT, font="Inter Display")
                text(s, x + 0.15, 2.75, 2.5, 0.5, t, 10, False, SLATE)
                badge(s, c, x + 2.55, 2.15)
            tb = s.shapes.add_textbox(Inches(0.67), Inches(3.5), Inches(12), Inches(3.4)).text_frame
            tb.word_wrap = True
            for i, b in enumerate(m["bullets"]):
                p = tb.paragraphs[0] if i == 0 else tb.add_paragraph()
                r = p.add_run()
                r.text = "•  " + html.unescape(b.replace("<b>", "").replace("</b>", ""))
                r.font.size = Pt(12.5)
                r.font.color.rgb = rgb(INK)
                p.space_after = Pt(6)
        elif kind in ("two", "one"):
            charts = m["charts"]
            w = 12.0 if kind == "one" else 5.85
            for i, (qid, title, items) in enumerate(charts):
                cls_ = m.get("cls", {}).get(qid) if qid else "S"
                bar_chart(s, items, 0.67 + i * 6.15, 2.45, w, min(4.4, 0.42 * len(items) + 0.5), title=title, cls_=CLASSES.get(qid, "S") if qid else "S")
        elif kind == "stack":
            badge(s, CLASSES.get(m["qid"], "S"), 12.4, 1.95)
            stack_chart(s, m["rows"], m["cats"], 0.67, 2.1, 12, min(4.6, 0.8 * len(m["rows"]) + 1.2))
        elif kind == "nps":
            text(s, 0.67, 2.1, 3, 0.9, m["nps"], 48, True, ACCENT, font="Inter Display")
            text(s, 0.67, 3.0, 3, 0.3, "Net Promoter Score", 10, False, SLATE)
            badge(s, CLASSES.get("Q25", "S"), 2.4, 2.25)
            cd = CategoryChartData()
            cd.categories = ["Σύσταση"]
            for lab, v in m["parts"]:
                cd.add_series(lab, [round(v, 1)])
            gf = s.shapes.add_chart(XL_CHART_TYPE.BAR_STACKED_100, Inches(3.3), Inches(2.05), Inches(9.3), Inches(1.4), cd)
            ch = gf.chart
            ch.has_title = False
            for k, ser in enumerate(ch.plots[0].series):
                ser.format.fill.solid()
                ser.format.fill.fore_color.rgb = rgb([DIV5[0], DIV5[2], DIV5[4]][k])
            ch.plots[0].has_data_labels = True
            ch.plots[0].data_labels.number_format, ch.plots[0].data_labels.number_format_is_linked = '0"%"', False
            ch.has_legend = True
            ch.legend.position = XL_LEGEND_POSITION.BOTTOM
            ch.legend.font.size = Pt(9)
            ch.value_axis.visible = False
            ch.category_axis.visible = False
            ch.value_axis.has_major_gridlines = False
            qid, title, items = m["charts"][0]
            bar_chart(s, items, 0.67, 4.25, 6.2, 2.4, title=title, cls_=CLASSES.get(qid, "S"))
        elif kind == "table":
            rows, cols = m["rows"], m["cols"]
            tb = s.shapes.add_table(len(rows) + 1, len(cols) + 2, Inches(0.67), Inches(2.1), Inches(12), Inches(0.36 * (len(rows) + 1))).table
            hdr = ["Ομάδα"] + [c[1] for c in cols] + ["n"]
            for j, h in enumerate(hdr):
                tb.cell(0, j).text = h
            for i, r in enumerate(rows, start=1):
                vals = [r["group"]] + [("—" if r[c[0]] is None else (f"{r[c[0]]:+.0f}" if c[2] == "nps" else f"{r[c[0]] * 100:.0f}%")) for c in cols] + [str(r["n"])]
                for j, v in enumerate(vals):
                    tb.cell(i, j).text = v
            for i in range(len(rows) + 1):
                for j in range(len(hdr)):
                    for p in tb.cell(i, j).text_frame.paragraphs:
                        for rr in p.runs:
                            rr.font.size = Pt(10)
            badge(s, "S", 12.4, 1.95)
        elif kind == "recs":
            y = 2.1
            for i, (t, b) in enumerate(m["recs"]):
                text(s, 0.67, y, 0.5, 0.4, str(i + 1), 20, True, ACCENT, font="Inter Display")
                tb = s.shapes.add_textbox(Inches(1.2), Inches(y), Inches(11.4), Inches(0.8)).text_frame
                tb.word_wrap = True
                p = tb.paragraphs[0]
                r1 = p.add_run()
                r1.text = t + " — "
                r1.font.bold, r1.font.size = True, Pt(12)
                r1.font.color.rgb = rgb(INK)
                r2 = p.add_run()
                r2.text = b
                r2.font.size = Pt(12)
                r2.font.color.rgb = rgb(SLATE)
                y += 0.82
        foot(s, n)
    prs.save(str(out))


CLASSES: dict = {}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--study", required=True)
    ap.add_argument("--no-pdf", action="store_true")
    a = ap.parse_args()
    study = Path(a.study).resolve()
    spec, run, dist, cls, nar = load(study)
    CLASSES.update(cls)
    ec = pd.read_csv(study / "internal_package" / "qc" / "evidence_classes.csv").set_index("question")
    for q in spec["questions"]:
        srcs = [spec["metrics"][x]["label"] for x in str(ec.loc[q["id"], "direct_sources"] if isinstance(ec.loc[q["id"], "direct_sources"], str) else "").split(", ") if x in spec["metrics"]]
        if cls[q["id"]] == "E":
            TIPS[q["id"]] = "Πηγή: βαθμονομημένος πληθυσμός (ΕΛΣΤΑΤ/Eurostat 2025)"
        elif cls[q["id"]] == "T" and srcs:
            TIPS[q["id"]] = "Πηγές: " + "; ".join(srcs) + " — προσαρμογή ανά ηλικία, φύλο και μόρφωση"
        elif srcs:
            TIPS[q["id"]] = "οι δείκτες Eurostat χρησιμοποιήθηκαν μόνο ως έλεγχος συμβατότητας"
    df = respondents(run)
    f = facts(run, df)
    F = fmt_facts(f)
    out = study / "client_deliverables"
    out.mkdir(parents=True, exist_ok=True)
    (study / "internal_package" / "report_facts.json").write_text(json.dumps({"facts": f, "formatted": F}, ensure_ascii=False, indent=1, default=float), encoding="utf-8")
    doc, model = build_html(spec, run, dist, cls, nar, f, F)
    base = nar.get("file_base", "viewscope_report")
    hp = out / f"{base}.html"
    hp.write_text(doc, encoding="utf-8")
    if not a.no_pdf:
        subprocess.run(["node", str(Path(__file__).with_name("render_slides_pdf.cjs")), str(hp), str(out / f"{base}.pdf")], check=True, cwd=str(ROOT))
    build_pptx(model, out / f"{base}.pptx", nar.get("short_title", ""))
    print(out / f"{base}.pdf", out / f"{base}.pptx")


if __name__ == "__main__":
    main()
