const { wireModule, wireInjectable } = require('../../common/js-decorators');
const { CatalogController } = require('./catalog.controller');

wireInjectable(CatalogController);

class CatalogModule {}
wireModule(CatalogModule, { controllers: [CatalogController] });

module.exports = { CatalogModule };
