#!/usr/bin/env python3
"""Interactive Decision Lab — πακετάρει ΜΟΝΟ πραγματικές εξόδους του Lab (study.json) σε data.js για την εφαρμογή.
Η εφαρμογή δεν περιέχει κανέναν τύπο που παράγει ποσοστά: εμφανίζει (α) αποτελέσματα των 82 σεναρίων όπως τα υπολόγισε ο
κινητήρας, (β) συγκεντρώσεις των 500 εγγραφών με φίλτρα, (γ) την απόφαση τεκμηρίωσης ανά ερώτηση.
    python3 -I scripts/synthetic-lab/consumer-decision/cd_lab.py <study.json> <out_dir>
"""
import json
import shutil
import sys
from pathlib import Path

S = json.load(open(sys.argv[1], encoding="utf-8"))
OUT = Path(sys.argv[2])
OUT.mkdir(parents=True, exist_ok=True)
sys.path.insert(0, str(Path(__file__).parent))
data = {k: S[k] for k in ("meta", "evidence", "ownership", "segments", "sensitivity", "choiceModel", "bridges", "grid", "consumers", "demography", "labRoutes")}
data["design"] = S["questionnaire"]["choiceDesign"]
names = {}
for s in S["segments"]["segments"]:
    o = s["ownership"]
    pc, ac, dw, old = o["Υπολογιστής"], o["Κλιματιστικό"], o["Πλυντήριο πιάτων"], s["age"]["65+"]
    names[s["segment"]] = ("Πλήρως εξοπλισμένα νοικοκυριά" if pc >= 80 and ac >= 80 and dw >= 50 else "Ψηφιακά νοικοκυριά με κλιματισμό" if pc >= 80 and ac >= 80
                           else "Ψηφιακά νοικοκυριά χωρίς κλιματισμό" if pc >= 80 and ac < 20 else ("Ώριμα νοικοκυριά με κλιματισμό" if old >= 40 else "Με κλιματισμό, χωρίς υπολογιστή")
                           if pc < 20 and ac >= 80 else "Νοικοκυριά βασικού εξοπλισμού")
data["segmentNames"] = names
(OUT / "data.js").write_text("window.LAB_DATA = " + json.dumps(data, ensure_ascii=False, default=float) + ";\n", encoding="utf-8")
src = Path(__file__).parent / "lab"
for f in ("index.html", "app.js", "app.css"):
    shutil.copy(src / f, OUT / f)
print("OK", OUT)
