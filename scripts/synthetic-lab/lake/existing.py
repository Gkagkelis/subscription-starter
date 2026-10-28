"""
Καταγραφή στο lake των συνόλων που το Synthetic Research Lab ήδη χρησιμοποιεί (κατάσταση INTEGRATED).

Τα δεδομένα τους ΔΕΝ αντιγράφονται/εξάγονται ξανά (ζουν στα αρχεία του engine)· καταγράφονται μεταδεδομένα, πλήθος
μεταβλητών και κύματα, ώστε ο κατάλογος και η αναφορά κάλυψης να είναι πλήρεις και να αποφεύγεται διπλή χρήση.
"""

import json
import os

from . import db
from .topics import classify, dedup_key, quality_score

DATA = os.path.join(db.REPO, "lib", "synthetic-lab", "data")
RESEARCH = os.path.join(db.REPO, ".synthetic-lab-data", "research")


def _load(path):
    try:
        with open(path, encoding="utf-8") as fh:
            return json.load(fh)
    except (OSError, ValueError):
        return None


def _metrics_years(metrics):
    ys = sorted({w["year"] for m in metrics for w in m.get("waves", []) if w.get("year")})
    return ys


def _register(con, sid, title, publisher, url, lic, open_, level, metrics, rep, n, target, desc, tier_note="", extra_years=None):
    ys = extra_years or _metrics_years(metrics)
    in_rng = [y for y in ys if 2012 <= y <= 2026]
    db.upsert_study(
        con, study_id=sid, source_id="lab_existing", external_id=sid.split(":", 1)[1], title=title, publisher=publisher, country="EL",
        collection_year_start=(in_rng or ys or [None])[0], collection_year_end=(in_rng or ys or [None])[-1], url=url, license=lic,
        license_open=open_, access_restrictions=tier_note or ("Ανοικτή" if open_ else "Μόνο για μη εμπορική έρευνα (τοπικά, εκτός repo)"),
        evidence_level=level, representativeness=rep, sample_size=n, target_population=target, description=desc,
        topics=classify(title, desc, " ".join(m.get("label", "") for m in metrics[:200])), dedup_key=dedup_key(title, None),
        quality_score=quality_score(level, n, rep, True, True, (2026 - ys[-1]) if ys else None),
        fieldwork_dates=f"{ys[0]}–{ys[-1]}" if ys else None,
    )
    con.execute("DELETE FROM variables WHERE study_id=?", (sid,))
    for m in metrics:
        con.execute("INSERT OR REPLACE INTO variables VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (f"{sid}::{m['metric']}", sid, None, m["metric"], m.get("label"), m.get("question") or m.get("label"),
                     json.dumps(m.get("answerOptions") or [], ensure_ascii=False), None, None, None, "engine_metric", "question",
                     json.dumps(classify(m.get("label", ""), m.get("semanticsNote", "")))))
    db.set_status(con, sid, "INTEGRATED", f"Ήδη ενσωματωμένο στο engine ({len(metrics)} δείκτες· κύματα {ys[0] if ys else '—'}–{ys[-1] if ys else '—'})")


