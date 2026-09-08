require('reflect-metadata');
const path = require('path');
const fs = require('fs');
const express = require('express');
const { NestFactory } = require('@nestjs/core');
const { config } = require('./config');
const { getStore } = require('./db');
const { AppModule } = require('./app.module');

async function bootstrap() {
  fs.mkdirSync(config.uploadsDir, { recursive: true });

  const app = await NestFactory.create(AppModule, {
    logger: ['log', 'warn', 'error'],
    cors: { origin: true, credentials: true },
  });

  app.setGlobalPrefix('api');
  // Wizard uploads arrive as data URLs, so the JSON body limit is generous.
  app.use(express.json({ limit: '32mb' }));
  app.use(express.urlencoded({ extended: true, limit: '2mb' }));
  app.use(
    '/uploads',
    express.static(config.uploadsDir, {
      maxAge: '1h',
      setHeaders: (res) => res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'),
    }),
  );

  if (/^(1|true|yes)$/i.test(process.env.LAUNCHPAD_SERVE_WEB || '')) {
    const webDist = path.resolve(__dirname, '../../../apps/web/dist');
    const indexFile = path.join(webDist, 'index.html');
    if (fs.existsSync(indexFile)) {
      app.use(express.static(webDist, { maxAge: '1h', index: 'index.html' }));
      app.use((req, res, next) => {
        if (req.method !== 'GET' || /^\/(api|uploads)(\/|$)/.test(req.path)) return next();
        return res.sendFile(indexFile);
      });
      console.log(`[launchpad:web] serving the built site from ${webDist}`);
    } else {
      console.warn(`[launchpad:web] LAUNCHPAD_SERVE_WEB is on but ${indexFile} is missing — run npm run build first.`);
    }
  }

  app.enableShutdownHooks();

  // Fail fast with a clear message if the model provider was demanded but is
  // not there, instead of timing out on the first generation.
  if (config.ai.provider === 'ollama') {
    const { getOllamaClient } = require('./generator/ollama');
    const reachable = await getOllamaClient().ping();
    if (!reachable) {
      console.error(`[launchpad] LAUNCHPAD_AI_PROVIDER=ollama but ${config.ai.ollamaUrl} is not responding.`);
      console.error('[launchpad] start Ollama (ollama serve) and pull a model, e.g. `ollama pull qwen2.5:14b`.');
      process.exit(1);
    }
    const info = await getOllamaClient().chooseModel().catch(() => ({}));
    console.log(`[launchpad:ai] Ollama at ${config.ai.ollamaUrl} — model ${info.model || config.ai.model}${info.note ? ` (${info.note})` : ''}`);
  }

  // The same courtesy for Gemini: demanding it and then quietly falling back to
  // the compiler would look like a working deploy that never calls the model.
  if (['gemini', 'gemini-openai'].includes(config.ai.provider)) {
    const { getGeminiClient, getGeminiOpenAiClient } = require('./generator/gemini');
    const client = config.ai.provider === 'gemini-openai' ? getGeminiOpenAiClient() : getGeminiClient();
    if (!config.ai.gemini.apiKey) {
      console.error(`[launchpad] LAUNCHPAD_AI_PROVIDER=${config.ai.provider} but GOOGLE_GEMINI_API_KEY is empty.`);
      console.error('[launchpad] create a key at https://aistudio.google.com/apikey, put it in .env at the repository root, then start again.');
      process.exit(1);
    }
    const probe = await client.probe();
    if (!probe.reachable) {
      console.error(`[launchpad] LAUNCHPAD_AI_PROVIDER=${config.ai.provider} but ${client.baseUrl} refused: ${probe.error && probe.error.message}`);
      process.exit(1);
    }
    const info = await client.chooseModel().catch(() => ({}));
    console.log(`[launchpad:ai] Gemini via ${client.baseUrl} — model ${info.model || config.ai.gemini.model}${info.note ? ` (${info.note})` : ''}`);
  }

  const store = await getStore();
  console.log(`[launchpad:api] listening on http://${config.host}:${config.port} (store: ${store.driver})`);
  await app.listen(config.port, config.host);
}

bootstrap().catch((error) => {
  console.error('[launchpad:api] failed to start:', error && error.message ? error.message : error);
  process.exit(1);
});