"""
Επισκευές ποιότητας δεδομένων του Research Data Lake (φάση 2.1). Χωρίς νέο κατέβασμα: μόνο από αρχεία ήδη αποθηκευμένα.
Κάθε αλλαγή καταγράφεται στον πίνακα `repairs` (παλιά τιμή, νέα τιμή, αιτία, αρχείο-πηγή), ώστε να αναιρείται.

  python -m lake.repair eb-sublabels      # ετικέτες υπο-ερωτήσεων Eurobarometer + περιορισμένες βάσεις («Base: ...»)
  python -m lake.repair undo <reason>     # επαναφορά όλων των αλλαγών μιας αιτίας
  python -m lake.repair summary
"""

import argparse
import glob
import json
import os
import re

from . import db

EB_REASON = "eb_sublabel"
BASE_REASON = "eb_base"
ALL_BASE = re.compile(r"(?i)^base\s*:\s*(ensemble|all respondents?|total|all|weighted total|tous|tous les répondants|all respondents \(n\)|weighted base)\s*$")


def _ensure(con):
    con.execute(
        """CREATE TABLE IF NOT EXISTS repairs (
             id INTEGER PRIMARY KEY AUTOINCREMENT, study_id TEXT, var_id TEXT, field TEXT, old_value TEXT, new_value TEXT,
             reason TEXT, source_file TEXT, at TEXT)"""
    )
    con.execute("CREATE INDEX IF NOT EXISTS repairs_var ON repairs(var_id, field)")
    con.execute("CREATE TABLE IF NOT EXISTS variable_meta (var_id TEXT, key TEXT, value TEXT, PRIMARY KEY (var_id, key))")


CODE_AT = re.compile(r"^\s*([A-Z]{1,4}\d+[A-Za-z0-9_.]*)\b")


def _is_code_cell(t):
    return bool(CODE_AT.match(t or ""))


def _index_sublabels(rows):
    """Φύλλο Index/Contents: κωδικός → ετικέτα υπο-ερώτησης (αγγλική όπου υπάρχει)."""
    out = {}
    for r in rows:
        cells = [str(c).strip() if c is not None else "" for c in r]
        starts = [i for i, t in enumerate(cells) if _is_code_cell(t) and len(t) > 8]
        if not starts:
            continue
        code = CODE_AT.match(cells[starts[0]]).group(1).upper()
        label = None
        for i in reversed(starts):  # η τελευταία διατύπωση είναι η αγγλική
            nxt = next((cells[j] for j in range(i + 1, min(i + 3, len(cells))) if cells[j]), "")
            if nxt and not _is_code_cell(nxt) and 1 < len(nxt) <= 250 and not nxt.endswith("!A1"):
                label = re.sub(r"\s+", " ", nxt)
                break
        if label:
            out[code] = label
    return out


def _sheet_sublabel(rows):
    """Νεότερη μορφή (2024+): σε κάθε φύλλο, κάτω από τη διατύπωση (FR/EN) υπάρχει η ετικέτα της υπο-ερώτησης.
    Επιστρέφει (κωδικός, αγγλική ετικέτα) ή None."""
    for i, r in enumerate(rows[:8]):
        qcols = [j for j, c in enumerate(r) if isinstance(c, str) and _is_code_cell(c.strip()) and len(c.strip()) > 8]
        if not qcols or i + 1 >= len(rows):
            continue
        j = qcols[-1]  # δεξιότερη = αγγλική
        nxt = rows[i + 1][j] if j < len(rows[i + 1]) else None
        if not isinstance(nxt, str):
            return None
        lab = re.sub(r"\s+", " ", nxt.strip())
        if not lab or re.match(r"(?i)^base\s*:", lab) or _is_code_cell(lab) or len(lab) > 250:
            return None
        return CODE_AT.match(r[j].strip()).group(1).upper().rstrip("."), lab
    return None


def _sheet_bases(name, rows):
    """«Base: ...» που ΔΕΝ είναι «όλοι οι ερωτώμενοι» (περιορισμένο υποσύνολο) — αγγλική διατύπωση όπου υπάρχει."""
    found = []
    for r in rows[:80]:
        for c in r:
            if isinstance(c, str):
                t = re.sub(r"\s+", " ", c.strip())
                if re.match(r"(?i)^base\s*:", t) and not ALL_BASE.match(t) and len(t) < 400:
                    found.append(t)
    if not found:
        return None
    eng = [t for t in found if re.search(r"(?i)\b(who|those|respondents|ask|if|have|use|all who)\b", t)]
    return (eng or found)[-1]


