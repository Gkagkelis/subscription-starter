"""Viewscope benchmark v1 — BM.1: κρίση κάλυψης ανά ερώτηση της Φάσης 7A (75 ερωτήσεις με πραγματική τιμή).
Διαβάζει μόνο τα αποτελέσματα των coverage_7a.py / lake_prev_7a.py· γράφει results/coverage_adjudication.csv και _summary.csv.
Οι κατηγορίες A–E αποδόθηκαν με χειροκίνητο έλεγχο των υποψηφίων (ομοιότητα ερώτησης/επιλογών) — καταγράφονται εδώ ρητά.
"""
import csv, os, collections
HERE = os.path.dirname(os.path.abspath(__file__)); RES = os.path.join(HERE, '..', 'results')
CAT = {
 'COVERED': 'Καλύφθηκε από τον μηχανισμό (B5 διεθνής μεταφορά / pie-0.7)',
 'A': 'Υπάρχει προηγούμενο δημόσιο κύμα της ίδιας ερώτησης (ίδιος φορέας/διατύπωση) αλλά δεν έχει εισαχθεί στη βάση — πρόβλημα εισαγωγής',
 'B': 'Ισοδύναμη έννοια υπάρχει ήδη στο Lab αλλά δεν δρομολογήθηκε — πρόβλημα αντιστοίχισης/δρομολόγησης',
 'C': 'Υπάρχουν μόνο συγγενικά δεδομένα (άλλη έννοια/διατύπωση) — σωστή αποχή ή χαμηλή κατηγορία T',
 'D': 'Δεν υπάρχουν δεδομένα (ούτε στη βάση ούτε σε γνωστή ανοιχτή πηγή) — πραγματική έλλειψη',
 'E': 'Μορφή ερώτησης που δεν υποστηρίζεται (κατάταξη / ανοιχτή αριθμητική κ.λπ.)',
}
ASSIGN = {}
for q in ['Q1','Q2','Q5','Q6','Q7','Q8','Q10','Q11','Q13','Q19','Q20','Q21']: ASSIGN[('P7A-POL-01', q)] = 'A'
ASSIGN[('P7A-CON-01','Q2')] = 'B'
for i in range(1,12): ASSIGN[('P7A-CON-01', f'Q4_{i}')] = 'C'; ASSIGN[('P7A-CON-01', f'Q4R_{i}')] = 'E'
for i in range(1,5): ASSIGN[('P7A-POL-01', f'Q4_{i}')] = 'C'; ASSIGN[('P7A-POL-02', f'Q5_{i}')] = 'C'
for k in [('P7A-CON-01','Q3'),('P7A-POL-01','Q16'),('P7A-POL-01','Q17'),('P7A-POL-01','Q18'),('P7A-POL-02','Q6'),('P7A-POL-02','Q7'),('P7A-POL-02','Q8'),('P7A-POL-02','Q10')]: ASSIGN[k] = 'D'
ASSIGN[('P7A-POL-02','Q9')] = 'E'
NOTE = {('P7A-CON-01','Q2'): 'ισοδύναμο με την άγκυρα PIE econ4 (οικονομική κατάσταση νοικοκυριού) — δεν δρομολογήθηκε'}

cand = {(r['survey'], r['qid']): r for r in csv.DictReader(open(os.path.join(RES, 'coverage_7a_candidates.csv'))) if r['ground_truth'] == 'True'}
resc = {(r['survey'], r['qid']): r for r in csv.DictReader(open(os.path.join(RES, 'phase7a_rescored_by_question.csv')))}
out = []
for k, r in cand.items():
    s = resc.get(k, {})
    cat = 'COVERED' if (s.get('B5') or s.get('pie-0.7')) else ASSIGN.get(k)
    assert cat, f'χωρίς κατηγορία: {k}'
    best = max([('pie', r['pie_best_sim']), ('intl', r['intl_best_sim']), ('lake', r['lake_best_sim']), ('prod1', r['prod1_best_sim'])], key=lambda x: float(x[1] or 0))
    out.append({'survey': k[0], 'qid': k[1], 'type': r['type'], 'text': r['text'][:160], 'category': cat, 'category_label': CAT[cat],
                'best_pool': best[0], 'best_similarity': best[1], 'pie_sim': r['pie_best_sim'], 'intl_sim': r['intl_best_sim'], 'lake_sim': r['lake_best_sim'], 'prod1_sim': r['prod1_best_sim'],
                'MAE_B5': s.get('B5', ''), 'MAE_PREV_SAME': s.get('PREV_SAME', ''), 'MAE_LAKE_PREV': s.get('LAKE_PREV', ''), 'MAE_UNIF': s.get('UNIF', ''), 'note': NOTE.get(k, '')})
out.sort(key=lambda x: (x['survey'], x['category'], x['qid']))
with open(os.path.join(RES, 'coverage_adjudication.csv'), 'w', newline='') as f:
    w = csv.DictWriter(f, fieldnames=list(out[0].keys())); w.writeheader(); w.writerows(out)
cnt = collections.Counter(x['category'] for x in out); bys = collections.Counter((x['survey'], x['category']) for x in out)
surveys = sorted({x['survey'] for x in out})
with open(os.path.join(RES, 'coverage_adjudication_summary.csv'), 'w', newline='') as f:
    w = csv.writer(f); w.writerow(['category', 'label', 'ALL', 'share_of_75'] + surveys)
    for c in ['COVERED', 'A', 'B', 'C', 'D', 'E']:
        w.writerow([c, CAT[c], cnt[c], f'{cnt[c]/len(out):.3f}'] + [bys[(s, c)] for s in surveys])
for c in ['COVERED', 'A', 'B', 'C', 'D', 'E']: print(c, cnt[c], f'{100*cnt[c]/len(out):.0f}%')
