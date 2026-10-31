"""Συνάφεια πηγών (κανόνες v2), αντιστοίχιση σε ερωτήσεις, διαχωρισμός audit/report, ακεραιότητα της δοκιμής 15 προφίλ."""
import json
import re
from pathlib import Path

import yaml

from ase.evidence.context import assess, context_text, study_concepts
from ase.study import Study
from helpers import make_study

RC = {"concepts": {"trust": ["trust", "εμπιστευ", "εμπιστοσύνη"], "delivery": ["delivery", "παράδοση", "παραδιδ"],
                   "complaints": ["complaint", "redress", "παράπονο"], "warranty": ["warranty", "guarantee", "εγγύηση"]},
      "domain_terms": ["consumer protection", "consumer conditions", "retail", "shopping", "e-commerce", "appliance", "sale of goods"],
      "off_topic_terms": ["cross-border"], "max_age_years": 8}
SC = study_concepts(RC)


def _item(title, **kw):
    return {"id": "x", "kind": "internal_lake_study", "title": title, "url": "https://example.org/x", "date": "2024", **kw}


def test_relevance_rules_reject_irrelevant_even_with_keywords():
    cases = [
        (_item("Food innovation: building public trust and outreach", excerpt="innovative foods and ingredients"), "δεν αφορά το πεδίο"),
        (_item("Retailers' attitudes towards consumer protection and complaints"), "επιχειρήσεων"),
        (_item("Business attitudes towards enforcement and redress", population="Κάτοικοι 15+"), "επιχειρήσεων"),
        (_item("Consumer attitudes towards cross-border trade and consumer protection: complaints"), "Εκτός θέματος"),
        (_item("Consumer protection and complaints in the internal market", date="2012"), "Παλαιά"),
        (_item("Consumer survey Greece: attitudes"), "Καμία θεματική έννοια"),
        (_item("Consumer conditions in Europe", excerpt="late delivery and complaints"), "Καμία θεματική έννοια"),   # έννοια μόνο στην περίληψη
        (_item("Consumer protection: complaints and redress", date=""), "Άγνωστο έτος"),
    ]
    for it, why in cases:
        ok, reason, _ = assess(it, SC, RC)
        assert not ok and why in reason, (it["title"], reason)
    ok, _, info = assess(_item("Consumer Conditions Scoreboard: complaints and redress, trust in retailers"), SC, RC)
    assert ok and {"complaints", "trust"} <= set(info["strong_concepts"])
    legal = {"id": "l", "kind": "curated_source", "title": "Directive (EU) 2019/771 on contracts for the sale of goods (guarantee)",
             "url": "https://eur-lex.europa.eu", "date": "2019-05", "evidence_type": "legal_framework", "concepts": ["warranty"]}
    assert assess(legal, SC, RC)[0]                                                # νομικό πλαίσιο: εξαίρεση από το όριο ηλικίας


def test_question_mapping_has_no_fallback_and_context_is_background_only():
    d = make_study("src_map", n=5, extra_cfg={"research": {**RC, "search_terms_en": ["trust"], "search_terms_el": [], "use_lake": False, "use_official": True,
                                                           "web": {"enabled": False}}})
    (d / "sources.yaml").write_text(yaml.safe_dump({"sources": [
        {"id": "src:del", "title": "Online shopping problems: late delivery and damaged goods", "url": "https://ec.europa.eu/x", "date": "2025", "data_year": 2025,
         "country": "GR", "population": "online buyers", "sample": "unknown", "limitations": "όλα τα αγαθά", "concepts": ["delivery"], "supports": "Ποσοστό καθυστερήσεων"},
        {"id": "src:food", "title": "Food innovation: building public trust", "url": "https://ec.europa.eu/y", "date": "2025", "country": "EU27",
         "population": "15+", "sample": "1000", "limitations": "-"}]}, allow_unicode=True), encoding="utf-8")
    st = Study(d)
    reg = st.build_context()
    acc = {a["id"] for a in reg["accepted"]}
    rej = {r["id"]: r["rejected_reason"] for r in reg["rejected"]}
    assert acc == {"src:del"} and "src:food" in rej
    assert reg["question_map"]["K1"] == [] and reg["question_concepts"]["K1"] == []        # ερώτηση χωρίς έννοια → χωρίς πηγή
    assert all(not v or v == ["src:del"] for v in reg["question_map"].values())
    assert reg["question_map"]["SC1a"] == []                                     # «καθυστέρηση» δεν είναι όρος της έννοιας εδώ
    txt, ids = context_text(reg, "R1")                                             # επιλογή «Παράδοση» → έννοια delivery
    assert ids == ["src:del"] and "Υπόβαθρο μόνο" in txt and "πιθανότητες" in txt
    assert context_text(reg, "K1")[0].startswith("- Δεν βρέθηκε συναφής")


def test_audit_keeps_provenance_but_client_report_has_no_evidence_labels():
    st = Study(make_study("src_rep", n=10))
    rid = st.run({"provider": "mock"}, max_workers=2)
    rdir = st.internal / "runs" / rid
    assert (rdir / "evidence_registry_used.json").exists()                          # πλαίσιο της εκτέλεσης στο audit
    df = st.responses(rid)
    assert set(df["empirical_support"]) - {""} and "evidence_refs" in df.columns     # προέλευση ανά απάντηση: μόνο εσωτερικά
    out = st.build_deliverables(rid, pdf=False)
    html = (out / "executive_report.html").read_text(encoding="utf-8")
    for label in ("AI-only", "evidence-grounded", "χωρίς εμπειρική", "CONTEXT_ONLY", "EMPIRICAL_MODEL", "SIMULATED_RESPONSE", "empirical_support", "rationale"):
        assert label not in html, label
    assert "Δεν αποτελεί δειγματοληπτική έρευνα" in html and "δεν αποτελούν επαληθευμένες εκτιμήσεις" in html
    assert not re.search(r"τεκμηριωμένο ερευνητικό πλαίσιο", html)


def test_session_ai_15_milestone_intact():
    run = Path(__file__).resolve().parents[2] / "studies" / "kotsovolos_trust_2026" / "internal" / "runs" / "session_ai_15"
    if not run.exists():
        return
    man = json.loads((run / "execution_manifest.json").read_text(encoding="utf-8"))
    prov = json.loads((run / "model_provenance.json").read_text(encoding="utf-8"))
    assert man["status_counts"] == {"COMPLETE": 13, "SCREENED_OUT": 2} and man["errors"] == 0 and prov["mock"] is False
    assert len(list((run / "session" / "answers").glob("*.json"))) == 158
    assert not (run / "completes_report.json").exists() and not (run / "evidence_registry_used.json").exists()   # καμία αναδρομική αλλαγή
