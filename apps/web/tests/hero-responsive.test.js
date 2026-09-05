import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The hero's browser mock is a real 1180px-wide page shrunk with `scale()`, and
 * a transform changes nothing about layout: an in-flow 1180px child sets the
 * minimum width of the column that holds it. That used to push the right side of
 * the hero off the screen at every viewport (836px of it off-screen on a phone),
 * because a `1fr` track refuses to shrink below what it contains.
 *
 * There is no browser in this suite, so these assert on the shipped source. They
 * are a regression lock on that one trap, not a description of the design.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const src = (rel) => readFileSync(path.resolve(here, '..', 'src', rel), 'utf8');

const preview = src('components/landing/SitePreview.jsx');
const hero = src('components/landing/HeroSection.jsx');

test('the scaled mock is taken out of flow so it cannot widen its column', () => {
  const at = preview.indexOf('width: basis');
  assert.ok(at > -1, 'SitePreview must still render a child with `width: basis`');
  const opener = preview.slice(Math.max(0, at - 200), at);
  assert.match(opener, /className="absolute[^"]*"/, 'the full-width child has to be absolutely positioned');
});

test('the preview frame can shrink below its content', () => {
  assert.match(preview, /className=\{cx\('relative w-full min-w-0 max-w-full/, 'the framed preview needs min-w-0 and max-w-full');
  assert.match(preview, /'relative w-full min-w-0'/, 'the frameless preview needs min-w-0 too');
});

test('the mock measures the frame it is in, and never scales up past 1', () => {
  assert.match(preview, /const width = element\.clientWidth;/);
  assert.match(preview, /if \(!width\) return;/, 'a zero width (no layout yet) must not produce NaN');
  assert.match(preview, /Math\.max\(0\.1, Math\.min\(1, width \/ basis\)\)/, 'scale stays within 0.1–1');
});

test('the hero gives both columns a floor of zero', () => {
  const grid = /className="grid[^"]*"/.exec(hero)?.[0] || '';
  assert.match(grid, /lg:grid-cols-\[minmax\(0,[^\]]+fr\)_minmax\(0,[^\]]+fr\)\]/, 'both lg tracks must be minmax(0, …fr)');
  assert.match(hero, /<Parallax distance=\{26\} className="relative min-w-0">/, 'the preview column needs min-w-0');
});

test('the mock is capped to about one screen at any width', () => {
  const caps = [...preview.matchAll(/const cap = active === 'mobile' \? (\d+) : (\d+);/g)];
  assert.equal(caps.length, 1, 'one height cap per device');
  const [mobileMax, desktopMax] = caps[0].slice(1).map(Number);
  const floors = [...preview.matchAll(/Math\.min\(cap, Math\.max\((\d+)/g)].map((m) => Number(m[1]));
  assert.equal(floors.length, 1, 'the auto height must be clamped, not raw');
  const [floor] = floors;
  for (const max of [mobileMax, desktopMax]) {
    assert.ok(floor >= 240 && floor <= 420, `floor ${floor} should sit between 240 and 420`);
    assert.ok(max >= 420 && max <= 680, `cap ${max} should stay inside one screen`);
    assert.ok(max > floor, 'the clamp has to be ordered');
  }
});
