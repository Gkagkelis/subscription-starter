#!/usr/bin/env python3
"""PHASE 8 — demo «ΠΑΣΟΚ — Πανελλαδική Πολιτική Έρευνα»: 500 συνθετικές εγγραφές (υποθετική ανάθεση, συνθετική προσομοίωση).

Ροή (αναπαραγώγιμη, σταθερός σπόρος):
  1. Πάνελ 500 προσώπων του Lab (p8_lab_panel.ts): δημογραφικά από τον βαθμονομημένο πληθυσμό, άγκυρες PIE pie-0.7
     (ψήφος 2023, αυτοτοποθέτηση, οικονομική κατάσταση, απασχόληση, ενδιαφέρον) και χρησιμότητες του μοντέλου εκλογικής επιλογής.
  2. Στάθμιση (raking) σε ηλικία×φύλο, περιφέρεια, εκπαίδευση (βαθμονομημένος πληθυσμός) και ανάκληση ψήφου 2023 (επίσημο αποτέλεσμα).
  3. Κάθε ερώτηση: πιθανότητες ανά πρόσωπο = δομή (Lab / ρητοί συντελεστές) + σταθερές που βαθμονομούνται ώστε το σταθμισμένο
     αναμενόμενο περιθώριο να ισούται με τον στόχο της ερώτησης:
       A — πρόσφατα δημόσια δεδομένα (Eurobarometer 105, μέσος όρος εκτιμήσεων ψήφου Οκτ. 2026, Interview), με διασταυρώσεις όπου υπάρχουν·
       B — συγγενής δημόσια πηγή + δηλωμένες παραδοχές·
       C — υποθετικό σενάριο επίδειξης Σ1 (δηλωμένα ποσοστά-στόχοι· ΟΧΙ πρόβλεψη).
  4. Κλήρωση απαντήσεων (ένας σπόρος ανά ερώτηση), κανόνες παράλειψης, πολλαπλές απαντήσεις.
  5. Αποτελέσματα, διασταυρώσεις και έλεγχοι από τις ΙΔΙΕΣ 500 εγγραφές.

Κανένα ποσοστό δεν παράγεται από γλωσσικό μοντέλο. Δεν αλλάζει τίποτα στην παραγωγή του Lab.
    python3 -I scripts/synthetic-lab/pasok/p8_generate.py <repo_root> <out_dir>
"""
import csv
import gzip
import hashlib
import json
import math
import sys
import zlib
from collections import OrderedDict, defaultdict
from pathlib import Path

import numpy as np

ROOT = Path(sys.argv[1]).resolve()
OUT = Path(sys.argv[2]).resolve()
OUT.mkdir(parents=True, exist_ok=True)
SEED = 20261030
Q = json.load(open(ROOT / "config/synthetic-lab/pasok/questionnaire.json", encoding="utf-8"))
E = json.load(open(ROOT / "config/synthetic-lab/pasok/evidence.json", encoding="utf-8"))
P = json.load(open(ROOT / ".synthetic-lab-data/pasok/lab_panel.json", encoding="utf-8"))
QD = {q["id"]: q for q in Q["questions"]}
R = P["rows"]
N = len(R)
assert N == 500, N


def rng(name):
    return np.random.default_rng([SEED, zlib.crc32(name.encode())])


def softmax(L):
    L = L - L.max(axis=1, keepdims=True)
    X = np.exp(L)
    return X / X.sum(axis=1, keepdims=True)


def sigmoid(x):
    return 1 / (1 + np.exp(-x))


def logit(p):
    p = np.clip(p, 1e-6, 1 - 1e-6)
    return np.log(p / (1 - p))


# ---------------------------------------------------------------- πρόσωπα
AGE = np.array([r["ageBand"] for r in R])
GEN = np.array([r["gender"] for r in R])
EDU = np.array([r["edu3"] or "medium" for r in R])
REGION_NAME = np.array([r["region"] for r in R])
REG5_OF = {
    "Αττική": 1, "Κεντρική Μακεδονία": 2, "Ανατολική Μακεδονία & Θράκη": 2, "Δυτική Μακεδονία": 2, "Ήπειρος": 2,
    "Θεσσαλία": 3, "Στερεά Ελλάδα": 3, "Πελοπόννησος": 4, "Δυτική Ελλάδα": 4,
    "Κρήτη": 5, "Νότιο Αιγαίο": 5, "Βόρειο Αιγαίο": 5, "Ιόνια Νησιά": 5,
}
REG5 = np.array([REG5_OF[x] for x in REGION_NAME])
URB = np.array([1 if r["settlement"] == "urban" else 2 for r in R])
ECON = np.array([r["anchors"]["econ4"] or 3 for r in R], dtype=float)
POLINT = np.array([r["anchors"]["polint4"] or 3 for r in R], dtype=float)
LR_RAW = [r["anchors"]["lr7"] if r["anchors"].get("lr_none") != 1 else None for r in R]
LR_KNOWN = np.array([x is not None for x in LR_RAW])
LR = np.array([x if x is not None else 4.0 for x in LR_RAW], dtype=float)
EMP = np.array([r["anchors"]["emp"] or "other" for r in R])
PREV = np.array([r["prev2023"] or "abstain" for r in R])
YOUNG = np.isin(AGE, ["17-24", "25-34"]).astype(float)
OLD55 = np.isin(AGE, ["55-64", "65+"]).astype(float)
OLD65 = (AGE == "65+").astype(float)
AGE_Z = np.array([{"17-24": -1.5, "25-34": -0.9, "35-44": -0.3, "45-54": 0.3, "55-64": 0.9, "65+": 1.5}[a] for a in AGE])
EDU_HIGH = (EDU == "high").astype(float)
ATTICA = (REG5 == 1).astype(float)
LOWINT = (POLINT >= 3).astype(float)
SC_PARTIES = P["scenarioParties"]
POS = {p["key"]: p["position"] for p in SC_PARTIES}
UKEYS = [p["key"] for p in SC_PARTIES]
U = np.array([[r["utilities"][k] for k in UKEYS] for r in R])

# ---------------------------------------------------------------- Q8: ψήφος 2023 (άγκυρα Lab + κανόνες)
PV = E["pastVotePolicy"]
Q8_CODE = {"nd": 1, "syriza": 2, "pasok": 3, "kke": 4, "spartiates": 5, "el": 6, "niki": 7, "plefsi": 8}
g = rng("Q8")
q8 = np.zeros(N, dtype=int)
for i in range(N):
    u = g.random(3)
    if AGE[i] == "17-24" and u[0] < PV["ineligibleShareOf17to24"]:
        q8[i] = 93
    elif PREV[i] == "abstain":
        q8[i] = 99 if u[1] < PV["dkShareNonVoters"] else 91
    else:
        if u[1] < PV["dkShareVoters"]:
            q8[i] = 99
        elif u[2] < PV["blankShareVoters"]:
            q8[i] = 90
        else:
            q8[i] = Q8_CODE.get(PREV[i], 9)

# ---------------------------------------------------------------- στάθμιση (raking)
M = P["margins"]


def norm(d):
    t = sum(d.values())
    return {k: v / t for k, v in d.items()}


tg_ag = norm(M["ageGender"])
tg_reg = norm(defaultdict(float, {}) | {k: 0 for k in []})
reg_tot = defaultdict(float)
for k, v in M["region"].items():
    reg_tot[REG5_OF[k]] += v
