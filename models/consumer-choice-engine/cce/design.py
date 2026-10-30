"""CCE — σχεδιασμός ελάχιστου ελληνικού πειράματος επιλογής και υπολογισμός μεγέθους δείγματος ΑΠΟ ΤΟΝ ΣΧΕΔΙΑΣΜΟ.

1. Παράγει πίνακα σχεδιασμού (D0-αποδοτικός: καλύτερος από N τυχαίους, ισορροπημένους ως προς τα επίπεδα πίνακες)
   χωρισμένο σε blocks· ένας ερωτώμενος βλέπει ένα block.
2. Υπολογίζει τον πίνακα πληροφορίας Fisher ΑΝΑ ΕΡΩΤΩΜΕΝΟ (μέσος όρος στα blocks) υπό σενάρια ευαισθησίας στην τιμή.
3. Για κάθε στόχο (γραμμικός συνδυασμός συντελεστών c, ελάχιστο ανιχνεύσιμο μέγεθος δ):
       N = (z_{1-α/2} + z_{1-β})² · c'Σ₁c / δ²       (de Bekker-Grob et al., 2015, Patient 8:373–384)
   όπου Σ₁ = I₁⁻¹. Οι προσαυξήσεις για απώλειες ποιοτικού ελέγχου και για ετερογένεια (panel) δηλώνονται ρητά.
4. Προαιρετικά ελέγχει τον αναλυτικό υπολογισμό με προσομοίωση (εμπειρική ισχύς)· η προσομοίωση ελέγχει ΜΟΝΟ τη μέθοδο
   υπολογισμού, δεν παράγει δεδομένα για εκπαίδευση.
Εξάγει τον σχεδιασμό στη μορφή που διαβάζει το cce.ingest.wide_tasks, ώστε τα δεδομένα πεδίου να περνούν απευθείας στην εκπαίδευση.
    python3 -I cce_cli.py design specs/gr-min-experiment-washing-machine.json <out_dir> [--simulate 100]
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from scipy.stats import norm

from .models import ConditionalLogit
from .schema import build_design


def model_row(alt: str, lv: dict) -> dict:
    """Από επίπεδα σε ευρώ → στήλες μοντέλου (ίδιες για όλες τις εναλλακτικές· 0 όπου δεν ισχύει)."""
    r = {"repair_cost_100eur": 0.0, "price_100eur": 0.0, "repair_days": 0, "repair_warranty_m": 0, "delivery_days": 0, "tradein_100eur": 0.0,
         "warranty_years": 0, "refurb_warranty_m": 0, "refurb_oem": 0}
    if alt == "repair":
        r.update(repair_cost_100eur=lv["repair_cost_eur"] / 100, repair_days=lv["repair_days"], repair_warranty_m=lv["repair_warranty_m"])
    elif alt == "new":
        r.update(price_100eur=lv["price_new_eur"] / 100, delivery_days=lv["delivery_days"], tradein_100eur=lv["tradein_eur"] / 100, warranty_years=lv["warranty_years"])
    elif alt == "refurb":
        r.update(price_100eur=lv["price_refurb_eur"] / 100, refurb_warranty_m=lv["refurb_warranty_m"], refurb_oem=lv["refurb_oem"])
    return r


def task_matrix(spec, task_levels: dict) -> np.ndarray:
    rows = []
    for alt in spec["alternatives"]:
        mr = model_row(alt, task_levels.get(alt, {}))
        rows.append([1.0 if t == f"asc_{alt}" else float(mr.get(t, 0.0)) for t in spec["terms"]])
    return np.array(rows)


def info(Xs, beta):
    I = 0
    for X in Xs:
        v = X @ beta
        p = np.exp(v - v.max())
        p /= p.sum()
        I = I + X.T @ (np.diag(p) - np.outer(p, p)) @ X
    return I


def generate(spec):
    """Dp-αποδοτικός: ελαχιστοποιεί το D-error στους συντελεστές του σεναρίου design_prior_scenario."""
    rng = np.random.default_rng(spec["seed"])
    R = spec["rows"]
    best, best_d = None, np.inf
    p = len(spec["terms"])
    beta0 = prior_beta(spec, spec["price_sensitivity_scenarios"][spec["design_prior_scenario"]])
    for _ in range(spec["candidates"]):
        cols = {alt: {a: rng.permutation(np.resize(levels, R)) for a, levels in attrs.items()} for alt, attrs in spec["attributes"].items()}
        tasks = [{alt: {a: (cols[alt][a][i].item()) for a in cols[alt]} for alt in cols} for i in range(R)]
        I = info([task_matrix(spec, t) for t in tasks], beta0)
        sign, logdet = np.linalg.slogdet(I)
        d = np.inf if sign <= 0 else np.exp(-logdet / p)   # D-error = det(I)^(-1/p)
        if d < best_d:
            best, best_d = tasks, d
    order = rng.permutation(R)
    B = spec["blocks"]
    blocks = {str(b + 1): [best[i] for i in order[b::B]] for b in range(B)}
    return blocks, best_d


def _range(spec, col):
    """Εύρος (max − min) του χαρακτηριστικού στις μονάδες του μοντέλου (ημέρες, μήνες, 100 €)."""
    vals = []
    for alt, attrs in spec["attributes"].items():
        base = {a: lv[0] for a, lv in attrs.items()}
        for k, levels in attrs.items():
            got = [model_row(alt, {**base, k: v})[col] for v in levels]
            if len(set(got)) > 1:
                vals += got
    return max(vals) - min(vals)


def delta(spec, t, s):
    """Ελάχιστο ανιχνεύσιμο μέγεθος σε μονάδες χρησιμότητας ανά μονάδα του συνδυασμού."""
    if "mde_rel" in t:
        return t["mde_rel"] * s
    (k,) = t["contrast"].keys()
    if "mde_eur_range" in t:
        return t["mde_eur_range"] / 100 * s / _range(spec, k)
    return t["mde_eur"] / 100 * s


def prior_beta(spec, s):
    """Συντελεστές στους οποίους υπολογίζεται η πληροφορία: τιμή/κόστος επισκευής = −s, trade-in = +s,
    λοιπά χαρακτηριστικά ίσα με το ελάχιστο ενδιαφέρον μέγεθος (συντηρητικό), σταθερές 0."""
    b = dict.fromkeys(spec["terms"], 0.0)
    b["price_100eur"] = -s
    b["repair_cost_100eur"] = -s
    b["tradein_100eur"] = s
    # αν δύο στόχοι αφορούν το ίδιο χαρακτηριστικό, ισχύει ο ΚΥΡΙΟΣ (primary) — οι δευτερεύοντες δεν αλλάζουν τους συντελεστές
    for t in sorted(spec["targets"], key=lambda t: bool(t.get("primary"))):
        if len(t["contrast"]) == 1 and "mde_rel" not in t:
            (k,) = t["contrast"].keys()
            b[k] = spec["signs"].get(k, 1) * delta(spec, t, s)
    return np.array([b[t] for t in spec["terms"]])


def sample_size(spec, blocks):
    z = norm.ppf(1 - spec["alpha"] / 2) + norm.ppf(spec["power"])
    out = {}
    for scen, s in spec["price_sensitivity_scenarios"].items():
        beta = prior_beta(spec, s)
        I1 = sum(info([task_matrix(spec, t) for t in tasks], beta) for tasks in blocks.values()) / len(blocks)
        S1 = np.linalg.inv(I1)
        rows = []
        for t in spec["targets"]:
            c = np.array([t["contrast"].get(n, 0.0) for n in spec["terms"]])
            d = delta(spec, t, s)
            n = z ** 2 * float(c @ S1 @ c) / d ** 2
            rows.append({"target": t["name"], "primary": t.get("primary", False), "delta_utility": round(d, 5), "N_conditional_logit": int(np.ceil(n))})
        # ακρίβεια μεριδίων στα holdout σενάρια (delta method)
        sp = spec.get("share_precision")
        if sp:
            zs = norm.ppf(1 - spec["alpha"] / 2)
            for h in spec["holdout_tasks"]:
                X = task_matrix(spec, h["alts"])
                v = X @ beta
                pr = np.exp(v - v.max()); pr /= pr.sum()
                for j, alt in enumerate(spec["alternatives"]):
                    g = pr[j] * (X[j] - pr @ X)
                    n = zs ** 2 * float(g @ S1 @ g) / sp["half_width_95"] ** 2
                    rows.append({"target": f"Μερίδιο «{alt}» στο {h['task']} ±{sp['half_width_95']*100:.0f} μον.", "primary": sp.get("primary", True),
                                 "share_at_prior": round(float(pr[j]), 3), "N_conditional_logit": int(np.ceil(n))})
        nprim = max(r["N_conditional_logit"] for r in rows if r["primary"])
        out[scen] = {"price_abs_coef_per_100eur": s, "targets": rows, "N_primary_cl": nprim, "N_all_cl": max(r["N_conditional_logit"] for r in rows),
                     "N_recommended_field": int(np.ceil(nprim * spec["panel_inflation"] / (1 - spec["qc_loss"])))}
    return out


def simulate_power(spec, blocks, s, N, reps, seed=1):
    """Εμπειρική ισχύς με το CL της CCE σε δεδομένα που παράγονται από τους ΠΡΟΚΑΘΟΡΙΣΜΕΝΟΥΣ συντελεστές (έλεγχος μεθόδου)."""
    rng = np.random.default_rng(seed)
    beta = prior_beta(spec, s)
    terms = [{"name": t, "kind": "attr", "col": t} for t in spec["terms"]]
    Xb = {b: [task_matrix(spec, t) for t in tasks] for b, tasks in blocks.items()}
    hits = np.zeros(len(spec["targets"]))
    z = norm.ppf(1 - spec["alpha"] / 2)
    for _ in range(reps):
        X_all, y_all, sit, resp = [], [], [], []
        k = 0
        for r in range(N):
            b = str(r % len(blocks) + 1)
            for X in Xb[b]:
                v = X @ beta + rng.gumbel(size=len(X))
                y = np.zeros(len(X))
                y[np.argmax(v)] = 1
                X_all.append(X); y_all.append(y); sit += [k] * len(X); resp += [r] * len(X)
                k += 1
        X = np.vstack(X_all)
        df = pd.DataFrame(X, columns=spec["terms"])
        df["chosen"] = np.concatenate(y_all)
        df["situation_id"] = [f"{i:07d}" for i in sit]
        df["respondent_id"] = [f"{i:06d}" for i in resp]
        df["alt_id"] = np.tile(np.arange(len(spec["alternatives"])), k).astype(str)
        A = build_design(df, terms)
        m = ConditionalLogit().fit(A)
        for j, t in enumerate(spec["targets"]):
            c = np.array([t["contrast"].get(n, 0.0) for n in spec["terms"]])
            est = c @ m.coef
            se = np.sqrt(c @ m.cov_robust @ c)
            hits[j] += abs(est) / se > z
    return {t["name"]: float(h / reps) for t, h in zip(spec["targets"], hits)}


def export_ingest_design(spec, blocks):
    """Μορφή cce.ingest.wide_tasks: block → tasks → εναλλακτική → στήλες μοντέλου. Holdout και επανάληψη ΣΤΟ ΤΕΛΟΣ κάθε block."""
    out = {"design_id": spec["design_id"], "alternatives": spec["alternatives"], "blocks": {}}
    for b, tasks in blocks.items():
        seq = [{"task": i + 1, "type": "design", "alts": {a: model_row(a, t.get(a, {})) for a in spec["alternatives"]}} for i, t in enumerate(tasks)]
        nxt = len(seq) + 1
        for h in spec["holdout_tasks"]:
            seq.append({"task": nxt, "type": f"holdout_{h['task']}", "alts": {a: model_row(a, h["alts"].get(a, {})) for a in spec["alternatives"]}})
            nxt += 1
        r = spec["repeat_task"]
        seq.append({"task": nxt, "type": f"repeat_of_{r}", "alts": seq[r - 1]["alts"]})
        out["blocks"][b] = seq
    return out


def main(spec_path, out_dir, sim_reps=0):
    spec = json.loads(Path(spec_path).read_text(encoding="utf-8"))
    blocks, derr = generate(spec)
    ss = sample_size(spec, blocks)
    out = Path(out_dir)
    out.mkdir(parents=True, exist_ok=True)
    rows = [{"block": b, "task": i + 1, "alt": alt, **lv} for b, tasks in blocks.items() for i, t in enumerate(tasks) for alt, lv in t.items()]
    pd.DataFrame(rows).to_csv(out / f"{spec['design_id']}_design.csv", index=False)
    (out / f"{spec['design_id']}_ingest_design.json").write_text(json.dumps(export_ingest_design(spec, blocks), ensure_ascii=False, indent=1), encoding="utf-8")
    res = {"design_id": spec["design_id"], "d_error_design_priors": derr, "design_prior_scenario": spec["design_prior_scenario"], "sample_size": ss}
    if sim_reps:
        central = next(k for k in ss if k.startswith("central"))
        s = spec["price_sensitivity_scenarios"][central]
        res["simulation_check"] = {"scenario": central, "N": ss[central]["N_primary_cl"], "reps": sim_reps,
                                   "note": ("Έλεγχος του αναλυτικού υπολογισμού: ισχύς ≈ 0,80 αναμένεται για τον δεσμευτικό κύριο στόχο, υψηλότερη για τους υπόλοιπους κύριους. "
                                            "Στους S1/S2 η αληθινή διαφορά είναι 0 στην προσομοίωση, άρα το ποσοστό απόρριψης μετρά το σφάλμα τύπου Ι (≈ 0,05). "
                                            "Οι δευτερεύοντες με κοινό χαρακτηριστικό με κύριο στόχο (S7) προσομοιώνονται στο μέγεθος του κύριου."),
                                   "empirical_power": simulate_power(spec, blocks, s, ss[central]["N_primary_cl"], sim_reps)}
    (out / f"{spec['design_id']}_sample_size.json").write_text(json.dumps(res, ensure_ascii=False, indent=1), encoding="utf-8")
    return res


if __name__ == "__main__":
    reps = int(sys.argv[sys.argv.index("--simulate") + 1]) if "--simulate" in sys.argv else 0
    r = main(sys.argv[1], sys.argv[2], reps)
    print(json.dumps(r, ensure_ascii=False, indent=1))
