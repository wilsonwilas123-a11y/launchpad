#!/usr/bin/env node
/**
 * End-to-end walk of the core product loop against a running API.
 *
 *   npm run dev          # in one terminal  (API on :4000)
 *   npm run e2e          # in another
 *
 * Plain Node on purpose: it runs the same on Windows, macOS and Linux with no
 * bash, curl or python involved. Pass a different target with
 * API=http://host:4100/api. A browser can still use localhost:5173 —
 * only these scripts prefer the explicit IPv4 address.
 *
 * The steps are the product loop, in order: health → sign in → create →
 * upload → generate → refine → publish → a visitor's form → re-publish on the
 * same address → a slug collision → delete.
 */
const API = (process.env.API || 'http://127.0.0.1:4000/api').replace(/\/$/, '');
const PNG =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg==';

let token = '';
const failures = [];

async function call(route, { method = 'GET', body, raw = false, anon = false } = {}) {
  const response = await fetch(`${API}${route}`, {
    method,
    headers: {
      ...(body ? { 'content-type': 'application/json' } : {}),
      // `anon` is the whole point of the visitor checks: no token, no owner view.
      ...(token && !anon ? { authorization: `Bearer ${token}` } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch((error) => {
    throw new Error(`Could not reach ${API}${route} — is the API running? (${error.message})`);
  });
  if (raw) return { status: response.status, payload: null };
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${route} → ${response.status} ${payload?.message || text.slice(0, 200)}`);
  return { status: response.status, payload };
}

const get = (route, options) => call(route, options).then((r) => r.payload);
const anonGet = (route) => call(route, { anon: true }).then((r) => r.payload);
const step = (label) => console.log(`\n── ${label}`);
const say = (text) => console.log(`   ${text}`);
const check = (label, condition, detail = '') => {
  if (condition) console.log(`   ✓ ${label}${detail ? ` — ${detail}` : ''}`);
  else {
    failures.push(label);
    console.log(`   ✗ ${label}${detail ? ` — ${detail}` : ''}`);
  }
};

try {
  step('health');
  const health = await get('/health');
  const aiName = health.ai.model ? `${health.ai.provider}:${health.ai.model}` : health.ai.provider;
  say(`store=${health.database} · ai=${aiName}${health.ai.endpoint ? `@${health.ai.endpoint}` : ''} · reachable=${health.ai.reachable} · google=${health.auth?.google ?? 'unknown'}`);
  if (!health.ai.reachable && health.ai.reason) say(`model server: ${String(health.ai.reason).slice(0, 140)}`);
  check('the API answers', health.ok === true, health.service);

  step('sign-in methods');
  const methods = await get('/auth/google/status');
  say(`google=${methods.enabled ? `on (${methods.redirect ? 'button + redirect flow' : 'browser button only'})` : 'not configured'}`);
  check('the status route answers without a token', typeof methods.enabled === 'boolean');
  check('a missing client id never advertises a broken button', !methods.enabled || Boolean(methods.clientId), JSON.stringify(methods));
  // `raw` because a refusal is the expected answer here, and call() throws on
  // a non-2xx by design.
  const refused = await call('/auth/google', { method: 'POST', body: {}, anon: true, raw: true });
  check('a credential-less Google sign-in is refused', refused.status === 401, `HTTP ${refused.status}`);
  const forged = await call('/auth/google', { method: 'POST', body: { credential: 'aaa.bbb.ccc' }, anon: true, raw: true });
  check('a forged ID token gets nobody in', forged.status === 401, `HTTP ${forged.status}`);
  const bounced = await call('/auth/google/callback?code=nope&state=made-up', { anon: true, raw: true });
  check('an unstarted redirect flow is not completed', bounced.status === 401, `HTTP ${bounced.status}`);

  step('sign in (creates the demo account if the database is empty)');
  const session = await call('/auth/demo', { method: 'POST', body: {} }).then((r) => r.payload);
  token = session.token;
  check('token acquired', Boolean(token), `${String(token).length} chars for ${session.user.email}`);

  step('dashboard list');
  const list = await get('/projects');
  say(`${list.items.length} projects: ${list.items.map((item) => `${item.name}(${item.status})`).join(', ') || 'none'}`);

  step('clear leftovers from previous runs');
  for (const item of list.items.filter((entry) => entry.name === 'KRO' || entry.name === 'KRO second')) {
    await call(`/projects/${item.id}`, { method: 'DELETE' });
    say(`removed stale ${item.name}`);
  }

  step('create draft (type + platform + design + description)');
  const created = await call('/projects', {
    method: 'POST',
    body: {
      type: 'product',
      name: 'KRO',
      description:
        'I am launching a premium sneaker brand called KRO. Futuristic black website with huge product photography, a countdown to the drop, product information and a waitlist.',
      selectedPlatforms: ['mobile', 'desktop'],
      selectedDesign: { id: 'futuristic-04' },
      designDetails: {
        businessName: 'KRO',
        tagline: 'Made in runs of 200',
        desiredSections: ['hero', 'countdown', 'productShowcase', 'waitlist'],
        excludedSections: [],
      },
      visualDirection: 'Futuristic, black, cinematic',
    },
  }).then((r) => r.payload);
  const id = created.id;
  say(`project ${id}`);
  const draft = await get(`/projects/${id}`);
  check('draft exists with a status label', draft.name === 'KRO' && Boolean(draft.statusLabel), `${draft.status} / ${draft.statusLabel}`);

  step('upload an asset (1x1 png as a data url)');
  const uploaded = await call(`/projects/${id}/assets`, {
    method: 'POST',
    body: {
      files: [{ filename: 'kro-runner.png', dataUrl: PNG, slot: 'product', description: 'KRO Runner sneaker, hero product shot', caption: 'matte black, glow sole' }],
    },
  }).then((r) => r.payload);
  const asset = uploaded.assets[0];
  check('file stored and read', uploaded.added === 1 && Boolean(asset.url), `${asset.filename} → ${asset.assetCategory} (suggests ${asset.suggestedSection})`);

  step('generate');
  const generated = await call(`/projects/${id}/generate`, { method: 'POST', body: {} }).then((r) => r.payload);
  const { generation, spec } = generated;
  say(`provider=${generation.provider} elapsed=${generation.elapsedMs}ms pacing=${generation.pacing.totalMs}ms status=${generated.status}`);
  say(`${spec.name} · ${spec.sections.length} sections: ${spec.sections.map((section) => section.type).join(' → ')}`);
  say(`hero: ${spec.sections[0].content.headline}`);
  say(`accent=${spec.theme.colors.accent} bg=${spec.theme.colors.background} platform=${spec.platform.label}`);
  say(`asset placement: ${JSON.stringify(spec.assetMap.map((entry) => [entry.filename, entry.section]))}`);
  check('sections were built', spec.sections.length >= 4, `${spec.sections.length} sections`);
  check('the uploaded image was placed somewhere', (spec.assetMap || []).length > 0);
  check('a master prompt is exposed', Boolean(generation.masterPrompt), `${String(generation.masterPrompt).length} chars`);

  step('natural-language edit: colours + countdown date');
  const refined = await call(`/projects/${id}/refine`, {
    method: 'POST',
    body: { command: 'Make the colors black and purple and add a countdown to 12 December' },
  }).then((r) => r.payload);
  say(`source=${refined.source} changed=${refined.changed} summary=${refined.summary}`);
  say(`read as: ${refined.readAs ?? '—'}`);
  say(`accent=${refined.spec.theme.colors.accent}`);
  const countdown = refined.spec.sections.find((section) => section.type === 'countdown');
  say(`countdown target: ${countdown?.content.targetIso || 'MISSING'}`);
  check('the command changed the spec', refined.changed === true, refined.summary);
  check('the countdown now has a real date', Boolean(countdown?.content.targetIso));

  step('publish → automatic URL');
  const published = await call(`/projects/${id}/publish`, { method: 'POST', body: {} }).then((r) => r.payload);
  const publish = published.publish;
  say(`status=${published.status} url=${publish.displayUrl} for: ${publish.availableOn} firstTime=${publish.firstTime}`);
  const slug = publish.slug;
  const liveUrl = publish.url || published.liveUrl;
  check('the project is live', published.status === 'live' && Boolean(liveUrl), liveUrl);
  check('the snapshot is what a visitor gets', Boolean(published.publish && published.spec?.sections?.length), `${published.spec?.sections?.length} sections in the spec`);

  step('public site is live and independent of the builder');
  const site = await anonGet(`/public/${slug}`);
  say(`sections=${site.sections.length} name=${site.name} rev=${site.revision} ownerView=${JSON.stringify(site.ownerView)}`);
  check('a visitor gets the same number of sections', site.sections.length === refined.spec.sections.length);
  check('no builder affordances for visitors', site.ownerView === null);
  const asOwner = await get(`/public/${slug}`);
  check('the owner is offered the way back into the builder', asOwner.ownerView?.builderPath === `/builder/${id}`, asOwner.ownerView?.builderPath);
  const missing = await call('/public/definitely-not-here-42', { raw: true, anon: true });
  check('unknown slugs 404', missing.status === 404, `HTTP ${missing.status}`);

  step('visitor submits the waitlist form');
  const signup = await call(`/public/${slug}/signups`, { method: 'POST', anon: true, body: { kind: 'waitlist', email: 'early.fan@example.com' } }).then((r) => r.payload);
  say(`captured: ${signup.kind} position ${signup.position}`);
  const signups = await get(`/projects/${id}/signups`);
  check('the owner sees the capture', signups.total >= 1, `${signups.total} captures`);

  step('re-publish updates the SAME url (no new link)');
  const republished = await call(`/projects/${id}/publish`, { method: 'POST', body: {} }).then((r) => r.payload);
  say(`slug still ${republished.publish.slug} revision ${republished.publish.revision}`);
  check('the address did not change', republished.publish.slug === slug, `revision ${republished.publish.revision}`);

  step('slug collision is auto-resolved');
  const second = await call('/projects', { method: 'POST', body: { type: 'product', name: 'KRO second', description: 'A second launch also called KRO.' } }).then((r) => r.payload);
  await call(`/projects/${second.id}/generate`, { method: 'POST', body: {} });
  const collided = await call(`/projects/${second.id}/publish`, { method: 'POST', body: { slug } }).then((r) => r.payload);
  say(`requested ${slug} → got ${collided.publish.slug}`);
  check('the clash was resolved without stealing the first URL', collided.publish.slug !== slug);

  step('unpublish keeps the address reserved');
  await call(`/projects/${id}/unpublish`, { method: 'POST', body: {} });
  const offline = await call(`/public/${slug}`, { raw: true });
  check('the page is offline', offline.status === 404, `HTTP ${offline.status}`);
  const reserved = await get(`/projects/${id}`);
  check('the slug is still yours', reserved.slug === slug, slug);

  step('cleanup');
  check('second project deleted', (await call(`/projects/${second.id}`, { method: 'DELETE' }).then((r) => r.payload)).ok === true);
  check('project deleted', (await call(`/projects/${id}`, { method: 'DELETE' }).then((r) => r.payload)).ok === true);
  const afterDelete = await call(`/public/${slug}`, { raw: true });
  check('its published page went with it', afterDelete.status === 404);
} catch (error) {
  failures.push(error.message);
  console.log(`\n   ✗ ${error.message}`);
}

console.log(failures.length ? `\n${failures.length} step(s) failed.` : '\ndone — the loop holds end to end.');
process.exit(failures.length ? 1 : 0);
