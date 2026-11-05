"""Ανάλυση της πιλοτικής μελέτης Χριστοδουλάκη: αποτελέσματα ανά ερώτηση (E/T/S για τη ΣΥΓΚΕΚΡΙΜΕΝΗ μελέτη), πίνακες ανά ομάδα,
έλεγχος σύνθεσης έναντι των επίσημων αποτελεσμάτων Ιουνίου 2023 της Ανατολικής Αττικής, ιστορική σύγκριση. Μόνο ανάγνωση της εξόδου.
  python3 -I studies/christodoulakis_pilot_2026/analyze.py"""
import csv, json, os, collections
D = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(D, '..', '..'))
plan = json.load(open(os.path.join(D, 'questionnaire', 'plan.json')))['plan']
run = json.load(open(os.path.join(D, 'run', 'viewscope_run.json')))
rows = list(csv.DictReader(open(os.path.join(D, 'run', 'respondents_500.csv'), encoding='utf-8-sig')))
Q = {q['id']: q for q in plan['questions']}
routes = {r['questionId']: r for r in run['routes']}
NA = lambda v: v.startswith('NA') or v in ('', 'εκτός ροής')
# Κατηγορία ΓΙΑ ΤΗ ΜΕΛΕΤΗ: τα E του μηχανισμού στηρίζονται σε πανελλαδικά/περιφερειακά δεδομένα → για την Α΄ Αν. Αττικής = T (γεωγραφική μεταφορά)
def study_class(r):
    if not r['answerable']: return None, 'Μη εκτιμήσιμο — καμία κατάλληλη εμπειρική βάση (αποχή του μηχανισμού)'
    if r['route'] == 'crosswalk_anchor': return 'S', 'Πίνακας αντιστοίχισης προς την άγκυρα «τα βγάζω πέρα» (διαΝΕΟσις 2024, πανελλαδικό)· ο διαχωρισμός των δύο χαμηλότερων κατηγοριών είναι παραδοχή → S'
    metric = ((Q[r['questionId']].get('evidenceLink') or {}).get('metric'))
    if metric in STALE: return 'S', f"Παρωχημένη πηγή (κύμα {STALE[metric][0]}, {STALE[metric][1]} έτη πριν): δεν τεκμηριώνει την τρέχουσα εικόνα → S, δεν παρουσιάζεται ως εύρημα"
    if r['class'] == 'E': return 'T', 'Εμπειρική πηγή πανελλαδική (με προσαρμογή στη σύνθεση της Αττικής) → για την Α΄ Ανατολικής Αττικής: T (γεωγραφική μεταφορά), όχι τοπική μέτρηση'
    return r['class'], r['route']
SOURCES = {'Q5': 'NORAYA public opinion — εμπιστοσύνη στην εθνική κυβέρνηση (Ελλάδα, κύμα 2024-Q4)', 'Q6': 'NORAYA public opinion — ικανοποίηση από τη λειτουργία της δημοκρατίας (Ελλάδα)', 'Q22': 'NORAYA political — αποδοχή Κ. Μητσοτάκη (κύμα 2019-Q2, 7 ετών)', 'Q23': 'Μέσος όρος δημοσιευμένων πανελλαδικών δημοσκοπήσεων, 10/2026 (επί των εγκύρων)', 'Q3': 'διαΝΕΟσις 2024 (άγκυρα econ4 της PIE) μέσω εγκεκριμένου πίνακα αντιστοίχισης'}
# Παλαιότητα πηγής από τις προειδοποιήσεις του μηχανισμού: ≥ 3 έτη → η εκτίμηση ΔΕΝ τεκμηριώνει την τρέχουσα εικόνα (S, παρωχημένη)
import re
STALE = {}
for w in run['base']['warnings']:
    m = re.search(r'για «([^»]+)» είναι από το κύμα (\S+) \((\d+) έτη', w)
    if m and int(m.group(3)) >= 3: STALE[m.group(1)] = (m.group(2), int(m.group(3)))
