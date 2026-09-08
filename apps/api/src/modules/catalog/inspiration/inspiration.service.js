const { wireInjectable } = require('../../../common/js-decorators');
const { STORE_TOKEN } = require('../../../common/tokens');

const { config } = require('../../../config');
const { getBehanceClient, behanceDisabledReason, behanceEnabled, redactKeys } = require('./behance');
const { getExamplesFileProvider } = require('./examples-file');

// Keep tracker at the top to avoid hoisting reference errors during DI initialization
let liveInstance = null;

class InspirationService {
  constructor(store, client = getBehanceClient(), options = {}) {
    this.storePromise = store;
    this.client = client;
    this.examples = options.examples || getExamplesFileProvider();
    this.cache = { at: 0, items: [], stale: false, error: null };
    
    // Tracks the active instance safely for the health route hook
    liveInstance = this;
  }

  sources() {
    const mode = config.examples.mode;
    if (mode === 'off' || mode === 'none' || mode === 'local') return { links: false, behance: false };
    if (mode === 'links' || mode === 'file') return { links: true, behance: false };
    if (mode === 'behance') return { links: false, behance: true };
    
    // Optional chaining check handles cases where options.examples doesn't implement .enabled
    const links = typeof this.examples?.enabled === 'function' ? Boolean(this.examples.enabled()) : true;
    return { links, behance: true };
  }

  async launchpadCards() {
    try {
      const db = await this.storePromise;
      if (!db || typeof db.listPublished !== 'function') return [];
      
      const limit = Number(config.inspiration.launchpadCount) || 4;
      const projects = await db.listPublished(limit);
      
      return (projects || []).map((project) => {
        const snapshot = project.publishedSnapshot || {};
        const spec = snapshot.spec || {};
        const hero = (spec.sections || []).find((section) => section.type === 'hero') || spec.sections?.[0];
        const firstImage = (snapshot.assets || []).find((asset) => asset.url);
        
        return {
          id: `launchpad-${project.id}`,
          source: 'launchpad',
          title: spec.name || project.name,
          blurb: hero?.content?.subheadline || spec.tagline || '',
          author: 'published on this API',
          authorUrl: null,
          authorLocation: null,
          url: `/${project.slug}`,
          cover: firstImage ? firstImage.url : null,
          tags: [project.type].filter(Boolean),
          stats: { views: 0, appreciations: 0 },
          publishedAt: snapshot.publishedAt || project.publishedAt || null,
          accent: spec.theme?.colors?.accent || null,
          sections: (spec.sections || []).length,
        };
      });
    } catch {
      return [];
    }
  }

  /** Cached, tolerant read of the outside API. Never throws. */
  async behanceCards({ refresh = false } = {}) {
    const now = Date.now();
    const fresh = this.cache.at && now - this.cache.at < config.behance.ttlMs;
    
    if (fresh && !refresh) {
      return { items: this.cache.items, stale: this.cache.stale, error: this.cache.error, cachedAt: this.cache.at };
    }
    
    if (!this.client || typeof this.client.enabled !== 'function' || !this.client.enabled()) {
      // Not a failure, so whatever was last good stays on screen.
      return { items: this.cache.items, stale: false, error: null, cachedAt: this.cache.at, unavailable: true };
    }
    
    try {
      const items = await this.client.list();
      this.cache = { at: now, items, stale: false, error: null };
      return { items, stale: false, error: null, cachedAt: now };
    } catch (cause) {
      const message = redactKeys((cause && cause.message) || 'the request failed');
      this.cache = { at: now, items: this.cache.items, stale: true, error: message };
      return { items: this.cache.items, stale: true, error: message, cachedAt: this.cache.at };
    }
  }

