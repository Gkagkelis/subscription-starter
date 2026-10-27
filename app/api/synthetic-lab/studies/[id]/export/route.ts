import { NextResponse } from 'next/server';
import { fail, requireLabAccess } from '@/lib/synthetic-lab/api';
import { aggregatesCsv, buildReport, reportHtmlDocument, reportMarkdown, responsesCsv } from '@/lib/synthetic-lab/engine/report';
import { loadDoc } from '@/lib/synthetic-lab/storage/file-store';
import type { StudyRun } from '@/lib/synthetic-lab/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const BOM = '﻿'; // ώστε το Excel να διαβάζει σωστά τα ελληνικά

export async function GET(req: Request, { params }: { params: { id: string } }) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const run = loadDoc<StudyRun>('studies', params.id);
  if (!run) return fail('Η μελέτη δεν βρέθηκε.', 404);
  const format = new URL(req.url).searchParams.get('format') || 'json';
  const name = `synthetic-study-${run.id}`;
  const send = (body: string, type: string, ext: string) =>
    new NextResponse(body, { headers: { 'content-type': type, 'content-disposition': `attachment; filename="${name}.${ext}"` } });
  switch (format) {
    case 'json':
      return send(JSON.stringify({ label: 'SIMULATED RESPONSE — NOT HUMAN SURVEY DATA', ...run }, null, 2), 'application/json; charset=utf-8', 'json');
    case 'csv':
      return send(BOM + responsesCsv(run), 'text/csv; charset=utf-8', 'csv');
    case 'aggregates-csv':
      return send(BOM + aggregatesCsv(run), 'text/csv; charset=utf-8', 'aggregates.csv');
    case 'md':
      return send(reportMarkdown(buildReport(run)), 'text/markdown; charset=utf-8', 'md');
    case 'doc':
      // HTML με τύπο MS Word: ανοίγει απευθείας στο Word.
      return send(reportHtmlDocument(buildReport(run)), 'application/msword; charset=utf-8', 'doc');
    default:
      return fail('Άγνωστη μορφή εξαγωγής.');
  }
}
