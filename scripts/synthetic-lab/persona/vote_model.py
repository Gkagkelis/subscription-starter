"""
Μοντέλο εκλογικής επιλογής του PIE (πρόθεση ψήφου ΧΩΡΙΣ δημοσκοπήσεις) + προκαταχωρημένα backtests (PERSONA_PREREGISTRATION §7).

  python3 scripts/synthetic-lab/persona/vote_model.py --root . scenarios      # γράφει config/synthetic-lab/persona/vote-scenarios/*.json
  python3 scripts/synthetic-lab/persona/vote_model.py --root . backtest        # 2019-07 και 2023-06
  python3 scripts/synthetic-lab/persona/vote_model.py --root . fit --model pie-0.1   # vote.json για την έκδοση μοντέλου

Μοντέλο: conditional logit ΧΩΡΙΣ σταθερές ανά κόμμα. Χαρακτηριστικά επιλογής:
  loyal (ίδιο κόμμα με την προηγούμενη ψήφο) · lineage (διάσπαση/ίδιος αρχηγός) · |lr − θέση| και τετράγωνο ·
  log(ποσοστό στις προηγούμενες εκλογές) · νέο κόμμα · κυβερνών · κυβερνών × loyal.
Εκτίμηση σε CSES (μετεκλογικά, Ελλάδα 2009–2019: τρέχουσα + προηγούμενη ψήφος του ίδιου ερωτώμενου).
Αναποφάσιστοι: MAPLE II (Ελλάδα, 6/2019, προεκλογικά). Αποχή (πρόθεση): UNDPOLAR (Ελλάδα, 1/2022).
Χαρακτηριστικά κομμάτων = ιστορικά γεγονότα: επίσημα αποτελέσματα, θέσεις CHES, γενεαλογία, κυβέρνηση.
"""
import argparse
import json
import math
import os
import subprocess
import sys

import numpy as np
import pandas as pd
from scipy.optimize import minimize

sys.path.insert(0, os.path.dirname(__file__))
import pie  # noqa: E402
from pie import read_resp  # noqa: E402

RES_KEY = {"ND": "nd", "PASOK": "pasok", "DISY": "pasok", "KINAL": "pasok", "PASOK_KINAL": "pasok", "SYRIZA": "syriza", "KKE": "kke",
           "LAOS": "laos", "XA": "xa", "ANEL": "anel", "DIMAR": "dimar", "POTAMI": "potami", "EK": "ek", "LAE": "lae", "EL": "el",
           "MERA25": "mera25", "PE": "plefsi", "NIKI": "niki", "SPARTIATES": "spartiates", "FONI_LOGIKIS": "foni_logikis",
           "ANTARSYA": "antarsya", "KIDISO": "kidiso", "DX": "dx", "OP": "oikologoi", "TELEIA": "teleia"}
CHES_KEY = {"ND": "nd", "PASOK": "pasok", "SYRIZA": "syriza", "KKE": "kke", "LAOS": "laos", "XA": "xa", "ANEL": "anel", "DIMAR": "dimar",
            "Potami": "potami", "EL": "el", "MR25": "mera25", "KIDISO": "kidiso", "FL": "foni_logikis", "Niki": "niki",
            "Spartans": "spartiates", "PE": "plefsi"}
LABEL = {"nd": "ΝΔ", "pasok": "ΠΑΣΟΚ–ΚΙΝΑΛ", "syriza": "ΣΥΡΙΖΑ", "kke": "ΚΚΕ", "laos": "ΛΑΟΣ", "xa": "Χρυσή Αυγή", "anel": "ΑΝΕΛ", "dimar": "ΔΗΜΑΡ",
         "potami": "Ποτάμι", "ek": "Ένωση Κεντρώων", "lae": "ΛΑΕ", "el": "Ελληνική Λύση", "mera25": "ΜέΡΑ25", "plefsi": "Πλεύση Ελευθερίας",
         "niki": "ΝΙΚΗ", "spartiates": "Σπαρτιάτες", "foni_logikis": "Φωνή Λογικής", "elas": "ΕΛ.Α.Σ.", "dpk": "Δημοκράτες – Προοδευτικό Κέντρο",
         "nea_aristera": "Νέα Αριστερά", "elpida": "Ελπίδα για τη Δημοκρατία", "symmachia": "Συμμαχία Ελλήνων"}