tg_reg = norm(reg_tot)
tg_edu = norm({k: v for k, v in M["edu3"].items() if k != "unknown"})
AG = np.array([f"{a}|{s}" for a, s in zip(AGE, GEN)])
party_recall = (q8 >= 1) & (q8 <= 9)
off = PV["officialValidShares"]
off_codes = {Q8_CODE.get(k, 9): v for k, v in off.items()}
tg_pv = norm(off_codes)
w = np.ones(N)
for it in range(200):
    maxdev = 0
    for labels, tgt, mask in [(AG, tg_ag, None), (REG5, tg_reg, None), (EDU, tg_edu, None), (q8, tg_pv, party_recall)]:
        m = np.ones(N, bool) if mask is None else mask
        tot = w[m].sum()
        for k, t in tgt.items():
            sel = m & (labels == k)
            cur = w[sel].sum() / tot
            if cur > 0:
                w[sel] *= t / cur
                maxdev = max(maxdev, abs(cur - t))
    w = np.clip(w, 0.3, 3.0)
    if maxdev < 1e-5:
        break
w = w * N / w.sum()
RAKE = {"iterations": it + 1, "maxDeviation": float(maxdev), "min": float(w.min()), "max": float(w.max()),
        "designEffect": float(N * (w ** 2).sum() / w.sum() ** 2)}


# ---------------------------------------------------------------- βαθμονόμηση
def _ipf(L, wt, dims, rate_fn, iters):
    """Κλασικό IPF πάνω σε σταθερές logit: για κάθε «διάσταση» (σύνολο + ομάδες) με τη σειρά, η σταθερά κάθε ομάδας
    διορθώνεται κατά log(στόχος/τρέχον) αφού ξαναϋπολογιστούν οι πιθανότητες. rate_fn: πιθανότητες → μέγεθος που βαθμονομείται."""
    n, K = L.shape
    alphas = [np.zeros((len(keys), K)) for _, keys, _ in dims]

    def eta():
        e = L.copy()
        for (ix, keys, _), a in zip(dims, alphas):
            e = e + np.where(ix[:, None] >= 0, a[np.maximum(ix, 0)], 0)
        return e

    for _ in range(iters):
        for d, (ix, keys, tg) in enumerate(dims):
            m = rate_fn(softmax(eta()))
            for j in range(len(keys)):
                sel = ix == j
                if not sel.any():
                    continue
                tt = tg[j]
                c = (wt[sel, None] * m[sel]).sum(0) / max(wt[sel].sum(), 1e-12)
                ok = (tt > 0) & (c > 0)
                alphas[d][j, ok] += np.log(tt[ok] / c[ok])
                alphas[d][j, tt <= 0] = -50
    return softmax(eta()), alphas[0][0]


def _dims(n, target, groups, scale):
    t = np.asarray(target, float)
    t = t / t.sum() * scale if scale else t
    dims = [(np.zeros(n, int), ["all"], [t])]
    for labels, gt in groups:
        keys = list(gt.keys())
        tg = []
        for k in keys:
            v = np.asarray(gt[k], float)
            tg.append(v / v.sum() * scale if scale else v)
        dims.append((np.array([keys.index(x) if x in keys else -1 for x in labels]), keys, tg))
    return dims


def calib_nominal(L, wt, target, groups=(), iters=60):
    """P = softmax(L + σταθερές ανά διάσταση): το σταθμισμένο αναμενόμενο περιθώριο (και ανά ομάδα) = στόχος."""
    P_, a = _ipf(L, wt, _dims(L.shape[0], target, groups, 1.0), lambda p: p, iters)
    return P_, a


def mention2(q):
    """Πιθανότητα αναφοράς κάθε επιλογής με δύο κληρώσεις χωρίς επανάθεση από την κατανομή q."""
    r = q / np.maximum(1 - q, 1e-9)
    return q * (1 + r.sum(1, keepdims=True) - r)


def calib_mention2(L, wt, target_rates, groups=(), iters=80):
    """Ποσοστά αναφοράς (έως 2 απαντήσεις): ο στόχος κλιμακώνεται ώστε το άθροισμα = 2 αναφορές ανά ερωτώμενο."""
    P_, _ = _ipf(L, wt, _dims(L.shape[0], target_rates, groups, 2.0), mention2, iters)
    return P_


def calib_ordinal(s, wt, cum_targets):
    """Αθροιστικό logit: P(c ≤ k) = σ(τ_k + s). Κατώφλια με διχοτόμηση ώστε σταθμισμένο αναμενόμενο = στόχος."""
    taus = []
    for c in cum_targets:
        lo, hi = -30.0, 30.0
        for _ in range(80):
            mid = (lo + hi) / 2
            v = (wt * sigmoid(mid + s)).sum() / wt.sum()
            if v < c:
                lo = mid
            else:
                hi = mid
        taus.append((lo + hi) / 2)
    cum = np.stack([sigmoid(t + s) for t in taus], 1)
    cum = np.concatenate([np.zeros((len(s), 1)), cum, np.ones((len(s), 1))], 1)
    return np.diff(cum, axis=1)


def ordinal_item(s, wt, targets, subst_codes, specials):
    """targets: {code: %}. subst_codes: διατεταγμένες ουσιαστικές επιλογές (θετικό → αρνητικό).
    specials: {code: seed_vector} — ΔΓ/ΔΑ, «δεν γνωρίζω» κ.λπ. Επιστρέφει (codes, P)."""
    sp = list(specials.keys())
    tot_sp = {c: targets.get(str(c), 0) / 100 for c in sp}
    # στάδιο 1: ουσιαστική απάντηση ή ειδική κατηγορία
    L1 = np.zeros((len(s), 1 + len(sp)))
    for j, c in enumerate(sp):
        L1[:, 1 + j] = specials[c]
    t1 = [1 - sum(tot_sp.values())] + [tot_sp[c] for c in sp]
    P1, _ = calib_nominal(L1, wt, t1)
    subst = np.array([targets.get(str(c), 0) for c in subst_codes], float)
    subst = subst / subst.sum()
    cum = np.cumsum(subst)[:-1]
    P2 = calib_ordinal(s, wt * P1[:, 0], cum)
    Pm = np.concatenate([P1[:, [0]] * P2, P1[:, 1:]], 1)
    return list(subst_codes) + sp, Pm


def draw(Pm, name):
    g = rng(name)
    u = g.random(Pm.shape[0])
    c = np.cumsum(Pm, 1)
    c[:, -1] = 1.0
    return (u[:, None] > c).sum(1)


# ---------------------------------------------------------------- πηγές: Eurobarometer 105 (Ελλάδα)
EB_ID = "eurobarometer:s3613_105_2_std105_eng"
EB = defaultdict(dict)
with gzip.open(ROOT / ".synthetic-lab-data/lake/export/empirical_distribution_bank.csv.gz", "rt", encoding="utf-8") as f:
    for x in csv.DictReader(f):
        if x["study_id"] != EB_ID:
            continue
        v = x["var_id"].split("::")[1]
        if v not in ("D73.1", "QA3", "QA15") and not v.startswith("QA6."):
            continue
        EB[(v, x["group_dim"], x["group_value"])][x["option_label"]] = float(x["value"])
EB_AGE = {"17-24": "15-24", "25-34": "25-34", "35-44": "35-44", "45-54": "45-54", "55-64": "55-64", "65+": "65+"}
EB_EDU = {"low": "low_education", "medium": "medium_education", "high": "high_education"}


def eb_vec(var, dim, val, cmap, codes):
    d = EB.get((var, dim, val))
    if not d:
        return None
    out = []
    for c in codes:
        out.append(sum(v for lab, v in d.items() if any(lab.startswith(p) for p in cmap[str(c)])))
    return out


