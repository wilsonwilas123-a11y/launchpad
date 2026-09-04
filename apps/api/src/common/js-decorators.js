/**
 * NestJS from plain JavaScript.
 *
 * Nest decorators are ordinary functions. Instead of TypeScript `@Decorator`
 * syntax (which would need a build step) the backend applies them
 * imperatively through these helpers:
 *
 *   wireInjectable(UserService, [STORE_TOKEN])       // provider + constructor DI
 *   wireController(C, 'projects', {                  // @Controller + routes
 *     list: get('', [auth]),
 *     create: post('', [body, reqArg(1)], [auth]),
 *   }, { inject: [STORE_TOKEN] })
 *   wireModule(Mod, { controllers, providers, exports })
 *
 * Result: the real NestJS runtime — modules, providers, the DI container,
 * guards, exception filters — with zero TypeScript.
 */
const { SetMetadata } = require('@nestjs/common');
const { IS_PUBLIC } = require('./tokens');
const {
  Controller,
  Module,
  Injectable,
  Get,
  Post,
  Patch,
  Put,
  Delete,
  All,
  Body,
  Query,
  Param,
  Headers,
  Req,
  Res,
  Ip,
  Next,
  UseGuards,
  HttpCode,
  Inject,
} = require('@nestjs/common');

const ROUTE_DECORATORS = { get: Get, post: Post, patch: Patch, put: Put, delete: Delete, all: All };

const isParamSpec = (value) => Array.isArray(value) && value.length === 2 && typeof value[0] === 'number' && typeof value[1] === 'function';

/**
 * Builds one route spec: `route('get', 'path', [params], [guards], { status })`.
 * Params may be `[index, Body()]` tuples or bare param decorators bound in
 * order; guards are classes or instances.
 */
function route(method, path = '', params = [], guards = [], options = {}) {
  const entries = [];
  let autoIndex = 0;
  for (const entry of params) {
    if (isParamSpec(entry)) entries.push(entry);
    else if (typeof entry === 'function') entries.push([autoIndex++, entry]);
  }
  return { method, path, params: entries, guards, ...options };
}

const get = (path, params, guards, options) => route('get', path, params, guards, options);
const post = (path, params, guards, options) => route('post', path, params, guards, options);
const patch = (path, params, guards, options) => route('patch', path, params, guards, options);
const del = (path, params, guards, options) => route('delete', path, params, guards, options);

const bodyAt = (index, property) => [index, Body(property)];
const body = bodyAt(0);
const reqArg = (index = 1) => [index, Req()];
const queryArg = (index, key) => [index, Query(key)];
const paramArg = (index, key) => [index, Param(key)];

/** Applies the controller decorator, routes and constructor injection. */
function wireController(cls, basePath, routes, options = {}) {
  Controller(basePath)(cls);
  (options.inject || []).forEach((token, index) => Inject(token)(cls, undefined, index));
  if (options.guards && options.guards.length) UseGuards(...options.guards)(cls);
  for (const [name, spec] of Object.entries(routes)) {
    if (name.startsWith('_') || !spec) continue;
    const descriptor = Object.getOwnPropertyDescriptor(cls.prototype, name);
    if (!descriptor) throw new Error(`wireController: ${cls.name}.${name} does not exist on the prototype`);
    const decorator = ROUTE_DECORATORS[spec.method];
    if (!decorator) throw new Error(`wireController: unknown HTTP method "${spec.method}" on ${cls.name}.${name}`);
    decorator(spec.path)(cls.prototype, name, descriptor);
    if (spec.status) HttpCode(spec.status)(cls.prototype, name, descriptor);
    if (spec.public) SetMetadata(IS_PUBLIC, true)(cls.prototype, name, descriptor);
    if (spec.guards && spec.guards.length) UseGuards(...spec.guards)(cls.prototype, name, descriptor);
    for (const [index, paramDecorator] of spec.params || []) {
      paramDecorator(cls.prototype, name, index);
    }
  }
  return cls;
}

/** Marks a provider injectable and resolves its constructor args by token. */
function wireInjectable(cls, tokens = []) {
  Injectable()(cls);
  tokens.forEach((token, index) => Inject(token)(cls, undefined, index));
  return cls;
}

function wireModule(cls, metadata) {
  Module(metadata)(cls);
  return cls;
}

/** Builds a class-based guard without TS decorators. */
function defineGuard(name, canActivate) {
  const guard = class {
    canActivate(ctx) {
      return canActivate(ctx);
    }
  };
  Object.defineProperty(guard, 'name', { value: name });
  Injectable()(guard); // Nest's Injectable() writes metadata and returns nothing
  return guard;
}

module.exports = {
  route,
  get,
  post,
  patch,
  del,
  body,
  bodyAt,
  reqArg,
  queryArg,
  paramArg,
  wireController,
  wireInjectable,
  wireModule,
  defineGuard,
  nest: { Body, Query, Param, Req, Res, Headers, Next, Ip, HttpCode, UseGuards, Inject, Injectable, Controller, Module },
};