res = []
for qid, q in Q.items():
    routes[qid]['questionId'] = qid
    opts = q.get('scale') if q['type'] == 'likert' else q.get('options')
    r = routes[qid]; cls, why = study_class(r)
    vals = [x[qid] for x in rows if not NA(x[qid])]
    n = len(vals); shares = []
    if n:
        cnt = collections.Counter()
        for v in vals:
            for o in (v.split(' | ') if q['type'] == 'multiple_choice' else [v]): cnt[o] += 1
        shares = [{'option': o, 'pct': round(100 * cnt[o] / n, 1)} for o in opts]
    res.append({'id': qid, 'text': q['text'], 'type': q['type'], 'followUpOf': (q.get('followUpOf') or {}).get('questionId'), 'engineClass': r['class'], 'engineRoute': r['route'], 'studyClass': cls, 'basis': why, 'source': SOURCES.get(qid), 'n': n, 'shares': shares})
# πίνακες ανά ομάδα (μόνο ερωτήσεις με απαντήσεις· ελάχιστη βάση 50)
AGE = {'15-24': '17–24', '25-34': '25–34', '35-44': '35–44', '45-54': '45–54', '55-64': '55–64', '65+': '65+'}
LR = lambda x: '' if x in ('', None) else ('Αριστερά (1–2)' if float(x) <= 2 else 'Κεντροαριστερά (3)' if float(x) <= 3 else 'Κέντρο (4)' if float(x) <= 4 else 'Κεντροδεξιά (5)' if float(x) <= 5 else 'Δεξιά (6–7)')
PV = {'nd': 'ΝΔ', 'syriza': 'ΣΥΡΙΖΑ', 'pasok': 'ΠΑΣΟΚ', 'kke': 'ΚΚΕ', 'other': 'Άλλο κόμμα', 'abstain': 'Αποχή/λευκό'}
dims = {'Ηλικία': lambda x: AGE.get(x['age_band'], x['age_band']), 'Φύλο': lambda x: {'male': 'Άνδρες', 'female': 'Γυναίκες'}.get(x['gender'], ''),
        'Ιδεολογία (συνθετική άγκυρα)': lambda x: LR(x['anchor_lr7']), 'Ψήφος 2023 (συνθετική άγκυρα)': lambda x: PV.get(x['anchor_pv2023'], '')}
xt = {}
for r in res:
    if not r['n'] or r['type'] == 'multiple_choice': continue
    xt[r['id']] = {}
    for dn, f in dims.items():
        g = collections.defaultdict(list)
        for x in rows:
            if not NA(x[r['id']]) and f(x): g[f(x)].append(x[r['id']])
        xt[r['id']][dn] = {k: ({'n': len(v), 'shares': {o['option']: round(100 * sum(1 for y in v if y == o['option']) / len(v), 1) for o in r['shares']}} if len(v) >= 50 else {'n': len(v), 'shares': None, 'note': 'ανεπαρκής βάση (< 50)'}) for k, v in sorted(g.items())}
# εξάρτηση απαντήσεων από ψήφο/ιδεολογία: αν οι απαντήσεις δεν εξαρτώνται από τις άγκυρες, οι πίνακες αυτοί ΔΕΝ είναι ευρήματα
def spread(qid, dn):
    t = xt.get(qid, {}).get(dn, {}); cells = [c['shares'] for c in t.values() if c['shares']]
    if len(cells) < 2: return None
    opts = list(cells[0]); return round(max(max(c[o] for c in cells) - min(c[o] for c in cells) for o in opts), 1)
dependence = {qid: {dn: spread(qid, dn) for dn in dims} for qid in xt}
# σύνθεση: προηγούμενη ψήφος (άγκυρα) έναντι επίσημων αποτελεσμάτων 25/6/2023
off = {}
for l in csv.DictReader(open(os.path.join(ROOT, '.synthetic-lab-data', 'raw', 'political', 'tidy', 'election_results.csv'))):
    if l['election_id'] == 'GR_parl_2023-06-25' and l['unit_code'] in ('CON-eastattica', 'REG-attica', 'GR'):
        off.setdefault(l['unit_code'], {})[l['party_key']] = float(l['pct_valid'] or 0)
voters = [x['anchor_pv2023'] for x in rows if x['anchor_pv2023'] not in ('', 'abstain')]
syn = {k: round(100 * voters.count(k) / len(voters), 1) for k in ['nd', 'syriza', 'pasok', 'kke', 'other']}
comp = {'synthetic_anchor_pv2023_voters': syn, 'abstain_share_all': round(100 * sum(1 for x in rows if x['anchor_pv2023'] == 'abstain') / len(rows), 1)}
for u, lab in (('CON-eastattica', 'official_east_attica'), ('REG-attica', 'official_attica_region')):
    o = off.get(u, {}); main = {k.lower(): o.get(k.upper(), 0) for k in ['nd', 'syriza', 'pasok', 'kke']}; main['other'] = round(100 - sum(main.values()), 2); comp[lab] = main
