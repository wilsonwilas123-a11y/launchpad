#!/usr/bin/env node
/**
 * Renders the real web app in jsdom against a running API and asserts on what
 * the user would actually see — landing, pricing, legal, dashboard, wizard,
 * builder, colour edit, AI refine, publish, and the published page.
 *
 *   npm run smoke                 # needs the API on :4000 (npm run dev:api)
 *   SMOKE_API=http://host:4000 npm run smoke
 *
 * It is not a unit-test suite: it exists because the interesting failures in
 * this product are contract mismatches between a component and a route, and
 * only a render finds those.
 */
import { spawnSync } from 'node:child_process';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '..');
const outDir = path.join(repo, 'node_modules', '.cache', 'launchpad-smoke');
const bundle = path.join(outDir, 'bundle.cjs');

let esbuild;
try {
  esbuild = (await import('esbuild')).default || (await import('esbuild'));
} catch {
  console.error('esbuild is not available — run `npm install` at the repository root.');
  process.exit(1);
}

mkdirSync(outDir, { recursive: true });

const target = path.join(repo, 'apps', 'web', 'src');
if (!existsSync(target)) {
  console.error(`missing ${target}`);
  process.exit(1);
}

await esbuild.build({
  entryPoints: [path.join(here, 'web-smoke', 'entry.jsx')],
  outfile: bundle,
  bundle: true,
  platform: 'node',
  format: 'cjs',
  jsx: 'automatic',
  logLevel: 'warning',
  define: { 'process.env.NODE_ENV': '"development"' },
  loader: { '.js': 'jsx' },
});

const result = spawnSync(process.execPath, [path.join(here, 'web-smoke', 'harness.cjs')], {
  stdio: 'inherit',
  env: { ...process.env, SMOKE_BUNDLE: bundle },
});
process.exit(result.status ?? 1);
