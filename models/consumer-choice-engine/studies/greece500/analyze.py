"""Greece 500 — ανάλυση ΜΟΝΟ από τις ατομικές εγγραφές της εκτέλεσης (INDIVIDUAL_CHOICES / CHOICE_PROBABILITIES).

Παράγει: SYNTHETIC_PANEL.csv (με segments από ατομικούς συντελεστές), CROSSTABS.csv (μόνο μεταβλητές που επηρεάζουν το
μοντέλο: ηλικία/φύλο στο μοντέλο παράδοσης· segments), analysis.json (για έκθεση και dashboard), lab_data.js.
    python3 -I studies/greece500/analyze.py <run_dir> <out_dir>
"""
from __future__ import annotations

import csv
import json
import sys
from collections import Counter, defaultdict
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cce.engine import ChoiceEngine  # noqa: E402
from cce.panel import load_greek_panel  # noqa: E402
from run_study import MODELS, SEED  # noqa: E402

PANEL_COLS = ["consumer_id", "lab_persona_id", "gender", "age_band", "region", "area", "settlement", "education", "household_type", "household_size", "income_quintile",
              "employment"]


def person_betas(mk):
    e = ChoiceEngine.load(ROOT / "artifacts" / MODELS[mk][0])
    m = e.art["model"]
    th = e._theta()
    K = len(m.get("random", {}))
    out = {}
    for p in load_greek_panel():
        z = e._person_z(SEED, p["respondent_id"], K)
        out[p["respondent_id"]] = e._coef_draw(th, z)
    return e, m["features"], out


