"""Μετατροπή ερωτηματολογίου «partner JSON» (schema_version 1.0: questions[] με section / type single|multi / ask_if /
options / min_selections / max_selections / rationale / source_pages) στη μορφή του ASE (YAML με blocks), ΧΩΡΙΣ απώλεια:

* κείμενα και επιλογές μένουν αυτούσια (ίδιοι κωδικοί, ίδιες ετικέτες, ίδια σειρά)·
* κάθε πρωτότυπο πεδίο που δεν χρησιμοποιεί η μηχανή φυλάσσεται στο `source_meta` της ερώτησης (δεν μπαίνει στα prompts)·
* ό,τι ΠΡΟΣΘΕΤΕΙ η ενοποίηση (αντιστοίχιση δημογραφικών στο προφίλ, πρόθεση ερώτησης, λογικοί περιορισμοί, κανόνες συνέπειας,
  «θετικές» επιλογές για την ευαισθησία) έρχεται από ρητό overlay αρχείο και σημειώνεται `origin: integration_overlay`.

Το αποτέλεσμα περνά από τον κανονικό έλεγχο `questionnaire.model.parse`."""
from __future__ import annotations

import re

from . import model as QM

TYPE_MAP = {"single": "single_choice", "multi": "multiple_choice"}
# κανόνας του ερωτηματολογίου: «Multi selections cannot include exclusive options (e.g. Καμία, Δεν γνωρίζω) with substantive choices»
EXCLUSIVE_RE = re.compile(r"^\s*(καμία|κανένα|δεν γνωρίζω|δεν θυμάμαι|δεν ξέρω)\b", re.I)
_TOK = re.compile(r"^\s*([A-Za-z]\w*)\s*(!=|=)\s*([\w]+)\s*$")


def convert_condition(ask_if: str | None, types: dict) -> str | None:
    """«all» → χωρίς συνθήκη· «Q01=1», «Q04!=1», «Q15=1 AND Q17=1» (και OR) → έκφραση του ASE. Άγνωστη σύνταξη → σφάλμα."""
    if ask_if is None or str(ask_if).strip().lower() in ("", "all"):
        return None
    out = []
    for part in re.split(r"\s+(AND|OR)\s+", str(ask_if).strip()):
        if part in ("AND", "OR"):
            out.append(part.lower())
            continue
        m = _TOK.match(part)
        if not m:
            raise ValueError(f"μη αναγνωρίσιμη συνθήκη ask_if: {ask_if!r}")
        qid, op, val = m.groups()
        if qid not in types:
            raise ValueError(f"η ask_if αναφέρεται σε άγνωστη ερώτηση {qid}")
        if types[qid] == "multi":
            out.append(f"{'not ' if op == '!=' else ''}contains({qid}, '{val}')")
        else:
            out.append(f"{qid} {'!=' if op == '!=' else '=='} '{val}'")
    return " ".join(out)


def convert(spec: dict, overlay: dict | None = None) -> tuple[dict, dict]:
    """Επιστρέφει (native questionnaire dict, αναφορά μετατροπής)."""
    ov = overlay or {}
    oq = ov.get("questions") or {}
    types = {q["id"]: q.get("type") for q in spec["questions"]}
    report = {"source_schema": spec.get("schema_version"), "questions": len(spec["questions"]), "exclusive_detected": {}, "conditions": {},
              "overlay_fields": {}, "unknown_types": [], "preserved_top_level": []}
    blocks, cur = [], None
    for q in spec["questions"]:
        sec = q.get("section") or "Ενότητα"
        if cur is None or cur["title"] != sec:
            cur = {"id": f"B{len(blocks) + 1:02d}", "title": sec, "questions": []}
            blocks.append(cur)
        t = TYPE_MAP.get(q.get("type"))
        if not t:
            report["unknown_types"].append(f"{q['id']}: {q.get('type')}")
            continue
        opts = []
        for o in q.get("options") or []:
            o2 = {"code": str(o["code"]), "label": o["label"]}
            if t == "multiple_choice" and EXCLUSIVE_RE.match(o["label"]):
                o2["exclusive"] = True
                report["exclusive_detected"].setdefault(q["id"], []).append(f"{o['code']}: {o['label']}")
            opts.append(o2)
        nq = {"id": q["id"], "text": q["text"], "type": t, "options": opts}
        cond = convert_condition(q.get("ask_if"), types)
        if cond:
            nq["condition"] = cond
        report["conditions"][q["id"]] = {"ask_if": q.get("ask_if"), "condition": cond}
        if t == "multiple_choice":
            nq["min_choices"] = int(q.get("min_selections", 1))
            if q.get("max_selections") is not None:
                nq["max_choices"] = int(q["max_selections"])
        nq["source_meta"] = {k: v for k, v in q.items() if k not in ("id", "text", "type", "options", "min_selections", "max_selections")}
        extra = oq.get(q["id"]) or {}
        for k, v in extra.items():
            if k in ("text", "options", "type", "id"):
                raise ValueError(f"{q['id']}: το overlay δεν επιτρέπεται να αλλάξει {k}")
            nq[k] = v
        if extra:
            report["overlay_fields"][q["id"]] = sorted(extra)
        cur["questions"].append(nq)
    top = {k: v for k, v in spec.items() if k != "questions"}
    report["preserved_top_level"] = sorted(top)
    native = {"questionnaire_id": spec.get("study_id", "questionnaire"), "title": spec.get("title", ""), "language": "el",
              "source_meta": top, "blocks": blocks,
              "constraints": [{**c, "origin": "integration_overlay"} for c in ov.get("constraints") or []],
              "consistency_rules": [{**c, "origin": "integration_overlay"} for c in ov.get("consistency_rules") or []]}
    QM.parse(native)            # ίδιος έλεγχος με κάθε άλλο ερωτηματολόγιο του ASE
    return native, report


def roundtrip_check(spec: dict, native: dict) -> list:
    """Επιβεβαίωση ότι ΚΑΘΕ κείμενο/επιλογή/τύπος/όριο/ask_if του πρωτοτύπου υπάρχει αυτούσιο στη μετατροπή."""
    errs = []
    nq = {q["id"]: q for b in native["blocks"] for q in b["questions"]}
    if [q["id"] for q in spec["questions"]] != [q["id"] for b in native["blocks"] for q in b["questions"]]:
        errs.append("διαφορετική σειρά ή σύνολο ερωτήσεων")
    for q in spec["questions"]:
        n = nq.get(q["id"])
        if not n:
            errs.append(f"{q['id']}: λείπει")
            continue
        if n["text"] != q["text"]:
            errs.append(f"{q['id']}: άλλαξε το κείμενο")
        if [(str(o["code"]), o["label"]) for o in q.get("options") or []] != [(o["code"], o["label"]) for o in n["options"]]:
            errs.append(f"{q['id']}: άλλαξαν οι επιλογές")
        if TYPE_MAP.get(q["type"]) != n["type"]:
            errs.append(f"{q['id']}: άλλαξε ο τύπος")
        sm = n.get("source_meta") or {}
        for k in ("section", "ask_if", "rationale", "source_pages"):
            if k in q and sm.get(k) != q[k]:
                errs.append(f"{q['id']}: χάθηκε το πεδίο {k}")
        if q.get("type") == "multi" and (n.get("min_choices"), n.get("max_choices")) != (q.get("min_selections", 1), q.get("max_selections")):
            errs.append(f"{q['id']}: άλλαξαν τα όρια επιλογών")
    return errs
