/**
 * The small helpers a card needs, shared by every external source.
 *
 * They live apart from the providers so a new one cannot quietly skip the two
 * rules that matter: nothing a browser will refuse to load (mixed content), and
 * nothing that can be typed into an `href` by someone else (a `javascript:` or
 * `file:` URL in a curated file would otherwise become a clickable script).
 */

/** Only these schemes are ever allowed into a link the app renders. */
const SAFE_LINK = /^https?:\/\//i;

/** Behance and a hand-written file both send http sometimes; https or nothing. */
function httpsUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  const withScheme = raw.replace(/^http:\/\//i, 'https://');
  return SAFE_LINK.test(withScheme) ? withScheme : null;
}

/** A link that will not run code when clicked. Anything else is dropped. */
function safeLink(value) {
  const raw = String(value || '').trim();
  if (!raw) return null;
  return SAFE_LINK.test(raw) ? raw : null;
}

function stripHtml(value) {
  return String(value || '')
    .replace(/<[^>]*>/g, ' ')
    .replace(/&[a-z#0-9]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function limitText(value, max) {
  const text = stripHtml(value);
  return text.length > max ? `${text.slice(0, max - 1).trimEnd()}…` : text;
}

/** Never echo a credential: it lives in the query string of some of these URLs. */
function redactKeys(text) {
  return String(text || '')
    .replace(/api_key=[^&\s"']+/gi, 'api_key=•••')
    .replace(/client_id=[^&\s"']+/gi, 'client_id=•••')
    .replace(/key=[^&\s"']{12,}/gi, 'key=•••');
}

module.exports = { httpsUrl, limitText, redactKeys, safeLink, stripHtml };
