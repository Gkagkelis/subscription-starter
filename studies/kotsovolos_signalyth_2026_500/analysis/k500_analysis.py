"""Ανάλυση της συνθετικής μελέτης kotsovolos_signalyth_2026_500 από τις αποθηκευμένες ατομικές εγγραφές του ASE.

ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ.

Δεν παράγει απαντήσεις: διαβάζει μόνο τις εγγραφές του run (individual_responses) και τα προφίλ του πάνελ.
    python3 -I studies/kotsovolos_signalyth_2026_500/analysis/k500_analysis.py --run k500_full_v1 [--out DIR]
Έξοδοι: analysis.json (όλοι οι αριθμοί της αναφοράς), respondents_wide.csv, topline.csv, crosstabs.csv, drivers.csv, segments.csv.
"""
import argparse
import itertools
import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy import stats

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "research-engine"))
from ase.study import Study  # noqa: E402

SYNTH = "ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ"
STUDY = ROOT / "studies" / "kotsovolos_signalyth_2026_500"
SCALE5 = ["Q08", "Q09", "Q10", "Q12", "Q13", "Q19", "Q20", "Q22", "Q24", "Q28", "Q29", "Q31"]   # 1–5, κωδ. 6 = δεν ξέρω/δεν εφαρμόζεται
BRAND = ["Q08", "Q09", "Q10", "Q22", "Q24", "NPS"]
REGION_GROUP = {"Αττική": "Αττική", "Κεντρική Μακεδονία": "Βόρεια Ελλάδα", "Ανατολική Μακεδονία και Θράκη": "Βόρεια Ελλάδα",
                "Δυτική Μακεδονία": "Βόρεια Ελλάδα", "Ήπειρος": "Κεντρική & Δυτική Ελλάδα", "Θεσσαλία": "Κεντρική & Δυτική Ελλάδα",
                "Ιόνια Νησιά": "Νησιά", "Δυτική Ελλάδα": "Κεντρική & Δυτική Ελλάδα", "Στερεά Ελλάδα": "Κεντρική & Δυτική Ελλάδα",
                "Πελοπόννησος": "Κεντρική & Δυτική Ελλάδα", "Βόρειο Αιγαίο": "Νησιά", "Νότιο Αιγαίο": "Νησιά", "Κρήτη": "Νησιά"}
EDU = {"less_than_primary": "Έως υποχρεωτική", "primary": "Έως υποχρεωτική", "lower_secondary": "Έως υποχρεωτική",
       "upper_secondary": "Λύκειο / μεταλυκειακή", "post_secondary": "Λύκειο / μεταλυκειακή", "tertiary": "Τριτοβάθμια"}
AGE = {"18-24": "18–34", "25-34": "18–34", "35-44": "35–54", "45-54": "35–54", "55-64": "55+", "65+": "55+"}
INC = {"1": "Χαμηλό (Π1–2)", "2": "Χαμηλό (Π1–2)", "3": "Μεσαίο (Π3)", "4": "Υψηλό (Π4–5)", "5": "Υψηλό (Π4–5)"}
GENDER = {"male": "Άνδρες", "female": "Γυναίκες"}
SEG = {"customer": "Πελάτες (24μ.)", "aware_noncustomer": "Γνωρίζουν, όχι πελάτες", "unaware": "Δεν γνωρίζουν"}


