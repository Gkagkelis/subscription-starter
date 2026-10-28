"""
Κατάλογοι μεταδεδομένων ερευνών: CESSDA Data Catalogue, OpenAIRE Graph, Crossref (datasets).

Οι κατάλογοι δεν φιλοξενούν τα ίδια τα δεδομένα· καταγράφουν έρευνες (μεταδεδομένα, πρόσβαση, άδεια, DOI) ώστε:
- να τεκμηριώνεται η ύπαρξη/προέλευση κάθε ελληνικής έρευνας (επίπεδο D, ή C όταν υπάρχουν δημοσιευμένα αποτελέσματα),
- να σημειώνεται RESTRICTED όταν η πρόσβαση απαιτεί εγγραφή/συμφωνητικό (π.χ. GESIS, ESS microdata),
- να εντοπίζονται διπλότυπα μεταξύ αποθετηρίων (ίδιο DOI, ίδιο κύμα Eurobarometer, ίδιος τίτλος+έτος).
"""

import json
import re

from . import db, net
from .topics import classify, dedup_key, greece_relevant, license_open, quality_score, survey_relevant

CESSDA = "https://datacatalogue.cessda.eu/api/DataSets/v2/search"
OPENAIRE = "https://api.openaire.eu/graph/v1/researchProducts"
CROSSREF = "https://api.crossref.org/works"
MAILTO = "research-lab@example.org"


def _year(v):
    m = re.search(r"(19|20)\d{2}", str(v or ""))
    return int(m.group(0)) if m else None


def _find_dup(con, sid, doi, title, year):
    if doi:
        r = con.execute("SELECT study_id FROM studies WHERE lower(doi)=lower(?) AND study_id<>? AND duplicate_of IS NULL", (doi, sid)).fetchone()
        if r:
            return r["study_id"], "ίδιο DOI"
    m = re.search(r"eurobarometer\s+(\d{2,3})\.(\d)", title or "", re.I)
    if m:
        r = con.execute("SELECT study_id FROM studies WHERE source_id='eurobarometer' AND (external_id LIKE ? ESCAPE '\\' OR external_id LIKE ? ESCAPE '\\') LIMIT 1",
                        (f"%\\_{m.group(1)}\\_{m.group(2)}\\_%", f"%\\_{m.group(1)}\\_{m.group(2)}")).fetchone()
        if r:
            return r["study_id"], f"ίδιο κύμα Eurobarometer {m.group(1)}.{m.group(2)}"
    k = dedup_key(title, year)
    r = con.execute("SELECT study_id FROM studies WHERE dedup_key=? AND study_id<>? AND duplicate_of IS NULL AND source_id<>? LIMIT 1",
                    (k, sid, sid.split(":")[0])).fetchone()
    if r:
        return r["study_id"], "ίδιος τίτλος και έτος"
    return None, None


# ---------------- CESSDA ----------------
SAMPLING_PROB = re.compile(r"probability|random|stratified|multistage|systematic|total universe", re.I)


