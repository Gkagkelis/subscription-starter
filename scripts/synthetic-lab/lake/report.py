"""
Αναφορά κάλυψης (Deliverable I) — ΟΛΟΙ οι αριθμοί προκύπτουν από τη βάση του lake τη στιγμή της εκτέλεσης.

<LAKE>/reports/coverage_report.json   μηχαναγνώσιμη μορφή
<LAKE>/reports/coverage_report.md     ανθρώπινη μορφή (ελληνικά)
"""

import json
import os
from collections import Counter, defaultdict

from . import db
from .topics import TOPIC_LABELS

REPORTS = os.path.join(db.LAKE, "reports")
YEARS = list(range(2012, 2027))


def _q(con, sql, *a):
    return con.execute(sql, a).fetchall()


def build(con):
    R = {"generatedAt": db.now(), "lake": db.LAKE}
    R["sources"] = [dict(r) for r in _q(con, "SELECT source_id, name, kind, access, reachable, http_status, connector, notes FROM sources ORDER BY source_id")]
    R["studiesBySourceStatus"] = [dict(r) for r in _q(con, "SELECT source_id, status, COUNT(*) n FROM studies GROUP BY 1,2 ORDER BY 1,2")]
    st = Counter({r["status"]: r["n"] for r in _q(con, "SELECT status, COUNT(*) n FROM studies GROUP BY 1")})
    R["statusTotals"] = {s: st.get(s, 0) for s in db.STATUSES}
    R["studiesTotal"] = sum(st.values())
    R["duplicates"] = _q(con, "SELECT COUNT(*) n FROM studies WHERE duplicate_of IS NOT NULL")[0]["n"]
    R["byLevel"] = {r["evidence_level"] or "—": r["n"] for r in _q(con, "SELECT evidence_level, COUNT(*) n FROM studies GROUP BY 1")}
    R["usableByLevel"] = {r["evidence_level"] or "—": r["n"] for r in _q(
        con, "SELECT evidence_level, COUNT(*) n FROM studies WHERE status IN ('VALIDATED','INTEGRATED') AND duplicate_of IS NULL GROUP BY 1")}
    R["microdataStudies"] = _q(con, "SELECT COUNT(*) n FROM studies WHERE evidence_level='A' AND status IN ('PARSED','VALIDATED','INTEGRATED')")[0]["n"]
    R["aggregateStudies"] = _q(con, "SELECT COUNT(*) n FROM studies WHERE evidence_level='B' AND status IN ('PARSED','VALIDATED','INTEGRATED')")[0]["n"]
    R["files"] = {r["status"] or "—": r["n"] for r in _q(con, "SELECT status, COUNT(*) n FROM files GROUP BY 1")}
    R["filesBytes"] = _q(con, "SELECT COALESCE(SUM(size),0) b FROM files")[0]["b"]
    R["variablesTotal"] = _q(con, "SELECT COUNT(*) n FROM variables")[0]["n"]
    R["variablesBySource"] = {r["source_id"]: r["n"] for r in _q(con, "SELECT s.source_id, COUNT(*) n FROM variables v JOIN studies s USING(study_id) GROUP BY 1")}
    R["questionVariables"] = _q(con, "SELECT COUNT(*) n FROM variables WHERE role='question'")[0]["n"]
    R["distributionsTotal"] = _q(con, "SELECT COUNT(*) n FROM distributions")[0]["n"]
    R["distributionsByDim"] = {r["group_dim"]: r["n"] for r in _q(con, "SELECT group_dim, COUNT(*) n FROM distributions GROUP BY 1 ORDER BY 2 DESC")}
    R["aggCells"] = _q(con, "SELECT COUNT(*) n FROM agg_cells")[0]["n"]
    # ανά έτος: μελέτες με έτος συλλογής που καλύπτει το έτος + κατανομές με wave_year
    by_year = defaultdict(lambda: {"studies": 0, "usable": 0, "distributions": 0})
    for r in _q(con, "SELECT collection_year_start a, collection_year_end b, status, duplicate_of FROM studies WHERE collection_year_end IS NOT NULL"):
        a, b = r["a"] or r["b"], r["b"]
        for y in YEARS:
            if a <= y <= b:
                by_year[y]["studies"] += 1
                if r["status"] in ("VALIDATED", "INTEGRATED") and not r["duplicate_of"]:
                    by_year[y]["usable"] += 1
    for r in _q(con, "SELECT wave_year y, COUNT(*) n FROM distributions WHERE wave_year BETWEEN 2012 AND 2026 GROUP BY 1"):
        by_year[r["y"]]["distributions"] = r["n"]
    R["byYear"] = {y: by_year[y] for y in YEARS}
    # ανά θέμα
    topics = defaultdict(lambda: {"studies": 0, "usable": 0, "variables": 0})
    for r in _q(con, "SELECT topics, status, duplicate_of FROM studies"):
        for t in json.loads(r["topics"] or "[]") or ["other"]:
            topics[t]["studies"] += 1
            if r["status"] in ("VALIDATED", "INTEGRATED") and not r["duplicate_of"]:
                topics[t]["usable"] += 1
    for r in _q(con, "SELECT topics FROM variables WHERE topics IS NOT NULL"):
        try:
            for t in json.loads(r["topics"]) or []:
                topics[t]["variables"] += 1
        except ValueError:
            pass
    R["byTopic"] = {t: topics[t] for t in TOPIC_LABELS}
    R["restricted"] = [dict(r) for r in _q(con, "SELECT source_id, COUNT(*) n FROM studies WHERE status='RESTRICTED' GROUP BY 1 ORDER BY 2 DESC")]
    R["failed"] = [dict(r) for r in _q(con, "SELECT study_id, status_reason FROM studies WHERE status='FAILED' ORDER BY updated_at DESC LIMIT 50")]
    R["failedTotal"] = st.get("FAILED", 0)
    R["queue"] = [dict(r) for r in _q(con, "SELECT kind, state, COUNT(*) n FROM queue GROUP BY 1,2 ORDER BY 1,2")]
    R["events"] = {"ok": _q(con, "SELECT COUNT(*) n FROM events WHERE ok=1")[0]["n"], "errors": _q(con, "SELECT COUNT(*) n FROM events WHERE ok=0")[0]["n"]}
    idx = os.path.join(db.LAKE, "export", "lake_index.json")
    if os.path.exists(idx):
        with open(idx, encoding="utf-8") as fh:
            d = json.load(fh)
        R["export"] = {"generatedAt": d["generatedAt"], "studies": len(d["studies"]), "questions": len(d["questions"]),
                       "bySource": dict(Counter(s["source"] for s in d["studies"])), "byKind": dict(Counter(q["kind"] for q in d["questions"])),
                       "byTier": dict(Counter(s["tier"] for s in d["studies"]))}
    # κενά
    R["gaps"] = {
        "topicsWithoutUsable": [t for t in TOPIC_LABELS if t != "other" and R["byTopic"][t]["usable"] == 0],
        "topicsUnder5Usable": [t for t in TOPIC_LABELS if t != "other" and 0 < R["byTopic"][t]["usable"] < 5],
        "yearsUnder5Usable": [y for y in YEARS if R["byYear"][y]["usable"] < 5],
        "unreachableSources": [s["source_id"] for s in R["sources"] if s["reachable"] == 0],
        "registrationOnlySources": [s["source_id"] for s in R["sources"] if s["access"] in ("registration", "token_api", "no_public_json_api")],
    }
    return R


