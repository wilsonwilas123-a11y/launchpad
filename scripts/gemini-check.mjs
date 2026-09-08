#!/usr/bin/env node
/**
 * Proves the Gemini provider works, offline, without a key.
 *
 *   npm run check:gemini
 *
 * It starts a local stand-in for generativelanguage.googleapis.com, boots the
 * real API against it with LAUNCHPAD_GEMINI_BASE_URL, then drives the real
 * routes: /api/health, sign-up, project, generate. Everything that matters is
 * on the wire and in the payload, so this is where those are asserted — which
 * credential header went out (exactly one), which path was called, whether
 * responseMimeType was asked for, whether the key appears anywhere a browser
 * could read it, and how many times the model was asked (once).
 *
 * It also boots the API a second time with the provider demanded and no key, and
 * expects a refusal to start rather than a silent fallback. Nothing here
 * reaches Google; the two curls in RUNNING-AND-DEPLOYING.md §12 are for that.
 */
import { spawn } from 'node:child_process';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PORT = Number(process.env.GEMINI_CHECK_PORT || 4310);
const STUB_PORT = Number(process.env.GEMINI_CHECK_STUB_PORT || 4311);
const KEY = 'AIzaSyLocal-stub-key-not-a-real-credential-0001';

const SPEC = {
  name: 'NOVA DROP 01',
  tagline: 'Twelve pairs, one Friday.',
  sections: [
    { type: 'hero', content: { headline: 'The drop you can actually buy', subheadline: 'Twelve pairs, one Friday, no raffle.', cta: 'Get on the list' } },
    { type: 'waitlist', content: { headline: 'Join the list', note: 'We email once, 48 hours before.' } },
  ],
};

const hits = [];
const stub = http.createServer((req, res) => {
  let raw = '';
  req.on('data', (chunk) => (raw += chunk));
  req.on('end', () => {
    hits.push({ url: req.url, method: req.method, goog: req.headers['x-goog-api-key'] || null, auth: req.headers.authorization || null, body: raw ? JSON.parse(raw) : null });
    const answer = req.url.startsWith('/v1beta/models?')
      ? { models: [{ name: 'models/gemini-2.5-flash', displayName: 'Gemini 2.5 Flash', supportedGenerationMethods: ['generateContent'] }] }
      // Deliberately untidy: a real model wraps JSON in prose and fences, and the
      // generator has to cope with that rather than hope for clean output.
      : { candidates: [{ content: { parts: [{ text: `Here you go:\n\`\`\`json\n${JSON.stringify(SPEC)}\n\`\`\`` }], role: 'model' }, finishReason: 'STOP' }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 220 } };
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify(answer));
  });
});

const call = (pathName, { method = 'GET', body, token } = {}) =>
  fetch(`http://127.0.0.1:${PORT}${pathName}`, {
    method,
    headers: { 'content-type': 'application/json', ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  }).then(async (res) => ({ status: res.status, json: await res.json().catch(() => null) }));

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
let failed = 0;
const ok = (label, condition, detail) => {
  if (!condition) failed += 1;
  console.log(`  ${condition ? '✓' : '✗'} ${label}${detail ? ` — ${detail}` : ''}`);
};

const apiEnv = (extra) => ({
  ...process.env,
  PORT: String(PORT),
  LAUNCHPAD_STORE: 'file',
  LAUNCHPAD_AI_PROVIDER: 'gemini',
  LAUNCHPAD_GEMINI_TIMEOUT_MS: '8000',
  ...extra,
});

async function boot(env) {
  const child = spawn('node', ['apps/api/src/main.js'], { cwd: repo, env, stdio: ['ignore', 'pipe', 'pipe'] });
  let log = '';
  child.stdout.on('data', (chunk) => (log += chunk));
  child.stderr.on('data', (chunk) => (log += chunk));
  child.on('exit', (code, signal) => (child.exitInfo = { code, signal }));
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const up = await fetch(`http://127.0.0.1:${PORT}/api/health`).then((res) => res.ok).catch(() => false);
    if (up) return { child, log: () => log };
    await wait(250);
  }
  return { child, log: () => log, timeout: true };
}

