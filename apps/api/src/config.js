const fs = require('fs');
const path = require('path');

/** Minimal .env loader — keeps the API dependency-light (no dotenv package). */
function loadDotenv(cwd = process.cwd()) {
  const candidates = [
    path.resolve(cwd, '.env'),
    path.resolve(__dirname, '../../.env'),
    path.resolve(__dirname, '../../../.env'),
  ];
  for (const file of candidates) {
    if (!fs.existsSync(file)) continue;
    const raw = fs.readFileSync(file, 'utf8');
    for (const line of raw.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const eq = trimmed.indexOf('=');
      if (eq === -1) continue;
      const key = trimmed.slice(0, eq).trim();
      const value = trimmed.slice(eq + 1).trim().replace(/^["']|["']$/g, '');
      if (process.env[key] === undefined) process.env[key] = value;
    }
    break;
  }
}

loadDotenv();

// storage lives beside the API package: apps/api/storage
const ROOT = path.resolve(__dirname, '..');

const config = {
  env: process.env.NODE_ENV || 'development',
  port: Number(process.env.PORT || process.env.LAUNCHPAD_API_PORT || 4000),
  host: process.env.HOST || '0.0.0.0',
  // The public host the builder shows for live links, e.g. launchpad.app/nova
  publicHost: process.env.LAUNCHPAD_PUBLIC_HOST || 'launchpad.app',
  webOrigin: process.env.LAUNCHPAD_WEB_ORIGIN || '',
  pg: {
    host: process.env.PGHOST || process.env.LAUNCHPAD_PG_HOST || '127.0.0.1',
    port: Number(process.env.PGPORT || process.env.LAUNCHPAD_PG_PORT || 5432),
    user: process.env.PGUSER || process.env.LAUNCHPAD_PG_USER || 'launchpad',
    password: process.env.PGPASSWORD || process.env.LAUNCHPAD_PG_PASSWORD || 'launchpad',
    database: process.env.PGDATABASE || process.env.LAUNCHPAD_PG_DATABASE || 'launchpad',
    ssl: process.env.LAUNCHPAD_PG_SSL === 'true',
  },
  // 'auto' tries PostgreSQL first and falls back to the JSON file store.
  store: process.env.LAUNCHPAD_STORE || 'auto',
  storageDir: process.env.LAUNCHPAD_STORAGE_DIR || path.join(ROOT, 'storage'),
  uploadsDir: process.env.LAUNCHPAD_UPLOADS_DIR || path.join(ROOT, 'storage', 'uploads'),
  authSecret: process.env.LAUNCHPAD_AUTH_SECRET || 'launchpad-dev-secret-change-me',
  tokenTtlMs: 1000 * 60 * 60 * 24 * 30,
  // Google sign-in. All optional: with no client id the app runs on
  // email/password plus the demo account, exactly as before.
  google: {
    clientId: process.env.GOOGLE_CLIENT_ID || '',
    clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    // Only needed for the authorization-code flow. Defaults to this API's
    // own /api/auth/google/callback in google.js.
    redirectUri: process.env.GOOGLE_REDIRECT_URI || '',
  },
  // AI provider: 'auto' uses the first model server that answers (an
  // explicitly configured one, then LM Studio, then Ollama) and falls back to
  // the built-in spec compiler otherwise. 'lmstudio' / 'llm' / 'ollama' require
  // that one server; 'local' never calls out.
  ai: {
    provider: (process.env.LAUNCHPAD_AI_PROVIDER || 'auto').toLowerCase(),
    ollamaUrl: (process.env.OLLAMA_HOST || process.env.LAUNCHPAD_OLLAMA_URL || 'http://127.0.0.1:11434').replace(/\/$/, ''),
    model: process.env.OLLAMA_MODEL || process.env.LAUNCHPAD_OLLAMA_MODEL || '',
    // Local models are slow and small; 4 minutes default, no more than 12.
    timeoutMs: Number(process.env.LAUNCHPAD_OLLAMA_TIMEOUT_MS || 240000),
    maxRetries: Number(process.env.LAUNCHPAD_JSON_REPAIR_RETRIES || 2),
    temperature: Number(process.env.LAUNCHPAD_OLLAMA_TEMPERATURE || 0.4),
    numPredict: Number(process.env.LAUNCHPAD_OLLAMA_NUM_PREDICT || 2600),
    keepAlive: process.env.OLLAMA_KEEP_ALIVE || '10m',
    // LM Studio (or anything else speaking the OpenAI shape on your own box).
    // `baseUrl` may be written with or without /v1; both are normalised.
    lmstudio: {
      label: 'LM Studio',
      baseUrl: (process.env.LMSTUDIO_BASE_URL || process.env.LMSTUDIO_URL || 'http://127.0.0.1:1234/v1').trim(),
      apiKey: process.env.LMSTUDIO_API_KEY || '',
      model: process.env.LMSTUDIO_MODEL || '',
      // Local inference on a 30B model is slow; a chat call gets 5 minutes.
      timeoutMs: Number(process.env.LAUNCHPAD_LM_TIMEOUT_MS || 300000),
      maxTokens: Number(process.env.LAUNCHPAD_LM_MAX_TOKENS || process.env.LAUNCHPAD_OLLAMA_NUM_PREDICT || 2600),
      temperature: Number(process.env.LAUNCHPAD_LM_TEMPERATURE || process.env.LAUNCHPAD_OLLAMA_TEMPERATURE || 0.4),
      // response_format is only sent when you ask for it — see lmstudio.js.
      jsonMode: /^(1|true|yes)$/i.test(process.env.LAUNCHPAD_LM_JSON_MODE || ''),
      // 'off' skips the probe entirely on a machine that has no LM Studio.
      enabled: (process.env.LAUNCHPAD_LMSTUDIO || 'auto').toLowerCase() !== 'off',
    },
    // A second, explicitly configured OpenAI-compatible server (vLLM, llama.cpp,
    // a box on the LAN). Only consulted when the base url is set.
    llm: {
      baseUrl: (process.env.LAUNCHPAD_LLM_BASE_URL || '').trim(),
      model: process.env.LAUNCHPAD_LLM_MODEL || '',
      apiKey: process.env.LAUNCHPAD_LLM_API_KEY || '',
    },
  },
};

fs.mkdirSync(config.storageDir, { recursive: true });
fs.mkdirSync(config.uploadsDir, { recursive: true });

module.exports = { config };
