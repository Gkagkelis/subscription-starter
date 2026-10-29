"""
PHASE5 — αξιολόγηση μεταφοράς στην ελληνική ΑΝΑΠΤΥΞΗ (PHASE5_PREREGISTRATION §3–§10). Κλειδωμένες ελληνικές γραμμές: ποτέ.

Στάδια:
  families   οικογένειες ισοδυναμίας κάθε ελληνικού στόχου (παράφραση ≥ 0,85, ίδιο Κ, συνεπές επιμέρους θέμα, ή ίδια μεταβλητή
             στην ίδια σειρά ερευνών) σε όλη τη διεθνή βάση ΚΑΙ στην ελληνική βάση· τομέας κάθε στόχου (πρωτότυπα, §6).
  eval       μοντέλα χωρίς καμία ελληνική απάντηση στην εκπαίδευση (C: ALS ανά τάξη/ridge· pool· B: k-NN χωρών)·
             η Ελλάδα «μπαίνει» με fold-in από τις ορατές στήλες κάθε καθεστώτος:
               Rminus  καμία ελληνική στήλη
               R0      ελληνικές στήλες ΑΛΛΩΝ ερευνών (χωρίς τις οικογένειες των items της έρευνας-στόχου)
               Rminus+m / R0+m   + m ∈ {5,10,20} items της ίδιας έρευνας (σταθερή σειρά hash· οι στόχοι είναι ίδιοι σε όλα)
             + δεσμευμένες αποκλίσεις (ridit) ανά ηλικία/φύλο/μόρφωση και συσχετίσεις ζευγών (μόνο R0).

  python3 -I scripts/synthetic-lab/persona/gbt_eval.py --root . families
  python3 -I scripts/synthetic-lab/persona/gbt_eval.py --root . eval --out <json>
"""
import argparse
import hashlib
import json
import os
import sys

import numpy as np

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import gbt  # noqa: E402

N_CAL = 20
# έρευνες με κοινούς ερωτώμενους: όταν η μία είναι στόχος, οι ελληνικές στήλες της άλλης κρύβονται επίσης
OVERLAP = {"efsa2025": {"eb1033"}, "eb1033": {"efsa2025"}, "maple_w12": {"maple_w34"}, "maple_w34": {"maple_w12"}}
M_GRID = (5, 10, 20)
RANKS = (0, 1, 2, 3, 5, 8)
LAMS = (1.0, 10.0)
KS = (3, 5, 10, 20)

DOMAIN_PROTOTYPES = {
    "POLITICAL": ["trust in parliament, the government, politicians and political parties", "satisfaction with democracy", "left-right political self-placement",
                  "interest in politics", "corruption in public institutions", "εμπιστοσύνη στη Βουλή και στην κυβέρνηση", "ικανοποίηση από τη δημοκρατία"],
    "ECONOMIC": ["economic situation of the country and household finances", "expectations for the economy next year", "job security, unemployment, income",
                 "difficulty paying bills, savings, inflation and prices of living", "οικονομική κατάσταση του νοικοκυριού", "προσδοκίες για την οικονομία"],
    "CONSUMER": ["buying food and products, shopping, supermarkets", "price, quality, brand and labels when purchasing", "consumer protection and product safety",
                 "food safety risks and trust in food producers and retailers", "αγορές προϊόντων και τροφίμων", "τιμή και ποιότητα κατά την αγορά"],
    "MEDIA_TECH": ["watching television, listening to radio, reading newspapers", "use of the internet, social media and online platforms", "mobile phone, technology and artificial intelligence",
                   "trust in the media and news sources", "χρήση διαδικτύου και κοινωνικών δικτύων", "τηλεόραση και ενημέρωση"],
    "SOCIAL": ["religion, family and traditional values", "immigrants, minorities and social trust", "health, wellbeing and happiness", "science, vaccines and doctors",
               "risks, safety and worries in daily life", "θρησκεία, οικογένεια και αξίες", "υγεία και ευημερία"],
}


def gdir(root):
    return gbt.root_dir(root)


def load_all(root):
    sv = gbt.load_surveys(root)
    stats, items = {}, {}
    for sid in sv:
        p = os.path.join(gdir(root), "stats", f"{sid}.json")
        if os.path.exists(p):
            stats[sid] = json.load(open(p))
            items[sid] = gbt.load_items(root, sid)
    return sv, stats, items


def hord(x):
    return hashlib.sha256(x.encode()).hexdigest()