def load(st, run_id):
    df = st.responses(run_id)
    qa = set(df.loc[df["inference_mode"] == "FORCED_QA", "respondent_id"]) if "inference_mode" in df else set()
    df = df[~df["respondent_id"].isin(qa)]
    ans = df[df["status"] == "ANSWERED"].copy()
    ans["v"] = ans["response"].map(json.loads)
    wide = ans.pivot(index="respondent_id", columns="question_id", values="v")
    wide = wide.reindex(columns=[q.id for q in st.qn.questions])          # ερωτήσεις που δεν ρωτήθηκαν σε κανέναν: κενές στήλες
    wide = wide.astype(object).where(wide.notna(), None)
    prof = st.profiles(run_id).drop_duplicates("respondent_id").set_index("respondent_id")
    lab = st.with_lab_state(prof.reset_index()).set_index("respondent_id")
    w = prof.loc[wide.index, ["age_band", "gender", "region", "education", "income_quintile", "household_type", "settlement"]].copy()
    for c in ("lab_emp", "lab_econ4", "lab_class3"):
        if c in lab:
            w[c] = lab.loc[wide.index, c]
    w = w.join(wide)
    return w, df


def derive(w, qn):
    d = w.copy()
    for q in SCALE5:
        if q in d:
            d[q + "_s"] = d[q].map(lambda v: float(v) if isinstance(v, str) and v.isdigit() and 1 <= int(v) <= 5 else np.nan)
    d["NPS"] = d["Q25"].map(lambda v: float(int(v) - 1) if isinstance(v, str) and v.isdigit() and int(v) <= 11 else np.nan)
    d["NPS_cat"] = d["NPS"].map(lambda x: np.nan if pd.isna(x) else ("Υποστηρικτές (9–10)" if x >= 9 else "Ουδέτεροι (7–8)" if x >= 7 else "Επικριτές (0–6)"))
    d["segment"] = [("unaware" if q4 == "1" else "customer" if q5 == "1" else "aware_noncustomer") for q4, q5 in zip(d["Q04"], d["Q05"] if "Q05" in d else [None] * len(d))]
    d["segment_l"] = d["segment"].map(SEG)
    d["age3"] = d["age_band"].map(AGE)
    d["region4"] = d["region"].map(REGION_GROUP)
    d["edu3"] = d["education"].map(EDU)
    d["inc3"] = d["income_quintile"].astype(str).map(INC)
    d["gender_l"] = d["gender"].map(GENDER)
    d["familiarity"] = d["Q04"].map({"1": "Δεν γνωρίζει", "2": "Μόνο όνομα", "3": "Αρκετά", "4": "Πολύ καλά"})
    d["problem"] = d.apply(lambda r: (np.nan if r["segment"] != "customer" else "Πρόβλημα" if r.get("Q15") == "1" else "Χωρίς πρόβλημα"), axis=1)
    d["recovery"] = d.apply(lambda r: (np.nan if r.get("Q15") != "1" else {"1": "Επιλύθηκε πλήρως", "2": "Εν μέρει", "3": "Άλυτο"}.get(r.get("Q18"), "Δεν γνωρίζει")), axis=1)
    d["exp_group"] = d.apply(lambda r: (np.nan if r["segment"] != "customer" else
                                         "Χωρίς πρόβλημα" if r.get("Q15") != "1" else
                                         "Πρόβλημα – επιλύθηκε" if r.get("Q18") == "1" else
                                         "Πρόβλημα – εν μέρει/άλυτο" if r.get("Q18") in ("2", "3") else "Πρόβλημα – άγνωστη έκβαση"), axis=1)
    d["on_time"] = d["Q14"].map({"1": 1.0, "2": 1.0, "3": 0.0}) if "Q14" in d else np.nan
    return d


def labels(qn):
    return {q.id: {"text": q.text, "type": q.type, "options": {o.code: o.label for o in q.options}, "condition": q.condition} for q in qn.questions}


def dist(series, opts, multi=False):
    s = series.dropna()
    n = len(s)
    if multi:
        cnt = pd.Series([c for v in s for c in v]).value_counts()
    else:
        cnt = s.map(str).value_counts()
    return {"n_base": n, "rows": [{"code": c, "label": l, "n": int(cnt.get(c, 0)), "pct": round(100 * cnt.get(c, 0) / n, 1) if n else None} for c, l in opts.items()]}


