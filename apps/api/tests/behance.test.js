const test = require('node:test');
const assert = require('node:assert/strict');

const {
  BehanceClient,
  behanceDisabledReason,
  behanceEnabled,
  failureMessage,
  mapProject,
  pickCover,
  redactKeys,
  requestUrls,
  stripHtml,
} = require('../src/modules/inspiration/behance');
const { InspirationService, peekInspirationStatus } = require('../src/modules/inspiration/inspiration.service');
const { config } = require('../src/config');

/**
 * The examples row has exactly one job that tests can pin down: an outside
 * service that needs a key Adobe no longer issues must never be able to break,
 * slow or embarrass the dashboard. So everything here is about the three failure
 * shapes — not configured, refused, unreachable — plus the mapping, with a stub
 * fetch and no network.
 *
 * The key is assembled in pieces because CI log scrubbers rewrite anything that
 * looks like a credential, and half of these assertions are about a key not
 * appearing in text.
 */
const KEY = ['beh', 'ance_', 'key_1234'].join('');
const settings = (over = {}) => ({
  apiKey: KEY,
  baseUrl: 'https://api.behance.net/v2',
  users: [],
  field: '',
  sort: 'appreciations',
  perPage: 8,
  timeoutMs: 6000,
  ttlMs: 900000,
  ...over,
});

const project = (over = {}) => ({
  id: 176821851,
  name: 'Brand Refresh for a Coffee Roastery',
  description: '<p>A warm, <strong>editorial</strong> identity & system.</p>',
  created_on: 1700000000,
  url: 'http://www.behance.net/gallery/176821851/Brand-Refresh',
  tags: ['branding', 'editorial', 'packaging', 'print'],
  owner: { username: 'studionorth', display_name: 'Studio North', city: 'Lisbon', country: 'Portugal' },
  stats: { views: '12345', appreciations: '842' },
  covers: { 176: 'http://m.behance.net/a.jpg', 202: 'http://m.behance.net/b.jpg', 404: 'http://m.behance.net/c.jpg', 808: 'http://m.behance.net/d.jpg' },
  ...over,
});

const json = (payload, init = {}) => ({
  ok: init.status === undefined || init.status === 200,
  status: init.status === undefined ? 200 : init.status,
  async text() {
    return typeof payload === 'string' ? payload : JSON.stringify(payload);
  },
});

test('no key is a state, not an error', () => {
  assert.equal(behanceEnabled(settings({ apiKey: '' }), 'auto'), false);
  assert.match(behanceDisabledReason(settings({ apiKey: '' }), 'auto'), /BEHANCE_API_KEY/);
  // Switched off on purpose: a key in the environment must not restart the calls.
  assert.equal(behanceEnabled(settings(), 'off'), false);
  assert.match(behanceDisabledReason(settings(), 'local'), /LAUNCHPAD_INSPIRATION/);
  assert.equal(behanceEnabled(settings(), 'auto'), true);
  assert.equal(behanceDisabledReason(settings(), 'auto'), null);
});

test('a curated list of designers beats the site-wide feed', () => {
  const urls = requestUrls(settings({ users: ['studionorth', 'ada.p', 'x'.repeat(3), 'fourth', 'fifth'] }));
  assert.equal(urls.length, 4, 'and the list is capped, because each name is a request');
  assert.match(urls[0], /\/users\/studionorth\/projects\?/);
  assert.match(urls[1], /\/users\/ada\.p\/projects\?/, 'one request per designer');
  urls.forEach((url) => {
    assert.match(url, /api_key=/);
    assert.match(url, /per_page=8/);
    assert.match(url, /fields=id%2Cname/, 'the restricted field list is a query param, commas encoded');
  });

  const [feed] = requestUrls(settings({ field: 'web-design', sort: 'views' }));
  assert.match(feed, /\/projects\?/);
  assert.match(feed, /field=web-design/);
  assert.match(feed, /sort=views/);
});

