// ============================================================
// Data registry: κάθε dataset με πηγή, χρονολογίες, άδεια, χρήση.
// Δεν συγχέουμε έτος συλλογής με έτος δημοσίευσης. Δημόσια διαθέσιμο
// ≠ ελεύθερο για εμπορική χρήση.
// ============================================================

import { existsSync, readdirSync, readFileSync } from 'fs';
import path from 'path';
import { dataRoot } from '../storage/paths';
import type { DatasetMeta } from '../types';
import { PRIORS } from './noraya';
import { GLOPOP_DOI, GLOPOP_GREECE_TOTALS } from '../population/glopop-schema';
import bundled from './populations/glopop-grc-2015-sample.json';
import { catalogDatasets, officialDatasets, researchTierDatasets } from './registry-catalog';

const EB_LICENSE_NOTE =
  'Τα δεδομένα Eurobarometer διανέμονται από το GESIS Data Archive· οι όροι επαναχρησιμοποίησης (ιδίως εμπορικής) πρέπει να επιβεβαιωθούν για τα πρωτογενή αρχεία. Το repository δεν τεκμηριώνει ποιες «ελληνικές έρευνες» περιλαμβάνονται ούτε την άδειά τους.';

export function builtInDatasets(): DatasetMeta[] {
  const meta = PRIORS.meta;
  const b = bundled as any;
  return [
    {
      id: 'noraya-public-opinion',
      name: 'NORAYA — Κοινή γνώμη ανά κοινωνική ομάδα (public_opinion.csv)',
      organization: 'Συλλογή NORAYA· πηγή: «Eurobarometer + Greek surveys»',
      sourceUrl: null,
      collectionYears: [2000, 2025],
      publicationDate: null,
      importedAt: null,
      kind: 'aggregate_survey',
      recordCount: meta.rows,
      recordUnit: 'συγκεντρωτικές γραμμές (δείκτης × ομάδα × κύμα)',
      variables: [
        { name: 'metric', description: '18 δείκτες (εμπιστοσύνη, ικανοποίηση δημοκρατίας, οικονομικές προσδοκίες, κύρια προβλήματα χώρας, αυτοτοποθέτηση)' },
        { name: 'group_type / group', description: 'ΜΙΑ διάσταση κάθε φορά: ηλικία, φύλο, μόρφωση, επάγγελμα, οικονομική πίεση, κοινωνική τάξη ή σύνολο' },
        { name: 'value_weighted_0_100', description: 'Σταθμισμένο ποσοστό 0-100' },
        { name: 'n_valid_weighted', description: 'Σταθμισμένο έγκυρο n' },
        { name: 'survey_year / survey_quarter', description: 'Κύμα έρευνας (Q2/Q4)' }
      ],
      weights: 'Τιμές ήδη σταθμισμένες· βάρη σε επίπεδο ατόμου ΔΕΝ υπάρχουν.',
      license: 'Άγνωστη / μη τεκμηριωμένη',
      licenseVerified: false,
      commercialUse: 'unclear',
      restrictions: [
        'Συγκεντρωτικά ποσοστά — όχι ατομικές απαντήσεις, όχι διασταυρώσεις.',
        'Ο δείκτης left_right_placement εξαιρείται (πολιτικός προσανατολισμός).',
        `Διπλές μετρήσεις στο ίδιο κύμα: συνδυάζονται με στάθμιση n· ${countInconsistent()} κελιά ασυμβατότητας σημειώθηκαν.`,
        EB_LICENSE_NOTE
      ],
      usage: 'used',
      usageNote: 'Empirical priors για ερωτήσεις συνδεδεμένες με δείκτη + δεδομένα επικύρωσης (held-out κύματα).',
      validationStatus: 'not_applicable',
      sourceHash: meta.sourceSha256,
      storage: 'public/noraya-data/public_opinion.csv (υπάρχον αρχείο NORAYA, ανάγνωση μόνο) → lib/synthetic-lab/data/noraya-priors.generated.json'
    },
    {
      id: 'noraya-vote-intention',
      name: 'NORAYA — Πρόθεση ψήφου (vote_intention.csv)',
      organization: 'Συλλογή NORAYA',
      sourceUrl: null,
      collectionYears: [2018, 2022],
      publicationDate: null,
      importedAt: null,
      kind: 'aggregate_survey',
      recordCount: 3677,
      recordUnit: 'συγκεντρωτικές γραμμές',
      variables: [{ name: 'party / group / vote_share_weighted_valid', description: 'Ποσοστά πρόθεσης ψήφου ανά ομάδα' }],
      weights: 'Σταθμισμένα ποσοστά',
      license: 'Άγνωστη',
      licenseVerified: false,
      commercialUse: 'unclear',
      restrictions: ['366 γραμμές χωρίς έτος/τρίμηνο (δεν χρησιμοποιούνται).', 'Πολλές έρευνες ανά τρίμηνο χωρίς κωδικό έρευνας.'],
      usage: 'used',
      usageNote: 'Τεκμηρίωση για ερωτήσεις πρόθεσης ψήφου (12 κόμματα, 5 τρίμηνα 2018–2022). Το σύνολο είναι παράγωγο από τις ομάδες φύλου· μόνο εσωτερική χρήση (άγνωστη άδεια).',
      validationStatus: 'not_validated',
      storage: 'public/noraya-data/vote_intention.csv → lib/synthetic-lab/data/political-priors.generated.json'
    },
    {
      id: 'noraya-leader-traits',
      name: 'NORAYA — Αξιολογήσεις πολιτικών αρχηγών (leader_traits.csv)',
      organization: 'Συλλογή NORAYA',
      sourceUrl: null,
      collectionYears: [2018, 2022],
      publicationDate: null,
      importedAt: null,
      kind: 'aggregate_survey',
      recordCount: 5789,
      recordUnit: 'συγκεντρωτικές γραμμές',
      variables: [{ name: 'metric_name / response_option', description: 'Χαρακτηριστικά και αξιολογήσεις πολιτικών προσώπων' }],
      weights: 'Σταθμισμένα ποσοστά',
      license: 'Άγνωστη',
      licenseVerified: false,
      commercialUse: 'unclear',
      restrictions: ['952 γραμμές χωρίς έτος/τρίμηνο (δεν χρησιμοποιούνται).', 'Χωρίς μέγεθος δείγματος ανά κελί.'],
      usage: 'used',
      usageNote: 'Τεκμηρίωση για ερωτήσεις αρχηγών (καταλληλότερος πρωθυπουργός, έγκριση, χαρακτηριστικά, ευθύνη). Η πηγή δεν δίνει n· μόνο εσωτερική χρήση (άγνωστη άδεια).',
      validationStatus: 'not_validated',
      storage: 'public/noraya-data/leader_traits.csv → lib/synthetic-lab/data/political-priors.generated.json'
    },
    {
      id: 'noraya-data-index',
      name: 'NORAYA — Ευρετήριο θεμάτων (noraya_data_index.json)',
      organization: 'Παράγωγο του public_opinion.csv (NORAYA)',
      sourceUrl: null,
      collectionYears: [2000, 2025],
      publicationDate: null,
      importedAt: null,
      kind: 'aggregate_survey',
      recordCount: null,
      recordUnit: '7 θέματα + 3 δείκτες εμπιστοσύνης',
      variables: [{ name: 'topics / trust', description: 'Τάσεις και «recent» τιμές (μέσος όρος 2022-2024)' }],
      weights: '—',
      license: 'Όπως η πηγή',
      licenseVerified: false,
      commercialUse: 'unclear',
      restrictions: ['Παράγωγο με μέσους όρους ετών — δεν χρησιμοποιείται για να μη μετρηθούν τα ίδια δεδομένα δύο φορές.'],
      usage: 'excluded',
      usageNote: 'Το Lab διαβάζει απευθείας την πρωτογενή μορφή (public_opinion.csv).',
      validationStatus: 'not_applicable',
      storage: 'lib/noraya/noraya_data_index.json'
    },
    {
      id: 'glopop-s-grc-2015',
      name: 'GLOPOP-S — Συνθετικός πληθυσμός Ελλάδας (2015)',
      organization: 'Vrije Universiteit Amsterdam, IVM (Ton et al.) — Harvard Dataverse',
      sourceUrl: GLOPOP_DOI,
      collectionYears: [2015, 2015],
      publicationDate: '2026-01-13 (έκδοση 5.0)',
      importedAt: b?.summary?.createdAt || null,
      kind: 'synthetic_population',
      recordCount: GLOPOP_GREECE_TOTALS.individuals,
      recordUnit: `συνθετικά άτομα (${GLOPOP_GREECE_TOTALS.households.toLocaleString('el-GR')} νοικοκυριά, 13 περιφέρειες)· στο repo: δείγμα ${b?.rows?.length || 0}`,
      variables: [
        { name: 'AGE', description: 'Ζώνες 0-4, 5-14, 15-24, …, 65+' },
        { name: 'GENDER', description: 'Άνδρας/Γυναίκα' },
        { name: 'EDUC', description: '5 επίπεδα (έως ανώτατη)' },
        { name: 'INCOME', description: 'Εισοδηματικό πεμπτημόριο' },
        { name: 'RURAL', description: 'Αστική/αγροτική' },
        { name: 'HHTYPE, HHSIZE_CAT, RELATE_HEAD, HID', description: 'Νοικοκυριό' }
      ],
      weights: 'Ο πλήρης πληθυσμός είναι 1:1 με τον πραγματικό· στο δείγμα βάρος = άτομα περιφέρειας / δείγμα περιφέρειας.',
      license: 'CC BY 4.0 (δεδομένα)· ο κώδικας του repository δεν έχει άδεια (δεν χρησιμοποιείται)',
      licenseVerified: true,
      commercialUse: 'allowed_with_attribution',
      restrictions: [
        'Έτος αναφοράς 2015 — ΟΧΙ πληθυσμός 2026.',
        'Χωρίς απασχόληση/επάγγελμα· χωρίς πλούτο για την Ελλάδα.',
        'Πιθανή αντιστροφή πληθυσμών Βορείου/Νοτίου Αιγαίου στην πηγή.',
        'Τα πλήρη αρχεία μένουν ιδιωτικά (.synthetic-lab-data, gitignored).'
      ],
      usage: 'used',
      usageNote: 'Βάση συνθετικών προφίλ.',
      validationStatus: 'partially_validated',
      storage: 'lib/synthetic-lab/data/populations/glopop-grc-2015-sample.json (δείγμα) + .synthetic-lab-data/raw/glopop (πλήρη, ιδιωτικά)'
    },
    {
      id: 'dimoskopiseis-live',
      name: 'Ζωντανές δημοσκοπήσεις (dimoskopiseis.gr, μέσω NORAYA)',
      organization: 'Τρίτος ιστότοπος',
      sourceUrl: 'https://dimoskopiseis.gr/',
      collectionYears: null,
      publicationDate: null,
      importedAt: null,
      kind: 'aggregate_survey',
      recordCount: null,
      recordUnit: '—',
      variables: [],
      weights: '—',
      license: 'Άγνωστη (scraping τρίτου ιστότοπου)',
      licenseVerified: false,
      commercialUse: 'unclear',
      restrictions: ['Εκλογικά δεδομένα τρίτων.'],
      usage: 'excluded',
      usageNote: 'Εκτός χρήσης στο Lab.',
      validationStatus: 'not_applicable',
      storage: '—'
    }
  ];
}

