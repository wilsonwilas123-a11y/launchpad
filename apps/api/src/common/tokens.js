/**
 * DI tokens. Plain JavaScript has no types to inject by, so every provider is
 * registered under one of these strings and resolved with an explicit
 * `inject: [TOKEN]` — the same mechanism Nest uses for custom providers.
 */
const STORE_TOKEN = 'LAUNCHPAD_STORE';
const AUTH_SERVICE = 'AUTH_SERVICE';
const GENERATOR_SERVICE = 'GENERATOR_SERVICE';
const PROJECTS_SERVICE = 'PROJECTS_SERVICE';
const CATALOG_SERVICE = 'CATALOG_SERVICE';
const IS_PUBLIC = 'launchpad:public';

module.exports = { STORE_TOKEN, AUTH_SERVICE, GENERATOR_SERVICE, PROJECTS_SERVICE, CATALOG_SERVICE, IS_PUBLIC };
