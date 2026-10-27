// Ελληνικές περιγραφές συνθετικών προφίλ. Χωρίς επινοημένα ονόματα:
// τα προφίλ εμφανίζονται ως «Σ1, Σ2…» ώστε να μη μοιάζουν με πραγματικά πρόσωπα.

import type { Education, HouseholdType, Persona, Settlement } from '../types';

export const EDU_LABEL: Record<Education, string> = {
  less_than_primary: 'κάτω από δημοτικό',
  primary: 'δημοτικό',
  lower_secondary: 'γυμνάσιο',
  upper_secondary: 'λύκειο / δευτεροβάθμια',
  tertiary: 'ανώτατη εκπαίδευση',
  unknown: 'άγνωστη εκπαίδευση'
};

export const SETTLEMENT_LABEL: Record<Settlement, string> = { urban: 'αστική περιοχή', rural: 'αγροτική περιοχή', unknown: 'άγνωστη' };

export const HH_LABEL: Record<HouseholdType, string> = {
  single: 'μονοπρόσωπο νοικοκυριό',
  couple: 'ζευγάρι χωρίς παιδιά',
  couple_with_children: 'ζευγάρι με παιδιά',
  single_parent: 'μονογονεϊκή οικογένεια',
  couple_with_relatives: 'ζευγάρι με συγγενείς',
  couple_with_children_and_relatives: 'ζευγάρι με παιδιά και συγγενείς',
  single_parent_with_relatives: 'μονογονεϊκή με συγγενείς',
  other: 'άλλος τύπος νοικοκυριού',
  unknown: 'άγνωστος τύπος'
};

export const GENDER_LABEL = { male: 'Άνδρας', female: 'Γυναίκα' } as const;

export function quintileLabel(q: number | null): string {
  if (q === null) return 'άγνωστο εισόδημα';
  return ['', 'χαμηλότερο 20% εισοδήματος', 'χαμηλό-μεσαίο εισόδημα', 'μεσαίο εισόδημα', 'μεσαίο-υψηλό εισόδημα', 'υψηλότερο 20% εισοδήματος'][q];
}

export function describePersonaShort(p: Persona): string {
  return `${GENDER_LABEL[p.gender]}, ${p.ageBand}, ${p.regionName}`;
}

export function describePersonaLong(p: Persona): string {
  return [
    `${GENDER_LABEL[p.gender]}, ηλικία ${p.ageBand}`,
    `${p.regionName} (${SETTLEMENT_LABEL[p.settlement]})`,
    EDU_LABEL[p.education],
    quintileLabel(p.incomeQuintile),
    `${HH_LABEL[p.householdType]}${p.householdSize ? `, ${p.householdSize} άτομα` : ''}`
  ].join(' · ');
}

export function participantAlias(index: number): string {
  return `Σ${index + 1}`;
}
