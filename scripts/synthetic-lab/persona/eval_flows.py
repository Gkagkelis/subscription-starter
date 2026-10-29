"""
C4 του sprint: αξιολόγηση (και εκτίμηση C4a/C4b) του μοντέλου ψήφου σε δημοσιευμένους πίνακες μετακινήσεων.
Πρωτόκολλο: SPRINT_PREREGISTRATION §6 (Τροποποίηση Α).

  python3 scripts/synthetic-lab/persona/eval_flows.py --root . --variant v0      # pie-0.2 (ecm-0.1)
  python3 scripts/synthetic-lab/persona/eval_flows.py --root . --variant c4a     # + αποχή/αναποφάσιστοι με προηγούμενη ψήφο (MAPLE 2/2019)
  python3 scripts/synthetic-lab/persona/eval_flows.py --root . --variant c4ab    # + εξασθένηση πίστης με τον χρόνο (εκτίμηση στις ροές εκπαίδευσης)

Για κάθε (δημοσκόπηση, κόμμα προέλευσης) η πρόβλεψη είναι η αναμενόμενη κατανομή των προσώπων με αυτή την προηγούμενη ψήφο:
P(αποχή) = pa, P(αναποφάσιστος) = (1 − pa)·pu, P(κόμμα j) = (1 − pa)(1 − pu)·softmax_j — ίδια σειρά με το TS runtime (answerVote).
Το σενάριο κομμάτων κάθε ημερομηνίας χτίζεται από ιστορικά γεγονότα (ίδρυση, γενεαλογία, CHES, επίσημα αποτελέσματα)· κανένα ποσοστό δημοσκόπησης.
"""
import argparse
import copy
import json
import math
import os
import sys

import numpy as np
import pandas as pd
from scipy.optimize import minimize

sys.path.insert(0, os.path.dirname(__file__))
import pie  # noqa: E402
import vote_model as vm  # noqa: E402

TRAIN_END, SELECT_END = "2023-12-31", "2026-04-30"
FROM_KEYS = ("nd", "syriza", "pasok", "kke")
# Κόμματα που ιδρύθηκαν μετά τις εκλογές βάσης: (κλειδί, μήνας ίδρυσης, γενεαλογία, τύπος γενεαλογίας, lrgen, πηγή θέσης)
FOUNDED_2023 = [
    ("nea_aristera", "2023-12", ["syriza"], "split", 1.5, "παραδοχή: διάσπαση αριστερής πτέρυγας ΣΥΡΙΖΑ"),
    ("dpk", "2024-11", ["syriza"], "leader", 4.0, "παραδοχή: «Προοδευτικό Κέντρο» (ΚΙΔΗΣΟ, πρώην πρόεδρος ΣΥΡΙΖΑ)"),
    ("elas", "2026-05", ["syriza"], "leader", None, "παραδοχή: θέση ΣΥΡΙΖΑ επί Τσίπρα (CHES 2019)"),
    ("elpida", "2026-05", [], None, 5.0, "παραδοχή: κέντρο (μέγιστη αβεβαιότητα)"),
]
GONE = {"xa": "2020-10"}  # καταδίκη ως εγκληματική οργάνωση· δεν μετριέται πλέον ως επιλογή


def months_between(a, b):
    ya, ma = int(a[:4]), int(a[5:7])
    yb, mb = int(b[:4]), int(b[5:7])
    return (yb - ya) * 12 + (mb - ma)


def scenario_at(date, pe, results, ches):
    """Σενάριο κομμάτων για δημοσκόπηση με λήξη πεδίου `date` και εκλογές βάσης `pe`."""
    prev = results[pe]
    ches_year = 2019 if date < "2025-01" else 2024
    parties = []
    for k, share in sorted(prev.items(), key=lambda kv: -kv[1]):
        if share < 1.0 and k != "foni_logikis":
            continue
        if k in GONE and date[:7] >= GONE[k]:
            continue
        yrs = sorted({y for (y, p) in ches if p == k}, key=lambda y: (abs(y - ches_year), -y))
        if not yrs:
            continue
        parties.append({"key": k, "position": vm.lr7_of_ches(ches[(yrs[0], k)]), "lineage": [], "lineageType": None, "isNew": False,
                        "prevShare": share, "incumbent": k == "nd"})
    if pe == "2023-06":
        for k, since, lin, ltype, lrgen, _src in FOUNDED_2023:
            if date[:7] < since:
                continue
            if lrgen is None:
                lrgen = ches[(2019, "syriza")]
            parties.append({"key": k, "position": vm.lr7_of_ches(lrgen), "lineage": lin, "lineageType": ltype, "isNew": True,
                            "prevShare": None, "incumbent": False})
    return parties


