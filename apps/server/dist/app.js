/** Fastify app factory: plugins, db, engine wiring, routes. */
import Fastify from 'fastify';
import { randomUUID } from 'node:crypto';
/** Engine DB callbacks used by the runner (kept here to avoid circular imports). */
export function makeRunnerDbHelpers(db) {
    return {
        recordUsage(u) {
            db.prepare(`INSERT INTO usage_events (session_id, member_name, provider_name, model_name,
          prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).run(u.sessionId, u.memberName, u.providerName || null, u.modelName, u.promptTokens, u.completionTokens, u.promptTokens + u.completionTokens, u.costUsd, u.latencyMs, u.status);
        },
        insertMessage(m) {
            const role = m.kind === 'user' ? 'user' : 'assistant';
            const info = db
                .prepare(`INSERT INTO messages (session_id, member_id, member_name, role, kind, round, content)
           VALUES (?, ?, ?, ?, ?, ?, ?)`)
                .run(m.sessionId, m.memberId, m.memberName, role, m.kind, m.round, m.content);
            return Number(info.lastInsertRowid);
        },
        loadCouncil(councilId) {
            const c = db.prepare('SELECT * FROM councils WHERE id = ?').get(councilId);
            if (!c)
                return null;
            const members = db
                .prepare(`SELECT mem.* FROM members mem JOIN council_members cm ON cm.member_id = mem.id AND cm.council_id = ?
           ORDER BY cm.position`)
                .all(councilId);
            return {
                id: c.id,
                name: c.name,
                strategy: c.strategy,
                rounds: c.rounds,
                moderatorMemberId: c.moderator_member_id,
                members: members.map((r) => ({
                    id: r.id,
                    name: r.name,
                    modelId: r.model_id ?? '',
                    systemPrompt: r.system_prompt,
                    temperature: r.temperature,
                    maxTokens: r.max_tokens,
                    avatarColor: r.avatar_color,
                    enabled: !!r.enabled,
                })),
            };
        },
        loadModelForChat(modelId) {
            const row = db
                .prepare(`SELECT m.model_id AS modelId, p.protocol AS providerProtocol, p.base_url AS providerBaseUrl,
                  p.api_key_encrypted AS apiKeyEncrypted, m.input_per_mtok_usd AS inputPerMTokUsd,
                  m.output_per_mtok_usd AS outputPerMTokUsd
           FROM models m JOIN providers p ON p.id = m.provider_id WHERE m.id = ?`)
                .get(modelId);
            return row ?? null;
        },
        updateSessionStatus(sessionId, status, error) {
            if (status === 'running') {
                db.prepare(`UPDATE sessions SET status='running', started_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(sessionId);
            }
            else {
                db.prepare(`UPDATE sessions SET status=?, completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), error=COALESCE(?, error) WHERE id=?`).run(status, error ?? null, sessionId);
            }
        },
    };
}
export async function buildApp(deps) {
    const app = Fastify({ logger: { level: deps.config.logLevel } });
    const { registerErrorHandlers } = await import('./lib/errors.js');
    registerErrorHandlers(app);
    app.get('/api/v1/health', async () => ({ ok: true, version: '0.1.0', instanceId: randomUUID() }));
    const { registerProviderRoutes } = await import('./routes/providers.js');
    registerProviderRoutes(app, deps.db);
    const { registerMemberCouncilRoutes } = await import('./routes/councils.js');
    registerMemberCouncilRoutes(app, deps.db);
    const { registerSessionRoutes } = await import('./routes/sessions.js');
    registerSessionRoutes(app, { db: deps.db, bus: deps.bus, sessions: deps.sessions });
    const { registerActivityRoutes } = await import('./routes/activity.js');
    registerActivityRoutes(app, deps.db);
    return app;
}
//# sourceMappingURL=app.js.map