const { wireController, get, queryArg } = require('../../../common/js-decorators');
const { INSPIRATION_SERVICE } = require('../../../common/tokens');

/**
 * One public route: the examples the dashboard shows below your own projects.
 *
 * It is public because everything in it already is — published Launchpad sites
 * and public Behance projects — and because the row has to render on a fresh
 * account's empty dashboard, where there is nothing of the visitor's own to list.
 */
class InspirationController {
  constructor(service) {
    this.service = service;
  }

  list(refresh) {
    return this.service.list({ refresh: refresh === '1' || refresh === true });
  }

  status() {
    return this.service.status();
  }
}

wireController(
  InspirationController,
  'inspiration',
  {
    list: get('', [queryArg(0, 'refresh')], [], { public: true }),
    status: get('status', [], [], { public: true }),
  },
  { inject: [INSPIRATION_SERVICE] },
);

module.exports = { InspirationController };
