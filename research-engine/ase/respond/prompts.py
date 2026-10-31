"""Πρότυπα prompts (έκδοση PROMPT_VERSION) και φρουρός κατά εντολών-στόχων.

Το LLM λαμβάνει: συνθετικό προφίλ, σενάριο, προηγούμενες απαντήσεις του ίδιου ερωτώμενου, κοινό ερευνητικό πλαίσιο και την
ερώτηση. Επιστρέφει ΚΑΤΑΝΟΜΗ (ή κείμενο για ανοιχτές)· η απάντηση κληρώνεται από το σύστημα με σταθερό seed.
Δεν λαμβάνει ποτέ επιθυμητά ποσοστά ή στόχους αποτελεσμάτων.
"""
from __future__ import annotations

import re

PROMPT_VERSION = "ase-prompt-1.0"

LABELS = {
    "gender": {"male": "Άνδρας", "female": "Γυναίκα"},
    "education": {"less_than_primary": "χωρίς ολοκληρωμένη πρωτοβάθμια", "primary": "πρωτοβάθμια", "lower_secondary": "γυμνάσιο",
                  "upper_secondary": "λύκειο / μεταλυκειακή", "tertiary": "τριτοβάθμια"},
    "household_type": {"single": "μονοπρόσωπο", "couple": "ζευγάρι χωρίς παιδιά", "couple_with_children": "ζευγάρι με παιδιά", "single_parent": "μονογονεϊκό",
                       "couple_with_relatives": "ζευγάρι με συγγενείς", "couple_with_children_and_relatives": "ζευγάρι με παιδιά και συγγενείς",
                       "single_parent_with_relatives": "μονογονεϊκό με συγγενείς", "other": "άλλο"},
    "settlement": {"urban": "αστική περιοχή", "rural": "αγροτική περιοχή"},
}

SYSTEM = """Συμμετέχεις σε ερευνητική ΠΡΟΣΟΜΟΙΩΣΗ καταναλωτικής έρευνας για την Ελλάδα. Δεν είσαι πραγματικός ερωτώμενος.
Σου δίνεται ένα ΣΥΝΘΕΤΙΚΟ προφίλ ενήλικα (δημογραφικά από επίσημες κατανομές). Εκτίμησε πώς θα απαντούσε ένα πρόσωπο με
αυτά τα χαρακτηριστικά, λαμβάνοντας υπόψη οικονομικούς περιορισμούς, ανάγκες του σεναρίου και τις προηγούμενες απαντήσεις του.
Κανόνες:
1. Επέστρεψε ΜΟΝΟ JSON σύμφωνα με το schema. Για κλειστές ερωτήσεις δώσε κατανομή πιθανοτήτων πάνω στους κωδικούς, όχι μία
   «σωστή» απάντηση· η κατανομή πρέπει να εκφράζει την πραγματική αβεβαιότητα για ένα τέτοιο πρόσωπο.
2. Το ερευνητικό πλαίσιο είναι υπόβαθρο, όχι στόχος. Μην αναπαράγεις ποσοστά πηγών ως απάντηση του προσώπου.
3. Ερωτήσεις για προσωπική εμπειρία ή ιστορικό: το πρόσωπο είναι συνθετικό· απάντησε ως ΥΠΟΘΕΤΙΚΟ χαρακτηριστικό σεναρίου,
   συνεπές με το προφίλ — όχι ως πραγματικό γεγονός.
4. Υποθετικά σενάρια για εταιρείες είναι ερευνητικά παραδείγματα, όχι πραγματικές πολιτικές τους.
5. Η αιτιολόγηση είναι σύντομη (έως 30 λέξεις), ελέγξιμη, χωρίς εσωτερική συλλογιστική.
6. Ανοιχτές ερωτήσεις: φυσικά ελληνικά, 1–3 προτάσεις, στο ύφος του προσώπου."""

# φράσεις που δείχνουν απόπειρα επιβολής αποτελεσμάτων (π.χ. «κάνε το 65% αρνητικό», «να επιβεβαιώνει το Brand Intelligence»)
_DIRECTIVES = [r"(κάνε|δώσε|να βγει|να είναι|ώστε|φρόντισε|make|ensure|give)\W.{0,40}\d+\s*%",
               r"(επιβεβαιώ|confirm|match|ταιριάζ).{0,40}(brand intelligence|αναφορά|report|ποσοστ)",
               r"(target|στόχο?ς?)\s*(share|ποσοστ)"]


