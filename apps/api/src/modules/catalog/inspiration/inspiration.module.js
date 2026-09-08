const { wireModule, wireInjectable } = require('../../../common/js-decorators');
const { DatabaseModule } = require('../../../db/db.module');
const { INSPIRATION_SERVICE } = require('../../../common/tokens');
const { InspirationService } = require('./inspiration.service');
const { InspirationController } = require('./inspiration.controller');

wireInjectable(InspirationService);

class InspirationModule {}
wireModule(InspirationModule, {
  imports: [DatabaseModule],
  controllers: [InspirationController],
  providers: [InspirationService, { provide: INSPIRATION_SERVICE, useExisting: InspirationService }],
  exports: [InspirationService, INSPIRATION_SERVICE],
});

module.exports = { InspirationModule, InspirationService, INSPIRATION_SERVICE };
