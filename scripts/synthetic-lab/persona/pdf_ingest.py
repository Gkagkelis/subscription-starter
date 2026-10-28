"""
Ανάγνωση δημοσιευμένων ερευνών σε PDF (sprint 10/2026). Τα αποτελέσματα είναι ΣΥΓΚΕΝΤΡΩΤΙΚΑ (Level B), ποτέ «ερωτώμενοι».

  python3 scripts/synthetic-lab/persona/pdf_ingest.py index      # ευρετήριο σελίδων + θεματική ταξινόμηση (επανεκκινήσιμο)
  python3 scripts/synthetic-lab/persona/pdf_ingest.py text       # αυτόματη εξαγωγή απλών ερωτήσεων (ετικέτα + τιμή στην ίδια γραμμή)
  python3 scripts/synthetic-lab/persona/pdf_ingest.py render     # PNG για τις σελίδες που χρειάζονται οπτική ανάγνωση (διασταυρώσεις/μετακινήσεις)
  python3 scripts/synthetic-lab/persona/pdf_ingest.py validate   # έλεγχοι: αθροίσματα, αριθμοί που υπάρχουν στο κείμενο της σελίδας, διαμερίσματα
  python3 scripts/synthetic-lab/persona/pdf_ingest.py status

Έλεγχοι εγκυρότητας (κάθε πίνακας):
  - άθροισμα 100 ± 2,5 για μονή επιλογή (ή δηλωμένη πολλαπλή απάντηση)·
  - ΚΑΘΕ αριθμός που καταγράφηκε υπάρχει αυτούσιος στο κείμενο της ίδιας σελίδας (όπου υπάρχει text layer) — προστασία από επινοημένες τιμές·
  - ημερομηνία πεδίου από το manifest/κείμενο· χωρίς ημερομηνία → εκτός calibration/αξιολόγησης.
Διαμερίσματα (προκαταχώριση §2): ≤ 2026-04-30 calibration · 2026-05-01..07-31 validation · ≥ 2026-08-01 final.
"""
import hashlib
import json
import os
import re
import subprocess
import sys
import time

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "..", ".."))
RAW = os.path.join(ROOT, ".synthetic-lab-data", "raw", "sprint")
OUT = os.path.join(ROOT, ".synthetic-lab-data", "persona", "pdf")
MANIFESTS = [("polls", os.path.join(RAW, "polls_pdf")), ("consumer", os.path.join(RAW, "consumer_pdf"))]

TOPICS = [
    ("vote_intention", r"πρόθεση ψήφου|ΠΡΟΘΕΣΗ ΨΗΦΟΥ|εκτίμηση (ψήφου|εκλογικής)|ΕΚΤΙΜΗΣΗ (ΨΗΦΟΥ|ΕΚΛΟΓΙΚΗΣ)|ποιο κόμμα θα ψηφίζατε"),
    ("vote_flows", r"μετακινήσ|ΜΕΤΑΚΙΝΗΣ|συσπείρωσ|ΣΥΣΠΕΙΡΩΣ|δεξαμεν|ΔΕΞΑΜΕΝ|(ψήφ|ΨΗΦ)\w* (στις )?(εκλογές )?(του )?(Ιουνίου )?2023|ΨΗΦΟΦΟΡΟΙ .{0,30}2023"),
    ("second_choice", r"δεύτερη (επιλογή|προτίμηση)|ΔΕΥΤΕΡΗ (ΕΠΙΛΟΓΗ|ΠΡΟΤΙΜΗΣΗ)"),
    ("certainty", r"βεβαιότητα|σιγουρ\w+ .{0,20}(επιλογή|ψήφο)|οριστικ\w+ .{0,10}απόφαση"),
    ("turnout", r"(πιθανό|πιθανότητα) .{0,30}(ψηφίσετε|συμμετάσχετε|προσέλθετε)"),
    ("government", r"κυβέρνησ|ΚΥΒΕΡΝΗΣ|κυβερνητικ"),
    ("opposition", r"αντιπολίτευσ|ΑΝΤΙΠΟΛΙΤΕΥΣ"),
    ("problems", r"(σημαντικότερ|μεγαλύτερ|σοβαρότερ)\w* (πρόβλημ|ζήτημ)|ΠΡΟΒΛΗΜΑ"),
    ("direction", r"σωστή .{0,20}(λάθος|λανθασμένη) κατεύθυνση|ΚΑΤΕΥΘΥΝΣΗ"),
    ("economy", r"οικονομ\w+ κατάσταση|ΟΙΚΟΝΟΜΙΚ\w+ ΚΑΤΑΣΤΑΣΗ|οικονομία|νοικοκυρι"),
    ("trust", r"εμπιστ|ΕΜΠΙΣΤ"),
    ("leaders", r"καταλληλότερ|ΚΑΤΑΛΛΗΛΟΤΕΡ|πρωθυπουργ|θετική γνώμη|αξιολόγηση (των )?(πολιτικών )?αρχηγ"),
    ("left_right", r"αριστερ\w+ .{0,40}δεξι|ΑΡΙΣΤΕΡ\w+ .{0,40}ΔΕΞΙ|αυτοτοποθέτησ"),
    ("consumer", r"συνδρομ|streaming|Netflix|πλατφόρμ|μάρκα|brand|ικανοποίησ\w* .{0,20}(υπηρεσ|προϊόν)|αγορ(ά|ές)|καταναλωτ"),
]
DEMO_HDR = r"(ΦΥΛΟ|Φύλο|ΗΛΙΚΙΑ|Ηλικία|17-24|18-24|25-34|65\+|ΑΝΔΡ|ΓΥΝΑΙΚ|Άνδρ|Γυναίκ|ΠΕΡΙΦΕΡΕΙΑ|Περιφέρεια|ΜΟΡΦΩΣ|Μόρφωσ|Αττική|ΑΤΤΙΚΗ)"
NUM = re.compile(r"(?<![\d/])(\d{1,3}(?:[.,]\d)?)\s?%?(?![\d/])")


