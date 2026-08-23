export function providerToDTO(r) {
    return {
        id: r.id,
        name: r.name,
        protocol: r.protocol,
        baseUrl: r.base_url,
        defaultModelId: r.default_model_id,
        enabled: !!r.enabled,
        hasApiKey: !!r.api_key_encrypted,
        createdAt: r.created_at,
    };
}
export function modelToDTO(r) {
    return {
        id: r.id,
        providerId: r.provider_id,
        modelId: r.model_id,
        displayName: r.display_name,
        contextWindow: r.context_window,
        inputPerMTokUsd: r.input_per_mtok_usd,
        outputPerMTokUsd: r.output_per_mtok_usd,
        enabled: !!r.enabled,
    };
}
export function memberToDTO(r) {
    return {
        id: r.id,
        name: r.name,
        modelId: r.model_id ?? '',
        systemPrompt: r.system_prompt,
        temperature: r.temperature,
        maxTokens: r.max_tokens,
        avatarColor: r.avatar_color,
        enabled: !!r.enabled,
        modelName: r.model_display_name ?? null,
        providerName: r.provider_name ?? null,
    };
}
export function councilToDTO(r, members) {
    return {
        id: r.id,
        name: r.name,
        description: r.description,
        strategy: r.strategy,
        rounds: r.rounds,
        moderatorMemberId: r.moderator_member_id,
        members,
        createdAt: r.created_at,
    };
}
export function messageToDTO(r) {
    return {
        id: String(r.id),
        sessionId: r.session_id,
        memberId: r.member_id,
        memberName: r.member_name || 'Unknown',
        role: r.role,
        kind: r.kind,
        round: r.round,
        content: r.content,
        createdAt: r.created_at,
    };
}
export function sessionToDTO(r) {
    return {
        id: r.id,
        councilId: r.council_id,
        councilName: r.council_name,
        topic: r.topic,
        status: r.status,
        error: r.error,
        startedAt: r.started_at,
        completedAt: r.completed_at,
        messageCount: r.message_count,
        createdAt: r.created_at,
    };
}
export function logActivity(db, action, detail) {
    db.prepare('INSERT INTO activity_log (action, detail) VALUES (?, ?)')
        .run(action, detail ? JSON.stringify(detail) : null);
}
//# sourceMappingURL=mappers.js.map