/**
 * Generation + AI-edit orchestration.
 *
 * Always: master prompt → deterministic compile (guaranteed-good baseline) →
 * Ollama pass merged over it (when a local model is reachable) → validate →
 * asset assignment. If Ollama is down, slow, or returns junk after the JSON
 * repair retries, the baseline stands and the response says exactly why.
 */

const { config } = require('../config');
const { STORE_TOKEN } = require('../common/tokens');
const { getOllamaClient, resolveAiMode } = require('./ollama');
const { generateWithRepair } = require('./json-repair');
const { buildMasterPrompt, inferDesignDirection } = require('./prompt');
const { compileSpec, slugify } = require('./compile');
const { mergeLlmSpec, validateSpec } = require('./normalize');
const { analyze } = require('./interpret');
const { hydrateAsset } = require('./assets');
const { buildSpecPrompt, buildEditPrompt } = require('./spec-prompt');
const { parseCommandRules, applyOps, sectionFactory, labelOf } = require('./commands');
const { pacingFor } = require('./stages');
const { designById } = require('../catalog/designs');

class GeneratorService {
  constructor(store) {
    this.storePromise = store;
    this.client = getOllamaClient();
    this.db = null;
    this.measurements = { local: 320, ollama: null };
    this.aiCache = null;
    this.aiCachedAt = 0;
    this.failures = [];
  }

  async dbReady() {
    if (!this.db) this.db = await this.storePromise;
    return this.db;
  }

  /** Cheap probe for the UI: what is the AI layer actually doing right now? */
  async describeAi({ refresh = false } = {}) {
    const fresh = refresh || !this.aiCache || Date.now() - this.aiCachedAt > 20000;
    if (fresh) {
      const started = Date.now();
      let mode;
      try {
        mode = await resolveAiMode(this.client);
      } catch (error) {
        mode = { useOllama: false, provider: 'local', reason: error.message, error: true };
      }
      let models = [];
      if (mode.useOllama) {
        models = await this.client.listModels().catch(() => []);
      }
      this.aiCache = {
        provider: mode.useOllama ? 'ollama' : 'local',
        model: mode.model || null,
        modelNote: mode.modelNote || null,
        reachable: Boolean(mode.useOllama),
        reason: mode.reason || null,
        endpoint: config.ai.ollamaUrl,
        models: models.map((m) => m.name),
        candidates: mode.candidates || null,
        probeMs: Date.now() - started,
        measuredMs: this.measurements[mode.useOllama ? 'ollama' : 'local'] || null,
        recentFailures: this.failures.slice(-3),
      };
      this.aiCachedAt = Date.now();
    }
    return this.aiCache;
  }

  /** Design + details + assets, ready for the prompt builder. */
  prepare(project) {
    const description = project.description || '';
    const details = {
      businessName: (project.designDetails && project.designDetails.businessName) || project.name || '',
      tagline: (project.designDetails && project.designDetails.tagline) || '',
      desiredSections: (project.designDetails && project.designDetails.desiredSections) || [],
      excludedSections: (project.designDetails && project.designDetails.excludedSections) || [],
      extraNotes: (project.designDetails && project.designDetails.extraNotes) || '',
      audience: project.targetAudience || (project.designDetails && project.designDetails.audience) || '',
      goal: project.goal || (project.designDetails && project.designDetails.goal) || '',
      visualDirection: project.visualDirection || '',
      platforms: project.selectedPlatforms || [],
      websiteType: project.type || 'other',
    };
    // A selection whose id we do not ship is treated as "no gallery pick", so the
    // inferred direction (built from the words) fills in coherently.
    const design = project.selectedDesign ? designById(project.selectedDesign.id) : null;
    const assets = (project.assets || []).map((a) => hydrateAsset(a, project.type));
    return { description, details, design, assets };
  }

  masterPromptFor(project, prepared) {
    const { description, details, design, assets } = prepared;
    const inferred =
      design ||
      inferDesignDirection({
        keywords: (description.toLowerCase().match(/[a-z][a-z-]{3,}/g) || []),
        websiteType: project.type || 'other',
        visualDirection: project.visualDirection || '',
      });
    if (!details.businessName) details.businessName = analyze({ description, websiteType: project.type }).brand;
    if (!details.desiredSections.length) {
      details.desiredSections = analyze({ description, websiteType: project.type }).requestedSections || [];
    }
    return {
      design: inferred,
      details,
      assets,
      prompt: buildMasterPrompt(description, { ...inferred, ...(design || {}), category: project.type || inferred.category }, details),
      extra: { assetNotes: assets.filter((a) => a.description).map((a) => `${a.filename}: ${a.description}`) },
    };
  }

