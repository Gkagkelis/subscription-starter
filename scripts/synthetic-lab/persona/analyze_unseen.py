"""
PHASE4: ανάλυση του benchmark νέων ερωτήσεων (έξοδος eval_unseen.py).

Μοντέλο επιπέδου (G2/G3): κατανομή = w_nb·γείτονες + w_base·βάση κλίμακας + w_u·ομοιόμορφη, με βάρη ανά βαθμίδα τεκμηρίου
που μαθαίνονται ΜΟΝΟ στο αρχείο εκπαίδευσης (--fit) και εφαρμόζονται αμετάβλητα στο αρχείο αξιολόγησης (--eval).
  γείτονες   = σταθμισμένος μέσος (sim^p) των k πρώτων ανακτημένων items ίδιου Κ (προσανατολισμένων) ή ευθυγραμμισμένων επιλογών
  βάση       = B_scale (ίδιες ετικέτες) → B_scale_soft (σημασιολογικά ίδιες ετικέτες, ίδιο Κ) → ομοιόμορφη
Κανόνας «δεν εκτιμάται» (προκαταχώριση §5): απαντάμε σε μια βαθμίδα μόνο αν στο --fit το σφάλμα της ήταν μικρότερο από της βάσης κλίμακας.

  python3 scripts/synthetic-lab/persona/analyze_unseen.py --fit dev22.json --eval dev24.json [--out params.json]
"""
import argparse
import itertools
import json
import math

import numpy as np

TIERS = ("paraphrase", "related", "weak")


def mae(d, truth):
    return float(np.mean(np.abs(np.asarray(d) * 100 - np.asarray(truth))))


def unif(r):
    return np.full(r["K"], 1 / r["K"])


def base(r):
    for k in ("scale", "scalesoft"):
        if r["lev"].get(k) is not None:
            return np.array(r["lev"][k]), k
    return unif(r), "unif"


def neighbours(r, k, p, min_opt=0.0):
    """Σταθμισμένος μέσος γειτόνων· None αν δεν υπάρχει κανένας χρήσιμος."""
    ds, ws = [], []
    for e in r["nb"]:
        d = e.get("dist") if e.get("dist") is not None and e.get("optSim", 0) >= min_opt else e.get("aligned")
        if d is None:
            continue
        ds.append(np.array(d))
        ws.append(max(e["sim"], 0) ** p)
        if len(ds) >= k:
            break
    if not ds:
        return None
    ws = np.array(ws)
    return np.average(ds, axis=0, weights=ws / ws.sum())


def level(r, prm):
    t = prm["tiers"][r["tier"]]
    nb = neighbours(r, prm["k"], prm["p"], prm.get("minOpt", 0.0))
    b, _ = base(r)
    u = unif(r)
    if nb is None:
        wn, wb, wu = 0.0, t["wb"] + t["wn"], t["wu"]
    else:
        wn, wb, wu = t["wn"], t["wb"], t["wu"]
    d = wn * (nb if nb is not None else 0) + wb * b + wu * u
    return d / d.sum()


def fit(rows):
    best = None
    grid = [x / 10 for x in range(11)]
    for k, p in itertools.product((1, 3, 5, 8), (1, 4, 8)):
        prm = {"k": k, "p": p, "tiers": {}}
        tot = 0.0
        for tier in TIERS:
            rs = [r for r in rows if r["tier"] == tier]
            bt = None
            for wn in grid:
                for wb in grid:
                    if wn + wb > 1:
                        continue
                    tw = {"wn": wn, "wb": wb, "wu": round(1 - wn - wb, 2)}
                    pr = {"k": k, "p": p, "tiers": {tier: tw}}
                    e = np.mean([mae(level(r, pr), r["truth"]) for r in rs]) if rs else 0
                    if bt is None or e < bt[0]:
                        bt = (e, tw)
            prm["tiers"][tier] = bt[1]
            tot += bt[0] * len(rs)
        if best is None or tot < best[0]:
            best = (tot, prm)
    prm = best[1]
    # κανόνας αποχής ανά βαθμίδα: απάντηση μόνο αν το σφάλμα του μοντέλου < σφάλμα της βάσης κλίμακας (στο fit)
    for tier in TIERS:
        rs = [r for r in rows if r["tier"] == tier]
        em = np.mean([mae(level(r, prm), r["truth"]) for r in rs]) if rs else 99
        eb = np.mean([mae(base(r)[0], r["truth"]) for r in rs]) if rs else 0
        prm["tiers"][tier]["answer"] = bool(em < eb)
        prm["tiers"][tier]["fitMAE"] = round(float(em), 2)
        prm["tiers"][tier]["fitBaseMAE"] = round(float(eb), 2)
        # εμπειρικό 80% διάστημα σφάλματος περιθωρίου (G5): ποσοστημόρια του μέγιστου απόλυτου σφάλματος επιλογής
        errs = [float(np.max(np.abs(level(r, prm) * 100 - np.array(r["truth"])))) for r in rs]
        prm["tiers"][tier]["maxErr80"] = round(float(np.quantile(errs, 0.8)), 2) if errs else None
    return prm


