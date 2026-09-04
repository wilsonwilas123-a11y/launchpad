const fs = require('fs');
const path = require('path');
const { config } = require('../config');
const { PostgresStore, JsonFileStore } = require('./stores');

const STORE_TOKEN = 'LAUNCHPAD_STORE';
const fileStorePath = path.join(config.storageDir, 'launchpad.json');

let storePromise = null;

async function createStore() {
  if (config.store === 'file') {
    console.log('[launchpad:db] using JSON file store (LAUNCHPAD_STORE=file)');
    return JsonFileStore.open(fileStorePath);
  }

  if (config.store !== 'auto' && config.store !== 'postgres') {
    throw new Error(`Unknown LAUNCHPAD_STORE "${config.store}" (expected postgres|file|auto)`);
  }

  try {
    // pg is required lazily so the file-store path never needs the driver.
    const pg = require('pg');
    const store = await PostgresStore.connect(pg, config.pg);
    console.log(`[launchpad:db] connected to PostgreSQL at ${config.pg.host}:${config.pg.port}/${config.pg.database} (user ${config.pg.user})`);
    return store;
  } catch (error) {
    if (config.store === 'postgres') throw error;
    console.warn(`[launchpad:db] PostgreSQL unavailable (${error.message}) — falling back to file store at ${fileStorePath}`);
    return JsonFileStore.open(fileStorePath);
  }
}

function getStore() {
  if (!storePromise) storePromise = createStore();
  return storePromise;
}

module.exports = { STORE_TOKEN, getStore, fileStorePath };
