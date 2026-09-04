const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { BadRequestException, NotFoundException, ConflictException } = require('@nestjs/common');
const { config } = require('../../config');
const { compileSpec, slugify } = require('../../generator/compile');
const { assignAssets, hydrateAsset } = require('../../generator/assets');
const { validateSpec } = require('../../generator/normalize');
const { pacingFor } = require('../../generator/stages');

const STATUSES = ['draft', 'generating', 'ready', 'publishing', 'live'];
const EDITABLE = [
  'name', 'type', 'description', 'visualDirection', 'targetAudience', 'goal',
  'selectedPlatforms', 'selectedDesign', 'designDetails', 'assets', 'spec', 'theme', 'sections', 'status',
];

/** Characters that read well in a URL: no look-alikes (0/o, 1/l). */
const SUFFIX_ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';

class ProjectsService {
  constructor(store, generator) {
    this.storePromise = store;
    this.generator = generator;
  }

  async db() {
    if (!this.database) this.database = await this.storePromise;
    return this.database;
  }

  stamp(project, extra = {}) {
    return { ...project, ...extra, updatedAt: new Date().toISOString() };
  }

  async create(userId, input = {}) {
    const database = await this.db();
    const description = String(input.description || '').trim();
    const type = input.type || 'other';
    const platforms = normalisePlatforms(input.selectedPlatforms || input.platform);
    const name = (input.name && String(input.name).trim()) || derivedName(description, type);
    const now = new Date().toISOString();
    const project = {
      id: crypto.randomUUID(),
      userId,
      name,
      type,
      description,
      visualDirection: input.visualDirection || null,
      targetAudience: input.targetAudience || null,
      goal: input.goal || null,
      selectedPlatforms: platforms,
      selectedDesign: input.selectedDesign || null,
      designDetails: input.designDetails || { desiredSections: [], excludedSections: [] },
      assets: [],
      spec: null,
      theme: null,
      sections: [],
      status: 'draft',
      published: false,
      slug: null,
      publishedAt: null,
      publishedRevision: 0,
      hasUnpublishedChanges: false,
      masterPrompt: null,
      ai: null,
      activity: [{ at: now, kind: 'created', text: 'Draft created' }],
      createdAt: now,
      updatedAt: now,
    };
    if (description || input.selectedDesign) {
      project.masterPrompt = this.generator.masterPromptFor(project, this.generator.prepare(project)).prompt;
    }
    return this.withDerived(await database.insertProject(project));
  }

  async listForUser(userId) {
    const database = await this.db();
    const projects = await database.listProjectsByUser(userId);
    return projects.map((project) => this.withDerived(project));
  }

  async get(userId, id) {
    const database = await this.db();
    const project = await database.findProject(id);
    if (!project) throw new NotFoundException('That launch does not exist.');
    if (project.userId !== userId) throw new NotFoundException('That launch belongs to someone else.');
    return this.withDerived(project);
  }

  async getOwned(userId, id) {
    return this.get(userId, id);
  }

  async update(userId, id, patch = {}) {
    const database = await this.db();
    const project = await this.get(userId, id);
    const next = { ...project };

    for (const key of EDITABLE) {
      if (patch[key] === undefined) continue;
      next[key] = patch[key];
    }
    if (patch.selectedPlatforms) next.selectedPlatforms = normalisePlatforms(patch.selectedPlatforms);
    if (next.assets && next.assets.length) {
      next.assets = next.assets.map((a) => hydrateAsset(a, next.type));
    }
    // theme + sections live inside spec; keep both views consistent (Section 22).
    if (patch.theme || patch.sections || patch.nav || patch.platform) {
      const spec = { ...(next.spec || {}) };
      if (patch.theme) spec.theme = mergeThemePatch(spec.theme || {}, patch.theme);
      // nav + platform are whole-object patches from the builder's controls;
      // merging here keeps them from clobbering keys the user did not touch.
      if (patch.nav) spec.nav = { ...(spec.nav || {}), ...patch.nav };
      if (patch.platform) spec.platform = { ...(spec.platform || {}), ...patch.platform };
      if (patch.sections) {
        spec.sections = normaliseSections(patch.sections, spec.sections || []);
        const hero = spec.sections.find((s) => s.type === 'hero');
        if (hero) {
          spec.headline = hero.content.headline;
          spec.subheadline = hero.content.subheadline;
        }
      }
      if (patch.name !== undefined) spec.name = patch.name;
      if (patch.tagline !== undefined) spec.tagline = patch.tagline;
      if (patch.assets) spec.assets = patch.assets;
      const validation = validateSpec(spec);
      if (!validation.ok) throw new BadRequestException(`That change would break the page: ${validation.errors.join(', ')}`);
      assignAssets(spec, spec.assets || next.assets || []);
      next.spec = spec;
      next.theme = spec.theme;
      next.sections = spec.sections;
    } else if (patch.assets) {
      if (next.spec) {
        next.spec = { ...next.spec, assets: next.assets };
        assignAssets(next.spec, next.assets);
      }
    }
    if (patch.status && STATUSES.includes(patch.status)) next.status = patch.status;

    const wasLive = project.published;
    next.hasUnpublishedChanges = wasLive ? true : Boolean(next.hasUnpublishedChanges);
    if (patch.assetEdits) next.assets = applyAssetEdits(next.assets || [], patch.assetEdits, next.type);

    const saved = await database.updateProject(this.stamp(next));
    return this.withDerived(saved);
  }

