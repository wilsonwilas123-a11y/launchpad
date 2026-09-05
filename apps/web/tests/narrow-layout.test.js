import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * What keeps a page usable at 320px.
 *
 * Every one of these was an actual overflow found by measuring
 * `documentElement.scrollWidth` against the viewport in a browser: a grid or
 * flex track that refuses to shrink below the min-content width of what it
 * holds, a toolbar that only wrapped from 640px up, a card row whose last icon
 * button ran off the edge behind `overflow-hidden`. The fix is always to let
 * the thing shrink — never to hide the overflow and hope.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.resolve(here, '..', 'src', rel), 'utf8');

const css = read('index.css');
const dashboard = read('pages/DashboardPage.jsx');
const auth = read('pages/AuthPage.jsx');
const topBar = read('components/builder/BuilderTopBar.jsx');
const previewPane = read('components/builder/PreviewPane.jsx');
const segmented = read('components/ui/Segmented.jsx');

test('a generated site may shrink, and long words may break inside it', () => {
  assert.match(css, /\.lp-site :is\(h1, h2, h3, h4, p, li, a, span, blockquote\) \{\s*overflow-wrap: break-word;/, 'published-site text has to be allowed to break');
  assert.match(css, /\.lp-site :is\(\.grid, \.flex\) > \* \{\s*min-width: 0;\s*max-width: 100%;/, 'and its grid/flex children have to be allowed to shrink');
});

test('dashboard card grids and their action rows can get narrow', () => {
  assert.match(dashboard, /grid-cols-\[minmax\(0,1fr\)\]/, 'single-column track is minmax(0,1fr), not 1fr');
  assert.equal((dashboard.match(/grid-cols-\[minmax\(0,1fr\)\]/g) || []).length >= 2, true, 'both card grids need it');
  assert.match(dashboard, /<span className="min-w-0 truncate font-display/, 'the thumbnail name truncates instead of pushing');
  assert.match(dashboard, /mt-auto flex flex-wrap items-center gap-2/, 'the action row wraps so Delete is never clipped');
});

test('the three auth screens shrink around the sample link', () => {
  assert.match(auth, /lg:grid-cols-\[minmax\(0,1\.05fr\)_minmax\(0,1fr\)\]/, 'the split layout uses minmax(0,…) tracks');
  assert.match(auth, /<main className="relative flex min-w-0/, 'the form column can shrink below its content');
  assert.match(auth, /break-all/, 'the example URL is allowed to break mid-word');
});

test('toolbars wrap until they are genuinely wide, then go single-line', () => {
  // sm: (640px) was too early — the builder header overflowed at 768px.
  assert.match(topBar, /lg:flex-nowrap/, 'the builder bar stays wrapped below lg');
  assert.match(previewPane, /flex flex-wrap items-center gap-x-3/, 'the device switch row wraps instead of pushing');
  assert.match(segmented, /max-w-full[^']*overflow-x-auto/, 'a segmented control scrolls rather than widening its page');
});

test('nothing in the app relies on hiding overflow to look fine', () => {
  for (const [name, file] of [['DashboardPage', dashboard], ['BuilderTopBar', topBar], ['PreviewPane', previewPane]]) {
    assert.equal(/className="[^"]*-mx-1[^"]*"[^>]*>\s*<\/div>/.test(file), false, `${name}: negative margins are not a fix`);
  }
});