CSES_KEYS = {"nd", "syriza", "pasok", "kke", "xa", "anel", "potami", "ek", "el", "mera25", "plefsi", "dimar", "laos", "lae", "antarsya"}

# Εκλογές: (id, ημερομηνία, προηγούμενες, CHES έτος, κυβερνώντα κόμματα, νέα κόμματα, γενεαλογία, ρητές θέσεις όπου λείπει CHES)
ELECTIONS = {
    "2009-10": dict(date="2009-10-04", prev="2007-09", ches=2006, incumbent=["nd"], new=[], lineage={}, assumed={}),
    "2012-06": dict(date="2012-06-17", prev="2012-05", ches=2010, incumbent=["pasok", "nd"], new=[], lineage={},
                    assumed={"anel": ("ches2014", 8.78), "xa": ("ches2014", 9.89), "dimar": ("ches2014", 3.22)}),
    "2015-01": dict(date="2015-01-25", prev="2012-06", ches=2014, incumbent=["nd", "pasok"], new=["potami"], lineage={},
                    assumed={"ek": ("παραδοχή: κέντρο", 5.0)}),
    "2015-09": dict(date="2015-09-20", prev="2015-01", ches=2014, incumbent=["syriza", "anel"], new=["lae"], lineage={"lae": ["syriza"]},
                    assumed={"ek": ("παραδοχή: κέντρο", 5.0), "lae": ("παραδοχή: διάσπαση αριστερής πλατφόρμας ΣΥΡΙΖΑ", 1.0)}),
    "2019-07": dict(date="2019-07-07", prev="2015-09", ches=2019, incumbent=["syriza"], new=["el", "mera25", "plefsi"],
                    lineage={"mera25": ["syriza"], "plefsi": ["syriza", "lae"]},
                    assumed={"ek": ("παραδοχή: κέντρο", 5.0), "plefsi": ("CHES 2024 (μεταγενέστερη μέτρηση)", 3.0)}),
    "2023-06": dict(date="2023-06-25", prev="2019-07", ches=2019, incumbent=["nd"], new=["spartiates", "niki"], lineage={"spartiates": ["xa"]},
                    assumed={"spartiates": ("CHES 2024 (μεταγενέστερη μέτρηση)", 10.0), "niki": ("CHES 2024 (μεταγενέστερη μέτρηση)", 9.2),
                             "plefsi": ("CHES 2024 (μεταγενέστερη μέτρηση)", 3.0)}),
}
CSES_FILES = {"2009-10": "cses2009", "2012-06": "cses2012", "2015-01": "cses2015a", "2015-09": "cses2015b", "2019-07": "cses2019"}
NEW_PARTY_PREV = 0.5
BETAS = ["loyal", "lineage", "dist", "dist2", "logprev", "new", "incumbent", "incumbent_loyal"]


def lr7_of_ches(v):
    return round(1 + 0.6 * float(v), 3)


def load_results(root):
    d = pd.read_csv(os.path.join(root, ".synthetic-lab-data/raw/political/tidy/election_results.csv"))
    d = d[(d.level == "national") & (d.unit_code == "GR") & (d.type == "parliament")]
    out = {}
    for eid, g in d.groupby("election_id"):
        ym = eid.split("_")[-1][:7]
        s = {}
        for k, p in zip(g.party_key, g.pct_valid):
            kk = RES_KEY.get(k)
            if kk and p == p:
                s[kk] = s.get(kk, 0) + float(p)
        out[ym] = s
    return out