function countInconsistent(): number {
  let c = 0;
  Object.values(PRIORS.metrics).forEach((m) =>
    m.waves.forEach((w) => Object.values(w.groups).forEach((g) => Object.values(g).forEach((cell) => cell.inconsistent && c++)))
  );
  return c;
}

/** Datasets που εισήγαγε ο χρήστης (ιδιωτικά). */
export function importedDatasets(): DatasetMeta[] {
  const dir = path.join(dataRoot(), 'datasets');
  if (!existsSync(dir)) return [];
  return readdirSync(dir)
    .filter((f) => f.endsWith('.meta.json'))
    .map((f) => JSON.parse(readFileSync(path.join(dir, f), 'utf8')) as DatasetMeta);
}

export function allDatasets(): DatasetMeta[] {
  return [...builtInDatasets(), ...officialDatasets(), ...researchTierDatasets(), ...importedDatasets(), ...catalogDatasets()];
}

/** Φρεσκάδα πηγής σε σχέση με σήμερα. */
export function freshness(meta: DatasetMeta, now = new Date()): { ageYears: number | null; level: 'fresh' | 'aging' | 'stale' | 'unknown'; label: string } {
  if (!meta.collectionYears) return { ageYears: null, level: 'unknown', label: 'Άγνωστο έτος συλλογής' };
  const age = now.getFullYear() - meta.collectionYears[1];
  if (age <= 2) return { ageYears: age, level: 'fresh', label: `Πρόσφατο (τελευταία συλλογή ${meta.collectionYears[1]})` };
  if (age <= 5) return { ageYears: age, level: 'aging', label: `Παλαιώνει (${age} έτη από τη συλλογή)` };
  return { ageYears: age, level: 'stale', label: `Παλαιό (${age} έτη από τη συλλογή)` };
}
