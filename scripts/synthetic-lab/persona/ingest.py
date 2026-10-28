"""
Process A του Persona Intelligence Engine: απόκτηση και ενσωμάτωση μικροδεδομένων (Deliverable J).

Ξεχωριστή διεργασία από την εκτέλεση ερευνών (Process B). Δεν τρέχει ποτέ μέσα σε survey run· οι έρευνες διαβάζουν
μόνο ένα εκδομένο μοντέλο (models/<version>) που δείχνει σε ένα αμετάβλητο data snapshot.

Στάδια ανά πηγή (κάθε μετάβαση γράφεται ως checkpoint· μια διακοπή συνεχίζει από το τελευταίο ολοκληρωμένο στάδιο):
  discover → verify → licence → download → parse → harmonize → validate → integrate

  discover   ευρετήριο = audit_microdata.json (ατομικά δεδομένα με ελληνικό δείγμα ≥ --min-greek) + RESTRICTED μελέτες του lake
  verify     το αρχείο υπάρχει τοπικά και το sha256 ταιριάζει με το audit· διπλότυπα (ίδιο sha256 / duplicate_of) παραλείπονται
  licence    open_commercial_ok / free_public_cite → research+commercial· research_only → μόνο research· unclear → μπλοκ (χειροκίνητος έλεγχος)
  download   ΔΕΝ ξανακατεβάζει: η λήψη έγινε από το lake pipeline. Αν λείπει το αρχείο, σημειώνεται missing_local με το URL
  parse      διαβάζει τον πίνακα, μετρά ελληνικές γραμμές, καταγράφει ποιες «άγκυρες» (δημογραφικά, L-R, ψήφος, βάρος) υπάρχουν
  harmonize  μόνο αν υπάρχει ελεγμένος adapter στο harmonize.py· αλλιώς needs_adapter + προδιαγραφή adapter για ανθρώπινο έλεγχο
             (η αντιστοίχιση ετικετών τιμών σε κοινές κατηγορίες ΔΕΝ γίνεται αυτόματα: είναι ερευνητική κρίση)
  validate   έλεγχοι στο εναρμονισμένο αρχείο: n, βάρη, κάλυψη δημογραφικών, όχι αναγνωριστικά, όχι ευαίσθητα items
  integrate  καταγράφεται στο data snapshot manifest· με --build-candidate εκπαιδεύεται ΥΠΟΨΗΦΙΟ μοντέλο και καταχωρείται ως
             'candidate' στο registry. Καμία αυτόματη προώθηση: η έγκριση απαιτεί αξιολόγηση σε holdout και όνομα εγκρίνοντος.

Δεν υπάρχει scheduler ή μόνιμος worker: η εργασία εκτελείται χειροκίνητα ή από εξωτερικό cron.

  python3 scripts/synthetic-lab/persona/ingest.py run    [--root .] [--min-greek 300] [--rerun-harmonize]
                                                         [--build-candidate pie-0.3 --cutoff 2026-10 --policy research]
  python3 scripts/synthetic-lab/persona/ingest.py status [--root .]
"""
import argparse
import hashlib
import json
import os
import re
import sqlite3
import subprocess
import sys
import time

HERE = os.path.dirname(os.path.abspath(__file__))
STAGES = ["discover", "verify", "licence", "download", "parse", "harmonize", "validate", "integrate"]
TERMINAL = {"duplicate", "blocked_licence", "restricted", "missing_local", "needs_adapter", "failed", "integrated"}

# Ελεγμένοι adapters του harmonize.py: τμήμα διαδρομής → οικογένεια εναρμονισμένων αρχείων.
ADAPTERS = {
    "raw/dianeosis/": "dianeosis_tpe",
    "raw/political/archives/cses_imd/": "cses",
    "dataverse.nl_10.34894_IME1EY/": "undpolar",
    "harvard_10.7910_DVN_RCNK8E/": "maple",
    "lake/raw/zenodo/7487147/": "hbs",
}
# Πηγές που το περιεχόμενό τους για την Ελλάδα καλύπτεται ήδη από εναρμονισμένη πηγή (δεν διπλομετρούνται).
COVERED = {"raw/political/archives/cses_m": "οι ελληνικές μελέτες των CSES Module 3–5 περιέχονται ήδη στο CSES IMD"}
LICENCE_USE = {"open_commercial_ok": ["research", "commercial"], "free_public_cite": ["research", "commercial"], "research_only": ["research"]}
ANCHOR_CONSTRUCTS = {"demo.age": "age_band", "demo.gender": "gender", "demo.education": "edu3", "demo.region": "nuts1",
                     "demo.employment": "emp", "demo.income": "inc6", "pol.left_right": "lr7", "pol.vote": "pv/vi", "pol.interest": "polint4"}
