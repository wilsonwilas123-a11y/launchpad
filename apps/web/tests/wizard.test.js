import { strict as assert } from 'node:assert';
import { test } from 'node:test';
import {
  clearDraft,
  composeVisualDirection,
  DESCRIPTION_PLACEHOLDERS,
  draftToProjectInput,
  emptyDraft,
  LAUNCH_TYPES,
  loadDraft,
  PLATFORM_OPTIONS,
  saveDraft,
  STEPS,
} from '../src/lib/wizard.js';

test('the wizard is five steps and the rail follows the same list', () => {
  assert.deepEqual(STEPS.map((step) => step.key), ['idea', 'platform', 'design', 'details', 'assets']);
  STEPS.forEach((step) => assert.ok(step.label && step.title && step.hint, `${step.key} needs label, title and hint`));
});

test('every launch type the grid offers has a description prompt', () => {
  assert.ok(LAUNCH_TYPES.length >= 9, 'the landing grid promises at least nine kinds');
  LAUNCH_TYPES.forEach((type) => {
    assert.equal(typeof DESCRIPTION_PLACEHOLDERS[type.id], 'string', `${type.id} needs an example sentence`);
    assert.ok(DESCRIPTION_PLACEHOLDERS[type.id].split(' ').length > 5, `${type.id} placeholder should read like a real description`);
  });
  assert.ok(LAUNCH_TYPES.some((type) => type.id === 'other'), '"Something else" has to be reachable');
  assert.equal(PLATFORM_OPTIONS.length, 3);
});

test('an empty draft is complete enough to render step one with no guards', () => {
  const draft = emptyDraft();
  assert.equal(draft.type, '');
  assert.equal(draft.projectId, null);
  assert.deepEqual(draft.selectedPlatforms, ['mobile', 'desktop']);
  assert.equal(typeof draft.designDetails, 'object');
  assert.deepEqual(draft.assets, []);
  assert.equal(emptyDraft({ type: 'music' }).type, 'music');
});

test('the payload sent to the API carries the choices, not the scaffolding', () => {
  const draft = emptyDraft({ type: 'product', description: 'A small batch of chairs.', selectedDesign: { id: 'x', name: 'X', colorPalette: ['#000'], junk: true } });
  const input = draftToProjectInput(draft);
  assert.equal(input.type, 'product');
  assert.equal(input.description, 'A small batch of chairs.');
  assert.equal(input.name, undefined, 'no name means the server derives one');
  assert.deepEqual(input.selectedDesign, { id: 'x', name: 'X' }, 'only the id and label cross the wire; the server resolves the rest');
  assert.deepEqual(input.selectedPlatforms, ['mobile', 'desktop']);
});

test('the visual direction is composed from what was picked, and "any" is not a style', () => {
  assert.equal(composeVisualDirection(emptyDraft()), 'modern layout');
  const draft = emptyDraft({ visualDirection: 'cinematic, lots of negative space', style: 'any', colours: 'monochrome', mood: 'slow-burn', typography: 'serif' });
  assert.equal(composeVisualDirection(draft), 'cinematic, lots of negative space, monochrome palette, slow burn mood, serif type');
});

test('the draft survives without sessionStorage', () => {
  // Node has no sessionStorage at all: the flow must keep working in memory.
  assert.equal(loadDraft(), null);
  saveDraft(emptyDraft({ description: 'kept' }));
  assert.equal(loadDraft(), null);
  assert.doesNotThrow(() => clearDraft());
});
