# NORAYA STATE

## Master file

Το βασικό αρχείο προϊόντος είναι:

`docs/NORAYA_MASTER_BLUEPRINT.md`

Το Noraya είναι live-first. Δηλαδή πρέπει να δουλεύει με πραγματικά δεδομένα, όχι με demo/mock data.

Seed/test fixtures επιτρέπονται μόνο για development και automated testing. Δεν εμφανίζονται σε πραγματικό χρήστη και δεν χρησιμοποιούνται σε παρουσίαση πελάτη.

---

## Previous step

Κλειδώθηκε το `NORAYA_MASTER_BLUEPRINT` ως βάση υλοποίησης.

Αποφασίστηκε ότι:

- Το UI μένει όπως η εικόνα.
- Το προϊόν οργανώνεται γύρω από Political Situations.
- Το Noraya πρέπει να δουλεύει με πραγματικά άρθρα, πραγματικά scores και πραγματικές καταστάσεις.
- Test fixtures επιτρέπονται μόνο για development/testing, όχι για πελάτη.
- Το chat δεν είναι το προϊόν· είναι context-aware advisor.
- Οι δημοσκοπήσεις δεν είναι notes· είναι verified internal intelligence.
- Το Public Pulse είναι ένδειξη κοινού, όχι δημοσκόπηση.
- Το Heresthetic / Riker layer είναι core differentiator.
- Δεν υπάρχει strategy χωρίς Red Team.
- Δεν υπάρχει recommendation χωρίς triggers αναθεώρησης.

---

## Current step

Ξεκινάμε implementation με βάση το live-first flow.

Πριν γράψουμε νέο UI, πρέπει να ελέγξουμε τι υπάρχει ήδη στον κώδικα.

Θέλουμε να δούμε:

- Πού είναι το `/api/ingest`.
- Πού είναι το `/api/classify`.
- Πώς είναι σήμερα ο πίνακας `articles`.
- Τι υπάρχει ήδη για advisor.
- Τι υπάρχει ήδη σε Supabase migrations.

---

## Next step

Να γίνει **Live Data Foundation Audit**.

Στόχος:

Να ξέρουμε ακριβώς τι υπάρχει και τι λείπει ώστε μετά να γράψουμε το πρώτο σωστό patch.

---

## Immediate task

Έλεγχος repo για:

- `/api/ingest`
- `/api/classify`
- `articles` schema
- advisor routes
- Supabase migrations

Μετά τον έλεγχο αποφασίζουμε το πρώτο patch.
