"""
EGPS — Δοκιμή Β (docs/synthetic-lab/EGPS_PREREGISTRATION.md §3): σχέσεις μεταξύ απαντήσεων από ΑΝΕΞΑΡΤΗΤΑ πραγματικά μικροδεδομένα.

Για κάθε σύνολο και κατηγορία σχέσης (EE, EI, UE, UG, UI) υπολογίζεται η συσχέτιση normal-scores (παράμετρος Gaussian copula),
μέσος όρος των ζευγών της κατηγορίας μέσα στο σύνολο. Leave-one-dataset-out: η τιμή του εκτός συνόλου προβλέπεται από τον μέσο
των υπολοίπων και συγκρίνεται με την ανεξαρτησία της παραγωγής (ρ = 0).

Έξοδοι: .synthetic-lab-data/egps/joint_eval.json · config/synthetic-lab/egps/joint_params.json (μόνο συντελεστές, όχι ατομικά δεδομένα)
  python scripts/synthetic-lab/egps/joint_eval.py
"""
import glob, json, math, os, statistics as st
import pandas as pd
from statistics import NormalDist

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
Z = os.path.join(REPO, ".synthetic-lab-data", "lake", "raw", "zenodo")
OUT = os.path.join(REPO, ".synthetic-lab-data", "egps", "joint_eval.json")
PARAMS = os.path.join(REPO, "config", "synthetic-lab", "egps", "joint_params.json")
ND = NormalDist()

def nscores(x: pd.Series) -> pd.Series:
    r = x.rank(method="average")
    n = x.notna().sum()
    return r.map(lambda v: ND.inv_cdf((v - 0.5) / n) if pd.notna(v) else float("nan"))

def ncorr(a: pd.Series, b: pd.Series):
    m = a.notna() & b.notna()
    if m.sum() < 30:
        return None, int(m.sum())
    return float(nscores(a[m]).corr(nscores(b[m]))), int(m.sum())

def clean(s, lo, hi):
    s = pd.to_numeric(s, errors="coerce")
    return s.where((s >= lo) & (s <= hi))

def d1():
    m = pd.read_csv(os.path.join(Z, "22763861", "data_anonymized.csv"), sep=None, engine="python")
    c = {k: m[[f"{k}{i}" for i in range(1, n + 1)]].apply(lambda s: clean(s, 1, 5)).mean(axis=1) for k, n in [("PU", 4), ("PEOU", 4), ("ENJ", 3), ("BI", 3)]}
    c["USE"] = clean(m["USE"], 1, 5); c["DEVICE_FREQ"] = clean(m["DEVICE_FREQ"], 1, 4)
    pairs = {"EE": [("PU", "PEOU"), ("PU", "ENJ"), ("PEOU", "ENJ")],
             "EI": [(e, i) for e in ["PU", "PEOU", "ENJ"] for i in ["BI", "USE"]],
             "UG": [("DEVICE_FREQ", e) for e in ["PU", "PEOU", "ENJ", "BI"]]}
    return "D1 zenodo:22763861 Metaverse/TAM3", c, pairs

def d2():
    s = pd.read_csv(os.path.join(Z, "14394129", "2024-12-06_Zenodo_01_Data.csv"), sep=None, engine="python")
    c = {"AT": s[[f"AT0{i}_TPB" for i in range(1, 5)]].apply(lambda x: clean(x, 1, 5)).mean(axis=1),
         "TR": s[[f"TR0{i}_TPB" for i in range(1, 4)]].apply(lambda x: clean(x, 1, 5)).mean(axis=1),
         "IN": clean(s["IN_CCAM_TPB"], 1, 5), "DS_Freq": clean(s["DS_Freq"], 1, 7)}
    pairs = {"EE": [("AT", "TR")], "EI": [("AT", "IN"), ("TR", "IN")], "UG": [("DS_Freq", e) for e in ["AT", "TR", "IN"]]}
    return "D2 zenodo:14394129 SINFONICA", c, pairs

