"""
Phase 4: FINAL HOLDOUT harmonisation adapters (7 Greek-respondent survey datasets).

    python3 -I scripts/synthetic-lab/persona/harmonize_p4_holdouts.py --root . [--only <id>]

ids: wellcome2020, tisp, covidistress, banksat, culture, qog2024, dinas

For each dataset this writes
  .synthetic-lab-data/persona/harmonized/resp/<id>.csv.gz
      rid, weight (mean 1), age_band, gender, edu3, nuts1, urban, then "<id>::<var>" = response code as string
      (missing / don't know / refused / not applicable -> empty)
  .synthetic-lab-data/persona/phase4/holdouts/<id>/questions.json   (one object per included item)
  .synthetic-lab-data/persona/phase4/holdouts/<id>/meta.json

LOCKED HOLDOUT: this script never computes or prints response distributions. The only statistics it
prints are row/item counts. Item inclusion is rule-based (see INCLUSION_RULE); an item is dropped
automatically if it has <150 valid Greek answers or not 2-11 substantive categories.
It does NOT touch harmonized/files.json and does not register the files for training.
Source files are read as data only (pandas / pyreadstat); nothing in them is executed.
"""
import argparse
import json
import os
import re
import unicodedata

import numpy as np
import pandas as pd
import pyreadstat

RAW = os.path.join(".synthetic-lab-data", "raw", "sprint", "microdata")
OUT_RESP = os.path.join(".synthetic-lab-data", "persona", "harmonized", "resp")
OUT_HOLD = os.path.join(".synthetic-lab-data", "persona", "phase4", "holdouts")
MIN_N = 150
AGE_BANDS = [(17, 24, "17-24"), (25, 34, "25-34"), (35, 44, "35-44"), (45, 54, "45-54"), (55, 64, "55-64"), (65, 200, "65+")]
DEMO_COLS = ["rid", "weight", "age_band", "gender", "edu3", "nuts1", "urban"]
INCLUSION_RULE = ("All substantive attitude/behaviour/evaluation/knowledge variables with 2-11 substantive response categories "
                  "(after removing DK/refused/not-applicable); excluded: demographics, IDs, weights, timestamps, admin/interviewer "
                  "variables, free text, continuous/count variables with >11 values, producer-derived indices/recodes, screening-only "
                  "variables, items with <150 valid Greek answers, and items whose wording cannot be determined.")
NUTS2_TO_NUTS1 = {"EL30": "attica", "EL51": "north", "EL52": "north", "EL53": "north", "EL54": "north",
                  "EL61": "centre", "EL62": "centre", "EL63": "centre", "EL64": "centre", "EL65": "centre",
                  "EL41": "islands", "EL42": "islands", "EL43": "islands"}


# ----------------------------------------------------------------------------------------------- helpers

def rawp(root, *parts):
    return os.path.join(root, RAW, *parts)


def manifest_entry(root, slug):
    with open(rawp(root, "manifest.jsonl"), encoding="utf-8") as fh:
        for line in fh:
            if line.strip():
                d = json.loads(line)
                if d.get("slug") == slug:
                    return d
    return {}


def age_band(a):
    try:
        a = float(a)
    except (TypeError, ValueError):
        return None
    if a != a:
        return None
    for lo, hi, b in AGE_BANDS:
        if lo <= a <= hi:
            return b
    return None


def norm_weight(w):
    w = pd.to_numeric(pd.Series(w), errors="coerce").astype(float)
    w = w.fillna(w.mean() if w.notna().any() else 1.0)
    return (w / w.mean()).round(6).values


def code_str(v):
    if v is None or (isinstance(v, float) and v != v):
        return None
    f = float(v)
    return str(int(f)) if f.is_integer() else repr(f)


def item(var, series, text, options, dk=(), missing=(), qtype=None, source="", language="en"):
    """options: list of (code, label) in code order; dk: list of (code, label) or codes treated as DK/refused/n.a."""
    dk = [(str(d[0]), d[1]) if isinstance(d, (tuple, list)) else (str(d), None) for d in dk]
    options = [(str(c), str(l)) for c, l in options]
    if qtype is None:
        qtype = "binary" if len(options) == 2 else "ordinal"
    return {"var": var, "series": series, "text": re.sub(r"\s+", " ", text).strip(), "options": options, "dk": dk,
            "missing": [str(m) for m in missing], "type": qtype, "source": source, "language": language}


def vl_options(vl, drop):
    """Options from a value-label dict, excluding codes in drop."""
    return [(code_str(k), v) for k, v in sorted(vl.items()) if code_str(k) not in {str(d) for d in drop}]


def build_item_column(did, it):
    s = pd.to_numeric(it["series"], errors="coerce") if not isinstance(it["series"].dtype, pd.CategoricalDtype) else it["series"]
    codes = s.map(code_str)
    nonsub = {c for c, _ in it["dk"]} | set(it["missing"])
    codes = codes.where(~codes.isin(nonsub), None)
    valid = {c for c, _ in it["options"]}
    bad = sorted({c for c in codes.dropna().unique() if c not in valid})
    if bad:
        raise ValueError(f"{did}::{it['var']}: codes not covered by options/dk/missing: {bad}")
    return codes


def finish(root, did, demo, items, meta, excluded):
    """Apply inclusion thresholds, write resp csv.gz, questions.json, meta.json. Prints counts only."""
    demo = demo.reset_index(drop=True)
    cols = {}
    questions = []
    for it in items:
        it["series"] = it["series"].reset_index(drop=True)
        k = len(it["options"])
        if not 2 <= k <= 11:
            excluded.append({"variable": it["var"], "reason": f"{k} substantive response categories (rule: 2-11)"})
            continue
        col = build_item_column(did, it)
        n_valid = int(col.notna().sum())
        if n_valid < MIN_N:
            excluded.append({"variable": it["var"], "reason": f"answered by {n_valid} Greek respondents (<{MIN_N})"})
            continue
        cols[f"{did}::{it['var']}"] = col
        questions.append({"id": f"{did}::{it['var']}", "variable": it["var"], "text": it["text"], "language": it["language"],
                          "type": it["type"], "options": [{"code": c, "label": l} for c, l in it["options"]],
                          "dkCodes": [c for c, _ in it["dk"]], "source": it["source"]})
    frame = pd.concat([demo[DEMO_COLS], pd.DataFrame(cols)], axis=1)
    os.makedirs(os.path.join(root, OUT_RESP), exist_ok=True)
    hold = os.path.join(root, OUT_HOLD, did)
    os.makedirs(hold, exist_ok=True)
    frame.to_csv(os.path.join(root, OUT_RESP, f"{did}.csv.gz"), index=False, compression="gzip")
    with open(os.path.join(hold, "questions.json"), "w", encoding="utf-8") as fh:
        json.dump(questions, fh, ensure_ascii=False, indent=1)
    demo_avail = [c for c in ("age_band", "gender", "edu3", "nuts1", "urban") if demo[c].notna().any()]
    weighted = bool(meta.pop("_weighted", False))
    meta = {"id": did, **meta, "n_rows": int(len(frame)), "n_items": len(questions), "demographics_available": demo_avail,
            "weight_available": weighted, "inclusion_rule": INCLUSION_RULE,
            "excluded_variables": excluded}
    # key order as specified
    order = ["id", "title", "source", "licence", "fieldwork", "mode", "population", "n_rows", "n_items", "demographics_available", "notes"]
    meta = {**{k: meta[k] for k in order if k in meta}, **{k: v for k, v in meta.items() if k not in order}}
    with open(os.path.join(hold, "meta.json"), "w", encoding="utf-8") as fh:
        json.dump(meta, fh, ensure_ascii=False, indent=1)
    print(f"{did}: rows={len(frame)} items={len(questions)} excluded={len(excluded)} demographics={demo_avail}")
    return frame


def demo_frame(did, n):
    return pd.DataFrame({"rid": [f"{did}-{i:05d}" for i in range(n)], "weight": 1.0, "age_band": None, "gender": None,
                         "edu3": None, "nuts1": None, "urban": None})


# =============================================================================================== H1 Wellcome Global Monitor 2020

WGM_STEMS = {
    "W5": "How much do you trust each of the following? Do you trust them a lot, some, not much, or not at all? If you don’t know, please just say so. How about {}?",
    "W7": "In general, how much do you trust scientists to do the following things? Do you trust them a lot, some, not much, or not at all? If you don’t know, please just say so. {}",
    "W11": "Would you say developments in science have had a mostly positive impact, a mostly negative impact, or no impact at all on the following things in your life? {}",
    "MH2": "In your opinion, how much do you think science can explain each of the following? A lot, some, not much, or not at all? If you don’t know, please just say so. {}",
    "W15_1": "Now I’d like to ask you a few questions about coronavirus. In general, how much do you think each of the following make decisions about coronavirus based on scientific advice? A lot, some, not much, or not at all? How about {}?",
    "W15_2": "I am now going to read you two statements. For each statement, please tell me whether you strongly agree, somewhat agree, somewhat disagree, or strongly disagree. How about: After the coronavirus crisis ends, the government of Greece should spend money {}",
    "MH3": "On this survey when I say ‘extreme anxiety or depression,’ I mean a person being SO anxious or depressed that they could not continue with their regular daily activities AS THEY NORMALLY WOULD for TWO WEEKS or longer. In general, how much do you think science helps us treat the following health problems? Does it help a lot, some, not much, or not at all? {}",
    "MH4": "How important do you think it is for the national government in this country to fund research in each of the following areas of health? Is it extremely important, somewhat important, not too important, or not important at all? {}",
    "MH8": "(Asked of respondents who have ever been so anxious or depressed that they could not continue their regular daily activities for two weeks or longer.) When you were feeling SO anxious or depressed, did you ever do any of the following to make yourself feel better? {}",
    "MH9": "(Asked of respondents who did this when feeling so anxious or depressed.) Did you find the following very helpful, somewhat helpful, or not helpful in making you feel better? How about {}?",
    "WP2175x": "Have you experienced each of the following as a result of the coronavirus situation? {}",
}
CLIMATE_INTRO = ("Now I am going to ask you about climate change. Climate change, sometimes referred to as ‘global warming,’ is the term that people use to "
                 "describe how the Earth’s average temperature has increased unusually fast, and how this is largely due to human activity such as burning coal, oil, and gas. ")
WGM_TEXT = {
    "W1": ("How much do you, personally, know about science? Do you know a lot, some, not much, or nothing at all?", "ordinal"),
    "W2": ("On this survey, when I say ‘science’ I mean the understanding we have about the world from observation and testing. When I say ‘scientists’ I mean people who study the planet Earth, nature and medicine, among other things. How much did you understand the meaning of ‘science’ and ‘scientists’ that was just read? Did you understand ALL of it, SOME of it, NOT MUCH of it, or NONE of it?", "ordinal"),
    "W4": ("In Greece, how much confidence do you have in the hospitals and health clinics? A lot, some, not much, or none at all? If you don’t know, please just say so.", "ordinal"),
    "W5A": (WGM_STEMS["W5"].format("the people in your neighborhood"), "ordinal"),
    "W5B": (WGM_STEMS["W5"].format("the national government in this country"), "ordinal"),
    "W5C": (WGM_STEMS["W5"].format("scientists in this country"), "ordinal"),
    "W5D": (WGM_STEMS["W5"].format("journalists in this country"), "ordinal"),
    "W5E": (WGM_STEMS["W5"].format("doctors and nurses in this country"), "ordinal"),
    "W5F": (WGM_STEMS["W5"].format("people who work at charitable organizations/NGOs in this country"), "ordinal"),
    "W5G": (WGM_STEMS["W5"].format("traditional healers in this country"), "ordinal"),
    "W6": ("In general, would you say that you trust science a lot, some, not much, or not at all? If you don’t know, please just say so.", "ordinal"),
    "W7A": (WGM_STEMS["W7"].format("Find out accurate information about the world."), "ordinal"),
    "W7B": (WGM_STEMS["W7"].format("Do their work with the intention of benefiting the public."), "ordinal"),
    "W7C": ("In general, how much do you think the leaders in the national government value the opinions and expertise of scientists? A lot, some, not much, or not at all?", "ordinal"),
    "W8": ("In Greece, do you think the work that scientists do benefits most, some, or very few people?", "ordinal"),
    "W9": ("In Greece, do you think the work that scientists do has benefited people like you a lot, a little, or not at all?", "ordinal"),
    "W10": ("Overall, do you think that science and technology will increase or decrease the number of jobs in your local area in the next five years?", "nominal"),
    "W11A": (WGM_STEMS["W11"].format("Your personal health"), "nominal"),
    "W11B": (WGM_STEMS["W11"].format("The quality of the environment in your local area or the city where you live"), "nominal"),
    "MH2A": (WGM_STEMS["MH2"].format("How the human body works"), "ordinal"),
    "MH2B": (WGM_STEMS["MH2"].format("How feelings and emotions work"), "ordinal"),
    "W13": (CLIMATE_INTRO + "Have you heard about climate change or global warming before today?", "binary"),
    "W14": (CLIMATE_INTRO + "(Asked of those who have heard of it.) Thinking about the issue of climate change or global warming, how well do you feel you understand this issue? Would you say you understand it very well, fairly well, not very well, or not at all?", "ordinal"),
    "W15": (CLIMATE_INTRO + "(Asked of those who have heard of it.) Do you think climate change or global warming is a major threat, a minor threat, or not a threat to people in Greece right now?", "nominal"),
    "W15_1A": (WGM_STEMS["W15_1"].format("the national government"), "ordinal"),
    "W15_1B": (WGM_STEMS["W15_1"].format("friends and family"), "ordinal"),
    "W15_1C": (WGM_STEMS["W15_1"].format("the World Health Organization (W.H.O.)"), "ordinal"),
    "W15_1D": (WGM_STEMS["W15_1"].format("doctors and nurses in this country"), "ordinal"),
    "W15_1E": (WGM_STEMS["W15_1"].format("religious leaders"), "ordinal"),
    "W15_2A": (WGM_STEMS["W15_2"].format("to help other countries prevent and cure diseases WHEREVER they occur."), "ordinal"),
    "W15_2B": (WGM_STEMS["W15_2"].format("on preventing and curing diseases ONLY if they pose a risk to people in THIS country."), "ordinal"),
    "MH1": ("Thinking about a person’s overall health, do you think mental health is more important, as important, or less important than physical health for a person’s well-being?", "ordinal"),
    "MH3A": (WGM_STEMS["MH3"].format("Cancer"), "ordinal"),
    "MH3B": (WGM_STEMS["MH3"].format("Extreme anxiety or depression"), "ordinal"),
    "MH3C": (WGM_STEMS["MH3"].format("Infectious diseases, such as Malaria"), "ordinal"),
    "MH3D": (WGM_STEMS["MH3"].format("Obesity – being extremely overweight"), "ordinal"),
    "MH4A": (WGM_STEMS["MH4"].format("Cancer"), "ordinal"),
    "MH4B": (WGM_STEMS["MH4"].format("Extreme anxiety or depression"), "ordinal"),
    "MH5": ("In general, if someone in your local community was experiencing extreme anxiety or depression, how comfortable do you think they would feel speaking about it with someone they know? Very comfortable, somewhat comfortable, or not at all comfortable?", "ordinal"),
    "MH6": ("Thinking about your close friends and family members, have any of them ever been SO anxious or depressed that they could not continue with their regular daily activities AS THEY NORMALLY WOULD for TWO WEEKS or longer?", "binary"),
    "MH7A": ("And what about you, personally? Have you ever been SO anxious or depressed that you could not continue your regular daily activities AS YOU NORMALLY WOULD for TWO WEEKS or longer?", "binary"),
    "MH7C": ("(Asked of respondents who have ever felt SO anxious or depressed that they could not continue their regular daily activities for two weeks or longer.) Have you felt this way more than once?", "binary"),
    "MH8A": (WGM_STEMS["MH8"].format("Talk to a mental health professional"), "binary"),
    "MH8B": (WGM_STEMS["MH8"].format("Engage in religious or spiritual activities, or talk to a religious leader"), "binary"),
    "MH8C": (WGM_STEMS["MH8"].format("Talk to friends or family"), "binary"),
    "MH8D": (WGM_STEMS["MH8"].format("Take medication prescribed by a healthcare professional"), "binary"),
    "MH8E": (WGM_STEMS["MH8"].format("Improve healthy lifestyle behaviors, such as exercise, sleep, and diet"), "binary"),
    "MH8F": (WGM_STEMS["MH8"].format("Make a major change in your work situation"), "binary"),
    "MH8G": (WGM_STEMS["MH8"].format("Make a major change in your personal relationships"), "binary"),
    "MH8H": (WGM_STEMS["MH8"].format("Spend time in nature/the outdoors"), "binary"),
    "MH9A": (WGM_STEMS["MH9"].format("talking to a mental health professional"), "ordinal"),
    "MH9B": (WGM_STEMS["MH9"].format("engaging in religious or spiritual activities, or talking to a religious leader"), "ordinal"),
    "MH9C": (WGM_STEMS["MH9"].format("talking to friends or family"), "ordinal"),
    "MH9D": (WGM_STEMS["MH9"].format("taking medication prescribed by a healthcare professional"), "ordinal"),
    "MH9E": (WGM_STEMS["MH9"].format("improving healthy lifestyle behaviors, such as exercise, sleep, and diet"), "ordinal"),
    "MH9F": (WGM_STEMS["MH9"].format("making a major change in your work situation"), "ordinal"),
    "MH9G": (WGM_STEMS["MH9"].format("making a major change in your personal relationships"), "ordinal"),
    "MH9H": (WGM_STEMS["MH9"].format("spending time in nature/the outdoors"), "ordinal"),
    "W27": ("Have you used social media, such as Facebook, WhatsApp, Twitter, Instagram or other social media apps in the past 30 days?", "binary"),
    "W28": ("(Asked of social media users.) About how often do you use social media?", "ordinal"),
    "W29": ("(Asked of social media users.) How often do you see information about health on social media? All of the time, most of the time, some of the time, or never?", "ordinal"),
    "W30": ("The next question asks about science and religion. Please remember there is no right or wrong answer and that your response is confidential. Generally speaking, if science disagrees with the teachings of your religion, which do you believe? Science or the teachings of your religion?", "nominal"),
    "WP21757": ("In general, to what extent has your own life been affected by the coronavirus situation?", "nominal"),
    "WP21758": (WGM_STEMS["WP2175x"].format("Temporarily stopped working at your job or business"), "nominal"),
    "WP21759": (WGM_STEMS["WP2175x"].format("Lost your job or business"), "nominal"),
    "WP21760": (WGM_STEMS["WP2175x"].format("Worked fewer hours at your job or business"), "nominal"),
    "WP21761": (WGM_STEMS["WP2175x"].format("Received LESS money than usual from your employer or business"), "nominal"),
    "WP21768": ("Vaccines are given to people to help prevent specific diseases. If a vaccine to prevent coronavirus was available right now at no cost, would you agree to be vaccinated?", "binary"),
}


def h1_wellcome(root):
    did = "wellcome2020"
    path = rawp(root, "wellcome_global_monitor_2020", "wgm-full-wave2-public-file.sav")
    df, m = pyreadstat.read_sav(path)
    g = df[df.COUNTRYNEW == "Greece"].copy()
    n_gr = len(g)
    age = pd.to_numeric(g.Age, errors="coerce").where(lambda a: a < 100)  # 100 = DK/refused, 99 = 99+
    g = g[~(age < 17)].reset_index(drop=True)
    age = pd.to_numeric(g.Age, errors="coerce").where(lambda a: a < 100)
    demo = demo_frame(did, len(g))
    demo["weight"] = norm_weight(g.WGT)
    demo["age_band"] = [age_band(a) for a in age]
    demo["gender"] = pd.to_numeric(g.Gender, errors="coerce").map({1.0: "male", 2.0: "female"})
    demo["edu3"] = pd.to_numeric(g.Education, errors="coerce").map({1.0: "low", 2.0: "medium", 3.0: "high"})
    src = ("Wellcome Global Monitor 2020 Full Questionnaire (WGM_Full_Questionnaire.pdf, wellcome.ac.uk/sites/default/files/2021-11/; "
           "English master; '(country)' filled as Greece) + codes/labels from SPSS value labels and the data dictionary docx")
    items = []
    for var, (text, qtype) in WGM_TEXT.items():
        vl = m.variable_value_labels.get(var, {})
        dk = [(8, "(DK)"), (9, "(Refused)")] if var.startswith("WP") else [(99, "DK/Refused")]
        missing = [98] if var == "W2" else []  # code 98 has an empty label
        opts = vl_options(vl, [d[0] for d in dk] + missing)
        items.append(item(var, g[var], text, opts, dk=dk, missing=missing, qtype=qtype, source=f"{src}; item {var}", language="en"))
    excluded = [
        {"variable": "W3", "reason": "standardized recode of education level where respondent last learned about science (education/demographic background; producer-recoded)"},
        {"variable": "MH7B", "reason": "open-ended age (continuous, >11 values)"},
        {"variable": "MH7B_2", "reason": "follow-up asked only when MH7B unknown; answered by <150 Greek respondents"},
        {"variable": "age_mh", "reason": "producer-derived combination of MH7B and MH7B_2"},
        {"variable": "Subjective_Income", "reason": "household income feeling (socio-economic background variable, treated as demographic)"},
        {"variable": "EMP_2010, Household_Income, Education, Gender, Age, age_var1-3", "reason": "demographics / derived demographic recodes"},
        {"variable": "COUNTRYNEW, WPID_RANDOM, WGT, PROJWT, FIELD_DATE, YEAR_WAVE, Global11Regions, wbi", "reason": "ID / weight / admin / country-level variables"},
    ]
    man = manifest_entry(root, "wellcome_global_monitor_2020")
    meta = {"title": "Wellcome Global Monitor 2020 (Covid-19 wave) — Greece", "source": "Wellcome Trust / Gallup World Poll 2020; " + man.get("landing_page", ""),
            "licence": man.get("licence"), "fieldwork": "2020-11 to 2020-11",
            "mode": "Telephone (landline and mobile), Greek language, Gallup",
            "population": "Greek residents aged 15+ with phone access (rows aged 15-16 dropped)",
            "_weighted": True,
            "notes": [f"Greek rows in file: {n_gr}; dropped {n_gr - len(g)} respondents aged <17.",
                      "Fieldwork verified: WGM 2020 methodology report lists Greece Nov 2 – Nov 26, 2020 (landline+mobile, Greek, n=1,006); FIELD_DATE=2020-11-01 in data.",
                      "Weight = WGT (national weight) normalized to mean 1.",
                      "edu3 from Gallup 'Education' (1 elementary or less/≤8 yrs=low, 2 secondary 9-15 yrs=medium, 3 tertiary=high); Gallup 'secondary' also includes some lower-secondary completers.",
                      "No region or urban/rural variable in the public file (nuts1/urban null).",
                      "Question wording is the English master questionnaire; Greek interviews used Gallup's Greek translation (not available).",
                      "WP21757: questionnaire lists A lot/Some/Not much/Not at all but data value labels are 1 A lot, 2 Some, 3 Not at all, 4 (Never heard of it); data labels used.",
                      "Parenthesised options are volunteered responses; kept as substantive options. 'Does not apply/No job' (code 3) in WP21758-61 kept as substantive.",
                      "MH7C/MH8*/MH9* are filtered (asked only of those who reported anxiety/depression); MH9 items with <150 valid answers are dropped automatically."]}
    return finish(root, did, demo, items, meta, excluded)


