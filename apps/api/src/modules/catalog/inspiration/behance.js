/**
 * Behance's v2 API, kept on its own so the mapping and the failure text can be
 * tested with no network at all.
 *
 * What the API actually looks like today, measured rather than remembered:
 *
 *   GET api.behance.net/v2/projects                 403 {"valid":0,"messages":[{"type":
 *                                                   "error","message":"A client or user
 *                                                   is required"}]}      ← needs a key
 *   GET /v2/users/<name>/projects                   403 (same)           ← needs a key
 *   GET /v2/search/projects?q=…                     404                   ← removed
 *   response headers                                no access-control-allow-origin
 *
 * so the call has to be made here, server-side, with a key — a browser cannot
 * reach it, and putting a key in the bundle would publish it. And keys are the
 * hard part: Adobe closed registration (behance.net/dev is gone, and the Adobe
 * Developer Console has no Behance API), so only clients registered before the
 * freeze still hold one. Everything downstream therefore treats this as a
 * bonus row of cards, never as a requirement.
 */

const { config } = require('../../../config');

const { httpsUrl, redactKeys, stripHtml } = require('./cards');

/**
 * Restricted field list: the full project payload includes every module and
 * every image, which is far more than a card needs and slow to fetch.
 */
const API_FIELDS = [
  'id',
  'name',
  'description',
  'created_on',
  'url',
  'tags',
  'owner.username',
  'owner.display_name',
  'owner.city',
  'owner.country',
  'stats.views',
  'stats.appreciations',
  'covers.808',
  'covers.404',
  'covers.202',
  'covers.176',
].join(',');

/** 404 is the 2:1 card crop the strip uses; 808 is the wide fallback. */
function pickCover(project) {
  const covers = project?.covers || {};
  return httpsUrl(covers['404'] || covers['808'] || covers['202'] || covers['176']);
}

function projectUrl(project) {
  const direct = httpsUrl(project.url);
  if (direct) return direct;
  const username = project.owner?.username;
  if (!project.id || !username) return null;
  // A gallery URL needs a slug-ish tail; the owner's name is the closest thing
  // the restricted field list carries, and Behance redirects on the id alone.
  const slug = String(username).replace(/[^\w-]/g, '-');
  return `https://www.behance.net/gallery/${project.id}/${slug}`;
}

/** One Behance project → one card, in the shape the dashboard already draws. */
function mapProject(project) {
  if (!project || !project.id) return null;
  const owner = project.owner || {};
  const stats = project.stats || {};
  const author = owner.display_name || owner.fullname || owner.username || '';
  return {
    id: `behance-${project.id}`,
    source: 'behance',
    title: String(project.name || 'Untitled project').slice(0, 140),
    blurb: stripHtml(project.description).slice(0, 180) || null,
    author: author || 'a Behance designer',
    authorUrl: owner.username ? `https://www.behance.net/${encodeURIComponent(owner.username)}` : null,
    authorLocation: [owner.city, owner.country].filter(Boolean).join(', ') || null,
    url: projectUrl(project),
    cover: pickCover(project),
    tags: (Array.isArray(project.tags) ? project.tags : []).slice(0, 3),
    stats: { views: Number(stats.views) || 0, appreciations: Number(stats.appreciations) || 0 },
    publishedAt: project.created_on ? new Date(Number(project.created_on) * 1000).toISOString() : null,
  };
}

/** Whether this install should call out at all, and the reason if it should not. */
function behanceEnabled(settings = config.behance, mode = config.inspiration.mode) {
  if (mode === 'off' || mode === 'none' || mode === 'local') return false;
  return Boolean(settings.apiKey);
}

function behanceDisabledReason(settings = config.behance, mode = config.inspiration.mode) {
  if (mode === 'off' || mode === 'none' || mode === 'local') return 'disabled: LAUNCHPAD_INSPIRATION is off';
  if (!settings.apiKey) return 'not configured: set BEHANCE_API_KEY (Adobe is not issuing new ones, see behance.js)';
  return null;
}

