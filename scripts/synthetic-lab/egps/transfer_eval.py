"""
EGPS — Δοκιμή Α (βλ. docs/synthetic-lab/EGPS_PREREGISTRATION.md §2).

Πρόβλεψη ποσοστού και διαφορών ομάδων για δείκτη ΧΩΡΙΣ άμεση μέτρηση, μόνο από συγγενικούς δείκτες της ίδιας κατηγορίας.
Οικογένειες (σύνολα Eurostat) χωρίζονται 50/50 calibration/test (seed 20261101)· υπερπαράμετροι και διαστήματα μόνο από calibration.

Είσοδος:  .synthetic-lab-data/egps/ict.json  (scripts/synthetic-lab/egps/export_ict.ts)
Έξοδοι:   .synthetic-lab-data/egps/transfer_eval.json (αναλυτικά, ιδιωτικό)
          config/synthetic-lab/egps/transfer_params.json (παράμετροι μεταφοράς για τον πειραματικό engine· χωρίς δεδομένα)
  python scripts/synthetic-lab/egps/transfer_eval.py
"""
import json, math, os, random, re, statistics as st, unicodedata

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
IN = os.path.join(REPO, ".synthetic-lab-data", "egps", "ict.json")
OUT = os.path.join(REPO, ".synthetic-lab-data", "egps", "transfer_eval.json")
PARAMS = os.path.join(REPO, "config", "synthetic-lab", "egps", "transfer_params.json")
SPLIT_SEED, BOOT_SEED, BOOT_N = 20261101, 20261102, 2000
GROUPS = [("age_band", g) for g in ["15-24", "25-34", "35-44", "45-54", "55-64", "65+"]] + [("gender", "female"), ("gender", "male")] + [("education_group", g) for g in ["low_education", "medium_education", "high_education"]]
GRID = [0, 0.25, 0.5, 0.75, 1]
TOPK = 5
STOP = set("the of a an for to in on or and by via with from as at e g eg etc other than individuals internet use online purchases last months month 3 12 used using".split())

def logit(p):
    p = min(99.5, max(0.5, p)) / 100
    return math.log(p / (1 - p))
def inv(x):
    return 100 / (1 + math.exp(-x))
def norm_label(text):
    t = text.split(" — ", 1)[1] if " — " in text else text
    t = unicodedata.normalize("NFD", t.lower())
    t = "".join(c for c in t if unicodedata.category(c) != "Mn")
    return re.sub(r"\s+", " ", re.sub(r"[^a-z0-9α-ω ]", " ", t)).strip()
def toks(text):
    return {w for w in norm_label(text).split() if w not in STOP and len(w) > 1}
def jacc(a, b):
    return len(a & b) / len(a | b) if a | b else 0.0

def load():
    items = []
    for o in json.load(open(IN)):
        best = None
        for w in sorted(o["waves"], key=lambda w: -w["year"]):
            g = w["groups"]
            if "all" in g and all(d in g and k in g[d] and g[d][k] is not None for d, k in GROUPS):
                best = w
                break
        if not best:
            continue
        items.append({"id": o["id"], "fam": o["study"], "text": o["text"], "label": norm_label(o["text"]), "tok": toks(o["text"]), "year": best["year"],
                      "all": best["groups"]["all"]["all"], "grp": [best["groups"][d][k] for d, k in GROUPS]})
    return items

def dup(a, b):
    return a["label"] == b["label"] or jacc(a["tok"], b["tok"]) >= 0.8

def proxies(t, items):
    return [s for s in items if s["fam"] == t["fam"] and s["id"] != t["id"] and not dup(s, t)]

def features(t, items, glob_pool):
    px = proxies(t, items)
    if len(px) < 2:
        return None
    sims = sorted(((jacc(t["tok"], s["tok"]), s) for s in px), key=lambda x: -x[0])[:TOPK]
    ws = [s ** 2 for s, _ in sims]
    if sum(ws) == 0:
        ws = [1.0] * len(sims)
    lvl_sib = sum(w * logit(s["all"]) for w, (_, s) in zip(ws, sims)) / sum(ws)
    lvl_fam = st.mean(logit(s["all"]) for s in px)
    prof = [sum(w * (logit(s["grp"][i]) - logit(s["all"])) for w, (_, s) in zip(ws, sims)) / sum(ws) for i in range(len(GROUPS))]
    gpool = [logit(s["all"]) for s in glob_pool if s["id"] != t["id"] and not dup(s, t)]
    return {"sib": lvl_sib, "fam": lvl_fam, "glob": st.mean(gpool), "prof": prof, "nprox": len(px), "maxsim": sims[0][0]}

