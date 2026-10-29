"""
PHASE5 — ανάλυση της ανάπτυξης (gbt_eval.py + gbt_iqge_a.py): επιλογή διαμόρφωσης με leave-one-survey-out, σύγκριση με βάσεις
ανά τομέα, καμπύλη μάθησης (ελληνική πληροφορία), αρνητική μεταφορά, προσαρμογή σύνθεσης, υποομάδες, συσχετίσεις.

  python3 scripts/synthetic-lab/persona/gbt_report.py --root . [--eval eval-dev.json] [--a iqge-a-dev.json] [--out report.json]
"""
import argparse
import json
import os
import sys
from collections import Counter, defaultdict

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gbt  # noqa: E402

REGIME_GROUPS = ["Rminus", "R0", "Rminus+5", "Rminus+10", "Rminus+20", "R0+5", "R0+10", "R0+20"]


def boot(d, n=3000, seed=3, cluster=None):
    d = np.asarray(d, dtype=float)
    if len(d) < 3:
        return None
    rng = np.random.default_rng(seed)
    if cluster is None:
        bs = [rng.choice(d, len(d)).mean() for _ in range(n)]
    else:
        cl = np.asarray(cluster)
        u = np.unique(cl)
        idx = {c: np.where(cl == c)[0] for c in u}
        bs = []
        for _ in range(n):
            pick = rng.choice(u, len(u))
            bs.append(np.concatenate([d[idx[c]] for c in pick]).mean())
    return [round(float(np.quantile(bs, 0.1)), 3), round(float(np.quantile(bs, 0.9)), 3)]