def load_ches(root):
    c = pd.read_csv(os.path.join(root, ".synthetic-lab-data/raw/political/archives/ches/1999-2024_CHES_dataset_meansV2.csv"), low_memory=False)
    c = c[c.country == 4]
    return {(int(y), CHES_KEY[p]): float(v) for y, p, v in zip(c.year, c.party, c.lrgen) if p in CHES_KEY and v == v}


def scenario_for(eid, results, ches, min_share=1.0, keys=None):
    e = ELECTIONS[eid]
    res = results[eid]
    prev = results[e["prev"]]
    alts = [k for k, v in sorted(res.items(), key=lambda kv: -kv[1]) if v >= min_share and (keys is None or k in keys)]
    parties = []
    for k in alts:
        if k in e["assumed"]:
            src, lrgen = e["assumed"][k]
        else:
            yrs = sorted({y for (y, p) in ches if p == k}, key=lambda y: (abs(y - e["ches"]), -y))
            if not yrs:
                continue
            src, lrgen = f"CHES {yrs[0]}", ches[(yrs[0], k)]
        parties.append({"key": k, "label": LABEL.get(k, k), "position": lr7_of_ches(lrgen), "positionSource": f"{src}: lrgen {lrgen:.2f} → 1 + 0,6·lrgen",
                        "lineage": e["lineage"].get(k, []), "lineageSource": "ιστορικό γεγονός (διάσπαση/αρχηγός)" if e["lineage"].get(k) else "—",
                        "isNew": k in e["new"], "prevShare": round(prev[k], 2) if k in prev and k not in e["new"] else None,
                        "prevShareSource": f"επίσημο αποτέλεσμα {e['prev']}", "incumbent": k in e["incumbent"]})
    return {"id": eid, "referenceMonth": eid, "previousElection": e["prev"], "facts": [f"Εκλογές {e['date']}· προηγούμενες {e['prev']}."],
            "parties": parties, "otherSplit": {}, "newPartyPrevShare": NEW_PARTY_PREV, "official": {k: res[k] for k in alts}}


def scenario_2026(results, ches):
    prev = results["2023-06"]
    c24 = lambda k: ches[(2024, k)]
    rows = [
        ("nd", c24("nd"), "CHES 2024", [], False, True),
        ("elas", ches[(2019, "syriza")], "παραδοχή: θέση ΣΥΡΙΖΑ επί Τσίπρα (CHES 2019)", ["syriza"], True, False),
        ("pasok", c24("pasok"), "CHES 2024", [], False, False),
        ("el", c24("el"), "CHES 2024", [], False, False),
        ("kke", c24("kke"), "CHES 2024", [], False, False),
        ("plefsi", c24("plefsi"), "CHES 2024", [], False, False),
        ("foni_logikis", c24("foni_logikis"), "CHES 2024", [], False, False),
        ("elpida", 5.0, "παραδοχή: δεν αυτοτοποθετείται αριστερά/δεξιά → κέντρο (μέγιστη αβεβαιότητα)", [], True, False),
        ("symmachia", 10.0, "παραδοχή: ακροδεξιός χώρος (δημοσιεύματα για στήριξη Κασιδιάρη· όχι επίσημη επιβεβαίωση)", ["spartiates"], True, False),
        ("mera25", ches[(2019, "mera25")], "CHES 2019 (δεν μετρήθηκε 2024)", [], False, False),
        ("syriza", c24("syriza"), "CHES 2024", [], False, False),
        ("niki", c24("niki"), "CHES 2024", [], False, False),
        ("dpk", 4.0, "παραδοχή: «Προοδευτικό Κέντρο» → κεντροαριστερά/κέντρο", ["syriza"], True, False),
        ("nea_aristera", 1.5, "παραδοχή: διάσπαση αριστερής πτέρυγας ΣΥΡΙΖΑ", ["syriza"], True, False),
        ("spartiates", c24("spartiates"), "CHES 2024", [], False, False),
    ]
    parties = [{"key": k, "label": LABEL[k], "position": lr7_of_ches(v), "positionSource": f"{src}: lrgen {v:.2f} → 1 + 0,6·lrgen" if not src.startswith("παραδοχή") else f"{src} (lrgen {v:.1f})",
                "lineage": lin, "lineageSource": {"elas": "ιδρυτής ο πρόεδρος του ΣΥΡΙΖΑ στις εκλογές 2023 (Α. Τσίπρας)", "dpk": "ιδρυτής πρώην πρόεδρος ΣΥΡΙΖΑ (Σ. Κασσελάκης)",
                                                  "nea_aristera": "διάσπαση της ΚΟ του ΣΥΡΙΖΑ (12/2023)", "symmachia": "δημοσιεύματα για στήριξη Η. Κασιδιάρη (Σπαρτιάτες 2023)"}.get(k, "—"),
                "isNew": new, "prevShare": round(prev[k], 2) if (k in prev and not new) else None, "prevShareSource": "επίσημο αποτέλεσμα 25/6/2023", "incumbent": inc}
               for k, v, src, lin, new, inc in rows]
    return {"id": "2026-10", "referenceMonth": "2026-10", "previousElection": "2023-06",
            "facts": ["Λίστα κομμάτων του ερωτηματολογίου, ονομασίες επαληθευμένες στις 28/10/2026· δεν υποτίθεται ότι όλα θα κατέβουν σε εκλογές.",
                      "ΕΛ.Α.Σ.: ίδρυση 5/2026 (Α. Τσίπρας). Ελπίδα για τη Δημοκρατία: ίδρυση 5/2026 (Μ. Καρυστιανού). Δημοκράτες – Προοδευτικό Κέντρο: μετονομασία 2/2026 (Σ. Κασσελάκης).",
                      "Κυβέρνηση ΝΔ από 7/2019. Κανένα ποσοστό δημοσκόπησης δεν χρησιμοποιείται."],
            "parties": parties,
            "otherSplit": {k: prev[k] for k in ("spartiates", "el", "niki", "plefsi", "mera25", "foni_logikis") if k in prev},
            "newPartyPrevShare": NEW_PARTY_PREV}


