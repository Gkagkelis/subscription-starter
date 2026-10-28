"""
Connectors ερευνητικών αποθετηρίων (Level A μικροδεδομένα): Zenodo, Figshare, Harvard Dataverse, DataverseNL.

discover: αναζητήσεις (ελληνικά/αγγλικά) με σελιδοποίηση → φίλτρο συνάφειας (Ελλάδα + έρευνα κοινωνικών
          επιστημών) → studies (DISCOVERED) + ουρά repo_fetch.
run:      λεπτομέρειες → VERIFIED · λήψη επιτρεπόμενων πινάκων → DOWNLOADED · ανάλυση → PARSED/VALIDATED.
"""

import json
import os
import re

from . import db, parse
from .net import HttpError, download, get_json
from .topics import classify, dedup_key, greece_relevant, license_open, quality_score, survey_relevant

QUERIES = [
    "Greece survey", "Greek survey data", "Greece questionnaire", "Greek respondents", "Greece public opinion",
    "Greece consumer survey", "Greek consumers questionnaire", "Greece household survey", "Greece attitudes survey",
    "Greek students questionnaire", "Greece health survey", "Greece tourism survey", "Greek teachers questionnaire",
    "Greece COVID-19 survey", "Greece energy households survey", "Greece social survey", "Greek population survey",
    "Greece election study", "Greek voters survey", "Greece migration survey", "Greece refugees survey",
    "Greek employees questionnaire", "Greek patients questionnaire", "Greece farmers survey", "Greece environmental attitudes",
    "Greek adolescents survey", "Greece well-being survey", "Greece digital skills survey", "Greek social media survey",
    "Greece food consumption survey", "Greece financial literacy survey", "Greece visitors questionnaire",
    "Greece trust institutions survey", "Greek parents survey", "Greece entrepreneurship survey", "Greece mobility survey",
    "Greece housing survey", "Greece climate change perceptions", "Greece recycling survey", "Greek nurses questionnaire",
    "Ελλάδα ερωτηματολόγιο", "ερωτηματολόγιο έρευνα", "δεδομένα ερωτηματολογίου", "έρευνα κοινής γνώμης",
    "δημοσκόπηση", "πρωτογενή δεδομένα έρευνας", "καταναλωτική συμπεριφορά", "Έλληνες συμμετέχοντες",
]
TABULAR = (".csv", ".tsv", ".tab", ".xlsx", ".xls", ".ods", ".sav", ".zsav", ".por", ".dta", ".zip")
MAX_FILE = 120 * 1024 * 1024
MAX_PAGES = 6


def _years(*texts):
    ys = [int(y) for y in re.findall(r"\b(20[12]\d)\b", " ".join(t for t in texts if t)) if 2012 <= int(y) <= 2025]
    return (min(ys), max(ys)) if ys else (None, None)


def _strip_html(s):
    return re.sub(r"<[^>]+>", " ", s or "").replace("&nbsp;", " ").strip()


def _register(con, source_id, ext_id, title, desc, keywords, pub, doi, url, lic, authors, raw):
    if not (greece_relevant(title, desc, " ".join(keywords)) and survey_relevant(title, desc, " ".join(keywords))):
        return False
    pub_year = int(pub[:4]) if pub and pub[:4].isdigit() else None
    if pub_year and pub_year < 2012:
        return False
    y0, y1 = _years(title, desc)
    sid = f"{source_id}:{ext_id}"
    dup = None
    if doi:
        r = con.execute("SELECT study_id FROM studies WHERE lower(doi)=lower(?) AND study_id<>?", (doi, sid)).fetchone()
        dup = r["study_id"] if r else None
    db.upsert_study(
        con, study_id=sid, source_id=source_id, external_id=str(ext_id), title=title, publisher=source_id, authors=authors,
        description=desc[:4000], keywords=keywords, publication_year=pub_year, collection_year_start=y0, collection_year_end=y1,
        country="EL", url=url, doi=doi, license=lic, license_open=license_open(lic), topics=classify(title, desc, " ".join(keywords)),
        dedup_key=dedup_key(title, pub_year), duplicate_of=dup, raw_meta=raw, access_restrictions="Δημόσια λήψη" if lic else "Άγνωστη άδεια",
    )
    if dup:
        db.set_status(con, sid, "VERIFIED", f"Διπλότυπο της {dup} (ίδιο DOI)")
    else:
        db.enqueue(con, sid, "repo_fetch", {"repo": source_id, "id": str(ext_id)})
    return True


