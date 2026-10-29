"""
Αξιολόγηση σε ΑΝΕΞΑΡΤΗΤΑ ατομικά δεδομένα με ρητή, προκαταγεγραμμένη αντιστοίχιση (sprint 10/2026).

  python3 scripts/synthetic-lab/persona/eval_holdout.py --spec config/synthetic-lab/persona/eval/demotec-validation.json --variant v0|c3 [--seeds 5]

Ροή: εκπαίδευση με cutoff της προδιαγραφής → πρόσωπα από τον δημογραφικό σκελετό του holdout → απαντήσεις → ΚΛΕΙΔΩΜΑ (sha256)
→ μόνο μετά ανάγνωση των πραγματικών απαντήσεων και μετρικές.
Παραλλαγές: v0 = όπως το pie-0.2 · c3 = + χρονική ενημέρωση επιπέδου από Eurobarometer (temporal.py).
"""
import argparse
import hashlib
import json
import os
import subprocess
import sys
import time

import numpy as np
import pandas as pd

sys.path.insert(0, os.path.dirname(__file__))
import pie  # noqa: E402
import sprint  # noqa: E402
import temporal  # noqa: E402
from eval_persona import demo_model, wdist, wspearman  # noqa: E402

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
HZ = os.path.join(ROOT, ".synthetic-lab-data", "persona", "harmonized")
SKEL = ["age_band", "gender", "edu3", "nuts1", "urban"]


def train(spec, tag):
    ver = f"eval-sprint-{tag}"
    out = os.path.join(ROOT, ".synthetic-lab-data", "persona", "models", "eval", ver)
    if not os.path.exists(os.path.join(out, "items.json")):
        cmd = [sys.executable, os.path.join(os.path.dirname(__file__), "train.py"), "--root", ROOT, "--cutoff", spec["cutoff"], "--version", ver,
               "--lam", str(spec.get("lam", 3.0)), "--out", out, "--families", spec["families"]] + (["--battery-cov"] if spec.get("batteryCov") else []) \
            + (["--latent", spec["latent"]] if spec.get("latent") else [])
        subprocess.run(cmd, check=True, capture_output=True)
    return json.load(open(os.path.join(out, "model.json"))), {t["id"]: t for t in json.load(open(os.path.join(out, "items.json")))}


def ridit(x, w):
    """Ridit (μέση θέση στην κατανομή του ίδιου του συνόλου, 0–1)· NaN μένει NaN."""
    x = np.asarray(x, dtype=float)
    out = np.full(len(x), np.nan)
    ok = ~np.isnan(x)
    if ok.sum() == 0:
        return out
    vals = np.unique(x[ok])
    tot = w[ok].sum()
    cum = 0.0
    for v in vals:
        m = ok & (x == v)
        p = w[m].sum() / tot
        out[m] = cum + p / 2
        cum += p
    return out


def joint2x2_tvd(r1, r2, wr, s1, s2, ws):
    """TVD των πινάκων 2×2 (διχοτόμηση κάθε μεταβλητής στη δική της σταθμισμένη διάμεσο) πραγματικών vs συνθετικών."""
    def tab(a, b, w):
        ha = ridit(a, w) > 0.5
        hb = ridit(b, w) > 0.5
        t = np.array([w[(ha == i) & (hb == j)].sum() for i in (0, 1) for j in (0, 1)])
        return t / t.sum()
    return 0.5 * float(np.abs(tab(r1, r2, wr) - tab(s1, s2, ws)).sum())


def battery_consistency(cols, w):
    """Λόγος πρώτης ιδιοτιμής και Cronbach α (σε ridit) για μια μπαταρία."""
    X = np.column_stack([ridit(c, w) for c in cols])
    ok = ~np.isnan(X).any(axis=1)
    X = X[ok]
    if len(X) < 100:
        return None
    R = np.corrcoef(X, rowvar=False)
    ev = np.linalg.eigvalsh(R)
    m = R.shape[0]
    rbar = (R.sum() - m) / (m * (m - 1))
    return {"eig1_share": round(float(ev[-1] / m), 4), "alpha": round(float(m * rbar / (1 + (m - 1) * rbar)), 4), "mean_r": round(float(rbar), 4)}


def pd_num(a):
    import pandas as pd
    return pd.to_numeric(pd.Series(a, dtype=object), errors="coerce").values.astype(float)