def _md(R):
    L = [f"# Greek Research Data Lake — Αναφορά κάλυψης", "", f"Δημιουργήθηκε: {R['generatedAt']} · όλοι οι αριθμοί από τη βάση `{R['lake']}/lake.sqlite`.", ""]
    L += ["## Σύνοψη", "", "| Μέγεθος | Τιμή |", "|---|---|"]
    L += [f"| Πηγές στο registry | {len(R['sources'])} (προσβάσιμες: {sum(1 for s in R['sources'] if s['reachable'] == 1)}) |",
          f"| Έρευνες/σύνολα που καταγράφηκαν | {R['studiesTotal']} |",
          f"| — εκ των οποίων διπλότυπα (ίδιο δείγμα σε άλλο αποθετήριο) | {R['duplicates']} |"]
    for s in db.STATUSES:
        L.append(f"| {s} | {R['statusTotals'][s]} |")
    L += [f"| Μελέτες με μικροδεδομένα (επίπεδο A, αναλυμένα) | {R['microdataStudies']} |",
          f"| Μελέτες με λεπτομερή aggregates (επίπεδο B) | {R['aggregateStudies']} |",
          f"| Αρχεία (κατεβασμένα) | {sum(R['files'].values())} ({R['filesBytes'] / 1e6:.0f} MB) |",
          f"| Μεταβλητές / δείκτες | {R['variablesTotal']} (ερωτήσεις ερευνών: {R['questionVariables']}) |",
          f"| Εμπειρικές κατανομές (κελιά επιλογή×ομάδα×κύμα) | {R['distributionsTotal']} |",
          f"| Πρωτογενή κελιά aggregates (Eurostat) | {R['aggCells']} |"]
    if "export" in R:
        e = R["export"]
        L.append(f"| Εξαγωγή στο simulation engine | {e['studies']} μελέτες, {e['questions']} ερωτήσεις/δείκτες ({e['byKind']}) |")
    L += ["", "## Ανά πηγή και κατάσταση", "", "| Πηγή | Κατάσταση | Πλήθος |", "|---|---|---|"]
    L += [f"| {r['source_id']} | {r['status']} | {r['n']} |" for r in R["studiesBySourceStatus"]]
    L += ["", "## Επίπεδο τεκμηρίωσης", "", "| Επίπεδο | Όλες | Αξιοποιήσιμες (VALIDATED/INTEGRATED, μη διπλότυπες) |", "|---|---|---|"]
    for k in ("A", "B", "C", "D"):
        L.append(f"| {k} — {db.LEVELS[k]} | {R['byLevel'].get(k, 0)} | {R['usableByLevel'].get(k, 0)} |")
    L += ["", "## Ανά έτος (2012–2026)", "", "| Έτος | Έρευνες που καλύπτουν το έτος | Αξιοποιήσιμες | Κατανομές (κελιά) |", "|---|---|---|---|"]
    L += [f"| {y} | {v['studies']} | {v['usable']} | {v['distributions']} |" for y, v in R["byYear"].items()]
    L += ["", "## Ανά θεματική περιοχή", "", "| Θέμα | Έρευνες | Αξιοποιήσιμες | Μεταβλητές |", "|---|---|---|---|"]
    L += [f"| {TOPIC_LABELS[t]} | {v['studies']} | {v['usable']} | {v['variables']} |" for t, v in R["byTopic"].items()]
    L += ["", "## Διασπάσεις (ομάδες) στις κατανομές", "", "| Διάσταση | Κελιά |", "|---|---|"]
    L += [f"| {k} | {v} |" for k, v in R["distributionsByDim"].items()]
    L += ["", "## Πηγές (registry)", "", "| Πηγή | Πρόσβαση | HTTP | Connector | Σημειώσεις |", "|---|---|---|---|---|"]
    L += [f"| {s['name']} | {s['access']} | {s['http_status'] or '—'} | {s['connector'] or '—'} | {(s['notes'] or '').replace('|', '/')} |" for s in R["sources"]]
    L += ["", "## Περιορισμένης πρόσβασης (RESTRICTED)", ""]
    L += [f"- {r['source_id']}: {r['n']}" for r in R["restricted"]] or ["- —"]
    L += ["", f"## Αποτυχίες (FAILED: {R['failedTotal']}, τελευταίες 50)", ""]
    L += [f"- `{r['study_id']}` — {r['status_reason']}" for r in R["failed"]] or ["- —"]
    L += ["", "## Ουρά εργασιών", "", "| Είδος | Κατάσταση | Πλήθος |", "|---|---|---|"]
    L += [f"| {r['kind']} | {r['state']} | {r['n']} |" for r in R["queue"]]
    g = R["gaps"]
    L += ["", "## Κενά", "",
          f"- Θέματα χωρίς αξιοποιήσιμη έρευνα: {', '.join(TOPIC_LABELS[t] for t in g['topicsWithoutUsable']) or '—'}",
          f"- Θέματα με <5 αξιοποιήσιμες: {', '.join(TOPIC_LABELS[t] for t in g['topicsUnder5Usable']) or '—'}",
          f"- Έτη με <5 αξιοποιήσιμες: {', '.join(map(str, g['yearsUnder5Usable'])) or '—'}",
          f"- Μη προσβάσιμες πηγές: {', '.join(g['unreachableSources']) or '—'}",
          f"- Πηγές μόνο με εγγραφή/token (δεν αυτοματοποιούνται): {', '.join(g['registrationOnlySources']) or '—'}", ""]
    return "\n".join(L)


def run(con):
    os.makedirs(REPORTS, exist_ok=True)
    R = build(con)
    with open(os.path.join(REPORTS, "coverage_report.json"), "w", encoding="utf-8") as fh:
        json.dump(R, fh, ensure_ascii=False, indent=1, default=str)
    with open(os.path.join(REPORTS, "coverage_report.md"), "w", encoding="utf-8") as fh:
        fh.write(_md(R))
    print(f"✓ report → {REPORTS}/coverage_report.md")
    return R
