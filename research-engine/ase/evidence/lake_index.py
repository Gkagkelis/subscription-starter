"""Ενιαίο ευρετήριο του ελληνικού data lake για το inference (όχι μόνο κατάλογος).

Πηγές (μόνο ανάγνωση): lake/export/survey_question_bank.csv (ερωτήσεις/μεταβλητές ~80.000), lake/export/
empirical_distribution_bank.csv.gz (~3,5 εκατ. τιμές ελληνικών κατανομών ανά ομάδα), lake/lake.sqlite (μεταδεδομένα μελετών).
Έξοδος: .synthetic-lab-data/ase/lake_index.sqlite με
  questions(qid, study_id, code, kind, text, options, years, topics) + FTS5 σε κανονικοποιημένο κείμενο (χωρίς τόνους)
  vals(study_id, code, wave_year, group_dim, group_value, option_label, value, unit, flag)  — ροή, χωρίς φόρτωση στη μνήμη
  studies(study_id, title, publisher, country, year, population, url, licence)
  meta(fingerprint)  — αλλαγή των πηγαίων αρχείων ⇒ αυτόματη αναδημιουργία (ακύρωση cache)
Ανάκτηση: κατά ΕΝΝΟΙΑ (οντολογία) με όρους ελληνικά/αγγλικά· η σημασιολογική/λεξική ομοιότητα δίνει μόνο ΥΠΟΨΗΦΙΟΥΣ.
Αποτυχία πρόσβασης ≠ «δεν υπάρχει τεκμήριο»: LakeUnavailable."""
from __future__ import annotations

import csv
import gzip
import sqlite3
from pathlib import Path

from ..paths import ASE_DATA, DATA_ROOT
from .interpret import constructs_in, norm, ontology

QB = DATA_ROOT / "lake" / "export" / "survey_question_bank.csv"
DB = DATA_ROOT / "lake" / "export" / "empirical_distribution_bank.csv.gz"
LAKE = DATA_ROOT / "lake" / "lake.sqlite"
INDEX = ASE_DATA / "lake_index.sqlite"


class LakeUnavailable(RuntimeError):
    pass


def fingerprint() -> str:
    parts = []
    for p in (QB, DB):
        if not p.exists():
            raise LakeUnavailable(f"λείπει {p}")
        st = p.stat()
        parts.append(f"{p.name}:{st.st_size}:{int(st.st_mtime)}")
    return "|".join(parts)


def build(force: bool = False) -> Path:
    fp = fingerprint()
    if INDEX.exists() and not force:
        try:
            con = sqlite3.connect(INDEX)
            if con.execute("select v from meta where k='fingerprint'").fetchone()[0] == fp:
                return INDEX
        except Exception:  # noqa: BLE001 — κατεστραμμένο/παλαιό ευρετήριο → αναδημιουργία
            pass
    tmp = INDEX.with_suffix(".building")
    tmp.unlink(missing_ok=True)
    INDEX.parent.mkdir(parents=True, exist_ok=True)
    con = sqlite3.connect(tmp)
    con.executescript("""
      create table questions(qid text primary key, study_id text, code text, kind text, text text, options text, years text, topics text);
      create virtual table qfts using fts5(qid unindexed, body, tokenize='unicode61');
      create table vals(study_id text, code text, wave_year text, group_dim text, group_value text, option_label text, value real, unit text, flag text);
      create table studies(study_id text primary key, title text, publisher text, country text, year text, population text, url text, licence text);
      create table meta(k text primary key, v text);""")
    csv.field_size_limit(10 ** 8)
    with open(QB, encoding="utf-8-sig") as f:
        rows = []
        for x in csv.DictReader(f):
            rows.append((x["question_id"], x["study_id"], x["code"], x["kind"], x["text"], x["options"], x["years"], x["topics"]))
        con.executemany("insert or ignore into questions values (?,?,?,?,?,?,?,?)", rows)
        con.executemany("insert into qfts values (?,?)", [(r[0], norm(r[4] + " " + r[5])) for r in rows])
    with gzip.open(DB, "rt", encoding="utf-8") as f:
        batch = []
        for x in csv.DictReader(f):
            code = x["var_id"].split("::")[-1].split(":")[-1]
            batch.append((x["study_id"], code, x["wave_year"], x["group_dim"], x["group_value"], x["option_label"], float(x["value"] or "nan"), x["unit"], x["flag"]))
            if len(batch) >= 200_000:
                con.executemany("insert into vals values (?,?,?,?,?,?,?,?,?)", batch)
                batch = []
        if batch:
            con.executemany("insert into vals values (?,?,?,?,?,?,?,?,?)", batch)
    con.execute("create index vals_q on vals(study_id, code)")
    if LAKE.exists():
        src = sqlite3.connect(f"file:{LAKE}?mode=ro", uri=True)
        ids = [r[0] for r in con.execute("select distinct study_id from questions")]
        for i in range(0, len(ids), 500):
            chunk = ids[i:i + 500]
            q = "select study_id,title,publisher,country,coalesce(collection_year_start,publication_year),target_population,url,license from studies where study_id in (%s)" % ",".join("?" * len(chunk))
            con.executemany("insert or ignore into studies values (?,?,?,?,?,?,?,?)", src.execute(q, chunk).fetchall())
    con.execute("insert into meta values ('fingerprint', ?)", (fp,))
    con.commit()
    con.close()
    tmp.replace(INDEX)
    return INDEX


