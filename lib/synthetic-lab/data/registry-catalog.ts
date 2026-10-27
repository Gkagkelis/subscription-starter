// ============================================================
// Κατάλογος πρόσθετων πηγών: επίσημα ανοιχτά δεδομένα (συνδεδεμένα),
// δεδομένα ερευνητικής χρήσης (ιδιωτικά), πηγές που απαιτούν εγγραφή
// (ο χρήστης κατεβάζει), δημοσιευμένα νούμερα μόνο για σύγκριση.
// Τεκμηρίωση/πηγές: docs/synthetic-lab/research/.
// ============================================================

import popJson from './official/eurostat-population-2025.json';
import ictJson from './official/eurostat-ict.json';
import eduJson from './official/eurostat-education-2025.json';
import { BCS } from './ec-bcs';
import { CONSUMER_CONTEXT } from './consumer-context';
import silcJson from './official/eurostat-silc.json';
import { licenseMode, researchDatasets, researchQuestions } from './research';
import type { DatasetMeta } from '../types';

const EUROSTAT_LICENSE = 'Eurostat — CC BY 4.0 (Απόφαση 2011/833/ΕΕ)· επαναχρησιμοποίηση με αναφορά πηγής';

function base(p: Partial<DatasetMeta> & Pick<DatasetMeta, 'id' | 'name' | 'organization'>): DatasetMeta {
  return {
    sourceUrl: null,
    collectionYears: null,
    publicationDate: null,
    importedAt: null,
    kind: 'aggregate_survey',
    recordCount: null,
    recordUnit: '—',
    variables: [],
    weights: '—',
    license: '—',
    licenseVerified: false,
    commercialUse: 'unclear',
    restrictions: [],
    usage: 'not_connected',
    usageNote: '',
    validationStatus: 'not_applicable',
    storage: '—',
    ...p
  };
}