# ---------------- Zenodo ----------------
def discover_zenodo(con):
    n = 0
    for q in QUERIES:
        for page in range(1, MAX_PAGES + 1):
            ck = f"zenodo|{q}|{page}"
            if db.checkpoint_get(con, ck):
                continue
            try:
                d = get_json("https://zenodo.org/api/records", params={"q": q, "type": "dataset", "size": 25, "page": page, "sort": "bestmatch"})
            except (HttpError, ValueError) as e:
                db.log(con, "discover", f"zenodo {q} p{page}: {e}", ok=False, source_id="zenodo")
                break
            hits = d.get("hits", {}).get("hits", [])
            for h in hits:
                m = h.get("metadata", {})
                lic = (m.get("license") or {}).get("id") if isinstance(m.get("license"), dict) else m.get("license")
                n += _register(con, "zenodo", h["id"], m.get("title", ""), _strip_html(m.get("description")), m.get("keywords") or [],
                               m.get("publication_date"), h.get("doi"), h.get("links", {}).get("self_html") or f"https://zenodo.org/records/{h['id']}",
                               lic, "; ".join(c.get("name", "") for c in m.get("creators", [])[:5]),
                               {"files": [{"key": f.get("key"), "size": f.get("size"), "url": f.get("links", {}).get("self")} for f in h.get("files", [])],
                                "access_right": m.get("access_right")})
            db.checkpoint_set(con, ck, len(hits))
            if len(hits) < 25:
                break
    return n


def details_zenodo(con, sid, rid):
    s = con.execute("SELECT raw_meta FROM studies WHERE study_id=?", (sid,)).fetchone()
    raw = json.loads(s["raw_meta"] or "{}")
    if raw.get("access_right") not in (None, "open"):
        return None, f"Πρόσβαση: {raw.get('access_right')}"
    return [{"name": f["key"], "size": f.get("size") or 0, "url": f["url"]} for f in raw.get("files", []) if f.get("url")], None


# ---------------- Figshare ----------------
def discover_figshare(con):
    n = 0
    for q in QUERIES:
        for page in range(1, MAX_PAGES + 1):
            ck = f"figshare|{q}|{page}"
            if db.checkpoint_get(con, ck):
                continue
            import urllib.request

            req = urllib.request.Request(
                "https://api.figshare.com/v2/articles/search",
                data=json.dumps({"search_for": q, "item_type": 3, "page": page, "page_size": 50}).encode(),
                headers={"Content-Type": "application/json", "User-Agent": "GreekSyntheticResearchLab-DataLake/1.0"},
            )
            try:
                with urllib.request.urlopen(req, timeout=60) as r:
                    hits = json.loads(r.read().decode())
            except Exception as e:
                db.log(con, "discover", f"figshare {q} p{page}: {e}", ok=False, source_id="figshare")
                break
            for h in hits:
                # η αναζήτηση δεν δίνει περιγραφή: φίλτρο στον τίτλο τώρα, πλήρης έλεγχος στις λεπτομέρειες
                title = h.get("title", "")
                if not greece_relevant(title) and "greek" not in title.lower():
                    continue
                n += _register(con, "figshare", h["id"], title, title, [], h.get("published_date"), h.get("doi"),
                               h.get("url_public_html"), None, None, {"api": h.get("url_public_api")})
            db.checkpoint_set(con, ck, len(hits))
            if len(hits) < 50:
                break
    return n


