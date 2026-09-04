import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import { bytes, classList, countdownParts, cx, initials, isVideo, pad2, relativeTime, themeVars, titleCase, truncate } from '../src/lib/format.js';

/**
 * These are the pieces the site renderer and the dashboard both depend on, and
 * they are pure — so they are worth pinning down without a browser.
 */

test('bytes reads the way a person would say it', () => {
  assert.equal(bytes(0), '0 B');
  assert.equal(bytes(1023), '1023 B');
  assert.equal(bytes(1500), '1.5 KB');
  assert.equal(bytes(90_000), '88 KB');
  assert.equal(bytes(5 * 1024 * 1024), '5.0 MB');
  assert.equal(bytes(undefined), '0 B');
});

test('relativeTime never leaves a blank where a date should be', () => {
  assert.equal(relativeTime(new Date().toISOString()), 'just now');
  assert.equal(relativeTime(new Date(Date.now() - 9 * 60_000).toISOString()), '9 min ago');
  assert.equal(relativeTime(new Date(Date.now() - 3 * 3_600_000).toISOString()), '3 hrs ago');
  assert.equal(relativeTime(new Date(Date.now() - 2 * 86_400_000).toISOString()), '2 days ago');
  assert.equal(relativeTime(''), '');
  assert.equal(relativeTime('not a date'), '');
});

test('countdown clamps a date that has passed instead of going negative', () => {
  // `now` is passed in rather than read from the clock: a countdown test that
  // ticks over a second boundary would otherwise fail on a busy machine.
  const now = Date.UTC(2026, 8, 4, 12, 0, 0);
  const future = countdownParts(new Date(now + 90 * 3_600_000).toISOString(), now);
  assert.equal(future.past, false);
  assert.equal(future.days, 3);
  assert.equal(future.hours, 18);
  assert.ok(future.label.length > 3);

  const past = countdownParts(new Date(now - 60_000).toISOString(), now);
  assert.equal(past.past, true);
  assert.deepEqual({ d: past.days, h: past.hours, m: past.minutes, s: past.seconds }, { d: 0, h: 0, m: 0, s: 0 });

  // A date the generator could not parse must read as "no countdown", not as 1970.
  assert.deepEqual(countdownParts('nope'), { past: false, days: 0, hours: 0, minutes: 0, seconds: 0, label: '' });
});

test('titleCase turns section keys into labels', () => {
  assert.equal(titleCase('product_showcase'), 'Product Showcase');
  assert.equal(titleCase('pre-save'), 'Pre Save');
  assert.equal(titleCase(''), '');
});

test('initials, truncate and pad2 behave at the edges', () => {
  assert.equal(initials('Ada Lovelace'), 'AL');
  assert.equal(initials('Onlyname'), 'O');
  assert.equal(initials(''), '●');
  assert.equal(truncate('one  two', 90), 'one two');
  assert.equal(truncate('x'.repeat(20), 10), `${'x'.repeat(9)}…`);
  assert.equal(pad2(7), '07');
});

test('video files are told apart from images by name or mime', () => {
  assert.equal(isVideo('clip.mp4'), true);
  assert.equal(isVideo('CLIP.MOV'), true);
  assert.equal(isVideo('video/quicktime'), true);
  assert.equal(isVideo('poster.jpg'), false);
  assert.equal(isVideo(undefined), false);
});

test('cx joins truthy class names', () => {
  assert.equal(classList('a', false && 'b', 'c'), 'a c');
  assert.equal(cx('a', null, undefined, 'b'), 'a b');
});

test('themeVars is the only bridge from a spec theme to CSS', () => {
  const vars = themeVars(
    {
      colors: { background: '#0b0b10', accent: '#ff0055' },
      radius: 4,
      typography: { scale: 1.2, bodySize: 18, headingFont: 'display', headingWeight: 700, headingTracking: '-0.04em' },
    },
    { sectionPadding: 80, maxWidth: 1080 },
  );
  assert.equal(vars['--s-bg'], '#0b0b10');
  assert.equal(vars['--s-accent'], '#ff0055');
  assert.equal(vars['--s-surface'], '#131318', 'unset colours fall back, they never go transparent');
  assert.equal(vars['--s-radius'], '4px');
  assert.equal(vars['--s-body'], '18px');
  assert.equal(vars['--s-heading'], 'var(--ff-display)');
  assert.equal(vars['--s-heading-tracking'], '-0.04em');
  assert.equal(vars['--s-pad'], '80px');
  assert.equal(vars['--s-max'], '1080px');
  assert.equal(vars['--s-title'], `${Math.round(16 * 1.2 ** 5)}px`);
});

test('themeVars survives an empty theme', () => {
  const vars = themeVars();
  assert.equal(vars['--s-bg'], '#0a0a0c');
  assert.equal(vars['--s-scale'], '1.14');
  assert.equal(vars['--s-pad'], '104px');
});
