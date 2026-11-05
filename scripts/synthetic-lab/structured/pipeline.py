"""Ολόκληρη η ροή μιας δομημένης συνθετικής μελέτης με τον γρήγορο στατιστικό μηχανισμό του Synthetic Lab — μία εντολή:

  προδιαγραφή → κύρια εκτέλεση → παραλλαγές (σταθερότητα / ευαισθησία / αφαίρεση πηγών) → έλεγχοι → παρουσίαση πελάτη
  (PDF + PowerPoint) → εσωτερικός ερευνητικός φάκελος.     Χωρίς AI, χωρίς δίκτυο, χωρίς κόστος API.

    python3 -I scripts/synthetic-lab/structured/pipeline.py --study studies/kotsovolos_lab_pilot_2026 [--n 500] [--seed 20261105]
"""
from __future__ import annotations

import argparse
import json
import shutil
import subprocess
import sys
import time
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
HERE = Path(__file__).resolve().parent
TSX = str(ROOT / "node_modules" / ".bin" / "tsx")


def sh(cmd: list[str], log) -> str:
    r = subprocess.run(cmd, cwd=str(ROOT), capture_output=True, text=True)
    log.write(f"$ {' '.join(cmd)}\n{r.stdout}{r.stderr}\n")
    if r.returncode not in (0,):
        raise SystemExit(f"Αποτυχία: {' '.join(cmd)}\n{r.stdout[-2000:]}{r.stderr[-2000:]}")
    return r.stdout


def variants(spec: dict) -> list[dict]:
    mets = list(spec["metrics"])
    v = [{"name": f"seed_{i}", "seed": None} for i in range(1, 5)]
    v += [{"name": "sens_effects_x0.5", "effectScale": 0.5}, {"name": "sens_effects_x1.5", "effectScale": 1.5},
          {"name": "sens_levels_-0.3", "baseShift": -0.3}, {"name": "sens_levels_+0.3", "baseShift": 0.3}]
    v += [{"name": f"ablate_{m}", "ablate": [m]} for m in mets]
    # κοινή αφαίρεση πηγών που χρησιμοποιούνται μαζί (π.χ. ένωση ορίων) — αλλιώς η μία «καλύπτει» την άλλη
    groups = {}
    for q in spec["questions"]:
        mm = q["model"]
        exprs = [b["expr"] for b in mm.get("lowerBounds", [])] + [p["expr"] for p in mm.get("probFrom", [])] + ([mm["unionLowerBound"]["expr"]] if mm.get("unionLowerBound") else [])
        if exprs and q.get("sources"):
            key = tuple(sorted(s for s in q["sources"] if s in spec["metrics"]))
            if len(key) > 1:
                groups[key] = True
    v += [{"name": "ablate_" + "+".join(k), "ablate": list(k)} for k in groups]
    v += [{"name": "ablate_all_metrics", "ablate": mets}, {"name": "ablate_pie", "ablatePie": True}]
    return v


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--study", required=True)
    ap.add_argument("--n", type=int, default=500)
    ap.add_argument("--seed", type=int, default=20261105)
    a = ap.parse_args()
    study = (ROOT / a.study).resolve() if not Path(a.study).is_absolute() else Path(a.study)
    ip = study / "internal_package"
    if ip.exists():
        shutil.rmtree(ip)
    (ip / "runs").mkdir(parents=True)
    (ip / "logs").mkdir()
    T = {}
    with open(ip / "logs" / "pipeline.log", "w", encoding="utf-8") as log:
        t = time.time()
        print(sh([sys.executable, "-I", str(HERE / "build_spec.py"), str(study / "model.yaml"), "--out", str(study / "spec.json")], log).strip())
        T["1_spec_s"] = round(time.time() - t, 2)
        spec = json.loads((study / "spec.json").read_text(encoding="utf-8"))
        t = time.time()
        print(sh([TSX, str(HERE / "run.ts"), "--spec", str(study / "spec.json"), "--out", str(ip / "runs" / "main.json"), "--n", str(a.n), "--seed", str(a.seed)], log).strip())
        T["2_main_run_500_s"] = round(time.time() - t, 2)
        vs = variants(spec)
        for i, x in enumerate(vs):
            if x.get("seed", 0) is None:
                x["seed"] = a.seed + i + 1
        (ip / "runs" / "variants.json").write_text(json.dumps(vs, indent=1), encoding="utf-8")
        t = time.time()
        sh([TSX, str(HERE / "run.ts"), "--spec", str(study / "spec.json"), "--variants", str(ip / "runs" / "variants.json"), "--out-dir", str(ip / "runs"), "--n", str(a.n), "--seed", str(a.seed)], log)
        T["3_variants_s"] = round(time.time() - t, 2)
        T["3_variants_count"] = len(vs)
        t = time.time()
        ase = ROOT / "studies" / spec.get("sourceStudy", "") / "internal" / "runs" / "k500_full_v1" / "checkpoint.jsonl"
        out = sh([sys.executable, "-I", str(HERE / "analyze.py"), "--spec", str(study / "spec.json"), "--runs", str(ip / "runs"), "--out", str(ip / "qc")]
                 + (["--ase-checkpoint", str(ase)] if ase.exists() else []), log)
        print(out.strip().splitlines()[-1])
        T["4_qc_analysis_s"] = round(time.time() - t, 2)
        t = time.time()
        print(sh([sys.executable, "-I", str(HERE / "client_report.py"), "--study", str(study)], log).strip())
        T["5_client_report_pdf_pptx_s"] = round(time.time() - t, 2)
        (ip / "logs" / "timings.json").write_text(json.dumps(T, indent=1), encoding="utf-8")
        t = time.time()
        sh([sys.executable, "-I", str(HERE / "internal_package.py"), "--study", str(study), "--timings", str(ip / "logs" / "timings.json")], log)
        T["6_internal_package_s"] = round(time.time() - t, 2)
        T["total_s"] = round(sum(v for k, v in T.items() if k.endswith("_s")), 2)
        (ip / "logs" / "timings.json").write_text(json.dumps(T, indent=1), encoding="utf-8")
    print(json.dumps(T, ensure_ascii=False))


if __name__ == "__main__":
    main()
