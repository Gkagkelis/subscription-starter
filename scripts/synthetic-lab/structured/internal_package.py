"""INTERNAL RESEARCH PACKAGE — ΜΟΝΟ για την ομάδα Viewscope (δεν αποστέλλεται στον πελάτη).

Συγκεντρώνει: πλήρες dataset, αντιστοίχιση ερώτησης ↔ πραγματικές πηγές, κατηγορίες E/T/S και προέλευση, μοντέλο/παραμέτρους/
παραδοχές, ελέγχους ποιότητας και συνοχής, κατανομές/συσχετίσεις, αβεβαιότητα (σταθερότητα, ευαισθησία), επίδραση πηγών, εκδόσεις,
χρόνους και αρχεία αναπαραγωγής.

    python3 -I scripts/synthetic-lab/structured/internal_package.py --study studies/kotsovolos_lab_pilot_2026 [--timings timings.json]
"""
from __future__ import annotations

import argparse
import gzip
import hashlib
import json
import platform
import shutil
import subprocess
from pathlib import Path

import pandas as pd
import yaml

ROOT = Path(__file__).resolve().parents[3]
LAKE_INDEX = ROOT / ".synthetic-lab-data" / "lake" / "export" / "lake_index.json"


def sha(p: Path) -> str | None:
    if not p.exists():
        return None
    h = hashlib.sha256()
    with open(p, "rb") as f:
        for b in iter(lambda: f.read(1 << 20), b""):
            h.update(b)
    return h.hexdigest()


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--study", required=True)
    ap.add_argument("--timings")
    a = ap.parse_args()
    study = Path(a.study).resolve()
    ip = study / "internal_package"
    spec = json.loads((study / "spec.json").read_text(encoding="utf-8"))
    model = yaml.safe_load((study / "model.yaml").read_text(encoding="utf-8"))
    run = json.loads((ip / "runs" / "main.json").read_text(encoding="utf-8"))
    eff = pd.read_csv(ip / "qc" / "evidence_classes.csv").set_index("question")
    infl = pd.read_csv(ip / "qc" / "source_influence_summary.csv").set_index("source")

    # --- 1. dataset (ευρύ + μακρύ, με κατηγορία τεκμηρίωσης ανά απάντηση)
    (ip / "dataset").mkdir(exist_ok=True)
    shutil.copy(ip / "qc" / "respondents_wide.csv", ip / "dataset" / "respondents_wide.csv")
    long = []
    for r in run["respondents"]:
        for q in spec["questions"]:
            v = r["answers"][q["id"]]
            long.append({"respondent_id": r["respondent_id"], "persona_id": r["persona_id"], "question_id": q["id"],
                         "status": "SKIPPED" if v is None else "ANSWERED", "response": ";".join(v) if isinstance(v, list) else v,
                         "declared_class": q["class"] if v is not None else None, "effective_class": eff.loc[q["id"], "effective"] if v is not None else None,
                         "flags": "|".join(x for x in r["flags"] if f":{q['id']}:" in x)})
    pd.DataFrame(long).to_csv(ip / "dataset" / "respondents_long.csv", index=False)
    pd.DataFrame([{"respondent_id": r["respondent_id"], "persona_id": r["persona_id"], **r["covariates"], **{f"latent_{k}": v for k, v in r["latents"].items()}}
                  for r in run["respondents"]]).to_csv(ip / "dataset" / "respondent_profiles_and_latents.csv", index=False)

    # --- 2. πηγές: δείκτες του lake με πλήρη μεταδεδομένα + αποδεδειγμένη επίδραση
    studies = {}
    if LAKE_INDEX.exists():
        ix = json.loads(LAKE_INDEX.read_text(encoding="utf-8"))
        studies = {s["studyId"]: s for s in ix["studies"]}
    src_rows = []
    for name, m in spec["metrics"].items():
        sid = ":".join(m["metric"].split("::")[0].split(":")[1:])
        st = studies.get(sid, {})
        fit = run["metricFits"].get(name, {})
        inf_ = infl.loc[name] if name in infl.index else None
        src_rows.append({"name": name, "lab_metric_id": m["metric"], "label": m["label"], "lake_study": sid, "title": st.get("title"), "publisher": st.get("publisher"),
                         "url": st.get("url"), "licence": st.get("license"), "licence_tier": st.get("tier"), "years_available": f"{st.get('yearStart')}–{st.get('yearEnd')}",
                         "wave_used": fit.get("wave"), "mean_p_in_sample": fit.get("meanP"), "fit_error_pp": fit.get("fitErrorPp"),
                         "affects_estimates": bool(inf_["affects_estimates"]) if inf_ is not None else None,
                         "questions_affected": inf_["questions_affected"] if inf_ is not None else None, "max_tvd_pp": inf_["max_tvd_pp"] if inf_ is not None else None})
    src_rows.append({"name": "population", "lab_metric_id": run["population"]["populationId"], "label": "Βαθμονομημένος πληθυσμός ενηλίκων (GLOPOP-S Ελλάδας, βαθμονόμηση ΕΛΣΤΑΤ/Eurostat 2025)",
                     "affects_estimates": True, "questions_affected": "D01, D02, D03 και όλες μέσω των συμμεταβλητών"})
    src_rows.append({"name": "pie", "lab_metric_id": run["population"]["pieModel"], "label": "Άγκυρες PIE: απασχόληση, οικονομική κατάσταση, τάξη, εισόδημα (μικροδεδομένα διαΝΕΟσις κ.ά.)",
                     "affects_estimates": bool(infl.loc["pie", "affects_estimates"]) if "pie" in infl.index else None,
                     "questions_affected": infl.loc["pie", "questions_affected"] if "pie" in infl.index else None})
    pd.DataFrame(src_rows).to_csv(ip / "sources_used.csv", index=False)

    # --- 3. χάρτης ερώτηση ↔ πηγές ↔ παραδοχές ↔ κατηγορία
    amap = {x["id"]: x["text"] for x in spec.get("assumptions", [])}
    qrows = []
    for q in spec["questions"]:
        e = eff.loc[q["id"]]
        qrows.append({"question": q["id"], "block": q["block"], "text": q["text"], "condition": q["condition"], "model_kind": q["model"]["kind"],
                      "declared_class": q["class"], "effective_class": e["effective"], "class_justification": e["justification"],
                      "direct_sources": e["direct_sources"] if isinstance(e["direct_sources"], str) else "", "covariate_sources": e["covariate_sources"] if isinstance(e["covariate_sources"], str) else "",
                      "uses_pie_anchors": e["uses_pie_anchors"], "bounds_activated": e["bounds_activated"], "assumptions": "; ".join(q.get("assumptions", [])),
                      "assumption_texts": " | ".join(amap.get(x, x) for x in q.get("assumptions", []))})
    pd.DataFrame(qrows).to_csv(ip / "question_source_map.csv", index=False)
    pd.DataFrame(spec.get("assumptions", [])).to_csv(ip / "assumptions.csv", index=False)

    # --- 4. μοντέλο και αρχεία αναπαραγωγής
    (ip / "model").mkdir(exist_ok=True)
    for f in ("model.yaml", "spec.json", "narrative.yaml"):
        if (study / f).exists():
            shutil.copy(study / f, ip / "model" / f)
    pie_dir = ROOT / ".synthetic-lab-data" / "persona" / "models" / run["population"]["pieModel"]
    git = subprocess.run(["git", "rev-parse", "HEAD"], capture_output=True, text=True, cwd=ROOT).stdout.strip()
    node = subprocess.run(["node", "--version"], capture_output=True, text=True).stdout.strip()
    manifest = {
        "label": "ΣΥΝΘΕΤΙΚΗ ΠΡΟΣΟΜΟΙΩΣΗ — ΟΧΙ ΠΡΑΓΜΑΤΙΚΗ ΕΡΕΥΝΑ ΠΕΔΙΟΥ",
        "study_id": spec["studyId"], "spec_version": spec["specVersion"], "engine": run["engineVersion"], "evidence_class_version": run["evidenceClassVersion"],
        "spec_sha256": run["specSha256"], "questionnaire_sha256_frozen": spec.get("questionnaireSha256"), "source_study": spec.get("sourceStudy"),
        "seed": run["options"]["seed"], "n": len(run["respondents"]), "options": run["options"],
        "population": {k: v for k, v in run["population"].items() if k != "margins"},
        "pie_model_files_sha256": {f.name: sha(f) for f in sorted(pie_dir.glob("*.json"))} if pie_dir.exists() else None,
        "lake_index_sha256": sha(LAKE_INDEX),
        "calibration_inputs_sha256": {p: sha(ROOT / p) for p in ["lib/synthetic-lab/data/populations/glopop-grc-2015-sample.json",
                                                                   "lib/synthetic-lab/data/official/eurostat-population-2025.json",
                                                                   "lib/synthetic-lab/data/official/eurostat-education-2025.json"]},
        "git_commit_at_build": git, "node": node, "python": platform.python_version(), "api_calls": 0, "api_cost_usd": 0.0,
        "timings_ms_engine": run["timingsMs"], "wall_clock_ms_main_run": run.get("wallClockMs"),
        "pipeline_timings_s": json.loads(Path(a.timings).read_text()) if a.timings and Path(a.timings).exists() else None,
        "warnings": run["warnings"],
    }
    (ip / "versions_manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=1), encoding="utf-8")
    rel = study.relative_to(ROOT)
    (ip / "reproduce.sh").write_text(f"""#!/bin/bash
# Αναπαραγωγή της μελέτης {spec['studyId']} (ίδιο seed ⇒ ίδιες απαντήσεις). Χωρίς AI, χωρίς δίκτυο, χωρίς κόστος API.
set -euo pipefail
cd "$(dirname "$0")/{'/'.join(['..'] * (len(rel.parts) + 1))}"
python3 -I scripts/synthetic-lab/structured/pipeline.py --study {rel} --n {len(run['respondents'])} --seed {run['options']['seed']}
""", encoding="utf-8")
    (ip / "reproduce.sh").chmod(0o755)

    # --- 5. συμπίεση των εκτελέσεων (main + παραλλαγές)
    for p in (ip / "runs").glob("*.json"):
        if p.name == "variants.json":
            continue
        with open(p, "rb") as fi, gzip.open(str(p) + ".gz", "wb", compresslevel=9) as fo:
            shutil.copyfileobj(fi, fo)
        p.unlink()

    # --- 6. README
    qc = json.loads((ip / "qc" / "qc_report.json").read_text(encoding="utf-8"))
    counts = eff["effective"].value_counts().to_dict()
    (ip / "README.md").write_text(f"""# Εσωτερικός ερευνητικός φάκελος — {spec['title']}

**ΜΟΝΟ ΓΙΑ ΤΗΝ ΟΜΑΔΑ VIEWSCOPE — δεν αποστέλλεται στον πελάτη.** {manifest['label']}.

- Μηχανισμός: `{run['engineVersion']}` (Synthetic Lab, γρήγορος στατιστικός· 0 κλήσεις API, κόστος 0 $)
- Ερωτώμενοι: {len(run['respondents'])} · seed {run['options']['seed']} · ερωτηματολόγιο από `{spec.get('sourceStudy')}` (παγωμένο, sha256 `{str(spec.get('questionnaireSha256'))[:12]}…`)
- Χρόνος παραγωγής 500 ερωτωμένων: {run['timingsMs']['generation_ms']} ms · πλήρης εκτέλεση (με φόρτωση πληθυσμού/lake): {run.get('wallClockMs')} ms
- Έλεγχοι ποιότητας: **{qc['result']}** ({sum(c['status'] == 'PASS' for c in qc['checks'])} PASS / {sum(c['status'] == 'FAIL' for c in qc['checks'])} FAIL / {sum(c['status'] == 'INFO' for c in qc['checks'])} INFO)
- Κατηγορίες τεκμηρίωσης (τελικές, μετά τη δοκιμή αφαίρεσης πηγών): E {counts.get('E', 0)} · T {counts.get('T', 0)} · S {counts.get('S', 0)}

| Αρχείο | Περιεχόμενο |
|---|---|
| `dataset/respondents_wide.csv` | Πλήρες dataset (μία γραμμή ανά ερωτώμενο, απαντήσεις + κατηγορία ανά ερώτηση) |
| `dataset/respondents_long.csv` | Μία γραμμή ανά ερωτώμενο × ερώτηση (κατάσταση, απάντηση, δηλωμένη/τελική κατηγορία, σημαίες) |
| `dataset/respondent_profiles_and_latents.csv` | Δημογραφικά, άγκυρες PIE, παράγωγες συμμεταβλητές, λανθάνοντες παράγοντες |
| `question_source_map.csv` | Ερώτηση ↔ άμεσες πηγές ↔ συμμεταβλητές ↔ παραδοχές ↔ κατηγορία E/T/S (+ αιτιολόγηση) |
| `sources_used.csv` | Κάθε πηγή: δείκτης Lab, μελέτη lake, εκδότης, URL, άδεια, κύμα, σφάλμα προσαρμογής, **αποδεδειγμένη επίδραση** |
| `assumptions.csv` | Όλες οι ρητές παραδοχές σεναρίου |
| `model/` | `model.yaml` (μοντέλο), `spec.json` (εκτελέσιμη προδιαγραφή), `narrative.yaml` (κείμενα πελάτη) |
| `qc/qc_report.json` | Όλοι οι έλεγχοι (εγκυρότητα, C1–C5, S1–S14, σύνθεση, ποικιλία, σχέσεις, τεκμηρίωση) |
| `qc/distributions.csv` | Κατανομές ανά ερώτηση με διάστημα Wilson 95% (μόνο θόρυβος συνθετικού δείγματος) |
| `qc/correlations.csv`, `qc/consistency_rules.csv` | Συσχετίσεις Spearman, ποσοστά κανόνων συνοχής |
| `qc/stability_seeds.csv` | Σταθερότητα δεικτών σε 5 seeds |
| `qc/sensitivity_scenario.csv` | Ευαισθησία σεναρίου (επιδράσεις ×0,5 / ×1,5, επίπεδα ±0,3) |
| `qc/source_influence_*.csv`, `qc/evidence_classes.csv` | Δοκιμή αφαίρεσης κάθε πηγής → ποιες ερωτήσεις αλλάζουν· τελική κατηγορία |
| `qc/comparison_with_ase_history.csv` | Σύγκριση με τις 119 ολοκληρωμένες ASE (μόνο αναφορά — όχι βαθμονόμηση) |
| `runs/*.json.gz` | Κύρια εκτέλεση + 19 παραλλαγές (πλήρη αποτελέσματα μηχανισμού) |
| `versions_manifest.json` | Εκδόσεις, hashes (μοντέλο PIE, lake, πληθυσμός, ερωτηματολόγιο), commit, χρόνοι |
| `reproduce.sh` | Αναπαραγωγή με μία εντολή |

Περιορισμοί: οι εκτιμήσεις S είναι σενάριο, όχι μετρήσεις· οι βάσεις < 30 (Q16–Q21) είναι ενδεικτικές· τα διαστήματα Wilson δεν
περιέχουν αβεβαιότητα μοντέλου — αυτή αποτυπώνεται στην ανάλυση ευαισθησίας.
""", encoding="utf-8")
    print(ip)


if __name__ == "__main__":
    main()
