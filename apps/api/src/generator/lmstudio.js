/**
 * Client for any OpenAI-compatible local server — LM Studio by default.
 *
 * LM Studio's "Developer" server answers on http://127.0.0.1:1234 with
 *   GET  /v1/models            which models the server can see
 *   POST /v1/chat/completions  the actual inference
 *   GET  /api/v0/models        LM Studio only: adds `state` and `max_context_length`
 *
 * so one client covers LM Studio, llama.cpp's server, vLLM, Jan, and anything
 * else that speaks the OpenAI shape. `baseUrl` is the *config* value
 * (…/v1); requests are made against `origin` so the non-OpenAI paths can be
 * reached too. Nothing here needs a dependency: fetch, URL and AbortController.
 */

const { config } = require('../config');
const { extractJsonBody } = require('./json-repair');

/** Embeddings and VLM-only entries are never what we want to generate a spec with. */
const NOT_A_CHAT_MODEL = /embed|bge|minilm|nomic|all-minilm|clip|whisper|rerank|bert/i;

/**
 * Accepts `http://host:1234`, `http://host:1234/v1`, or a pasted
 * `/v1/chat/completions`, and normalises to an `origin` plus a versioned base.
 */
function normalizeServerUrl(raw, fallbackPort = 1234) {
  let value = String(raw || `http://127.0.0.1:${fallbackPort}`).trim().replace(/\/+$/, '');
  value = value.replace(/\/v1\/(chat\/completions|completions|models)$/i, '').replace(/\/v1$/i, '');
  // "localhost:1234" from a clipboard parses as a *scheme* called localhost:,
  // so anything without an explicit // gets http:// put in front of it first.
  if (!/^[a-zA-Z][a-zA-Z0-9+.-]*:\/\//.test(value)) value = `http://${value}`;
  let url;
  try {
    url = new URL(value);
  } catch {
    const error = new Error(`"${raw}" is not a URL — expected something like http://127.0.0.1:1234/v1`);
    error.code = 'BAD_BASE_URL';
    throw error;
  }
  if (!/^https?:$/.test(url.protocol)) {
    const error = new Error(`"${raw}" must start with http:// or https://`);
    error.code = 'BAD_BASE_URL';
    throw error;
  }
  const origin = `${url.protocol}//${url.host}`;
  const apiRoot = `${origin}${url.pathname.replace(/\/+$/, '')}`;
  return { origin, apiRoot, baseUrl: `${apiRoot}/v1` };
}

class LmStudioClient {
  constructor(options = {}) {
    const urls = normalizeServerUrl(options.baseUrl || config.ai.lmstudio.baseUrl, options.port || 1234);
    this.label = options.label || config.ai.lmstudio.label;
    this.origin = urls.origin;
    this.apiRoot = urls.apiRoot;
    this.baseUrl = urls.baseUrl;
    this.apiKey = options.apiKey || config.ai.lmstudio.apiKey;
    // Which variable to point at when the server wants a key, for error text.
    this.keyEnv = options.keyEnv || 'LMSTUDIO_API_KEY';
    this.timeoutMs = options.timeoutMs || config.ai.lmstudio.timeoutMs;
    this.maxTokens = options.maxTokens || config.ai.lmstudio.maxTokens;
    this.temperature = options.temperature ?? config.ai.lmstudio.temperature;
    // Asking for response_format is a grammar constraint; some GGUF builds answer
    // 400 on it, so it is opt-in (LAUNCHPAD_LM_JSON_MODE=1) rather than default.
    this.jsonMode = options.jsonMode ?? config.ai.lmstudio.jsonMode;
    this._model = options.model || config.ai.lmstudio.model || null;
    this._models = null;
    this._info = null;
    this._authNeeded = false;
  }

  headers(extra = {}) {
    const headers = { 'content-type': 'application/json', ...extra };
    // LM Studio ignores this unless you tick "require API key"; hosted servers
    // usually refuse the request without it.
    if (this.apiKey) headers.authorization = `Bearer ${this.apiKey}`;
    return headers;
  }

  async request(path, body, { timeoutMs, method } = {}) {
    const controller = new AbortController();
    const ms = timeoutMs || this.timeoutMs;
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(`${this.origin}${path}`, {
        method: body ? 'POST' : method || 'GET',
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      const text = await res.text();
      if (res.status === 401 || res.status === 403) {
        this._authNeeded = true;
        const error = new Error(
          `${this.label} refused the request (${res.status}) — it is asking for an API key. Set ${this.keyEnv} to the value the server is configured with.`,
        );
        error.status = res.status;
        throw error;
      }
      if (!res.ok) {
        const hint = res.status === 404 ? ' (404 from this server usually means no model is loaded yet)' : '';
        const error = new Error(`${this.label} ${res.status} on ${path}${hint}: ${text.slice(0, 200)}`);
        error.status = res.status;
        throw error;
      }
      if (!text) return {};
      try {
        return JSON.parse(text);
      } catch {
        const error = new Error(`${this.label} answered ${path} with something that is not JSON: ${text.slice(0, 120)}`);
        error.notJson = true;
        throw error;
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        const wrapped = new Error(`${this.label} did not answer ${path} within ${ms}ms — a big local model can need more time (LAUNCHPAD_LM_TIMEOUT_MS)`);
        wrapped.timeout = true;
        throw wrapped;
      }
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }

  /** Nothing answered at all, as opposed to something answering badly. */
  static isDown(error) {
    return /ECONNREFUSED|ENOTFOUND|ECONNRESET|EHOSTUNREACH|EAI_AGAIN|ERR_INVALID_URL|fetch failed|did not answer|is not a URL|must start with/i.test(
      `${error && error.message} ${error && error.cause && error.cause.code}`,
    );
  }

  /** The models list is the cheap liveness probe, and it works on every server. */
  async probe({ timeoutMs = 4000 } = {}) {
    try {
      await this.request('/v1/models', null, { timeoutMs });
      return { reachable: true, authNeeded: false };
    } catch (error) {
      // A 401/403 or a chatty proxy means a server is there and merely needs
      // fixing, which is a different message from "nothing is listening".
      return { reachable: !LmStudioClient.isDown(error), authNeeded: this._authNeeded, error };
    }
  }

  async ping() {
    return (await this.probe()).reachable;
  }

  /**
   * `GET /v1/models` for the ids, then `GET /api/v0/models` for the LM Studio
   * extras (load state, context ceiling). Both are cached for the process.
   */
  async listModels() {
    if (this._models) return this._models;
    const data = await this.request('/v1/models', null, { timeoutMs: 6000 });
    const rows = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
    const extras = await this.request('/api/v0/models', null, { timeoutMs: 4000 }).catch(() => null);
    const byId = new Map(((extras && extras.data) || []).map((m) => [m.id, m]));
    this._models = rows
      .map((row) => {
        const id = row.id || row.name;
        const extra = byId.get(id) || {};
        return {
          name: id,
          // Some builds list a file name here and the short id in `id`.
          aliases: [id, row.owned_by, extra.published_name].filter(Boolean),
          state: extra.state || null,
          type: extra.type || null,
          maxContextLength: extra.max_context_length || null,
          quantization: extra.quantization || null,
        };
      })
      .filter((m) => m.name);
    return this._models;
  }

  /**
   * Honour an explicit model, otherwise take the one LM Studio already has
   * loaded — a chat model that is *not* loaded still has to be dragged into
   * memory, and a 30B model on a laptop is not something to do by accident.
   */
  async chooseModel() {
    if (this._model) return { model: this._model, explicit: true, note: 'set in the environment' };
    const models = await this.listModels().catch(() => []);
    const chat = models.filter((m) => !NOT_A_CHAT_MODEL.test(m.name) && m.type !== 'embeddings');
    if (!chat.length) {
      throw new Error(
        `${this.label} at ${this.origin} has no chat model to answer with — load one in LM Studio (a 7B–14B instruct model is the sweet spot) and start the server.`,
      );
    }
    const loaded = chat.filter((m) => m.state === 'loaded' || m.state === 'loading');
    const pool = loaded.length ? loaded : chat;
    const scored = pool
      .map((m) => {
        let score = m.state === 'loaded' ? 20 : 0;
        if (/(qwen|llama|deepseek|mistral|gemma)[\w.-]*(instruct|chat)/i.test(m.name)) score += 6;
        if (/(instruct|chat|it)\b/i.test(m.name)) score += 3;
        if (/\b\d+b\b/i.test(m.name)) score += Math.min(5, Number(m.name.match(/(\d+(?:\.\d+)?)b/i)?.[1] || 0));
        return { ...m, score };
      })
      .sort((a, b) => b.score - a.score);
    const best = scored[0];
    return {
      model: best.name,
      note: best.state && best.state !== 'loaded' ? `${this.label} will load ${best.name} on first use` : undefined,
      maxContextLength: best.maxContextLength || null,
      candidates: scored.slice(0, 6).map((m) => ({ name: m.name, state: m.state, score: m.score })),
    };
  }

  buildMessages(prompt, system) {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  /**
   * Same contract as OllamaClient.generate, so json-repair's retry loop and the
   * generator service do not care which one they are holding.
   */
  async generate({ model, prompt, system, raw = false, options = {}, timeoutMs, maxTokens } = {}) {
    const pick = model ? { model } : await this.chooseModel();
    const chosen = pick.model;
    const messages = this.buildMessages(prompt, system);
    const payload = {
      model: chosen,
      messages,
      temperature: options.temperature ?? this.temperature,
      // -1 means "up to the context window" in LM Studio; a real number keeps a
      // runaway model from holding the page hostage.
      max_tokens: maxTokens || options.max_tokens || options.num_predict || this.maxTokens,
      stream: false,
      top_p: options.top_p ?? 0.9,
    };
    if (options.stop) payload.stop = options.stop;
    if (!raw && this.jsonMode) payload.response_format = { type: 'json_object' };
    for (const key of ['presence_penalty', 'frequency_penalty', 'seed']) {
      if (options[key] !== undefined) payload[key] = options[key];
    }

    // Respect the model's context ceiling instead of collecting a 422: prompt
    // length is estimated at ~4 characters per token, which is conservative
    // enough for English prose and JSON keys. A pinned LMSTUDIO_MODEL has to be
    // looked up in the listing to get its ceiling, since it skipped choosing.
    let ceiling = pick.maxContextLength || null;
    if (!ceiling) {
      const known = (await this.listModels().catch(() => [])).find(
        (m) => m.name === chosen || (m.aliases || []).includes(chosen),
      );
      ceiling = (known && known.maxContextLength) || null;
    }
    if (ceiling) {
      const budget = ceiling - Math.ceil(prompt.length / 4) - 64;
      if (budget < 256) {
        const error = new Error(`${chosen} only has a ${ceiling}-token context and this prompt needs about ${Math.ceil(prompt.length / 4)} tokens of it — raise the context length in LM Studio or pick a bigger model.`);
        error.code = 'CONTEXT_TOO_SMALL';
        throw error;
      }
      if (payload.max_tokens > budget) payload.max_tokens = budget;
    }

    const data = await this.request('/v1/chat/completions', payload, { timeoutMs });
    const choice = (data.choices && data.choices[0]) || {};
    const message = choice.message || {};
    let text = message.content;
    // Reasoning models (Qwen3 thinking, DeepSeek-R1, …) answer in
    // `reasoning_content` and leave `content` empty on servers that do not
    // split the two. The spec is still in there — pull the JSON out of it.
    if ((!text || !String(text).trim()) && message.reasoning_content) {
      text = extractJsonBody(message.reasoning_content) || message.reasoning_content;
    }
    return {
      response: text == null ? '' : String(text),
      model: data.model || chosen,
      done: choice.finish_reason !== 'length',
      finishReason: choice.finish_reason || null,
      usage: {
        completionTokens: data.usage && data.usage.completion_tokens,
        promptTokens: data.usage && data.usage.prompt_tokens,
        tokensPerSecond: data.stats && data.stats.tokens_per_second ? Math.round(data.stats.tokens_per_second) : undefined,
      },
    };
  }
}

let lmStudioSingleton = null;
let llmSingleton = null;

/** The LM Studio server on this machine. */
function getLmStudioClient() {
  if (!lmStudioSingleton) lmStudioSingleton = new LmStudioClient();
  return lmStudioSingleton;
}

/**
 * A second, generic OpenAI-compatible endpoint, used when you point at
 * something that is not LM Studio (a llama.cpp server, vLLM, a LAN box).
 * Only consulted when LAUNCHPAD_LLM_BASE_URL is set.
 */
function getOpenAiCompatibleClient() {
  const base = config.ai.llm.baseUrl;
  if (!base) return null;
  if (llmSingleton && llmSingleton._baseUrl === base) return llmSingleton;
  llmSingleton = new LmStudioClient({
    baseUrl: base,
    label: 'the model server',
    model: config.ai.llm.model,
    apiKey: config.ai.llm.apiKey,
    keyEnv: 'LAUNCHPAD_LLM_API_KEY',
  });
  llmSingleton._baseUrl = base;
  return llmSingleton;
}

module.exports = { LmStudioClient, getLmStudioClient, getOpenAiCompatibleClient, normalizeServerUrl, NOT_A_CHAT_MODEL };
