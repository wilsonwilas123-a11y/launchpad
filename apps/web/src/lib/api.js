/**
 * One place where the browser talks to the API.
 *
 * The session token lives in localStorage and is attached automatically; every
 * call returns parsed JSON or throws an ApiError carrying the server's own
 * message, so components can show the real reason instead of "something broke".
 */

const TOKEN_KEY = 'launchpad.token';
const BASE = '/api';

export class ApiError extends Error {
  constructor(message, { status, payload } = {}) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.payload = payload || null;
  }
}

export const tokenStore = {
  get: () => {
    try {
      return localStorage.getItem(TOKEN_KEY) || '';
    } catch {
      return '';
    }
  },
  set: (token) => {
    try {
      if (token) localStorage.setItem(TOKEN_KEY, token);
      else localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* private mode — the session simply will not persist */
    }
  },
};

async function request(method, path, { body, signal, auth = true } = {}) {
  const headers = {};
  const token = auth ? tokenStore.get() : '';
  if (token) headers.authorization = `Bearer ${token}`;
  if (body !== undefined) headers['content-type'] = 'application/json';

  let response;
  try {
    response = await fetch(`${BASE}${path}`, {
      method,
      headers,
      signal,
      body: body === undefined ? undefined : JSON.stringify(body),
    });
  } catch (error) {
    if (error.name === 'AbortError') throw error;
    throw new ApiError('Launchpad is unreachable. Is the API running?', { status: 0 });
  }

  const text = await response.text();
  let payload = null;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = { message: text.slice(0, 200) };
    }
  }
  if (!response.ok) {
    throw new ApiError(payload?.message || `Request failed (${response.status})`, { status: response.status, payload });
  }
  return payload;
}

const get = (path, opts) => request('GET', path, opts);
const post = (path, body, opts) => request('POST', path, { ...opts, body });
const patch = (path, body, opts) => request('PATCH', path, { ...opts, body });
const del = (path, body, opts) => request('DELETE', path, { ...opts, body });

export const api = {
  health: () => get('/health', { auth: false }),

  catalog: () => get('/catalog', { auth: false }),
  designs: (category) => get(`/designs${category && category !== 'all' ? `?category=${encodeURIComponent(category)}` : ''}`, { auth: false }),
  design: (id) => get(`/designs/${encodeURIComponent(id)}`, { auth: false }),
  assetPlan: (type) => get(`/asset-plan?type=${encodeURIComponent(type)}`, { auth: false }),

  auth: {
    me: () => get('/auth/me'),
    login: (email, password) => post('/auth/login', { email, password }, { auth: false }),
    signup: (input) => post('/auth/signup', input, { auth: false }),
    demo: () => post('/auth/demo', {}, { auth: false }),
    updateProfile: (patch_) => patch('/auth/me', patch_),
    changePassword: (current, next) => post('/auth/password', { current, next }),
    forgot: (email) => post('/auth/password/forgot', { email }, { auth: false }),
    removeAccount: () => del('/auth/account'),
  },

  projects: {
    list: () => get('/projects'),
    create: (input) => post('/projects', input),
    get: (id) => get(`/projects/${id}`),
    update: (id, patch_) => patch(`/projects/${id}`, patch_),
    remove: (id) => del(`/projects/${id}`),
    generate: (id, input = {}, signal) => post(`/projects/${id}/generate`, input, signal ? { signal } : undefined),
    preview: (input) => post('/projects/preview', input),
    refine: (id, command) => post(`/projects/${id}/refine`, { command }),
    publish: (id, input = {}) => post(`/projects/${id}/publish`, input),
    unpublish: (id) => post(`/projects/${id}/unpublish`, {}),
    signups: (id) => get(`/projects/${id}/signups`),
    remapAssets: (id) => post(`/projects/${id}/assets/remap`, {}),
    addAssets: (id, files) => post(`/projects/${id}/assets`, { files }),
    updateAsset: (id, assetId, patch_) => patch(`/projects/${id}/assets/${assetId}`, patch_),
    removeAsset: (id, assetId) => del(`/projects/${id}/assets/${assetId}`),
  },

  publicGallery: () => get('/public', { auth: false }),
  publicSite: (slug) => get(`/public/${encodeURIComponent(slug)}`, { auth: false }),
  publicStatus: (slug) => get(`/public/${encodeURIComponent(slug)}/status`, { auth: false }),
  submitForm: (slug, payload) => post(`/public/${encodeURIComponent(slug)}/signups`, payload, { auth: false }),
};

/** Reads a File into the `{ filename, dataUrl }` shape the upload endpoint wants. */
export function fileToUpload(file, meta = {}) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new ApiError(`Could not read ${file.name}.`));
    reader.onload = () =>
      resolve({
        filename: file.name,
        size: file.size,
        mime: file.type,
        dataUrl: String(reader.result),
        slot: meta.slot || undefined,
        description: meta.description || undefined,
        caption: meta.caption || undefined,
      });
    reader.readAsDataURL(file);
  });
}