def topline(d, lab):
    out = {}
    for qid, m in lab.items():
        if qid not in d:
            out[qid] = {"n_base": 0, "rows": [], "asked": False}
            continue
        multi = m["type"] in ("multiple_choice", "multi")
        t = dist(d[qid], m["options"], multi)
        t["multi"] = multi
        t["asked"] = t["n_base"] > 0
        if qid + "_s" in d:
            s = d[qid + "_s"].dropna()
            t.update(mean=round(float(s.mean()), 2) if len(s) else None, top2=round(100 * float((s >= 4).mean()), 1) if len(s) else None,
                     bottom2=round(100 * float((s <= 2).mean()), 1) if len(s) else None, n_valid=int(len(s)))
        out[qid] = t
    s = d["NPS"].dropna()
    out["Q25"]["nps"] = {"n_valid": int(len(s)), "promoters": round(100 * float((s >= 9).mean()), 1), "passives": round(100 * float(((s >= 7) & (s <= 8)).mean()), 1),
                         "detractors": round(100 * float((s <= 6).mean()), 1), "score": round(100 * float((s >= 9).mean() - (s <= 6).mean()), 1), "mean": round(float(s.mean()), 2)}
    return out


BREAKS = [("segment_l", "Σχέση με τον Κωτσόβολο"), ("age3", "Ηλικία"), ("gender_l", "Φύλο"), ("region4", "Περιοχή"), ("edu3", "Εκπαίδευση"), ("inc3", "Εισόδημα")]


def metric_by(d, col, metrics, min_n=15):
    rows = []
    for g, sub in d.groupby(col):
        r = {"break": col, "group": g, "n": int(len(sub))}
        for m in metrics:
            s = sub[m].dropna()
            r[m + "_n"] = int(len(s))
            r[m + "_mean"] = round(float(s.mean()), 2) if len(s) >= 1 else None
            if m == "NPS":
                r["NPS_score"] = round(100 * float((s >= 9).mean() - (s <= 6).mean()), 1) if len(s) else None
            else:
                r[m + "_top2"] = round(100 * float((s >= 4).mean()), 1) if len(s) else None
        r["small_base"] = r["n"] < min_n
        rows.append(r)
    return rows


def crosstab_q(d, qid, col, opts, multi=False):
    rows = []
    for g, sub in d[d[qid].notna()].groupby(col):
        t = dist(sub[qid], opts, multi)
        rows += [{"question_id": qid, "break": col, "group": g, "n_base": t["n_base"], **r} for r in t["rows"]]
    return rows


def chi2(d, qid, col):
    sub = d[d[qid].notna() & d[col].notna()]
    if sub.empty or isinstance(sub[qid].iloc[0], list):
        return None
    tab = pd.crosstab(sub[col], sub[qid].map(str))
    if tab.shape[0] < 2 or tab.shape[1] < 2:
        return None
    c, p, dof, _ = stats.chi2_contingency(tab)
    v = float(np.sqrt(c / (tab.values.sum() * (min(tab.shape) - 1))))
    return {"chi2": round(float(c), 2), "dof": int(dof), "p": float(p), "cramers_v": round(v, 3), "n": int(tab.values.sum())}


def spearman(d, cols):
    out = {}
    for a, b in itertools.combinations(cols, 2):
        s = d[[a, b]].dropna()
        if len(s) >= 10:
            r, p = stats.spearmanr(s[a], s[b])
            out[f"{a}~{b}"] = {"rho": round(float(r), 3), "n": int(len(s)), "p": float(p)}
    return out