def ym(s):
    return int(s[:4]) * 12 + int(s[5:7])


def partition(date):
    if not date:
        return "undated"
    if date <= "2026-04-30":
        return "calibration"
    if date <= "2026-07-31":
        return "validation"
    return "final"


def load_manifests():
    docs = []
    for kind, d in MANIFESTS:
        mf = os.path.join(d, "manifest.jsonl")
        if not os.path.exists(mf):
            continue
        for line in open(mf):
            try:
                m = json.loads(line)
            except json.JSONDecodeError:
                continue
            p = os.path.join(d, m["file"])
            if not os.path.exists(p) or not p.lower().endswith(".pdf"):
                continue
            date = m.get("fieldwork_end") or m.get("published")
            docs.append({"docId": hashlib.sha1(m["sha256"].encode()).hexdigest()[:12], "kind": kind, "path": p, "sha256": m["sha256"],
                         "org": m.get("pollster") or m.get("organisation"), "client": m.get("client"), "title": m.get("title"), "date": date,
                         "fieldwork_start": m.get("fieldwork_start"), "fieldwork_end": m.get("fieldwork_end"), "n": m.get("n"), "method": m.get("method"),
                         "url": m.get("url"), "partition": partition(date)})
    # διπλότυπα: ίδιο sha256 ή ίδια εταιρεία + ίδιο πεδίο (ίδια έρευνα σε άλλο site)
    seen, out = set(), []
    for d in docs:
        k1, k2 = d["sha256"], (d["org"], d["fieldwork_start"], d["fieldwork_end"], d["title"])
        if k1 in seen or (d["fieldwork_end"] and k2 in seen):
            continue
        seen |= {k1, k2}
        out.append(d)
    return out


def page_texts(path):
    t = subprocess.run(["pdftotext", "-layout", path, "-"], capture_output=True, text=True).stdout
    return t.split("\f")


def cmd_index():
    os.makedirs(OUT, exist_ok=True)
    idx_path = os.path.join(OUT, "pages.jsonl")
    done = set()
    if os.path.exists(idx_path):
        for line in open(idx_path):
            done.add(json.loads(line)["docId"])
    docs = load_manifests()
    json.dump(docs, open(os.path.join(OUT, "documents.json"), "w"), ensure_ascii=False, indent=1)
    n_new = 0
    with open(idx_path, "a") as f:
        for d in docs:
            if d["docId"] in done:
                continue
            for i, p in enumerate(page_texts(d["path"])):
                if not p.strip():
                    continue
                topics = [k for k, rx in TOPICS if re.search(rx, p)]
                nums = NUM.findall(p)
                f.write(json.dumps({"docId": d["docId"], "page": i + 1, "topics": topics, "nNumbers": len(nums),
                                    "demoHeader": bool(re.search(DEMO_HDR, p)), "chars": len(p.strip()),
                                    "textHash": hashlib.sha1(p.encode()).hexdigest()[:12]}, ensure_ascii=False) + "\n")
            n_new += 1
    print(f"documents {len(docs)} · new indexed {n_new}")


QUESTION = re.compile(r"^\s*(.{12,220}\?)\s*$")
ROW = re.compile(r"^\s*([^\d%]{2,70}?)\s{2,}(\d{1,3}(?:[.,]\d)?)\s?%?\s*$")


