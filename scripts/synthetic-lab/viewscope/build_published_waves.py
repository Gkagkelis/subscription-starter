"""Viewscope v2 — Π4: μητρώο προηγούμενων ΔΗΜΟΣΙΕΥΜΕΝΩΝ κυμάτων (συνολικά ποσοστά δημοσκοπήσεων/ερευνών).

  python3 -I scripts/synthetic-lab/viewscope/build_published_waves.py

Πηγές (ήδη στο Lab, μόνο ανάγνωση):
  - .synthetic-lab-data/persona/pdf/documents.json  (497 δημόσια PDF: φορέας, ημερομηνίες πεδίου/δημοσίευσης, n, sha256)
  - .synthetic-lab-data/persona/pdf/tables_text.jsonl  (αυτόματη εξαγωγή πινάκων «Σύνολο» από το κείμενο των PDF)
  - config/synthetic-lab/p7a/prev_same.json  (χειροκίνητη μεταγραφή Metron 2024–2026, Phase 7A· εδώ επαληθεύεται αυτόματα
    απέναντι στο κείμενο της σελίδας — δεύτερη, ανεξάρτητη καταχώριση)
Έξοδος: <dataRoot>/viewscope/published_waves.json (ιδιωτικό, εκτός repo) + σύνοψη στο benchmarks/viewscope_v2/results.
Κάθε εγγραφή έχει: φορέα, ερώτηση, επιλογές, ποσοστά, n, ημερομηνίες πεδίου/δημοσίευσης, availableAt (πότε έγινε δημόσια),
έγγραφο (docId, sha256, σελίδα), τρόπο εξαγωγής, έλεγχο ποιότητας, όρους χρήσης.
ΔΕΝ περιέχει τιμές της Phase 7A (όλα τα έγγραφα-στόχοι εξαιρούνται ρητά, και ο χρονικός φραγμός εφαρμόζεται κατά τη δρομολόγηση).
"""
import json, os, re, subprocess, hashlib, unicodedata, collections
ROOT = os.path.abspath(os.path.join(os.path.dirname(os.path.abspath(__file__)), '..', '..', '..'))
DR = os.environ.get('SYNTHETIC_LAB_DATA_DIR') or os.path.join(ROOT, '.synthetic-lab-data')
PDF = os.path.join(ROOT, '.synthetic-lab-data', 'persona', 'pdf')
OUT = os.path.join(DR, 'viewscope', 'published_waves.json')
SUM = os.path.join(ROOT, 'benchmarks', 'viewscope_v2', 'results', 'published_waves_summary.json')

ORG_KEYS = [('metron', 'metron'), ('gpo', 'gpo'), ('g.p.o', 'gpo'), ('prorata', 'prorata'), ('marc', 'marc'), ('mrb', 'mrb'), ('pulse', 'pulse'),
            ('opinion poll', 'opinion_poll'), ('interview', 'interview'), ('alco', 'alco'), ('kapa', 'kapa'), ('focus bari', 'focus_bari'),
            ('palmos', 'palmos'), ('ιοβε', 'iobe'), ('eurobarometer', 'eurobarometer'), ('διανεοσις', 'dianeosis'), ('diaNEOsis', 'dianeosis'),
            ('εεττ', 'eett'), ('dg just', 'dg_just'), ('ελστατ', 'elstat'), ('rass', 'rass'), ('eltrun', 'eltrun'), ('reuters', 'reuters')]
def org_key(s):
    t = (s or '').lower()
    for k, v in ORG_KEYS:
        if k.lower() in t: return v
    return re.sub(r'\W+', '_', t).strip('_') or 'unknown'

