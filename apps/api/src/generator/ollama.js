/**
 * Ollama client — the local model that does Launchpad's generation and
 * natural-language editing. No paid API: everything runs against a local
 * Ollama daemon (default http://127.0.0.1:11434).
 *
 * Model preference follows the product spec: bigger instruction-tuned models
 * adhere to JSON far better than small ones, so we prefer qwen2.5:14b and
 * llama3.1:8b-instruct over anything smaller, and warn when only a tiny model
 * is installed.
 */

const { config } = require('../config');

const PREFERRED = [
  { match: /^qwen2\.5:14b/, score: 100, note: 'recommended for structured output' },
  { match: /^qwen2\.5:32b/, score: 105, note: 'large, slow on small machines' },
  { match: /^qwen3:14b/, score: 98 },
  { match: /^llama3\.1:8b-instruct/, score: 90, note: 'good balance for local JSON' },
  { match: /^llama3\.1:70b/, score: 95, note: 'very slow without a GPU' },
  { match: /^llama3\.1:8b/, score: 84 },
  { match: /^qwen2\.5:7b/, score: 78 },
  { match: /^mistral:7b/, score: 70 },
  { match: /^phi3\.5:3\.8b/, score: 60 },
  { match: /^qwen2\.5:3b/, score: 40, note: 'small — expect JSON repairs' },
  { match: /^llama3\.2:3b/, score: 38, note: 'small — expect JSON repairs' },
  { match: /^qwen2\.5:1\.5b/, score: 22, note: 'too small for reliable JSON' },
  { match: /^llama3\.2:1b/, score: 12, note: 'too small for reliable JSON' },
];

class OllamaClient {
  constructor(options = {}) {
    this.baseUrl = (options.baseUrl || config.ai.ollamaUrl).replace(/\/$/, '');
    // The resolver and the UI label servers by these two, so every client has
    // to answer with them — Ollama included.
    this.label = options.label || 'Ollama';
    this.origin = this.baseUrl;
    this.timeoutMs = options.timeoutMs || config.ai.timeoutMs;
    this.keepAlive = options.keepAlive || config.ai.keepAlive;
    this._model = options.model || config.ai.model || null;
    this._available = null;
    this._models = null;
  }

