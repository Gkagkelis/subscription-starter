#!/usr/bin/env python3
"""Consumer Decision Study — κατασκευή ερωτηματολογίου (Question[] του Lab) και σχεδιασμού 6 πειραμάτων επιλογής.

Ο σχεδιασμός των πειραμάτων είναι ντετερμινιστικός (σπόρος), ισορροπημένος σε επίπεδα και χωρίς κυριαρχία:
καμία προσφορά δεν είναι καλύτερη ή ίση σε ΟΛΑ τα χαρακτηριστικά. Δεν περιέχει κανένα ποσοστό ή αποτέλεσμα.
    python3 -I scripts/synthetic-lab/consumer-decision/cd_design.py <out_dir>
"""
import itertools
import json
import random
import sys
from collections import Counter
from pathlib import Path

OUT = Path(sys.argv[1])
OUT.mkdir(parents=True, exist_ok=True)

IMP5 = ["Καθόλου σημαντικό", "Λίγο σημαντικό", "Μέτρια σημαντικό", "Πολύ σημαντικό", "Εξαιρετικά σημαντικό"]
INF5 = ["Καθόλου", "Λίγο", "Μέτρια", "Πολύ", "Πάρα πολύ"]
LIK4 = ["Πολύ πιθανό", "Μάλλον πιθανό", "Μάλλον απίθανο", "Πολύ απίθανο"]
REPAIR = ["Επισκευή", "Αγορά νέου", "Αναβολή απόφασης", "Άλλο"]
WM = "Το πλυντήριο ρούχων σας, ηλικίας 7 ετών, παρουσιάζει βλάβη."
PHONE = "Νέο smartphone στα 599€ έναντι πιστοποιημένου refurbished smartphone αντίστοιχων χαρακτηριστικών"
TI_BASE = ["Σίγουρα ναι", "Μάλλον ναι", "Μάλλον όχι", "Σίγουρα όχι"]

Q = []


def add(**k):
    Q.append(k)


# Α — αγοραστική συμπεριφορά
add(id="Q1", section="A", type="multiple_choice", maxChoices=3, short="Παράγοντες επιλογής καταστήματος",
    text="Ποιοι είναι οι σημαντικότεροι παράγοντες όταν επιλέγετε κατάστημα για αγορά ηλεκτρικής ή ηλεκτρονικής συσκευής; (έως 3 απαντήσεις)",
    options=["Τιμή", "Διαθεσιμότητα", "Εμπιστοσύνη στο κατάστημα", "Εγγύηση", "Ταχύτητα παράδοσης", "Εγκατάσταση", "Εξυπηρέτηση μετά την αγορά", "Δυνατότητα δόσεων", "Άλλο"])
add(id="Q2", section="A", type="single_choice", short="Προτιμώμενο κανάλι αγοράς",
    text="Όταν χρειάζεται να αγοράσετε μια ηλεκτρική ή ηλεκτρονική συσκευή, ποιο κανάλι προτιμάτε για την ολοκλήρωση της αγοράς;",
    options=["Φυσικό κατάστημα", "E-shop αλυσίδας καταστημάτων", "Online marketplace", "Εξαρτάται από το προϊόν", "Άλλο"])
add(id="Q3", section="A", type="single_choice", short="Συνηθέστερη αφορμή αντικατάστασης",
    text="Ποια είναι η συνηθέστερη αφορμή για να αντικαταστήσετε μια ηλεκτρική συσκευή;",
    options=["Βλάβη", "Υψηλό κόστος επισκευής", "Παλαιότητα", "Ενεργειακή απόδοση", "Καλύτερες λειτουργίες", "Προσφορά / έκπτωση", "Άλλο"])
for i, s in enumerate(["Παράδοση την επόμενη ημέρα", "Δωρεάν μεταφορά", "Εγκατάσταση", "Επέκταση εγγύησης", "Επισκευή", "Παραλαβή παλιάς συσκευής", "Trade-in (ανταλλαγή παλιάς συσκευής)", "Άτοκες δόσεις"], 1):
    add(id=f"Q4_{i}", parent="Q4", section="A", type="likert", short=f"Σημασία υπηρεσίας: {s}",
        text=f"Πόσο σημαντική είναι για εσάς η παρακάτω υπηρεσία όταν επιλέγετε κατάστημα ηλεκτρικών/ηλεκτρονικών ειδών; — {s}", scale=IMP5, item=s)