# =============================================================================================== H2 TISP

TISP_FREQ = [("1", "Ποτέ"), ("2", "Μια ή δυο φορές το χρόνο"), ("3", "Αρκετές φορές το χρόνο"), ("4", "Μια ή δυο φορές το μήνα"),
             ("5", "Μια ή δυο φορές την εβδομάδα"), ("6", "Σχεδόν κάθε μέρα"), ("7", "Μια ή δυο φορές την ημέρα")]


def five(lo, hi):
    return [("1", lo), ("2", "2"), ("3", "3"), ("4", "4"), ("5", hi)]


TISP_TRUST_PRE = ("Μας ενδιαφέρει η γνώμη σας για τους επιστήμονες στη χώρα σας, συμπεριλαμβανομένων των επιστημόνων που εργάζονται σε πανεπιστήμια, "
                  "στην κυβέρνηση, σε εταιρείες και σε μη κερδοσκοπικούς οργανισμούς. ")
TISP_STEMS = {
    "SCIINFO": "Οι παρακάτω ερωτήσεις αφορούν τη χρήση μέσων ενημέρωσης. Τους τελευταίους 12 μήνες, πόσο συχνά βρήκατε πληροφορίες για την επιστήμη στα ακόλουθα μέρη; {}",
    "SCIENGAGE": "Τους τελευταίους 12 μήνες, πόσο συχνά κάνατε τα παρακάτω; {}",
    "GOALS_PRIO": "Ποιους στόχους οι επιστήμονες θα έπρεπε να θέσουν ως προτεραιότητα; {}",
    "GOALS_TACKLE": "Πόσο ισχυρά πιστεύετε πως η επιστήμη στοχεύει να αντιμετωπίσει τους εξής στόχους; {}",
    "NORMPERC": "Οι παρακάτω ερωτήσεις αφορούν τη σχέση επιστήμης και πολιτικής. Σε ποιο βαθμό συμφωνείτε ή διαφωνείτε με τις παρακάτω δηλώσεις; {}",
    "WILLVUL": "Τώρα μας ενδιαφέρει η γνώμη σας για προσωπικές και πολιτικές αποφάσεις που συσχετίζονται με την επιστήμη (π.χ. για την ενεργειακή πολιτική, την πολιτική υγείας). {}",
    "OUTSPOKEN": "Παρακαλούμε, σημειώστε πόσο συμφωνείτε ή διαφωνείτε με τις παρακάτω δηλώσεις. {}",
    "SCIPOP": "Οι παρακάτω δηλώσεις αφορούν τη σχέση της επιστήμης με την κοινωνία. Πόσο συμφωνείτε ή διαφωνείτε με αυτές τις δηλώσεις; {}",
    "SDO": "Υπάρχουν πολλά είδη ομάδων στον κόσμο: άνδρες και γυναίκες, εθνοτικές και θρησκευτικές ομάδες, εθνικότητες, πολιτικές παρατάξεις. Σε ποιο βαθμό τάσσεστε υπέρ ή κατά των παρακάτω, σχετικά με τις ομάδες γενικά; {}",
    "CLIM_EMO": "Σε ποιο βαθμό η κλιματική αλλαγή σας κάνει να αισθάνεστε κάποιο από τα παρακάτω; {}",
    "CLIM_GOV": "Σε ποιο βαθμό συμφωνείτε ή διαφωνείτε με τις παρακάτω δηλώσεις; Σε σχέση με την κλιματική αλλαγή, πιστεύω ότι η κυβέρνησή στη χώρα μου… {}",
    "CLIM_POLSUPPORT": "Πολλές χώρες έχουν υιοθετήσει πολιτικές για τη μείωση των εκπομπών άνθρακα και τον περιορισμό της κλιματικής αλλαγής. Αυτό μπορεί για παράδειγμα να περιλαμβάνει την εφαρμογή νόμων που αποσκοπούν στη μείωση των αερίων του θερμοκηπίου. Παρακάτω, παρακαλούμε υποδείξτε το βαθμό στήριξής σας στις παρακάτω πολιτικές. {}",
    "CLIM_WEATHERPAST": "Οι επόμενες ερωτήσεις αφορούν την κλιματική αλλαγή και τα καιρικά φαινόμενα. Για να απαντήσετε σε αυτές τις ερωτήσεις, παρακαλούμε σκεφτείτε τη χώρα σας. Σε ποιο βαθμό πιστεύετε ότι η κλιματική αλλαγή έχει αυξήσει τις επιπτώσεις των ακόλουθων καιρικών φαινομένων κατά τις τελευταίες δεκαετίες; {}",
    "CLIM_WEATHERFUTU": "(Σκεφτείτε τη χώρα σας.) Σε ποιο βαθμό πιστεύετε ότι η κλιματική αλλαγή θα αυξήσει τις επιπτώσεις των ακόλουθων καιρικών φαινομένων στο μέλλον; {}",
}
_AGREE5 = five("Διαφωνώ έντονα", "Συμφωνώ έντονα")
_AGREE5B = five("Διαφωνώ απόλυτα", "Συμφωνώ απόλυτα")
_NOTATALL5 = five("Καθόλου", "Πάρα πολύ")
_WEATHER = {"floods": "Πλημμύρες", "heatwaves": "Κύματα καύσωνα", "heavystorms": "Δυνατές καταιγίδες", "wildfires": "Πυρκαγιές", "heavyrain": "Δυνατή βροχή", "droughts": "Ξηρασία"}
_REGIONS = [("1", "Αφρική"), ("2", "Ασία"), ("3", "Αυστραλία και Ωκεανία"), ("4", "Ευρώπη"), ("5", "Λατινική Αμερική"), ("6", "Βόρεια Αμερική")]
# var -> (text, options, dk, type)
TISP_ITEMS = {}
for k, v in {"newspapersmags": "Σε άρθρα ειδήσεων σε έντυπες εφημερίδες ή περιοδικά",
             "tvradio": "Σε ειδησεογραφικές εκπομπές ή ντοκιμαντέρ στην τηλεόραση ή το ραδιόφωνο",
             "newswebsitesapps": "Σε άρθρα ειδήσεων σε ιστοσελίδες ειδήσεων ή σε εφαρμογές ειδήσεων",
             "videospodcasts": "Σε βίντεο ή podcast σε ιστότοπους ειδήσεων ή σε εφαρμογές ειδήσεων",
             "filmsseries": "Σε ταινίες μυθοπλασίας ή σειρές (π.χ. στην τηλεόραση, στον κινηματογράφο ή σε άλλες συσκευές)",
             "books": "Σε βιβλία μυθοπλασίας, κόμικς κ.λπ.",
             "socialmedia": "Στα μέσα κοινωνικής δικτύωσης (π.χ. vlogs, YouTube, Facebook, TikTok, Instagram)",
             "messengers": "Σε συνομιλίες ανταλλαγής άμεσων μηνυμάτων με φίλους ή συγγενείς (π.χ. WhatsApp, Line, Telegram)",
             "museumszoos": "Σε μουσεία, ζωολογικούς κήπους ή δημόσιες ομιλίες",
             "rlconversations": "Σε συζητήσεις με φίλους ή συγγενείς (δηλαδή εκτός του ίντερνετ και των εφαρμογών ανταλλαγής μηνυμάτων)"}.items():
    TISP_ITEMS[f"SCIINFO_{k}"] = (TISP_STEMS["SCIINFO"].format(v), TISP_FREQ, [], "ordinal")
for k, v in {"conversations": "Είχατε συζητήσεις με φίλους/ες, οικογένεια ή συναδέλφους για επιστημονικά ζητήματα (π.χ. κλιματική αλλαγή, εμβολιασμός, διατροφή, νέες τεχνολογίες)",
             "messengers": "Συζητήσατε σε εφαρμογές ανταλλαγής μηνυμάτων για επιστημονικά ζητήματα (π.χ. WhatsApp, Telegram, Viber, Facebook Messenger)",
             "socialmedia": "Μοιραστήκατε ή σχολιάσατε αναρτήσεις στα μέσα κοινωνικής δικτύωσης σχετικά με επιστημονικά ζητήματα",
             "publicprotests": "Πήρατε μέρος σε δημόσιες συγκεντρώσεις ή διαμαρτυρίες σχετικά με επιστημονικά ζητήματα (π.χ. διαμαρτυρίες για τον COVID-19, διαδηλώσεις \"Παρασκευές για το μέλλον\", \"Πορεία για την Επιστήμη\")"}.items():
    TISP_ITEMS[f"SCIENGAGE_{k}"] = (TISP_STEMS["SCIENGAGE"].format(v), TISP_FREQ, [], "ordinal")
TISP_ITEMS["BENEFIT_ONESELF"] = ("Κατα την γνώμη σας, σε ποιο βαθμό η επιστημονική έρευνα βοηθάει ανθρώπους σαν και εσάς στην χώρα σας;", _NOTATALL5, [], "ordinal")
TISP_ITEMS["BENEFIT_REGION_MOST"] = ("Ποιά περιοχή πιστεύετε πως επωφελείται ΠΕΡΙΣΣΟΤΕΡΟ από όλες από την δουλειά που κάνουν οι επιστήμονες;", _REGIONS, [], "nominal")
TISP_ITEMS["BENEFIT_REGION_LEAST"] = ("Ποιά περιοχή πιστεύετε πως επωφελείται ΛΙΓΟΤΕΡΟ από όλες από την δουλειά που κάνουν οι επιστήμονες;", _REGIONS, [], "nominal")
_GOALS = {"health": "Βελτίωση της δημόσιας υγείας", "energy": "Επίλυση προβλημάτων ενέργειας (ανανεώσιμες πηγές, ενεργειακή ασφάλεια)",
          "poverty": "Καταπολέμηση της φτώχειας", "defense": "Ανάπτυξη αμυντικής και στρατιωτικής τεχνολογίας"}
for k, v in _GOALS.items():
    TISP_ITEMS[f"GOALS_PRIO_{k}"] = (TISP_STEMS["GOALS_PRIO"].format(v), five("Πολύ χαμηλή προτεραιότητα", "Πολύ υψηλή προτεραιότητα"), [], "ordinal")
for k, v in _GOALS.items():
    TISP_ITEMS[f"GOALS_TACKLE_{k}"] = (TISP_STEMS["GOALS_TACKLE"].format(v), _NOTATALL5, [], "ordinal")
for k, v in {"integrate": "Οι επιστήμονες θα πρέπει να συνεργαστούν στενά με τους/τις πολιτικούς για να ενσωματώσουν τα επιστημονικά αποτελέσματα στη χάραξη πολιτικών.",
             "advocate": "Οι επιστήμονες θα πρέπει να υποστηρίζουν ενεργά συγκεκριμένες πολιτικές.",
             "communicate": "Οι επιστήμονες θα πρέπει να κάνουν γνωστά τα ευρήματά τους στους/στις πολιτικούς.",
             "involved": "Οι επιστήμονες θα πρέπει να εμπλέκονται περισσότερο στη διαδικασία χάραξης πολιτικών.",
             "outreach": "Οι επιστήμονες θα πρέπει να επικοινωνούν για την επιστήμη με το ευρύ κοινό.",
             "independent": "Οι επιστήμονες θα πρέπει να παραμείνουν ανεξάρτητοι από τη διαδικασία της χάραξης πολιτικών."}.items():
    TISP_ITEMS[f"NORMPERC_{k}"] = (TISP_STEMS["NORMPERC"].format(v), _AGREE5, [], "ordinal")
TISP_ITEMS["WILLVUL_ppl"] = (TISP_STEMS["WILLVUL"].format("Πόσο πολύ ή λίγο πρέπει οι άνθρωποι να βασίζονται στην καθοδήγηση από τους επιστήμονες όταν κάνουν επιλογές για τον τρόπο ζωής τους που σχετίζονται με την επιστήμη;"), _NOTATALL5, [], "ordinal")
TISP_ITEMS["WILLVUL_gov"] = (TISP_STEMS["WILLVUL"].format("Πόσο πολύ ή λίγο πρέπει οι κυβερνήσεις να βασίζονται στην καθοδήγηση των επιστημόνων όταν λαμβάνουν αποφάσεις που σχετίζονται με την επιστήμη;"), _NOTATALL5, [], "ordinal")
TISP_ITEMS["WILLVUL_you"] = (TISP_STEMS["WILLVUL"].format("Πόσο πολύ ή λίγο έλεγχο θέλετε να έχουν οι επιστήμονες στις κυβερνητικές αποφάσεις που σχετίζονται με την επιστήμη;"), five("Καθόλου έλεγχο", "Πολύ ισχυρό έλεγχο"), [], "ordinal")
for k, (q, labs) in {
        "expert": ("Πόσο έμπειροι ή άπειροι είναι οι περισσότεροι επιστήμονες;", ["Πολύ άπειροι", "Μάλλον άπειροι", "Ούτε άπειροι ούτε έμπειροι", "Μάλλον έμπειροι", "Πολύ έμπειροι"]),
        "honest": ("Πόσο έντιμοι ή ανέντιμοι είναι οι περισσότεροι επιστήμονες;", ["Πολύ ανέντιμοι", "Μάλλον ανέντιμοι", "Ούτε ανέντιμοι ούτε έντιμοι", "Μάλλον έντιμοι", "Πολύ έντιμοι"]),
        "concerned": ("Πόσο ενδιαφέρονται ή δεν ενδιαφέρονται οι περισσότεροι επιστήμονες για την ευημερία των ανθρώπων;", ["Δεν ενδιαφέρονται καθόλου", "Μάλλον δεν ενδιαφέρονται", "Ούτε δεν ενδιαφέρονται, ούτε ενδιαφέρονται", "Μάλλον ενδιαφέρονται", "Ενδιαφέρονται πολύ"]),
        "open": ("Πόσο δεκτικοί είναι οι περισσότεροι επιστήμονες στην ανατροφοδότηση;", ["Καθόλου δεκτικοί", "Μάλλον μη δεκτικοί", "Ούτε δεκτικοί, ούτε μη δεκτικοί", "Μάλλον δεκτικοί", "Πολύ δεκτικοί"]),
        "intellig": ("Πόσο ευφυείς ή μη ευφυείς είναι οι περισσότεροι επιστήμονες;", ["Καθόλου ευφυείς", "Μάλλον μη ευφυείς", "Ούτε μη ευφυείς ούτε ευφυείς", "Μάλλον ευφυείς", "Πολύ ευφυείς"]),
        "ethical": ("Πόσο ηθικοί ή ανήθικοι είναι οι περισσότεροι επιστήμονες;", ["Τελείως ανήθικοι", "Μάλλον ανήθικοι", "Ούτε ανήθικοι ούτε ηθικοί", "Μάλλον ηθικοί", "Πολύ ηθικοί"]),
        "improve": ("Πόσο πρόθυμοι ή απρόθυμοι είναι οι περισσότεροι επιστήμονες ως προς το να βελτιώσουν τη ζωές των άλλων;", ["Τελείως απρόθυμοι", "Μάλλον απρόθυμοι", "Ούτε απρόθυμοι ούτε πρόθυμοι", "Μάλλον πρόθυμοι", "Πολύ πρόθυμοι"]),
        "trans": ("Πόσο πρόθυμοι ή απρόθυμοι είναι οι περισσότεροι επιστήμονες να είναι διαφανείς σε σχέση με το τι κάνουν;", ["Τελείως απρόθυμοι", "Μάλλον απρόθυμοι", "Ούτε απρόθυμοι ούτε πρόθυμοι", "Μάλλον πρόθυμοι", "Πολύ πρόθυμοι"]),
        "qualified": ("Kατά πόσο οι περισσότεροι επιστήμονες έχουν ή δεν έχουν τα προσόντα να διεξάγουν υψηλής ποιότητας έρευνα;", ["Σίγουρα δεν έχουν τα προσόντα", "Μάλλον δεν έχουν τα προσόντα", "Ούτε ναι, ούτε όχι", "Μάλλον έχουν τα προσόντα", "Σίγουρα έχουν τα προσόντα"]),
        "sincere": ("Πόσο ειλικρινείς ή ανειλικρινείς είναι οι περισσότεροι επιστήμονες;", ["Πολύ ανειλικρινείς", "Μάλλον ανειλικρινείς", "Ούτε ειλικρινείς ούτε ανειλικρινείς", "Μάλλον ειλικρινείς", "Πολύ ειλικρινείς"]),
        "otherint": ("Πόσο λαμβάνουν υπόψη ή όχι οι περισσότεροι επιστήμονες τα συμφέροντα των άλλων;", ["Δεν τα λαμβάνουν καθόλου υπόψη", "Μάλλον δεν τα λαμβάνουν υπόψη", "Ούτε τα λαμβάνουν, ούτε δεν τα λαμβάνουν υπόψη", "Μάλλον τα λαμβάνουν υπόψη", "Τα λαμβάνουν πολύ υπόψη"]),
        "otherviews": ("Πόση προσοχή δίνουν οι επιστήμονες στις απόψεις των άλλων;", ["Πολύ λίγη προσοχή", "Μάλλον λίγη προσοχή", "Ουτέ λίγη ουτέ πολλή προσοχή", "Μάλλον πολλή προσοχή", "Πάρα πολλή προσοχή"]),
}.items():
    TISP_ITEMS[f"TRUST_SCI_{k}"] = (TISP_TRUST_PRE + q, [(str(i + 1), l) for i, l in enumerate(labs)], [], "ordinal")
TISP_ITEMS["TRUST_METHOD"] = ("Σε ποιο βαθμό συμφωνείτε ή διαφωνείτε με την παρακάτω δήλωση; «Οι μέθοδοι επιστημονικής έρευνας είναι ο καλύτερος τρόπος για να μάθουμε αν κάτι είναι αλήθεια ή ψέμα».", _AGREE5, [], "ordinal")
TISP_ITEMS["TRUST_PEW"] = ("Πόση εμπιστοσύνη έχετε στους επιστήμονες, ότι ενεργούν με γνώμονα το δημόσιο συμφέρον;", five("Καθόλου εμπιστοσύνη", "Μεγάλη εμπιστοσύνη"), [], "ordinal")
for k, v in {"othersthink": "Θα μοιραστώ τις απόψεις μου σχετικά με επιστημονικά ζητήματα, ανεξάρτητα από το τι σκέφτονται οι άλλοι για αυτά.",
             "isolate": "Θα μοιραστώ τις απόψεις μου για επιστημονικά ζητήματα, ακόμα κι αν αυτό μπορεί να με απομονώσει από άλλους.",
             "against": "Θα μοιραστώ τις απόψεις μου για επιστημονικά ζητήματα, ακόμα κι αν πιστεύω ότι άλλοι έχουν αντίθετη άποψη."}.items():
    TISP_ITEMS[f"OUTSPOKEN_{k}"] = (TISP_STEMS["OUTSPOKEN"].format(v), _AGREE5B, [], "ordinal")
for k, v in {"common": "Αυτό που έχουν κοινό οι απλοί άνθρωποι, είναι ότι στην καθημερινότητά τους εμπιστεύονται την κοινή λογική τους.",
             "good": "Οι απλοί άνθρωποι έχουν καλό και ειλικρινή χαρακτήρα.",
             "advantage": "Οι επιστήμονες ενδιαφέρονται μόνο για το συμφέρον τους.",
             "cahoots": "Οι επιστήμονες έχουν κρυφή συνεργασία με τους πολιτικούς και τις επιχειρήσεις.",
             "influence": "Οι απλοί άνθρωποι πρέπει να έχουν επιρροή στο έργο των επιστημόνων.",
             "involved": "Οι απλοί άνθρωποι πρέπει να συμμετέχουν στις αποφάσεις σχετικά με τα θέματα που ερευνούν οι επιστήμονες.",
             "lifeexp": "Οι απλοί άνθρωποι πρέπει να εμπιστεύονται τις εμπειρίες ζωής τους περισσότερο από τις συστάσεις των επιστημόνων.",
             "rely": "Η κοινωνία μας θα πρέπει να βασίζεται περισσότερο στην κοινή λογική παρά σε επιστημονικές μελέτες."}.items():
    TISP_ITEMS[f"SCIPOP_{k}"] = (TISP_STEMS["SCIPOP"].format(v), _AGREE5, [], "ordinal")