export function officialDatasets(): DatasetMeta[] {
  const pop = popJson as any;
  const ict = ictJson as any;
  const edu = eduJson as any;
  const silc = silcJson as any;
  const silcYears = Array.from(new Set((silc.metrics || []).flatMap((m: any) => m.waves.map((w: any) => w.year)))) as number[];
  const ictYears = Array.from(new Set((ict.metrics || []).flatMap((m: any) => m.waves.map((w: any) => w.year)))) as number[];
  return [
    base({
      id: 'eurostat-demo_r_pjangroup-2025',
      name: 'Πληθυσμός 1/1/2025 ανά περιφέρεια, ηλικία, φύλο (Eurostat/ΕΛΣΤΑΤ)',
      organization: 'Eurostat (δεδομένα ΕΛΣΤΑΤ)',
      sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/demo_r_pjangroup/default/table',
      collectionYears: [2025, 2025],
      importedAt: pop.fetchedAt || null,
      kind: 'calibration_targets',
      recordCount: Object.keys(pop.cells || {}).length || null,
      recordUnit: 'κελιά περιφέρεια × ηλικιακή ζώνη × φύλο',
      variables: [{ name: 'περιφέρεια (NUTS2) × ηλικία × φύλο', description: 'Αριθμός κατοίκων 1/1/2025' }],
      weights: '—',
      license: EUROSTAT_LICENSE,
      licenseVerified: true,
      commercialUse: 'allowed_with_attribution',
      usage: 'used',
      usageNote: 'Βαθμονόμηση (raking) του πληθυσμού GLOPOP-S 2015 σε επίσημα σύνολα 2025.',
      storage: 'lib/synthetic-lab/data/official/eurostat-population-2025.json',
      tier: 'open'
    }),
    base({
      id: edu.datasetId,
      name: `Μορφωτικό επίπεδο ανά ηλικία και φύλο ${edu.year} (Eurostat/ΕΛΣΤΑΤ, Έρευνα Εργατικού Δυναμικού)`,
      organization: 'Eurostat (δεδομένα ΕΛΣΤΑΤ)',
      sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/edat_lfs_9901/default/table',
      collectionYears: [edu.year, edu.year],
      importedAt: edu.fetchedAt || null,
      kind: 'calibration_targets',
      recordCount: Object.keys(edu.cells || {}).length,
      recordUnit: 'κελιά ηλικιακή ζώνη × φύλο × ISCED (0-2 / 3-4 / 5-8), άτομα 15-74 σε ιδιωτικά νοικοκυριά',
      variables: [{ name: 'ηλικία × φύλο × ISCED 2011', description: 'Χιλιάδες άτομα' }],
      weights: '—',
      license: EUROSTAT_LICENSE,
      licenseVerified: true,
      commercialUse: 'allowed_with_attribution',
      restrictions: ['Οι 75+ δεν καλύπτονται: για αυτούς χρησιμοποιείται η ίδια γενιά στο GLOPOP 2015 (τότε 65+).', 'Μέσα στο ISCED 0-2 η αναλογία δημοτικό/γυμνάσιο παραμένει του 2015.'],
      usage: 'used',
      usageNote: 'Βαθμονόμηση της μόρφωσης του πληθυσμού (ηλικία × φύλο × μόρφωση) και περιθώρια επαναστάθμισης της διαΝΕΟσις.',
      storage: `lib/synthetic-lab/data/official/eurostat-education-${edu.year}.json`,
      tier: 'open'
    }),
    base({
      id: BCS.datasetId,
      name: 'Έρευνα Καταναλωτών ΕΕ (DG ECFIN / ΙΟΒΕ) — οικονομικό κλίμα ανά εισόδημα, μόρφωση, ηλικία, φύλο',
      organization: 'Ευρωπαϊκή Επιτροπή, DG ECFIN· στην Ελλάδα ΙΟΒΕ',
      sourceUrl: BCS.url,
      collectionYears: [Number(BCS.latestMonth.slice(0, 4)) - 2, Number(BCS.latestMonth.slice(0, 4))],
      publicationDate: `μηνιαία· τελευταίος μήνας ${BCS.latestMonth}`,
      importedAt: BCS.fetchedAt,
      recordCount: BCS.indicators.length,
      recordUnit: 'μηνιαίοι δείκτες (ισοζύγια −100..+100) × 14 ομάδες, τελευταίοι 36 μήνες',
      variables: BCS.indicators.map((i) => ({ name: i.id, description: i.label })),
      weights: 'Εποχικά διορθωμένα ισοζύγια της Επιτροπής.',
      license: BCS.license,
      licenseVerified: true,
      commercialUse: 'allowed_with_attribution',
      restrictions: ['Ισοζύγια (θετικές μείον αρνητικές απαντήσεις), ΟΧΙ ποσοστά: δεν μετατρέπονται σε πιθανότητες απάντησης.', 'Οι ομάδες αντιστοιχίζονται προσεγγιστικά (π.χ. πεμπτημόρια GLOPOP → τεταρτημόρια εισοδήματος).'],
      usage: 'used',
      usageNote: 'Πλαίσιο οικονομικού κλίματος σε καταναλωτικές μελέτες και σχετικές διαφορές ομάδων στην παραδοχή «Πρόθεση αγοράς ανάλογη με το οικονομικό κλίμα της ομάδας».',
      storage: 'lib/synthetic-lab/data/official/ec-bcs-consumer-greece.json',
      tier: 'open'
    }),
    base({
      id: 'eurostat-silc',
      name: 'EU-SILC — οικονομική δυσκολία νοικοκυριών (Eurostat/ΕΛΣΤΑΤ)',
      organization: 'Eurostat (δεδομένα ΕΛΣΤΑΤ, Έρευνα Εισοδήματος και Συνθηκών Διαβίωσης)',
      sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/ilc_mdes04/default/table',
      collectionYears: silcYears.length ? [Math.min(...silcYears), Math.max(...silcYears)] : null,
      importedAt: silc.fetchedAt || null,
      recordCount: (silc.metrics || []).length,
      recordUnit: 'δείκτες (% ατόμων) ανά τύπο νοικοκυριού × κίνδυνο φτώχειας',
      variables: (silc.metrics || []).map((m: any) => ({ name: m.metric, description: m.label })),
      weights: 'Επίσημα σταθμισμένα ποσοστά· n ανά κελί δεν δημοσιεύεται.',
      license: EUROSTAT_LICENSE,
      licenseVerified: true,
      commercialUse: 'allowed_with_attribution',
      restrictions: ['Ο κίνδυνος φτώχειας (κάτω από 60% του διάμεσου εισοδήματος) αντιστοιχίζεται στο χαμηλότερο πεμπτημόριο GLOPOP.', 'Ο αριθμός εξαρτώμενων παιδιών εκτιμάται από το μέγεθος νοικοκυριού.'],
      usage: 'used',
      usageNote: 'Empirical priors (σχήμα eurostat_silc) για ερωτήσεις οικονομικής δυσκολίας και οφειλών· τράπεζα ερωτήσεων· backtests ανά έτος.',
      validationStatus: 'partially_validated',
      storage: 'lib/synthetic-lab/data/official/eurostat-silc.json',
      tier: 'open'
    }),
    base({
      id: CONSUMER_CONTEXT.datasetIds.ces,
      name: 'ΕΚΤ — Consumer Expectations Survey (Ελλάδα): πληθωρισμός και δαπάνες νοικοκυριών',
      organization: 'Ευρωπαϊκή Κεντρική Τράπεζα',
      sourceUrl: CONSUMER_CONTEXT.ces.url,
      collectionYears: [2024, 2026],
      importedAt: CONSUMER_CONTEXT.fetchedAt,
      recordCount: Object.keys(CONSUMER_CONTEXT.ces.indicators).length,
      recordUnit: 'μηνιαίοι δείκτες (σταθμισμένες διάμεσοι), μόνο σύνολο Ελλάδας',
      license: CONSUMER_CONTEXT.ces.license,
      licenseVerified: false,
      commercialUse: 'allowed_with_attribution',
      restrictions: ['Συγκεντρωτικά: χωρίς ανάλυση ανά ομάδα για την Ελλάδα (τα μικροδεδομένα είναι μόνο για επιστημονική χρήση).'],
      usage: 'used',
      usageNote: 'Πλαίσιο (προσδοκίες πληθωρισμού/δαπανών) στις αναφορές καταναλωτικών μελετών.',
      storage: 'lib/synthetic-lab/data/official/consumer-context.json',
      tier: 'open'
    }),
    base({
      id: CONSUMER_CONTEXT.datasetIds.hbs,
      name: `Έρευνα Οικογενειακών Προϋπολογισμών ${CONSUMER_CONTEXT.hbs.year} — δομή δαπάνης ανά εισοδηματικό πεμπτημόριο (Eurostat/ΕΛΣΤΑΤ)`,
      organization: 'Eurostat (δεδομένα ΕΛΣΤΑΤ)',
      sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/hbs_str_t223/default/table',
      collectionYears: [CONSUMER_CONTEXT.hbs.year, CONSUMER_CONTEXT.hbs.year],
      importedAt: CONSUMER_CONTEXT.fetchedAt,
      recordCount: Object.keys(CONSUMER_CONTEXT.hbs.categories).length,
      recordUnit: 'κατηγορίες COICOP × 5 πεμπτημόρια (‰ της δαπάνης)',
      license: EUROSTAT_LICENSE,
      licenseVerified: true,
      commercialUse: 'allowed_with_attribution',
      restrictions: ['Τελευταίο ευρωπαϊκό κύμα 2020· η ΕΛΣΤΑΤ δημοσιεύει νεότερη έρευνα (2024) σε δικούς της πίνακες.'],
      usage: 'used',
      usageNote: 'Πλαίσιο: μερίδιο δαπάνης για τη σχετική κατηγορία ανά εισόδημα, στις αναφορές καταναλωτικών μελετών.',
      storage: 'lib/synthetic-lab/data/official/consumer-context.json',
      tier: 'open'
    }),
    base({
      id: 'eurostat-isoc-ict',
      name: 'Έρευνα χρήσης ΤΠΕ από νοικοκυριά/άτομα — online αγορές & συνδρομές (Eurostat/ΕΛΣΤΑΤ)',
      organization: 'Eurostat (δεδομένα ΕΛΣΤΑΤ)',
      sourceUrl: 'https://ec.europa.eu/eurostat/databrowser/view/isoc_ec_ibgs/default/table',
      collectionYears: ictYears.length ? [Math.min(...ictYears), Math.max(...ictYears)] : null,
      importedAt: ict.fetchedAt || null,
      recordCount: (ict.metrics || []).length,
      recordUnit: 'δείκτες συμπεριφοράς (ποσοστό ατόμων 16-74) ανά ηλικία×φύλο, μόρφωση, αστικότητα',
      variables: (ict.metrics || []).slice(0, 20).map((m: any) => ({ name: m.metric, description: m.label })),
      weights: 'Επίσημα σταθμισμένα ποσοστά· n ανά κελί δεν δημοσιεύεται.',
      license: EUROSTAT_LICENSE,
      licenseVerified: true,
      commercialUse: 'allowed_with_attribution',
      restrictions: ['Πληθυσμός 16-74: οι 75+ λαμβάνουν προέκταση της ζώνης 65-74.', 'Κελιά με σημαία «u» (χαμηλή αξιοπιστία) εξαιρούνται.'],
      usage: 'used',
      usageNote: 'Empirical priors για ερωτήσεις καταναλωτικής συμπεριφοράς + backtests ανά έτος.',
      validationStatus: 'partially_validated',
      storage: 'lib/synthetic-lab/data/official/eurostat-ict.json',
      tier: 'open'
    })
  ];
}