def _cessda_register(con, r):
    rid = r.get("id")
    title = r.get("titleStudy") or ""
    abstract = re.sub(r"<[^>]+>", " ", r.get("abstract") or "")
    countries = [c.get("abbr") or c.get("country") for c in r.get("studyAreaCountries") or []]
    y0 = _year(r.get("dataCollectionPeriodStartdate")) or _year(r.get("dataCollectionYear"))
    y1 = _year(r.get("dataCollectionPeriodEnddate")) or _year(r.get("dataCollectionYear")) or y0
    pub = (r.get("publisher") or {}).get("publisher")
    doi = None
    for p in r.get("pidStudies") or []:
        if (p.get("agency") or "").lower() == "doi" or "doi.org" in (p.get("pid") or ""):
            doi = re.sub(r"^https?://(dx\.)?doi\.org/", "", p.get("pid") or "")
            break
    access = r.get("dataAccess") or ""
    free = " ".join(r.get("dataAccessFreeTexts") or [])
    samp = " ".join(t.get("term", "") for t in r.get("typeOfSamplingProcedures") or [])
    modes = ", ".join(t.get("term", "") for t in r.get("typeOfModeOfCollections") or [])
    universe = (r.get("universe") or {}).get("inclusion") if isinstance(r.get("universe"), dict) else r.get("universe")
    kws = [k.get("term") for k in r.get("keywords") or [] if k.get("term")]
    cls = [c.get("term") for c in r.get("classifications") or [] if c.get("term")]
    sid = f"cessda:{rid}"
    multi = len(countries) > 1
    gr_only = countries == ["GR"] or countries == ["EL"] or (len(countries) == 1 and "Greece" in json.dumps(r.get("studyAreaCountries")))
    restricted = access.lower() != "open" or re.search(r"registration|register|contract|agreement|authori[sz]|only for|academic|scientific use", free, re.I)
    rep = "national_probability" if SAMPLING_PROB.search(samp) else ("non_probability" if samp else None)
    dup, why = _find_dup(con, sid, doi, title, y1)
    db.upsert_study(
        con, study_id=sid, source_id="cessda", external_id=rid, title=title, publisher=pub,
        authors="; ".join(c.get("name", "") for c in (r.get("creators") or [])[:5]) or None,
        country="EL" if gr_only else ("EL+" + str(len(countries) - 1) if multi else "EL"), collection_year_start=y0, collection_year_end=y1,
        publication_year=_year(r.get("publicationYear")), fieldwork_dates=r.get("dataCollectionPeriodStartdate"),
        target_population=(universe or "")[:500] or None, sampling_method=(samp + (f" | {modes}" if modes else ""))[:500] or None,
        representativeness=rep, geographic_coverage=("Ελλάδα" if gr_only else f"Πολυεθνική ({len(countries)} χώρες, περιλαμβάνει Ελλάδα)"),
        url=r.get("studyUrl"), doi=doi, license=(free[:500] or access) or None, license_open=0 if restricted else 1,
        access_restrictions=("Απαιτείται εγγραφή/συμφωνητικό χρήσης στο αρχείο δεδομένων: " + free[:300]) if restricted else "Ανοικτή πρόσβαση",
        evidence_level="D", topics=classify(title, abstract, " ".join(kws + cls)), dedup_key=dedup_key(title, y1), duplicate_of=dup,
        description=abstract[:4000], keywords=kws[:40], quality_score=quality_score("D", None, rep, False, False, (2026 - y1) if y1 else None),
        raw_meta={"studyNumber": r.get("studyNumber"), "dataAccess": access, "countries": countries, "studyXmlSourceUrl": r.get("studyXmlSourceUrl"),
                  "classifications": cls[:10]},
    )
    in_period = y1 is not None and 2012 <= y1 <= 2026
    if dup:
        db.set_status(con, sid, "VERIFIED", f"Διπλότυπο της {dup} ({why})")
    elif restricted:
        db.set_status(con, sid, "RESTRICTED", "Μεταδεδομένα επαληθευμένα· τα microdata απαιτούν εγγραφή/άδεια στο αρχείο (" + (pub or "") + ")"
                      + ("" if in_period else f" — εκτός περιόδου 2012–2026 ({y1})"))
    else:
        db.set_status(con, sid, "VERIFIED", "Μεταδεδομένα επαληθευμένα (CESSDA)· ανοικτή πρόσβαση μέσω του αρχείου" + ("" if in_period else f" — εκτός περιόδου ({y1})"))
    return 1


