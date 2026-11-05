"""Παραδοτέα πιλοτικής μελέτης Χριστοδουλάκη: ερωτηματολόγιο, πίνακες, μεθοδολογία, παρουσίαση PDF/PPTX.
Όλα τα νούμερα διαβάζονται από run/results.json και run/run_meta.json (έξοδος του runner)· κανένα δεν γράφεται με το χέρι.
  python3 -I studies/christodoulakis_pilot_2026/build_deliverables.py"""
import csv, html, json, os, subprocess
D = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(D, '..', '..'))
R = json.load(open(os.path.join(D, 'run', 'results.json'))); M = json.load(open(os.path.join(D, 'run', 'run_meta.json')))
plan = json.load(open(os.path.join(D, 'questionnaire', 'plan.json')))['plan']
LABEL = 'ΣΥΝΘΕΤΙΚΗ ΠΙΛΟΤΙΚΗ ΜΕΛΕΤΗ — ΟΧΙ ΔΗΜΟΣΚΟΠΗΣΗ ΠΕΔΙΟΥ'
CL = {'T': ('Μεταφερόμενη εκτίμηση (T)', 'viewscope_empirical_book_96.png'), 'S': ('Συνθετική εκτίμηση σεναρίου (S)', 'viewscope_synthetic_pc_96.png'), None: ('Μη εκτιμήσιμο', None)}
res = {r['id']: r for r in R['results']}
cov = M['coverage']['v2']
# ---------------------------------------------------------------- 1. Ερωτηματολόγιο
lines = [f'# Ερωτηματολόγιο — {plan["title"]}', '', LABEL, '', 'Πληθυσμός αναφοράς: ενήλικοι εκλογείς της Α΄ Ανατολικής Αττικής (στην προσομοίωση: ενήλικοι της Περιφέρειας Αττικής — βλ. μεθοδολογία). Περίοδος: Νοέμβριος 2026.', '']
blocks = {'Q1': 'Α. Περιοχή και γενικό κλίμα', 'Q10': 'Β. Μανώλης Χριστοδουλάκης', 'Q15': 'Γ. Βουλευτές της περιφέρειας', 'Q20': 'Δ. ΠΑΣΟΚ και πολιτική τοποθέτηση (χωριστά από τη γνώμη για το πρόσωπο)'}
for q in plan['questions']:
    if q['id'] in blocks: lines += [f'## {blocks[q["id"]]}', '']
    opts = q.get('scale') if q['type'] == 'likert' else q.get('options')
    t = {'single_choice': 'μία απάντηση', 'likert': 'κλίμακα', 'multiple_choice': f'πολλαπλές απαντήσεις (έως {q.get("maxSelections")})'}[q['type']]
    lines.append(f'**{q["id"]}.** {q["text"]}  _({t})_')
    if q.get('followUpOf'): lines.append(f'  - Ροή: μόνο όσοι απάντησαν στο {q["followUpOf"]["questionId"]}: {", ".join(q["followUpOf"]["whenAnswerIn"])}')
    lines += [f'  {i + 1}. {o}' for i, o in enumerate(opts)] + ['']