# Β — repair vs replace (ίδιο πλυντήριο 7 ετών, νέο 549€)
for qid, cost in [("Q5", 90), ("Q6", 150), ("Q7", 220)]:
    add(id=qid, section="B", type="single_choice", short=f"Επισκευή {cost}€ ή νέο 549€", scenario={"repairCost": cost, "newPrice": 549, "repairWarrantyMonths": 0, "freeDeliveryInstall": False},
        text=f"{WM} Η επισκευή κοστίζει {cost}€, ενώ ένα αντίστοιχο καινούργιο κοστίζει 549€. Τι επιλέγετε;", options=REPAIR)
add(id="Q8", section="B", type="single_choice", short="Επισκευή 150€ με εγγύηση 12 μηνών", scenario={"repairCost": 150, "newPrice": 549, "repairWarrantyMonths": 12, "freeDeliveryInstall": False},
    text=f"{WM} Η επισκευή κοστίζει 150€ και περιλαμβάνει εγγύηση 12 μηνών, ενώ ένα αντίστοιχο καινούργιο κοστίζει 549€. Τι επιλέγετε;", options=REPAIR)
add(id="Q9", section="B", type="single_choice", short="Νέο με δωρεάν παράδοση & εγκατάσταση", scenario={"repairCost": 150, "newPrice": 549, "repairWarrantyMonths": 0, "freeDeliveryInstall": True},
    text=f"{WM} Η επισκευή κοστίζει 150€, ενώ ένα αντίστοιχο καινούργιο κοστίζει 549€ και περιλαμβάνει δωρεάν παράδοση και εγκατάσταση. Τι επιλέγετε;", options=REPAIR)
add(id="Q10", section="B", type="single_choice", short="Τι θα έκανε την επισκευή προτιμότερη",
    text="Ποιο είναι το σημαντικότερο στοιχείο που θα σας έκανε να προτιμήσετε την επισκευή αντί για την αντικατάσταση μιας συσκευής;",
    options=["Χαμηλό κόστος επισκευής", "Εγγύηση επισκευής", "Γρήγορη επισκευή", "Αξιόπιστος τεχνικός / εξουσιοδοτημένο σέρβις", "Συσκευή που δανείζεται κατά την επισκευή", "Περιβαλλοντικοί λόγοι", "Άλλο"])

# Γ — trade-in
add(id="Q11", section="C", type="single_choice", short="Πρόθεση trade-in",
    text="Θα εξετάζατε την αγορά νέας συσκευής εάν μπορούσατε να ανταλλάξετε την παλιά σας με οικονομικό όφελος;", options=TI_BASE)
TI_IF = {"questionId": "Q11", "whenAnswerIn": ["Σίγουρα ναι", "Μάλλον ναι", "Μάλλον όχι"]}
for qid, v in [("Q12", 30), ("Q13", 60), ("Q14", 100)]:
    add(id=qid, section="C", type="likert", short=f"Trade-in με όφελος {v}€", scenario={"tradeInValue": v}, followUpOf=TI_IF,
        text=f"Κατά την αγορά νέας συσκευής, μπορείτε να παραδώσετε την παλιά σας και να λάβετε όφελος ανταλλαγής {v}€. Πόσο πιθανό είναι να χρησιμοποιήσετε την υπηρεσία;", scale=LIK4)
add(id="Q15", section="C", type="single_choice", short="Τι θα αύξανε τη συμμετοχή σε trade-in", followUpOf=TI_IF,
    text="Ποιος παράγοντας θα αύξανε περισσότερο την πιθανότητα να συμμετάσχετε σε πρόγραμμα ανταλλαγής (trade-in);",
    options=["Υψηλότερη αξία ανταλλαγής", "Δωρεάν παραλαβή", "Άμεση πίστωση", "Απλή διαδικασία", "Εγγύηση ασφαλούς διαγραφής δεδομένων", "Άλλο"])