# ---------------------------------------------------------------- πρόσωπα
def personas(root, model_dir, seeds=3):
    m = json.load(open(os.path.join(model_dir, "model.json")))
    skel = pd.concat([pd.read_csv(os.path.join(root, ".synthetic-lab-data/persona/harmonized/resp", f"{f}.csv.gz"),
                                  usecols=lambda c: c in ["age_band", "gender", "edu3", "nuts1", "urban", "weight"]) for f in ("dn2024a", "dn2024b", "dn2024c")],
                     ignore_index=True)
    frames = []
    for s in range(seeds):
        P = pie.generate_anchors(m, skel, np.random.default_rng(900 + s))
        P["weight"] = P["weight"] / P["weight"].sum()
        frames.append(P)
    P = pd.concat(frames, ignore_index=True)
    return P, pie.feature_columns(P)


def role_columns(pv, incumbent):
    """C4e: ρόλοι αντί για κόμματα — «ψήφισε κάποιο κόμμα», «ψήφισε το κόμμα που κυβερνά τη στιγμή της μέτρησης»."""
    pv = pd.Series(pv)
    voted = pv.map(lambda v: 1.0 if isinstance(v, str) and v not in ("abstain", "blank", "dk", "nonvote") else (np.nan if not isinstance(v, str) else 0.0))
    inc = pv.map(lambda v: (1.0 if v == incumbent else 0.0) if isinstance(v, str) else np.nan)
    return np.column_stack([voted.values, inc.values])


def binary_prob(spec, X, pv=None, incumbent=None):
    if not spec:
        return np.zeros(X.shape[0])
    Z, _ = pie.design(X, spec["feats"], np.array(spec["means"]))
    if spec.get("roleFeats"):
        R = role_columns(pv, incumbent)
        rm = np.array(spec["roleMeans"])
        R = np.where(np.isnan(R), rm[None, :], R)
        Z = np.column_stack([Z, R])
        return pie.logit_prob(Z, {"a": spec["a"], "b": list(spec["b"]) + list(spec["roleB"])})
    return pie.logit_prob(Z, {"a": spec["a"], "b": spec["b"]})


# ---------------------------------------------------------------- πρόβλεψη μιας γραμμής
def choice_probs(beta, parties, prev, lr, tm, extra):
    """Πιθανότητες επιλογής (n × J) για πρόσωπα με κοινή προηγούμενη ψήφο. extra: συντελεστές C4b/C4c."""
    n, J = len(lr), len(parties)
    U = np.zeros((n, J))
    tlog = math.log(1 + tm / 12.0)
    for j, p in enumerate(parties):
        loyal = 1.0 if prev == p["key"] else 0.0
        lin = 1.0 if (prev != p["key"] and prev in p["lineage"]) else 0.0
        d = np.where(np.isnan(lr), 0.0, np.abs(np.nan_to_num(lr) - p["position"]))
        share = p["prevShare"] if p["prevShare"] is not None else vm.NEW_PARTY_PREV
        inc = float(p["incumbent"])
        lin_b = beta["lineage"]
        if lin and p.get("lineageType") == "leader" and "lineage_leader" in extra:
            lin_b = extra["lineage_leader"]
        U[:, j] = (beta["loyal"] * loyal + lin_b * lin + beta["dist"] * d + beta["dist2"] * d * d + beta["logprev"] * math.log(max(share, 0.1))
                   + beta["new"] * float(p["isNew"]) + beta["incumbent"] * inc + beta["incumbent_loyal"] * inc * loyal
                   + beta.get("loyal_ext", 0.0) * loyal * abs(p["position"] - 4.0) / 3.0
                   + (beta.get("loyal_party") or {}).get(p["key"], 0.0) * loyal
                   + extra.get("loyal_t", 0.0) * loyal * tlog + extra.get("incloyal_t", 0.0) * inc * loyal * tlog)
    U -= U.max(axis=1, keepdims=True)
    E = np.exp(U)
    return E / E.sum(axis=1, keepdims=True)


