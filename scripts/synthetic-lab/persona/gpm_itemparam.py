"""
PHASE6 Part E — πρόβλεψη παραμέτρων ΝΕΑΣ ερώτησης από το κείμενο (χωρίς ελληνικές απαντήσεις της).

Ανά έρευνα (ανάπτυξη): μοντέλο GPM k=5 χωρίς την ερώτηση-στόχο. Οι φορτίσεις της ερώτησης προβλέπονται από τις
k_nn πλησιέστερες ερωτήσεις κατά ενσωμάτωση κειμένου (βάρη = ομοιότητα). Μέτρο: πρόβλεψη των συσχετίσεων της νέας ερώτησης
με όλες τις άλλες ερωτήσεις της έρευνας.
  (α) «τι μετρά»: συσχέτιση πρόβλεψης–πραγματικού στο |r| (κατεύθυνση αγνοείται)
  (β) «πόσο έντονα»: MAE στο |r|
  (γ) με πρόσημο: MAE στο r (πρόσημο από τους γείτονες· άγνωστη πολικότητα = πηγή σφάλματος)
Γραμμές βάσης: μηδέν (ανεξαρτησία)· μέσος όρος |r| της έρευνας (για το β). Το κατώφλι (επίπεδο) ΔΕΝ προβλέπεται εδώ.

  python3 -I scripts/synthetic-lab/persona/gpm_itemparam.py --root . --out <json>
"""
import argparse
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gpm_core as GC  # noqa: E402

SURVEYS = ["dn2017", "dn2024a", "ess11", "eb1013", "undpolar2022"]


def corr_matrix(Z):
    M = ~np.isnan(Z)
    Zc = np.where(M, Z, 0.0)
    n = M.T.astype(float) @ M.astype(float)
    sxy, sx, sxx = Zc.T @ Zc, Zc.T @ M.astype(float), (Zc ** 2).T @ M.astype(float)
    with np.errstate(invalid="ignore", divide="ignore"):
        cov = sxy / n - (sx / n) * (sx.T / n)
        vx = sxx / n - (sx / n) ** 2
        return cov / np.sqrt(vx * vx.T), n


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--out", required=True)
    ap.add_argument("--targets", type=int, default=25)
    ap.add_argument("--knn", type=int, default=5)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    R, X, meta = GC.load_grim(root)
    import embed
    import hashlib

    E = embed.Embedder(root)
    fam_of = {m["col"]: m["link"] for m in meta}
    blocks = GC.survey_blocks(R, X, meta, surveys=set(SURVEYS))
    out = {}
    for s in SURVEYS:
        b = blocks[s]
        cols = [int(c) for c in b["cols"]]
        Rm, Nm = corr_matrix(b["Z"])
        T = E.encode([embed.clean(meta[c]["text"]) + " | " + " / ".join(meta[c]["options"][:5]) for c in cols])
        tg = sorted(range(len(cols)), key=lambda i: hashlib.sha256(meta[cols[i]]["id"].encode()).hexdigest())[: a.targets]
        res = []
        for i in tg:
            keep = [j for j in range(len(cols)) if j != i]
            sub = {s: dict(b, Z=b["Z"][:, keep], cols=np.array([cols[j] for j in keep]))}
            m = GC.fit_blocks(sub, {c: f"{s}:{c}" for c in cols}, 5, lam=1.0, iters=60, seed=0)
            fidx = {f: k for k, f in enumerate(m["fams"])}
            V = np.array([m["V"][fidx[f"{s}:{cols[j]}"]] for j in keep])
            sims = T[keep] @ T[i]
            nn = np.argsort(-sims)[: a.knn]
            w = np.clip(sims[nn], 1e-3, None)
            v_new = (w[:, None] * V[nn]).sum(axis=0) / w.sum()
            var = np.array([np.nanvar(b["Z"][:, j]) for j in keep])
            sd_j = np.sqrt(np.maximum(var, (V ** 2).sum(axis=1)))
            sd_new = np.sqrt(max(float(v_new @ v_new), float(np.mean(var[nn]))))  # η διασπορά της νέας ερώτησης δεν είναι γνωστή
            pred = V @ v_new / (sd_j * sd_new)
            real = np.array([Rm[i, j] for j in keep])
            ok = np.isfinite(real) & (np.array([Nm[i, j] for j in keep]) >= 200)
            if ok.sum() < 10:
                continue
            r, p = real[ok], np.clip(pred[ok], -1, 1)
            res.append({"item": meta[cols[i]]["id"], "nnSim": float(sims[nn].mean()),
                        "corrAbs": float(np.corrcoef(np.abs(r), np.abs(p))[0, 1]) if np.std(p) > 0 else 0.0,
                        "maeAbs": float(np.mean(np.abs(np.abs(r) - np.abs(p)))), "maeAbs_meanBaseline": float(np.mean(np.abs(np.abs(r) - np.abs(r).mean()))),
                        "maeSigned": float(np.mean(np.abs(r - p))), "maeSigned_zero": float(np.mean(np.abs(r)))})
        if res:
            out[s] = {"targets": len(res), **{k: round(float(np.mean([x[k] for x in res])), 4) for k in res[0] if k != "item"}}
            print(s, out[s], flush=True)
    json.dump(out, open(a.out, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
