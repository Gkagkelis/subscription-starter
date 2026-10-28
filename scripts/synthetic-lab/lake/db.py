"""
Greek Research Data Lake — αποθήκη μεταδεδομένων και δεδομένων (SQLite).

Διάταξη στο δίσκο (ιδιωτικά, gitignored):
  <LAKE>/lake.sqlite      registry, κατάλογος, αρχεία, μεταβλητές, κατανομές, ουρά, συμβάντα
  <LAKE>/raw/<source>/<study>/...   πρωτότυπα αρχεία (με sha256)
  <LAKE>/export/          εξαγωγές για το simulation engine (JSON)
  <LAKE>/reports/         αναφορές κάλυψης/ποιότητας

<LAKE> = $SYNTHETIC_LAB_LAKE_DIR ή <repo>/.synthetic-lab-data/lake
"""

import json
import os
import sqlite3
import time

REPO = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
LAKE = os.environ.get("SYNTHETIC_LAB_LAKE_DIR") or os.path.join(REPO, ".synthetic-lab-data", "lake")

# Καταστάσεις ερευνών (αυστηρή σειρά· INTEGRATED μόνο όταν τα δεδομένα είναι χρησιμοποιήσιμα)
STATUSES = ["DISCOVERED", "VERIFIED", "DOWNLOADED", "PARSED", "VALIDATED", "INTEGRATED", "RESTRICTED", "FAILED"]
LEVELS = {"A": "Raw microdata", "B": "Detailed aggregate data", "C": "Published research findings", "D": "Limited research evidence"}

SCHEMA = """
CREATE TABLE IF NOT EXISTS sources (
  source_id TEXT PRIMARY KEY, name TEXT, kind TEXT, base_url TEXT, api_url TEXT,
  access TEXT, license_default TEXT, connector TEXT, reachable INTEGER, http_status TEXT,
  last_checked TEXT, notes TEXT
);
CREATE TABLE IF NOT EXISTS studies (
  study_id TEXT PRIMARY KEY, source_id TEXT, external_id TEXT, title TEXT, publisher TEXT, authors TEXT,
  country TEXT, collection_year_start INTEGER, collection_year_end INTEGER, publication_year INTEGER,
  fieldwork_dates TEXT, sample_size INTEGER, target_population TEXT, sampling_method TEXT,
  representativeness TEXT, weight_vars TEXT, age_groups TEXT, sex_categories TEXT, geographic_coverage TEXT,
  url TEXT, doi TEXT, license TEXT, license_open INTEGER, access_restrictions TEXT,
  evidence_level TEXT, status TEXT, status_reason TEXT, topics TEXT, quality_score REAL,
  dedup_key TEXT, duplicate_of TEXT, description TEXT, keywords TEXT,
  discovered_at TEXT, updated_at TEXT, raw_meta TEXT
);
CREATE INDEX IF NOT EXISTS ix_studies_status ON studies(status);
CREATE INDEX IF NOT EXISTS ix_studies_dedup ON studies(dedup_key);
CREATE INDEX IF NOT EXISTS ix_studies_doi ON studies(doi);
CREATE TABLE IF NOT EXISTS files (
  file_id TEXT PRIMARY KEY, study_id TEXT, url TEXT, name TEXT, local_path TEXT, sha256 TEXT, size INTEGER,
  format TEXT, role TEXT, status TEXT, error TEXT, downloaded_at TEXT, version TEXT
);
CREATE INDEX IF NOT EXISTS ix_files_study ON files(study_id);
CREATE INDEX IF NOT EXISTS ix_files_sha ON files(sha256);
CREATE TABLE IF NOT EXISTS variables (
  var_id TEXT PRIMARY KEY, study_id TEXT, file_id TEXT, name TEXT, label TEXT, question_text TEXT,
  options TEXT, value_labels TEXT, n_valid INTEGER, n_missing INTEGER, var_type TEXT, role TEXT, topics TEXT
);
CREATE INDEX IF NOT EXISTS ix_vars_study ON variables(study_id);
CREATE TABLE IF NOT EXISTS distributions (
  dist_id INTEGER PRIMARY KEY AUTOINCREMENT, study_id TEXT, var_id TEXT, wave_year INTEGER,
  group_dim TEXT, group_value TEXT, option_code TEXT, option_label TEXT, value REAL, unit TEXT,
  n INTEGER, weighted INTEGER, flag TEXT, note TEXT
);
CREATE INDEX IF NOT EXISTS ix_dist_var ON distributions(var_id);
CREATE INDEX IF NOT EXISTS ix_dist_study ON distributions(study_id);
CREATE TABLE IF NOT EXISTS agg_cells (
  study_id TEXT, dims TEXT, time TEXT, value REAL, flag TEXT,
  PRIMARY KEY (study_id, dims, time)
);
CREATE TABLE IF NOT EXISTS queue (
  task_id TEXT PRIMARY KEY, kind TEXT, payload TEXT, state TEXT, attempts INTEGER DEFAULT 0,
  next_try REAL DEFAULT 0, last_error TEXT, updated_at TEXT
);
CREATE INDEX IF NOT EXISTS ix_queue_state ON queue(kind, state);
CREATE TABLE IF NOT EXISTS events (
  ts TEXT, stage TEXT, source_id TEXT, study_id TEXT, ok INTEGER, message TEXT
);
CREATE TABLE IF NOT EXISTS checkpoints (
  name TEXT PRIMARY KEY, value TEXT, updated_at TEXT
);
"""