def cum_shift(dist, delta, positive_low):
    """B_ebshift: περιθώριο πηγής μετατοπισμένο (αναλογικά odds) κατά δ στο logit — χωρίς πρόσωπα."""
    c = np.cumsum(dist)[:-1].clip(1e-6, 1 - 1e-6)
    lg = np.log(c / (1 - c)) + (delta if positive_low else -delta)
    c2 = 1 / (1 + np.exp(-lg))
    return np.diff(np.concatenate([[0], c2, [1]]))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--spec", required=True)
    ap.add_argument("--variant", choices=["v0", "c3", "c3b", "c7", "bind", "e1", "e2"], required=True)
    ap.add_argument("--seeds", type=int, default=5)
    ap.add_argument("--tag", default=None)
    ap.add_argument("--verbose", action="store_true")
    ap.add_argument("--model-dir", default=None, help="αξιολόγηση ΥΠΑΡΧΟΝΤΟΣ μοντέλου (π.χ. έκδοσης προς κυκλοφορία)· απορρίπτεται αν κάποια πηγή είναι μεταγενέστερη του cutoff")
    a = ap.parse_args()
    spec = json.load(open(os.path.join(ROOT, a.spec) if not os.path.isabs(a.spec) else a.spec))
    tag = a.tag or f"{spec['holdout']}-{spec['cutoff']}"
    if a.variant == "c7":
        spec["batteryCov"] = True
        tag += "-c7"
    if a.variant in ("e1", "e2"):  # PHASE3 §3: πολυχορικός εκτιμητής (E1) + ιεραρχικό λανθάνον ανά έννοια (E2)
        spec["latent"] = a.variant
        tag += f"-{a.variant}"
    if a.model_dir:
        md = os.path.join(ROOT, a.model_dir) if not os.path.isabs(a.model_dir) else a.model_dir
        model = json.load(open(os.path.join(md, "model.json")))
        late = [(x["fileId"], x["wave"]) for x in model["sources"] if x["wave"] > spec["cutoff"]]
        if late or spec["holdout"] in {x["fileId"] for x in model["sources"]}:
            sys.exit(f"Άρνηση: το μοντέλο περιέχει πηγές μετά το cutoff ή το ίδιο το holdout: {late}")
        items = {t["id"]: t for t in json.load(open(os.path.join(md, "items.json")))}
    else:
        model, items = train(spec, tag)
    real = pie.read_resp(os.path.join(HZ, "resp", f"{spec['holdout']}.csv.gz"))
    w = real["weight"].values.astype(float)
    skel = real[[c for c in SKEL if c in real]].copy()
    series = temporal.eb_trust_series(ROOT) if a.variant == "c3" else {}
    shifts = {}
    prepared = []
    for m in spec["items"]:
        t = items.get(m["target"])
        if t is None:
            prepared.append((m, None))
            continue
        if a.variant == "c3" and m.get("series") in series:
            sh = temporal.shift_for(series[m["series"]], t["wave"], spec["refMonth"])
            if sh:
                shifts[m["hold"]] = sh
                t = temporal.apply_shift(t, sh["deltaProbit"], m.get("positiveLowCodes", True))
        if a.variant == "c3b":
            t, why = temporal.incumbent_recode(t, spec["refMonth"], json.load(open(os.path.join(ROOT, "config/synthetic-lab/persona/incumbents.json")))["periods"])
            if why:
                shifts[m["hold"]] = {"recode": why}
        prepared.append((m, t))
    # ---------------- ΠΡΟΒΛΕΨΕΙΣ (χωρίς ανάγνωση πραγματικών απαντήσεων)
    syn = []
    for s in range(a.seeds):
        rng = np.random.default_rng(5000 + s)
        P = pie.generate_anchors(model, skel, rng)
        fac = a.variant != "bind"  # B_ind: κάθε ερώτηση ανεξάρτητα (χωρίς λανθάνοντα χαρακτηριστικά)
        cmodel = model if fac else None
        ans = {m["hold"]: pie.answer_item(t, P, np.random.default_rng(7000 + 13 * s + i), factors=fac, model=cmodel) for i, (m, t) in enumerate(prepared) if t is not None}
        for j, am in enumerate(spec.get("assocItems", [])):
            if am["target"] in items:
                ans["assoc:" + am["hold"]] = pie.answer_item(items[am["target"]], P, np.random.default_rng(9000 + 17 * s + j), factors=fac, model=cmodel)
        anc = {c: P[c].values for c in ("polint4", "econ4", "lr7", "lr_none", "pv", "emp", "believer") if c in P}
        syn.append({"ans": ans, "anc": anc})
    lock = hashlib.sha256(json.dumps([{k: v.tolist() for k, v in d["ans"].items()} for d in syn], sort_keys=True, default=str).encode()).hexdigest()
    lockedAt = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    # ---------------- ΒΑΘΜΟΛΟΓΗΣΗ
    rows = []
    groups = {g: real[g].values for g in ("age_band", "gender", "edu3") if g in real}
    syn_codes = {}
    syn_all = {}
    for m, t in prepared:
        if t is None:
            rows.append({"item": m["hold"], "status": "target_missing"})
            continue
        hcodes = list(m["map"].keys())
        tcodes = [m["map"][h] for h in hcodes]
        rc = real[m["hold"]].astype(str).where(real[m["hold"]].notna(), None)
        ok = rc.isin(hcodes).values
        truth = wdist(rc.values[ok], w[ok], hcodes)
        dists = []
        for d in syn:
            x = d["ans"][m["hold"]]
            okk = np.isin(x, tcodes)
            dists.append(wdist(x[okk], w[okk], tcodes))
        pie_d = np.mean(dists, axis=0)
        src_codes = [o["code"] for o in items[m["target"]]["options"]]
        last = np.array(items[m["target"]]["observed"], dtype=float) / 100.0
        last = np.array([last[src_codes.index(c)] for c in tcodes])
        dm = demo_model(items[m["target"]], ROOT)
        Z, _ = pie.design(pie.feature_columns(skel), dm["feats"], np.array(dm["means"]))
        Pm = pie.ordinal_probs(Z, dm["model"]) if dm["model"]["kind"] == "ordinal" else pie.mnl_probs(Z, dm["model"])
        bprod = np.average(Pm, axis=0, weights=w)
        bprod = np.array([bprod[src_codes.index(c)] for c in tcodes])
        row = {"item": m["hold"], "target": m["target"], "kind": m["kind"], "n": int(ok.sum()),
               "truth": np.round(truth * 100, 1).tolist(), "PIE_dist": np.round(pie_d * 100, 1).tolist(),
               "PIE": float(np.mean(np.abs(truth - pie_d)) * 100), "PIE_TVD": float(0.5 * np.sum(np.abs(truth - pie_d)) * 100),
               "PIE_signed_pos": float((pie_d[:2].sum() - truth[:2].sum()) * 100) if len(truth) >= 4 else None,
               "seed_sd_max": float(np.max(np.std(np.array(dists), axis=0)) * 100),
               "B_last": float(np.mean(np.abs(truth - last)) * 100), "B_prod": float(np.mean(np.abs(truth - bprod)) * 100),
               "B_unif": float(np.mean(np.abs(truth - 1 / len(hcodes))) * 100)}
        if m["hold"] in shifts and "recode" in shifts[m["hold"]]:
            row["recode"] = shifts[m["hold"]]["recode"]
        elif m["hold"] in shifts:
            row["shift"] = shifts[m["hold"]]
            row["B_ebshift"] = float(np.mean(np.abs(truth - cum_shift(last, shifts[m["hold"]]["deltaLogit"], m.get("positiveLowCodes", True)))) * 100)
        sub = []
        for g, gv in groups.items():
            for val in set(v for v in gv if isinstance(v, str)):
                gm = (gv == val)
                if (gm & ok).sum() < 80:
                    continue
                tg = wdist(rc.values[ok & gm], w[ok & gm], hcodes)
                pg = np.mean([wdist(d["ans"][m["hold"]][gm & np.isin(d["ans"][m["hold"]], tcodes)], w[gm & np.isin(d["ans"][m["hold"]], tcodes)], tcodes) for d in syn], axis=0)
                sub.append(float(np.mean(np.abs(tg - pg)) * 100))
        row["PIE_subgroup"] = float(np.mean(sub)) if sub else None
        rows.append(row)
        rank = {c: i for i, c in enumerate(tcodes)}
        syn_codes[m["hold"]] = (np.array([rank.get(v, np.nan) for v in syn[0]["ans"][m["hold"]]], dtype=float),
                                np.array([hcodes.index(v) if v in hcodes else np.nan for v in rc.values], dtype=float))
    # άγκυρες· σύμπτυξη λεπτομερών κατηγοριών του μοντέλου στις κατηγορίες σύγκρισης (διόρθωση βαθμολόγησης 28/10:
    # πριν, οι εργαζόμενοι ανά τομέα και τα μικρά κόμματα δεν μετρούσαν σε καμία κατηγορία)
    COLLAPSE = {"emp": {k: "employed" for k in ("private_emp", "public_emp", "self_emp", "farmer")},
                "pv": {k: "other" for k in ("el", "mera25", "xa", "plefsi", "ek", "niki", "spartiates", "foni_logikis", "anel", "potami",
                                             "laos", "lae", "dimar", "antarsya", "nea_aristera", "blank")}}
    for an in spec.get("anchors", []):
        c = an["hold"]
        if c not in real or c not in syn[0]["anc"]:
            continue
        _n = lambda v: None if v is None or v != v else (str(int(float(v))) if isinstance(v, (int, float)) or str(v).replace('.', '', 1).isdigit() else str(v))  # noqa: E731
        norm_ = lambda v, _c=COLLAPSE.get(c, {}): (lambda x: _c.get(x, x) if x is not None else None)(_n(v))  # noqa: E731
        allowed = an.get("categories")
        rv_all = np.array([norm_(v) for v in real[c].values], dtype=object)
        cats = allowed or sorted(set(v for v in rv_all if v is not None))
        okr = np.array([v in cats for v in rv_all])
        truth = wdist(rv_all[okr], w[okr], cats)
        dists = []
        for d in syn:
            sv = np.array([norm_(v) for v in d["anc"][c]], dtype=object)
            oks = np.array([v in cats for v in sv])
            dists.append(wdist(sv[oks], w[oks], cats))
        pie_d = np.mean(dists, axis=0)
        rows.append({"item": f"anchor:{c}", "kind": an["kind"], "n": int(okr.sum()), "categories": cats, "truth": np.round(truth * 100, 1).tolist(), "PIE_dist": np.round(pie_d * 100, 1).tolist(),
                     "PIE": float(np.mean(np.abs(truth - pie_d)) * 100), "PIE_TVD": float(0.5 * np.sum(np.abs(truth - pie_d)) * 100),
                     "B_unif": float(np.mean(np.abs(truth - 1 / len(cats))) * 100)})
        if not an.get("nominal"):
            syn_codes[f"anchor:{c}"] = (pd_num(syn[0]["anc"][c]), pd_num(real[c].values))
    # L-R: μόνο τάξη
    lr_syn = np.where(syn[0]["anc"].get("lr_none", np.zeros(len(real))) == 1, np.nan, syn[0]["anc"].get("lr7", np.full(len(real), np.nan)).astype(float))
    lrc = spec.get("lrColumn", "demotec2022::pol_leftRight")
    lr_real = pd_num(real[lrc].values) if lrc in real else None
    for am in spec.get("assocItems", []):
        k = "assoc:" + am["hold"]
        if k not in syn[0]["ans"] or am["hold"] not in real:
            continue
        sv = pd_num(syn[0]["ans"][k]) * am.get("sign", 1)
        syn_codes[am["hold"]] = (sv, pd_num(real[am["hold"]].values))
        syn_all.setdefault(am["hold"], [pd_num(d["ans"][k]) * am.get("sign", 1) for d in syn])
    if lr_real is not None:
        syn_codes["lr"] = (lr_syn, lr_real)
        syn_all.setdefault("lr", [np.where(d["anc"].get("lr_none", np.zeros(len(real))) == 1, np.nan, d["anc"].get("lr7", np.full(len(real), np.nan)).astype(float)) for d in syn])
    # συσχετίσεις (τάξης) — πραγματικές vs συνθετικές, ίδια ζεύγη (συνθετικά: μέσος όρος σπόρων όπου υπάρχουν)
    keys = list(syn_codes)
    pairs = []
    for i in range(len(keys)):
        for j in range(i + 1, len(keys)):
            (s1, r1), (s2, r2) = syn_codes[keys[i]], syn_codes[keys[j]]
            okr = ~np.isnan(r1) & ~np.isnan(r2)
            oks = ~np.isnan(s1) & ~np.isnan(s2)
            if okr.sum() < 200 or oks.sum() < 200:
                continue
            rr = wspearman(r1[okr], r2[okr], w[okr])
            if keys[i] in syn_all and keys[j] in syn_all:
                vals = []
                for x1, x2 in zip(syn_all[keys[i]], syn_all[keys[j]]):
                    o = ~np.isnan(x1) & ~np.isnan(x2)
                    vals.append(wspearman(x1[o], x2[o], w[o]))
                rs = float(np.mean(vals))
            else:
                rs = wspearman(s1[oks], s2[oks], w[oks])
            j2 = joint2x2_tvd(r1[okr], r2[okr], w[okr], s1[oks], s2[oks], w[oks])
            same = {k: next((am.get("battery") for am in spec.get("assocItems", []) if am["hold"] == k), None) for k in (keys[i], keys[j])}
            ptype = "same_battery" if same[keys[i]] and same[keys[i]] == same[keys[j]] else "other"
            pairs.append({"a": keys[i], "b": keys[j], "real": round(rr, 3), "syn": round(rs, 3), "joint2x2_tvd": round(j2, 4), "type": ptype})
    # R3: δεσμευμένη απόκλιση (ridit) ανά ομάδα· R4: συνοχή μπαταρίας
    gcols = {g: real[g].values for g in spec.get("groups", ["age_band", "gender", "edu3"]) if g in real}
    cond = []
    for k, (sv, rv) in syn_codes.items():
        rr_ = ridit(rv, w)
        ss_ = ridit(sv, w)
        for g, gv in gcols.items():
            for lev in [x for x in pd.unique(gv) if isinstance(x, str)]:
                m_ = gv == lev
                okr, oks = m_ & ~np.isnan(rr_), m_ & ~np.isnan(ss_)
                if okr.sum() < 60 or oks.sum() < 60:
                    continue
                dr = np.average(rr_[okr], weights=w[okr]) - np.nanmean(rr_)
                ds = np.average(ss_[oks], weights=w[oks]) - np.nanmean(ss_)
                cond.append({"q": k, "group": g, "level": lev, "real_gap": round(float(dr), 4), "syn_gap": round(float(ds), 4)})
    batt = {}
    for am in spec.get("assocItems", []):
        if am.get("battery") and am["hold"] in syn_codes:
            batt.setdefault(am["battery"], []).append(am["hold"])
    latent = {}
    for b, ks in batt.items():
        if len(ks) < 2:
            continue
        latent[b] = {"real": battery_consistency([syn_codes[k][1] for k in ks], w), "syn": battery_consistency([syn_codes[k][0] for k in ks], w), "items": len(ks)}
    est = [r for r in rows if "PIE" in r and not r["item"].startswith("anchor:")]
    summ = {
        "items": len(est), "anchors": len([r for r in rows if r["item"].startswith("anchor:")]),
        "marginal_MAE": {k: round(float(np.mean([r[k] for r in est])), 3) for k in ("PIE", "B_last", "B_prod", "B_unif") if est and all(k in r for r in est)},
        "anchor_MAE": round(float(np.mean([r["PIE"] for r in rows if r["item"].startswith("anchor:")])), 3) if any(r["item"].startswith("anchor:") for r in rows) else None,
        "subgroup_MAE": round(float(np.mean([r["PIE_subgroup"] for r in est if r.get("PIE_subgroup") is not None])), 3) if est else None,
        "assoc_abs_err": round(float(np.mean([abs(p["real"] - p["syn"]) for p in pairs])), 4) if pairs else None,
        "assoc_sign_agree_|r|>0.1": round(float(np.mean([np.sign(p["real"]) == np.sign(p["syn"]) for p in pairs if abs(p["real"]) > 0.1])), 3) if pairs else None,
        "pairs": len(pairs), "seed_sd_max": round(float(max(r["seed_sd_max"] for r in est)), 3) if est else None,
        "R1_by_type": {t: round(float(np.mean([abs(p["real"] - p["syn"]) for p in pairs if p["type"] == t])), 4) for t in ("same_battery", "other") if any(p["type"] == t for p in pairs)},
        "R3_cond_ridit_err": round(float(np.mean([abs(c["real_gap"] - c["syn_gap"]) for c in cond])), 4) if cond else None,
        "R4_latent": latent,
        "R5_joint2x2_tvd": round(float(np.mean([abs(p["joint2x2_tvd"]) for p in pairs])), 4) if pairs else None,
    }
    if any("B_ebshift" in r for r in est):
        summ["marginal_MAE"]["B_ebshift"] = round(float(np.mean([r.get("B_ebshift", r["B_last"]) for r in est])), 3)
    res = {"spec": a.spec, "variant": a.variant, "model": model["version"], "modelSnapshot": model["dataSnapshot"], "cutoff": spec["cutoff"],
           "predictionsLockSha256": lock, "lockedAt": lockedAt, "summary": summ, "rows": rows, "pairs": pairs, "conditional": cond}
    out = os.path.join(ROOT, ".synthetic-lab-data", "persona", "sprint", f"holdout-{spec['holdout']}-{a.variant}" + (f"-{model['version']}" if a.model_dir else "") + ".json")
    json.dump(res, open(out, "w"), ensure_ascii=False, indent=1, default=float)
    print(json.dumps(summ, ensure_ascii=False))
    for r in rows:
        if "PIE" in r:
            print(f"  {r['item'][:48]:48s} PIE {r['PIE']:5.2f}  last {r.get('B_last', float('nan')):5.2f}  prod {r.get('B_prod', float('nan')):5.2f}  eb {r.get('B_ebshift', float('nan')):5.2f}  truth {r['truth']} syn {r['PIE_dist']}")
    for p in pairs:
        if a.verbose or "lr" in (p["a"], p["b"]):
            print("  lr pair", p)


if __name__ == "__main__":
    main()