def predict_row(vote, extra, P, X, pa_all, pu_all, from_key, parties, tm):
    mask = (P["pv"] == from_key).values
    w = P["weight"].values[mask]
    w = w / w.sum()
    lr = np.where(P["lr_none"].values[mask] == 1, np.nan, P["lr7"].values[mask].astype(float))
    pa, pu = pa_all[mask], pu_all[mask]
    C = choice_probs(vote["beta"], parties, from_key, lr, tm, extra)
    out = {"abstain": float(w @ pa), "undecided": float(w @ ((1 - pa) * pu))}
    dec = (1 - pa) * (1 - pu)
    for j, p in enumerate(parties):
        out[p["key"]] = float(w @ (dec * C[:, j]))
    return {k: 100 * v for k, v in out.items()}


def map_to_observed(pred, obs, from_key):
    """Αντιστοίχιση της ατομικής πρόβλεψης στις κατηγορίες που δημοσιεύει η δημοσκόπηση."""
    keys = set(obs)
    agg = {k: 0.0 for k in keys}
    unassigned = 0.0
    for k, v in pred.items():
        if k in keys:
            agg[k] += v
            continue
        atom = k if k in ("undecided", "abstain") else "party"
        cands = []
        if atom == "party":
            cands = ["other", "other+abstain", "other+undecided+abstain"] + (["moved_any"] if k != from_key else [])
        elif atom == "undecided":
            cands = ["undecided+abstain", "other+undecided+abstain"]
        else:
            cands = ["undecided+abstain", "other+abstain", "other+undecided+abstain"]
        tgt = next((c for c in cands if c in keys), None)
        if tgt:
            agg[tgt] += v
        else:
            unassigned += v
    return agg, unassigned


def row_metrics(pred, obs, from_key):
    agg, unassigned = map_to_observed(pred, obs, from_key)
    unrep = max(0.0, 100 - sum(obs.values()))
    tvd = 0.5 * (sum(abs(agg[k] - obs[k]) for k in obs) + abs(unassigned - unrep))
    r = {"F1": abs(pred.get(from_key, 0) - obs.get(from_key, np.nan)) if from_key in obs else np.nan, "F4": tvd}
    def nondec(d):
        if "undecided" in d and "abstain" in d:
            return d["undecided"] + d["abstain"]
        if "undecided+abstain" in d:
            return d["undecided+abstain"]
        return None
    on, pn = nondec(obs), pred["undecided"] + pred["abstain"]
    if on is not None:
        r["F2"] = abs(pn - on)
        if from_key in obs and on < 100:
            r["F3"] = abs(100 * pred[from_key] / (100 - pn) - 100 * obs[from_key] / (100 - on))
    r["pred_ret"], r["obs_ret"] = pred.get(from_key), obs.get(from_key)
    r["pred_nondec"], r["obs_nondec"] = pn, on
    return r


# ---------------------------------------------------------------- δεδομένα ροών
def load_groups(root):
    d = pd.read_csv(os.path.join(root, ".synthetic-lab-data/persona/flows/flows.csv"))
    d = d[d.past_election.isin(["2019-07", "2023-06"]) & d.from_key.isin(FROM_KEYS)]
    groups = []
    for (org, fe, pe, fk), g in d.groupby(["org", "fieldwork_end", "past_election", "from_key"]):
        obs = dict(zip(g.to_key, g.pct))
        if len(obs) < 2 and fk not in obs:
            continue
        split = "train" if fe <= TRAIN_END else ("select" if fe <= SELECT_END else "confirm")
        groups.append({"org": org, "date": fe, "pe": pe, "from": fk, "obs": obs, "n": int(g.n.iloc[0]) if g.n.iloc[0] == g.n.iloc[0] else 1000,
                       "split": split, "tm": months_between(pe, fe), "complete": abs(sum(obs.values()) - 100) <= 2})
    return groups