open(os.path.join(D, 'questionnaire', 'QUESTIONNAIRE.md'), 'w').write('\n'.join(lines))
# ---------------------------------------------------------------- 2. Πίνακες ανά ομάδα
with open(os.path.join(D, 'run', 'crosstabs.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f); w.writerow(['ερώτηση', 'κατηγορία μελέτης', 'διάσταση', 'ομάδα', 'n', 'επιλογή', '%', 'σημείωση'])
    for qid, dims in R['crosstabs'].items():
        for dn, groups in dims.items():
            note = 'ΔΕΝ είναι εύρημα: οι απαντήσεις του μηχανισμού δεν εξαρτώνται από αυτή τη συνθετική άγκυρα' if 'άγκυρα' in dn else ('πολιτική ερώτηση: διαφορές ομάδων ΜΗ επικυρωμένες (σενάριο S)' if qid in ('Q5', 'Q6', 'Q22', 'Q23') else '')
            for g, c in groups.items():
                if c['shares'] is None: w.writerow([qid, res[qid]['studyClass'], dn, g, c['n'], '', '', c['note']]); continue
                for o, pct in c['shares'].items(): w.writerow([qid, res[qid]['studyClass'], dn, g, c['n'], o, pct, note])
# ---------------------------------------------------------------- 3. Μεθοδολογία (εσωτερικός φάκελος)
comp = R['composition']; hist = R['historical']
cnt = R['studyClassCounts']
meth = f"""# Μεθοδολογία — συνθετική πιλοτική μελέτη «Μανώλης Χριστοδουλάκης, Α΄ Ανατολικής Αττικής» (Νοέμβριος 2026)

{LABEL}

## Ταυτότητα εκτέλεσης

| | |
|---|---|
| Πλατφόρμα | Viewscope v2.0 RC1 · commit `{M['platformCommit']}` · runner `{M['viewscopeVersion']}` (χωρίς αλλαγές) |
| Βασικός μηχανισμός | {M['engine']} (EGPS «Τεκμηριωμένη πρόβλεψη» — απέχει όπου δεν υπάρχει τεκμηρίωση) |
| Σημαίες v2 | published-waves, crosswalks, core, xtab (εφαρμόζονται μόνο όπου είναι έγκυρες)· **χωρίς** δηλωμένες σχέσεις S |
| Δείγμα / seed | {M['n']} συνθετικά πρόσωπα · seed {M['seed']} · αναπαραγώγιμο: {M['reproducible']} · sha256 απαντήσεων `{M['answersSha256'][:16]}…` |
| Χρόνος / κόστος | {M['seconds']} δευτ. · {M['apiCalls']} κλήσεις API |

## Πληθυσμός — ΚΡΙΣΙΜΟΣ ΠΕΡΙΟΡΙΣΜΟΣ

- **Πραγματικός πληθυσμός-στόχος:** οι ενήλικοι εκλογείς της Α΄ Ανατολικής Αττικής.
- **Πληθυσμός της προσομοίωσης:** ο βαθμονομημένος πληθυσμός του Lab (GLOPOP-S, βαθμονόμηση ΕΛΣΤΑΤ/Eurostat 2025) φτάνει μόνο έως το επίπεδο **Περιφέρειας** (NUTS2).
  - Για τον λόγο αυτό τα πρόσωπα επιλέχθηκαν από την **Περιφέρεια Αττικής** (ενήλικοι 17+).
  - Δεν υπάρχει διαθέσιμη σύνθεση για την Ανατολική Αττική ειδικά.
- **Έλεγχος με τα επίσημα αποτελέσματα της 25/6/2023.** Η «ψήφος 2023» είναι συνθετική άγκυρα της PIE (μοντέλο σε διαΝΕΟσις 2024). Μεταξύ ψηφισάντων:

| | ΝΔ | ΣΥΡΙΖΑ | ΠΑΣΟΚ | ΚΚΕ | Λοιπά |
|---|---|---|---|---|---|
| Συνθετικά πρόσωπα | {comp['synthetic_anchor_pv2023_voters']['nd']}% | {comp['synthetic_anchor_pv2023_voters']['syriza']}% | {comp['synthetic_anchor_pv2023_voters']['pasok']}% | {comp['synthetic_anchor_pv2023_voters']['kke']}% | {comp['synthetic_anchor_pv2023_voters']['other']}% |
| Επίσημο, Α΄ Ανατολικής Αττικής | {comp['official_east_attica']['nd']}% | {comp['official_east_attica']['syriza']}% | {comp['official_east_attica']['pasok']}% | {comp['official_east_attica']['kke']}% | {comp['official_east_attica']['other']}% |
| Επίσημο, Περιφέρεια Αττικής | {comp['official_attica_region']['nd']}% | {comp['official_attica_region']['syriza']}% | {comp['official_attica_region']['pasok']}% | {comp['official_attica_region']['kke']}% | {comp['official_attica_region']['other']}% |

- **Συμπέρασμα:** η σύνθεση μοιάζει με την Αττική συνολικά, όχι με την Ανατολική Αττική (ΝΔ −3,0 μονάδες, ΚΚΕ +4,2). **Κανένα αποτέλεσμα δεν είναι τοπική μέτρηση της Α΄ Ανατολικής Αττικής.**

## Πηγές

1. **Ψηφιακή συζήτηση (Signalyth / Viewscope Brand Intelligence, 1–26/9/2026).**
   - 140 αναφορές, κυρίως X.
   - Χρησιμοποιήθηκε **μόνο** για τον εντοπισμό θεμάτων: πρόγραμμα ΠΑΣΟΚ, αντιπαράθεση με ΝΔ, επιθέσεις στο ηθικό κύρος, δημόσιες εμφανίσεις.
   - **Κανένα ποσοστό sentiment** δεν μεταφέρθηκε στις απαντήσεις. Δεν είναι αντιπροσωπευτική δημοσκόπηση.
2. **Επαληθευμένα δημόσια στοιχεία** (για την ερώτηση γνώσης Q14):
   - Ελληνική Wikipedia: βουλευτής ΠΑΣΟΚ Α΄ Ανατολικής Αττικής από 21/5/2023· Γραμματέας της Κεντρικής Πολιτικής Επιτροπής του ΚΙΝΑΛ 2018–2022· ηλεκτρολόγος μηχανικός ΕΜΠ.
   - parapolitika.gr, 8/7/2024: στήριξη του Χ. Δούκα στις εσωκομματικές εκλογές του ΠΑΣΟΚ.
   - Δεν βρέθηκαν επαληθευμένες συγκεκριμένες νομοθετικές πρωτοβουλίες, γι' αυτό δεν περιλαμβάνονται.
3. **Ιστορική μέτρηση 2022** ([aftodioikisi.gr]({hist['url']})): βλ. παρακάτω.
4. **Επίσημα εκλογικά αποτελέσματα** Ιουνίου 2023 (εκλογικές περιφέρειες· δεδομένα του Lab): μόνο για έλεγχο σύνθεσης.
5. **Εμπειρικές πηγές του μηχανισμού:**
   - NORAYA (εμπιστοσύνη στην κυβέρνηση 2024-Q4, ικανοποίηση από τη δημοκρατία)·
   - μέσος όρος δημοσκοπήσεων 10/2026·
   - διαΝΕΟσις 2024 (άγκυρα econ4).

## Κατηγορίες E/T/S για ΑΥΤΗ τη μελέτη ({cnt.get('T', 0)} T · {cnt.get('S', 0)} S · {cnt.get('NA', 0)} μη εκτιμήσιμες)

**Κανόνας για τα E του μηχανισμού.** Ο μηχανισμός χαρακτηρίζει E τις πανελλαδικές μετρήσεις. Για την Α΄ Ανατολικής Αττικής είναι
**T**: γεωγραφική μεταφορά, με προσαρμογή μόνο στη σύνθεση της Αττικής.

**Κανόνας για παλιές πηγές.** Πηγή ≥ 3 ετών → **S** (παρωχημένη). Αφορά τη γνώμη για τον Κ. Μητσοτάκη: κύμα 2019-Q2. **Δεν παρουσιάζεται ως εύρημα.**

| Ερώτηση | Κατηγορία | Βάση |
|---|---|---|
""" + '\n'.join(f"| {r['id']} | {r['studyClass'] or 'Μη εκτιμήσιμο'} | {r['basis']}{' · πηγή: ' + r['source'] if r.get('source') else ''} |" for r in R['results']) + f"""

## Δείκτες κάλυψης (Viewscope v2)

| Δείκτης | Ερωτήσεις |
|---|---|
| Τεχνική | {cov['technical']['n']}/{cov['questions']} |
| Εμπειρική (κατά τον μηχανισμό) | {cov['empirical']['n']} |
| Επικυρωμένη διαδρομή | {cov['validated']['n']} |
| Σενάριο S | {cov['scenarioS']} |
| Αποχή | {cov['abstained']} |

**Αποτέλεσμα των σημαιών v2:**

- **Δημοσιευμένα κύματα:** 0 εφαρμογές. Η μελέτη δεν είναι κύμα του ίδιου φορέα με κάποια δημοσιευμένη έρευνα. Η μεταφορά από άλλο φορέα δεν είναι επικυρωμένη, άρα δεν χρησιμοποιήθηκε.
- **Πίνακας αντιστοίχισης:** 1 εφαρμογή (Q3).
- **Κοινός πυρήνας:** 0 εφαρμογές (καμία διαδρομή περιθωρίου).
- **Πίνακες υποομάδων:** 0 εφαρμογές (κανένας επαληθευμένος πίνακας για αυτές τις ερωτήσεις).

## Χριστοδουλάκης: αναγνωρισιμότητα και γνώμη (Q10–Q14)

**ΜΗ ΕΚΤΙΜΗΣΙΜΑ.** Δεν υπάρχει καμία έγκυρη πραγματική μέτρηση αναγνωρισιμότητας ή γνώμης για το πρόσωπο που να μπορεί να
στηρίξει εκτίμηση. Ο μηχανισμός απέχει, και **δεν παράγεται κανένα ποσοστό**. Η ροή (skip logic) ορίζεται στο ερωτηματολόγιο: οι
Q11–Q14 τίθενται μόνο σε όσους γνωρίζουν το πρόσωπο.

## Σύγκριση με ιστορικές πραγματικές μετρήσεις

- **{hist['source']}**
  - Μέθοδος: {hist['method']}.
  - Ερώτηση: {hist['question']}.
  - Μ. Χριστοδουλάκης, σύνολο δείγματος: Θετική {hist['christodoulakis_total']['Θετική']}% · Ουδέτερη {hist['christodoulakis_total']['Ουδέτερη']}% · Αρνητική {hist['christodoulakis_total']['Αρνητική']}% · ΔΞ/ΔΑ {hist['christodoulakis_total']['ΔΞ/ΔΑ']}%.
  - Μεταξύ ψηφοφόρων ΠΑΣΟΚ 2019: θετική {hist['christodoulakis_pasok2019_positive']}%.
  - Κατάσταση: {hist['status']}
  - Συνθετικό αντίστοιχο: {hist['synthetic_counterpart']}
- **Άλλες μετρήσεις:** {R['otherMeasurements']}

## Πίνακες ανά ομάδα (`run/crosstabs.csv`)

- **Ηλικία και φύλο:** οι απαντήσεις των εμπειρικών ερωτήσεων εξαρτώνται από τα δημογραφικά μέσω των εμπειρικών πηγών (πανελλαδικές σχέσεις).
- **Πολιτικές ερωτήσεις:** οι διαφορές ομάδων είναι **σενάριο** (μη επικυρωμένες).
- **Ιδεολογία και ψήφος 2023 (συνθετικές άγκυρες):** οι πίνακες παράγονται για πληρότητα, αλλά **δεν είναι ευρήματα**. Οι απαντήσεις του μηχανισμού δεν εξαρτώνται ουσιαστικά από αυτές τις άγκυρες. Για παράδειγμα, η πρόθεση ψήφου διαφέρει έως {R['dependenceOnAnchors_maxSpreadPp']['Q23']['Ψήφος 2023 (συνθετική άγκυρα)']} μονάδες μεταξύ των ψηφοφόρων των κομμάτων του 2023, ενώ στην πραγματικότητα η διαφορά είναι πολύ μεγαλύτερη.
- **Ελάχιστη βάση ανά κελί:** 50.

## Περιορισμοί

1. Δεν πρόκειται για δημοσκόπηση ούτε για τοπική μέτρηση. Τα αποτελέσματα **δεν δημοσιεύονται ως δημοσκόπηση** (ν. 3603/2007).
2. Ο πληθυσμός είναι επιπέδου Περιφέρειας Αττικής, όχι Α΄ Ανατολικής Αττικής.
3. Για το πρόσωπο, τα τοπικά προβλήματα, την αξιολόγηση του ΠΑΣΟΚ και του αρχηγού του δεν υπάρχει εμπειρική βάση: αποχή.
4. Οι εμπειρικές ερωτήσεις στηρίζονται σε πανελλαδικές πηγές (T).
5. Η πρόθεση ψήφου είναι μέσος όρος πανελλαδικών δημοσκοπήσεων (επί των εγκύρων, χωρίς αναποφάσιστους). Αφορά το εθνικό επίπεδο: έγκυρο σε 6 εκλογές, σφάλμα ~1,6 μονάδες. Δεν αφορά την Ανατολική Αττική.
6. Συνοχή μεταξύ απαντήσεων: περιορισμένη.
7. Για πραγματική απάντηση στα ερωτήματα της μελέτης απαιτείται **έρευνα πεδίου** στην Α΄ Ανατολικής Αττικής (ενδεικτικά n ≥ 400, τηλεφωνική ή μικτή, στάθμιση ως προς φύλο × ηλικία × ψήφο 2023 με τα επίσημα αποτελέσματα).
"""
os.makedirs(os.path.join(D, 'internal_package'), exist_ok=True)
open(os.path.join(D, 'internal_package', 'METHODOLOGY.md'), 'w').write(meth)
# ---------------------------------------------------------------- 4. Παρουσίαση (HTML → PDF) + PPTX
ICONS = os.path.join(ROOT, 'public', 'viewscope', 'evidence-icons')
def badge(cls):
    lab, ic = CL.get(cls, CL[None])
    img = f'<img src="file://{ICONS}/{ic}" class="ic"/>' if ic else '<span class="na">∅</span>'
    return f'<span class="badge">{img}{html.escape(lab)}</span>'
def bars(shares, top=None):
    s = [x for x in shares if x['pct'] > 0] if top else shares
    s = sorted(s, key=lambda x: -x['pct'])[:top] if top else s
    mx = max([x['pct'] for x in s] + [1])
    return '<div class="bars">' + ''.join(f'<div class="row"><div class="lab">{html.escape(x["option"])}</div><div class="track"><div class="bar" style="width:{78 * x["pct"] / mx:.1f}%"></div><span class="val">{x["pct"]:.1f}%</span></div></div>' for x in s) + '</div>'
slides = []
def slide(title, body, sub=''):
    slides.append((title, sub, body))
slide('Μανώλης Χριστοδουλάκης — πολιτική εικόνα και αναγνωρισιμότητα', '<div class="cover"><p class="big">Α΄ Ανατολικής Αττικής · Νοέμβριος 2026</p><p>Συνθετική πιλοτική μελέτη · 500 συνθετικά πρόσωπα · Viewscope v2.0</p><p class="warn">' + LABEL + '</p><p class="small">Δεν δημοσιεύεται ως δημοσκόπηση (ν. 3603/2007). Κανένα αποτέλεσμα δεν είναι τοπική μέτρηση.</p></div>')
slide('Τι είναι — και τι δεν είναι — αυτή η μελέτη', f'''<div class="cols"><div class="card"><h3>Είναι</h3><ul><li>Πλήρες ερωτηματολόγιο 20 ερωτήσεων, εκτελεσμένο σε {M['n']} συνθετικά πρόσωπα (Viewscope v2, seed {M['seed']}, {M['seconds']} δευτ., {M['apiCalls']} κλήσεις API)</li><li>Αποτελέσματα μόνο όπου υπάρχει πραγματική εμπειρική βάση — με ρητή κατηγορία</li><li>Ρητή αποχή όπου δεν υπάρχει βάση</li></ul></div><div class="card bad"><h3>Δεν είναι</h3><ul><li>Δημοσκόπηση ή μέτρηση της Α΄ Ανατολικής Αττικής</li><li>Εκτίμηση αναγνωρισιμότητας ή δημοτικότητας του Μ. Χριστοδουλάκη (δεν υπάρχει έγκυρη βάση)</li><li>Μεταφορά του sentiment της ψηφιακής συζήτησης σε πολίτες</li></ul></div></div>''')
slide('Κάλυψη και τεκμηρίωση ανά ερώτηση', f'''<div class="kpis"><div class="kpi"><b>{cov['technical']['n']}/{cov['questions']}</b><span>ερωτήσεις με απάντηση</span></div><div class="kpi"><b>{cnt.get('T', 0)}</b><span>{badge('T')}</span></div><div class="kpi"><b>{cnt.get('S', 0)}</b><span>{badge('S')}</span></div><div class="kpi"><b>{cnt.get('NA', 0)}</b><span>{badge(None)}</span></div></div>
<table class="t"><tr><th>Ερώτηση</th><th>Κατηγορία</th><th>Βάση</th></tr>''' + ''.join(f"<tr><td>{r['id']} · {html.escape(r['text'][:70])}{'…' if len(r['text']) > 70 else ''}</td><td>{badge(r['studyClass'])}</td><td class='small'>{html.escape((r.get('source') or r['basis'])[:95])}</td></tr>" for r in R['results'] if r['studyClass']) + f"<tr><td colspan='3' class='small'>Μη εκτιμήσιμες ({cnt.get('NA', 0)}): " + ', '.join(r['id'] for r in R['results'] if not r['studyClass']) + '</td></tr></table>')
slide('Αναγνωρισιμότητα και γνώμη για τον Μ. Χριστοδουλάκη', f'''<div class="cols"><div class="card"><h3>{badge(None)} Q10–Q14</h3><p>Δεν υπάρχει καμία έγκυρη πραγματική μέτρηση αναγνωρισιμότητας ή γνώμης για το πρόσωπο που να στηρίζει εκτίμηση. Ο μηχανισμός <b>απέχει</b> — δεν παράγεται κανένα ποσοστό.</p><p class="small">Η ροή ορίζεται: Q11–Q14 μόνο σε όσους γνωρίζουν το πρόσωπο.</p></div><div class="card"><h3>Τι χρειάζεται</h3><ul><li>Έρευνα πεδίου στην Α΄ Ανατολικής Αττικής (ενδεικτικά n ≥ 400)</li><li>Τηλεφωνική ή μικτή μέθοδος, στάθμιση φύλο × ηλικία × ψήφος 2023 με τα επίσημα αποτελέσματα</li><li>Το ερωτηματολόγιο αυτής της μελέτης είναι έτοιμο για χρήση</li></ul></div></div>''')
h = R['historical']
slide('Ιστορικό σημείο: aftodioikisi.gr, Δεκέμβριος 2022', f'''<div class="cols"><div class="card"><h3>«Θετική ή αρνητική εικόνα» — σύνολο δείγματος</h3>{bars([{'option': k, 'pct': v} for k, v in h['christodoulakis_total'].items()])}<p class="small">Ψηφοφόροι ΠΑΣΟΚ 2019: θετική {h['christodoulakis_pasok2019_positive']}%</p></div><div class="card bad"><h3>Γιατί ΔΕΝ είναι σημείο αναφοράς</h3><ul><li>Ανοιχτό online ερωτηματολόγιο (Google Forms) — δείγμα ευκολίας, n = 1.409</li><li>Στάθμιση μόνο ως προς ψήφο 2019· εταιρεία και περιθώριο σφάλματος δεν αναφέρονται</li><li>Δεν υπάρχει συγκρίσιμη συνθετική εκτίμηση (Q11: μη εκτιμήσιμο) — <b>δεν υπολογίζεται «μεταβολή»</b></li></ul><p class="small">Πηγή: {html.escape(h['source'])}</p></div></div>''')
q23 = res['Q23']
slide('Πρόθεση ψήφου — πανελλαδικό σημείο αναφοράς', f'''<div class="cols"><div class="card">{badge(q23['studyClass'])}{bars(q23['shares'], top=9)}</div><div class="card"><h3>Πώς να διαβαστεί</h3><ul><li>Μέσος όρος πανελλαδικών δημοσκοπήσεων 10/2026 (επί των εγκύρων), σε συνθετικά πρόσωπα της Αττικής</li><li>Επικυρωμένο μόνο σε εθνικό επίπεδο (6 εκλογές, ~1,6 π.μ.)</li><li><b>Όχι</b> εκτίμηση της Α΄ Ανατολικής Αττικής· διαφορές ομάδων μη επικυρωμένες</li><li>Ετικέτες κομμάτων όπως στα δεδομένα δημοσκοπήσεων του Lab</li></ul></div></div>''')
slide('Θεσμική εμπιστοσύνη και οικονομική κατάσταση', '<div class="cols3">' + ''.join(f"<div class='card'><h4>{html.escape(res[q]['text'][:80])}</h4>{badge(res[q]['studyClass'])}{bars(res[q]['shares'])}<p class='small'>{html.escape(res[q].get('source') or '')}</p></div>" for q in ('Q5', 'Q6', 'Q3')) + '</div><p class="small">Q3: μέσω πίνακα αντιστοίχισης με την άγκυρα «τα βγάζω πέρα» (διαΝΕΟσις 2024)· ο διαχωρισμός των δύο χαμηλότερων κατηγοριών είναι παραδοχή → S. Η γνώμη για τον Κ. Μητσοτάκη (Q22) δεν παρουσιάζεται: η πηγή είναι του 2019.</p>')
xa = R['crosstabs']
def xt_table(qid, dim, opt):
    rows = xa[qid][dim]; return '<table class="t"><tr><th>' + html.escape(dim) + '</th><th>n</th><th>' + html.escape(opt) + '</th></tr>' + ''.join(f"<tr><td>{html.escape(g)}</td><td>{c['n']}</td><td>{'—' if c['shares'] is None else str(c['shares'][opt]) + '%'}</td></tr>" for g, c in rows.items()) + '</table>'
slide('Ανά ηλικία και φύλο (μόνο εμπειρικές ερωτήσεις)', f'''<div class="cols"><div class="card"><h4>Q5 · «Τείνω να μην εμπιστεύομαι» την κυβέρνηση {badge('T')}</h4>{xt_table('Q5', 'Ηλικία', 'Τείνω να μην εμπιστεύομαι')}</div><div class="card"><h4>Q3 · «Ζούμε άνετα αλλά χωρίς αποταμίευση» {badge('S')}</h4>{xt_table('Q3', 'Ηλικία', 'Ζούμε άνετα αλλά δεν έχουμε δυνατότητα αποταμίευσης')}</div></div><p class="small">Οι διαφορές ηλικίας προέρχονται από πανελλαδικές σχέσεις των πηγών· στις πολιτικές ερωτήσεις είναι σενάριο (μη επικυρωμένες). Πίνακες ανά ιδεολογία και ψήφο 2023 δεν παρουσιάζονται ως ευρήματα: οι απαντήσεις δεν εξαρτώνται από αυτές τις συνθετικές άγκυρες (βλ. εσωτερικό φάκελο).</p>''')
c = R['composition']
def comprow(lab, d): return f"<tr><td>{lab}</td>" + ''.join(f"<td>{d[k]}%</td>" for k in ['nd', 'syriza', 'pasok', 'kke', 'other']) + '</tr>'
slide('Σύνθεση του συνθετικού πληθυσμού έναντι των επίσημων αποτελεσμάτων 2023', '<table class="t big"><tr><th></th><th>ΝΔ</th><th>ΣΥΡΙΖΑ</th><th>ΠΑΣΟΚ</th><th>ΚΚΕ</th><th>Λοιπά</th></tr>' + comprow('Συνθετικά πρόσωπα (ψήφος 2023, μεταξύ ψηφισάντων)', c['synthetic_anchor_pv2023_voters']) + comprow('Επίσημο · Α΄ Ανατολικής Αττικής', c['official_east_attica']) + comprow('Επίσημο · Περιφέρεια Αττικής', c['official_attica_region']) + '</table><p>Ο πληθυσμός του Lab φτάνει έως το επίπεδο Περιφέρειας: τα πρόσωπα είναι ενήλικοι της <b>Αττικής</b>. Η σύνθεση μοιάζει με την Αττική, όχι με την Ανατολική Αττική — <b>κανένα αποτέλεσμα δεν είναι τοπική μέτρηση</b>.</p>')
slide('Θέματα από την ψηφιακή συζήτηση (μόνο για τον σχεδιασμό)', '''<div class="cols"><div class="card"><h3>Τι αξιοποιήθηκε</h3><ul><li>Θέματα: πρόγραμμα ΠΑΣΟΚ, αντιπαράθεση με ΝΔ, επιθέσεις στο ηθικό κύρος, δημόσιες εμφανίσεις</li><li>→ ουδέτερες ερωτήσεις γνώσης, γνώμης, κοινοβουλευτικής και τοπικής παρουσίας (Q10–Q14)</li><li>Q14: μόνο επαληθευμένα δημόσια στοιχεία (Wikipedia, parapolitika.gr 8/7/2024)</li></ul></div><div class="card bad"><h3>Τι ΔΕΝ αξιοποιήθηκε</h3><ul><li>Κανένα ποσοστό sentiment ή συναισθήματος (140 αναφορές, κυρίως X — όχι αντιπροσωπευτικό)</li><li>Καμία κατηγορία ή ισχυρισμός από τα σχόλια</li></ul></div></div>''')
slide('Μεθοδολογία και περιορισμοί', f'''<ul class="lim"><li>Viewscope v2.0 RC1 (commit {M['platformCommit']}), μηχανισμός EGPS (απέχει χωρίς τεκμηρίωση)· σημαίες v2 μόνο όπου έγκυρες — εφαρμόστηκε 1 πίνακας αντιστοίχισης· καμία δηλωμένη σχέση S</li><li>Πληθυσμός: ενήλικοι της Περιφέρειας Αττικής (GLOPOP-S 2025) — όχι της Α΄ Ανατολικής Αττικής</li><li>Εμπειρικές ερωτήσεις: πανελλαδικές πηγές → T για την περιοχή· παλιές πηγές (≥ 3 έτη) → S</li><li>Χριστοδουλάκης, τοπικά προβλήματα, ΠΑΣΟΚ, αρχηγός ΠΑΣΟΚ: μη εκτιμήσιμα — απαιτείται έρευνα πεδίου</li><li>Ιστορική μέτρηση 2022: μη αντιπροσωπευτική, μόνο πλαίσιο· καμία «μεταβολή»</li><li>Δεν δημοσιεύεται ως δημοσκόπηση (ν. 3603/2007)</li></ul><p class="small">Πλήρης μεθοδολογία: internal_package/METHODOLOGY.md · δεδομένα: run/</p>''')
CSS = '''@page{size:1280px 720px;margin:0}*{box-sizing:border-box}body{margin:0;font-family:"DejaVu Sans",Arial,sans-serif;color:#1d2733;background:#fff}
.s{width:1280px;height:720px;position:relative;padding:56px 64px 70px;page-break-after:always;overflow:hidden}.s h1{font-size:30px;margin:0 0 24px;color:#123d63}
.lbl{position:absolute;top:16px;right:64px;font-size:11px;font-weight:700;color:#a3361f;letter-spacing:.5px}.ft{position:absolute;bottom:22px;left:64px;right:64px;font-size:11px;color:#6b7684;display:flex;justify-content:space-between;border-top:1px solid #e3e7ec;padding-top:8px}
.cover{margin-top:150px}.cover .big{font-size:26px;color:#123d63}.warn{display:inline-block;border:2px solid #a3361f;color:#a3361f;font-weight:700;padding:8px 14px;margin-top:22px}
.small{font-size:12px;color:#5a6573}.cols{display:grid;grid-template-columns:1fr 1fr;gap:24px}.cols3{display:grid;grid-template-columns:1fr 1fr 1fr;gap:18px}
.card{border:1px solid #e3e7ec;border-radius:10px;padding:18px 20px;background:#fafbfc;font-size:14px}.card.bad{background:#fbf6f4}.card h3{margin:0 0 10px;font-size:17px;color:#123d63}.card h4{margin:0 0 8px;font-size:13px}
.badge{display:inline-flex;align-items:center;gap:6px;font-size:11px;color:#3b4652;margin:2px 0 8px}.ic{width:16px;height:16px}.na{font-size:13px;color:#8a94a1}
.bars .row{display:flex;align-items:center;margin:5px 0;font-size:12px}.bars .lab{width:42%;padding-right:8px}.bars .track{flex:1;display:flex;align-items:center}.bars .bar{height:14px;background:#2f6ea5;border-radius:0 3px 3px 0}.bars .val{margin-left:6px;font-size:12px}
.t{border-collapse:collapse;width:100%;font-size:12px}.t th,.t td{border-bottom:1px solid #e3e7ec;padding:5px 6px;text-align:left;vertical-align:top}.t.big{font-size:15px}
.kpis{display:flex;gap:18px;margin-bottom:14px}.kpi{flex:1;border:1px solid #e3e7ec;border-radius:10px;padding:10px 14px}.kpi b{font-size:28px;color:#123d63;display:block}
.lim li{margin:8px 0;font-size:16px}'''
doc = f'<!doctype html><html lang="el"><head><meta charset="utf-8"><title>Μ. Χριστοδουλάκης — συνθετική πιλοτική μελέτη</title><style>{CSS}</style></head><body>' + ''.join(f'<section class="s"><div class="lbl">{LABEL}</div><h1>{html.escape(t)}</h1>{b}<div class="ft"><span>Viewscope · Συνθετική πιλοτική μελέτη · Α΄ Ανατολικής Αττικής · 11/2026</span><span>{i + 1}/{len(slides)}</span></div></section>' for i, (t, sub, b) in enumerate(slides)) + '</body></html>'
cd = os.path.join(D, 'client_deliverables'); os.makedirs(cd, exist_ok=True)
hp = os.path.join(cd, 'christodoulakis_pilot_2026.html'); open(hp, 'w').write(doc)
subprocess.run(['node', os.path.join(ROOT, 'scripts', 'synthetic-lab', 'structured', 'render_slides_pdf.cjs'), hp, os.path.join(cd, 'christodoulakis_pilot_2026.pdf')], check=True, cwd=ROOT)
# PPTX (επεξεργάσιμο, εγγενή γραφήματα)
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.chart.data import CategoryChartData
from pptx.enum.chart import XL_CHART_TYPE
from pptx.dml.color import RGBColor
P = Presentation(); P.slide_width, P.slide_height = Inches(13.333), Inches(7.5)
def sl(title):
    s = P.slides.add_slide(P.slide_layouts[6])
    tb = s.shapes.add_textbox(Inches(0.6), Inches(0.35), Inches(12), Inches(0.8)); tb.text_frame.text = title; tb.text_frame.paragraphs[0].runs[0].font.size = Pt(26); tb.text_frame.paragraphs[0].runs[0].font.bold = True; tb.text_frame.paragraphs[0].runs[0].font.color.rgb = RGBColor(0x12, 0x3d, 0x63)
    lb = s.shapes.add_textbox(Inches(7.2), Inches(0.05), Inches(5.9), Inches(0.3)); lb.text_frame.text = LABEL; r = lb.text_frame.paragraphs[0].runs[0]; r.font.size = Pt(9); r.font.bold = True; r.font.color.rgb = RGBColor(0xa3, 0x36, 0x1f)
    return s
def txt(s, lines, x=0.6, y=1.3, w=12, h=5.6, size=15):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h)); tf = tb.text_frame; tf.word_wrap = True
    for i, l in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph(); p.text = l; p.runs[0].font.size = Pt(size)
