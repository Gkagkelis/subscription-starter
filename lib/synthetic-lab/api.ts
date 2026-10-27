// Κοινά βοηθήματα για τα API routes του Lab.
import { NextResponse } from 'next/server';
import type { ZodSchema } from 'zod';
import { liveAuthorized, liveAvailable } from './ai/config';
import { checkRateLimit } from './ai/live';
import { zodMessage } from './schemas';
import type { EngineMode } from './types';

export function ok(data: unknown, status = 200) {
  return NextResponse.json({ ok: true, ...((data as object) || {}) }, { status });
}

export function fail(message: string, status = 400, extra: Record<string, unknown> = {}) {
  return NextResponse.json({ ok: false, error: message, ...extra }, { status });
}

/**
 * Προαιρετική απαίτηση σύνδεσης (SYNTHETIC_LAB_REQUIRE_LOGIN=true σε παραγωγή).
 * Χρησιμοποιεί τον υπάρχοντα Supabase auth client χωρίς να αλλάζει τίποτα.
 */
export async function hasLabAccess(): Promise<boolean> {
  if (process.env.SYNTHETIC_LAB_REQUIRE_LOGIN !== 'true') return true;
  try {
    const { createClient } = await import('@/utils/supabase/server');
    const { data } = await createClient().auth.getUser();
    return !!data?.user;
  } catch {
    return false;
  }
}

export async function requireLabAccess(): Promise<NextResponse | null> {
  return (await hasLabAccess()) ? null : fail('Απαιτείται σύνδεση για το Synthetic Research Lab.', 401);
}

export async function parseBody<T>(req: Request, schema: ZodSchema<T>): Promise<{ data: T } | { error: NextResponse }> {
  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return { error: fail('Μη έγκυρο JSON.') };
  }
  const r = schema.safeParse(raw);
  if (!r.success) return { error: fail(zodMessage(r.error)) };
  return { data: r.data };
}

/** Αποφασίζει demo/live. Live μόνο με ρητή άδεια — αλλιώς demo με εξήγηση. */
export function resolveMode(req: Request, requested?: EngineMode): { mode: EngineMode; note: string | null; error?: NextResponse } {
  if (requested !== 'live') return { mode: 'demo', note: null };
  if (!liveAvailable()) return { mode: 'demo', note: 'Ζητήθηκε live mode αλλά δεν είναι ενεργοποιημένο στον server· εκτελέστηκε σε demo mode.' };
  if (!liveAuthorized(req)) return { mode: 'demo', note: 'Live mode απαιτεί κλειδί πρόσβασης (x-synthetic-lab-key)· εκτελέστηκε σε demo mode.' };
  const rl = checkRateLimit();
  if (!rl.ok) return { mode: 'demo', note: null, error: fail(rl.message!, 429) };
  return { mode: 'live', note: null };
}
