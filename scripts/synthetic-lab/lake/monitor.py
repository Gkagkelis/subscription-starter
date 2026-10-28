"""
Παρακολούθηση νέων εκδόσεων/νέων ερευνών (επαυξητική ενημέρωση του lake).

  python -m lake.pipeline monitor

- Eurostat: συγκρίνει την «τελευταία ενημέρωση» του TOC με αυτή που είχε η έκδοση που κατέβηκε· αν άλλαξε,
  ξαναμπαίνει στην ουρά (η νέα έκδοση αντικαθιστά τα κελιά· το sha256/η έκδοση του αρχείου καταγράφονται).
- Eurobarometer: νέες έρευνες στον κατάλογο → νέες εργασίες (οι υπάρχουσες δεν ξανακατεβαίνουν).
- Αποθετήρια: επανεκτέλεση αναζητήσεων από την αρχή (οι ήδη γνωστές εγγραφές αγνοούνται).
Κάθε αλλαγή καταγράφεται στο ημερολόγιο συμβάντων (change log).
"""

import json

from . import db, eurobarometer, eurostat, repos
from .net import get


def run(con):
    changed = 0
    txt = get(eurostat.TOC, timeout=120)
    for line in txt.splitlines()[1:]:
        cols = [c.strip().strip('"') for c in line.split("\t")]
        if len(cols) < 7 or cols[2] != "dataset":
            continue
        code, last_upd = cols[1], cols[3]
        sid = f"eurostat:{code}"
        st = con.execute("SELECT raw_meta, status FROM studies WHERE study_id=?", (sid,)).fetchone()
        if not st or st["status"] == "DISCOVERED":
            continue
        meta = json.loads(st["raw_meta"] or "{}")
        if meta.get("last_update") and last_upd and meta["last_update"] != last_upd:
            meta["previous_update"], meta["last_update"] = meta["last_update"], last_upd
            con.execute("UPDATE studies SET raw_meta=? WHERE study_id=?", (json.dumps(meta, ensure_ascii=False), sid))
            con.execute("UPDATE queue SET state='pending', attempts=0, next_try=0 WHERE task_id=?", (sid,))
            db.log(con, "monitor", f"νέα έκδοση {code}: {meta['previous_update']} → {last_upd}", source_id="eurostat", study_id=sid)
            changed += 1
    con.commit()
    new_es = -con.execute("SELECT COUNT(*) FROM queue WHERE kind='eurostat_fetch'").fetchone()[0]
    eurostat.discover(con)  # νέα datasets (οι υπάρχουσες εργασίες δεν διπλασιάζονται)
    new_es += con.execute("SELECT COUNT(*) FROM queue WHERE kind='eurostat_fetch'").fetchone()[0]
    before = con.execute("SELECT COUNT(*) FROM queue WHERE kind='eb_fetch'").fetchone()[0]
    eurobarometer.discover(con)
    new_eb = con.execute("SELECT COUNT(*) FROM queue WHERE kind='eb_fetch'").fetchone()[0] - before
    con.execute("DELETE FROM checkpoints WHERE name LIKE 'zenodo|%' OR name LIKE 'figshare|%' OR name LIKE 'harvard_dataverse|%' OR name LIKE 'dataverse_nl|%'")
    before = con.execute("SELECT COUNT(*) FROM queue WHERE kind='repo_fetch'").fetchone()[0]
    repos.discover(con)
    new_repo = con.execute("SELECT COUNT(*) FROM queue WHERE kind='repo_fetch'").fetchone()[0] - before
    db.log(con, "monitor", f"Eurostat ενημερωμένα: {changed} · νέα Eurostat: {new_es} · νέα Eurobarometer: {new_eb} · νέες εγγραφές αποθετηρίων: {new_repo}")
    con.commit()
    print(f"✓ monitor: Eurostat ενημερωμένα {changed}, νέα Eurostat {new_es}, νέα Eurobarometer {new_eb}, νέες εγγραφές αποθετηρίων {new_repo}")
    return changed + new_es + new_eb + new_repo