  async request(path, body, { timeoutMs } = {}) {
    const controller = new AbortController();
    const ms = timeoutMs || this.timeoutMs;
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(`${this.baseUrl}${path}`, {
        method: body ? 'POST' : 'GET',
        headers: { 'content-type': 'application/json' },
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      if (!res.ok) {
        const error = new Error(`Ollama ${res.status} on ${path}: ${text.slice(0, 200)}`);
        error.status = res.status;
        throw error;
      }
      return text ? JSON.parse(text) : {};
    } catch (error) {
      if (error.name === 'AbortError') {
        const wrapped = new Error(`Ollama request to ${path} timed out after ${ms}ms`);
        wrapped.timeout = true;
        throw wrapped;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Same contract as the OpenAI-compatible client's probe: the provider resolver
   * asks every candidate this question, so Ollama has to answer it too. (When it
   * only had ping(), /api/health reported "client.probe is not a function" as the
   * reason generation was falling back.)
   */
  async probe({ timeoutMs = 4000 } = {}) {
    try {
      await this.request('/api/tags', null, { timeoutMs });
      this._available = true;
      return { reachable: true, authNeeded: false };
    } catch (error) {
      this._available = false;
      return { reachable: !LmStudioClient.isDown(error), authNeeded: false, error };
    }
  }

  async ping() {
    return (await this.probe()).reachable;
  }

  async listModels() {
    if (this._models) return this._models;
    const data = await this.request('/api/tags');
    this._models = (data.models || []).map((m) => ({
      name: m.name,
      size: m.size,
      family: m.details && m.details.family,
      parameterSize: m.details && m.details.parameter_size,
      quantization: m.details && m.details.quantization,
      modifiedAt: m.modified_at,
    }));
    return this._models;
  }

  /** Picks the best installed model, honouring OLLAMA_MODEL when set. */
  async chooseModel() {
    if (this._model) return { model: this._model, explicit: true, note: 'set via OLLAMA_MODEL' };
    const models = await this.listModels().catch(() => []);
    if (!models.length) throw new Error('No models installed for Ollama (run: ollama pull qwen2.5:14b)');
    const scored = models
      .map((m) => {
        const pref = PREFERRED.find((p) => p.match.test(m.name));
        return { ...m, score: pref ? pref.score : 50, note: pref && pref.note };
      })
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    return { model: best.name, note: best.note, candidates: scored.slice(0, 6).map((m) => ({ name: m.name, score: m.score, note: m.note })) };
  }

  /** POST /api/generate with format:"json" so output is constrained, not asked for politely. */
  async generate({ model, prompt, format = 'json', system, raw = false, options = {}, timeoutMs } = {}) {
    const chosen = model || (await this.chooseModel()).model;
    const payload = {
      model: chosen,
      prompt,
      stream: false,
      format: raw ? undefined : format,
      keep_alive: this.keepAlive,
      options: {
        temperature: config.ai.temperature,
        num_predict: config.ai.numPredict,
        top_p: 0.9,
        repeat_penalty: 1.08,
        ...options,
      },
      ...(system ? { system } : {}),
    };
    const data = await this.request('/api/generate', payload, { timeoutMs });
    return {
      response: data.response || '',
      model: data.model || chosen,
      done: data.done !== false,
      usage: {
        evalCount: data.eval_count,
        promptCount: data.prompt_eval_count,
        durationMs: data.total_duration ? Math.round(data.total_duration / 1e6) : undefined,
        tokensPerSecond: data.eval_count && data.eval_duration ? Math.round(data.eval_count / (data.eval_duration / 1e9)) : undefined,
      },
    };
  }
}

const { LmStudioClient, getLmStudioClient, getOpenAiCompatibleClient } = require('./lmstudio');

/** Providers that mean "a model is doing this work", for pacing and labels. */
const MODEL_PROVIDERS = ['llm', 'lmstudio', 'ollama'];

let singleton = null;
function getOllamaClient() {
  if (!singleton) singleton = new OllamaClient();
  return singleton;
}

/**
 * Decide which model server does the work, in the order the user most likely
 * meant: an explicitly configured OpenAI-compatible endpoint, then LM Studio,
 * then Ollama. `LAUNCHPAD_AI_PROVIDER` pins one of them, and 'local' means the
 * built-in compiler answers for itself.
 *
 * Returns the client itself, because a chat-completions server and Ollama are
 * not interchangeable once you get past generate().
 */
async function resolveAiMode(override, options = {}) {
  // resolveAiMode(ollamaClient) is the old call shape; keep it working.
  if (override && typeof override === 'object') {
    options = override;
    override = null;
  }
  const provider = String(override || options.provider || config.ai.provider || 'auto').toLowerCase();
  const aliases = { openai: 'llm', openaiCompatible: 'llm', compatible: 'llm', vllm: 'llm', chat: 'lmstudio', compiler: 'local', offline: 'local' };
  const wanted = aliases[provider] || provider;

  if (wanted === 'local') {
    return { useModel: false, useOllama: false, provider: 'local', reason: 'LAUNCHPAD_AI_PROVIDER=local' };
  }
  const required = wanted !== 'auto';
  const order = required ? [wanted] : ['llm', 'lmstudio', 'ollama'];
  if (required && !MODEL_PROVIDERS.includes(wanted)) {
    const error = new Error(`LAUNCHPAD_AI_PROVIDER="${provider}" is not one of auto · lmstudio · llm · ollama · local`);
    error.code = 'BAD_PROVIDER';
    throw error;
  }

  const notes = [];
  for (const key of order) {
    const client =
      key === 'ollama'
        ? options.ollama || getOllamaClient()
        : key === 'lmstudio'
          ? options.lmstudio || getLmStudioClient()
          : options.llm || getOpenAiCompatibleClient();
    if (!client) {
      notes.push({ provider: key, reason: 'no base url configured (set LAUNCHPAD_LLM_BASE_URL)' });
      if (required) {
        const error = new Error(`LAUNCHPAD_AI_PROVIDER=${provider} needs LAUNCHPAD_LLM_BASE_URL pointing at an OpenAI-compatible server.`);
        error.code = 'NO_BASE_URL';
        throw error;
      }
      continue;
    }
    if (key === 'lmstudio' && !config.ai.lmstudio.enabled) {
      notes.push({ provider: key, reason: 'LAUNCHPAD_LMSTUDIO=off' });
      continue;
    }
    const probe = await client.probe();
    if (!probe.reachable) {
      const reason = probe.error ? probe.error.message : `${client.origin || client.baseUrl} is not answering`;
      notes.push({ provider: key, reason });
      if (required) {
        const error = new Error(`${client.label} is required (LAUNCHPAD_AI_PROVIDER=${provider}) but ${reason}`);
        error.code = 'MODEL_SERVER_REQUIRED';
        throw error;
      }
      continue;
    }
    let picked = {};
    try {
      picked = await client.chooseModel();
    } catch (error) {
      notes.push({ provider: key, reason: error.message });
      if (required) throw error;
      continue;
    }
    return {
      useModel: true,
      useOllama: key === 'ollama',
      provider: key,
      label: client.label || (key === 'ollama' ? 'Ollama' : client.origin),
      client,
      model: picked.model,
      modelNote: picked.note,
      candidates: picked.candidates,
      endpoint: client.origin || client.baseUrl,
      timeoutMs: client.timeoutMs,
      tried: notes,
    };
  }

  const reason = notes.length ? notes.map((n) => `${n.provider}: ${n.reason}`).join(' · ') : 'no model server is configured';
  return { useModel: false, useOllama: false, provider: 'local', reason, endpoint: null, tried: notes };
}

/**
 * `resolveAiMode` walks every candidate in order, and each probe waits up to
 * 4 seconds — that is fine on a laptop where a dead port refuses instantly and
 * ruinous behind a firewall that drops. `/api/health` is called on every page
 * load, so its answer is held briefly. Failures are not cached: the first
 * generation after LM Studio comes up should use it.
 */
let modeCache = null;
let modeCachedAt = 0;
let modeCacheKey = '';

async function resolveAiModeCached({ ttlMs = 15000, refresh = false, ...options } = {}) {
  const key = [config.ai.provider, config.ai.lmstudio.baseUrl, config.ai.ollamaUrl, config.ai.llm.baseUrl, config.ai.lmstudio.model].join('|');
  if (!refresh && modeCache && modeCacheKey === key && Date.now() - modeCachedAt < ttlMs) return modeCache;
  const mode = await resolveAiMode(options.provider, options);
  modeCache = mode;
  modeCachedAt = Date.now();
  modeCacheKey = key;
  return mode;
}

module.exports = { OllamaClient, getOllamaClient, resolveAiMode, resolveAiModeCached, MODEL_PROVIDERS, PREFERRED };