def discover_cessda(con):
    n = 0
    seen = set()
    for params in ({"studyAreaCountries": "Greece"}, {"q": "Greece"}, {"q": "Greek"}, {"q": "Ελλάδα"}):
        ck = f"cessda|{json.dumps(params)}"
        offset = db.checkpoint_get(con, ck, 0)
        while True:
            try:
                d = net.get_json(CESSDA, {**params, "metadataLanguage": "en", "limit": 200, "offset": offset})
            except (net.HttpError, ValueError) as e:
                db.log(con, "discover", f"CESSDA {params} offset {offset}: {e}", ok=False, source_id="cessda")
                break
            rs = d.get("Results") or []
            for r in rs:
                if r.get("id") in seen:
                    continue
                seen.add(r.get("id"))
                txt = json.dumps(r.get("studyAreaCountries") or [], ensure_ascii=False) + " " + (r.get("titleStudy") or "") + " " + (r.get("abstract") or "")[:3000]
                if "studyAreaCountries" not in params and not greece_relevant(txt):
                    continue
                n += _cessda_register(con, r)
            offset += len(rs)
            db.checkpoint_set(con, ck, offset)
            if len(rs) < 200:
                break
    db.log(con, "discover", f"CESSDA: {n} ελληνικές/πολυεθνικές έρευνες με Ελλάδα", source_id="cessda")
    con.commit()
    return n


# ---------------- OpenAIRE ----------------
OA_QUERIES = ["greece survey", "greek survey", "greece questionnaire", "greek respondents", "greece public opinion", "greek households",
              "greece consumers", "greek attitudes", "ελλάδα έρευνα", "ερωτηματολόγιο", "greek students survey", "greece panel data"]


def discover_openaire(con):
    n = 0
    for q in OA_QUERIES:
        for page in range(1, 11):
            ck = f"openaire|{q}|{page}"
            if db.checkpoint_get(con, ck):
                continue
            try:
                d = net.get_json(OPENAIRE, {"search": q, "type": "dataset", "pageSize": 100, "page": page})
            except (net.HttpError, ValueError) as e:
                db.log(con, "discover", f"OpenAIRE {q} p{page}: {e}", ok=False, source_id="openaire")
                break
            rs = d.get("results") or []
            for r in rs:
                title = r.get("mainTitle") or ""
                desc = " ".join(r.get("descriptions") or [])[:4000]
                subj = [((s.get("subject") or {}).get("value") if isinstance(s, dict) else str(s)) or "" for s in r.get("subjects") or []]
                if not (greece_relevant(title, desc, " ".join(subj)) and survey_relevant(title, desc, " ".join(subj))):
                    continue
                pids = r.get("pids") or [p for i in r.get("instances") or [] for p in i.get("pids") or []]
                doi = next((p["value"] for p in pids if p.get("scheme") == "doi"), None)
                lic = next((i.get("license") for i in r.get("instances") or [] if i.get("license")), None)
                url = next((u for i in r.get("instances") or [] for u in i.get("urls") or []), None)
                y = _year(r.get("publicationDate"))
                if y and y < 2012:
                    continue
                sid = f"openaire:{r.get('id')}"
                dup, why = _find_dup(con, sid, doi, title, y)
                acc = (r.get("bestAccessRight") or {}).get("label") if isinstance(r.get("bestAccessRight"), dict) else None
                db.upsert_study(
                    con, study_id=sid, source_id="openaire", external_id=r.get("id"), title=title,
                    publisher=r.get("publisher"), authors="; ".join(a.get("fullName", "") for a in (r.get("authors") or [])[:5]) or None,
                    country="EL", publication_year=y, url=url, doi=doi, license=lic, license_open=license_open(lic),
                    access_restrictions=acc, evidence_level="D", topics=classify(title, desc, " ".join(subj)),
                    dedup_key=dedup_key(title, y), duplicate_of=dup, description=desc, keywords=subj[:30],
                    quality_score=quality_score("D"), raw_meta={"instances": (r.get("instances") or [])[:5], "sources": r.get("sources")},
                )
                db.set_status(con, sid, "VERIFIED", f"Διπλότυπο της {dup} ({why})" if dup else
                              "Μεταδεδομένα επαληθευμένα (OpenAIRE)· τα αρχεία, όπου επιτρέπεται, συλλέγονται από το αποθετήριο προέλευσης")
                n += 1
            db.checkpoint_set(con, ck, len(rs))
            if len(rs) < 100:
                break
    con.commit()
    return n


