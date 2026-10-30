#!/usr/bin/env python3
"""Πλέγμα σεναρίων για τον Interactive Decision Lab: κάθε σημείο είναι ΠΡΑΓΜΑΤΙΚΗ ερώτηση που περνά από τον κινητήρα του Lab
(IQGE + PIE pie-0.7). Δεν περιέχει κανένα ποσοστό· παράγει μόνο το ερωτηματολόγιο των σεναρίων.
    python3 -I scripts/synthetic-lab/consumer-decision/cd_grid.py <out.json>
"""
import json
import sys

WM = "Το πλυντήριο ρούχων σας, ηλικίας 7 ετών, παρουσιάζει βλάβη."
REPAIR = ["Επισκευή", "Αγορά νέου", "Αναβολή απόφασης", "Άλλο"]
LIK4 = ["Πολύ πιθανό", "Μάλλον πιθανό", "Μάλλον απίθανο", "Πολύ απίθανο"]
Q = []
for new in (449, 549, 649):
    for cost in (60, 90, 120, 150, 180, 220, 260, 300):
        for wm in (0, 12):
            extra = f" και περιλαμβάνει εγγύηση {wm} μηνών" if wm else ""
            Q.append({"id": f"R_{cost}_{new}_{wm}", "family": "repair", "scenario": {"repairCost": cost, "newPrice": new, "repairWarrantyMonths": wm}, "type": "single_choice",
                      "text": f"{WM} Η επισκευή κοστίζει {cost}€{extra}, ενώ ένα αντίστοιχο καινούργιο κοστίζει {new}€. Τι επιλέγετε;", "options": REPAIR})
for v in (0, 20, 30, 45, 60, 80, 100, 150):
    Q.append({"id": f"T_{v}", "family": "tradein", "scenario": {"tradeInValue": v}, "type": "likert",
              "text": f"Κατά την αγορά νέας συσκευής, μπορείτε να παραδώσετε την παλιά σας και να λάβετε όφελος ανταλλαγής {v}€. Πόσο πιθανό είναι να χρησιμοποιήσετε την υπηρεσία;", "scale": LIK4})
for p in (299, 349, 399, 449, 499):
    for wm in (12, 24):
        Q.append({"id": f"F_{p}_{wm}", "family": "refurb", "scenario": {"refurbPrice": p, "refurbWarrantyMonths": wm, "newPhone": 599}, "type": "single_choice",
                  "text": f"Νέο smartphone στα 599€ έναντι πιστοποιημένου refurbished smartphone αντίστοιχων χαρακτηριστικών στα {p}€ με εγγύηση {wm} μηνών. Ποιο επιλέγετε;",
                  "options": ["Νέο smartphone", "Refurbished smartphone", "Κανένα από τα δύο"]})
for d in (1, 3, 7):
    for fee in (0, 10, 20, 30):
        when = "την επόμενη ημέρα" if d == 1 else f"σε {d} ημέρες"
        Q.append({"id": f"D_{d}_{fee}", "family": "delivery", "scenario": {"deliveryDays": d, "deliveryFee": fee}, "type": "single_choice",
                  "text": f"Θα πληρώνατε επιπλέον {fee}€ για να παραλάβετε μια συσκευή {when};" if fee else f"Θα επιλέγατε μια αγορά με δωρεάν παράδοση {when};",
                  "options": ["Ναι", "Όχι", "Εξαρτάται από τη συσκευή"]})
for fee in (0, 20, 30, 50):
    Q.append({"id": f"I_{fee}", "family": "install", "scenario": {"installFee": fee}, "type": "single_choice",
              "text": f"Θα πληρώνατε επιπλέον {fee}€ για παράδοση και εγκατάσταση μιας μεγάλης ηλεκτρικής συσκευής;" if fee else "Θα επιλέγατε αγορά μεγάλης ηλεκτρικής συσκευής με δωρεάν παράδοση και εγκατάσταση;",
              "options": ["Ναι", "Όχι", "Εξαρτάται από τη συσκευή"]})
json.dump({"title": "consumer-decision grid", "questions": Q}, open(sys.argv[1], "w", encoding="utf-8"), ensure_ascii=False)
print(len(Q), "σημεία πλέγματος")