  async list({ refresh = false } = {}) {
    const wanted = this.sources();
    
    const [launchpad, curated, behance] = await Promise.all([
      this.launchpadCards(),
      wanted.links && typeof this.examples?.list === 'function' 
        ? this.examples.list({ refresh }) 
        : Promise.resolve({ items: [], browse: [], skipped: [], error: null, disabled: true }),
      wanted.behance 
        ? this.behanceCards({ refresh }) 
        : Promise.resolve({ items: [], stale: false, error: null, cachedAt: 0, disabled: true }),
    ]);
    
    const examples = typeof this.examples?.status === 'function' 
      ? this.examples.status({ cached: true }) 
      : { configured: false, file: 'unknown', readAt: null };
      
    const items = [...launchpad, ...curated.items, ...behance.items];
    const provider = wanted.links && wanted.behance ? 'both' : wanted.links ? 'links' : wanted.behance ? 'behance' : 'none';
    
    return {
      items,
      total: items.length,
      provider,
      browse: curated.browse || [],
      sources: {
        launchpad: { count: launchpad.length, ok: launchpad.length > 0 },
        examples: {
          provider: 'file',
          enabled: wanted.links,
          configured: wanted.links && examples.configured,
          ok: curated.items.length > 0,
          count: curated.items.length,
          skipped: (curated.skipped || []).length,
          skippedWhy: (curated.skipped || []).slice(0, 3),
          file: examples.file,
          reason: curated.disabled ? 'not consulted: LAUNCHPAD_EXAMPLES_SOURCE' : curated.error || (wanted.links && !curated.items.length ? `no usable entries in ${examples.file}` : null),
          updatedAt: examples.readAt,
        },
        behance: {
          provider: 'behance',
          enabled: wanted.behance,
          configured: wanted.behance && this.client?.enabled?.(),
          ok: !behance.error && !behance.unavailable && behance.items.length > 0,
          count: behance.items.length,
          stale: Boolean(behance.stale),
          cachedAt: behance.cachedAt ? new Date(behance.cachedAt).toISOString() : null,
          reason: behance.disabled
            ? 'not consulted: LAUNCHPAD_EXAMPLES_SOURCE'
            : behance.error || (behance.unavailable ? behanceDisabledReason(config.behance, config.inspiration.mode) : null),
        },
        cacheTtlMs: config.behance.ttlMs,
      },
    };
  }

  status() {
    const examples = typeof this.examples?.status === 'function' 
      ? this.examples.status({ cached: true }) 
      : { configured: false, reason: 'missing status method' };
      
    const behanceConfigured = this.client && typeof this.client.enabled === 'function' ? this.client.enabled() : false;
    const wanted = this.sources();
    
    const reasons = [
      wanted.links && !examples.configured ? examples.reason : null,
      wanted.behance && !behanceConfigured ? behanceDisabledReason(config.behance, config.inspiration.mode) : null,
      this.cache.error || null,
    ].filter(Boolean);
    
    return statusShape({
      provider: wanted.links && wanted.behance ? 'both' : wanted.links ? 'links' : wanted.behance ? 'behance' : 'none',
      configured: (wanted.links && examples.configured) || (wanted.behance && behanceConfigured),
      reason: reasons.length ? reasons.join('; ') : null,
      cachedAt: this.cache.at ? new Date(this.cache.at).toISOString() : null,
      stale: Boolean(this.cache.stale),
      count: this.cache.items.length,
      examples,
    });
  }
}

function statusShape(fields) {
  return {
    provider: fields.provider,
    configured: fields.configured,
    reason: fields.reason,
    cachedAt: fields.cachedAt,
    stale: fields.stale,
    count: fields.count,
    examples: fields.examples,
  };
}

function peekInspirationStatus() {
  if (liveInstance) return liveInstance.status();
  
  const examples = getExamplesFileProvider().status();
  const configured = behanceEnabled(config.behance, config.inspiration.mode);
  
  return statusShape({
    provider: ['off', 'none', 'local'].includes(config.examples.mode) ? 'none' : config.examples.mode === 'behance' ? 'behance' : 'both',
    configured: examples.configured || configured,
    reason: [examples.configured ? null : examples.reason, configured ? null : behanceDisabledReason(config.behance, config.inspiration.mode)]
      .filter(Boolean)
      .join('; ') || null,
    cachedAt: null,
    stale: false,
    count: 0,
    examples,
  });
}

wireInjectable(InspirationService, [STORE_TOKEN]);

module.exports = { InspirationService, peekInspirationStatus };