def eb_groups(var, cmap, codes):
    gr = []
    for labels, dim, conv in [(GEN, "gender", {"male": "male", "female": "female"}), (AGE, "age_band", EB_AGE), (EDU, "education_group", EB_EDU)]:
        gt = {}
        for lab_val, eb_val in conv.items():
            v = eb_vec(var, dim, eb_val, cmap, codes)
            if v and sum(v) > 0:
                gt[lab_val] = v
        gr.append((labels, gt))
    return gr


# ---------------------------------------------------------------- αποτελέσματα
ANS = OrderedDict()   # qid -> np.array κωδικών (ή None για παράλειψη)
MULTI = OrderedDict()  # qid -> {code: np.array 0/1} (None = παράλειψη)
META = {}             # qid/item -> {class, source, target, structure}
ASKED = {}


def opts(qid):
    return [c for c, _ in QD[qid]["options"]]


def put(qid, codes, Pm, name=None, cls=None, target=None, note=None, asked=None):
    idx = draw(Pm, name or qid)
    a = np.array([codes[k] for k in idx])
    if asked is not None:
        a = np.where(asked, a, -1)
    ANS[qid] = a
    META[qid] = {"class": cls, "target": target, "note": note}
    return a


# ---- Q6 πρόθεση ψήφου
POLL_MAP = {"ND": "nd", "ELAS": "elas", "PASOK_KINAL": "pasok", "EL": "el", "KKE": "kke", "PE": "plefsi", "AUTO_HOPE_FOR_DEMOCRACY": "elpida",
            "AUTO_ALLIANCE_OF_GREEKS": "symmachia", "FONI_LOGIKIS": "foni_logikis", "MERA25": "mera25", "SYRIZA": "syriza", "NIKI": "niki",
            "KINIMA_DIMOKRATIAS": "dpk", "NEA_ARISTERA": "nea_aristera", "SPARTIATES": "other"}
VP = E["votePolicy"]
polls = defaultdict(dict)
meta_polls = {}
with open(ROOT / ".synthetic-lab-data/raw/political/_work/polls_parsed.csv", encoding="utf-8") as f:
    for x in csv.DictReader(f):
        if x["election_context"] != "GR_parl_next" or x["measure"] != "vote_estimate" or x["scope"] != "national":
            continue
        if x["pollster"] not in VP["pollsters"] or not (VP["pollWindow"][0] <= x["fieldwork_end"] <= VP["pollWindow"][1]):
            continue
        key = (x["pollster"], x["fieldwork_end"])
        polls[key][POLL_MAP.get(x["party_key"], "other")] = float(x["value_pct"])
        meta_polls[key] = {"pollster": x["pollster"], "client": x["client"], "fieldworkEnd": x["fieldwork_end"], "n": x["sample_size"], "url": x["source_url"]}
latest = {}
for (ps, fe) in polls:
    if ps not in latest or fe > latest[ps]:
        latest[ps] = fe
POLL_USED = [(ps, latest[ps]) for ps in VP["pollsters"] if ps in latest]
assert len(POLL_USED) == len(VP["pollsters"]), POLL_USED
Q6_KEYS = ["nd", "elas", "pasok", "el", "kke", "plefsi", "elpida", "symmachia", "foni_logikis", "mera25", "syriza", "niki", "dpk", "nea_aristera", "other"]
avg = {}
for k in Q6_KEYS[:-1]:
    vals = [polls[p][k] for p in POLL_USED if k in polls[p]]
    avg[k] = float(np.mean(vals)) if vals else 0.0
avg["other"] = max(0.0, 100 - sum(avg.values()))
s_avg = sum(avg.values())
POLL_AVG = {k: v * 100 / s_avg for k, v in avg.items()}
# στάδιο 1: κόμμα / αναποφάσιστος / λευκό / αποχή / δεν απαντώ (σπόροι: πιθανότητες αποχής & αναποφασιστικότητας του Lab)
pa = np.array([r["pAbstain"] for r in R])
pu = np.array([r["pUndecided"] for r in R])
NP = VP["nonParty"]
L1 = np.stack([np.zeros(N), logit(pu), 0.3 * LOWINT, logit(pa) + 0.4 * LOWINT, 0.2 * OLD65], 1)
t1 = [100 - sum(NP.values()), NP["92"], NP["90"], NP["91"], NP["99"]]
P1, _ = calib_nominal(L1, w, t1)
# στάδιο 2: κόμμα — χρησιμότητες του Lab + σταθερές ανά κόμμα βαθμονομημένες στον μέσο όρο των δημοσκοπήσεων
UQ = np.stack([U[:, UKEYS.index(k)] if k != "other" else U[:, UKEYS.index("spartiates")] for k in Q6_KEYS], 1)
P2, ALPHA = calib_nominal(UQ, w * P1[:, 0], [POLL_AVG[k] for k in Q6_KEYS], iters=600)
Q6_CODES = list(range(1, 16)) + [92, 90, 91, 99]
P6 = np.concatenate([P1[:, [0]] * P2, P1[:, 1:]], 1)
q6 = put("Q6", Q6_CODES, P6, cls="A", target={str(c): (POLL_AVG[k] * t1[0] / 100) for c, k in zip(range(1, 16), Q6_KEYS)} | {k: v for k, v in NP.items()})
CODE2KEY = dict(zip(range(1, 16), Q6_KEYS))
VOTE = np.array([CODE2KEY.get(c, "none") for c in q6])
PARTY = (q6 >= 1) & (q6 <= 15)
NONPARTY = ~PARTY
ND = (VOTE == "nd").astype(float)
PASOK = (VOTE == "pasok").astype(float)
OPP = (PARTY & (VOTE != "nd")).astype(float)
NEWP = np.isin(VOTE, ["elas", "elpida", "symmachia", "dpk"]).astype(float)
LOYAL = np.array([(VOTE[i] == PREV[i]) or (VOTE[i] == "elas" and PREV[i] == "syriza") for i in range(N)]).astype(float)
DIST_PASOK = np.where(LR_KNOWN, np.abs(LR - POS["pasok"]), 1.5)

# ---- Q9 δεύτερη επιλογή (πολλαπλή, έως 2) — από τις ίδιες χρησιμότητες + σταθερές της Q6
ev9 = E["items"]["Q9"]
L9 = np.stack([np.zeros(N), 0.6 * LOYAL + 0.4 * np.isin(VOTE, ["nd", "kke"]), 0.5 * LOWINT], 1)  # some / none / dk
P9, _ = calib_nominal(L9, w * PARTY, [100 - ev9["targets"]["97"] - ev9["targets"]["99"], ev9["targets"]["97"], ev9["targets"]["99"]])
g9 = rng("Q9")
stage = draw(P9, "Q9-stage")
Q9_CODE = {"nd": 1, "elas": 2, "pasok": 3, "el": 4, "kke": 5, "plefsi": 6, "elpida": 7, "symmachia": 8, "foni_logikis": 9, "mera25": 10, "syriza": 11}
m9 = {c: np.zeros(N, int) for c in opts("Q9")}
second_parties = [set() for _ in range(N)]
for i in range(N):
    if not PARTY[i]:
        continue
    if stage[i] == 1:
        m9[97][i] = 1
        continue
    if stage[i] == 2:
        m9[99][i] = 1
        continue
    eta = UQ[i] + ALPHA
    eta[Q6_KEYS.index(VOTE[i])] = -np.inf
    p = np.exp(eta - eta[np.isfinite(eta)].max())
    p[~np.isfinite(eta)] = 0
    p /= p.sum()
    k1 = g9.choice(len(Q6_KEYS), p=p)
    picks = [k1]
    if g9.random() < ev9["secondMentionProb"]:
        p2 = p.copy()
        p2[k1] = 0
        if p2.sum() > 0:
            picks.append(g9.choice(len(Q6_KEYS), p=p2 / p2.sum()))
    for k in picks:
        key = Q6_KEYS[k]
        second_parties[i].add(key)
        m9[Q9_CODE.get(key, 15)][i] = 1
