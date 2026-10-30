# Greece 500: εφαρμογή της CCE 0.1 σε 500 συνθετικούς Έλληνες καταναλωτές

Ερευνητική εκτέλεση σε `experimental_transfer_mode` (`cce/transfer.py`).

- **Προφίλ:** ελληνικά συνθετικά προφίλ του Lab.
- **Συντελεστές προτίμησης:** από μοντέλα εκπαιδευμένα εκτός Ελλάδας. Δεν τροποποιούνται.
- **Σήμανση αποτελεσμάτων:** `EXPERIMENTAL_CROSS_COUNTRY_TRANSFER`.

Τα παραδοτέα βρίσκονται στο `docs/synthetic-lab/greece-500-consumer-choice/`.

| Αρχείο | Ρόλος |
|---|---|
| `scenarios.py` | Σενάρια σε ευρώ ανά ερώτηση (χωρίς ποσοστά) και ερωτήσεις-δοκιμές χωρίς μοντέλο |
| `run_study.py` | 133 σενάρια × 4 υποθέσεις μεταφοράς × 500 προφίλ → ατομικές πιθανότητες και επιλογές, RESULTS από τις εγγραφές |
| `analyze.py` | Segments από ατομικούς συντελεστές, διασταυρώσεις, δεδομένα dashboard |
| `validate.py` | Επικύρωση εκτέλεσης (ποσοστά/εγγραφές, συνέπεια, μονοτονία, επαναληψιμότητα, προέλευση, πεδίο, μεταφορά) |
| `lab/`, `lab_check.cjs` | Dashboard και έλεγχος ότι αναπαράγει ακριβώς την CCE |
| `docs.py`, `report.py`, `render_pdf.cjs` | QUESTIONNAIRE/VALIDATION, executive report HTML → PDF |

Οι εισροές της μεταφοράς (World Bank, Eurostat) βρίσκονται στο `../../transfer/macro_inputs.json`.

## Αναπαραγωγή

Εκτέλεση από τον φάκελο `models/consumer-choice-engine/`, περίπου 3 λεπτά:

```bash
OUT=../../docs/synthetic-lab/greece-500-consumer-choice; S=studies/greece500
python3 -I $S/run_study.py $OUT && python3 -I $S/analyze.py $OUT $OUT && python3 -I $S/validate.py $OUT
cp $S/lab/index.html $S/lab/app.js $S/lab/app.css $OUT/INTERACTIVE_LAB/
node $S/lab_check.cjs $OUT /tmp > $OUT/_lab_check.json
python3 -I $S/docs.py $OUT $OUT/_lab_check.json && python3 -I $S/report.py $OUT
node $S/render_pdf.cjs $OUT/EXECUTIVE_REPORT.html $OUT/EXECUTIVE_REPORT.pdf
```
