"""Σχέδιο τεκμηρίωσης ανά ερώτηση/επιλογή (Evidence Plan) και βοηθητικά εκτέλεσης.

Για κάθε ερώτηση: ερμηνεία → απόφαση Lab (PIE/autolink/IQGE/βαθμίδα) → υποψήφιοι lake με πύλη καταλληλότητας →
δηλωμένες συνιστώσες (evidence_map.yaml) με πύλη → τρόπος εξαγωγής:
  A_EMPIRICAL           το Lab απαντά ανά πρόσωπο (βαθμίδα 1–4, όχι αποχή)
  C_EVIDENCE_CONSTRAINED  AI με εμπειρικό όριο ανά πρόσωπο (lower_bound/lower_bound_union, DIRECT_EMPIRICAL)
  C_EVIDENCE_INFORMED   AI με εμπειρικό πλαίσιο της ομάδας του προσώπου (proxy, CONTEXTUAL_EVIDENCE)
  D_AI                  AI από προφίλ/ιστορικό/σενάριο, χωρίς επαρκή τεκμήρια
  PROFILE / SKIP        από το προφίλ / skip logic
Οι τρόποι μπορεί να συνυπάρχουν στην ίδια ερώτηση (ανά επιλογή). Καμία σταθερή στάθμιση AI–δεδομένων."""
from __future__ import annotations

from pathlib import Path

from ..util import load_structured, now_iso
from . import lake_index as LX
from .interpret import interpret
from .suitability import assess_candidate, assess_component

FAM_LABEL = {"Y16_24": "16–24", "Y25_34": "25–34", "Y35_44": "35–44", "Y45_54": "45–54", "Y55_64": "55–64", "Y65_74": "65–74", "Y75_MAX": "75+",
             "M_Y16_74": "άνδρες", "F_Y16_74": "γυναίκες", "I0_2": "χαμηλή εκπαίδευση", "I3_4": "μέση εκπαίδευση", "I5_8": "υψηλή εκπαίδευση"}
DESC = {"I_BEEQU1": "αγόρασαν online ηλεκτρονικά ή οικιακές συσκευές στο τρίμηνο", "I_BHARD1": "αγόρασαν online υπολογιστή/tablet/κινητό στο τρίμηνο",
        "I_IUCHAT1": "χρησιμοποίησαν άμεσα μηνύματα (Viber/WhatsApp/Messenger) στο τρίμηνο", "I_IUIF": "αναζήτησαν online πληροφορίες για αγαθά/υπηρεσίες στο τρίμηνο",
        "I_BSPD1": "από όσους αγόρασαν online στο τρίμηνο: παράδοση πιο αργή από την αναγγελθείσα", "I_BWDN1": "από όσους αγόρασαν online: λάθος ή κατεστραμμένο προϊόν",
        "I_BCR1": "από όσους αγόρασαν online: δύσκολα παράπονα/αποζημίωση", "I_BDGL1": "από όσους αγόρασαν online: δυσκολία να βρουν πληροφορίες για εγγυήσεις/δικαιώματα"}


LAKE_LABEL = {"I_BEEQU1": "consumer electronics or household appliances", "I_BHARD1": "computers, tablets, mobile phones", "I_IUCHAT1": "instant messaging, i.e.",
              "I_IUIF": "finding information about goods and services", "I_BSPD1": "Speed of", "I_BWDN1": "Wrong or damaged", "I_BCR1": "Complaints and redress",
              "I_BDGL1": "difficulties finding information"}


def lake_crosscheck(dataset: str, indicator: str, year: int, api_total: float) -> dict:
    """Ελληνική συνολική τιμή του ίδιου δείκτη στο lake (ροή από το ευρετήριο) έναντι του επίσημου API με ρητή μονάδα."""
    try:
        hits = LX.find_by_text(f"eurostat:{dataset}", LAKE_LABEL.get(indicator, indicator))
    except LX.LakeUnavailable as e:
        return {"status": "LAKE_UNAVAILABLE", "error": str(e)}
    vals = []
    for h in hits:
        for r in LX.values(f"eurostat:{dataset}", h["code"]):
            if r["group_dim"] == "all" and str(r["year"]) == str(year):
                vals.append(r["value"])
    if not vals:
        return {"status": "NOT_IN_LAKE", "year": year}
    best = min(vals, key=lambda v: abs(v - api_total))
    return {"status": "MATCH" if abs(best - api_total) < 0.01 else "DIFFERENT_DENOMINATOR_OR_VERSION", "lake_values": sorted(set(round(v, 2) for v in vals)),
            "api_value": round(api_total, 2), "year": year}