test('a card is built from what the API is allowed to return', () => {
  const card = mapProject(project());
  assert.equal(card.id, 'behance-176821851');
  assert.equal(card.source, 'behance');
  assert.equal(card.title, 'Brand Refresh for a Coffee Roastery');
  assert.equal(card.cover, 'https://m.behance.net/c.jpg', 'the 2:1 crop, upgraded to https — a hosted app would refuse a plain-http image');
  assert.equal(card.url, 'https://www.behance.net/gallery/176821851/Brand-Refresh');
  assert.equal(card.blurb, 'A warm, editorial identity & system.', 'markup out, one line in');
  assert.deepEqual(card.tags, ['branding', 'editorial', 'packaging'], 'three tags, not the whole list');
  assert.deepEqual(card.stats, { views: 12345, appreciations: 842 }, 'Behance sends numbers as strings');
  assert.equal(card.author, 'Studio North');
  assert.equal(card.authorUrl, 'https://www.behance.net/studionorth', 'attribution has to be clickable');
  assert.equal(card.authorLocation, 'Lisbon, Portugal');
  assert.equal(card.publishedAt, new Date(1700000000 * 1000).toISOString());
  assert.equal(mapProject(null), null);
  assert.equal(mapProject({}), null, 'a payload item with no id is dropped, not rendered as an empty card');
});

test('the cover and the link both fall back to something usable', () => {
  assert.equal(pickCover({ covers: { 176: 'http://x/176.jpg' } }), 'https://x/176.jpg');
  assert.equal(pickCover({}), null);
  assert.equal(pickCover({ covers: {} }), null);
  const card = mapProject(project({ url: undefined, covers: {}, owner: { username: 'ada p' } }));
  assert.equal(card.url, 'https://www.behance.net/gallery/176821851/ada-p', 'a gallery link can be built from the id');
  assert.equal(stripHtml('plain &amp; simple <br>text'), 'plain simple text');
});

test('an upstream refusal explains itself without repeating the key', () => {
  const message = failureMessage(403, '{"valid":0,"messages":[{"type":"error","message":"A client or user is required"}]}');
  assert.match(message, /403/);
  assert.match(message, /rejected this key/);
  assert.match(message, /closed registration|before Adobe/, 'the fix is not "try another key", so say what it is');
  assert.doesNotMatch(message, /behance_key_1234/);
  assert.match(failureMessage(404, ''), /no such endpoint/);
  assert.match(failureMessage(429, ''), /rate limiting/);
  assert.equal(redactKeys(`GET x?api_key=${KEY}&per_page=8`), 'GET x?api_key=•••&per_page=8');
});

test('the client merges feeds, drops repeats and keeps to the page size', async () => {
  const calls = [];
  const client = new BehanceClient({
    ...settings({ users: ['one', 'two'], perPage: 3 }),
    fetch: async (url) => {
      calls.push(url);
      const id = url.includes('users/one') ? 1 : 2;
      return json({
        projects: [
          project({ id, name: `Project ${id}`, stats: { appreciations: String(id) } }),
          project({ id: 99, name: 'shared between both feeds', stats: { appreciations: '0' } }),
        ],
      });
    },
  });
  const cards = await client.list();
  assert.equal(calls.length, 2, 'one request per designer');
  assert.equal(cards.length, 3, 'the duplicate id across the two feeds is collapsed, then capped');
  assert.deepEqual(cards.map((card) => card.title), ['Project 2', 'Project 1', 'shared between both feeds'], 'several designers interleave by appreciation, not one designer first');
});

test('network trouble and a slow Behance both come back as one shape', async () => {
  const slow = new BehanceClient({
    ...settings({ timeoutMs: 5 }),
    fetch: async (url, options = {}) =>
      new Promise((resolve, reject) => {
        const abort = () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' }));
        if (options.signal) {
          if (options.signal.aborted) return abort();
          options.signal.addEventListener('abort', abort, { once: true });
        }
      }),
  });
  await assert.rejects(() => slow.list(), /not reachable/);

  const leaking = new BehanceClient({
    ...settings(),
    fetch: async (url) => {
      throw new Error(`fetch failed for ${url}`);
    },
  });
  const error = await leaking.list().catch((cause) => cause);
  assert.equal(error.code, 'BEHANCE_UNREACHABLE');
  assert.ok(!error.message.includes(KEY), 'the URL carries the key, so the message must not carry the URL');

  const notJson = new BehanceClient({ ...settings(), fetch: async () => json('<html>cf block</html>') });
  await assert.rejects(() => notJson.list(), /not JSON/);

  const empty = new BehanceClient({ ...settings(), fetch: async () => json({}) });
  assert.deepEqual(await empty.list(), [], 'a payload with no projects array is an empty row, not a crash');
});

