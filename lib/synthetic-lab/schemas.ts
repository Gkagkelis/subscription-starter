// Έλεγχος εισόδου των API (zod). Όρια μεγεθών ώστε να μη δεσμεύονται πόροι.
import { z } from 'zod';

const str = (max: number) => z.string().trim().max(max);

export const AudienceSchema = z
  .object({
    minAge: z.number().int().min(0).max(100).optional(),
    maxAge: z.number().int().min(0).max(120).optional(),
    genders: z.array(z.enum(['male', 'female'])).max(2).optional(),
    regions: z.array(str(20)).max(13).optional(),
    settlements: z.array(z.enum(['urban', 'rural', 'unknown'])).max(3).optional(),
    educations: z.array(z.enum(['less_than_primary', 'primary', 'lower_secondary', 'upper_secondary', 'tertiary', 'unknown'])).max(6).optional(),
    incomeQuintiles: z.array(z.union([z.literal(1), z.literal(2), z.literal(3), z.literal(4), z.literal(5)])).max(5).optional()
  })
  .strict();

export const QuestionSchema = z
  .object({
    id: str(20).regex(/^[a-zA-Z0-9_-]+$/),
    type: z.enum(['single_choice', 'multiple_choice', 'likert', 'ranking', 'open_ended', 'concept_test', 'product_comparison', 'price_test']),
    text: str(500).min(3),
    options: z.array(str(150).min(1)).max(12).optional(),
    scale: z.array(str(60).min(1)).min(2).max(11).optional(),
    products: z
      .array(
        z.object({
          id: str(20),
          label: str(80).min(1),
          price: z.number().min(0).max(1_000_000).nullable().optional(),
          description: str(300).optional(),
          quality: z.number().min(1).max(5).nullable().optional()
        })
      )
      .max(6)
      .optional(),
    pricePoints: z.array(z.number().min(0).max(1_000_000)).max(10).optional(),
    followUpOf: z.object({ questionId: str(20), whenAnswerIn: z.array(str(150)).max(12) }).nullable().optional(),
    evidenceLink: z
      .object({
        datasetId: str(60),
        metric: str(60),
        positiveOption: str(150),
        optionMetrics: z
          .record(str(150), str(60))
          .refine((r) => Object.keys(r).length <= 12, 'Έως 12 επιλογές.')
          .optional()
      })
      .nullable()
      .optional(),
    maxSelections: z.number().int().min(1).max(12).optional(),
    relatedEvidence: z.object({ metrics: z.array(str(80)).min(1).max(8), rationale: str(500).min(3) }).nullable().optional(),
    brandLink: z.object({ category: str(40).regex(/^[a-z0-9_-]+$/), brand: str(80).min(1), measure: str(40).regex(/^[a-z0-9_]+$/) }).nullable().optional(),
    brandOptions: z
      .object({ category: str(40).regex(/^[a-z0-9_-]+$/), measure: str(40).regex(/^[a-z0-9_]+$/), brands: z.record(str(150), str(80)) })
      .nullable()
      .optional(),
    construct: z.object({ object: str(80).min(1), kind: z.enum(['evaluation', 'intention', 'usage', 'general_usage', 'other']) }).nullable().optional(),
    scenarioPrior: z.object({ probs: z.array(z.number().min(0).max(100)).min(2).max(12), rationale: str(500).min(3) }).nullable().optional()
  })
  .superRefine((q, ctx) => {
    const needsOptions = ['single_choice', 'multiple_choice', 'ranking'];
    if (needsOptions.includes(q.type) && (!q.options || q.options.length < 2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Η ερώτηση ${q.id} χρειάζεται τουλάχιστον 2 επιλογές.` });
    }
    if (q.type === 'product_comparison' && (!q.products || q.products.length < 2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Η ερώτηση ${q.id} χρειάζεται τουλάχιστον 2 προϊόντα.` });
    }
    if (q.type === 'price_test' && (!q.pricePoints || q.pricePoints.length < 2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, message: `Η ερώτηση ${q.id} χρειάζεται τουλάχιστον 2 σημεία τιμής.` });
    }
  });

