const test = require('node:test');
const assert = require('node:assert/strict');

const { buildMasterPrompt } = require('../src/generator/prompt');
const { STAGES, pacingFor } = require('../src/generator/stages');
const { compileSpec } = require('../src/generator/compile');
const { hydrateAsset } = require('../src/generator/assets');
const { parseDateLoose } = require('../src/generator/dates');
const { parseCommandRules, applyOps } = require('../src/generator/commands');
const { tryParse } = require('../src/generator/json-repair');

const baseSpec = () => compileSpec({ description: 'A premium streetwear drop site with a countdown and a waitlist', websiteType: 'product' });

test('master prompt carries every decision the user made', () => {
  const prompt = buildMasterPrompt(
    'I am launching NOVA, a Nigerian streetwear label',
    { category: 'product', name: 'Futuristic Mono', styleTags: ['dark', 'cinematic'], layoutHints: 'full-bleed type', colorPalette: ['#000000', '#ffffff'] },
    { businessName: 'NOVA', tagline: 'Runs of 180', desiredSections: ['hero', 'countdown'], excludedSections: ['pricing'], audience: '18-30 Lagos creatives', goal: 'Waitlist signups', platforms: ['mobile', 'desktop'], extraNotes: 'no stock photos' },
  );
  assert.match(prompt, /NOVA/);
  assert.match(prompt, /Runs of 180/);
  assert.match(prompt, /Futuristic Mono/);
  assert.match(prompt, /Lagos creatives/);
  assert.match(prompt, /no stock photos/);
  assert.match(prompt, /hero/);
  assert.match(prompt, /Do NOT include/i);
  assert.match(prompt, /pricing/);
  assert.match(prompt, /mobile/);
  assert.ok(STAGES.length === 8, 'the checklist is 8 steps deep');
});

test('compileSpec produces a renderable, asset-aware spec', () => {
  const spec = baseSpec();
  assert.equal(spec.sections.length > 4, true);
  assert.equal(spec.sections[0].type, 'hero');
  assert.ok(spec.theme.colors.background);
  assert.ok(spec.sections.every((s) => s.id && s.order >= 0));
  assert.deepEqual(spec.sections.map((s) => s.order), spec.sections.map((_, i) => i));
});

test('asset understanding: category drives placement, explicit instructions win', () => {
  const guessed = hydrateAsset({ id: 'a1', filename: 'nova-campaign.png', slot: 'campaign', description: 'Campaign image for the first drop' }, 'product');
  assert.equal(guessed.assetCategory, 'campaign');
  assert.deepEqual(guessed.recommendedSections, ['hero']);
  assert.equal(guessed.selectedSection, null, 'a suggestion is not a placement');

  const told = hydrateAsset({ id: 'a2', filename: 'office.jpg', description: 'Our first studio in Yaba. Use it in the About section' }, 'startup');
  assert.equal(told.selectedSection, 'about');

  const spec = compileSpec({
    description: 'Streetwear drop',
    websiteType: 'product',
    assets: [
      { id: 'x1', filename: 'lookbook.png', description: 'Campaign image for the drop' },
      { id: 'x2', filename: 'runner.png', description: 'Product photo of the runner' },
    ],
  });
  const hero = spec.sections.find((s) => s.type === 'hero');
  const products = spec.sections.find((s) => s.type === 'productShowcase');
  assert.equal(hero.content.imageAssetId, 'x1');
  assert.equal(products.content.products.some((i) => i.imageAssetId === 'x2'), true);
  assert.equal(spec.assetMap.length, 2);
});

test('loose dates parse the phrasings people type', () => {
  const now = new Date('2026-09-04T10:00:00Z');
  assert.equal(parseDateLoose('12 December', now), '2026-12-12T20:00:00.000Z');
  assert.equal(parseDateLoose('December 5', now).startsWith('2026-12-05'), true);
  assert.equal(parseDateLoose('in 3 weeks', now), '2026-09-25T20:00:00.000Z');
  assert.equal(parseDateLoose('tonight', now), '2026-09-04T20:00:00.000Z');
  assert.equal(parseDateLoose('2027-02-01', now).startsWith('2027-02-01'), true);
  assert.equal(parseDateLoose('christmas', now).startsWith('2026-12-25'), true);
  assert.equal(parseDateLoose('someday', now), null);
});

