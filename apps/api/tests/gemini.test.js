const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { GeminiClient, getGeminiClient, getGeminiOpenAiClient, scrub } = require('../src/generator/gemini');
const { resolveAiMode } = require('../src/generator/ollama');
const { generateWithRepair } = require('../src/generator/json-repair');
const { config } = require('../src/config');

/**
 * Gemini through Google AI Studio's API key, tested against a local stand-in for
 * generativelanguage.googleapis.com. Nothing here reaches Google: what is being
 * pinned is the bytes on the wire (which credential header, which URL, which
 * generationConfig) and the messages that come back, because the failure modes
 * of this provider are all authentication-shaped — key format, key
 * restrictions, quota — and an unhelpful error there costs someone an evening.
 *
 * The key rules: exactly one credential header per request (sending both is the
 * documented "Multiple authentication credentials received" failure), the key
 * never in a URL, never in an error message, never to the browser.
 */
const KEY = 'AQ.Ab-C1234567890_long_enough_to_be_scrubbed';

function startStub(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', async () => {
      const body = raw ? JSON.parse(raw) : null;
      seen.push({ url: req.url, method: req.method, headers: req.headers, body });
      const reply = (await handler(req.url, body, seen.length - 1)) || {};
      if (reply.sleep) await new Promise((done) => setTimeout(done, reply.sleep));
      // A handler may return the payload itself, or { status, body } when it
      // needs to answer badly. Both are common enough to be worth supporting.
      const envelope = reply.body !== undefined || reply.status || reply.json !== undefined;
      const payload = envelope ? (reply.body === undefined ? {} : reply.body) : reply;
      res.writeHead(reply.status || 200, { 'content-type': reply.json === false ? 'text/plain' : 'application/json' });
      res.end(typeof payload === 'string' ? payload : JSON.stringify(payload));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      resolve({
        origin: `http://127.0.0.1:${port}`,
        baseUrl: `http://127.0.0.1:${port}/v1beta`,
        openaiBaseUrl: `http://127.0.0.1:${port}/v1beta/openai`,
        seen,
        close: () => new Promise((done) => server.close(done)),
      });
    });
  });
}