def loso_select(T, regime):
    """Για κάθε έρευνα: επιλογή διαμόρφωσης (C/B με το καθεστώς) με το μικρότερο μέσο MAE στις ΑΛΛΕΣ έρευνες."""
    cfgs = sorted({k for r in T for k in r["mae"] if k.endswith("|" + regime)})
    if not cfgs:
        return {}
    surveys = sorted({r["survey"] for r in T})
    by_s = defaultdict(list)
    for r in T:
        by_s[r["survey"]].append(r)
    sel = {}
    for s in surveys:
        other = [r for r in T if r["survey"] != s]
        best = min(cfgs, key=lambda c: np.mean([r["mae"].get(c, 99) for r in other]))
        sel[s] = best
    return sel


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--eval", default=None)
    ap.add_argument("--a", default=None)
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    gd = gbt.root_dir(root)
    E = json.load(open(a.eval or os.path.join(gd, "eval-dev.json")))
    A = json.load(open(a.a or os.path.join(gd, "iqge-a-dev.json")))
    rep = {}
    for adj in (True, False):
        T = [r for r in E["targets"] if r["adj"] == adj and r["item"] in A]
        for r in T:
            t = np.array(r["truth"])
            r["mae"]["A"] = float(np.mean(np.abs(np.array(A[r["item"]]["A"]) - t)))
            r["mae"]["unif"] = float(np.mean(np.abs(100 / r["K"] - t)))
            sc = A[r["item"]]["scale"]
            r["mae"]["scale"] = float(np.mean(np.abs(np.array(sc) - t))) if sc else None
        out = {"n": len(T), "surveys": sorted({r["survey"] for r in T}), "regimes": {}}
        for rg in REGIME_GROUPS:
            sel = loso_select(T, rg)
            if not sel:
                continue
            for r in T:
                r["mae"][f"SEL|{rg}"] = r["mae"].get(sel.get(r["survey"]))
            out["regimes"][rg] = {"selected": Counter(sel.values()).most_common(5)}
        # σύγκριση ανά τομέα για τα βασικά καθεστώτα
        for rg in ("Rminus", "R0", "R0+10"):
            key = f"SEL|{rg}"
            dom = {}
            for d in sorted({r["domain"] for r in T}) + ["ALL"]:
                rs = [r for r in T if (d == "ALL" or r["domain"] == d) and r["mae"].get(key) is not None]
                if not rs:
                    continue
                line = {"n": len(rs), "surveys": len({r["survey"] for r in rs})}
                for m in ("unif", "scale", "A", "pool", key):
                    v = [r["mae"][m] for r in rs if r["mae"].get(m) is not None]
                    line[m.split("|")[0] if m != key else "transfer"] = {"mean": round(float(np.mean(v)), 2), "median": round(float(np.median(v)), 2),
                                                                         "p90": round(float(np.quantile(v, 0.9)), 2), "worst": round(float(np.max(v)), 2), "cov": round(len(v) / len(rs) * 100, 1)}
                # έναντι της καλύτερης βάσης (ανά τομέα, επιλογή της βάσης με το μικρότερο μέσο στο ίδιο σύνολο)
                bases = {m: np.mean([r["mae"][m] for r in rs]) for m in ("A", "pool", "unif") if all(r["mae"].get(m) is not None for r in rs)}
                bb = min(bases, key=bases.get)
                diff = [r["mae"][key] - r["mae"][bb] for r in rs]
                line["bestBaseline"] = bb
                line["vsBest"] = {"diff": round(float(np.mean(diff)), 3), "ci80_cluster": boot(diff, cluster=[r["survey"] for r in rs]),
                                  "beats": round(float(np.mean([x < 0 for x in diff])) * 100, 1)}
                dA = [r["mae"][key] - r["mae"]["A"] for r in rs]
                line["vsA"] = {"diff": round(float(np.mean(dA)), 3), "ci80_cluster": boot(dA, cluster=[r["survey"] for r in rs]),
                               "negTransferRate": round(float(np.mean([x > 1.0 for x in dA])) * 100, 1)}
                # ανά έρευνα: πού κερδίζει
                per = {}
                for s in sorted({r["survey"] for r in rs}):
                    q = [r for r in rs if r["survey"] == s]
                    per[s] = {"n": len(q), "transfer": round(float(np.mean([r["mae"][key] for r in q])), 2), "A": round(float(np.mean([r["mae"]["A"] for r in q])), 2),
                              "pool": round(float(np.mean([r["mae"]["pool"] for r in q])), 2), "unif": round(float(np.mean([r["mae"]["unif"] for r in q])), 2)}
                line["bySurvey"] = per
                dom[d] = line
            out[f"domains|{rg}"] = dom
        # καμπύλη μάθησης (ALL)
        out["learningCurve"] = {rg: round(float(np.mean([r["mae"][f"SEL|{rg}"] for r in T if r["mae"].get(f"SEL|{rg}") is not None])), 3)
                                for rg in REGIME_GROUPS if any(r["mae"].get(f"SEL|{rg}") is not None for r in T)}
        out["learningCurve"]["A"] = round(float(np.mean([r["mae"]["A"] for r in T])), 3)
        out["learningCurve"]["pool"] = round(float(np.mean([r["mae"]["pool"] for r in T])), 3)
        # χώρες-γείτονες (B5|R0) ανά τομέα και ζημιά ανά χώρα (μέσο MAE B5 − A όταν η χώρα είναι γείτονας)
        use = defaultdict(Counter)
        harm = defaultdict(list)
        for r in T:
            for c in r.get("neighbors") or []:
                use[r["domain"]][c] += 1
                if r["mae"].get("B5|R0") is not None:
                    harm[(r["domain"], c)].append(r["mae"]["B5|R0"] - r["mae"]["A"])
        out["neighbors"] = {d: cnt.most_common(10) for d, cnt in use.items()}
        out["countryHarm"] = sorted([{"domain": d, "country": c, "n": len(v), "meanDiffVsA": round(float(np.mean(v)), 2)} for (d, c), v in harm.items() if len(v) >= 15],
                                    key=lambda x: -x["meanDiffVsA"])[:25]
        rep["adj" if adj else "raw"] = out
    # υποομάδες και συσχετίσεις
    for name, key in (("gaps", "gaps"), ("corr", "corr")):
        rows = E[key]
        d = {}
        for dm in sorted({r["domain"] for r in rows}) + ["ALL"]:
            rs = [r for r in rows if dm == "ALL" or r["domain"] == dm]
            line = {"n": len(rs)}
            for m in ("zero", "pool", "B5"):
                v = [r[m] for r in rs if r.get(m) is not None]
                if v:
                    line[m] = round(float(np.mean(v)), 4)
            v2 = [(r["pool"] - r["zero"]) for r in rs if r.get("pool") is not None]
            line["pool-zero_ci80"] = boot(v2, cluster=[r["survey"] for r in rs if r.get("pool") is not None])
            d[dm] = line
        rep[name] = d
    rep["adjVsRaw"] = {rg: (rep["adj"]["learningCurve"].get(rg), rep["raw"]["learningCurve"].get(rg)) for rg in rep["adj"]["learningCurve"]}
    p = a.out or os.path.join(gd, "report-dev.json")
    json.dump(rep, open(p, "w"), ensure_ascii=False, indent=1)
    print(json.dumps({"learningCurve_adj": rep["adj"]["learningCurve"], "learningCurve_raw": rep["raw"]["learningCurve"]}, ensure_ascii=False, indent=1))
    for rg in ("Rminus", "R0", "R0+10"):
        print(f"\n== {rg} (adj)")
        for dm, l in rep["adj"].get(f"domains|{rg}", {}).items():
            print(f"{dm:11s} n={l['n']:4d} s={l['surveys']:2d} transfer {l['transfer']['mean']:5.2f} | A {l['A']['mean']:5.2f} | pool {l['pool']['mean']:5.2f} | unif {l['unif']['mean']:5.2f}"
                  f" | vsBest({l['bestBaseline']}) {l['vsBest']['diff']:+.2f} {l['vsBest']['ci80_cluster']} | vsA {l['vsA']['diff']:+.2f} neg {l['vsA']['negTransferRate']}%")
    print("\ngaps", json.dumps(rep["gaps"], ensure_ascii=False))
    print("corr", json.dumps(rep["corr"], ensure_ascii=False))


if __name__ == "__main__":
    main()
