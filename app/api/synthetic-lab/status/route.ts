import { liveConfig, liveStatusMessage, LIVE_MODELS } from '@/lib/synthetic-lab/ai/config';
import { ok, requireLabAccess } from '@/lib/synthetic-lab/api';
import { listPopulationSummaries, defaultPopulationId } from '@/lib/synthetic-lab/population/store';
import { latestSuite } from '@/lib/synthetic-lab/engine/validation';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  const gate = await requireLabAccess();
  if (gate) return gate;
  const cfg = liveConfig();
  const suite = latestSuite();
  return ok({
    mode: { liveAvailable: cfg.enabledByEnv && cfg.hasApiKey && cfg.hasAccessKey, message: liveStatusMessage(), limits: cfg, models: LIVE_MODELS },
    populations: listPopulationSummaries(),
    defaultPopulationId: defaultPopulationId(),
    validation: suite ? { createdAt: suite.createdAt, summary: suite.summary } : null
  });
}
