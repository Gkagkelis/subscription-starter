"""Έλεγχοι ποιότητας και ανάλυση μιας εκτέλεσης του γρήγορου μηχανισμού (structured engine).

ΑΝΕΞΑΡΤΗΤΟΣ έλεγχος: το skip logic και οι κανόνες C/S ξαναϋπολογίζονται με τον αξιολογητή του ASE (ase.questionnaire.model.
evaluate_condition), όχι με τον κώδικα που παρήγαγε τα δεδομένα.

    python3 -I scripts/synthetic-lab/structured/analyze.py --spec spec.json --runs <dir με main.json + παραλλαγές> --out <dir>
                [--ase-checkpoint <checkpoint.jsonl>]
"""
from __future__ import annotations

import argparse
import json
import math
import sys
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "research-engine"))
from ase.questionnaire.model import evaluate_condition  # noqa: E402

SOFT_MAX = 0.10          # μέγιστο ποσοστό ανά κανόνα συνοχής (ίδιο κατώφλι με την πύλη σταδίου 2 του ASE)
UNIFORM_MAX = 0.95       # καμία ερώτηση > 95% σε μία επιλογή
DEMO_MAX_PP = 5.0        # μέγιστη απόκλιση δημογραφικών από τον πληθυσμό (π.μ.)
SMALL_BASE = 30


def load_run(p: Path) -> dict:
    return json.loads(p.read_text(encoding="utf-8"))


def answers_df(run: dict, spec: dict) -> pd.DataFrame:
    rows = []
    for r in run["respondents"]:
        d = {"respondent_id": r["respondent_id"], "persona_id": r["persona_id"], **{f"cov_{k}": v for k, v in r["covariates"].items()}}
        for q in spec["questions"]:
            a = r["answers"][q["id"]]
            d[q["id"]] = ";".join(a) if isinstance(a, list) else a
            d[f"{q['id']}__class"] = r["classes"][q["id"]]
        d["flags"] = "|".join(r["flags"])
        rows.append(d)
    return pd.DataFrame(rows)


def dist(run: dict, q: dict) -> tuple[int, dict]:
    c, n = Counter(), 0
    for r in run["respondents"]:
        a = r["answers"][q["id"]]
        if a is None:
            continue
        n += 1
        for v in (a if isinstance(a, list) else [a]):
            c[v] += 1
    return n, {o["code"]: (c[o["code"]] / n if n else 0.0) for o in q["options"]}


def tvd(a: dict, b: dict, multi: bool) -> float:
    keys = set(a) | set(b)
    d = sum(abs(a.get(k, 0) - b.get(k, 0)) for k in keys)
    return d / (len(keys) if multi else 2) if multi else d / 2


def wilson(p: float, n: int, z: float = 1.96) -> tuple[float, float]:
    if n == 0:
        return (0.0, 0.0)
    den = 1 + z * z / n
    c = (p + z * z / (2 * n)) / den
    h = z * math.sqrt(p * (1 - p) / n + z * z / (4 * n * n)) / den
    return (max(0.0, c - h), min(1.0, c + h))