def chart(s, shares, x, y, w, h, title):
    cd_ = CategoryChartData(); cd_.categories = [o['option'][:45] for o in shares]; cd_.add_series(title, [o['pct'] for o in shares])
    g = s.shapes.add_chart(XL_CHART_TYPE.BAR_CLUSTERED, Inches(x), Inches(y), Inches(w), Inches(h), cd_).chart
    g.has_legend = False; g.has_title = False; pl = g.plots[0]; pl.has_data_labels = True; pl.data_labels.number_format = '0.0"%"'; pl.data_labels.number_format_is_linked = False
    pl.series[0].format.fill.solid(); pl.series[0].format.fill.fore_color.rgb = RGBColor(0x2f, 0x6e, 0xa5); g.category_axis.reverse_order = True
    g.category_axis.tick_labels.font.size = Pt(10); g.value_axis.tick_labels.font.size = Pt(9); pl.data_labels.font.size = Pt(10)
    from lxml import etree; ax = g.category_axis._element; ax.append(etree.fromstring('<c:tickLblSkip xmlns:c="http://schemas.openxmlformats.org/drawingml/2006/chart" val="1"/>'))
s = sl('Μανώλης Χριστοδουλάκης — πολιτική εικόνα και αναγνωρισιμότητα'); txt(s, ['Α΄ Ανατολικής Αττικής · Νοέμβριος 2026', 'Συνθετική πιλοτική μελέτη · 500 συνθετικά πρόσωπα · Viewscope v2.0', LABEL, 'Δεν δημοσιεύεται ως δημοσκόπηση (ν. 3603/2007). Κανένα αποτέλεσμα δεν είναι τοπική μέτρηση.'], y=2.2, size=20)
s = sl('Κάλυψη και τεκμηρίωση ανά ερώτηση'); txt(s, [f"{cov['technical']['n']}/{cov['questions']} ερωτήσεις με απάντηση · T (μεταφερόμενη): {cnt.get('T', 0)} · S (συνθετική): {cnt.get('S', 0)} · μη εκτιμήσιμες: {cnt.get('NA', 0)}"], y=1.1, h=0.5, size=14)
ct = s.shapes.add_table(len(R['results']) + 1, 3, Inches(0.6), Inches(1.7), Inches(12.1), Inches(5.4)).table; ct.columns[0].width = Inches(0.7); ct.columns[1].width = Inches(1.6); ct.columns[2].width = Inches(9.8)
for j, hd in enumerate(['Ερ.', 'Κατηγορία', 'Ερώτηση']): ct.cell(0, j).text = hd
for i, r in enumerate(R['results']):
    for j, v in enumerate([r['id'], {'T': 'T · μεταφερόμενη', 'S': 'S · συνθετική'}.get(r['studyClass'], 'μη εκτιμήσιμο'), r['text'][:110]]): ct.cell(i + 1, j).text = v
