import { fail, ok, requireLabAccess } from '@/lib/synthetic-lab/api';
import { lakeMeta, lakeStudy, searchLake } from '@/lib/synthetic-lab/data/lake';
import { licenseMode } from '@/lib/synthetic-lab/data/research';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Greek Research Data Lake — μηχανή ανάκτησης για το simulation engine.
//   GET                                   -> κατάσταση (μελέτες, ερωτήσεις, πηγές)
//   GET ?q=κείμενο[&year=2024][&holdout=id1,id2][&topic=energy][&limit=30]
//                                         -> ερωτήσεις/μεταβλητές με σκορ (συνάφεια·ποιότητα·επικαιρότητα) και προέλευση
//   GET ?study=<studyId>                  -> μεταδεδομένα μελέτης
export async function GET(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const url = new URL(req.url);
  const study = url.searchParams.get('study');
  if (study) {
    const s = lakeStudy(study.slice(0, 300));
    return s ? ok({ study: s }) : fail('Η μελέτη δεν βρέθηκε στο lake.', 404);
  }
  const q = (url.searchParams.get('q') || '').slice(0, 300);
  if (!q) return ok({ licenseMode: licenseMode(), meta: lakeMeta() });
  const year = Number(url.searchParams.get('year')) || undefined;
  if (year !== undefined && (year < 2000 || year > 2100)) return fail('Μη έγκυρο έτος.', 400);
  const holdout = (url.searchParams.get('holdout') || '').split(',').map((s) => s.trim()).filter(Boolean).slice(0, 100);
  const topic = url.searchParams.get('topic');
  const limit = Math.min(100, Math.max(1, Number(url.searchParams.get('limit')) || 30));
  const hits = searchLake(q, { asOfYear: year, holdout, topics: topic ? [topic] : undefined, limit });
  return ok({
    licenseMode: licenseMode(),
    meta: lakeMeta(),
    hits: hits.map((h) => ({
      id: h.question.id,
      kind: h.question.kind,
      text: h.question.text,
      options: h.question.options,
      years: h.question.years,
      yearUsed: h.year,
      n: h.question.n,
      score: Math.round(h.score * 1000) / 1000,
      breakdown: h.breakdown,
      provenance: {
        studyId: h.study.studyId,
        title: h.study.title,
        source: h.study.source,
        publisher: h.study.publisher,
        level: h.study.level,
        quality: h.study.quality,
        tier: h.study.tier,
        license: h.study.license,
        url: h.study.url,
        doi: h.study.doi,
        sampleSize: h.study.sampleSize,
        representativeness: h.study.representativeness
      }
    }))
  });
}