test('command box: colour, section and date edits mutate the spec', () => {
  const run = (command) => {
    const parsed = parseCommandRules(command, baseSpec());
    return applyOps(baseSpec(), parsed.ops, { name: 'KRO' });
  };

  const colors = run('make it black and white');
  assert.equal(colors.changed, true);
  assert.equal(colors.spec.theme.colors.background.toLowerCase(), '#000000');
  assert.equal(colors.spec.theme.colors.text.toLowerCase(), '#ffffff');

  const removed = run('remove the pricing section');
  assert.equal(removed.spec.sections.some((s) => s.type === 'pricing'), false);

  const added = run('add faq');
  assert.equal(added.spec.sections.some((s) => s.type === 'faq'), true);

  const dated = run('add a countdown to 12 december');
  const countdown = dated.spec.sections.find((s) => s.type === 'countdown');
  assert.equal(countdown.content.targetIso.startsWith('2026-12-12'), true, dated.summaryTexts.join(','));

  const reordered = run('move the countdown above the waitlist');
  const types = reordered.spec.sections.map((s) => s.type);
  assert.ok(types.indexOf('countdown') < types.indexOf('waitlist'), types.join('→'));
});

test('a sneaker "drop" is not a request to delete the showcase', () => {
  const spec = baseSpec();
  const parsed = parseCommandRules('the drop is on christmas, make it red', spec);
  const out = applyOps(spec, parsed.ops, { name: 'KRO' });
  assert.equal(out.spec.sections.some((s) => s.type === 'productShowcase'), true, 'showcase survived');
  assert.equal(out.spec.theme.colors.accent.toLowerCase(), '#ef4444', out.summaryTexts.join(','));
  const countdown = out.spec.sections.find((s) => s.type === 'countdown');
  assert.equal(countdown.content.targetIso.startsWith('2026-12-25'), true);
});

test('a command that cannot be honoured says so instead of faking it', () => {
  const spec = baseSpec();
  const out = applyOps(spec, [{ op: 'setCountdownTarget', targetIso: 'whenever' }], {});
  assert.equal(out.changed, false);
  assert.match(JSON.stringify(out.results), /did not parse/);
});

test('json repair recovers what a small model actually emits', () => {
  const dirty = 'Sure! Here you go:\n```json\n{"name": "NOVA", "sections": [{"type": "hero"},],}\n```\nHope that helps.';
  const parsed = tryParse(dirty);
  assert.equal(parsed.ok, true);
  assert.equal(parsed.value.name, 'NOVA');
  assert.equal(parsed.value.sections[0].type, 'hero');
  assert.equal(tryParse('nothing json here at all').ok, false);
});

test('generation pacing follows the real elapsed time, not a fixed delay', () => {
  const local = pacingFor({ provider: 'local', lastElapsedMs: 18 });
  const slow = pacingFor({ provider: 'ollama', lastElapsedMs: 96000 });
  assert.equal(local.steps.length, 8);
  assert.ok(slow.totalMs > local.totalMs * 8, 'a slow model must not finish the checklist early');
  const total = local.steps.reduce((sum, step) => sum + step.ms, 0);
  assert.ok(Math.abs(total - local.totalMs) < 1200, 'steps add up to the announced total');
});

test('every design direction stays legible, whatever the user asks for in words', () => {
  const { DESIGNS } = require('../src/catalog/designs');
  const { utils } = require('../src/generator/interpret');
  const asks = [
    'A launch with a countdown and a waitlist',
    'Clean white minimal site with big serif type',
    'Make the colors black and white',
    'Moody neon, loud and colourful',
    'I want a light cream palette with dark ink',
  ];
  for (const design of DESIGNS) {
    for (const description of asks) {
      const colors = compileSpec({ description, websiteType: design.category, design }).theme.colors;
      const label = `${design.id} / "${description.slice(0, 18)}"`;
      assert.ok(utils.contrastRatio(colors.text, colors.background) >= 4.5, `body text illegible: ${label}`);
      assert.ok(utils.contrastRatio(colors.textMuted, colors.background) >= 2.6, `muted text illegible: ${label}`);
      assert.ok(utils.contrastRatio(colors.accentText, colors.accent) >= 3, `button ink illegible: ${label}`);
      assert.ok(utils.contrastRatio(colors.accent, colors.background) >= 1.15, `accent invisible: ${label}`);
    }
  }
});