def now():
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())


_OPEN = []


def commit_open():
    """Κλείνει τυχόν ανοιχτές συναλλαγές πριν από δικτυακή κλήση, ώστε να μην κρατιέται το lock της SQLite κατά το I/O
    (πολλοί harvesters γράφουν παράλληλα στην ίδια βάση)."""
    for c in _OPEN:
        try:
            if c.in_transaction:
                c.commit()
        except sqlite3.Error:
            pass


def connect(path=None):
    os.makedirs(LAKE, exist_ok=True)
    con = sqlite3.connect(path or os.path.join(LAKE, "lake.sqlite"), timeout=300)
    _OPEN.append(con)
    con.row_factory = sqlite3.Row
    con.execute("PRAGMA journal_mode=WAL")
    con.execute("PRAGMA synchronous=NORMAL")
    con.executescript(SCHEMA)
    return con


def log(con, stage, message, ok=True, source_id=None, study_id=None):
    con.execute("INSERT INTO events VALUES (?,?,?,?,?,?)", (now(), stage, source_id, study_id, 1 if ok else 0, str(message)[:2000]))


def checkpoint_get(con, name, default=None):
    r = con.execute("SELECT value FROM checkpoints WHERE name=?", (name,)).fetchone()
    return json.loads(r["value"]) if r else default


def checkpoint_set(con, name, value):
    con.execute("INSERT OR REPLACE INTO checkpoints VALUES (?,?,?)", (name, json.dumps(value, ensure_ascii=False), now()))
    con.commit()


def upsert_source(con, **s):
    s.setdefault("last_checked", now())
    cols = ["source_id", "name", "kind", "base_url", "api_url", "access", "license_default", "connector", "reachable", "http_status", "last_checked", "notes"]
    con.execute(f"INSERT OR REPLACE INTO sources ({','.join(cols)}) VALUES ({','.join('?' * len(cols))})", [s.get(c) for c in cols])


STUDY_COLS = [
    "study_id", "source_id", "external_id", "title", "publisher", "authors", "country", "collection_year_start",
    "collection_year_end", "publication_year", "fieldwork_dates", "sample_size", "target_population", "sampling_method",
    "representativeness", "weight_vars", "age_groups", "sex_categories", "geographic_coverage", "url", "doi", "license",
    "license_open", "access_restrictions", "evidence_level", "status", "status_reason", "topics", "quality_score",
    "dedup_key", "duplicate_of", "description", "keywords", "discovered_at", "updated_at", "raw_meta",
]

