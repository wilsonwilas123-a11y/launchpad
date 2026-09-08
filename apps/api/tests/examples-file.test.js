const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  ExamplesFileProvider,
  hostOf,
  mapBrowse,
  mapEntry,
  toList,
} = require('../src/modules/inspiration/examples-file');
const { InspirationService } = require('../src/modules/inspiration/inspiration.service');
const { config } = require('../src/config');
const { safeLink, httpsUrl } = require('../src/modules/inspiration/cards');

/**
 * The curated gallery file — the source that replaced "call Behance" as the
 * default, because a site like Lapa Ninja answers a server with a Cloudflare
 * challenge and has no API at all (measured: /, /feed/, /sitemap.xml and
 * /robots.txt are all 403). So the outside half of the row is a file the
 * operator keeps, and the only rules that matter are that it cannot be made to
 * emit an unsafe link, that a bad entry is reported rather than fatal, and that
 * editing it takes effect without a restart.
 */
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'lp-examples-'));
const write = (name, body) => {
  const file = path.join(dir, name);
  fs.writeFileSync(file, typeof body === 'string' ? body : JSON.stringify(body));
  return file;
};

test('a link is only a link', () => {
  assert.equal(safeLink('https://linear.app'), 'https://linear.app');
  assert.equal(safeLink(' http://example.com/x '), 'http://example.com/x');
  assert.equal(safeLink('javascript:alert(1)'), null, 'the file is user-editable: a javascript: href must not survive');
  assert.equal(safeLink('data:text/html;base64,PHNjcmlwdD4='), null);
  assert.equal(safeLink('/relative/only'), null, 'curated cards open outside the app, so they need a real origin');
  assert.equal(httpsUrl('javascript:alert(1)'), null, 'same rule for a cover image');
  assert.equal(httpsUrl('http://x/y.png'), 'https://x/y.png');
  assert.equal(hostOf('https://www.notion.so/home'), 'notion.so');
  assert.equal(hostOf('not a url'), '');
});

test('an entry becomes a card, or says why it did not', () => {
  const { card } = mapEntry({ title: 'Linear', url: 'https://linear.app', cover: 'http://linear.app/og.jpg', author: 'Linear', tags: ['a', 'b', 'c', 'd'] }, 0);
  assert.equal(card.source, 'link');
  assert.equal(card.url, 'https://linear.app');
  assert.equal(card.cover, 'https://linear.app/og.jpg');
  assert.deepEqual(card.tags, ['a', 'b', 'c'], 'three tags, whatever the file holds');
  assert.equal(card.publishedAt, null);
  assert.deepEqual(card.stats, { views: 0, appreciations: 0 }, 'a curated card has no numbers to show, so it invents none');

  assert.equal(mapEntry({ title: 'Broken', url: 'javascript:alert(1)' }, 1).card, null);
  assert.match(mapEntry({ title: 'Broken', url: 'javascript:alert(1)' }, 1).why, /unsafe url/);
  assert.match(mapEntry({ title: 'No link' }, 2).why, /no url/);
  assert.match(mapEntry('a string', 3).why, /not an object/);
  assert.equal(mapEntry({ url: 'https://x.com', title: '   ' }, 4).why, undefined, 'a title-less entry falls back to the host');
  assert.equal(mapEntry({ url: 'https://x.com' }, 5).card.title, 'x.com');
  assert.equal(mapEntry({ url: 'https://x.com', accent: '#0a0a0a' }, 6).card.accent, '#0a0a0a');
  assert.equal(mapEntry({ url: 'https://x.com', accent: 'red; }' }, 7).card.accent, null, 'the accent goes into a style attribute, so only a colour literal passes');
});

test('the file is read, validated, and re-read when it changes', () => {
  const file = write('list.json', {
    items: [{ title: 'One', url: 'https://one.example' }, { title: 'Bad', url: 'javascript:alert(1)' }],
    browse: [{ label: 'The gallery', url: 'https://gallery.example/' }, { url: 'ftp://nope' }, 'https://another.example'],
  });
  const provider = new ExamplesFileProvider({ file });
  const first = provider.read();
  assert.equal(first.items.length, 1, 'the safe entry is in');
  assert.deepEqual(first.skipped, ['unsafe url (javascript:alert(1))'], 'and the bad one is counted, not silently dropped');
  assert.deepEqual(first.browse.map((b) => b.label), ['The gallery', 'Open another.example'], 'a bare string gets a label from its host');

  const cached = provider.read();
  assert.equal(cached.readAt, first.readAt, 'unchanged file, no second parse');

  const rewritten = write('list.json', { items: [{ title: 'One', url: 'https://one.example' }, { title: 'Two', url: 'https://two.example' }] });
  const touched = fs.statSync(rewritten);
  fs.utimesSync(rewritten, touched.atime, new Date(touched.mtimeMs + 5000));
  const second = provider.read();
  assert.equal(second.items.length, 2, 'touching the file is the whole deploy for this feature — no restart');
  assert.deepEqual(second.browse, [], 'and entries that went away are gone');

  const forced = new ExamplesFileProvider({ file: rewritten });
  assert.equal(forced.read({ refresh: true }).items.length, 2);
});

