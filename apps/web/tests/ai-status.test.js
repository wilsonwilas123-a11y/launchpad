import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The one place the product admits which model server is writing your site.
 *
 * The dashboard used to show a chip only when no server answered, which meant a
 * working LM Studio or Ollama setup looked identical to a hosted product: the
 * chip now reads from `health.ai` in both states, and the label comes from the
 * API so no vendor name is baked into the client.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.resolve(here, '..', 'src', rel), 'utf8');

const dashboard = read('pages/DashboardPage.jsx');
const session = read('context/Session.jsx');

test('the chip is about the model, not about the failure', () => {
  assert.match(dashboard, /health && health\.ai \?/, 'it renders whenever the API told us anything about generation');
  assert.equal(/health\.ai\?\.reachable === false \?/.test(dashboard), false, 'and not only when the model server is missing');
});

test('a reachable server is named, with its model', () => {
  assert.match(dashboard, /health\.ai\.reachable\s*\?\s*`\$\{health\.ai\.label \|\| 'Local model'\} · \$\{health\.ai\.model \|\| 'model not named'\}`/, 'the label and model both come from the health payload');
  assert.equal(/Ollama|LM Studio/.test(dashboard), false, 'no vendor name is hardcoded in the client');
  assert.match(dashboard, /health\.ai\.modelNote/, 'a caveat about the model (it is not loaded yet) is one hover away');
});

test('an unreachable server still says so plainly', () => {
  assert.match(dashboard, /Local model · generation runs on this machine/, 'the fallback copy is unchanged');
  assert.match(dashboard, /:\s*health\.ai\.reason \|\| ''\}/, 'and the exact complaint is in the title attribute');
});

test('a long model id cannot widen the header row', () => {
  assert.match(dashboard, /min-w-0 items-center gap-2 rounded-pill/, 'the chip itself may shrink');
  assert.match(dashboard, /max-w-\[34ch\] truncate/, 'the label truncates instead of pushing the nav off the row');
  assert.match(dashboard, /h-1\.5 w-1\.5 shrink-0 rounded-full/, 'the status dot is the thing that never shrinks');
});

test('the health probe that feeds it stays a single cheap call', () => {
  assert.match(session, /api\.health\(\)/, 'the session fetches health once on mount');
  assert.match(session, /\.catch\(\(\) => alive && setHealth\(\{ ok: false, database: 'unavailable' \}\)\)/, 'and a dead API degrades to a known shape, not an exception');
});

test('Gemini stays on the server: no key, no header, no host in the client', () => {
  // The whole point of the api layer is that the credential never crosses it, and
  // this is the check that keeps it that way when someone adds "just a settings
  // field" later. The frontend gets label, model, endpoint and reason — nothing
  // that identifies or authenticates the key.
  const files = [];
  const walk = (dir) => {
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(jsx?|css)$/.test(entry.name)) files.push(readFileSync(full, 'utf8'));
    }
  };
  walk(path.resolve(here, '..', 'src'));
  const all = files.join('\n');
  for (const forbidden of ['GOOGLE_GEMINI_API_KEY', 'GEMINI_MODEL', 'x-goog-api-key', 'generativelanguage.googleapis.com', 'AIza', 'LAUNCHPAD_GEMINI']) {
    assert.equal(all.includes(forbidden), false, `${forbidden} belongs in apps/api, not in a bundle anyone can read`);
  }
  assert.equal(/Gemini/.test(read('pages/DashboardPage.jsx')), false, 'the chip prints whatever the API calls itself, so a new provider needs no frontend change');
  assert.match(read('lib/api.js'), /health: \(\) => get\('/, 'and health is one ordinary authenticated-free call');
});
