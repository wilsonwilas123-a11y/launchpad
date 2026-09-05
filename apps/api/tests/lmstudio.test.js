const test = require('node:test');
const assert = require('node:assert/strict');
const http = require('node:http');

const { LmStudioClient, normalizeServerUrl } = require('../src/generator/lmstudio');
const { resolveAiMode, resolveAiModeCached } = require('../src/generator/ollama');
const { tryParse } = require('../src/generator/json-repair');
const { pacingFor } = require('../src/generator/stages');
const { GeneratorService } = require('../src/generator/generator.service');
const { compileSpec } = require('../src/generator/compile');

/**
 * A stand-in for LM Studio's local server. Everything here runs offline: the
 * point is the exact bytes we send and how we read the reply back.
 */
function startStub(handler) {
  const seen = [];
  const server = http.createServer((req, res) => {
    let raw = '';
    req.on('data', (chunk) => (raw += chunk));
    req.on('end', async () => {
      seen.push({ url: req.url, method: req.method, body: raw ? JSON.parse(raw) : null });
      const reply = await handler(req.url, raw ? JSON.parse(raw) : null, seen.length - 1);
      if (reply && reply.sleep) await new Promise((r) => setTimeout(r, reply.sleep));
      res.writeHead(reply && reply.status ? reply.status : 200, { 'content-type': 'application/json' });
      res.end(reply && reply.body !== undefined ? reply.body : JSON.stringify(reply || {}));
    });
  });
  return new Promise((resolve) => {
    server.listen(0, '127.0.0.1', () =>
      resolve({
        baseUrl: `http://127.0.0.1:${server.address().port}/v1`,
        seen,
        close: () => new Promise((done) => server.close(done)),
      }),
    );
  });
}

const MODELS = {
  object: 'list',
  data: [
    { id: 'qwen3-30b-a3b', object: 'model', owned_by: 'lmstudio' },
    { id: 'nomic-embed-text-v1.5', object: 'model', owned_by: 'nomic-ai' },
  ],
};
const V0_MODELS = {
  object: 'list',
  data: [
    { id: 'qwen3-30b-a3b', type: 'llm', state: 'loaded', max_context_length: 262144, quantization: 'Q4_K_M' },
    { id: 'llama-3.1-8b-instruct', type: 'llm', state: 'not-loaded', max_context_length: 131072 },
    { id: 'nomic-embed-text-v1.5', type: 'embeddings', state: 'not-loaded', max_context_length: 2048 },
  ],
};

/** The usual shape: models list, then a chat completion of fenced JSON. */
function standardStub(completions) {
  let calls = 0;
  return async (url, body) => {
    if (url === '/v1/models') return { body: JSON.stringify(MODELS) };
    if (url === '/api/v0/models') return { body: JSON.stringify(V0_MODELS) };
    if (url === '/v1/chat/completions') {
      // Extra calls repeat the last scripted reply, so a "model that never
      // produces JSON" test stays that way on every retry.
      const list = completions && completions.length ? completions : [{ content: '{"name":"stub"}' }];
      const next = list[Math.min(calls, list.length - 1)];
      calls += 1;
      if (next.status) return { status: next.status, body: JSON.stringify(next.error || {}) };
      return {
        body: JSON.stringify({
          choices: [{ message: { role: 'assistant', content: next.content, ...(next.reasoning_content ? { reasoning_content: next.reasoning_content } : {}) }, finish_reason: next.finish_reason || 'stop' }],
          usage: { prompt_tokens: 40, completion_tokens: 60 },
          stats: { tokens_per_second: 38.6 },
        }),
      };
    }
    return { status: 404, body: '{"error":"no route"}' };
  };
}

const clientFor = (baseUrl, options = {}) => new LmStudioClient({ baseUrl, ...options });

