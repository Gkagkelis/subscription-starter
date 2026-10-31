"""Πύλη καταλληλότητας τεκμηρίων (Evidence Suitability Gate) — δομημένη, ελέγξιμη απόφαση, όχι σκορ ομοιότητας.

Κατηγορίες: DIRECT_EMPIRICAL · TRANSPORTABLE_EMPIRICAL · CONTEXTUAL_EVIDENCE · INSUFFICIENT_EVIDENCE · RETRIEVAL_ERROR · UNAVAILABLE_SOURCE
Κανόνες:
  * Αυτόματη ανάκτηση ⇒ το πολύ CONTEXTUAL_EVIDENCE. Εμπειρική χρήση απαιτεί ΔΗΛΩΜΕΝΗ σχέση μέτρησης (evidence_map.yaml:
    equivalent / lower_bound / lower_bound_union / proxy) και επιτυχείς ελέγχους (έννοια, χώρα, έτος, μονάδα, πληθυσμός,
    χρονικός ορίζοντας, διαθεσιμότητα τιμών, άδεια).
  * Ερώτηση για συγκεκριμένη μάρκα: γενική πηγή (π.χ. εμπιστοσύνη σε λιανική) ΠΟΤΕ δεν κληρονομεί ποσοστό· μόνο πλαίσιο.
  * Μη ελληνική πηγή: TRANSPORTABLE μόνο με εγκεκριμένη μεταφορά (LOCO)· αλλιώς CONTEXTUAL.
  * Αποτυχία ανάκτησης ≠ απουσία: RETRIEVAL_ERROR / UNAVAILABLE_SOURCE."""
from __future__ import annotations

from .interpret import missing_facets, norm, ontology

CLASSES = ("DIRECT_EMPIRICAL", "TRANSPORTABLE_EMPIRICAL", "CONTEXTUAL_EVIDENCE", "INSUFFICIENT_EVIDENCE", "RETRIEVAL_ERROR", "UNAVAILABLE_SOURCE")
CURRENT_YEAR = 2026


def check(name, ok, detail):
    return {"check": name, "pass": bool(ok), "detail": detail}


def assess_candidate(cand: dict, qi: dict, max_age: int = 8) -> dict:
    """Αυτόματος υποψήφιος του lake για μια ερώτηση (χωρίς δηλωμένη σχέση μέτρησης)."""
    onto = ontology()
    shared = sorted(set(cand.get("constructs", [])) & set(qi.get("primary_constructs") or qi["constructs"]))
    checks = []
    if not shared:
        why = []
        text = f"{cand.get('text', '')} {cand.get('options', '')}"
        for c in (qi.get("primary_constructs") or qi["constructs"]):
            mf = missing_facets(text, c, onto)
            if mf:
                why.append(f"{c}: λείπει η πτυχή {', '.join(mf)}")
        checks.append(check("έννοια", False, "; ".join(why) or "καμία κοινή έννοια"))
        return {"class": "INSUFFICIENT_EVIDENCE", "rejected": True, "checks": checks, "reason": "Διαφορετική έννοια (λεξική ομοιότητα χωρίς ισοδυναμία μέτρησης)"}
    checks.append(check("έννοια", True, f"κοινές έννοιες: {', '.join(shared)}"))
    years = [int(y) for y in str(cand.get("years") or cand.get("study_year") or "").replace(",", " ").split() if y.isdigit()]
    latest = max(years) if years else None
    checks.append(check("επικαιρότητα", latest is not None and CURRENT_YEAR - latest <= max_age, f"τελευταίο έτος {latest} (όριο {max_age})"))
    checks.append(check("σχέση μέτρησης", False, "αυτόματη αντιστοίχιση: δεν έχει δηλωθεί σχέση μέτρησης (ισοδύναμη/όριο/proxy)"))
    if qi["brand_specific"] and not any(norm(b) in norm(cand.get("text", "")) for b in onto.get("brand_terms", [])):
        checks.append(check("μάρκα", False, "η ερώτηση αφορά συγκεκριμένη μάρκα· η πηγή είναι γενική — δεν κληρονομεί ποσοστό"))
    recent = checks[1]["pass"]
    return {"class": "CONTEXTUAL_EVIDENCE" if recent else "INSUFFICIENT_EVIDENCE", "rejected": not recent, "checks": checks,
            "reason": "Σχετική πηγή για πλαίσιο· όχι εμπειρική εκτίμηση" if recent else "Παλαιά δεδομένα"}


def assess_component(comp: dict, qi: dict, info: dict) -> dict:
    """Δηλωμένη συνιστώσα του evidence_map. info: αποτελέσματα ελέγχων δεδομένων (τιμές, έτος, μονάδα, χρησιμότητα μοντέλου)."""
    checks = []
    if info.get("error_kind") == "unavailable":
        return {"class": "UNAVAILABLE_SOURCE", "checks": [check("πρόσβαση", False, info.get("error"))], "usable": False}
    if info.get("error_kind") == "retrieval":
        return {"class": "RETRIEVAL_ERROR", "checks": [check("ανάκτηση", False, info.get("error"))], "usable": False}
    rel = comp["relation"]
    checks.append(check("σχέση μέτρησης", rel in ("equivalent", "lower_bound", "lower_bound_union", "proxy"), f"δηλωμένη: {rel} — {comp.get('justification', '')}"))
    checks.append(check("χώρα", info.get("greek", False), "ελληνικές τιμές" if info.get("greek") else "όχι ελληνικές τιμές"))
    checks.append(check("έτος", info.get("year") is not None and CURRENT_YEAR - int(info["year"]) <= int(comp.get("max_age", 8)), f"έτος δεδομένων {info.get('year')}"))
    checks.append(check("μονάδα/παρονομαστής", bool(info.get("unit")), f"μονάδα {info.get('unit')}"))
    if comp.get("population_note"):
        checks.append(check("πληθυσμός", True, comp["population_note"]))
    if rel in ("lower_bound", "lower_bound_union"):
        checks.append(check("ανακατασκευή ανά πρόσωπο", info.get("model_usable", False), f"μέγιστο σφάλμα περιθωρίων {info.get('max_margin_error_pp')} μον. (όριο 1,5)"))
        if info.get("transported_cells"):
            checks.append(check("μεταφορά κελιών", True, f"κελιά από εγκεκριμένη μεταφορά (μειωμένα κατά MAE): {', '.join(info['transported_cells'])}"))
    if qi["brand_specific"] and rel != "proxy":
        checks.append(check("μάρκα", False, "γενική πηγή δεν μπορεί να ορίσει απάντηση για συγκεκριμένη μάρκα"))
    hard = [c for c in checks if not c["pass"]]
    if rel == "proxy":
        cls = "CONTEXTUAL_EVIDENCE" if not [c for c in hard if c["check"] in ("χώρα", "έτος", "μονάδα/παρονομαστής")] else "INSUFFICIENT_EVIDENCE"
    elif not hard:
        cls = "TRANSPORTABLE_EMPIRICAL" if info.get("transported_cells") and rel == "equivalent" else "DIRECT_EMPIRICAL"
    else:
        cls = "CONTEXTUAL_EVIDENCE" if all(c["check"] in ("ανακατασκευή ανά πρόσωπο", "μάρκα") for c in hard) else "INSUFFICIENT_EVIDENCE"
    return {"class": cls, "checks": checks, "usable": cls in ("DIRECT_EMPIRICAL", "TRANSPORTABLE_EMPIRICAL", "CONTEXTUAL_EVIDENCE")}