def shapley_r2(y, X):
    """Σχετική σημασία (Shapley/LMG) για γραμμική παλινδρόμηση: μοιράζει το R² στους προβλέπτες."""
    cols = list(X.columns)

    def r2(S):
        if not S:
            return 0.0
        A = np.column_stack([np.ones(len(X))] + [X[c].values for c in S])
        b, *_ = np.linalg.lstsq(A, y, rcond=None)
        res = y - A @ b
        return 1 - res.var() / y.var()
    from math import factorial
    k = len(cols)
    cache = {}
    imp = {}
    for c in cols:
        tot = 0.0
        others = [o for o in cols if o != c]
        for m in range(k):
            for S in itertools.combinations(others, m):
                key = frozenset(S)
                if key not in cache:
                    cache[key] = r2(list(S))
                k2 = frozenset(S + (c,))
                if k2 not in cache:
                    cache[k2] = r2(list(S) + [c])
                tot += factorial(m) * factorial(k - m - 1) / factorial(k) * (cache[k2] - cache[key])
        imp[c] = tot
    full = r2(cols)
    A = np.column_stack([np.ones(len(X))] + [(X[c].values - X[c].mean()) / (X[c].std() or 1) for c in cols])
    b, *_ = np.linalg.lstsq(A, (y - y.mean()) / (y.std() or 1), rcond=None)
    return {"r2": round(float(full), 3), "n": int(len(y)),
            "predictors": [{"var": c, "shapley_r2": round(float(imp[c]), 3), "share_pct": round(100 * imp[c] / full, 1) if full > 0 else None,
                            "std_beta": round(float(b[i + 1]), 3)} for i, c in enumerate(cols)]}


def drivers(d):
    out = {}
    aw = d[d["segment"] != "unaware"]
    for target, preds in (("Q24_s", ["Q08_s", "Q09_s", "Q10_s", "Q22_s"]), ("NPS", ["Q08_s", "Q09_s", "Q10_s", "Q22_s"]),
                          ("Q09_s", ["Q08_s", "Q10_s", "Q22_s"])):
        s = aw[[target] + preds].dropna()
        if len(s) >= 30:
            out[f"aware:{target}"] = shapley_r2(s[target].values.astype(float), s[preds].astype(float))
    cu = d[d["segment"] == "customer"].copy()
    cu["problem_b"] = (cu["Q15"] == "1").astype(float)
    cu["unresolved_b"] = cu["Q18"].isin(["2", "3"]).astype(float)
    for target in ("Q09_s", "Q24_s", "NPS"):
        preds = ["Q12_s", "Q13_s", "on_time", "problem_b", "unresolved_b"]
        s = cu[[target] + preds].dropna()
        s = s.loc[:, s.std() > 0]
        p2 = [p for p in preds if p in s]
        if len(s) >= 30 and p2:
            out[f"customers:{target}"] = shapley_r2(s[target].values.astype(float), s[p2].astype(float))
    return out


