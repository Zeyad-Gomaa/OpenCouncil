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
var crypto_exports = {};
__export(crypto_exports, {
  decryptSecret: () => decryptSecret,
  encryptSecret: () => encryptSecret,
  initVault: () => initVault,
  setVaultKeyForTests: () => setVaultKeyForTests
});
import { createCipheriv, createDecipheriv, randomBytes, scryptSync } from "node:crypto";
function deriveKey(secret) {
  return scryptSync(secret, "opencouncil.vault.v1", 32);
}
function initVault(secret) {
  cachedKey = deriveKey(secret);
}
function setVaultKeyForTests(secret) {
  initVault(secret);
}
function getKey() {
  if (!cachedKey) {
    throw new Error("vault: not initialized \u2014 call initVault() before encrypt/decrypt");
  }
  return cachedKey;
}
function encryptSecret(plain) {
  const iv = randomBytes(IV_LEN);
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

// apps/server/src/engine/bus.ts
var bus_exports = {};
__export(bus_exports, {
  SessionBus: () => SessionBus
});
import { EventEmitter } from "node:events";
var HEARTBEAT_MS, SessionBus;
var init_bus = __esm({
  "apps/server/src/engine/bus.ts"() {
    "use strict";
    HEARTBEAT_MS = 15e3;
    SessionBus = class {
      constructor(persist) {
        this.persist = persist;
      }
      emitters = /* @__PURE__ */ new Map();
      sequences = /* @__PURE__ */ new Map();
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
        const sequence = (this.sequences.get(event.sessionId) ?? 0) + 1;
        this.sequences.set(event.sessionId, sequence);
        this.persist?.(event, sequence);
        if (em) em.emit("event", event, sequence);
      }
      subscribe(sessionId, listener, heartbeat) {
        const em = this.emitterFor(sessionId);
        em.on("event", listener);
        const hb = setInterval(() => {
          try {
            heartbeat?.();
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
        this.sequences.delete(sessionId);
      }
    };
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

// apps/server/src/providers/anthropic.ts
var anthropicAdapter;
var init_anthropic = __esm({
  "apps/server/src/providers/anthropic.ts"() {
    "use strict";
    init_http();
    anthropicAdapter = {
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
  }
});

// apps/server/src/providers/google.ts
var googleAdapter;
var init_google = __esm({
  "apps/server/src/providers/google.ts"() {
    "use strict";
    init_http();
    googleAdapter = {
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
  }
});

// apps/server/src/providers/mock.ts
function pick(arr, seed) {
  let h = 0;
  for (const c of seed) h = h * 31 + c.charCodeAt(0) | 0;
  return arr[Math.abs(h) % arr.length];
}
function estimateTokens(s) {
  return Math.max(1, Math.round(s.length / 4));
}
var OPENERS, mockAdapter;
var init_mock = __esm({
  "apps/server/src/providers/mock.ts"() {
    "use strict";
    OPENERS = [
      "Having weighed the matter",
      "From where I sit in this council",
      "Let me be direct",
      "I have studied the question closely"
    ];
    mockAdapter = {
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
  }
});

// apps/server/src/providers/openai-compatible.ts
var openAICompatibleAdapter;
var init_openai_compatible = __esm({
  "apps/server/src/providers/openai-compatible.ts"() {
    "use strict";
    init_http();
    openAICompatibleAdapter = {
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
  }
});

// apps/server/src/providers/registry.ts
function getAdapter(protocol) {
  return ADAPTERS[protocol];
}
var ADAPTERS;
var init_registry = __esm({
  "apps/server/src/providers/registry.ts"() {
    "use strict";
    init_anthropic();
    init_google();
    init_mock();
    init_openai_compatible();
    ADAPTERS = {
      openai_compatible: openAICompatibleAdapter,
      anthropic: anthropicAdapter,
      google: googleAdapter,
      mock: mockAdapter
    };
  }
});

// apps/server/src/engine/context-budgeter.ts
function estimateTokens2(text) {
  return Math.ceil(text.length / 4);
}
function fitMessages(messages, budget) {
  if (!budget.contextWindow || budget.contextWindow <= 0) return messages;
  const available = Math.max(1, budget.contextWindow - budget.responseTokens - budget.safetyMargin);
  const systems = [];
  const recent = [];
  let used = 0;
  for (const message of messages.filter((m) => m.role === "system")) {
    const cost = estimateTokens2(message.content);
    if (used + cost <= available) {
      systems.push(message);
      used += cost;
    }
  }
  for (const message of [...messages.filter((m) => m.role !== "system")].reverse()) {
    const cost = estimateTokens2(message.content);
    if (used + cost <= available) {
      recent.unshift(message);
      used += cost;
    }
  }
  return [...systems, ...recent];
}
var init_context_budgeter = __esm({
  "apps/server/src/engine/context-budgeter.ts"() {
    "use strict";
  }
});

// apps/server/src/engine/execution-policy.ts
function isTemporaryProviderError(error) {
  if (error instanceof AuthError) return false;
  if (error instanceof RateLimitError || error instanceof TimeoutError) return true;
  return error instanceof ProviderHttpError && (error.status === 408 || error.status === 429 || error.status >= 500);
}
async function withRetry(operation, policy = DEFAULT_EXECUTION_POLICY, signal) {
  let retryCount = 0;
  for (; ; ) {
    if (signal?.aborted) throw new Error("cancelled");
    try {
      return { value: await operation(), retryCount };
    } catch (error) {
      if (retryCount >= policy.maxRetries || !isTemporaryProviderError(error) || signal?.aborted)
        throw Object.assign(error instanceof Error ? error : new Error(String(error)), { retryCount });
      const base = Math.min(policy.maxBackoffMs, policy.initialBackoffMs * 2 ** retryCount);
      retryCount++;
      await new Promise((resolve, reject) => {
        const timer = setTimeout(resolve, base + Math.floor(Math.random() * Math.max(1, base / 4)));
        signal?.addEventListener(
          "abort",
          () => {
            clearTimeout(timer);
            reject(new Error("cancelled"));
          },
          { once: true }
        );
      });
    }
  }
}
var DEFAULT_EXECUTION_POLICY, Semaphore;
var init_execution_policy = __esm({
  "apps/server/src/engine/execution-policy.ts"() {
    "use strict";
    init_http();
    DEFAULT_EXECUTION_POLICY = { maxRetries: 2, initialBackoffMs: 200, maxBackoffMs: 2e3 };
    Semaphore = class {
      constructor(limit) {
        this.limit = limit;
      }
      active = 0;
      waiters = [];
      async run(operation) {
        if (this.active >= this.limit) await new Promise((resolve) => this.waiters.push(resolve));
        this.active++;
        try {
          return await operation();
        } finally {
          this.active--;
          this.waiters.shift()?.();
        }
      }
    };
  }
});

// apps/server/src/engine/moderator.ts
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
var SYNTHESIS_SYSTEM_PROMPT;
var init_moderator = __esm({
  "apps/server/src/engine/moderator.ts"() {
    "use strict";
    SYNTHESIS_SYSTEM_PROMPT = `You are the moderator of an AI council. You have watched a panel of AI members deliberate a question over one or more rounds. Your task:

1. Identify the points of AGREEMENT across members.
2. Note material disagreements and state how they were (or weren't) resolved.
3. Deliver ONE clear, actionable final answer representing the council's consensus.

Be concise but complete. Structure with short headings or numbered points. Do not mention that you are an AI.`;
  }
});

// apps/server/src/engine/strategies.ts
function getStrategy(kind) {
  return kind === "debate" ? DEBATE : ROUND_ROBIN;
}
var ROUND_ROBIN, DEBATE;
var init_strategies = __esm({
  "apps/server/src/engine/strategies.ts"() {
    "use strict";
    ROUND_ROBIN = {
      kind: "round_robin",
      buildRounds: ({ rounds, memberIds }) => Array.from({ length: rounds }, () => memberIds),
      includeTranscript: () => false
    };
    DEBATE = {
      kind: "debate",
      buildRounds: ({ rounds, memberIds }) => Array.from({ length: rounds }, () => memberIds),
      includeTranscript: (round) => round > 1
    };
  }
});

// apps/server/src/engine/runner.ts
var runner_exports = {};
__export(runner_exports, {
  SessionCancelled: () => SessionCancelled,
  SessionRunner: () => SessionRunner,
  renderTranscript: () => renderTranscript
});
function computeCost(promptTokens, completionTokens, inPrice, outPrice) {
  if (promptTokens == null || completionTokens == null) return null;
  if (inPrice == null && outPrice == null) return null;
  const inCost = promptTokens / 1e6 * (inPrice ?? 0) || 0;
  const outCost = completionTokens / 1e6 * (outPrice ?? 0) || 0;
  return Number((inCost + outCost).toFixed(6));
}
function renderTranscript(t) {
  return t.map((e) => `${e.speaker}: ${e.content}`).join("\n\n");
}
var CALL_TIMEOUT_MS, SessionRunner, SessionCancelled;
var init_runner = __esm({
  "apps/server/src/engine/runner.ts"() {
    "use strict";
    init_crypto();
    init_registry();
    init_context_budgeter();
    init_execution_policy();
    init_http();
    init_moderator();
    init_strategies();
    CALL_TIMEOUT_MS = 12e4;
    SessionRunner = class {
      constructor(deps) {
        this.deps = deps;
      }
      providerLimits = /* @__PURE__ */ new Map();
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
                await this.callMember(
                  sessionId,
                  member,
                  topic,
                  transcript,
                  roundNum,
                  round.indexOf(memberId),
                  strategy.includeTranscript(roundNum),
                  signal
                );
              })
            );
            bus.publish({ type: "round.completed", sessionId, round: roundNum });
          }
          const moderator = council.moderatorMemberId ? activeMembers.find((m) => m.id === council.moderatorMemberId) : void 0;
          if (moderator) {
            if (signal.aborted) throw new Error("cancelled");
            bus.publish({ type: "moderator.started", sessionId });
            await this.callMember(sessionId, moderator, topic, transcript, roundNum + 1, 0, true, signal, true);
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
      async callMember(sessionId, member, topic, transcript, round, roundPosition, includeTranscript, signal, isSynthesis = false) {
        const { bus } = this.deps;
        bus.publish({
          type: "member.started",
          sessionId,
          round,
          memberId: member.id,
          memberName: member.name
        });
        const model = this.deps.loadModelForChat(member.modelId);
        if (!model) {
          bus.publish({
            type: "member.failed",
            sessionId,
            round,
            memberId: member.id,
            memberName: member.name,
            error: "model is missing or disabled"
          });
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
        const boundedMessages = fitMessages(messages, {
          contextWindow: model.contextWindow,
          responseTokens: member.maxTokens ?? 1024,
          safetyMargin: 128
        });
        const adapter = getAdapter(model.providerProtocol);
        const started = Date.now();
        try {
          const semaphore = this.providerLimits.get(model.providerId) ?? new Semaphore(4);
          this.providerLimits.set(model.providerId, semaphore);
          const attempted = await withRetry(
            () => semaphore.run(
              () => adapter.chat({
                baseUrl: model.providerBaseUrl ?? adapter.defaultBaseUrl ?? "",
                apiKey: model.apiKeyEncrypted ? decryptSecret(model.apiKeyEncrypted) : void 0,
                modelId: model.modelId,
                messages: boundedMessages,
                temperature: member.temperature,
                maxTokens: member.maxTokens ?? void 0,
                timeoutMs: CALL_TIMEOUT_MS,
                signal
              })
            ),
            void 0,
            signal
          );
          const result = attempted.value;
          const latency = Date.now() - started;
          const cost = computeCost(
            result.promptTokens,
            result.completionTokens,
            model.inputPerMTokUsd,
            model.outputPerMTokUsd
          );
          const msgId = this.deps.insertMessage({
            sessionId,
            memberId: member.id,
            memberName: member.name,
            kind: isSynthesis ? "synthesis" : "discussion",
            round,
            roundPosition,
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
          bus.publish({ type: "member.completed", sessionId, round, memberId: member.id, memberName: member.name });
          const usageId = this.deps.recordUsage({
            sessionId,
            memberId: member.id,
            memberName: member.name,
            providerId: model.providerId,
            providerName: model.providerName,
            modelId: model.stableModelId,
            modelName: model.modelName || model.modelId,
            promptTokens: result.promptTokens ?? 0,
            completionTokens: result.completionTokens ?? 0,
            costUsd: cost,
            latencyMs: latency,
            retryCount: attempted.retryCount,
            status: "ok"
          });
          bus.publish({
            type: "usage.recorded",
            sessionId,
            usage: {
              id: usageId,
              sessionId,
              providerId: model.providerId,
              providerName: model.providerName,
              modelId: model.stableModelId,
              modelName: model.modelName || model.modelId,
              memberId: member.id,
              memberName: member.name,
              promptTokens: result.promptTokens ?? 0,
              completionTokens: result.completionTokens ?? 0,
              totalTokens: (result.promptTokens ?? 0) + (result.completionTokens ?? 0),
              costUsd: cost,
              latencyMs: latency,
              retryCount: attempted.retryCount,
              errorCode: null,
              status: "ok",
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            }
          });
          if (isSynthesis) {
            bus.publish({
              type: "synthesis.completed",
              sessionId,
              message: {
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
              }
            });
          }
          transcript.push({ speaker: member.name, content: result.text });
        } catch (err) {
          const latency = Date.now() - started;
          const msgText = err instanceof Error ? err.message : String(err);
          const retryCount = Number(err?.retryCount ?? 0);
          const errorCode = err instanceof AuthError ? "authentication_failed" : err instanceof RateLimitError ? "rate_limited" : err instanceof TimeoutError ? "timeout" : err instanceof ProviderHttpError ? `http_${err.status}` : "provider_error";
          const usageId = this.deps.recordUsage({
            sessionId,
            memberId: member.id,
            memberName: member.name,
            providerId: model.providerId,
            providerName: model.providerName,
            modelId: model.stableModelId,
            modelName: model.modelName || model.modelId,
            promptTokens: 0,
            completionTokens: 0,
            costUsd: null,
            latencyMs: latency,
            retryCount,
            errorCode,
            status: "error"
          });
          bus.publish({
            type: "usage.recorded",
            sessionId,
            usage: {
              id: usageId,
              sessionId,
              providerId: model.providerId,
              providerName: model.providerName,
              modelId: model.stableModelId,
              modelName: model.modelName || model.modelId,
              memberId: member.id,
              memberName: member.name,
              promptTokens: 0,
              completionTokens: 0,
              totalTokens: 0,
              costUsd: null,
              latencyMs: latency,
              retryCount,
              errorCode,
              status: "error",
              createdAt: (/* @__PURE__ */ new Date()).toISOString()
            }
          });
          const failMsgId = this.deps.insertMessage({
            sessionId,
            memberId: member.id,
            memberName: member.name,
            kind: "system",
            round,
            roundPosition,
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
          bus.publish({
            type: "member.failed",
            sessionId,
            round,
            memberId: member.id,
            memberName: member.name,
            error: msgText
          });
        }
      }
    };
    SessionCancelled = class extends Error {
    };
  }
});

// apps/server/src/version.ts
var version_exports = {};
__export(version_exports, {
  VERSION: () => VERSION
});
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
function read() {
  try {
    const here = path.dirname(fileURLToPath(import.meta.url));
    const pkg = JSON.parse(readFileSync(path.join(here, "..", "..", "..", "package.json"), "utf8"));
    return pkg.version ?? "unknown";
  } catch {
    return "unknown";
  }
}
var VERSION;
var init_version = __esm({
  "apps/server/src/version.ts"() {
    "use strict";
    VERSION = read();
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
  if (err instanceof ProviderHttpError) return new AppError(502, "provider_http", err.message, { status: err.status });
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
import { z } from "zod";
var providerProtocolSchema, providerCreateSchema, providerUpdateSchema, modelCreateSchema, modelUpdateSchema, memberCreateSchema, memberUpdateSchema, strategyKindSchema, councilCreateSchema, councilUpdateSchema, sessionCreateSchema, configImportSchema;
var init_schemas = __esm({
  "packages/shared/dist/schemas.js"() {
    "use strict";
    providerProtocolSchema = z.enum(["openai_compatible", "anthropic", "google", "mock"]);
    providerCreateSchema = z.object({
      name: z.string().min(1).max(80),
      protocol: providerProtocolSchema,
      baseUrl: z.string().url().optional(),
      apiKey: z.string().max(4096).optional(),
      defaultModelId: z.string().max(200).nullish(),
      enabled: z.boolean().optional()
    });
    providerUpdateSchema = z.object({
      name: z.string().min(1).max(80).optional(),
      protocol: providerProtocolSchema.optional(),
      baseUrl: z.string().url().nullable().optional(),
      apiKey: z.string().max(4096).nullable().optional(),
      defaultModelId: z.string().max(200).nullable().optional(),
      enabled: z.boolean().optional()
    });
    modelCreateSchema = z.object({
      providerId: z.string().uuid(),
      modelId: z.string().min(1).max(200),
      displayName: z.string().min(1).max(120),
      contextWindow: z.number().int().positive().max(1e8).nullish(),
      inputPerMTokUsd: z.number().nonnegative().nullish(),
      outputPerMTokUsd: z.number().nonnegative().nullish(),
      enabled: z.boolean().optional()
    });
    modelUpdateSchema = modelCreateSchema.partial().omit({ providerId: true });
    memberCreateSchema = z.object({
      name: z.string().min(1).max(60),
      modelId: z.string().uuid(),
      systemPrompt: z.string().max(2e4).nullish(),
      temperature: z.number().min(0).max(2).optional(),
      maxTokens: z.number().int().positive().max(2e5).nullish(),
      avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
      enabled: z.boolean().optional()
    });
    memberUpdateSchema = memberCreateSchema.partial();
    strategyKindSchema = z.enum(["round_robin", "debate"]);
    councilCreateSchema = z.object({
      name: z.string().min(1).max(80),
      description: z.string().max(500).nullish(),
      strategy: strategyKindSchema,
      rounds: z.number().int().min(1).max(10),
      memberIds: z.array(z.string().uuid()).min(1).max(12),
      moderatorMemberId: z.string().uuid().nullish()
    }).refine((c) => !c.moderatorMemberId || c.memberIds.includes(c.moderatorMemberId), {
      message: "moderator must be one of the council members"
    });
    councilUpdateSchema = z.object({
      name: z.string().min(1).max(80).optional(),
      description: z.string().max(500).nullable().optional(),
      strategy: strategyKindSchema.optional(),
      rounds: z.number().int().min(1).max(10).optional(),
      memberIds: z.array(z.string().uuid()).min(1).max(12).optional(),
      moderatorMemberId: z.string().uuid().nullable().optional()
    }).refine((c) => !c.moderatorMemberId || (c.memberIds ? c.memberIds.includes(c.moderatorMemberId) : true), {
      message: "moderator must be one of the council members"
    });
    sessionCreateSchema = z.object({
      councilId: z.string().uuid(),
      topic: z.string().min(1).max(8e3)
    });
    configImportSchema = z.object({
      version: z.literal(1).optional(),
      providers: z.array(z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80),
        protocol: providerProtocolSchema,
        baseUrl: z.string().url().nullish(),
        defaultModelId: z.string().max(200).nullish(),
        enabled: z.coerce.boolean().optional()
      })),
      models: z.array(z.object({
        id: z.string().uuid(),
        providerId: z.string().uuid(),
        modelId: z.string().min(1).max(200),
        displayName: z.string().min(1).max(120),
        contextWindow: z.number().int().positive().max(1e8).nullish(),
        inputPerMTokUsd: z.number().nonnegative().nullish(),
        outputPerMTokUsd: z.number().nonnegative().nullish(),
        enabled: z.coerce.boolean().optional()
      })),
      members: z.array(z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(60),
        modelId: z.string().uuid().nullish(),
        systemPrompt: z.string().max(2e4).nullish(),
        temperature: z.number().min(0).max(2).optional(),
        maxTokens: z.number().int().positive().max(2e5).nullish(),
        avatarColor: z.string().regex(/^#[0-9a-fA-F]{6}$/).optional(),
        enabled: z.coerce.boolean().optional()
      })),
      councils: z.array(z.object({
        id: z.string().uuid(),
        name: z.string().min(1).max(80),
        description: z.string().max(500).nullish(),
        strategy: strategyKindSchema.optional(),
        rounds: z.number().int().min(1).max(10).optional(),
        memberIds: z.array(z.string().uuid()).max(12).optional(),
        moderatorMemberId: z.string().uuid().nullish()
      }))
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
  db.prepare("INSERT INTO activity_log (action, detail) VALUES (?, ?)").run(
    action,
    detail ? JSON.stringify(detail) : null
  );
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
import { randomUUID } from "node:crypto";
function registerProviderRoutes(app, db) {
  app.get("/api/v1/meta/providers", async () => ({
    protocols: ["openai_compatible", "anthropic", "google", "mock"],
    presets: Object.entries(PROVIDER_PRESETS).map(([key, v]) => ({ key, ...v }))
  }));
  app.post("/api/v1/providers/:id/test", async (req) => {
    const { id } = req.params;
    const provider = db.prepare("SELECT * FROM providers WHERE id=?").get(id);
    if (!provider) throw new AppError(404, "not_found", "provider not found");
    const model = db.prepare("SELECT model_id FROM models WHERE id=? OR (provider_id=? AND model_id=?) LIMIT 1").get(provider.default_model_id, id, provider.default_model_id);
    if (!model) throw new AppError(400, "no_model", "provider has no configured model to test");
    const adapter = getAdapter(provider.protocol);
    const started = Date.now();
    try {
      await adapter.chat({
        baseUrl: provider.base_url ?? adapter.defaultBaseUrl ?? "",
        apiKey: provider.api_key_encrypted ? decryptSecret(provider.api_key_encrypted) : void 0,
        modelId: model.model_id,
        messages: [{ role: "user", content: "Respond with the single word OK." }],
        maxTokens: 8,
        timeoutMs: 15e3
      });
      return { ok: true, latencyMs: Date.now() - started, errorCode: null, message: "connection successful" };
    } catch (error) {
      return {
        ok: false,
        latencyMs: Date.now() - started,
        errorCode: error instanceof Error && /auth|401|403|key/i.test(error.message) ? "authentication_failed" : "connection_failed",
        message: "provider connection failed"
      };
    }
  });
  app.post("/api/v1/providers/:id/discover-models", async (req) => {
    const { id } = req.params;
    const provider = db.prepare("SELECT protocol FROM providers WHERE id=?").get(id);
    if (!provider) throw new AppError(404, "not_found", "provider not found");
    const models = db.prepare(
      "SELECT id, model_id AS modelId, display_name AS displayName FROM models WHERE provider_id=? ORDER BY display_name"
    ).all(id);
    return { supported: false, reason: "automatic discovery is unavailable for this provider adapter", models };
  });
  app.get("/api/v1/providers", async () => {
    const rows = db.prepare("SELECT * FROM providers ORDER BY created_at").all();
    return rows.map(providerToDTO);
  });
  app.post("/api/v1/providers", async (req, reply) => {
    const body = providerCreateSchema.parse(req.body);
    const id = randomUUID();
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
    db.exec("BEGIN");
    try {
      db.prepare(
        `UPDATE members SET enabled = 0 WHERE model_id IN (SELECT m.id FROM models m WHERE m.provider_id = ?)`
      ).run(id);
      db.prepare("DELETE FROM providers WHERE id = ?").run(id);
      logActivity(db, "provider.deleted", { id });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
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
    const id = randomUUID();
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
    db.exec("BEGIN");
    try {
      db.prepare("UPDATE members SET enabled = 0 WHERE model_id = ?").run(id);
      db.prepare("DELETE FROM models WHERE id = ?").run(id);
      logActivity(db, "model.deleted", { id });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
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
    init_registry();
    init_crypto();
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
import { randomUUID as randomUUID2 } from "node:crypto";
function listMembers(db) {
  return db.prepare(`${MEMBER_JOIN} ORDER BY mem.created_at`).all();
}
function councilMembers(db, councilId) {
  return db.prepare(
    `${MEMBER_JOIN} JOIN council_members cm ON cm.member_id = mem.id AND cm.council_id = ? ORDER BY cm.position`
  ).all(councilId);
}
function registerMemberCouncilRoutes(app, db) {
  app.get("/api/v1/members", async () => listMembers(db));
  app.post("/api/v1/members", async (req, reply) => {
    const body = memberCreateSchema.parse(req.body);
    const model = db.prepare("SELECT id FROM models WHERE id = ?").get(body.modelId);
    if (!model) throw new AppError(404, "not_found", "model not found");
    const id = randomUUID2();
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
    const id = randomUUID2();
    db.exec("BEGIN");
    try {
      db.prepare(
        `INSERT INTO councils (id, name, description, strategy, rounds, moderator_member_id) VALUES (?, ?, ?, ?, ?, ?)`
      ).run(id, body.name, body.description ?? null, body.strategy, body.rounds, body.moderatorMemberId ?? null);
      const insertCM = db.prepare("INSERT INTO council_members (council_id, member_id, position) VALUES (?, ?, ?)");
      body.memberIds.forEach((mid, i) => insertCM.run(id, mid, i));
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
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
    db.exec("BEGIN");
    try {
      db.prepare(
        `UPDATE councils SET name=?, description=?, strategy=?, rounds=?, moderator_member_id=? WHERE id=?`
      ).run(
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
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
    const row = db.prepare("SELECT * FROM councils WHERE id = ?").get(id);
    return councilToDTO(row, councilMembers(db, id));
  });
  app.delete("/api/v1/councils/:id", async (req) => {
    const { id } = req.params;
    db.exec("BEGIN");
    try {
      db.prepare("DELETE FROM councils WHERE id = ?").run(id);
      logActivity(db, "council.deleted", { id });
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
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
import { randomUUID as randomUUID3 } from "node:crypto";
function registerSessionRoutes(app, deps) {
  const { db, bus, sessions } = deps;
  function snapshotForCouncil(councilId) {
    const council = db.prepare("SELECT id, name, description, strategy, rounds, moderator_member_id FROM councils WHERE id = ?").get(councilId);
    if (!council) throw new AppError(404, "not_found", "council not found");
    const members = db.prepare(
      `SELECT mem.id, mem.name, mem.system_prompt, mem.temperature, mem.max_tokens,
      mem.avatar_color, mem.enabled, m.id AS model_id, m.model_id AS model_name, m.display_name,
      p.id AS provider_id, p.name AS provider_name
      FROM council_members cm JOIN members mem ON mem.id = cm.member_id
      LEFT JOIN models m ON m.id = mem.model_id LEFT JOIN providers p ON p.id = m.provider_id
      WHERE cm.council_id = ? ORDER BY cm.position`
    ).all(councilId);
    return JSON.stringify({ ...council, members });
  }
  app.get("/api/v1/sessions", async (req) => {
    const q = req.query;
    const lim = Math.min(Math.max(parseInt(q.limit ?? "100", 10) || 100, 1), 500);
    const where = [];
    const params = [];
    if (q.status) {
      where.push("s.status = ?");
      params.push(q.status);
    }
    if (q.councilId) {
      where.push("s.council_id = ?");
      params.push(q.councilId);
    }
    if (q.search) {
      where.push("(s.topic LIKE ? OR c.name LIKE ?)");
      params.push(`%${q.search}%`, `%${q.search}%`);
    }
    if (q.createdAfter) {
      where.push("s.created_at >= ?");
      params.push(q.createdAfter);
    }
    if (q.createdBefore) {
      where.push("s.created_at <= ?");
      params.push(q.createdBefore);
    }
    if (q.cursor) {
      where.push("s.created_at < ?");
      params.push(q.cursor);
    }
    const rows = db.prepare(
      `SELECT s.*, COALESCE(c.name, json_extract(s.snapshot_json, '$.name')) AS council_name,
      (SELECT COUNT(*) FROM messages m WHERE m.session_id = s.id) AS message_count
      FROM sessions s LEFT JOIN councils c ON c.id = s.council_id
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""} ORDER BY s.created_at DESC LIMIT ?`
    ).all(...params, lim);
    return rows.map((r) => sessionToDTO(r));
  });
  app.post("/api/v1/sessions", async (req, reply) => {
    const body = sessionCreateSchema.parse(req.body);
    const council = db.prepare("SELECT id FROM councils WHERE id = ?").get(body.councilId);
    if (!council) throw new AppError(404, "not_found", "council not found");
    const id = randomUUID3();
    const snapshot = snapshotForCouncil(body.councilId);
    db.prepare(`INSERT INTO sessions (id, council_id, topic, status, snapshot_json) VALUES (?, ?, ?, 'queued', ?)`).run(
      id,
      body.councilId,
      body.topic,
      snapshot
    );
    logActivity(db, "session.started", { sessionId: id, councilId: body.councilId });
    sessions.startSession(id, body.councilId, body.topic);
    reply.code(202);
    return sessionToDTO(db.prepare("SELECT * FROM sessions WHERE id = ?").get(id));
  });
  app.get("/api/v1/sessions/:id", async (req) => {
    const { id } = req.params;
    const row = db.prepare(
      `SELECT s.*, COALESCE(c.name, json_extract(s.snapshot_json, '$.name')) AS council_name,
         COALESCE(c.moderator_member_id, json_extract(s.snapshot_json, '$.moderator_member_id')) AS moderator_member_id
         FROM sessions s LEFT JOIN councils c ON c.id = s.council_id WHERE s.id = ?`
    ).get(id);
    if (!row) throw new AppError(404, "not_found", "session not found");
    const msgs = db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY round, round_position, id").all(id);
    const usage = db.prepare(
      `SELECT COUNT(*) AS calls, COALESCE(SUM(total_tokens),0) AS tokens, COALESCE(SUM(cost_usd),0) AS cost
         FROM usage_events WHERE session_id = ? AND status = 'ok'`
    ).get(id);
    const lastEventSequence = Number(
      db.prepare("SELECT COALESCE(MAX(sequence),0) AS sequence FROM session_events WHERE session_id=?").get(id).sequence
    );
    return {
      session: sessionToDTO(row),
      messages: msgs.map((m) => messageToDTO(m)),
      usage,
      lastEventSequence
    };
  });
  app.post("/api/v1/sessions/:id/cancel", async (req) => {
    const { id } = req.params;
    const row = db.prepare("SELECT status FROM sessions WHERE id = ?").get(id);
    if (!row) throw new AppError(404, "not_found", "session not found");
    const ok = sessions.cancel(id);
    if (!ok && row.status === "queued") {
      db.prepare(
        "UPDATE sessions SET status='cancelled', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?"
      ).run(id);
    }
    return { ok: true };
  });
  app.post("/api/v1/sessions/:id/clone", async (req, reply) => {
    const { id } = req.params;
    const source = db.prepare("SELECT council_id, topic, snapshot_json FROM sessions WHERE id=?").get(id);
    if (!source) throw new AppError(404, "not_found", "session not found");
    const cloneId = randomUUID3();
    db.prepare("INSERT INTO sessions (id,council_id,topic,status,snapshot_json) VALUES (?,?,?,'queued',?)").run(
      cloneId,
      source.council_id,
      source.topic,
      source.snapshot_json
    );
    sessions.startSession(cloneId, source.council_id, source.topic);
    reply.code(202);
    return sessionToDTO(db.prepare("SELECT * FROM sessions WHERE id=?").get(cloneId));
  });
  app.post("/api/v1/sessions/:id/rerun", async (req, reply) => {
    const { id } = req.params;
    const source = db.prepare("SELECT council_id, topic FROM sessions WHERE id=?").get(id);
    if (!source) throw new AppError(404, "not_found", "session not found");
    const rerunId = randomUUID3();
    db.prepare("INSERT INTO sessions (id,council_id,topic,status) VALUES (?,?,?,'queued')").run(
      rerunId,
      source.council_id,
      source.topic
    );
    sessions.startSession(rerunId, source.council_id, source.topic);
    reply.code(202);
    return sessionToDTO(db.prepare("SELECT * FROM sessions WHERE id=?").get(rerunId));
  });
  app.get("/api/v1/sessions/:id/export", async (req, reply) => {
    const { id } = req.params;
    const { format = "json" } = req.query;
    const row = db.prepare("SELECT * FROM sessions WHERE id=?").get(id);
    if (!row) throw new AppError(404, "not_found", "session not found");
    const messages = db.prepare("SELECT * FROM messages WHERE session_id=? ORDER BY round, round_position, id").all(id);
    if (format === "markdown") {
      const session = row;
      reply.type("text/markdown; charset=utf-8");
      return `# OpenCouncil Session

**Status:** ${session.status}

## Question

${session.topic}

## Transcript

${messages.map((m) => `### ${m.member_name}

${m.content}`).join("\n\n")}`;
    }
    if (format === "jsonl") {
      reply.type("application/jsonl");
      return messages.map((m) => JSON.stringify(m)).join("\n");
    }
    if (format !== "json") throw new AppError(400, "invalid_format", "format must be json, jsonl, or markdown");
    return { session: row, messages };
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
    const { after } = req.query;
    const lastId = Number(req.headers["last-event-id"] ?? after ?? 0);
    const durable = db.prepare(
      "SELECT sequence, payload_json FROM session_events WHERE session_id = ? AND sequence > ? ORDER BY sequence"
    ).all(id, Number.isFinite(lastId) ? lastId : 0);
    for (const event of durable) reply.raw.write(`id: ${event.sequence}
data: ${event.payload_json}

`);
    if (durable.length === 0) {
      const existing = db.prepare("SELECT * FROM messages WHERE session_id = ? ORDER BY round, round_position, id").all(id);
      for (const m of existing)
        reply.raw.write(
          `data: ${JSON.stringify({ type: "message.replay", sessionId: id, message: messageToDTO(m) })}

`
        );
    }
    const unsub = bus.subscribe(
      id,
      (event, sequence) => {
        try {
          reply.raw.write(`id: ${sequence ?? ""}
data: ${JSON.stringify(event)}

`);
        } catch {
          unsub();
        }
      },
      () => reply.raw.write(": heartbeat\n\n")
    );
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

// apps/server/src/routes/config.ts
var config_exports = {};
__export(config_exports, {
  registerConfigRoutes: () => registerConfigRoutes
});
function registerConfigRoutes(app, db) {
  app.get("/api/v1/config/export", async () => {
    const councils = db.prepare(
      "SELECT id,name,description,strategy,rounds,moderator_member_id AS moderatorMemberId FROM councils ORDER BY created_at"
    ).all().map((c) => ({
      ...c,
      memberIds: db.prepare("SELECT member_id FROM council_members WHERE council_id=? ORDER BY position").all(c.id).map((m) => m.member_id)
    }));
    return {
      version: 1,
      providers: db.prepare(
        "SELECT id,name,protocol,base_url AS baseUrl,default_model_id AS defaultModelId,enabled,api_key_encrypted IS NOT NULL AS hasSecret FROM providers ORDER BY created_at"
      ).all(),
      models: db.prepare(
        "SELECT id,provider_id AS providerId,model_id AS modelId,display_name AS displayName,context_window AS contextWindow,input_per_mtok_usd AS inputPerMTokUsd,output_per_mtok_usd AS outputPerMTokUsd,enabled FROM models ORDER BY created_at"
      ).all(),
      members: db.prepare(
        "SELECT id,name,model_id AS modelId,system_prompt AS systemPrompt,temperature,max_tokens AS maxTokens,avatar_color AS avatarColor,enabled FROM members ORDER BY created_at"
      ).all(),
      councils
    };
  });
  app.post("/api/v1/config/import", async (req) => {
    const parsed = configImportSchema.safeParse(req.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      throw new AppError(
        400,
        "invalid_config",
        issue ? `${issue.path.join(".") || "body"}: ${issue.message}` : "invalid config payload"
      );
    }
    const body = parsed.data;
    db.exec("BEGIN");
    try {
      for (const p of body.providers) {
        db.prepare(
          `INSERT INTO providers (id,name,protocol,base_url,default_model_id,enabled,api_key_encrypted) VALUES (?,?,?,?,?,?,NULL) ON CONFLICT(id) DO UPDATE SET name=excluded.name,protocol=excluded.protocol,base_url=excluded.base_url,default_model_id=excluded.default_model_id,enabled=excluded.enabled`
        ).run(p.id, p.name, p.protocol, p.baseUrl ?? null, p.defaultModelId ?? null, p.enabled === false ? 0 : 1);
      }
      for (const m of body.models)
        db.prepare(
          `INSERT INTO models (id,provider_id,model_id,display_name,context_window,input_per_mtok_usd,output_per_mtok_usd,enabled) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET display_name=excluded.display_name,enabled=excluded.enabled`
        ).run(
          m.id,
          m.providerId,
          m.modelId,
          m.displayName,
          m.contextWindow ?? null,
          m.inputPerMTokUsd ?? null,
          m.outputPerMTokUsd ?? null,
          m.enabled === false ? 0 : 1
        );
      for (const m of body.members)
        db.prepare(
          `INSERT INTO members (id,name,model_id,system_prompt,temperature,max_tokens,avatar_color,enabled) VALUES (?,?,?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,model_id=excluded.model_id,system_prompt=excluded.system_prompt,temperature=excluded.temperature,max_tokens=excluded.max_tokens,avatar_color=excluded.avatar_color,enabled=excluded.enabled`
        ).run(
          m.id,
          m.name,
          m.modelId ?? null,
          m.systemPrompt ?? null,
          m.temperature ?? 0.7,
          m.maxTokens ?? null,
          m.avatarColor ?? "#c9a227",
          m.enabled === false ? 0 : 1
        );
      for (const c of body.councils) {
        db.prepare(
          `INSERT INTO councils (id,name,description,strategy,rounds,moderator_member_id) VALUES (?,?,?,?,?,?) ON CONFLICT(id) DO UPDATE SET name=excluded.name,description=excluded.description,strategy=excluded.strategy,rounds=excluded.rounds,moderator_member_id=excluded.moderator_member_id`
        ).run(
          c.id,
          c.name,
          c.description ?? null,
          c.strategy ?? "round_robin",
          c.rounds ?? 1,
          c.moderatorMemberId ?? null
        );
        db.prepare("DELETE FROM council_members WHERE council_id=?").run(c.id);
        for (const [position, memberId] of (c.memberIds ?? []).entries())
          db.prepare("INSERT INTO council_members (council_id,member_id,position) VALUES (?,?,?)").run(
            c.id,
            memberId,
            position
          );
      }
      db.exec("COMMIT");
      return {
        ok: true,
        imported: {
          providers: body.providers.length,
          models: body.models.length,
          members: body.members.length,
          councils: body.councils.length
        },
        secretsImported: false
      };
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  });
}
var init_config = __esm({
  "apps/server/src/routes/config.ts"() {
    "use strict";
    init_dist();
    init_errors();
  }
});

// apps/server/src/app.ts
var app_exports = {};
__export(app_exports, {
  buildApp: () => buildApp,
  makeRunnerDbHelpers: () => makeRunnerDbHelpers
});
import Fastify from "fastify";
import { randomUUID as randomUUID4 } from "node:crypto";
function makeRunnerDbHelpers(db) {
  return {
    recordUsage(u) {
      const result = db.prepare(
        `INSERT INTO usage_events (session_id, provider_id, provider_name, model_id, member_id, member_name, model_name,
          prompt_tokens, completion_tokens, total_tokens, cost_usd, latency_ms, retry_count, error_code, status)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(
        u.sessionId,
        u.providerId ?? null,
        u.providerName || null,
        u.modelId ?? null,
        u.memberId ?? null,
        u.memberName,
        u.modelName,
        u.promptTokens,
        u.completionTokens,
        u.promptTokens + u.completionTokens,
        u.costUsd,
        u.latencyMs,
        u.retryCount ?? 0,
        u.errorCode ?? null,
        u.status
      );
      return Number(result.lastInsertRowid);
    },
    insertMessage(m) {
      const role = m.kind === "user" ? "user" : "assistant";
      const info = db.prepare(
        `INSERT INTO messages (session_id, member_id, member_name, role, kind, round, round_position, content)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
      ).run(m.sessionId, m.memberId, m.memberName, role, m.kind, m.round, m.roundPosition ?? 0, m.content);
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
        `SELECT m.model_id AS modelId, m.id AS stableModelId, p.id AS providerId, p.name AS providerName,
                  m.display_name AS modelName, m.context_window AS contextWindow, p.protocol AS providerProtocol, p.base_url AS providerBaseUrl,
                  p.api_key_encrypted AS apiKeyEncrypted, m.input_per_mtok_usd AS inputPerMTokUsd,
                  m.output_per_mtok_usd AS outputPerMTokUsd
           FROM models m JOIN providers p ON p.id = m.provider_id WHERE m.id = ?`
      ).get(modelId);
      return row ?? null;
    },
    updateSessionStatus(sessionId, status, error) {
      if (status === "running") {
        db.prepare(
          `UPDATE sessions SET status='running', started_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=?`
        ).run(sessionId);
      } else {
        db.prepare(
          `UPDATE sessions SET status=?, completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now'), error=COALESCE(?, error) WHERE id=?`
        ).run(status, error ?? null, sessionId);
      }
    }
  };
}
async function buildApp(deps) {
  const app = Fastify({ logger: { level: deps.config.logLevel } });
  const { registerErrorHandlers: registerErrorHandlers2 } = await Promise.resolve().then(() => (init_errors(), errors_exports));
  registerErrorHandlers2(app);
  app.get("/api/v1/health", async () => ({ ok: true, version: VERSION, instanceId: INSTANCE_ID }));
  app.get("/api/v1/system/health", async () => ({ ok: true, version: VERSION, instanceId: INSTANCE_ID }));
  app.get("/api/v1/system/info", async () => ({
    version: VERSION,
    instanceId: INSTANCE_ID,
    uptimeSeconds: Math.floor(process.uptime()),
    providers: Number(
      deps.db.prepare("SELECT COUNT(*) AS n FROM providers WHERE enabled=1").get().n
    ),
    models: Number(deps.db.prepare("SELECT COUNT(*) AS n FROM models WHERE enabled=1").get().n),
    members: Number(deps.db.prepare("SELECT COUNT(*) AS n FROM members WHERE enabled=1").get().n),
    councils: Number(deps.db.prepare("SELECT COUNT(*) AS n FROM councils").get().n),
    runningSessions: Number(
      deps.db.prepare("SELECT COUNT(*) AS n FROM sessions WHERE status IN ('queued','running')").get().n
    )
  }));
  const { registerProviderRoutes: registerProviderRoutes2 } = await Promise.resolve().then(() => (init_providers(), providers_exports));
  registerProviderRoutes2(app, deps.db);
  const { registerMemberCouncilRoutes: registerMemberCouncilRoutes2 } = await Promise.resolve().then(() => (init_councils(), councils_exports));
  registerMemberCouncilRoutes2(app, deps.db);
  const { registerSessionRoutes: registerSessionRoutes2 } = await Promise.resolve().then(() => (init_sessions(), sessions_exports));
  registerSessionRoutes2(app, { db: deps.db, bus: deps.bus, sessions: deps.sessions });
  const { registerActivityRoutes: registerActivityRoutes2 } = await Promise.resolve().then(() => (init_activity(), activity_exports));
  registerActivityRoutes2(app, deps.db);
  const { registerConfigRoutes: registerConfigRoutes2 } = await Promise.resolve().then(() => (init_config(), config_exports));
  registerConfigRoutes2(app, deps.db);
  return app;
}
var INSTANCE_ID;
var init_app = __esm({
  "apps/server/src/app.ts"() {
    "use strict";
    init_version();
    INSTANCE_ID = randomUUID4();
  }
});

// apps/server/src/env.ts
var env_exports = {};
__export(env_exports, {
  loadEnvFile: () => loadEnvFile
});
import path2 from "node:path";
function loadEnvFile(cwd = process.cwd()) {
  const override = process.env.OPEN_COUNCIL_ENV_FILE;
  const file = override ? path2.resolve(cwd, override) : path2.join(cwd, ".env");
  try {
    process.loadEnvFile(file);
    return file;
  } catch (error) {
    if (!override && error.code === "ENOENT") return null;
    throw new Error(`could not read env file ${file}: ${error instanceof Error ? error.message : String(error)}`);
  }
}
var init_env = __esm({
  "apps/server/src/env.ts"() {
    "use strict";
  }
});

// apps/server/src/config.ts
var config_exports2 = {};
__export(config_exports2, {
  loadConfig: () => loadConfig
});
import { randomBytes as randomBytes2 } from "node:crypto";
import { mkdirSync } from "node:fs";
import path3 from "node:path";
import { z as z2 } from "zod";
function loadConfig(env = process.env) {
  const parsed = envSchema.parse(env);
  const isAbsolute = parsed.DATABASE_PATH.startsWith("/");
  let databasePath = parsed.DATABASE_PATH;
  if (!isAbsolute && !parsed.DATABASE_PATH.includes(process.cwd())) {
    databasePath = path3.join(process.cwd(), parsed.DATABASE_PATH);
  }
  const dataDir = path3.dirname(databasePath);
  mkdirSync(dataDir, { recursive: true });
  const secretKey = parsed.OPEN_COUNCIL_SECRET_KEY ?? randomBytes2(32).toString("hex");
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
var envSchema;
var init_config2 = __esm({
  "apps/server/src/config.ts"() {
    "use strict";
    envSchema = z2.object({
      HOST: z2.string().default("127.0.0.1"),
      PORT: z2.coerce.number().int().min(1).max(65535).default(4311),
      DATABASE_PATH: z2.string().default("./data/opencouncil.db"),
      OPEN_COUNCIL_SECRET_KEY: z2.string().min(8).optional(),
      SEED_DEMO_COUNCIL: z2.string().default("true").transform((v) => v !== "false" && v !== "0"),
      LOG_LEVEL: z2.enum(["fatal", "error", "warn", "info", "debug", "trace"]).default("info")
    });
  }
});

// apps/server/src/db/connection.ts
var connection_exports = {};
__export(connection_exports, {
  migrate: () => migrate,
  openDatabase: () => openDatabase,
  recoverInterruptedSessions: () => recoverInterruptedSessions
});
function openDatabase(config) {
  const db = new DatabaseSync(config.databasePath);
  db.exec("PRAGMA journal_mode = WAL");
  db.exec("PRAGMA foreign_keys = ON");
  return db;
}
function migrate(db) {
  db.exec("CREATE TABLE IF NOT EXISTS schema_migrations (version INTEGER PRIMARY KEY, name TEXT, applied_at TEXT)");
  const applied = new Set(
    db.prepare("SELECT version FROM schema_migrations").all().map((r) => r.version)
  );
  for (const m of MIGRATIONS) {
    if (applied.has(m.version)) continue;
    db.exec("BEGIN");
    try {
      db.exec(m.sql);
      db.prepare("INSERT INTO schema_migrations (version, name) VALUES (?, ?)").run(m.version, m.name);
      db.exec("COMMIT");
    } catch (error) {
      db.exec("ROLLBACK");
      throw error;
    }
  }
}
function recoverInterruptedSessions(db) {
  const result = db.prepare(
    `UPDATE sessions SET status='failed', error='process restarted before session completed', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE status IN ('queued','running')`
  ).run();
  return Number(result.changes);
}
var getBuiltinModule, DatabaseSync, MIGRATIONS;
var init_connection = __esm({
  "apps/server/src/db/connection.ts"() {
    "use strict";
    getBuiltinModule = process.getBuiltinModule;
    ({ DatabaseSync } = getBuiltinModule("node:sqlite"));
    MIGRATIONS = [
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
      },
      {
        version: 2,
        name: "historical-snapshots-and-usage-identifiers",
        sql: `
ALTER TABLE council_members RENAME TO council_members_v1;
ALTER TABLE members RENAME TO members_v1;
CREATE TABLE members (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
  system_prompt TEXT,
  temperature REAL NOT NULL DEFAULT 0.7,
  max_tokens INTEGER,
  avatar_color TEXT NOT NULL DEFAULT '#c9a227',
  enabled INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
);
INSERT INTO members SELECT * FROM members_v1;
DROP TABLE members_v1;
CREATE TABLE council_members (
  council_id TEXT NOT NULL REFERENCES councils(id) ON DELETE CASCADE,
  member_id TEXT NOT NULL REFERENCES members(id) ON DELETE CASCADE,
  position INTEGER NOT NULL DEFAULT 0,
  PRIMARY KEY (council_id, member_id)
);
INSERT INTO council_members SELECT * FROM council_members_v1;
DROP TABLE council_members_v1;
ALTER TABLE sessions ADD COLUMN snapshot_json TEXT;
ALTER TABLE usage_events ADD COLUMN provider_id TEXT;
ALTER TABLE usage_events ADD COLUMN model_id TEXT;
ALTER TABLE usage_events ADD COLUMN member_id TEXT;
ALTER TABLE messages ADD COLUMN round_position INTEGER NOT NULL DEFAULT 0;
CREATE INDEX idx_usage_session ON usage_events(session_id);
CREATE TABLE session_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  session_id TEXT NOT NULL REFERENCES sessions(id) ON DELETE CASCADE,
  sequence INTEGER NOT NULL,
  type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
  UNIQUE(session_id, sequence)
);
CREATE INDEX idx_session_events_sequence ON session_events(session_id, sequence);
`
      },
      {
        version: 3,
        name: "usage-retries-and-errors",
        sql: `
ALTER TABLE usage_events ADD COLUMN retry_count INTEGER NOT NULL DEFAULT 0;
ALTER TABLE usage_events ADD COLUMN error_code TEXT;
`
      }
    ];
  }
});

// apps/server/src/db/seed.ts
var seed_exports = {};
__export(seed_exports, {
  seedDemoCouncil: () => seedDemoCouncil
});
import { randomUUID as randomUUID5 } from "node:crypto";
function seedDemoCouncil(db) {
  const existing = db.prepare("SELECT COUNT(*) AS n FROM councils").get();
  if (existing.n > 0) return false;
  const providerId = randomUUID5();
  db.prepare(
    `INSERT INTO providers (id, name, protocol, base_url, api_key_encrypted, default_model_id, enabled)
     VALUES (?, ?, 'mock', NULL, NULL, NULL, 1)`
  ).run(providerId, "Demo (Mock)");
  const models = [
    { id: randomUUID5(), modelId: "demo-oracle", name: "Oracle of the East" },
    { id: randomUUID5(), modelId: "demo-skeptic", name: "Skeptic of the West" },
    { id: randomUUID5(), modelId: "demo-moderator", name: "Arbiter Prime" }
  ];
  const insertModel = db.prepare(
    `INSERT INTO models (id, provider_id, model_id, display_name, enabled) VALUES (?, ?, ?, ?, 1)`
  );
  for (const m of models) {
    insertModel.run(m.id, providerId, m.modelId, m.name);
  }
  const members = [
    {
      id: randomUUID5(),
      name: "The Oracle",
      modelIdx: 0,
      prompt: "You are The Oracle \u2014 visionary, big-picture thinker. Propose bold, well-structured solutions and consider second-order effects.",
      color: PALETTE[0]
    },
    {
      id: randomUUID5(),
      name: "The Skeptic",
      modelIdx: 1,
      prompt: "You are The Skeptic \u2014 ruthless stress-tester. Challenge assumptions, hunt for flaws, demand evidence. Concede only to strong arguments.",
      color: PALETTE[3]
    },
    {
      id: randomUUID5(),
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
  const councilId = randomUUID5();
  db.prepare(
    `INSERT INTO councils (id, name, description, strategy, rounds, moderator_member_id)
     VALUES (?, 'Founding Council', 'Demo council running on the built-in mock provider.', 'debate', 2, ?)`
  ).run(councilId, members[2].id);
  const insertCM = db.prepare("INSERT INTO council_members (council_id, member_id, position) VALUES (?, ?, ?)");
  members.forEach((m, i) => insertCM.run(councilId, m.id, i));
  return true;
}
var PALETTE;
var init_seed = __esm({
  "apps/server/src/db/seed.ts"() {
    "use strict";
    PALETTE = ["#c9a227", "#4f86c6", "#a0522d", "#557a46", "#8e5ea2", "#b0413e"];
  }
});

// apps/server/src/engine/session-manager.ts
var session_manager_exports = {};
__export(session_manager_exports, {
  SessionManager: () => SessionManager,
  newSessionId: () => newSessionId
});
import { randomUUID as randomUUID6 } from "node:crypto";
function newSessionId() {
  return randomUUID6();
}
var SessionManager;
var init_session_manager = __esm({
  "apps/server/src/engine/session-manager.ts"() {
    "use strict";
    init_runner();
    SessionManager = class {
      constructor(bus, runner, maxConcurrentSessions = 4) {
        this.bus = bus;
        this.runner = runner;
        this.maxConcurrentSessions = maxConcurrentSessions;
      }
      aborts = /* @__PURE__ */ new Map();
      pending = [];
      active = 0;
      /** Kicks off deliberation for a pre-created session row. */
      startSession(sessionId, councilId, topic) {
        if (this.active >= this.maxConcurrentSessions) {
          this.pending.push({ sessionId, councilId, topic });
          return;
        }
        this.runSession(sessionId, councilId, topic);
      }
      runSession(sessionId, councilId, topic) {
        const ac = new AbortController();
        this.aborts.set(sessionId, ac);
        this.active++;
        const runner = this.runner;
        void (async () => {
          try {
            await runner.run(sessionId, councilId, topic, ac.signal);
          } catch (err) {
            if (!(err instanceof SessionCancelled)) return;
          } finally {
            setTimeout(() => this.bus.closeSession(sessionId), 3e4);
            this.aborts.delete(sessionId);
            this.active--;
            const next = this.pending.shift();
            if (next) this.runSession(next.sessionId, next.councilId, next.topic);
          }
        })();
      }
      cancel(sessionId) {
        const pendingIndex = this.pending.findIndex((job) => job.sessionId === sessionId);
        if (pendingIndex >= 0) {
          this.pending.splice(pendingIndex, 1);
          return false;
        }
        const ac = this.aborts.get(sessionId);
        if (!ac) return false;
        ac.abort();
        return true;
      }
      isRunning(sessionId) {
        return this.aborts.has(sessionId);
      }
    };
  }
});

// apps/server/src/cli.ts
init_crypto();
import path4 from "node:path";
import { createReadStream, existsSync } from "node:fs";
import { fileURLToPath as fileURLToPath2 } from "node:url";
import { randomUUID as randomUUID7 } from "node:crypto";
function parseArgs(argv) {
  const args = {
    command: "serve",
    seed: true,
    help: false,
    version: false,
    json: false,
    options: {},
    positionals: []
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    switch (a) {
      case "-p":
      case "--port":
        {
          const value = argv[++i];
          const port = Number(value);
          if (!value || !Number.isInteger(port) || port < 1 || port > 65535)
            throw new Error(`invalid port: ${value ?? "(missing)"}`);
          args.port = port;
        }
        break;
      case "-H":
      case "--host":
        {
          const value = argv[++i];
          if (!value || value.startsWith("-")) throw new Error("missing host value");
          args.host = value;
        }
        break;
      case "--db":
        {
          const value = argv[++i];
          if (!value || value.startsWith("-")) throw new Error("missing --db value");
          args.databasePath = value;
        }
        break;
      case "--no-seed":
        args.seed = false;
        break;
      case "--json":
        args.json = true;
        break;
      case "-v":
      case "--version":
        args.version = true;
        break;
      case "-h":
      case "--help":
        args.help = true;
        break;
      default:
        if (a.startsWith("--")) {
          const key = a.slice(2);
          if (![
            "council",
            "id",
            "name",
            "protocol",
            "base-url",
            "api-key",
            "provider",
            "model-id",
            "context-window",
            "model",
            "prompt",
            "temperature",
            "max-tokens",
            "color"
          ].includes(key))
            throw new Error(`unknown option: ${a}`);
          const next = argv[i + 1];
          if (next && !next.startsWith("-")) {
            args.options[key] = next;
            i++;
          } else args.options[key] = true;
          break;
        }
        if (a.startsWith("-")) throw new Error(`unknown option: ${a}`);
        if (args.command === "serve" && /^\d+$/.test(a)) {
          const port = Number(a);
          if (port < 1 || port > 65535) throw new Error(`invalid port: ${a}`);
          args.port = port;
          break;
        }
        if (args.command === "serve" && ["serve", "doctor", "provider", "model", "member", "council", "session", "usage"].includes(a)) {
          args.command = a;
          break;
        }
        if (["provider", "model", "member", "council", "session"].includes(args.command) && !args.subcommand) {
          args.subcommand = a;
          break;
        }
        args.positionals.push(a);
    }
  }
  return args;
}
function printHelp() {
  console.log(`
  \u{1F3DB} OpenCouncil \u2014 convene your LLMs as a council

  Usage: opencouncil [command] [options]

  Commands:
    serve               Start the API and static UI (default)
    doctor              Check local database and package prerequisites
    provider list        List providers
    model list           List models
    member list          List members
    council list        List configured councils
    session list        List recent sessions
    usage               Show aggregate usage totals

  Options:
    -p, --port <n>     HTTP port (default 4311)
    -H, --host <addr>  Bind address (default 127.0.0.1; use 0.0.0.0 with care)
        --db <path>    SQLite database file (default ./data/opencouncil.db)
        --no-seed      Skip demo council seeding on empty database
    -v, --version      Print version
    -h, --help         This help
        --json         Machine-readable output for headless commands

  Environment (read from ./.env if present; real env vars win, flags win over both):
    OPEN_COUNCIL_SECRET_KEY  Master key encrypting provider API keys at rest
                             (required for keys to survive restarts)
    OPEN_COUNCIL_ENV_FILE    Alternate env file path (default ./.env)
    HOST, PORT               Bind address and port
    DATABASE_PATH            SQLite database file
    SEED_DEMO_COUNCIL        Set to "false" to disable seeding
    LOG_LEVEL                fatal|error|warn|info|debug|trace

  Then open http://localhost:<port> \u2014 the seeded mock council lets you watch a
  full deliberation immediately. Add your own providers under Settings.
`);
}
function printResult(value, json) {
  if (json) console.log(JSON.stringify(value));
  else if (Array.isArray(value)) {
    if (value.length === 0) console.log("No results.");
    else for (const row of value) console.log(Object.values(row).join("	"));
  } else console.log(value);
}
function runHeadless(args, db, packageRoot) {
  const value = (name, fallback) => {
    const v = args.options[name];
    return typeof v === "string" ? v : fallback;
  };
  if (args.command === "provider") {
    if (args.subcommand === "list")
      printResult(
        db.prepare(
          "SELECT id, name, protocol, base_url AS baseUrl, enabled, api_key_encrypted IS NOT NULL AS hasApiKey FROM providers ORDER BY name"
        ).all(),
        args.json
      );
    else if (args.subcommand === "remove") {
      const id = args.positionals[0] ?? value("id");
      if (!id) throw new Error("provider remove requires an id");
      db.prepare("UPDATE members SET enabled=0 WHERE model_id IN (SELECT id FROM models WHERE provider_id=?)").run(id);
      db.prepare("DELETE FROM providers WHERE id=?").run(id);
      printResult({ ok: true }, args.json);
    } else if (args.subcommand === "add") {
      const name = value("name");
      const protocol = value("protocol", "openai_compatible");
      if (!name) throw new Error("provider add requires --name");
      const id = randomUUID7();
      db.prepare(
        "INSERT INTO providers (id,name,protocol,base_url,api_key_encrypted,enabled) VALUES (?,?,?,?,?,1)"
      ).run(id, name, protocol, value("base-url") ?? null, value("api-key") ? encryptSecret(value("api-key")) : null);
      printResult({ id, name, protocol }, args.json);
    } else throw new Error("supported provider commands: list, add, remove");
  } else if (args.command === "model") {
    if (args.subcommand === "list")
      printResult(
        db.prepare(
          "SELECT m.id, m.model_id AS modelId, m.display_name AS displayName, p.name AS provider, m.enabled FROM models m JOIN providers p ON p.id=m.provider_id ORDER BY p.name,m.display_name"
        ).all(),
        args.json
      );
    else if (args.subcommand === "remove") {
      const id = args.positionals[0] ?? value("id");
      if (!id) throw new Error("model remove requires an id");
      db.prepare("UPDATE members SET enabled=0 WHERE model_id=?").run(id);
      db.prepare("DELETE FROM models WHERE id=?").run(id);
      printResult({ ok: true }, args.json);
    } else if (args.subcommand === "add") {
      const providerId = value("provider");
      const modelId = value("model-id");
      const displayName = value("name", modelId);
      if (!providerId || !modelId || !displayName)
        throw new Error("model add requires --provider, --model-id, and --name");
      const id = randomUUID7();
      db.prepare(
        "INSERT INTO models (id,provider_id,model_id,display_name,context_window,enabled) VALUES (?,?,?,?,?,1)"
      ).run(id, providerId, modelId, displayName, value("context-window") ? Number(value("context-window")) : null);
      printResult({ id, modelId, displayName }, args.json);
    } else throw new Error("supported model commands: list, add, remove");
  } else if (args.command === "member") {
    if (args.subcommand === "list")
      printResult(
        db.prepare(
          "SELECT mem.id, mem.name, mem.enabled, m.display_name AS model, p.name AS provider FROM members mem LEFT JOIN models m ON m.id=mem.model_id LEFT JOIN providers p ON p.id=m.provider_id ORDER BY mem.name"
        ).all(),
        args.json
      );
    else if (args.subcommand === "remove") {
      const id = args.positionals[0] ?? value("id");
      if (!id) throw new Error("member remove requires an id");
      db.prepare("UPDATE councils SET moderator_member_id=NULL WHERE moderator_member_id=?").run(id);
      db.prepare("DELETE FROM members WHERE id=?").run(id);
      printResult({ ok: true }, args.json);
    } else if (args.subcommand === "add") {
      const name = value("name");
      const modelId = value("model");
      if (!name || !modelId) throw new Error("member add requires --name and --model");
      const id = randomUUID7();
      db.prepare(
        "INSERT INTO members (id,name,model_id,system_prompt,temperature,max_tokens,avatar_color,enabled) VALUES (?,?,?,?,?,?,?,1)"
      ).run(
        id,
        name,
        modelId,
        value("prompt") ?? null,
        Number(value("temperature", "0.7")),
        value("max-tokens") ? Number(value("max-tokens")) : null,
        value("color", "#c9a227")
      );
      printResult({ id, name }, args.json);
    } else throw new Error("supported member commands: list, add, remove");
  } else if (args.command === "council") {
    if (args.subcommand === "list") {
      printResult(
        db.prepare(
          `SELECT id, name, strategy, rounds, (SELECT COUNT(*) FROM council_members cm WHERE cm.council_id = councils.id) AS members FROM councils ORDER BY created_at`
        ).all(),
        args.json
      );
    } else if (args.subcommand === "show") {
      const id = args.positionals[0] ?? value("id");
      if (!id) throw new Error("council show requires an id");
      const council = db.prepare("SELECT * FROM councils WHERE id = ? OR name = ?").get(id, id);
      if (!council) throw new Error("council not found");
      const members = db.prepare(
        `SELECT mem.id, mem.name, m.display_name AS model, p.name AS provider FROM council_members cm JOIN members mem ON mem.id=cm.member_id LEFT JOIN models m ON m.id=mem.model_id LEFT JOIN providers p ON p.id=m.provider_id WHERE cm.council_id=? ORDER BY cm.position`
      ).all(council.id);
      printResult({ council, members }, args.json);
    } else if (args.subcommand === "delete") {
      const id = args.positionals[0] ?? value("id");
      if (!id) throw new Error("council delete requires an id");
      db.prepare("DELETE FROM councils WHERE id = ? OR name = ?").run(id, id);
      printResult({ ok: true }, args.json);
    } else if (args.subcommand === "run") {
      throw new Error("council run is initialized by the async runner path");
    } else throw new Error("supported council commands: list, show, delete, run");
  } else if (args.command === "session") {
    if (args.subcommand === "list")
      printResult(
        db.prepare(
          `SELECT s.id, COALESCE(c.name, json_extract(s.snapshot_json, '$.name')) AS council, s.status, s.topic, s.created_at AS createdAt FROM sessions s LEFT JOIN councils c ON c.id = s.council_id ORDER BY s.created_at DESC LIMIT 100`
        ).all(),
        args.json
      );
    else if (args.subcommand === "show") {
      const id = args.positionals[0];
      if (!id) throw new Error("session show requires an id");
      printResult(db.prepare("SELECT * FROM sessions WHERE id=?").get(id), args.json);
    } else if (args.subcommand === "cancel") {
      const id = args.positionals[0];
      if (!id) throw new Error("session cancel requires an id");
      db.prepare(
        "UPDATE sessions SET status='cancelled', completed_at=strftime('%Y-%m-%dT%H:%M:%fZ','now') WHERE id=? AND status IN ('queued','running')"
      ).run(id);
      printResult({ ok: true }, args.json);
    } else throw new Error("supported session commands: list, show, cancel");
  } else if (args.command === "usage") {
    printResult(
      db.prepare(
        `SELECT COUNT(*) AS calls, COALESCE(SUM(prompt_tokens),0) AS promptTokens, COALESCE(SUM(completion_tokens),0) AS completionTokens, COALESCE(SUM(total_tokens),0) AS totalTokens, COALESCE(SUM(cost_usd),0) AS costUsd, SUM(CASE WHEN status='error' THEN 1 ELSE 0 END) AS errors FROM usage_events`
      ).get(),
      args.json
    );
  } else if (args.command === "doctor") {
    printResult(
      {
        node: process.versions.node,
        database: "ok",
        migrations: Number(db.prepare("SELECT COUNT(*) AS n FROM schema_migrations").get().n) > 0 ? "ok" : "missing",
        staticAssets: existsSync(path4.join(packageRoot, "apps", "server", "dist", "public", "index.html")) || existsSync(path4.join(packageRoot, "apps", "web", "out", "index.html")) ? "ok" : "missing",
        vault: process.env.OPEN_COUNCIL_SECRET_KEY ? "durable-key-configured" : "ephemeral-key-warning"
      },
      args.json
    );
  }
  db.close();
  return args.command !== "serve";
}
async function runLocalCouncil(args, db) {
  const councilRef = typeof args.options.council === "string" ? args.options.council : void 0;
  const topic = args.positionals.join(" ").trim();
  if (!councilRef || !topic) throw new Error("council run requires --council <id|name> and a question");
  const council = db.prepare("SELECT * FROM councils WHERE id = ? OR name = ?").get(councilRef, councilRef);
  if (!council) throw new Error("council not found");
  const sessionId = randomUUID7();
  const members = db.prepare(
    `SELECT mem.id, mem.name, mem.system_prompt, mem.temperature, mem.max_tokens, m.id AS model_id, m.model_id AS model_name, m.display_name, p.id AS provider_id, p.name AS provider_name FROM council_members cm JOIN members mem ON mem.id=cm.member_id LEFT JOIN models m ON m.id=mem.model_id LEFT JOIN providers p ON p.id=m.provider_id WHERE cm.council_id=? ORDER BY cm.position`
  ).all(council.id);
  const councilConfig = db.prepare("SELECT id, name, strategy, rounds, moderator_member_id FROM councils WHERE id=?").get(council.id);
  db.prepare(`INSERT INTO sessions (id, council_id, topic, status, snapshot_json) VALUES (?, ?, ?, 'queued', ?)`).run(
    sessionId,
    council.id,
    topic,
    JSON.stringify({ ...councilConfig, members })
  );
  const { SessionBus: SessionBus2 } = await Promise.resolve().then(() => (init_bus(), bus_exports));
  const { SessionRunner: SessionRunner2 } = await Promise.resolve().then(() => (init_runner(), runner_exports));
  const { makeRunnerDbHelpers: makeRunnerDbHelpers2 } = await Promise.resolve().then(() => (init_app(), app_exports));
  const bus = new SessionBus2(
    (event, sequence) => db.prepare("INSERT INTO session_events (session_id, sequence, type, payload_json) VALUES (?, ?, ?, ?)").run(event.sessionId, sequence, event.type, JSON.stringify(event))
  );
  const helpers = makeRunnerDbHelpers2(db);
  const runner = new SessionRunner2({
    bus,
    recordUsage: helpers.recordUsage,
    insertMessage: helpers.insertMessage,
    loadCouncil: helpers.loadCouncil,
    loadModelForChat: helpers.loadModelForChat,
    updateSessionStatus: helpers.updateSessionStatus
  });
  const unsubscribe = bus.subscribe(sessionId, (event) => console.log(JSON.stringify(event)));
  try {
    await runner.run(sessionId, council.id, topic, new AbortController().signal);
  } finally {
    unsubscribe();
    db.close();
  }
}
async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (error) {
    console.error(`[opencouncil] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }
  if (args.help) {
    printHelp();
    return;
  }
  if (args.version) {
    const { VERSION: VERSION2 } = await Promise.resolve().then(() => (init_version(), version_exports));
    console.log(VERSION2);
    return;
  }
  const { loadEnvFile: loadEnvFile2 } = await Promise.resolve().then(() => (init_env(), env_exports));
  try {
    loadEnvFile2();
  } catch (error) {
    console.error(`[opencouncil] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 2;
    return;
  }
  const here = path4.dirname(fileURLToPath2(import.meta.url));
  const packageRoot = path4.resolve(here, "..", "..", "..");
  const packagedWebDir = path4.join(here, "public");
  const sourceWebDir = path4.join(packageRoot, "apps", "web", "out");
  const webOutDir = existsSync(packagedWebDir) ? packagedWebDir : sourceWebDir;
  if (args.host !== void 0) process.env.HOST = args.host;
  if (args.port !== void 0) process.env.PORT = String(args.port);
  if (args.databasePath) process.env.DATABASE_PATH = args.databasePath;
  if (!args.seed) process.env.SEED_DEMO_COUNCIL = "false";
  process.env.LOG_LEVEL = process.env.LOG_LEVEL ?? "info";
  const { loadConfig: loadConfig2 } = await Promise.resolve().then(() => (init_config2(), config_exports2));
  const config = loadConfig2();
  const { initVault: initVault2 } = await Promise.resolve().then(() => (init_crypto(), crypto_exports));
  initVault2(config.secretKey);
  const { openDatabase: openDatabase2, migrate: migrate2, recoverInterruptedSessions: recoverInterruptedSessions2 } = await Promise.resolve().then(() => (init_connection(), connection_exports));
  const { seedDemoCouncil: seedDemoCouncil2 } = await Promise.resolve().then(() => (init_seed(), seed_exports));
  const db = openDatabase2(config);
  migrate2(db);
  if (args.command === "serve") recoverInterruptedSessions2(db);
  if (config.seedDemoCouncil && seedDemoCouncil2(db) && args.command === "serve") {
    console.log("[opencouncil] seeded demo council (mock provider)");
  }
  if (!config.hasDurableSecret && args.command === "serve") {
    console.warn(
      "[opencouncil] WARNING: OPEN_COUNCIL_SECRET_KEY not set \u2014 provider API keys stored now will be unreadable after restart."
    );
  }
  if (args.command === "council" && args.subcommand === "run") {
    await runLocalCouncil(args, db);
    return;
  }
  if (args.command !== "serve" && runHeadless(args, db, packageRoot)) return;
  const { SessionBus: SessionBus2 } = await Promise.resolve().then(() => (init_bus(), bus_exports));
  const { SessionRunner: SessionRunner2 } = await Promise.resolve().then(() => (init_runner(), runner_exports));
  const { SessionManager: SessionManager2 } = await Promise.resolve().then(() => (init_session_manager(), session_manager_exports));
  const { buildApp: buildApp2, makeRunnerDbHelpers: makeRunnerDbHelpers2 } = await Promise.resolve().then(() => (init_app(), app_exports));
  const bus = new SessionBus2((event, sequence) => {
    db.prepare("INSERT INTO session_events (session_id, sequence, type, payload_json) VALUES (?, ?, ?, ?)").run(
      event.sessionId,
      sequence,
      event.type,
      JSON.stringify(event)
    );
  });
  const helpers = makeRunnerDbHelpers2(db);
  const runner = new SessionRunner2({
    bus,
    recordUsage: (u) => helpers.recordUsage(u),
    insertMessage: helpers.insertMessage,
    loadCouncil: helpers.loadCouncil,
    loadModelForChat: helpers.loadModelForChat,
    updateSessionStatus: helpers.updateSessionStatus
  });
  const sessions = new SessionManager2(bus, runner);
  const app = await buildApp2({ config, db, bus, sessions });
  let uiReady = false;
  if (existsSync(webOutDir)) {
    const staticHandler = (await import("@fastify/static")).default;
    await app.register(staticHandler, {
      root: webOutDir,
      prefix: "/",
      wildcard: false,
      index: "index.html"
    });
    app.setNotFoundHandler((req, reply) => {
      if (req.url.startsWith("/api/") || req.url === "/api") {
        reply.status(404).send({ error: { code: "not_found", message: "no such API route" } });
        return;
      }
      const urlPath = decodeURIComponent(req.url.split("?")[0]);
      if (!urlPath.endsWith("/")) {
        reply.redirect(301, `${urlPath}/`);
        return;
      }
      const candidate = path4.join(webOutDir, urlPath, "index.html");
      if (existsSync(candidate) && !path4.relative(webOutDir, candidate).startsWith("..")) {
        reply.type("text/html; charset=utf-8").send(createReadStream(candidate));
      } else {
        const fallback = path4.join(webOutDir, "404.html");
        if (existsSync(fallback)) {
          reply.status(404).type("text/html; charset=utf-8").send(createReadStream(fallback));
        } else {
          reply.status(404).send({ error: { code: "not_found", message: "no such route" } });
        }
      }
    });
    uiReady = true;
  } else {
    console.warn(
      `[opencouncil] UI not found at ${webOutDir}. Build it with \`npm run build\`. API remains served.`
    );
    app.setNotFoundHandler((_req, reply) => {
      reply.status(404).send({ error: { code: "not_found", message: "no such route" } });
    });
  }
  await app.listen({ host: config.host, port: config.port });
  console.log(`[opencouncil] API  \u2192 http://${config.host}:${config.port}/api/v1`);
  if (uiReady) console.log(`[opencouncil] UI   \u2192 http://${config.host}:${config.port}`);
}
main().catch((err) => {
  console.error("[opencouncil] fatal:", err);
  process.exit(1);
});
export {
  main,
  parseArgs
};
