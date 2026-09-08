const { config } = require('../config');
const { extractJsonBody } = require('./json-repair');
const { LmStudioClient } = require('./lmstudio');

/**
 * Gemini, through Google AI Studio's API key.
 *
 * Two wire formats in one client, because the format you can use depends on the
 * kind of key you have:
 *
 *   native  POST {base}/models/{model}:generateContent   x-goog-api-key: KEY
 *   openai  POST {base}/openai/chat/completions          Authorization: Bearer KEY
 *
 * Native is the default and the durable one. Google's key story changed under
 * this API's feet (docs/gemini-api/docs/api-key, read 2026-09-06): every new key
 * issued in AI Studio is now an *authorization* key (`AQ.…`), *unrestricted*
 * legacy `AIza…` keys are already refused, and from September 2026 the API
 * refuses standard keys outright. The compat layer is exactly where the new
 * keys have been reported to jam (400 "Multiple authentication credentials
 * received", or 401 invalid_api_key on a key that answers 200 natively) — so it
 * sends one credential and never both, and it is opt-in
 * (LAUNCHPAD_AI_PROVIDER=gemini-openai) rather than the default.
 *
 * The key is never sent to a browser and never echoed in an error: this file
 * scrubs it out of every message it can produce, the same rule behance.js and
 * lmstudio.js follow.
 */

const AUTH_KEY_HINT =
  'Create the key at https://aistudio.google.com/apikey and put it in GOOGLE_GEMINI_API_KEY (server-side only).';

/** Anything that looks like a credential, so it cannot leak through an upstream message. */
function scrub(text, secrets = []) {
  let out = String(text == null ? '' : text);
  for (const secret of secrets) {
    if (secret && secret.length >= 6) out = out.split(secret).join('***');
  }
  return out;
}

class GeminiClient {
  constructor(options = {}) {
    const settings = config.ai.gemini;
    this.mode = options.mode || settings.mode || 'native';
    this.compat = this.mode === 'openai';
    this.label = options.label || (this.compat ? 'Gemini (OpenAI-compatible)' : 'Gemini');
    this.keyEnv = options.keyEnv || 'GOOGLE_GEMINI_API_KEY';
    this.apiKey = options.apiKey ?? settings.apiKey;
    this.baseUrl = stripSlash(options.baseUrl || (this.compat ? settings.openaiBaseUrl : settings.baseUrl));
    // No `this.origin` on purpose: resolveAiMode reports `client.origin ||
    // client.baseUrl` as the endpoint, and for a hosted API the path is the part
    // worth seeing (…/v1beta vs …/v1beta/openai).
    this.timeoutMs = options.timeoutMs || settings.timeoutMs;
    this.maxTokens = options.maxTokens || settings.maxTokens;
    this.temperature = options.temperature ?? settings.temperature;
    // `application/json` as the response mime type is what makes a spec-shaped
    // answer likely; off if a model ever argues with it.
    this.jsonMode = options.jsonMode ?? settings.jsonMode;
    this._model = options.model || settings.model || null;
    this._models = null;
    this._authNeeded = false;
    this._answered = false;
  }

  /** A configured key is what makes this provider usable at all. */
  enabled() {
    if (!config.ai.gemini.enabled) return false;
    const mode = String(config.ai.provider || 'auto').toLowerCase();
    if (['off', 'local'].includes(mode)) return false;
    return Boolean(this.apiKey);
  }

  /**
   * A key with a non-ASCII character in it never reaches the network: fetch
   * refuses the header with "Cannot convert argument to a ByteString", which
   * reads like a broken transport and is really a paste that carried a … or a
   * smart quote (AI Studio shows keys masked with an ellipsis, so this happens
   * by accident). Say what it is, before anything else can mislead.
   */
  assertUsableKey() {
    const key = this.apiKey;
    if (!key) return;
    if (/[\u2026\u2018\u2019\u201c\u201d\u00a0]/.test(key)) {
      const error = new Error(`${this.keyEnv} looks like a partial paste (an ellipsis or curly quote made it into the value) — copy the whole key from https://aistudio.google.com/apikey.`);
      error.code = 'KEY_NOT_USABLE';
      throw error;
    }
    // eslint-disable-next-line no-control-regex
    if (/[\u0000-\u001f\u007f-\uffff]/.test(key)) {
      const error = new Error(`${this.keyEnv} contains characters that are not allowed in an HTTP header — retype it rather than paste it.`);
      error.code = 'KEY_NOT_USABLE';
      throw error;
    }
  }