_SDO_OPTS = [("1", "Τελείως κατά")] + [(str(i), str(i)) for i in range(3, 10)] + [("10", "Τελείως υπέρ")]
for k, v in {"allgroupsconsider": "Βάζοντας προτεραιότητες, πρέπει να λαμβάνουμε υπόψη όλες τις ομάδες.",
             "notpushequality": "Δεν πρέπει να προωθούμε την ισότητα μεταξύ ομάδων.",
             "equalityideal": "Η ισότητα μεταξύ των ομάδων πρέπει να είναι το ιδανικό μας.",
             "superiordominate": "Οι ανώτερες ομάδες πρέπει να κυριαρχούν τις κατώτερες ομάδες."}.items():
    TISP_ITEMS[f"SDO_{k}"] = (TISP_STEMS["SDO"].format(v), _SDO_OPTS, [], "ordinal")
TISP_ITEMS["CLIM_TRUST"] = ("Στο υπόλοιπο της έρευνας, θα θέλαμε να σας κάνουμε μερικές ερωτήσεις σχετικά με το θέμα της κλιματικής αλλαγής. Σε ποιο βαθμό εμπιστεύεστε τους επιστήμονες στη χώρα σας που εργάζονται στον τομέα της κλιματικής αλλαγής;", _NOTATALL5, [], "ordinal")
for k, v in {"helpless": "Αβοήθητος/η", "anxious": "Ανήσυχος/η", "optimistic": "Αισιόδοξος/η", "angry": "Θυμωμένος/η", "guilty": "Ένοχος/η",
             "ashamed": "Ντροπή", "depressed": "Μελαγχολικός/ή", "pessimistic": "Απαισιόδοξος/η", "indifferent": "Αδιάφορος/η"}.items():
    TISP_ITEMS[f"CLIM_EMO_{k}"] = (TISP_STEMS["CLIM_EMO"].format(v), _NOTATALL5, [], "ordinal")
for k, v in {"concerns": "Λαμβάνει στα σοβαρά τις ανησυχίες μου", "doingenough": "Κάνει αρκετά για να αποφύγει την κλιματική αλλαγή",
             "dismisspeople": "Παραβλέπει την αγωνία των ανθρώπων", "science": "Ενεργεί σύμφωνα με την επιστήμη του κλίματος",
             "futuregens": "Προστατεύει τις μελλοντικές γενιές", "trustworthy": "Είναι αξιόπιστη",
             "lying": "Λέει ψέματα σχετικά με την αποτελεσματικότητα της δράσης της"}.items():
    TISP_ITEMS[f"CLIM_GOV_{k}"] = (TISP_STEMS["CLIM_GOV"].format(v), _AGREE5B, [], "ordinal")
for k, v in {"fueltax": "Αύξηση των φόρων άνθρακα στο αέριο και στα ορυκτά καύσιμα ή στον άνθρακα",
             "publictransport": "Επέκταση των υποδομών για τις δημόσιες συγκοινωνίες",
             "sustenergy": "Αύξηση της χρήσης βιώσιμης ενέργειας όπως η αιολική και η ηλιακή ενέργεια",
             "protection": "Προστασία δασικών και χερσαίων εκτάσεων",
             "foodtax": "Αύξηση των φόρων στα τρόφιμα υψηλής έντασης εκπομπών άνθρακα (π.χ. βόειο κρέας και γαλακτοκομικά προϊόντα)"}.items():
    TISP_ITEMS[f"CLIM_POLSUPPORT_{k}"] = (TISP_STEMS["CLIM_POLSUPPORT"].format(v), [("1", "Καθόλου"), ("2", "Μέτρια"), ("3", "Πάρα πολύ")],
                                          [("4", "Δεν έχει σχέση με εμένα (not applicable)")], "ordinal")
for k, v in _WEATHER.items():
    TISP_ITEMS[f"CLIM_WEATHERPAST_{k}"] = (TISP_STEMS["CLIM_WEATHERPAST"].format(v), _NOTATALL5, [], "ordinal")
for k, v in _WEATHER.items():
    TISP_ITEMS[f"CLIM_WEATHERFUTU_{k}"] = (TISP_STEMS["CLIM_WEATHERFUTU"].format(v), _NOTATALL5, [], "ordinal")
TISP_ITEMS["DEM_POL_conservative"] = ("Οι πολιτικοί προσανατολισμοί ταξινομούνται συχνά σε ένα φάσμα \"αριστερά-δεξιά\" ή \"φιλελευθερισμός-συντηρητισμός\". Παρακαλούμε δηλώστε τον πολιτικό σας προσανατολισμό.",
                                      five("Πολύ φιλελεύθερος/η", "Πολύ συντηρητικός/ή"), [("99", "Δεν ξέρω")], "ordinal")
TISP_ITEMS["DEM_POL_right"] = ("Οι πολιτικοί προσανατολισμοί ταξινομούνται συχνά σε ένα φάσμα \"αριστερά-δεξιά\". Πού θα τοποθετούσατε ιδεολογικά τον εαυτό σας στην παρακάτω κλίμακα;",
                               five("Άκρα αριστερά", "Άκρα δεξιά"), [("99", "Δεν ξέρω")], "ordinal")
TISP_ITEMS["DEM_RELIGIOUS"] = ("Παρακαλούμε, υποδείξτε τον βαθμό στον οποίο θεωρείτε τον εαυτό σας θρησκευόμενο.",
                               five("Καθόλου θρησκευόμενος/η", "Πάρα πολύ θρησκευόμενος/η"), [], "ordinal")


def h2_tisp(root):
    did = "tisp"
    df = pd.read_csv(rawp(root, "osf_5c3qd_tisp", "ds_final.csv"), sep=";", decimal=",", low_memory=False)
    g = df[df.COUNTRY_NAME == "Greece"].copy()
    n_gr = len(g)
    g = g[~(pd.to_numeric(g.DEM_AGE, errors="coerce") < 17)].reset_index(drop=True)
    demo = demo_frame(did, len(g))
    demo["weight"] = norm_weight(g.WEIGHT_CNTRY)
    demo["age_band"] = [age_band(a) for a in pd.to_numeric(g.DEM_AGE, errors="coerce")]
    demo["gender"] = pd.to_numeric(g.DEM_GENDER_male, errors="coerce").map({1.0: "male", 0.0: "female"})
    demo["edu3"] = pd.to_numeric(g.DEM_EDU, errors="coerce").map({1.0: "low", 2.0: "low", 3.0: "medium", 4.0: "high"})
    demo["urban"] = pd.to_numeric(g.DEM_RESIDENCE, errors="coerce").map({0.0: "rural", 1.0: "urban"})
    items = []
    for var, (text, opts, dk, qtype) in TISP_ITEMS.items():
        src = (f"Greek-language TISP questionnaire GREECE_GKINOPOULOS.pdf (same translation in GREECE_KUPPENS.pdf), item {var}; "
               "codes per core-questionnaire_english.pdf and producers' 01_setup.R (OSF 5c3qd)")
        items.append(item(var, g[var], text, opts, dk=dk, qtype=qtype, source=src, language="el"))
    excluded = [
        {"variable": "BENEFIT_OPEN, TRUST_OPEN", "reason": "open-ended free text"},
        {"variable": "ATTCHECK_NUMBER, ATTCHECK_RES, CONSENT", "reason": "attention checks / consent (screening, admin)"},
        {"variable": "DEM_GENDER*, DEM_AGE*, DEM_EDU*, DEM_RESIDENCE, DEM_INCOME*", "reason": "demographics (income continuous)"},
        {"variable": "LAB, COUNTRY_*, WEIGHT_*, Start, End, DATE, Response_TYPE, Progress, Duration, Recorded, ID_*, UserLanguage", "reason": "ID / weight / admin / timestamps"},
    ]
    dates = pd.to_datetime(g.DATE, errors="coerce")
    man = manifest_entry(root, "osf_5c3qd_tisp")
    meta = {"title": "TISP — Trust in Science and Science-Related Populism (Many Labs), Greece", "source": "TISP consortium, OSF 5c3qd (ds_final.csv); Mede et al. 2025, Scientific Data",
            "licence": man.get("licence"), "fieldwork": f"{dates.min():%Y-%m} to {dates.max():%Y-%m}",
            "mode": "Online self-completion (Qualtrics), online panel (polling company Bilendi & respondi per Mede et al. 2025, Table 1), crossed age×gender quotas",
            "population": "Greek adults 18+ in online panels (non-probability quota sample)", "_weighted": True,
            "notes": [f"Greek rows: {n_gr} from two labs (Kuppens, Gkinopoulos); no rows dropped for age (min age 18)." if n_gr == len(g) else f"Greek rows: {n_gr}; dropped {n_gr - len(g)} aged <17.",
                      "Weight = WEIGHT_CNTRY (country-level raking weights to UN WPP age/gender and Barro-Lee education margins), normalized to mean 1.",
                      "gender from DEM_GENDER_male (1 male, 0 female; producers' coding). edu3: DEM_EDU 1 did not attend school/2 primary=low, 3 secondary (e.g. high school; includes lower-secondary completers)=medium, 4 higher=high.",
                      "urban from DEM_RESIDENCE (producers recoded 1 rural/2 urban to 0/1). No region variable (nuts1 null).",
                      "SDO items: both Greek questionnaires offered a 9-point scale coded 1,3,4,...,10 (no code 2); options reflect this.",
                      "CLIM_POLSUPPORT code 4 'not applicable' treated as non-substantive (dkCodes). DEM_POL_* code 99 'I don't know' already set to missing by producers.",
                      "DEM_POL_conservative, DEM_POL_right and DEM_RELIGIOUS are attitude self-placements in the producers' DEM block; included as substantive items.",
                      "UserLanguage is 'EN' for all Greek rows in ds_final although Greek questionnaires were fielded; wording taken from the Greek questionnaires."]}
    return finish(root, did, demo, items, meta, excluded)


