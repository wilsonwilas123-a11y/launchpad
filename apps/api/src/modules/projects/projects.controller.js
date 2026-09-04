const { NotFoundException } = require('@nestjs/common');
const { wireController, get, post, patch, del, body, bodyAt, reqArg, paramArg } = require('../../common/js-decorators');

const { PROJECTS_SERVICE } = require('../../common/tokens');

class ProjectsController {
  constructor(projects) {
    this.projects = projects;
  }

  create(payload, req) {
    return this.projects.create(req.user.id, payload);
  }

  list(req) {
    return this.projects.listForUser(req.user.id).then((items) => ({ items }));
  }

  one(id, req) {
    return this.projects.get(req.user.id, id);
  }

  update(id, req, payload) {
    return this.projects.update(req.user.id, id, payload || {});
  }

  remove(id, req) {
    return this.projects.remove(req.user.id, id);
  }

  generate(id, req, payload) {
    return this.projects.generate(req.user.id, id, payload || {});
  }

  preview(req, payload) {
    return this.projects.preview(req.user.id, payload || {});
  }

  refine(id, req, payload) {
    const command = (payload || {}).command;
    if (!command) throw new NotFoundException('Send { command: "…" } — e.g. “add a countdown”.');
    return this.projects.refine(req.user.id, id, command, payload || {});
  }

  publish(id, req, payload) {
    return this.projects.publish(req.user.id, id, payload || {});
  }

  unpublish(id, req) {
    return this.projects.unpublish(req.user.id, id);
  }

  upload(id, req, payload) {
    return this.projects.addAssets(req.user.id, id, (payload || {}).files || []);
  }

  patchAsset(id, assetId, req, payload) {
    return this.projects.updateAsset(req.user.id, id, assetId, payload || {});
  }

  dropAsset(id, assetId, req) {
    return this.projects.removeAsset(req.user.id, id, assetId);
  }

  remap(id, req) {
    return this.projects.remapAssets(req.user.id, id);
  }

  signups(id, req) {
    return this.projects.signups(req.user.id, id);
  }
}

wireController(
  ProjectsController,
  'projects',
  {
    create: post('', [body, reqArg(1)]),
    list: get('', [reqArg(0)]),
    preview: post('preview', [reqArg(0), bodyAt(1)]),
    one: get(':id', [paramArg(0, 'id'), reqArg(1)]),
    update: patch(':id', [paramArg(0, 'id'), reqArg(1), bodyAt(2)]),
    remove: del(':id', [paramArg(0, 'id'), reqArg(1)]),
    generate: post(':id/generate', [paramArg(0, 'id'), reqArg(1), bodyAt(2)]),
    refine: post(':id/refine', [paramArg(0, 'id'), reqArg(1), bodyAt(2)]),
    publish: post(':id/publish', [paramArg(0, 'id'), reqArg(1), bodyAt(2)]),
    unpublish: post(':id/unpublish', [paramArg(0, 'id'), reqArg(1)]),
    upload: post(':id/assets', [paramArg(0, 'id'), reqArg(1), bodyAt(2)]),
    patchAsset: patch(':id/assets/:assetId', [paramArg(0, 'id'), paramArg(1, 'assetId'), reqArg(2), bodyAt(3)]),
    dropAsset: del(':id/assets/:assetId', [paramArg(0, 'id'), paramArg(1, 'assetId'), reqArg(2)]),
    remap: post(':id/assets/remap', [paramArg(0, 'id'), reqArg(1)]),
    signups: get(':id/signups', [paramArg(0, 'id'), reqArg(1)]),
  },
  { inject: [PROJECTS_SERVICE] },
);

module.exports = { ProjectsController, PROJECTS_SERVICE };
