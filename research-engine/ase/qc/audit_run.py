"""Ανεξάρτητος έλεγχος ενός run (audit) — ΔΕΝ χρησιμοποιεί τα αποτελέσματα του engine ως δεδομένα, μόνο τις ατομικές εγγραφές.

Έλεγχοι:
  questionnaire   ποιο ερωτηματολόγιο έτρεξε (hash run ↔ τρέχον ↔ αρχείο-πηγή, round-trip)
  records         ανά ερωτώμενο: αναμενόμενη διαδρομή (skip logic από τις ΙΔΙΕΣ κληρωμένες απαντήσεις), εγκυρότητα απαντήσεων,
                  λογικοί περιορισμοί (hard), κανόνες συνέπειας (soft), δημογραφικά D ↔ προφίλ
  report          ανεξάρτητη επανακαταμέτρηση ποσοστών/παρονομαστών (και πολλαπλής επιλογής) έναντι results.csv και γραφημάτων HTML
  style           ουδέτερες / θετικές / αρνητικές / «δεν ξέρω» απαντήσεις, οξύτητα κατανομών AI, επαναλαμβανόμενες αιτιολογήσεις
  rationale_leak  η αναφορά Signalyth/πεδία σκεπτικού δεν εμφανίζονται σε κανένα prompt· καμία κατανομή-στόχος
  anchors         συνέπεια αγκυρών PIE με το προφίλ (ηλικία ↔ απασχόληση, εισόδημα ↔ οικονομική κατάσταση/εισόδημα, εκπαίδευση ↔ τάξη)
"""
from __future__ import annotations

import hashlib
import json
import re
from collections import Counter
from pathlib import Path

import numpy as np
import pandas as pd

from ..questionnaire import model as QM
from ..util import read_json

BANNED = ["Signalyth", "Viewscope", "social listening", "Social listening", "sentiment", "source_pages", "Brand Intelligence"]