MULTI["Q9"] = {c: np.where(PARTY, v, -1) for c, v in m9.items()}
META["Q9"] = {"class": "C", "target": ev9["targets"], "note": ev9["note"]}
CONSIDER_PASOK = np.array(["pasok" in s for s in second_parties]).astype(float)

# ---- Q7 βεβαιότητα / Q10 πιθανότητα αλλαγής (μόνο όσοι δηλώνουν κόμμα)
g7 = rng("Q7-latent")
lat7 = 1.0 * LOYAL + 0.3 * (2.5 - POLINT) + 0.3 * AGE_Z + 0.6 * np.isin(VOTE, ["nd", "kke"]) - 0.4 * NEWP + 0.5 * MULTI["Q9"][97].clip(0) + g7.normal(0, 0.6, N)
codes, Pm = ordinal_item(lat7, w * PARTY, E["items"]["Q7"]["targets"], [1, 2, 3, 4], {99: 0.6 * LOWINT})
put("Q7", codes, Pm, cls="C", target=E["items"]["Q7"]["targets"], asked=PARTY)
lat10 = -lat7 + rng("Q10-latent").normal(0, 0.5, N)
codes, Pm = ordinal_item(lat10, w * PARTY, E["items"]["Q10"]["targets"], [1, 2, 3, 4], {99: 0.6 * LOWINT})
put("Q10", codes, Pm, cls="C", target=E["items"]["Q10"]["targets"], asked=PARTY)
ANS["Q8"] = q8
META["Q8"] = {"class": "A/B", "target": None, "note": "Κομματική κατανομή σταθμισμένη στο επίσημο αποτέλεσμα (S5)."}

# ---- Q1 κατεύθυνση (EB D73.1, με διασταυρώσεις)
ev = E["items"]["Q1"]
c1 = opts("Q1")
L = np.stack([2.4 * ND + 0.4 * (q8 == 1), 0.4 * OPP, 0.5 * NONPARTY, 0.5 * LOWINT], 1)
Pm, _ = calib_nominal(L, w, eb_vec("D73.1", "all", "all", ev["map"], c1), eb_groups("D73.1", ev["map"], c1))
put("Q1", c1, Pm, cls="A", target=dict(zip(map(str, c1), eb_vec("D73.1", "all", "all", ev["map"], c1))))

# ---- Q2 δύο σημαντικότερα προβλήματα (EB QA3, έως 2 αναφορές)
ev = E["items"]["Q2"]
c2 = [c for c in opts("Q2") if c != 99]
tq2 = eb_vec("QA3", "all", "all", ev["map"], c2)
lr_c = np.where(LR_KNOWN, LR - 4, 0)
seed2 = {1: 0.35 * (ECON - 2.5), 2: 0.2 * EDU_HIGH, 3: 0.3 * EDU_HIGH, 4: 0.25 * EDU_HIGH, 5: 0.3 * (AGE == "17-24") + 0.4 * (EMP == "unemployed"),
         6: 0.2 * OLD55, 7: 0.25 * lr_c, 8: 0.25 * OLD65, 9: 0.15 * lr_c, 10: 0.2 * OLD55, 11: 0.3 * (EMP == "student"),
         12: -0.2 * lr_c, 13: 0.1 * EDU_HIGH, 14: 0.5 * YOUNG + 0.3 * ATTICA, 15: 0.3 * YOUNG, 16: 0 * ECON}
L = np.stack([np.asarray(seed2[c], float) * np.ones(N) for c in c2], 1)
q2p = calib_mention2(L, w, [t / 100 for t in tq2], [(lab, {k: [x / 100 for x in v] for k, v in gt.items()}) for lab, gt in eb_groups("QA3", ev["map"], c2)])
g2 = rng("Q2")
m2 = {c: np.zeros(N, int) for c in opts("Q2")}
for i in range(N):
    p = q2p[i].copy()
    k1 = g2.choice(len(c2), p=p)
    p[k1] = 0
    k2 = g2.choice(len(c2), p=p / p.sum())
    m2[c2[k1]][i] = 1
    m2[c2[k2]][i] = 1
MULTI["Q2"] = m2
META["Q2"] = {"class": "A", "target": dict(zip(map(str, c2), tq2)), "note": "Ποσοστό αναφορών (άθροισμα ≈ 200%)."}

# ---- Q3 κυβέρνηση (B) / Q4 αντιπολίτευση (B) / Q30 ικανοποίηση από επιλογές (B)
lat3 = 2.6 * ND + 0.6 * ((q8 == 1) & (VOTE != "nd")) + 0.15 * lr_c - 0.3 * (ECON == 4) + rng("Q3-latent").normal(0, 0.5, N)
codes, Pm = ordinal_item(lat3, w, E["items"]["Q3"]["targets"], [1, 2, 3, 4], {99: 0.8 * NONPARTY})
put("Q3", codes, Pm, cls="B", target=E["items"]["Q3"]["targets"])
lat4 = -0.7 * ND + 0.3 * np.isin(VOTE, ["elas", "pasok"]) - 0.2 * NONPARTY + rng("Q4-latent").normal(0, 0.5, N)
codes, Pm = ordinal_item(lat4, w, E["items"]["Q4"]["targets"], [1, 2, 3, 4], {99: 0.8 * LOWINT})
put("Q4", codes, Pm, cls="B", target=E["items"]["Q4"]["targets"])
lat30 = 0.9 * ND + 0.3 * PARTY - 0.4 * NONPARTY + rng("Q30-latent").normal(0, 0.5, N)
codes, Pm = ordinal_item(lat30, w, E["items"]["Q30"]["targets"], [1, 2, 3, 4], {99: 0.8 * LOWINT})
put("Q30", codes, Pm, cls="B", target=E["items"]["Q30"]["targets"])

# ---- Q5 ποιο κόμμα διαχειρίζεται καλύτερα (C)
Q5_CODE = {"nd": 1, "elas": 2, "pasok": 3, "el": 4, "kke": 5, "plefsi": 6, "elpida": 7}
c5 = opts("Q5")
L = np.zeros((N, len(c5)))
for i in range(N):
    if PARTY[i]:
        L[i, c5.index(Q5_CODE.get(VOTE[i], 8))] += 3.0
    for k in second_parties[i]:
        L[i, c5.index(Q5_CODE.get(k, 8))] += 1.0
L[:, c5.index(9)] += 1.8 * NONPARTY
L[:, c5.index(99)] += 1.2 * (q6 == 92)
t5 = E["items"]["Q5"]["targets"]
Pm, _ = calib_nominal(L, w, [t5[str(c)] for c in c5])
put("Q5", c5, Pm, cls="C", target=t5)