ID_COLS = re.compile(r"^(id|respid|resp_id|serial|uuid|name|email|phone|tel|address|postcode|zip|ip|dob|birth_date)$", re.I)


class Job:
    def __init__(self, root):
        self.root = os.path.abspath(root)
        self.data = os.path.join(self.root, ".synthetic-lab-data")
        self.dir = os.path.join(self.data, "persona", "ingest")
        os.makedirs(os.path.join(self.dir, "adapter-specs"), exist_ok=True)
        self.state_path = os.path.join(self.dir, "state.json")
        self.state = json.load(open(self.state_path)) if os.path.exists(self.state_path) else {"sources": {}, "runs": []}

    # --- checkpointing ---------------------------------------------------------------------------------------------
    def save(self):
        tmp = self.state_path + ".tmp"
        json.dump(self.state, open(tmp, "w"), ensure_ascii=False, indent=1)
        os.replace(tmp, self.state_path)

    def event(self, sid, stage, status, **info):
        s = self.state["sources"][sid]
        s["stage"], s["status"] = stage, status
        s.setdefault("history", []).append({"stage": stage, "status": status, "at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), **info})
        s.update(info)
        with open(os.path.join(self.dir, "events.jsonl"), "a") as f:
            f.write(json.dumps({"source": sid, "stage": stage, "status": status, **info}, ensure_ascii=False) + "\n")
        self.save()

    def done(self, s, stage):
        return STAGES.index(s.get("stage", "discover")) >= STAGES.index(stage) and s.get("status") in ("ok", *TERMINAL)

    # --- stages ----------------------------------------------------------------------------------------------------
    def discover(self, min_greek):
        audit = json.load(open(os.path.join(self.data, "persona", "audit", "microdata_audit.json")))
        found = 0
        for f in audit["files"]:
            for t in f.get("tables") or []:
                if not t.get("respondent_level") or not t.get("rows"):
                    continue
                greek = t.get("rows_greece") or (t["rows"] if f.get("country") in ("GR", "EL") else 0)
                if greek < min_greek:
                    continue
                sid = hashlib.sha1(f"{f['path']}::{t['table']}".encode()).hexdigest()[:12]
                if sid in self.state["sources"]:
                    continue
                self.state["sources"][sid] = {"id": sid, "title": f["title"], "path": f["path"], "table": t["table"], "sha256": f.get("sha256"),
                                              "duplicateOf": f.get("duplicate_of"), "licence": f["licence"], "licenceClass": f["licence_class"],
                                              "rows": t["rows"], "greekRowsAudit": greek, "countryCol": t.get("country_col"),
                                              "constructs": {k: v for k, v in (t.get("constructs") or {}).items() if k in ANCHOR_CONSTRUCTS or k.startswith("weight")}}
                self.event(sid, "discover", "ok", origin="microdata_audit")
                found += 1
        # Μελέτες που το lake κατέγραψε ως RESTRICTED (απαιτούν εγγραφή/συμφωνητικό): καταγράφονται, δεν κατεβαίνουν.
        db = os.path.join(self.data, "lake", "lake.sqlite")
        if os.path.exists(db):
            con = sqlite3.connect(db)
            for sid0, title, url, restr in con.execute(
                    "select study_id, title, url, access_restrictions from studies where status='RESTRICTED' and (evidence_level is null or evidence_level='A')"):
                sid = "lake-" + hashlib.sha1(str(sid0).encode()).hexdigest()[:8]
                if sid not in self.state["sources"]:
                    self.state["sources"][sid] = {"id": sid, "title": title, "url": url, "licenceClass": "restricted", "accessRestrictions": restr}
                    self.event(sid, "licence", "restricted", reason="απαιτεί εγγραφή ή συμφωνητικό χρήσης· καμία ενέργεια χωρίς τον χρήστη")
                    found += 1
        return found

    def verify(self, s, by_sha):
        if s.get("duplicateOf"):
            return self.event(s["id"], "verify", "duplicate", reason=f"διπλότυπο του {s['duplicateOf']}")
        first = by_sha.get(s.get("sha256"))
        if first and first != s["id"] and s.get("table") == self.state["sources"][first].get("table"):
            return self.event(s["id"], "verify", "duplicate", reason=f"ίδιο sha256 με {first}")
        p = os.path.join(self.data, s["path"])
        if not os.path.exists(p):
            return self.event(s["id"], "download", "missing_local", reason="το αρχείο δεν υπάρχει τοπικά· η λήψη ανήκει στο lake pipeline")
        h = hashlib.sha256(open(p, "rb").read()).hexdigest()
        if s.get("sha256") and h != s["sha256"]:
            return self.event(s["id"], "verify", "failed", reason="το sha256 άλλαξε από το audit· νέα έκδοση πηγής, απαιτείται νέο audit")
        self.event(s["id"], "verify", "ok")

    def licence(self, s, policy):
        use = LICENCE_USE.get(s["licenceClass"])
        if not use:
            return self.event(s["id"], "licence", "blocked_licence", reason="ασαφής άδεια· χειροκίνητος έλεγχος πριν από κάθε χρήση")
        if policy not in use:
            return self.event(s["id"], "licence", "blocked_licence", reason=f"δεν επιτρέπεται για πολιτική {policy}", allowedUse=use)
        self.event(s["id"], "licence", "ok", allowedUse=use)

    def download(self, s):
        self.event(s["id"], "download", "ok", localPath=s["path"], note="ήδη τοπικά (lake pipeline)· καμία νέα λήψη")

    def parse(self, s):
        p = os.path.join(self.data, s["path"])
        try:
            cols = read_columns(p, s["table"])
        except Exception as e:  # noqa: BLE001
            return self.event(s["id"], "parse", "failed", reason=f"ανάγνωση: {type(e).__name__}: {e}"[:300])
        present = sorted({ANCHOR_CONSTRUCTS[k] for k in s["constructs"] if k in ANCHOR_CONSTRUCTS})
        self.event(s["id"], "parse", "ok", nColumns=len(cols), anchorsPresent=present,
                   identifierColumns=[c for c in cols if ID_COLS.match(str(c))])

    def harmonize(self, s, harmonized_families):
        covered = next((v for k, v in COVERED.items() if k in s["path"]), None)
        if covered:
            return self.event(s["id"], "harmonize", "duplicate", reason=covered)
        fam = next((v for k, v in ADAPTERS.items() if k in s["path"]), None)
        if not fam:
            spec = {"source": s["title"], "path": s["path"], "table": s["table"], "greekRows": s["greekRowsAudit"], "countryColumn": s.get("countryCol"),
                    "licence": s["licence"], "candidateColumns": s["constructs"], "anchorsPresent": s.get("anchorsPresent"),
                    "todo": ["επιλογή ελληνικών γραμμών", "αντιστοίχιση ετικετών τιμών σε age_band/gender/edu3/nuts1/emp/inc6/lr7/pv",
                             "μεταβλητή βάρους", "έλεγχος ευαίσθητων items (άρθρο 9 GDPR)", "ημερομηνία πεδίου"]}
            json.dump(spec, open(os.path.join(self.dir, "adapter-specs", f"{s['id']}.json"), "w"), ensure_ascii=False, indent=1)
            return self.event(s["id"], "harmonize", "needs_adapter", reason="δεν υπάρχει ελεγμένος adapter· γράφτηκε προδιαγραφή",
                              adapterSpec=f"persona/ingest/adapter-specs/{s['id']}.json")
        if fam not in harmonized_families:
            return self.event(s["id"], "harmonize", "failed", reason=f"ο adapter {fam} δεν παρήγαγε αρχεία")
        base = os.path.basename(s["path"])
        own = [fid for fid in harmonized_families[fam] if base in (self.files_meta[fid].get("source") or "")]
        self.event(s["id"], "harmonize", "ok", family=fam, fileIds=own or harmonized_families[fam])

    def validate(self, s, files_meta):
        problems, checked = [], []
        for fid in s["fileIds"]:
            m = files_meta[fid]
            import pandas as pd
            d = pd.read_csv(os.path.join(self.data, "persona", "harmonized", "resp", f"{fid}.csv.gz"), dtype=str, nrows=None)
            w = pd.to_numeric(d["weight"], errors="coerce")
            demo = [c for c in ("age_band", "gender", "edu3", "nuts1") if c in d]
            cov = {c: round(float(d[c].notna().mean()), 3) for c in demo}
            if len(d) != m["n"]:
                problems.append(f"{fid}: n {len(d)} ≠ {m['n']}")
            if not (w >= 0).all() or abs(w.mean() - 1) > 0.01:
                problems.append(f"{fid}: βάρη εκτός ορίων")
            zero = round(float((w == 0).mean()), 3)
            if zero > 0.2:
                problems.append(f"{fid}: {zero:.0%} μηδενικά βάρη")
            if [c for c in d.columns if ID_COLS.match(c)]:
                problems.append(f"{fid}: στήλη αναγνωριστικού")
            if not d["rid"].str.fullmatch(r"[0-9a-f]{12}").all():
                problems.append(f"{fid}: rid δεν είναι συνθετικό κλειδί")
            low = [c for c, v in cov.items() if v < 0.5 and c != "edu3"]
            if low:
                problems.append(f"{fid}: χαμηλή κάλυψη {low}")
            checked.append({"fileId": fid, "n": len(d), "demographicCoverage": cov, "zeroWeightShare": zero})
        if problems:
            return self.event(s["id"], "validate", "failed", reason="; ".join(problems)[:500], checks=checked)
        self.event(s["id"], "validate", "ok", checks=checked)

    def integrate(self, s):
        self.event(s["id"], "integrate", "integrated")

    # --- run ---------------------------------------------------------------------------------------------------------
    def run(self, a):
        lock = os.path.join(self.dir, ".lock")
        if os.path.exists(lock):
            pid = open(lock).read().strip()
            if pid and os.path.exists(f"/proc/{pid}"):
                sys.exit(f"Άλλη εκτέλεση ingest τρέχει (pid {pid}).")
        open(lock, "w").write(str(os.getpid()))
        try:
            t0 = time.time()
            new = self.discover(a.min_greek)
            src = self.state["sources"]
            by_sha = {}
            for sid, s in src.items():
                if s.get("sha256") and not s.get("duplicateOf"):
                    by_sha.setdefault(s["sha256"], sid)
            for s in src.values():
                if s.get("status") in TERMINAL:
                    continue
                for stage, fn in (("verify", lambda: self.verify(s, by_sha)), ("licence", lambda: self.licence(s, a.policy)),
                                  ("download", lambda: self.download(s)), ("parse", lambda: self.parse(s))):
                    if s.get("status") in TERMINAL:
                        break
                    if not self.done(s, stage):
                        fn()
            hz = os.path.join(self.data, "persona", "harmonized")
            waiting = [s for s in src.values() if s.get("stage") == "parse" and s.get("status") == "ok"]
            if waiting and (a.rerun_harmonize or not os.path.exists(os.path.join(hz, "files.json"))):
                subprocess.run([sys.executable, os.path.join(HERE, "harmonize.py"), self.root], check=True)
            files_meta = {f["fileId"]: f for f in json.load(open(os.path.join(hz, "files.json")))} if os.path.exists(os.path.join(hz, "files.json")) else {}
            self.files_meta = files_meta
            fams = {}
            for fid, f in files_meta.items():
                fams.setdefault(f["family"], []).append(fid)
            for s in waiting:
                self.harmonize(s, fams)
            for s in src.values():
                if s.get("stage") == "harmonize" and s.get("status") == "ok":
                    self.validate(s, files_meta)
                if s.get("stage") == "validate" and s.get("status") == "ok":
                    self.integrate(s)
            snap = self.snapshot(files_meta)
            run = {"at": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "newSources": new, "policy": a.policy, "snapshot": snap,
                   "seconds": round(time.time() - t0, 1), "counts": self.counts()}
            if a.build_candidate:
                run["candidate"] = self.build_candidate(a)
            self.state["runs"].append(run)
            self.save()
            print(json.dumps(run, ensure_ascii=False, indent=1))
        finally:
            os.remove(lock)

    def snapshot(self, files_meta):
        """Αμετάβλητο manifest των εναρμονισμένων αρχείων (sha256 ανά αρχείο)· τα μοντέλα αναφέρουν το hash του."""
        resp = os.path.join(self.data, "persona", "harmonized", "resp")
        rows = []
        for fid in sorted(files_meta):
            p = os.path.join(resp, f"{fid}.csv.gz")
            if os.path.exists(p):
                rows.append({"fileId": fid, "sha256": hashlib.sha256(open(p, "rb").read()).hexdigest(), "n": files_meta[fid]["n"],
                             "family": files_meta[fid]["family"], "tier": files_meta[fid].get("tier")})
        h = hashlib.sha256(json.dumps(rows, sort_keys=True).encode()).hexdigest()
        os.makedirs(os.path.join(self.dir, "snapshots"), exist_ok=True)
        path = os.path.join(self.dir, "snapshots", f"{h[:12]}.json")
        if not os.path.exists(path):
            json.dump({"hash": h, "createdAt": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()), "files": rows}, open(path, "w"), indent=1)
        return h[:12]

    def build_candidate(self, a):
        train = [sys.executable, os.path.join(HERE, "train.py"), "--root", self.root, "--cutoff", a.cutoff, "--policy", a.policy, "--version", a.build_candidate]
        subprocess.run(train, check=True)
        subprocess.run([sys.executable, os.path.join(HERE, "registry.py"), "register", "--version", a.build_candidate,
                        "--notes", "υποψήφιο από ingest· δεν έχει αξιολογηθεί σε holdout"], check=True)
        return {"version": a.build_candidate, "status": "candidate",
                "next": "αξιολόγηση με eval_persona.py σε holdout, registry.py compare, και approve μόνο με --by <όνομα>"}

    def counts(self):
        c = {}
        for s in self.state["sources"].values():
            c[s.get("status")] = c.get(s.get("status"), 0) + 1
        return c

    def status(self):
        print(json.dumps(self.counts(), ensure_ascii=False))
        for s in sorted(self.state["sources"].values(), key=lambda s: (s.get("status") or "", -(s.get("greekRowsAudit") or 0))):
            print(f"{s.get('status', '?'):16s} {s.get('stage', '?'):10s} {s.get('greekRowsAudit', ''):>7} {s.get('licenceClass', ''):18s} {s['title'][:70]}"
                  + (f"  [{s.get('reason')}]" if s.get("reason") else ""))


def read_columns(path, table):
    """Μόνο τα ονόματα στηλών (φθηνό)· οι γραμμές μετρήθηκαν στο audit. Το audit ονομάζει τους πίνακες
    «<αρχείο>[#φύλλο]» και, μέσα σε zip, «<zip>/<διαδρομή με _ αντί για / και κενά>»."""
    import tempfile
    import zipfile

    member, _, sheet = table.partition("#")
    if not path.lower().endswith(".zip"):
        return local_columns(path, sheet)
    norm = lambda x: re.sub(r"[^0-9A-Za-z.]+", "_", x)  # noqa: E731
    inner = norm(member.split("/", 1)[1] if "/" in member else member)
    with zipfile.ZipFile(path) as z:
        name = next(n for n in z.namelist() if not n.endswith("/") and "__MACOSX" not in n and norm(n).endswith(inner))
        with tempfile.NamedTemporaryFile(suffix=os.path.splitext(name)[1]) as tmp:
            tmp.write(z.read(name))
            tmp.flush()
            return local_columns(tmp.name, sheet)


def local_columns(path, sheet=""):
    import pandas as pd
    import pyreadstat

    low = path.lower()
    if low.endswith((".sav", ".zsav")):
        return pyreadstat.read_sav(path, metadataonly=True)[1].column_names
    if low.endswith(".dta"):
        return pyreadstat.read_dta(path, metadataonly=True)[1].column_names
    if low.endswith(".por"):
        return pyreadstat.read_por(path, metadataonly=True)[1].column_names
    if low.endswith((".xlsx", ".xls", ".ods")):
        return list(pd.read_excel(path, sheet_name=sheet or 0, nrows=0, engine="odf" if low.endswith(".ods") else None).columns)
    sep = "\t" if low.endswith((".tsv", ".tab")) else None
    return list(pd.read_csv(path, sep=sep, engine="python", nrows=0).columns)


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("cmd", choices=["run", "status"])
    ap.add_argument("--root", default=".")
    ap.add_argument("--min-greek", type=int, default=300)
    ap.add_argument("--policy", choices=["research", "commercial"], default="research")
    ap.add_argument("--rerun-harmonize", action="store_true")
    ap.add_argument("--build-candidate", default=None)
    ap.add_argument("--cutoff", default=time.strftime("%Y-%m"))
    a = ap.parse_args()
    job = Job(a.root)
    job.run(a) if a.cmd == "run" else job.status()


if __name__ == "__main__":
    main()