function requestUrls(settings = config.behance) {
  const query = new URLSearchParams({ api_key: settings.apiKey, per_page: String(settings.perPage), fields: API_FIELDS });
  // A curated list of designers is the good setting: the site-wide feed is
  // everything ever posted, sorted by nothing in particular.
  const users = (settings.users || []).filter(Boolean).slice(0, 4);
  if (users.length) {
    return users.map((username) => `${settings.baseUrl}/users/${encodeURIComponent(username)}/projects?${query.toString()}`);
  }
  if (settings.field) query.set('field', settings.field);
  if (settings.sort) query.set('sort', settings.sort);
  return [`${settings.baseUrl}/projects?${query.toString()}`];
}

function failureMessage(status, body, settings = config.behance) {
  const detail = redactKeys(String(body || '').slice(0, 200));
  if (status === 403 || status === 401) {
    return `Behance rejected this key (${status}): ${detail || 'no detail'} — the key has to come from a client registered before Adobe closed registration`;
  }
  if (status === 404) return 'Behance has no such endpoint (404) — the project search was removed from the API';
  if (status === 429) return 'Behance is rate limiting this key (429) — it will be retried after the cache expires';
  return `Behance answered ${status}${detail ? `: ${detail}` : ''}`;
}

class BehanceClient {
  constructor(options = {}) {
    this.settings = { ...config.behance, ...options };
    this.fetchImpl = options.fetch || fetch;
  }

  enabled() {
    return behanceEnabled(this.settings, this.settings.mode || config.inspiration.mode);
  }

  /** @returns {Promise<Array>} mapped cards. Throws on any upstream failure. */
  async list() {
    if (!this.enabled()) {
      const error = new Error(behanceDisabledReason(this.settings, this.settings.mode || config.inspiration.mode));
      error.code = 'BEHANCE_DISABLED';
      throw error;
    }
    const urls = requestUrls(this.settings);
    const settled = await Promise.all(urls.map((url) => this.get(url)));
    const seen = new Set();
    const cards = [];
    settled.flat().forEach((project) => {
      const card = mapProject(project);
      if (!card || seen.has(card.id)) return;
      seen.add(card.id);
      cards.push(card);
    });
    // Several feeds interleaved reads better than one designer's wall.
    if (urls.length > 1) cards.sort((a, b) => b.stats.appreciations - a.stats.appreciations);
    return cards.slice(0, this.settings.perPage);
  }

  async get(url) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), this.settings.timeoutMs);
    let response;
    let text = '';
    try {
      response = await this.fetchImpl(url, { headers: { accept: 'application/json' }, signal: controller.signal });
      text = await response.text().catch(() => '');
    } catch (cause) {
      const reason = cause?.name === 'AbortError' ? `no answer in ${this.settings.timeoutMs}ms` : redactKeys(cause?.message || 'unreachable');
      const error = new Error(`Behance is not reachable (${reason})`);
      error.code = 'BEHANCE_UNREACHABLE';
      throw error;
    } finally {
      clearTimeout(timer);
    }
    if (!response.ok) {
      const error = new Error(failureMessage(response.status, text, this.settings));
      error.code = 'BEHANCE_UPSTREAM';
      error.status = response.status;
      throw error;
    }
    let payload;
    try {
      payload = JSON.parse(text || '{}');
    } catch {
      const error = new Error('Behance answered with something that is not JSON');
      error.code = 'BEHANCE_UPSTREAM';
      throw error;
    }
    return Array.isArray(payload.projects) ? payload.projects : [];
  }
}

let shared = null;
function getBehanceClient() {
  if (!shared) shared = new BehanceClient();
  return shared;
}

module.exports = {
  API_FIELDS,
  // Re-exported so the shared helpers have one import path for tests and callers.
  httpsUrl,
  redactKeys,
  stripHtml,
  BehanceClient,
  behanceDisabledReason,
  behanceEnabled,
  failureMessage,
  getBehanceClient,
  mapProject,
  pickCover,
  redactKeys,
  requestUrls,
  stripHtml,
};