_MODEL_CACHE: dict = {}


def _component_info(comp: dict, frame) -> dict:
    from ..global_evidence.eurostat import SourceUnavailable
    from .bounds import fit_person_model, greek_targets
    src = comp["source"]
    inds = src["indicator"] if isinstance(src["indicator"], list) else [src["indicator"]]
    info = {"indicators": {}, "greek": True, "unit": src.get("unit"), "year": None, "transported_cells": []}
    try:
        for ind in inds:
            t = greek_targets(src["dataset"], ind, src["unit"])
            if not t.get("ok"):
                info.update(greek=False)
                continue
            info["indicators"][ind] = t
            info.setdefault("lake_crosscheck", {})[ind] = lake_crosscheck(src["dataset"], ind, t["year"], t["total"])
            info["year"] = max(info["year"] or 0, t["year"])
            info["transported_cells"] += [f"{ind}:{g}" for g, c in t["cells"].items() if c["source"] == "transported"]
            if comp["relation"] in ("lower_bound", "lower_bound_union"):
                mk = (src["dataset"], ind, src["unit"], t["year"])
                m = _MODEL_CACHE.get(mk) or _MODEL_CACHE.setdefault(mk, fit_person_model(t, frame))
                info.update(model=m, model_usable=m["usable"], max_margin_error_pp=m["max_margin_error_pp"])
    except SourceUnavailable as e:
        return {"error_kind": "unavailable", "error": str(e)}
    except Exception as e:  # noqa: BLE001
        return {"error_kind": "retrieval", "error": f"{type(e).__name__}: {e}"}
    return info