def main():
    docs = {d['docId']: d for d in json.load(open(os.path.join(PDF, 'documents.json')))}
    entries = []
    # Α. αυτόματη εξαγωγή (μόνο πίνακες συνόλου)
    for l in open(os.path.join(PDF, 'tables_text.jsonl')):
        t = json.loads(l)
        if not t.get('rows') or t.get('group') != 'Σύνολο': continue
        d = docs.get(t['docId'], {})
        pub = d.get('date') or t.get('date'); fe = d.get('fieldwork_end')
        avail = max([x for x in (pub, fe) if x] or [None]) if (pub or fe) else None
        entries.append({
            'id': f"pw-{t['docId']}-p{t.get('page')}-{hashlib.sha1((t.get('question') or '').encode()).hexdigest()[:8]}",
            'org': org_key(d.get('org') or t.get('org')), 'orgLabel': d.get('org') or t.get('org'), 'client': d.get('client'),
            'question': t.get('question') or '', 'options': [r['label'] for r in t['rows']], 'values': [r['value'] for r in t['rows']],
            'n': d.get('n'), 'fieldworkStart': d.get('fieldwork_start'), 'fieldworkEnd': fe, 'publishedAt': pub, 'availableAt': avail,
            'doc': {'docId': t['docId'], 'sha256': d.get('sha256'), 'page': t.get('page'), 'url': d.get('url'), 'title': d.get('title')},
            'kind': t.get('kind'), 'partitionAtIngest': d.get('partition'),
            'extraction': {'method': 'pdf_text_auto', 'secondEntry': None, 'sumOk': bool(t.get('sumOk')), 'sum': t.get('sum'), 'confidence': t.get('confidence')},
            'quality': 'high' if t.get('sumOk') else 'low',
            'use': {'research': 'επιτρέπεται (δημοσιευμένα συνολικά ποσοστά, με αναφορά πηγής)', 'commercial': 'μόνο με αναφορά πηγής· έλεγχος όρων εκδότη πριν από εμπορική χρήση'}})
    # Β. χειροκίνητη μεταγραφή Metron (Phase 7A PREV_SAME) + αυτόματη επαλήθευση απέναντι στο κείμενο της σελίδας
    prev = json.load(open(os.path.join(ROOT, 'config', 'synthetic-lab', 'p7a', 'prev_same.json')))
    verify = []
    for survey, qs in prev.items():
        if survey.startswith('_'): continue
        for qid, e in qs.items():
            m = re.match(r'([0-9a-f]{12})', e['source']); docId = m.group(1); d = docs[docId]
            pm = re.search(r'σελ\.\s*(\d+)', e['source']); page = int(pm.group(1)) if pm else None
            npages = int(re.search(r'Pages:\s+(\d+)', subprocess.run(['pdfinfo', d['path']], capture_output=True, text=True).stdout).group(1))
            pages = list(range(1, npages + 1))  # η «σελ.» της μεταγραφής είναι τυπωμένη αρίθμηση· ελέγχονται όλες οι σελίδες
            texts = {p: subprocess.run(['pdftotext', '-f', str(p), '-l', str(p), '-layout', d['path'], '-'], capture_output=True, text=True).stdout for p in pages}
            # επαλήθευση: κάθε τιμή εμφανίζεται ως αριθμός στη σελίδα (δεύτερη καταχώριση από το κείμενο του PDF)
            best = None
            def toks(x):
                x = unicodedata.normalize('NFD', x.lower()); x = ''.join(c for c in x if unicodedata.category(c) != 'Mn')
                return [w for w in re.findall(r'\w+', x) if len(w) >= 4 and w not in ('αυθ',)]
            for p, tx in texts.items():
                flat = ' '.join(toks(tx))
                nums = set(re.findall(r'(?<![\d,.])(\d{1,3})(?![\d,.])', tx))
                # μηδενικές τιμές συνήθως δεν τυπώνονται: ελέγχονται μόνο οι επιλογές με τιμή > 0,5
                pos = {o: v for o, v in e['shares'].items() if v > 0.5}
                ok = [str(int(round(v))) in nums for v in pos.values()]
                lab = [all(w in flat for w in toks(o)) for o in pos if toks(o)]
                quotes = re.findall(r'[‘«](.{15,400}?)(?:[’»]|\?)', tx.replace('\n', ' '))
                if not quotes:  # εισαγωγικό χωρίς κλείσιμο: έως το τέλος του μπλοκ κειμένου (3+ κενά = αλλαγή στήλης/γραμμής διάταξης)
                    quotes = [re.split(r'\s{3,}', q)[0] for q in re.findall(r'‘([^’]{15,400})', re.sub(r'\n\s*', ' ', tx))]
                qtext = None
                if quotes:  # το απόσπασμα της σελίδας που μοιάζει περισσότερο με ερώτηση με αυτές τις επιλογές
                    ow = set(w for o in e['shares'] for w in toks(o))
                    qtext = max(quotes, key=lambda q: (len(set(toks(q)) & ow), -quotes.index(q))).strip()
                    # αποκοπή υπολειμμάτων διάταξης μετά το τελευταίο ερωτηματικό (π.χ. «… αρνητική ; Δια[χρονικά]»)
                    m2 = re.match(r'^(.*[;;?])', qtext)
                    if m2: qtext = re.sub(r'\s+([;;?])$', r'\1', m2.group(1).strip())
                score = (sum(ok) / len(ok)) + (sum(lab) / len(lab) if lab else 0)
                cand = (score, -abs(p - ((page or 0) + 1)), p, qtext, sum(ok) / len(ok), (sum(lab) / len(lab)) if lab else None)
                if best is None or cand[:2] > best[:2]: best = cand
            _, _, p, qtext, frac, labfrac = best
            verify.append({'survey': survey, 'qid': qid, 'docId': docId, 'page': p, 'valuesFoundShare': round(frac, 2), 'labelsFoundShare': labfrac, 'questionExtracted': bool(qtext)})
            entries.append({
                'id': f'pw-{docId}-p{p}-manual-{qid}', 'org': 'metron', 'orgLabel': d.get('org'), 'client': d.get('client'),
                'question': qtext or '', 'options': list(e['shares'].keys()), 'values': list(e['shares'].values()),
                'n': d.get('n'), 'fieldworkStart': d.get('fieldwork_start'), 'fieldworkEnd': d.get('fieldwork_end'), 'publishedAt': d.get('date'),
                'availableAt': max([x for x in (d.get('date'), d.get('fieldwork_end')) if x]),
                'doc': {'docId': docId, 'sha256': d.get('sha256'), 'page': p, 'url': d.get('url'), 'title': d.get('title')},
                'kind': 'polls', 'partitionAtIngest': d.get('partition'),
                'extraction': {'method': 'manual_transcription', 'secondEntry': 'pdftotext_values_and_labels_found', 'valuesFoundShare': round(frac, 2), 'labelsFoundShare': labfrac, 'sumOk': abs(sum(e['shares'].values()) - 100) <= 2},
                'quality': 'high' if frac == 1 and (labfrac is None or labfrac == 1) and qtext else 'low',
                'note': 'Χειροκίνητη μεταγραφή (Phase 7A, πριν από το άνοιγμα των απαντήσεων-στόχων)· δεν χρησιμοποιείται ως ερώτηση-στόχος.',
                'use': {'research': 'επιτρέπεται (δημοσιευμένα συνολικά ποσοστά, με αναφορά πηγής)', 'commercial': 'μόνο με αναφορά πηγής· έλεγχος όρων εκδότη πριν από εμπορική χρήση'}})
    # Αποκλεισμός οποιουδήποτε εγγράφου-στόχου της Phase 7A (ασφάλεια, επιπλέον του χρονικού φραγμού)
    p7 = json.load(open(os.path.join(ROOT, 'docs', 'synthetic-lab', 'PHASE7A_QUESTIONNAIRES.json')))['surveys']
    target_urls = {s.get('reportUrl') for s in p7}
    before = len(entries); entries = [e for e in entries if e['doc'].get('url') not in target_urls]
    os.makedirs(os.path.dirname(OUT), exist_ok=True)
    blob = {'version': 'pw-1.0', 'builtFrom': ['persona/pdf/documents.json', 'persona/pdf/tables_text.jsonl', 'config/synthetic-lab/p7a/prev_same.json'],
            'note': 'ΣΥΝΟΛΙΚΑ δημοσιευμένα ποσοστά· όχι μικροδεδομένα. Μια συνθετική εκτίμηση που βασίζεται σε αυτά χαρακτηρίζεται T.', 'entries': entries}
    raw = json.dumps(blob, ensure_ascii=False, sort_keys=True)
    open(OUT, 'w').write(raw)
    summary = {'file': os.path.relpath(OUT, DR), 'sha256': hashlib.sha256(raw.encode()).hexdigest(), 'entries': len(entries), 'excludedTargetDocs': before - len(entries),
               'byQuality': collections.Counter(e['quality'] for e in entries), 'byMethod': collections.Counter(e['extraction']['method'] for e in entries),
               'byOrg': collections.Counter(e['org'] for e in entries).most_common(), 'metronVerification': verify,
               'dateRange': [min(e['availableAt'] for e in entries if e['availableAt']), max(e['availableAt'] for e in entries if e['availableAt'])]}
    os.makedirs(os.path.dirname(SUM), exist_ok=True); json.dump(summary, open(SUM, 'w'), ensure_ascii=False, indent=1)
    print(json.dumps({k: v for k, v in summary.items() if k != 'byOrg'}, ensure_ascii=False, indent=1))

if __name__ == '__main__': main()
