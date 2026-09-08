import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { test } from 'node:test';
import assert from 'node:assert/strict';

/**
 * The examples row under your own launches, and the link that finally has a
 * target: "See an example first" used to point at `/`, which answers a signed-in
 * visitor with a redirect straight back to the dashboard — a link that could not
 * work for the only people who could see it. It now points at a section on this
 * same page, which is rendered even when it has nothing in it.
 *
 * The row has three sources now (generated here, the curated gallery file,
 * Behance when a key exists) and only the last one can be missing because of a
 * credential, so the strip has to keep them apart on screen: a group per source,
 * each labelled, and nothing rendered for a source that returned nothing.
 *
 * The rest of the contract is the parts a third party can break: an external
 * host that can 403 a hot-linked image, rate-limit a request or vanish, must
 * never turn into a broken-looking dashboard.
 */
const here = path.dirname(fileURLToPath(import.meta.url));
const read = (rel) => readFileSync(path.resolve(here, '..', 'src', rel), 'utf8');

const strip = read('components/inspiration/InspirationStrip.jsx');
const dashboard = read('pages/DashboardPage.jsx');
const client = read('lib/api.js');

const emptyBlock = dashboard.slice(dashboard.indexOf('function EmptyDashboard'));

test('the row is fetched without a session and without a new api surface', () => {
  const line = (client.match(/inspiration: \(options[\s\S]*?\n/) || [])[0] || '';
  assert.ok(line.includes("get(`/inspiration"), 'one public route, path-relative like everything else');
  assert.match(line, /auth: false/, 'a brand-new account with no projects has to be able to read it');
  assert.match(line, /\?refresh=1/, 'and the retry button actually re-reads instead of serving the cache');
  assert.equal(/VITE_|import\.meta\.env/.test(line), false, 'no build-time host: the strip works off whatever origin serves it');
});

test('it sits below the projects, not instead of them', () => {
  assert.ok(dashboard.includes('<InspirationStrip />'), 'rendered on the dashboard');
  assert.ok(
    dashboard.indexOf('<InspirationStrip />') > dashboard.indexOf('Nothing matches that filter.'),
    'after the grid and the empty state, so it never pushes your own launches down',
  );
  assert.match(dashboard, /import InspirationStrip from '..\/components\/inspiration\/InspirationStrip';/);
});

test('the empty-state link has somewhere to go, on this page', () => {
  assert.ok(emptyBlock.includes('href="#inspiration"'), 'a fragment link: no route change, so no redirect loop');
  assert.equal(/href="\/"/.test(emptyBlock), false, 'and specifically not the root route again');
  assert.match(strip, /id="inspiration"/, 'the section exists to be landed on');
  assert.match(strip, /scroll-mt-24/, 'clear of the sticky header');
  assert.match(strip, /No examples on this API yet/, 'and it is rendered even with nothing in it, with the reason');
  assert.match(strip, /npm run seed/, 'naming the one command that fills it');
  assert.match(strip, /apps\/api\/examples\.json/, 'and the file that holds the other half');
});

test('outside cards link out safely and credit whoever made them', () => {
  assert.match(strip, /target="_blank"/);
  assert.match(strip, /rel="noopener noreferrer nofollow"/, 'no opener handle, no referrer, no PageRank gift');
  assert.match(strip, /referrerPolicy="no-referrer"/, 'hot-linked covers are usually blocked by referrer checks');
  assert.match(strip, /The sites below belong to the people who made them/, 'and the strip says out loud that none of it is ours');

  const cardFn = strip.slice(strip.indexOf('function Card({ item })'), strip.indexOf('function Cover('));
  assert.match(cardFn, /:\s*item\.author\}/, 'the maker is named on the card, where an internal card shows its age instead');
  assert.equal((cardFn.match(/<a[\s>]/g) || []).length, 1, 'one link per card: an <a> inside an <a> is invalid HTML, so the credit is text');
  assert.equal(/href=\{item\.authorUrl\}/.test(cardFn), false, 'including no author link nested inside the card link');
});

test('each source is its own group, labelled and only shown when filled', () => {
  assert.match(strip, /key: 'launchpad', label: 'Made here'/);
  assert.match(strip, /key: 'link', label: 'Curated'/, 'a curated card is not dressed up as one we generated');
  assert.match(strip, /key: 'behance', label: 'Behance'/);
  assert.match(strip, /<Tag>\{tagFor\(item\.source\)\}<\/Tag>/, 'the tag on the card comes from the same list of sources');
  assert.match(strip, /if \(!cards\.length\) return null/, 'and a source with nothing to show takes up no room');
  assert.match(strip, /\{outside\.length \?/, 'the credit paragraph appears once, for any outside source');
});

test('the gallery links are for the browser, and say so', () => {
  assert.match(strip, /const browse = data\?\.browse \|\| \[\]/);
  assert.match(strip, /browse\.map\(\(link\) =>/);
  assert.match(strip, /min-h-\[40px\][^\n]*link-quiet|link-quiet[^\n]*min-h-\[40px\]/, 'they are real links: 40px tall, quiet style like the rest of the nav');
  assert.match(strip, /target="_blank"\n              rel="noopener noreferrer nofollow"/, 'and they open Lapa and friends in a tab, where a challenge page is a non-event');
});

test('a curated list that needs attention is reported, not swallowed', () => {
  assert.match(strip, /data\?\.sources\?\.examples/);
  assert.match(strip, /No curated list on this API/, 'an empty file names the file to edit');
  assert.match(strip, /examples\.file \|\| 'examples\.json'/);
  assert.match(strip, /examples\.skipped\b/, 'and the entries that were left out are counted out loud');
  assert.match(strip, /Behance is not set up on this API/, 'the credential is still only asked for when it is the missing half');
  assert.match(strip, /\{examples\.reason \? ` — \$\{examples\.reason\}` : ''\}/, 'whatever the file complained about is on screen verbatim');
});

test('a hot-linked image that fails is a colour block, not a broken icon', () => {
  assert.match(strip, /onError=\{\(\) => setBroken\(true\)\}/);
  assert.match(strip, /loading="lazy"/, 'and none of it is fetched until it is near the viewport');
  assert.match(strip, /alt=\{item\.title\}/, 'while it does load, it is named');
  assert.match(strip, /aria-hidden="true"/, 'the fallback letter is decoration');
  assert.match(strip, /item\.accent \? \{ background:/, 'filled from the project palette when there is one');
});

test('narrow screens and a failing Behance are both handled', () => {
  assert.match(strip, /grid gap-4 sm:grid-cols-2 lg:grid-cols-4/, 'four across on a desktop, one on a phone');
  assert.match(strip, /className="min-w-0"/, 'the grid child can shrink');
  assert.match(strip, /min-w-0[^\n]*truncate[^\n]*font-display/, 'a long project title cannot widen the card');
  assert.match(strip, /const \[state, setState\] = useState\('loading'\)/, 'a skeleton while it is out');
  assert.match(strip, /\.catch\(\(error\) => \{\n        if \(!alive\) return;\n        setState\('failed'\)/, 'a failure is a state, not a throw');
  assert.match(strip, /Try again/, 'with a way to retry');
  assert.match(strip, /stale/, 'and a stale row keeps the last good cards');
});