def build(study, use_lab: bool = True, lake_limit: int = 5) -> dict:
    from ..population.panel import load_frame
    emap_path = Path(study.dir) / "evidence_map.yaml"
    emap = load_structured(emap_path) if emap_path.exists() else {"components": []}
    frame = load_frame(study.cfg["panel"].get("frame_id", "gr_adults_2025_v1"))
    lab_route, lab_err = {}, None
    lab = study.lab_cfg()
    if use_lab and lab.get("enabled"):
        from ..lab.bridge import LabBridgeError, LabUnavailable, lab_route as route
        try:
            r = route(study.qn, lab["model"], lab["ref"])
            lab_route = {x["id"]: x for x in r["questions"]}
        except (LabUnavailable, LabBridgeError) as e:
            lab_err = f"{type(e).__name__}: {e}"
    cache: dict = {}
    lake_err = None
    plan = {"built_at": now_iso(), "study_id": study.study_id, "lab_model": lab.get("model") if lab.get("enabled") else None, "lab_error": lab_err,
            "evidence_map": str(emap_path.name) if emap_path.exists() else None, "brand": emap.get("brand"), "questions": {}}
    for q in study.qn.questions:
        qi = interpret(q)
        entry = {"interpretation": qi, "lab": None, "lake_candidates": [], "components": [], "mode": "D_AI", "option_modes": {}}
        lr = lab_route.get(q.id)
        if lr:
            d = lr.get("decision") or {}
            entry["lab"] = {"support": lr["support"], "tier": d.get("tier"), "abstain": d.get("abstain"), "specialist": d.get("specialist"),
                            "autolink": lr.get("autolink"), "expectedMAE": d.get("expectedMAE"), "limitations": d.get("limitations")}
        # υποψήφιοι lake ανά έννοια (λεξική ανάκτηση → πύλη)
        for c in qi["constructs"]:
            if c in cache:
                cands = cache[c]
            else:
                try:
                    cands = LX.candidates(c, limit=15)
                except LX.LakeUnavailable as e:
                    lake_err = str(e)
                    cands = []
                cache[c] = cands
            for cand in cands[:25]:
                a = assess_candidate(cand, qi)
                if len(entry["lake_candidates"]) < lake_limit or not a["rejected"]:
                    entry["lake_candidates"].append({"qid": cand["qid"], "study_id": cand["study_id"], "text": cand["text"][:160], "class": a["class"],
                                                     "rejected": a["rejected"], "reason": a["reason"], "checks": a["checks"]})
        entry["lake_candidates"] = sorted(entry["lake_candidates"], key=lambda x: x["rejected"])[:lake_limit * 2]
        for comp in [c for c in emap.get("components", []) if c["question"] == q.id]:
            info = _component_info(comp, frame)
            a = assess_component(comp, qi, info)
            entry["components"].append({"spec": comp, "class": a["class"], "usable": a["usable"], "checks": a["checks"],
                                        "data": {k: v for k, v in info.items() if k not in ("model",)}, "_model": info.get("model")})
        usable = [c for c in entry["components"] if c["usable"]]
        if q.intent == "demographic" and q.profile_field:
            entry["mode"] = "PROFILE"
        elif entry["lab"] and entry["lab"]["tier"] is not None and entry["lab"]["tier"] <= 4 and not entry["lab"]["abstain"]:
            entry["mode"] = "A_EMPIRICAL"
        elif any(c["spec"]["relation"] in ("lower_bound", "lower_bound_union") and c["class"] == "DIRECT_EMPIRICAL" for c in usable):
            entry["mode"] = "C_EVIDENCE_CONSTRAINED"
        elif usable:
            entry["mode"] = "C_EVIDENCE_INFORMED"
        for comp in usable:
            t = comp["spec"]["target"]
            for o in (t.get("options") or ([t["option"]] if t.get("option") else [])):
                m = "C_EVIDENCE_CONSTRAINED" if comp["spec"]["relation"] != "proxy" and comp["class"] == "DIRECT_EMPIRICAL" else "C_EVIDENCE_INFORMED"
                if entry["option_modes"].get(o) != "C_EVIDENCE_CONSTRAINED":
                    entry["option_modes"][o] = m
        entry["brand_dependent"] = bool(qi["brand_specific"])
        plan["questions"][q.id] = entry
    plan["lake_error"] = lake_err
    from collections import Counter
    plan["summary"] = dict(Counter(e["mode"] for e in plan["questions"].values()))
    return plan


def serializable(plan: dict) -> dict:
    out = dict(plan)
    out["questions"] = {k: {**v, "components": [{kk: vv for kk, vv in c.items() if kk != "_model"} for c in v["components"]]} for k, v in plan["questions"].items()}
    return out


# ---------------------------------------------------------------- εκτέλεση: όρια και πλαίσιο ανά πρόσωπο
def group_context(comp: dict, prof: dict) -> str:
    from .bounds import AGE, EDU, SEX
    lines = []
    for ind, t in comp["data"]["indicators"].items():
        cells = t["cells"]
        age = "Y65_74" if prof.get("age_band") == "65+" else AGE.get(str(prof.get("age_band")))
        picks = [g for g in (age, SEX.get(str(prof.get("gender"))), EDU.get(str(prof.get("education")))) if g]
        vals = []
        for g in picks:
            c = cells.get(g) or {}
            if c.get("value") is not None:
                vals.append(f"{FAM_LABEL.get(g, g)} {c['value']:.0f}%{' (εκτίμηση μεταφοράς)' if c['source'] == 'transported' else ''}")
        unit = "των ατόμων" if t["unit"] == "PC_IND" else "των αγοραστών online"
        lines.append(f"Eurostat {t['year']}, Ελλάδα — {DESC.get(ind, ind)}: σύνολο {t['total']:.0f}% {unit}; " + "; ".join(vals))
    return "\n".join(lines)


def person_bound(comp: dict, prof: dict) -> float | None:
    from .bounds import person_rate
    m = comp.get("_model")
    if not m or not m.get("usable"):
        return None
    return person_rate(m, prof)
