"""Βιβλίο Excel με τα αποτελέσματα της συνθετικής μελέτης Κωτσόβολος (από analysis.json + CSV της ανάλυσης).

ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ.
    python3 -I studies/kotsovolos_signalyth_2026_500/analysis/k500_excel.py --analysis DIR --out FILE.xlsx [--narrative FILE] [--gate FILE]
"""
import argparse
import json
from pathlib import Path

import pandas as pd

SYNTH = "ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ"
VARN = {"Q08_s": "Εικόνα", "Q09_s": "Εμπιστοσύνη", "Q10_s": "Δεσμεύσεις", "Q12_s": "Εμπειρία", "Q13_s": "Ενημέρωση", "Q22_s": "Έναντι ανταγωνιστών",
        "Q24_s": "Πρόθεση", "NPS": "Σύσταση 0–10", "Q28_s": "Επίδραση CSR", "Q29_s": "CSR αποκαθιστά", "Q31_s": "Δεύτερη ευκαιρία", "Q20_s": "Μεταβολή εμπιστοσύνης",
        "on_time": "Παράδοση στον χρόνο"}


def flat_metric(rows):
    out = []
    for r in rows:
        d = {"Διάσπαση": r.get("break"), "Ομάδα": r.get("group"), "n": r.get("n")}
        for k, v in r.items():
            if k in ("break", "group", "n", "small_base"):
                continue
            base, _, kind = k.rpartition("_")
            if k.startswith("NPS_score"):
                d["Σύσταση: καθαρός δείκτης"] = v
                continue
            nm = VARN.get(base, base)
            d[f"{nm} ({ {'mean': 'μ.ο.', 'top2': '% 4–5', 'n': 'n'}.get(kind, kind)})"] = v
        d["Μικρή βάση (<15)"] = r.get("small_base")
        out.append(d)
    return pd.DataFrame(out)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--analysis", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--narrative")
    ap.add_argument("--gate")
    a = ap.parse_args()
    d = Path(a.analysis)
    A = json.loads((d / "analysis.json").read_text(encoding="utf-8"))
    N = json.loads(Path(a.narrative).read_text(encoding="utf-8")) if a.narrative else {}
    G = json.loads(Path(a.gate).read_text(encoding="utf-8")) if a.gate else None
    out = Path(a.out)
    out.parent.mkdir(parents=True, exist_ok=True)
    with pd.ExcelWriter(out, engine="xlsxwriter") as xw:
        wb = xw.book
        bold = wb.add_format({"bold": True, "font_size": 13, "font_color": "#12263a"})
        red = wb.add_format({"bold": True, "font_color": "#ffffff", "bg_color": "#12263a"})
        wrap = wb.add_format({"text_wrap": True, "valign": "top"})
        readme = wb.add_worksheet("README")
        readme.set_column(0, 0, 120)
        lines = [(SYNTH, red), ("Κωτσόβολος — συνθετική μελέτη 500 ολοκληρωμένων συνεντεύξεων (ASE + Synthetic Research Lab)", bold),
                 (f"Run: {A['run_id']} · ολοκληρωμένες: {A['n_completes']}", None),
                 ("Τα δεδομένα προέρχονται από συνθετικά πρόσωπα που απάντησαν μέσω μοντέλου AI· δεν είναι μετρήσεις πραγματικού πληθυσμού και δεν έχουν περιθώριο σφάλματος δειγματοληψίας.", wrap),
                 ("Φύλλα: Topline (όλες οι ερωτήσεις) · Crosstabs (όλες οι ερωτήσεις × σχέση/ηλικία/φύλο/περιοχή/εκπαίδευση/εισόδημα) · Brand_by (δείκτες μάρκας ανά ομάδα) · "
                  "Cust_vs_non · CX (εμπειρία πελατών) · Drivers (αποσύνθεση Shapley) · Correlations · Segments · Tests (χ²) · Hypotheses · Recommendations · QC · Respondents (ατομικά, χωρίς προσωπικά στοιχεία).", wrap),
                 ("Ποσοστά: επί όσων ερωτήθηκαν (βάση = όσοι πληρούσαν τη συνθήκη). Πολλαπλές απαντήσεις: % ερωτωμένων ανά επιλογή (άθροισμα > 100%). Κλίμακες 1–5: «δεν ξέρω» εκτός μέσων όρων.", wrap)]
        for i, (t, f) in enumerate(lines):
            readme.write(i, 0, t, f)
        def put(df, name):
            df = df.copy()
            df.insert(0, "data_status", SYNTH)
            df.to_excel(xw, sheet_name=name, index=False)
            ws = xw.sheets[name]
            ws.freeze_panes(1, 0)
            for j, c in enumerate(df.columns):
                q = df[c].astype(str).str.len().quantile(.9) if len(df) else 10
                ws.set_column(j, j, min(60, max(10, int(q if q == q else 10) + 2)))
        put(pd.read_csv(d / "topline.csv").drop(columns=["data_status"]), "Topline")
        put(pd.read_csv(d / "crosstabs.csv").drop(columns=["data_status"]), "Crosstabs")
        put(pd.concat([flat_metric(v) for v in A["brand_by"].values()], ignore_index=True), "Brand_by")
        put(flat_metric(A["cust_vs_non"]), "Cust_vs_non")
        cx = A["cx"]
        put(pd.concat([flat_metric(cx["by_exp_group"]), flat_metric(cx["by_channel"]), flat_metric(cx["trust_by_delivery"])], ignore_index=True), "CX")
        dr = []
        for k, v in A["drivers"].items():
            for p in v["predictors"]:
                dr.append({"Μοντέλο": k, "R²": v["r2"], "n": v["n"], "Παράγοντας": VARN.get(p["var"], p["var"]), "Shapley R²": p["shapley_r2"], "% του R²": p["share_pct"], "Τυποπ. β": p["std_beta"]})
        put(pd.DataFrame(dr), "Drivers")
        put(pd.DataFrame([{"Ζεύγος": " ~ ".join(VARN.get(x, x) for x in k.split("~")), "Spearman ρ": v["rho"], "n": v["n"], "p": v["p"]} for k, v in A["correlations"].items()]), "Correlations")
        sg = A["segmentation"]
        names = N.get("segment_names", {})
        put(pd.DataFrame([{"Τμήμα": names.get(p["cluster"], {}).get("name", p["cluster"]), **{k: (json.dumps(v, ensure_ascii=False) if isinstance(v, dict) else v) for k, v in p.items()}}
                           for p in sg["profiles"]]), "Segments")
        put(pd.DataFrame([{"Ερώτηση": k.split("|")[0], "Διάσπαση": k.split("|")[1], **v} for k, v in A["tests"].items() if v]), "Tests")
        if N.get("hypotheses"):
            put(pd.DataFrame([{"#": h["id"], "Υπόθεση": h["statement"], "Ερωτήσεις": h["questions"], "Τεκμήριο": _strip(h["evidence"]), "Αξιολόγηση": h["verdict"]} for h in N["hypotheses"]]), "Hypotheses")
        if N.get("recommendations"):
            put(pd.DataFrame([{"Προτεραιότητα": x.get("priority"), "Σύσταση": x["title"], "Αιτιολόγηση": _strip(x["why"]), "Δείκτης": _strip(x.get("kpi", ""))} for x in N["recommendations"]]), "Recommendations")
        if G:
            put(pd.DataFrame(G["checks"]), "QC")
        put(pd.read_csv(d / "respondents_wide.csv").drop(columns=["data_status"]), "Respondents")
    print(out)


def _strip(h):
    import re
    return re.sub(r"<[^>]+>", "", str(h))


if __name__ == "__main__":
    main()