export function researchTierDatasets(): DatasetMeta[] {
  const loaded = researchDatasets();
  const dn = loaded.find((d) => d.datasetId.startsWith('dianeosis-tpe'));
  const mode = licenseMode();
  const qs = dn ? researchQuestions().filter((q) => q.datasetId === dn.datasetId) : [];
  const years = dn?.years || Array.from(new Set(qs.flatMap((q) => q.years || []))).sort();
  const multi = qs.filter((q) => (q.years?.length || 0) >= 2).length;
  return [
    base({
      id: dn?.datasetId || 'dianeosis-tpe',
      name: 'διαΝΕΟσις — «Τι πιστεύουν οι Έλληνες» 2017–2024 (μικροδεδομένα, μη πολιτικές ερωτήσεις)',
      organization: 'διαΝΕΟσις (έρευνα πεδίου Metron Analysis / MRB ανά κύμα)',
      sourceUrl: 'https://www.dianeosis.org/research/ti-pistevoun-oi-ellines/',
      collectionYears: years.length ? [Math.min(...years), Math.max(...years)] : [2017, 2024],
      importedAt: dn?.importedAt || null,
      recordCount: dn ? qs.length : null,
      recordUnit: `ερωτήσεις (${multi} σε ≥2 κύματα)· κύματα ${years.join(', ') || '2017–2024'}, ~1.000–2.500 ερωτώμενοι ανά μέρος`,
      variables: [
        { name: 'Αξίες, θεσμοί, κλιματική αλλαγή, τεχνολογία/ΤΝ, οικονομία, φορολογία, παιδεία, μετανάστευση, φύλο, θρησκεία', description: 'Ερωτήσεις κλειστού τύπου (2-12 επιλογές)' },
        { name: 'Ομάδες', description: 'ηλικία×φύλο, μόρφωση, περιφέρεια (όπου το αρχείο έχει τις 13 περιφέρειες)' },
        { name: 'Εξαιρούνται', description: 'Ψήφος, κόμματα, αυτοτοποθέτηση, αξιολόγηση πολιτικών/δημόσιων προσώπων' }
      ],
      weights: 'Βάρος της πηγής ανά κύμα (x1, sta2, WEIGHT, sexage3weight), επαναστάθμισμένο (raking) σε ηλικία×φύλο, μόρφωση, περιφέρεια του πληθυσμού 15+ (τα δείγματα υπερ-αντιπροσωπεύουν αποφοίτους ανώτατης).',
      license: '© διαΝΕΟσις — χωρίς ανοιχτή άδεια δεδομένων· μη εμπορική ερευνητική χρήση με αναφορά πηγής',
      licenseVerified: false,
      commercialUse: 'not_allowed',
      restrictions: [
        'ΜΟΝΟ ΓΙΑ ΕΡΕΥΝΗΤΙΚΗ ΧΡΗΣΗ — για εμπορικό προϊόν απαιτείται γραπτή άδεια της διαΝΕΟσις.',
        'Δεν αναδιανέμεται: μένει στον ιδιωτικό φάκελο .synthetic-lab-data/research (εκτός repo).',
        'Η σύνδεση ερωτήσεων μεταξύ κυμάτων είναι αυτόματη (ίδιες επιλογές + ομοιότητα κειμένου)· η διατύπωση μπορεί να διαφέρει ελαφρά.',
        mode === 'commercial' ? 'Απενεργοποιημένο: SYNTHETIC_LAB_LICENSE_MODE=commercial.' : ''
      ].filter(Boolean),
      usage: dn && mode === 'research' ? 'used' : 'not_connected',
      usageNote: dn
        ? 'Τράπεζα ερωτήσεων με εμπειρική βάση (κοινωνικές στάσεις)· προτάσεις στον planner· backtests σε held-out κύμα για ερωτήσεις που επαναλαμβάνονται.'
        : 'Δεν έχει εισαχθεί τοπικά.',
      validationStatus: multi ? 'partially_validated' : 'not_validated',
      howToConnect:
        'Κατέβασε τα αρχεία SPSS κάθε κύματος από τη σελίδα της έρευνας στο .synthetic-lab-data/raw/dianeosis/<έτος>/ (αποσυμπιεσμένα στο unz/), τρέξε `npx tsx scripts/synthetic-lab/export-population-margins.ts` και `python scripts/synthetic-lab/import_dianeosis.py --raw .synthetic-lab-data/raw/dianeosis --margins … --out .synthetic-lab-data/research/dianeosis-tpe.json`.',
      storage: '.synthetic-lab-data/research/dianeosis-tpe.json (ιδιωτικό, gitignored)',
      tier: 'research_only'
    })
  ];
}

