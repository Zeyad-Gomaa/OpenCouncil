var __defProp = Object.defineProperty;
var __getOwnPropNames = Object.getOwnPropertyNames;
var __esm = (fn, res) => function __init() {
  return fn && (res = (0, fn[__getOwnPropNames(fn)[0]])(fn = 0)), res;
};
var __export = (target, all) => {
  for (var name in all)
    __defProp(target, name, { get: all[name], enumerable: true });
};

// apps/server/src/vault/crypto.ts
import { createCipheriv, createDecipheriv, randomBytes as randomBytes2, scryptSync } from "node:crypto";
function deriveKey(secret) {
  return scryptSync(secret, "opencouncil.vault.v1", 32);
}
function initVault(secret) {
  cachedKey = deriveKey(secret);
}
function getKey() {
  if (!cachedKey) {
    throw new Error("vault: not initialized \u2014 call initVault() before encrypt/decrypt");
  }
  return cachedKey;
}
function encryptSecret(plain) {
  const iv = randomBytes2(IV_LEN);
  const cipher = createCipheriv(ALGO, getKey(), iv);
  const enc = Buffer.concat([cipher.update(plain, "utf8"), cipher.final()]);
  return [iv.toString("base64"), cipher.getAuthTag().toString("base64"), enc.toString("base64")].join(":");
}
function decryptSecret(payload) {
  const [ivB64, tagB64, dataB64] = payload.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("vault: malformed ciphertext");
  const decipher = createDecipheriv(ALGO, getKey(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([decipher.update(Buffer.from(dataB64, "base64")), decipher.final()]).toString("utf8");
}
var ALGO, IV_LEN, cachedKey;
var init_crypto = __esm({
  "apps/server/src/vault/crypto.ts"() {
    "use strict";
    ALGO = "aes-256-gcm";
    IV_LEN = 12;
    cachedKey = null;
  }
});

// apps/server/src/lib/http.ts
async function httpJson(url, opts) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(new TimeoutError("provider request timed out")), opts.timeoutMs);
  const onOuterAbort = () => controller.abort(new TimeoutError("session cancelled"));
  opts.signal?.addEventListener("abort", onOuterAbort, { once: true });
  try {
    const res = await fetch(url, {
      method: opts.method ?? "POST",
      headers: { "content-type": "application/json", ...opts.headers ?? {} },
      body: opts.body !== void 0 ? JSON.stringify(opts.body) : void 0,
      signal: controller.signal
    });
    if (res.status === 401 || res.status === 403) throw new AuthError(`provider rejected credentials (${res.status})`);
    if (res.status === 429) throw new RateLimitError("provider rate limit hit");
    if (!res.ok) throw new ProviderHttpError(res.status, await res.text().catch(() => ""));
    return await res.json();
  } catch (err) {
    if (err instanceof Error && err.name === "AbortError") {
      if (opts.signal?.aborted) throw new TimeoutError("cancelled");
      throw new TimeoutError("provider request timed out");
    }
    throw err;
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", onOuterAbort);
  }
}
var AuthError, RateLimitError, TimeoutError, ProviderHttpError;
var init_http = __esm({
  "apps/server/src/lib/http.ts"() {
    "use strict";
    AuthError = class extends Error {
      name = "AuthError";
    };
    RateLimitError = class extends Error {
      name = "RateLimitError";
    };
    TimeoutError = class extends Error {
      name = "TimeoutError";
    };
    ProviderHttpError = class extends Error {
      constructor(status, body) {
        super(`provider HTTP ${status}: ${body.slice(0, 300)}`);
        this.status = status;
        this.name = "ProviderHttpError";
      }
    };
  }
});

// apps/server/src/lib/errors.ts
var errors_exports = {};
__export(errors_exports, {
  AppError: () => AppError,
  mapProviderError: () => mapProviderError,
  registerErrorHandlers: () => registerErrorHandlers
});
function mapProviderError(err) {
  if (err instanceof AuthError) return new AppError(401, "provider_auth", err.message);
  if (err instanceof RateLimitError) return new AppError(429, "provider_rate_limit", err.message);
  if (err instanceof TimeoutError) return new AppError(504, "provider_timeout", err.message);
  if (err instanceof ProviderHttpError)
    return new AppError(502, "provider_http", err.message, { status: err.status });
  if (err instanceof AppError) return err;
  return new AppError(500, "internal", err instanceof Error ? err.message : "unknown error");
}
function registerErrorHandlers(app) {
  app.setErrorHandler((err, _req, reply) => {
    const mapped = err instanceof AppError ? err : mapProviderError(err);
    if (mapped.statusCode >= 500) {
      app.log.error({ err }, mapped.message);
    } else {
      app.log.warn({ code: mapped.code }, mapped.message);
    }
    reply.status(mapped.statusCode).send({
      error: { code: mapped.code, message: mapped.message, details: mapped.details }
    });
  });
}
var AppError;
var init_errors = __esm({
  "apps/server/src/lib/errors.ts"() {
    "use strict";
    init_http();
    AppError = class extends Error {
      constructor(statusCode, code, message, details) {
        super(message);
        this.statusCode = statusCode;
        this.code = code;
        this.details = details;
      }
    };
  }
});

// packages/shared/dist/domain.js
var init_domain = __esm({
  "packages/shared/dist/domain.js"() {
    "use strict";
  }
});

// packages/shared/dist/events.js
var init_events = __esm({
  "packages/shared/dist/events.js"() {
    "use strict";
  }
});

// packages/shared/dist/schemas.js
import { z as z2 } from "zod";
var providerProtocolSchema, providerCreateSchema, providerUpdateSchema, modelCreateSchema, modelUpdateSchema, memberCreateSchema, memberUpdateSchema, strategyKindSchema, councilCreateSchema, councilUpdateSchema, sessionCreateSchema;
var init_schemas = __esm({
  "packages/shared/dist/schemas.js"() {
    "use strict";
    providerProtocolSchema = z2.enum(["openai_compatible", "anthropic", "google", "mock"]);
    providerCreateSchema = z2.object({
      name: z2.string().min(1).max(80),
      protocol: providerProtocolSchema,
      baseUrl: z2.string().url().optional(),
      apiKey: z2.string().max(4096).optional(),
      defaultModelId: z2.string().max(200).nullish(),
      enabled: z2.boolean().optional()
    });
    providerUpdateSchema = z2.object({
      name: z2.string().min(1).max(80).optional(),
      protocol: providerProtocolSchema.optional(),
      baseUrl: z2.string().url().nullable().optional(),
      apiKey: z2.string().max(4096).nullable().optional(),
      defaultModelId: z2.string().max(200).nullable().optional(),
      enabled: z2.boolean().optional()
    });
    modelCreateSchema = z2.object({
      providerId: z2.string().uuid(),
      modelId: z2.string().min(1).max(200),
      displayName: z2.string().min(1).max(120),
      contextWindow: z2.number().int().positive().max(1e8).nullish(),
      inputPerMTokUsd: z2.number().nonnegative().nullish(),
      outputPerMTokUsd: z2.number().nonnegative().nullish(),
      enabled: z2.boolean().optional()
    });
    modelUpdateSchema = modelCreateSchema.partial().omit({ providerId: true });
    memberCreateSchema = z2.object({
      name: z2.string().min(1).max(60),
      modelId: z2.string().uuid(),
      systemPrompt: z2.string().max(2e4).nullish(),
      temperature: z2.number().min(0).max(2).optional(),
      maxTokens: z2.number().int().positive().max(2e5).nullish(),
      avatarColor: z2.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      enabled: z2.boolean().optional()
    });
    memberUpdateSchema = memberCreateSchema.partial();
    strategyKindSchema = z2.enum(["round_robin", "debate"]);
    councilCreateSchema = z2.object({
      name: z2.string().min(1).max(80),
      description: z2.string().max(500).nullish(),
      strategy: strategyKindSchema,
      rounds: z2.number().int().min(1).max(10),
      memberIds: z2.array(z2.string().uuid()).min(1).max(12),
      moderatorMemberId: z2.string().uuid().nullish()
    }).refine((c) => !c.moderatorMemberId || c.memberIds.includes(c.moderatorMemberId), {
      message: "moderator must be one of the council members"
    });
    councilUpdateSchema = z2.object({
      name: z2.string().min(1).max(80).optional(),
      description: z2.string().max(500).nullable().optional(),
      strategy: strategyKindSchema.optional(),
      rounds: z2.number().int().min(1).max(10).optional(),
      memberIds: z2.array(z2.string().uuid()).min(1).max(12).optional(),
      moderatorMemberId: z2.string().uuid().nullable().optional()
    }).refine((c) => !c.moderatorMemberId || (c.memberIds ? c.memberIds.includes(c.moderatorMemberId) : true), {
      message: "moderator must be one of the council members"
    });
    sessionCreateSchema = z2.object({
      councilId: z2.string().uuid(),
      topic: z2.string().min(1).max(8e3)
    });
  }
});