# ------------------------------------------------------------------ δείκτες-κλειδιά (για αναφορά, ευαισθησία, σταθερότητα)
def kpis(run: dict) -> dict:
    R = run["respondents"]
    A = [r["answers"] for r in R]
    def share(q, codes, base=None, excl=None):
        xs = [a[q] for a in A if a[q] is not None and (base is None or base(a)) and (excl is None or a[q] not in excl)]
        if not xs:
            return None
        hit = sum(1 for x in xs if (any(c in x for c in codes) if isinstance(x, list) else x in codes))
        return hit / len(xs)
    nps_x = [int(a["Q25"]) - 1 for a in A if a["Q25"] not in (None, "12")]
    nps = (sum(x >= 9 for x in nps_x) - sum(x <= 6 for x in nps_x)) / len(nps_x) * 100 if nps_x else None
    cust = lambda a: a["Q05"] == "1"  # noqa: E731
    return {
        "Αγορά συσκευής 24μ (Q01)": share("Q01", ["1"]),
        "Online κανάλι στους αγοραστές (Q02)": share("Q02", ["2", "4"]),
        "Γνωρίζουν αρκετά/πολύ καλά (Q04)": share("Q04", ["3", "4"]),
        "Πελάτες 24μ — όλοι (Q05)": sum(1 for a in A if a["Q05"] == "1") / len(A),
        "Θετική εικόνα (Q08 4–5)": share("Q08", ["4", "5"], excl=["6"]),
        "Εμπιστοσύνη πολύ/πάρα πολύ (Q09)": share("Q09", ["4", "5"], excl=["6"]),
        "Τηρεί δεσμεύσεις (Q10 4–5)": share("Q10", ["4", "5"], excl=["6"]),
        "Θετική εμπειρία πελατών (Q12 4–5)": share("Q12", ["4", "5"], excl=["6"]),
        "Σημαντική καθυστέρηση (Q14=3)": share("Q14", ["3"], base=cust),
        "Πρόβλημα στην αγορά (Q15)": share("Q15", ["1"], base=cust),
        "Πλήρης επίλυση (Q18)": share("Q18", ["1"]),
        "Εξετάζουν την αλυσίδα (Q23)": share("Q23", ["7"]),
        "Πιθανή επιλογή (Q24 4–5)": share("Q24", ["4", "5"], excl=["6"]),
        "NPS (Q25)": nps,
        "Ενθάρρυνε άλλους (Q26)": share("Q26", ["1", "3"]),
        "CSR επηρεάζει (Q28 4–5)": share("Q28", ["4", "5"], excl=["6"]),
        "CSR αντισταθμίζει κακή εξυπηρέτηση (Q29 4–5)": share("Q29", ["4", "5"], excl=["6"]),
        "Δεύτερη ευκαιρία μετά από δίκαιη επίλυση (Q31 4–5)": share("Q31", ["4", "5"], excl=["6"]),
    }


def spearman(x: pd.Series, y: pd.Series) -> tuple[float | None, int]:
    m = x.notna() & y.notna()
    if m.sum() < 10:
        return None, int(m.sum())
    return float(x[m].rank().corr(y[m].rank())), int(m.sum())