  /** Re-runs asset → section mapping after the user moves an image. */
  async remapAssets(userId, id) {
    const database = await this.db();
    const project = await this.get(userId, id);
    if (!project.spec) throw new BadRequestException('Generate the website first.');
    const spec = JSON.parse(JSON.stringify(project.spec));
    spec.sections.forEach((section) => {
      section.assets = [];
    });
    assignAssets(spec, project.assets || []);
    const saved = await database.updateProject(this.stamp({ ...project, spec, hasUnpublishedChanges: project.published }));
    return this.withDerived(saved);
  }

  async remove(userId, id) {
    const database = await this.db();
    const project = await this.get(userId, id);
    await Promise.all((project.assets || []).map((asset) => this.deleteAssetFile(asset)));
    await database.deleteProject(id);
    return { ok: true };
  }

  async deleteAssetFile(asset) {
    if (!asset || !asset.path) return;
    try {
      if (fs.existsSync(asset.path)) fs.unlinkSync(asset.path);
    } catch {
      /* the row is gone, the file can sweep itself later */
    }
  }

  /* ----------------------------------------------------------- generation */

  async generate(userId, id, options = {}) {
    const database = await this.db();
    const project = await this.get(userId, id);
    if (!project.description && !project.name) throw new BadRequestException('Describe what you are launching first.');
    await database.updateProject({ ...project, status: 'generating', startedAt: new Date().toISOString() });

    let result;
    try {
      result = await this.generator.generate(project, options);
    } catch (error) {
      await database.updateProject(this.stamp({ ...project, status: 'draft', error: error.message }));
      throw error;
    }

    const spec = result.spec;
    const activity = [
      {
        at: new Date().toISOString(),
        kind: 'generated',
        text:
          result.provider === 'ollama'
            ? `Generated with ${result.model} in ${(result.elapsedMs / 1000).toFixed(1)}s`
            : `Compiled locally in ${result.elapsedMs}ms${result.fallbackReason ? ` (${result.fallbackReason})` : ''}`,
      },
      ...(project.activity || []),
    ].slice(0, 40);

    const saved = await database.updateProject(
      this.stamp({
        ...project,
        name: spec.name || project.name,
        spec,
        theme: spec.theme,
        sections: spec.sections,
        status: 'ready',
        masterPrompt: result.masterPrompt,
        ai: { provider: result.provider, model: result.model, elapsedMs: result.elapsedMs, fallbackReason: result.fallbackReason, report: spec.meta.aiReport },
        hasUnpublishedChanges: project.published,
        activity,
      }),
    );
    return { ...this.withDerived(saved), generation: { provider: result.provider, model: result.model, elapsedMs: result.elapsedMs, fallbackReason: result.fallbackReason, pacing: result.pacing, masterPrompt: result.masterPrompt, design: result.design } };
  }

  /** Preview without persisting — powers the wizard's live "what I read so far". */
  async preview(userId, input) {
    const result = this.generator.preview({
      description: input.description,
      websiteType: input.type || 'other',
      designId: input.designId,
      design: input.selectedDesign,
      details: input.designDetails,
      platform: { targets: normalisePlatforms(input.selectedPlatforms) },
      assets: input.assets || [],
    });
    return result;
  }

