"""Research Context Builder (ASE).

Χτίζει ΜΙΑ φορά ανά μελέτη ένα κοινό, τεκμηριωμένο ερευνητικό πλαίσιο (όχι μία αναζήτηση ανά ερωτώμενο):
  1. Έννοιες: όροι αναζήτησης από το config (research.search_terms) + συχνές λέξεις του ερωτηματολογίου.
  2. Εσωτερική βάση: κατάλογος μελετών του data lake (.synthetic-lab-data/lake/lake.sqlite, μόνο ανάγνωση) — τίτλος, χώρα,
     έτος, δείγμα, πληθυσμός, URL, άδεια ΟΠΩΣ είναι καταχωρημένα· επίσημα σύνολα του Lab (lib/synthetic-lab/data/official).
  3. Επιμελημένες πηγές του ερευνητή (studies/<id>/sources.yaml): γίνονται δεκτές μόνο με πλήρη μεταδεδομένα.
  4. Web research: μόνο αν είναι ρητά ενεργοποιημένο ΚΑΙ διαθέσιμος ο πάροχος· αλλιώς καταγράφεται «δεν χρησιμοποιήθηκαν
     νέες εξωτερικές πηγές». Καταγράφονται μόνο URL που επέστρεψε το εργαλείο αναζήτησης — καμία επινοημένη παραπομπή.
  5. Απόρριψη άσχετων / ελλιπών πηγών με αιτιολογία· αντιστοίχιση πηγών ανά ερώτηση.
Η εξωτερική γνώση εμπλουτίζει το πλαίσιο· δεν ορίζει επιθυμητά αποτελέσματα.
"""
from __future__ import annotations

import json
import re
import sqlite3
from collections import Counter
from pathlib import Path

from ..paths import DATA_ROOT, OFFICIAL_TS
from ..util import load_structured, now_iso

STOP = set("και ή να το τη την της του των τα οι ο η σε με για από που πως πόσο πόσα ποια ποιο ποιες είναι ήταν θα δεν μη αν ως στο στη στην στον στα στις στους "
           "σας σε έναν ένα μια μία ότι αυτό αυτή αυτά έχετε έχει εσείς σας μας τι κάθε πιο λιγότερο περισσότερο όσο ακόμη".split())
REQUIRED_CURATED = ["title", "url", "date", "country", "population", "sample", "limitations"]


