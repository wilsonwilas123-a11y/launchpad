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

  const store = await getStore();
  console.log(`[launchpad:api] listening on http://${config.host}:${config.port} (store: ${store.driver})`);
  await app.listen(config.port, config.host);
}

bootstrap().catch((error) => {
  console.error('[launchpad:api] failed to start:', error && error.message ? error.message : error);
  process.exit(1);
});
