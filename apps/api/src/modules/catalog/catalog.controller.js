const { wireController, get, queryArg, paramArg } = require('../../common/js-decorators');
const { WEBSITE_TYPES, SECTION_CATALOG } = require('../../catalog/websiteTypes');
const { DESIGNS, designsForCategory, designById } = require('../../catalog/designs');
const { STAGES } = require('../../generator/stages');
const { config } = require('../../config');
const { getStore } = require('../../db');
const { getOllamaClient, resolveAiModeCached } = require('../../generator/ollama');
const { getLmStudioClient, getOpenAiCompatibleClient } = require('../../generator/lmstudio');
const { googleConfig } = require('../auth/google');

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

  async health(refresh) {
    const store = await getStore().catch(() => null);
    let ai;
    try {
      const mode = await resolveAiModeCached({ refresh: refresh === '1' || refresh === true,
        ollama: getOllamaClient(),
        lmstudio: getLmStudioClient(),
        llm: getOpenAiCompatibleClient(),
      });
      ai = {
        provider: mode.useModel ? mode.provider : 'local',
        label: mode.label || 'Local spec compiler',
        model: mode.model || null,
        reachable: Boolean(mode.useModel),
        reason: mode.reason || null,
        endpoint: mode.endpoint || null,
      };
    } catch (error) {
      ai = { provider: 'local', reachable: false, reason: error.message, endpoint: config.ai.lmstudio.baseUrl };
    }
    // Google sign-in state is reported here so a hand-run install can see, in
    // one call, whether the client id was picked up. It is also on
    // /api/auth/google/status, which is what the sign-in screen itself reads.
    let auth;
    try {
      const google = googleConfig();
      auth = { google: google.enabled ? (google.redirectEnabled ? 'ready' : 'browser-only') : 'not configured' };
    } catch {
      auth = { google: 'not configured' };
    }
    return { ok: true, service: 'launchpad-api', env: config.env, database: store ? store.driver : 'unavailable', ai, auth };
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
    health: get('health', [queryArg(0, 'refresh')], [], { public: true }),
  },
);

module.exports = { CatalogController };