def eb_sublabels(con, limit=None):
    from .eurobarometer import _sheets

    _ensure(con)
    root = os.path.join(db.LAKE, "raw", "eurobarometer")
    studies = con.execute("SELECT study_id, external_id FROM studies WHERE source_id='eurobarometer'").fetchall()
    n_lab = n_base = n_st = 0
    for k, st in enumerate(studies[: limit or None]):
        sid = st["study_id"]
        d = os.path.join(root, re.sub(r"[^\w.\-]", "_", sid.split(":", 1)[1]))
        files = sorted(glob.glob(os.path.join(d, "unz", "*.xls*")))
        if not files:
            continue
        labels, bases, src = {}, {}, {}
        for f in files:
            try:
                for name, rows in _sheets(f):
                    low = name.strip().lower()
                    if low in ("index", "content", "contents", "sommaire", "table of contents"):
                        for code, lab in _index_sublabels(rows).items():
                            if code not in labels:
                                labels[code] = lab
                                src[code] = os.path.basename(f)
                        continue
                    sl = _sheet_sublabel(rows)
                    if sl and sl[0] not in labels:
                        labels[sl[0]] = sl[1]
                        src[sl[0]] = os.path.basename(f)
                    b = _sheet_bases(name, rows)
                    m = CODE_AT.match(name.strip()) or CODE_AT.match(next((str(c) for r in rows[:6] for c in r if isinstance(c, str) and _is_code_cell(c)), ""))
                    if b and m and m.group(1).upper() not in bases:
                        bases[m.group(1).upper()] = (b, os.path.basename(f))
            except Exception as e:  # noqa: BLE001 — ένα κατεστραμμένο αρχείο δεν σταματά την επισκευή
                db.log(con, "repair", f"{sid}: {os.path.basename(f)}: {e!r}", ok=False, source_id="eurobarometer", study_id=sid)
        if not labels and not bases:
            continue
        n_st += 1
        vs = con.execute("SELECT var_id, name, label, question_text FROM variables WHERE study_id=?", (sid,)).fetchall()
        # μόνο πραγματικές συστοιχίες: η αρχική διατύπωση (χωρίς κωδικό) επαναλαμβάνεται σε ≥ 2 ερωτήσεις της μελέτης
        def _orig(v):
            prev = con.execute("SELECT old_value FROM repairs WHERE var_id=? AND field='question_text' AND reason=? ORDER BY id LIMIT 1", (v["var_id"], EB_REASON)).fetchone()
            return prev["old_value"] if prev else v["question_text"]
        stem = lambda t: re.sub(r"\s+", " ", re.sub(r"^\s*[A-Za-z]{0,4}\d+[A-Za-z0-9_.]*\s*[.:)]?\s*", "", t or "")).strip().lower()
        stem_n = {}
        for v in vs:
            stem_n[stem(_orig(v))] = stem_n.get(stem(_orig(v)), 0) + 1
        for v in vs:
            code = (v["name"] or "").upper()
            lab = labels.get(code) or labels.get(code.rstrip("."))
            if lab and stem_n.get(stem(_orig(v)), 0) >= 2:
                prev = con.execute("SELECT old_value FROM repairs WHERE var_id=? AND field='question_text' AND reason=? ORDER BY id LIMIT 1", (v["var_id"], EB_REASON)).fetchone()
                orig = prev["old_value"] if prev else v["question_text"]
                if lab.lower() not in (orig or "").lower():
                    new = f"{orig} — {lab}"
                    if new != v["question_text"]:
                        con.execute("UPDATE variables SET question_text=?, label=? WHERE var_id=?", (new[:2000], new[:300], v["var_id"]))
                        if not prev:
                            con.execute("INSERT INTO repairs (study_id,var_id,field,old_value,new_value,reason,source_file,at) VALUES (?,?,?,?,?,?,?,?)",
                                        (sid, v["var_id"], "question_text", orig, new, EB_REASON, src.get(code), db.now()))
                        n_lab += 1
            b = bases.get(code)
            if b:
                con.execute("INSERT OR REPLACE INTO variable_meta (var_id, key, value) VALUES (?,?,?)", (v["var_id"], "base", b[0]))
                if not con.execute("SELECT 1 FROM repairs WHERE var_id=? AND field='base'", (v["var_id"],)).fetchone():
                    con.execute("INSERT INTO repairs (study_id,var_id,field,old_value,new_value,reason,source_file,at) VALUES (?,?,?,?,?,?,?,?)",
                                (sid, v["var_id"], "base", None, b[0], BASE_REASON, b[1], db.now()))
                n_base += 1
        con.commit()
        if k % 50 == 0:
            print(f"  {k}/{len(studies)} μελέτες · ετικέτες {n_lab} · περιορισμένες βάσεις {n_base}", flush=True)
    db.log(con, "repair", f"EB: {n_lab} ετικέτες υπο-ερωτήσεων, {n_base} περιορισμένες βάσεις σε {n_st} μελέτες")
    con.commit()
    print(f"✓ EB: {n_lab} ετικέτες υπο-ερωτήσεων, {n_base} περιορισμένες βάσεις σε {n_st} μελέτες")


