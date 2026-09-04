/**
 * Stage timeline for the cinematic "Building your launch…" screen.
 *
 * Local models are slower than hosted APIs, so pacing comes from *measured*
 * durations: the API returns the last generation's elapsed time (per provider
 * and model), and the client stretches or compresses the checklist against it
 * instead of faking a fixed 2-second show.
 */

const STAGES = [
  { key: 'understand', label: 'Understanding your idea', weight: 0.12, detail: 'Reading the description for brand, audience, mood and asks' },
  { key: 'plan', label: 'Planning your website', weight: 0.11, detail: 'Deciding the promise of the page and how to order it' },
  { key: 'layout', label: 'Creating your layout', weight: 0.13, detail: 'Composing hero, rhythm and density for the target screens' },
  { key: 'sections', label: 'Selecting sections', weight: 0.12, detail: 'Choosing only the sections your launch needs' },
  { key: 'design', label: 'Applying your design direction and visual style', weight: 0.13, detail: 'Palette, type scale, effects and spacing' },
  { key: 'assets', label: 'Adding your assets', weight: 0.11, detail: 'Matching each image to the section it belongs in' },
  { key: 'optimise', label: 'Optimizing for your selected platform', weight: 0.14, detail: 'Re-composing navigation, grids and type for the targets' },
  { key: 'publish', label: 'Preparing your live website', weight: 0.14, detail: 'Building the shareable URL' },
];

const MIN_STAGE_MS = 260;
const FLOOR_TOTAL_MS = 3200;
const OLLAMA_FLOOR_TOTAL_MS = 9000;

/** Pacing envelope handed to the client for a given provider/model. */
function pacingFor({ provider, model, lastElapsedMs }) {
  const measured = Number.isFinite(lastElapsedMs) && lastElapsedMs > 0 ? Math.round(lastElapsedMs) : null;
  const isLocalModel = provider === 'ollama';
  const floor = isLocalModel ? OLLAMA_FLOOR_TOTAL_MS : FLOOR_TOTAL_MS;
  let total = measured ? Math.round(Math.min(Math.max(measured * 0.92, floor), 180000)) : floor;
  // Long model runs get a softer ceiling: the animation should finish shortly
  // after the request, not sit on the last item for a minute.
  if (measured && measured > 45000) total = Math.round(measured * 0.96);
  const steps = STAGES.map((stage, index) => ({
    ...stage,
    index,
    minMs: MIN_STAGE_MS,
    ms: Math.max(MIN_STAGE_MS, Math.round(total * stage.weight)),
  }));
  return {
    provider: provider || 'local',
    model: model || null,
    measuredMs: measured,
    totalMs: total,
    steps,
    note: isLocalModel
      ? `Paced to ${model || 'the local model'}'s recent generation time`
      : 'Local spec compiler — quick, deterministic',
  };
}

function statusLabel(status) {
  return {
    draft: 'Draft',
    generating: 'Generating…',
    ready: 'Ready to publish',
    publishing: 'Publishing…',
    live: 'Live',
  }[status] || status;
}

module.exports = { STAGES, pacingFor, statusLabel, FLOOR_TOTAL_MS, OLLAMA_FLOOR_TOTAL_MS };