def details_figshare(con, sid, rid):
    d = get_json(f"https://api.figshare.com/v2/articles/{rid}")
    lic = (d.get("license") or {}).get("name")
    desc = _strip_html(d.get("description"))
    db.upsert_study(con, study_id=sid, license=lic, license_open=license_open(lic), description=desc[:4000],
                    keywords=d.get("tags") or [], topics=classify(d.get("title"), desc, " ".join(d.get("tags") or [])),
                    authors="; ".join(a.get("full_name", "") for a in d.get("authors", [])[:5]))
    if not (greece_relevant(d.get("title"), desc) and survey_relevant(d.get("title"), desc)):
        return None, "Μη σχετικό μετά από έλεγχο περιγραφής"
    return [{"name": f["name"], "size": f.get("size") or 0, "url": f.get("download_url")} for f in d.get("files", []) if not f.get("is_link_only")], None


# ---------------- Dataverse (Harvard, DataverseNL) ----------------
DATAVERSES = {"harvard_dataverse": "https://dataverse.harvard.edu", "dataverse_nl": "https://dataverse.nl"}


def discover_dataverse(con, source_id):
    base = DATAVERSES[source_id]
    n = 0
    for q in QUERIES:
        for page in range(MAX_PAGES):
            ck = f"{source_id}|{q}|{page}"
            if db.checkpoint_get(con, ck):
                continue
            try:
                d = get_json(f"{base}/api/search", params={"q": q, "type": "dataset", "per_page": 50, "start": page * 50})["data"]
            except (HttpError, ValueError) as e:
                db.log(con, "discover", f"{source_id} {q} p{page}: {e}", ok=False, source_id=source_id)
                break
            items = d.get("items", [])
            for h in items:
                gid = h.get("global_id", "")
                n += _register(con, source_id, gid.replace("doi:", "").replace("/", "_"), h.get("name", ""), h.get("description", ""),
                               h.get("keywords") or h.get("subjects") or [], h.get("published_at"), gid.replace("doi:", "") if gid.startswith("doi:") else None,
                               h.get("url"), None, "; ".join(h.get("authors", [])[:5]) if h.get("authors") else None,
                               {"global_id": gid, "dataverse": h.get("name_of_dataverse")})
            db.checkpoint_set(con, ck, len(items))
            if len(items) < 50:
                break
    return n


def details_dataverse(con, sid, source_id):
    base = DATAVERSES[source_id]
    raw = json.loads(con.execute("SELECT raw_meta FROM studies WHERE study_id=?", (sid,)).fetchone()["raw_meta"] or "{}")
    d = get_json(f"{base}/api/datasets/:persistentId/", params={"persistentId": raw["global_id"]})["data"]["latestVersion"]
    lic = (d.get("license") or {}).get("name") if isinstance(d.get("license"), dict) else d.get("license") or d.get("termsOfUse")
    fields = {f["typeName"]: f["value"] for f in d.get("metadataBlocks", {}).get("citation", {}).get("fields", [])}
    tp = fields.get("timePeriodCovered") or fields.get("dateOfCollection")
    y0 = y1 = None
    if isinstance(tp, list) and tp:
        try:
            start = tp[0].get("timePeriodCoveredStart", tp[0].get("dateOfCollectionStart", {})).get("value", "")
            end = tp[0].get("timePeriodCoveredEnd", tp[0].get("dateOfCollectionEnd", {})).get("value", "")
            y0 = int(start[:4]) if start[:4].isdigit() else None
            y1 = int(end[:4]) if end[:4].isdigit() else y0
        except Exception:
            pass
    db.upsert_study(con, study_id=sid, license=lic, license_open=license_open(lic), collection_year_start=y0, collection_year_end=y1)
    files, restricted = [], 0
    for f in d.get("files", []):
        df = f.get("dataFile", {})
        if f.get("restricted"):
            restricted += 1
            continue
        name = df.get("originalFileName") or df.get("filename") or ""
        url = f"{base}/api/access/datafile/{df.get('id')}" + ("?format=original" if df.get("originalFileFormat") else "")
        files.append({"name": name, "size": df.get("originalFileSize") or df.get("filesize") or 0, "url": url})
    if restricted and not files:
        return None, f"Όλα τα αρχεία ({restricted}) είναι περιορισμένης πρόσβασης"
    return files, None