# ---- λανθάνουσα «συγγένεια με το ΠΑΣΟΚ» (σενάριο Σ1: συνδέει τις ερωτήσεις της ενότητας Γ με την ψήφο και την ιδεολογία)
AFF = (2.6 * PASOK + 1.1 * CONSIDER_PASOK + 0.7 * (q8 == 3) - 0.45 * DIST_PASOK
       + 0.35 * np.isin(VOTE, ["elas", "syriza", "dpk", "nea_aristera", "elpida"]) - 0.25 * ND
       - 0.5 * np.isin(VOTE, ["kke", "el", "foni_logikis", "symmachia", "niki"]) + 0.15 * AGE_Z + rng("AFF").normal(0, 0.7, N))
for qid, lam, extra in [("Q11", 1.0, 0), ("Q12", 0.9, 0), ("Q13", 0.9, 0.15 * EDU_HIGH), ("Q14", 0.9, 0.15 * OLD55),
                        ("Q15", 0.85, 0), ("Q16", 0.95, 0), ("Q17", 0.7, 0)]:
    s = lam * AFF + extra + rng(qid + "-latent").normal(0, 0.45, N)
    ev = E["items"][qid]
    codes, Pm = ordinal_item(s, w, ev["targets"], [1, 2, 3, 4], {99: 0.8 * LOWINT + 0.6 * NONPARTY})
    put(qid, codes, Pm, cls=ev["class"], target=ev["targets"])

# ---- Q18 Ανδρουλάκης (C) / Q19 αρχηγοί (C)
s = 1.0 * AFF + rng("Q18-latent").normal(0, 0.45, N)
codes, Pm = ordinal_item(s, w, E["items"]["Q18"]["targets"], [1, 2, 3, 4], {98: 0.6 * YOUNG + 0.6 * LOWINT, 99: 0.6 * NONPARTY})
put("Q18", codes, Pm, cls="C", target=E["items"]["Q18"]["targets"])
LEADER_PARTY = {"Q19_1": "nd", "Q19_2": "elas", "Q19_3": "el", "Q19_4": "kke", "Q19_5": "plefsi", "Q19_6": "elpida"}
LINEAGE_2023 = {"nd": ["nd"], "elas": ["syriza"], "el": ["el"], "kke": ["kke"], "plefsi": ["plefsi"], "elpida": []}
for item, party in LEADER_PARTY.items():
    dist = np.where(LR_KNOWN, np.abs(LR - POS[party]), 1.5)
    s = (2.4 * (VOTE == party) + 0.8 * np.array([party in x for x in second_parties]) + 0.5 * np.isin(PREV, LINEAGE_2023[party])
         - 0.35 * dist + rng(item + "-latent").normal(0, 0.6, N))
    tg = E["items"]["Q19"]["itemTargets"][item]
    specials = {98: 0.6 * YOUNG + 0.6 * LOWINT, 99: 0.6 * NONPARTY}
    if tg.get("98", 0) == 0:
        specials.pop(98)
    codes, Pm = ordinal_item(s, w, tg, [1, 2, 3, 4], specials)
    put(item, codes, Pm, cls="C", target=tg)

# ---- Q20 καταλληλότερος πρωθυπουργός (A, Interview 10/2026)
LEADER_OF = {"nd": 1, "elas": 2, "pasok": 3, "el": 4, "kke": 5, "elpida": 6, "mera25": 7, "foni_logikis": 8, "plefsi": 9, "dpk": 10}
LEADER_POS = {1: "nd", 2: "elas", 3: "pasok", 4: "el", 5: "kke", 6: "elpida", 7: "mera25", 8: "foni_logikis", 9: "plefsi", 10: "dpk"}
c20 = opts("Q20")
L = np.zeros((N, len(c20)))
for i in range(N):
    if PARTY[i]:
        L[i, c20.index(LEADER_OF.get(VOTE[i], 11))] += 3.0
    for k in second_parties[i]:
        L[i, c20.index(LEADER_OF.get(k, 11))] += 1.0
for c, k in LEADER_POS.items():
    L[:, c20.index(c)] -= 0.25 * np.where(LR_KNOWN, np.abs(LR - POS[k]), 1.5)
L[:, c20.index(97)] += 1.8 * NONPARTY + 0.5 * (~LR_KNOWN)
t20 = E["items"]["Q20"]["targets"]
Pm, _ = calib_nominal(L, w, [t20[str(c)] for c in c20])
put("Q20", c20, Pm, cls="A", target=t20)

# ---- Q21 χαρακτηριστικά αρχηγού (B, έως 2)
ev = E["items"]["Q21"]
c21 = [1, 2, 3, 4, 5, 6, 7]
left = (np.where(LR_KNOWN, LR, 4) <= 3).astype(float)
right = (np.where(LR_KNOWN, LR, 4) >= 5).astype(float)
seed21 = {1: 0.3 * OLD55, 2: 0.3 * YOUNG + 0.3 * left, 3: 0.4 * ND + 0.2 * EDU_HIGH, 4: 0 * ND, 5: 0.3 * YOUNG,
          6: 0.3 * np.isin(VOTE, ["pasok", "elas", "dpk", "nea_aristera"]), 7: 0.4 * right}
L = np.stack([np.asarray(seed21[c], float) * np.ones(N) for c in c21], 1)
dk21 = ev["mentionTargets"]["99"] / 100
tr = [ev["mentionTargets"][str(c)] / 100 / (1 - dk21) for c in c21]
tr = [x * 2 / sum(tr) for x in tr]
q21p = calib_mention2(L, w, tr)
g21 = rng("Q21")
P21dk, _ = calib_nominal(np.stack([np.zeros(N), 0.8 * LOWINT], 1), w, [1 - dk21, dk21])
dk_draw = draw(P21dk, "Q21-dk")
m21 = {c: np.zeros(N, int) for c in opts("Q21")}
for i in range(N):
    if dk_draw[i] == 1:
        m21[99][i] = 1
        continue
    p = q21p[i].copy()
    k1 = g21.choice(len(c21), p=p)
    p[k1] = 0
    k2 = g21.choice(len(c21), p=p / p.sum())
    m21[c21[k1]][i] = 1
    m21[c21[k2]][i] = 1
MULTI["Q21"] = m21
META["Q21"] = {"class": "B", "target": ev["mentionTargets"], "note": ev["construct"]}

# ---- Q22 βαρύτητα αρχηγού (C)
s = 0.4 * np.isin(VOTE, ["elas", "elpida", "plefsi", "foni_logikis"]) + 0.3 * ND - 0.3 * EDU_HIGH + 0.2 * OLD65 + rng("Q22-latent").normal(0, 0.5, N)
codes, Pm = ordinal_item(s, w, E["items"]["Q22"]["targets"], [1, 2, 3, 4], {99: 0.8 * LOWINT})
put("Q22", codes, Pm, cls="C", target=E["items"]["Q22"]["targets"])

# ---- Q23 πρώτη προτεραιότητα (B από EB QA3)
ev = E["items"]["Q23"]
c23 = [c for c in opts("Q23") if c != 99]
raw23 = eb_vec("QA3", "all", "all", ev["ebMap"], c23)
t23 = [x / sum(raw23) * (100 - ev["dk"]) for x in raw23] + [ev["dk"]]
seed23 = {1: 0.35 * (ECON - 2.5), 2: 0.2 * EDU_HIGH, 3: 0.2 * right + 0.3 * EDU_HIGH, 4: 0.3 * OLD65, 5: 0.3 * lr_c, 6: 0.3 * YOUNG + 0.3 * left,
          7: 0.2 * OLD55, 8: 0.3 * (EMP == "student"), 9: 0.4 * left + 0.2 * EDU_HIGH, 10: 0.6 * YOUNG + 0.3 * ATTICA, 11: 0.3 * YOUNG, 12: 0 * ECON}