# ------------------------------------------------------------------ G2b: μαθημένη «κάρτα ταιριάσματος»
FEATS = ("bias", "sim", "simQ", "simSpec", "specGap", "cover", "scaleSim", "age", "sameSeries", "sameType")


def feats(e, r):
    sim = e["sim"]
    ss = e.get("simSpec")
    return np.array([1.0, sim, e.get("simQ", sim), ss if ss is not None else sim, 0.0 if ss is None else max(sim - ss, 0.0),
                     e.get("cover", 0.0), e.get("optSim", e.get("alignSim", 0.0)), math.log1p(e.get("months", 0) / 12),
                     float(e.get("sameSeries", False)), float(e.get("type") == r["type"])])


def cands(r, k=8):
    out = []
    for e in r["nb"][:k]:
        d = e.get("dist") if e.get("dist") is not None else e.get("aligned")
        if d is not None:
            out.append((feats(e, r), np.array(d)))
    return out


def card_level(r, th, C=None):
    """κατανομή = (Σ exp(θ·f_j)·d_j + exp(c_b)·βάση + exp(c_u)·ομοιόμορφη + [exp(c_l + c_l1·conf)·lex]) / Σ βαρών"""
    C = C if C is not None else cands(r)
    b, _ = base(r)
    nf = len(FEATS)
    num = math.exp(th[nf]) * b + math.exp(th[nf + 1]) * unif(r)
    den = math.exp(th[nf]) + math.exp(th[nf + 1])
    for f, d in C:
        wj = math.exp(min(float(th[:nf] @ f), 30))
        num = num + wj * d
        den += wj
    if r["lev"].get("lex") is not None:
        wl = math.exp(min(th[nf + 2] + th[nf + 3] * (r.get("lexConf") or 0), 30))
        num = num + wl * np.array(r["lev"]["lex"])
        den += wl
    return num / den


def fit_card(rows, seed=0, l2=0.01):
    from scipy.optimize import minimize

    C = [cands(r) for r in rows]
    T = [np.array(r["truth"]) / 100 for r in rows]

    def loss(th):
        e = [np.mean(np.abs(card_level(r, th, c) - t)) for r, c, t in zip(rows, C, T)]
        return float(np.mean(e)) * 100 + l2 * float(np.sum(th[1:] ** 2))

    th0 = np.zeros(len(FEATS) + 4)
    th0[0] = -8
    best = None
    for start in range(4):
        x0 = th0 + np.random.default_rng(seed + start).normal(0, 1 if start else 0, len(th0))
        r_ = minimize(loss, x0, method="Powell", options={"maxiter": 20000, "xtol": 1e-3, "ftol": 1e-4})
        if best is None or r_.fun < best.fun:
            best = r_
    return best.x.tolist()


def methods(r, prm):
    out = {"unif": unif(r), "scale": np.array(r["lev"]["scale"]) if r["lev"].get("scale") is not None else None,
           "base": base(r)[0], "crude": r["lev"].get("crude"), "lex": r["lev"].get("lex"), "src1": r["lev"].get("src1"),
           "nb1": neighbours(r, 1, 1), "iqge": level(r, prm)}
    if prm.get("card") is not None:
        out["card"] = card_level(r, np.array(prm["card"]))
    if not prm["tiers"][r["tier"]].get("answer", True):
        out["iqge_abst"] = None
    else:
        out["iqge_abst"] = out["iqge"]
    return {k: (np.asarray(v) if v is not None else None) for k, v in out.items()}


def boot_ci(diff, n=2000, seed=1):
    rng = np.random.default_rng(seed)
    diff = np.asarray(diff)
    if len(diff) < 3:
        return None
    bs = [np.mean(rng.choice(diff, len(diff))) for _ in range(n)]
    return [round(float(np.quantile(bs, 0.1)), 2), round(float(np.quantile(bs, 0.9)), 2)]


