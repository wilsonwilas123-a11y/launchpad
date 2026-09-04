const { wireModule, wireInjectable } = require('../../common/js-decorators');
const { DatabaseModule } = require('../../db/db.module');
const { AuthService } = require('./auth.service');
const { AuthController } = require('./auth.controller');
const { STORE_TOKEN, AUTH_SERVICE } = require('../../common/tokens');

wireInjectable(AuthService, [STORE_TOKEN]);

class AuthModule {}
wireModule(AuthModule, {
  imports: [DatabaseModule],
  controllers: [AuthController],
  providers: [AuthService, { provide: AUTH_SERVICE, useExisting: AuthService }],
  exports: [AuthService, AUTH_SERVICE],
});

module.exports = { AuthModule, AuthService, AUTH_SERVICE };
