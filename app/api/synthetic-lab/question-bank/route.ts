import { fail, ok, requireLabAccess } from '@/lib/synthetic-lab/api';
import { licenseMode } from '@/lib/synthetic-lab/data/research';
import { bankQuestion, searchBank } from '@/lib/synthetic-lab/engine/question-bank';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

// Τράπεζα ερωτήσεων με εμπειρική βάση.
//   GET ?q=κείμενο            -> αναζήτηση (έως 40)
//   GET ?build=<id>&as=<qid>  -> έτοιμη ερώτηση μελέτης
export async function GET(req: Request) {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const url = new URL(req.url);
  const build = url.searchParams.get('build');
  if (build) {
    const as = (url.searchParams.get('as') || 'src1').slice(0, 20);
    if (!/^[a-zA-Z0-9_-]+$/.test(as)) return fail('Μη έγκυρο id ερώτησης.', 400);
    const q = bankQuestion(build.slice(0, 80), as);
    return q ? ok({ question: q }) : fail('Δεν βρέθηκε η ερώτηση στην τράπεζα.', 404);
  }
  const query = (url.searchParams.get('q') || '').slice(0, 200);
  return ok({ licenseMode: licenseMode(), entries: searchBank(query, 40) });
}