  url(path) {
    this.assertUsableKey();
    return `${this.baseUrl}${path}`;
  }

  headers(extra = {}) {
    const headers = { 'content-type': 'application/json', ...extra };
    if (!this.apiKey) return headers;
    // One credential, always. Sending both x-goog-api-key and Authorization is
    // the "Multiple authentication credentials received" failure.
    if (this.compat) headers.authorization = `Bearer ${this.apiKey}`;
    else headers['x-goog-api-key'] = this.apiKey;
    return headers;
  }

  async request(path, body, { timeoutMs, method } = {}) {
    const controller = new AbortController();
    const ms = timeoutMs || this.timeoutMs;
    const timer = setTimeout(() => controller.abort(), ms);
    try {
      const res = await fetch(this.url(path), {
        method: body ? 'POST' : method || 'GET',
        headers: this.headers(),
        body: body ? JSON.stringify(body) : undefined,
        signal: controller.signal,
      });
      // Anything with a status line counts as an answer, including 403: "the host
      // is there and objecting" and "there is no host" are different fixes.
      this._answered = true;
      const text = await res.text();
      if (res.ok) {
        if (!text) return {};
        try {
          return JSON.parse(text);
        } catch {
          const error = new Error(scrub(`${this.label} answered ${path} with something that is not JSON: ${text.slice(0, 160)}`, [this.apiKey]));
          error.notJson = true;
          throw error;
        }
      }
      // Google's error bodies are useful (`"model not found"`, quota text), so
      // keep the message and take the credential out of it.
      const detail = scrub(extractGoogleError(text) || text.slice(0, 200), [this.apiKey]);
      const error = new Error(`${this.label} ${res.status} on ${path}: ${detail}`);
      error.status = res.status;
      if (res.status === 401 || res.status === 403) {
        this._authNeeded = true;
        error.code = 'KEY_REFUSED';
        error.message = `${this.label} refused the key (${res.status}) — ${detail}. ${keyAdvice(this.apiKey)} ${AUTH_KEY_HINT}`;
      } else if (res.status === 429 || /RESOURCE_EXHAUSTED|rate/i.test(detail)) {
        error.code = 'RATE_LIMITED';
        error.message = `${this.label} is rate limited (429) — ${detail.slice(0, 160)}. Live numbers for this project: https://aistudio.google.com/rate-limit. The generator will build with the local compiler instead of hammering the quota.`;
      } else if (res.status === 404) {
        error.code = 'NO_SUCH_MODEL';
        error.message = `${this.label} has no model at ${path} — ${detail}. Check GEMINI_MODEL against GET ${this.baseUrl}/models. ${AUTH_KEY_HINT}`;
      }
      throw error;
    } catch (cause) {
      if (cause.name === 'AbortError') {
        const wrapped = new Error(`${this.label} did not answer ${path} within ${ms}ms (LAUNCHPAD_GEMINI_TIMEOUT_MS)`);
        wrapped.timeout = true;
        throw wrapped;
      }
      if (!/GOOGLE_GEMINI_API_KEY|rate limited|no model at|not JSON/.test(cause.message || '')) {
        const wrapped = new Error(scrub(`${this.label} could not be reached: ${(cause && cause.message) || cause}`, [this.apiKey]));
        if (cause.code) wrapped.causeCode = cause.code;
        // Only re-wrap genuine transport failures; anything we already explained
        // keeps its message so the health route stays specific.
        if (LmStudioClient.isDown(cause)) throw wrapped;
      }
      throw cause;
    } finally {
      clearTimeout(timer);
    }
  }

  /**
   * Reachable means bytes came back from the host, whatever the status. It is
   * deliberately not "the error did not look like a connection failure": a key
   * that fetch refuses to even send produces an error with no code and no ECONN
   * in it, and calling that "reachable" is how a broken deploy looks healthy.
   */
  async probe({ timeoutMs = 5000 } = {}) {
    if (!this.apiKey) {
      const error = new Error(`no ${this.keyEnv} set — ${AUTH_KEY_HINT}`);
      error.code = 'NO_KEY';
      return { reachable: false, authNeeded: true, error };
    }
    this._answered = false;
    try {
      await this.listModels({ timeoutMs });
      return { reachable: true, authNeeded: false };
    } catch (error) {
      return { reachable: this._answered, authNeeded: this._authNeeded, error };
    }
  }

  async ping() {
    return (await this.probe()).reachable;
  }