# =============================================================================================== H3 COVIDiSTRESS
# Greek wording extracted from the COVIDiSTRESS v1.1 Qualtrics file with all translations (OSF z39us, file 8ex5h), language EL
COVIDISTRESS_EL = {'Scale_PSS10_UCLA_1': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Αναστατωθήκατε εξαιτίας κάποιου αναπάντεχου γεγονότος;',
                        'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                        'dk': [],
                        'qsf': 'Scale_PSS10_UCLA_1'},
 'Scale_PSS10_UCLA_2': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Αισθανθήκατε ότι δε μπορούσατε να έχετε τον έλεγχο στα σημαντικά πράγματα της ζωής;',
                        'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                        'dk': [],
                        'qsf': 'Scale_PSS10_UCLA_2'},
 'Scale_PSS10_UCLA_3': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Αισθανθήκατε νευρικότητα και στρές;',
                        'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                        'dk': [],
                        'qsf': 'Scale_PSS10_UCLA_3'},
 'Scale_PSS10_UCLA_4': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Αισθανθήκατε σιγουριά ως προς την ικανότητά σας να χειριστείτε τα προσωπικά σας '
                                'προβλήματα;',
                        'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                        'dk': [],
                        'qsf': 'Scale_PSS10_UCLA_4'},
 'Scale_PSS10_UCLA_5': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Αισθανθήκατε ότι τα πράγματα πήγαιναν όπως τα θέλετε;',
                        'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                        'dk': [],
                        'qsf': 'Scale_PSS10_UCLA_5'},
 'Scale_PSS10_UCLA_6': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Αισθανθήκατε ότι δε μπορείτε να ανταποκριθείτε στις υποχρεώσεις σας;',
                        'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                        'dk': [],
                        'qsf': 'Scale_PSS10_UCLA_6'},
 'Scale_PSS10_UCLA_7': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Αισθανθήκατε ότι μπορούσατε να ελέγξετε όσα σας ενοχλούν στη ζωή σας;',
                        'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                        'dk': [],
                        'qsf': 'Scale_PSS10_UCLA_7'},
 'Scale_PSS10_UCLA_8': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Αισθανθήκατε ότι μπορούσατε να αναπεξέλθετε στις υποχρεώσεις σας στο μεγιστο βαθμό;',
                        'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                        'dk': [],
                        'qsf': 'Scale_PSS10_UCLA_8'},
 'Scale_PSS10_UCLA_9': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Νιώσατε θυμό επειδή δεν έχετε τον έλεγχο να ελέγξετε την κατάσταση;',
                        'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                        'dk': [],
                        'qsf': 'Scale_PSS10_UCLA_9'},
 'Scale_PSS10_UCLA_10': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Νιώσατε ότι οι δυσκολίες που αντιμετωπίζετε είναι τόσες πολλές που δε μπορείτε να τις '
                                 'ξεπεράσετε;',
                         'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                         'dk': [],
                         'qsf': 'Scale_PSS10_UCLA_10'},
 'Scale_SLON_1': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Νιώσατε μοναξιά;',
                  'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                  'dk': [],
                  'qsf': 'Scale_PSS10_UCLA_11'},
 'Scale_SLON_2': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Νιώσατε να σας έχουν ξεχάσει;',
                  'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                  'dk': [],
                  'qsf': 'Scale_PSS10_UCLA_12'},
 'Scale_SLON_3': {'text': 'Την περασμένη εβδομάδα, πόσο συχνά ... Νιώσατε αποκομμένος από τους άλλους;',
                  'options': [('1', 'Ποτέ'), ('2', 'Σχεδόν Ποτέ'), ('3', 'Μερικές Φορές'), ('4', 'Συχνά'), ('5', 'Πολύ Συχνά')],
                  'dk': [],
                  'qsf': 'Scale_PSS10_UCLA_13'},
 'OECD_people_1': {'text': 'Χρησιμοποιώντας μια κλίμακα από το «0» έως το «10», όπου το «0» αντιστοιχεί στη μηδενική εμπιστοσύνη και το «10» στην πλήρη '
                           'εμπιστοσύνη, πόσο πολύ θα λέγατε ότι εμπιστεύεστε τους περισσότερους ανθρώπους; Τους περισσότερους ανθρώπους',
                   'options': [('0', '0 = μηδενική εμπιστοσύνη'),
                               ('1', '1'),
                               ('2', '2'),
                               ('3', '3'),
                               ('4', '4'),
                               ('5', '5'),
                               ('6', '6'),
                               ('7', '7'),
                               ('8', '8'),
                               ('9', '9'),
                               ('10', '10 = πλήρης εμπιστοσύνη')],
                   'dk': [],
                   'qsf': 'OECD_people_1'},
 'OECD_people_2': {'text': 'Χρησιμοποιώντας μια κλίμακα από το «0» έως το «10», όπου το «0» αντιστοιχεί στη μηδενική εμπιστοσύνη και το «10» στην πλήρη '
                           'εμπιστοσύνη, πόσο πολύ θα λέγατε ότι εμπιστεύεστε τους περισσότερους ανθρώπους; Τους περισσότερους ανθρώπους που γνωρίζεται '
                           'προσωπικά;',
                   'options': [('0', '0 = μηδενική εμπιστοσύνη'),
                               ('1', '1'),
                               ('2', '2'),
                               ('3', '3'),
                               ('4', '4'),
                               ('5', '5'),
                               ('6', '6'),
                               ('7', '7'),
                               ('8', '8'),
                               ('9', '9'),
                               ('10', '10 = πλήρης εμπιστοσύνη')],
                   'dk': [],
                   'qsf': 'OECD_people_2'},
 'OECD_insititutions_1': {'text': 'Ακόμα και αν είχατε περιορισμένη ή και καθόλου προσωπική επαφή με τους παρακάτω θεσμούς, παρακαλείστε να διαμορφώσετε την '
                                  'απάντησή σας βάση της γενικής εικόνα που έχετε από τους παρακάτω θεσμούς Χρησιμοποιώντας μια κλίμακα από το «0» έως το '
                                  '«10», όπου το «0» αντιστοιχεί στη μηδενική εμπιστοσύνη και το «10» στην πλήρη εμπιστοσύνη, πόσο πολύ θα λέγατε ότι '
                                  'εμπιστεύεστε καθέναν από τους παρακάτω θεσμούς; Το Κοινοβούλιο/Κυβέρνηση της χώρας σας',
                          'options': [('0', '0 = μηδενική εμπιστοσύνη'),
                                      ('1', '1'),
                                      ('2', '2'),
                                      ('3', '3'),
                                      ('4', '4'),
                                      ('5', '5'),
                                      ('6', '6'),
                                      ('7', '7'),
                                      ('8', '8'),
                                      ('9', '9'),
                                      ('10', '10 = πλήρης εμπιστοσύνη')],
                          'dk': [],
                          'qsf': 'OECD_insititutions_1'},
 'OECD_insititutions_2': {'text': 'Ακόμα και αν είχατε περιορισμένη ή και καθόλου προσωπική επαφή με τους παρακάτω θεσμούς, παρακαλείστε να διαμορφώσετε την '
                                  'απάντησή σας βάση της γενικής εικόνα που έχετε από τους παρακάτω θεσμούς Χρησιμοποιώντας μια κλίμακα από το «0» έως το '
                                  '«10», όπου το «0» αντιστοιχεί στη μηδενική εμπιστοσύνη και το «10» στην πλήρη εμπιστοσύνη, πόσο πολύ θα λέγατε ότι '
                                  'εμπιστεύεστε καθέναν από τους παρακάτω θεσμούς; Την αστυνομία της χώρας σας',
                          'options': [('0', '0 = μηδενική εμπιστοσύνη'),
                                      ('1', '1'),
                                      ('2', '2'),
                                      ('3', '3'),
                                      ('4', '4'),
                                      ('5', '5'),
                                      ('6', '6'),
                                      ('7', '7'),
                                      ('8', '8'),
                                      ('9', '9'),
                                      ('10', '10 = πλήρης εμπιστοσύνη')],
                          'dk': [],
                          'qsf': 'OECD_insititutions_2'},
 'OECD_insititutions_3': {'text': 'Ακόμα και αν είχατε περιορισμένη ή και καθόλου προσωπική επαφή με τους παρακάτω θεσμούς, παρακαλείστε να διαμορφώσετε την '
                                  'απάντησή σας βάση της γενικής εικόνα που έχετε από τους παρακάτω θεσμούς Χρησιμοποιώντας μια κλίμακα από το «0» έως το '
                                  '«10», όπου το «0» αντιστοιχεί στη μηδενική εμπιστοσύνη και το «10» στην πλήρη εμπιστοσύνη, πόσο πολύ θα λέγατε ότι '
                                  'εμπιστεύεστε καθέναν από τους παρακάτω θεσμούς; Τις δημόσιες υπηρεσίες της χώρας σας',
                          'options': [('0', '0 = μηδενική εμπιστοσύνη'),
                                      ('1', '1'),
                                      ('2', '2'),
                                      ('3', '3'),
                                      ('4', '4'),
                                      ('5', '5'),
                                      ('6', '6'),
                                      ('7', '7'),
                                      ('8', '8'),
                                      ('9', '9'),
                                      ('10', '10 = πλήρης εμπιστοσύνη')],
                          'dk': [],
                          'qsf': 'OECD_insititutions_3'},
 'OECD_insititutions_4': {'text': 'Ακόμα και αν είχατε περιορισμένη ή και καθόλου προσωπική επαφή με τους παρακάτω θεσμούς, παρακαλείστε να διαμορφώσετε την '
                                  'απάντησή σας βάση της γενικής εικόνα που έχετε από τους παρακάτω θεσμούς Χρησιμοποιώντας μια κλίμακα από το «0» έως το '
                                  '«10», όπου το «0» αντιστοιχεί στη μηδενική εμπιστοσύνη και το «10» στην πλήρη εμπιστοσύνη, πόσο πολύ θα λέγατε ότι '
                                  'εμπιστεύεστε καθέναν από τους παρακάτω θεσμούς; Το υγειονομικό σύστημα της χώρας σας',
                          'options': [('0', '0 = μηδενική εμπιστοσύνη'),
                                      ('1', '1'),
                                      ('2', '2'),
                                      ('3', '3'),
                                      ('4', '4'),
                                      ('5', '5'),
                                      ('6', '6'),
                                      ('7', '7'),
                                      ('8', '8'),
                                      ('9', '9'),
                                      ('10', '10 = πλήρης εμπιστοσύνη')],
                          'dk': [],
                          'qsf': 'OECD_insititutions_4'},
 'OECD_insititutions_5': {'text': 'Ακόμα και αν είχατε περιορισμένη ή και καθόλου προσωπική επαφή με τους παρακάτω θεσμούς, παρακαλείστε να διαμορφώσετε την '
                                  'απάντησή σας βάση της γενικής εικόνα που έχετε από τους παρακάτω θεσμούς Χρησιμοποιώντας μια κλίμακα από το «0» έως το '
                                  '«10», όπου το «0» αντιστοιχεί στη μηδενική εμπιστοσύνη και το «10» στην πλήρη εμπιστοσύνη, πόσο πολύ θα λέγατε ότι '
                                  'εμπιστεύεστε καθέναν από τους παρακάτω θεσμούς; Τον Παγκόσμιο Οργανισμό Υγείας',
                          'options': [('0', '0 = μηδενική εμπιστοσύνη'),
                                      ('1', '1'),
                                      ('2', '2'),
                                      ('3', '3'),
                                      ('4', '4'),
                                      ('5', '5'),
                                      ('6', '6'),
                                      ('7', '7'),
                                      ('8', '8'),
                                      ('9', '9'),
                                      ('10', '10 = πλήρης εμπιστοσύνη')],
                          'dk': [],
                          'qsf': 'OECD_insititutions_5'},
 'OECD_insititutions_6': {'text': 'Ακόμα και αν είχατε περιορισμένη ή και καθόλου προσωπική επαφή με τους παρακάτω θεσμούς, παρακαλείστε να διαμορφώσετε την '
                                  'απάντησή σας βάση της γενικής εικόνα που έχετε από τους παρακάτω θεσμούς Χρησιμοποιώντας μια κλίμακα από το «0» έως το '
                                  '«10», όπου το «0» αντιστοιχεί στη μηδενική εμπιστοσύνη και το «10» στην πλήρη εμπιστοσύνη, πόσο πολύ θα λέγατε ότι '
                                  'εμπιστεύεστε καθέναν από τους παρακάτω θεσμούς; Τις προσπάθειες της κυβέρνησης της χώρας σας να αντιμετωπίσει τον κορονοϊό',
                          'options': [('0', '0 = μηδενική εμπιστοσύνη'),
                                      ('1', '1'),
                                      ('2', '2'),
                                      ('3', '3'),
                                      ('4', '4'),
                                      ('5', '5'),
                                      ('6', '6'),
                                      ('7', '7'),
                                      ('8', '8'),
                                      ('9', '9'),
                                      ('10', '10 = πλήρης εμπιστοσύνη')],
                          'dk': [],
                          'qsf': 'OECD_insititutions_6'},
 'Corona_concerns_1': {'text': 'Πόσο συμφωνείτε, με το ότι σας απασχολούν οι συνέπειες του κορονοϊού... … για τον εαυτό σας;',
                       'options': [('1', 'Διαφωνώ Απολύτως'),
                                   ('2', 'Διαφωνώ'),
                                   ('3', 'Διαφωνώ Λίγο'),
                                   ('4', 'Συμφωνώ Λίγο'),
                                   ('5', 'Συμφωνώ'),
                                   ('6', 'Συμφωνώ Απολύτως')],
                       'dk': [],
                       'qsf': 'Corona_concerns_1'},
 'Corona_concerns_2': {'text': 'Πόσο συμφωνείτε, με το ότι σας απασχολούν οι συνέπειες του κορονοϊού... … για την οικογένειά σας;',
                       'options': [('1', 'Διαφωνώ Απολύτως'),
                                   ('2', 'Διαφωνώ'),
                                   ('3', 'Διαφωνώ Λίγο'),
                                   ('4', 'Συμφωνώ Λίγο'),
                                   ('5', 'Συμφωνώ'),
                                   ('6', 'Συμφωνώ Απολύτως')],
                       'dk': [],
                       'qsf': 'Corona_concerns_2'},
 'Corona_concerns_3': {'text': 'Πόσο συμφωνείτε, με το ότι σας απασχολούν οι συνέπειες του κορονοϊού... … για τους κοντινούς σας φίλους;',
                       'options': [('1', 'Διαφωνώ Απολύτως'),
                                   ('2', 'Διαφωνώ'),
                                   ('3', 'Διαφωνώ Λίγο'),
                                   ('4', 'Συμφωνώ Λίγο'),
                                   ('5', 'Συμφωνώ'),
                                   ('6', 'Συμφωνώ Απολύτως')],
                       'dk': [],
                       'qsf': 'Corona_concerns_3'},
 'Corona_concerns_4': {'text': 'Πόσο συμφωνείτε, με το ότι σας απασχολούν οι συνέπειες του κορονοϊού... … για την χώρα σας;',
                       'options': [('1', 'Διαφωνώ Απολύτως'),
                                   ('2', 'Διαφωνώ'),
                                   ('3', 'Διαφωνώ Λίγο'),
                                   ('4', 'Συμφωνώ Λίγο'),
                                   ('5', 'Συμφωνώ'),
                                   ('6', 'Συμφωνώ Απολύτως')],
                       'dk': [],
                       'qsf': 'Corona_concerns_4'},
 'Corona_concerns_5': {'text': 'Πόσο συμφωνείτε, με το ότι σας απασχολούν οι συνέπειες του κορονοϊού... … για όλες τις χώρες του κόσμου;',
                       'options': [('1', 'Διαφωνώ Απολύτως'),
                                   ('2', 'Διαφωνώ'),
                                   ('3', 'Διαφωνώ Λίγο'),
                                   ('4', 'Συμφωνώ Λίγο'),
                                   ('5', 'Συμφωνώ'),
                                   ('6', 'Συμφωνώ Απολύτως')],
                       'dk': [],
                       'qsf': 'Corona_concerns_5'},
 'Compliance_1': {'text': 'Πολλές χώρες καθώς και o Παγκόσμιoς Οργανισμός Υγείας (ΠΟΥ) έχουν εκδώσει μια σειρά από κατευθυντήριες γραμμές για το πώς να '
                          'συμπεριφέρονται οι πολίτες κατά τη διάρκεια της πανδημίας του κορονοϊού, συμπεριλαμβανομένης της μεγαλύτερης φροντίδας για την '
                          'προσωπική υγιεινή, της δοκιμής της κοινωνικής απομόνωσης αποφεύγοντας τις κοινωνικές εκδηλώσεις, την αποφυγή της άσκοπης εξόδου από '
                          'το σπιτι, το κράτημα των παιδιών στο σπιτι, κλπ. Είμαι καλά ενημερωμένη/ος για το τί πρέπει να κάνω ώστε να συμβάλλω στην '
                          'προσπάθεια μείωσης της διάδοσης του κορονοϊού.',
                  'options': [('1', 'Διαφωνώ Απολύτως'),
                              ('2', 'Διαφωνώ'),
                              ('3', 'Διαφωνώ Λίγο'),
                              ('4', 'Συμφωνώ Λίγο'),
                              ('5', 'Συμφωνώ'),
                              ('6', 'Συμφωνώ Απολύτως')],
                  'dk': [],
                  'qsf': 'Compliance_1'},
 'Compliance_2': {'text': 'Πολλές χώρες καθώς και o Παγκόσμιoς Οργανισμός Υγείας (ΠΟΥ) έχουν εκδώσει μια σειρά από κατευθυντήριες γραμμές για το πώς να '
                          'συμπεριφέρονται οι πολίτες κατά τη διάρκεια της πανδημίας του κορονοϊού, συμπεριλαμβανομένης της μεγαλύτερης φροντίδας για την '
                          'προσωπική υγιεινή, της δοκιμής της κοινωνικής απομόνωσης αποφεύγοντας τις κοινωνικές εκδηλώσεις, την αποφυγή της άσκοπης εξόδου από '
                          'το σπιτι, το κράτημα των παιδιών στο σπιτι, κλπ. Έχω κάνει ό,τι μπορούσα να κάνω σαν άτομο για τη μείωση της διάδοσης του '
                          'κορονοϊού.',
                  'options': [('1', 'Διαφωνώ Απολύτως'),
                              ('2', 'Διαφωνώ'),
                              ('3', 'Διαφωνώ Λίγο'),
                              ('4', 'Συμφωνώ Λίγο'),
                              ('5', 'Συμφωνώ'),
                              ('6', 'Συμφωνώ Απολύτως')],
                  'dk': [],
                  'qsf': 'Compliance_2'},
 'Compliance_3': {'text': 'Πολλές χώρες καθώς και o Παγκόσμιoς Οργανισμός Υγείας (ΠΟΥ) έχουν εκδώσει μια σειρά από κατευθυντήριες γραμμές για το πώς να '
                          'συμπεριφέρονται οι πολίτες κατά τη διάρκεια της πανδημίας του κορονοϊού, συμπεριλαμβανομένης της μεγαλύτερης φροντίδας για την '
                          'προσωπική υγιεινή, της δοκιμής της κοινωνικής απομόνωσης αποφεύγοντας τις κοινωνικές εκδηλώσεις, την αποφυγή της άσκοπης εξόδου από '
                          'το σπιτι, το κράτημα των παιδιών στο σπιτι, κλπ. Έχω κάνει ό,τι μπορούσα να κάνω ώστε να κρατήσω φυσική απόσταση από τους άλλους',
                  'options': [('1', 'Διαφωνώ Απολύτως'),
                              ('2', 'Διαφωνώ'),
                              ('3', 'Διαφωνώ Λίγο'),
                              ('4', 'Συμφωνώ Λίγο'),
                              ('5', 'Συμφωνώ'),
                              ('6', 'Συμφωνώ Απολύτως')],
                  'dk': [],
                  'qsf': 'Compliance_3'},
 'Compliance_4': {'text': 'Πολλές χώρες καθώς και o Παγκόσμιoς Οργανισμός Υγείας (ΠΟΥ) έχουν εκδώσει μια σειρά από κατευθυντήριες γραμμές για το πώς να '
                          'συμπεριφέρονται οι πολίτες κατά τη διάρκεια της πανδημίας του κορονοϊού, συμπεριλαμβανομένης της μεγαλύτερης φροντίδας για την '
                          'προσωπική υγιεινή, της δοκιμής της κοινωνικής απομόνωσης αποφεύγοντας τις κοινωνικές εκδηλώσεις, την αποφυγή της άσκοπης εξόδου από '
                          'το σπιτι, το κράτημα των παιδιών στο σπιτι, κλπ. Νιώθω ότι το να διατηρώ φυσική απόσταση από τους άλλους θα έχει υψηλό προσωπικό '
                          'κόστος για εμένα',
                  'options': [('1', 'Διαφωνώ Απολύτως'),
                              ('2', 'Διαφωνώ'),
                              ('3', 'Διαφωνώ Λίγο'),
                              ('4', 'Συμφωνώ Λίγο'),
                              ('5', 'Συμφωνώ'),
                              ('6', 'Συμφωνώ Απολύτως')],
                  'dk': [],
                  'qsf': 'Compliance_4'},
 'Compliance_5': {'text': 'Πολλές χώρες καθώς και o Παγκόσμιoς Οργανισμός Υγείας (ΠΟΥ) έχουν εκδώσει μια σειρά από κατευθυντήριες γραμμές για το πώς να '
                          'συμπεριφέρονται οι πολίτες κατά τη διάρκεια της πανδημίας του κορονοϊού, συμπεριλαμβανομένης της μεγαλύτερης φροντίδας για την '
                          'προσωπική υγιεινή, της δοκιμής της κοινωνικής απομόνωσης αποφεύγοντας τις κοινωνικές εκδηλώσεις, την αποφυγή της άσκοπης εξόδου από '
                          'το σπιτι, το κράτημα των παιδιών στο σπιτι, κλπ. Έχω εμπιστοσύνη στους γύρω μου για το ότι ακολουθούν τις οδηγίες για το σταμάτημα '
                          'της εξάπλωσης του κορονοϊού',
                  'options': [('1', 'Διαφωνώ Απολύτως'),
                              ('2', 'Διαφωνώ'),
                              ('3', 'Διαφωνώ Λίγο'),
                              ('4', 'Συμφωνώ Λίγο'),
                              ('5', 'Συμφωνώ'),
                              ('6', 'Συμφωνώ Απολύτως')],
                  'dk': [],
                  'qsf': 'Compliance_5'},
 'Compliance_6': {'text': 'Πολλές χώρες καθώς και o Παγκόσμιoς Οργανισμός Υγείας (ΠΟΥ) έχουν εκδώσει μια σειρά από κατευθυντήριες γραμμές για το πώς να '
                          'συμπεριφέρονται οι πολίτες κατά τη διάρκεια της πανδημίας του κορονοϊού, συμπεριλαμβανομένης της μεγαλύτερης φροντίδας για την '
                          'προσωπική υγιεινή, της δοκιμής της κοινωνικής απομόνωσης αποφεύγοντας τις κοινωνικές εκδηλώσεις, την αποφυγή της άσκοπης εξόδου από '
                          'το σπιτι, το κράτημα των παιδιών στο σπιτι, κλπ. Έχω αγοράσει μεγάλη ποσότητα τροφίμων και άλλων ειδών πρώτης ανάγκης',
                  'options': [('1', 'Διαφωνώ Απολύτως'),
                              ('2', 'Διαφωνώ'),
                              ('3', 'Διαφωνώ Λίγο'),
                              ('4', 'Συμφωνώ Λίγο'),
                              ('5', 'Συμφωνώ'),
                              ('6', 'Συμφωνώ Απολύτως')],
                  'dk': [],
                  'qsf': 'Compliance_6'},
 'BFF_15_1': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να σκεφτείτε '
                      'τον εαυτό σας τις κανονικές μέρες. … ανησυχώ συχνά',
              'options': [('1', 'Διαφωνώ Απολύτως'),
                          ('2', 'Διαφωνώ'),
                          ('3', 'Διαφωνώ Λίγο'),
                          ('4', 'Συμφωνώ Λίγο'),
                          ('5', 'Συμφωνώ'),
                          ('6', 'Συμφωνώ Απολύτως')],
              'dk': [],
              'qsf': 'BFF_15_1'},
 'BFF_15_2': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να σκεφτείτε '
                      'τον εαυτό σας τις κανονικές μέρες. … γίνομαι εύκολα νευρική/ός',
              'options': [('1', 'Διαφωνώ Απολύτως'),
                          ('2', 'Διαφωνώ'),
                          ('3', 'Διαφωνώ Λίγο'),
                          ('4', 'Συμφωνώ Λίγο'),
                          ('5', 'Συμφωνώ'),
                          ('6', 'Συμφωνώ Απολύτως')],
              'dk': [],
              'qsf': 'BFF_15_2'},
 'BFF_15_3': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να σκεφτείτε '
                      'τον εαυτό σας τις κανονικές μέρες. … έχω τη δυνατότητα να μην ταράζομαι σε αγχωτικές καταστάσεις',
              'options': [('1', 'Διαφωνώ Απολύτως'),
                          ('2', 'Διαφωνώ'),
                          ('3', 'Διαφωνώ Λίγο'),
                          ('4', 'Συμφωνώ Λίγο'),
                          ('5', 'Συμφωνώ'),
                          ('6', 'Συμφωνώ Απολύτως')],
              'dk': [],
              'qsf': 'BFF_15_3'},
 'BFF_15_4': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να σκεφτείτε '
                      'τον εαυτό σας τις κανονικές μέρες. … μου αρέσει να συνομιλώ με άλλους',
              'options': [('1', 'Διαφωνώ Απολύτως'),
                          ('2', 'Διαφωνώ'),
                          ('3', 'Διαφωνώ Λίγο'),
                          ('4', 'Συμφωνώ Λίγο'),
                          ('5', 'Συμφωνώ'),
                          ('6', 'Συμφωνώ Απολύτως')],
              'dk': [],
              'qsf': 'BFF_15_4'},
 'BFF_15_5': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να σκεφτείτε '
                      'τον εαυτό σας τις κανονικές μέρες. … είμαι εξωστρεφής και κοινωνική/ός',
              'options': [('1', 'Διαφωνώ Απολύτως'),
                          ('2', 'Διαφωνώ'),
                          ('3', 'Διαφωνώ Λίγο'),
                          ('4', 'Συμφωνώ Λίγο'),
                          ('5', 'Συμφωνώ'),
                          ('6', 'Συμφωνώ Απολύτως')],
              'dk': [],
              'qsf': 'BFF_15_5'},
 'BFF_15_6': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να σκεφτείτε '
                      'τον εαυτό σας τις κανονικές μέρες. … είμαι εσωστρεφής',
              'options': [('1', 'Διαφωνώ Απολύτως'),
                          ('2', 'Διαφωνώ'),
                          ('3', 'Διαφωνώ Λίγο'),
                          ('4', 'Συμφωνώ Λίγο'),
                          ('5', 'Συμφωνώ'),
                          ('6', 'Συμφωνώ Απολύτως')],
              'dk': [],
              'qsf': 'BFF_15_6'},
 'BFF_15_7': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να σκεφτείτε '
                      'τον εαυτό σας τις κανονικές μέρες. … έχω πολλές νέες ιδέες',
              'options': [('1', 'Διαφωνώ Απολύτως'),
                          ('2', 'Διαφωνώ'),
                          ('3', 'Διαφωνώ Λίγο'),
                          ('4', 'Συμφωνώ Λίγο'),
                          ('5', 'Συμφωνώ'),
                          ('6', 'Συμφωνώ Απολύτως')],
              'dk': [],
              'qsf': 'BFF_15_7'},
 'BFF_15_8': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να σκεφτείτε '
                      'τον εαυτό σας τις κανονικές μέρες. … ετκιμώ ιδιαίτερα την τέχνη και την αισθητική',
              'options': [('1', 'Διαφωνώ Απολύτως'),
                          ('2', 'Διαφωνώ'),
                          ('3', 'Διαφωνώ Λίγο'),
                          ('4', 'Συμφωνώ Λίγο'),
                          ('5', 'Συμφωνώ'),
                          ('6', 'Συμφωνώ Απολύτως')],
              'dk': [],
              'qsf': 'BFF_15_8'},
 'BFF_15_9': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να σκεφτείτε '
                      'τον εαυτό σας τις κανονικές μέρες. … έχω ζωντανή φαντασία και μπορώ να σκεφτώ πράγματα που δεν υπάρχουν ακόμα',
              'options': [('1', 'Διαφωνώ Απολύτως'),
                          ('2', 'Διαφωνώ'),
                          ('3', 'Διαφωνώ Λίγο'),
                          ('4', 'Συμφωνώ Λίγο'),
                          ('5', 'Συμφωνώ'),
                          ('6', 'Συμφωνώ Απολύτως')],
              'dk': [],
              'qsf': 'BFF_15_9'},
 'BFF_15_10': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να '
                       'σκεφτείτε τον εαυτό σας τις κανονικές μέρες. … είμαι μερικές φορές αγενής στους άλλους',
               'options': [('1', 'Διαφωνώ Απολύτως'),
                           ('2', 'Διαφωνώ'),
                           ('3', 'Διαφωνώ Λίγο'),
                           ('4', 'Συμφωνώ Λίγο'),
                           ('5', 'Συμφωνώ'),
                           ('6', 'Συμφωνώ Απολύτως')],
               'dk': [],
               'qsf': 'BFF_15_10'},
 'BFF_15_11': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να '
                       'σκεφτείτε τον εαυτό σας τις κανονικές μέρες. … ξέρω να συγχωρώ τους άλλους',
               'options': [('1', 'Διαφωνώ Απολύτως'),
                           ('2', 'Διαφωνώ'),
                           ('3', 'Διαφωνώ Λίγο'),
                           ('4', 'Συμφωνώ Λίγο'),
                           ('5', 'Συμφωνώ'),
                           ('6', 'Συμφωνώ Απολύτως')],
               'dk': [],
               'qsf': 'BFF_15_11'},
 'BFF_15_12': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να '
                       'σκεφτείτε τον εαυτό σας τις κανονικές μέρες. … είμαι ευγενική/ός και σκέφτομαι τους γύρω μου',
               'options': [('1', 'Διαφωνώ Απολύτως'),
                           ('2', 'Διαφωνώ'),
                           ('3', 'Διαφωνώ Λίγο'),
                           ('4', 'Συμφωνώ Λίγο'),
                           ('5', 'Συμφωνώ'),
                           ('6', 'Συμφωνώ Απολύτως')],
               'dk': [],
               'qsf': 'BFF_15_12'},
 'BFF_15_13': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να '
                       'σκεφτείτε τον εαυτό σας τις κανονικές μέρες. … είμαι διεξοδική/ός και σχολαστική/ός',
               'options': [('1', 'Διαφωνώ Απολύτως'),
                           ('2', 'Διαφωνώ'),
                           ('3', 'Διαφωνώ Λίγο'),
                           ('4', 'Συμφωνώ Λίγο'),
                           ('5', 'Συμφωνώ'),
                           ('6', 'Συμφωνώ Απολύτως')],
               'dk': [],
               'qsf': 'BFF_15_13'},
 'BFF_15_14': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να '
                       'σκεφτείτε τον εαυτό σας τις κανονικές μέρες. … βαριέμαι εύκολα',
               'options': [('1', 'Διαφωνώ Απολύτως'),
                           ('2', 'Διαφωνώ'),
                           ('3', 'Διαφωνώ Λίγο'),
                           ('4', 'Συμφωνώ Λίγο'),
                           ('5', 'Συμφωνώ'),
                           ('6', 'Συμφωνώ Απολύτως')],
               'dk': [],
               'qsf': 'BFF_15_14'},
 'BFF_15_15': {'text': 'Πλησιάζοντας στο τέλος του πρώτου μέρους της έρευνας, παρακαλείστε να ξεχάσετε για λίγο την κατάσταση με τον κορονοϊό, και να '
                       'σκεφτείτε τον εαυτό σας τις κανονικές μέρες. … ειμαι αποτελεσματική/ός σε ό,τι καταπιάνομαι',
               'options': [('1', 'Διαφωνώ Απολύτως'),
                           ('2', 'Διαφωνώ'),
                           ('3', 'Διαφωνώ Λίγο'),
                           ('4', 'Συμφωνώ Λίγο'),
                           ('5', 'Συμφωνώ'),
                           ('6', 'Συμφωνώ Απολύτως')],
               'dk': [],
               'qsf': 'BFF_15_15'},
 'Expl_Distress_1': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Το καθημερινό σας εισόδημα αυτή τη στιγμή',
                     'options': [('1', 'Διαφωνώ Απολύτως'),
                                 ('2', 'Διαφωνώ'),
                                 ('3', 'Διαφωνώ Λίγο'),
                                 ('4', 'Συμφωνώ Λίγο'),
                                 ('5', 'Συμφωνώ'),
                                 ('6', 'Συμφωνώ Απολύτως')],
                     'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                     'qsf': 'Expl_Distress_1'},
 'Expl_Distress_2': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Τη δυνατότητά σας να ανταπεξέλθετε σωστά στη '
                             'δουλειά σας',
                     'options': [('1', 'Διαφωνώ Απολύτως'),
                                 ('2', 'Διαφωνώ'),
                                 ('3', 'Διαφωνώ Λίγο'),
                                 ('4', 'Συμφωνώ Λίγο'),
                                 ('5', 'Συμφωνώ'),
                                 ('6', 'Συμφωνώ Απολύτως')],
                     'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                     'qsf': 'Expl_Distress_2'},
 'Expl_Distress_3': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Τη μόρφωση των παιδιών σας',
                     'options': [('1', 'Διαφωνώ Απολύτως'),
                                 ('2', 'Διαφωνώ'),
                                 ('3', 'Διαφωνώ Λίγο'),
                                 ('4', 'Συμφωνώ Λίγο'),
                                 ('5', 'Συμφωνώ'),
                                 ('6', 'Συμφωνώ Απολύτως')],
                     'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                     'qsf': 'Expl_Distress_3'},
 'Expl_Distress_4': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Τις μελλοντικές σας προοπτικές απασχόλησης',
                     'options': [('1', 'Διαφωνώ Απολύτως'),
                                 ('2', 'Διαφωνώ'),
                                 ('3', 'Διαφωνώ Λίγο'),
                                 ('4', 'Συμφωνώ Λίγο'),
                                 ('5', 'Συμφωνώ'),
                                 ('6', 'Συμφωνώ Απολύτως')],
                     'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                     'qsf': 'Expl_Distress_4'},
 'Expl_Distress_5': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Την πρόσβασή σας και κάλυψη των βασικών σας '
                             'αναγκών όπως για παράδειγμα είδη διατροφής και άλλα είδη βασικής ανάγκης',
                     'options': [('1', 'Διαφωνώ Απολύτως'),
                                 ('2', 'Διαφωνώ'),
                                 ('3', 'Διαφωνώ Λίγο'),
                                 ('4', 'Συμφωνώ Λίγο'),
                                 ('5', 'Συμφωνώ'),
                                 ('6', 'Συμφωνώ Απολύτως')],
                     'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                     'qsf': 'Expl_Distress_5'},
 'Expl_Distress_6': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Την αδυναμία σας να πάρετε μέρος σε κοινωνικές '
                             'δραστηριότητες',
                     'options': [('1', 'Διαφωνώ Απολύτως'),
                                 ('2', 'Διαφωνώ'),
                                 ('3', 'Διαφωνώ Λίγο'),
                                 ('4', 'Συμφωνώ Λίγο'),
                                 ('5', 'Συμφωνώ'),
                                 ('6', 'Συμφωνώ Απολύτως')],
                     'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                     'qsf': 'Expl_Distress_6'},
 'Expl_Distress_7': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Την αδυναμία σας να πάρετε μέρος σε θρησκευτικές '
                             'δραστηριότητες',
                     'options': [('1', 'Διαφωνώ Απολύτως'),
                                 ('2', 'Διαφωνώ'),
                                 ('3', 'Διαφωνώ Λίγο'),
                                 ('4', 'Συμφωνώ Λίγο'),
                                 ('5', 'Συμφωνώ'),
                                 ('6', 'Συμφωνώ Απολύτως')],
                     'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                     'qsf': 'Expl_Distress_7'},
 'Expl_Distress_8': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Την ικανότητά σας να αντιμετωπίσετε την '
                             'συμπεριφορά των ενήλικων ατόμων με τα οποία ζείτε μαζί κατά τη διάρκεια της απομόνωσης',
                     'options': [('1', 'Διαφωνώ Απολύτως'),
                                 ('2', 'Διαφωνώ'),
                                 ('3', 'Διαφωνώ Λίγο'),
                                 ('4', 'Συμφωνώ Λίγο'),
                                 ('5', 'Συμφωνώ'),
                                 ('6', 'Συμφωνώ Απολύτως')],
                     'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                     'qsf': 'Expl_Distress_8'},
 'Expl_Distress_9': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Την ικανότητά σας να αντιμετωπίσετε την '
                             'συμπεριφορά των ανήλικων ατόμων κάτω των 12 ετών με τα οποία ζείτε μαζί κατά τη διάρκεια της απομόνωσης',
                     'options': [('1', 'Διαφωνώ Απολύτως'),
                                 ('2', 'Διαφωνώ'),
                                 ('3', 'Διαφωνώ Λίγο'),
                                 ('4', 'Συμφωνώ Λίγο'),
                                 ('5', 'Συμφωνώ'),
                                 ('6', 'Συμφωνώ Απολύτως')],
                     'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                     'qsf': 'Expl_Distress_9'},
 'Expl_Distress_10': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Την εθνική οικονομία',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_10'},
 'Expl_Distress_11': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Τις κοινωνικές υπηρεσίες όπως η αστυνομία, τα '
                              'δημοτικά συνεργεία καθαρισμού, κλπ.',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_11'},
 'Expl_Distress_12': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Τον κίνδυνο να κολλήσετε τον κορονοϊό εσείς ή '
                              'άλλοι που γνωρίζετε',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_12'},
 'Expl_Distress_13': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Τον κίνδυνο νοσηλείας η ακόμα και θανάτου '
                              'εξαιτίας του κορονοιού για εσάς ή για άλλους που γνωρίζετε',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_13'},
 'Expl_Distress_14': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Φίλους ή συγγενείς που ζούνε μακριά σας',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_14'},
 'Expl_Distress_15': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Την ανάγκη να προσαρμόσετε τη δουλειά σας στη '
                              'χρήση ηλεκτρονικών πλατφορμών',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_15'},
 'Expl_Distress_16': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Την ανάγκη να προσαρμόσετε την κοινωνική σας ζωή '
                              'στη χρήση ηλεκτρονικών πλατφορμών',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_16'},
 'Expl_Distress_17': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Αισθάνεστε άσχημα για το ότι συμπριφέρεστε '
                              'διαφορετικά απέναντι στους άλλους (π.χ. στη δουλειά, όταν είσαστε έξω για ψώνια)',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_17'},
 'Expl_Distress_18': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Τη μοναξιά',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_18'},
 'Expl_Distress_19': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Για το πόσο χρόνο περνάτε μέσα στο σπίτι',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_19'},
 'Expl_Distress_20': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Για το πόσο χρόνο περνάτε σε πολύ κοντινή '
                              'απόσταση με άλλους',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_20'},
 'Expl_Distress_21': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Την αβεβαιοτητα να μη γνωρίζετε για τις '
                              'εξελίξεις που σχετίζονται με τον κορονοιό',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_21'},
 'Expl_Distress_22': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Την αβεβαιοτητα του να μη γνωρίζετε τί πρέπει να '
                              'κάνετε ώστε να μειώσετε την εξάπλωση του κορονοιού',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_22'},
 'Expl_Distress_23': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Την αβεβαιοτητα του να μη γνωρίζετε για το πόσο '
                              'χρόνο θα κρατήσουν μέτρα όπως ο κοινωνικός αποκλεισμός, ο εγκλεισμός στο σπιτι, το κλείσιμο των '
                              'μαγαζιών/σχολείων/εστιατορίων/καφέ κτλ',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_23'},
 'Expl_Distress_24': {'text': 'Στην παρούσα κατάσταση, πόσο συμφωνείτε ότι αισθάνεστε άγχος/ανησυχείτε για... Το να μην μπορείτε να ταξιδέψετε στο εξωτερικό',
                      'options': [('1', 'Διαφωνώ Απολύτως'),
                                  ('2', 'Διαφωνώ'),
                                  ('3', 'Διαφωνώ Λίγο'),
                                  ('4', 'Συμφωνώ Λίγο'),
                                  ('5', 'Συμφωνώ'),
                                  ('6', 'Συμφωνώ Απολύτως')],
                      'dk': [('99', 'Δεν ισχύει στην κατάστασή μου')],
                      'qsf': 'Expl_Distress_24'},
 'SPS_1': {'text': 'Και τώρα μια πολύ σημαντική κατηγορία ερωτήσεων που αφορά την αντιμετώπιση της κατάστασης του κορονοϊού Στην τρέχουσα καθημερινή σας ζωή, '
                   'σε ποιο βαθμό συμφωνείτε με τα παρακάτω; Υπάρχουν άνθρωποι στους οποίους μπορώ να στηριχτώ στη βοήθειά τους αν χρειαστεί.',
           'options': [('1', 'Διαφωνώ Απολύτως'), ('2', 'Διαφωνώ'), ('3', 'Διαφωνώ Λίγο'), ('4', 'Συμφωνώ Λίγο'), ('5', 'Συμφωνώ'), ('6', 'Συμφωνώ Απολύτως')],
           'dk': [],
           'qsf': 'SPS_1'},
 'SPS_2': {'text': 'Και τώρα μια πολύ σημαντική κατηγορία ερωτήσεων που αφορά την αντιμετώπιση της κατάστασης του κορονοϊού Στην τρέχουσα καθημερινή σας ζωή, '
                   'σε ποιο βαθμό συμφωνείτε με τα παρακάτω; Υπάρχουν άνθρωποι που απολαμβάνουν τις ίδιες κοινωνικές δραστηριότητες με εμένα.',
           'options': [('1', 'Διαφωνώ Απολύτως'), ('2', 'Διαφωνώ'), ('3', 'Διαφωνώ Λίγο'), ('4', 'Συμφωνώ Λίγο'), ('5', 'Συμφωνώ'), ('6', 'Συμφωνώ Απολύτως')],
           'dk': [],
           'qsf': 'SPS_2'},
 'SPS_3': {'text': 'Και τώρα μια πολύ σημαντική κατηγορία ερωτήσεων που αφορά την αντιμετώπιση της κατάστασης του κορονοϊού Στην τρέχουσα καθημερινή σας ζωή, '
                   'σε ποιο βαθμό συμφωνείτε με τα παρακάτω; Νιώθω μέλος μιας ομάδας ανθρώπων που μοιράζονται τις ίδιες απόψεις και νοοτροπία με εμένα.',
           'options': [('1', 'Διαφωνώ Απολύτως'), ('2', 'Διαφωνώ'), ('3', 'Διαφωνώ Λίγο'), ('4', 'Συμφωνώ Λίγο'), ('5', 'Συμφωνώ'), ('6', 'Συμφωνώ Απολύτως')],
           'dk': [],
           'qsf': 'SPS_3'},
 'SPS_4': {'text': 'Και τώρα μια πολύ σημαντική κατηγορία ερωτήσεων που αφορά την αντιμετώπιση της κατάστασης του κορονοϊού Στην τρέχουσα καθημερινή σας ζωή, '
                   'σε ποιο βαθμό συμφωνείτε με τα παρακάτω; Έχω στενές σχέσεις με ανθρώπους που μου παρέχουνν την αίσθηση της συναισθηματικής ασφάλειας και '
                   'ευημερίας.',
           'options': [('1', 'Διαφωνώ Απολύτως'), ('2', 'Διαφωνώ'), ('3', 'Διαφωνώ Λίγο'), ('4', 'Συμφωνώ Λίγο'), ('5', 'Συμφωνώ'), ('6', 'Συμφωνώ Απολύτως')],
           'dk': [],
           'qsf': 'SPS_4'},
 'SPS_5': {'text': 'Και τώρα μια πολύ σημαντική κατηγορία ερωτήσεων που αφορά την αντιμετώπιση της κατάστασης του κορονοϊού Στην τρέχουσα καθημερινή σας ζωή, '
                   'σε ποιο βαθμό συμφωνείτε με τα παρακάτω; Υπάρχει κάποια/ος με την/ον οποία/ο θα μπορύσα να συζητήσω για τις σημαντικές αποφάσεις της ζωής '
                   'μου.',
           'options': [('1', 'Διαφωνώ Απολύτως'), ('2', 'Διαφωνώ'), ('3', 'Διαφωνώ Λίγο'), ('4', 'Συμφωνώ Λίγο'), ('5', 'Συμφωνώ'), ('6', 'Συμφωνώ Απολύτως')],
           'dk': [],
           'qsf': 'SPS_5'},
 'SPS_6': {'text': 'Και τώρα μια πολύ σημαντική κατηγορία ερωτήσεων που αφορά την αντιμετώπιση της κατάστασης του κορονοϊού Στην τρέχουσα καθημερινή σας ζωή, '
                   'σε ποιο βαθμό συμφωνείτε με τα παρακάτω; Έχω σχέσεις στις οποίες αναγνωρίζονται οι ικανότητες και οι δεξιότητές μου.',
           'options': [('1', 'Διαφωνώ Απολύτως'), ('2', 'Διαφωνώ'), ('3', 'Διαφωνώ Λίγο'), ('4', 'Συμφωνώ Λίγο'), ('5', 'Συμφωνώ'), ('6', 'Συμφωνώ Απολύτως')],
           'dk': [],
           'qsf': 'SPS_6'},
 'SPS_7': {'text': 'Και τώρα μια πολύ σημαντική κατηγορία ερωτήσεων που αφορά την αντιμετώπιση της κατάστασης του κορονοϊού Στην τρέχουσα καθημερινή σας ζωή, '
                   'σε ποιο βαθμό συμφωνείτε με τα παρακάτω; Υπάρχει κάποιος αξιόπιστος άνθρωπος στη ζωή μου στον οποίο θα μπορούσα να απευθυνθώ για συμβουλές '
                   'εαν αντιμετώπιζα κάποιο πρόβλημα.',
           'options': [('1', 'Διαφωνώ Απολύτως'), ('2', 'Διαφωνώ'), ('3', 'Διαφωνώ Λίγο'), ('4', 'Συμφωνώ Λίγο'), ('5', 'Συμφωνώ'), ('6', 'Συμφωνώ Απολύτως')],
           'dk': [],
           'qsf': 'SPS_7'},
 'SPS_8': {'text': 'Και τώρα μια πολύ σημαντική κατηγορία ερωτήσεων που αφορά την αντιμετώπιση της κατάστασης του κορονοϊού Στην τρέχουσα καθημερινή σας ζωή, '
                   'σε ποιο βαθμό συμφωνείτε με τα παρακάτω; Αισθάνομαι έναν ισχυρό συναισθηματικό δεσμό με τουλάχιστον ένα πρόσωπο.',
           'options': [('1', 'Διαφωνώ Απολύτως'), ('2', 'Διαφωνώ'), ('3', 'Διαφωνώ Λίγο'), ('4', 'Συμφωνώ Λίγο'), ('5', 'Συμφωνώ'), ('6', 'Συμφωνώ Απολύτως')],
           'dk': [],
           'qsf': 'SPS_8'},
 'SPS_9': {'text': 'Και τώρα μια πολύ σημαντική κατηγορία ερωτήσεων που αφορά την αντιμετώπιση της κατάστασης του κορονοϊού Στην τρέχουσα καθημερινή σας ζωή, '
                   'σε ποιο βαθμό συμφωνείτε με τα παρακάτω; Υπάρχουν άνθρωποι που θαυμάζουν τα ταλέντα και τις ικανότητές μου.',
           'options': [('1', 'Διαφωνώ Απολύτως'), ('2', 'Διαφωνώ'), ('3', 'Διαφωνώ Λίγο'), ('4', 'Συμφωνώ Λίγο'), ('5', 'Συμφωνώ'), ('6', 'Συμφωνώ Απολύτως')],
           'dk': [],
           'qsf': 'SPS_9'},
 'SPS_10': {'text': 'Και τώρα μια πολύ σημαντική κατηγορία ερωτήσεων που αφορά την αντιμετώπιση της κατάστασης του κορονοϊού Στην τρέχουσα καθημερινή σας ζωή, '
                    'σε ποιο βαθμό συμφωνείτε με τα παρακάτω; Υπάρχουν άνθρωποι στους οποίους μπορώ να βασιστώ σε περίπτωση έκτακτης ανάγκης.',
            'options': [('1', 'Διαφωνώ Απολύτως'), ('2', 'Διαφωνώ'), ('3', 'Διαφωνώ Λίγο'), ('4', 'Συμφωνώ Λίγο'), ('5', 'Συμφωνώ'), ('6', 'Συμφωνώ Απολύτως')],
            'dk': [],
            'qsf': 'SPS_10'},
 'Expl_Coping_1': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                           'διάρκεια της κρίσης με τον κορονοιό: Πληροφορίες από την κυβέρνηση',
                   'options': [('1', 'Διαφωνώ Απολύτως'),
                               ('2', 'Διαφωνώ'),
                               ('3', 'Διαφωνώ Λίγο'),
                               ('4', 'Συμφωνώ Λίγο'),
                               ('5', 'Συμφωνώ'),
                               ('6', 'Συμφωνώ Απολύτως')],
                   'dk': [],
                   'qsf': 'Expl_Coping_1'},
 'Expl_Coping_2': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                           'διάρκεια της κρίσης με τον κορονοιό: Η αλληλεπίδραση πρόσωπο με πρόσωπο με φίλους και μέλη της οικογένειας',
                   'options': [('1', 'Διαφωνώ Απολύτως'),
                               ('2', 'Διαφωνώ'),
                               ('3', 'Διαφωνώ Λίγο'),
                               ('4', 'Συμφωνώ Λίγο'),
                               ('5', 'Συμφωνώ'),
                               ('6', 'Συμφωνώ Απολύτως')],
                   'dk': [],
                   'qsf': 'Expl_Coping_2'},
 'Expl_Coping_3': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                           'διάρκεια της κρίσης με τον κορονοιό: Τηλεφωνική επικοινωνία (ή άλλος τρόπος επικοινωνίας μεγάλης εμβέλειας) με φίλους και μέλη της '
                           'οικογένειας',
                   'options': [('1', 'Διαφωνώ Απολύτως'),
                               ('2', 'Διαφωνώ'),
                               ('3', 'Διαφωνώ Λίγο'),
                               ('4', 'Συμφωνώ Λίγο'),
                               ('5', 'Συμφωνώ'),
                               ('6', 'Συμφωνώ Απολύτως')],
                   'dk': [],
                   'qsf': 'Expl_Coping_3'},
 'Expl_Coping_4': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                           'διάρκεια της κρίσης με τον κορονοιό: Η αλληλεπίδραση πρόσωπο με πρόσωπο με συναδέλφους',
                   'options': [('1', 'Διαφωνώ Απολύτως'),
                               ('2', 'Διαφωνώ'),
                               ('3', 'Διαφωνώ Λίγο'),
                               ('4', 'Συμφωνώ Λίγο'),
                               ('5', 'Συμφωνώ'),
                               ('6', 'Συμφωνώ Απολύτως')],
                   'dk': [],
                   'qsf': 'Expl_Coping_4'},
 'Expl_Coping_5': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                           'διάρκεια της κρίσης με τον κορονοιό: Τηλεφωνική επικοινωνία (ή άλλος τρόπος επικοινωνίας μεγάλης εμβέλειας) με συναδέλφους',
                   'options': [('1', 'Διαφωνώ Απολύτως'),
                               ('2', 'Διαφωνώ'),
                               ('3', 'Διαφωνώ Λίγο'),
                               ('4', 'Συμφωνώ Λίγο'),
                               ('5', 'Συμφωνώ'),
                               ('6', 'Συμφωνώ Απολύτως')],
                   'dk': [],
                   'qsf': 'Expl_Coping_5'},
 'Expl_Coping_6': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                           'διάρκεια της κρίσης με τον κορονοιό: Τα μέσα κοινωνικής δυκτύωσης',
                   'options': [('1', 'Διαφωνώ Απολύτως'),
                               ('2', 'Διαφωνώ'),
                               ('3', 'Διαφωνώ Λίγο'),
                               ('4', 'Συμφωνώ Λίγο'),
                               ('5', 'Συμφωνώ'),
                               ('6', 'Συμφωνώ Απολύτως')],
                   'dk': [],
                   'qsf': 'Expl_Coping_6'},
 'Expl_Coping_7': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                           'διάρκεια της κρίσης με τον κορονοιό: Βιντεοπαιχνίδια (ατομικά - για έναν παίχτη)',
                   'options': [('1', 'Διαφωνώ Απολύτως'),
                               ('2', 'Διαφωνώ'),
                               ('3', 'Διαφωνώ Λίγο'),
                               ('4', 'Συμφωνώ Λίγο'),
                               ('5', 'Συμφωνώ'),
                               ('6', 'Συμφωνώ Απολύτως')],
                   'dk': [],
                   'qsf': 'Expl_Coping_7'},
 'Expl_Coping_8': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                           'διάρκεια της κρίσης με τον κορονοιό: Βιντεοπαιχνίδια (στο διαδίκτυο)',
                   'options': [('1', 'Διαφωνώ Απολύτως'),
                               ('2', 'Διαφωνώ'),
                               ('3', 'Διαφωνώ Λίγο'),
                               ('4', 'Συμφωνώ Λίγο'),
                               ('5', 'Συμφωνώ'),
                               ('6', 'Συμφωνώ Απολύτως')],
                   'dk': [],
                   'qsf': 'Expl_Coping_8'},
 'Expl_Coping_9': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                           'διάρκεια της κρίσης με τον κορονοιό: Το να παρακολουθώ τηλεοπτικές εκπομπές ή ταινίες',
                   'options': [('1', 'Διαφωνώ Απολύτως'),
                               ('2', 'Διαφωνώ'),
                               ('3', 'Διαφωνώ Λίγο'),
                               ('4', 'Συμφωνώ Λίγο'),
                               ('5', 'Συμφωνώ'),
                               ('6', 'Συμφωνώ Απολύτως')],
                   'dk': [],
                   'qsf': 'Expl_Coping_9'},
 'Expl_Coping_10': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                            'διάρκεια της κρίσης με τον κορονοιό: Το να αφιερώνω τον εαυτό μου στο να βοηθώ άλλους',
                    'options': [('1', 'Διαφωνώ Απολύτως'),
                                ('2', 'Διαφωνώ'),
                                ('3', 'Διαφωνώ Λίγο'),
                                ('4', 'Συμφωνώ Λίγο'),
                                ('5', 'Συμφωνώ'),
                                ('6', 'Συμφωνώ Απολύτως')],
                    'dk': [],
                    'qsf': 'Expl_Coping_10'},
 'Expl_Coping_11': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                            'διάρκεια της κρίσης με τον κορονοιό: Το να αφιερώνω τον εαυτό μου στο να ετοιμάζομαι για την κρίση',
                    'options': [('1', 'Διαφωνώ Απολύτως'),
                                ('2', 'Διαφωνώ'),
                                ('3', 'Διαφωνώ Λίγο'),
                                ('4', 'Συμφωνώ Λίγο'),
                                ('5', 'Συμφωνώ'),
                                ('6', 'Συμφωνώ Απολύτως')],
                    'dk': [],
                    'qsf': 'Expl_Coping_11'},
 'Expl_Coping_12': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                            'διάρκεια της κρίσης με τον κορονοιό: Το να αφιερώνω τον εαυτό μου στο να ακολουθώ τις οδηγίες της κυβέρνησης',
                    'options': [('1', 'Διαφωνώ Απολύτως'),
                                ('2', 'Διαφωνώ'),
                                ('3', 'Διαφωνώ Λίγο'),
                                ('4', 'Συμφωνώ Λίγο'),
                                ('5', 'Συμφωνώ'),
                                ('6', 'Συμφωνώ Απολύτως')],
                    'dk': [],
                    'qsf': 'Expl_Coping_12'},
 'Expl_Coping_13': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                            'διάρκεια της κρίσης με τον κορονοιό: Το να αφιερώνω τον εαυτό μου στη δουλειά/επαγγελματικές δραστηριότητες',
                    'options': [('1', 'Διαφωνώ Απολύτως'),
                                ('2', 'Διαφωνώ'),
                                ('3', 'Διαφωνώ Λίγο'),
                                ('4', 'Συμφωνώ Λίγο'),
                                ('5', 'Συμφωνώ'),
                                ('6', 'Συμφωνώ Απολύτως')],
                    'dk': [],
                    'qsf': 'Expl_Coping_13'},
 'Expl_Coping_14': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                            'διάρκεια της κρίσης με τον κορονοιό: Το να αφιερώνω τον εαυτό μου σε διάφορες δραστηριότητες ή χόμπι',
                    'options': [('1', 'Διαφωνώ Απολύτως'),
                                ('2', 'Διαφωνώ'),
                                ('3', 'Διαφωνώ Λίγο'),
                                ('4', 'Συμφωνώ Λίγο'),
                                ('5', 'Συμφωνώ'),
                                ('6', 'Συμφωνώ Απολύτως')],
                    'dk': [],
                    'qsf': 'Expl_Coping_14'},
 'Expl_Coping_15': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                            'διάρκεια της κρίσης με τον κορονοιό: Ο Θεός ή η θρησκεία',
                    'options': [('1', 'Διαφωνώ Απολύτως'),
                                ('2', 'Διαφωνώ'),
                                ('3', 'Διαφωνώ Λίγο'),
                                ('4', 'Συμφωνώ Λίγο'),
                                ('5', 'Συμφωνώ'),
                                ('6', 'Συμφωνώ Απολύτως')],
                    'dk': [],
                    'qsf': 'Expl_Coping_15'},
 'Expl_Coping_16': {'text': 'Πόσο συμφωνείτε, με τις ακόλουθες επιλογές; Έχω βρει ότι τα παρακάτω είναι χρήσιμα στη μείωση του αισθήματος δυσφορίας κατά τη '
                            'διάρκεια της κρίσης με τον κορονοιό: Η γνώση των ενεργειών που έχει πάρει η κυβέρνηση ή άλλες δημόσριες υπηρεσίες',
                    'options': [('1', 'Διαφωνώ Απολύτως'),
                                ('2', 'Διαφωνώ'),
                                ('3', 'Διαφωνώ Λίγο'),
                                ('4', 'Συμφωνώ Λίγο'),
                                ('5', 'Συμφωνώ'),
                                ('6', 'Συμφωνώ Απολύτως')],
                    'dk': [],
                    'qsf': 'Expl_Coping_16'},
 'Expl_media_1': {'text': 'Κατά τη διάρκεια της περιόδου όπου ο κορονοϊός έχει επηρρεάσει τη χώρα σας... Έχω αναζητήσει πληροφορίες από την κυβέρνηση της '
                          'χώρας πιο συχνά από ότι στο παρελθόν',
                  'options': [('1', 'Διαφωνώ Απολύτως'),
                              ('2', 'Διαφωνώ'),
                              ('3', 'Διαφωνώ Λίγο'),
                              ('4', 'Συμφωνώ Λίγο'),
                              ('5', 'Συμφωνώ'),
                              ('6', 'Συμφωνώ Απολύτως')],
                  'dk': [],
                  'qsf': 'Expl_media_1'},
 'Expl_media_2': {'text': 'Κατά τη διάρκεια της περιόδου όπου ο κορονοϊός έχει επηρρεάσει τη χώρα σας... Έχω αναζητήσει πληροφορίες από ανεξάρτητα '
                          'ειδησιογραφικά πρακτορεία της χώρας πιό συχνά από ότι στο παρελθόν',
                  'options': [('1', 'Διαφωνώ Απολύτως'),
                              ('2', 'Διαφωνώ'),
                              ('3', 'Διαφωνώ Λίγο'),
                              ('4', 'Συμφωνώ Λίγο'),
                              ('5', 'Συμφωνώ'),
                              ('6', 'Συμφωνώ Απολύτως')],
                  'dk': [],
                  'qsf': 'Expl_media_2'},
 'Expl_media_3': {'text': 'Κατά τη διάρκεια της περιόδου όπου ο κορονοϊός έχει επηρρεάσει τη χώρα σας... Έχω αναζητήσει πληροφορίες από διεθνή ειδησιογραφικά '
                          'πρακτορεία πιό συχνά από ότι στο παρελθόν',
                  'options': [('1', 'Διαφωνώ Απολύτως'),
                              ('2', 'Διαφωνώ'),
                              ('3', 'Διαφωνώ Λίγο'),
                              ('4', 'Συμφωνώ Λίγο'),
                              ('5', 'Συμφωνώ'),
                              ('6', 'Συμφωνώ Απολύτως')],
                  'dk': [],
                  'qsf': 'Expl_media_3'},
 'Expl_media_4': {'text': 'Κατά τη διάρκεια της περιόδου όπου ο κορονοϊός έχει επηρρεάσει τη χώρα σας... Έχω αναζητήσει πληροφορίες από φίλους και συγγενείς '
                          'πιο συχνά από ότι στο παρελθόν',
                  'options': [('1', 'Διαφωνώ Απολύτως'),
                              ('2', 'Διαφωνώ'),
                              ('3', 'Διαφωνώ Λίγο'),
                              ('4', 'Συμφωνώ Λίγο'),
                              ('5', 'Συμφωνώ'),
                              ('6', 'Συμφωνώ Απολύτως')],
                  'dk': [],
                  'qsf': 'Expl_media_4'},
 'Expl_media_5': {'text': 'Κατά τη διάρκεια της περιόδου όπου ο κορονοϊός έχει επηρρεάσει τη χώρα σας... Έχω αναζητήσει πληροφορίες στα μέσα κοινωνικής '
                          'δικτύωσης πιο συχνά από ότι στο παρελθόν',
                  'options': [('1', 'Διαφωνώ Απολύτως'),
                              ('2', 'Διαφωνώ'),
                              ('3', 'Διαφωνώ Λίγο'),
                              ('4', 'Συμφωνώ Λίγο'),
                              ('5', 'Συμφωνώ'),
                              ('6', 'Συμφωνώ Απολύτως')],
                  'dk': [],
                  'qsf': 'Expl_media_5'},
 'Expl_media_6': {'text': 'Κατά τη διάρκεια της περιόδου όπου ο κορονοϊός έχει επηρρεάσει τη χώρα σας... Ακούω περισσότερες θετικές ιστορίες από αρνητικές '
                          'ιστορίες για τη συμπεριφορά των ανθρώπων κατά τη διάρκεια της πανδημίας του κορονοϊού',
                  'options': [('1', 'Διαφωνώ Απολύτως'),
                              ('2', 'Διαφωνώ'),
                              ('3', 'Διαφωνώ Λίγο'),
                              ('4', 'Συμφωνώ Λίγο'),
                              ('5', 'Συμφωνώ'),
                              ('6', 'Συμφωνώ Απολύτως')],
                  'dk': [],
                  'qsf': 'Expl_media_6'},
 'Trust_countrymeasure': {'text': 'Πιστεύετε ότι η κυβέρνηση της χώρας σας έχει λάβει τα κατάληλα μέτρα για την αντιμετώπιση του κορονοϊού;',
                          'options': [('0', 'Πολύ Λίγα Μέτρα'),
                                      ('1', '1'),
                                      ('2', '2'),
                                      ('3', '3'),
                                      ('4', '4'),
                                      ('5', 'Κατάλληλα Μέτρα'),
                                      ('6', '6'),
                                      ('7', '7'),
                                      ('8', '8'),
                                      ('9', '9'),
                                      ('10', 'Πολύ περισσότερα μέτρα από όσα θα έπρεπε')],
                          'dk': [],
                          'qsf': 'Trust_countrymeasure'},
 'AD_gain': {'text': 'Φανταστείτε ότι η χώρα σας προετοιμάζεται για μια επιδημία από μια ασυνήθιστη ασθένεια η οποία υπολογίζεται ότι θα οδηγήσει στο θάνατο '
                     '600 άτομα. Έχουν προταθεί δύο διαφορετικά προγράμματα για την αντιμετώπιση της ασθένειας. Υποθέστε ότι ο ακριβής επιστημονικός '
                     'υπολογισμός των συνεπειών της ασθένειας είναι όπως αναφέρεται παρακάτω: Ποιά από τις δύο επιλογές θα διαλέγατε;',
             'options': [('1', 'Αν επιλεχθεί το πρόγραμμα Α, 200 άνθρωποι θα σωθούν.'),
                         ('2', 'Αν επιλεχθεί το πρόγραμμα Β, τότε υπάρχει 1/3 πιθανότητα να σωθούν 600 άνθρωποι και 2/3 πιθανότητα να μη σωθεί κανένας.')],
             'dk': [],
             'qsf': 'AD_gain'},
 'AD_loss': {'text': 'Φανταστείτε ότι η χώρα σας προετοιμάζεται για μια επιδημία από μια ασυνήθιστη ασθένεια η οποία υπολογίζεται ότι θα οδηγήσει στο θάνατο '
                     '600 άτομα. Έχουν προταθεί δύο διαφορετικά προγράμματα για την αντιμετώπιση της ασθένειας. Υποθέστε ότι ο ακριβής επιστημονικός '
                     'υπολογισμός των συνεπειών της ασθένειας είναι όπως αναφέρεται παρακάτω: Ποιά από τις δύο επιλογές θα διαλέγατε;',
             'options': [('1', 'Αν επιλεχθεί το πρόγραμμα Γ, 400 άνρωποι θα χάσουν τη ζωή τους.'),
                         ('2',
                          'Αν επιλεχθεί το πρόγραμμα Δ, τότε υπάρχει 1/3 πιθανότητα να μη χαθούν ζωές και 2/3 πιθανότητα να χάσουν τη ζωή τους 600 άνθρωποι.')],
             'dk': [],
             'qsf': 'AD_loss'},
 'Dem_islolation': {'text': 'Ποιο από τα παρακάτω περιγράφει με μεγαλύτερη ακρίβεια την τωρινή σας κατάσταση;',
                    'options': [('1', 'Η ζωή προχωράει όπως συνήθως'),
                                ('2', 'Η ζωή συνεχίζει με μικρές αλλαγές'),
                                ('3', 'Σε περιορισμό (απομόνωση)'),
                                ('4', 'Σε περιορισμό (απομόνωση) σε κάποιο νοσοκομείο/ιατρικό κέντρο ή παρόμοιο μέρος')],
                    'dk': [],
                    'qsf': 'Dem_islolation'}}