test('the base url is forgiving about how you paste it', () => {
  for (const raw of ['http://localhost:1234', 'http://localhost:1234/', 'http://localhost:1234/v1', 'http://localhost:1234/v1/chat/completions', 'localhost:1234']) {
    const urls = normalizeServerUrl(raw);
    assert.equal(urls.baseUrl, 'http://localhost:1234/v1', `${raw} → /v1, one slash`);
    assert.equal(urls.origin, 'http://localhost:1234');
  }
  assert.equal(normalizeServerUrl('http://box.local:8000/v1').origin, 'http://box.local:8000');
  assert.equal(normalizeServerUrl('http://box.local:8000/llama/v1').apiRoot, 'http://box.local:8000/llama', 'a server mounted under a path keeps it');
  assert.throws(() => normalizeServerUrl('not a url at all'), /not a URL/);
  assert.throws(() => normalizeServerUrl('ftp://host/models'), /http:\/\/ or https:\/\//);
});

test('LM Studio is found through /v1/models and enriched by /api/v0/models', async () => {
  const stub = await startStub(standardStub());
  try {
    const client = clientFor(stub.baseUrl);
    const probe = await client.probe();
    assert.equal(probe.reachable, true);
    assert.equal(probe.authNeeded, false);
    assert.equal((await client.ping()), true);

    const models = await client.listModels();
    assert.deepEqual(models.map((m) => m.name), ['qwen3-30b-a3b', 'nomic-embed-text-v1.5']);
    assert.equal(models[0].state, 'loaded', 'the load state comes from the LM Studio-only endpoint');
    assert.equal(models[0].maxContextLength, 262144);
    assert.deepEqual(
      stub.seen.map((r) => r.url),
      ['/v1/models', '/v1/models', '/v1/models', '/api/v0/models'],
      'probe, ping and one listing — /api/v0/models is asked once',
    );
    const requests = stub.seen.length;
    await client.listModels();
    await client.chooseModel();
    assert.equal(stub.seen.length, requests, 'the listing is cached, so the health endpoint stays cheap');

    const pick = await client.chooseModel();
    assert.equal(pick.model, 'qwen3-30b-a3b', 'the loaded chat model wins over an embedding model');
    assert.equal(pick.maxContextLength, 262144);
    assert.equal(pick.candidates[0].name, 'qwen3-30b-a3b');
  } finally {
    await stub.close();
  }
});

test('a model name you type is never second-guessed', async () => {
  const stub = await startStub(standardStub());
  try {
    const pick = await clientFor(stub.baseUrl, { model: 'my-fine-tune' }).chooseModel();
    assert.deepEqual(pick, { model: 'my-fine-tune', explicit: true, note: 'set in the environment' });
  } finally {
    await stub.close();
  }
});

test('a server with no chat model says what to go and do', async () => {
  const stub = await startStub(async (url) => {
    if (url === '/v1/models') return { body: JSON.stringify({ data: [] }) };
    if (url === '/api/v0/models') return { body: JSON.stringify({ data: [] }) };
    return { status: 404, body: '{}' };
  });
  try {
    await assert.rejects(() => clientFor(stub.baseUrl).chooseModel(), /no chat model.*load one in LM Studio/s);
  } finally {
    await stub.close();
  }
});

test('the chat payload is the OpenAI contract, with nothing exotic in it', async () => {
  const stub = await startStub(standardStub([{ content: '```json\n{"name":"NOVA"}\n```' }]));
  try {
    const client = clientFor(stub.baseUrl);
    const result = await client.generate({ prompt: 'build the spec', system: 'JSON only', format: 'json' });
    const sent = stub.seen.find((r) => r.url === '/v1/chat/completions').body;
    assert.equal(sent.model, 'qwen3-30b-a3b', 'the model id from /v1/models, so the server log is truthful');
    assert.deepEqual(sent.messages, [
      { role: 'system', content: 'JSON only' },
      { role: 'user', content: 'build the spec' },
    ]);
    assert.equal(sent.stream, false, 'a stream would need a parser we do not have');
    assert.equal(sent.max_tokens, 2600);
    assert.equal(typeof sent.temperature, 'number');
    assert.equal(sent.response_format, undefined, 'grammar constraints are opt-in: some GGUF builds answer 400');
    assert.deepEqual(await Promise.resolve(tryParse(result.response).value), { name: 'NOVA' }, 'markdown fences come off before parsing');
    assert.equal(result.usage.tokensPerSecond, 39, 'LM Studio reports tokens_per_second in stats');
    assert.equal(result.done, true);
  } finally {
    await stub.close();
  }
});

test('json mode is switched on, not guessed at', async () => {
  const stub = await startStub(standardStub([{ content: '{"name":"NOVA"}' }]));
  try {
    await clientFor(stub.baseUrl, { jsonMode: true }).generate({ prompt: 'p', format: 'json' });
    const sent = stub.seen.find((r) => r.url === '/v1/chat/completions').body;
    assert.deepEqual(sent.response_format, { type: 'json_object' });
  } finally {
    await stub.close();
  }
});

test('a reasoning model that answers in reasoning_content still gets read', async () => {
  const stub = await startStub(
    standardStub([{ content: '', reasoning_content: 'Let me think about this site. The answer is {"name":"From reasoning"} — done.' }]),
  );
  try {
    const result = await clientFor(stub.baseUrl).generate({ prompt: 'p' });
    assert.equal(tryParse(result.response).value.name, 'From reasoning');
  } finally {
    await stub.close();
  }
});

test('the context ceiling is respected instead of collecting a 422', async () => {
  const stub = await startStub(standardStub([{ content: '{"name":"NOVA"}' }]));
  try {
    const client = clientFor(stub.baseUrl, { maxTokens: 2600 });
    client._models = [{ name: 'small-llama', state: 'loaded', type: 'llm', maxContextLength: 4096, aliases: ['small-llama'] }];
    await client.generate({ model: 'small-llama', prompt: 'x'.repeat(12000) });
    const sent = stub.seen.find((r) => r.url === '/v1/chat/completions').body;
    assert.ok(sent.max_tokens > 0 && sent.max_tokens < 4096 - 3000, `asked for ${sent.max_tokens}, inside a 4096 window`);

    await assert.rejects(
      () => client.generate({ model: 'small-llama', prompt: 'x'.repeat(40000) }),
      /only has a 4096-token context|CONTEXT_TOO_SMALL/,
      'a prompt that cannot fit is said out loud, not truncated silently',
    );
  } finally {
    await stub.close();
  }
});

test('a server that wants a key tells you which variable to fill', async () => {
  const stub = await startStub(async () => ({ status: 401, body: '{"error":{"message":"unauthorized"}}' }));
  try {
    const client = clientFor(stub.baseUrl);
    const probe = await client.probe();
    assert.equal(probe.reachable, true, 'a 401 is a live server');
    assert.equal(probe.authNeeded, true);
    await assert.rejects(() => client.generate({ model: 'm', prompt: 'p' }), /LMSTUDIO_API_KEY/);

    const other = clientFor(stub.baseUrl, { apiKey: 'secret', label: 'the model server', keyEnv: 'LAUNCHPAD_LLM_API_KEY' });
    await assert.rejects(() => other.generate({ model: 'm', prompt: 'p' }), /LAUNCHPAD_LLM_API_KEY/);
    assert.equal(other.headers().authorization, 'Bearer secret', 'the key is sent once you give one');
  } finally {
    await stub.close();
  }
});

test('a 404 from the chat route points at the usual cause', async () => {
  const stub = await startStub(async (url) => {
    if (url === '/v1/models') return { body: JSON.stringify(MODELS) };
    if (url === '/api/v0/models') return { body: JSON.stringify(V0_MODELS) };
    return { status: 404, body: '{"error":"not found"}' };
  });
  try {
    await assert.rejects(() => clientFor(stub.baseUrl).generate({ model: 'qwen3-30b-a3b', prompt: 'p' }), /404.*no model is loaded/s);
  } finally {
    await stub.close();
  }
});

test('a model that is still thinking is cut off with a hint about the timeout knob', async () => {
  const stub = await startStub(async (url) => {
    if (url === '/v1/models') return { body: JSON.stringify(MODELS) };
    if (url === '/api/v0/models') return { body: JSON.stringify(V0_MODELS) };
    return { sleep: 400, body: '{"choices":[{"message":{"content":"{}"}}]}' };
  });
  try {
    await assert.rejects(
      () => clientFor(stub.baseUrl).generate({ model: 'qwen3-30b-a3b', prompt: 'p', timeoutMs: 40 }),
      (error) => error.timeout === true && /LAUNCHPAD_LM_TIMEOUT_MS/.test(error.message),
    );
  } finally {
    await stub.close();
  }
});

test('auto picks LM Studio when it answers, and says why when it does not', async () => {
  const stub = await startStub(standardStub());
  const dead = clientFor('http://127.0.0.1:59999/v1');
  try {
    const live = clientFor(stub.baseUrl);
    const up = await resolveAiMode('auto', { lmstudio: live, ollama: dead, llm: null });
    assert.equal(up.provider, 'lmstudio');
    assert.equal(up.useModel, true);
    assert.equal(up.useOllama, false, 'the service must not reach for the Ollama client');
    assert.equal(up.client, live);
    assert.equal(up.model, 'qwen3-30b-a3b');
    assert.equal(up.endpoint, live.origin);
    assert.match(up.tried[0].reason, /LAUNCHPAD_LLM_BASE_URL/, 'an unconfigured second server is reported, not hidden');

    const down = await resolveAiMode('auto', { lmstudio: dead, ollama: dead, llm: null });
    assert.equal(down.useModel, false, 'nothing answering is a normal state, not an error');
    assert.equal(down.provider, 'local');
    assert.match(down.reason, /lmstudio: /);

    await assert.rejects(() => resolveAiMode('lmstudio', { lmstudio: dead }), /LM Studio is required/);
    await assert.rejects(() => resolveAiMode('banana', {}), /not one of auto/);
    const local = await resolveAiMode('local', {});
    assert.equal(local.useModel, false);
    assert.match(local.reason, /LAUNCHPAD_AI_PROVIDER=local/);
  } finally {
    await stub.close();
  }
});

test('generation runs through LM Studio and lands in the spec', async () => {
  const baseline = compileSpec({ description: 'A streetwear drop site with a countdown', websiteType: 'product' });
  const written = { ...baseline, name: 'NOVA Drop 01', tagline: 'Written by the local model' };
  const stub = await startStub(standardStub([{ content: '```json\n' + JSON.stringify(written) + '\n```' }]));
  try {
    const service = new GeneratorService(Promise.resolve(null));
    service.clients = { lmstudio: clientFor(stub.baseUrl), ollama: clientFor('http://127.0.0.1:59999/v1'), llm: null };
    const out = await service.generate({ description: 'A streetwear drop site with a countdown', type: 'product' });

    assert.equal(out.provider, 'lmstudio');
    assert.equal(out.model, 'qwen3-30b-a3b');
    assert.equal(out.spec.name, 'NOVA Drop 01', 'the model copy is what the page gets');
    assert.equal(out.spec.meta.generatedBy, 'lmstudio:qwen3-30b-a3b');
    assert.equal(out.spec.meta.aiProvider, 'lmstudio');
    assert.equal(out.spec.meta.aiReport.attempts, 1, 'valid JSON needed no repair round');
    assert.equal(out.fallbackReason, null);
    assert.equal(out.pacing.provider, 'lmstudio');
    assert.ok(out.pacing.totalMs > 3000, 'a local inference model gets the slow pacing floor');
    assert.equal(out.ai.reachable, true);
    assert.ok(out.ai.models.includes('qwen3-30b-a3b'), 'the model list the builder shows came from the server');
    assert.equal(JSON.parse(JSON.stringify(out.ai)).client, undefined, 'the live client never leaks into the response');
  } finally {
    await stub.close();
  }
});

test('junk from the model falls back to the compiler, and names the model that said it', async () => {
  const stub = await startStub(standardStub([{ content: 'I cannot write JSON, sorry!' }, { content: 'still cannot' }, { content: 'nope' }]));
  try {
    const service = new GeneratorService(Promise.resolve(null));
    service.clients = { lmstudio: clientFor(stub.baseUrl), ollama: clientFor('http://127.0.0.1:59999/v1'), llm: null };
    const out = await service.generate({ description: 'A streetwear drop site with a countdown', type: 'product' });

    assert.equal(out.provider, 'local', 'the page still gets built');
    assert.equal(out.spec.sections.length > 3, true);
    assert.equal(out.spec.meta.generatedBy, 'launchpad-compiler');
    assert.match(out.fallbackReason, /LM Studio/, 'the retry message names the right server, not Ollama');
    assert.match(out.fallbackReason, /after 3 attempts/);
    assert.equal(stub.seen.filter((r) => r.url === '/v1/chat/completions').length, 3, 'it did try, twice repairing');
  } finally {
    await stub.close();
  }
});

test('an unreachable model server leaves generation untouched', async () => {
  const service = new GeneratorService(Promise.resolve(null));
  service.clients = { lmstudio: clientFor('http://127.0.0.1:59999/v1'), ollama: clientFor('http://127.0.0.1:59999/v1'), llm: null };
  const out = await service.generate({ description: 'A coffee shop in Ikoyi', type: 'business' });
  assert.equal(out.provider, 'local');
  assert.equal(out.ai.reachable, false);
  assert.match(out.fallbackReason, /lmstudio: /);
  assert.equal(out.spec.sections[0].type, 'hero');
  assert.equal(pacingFor({ provider: 'lmstudio', model: 'x', lastElapsedMs: 1000 }).totalMs, 9000, 'still the slow floor while unknown');
});

test('the health probe does not re-walk every server on every page load', async () => {
  const stub = await startStub(standardStub());
  try {
    const counting = clientFor(stub.baseUrl);
    const realProbe = counting.probe.bind(counting);
    let probes = 0;
    counting.probe = async () => {
      probes += 1;
      return realProbe();
    };
    const dead = clientFor('http://127.0.0.1:59998/v1');
    const inject = { lmstudio: counting, ollama: dead, llm: null };

    const first = await resolveAiModeCached({ refresh: true, ...inject });
    assert.equal(first.provider, 'lmstudio');
    assert.equal(probes, 1);

    const second = await resolveAiModeCached(inject);
    assert.equal(probes, 1, 'held for a moment, so a reload of the dashboard is not three more probes');
    assert.equal(second.model, 'qwen3-30b-a3b');

    const forced = await resolveAiModeCached({ refresh: true, ...inject });
    assert.equal(probes, 2, 'and /api/health?refresh=1 re-probes on demand');
    assert.equal(forced.provider, 'lmstudio');

    const expired = await resolveAiModeCached({ ttlMs: 0, ...inject });
    assert.equal(probes, 3, 'the hold expires on its own');
    assert.equal(expired.useModel, true);
  } finally {
    await stub.close();
  }
});

test('Ollama answers the same probe question, so the resolver has one shape', async () => {
  const { OllamaClient } = require('../src/generator/ollama');
  const stub = await startStub(async (url, body) => {
    if (url === '/api/tags') return { body: JSON.stringify({ models: [{ name: 'qwen2.5:14b', details: { family: 'qwen2' } }] }) };
    if (url === '/api/generate') {
      return { body: JSON.stringify({ response: JSON.stringify({ name: 'From Ollama' }), model: 'qwen2.5:14b', done: true, eval_count: 400, eval_duration: 4e9 }) };
    }
    return { status: 404, body: '{}' };
  });
  try {
    const ollama = new OllamaClient({ baseUrl: stub.baseUrl.replace(/\/v1$/, ''), model: 'qwen2.5:14b' });
    const probe = await ollama.probe();
    assert.equal(probe.reachable, true, 'a stubbed daemon answers /api/tags');
    assert.equal(await ollama.ping(), true, 'ping is still the same yes/no the older code expects');
    assert.deepEqual(await ollama.generate({ prompt: 'go' }).then((r) => ({ m: r.model, ok: r.done })), { m: 'qwen2.5:14b', ok: true });

    const mode = await resolveAiMode('auto', { ollama, lmstudio: clientFor('http://127.0.0.1:59997/v1'), llm: null });
    assert.equal(mode.provider, 'ollama', 'and it is still picked when LM Studio is not there');
    assert.equal(mode.client, ollama);
    assert.equal(mode.useOllama, true);

    const dead = new OllamaClient({ baseUrl: 'http://127.0.0.1:59997' });
    assert.equal(dead.label, 'Ollama', 'so a required-but-missing Ollama is named, not "undefined"');
    const deadProbe = await dead.probe();
    assert.equal(deadProbe.reachable, false);
    await assert.rejects(() => resolveAiMode('ollama', { ollama: dead, lmstudio: dead }), /Ollama is required \(LAUNCHPAD_AI_PROVIDER=ollama\) but/);
  } finally {
    await stub.close();
  }
});