  async refine(userId, id, command, options = {}) {
    // Accepts either ("add a countdown") or ({ command: "add a countdown" }) so a
    // client cannot send the edit into the void by wrapping it one level too deep.
    if (command && typeof command === 'object') {
      options = { ...command, ...options };
      command = command.command;
    }
    const database = await this.db();
    const project = await this.get(userId, id);
    if (!project.spec) throw new BadRequestException('Nothing to edit yet — generate the website first.');
    const trimmed = String(command || '').trim();
    if (trimmed.length < 3) throw new BadRequestException('Tell me what to change, e.g. “add a countdown”.');

    const result = await this.generator.refine(project, trimmed, options);
    if (result.changed) {
      const activity = [{ at: new Date().toISOString(), kind: 'edited', text: `${result.summary} (${result.source})` }, ...(project.activity || [])].slice(0, 40);
      await database.updateProject(
        this.stamp({
          ...project,
          spec: result.spec,
          theme: result.spec.theme,
          sections: result.spec.sections,
          name: result.spec.name || project.name,
          hasUnpublishedChanges: project.published || project.hasUnpublishedChanges,
          activity,
          ai: { ...(project.ai || {}), lastEdit: { source: result.source, model: result.model, elapsedMs: result.elapsedMs, at: new Date().toISOString() } },
        }),
      );
    }
    return { ...result, project: this.withDerived(await database.findProject(id)) };
  }

  /* ----------------------------------------------------------- publishing */

  async publish(userId, id, options = {}) {
    const database = await this.db();
    const project = await this.get(userId, id);
    if (!project.spec) throw new BadRequestException('Generate the website before publishing.');
    const validation = validateSpec(project.spec);
    if (!validation.ok) throw new BadRequestException(`The page is not publishable yet: ${validation.errors.join(', ')}`);

    await database.updateProject({ ...project, status: 'publishing' });

    const requested = options.slug ? slugify(options.slug) : project.slug || slugify(project.spec.name || project.name);
    const slug = await this.reserveSlug(database, requested, project.id);
    const publishedAt = new Date().toISOString();
    const publishedSnapshot = {
      spec: project.spec,
      name: project.spec.name || project.name,
      type: project.type,
      tagline: project.spec.tagline,
      publishedAt,
      revision: (project.publishedRevision || 0) + 1,
      platform: project.spec.platform,
      assets: (project.assets || []).map(({ id: assetId, filename, url, assetCategory, selectedSection }) => ({ id: assetId, filename, url, assetCategory, selectedSection })),
    };

    const saved = await database.updateProject(
      this.stamp({
        ...project,
        slug,
        published: true,
        status: 'live',
        publishedAt,
        publishedSnapshot,
        publishedRevision: publishedSnapshot.revision,
        hasUnpublishedChanges: false,
        activity: [{ at: publishedAt, kind: 'published', text: `Live at ${config.publicHost}/${slug}` }, ...(project.activity || [])].slice(0, 40),
      }),
    );

    return {
      ...this.withDerived(saved),
      justPublished: true,
      publish: {
        slug,
        path: `/${slug}`,
        url: `https://${config.publicHost}/${slug}`,
        displayUrl: `${config.publicHost}/${slug}`,
        revision: publishedSnapshot.revision,
        firstTime: !project.published,
        availableOn: project.spec.platform ? project.spec.platform.label : 'Mobile + Laptop',
        at: publishedAt,
      },
    };
  }

  async reserveSlug(database, base, projectId) {
    const clean = (base || 'launch').slice(0, 32) || 'launch';
    const taken = async (candidate) => {
      const owner = await database.findProjectBySlug(candidate);
      return owner && owner.id !== projectId ? owner : null;
    };
    if (!(await taken(clean))) return clean;
    for (let attempt = 0; attempt < 8; attempt++) {
      const candidate = `${clean}-${randomSuffix(4)}`;
      if (!(await taken(candidate))) return candidate;
    }
    return `${clean}-${randomSuffix(7)}`;
  }

  async unpublish(userId, id) {
    const database = await this.db();
    const project = await this.get(userId, id);
    if (!project.published) throw new BadRequestException('That launch is not live.');
    const saved = await database.updateProject(
      this.stamp({ ...project, published: false, status: 'ready', publishedSnapshot: null, activity: [{ at: new Date().toISOString(), kind: 'unpublished', text: 'Taken offline' }, ...(project.activity || [])].slice(0, 40) }),
    );
    return this.withDerived(saved);
  }

