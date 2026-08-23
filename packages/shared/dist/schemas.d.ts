/** Zod schemas validating every inbound payload at the API boundary. */
import { z } from 'zod';
export declare const providerProtocolSchema: z.ZodEnum<["openai_compatible", "anthropic", "google", "mock"]>;
export declare const providerCreateSchema: z.ZodObject<{
    name: z.ZodString;
    protocol: z.ZodEnum<["openai_compatible", "anthropic", "google", "mock"]>;
    baseUrl: z.ZodOptional<z.ZodString>;
    apiKey: z.ZodOptional<z.ZodString>;
    defaultModelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    enabled: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    protocol: "openai_compatible" | "anthropic" | "google" | "mock";
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    defaultModelId?: string | null | undefined;
    enabled?: boolean | undefined;
}, {
    name: string;
    protocol: "openai_compatible" | "anthropic" | "google" | "mock";
    baseUrl?: string | undefined;
    apiKey?: string | undefined;
    defaultModelId?: string | null | undefined;
    enabled?: boolean | undefined;
}>;
export declare const providerUpdateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    protocol: z.ZodOptional<z.ZodEnum<["openai_compatible", "anthropic", "google", "mock"]>>;
    baseUrl: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    apiKey: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    defaultModelId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    enabled: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    protocol?: "openai_compatible" | "anthropic" | "google" | "mock" | undefined;
    baseUrl?: string | null | undefined;
    apiKey?: string | null | undefined;
    defaultModelId?: string | null | undefined;
    enabled?: boolean | undefined;
}, {
    name?: string | undefined;
    protocol?: "openai_compatible" | "anthropic" | "google" | "mock" | undefined;
    baseUrl?: string | null | undefined;
    apiKey?: string | null | undefined;
    defaultModelId?: string | null | undefined;
    enabled?: boolean | undefined;
}>;
export declare const modelCreateSchema: z.ZodObject<{
    providerId: z.ZodString;
    modelId: z.ZodString;
    displayName: z.ZodString;
    contextWindow: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    inputPerMTokUsd: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    outputPerMTokUsd: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    enabled: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    providerId: string;
    modelId: string;
    displayName: string;
    enabled?: boolean | undefined;
    contextWindow?: number | null | undefined;
    inputPerMTokUsd?: number | null | undefined;
    outputPerMTokUsd?: number | null | undefined;
}, {
    providerId: string;
    modelId: string;
    displayName: string;
    enabled?: boolean | undefined;
    contextWindow?: number | null | undefined;
    inputPerMTokUsd?: number | null | undefined;
    outputPerMTokUsd?: number | null | undefined;
}>;
export declare const modelUpdateSchema: z.ZodObject<Omit<{
    providerId: z.ZodOptional<z.ZodString>;
    modelId: z.ZodOptional<z.ZodString>;
    displayName: z.ZodOptional<z.ZodString>;
    contextWindow: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    inputPerMTokUsd: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    outputPerMTokUsd: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    enabled: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
}, "providerId">, "strip", z.ZodTypeAny, {
    enabled?: boolean | undefined;
    modelId?: string | undefined;
    displayName?: string | undefined;
    contextWindow?: number | null | undefined;
    inputPerMTokUsd?: number | null | undefined;
    outputPerMTokUsd?: number | null | undefined;
}, {
    enabled?: boolean | undefined;
    modelId?: string | undefined;
    displayName?: string | undefined;
    contextWindow?: number | null | undefined;
    inputPerMTokUsd?: number | null | undefined;
    outputPerMTokUsd?: number | null | undefined;
}>;
export declare const memberCreateSchema: z.ZodObject<{
    name: z.ZodString;
    modelId: z.ZodString;
    systemPrompt: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    temperature: z.ZodOptional<z.ZodNumber>;
    maxTokens: z.ZodOptional<z.ZodNullable<z.ZodNumber>>;
    avatarColor: z.ZodOptional<z.ZodString>;
    enabled: z.ZodOptional<z.ZodBoolean>;
}, "strip", z.ZodTypeAny, {
    name: string;
    modelId: string;
    enabled?: boolean | undefined;
    systemPrompt?: string | null | undefined;
    temperature?: number | undefined;
    maxTokens?: number | null | undefined;
    avatarColor?: string | undefined;
}, {
    name: string;
    modelId: string;
    enabled?: boolean | undefined;
    systemPrompt?: string | null | undefined;
    temperature?: number | undefined;
    maxTokens?: number | null | undefined;
    avatarColor?: string | undefined;
}>;
export declare const memberUpdateSchema: z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    modelId: z.ZodOptional<z.ZodString>;
    systemPrompt: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodString>>>;
    temperature: z.ZodOptional<z.ZodOptional<z.ZodNumber>>;
    maxTokens: z.ZodOptional<z.ZodOptional<z.ZodNullable<z.ZodNumber>>>;
    avatarColor: z.ZodOptional<z.ZodOptional<z.ZodString>>;
    enabled: z.ZodOptional<z.ZodOptional<z.ZodBoolean>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    enabled?: boolean | undefined;
    modelId?: string | undefined;
    systemPrompt?: string | null | undefined;
    temperature?: number | undefined;
    maxTokens?: number | null | undefined;
    avatarColor?: string | undefined;
}, {
    name?: string | undefined;
    enabled?: boolean | undefined;
    modelId?: string | undefined;
    systemPrompt?: string | null | undefined;
    temperature?: number | undefined;
    maxTokens?: number | null | undefined;
    avatarColor?: string | undefined;
}>;
export declare const strategyKindSchema: z.ZodEnum<["round_robin", "debate"]>;
export declare const councilCreateSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodString;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    strategy: z.ZodEnum<["round_robin", "debate"]>;
    rounds: z.ZodNumber;
    memberIds: z.ZodArray<z.ZodString, "many">;
    moderatorMemberId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name: string;
    strategy: "round_robin" | "debate";
    rounds: number;
    memberIds: string[];
    description?: string | null | undefined;
    moderatorMemberId?: string | null | undefined;
}, {
    name: string;
    strategy: "round_robin" | "debate";
    rounds: number;
    memberIds: string[];
    description?: string | null | undefined;
    moderatorMemberId?: string | null | undefined;
}>, {
    name: string;
    strategy: "round_robin" | "debate";
    rounds: number;
    memberIds: string[];
    description?: string | null | undefined;
    moderatorMemberId?: string | null | undefined;
}, {
    name: string;
    strategy: "round_robin" | "debate";
    rounds: number;
    memberIds: string[];
    description?: string | null | undefined;
    moderatorMemberId?: string | null | undefined;
}>;
export declare const councilUpdateSchema: z.ZodEffects<z.ZodObject<{
    name: z.ZodOptional<z.ZodString>;
    description: z.ZodOptional<z.ZodNullable<z.ZodString>>;
    strategy: z.ZodOptional<z.ZodEnum<["round_robin", "debate"]>>;
    rounds: z.ZodOptional<z.ZodNumber>;
    memberIds: z.ZodOptional<z.ZodArray<z.ZodString, "many">>;
    moderatorMemberId: z.ZodOptional<z.ZodNullable<z.ZodString>>;
}, "strip", z.ZodTypeAny, {
    name?: string | undefined;
    description?: string | null | undefined;
    strategy?: "round_robin" | "debate" | undefined;
    rounds?: number | undefined;
    memberIds?: string[] | undefined;
    moderatorMemberId?: string | null | undefined;
}, {
    name?: string | undefined;
    description?: string | null | undefined;
    strategy?: "round_robin" | "debate" | undefined;
    rounds?: number | undefined;
    memberIds?: string[] | undefined;
    moderatorMemberId?: string | null | undefined;
}>, {
    name?: string | undefined;
    description?: string | null | undefined;
    strategy?: "round_robin" | "debate" | undefined;
    rounds?: number | undefined;
    memberIds?: string[] | undefined;
    moderatorMemberId?: string | null | undefined;
}, {
    name?: string | undefined;
    description?: string | null | undefined;
    strategy?: "round_robin" | "debate" | undefined;
    rounds?: number | undefined;
    memberIds?: string[] | undefined;
    moderatorMemberId?: string | null | undefined;
}>;
export declare const sessionCreateSchema: z.ZodObject<{
    councilId: z.ZodString;
    topic: z.ZodString;
}, "strip", z.ZodTypeAny, {
    councilId: string;
    topic: string;
}, {
    councilId: string;
    topic: string;
}>;
