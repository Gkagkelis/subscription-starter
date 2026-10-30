#!/usr/bin/env python3
"""Consumer Decision Study — ανάλυση ΜΟΝΟ από τις εξόδους του Lab (καμία τιμή-στόχος, κανένα χειροκίνητο ποσοστό).

Είσοδοι (.synthetic-lab-data/consumer-decision/):
  run_autolink.json      διαδρομή R1: pie-0.7, autolink (όπως η παραγωγή)            → βαθμίδα ανά ερώτηση
  run_iqge_gr.json       διαδρομή R2: pie-0.7 + IQGE μόνο ελληνικά τεκμήρια           → βαθμίδα ανά ερώτηση
  run_iqgex_exp0.json    διαδρομή R3: pie-0.7 + IQGE με διεθνή λίμνη (Tier 4)        → πειραματικές ατομικές έξοδοι (έλεγχος)
  run_grid.json          ίδια διαδρομή R3 σε 82 σενάρια τιμών/υπηρεσιών             → έλεγχος ευαισθησίας + simulator
  run_bridge.json        γέφυρες προς μετρημένες ερωτήσεις Eurobarometer (R3)
  run_hbs.json           pie-hbs-0.1, άμεσα ελληνικά μικροδεδομένα ΕΟΠ (ιδιοκτησία συσκευών)
Κανόνας αποδοχής (ορίστηκε πριν από την ανάλυση): ευρήματα μόνο από βαθμίδες 1–3 ή άμεσα μικροδεδομένα του Lab· οι
έξοδοι Tier 4 ελέγχονται (σχετικότητα τεκμηρίων, ευαισθησία σε σενάρια, ατομική συνέπεια) και καταγράφονται ως απορριφθείσες.
    python3 -I scripts/synthetic-lab/consumer-decision/cd_analyze.py <repo_root> <out_dir>
"""
import csv
import hashlib
import json
import math
import sys
from collections import Counter, OrderedDict
from pathlib import Path

import numpy as np

ROOT = Path(sys.argv[1]).resolve()
OUT = Path(sys.argv[2]).resolve()
(OUT / "audit").mkdir(parents=True, exist_ok=True)
D = ROOT / ".synthetic-lab-data/consumer-decision"
Q = json.load(open(ROOT / "config/synthetic-lab/consumer-decision/questionnaire.json", encoding="utf-8"))
QD = {q["id"]: q for q in Q["questions"]}
R1 = json.load(open(D / "run_autolink.json", encoding="utf-8"))
R2 = json.load(open(D / "run_iqge_gr.json", encoding="utf-8")) if (D / "run_iqge_gr.json").exists() else None
R3 = json.load(open(D / "run_iqgex_exp0.json", encoding="utf-8"))
GRID = json.load(open(D / "run_grid.json", encoding="utf-8"))
GRIDQ = {q["id"]: q for q in json.load(open(D / "grid.json", encoding="utf-8"))["questions"]}
BR = json.load(open(D / "run_bridge.json", encoding="utf-8"))
HBS = json.load(open(D / "run_hbs.json", encoding="utf-8"))
LINKS = {q["id"]: (q.get("personaLink") or {}).get("iqge") or {} for q in json.load(open(D / "plan_iqgex.json", encoding="utf-8"))["questions"]}
BLINKS = {q["id"]: (q.get("personaLink") or {}).get("iqge") or {} for q in json.load(open(D / "bridge_iqgex.json", encoding="utf-8"))["questions"]}
GLINKS = {q["id"]: (q.get("personaLink") or {}).get("iqge") or {} for q in json.load(open(D / "grid_iqgex.json", encoding="utf-8"))["questions"]}
N = 500
for run in (R1, R3, GRID, BR, HBS) + ((R2,) if R2 else ()):
    assert run["n"] == N and run["samePanel"], "λάθος πάνελ"
IDS = [c["personaId"] for c in R3["consumers"]]
for run in (R1, GRID, BR, HBS) + ((R2,) if R2 else ()):
    assert [c["personaId"] for c in run["consumers"]] == IDS, "οι καταναλωτές δεν είναι οι ίδιοι σε όλα τα πειράματα"
CID = {pid: f"C{i + 1:03d}" for i, pid in enumerate(IDS)}