# Δ — new vs refurbished (smartphone)
add(id="Q16", section="D", type="single_choice", short="Εξέταση refurbished smartphone",
    text="Θα εξετάζατε την αγορά ενός πιστοποιημένου ανακατασκευασμένου (refurbished) smartphone;", options=TI_BASE)
for qid, p, wm in [("Q17", 449, 12), ("Q18", 399, 12), ("Q19", 349, 12), ("Q20", 449, 24)]:
    add(id=qid, section="D", type="single_choice", short=f"Νέο 599€ ή refurbished {p}€ (εγγύηση {wm} μηνών)", scenario={"newPhone": 599, "refurbPrice": p, "refurbWarrantyMonths": wm},
        text=f"{PHONE} στα {p}€ με εγγύηση {wm} μηνών. Ποιο επιλέγετε;", options=["Νέο smartphone", "Refurbished smartphone", "Κανένα από τα δύο"])
add(id="Q21", section="D", type="single_choice", short="Κύριος προβληματισμός για refurbished",
    text="Ποιος είναι ο σημαντικότερος προβληματισμός σας για τα ανακατασκευασμένα (refurbished) προϊόντα;",
    options=["Κατάσταση μπαταρίας", "Αξιοπιστία", "Διάρκεια ζωής", "Εγγύηση", "Εμφάνιση / φθορές", "Μεταπωλητική αξία", "Κανένας", "Άλλο"])

# Ε — omnichannel & service
add(id="Q22", section="E", type="single_choice", short="Online με παράδοση ή κατάστημα με άμεση παραλαβή",
    text="Για την ίδια συσκευή και στην ίδια τιμή, τι θα προτιμούσατε;",
    options=["Online αγορά με παράδοση σε 3 ημέρες", "Αγορά από φυσικό κατάστημα με άμεση παραλαβή", "Δεν έχω προτίμηση"])
add(id="Q23", section="E", type="single_choice", short="+20€ για παράδοση την επόμενη ημέρα", scenario={"nextDayFee": 20},
    text="Θα πληρώνατε επιπλέον 20€ για να παραλάβετε μια συσκευή την επόμενη ημέρα;", options=["Ναι", "Όχι", "Εξαρτάται από τη συσκευή"])
add(id="Q24", section="E", type="single_choice", short="+30€ για παράδοση και εγκατάσταση", scenario={"installFee": 30},
    text="Θα πληρώνατε επιπλέον 30€ για παράδοση και εγκατάσταση μιας μεγάλης ηλεκτρικής συσκευής;", options=["Ναι", "Όχι", "Εξαρτάται από τη συσκευή"])
add(id="Q25", section="E", type="likert", short="Επίδραση εύκολης επιστροφής",
    text="Πόσο επηρεάζει την επιλογή καταστήματος η δυνατότητα εύκολης επιστροφής ενός προϊόντος;", scale=INF5)
add(id="Q26", section="E", type="likert", short="Επίδραση τεχνικής υποστήριξης",
    text="Πόσο επηρεάζει την επιλογή καταστήματος η ύπαρξη τεχνικής υποστήριξης μετά την αγορά;", scale=INF5)

# ΣΤ — πειράματα επιλογής
ATTR = [
    ("price", "Τιμή", [499, 549, 599], lambda v: f"{v}€", "lower"),
    ("delivery", "Παράδοση", [1, 3, 7], lambda v: "την επόμενη ημέρα" if v == 1 else f"σε {v} ημέρες", "lower"),
    ("install", "Εγκατάσταση", [0, 30, 50], lambda v: "δωρεάν" if v == 0 else f"{v}€", "lower"),
    ("warranty", "Εγγύηση", [2, 3, 5], lambda v: f"{v} έτη", "higher"),
    ("instalments", "Δόσεις", [0, 12], lambda v: "χωρίς δόσεις" if v == 0 else f"{v} άτοκες δόσεις", "higher"),
    ("tradein", "Trade-in", [0, 50], lambda v: "χωρίς ανταλλαγή" if v == 0 else f"όφελος ανταλλαγής {v}€", "higher"),
    ("support", "Υποστήριξη μετά την αγορά", [0, 1], lambda v: "τηλεφωνική υποστήριξη" if v == 0 else "τεχνική υποστήριξη στο σπίτι", "higher"),
]
PRODUCT = "Πλυντήριο ρούχων 8 kg, ενεργειακή κλάση A, ίδιες προδιαγραφές και στις δύο προσφορές"


