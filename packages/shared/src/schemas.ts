/** Zod schemas validating every inbound payload at the API boundary. */
import { z } from 'zod'

export const providerProtocolSchema = z.enum(['openai_compatible', 'anthropic', 'google', 'mock'])

export const providerCreateSchema = z.object({
  name: z.string().min(1).max(80),
  protocol: providerProtocolSchema,
  baseUrl: z.string().url().optional(),
  apiKey: z.string().max(4096).optional(),
  defaultModelId: z.string().max(200).nullish(),
  enabled: z.boolean().optional(),
})

export const providerUpdateSchema = z.object({
  name: z.string().min(1).max(80).optional(),
  protocol: providerProtocolSchema.optional(),
  baseUrl: z.string().url().nullable().optional(),
  apiKey: z.string().max(4096).nullable().optional(),
  defaultModelId: z.string().max(200).nullable().optional(),
  enabled: z.boolean().optional(),
})

export const modelCreateSchema = z.object({
  providerId: z.string().uuid(),
  modelId: z.string().min(1).max(200),
  displayName: z.string().min(1).max(120),
  contextWindow: z.number().int().positive().max(100_000_000).nullish(),
  inputPerMTokUsd: z.number().nonnegative().nullish(),
  outputPerMTokUsd: z.number().nonnegative().nullish(),
  enabled: z.boolean().optional(),
})

export const modelUpdateSchema = modelCreateSchema.partial().omit({ providerId: true })

export const modelBatchUpdateSchema = z.object({
  modelIds: z.array(z.string().uuid()).min(1).max(500),
  patch: modelUpdateSchema.refine((value) => Object.keys(value).length > 0, 'patch must change at least one field'),
})

export const memberBatchModelSchema = z.object({
  memberIds: z.array(z.string().uuid()).min(1).max(500),
  modelId: z.string().uuid(),
  maxTokens: z.number().int().positive().max(200_000).nullish(),
})

export const catalogEnrollSchema = z.object({
  modelIds: z.array(z.string().min(1).max(200)).min(1).max(500),
})

export const memberCreateSchema = z.object({
  name: z.string().min(1).max(60),
  modelId: z.string().uuid(),
  systemPrompt: z.string().max(20_000).nullish(),
  temperature: z.number().min(0).max(2).optional(),
  maxTokens: z.number().int().positive().max(200_000).nullish(),
  avatarColor: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional(),
  enabled: z.boolean().optional(),
})

export const memberUpdateSchema = memberCreateSchema.partial()

export const strategyKindSchema = z.enum([
  'round_robin',
  'debate',
  'swarm',
  'critique',
  'review',
  'architect',
  'red_team',
])

export const councilCreateSchema = z
  .object({
    name: z.string().min(1).max(80),
    description: z.string().max(500).nullish(),
    strategy: strategyKindSchema,
    rounds: z.number().int().min(1).max(100),
    memberIds: z.array(z.string().uuid()).min(1).max(24),
    moderatorMemberId: z.string().uuid().nullish(),
  })
  .refine((c) => !c.moderatorMemberId || c.memberIds.includes(c.moderatorMemberId), {
    message: 'moderator must be one of the council members',
  })

export const councilUpdateSchema = z
  .object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(500).nullable().optional(),
    strategy: strategyKindSchema.optional(),
    rounds: z.number().int().min(1).max(100).optional(),
    memberIds: z.array(z.string().uuid()).min(1).max(24).optional(),
    moderatorMemberId: z.string().uuid().nullable().optional(),
  })
  .refine((c) => !c.moderatorMemberId || (c.memberIds ? c.memberIds.includes(c.moderatorMemberId) : true), {
    message: 'moderator must be one of the council members',
  })

export const sessionCreateSchema = z.object({
  councilId: z.string().uuid(),
  topic: z.string().trim().min(1).max(8_000),
  researchEnabled: z.boolean().optional(),
  budgetUsd: z.number().positive().finite().max(100000).optional(),
  consensusEnabled: z.boolean().optional(),
  workspacePath: z.string().min(1).max(4_000).optional(),
  workspaceFiles: z.array(z.string().min(1).max(1_000)).max(80).optional(),
})

export const workspacePreviewSchema = z.object({
  path: z.string().min(1).max(4_000),
  files: z.array(z.string().min(1).max(1_000)).max(80).optional(),
})

export const sessionExtendSchema = z.object({
  additionalRounds: z.number().int().min(1).max(50).default(1),
})

export const sessionConcludeSchema = z.object({
  reason: z.string().max(500).optional(),
})

export const sessionInterveneSchema = z.object({
  content: z.string().min(1).max(4_000),
})

/** Shape of `GET /config/export`, re-validated on import.
 *
 * Distinct from the create schemas because these rows carry their own ids: an
 * import restores an existing configuration rather than minting a new one.
 * Secrets are deliberately absent — exports only ever record `hasSecret`.
 */
export const configImportSchema = z.object({
  version: z.literal(1).optional(),
  providers: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(80),
      protocol: providerProtocolSchema,
      baseUrl: z.string().url().nullish(),
      defaultModelId: z.string().max(200).nullish(),
      enabled: z.coerce.boolean().optional(),
    }),
  ),
  models: z.array(
    z.object({
      id: z.string().uuid(),
      providerId: z.string().uuid(),
      modelId: z.string().min(1).max(200),
      displayName: z.string().min(1).max(120),
      contextWindow: z.number().int().positive().max(100_000_000).nullish(),
      inputPerMTokUsd: z.number().nonnegative().nullish(),
      outputPerMTokUsd: z.number().nonnegative().nullish(),
      enabled: z.coerce.boolean().optional(),
    }),
  ),
  members: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(60),
      modelId: z.string().uuid().nullish(),
      systemPrompt: z.string().max(20_000).nullish(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().positive().max(200_000).nullish(),
      avatarColor: z
        .string()
        .regex(/^#[0-9a-fA-F]{6}$/)
        .optional(),
      enabled: z.coerce.boolean().optional(),
    }),
  ),
  councils: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string().min(1).max(80),
      description: z.string().max(500).nullish(),
      strategy: strategyKindSchema.optional(),
      rounds: z.number().int().min(1).max(100).optional(),
      memberIds: z.array(z.string().uuid()).max(24).optional(),
      moderatorMemberId: z.string().uuid().nullish(),
    }),
  ),
})

export type ConfigImport = z.infer<typeof configImportSchema>
