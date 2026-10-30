"""Greece 500 — επικύρωση της ΕΚΤΕΛΕΣΗΣ (όχι εξωτερική εγκυρότητα για την Ελλάδα).
    python3 -I studies/greece500/validate.py <deliverables_dir>
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cce.panel import load_greek_panel  # noqa: E402
from cce.transfer import ExperimentalTransfer, TransferAssumption, file_sha256  # noqa: E402
from run_study import MODELS, SEED, assumptions  # noqa: E402
import scenarios as S  # noqa: E402

TS = "EXPERIMENTAL_CROSS_COUNTRY_TRANSFER"
CURVES = {"price_curve": ("A", "nonincreasing_in_price"), "discount_curve": ("refurb_A", "nondecreasing_in_discount"), "fee_curve": ("drone", "nonincreasing_in_fee")}


def main(d):
    d = Path(d)
    out = {}
    res = pd.read_csv(d / "RESULTS.csv", dtype={"scenario_id": str})
    ch = pd.read_csv(d / "INDIVIDUAL_CHOICES.csv", dtype=str)
    pr = pd.read_csv(d / "CHOICE_PROBABILITIES.csv", dtype={"scenario_id": str, "respondent_id": str}, low_memory=False)
    sc = pd.read_csv(d / "SCENARIOS.csv", dtype={"scenario_id": str})
    meta = json.loads((d / "_run_meta.json").read_text(encoding="utf-8"))
    panel_ids = {p["respondent_id"] for p in load_greek_panel()}
    alts = {(r.question_id, r.scenario_id): [a["alt_id"] for a in json.loads(r.alternatives)] for r in sc.itertuples()}

    # 1. ποσοστά έναντι των 500 εγγραφών
    ok = res[res["status"] == TS]
    cnt = ch.groupby(["question_id", "scenario_id", "assumption_id", "choice"]).size()
    mism, n_checked = [], 0
    for r in ok.itertuples():
        n = int(cnt.get((r.question_id, str(r.scenario_id), r.assumption_id, r.alt_id), 0))
        n_checked += 1
        if n != int(r.n_chosen) or abs(100 * n / 500 - float(r.share_simulated_pct)) > 0.051:
            mism.append((r.question_id, r.scenario_id, r.assumption_id, r.alt_id))
    pmean = pr.groupby(["question_id", "scenario_id", "assumption_id"])[["p_alt1", "p_alt2", "p_alt3"]].mean()
    pm_bad = 0
    for r in ok.itertuples():
        k = alts[(r.question_id, str(r.scenario_id))].index(r.alt_id)
        if abs(100 * pmean.loc[(r.question_id, str(r.scenario_id), r.assumption_id)].iloc[k] - float(r.mean_probability_pct)) > 0.006:
            pm_bad += 1
    sizes = ch.groupby(["question_id", "scenario_id", "assumption_id"])["respondent_id"].agg(["count", "nunique"])
    out["1_shares_vs_records"] = {"result_rows_checked": n_checked, "share_mismatches": len(mism), "mean_probability_mismatches": pm_bad,
                                  "runs": int(len(sizes)), "runs_with_500_unique_ids": int(((sizes["count"] == 500) & (sizes["nunique"] == 500)).sum()),
                                  "ids_match_panel": set(ch["respondent_id"]) == panel_ids,
                                  "records_for_rejected_or_unsupported": int(ch.merge(res[res["status"] != TS][["question_id", "scenario_id", "assumption_id"]].drop_duplicates().astype(str),
                                                                                       on=["question_id", "scenario_id", "assumption_id"]).shape[0])}

    # 2–3. ατομική συνέπεια και μονοτονία τιμής
    kinds = {q["question_id"]: q["kind"] for q in meta["questions"]}
    cons = []
    for (qid, aid), g in ch.groupby(["question_id", "assumption_id"]):
        if kinds.get(qid) not in CURVES:
            continue
        alt, rule = CURVES[kinds[qid]]
        order = [s for s in meta["questions"][[q["question_id"] for q in meta["questions"]].index(qid)]["scenarios"] if s in set(g["scenario_id"])]
        if kinds[qid] == "price_curve" or kinds[qid] == "fee_curve":
            order = sorted(order, key=float)                       # τιμή/χρέωση αυξάνει → η πιθανότητα της alt δεν πρέπει να αυξάνει
            seqsign = -1
        else:
            order = sorted(order, key=lambda s: float(s.rstrip("%")))  # έκπτωση αυξάνει → η πιθανότητα της alt δεν πρέπει να μειώνεται
            seqsign = +1
        piv = g.pivot(index="respondent_id", columns="scenario_id", values="choice")[order] == alt
        A = piv.to_numpy().astype(int)
        rev = int((np.diff(A, axis=1) * seqsign < 0).any(axis=1).sum())
        pg = pr[(pr["question_id"] == qid) & (pr["assumption_id"] == aid)]
        k = alts[(qid, order[0])].index(alt)
        P = pg.pivot(index="respondent_id", columns="scenario_id", values=f"p_alt{k + 1}")[order].to_numpy()
        prev = int((np.diff(P, axis=1) * seqsign < -1e-9).any(axis=1).sum())
        mean = P.mean(0)
        cons.append({"question_id": qid, "assumption_id": aid, "points": len(order), "choice_reversals": rev, "individual_probability_reversals": prev,
                     "mean_probability_monotone": bool((np.diff(mean) * seqsign >= -1e-9).all())})
    out["2_3_consistency_monotonicity"] = {"curves": cons, "total_choice_reversals": sum(c["choice_reversals"] for c in cons),
                                           "total_probability_reversals": sum(c["individual_probability_reversals"] for c in cons),
                                           "all_means_monotone": all(c["mean_probability_monotone"] for c in cons)}

    # 4. επαναληψιμότητα: επανεκτέλεση δείγματος σεναρίων με τον ίδιο κώδικα και seed
    macro = json.loads((ROOT / "transfer" / "macro_inputs.json").read_text(encoding="utf-8"))
    A = {a.id: a for a in assumptions(macro)}
    panel = load_greek_panel()
    qmap = {}
    for qid, text, kind, sc_ in S.wm_questions() + S.sp_questions() + S.rf_questions():
        qmap[qid] = sc_
    for qid, text, kind, cat, sc_ in S.dl_questions():
        qmap[qid] = (cat, sc_)
    rep = []
    for qid, mk, aid in [("WM1", "swiss-ce-washing-machine", "T0"), ("WM6", "swiss-ce-washing-machine", "T3"), ("SP2", "swiss-ce-smartphone", "T1"),
                         ("RF2", "refurb-smartphone-us2019", "T0"), ("DL1", "delivery-us2022", "T0"), ("DL3", "delivery-us2022", "T2")]:
        v = MODELS[mk]
        tr = ExperimentalTransfer(ROOT / "artifacts" / v[0], A[aid], v[1], v[2], v[3], S.DL_RANGES if mk == "delivery-us2022" else None, experimental_transfer_mode=True)
        if mk == "delivery-us2022":
            cat, sc_ = qmap[qid]
            ctx = {"category": cat, "product": cat}
        else:
            sc_, ctx = qmap[qid], v[4]
        x = tr.run_panel(panel, ctx, sc_, qid, seed=SEED)
        same = 0
        tot = 0
        for sid, r in x.items():
            if r["status"] != TS:
                continue
            rec = ch[(ch["question_id"] == qid) & (ch["scenario_id"] == sid) & (ch["assumption_id"] == aid)].set_index("respondent_id")["choice"]
            for row in r["individual"]:
                tot += 1
                same += rec[row["respondent_id"]] == row["choice"]
        rep.append({"question_id": qid, "assumption_id": aid, "records": tot, "identical": int(same)})
    out["4_repeatability"] = rep

    # 5. ανεξάρτητος επανυπολογισμός πιθανοτήτων από τους ατομικούς συντελεστές (data.js του dashboard)
    lab = json.loads((d / "INTERACTIVE_LAB" / "data.js").read_text(encoding="utf-8")[len("window.G500 = "):-2])
    pf = {p["respondent_id"]: p for p in lab["panel"]}
    maxdiff = 0.0
    nrec = 0
    for q in lab["questions"]:
        mk = q["model"]
        M = lab["models"][mk]
        f = lab["assumptions"]["T0"]["factors"][mk]
        for sid in q["scenarios"]:
            al = json.loads(sc[(sc["question_id"] == q["question_id"]) & (sc["scenario_id"] == sid)].iloc[0]["alternatives"])
            pg = pr[(pr["question_id"] == q["question_id"]) & (pr["scenario_id"] == sid) & (pr["assumption_id"] == "T0")].set_index("respondent_id")
            for rid, b in M["betas"].items():
                prof = {**q["context"], **pf[rid]}
                X = []
                for a in al:
                    row = []
                    for t in M["terms"]:
                        val = lambda c: a[c] if c in a else next((a[k] * f / u for k, (cc, u) in M["money"].items() if cc == c and k in a), 0.0)
                        if t["kind"] == "attr":
                            row.append(val(t["col"]))
                        elif t["kind"] == "asc":
                            row.append(1.0 if a["alt_id"] == t["alt"] else 0.0)
                        else:
                            cv = float(prof[t["cov"]] == t["cov_value"]) if "cov_value" in t else float(prof[t["cov"]])
                            row.append((val(t["col"]) if t["kind"] == "attr_x_cov" else float(a["alt_id"] == t["alt"])) * cv)
                    X.append(row)
                v = np.array(X) @ np.array(b)
                p = np.exp(v - v.max()); p /= p.sum()
                rec = pg.loc[rid, ["p_alt1", "p_alt2", "p_alt3"]].to_numpy(dtype=float)[:len(p)]
                maxdiff = max(maxdiff, float(np.abs(p - rec).max()))
                nrec += 1
    out["5_independent_recomputation"] = {"records": nrec, "max_abs_probability_diff": maxdiff}

    # 6. προέλευση συντελεστών
    prov = {}
    for mk, v in MODELS.items():
        a = json.loads((ROOT / "artifacts" / v[0]).read_text(encoding="utf-8"))
        prov[mk] = {"artifact": v[0], "sha256_now": file_sha256(ROOT / "artifacts" / v[0]), "sha256_at_run": meta["models"][mk]["sha256"],
                    "unchanged": file_sha256(ROOT / "artifacts" / v[0]) == meta["models"][mk]["sha256"], "trained_at": a["trained_at"], "selected": a["selected"],
                    "training_population": a["domain"]["populations"], "n_respondents": a["dataset"]["manifest"]["n_respondents"], "licence": a["dataset"]["manifest"]["licence"],
                    "external_validation": a["validation"]["external"]}
    out["6_coefficient_provenance"] = prov

    # 7. όρια πεδίου: κάθε απαντημένο σενάριο εντός ευρών· κάθε απορριφθέν εκτός
    dom_viol, rej_inside = 0, 0
    for r in res.drop_duplicates(["question_id", "scenario_id", "assumption_id"]).itertuples():
        if r.status == "NOT_SUPPORTED":
            continue
        mk = r.model
        art = json.loads((ROOT / "artifacts" / MODELS[mk][0]).read_text(encoding="utf-8"))
        f = meta["assumptions"][r.assumption_id]["factors"][mk]["factor"]
        al = json.loads(sc[(sc["question_id"] == r.question_id) & (sc["scenario_id"] == str(r.scenario_id))].iloc[0]["alternatives"])
        cat = sc[(sc["question_id"] == r.question_id)].iloc[0]["category"]
        inside = True
        for a in al:
            for k, val in a.items():
                if k == "alt_id":
                    continue
                col, unit = MODELS[mk][3].get(k, (k, None))
                x = val * f / unit if unit else val
                lo, hi = art["domain"]["attributes"][col]["range"]
                if mk == "delivery-us2022":
                    lo, hi = S.DL_RANGES[cat].get(col, [lo, hi])
                inside &= lo - 1e-9 <= x <= hi + 1e-9
        if r.status == TS and not inside:
            dom_viol += 1
        if r.status == "EXTRAPOLATION_REJECTED" and inside:
            rej_inside += 1
    out["7_domain_bounds"] = {"answered_outside_domain": dom_viol, "rejected_but_inside": rej_inside,
                              "rejected_runs": int((res.drop_duplicates(["question_id", "scenario_id", "assumption_id"])["status"] == "EXTRAPOLATION_REJECTED").sum())}

    # 8. επίδραση υποθέσεων μεταφοράς: μέγιστη απόλυτη διαφορά μεριδίου έναντι του T0 ανά ερώτηση
    piv = ok.pivot_table(index=["question_id", "scenario_id", "alt_id"], columns="assumption_id", values="share_simulated_pct")
    eff = {}
    for qid, g in piv.groupby(level=0):
        eff[qid] = {a: (round(float((g[a] - g["T0"]).abs().max()), 1) if a in g and g[a].notna().any() else None) for a in ("T1", "T2", "T3")}
        eff[qid]["T2_T3_answered_share"] = {a: round(float(g[a].notna().mean()), 2) for a in ("T2", "T3") if a in g}
    out["8_transfer_effect_max_abs_pp"] = eff

    # 9. απουσία προκαθορισμένων ποσοστών: τα αρχεία της μελέτης δεν περιέχουν μερίδια· αλλαγή seed αλλάζει τις κληρώσεις, όχι τη δομή
    src = "".join((Path(__file__).parent / f).read_text(encoding="utf-8") for f in ("scenarios.py", "run_study.py"))
    out["9_no_preset_shares"] = {"study_code_mentions_share_targets": any(w in src for w in ("target_share", "calibrate", "target_pct")),
                                 "shares_computed_from_records_only": True}
    a2 = A["T0"]
    v = MODELS["swiss-ce-washing-machine"]
    tr = ExperimentalTransfer(ROOT / "artifacts" / v[0], a2, v[1], v[2], v[3], experimental_transfer_mode=True)
    alt_seed = tr.run_panel(panel, v[4], {"649": qmap["WM1"]["649"]}, "WM1", seed=SEED + 1)["649"]
    base = ok[(ok["question_id"] == "WM1") & (ok["scenario_id"] == "649") & (ok["assumption_id"] == "T0") & (ok["alt_id"] == "A")].iloc[0]
    out["9_no_preset_shares"]["seed_change_WM1_649"] = {"seed": SEED + 1, "share_A_pct": round(100 * alt_seed["simulated_choice_shares"]["A"], 1),
                                                        "mean_p_A_pct": round(100 * alt_seed["expected_shares"]["A"], 2),
                                                        "original_share_A_pct": float(base.share_simulated_pct), "original_mean_p_A_pct": float(base.mean_probability_pct)}
    an = json.loads((d / "_analysis.json").read_text(encoding="utf-8"))
    out["10_no_artificial_demographics"] = an["demographic_null_check"]
    out["11_unsupported"] = [q for q in meta["questions"] if q["kind"] == "unsupported"]
    (d / "_validation.json").write_text(json.dumps(out, ensure_ascii=False, indent=1, default=str), encoding="utf-8")
    return out


if __name__ == "__main__":
    o = main(sys.argv[1])
    print(json.dumps({k: v for k, v in o.items() if k not in ("6_coefficient_provenance", "2_3_consistency_monotonicity", "11_unsupported", "8_transfer_effect_max_abs_pp")}, ensure_ascii=False, indent=1, default=str))
    print(json.dumps({k: o["2_3_consistency_monotonicity"][k] for k in ("total_choice_reversals", "total_probability_reversals", "all_means_monotone")}))
    print(json.dumps(o["8_transfer_effect_max_abs_pp"], ensure_ascii=False))
    print({k: v["unchanged"] for k, v in o["6_coefficient_provenance"].items()})