def _sha(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def audit_questionnaire(study, run_id) -> dict:
    from ..questionnaire.convert import convert, roundtrip_check
    from ..util import load_structured
    d = Path(study.dir)
    man = read_json(study.internal / "runs" / run_id / "execution_manifest.json")
    out = {"run_questionnaire_sha256": man.get("questionnaire_sha256"), "current_questionnaire_sha256": _sha(d / study.cfg.get("questionnaire", "questionnaire.yaml"))}
    out["run_used_current_version"] = out["run_questionnaire_sha256"] == out["current_questionnaire_sha256"]
    src = d / "source"
    js = sorted(src.glob("*.json")) if src.exists() else []
    if js:
        spec = json.loads(js[0].read_text(encoding="utf-8"))
        ov = load_structured(d / "integration_overlay.yaml") if (d / "integration_overlay.yaml").exists() else None
        native, _ = convert(spec, ov)
        cur = load_structured(d / study.cfg.get("questionnaire", "questionnaire.yaml"))
        out.update(source_file=js[0].name, source_sha256=_sha(js[0]), source_items=len(spec["questions"]),
                   roundtrip_errors=roundtrip_check(spec, native),
                   current_yaml_equals_fresh_conversion=(cur.get("blocks") == native["blocks"] and cur.get("constraints") == native["constraints"]
                                                         and cur.get("consistency_rules") == native["consistency_rules"]))
    return out


def _answers(df: pd.DataFrame) -> dict:
    out = {}
    for r in df.itertuples():
        out.setdefault(r.respondent_id, {})[r.question_id] = (json.loads(r.response) if r.status == "ANSWERED" and str(r.response) not in ("", "nan") else None,
                                                             r.status)
    return out


def audit_records(study, run_id) -> dict:
    qn = study.qn
    df = study.responses(run_id)
    prof = study.profiles(run_id).set_index("respondent_id")
    recs = _answers(df)
    issues, soft = [], Counter()
    hard = Counter()
    for rid, a in recs.items():
        ans = {q: v for q, (v, s) in a.items()}
        p = prof.loc[rid].to_dict() if rid in prof.index else {}
        for q in qn.questions:
            v, s = a.get(q.id, (None, "MISSING"))
            expected = QM.evaluate_condition(q.condition, ans, p) if q.condition else True
            if s == "MISSING":
                issues.append(f"{rid} {q.id}: δεν υπάρχει εγγραφή")
            elif expected and s != "ANSWERED":
                issues.append(f"{rid} {q.id}: έπρεπε να ρωτηθεί ({s})")
            elif not expected and s != "SKIPPED":
                issues.append(f"{rid} {q.id}: δεν έπρεπε να ρωτηθεί ({s})")
            if s == "ANSWERED":
                errs = QM.validate_answer(q, v)
                if errs:
                    issues.append(f"{rid} {q.id}: μη έγκυρη απάντηση {v} ({'; '.join(errs)})")
                if q.profile_field:
                    exp = q.profile_map.get(str(p.get(q.profile_field))) if q.profile_map else str(p.get(q.profile_field))
                    if str(v) != str(exp):
                        issues.append(f"{rid} {q.id}: δημογραφικό {v} ≠ προφίλ {p.get(q.profile_field)}")
        answered = {q: v for q, (v, s) in a.items() if s == "ANSWERED"}
        for c in qn.constraints:
            if all(r in answered for r in c["refs"]) and QM.evaluate_condition(c["forbid"], answered, {}):
                hard[c["id"]] += 1
                issues.append(f"{rid}: παραβίαση {c['id']}")
        for r in qn.meta.get("consistency_rules") or []:
            try:
                if all(k in answered for k in QM.condition_refs(r["when"])) and QM.evaluate_condition(r["when"], answered, {}):
                    soft[r["id"]] += 1
            except Exception:  # noqa: BLE001
                pass
    n = len(recs)
    return {"respondents": n, "records": len(df), "status_counts": df["status"].value_counts().to_dict(), "issues": issues,
            "hard_constraint_violations": dict(hard), "soft_rule_hits": dict(soft),
            "soft_rule_max_rate": round(max(soft.values(), default=0) / max(n, 1), 3),
            "respondents_with_any_soft_hit": sum(1 for rid, a in recs.items()
                                                 if any(all(k in {q for q, (v, s) in a.items() if s == "ANSWERED"} for k in QM.condition_refs(r["when"]))
                                                        and QM.evaluate_condition(r["when"], {q: v for q, (v, s) in a.items() if s == "ANSWERED"}, {})
                                                        for r in qn.meta.get("consistency_rules") or []))}


def audit_report(study, run_id, out_dir: Path | None = None) -> dict:
    out_dir = out_dir or (study.internal / "runs" / run_id / "preview")
    df = study.responses(run_id)
    ans = df[df["status"] == "ANSWERED"]
    res = pd.read_csv(out_dir / "results.csv", dtype={"option_code": str})
    mism = []
    for q in study.qn.questions:
        sub = ans[ans["question_id"] == q.id]
        rr = res[res["question_id"] == q.id]
        if sub.empty:
            if len(rr):
                mism.append(f"{q.id}: αποτελέσματα χωρίς απαντήσεις")
            continue
        if q.type in ("numeric", "open"):
            continue
        base = len(sub)
        vals = sub["response"].map(json.loads)
        cnt = Counter(c for v in vals for c in (v if isinstance(v, list) else [v]))
        for r in rr.itertuples():
            n = cnt.get(str(r.option_code), 0)
            if int(r.n_base) != base or int(r.n) != n or abs(float(r.pct) - round(100 * n / base, 1)) > 0.051:
                mism.append(f"{q.id}/{r.option_code}: report n={r.n}/{r.n_base} {r.pct}% ≠ εγγραφές {n}/{base}")
    html_p = out_dir / "executive_report.html"
    bars = []
    if html_p.exists():
        html = html_p.read_text(encoding="utf-8")
        pct = {(r.question_id, str(r.option_code)): float(r.pct) for r in res.itertuples() if str(r.pct) not in ("", "nan")}
        for qid, code, p in re.findall(r'data-qid="([^"]+)" data-code="([^"]+)" data-pct="([^"]+)"', html):
            if abs(pct.get((qid, code), -999) - float(p)) > 0.051:
                bars.append(f"{qid}/{code}: γράφημα {p}% ≠ results {pct.get((qid, code))}")
        multi_note = "(πολλαπλές απαντήσεις)" in html if any(q.type == "multiple_choice" for q in study.qn.questions) else None
    else:
        multi_note = None
    return {"questions_in_report": int(res["question_id"].nunique()), "count_mismatches": mism, "chart_mismatches": bars,
            "multi_select_base": "ποσοστό ερωτωμένων που επέλεξαν την επιλογή (βάση = όσοι ρωτήθηκαν· άθροισμα > 100%)",
            "multi_select_note_in_report": multi_note}


def audit_style(study, run_id) -> dict:
    """Στυλ απαντήσεων AI μόνο σε ΠΕΝΤΑΒΑΘΜΙΕΣ κλίμακες αξιολόγησης (+ «δεν ξέρω») και στην κλίμακα 0–10 (Q25-τύπου)."""
    df = study.responses(run_id)
    ans = df[(df["status"] == "ANSWERED") & (df["inference_mode"].astype(str) != "PROFILE")]
    qby = study.qn.by_id()
    per_q, agg, nps = {}, Counter(), Counter()
    peaks, ents = [], []
    dk_re = re.compile(r"Δεν (γνωρίζω|μπορώ|θυμάμαι|εφαρμόζεται|σχεδιάζω)")
    for qid, g in ans.groupby("question_id"):
        q = qby[qid]
        if q.type != "single_choice":
            continue
        lab = {o.code: o.label for o in q.options}
        dk = [c for c in q.codes if dk_re.search(lab[c])]
        scale = [c for c in q.codes if c not in dk]
        v = g["response"].map(lambda s: str(json.loads(s)))
        if len(scale) == 11 and lab[scale[0]] == "0":            # 0–10
            val = v[~v.isin(dk)].astype(int) - 1
            nps.update({"επικριτές (0–6)": int((val <= 6).sum()), "ουδέτεροι (7–8)": int(val.isin([7, 8]).sum()),
                        "υποστηρικτές (9–10)": int((val >= 9).sum()), "δεν ξέρω": int(v.isin(dk).sum())})
            continue
        if len(scale) != 5:
            continue
        k = {"θετικές (4–5)": int(v.isin(scale[3:]).sum()), "ουδέτερες (3)": int(v.isin([scale[2]]).sum()),
             "αρνητικές (1–2)": int(v.isin(scale[:2]).sum()), "δεν ξέρω": int(v.isin(dk).sum()), "n": len(v)}
        per_q[qid] = k
        for kk, vv in k.items():
            agg[kk] += vv
        for s_ in g["distribution"].dropna():
            try:
                d = json.loads(s_)
            except Exception:  # noqa: BLE001
                continue
            p = np.array([float(x) for x in d.values()])
            if p.sum() > 0:
                p = p / p.sum()
                peaks.append(p.max())
                ents.append(float(-(p[p > 0] * np.log(p[p > 0])).sum() / np.log(len(p))))
    rat = ans["rationale"].dropna().astype(str)
    rat = rat[rat.str.len() > 0]
    dup = rat.value_counts()
    n = max(agg["n"], 1)
    share = {k: round(agg[k] / n, 3) for k in ("θετικές (4–5)", "ουδέτερες (3)", "αρνητικές (1–2)", "δεν ξέρω")}
    flags = []
    if share["ουδέτερες (3)"] > 0.5:
        flags.append("υπερβολικά ουδέτερες απαντήσεις (> 50%)")
    if share["θετικές (4–5)"] > 0.75 or share["αρνητικές (1–2)"] > 0.75:
        flags.append("υπερβολική μονοκατευθυντικότητα (> 75%)")
    if len(dup) and dup.max() > max(3, 0.05 * len(rat)):
        flags.append("επαναλαμβανόμενες αιτιολογήσεις")
    return {"five_point_items": per_q, "five_point_overall": share, "n_five_point_answers": agg["n"], "zero_to_ten": dict(nps),
            "ai_distribution_mean_peak": round(float(np.mean(peaks)), 3) if peaks else None,
            "ai_distribution_mean_norm_entropy": round(float(np.mean(ents)), 3) if ents else None,
            "rationales": int(len(rat)), "duplicate_rationales": int((dup > 1).sum()), "max_rationale_repeats": int(dup.max()) if len(dup) else 0,
            "flags": flags}


def audit_sampling(study, run_id) -> dict:
    """Ακεραιότητα κλήρωσης: το ποσοστό απαντήσεων από επιλογές χαμηλής πιθανότητας (< 10%) πρέπει να ταιριάζει με το αναμενόμενο
    από τις ίδιες τις κατανομές (αλλιώς σφάλμα αντιστοίχισης κωδικών/κλήρωσης)."""
    df = study.responses(run_id)
    a = df[(df["status"] == "ANSWERED") & (df["distribution"].astype(str).str.startswith("{"))]
    obs, exp, mass = [], [], []
    for r in a.itertuples():
        resp = json.loads(r.response)
        if isinstance(resp, list):
            continue
        d = json.loads(r.distribution)
        p = np.array([float(v) for v in d.values()])
        if p.sum() <= 0 or str(resp) not in d:
            continue
        p = p / p.sum()
        obs.append(float(d[str(resp)]) / sum(float(v) for v in d.values()) < 0.10)
        exp.append(float(p[p < 0.10].sum()))
        mass.append(float(d[str(resp)]) / sum(float(v) for v in d.values()))
    if not obs:
        return {"n": 0}
    o, e = float(np.mean(obs)), float(np.mean(exp))
    se = float(np.sqrt(max(e * (1 - e), 1e-9) / len(obs)))
    return {"n": len(obs), "drawn_from_options_below_10pct": round(o, 3), "expected_under_correct_sampling": round(e, 3),
            "z": round((o - e) / se, 2), "ok": abs(o - e) <= 3 * se, "mean_probability_of_drawn_option": round(float(np.mean(mass)), 3)}


def audit_rationale_leak(study, run_id) -> dict:
    sdir = study.internal / "runs" / run_id / "session"
    texts = []
    if (sdir / "system_prompt.txt").exists():
        texts.append(("system_prompt.txt", (sdir / "system_prompt.txt").read_text(encoding="utf-8")))
    for f in sorted((sdir / "pending").glob("*.json")) if (sdir / "pending").exists() else []:
        try:
            texts.append((f.name, json.loads(f.read_text(encoding="utf-8")).get("user_prompt", "")))
        except Exception:  # noqa: BLE001
            pass
    rationales = [str((q.raw.get("source_meta") or {}).get("rationale", "")) for q in study.qn.questions]
    rationales = [r for r in rationales if len(r) > 12]
    hits = []
    for name, t in texts:
        for w in BANNED + rationales:
            if w and w in t:
                hits.append(f"{name}: «{w}»")
    cfg = study.cfg
    return {"prompts_checked": len(texts), "banned_or_rationale_hits": hits, "reference_distributions": cfg.get("reference_distributions") or [],
            "panel_quota_variables": (cfg["panel"].get("sampling") or {}).get("variables"),
            "completes_quota_basis": (cfg["panel"].get("completes") or {}).get("quota_basis"),
            "brand_in_prompt_brief": any(b in str((cfg.get("study") or {}).get("prompt_brief", "")) for b in ("Κωτσόβολ", "Kotsovolos"))}


def audit_anchors(study, run_id=None) -> dict:
    p = study.with_lab_state(study.profiles(run_id) if run_id else study.ensure_panel())
    if run_id:                                   # μόνο όσοι πήραν μέρος στο run (όχι όλο το πάνελ)· η κατάσταση Lab είναι η ΤΡΕΧΟΥΣΑ
        used = set(study.responses(run_id)["respondent_id"])
        p = p[p["respondent_id"].isin(used)]
    if "lab_emp" not in p:
        return {"available": False}
    young = p["age_band"].isin(["18-24", "25-34", "35-44"])
    old = p["age_band"].isin(["65+"])
    work = p["lab_emp"].isin(["private_emp", "public_emp", "self_emp", "farmer", "employed"])
    out = {"available": True, "n": len(p),
           "retired_under_45": int((young & (p["lab_emp"] == "retired")).sum()),
           "student_45_plus": int((~young & ~p["age_band"].isin(["18-24"]) & p["age_band"].isin(["45-54", "55-64", "65+"]) & (p["lab_emp"] == "student")).sum()),
           "working_65_plus_share": round(float((old & work).sum() / max(old.sum(), 1)), 3),
           "retired_65_plus_share": round(float((old & (p["lab_emp"] == "retired")).sum() / max(old.sum(), 1)), 3)}
    num = pd.DataFrame({"incq": pd.to_numeric(p["income_quintile"], errors="coerce"), "econ4": pd.to_numeric(p["lab_econ4"], errors="coerce"),
                        "inc6": pd.to_numeric(p["lab_inc6"], errors="coerce"), "class3": pd.to_numeric(p["lab_class3"], errors="coerce"),
                        "edu": p["education"].map({"less_than_primary": 0, "primary": 1, "lower_secondary": 2, "upper_secondary": 3, "post_secondary": 4, "tertiary": 5})})
    sp = num.rank().corr()
    out["spearman"] = {"income_quintile~econ4": round(float(sp.loc["incq", "econ4"]), 3), "income_quintile~inc6": round(float(sp.loc["incq", "inc6"]), 3),
                       "education~class3": round(float(sp.loc["edu", "class3"]), 3)}
    out["retired_under_35"] = int((p["age_band"].isin(["18-24", "25-34"]) & (p["lab_emp"] == "retired")).sum())
    impossible_ok = out["retired_under_35"] == 0 and out["student_45_plus"] == 0
    if len(p) < 30:                              # συσχετίσεις σε λίγα πρόσωπα δεν σημαίνουν τίποτα: μόνο οι αδύνατοι συνδυασμοί
        out["ok"], out["correlations_assessed"] = impossible_ok, False
    else:
        out["ok"] = impossible_ok and out["spearman"]["income_quintile~inc6"] > 0.5 and out["spearman"]["income_quintile~econ4"] > 0.3
        out["correlations_assessed"] = True
    out["note"] = "υπολογίζεται με την τρέχουσα κατάσταση Lab· ένα παλαιότερο run μπορεί να χρησιμοποίησε άλλες άγκυρες" if run_id else ""
    out["criteria"] = "καμία αδύνατη ηλικία–απασχόληση· Spearman(πεμπτημόριο, inc6) > 0,5 και (πεμπτημόριο, econ4) > 0,3· εκπαίδευση–τάξη μόνο ενημερωτικά"
    return out


def audit_run(study, run_id) -> dict:
    out = {"run_id": run_id, "questionnaire": audit_questionnaire(study, run_id), "records": audit_records(study, run_id),
           "report": audit_report(study, run_id) if (study.internal / "runs" / run_id / "preview" / "results.csv").exists() else None,
           "style": audit_style(study, run_id), "sampling": audit_sampling(study, run_id), "rationale_leak": audit_rationale_leak(study, run_id), "anchors_run": audit_anchors(study, run_id),
           "anchors_panel": audit_anchors(study)}
    r = out["records"]
    out["summary"] = {"branching_or_validity_issues": len(r["issues"]), "hard_violations": sum(r["hard_constraint_violations"].values()),
                      "report_mismatches": (len(out["report"]["count_mismatches"]) + len(out["report"]["chart_mismatches"])) if out["report"] else None,
                      "rationale_leaks": len(out["rationale_leak"]["banned_or_rationale_hits"]), "sampling_ok": out["sampling"].get("ok"), "anchors_ok": out["anchors_panel"].get("ok")}
    return out