const MODELS = {
  models: [
    { name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent', 'countTokens'], inputTokenLimit: 1048576, outputTokenLimit: 65536 },
    { name: 'models/gemini-3.8-flash', displayName: 'Gemini 3.8 Flash', supportedGenerationMethods: ['generateContent'], outputTokenLimit: 65536 },
    { name: 'models/gemini-2.5-pro', displayName: 'Gemini 2.5 Pro', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-2.5-flash-lite-preview', displayName: 'Lite', supportedGenerationMethods: ['generateContent'] },
    { name: 'models/gemini-embedding-2', displayName: 'Embeddings', supportedGenerationMethods: ['embedContent'] },
  ],
};

const ANSWER = (spec) => ({
  candidates: [{ content: { parts: [{ text: 'preamble' }, { text: JSON.stringify(spec) }], role: 'model' }, finishReason: 'STOP' }],
  usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 640 },
});

const clientFor = (stub, options = {}) => new GeminiClient({ apiKey: KEY, baseUrl: stub.baseUrl, timeoutMs: 4000, ...options });

test('the endpoint and the key name come from the environment, not from a Google SDK convention', () => {
  assert.equal(config.ai.gemini.apiKey, '', 'unset by default, so an install without a key never calls out');
  assert.equal(config.ai.gemini.model, 'gemini-2.5-flash', 'the free tier can sustain flash, and a spec is one big JSON answer');
  assert.match(config.ai.gemini.baseUrl, /^https:\/\/generativelanguage\.googleapis\.com\/v1beta$/, 'native, v1beta, no trailing slash');
  assert.match(config.ai.gemini.openaiBaseUrl, /\/v1beta\/openai$/, 'the shim is a separate, opt-in base url');
  assert.equal(config.ai.gemini.jsonMode, true, 'responseMimeType is on unless someone turns it off');
  assert.equal(config.ai.gemini.enabled, true);
  assert.equal(typeof getGeminiClient().label, 'string');
  assert.notEqual(getGeminiClient(), getGeminiOpenAiClient(), 'two singletons, two formats');
  assert.equal(getGeminiOpenAiClient().compat, true);
});

test('a native call carries one credential, in a header, and asks for JSON', async () => {
  const stub = await startStub((url) => (url.startsWith('/v1beta/models?') ? MODELS : ANSWER({ name: 'NOVA' })));
  try {
    const client = clientFor(stub);
    const out = await client.generate({ model: 'gemini-2.5-flash', prompt: 'a sneaker drop', system: 'JSON only', format: 'json' });
    assert.equal(out.response.includes('"name":"NOVA"'), true, 'both text parts are joined; the answer is the spec');
    assert.equal(out.done, true);
    assert.equal(out.finishReason, 'STOP');
    assert.deepEqual({ prompt: out.usage.promptTokens, completion: out.usage.completionTokens }, { prompt: 1200, completion: 640 }, 'the wizard paces on nothing else');

    const post = stub.seen.find((row) => row.method === 'POST');
    assert.equal(post.url, '/v1beta/models/gemini-2.5-flash:generateContent', 'the model goes in the path, as the REST docs have it');
    assert.equal(post.headers['x-goog-api-key'], KEY);
    assert.equal(post.headers.authorization, undefined, 'never both credentials: that is the 400 "Multiple authentication credentials" report');
    assert.ok(!post.url.includes(KEY) && !JSON.stringify(post.body).includes(KEY), 'the key is not in the URL or the body');
    assert.equal(post.body.generationConfig.responseMimeType, 'application/json');
    assert.equal(post.body.generationConfig.maxOutputTokens, 4000);
    assert.deepEqual(post.body.systemInstruction, { parts: [{ text: 'JSON only' }] }, 'the system line is Gemini-shaped, not an OpenAI message');
    assert.deepEqual(post.body.contents.map((c) => c.role), ['user']);
  } finally {
    await stub.close();
  }
});

test('LAUNCHPAD_GEMINI_JSON_MODE=off stops asking, and the compat format asks differently', async () => {
  const stub = await startStub((url, body, index) => {
    if (url.includes(':generateContent')) return ANSWER({ ok: 1 });
    if (url.endsWith('/chat/completions')) return { choices: [{ message: { content: '{"ok": 2}' }, finish_reason: 'stop' }] };
    return { models: [{ id: 'gemini-2.5-flash' }] };
  });
  try {
    const plain = await clientFor(stub, { jsonMode: false }).generate({ model: 'gemini-2.5-flash', prompt: 'x', format: 'json' });
    assert.ok(plain.response.includes(JSON.stringify({ ok: 1 })), 'the answer is still there, fences and all');
    assert.equal(stub.seen.find((r) => r.url.includes('generateContent')).body.generationConfig.responseMimeType, undefined, 'the mime type is gone when told to be');

    const compat = await clientFor(stub, { mode: 'openai', baseUrl: stub.openaiBaseUrl, jsonMode: true }).generate({ model: 'gemini-2.5-flash', prompt: 'y', system: 'JSON only', format: 'json' });
    assert.equal(compat.response, '{"ok": 2}');
    const post = stub.seen.find((r) => r.url.endsWith('/chat/completions'));
    assert.equal(post.headers.authorization, `Bearer ${KEY}`, 'the shim wants a bearer token');
    assert.equal(post.headers['x-goog-api-key'], undefined, 'and exactly one credential, the other way round');
    assert.deepEqual(post.body.response_format, { type: 'json_object' }, 'json_object is the shim equivalent of responseMimeType');
    assert.equal(post.body.messages[0].role, 'system', 'the shim is chat-completions, so system is a message');
  } finally {
    await stub.close();
  }
});

test('the model list keeps what can actually answer, and auto picks a flash', async () => {
  const stub = await startStub(() => MODELS);
  try {
    const client = clientFor(stub, { model: 'auto' });
    const models = await client.listModels();
    assert.deepEqual(models.map((m) => m.name), ['gemini-2.5-flash', 'gemini-3.8-flash', 'gemini-2.5-pro', 'gemini-2.5-flash-lite-preview'], 'models/ stripped, embeddings dropped');
    const picked = await client.chooseModel();
    assert.match(picked.model, /flash/, 'flash over pro and over lite');
    assert.equal(/preview/.test(picked.model), false, 'a -preview id is not a default');
    assert.equal(picked.candidates.length <= 6, true);
    assert.match(stub.seen[0].url, /^\/v1beta\/models\?pageSize=200$/);

    const named = await clientFor(stub, { model: 'gemini-2.5-flash' }).chooseModel();
    assert.deepEqual({ model: named.model, explicit: named.explicit, note: named.note }, { model: 'gemini-2.5-flash', explicit: true, note: undefined });

    const typo = await clientFor(stub, { model: 'gemini-9.9-ultra' }).chooseModel();
    assert.equal(typo.model, 'gemini-9.9-ultra', 'an explicit id is honoured, not silently swapped');
    assert.match(typo.note, /was not in the model list/, 'but the health route says so out loud');
  } finally {
    await stub.close();
  }
});

test('a refusal explains itself in terms of the key you actually pasted', async () => {
  const cases = [
    { key: 'AIzaSyLegacyKeyThatIsLongEnough', expect: /legacy standard key/, body: { error: { code: 403, message: 'permission denied on resource project', status: 'PERMISSION_DENIED' } } },
    { key: 'GOCSPX-oauth-client-secret-looking', expect: /OAuth client secret/, body: { error: { code: 401, message: 'API key not valid', status: 'UNAUTHENTICATED' } } },
    { key: KEY, expect: /auth key, so use the native endpoint/, body: { error: { code: 403, message: 'standard keys are no longer accepted', status: 'PERMISSION_DENIED' } } },
  ];
  for (const item of cases) {
    const stub = await startStub(() => ({ status: item.body.error.code, body: item.body }));
    try {
      const client = clientFor(stub, { apiKey: item.key });
      const error = await client.generate({ model: 'gemini-2.5-flash', prompt: 'x' }).catch((e) => e);
      assert.match(error.message, /refused the key/, 'one shape for 401 and 403');
      assert.match(error.message, item.expect);
      assert.match(error.message, /aistudio\.google\.com\/apikey/, 'and the way to fix it, not just what broke');
      assert.equal(error.code, 'KEY_REFUSED');
      assert.ok(!error.message.includes(item.key), 'the key itself never comes back in the message');
      assert.equal(await client.probe().then((p) => p.authNeeded), true, 'reachable-but-refused is reported as needing a key, not as down');
    } finally {
      await stub.close();
    }
  }
});

test('quota, truncation and a blocked prompt are three different answers', async () => {
  const rate = await startStub(() => ({ status: 429, body: { error: { code: 429, message: 'Resource has been exhausted (quota per minute)', status: 'RESOURCE_EXHAUSTED' } } }));
  try {
    const error = await clientFor(rate).generate({ model: 'gemini-2.5-flash', prompt: 'x' }).catch((e) => e);
    assert.equal(error.code, 'RATE_LIMITED');
    assert.match(error.message, /aistudio\.google\.com\/rate-limit/, 'the page that shows the real numbers for this project');
    assert.match(error.message, /local compiler instead of hammering/, 'and what the app is going to do about it');
  } finally {
    await rate.close();
  }

  const cut = await startStub(() => ({
    candidates: [{ content: { parts: [{ text: '{"name": "NOVA"' }] }, finishReason: 'MAX_TOKENS' }],
    usageMetadata: { candidatesTokenCount: 4000 },
  }));
  try {
    const out = await clientFor(cut).generate({ model: 'gemini-2.5-flash', prompt: 'x' });
    assert.equal(out.done, false, 'truncation is the repair loop\'s cue, not a silent short answer');
    assert.equal(out.finishReason, 'MAX_TOKENS');
  } finally {
    await cut.close();
  }

  const empty = await startStub(() => ({ candidates: [{ content: { parts: [] }, finishReason: 'MAX_TOKENS' }], usageMetadata: { candidatesTokenCount: 4000 } }));
  try {
    const error = await clientFor(empty).generate({ model: 'gemini-2.5-flash', prompt: 'x' }).catch((e) => e);
    assert.equal(error.code, 'EMPTY_TRUNCATED');
    assert.match(error.message, /LAUNCHPAD_GEMINI_MAX_TOKENS/);
  } finally {
    await empty.close();
  }

  const blocked = await startStub(() => ({ candidates: [], promptFeedback: { blockReason: 'SAFETY' } }));
  try {
    const error = await clientFor(blocked).generate({ model: 'gemini-2.5-flash', prompt: 'x' }).catch((e) => e);
    assert.equal(error.code, 'BLOCKED');
    assert.match(error.message, /safety: SAFETY/);
    assert.match(error.message, /GEMINI_MODEL/);
  } finally {
    await blocked.close();
  }

  const notFound = await startStub(() => ({ status: 404, body: { error: { code: 404, message: 'Model not found.', status: 'NOT_FOUND' } } }));
  try {
    const error = await clientFor(notFound).generate({ model: 'gemini-9-flash', prompt: 'x' }).catch((e) => 'threw');
    assert.equal(error, 'threw');
  } finally {
    await notFound.close();
  }
});

test('a model that answers with prose still ends up as a spec', async () => {
  const stub = await startStub((url) => {
    if (url.startsWith('/v1beta/models?')) return MODELS;
    return { candidates: [{ content: { parts: [{ text: `Here is the JSON you asked for:\n\`\`\`json\n${JSON.stringify({ name: 'SHIFT', sections: 4 })}\n\`\`\`` }] }, finishReason: 'STOP' }] };
  });
  try {
    const result = await generateWithRepair(clientFor(stub), 'gemini-2.5-flash', 'make a spec', 1, { system: 'JSON only' });
    assert.deepEqual(result.value, { name: 'SHIFT', sections: 4 }, 'json-repair strips the fence through the same client contract');
    assert.equal(result.attempts, 1);
  } finally {
    await stub.close();
  }
});

test('without a key, Gemini is skipped before anything is asked of the network', async () => {
  const stub = await startStub(() => MODELS);
  const provider = config.ai.provider;
  const apiKey = config.ai.gemini.apiKey;
  try {
    // auto: no request, a note saying why, and the answer says which provider
    // is left holding the work.
    config.ai.provider = 'auto';
    const keyless = clientFor(stub, { apiKey: '' });
    const mode = await resolveAiMode('auto', { gemini: keyless, llm: null, lmstudio: null, ollama: null });
    assert.equal(stub.seen.length, 0, 'not one call to Google — /api/health runs this on every page load');
    assert.equal(mode.useModel, false);
    assert.equal(mode.tried[0].provider, 'gemini', 'Gemini was reached first and declined on the key');
    assert.match(mode.tried[0].reason, /no GOOGLE_GEMINI_API_KEY set/);

    // demanded: fail with the variable to set, not with a 403 from Google.
    const error = await resolveAiMode('gemini', { gemini: keyless }).catch((e) => e);
    assert.equal(error.code, 'NO_KEY');
    assert.match(error.message, /GOOGLE_GEMINI_API_KEY/);
    assert.match(error.message, /aistudio\.google\.com\/apikey/);

    // LAUNCHPAD_GEMINI=off and a key present: still out, and it says which switch.
    config.ai.gemini.enabled = false;
    const off = await resolveAiMode('gemini', { gemini: clientFor(stub) }).catch((e) => e);
    assert.equal(off.code, 'PROVIDER_DISABLED');
    assert.match(off.message, /LAUNCHPAD_GEMINI=off/);
    assert.equal(stub.seen.length, 0);

    // an unknown name lists the ones that exist.
    config.ai.gemini.enabled = true;
    const bad = await resolveAiMode('gemini-native-ish', {}).catch((e) => e);
    assert.equal(bad.code, 'BAD_PROVIDER');
    assert.match(bad.message, /auto · gemini · gemini-openai · lmstudio · llm · ollama · local/);
    assert.equal(clientFor(stub, { apiKey: '' }).enabled(), false);
    assert.equal(getGeminiClient().label, 'Gemini');
  } finally {
    config.ai.provider = provider;
    config.ai.gemini.apiKey = apiKey;
    config.ai.gemini.enabled = true;
    await stub.close();
  }
});

test('a key that exists puts Gemini first, and reports where it is going', async () => {
  const stub = await startStub((url) => (url.startsWith('/v1beta/models?') ? MODELS : ANSWER({ name: 'NOVA' })));
  const provider = config.ai.provider;
  try {
    const client = clientFor(stub);
    config.ai.provider = 'auto';
    const mode = await resolveAiMode('auto', { gemini: client, llm: null, lmstudio: null, ollama: null });
    assert.equal(mode.useModel, true, 'with a key present, a model answers instead of the compiler');
    assert.equal(mode.provider, 'gemini');
    assert.equal(mode.label, 'Gemini', 'the header chip prints exactly this');
    assert.equal(mode.endpoint, stub.baseUrl, 'and it prints the base url, so a proxy is visible');
    assert.equal(mode.model, 'gemini-2.5-flash', 'the configured default, not a guess');
    assert.equal(mode.timeoutMs, 4000);
    assert.equal(config.ai.gemini.apiKey, '', 'the resolver never needed the real key to be in the environment for this');
  } finally {
    config.ai.provider = provider;
    await stub.close();
  }
});

test('reachable means an answer came back, not that the error looked familiar', async () => {
  // The failure this exists for: a key that fetch refuses to even put on the wire
  // produces an error with no code and no ECONN in it. "Did not look like a
  // connection problem" used to mean "healthy", which is how a broken deploy
  // ends up with a chip that says Gemini and a generation that never calls it.
  const refused = await startStub(() => ({ status: 403, body: { error: { code: 403, message: 'no permission', status: 'PERMISSION_DENIED' } } }));
  try {
    const probe = await clientFor(refused).probe();
    assert.equal(probe.reachable, true, 'a 403 is an answer — the host is there and objecting');
    assert.equal(probe.authNeeded, true);
    assert.equal(refused.seen.length, 1, 'and it really did ask');
  } finally {
    await refused.close();
  }

  const down = new GeminiClient({ apiKey: 'not-a-real-host', baseUrl: 'http://127.0.0.1:59998/v1beta', timeoutMs: 1500 });
  const nothing = await down.probe();
  assert.equal(nothing.reachable, false, 'nothing listening is unreachable, and that is the whole test');
  assert.match(nothing.error.message, /could not be reached/);

  // Same rule, without the key-validation shortcut: a baseUrl the fetch layer
  // cannot even parse throws a TypeError with no ECONN in it, so only
  // "did a status line come back" tells this apart from a healthy host.
  const unparsable = await new GeminiClient({ apiKey: KEY, baseUrl: 'http://[not-a-host/v1beta', timeoutMs: 1500 }).probe();
  assert.equal(unparsable.reachable, false, 'nothing ever answered, so it is not reachable');

  // A pasted-with-an-ellipsis key never reaches the network at all, so say that.
  const mangled = new GeminiClient({ apiKey: 'AIza\u2026something-not-ascii', baseUrl: 'http://127.0.0.1:59997/v1beta' });
  const before = mangled._answered;
  const mangledProbe = await mangled.probe();
  assert.equal(mangledProbe.reachable, false, 'a key fetch cannot send is not "reachable"');
  assert.equal(mangledProbe.error.code, 'KEY_NOT_USABLE');
  assert.match(mangledProbe.error.message, /partial paste/);
  assert.match(mangledProbe.error.message, /aistudio\.google\.com\/apikey/);
  assert.equal(mangled._answered, before, 'and not one byte left the process');
  const generateError = await mangled.generate({ model: 'gemini-2.5-flash', prompt: 'x' }).catch((e) => e);
  assert.equal(generateError.code, 'KEY_NOT_USABLE', 'generation refuses for the same reason, not a mystery ByteString error');
});

test('a timeout is reported as a timeout, and the scrubber is reusable', async () => {
  const slow = await startStub(async () => ({ sleep: 120 }));
  try {
    const error = await clientFor(slow, { timeoutMs: 30 }).generate({ model: 'gemini-2.5-flash', prompt: 'x' }).catch((e) => e);
    assert.equal(error.timeout, true, 'the service turns this into "timed out after Nms" and falls back');
    assert.match(error.message, /did not answer .* within 30ms/);
    assert.match(error.message, /LAUNCHPAD_GEMINI_TIMEOUT_MS/);
  } finally {
    await slow.close();
  }
  assert.equal(scrub(`key=${KEY} leaked`, [KEY]), 'key=*** leaked');
  assert.equal(scrub('nothing to see', [KEY]), 'nothing to see');
  assert.equal(scrub('short', ['sh']), 'short', 'a two-character secret is not scrubbed — too much collateral damage');
});
