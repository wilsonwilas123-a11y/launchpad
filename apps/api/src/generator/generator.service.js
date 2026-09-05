/**
 * Generation + AI-edit orchestration.
 *
 * Always: master prompt → deterministic compile (guaranteed-good baseline) →
 * model pass merged over it (Ollama or LM Studio or any other configured
 * local server, when it answers) → validate → asset assignment. If the model
 * is down, slow, or returns junk after the JSON repair retries, the baseline
 * stands and the response says exactly why.
 */

const { config } = require('../config');
const { STORE_TOKEN } = require('../common/tokens');
const { getOllamaClient, resolveAiMode } = require('./ollama');
const { getLmStudioClient, getOpenAiCompatibleClient } = require('./lmstudio');
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
    // The clients are what talks to Ollama / LM Studio / anything OpenAI-shaped.
    // Tests and embedding code can swap them on the instance.
    this.clients = { ollama: getOllamaClient(), lmstudio: getLmStudioClient(), llm: getOpenAiCompatibleClient() };
    this.client = this.clients.ollama;
    this.db = null;
    // Per-server timing, because the wizard paces its checklist against it and
    // a 30B local model is a very different clock from the compiler.
    this.measurements = { local: 320 };
    this.aiCache = null;
    this.aiCachedAt = 0;
    this.aiCacheKey = '';
    this.aiClient = null;
    this.failures = [];
  }

  async dbReady() {
    if (!this.db) this.db = await this.storePromise;
    return this.db;
  }

  /** Cheap probe for the UI: what is the AI layer actually doing right now? */
  async describeAi({ refresh = false } = {}) {
    const key = [config.ai.provider, this.clients.llm ? 'llm' : '-', config.ai.lmstudio.baseUrl, config.ai.ollamaUrl, config.ai.lmstudio.model, config.ai.model].join('|');
    const fresh = refresh || !this.aiCache || this.aiCacheKey !== key || Date.now() - this.aiCachedAt > 20000;
    if (fresh) {
      const started = Date.now();
      let mode;
      try {
        mode = await resolveAiMode(undefined, this.clients);
      } catch (error) {
        mode = { useModel: false, provider: 'local', reason: error.message, error: true };
      }
      // The client itself is never part of the cached payload — it is a live
      // connection object and this object goes out over HTTP inside the
      // generate response.
      this.aiClient = mode.useModel ? mode.client : null;
      let models = [];
      if (this.aiClient) models = await this.aiClient.listModels().catch(() => []);
      this.aiCache = {
        provider: mode.useModel ? mode.provider : 'local',
        label: mode.label || 'Local spec compiler',
        model: mode.model || null,
        modelNote: mode.modelNote || null,
        reachable: Boolean(mode.useModel),
        reason: mode.reason || null,
        endpoint: mode.endpoint || null,
        models: models.map((m) => m.name),
        candidates: mode.candidates || null,
        probeMs: Date.now() - started,
        measuredMs: this.measurements[mode.useModel ? mode.provider : 'local'] || null,
        recentFailures: this.failures.slice(-3),
      };
      this.aiCacheKey = key;
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

    if (ai.reachable && this.aiClient) {
      try {
        const promptText = buildSpecPrompt({
          masterPrompt: prompt,
          websiteType: project.type,
          platform: baseSpec.platform,
          assets,
          design,
          details,
        });
        const result = await generateWithRepair(this.aiClient, ai.model, promptText, config.ai.maxRetries, {
          system: 'You output only valid JSON matching the schema. Never prose. Never markdown fences.',
        });
        const merged = mergeLlmSpec(baseSpec, result.value, { intent: design });
        const validation = validateSpec(merged.spec);
        if (validation.ok) {
          spec = merged.spec;
          aiReport = {
            provider: ai.provider,
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
        fallbackReason = error.timeout ? `${ai.label || 'The model'} timed out after ${config.ai.timeoutMs}ms` : error.message;
        this.failures.push({ at: new Date().toISOString(), stage: 'generate', message: error.message, attempts: error.attempts || 1 });
      }
    } else {
      fallbackReason = ai.reason || `${ai.label || 'No model server'} is not reachable`;
    }

    const elapsedMs = Date.now() - started;
    this.measurements[ai.reachable ? ai.provider : 'local'] = elapsedMs;

    spec.meta = {
      ...spec.meta,
      generatedBy: aiReport ? `${ai.provider}:${ai.model}` : 'launchpad-compiler',
      masterPrompt: prompt,
      assetNotes: undefined,
      aiProvider: aiReport ? ai.provider : 'local',
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
      provider: aiReport ? ai.provider : 'local',
      model: ai.model,
      ai,
      fallbackReason: aiReport ? null : fallbackReason,
      pacing: pacingFor({
        provider: aiReport ? ai.provider : 'local',
        model: ai.model,
        lastElapsedMs: this.measurements[aiReport ? ai.provider : 'local'],
      }),
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

    if (ai.reachable && this.aiClient) {
      try {
        const promptText = buildEditPrompt({ command, spec: current });
        const result = await generateWithRepair(this.aiClient, ai.model, promptText, config.ai.maxRetries, {
          system: 'You output only valid JSON: {"ops":[…],"summary":"…"}. No prose.',
          options: { num_predict: 900, temperature: 0.2 },
        });
        const value = result.value || {};
        if (Array.isArray(value.ops)) ops = value.ops;
        if (value.summary) modelNote = String(value.summary).slice(0, 160);
        source = ai.provider;
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
        source = parsed.ops.length && source !== 'rules' ? `${source}+rules` : 'rules';
      } else if (!outcome.changed) {
        outcome = outcome || { spec: current, changed: false, results: [], summaryTexts: [], failures: [] };
      }
    }

    const elapsedMs = Date.now() - started;
    const fromModel = source !== 'rules';
    const summary = modelNote && fromModel ? modelNote : outcome.summaryTexts.join(' · ') || `I could not turn “${command}” into a change yet.`;
    return {
      spec: outcome.spec,
      changed: outcome.changed,
      summary,
      changes: outcome.summaryTexts,
      rejected: [...(outcome.failures || []), ...(readAs ? [] : [])],
      ops: fromModel ? ops : parseCommandRules(command, current).ops,
      source,
      readAs,
      elapsedMs,
      model: ai.model,
      pacing: pacingFor({ provider: fromModel ? source : 'local', model: ai.model, lastElapsedMs: elapsedMs }),
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
