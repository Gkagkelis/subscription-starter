export type NullableScore = number | string | null | undefined;

export type NorayaPriorityRoute = "media" | "public" | "external";

export type NorayaPriorityStatus =
  | "ranked"
  | "trigger_only"
  | "no_signal";

export type NorayaPriorityInput = {
  /** Existing Noraya article/event/agenda signal. */
  norayaScore?: NullableScore;
  /** Real Google Trends score only. Do not pass fallback/pending 50. */
  googleTrendsScore?: NullableScore;
  /** Media coverage score (Google News coverage_level 0-100). */
  gdeltScore?: NullableScore;
  /** Client/party relevance. Optional until we wire party-specific relevance. */
  clientRelevanceScore?: NullableScore;
};

export type NorayaPriorityRouteScore = {
  route: NorayaPriorityRoute;
  score: number;
  inputs: Record<string, number>;
};

export type NorayaPriorityResult = {
  score: number | null;
  rawScore: number | null;
  route: NorayaPriorityRoute | null;
  status: NorayaPriorityStatus;
  reliabilityCap: number | null;
  routes: NorayaPriorityRouteScore[];
  signals: {
    noraya: boolean;
    googleTrends: boolean;
    gdelt: boolean;
  };
  formulaVersion: "noraya-priority-v1-shadow";
};

function toScore(value: NullableScore): number | null {
  if (value === null || value === undefined || value === "") return null;
  const parsed = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(parsed)) return null;
  return Math.min(100, Math.max(0, Math.round(parsed)));
}

function weightedAverage(parts: Array<{ key: string; value: number | null; weight: number }>) {
  const available = parts.filter((part): part is { key: string; value: number; weight: number } => part.value !== null);
  const weightSum = available.reduce((sum, part) => sum + part.weight, 0);
  if (!available.length || weightSum <= 0) return null;

  const score = available.reduce((sum, part) => sum + part.value * part.weight, 0) / weightSum;
  return {
    score: Math.min(100, Math.max(0, Math.round(score))),
    inputs: Object.fromEntries(available.map((part) => [part.key, part.value])),
  };
}

function reliabilityCap(hasNoraya: boolean, hasGoogleTrends: boolean, hasGdelt: boolean) {
  if (hasNoraya && hasGoogleTrends && hasGdelt) return 100;
  if (hasNoraya && hasGoogleTrends) return 90;
  if (hasNoraya && hasGdelt) return 88;
  if (hasGoogleTrends && hasGdelt) return 82;
  if (hasNoraya) return 78;
  if (hasGdelt) return 70;
  // Trends-only is deliberately not a ranked item. It should trigger enrichment only.
  return null;
}

export function computeNorayaPriorityScore(input: NorayaPriorityInput): NorayaPriorityResult {
  const noraya = toScore(input.norayaScore);
  const googleTrends = toScore(input.googleTrendsScore);
  const gdelt = toScore(input.gdeltScore);
  const clientRelevance = toScore(input.clientRelevanceScore);

  const hasNoraya = noraya !== null;
  const hasGoogleTrends = googleTrends !== null;
  const hasGdelt = gdelt !== null;
  const cap = reliabilityCap(hasNoraya, hasGoogleTrends, hasGdelt);

  const routes: NorayaPriorityRouteScore[] = [];

  if (hasNoraya) {
    const media = weightedAverage([
      { key: "noraya", value: noraya, weight: 0.40 },
      { key: "googleTrends", value: googleTrends, weight: 0.30 },
      { key: "gdelt", value: gdelt, weight: 0.30 },
    ]);
    if (media) routes.push({ route: "media", score: media.score, inputs: media.inputs });
  }

  // Public route is allowed only when public interest is attached to at least one real evidence channel.
  // Google Trends alone remains a trigger, not a ranked political item.
  if (hasGoogleTrends && (hasNoraya || hasGdelt)) {
    const publicRoute = weightedAverage([
      { key: "googleTrends", value: googleTrends, weight: 0.60 },
      { key: "clientRelevance", value: clientRelevance, weight: 0.25 },
      { key: "gdelt", value: gdelt, weight: 0.15 },
    ]);
    if (publicRoute) routes.push({ route: "public", score: publicRoute.score, inputs: publicRoute.inputs });
  }

  if (hasGdelt) {
    const external = weightedAverage([
      { key: "gdelt", value: gdelt, weight: 0.55 },
      { key: "googleTrends", value: googleTrends, weight: 0.25 },
      { key: "clientRelevance", value: clientRelevance, weight: 0.20 },
    ]);
    if (external) routes.push({ route: "external", score: external.score, inputs: external.inputs });
  }

  if (!routes.length || cap === null) {
    return {
      score: null,
      rawScore: null,
      route: null,
      status: hasGoogleTrends && !hasNoraya && !hasGdelt ? "trigger_only" : "no_signal",
      reliabilityCap: cap,
      routes,
      signals: { noraya: hasNoraya, googleTrends: hasGoogleTrends, gdelt: hasGdelt },
      formulaVersion: "noraya-priority-v1-shadow",
    };
  }

  const best = routes.reduce((winner, route) => (route.score > winner.score ? route : winner), routes[0]);
  const finalScore = Math.min(best.score, cap);

  return {
    score: finalScore,
    rawScore: best.score,
    route: best.route,
    status: "ranked",
    reliabilityCap: cap,
    routes,
    signals: { noraya: hasNoraya, googleTrends: hasGoogleTrends, gdelt: hasGdelt },
    formulaVersion: "noraya-priority-v1-shadow",
  };
}
