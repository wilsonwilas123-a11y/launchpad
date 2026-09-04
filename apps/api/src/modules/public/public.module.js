const { wireModule, wireInjectable } = require('../../common/js-decorators');
const { PublicController } = require('./public.controller');
const { ProjectsModule } = require('../projects/projects.module');
const { DatabaseModule } = require('../../db/db.module');

wireInjectable(PublicController);

class PublicModule {}
wireModule(PublicModule, {
  imports: [DatabaseModule, ProjectsModule],
  controllers: [PublicController],
});

module.exports = { PublicModule };