// packages/shared/dist/index.js
var init_dist = __esm({
  "packages/shared/dist/index.js"() {
    "use strict";
    init_domain();
    init_events();
    init_schemas();
  }
});

// apps/server/src/routes/mappers.ts
function providerToDTO(r) {
  return {
    id: r.id,
    name: r.name,
    protocol: r.protocol,
    baseUrl: r.base_url,
    defaultModelId: r.default_model_id,
    enabled: !!r.enabled,
    hasApiKey: !!r.api_key_encrypted,
    createdAt: r.created_at
  };
}
function modelToDTO(r) {
  return {
    id: r.id,
    providerId: r.provider_id,
    modelId: r.model_id,
    displayName: r.display_name,
    contextWindow: r.context_window,
    inputPerMTokUsd: r.input_per_mtok_usd,
    outputPerMTokUsd: r.output_per_mtok_usd,
    enabled: !!r.enabled
  };
}
function memberToDTO(r) {
  return {
    id: r.id,
    name: r.name,
    modelId: r.model_id ?? "",
    systemPrompt: r.system_prompt,
    temperature: r.temperature,
    maxTokens: r.max_tokens,
    avatarColor: r.avatar_color,
    enabled: !!r.enabled,
    modelName: r.model_display_name ?? null,
    providerName: r.provider_name ?? null
  };
}
function councilToDTO(r, members) {
  return {
    id: r.id,
    name: r.name,
    description: r.description,
    strategy: r.strategy,
    rounds: r.rounds,
    moderatorMemberId: r.moderator_member_id,
    members,
    createdAt: r.created_at
  };
}
function messageToDTO(r) {
  return {
    id: String(r.id),
    sessionId: r.session_id,
    memberId: r.member_id,
    memberName: r.member_name || "Unknown",
    role: r.role,
    kind: r.kind,
    round: r.round,
    content: r.content,
    createdAt: r.created_at
  };
}
function sessionToDTO(r) {
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
    createdAt: r.created_at
  };
}
function logActivity(db, action, detail) {
  db.prepare("INSERT INTO activity_log (action, detail) VALUES (?, ?)").run(action, detail ? JSON.stringify(detail) : null);
}
var init_mappers = __esm({
  "apps/server/src/routes/mappers.ts"() {
    "use strict";
  }
});

// apps/server/src/routes/providers.ts
var providers_exports = {};
__export(providers_exports, {
  registerProviderRoutes: () => registerProviderRoutes
});
import { randomUUID as randomUUID2 } from "node:crypto";
function registerProviderRoutes(app, db) {
  app.get("/api/v1/meta/providers", async () => ({
    protocols: ["openai_compatible", "anthropic", "google", "mock"],
    presets: Object.entries(PROVIDER_PRESETS).map(([key, v]) => ({ key, ...v }))
  }));
  app.get("/api/v1/providers", async () => {
    const rows = db.prepare("SELECT * FROM providers ORDER BY created_at").all();
    return rows.map(providerToDTO);
  });
  app.post("/api/v1/providers", async (req, reply) => {
    const body = providerCreateSchema.parse(req.body);
    const id = randomUUID2();
    db.prepare(
      `INSERT INTO providers (id, name, protocol, base_url, api_key_encrypted, default_model_id, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.name,
      body.protocol,
      body.baseUrl ?? null,
      body.apiKey ? encryptSecret(body.apiKey) : null,
      body.defaultModelId ?? null,
      body.enabled === false ? 0 : 1
    );
    logActivity(db, "provider.created", { id, name: body.name });
    reply.code(201);
    const row = db.prepare("SELECT * FROM providers WHERE id = ?").get(id);
    return providerToDTO(row);
  });
  app.patch("/api/v1/providers/:id", async (req) => {
    const { id } = req.params;
    const row = db.prepare("SELECT * FROM providers WHERE id = ?").get(id);
    if (!row) throw new AppError(404, "not_found", "provider not found");
    const body = providerUpdateSchema.parse(req.body);
    const cur = row;
    const next = {
      name: body.name ?? cur.name,
      protocol: body.protocol ?? cur.protocol,
      base_url: body.baseUrl === void 0 ? cur.base_url : body.baseUrl,
      default_model_id: body.defaultModelId === void 0 ? cur.default_model_id : body.defaultModelId,
      enabled: body.enabled === void 0 ? cur.enabled : body.enabled ? 1 : 0,
      api_key_encrypted: body.apiKey === void 0 ? cur.api_key_encrypted : body.apiKey === null || body.apiKey === "" ? null : encryptSecret(body.apiKey)
    };
    db.prepare(
      `UPDATE providers SET name=?, protocol=?, base_url=?, default_model_id=?, enabled=?, api_key_encrypted=?,
       updated_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`
    ).run(next.name, next.protocol, next.base_url, next.default_model_id, next.enabled, next.api_key_encrypted, id);
    logActivity(db, "provider.updated", { id });
    const updated = db.prepare("SELECT * FROM providers WHERE id = ?").get(id);
    return providerToDTO(updated);
  });
  app.delete("/api/v1/providers/:id", async (req) => {
    const { id } = req.params;
    db.prepare(
      `UPDATE members SET enabled = 0
       WHERE model_id IN (SELECT m.id FROM models m WHERE m.provider_id = ?)`
    ).run(id);
    db.prepare("DELETE FROM providers WHERE id = ?").run(id);
    logActivity(db, "provider.deleted", { id });
    return { ok: true };
  });
  app.get("/api/v1/models", async (req) => {
    const { providerId } = req.query;
    const rows = providerId ? db.prepare("SELECT * FROM models WHERE provider_id = ? ORDER BY display_name").all(providerId) : db.prepare("SELECT * FROM models ORDER BY display_name").all();
    return rows.map(modelToDTO);
  });
  app.post("/api/v1/models", async (req, reply) => {
    const body = modelCreateSchema.parse(req.body);
    const prov = db.prepare("SELECT id FROM providers WHERE id = ?").get(body.providerId);
    if (!prov) throw new AppError(404, "not_found", "provider not found");
    const id = randomUUID2();
    try {
      db.prepare(
        `INSERT INTO models (id, provider_id, model_id, display_name, context_window, input_per_mtok_usd, output_per_mtok_usd, enabled)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        id,
        body.providerId,
        body.modelId,
        body.displayName,
        body.contextWindow ?? null,
        body.inputPerMTokUsd ?? null,
        body.outputPerMTokUsd ?? null,
        body.enabled === false ? 0 : 1
      );
    } catch (err) {
      if (err instanceof Error && err.message.includes("UNIQUE")) {
        throw new AppError(409, "duplicate", "model already registered for this provider");
      }
      throw err;
    }
    logActivity(db, "model.created", { id, modelId: body.modelId });
    reply.code(201);
    return modelToDTO(db.prepare("SELECT * FROM models WHERE id = ?").get(id));
  });
  app.patch("/api/v1/models/:id", async (req) => {
    const { id } = req.params;
    const cur = db.prepare("SELECT * FROM models WHERE id = ?").get(id);
    if (!cur) throw new AppError(404, "not_found", "model not found");
    const body = modelUpdateSchema.parse(req.body);
    const c = cur;
    db.prepare(
      `UPDATE models SET model_id=?, display_name=?, context_window=?, input_per_mtok_usd=?, output_per_mtok_usd=?, enabled=? WHERE id=?`
    ).run(
      body.modelId ?? c.model_id,
      body.displayName ?? c.display_name,
      body.contextWindow ?? c.context_window,
      body.inputPerMTokUsd ?? c.input_per_mtok_usd,
      body.outputPerMTokUsd ?? c.output_per_mtok_usd,
      body.enabled === void 0 ? c.enabled : body.enabled ? 1 : 0,
      id
    );
    return modelToDTO(db.prepare("SELECT * FROM models WHERE id = ?").get(id));
  });
  app.delete("/api/v1/models/:id", async (req) => {
    const { id } = req.params;
    db.prepare("UPDATE members SET enabled = 0 WHERE model_id = ?").run(id);
    db.prepare("DELETE FROM models WHERE id = ?").run(id);
    logActivity(db, "model.deleted", { id });
    return { ok: true };
  });
}
var PROVIDER_PRESETS;
var init_providers = __esm({
  "apps/server/src/routes/providers.ts"() {
    "use strict";
    init_crypto();
    init_errors();
    init_dist();
    init_mappers();
    PROVIDER_PRESETS = {
      openai: { protocol: "openai_compatible", baseUrl: "https://api.openai.com/v1" },
      openrouter: { protocol: "openai_compatible", baseUrl: "https://openrouter.ai/api/v1" },
      groq: { protocol: "openai_compatible", baseUrl: "https://api.groq.com/openai/v1" },
      together: { protocol: "openai_compatible", baseUrl: "https://api.together.xyz/v1" },
      deepseek: { protocol: "openai_compatible", baseUrl: "https://api.deepseek.com/v1" },
      mistral: { protocol: "openai_compatible", baseUrl: "https://api.mistral.ai/v1" },
      xai: { protocol: "openai_compatible", baseUrl: "https://api.x.ai/v1" },
      ollama: { protocol: "openai_compatible", baseUrl: "http://localhost:11434/v1" },
      lmstudio: { protocol: "openai_compatible", baseUrl: "http://localhost:1234/v1" },
      vllm: { protocol: "openai_compatible" },
      anthropic: { protocol: "anthropic" },
      google: { protocol: "google" }
    };
  }
});

