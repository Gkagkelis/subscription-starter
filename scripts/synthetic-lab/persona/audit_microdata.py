"""
Microdata audit: τι πραγματικές ατομικές απαντήσεις (respondent-level records) διαθέτει πράγματι το Lab.

Σαρώνει, χωρίς να αλλάζει τίποτα:
  1. raw/dianeosis/**           διαΝΕΟσις «Τι πιστεύουν οι Έλληνες» (SPSS)
  2. raw/political/archives/*   CSES (IMD, M3–M5) — μεγάλα CSV σε zip, μετριούνται με streaming
  3. raw/political/repos/*      ανοιχτά repositories (Dataverse, Zenodo, Figshare, OSF)
  4. lake.sqlite → files        αρχεία δεδομένων repositories του Lake (role='data', όχι JSON-stat)
  5. raw/glopop                 GLOPOP-S (συνθετικός πληθυσμός: Level B, ΔΕΝ είναι ερωτώμενοι)

Για κάθε πίνακα: γραμμές, ελληνικές γραμμές, αν είναι ατομικές απαντήσεις, μεταβλητές ανά κατασκευή
(δημογραφικά, πολιτικά, καταναλωτικά, μάρκες, οικονομικά), βάρη, codebook, άδεια, διπλότυπα (sha256).
Δεν εξάγονται τιμές ερωτώμενων — μόνο μετρήσεις και ονόματα μεταβλητών.

Έξοδος: <data>/persona/audit/microdata_audit.json  (+ σύνοψη στο stdout)
Χρήση:  python3 -I scripts/synthetic-lab/persona/audit_microdata.py <repo_root>
"""
import csv
import glob
import hashlib
import io
import json
import os
import re
import sqlite3
import sys
import time
import zipfile

ROOT = os.path.abspath(sys.argv[1] if len(sys.argv) > 1 else ".")
DATA = os.path.join(ROOT, ".synthetic-lab-data")
sys.path.insert(0, os.path.join(ROOT, "scripts", "synthetic-lab"))
from lake.parse import read_tables  # noqa: E402
from lake.topics import norm  # noqa: E402

MICRO_EXT = {".sav", ".dta", ".csv", ".tsv", ".tab", ".xlsx", ".xls", ".ods", ".zip", ".rds", ".rdata", ".por", ".zsav"}
DOC_EXT = {".pdf", ".docx", ".doc", ".rtf", ".txt", ".md", ".html"}

