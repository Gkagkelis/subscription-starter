"""Viewscope v2 — Π2: έλεγχος δομής BankSat και ευαισθησία του μόνου επιτρεπόμενου τεστ (περιθώρια, Phase 4 H4).
Μόνο ανάγνωση. Δεν εκπαιδεύει και δεν επικυρώνει ατομικές σχέσεις (καραντίνα: config/synthetic-lab/viewscope/dataset-quarantine.json).
  python3 -I scripts/synthetic-lab/viewscope/banksat_audit.py"""
import collections, json, os, random
import pandas as pd
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
DR = os.path.join(ROOT, '.synthetic-lab-data')
OUT = os.path.join(ROOT, 'benchmarks', 'viewscope_v2', 'results', 'banksat_audit.json')
Q = json.load(open(os.path.join(ROOT, 'config', 'synthetic-lab', 'viewscope', 'dataset-quarantine.json')))['datasets']['banksat']
assert 'marginal_validation' in Q['allowedWithFlag'] and 'individual_validation' in Q['forbidden']
df = pd.read_excel(os.path.join(DR, 'raw', 'sprint', 'microdata', 'mendeley_8ghbmydv77_bank_satisfaction_gr', 'Data.xlsx'), sheet_name=0)
key = df.astype(str).agg('|'.join, axis=1); cnt = key.map(key.value_counts())
items = [c for c in df.columns]
straight = df.apply(lambda r: r.dropna().nunique() <= 1, axis=1)
# θέσεις των επαναλήψεων: συνεχόμενες ή διάσπαρτες;
pos = collections.defaultdict(list)
for i, k in enumerate(key): pos[k].append(i)
gaps = [b - a for v in pos.values() if len(v) > 1 for a, b in zip(v, v[1:])]
rnd = random.Random(1); sim = pd.DataFrame({c: rnd.choices(df[c].tolist(), k=len(df)) for c in items})
simdup = int(sim.astype(str).agg('|'.join, axis=1).duplicated(keep=False).sum())
dedup = df[~key.duplicated()]
pred = json.load(open(os.path.join(DR, 'persona', 'phase4', 'final', 'predictions.json')))['holdouts']['banksat']['items']
res_items = []
for it in pred:
    v = it['id'].split('::')[1]
    if v not in df.columns: continue
    K = it['K']; codes = list(range(K))
    def marg(d):
        s = d[v].dropna().astype(int).value_counts(normalize=True)
        return [100 * float(s.get(c, 0)) for c in codes]
    full, uniq = marg(df), marg(dedup)
    lvl = [100 * x for x in it['level']]
    mae = lambda a, b: sum(abs(x - y) for x, y in zip(a, b)) / K
    res_items.append({'item': v, 'shiftFullVsDedup': mae(full, uniq), 'iqgeFull': mae(lvl, full), 'uniformFull': mae([100 / K] * K, full), 'iqgeDedup': mae(lvl, uniq), 'uniformDedup': mae([100 / K] * K, uniq)})
m = lambda k: sum(r[k] for r in res_items) / len(res_items)
out = {
    'dataset': 'banksat', 'status': Q['status'], 'rows': len(df), 'columns': len(df.columns), 'hasIds': False,
    'fullRowDuplicates': int(key.duplicated(keep=False).sum()), 'distinctPatterns': int(key.nunique()), 'maxRepeat': int(cnt.max()),
    'straightLiningRowsAmongDuplicates': int((straight & (cnt > 1)).sum()), 'medianGapBetweenRepeats': sorted(gaps)[len(gaps) // 2] if gaps else None,
    'contiguousRepeats': sum(1 for g in gaps if g == 1), 'repeatsTotalGaps': len(gaps),
    'independenceSimulationDuplicates': simdup,
    'interpretation': 'Οι επαναλήψεις δεν είναι τυχαίες (0 στην προσομοίωση ανεξαρτησίας) και δεν είναι κυρίως «ίδια απάντηση παντού»· δεν αποδεικνύουν όμως ότι είναι οι ίδιοι άνθρωποι. Η δομή μένει μη επιβεβαιωμένη → καραντίνα.',
    'marginalTestSensitivity': {'items': len(res_items), 'meanShiftFullVsDedupPp': m('shiftFullVsDedup'),
        'full': {'iqge': m('iqgeFull'), 'uniform': m('uniformFull')}, 'dedup': {'iqge': m('iqgeDedup'), 'uniform': m('uniformDedup')},
        'conclusionStable': (m('iqgeFull') < m('uniformFull')) == (m('iqgeDedup') < m('uniformDedup'))},
    'usePolicy': {'forbidden': Q['forbidden'], 'allowedWithFlag': Q['allowedWithFlag']},
}
os.makedirs(os.path.dirname(OUT), exist_ok=True); json.dump(out, open(OUT, 'w'), ensure_ascii=False, indent=1)
print(json.dumps(out, ensure_ascii=False, indent=1))
