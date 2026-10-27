# Greek Synthetic Research Lab

Ανεξάρτητη ενότητα μέσα στην εφαρμογή NORAYA για **προκαταρκτική** συνθετική έρευνα για την Ελλάδα. Καλύπτει:
- έρευνα αγοράς, δοκιμή προϊόντων και τιμών;
- διερεύνηση κοινωνικών ζητημάτων και ουδέτερη σύγκριση δημόσιων πολιτικών.

> Οι συνθετικές απαντήσεις **δεν είναι δημοσκόπηση, δεν είναι πρόβλεψη και δεν αντικαθιστούν πραγματική έρευνα**. Κάθε απάντηση φέρει την ετικέτα `SIMULATED RESPONSE — NOT HUMAN SURVEY DATA`.

**URL:** `/synthetic-lab` · **Εγκατάσταση:** [INSTALLATION.md](INSTALLATION.md) · **Τελική αναφορά:** [FINAL_REPORT.md](FINAL_REPORT.md)

## Οι έξι λειτουργίες

| Οθόνη | Τι κάνει |
|---|---|
| **Νέα Έρευνα** (`/synthetic-lab/new`) | Wizard 5 βημάτων: θέμα σε φυσική γλώσσα → κοινό → ερωτηματολόγιο (8 τύποι ερωτήσεων, follow-ups) → παραδοχές & δεδομένα → εκτέλεση. Αποτελέσματα, αναφορά 13 ενοτήτων, εξαγωγή PDF/CSV/JSON/Markdown/Word. |
| **Focus Group** | Συντονιστής και 3–8 συνθετικοί συμμετέχοντες. Ζωντανό transcript, παύση/συνέχεια/τερματισμός, σύνθεση (θέματα, σύγκλιση, απόκλιση, απρόσμενα), εξαγωγή transcript. |
| **Σύγκριση Σεναρίων** | 2–5 σενάρια στο **ίδιο** δείγμα, ζευγαρωτές διαφορές με διαστήματα, άμεση σύγκριση, ευαισθησία στις παραδοχές. |
| **Πληθυσμός & Κοινά** | Συνθετικά προφίλ GLOPOP-S με έτος βάσης, βάρη, προέλευση, ακεραιότητα και γνωστά ζητήματα. |
| **Τα Δεδομένα μου** | Registry πηγών: έτη συλλογής, άδειες, εμπορική χρήση, περιορισμοί, φρεσκάδα. Εισαγωγή στόχων επικαιροποίησης ή συγκεντρωτικών ερευνών. |
| **Έλεγχος Αξιοπιστίας** | Backtest σε held-out κύματα Eurobarometer με baselines, κάλυψη διαστημάτων, ευαισθησία και σταθερότητα. |

## Αρχιτεκτονική
Η ενότητα δεν τροποποιεί κανένα αρχείο της NORAYA, εκτός από τα `package.json` (scripts και dependencies) και `.gitignore`.

```
app/synthetic-lab/                σελίδες (Next.js App Router, ελληνικά)
app/api/synthetic-lab/            API (zod validation, προαιρετικό login gate)
components/synthetic-lab/         UI (wizard, γραφήματα SVG, focus group, σενάρια, επικύρωση)
lib/synthetic-lab/
  types.ts                        τύποι (Persona, Question, StudyRun…)
  data/                           registry, NORAYA adapter, priors, imports, ενσωματωμένο δείγμα GLOPOP-S
  population/                     GLOPOP-S schema/reader/importer, δειγματοληψία, raking, store
  engine/                         planner, guardrails, prior-model, demo/LLM responders,
                                  survey, focus-group, scenarios, validation, report
  ai/                             live mode: config, όρια κόστους, rate limit, ακύρωση
  storage/                        ιδιωτικό JSON store (.synthetic-lab-data)
scripts/synthetic-lab/            import-glopop, build-noraya-priors, check-data, e2e
tests/synthetic-lab/              vitest
docs/synthetic-lab/               τεκμηρίωση + προτεινόμενο SQL (δεν εφαρμόζεται)
```

## Ροή δεδομένων
```
public_opinion.csv (NORAYA, μόνο ανάγνωση) ──build──> noraya-priors.generated.json ─┐
GLOPOP-S Dataverse (CC BY 4.0) ──import/verify──> δείγμα 5.000 (+ ιδιωτικά πλήρη)  ├─> prior-model (logit IPF)
στόχοι ΕΛΣΤΑΤ (προαιρετικά, CSV) ──raking──────────────────────────────────────────┘        │
                                                                                         survey / focus group / scenarios
                                                                                                   │
                                                                         aggregate → report → validation summary → exports
```

## Σύντομη μεθοδολογία
Λεπτομέρειες στα [METHODOLOGY.md](METHODOLOGY.md), [VALIDATION.md](VALIDATION.md) και [DATA_SOURCES.md](DATA_SOURCES.md).

1. **Προφίλ από εγγραφές:** GLOPOP-S 2015, στρωματοποιημένα ανά περιφέρεια, με βάρη.
2. **Ερωτήσεις συνδεδεμένες με δείκτη Eurobarometer:** μοντέλο κύριων επιδράσεων που ταιριάζει τα ποσοστά ανά ηλικία, φύλο και μόρφωση. Χαρακτηρίζονται «στατιστική εκτίμηση».
3. **Οι υπόλοιπες ερωτήσεις:** ρητές, επεξεργάσιμες παραδοχές ή ουδέτερη κατανομή. Χαρακτηρίζονται «συνθετική προσομοίωση».
4. **Live AI:** προαιρετικό, με όρια κόστους. Χαρακτηρίζεται «ερμηνεία AI» και είναι μη επικυρωμένο.
5. **Πολιτικά όρια:** δεν υποστηρίζεται τίποτα εκλογικό ή κομματικό.