_GREEK_TRANSLIT = str.maketrans({"α": "a", "β": "b", "γ": "g", "δ": "d", "ε": "e", "ζ": "z", "η": "i", "θ": "th", "ι": "i", "κ": "k", "λ": "l",
                                 "μ": "m", "ν": "n", "ξ": "x", "ο": "o", "π": "p", "ρ": "r", "σ": "s", "ς": "s", "τ": "t", "υ": "y", "φ": "f",
                                 "χ": "ch", "ψ": "ps", "ω": "o", "ß": "b", "µ": "m"})
# ordered (pattern, nuts1); applied to a lower-case latin skeleton of the free-text Dem_state answer
_STATE_RULES = [
    (r"thessalon|tessalon|thessalin|^tes/|thes/", "north"),
    (r"att|atik|atic|atin|athin|athen|^ath|aten|ateena|peira|pirea|kallithea|marous|palaio f|agia paraskev|agia (varvar|barbar)|alimos|argyro", "attica"),
    (r"krit|krhth|kreeta|crete|irakle|heraklion|chani|lasith|lassith", "islands"),
    (r"lesb|lesv|samo|ikari|chios|chio|(v|b)oreio(y|u)? aigai|dodekan|kyklad|santorini", "islands"),
    (r"makedon|macedon|chalkidik|imathi|imati|pella|pieri|serr|kilki|veria|kozan|florin|kastori|kavala|kabala|кавала|xanth|dram|ebro|evro|ioannin|^amt|^amth", "north"),
    (r"ionion|ionian|kerky|corfu|zakyn|lefkad", "centre"),
    (r"tessali|thessali|laris|magnis|magnes|volos|trikal|karditsa", "centre"),
    (r"peloponn|pelopon|korinth|arkad|lakon|achai|achaia|achaï|patra", "centre"),
    (r"fthiot|ftiot|boiot|voiot|evboi|eyboi|euboe|sterea", "centre"),
]


