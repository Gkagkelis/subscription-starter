"""Viewscope Benchmark v1 — Phase 7A: μέτρηση του κενού δρομολόγησης.

Ερώτημα: αν το σύστημα είχε απλώς ΔΡΟΜΟΛΟΓΗΣΕΙ κάθε ερώτηση στην προηγούμενη ελληνική μέτρηση της ίδιας τυποποιημένης ερώτησης που
ΗΔΗ υπάρχει στο data lake, πόση κάλυψη και ακρίβεια θα είχε;
Κανόνες κατά της διαρροής: μόνο μελέτες του lake με έτος ≤ 2025 (όλες οι έρευνες ελέγχου είναι του 2026)· η FL585 δεν υπάρχει στο lake
(ελέγχθηκε)· καμία χρήση των τιμών ελέγχου στην επιλογή υποψηφίων (μόνο κείμενο ερωτήσεων/επιλογών).
Βαθμολόγηση: ίδια με τις κλειδωμένες μεθόδους (MAE π.μ. επί των επιλογών με πραγματική τιμή) — και οι υπάρχουσες μέθοδοι
ξαναβαθμολογούνται εδώ με τον ίδιο κώδικα για δίκαιη σύγκριση.
"""
import json, os, sys, time
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "synthetic-lab" / "persona"))
from embed import Embedder  # noqa: E402

D, DATA = ROOT / "docs" / "synthetic-lab", ROOT / ".synthetic-lab-data"
OUT = ROOT / "benchmarks" / "viewscope_v1" / "results"
Q_SIM, OPT_SIM, MAX_YEAR = 0.85, 0.75, 2025
t0 = time.time()
surveys = json.loads((D / "PHASE7A_QUESTIONNAIRES.json").read_text(encoding="utf-8"))["surveys"]
gt = pd.read_csv(D / "PHASE7A_GROUND_TRUTH.csv")
pred = pd.read_csv(D / "PHASE7A_LOCKED_PREDICTIONS.csv")
emb = Embedder(str(ROOT))
ix = json.loads((DATA / "lake/export/lake_index.json").read_text(encoding="utf-8"))
smap = {s["studyId"]: s for s in ix["studies"]}
pool = [q for q in ix["questions"] if q["studyId"].startswith(("eurobarometer:", "zenodo:", "harvard_dataverse:", "figshare:"))
        and max(q.get("years") or [9999]) <= MAX_YEAR and q.get("optionMetrics")]
seen, P = set(), []
for q in pool:
    k = (q["studyId"], q["text"][:160])
    if k in seen: continue
    seen.add(k); P.append(q)
EP = emb.encode([f"{q['text']} {' / '.join(q['options'][:6])}" for q in P])
shard_cache = {}
def greek_value(metric_id, study):
    sh = smap[study]["shard"]
    if sh not in shard_cache:
        shard_cache[sh] = {m["metric"]: m for m in json.loads((DATA / "lake/export/shards" / os.path.basename(sh)).read_text(encoding="utf-8"))["metrics"]}
    m = shard_cache[sh].get(metric_id)
    if not m: return None
    w = sorted(m["waves"], key=lambda x: x["year"])[-1]
    v = ((w.get("groups") or {}).get("all") or {}).get("all")
    return (v or {}).get("value")

rows, preds = [], []
for s in surveys:
    for q in s["questions"]:
        g = gt[(gt.survey == s["surveyId"]) & (gt.qid == q["qid"])]
        if not len(g) or not q.get("options"): continue
        e = emb.encode([f"{q['text']} {' / '.join(q['options'][:6])}"])[0]
        sims = EP @ e
        best = None
        for j in np.argsort(-sims)[:8]:
            if sims[j] < Q_SIM: break
            c = P[j]
            Eo, Ec = emb.encode(list(g.option)), emb.encode(c["options"])
            S = Eo @ Ec.T
            mapping = {}
            for a in np.argsort(-S.max(axis=1)):
                b = int(np.argmax(S[a]))
                if S[a, b] >= OPT_SIM and b not in mapping.values(): mapping[int(a)] = b
            cov = len(mapping) / len(g)
            if cov >= 0.6:
                best = (c, float(sims[j]), mapping, cov); break
        if not best:
            rows.append({"survey": s["surveyId"], "qid": q["qid"], "lake_prev": False}); continue
        c, sim, mapping, cov = best
        vals = {}
        for a, b in mapping.items():
            v = greek_value(c["optionMetrics"][c["options"][b]], c["studyId"])
            if v is not None: vals[g.option.iloc[a]] = v
        if q["type"] != "multi" and vals:
            tot = sum(vals.values()); vals = {k: v * 100 / tot for k, v in vals.items()} if tot > 0 else vals
        for o, v in vals.items(): preds.append({"survey": s["surveyId"], "qid": q["qid"], "option": o, "pred": v})
        rows.append({"survey": s["surveyId"], "qid": q["qid"], "lake_prev": bool(vals), "lake_study": c["studyId"], "lake_title": smap[c["studyId"]]["title"][:80],
                     "lake_year": max(c.get("years") or [None]), "q_sim": round(sim, 3), "option_coverage": round(cov, 2), "lake_question": c["text"][:120]})
cand = pd.DataFrame(rows); lp = pd.DataFrame(preds)

def mae(df_pred):
    m = gt.merge(df_pred, on=["survey", "qid", "option"], how="inner")
    return m.assign(ae=(m.observed_pct - m.pred).abs()).groupby(["survey", "qid"]).ae.mean()
res = {"LAKE_PREV": mae(lp)}
for meth in ["UNIF", "B5", "IQGE", "pie-0.6", "pie-0.7x", "pie-0.7", "PREV_SAME", "POOL"]:
    x = pred[(pred.method == meth) & (pred.answered == True)][["survey", "qid", "option", "predicted_pct"]].rename(columns={"predicted_pct": "pred"})  # noqa: E712
    res[meth] = mae(x)
tab = pd.DataFrame(res)
tab.to_csv(OUT / "phase7a_rescored_by_question.csv")
cand.to_csv(OUT / "lake_prev_candidates.csv", index=False)
summ = []
for meth, ser in res.items():
    for dom, sub in [("ALL", ser)] + [(p, ser[ser.index.get_level_values(0) == p]) for p in ["P7A-POL-01", "P7A-POL-02", "P7A-CON-01", "P7A-SOC-01"]]:
        summ.append({"method": meth, "survey": dom, "questions_answered": int(sub.notna().sum()), "MAE_pp": round(float(sub.mean()), 2) if sub.notna().any() else None})
pd.DataFrame(summ).to_csv(OUT / "phase7a_rescored_summary.csv", index=False)
# ίδιες ερωτήσεις: LAKE_PREV έναντι B5/UNIF όπου απαντούν και οι δύο
both = tab.dropna(subset=["LAKE_PREV"])
print("LAKE_PREV:", int(both.shape[0]), "ερωτήσεις ·", {m: round(float(both[m].mean()), 2) for m in ["LAKE_PREV", "B5", "UNIF", "pie-0.7x"] if both[m].notna().any()},
      "· n για B5", int(both["B5"].notna().sum()))
print(pd.DataFrame(summ).pivot(index="method", columns="survey", values="MAE_pp").to_string())
print(pd.DataFrame(summ).pivot(index="method", columns="survey", values="questions_answered").to_string())
print("δευτ.", round(time.time() - t0, 1))