def discover(con, limit=None):
    n = 0
    pri = _load(os.path.join(DATA, "noraya-priors.generated.json"))
    if pri:
        ms = list(pri["metrics"].values())
        _register(con, "lab:noraya-public-opinion", "NORAYA — δείκτες κοινής γνώμης (Eurobarometer) για την Ελλάδα", "NORAYA / Eurobarometer",
                  None, "Παράγωγα συγκεντρωτικά Eurobarometer (NORAYA)", 1, "B", ms, "national_probability", 1000, "Κάτοικοι 15+",
                  "Ποσοστά ανά ηλικία/φύλο/μόρφωση από επαναλαμβανόμενες ερωτήσεις Eurobarometer (2000–2025).")
        n += 1
    ict = _load(os.path.join(DATA, "official", "eurostat-ict.json"))
    if ict:
        _register(con, "lab:eurostat-isoc-ict", "Eurostat — Έρευνα ΤΠΕ νοικοκυριών (ΕΛΣΤΑΤ): online αγορές, πληρωμές", "Eurostat / ΕΛΣΤΑΤ",
                  "https://ec.europa.eu/eurostat", ict.get("license"), 1, "B", ict["metrics"], "official_statistics", None, ict.get("universe"), ict.get("source"))
        n += 1
    silc = _load(os.path.join(DATA, "official", "eurostat-silc.json"))
    if silc:
        _register(con, "lab:eurostat-silc", "Eurostat — EU-SILC υλική στέρηση και οικονομική δυσκολία (ΕΛΣΤΑΤ)", "Eurostat / ΕΛΣΤΑΤ",
                  "https://ec.europa.eu/eurostat", silc.get("license"), 1, "B", silc["metrics"], "official_statistics", None, silc.get("universe"), silc.get("source"))
        n += 1
    bcs = _load(os.path.join(DATA, "official", "ec-bcs-consumer-greece.json"))
    if bcs:
        inds = [{"metric": i["id"], "label": i.get("label"), "question": i.get("question")} for i in bcs["indicators"] if isinstance(i, dict) and i.get("id")]
        _register(con, "lab:ec-bcs-consumer", "DG ECFIN — Έρευνα Καταναλωτών Ελλάδας (ΙΟΒΕ), μηνιαία ισοζύγια", "Ευρωπαϊκή Επιτροπή / ΙΟΒΕ", bcs.get("url"),
                  bcs.get("license"), 1, "B", inds, "national_probability", 1500, "Καταναλωτές 16+", bcs.get("source"),
                  extra_years=list(range(1985, int(str(bcs.get("latestMonth", "2026"))[:4]) + 1)))
        n += 1
    cc = _load(os.path.join(DATA, "official", "consumer-context.json"))
    if cc:
        _register(con, "lab:ecb-ces", "ECB Consumer Expectations Survey — πλαίσιο Ελλάδας", "ECB", (cc.get("ces") or {}).get("url"), (cc.get("ces") or {}).get("license"),
                  1, "B", [], "national_probability", None, "Καταναλωτές", (cc.get("ces") or {}).get("source"), extra_years=[2024, 2025])
        hbs = cc.get("hbs") or {}
        _register(con, "lab:eurostat-hbs", "Eurostat — Έρευνα Οικογενειακών Προϋπολογισμών (δομή δαπάνης ανά πεμπτημόριο)", "Eurostat / ΕΛΣΤΑΤ", hbs.get("url"),
                  hbs.get("license"), 1, "B", [], "official_statistics", None, "Νοικοκυριά", hbs.get("source"), extra_years=[int(hbs.get("year") or 2020)])
        n += 2
    pop = _load(os.path.join(DATA, "official", "eurostat-population-2025.json"))
    if pop:
        _register(con, "lab:eurostat-population-2025", "Eurostat — Πληθυσμός 1/1/2025 ανά ηλικία, φύλο, περιφέρεια (ΕΛΣΤΑΤ)", "Eurostat / ΕΛΣΤΑΤ", pop.get("url"),
                  pop.get("license"), 1, "B", [], "official_statistics", None, "Συνολικός πληθυσμός", pop.get("source"), extra_years=[2025])
        n += 1
    edu = _load(os.path.join(DATA, "official", "eurostat-education-2025.json"))
    if edu:
        _register(con, "lab:eurostat-education-2025", "Eurostat — Μορφωτικό επίπεδο πληθυσμού 2025 (ΕΕΔ/ΕΛΣΤΑΤ)", "Eurostat / ΕΛΣΤΑΤ", None,
                  edu.get("license"), 1, "B", [], "official_statistics", None, "Πληθυσμός ιδιωτικών νοικοκυριών", edu.get("source"), extra_years=[2025])
        n += 1
    g = _load(os.path.join(DATA, "populations", "glopop-grc-2015-sample.json"))
    if g:
        s = g["summary"]
        _register(con, "lab:glopop-s-grc-2015", "GLOPOP-S — συνθετικός πληθυσμός βάσης Ελλάδας (2015)", "GLOPOP-S (Ton et al.)", None,
                  "CC BY 4.0", 1, "A", [], "synthetic_baseline", s.get("sampleSize"), "Συνολικός πληθυσμός (δείγμα)", "; ".join(s.get("qualityNotes", [])[:2]),
                  extra_years=[2015])
        n += 1
    dn = _load(os.path.join(RESEARCH, "dianeosis-tpe.json"))
    if dn:
        _register(con, "lab:dianeosis-tpe", "διαΝΕΟσις — «Τι πιστεύουν οι Έλληνες» (μικροδεδομένα, πολυκυματική)", "διαΝΕΟσις (Metron Analysis / MRB)",
                  "https://www.dianeosis.org/research/ti-pistevoun-oi-ellines/", dn.get("license"), 0, "A", dn["metrics"], "national_probability", 1300,
                  "Ενήλικες 17+", dn.get("source"), tier_note="Μόνο για μη εμπορική έρευνα (research_only, εκτός repo)")
        n += 1
    con.commit()
    return n


def run(con, max_tasks=None):
    return 0
