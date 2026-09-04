#!/usr/bin/env node
/**
 * Seeds (idempotently) the demo account with the four reference launches,
 * running each one through the real generation pipeline so the data is genuine:
 * master prompt → compile → asset assignment → publish snapshot.
 *
 *   npm run seed            # PostgreSQL from DATABASE_URL
 *   LAUNCHPAD_STORE=file npm run seed
 */
require('reflect-metadata');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { getStore } = require('../db');
const { compileSpec, slugify } = require('../generator/compile');
const { buildMasterPrompt } = require('../generator/prompt');
const { designById } = require('../catalog/designs');
const { hydrateAsset } = require('../generator/assets');
const { DEMO_PROJECTS } = require('./projects');

const ASSET_SOURCE_DIR = path.resolve(__dirname, '../../../../assets/img');
const DEMO_EMAIL = 'demo@launchpad.app';
const DEMO_PASSWORD = 'launchpad';
const scrypt = (password, salt) => crypto.scryptSync(password, salt, 32).toString('hex');

function copyImage(file) {
  const source = path.join(ASSET_SOURCE_DIR, file);
  if (!fs.existsSync(source)) {
    console.warn(`[seed] missing image ${source} — asset skipped`);
    return null;
  }
  const ext = path.extname(file);
  const id = crypto.randomUUID();
  const target = path.join(config.uploadsDir, `${id}${ext}`);
  fs.mkdirSync(path.dirname(target), { recursive: true });
  fs.copyFileSync(source, target);
  return { id, filename: file, path: target, url: `/uploads/${path.basename(target)}`, size: fs.statSync(target).size, mime: ext === '.png' ? 'image/png' : 'image/jpeg' };
}

async function main() {
  const store = await getStore();
  console.log(`[seed] store: ${store.driver}`);

  let user = await store.findUserByEmail(DEMO_EMAIL);
  if (!user) {
    const salt = crypto.randomBytes(8).toString('hex');
    user = await store.insertUser({
      id: crypto.randomUUID(),
      email: DEMO_EMAIL,
      name: 'Demo Founder',
      passwordHash: `s2:${salt}:${scrypt(DEMO_PASSWORD, salt)}`,
      plan: 'pro',
      avatarSeed: DEMO_EMAIL,
    });
    console.log(`[seed] created demo user ${DEMO_EMAIL} / ${DEMO_PASSWORD}`);
  }

  const existing = await store.listProjectsByUser(user.id);
  for (const project of existing) await store.deleteProject(project.id);
  if (existing.length) console.log(`[seed] cleared ${existing.length} previous demo projects`);

  const created = [];
  for (const demo of DEMO_PROJECTS) {
    const now = new Date().toISOString();
    const assets = demo.assets
      .map((entry) => {
        const image = copyImage(entry.file);
        if (!image) return null;
        return hydrateAsset({ ...image, ...entry, name: entry.name || undefined, createdAt: now }, demo.type);
      })
      .filter(Boolean);

    const design = designById(demo.designId);
    const details = {
      businessName: demo.name,
      tagline: demo.tagline,
      desiredSections: demo.desiredSections,
      excludedSections: [],
      extraNotes: demo.extraNotes || '',
      audience: demo.targetAudience || '',
      goal: demo.goal || '',
      visualDirection: demo.visualDirection || '',
      platforms: demo.selectedPlatforms || ['both'],
    };
    const masterPrompt = buildMasterPrompt(demo.description, { category: demo.type, styleTags: design.styleTags, layoutHints: design.layoutHints, colorPalette: design.colorPalette }, details);

    const project = {
      id: crypto.randomUUID(),
      userId: user.id,
      name: demo.name,
      type: demo.type,
      description: demo.description,
      visualDirection: demo.visualDirection,
      targetAudience: demo.targetAudience,
      goal: demo.goal,
      selectedPlatforms: demo.selectedPlatforms,
      selectedDesign: { id: design.id, name: design.name, styleTags: design.styleTags, colorPalette: design.colorPalette, layoutHints: design.layoutHints, thumbnailUrl: design.thumbnailUrl },
      designDetails: details,
      assets,
      masterPrompt,
      status: 'draft',
      published: false,
      slug: null,
      publishedSnapshot: null,
      publishedAt: null,
      publishedRevision: 0,
      hasUnpublishedChanges: false,
      activity: [{ at: now, kind: 'created', text: 'Seeded demo launch' }],
      createdAt: now,
      updatedAt: now,
    };

    if (demo.status !== 'draft') {
      const spec = compileSpec({
        description: demo.description,
        websiteType: demo.type,
        design,
        details,
        assets,
        visualDirection: demo.visualDirection,
        targetAudience: demo.targetAudience,
        goal: demo.goal,
        platform: { targets: demo.selectedPlatforms },
      });
      spec.meta.generatedBy = 'launchpad-compiler (seed)';
      spec.meta.masterPrompt = masterPrompt;
      spec.meta.designName = design.name;
      project.spec = spec;
      project.theme = spec.theme;
      project.sections = spec.sections;
      project.status = demo.status === 'live' ? 'live' : 'ready';
      if (demo.status === 'live') {
        const base = slugify(demo.slug || spec.name);
        const taken = await store.findProjectBySlug(base);
        project.slug = taken ? `${base}-${crypto.randomBytes(2).toString('hex')}` : base;
        project.published = true;
        project.publishedAt = now;
        project.publishedRevision = 1;
        project.publishedSnapshot = {
          spec,
          name: spec.name,
          type: demo.type,
          tagline: spec.tagline,
          publishedAt: now,
          revision: 1,
          platform: spec.platform,
          assets: assets.map(({ id, filename, url, assetCategory, selectedSection }) => ({ id, filename, url, assetCategory, selectedSection })),
        };
        project.activity.unshift({ at: now, kind: 'published', text: `Live at ${config.publicHost}/${project.slug}` });
      } else {
        project.hasUnpublishedChanges = false;
      }
      project.ai = { provider: 'local', model: null, elapsedMs: 12, fallbackReason: 'seeded deterministically' };
    }

    await store.insertProject(project);
    created.push(project);
    console.log(
      `[seed] ${String(project.name).padEnd(12)} ${project.status.padEnd(8)} ${project.slug ? `${config.publicHost}/${project.slug}` : '(not published)'}  ${project.sections ? project.sections.length : 0} sections, ${assets.length} assets`,
    );
  }

  // A few real signups so the builder's capture counters are not empty.
  const nova = created.find((p) => p.slug === 'nova');
  if (nova) {
    const leads = [
      ['waitlist', 'ada@offgrid.studio'],
      ['waitlist', 'tobi@northe.st'],
      ['waitlist', 'zainab.b@gmail.com'],
      ['newsletter', 'press@techcabal.ng'],
      ['waitlist', 'kunle@yabacream.co'],
    ];
    for (const [kind, email] of leads) {
      await store.insertSignup({ id: crypto.randomUUID(), projectId: nova.id, kind, email, payload: { sourceUrl: '/nova', note: kind === 'waitlist' ? 'Wants the first run' : 'Press enquiry' } });
    }
    console.log(`[seed] recorded ${leads.length} signups against nova`);
  }

  console.log('\n[seed] done. Demo login: demo@launchpad.app / launchpad');
  if (store.close) await store.close();
}

main().catch((error) => {
  console.error('[seed] failed:', error && error.stack ? error.stack : error);
  process.exit(1);
});