comp['absDiff_vs_east_attica_pp'] = {k: round(syn[k] - comp['official_east_attica'][k], 1) for k in syn}
demo = {'age': dict(collections.Counter(x['age_band'] for x in rows)), 'gender': dict(collections.Counter(x['gender'] for x in rows)), 'education': dict(collections.Counter(x['education'] for x in rows)), 'region': dict(collections.Counter(x['region'] for x in rows))}
hist = {'source': 'aftodioikisi.gr, «Ανατολική Αττική - Δημοσκόπηση aftodioikisi.gr: Ποιοι υποψήφιοι βουλευτές προηγούνται (πίνακες)», 20.12.2022', 'url': 'https://www.aftodioikisi.gr/politiki/anatoliki-attiki-dimoskopisi-aftodioikisi-gr-poioi-ypopsifioi-voyleytes-proigoyntai-pinakes/',
        'method': 'Ανοιχτό online ερωτηματολόγιο (Google Forms), δείγμα ευκολίας n = 1.409, στάθμιση μόνο ως προς δηλωθείσα ψήφο 2019· πεδίο 5–13 (ή 16) Δεκεμβρίου 2022· εταιρεία δεν αναφέρεται',
        'question': '«Θα θέλαμε να μας πείτε αν έχετε θετική ή αρνητική εικόνα για καθένα από αυτά:» (λίστα προσώπων της Ανατολικής Αττικής)',
        'christodoulakis_total': {'Θετική': 16, 'Ουδέτερη': 37, 'Αρνητική': 23, 'ΔΞ/ΔΑ': 24}, 'christodoulakis_pasok2019_positive': 56,
        'status': 'Επαληθεύτηκε στην πρωτογενή δημοσίευση, ΑΛΛΑ μη αντιπροσωπευτική (δείγμα ευκολίας). Δεν χρησιμοποιείται ως αριθμητικό σημείο αναφοράς ούτε ως είσοδος του μοντέλου· μόνο ως ιστορικό πλαίσιο.',
        'synthetic_counterpart': 'Q11 (γνώμη για τον Μ. Χριστοδουλάκη): ΜΗ ΕΚΤΙΜΗΣΙΜΟ στη συνθετική μελέτη — δεν υπάρχει σύγκριση και δεν μπορεί να υπολογιστεί «μεταβολή».'}
other_measurements = 'Δεν βρέθηκε άλλη δημοσιευμένη μέτρηση αναγνωρισιμότητας ή γνώμης για τον Μ. Χριστοδουλάκη (2023–2026). Οι μετρήσεις για την ηγεσία του ΠΑΣΟΚ (π.χ. Interview/Politic 2024: Δούκας–Ανδρουλάκης) αφορούν την ηγεσία του κόμματος και ΔΕΝ είναι μετρήσεις προσωπικής γνώμης για τον Χριστοδουλάκη.'
cov = run['coverage']
out = {'results': res, 'crosstabs': xt, 'dependenceOnAnchors_maxSpreadPp': dependence, 'composition': comp, 'demographics': demo, 'historical': hist, 'otherMeasurements': other_measurements, 'coverage': cov,
       'studyClassCounts': dict(collections.Counter(r['studyClass'] or 'NA' for r in res))}
json.dump(out, open(os.path.join(D, 'run', 'results.json'), 'w'), ensure_ascii=False, indent=1)
with open(os.path.join(D, 'run', 'results_by_question.csv'), 'w', newline='', encoding='utf-8-sig') as f:
    w = csv.writer(f); w.writerow(['ερώτηση', 'κείμενο', 'κατηγορία μελέτης', 'κατηγορία μηχανισμού', 'διαδρομή', 'n', 'επιλογή', '%', 'βάση/αιτία'])
    for r in res:
        if r['shares']:
            for s in r['shares']: w.writerow([r['id'], r['text'], r['studyClass'], r['engineClass'], r['engineRoute'], r['n'], s['option'], s['pct'], r['basis']])
        else: w.writerow([r['id'], r['text'], 'NA', r['engineClass'] or '', r['engineRoute'] or '', 0, '', '', r['basis']])
print(json.dumps({'classes': out['studyClassCounts'], 'composition': comp, 'dependence': dependence}, ensure_ascii=False, indent=1))
