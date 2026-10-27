# Εγκατάσταση και εκκίνηση

## Προαπαιτούμενα
- Node.js 20 ή νεότερο. Δοκιμάστηκε με Node 22.22.
- Git.
- **Προαιρετικά:** Playwright, μόνο για το end-to-end test.

## 1. Λήψη του branch
```bash
git clone https://github.com/Gkagkelis/subscription-starter.git
cd subscription-starter
git checkout claude/synthetic-research-lab
```
Αν έχετε ήδη το repository:
```bash
git fetch origin
git checkout claude/synthetic-research-lab
```

## 2. Εγκατάσταση εξαρτήσεων
```bash
npm install
```

## 3. Μεταβλητές περιβάλλοντος
Η εφαρμογή (NORAYA + Lab) χρειάζεται τις μεταβλητές Supabase που υπάρχουν ήδη στο `.env.local.example`.

**Αν έχετε ήδη `.env.local`**, μην αλλάξετε τίποτα. Το Lab δουλεύει σε demo mode χωρίς καμία νέα μεταβλητή.

**Για τοπική δοκιμή μόνο του Lab, χωρίς Supabase**, αρκούν:
```bash
NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321
NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy
```
Η σύνδεση και οι σελίδες της NORAYA θα αποτυγχάνουν σιωπηλά, αλλά το Lab λειτουργεί πλήρως.

Οι προαιρετικές μεταβλητές του Lab είναι στο `docs/synthetic-lab/.env.example`. **Μην βάλετε ποτέ πραγματικά κλειδιά στο git.**

## 4. Εκκίνηση
```bash
npm run dev
```
Ανοίξτε: **http://localhost:3000/synthetic-lab**

Για production build τοπικά:
```bash
npm run build && npm start
```
> Σημείωση για το build: υπάρχοντα routes της NORAYA (π.χ. `/api/ai/impact-outline`, `/api/agenda`) διαβάζουν `OPENAI_API_KEY` και `NEXT_PUBLIC_SUPABASE_URL` ήδη κατά το build. Αν λείπουν, το `next build` αποτυγχάνει. Αυτό συνέβαινε και πριν από το Lab. Σε τοπική δοκιμή αρκούν εικονικές τιμές (`OPENAI_API_KEY=dummy`).

## 5. Πλήρης εισαγωγή GLOPOP-S (προαιρετικό)
Το repository περιέχει ήδη ελεγμένο δείγμα 5.000 ατόμων. Για μεγαλύτερο ιδιωτικό δείγμα:
```bash
npm run lab:import-glopop -- --n 20000 --seed 7
```
- Κατεβάζει **μόνο** τα 13 ελληνικά αρχεία (περίπου 11 MB, CC BY 4.0) από το Harvard Dataverse, στο `.synthetic-lab-data/raw/glopop/` (gitignored).
- Δεν ξανακατεβάζει αρχεία που υπάρχουν ήδη.
- Ελέγχει την ακεραιότητα έναντι των δημοσιευμένων στατιστικών.
- Γράφει τον νέο πληθυσμό στο `.synthetic-lab-data/populations/`, και εμφανίζεται αυτόματα στο UI.

## 6. Έλεγχοι
```bash
npm run lab:test         # 39 unit/API tests (vitest)
npm run lab:check-data   # ακεραιότητα δεδομένων
npx tsc --noEmit         # TypeScript
# E2E (χρειάζεται τρέχοντα server και Playwright):
npm i -D playwright && npx playwright install chromium
BASE_URL=http://localhost:3000 npm run lab:e2e
```

## 7. Live mode (AI): μόνο αν το αποφασίσετε
Είναι απενεργοποιημένο από προεπιλογή. Για ενεργοποίηση, βάλτε στο `.env.local`:
```
SYNTHETIC_LAB_LIVE_AI=true
ANTHROPIC_API_KEY=<κλειδί development με όριο δαπάνης στο Anthropic Console>
SYNTHETIC_LAB_LIVE_KEY=<ένα μυστικό της επιλογής σας>
SYNTHETIC_LAB_COST_CAP_USD=1
SYNTHETIC_LAB_DAILY_CAP_USD=5
```
Στο UI, στο βήμα «Εκτέλεση», επιλέξτε «Live» και γράψτε το `SYNTHETIC_LAB_LIVE_KEY`.

## 8. Πριν από οποιοδήποτε deployment
- `SYNTHETIC_LAB_REQUIRE_LOGIN=true`: απαιτεί σύνδεση για σελίδες και API.
- Σε serverless (Vercel) ο δίσκος είναι προσωρινός. Οι μελέτες πάνε στο `/tmp` και **χάνονται**. Για μόνιμη αποθήκευση, δείτε το `docs/synthetic-lab/sql/synthetic_lab_schema.sql` (απαιτεί έγκριση και μεταφορά του file store σε Supabase).
- **Κανένα deployment δεν έγινε.**
