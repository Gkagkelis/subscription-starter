"""Viewscope v2 — Βήμα 2: σύνδεση ερωτήσεων μιας μελέτης με συγγενικά items της PIE (κοινός συνθετικός άνθρωπος).
Ίδια διαδικασία με την αξιολόγηση (core_eval.py): πολύγλωσσα embeddings, ομοιότητα ≥ simMin, πρόσημο από τα άκρα της κλίμακας.
  python3 -I scripts/synthetic-lab/viewscope/build_core_links.py --plan <study.json|plan.json> --out <links.json>
Έξοδος: {questionId: {domain, enabled, analogs:[{itemId, sim, sign, weight}], reason}}· χρησιμοποιείται από τον runner (--core-links)."""
import argparse, json, os, re, sys
import numpy as np
HERE = os.path.dirname(os.path.abspath(__file__)); ROOT = os.path.abspath(os.path.join(HERE, '..', '..', '..'))
sys.path.insert(0, HERE)
import core_eval as ce  # noqa: E402

# Ο κοινός πυρήνας εφαρμόζεται ΜΟΝΟ σε διατεταγμένες απαντήσεις (όπως αξιολογήθηκε: ordinal/binary). Ονομαστικές επιλογές
# (π.χ. ονόματα αρχηγών, κόμματα, μάρκες) δεν έχουν φορά → δεν συνδέονται (μένουν ανεξάρτητες).
POS = re.compile(r'^(πολυ|παρα πολυ|απολυτα|αρκετ|συμφων|ναι|θετικ|καλυτερ|καλ|σιγουρα ναι|ικανοποιημεν|πιθαν|very|strongly agree|agree|yes|always|παντα)')
NEG = re.compile(r'^(καθολου|διαφων|οχι|αρνητικ|χειροτερ|κακ|ποτε|σιγουρα οχι|απιθαν|δεν|not at all|never|no\b|strongly dis|disagree)')
def ordered(subst):
    if len(subst) == 2: return True
    f, l = ce.norm(subst[0]), ce.norm(subst[-1])
    return bool((POS.search(f) and NEG.search(l)) or (NEG.search(f) and POS.search(l)))
DK = re.compile(r'(δεν (γνωριζ|ξερ|απαντ)|δγ|δα$|δξ|refus|don.?t know|no answer)', re.I)

def main():
    ap = argparse.ArgumentParser(); ap.add_argument('--plan', required=True); ap.add_argument('--out', required=True); a = ap.parse_args()
    cfg = json.load(open(os.path.join(ROOT, 'config', 'synthetic-lab', 'viewscope', 'core.json')))
    doc = json.load(open(a.plan)); qs = (doc.get('plan') or doc)['questions']
    model = json.load(open(os.path.join(ce.DR, 'persona', 'models', cfg['model'], 'model.json')))
    itemsj = json.load(open(os.path.join(ce.DR, 'persona', 'models', cfg['model'], 'items.json')))
    pitems = [i for i in (itemsj['items'] if isinstance(itemsj, dict) else itemsj) if i['model']['kind'] == 'ordinal']
    emb = ce.Embedder(ROOT)
    PE = {'q': ce.embed_cached(emb, [ce.clean(i['text']) for i in pitems], 'pie07q'), 'lo': ce.embed_cached(emb, [i['options'][0]['label'] for i in pitems], 'pie07lo'),
          'hi': ce.embed_cached(emb, [i['options'][-1]['label'] for i in pitems], 'pie07hi')}
    out = {'version': cfg['version'], 'model': cfg['model'], 'atten': cfg['atten'], 'links': {}}
    targets, ids = [], []
    for q in qs:
        opts = q.get('scale') if q.get('type') == 'likert' else q.get('options')
        if q.get('type') not in ('likert', 'single_choice') or not opts: out['links'][q['id']] = {'enabled': False, 'analogs': [], 'reason': f"μορφή «{q.get('type')}» — δεν συνδέεται"}; continue
        subst = [o for o in opts if not DK.search(o)]
        if len(subst) < 2: out['links'][q['id']] = {'enabled': False, 'analogs': [], 'reason': 'λιγότερες από 2 ουσιαστικές επιλογές'}; continue
        if q.get('type') != 'likert' and not ordered(subst): out['links'][q['id']] = {'enabled': False, 'analogs': [], 'reason': 'ονομαστικές επιλογές χωρίς φορά — μένει ανεξάρτητη'}; continue
        it = {'text': q['text'], 'options': [{'label': o} for o in subst], 'lowLabel': subst[0], 'highLabel': subst[-1]}
        targets.append(it); ids.append(q['id'])
    if targets:
        old = ce.SIM_MIN, ce.TOPK, ce.SIGN_MIN
        ce.SIM_MIN, ce.TOPK, ce.SIGN_MIN = cfg['link']['simMin'], cfg['link']['topK'], cfg['link']['signMin']
        links = ce.links_for(targets, pitems, PE, emb, 'plan_' + os.path.basename(a.plan))
        ce.SIM_MIN, ce.TOPK, ce.SIGN_MIN = old
        for qid, t, L in zip(ids, targets, links):
            dom = ce.domain(t, '')
            en = bool(L) and dom in cfg['enabledDomains']
            out['links'][qid] = {'domain': dom, 'enabled': en, 'analogs': [{k: x[k] for k in ('itemId', 'sim', 'sign', 'weight')} for x in L],
                                 'reason': 'ok' if en else ('χωρίς συγγενικό item (ομοιότητα/πρόσημο)' if not L else f"τομέας «{dom}»: {cfg['disabledDomains'].get(dom, 'μη ενεργός')}")}
    os.makedirs(os.path.dirname(os.path.abspath(a.out)), exist_ok=True); json.dump(out, open(a.out, 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({k: (v['enabled'], v.get('domain'), len(v['analogs'])) for k, v in out['links'].items()}, ensure_ascii=False))

if __name__ == '__main__': main()
