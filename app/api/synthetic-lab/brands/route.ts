import { z } from 'zod';
import { fail, ok, parseBody, requireLabAccess } from '@/lib/synthetic-lab/api';
import { brandRegistrySummary, deleteBrandMeasurements, importBrandCsv } from '@/lib/synthetic-lab/data/brands';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

/** Μητρώο μαρκών: κατηγορίες, μάρκες με μετρήσεις και κατάσταση αυτόματης επικύρωσης ανά κατηγορία. */
export async function GET() {
  const gate = await requireLabAccess();
  if (gate) return gate;
  return ok(brandRegistrySummary());
}

const ImportBody = z.object({ csv: z.string().min(10).max(2_000_000) });

/** Εισαγωγή πραγματικών μετρήσεων μαρκών (CSV με υποχρεωτική πηγή και άδεια). */
export async function POST(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const body = await parseBody(req, ImportBody);
  if ('error' in body) return body.error;
  const r = importBrandCsv(body.data.csv);
  if (!r.imported && r.errors.length) return fail(r.errors.slice(0, 10).join(' '), 400, { errors: r.errors.slice(0, 50) });
  return ok({ ...r, summary: brandRegistrySummary() });
}

export async function DELETE(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const u = new URL(req.url);
  const category = u.searchParams.get('category') || '';
  if (!/^[a-z0-9_-]{1,40}$/.test(category)) return fail('Μη έγκυρη κατηγορία.');
  deleteBrandMeasurements(category, u.searchParams.get('brand') || undefined);
  return ok(brandRegistrySummary());
}
