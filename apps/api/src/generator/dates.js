/**
 * Human dates from the command box.
 *
 * A model asked for "12 December" will return that string verbatim, and the UI
 * has to show a real countdown, so this is the single place text becomes a
 * timestamp: ISO first, then the phrasings people actually type. Anything we
 * cannot read returns null and the caller keeps the existing target.
 */

const MONTHS = {
  january: 0, jan: 0,
  february: 1, feb: 1,
  march: 2, mar: 2,
  april: 3, apr: 3,
  may: 4,
  june: 5, jun: 5,
  july: 6, jul: 6,
  august: 7, aug: 7,
  september: 8, sep: 8, sept: 8,
  october: 9, oct: 9,
  november: 10, nov: 10,
  december: 11, dec: 11,
};

const NUMBERS = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, twelve: 12, fifteen: 15, twenty: 20, thirty: 30 };

const DAY = 86400000;

function at(hour, month, day, year) {
  const d = new Date(Date.UTC(year, month, day, hour, 0, 0));
  return Number.isNaN(d.getTime()) ? null : d.toISOString();
}

/** Next occurrence of a month/day, this year if it is still ahead of us. */
function nextMonthDay(month, day, now) {
  const candidate = new Date(Date.UTC(now.getUTCFullYear(), month, day, 20, 0, 0));
  if (candidate.getTime() <= now.getTime()) candidate.setUTCFullYear(candidate.getUTCFullYear() + 1);
  return candidate.toISOString();
}

function parseDateLoose(input, now = new Date()) {
  const raw = String(input || '').trim();
  if (!raw) return null;

  // Already ISO-ish — accept it untouched.
  const strict = new Date(/^\d{4}-\d{2}-\d{2}/.test(raw) ? raw : raw);
  if (/^\d{4}-\d{2}-\d{2}(T[\d:.]+Z?)?$/.test(raw) && !Number.isNaN(strict.getTime())) return strict.toISOString();

  const text = raw.toLowerCase().replace(/[.,!]/g, '');
  const stamp = new Date(now);
  let m;

  if (/^(tonight|this evening)$/.test(text)) return at(20, stamp.getUTCMonth(), stamp.getUTCDate(), stamp.getUTCFullYear());
  if (text === 'tomorrow') return at(20, stamp.getUTCMonth(), stamp.getUTCDate() + 1, stamp.getUTCFullYear());
  if (text === 'next week') return at(20, stamp.getUTCMonth(), stamp.getUTCDate() + 7, stamp.getUTCFullYear());
  if (text === 'next month') return at(20, stamp.getUTCMonth() + 1, stamp.getUTCDate(), stamp.getUTCFullYear());
  if (/(new year'?s? (day|eve)?|midnight on the 31st)/.test(text)) return nextMonthDay(0, 1, stamp);
  if (/christmas|boxing day/.test(text)) return nextMonthDay(11, 25, stamp);
  if (/valentine/.test(text)) return nextMonthDay(1, 14, stamp);
  if (/halloween/.test(text)) return nextMonthDay(9, 31, stamp);

  // "in 3 weeks", "within 10 days", "in a month"
  if ((m = text.match(/\b(?:in|within|after)\s+(\d+|[a-z]+)\s*(hours?|days?|weeks?|months?)\b/))) {
    const amount = Number(m[1]) || NUMBERS[m[1]];
    if (amount) {
      const unit = m[2].replace(/s$/, '');
      const date = new Date(stamp.getTime());
      if (unit === 'hour') date.setUTCHours(date.getUTCHours() + amount);
      else if (unit === 'day') date.setUTCDate(date.getUTCDate() + amount);
      else if (unit === 'week') date.setUTCDate(date.getUTCDate() + amount * 7);
      else date.setUTCMonth(date.getUTCMonth() + amount);
      date.setUTCHours(20, 0, 0, 0);
      return date.toISOString();
    }
  }

  // "12 December", "December 12", "the 12th of Dec, 2026"
  const monthName = Object.keys(MONTHS).join('|');
  const day = '(\\d{1,2})(?:st|nd|rd|th)?';
  const year = '(?:\\s*,?\\s*(\\d{4}))?';
  const dayFirst = text.match(new RegExp(`\\b${day}\\s*(?:of\\s+|/|\\s)?(${monthName})\\b${year}`));
  const monthFirst = text.match(new RegExp(`\\b(${monthName})\\s+${day}\\b${year}`));
  const found = dayFirst
    ? { month: MONTHS[dayFirst[2]], dayOfMonth: Number(dayFirst[1]), year: dayFirst[3] }
    : monthFirst
      ? { month: MONTHS[monthFirst[1]], dayOfMonth: Number(monthFirst[2]), year: monthFirst[3] }
      : null;
  if (found && found.month !== undefined && found.dayOfMonth >= 1 && found.dayOfMonth <= 31) {
    return found.year
      ? at(20, found.month, found.dayOfMonth, Number(found.year))
      : nextMonthDay(found.month, found.dayOfMonth, stamp);
  }

  // "2026-12-12T18:00Z" style full timestamps
  const parsed = new Date(raw);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

module.exports = { parseDateLoose, MONTHS };