STATUS_RANK = {s: i for i, s in enumerate(STATUSES)}


def upsert_study(con, **s):
    """Εισαγωγή/ενημέρωση έρευνας χωρίς να «υποβαθμίζεται» η κατάσταση που έχει ήδη επιτευχθεί."""
    old = con.execute("SELECT * FROM studies WHERE study_id=?", (s["study_id"],)).fetchone()
    for k in ("topics", "raw_meta", "keywords", "age_groups", "sex_categories", "weight_vars"):
        if k in s and not isinstance(s[k], (str, type(None))):
            s[k] = json.dumps(s[k], ensure_ascii=False)
    if old:
        merged = dict(old)
        for k, v in s.items():
            if v is None:
                continue
            if k == "status" and old["status"] and old["status"] not in ("FAILED", "RESTRICTED") and v not in ("FAILED", "RESTRICTED"):
                if STATUS_RANK.get(v, 0) < STATUS_RANK.get(old["status"], 0):
                    continue
            merged[k] = v
        merged["updated_at"] = now()
        s = merged
    else:
        s.setdefault("discovered_at", now())
        s["updated_at"] = now()
        s.setdefault("status", "DISCOVERED")
    con.execute(f"INSERT OR REPLACE INTO studies ({','.join(STUDY_COLS)}) VALUES ({','.join('?' * len(STUDY_COLS))})", [s.get(c) for c in STUDY_COLS])


def set_status(con, study_id, status, reason=None):
    assert status in STATUSES, status
    con.execute("UPDATE studies SET status=?, status_reason=COALESCE(?, status_reason), updated_at=? WHERE study_id=?", (status, reason, now(), study_id))


# ---------------- Ουρά εργασιών (checkpoint/resume) ----------------
def enqueue(con, task_id, kind, payload):
    con.execute(
        "INSERT OR IGNORE INTO queue (task_id, kind, payload, state, attempts, next_try, updated_at) VALUES (?,?,?,?,0,0,?)",
        (task_id, kind, json.dumps(payload, ensure_ascii=False), "pending", now()),
    )


def next_tasks(con, kind, limit=50):
    return con.execute(
        "SELECT * FROM queue WHERE kind=? AND state IN ('pending','retry') AND next_try<=? ORDER BY attempts, task_id "
        + ("DESC" if os.environ.get("LAKE_QUEUE_ORDER") == "desc" else "") + " LIMIT ?",
        (kind, time.time(), limit),
    ).fetchall()


def claim(con, task_id):
    """Ατομική «δέσμευση» εργασίας ώστε πολλοί workers να δουλεύουν την ίδια ουρά χωρίς διπλή επεξεργασία."""
    cur = con.execute("UPDATE queue SET state='running', updated_at=? WHERE task_id=? AND state IN ('pending','retry')", (now(), task_id))
    con.commit()
    return cur.rowcount == 1


def release_stale(con, kind, older_than_s=3 * 3600):
    """Εργασίες «running» που έμειναν από διακοπείσα εκτέλεση → ξανά pending."""
    cutoff = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - older_than_s))
    con.execute("UPDATE queue SET state='pending' WHERE kind=? AND state='running' AND updated_at < ?", (kind, cutoff))
    con.commit()


def task_done(con, task_id, state="done", error=None, max_attempts=4):
    if state == "retry":
        r = con.execute("SELECT attempts FROM queue WHERE task_id=?", (task_id,)).fetchone()
        attempts = (r["attempts"] if r else 0) + 1
        if attempts >= max_attempts:
            state = "failed"
        con.execute(
            "UPDATE queue SET state=?, attempts=?, next_try=?, last_error=?, updated_at=? WHERE task_id=?",
            (state, attempts, time.time() + 30 * (2 ** attempts), (error or "")[:1000], now(), task_id),
        )
    else:
        con.execute("UPDATE queue SET state=?, last_error=?, updated_at=? WHERE task_id=?", (state, (error or "")[:1000] or None, now(), task_id))