def segmentation(d, k_range=(3, 4, 5), seed=20261101):
    from sklearn.cluster import KMeans
    from sklearn.metrics import silhouette_score
    aw = d[d["segment"] != "unaware"].copy()
    feats = ["Q08_s", "Q09_s", "Q10_s", "Q22_s", "Q24_s", "NPS"]
    X = aw[feats].astype(float)
    dk = X.isna().sum(axis=1)
    core = aw[dk <= 1].copy()
    Xc = X.loc[core.index].apply(lambda c: c.fillna(c.median()))
    Xs = (Xc - Xc.mean()) / Xc.std()
    best = None
    for k in k_range:
        km = KMeans(n_clusters=k, n_init=20, random_state=seed).fit(Xs)
        sil = silhouette_score(Xs, km.labels_)
        if best is None or sil > best[1]:
            best = (k, sil, km.labels_)
    k, sil, lab = best
    core["cluster"] = lab
    order = core.groupby("cluster")["Q09_s"].mean().sort_values(ascending=False).index.tolist()
    core["cluster"] = core["cluster"].map({c: i + 1 for i, c in enumerate(order)})
    seg = pd.Series(index=aw.index, dtype=object)
    seg.loc[core.index] = core["cluster"].astype(int).astype(str)
    seg = seg.fillna("U")                                         # «Αβέβαιοι»: ≥ 2 «δεν ξέρω» στα βασικά
    profiles = []
    for c, sub in aw.groupby(seg):
        p = {"cluster": c, "n": int(len(sub)), "share_of_aware_pct": round(100 * len(sub) / len(aw), 1)}
        for f in feats:
            p[f] = round(float(sub[f].mean()), 2) if sub[f].notna().any() else None
        p["customers_pct"] = round(100 * float((sub["segment"] == "customer").mean()), 1)
        p["familiar_pct"] = round(100 * float(sub["Q04"].isin(["3", "4"]).mean()), 1)
        for col in ("age3", "gender_l", "region4", "edu3", "inc3"):
            p[col] = {k2: round(100 * v, 1) for k2, v in sub[col].value_counts(normalize=True).items()}
        p["problem_pct_of_customers"] = round(100 * float((sub.loc[sub["segment"] == "customer", "Q15"] == "1").mean()), 1) if (sub["segment"] == "customer").any() else None
        p["Q34_top"] = sub["Q34"].dropna().map(str).value_counts(normalize=True).round(3).head(3).to_dict()
        p["Q30_top"] = pd.Series([x for v in sub["Q30"].dropna() for x in v]).value_counts().div(max(sub["Q30"].notna().sum(), 1)).round(3).head(4).to_dict()
        profiles.append(p)
    return {"k": int(k), "silhouette": round(float(sil), 3), "features": feats, "n_aware": int(len(aw)), "n_clustered": int(len(core)),
            "profiles": profiles}, seg


def multi_rank(d, qid, opts, by=None):
    base = d[d[qid].notna()]
    def one(sub):
        n = len(sub)
        cnt = pd.Series([c for v in sub[qid] for c in v]).value_counts()
        return {"n_base": n, **{c: round(100 * cnt.get(c, 0) / n, 1) if n else None for c in opts}}
    out = {"Σύνολο": one(base)}
    if by:
        for g, sub in base.groupby(by):
            out[g] = one(sub)
    return out