def better(a, b, k, d):
    return (a[k] < b[k]) if d == "lower" else (a[k] > b[k])


def dominated(a, b):
    """True αν μία προσφορά είναι καλύτερη ή ίση σε όλα (κυριαρχία)."""
    ab = all(not better(b, a, k, d) for k, _, _, _, d in ATTR)
    ba = all(not better(a, b, k, d) for k, _, _, _, d in ATTR)
    return ab or ba


def design(seed=20261030, tasks=6):
    rnd = random.Random(seed)
    best = None
    for _ in range(20000):
        ts = []
        for t in range(tasks):
            while True:
                a = {k: rnd.choice(lv) for k, _, lv, _, _ in ATTR}
                b = {k: rnd.choice(lv) for k, _, lv, _, _ in ATTR}
                if sum(a[k] != b[k] for k, *_ in ATTR) >= 4 and not dominated(a, b):
                    ts.append((a, b))
                    break
        # κριτήριο ισορροπίας: κάθε επίπεδο κάθε χαρακτηριστικού ~ ίσες εμφανίσεις, και διαφορά επιπέδων Α/Β ανά χαρακτηριστικό
        score = 0
        for k, _, lv, _, _ in ATTR:
            c = Counter(x[k] for a, b in ts for x in (a, b))
            target = 2 * tasks / len(lv)
            score += sum((c.get(v, 0) - target) ** 2 for v in lv)
            score += 0.5 * sum(1 for a, b in ts if a[k] == b[k]) ** 2
        if best is None or score < best[0]:
            best = (score, ts)
    return best


score, TASKS = design()
CE = []
for i, (a, b) in enumerate(TASKS):
    qid = f"Q{27 + i}"
    fa = "; ".join(f"{lab}: {fmt(a[k])}" for k, lab, _, fmt, _ in ATTR)
    fb = "; ".join(f"{lab}: {fmt(b[k])}" for k, lab, _, fmt, _ in ATTR)
    add(id=qid, section="F", type="single_choice", short=f"Πείραμα επιλογής {i + 1}", task=i + 1, offerA=a, offerB=b,
        text=f"{PRODUCT}. Προσφορά Α — {fa}. Προσφορά Β — {fb}. Ποια προσφορά επιλέγετε;",
        options=["Προσφορά Α", "Προσφορά Β", "Καμία από τις δύο"])
    for alt, o in (("A", a), ("B", b)):
        CE.append({"task": i + 1, "question_id": qid, "alternative": alt, **{k: o[k] for k, *_ in ATTR}})
# έλεγχοι σχεδιασμού
assert all(not dominated(a, b) for a, b in TASKS)
bal = {k: dict(Counter(x[k] for a, b in TASKS for x in (a, b))) for k, *_ in ATTR}
doc = {"id": "consumer-decision-2026", "title": "REPAIR, REPLACE OR UPGRADE? — Greece 2026 Synthetic Consumer Decision Study", "referencePeriod": "2026-10",
       "population": "Ενήλικες μόνιμοι κάτοικοι Ελλάδας (18+)", "questions": Q,
       "choiceDesign": {"product": PRODUCT, "attributes": [{"key": k, "label": lab, "levels": lv, "betterWhen": d} for k, lab, lv, _, d in ATTR],
                        "tasks": [{"task": i + 1, "A": a, "B": b} for i, (a, b) in enumerate(TASKS)], "levelBalance": bal,
                        "noDominance": True, "minDifferingAttributes": min(sum(a[k] != b[k] for k, *_ in ATTR) for a, b in TASKS), "seed": 20261030}}
json.dump(doc, open(OUT / "questionnaire.json", "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print(len(Q), "ερωτήσεις/υποερωτήσεις ·", "ισορροπία:", json.dumps(bal, ensure_ascii=False))
for q in Q[-6:]:
    print(q["id"], q["text"][len(PRODUCT) + 2:][:300])
