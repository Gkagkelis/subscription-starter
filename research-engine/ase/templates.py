"""Πρότυπο νέας μελέτης (config.yaml + ελάχιστο questionnaire.yaml). Ο βασικός κώδικας δεν αλλάζει ανά μελέτη."""
from __future__ import annotations

from pathlib import Path

import yaml

QUESTIONNAIRE_TEMPLATE = {
    "questionnaire_id": "QID_v1", "title": "", "language": "el",
    "blocks": [{"id": "B1", "title": "Δημογραφικά", "questions": [
        {"id": "D1", "text": "Φύλο", "type": "single_choice", "intent": "demographic", "profile_field": "gender",
         "options": [{"code": "1", "label": "Άνδρας"}, {"code": "2", "label": "Γυναίκα"}], "profile_map": {"male": "1", "female": "2"}}]},
               {"id": "B2", "title": "Κύριο θέμα", "questions": [
                   {"id": "Q1", "text": "Πόσο ικανοποιημένος/η είστε με …;", "type": "likert", "scale": {"points": 5, "labels": {1: "Καθόλου", 5: "Πάρα πολύ"}}}]}]}


def init_study(d: Path, study_id: str, title: str, client: str, n: int, regions: list, filters: dict) -> Path:
    d.mkdir(parents=True, exist_ok=True)
    if (d / "config.yaml").exists():
        raise FileExistsError(f"Υπάρχει ήδη μελέτη στο {d}")
    cfg = {"study_id": study_id, "country": "GR", "questionnaire": "questionnaire.yaml",
           "study": {"title": title, "subtitle": "", "client": client, "topic": ""},
           "panel": {"population": "adults_18_plus", "sample_size": n, "geography": {"regions": regions} if regions else "nationwide", "filters": filters,
                     "sampling": {"strategy": "demographic_quota", "variables": ["age", "gender", "region", "household_type", "education", "income_band"], "tolerance_pp": 2},
                     "random_seed": 20261031},
           "research": {"search_terms_en": [], "search_terms_el": [], "use_lake": True, "use_official": True, "web": {"enabled": False}},
           "llm": {"max_tokens": 1500}, "report": {"key_questions": [], "implications": [], "conclusions": []}}
    (d / "config.yaml").write_text(yaml.safe_dump(cfg, allow_unicode=True, sort_keys=False), encoding="utf-8")
    q = dict(QUESTIONNAIRE_TEMPLATE, questionnaire_id=f"{study_id}_v1", title=title)
    (d / "questionnaire.yaml").write_text(yaml.safe_dump(q, allow_unicode=True, sort_keys=False), encoding="utf-8")
    return d