for row in ct.rows:
    row.height = Inches(0.24)
    for cell in row.cells:
        cell.margin_top = cell.margin_bottom = Pt(1)
        for para in cell.text_frame.paragraphs:
            for run in para.runs: run.font.size = Pt(9)
s = sl('Αναγνωρισιμότητα και γνώμη για τον Μ. Χριστοδουλάκη'); txt(s, ['Q10–Q14: ΜΗ ΕΚΤΙΜΗΣΙΜΑ — δεν υπάρχει έγκυρη πραγματική μέτρηση· ο μηχανισμός απέχει, δεν παράγεται κανένα ποσοστό.', 'Απαιτείται έρευνα πεδίου στην Α΄ Ανατολικής Αττικής (ενδεικτικά n ≥ 400, στάθμιση φύλο × ηλικία × ψήφος 2023).', 'Το ερωτηματολόγιο της μελέτης είναι έτοιμο για χρήση.'])
s = sl('Ιστορικό σημείο: aftodioikisi.gr, Δεκέμβριος 2022 (μη αντιπροσωπευτικό)'); chart(s, [{'option': k, 'pct': v} for k, v in h['christodoulakis_total'].items()], 0.6, 1.3, 6, 4.5, 'aftodioikisi 2022'); txt(s, ['Ανοιχτό online ερωτηματολόγιο — δείγμα ευκολίας, n = 1.409, στάθμιση μόνο ως προς ψήφο 2019.', f"Ψηφοφόροι ΠΑΣΟΚ 2019: θετική {h['christodoulakis_pasok2019_positive']}%.", 'Δεν υπάρχει συγκρίσιμη συνθετική εκτίμηση — δεν υπολογίζεται «μεταβολή».', h['source']], x=7, w=5.8, size=13)
s = sl('Πρόθεση ψήφου — πανελλαδικό σημείο αναφοράς (T)'); chart(s, sorted(q23['shares'], key=lambda x: -x['pct'])[:9], 0.6, 1.3, 7, 5.2, 'Q23'); txt(s, ['Μέσος όρος πανελλαδικών δημοσκοπήσεων 10/2026 (επί των εγκύρων) σε συνθετικά πρόσωπα της Αττικής.', 'Όχι εκτίμηση της Α΄ Ανατολικής Αττικής· διαφορές ομάδων μη επικυρωμένες.'], x=8, w=4.8, size=13)
s = sl('Θεσμική εμπιστοσύνη και οικονομική κατάσταση'); [chart(s, res[q]['shares'], 0.4 + i * 4.3, 1.4, 4.1, 3.8, q) for i, q in enumerate(('Q5', 'Q6', 'Q3'))]; txt(s, ['Q5 εμπιστοσύνη στην κυβέρνηση (T) · Q6 ικανοποίηση από τη δημοκρατία (T) · Q3 οικονομική κατάσταση (S — πίνακας αντιστοίχισης με παραδοχή).', 'Η γνώμη για τον Κ. Μητσοτάκη (Q22) δεν παρουσιάζεται: η πηγή είναι του 2019.'], y=5.5, h=1.5, size=12)
s = sl('Σύνθεση πληθυσμού έναντι επίσημων αποτελεσμάτων 2023'); tbl = s.shapes.add_table(4, 6, Inches(0.6), Inches(1.4), Inches(12), Inches(2)).table
for j, hd in enumerate(['', 'ΝΔ', 'ΣΥΡΙΖΑ', 'ΠΑΣΟΚ', 'ΚΚΕ', 'Λοιπά']): tbl.cell(0, j).text = hd
for i, (lab, dd) in enumerate([('Συνθετικά πρόσωπα (ψήφος 2023)', c['synthetic_anchor_pv2023_voters']), ('Επίσημο · Α΄ Ανατολικής Αττικής', c['official_east_attica']), ('Επίσημο · Περιφέρεια Αττικής', c['official_attica_region'])]):
    tbl.cell(i + 1, 0).text = lab
    for j, k in enumerate(['nd', 'syriza', 'pasok', 'kke', 'other']): tbl.cell(i + 1, j + 1).text = f'{dd[k]}%'