def scale_value(v, dk=("6", "12")):
    if v is None or (isinstance(v, float) and math.isnan(v)) or v in dk:
        return np.nan
    return float(v)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--runs", required=True)
    ap.add_argument("--out", required=True)
    ap.add_argument("--ase-checkpoint")
    a = ap.parse_args()
    spec = json.loads(Path(a.spec).read_text(encoding="utf-8"))
    rd, out = Path(a.runs), Path(a.out)
    out.mkdir(parents=True, exist_ok=True)
    main_run = load_run(rd / "main.json")
    Q = {q["id"]: q for q in spec["questions"]}
    checks = []

    def add(name, ok, detail, group):
        checks.append({"group": group, "check": name, "status": "PASS" if ok else "FAIL", "detail": detail})

    R = main_run["respondents"]
    n = len(R)
    # --- 1. ολοκλήρωση / μοναδικότητα
    add("500 ολοκληρωμένες συνθετικές συνεντεύξεις", n == 500, f"{n}", "Ολοκλήρωση")
    add("Κανένας διπλός ερωτώμενος (μοναδικό πρόσωπο πλαισίου)", len({r["persona_id"] for r in R}) == n, f"{len({r['persona_id'] for r in R})} μοναδικά πρόσωπα", "Ολοκλήρωση")
    pats = Counter(json.dumps(r["answers"], sort_keys=True) for r in R)
    add("Κανένα πανομοιότυπο σύνολο απαντήσεων", max(pats.values()) == 1, f"μέγιστη επανάληψη {max(pats.values())}", "Ολοκλήρωση")
    # --- 2. έγκυρες διαδρομές + απαντήσεις (ανεξάρτητος αξιολογητής ASE)
    path_issues, val_issues = [], []
    for r in R:
        ans = {k: (v if v is not None else None) for k, v in r["answers"].items()}
        for q in spec["questions"]:
            asked = evaluate_condition(q["condition"], ans, {}) if q["condition"] else True
            v = ans[q["id"]]
            if asked != (v is not None):
                path_issues.append((r["respondent_id"], q["id"]))
            if v is None:
                continue
            codes = {o["code"] for o in q["options"]}
            vals = v if isinstance(v, list) else [v]
            if any(x not in codes for x in vals):
                val_issues.append((r["respondent_id"], q["id"], "κωδικός"))
            if q["type"] == "multiple_choice":
                excl = {o["code"] for o in q["options"] if o.get("exclusive")}
                if not (q.get("minChoices") or 1) <= len(vals) <= (q.get("maxChoices") or len(codes)):
                    val_issues.append((r["respondent_id"], q["id"], "πλήθος"))
                if excl & set(vals) and len(vals) > 1:
                    val_issues.append((r["respondent_id"], q["id"], "αποκλειστική"))
            elif len(vals) != 1:
                val_issues.append((r["respondent_id"], q["id"], "μονή"))
    add("Έγκυρες διαδρομές (skip logic, ανεξάρτητος έλεγχος ASE)", not path_issues, f"{len(path_issues)} ζητήματα", "Εγκυρότητα")
    add("Έγκυρες απαντήσεις (κωδικοί, πλήθος επιλογών, αποκλειστικές)", not val_issues, f"{len(val_issues)} ζητήματα", "Εγκυρότητα")
    # --- 3. κανόνες
    hard = Counter()
    for r in R:
        for c in spec["constraints"]:
            if evaluate_condition(c["forbid"], r["answers"], {}):
                hard[c["id"]] += 1
    add("Λογικοί περιορισμοί C1–C5: καμία παραβίαση", not hard, json.dumps(dict(hard)) or "0", "Συνοχή")
    soft = []
    for rule in spec["rules"]:
        refs = [x for x in Q if x in rule["when"]]
        base = [r for r in R if all(r["answers"][x] is not None for x in refs)]
        hits = sum(1 for r in base if evaluate_condition(rule["when"], r["answers"], {}))
        soft.append({"rule": rule["id"], "note": rule["note"], "base": len(base), "hits": hits, "rate": hits / len(base) if base else 0.0})
    smax = max(soft, key=lambda x: x["rate"]) if soft else {"rate": 0, "rule": "-"}
    add(f"Συνοχή μεταξύ ερωτήσεων: κάθε κανόνας S ≤ {SOFT_MAX:.0%}", smax["rate"] <= SOFT_MAX, f"μέγιστο {smax['rate']:.1%} ({smax['rule']})", "Συνοχή")
    # --- 4. δημογραφικά έναντι πληθυσμού
    marg = main_run["population"]["margins"]
    dev = {}
    for key, qid, mp in [("age_band", "D01", Q["D01"]["model"]["map"]), ("gender", "D02", Q["D02"]["model"]["map"]), ("region", "D03", Q["D03"]["model"]["map"])]:
        _, d = dist(main_run, Q[qid])
        target = {mp[k]: v for k, v in marg[key].items() if k in mp}
        tot = sum(target.values())
        target = {k: v / tot for k, v in target.items()}
        dev[qid] = max(abs(d.get(k, 0) - target.get(k, 0)) * 100 for k in set(d) | set(target))
    add(f"Δημογραφική σύνθεση ≈ βαθμονομημένος πληθυσμός (≤ {DEMO_MAX_PP:.0f} π.μ.)", max(dev.values()) <= DEMO_MAX_PP, ", ".join(f"{k} {v:.1f}" for k, v in dev.items()), "Αντιπροσωπευτικότητα")
    # --- 5. ποικιλία
    uni = []
    for q in spec["questions"]:
        nq, d = dist(main_run, q)
        if q["type"] == "single_choice" and nq and max(d.values()) > UNIFORM_MAX and q["model"]["kind"] != "profile":
            uni.append(q["id"])
    add(f"Ποικιλία: καμία ερώτηση > {UNIFORM_MAX:.0%} σε μία επιλογή", not uni, ", ".join(uni) or "—", "Ποικιλία")
    # --- 6. σχέσεις (κατεύθυνση δηλωμένων παραδοχών A-EXP / A-ATT)
    df = answers_df(main_run, spec)
    sv = {q: df[q].map(scale_value) for q in ["Q08", "Q09", "Q10", "Q12", "Q22", "Q24", "Q25", "Q28", "Q29"]}
    corr = {}
    for x, y in [("Q08", "Q09"), ("Q09", "Q10"), ("Q09", "Q24"), ("Q09", "Q25"), ("Q24", "Q25"), ("Q12", "Q09"), ("Q12", "Q25"), ("Q28", "Q29")]:
        rho, nn = spearman(sv[x], sv[y])
        corr[f"{x}~{y}"] = {"rho": rho, "n": nn}
    expected_pos = ["Q08~Q09", "Q09~Q10", "Q09~Q24", "Q09~Q25", "Q24~Q25", "Q12~Q09"]
    add("Αναμενόμενες θετικές σχέσεις (εικόνα–εμπιστοσύνη–πρόθεση–σύσταση–εμπειρία)", all((corr[k]["rho"] or 0) > 0.2 for k in expected_pos),
        ", ".join(f"{k} ρ={corr[k]['rho']:.2f}" for k in expected_pos), "Σχέσεις")
    rel = df[df["Q15"] == "1"].groupby("Q18")["Q09"].apply(lambda s: s.map(scale_value).mean()).to_dict()
    add("Άλυτο πρόβλημα → χαμηλότερη εμπιστοσύνη από πλήρη επίλυση", (rel.get("3", 0) or 0) < (rel.get("1", 9) or 9),
        ", ".join(f"Q18={k}: {v:.2f}" for k, v in rel.items() if not (isinstance(v, float) and math.isnan(v))), "Σχέσεις")
    # --- 7. τεκμηρίωση E/T/S
    meta = main_run["questionMeta"]
    mism = [q for q, m in meta.items() if {"E": 0, "T": 1, "S": 2}[m["declared"]] < {"E": 0, "T": 1, "S": 2}[m["derived"]]]
    add("Δηλωμένη κατηγορία E/T/S συνεπής με τα δεδομένα που χρησιμοποιούνται", not mism, ", ".join(mism) or "—", "Τεκμηρίωση")
    unresolved = sum(1 for r in R if any(f.startswith("unresolved") for f in r["flags"]))
    add("Καμία απάντηση με ανεπίλυτο κανόνα μετά τις επαναλήψεις", unresolved == 0, f"{unresolved}", "Συνοχή")

    # --- 8. επίδραση πηγών (ablation), σταθερότητα, ευαισθησία
    variants = {p.stem: load_run(p) for p in sorted(rd.glob("*.json")) if p.stem != "main"}
    influence = []
    for name, v in variants.items():
        if not name.startswith("ablate_"):
            continue
        src = name[len("ablate_"):]
        for q in spec["questions"]:
            n1, d1 = dist(main_run, q)
            n2, d2 = dist(v, q)
            changed = sum(1 for r1, r2 in zip(R, v["respondents"]) if r1["answers"][q["id"]] != r2["answers"][q["id"]])
            t = tvd(d1, d2, q["type"] == "multiple_choice") * 100
            if changed or t > 0:
                influence.append({"source": src, "question": q["id"], "class": q["class"], "tvd_pp": round(t, 2), "answers_changed": changed,
                                  "answers_changed_pct": round(changed / max(1, n) * 100, 1)})
    inf = pd.DataFrame(influence)
    src_summary = []
    for src in sorted({n[len('ablate_'):] for n in variants if n.startswith('ablate_')}):
        sub = inf[inf["source"] == src] if len(inf) else pd.DataFrame()
        eff = sub[(sub["tvd_pp"] >= 0.5) | (sub["answers_changed_pct"] >= 1)] if len(sub) else sub
        label = " + ".join((main_run["metricFits"].get(x) or {}).get("label", x) for x in src.split("+")) if src not in ("pie", "all_metrics") else ("Άγκυρες PIE (μικροδεδομένα διαΝΕΟσις)" if src == "pie" else "Όλοι οι δείκτες Eurostat μαζί")
        src_summary.append({"source": src, "label": label, "affects_estimates": bool(len(eff)), "questions_affected": ", ".join(sorted(set(eff["question"]))) if len(eff) else "",
                            "max_tvd_pp": float(sub["tvd_pp"].max()) if len(sub) else 0.0, "max_answers_changed_pct": float(sub["answers_changed_pct"].max()) if len(sub) else 0.0})
    # τελική (αποδεδειγμένη) κατηγορία: μια ερώτηση μένει T μόνο αν η αφαίρεση των ΑΜΕΣΩΝ πηγών της αλλάζει την εκτίμησή της
    eff_rows = []
    for q in spec["questions"]:
        m = meta[q["id"]]
        cls, why = q["class"], ""
        if q["class"] == "T":
            direct = set(m.get("directMetrics", []))
            sub = inf[(inf["question"] == q["id"]) & inf["source"].map(lambda s_: bool(set(s_.split("+")) & direct) and set(s_.split("+")) <= direct)] if len(inf) else pd.DataFrame()
            best_t = float(sub["tvd_pp"].max()) if len(sub) else 0.0
            best_c = float(sub["answers_changed_pct"].max()) if len(sub) else 0.0
            if best_t < 0.5 and best_c < 1.0:
                cls, why = "S", f"υποβιβάστηκε: οι άμεσες πηγές ({', '.join(m.get('directMetrics', []))}) δεν αλλάζουν την εκτίμηση (μέγ. {best_t:.2f} π.μ.)"
            else:
                why = f"επιβεβαιώθηκε: αφαίρεση πηγής → έως {best_t:.1f} π.μ. / {best_c:.1f}% απαντήσεων"
        elif q["class"] == "E":
            why = "προφίλ βαθμονομημένου πληθυσμού"
        else:
            why = "σενάριο με ρητές παραδοχές" + (" (συμμεταβλητές από Eurostat/PIE)" if m.get("usesMetrics") or m.get("usesPie") else "")
        eff_rows.append({"question": q["id"], "declared": q["class"], "effective": cls, "direct_sources": ", ".join(m.get("directMetrics", [])),
                         "covariate_sources": ", ".join(x for x in m.get("usesMetrics", []) if x not in m.get("directMetrics", [])), "uses_pie_anchors": m.get("usesPie"),
                         "bounds_activated": m.get("boundsActivated"), "constraint_redraws": m.get("constraintRedraws"), "justification": why})
    eff = pd.DataFrame(eff_rows)
    down = eff[eff["declared"] != eff["effective"]]["question"].tolist()
    add("Κατηγορία T μόνο όπου η πηγή αποδεδειγμένα επηρεάζει την εκτίμηση (δοκιμή αφαίρεσης)", True,
        f"υποβιβάστηκαν σε S: {', '.join(down) or '—'} · τελικά E/T/S = {(eff['effective'] == 'E').sum()}/{(eff['effective'] == 'T').sum()}/{(eff['effective'] == 'S').sum()}", "Τεκμηρίωση")
    noeff = [s["source"] for s in src_summary if not s["affects_estimates"]]
    checks.append({"group": "Τεκμηρίωση", "check": "Πηγές αποθηκευμένες αλλά χωρίς ουσιαστική επίδραση σε αυτή τη μελέτη", "status": "INFO",
                   "detail": ", ".join(noeff) or "καμία — κάθε δηλωμένη πηγή επηρεάζει τις εκτιμήσεις"})

    base_k = kpis(main_run)
    seeds = [k for k in variants if k.startswith("seed_")]
    sens = [k for k in variants if k.startswith("sens_")]
    stab_rows, sens_rows = [], []
    for kname, val in base_k.items():
        sv_ = [kpis(variants[s])[kname] for s in seeds] + [val]
        sv_ = [x for x in sv_ if x is not None]
        stab_rows.append({"kpi": kname, "main": val, "seed_mean": float(np.mean(sv_)), "seed_sd": float(np.std(sv_, ddof=1)) if len(sv_) > 1 else 0.0, "runs": len(sv_)})
        row = {"kpi": kname, "main": val}
        for s in sens:
            row[s] = kpis(variants[s])[kname]
        vals = [x for x in [row[s] for s in sens] + [val] if x is not None]
        row["min"], row["max"] = (min(vals), max(vals)) if vals else (None, None)
        sens_rows.append(row)

    # --- 9. σύγκριση με το ιστορικό ASE (ΜΟΝΟ αναφορά, όχι βαθμονόμηση)
    ase_cmp = []
    if a.ase_checkpoint and Path(a.ase_checkpoint).exists():
        ase = []
        for line in Path(a.ase_checkpoint).read_text(encoding="utf-8").splitlines():
            e = json.loads(line)
            if e.get("status") != "COMPLETE":
                continue
            ans = {}
            for row in e["rows"]:
                if row.get("status") == "ANSWERED":
                    try:
                        ans[row["question_id"]] = json.loads(row["response"])
                    except Exception:
                        ans[row["question_id"]] = row["response"]
            ase.append(ans)
        for q in spec["questions"]:
            xs = [x.get(q["id"]) for x in ase if x.get(q["id"]) not in (None, "")]
            if not xs:
                continue
            c = Counter(v for x in xs for v in (x if isinstance(x, list) else [x]))
            da = {o["code"]: c[o["code"]] / len(xs) for o in q["options"]}
            _, dl = dist(main_run, q)
            ase_cmp.append({"question": q["id"], "class": q["class"], "n_ase": len(xs), "tvd_pp_vs_ase": round(tvd(dl, da, q["type"] == "multiple_choice") * 100, 1)})

    # --- αποθήκευση εσωτερικών αρχείων
    qc = {"label": "ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ", "result": "PASS" if all(c["status"] != "FAIL" for c in checks) else "FAIL",
          "checks": checks, "soft_rules": soft, "correlations": corr, "trust_by_resolution": rel, "demographic_max_dev_pp": dev}
    (out / "qc_report.json").write_text(json.dumps(qc, ensure_ascii=False, indent=1, default=float), encoding="utf-8")
    pd.DataFrame(soft).to_csv(out / "consistency_rules.csv", index=False)
    eff.to_csv(out / "evidence_classes.csv", index=False)
    pd.DataFrame(src_summary).to_csv(out / "source_influence_summary.csv", index=False)
    (inf if len(inf) else pd.DataFrame(columns=["source", "question"])).to_csv(out / "source_influence_by_question.csv", index=False)
    pd.DataFrame(stab_rows).to_csv(out / "stability_seeds.csv", index=False)
    pd.DataFrame(sens_rows).to_csv(out / "sensitivity_scenario.csv", index=False)
    pd.DataFrame(ase_cmp).to_csv(out / "comparison_with_ase_history.csv", index=False)
    pd.DataFrame([{"pair": k, **v} for k, v in corr.items()]).to_csv(out / "correlations.csv", index=False)
    df.to_csv(out / "respondents_wide.csv", index=False)
    # κατανομές ανά ερώτηση
    drows = []
    for q in spec["questions"]:
        nq, d = dist(main_run, q)
        for o in q["options"]:
            lo, hi = wilson(d[o["code"]], nq)
            drows.append({"question": q["id"], "class": q["class"], "text": q["text"], "option": o["code"], "label": o["label"], "n_base": nq,
                          "pct": round(d[o["code"]] * 100, 1), "ci95_lo": round(lo * 100, 1), "ci95_hi": round(hi * 100, 1), "small_base": nq < SMALL_BASE})
    pd.DataFrame(drows).to_csv(out / "distributions.csv", index=False)
    summary = {"qc": qc["result"], "effective_classes": dict(zip(eff["question"], eff["effective"])), "kpis": base_k, "stability": stab_rows, "sensitivity": sens_rows, "sources": src_summary}
    (out / "summary.json").write_text(json.dumps(summary, ensure_ascii=False, indent=1, default=float), encoding="utf-8")
    for c in checks:
        print(f"{c['status']:4} [{c['group']}] {c['check']} — {c['detail'][:120]}")
    print("ΑΠΟΤΕΛΕΣΜΑ:", qc["result"])
    return 0 if qc["result"] == "PASS" else 1


if __name__ == "__main__":
    sys.exit(main())