  async generate(project, options = {}) {
    const prepared = this.prepare(project);
    const { prompt, design, details, assets } = this.masterPromptFor(project, prepared);
    const started = Date.now();

    const baseSpec = compileSpec({
      description: prepared.description,
      websiteType: project.type,
      design,
      details,
      assets,
      visualDirection: project.visualDirection,
      targetAudience: project.targetAudience,
      goal: project.goal,
      platform: { targets: project.selectedPlatforms && project.selectedPlatforms.length ? project.selectedPlatforms : ['mobile', 'desktop'] },
    });

    const ai = await this.describeAi({ refresh: Boolean(options.refreshAi) });
    let spec = baseSpec;
    let aiReport = null;
    let fallbackReason = null;

    if (ai.reachable && config.ai.provider !== 'local') {
      try {
        const promptText = buildSpecPrompt({
          masterPrompt: prompt,
          websiteType: project.type,
          platform: baseSpec.platform,
          assets,
          design,
          details,
        });
        const result = await generateWithRepair(this.client, ai.model, promptText, config.ai.maxRetries, {
          system: 'You output only valid JSON matching the schema. Never prose. Never markdown fences.',
        });
        const merged = mergeLlmSpec(baseSpec, result.value, { intent: design });
        const validation = validateSpec(merged.spec);
        if (validation.ok) {
          spec = merged.spec;
          aiReport = {
            model: ai.model,
            attempts: result.attempts,
            repairedLocally: result.repairedApplied ?? result.repairedLocally,
            appliedFields: merged.report.applied.slice(0, 40),
            addedSections: merged.report.added,
            skipped: merged.report.skipped.slice(0, 12),
            usage: result.usage,
          };
        } else {
          fallbackReason = `model JSON was not usable (${validation.errors.slice(0, 3).join(', ')})`;
        }
      } catch (error) {
        fallbackReason = error.timeout ? `Ollama timed out after ${config.ai.timeoutMs}ms` : error.message;
        this.failures.push({ at: new Date().toISOString(), stage: 'generate', message: error.message, attempts: error.attempts || 1 });
      }
    } else {
      fallbackReason = ai.reason || 'Ollama not reachable';
    }

    const elapsedMs = Date.now() - started;
    this.measurements[ai.reachable ? 'ollama' : 'local'] = elapsedMs;

    spec.meta = {
      ...spec.meta,
      generatedBy: aiReport ? `ollama:${ai.model}` : 'launchpad-compiler',
      masterPrompt: prompt,
      assetNotes: undefined,
      aiProvider: aiReport ? 'ollama' : 'local',
      aiModel: ai.model,
      aiReport,
      fallbackReason: aiReport ? null : fallbackReason,
      elapsedMs,
      seed: spec.seed,
      designName: design.name,
      designStyleTags: design.styleTags,
      designLayoutHints: design.layoutHints,
      designPalette: design.colorPalette,
      slugHint: slugify(spec.name),
    };

    return {
      spec,
      masterPrompt: prompt,
      design,
      details,
      elapsedMs,
      provider: aiReport ? 'ollama' : 'local',
      model: ai.model,
      ai,
      fallbackReason: aiReport ? null : fallbackReason,
      pacing: pacingFor({ provider: aiReport ? 'ollama' : 'local', model: ai.model, lastElapsedMs: this.measurements[aiReport ? 'ollama' : 'local'] }),
      status: 'ready',
    };
  }

  async refine(project, command, options = {}) {
    const started = Date.now();
    const current = project.spec;
    if (!current) throw new Error('Nothing to edit yet — generate the website first.');
    const ai = await this.describeAi();
    const context = { factory: sectionFactory(current), spec: current };
    let source = 'rules';
    let ops = [];
    let readAs = null;
    let modelNote = null;

    if (ai.reachable && config.ai.provider !== 'local') {
      try {
        const promptText = buildEditPrompt({ command, spec: current });
        const result = await generateWithRepair(this.client, ai.model, promptText, config.ai.maxRetries, {
          system: 'You output only valid JSON: {"ops":[…],"summary":"…"}. No prose.',
          options: { num_predict: 900, temperature: 0.2 },
        });
        const value = result.value || {};
        if (Array.isArray(value.ops)) ops = value.ops;
        if (value.summary) modelNote = String(value.summary).slice(0, 160);
        source = 'ollama';
      } catch (error) {
        modelNote = `model could not parse this (${error.message})`;
        this.failures.push({ at: new Date().toISOString(), stage: 'refine', message: error.message });
      }
    }

    let outcome = ops.length ? applyOps(current, ops, context) : { spec: current, changed: false, results: [], summaryTexts: [], failures: [] };
    if (!outcome.changed) {
      const parsed = parseCommandRules(command, current);
      readAs = parsed.readAs || null;
      const ruleOutcome = parsed.ops.length ? applyOps(current, parsed.ops, context) : null;
      if (ruleOutcome && ruleOutcome.changed) {
        outcome = ruleOutcome;
        source = parsed.ops.length && source === 'ollama' ? 'ollama+rules' : 'rules';
      } else if (!outcome.changed) {
        outcome = outcome || { spec: current, changed: false, results: [], summaryTexts: [], failures: [] };
      }
    }

    const elapsedMs = Date.now() - started;
    const summary = modelNote && source.startsWith('ollama') ? modelNote : outcome.summaryTexts.join(' · ') || `I could not turn “${command}” into a change yet.`;
    return {
      spec: outcome.spec,
      changed: outcome.changed,
      summary,
      changes: outcome.summaryTexts,
      rejected: [...(outcome.failures || []), ...(readAs ? [] : [])],
      ops: source.startsWith('ollama') ? ops : parseCommandRules(command, current).ops,
      source,
      readAs,
      elapsedMs,
      model: ai.model,
      pacing: pacingFor({ provider: source === 'rules' ? 'local' : 'ollama', model: ai.model, lastElapsedMs: elapsedMs }),
    };
  }

  /** Preview of what the compiler would do, used by the wizard live-preview. */
  preview(input) {
    const design = input.designId ? designById(input.designId) : null;
    const spec = compileSpec({
      description: input.description || '',
      websiteType: input.websiteType || 'other',
      design: design || inferDesignDirection({ keywords: (String(input.description || '').toLowerCase().match(/[a-z][a-z-]{3,}/g) || []), websiteType: input.websiteType }),
      details: input.details || { desiredSections: [] },
      assets: input.assets || [],
      platform: input.platform || { targets: ['mobile', 'desktop'] },
    });
    return { spec, masterPrompt: spec.meta.masterPrompt, sectionTypes: spec.sections.map((s) => s.type) };
  }
}

module.exports = { GeneratorService };