def d3():
    frames = []
    for f in ["B1", "B2", "B3"]:
        b = pd.read_excel(glob.glob(os.path.join(Z, "10947346", f"{f}.*"))[0])
        col = lambda pre: next(c for c in b.columns if c.startswith(pre))
        frames.append(pd.DataFrame({"VISITED": b[col("G00Q08.")].map({"Yes": 1, "No": 0}), "RATING": clean(b[col("G00Q20")], 0, 10), "RECOMMEND": clean(b[col("G00Q21")], 0, 10)}))
    df = pd.concat(frames, ignore_index=True)
    c = {k: df[k] for k in df.columns}
    pairs = {"EI": [("RATING", "RECOMMEND")], "UE": [("VISITED", "RATING")], "UI": [("VISITED", "RECOMMEND")]}
    return "D3 zenodo:10947346 επισκέπτες Αώου (B1–B3)", c, pairs

def d4():
    d = pd.read_excel(os.path.join(Z, "19448697", "Questionnaire_results.xlsx"))
    yn = {"yes": 1, "no": 0}
    c = {"NECESSARY": d.iloc[:, 2].map(yn), "CONSULTED": d.iloc[:, 4].map(yn), "LEGAL": d.iloc[:, 9].map(yn)}
    pairs = {"EE": [("NECESSARY", "LEGAL")], "UE": [("CONSULTED", "NECESSARY")]}
    return "D4 zenodo:19448697 ιδιοκτήτες σκύλων", c, pairs

def d5():
    t = pd.read_excel(os.path.join(Z, "20773326", "TEAMIT_M1_satisfaction_anonymised.xlsx"))
    c = {"ENJOY": t.iloc[:, 2].map({"Not at all": 1, "A little": 2, "Quite": 3, "Very much": 4}),
         "LOGISTICS": t.iloc[:, 5].map({"Not satisfied": 1, "A little satisfied": 2, "Quite satisfied": 3, "Very much satisfied": 4})}
    return "D5 zenodo:20773326 TEAMIT", c, {"EE": [("ENJOY", "LOGISTICS")]}

def main():
    cells, detail = {}, []
    for fn in [d1, d2, d3, d4, d5]:
        name, c, pairs = fn()
        for cls, ps in pairs.items():
            vals = []
            for a, b in ps:
                r, n = ncorr(c[a], c[b])
                detail.append({"dataset": name, "class": cls, "pair": f"{a}–{b}", "rho": None if r is None else round(r, 3), "n": n})
                if r is not None:
                    vals.append(r)
            if vals:
                cells.setdefault(cls, {})[name] = st.mean(vals)
    classes = {}
    for cls, by in cells.items():
        names = sorted(by)
        entry = {"datasets": {k: round(v, 3) for k, v in by.items()}, "n_datasets": len(names)}
        if len(names) >= 3:
            lodo = []
            for k in names:
                pred = st.mean(by[j] for j in names if j != k)
                lodo.append({"heldout": k, "actual": round(by[k], 3), "pred": round(pred, 3), "err_model": round(abs(pred - by[k]), 3), "err_indep": round(abs(by[k]), 3), "sign_ok": (pred > 0) == (by[k] > 0)})
            mae_m, mae_i = st.mean(x["err_model"] for x in lodo), st.mean(x["err_indep"] for x in lodo)
            sign_fail = sum(1 for x in lodo if not x["sign_ok"])
            accepted = mae_m < mae_i and sign_fail <= 1
            entry.update({"lodo": lodo, "mae_model": round(mae_m, 3), "mae_independence": round(mae_i, 3), "sign_failures": sign_fail, "accepted": accepted})
        else:
            entry.update({"accepted": False, "reason": "λιγότερα από 3 ανεξάρτητα σύνολα — εξάρτηση NOT ESTIMABLE"})
        vals = list(by.values())
        entry.update({"rho_mean": round(st.mean(vals), 3), "rho_min": round(min(vals), 3), "rho_max": round(max(vals), 3)})
        classes[cls] = entry
    out = {"preregistration": "docs/synthetic-lab/EGPS_PREREGISTRATION.md §3", "measure": "normal-scores correlation (van der Waerden)", "classes": classes, "pairs": detail}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    json.dump({"version": "egps-joint-0.1", "measure": out["measure"],
               "classes": {k: {kk: v[kk] for kk in ["accepted", "rho_mean", "rho_min", "rho_max", "n_datasets"] + (["mae_model", "mae_independence"] if "mae_model" in v else [])} for k, v in classes.items()},
               "sources": sorted({d["dataset"] for d in detail})}, open(PARAMS, "w"), ensure_ascii=False, indent=1)
    print(json.dumps(classes, ensure_ascii=False, indent=1))
    for d in detail: print(d)

if __name__ == "__main__":
    main()