def _skeleton(s):
    s = re.sub(r"<U\+([0-9A-Fa-f]{4})>", lambda mm: chr(int(mm.group(1), 16)), str(s))
    s = unicodedata.normalize("NFKD", s.lower())
    s = "".join(ch for ch in s if not unicodedata.combining(ch))
    return s.translate(_GREEK_TRANSLIT).strip()


def state_to_nuts1(s):
    if s is None or (isinstance(s, float) and s != s):
        return None
    sk = _skeleton(s)
    for pat, reg in _STATE_RULES:
        if re.search(pat, sk):
            return reg
    return None


def h3_covidistress(root):
    did = "covidistress"
    df = pd.read_csv(rawp(root, "osf_z39us_covidistress_2020", "covidistress_2020-05-30_final_cleaned.csv"), encoding="latin-1", low_memory=False)
    g = df[df.Country == "Greece"].copy()
    n_gr = len(g)
    g = g[~(pd.to_numeric(g.Dem_age, errors="coerce") < 17)].reset_index(drop=True)
    demo = demo_frame(did, len(g))
    demo["age_band"] = [age_band(a) for a in pd.to_numeric(g.Dem_age, errors="coerce")]
    demo["gender"] = g.Dem_gender.map({"Male": "male", "Female": "female"})
    demo["edu3"] = g.Dem_edu.astype(str).str.strip().map({
        "PhD/Doctorate": "high", "College degree, bachelor, master": "high",
        "Some College, short continuing education or equivalent": "medium", "Up to 12 years of school": "medium",
        "Up to 9 years of school": "low", "Up to 6 years of school": "low", "None": "low"})
    demo["nuts1"] = [state_to_nuts1(s) if str(e).strip().lower() != "yes" else None for s, e in zip(g.Dem_state, g.Dem_Expat)]
    recode = {"AD_gain": {"Program A": 1, "Program B": 2}, "AD_loss": {"Program C": 1, "Program D": 2},
              "Dem_islolation": {"Life carries on as usual": 1, "Life carries on with minor changes": 2, "Isolated": 3,
                                 "Isolated in medical facility of similar location": 4}}
    items = []
    for var, w in COVIDISTRESS_EL.items():
        s = g[var].map(recode[var]) if var in recode else g[var]
        qtype = "binary" if len(w["options"]) == 2 else ("nominal" if var in ("Dem_islolation",) else "ordinal")
        text = w["text"]
        items.append(item(var, s, text, w["options"], dk=w["dk"], qtype=qtype, language="el",
                          source=f"COVIDiSTRESS v1.1 Qualtrics file with all translations (OSF z39us file 8ex5h), Greek (EL) translation, question {w['qsf']}; "
                                 "numeric codes per producers' May-30 cleaning notebook (OSF dgb4p)"))
    excluded = [
        {"variable": "PSS10_avg, SLON3_avg, neu, ext, ope, agr, con, SPS_avg, Scale_UCLA_TRI_avg", "reason": "producer-derived scale scores"},
        {"variable": "AD_check", "reason": "methodological recognition check of the Asian-disease vignette (admin/screening)"},
        {"variable": "Expl_Distress_txt, Expl_coping_txt, Final_open", "reason": "free text"},
        {"variable": "born_92, experience_war*, war_injury, loss_during_war, time_spent_in_war*, Scale_UCLA_TRI_*, PS_PTSD_*", "reason": "war-trauma supplement not asked in Greece (0 answers)"},
        {"variable": "Dem_riskgroup", "reason": "health-risk-group status of self/close relations (background/demographic block)"},
        {"variable": "Dem_age, Dem_gender, Dem_edu, Dem_edu_mom, Dem_employment, Dem_Expat, Dem_state, Dem_maritalstatus, Dem_dependents, Dem_isolation_adults, Dem_isolation_kids", "reason": "demographics / household counts"},
        {"variable": "Unnamed: 0, Duration..in.seconds., RecordedDate, UserLanguage, Country", "reason": "ID / admin / timestamps"},
    ]
    dates = pd.to_datetime(g.RecordedDate, errors="coerce")
    langs = g.UserLanguage.astype(str)
    man = manifest_entry(root, "osf_z39us_covidistress_2020")
    meta = {"title": "COVIDiSTRESS global survey (2020) — respondents residing in Greece", "source": "COVIDiSTRESS consortium, OSF z39us, final cleaned file of 30 May 2020",
            "licence": man.get("licence"), "fieldwork": f"{dates.min():%Y-%m} to {dates.max():%Y-%m}",
            "mode": "Online self-completion (Qualtrics), open link distributed via researchers/social media",
            "population": "Adults 18+ reporting Greece as country of residence (convenience sample)", "_weighted": False,
            "notes": [f"Greek rows: {n_gr}; dropped {n_gr - len(g)} aged <17.",
                      "Convenience (snowball/social-media) sample; no weights (weight=1).",
                      f"Interview language: {int((langs == 'EL').sum())} Greek (EL), {int((langs != 'EL').sum())} other languages; wording given is the Greek translation from the Qualtrics file.",
                      "nuts1 parsed from free-text Dem_state (mojibake '<U+XXXX>' decoded, transliterated, keyword rules); null if unparseable, not Greek, or Dem_Expat=yes.",
                      "edu3: PhD/college degree=high; some college/short continuing education or up to 12 years=medium; up to 9 years or less=low.",
                      "AD_gain and AD_loss are the two framings of the Asian-disease vignette; each respondent was shown one (split-ballot).",
                      "Expl_Distress code 99 'Does not apply to my current situation' treated as non-substantive (dkCodes).",
                      "Trust_countrymeasure recoded by producers to 0-10 (0 too little, 5 appropriate, 10 too much).",
                      "Scale_SLON_1-3 are items 11-13 of the Scale_PSS10_UCLA matrix (renamed by producers)."]}
    return finish(root, did, demo, items, meta, excluded)


# =============================================================================================== H4 bank satisfaction

BANK_SCALE = [("0", "Totally dissatisfied"), ("1", "Dissatisfied"), ("2", "Neither satisfied nor dissatisfied"), ("3", "Satisfied"), ("4", "Totally satisfied")]
BANK_CRIT = {
    "c1": ("SATISFACTION WITH PRODUCTS AND SERVICES", ["Products and services’ variety", "Provided information", "Problem solving efficiency", "Problem solving time",
                                                      "Products and services’ quality", "Procurements of products and services", "Returns of products and services",
                                                      "Specialized services availability"], "Total satisfaction with products and services"),
    "c2": ("SATISFACTION WITH BRANCH NETWORK", ["Ease of access", "Branch network area coverage", "Branches’ atmosphere", "Branches’ cleanliness", "Branches’ layout",
                                              "Staff adequacy", "Waiting time", "Service time", "Cashiers’ number", "ATMs’ and APSs’ number"], "Total satisfaction with branch network"),
    "c3": ("SATISFACTION WITH STAFF", ["Staff kindness and willingness", "Staff knowledge", "Staff confidentiality", "Staff skills", "Staff image", "Staff professionalism",
                                      "Staff reliability"], "Total satisfaction with staff"),
    "c4": ("SATISFACTION WITH CUSTOMER SERVICE", None, "Total satisfaction with customer service"),
}