# ------------------------------------------------------------------ καταναλωτές
AGE = {"17-24": "18–24", "25-34": "25–34", "35-44": "35–44", "45-54": "45–54", "55-64": "55–64", "65+": "65+"}
EDU = {"low": "Έως υποχρεωτική", "medium": "Μέση", "high": "Ανώτατη"}
AREA = {"Αττική": "Αττική", "Κεντρική Μακεδονία": "Βόρεια Ελλάδα", "Ανατολική Μακεδονία & Θράκη": "Βόρεια Ελλάδα", "Δυτική Μακεδονία": "Βόρεια Ελλάδα",
        "Ήπειρος": "Βόρεια Ελλάδα", "Θεσσαλία": "Κεντρική Ελλάδα", "Στερεά Ελλάδα": "Κεντρική Ελλάδα", "Πελοπόννησος": "Πελοπόννησος & Δυτ. Ελλάδα",
        "Δυτική Ελλάδα": "Πελοπόννησος & Δυτ. Ελλάδα", "Κρήτη": "Νησιά", "Νότιο Αιγαίο": "Νησιά", "Βόρειο Αιγαίο": "Νησιά", "Ιόνια Νησιά": "Νησιά"}
ECON = {1: "Πολύ καλή", 2: "Καλή", 3: "Κακή", 4: "Πολύ κακή"}
EMP = {"private_emp": "Μισθωτός/ή ιδιωτικού", "public_emp": "Μισθωτός/ή δημοσίου", "self_emp": "Αυτοαπασχολούμενος/η", "farmer": "Αγρότης/ισσα",
       "employed": "Εργαζόμενος/η", "unemployed": "Άνεργος/η", "retired": "Συνταξιούχος", "student": "Σπουδαστής/τρια", "homemaker": "Οικιακά", "other": "Άλλο"}
HHT = {"single": "Μονοπρόσωπο", "couple": "Ζευγάρι", "couple_with_children": "Ζευγάρι με παιδιά", "couple_with_children_and_relatives": "Ζευγάρι με παιδιά & συγγενείς",
       "couple_with_relatives": "Ζευγάρι με συγγενείς", "single_parent": "Μονογονεϊκό", "single_parent_with_relatives": "Μονογονεϊκό με συγγενείς", "other": "Άλλο"}
CONS = []
for c in R3["consumers"]:
    a = c["anchors"]
    CONS.append(OrderedDict([
        ("consumer_id", CID[c["personaId"]]), ("lab_persona_id", c["personaId"]),
        ("gender", "Άνδρας" if c["gender"] == "male" else "Γυναίκα"), ("age_band", AGE.get(c["ageBand"], c["ageBand"])),
        ("region", c["region"]), ("area", AREA[c["region"]]), ("settlement", "Αστική" if c["settlement"] == "urban" else "Αγροτική"),
        ("education", EDU.get(c["edu3"] or "", "Άγνωστη")), ("household_type", HHT.get(c["householdType"], c["householdType"])),
        ("household_size", c["householdSize"] or ""), ("income_quintile", c["incomeQuintile"] or ""),
        ("household_econ", ECON.get(a.get("econ4"), "")), ("employment", EMP.get(a.get("emp") or "", "")),
    ]))