def evaluate(vote, extra, P, X, groups, results, ches):
    pa_all = binary_prob(vote.get("abstain"), X, P["pv"].values, "nd")
    pu_all = binary_prob(vote.get("undecided"), X, P["pv"].values, "nd")
    rows = []
    for g in groups:
        parties = scenario_at(g["date"], g["pe"], results, ches)
        pred = predict_row(vote, extra, P, X, pa_all, pu_all, g["from"], parties, g["tm"])
        rows.append({**{k: g[k] for k in ("org", "date", "pe", "from", "split", "tm")}, **row_metrics(pred, g["obs"], g["from"]),
                     "pred": {k: round(v, 1) for k, v in pred.items() if v >= 0.5}})
    return rows


def carry_rows(groups):
    """B_carry: μέση γραμμή της ίδιας προέλευσης στις δημοσκοπήσεις εκπαίδευσης (ανά κατηγορία προορισμού)."""
    tr = [g for g in groups if g["split"] == "train"]
    out = []
    for g in groups:
        same = [t for t in tr if t["from"] == g["from"]]
        pred = {}
        for k in g["obs"]:
            vals = [t["obs"][k] for t in same if k in t["obs"]]
            pred[k] = float(np.mean(vals)) if vals else 0.0
        if "undecided" not in pred:
            pred["undecided"] = float(np.mean([t["obs"]["undecided"] for t in same if "undecided" in t["obs"]] or [0]))
        if "abstain" not in pred:
            pred["abstain"] = float(np.mean([t["obs"]["abstain"] for t in same if "abstain" in t["obs"]] or [0]))
        m = row_metrics(pred, g["obs"], g["from"])
        out.append({**{k: g[k] for k in ("org", "date", "pe", "from", "split")}, **m})
    return out


def summarise(rows, split):
    r = [x for x in rows if x["split"] == split]
    s = {"groups": len(r)}
    for k in ("F1", "F2", "F3", "F4"):
        v = [x[k] for x in r if k in x and x[k] == x[k]]
        s[k] = round(float(np.mean(v)), 2) if v else None
    by = {}
    for fk in FROM_KEYS:
        v = [x for x in r if x["from"] == fk]
        if v:
            by[fk] = {"n": len(v), "F1": round(float(np.nanmean([x["F1"] for x in v])), 1),
                      "pred_ret": round(float(np.mean([x["pred_ret"] or 0 for x in v])), 1),
                      "obs_ret": round(float(np.nanmean([x["obs_ret"] if x["obs_ret"] is not None else np.nan for x in v])), 1),
                      "pred_nondec": round(float(np.mean([x["pred_nondec"] for x in v])), 1),
                      "obs_nondec": round(float(np.nanmean([x["obs_nondec"] if x["obs_nondec"] is not None else np.nan for x in v])), 1)}
    s["byFrom"] = by
    return s


# ---------------------------------------------------------------- C4a / C4b
NONPV = {"pv_nd", "pv_syriza", "pv_pasok", "pv_kke", "pv_farright", "pv_leftother", "pv_centre", "pv_other"}


def fit_c4a(root, base_vote):
    """Αποχή και αναποφάσιστοι με προηγούμενη ψήφο: MAPLE 2/2019 (αποχή) και MAPLE 2/2019 + 6/2019 (αναποφάσιστοι)."""
    v = copy.deepcopy(base_vote)
    v["abstain"] = vm.fit_binary(root, ["maple2019feb"], {"abstain", "blank"}, vm.ALL_FEATS)
    v["undecided"] = vm.fit_binary(root, ["maple2019feb", "maple2019pre"], {"undecided", "dk"}, vm.ALL_FEATS)
    v["version"] = "ecm-0.2a"
    v["notes"] = v.get("notes", []) + ["C4a: αποχή/αναποφάσιστοι με προηγούμενη ψήφο (MAPLE 2/2019, 6/2019)."]
    return v