def extract_simple(page_text):
    """Ερώτηση (γραμμή που λήγει σε «;»/«?») + γραμμές «ετικέτα    τιμή». Μεμονωμένες τιμές (υποσύνολα) αγνοούνται."""
    lines = [l for l in page_text.splitlines() if l.strip()]
    out = []
    cur = None
    for l in lines:
        q = QUESTION.match(l.replace(";", "?")) if (l.strip().endswith(";") or l.strip().endswith("?")) else None
        if q and not ROW.match(l):
            if cur and len(cur["rows"]) >= 2:
                out.append(cur)
            cur = {"question": q.group(1).strip().rstrip("?") + ";", "rows": []}
            continue
        m = ROW.match(l)
        if cur is not None and m:
            label = re.sub(r"\s+", " ", m.group(1)).strip(" .:-–")
            if re.search(r"[A-Za-zΑ-Ωα-ωΆ-Ώά-ώ]", label):
                cur["rows"].append({"label": label, "value": float(m.group(2).replace(",", "."))})
    if cur and len(cur["rows"]) >= 2:
        out.append(cur)
    return out


def check_table(tbl, page_text):
    vals = [r["value"] for r in tbl["rows"]]
    s = sum(vals)
    page_nums = set(x.replace(",", ".") for x in NUM.findall(page_text))
    in_text = all(str(v).rstrip("0").rstrip(".") in {p.rstrip("0").rstrip(".") if "." in p else p for p in page_nums} or f"{v:g}" in page_nums for v in vals)
    multi = bool(re.search(r"(έως|μέχρι) (δύο|τρεις|2|3)|πολλαπλ", tbl["question"]))
    sum_ok = abs(s - 100) <= 2.5 or (multi and s > 100)
    return {"sum": round(s, 1), "sumOk": sum_ok, "numbersInText": in_text, "multi": multi,
            "confidence": "high" if (sum_ok and in_text) else "low"}


def cmd_text():
    docs = {d["docId"]: d for d in json.load(open(os.path.join(OUT, "documents.json")))}
    out_path = os.path.join(OUT, "tables_text.jsonl")
    done = set()
    if os.path.exists(out_path):
        for line in open(out_path):
            done.add(json.loads(line)["docId"])
    n_t = n_hi = 0
    with open(out_path, "a") as f:
        for did, d in docs.items():
            if did in done:
                continue
            for i, p in enumerate(page_texts(d["path"])):
                for tbl in extract_simple(p):
                    chk = check_table(tbl, p)
                    rec = {"docId": did, "page": i + 1, "org": d["org"], "date": d["date"], "partition": d["partition"], "kind": d["kind"],
                           "question": tbl["question"], "rows": tbl["rows"], "group": "Σύνολο", "method": "text", **chk}
                    f.write(json.dumps(rec, ensure_ascii=False) + "\n")
                    n_t += 1
                    n_hi += chk["confidence"] == "high"
            f.write(json.dumps({"docId": did, "page": None, "marker": "done"}) + "\n")
    print(f"tables {n_t} · high confidence {n_hi}")


def cmd_render(max_pages=400):
    docs = {d["docId"]: d for d in json.load(open(os.path.join(OUT, "documents.json")))}
    pages = [json.loads(l) for l in open(os.path.join(OUT, "pages.jsonl"))]
    want = [p for p in pages if docs.get(p["docId"]) and docs[p["docId"]]["kind"] == "polls" and docs[p["docId"]]["partition"] != "undated"
            and ("vote_flows" in p["topics"] or ("vote_intention" in p["topics"] and p["demoHeader"]))]
    os.makedirs(os.path.join(OUT, "png"), exist_ok=True)
    n = 0
    for p in want[:max_pages]:
        png = os.path.join(OUT, "png", f"{p['docId']}_p{p['page']:03d}")
        if os.path.exists(png + ".png"):
            continue
        subprocess.run(["pdftoppm", "-r", "100", "-png", "-singlefile", "-f", str(p["page"]), "-l", str(p["page"]), docs[p["docId"]]["path"], png], check=False)
        n += 1
    json.dump(want[:max_pages], open(os.path.join(OUT, "render_queue.json"), "w"), ensure_ascii=False, indent=0)
    print(f"pages for visual extraction {len(want)} · rendered now {n}")


def cmd_status():
    for name in ("documents.json", "pages.jsonl", "tables_text.jsonl", "render_queue.json", "tables_visual.jsonl"):
        p = os.path.join(OUT, name)
        if os.path.exists(p):
            n = len(json.load(open(p))) if name.endswith(".json") else sum(1 for _ in open(p))
            print(f"{name:22s} {n}")


if __name__ == "__main__":
    {"index": cmd_index, "text": cmd_text, "render": cmd_render, "status": cmd_status}[sys.argv[1]]()