# ---------------- Κοινή επεξεργασία ----------------
def discover(con, limit=None):
    n = discover_zenodo(con)
    con.commit()
    n += discover_figshare(con)
    con.commit()
    for s in DATAVERSES:
        n += discover_dataverse(con, s)
        con.commit()
    db.log(con, "discover", f"Αποθετήρια: {n} σχετικές εγγραφές", source_id="repos")
    con.commit()
    return n


def process(con, sid, repo, rid):
    if repo == "zenodo":
        files, why = details_zenodo(con, sid, rid)
    elif repo == "figshare":
        files, why = details_figshare(con, sid, rid)
    else:
        files, why = details_dataverse(con, sid, repo)
    if files is None:
        st = "RESTRICTED" if "περιορισμ" in (why or "") or "Πρόσβαση" in (why or "") else "VERIFIED"
        db.set_status(con, sid, st, why)
        return st
    db.set_status(con, sid, "VERIFIED", f"{len(files)} αρχεία")
    tab = [f for f in files if os.path.splitext(f["name"].lower())[1] in TABULAR and (f["size"] or 0) <= MAX_FILE and f.get("url")]
    if not tab:
        kinds = sorted({os.path.splitext(f['name'].lower())[1] for f in files})
        db.upsert_study(con, study_id=sid, evidence_level="C" if any(k in (".pdf", ".docx", ".doc") for k in kinds) else "D")
        db.set_status(con, sid, "VERIFIED", f"Χωρίς πίνακες δεδομένων (αρχεία: {', '.join(kinds) or '—'})")
        return "no_tabular"
    analyses, total_rows, nvars = [], 0, 0
    for i, f in enumerate(tab[:12]):
        safe = re.sub(r"[^\w.\-]", "_", f["name"])[-120:]
        dest = os.path.join(db.LAKE, "raw", repo, re.sub(r"[^\w.\-]", "_", str(rid))[:80], safe)
        fid = f"{sid}:f{i}"
        try:
            sha, size = download(f["url"], dest, max_bytes=MAX_FILE)
        except Exception as e:
            con.execute("INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (fid, sid, f["url"], f["name"], None, None, f["size"], os.path.splitext(f["name"])[1], "data", "failed", repr(e)[:500], db.now(), None))
            continue
        dup = con.execute("SELECT study_id FROM files WHERE sha256=? AND study_id<>? LIMIT 1", (sha, sid)).fetchone()
        con.execute("INSERT OR REPLACE INTO files VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                    (fid, sid, f["url"], f["name"], dest, sha, size, os.path.splitext(f["name"])[1], "data", "downloaded", None, db.now(), None))
        if dup:
            db.upsert_study(con, study_id=sid, duplicate_of=dup["study_id"])
            continue
        try:
            for tname, df, vl, labs in parse.read_tables(dest):
                a = parse.analyse_table(df, vl, labs)
                if a:
                    analyses.append((fid, tname, a))
        except Exception as e:
            con.execute("UPDATE files SET error=? WHERE file_id=?", (f"parse: {repr(e)[:400]}", fid))
    db.set_status(con, sid, "DOWNLOADED")
    if not analyses:
        db.upsert_study(con, study_id=sid, evidence_level="C")
        db.set_status(con, sid, "DOWNLOADED", "Κατέβηκαν αρχεία, αλλά κανένας πίνακας ατομικών απαντήσεων (≥30 γραμμές, κατηγορικές μεταβλητές)")
        return "no_microdata"
    con.execute("DELETE FROM variables WHERE study_id=?", (sid,))
    con.execute("DELETE FROM distributions WHERE study_id=?", (sid,))
    st = con.execute("SELECT * FROM studies WHERE study_id=?", (sid,)).fetchone()
    year = st["collection_year_end"] or st["publication_year"]
    labels_all = []
    for fid, tname, a in analyses:
        total_rows = max(total_rows, a["rows"])
        for v in a["variables"]:
            nvars += 1
            vid = f"{fid}:{re.sub(r'[^\\w]', '_', tname)[-40:]}:{re.sub(r'[^\\w]', '_', v['name'])[:60]}"
            labels_all.append(v["label"])
            con.execute("INSERT OR REPLACE INTO variables VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (vid, sid, fid, v["name"], v["label"], v["question_text"], json.dumps(v["options"], ensure_ascii=False),
                         json.dumps(v["value_labels"], ensure_ascii=False) if v["value_labels"] else None, v["n_valid"], v["n_missing"],
                         "categorical", v["role"], json.dumps(classify(v["label"], " ".join(map(str, v["options"]))))))
            for (gd, gv), (dist, n) in v["groups"].items():
                for opt, pct in dist.items():
                    con.execute(
                        "INSERT INTO distributions (study_id, var_id, wave_year, group_dim, group_value, option_code, option_label, value, unit, n, weighted, flag, note) VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)",
                        (sid, vid, year, gd, gv, str(opt)[:150], str(opt)[:150], pct, "percent", n, 1 if a["weight_var"] else 0, "", tname[:200]),
                    )
    text = " ".join([st["title"] or "", st["description"] or ""])
    rep = "claimed_representative" if re.search(r"representative|αντιπροσωπευτικ|nationally|πανελλαδικ", text, re.I) else "convenience"
    has_w = any(a["weight_var"] for _, _, a in analyses)
    db.upsert_study(
        con, study_id=sid, evidence_level="A", sample_size=total_rows, representativeness=rep,
        weight_vars=[a["weight_var"] for _, _, a in analyses if a["weight_var"]] or None,
        sex_categories=["male", "female"] if any(a["has_gender"] for _, _, a in analyses) else None,
        topics=classify(st["title"], st["description"], " ".join(labels_all[:200])),
        quality_score=quality_score("A", n=total_rows, representative=rep, has_weights=has_w,
                                    years_old=(2025 - year) if year else None),
        target_population=st["target_population"] or "Δείγμα της μελέτης (βλ. περιγραφή αποθετηρίου)",
        sampling_method=st["sampling_method"] or ("Δηλώνεται αντιπροσωπευτικό" if rep == "claimed_representative" else "Μη πιθανοτικό / άγνωστο (convenience)"),
    )
    db.set_status(con, sid, "PARSED", f"{len(analyses)} πίνακες, {nvars} κατηγορικές μεταβλητές, έως {total_rows} γραμμές")
    if nvars >= 1 and total_rows >= 30:
        db.set_status(con, sid, "VALIDATED", f"{len(analyses)} πίνακες, {nvars} μεταβλητές, έως {total_rows} ερωτώμενοι")
        return "ok"
    return "parsed"


def run(con, max_tasks=None):
    done = 0
    while True:
        tasks = db.next_tasks(con, "repo_fetch", limit=20)
        if not tasks:
            break
        for t in tasks:
            p = json.loads(t["payload"])
            sid = t["task_id"]
            try:
                res = process(con, sid, p["repo"], p["id"])
                db.task_done(con, sid, "done", None if res == "ok" else res)
                db.log(con, "fetch", f"{sid}: {res}", source_id=p["repo"], study_id=sid)
            except Exception as e:
                db.task_done(con, sid, "retry", repr(e))
                db.set_status(con, sid, "FAILED", f"{repr(e)[:300]}")
                db.log(con, "fetch", f"{sid}: {e!r}", ok=False, source_id=p["repo"], study_id=sid)
            con.commit()
            done += 1
            if done % 20 == 0:
                print(f"  repos: {done}", flush=True)
            if max_tasks and done >= max_tasks:
                return done
    return done