def _norm(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", (s or "").lower())
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def extract_concepts(texts: list[str], extra: list[str], top: int = 25) -> list[str]:
    words = Counter()
    for t in texts:
        for w in re.findall(r"[a-zα-ωάέήίόύώϊϋΐΰ]{5,}", t.lower()):
            if w not in STOP:
                words[w] += 1
    return list(dict.fromkeys([*(x.lower() for x in extra), *[w for w, _ in words.most_common(top)]]))


def search_lake(terms_en: list[str], limit_per_term: int = 8, db: Path | None = None) -> tuple[list, str]:
    db = db or DATA_ROOT / "lake" / "lake.sqlite"
    if not db.exists():
        return [], "Το data lake δεν είναι διαθέσιμο σε αυτό το περιβάλλον."
    con = sqlite3.connect(f"file:{db}?mode=ro", uri=True)
    seen, out = set(), []
    for term in terms_en:
        q = f"%{term}%"
        rows = con.execute("select study_id,title,publisher,country,publication_year,collection_year_start,sample_size,target_population,url,doi,license,status,description,keywords "
                           "from studies where (title like ? or keywords like ? or description like ?) and status in ('INTEGRATED','VALIDATED','VERIFIED','PARSED') "
                           "and (country like 'EL%' or country is null) limit ?", (q, q, q, limit_per_term)).fetchall()
        for r in rows:
            if r[0] in seen:
                continue
            seen.add(r[0])
            out.append({"id": f"lake:{r[0]}", "kind": "internal_lake_study", "title": r[1], "publisher": r[2], "country": r[3], "date": str(r[5] or r[4] or ""),
                        "data_year": r[5], "sample": r[6], "population": r[7], "url": r[8] or (f"https://doi.org/{r[9]}" if r[9] else None), "licence": r[10],
                        "lake_status": r[11], "excerpt": (r[12] or "")[:300], "keywords": r[13] or "", "matched_term": term})
    con.close()
    return out, "ok"


def official_items() -> list:
    out = []
    for p in sorted(OFFICIAL_TS.glob("*.json")):
        try:
            d = json.loads(p.read_text(encoding="utf-8"))
        except Exception:
            continue
        out.append({"id": f"official:{p.stem}", "kind": "official_statistics", "title": d.get("source") or d.get("datasetId") or p.stem,
                    "country": "GR", "date": str(d.get("year") or d.get("referenceDate") or ""), "population": d.get("note") or "Πληθυσμός Ελλάδας",
                    "sample": None, "url": (d.get("url") or (d.get("urls") or [None])[0]), "licence": d.get("license"), "path": str(p.relative_to(OFFICIAL_TS.parents[3])),
                    "excerpt": (d.get("note") or "")[:300]})
    return out


def curated_items(study_dir: Path) -> tuple[list, list]:
    p = study_dir / "sources.yaml"
    if not p.exists():
        return [], []
    ok, rej = [], []
    for i, s in enumerate(load_structured(p).get("sources") or []):
        miss = [k for k in REQUIRED_CURATED if not s.get(k)]
        item = {"id": s.get("id", f"curated:{i + 1}"), "kind": "curated_source", **s}
        if miss:
            rej.append({**item, "rejected_reason": f"Ελλιπή μεταδεδομένα: {', '.join(miss)}"})
        elif not str(s["url"]).startswith(("http://", "https://")):
            rej.append({**item, "rejected_reason": "Μη επαληθεύσιμο URL"})
        else:
            ok.append(item)
    return ok, rej


def web_research(cfg: dict, concepts: list[str]) -> tuple[list, str]:
    """Αναζήτηση μέσω του web_search εργαλείου του Claude (όταν είναι ενεργοποιημένη και υπάρχουν SDK/credentials)."""
    w = cfg.get("web", {}) or {}
    if not w.get("enabled"):
        return [], "Web research απενεργοποιημένο στο config· δεν χρησιμοποιήθηκαν νέες εξωτερικές πηγές."
    try:
        import anthropic
        client = anthropic.Anthropic()
    except Exception as e:
        return [], f"Web research μη διαθέσιμο ({e.__class__.__name__}): δεν χρησιμοποιήθηκαν νέες εξωτερικές πηγές."
    query = w.get("query") or "Δημοσιευμένες έρευνες και επίσημα στατιστικά για: " + ", ".join(concepts[:12])
    try:
        r = client.messages.create(model=w.get("model", "claude-opus-5-5"), max_tokens=4000, tools=[{"type": "web_search_20260209", "name": "web_search", "max_uses": int(w.get("max_uses", 5))}],
                                   messages=[{"role": "user", "content": query + "\nΠροτίμησε επίσημες στατιστικές υπηρεσίες, επιστημονικές δημοσιεύσεις και έρευνες με μεθοδολογία."}])
    except Exception as e:
        return [], f"Αποτυχία web research ({e.__class__.__name__}): δεν χρησιμοποιήθηκαν νέες εξωτερικές πηγές."
    out = []
    for b in r.content:
        if getattr(b, "type", "") == "web_search_tool_result" and isinstance(b.content, list):
            for x in b.content:
                out.append({"id": f"web:{len(out) + 1}", "kind": "web_search_result", "title": getattr(x, "title", None), "url": getattr(x, "url", None),
                            "date": getattr(x, "page_age", None), "country": None, "population": None, "sample": None,
                            "limitations": "Μεταδεδομένα από αποτέλεσμα αναζήτησης· απαιτείται έλεγχος πριν από ερευνητική χρήση."})
    return out, f"Web research: {len(out)} αποτελέσματα από web_search ({w.get('model', 'claude-opus-5-5')})."


def _score(item: dict, terms: list[str]) -> float:
    """Πλήθος ΔΙΑΦΟΡΕΤΙΚΩΝ όρων της μελέτης που εμφανίζονται στον τίτλο/περιγραφή της πηγής."""
    blob = _norm(" ".join(str(item.get(k) or "") for k in ("title", "excerpt", "population")))
    return float(len({_norm(t) for t in terms if _norm(t) in blob}))


# ---------------------------------------------------------------- κανόνες συνάφειας (v2)
# Γενικές λέξεις που ΔΕΝ αρκούν για συνάφεια (εμφανίζονται σε σχεδόν κάθε καταναλωτική πηγή).
GENERIC = {"consumer", "consumers", "καταναλωτης", "καταναλωτες", "survey", "ερευνα", "attitudes", "greece", "ελλαδα", "eu", "europe", "market", "retail"}
# Πηγή ΜΕ ερωτώμενους επιχειρήσεις (π.χ. «Retailers' attitudes», «Business attitudes»), όχι πηγή ΓΙΑ επιχειρήσεις (π.χ. «trust in retailers»).
BUSINESS_TITLE = re.compile(r"\b(business(es)?|retailers?|enterprises?|compan(y|ies)|firms?|smes?|traders?)\W{0,2}\s*(attitudes?|views|survey|perceptions?|opinions?|panel)\b")
BUSINESS_POP = re.compile(r"\b(business(es)?|retailers?|enterprises?|compan(y|ies)|firms?|b2b|smes?|traders?)\b|επιχειρησ|εμπορ(ων|οι|ους)\b")
CURRENT_YEAR = int(now_iso()[:4])


def study_concepts(rc: dict) -> dict:
    """Θεματικές έννοιες της μελέτης {έννοια: [όροι]}. Χωρίς research.concepts: κάθε μη γενικός όρος αναζήτησης γίνεται έννοια."""
    if rc.get("concepts"):
        return {k: [t for t in v] for k, v in rc["concepts"].items()}
    terms = rc.get("search_terms_en", []) + rc.get("search_terms_el", [])
    return {t: [t] for t in terms if _norm(t) not in GENERIC}


def _concepts_in(text: str, concepts: dict) -> set:
    t = _norm(text)
    return {c for c, terms in concepts.items() if any(_norm(x) in t for x in terms if _norm(x) not in GENERIC)}


def _year(item: dict):
    for k in ("data_year", "date"):
        m = re.search(r"(19|20)\d{2}", str(item.get(k) or ""))
        if m:
            return int(m.group(0))
    return None


def assess(item: dict, concepts: dict, rc: dict) -> tuple[bool, str, dict]:
    """Απόφαση συνάφειας με αιτιολογία. Μια πηγή γίνεται δεκτή μόνο αν αφορά καταναλωτές, είναι αρκετά πρόσφατη, δεν είναι
    εκτός θέματος και ταιριάζει σε θεματική έννοια της μελέτης ΣΤΟΝ ΤΙΤΛΟ ή στις λέξεις-κλειδιά (όχι μόνο σε περίληψη)."""
    title = str(item.get("title") or "")
    strong = " ".join([title, str(item.get("title_en") or ""), " ".join(item["keywords"]) if isinstance(item.get("keywords"), list) else str(item.get("keywords") or "")])
    weak = " ".join(str(item.get(k) or "") for k in ("excerpt", "supports", "population"))
    info = {"year": _year(item)}
    if not title:
        return False, "Χωρίς τίτλο", info
    if not (item.get("url") or item.get("path")):
        return False, "Χωρίς URL/διαδρομή — μη επαληθεύσιμη", info
    if not rc.get("allow_business_sources") and (BUSINESS_TITLE.search(_norm(title)) or BUSINESS_POP.search(_norm(str(item.get("population") or "")))):
        return False, "Πληθυσμός επιχειρήσεων/εμπόρων, όχι καταναλωτών", info
    off = [t for t in rc.get("off_topic_terms", []) if _norm(t) in _norm(strong)]
    if off:
        return False, f"Εκτός θέματος της μελέτης ({', '.join(off)})", info
    y, max_age = info["year"], int(rc.get("max_age_years", 8))
    if item.get("evidence_type") != "legal_framework":
        if y is None and item.get("kind") != "curated_source":
            return False, "Άγνωστο έτος δεδομένων", info
        if y is not None and CURRENT_YEAR - y > max_age:
            return False, f"Παλαιά δεδομένα ({y}· όριο {max_age} έτη)", info
    declared = set(item.get("concepts") or []) & set(concepts) if item.get("kind") == "curated_source" else set()
    in_strong = _concepts_in(strong, concepts) | declared
    info.update(matched_concepts=sorted(in_strong | _concepts_in(weak, concepts)), strong_concepts=sorted(in_strong))
    if not in_strong:
        return False, "Καμία θεματική έννοια της μελέτης στον τίτλο/λέξεις-κλειδιά (γενικοί όροι δεν αρκούν)", info
    dom = rc.get("domain_terms") or []
    topic_text = strong + " " + str(item.get("excerpt") or "") + " " + str(item.get("supports") or "")   # όχι μεταδεδομένα πληθυσμού/μεθόδου
    if dom and not any(_norm(d) in _norm(topic_text) for d in dom):
        return False, "Η λέξη-έννοια εμφανίζεται, αλλά η πηγή δεν αφορά το πεδίο της μελέτης (π.χ. άλλο κλάδο/θέμα)", info
    return True, "", info


def build_context(study_dir: Path, cfg: dict, questionnaire) -> dict:
    rc = cfg.get("research") or {}
    texts = [q.text for q in questionnaire.questions] + [(q.scenario or {}).get("text", "") for q in questionnaire.questions]
    concepts = extract_concepts(texts, rc.get("search_terms_el", []))
    lake, lake_note = search_lake(rc.get("search_terms_en", [])) if rc.get("use_lake", True) else ([], "Το lake απενεργοποιήθηκε στο config.")
    offi = official_items() if rc.get("use_official", True) else []
    cur_ok, cur_rej = curated_items(study_dir)
    web, web_note = web_research(rc, concepts)
    terms = rc.get("search_terms_en", []) + rc.get("search_terms_el", [])
    sc = study_concepts(rc)
    accepted, rejected = [], list(cur_rej)
    for it in lake + offi + cur_ok + web:
        ok, why, info = assess(it, sc, rc)
        it.update(info)
        it["relevance"] = len(info.get("strong_concepts", [])) + 0.5 * len(info.get("matched_concepts", []))
        (accepted if ok else rejected).append(it if ok else {**it, "rejected_reason": why})
    gr_first = lambda it: (0 if str(it.get("country") or "").upper() in ("GR", "EL") else 1, -(it.get("year") or 0), -it["relevance"])  # noqa: E731
    accepted.sort(key=gr_first)
    accepted = accepted[: int(rc.get("max_sources", 40))]
    qmap, qconc = {}, {}
    for q in questionnaire.questions:
        qc = _concepts_in(" ".join([q.text, (q.scenario or {}).get("text", ""), " ".join(o.label for o in q.options)]), sc)
        qconc[q.id] = sorted(qc)
        match = [it for it in accepted if qc & set(it.get("matched_concepts", []))]           # ΚΑΜΙΑ εναλλακτική «όλοι οι όροι»
        qmap[q.id] = [it["id"] for it in sorted(match, key=gr_first)[: int(rc.get("per_question", 3))]]
    return {"built_at": now_iso(), "relevance_rules": "v2", "concepts": concepts, "study_concepts": sc, "search_terms": terms,
            "notes": {"lake": lake_note, "web": web_note}, "accepted": accepted, "rejected": rejected, "question_map": qmap, "question_concepts": qconc,
            "usage_policy": "Το πλαίσιο είναι υπόβαθρο για τις συνθετικές απαντήσεις· δεν ορίζει επιθυμητά ποσοστά και δεν μετατρέπεται σε πιθανότητες "
                            "επιλογής. Οι πηγές δεν είναι αποτελέσματα της μελέτης. Ερωτήσεις χωρίς συναφή πηγή μένουν χωρίς τεκμηρίωση (καταγράφεται στο audit)."}


def context_text(registry: dict, qid: str, max_items: int = 3) -> tuple[str, list]:
    ids = registry["question_map"].get(qid, [])[:max_items]
    by = {it["id"]: it for it in registry["accepted"]}
    lines = []
    for i in ids:
        it = by[i]
        sup = f" — αφορά: {it['supports']}" if it.get("supports") else ""
        lines.append(f"- [{i}] {it['title']} ({it.get('country') or '—'}, {it.get('date') or '—'}; πληθυσμός: {it.get('population') or '—'}; δείγμα: {it.get('sample') or '—'}){sup}")
    if lines:
        lines.append("  (Υπόβαθρο μόνο: μην μετατρέπεις στατιστικά των πηγών σε πιθανότητες απάντησης του προσώπου.)")
    return ("\n".join(lines) if lines else "- Δεν βρέθηκε συναφής τεκμηρίωση για αυτή την ερώτηση."), ids