test('a missing or broken file is a state, not an outage', () => {
  const missing = new ExamplesFileProvider({ file: path.join(dir, 'nothing-here.json') });
  assert.match(missing.read().error, /^no examples file at nothing-here\.json$/, 'named by file, never by server path');
  assert.equal(missing.status().configured, false);
  assert.match(missing.status().file, /nothing-here\.json/);

  const broken = new ExamplesFileProvider({ file: write('broken.json', '{ "items": [ , ] }') });
  assert.match(broken.read().error, /is not valid JSON/, 'a syntax slip is reported in one line');
  assert.ok(!broken.read().error.includes(dir), 'the message names the file, never the server path');
  assert.ok(!/\n/.test(broken.read().error), 'and it is one line, not a stack');
  assert.equal(broken.status().count, 0);

  const wrongShape = new ExamplesFileProvider({ file: write('shape.json', { nothing: true }) });
  assert.deepEqual(wrongShape.read().items, [], 'an object with no items array is an empty row');
  assert.equal(toList([1, 2]).items.length, 2, 'a bare array is accepted too');
  assert.equal(toList('nonsense').malformed, true);
});

test('the row keeps the file inside the cap and honours the switch', async () => {
  const file = write('many.json', { items: Array.from({ length: 30 }, (unused, index) => ({ title: `Site ${index}`, url: `https://site${index}.example` })) });
  const capped = new ExamplesFileProvider({ file, limit: 8 });
  assert.equal(capped.read().items.length, 8, 'LAUNCHPAD_EXAMPLE_LIMIT decides how many the strip asks for');
  assert.equal(new ExamplesFileProvider({ file, limit: 99 }).read().items.length, 12, 'and the hard ceiling is 12 either way');

  const off = new ExamplesFileProvider({ file, mode: 'off' });
  assert.equal(off.enabled(), false);
  assert.equal(new ExamplesFileProvider({ file, mode: 'behance' }).enabled(), false, 'asking for only the API means the file sits out');
  assert.equal(new ExamplesFileProvider({ file, mode: 'auto' }).enabled(), true);
  assert.equal(new ExamplesFileProvider({ file, mode: 'links' }).enabled(), true);
});

test('the service puts the three sources in order and reports each one', async () => {
  const file = write('service.json', { items: [{ title: 'Chosen work', url: 'https://linear.app', cover: 'http://linear.app/og.jpg' }], browse: [{ label: 'Lapa Ninja', url: 'https://www.lapa.ninja/' }] });
  const store = {
    listPublished: async () => [
      {
        id: 'p1',
        slug: 'nova',
        name: 'NOVA',
        publishedSnapshot: {
          spec: { name: 'NOVA', sections: [{ type: 'hero', content: { subheadline: 'Out Friday' } }], theme: { colors: { accent: '#fff' } } },
          assets: [],
        },
      },
    ],
  };
  const provider = new ExamplesFileProvider({ file });
  const service = new InspirationService(store, { enabled: () => false, list: async () => [] }, { examples: provider });

  const payload = await service.list();
  assert.deepEqual(payload.items.map((item) => item.source), ['launchpad', 'link'], 'yours first, then the curated list, then the API');
  assert.equal(payload.total, 2);
  assert.equal(payload.provider, 'both');
  assert.deepEqual(payload.browse, [{ id: 'browse-0', label: 'Lapa Ninja', url: 'https://www.lapa.ninja/', host: 'lapa.ninja' }]);
  assert.equal(payload.sources.examples.configured, true);
  assert.equal(payload.sources.examples.count, 1);
  assert.equal(payload.sources.examples.reason, null);
  assert.equal(payload.sources.behance.configured, false, 'and the API half still says what it needs');
  assert.match(payload.sources.behance.reason, /BEHANCE_API_KEY/);

  // The outside halves are independent: a file that is there but empty is not a
  // Behance problem, and vice versa.
  const emptyProvider = new ExamplesFileProvider({ file: write('empty.json', { items: [] }) });
  const sparse = await new InspirationService(store, { enabled: () => false, list: async () => [] }, { examples: emptyProvider }).list();
  assert.equal(sparse.total, 1);
  assert.match(sparse.sources.examples.reason, /no usable entries in empty\.json/);

  // LAUNCHPAD_EXAMPLES_SOURCE=links: the API is not consulted at all, so a
  // client that would throw is the proof that nothing asked it for anything.
  const mode = config.examples.mode;
  config.examples.mode = 'links';
  let asked = 0;
  const counted = { enabled: () => true, list: async () => { asked += 1; throw new Error('should not be called'); } };
  const onlyLinks = await new InspirationService(store, counted, { examples: provider }).list();
  config.examples.mode = mode;
  assert.equal(asked, 0);
  assert.equal(onlyLinks.sources.behance.enabled, false);
  assert.equal(onlyLinks.sources.behance.count, 0);
  assert.equal(onlyLinks.sources.behance.reason, 'not consulted: LAUNCHPAD_EXAMPLES_SOURCE');
  assert.equal(onlyLinks.provider, 'links');
  assert.equal(onlyLinks.total, 2, 'and the curated half is untouched by the switch');

  const status = service.status();
  assert.equal(status.provider, 'both');
  assert.equal(status.examples.file, 'service.json');
  assert.equal(status.count, 0, 'the count next to the provider is still the cached API count, which is 0 here');
});

test('the file shipped in the repo is usable as-is', async () => {
  const shipped = new ExamplesFileProvider();
  const data = shipped.read();
  assert.equal(data.error, null, 'apps/api/examples.json parses on a fresh install');
  assert.ok(data.items.length >= 4, 'and it holds a handful of real examples out of the box');
  assert.ok(data.items.every((card) => card.source === 'link' && /^https:\/\//.test(card.url)), 'every card links somewhere safe');
  assert.ok(data.browse.some((link) => /lapa\.ninja/.test(link.url)), 'including the gallery the row points at for more');
  const status = shipped.status();
  assert.equal(status.configured, true);
  assert.equal(status.file, 'examples.json');
});