def predict(f, w, lam, beta):
    lvl = (1 - lam) * (w * f["sib"] + (1 - w) * f["fam"]) + lam * f["glob"]
    return lvl, [lvl + beta * p for p in f["prof"]]

def main():
    items = load()
    fams = {}
    for it in items:
        fams.setdefault(it["fam"], []).append(it)
    fams = {k: v for k, v in fams.items() if len(v) >= 3}
    items = [it for v in fams.values() for it in v]
    names = sorted(fams)
    rng = random.Random(SPLIT_SEED)
    rng.shuffle(names)
    cal_f, test_f = set(names[: len(names) // 2]), set(names[len(names) // 2:])
    cal = [it for it in items if it["fam"] in cal_f]
    test = [it for it in items if it["fam"] in test_f]
    F = {it["id"]: features(it, items, cal) for it in items}

    # --- calibration: w, λ (MAE συνόλου), β (ελάχιστα τετράγωνα αποκλίσεων), υπόλοιπα για διαστήματα
    calf = [it for it in cal if F[it["id"]]]
    best = None
    for w in GRID:
        for lam in GRID:
            mae = st.mean(abs(inv(predict(F[it["id"]], w, lam, 0)[0]) - it["all"]) for it in calf)
            if best is None or mae < best[0]:
                best = (mae, w, lam)
    _, W, LAM = best
    num = sum((logit(it["grp"][i]) - logit(it["all"])) * F[it["id"]]["prof"][i] for it in calf for i in range(len(GROUPS)))
    den = sum(F[it["id"]]["prof"][i] ** 2 for it in calf for i in range(len(GROUPS)))
    BETA = max(0.0, min(1.5, num / den if den else 0.0))
    res = sorted(logit(it["all"]) - predict(F[it["id"]], W, LAM, BETA)[0] for it in calf)
    gres = sorted(logit(it["grp"][i]) - predict(F[it["id"]], W, LAM, BETA)[1][i] for it in calf for i in range(len(GROUPS)))
    q = lambda xs, p: xs[min(len(xs) - 1, max(0, int(round(p * (len(xs) - 1)))))]
    Q = {"80": [q(res, 0.10), q(res, 0.90)], "95": [q(res, 0.025), q(res, 0.975)]}
    QG = {"80": [q(gres, 0.10), q(gres, 0.90)], "95": [q(gres, 0.025), q(gres, 0.975)]}
    glob_cal = st.mean(logit(it["all"]) for it in cal)

    # --- test
    rows = []
    for it in test:
        f = F[it["id"]]
        if not f:
            rows.append({"id": it["id"], "fam": it["fam"], "estimable": False, "reason": "λιγότεροι από 2 συγγενικοί δείκτες"})
            continue
        lvl, grp = predict(f, W, LAM, BETA)
        lo80, hi80 = inv(lvl + Q["80"][0]), inv(lvl + Q["80"][1])
        lo95, hi95 = inv(lvl + Q["95"][0]), inv(lvl + Q["95"][1])
        estimable = (hi80 - lo80) <= 40
        flat_fam, flat_glob = inv(f["fam"]), inv(f["glob"])
        act_dev = [logit(g) - logit(it["all"]) for g in it["grp"]]
        pr = {
            "P0": (50.0, [50.0] * len(GROUPS)),
            "P1": (inv(glob_cal), [inv(glob_cal)] * len(GROUPS)),
            "P2": (flat_fam, [flat_fam] * len(GROUPS)),
            "EGPS": (inv(lvl), [inv(x) for x in grp]),
            "EGPS_level_only": (inv(lvl), [inv(lvl)] * len(GROUPS)),
            "P2_plus_gradient": (flat_fam, [inv(f["fam"] + BETA * p) for p in f["prof"]]),
        }
        r = {"id": it["id"], "fam": it["fam"], "text": it["text"], "year": it["year"], "estimable": estimable, "actual": it["all"], "nprox": f["nprox"], "maxsim": round(f["maxsim"], 2),
             "int80": [round(lo80, 2), round(hi80, 2)], "int95": [round(lo95, 2), round(hi95, 2)],
             "cov80": lo80 <= it["all"] <= hi80, "cov95": lo95 <= it["all"] <= hi95, "width80": hi80 - lo80,
             "pred_dev": [BETA * p for p in f["prof"]], "act_dev": act_dev}
        for k, (o, g) in pr.items():
            r[f"err_{k}"] = abs(o - it["all"])
            r[f"gerr_{k}"] = st.mean(abs(a - b) for a, b in zip(g, it["grp"]))
            r[f"pred_{k}"] = round(o, 2)
        rows.append(r)
    ok = [r for r in rows if "err_EGPS" in r]
    methods = ["P0", "P1", "P2", "EGPS", "EGPS_level_only", "P2_plus_gradient"]
    summ = {m: {"M1_overall_mae": round(st.mean(r[f"err_{m}"] for r in ok), 2), "M2_group_mae": round(st.mean(r[f"gerr_{m}"] for r in ok), 2)} for m in methods}
    pd_, ad_ = [x for r in ok for x in r["pred_dev"]], [x for r in ok for x in r["act_dev"]]
    m4 = st.correlation(pd_, ad_) if len(set(pd_)) > 1 else None
    est = [r for r in ok if r["estimable"]]
    cov = {"cov80_all": round(100 * st.mean(r["cov80"] for r in ok), 1), "cov95_all": round(100 * st.mean(r["cov95"] for r in ok), 1),
           "median_width80_pp": round(st.median(r["width80"] for r in ok), 1), "n_estimable": len(est), "n_test_scored": len(ok),
           "n_not_estimable": len(rows) - len(est)}
    # bootstrap ανά οικογένεια για διαφορές EGPS − baseline
    famsT = sorted({r["fam"] for r in ok})
    brng = random.Random(BOOT_SEED)
    boot = {}
    for base in ["P0", "P1", "P2"]:
        for metric in ["err", "gerr"]:
            ds = []
            for _ in range(BOOT_N):
                pick = [brng.choice(famsT) for _ in famsT]
                rs = [r for fm in pick for r in ok if r["fam"] == fm]
                ds.append(st.mean(r[f"{metric}_EGPS"] - r[f"{metric}_{base}"] for r in rs))
            ds.sort()
            obs = st.mean(r[f"{metric}_EGPS"] - r[f"{metric}_{base}"] for r in ok)
            boot[f"{metric}_vs_{base}"] = {"diff": round(obs, 2), "ci95": [round(ds[int(0.025 * BOOT_N)], 2), round(ds[int(0.975 * BOOT_N)], 2)]}
    acc1 = all(boot[f"{m}_vs_{b}"]["ci95"][1] < 0 for m in ["err", "gerr"] for b in ["P0", "P1"])
    acc2 = summ["EGPS"]["M1_overall_mae"] <= summ["P2"]["M1_overall_mae"] + 0.5 and summ["EGPS"]["M2_group_mae"] <= summ["P2"]["M2_group_mae"] + 0.5
    acc3 = 70 <= cov["cov80_all"] <= 90 and 85 <= cov["cov95_all"] <= 99
    out = {"preregistration": "docs/synthetic-lab/EGPS_PREREGISTRATION.md §2", "n_items": len(items), "n_families": len(fams), "cal_families": sorted(cal_f), "test_families": sorted(test_f),
           "n_cal_items": len(cal), "n_test_items": len(test), "params": {"w": W, "lambda": LAM, "beta": round(BETA, 3), "topk": TOPK, "cal_mae_level": round(best[0], 2)},
           "intervals_logit": {"overall": Q, "groups": QG}, "summary": summ, "M4_gradient_corr": round(m4, 3) if m4 is not None else None, "coverage": cov, "bootstrap": boot,
           "acceptance": {"rule1_beats_P0_P1": acc1, "rule2_not_worse_than_P2": acc2, "rule3_calibrated_intervals": acc3, "model_extrapolated_capable": acc1 and acc2},
           "rows": rows}
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    json.dump(out, open(OUT, "w"), ensure_ascii=False, indent=1)
    os.makedirs(os.path.dirname(PARAMS), exist_ok=True)
    json.dump({"version": "egps-transfer-0.1", "source": "Δοκιμή Α (Eurostat ICT, Ελλάδα), μόνο calibration οικογένειες", "w": W, "lambda": LAM, "beta": round(BETA, 4), "topk": TOPK,
               "global_logit_mean_cal": round(glob_cal, 4), "intervals_logit": {"overall": Q, "groups": QG}, "notEstimable": {"minProxies": 2, "maxWidth80pp": 40},
               "acceptance": out["acceptance"], "testSummary": summ, "coverage": cov}, open(PARAMS, "w"), ensure_ascii=False, indent=1)
    print(json.dumps({k: out[k] for k in ["n_items", "n_families", "n_cal_items", "n_test_items", "params", "summary", "M4_gradient_corr", "coverage", "bootstrap", "acceptance"]}, ensure_ascii=False, indent=1))

if __name__ == "__main__":
    main()