def _con() -> sqlite3.Connection:
    try:
        build()
        return sqlite3.connect(f"file:{INDEX}?mode=ro", uri=True)
    except LakeUnavailable:
        raise
    except Exception as e:  # noqa: BLE001
        raise LakeUnavailable(f"ευρετήριο lake: {e}") from e


def _fts_query(terms: list[str]) -> str:
    toks = set()
    for t in terms:
        for w in norm(t).split():
            w = "".join(ch for ch in w if ch.isalnum())
            if len(w) >= 3:
                toks.add(f'"{w}"*')
    return " OR ".join(sorted(toks))


def candidates(construct: str, limit: int = 60) -> list[dict]:
    """Υποψήφιες ερωτήσεις/μεταβλητές του lake για μια έννοια (λεξική ανάκτηση με όρους όλων των πτυχών)."""
    onto = ontology()
    terms = [t for f in onto["constructs"][construct]["facets"].values() for t in f]
    con = _con()
    q = _fts_query(terms)
    rows = con.execute("select q.qid,q.study_id,q.code,q.kind,q.text,q.options,q.years,q.topics,s.title,s.country,s.year,s.population,s.url,s.licence "
                       "from qfts f join questions q on q.qid=f.qid left join studies s on s.study_id=q.study_id where qfts match ? order by rank limit ?",
                       (q, limit * 4)).fetchall()
    out = []
    for r in rows:
        text = f"{r[4]} {r[5]}"
        cs = constructs_in(text, onto)
        out.append({"qid": r[0], "study_id": r[1], "code": r[2], "kind": r[3], "text": r[4], "options": r[5], "years": r[6], "topics": r[7],
                    "study_title": r[8], "country": r[9], "study_year": r[10], "population": r[11], "url": r[12], "licence": r[13],
                    "constructs": sorted(cs)})
    return out[:limit * 4]


def values(study_id: str, code: str) -> list[dict]:
    con = _con()
    rows = con.execute("select wave_year,group_dim,group_value,option_label,value,unit,flag from vals where study_id=? and code=?", (study_id, code)).fetchall()
    return [{"year": r[0], "group_dim": r[1], "group_value": r[2], "option": r[3], "value": r[4], "unit": r[5], "flag": r[6]} for r in rows]


def find_by_text(study_id: str, needle: str) -> list[dict]:
    con = _con()
    return [{"qid": r[0], "code": r[1], "text": r[2]} for r in
            con.execute("select qid,code,text from questions where study_id=? and text like ?", (study_id, f"%{needle}%")).fetchall()]