# ---------------- Crossref (datasets) ----------------
CR_QUERIES = ["greece survey data", "greek survey dataset", "greece questionnaire data", "greek public opinion data", "greece household survey"]


def discover_crossref(con):
    n = 0
    for q in CR_QUERIES:
        cursor = db.checkpoint_get(con, f"crossref|{q}", "*")
        if cursor == "DONE":
            continue
        for _ in range(10):
            try:
                d = net.get_json(CROSSREF, {"query.bibliographic": q, "filter": "type:dataset,from-pub-date:2012", "rows": 100,
                                            "cursor": cursor, "mailto": MAILTO})["message"]
            except (net.HttpError, ValueError) as e:
                db.log(con, "discover", f"Crossref {q}: {e}", ok=False, source_id="crossref")
                break
            items = d.get("items") or []
            for it in items:
                title = " ".join(it.get("title") or [])
                desc = re.sub(r"<[^>]+>", " ", it.get("abstract") or "")
                subj = it.get("subject") or []
                if not (greece_relevant(title, desc) and survey_relevant(title, desc, " ".join(subj))):
                    continue
                doi = it.get("DOI")
                y = ((it.get("issued") or {}).get("date-parts") or [[None]])[0][0]
                lic = ((it.get("license") or [{}])[0]).get("URL")
                sid = f"crossref:{doi}"
                dup, why = _find_dup(con, sid, doi, title, y)
                db.upsert_study(
                    con, study_id=sid, source_id="crossref", external_id=doi, title=title, publisher=it.get("publisher"),
                    authors="; ".join(f"{a.get('given', '')} {a.get('family', '')}".strip() for a in (it.get("author") or [])[:5]) or None,
                    country="EL", publication_year=y, url=it.get("URL"), doi=doi, license=lic, license_open=license_open(lic),
                    evidence_level="D", topics=classify(title, desc), dedup_key=dedup_key(title, y), duplicate_of=dup, description=desc[:4000],
                    quality_score=quality_score("D"),
                )
                db.set_status(con, sid, "VERIFIED", f"Διπλότυπο της {dup} ({why})" if dup else "DOI επαληθευμένο (Crossref)")
                n += 1
            cursor = d.get("next-cursor")
            db.checkpoint_set(con, f"crossref|{q}", cursor or "DONE")
            if len(items) < 100 or not cursor:
                db.checkpoint_set(con, f"crossref|{q}", "DONE")
                break
    con.commit()
    return n


def discover(con, limit=None):
    n = discover_cessda(con)
    n += discover_openaire(con)
    n += discover_crossref(con)
    db.log(con, "discover", f"Κατάλογοι: {n} εγγραφές", source_id="catalogs")
    con.commit()
    return n


def run(con, max_tasks=None):
    """Οι κατάλογοι ολοκληρώνονται στη φάση discover (μεταδεδομένα)· επαναϋπολογισμός διπλοτύπων μετά τις άλλες πηγές."""
    n = 0
    for r in con.execute("SELECT study_id, doi, title, collection_year_end, publication_year FROM studies WHERE source_id IN ('cessda','openaire','crossref') AND duplicate_of IS NULL").fetchall():
        dup, why = _find_dup(con, r["study_id"], r["doi"], r["title"], r["collection_year_end"] or r["publication_year"])
        if dup:
            con.execute("UPDATE studies SET duplicate_of=? WHERE study_id=?", (dup, r["study_id"]))
            db.set_status(con, r["study_id"], "VERIFIED", f"Διπλότυπο της {dup} ({why})")
            n += 1
    con.commit()
    return n
