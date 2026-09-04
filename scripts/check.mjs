#!/usr/bin/env node
/**
 * Everything after `npm install`, in one command:
 *
 *   npm run check
 *
 * It starts the API if nothing is answering on :4000, seeds demo content if the
 * gallery is empty, then runs the unit tests, the API end-to-end walk and the
 * jsdom browser smoke. Plain Node + fetch only, so it behaves the same in
 * cmd.exe, PowerShell, bash or zsh — no curl, no shell scripting, no python.
 *
 *   npm run check -- --keep       leave that API running afterwards to browse
 *   npm run check -- --no-serve   never start anything, just run the suites
 *   npm run check -- --only=e2e   run one step (test | seed | e2e | smoke)
 *
 * An API you started yourself with `npm run dev` is reused as-is, and if this
 * script had to start one it shuts it down again on the way out — unless you
 * pass --keep, which leaves it up and prints the addresses.
 */
import { spawn, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const isWin = process.platform === 'win32';
// Node >= 20.12 refuses to spawn a .cmd without a shell (CVE-2024-27980), so on
// Windows npm goes through the shell — its own argv is plain words, nothing that
// needs quoting. CHECK_FORCE_SHELL=1 exercises that same path from any machine.
const useShell = isWin || process.env.CHECK_FORCE_SHELL === '1';
const NPM = useShell ? 'npm' : isWin ? 'npm.cmd' : 'npm';

/* ── flags ─────────────────────────────────────────────────────────────────── */
const argv = process.argv.slice(2);
const has = (flag) => argv.includes(flag);
const only = (() => {
  const arg = argv.find((a) => a.startsWith('--only='));
  return arg ? arg.slice('--only='.length).split(',').filter(Boolean) : null;
})();
const wants = (step) => !only || only.includes(step);

/** The API port the repo wants: an explicit PORT wins, then .env, then 4000. */
function configuredApiPort() {
  const fromShell = Number(process.env.PORT || process.env.LAUNCHPAD_API_PORT);
  if (Number.isFinite(fromShell) && fromShell > 0) return fromShell;
  for (const file of ['.env', 'apps/api/.env']) {
    try {
      const raw = readFileSync(path.join(repo, file), 'utf8');
      for (const line of raw.split(/\r?\n/)) {
        const m = /^\s*(?:export\s+)?(PORT|LAUNCHPAD_API_PORT)\s*=\s*(\d+)/.exec(line);
        if (m) return Number(m[2]);
      }
    } catch {
      /* no .env — the default is fine */
    }
  }
  return 4000;
}

const port = configuredApiPort();
const origin = process.env.CHECK_API || process.env.API_ORIGIN || `http://127.0.0.1:${port}`;
// e2e wants the /api prefix, the smoke harness wants the bare origin.
process.env.API = process.env.API || `${origin.replace(/\/$/, '')}/api`;
process.env.SMOKE_API = process.env.SMOKE_API || origin;

const healthUrl = `${process.env.API}/health`;

/* ── helpers ───────────────────────────────────────────────────────────────── */
const run = (label, npmArgs) => {
  console.log(`\n\u2500\u2500 ${label} \u2500\u2500 ${NPM} ${npmArgs.join(' ')}\n`);
  const result = spawnSync(NPM, npmArgs, { cwd: repo, stdio: 'inherit', env: process.env, shell: useShell });
  if (result.error) {
    console.error(`\u2717 ${label}: could not start ${NPM} (${result.error.message}) — is Node on your PATH?`);
    return 1;
  }
  return result.status ?? 1;
};

async function health() {
  try {
    const response = await fetch(healthUrl, { signal: AbortSignal.timeout(2000) });
    if (!response.ok) return null;
    return await response.json();
  } catch {
    return null;
  }
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function waitForApi(timeoutMs = 90_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const up = await health();
    if (up) return up;
    await sleep(500);
  }
  return null;
}

function stopTree(child) {
  if (!child || child.exitCode !== null) return;
  try {
    if (isWin) {
      spawnSync('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore' });
    } else {
      process.kill(-child.pid, 'SIGTERM');
      setTimeout(() => {
        try {
          if (child.exitCode === null) process.kill(-child.pid, 'SIGKILL');
        } catch {
          /* already gone */
        }
      }, 4000).unref();
    }
  } catch {
    child.kill('SIGTERM');
  }
}