ALLISH = re.compile(r"(?i)^base\s*:\s*(total|all|ensemble|tous|weighted)\b")
FILTER_WORDS = re.compile(r"(?i)\b(who|those|if|qui|si|only|seulement|respondents? (who|that)|ask)\b")
ROUTING = re.compile(r"^\s*\(?\s*(IF|ASK|SI)\b")


def eb_normalize(con):
    """Καθαρισμός μετά την ανάκτηση: (α) «βάσεις» που σημαίνουν «όλοι» δεν είναι περιορισμός· (β) «ετικέτες» που είναι οδηγίες
    δρομολόγησης («(IF ...)») είναι φίλτρο βάσης, όχι υπο-ερώτηση."""
    _ensure(con)
    n_all = n_route = 0
    for r in con.execute("SELECT id, var_id, new_value FROM repairs WHERE field='base'").fetchall():
        v = r["new_value"] or ""
        if ALLISH.match(v) and not FILTER_WORDS.search(v.split(":", 1)[1]):
            con.execute("DELETE FROM variable_meta WHERE var_id=? AND key='base'", (r["var_id"],))
            con.execute("DELETE FROM repairs WHERE id=?", (r["id"],))
            n_all += 1
    for r in con.execute("SELECT id, study_id, var_id, old_value, new_value, source_file FROM repairs WHERE field='question_text' AND reason=?", (EB_REASON,)).fetchall():
        lab = (r["new_value"] or "")[len(r["old_value"] or "") + 3:]
        if ROUTING.match(lab):
            con.execute("UPDATE variables SET question_text=?, label=? WHERE var_id=?", (r["old_value"], (r["old_value"] or "")[:300], r["var_id"]))
            con.execute("DELETE FROM repairs WHERE id=?", (r["id"],))
            if not con.execute("SELECT 1 FROM variable_meta WHERE var_id=? AND key='base'", (r["var_id"],)).fetchone():
                con.execute("INSERT INTO variable_meta (var_id, key, value) VALUES (?,?,?)", (r["var_id"], "base", f"Base: {lab}"))
                con.execute("INSERT INTO repairs (study_id,var_id,field,old_value,new_value,reason,source_file,at) VALUES (?,?,?,?,?,?,?,?)",
                            (r["study_id"], r["var_id"], "base", None, f"Base: {lab}", BASE_REASON, r["source_file"], db.now()))
            n_route += 1
    con.commit()
    print(f"✓ βάσεις «όλοι» αφαιρέθηκαν: {n_all} · οδηγίες δρομολόγησης → φίλτρο βάσης: {n_route}")


def undo(con, reason):
    _ensure(con)
    rows = con.execute("SELECT * FROM repairs WHERE reason=? ORDER BY id DESC", (reason,)).fetchall()
    for r in rows:
        if r["field"] == "question_text":
            con.execute("UPDATE variables SET question_text=?, label=? WHERE var_id=?", (r["old_value"], (r["old_value"] or "")[:300], r["var_id"]))
        elif r["field"] == "base":
            con.execute("DELETE FROM variable_meta WHERE var_id=? AND key='base'", (r["var_id"],))
    con.execute("DELETE FROM repairs WHERE reason=?", (reason,))
    con.commit()
    print(f"✓ αναιρέθηκαν {len(rows)} αλλαγές ({reason})")


def summary(con):
    _ensure(con)
    for r in con.execute("SELECT reason, field, COUNT(*) n, COUNT(DISTINCT study_id) s FROM repairs GROUP BY reason, field"):
        print(dict(r))


def main(argv=None):
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["eb-sublabels", "eb-normalize", "undo", "summary"])
    ap.add_argument("arg", nargs="?")
    ap.add_argument("--limit", type=int)
    a = ap.parse_args(argv)
    con = db.connect()
    if a.cmd == "eb-sublabels":
        eb_sublabels(con, a.limit)
        eb_normalize(con)
    elif a.cmd == "eb-normalize":
        eb_normalize(con)
    elif a.cmd == "undo":
        undo(con, a.arg)
    else:
        summary(con)


if __name__ == "__main__":
    main()