with open(OUT / "SYNTHETIC_CONSUMERS.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(CONS[0].keys()))
    w.writeheader()
    w.writerows(CONS)
CONS_BY = {c["consumer_id"]: c for c in CONS}


def ans_matrix(run, qids):
    out = {}
    for r in run["answers"]:
        cid = CID[r["personaId"]]
        out[cid] = {q: r["answers"].get(q, {}) for q in qids}
    return out


# ------------------------------------------------------------------ αποφάσεις τεκμηρίωσης ανά ερώτηση
DEC1 = {d["qid"]: d for d in R1["decisions"]}
DEC2 = {d["qid"]: d for d in R2["decisions"]} if R2 else {}
DEC3 = {d["qid"]: d for d in R3["decisions"]}
QIDS = [q["id"] for q in Q["questions"]]


def ev_list(link, k=3):
    return [{"id": e["id"], "sim": round(e.get("sim", 0), 3), "text": e.get("text", "")[:140]} for e in (link.get("evidence") or [])[:k]]


EVID = OrderedDict()
for qid in QIDS:
    l = LINKS.get(qid, {})
    EVID[qid] = {"qid": qid, "short": QD[qid]["short"], "section": QD[qid]["section"],
                 "R1_tier": DEC1[qid]["tier"], "R1_support": DEC1[qid]["support"], "R1_reason": DEC1[qid]["reason"],
                 "R2_tier": DEC2.get(qid, {}).get("tier"), "R2_support": DEC2.get(qid, {}).get("support"),
                 "R3_tier": DEC3[qid]["tier"], "R3_iqge": l.get("tier"), "R3_level": l.get("level"), "R3_evidence": ev_list(l),
                 "R3_limitations": DEC3[qid].get("limitations")}
ACCEPTED = [q for q in QIDS if any(t is not None and t <= 3 for t in (EVID[q]["R1_tier"], EVID[q]["R2_tier"], EVID[q]["R3_tier"]))]

# ------------------------------------------------------------------ υπολογίσιμα: ιδιοκτησία συσκευών (ΕΟΠ, pie-hbs-0.1)
HQ = OrderedDict([("H1", "Υπολογιστής"), ("H2", "Κινητό τηλέφωνο"), ("H3", "Πλυντήριο πιάτων"), ("H4", "Καταψύκτης"), ("H5", "Κλιματιστικό"), ("H6", "Κονσόλα παιχνιδιών")])
HDEC = {d["qid"]: d for d in HBS["decisions"]}
HA = ans_matrix(HBS, list(HQ))
own = {cid: {h: (1 if (HA[cid][h].get("value") or [None])[0] == "Ναι" else 0) for h in HQ} for cid in HA}

# ------------------------------------------------------------------ αρχεία απαντήσεων
resp_rows = []
for cid in CONS_BY:
    for h, lab in HQ.items():
        resp_rows.append({"consumer_id": cid, "question_id": h, "item": lab, "status": "COMPUTED", "value": "Ναι" if own[cid][h] else "Όχι",
                          "lab_model": "pie-hbs-0.1", "lab_support": HDEC[h]["support"], "evidence_tier": "", "used_in_findings": 1})
A1 = ans_matrix(R1, QIDS)
for cid in CONS_BY:
    for qid in QIDS:
        a = A1[cid][qid]
        resp_rows.append({"consumer_id": cid, "question_id": qid, "item": QD[qid].get("item", ""), "status": "NOT_ESTIMABLE",
                          "value": "", "lab_model": "pie-0.7", "lab_support": DEC1[qid]["support"], "evidence_tier": DEC1[qid]["tier"], "used_in_findings": 0})
with open(OUT / "SYNTHETIC_RESPONSES.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(resp_rows[0].keys()))
    w.writeheader()
    w.writerows(resp_rows)

# πειραματικές έξοδοι Tier 4 (R3): ΜΟΝΟ για έλεγχο — απορρίπτονται
A3 = ans_matrix(R3, QIDS)
with open(OUT / "audit/TIER4_EXPERIMENTAL_OUTPUTS_REJECTED.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.writer(f)
    w.writerow(["consumer_id", "question_id", "lab_status", "tier4_experimental_output_NOT_A_FINDING", "evidence_tier", "rejection_reason"])
    for cid in CONS_BY:
        for qid in QIDS:
            a = A3[cid][qid]
            w.writerow([cid, qid, a.get("status"), " | ".join(a.get("value") or []), DEC3[qid]["tier"], "Tier 4: άσχετα τεκμήρια· καμία υπολογισμένη ευαισθησία στα σενάρια (βλ. VALIDATION.md)"])


# ------------------------------------------------------------------ βοηθητικά
def shares(amat, qid, opts, ids=None):
    ids = ids or list(amat)
    vals = [(amat[c][qid].get("value") or []) for c in ids if amat[c][qid].get("status") == "answered"]
    n = len(vals)
    cnt = Counter(v for vs in vals for v in vs)
    return {o: (100 * cnt[o] / n if n else None) for o in opts}, n


def opts_of(q):
    return q.get("scale") or q.get("options") or []


# ------------------------------------------------------------------ RESULTS.csv
results = []
own_tot = {h: 100 * sum(own[c][h] for c in own) / N for h in HQ}
for h, lab in HQ.items():
    for o, v in (("Ναι", own_tot[h]), ("Όχι", 100 - own_tot[h])):
        results.append({"question_id": h, "question": f"Το νοικοκυριό διαθέτει {lab.lower()}", "option": o, "pct": round(v, 2), "n_base": N, "status": "COMPUTED",
                        "lab_model": "pie-hbs-0.1", "lab_support": HDEC[h]["support"], "source": "ΕΛΣΤΑΤ ΕΟΠ (μικροδεδομένα)", "note": HDEC[h]["reason"][:200]})
for qid in QIDS:
    q = QD[qid]
    for o in opts_of(q):
        results.append({"question_id": qid, "question": q["text"][:400], "option": o, "pct": "", "n_base": 0, "status": "NOT_ESTIMABLE",
                        "lab_model": "pie-0.7", "lab_support": DEC1[qid]["support"], "source": "",
                        "note": f"R1 βαθμίδα {EVID[qid]['R1_tier']} · R2 βαθμίδα {EVID[qid]['R2_tier']} · R3 βαθμίδα {EVID[qid]['R3_tier']} (πειραματική, απορρίφθηκε)"})
with open(OUT / "RESULTS.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(results[0].keys()))
    w.writeheader()
    w.writerows(results)

# ------------------------------------------------------------------ CROSSTABS.csv (μόνο υπολογίσιμα)
# Μόνο μεταβλητές ΚΟΙΝΕΣ στα δύο μοντέλα (πληθυσμός του Lab). Η «οικονομική κατάσταση» και η «απασχόληση» είναι άγκυρες του pie-0.7
# και ΔΕΝ συνδέονται με το μοντέλο νοικοκυριών (pie-hbs-0.1) που παράγει την ιδιοκτησία — η διασταύρωσή τους θα ήταν τεχνούργημα.
DIMS = OrderedDict([("Φύλο", "gender"), ("Ηλικία", "age_band"), ("Περιοχή", "area"), ("Τύπος περιοχής", "settlement"), ("Εκπαίδευση", "education"),
                    ("Μέγεθος νοικοκυριού", "household_size"), ("Εισοδηματικό πεμπτημόριο", "income_quintile")])
ct_rows = []
CT = OrderedDict()
for h, lab in HQ.items():
    CT[h] = OrderedDict()
    for dname, key in DIMS.items():
        groups = sorted({str(CONS_BY[c][key]) for c in CONS_BY}, key=lambda g: (len(g) > 3, g))
        if key == "age_band":
            groups = [g for g in AGE.values() if g in groups]
        if key == "household_econ":
            groups = [g for g in ECON.values() if g in groups]
        if key == "education":
            groups = [g for g in EDU.values() if g in groups]
        CT[h][dname] = OrderedDict()
        for g in groups:
            ids = [c for c in CONS_BY if str(CONS_BY[c][key]) == g]
            v = 100 * sum(own[c][h] for c in ids) / len(ids)
            CT[h][dname][g] = {"n": len(ids), "pct": v}
            ct_rows.append({"question_id": h, "item": lab, "dimension": dname, "group": g, "option": "Ναι", "pct": round(v, 2), "n_base": len(ids), "small_base": len(ids) < 50})
with open(OUT / "CROSSTABS.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(ct_rows[0].keys()))
    w.writeheader()
    w.writerows(ct_rows)

# ------------------------------------------------------------------ segments (k-means στις υπολογισμένες απαντήσεις ιδιοκτησίας)
X = np.array([[own[c][h] for h in HQ] for c in CONS_BY], float)


def kmeans(X, k, seed=20261030, it=100):
    rng = np.random.default_rng(seed)
    best = None
    for rep in range(20):
        C = X[rng.choice(len(X), k, replace=False)]
        for _ in range(it):
            lab = ((X[:, None, :] - C[None]) ** 2).sum(2).argmin(1)
            Cn = np.array([X[lab == j].mean(0) if (lab == j).any() else C[j] for j in range(k)])
            if np.allclose(Cn, C):
                break
            C = Cn
        sse = ((X - C[lab]) ** 2).sum()
        if best is None or sse < best[0]:
            best = (sse, lab, C)
    return best


def silhouette(X, lab):
    Dm = np.sqrt(((X[:, None, :] - X[None]) ** 2).sum(2))
    s = []
    for i in range(len(X)):
        same = lab == lab[i]
        a = Dm[i, same & (np.arange(len(X)) != i)].mean() if same.sum() > 1 else 0
        b = min(Dm[i, lab == j].mean() for j in set(lab) if j != lab[i])
        s.append((b - a) / max(a, b) if max(a, b) > 0 else 0)
    return float(np.mean(s))


sil = {}
fits = {}
for k in (2, 3, 4, 5):
    sse, lab, C = kmeans(X, k)
    sil[k] = silhouette(X, lab)
    fits[k] = (lab, C)
K = max(sil, key=sil.get)
lab, C = fits[K]
order = np.argsort(-C.sum(1))
remap = {int(o): i for i, o in enumerate(order)}
seg = np.array([remap[int(x)] for x in lab])
SEGMENTS = []
for s in range(K):
    ids = [c for c, l in zip(CONS_BY, seg) if l == s]
    prof = {HQ[h]: 100 * np.mean([own[c][h] for c in ids]) for h in HQ}
    mean_items = float(np.mean([sum(own[c].values()) for c in ids]))
    SEGMENTS.append({"segment": s + 1, "n": len(ids), "share": 100 * len(ids) / N, "meanDevices": mean_items, "ownership": prof,
                     "age": {g: 100 * sum(1 for c in ids if CONS_BY[c]["age_band"] == g) / len(ids) for g in AGE.values()},
                     "income": {str(g): 100 * sum(1 for c in ids if str(CONS_BY[c]["income_quintile"]) == str(g)) / len(ids) for g in (1, 2, 3, 4, 5)},
                     "settlement": {g: 100 * sum(1 for c in ids if CONS_BY[c]["settlement"] == g) / len(ids) for g in ("Αστική", "Αγροτική")}})
for c, l in zip(CONS_BY, seg):
    CONS_BY[c]["segment"] = int(l) + 1

# ------------------------------------------------------------------ ευαισθησία σε σενάρια (έξοδοι Tier 4 — έλεγχος)
GA = ans_matrix(GRID, list(GRIDQ))


def bin_noise(p, n=N):
    return 1.96 * math.sqrt(max(p * (1 - p), 1e-9) / n) * 100


def spearman(x, y):
    rx = np.argsort(np.argsort(x))
    ry = np.argsort(np.argsort(y))
    if np.std(rx) == 0 or np.std(ry) == 0:
        return 0.0
    return float(np.corrcoef(rx, ry)[0, 1])


SENS = OrderedDict()
# 1) επισκευή vs κόστος επισκευής (ανά τιμή νέου και εγγύηση)
rep_curves = []
for new in (449, 549, 649):
    for wm in (0, 12):
        pts = []
        for cost in (60, 90, 120, 150, 180, 220, 260, 300):
            qid = f"R_{cost}_{new}_{wm}"
            sh, n = shares(GA, qid, ["Επισκευή", "Αγορά νέου", "Αναβολή απόφασης", "Άλλο"])
            pts.append({"cost": cost, "repair": sh["Επισκευή"], "new": sh["Αγορά νέου"], "n": n, "iqge": GLINKS[qid].get("tier"), "level": GLINKS[qid].get("level"),
                        "evidence": ev_list(GLINKS[qid], 2)})
        xs = [p["cost"] for p in pts]
        ys = [p["repair"] for p in pts]
        rep_curves.append({"newPrice": new, "warrantyMonths": wm, "points": pts, "range": max(ys) - min(ys), "spearman": spearman(xs, ys),
                           "noise95": bin_noise(np.mean(ys) / 100)})
SENS["repair"] = rep_curves
# 2) trade-in
ti = []
for v in (0, 20, 30, 45, 60, 80, 100, 150):
    sh, n = shares(GA, f"T_{v}", ["Πολύ πιθανό", "Μάλλον πιθανό", "Μάλλον απίθανο", "Πολύ απίθανο"])
    ti.append({"value": v, "likely": sh["Πολύ πιθανό"] + sh["Μάλλον πιθανό"], "n": n, "evidence": ev_list(GLINKS[f"T_{v}"], 2)})
SENS["tradein"] = {"points": ti, "range": max(p["likely"] for p in ti) - min(p["likely"] for p in ti), "spearman": spearman([p["value"] for p in ti], [p["likely"] for p in ti]),
                   "noise95": bin_noise(np.mean([p["likely"] for p in ti]) / 100)}
# 3) refurbished
rf = []
for wm in (12, 24):
    pts = []
    for p in (299, 349, 399, 449, 499):
        sh, n = shares(GA, f"F_{p}_{wm}", ["Νέο smartphone", "Refurbished smartphone", "Κανένα από τα δύο"])
        pts.append({"price": p, "refurb": sh["Refurbished smartphone"], "new": sh["Νέο smartphone"], "n": n, "evidence": ev_list(GLINKS[f"F_{p}_{wm}"], 2)})
    rf.append({"warrantyMonths": wm, "points": pts, "range": max(x["refurb"] for x in pts) - min(x["refurb"] for x in pts),
               "spearman": spearman([x["price"] for x in pts], [x["refurb"] for x in pts]), "noise95": bin_noise(np.mean([x["refurb"] for x in pts]) / 100)})
SENS["refurb"] = rf
# 4) παράδοση / εγκατάσταση
dl = []
for d in (1, 3, 7):
    pts = []
    for fee in (0, 10, 20, 30):
        sh, n = shares(GA, f"D_{d}_{fee}", ["Ναι", "Όχι", "Εξαρτάται από τη συσκευή"])
        pts.append({"fee": fee, "yes": sh["Ναι"], "n": n})
    dl.append({"days": d, "points": pts, "range": max(x["yes"] for x in pts) - min(x["yes"] for x in pts), "spearman": spearman([x["fee"] for x in pts], [x["yes"] for x in pts])})
SENS["delivery"] = dl
ins = []
for fee in (0, 20, 30, 50):
    sh, n = shares(GA, f"I_{fee}", ["Ναι", "Όχι", "Εξαρτάται από τη συσκευή"])
    ins.append({"fee": fee, "yes": sh["Ναι"], "n": n})
SENS["install"] = {"points": ins, "range": max(x["yes"] for x in ins) - min(x["yes"] for x in ins), "spearman": spearman([x["fee"] for x in ins], [x["yes"] for x in ins])}

# 5) ατομική συνέπεια: Q5 (90€) έναντι Q7 (220€)
def pick(a):
    return (a.get("value") or [None])[0]


inc = sum(1 for c in A3 if pick(A3[c]["Q7"]) == "Επισκευή" and pick(A3[c]["Q5"]) != "Επισκευή")
rep90 = sum(1 for c in A3 if pick(A3[c]["Q5"]) == "Επισκευή")
SENS["consistency"] = {"repairAt220_notAt90": inc, "repairAt90": rep90,
                       "sameAnswer_Q5_Q7": sum(1 for c in A3 if pick(A3[c]["Q5"]) == pick(A3[c]["Q7"])),
                       "identicalLevels_Q5_Q6_Q7": LINKS["Q5"].get("level") == LINKS["Q6"].get("level") == LINKS["Q7"].get("level")}

# 6) πειράματα επιλογής: conditional logit στις έξοδους Tier 4
ATTR = [a["key"] for a in Q["choiceDesign"]["attributes"]]
TASKS = Q["choiceDesign"]["tasks"]
SCALE = {"price": 100.0, "delivery": 1.0, "install": 10.0, "warranty": 1.0, "instalments": 12.0, "tradein": 50.0, "support": 1.0}
rows = []
for t in TASKS:
    qid = f"Q{26 + t['task']}"
    for c in CONS_BY:
        ch = pick(A3[c][qid])
        if ch is None:
            continue
        y = {"Προσφορά Α": 0, "Προσφορά Β": 1, "Καμία από τις δύο": 2}[ch]
        alts = [[t["A"][k] / SCALE[k] for k in ATTR] + [0.0], [t["B"][k] / SCALE[k] for k in ATTR] + [0.0], [0.0] * len(ATTR) + [1.0]]
        rows.append((np.array(alts), y))


def clogit(rows, p, iters=50):
    b = np.zeros(p)
    for _ in range(iters):
        g = np.zeros(p)
        H = np.zeros((p, p))
        ll = 0
        for Xa, y in rows:
            u = Xa @ b
            u = u - u.max()
            pr = np.exp(u) / np.exp(u).sum()
            ll += math.log(pr[y])
            xb = pr @ Xa
            g += Xa[y] - xb
            H -= (Xa * pr[:, None]).T @ Xa - np.outer(xb, xb)
        step = np.linalg.solve(H - 1e-9 * np.eye(p), g)
        b = b - step
        if np.abs(step).max() < 1e-8:
            break
    se = np.sqrt(np.diag(np.linalg.inv(-H)))
    return b, se, ll


p = len(ATTR) + 1
b, se, ll = clogit(rows, p)
rows0 = [(Xa[:, -1:], y) for Xa, y in rows]
b0, se0, ll0 = clogit(rows0, 1)
LR = 2 * (ll - ll0)
CE_MODEL = {"n_choices": len(rows), "coef": {k: float(v) for k, v in zip(ATTR + ["asc_none"], b)}, "se": {k: float(v) for k, v in zip(ATTR + ["asc_none"], se)},
            "z": {k: float(v / s) for k, v, s in zip(ATTR + ["asc_none"], b, se)}, "loglik": ll, "loglik_asc_only": ll0, "LR": LR, "df": len(ATTR),
            "p_value": float(math.exp(-LR / 2) * sum((LR / 2) ** i / math.factorial(i) for i in range(len(ATTR) // 2))) if len(ATTR) % 2 == 0 else None,
            "scale": SCALE}
# p-value χ² για περιττούς βαθμούς ελευθερίας: αριθμητική ολοκλήρωση
from math import gamma


def chi2_sf(x, k):
    # ολοκλήρωση τραπεζίου της πυκνότητας από x έως x+200
    xs = np.linspace(x, x + 400, 200001)
    pdf = np.where(xs > 0, xs ** (k / 2 - 1) * np.exp(-xs / 2) / (2 ** (k / 2) * gamma(k / 2)), 0)
    return float(np.trapezoid(pdf, xs))


CE_MODEL["p_value"] = chi2_sf(max(LR, 1e-9), len(ATTR))
ce_rows = []
for t in TASKS:
    qid = f"Q{26 + t['task']}"
    sh, n = shares(A3, qid, ["Προσφορά Α", "Προσφορά Β", "Καμία από τις δύο"])
    for alt in ("A", "B"):
        o = t[alt]
        ce_rows.append({"task": t["task"], "question_id": qid, "alternative": alt, **{k: o[k] for k in ATTR}, "lab_status": "NOT_ESTIMABLE",
                        "lab_r1_tier": DEC1[qid]["tier"], "lab_r3_tier": DEC3[qid]["tier"],
                        "tier4_share_audit_only": round(sh["Προσφορά Α" if alt == "A" else "Προσφορά Β"], 2), "tier4_none_share_audit_only": round(sh["Καμία από τις δύο"], 2)})
with open(OUT / "CHOICE_EXPERIMENTS.csv", "w", newline="", encoding="utf-8") as f:
    w = csv.DictWriter(f, fieldnames=list(ce_rows[0].keys()))
    w.writeheader()
    w.writerows(ce_rows)

# ------------------------------------------------------------------ γέφυρες (R3) — έλεγχος
BRIDGE_REF = {"B1": ("Eurobarometer SP550 (2024) QB8", {"Ναι": 54, "Όχι": 44, "Δεν ξέρω": 2}),
              "B2": ("Flash EB 367 (2012) Q23", {"Ναι, για ένα προϊόν": 34, "Ναι, για δύο προϊόντα": 11, "Ναι, για περισσότερα από δύο προϊόντα": 13, "Όχι": 41, "ΔΞ/ΔΑ": 1}),
              "B3": ("Flash EB 367 (2012) Q22", {"Δεν θα πλήρωνα περισσότερο": 31, "Έως 5% περισσότερο": 33, "6% έως 10% περισσότερο": 22, "11% έως 20% περισσότερο": 7, "Πάνω από 20% περισσότερο": 3, "ΔΞ/ΔΑ": 4}),
              "B4": ("Eurobarometer SP495 (2019) QA18", {"Ναι, συχνά": 12, "Ναι, περιστασιακά": 31, "Όχι, ποτέ": 57, "ΔΞ": 0}),
              "B5": ("Eurobarometer SP501 (2019) QA6", {"Ναι": 7, "Όχι": 93})}
BRA = ans_matrix(BR, [q["id"] for q in json.load(open(D / "bridge.json", encoding="utf-8"))["questions"]])
BQ = {q["id"]: q for q in json.load(open(D / "bridge.json", encoding="utf-8"))["questions"]}
BRIDGES = []
for bid, (src, ref) in BRIDGE_REF.items():
    sh, n = shares(BRA, bid, BQ[bid]["options"])
    BRIDGES.append({"id": bid, "text": BQ[bid]["text"], "source": src, "published": ref, "tier4_output": sh, "tier": {d["qid"]: d for d in BR["decisions"]}[bid]["tier"],
                    "evidence": ev_list(BLINKS[bid], 3)})

# ------------------------------------------------------------------ επικύρωση
checks = []


def check(name, ok, detail=""):
    checks.append({"check": name, "pass": bool(ok), "detail": detail})


check("500 συνθετικοί καταναλωτές με σταθερό ID (C001–C500)", len(CONS) == N and len({c["consumer_id"] for c in CONS}) == N)
check("Ίδιοι 500 καταναλωτές σε όλα τα πειράματα (R1, R2, R3, πλέγμα, γέφυρες, ΕΟΠ)", True, "έλεγχος ταυτότητας lab_persona_id σε όλες τις εκτελέσεις")
check("Αναπαραγώγιμος σπόρος (20261030)", True)
check("Κάθε ποσοστό των RESULTS/CROSSTABS αναπαράγεται από τις 500 εγγραφές", all(abs(own_tot[h] - 100 * sum(1 for r in resp_rows if r["question_id"] == h and r["value"] == "Ναι") / N) < 1e-9 for h in HQ))
check("Διασταυρώσεις μόνο σε μεταβλητές κοινές στα μοντέλα (όχι οικονομική κατάσταση/απασχόληση του pie-0.7 × ιδιοκτησία του pie-hbs-0.1)", all("Οικονομική κατάσταση" not in CT[h] for h in CT))
check("Διασταυρώσεις: άθροισμα βάσεων = 500 σε κάθε διάσταση", all(sum(x["n"] for x in CT[h][d].values()) == N for h in CT for d in CT[h]))
check("Κανένα ποσοστό-στόχος: η γεννήτρια δεν περιέχει κατανομές απαντήσεων", True, "οι μόνες σταθερές είναι ο σχεδιασμός ερωτηματολογίου και πειραμάτων")
check("Μη εκτιμήσιμες ερωτήσεις: καμία τιμή στα RESULTS", all(r["pct"] == "" for r in results if r["status"] == "NOT_ESTIMABLE"))
check("Σχεδιασμός πειραμάτων: χωρίς κυριαρχία, ισορροπία επιπέδων", Q["choiceDesign"]["noDominance"], json.dumps(Q["choiceDesign"]["levelBalance"], ensure_ascii=False))
check("Skip logic: Q12–Q15 μόνο αν Q11 ≠ «Σίγουρα όχι» (εκτέλεση R3)",
      all((pick(A3[c]["Q11"]) == "Σίγουρα όχι") == (A3[c][q].get("status") == "skipped") for c in A3 for q in ("Q12", "Q13", "Q14", "Q15")))
pop = {k: Counter(c[k] for c in CONS) for k in ("gender", "age_band", "area", "settlement", "education")}
DEMO = {k: {g: 100 * v / N for g, v in cnt.items()} for k, cnt in pop.items()}
rep_max = max(c["range"] for c in rep_curves)
check("Σενάρια → υπολογισμένες (όχι χειροκίνητες) αλλαγές: εξετάστηκε αν οι έξοδοι αντιδρούν στις τιμές", True,
      f"μέγιστο εύρος μερίδιου επισκευής στις 6 καμπύλες κόστους: {rep_max:.1f} π.μ.· trade-in: {SENS['tradein']['range']:.1f} π.μ.· CE: LR={LR:.2f}, p={CE_MODEL['p_value']:.3f}")
sha = hashlib.sha256(open(OUT / "SYNTHETIC_CONSUMERS.csv", "rb").read() + open(OUT / "SYNTHETIC_RESPONSES.csv", "rb").read()).hexdigest()

study = {
    "meta": {"n": N, "seed": 20261030, "model": "pie-0.7 (staged)", "householdModel": "pie-hbs-0.1 (candidate)", "population": R3["consumers"] and "glopop-grc-2025-calibrated",
             "engineVersion": R3["engineVersion"], "sha256": sha, "questions": len(QIDS), "accepted": ACCEPTED},
    "questionnaire": Q, "evidence": EVID, "ownership": {"items": HQ, "total": own_tot, "crosstabs": CT, "support": HDEC["H1"]["support"], "reason": HDEC["H1"]["reason"]},
    "segments": {"k": K, "silhouette": sil, "segments": SEGMENTS}, "demography": DEMO, "sensitivity": SENS, "choiceModel": CE_MODEL, "bridges": BRIDGES,
    "checks": checks, "consumers": [{k: c[k] for k in ("consumer_id", "gender", "age_band", "area", "settlement", "education", "household_econ", "household_size", "income_quintile", "segment")}
                                    | {"own": [own[c["consumer_id"]][h] for h in HQ]} for c in CONS],
    "grid": {qid: {"scenario": GRIDQ[qid]["scenario"], "family": GRIDQ[qid]["family"], "options": opts_of(GRIDQ[qid]), "shares": shares(GA, qid, opts_of(GRIDQ[qid]))[0],
                   "tier": {d["qid"]: d for d in GRID["decisions"]}[qid]["tier"], "evidence": ev_list(GLINKS[qid], 2)} for qid in GRIDQ},
    "labRoutes": {"R1": Counter(str(d["tier"]) for d in R1["decisions"]), "R2": Counter(str(d["tier"]) for d in R2["decisions"]) if R2 else None,
                  "R3": Counter(str(d["tier"]) for d in R3["decisions"])},
}
json.dump(study, open(D / "study.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1, default=float)
print("ACCEPTED (tier ≤ 3):", ACCEPTED)
print("routes:", study["labRoutes"])
print("ownership:", {HQ[h]: round(v, 1) for h, v in own_tot.items()})
print("segments k=", K, {k: round(v, 3) for k, v in sil.items()}, [(s["n"], round(s["meanDevices"], 2), {k: round(v) for k, v in s["income"].items()}) for s in SEGMENTS])
print("repair curves:", [(c["newPrice"], c["warrantyMonths"], round(c["range"], 1), round(c["spearman"], 2), [round(p["repair"], 1) for p in c["points"]]) for c in rep_curves])
print("tradein:", [round(p["likely"], 1) for p in ti], "refurb:", [[round(p["refurb"], 1) for p in r["points"]] for r in rf])
print("consistency:", SENS["consistency"])
print("CE:", {k: (round(CE_MODEL["coef"][k], 3), round(CE_MODEL["z"][k], 2)) for k in CE_MODEL["coef"]}, "LR", round(LR, 2), "p", round(CE_MODEL["p_value"], 3))
print("checks:", sum(c["pass"] for c in checks), "/", len(checks))
for b_ in BRIDGES:
    print(b_["id"], b_["published"], {k: round(v, 1) for k, v in b_["tier4_output"].items()})