MAPLE_INCUMBENT = {"maple2019feb": "syriza", "maple2019pre": "syriza"}


def fit_binary_roles(root, file_ids, target):
    """C4e: λογιστικό με δημογραφικά/άγκυρες ΧΩΡΙΣ ψευδομεταβλητές κόμματος + ρόλους (ψήφισε, ψήφισε κυβερνών)."""
    frames = []
    for f in file_ids:
        df = pd.read_csv(os.path.join(root, ".synthetic-lab-data/persona/harmonized/resp", f"{f}.csv.gz"), low_memory=False)
        df["_inc"] = MAPLE_INCUMBENT[f]
        frames.append(df)
    df = pd.concat(frames, ignore_index=True)
    df = df[df.vi.notna()]
    y = df.vi.isin(target).astype(float).values
    X = pie.feature_columns(df)
    feats = [f for f in pie.usable_features(X, 0.7) if f in vm.ALL_FEATS and f not in NONPV]
    Z, means = pie.design(X, feats)
    R = np.vstack([role_columns(g.pv.values, inc) for inc, g in df.groupby("_inc", sort=False)])
    rmeans = np.nanmean(R, axis=0)
    R = np.where(np.isnan(R), rmeans[None, :], R)
    m = pie.fit_logit(np.column_stack([Z, R]), y, df.weight.values.astype(float), lam=1.0)
    b = np.asarray(m["b"])
    return {"a": round(float(m["a"]), 6), "feats": feats, "means": np.round(means, 6).tolist(), "b": np.round(b[:len(feats)], 6).tolist(),
            "roleFeats": ["pv_voted", "pv_incumbent"], "roleMeans": np.round(rmeans, 6).tolist(), "roleB": np.round(b[len(feats):], 6).tolist(),
            "trainedOn": file_ids, "n": int(len(df)), "observedShare": round(float(np.average(y, weights=df.weight.values)) * 100, 2)}


def fit_c4e(root, vote):
    v = copy.deepcopy(vote)
    v["abstain"] = fit_binary_roles(root, ["maple2019feb"], {"abstain", "blank"})
    v["undecided"] = fit_binary_roles(root, ["maple2019feb", "maple2019pre"], {"undecided", "dk"})
    v["version"] = "ecm-0.2e"
    v["notes"] = v.get("notes", []) + ["C4e: ρόλοι (ψήφισε / ψήφισε το κυβερνών κόμμα) αντί για ψευδομεταβλητές κόμματος στην αποχή/αναποφάσιστους."]
    return v


def fit_c4d(root, vote):
    """C4d: loyal × ακραιότητα (|θέση − 4|/3) στο conditional logit, εκτίμηση σε CSES μαζί με τα υπόλοιπα β."""
    results, ches = vm.load_results(root), vm.load_ches(root)
    data = []
    for eid in vm.CSES_FILES:
        sc = vm.scenario_for(eid, results, ches, keys=vm.CSES_KEYS)
        ext = np.array([abs(p["position"] - 4.0) / 3.0 for p in sc["parties"]])
        df = pd.read_csv(os.path.join(root, ".synthetic-lab-data/persona/harmonized/resp", f"{vm.CSES_FILES[eid]}.csv.gz"), low_memory=False)
        keys = [p["key"] for p in sc["parties"]]
        for v_, pv, lr, lrn, w in zip(df.pv, df.prev_vote, df.lr7, df.lr_none, df.weight):
            if v_ not in keys:
                continue
            lrv = None if (lrn == 1 or lr != lr) else float(lr)
            U = vm.utilities(None, sc["parties"], pv if isinstance(pv, str) else None, lrv)
            data.append((np.column_stack([U, U[:, 0] * ext]), keys.index(v_), float(w)))
    names = vm.BETAS + ["loyal_ext"]

    def f(b):
        nll, g = 0.0, np.zeros(len(b))
        for Xd, yy, w in data:
            e = Xd @ b
            e -= e.max()
            p = np.exp(e)
            p /= p.sum()
            nll -= w * math.log(max(p[yy], 1e-12))
            g -= w * (Xd[yy] - p @ Xd)
        return nll + 0.05 * b @ b, g + 0.1 * b
    res = minimize(f, np.zeros(len(names)), jac=True, method="L-BFGS-B")
    v = copy.deepcopy(vote)
    v["beta"] = dict(zip(names, [round(float(x), 5) for x in res.x]))
    v["version"] = v["version"] + "+d"
    return v


