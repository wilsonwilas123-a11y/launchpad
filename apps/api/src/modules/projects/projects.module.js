const { wireModule, wireInjectable } = require('../../common/js-decorators');
const { ProjectsService } = require('./projects.service');
const { ProjectsController } = require('./projects.controller');
const { STORE_TOKEN, GENERATOR_SERVICE, PROJECTS_SERVICE } = require('../../common/tokens');
const { GeneratorModule } = require('../../generator/generator.module');
const { DatabaseModule } = require('../../db/db.module');

wireInjectable(ProjectsService, [STORE_TOKEN, GENERATOR_SERVICE]);
wireInjectable(ProjectsController, [PROJECTS_SERVICE]);

class ProjectsModule {}
wireModule(ProjectsModule, {
  imports: [DatabaseModule, GeneratorModule],
  controllers: [ProjectsController],
  providers: [ProjectsService, { provide: PROJECTS_SERVICE, useExisting: ProjectsService }],
  exports: [ProjectsService, PROJECTS_SERVICE],
});

module.exports = { ProjectsModule };