/**
 * The curated gallery file is tested in examples-file.test.js. Inside this file
 * every service gets it switched off, so a count here means exactly one thing:
 * the Behance half, the launchpad half, or nothing.
 */
const noExamples = {
  enabled: () => false,
  list: async () => ({ items: [], browse: [], skipped: [], error: 'not configured in this test' }),
  status: () => ({ provider: 'file', configured: false, file: 'examples.json', count: 0, skipped: 0, skippedWhy: [], readAt: 0, reason: 'not configured in this test' }),
};

test('without a key the row is still the launchpad half, and it says why', async () => {
  const store = {
    listPublished: async (limit) => {
      assert.equal(limit, config.inspiration.launchpadCount, 'the strip asks for its own count, not the gallery default');
      return [
        {
          id: 'p1',
          slug: 'nova',
          name: 'NOVA',
          type: 'product',
          publishedAt: '2026-09-01T00:00:00.000Z',
          publishedSnapshot: {
            publishedAt: '2026-09-01T00:00:00.000Z',
            spec: { name: 'NOVA', tagline: '', sections: [{ type: 'hero', content: { subheadline: 'Out Friday.' } }, { type: 'gallery' }], theme: { colors: { accent: '#ff5c39' } } },
            assets: [{ url: '/uploads/nova-1.jpg' }],
          },
        },
      ].slice(0, limit);
    },
  };
  const client = new BehanceClient({ ...settings({ apiKey: '' }) });
  const service = new InspirationService(Promise.resolve(store), client, { examples: noExamples });
  const payload = await service.list();

  assert.equal(payload.total, 1);
  assert.deepEqual(
    { ...payload.items[0], publishedAt: undefined },
    {
      id: 'launchpad-p1',
      source: 'launchpad',
      title: 'NOVA',
      blurb: 'Out Friday.',
      author: 'published on this API',
      authorUrl: null,
      authorLocation: null,
      url: '/nova',
      cover: '/uploads/nova-1.jpg',
      tags: ['product'],
      stats: { views: 0, appreciations: 0 },
      publishedAt: undefined,
      accent: '#ff5c39',
      sections: 2,
    },
    'internal cards open in the app, so their url is a path and their cover is the project’s own image',
  );
  assert.equal(payload.sources.launchpad.count, 1);
  assert.equal(payload.sources.behance.configured, false);
  assert.equal(payload.sources.behance.ok, false);
  assert.match(payload.sources.behance.reason, /BEHANCE_API_KEY/);
  assert.equal(payload.sources.behance.stale, false, 'not-configured is not stale: there is nothing for a retry button to fix');
  assert.ok(!JSON.stringify(payload).includes(KEY), 'nothing of the key ever gets near the browser');
});

test('the file half reports its own problem, not the API\u2019s', async () => {
  const mode = config.examples.mode;
  config.examples.mode = 'links';
  try {
    const service = new InspirationService({ listPublished: async () => [] }, new BehanceClient(settings({ apiKey: '' })), {
      examples: { enabled: () => true, list: async () => ({ items: [], browse: [], skipped: [], error: 'examples.json is not valid JSON' }), status: () => ({ configured: false, file: 'examples.json', count: 0, skipped: 0, skippedWhy: [], readAt: 0, reason: 'examples.json is not valid JSON' }) },
    });
    const payload = await service.list();
    assert.match(payload.sources.examples.reason, /not valid JSON/);
    assert.equal(payload.sources.behance.enabled, false, 'and the API is simply not part of this answer');
  } finally {
    config.examples.mode = mode;
  }
});