def cses_data_keys(root):
    """CSES: (U [J×8], κλειδιά κομμάτων, επιλογή, βάρος, προηγούμενη ψήφος, εκλογές) — για τις τυχαίες επιδράσεις πίστης (E4)."""
    results, ches = vm.load_results(root), vm.load_ches(root)
    data = []
    for eid in vm.CSES_FILES:
        sc = vm.scenario_for(eid, results, ches, keys=vm.CSES_KEYS)
        keys = [p["key"] for p in sc["parties"]]
        df = pd.read_csv(os.path.join(root, ".synthetic-lab-data/persona/harmonized/resp", f"{vm.CSES_FILES[eid]}.csv.gz"), low_memory=False)
        for v, pv, lr, lrn, w in zip(df.pv, df.prev_vote, df.lr7, df.lr_none, df.weight):
            if v not in keys:
                continue
            lrv = None if (lrn == 1 or lr != lr) else float(lr)
            prev = pv if isinstance(pv, str) else None
            data.append((vm.utilities(None, sc["parties"], prev, lrv), keys, keys.index(v), float(w), prev, eid))
    return data


def fit_choice_re(data, tau, lam=0.1):
    """Conditional logit με β (κοινά) + δ_p (πίστη ανά κόμμα, ποινή τ/2·Σδ² — μερική συγκέντρωση προς το 0)."""
    parties = sorted({k for d in data for k in d[1]})
    P = len(parties)
    pidx = {k: i for i, k in enumerate(parties)}
    nb = len(vm.BETAS)

    def f(th):
        b, dlt = th[:nb], th[nb:]
        nll, g = 0.0, np.zeros(len(th))
        for U, keys, y, w, prev, _ in data:
            D = np.zeros((len(keys), P))
            for j, k in enumerate(keys):
                if prev == k:
                    D[j, pidx[k]] = 1.0
            X = np.column_stack([U, D])
            e = X @ th
            e -= e.max()
            pr = np.exp(e)
            pr /= pr.sum()
            nll -= w * math.log(max(pr[y], 1e-12))
            g -= w * (X[y] - pr @ X)
        pen = 0.5 * lam * b @ b + 0.5 * tau * dlt @ dlt
        gp = np.concatenate([lam * b, tau * dlt])
        return nll + pen, g + gp
    res = minimize(f, np.zeros(nb + P), jac=True, method="L-BFGS-B")
    beta = dict(zip(vm.BETAS, [round(float(x), 5) for x in res.x[:nb]]))
    beta["loyal_party"] = {k: round(float(x), 4) for k, x in zip(parties, res.x[nb:])}
    return beta


def loglik(data, beta):
    ll = 0.0
    for U, keys, y, w, prev, _ in data:
        e = U @ np.array([beta[k] for k in vm.BETAS]) + np.array([(beta.get("loyal_party") or {}).get(k, 0.0) * (1.0 if prev == k else 0.0) for k in keys])
        e -= e.max()
        p = np.exp(e) / np.exp(e).sum()
        ll += w * math.log(max(p[y], 1e-12))
    return ll


def fit_e4(root, vote):
    """E4: τ από leave-one-election-out στο CSES (μόνο εκπαίδευση), μετά εκτίμηση σε όλες τις εκλογές."""
    data = cses_data_keys(root)
    eids = sorted({d[5] for d in data})
    cv = {}
    for tau in (0.3, 1.0, 3.0, 10.0, 30.0):
        cv[tau] = sum(loglik([d for d in data if d[5] == e], fit_choice_re([d for d in data if d[5] != e], tau)) for e in eids)
    best = max(cv, key=cv.get)
    v = copy.deepcopy(vote)
    v["beta"] = fit_choice_re(data, best)
    v["version"] = v["version"] + "+e4"
    v["e4"] = {"tauCV": {str(k): round(x, 1) for k, x in cv.items()}, "tau": best}
    return v


