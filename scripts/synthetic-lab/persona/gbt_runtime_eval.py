"""
PHASE5 — επικύρωση της ΑΝΤΙΣΤΟΙΧΙΣΗΣ ελληνόφωνης ερώτησης με ισοδύναμη διεθνή ερώτηση (το πραγματικό σενάριο χρήσης:
ο πελάτης γράφει ελληνικά, η διεθνής βάση είναι κυρίως αγγλική). Ελληνικοί στόχοι ανάπτυξης: διαΝΕΟσις 2022/2024 (Phase 4),
με γνωστά πραγματικά περιθώρια. Η διεθνής βάση δεν περιέχει διαΝΕΟσις.

Κανόνες αντιστοίχισης:
  strict   ομοιότητα ≥ 0,85, ίδιο Κ, ομοιότητα κλίμακας ανά θέση ≥ 0,8 (ο κανόνας του S1)
  loose    ομοιότητα ≥ τ (0,70–0,80), ίδιο Κ, ΣΗΜΑΣΙΟΛΟΓΙΚΗ ευθυγράμμιση επιλογών (μετάθεση, Hungarian) με ελάχιστη ομοιότητα ζεύγους ≥ σ
Σύγκριση: MAE του μεταφερμένου επιπέδου έναντι του IQGE (κάρτα Phase 4) στις ίδιες ερωτήσεις, κάλυψη. Επιλογή στο 2022, έλεγχος στο 2024.

  python3 -I scripts/synthetic-lab/persona/gbt_runtime_eval.py --root . --dev22 <dev22_v4.json> --dev24 <dev24_v4.json>
"""
import argparse
import json
import os
import sys

import numpy as np
from scipy.optimize import linear_sum_assignment

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import analyze_unseen as AU  # noqa: E402
import embed  # noqa: E402
from eval_unseen import OptVecs, scale_sim, split_spec  # noqa: E402
from gbt_runtime import GlobalMatcher  # noqa: E402

TAUS = (0.70, 0.75, 0.80, 0.85)
SIGMAS = (0.5, 0.6, 0.7)


def candidates(gm, t, E, OV, sp_t):
    v = E.encode([embed.item_text(t)])[0]
    sims = gm.V @ v
    K = len(t["options"])
    At = OV(t)
    out = []
    for j in np.argsort(-sims)[:30]:
        it = gm.items[j]
        if len(it["options"]) != K or sims[j] < 0.65:
            continue
        sj = gm.spec[j]
        spec_sim = None
        if sp_t and sj:
            a, b = E.encode([sp_t, sj])
            spec_sim = float(a @ b)
        As = OV(it)
        S = At @ As.T
        r, c = linear_sum_assignment(-S)
        perm = dict(zip(r, c))
        out.append({"j": int(j), "sim": float(sims[j]), "specOk": (sp_t is None) == (sj is None) and (spec_sim is None or spec_sim >= 0.8),
                    "posScale": scale_sim(At, As), "permMin": float(S[r, c].min()), "perm": [int(perm[k]) for k in range(K)]})
    return out


def level_from(gm, cand, mode):
    it = gm.items[cand["j"]]
    lv = np.array(it["level"])
    if mode == "strict":
        return lv if cand["posScale"][1] > 0 else lv[::-1]
    return lv[cand["perm"]]


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--dev22", required=True)
    ap.add_argument("--dev24", required=True)
    ap.add_argument("--params", default="config/synthetic-lab/persona/iqge/params.json")
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    E = embed.Embedder(root)
    OV = OptVecs(E)
    gm = GlobalMatcher(root, E)
    th = np.array(json.load(open(os.path.join(root, a.params)))["card"])
    bank = {b["id"]: b for b in json.load(open(os.path.join(root, ".synthetic-lab-data/persona/harmonized/item_bank.json")))}
    res = {}
    for name, path in (("dev22", a.dev22), ("dev24", a.dev24)):
        rows = [r for r in json.load(open(path)) if "lev" in r]
        recs = []
        for r in rows:
            b = bank[r["item"]]
            t = {"text": b["text"], "options": b["options"]}
            truth = np.array(r["truth"])
            iq = AU.mae(AU.card_level(r, th), truth)
            cs = candidates(gm, t, E, OV, split_spec(b["text"])[1])
            rec = {"item": r["item"], "iqge": iq, "type": r["type"], "rules": {}}
            for c in cs:
                if c["sim"] >= 0.85 and c["specOk"] and c["posScale"][0] >= 0.8 and "strict" not in rec["rules"]:
                    rec["rules"]["strict"] = float(np.mean(np.abs(level_from(gm, c, "strict") * 100 - truth)))
            for tau in TAUS:
                for sg in SIGMAS:
                    key = f"loose{tau}_{sg}"
                    for c in cs:
                        if c["sim"] >= tau and c["specOk"] and c["permMin"] >= sg:
                            rec["rules"][key] = float(np.mean(np.abs(level_from(gm, c, "loose") * 100 - truth)))
                            rec.setdefault("basis", {})[key] = gm.items[c["j"]]["basis"]
                            break
            recs.append(rec)
        res[name] = recs
        print(f"\n== {name}: {len(recs)} ερωτήσεις, IQGE MAE {np.mean([x['iqge'] for x in recs]):.2f}")
        keys = ["strict"] + [f"loose{t}_{s}" for t in TAUS for s in SIGMAS]
        for k in keys:
            m = [x for x in recs if k in x["rules"]]
            if m:
                d = [x["rules"][k] - x["iqge"] for x in m]
                print(f"{k:14s} κάλυψη {len(m) / len(recs) * 100:5.1f}%  μεταφορά {np.mean([x['rules'][k] for x in m]):5.2f}  IQGE {np.mean([x['iqge'] for x in m]):5.2f}  διαφ. {np.mean(d):+.2f}  καλύτερο σε {np.mean([x < 0 for x in d]) * 100:4.1f}%")
    json.dump(res, open(a.out or "/dev/null", "w"))


if __name__ == "__main__":
    main()
