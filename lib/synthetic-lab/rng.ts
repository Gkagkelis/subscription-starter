// Ντετερμινιστική γεννήτρια τυχαίων αριθμών (ίδιο seed => ίδια αποτελέσματα).
// Χρησιμοποιείται παντού ώστε κάθε μελέτη να είναι αναπαραγώγιμη.

/** FNV-1a 32-bit hash ενός string. */
export function hashString(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Συνδυάζει seed με επιπλέον κλειδιά (π.χ. personaId, questionId). */
export function deriveSeed(seed: number, ...keys: (string | number)[]): number {
  return hashString(`${seed}|${keys.join('|')}`);
}

export interface Rng {
  next(): number; // [0,1)
  int(maxExclusive: number): number;
  normal(): number;
  gumbel(): number;
  pick<T>(arr: readonly T[]): T;
  shuffle<T>(arr: T[]): T[];
}

/** mulberry32 — μικρή, γρήγορη, επαρκής για προσομοίωση (όχι κρυπτογραφία). */
export function createRng(seed: number): Rng {
  let a = seed >>> 0;
  const next = () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const rng: Rng = {
    next,
    int: (n) => Math.floor(next() * n),
    normal: () => {
      // Box–Muller
      let u = 0;
      while (u === 0) u = next();
      const v = next();
      return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
    },
    gumbel: () => {
      let u = 0;
      while (u === 0) u = next();
      return -Math.log(-Math.log(u));
    },
    pick: (arr) => arr[Math.floor(next() * arr.length)],
    shuffle: (arr) => {
      for (let i = arr.length - 1; i > 0; i--) {
        const j = Math.floor(next() * (i + 1));
        [arr[i], arr[j]] = [arr[j], arr[i]];
      }
      return arr;
    }
  };
  return rng;
}

/** Σταθερό συνθετικό ID από την προέλευση μιας εγγραφής. */
export function stableId(prefix: string, ...parts: (string | number)[]): string {
  const h1 = hashString(parts.join('|')).toString(16).padStart(8, '0');
  const h2 = hashString('salt:' + parts.join('|')).toString(16).padStart(8, '0');
  return `${prefix}-${h1}${h2.slice(0, 4)}`;
}