def run(run_id, out_dir):
    st = Study(STUDY)
    qn = st.qn
    lab = labels(qn)
    w, long = load(st, run_id)
    d = derive(w, qn)
    out_dir.mkdir(parents=True, exist_ok=True)
    A = {"label": SYNTH, "run_id": run_id, "n_completes": int(len(d)), "labels": lab}
    A["sample"] = {c: d[c].value_counts().to_dict() for c in ("age_band", "gender", "region", "education", "income_quintile", "household_type", "settlement",
                                                              "segment_l", "familiarity", "age3", "region4", "edu3", "inc3")}
    A["topline"] = topline(d, lab)
    metrics = ["Q08_s", "Q09_s", "Q10_s", "Q22_s", "Q24_s", "NPS"]
    A["brand_by"] = {c: metric_by(d[d["segment"] != "unaware"], c, metrics) for c, _ in BREAKS}
    A["awareness_by"] = []
    for c, _ in BREAKS[1:]:
        for g, sub in d.groupby(c):
            A["awareness_by"].append({"break": c, "group": g, "n": int(len(sub)), "aware_pct": round(100 * float((sub["Q04"] != "1").mean()), 1),
                                      "familiar_pct": round(100 * float(sub["Q04"].isin(["3", "4"]).mean()), 1),
                                      "customer_pct": round(100 * float((sub["segment"] == "customer").mean()), 1),
                                      "bought_any_pct": round(100 * float((sub["Q01"] == "1").mean()), 1)})
    # χοάνη μάρκας (βάση: όλοι οι ερωτώμενοι)
    n = len(d)
    A["funnel"] = [{"step": "Γνωρίζουν την αλυσίδα", "pct": round(100 * float((d["Q04"] != "1").mean()), 1)},
                   {"step": "Γνωρίζουν αρκετά / πολύ καλά", "pct": round(100 * float(d["Q04"].isin(["3", "4"]).mean()), 1)},
                   {"step": "Αγόρασαν τους τελευταίους 24 μήνες", "pct": round(100 * float((d["segment"] == "customer").mean()), 1)},
                   {"step": "Θετική εικόνα (4–5)", "pct": round(100 * float((d["Q08_s"] >= 4).sum() / n), 1)},
                   {"step": "Εμπιστεύονται πολύ / πάρα πολύ", "pct": round(100 * float((d["Q09_s"] >= 4).sum() / n), 1)},
                   {"step": "Πιθανή επόμενη επιλογή (4–5)", "pct": round(100 * float((d["Q24_s"] >= 4).sum() / n), 1)},
                   {"step": "Υποστηρικτές (σύσταση 9–10)", "pct": round(100 * float((d["NPS"] >= 9).sum() / n), 1)}]
    # crosstabs: όλες οι ερωτήσεις × βασικές διασπάσεις
    xt = []
    for qid, m in lab.items():
        if qid not in d or qid.startswith("D"):
            continue
        multi = m["type"] in ("multiple_choice", "multi")
        for c, _ in BREAKS:
            xt += crosstab_q(d, qid, c, m["options"], multi)
    A["tests"] = {f"{qid}|{c}": chi2(d, qid, c) for qid in ["Q04", "Q05", "Q08", "Q09", "Q10", "Q12", "Q22", "Q24", "Q26", "Q27", "Q28", "Q29", "Q31", "Q32", "Q33", "Q34"]
                  for c, _ in BREAKS if qid in d}
    A["correlations"] = spearman(d, ["Q08_s", "Q09_s", "Q10_s", "Q12_s", "Q13_s", "Q22_s", "Q24_s", "NPS", "Q28_s", "Q29_s", "Q31_s"])
    A["drivers"] = drivers(d)
    # εμπειρία πελατών
    cu = d[d["segment"] == "customer"]
    A["cx"] = {"n_customers": int(len(cu)),
               "channel": dist(cu["Q06"], lab["Q06"]["options"]), "category": dist(cu["Q07"], lab["Q07"]["options"]),
               "on_time_pct_of_applicable": round(100 * float(cu["on_time"].mean()), 1) if cu["on_time"].notna().any() else None,
               "problem_pct": round(100 * float((cu["Q15"] == "1").mean()), 1) if len(cu) else None,
               "contacted_pct_of_problem": round(100 * float((cu.loc[cu["Q15"] == "1", "Q17"] == "1").mean()), 1) if (cu["Q15"] == "1").any() else None,
               "by_channel": metric_by(cu, "Q06", ["Q12_s", "Q13_s", "Q09_s", "on_time"]) if len(cu) else [],
               "by_exp_group": metric_by(cu, "exp_group", ["Q09_s", "Q08_s", "Q24_s", "NPS", "Q20_s"]) if len(cu) else [],
               "trust_by_delivery": metric_by(cu, "Q14", ["Q09_s", "Q12_s", "Q24_s"]) if len(cu) else [],
               "trust_change_by_recovery": [{"recovery": g, "n": int(len(s)), **dist(s["Q20"], lab["Q20"]["options"])} for g, s in cu[cu["Q15"] == "1"].groupby("recovery")],
               "emotion_by_recovery": [{"recovery": g, "n": int(len(s)), **dist(s["Q21"], lab["Q21"]["options"])} for g, s in cu[cu["Q15"] == "1"].groupby("recovery")],
               "problem_types_by_channel": multi_rank(cu[cu["Q15"] == "1"], "Q16", lab["Q16"]["options"], "Q06") if (cu["Q15"] == "1").any() else {}}
    # μη πελάτες έναντι πελατών
    A["cust_vs_non"] = metric_by(d[d["segment"] != "unaware"], "segment_l", metrics + ["Q28_s", "Q29_s", "Q31_s"])
    A["by_familiarity"] = metric_by(d[d["segment"] != "unaware"], "familiarity", metrics)
    A["competition"] = {"Q22_by_segment": crosstab_q(d, "Q22", "segment_l", lab["Q22"]["options"]),
                        "Q23": multi_rank(d, "Q23", lab["Q23"]["options"], "segment_l"),
                        "Q26_by_NPS": crosstab_q(d[d["NPS_cat"].notna()], "Q26", "NPS_cat", lab["Q26"]["options"]),
                        "Q26_by_segment": crosstab_q(d, "Q26", "segment_l", lab["Q26"]["options"])}
    A["csr"] = {"Q27_by_segment": crosstab_q(d, "Q27", "segment_l", lab["Q27"]["options"]),
                "Q28_vs_Q29": pd.crosstab(d["Q28_s"], d["Q29_s"]).to_dict() if d["Q28_s"].notna().any() else {},
                "trust_by_Q27": metric_by(d[d["segment"] != "unaware"], "Q27", ["Q09_s", "Q08_s"]),
                "Q29_by_Q28": metric_by(d, "Q28", ["Q29_s"]),
                "Q29_by_segment": metric_by(d, "segment_l", ["Q28_s", "Q29_s"]),
                "Q29_by_exp": metric_by(cu, "exp_group", ["Q28_s", "Q29_s"]) if len(cu) else []}
    A["recovery"] = {"Q30": multi_rank(d, "Q30", lab["Q30"]["options"], "segment_l"),
                     "Q30_by_problem": multi_rank(cu, "Q30", lab["Q30"]["options"], "exp_group") if len(cu) else {},
                     "Q33_by_segment": crosstab_q(d, "Q33", "segment_l", lab["Q33"]["options"]),
                     "Q32_by_age": crosstab_q(d, "Q32", "age3", lab["Q32"]["options"]),
                     "Q31_by_segment": metric_by(d, "segment_l", ["Q31_s"]),
                     "Q34_by_segment": crosstab_q(d, "Q34", "segment_l", lab["Q34"]["options"]),
                     "Q34_by_exp": crosstab_q(cu, "Q34", "exp_group", lab["Q34"]["options"]) if len(cu) else []}
    A["importance"] = {"Q03": multi_rank(d, "Q03", lab["Q03"]["options"], "age3"), "Q11": multi_rank(d, "Q11", lab["Q11"]["options"], "segment_l")}
    seg, segcol = segmentation(d)
    A["segmentation"] = seg
    d["cluster"] = segcol
    # αποθήκευση
    keep = [c for c in d.columns if not c.endswith("_s")]
    wide = d[keep].copy()
    for c in wide.columns:
        wide[c] = wide[c].map(lambda v: "|".join(v) if isinstance(v, list) else v)
    wide.insert(0, "data_status", SYNTH)
    wide.to_csv(out_dir / "respondents_wide.csv", encoding="utf-8")
    tl = [{"data_status": SYNTH, "question_id": q, "question": lab[q]["text"], "n_base": t["n_base"], **r} for q, t in A["topline"].items() for r in t["rows"]]
    pd.DataFrame(tl).to_csv(out_dir / "topline.csv", index=False)
    x = pd.DataFrame(xt)
    x.insert(0, "data_status", SYNTH)
    x.to_csv(out_dir / "crosstabs.csv", index=False)
    (out_dir / "analysis.json").write_text(json.dumps(A, ensure_ascii=False, indent=1, default=lambda o: o.item() if hasattr(o, "item") else str(o)), encoding="utf-8")
    return A, d


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--run", required=True)
    ap.add_argument("--out")
    a = ap.parse_args()
    out = Path(a.out) if a.out else STUDY / "internal" / "runs" / a.run / "analysis"
    A, d = run(a.run, out)
    print(json.dumps({"n": A["n_completes"], "out": str(out), "segments": A["sample"]["segment_l"], "k": A["segmentation"]["k"]}, ensure_ascii=False))
