/**
 * JSON-repair retry loop for local model output.
 *
 * A hosted frontier model almost always returns parseable JSON when asked. A
 * local model via Ollama does not — even with `format: "json"`, output gets
 * truncated mid-object or wrapped in prose. So: constrain with format:"json",
 * and if parsing still fails, hand the broken text straight back to the model
 * with an instruction to repair it, up to maxRetries times.
 */

const FENCE = /^\s*```(?:json)?\s*([\s\S]*?)\s*```\s*$/;

/** Strips markdown fences / leading prose and extracts the outermost JSON body. */
function extractJsonBody(text) {
  if (text == null) return null;
  let raw = String(text).trim();
  const fenced = raw.match(FENCE);
  if (fenced) raw = fenced[1].trim();
  const start = raw.indexOf('{');
  const arrayStart = raw.indexOf('[');
  const from = start === -1 ? arrayStart : arrayStart !== -1 && arrayStart < start ? arrayStart : start;
  if (from === -1) return raw;
  const open = raw[from];
  const close = open === '{' ? '}' : ']';
  const end = raw.lastIndexOf(close);
  return end > from ? raw.slice(from, end + 1) : raw.slice(from);
}

/** Last-resort structural fixes for the classic local-model mistakes. */
function relax(raw) {
  let out = String(raw);
  out = out.replace(/^\uFEFF/, '');
  out = out.replace(/,\s*([}\]])/g, '$1'); // trailing commas
  out = out.replace(/([{,]\s*)([A-Za-z_][\w-]*)\s*:/g, '$1"$2":'); // bare keys
  out = out.replace(/:\s*'([^'\n]*)'/g, ': "$1"'); // single-quoted strings
  out = out.replace(/:\s*([A-Za-z][A-Za-z0-9_-]*)\s*(?=[,}\n])/g, ': "$1"'); // bareword values
  out = out.replace(/\bTrue\b/g, 'true').replace(/\bFalse\b/g, 'false').replace(/\bNone\b/g, 'null');
  // Balance unterminated braces/brackets and close open strings.
  out = balanceBrackets(out);
  return out;
}

function balanceBrackets(input) {
  let depth = 0;
  let arrayDepth = 0;
  let inString = false;
  let escaped = false;
  let lastSafe = -1;
  for (let i = 0; i < input.length; i++) {
    const ch = input[i];
    if (inString) {
      if (escaped) escaped = false;
      else if (ch === '\\') escaped = true;
      else if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') inString = true;
    else if (ch === '{') depth++;
    else if (ch === '}') depth = Math.max(0, depth - 1);
    else if (ch === '[') arrayDepth++;
    else if (ch === ']') arrayDepth = Math.max(0, arrayDepth - 1);
    else if (ch === ',' && depth === 1 && arrayDepth === 0) lastSafe = i;
  }
  let out = input;
  if (inString) out += '"';
  out = out.replace(/,\s*$/, '');
  while (arrayDepth-- > 0) out += ']';
  while (depth-- > 0) out += '}';
  try {
    return JSON.parse(out), out;
  } catch {
    if (lastSafe > 0) {
      let truncated = input.slice(0, lastSafe);
      let d = 0;
      let a = 0;
      let str = false;
      let esc = false;
      for (const ch of truncated) {
        if (str) {
          if (esc) esc = false;
          else if (ch === '\\') esc = true;
          else if (ch === '"') str = false;
          continue;
        }
        if (ch === '"') str = true;
        else if (ch === '{') d++;
        else if (ch === '}') d--;
        else if (ch === '[') a++;
        else if (ch === ']') a--;
      }
      truncated = truncated.replace(/,\s*$/, '');
      truncated += ']'.repeat(Math.max(0, a)) + '}'.repeat(Math.max(0, d));
      return truncated;
    }
    return out;
  }
}

function tryParse(text) {
  const raw = extractJsonBody(text);
  if (!raw) return { ok: false, error: 'empty output' };
  try {
    return { ok: true, value: JSON.parse(raw) };
  } catch (first) {
    try {
      return { ok: true, value: JSON.parse(relax(raw)), repaired: true, note: 'repaired locally' };
    } catch {
      return { ok: false, error: first.message, raw };
    }
  }
}

/**
 * @param {{generate: (req: object) => Promise<{response: string}>}} ollamaClient
 * @returns {Promise<object>} parsed JSON
 */
async function generateWithRepair(ollamaClient, model, prompt, maxRetries = 2, options = {}) {
  let lastOutput = null;
  const notes = [];
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const input =
      attempt === 0
        ? prompt
        : `The following output was not valid JSON:\n\n${lastOutput}\n\nReturn ONLY corrected, valid JSON matching the original request. No prose, no markdown fences.`;

    const response = await ollamaClient.generate({
      model,
      prompt: input,
      format: 'json',
      ...options,
    });

    lastOutput = response.response;
    const parsed = tryParse(lastOutput);

    if (parsed.ok) {
      return { value: parsed.value, attempts: attempt + 1, repairedLocally: Boolean(parsed.repaired), notes };
    }
    notes.push({ attempt: attempt + 1, error: parsed.error, preview: String(lastOutput || '').slice(0, 240) });
    if (attempt === maxRetries) {
      const error = new Error('Failed to get valid JSON from Ollama after retries');
      error.attempts = attempt + 1;
      error.lastOutput = String(lastOutput || '').slice(0, 800);
      error.notes = notes;
      throw error;
    }
  }
  throw new Error('unreachable');
}

module.exports = { generateWithRepair, tryParse, extractJsonBody, relax, balanceBrackets };