export const AssumptionSchema = z.object({
  id: str(60),
  title: str(200),
  description: str(1000),
  source: z.enum(['researcher', 'default_assumption', 'data']),
  enabled: z.boolean(),
  strength: z.number().min(0).max(3),
  value: z.number().min(0).max(1_000_000).nullable().optional(),
  metric: str(60).nullable().optional()
});

export const PlanSchema = z.object({
  domain: z.enum(['consumer', 'social_policy']),
  kind: z.enum(['survey', 'focus_group', 'scenario_comparison']),
  title: str(200).min(1),
  researchQuestion: str(2000).min(3),
  questions: z.array(QuestionSchema).min(1).max(25),
  assumptions: z.array(AssumptionSchema).max(20),
  audience: AudienceSchema,
  sampleSize: z.number().int().min(10).max(2000),
  warnings: z.array(str(1000)).max(50),
  plannerVersion: str(40),
  plannerMode: z.enum(['rules', 'ai']),
  referenceYear: z.number().int().min(2000).max(2100).nullable().optional(),
  holdoutDatasets: z.array(str(300)).max(200).optional(),
  engine: z.enum(['standard', 'evidence']).optional()
});

export const RunStudySchema = z.object({
  plan: PlanSchema,
  populationId: str(100),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
  mode: z.enum(['demo', 'live']).optional(),
  model: z.enum(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']).optional(),
  costCapUsd: z.number().min(0.01).max(50).optional()
});

export const PlanRequestSchema = z.object({
  text: str(2000).min(3),
  kind: z.enum(['survey', 'focus_group', 'scenario_comparison']).optional(),
  domain: z.enum(['consumer', 'social_policy']).optional(),
  audience: AudienceSchema.optional(),
  sampleSize: z.number().int().min(10).max(2000).optional(),
  referenceYear: z.number().int().min(2000).max(2100).nullable().optional(),
  holdoutDatasets: z.array(str(300)).max(200).optional()
});

export const FocusCreateSchema = z.object({
  topic: str(500).min(3),
  domain: z.enum(['consumer', 'social_policy']),
  guide: z.array(str(400).min(3)).min(1).max(8),
  participants: z.number().int().min(3).max(8).optional(),
  rounds: z.number().int().min(1).max(3).optional(),
  populationId: str(100),
  audience: AudienceSchema.optional(),
  mode: z.enum(['demo', 'live']).optional(),
  model: z.enum(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']).optional(),
  costCapUsd: z.number().min(0.01).max(50).optional(),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
  price: z.number().min(0).max(1_000_000).nullable().optional()
});

export const ScenarioSchema = z.object({
  id: str(20),
  label: str(80).min(1),
  description: str(400),
  price: z.number().min(0).max(1_000_000).nullable().optional(),
  quality: z.number().min(1).max(5).nullable().optional()
});

export const CompareSchema = z.object({
  basePlan: PlanSchema,
  scenarios: z.array(ScenarioSchema).min(2).max(5),
  populationId: str(100),
  seed: z.number().int().min(0).max(2_147_483_647).optional(),
  mode: z.enum(['demo', 'live']).optional(),
  model: z.enum(['claude-opus-5-5', 'claude-sonnet-5-5', 'claude-haiku-5-5']).optional(),
  costCapUsd: z.number().min(0.01).max(50).optional()
});

export const ValidationRunSchema = z.object({
  populationId: str(100),
  metric: str(60).optional(),
  n: z.number().int().min(100).max(5000).optional(),
  seed: z.number().int().min(0).max(2_147_483_647).optional()
});

export function zodMessage(e: z.ZodError): string {
  return e.issues
    .slice(0, 5)
    .map((i) => `${i.path.join('.') || 'είσοδος'}: ${i.message}`)
    .join('· ');
}