  /**
   * The model list also answers "does this key work" for the health route.
   * Native returns `models/<id>` names; only the ones that can serve
   * generateContent are usable here — embeddings and image models are not.
   */
  async listModels({ timeoutMs = 8000 } = {}) {
    if (this._models) return this._models;
    if (this.compat) {
      const data = await this.request('/models', null, { timeoutMs });
      const rows = Array.isArray(data.data) ? data.data : Array.isArray(data.models) ? data.models : [];
      this._models = rows.map((row) => ({ name: row.id || row.name, label: row.name || row.id })).filter((m) => m.name);
      return this._models;
    }
    const data = await this.request('/models?pageSize=200', null, { timeoutMs });
    this._models = (Array.isArray(data.models) ? data.models : [])
      .map((row) => {
        const name = String(row.name || '').replace(/^models\//, '');
        const methods = row.supportedGenerationMethods || [];
        return {
          name,
          label: row.displayName || name,
          description: row.description || null,
          methods,
          inputTokenLimit: row.inputTokenLimit || null,
          outputTokenLimit: row.outputTokenLimit || null,
          usable: methods.includes('generateContent'),
        };
      })
      .filter((m) => m.name && m.usable);
    return this._models;
  }

  /**
   * `GEMINI_MODEL` wins. `auto`/`newest` means pick a flash model from the list:
   * flash is what the free tier can actually sustain (Pro is reported at ~50
   * requests/day there, against ~1,500 for flash), and a launch spec is one big
   * JSON answer, not a reasoning task.
   */
  async chooseModel() {
    if (this._model && !/^(auto|newest|latest)$/i.test(this._model)) {
      const known = await this.listModels().catch(() => []);
      const note = known.length && !known.some((m) => m.name === this._model) ? `${this._model} was not in the model list this key can see` : undefined;
      return { model: this._model, explicit: true, note };
    }
    const known = await this.listModels().catch(() => []);
    if (!known.length) {
      throw new Error(`${this.label} returned no usable models — set GEMINI_MODEL to a model id your key can see. ${AUTH_KEY_HINT}`);
    }
    const scored = known
      .map((m) => {
        let score = 0;
        if (/flash/i.test(m.name)) score += 40;
        if (/lite/i.test(m.name)) score -= 12;
        if (/pro/i.test(m.name)) score -= 6;
        if (/preview|exp|alpha/i.test(m.name)) score -= 20;
        const version = (m.name.match(/-(\d+)(?:[.-](\d+))?/) || []).slice(1).map(Number);
        if (version.length) score += version[0] * 10 + (version[1] || 0);
        return { ...m, score };
      })
      .sort((a, b) => b.score - a.score);
    return {
      model: scored[0].name,
      note: `chosen from ${known.length} models this key can see`,
      candidates: scored.slice(0, 6).map((m) => ({ name: m.name, score: m.score })),
      outputTokenLimit: scored[0].outputTokenLimit || null,
    };
  }

  buildMessages(prompt, system) {
    const messages = [];
    if (system) messages.push({ role: 'system', content: system });
    messages.push({ role: 'user', content: prompt });
    return messages;
  }

  payload(model, prompt, { system, json = true, options = {}, maxTokens } = {}) {
    const temperature = options.temperature ?? this.temperature;
    const tokens = maxTokens || options.max_tokens || options.num_predict || this.maxTokens;
    if (this.compat) {
      const body = {
        model,
        messages: this.buildMessages(prompt, system),
        temperature,
        max_tokens: tokens,
        stream: false,
      };
      // The compat layer has no responseMimeType; json_object is its version of
      // the same ask, and it is off unless you turn LAUNCHPAD_GEMINI_JSON_MODE on.
      if (json && this.jsonMode) body.response_format = { type: 'json_object' };
      if (options.stop) body.stop = options.stop;
      return body;
    }
    const generationConfig = { temperature, maxOutputTokens: tokens, topP: options.top_p ?? 0.95 };
    if (json && this.jsonMode) generationConfig.responseMimeType = 'application/json';
    if (options.stop) generationConfig.stopSequences = Array.isArray(options.stop) ? options.stop : [options.stop];
    const body = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig };
    if (system) body.systemInstruction = { parts: [{ text: system }] };
    return body;
  }