def h4_banksat(root):
    did = "banksat"
    df = pd.read_excel(rawp(root, "mendeley_8ghbmydv77_bank_satisfaction_gr", "Data.xlsx"), sheet_name=0)
    demo = demo_frame(did, len(df))
    pre = "Retail customers’ satisfaction with their bank in Greece. Please rate (0 = totally dissatisfied; 1 = dissatisfied; 2 = neither satisfied nor dissatisfied; 3 = satisfied; 4 = totally satisfied). "
    src = "Questionnaire.docx (Mendeley 8ghbmydv77, English); criteria order matched to columns c1s1.. in Data.xlsx"
    items = []
    for c, (head, subs, total) in BANK_CRIT.items():
        items.append(item(f"{c}ts", df[f"{c}ts"], f"{pre}{head}: {total}", BANK_SCALE, qtype="ordinal", source=src))
        for i, lab in enumerate(subs or []):
            items.append(item(f"{c}s{i + 1}", df[f"{c}s{i + 1}"], f"{pre}{head}: {lab}", BANK_SCALE, qtype="ordinal", source=src))
    items.append(item("ts", df["ts"], f"{pre}TOTAL SATISFACTION WITH THE BANK", BANK_SCALE, qtype="ordinal", source=src))
    excluded = [{"variable": "c4s1-c4s9", "reason": "wording cannot be determined: data hold 9 customer-service sub-criteria but the questionnaire lists 7, so the column-to-wording mapping is ambiguous"}]
    man = manifest_entry(root, "mendeley_8ghbmydv77_bank_satisfaction_gr")
    meta = {"title": "Retail customers' satisfaction with banks in Greece (4 semesters, 2017-2019)", "source": "Drosos, Skordoulis, Tsotsolas, Kyriakopoulos; Mendeley Data 10.17632/8ghbmydv77.2",
            "licence": man.get("licence"), "fieldwork": "2017-06 to 2019-06",
            "mode": "Electronically distributed self-completion questionnaire (per Mendeley description: 'random sampling')",
            "population": "Retail customers of the 4 systemic Greek banks (panel, 4 consecutive semesters)", "_weighted": False,
            "notes": ["Fieldwork period from the Mendeley dataset description ('four consecutive semesters, between June 2017 and June 2019'); the data file has no date variable.",
                      "Rows are questionnaires, not persons: 1,255 customers at semester 1, re-surveyed; 5,018 rows total. No respondent, wave or bank identifier, so repeated measures cannot be linked.",
                      "No demographics in the file (all demographic columns null); weight=1.",
                      "Questionnaire is in English (fieldwork language presumably Greek; Greek instrument not available).",
                      "Sub-criterion labels assigned to columns c1s1..c3s7 in questionnaire order (counts match: 8, 10, 7); c4 sub-criteria excluded (count mismatch)."]}
    return finish(root, did, demo, items, meta, excluded)


# =============================================================================================== H5 cultural survey

_YESNO = {"Yes": 1, "No": 2}
CULT_ACTIVITIES = [("Telling stories (to children or other groups of people)", "Αφήγηση παραμυθιών (σε παιδιά ή άλλες ομάδες ανθρώπων)", "storytelling"),
                   ("Arts and crafts activities (e.g., gardening, traditional cooking)", "Δραστηριότητες με τέχνες και χειροτεχνίες (π.χ., κηπουρική, παραδοσιακή μαγειρική)", "artscrafts"),
                   ("Practising group games or sports", "Εξάσκηση ομαδικών παιχνιδιών ή αθλημάτων (όχι με ομοσπονδία ή επαγγελματικά)", "groupsports"),
                   ("Popular events (such as traditional cultural festivals, gatherings or activities, etc.)", "Συμμετοχή σε παραδοσιακές ή λαϊκές συλλογικές εκδηλώσεις ή άλλες κοινοτικές δραστηριότητες", "popularevents"),
                   ("Going to religious places or places of worship, or undertaking any collective spiritual practices", "Επίσκεψη σε θρησκευτικούς χώρους ή χώρους λατρείας", "religious"),
                   ("Going to restaurants, bars, etc.", "Έξοδος σε εστιατόρια, μπαρ κλπ", "restaurants"),
                   ("Going to discos, clubs, dance halls, etc.", "Έξοδος σε ντίσκο, κλαμπ, αίθουσες χορού κλπ", "discos"),
                   ("Going to fairs and markets", "Επίσκεψη σε εκθέσεις και αγορές", "fairs"),
                   ("Walking around the city", "Περίπατοι στην πόλη", "citywalks"),
                   ("Walking in nature", "Περίπατοι στην φύση", "naturewalks")]
CULT_MULTI = {
    # EN column index, GR column index, var prefix, [(EN option, GR option, suffix)], extra EN variants to strip
    14: (13, "done6m", CULT_ACTIVITIES[:3] + [("Popular events (such as traditional cultural festivals, gatherings or activities, etc.)", "Συμμετοχή σε παραδοσιακές ή λαϊκές συλλογικές εκδηλώσεις ή άλλες κοινοτικές δραστηριότητες (από φεστιβάλ γειτονιάς, καρναβάλι κ.λπ.)", "popularevents")] + CULT_ACTIVITIES[4:]),
    15: (14, "wantmore", [("Storytelling", "Διήγηση μύθων", "storytelling")] + CULT_ACTIVITIES[1:]),
    23: (22, "wantmore2", [("Activities to do with arts and crafts, woodwork, gardening, traditional cooking, etc.", "Δραστηριότητες σχετικές με τέχνες,χειροτεχνίες, κηπουρική, παραδοσιακή μαγειρική κ.λπ.", "artscrafts")] + CULT_ACTIVITIES[2:]),
    43: (42, "groups", [("Artistic or cultural entity or group", "Καλλιτεχνικός ή πολιτιστικός σύλλογος ή ομάδα", "artistic"),
                        ("Social entity or movement (family association, non-formal education, NGO, etc.)", "Κοινωνικός σύλλογος ή κίνημα (οικογενειακός σύλλογος, μη τυπική εκπαίδευση, ΜΚΟ κ.λπ.)", "social"),
                        ("Sports club or hiking centre", "Αθλητικό κλαμπ ή κέντρο πεζοπορίας", "sports"),
                        ("Spiritual or religious entity", "Πνευματικός ή θρησκευτικός σύλλογος", "religious"),
                        ("Other entities or groups for carrying out shared activities", "Άλλες οντότητες ή ομάδες για την εκτέλεση κοινών δραστηριοτήτων", "other")]),
    48: (47, "courses", [("Playing instruments, singing, making music", "Όργανα, τραγούδι, σύνθεση μουσικής", "music"),
                         ("Writing, prose, poetry, articles, etc.", "Γραφή, πεζογραφία, ποίηση, άρθρα κ.λπ.", "writing"),
                         ("Acting or taking part in theatre productions", "Υποκριτική ή συμμετοχή σε θεατρικές παραγωγές", "acting"),
                         ("Dancing, taking part in dance groups", "Χορός, συμμετοχή σε χορευτικά συγκροτήματα", "dance"),
                         ("Painting, drawing, arts and crafts (making clothes, pottery, etc.), sculpture, etc. (visual arts)", "Ζωγραφική, σχέδιο, τέχνες και χειροτεχνίες (κατασκευή ρούχων, αγγεία κ.λπ.), γλυπτική κ.λπ. (εικαστικές τέχνες)", "visualarts"),
                         ("Filming, artistic photography, making films, short films, etc. (audiovisuals)", "Γυρίσματα, καλλιτεχνική φωτογραφία, δημιουργία ταινιών, μικρού μήκους κ.λπ. (οπτικοακουστικά)", "audiovisual")]),
    49: (48, "veryimp", [("Sharing your artistic creations (music, photographs, works of art, audiovisuals, etc.) on websites or social networks.", "Κοινή χρήση των καλλιτεχνικών σας δημιουργιών (μουσική, φωτογραφίες, έργα τέχνης, οπτικοακουστικά κ.λπ.) σε ιστότοπους ή κοινωνικά δίκτυα.", "sharecreations"),
                         ("Writing (articles, tales, stories, etc.) and sharing what you write on websites, blogs or social networks.", "Γράφοντας (άρθρα, ιστορίες, κ.λπ.) και κοινοποίηση όσων γράφετε σε ιστότοπους, ιστολόγια ή κοινωνικά δίκτυα.", "writeshare"),
                         ("Making videos on a particular subject and sharing them with followers (YouTubers, educational videos, training, etc.)", "Δημιουργία βίντεο για ένα συγκεκριμένο θέμα και κοινή χρήση τους με τους ακόλουθους (YouTubers, εκπαιδευτικά βίντεο, εκπαίδευση κ.λπ.)", "videos")]),
}
# EN col -> (GR col, var, EN value -> code, [(code, GR label)], dk [(code, GR label)], type)
CULT_SINGLE = {
    10: (11, "internet_often", _YESNO, [("1", "Ναι"), ("2", "Όχι")], [], "binary"),
    25: (24, "participate_more", {"Strongly agree": 1, "Strongly disagree": 2, "Don't know/Not answered": 8}, [("1", "Συμφωνώ απολύτως"), ("2", "Διαφωνώ εντελώς")], [("8", "Δεν γνωρίζω/Δεν απαντώ")], "binary"),
    34: (33, "bother_library_closed", {"Yes": 1, "No": 2, "Don't know/Not answered": 8}, [("1", "Πολύ"), ("2", "Καθόλου")], [("8", "Δεν γνωρίζω/Δεν απαντώ")], "binary"),
    35: (34, "bother_culturalcentre_closed", {"Yes": 1, "No": 2, "Don't know/Not answered": 8}, [("1", "Πολύ"), ("2", "Καθόλου")], [("8", "Δεν γνωρίζω/Δεν απαντώ")], "binary"),
    52: (51, "assoc_support_entrepreneurship", _YESNO, [("1", "Ναι"), ("2", "Όχι")], [], "binary"),
    53: (52, "know_socent_sports", _YESNO, [("1", "Ναι"), ("2", "Όχι")], [], "binary"),
    54: (53, "socent_sports_contribute", {"Yes": 1, "No": 2, "Don't know": 8}, [("1", "Ναι"), ("2", "Όχι")], [("8", "Δεν γνωρίζω")], "binary"),
    55: (54, "socent_sports_should_create", _YESNO, [("1", "Ναι"), ("2", "Όχι")], [], "binary"),
    56: (55, "know_socent_culture", {"Yes": 1, "No": 2, "Don't know": 8}, [("1", "Ναι"), ("2", "Όχι")], [("8", "Δεν γνωρίζω")], "binary"),
    57: (56, "socent_culture_contribute", _YESNO, [("1", "Ναι"), ("2", "Όχι")], [], "binary"),
    58: (57, "socent_culture_should_create", _YESNO, [("1", "Ναι"), ("2", "Όχι")], [], "binary"),
}
CULT_GR_LABEL_CHECK = {"Yes": {"Ναι", "Πολύ"}, "No": {"Όχι", "Καθόλου"}, "Strongly agree": {"Συμφωνώ απολύτως"}, "Strongly disagree": {"Διαφωνώ εντελώς"},
                       "Don't know/Not answered": {"Δεν γνωρίζω/Δεν απαντώ"}, "Don't know": {"Δεν γνωρίζω"}}
CULT_FREQ = {17: "concerts", 18: "film_cinema", 19: "dance_shows", 20: "film_home", 21: "theatre", 22: "theatre_takingpart"}
CULT_IMP = {27: "cinema_photography", 28: "music", 29: "visual_arts", 30: "dance", 31: "theatre", 32: "popular_events", 33: "reading"}
CULT_AGREE = {38: "arts_viewpoints", 39: "culture_meet_people", 40: "arts_necessary", 41: "culture_harmony", 42: "sports_harmony"}
MUNI_NUTS1 = {"Αγρινίου": "centre", "Αιτωλοακαρνανίας": "centre", "Αμφίκλειας Ελάτειας": "centre", "Αταλάντη Φθιώτιδας": "centre", "Δομοκού": "centre",
              "Καρδίτσας": "centre", "Λαμιέων": "centre", "Λαμιεων": "centre", "Λοκρών": "centre", "Πύργου": "centre", "Φαρσάλων": "centre",
              "Φθιώτιδας": "centre", "Χαλκιδέων": "centre", "Ανατολικής Σάμου": "islands", "Ιητων": "islands", "Χανίων": "islands",
              "Θεσσαλονίκης": "north", "Ιωαννίνων": "north"}
MUNI_ATTICA = {"Άνοιξης", "Ίλιον", "Ιλίου", "Ιλιου", "Αγίας Βαρβάρας", "Αγίας Παρασκευής", "Αγίου Δημητρίου", "Αγίων Αναργύρων Καματερού", "Αθηναίων",
               "Αιγάλεω", "Αιγαλεω", "Αλίμου", "Αμαρουσίου", "Αμπελοκήπων", "Αττικής", "Αχαρναί", "Βάρης Βούλας Βουλιαγμένης", "Βάρης βούλας βουλιαγμένης",
               "Βάρης-Βούλας-Βουλιαγμένης", "Βύρωνα", "Γέρακα", "Γλυφάδας", "Δάφνης", "Διονύσου", "Ελληνικού - Αργυρούπολης", "Ζωγράφου", "Ζωγραφου",
               "ζωγράφου", "Ηλιούπολης", "Καισαριανής", "Καλλιθέας", "Καλλιθεας", "Κερατσινίου-Δραπετσώνας", "Κηφισιάς", "Κορυδαλλού", "Κρωπίας",
               "Λυκόβρυσης - Πεύκης", "Μεταμόρφωσης", "Μοσχάτου - Ταύρου", "Νέας Ερυθραίας", "Νέας Ιωνίας", "Νέας Σμύρνης",
               "Νέας Φιλαδέλφειας - Νέας Χαλκηδόνας", "Νίκαιας - Αγίου Ιωάννη Ρέντη", "Π.Φάληρο", "Παλλήνης", "Παπάγου - Χολαργού", "Πειραιώς",
               "Περιστερίου", "Πετρούπολης", "Σαλαμίνας", "Σπάτων Αρτέμιδας", "ΦΥΛΗΣ", "Φιλοθέης- Ψυχικού", "Χαλανδρίου", "Χαϊδαρίου", "Χολαργού",
               "Ψυχικού", "Ωρωπού"}
MUNI_NUTS1.update({m_: "attica" for m_ in MUNI_ATTICA})


def _clean_hdr(h):
    return re.sub(r"\s+", " ", str(h)).strip()


def h5_culture(root):
    did = "culture"
    base = rawp(root, "mendeley_k5bg2d8z8r_cultural_survey_gr")
    en = pd.read_excel(os.path.join(base, "CulturalSurvey_Greece_English.xlsx"), sheet_name="Data")
    gr = pd.read_excel(os.path.join(base, "CulturalSurvey_Greece.xlsx"), sheet_name=0)
    assert len(en) == len(gr) and (pd.to_datetime(en.iloc[:, 0]).values == pd.to_datetime(gr.iloc[:, 0]).values).all(), "EN/GR files not row-aligned"
    keep = (en.Age.astype(str).str.strip() != "<16").values
    n_all = len(en)
    en, gr = en[keep].reset_index(drop=True), gr[keep].reset_index(drop=True)
    E, G = list(en.columns), list(gr.columns)
    demo = demo_frame(did, len(en))
    demo["age_band"] = en.Age.astype(str).str.strip().map({"16 to 24": "17-24", "25 to 34": "25-34", "35 to 44": "35-44", "45 to 54": "45-54", "55 to 64": "55-64", "65+": "65+"})
    demo["gender"] = en.Gender.astype(str).str.strip().map({"Female": "female", "Male": "male"})
    demo["edu3"] = en[E[5]].astype(str).str.strip().map({"I have not completed compulsory education": "low", "University level studies": "high",
                                                       "Postgraduate studies": "high", "PhD": "high"})  # 'Compulsory (primary, secondary)' ambiguous -> null
    muni = gr[G[1]].astype(str).str.strip()
    pref = en.Prefecture.astype(str).str.strip()
    demo["nuts1"] = [MUNI_NUTS1.get(m_) if m_ in MUNI_NUTS1 else ("attica" if p == "ATTICA" else None) for m_, p in zip(muni, pref)]
    src = "CulturalSurvey_Greece.xlsx (Greek Google-Forms column header = question text; Greek answer labels); codes from CulturalSurvey_Greece_English.xlsx"
    items = []
    # single-choice categorical
    for ie, (ig, var, cmap, opts, dk, qtype) in CULT_SINGLE.items():
        ev = en[E[ie]].astype(str).str.strip().where(en[E[ie]].notna())
        gv = gr[G[ig]].astype(str).str.strip().where(gr[G[ig]].notna())
        unknown = sorted(set(ev.dropna()) - set(cmap))
        if unknown:
            raise ValueError(f"culture col {E[ie]!r}: unmapped answers {unknown}")
        ok = all((e is None or e != e) or (g_ in CULT_GR_LABEL_CHECK[e]) for e, g_ in zip(ev, gv))
        if not ok:
            raise ValueError(f"culture col {E[ie]!r}: EN/GR answer labels not aligned")
        items.append(item(var, ev.map(cmap), _clean_hdr(G[ig]), opts, dk=dk, qtype=qtype, language="el", source=src))
    # frequency 1-3
    stem_f = "ΕΧΕΤΕ ΚΑΝΕΙ ΚΑΠΟΙΑ ΑΠΟ ΑΥΤΕΣ ΤΙΣ ΔΡΑΣΤΗΡΙΟΤΗΤΕΣ ΤΟΥΣ ΤΕΛΕΥΤΑΙΟΥΣ ΕΞΙ ΜΗΝΕΣ? "
    for ie, var in CULT_FREQ.items():
        items.append(item(f"freq6m_{var}", en[E[ie]], stem_f + _clean_hdr(G[ie - 1]), [("1", "Ποτέ"), ("2", "Ενίοτε"), ("3", "Συχνά ή πολύ συχνά")],
                          qtype="ordinal", language="el", source=src))
    # importance 0-10
    stem_i = "ΜΠΟΡΕΙΤΕ ΝΑ ΜΟΥ ΠΕΙΤΕ ΠΟΣΟ ΣΗΜΑΝΤΙΚΕΣ ΕΙΝΑΙ ΑΥΤΕΣ ΟΙ ΔΡΑΣΤΗΡΙΟΤΗΤΕΣ ΣΤΗ ΖΩΗ ΣΑΣ. 0: ΟΧΙ σημαντικό, 10: Πολύ σημαντικό. "
    o_imp = [("0", "0 ΟΧΙ σημαντικό")] + [(str(i), str(i)) for i in range(1, 10)] + [("10", "10 Πολύ σημαντικό")]
    for ie, var in CULT_IMP.items():
        items.append(item(f"imp_{var}", en[E[ie]], stem_i + _clean_hdr(G[ie - 1]), o_imp, qtype="ordinal", language="el", source=src))
    items.append(item("imp_arts_courses_school", en[E[36]], _clean_hdr(G[35]), [(str(i), str(i)) for i in range(11)], qtype="ordinal", language="el", source=src))
    stem_a = "ΜΠΟΡΕΙΤΕ ΝΑ ΜΟΥ ΠΕΙΤΕ ΣΕ ΠΟΙΟ ΒΑΘΜΟ ΣΥΜΦΩΝΕΙΤΕ ΜΕ ΤΙΣ ΠΑΡΑΚΑΤΩ ΔΗΛΩΣΕΙΣ; 0: Διαφωνώ εντελώς, 10: Συμφωνώ απολύτως. "
    o_agr = [("0", "0 Διαφωνώ εντελώς")] + [(str(i), str(i)) for i in range(1, 10)] + [("10", "10 Συμφωνώ απολύτως")]
    for ie, var in CULT_AGREE.items():
        items.append(item(f"agree_{var}", en[E[ie]], stem_a + _clean_hdr(G[ie - 1]), o_agr, qtype="ordinal", language="el", source=src))
    # multi-select -> one binary per option (blank question = missing)
    for ie, (ig, prefix, opts) in CULT_MULTI.items():
        vals = en[E[ie]]
        for v in vals.dropna().astype(str):
            rest = v
            for o_en, _, _ in sorted(opts, key=lambda t: -len(t[0])):
                rest = rest.replace(o_en, "")
            if rest.strip(" ,") != "":
                raise ValueError(f"culture multi-select {E[ie]!r}: unmatched option text {rest.strip(' ,')!r}")
        for o_en, o_gr, suf in opts:
            s = vals.map(lambda v, o=o_en: np.nan if v != v else (1 if o in str(v) else 0))
            items.append(item(f"{prefix}_{suf}", s, f"{_clean_hdr(G[ig])} [πολλαπλή επιλογή] Επιλογή: {o_gr}",
                              [("0", "Δεν επιλέχθηκε"), ("1", "Επιλέχθηκε")], qtype="binary", language="el",
                              source=src + "; multi-select checkbox split into one binary per option"))
    excluded = [
        {"variable": "Important places for cultural life_1..3", "reason": "ranked nominal choice among >11 places"},
        {"variable": "Generally do you think you participate in cultural activities more or less than others your age?", "reason": "wording cannot be determined: header asks more/less than peers but stored answers are a multi-select list of activities"},
        {"variable": "Have you done any of these activities in the last six months? (stem column), Can you tell me how important... (stem column), Unnamed: 37", "reason": "battery header columns without item data / stray entries"},
        {"variable": "Did your mother/father have any activity related to..., Does any of your children do any activity related to..., Do you have children?", "reason": "family background (demographic)"},
        {"variable": "Prefecture, How many years do you live there?, Gender, Age, education, work situation, occupation, nationality, always Greek nationality, household size, household relationships", "reason": "demographics / free text"},
        {"variable": "Date", "reason": "timestamp"},
    ]
    man = manifest_entry(root, "mendeley_k5bg2d8z8r_cultural_survey_gr")
    meta = {"title": "Cultural Survey Greece (cultural participation and needs)", "source": "Arakelian, Chalioris, Mitoula (Harokopio University); Mendeley Data 10.17632/k5bg2d8z8r.2",
            "licence": man.get("licence"), "fieldwork": f"{pd.to_datetime(en.iloc[:, 0]).min():%Y-%m} to {pd.to_datetime(en.iloc[:, 0]).max():%Y-%m}",
            "mode": "Online self-completion (Google Forms; Greek-language form)", "population": "Residents of Greece (mostly Attica), online convenience sample", "_weighted": False,
            "notes": [f"Rows: {n_all}; dropped {n_all - len(en)} with age '<16'. Age band '16 to 24' mapped to 17-24 (may contain 16-year-olds).",
                      "Online convenience sample, heavily concentrated in Attica; no weights (weight=1).",
                      "nuts1 from the Greek file's municipality answer (ΣΕ ΠΟΙΟ ΔΗΜΟ ΚΑΤΟΙΚΕΙΤΕ?), falling back to EN 'Prefecture' (ATTICA/other). The EN Prefecture flag is inconsistent with the municipality for a few municipalities (e.g. Δομοκού, Καρδίτσας flagged ATTICA; Σαλαμίνας, Ωρωπού flagged other); municipality used.",
                      "edu3: 'Compulsory (primary, secondary)' spans ISCED 1-3 and is set to null (not derivable); 'not completed compulsory'=low; university/postgraduate/PhD=high.",
                      "Variable names are adapter-assigned (the source has only long question headers); question text = Greek column header.",
                      "Multi-select questions (done6m_*, wantmore_*, wantmore2_*, groups_*, courses_*, veryimp_*) split into binaries; a respondent with the whole question blank is missing, not 0.",
                      "Filter follow-ups ('If yes...', 'If not...') were answered by more respondents than the filter implies; kept as recorded.",
                      "bother_* items: EN 'Yes/No' correspond to Greek 'Πολύ/Καθόλου' (verified row-wise); Greek labels used."]}
    return finish(root, did, demo, items, meta, excluded)