function startApi() {
  const child = spawn(NPM, ['run', 'dev:api'], {
    cwd: repo,
    stdio: ['ignore', 'ignore', 'pipe'],
    detached: !isWin,
    env: process.env,
    shell: useShell,
  });
  const errors = [];
  child.stdout?.resume();
  child.stderr?.on('data', (chunk) => {
    const text = chunk.toString();
    errors.push(text);
    if (errors.length > 40) errors.shift();
  });
  child.on('error', (error) => errors.push(String(error?.message || error)));
  const keep = has('--keep');
  if (!keep) {
    process.on('exit', () => stopTree(child));
    for (const signal of ['SIGINT', 'SIGTERM']) {
      process.on(signal, () => {
        stopTree(child);
        process.exit(130);
      });
    }
  }
  return {
    child,
    describeFailure() {
      const text = errors.join('');
      if (/EADDRINUSE/i.test(text)) return `port ${port} is already taken — close the other process or set PORT in .env`;
      if (/Cannot find module/i.test(text)) return 'dependencies missing — run `npm install` first';
      return text.trim().split(/\r?\n/).slice(-6).join('\n') || `the API exited before it answered ${healthUrl}`;
    },
  };
}

/* ── main ──────────────────────────────────────────────────────────────────── */
let started = null;
let failed = null;
const results = [];

try {
  const needsApi = wants('seed') || wants('e2e') || wants('smoke');
  let status = needsApi ? await health() : null;
  if (needsApi && !status && !has('--no-serve')) {
    console.log(`starting the API on ${origin} …`);
    started = startApi();
    status = await waitForApi();
    if (!status) {
      const reason = started.describeFailure();
      stopTree(started.child);
      console.error(`\u2717 could not start the API: ${reason}`);
      process.exit(1);
    }
  }
  if (needsApi && status) {
    console.log(
      `API is up on ${origin} — store: ${status.database}, ai: ${status.ai?.provider ?? 'unknown'}` +
        (started ? ' (started by this script, it will be stopped again)' : ' (your running dev server)'),
    );
  } else if (needsApi) {
    console.log(`\u26a0 no API on ${origin} and --no-serve was passed: only the unit tests will run.`);
  }

  if (wants('test')) {
    const code = run('unit tests', ['test']);
    results.push(['unit tests', code]);
    if (code !== 0) failed ??= 'unit tests';
  }

  if (status && wants('seed')) {
    const gallery = await fetch(`${process.env.API}/public`)
      .then((r) => (r.ok ? r.json() : null))
      .catch(() => null);
    if (Array.isArray(gallery?.items) && gallery.items.length > 0) {
      console.log(`\n\u2500\u2500 demo content \u2500\u2500 already seeded (${gallery.items.length} published sites), skipping npm run seed`);
      results.push(['seed (skipped)', 0]);
    } else {
      const code = run('seed demo content', ['run', 'seed']);
      results.push(['seed', code]);
      if (code !== 0) failed ??= 'seed';
    }
  }

  if (status && wants('e2e')) {
    const code = run('end-to-end API walk', ['run', 'e2e']);
    results.push(['e2e', code]);
    if (code !== 0) failed ??= 'e2e';
  }

  if (status && wants('smoke')) {
    const code = run('browser smoke (jsdom)', ['run', 'smoke']);
    results.push(['smoke', code]);
    if (code !== 0) failed ??= 'smoke';
  }

  if (!status && (wants('e2e') || wants('smoke'))) {
    const what = [wants('e2e') && 'e2e', wants('smoke') && 'smoke'].filter(Boolean).join(' + ');
    console.log(`\n\u2500\u2500 ${what} skipped \u2500\u2500 nothing is answering on ${origin}.`);
    console.log(`   start it with \`npm run dev\` (or \`npm run api\`) and re-run \`npm run check\`.`);
    results.push([`${what} (skipped: no API)`, 1]);
    failed ??= `${what} — no API to test against`;
  }
} catch (error) {
  failed ??= 'runner';
  console.error(`\n\u2717 ${error?.stack || error}`);
} finally {
  if (started && !has('--keep')) {
    stopTree(started.child);
    console.log('\nstopped the API this script started.');
  } else if (started) {
    console.log(`\nkeeping the API up on ${origin} — the web app needs \`npm run dev:web\` for http://localhost:5173.`);
  }
}

console.log('\n' + '─'.repeat(58));
for (const [label, code] of results) {
  console.log(`${code === 0 ? '\u2713' : '\u2717'} ${label}`);
}
if (failed) {
  console.log(`\nfailed at: ${failed}. Fix that step and run \`npm run check\` again.`);
  process.exit(1);
}
console.log(results.length ? '\nall good.\n' : '\nnothing to do.\n');
process.exit(0);
