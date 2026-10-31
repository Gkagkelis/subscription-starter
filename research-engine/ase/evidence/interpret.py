"""Επιστημονική ερμηνεία ερωτήσεων: έννοιες (ανά ερώτηση ΚΑΙ ανά επιλογή), αν αφορά συγκεκριμένη μάρκα, τι μετρά,
χρονικός ορίζοντας, μονάδα (άτομο/νοικοκυριό), μορφή απάντησης, εξαρτήσεις. Ντετερμινιστική και ελέγξιμη."""
from __future__ import annotations

import re
import unicodedata
from functools import lru_cache

from ..paths import ENGINE_ROOT
from ..util import load_structured


def norm(s: str) -> str:
    s = unicodedata.normalize("NFD", str(s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


@lru_cache(maxsize=4)
def ontology(path: str | None = None) -> dict:
    return load_structured(path or ENGINE_ROOT / "config" / "constructs.yaml")


def constructs_in(text: str, onto: dict | None = None) -> dict:
    """{έννοια: {πτυχή: όρος που ταίριαξε}} για τις έννοιες όπου ταιριάζουν ΟΛΕΣ οι πτυχές."""
    onto = onto or ontology()
    t = norm(text)
    out = {}
    for name, c in onto["constructs"].items():
        hit = {}
        for facet, terms in c["facets"].items():
            m = next((x for x in terms if norm(x) in t), None)
            if m is None:
                break
            hit[facet] = m
        else:
            out[name] = hit
    return out


def missing_facets(text: str, construct: str, onto: dict | None = None) -> list:
    onto = onto or ontology()
    t = norm(text)
    return [f for f, terms in onto["constructs"][construct]["facets"].items() if not any(norm(x) in t for x in terms)]


MEASURE_RX = [("trust", r"εμπιστ|trust|τηρει"), ("satisfaction", r"ικανοποι|satisf"), ("awareness", r"γνωριζετε|εχετε ακουσει|aware"),
              ("intention", r"θα (αγορ|ξαναγορ|συστ|επιλεγ)|πιθανο να|intend|likely"), ("frequency", r"ποσο συχνα|how often|καθε (χρονο|μηνα)"),
              ("experience", r"εχετε (αγορασει|επιστρεψει|αντιμετωπισει)|τους τελευταιους|last \d+"), ("preference", r"προτιμ|θα επιλεγατε|prefer"),
              ("importance", r"σημαντικ|important"), ("perception", r"μεγαλυτερο προβλημα|συνηθως οι καταναλωτες")]


PRIMARY_FACET = {"trust": ("trust",), "satisfaction": ("recovery", "problem", "delivery"), "importance": ("importance", "delivery", "warranty"),
                 "awareness": ("csr",)}


def interpret(q, onto: dict | None = None) -> dict:
    onto = onto or ontology()
    base = " ".join([q.text, (q.scenario or {}).get("text", "")])
    t = norm(base)
    brand = any(norm(b) in t for b in onto.get("brand_terms", []))
    m = re.search(r"(?:τους |τα )?τελευται\w* (\d+) (μην|ετ|χρον)", t) or re.search(r"last (\d+) (month|year)", t)
    horizon = None if not m else (f"{m.group(1)} μήνες" if m.group(2).startswith(("μην", "month")) else f"{m.group(1)} έτη")
    unit = "άτομο ή νοικοκυριό" if re.search(r"νοικοκυρι|household", t) else "άτομο"
    measures = [k for k, rx in MEASURE_RX if re.search(rx, t)]
    q_constructs = constructs_in(base + " " + " ".join(o.label for o in q.options), onto)
    opt = {}
    for o in q.options:
        c = constructs_in(base + " " + o.label, onto)
        own = constructs_in(o.label, onto)
        opt[o.code] = sorted(set(c) | set(own))
    want = {f for ms in measures for f in PRIMARY_FACET.get(ms, ())}
    primary = sorted(c for c in q_constructs if want & set(onto["constructs"][c]["facets"])) if want else sorted(q_constructs)
    return {"question_id": q.id, "type": q.type, "constructs": sorted(q_constructs), "primary_constructs": primary, "option_constructs": opt, "brand_specific": brand,
            "measures": measures or ["attitude"], "horizon": horizon, "unit": unit, "hypothetical": bool(q.scenario) or q.intent == "hypothetical_choice",
            "intent": q.intent, "condition": q.condition, "screening": bool(q.screening),
            "format": {"single_choice": "μία απάντηση (κατανομή που αθροίζει 1)", "likert": "διατεταγμένη κλίμακα", "scenario": "μία απάντηση σε σενάριο",
                       "multiple_choice": "πολλαπλή επιλογή (εξαρτήσεις/όρια)", "ranking": "μοναδικές θέσεις", "numeric": "αριθμός με μονάδα/εύρος",
                       "open": "ελεύθερο κείμενο", "dce": "επιλογή μεταξύ εναλλακτικών"}.get(q.type, q.type)}
