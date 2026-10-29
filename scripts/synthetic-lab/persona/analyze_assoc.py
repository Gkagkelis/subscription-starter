"""
PHASE4 G4b: εξασθένιση της σειράς προσώπων για νέες ερωτήσεις (συσχετίσεις μεταξύ ερωτήσεων, R1).

Για κάθε ερώτηση-στόχο υπάρχει το λανθάνον σειράς L (από τα τεκμήρια του μοντέλου, eval_unseen.py --save-latent).
Συνθετική απάντηση: z = α_tier·std(L) + √(1−α²)·ε, κατηγορίες με comonotone ανάθεση στη βάση επιπέδου.
Το α ανά βαθμίδα τεκμηρίου μαθαίνεται στο --fit και αξιολογείται στο --eval (R1, R1 ισχυρών ζευγών, συμφωνία προσήμου).

  python3 scripts/synthetic-lab/persona/analyze_assoc.py --fit dev22.json lat22.npz --eval dev24.json lat24.npz
"""
import argparse
import itertools
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(__file__))
from eval_unseen import rank_assign, wspear  # noqa: E402

GRID = [0.0, 0.2, 0.35, 0.5, 0.65, 0.8, 1.0]
TIERS = ("paraphrase", "related", "weak")


def load(js, npz):
    rows = {r["item"]: r for r in json.load(open(js)) if "lev" in r}
    Z = np.load(npz)
    items = sorted({k.split("|")[0] for k in Z.files})
    data = {}
    for i in items:
        L = Z[f"{i}|lat"].astype(float)
        data[i] = {"lat": (L - L.mean()) / (L.std() + 1e-9), "real": Z[f"{i}|real"].astype(float), "w": Z[f"{i}|w"].astype(float),
                   "pw": Z[f"{i}|pw"].astype(float), "base": Z[f"{i}|base"].astype(float), "tier": rows[i]["tier"], "file": rows[i]["file"]}
        data[i]["real"][data[i]["real"] < 0] = np.nan
    return data


def synth(d, a, seed):
    eps = np.random.default_rng(seed).standard_normal(len(d["lat"]))
    z = a * d["lat"] + np.sqrt(max(1 - a * a, 0)) * eps
    b = d["base"] / d["base"].sum()
    return rank_assign(z, d["pw"], b).astype(float)


def score(data, alpha, seed=11):
    """alpha: dict βαθμίδα → α. Επιστρέφει R1, R1 ισχυρών, συμφωνία προσήμου ισχυρών (μέσος όρος ανά αρχείο)."""
    by_file = {}
    for i, d in data.items():
        by_file.setdefault(d["file"], []).append(i)
    res = []
    for f, ids in by_file.items():
        S = {i: synth(data[i], alpha[data[i]["tier"]], seed + k) for k, i in enumerate(ids)}
        errs = []
        for x, y in itertools.combinations(ids, 2):
            w = data[x]["w"]
            rr = wspear(data[x]["real"], data[y]["real"], w)
            rs = wspear(S[x], S[y], w)
            if rr == rr and rs == rs:
                errs.append((abs(rr - rs), abs(rr), np.sign(rr) == np.sign(rs), data[x]["tier"], data[y]["tier"]))
        st = [e for e in errs if e[1] > 0.2]
        res.append({"file": f, "pairs": len(errs), "R1": float(np.mean([e[0] for e in errs])), "R1_indep": float(np.mean([e[1] for e in errs])),
                    "R1_strong": float(np.mean([e[0] for e in st])) if st else None, "R1_strong_indep": float(np.mean([e[1] for e in st])) if st else None,
                    "sign_strong": float(np.mean([e[2] for e in st])) if st else None})
    return res


def agg(res):
    return {k: round(float(np.mean([r[k] for r in res if r[k] is not None])), 4) for k in ("R1", "R1_indep", "R1_strong", "R1_strong_indep", "sign_strong")}


def fit(data):
    # συντεταγμένη κατάβαση ανά βαθμίδα στο μέσο R1 (όλα τα ζεύγη)
    alpha = {t: 1.0 for t in TIERS}
    for _ in range(2):
        for t in TIERS:
            best = None
            for a in GRID:
                cand = {**alpha, t: a}
                r = agg(score(data, cand))["R1"]
                if best is None or r < best[0]:
                    best = (r, a)
            alpha[t] = best[1]
    return alpha


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fit", nargs=2, required=True)
    ap.add_argument("--eval", nargs=2, required=True)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    F, E = load(*a.fit), load(*a.eval)
    alpha = fit(F)
    out = {"alpha": alpha}
    for name, D in (("fit", F), ("eval", E)):
        for lab, al in (("full(α=1)", {t: 1.0 for t in TIERS}), ("learned", alpha), ("indep(α=0)", {t: 0.0 for t in TIERS})):
            r = agg(score(D, al))
            out[f"{name}:{lab}"] = r
            print(f"{name:5s} {lab:11s} {r}")
    print("α ανά βαθμίδα:", alpha)
    if a.out:
        json.dump(out, open(a.out, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
