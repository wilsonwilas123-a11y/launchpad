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

  async ping() {
    try {
      await this.request('/api/tags', null, { timeoutMs: 4000 });
      this._available = true;
      return true;
    } catch {
      this._available = false;
      return false;
    }
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

let singleton = null;
function getOllamaClient() {
  if (!singleton) singleton = new OllamaClient();
  return singleton;
}

/** Whether the AI layer should call Ollama at all. */
async function resolveAiMode(client = getOllamaClient()) {
  const provider = config.ai.provider;
  if (provider === 'local' || provider === 'offline') return { useOllama: false, provider, reason: 'LAUNCHPAD_AI_PROVIDER=local' };
  const reachable = await client.ping();
  if (!reachable) {
    if (provider === 'ollama') {
      const error = new Error(`Ollama is required (LAUNCHPAD_AI_PROVIDER=ollama) but ${client.baseUrl} is not responding.`);
      error.code = 'OLLAMA_REQUIRED';
      throw error;
    }
    return { useOllama: false, provider: 'local', reason: `Ollama not reachable at ${client.baseUrl}` };
  }
  let modelInfo = {};
  try {
    modelInfo = await client.chooseModel();
  } catch (error) {
    if (provider === 'ollama') throw error;
    return { useOllama: false, provider: 'local', reason: error.message };
  }
  return { useOllama: true, provider: 'ollama', model: modelInfo.model, modelNote: modelInfo.note, candidates: modelInfo.candidates };
}

module.exports = { OllamaClient, getOllamaClient, resolveAiMode, PREFERRED };
