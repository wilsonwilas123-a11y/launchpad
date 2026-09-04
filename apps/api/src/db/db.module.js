const { wireModule } = require('../common/js-decorators');
const { getStore, STORE_TOKEN } = require('./index');

/**
 * One provider for the whole app: the store interface (PostgreSQL, or the
 * JSON file fallback) resolved once at boot through an async factory.
 */
class DatabaseModule {}
wireModule(DatabaseModule, {
  providers: [
    {
      provide: STORE_TOKEN,
      useFactory: async () => getStore(),
    },
  ],
  exports: [STORE_TOKEN],
});

module.exports = { DatabaseModule, STORE_TOKEN };
