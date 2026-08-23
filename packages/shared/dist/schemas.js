/** Zod schemas validating every inbound payload at the API boundary. */
import { z } from 'zod';
export const providerProtocolSchema = z.enum(['openai_compatible', 'anthropic', 'google', 'mock']);
export const providerCreateSchema = z.object({
    name: z.string().min(1).max(80),
    protocol: providerProtocolSchema,
    baseUrl: z.string().url().optional(),
    apiKey: z.string().max(4096).optional(),
    defaultModelId: z.string().max(200).nullish(),
    enabled: z.boolean().optional(),
});
export const providerUpdateSchema = z.object({
    name: z.string().min(1).max(80).optional(),
    protocol: providerProtocolSchema.optional(),
    baseUrl: z.string().url().nullable().optional(),
    apiKey: z.string().max(4096).nullable().optional(),
    defaultModelId: z.string().max(200).nullable().optional(),
    enabled: z.boolean().optional(),
});
export const modelCreateSchema = z.object({
    providerId: z.string().uuid(),
    modelId: z.string().min(1).max(200),
    displayName: z.string().min(1).max(120),
    contextWindow: z.number().int().positive().max(100_000_000).nullish(),
    inputPerMTokUsd: z.number().nonnegative().nullish(),
    outputPerMTokUsd: z.number().nonnegative().nullish(),
    enabled: z.boolean().optional(),
});
export const modelUpdateSchema = modelCreateSchema.partial().omit({ providerId: true });
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
});
export const memberUpdateSchema = memberCreateSchema.partial();
export const strategyKindSchema = z.enum(['round_robin', 'debate']);
export const councilCreateSchema = z.object({
    name: z.string().min(1).max(80),
    description: z.string().max(500).nullish(),
    strategy: strategyKindSchema,
    rounds: z.number().int().min(1).max(10),
    memberIds: z.array(z.string().uuid()).min(1).max(12),
    moderatorMemberId: z.string().uuid().nullish(),
})
    .refine((c) => !c.moderatorMemberId || c.memberIds.includes(c.moderatorMemberId), {
    message: 'moderator must be one of the council members',
});
export const councilUpdateSchema = z.object({
    name: z.string().min(1).max(80).optional(),
    description: z.string().max(500).nullable().optional(),
    strategy: strategyKindSchema.optional(),
    rounds: z.number().int().min(1).max(10).optional(),
    memberIds: z.array(z.string().uuid()).min(1).max(12).optional(),
    moderatorMemberId: z.string().uuid().nullable().optional(),
}).refine((c) => !c.moderatorMemberId || (c.memberIds ? c.memberIds.includes(c.moderatorMemberId) : true), {
    message: 'moderator must be one of the council members',
});
export const sessionCreateSchema = z.object({
    councilId: z.string().uuid(),
    topic: z.string().min(1).max(8_000),
});
//# sourceMappingURL=schemas.js.map