def report(rows, prm, title):
    print(f"\n=== {title}: {len(rows)} ερωτήσεις ===")
    M = ("unif", "scale", "base", "crude", "lex", "src1", "nb1", "iqge", "iqge_abst", "card")
    table = {}
    for tier in TIERS + ("ALL",):
        rs = [r for r in rows if tier == "ALL" or r["tier"] == tier]
        if not rs:
            continue
        ms = [methods(r, prm) for r in rs]
        line = {"n": len(rs)}
        for m in M:
            e = [mae(x[m], r["truth"]) for x, r in zip(ms, rs) if x[m] is not None]
            if e:
                line[m] = {"cov": round(len(e) / len(rs) * 100, 1), "mean": round(float(np.mean(e)), 2), "median": round(float(np.median(e)), 2),
                           "p90": round(float(np.quantile(e, 0.9)), 2)}
        # ζευγαρωτές συγκρίσεις: IQGE έναντι κάθε βάσης στις ερωτήσεις όπου απαντούν και οι δύο
        for bl in ("base", "lex", "crude", "scale"):
            pairs = [(mae(x[prm.get("main", "iqge")], r["truth"]), mae(x[bl], r["truth"])) for x, r in zip(ms, rs) if x[bl] is not None]
            if pairs:
                d = [a - b for a, b in pairs]
                line[f"vs_{bl}"] = {"n": len(d), "diff": round(float(np.mean(d)), 2), "ci80": boot_ci(d), "beats": round(float(np.mean([x < 0 for x in d])) * 100, 1)}
        # έναντι της καλύτερης διαθέσιμης βάσης ανά ερώτηση (lex/crude αν απαντούν, αλλιώς βάση κλίμακας)
        d = []
        for x, r in zip(ms, rs):
            cc = [mae(x[b], r["truth"]) for b in ("base", "lex", "crude") if x[b] is not None]
            d.append(mae(x[prm.get("main", "iqge")], r["truth"]) - min(cc))
        line["vs_bestPerItem"] = {"diff": round(float(np.mean(d)), 2), "beats": round(float(np.mean([x < 0 for x in d])) * 100, 1)}
        table[tier] = line
        s = f"{tier:10s} n={len(rs):3d}"
        for m in M:
            if m in line:
                s += f" | {m} {line[m]['mean']:5.1f}/{line[m]['cov']:3.0f}%"
        print(s)
        for bl in ("base", "lex", "crude"):
            if f"vs_{bl}" in line:
                v = line[f"vs_{bl}"]
                print(f"{'':10s}   {prm.get('main', 'iqge')}−{bl}: {v['diff']:+.2f} π.μ. (80% CI {v['ci80']}), καλύτερο σε {v['beats']}% των {v['n']}")
    return table


def stemless(r):
    """Ερώτηση-μπαταρία χωρίς την εισαγωγή της (π.χ. σκέτο «Οικογένεια» από το SPSS)."""
    t = r["text"].strip()
    return len(t) < 30 and "?" not in t and ";" not in t


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--fit", required=True)
    ap.add_argument("--eval", required=True)
    ap.add_argument("--out", default=None)
    ap.add_argument("--card", action="store_true")
    ap.add_argument("--l2", type=float, default=0.01)
    ap.add_argument("--subset", choices=["all", "full", "stemless"], default="all", help="ανάλυση ευαισθησίας: στόχοι με πλήρη/ελλιπή διατύπωση")
    a = ap.parse_args()
    fr = [r for f in a.fit.split(",") for r in json.load(open(f)) if "lev" in r]
    er = [r for r in json.load(open(a.eval)) if "lev" in r]
    if a.subset != "all":
        er = [r for r in er if stemless(r) == (a.subset == "stemless")]
    prm = fit(fr)
    if a.card:
        prm["card"] = fit_card(fr, l2=a.l2)
        prm["main"] = "card"
        print("θ κάρτας:", dict(zip(list(FEATS) + ["base", "unif", "lex0", "lexConf"], np.round(prm["card"], 2))))
    print("παράμετροι (μάθηση στο fit):", json.dumps(prm, ensure_ascii=False))
    if a.card:
        # G5: εμπειρικό 80% διάστημα ανά επιλογή (ποσοστημόριο |σφάλματος| ανά βαθμίδα στο fit) και κάλυψη στο eval
        th = np.array(prm["card"])
        prm["q80"] = {}
        for tier in TIERS:
            e = [abs(x) for r in fr if r["tier"] == tier for x in (card_level(r, th) * 100 - np.array(r["truth"]))]
            prm["q80"][tier] = round(float(np.quantile(e, 0.8)), 2) if e else None
            prm["tiers"][tier]["cardFitMAE"] = round(float(np.mean([mae(card_level(r, th), r["truth"]) for r in fr if r["tier"] == tier])), 2)
        cov = {}
        for tier in TIERS:
            e = [abs(x) for r in er if r["tier"] == tier for x in (card_level(r, th) * 100 - np.array(r["truth"]))]
            cov[tier] = round(float(np.mean([x <= prm["q80"][tier] for x in e])) * 100, 1) if e else None
        prm["coverage80_eval"] = cov
        print("G5 q80 (fit):", prm["q80"], "κάλυψη 80% στο eval:", cov)
    t1 = report(fr, prm, "FIT (in-sample)")
    t2 = report(er, prm, "EVAL (εκτός δείγματος)")
    for name, rs in (("fit", json.load(open(a.fit))), ("eval", json.load(open(a.eval)))):
        for r in rs:
            if "assoc" in r:
                print(name, "R1", r)
    if a.out:
        json.dump({"params": prm, "fit": t1, "eval": t2}, open(a.out, "w"), ensure_ascii=False, indent=1)


if __name__ == "__main__":
    main()