def fit_c4b(vote, P, X, groups, results, ches, lam=0.5):
    """Εκτίμηση loyal_t, incloyal_t στις ροές ΕΚΠΑΙΔΕΥΣΗΣ (ελαχιστοποίηση σταθμισμένου F4², ridge προς 0)."""
    tr = [g for g in groups if g["split"] == "train"]
    pa_all, pu_all = binary_prob(vote.get("abstain"), X, P["pv"].values, "nd"), binary_prob(vote.get("undecided"), X, P["pv"].values, "nd")
    scen = [scenario_at(g["date"], g["pe"], results, ches) for g in tr]

    def loss(th):
        extra = {"loyal_t": th[0], "incloyal_t": th[1]}
        L = 0.0
        for g, parties in zip(tr, scen):
            pred = predict_row(vote, extra, P, X, pa_all, pu_all, g["from"], parties, g["tm"])
            L += row_metrics(pred, g["obs"], g["from"])["F4"] ** 2
        return L / len(tr) + lam * float(th @ th)
    res = minimize(loss, np.zeros(2), method="Nelder-Mead", options={"xatol": 1e-3, "fatol": 1e-3, "maxiter": 200})
    return {"loyal_t": round(float(res.x[0]), 4), "incloyal_t": round(float(res.x[1]), 4)}, float(res.fun)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("--model", default="pie-0.2")
    ap.add_argument("--variant", default="v0", choices=["v0", "c4a", "c4ab", "c4ae", "c4ad", "c4ade", "c4a_e4"])
    ap.add_argument("--seeds", type=int, default=3)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    mdir = os.path.join(root, ".synthetic-lab-data/persona/models", a.model)
    base_vote = json.load(open(os.path.join(mdir, "vote.json")))
    results, ches = vm.load_results(root), vm.load_ches(root)
    P, X = personas(root, mdir, a.seeds)
    groups = load_groups(root)
    vote, extra = base_vote, {}
    if a.variant.startswith("c4a"):
        vote = fit_c4a(root, base_vote)
    if "e" in a.variant[3:] and a.variant != "c4a_e4":
        vote = fit_c4e(root, vote)
    if a.variant == "c4a_e4":
        vote = fit_e4(root, vote)
        print("E4", vote["e4"], vote["beta"]["loyal_party"])
    if "d" in a.variant[3:] and a.variant != "c4a_e4":
        vote = fit_c4d(root, vote)
        print("C4d beta", vote["beta"])
    if a.variant == "c4ab":
        extra, fl = fit_c4b(vote, P, X, groups, results, ches)
        print("C4b", extra, round(fl, 2))
    rows = evaluate(vote, extra, P, X, groups, results, ches)
    carry = carry_rows(groups)
    out = {"variant": a.variant, "model": a.model, "protocol": "SPRINT_PREREGISTRATION §6", "extra": extra,
           "voteModel": {k: vote[k] for k in ("version", "beta")}, "abstainTrainedOn": (vote.get("abstain") or {}).get("trainedOn"),
           "undecidedTrainedOn": (vote.get("undecided") or {}).get("trainedOn"),
           "summary": {s: summarise(rows, s) for s in ("train", "select", "confirm")},
           "B_carry": {s: summarise(carry, s) for s in ("train", "select", "confirm")}, "rows": rows}
    d = os.path.join(root, ".synthetic-lab-data/persona/sprint")
    json.dump(out, open(os.path.join(d, f"flows-{a.variant}.json"), "w"), ensure_ascii=False, indent=1)
    if a.variant != "v0":
        json.dump(vote | {"extra": extra}, open(os.path.join(d, f"vote-{a.variant}.json"), "w"), ensure_ascii=False, indent=1)
    for s in ("train", "select", "confirm"):
        print(s, json.dumps(out["summary"][s], ensure_ascii=False))
        print("  B_carry", json.dumps({k: out["B_carry"][s][k] for k in ("F1", "F2", "F3", "F4")}))
