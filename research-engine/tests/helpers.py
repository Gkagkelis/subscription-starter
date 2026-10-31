"""Βοηθητικά tests: μικρή μελέτη με ΟΛΟΥΣ τους τύπους ερωτήσεων, skip logic, screening, DCE, σενάρια."""
import os
from pathlib import Path

import yaml

QUESTIONNAIRE = {
    "questionnaire_id": "test_v1", "title": "Test", "language": "el",
    "consistency_rules": [{"id": "R1", "when": "L1 == '5' and num(N1) < 2"}],
    "blocks": [
        {"id": "B0", "title": "Screening", "questions": [
            {"id": "S1", "text": "Έχετε αγοράσει ηλεκτρική συσκευή τους τελευταίους 24 μήνες;", "type": "single_choice",
             "options": ["Ναι", "Όχι"], "screening": {"terminate_if": ["2"]}},
            {"id": "D1", "text": "Φύλο", "type": "single_choice", "intent": "demographic", "profile_field": "gender",
             "options": [{"code": "1", "label": "Άνδρας"}, {"code": "2", "label": "Γυναίκα"}], "profile_map": {"male": "1", "female": "2"}}]},
        {"id": "B1", "title": "Κύριο", "questions": [
            {"id": "K1", "text": "Γνωρίζετε το κατάστημα Χ;", "type": "single_choice", "options": ["Ναι", "Όχι"]},
            {"id": "L1", "text": "Πόσο εμπιστεύεστε το κατάστημα Χ;", "type": "likert", "condition": "K1 == '1'", "scale": {"points": 5}},
            {"id": "M1", "text": "Ποια κανάλια χρησιμοποιείτε;", "type": "multiple_choice", "options": ["Κατάστημα", "Online", "Marketplace", {"code": "4", "label": "Κανένα", "exclusive": True}],
             "min_choices": 1, "max_choices": 3, "randomize_options": True, "anchor": ["4"]},
            {"id": "N1", "text": "Σε κλίμακα 0–10, πόσο πιθανό είναι να το συστήνατε;", "type": "numeric", "numeric": {"min": 0, "max": 10, "integer": True}},
            {"id": "R1", "text": "Κατατάξτε τα κριτήρια", "type": "ranking", "rank_k": 2, "options": ["Τιμή", "Παράδοση", "Εξυπηρέτηση"]},
            {"id": "O1", "text": "Τι θα σας έκανε να εμπιστευτείτε ένα κατάστημα;", "type": "open"},
            {"id": "SC1a", "text": "Πόσο ικανοποιημένος/η θα ήσασταν;", "type": "scenario", "sensitivity_group": "G", "variant_label": "με ενημέρωση",
             "scenario": {"text": "Καθυστέρηση 3 ημερών με ενημέρωση."}, "options": ["Καθόλου", "Λίγο", "Πολύ"]},
            {"id": "SC1b", "text": "Πόσο ικανοποιημένος/η θα ήσασταν;", "type": "scenario", "sensitivity_group": "G", "variant_label": "χωρίς ενημέρωση",
             "scenario": {"text": "Καθυστέρηση 3 ημερών χωρίς ενημέρωση."}, "options": ["Καθόλου", "Λίγο", "Πολύ"]},
            {"id": "X1", "text": "Ποια προσφορά θα επιλέγατε;", "type": "dce",
             "dce": {"alternatives": [{"id": "A", "label": "Α"}, {"id": "B", "label": "Β"}], "attributes": {"Τιμή": ["500 €", "550 €"], "Παράδοση": ["1 ημέρα", "5 ημέρες"]},
                     "none_option": True}}]}]}


def make_study(name: str, n: int = 12, questionnaire: dict | None = None, extra_cfg: dict | None = None, **panel_kw) -> Path:
    root = Path(os.environ["ASE_STUDIES_ROOT"])
    d = root / name
    d.mkdir(parents=True, exist_ok=True)
    cfg = {"study_id": name, "country": "GR", "questionnaire": "questionnaire.yaml",
           "study": {"title": f"Μελέτη δοκιμής {name}", "client": "Δοκιμή", "topic": "δοκιμή υποδομής"},
           "panel": {"population": "adults_18_plus", "sample_size": n, "geography": "nationwide", "random_seed": 20261031,
                     "sampling": {"strategy": "demographic_quota", "variables": ["age", "gender", "region", "education", "income_band"], "tolerance_pp": 50}, **panel_kw},
           "research": {"search_terms_en": ["consumer", "trust"], "search_terms_el": ["εμπιστοσύνη"], "use_lake": False, "use_official": True, "web": {"enabled": False}}}
    cfg.update(extra_cfg or {})
    (d / "config.yaml").write_text(yaml.safe_dump(cfg, allow_unicode=True), encoding="utf-8")
    (d / "questionnaire.yaml").write_text(yaml.safe_dump(questionnaire or QUESTIONNAIRE, allow_unicode=True), encoding="utf-8")
    return d