def _plain(s: str) -> str:
    import unicodedata
    s = unicodedata.normalize("NFD", s or "")
    return "".join(c for c in s if unicodedata.category(c) != "Mn")


def guard(text: str) -> list:
    """Επιστρέφει παραβιάσεις αν ένα κείμενο οδηγιών προς το μοντέλο επιχειρεί να ορίσει αποτελέσματα (έλεγχος χωρίς τόνους)."""
    t = _plain(text).lower()
    return [p for p in _DIRECTIVES if re.search(_plain(p), t, re.IGNORECASE)]


def profile_text(p: dict) -> str:
    g = LABELS["gender"].get(p.get("gender"), p.get("gender"))
    parts = [f"{g}, ηλικία {p.get('age_band')}", f"Περιφέρεια: {p.get('region')} ({LABELS['settlement'].get(p.get('settlement'), p.get('settlement'))})",
             f"Εκπαίδευση: {LABELS['education'].get(p.get('education'), p.get('education'))}",
             f"Νοικοκυριό: {LABELS['household_type'].get(p.get('household_type'), p.get('household_type'))}, μέγεθος {p.get('household_size')}",
             f"Εισοδηματικό πεμπτημόριο νοικοκυριού: {p.get('income_quintile')} (1 = χαμηλότερο, 5 = υψηλότερο)"]
    ext = [f"{k}: {v}" for k, v in p.items() if k.startswith("x_")]
    return "\n".join(parts + ext + ["Άγνωστα (δεν υπάρχουν δεδομένα): απασχόληση, επάγγελμα, προσωπικό ιστορικό αγορών."])


def question_block(q, codes_labels, task=None, numeric_range=None) -> str:
    lines = [f"ΕΡΩΤΗΣΗ {q.id} ({q.type}): {q.text}"]
    if q.scenario:
        lines.insert(0, f"ΣΕΝΑΡΙΟ (υποθετικό): {q.scenario['text']}")
    if task:
        for a in task["alternatives"]:
            attrs = "; ".join(f"{k}: {v}" for k, v in a["attributes"].items()) or "—"
            lines.append(f"  [{a['id']}] {a['label']} — {attrs}")
    elif codes_labels:
        lines += [f"  [{c}] {l}" for c, l in codes_labels]
    if q.type == "multiple_choice":
        lines.append(f"  (πολλαπλή επιλογή: {q.min_choices}–{q.max_choices or len(codes_labels)} επιλογές· δώσε πιθανότητα επιλογής για κάθε κωδικό)")
    if q.type == "ranking":
        lines.append("  (κατάταξη: δώσε βαθμό σημασίας 0–1 για κάθε στοιχείο)")
    if numeric_range:
        lines.append(f"ΕΥΡΟΣ: {numeric_range[0]}–{numeric_range[1]}")
        lines.append(f"  (αριθμητική: δώσε χαμηλή, τυπική και υψηλή εκτίμηση {q.numeric.get('unit', '')})")
    if q.intent == "experience":
        lines.append("  ΣΗΜΕΙΩΣΗ: συνθετικό χαρακτηριστικό σεναρίου — όχι πραγματικό ιστορικό.")
    return "\n".join(lines)


def user_prompt(profile: dict, history: list, context: str, blocks: list[str], study_brief: str) -> str:
    hist = "\n".join(f"- {h}" for h in history[-25:]) or "- (καμία)"
    return (f"ΜΕΛΕΤΗ: {study_brief}\n\nΣΥΝΘΕΤΙΚΟ ΠΡΟΦΙΛ:\n{profile_text(profile)}\n\nΠΡΟΗΓΟΥΜΕΝΕΣ ΑΠΑΝΤΗΣΕΙΣ ΤΟΥ ΙΔΙΟΥ ΠΡΟΣΩΠΟΥ:\n{hist}\n\n"
            f"ΕΡΕΥΝΗΤΙΚΟ ΠΛΑΙΣΙΟ (υπόβαθρο, όχι στόχος):\n{context}\n\n" + "\n\n".join(blocks))