def families(root):
    import embed
    from eval_unseen import OptVecs, scale_sim, split_spec

    sv, stats, items = load_all(root)
    bank = json.load(open(os.path.join(root, ".synthetic-lab-data", "persona", "harmonized", "item_bank.json")))
    allg = [dict(it, survey=sid) for sid in items for it in items[sid]]
    E = embed.Embedder(root)
    OV = OptVecs(E)
    Vg = E.encode([embed.item_text(it) for it in allg])
    Vb = E.encode([embed.item_text(b) for b in bank])
    sg = [split_spec(it["text"])[1] for it in allg]
    sb = [split_spec(b["text"])[1] for b in bank]
    us = sorted({x for x in sg + sb if x})
    SV = dict(zip(us, E.encode(us))) if us else {}
    P = [E.encode(v) for v in DOMAIN_PROTOTYPES.values()]  # ανά τομέα: k × 384
    dnames = list(DOMAIN_PROTOTYPES)

    def spec_ok(a, b):
        if (a is None) != (b is None):
            return False
        return a is None or float(SV[a] @ SV[b]) >= 0.8

    dom_all = {}
    for i, it in enumerate(allg):
        dom_all[it["id"]] = dnames[int(np.argmax([float((Pd @ Vg[i]).max()) for Pd in P]))]
    json.dump(dom_all, open(os.path.join(gdir(root), "domains_all.json"), "w"))
    out = {}
    targets = [i for i, it in enumerate(allg) if "GR" in stats[it["survey"]]["items"].get(it["id"], {}) and not it.get("excludedFromTransfer")]
    for i in targets:
        it = allg[i]
        K = len(it["options"])
        fam_g = set()
        sims = Vg @ Vg[i]
        for j in np.where(sims >= 0.85)[0]:
            o = allg[j]
            if len(o["options"]) == K and spec_ok(sg[i], sg[j]):
                ss, _ = scale_sim(OV(it), OV(o)) if K == len(o["options"]) else (1, 1)
                if ss >= 0.8:
                    fam_g.add(o["id"])
        fam_g |= {o["id"] for o in allg if o["var"] == it["var"] and gbt_family(o["survey"]) == gbt_family(it["survey"])}
        fam_b = set()
        sb_ = Vb @ Vg[i]
        for j in np.where(sb_ >= 0.85)[0]:
            if len(bank[j]["options"]) == K and spec_ok(sg[i], sb[j]):
                fam_b.add(bank[j]["id"])
        dsc = np.array([float((Pd @ Vg[i]).max()) for Pd in P])
        out[it["id"]] = {"survey": it["survey"], "type": it["type"], "K": K, "domain": dnames[int(np.argmax(dsc))], "domainScores": np.round(dsc, 3).tolist(),
                         "famGlobal": sorted(fam_g), "famBank": sorted(fam_b), "text": it["text"][:160]}
    json.dump(out, open(os.path.join(gdir(root), "families.json"), "w"), ensure_ascii=False)
    from collections import Counter

    print(len(out), "ελληνικοί στόχοι ανάπτυξης", Counter(v["domain"] for v in out.values()))


def gbt_family(sid):
    for f in ("ess", "eb", "efsa", "wrp", "wgm", "qog", "maple"):
        if sid.startswith(f):
            return f
    return sid


def ridit_gap_err(pred, truth):
    ks = [k for k in truth if k in pred]
    return float(np.mean([abs(pred[k] - truth[k]) for k in ks])) if ks else None