async function main() {
  await new Promise((resolve) => stub.listen(STUB_PORT, '127.0.0.1', resolve));
  const dir = `/tmp/launchpad-gemini-check-${Date.now()}`;
  const base = `http://127.0.0.1:${STUB_PORT}/v1beta`;

  console.log('\n── the API, configured for Gemini against a local stand-in');
  const started = await boot({ ...apiEnv(), LAUNCHPAD_STORAGE_DIR: dir, GOOGLE_GEMINI_API_KEY: KEY, LAUNCHPAD_GEMINI_BASE_URL: base });
  if (started.timeout) {
    console.error('the API never came up:\n' + started.log());
    process.exit(1);
  }
  ok('it names the provider at boot', /Gemini via .*— model gemini-2\.5-flash/.test(started.log()), started.log().split('\n').find((line) => line.includes('launchpad:ai'))?.trim());

  const health = (await call('/api/health?refresh=1')).json;
  const ai = health.ai || {};
  ok('health reports Gemini as the writer', ai.provider === 'gemini' && ai.reachable === true, `${ai.provider} · ${ai.model}`);
  ok('with a label the chip can print and an endpoint you can audit', ai.label === 'Gemini' && ai.endpoint === base, ai.endpoint);
  ok('and no key anywhere in it', !JSON.stringify(health).includes(KEY));
  const probes = hits.filter((hit) => hit.url.startsWith('/v1beta/models?'));
  ok('the model list was asked with exactly one credential', probes.length > 0 && probes.every((hit) => hit.goog === KEY && hit.auth === null), `${probes.length} probe(s)`);

  console.log('\n── one generation');
  const email = `gemini-check-${Date.now()}@launchpad.test`;
  const signup = await call('/api/auth/signup', { method: 'POST', body: { email, password: 'hunter2hunter2', name: 'Gemini Check' } });
  const token = signup.json?.token;
  ok('signed up', Boolean(token), email);
  const created = await call('/api/projects', { method: 'POST', token, body: { name: 'NOVA Drop 01', description: 'A sneaker drop, twelve pairs, one Friday, a waitlist.', type: 'product' } });
  ok('created a project', [200, 201].includes(created.status) && created.json?.id, created.json?.id);
  const before = hits.length;
  const generated = await call(`/api/projects/${created.json.id}/generate`, { method: 'POST', token, body: {} });
  const sent = hits[before];
  const spec = generated.json?.spec || {};
  const hero = (spec.sections || []).find((section) => section.type === 'hero') || {};
  ok('generate answered', [200, 201].includes(generated.status), `status ${generated.status}`);
  ok('exactly one call, to the documented path', hits.filter((hit) => hit.method === 'POST').length === 1 && sent?.url === '/v1beta/models/gemini-2.5-flash:generateContent', sent?.url);
  ok('authenticated with x-goog-api-key and nothing else', sent?.goog === KEY && !sent?.auth);
  ok('JSON asked for natively, at the configured budget', sent?.body?.generationConfig?.responseMimeType === 'application/json' && sent.body.generationConfig.maxOutputTokens === 4000, JSON.stringify(sent?.body?.generationConfig));
  ok('the fenced answer became the spec, merged over the skeleton', spec.name === 'NOVA DROP 01' && hero.content?.subheadline === 'Twelve pairs, one Friday, no raffle.' && (spec.sections || []).length > 2, `${spec.name}, ${(spec.sections || []).length} sections`);
  ok('the response says who wrote it and did not fall back', generated.json?.generation?.provider === 'gemini' && !generated.json.generation.fallbackReason, `${generated.json?.generation?.provider}:${generated.json?.generation?.model} in ${generated.json?.generation?.elapsedMs}ms`);
  ok('the key is nowhere in the response, the URL or a body', !JSON.stringify(generated.json).includes(KEY) && !hits.some((hit) => hit.url.includes(KEY) || JSON.stringify(hit.body).includes(KEY)));

  started.child.kill('SIGTERM');
  await wait(400);

  console.log('\n── demanded with no key');
  const noKey = spawn('node', ['apps/api/src/main.js'], {
    cwd: repo,
    env: { ...apiEnv(), LAUNCHPAD_STORAGE_DIR: `${dir}-nokey`, GOOGLE_GEMINI_API_KEY: '' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  let output = '';
  noKey.stdout.on('data', (chunk) => (output += chunk));
  noKey.stderr.on('data', (chunk) => (output += chunk));
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => resolve(undefined), 15000);
    noKey.on('exit', (exitCode) => {
      clearTimeout(timer);
      resolve(exitCode);
    });
  });
  if (code === undefined) noKey.kill('SIGKILL');
  ok('the API refuses to start instead of quietly using the compiler', code === 1, `exit ${code}`);
  ok('and names the variable, pointing at AI Studio', /GOOGLE_GEMINI_API_KEY is empty/.test(output) && /aistudio\.google\.com\/apikey/.test(output));
  ok('without waiting on a network that will not answer', !/ECONNREFUSED|ETIMEDOUT|fetch failed/.test(output));

  stub.close();
  console.log(failed ? `\n${failed} failing assertion(s)\n` : '\nall good.\n');
  process.exit(failed ? 1 : 0);
}

main().catch((error) => {
  console.error('gemini check crashed:', error);
  stub.close();
  process.exit(1);
});
