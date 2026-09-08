const fs = require('node:fs');
const path = require('node:path');

const { config } = require('../../../config');
const { httpsUrl, limitText, safeLink } = require('./cards');

/**
 * The curated gallery: a JSON file the operator owns, read on demand.
 *
 * This exists because the design galleries people actually browse — Lapa Ninja
 * above all — are not APIs. Measured on 5 September 2026, from a server:
 *
 *   GET https://www.lapa.ninja/            403  "Just a moment…" (Cloudflare
 *   GET https://www.lapa.ninja/robots.txt   403   managed challenge, JS required)
 *   GET /feed /rss /index.xml /sitemap.xml  403
 *   api / assets / cdn subdomains           403 or nothing answering
 *
 * so there is no endpoint to call, nothing to scrape without a browser and a
 * cookie, and no key to be handed out. But a *browser* opens the site fine, so
 * the honest shape is the one here: the cards are a short list you keep (with a
 * cover image and a link to the site that made it), plus `browse` links that take
 * somebody to the gallery itself when they click. Nothing is fetched, nothing is
 * re-hosted, and a stale or refused cover image degrades to a colour block.
 *
 * The file is re-read when it changes (by mtime), so editing it and reloading
 * the dashboard is the whole workflow — no restart.
 */

const DEFAULT_FILE = path.resolve(__dirname, '../../../examples.json');
const MAX_ITEMS = 12;

function resolveFile(settings = config.examples) {
  return settings.file ? path.resolve(settings.file) : DEFAULT_FILE;
}

/** Only the file's name is ever reported to a browser, not the server's path. */
function displayName(file) {
  return path.basename(file);
}

let liveInstance = null;

function toList(payload) {
  if (Array.isArray(payload)) return { items: payload, browse: [] };
  if (!payload || typeof payload !== 'object') return { items: [], browse: [], malformed: true };
  return {
    items: Array.isArray(payload.items) ? payload.items : [],
    browse: Array.isArray(payload.browse) ? payload.browse : [],
    note: typeof payload._readme === 'string' ? payload._readme : null,
  };
}

function hostOf(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/**
 * One entry → one card. Anything that cannot be rendered safely returns null
 * with a reason, so a typo in the file shows up as a count rather than a broken
 * page or a link that runs code.
 */
function mapEntry(entry, index) {
  if (!entry || typeof entry !== 'object') return { card: null, why: 'not an object' };
  const url = safeLink(entry.url);
  if (!url) return { card: null, why: entry.url ? `unsafe url (${String(entry.url).slice(0, 24)})` : 'no url' };
  const host = hostOf(url);
  // A blank or whitespace-only title falls back to the host: an entry should
  // have to be really unusable, not merely untitled, to be left out.
  const title = limitText(entry.title || entry.name || '', 140) || host;
  if (!title) return { card: null, why: 'no title and no host to use instead' };
  const author = limitText(entry.author || entry.by || entry.site || host || 'the maker', 80);
  const authorUrl = safeLink(entry.authorUrl || entry.siteUrl) || (host ? `https://${host}` : null);

  // Cover must pass httpsUrl or it doesn't render at all — no raw-string
  // fallback here. Falling back to the raw value on a failed check would
  // let anything (javascript:, data:, file:) straight through into an
  // <img src>/href, which is exactly what safeLink/httpsUrl exist to stop.
  // A rejected cover just means the letter-avatar placeholder shows instead.
  const cover = httpsUrl(entry.cover || entry.image || entry.ogImage || null);

  return {
    card: {
      id: `link-${index}-${host.replace(/[^a-z0-9]/gi, '')}`,
      source: 'link',
      title,
      blurb: limitText(entry.blurb || entry.description || entry.note || '', 180) || null,
      author,
      authorUrl,
      authorLocation: null,
      url,
      cover,
      tags: (Array.isArray(entry.tags) ? entry.tags : []).slice(0, 3).map((tag) => limitText(tag, 24)),
      stats: { views: 0, appreciations: 0 },
      publishedAt: null,
      accent: /^#[0-9a-f]{3,8}$/i.test(String(entry.accent || '')) ? entry.accent : null,
    },
  };
}

function mapBrowse(entry, index) {
  const url = safeLink(typeof entry === 'string' ? entry : entry?.url);
  if (!url) return null;
  const label = limitText((typeof entry === 'object' && (entry.label || entry.name)) || `Open ${hostOf(url)}`, 60);
  return { id: `browse-${index}`, label, url, host: hostOf(url) };
}

class ExamplesFileProvider {
  constructor(options = {}) {
    this.settings = { ...config.examples, ...options };
    this.cache = { file: null, mtimeMs: -1, items: [], browse: [], skipped: [], error: null, readAt: 0 };
    liveInstance = this;
  }

  enabled() {
    const mode = this.settings.mode || 'auto';
    // 'behance' means: only the API, please — so the file sits out.
    if (mode === 'off' || mode === 'none' || mode === 'local' || mode === 'behance') return false;
    return true;
  }

  file() {
    return resolveFile(this.settings);
  }

  /** Reads only when the file moved, so a live edit shows on the next load. */
  read({ refresh = false } = {}) {
    const file = this.file();
    let stat = null;
    try {
      stat = fs.statSync(file);
    } catch {
      this.cache = { file, mtimeMs: -1, items: [], browse: [], skipped: [], error: `no examples file at ${displayName(file)}`, readAt: Date.now() };
      return this.cache;
    }
    if (!refresh && this.cache.file === file && this.cache.mtimeMs === stat.mtimeMs) return this.cache;
    let parsed = null;
    let error = null;
    try {
      parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
    } catch (cause) {
      error = `${displayName(file)} is not valid JSON (${String(cause.message || 'unreadable').split('\n')[0]})`;
    }
    const { items, browse } = toList(parsed);
    const cards = [];
    const skipped = [];
    items.slice(0, Math.min(MAX_ITEMS, this.settings.limit || MAX_ITEMS)).forEach((entry, index) => {
      const mapped = mapEntry(entry, index);
      if (mapped.card) cards.push(mapped.card);
      else skipped.push(mapped.why);
    });
    this.cache = {
      file,
      mtimeMs: stat.mtimeMs,
      items: cards,
      browse: browse.map(mapBrowse).filter(Boolean),
      skipped,
      error,
      readAt: Date.now(),
    };
    return this.cache;
  }

  async list(options) {
    const data = this.read(options);
    return { items: data.items, browse: data.browse, skipped: data.skipped, error: data.error };
  }

  /** What /api/health and the strip's footer report. No server paths, no secrets. */
  status(options) {
    const data = options?.cached ? this.cache : this.read();
    const missing = data.error && data.error.startsWith('no examples file');
    return {
      provider: 'file',
      configured: this.enabled() && !missing,
      file: displayName(this.file()),
      count: data.items.length,
      skipped: data.skipped.length,
      stale: false,
      reason: data.error || null,
      readAt: data.readAt ? new Date(data.readAt).toISOString() : null,
    };
  }
}

function getExamplesFileProvider() {
  if (!liveInstance) liveInstance = new ExamplesFileProvider();
  return liveInstance;
}

module.exports = {
  DEFAULT_FILE,
  ExamplesFileProvider,
  getExamplesFileProvider,
  hostOf,
  mapBrowse,
  mapEntry,
  resolveFile,
  toList,
};