L = np.stack([np.asarray(seed23[c], float) * np.ones(N) for c in c23] + [0.8 * LOWINT], 1)
Pm, _ = calib_nominal(L, w, t23)
put("Q23", c23 + [99], Pm, cls="B", target=dict(zip(map(str, c23 + [99]), t23)))

# ---- Q24 οικονομική κατάσταση έναντι πέρυσι (A, EB QA15)
ev = E["items"]["Q24"]
c24 = opts("Q24")
L = np.stack([-0.5 * (ECON - 2.5), np.zeros(N), 0.7 * (ECON - 2.5) + 0.2 * NONPARTY, 0.5 * LOWINT], 1)
Pm, _ = calib_nominal(L, w, eb_vec("QA15", "all", "all", ev["map"], c24), eb_groups("QA15", ev["map"], c24))
put("Q24", c24, Pm, cls="A", target=dict(zip(map(str, c24), eb_vec("QA15", "all", "all", ev["map"], c24))))

# ---- Q25 παρέμβαση για την ακρίβεια (C) / Q26 στεγαστικό (C)
c25 = opts("Q25")
seed25 = {1: 0.3 * (ECON - 2.5), 2: 0.4 * np.isin(EMP, ["private_emp", "public_emp", "retired"]) + 0.3 * left, 3: 0.4 * left + 0.2 * OLD65,
          4: 0.3 * (URB == 2), 5: 0.6 * YOUNG + 0.3 * ATTICA, 6: 0.4 * (ECON == 4), 7: 0 * ECON, 99: 0.8 * LOWINT}
L = np.stack([np.asarray(seed25[c], float) * np.ones(N) for c in c25], 1)
t25 = E["items"]["Q25"]["targets"]
Pm, _ = calib_nominal(L, w, [t25[str(c)] for c in c25])
put("Q25", c25, Pm, cls="C", target=t25)
s = 0.5 * YOUNG + 0.3 * ATTICA + 0.2 * (GEN == "female") + 0.2 * left + rng("Q26-latent").normal(0, 0.5, N)
codes, Pm = ordinal_item(s, w, E["items"]["Q26"]["targets"], [1, 2, 3, 4], {99: 0.6 * LOWINT})
put("Q26", codes, Pm, cls="C", target=E["items"]["Q26"]["targets"])

# ---- Q27 εμπιστοσύνη σε θεσμούς (A, EB QA6)
ev = E["items"]["Q27"]
c27 = opts("Q27")
seed27 = {"Q27_1": 2.0 * ND + 0.4 * (q8 == 1), "Q27_2": 1.5 * ND + 0.2 * PARTY, "Q27_3": 0.6 * PARTY - 0.4 * NONPARTY,
          "Q27_4": 0.6 * ND, "Q27_5": 0.25 * lr_c - 0.8 * (VOTE == "kke"), "Q27_6": 0 * ND}
for item, var in ev["ebItems"].items():
    L = np.stack([np.asarray(seed27[item], float) * np.ones(N), np.zeros(N), 0.5 * LOWINT], 1)
    tg = eb_vec(var, "all", "all", ev["map"], c27)
    Pm, _ = calib_nominal(L, w, tg, eb_groups(var, ev["map"], c27))
    put(item, c27, Pm, cls="A", target=dict(zip(map(str, c27), tg)))

# ---- Q28 πιθανότητα ψήφου ΠΑΣΟΚ 0–10 (C)
ev = E["items"]["Q28"]["targets"]
P28dk, _ = calib_nominal(np.stack([np.zeros(N), 0.8 * LOWINT + 0.4 * NONPARTY], 1), w, [100 - ev["dk"], ev["dk"]])
dk28 = draw(P28dk, "Q28-dk")
eps = rng("Q28-latent").normal(0, 0.6, N)
best = None
for a0 in np.linspace(-6, 2, 161):
    for b0 in np.linspace(0.3, 3.0, 55):
        sc = np.clip(np.round(10 * sigmoid(a0 + b0 * (AFF + eps))), 0, 10)
        ww = w * (dk28 == 0)
        s7 = (ww * (sc >= 7)).sum() / ww.sum() * 100
        s0 = (ww * (sc == 0)).sum() / ww.sum() * 100
        err = (s7 - ev["share7plus"]) ** 2 + (s0 - ev["share0"]) ** 2
        if best is None or err < best[0]:
            best = (err, a0, b0)
q28 = np.clip(np.round(10 * sigmoid(best[1] + best[2] * (AFF + eps))), 0, 10).astype(int)
ANS["Q28"] = np.where(dk28 == 1, 99, q28)
META["Q28"] = {"class": "C", "target": ev, "note": f"Κλίμακα από τη λανθάνουσα συγγένεια: 10·σ({best[1]:.2f} + {best[2]:.2f}·συγγένεια)."}

# ---- Q29 καθοριστικός παράγοντας (A, Interview 10/2026)
c29 = opts("Q29")
L = np.stack([0.3 * EDU_HIGH + 0.3 * YOUNG + 0.4 * NONPARTY,
              1.4 * (VOTE == "kke") + 0.3 * OLD65 + 0.5 * np.isin(VOTE, ["el", "foni_logikis", "niki", "mera25"]),
              1.0 * ND + 0.4 * np.isin(VOTE, ["elas", "elpida"]),
              0.5 * NONPARTY], 1)
t29 = E["items"]["Q29"]["targets"]
Pm, _ = calib_nominal(L, w, [t29[str(c)] for c in c29])
put("Q29", c29, Pm, cls="A", target=t29)

# ---- δημογραφικά
ANS["D1"] = np.where(GEN == "male", 1, 2)
ANS["D2"] = np.array([{"17-24": 1, "25-34": 2, "35-44": 3, "45-54": 4, "55-64": 5, "65+": 6}[a] for a in AGE])
ANS["D3"] = np.array([{"low": 1, "medium": 2, "high": 3}[e] for e in EDU])
ANS["D4"] = REG5
ANS["D5"] = URB
ANS["D6"] = ECON.astype(int)
ANS["D7"] = np.array([{"private_emp": 1, "public_emp": 2, "self_emp": 3, "farmer": 4, "unemployed": 5, "retired": 6, "student": 7, "homemaker": 8}.get(e, 9) for e in EMP])

# ================================================================ έξοδοι
LABEL = {}
for q in Q["questions"]:
    for c, lab in q.get("options", []):
        LABEL[(q["id"], c)] = lab
    for it, lab in q.get("items", []):
        for c, l2 in q["options"]:
            LABEL[(it, c)] = l2
ITEM_TEXT = {it: lab for q in Q["questions"] for it, lab in q.get("items", [])}
ITEM_PARENT = {it: q["id"] for q in Q["questions"] for it, _ in q.get("items", [])}
RESP_IDS = [f"R{i + 1:03d}" for i in range(N)]

# --- εγγραφές
cols = ["resp_id", "weight"] + [f"D{k}" for k in range(1, 8)]
order = []
for q in Q["questions"]:
    if q["section"] == "Z":
        continue
    if q["type"] == "battery":
        order += [it for it, _ in q["items"]]
    elif q["type"] == "multi":
        order += [f"{q['id']}_{c}" for c, _ in q["options"]]
    else:
        order.append(q["id"])
