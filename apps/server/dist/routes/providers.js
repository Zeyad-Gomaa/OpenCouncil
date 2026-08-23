import { randomUUID } from 'node:crypto';
import { encryptSecret } from '../vault/crypto.js';
import { AppError } from '../lib/errors.js';
import { modelCreateSchema, modelUpdateSchema, providerCreateSchema, providerUpdateSchema, } from '@opencouncil/shared';
import { logActivity, modelToDTO, providerToDTO } from './mappers.js';
const PROVIDER_PRESETS = {
    openai: { protocol: 'openai_compatible', baseUrl: 'https://api.openai.com/v1' },
    openrouter: { protocol: 'openai_compatible', baseUrl: 'https://openrouter.ai/api/v1' },
    groq: { protocol: 'openai_compatible', baseUrl: 'https://api.groq.com/openai/v1' },
    together: { protocol: 'openai_compatible', baseUrl: 'https://api.together.xyz/v1' },
    deepseek: { protocol: 'openai_compatible', baseUrl: 'https://api.deepseek.com/v1' },
    mistral: { protocol: 'openai_compatible', baseUrl: 'https://api.mistral.ai/v1' },
    xai: { protocol: 'openai_compatible', baseUrl: 'https://api.x.ai/v1' },
    ollama: { protocol: 'openai_compatible', baseUrl: 'http://localhost:11434/v1' },
    lmstudio: { protocol: 'openai_compatible', baseUrl: 'http://localhost:1234/v1' },
    vllm: { protocol: 'openai_compatible' },
    anthropic: { protocol: 'anthropic' },
    google: { protocol: 'google' },
};
export function registerProviderRoutes(app, db) {
    app.get('/api/v1/meta/providers', async () => ({
        protocols: ['openai_compatible', 'anthropic', 'google', 'mock'],
        presets: Object.entries(PROVIDER_PRESETS).map(([key, v]) => ({ key, ...v })),
    }));
    app.get('/api/v1/providers', async () => {
        const rows = db.prepare('SELECT * FROM providers ORDER BY created_at').all();
        return rows.map(providerToDTO);
    });
    app.post('/api/v1/providers', async (req, reply) => {
        const body = providerCreateSchema.parse(req.body);
        const id = randomUUID();
        db.prepare(`INSERT INTO providers (id, name, protocol, base_url, api_key_encrypted, default_model_id, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`).run(id, body.name, body.protocol, body.baseUrl ?? null, body.apiKey ? encryptSecret(body.apiKey) : null, body.defaultModelId ?? null, body.enabled === false ? 0 : 1);
        logActivity(db, 'provider.created', { id, name: body.name });
        reply.code(201);
        const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
        return providerToDTO(row);
    });
    app.patch('/api/v1/providers/:id', async (req) => {
        const { id } = req.params;
        const row = db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
        if (!row)
            throw new AppError(404, 'not_found', 'provider not found');
        const body = providerUpdateSchema.parse(req.body);
        const cur = row;
        const next = {
            name: body.name ?? cur.name,
            protocol: body.protocol ?? cur.protocol,
            base_url: body.baseUrl === undefined ? cur.base_url : body.baseUrl,
            default_model_id: body.defaultModelId === undefined ? cur.default_model_id : body.defaultModelId,
            enabled: body.enabled === undefined ? cur.enabled : body.enabled ? 1 : 0,
            api_key_encrypted: body.apiKey === undefined
                ? cur.api_key_encrypted
                : body.apiKey === null || body.apiKey === ''
                    ? null
                    : encryptSecret(body.apiKey),
        };
        db.prepare(`UPDATE providers SET name=?, protocol=?, base_url=?, default_model_id=?, enabled=?, api_key_encrypted=?,
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(next.name, next.protocol, next.base_url, next.default_model_id, next.enabled, next.api_key_encrypted, id);
        logActivity(db, 'provider.updated', { id });
        const updated = db.prepare('SELECT * FROM providers WHERE id = ?').get(id);
        return providerToDTO(updated);
    });
    app.delete('/api/v1/providers/:id', async (req) => {
        const { id } = req.params;
        // Disable members whose models die with this provider.
        db.prepare(`UPDATE members SET enabled = 0
       WHERE model_id IN (SELECT m.id FROM models m WHERE m.provider_id = ?)`).run(id);
        db.prepare('DELETE FROM providers WHERE id = ?').run(id);
        logActivity(db, 'provider.deleted', { id });
        return { ok: true };
    });
    // ---- models ----
    app.get('/api/v1/models', async (req) => {
        const { providerId } = req.query;
        const rows = (providerId
            ? db.prepare('SELECT * FROM models WHERE provider_id = ? ORDER BY display_name').all(providerId)
            : db.prepare('SELECT * FROM models ORDER BY display_name').all());
        return rows.map(modelToDTO);
    });
    app.post('/api/v1/models', async (req, reply) => {
        const body = modelCreateSchema.parse(req.body);
        const prov = db.prepare('SELECT id FROM providers WHERE id = ?').get(body.providerId);
        if (!prov)
            throw new AppError(404, 'not_found', 'provider not found');
        const id = randomUUID();
        try {
            db.prepare(`INSERT INTO models (id, provider_id, model_id, display_name, context_window, input_per_mtok_usd, output_per_mtok_usd, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`).run(id, body.providerId, body.modelId, body.displayName, body.contextWindow ?? null, body.inputPerMTokUsd ?? null, body.outputPerMTokUsd ?? null, body.enabled === false ? 0 : 1);
        }
        catch (err) {
            if (err instanceof Error && err.message.includes('UNIQUE')) {
                throw new AppError(409, 'duplicate', 'model already registered for this provider');
            }
            throw err;
        }
        logActivity(db, 'model.created', { id, modelId: body.modelId });
        reply.code(201);
        return modelToDTO(db.prepare('SELECT * FROM models WHERE id = ?').get(id));
    });
    app.patch('/api/v1/models/:id', async (req) => {
        const { id } = req.params;
        const cur = db.prepare('SELECT * FROM models WHERE id = ?').get(id);
        if (!cur)
            throw new AppError(404, 'not_found', 'model not found');
        const body = modelUpdateSchema.parse(req.body);
        const c = cur;
        db.prepare(`UPDATE models SET model_id=?, display_name=?, context_window=?, input_per_mtok_usd=?, output_per_mtok_usd=?, enabled=? WHERE id=?`).run(body.modelId ?? c.model_id, body.displayName ?? c.display_name, body.contextWindow ?? c.context_window, body.inputPerMTokUsd ?? c.input_per_mtok_usd, body.outputPerMTokUsd ?? c.output_per_mtok_usd, body.enabled === undefined ? c.enabled : body.enabled ? 1 : 0, id);
        return modelToDTO(db.prepare('SELECT * FROM models WHERE id = ?').get(id));
    });
    app.delete('/api/v1/models/:id', async (req) => {
        const { id } = req.params;
        db.prepare('UPDATE members SET enabled = 0 WHERE model_id = ?').run(id);
        db.prepare('DELETE FROM models WHERE id = ?').run(id);
        logActivity(db, 'model.deleted', { id });
        return { ok: true };
    });
}
//# sourceMappingURL=providers.js.map