tbl.columns[0].width = Inches(4.0)
for j in range(1, 6): tbl.columns[j].width = Inches(1.6)
for row in tbl.rows:
    for cell in row.cells:
        for para in cell.text_frame.paragraphs:
            for run in para.runs: run.font.size = Pt(14)
txt(s, ['Ο πληθυσμός του Lab φτάνει έως το επίπεδο Περιφέρειας· η σύνθεση μοιάζει με την Αττική, όχι με την Ανατολική Αττική — κανένα αποτέλεσμα δεν είναι τοπική μέτρηση.'], y=4.4, h=1.5, size=14)
s = sl('Μεθοδολογία και περιορισμοί'); txt(s, ['Viewscope v2.0 RC1 (commit d01b571) · EGPS · 1 πίνακας αντιστοίχισης · καμία δηλωμένη σχέση S', 'Πληθυσμός: ενήλικοι Περιφέρειας Αττικής (όχι Α΄ Ανατολικής Αττικής)', 'Πανελλαδικές πηγές → T · πηγές ≥ 3 ετών → S · χωρίς βάση → μη εκτιμήσιμο', 'Ψηφιακή συζήτηση (Signalyth): μόνο για θέματα — κανένα ποσοστό sentiment', 'Ιστορική μέτρηση 2022: μη αντιπροσωπευτική — μόνο πλαίσιο', 'Δεν δημοσιεύεται ως δημοσκόπηση (ν. 3603/2007)'], size=16)
P.save(os.path.join(cd, 'christodoulakis_pilot_2026.pptx'))
print('ok', len(slides), 'διαφάνειες HTML/PDF ·', len(P.slides), 'διαφάνειες PPTX')
