const { wireController, get, queryArg, paramArg } = require('../../common/js-decorators');
const { WEBSITE_TYPES, SECTION_CATALOG } = require('../../catalog/websiteTypes');
const { DESIGNS, designsForCategory, designById } = require('../../catalog/designs');
const { STAGES } = require('../../generator/stages');
const { config } = require('../../config');
const { getStore } = require('../../db');
const { getOllamaClient, resolveAiMode } = require('../../generator/ollama');

/**
 * Read-mostly product data: the website types, the design gallery, the section
 * vocabulary and the stage timeline. Keeping this on the server means the
 * wizard, the builder and the generator all read the same curated catalog.
 */
class CatalogController {
  catalog() {
    return {
      websiteTypes: WEBSITE_TYPES.map(({ sections, assets, ...rest }) => ({
        ...rest,
        defaultSections: sections,
        assetPlan: assets,
      })),
      sections: SECTION_CATALOG,
      stages: STAGES,
      publicHost: config.publicHost,
      counts: { types: WEBSITE_TYPES.length, designs: DESIGNS.length, sections: SECTION_CATALOG.length },
    };
  }

  designs(category) {
    const list = category && category !== 'all' ? designsForCategory(category) : DESIGNS;
    return { items: list, total: list.length, filteredBy: category || null };
  }

  design(id) {
    const found = designById(id);
    return found || { error: 'unknown design' };
  }

  /** What Launchpad will ask for, per website type — used by the asset step. */
  assetPlan(type) {
    const found = WEBSITE_TYPES.find((t) => t.id === type) || WEBSITE_TYPES[WEBSITE_TYPES.length - 1];
    return {
      websiteType: found.id,
      required: found.assets.slice(0, 2).map((slot) => slot.key),
      slots: found.assets,
      optionalNote: 'Nothing here is mandatory. Every recommendation can be skipped, and any image you add is accepted.',
    };
  }

  async health() {
    const store = await getStore().catch(() => null);
    const client = getOllamaClient();
    let ai;
    try {
      const mode = await resolveAiMode(client);
      ai = { provider: mode.useOllama ? 'ollama' : 'local', model: mode.model || null, reachable: Boolean(mode.useOllama), reason: mode.reason || null, endpoint: config.ai.ollamaUrl };
    } catch (error) {
      ai = { provider: 'local', reachable: false, reason: error.message, endpoint: config.ai.ollamaUrl };
    }
    return { ok: true, service: 'launchpad-api', env: config.env, database: store ? store.driver : 'unavailable', ai };
  }
}

wireController(
  CatalogController,
  '',
  {
    catalog: get('catalog', [], [], { public: true }),
    designs: get('designs', [queryArg(0, 'category')], [], { public: true }),
    design: get('designs/:id', [paramArg(0, 'id')], [], { public: true }),
    assetPlan: get('asset-plan', [queryArg(0, 'type')], [], { public: true }),
    health: get('health', [], [], { public: true }),
  },
);

module.exports = { CatalogController };