def evaluate(root, out_path):
    sv, stats, items = load_all(root)
    fams = json.load(open(os.path.join(gdir(root), "families.json")))
    dom_all = json.load(open(os.path.join(gdir(root), "domains_all.json")))
    itemmeta = {it["id"]: dict(it, survey=sid) for sid in items for it in items[sid]}
    res = {"targets": [], "gaps": [], "corr": [], "config": {"ranks": RANKS, "lams": LAMS, "ks": KS, "m": M_GRID, "nCal": N_CAL}}
    for adj in (True, False):
        countries, cols, Z, N = gbt.build_matrix(stats, items, use_adj=adj)
        ci = {c: i for i, c in enumerate(countries)}
        gr = ci.get("GR")
        col_of = {}
        for j, c in enumerate(cols):
            col_of.setdefault(c["item"], []).append(j)
        mask_all = ~np.isnan(Z)
        mask_f = mask_all.copy()
        if gr is not None:
            mask_f[gr] = False  # ΚΑΜΙΑ ελληνική απάντηση στην εκπαίδευση
        fits = {}
        for r in RANKS:
            for lam in (LAMS if r else (1.0,)):
                fits[(r, lam)] = gbt.als(Z, mask_f, r, lam)
                print("fit", adj, r, lam, flush=True)
        foreign = [i for i, c in enumerate(countries) if c != "GR"]
        # στόχοι ανά έρευνα
        by_s = {}
        for tid, f in fams.items():
            by_s.setdefault(f["survey"], []).append(tid)
        for sid, tids in by_s.items():
            order = sorted(tids, key=hord)
            cal_all, tgt = order[:N_CAL], order[N_CAL:]
            if len(tgt) < 5:
                continue
            hide = set()
            for t in tids:
                hide |= set(fams[t]["famGlobal"])
            blocked = {sid} | OVERLAP.get(sid, set())
            gr_other = [j for j in range(len(cols)) if gr is not None and mask_all[gr, j] and cols[j]["survey"] not in blocked and cols[j]["item"] not in hide]
            regimes = {"Rminus": []}
            regimes["R0"] = gr_other
            for m in M_GRID:
                calc = [j for t in cal_all[:m] for j in col_of.get(t, []) if mask_all[gr, j]]
                regimes[f"Rminus+{m}"] = calc
                regimes[f"R0+{m}"] = gr_other + calc
            # αποστάσεις Ελλάδας–χωρών ανά καθεστώς (μία φορά ανά έρευνα)
            dist_cache, dist_dom = {}, {}
            for rg in ("R0",):
                vis = np.array(regimes[rg], dtype=int)
                for dname in DOMAIN_PROTOTYPES:
                    vd = vis[np.array([dom_all.get(cols[j]["item"]) == dname for j in vis], dtype=bool)] if len(vis) else vis
                    d = []
                    if len(vd) >= 10:
                        for i in foreign:
                            o = vd[mask_all[i, vd]]
                            if len(o) >= 10:
                                d.append((float(np.sqrt(np.mean((Z[i, o] - Z[gr, o]) ** 2))), i))
                    d.sort()
                    dist_dom[dname] = d
            for rg, vis in regimes.items():
                vis = np.array(vis, dtype=int)
                d = []
                if len(vis) >= 10 and gr is not None:
                    for i in foreign:
                        o = vis[mask_all[i, vis]]
                        if len(o) >= 10:
                            d.append((float(np.sqrt(np.mean((Z[i, o] - Z[gr, o]) ** 2))), i))
                d.sort()
                dist_cache[rg] = d
            for t in tgt:
                js = col_of.get(t)
                if not js or gr is None:
                    continue
                meta = itemmeta[t]
                K = len(meta["options"])
                truth = np.array(stats[sid]["items"][t]["GR"]["p"])
                have = [i for i in foreign if all(mask_all[i, j] for j in js)]
                if len(have) < 3:
                    continue
                rec = {"item": t, "survey": sid, "adj": adj, "domain": fams[t]["domain"], "type": meta["type"], "K": K,
                       "nGR": stats[sid]["items"][t]["GR"]["n"], "nCountries": len(have), "truth": np.round(truth * 100, 2).tolist(), "pred": {}}
                zp = np.nanmean(Z[np.ix_(have, js)], axis=0)
                pool = gbt.from_cols(zp, meta["type"], K)
                rec["pred"]["pool"] = pool
                disp = np.std([gbt.from_cols(Z[i, js], meta["type"], K) for i in have], axis=0)
                rec["countryDispersion"] = np.round(disp * 100, 2).tolist()
                hset = set(have)
                for rg, vis in regimes.items():
                    vis = np.array(vis, dtype=int)
                    for (r, lam), (m_, U, V) in fits.items():
                        if r == 0:
                            continue
                        u = gbt.fold_in(Z[gr, vis], V[vis], m_[vis], lam) if len(vis) else np.zeros(r)
                        z = m_[js] + V[js] @ u
                        rec["pred"][f"C{r}_{int(lam)}|{rg}"] = gbt.from_cols(z, meta["type"], K)
                    # B: k-NN χωρών με απόσταση στις ορατές ελληνικές στήλες
                    if len(vis) >= 10:
                        d = [x for x in dist_cache[rg] if x[1] in hset]
                        for k in KS:
                            nb = d[:k]
                            if len(nb) < 2:
                                continue
                            w = np.array([1 / max(x, 0.05) ** 2 for x, _ in nb])
                            z = np.average(Z[np.ix_([i for _, i in nb], js)], axis=0, weights=w)
                            rec["pred"][f"B{k}|{rg}"] = gbt.from_cols(z, meta["type"], K)
                            if k == 5 and rg == "R0":
                                rec["neighbors"] = [countries[i] for _, i in nb]
                            if k == 5 and rg.startswith("R0+"):
                                # διόρθωση από τα m ελληνικά items βαθμονόμησης (συρρίκνωση m/(m+5))
                                mm = int(rg.split("+")[1])
                                calc = [j for t2 in cal_all[:mm] for j in col_of.get(t2, []) if mask_all[gr, j]]
                                nbi = [i for _, i in nb]
                                res_ = [Z[gr, j] - np.nanmean([Z[i, j] for i in nbi if mask_all[i, j]]) for j in calc
                                        if any(mask_all[i, j] for i in nbi)]
                                if res_:
                                    off = float(np.mean(res_)) * mm / (mm + 5)
                                    rec["pred"][f"B5off|{rg}"] = gbt.from_cols(z + off, meta["type"], K)
                    if rg == "R0":
                        dd = [x for x in dist_dom.get(fams[t]["domain"], []) if x[1] in hset]
                        for k in (5, 10):
                            nb = dd[:k]
                            if len(nb) >= 2:
                                w = np.array([1 / max(x, 0.05) ** 2 for x, _ in nb])
                                z = np.average(Z[np.ix_([i for _, i in nb], js)], axis=0, weights=w)
                                rec["pred"][f"Bdom{k}|R0"] = gbt.from_cols(z, meta["type"], K)
                    # συνδυασμοί B5 + C
                    for r in (1, 2, 3):
                        cb = rec["pred"].get(f"B5|{rg}")
                        cc = rec["pred"].get(f"C{r}_10|{rg}")
                        if cb is not None and cc is not None:
                            rec["pred"][f"E{r}|{rg}"] = (np.asarray(cb) + np.asarray(cc)) / 2
                rec["mae"] = {k: round(float(np.mean(np.abs(np.asarray(v) * 100 - truth * 100))), 3) for k, v in rec["pred"].items()}
                if adj:
                    rec["countryMAE"] = {countries[i]: round(float(np.mean(np.abs(gbt.from_cols(Z[i, js], meta["type"], K) * 100 - truth * 100))), 2) for i in have}
                rec["pred"] = {k: np.round(np.asarray(v) * 100, 2).tolist() for k, v in rec["pred"].items() if k in ("pool",) or k.endswith("|R0")}
                res["targets"].append(rec)
                # δεσμευμένες αποκλίσεις (μόνο σε μία διαδρομή: adj=True)
                if adj and meta["type"] in ("ordinal", "binary"):
                    tg = stats[sid]["items"][t]["GR"]["gaps"]
                    if tg:
                        cs = {c: stats[sid]["items"][t][c]["gaps"] for c in stats[sid]["items"][t] if c != "GR"}
                        keys = list(tg)
                        pool_g = {k: float(np.mean([g[k] for g in cs.values() if k in g])) for k in keys if any(k in g for g in cs.values())}
                        nbs = rec.get("neighbors") or []
                        nb_g = {k: float(np.mean([cs[c][k] for c in nbs if c in cs and k in cs[c]])) for k in keys if any(c in cs and k in cs[c] for c in nbs)}
                        res["gaps"].append({"item": t, "survey": sid, "domain": rec["domain"], "zero": ridit_gap_err({k: 0.0 for k in keys}, tg),
                                            "pool": ridit_gap_err(pool_g, tg), "B5": ridit_gap_err(nb_g, tg) if nb_g else None})
            # συσχετίσεις ζευγών στόχων (adj=True, R0 γείτονες)
            if adj and "GR" in stats[sid]["corr"]:
                grc = stats[sid]["corr"]["GR"]
                tset = set(tgt)
                nbmap = {r["item"]: r.get("neighbors") for r in res["targets"] if r["survey"] == sid and r["adj"]}
                for key, rgr in grc.items():
                    a, b = key.split("|")
                    if a not in tset or b not in tset:
                        continue
                    vals = [stats[sid]["corr"][c].get(key) for c in stats[sid]["corr"] if c != "GR"]
                    vals = [v for v in vals if v is not None]
                    if len(vals) < 3:
                        continue
                    nbs = nbmap.get(a) or []
                    nv = [stats[sid]["corr"][c].get(key) for c in nbs if c in stats[sid]["corr"] and stats[sid]["corr"][c].get(key) is not None]
                    res["corr"].append({"pair": key, "survey": sid, "domain": fams[a]["domain"], "truth": rgr, "zero": abs(rgr), "pool": abs(rgr - float(np.mean(vals))),
                                        "B5": abs(rgr - float(np.mean(nv))) if nv else None})
        print("adj", adj, "targets", sum(1 for r in res["targets"] if r["adj"] == adj), flush=True)
    json.dump(res, open(out_path, "w"))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("cmd", choices=["families", "eval"])
    ap.add_argument("--out", default=None)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    if a.cmd == "families":
        families(root)
    else:
        evaluate(root, a.out or os.path.join(gdir(root), "eval-dev.json"))


if __name__ == "__main__":
    main()
