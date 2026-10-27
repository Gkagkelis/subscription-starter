import { fail, ok, parseBody, requireLabAccess } from '@/lib/synthetic-lab/api';
import { importDataset, ImportSchema } from '@/lib/synthetic-lab/data/imports';
import { allDatasets, freshness } from '@/lib/synthetic-lab/data/registry';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await requireLabAccess();
  if (gate) return gate;
  return ok({ datasets: allDatasets().map((d) => ({ ...d, freshness: freshness(d) })) });
}

export async function POST(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const body = await parseBody(req, ImportSchema);
  if ('error' in body) return body.error;
  try {
    const r = importDataset(body.data);
    return ok(r);
  } catch (e: any) {
    return fail(String(e?.message || e), 400);
  }
}
