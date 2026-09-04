const { wireModule, wireInjectable } = require('../common/js-decorators');
const { DatabaseModule } = require('../db/db.module');
const { GeneratorService } = require('./generator.service');
const { STORE_TOKEN, GENERATOR_SERVICE } = require('../common/tokens');

wireInjectable(GeneratorService, [STORE_TOKEN]);

/** Generation + AI-edit logic, shared by the wizard, the builder and previews. */
class GeneratorModule {}
wireModule(GeneratorModule, {
  imports: [DatabaseModule],
  providers: [GeneratorService, { provide: GENERATOR_SERVICE, useExisting: GeneratorService }],
  exports: [GeneratorService, GENERATOR_SERVICE],
});

module.exports = { GeneratorModule, GeneratorService, GENERATOR_SERVICE };
