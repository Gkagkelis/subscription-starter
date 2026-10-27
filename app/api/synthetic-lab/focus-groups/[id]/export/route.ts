import { NextResponse } from 'next/server';
import { fail, requireLabAccess } from '@/lib/synthetic-lab/api';
import { loadFocusGroup, transcriptMarkdown } from '@/lib/synthetic-lab/engine/focus-group';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const s = loadFocusGroup(params.id);
  if (!s) return fail('Το focus group δεν βρέθηκε.', 404);
  const format = new URL(req.url).searchParams.get('format') || 'md';
  const name = `synthetic-focus-group-${s.id}`;
  if (format === 'json') {
    return new NextResponse(JSON.stringify(s, null, 2), {
      headers: { 'content-type': 'application/json; charset=utf-8', 'content-disposition': `attachment; filename="${name}.json"` }
    });
  }
  return new NextResponse(transcriptMarkdown(s), {
    headers: { 'content-type': 'text/markdown; charset=utf-8', 'content-disposition': `attachment; filename="${name}.md"` }
  });
}
