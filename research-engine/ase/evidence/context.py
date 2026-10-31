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
        rows = con.execute("select study_id,title,publisher,country,publication_year,collection_year_start,sample_size,target_population,url,doi,license,status,description "
                           "from studies where (title like ? or keywords like ? or description like ?) and status in ('INTEGRATED','VALIDATED','VERIFIED','PARSED') "
                           "and (country like 'EL%' or country is null) limit ?", (q, q, q, limit_per_term)).fetchall()
        for r in rows:
            if r[0] in seen:
                continue
            seen.add(r[0])
            out.append({"id": f"lake:{r[0]}", "kind": "internal_lake_study", "title": r[1], "publisher": r[2], "country": r[3], "date": str(r[4] or r[5] or ""),
                        "sample": r[6], "population": r[7], "url": r[8] or (f"https://doi.org/{r[9]}" if r[9] else None), "licence": r[10], "lake_status": r[11],
                        "excerpt": (r[12] or "")[:300], "matched_term": term})
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


def build_context(study_dir: Path, cfg: dict, questionnaire) -> dict:
    rc = cfg.get("research") or {}
    texts = [q.text for q in questionnaire.questions] + [(q.scenario or {}).get("text", "") for q in questionnaire.questions]
    concepts = extract_concepts(texts, rc.get("search_terms_el", []))
    lake, lake_note = search_lake(rc.get("search_terms_en", [])) if rc.get("use_lake", True) else ([], "Το lake απενεργοποιήθηκε στο config.")
    offi = official_items() if rc.get("use_official", True) else []
    cur_ok, cur_rej = curated_items(study_dir)
    web, web_note = web_research(rc, concepts)
    terms = rc.get("search_terms_en", []) + rc.get("search_terms_el", [])
    accepted, rejected = [], list(cur_rej)
    for it in lake + offi + cur_ok + web:
        s = _score(it, terms)
        it["relevance"] = s
        if not it.get("title"):
            rejected.append({**it, "rejected_reason": "Χωρίς τίτλο"})
        elif not (it.get("url") or it.get("path")):
            rejected.append({**it, "rejected_reason": "Χωρίς URL/διαδρομή — μη επαληθεύσιμη"})
        elif it["kind"] != "curated_source" and s < float(rc.get("min_relevance", 2)):
            rejected.append({**it, "rejected_reason": "Χαμηλή συνάφεια με τους όρους της μελέτης"})
        else:
            accepted.append(it)
    accepted.sort(key=lambda x: -x["relevance"])
    accepted = accepted[: int(rc.get("max_sources", 40))]
    qmap = {}
    for q in questionnaire.questions:
        qtext = _norm(q.text + " " + (q.scenario or {}).get("text", ""))
        qterms = [t for t in terms if _norm(t) in qtext] or terms
        ranked = sorted(accepted, key=lambda it: -(_score(it, qterms) + 0.1 * it["relevance"]))
        qmap[q.id] = [it["id"] for it in ranked[: int(rc.get("per_question", 3))] if _score(it, qterms) > 0]
    return {"built_at": now_iso(), "concepts": concepts, "search_terms": terms, "notes": {"lake": lake_note, "web": web_note},
            "accepted": accepted, "rejected": rejected, "question_map": qmap,
            "usage_policy": "Το πλαίσιο εμπλουτίζει τις συνθετικές απαντήσεις· δεν ορίζει επιθυμητά ποσοστά. Οι πηγές δεν είναι αποτελέσματα της μελέτης."}


def context_text(registry: dict, qid: str, max_items: int = 3) -> tuple[str, list]:
    ids = registry["question_map"].get(qid, [])[:max_items]
    by = {it["id"]: it for it in registry["accepted"]}
    lines = []
    for i in ids:
        it = by[i]
        lines.append(f"- [{i}] {it['title']} ({it.get('country') or '—'}, {it.get('date') or '—'}; πληθυσμός: {it.get('population') or '—'}; δείγμα: {it.get('sample') or '—'})")
    return ("\n".join(lines) if lines else "- Δεν βρέθηκε συναφής τεκμηρίωση για αυτή την ερώτηση."), ids