# Κατασκευές (όνομα + ετικέτα μεταβλητής, κανονικοποιημένα — χωρίς τόνους, πεζά)
C = lambda p: re.compile(p)
CONSTRUCTS = {
    "demo.age": C(r"\bage\b|ηλικ|year of birth|yrbrn|birth year|ετοσ γεννησ|agegroup|age_group|agecat"),
    "demo.gender": C(r"gender|\bsex\b|φυλο"),
    "demo.education": C(r"educ|εκπαιδευσ|μορφωσ|σπουδ|isced|school|qualification"),
    "demo.region": C(r"region|nuts|περιφερ|νομο|prefect|district|\barea\b|γεωγρ"),
    "demo.urbanity": C(r"urban|rural|αστικ|αγροτ|settlement|domicil|size of town|town size"),
    "demo.income": C(r"income|εισοδημ|hinctnt|salary|μισθ"),
    "demo.employment": C(r"employ|occupation|επαγγελ|εργασ|job|unemploy|ανεργ|work status|mainact"),
    "demo.marital": C(r"marital|οικογενειακ|married|παντρ|partner"),
    "demo.household": C(r"household size|hhsize|μελη του νοικοκυρ|ατομα στο νοικοκυρ|members of household|children|παιδια"),
    "econ.hh_situation": C(r"economic situation|financial situation|οικονομικ[ηα] κατασταση|make ends meet|τα βγαζ|financial|finances|οικονομικη δυσκολ|cope on present income"),
    "econ.expectations": C(r"next (12|twelve) months|επομεν|expect|προσδοκ|future econom"),
    "econ.job_security": C(r"job security|lose (your|their) job|ασφαλεια εργασ|χασ.* (τη )?δουλει"),
    "pol.vote_intention": C(r"vote intention|intend to vote|would (you )?vote|θα ψηφιζ|προθεση ψηφ|if (there )?(were|was) (a |an )?(general )?election|ποιο κομμα θα"),
    "pol.past_vote": C(r"voted|vote(d)? in the (last|previous)|ψηφισατε|ψηφισ(ε|α)|last election|previous election|recall"),
    "pol.party_id": C(r"close to (a|any) (political )?party|party id|κοντα σε (καποιο )?κομμα|identify with|partisan"),
    "pol.left_right": C(r"left.?right|αριστερ|δεξι|ideolog|ιδεολογ|lrscale|self.?placement|αυτοτοποθετ"),
    "pol.trust": C(r"trust|εμπιστ|confidence in"),
    "pol.democracy": C(r"democra|δημοκρατ"),
    "pol.interest": C(r"interest(ed)? in politics|ενδιαφερ.* πολιτικ|πολιτικ.* ενδιαφερ|polintr"),
    "pol.government": C(r"government|κυβερνησ|prime minister|πρωθυπουργ"),
    "pol.issues": C(r"most important (issue|problem)|σημαντικοτερ.* προβλημ|immigra|μεταναστ|refugee|προσφυγ|european union|\beu\b|ευρωπαικ"),
    "cons.purchase": C(r"\bbuy|purchas|αγορα|αγορασ|shop|καταστημ|retail|super ?market|σουπερ"),
    "cons.price": C(r"price|τιμη|τιμεσ|cost|κοστοσ|ακριβ|discount|εκπτωσ|προσφορ"),
    "cons.brand": C(r"brand|μαρκα|επωνυμ|logo|label loyalty"),
    "cons.spending": C(r"spend|δαπαν|ξοδευ|expenditure|consum|καταναλ|save|αποταμιευ|savings"),
    "cons.digital": C(r"internet|online|διαδικτ|e-?commerce|smartphone|social media|facebook|instagram|digital|ψηφιακ"),
    "cons.media": C(r"\btv\b|television|τηλεορασ|newspaper|εφημεριδ|radio|ραδιοφων|news source|ενημερων|streaming|netflix|cinema|κινηματογρ"),
    "cons.subscription": C(r"subscri|συνδρομ"),
    "soc.social_trust": C(r"most people can be trusted|ppltrst|οι περισσοτεροι ανθρωποι|interpersonal trust"),
    "soc.values": C(r"religio|θρησκ|church|εκκλησ|tradition|παραδοσ|gender roles|homosex|ομοφυλ"),
    "soc.wellbeing": C(r"happy|ευτυχ|life satisfaction|ικανοποιημεν.* ζωη|satisfied with (your )?life|health|υγει"),
}
WEIGHT = re.compile(r"weight|wgt|βαρο|σταθμ|\bw_|^w\d*$|pspwght|anweight|^wt|_wt$")
COUNTRY_COL = re.compile(r"^(country|cntry|b_country|q_country|ctry|nation|country_name|countrycode|country_code|isocntry|iso|c_country)$|"
                         r"^imd1006_nam$|^[cde]1006_nam$|^imd1006_un$|^[cde]1006_un$|^imd1003$|country", re.I)
GREECE = re.compile(r"^(gr|grc|el|ell|greece|ελλαδα|ελλάδα|hellas|300)(\.0)?$|greece|ελλαδ", re.I)


def sha256(path, limit=None):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        while True:
            b = fh.read(1 << 20)
            if not b:
                break
            h.update(b)
    return h.hexdigest()


def classify_vars(names, labels):
    found = {k: [] for k in CONSTRUCTS}
    for n in names:
        txt = norm(str(labels.get(n) or "")) + " " + norm(str(n))
        for k, rx in CONSTRUCTS.items():
            if rx.search(txt):
                found[k].append(str(n))
    return {k: v for k, v in found.items() if v}


def greek_rows_df(df, value_labels):
    """(ελληνικές γραμμές | None, στήλη χώρας | None)."""
    import pandas as pd

    for c in df.columns:
        if not COUNTRY_COL.search(str(c)):
            continue
        s = df[c]
        vl = value_labels.get(c, {})
        vals = s.map(lambda v: str(vl.get(v, v)).strip() if v == v else "")
        nun = vals.nunique()
        if nun < 1 or nun > 400:
            continue
        g = vals.map(lambda v: bool(GREECE.search(v)))
        # Αριθμητικός κωδικός ISO 300 μόνο αν η στήλη μοιάζει με ISO-numeric (πολλές χώρες)
        if g.sum() == 0 and pd.api.types.is_numeric_dtype(s) and s.dropna().between(4, 900).all() and nun > 3:
            g = s == 300
        return int(g.sum()), str(c)
    return None, None


def stream_zip_csv(path, member):
    """Μεγάλο CSV σε zip: streaming, μετρά γραμμές και ελληνικές γραμμές (στήλη χώρας ή κωδικός μελέτης GRC)."""
    with zipfile.ZipFile(path) as z, z.open(member) as fh:
        text = io.TextIOWrapper(fh, encoding="utf-8", errors="replace", newline="")
        head = text.readline()
        sep = max(",;\t|", key=head.count)
        cols = next(csv.reader([head], delimiter=sep))
        idx = [i for i, c in enumerate(cols) if re.search(r"1006_NAM$|1004$|^IMD1003$|^[CDE]1004$", c, re.I)]
        total = gr = 0
        for row in csv.reader(text, delimiter=sep):
            total += 1
            if any(i < len(row) and (GREECE.search(row[i]) or row[i].startswith("GRC")) for i in idx):
                gr += 1
        return cols, total, gr, [cols[i] for i in idx]


