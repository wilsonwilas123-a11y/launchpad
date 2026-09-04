const test = require('node:test');
const assert = require('node:assert/strict');
const os = require('node:os');
const fs = require('node:fs');
const path = require('node:path');

const { JsonFileStore } = require('../src/db/stores');
const { AuthService } = require('../src/modules/auth/auth.service');
const { ProjectsService } = require('../src/modules/projects/projects.service');
const { GeneratorService } = require('../src/generator/generator.service');

/**
 * Service-level tests over the JSON file store: the same code paths the API
 * runs against Postgres, without needing a database in the test environment.
 */
function workspace(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'launchpad-test-'));
  const store = JsonFileStore.open(path.join(dir, 'db.json'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const auth = new AuthService(Promise.resolve(store));
  const projects = new ProjectsService(Promise.resolve(store), new GeneratorService(Promise.resolve(store)));
  return { store, auth, projects };
}

const idea = {
  type: 'product',
  name: 'Halcyon',
  description: 'A minimalist skincare line launched in Lagos. Clean white site, product list, newsletter.',
  selectedPlatforms: ['desktop'],
  selectedDesign: { id: 'editorial-02' },
  designDetails: { businessName: 'Halcyon', tagline: 'Slow skincare, properly', desiredSections: ['hero', 'waitlist'] },
};

test('auth: sign up, sign in, and a token that cannot be forged', async (t) => {
  const { auth } = workspace(t);
  const created = await auth.signup({ email: ' Founder@Example.com ', password: 'correct horse', name: 'Founder' });
  assert.equal(created.user.email, 'founder@example.com', 'emails are normalised');
  assert.ok(created.token && created.token.split('.').length >= 2, 'session token is opaque');

  await assert.rejects(() => auth.login({ email: 'founder@example.com', password: 'wrong' }), /password/i);
  const again = await auth.login({ email: 'founder@example.com', password: 'correct horse' });
  assert.equal(again.user.id, created.user.id);

  const me = await auth.userFromToken(again.token);
  assert.equal(me.email, 'founder@example.com');
  await assert.rejects(() => auth.userFromToken(again.token.slice(0, -2) + 'zz'), /sign in/i);
  await assert.rejects(() => auth.signup({ email: 'founder@example.com', password: 'another password' }), /already|taken|exists/i);
});

test('passwords are salted and never stored in the clear', async (t) => {
  const { store, auth } = workspace(t);
  const { user } = await auth.signup({ email: 'a@b.co', password: 'open sesame' });
  const row = await store.findUserById(user.id);
  const stored = JSON.stringify(row);
  assert.equal(stored.includes('open sesame'), false);
  assert.match(row.password || row.passwordHash || row.secret || '', /^s2:/);
});

test('generation → publish freezes a snapshot the builder cannot disturb', async (t) => {
  const { projects, store } = workspace(t);
  const user = (await store.insertUser({ id: 'u1', email: 'x@y.z', name: 'X' })) || (await store.findUserByEmail('x@y.z'));
  const project = await projects.create(user.id, idea);
  assert.equal(project.status, 'draft');
  assert.equal(project.statusLabel, 'Draft');

  const generated = await projects.generate(user.id, project.id, {});
  assert.ok(generated.spec.sections.length > 3);
  assert.equal(generated.status, 'ready');
  assert.equal(generated.statusLabel, 'Ready to publish');

  const published = await projects.publish(user.id, project.id, {});
  assert.equal(published.status, 'live');
  assert.match(published.publish.slug, /^halcyon(-[a-z0-9]{4,6})?$/);
  assert.equal(published.publish.displayUrl, `launchpad.app/${published.publish.slug}`);

  // Editing after going live must not touch the live site until the next publish.
  const headline = published.spec.sections[0].content.headline;
  const edited = await projects.update(user.id, project.id, {
    sections: published.spec.sections.map((s, i) => (i === 0 ? { ...s, content: { ...s.content, headline: 'Completely different' } } : s)),
  });
  assert.equal(edited.spec.sections[0].content.headline, 'Completely different');
  const live = await store.findProjectBySlug(published.publish.slug);
  assert.equal(live.publishedSnapshot.spec.sections[0].content.headline, headline, 'snapshot held the old copy');
  assert.equal(live.hasUnpublishedChanges, true);

  const republished = await projects.publish(user.id, project.id, {});
  assert.equal(republished.publish.slug, published.publish.slug, 'same URL, never a new one');
  assert.equal(republished.publish.revision, 2);
  assert.equal(republished.publish.firstTime, false);
  const live2 = await store.findProjectBySlug(published.publish.slug);
  assert.equal(live2.publishedSnapshot.spec.sections[0].content.headline, 'Completely different');

  // The public site is served from that snapshot, and only the owner sees the
  // builder affordance.
  const { PublicController } = require('../src/modules/public/public.controller');
  const publicSite = new PublicController(projects, Promise.resolve(store));
  const visitor = await publicSite.resolve(published.publish.slug, { user: null });
  assert.equal(visitor.sections[0].content.headline, 'Completely different');
  assert.equal(visitor.ownerView, null, 'a visitor gets zero builder chrome');
  const owner = await publicSite.resolve(published.publish.slug, { user: { id: user.id } });
  assert.equal(owner.ownerView.hasUnpublishedChanges, false, 'republished, so nothing pending');

  // Unpublishing takes the address offline but keeps it reserved for the owner.
  await projects.unpublish(user.id, project.id);
  await assert.rejects(() => publicSite.resolve(published.publish.slug, { user: null }), /does not exist/i, 'unpublished → the live URL 404s');
  const reserved = await store.findProjectBySlug(published.publish.slug);
  assert.equal(reserved.published, false);
  assert.equal(reserved.slug, published.publish.slug, 'the address stays with this launch');
});

test('two launches with the same name get different addresses', async (t) => {
  const { projects, store } = workspace(t);
  await store.insertUser({ id: 'u2', email: 'p@q.r', name: 'P' });
  const a = await projects.create('u2', idea);
  const b = await projects.create('u2', { ...idea, description: `${idea.description} A second take.` });
  await projects.generate('u2', a.id, {});
  await projects.generate('u2', b.id, {});
  const pa = await projects.publish('u2', a.id, {});
  const pb = await projects.publish('u2', b.id, { slug: pa.publish.slug });
  assert.notEqual(pa.publish.slug, pb.publish.slug);
  assert.match(pb.publish.slug, new RegExp(`^${pa.publish.slug.slice(0, 7)}-`), 'collision resolved with a suffix');
});

test('the command box result is persisted on the project, not only returned', async (t) => {
  const { projects, store } = workspace(t);
  await store.insertUser({ id: 'u4', email: 'edit@or.launch', name: 'Editor' });
  const project = await projects.create('u4', idea);
  await projects.generate('u4', project.id, {});
  const refined = await projects.refine('u4', project.id, { command: 'make it black and white' });
  const alsoRefined = await projects.refine('u4', project.id, 'add a countdown to 12 december');
  assert.equal(refined.changed, true, (refined.failures || []).join(','));
  assert.equal(alsoRefined.changed, true, (alsoRefined.failures || []).join(','));
  const fetched = await projects.get('u4', project.id);
  assert.equal(fetched.spec.theme.colors.background.toLowerCase(), '#000000');
  const history = (await projects.get('u4', project.id)).activity;
  assert.equal(history[0].kind, 'edited', 'the newest edit is on the record');
  assert.match(history[0].text, /Countdown/i, history[0].text);
  assert.ok(history.some((entry) => /Background set to #000000/i.test(entry.text)), history.map((h) => h.text).join(' | '));
});

test('a generated site paces its checklist to the measured run', async (t) => {
  const { projects, store } = workspace(t);
  await store.insertUser({ id: 'u5', email: 'pace@r.run', name: 'Pacer' });
  const project = await projects.create('u5', idea);
  const generated = await projects.generate('u5', project.id, {});
  assert.equal(generated.generation.pacing.steps.length, 8);
  assert.ok(generated.generation.elapsedMs >= 0);
  assert.ok(generated.generation.pacing.totalMs >= 1000);
});
