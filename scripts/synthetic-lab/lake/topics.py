"""Θεματική ταξινόμηση (25 κατηγορίες), συνάφεια με Ελλάδα/έρευνα, άδειες, κλειδιά deduplication."""

import re
import unicodedata

TOPICS = {
    "demography": ["population", "demograph", "fertility", "birth", "mortality", "πληθυσμ", "δημογραφ", "γεννησ", "θνησιμ", "demo_"],
    "consumer": ["consumer", "consumption", "purchas", "shopping", "e-commerce", "ecommerce", "καταναλω", "αγορ", "ψωνι", "brand", "isoc_ec"],
    "household_finance": ["income", "poverty", "deprivation", "expenditure", "budget", "arrears", "εισοδημ", "φτωχ", "δαπαν", "ilc_", "hbs_", "οφειλ"],
    "employment": ["employment", "unemploy", "labour", "labor", "occupation", "job", "work", "απασχολ", "ανεργ", "εργασ", "επαγγελ", "lfs", "lfsa_", "lfsq_"],
    "education": ["education", "school", "student", "skill", "literacy", "university", "εκπαιδ", "σχολ", "μαθητ", "φοιτητ", "δεξιοτ", "edat_", "trng_", "educ_"],
    "health": ["health", "illness", "disease", "covid", "mental", "wellbeing", "well-being", "obesity", "smok", "υγει", "ασθεν", "ψυχικ", "κάπνισ", "καπνισ", "hlth_"],
    "politics": ["election", "vote", "voting", "political", "party", "parliament", "εκλογ", "ψηφ", "πολιτικ", "κομμα"],
    "values": ["values", "attitude", "belief", "religio", "opinion", "perception", "αξιε", "αξίε", "στάσ", "στασ", "πεποιθ", "θρησκ", "αντιληψ"],
    "trust": ["trust", "institution", "corruption", "εμπιστοσ", "θεσμ", "διαφθορ"],
    "technology": ["ict", "digital", "technology", "internet use", "computer", "artificial intelligence", "τεχνολογ", "ψηφιακ", "υπολογιστ", "τεχνητη νοημοσυνη", "isoc_"],
    "media": ["social media", "facebook", "news", "media", "television", "μεσα ενημερ", "ειδησ", "τηλεορασ", "κοινωνικα δικτυα"],
    "environment": ["environment", "climate", "recycl", "pollution", "waste", "sustainab", "περιβαλλ", "κλιματ", "ανακυκλ", "ρυπαν", "αποβλητ", "env_"],
    "energy": ["energy", "electricity", "heating", "fuel", "ενεργει", "ρευμα", "θερμανσ", "καυσιμ", "nrg_"],
    "housing": ["housing", "dwelling", "rent", "mortgage", "real estate", "στεγ", "κατοικι", "ενοικ", "ακινητ", "ilc_hc", "ilc_lv"],
    "transport": ["transport", "mobility", "commut", "car ", "vehicle", "traffic", "μεταφορ", "μετακιν", "οχημ", "κυκλοφορ", "tran_"],
    "lifestyle": ["diet", "nutrition", "food", "alcohol", "physical activity", "sport", "lifestyle", "διατροφ", "τροφιμ", "αλκοολ", "ασκησ", "αθλησ"],
    "tourism": ["touris", "travel", "holiday", "hotel", "τουρισ", "ταξιδ", "διακοπ", "ξενοδοχ", "tour_"],
    "culture": ["cultur", "museum", "cinema", "theatre", "reading", "leisure", "πολιτισμ", "μουσει", "σινεμα", "θεατρ", "αναγνωσ", "ψυχαγωγ", "cult_"],
    "family": ["family", "marriage", "children", "parent", "social relation", "οικογεν", "γαμ", "παιδι", "γονε", "κοινωνικες σχεσ"],
    "migration": ["migra", "refugee", "asylum", "integration", "μεταναστ", "προσφυγ", "ενταξ", "migr_"],
    "entrepreneurship": ["entrepreneur", "business", "firm", "sme", "startup", "επιχειρ", "επιχειρηματ", "μμε"],
    "banking": ["bank", "payment", "credit", "loan", "debt", "financial inclusion", "account", "τραπεζ", "πληρωμ", "δανει", "πιστωτ", "χρεος"],
    "retail": ["retail", "clothing", "apparel", "fashion", "grocery", "supermarket", "λιανεμπ", "ενδυσ", "ρουχ", "σουπερ", "μοδα"],
    "customer_satisfaction": ["satisfaction", "customer", "preference", "loyalty", "ικανοποιησ", "πελατ", "προτιμησ"],
}
TOPIC_LABELS = {
    "demography": "Δημογραφία", "consumer": "Καταναλωτική συμπεριφορά", "household_finance": "Οικονομία νοικοκυριών & εισόδημα",
    "employment": "Απασχόληση & ανεργία", "education": "Εκπαίδευση & δεξιότητες", "health": "Υγεία & ευεξία",
    "politics": "Πολιτικές στάσεις", "values": "Κοινωνικές αξίες & αντιλήψεις", "trust": "Εμπιστοσύνη στους θεσμούς",
    "technology": "Τεχνολογία & ψηφιακή συμπεριφορά", "media": "Διαδίκτυο, social media & ενημέρωση",
    "environment": "Περιβάλλον & κλιματική αλλαγή", "energy": "Ενέργεια", "housing": "Στέγαση & ακίνητα",
    "transport": "Μεταφορές & κινητικότητα", "lifestyle": "Διατροφή & τρόπος ζωής", "tourism": "Τουρισμός & αναψυχή",
    "culture": "Πολιτισμός & ψυχαγωγία", "family": "Οικογένεια & κοινωνικές σχέσεις", "migration": "Μετανάστευση & ένταξη",
    "entrepreneurship": "Επιχειρηματικότητα & εργασία", "banking": "Τραπεζική συμπεριφορά & πληρωμές",
    "retail": "Λιανεμπόριο, τρόφιμα, ένδυση", "customer_satisfaction": "Ικανοποίηση πελατών & προτιμήσεις", "other": "Άλλο",
}