  /* --------------------------------------------------------------- assets */

  async addAssets(userId, id, files = []) {
    const database = await this.db();
    const project = await this.get(userId, id);
    const saved = [];
    for (const file of files) {
      saved.push(await this.saveOne(project, file));
    }
    const assets = [...(project.assets || []), ...saved];
    const updated = await database.updateProject(this.stamp({ ...project, assets }));
    const derived = this.withDerived(updated);
    return { assets: derived.assets, added: saved.length, project: derived };
  }

  async saveOne(project, file = {}) {
    const database = await this.db();
    const filename = path.basename(String(file.filename || 'asset').replace(/[^\w.\- ]+/g, '_')).slice(0, 80) || 'asset.png';
    const id = crypto.randomUUID();
    let stored;
    if (file.dataUrl) {
      const match = /^data:([\w/+.-]+);base64,(.*)$/s.exec(file.dataUrl);
      if (!match) throw new BadRequestException(`${filename} is not a readable data URL.`);
      const mime = match[1];
      const buffer = Buffer.from(match[2], 'base64');
      if (buffer.length > 25 * 1024 * 1024) throw new BadRequestException(`${filename} is over the 25 MB limit.`);
      const ext = extensionFor(mime, filename);
      const target = path.join(config.uploadsDir, `${id}${ext}`);
      fs.mkdirSync(path.dirname(target), { recursive: true });
      fs.writeFileSync(target, buffer);
      stored = { id, filename, mime, size: buffer.length, path: target, url: `/uploads/${path.basename(target)}` };
    } else if (file.url) {
      if (!/^https?:\/\//i.test(file.url)) throw new BadRequestException('Remote assets must be http(s) URLs.');
      stored = { id, filename, mime: file.mime || guessMime(filename), size: 0, url: file.url, remote: true };
    } else {
      throw new BadRequestException(`${filename || 'asset'}: nothing to save (no dataUrl or url).`);
    }
    const asset = hydrateAsset(
      {
        ...stored,
        name: file.name || undefined,
        description: file.description || '',
        caption: file.caption || '',
        assetCategory: file.slot || file.assetCategory || undefined,
        selectedSection: file.selectedSection || null,
        originalSlot: file.slot || null,
        addedAt: new Date().toISOString(),
      },
      project.type,
    );
    void database;
    return asset;
  }

  async updateAsset(userId, id, assetId, patch = {}) {
    const database = await this.db();
    const project = await this.get(userId, id);
    const assets = (project.assets || []).map((asset) => (asset.id === assetId ? hydrateAsset({ ...asset, ...patch }, project.type) : asset));
    const updated = await database.updateProject(this.stamp({ ...project, assets }));
    return this.withDerived(updated);
  }

  async removeAsset(userId, id, assetId) {
    const database = await this.db();
    const project = await this.get(userId, id);
    const target = (project.assets || []).find((a) => a.id === assetId);
    if (!target) throw new NotFoundException('That asset is not in this project.');
    await this.deleteAssetFile(target);
    const assets = (project.assets || []).filter((a) => a.id !== assetId);
    const spec = project.spec ? JSON.parse(JSON.stringify(project.spec)) : null;
    if (spec) {
      assets.forEach(() => {});
      spec.sections.forEach((section) => {
        section.assets = (section.assets || []).filter((a) => a !== assetId);
        const strip = (value) => (value === assetId ? null : value);
        if (section.content) {
          section.content.imageAssetId = strip(section.content.imageAssetId);
          section.content.artworkAssetId = strip(section.content.artworkAssetId);
          section.content.portraitAssetId = strip(section.content.portraitAssetId);
          section.content.posterAssetId = strip(section.content.posterAssetId);
          if (Array.isArray(section.content.assetIds)) section.content.assetIds = section.content.assetIds.filter((a) => a !== assetId);
          if (Array.isArray(section.content.products)) section.content.products.forEach((p) => (p.imageAssetId = strip(p.imageAssetId)));
          if (Array.isArray(section.content.items)) section.content.items.forEach((p) => (p.imageAssetId = strip(p.imageAssetId)));
        }
      });
      spec.logoAssetId = strip(spec.logoAssetId, assetId);
      assignAssets(spec, assets);
    }
    const updated = await database.updateProject(this.stamp({ ...project, assets, spec, theme: spec ? spec.theme : project.theme, sections: spec ? spec.sections : project.sections }));
    return this.withDerived(updated);
  }

  /* -------------------------------------------------------------- signups */

  async recordSignup(projectId, payload = {}) {
    const database = await this.db();
    const kind = ['waitlist', 'newsletter', 'contact', 'preSave', 'ticket'].includes(payload.kind) ? payload.kind : 'waitlist';
    const email = payload.email ? String(payload.email).trim().toLowerCase() : null;
    if (email && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) throw new BadRequestException('That email address does not look right.');
    const row = await database.insertSignup({
      id: crypto.randomUUID(),
      projectId,
      kind,
      email,
      payload: { ...payload, sourceUrl: payload.sourceUrl || null, at: new Date().toISOString() },
    });
    return { ok: true, kind, id: row.id, email: row.email };
  }

  async signups(userId, id) {
    const database = await this.db();
    const project = await this.get(userId, id);
    const rows = await database.listSignups(project.id, 40);
    return { total: await database.countSignups(project.id), rows };
  }

  /**
   * Adds the fields every surface reads (URLs, status pills, progress, the
   * dashboard thumbnail). Pure and synchronous on purpose: it is called on the
   * way out of almost every handler.
   */
  withDerived(project) {
    const derived = decorate(project, config.publicHost);
    // Every surface that shows a project shows a render of it. The thumbnail is
    // derived from the real theme and section order, not stock artwork.
    if (derived.spec && !derived.thumbnail) {
      const { siteletThumb } = require('../../catalog/sitelet');
      const colors = derived.spec.theme.colors;
      const hero = derived.spec.sections.find((s) => s.type === 'hero');
      derived.thumbnail = siteletThumb({
        palette: [colors.background, colors.text, colors.accent],
        kind: hero && hero.content.layout === 'split' ? 'hero-split' : derived.spec.theme.effects.includes('rules') ? 'magazine' : 'hero-centered',
        sections: derived.spec.sections.map((s) => s.type),
        seed: (project.name || 'x').length * 7,
      });
    }
    return derived;
  }
}

const strip = (value, target) => (value === target ? null : value);

function decorate(project, host) {
  const spec = project.spec || null;
  const sections = spec ? spec.sections : project.sections || [];
  const counts = spec ? countSections(spec) : { visible: sections.length, hidden: 0 };
  return {
    ...project,
    sections,
    theme: spec ? spec.theme : project.theme,
    statusLabel: { draft: 'Draft', generating: 'Generating…', ready: 'Ready to publish', publishing: 'Publishing…', live: 'Live' }[project.status] || project.status,
    statusTone: { draft: 'muted', generating: 'pulse', ready: 'outline', publishing: 'pulse', live: 'live' }[project.status] || 'muted',
    platformLabel: spec && spec.platform ? spec.platform.label : platformsLabel(project.selectedPlatforms),
    liveUrl: project.slug ? `https://${host}/${project.slug}` : null,
    displayUrl: project.slug ? `${host}/${project.slug}` : null,
    livePath: project.slug ? `/${project.slug}` : null,
    sectionCount: counts.visible,
    hiddenSectionCount: counts.hidden,
    assetCount: (project.assets || []).length,
    usedAssetCount: (project.assets || []).filter((a) => a.usage).length,
    progress: progressFor(project),
    completion: completionFor(project),
    thumbnail: spec ? spec.thumbnail || project.thumbnail || null : project.thumbnail || null,
    previewText: spec ? (spec.sections.find((s) => s.type === 'hero') || {}).content?.subheadline || spec.tagline : project.description,
    pacing: pacingFor({ provider: project.ai ? project.ai.provider : 'local', model: project.ai && project.ai.model, lastElapsedMs: project.ai && project.ai.elapsedMs }),
  };
}

function countSections(spec) {
  const visible = (spec.sections || []).filter((s) => !s.hidden);
  return { visible: visible.length, hidden: (spec.sections || []).length - visible.length };
}

function progressFor(project) {
  if (project.status === 'live') return 100;
  if (project.status === 'publishing') return 92;
  if (project.status === 'generating') return 55;
  if (project.status === 'ready') return 78;
  return 18 + Math.min(24, (project.description || '').length / 12);
}

function completionFor(project) {
  return [
    { key: 'type', label: 'Website type', done: Boolean(project.type) },
    { key: 'description', label: 'Description', done: (project.description || '').length > 24 },
    { key: 'platform', label: 'Platform target', done: (project.selectedPlatforms || []).length > 0 },
    { key: 'design', label: 'Design direction', done: Boolean(project.selectedDesign) },
    { key: 'assets', label: 'At least one image', done: (project.assets || []).length > 0 },
    { key: 'generate', label: 'Generated', done: Boolean(project.spec) },
    { key: 'publish', label: 'Published', done: Boolean(project.published) },
  ];
}

function normalisePlatforms(value) {
  const list = Array.isArray(value) ? value : typeof value === 'string' ? (value === 'both' ? ['mobile', 'desktop'] : [value]) : [];
  const clean = [...new Set(list.map((v) => String(v).toLowerCase()).filter((v) => v === 'mobile' || v === 'desktop'))];
  return clean.length ? clean : ['mobile', 'desktop'];
}

function platformsLabel(platforms) {
  const list = normalisePlatforms(platforms);
  if (list.length === 2) return 'Mobile + Laptop';
  return list[0] === 'mobile' ? 'Mobile' : 'Laptop / Desktop';
}

function derivedName(description, type) {
  const { extractBrand } = require('../../generator/interpret');
  const brand = extractBrand(description || '');
  if (brand) return brand;
  const first = String(description || '').split(/[\s,.]+/).slice(0, 3).join(' ');
  return first ? first.replace(/[^\w -]/g, '').slice(0, 28) || labelType(type) : labelType(type);
}

const labelType = (type) => `${String(type || 'launch').replace(/-/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())} launch`;

function mergeThemePatch(theme, patch) {
  const next = { ...theme, ...patch };
  if (patch.colors) next.colors = { ...(theme.colors || {}), ...patch.colors };
  if (patch.typography) next.typography = { ...(theme.typography || {}), ...patch.typography };
  if (patch.imagery) next.imagery = { ...(theme.imagery || {}), ...patch.imagery };
  return next;
}

function normaliseSections(incoming, existing) {
  const existingById = new Map(existing.map((s) => [s.id, s]));
  return incoming.map((section, index) => ({
    ...existingById.get(section.id),
    ...section,
    order: index,
    id: section.id || `${section.type}-${String(index).padStart(2, '0')}`,
    content: section.content || (existingById.get(section.id) || {}).content || {},
    settings: { ...(((existingById.get(section.id) || {}).settings) || {}), ...(section.settings || {}) },
    assets: section.assets || (existingById.get(section.id) || {}).assets || [],
    hidden: Boolean(section.hidden),
  }));
}

function applyAssetEdits(assets, edits, type) {
  const byId = new Map(assets.map((a) => [a.id, a]));
  for (const edit of edits || []) {
    if (!edit || !edit.id) continue;
    if (edit.op === 'remove') byId.delete(edit.id);
    else if (edit.op === 'use') byId.set(edit.id, hydrateAsset({ ...byId.get(edit.id), selectedSection: edit.section }, type));
    else if (edit.op === 'unuse') {
      const asset = byId.get(edit.id);
      if (asset) byId.set(edit.id, hydrateAsset({ ...asset, selectedSection: '__library__' }, type));
    } else if (edit.op === 'describe') byId.set(edit.id, hydrateAsset({ ...byId.get(edit.id), description: edit.description }, type));
  }
  return [...byId.values()];
}

function extensionFor(mime, filename) {
  const fromName = path.extname(filename || '').toLowerCase();
  if (fromName && /^\.[a-z0-9]{2,5}$/.test(fromName)) return fromName;
  return { 'image/png': '.png', 'image/jpeg': '.jpg', 'image/webp': '.webp', 'image/gif': '.gif', 'image/svg+xml': '.svg', 'video/mp4': '.mp4', 'video/webm': '.webm', 'image/avif': '.avif' }[mime] || '.bin';
}

function guessMime(filename) {
  const ext = path.extname(String(filename || '')).toLowerCase();
  return { '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml', '.mp4': 'video/mp4', '.webm': 'video/webm' }[ext] || 'application/octet-stream';
}

function randomSuffix(length) {
  const bytes = crypto.randomBytes(length);
  return Array.from(bytes, (b) => SUFFIX_ALPHABET[b % SUFFIX_ALPHABET.length]).join('');
}

module.exports = { ProjectsService, decorate, normalisePlatforms, platformsLabel, slugify, STATUSES };