# =============================================================================================== H6 QoG EQI 2024

QOG_TEXT = {
    "Q1": ("Have you or any of your immediate family been enrolled or employed in the public school system in your area in the past 12 months?", "binary"),
    "Q2": ("Have you or any of your immediate family used public health care services in your area in the past 12 months?", "binary"),
    "Q3": ("Have you or anyone in your immediate family had any recent contact (positive or negative) with the security or police forces in your area in the past 12 months?", "binary"),
    "Q4": ("How would you rate the quality of public education in your area? (1 = very poor, 10 = excellent)", "ordinal"),
    "Q5": ("How would you rate the quality of the public health care system in your area? (1 = very poor, 10 = excellent)", "ordinal"),
    "Q6": ("How would you rate the quality of the police force in your area? (1 = very poor, 10 = excellent)", "ordinal"),
    "Q7": ("How much do you agree (1 = strongly disagree, 10 = strongly agree): Certain people are given special advantages in the public education system in my area.", "ordinal"),
    "Q8": ("How much do you agree (1 = strongly disagree, 10 = strongly agree): Certain people are given special advantages in the public health care system in my area.", "ordinal"),
    "Q9": ("How much do you agree (1 = strongly disagree, 10 = strongly agree): The police force gives special advantages to certain people in my area.", "ordinal"),
    "Q10": ("Do you agree, rather agree, rather disagree or disagree: All citizens are treated equally in the public education system in my area.", "ordinal"),
    "Q11": ("Do you agree, rather agree, rather disagree or disagree: All citizens are treated equally in the public health care system in my area.", "ordinal"),
    "Q12": ("Do you agree, rather agree, rather disagree or disagree: All citizens are treated equally by the police force in my area.", "ordinal"),
    "Q13": ("Do you agree, rather agree, rather disagree or disagree: In the area where I live, elections are conducted freely and fairly.", "ordinal"),
}
QOG_CORR = ("In this survey, we define corruption to mean ‘the abuse of entrusted public power for private gain’. This ‘abuse’ could be by any public employee or politician and the "
            "‘private gain’ might include money, gifts or other benefits. With this in mind, please respond to the following questions on corruption with a scale of 1 to 10, with ‘1’ being "
            "“strongly disagree” and ‘10’ being “strongly agree”. ")
QOG_TEXT.update({
    "Q14": (QOG_CORR + "Corruption is prevalent in my area’s local public school system.", "ordinal"),
    "Q15": (QOG_CORR + "Corruption is prevalent in the public health care system in my area.", "ordinal"),
    "Q16": (QOG_CORR + "Corruption is prevalent in the police force in my area.", "ordinal"),
    "Q17_1": ("People engage in corruption for different reasons. Thinking about the reasons why people engage in corruption in your area, again, using the same scale of 1 to 10, with ‘1’ being “strongly disagree” and ‘10’ being “strongly agree”, how much do you agree with the following? People in my area must use some form of corruption just to get some basic public services.", "ordinal"),
    "Q17_2": ("People engage in corruption for different reasons. Thinking about the reasons why people engage in corruption in your area, again, using the same scale of 1 to 10, with ‘1’ being “strongly disagree” and ‘10’ being “strongly agree”, how much do you agree with the following? Corruption in my area is used to get access to special unfair privileges and wealth.", "ordinal"),
    "Q18_1": ("In the last 12 months, have you or anyone in your family been asked by a public official to give an informal gift or bribe in schools and other education services?", "binary"),
    "Q18_2": ("In the last 12 months, have you or anyone in your family been asked by a public official to give an informal gift or bribe in health or medical services?", "binary"),
    "Q18_3": ("In the last 12 months, have you or anyone in your family been asked by a public official to give an informal gift or bribe in police authorities?", "binary"),
    "Q18_4": ("In the last 12 months, have you or anyone in your family been asked by a public official to give an informal gift or bribe in utilities (e.g. electric, water, trash collection, etc.)?", "binary"),
    "Q18_5": ("In the last 12 months, have you or anyone in your family been asked by a public official to give an informal gift or bribe to any other government-run agency?", "binary"),
    "Q19_1": ("In the last 12 months, have you or anyone in your family given an informal gift or bribe to schools or other education services?", "binary"),
    "Q19_2": ("In the last 12 months, have you or anyone in your family given an informal gift or bribe to health or medical services?", "binary"),
    "Q19_3": ("In the last 12 months, have you or anyone in your family given an informal gift or bribe to police?", "binary"),
    "Q19_4": ("In the last 12 months, have you or anyone in your family given an informal gift or bribe in utilities (such as electric, water, trash collection, etc.)?", "binary"),
    "Q19_5": ("In the last 12 months, have you or anyone in your family given an informal gift or bribe to any other government-run agency?", "binary"),
    "Q20": ("From what you remember, in the run-up to the last parliamentary election (month/year of the last national election inserted by country), did anyone offer you or anyone in your family a gift, money or personal favor in return for your vote in the election?", "binary"),
    "Q21": ("Changing topics a bit, how would you judge the current state of the economy in the area where you live?", "ordinal"),
    "Q22": ("What political party would you vote for if the national parliamentary election were today? (Respondent hears a pre-coded list of all actual political parties; 'other' and 'DK/refused' volunteered.)", "nominal"),
    "Q23_1": ("On a 1 to 10 scale, with ‘1’ being ‘no confidence at all’, and ‘10’ being ‘complete confidence’ to do the right thing, how much confidence do you personally have in Greece’s parliament?", "ordinal"),
    "Q23_2": ("On a 1 to 10 scale, with ‘1’ being ‘no confidence at all’, and ‘10’ being ‘complete confidence’ to do the right thing, how much confidence do you personally have in other people in your area?", "ordinal"),
    "Q23_3": ("On a 1 to 10 scale, with ‘1’ being ‘no confidence at all’, and ‘10’ being ‘complete confidence’ to do the right thing, how much confidence do you personally have in the European Union?", "ordinal"),
    "Q24_1": ("People might feel different levels of attachment to where they live and to Europe, on a scale of 1-10 with ’1’ being ’not at all’ and ’10’ being ’very attached’, how closely attached do you feel about Greece?", "ordinal"),
    "Q24_2": ("People might feel different levels of attachment to where they live and to Europe, on a scale of 1-10 with ’1’ being ’not at all’ and ’10’ being ’very attached’, how closely attached do you feel about your region within Greece?", "ordinal"),
    "Q24_3": ("People might feel different levels of attachment to where they live and to Europe, on a scale of 1-10 with ’1’ being ’not at all’ and ’10’ being ’very attached’, how closely attached do you feel about Europe?", "ordinal"),
    "Q25": ("How much do you agree (1 = strongly disagree, 10 = strongly agree): The government in Greece should reduce differences in peoples’ incomes by taxing wealthier people and then providing welfare to the poor.", "ordinal"),
    "Q26": ("How much do you agree (1 = strongly disagree, 10 = strongly agree): Discrimination against women is no longer a problem in Greece.", "ordinal"),
    "Q27": ("How much do you agree (1 = strongly disagree, 10 = strongly agree): On whole, Greece is worse-off by people coming to live here from other countries.", "ordinal"),
    "Q28": ("How much do you agree (1 = strongly disagree, 10 = strongly agree): Gays and lesbians should be allowed to marry legally.", "ordinal"),
    "Q29": ("How much do you agree (1 = strongly disagree, 10 = strongly agree): Advancing women’s and girls’ rights has gone too far, because it threatens men’s and boys’ opportunities.", "ordinal"),
    "D6": ("Apart from special occasions such as weddings and funerals, which of the following best describes how often do you attend religious services nowadays?", "ordinal"),
    "D7": ("On average, how many hours do you usually spend on social media platforms including Facebook, Instagram, Twitter, TikTok, YouTube and others in one day?", "ordinal"),
})


def h6_qog(root):
    did = "qog2024"
    df, m = pyreadstat.read_dta(rawp(root, "qog_eqi_2024", "qog_eqi_ind_24.dta"))
    g = df[df.NUTS1_code.astype(str).str.startswith("EL")].copy()
    assert set(pd.to_numeric(g.country, errors="coerce").unique()) == {21.0}
    n_gr = len(g)
    age = pd.to_numeric(g.D2, errors="coerce").where(lambda a: a < 999)
    g = g[~(age < 17)].reset_index(drop=True)
    age = pd.to_numeric(g.D2, errors="coerce").where(lambda a: a < 999)
    demo = demo_frame(did, len(g))
    demo["weight"] = norm_weight(pd.to_numeric(g.Dweight, errors="coerce") * pd.to_numeric(g.PSweight_o, errors="coerce"))
    demo["age_band"] = [age_band(a) for a in age]
    demo["gender"] = pd.to_numeric(g.D1, errors="coerce").map({1.0: "male", 2.0: "female"})
    demo["edu3"] = pd.to_numeric(g.D3, errors="coerce").map({1.0: "low", 2.0: "low", 3.0: "medium", 4.0: "high", 5.0: "high"})
    demo["nuts1"] = g.NUTS2_code.astype(str).map(NUTS2_TO_NUTS1)
    demo["urban"] = pd.to_numeric(g.D9, errors="coerce").map({1.0: "rural", 2.0: "urban", 3.0: "urban", 4.0: "urban"})
    src = "QoG EQI 2024 codebook (codebook_eqi_24.pdf, section 2.2-2.3; English master, interviews in Greek) + Stata value labels"
    items = []
    for var, (text, qtype) in QOG_TEXT.items():
        vl = m.variable_value_labels.get(var, {})
        dk = [(999, "Don’t know / Refuse")] if var == "Q22" else [(99, vl.get(99, "Don’t know / Refuse"))]
        opts = vl_options(vl, [d[0] for d in dk])
        if var == "Q22":
            present = {code_str(c) for c in pd.to_numeric(g[var], errors="coerce").dropna().unique()}
            opts = [(c, l) for c, l in opts if c in present]  # keep the Greek party list (codes present in Greek rows) + Other
        items.append(item(var, g[var], text, opts, dk=dk, qtype=qtype, source=f"{src}; {var}", language="en"))
    excluded = [
        {"variable": "D1, D2, D2RECODE, D3, D3RECODE, D4, D4RECODE, D5A, D5B, D8, D9", "reason": "demographics (D9 used for urban)"},
        {"variable": "Poland_elec", "reason": "Poland-only admin flag"},
        {"variable": "typeinterview, typetel, country, language, EQIregion, NUTS*_code/name, enddate, length", "reason": "admin / geography / timestamps"},
        {"variable": "Pweight, Dweight, PSweight_a, PSweight_o, Party_W", "reason": "weights"},
    ]
    t0 = pd.Timestamp("1960-01-01")
    ed = pd.to_numeric(g.enddate, errors="coerce")
    dmin, dmax = t0 + pd.to_timedelta(ed.min(), unit="ms"), t0 + pd.to_timedelta(ed.max(), unit="ms")
    mode = pd.to_numeric(g.typeinterview, errors="coerce")
    man = manifest_entry(root, "qog_eqi_2024")
    meta = {"title": "European Quality of Government Index (EQI) 2024 survey — Greece", "source": "QoG Institute, University of Gothenburg (Charron, Lapuente, Bauhr); fieldwork by Efficience 3",
            "licence": man.get("licence"), "fieldwork": f"{dmin:%Y-%m} to {dmax:%Y-%m}",
            "mode": f"Mixed: CATI ({int((mode == 1).sum())}) and CAWI online panel ({int((mode == 2).sum())}); Greek language",
            "population": "Residents of Greece aged 18+, ~600-670 per NUTS2 region (13 regions)", "_weighted": True,
            "notes": [f"Greek rows: {n_gr}; dropped {n_gr - len(g)} aged <17.",
                      "Fieldwork from 'enddate' (Stata %tc) of Greek rows; codebook: full EU sample Sept 2023 - March 2024.",
                      "Weight = Dweight (regional design weight, equal-n NUTS2 sampling) × PSweight_o (post-stratification age/gender/education, overall), normalized to mean 1.",
                      "edu3 from D3: 1 elementary or less, 2 secondary not completed = low; 3 secondary graduate = medium; 4-5 tertiary = high.",
                      "urban from D9 (size of place of interview): <10,000 = rural; >=10,000 = urban.",
                      "nuts1 from NUTS2_code (identical to official EL3/EL4/EL5/EL6).",
                      "D6 (religious attendance) and D7 (social media hours) are behaviour items in the producers' demographic block; included.",
                      "Q22 options restricted to the Greek party codes 183-191 plus 998 'Other'; 999 DK/refuse treated as dkCode.",
                      "Q1-Q3 are experience items; Q4-Q16 were asked of all respondents.",
                      "Wording is the English master codebook; Greek-language instrument not available."]}
    return finish(root, did, demo, items, meta, excluded)


# =============================================================================================== H7 Dinas et al. Greek survey

DINAS_NEIGH = {"muslims": "Muslims", "refugees": "Refugees", "gays": "Homosexuals", "alcoholics": "Alcoholics", "unmarried": "Unmarried couples",
               "jews": "Jews", "otherace": "People of another race"}
DINAS_ID = {"id_religion": "Religion", "id_nationality": "Nationality", "id_language": "Language", "id_gender": "Gender", "id_sclass": "Social class"}
DINAS_NOMOS = {1: "north", 2: "north", 3: "north", 4: "north", 5: "north", 6: "north", 7: "north", 8: "north", 9: "islands", 10: "north",
               11: "north", 12: "north", 13: "north", 14: "north"}


def h7_dinas(root):
    did = "dinas"
    df, m = pyreadstat.read_dta(rawp(root, "harvard_10.7910_DVN_CQUVCV", "greece.dta"))
    n_all = len(df)
    df = df[~(pd.to_numeric(df.age, errors="coerce") < 17)].reset_index(drop=True)
    demo = demo_frame(did, len(df))
    demo["age_band"] = [age_band(a) for a in pd.to_numeric(df.age, errors="coerce")]
    demo["gender"] = pd.to_numeric(df.female, errors="coerce").map({1.0: "female", 0.0: "male"})
    demo["edu3"] = pd.to_numeric(df.edu, errors="coerce").map({1.0: "low", 2.0: "low", 3.0: "low", 4.0: "medium", 5.0: "high", 6.0: "high", 7.0: "high"})
    demo["nuts1"] = pd.to_numeric(df.nomos, errors="coerce").map(DINAS_NOMOS)
    src = "Stata variable and value labels in greece.dta (English, producer-translated); no questionnaire published"
    items = []
    vl = m.variable_value_labels
    for var, lab in DINAS_NEIGH.items():
        items.append(item(var, df[var], f"Would you like to have the following as neighbours? {lab}", vl_options(vl[var], []), qtype="binary", source=f"{src}; label 'Would like as neighbors: {lab}'"))
    for var, lab in DINAS_ID.items():
        items.append(item(var, df[var], f"How important is each of the following for a person's character and identity? {lab}", vl_options(vl[var], []), qtype="ordinal",
                          source=f"{src}; label 'How important for a person's character and identity' + variable name {var}"))
    items.append(item("proud", df["proud"], "Do you agree or disagree with the following statement? I am proud to be Greek.", vl_options(vl["proud"], [88]), qtype="ordinal", source=f"{src}; label 'I am proud to be Greek'"))
    items.append(item("suffer", df["suffer"], "Do you agree or disagree with the following statement? Greeks have historically suffered more than other people.", vl_options(vl["suffer"], [88]), qtype="ordinal", source=f"{src}; label 'Greeks have historically suffered more than other people'"))
    excluded = [
        {"variable": "donate", "reason": "producer-derived dichotomy of amount (pledged donation to UNHCR); exact pledge wording undocumented"},
        {"variable": "amount, logamount", "reason": "continuous amount (19 distinct values, >11) / log transform"},
        {"variable": "pet", "reason": "wording cannot be determined (no variable or value labels)"},
        {"variable": "increase", "reason": "wording cannot be determined (no labels; codes -1/0/1)"},
        {"variable": "study_rec_b, permitstay_rec_b, moneygreekneeds_b, threat_b, responsible_b", "reason": "producer-dichotomized recodes without labels; wording cannot be determined"},
        {"variable": "reason_war, reason_econ, reason_pol, reason_benefits", "reason": "producer-coded mentions from an open-ended question (derived); question wording not documented"},
        {"variable": "nd, syriza, pasok, anel, xa, kke, potami", "reason": "producer-derived party dummies; underlying vote question (past vote vs intention, election) not documented"},
        {"variable": "*st (standardized), pc_*, index_*, mean_neighbors_st", "reason": "producer-derived standardized variables / indices"},
        {"variable": "T", "reason": "experimental treatment assignment (admin)"},
        {"variable": "asiaminor, ref28, newref, incdec, municipality, mdist, nomos", "reason": "family background / contextual / geography (nomos used for nuts1)"},
        {"variable": "edu, occupation, income, age, female, primary..unemployed, inc1000..inc5000", "reason": "demographics and producer dummies"},
        {"variable": "id", "reason": "ID"},
    ]
    man = manifest_entry(root, "harvard_10.7910_DVN_CQUVCV_greece")
    meta = {"title": "Family History and Attitudes Toward Outgroups — Greek survey (Dinas, Fouka, Schläpfer, JOP 2021)",
            "source": "Harvard Dataverse doi:10.7910/DVN/CQUVCV (greece.dta/greece.tab replication file)", "licence": man.get("licence"),
            "fieldwork": None, "mode": "Not documented in the replication files",
            "population": "Adults in 13 prefectures of Macedonia/Thrace (northern Greece) and Lesvos", "_weighted": False,
            "notes": [f"Rows: {n_all}; dropped {n_all - len(df)} aged <17.",
                      "Fieldwork date NOT verified: no date variable and no survey documentation in the Dataverse deposit (deposited 2019-09-10); the study concerns the 2015-16 refugee crisis, so fieldwork is presumably 2016-2018. Survey mode and sampling likewise undocumented.",
                      f"Respondent ages in file range {int(pd.to_numeric(df.age, errors='coerce').min())}-{int(pd.to_numeric(df.age, errors='coerce').max())} (no one under 30: band 17-24 is empty and 25-34 covers only ages 30-34)." if pd.to_numeric(df.age, errors='coerce').min() >= 30 else "Ages as recorded.",
                      "Regional sample: prefectures Grevena, Drama, Imathia, Thessaloniki, Kavala, Kastoria, Kilkis, Kozani, Pella, Pieria, Serres, Florina, Chalkidiki (north) and Lesvos (islands); not nationally representative. No weights (weight=1).",
                      "Survey embedded an experiment (T: treatment vs control priming parallels between Asia Minor refugees of 1922 and current refugees); outcome items may be affected for the treated half.",
                      "Question texts are reconstructed from English variable/value labels (paraphrased into question form), not verbatim Greek wording.",
                      "edu3 from edu: not finished primary/primary/middle (gymnasio) = low; high school = medium; TEI/university/master = high. No urban variable."]}
    return finish(root, did, demo, items, meta, excluded)


ADAPTERS = {"wellcome2020": h1_wellcome, "tisp": h2_tisp, "covidistress": h3_covidistress, "banksat": h4_banksat,
            "culture": h5_culture, "qog2024": h6_qog, "dinas": h7_dinas}


if __name__ == "__main__":
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--root", default=".")
    ap.add_argument("--only", choices=sorted(ADAPTERS), action="append", help="run only this dataset (repeatable)")
    a = ap.parse_args()
    root = os.path.abspath(a.root)
    for did in (a.only or list(ADAPTERS)):
        ADAPTERS[did](root)