def doc_files(folder):
    out = []
    for p in glob.glob(os.path.join(folder, "**", "*"), recursive=True):
        ext = os.path.splitext(p)[1].lower()
        if ext in DOC_EXT and re.search(r"codebook|questionnaire|ερωτηματολογ|κωδικολογ|variable|readme|documentation|design|english|greek", norm(os.path.basename(p))):
            out.append(os.path.relpath(p, DATA))
        if ext == ".zip" and "codebook" in p.lower():
            out.append(os.path.relpath(p, DATA))
    return sorted(set(out))[:12]


def licence_class(lic):
    t = (lic or "").lower()
    if re.search(r"cc0|cc-by|cc by|creative commons attribution|public domain|odc-by|ogl|open government", t) and "nc" not in re.sub(r"[^a-z]", " ", t).split():
        return "open_commercial_ok"
    if re.search(r"all rights reserved|research only|non-?commercial|nc|μη εμπορικ", t):
        return "research_only"
    if re.search(r"free, public dataset", t):
        return "free_public_cite"
    return "unclear"


def analyse_file(path, meta):
    ext = os.path.splitext(path)[1].lower()
    recs = []
    t0 = time.time()
    if ext == ".zip":
        with zipfile.ZipFile(path) as z:
            members = [i for i in z.infolist() if not i.is_dir() and "__MACOSX" not in i.filename]
        big = [m for m in members if os.path.splitext(m.filename)[1].lower() in (".csv", ".tab", ".tsv", ".txt") and m.file_size > 40 * 1024 * 1024]
        if big:
            for m in big:
                cols, total, gr, ccols = stream_zip_csv(path, m.filename)
                recs.append({"table": f"{os.path.basename(path)}/{m.filename}", "rows": total, "rows_greece": gr,
                             "country_col": ccols, "n_vars": len(cols), "constructs": classify_vars(cols, {}),
                             "weight_vars": [c for c in cols if WEIGHT.search(norm(c))][:8], "value_labels_share": None,
                             "respondent_level": total >= 30 and len(cols) >= 3})
            return recs
    if ext in (".rds", ".rdata"):
        try:
            import pyreadr

            res = pyreadr.read_r(path)
            tables = [(f"{os.path.basename(path)}#{k}", v, {}, {}) for k, v in res.items() if v is not None]
        except Exception as e:  # noqa: BLE001
            return [{"table": os.path.basename(path), "error": f"R read: {str(e)[:120]}"}]
    else:
        try:
            tables = read_tables(path)
        except Exception as e:  # noqa: BLE001
            return [{"table": os.path.basename(path), "error": str(e)[:160]}]
    for name, df, vl, lab in tables:
        if df is None:
            continue
        rows, ncols = int(df.shape[0]), int(df.shape[1])
        # ατομικές απαντήσεις: ≥30 γραμμές, ≥5 στήλες, και ≥40% στηλών κατηγορικές (2–12 τιμές) — όχι πίνακας ποσοστών
        catshare = 0.0
        if rows and ncols:
            sample = df.head(5000)
            cats = sum(1 for c in sample.columns if 2 <= sample[c].nunique(dropna=True) <= 12)
            catshare = cats / ncols
        resp = rows >= 30 and ncols >= 5 and catshare >= 0.25
        gr, ccol = greek_rows_df(df, vl)
        cols = [str(c) for c in df.columns]
        labs = {str(k): v for k, v in (lab or {}).items()}
        recs.append({
            "table": name, "rows": rows, "rows_greece": gr, "country_col": ccol, "n_vars": ncols,
            "categorical_share": round(catshare, 2), "respondent_level": bool(resp),
            "constructs": classify_vars(cols, labs) if resp else {},
            "weight_vars": [c for c in cols if WEIGHT.search(norm(c + " " + str(labs.get(c, ""))))][:8],
            "value_labels_share": round(len(vl) / ncols, 2) if ncols else None,
            "var_labels_share": round(sum(1 for c in cols if labs.get(c)) / ncols, 2) if ncols else None,
        })
    for r in recs:
        r["secs"] = round(time.time() - t0, 1)
    return recs