# ---------------------------------------------------------------- εκτίμηση
def utilities(beta, parties, prev, lr):
    u = []
    for p in parties:
        loyal = 1.0 if prev == p["key"] else 0.0
        lin = 1.0 if (prev is not None and prev != p["key"] and prev in p["lineage"]) else 0.0
        d = 0.0 if lr is None else abs(lr - p["position"])
        share = p["prevShare"] if p["prevShare"] is not None else NEW_PARTY_PREV
        x = [loyal, lin, d, d * d, math.log(max(share, 0.1)), float(p["isNew"]), float(p["incumbent"]), float(p["incumbent"]) * loyal]
        u.append(x)
    return np.array(u)


def cses_choice_data(root, eids, results, ches):
    data = []
    for eid in eids:
        sc = scenario_for(eid, results, ches, keys=CSES_KEYS)
        df = pd.read_csv(os.path.join(root, ".synthetic-lab-data/persona/harmonized/resp", f"{CSES_FILES[eid]}.csv.gz"), low_memory=False)
        keys = [p["key"] for p in sc["parties"]]
        for v, pv, lr, lrn, w in zip(df.pv, df.prev_vote, df.lr7, df.lr_none, df.weight):
            if v not in keys:
                continue
            lrv = None if (lrn == 1 or lr != lr) else float(lr)
            data.append((utilities(None, sc["parties"], pv if isinstance(pv, str) else None, lrv), keys.index(v), float(w)))
    return data


def fit_choice(data, lam=0.1):
    def f(b):
        nll, g = 0.0, np.zeros(len(b))
        for X, y, w in data:
            e = X @ b
            e -= e.max()
            p = np.exp(e)
            p /= p.sum()
            nll -= w * math.log(max(p[y], 1e-12))
            g -= w * (X[y] - p @ X)
        return nll + 0.5 * lam * b @ b, g + lam * b
    res = minimize(f, np.zeros(len(BETAS)), jac=True, method="L-BFGS-B")
    return dict(zip(BETAS, [round(float(x), 5) for x in res.x])), int(len(data))