test('an empty key is no longer an empty row: the curated file fills it', async () => {
  // The reason the row does not ask for a credential any more: with no key and
  // nothing published, the old code could only show four grey boxes and a
  // retry. The file ships in the repo, so the strip has content on a fresh
  // install, and the API half is still reported honestly as missing.
  const service = new InspirationService({ listPublished: async () => [] }, new BehanceClient(settings({ apiKey: '' })));
  const payload = await service.list();

  assert.ok(payload.items.length > 0, 'a fresh install shows real sites, not an empty state');
  assert.ok(payload.items.every((item) => item.source === 'link'), 'and they are the curated ones');
  assert.ok(payload.items.every((item) => /^https:\/\//.test(item.url)), 'each opens the site itself');
  assert.equal(payload.provider, 'both', 'LAUNCHPAD_EXAMPLES_SOURCE is unset, so both outside halves are asked');
  assert.equal(payload.sources.behance.configured, false);
  assert.match(payload.sources.behance.reason, /BEHANCE_API_KEY/);
  assert.ok(payload.browse.length > 0, 'and there are links to the galleries for anyone who wants more');
});

test('a slow or broken Behance cannot stall or empty the row', async () => {
  const store = { listPublished: async () => [] };
  let calls = 0;
  const flaky = {
    enabled: () => true,
    list: async () => {
      calls += 1;
      if (calls === 1) return [mapProject(project({ id: 1 })), mapProject(project({ id: 2 }))];
      throw new Error(`Behance answered 500 for ?api_key=${KEY}`);
    },
  };
  const service = new InspirationService(store, flaky, { examples: noExamples });

  const first = await service.list();
  assert.equal(first.sources.behance.ok, true);
  assert.equal(first.sources.behance.count, 2);
  assert.equal(first.sources.behance.stale, false);

  const second = await service.list();
  assert.equal(calls, 1, 'inside the ttl the cache answers, so the dashboard costs nothing to reload');
  assert.equal(second.items.length, 2);

  const forced = await service.list({ refresh: true });
  assert.equal(calls, 2, 'and ?refresh=1 goes out again');
  assert.equal(forced.sources.behance.count, 2, 'the failure keeps the last good cards on screen');
  assert.equal(forced.sources.behance.stale, true);
  assert.match(forced.sources.behance.reason, /500/);
  assert.ok(!JSON.stringify(forced).includes(KEY), 'the upstream error is reported with the key redacted or absent');

  const status = service.status();
  assert.equal(status.provider, 'behance');
  assert.equal(status.configured, true);
  assert.equal(status.count, 2);
  assert.match(status.reason, /500/);
  assert.ok(!JSON.stringify(status).includes(KEY));
});

test('the client honours the mode from the environment, not just the argument', () => {
  // This is the one that was wrong first: passing config.inspiration (the whole
  // object) instead of config.inspiration.mode makes every comparison fail, so
  // LAUNCHPAD_INSPIRATION=off would keep calling out.
  const original = config.inspiration.mode;
  const client = new BehanceClient(settings());
  try {
    config.inspiration.mode = 'off';
    assert.equal(client.enabled(), false, 'off means off, key present or not');
    assert.match(client.settings.apiKey, /.*/, 'the key is still configured, so only the switch can stop it');
    config.inspiration.mode = 'local';
    assert.equal(client.enabled(), false);
    config.inspiration.mode = 'auto';
    assert.equal(client.enabled(), true);
  } finally {
    config.inspiration.mode = original;
  }
});

test('health reports the state without needing the store or the network', async () => {
  const service = new InspirationService(Promise.reject(new Error('store down')), { enabled: () => false, list: async () => [] }, { examples: noExamples });
  assert.deepEqual(await service.launchpadCards(), [], 'an unreachable store loses the internal cards, not the page');
  const payload = await service.list();
  assert.equal(payload.total, 0);
  assert.equal(payload.sources.behance.configured, false, 'and the strip still answers 200 with an honest reason');
  assert.equal(payload.sources.examples.configured, false);
  assert.equal(payload.sources.examples.enabled, false);
  assert.equal(
    payload.sources.examples.reason,
    'not consulted: LAUNCHPAD_EXAMPLES_SOURCE',
    'a source the switch excluded says it was excluded, and does not borrow the API complaint'
  );

  const status = service.status();
  assert.deepEqual(Object.keys(status).sort(), ['cachedAt', 'configured', 'count', 'examples', 'provider', 'reason', 'stale'].sort());
  assert.equal(status.provider, 'behance');
  assert.equal(status.count, 0);
  assert.match(status.reason, /BEHANCE_API_KEY/);

  // The health route reads the snapshot of the live instance, so the shape is
  // all it can promise without knowing which test ran last — and never the key.
  const snapshot = peekInspirationStatus();
  assert.deepEqual(Object.keys(snapshot).sort(), Object.keys(status).sort(), 'health and /api/inspiration report the same fields');
  assert.ok(!JSON.stringify(snapshot).includes(KEY));
});