  /**
   * Same contract as OllamaClient/LmStudioClient.generate, so json-repair's
   * retry loop and the generator service do not care which one they are holding.
   */
  async generate({ model, prompt, system, format, options = {}, timeoutMs, maxTokens } = {}) {
    this.assertUsableKey();
    const pick = model ? { model } : await this.chooseModel();
    const chosen = pick.model;
    // format:'json' comes from generateWithRepair; raw:true means "prose please".
    const json = options.raw !== true && (format === undefined || format === 'json');
    const body = this.payload(chosen, prompt, { system, json, options, maxTokens });

    if (this.compat) {
      const data = await this.request('/chat/completions', body, { timeoutMs });
      const choice = (data.choices && data.choices[0]) || {};
      const message = choice.message || {};
      let text = message.content;
      if ((!text || !String(text).trim()) && message.reasoning_content) text = extractJsonBody(message.reasoning_content) || message.reasoning_content;
      return {
        response: text == null ? '' : String(text),
        model: data.model || chosen,
        done: choice.finish_reason !== 'length',
        finishReason: choice.finish_reason || null,
        usage: {
          completionTokens: data.usage && data.usage.completion_tokens,
          promptTokens: data.usage && data.usage.prompt_tokens,
        },
      };
    }

    const data = await this.request(`/models/${encodeURIComponent(chosen)}:generateContent`, body, { timeoutMs });
    const candidate = (Array.isArray(data.candidates) && data.candidates[0]) || null;
    if (!candidate) {
      const blocked = data.promptFeedback && data.promptFeedback.blockReason;
      const error = new Error(
        blocked
          ? `${this.label} refused the prompt (safety: ${blocked}) — rephrase the idea or switch the model with GEMINI_MODEL.`
          : `${this.label} returned no candidates for ${chosen}.`,
      );
      error.code = blocked ? 'BLOCKED' : 'NO_CANDIDATE';
      throw error;
    }
    // Thinking parts come back with thought:true and are not the answer.
    const parts = (candidate.content && candidate.content.parts) || [];
    const text = parts.filter((part) => !part.thought && typeof part.text === 'string').map((part) => part.text).join('');
    const truncated = candidate.finishReason === 'MAX_TOKENS';
    const usage = data.usageMetadata || {};
    if (!text.trim() && truncated) {
      const error = new Error(`${this.label} filled ${usage.candidatesTokenCount || this.maxTokens} output tokens without any text — raise LAUNCHPAD_GEMINI_MAX_TOKENS (now ${this.maxTokens}) or pick a shorter prompt.`);
      error.code = 'EMPTY_TRUNCATED';
      throw error;
    }
    return {
      response: text,
      model: chosen,
      // `done:false` tells the retry loop the answer was cut off mid-JSON.
      done: !truncated,
      finishReason: candidate.finishReason || null,
      usage: {
        completionTokens: usage.candidatesTokenCount ?? null,
        promptTokens: usage.promptTokenCount ?? null,
        thoughtsTokens: usage.thoughtsTokenCount ?? null,
      },
    };
  }
}

/** Google wraps errors in { error: { message, status } }; take the message out. */
function extractGoogleError(text) {
  try {
    const parsed = JSON.parse(text);
    const error = parsed && parsed.error;
    if (!error) return null;
    return [error.message, error.status].filter(Boolean).join(' ');
  } catch {
    return null;
  }
}

/**
 * The failure is nearly always the key format, and the two look alike in a .env
 * file. An AIza key that is *unrestricted* is refused by policy since the auth
 * key migration, and a GOCSPX- value is an OAuth client secret from a different
 * product entirely (that one belongs in GOOGLE_CLIENT_SECRET).
 */
function keyAdvice(key) {
  const value = String(key || '');
  if (!value) return 'No key is set.';
  if (/^GOCSPX-/i.test(value)) return 'That value is an OAuth client secret, not an API key — it belongs in GOOGLE_CLIENT_SECRET.';
  if (/^AIza/i.test(value)) return 'This looks like a legacy standard key: unrestricted ones are refused, and standard keys stop working from September 2026 — restrict it to the Generative Language API or create an auth key.';
  if (/^AQ/i.test(value)) return 'That is an auth key, so use the native endpoint (LAUNCHPAD_AI_PROVIDER=gemini).';
  return 'Check the key has access to the Generative Language API.';
}

function stripSlash(url) {
  return String(url || '').replace(/\/+$/, '');
}

let nativeSingleton = null;
let compatSingleton = null;

/** The default: Gemini's own generateContent endpoint. */
function getGeminiClient() {
  if (!nativeSingleton) nativeSingleton = new GeminiClient();
  return nativeSingleton;
}

/** The opt-in fallback for a legacy key that only works through the shim. */
function getGeminiOpenAiClient() {
  if (!compatSingleton) compatSingleton = new GeminiClient({ mode: 'openai' });
  return compatSingleton;
}

module.exports = { GeminiClient, getGeminiClient, getGeminiOpenAiClient, scrub };