/** Πηγές που απαιτούν εγγραφή ή δεν έχουν ακόμη συνδεθεί. */
export function catalogDatasets(): DatasetMeta[] {
  const reg = (p: Partial<DatasetMeta> & Pick<DatasetMeta, 'id' | 'name' | 'organization' | 'howToConnect'>) =>
    base({ tier: 'registration', commercialUse: 'not_allowed', usageNote: 'Δωρεάν για μη εμπορική έρευνα μετά από εγγραφή· δεν έχει συνδεθεί.', ...p });
  const cite = (p: Partial<DatasetMeta> & Pick<DatasetMeta, 'id' | 'name' | 'organization'>) =>
    base({
      tier: 'cite_only',
      usage: 'validation_only',
      commercialUse: 'not_allowed',
      license: 'Πνευματικά δικαιώματα του εκδότη· χρήση μόνο ως αναφορά/στόχος σύγκρισης',
      usageNote: 'Δημοσιευμένα συνολικά νούμερα για σύγκριση (sanity check) — δεν τροφοδοτούν το μοντέλο.',
      ...p
    });
  return [
    reg({
      id: 'ess-greece',
      name: 'European Social Survey (ESS) — Ελλάδα, γύροι 10 (2021/22) και 11 (2023/24)',
      organization: 'ESS ERIC / ΕΚΚΕ',
      sourceUrl: 'https://ess.sikt.no/',
      collectionYears: [2021, 2024],
      license: 'CC BY-NC-SA 4.0 (δεδομένα)',
      licenseVerified: true,
      recordUnit: 'μικροδεδομένα, ~2.800 ερωτώμενοι (γύρος 10)',
      howToConnect: 'Λογαριασμός στο ess.sikt.no → λήψη CSV/SPSS του γύρου 11 (Ελλάδα) → αποθήκευση στο .synthetic-lab-data/raw/ess/. Το API χρειάζεται το userId του λογαριασμού.'
    }),
    reg({
      id: 'wvs7-greece',
      name: 'World Values Survey, κύμα 7 — Ελλάδα 2017',
      organization: 'WVS Association (διαΝΕΟσις/ΕΚΚΕ στην Ελλάδα)',
      sourceUrl: 'https://www.worldvaluessurvey.org/WVSDocumentationWV7.jsp',
      collectionYears: [2017, 2017],
      license: 'WVS Conditions of use: μη κερδοσκοπική χρήση, χωρίς αναδιανομή',
      licenseVerified: true,
      recordUnit: 'μικροδεδομένα, n=1.200',
      howToConnect: 'Φόρμα εγγραφής στο worldvaluessurvey.org → λήψη αρχείου κύματος 7 → .synthetic-lab-data/raw/wvs/.'
    }),
    reg({
      id: 'gesis-eb-evs-issp',
      name: 'Eurobarometer (μικροδεδομένα), EVS 2017 (ZA7546), ISSP — Ελλάδα',
      organization: 'GESIS Data Archive',
      sourceUrl: 'https://search.gesis.org/',
      collectionYears: [2017, 2025],
      license: 'Όροι GESIS: επιστημονική χρήση',
      recordUnit: 'μικροδεδομένα, ~1.000 ανά κύμα EB',
      howToConnect: 'Λογαριασμός GESIS → λήψη ZA αρχείων (π.χ. ZA9130 EB 104.1, ZA7546 EVS Ελλάδα) → .synthetic-lab-data/raw/gesis/.'
    }),
    reg({
      id: 'share-greece',
      name: 'SHARE — Έρευνα Υγείας, Γήρανσης και Συνταξιοδότησης (Ελλάδα, 50+)',
      organization: 'SHARE-ERIC',
      sourceUrl: 'https://share-eric.eu/data/data-access',
      license: 'Όροι SHARE: επιστημονική χρήση, δήλωση χρήστη',
      recordUnit: 'μικροδεδομένα πάνελ 50+',
      howToConnect: 'Αίτηση χρήστη στο share-eric.eu (υπογεγραμμένη δήλωση) → λήψη κυμάτων → .synthetic-lab-data/raw/share/.'
    }),
    reg({
      id: 'ecb-ces-microdata',
      name: 'ECB Consumer Expectations Survey — μικροδεδομένα (Ελλάδα από 12/2023)',
      organization: 'Ευρωπαϊκή Κεντρική Τράπεζα',
      sourceUrl: 'https://www.ecb.europa.eu/stats/ecb_surveys/consumer_exp_survey/html/data_methodological.en.html',
      collectionYears: [2023, 2026],
      license: 'Μόνο επιστημονικοί σκοποί, όχι εμπορική χρήση',
      recordUnit: 'μικροδεδομένα, ~960 Έλληνες/μήνα',
      howToConnect: 'Αποδοχή όρων στη σελίδα της ECB → λήψη τριμηνιαίων αρχείων → .synthetic-lab-data/raw/ecb-ces/.'
    }),
    cite({
      id: 'eett-unlimited-2023',
      name: 'ΕΕΤΤ — Έρευνα χρήσης απεριόριστων πακέτων δεδομένων κινητής (Δεκ. 2023)',
      organization: 'ΕΕΤΤ',
      sourceUrl: 'https://www.eett.gr/en/consumers/competion/market-studies-research/',
      collectionYears: [2023, 2023],
      recordUnit: 'n=1.005, χρήστες smartphone 18-65',
      restrictions: ['Μηνιαίο κόστος (χρήστες απεριόριστων): έως 20€ 6%, 21-25€ 17%, >25€ 70%, ΔΓ 7%.']
    }),
    cite({
      id: 'eltrun-ecommerce-2026',
      name: 'GR.EC.A./ELTRUN (ΟΠΑ) — Έρευνα Ηλεκτρονικού Εμπορίου 2026',
      organization: 'GR.EC.A. / ELTRUN',
      collectionYears: [2026, 2026],
      recordUnit: 'n=600 online αγοραστές (online ερωτηματολόγιο)',
      restrictions: ['Δείγμα μόνο online αγοραστών — όχι γενικός πληθυσμός.']
    }),
    cite({
      id: 'ielka-2026',
      name: 'ΙΕΛΚΑ — Έρευνες καταναλωτών 2026',
      organization: 'Ινστιτούτο Έρευνας Λιανεμπορίου Καταναλωτικών Αγαθών',
      collectionYears: [2026, 2026],
      recordUnit: 'n≈800 (Μάρτιος 2026), δελτία τύπου'
    }),
    cite({
      id: 'datareportal-2026',
      name: 'DataReportal — Digital 2026: Greece',
      organization: 'Kepios / We Are Social / Meltwater',
      sourceUrl: 'https://datareportal.com/reports/digital-2026-greece',
      collectionYears: [2025, 2025],
      license: '© Kepios — επαναχρησιμοποίηση μόνο με άδεια'
    }),
    cite({
      id: 'nielseniq-h1-2026',
      name: 'NielsenIQ — Λιανική FMCG, Α΄ εξάμηνο 2026 (δελτία τύπου)',
      organization: 'NielsenIQ Greece',
      collectionYears: [2026, 2026],
      tier: 'paid',
      license: 'Συνδρομητικά δεδομένα· δημόσια μόνο τα δελτία τύπου'
    })
  ];
}