def norm(s):
    s = unicodedata.normalize("NFKD", (s or "").lower())
    s = "".join(c for c in s if unicodedata.category(c) != "Mn").replace("ς", "σ")
    return re.sub(r"\s+", " ", s)


def classify(*texts):
    t = norm(" ".join(x for x in texts if x))
    hits = [k for k, kws in TOPICS.items() if any(norm(kw) in t for kw in kws)]
    return hits or ["other"]


GREECE = re.compile(r"\bgreece\b|\bgreek\b|\bhellenic\b|ελλαδ|ελληνικ|ελληνε|\bathens\b|αθηνα|θεσσαλονικ|thessaloniki|\bcrete\b|κρητ|patras|πατρα|ιωαννιν")
SURVEY = re.compile(
    r"survey|questionnaire|respondent|interview|poll|opinion|attitude|perception|microdata|panel|sample of|participants|"
    r"ερωτηματολογ|ερευνα|δημοσκοπ|συμμετεχοντ|δειγμα|στασεισ|αντιληψ|συνεντευξ"
)
NOT_SOCIAL = re.compile(
    r"archaeolog|excavation|pottery|seismic|earthquake catalog|geolog|sediment|genom|sequenc|protein|bacteri|fossil|"
    r"satellite image|remote sensing|lidar|ocean|marine species|fish stock|plant species|soil sample|rainfall|meteorolog|"
    r"bird|insect|herbarium|mineral|isotop|coral|tree ring|wildfire perimeter|dem model|spectra|seawater|water quality|chemical analys|"
    r"concentration of|sediment|groundwater|air quality monitor|telescope|asteroid|manuscript|inscription|epigraph|byzantin|ancient"
)


def greece_relevant(*texts):
    return bool(GREECE.search(norm(" ".join(x for x in texts if x))))


def survey_relevant(*texts):
    t = norm(" ".join(x for x in texts if x))
    return bool(SURVEY.search(t)) and not NOT_SOCIAL.search(t)


OPEN_LICENSE = re.compile(r"cc[- ]?by|cc0|creative commons|public domain|odc[- ]?by|odbl|open data commons|etalab|ogl|"
                          r"cc-zero|attribution|2011/833|eurostat|world bank|cc 4\.0")


def license_open(lic):
    if not lic:
        return None
    return 1 if OPEN_LICENSE.search(lic.lower()) else 0


def dedup_key(title, year=None):
    t = re.sub(r"[^a-zα-ω0-9 ]", " ", norm(title or ""))
    t = " ".join(w for w in t.split() if len(w) > 2)[:160]
    return f"{t}|{year or ''}"


def quality_score(level, n=None, representative=None, has_questionnaire=False, has_weights=False, years_old=None):
    """0–100: απλό, διαφανές σκορ (επίπεδο τεκμηρίωσης, δείγμα, αντιπροσωπευτικότητα, τεκμηρίωση, φρεσκάδα)."""
    s = {"A": 55, "B": 50, "C": 30, "D": 15}.get(level, 10)
    if n:
        s += min(15, 5 * (len(str(int(n))) - 2))  # 100→5, 1000→10, 10000+→15
    if representative == "national_probability":
        s += 15
    elif representative == "official_statistics":
        s += 20
    elif representative == "convenience":
        s -= 5
    if has_questionnaire:
        s += 5
    if has_weights:
        s += 5
    if years_old is not None and years_old > 8:
        s -= 5
    return max(0, min(100, s))