cols += order + ["lab_persona_id", "lab_model"]
rows_out = []
for i in range(N):
    row = {"resp_id": RESP_IDS[i], "weight": round(float(w[i]), 6)}
    for k in range(1, 8):
        row[f"D{k}"] = int(ANS[f"D{k}"][i])
    for c in order:
        if c in ANS:
            v = int(ANS[c][i])
            row[c] = "" if v == -1 else v
        else:
            qid, code = c.rsplit("_", 1)
            v = int(MULTI[qid][int(code)][i])
            row[c] = "" if v == -1 else v
    row["lab_persona_id"] = R[i]["personaId"]
    row["lab_model"] = P["modelVersion"]
    rows_out.append(row)
with open(OUT / "PASOK_SYNTHETIC_RESPONDENTS.csv", "w", newline="", encoding="utf-8") as f:
    wr = csv.DictWriter(f, fieldnames=cols)
    wr.writeheader()
    wr.writerows(rows_out)


# --- αποτελέσματα
def pct(mask_codes, base):
    wb = w[base].sum()
    return float(w[base & mask_codes].sum() / wb * 100) if wb > 0 else float("nan")


SRC = E["sources"]


def evidence_of(qid):
    root = ITEM_PARENT.get(qid, qid)
    ev = E["items"].get(root, {})
    return ev.get("class", META.get(qid, {}).get("class")), ev.get("source", ""), ev.get("construct", ev.get("note", ""))


results = []
summary = OrderedDict()
for q in Q["questions"]:
    qid = q["id"]
    items = q["items"] if q["type"] == "battery" else [(qid, None)]
    for it, it_label in items:
        if q["type"] == "multi":
            base = MULTI[qid][q["options"][0][0]] != -1
        else:
            base = ANS[it] != -1
        nb = int(base.sum())
        cls, src, construct = evidence_of(it)
        res = []
        for c, lab in q["options"]:
            if q["type"] == "multi":
                v = pct(MULTI[qid][c] == 1, base)
                n_u = int(((MULTI[qid][c] == 1) & base).sum())
            else:
                v = pct(ANS[it] == c, base)
                n_u = int(((ANS[it] == c) & base).sum())
            res.append({"code": c, "label": lab, "pct": v, "n": n_u})
            results.append({"question_id": qid, "item_id": it, "item_label": it_label or "", "question_text": q["text"], "type": q["type"],
                            "option_code": c, "option_label": lab, "pct_weighted": round(v, 2), "n_unweighted": n_u,
                            "base": q.get("base", "Σύνολο δείγματος"), "base_n_unweighted": nb, "base_weighted": round(float(w[base].sum()), 1),
                            "evidence_class": cls or "", "source": src})
        tgt = META.get(it, {}).get("target")
        summary[it] = {"qid": qid, "item": it, "itemLabel": it_label, "short": q["short"], "text": q["text"], "type": q["type"], "section": q["section"],
                       "base": q.get("base", "Σύνολο δείγματος"), "baseN": nb, "evidenceClass": cls, "source": src, "construct": construct,
                       "results": res, "target": tgt, "note": META.get(it, {}).get("note")}
        if q["type"] == "scale":
            vals = ANS[it][base & (ANS[it] != 99)]
            ww = w[base & (ANS[it] != 99)]
            summary[it]["mean"] = float((vals * ww).sum() / ww.sum())
            summary[it]["mean_pasok_voters"] = float((ANS[it][(VOTE == "pasok") & (ANS[it] != 99)] * w[(VOTE == "pasok") & (ANS[it] != 99)]).sum() / w[(VOTE == "pasok") & (ANS[it] != 99)].sum())
with open(OUT / "PASOK_RESULTS.csv", "w", newline="", encoding="utf-8") as f:
    wr = csv.DictWriter(f, fieldnames=list(results[0].keys()))
    wr.writeheader()
    wr.writerows(results)

# --- εκτίμηση ψήφου: αναγωγή επί των εγκύρων (αναλογική κατανομή των αναποφάσιστων) — αναπαραγώγιμη μέθοδος
valid = PARTY
est = OrderedDict()
for c in range(1, 16):
    est[c] = float(w[valid & (q6 == c)].sum() / w[valid].sum() * 100)
VOTE_EST = {"method": "Αναγωγή επί των εγκύρων: τα μερίδια των κομμάτων υπολογίζονται μόνο στους ερωτώμενους που δηλώνουν κόμμα (εξαιρούνται αναποφάσιστοι, λευκό/άκυρο, αποχή και «δεν απαντώ»). Ισοδυναμεί με αναλογική κατανομή των αναποφάσιστων. Δεν χρησιμοποιείται άλλη παραδοχή.",
            "base_n": int(valid.sum()), "shares": {str(c): est[c] for c in est},
            "pollAverage": {str(c): POLL_AVG[CODE2KEY[c]] for c in range(1, 16)}, "pollsUsed": [meta_polls[p] for p in POLL_USED],
            "pollValues": {p[0]: polls[p] for p in POLL_USED}}

# --- διασταυρώσεις
age3 = np.where(np.isin(AGE, ["17-24", "25-34"]), "17–34", np.where(np.isin(AGE, ["35-44", "45-54"]), "35–54", "55+"))
vote5 = np.where(VOTE == "nd", "ΝΔ", np.where(VOTE == "elas", "ΕΛ.Α.Σ.", np.where(VOTE == "pasok", "ΠΑΣΟΚ", np.where(PARTY, "Άλλα κόμματα", "Χωρίς κομματική επιλογή"))))
pv5 = np.where(q8 == 1, "ΝΔ", np.where(q8 == 2, "ΣΥΡΙΖΑ", np.where(q8 == 3, "ΠΑΣΟΚ", np.where((q8 >= 4) & (q8 <= 9), "Άλλα κόμματα", "Δεν ψήφισε / λοιπά"))))
econ3 = np.where(ECON <= 2, "Καλή", np.where(ECON == 3, "Κακή", "Πολύ κακή"))
DIMS = OrderedDict([
    ("Φύλο", (np.where(GEN == "male", "Άνδρες", "Γυναίκες"), ["Άνδρες", "Γυναίκες"])),
    ("Ηλικία", (age3, ["17–34", "35–54", "55+"])),
    ("Εκπαίδευση", (np.array([{"low": "Έως υποχρεωτική", "medium": "Μέση", "high": "Ανώτατη"}[e] for e in EDU]), ["Έως υποχρεωτική", "Μέση", "Ανώτατη"])),
    ("Περιοχή", (np.array([dict(QD["D4"]["options"])[r] for r in REG5]), [lab for _, lab in QD["D4"]["options"]])),
    ("Τύπος περιοχής", (np.where(URB == 1, "Αστική", "Αγροτική / ημιαστική"), ["Αστική", "Αγροτική / ημιαστική"])),
    ("Οικονομική κατάσταση", (econ3, ["Καλή", "Κακή", "Πολύ κακή"])),
    ("Πρόθεση ψήφου", (vote5, ["ΝΔ", "ΕΛ.Α.Σ.", "ΠΑΣΟΚ", "Άλλα κόμματα", "Χωρίς κομματική επιλογή"])),
    ("Ψήφος 2023", (pv5, ["ΝΔ", "ΣΥΡΙΖΑ", "ΠΑΣΟΚ", "Άλλα κόμματα", "Δεν ψήφισε / λοιπά"])),
])
crosstabs = []
CT = OrderedDict()
for it, sm in summary.items():
    q = QD[sm["qid"]]
    if sm["section"] == "Z":
        continue
    CT[it] = OrderedDict()
    for dim, (labels, groups) in DIMS.items():
        CT[it][dim] = OrderedDict()
        for gname in groups:
            if q["type"] == "multi":
                base = (MULTI[q["id"]][q["options"][0][0]] != -1) & (labels == gname)
            else:
                base = (ANS[it] != -1) & (labels == gname)
            nb = int(base.sum())
            vals = {}
            for c, lab in q["options"]:
                hit = (MULTI[q["id"]][c] == 1) if q["type"] == "multi" else (ANS[it] == c)
                v = pct(hit, base) if nb else float("nan")
                vals[str(c)] = v
                crosstabs.append({"question_id": sm["qid"], "item_id": it, "dimension": dim, "group": gname, "option_code": c, "option_label": lab,
                                  "pct_weighted": "" if nb == 0 else round(v, 2), "base_n_unweighted": nb, "small_base": nb < 50})
            CT[it][dim][gname] = {"n": nb, "pct": vals}
