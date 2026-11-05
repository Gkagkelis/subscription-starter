"""Viewscope Benchmark v1 — Phase 7A: ανάλυση κάλυψης (μόνο ανάγνωση των κλειδωμένων αρχείων και των δεδομένων του Lab).

Για κάθε μία από τις 75 ερωτήσεις των 4 πραγματικών ελληνικών ερευνών της Phase 7A:
  * ποιες μέθοδοι απάντησαν (κλειδωμένες προβλέψεις), με ποια βαθμίδα, και αν υπάρχει πραγματικό δεδομένο ελέγχου·
  * ποια είναι τα πλησιέστερα ΥΠΑΡΧΟΝΤΑ δεδομένα του Lab (PIE pie-0.7, διεθνής βάση, data lake, δείκτες prod-1), με την ίδια
    πολυγλωσσική ανάκτηση της IQGE (paraphrase-multilingual-MiniLM, τοπικά, χωρίς δίκτυο)·
  * αυτόματη προ-ταξινόμηση της αιτίας μη κάλυψης (το τελικό κριτήριο είναι ο ρητός έλεγχος στο coverage_adjudication.csv).
"""
import json, re, sys, time
from pathlib import Path
import numpy as np, pandas as pd

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "scripts" / "synthetic-lab" / "persona"))
from embed import Embedder  # noqa: E402

OUT = ROOT / "benchmarks" / "viewscope_v1" / "results"
D = ROOT / "docs" / "synthetic-lab"
DATA = ROOT / ".synthetic-lab-data"
t0 = time.time()
surveys = json.loads((D / "PHASE7A_QUESTIONNAIRES.json").read_text(encoding="utf-8"))["surveys"]
pred = pd.read_csv(D / "PHASE7A_LOCKED_PREDICTIONS.csv")
gt = pd.read_csv(D / "PHASE7A_GROUND_TRUTH.csv")
Q = []
for s in surveys:
    for q in s["questions"]:
        Q.append({"survey": s["surveyId"], "category": s["category"], "qid": q["qid"], "type": q["type"], "text": q["text"],
                  "options": q.get("options", []), "n_options": len(q.get("options", []))})
emb = Embedder(str(ROOT))
qtxt = [f"{q['text']} {' / '.join(q['options'][:6])}" for q in Q]
EQ = emb.encode(qtxt)

def pool(texts):
    return emb.encode(texts)

# PIE pie-0.7
pie = json.loads((DATA / "persona/models/pie-0.7/items.json").read_text(encoding="utf-8"))
pie_txt = [f"{i.get('text','')} {' / '.join(str(o) for o in (i.get('options') or [])[:6])}" for i in pie]
EP = pool(pie_txt)
# διεθνής βάση: έλεγχος ότι οι αποθηκευμένες αναπαραστάσεις είναι του ίδιου μοντέλου, αλλιώς επανυπολογισμός
gi = json.loads((DATA / "global-behavior-evidence/v1/runtime/gbt-items.json").read_text(encoding="utf-8"))["items"]
EGs = np.load(DATA / "global-behavior-evidence/v1/runtime/gbt-items-emb.npy")
g_txt = [f"{i['text']} {' / '.join(o['label'] for o in i.get('options', [])[:6])}" for i in gi]
chk = pool(g_txt[:20])
same_model = float(np.mean(np.sum(chk * EGs[:20], axis=1))) > 0.97
EG = EGs if same_model else pool(g_txt)
# data lake: ερωτήσεις με πληθυσμό ατόμων (όχι επιχειρήσεων), μοναδικά κείμενα
ix = json.loads((DATA / "lake/export/lake_index.json").read_text(encoding="utf-8"))
lq = [q for q in ix["questions"] if (q.get("universe") or {}).get("kind") in ("individuals", "subpopulation", None) and "enterprise" not in (q.get("text") or "").lower()
      and "persons employed" not in (q.get("text") or "")]
seen, L = set(), []
for q in lq:
    k = (q["text"] or "")[:200]
    if k in seen: continue
    seen.add(k); L.append(q)
EL = pool([q["text"] for q in L])
# δείκτες prod-1 (NORAYA, πολιτικοί, Eurostat ΤΠΕ/SILC)
pm = []
for f in ["lib/synthetic-lab/data/noraya-priors.generated.json", "lib/synthetic-lab/data/political-priors.generated.json"]:
    for k, v in json.loads((ROOT / f).read_text(encoding="utf-8"))["metrics"].items():
        pm.append({"id": k, "text": v.get("label") or v.get("question") or k})
for f in ["lib/synthetic-lab/data/official/eurostat-ict.json", "lib/synthetic-lab/data/official/eurostat-silc.json"]:
    for v in json.loads((ROOT / f).read_text(encoding="utf-8")).get("metrics", []):
        pm.append({"id": v["metric"], "text": v.get("label") or v["metric"]})
EM = pool([p["text"] for p in pm])

def best(E, items, k=1, txt=lambda x: x):
    S = EQ @ E.T
    idx = np.argsort(-S, axis=1)[:, :k]
    return [[(items[j], float(S[i, j])) for j in idx[i]] for i in range(len(Q))]

bP, bG, bL, bM = best(EP, pie), best(EG, gi), best(EL, L), best(EM, pm)
rows = []
for i, q in enumerate(Q):
    pr = pred[(pred.survey == q["survey"]) & (pred.qid == q["qid"])]
    ans = sorted(set(pr[pr.answered == True]["method"]))  # noqa: E712
    tiers = {m: (pr[(pr.method == m) & (pr.answered == True)]["tier"].dropna().unique().tolist() or [None])[0] for m in ans}  # noqa: E712
    has_gt = bool(len(gt[(gt.survey == q["survey"]) & (gt.qid == q["qid"])]))
    p, g, l, m = bP[i][0], bG[i][0], bL[i][0], bM[i][0]
    pie_opts = len(p[0].get("options") or [])
    rows.append({"survey": q["survey"], "category": q["category"], "qid": q["qid"], "type": q["type"], "n_options": q["n_options"], "text": q["text"][:160],
                 "ground_truth": has_gt, "answered_by": ";".join(ans), "tiers": json.dumps(tiers, ensure_ascii=False),
                 "pie_best_id": p[0]["id"], "pie_best_sim": round(p[1], 3), "pie_best_text": (p[0].get("text") or "")[:120], "pie_best_n_options": pie_opts,
                 "intl_best_id": g[0]["id"], "intl_best_sim": round(g[1], 3), "intl_best_text": g[0]["text"][:120],
                 "lake_best_id": l[0]["id"], "lake_best_sim": round(l[1], 3), "lake_best_text": (l[0]["text"] or "")[:120],
                 "prod1_best_id": m[0]["id"], "prod1_best_sim": round(m[1], 3), "prod1_best_text": m[0]["text"][:100]})
df = pd.DataFrame(rows)
OUT.mkdir(parents=True, exist_ok=True)
df.to_csv(OUT / "coverage_7a_candidates.csv", index=False)
print(json.dumps({"questions": len(Q), "pie_items": len(pie), "intl_items": len(gi), "intl_same_model": same_model, "lake_questions_unique": len(L),
                  "prod1_metrics": len(pm), "seconds": round(time.time() - t0, 1)}, ensure_ascii=False))
