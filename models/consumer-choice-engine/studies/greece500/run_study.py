"""Greece 500 — εκτέλεση της CCE 0.1 σε 500 ελληνικά συνθετικά προφίλ σε experimental_transfer_mode.

Για κάθε υποστηριζόμενο σενάριο × υπόθεση μεταφοράς: μετατροπή ευρώ → μονάδες μοντέλου, πύλη, προσομοίωση πάνελ
(σταθερά IDs, σταθερό seed, κοινοί τυχαίοι αριθμοί ανά ερώτηση), αποθήκευση 500 ατομικών πιθανοτήτων και επιλογών.
ΤΑ ΠΟΣΟΣΤΑ ΥΠΟΛΟΓΙΖΟΝΤΑΙ ΜΟΝΟ ΑΠΟ ΤΙΣ ΑΤΟΜΙΚΕΣ ΕΓΓΡΑΦΕΣ.
    python3 -I studies/greece500/run_study.py <out_dir>
"""
from __future__ import annotations

import csv
import json
import sys
import time
from pathlib import Path

import numpy as np

ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(Path(__file__).resolve().parent))

from cce.engine import ChoiceEngine  # noqa: E402
from cce.panel import load_greek_panel  # noqa: E402
from cce.transfer import TRANSFER_STATUS, ExperimentalTransfer, TransferAssumption, file_sha256  # noqa: E402
import scenarios as S  # noqa: E402

SEED = 20261030
ART = ROOT / "artifacts"
MODELS = {  # model key → (artifact, χώρα, έτος πεδίου, χρηματικά πεδία, κατηγορία/πλαίσιο)
    "swiss-ce-washing-machine": ("cce-0.1-swiss-ce-washing-machine.json", "CH", "2022", {"price_eur": ("price_100chf", 100)}, {"category": "washing_machine"}),
    "swiss-ce-smartphone": ("cce-0.1-swiss-ce-smartphone.json", "CH", "2022", {"price_eur": ("price_100chf", 100)}, {"category": "smartphone"}),
    "refurb-smartphone-us2019": ("cce-0.1-refurb-smartphone-us2019.json", "US", "2019", {"price_eur": ("price_100usd", 100)},
                                 {"category": "smartphone_new_vs_refurbished", "brand": "apple"}),
    "delivery-us2022": ("cce-0.1-delivery-us2022.json", "US", "2022", {"fee_eur": ("fee_usd", 1)}, None),
}
CI_DRAWS = 200


def assumptions(macro):
    return [TransferAssumption(macro, "T0", "Βασικό: PPP ιδιωτικής κατανάλωσης + εισόδημα με ε = 0,5", "ppp_income", 0.5),
            TransferAssumption(macro, "T1", "Μόνο PPP (ε = 0): ίδια αγοραστική δύναμη, χωρίς προσαρμογή εισοδήματος", "ppp_income", 0.0),
            TransferAssumption(macro, "T2", "Ίσο μερίδιο εισοδήματος (ε = 1)", "ppp_income", 1.0),
            TransferAssumption(macro, "T3", "Απλή ονομαστική ισοτιμία (μόνο για σύγκριση· οικονομικά αφελής)", "nominal")]


def questions():
    for qid, text, kind, sc in S.wm_questions():
        yield qid, text, kind, "swiss-ce-washing-machine", None, sc
    for qid, text, kind, sc in S.sp_questions():
        yield qid, text, kind, "swiss-ce-smartphone", None, sc
    for qid, text, kind, sc in S.rf_questions():
        yield qid, text, kind, "refurb-smartphone-us2019", None, sc
    for qid, text, kind, cat, sc in S.dl_questions():
        yield qid, text, kind, "delivery-us2022", {"category": cat, "product": cat}, sc


def ci_scenarios():
    """Σενάρια όπου υπολογίζεται και αβεβαιότητα παραμέτρων (Krinsky–Robb) στη βασική υπόθεση."""
    return {("WM1", "649"), ("WM2", "649"), ("WM3", "649"), ("WM4", "749"), ("WM5", "449"), ("WM6", "Βασικό(A) vs Οικονομικό(B)"), ("WM6", "Premium(A) vs Βασικό(B)"),
            ("WM6", "Premium(A) vs Οικονομικό(B)"), ("SP1", "349"), ("SP2", "349"), ("SP3", "349"), ("SP5", "Βασικό(A) vs Οικονομικό(B)"), ("SP5", "Premium(A) vs Βασικό(B)"),
            ("RF1", "30%"), ("RF2", "κατασκευαστής"), ("RF3", "open box"), ("DL1", "1.00"), ("DL2", "1.00"), ("DL3", "2.00"), ("DL4", "χωρίς προστασία")}