// apps/server/src/routes/councils.ts
var councils_exports = {};
__export(councils_exports, {
  registerMemberCouncilRoutes: () => registerMemberCouncilRoutes
});
import { randomUUID as randomUUID3 } from "node:crypto";
function listMembers(db) {
  return db.prepare(`${MEMBER_JOIN} ORDER BY mem.created_at`).all();
}
function councilMembers(db, councilId) {
  return db.prepare(`${MEMBER_JOIN} JOIN council_members cm ON cm.member_id = mem.id AND cm.council_id = ? ORDER BY cm.position`).all(councilId);
}
function registerMemberCouncilRoutes(app, db) {
  app.get("/api/v1/members", async () => listMembers(db));
  app.post("/api/v1/members", async (req, reply) => {
    const body = memberCreateSchema.parse(req.body);
    const model = db.prepare("SELECT id FROM models WHERE id = ?").get(body.modelId);
    if (!model) throw new AppError(404, "not_found", "model not found");
    const id = randomUUID3();
    db.prepare(
      `INSERT INTO members (id, name, model_id, system_prompt, temperature, max_tokens, avatar_color, enabled)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
    ).run(
      id,
      body.name,
      body.modelId,
      body.systemPrompt ?? null,
      body.temperature ?? 0.7,
      body.maxTokens ?? null,
      body.avatarColor ?? "#c9a227",
      body.enabled === false ? 0 : 1
    );
    logActivity(db, "member.created", { id, name: body.name });
    reply.code(201);
    const row = db.prepare(`${MEMBER_JOIN} WHERE mem.id = ?`).get(id);
    return memberToDTO(row);
  });
  app.patch("/api/v1/members/:id", async (req) => {
    const { id } = req.params;
    const cur = db.prepare("SELECT * FROM members WHERE id = ?").get(id);
    if (!cur) throw new AppError(404, "not_found", "member not found");
    const body = memberUpdateSchema.parse(req.body);
    const c = cur;
    db.prepare(
      `UPDATE members SET name=?, model_id=?, system_prompt=?, temperature=?, max_tokens=?, avatar_color=?, enabled=? WHERE id=?`
    ).run(
      body.name ?? c.name,
      body.modelId ?? c.model_id,
      body.systemPrompt === void 0 ? c.system_prompt : body.systemPrompt,
      body.temperature ?? c.temperature,
      body.maxTokens === void 0 ? c.max_tokens : body.maxTokens,
      body.avatarColor ?? c.avatar_color,
      body.enabled === void 0 ? c.enabled : body.enabled ? 1 : 0,
      id
    );
    const row = db.prepare(`${MEMBER_JOIN} WHERE mem.id = ?`).get(id);
    return memberToDTO(row);
  });
  app.delete("/api/v1/messages/:id", async () => {
    throw new AppError(405, "immutable", "messages are immutable");
  });
  app.delete("/api/v1/members/:id", async (req) => {
    const { id } = req.params;
    db.prepare("UPDATE councils SET moderator_member_id = NULL WHERE moderator_member_id = ?").run(id);
    db.prepare("DELETE FROM members WHERE id = ?").run(id);
    logActivity(db, "member.deleted", { id });
    return { ok: true };
  });
  app.get("/api/v1/councils", async () => {
    const rows = db.prepare("SELECT * FROM councils ORDER BY created_at").all();
    return rows.map((r) => councilToDTO(r, councilMembers(db, r.id)));
  });
  app.get("/api/v1/councils/:id", async (req) => {
    const { id } = req.params;
    const r = db.prepare("SELECT * FROM councils WHERE id = ?").get(id);
    if (!r) throw new AppError(404, "not_found", "council not found");
    return councilToDTO(r, councilMembers(db, id));
  });
  app.post("/api/v1/councils", async (req, reply) => {
    const body = councilCreateSchema.parse(req.body);
    for (const mid of body.memberIds) {
      if (!db.prepare("SELECT id FROM members WHERE id = ?").get(mid)) {
        throw new AppError(404, "not_found", `member ${mid} not found`);
      }
    }
    const id = randomUUID3();
    db.prepare(
      `INSERT INTO councils (id, name, description, strategy, rounds, moderator_member_id) VALUES (?, ?, ?, ?, ?, ?)`
    ).run(id, body.name, body.description ?? null, body.strategy, body.rounds, body.moderatorMemberId ?? null);
    const insertCM = db.prepare("INSERT INTO council_members (council_id, member_id, position) VALUES (?, ?, ?)");
    body.memberIds.forEach((mid, i) => insertCM.run(id, mid, i));
    logActivity(db, "council.created", { id, name: body.name });
    reply.code(201);
    const row = db.prepare("SELECT * FROM councils WHERE id = ?").get(id);
    return councilToDTO(row, councilMembers(db, id));
  });
  app.patch("/api/v1/councils/:id", async (req) => {
    const { id } = req.params;
    const cur = db.prepare("SELECT * FROM councils WHERE id = ?").get(id);
    if (!cur) throw new AppError(404, "not_found", "council not found");
    const body = councilUpdateSchema.parse(req.body);
    const c = cur;
    db.prepare(`UPDATE councils SET name=?, description=?, strategy=?, rounds=?, moderator_member_id=? WHERE id=?`).run(
      body.name ?? c.name,
      body.description === void 0 ? c.description : body.description,
      body.strategy ?? c.strategy,
      body.rounds ?? c.rounds,
      body.moderatorMemberId === void 0 ? c.moderator_member_id : body.moderatorMemberId,
      id
    );
    if (body.memberIds) {
      for (const mid of body.memberIds) {
        if (!db.prepare("SELECT id FROM members WHERE id = ?").get(mid)) {
          throw new AppError(404, "not_found", `member ${mid} not found`);
        }
      }
      db.prepare("DELETE FROM council_members WHERE council_id = ?").run(id);
      const insertCM = db.prepare("INSERT INTO council_members (council_id, member_id, position) VALUES (?, ?, ?)");
      body.memberIds.forEach((mid, i) => insertCM.run(id, mid, i));
    }
    const row = db.prepare("SELECT * FROM councils WHERE id = ?").get(id);
    return councilToDTO(row, councilMembers(db, id));
  });
  app.delete("/api/v1/councils/:id", async (req) => {
    const { id } = req.params;
    db.prepare("DELETE FROM councils WHERE id = ?").run(id);
    logActivity(db, "council.deleted", { id });
    return { ok: true };
  });
}
var MEMBER_JOIN;
var init_councils = __esm({
  "apps/server/src/routes/councils.ts"() {
    "use strict";
    init_errors();
    init_dist();
    init_mappers();
    MEMBER_JOIN = `
  SELECT mem.*, m.display_name AS model_display_name, p.name AS provider_name
  FROM members mem
  LEFT JOIN models m ON m.id = mem.model_id
  LEFT JOIN providers p ON p.id = m.provider_id`;
  }
});

// apps/server/src/routes/sessions.ts
var sessions_exports = {};
__export(sessions_exports, {
  registerSessionRoutes: () => registerSessionRoutes
});
import { randomUUID as randomUUID4 } from "node:crypto";
function registerSessionRoutes(app, deps) {
  const { db, bus, sessions } = deps;
  app.get("/api/v1/sessions", async (req) => {
    const { status, limit } = req.query;
    const lim = Math.min(Math.max(parseInt(limit ?? "100", 10) || 100, 1), 500);
    const rows = status ? db.prepare(
      `SELECT s.*, c.name AS council_name,
             (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
             FROM sessions s JOIN councils c ON c.id = s.council_id
             WHERE s.status = ? ORDER BY s.created_at DESC LIMIT ?`
    ).all(status, lim) : db.prepare(
      `SELECT s.*, c.name AS council_name,
             (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
             FROM sessions s JOIN councils c ON c.id = s.council_id
             ORDER BY s.created_at DESC LIMIT ?`
    ).all(lim);
    return rows.map((r) => sessionToDTO(r));
  });
  app.post("/api/v1/sessions", async (req, reply) => {
    const body = sessionCreateSchema.parse(req.body);
    const council = db.prepare("SELECT id FROM councils WHERE id = ?").get(body.councilId);
    if (!council) throw new AppError(404, "not_found", "council not found");
    const id = randomUUID4();
    db.prepare(`INSERT INTO sessions (id, council_id, topic, status) VALUES (?, ?, ?, 'queued')`).run(
      id,
      body.councilId,
      body.topic
    );
    logActivity(db, "session.started", { sessionId: id, councilId: body.councilId });
    sessions.startSession(id, body.councilId, body.topic);
    reply.code(202);
    return sessionToDTO(db.prepare("SELECT * FROM sessions WHERE id = ?").get(id));
  });
  app.get("/api/v1/sessions/:id", async (req) => {
    const { id } = req.params;
    const row = db.prepare(
      `SELECT s.*, c.name AS council_name, c.moderator_member_id
         FROM sessions s JOIN councils c ON c.id = s.council_id WHERE s.id = ?`
    ).get(id);
    if (!row) throw new AppError(404, "not_found", "session not found");
    const msgs = db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY id").all(id);
    const usage = db.prepare(
      `SELECT COUNT(*) AS calls, COALESCE(SUM(total_tokens),0) AS tokens, COALESCE(SUM(cost_usd),0) AS cost
         FROM usage_events WHERE session_id = ? AND status = 'ok'`
    ).get(id);
    return {
      session: sessionToDTO(row),
      messages: msgs.map((m) => messageToDTO(m)),
      usage
    };
  });
  app.post("/api/v1/sessions/:id/cancel", async (req) => {
    const { id } = req.params;
    const row = db.prepare("SELECT status FROM sessions WHERE id = ?").get(id);
    if (!row) throw new AppError(404, "not_found", "session not found");
    const ok = sessions.cancel(id);
    if (!ok && row.status === "queued") {
      db.prepare("UPDATE sessions SET status='cancelled', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?").run(id);
    }
    return { ok: true };
  });
  app.get("/api/v1/sessions/:id/events", async (req, reply) => {
    const { id } = req.params;
    const exists = db.prepare("SELECT id FROM sessions WHERE id = ?").get(id);
    if (!exists) throw new AppError(404, "not_found", "session not found");
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream",
      "cache-control": "no-cache",
      connection: "keep-alive",
      "x-accel-buffering": "no"
    });
    reply.raw.write("retry: 2000\n\n");
    const existing = db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY id").all(id);
    for (const m of existing) {
      reply.raw.write(`data: ${JSON.stringify({ type: "message.replay", sessionId: id, message: messageToDTO(m) })}

`);
    }
    const unsub = bus.subscribe(id, (event) => {
      try {
        reply.raw.write(`data: ${JSON.stringify(event)}

`);
      } catch {
        unsub();
      }
    });
    req.raw.on("close", () => unsub());
  });
}
var init_sessions = __esm({
  "apps/server/src/routes/sessions.ts"() {
    "use strict";
    init_errors();
    init_dist();
    init_mappers();
  }
});

// apps/server/src/routes/activity.ts
var activity_exports = {};
__export(activity_exports, {
  registerActivityRoutes: () => registerActivityRoutes
});
function registerActivityRoutes(app, db) {
  app.get("/api/v1/activity/stats", async (req) => {
    const { days } = req.query;
    const nDays = Math.min(Math.max(parseInt(days ?? "30", 10) || 30, 1), 365);
    const totals = db.prepare(
      `SELECT
           (SELECT COUNT(*) FROM sessions) AS sessions,
           (SELECT COUNT(*) FROM messages WHERE kind IN ('discussion','synthesis')) AS messages,
           COALESCE(SUM(CASE WHEN status='ok' THEN prompt_tokens END),0) AS promptTokens,
           COALESCE(SUM(CASE WHEN status='ok' THEN completion_tokens END),0) AS completionTokens,
           COALESCE(SUM(CASE WHEN status='ok' THEN total_tokens END),0) AS totalTokens,
           COALESCE(SUM(cost_usd),0) AS costUsd,
           SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors
         FROM usage_events`
    ).get();
    const daily = db.prepare(
      `SELECT substr(created_at, 1, 10) AS day,
                COALESCE(SUM(total_tokens), 0) AS tokens,
                COALESCE(SUM(cost_usd), 0) AS costUsd
         FROM usage_events
         WHERE created_at >= datetime('now', ?)
         GROUP BY day ORDER BY day`
    ).all(`-${nDays} days`);
    function grouped(column) {
      return db.prepare(
        `SELECT COALESCE(${column}, 'unknown') AS name,
                  COALESCE(SUM(total_tokens), 0) AS tokens,
                  COUNT(*) AS messages,
                  COALESCE(SUM(cost_usd), 0) AS costUsd
           FROM usage_events WHERE status = 'ok'
           GROUP BY name ORDER BY tokens DESC LIMIT 20`
      ).all();
    }
    const recentLog = db.prepare("SELECT * FROM activity_log ORDER BY id DESC LIMIT 100").all();
    const stats = {
      totals: { ...totals, costUsd: Number(totals.costUsd.toFixed(4)) },
      daily,
      byMember: grouped("member_name"),
      byModel: grouped("model_name"),
      byProvider: grouped("provider_name")
    };
    return { ...stats, recentLog };
  });
}
var init_activity = __esm({
  "apps/server/src/routes/activity.ts"() {
    "use strict";
  }
});

// apps/server/src/config.ts
import { randomBytes } from "node:crypto";
import { mkdirSync } from "node:fs";
import path from "node:path";
import { z } from "zod";
var envSchema = z.object({
  HOST: z.string().default("127.0.0.1"),
  PORT: z.coerce.number().int().min(1).max(65535).default(4311),
  DATABASE_PATH: z.string().default("./data/opencouncil.db"),
  OPEN_COUNCIL_SECRET_KEY: z.string().min(8).optional(),
  SEED_DEMO_COUNCIL: z.string().default("true").transform((v) => v !== "false" && v !== "0"),
  LOG_LEVEL: z.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info")
});
function loadConfig(env = process.env) {
  const parsed = envSchema.parse(env);
  const isAbsolute = parsed.DATABASE_PATH.startsWith("/");
  let databasePath = parsed.DATABASE_PATH;
  if (!isAbsolute && !parsed.DATABASE_PATH.includes(process.cwd())) {
    databasePath = path.join(process.cwd(), parsed.DATABASE_PATH);
  }
  const dataDir = path.dirname(databasePath);
  mkdirSync(dataDir, { recursive: true });
  const secretKey = parsed.OPEN_COUNCIL_SECRET_KEY ?? randomBytes(32).toString("hex");
  return {
    host: parsed.HOST,
    port: parsed.PORT,
    databasePath,
    dataDir,
    hasDurableSecret: parsed.OPEN_COUNCIL_SECRET_KEY !== void 0,
    secretKey,
    seedDemoCouncil: parsed.SEED_DEMO_COUNCIL,
    logLevel: parsed.LOG_LEVEL
  };
}

// apps/server/src/index.ts
init_crypto();

// apps/server/src/db/connection.ts
import Database from "better-sqlite3";
function openDatabase(config) {
  const db = new Database(config.databasePath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  return db;
}
var MIGRATIONS = [
  {
    version: 1,
    name: "initial-schema",
    sql: `
CREATE TABLE providers (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  protocol TEXT NOT NULL CHECK (protocol IN ('openai_compatible','anthropic','google','mock')),
  base_url TEXT,
  api_key_encrypted TEXT,
  default_model_id TEXT,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE models (
  id TEXT PRIMARY KEY,
  provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
  model_id TEXT NOT NULL,
  display_name TEXT NOT NULL,
  context_window INTEGER,
  input_per_mtok_usd REAL,
  output_per_mtok_usd REAL,
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE (provider_id, model_id)
);

CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model_id TEXT NOT NULL REFERENCES models(id) ON DELETE SET NULL,
  system_prompt TEXT,
  temperature REAL NOT NULL DEFAULT 0.7,
  max_tokens INTEGER,
  avatar_color TEXT NOT NULL DEFAULT '#c9a227',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE councils (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  strategy TEXT NOT NULL DEFAULT 'round_robin' CHECK (strategy IN ('round_robin','debate')),
  rounds INTEGER NOT NULL DEFAULT 1 CHECK (rounds BETWEEN 1 AND 10),
  moderator_member_id TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE council_members (
  council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (council_id, member_id)
);

CREATE TABLE sessions (
  id TEXT PRIMARY KEY,
  council_id TEXT NOT NULL,
  topic TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','completed','failed','cancelled')),
  error TEXT,
  started_at TEXT,
  completed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_sessions_council ON sessions(council_id);
CREATE INDEX idx_sessions_status ON sessions(status);

CREATE TABLE messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  member_id TEXT,
  member_name TEXT NOT NULL DEFAULT '',
  role TEXT NOT NULL CHECK (role IN ('user','assistant')),
  kind TEXT NOT NULL CHECK (kind IN ('user','discussion','synthesis','system')),
  round INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_messages_session ON messages(session_id, id);

CREATE TABLE usage_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT,
  member_name TEXT,
  provider_name TEXT,
  model_name TEXT,
  prompt_tokens INTEGER NOT NULL DEFAULT 0,
  completion_tokens INTEGER NOT NULL DEFAULT 0,
  total_tokens INTEGER NOT NULL DEFAULT 0,
  cost_usd REAL,
  latency_ms INTEGER,
  status TEXT NOT NULL DEFAULT 'ok' CHECK (status IN ('ok','error')),
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
CREATE INDEX idx_usage_created ON usage_events(created_at);

CREATE TABLE activity_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  detail TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);

CREATE TABLE settings_kv (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
`
  }
];
function migrate(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)");
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version)
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    const tx = db.transaction(() => {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(m.version, m.name);
    });
    tx();
  }
}

// apps/server/src/db/seed.ts
import { randomUUID } from "node:crypto";
var PALETTE = ["#c9a227", "#4f86c6", "#a0522d", "#557a46", "#8e5ea2", "#b0413e"];
function seedDemoCouncil(db) {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM councils").get();
  if (existing.n > 0) return false;
  const providerId = randomUUID();
  db.prepare(
    `INSERT INTO providers (id, name, protocol, base_url, api_key_encrypted, default_model_id, enabled)
     VALUES (?, ?, 'mock', NULL, NULL, NULL, 1)`
  ).run(providerId, "Demo (Mock)");
  const models = [
    { id: randomUUID(), modelId: "demo-oracle", name: "Oracle of the East" },
    { id: randomUUID(), modelId: "demo-skeptic", name: "Skeptic of the West" },
    { id: randomUUID(), modelId: "demo-moderator", name: "Arbiter Prime" }
  ];
  const insertModel = db.prepare(
    `INSERT INTO models (id, provider_id, model_id, display_name, enabled) VALUES (?, ?, ?, ?, 1)`
  );
  for (const m of models) {
    insertModel.run(m.id, providerId, m.modelId, m.name);
  }
  const members = [
    {
      id: randomUUID(),
      name: "The Oracle",
      modelIdx: 0,
      prompt: "You are The Oracle \u2014 visionary, big-picture thinker. Propose bold, well-structured solutions and consider second-order effects.",
      color: PALETTE[0]
    },
    {
      id: randomUUID(),
      name: "The Skeptic",
      modelIdx: 1,
      prompt: "You are The Skeptic \u2014 ruthless stress-tester. Challenge assumptions, hunt for flaws, demand evidence. Concede only to strong arguments.",
      color: PALETTE[3]
    },
    {
      id: randomUUID(),
      name: "The Arbiter",
      modelIdx: 2,
      prompt: "You are The Arbiter \u2014 balanced chair. Weigh all positions fairly and synthesize the strongest consensus.",
      color: PALETTE[1]
    }
  ];
  const insertMember = db.prepare(
    `INSERT INTO members (id, name, model_id, system_prompt, temperature, max_tokens, avatar_color, enabled)
     VALUES (?, ?, ?, ?, 0.7, 1200, ?, 1)`
  );
  for (const m of members) {
    insertMember.run(m.id, m.name, models[m.modelIdx].id, m.prompt, m.color);
  }
  const councilId = randomUUID();
  db.prepare(
    `INSERT INTO councils (id, name, description, strategy, rounds, moderator_member_id)
     VALUES (?, 'Founding Council', 'Demo council running on the built-in mock provider.', 'debate', 2, ?)`
  ).run(councilId, members[2].id);
  const insertCM = db.prepare("INSERT INTO council_members (council_id, member_id, position) VALUES (?, ?, ?)");
  members.forEach((m, i) => insertCM.run(councilId, m.id, i));
  return true;
}

// apps/server/src/engine/bus.ts
import { EventEmitter } from "node:events";
var HEARTBEAT_MS = 15e3;
var SessionBus = class {
  emitters = /* @__PURE__ */ new Map();
  emitterFor(sessionId) {
    let em = this.emitters.get(sessionId);
    if (!em) {
      em = new EventEmitter();
      em.setMaxListeners(50);
      this.emitters.set(sessionId, em);
    }
    return em;
  }
  publish(event) {
    const em = this.emitters.get(event.sessionId);
    if (em) em.emit("event", event);
  }
  subscribe(sessionId, listener) {
    const em = this.emitterFor(sessionId);
    em.on("event", listener);
    const hb = setInterval(() => {
      try {
        em.emit("heartbeat");
      } catch {
      }
    }, HEARTBEAT_MS);
    return () => {
      em.off("event", listener);
      clearInterval(hb);
    };
  }
  closeSession(sessionId) {
    const em = this.emitters.get(sessionId);
    if (em) em.removeAllListeners();
    this.emitters.delete(sessionId);
  }
};

// apps/server/src/engine/runner.ts
init_crypto();

// apps/server/src/providers/anthropic.ts
init_http();
var anthropicAdapter = {
  protocol: "anthropic",
  defaultBaseUrl: "https://api.anthropic.com",
  async chat(opts) {
    const system = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const rest = opts.messages.filter((m) => m.role !== "system");
    const data = await httpJson(`${opts.baseUrl.replace(/\/$/, "")}/v1/messages`, {
      headers: {
        "x-api-key": opts.apiKey ?? "",
        "anthropic-version": "2023-06-01"
      },
      body: {
        model: opts.modelId,
        max_tokens: opts.maxTokens ?? 4096,
        ...system ? { system } : {},
        messages: rest.map((m) => ({ role: m.role === "assistant" ? "assistant" : "user", content: m.content })),
        temperature: opts.temperature
      },
      timeoutMs: opts.timeoutMs,
      signal: opts.signal
    });
    return {
      text: (data.content ?? []).filter((b) => b.type === "text").map((b) => b.text ?? "").join(""),
      promptTokens: data.usage?.input_tokens ?? null,
      completionTokens: data.usage?.output_tokens ?? null
    };
  }
};

// apps/server/src/providers/google.ts
init_http();
var googleAdapter = {
  protocol: "google",
  defaultBaseUrl: "https://generativelanguage.googleapis.com",
  async chat(opts) {
    const base = opts.baseUrl.replace(/\/$/, "");
    const url = `${base}/v1beta/models/${encodeURIComponent(opts.modelId)}:generateContent`;
    const system = opts.messages.filter((m) => m.role === "system").map((m) => m.content).join("\n\n");
    const contents = opts.messages.filter((m) => m.role !== "system").map((m) => ({ role: m.role === "assistant" ? "model" : "user", parts: [{ text: m.content }] }));
    const data = await httpJson(url, {
      headers: { "x-goog-api-key": opts.apiKey ?? "" },
      body: {
        ...system ? { systemInstruction: { parts: [{ text: system }] } } : {},
        contents,
        generationConfig: {
          temperature: opts.temperature,
          maxOutputTokens: opts.maxTokens
        }
      },
      timeoutMs: opts.timeoutMs,
      signal: opts.signal
    });
    return {
      text: (data.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? "").join(""),
      promptTokens: data.usageMetadata?.promptTokenCount ?? null,
      completionTokens: data.usageMetadata?.candidatesTokenCount ?? null
    };
  }
};

// apps/server/src/providers/mock.ts
var OPENERS = [
  "Having weighed the matter",
  "From where I sit in this council",
  "Let me be direct",
  "I have studied the question closely"
];
function pick(arr, seed) {
  let h = 0;
  for (const c of seed) h = h * 31 + c.charCodeAt(0) | 0;
  return arr[Math.abs(h) % arr.length];
}
function estimateTokens(s) {
  return Math.max(1, Math.round(s.length / 4));
}
var mockAdapter = {
  protocol: "mock",
  defaultBaseUrl: null,
  async chat(opts) {
    await new Promise((resolve, reject) => {
      const t = setTimeout(resolve, 150 + Math.random() * 350);
      opts.signal?.addEventListener(
        "abort",
        () => {
          clearTimeout(t);
          reject(new Error("cancelled"));
        },
        { once: true }
      );
    });
    if (opts.signal?.aborted) throw new Error("cancelled");
    const systemMsg = opts.messages.find((m) => m.role === "system")?.content ?? "";
    const lastUser = [...opts.messages].reverse().find((m) => m.role === "user")?.content ?? "";
    const persona = systemMsg.split("\u2014")[0]?.trim() || "Member";
    const isSynthesis = /synthes/i.test(systemMsg);
    let text;
    if (isSynthesis) {
      text = `**The Council Convenes \u2014 Synthesis**

After full deliberation on "${lastUser.slice(0, 120)}", the council finds broad agreement on three points:

1. **Direction** \u2014 The Oracle's proposal stands as the primary course of action.
2. **Risk** \u2014 The Skeptic's objections are answered with concrete mitigations rather than dismissal.
3. **Execution** \u2014 Proceed in stages, verifying assumptions at each gate before committing further.

This concludes the council's deliberation.`;
    } else {
      const opener = pick(OPENERS, persona + opts.modelId);
      text = `${opener}, ${persona.toLowerCase()} holds that ${opts.modelId} approaches "${lastUser.slice(0, 80)}" with a structured plan: define the objective, enumerate constraints, then commit to the highest-leverage first move while keeping retreat options open.`;
    }
    return {
      text,
      promptTokens: estimateTokens(opts.messages.map((m) => m.content).join(" ")),
      completionTokens: estimateTokens(text)
    };
  }
};

// apps/server/src/providers/openai-compatible.ts
init_http();
var openAICompatibleAdapter = {
  protocol: "openai_compatible",
  defaultBaseUrl: "https://api.openai.com/v1",
  async chat(opts) {
    const url = `${opts.baseUrl.replace(/\/$/, "")}/chat/completions`;
    const data = await httpJson(url, {
      headers: opts.apiKey ? { authorization: `Bearer ${opts.apiKey}` } : {},
      body: {
        model: opts.modelId,
        messages: opts.messages.map((m) => ({ role: m.role, content: m.content })),
        temperature: opts.temperature,
        max_tokens: opts.maxTokens
      },
      timeoutMs: opts.timeoutMs,
      signal: opts.signal
    });
    return {
      text: data.choices?.[0]?.message?.content ?? "",
      promptTokens: data.usage?.prompt_tokens ?? null,
      completionTokens: data.usage?.completion_tokens ?? null
    };
  }
};

// apps/server/src/providers/registry.ts
var ADAPTERS = {
  openai_compatible: openAICompatibleAdapter,
  anthropic: anthropicAdapter,
  google: googleAdapter,
  mock: mockAdapter
};
function getAdapter(protocol) {
  return ADAPTERS[protocol];
}

// apps/server/src/engine/moderator.ts
var SYNTHESIS_SYSTEM_PROMPT = `You are the moderator of an AI council. You have watched a panel of AI members deliberate a question over one or more rounds. Your task:

1. Identify the points of AGREEMENT across members.
2. Note material disagreements and state how they were (or weren't) resolved.
3. Deliver ONE clear, actionable final answer representing the council's consensus.

Be concise but complete. Structure with short headings or numbered points. Do not mention that you are an AI.`;
function buildSynthesisMessages(topic, transcript) {
  return [
    { role: "system", content: SYNTHESIS_SYSTEM_PROMPT },
    {
      role: "user",
      content: `QUESTION PUT TO THE COUNCIL:
${topic}

FULL TRANSCRIPT OF DELIBERATION:
${transcript}

Deliver the council's synthesis now.`
    }
  ];
}

// apps/server/src/engine/strategies.ts
var ROUND_ROBIN = {
  kind: "round_robin",
  buildRounds: ({ rounds, memberIds }) => Array.from({ length: rounds }, () => memberIds),
  includeTranscript: () => false
};
var DEBATE = {
  kind: "debate",
  buildRounds: ({ rounds, memberIds }) => Array.from({ length: rounds }, () => memberIds),
  includeTranscript: (round) => round > 1
};
function getStrategy(kind) {
  return kind === "debate" ? DEBATE : ROUND_ROBIN;
}

// apps/server/src/engine/runner.ts
var CALL_TIMEOUT_MS = 12e4;
function computeCost(promptTokens, completionTokens, inPrice, outPrice) {
  if (promptTokens == null || completionTokens == null) return null;
  if (inPrice == null && outPrice == null) return null;
  const inCost = promptTokens / 1e6 * (inPrice ?? 0) || 0;
  const outCost = completionTokens / 1e6 * (outPrice ?? 0) || 0;
  return Number((inCost + outCost).toFixed(6));
}
var SessionRunner = class {
  constructor(deps) {
    this.deps = deps;
  }
  async run(sessionId, councilId, topic, signal) {
    const { bus } = this.deps;
    try {
      const council = this.deps.loadCouncil(councilId);
      if (!council) throw new Error("council not found");
      const activeMembers = council.members.filter((m) => m.enabled);
      if (activeMembers.length === 0) throw new Error("council has no enabled members");
      this.deps.updateSessionStatus(sessionId, "running");
      const userMsgId = this.deps.insertMessage({
        sessionId,
        memberId: null,
        memberName: "You",
        kind: "user",
        round: 0,
        content: topic
      });
      bus.publish({
        type: "session.started",
        sessionId
      });
      bus.publish({
        type: "message.created",
        sessionId,
        message: {
          id: String(userMsgId),
          sessionId,
          memberId: null,
          memberName: "You",
          role: "user",
          kind: "user",
          round: 0,
          content: topic,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
      const strategy = getStrategy(council.strategy);
      const rounds = strategy.buildRounds({ rounds: council.rounds, memberIds: activeMembers.map((m) => m.id) });
      const transcript = [];
      let roundNum = 0;
      for (const round of rounds) {
        roundNum++;
        if (signal.aborted) throw new Error("cancelled");
        bus.publish({ type: "round.started", sessionId, round: roundNum });
        await Promise.all(
          round.map(async (memberId) => {
            const member = activeMembers.find((m) => m.id === memberId);
            if (!member) return;
            await this.callMember(sessionId, member, topic, transcript, roundNum, strategy.includeTranscript(roundNum), signal);
          })
        );
        bus.publish({ type: "round.completed", sessionId, round: roundNum });
      }
      const moderator = council.moderatorMemberId ? activeMembers.find((m) => m.id === council.moderatorMemberId) : void 0;
      if (moderator) {
        if (signal.aborted) throw new Error("cancelled");
        bus.publish({ type: "moderator.started", sessionId });
        await this.callMember(sessionId, moderator, topic, transcript, roundNum + 1, true, signal, true);
      }
      bus.publish({ type: "session.completed", sessionId });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (signal.aborted || msg === "cancelled") {
        this.deps.updateSessionStatus(sessionId, "cancelled");
        bus.publish({ type: "session.cancelled", sessionId });
        throw new SessionCancelled();
      }
      this.deps.updateSessionStatus(sessionId, "failed", msg);
      bus.publish({ type: "session.failed", sessionId, error: msg });
      throw err;
    }
    this.deps.updateSessionStatus(sessionId, "completed");
  }
  async callMember(sessionId, member, topic, transcript, round, includeTranscript, signal, isSynthesis = false) {
    const { bus } = this.deps;
    bus.publish({
      type: "member.started",
      sessionId,
      round,
      memberName: member.name
    });
    const model = this.deps.loadModelForChat(member.modelId);
    if (!model) {
      bus.publish({ type: "member.completed", sessionId, round, memberName: member.name });
      return;
    }
    const messages = [];
    if (isSynthesis) {
      messages.push(...buildSynthesisMessages(topic, renderTranscript(transcript)));
    } else {
      if (member.systemPrompt) messages.push({ role: "system", content: member.systemPrompt });
      if (includeTranscript && transcript.length > 0) {
        messages.push({
          role: "system",
          content: `You are deliberating with other AI members of a council. Here is the transcript so far:

` + renderTranscript(transcript) + `

Respond to the others: rebut, concede, or refine. Be direct.`
        });
      }
      messages.push({ role: "user", content: topic });
    }
    const adapter = getAdapter(model.providerProtocol);
    const started = Date.now();
    try {
      const result = await adapter.chat({
        baseUrl: model.providerBaseUrl ?? adapter.defaultBaseUrl ?? "",
        apiKey: model.apiKeyEncrypted ? decryptSecret(model.apiKeyEncrypted) : void 0,
        modelId: model.modelId,
        messages,
        temperature: member.temperature,
        maxTokens: member.maxTokens ?? void 0,
        timeoutMs: CALL_TIMEOUT_MS,
        signal
      });
      const latency = Date.now() - started;
      const cost = computeCost(result.promptTokens, result.completionTokens, model.inputPerMTokUsd, model.outputPerMTokUsd);
      const msgId = this.deps.insertMessage({
        sessionId,
        memberId: member.id,
        memberName: member.name,
        kind: isSynthesis ? "synthesis" : "discussion",
        round,
        content: result.text
      });
      bus.publish({
        type: "message.created",
        sessionId,
        message: {
          id: String(msgId),
          sessionId,
          memberId: member.id,
          memberName: member.name,
          role: "assistant",
          kind: isSynthesis ? "synthesis" : "discussion",
          round,
          content: result.text,
          usage: {
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            totalTokens: (result.promptTokens ?? 0) + (result.completionTokens ?? 0),
            costUsd: cost,
            latencyMs: latency
          },
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
      bus.publish({ type: "member.completed", sessionId, round, memberName: member.name });
      this.deps.recordUsage({
        sessionId,
        memberName: member.name,
        providerName: "",
        modelName: model.modelId,
        promptTokens: result.promptTokens ?? 0,
        completionTokens: result.completionTokens ?? 0,
        costUsd: cost,
        latencyMs: latency,
        status: "ok"
      });
      if (isSynthesis) {
        bus.publish({ type: "synthesis.completed", sessionId, message: {
          id: String(msgId),
          sessionId,
          memberId: member.id,
          memberName: member.name,
          role: "assistant",
          kind: "synthesis",
          round,
          content: result.text,
          usage: {
            promptTokens: result.promptTokens,
            completionTokens: result.completionTokens,
            totalTokens: (result.promptTokens ?? 0) + (result.completionTokens ?? 0),
            costUsd: cost,
            latencyMs: latency
          },
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        } });
      }
      transcript.push({ speaker: member.name, content: result.text });
    } catch (err) {
      const latency = Date.now() - started;
      const msgText = err instanceof Error ? err.message : String(err);
      this.deps.recordUsage({
        sessionId,
        memberName: member.name,
        providerName: "",
        modelName: model.modelId,
        promptTokens: 0,
        completionTokens: 0,
        costUsd: null,
        latencyMs: latency,
        status: "error"
      });
      const failMsgId = this.deps.insertMessage({
        sessionId,
        memberId: member.id,
        memberName: member.name,
        kind: "system",
        round,
        content: `[error] ${msgText}`
      });
      bus.publish({
        type: "message.created",
        sessionId,
        message: {
          id: String(failMsgId),
          sessionId,
          memberId: member.id,
          memberName: member.name,
          role: "assistant",
          kind: "system",
          round,
          content: `[error] ${msgText}`,
          createdAt: (/* @__PURE__ */ new Date()).toISOString()
        }
      });
      bus.publish({ type: "member.completed", sessionId, round, memberName: member.name });
    }
  }
};
function renderTranscript(t) {
  return t.map((e) => `${e.speaker}: ${e.content}`).join("\n\n");
}
var SessionCancelled = class extends Error {
};

// apps/server/src/engine/session-manager.ts
var SessionManager = class {
  constructor(bus, runner) {
    this.bus = bus;
    this.runner = runner;
  }
  aborts = /* @__PURE__ */ new Map();
  /** Kicks off deliberation for a pre-created session row. */
  startSession(sessionId, councilId, topic) {
    const ac = new AbortController();
    this.aborts.set(sessionId, ac);
    const runner = this.runner;
    void (async () => {
      try {
        await runner.run(sessionId, councilId, topic, ac.signal);
      } catch (err) {
        if (!(err instanceof SessionCancelled)) {
          this.bus.publish({
            type: "session.failed",
            sessionId,
            error: err instanceof Error ? err.message : String(err)
          });
        }
      } finally {
        setTimeout(() => this.bus.closeSession(sessionId), 3e4);
        this.aborts.delete(sessionId);
      }
    })();
  }
  cancel(sessionId) {
    const ac = this.aborts.get(sessionId);
    if (!ac) return false;
    ac.abort();
    return true;
  }
  isRunning(sessionId) {
    return this.aborts.has(sessionId);
  }
};

// apps/server/src/app.ts
import Fastify from "fastify";
import { randomUUID as randomUUID5 } from "node:crypto";
function makeRunnerDbHelpers(db) {
  return {
    recordUsage(u) {
      db.prepare(
        `INSERT INTO usage_events (session_id, member_name, provider_name, model_name,
          prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        u.sessionId,
        u.memberName,
        u.providerName || null,
        u.modelName,
        u.promptTokens,
        u.completionTokens,
        u.promptTokens + u.completionTokens,
        u.costUsd,
        u.latencyMs,
        u.status
      );
    },
    insertMessage(m) {
      const role = m.kind === "user" ? "user" : "assistant";
      const info = db.prepare(
        `INSERT INTO messages (session_id, member_id, member_name, role, kind, round, content)
           VALUES (?, ?, ?, ?, ?, ?, ?)`
      ).run(m.sessionId, m.memberId, m.memberName, role, m.kind, m.round, m.content);
      return Number(info.lastInsertRowid);
    },
    loadCouncil(councilId) {
      const c = db.prepare("SELECT * FROM councils WHERE id = ?").get(councilId);
      if (!c) return null;
      const members = db.prepare(
        `SELECT mem.* FROM members mem JOIN council_members cm ON cm.member_id = mem.id AND cm.council_id = ?
           ORDER BY cm.position`
      ).all(councilId);
      return {
        id: c.id,
        name: c.name,
        strategy: c.strategy,
        rounds: c.rounds,
        moderatorMemberId: c.moderator_member_id,
        members: members.map((r) => ({
          id: r.id,
          name: r.name,
          modelId: r.model_id ?? "",
          systemPrompt: r.system_prompt,
          temperature: r.temperature,
          maxTokens: r.max_tokens,
          avatarColor: r.avatar_color,
          enabled: !!r.enabled
        }))
      };
    },
    loadModelForChat(modelId) {
      const row = db.prepare(
        `SELECT m.model_id AS modelId, p.protocol AS providerProtocol, p.base_url AS providerBaseUrl,
                  p.api_key_encrypted AS apiKeyEncrypted, m.input_per_mtok_usd AS inputPerMTokUsd,
                  m.output_per_mtok_usd AS outputPerMTokUsd
           FROM models m JOIN providers p ON p.id = m.provider_id WHERE m.id = ?`
      ).get(modelId);
      return row ?? null;
    },
    updateSessionStatus(sessionId, status, error) {
      if (status === "running") {
        db.prepare(`UPDATE sessions SET status='running', started_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`).run(sessionId);
      } else {
        db.prepare(`UPDATE sessions SET status=?, completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), error=COALESCE(?, error) WHERE id=?`).run(status, error ?? null, sessionId);
      }
    }
  };
}
async function buildApp(deps) {
  const app = Fastify({ logger: { level: deps.config.logLevel } });
  const { registerErrorHandlers: registerErrorHandlers2 } = await Promise.resolve().then(() => (init_errors(), errors_exports));
  registerErrorHandlers2(app);
  app.get("/api/v1/health", async () => ({ ok: true, version: "0.1.0", instanceId: randomUUID5() }));
  const { registerProviderRoutes: registerProviderRoutes2 } = await Promise.resolve().then(() => (init_providers(), providers_exports));
  registerProviderRoutes2(app, deps.db);
  const { registerMemberCouncilRoutes: registerMemberCouncilRoutes2 } = await Promise.resolve().then(() => (init_councils(), councils_exports));
  registerMemberCouncilRoutes2(app, deps.db);
  const { registerSessionRoutes: registerSessionRoutes2 } = await Promise.resolve().then(() => (init_sessions(), sessions_exports));
  registerSessionRoutes2(app, { db: deps.db, bus: deps.bus, sessions: deps.sessions });
  const { registerActivityRoutes: registerActivityRoutes2 } = await Promise.resolve().then(() => (init_activity(), activity_exports));
  registerActivityRoutes2(app, deps.db);
  return app;
}

// apps/server/src/index.ts
async function main() {
  const config = loadConfig();
  initVault(config.secretKey);
  const db = openDatabase(config);
  migrate(db);
  if (config.seedDemoCouncil && seedDemoCouncil(db)) {
    console.log("[opencouncil] seeded demo council (mock provider)");
  }
  if (!config.hasDurableSecret) {
    console.warn(
      "[opencouncil] WARNING: OPEN_COUNCIL_SECRET_KEY not set \u2014 provider API keys stored now will be unreadable after restart. Set it in .env for production use."
    );
  }
  const bus = new SessionBus();
  const helpers = makeRunnerDbHelpers(db);
  const runner = new SessionRunner({
    bus,
    recordUsage: (u) => helpers.recordUsage(u),
    insertMessage: helpers.insertMessage,
    loadCouncil: helpers.loadCouncil,
    loadModelForChat: helpers.loadModelForChat,
    updateSessionStatus: helpers.updateSessionStatus
  });
  const sessions = new SessionManager(bus, runner);
  const app = await buildApp({ config, db, bus, sessions });
  app.setNotFoundHandler((_req, reply) => {
    reply.status(404).send({ error: { code: "not_found", message: "no such route" } });
  });
  await app.listen({ host: config.host, port: config.port });
  console.log(`[opencouncil] chamber open at http://${config.host}:${config.port}`);
}
main().catch((err) => {
  console.error("[opencouncil] fatal:", err);
  process.exit(1);
});