with open(OUT / "PASOK_CROSSTABS.csv", "w", newline="", encoding="utf-8") as f:
    wr = csv.DictWriter(f, fieldnames=list(crosstabs[0].keys()))
    wr.writeheader()
    wr.writerows(crosstabs)

# --- έλεγχοι ποιότητας
checks = []


def check(name, ok, detail=""):
    checks.append({"check": name, "pass": bool(ok), "detail": detail})


check("500 εγγραφές, μοναδικά ID", len(set(RESP_IDS)) == N == 500 and len(set(r["personaId"] for r in R)) == N, f"{N} εγγραφές")
for it, sm in summary.items():
    if sm["type"] in ("single", "battery", "scale"):
        tot = sum(r["pct"] for r in sm["results"])
        check(f"{it}: άθροισμα 100% (αμοιβαία αποκλειόμενες)", abs(tot - 100) < 0.01, f"{tot:.4f}")
    elif sm["type"] == "multi":
        mx = QD[sm["qid"]]["maxChoices"]
        q = QD[sm["qid"]]
        base = MULTI[q["id"]][q["options"][0][0]] != -1
        per = sum(MULTI[q["id"]][c].clip(0) for c, _ in q["options"])
        check(f"{it}: έως {mx} αναφορές ανά ερωτώμενο, χωρίς κανονικοποίηση", per[base].max() <= mx and per[base].min() >= 1,
              f"αναφορές/ερωτώμενο {per[base].min()}–{per[base].max()}, άθροισμα {sum(r['pct'] for r in sm['results']):.1f}%")
for qid in ("Q7", "Q10"):
    check(f"{qid}: παράλειψη όταν Q6 ≠ κόμμα", ((ANS[qid] == -1) == NONPARTY).all(), f"βάση {int(PARTY.sum())}")
check("Q9: παράλειψη όταν Q6 ≠ κόμμα", ((MULTI["Q9"][97] == -1) == NONPARTY).all())
own_in_q9 = sum(1 for i in range(N) if PARTY[i] and Q9_CODE.get(VOTE[i]) is not None and MULTI["Q9"][Q9_CODE[VOTE[i]]][i] == 1)
check("Q9: δεν περιλαμβάνει το κόμμα της Q6", own_in_q9 == 0, f"{own_in_q9} περιπτώσεις")
check("Q9: «Κανένα άλλο»/ΔΓ αποκλειστικά", all((MULTI["Q9"][97][i] + MULTI["Q9"][99][i] == 0) or sum(MULTI["Q9"][c][i] for c in m9) == 1 for i in range(N) if PARTY[i]))
check("Q8: «δεν είχα δικαίωμα ψήφου» μόνο 17–24", set(AGE[q8 == 93]) <= {"17-24"})
for it, sm in CT.items():
    for dim, gg in sm.items():
        tot_n = sum(x["n"] for x in gg.values())
        if tot_n != summary[it]["baseN"]:
            check(f"{it}/{dim}: διασταύρωση από τις ίδιες εγγραφές", False, f"{tot_n} ≠ {summary[it]['baseN']}")
check("Διασταυρώσεις: άθροισμα βάσεων ομάδων = βάση ερώτησης (όλες)", all(c["pass"] for c in checks if "/" in c["check"]) and True)
check("Στάθμιση: περιθώρια", RAKE["maxDeviation"] < 1e-3, json.dumps(RAKE, ensure_ascii=False))
# απόκλιση από άγκυρες (κλάση A): αναμενόμενη διακύμανση κλήρωσης 500 εγγραφών
anchor_dev = []
for it, sm in summary.items():
    if sm["evidenceClass"] not in ("A",) or not sm["target"] or sm["qid"] == "Q8":
        continue
    tg = sm["target"]
    tsum = sum(v for v in tg.values() if isinstance(v, (int, float)))
    for r in sm["results"]:
        if str(r["code"]) in tg:
            tv = tg[str(r["code"])] * (100 / tsum if sm["type"] != "multi" else 1)
            anchor_dev.append({"item": it, "code": r["code"], "label": r["label"], "target": tv, "result": r["pct"], "diff": r["pct"] - tv})
VE_DEV = [{"code": c, "label": LABEL[("Q6", c)], "pollAverage": POLL_AVG[CODE2KEY[c]], "estimate": est[c], "diff": est[c] - POLL_AVG[CODE2KEY[c]]} for c in range(1, 16)]

# --- αναπαραγωγιμότητα: hash του αρχείου εγγραφών
sha = hashlib.sha256(open(OUT / "PASOK_SYNTHETIC_RESPONDENTS.csv", "rb").read()).hexdigest()
lab_novote = {k: float(sum(w[i] for i in range(N) if R[i]["labVoteNoPolls"] == k) / w.sum() * 100) for k in set(r["labVoteNoPolls"] for r in R)}

report = {
    "meta": {"title": Q["title"], "character": Q["character"], "population": Q["population"], "referencePeriod": Q["referencePeriod"], "n": N, "seed": SEED,
             "labModel": P["modelVersion"], "labModelSnapshot": P["modelSnapshot"], "population_id": P["populationId"], "populationName": P["populationName"],
             "voteScenario": P["scenario"], "respondentsSha256": sha, "raking": RAKE},
    "sources": SRC, "questionnaire": Q, "summary": summary, "crosstabs": CT, "voteEstimate": VOTE_EST, "checks": checks,
    "anchorDeviation": anchor_dev, "voteEstimateDeviation": VE_DEV, "labNoPollsVote": lab_novote,
    "classCounts": {c: sorted({sm["qid"] for sm in summary.values() if sm["evidenceClass"] == c and sm["section"] != "Z"}) for c in ("A", "A/B", "B", "C")},
}
json.dump(report, open(OUT / "report_data.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=float)
print(f"OK {N} εγγραφές · sha256 {sha[:16]} · στάθμιση deff {RAKE['designEffect']:.2f} [{RAKE['min']:.2f}, {RAKE['max']:.2f}]")
print("έλεγχοι:", sum(c["pass"] for c in checks), "/", len(checks))
for c in checks:
    if not c["pass"]:
        print("  FAIL", c)
print("εκτίμηση ψήφου vs μέσος όρος:", " · ".join(f"{d['label']} {d['estimate']:.1f}/{d['pollAverage']:.1f}" for d in VE_DEV))
mad = np.mean([abs(d["diff"]) for d in anchor_dev]) if anchor_dev else 0
print(f"άγκυρες A: {len(anchor_dev)} τιμές, μέση |διαφορά| {mad:.2f} π.μ., μέγιστη {max(abs(d['diff']) for d in anchor_dev):.2f}")
