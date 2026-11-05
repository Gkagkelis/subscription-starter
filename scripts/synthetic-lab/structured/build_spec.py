"""Χτίζει την προδιαγραφή (spec.json) του γρήγορου μηχανισμού από:
  * το ΕΓΚΕΚΡΙΜΕΝΟ ερωτηματολόγιο μιας μελέτης (κείμενα, κωδικοί, skip logic, κανόνες C/S) — μόνο ανάγνωση, έλεγχος παγωμένου hash·
  * το αρχείο μοντέλου της πιλοτικής μελέτης (model.yaml): κατηγορίες E/T/S, πηγές, παραδοχές, παράμετροι σεναρίου.

    python3 -I scripts/synthetic-lab/structured/build_spec.py studies/kotsovolos_lab_pilot_2026/model.yaml [--out spec.json]
"""
from __future__ import annotations

import argparse
import hashlib
import json
import sys
from pathlib import Path

import yaml

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "research-engine"))
from ase.questionnaire import model as QM  # noqa: E402
from ase.util import load_structured  # noqa: E402


def sha256(p: Path) -> str:
    return hashlib.sha256(p.read_bytes()).hexdigest()


def build(model_path: Path) -> dict:
    m = yaml.safe_load(model_path.read_text(encoding="utf-8"))
    src = (model_path.parent / m["source_study"]).resolve()
    cfg = load_structured(src / "config.yaml")
    qfile = src / cfg.get("questionnaire", "questionnaire.yaml")
    frozen = ((cfg.get("approval") or {}).get("frozen") or {})
    qsha = sha256(qfile)
    if frozen.get("questionnaire_sha256") and frozen["questionnaire_sha256"] != qsha:
        raise SystemExit(f"Το ερωτηματολόγιο της {src.name} δεν ταιριάζει με το παγωμένο hash — διακοπή.")
    overlay = load_structured(src / "integration_overlay.yaml") if (src / "integration_overlay.yaml").exists() else {}
    from ase.study import Study          # ίδια φόρτωση με το ASE (ερωτηματολόγιο + overlay), μόνο ανάγνωση
    qn = Study(src).qn
    qmodels = m["questions"]
    questions = []
    for q in qn.questions:
        if q.id not in qmodels:
            raise SystemExit(f"Η ερώτηση {q.id} δεν έχει μοντέλο στο {model_path.name}.")
        spec = qmodels[q.id]
        questions.append({
            "id": q.id, "block": q.block, "type": q.type, "text": q.text,
            "options": [{"code": o.code, "label": o.label, **({"exclusive": True} if getattr(o, "exclusive", False) else {})} for o in q.options],
            "condition": q.condition, "minChoices": getattr(q, "min_choices", None) or 1, "maxChoices": getattr(q, "max_choices", None),
            "class": spec["class"], "model": spec["model"], "sources": spec.get("sources", []), "assumptions": spec.get("assumptions", []),
            **({"note": spec["note"]} if spec.get("note") else {}),
        })
    extra = set(qmodels) - {q.id for q in qn.questions}
    if extra:
        raise SystemExit(f"Μοντέλα για ερωτήσεις που δεν υπάρχουν: {sorted(extra)}")
    return {
        "studyId": m["study_id"], "title": m["title"], "specVersion": m["spec_version"], "domain": m["domain"], "referenceYear": m["reference_year"],
        "questionnaireSha256": qsha, "sourceStudy": src.name,
        "population": m["population"], "metrics": m["metrics"], "derived": m.get("derived", []), "latents": m.get("latents", []),
        "questions": questions, "generationOrder": m.get("generation_order"),
        "constraints": [{"id": c["id"], "forbid": c["forbid"], "reason": " ".join(str(c.get("reason", "")).split())} for c in overlay.get("constraints", [])],
        "rules": [{"id": r["id"], "when": r["when"], "note": r.get("note", "")} for r in overlay.get("consistency_rules", [])],
        "assumptions": m.get("assumptions", []),
    }


if __name__ == "__main__":
    ap = argparse.ArgumentParser()
    ap.add_argument("model")
    ap.add_argument("--out")
    a = ap.parse_args()
    mp = Path(a.model).resolve()
    spec = build(mp)
    out = Path(a.out) if a.out else mp.parent / "spec.json"
    out.write_text(json.dumps(spec, ensure_ascii=False, indent=1), encoding="utf-8")
    print(out, len(spec["questions"]), "ερωτήσεις ·", sum(q["class"] == "E" for q in spec["questions"]), "E /",
          sum(q["class"] == "T" for q in spec["questions"]), "T /", sum(q["class"] == "S" for q in spec["questions"]), "S")
