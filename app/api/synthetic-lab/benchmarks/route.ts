import { ok, requireLabAccess } from '@/lib/synthetic-lab/api';
import { benchmarkOverview } from '@/lib/synthetic-lab/benchmark/overview';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Benchmark πραγματικών ελληνικών ερευνών: σουίτα, πειράματα διάγνωσης, εκδόσεις μοντέλου, αποφάσεις (μόνο ανάγνωση).
// Οι εκτελέσεις γίνονται από το CLI (scripts/synthetic-lab/benchmark.ts) — βαριές, χωρίς κόστος AI.
export async function GET() {
  const gate = await requireLabAccess();
  if (gate) return gate;
  return ok(benchmarkOverview());
}