def fit_binary(root, file_ids, target, feats_allowed):
    frames = [pd.read_csv(os.path.join(root, ".synthetic-lab-data/persona/harmonized/resp", f"{f}.csv.gz"), low_memory=False) for f in file_ids]
    df = pd.concat(frames, ignore_index=True)
    df = df[df.vi.notna()]
    y = df.vi.isin(target).astype(float).values
    X = pie.feature_columns(df)
    feats = [f for f in pie.usable_features(X, 0.7) if f in feats_allowed]
    Z, means = pie.design(X, feats)
    m = pie.fit_logit(Z, y, df.weight.values.astype(float), lam=1.0)
    return {"a": round(m["a"], 6), "feats": feats, "means": np.round(means, 6).tolist(), "b": np.round(m["b"], 6).tolist(),
            "trainedOn": file_ids, "n": int(len(df)), "observedShare": round(float(np.average(y, weights=df.weight.values)) * 100, 2)}


ALL_FEATS = set(pie.FEATURES)


def vote_json(root, choice_eids, results, ches):
    beta, n = fit_choice(cses_choice_data(root, choice_eids, results, ches))
    abstain = fit_binary(root, ["undpolar2022"], {"abstain"}, ALL_FEATS - {"pv_nd", "pv_syriza", "pv_pasok", "pv_kke", "pv_farright", "pv_leftother", "pv_centre", "pv_other"})
    undecided = fit_binary(root, ["maple2019pre"], {"undecided", "dk"}, ALL_FEATS)
    return {"version": "ecm-0.1", "trainedOn": [CSES_FILES[e] for e in choice_eids] + ["maple2019pre", "undpolar2022"], "beta": beta, "nChoice": n,
            "abstain": abstain, "undecided": undecided,
            "notes": ["Conditional logit χωρίς σταθερές ανά κόμμα (CSES).", "Αναποφάσιστοι: MAPLE II 6/2019 (online πάνελ, ένα μήνα πριν τις εκλογές).",
                      "Πρόθεση αποχής: UNDPOLAR 1/2022 (online πάνελ με ποσοστώσεις)."]}


# ---------------------------------------------------------------- backtest (προκαταχώριση §7)
def simulate(root, model_dir, skel, sc, beta, seeds=5):
    m = json.load(open(os.path.join(model_dir, "model.json")))
    shares = []
    keys = [p["key"] for p in sc["parties"]]
    for s in range(seeds):
        rng = np.random.default_rng(500 + s)
        P = pie.generate_anchors(m, skel, rng)
        b = np.array([beta[k] for k in BETAS])
        tot = np.zeros(len(keys))
        for pv, lr, lrn, w in zip(P.pv, P.lr7, P.lr_none, P.weight):
            lrv = None if (lrn == 1 or lr != lr) else float(lr)
            pvk = pv if isinstance(pv, str) else None
            if pvk in ("abstain", "blank", "dk", "nonvote"):
                pvk = None
            e = utilities(None, sc["parties"], pvk, lrv) @ b
            e = np.exp(e - e.max())
            p = e / e.sum()
            tot[rng.choice(len(keys), p=p)] += w
        shares.append(100 * tot / tot.sum())
    return dict(zip(keys, np.mean(shares, axis=0))), np.std(shares, axis=0).max()


def train_cutoff_model(root, cutoff, tag):
    out = os.path.join(root, ".synthetic-lab-data/persona/models/eval", f"vote-bt-{tag}")
    subprocess.run([sys.executable, os.path.join(os.path.dirname(__file__), "train.py"), "--root", root, "--cutoff", cutoff, "--version", f"vote-bt-{tag}", "--out", out],
                   check=True, capture_output=True)
    return out