def main(out_dir):
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    t0 = time.time()
    macro = json.loads((ROOT / "transfer" / "macro_inputs.json").read_text(encoding="utf-8"))
    A = assumptions(macro)
    panel = load_greek_panel()
    assert len(panel) == 500 and len({p["respondent_id"] for p in panel}) == 500
    sha = {k: file_sha256(ART / v[0]) for k, v in MODELS.items()}
    runners = {(mk, a.id): ExperimentalTransfer(ART / v[0], a, v[1], v[2], v[3], S.DL_RANGES if mk == "delivery-us2022" else None, experimental_transfer_mode=True)
               for mk, v in MODELS.items() for a in A}
    want_ci = ci_scenarios()
    scen_rows, res_rows, choice_rows, prob_rows, meta = [], [], [], [], {"questions": [], "assumptions": {}, "models": {}}
    for a in A:
        meta["assumptions"][a.id] = {"label": a.label, "method": a.method, "epsilon": a.epsilon,
                                     "factors": {mk: runners[(mk, a.id)].conv for mk in MODELS}}
    for mk, v in MODELS.items():
        meta["models"][mk] = {"artifact": v[0], "sha256": sha[mk], **{k: x for k, x in runners[(mk, "T0")].stamp().items() if k not in ("assumption_id", "assumption", "conversion")}}
    for qid, text, kind, mk, ctx, sc in questions():
        ctx = ctx or MODELS[mk][4]
        qmeta = {"question_id": qid, "text": text, "kind": kind, "model": mk, "context": ctx, "scenarios": list(sc)}
        meta["questions"].append(qmeta)
        for sid, alts in sc.items():
            scen_rows.append({"question_id": qid, "scenario_id": sid, "model": mk, "category": ctx["category"], "alternatives": json.dumps(alts, ensure_ascii=False)})
        for a in A:
            r = runners[(mk, a.id)]
            for sid, alts in sc.items():
                ud = CI_DRAWS if (a.id == "T0" and (qid, sid) in want_ci) else 0
                x = r.run_panel(panel, ctx, {sid: alts}, task_key=qid, seed=SEED, uncertainty_draws=ud)[sid]
                ids = [al["alt_id"] for al in alts]
                if x["status"] != TRANSFER_STATUS:
                    for alt in ids:
                        res_rows.append({"question_id": qid, "scenario_id": sid, "assumption_id": a.id, "model": mk, "alt_id": alt, "status": x["status"],
                                         "n": 0, "n_chosen": "", "share_simulated_pct": "", "mean_probability_pct": "", "ci95_low_pct": "", "ci95_high_pct": "",
                                         "conversion_factor": round(r.conv["factor"], 4), "note": " | ".join(x["reasons"])[:300]})
                    continue
                ind = x["individual"]
                for row in ind:
                    choice_rows.append((row["respondent_id"], qid, sid, a.id, row["choice"]))
                    prob_rows.append((row["respondent_id"], qid, sid, a.id, *[round(row["p"][i], 5) for i in ids]))
                for alt in ids:
                    nch = sum(row["choice"] == alt for row in ind)
                    mp = float(np.mean([row["p"][alt] for row in ind]))
                    ci = x.get("expected_shares_ci95", {}).get(alt)
                    res_rows.append({"question_id": qid, "scenario_id": sid, "assumption_id": a.id, "model": mk, "alt_id": alt, "status": TRANSFER_STATUS,
                                     "n": len(ind), "n_chosen": nch, "share_simulated_pct": round(100 * nch / len(ind), 1), "mean_probability_pct": round(100 * mp, 2),
                                     "ci95_low_pct": round(100 * ci[0], 1) if ci else "", "ci95_high_pct": round(100 * ci[1], 1) if ci else "",
                                     "conversion_factor": round(r.conv["factor"], 4), "note": ""})
        print(f"{qid} ok ({time.time() - t0:.0f}s)", flush=True)
    # μη υποστηριζόμενες ερωτήσεις: μόνο η απόφαση της πύλης (καμία απάντηση)
    for uid, text, cat, alts, mk in S.UNSUPPORTED_PROBES:
        r = runners[(mk, "T0")]
        x = r.run_panel(panel, {"category": cat, "product": cat, "brand": "apple"}, {uid: alts}, task_key=uid, seed=SEED)[uid]
        assert x["status"] == "NOT_SUPPORTED", (uid, x["status"])
        meta["questions"].append({"question_id": uid, "text": text, "kind": "unsupported", "model": mk, "gate": x["status"], "reasons": x["reasons"]})
        res_rows.append({"question_id": uid, "scenario_id": uid, "assumption_id": "T0", "model": mk, "alt_id": "", "status": "NOT_SUPPORTED", "n": 0, "n_chosen": "",
                         "share_simulated_pct": "", "mean_probability_pct": "", "ci95_low_pct": "", "ci95_high_pct": "", "conversion_factor": "", "note": " | ".join(x["reasons"])[:300]})
    # αρχεία
    with open(out / "SCENARIOS.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(scen_rows[0]))
        w.writeheader(); w.writerows(scen_rows)
    with open(out / "RESULTS.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.DictWriter(f, fieldnames=list(res_rows[0]))
        w.writeheader(); w.writerows(res_rows)
    with open(out / "INDIVIDUAL_CHOICES.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["respondent_id", "question_id", "scenario_id", "assumption_id", "choice"])
        w.writerows(choice_rows)
    with open(out / "CHOICE_PROBABILITIES.csv", "w", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        w.writerow(["respondent_id", "question_id", "scenario_id", "assumption_id", "p_alt1", "p_alt2", "p_alt3"])
        for row in prob_rows:
            w.writerow(list(row) + [""] * (7 - len(row)))
    for mk, v in MODELS.items():
        assert file_sha256(ART / v[0]) == sha[mk]
    meta["runtime_seconds"] = round(time.time() - t0, 1)
    meta["seed"] = SEED
    (out / "_run_meta.json").write_text(json.dumps(meta, ensure_ascii=False, indent=1), encoding="utf-8")
    print("done", len(res_rows), len(choice_rows), meta["runtime_seconds"])


if __name__ == "__main__":
    main(sys.argv[1])
