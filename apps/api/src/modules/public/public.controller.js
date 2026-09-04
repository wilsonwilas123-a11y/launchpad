const { NotFoundException, BadRequestException } = require('@nestjs/common');
const { wireController, get, post, body, bodyAt, paramArg, reqArg } = require('../../common/js-decorators');
const { config } = require('../../config');
const { STORE_TOKEN } = require('../../common/tokens');

const { PROJECTS_SERVICE } = require('../../common/tokens');

/**
 * Everything behind a published URL. Serves the snapshot (not the live draft)
 * so an owner editing the builder never breaks the site people are reading,
 * and captures waitlist / newsletter / contact responses from visitors.
 */
class PublicController {
  constructor(projects, store) {
    this.projects = projects;
    this.storePromise = store;
  }

  /**
   * The public gallery: what Launchpad has recently put live. Used by the
   * landing page, so every example shown is a real generated site.
   */
  async gallery() {
    const database = await this.storePromise;
    const projects = await database.listPublished(12);
    const items = projects.map((project) => {
      const snapshot = project.publishedSnapshot;
      const spec = snapshot.spec || {};
      const hero = (spec.sections || []).find((section) => section.type === 'hero') || spec.sections?.[0];
      const colors = spec.theme?.colors || {};
      const firstImage = (snapshot.assets || []).find((asset) => asset.url);
      return {
        slug: project.slug,
        name: spec.name || project.name,
        type: project.type,
        tagline: hero?.content?.subheadline || spec.tagline || '',
        headline: hero?.content?.headline || '',
        publishedAt: snapshot.publishedAt,
        revision: snapshot.revision,
        sections: (spec.sections || []).length,
        displayUrl: `${config.publicHost}/${project.slug}`,
        thumbnail: firstImage ? firstImage.url : null,
        palette: [colors.background, colors.surface, colors.accent, colors.text],
        visualStyle: spec.theme?.visualStyle || null,
      };
    });
    return { items, total: items.length, host: config.publicHost };
  }

  async resolve(slug, req) {
    const database = await this.storePromise;
    const project = await database.findProjectBySlug(String(slug || '').toLowerCase());
    if (!project || !project.published || !project.publishedSnapshot) {
      const error = new NotFoundException('This page does not exist (yet).');
      error.slug = slug;
      throw error;
    }
    const snapshot = project.publishedSnapshot;
    const viewerIsOwner = req.user && req.user.id === project.userId;
    return {
      slug: project.slug,
      name: snapshot.name || project.name,
      type: snapshot.type || project.type,
      theme: snapshot.spec.theme,
      platform: snapshot.spec.platform,
      nav: snapshot.spec.nav,
      sections: snapshot.spec.sections,
      assets: snapshot.assets || [],
      assetMap: snapshot.spec.assetMap || [],
      logoAssetId: snapshot.spec.logoAssetId || null,
      copy: snapshot.spec.copy,
      publishedAt: snapshot.publishedAt,
      revision: snapshot.revision,
      displayUrl: `${config.publicHost}/${project.slug}`,
      ownerView: viewerIsOwner
        ? { projectId: project.id, hasUnpublishedChanges: Boolean(project.hasUnpublishedChanges), builderPath: `/builder/${project.id}` }
        : null,
    };
  }

  async submit(slug, payload, req) {
    const database = await this.storePromise;
    const project = await database.findProjectBySlug(String(slug || '').toLowerCase());
    if (!project || !project.published) throw new NotFoundException('This page does not exist (yet).');
    const kind = ['waitlist', 'newsletter', 'contact', 'preSave', 'ticket'].includes((payload || {}).kind) ? payload.kind : 'waitlist';
    if (kind === 'contact' && !(payload.message || '').trim()) throw new BadRequestException('Add a message so we know what you need.');
    const result = await this.projects.recordSignup(project.id, { ...payload, kind, sourceUrl: `/${project.slug}`, ip: req.ip });
    return {
      ...result,
      message:
        kind === 'waitlist'
          ? 'You are on the list.'
          : kind === 'newsletter'
            ? 'Subscribed. First issue lands on the date shown.'
            : kind === 'contact'
              ? 'Message sent — a person will reply.'
              : 'Done.',
      position: kind === 'waitlist' ? await database.countSignups(project.id) : null,
    };
  }

  async status(slug) {
    const database = await this.storePromise;
    const project = await database.findProjectBySlug(String(slug || '').toLowerCase());
    if (!project) throw new NotFoundException('No project at that address.');
    return { slug, published: Boolean(project.published), status: project.status, publishedAt: project.publishedAt, revision: project.publishedSnapshot ? project.publishedSnapshot.revision : 0 };
  }
}

wireController(
  PublicController,
  'public',
  {
    gallery: get('', [], [], { public: true }),
    resolve: get(':slug', [paramArg(0, 'slug'), reqArg(1)], [], { public: true }),
    submit: post(':slug/signups', [paramArg(0, 'slug'), bodyAt(1), reqArg(2)], [], { public: true, status: 201 }),
    status: get(':slug/status', [paramArg(0, 'slug')], [], { public: true }),
  },
  { inject: [PROJECTS_SERVICE, STORE_TOKEN] },
);

module.exports = { PublicController };
