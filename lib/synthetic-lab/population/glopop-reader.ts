// ============================================================
// GLOPOP-S streaming reader (Node μόνο: fs + zlib).
//
// Format: gzip( int32 little-endian, 15 στήλες, column-major ).
//   N = decompressed_bytes / 60. Στήλη k = ints [k*N, (k+1)*N).
// Επειδή το layout είναι column-major, δεν γίνεται ανάγνωση "γραμμή-γραμμή".
// Αντί να φορτώσουμε ολόκληρο το αρχείο (Αττική ≈ 230 MB αποσυμπιεσμένο),
// επιλέγουμε ΠΡΩΤΑ τους δείκτες του δείγματος και κρατάμε μόνο αυτές τις
// τιμές καθώς περνά το stream. Μνήμη: O(N) bytes για τη μάσκα + O(δείγμα).
// ============================================================

import { createReadStream, openSync, readSync, fstatSync, closeSync } from 'fs';
import { createGunzip } from 'zlib';
import { GLOPOP_BYTES_PER_ROW, GLOPOP_COLUMNS, GLOPOP_NCOLS, type GlopopRow } from './glopop-schema';

/** Πλήθος εγγραφών από το gzip trailer (ISIZE, mod 2^32 — επαρκές για < 4 GB). */
export function glopopRowCount(gzPath: string): number {
  const fd = openSync(gzPath, 'r');
  try {
    const size = fstatSync(fd).size;
    const buf = Buffer.alloc(4);
    readSync(fd, buf, 0, 4, size - 4);
    const isize = buf.readUInt32LE(0);
    if (isize % GLOPOP_BYTES_PER_ROW !== 0) {
      throw new Error(`Μη έγκυρο μέγεθος GLOPOP (${isize} bytes δεν διαιρείται με ${GLOPOP_BYTES_PER_ROW}).`);
    }
    return isize / GLOPOP_BYTES_PER_ROW;
  } finally {
    closeSync(fd);
  }
}

export interface GlopopReadResult {
  n: number;
  rows: Map<number, GlopopRow>;
  /** Κατανομές τιμών ανά στήλη (εκτός HID) για έλεγχο ακεραιότητας. */
  tallies: Record<string, Record<string, number>>;
  /** Κατανομές σε επίπεδο νοικοκυριού (μόνο για τον αρχηγό, RELATE_HEAD = 1). */
  householdTallies: Record<string, Record<string, number>>;
  /** Έλεγχος: HID μη φθίνον (νοικοκυριά συνεχόμενα). */
  hidMonotonic: boolean;
  households: number;
}

/**
 * Διαβάζει ένα αρχείο GLOPOP-S σε stream και επιστρέφει τις γραμμές των
 * ζητούμενων δεικτών (0-based) και τις συνολικές κατανομές.
 */
export async function readGlopopFile(gzPath: string, sampleIndices: number[]): Promise<GlopopReadResult> {
  const n = glopopRowCount(gzPath);
  const slot = new Int32Array(n).fill(-1);
  sampleIndices.forEach((idx, s) => {
    if (idx < 0 || idx >= n) throw new Error(`Δείκτης δείγματος εκτός ορίων: ${idx}`);
    slot[idx] = s;
  });
  const values: Int32Array[] = GLOPOP_COLUMNS.map(() => new Int32Array(sampleIndices.length));
  const tallies: Record<string, Record<string, number>> = {};
  GLOPOP_COLUMNS.forEach((c) => (tallies[c] = {}));
  const tallyArrays = GLOPOP_COLUMNS.map(() => new Map<number, number>());
  const hhTallyArrays = GLOPOP_COLUMNS.map(() => new Map<number, number>());
  const isHead = new Uint8Array(n);
  const RELATE_COL = GLOPOP_COLUMNS.indexOf('RELATE_HEAD');

  let intIndex = 0;
  let leftover: Buffer | null = null;
  let lastHid = -Infinity;
  let hidMonotonic = true;
  let households = 0;
  const total = n * GLOPOP_NCOLS;

  await new Promise<void>((resolve, reject) => {
    const stream = createReadStream(gzPath).pipe(createGunzip());
    stream.on('data', (chunk: Buffer) => {
      let buf = leftover ? Buffer.concat([leftover, chunk]) : chunk;
      const usable = buf.length - (buf.length % 4);
      for (let off = 0; off < usable; off += 4) {
        if (intIndex >= total) break;
        const v = buf.readInt32LE(off);
        const col = Math.floor(intIndex / n);
        const row = intIndex - col * n;
        if (col === 0) {
          if (v < lastHid) hidMonotonic = false;
          if (v !== lastHid) households++;
          lastHid = v;
        } else {
          const t = tallyArrays[col];
          t.set(v, (t.get(v) || 0) + 1);
          if (col === RELATE_COL) {
            if (v === 1) isHead[row] = 1;
          } else if (isHead[row]) {
            const h = hhTallyArrays[col];
            h.set(v, (h.get(v) || 0) + 1);
          }
        }
        const s = slot[row];
        if (s >= 0) values[col][s] = v;
        intIndex++;
      }
      leftover = usable < buf.length ? Buffer.from(buf.subarray(usable)) : null;
    });
    stream.on('end', () => resolve());
    stream.on('error', reject);
  });

  if (intIndex !== total) throw new Error(`Ελλιπές αρχείο GLOPOP: διαβάστηκαν ${intIndex}/${total} τιμές.`);

  const householdTallies: Record<string, Record<string, number>> = {};
  tallyArrays.forEach((m, col) => {
    if (col === 0) return;
    m.forEach((count, v) => (tallies[GLOPOP_COLUMNS[col]][String(v)] = count));
    if (col > RELATE_COL) {
      householdTallies[GLOPOP_COLUMNS[col]] = {};
      hhTallyArrays[col].forEach((count, v) => (householdTallies[GLOPOP_COLUMNS[col]][String(v)] = count));
    }
  });

  const rows = new Map<number, GlopopRow>();
  sampleIndices.forEach((idx, s) => {
    const r = {} as GlopopRow;
    GLOPOP_COLUMNS.forEach((c, k) => (r[c] = values[k][s]));
    rows.set(idx, r);
  });

  return { n, rows, tallies, householdTallies, hidMonotonic, households };
}
