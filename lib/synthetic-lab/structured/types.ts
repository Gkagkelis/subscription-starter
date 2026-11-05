// Προδιαγραφή δομημένης μελέτης για τον γρήγορο στατιστικό μηχανισμό (structured engine).
import type { EvidenceClass } from './evidence-class';

export interface Effect {
  /** Επιλογή στην οποία εφαρμόζεται (nominal/multi). Για ordinal/extra αγνοείται. */
  code?: string;
  /** Συνθήκη (έκφραση)· αν λείπει, ισχύει πάντα. */
  when?: string;
  /** Σταθερή μετατόπιση (λογιστική ή λανθάνουσα κλίμακα). */
  shift?: number;
  /** Αριθμητική μεταβλητή (έκφραση) × coef, κεντραρισμένη στο center. */
  var?: string;
  coef?: number;
  center?: number;
  /** Αναφορά σε δηλωμένη παραδοχή (για τον εσωτερικό φάκελο). */
  assumption?: string;
}

export interface OptionSpec { code: string; label: string; exclusive?: boolean }

export type QuestionModel =
  | { kind: 'profile'; attribute: string; map: Record<string, string> }
  | {
      kind: 'nominal';
      base: Record<string, number>;
      effects?: Effect[];
      /** Σταθερή πιθανότητα για επιλογή από έκφραση (π.χ. μέτρηση Eurostat ανά πρόσωπο). */
      probFrom?: { code: string; expr: string }[];
      /** Εμπειρικό κάτω όριο: P(code) ≥ expr (ελάχιστη αλλαγή, καταγραφή αν ενεργοποιήθηκε). */
      lowerBounds?: { code: string; expr: string }[];
    }
  | {
      kind: 'ordinal';
      /** Κωδικοί κλίμακας από το χαμηλότερο στο υψηλότερο. */
      scale: string[];
      /** Μερίδια βάσης της κλίμακας (σενάριο), ίδιο μήκος με scale. */
      base: number[];
      loadings?: Record<string, number>;
      effects?: Effect[];
      /** Επιλογές εκτός κλίμακας (π.χ. «Δεν γνωρίζω»), με δική τους πιθανότητα. */
      extra?: { code: string; base: number; effects?: Effect[] }[];
    }
  | {
      kind: 'multi';
      base: Record<string, number>;
      effects?: Effect[];
      probFrom?: { code: string; expr: string }[];
      /** P(τουλάχιστον μία από τις codes) ≥ expr (λογικό υποσύνολο από εμπειρική μέτρηση). */
      unionLowerBound?: { codes: string[]; expr: string };
    };

export interface QuestionSpec {
  id: string;
  block: string;
  type: 'single_choice' | 'multiple_choice';
  text: string;
  options: OptionSpec[];
  condition: string | null;
  minChoices?: number;
  maxChoices?: number | null;
  /** Δηλωμένη κατηγορία τεκμηρίωσης· ο μηχανισμός ελέγχει ότι δεν είναι ισχυρότερη από ό,τι πράγματι χρησιμοποιείται. */
  class: EvidenceClass;
  model: QuestionModel;
  /** Πηγές (ονόματα μετρήσεων) και παραδοχές που τεκμηριώνουν την ερώτηση. */
  sources?: string[];
  assumptions?: string[];
  note?: string;
}

export interface MetricSpec {
  /** Δείκτης του Synthetic Lab (π.χ. lake:eurostat:isoc_ec_ibgs::abbd2f7366) — προσαρμόζεται στον πληθυσμό με το mc-logit του prod-1. */
  metric: string;
  label: string;
  /** Τιμή αν η πηγή αφαιρεθεί (δοκιμή επίδρασης)· null = ο μέσος όρος του δείγματος (χωρίς ατομική διαφοροποίηση). */
  fallback?: number | null;
}

export interface DerivedSpec { name: string; expr: string; standardize?: boolean }
export interface LatentSpec { name: string; effects?: Effect[]; note?: string }

export interface StructuredStudySpec {
  studyId: string;
  title: string;
  specVersion: string;
  domain: 'consumer' | 'social' | 'political';
  referenceYear: number;
  questionnaireSha256?: string;
  population: { populationId: string; pieModel: string; minAge: number; sampling?: 'pps' | 'region_srs' };
  metrics: Record<string, MetricSpec>;
  derived?: DerivedSpec[];
  latents?: LatentSpec[];
  questions: QuestionSpec[];
  generationOrder?: string[];
  constraints?: { id: string; forbid: string; reason?: string }[];
  rules?: { id: string; when: string; note?: string }[];
  assumptions?: { id: string; text: string; sensitivity?: string }[];
}

export interface RunOptions {
  n: number;
  seed: number;
  /** Πολλαπλασιαστής όλων των επιδράσεων σεναρίου (ανάλυση ευαισθησίας· 1 = όπως δηλώθηκαν). */
  effectScale?: number;
  /** Μετατόπιση (σε λογιστική κλίμακα) των μεριδίων βάσης των ερωτήσεων S (ευαισθησία επιπέδων). */
  baseShift?: number;
  /** Πηγές που αφαιρούνται (δοκιμή επίδρασης): χρησιμοποιείται το fallback τους. */
  ablateMetrics?: string[];
  /** Αφαίρεση αγκυρών PIE (απασχόληση, οικονομική κατάσταση, τάξη, εισόδημα) → μέσες τιμές. */
  ablatePie?: boolean;
  /** Συγκεκριμένα πρόσωπα (για επαναληψιμότητα/δοκιμές)· αλλιώς επιλογή από τον πληθυσμό. */
  personaIds?: string[];
}