def backtest(root):
    results, ches = load_results(root), load_ches(root)
    out = {}
    for eid, cutoff, choice_eids, skel_files in (("2019-07", "2019-06", ["2009-10", "2012-06", "2015-01", "2015-09"], ["dn2018a", "dn2018b"]),
                                                 ("2023-06", "2023-05", ["2009-10", "2012-06", "2015-01", "2015-09", "2019-07"], ["dn2022a", "dn2022b", "dn2022s"])):
        beta, n = fit_choice(cses_choice_data(root, choice_eids, results, ches))
        sc = scenario_for(eid, results, ches)
        mdir = train_cutoff_model(root, cutoff, eid)
        skel = pd.concat([pd.read_csv(os.path.join(root, ".synthetic-lab-data/persona/harmonized/resp", f"{f}.csv.gz"),
                                      usecols=lambda c: c in ["age_band", "gender", "edu3", "nuts1", "urban", "weight"]) for f in skel_files], ignore_index=True)
        pred, sd = simulate(root, mdir, skel, sc, beta)
        off = sc["official"]
        tot = sum(off.values())
        truth = {k: 100 * v / tot for k, v in off.items()}
        prevres = results[ELECTIONS[eid]["prev"]]
        carry = {k: prevres.get(k, 0.0) if k not in ELECTIONS[eid]["new"] else 0.0 for k in truth}
        ct = sum(carry.values())
        carry = {k: 100 * v / ct for k, v in carry.items()}
        unif = {k: 100 / len(truth) for k in truth}
        mae = lambda d: round(float(np.mean([abs(d[k] - truth[k]) for k in truth])), 2)
        out[eid] = {"cutoff": cutoff, "choiceTrainedOn": [CSES_FILES[e] for e in choice_eids], "nChoice": n, "beta": beta,
                    "personaModel": os.path.basename(mdir), "skeleton": skel_files, "seedSdMaxPp": round(float(sd), 2),
                    "officialRenormalised": {k: round(v, 2) for k, v in truth.items()}, "PIE": {k: round(v, 2) for k, v in pred.items()},
                    "carryForward": {k: round(v, 2) for k, v in carry.items()},
                    "MAE_pp": {"PIE": mae(pred), "carryForward": mae(carry), "uniform": mae(unif)}}
        print(eid, json.dumps(out[eid]["MAE_pp"]), json.dumps({k: (round(pred[k], 1), round(truth[k], 1), round(carry[k], 1)) for k in truth}, ensure_ascii=False))
    os.makedirs(os.path.join(root, ".synthetic-lab-data/persona/benchmarks"), exist_ok=True)
    json.dump(out, open(os.path.join(root, ".synthetic-lab-data/persona/benchmarks/vote-backtest.json"), "w"), ensure_ascii=False, indent=1)


def write_scenarios(root):
    results, ches = load_results(root), load_ches(root)
    d = os.path.join(root, "config/synthetic-lab/persona/vote-scenarios")
    os.makedirs(d, exist_ok=True)
    for eid in ("2019-07", "2023-06"):
        sc = scenario_for(eid, results, ches)
        sc.pop("official")
        json.dump(sc, open(os.path.join(d, f"{eid}.json"), "w"), ensure_ascii=False, indent=1)
    json.dump(scenario_2026(results, ches), open(os.path.join(d, "2026-10.json"), "w"), ensure_ascii=False, indent=1)
    print("ok", d)


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("--root", default=".")
    ap.add_argument("cmd", choices=["scenarios", "backtest", "fit"])
    ap.add_argument("--model", default=None)
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    if a.cmd == "scenarios":
        write_scenarios(root)
    elif a.cmd == "backtest":
        backtest(root)
    else:
        results, ches = load_results(root), load_ches(root)
        vj = vote_json(root, list(CSES_FILES), results, ches)
        path = os.path.join(root, ".synthetic-lab-data/persona/models", a.model, "vote.json")
        json.dump(vj, open(path, "w"), ensure_ascii=False, indent=1)
        print(json.dumps(vj["beta"]), vj["abstain"]["observedShare"], vj["undecided"]["observedShare"])