def main():
    items = []  # (group, path, meta)
    # 1. διαΝΕΟσις
    for p in sorted(glob.glob(os.path.join(DATA, "raw/dianeosis/**/*"), recursive=True)):
        if os.path.splitext(p)[1].lower() == ".sav" and "__MACOSX" not in p:
            year = int(re.search(r"/dianeosis/(\d{4})/", p).group(1))
            items.append(("dianeosis", p, {"title": "διαΝΕΟσις — Τι πιστεύουν οι Έλληνες", "year": year, "country": "GR",
                                          "licence": "© Dianeosis — All rights reserved; μη εμπορική έρευνα με αναφορά· για προϊόν απαιτείται γραπτή άδεια"}))
    # 2. CSES
    for p in sorted(glob.glob(os.path.join(DATA, "raw/political/archives/cses_*/*_csv.zip"))):
        mod = p.split("/")[-2]
        items.append(("cses", p, {"title": f"CSES {mod}", "year": None, "country": "multi",
                                 "licence": "CSES: free, public dataset (codebook); cite DOI"}))
    # 3. repos πολιτικής συλλογής
    for d in sorted(glob.glob(os.path.join(DATA, "raw/political/repos/*"))):
        mf = os.path.join(d, "manifest.json")
        m = json.load(open(mf)) if os.path.exists(mf) else {}
        for p in sorted(glob.glob(os.path.join(d, "**", "*"), recursive=True)):
            if os.path.isfile(p) and os.path.splitext(p)[1].lower() in MICRO_EXT and "/unz/" not in p:
                items.append(("political_repo", p, {"title": m.get("title"), "year": m.get("year") or m.get("collection_year"),
                                                   "country": m.get("countries") or m.get("country"),
                                                   "licence": m.get("license") or m.get("licence"), "folder": d}))
    # 4. Lake
    con = sqlite3.connect(os.path.join(DATA, "lake/lake.sqlite"))
    q = ("select f.local_path, s.source_id, s.title, s.country, s.collection_year_start, s.license, s.study_id, s.sample_size "
         "from files f join studies s using(study_id) where f.role='data' and lower(f.status)='downloaded' and f.format not like 'JSON%'")
    for lp, src, title, country, y, lic, sid, ss in con.execute(q):
        if lp and os.path.exists(lp) and os.path.splitext(lp)[1].lower() in MICRO_EXT:
            items.append(("lake_" + src, lp, {"title": title, "year": y, "country": country, "licence": lic, "study_id": sid,
                                              "folder": os.path.dirname(lp)}))
    print(f"{len(items)} αρχεία προς έλεγχο", flush=True)

    seen = {}
    out = []
    for i, (group, path, meta) in enumerate(items):
        try:
            h = sha256(path)
        except OSError as e:
            out.append({"group": group, "path": os.path.relpath(path, DATA), "error": str(e)})
            continue
        rec = {"group": group, "path": os.path.relpath(path, DATA), "sha256": h, "bytes": os.path.getsize(path), **{k: v for k, v in meta.items() if k != "folder"}}
        rec["licence_class"] = licence_class(meta.get("licence"))
        if h in seen:
            rec["duplicate_of"] = seen[h]
            out.append(rec)
            continue
        seen[h] = rec["path"]
        rec["docs"] = doc_files(meta.get("folder") or os.path.dirname(path))
        rec["tables"] = analyse_file(path, meta)
        out.append(rec)
        tr = [t for t in rec["tables"] if t.get("respondent_level")]
        print(f"[{i + 1}/{len(items)}] {group} {os.path.basename(path)[:60]}: resp_tables={len(tr)} rows={sum(t.get('rows') or 0 for t in tr)}", flush=True)

    # 5. GLOPOP-S (Level B, συνθετικό)
    gl = json.load(open(os.path.join(DATA, "raw/glopop/GRC/manifest.json"))) if os.path.exists(os.path.join(DATA, "raw/glopop/GRC/manifest.json")) else {}
    out.append({"group": "glopop", "path": "raw/glopop/GRC", "title": "GLOPOP-S Greece (synthetic population, 2015)", "level": "B_synthetic",
                "licence": "CC BY 4.0", "licence_class": "open_commercial_ok", "manifest": {k: gl.get(k) for k in list(gl)[:10]}})
    os.makedirs(os.path.join(DATA, "persona/audit"), exist_ok=True)
    def clean(o):
        if isinstance(o, str):
            return o.encode("utf-8", "replace").decode("utf-8")
        if isinstance(o, dict):
            return {clean(k): clean(v) for k, v in o.items()}
        if isinstance(o, list):
            return [clean(v) for v in o]
        return o
    out = clean(out)
    json.dump({"generatedAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "files": out},
              open(os.path.join(DATA, "persona/audit/microdata_audit.json"), "w"), ensure_ascii=False, indent=1, default=str)
    print("ok")


if __name__ == "__main__":
    main()