def _kmeans(Z, k, seed, restarts=25, iters=200):
    rng = np.random.default_rng(seed)
    best, best_sse = None, np.inf
    for _ in range(restarts):
        C = [Z[rng.integers(len(Z))]]
        for _ in range(k - 1):                       # k-means++
            d = np.min([((Z - c) ** 2).sum(1) for c in C], axis=0)
            C.append(Z[rng.choice(len(Z), p=d / d.sum())])
        C = np.array(C)
        for _ in range(iters):
            lab = np.argmin(((Z[:, None, :] - C[None]) ** 2).sum(2), 1)
            newC = np.array([Z[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(k)])
            if np.allclose(newC, C):
                break
            C = newC
        sse = ((Z - C[lab]) ** 2).sum()
        if sse < best_sse:
            best, best_sse = (lab, C), sse
    return best


SEG_DEV = {}


def segments(mk, conv_factor, price_span_eur, life_span, k=4):
    """Segments από τους ΑΤΟΜΙΚΟΥΣ συντελεστές του μοντέλου. Σημασία = εύρος χρησιμότητας που αποδίδει το άτομο σε: τιμή (στο
    εύρος τιμών των σεναρίων, μετά τη μετατροπή ευρώ → νόμισμα μοντέλου), διάρκεια, επισκευασιμότητα (καθόλου→πλήρης), ενεργειακή
    κλάση (G→A· σταθερός συντελεστής). k-means (k=4, σταθερό seed) στα ΣΧΕΤΙΚΑ μερίδια σημασίας· όνομα = χαρακτηριστικό με τη
    μεγαλύτερη θετική απόκλιση από τον μέσο όρο· «Ισορροπημένοι» αν < 5 μονάδες· «Μέτρια …» αν το ίδιο χαρακτηριστικό κυριαρχεί ήδη
    σε segment με μεγαλύτερη απόκλιση."""
    e, feats, B = person_betas(mk)
    i = {f: feats.index(f) for f in feats}
    ids = list(B)
    imp = {rid: {"price": abs(B[rid][i["price_100chf"]]) * price_span_eur * conv_factor / 100, "lifespan": abs(B[rid][i["life_years"]]) * life_span,
                 "repairability": abs(B[rid][i["repair_full"]]), "energy": abs(B[rid][i["energy_A"]])} for rid in ids}
    keys = ["price", "lifespan", "repairability", "energy"]
    X = np.array([[imp[r][c] for c in keys] for r in ids])
    Z = X / X.sum(1, keepdims=True)                   # σχετικό μερίδιο σημασίας κάθε χαρακτηριστικού (άθροισμα 1)
    lab, C = _kmeans(Z, k, SEED)
    dev = C - Z.mean(0)                               # απόκλιση του κέντρου από τον μέσο όρο (μονάδες μεριδίου)
    top = {j: int(np.argmax(dev[j])) for j in range(k)}
    names = {}
    for j in sorted(range(k), key=lambda j: -dev[j, top[j]]):
        key = keys[top[j]] if dev[j, top[j]] >= 0.05 else "balanced"     # < 5 μονάδες μεριδίου: χωρίς σαφή έμφαση
        names[j] = key if key not in names.values() else "moderate_" + key
    SEG_DEV[mk] = {names[j]: {c: round(float(dev[j, i_]) * 100, 1) for i_, c in enumerate(keys)} for j in range(k)}
    seg = {rid: names[int(l)] for rid, l in zip(ids, lab)}
    return seg, imp


SEG_LABEL = {"price": "Έμφαση στην τιμή", "lifespan": "Έμφαση στη διάρκεια ζωής", "repairability": "Έμφαση στην επισκευασιμότητα", "energy": "Έμφαση στην ενεργειακή κλάση"}
SEG_LABEL["balanced"] = "Ισορροπημένοι"
SEG_LABEL.update({"moderate_" + k: "Μέτρια " + v[0].lower() + v[1:] for k, v in list(SEG_LABEL.items())})


def main(run_dir, out_dir):
    run, out = Path(run_dir), Path(out_dir)
    meta = json.loads((run / "_run_meta.json").read_text(encoding="utf-8"))
    res = pd.read_csv(run / "RESULTS.csv", dtype={"scenario_id": str})
    ch = pd.read_csv(run / "INDIVIDUAL_CHOICES.csv", dtype=str)
    panel = load_greek_panel()
    pdf = pd.DataFrame(panel)
    f0 = {mk: meta["assumptions"]["T0"]["factors"][mk]["factor"] for mk in MODELS}
    seg_wm, imp_wm = segments("swiss-ce-washing-machine", f0["swiss-ce-washing-machine"], 450, 10)
    seg_sp, imp_sp = segments("swiss-ce-smartphone", f0["swiss-ce-smartphone"], 200, 4)
    seg_dev_t0 = json.loads(json.dumps(SEG_DEV))            # αποκλίσεις κέντρων στη βασική υπόθεση (πριν από τις αναλύσεις ευαισθησίας)
    # ευαισθησία των segments στην υπόθεση μεταφοράς
    seg_sens = {}
    for aid, a in meta["assumptions"].items():
        s, _ = segments("swiss-ce-washing-machine", a["factors"]["swiss-ce-washing-machine"]["factor"], 450, 10)
        seg_sens[aid] = {k: round(100 * v / 500, 1) for k, v in Counter(s.values()).items()}
    pdf["segment_washing_machine"] = pdf["respondent_id"].map(lambda r: SEG_LABEL[seg_wm[r]])
    pdf["segment_smartphone"] = pdf["respondent_id"].map(lambda r: SEG_LABEL[seg_sp[r]])
    pdf[PANEL_COLS + ["segment_washing_machine", "segment_smartphone"]].to_csv(out / "SYNTHETIC_PANEL.csv", index=False)

    # ----- διασταυρώσεις
    rows = []
    ch0 = ch[ch["assumption_id"] == "T0"].merge(pdf[["respondent_id", "age_band", "gender", "segment_washing_machine", "segment_smartphone"]], on="respondent_id")
    def xt(df, var, qid, why):
        for (sid, lvl), g in df.groupby(["scenario_id", var]):
            cnt = g["choice"].value_counts()
            for alt, n in cnt.items():
                rows.append({"question_id": qid, "scenario_id": sid, "assumption_id": "T0", "variable": var, "level": lvl, "alt_id": alt, "n_level": len(g),
                             "n_chosen": int(n), "pct": round(100 * n / len(g), 1), "why_this_variable": why})
    for qid in ("DL1", "DL2", "DL3", "DL4"):
        d = ch0[ch0["question_id"] == qid]
        xt(d, "age_band", qid, "Το μοντέλο παράδοσης περιέχει όρους ηλικίας (18-24, 55-64, 65+)")
        xt(d, "gender", qid, "Το μοντέλο παράδοσης περιέχει όρο φύλου")
    for qid in ("WM1", "WM2", "WM3", "WM4", "WM6", "WM7"):
        xt(ch0[ch0["question_id"] == qid], "segment_washing_machine", qid, "Segment από τους ατομικούς συντελεστές του ίδιου μοντέλου")
    for qid in ("SP1", "SP2", "SP3", "SP5"):
        xt(ch0[ch0["question_id"] == qid], "segment_smartphone", qid, "Segment από τους ατομικούς συντελεστές του ίδιου μοντέλου")
    with open(out / "CROSSTABS.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(rows[0]))
        w.writeheader(); w.writerows(rows)

    # ----- έλεγχος απουσίας τεχνητών δημογραφικών διαφορών (μοντέλα χωρίς δημογραφικούς όρους)
    from scipy.stats import chi2_contingency
    demo_check = []
    for qid, sid in [("WM1", "649"), ("WM4", "749"), ("SP1", "349"), ("RF1", "30%")]:
        d = ch0[(ch0["question_id"] == qid) & (ch0["scenario_id"] == sid)].merge(pdf[["respondent_id", "income_quintile", "region"]], on="respondent_id")
        for var in ("age_band", "income_quintile", "region"):
            tab = pd.crosstab(d[var], d["choice"])
            p = chi2_contingency(tab)[1] if tab.shape[1] > 1 else 1.0
            demo_check.append({"question_id": qid, "scenario_id": sid, "variable": var, "chi2_p": round(float(p), 3)})

    # ----- σύνοψη για έκθεση/dashboard
    R = res[res["status"] == "EXPERIMENTAL_CROSS_COUNTRY_TRANSFER"].copy()
    summary = defaultdict(dict)
    for (qid, sid, aid), g in R.groupby(["question_id", "scenario_id", "assumption_id"], sort=False):
        summary[qid].setdefault(aid, {})[sid] = {r.alt_id: {"sim": r.share_simulated_pct, "p": r.mean_probability_pct,
                                                           "ci": [r.ci95_low_pct, r.ci95_high_pct] if not pd.isna(r.ci95_low_pct) else None} for r in g.itertuples()}
    rej = res[res["status"] != "EXPERIMENTAL_CROSS_COUNTRY_TRANSFER"].groupby(["question_id", "assumption_id", "status"])["scenario_id"].nunique().reset_index()
    status_counts = res.drop_duplicates(["question_id", "scenario_id", "assumption_id"]).groupby(["assumption_id", "status"]).size().unstack(fill_value=0).to_dict()
    seg_profiles = {}
    for name, seg, imp in (("washing_machine", seg_wm, imp_wm), ("smartphone", seg_sp, imp_sp)):
        df = pd.DataFrame.from_dict(imp, orient="index")
        df["seg"] = pd.Series(seg)
        seg_profiles[name] = {SEG_LABEL[k]: {"n": int(len(g)), "pct": round(100 * len(g) / 500, 1), "mean_importance": {c: round(float(g[c].mean()), 3) for c in imp[next(iter(imp))]}}
                              for k, g in df.groupby("seg")}
    seg_choice = {}
    for qid, sid in [("WM1", "649"), ("WM2", "649"), ("WM3", "649"), ("WM4", "749"), ("WM6", "Premium(A) vs Βασικό(B)"), ("WM6", "Βασικό(A) vs Οικονομικό(B)")]:
        d = ch0[(ch0["question_id"] == qid) & (ch0["scenario_id"] == sid)]
        seg_choice[f"{qid}|{sid}"] = {s: round(100 * (g["choice"] == "A").mean(), 1) for s, g in d.groupby("segment_washing_machine")}
    demo = {v: pdf[v].value_counts(normalize=True).mul(100).round(1).to_dict() for v in ("gender", "age_band", "region", "income_quintile", "settlement", "household_size", "education")}
    analysis = {"meta": meta, "summary": summary, "rejections": rej.to_dict(orient="records"), "status_counts": status_counts, "segments": seg_profiles,
                "segment_sensitivity_wm": seg_sens, "segment_deviation_pp": seg_dev_t0, "segment_choice": seg_choice, "demographics": demo, "demographic_null_check": demo_check}
    (out / "_analysis.json").write_text(json.dumps(analysis, ensure_ascii=False, indent=1, default=float), encoding="utf-8")

    # ----- δεδομένα dashboard: ατομικοί συντελεστές και σφάλματα από την CCE (ίδιοι υπολογισμοί με simulate_panel)
    lab = {"seed": SEED, "assumptions": {k: {"label": v["label"], "factors": {mk: v["factors"][mk]["factor"] for mk in MODELS}} for k, v in meta["assumptions"].items()},
           "models": {}, "panel": pdf[["respondent_id", "gender", "age_band", "region", "income_quintile", "female", "segment_washing_machine", "segment_smartphone"]].to_dict(orient="records"),
           "questions": [q for q in meta["questions"] if q["kind"] != "unsupported"], "results": summary}
    for mk in MODELS:
        e, feats, B = person_betas(mk)
        lab["models"][mk] = {"features": feats, "terms": e.art["terms"], "domain": e.art["domain"], "money": MODELS[mk][3], "context": MODELS[mk][4],
                             "betas": {rid: [round(float(x), 6) for x in b] for rid, b in B.items()}}
    eps = {}
    for q in lab["questions"]:
        alts = json.loads(pd.read_csv(run / "SCENARIOS.csv", dtype={"scenario_id": str}).query("question_id == @q['question_id']").iloc[0]["alternatives"])
        ids = sorted({a["alt_id"] for a in alts})
        eps[q["question_id"]] = {"labels": ids, "e": {p["respondent_id"]: [round(float(x), 6) for x in np.random.default_rng(
            ChoiceEngine._seed(SEED, "gumbel", p["respondent_id"], q["question_id"])).gumbel(size=len(ids) + 8)[:len(ids)]] for p in panel}}
    lab["eps"] = eps
    lab["dl_ranges"] = __import__("scenarios").DL_RANGES
    lab["scenarios"] = pd.read_csv(run / "SCENARIOS.csv", dtype={"scenario_id": str}).to_dict(orient="records")
    return analysis, lab


if __name__ == "__main__":
    a, lab = main(sys.argv[1], sys.argv[2])
    Path(sys.argv[2], "INTERACTIVE_LAB").mkdir(parents=True, exist_ok=True)
    Path(sys.argv[2], "INTERACTIVE_LAB", "data.js").write_text("window.G500 = " + json.dumps(lab, ensure_ascii=False, separators=(",", ":")) + ";\n", encoding="utf-8")
    print(json.dumps({"segments": a["segments"], "seg_sens": a["segment_sensitivity_wm"], "status": a["status_counts"]}, ensure_ascii=False, indent=0)[:3000])
