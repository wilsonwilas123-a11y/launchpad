const { APP_GUARD } = require('@nestjs/core');
const { DatabaseModule } = require('./db/db.module');
const { AuthModule, AuthService } = require('./modules/auth/auth.module');
const { AuthGuard } = require('./modules/auth/auth.guard');
const { ProjectsModule } = require('./modules/projects/projects.module');
const { GeneratorModule } = require('./generator/generator.module');
const { CatalogModule } = require('./modules/catalog/catalog.module');
const { PublicModule } = require('./modules/public/public.module');
const { wireModule, wireInjectable } = require('./common/js-decorators');

/**
 * Root module. The AuthGuard is bound globally through APP_GUARD, so every
 * route is authenticated unless the handler is marked @Public() — the policy
 * lives in one place instead of being repeated on each controller.
 */
class AppModule {}
wireModule(AppModule, {
  imports: [DatabaseModule, AuthModule, GeneratorModule, ProjectsModule, CatalogModule, PublicModule],
  providers: [{ provide: APP_GUARD, useClass: AuthGuard }],
});

module.exports = { AppModule };
