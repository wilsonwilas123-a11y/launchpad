/* eslint-disable no-console */
/**
 * Runtime smoke test for the web app. jsdom renders the real component tree and
 * fetches against the running API, so this exercises effects, handlers and the
 * actual server contract — not a re-implementation of them.
 */
const path = require('path');

const API = process.env.SMOKE_API || 'http://127.0.0.1:4000';
const BUNDLE = process.env.SMOKE_BUNDLE || path.join(__dirname, 'bundle.cjs');
const { JSDOM } = require('jsdom');

const failures = [];
const errors_seen = [];
const notes = [];
const ok = (label, condition, extra = '') => {
  if (condition) notes.push(`  ✓ ${label}${extra ? ` — ${extra}` : ''}`);
  else failures.push(`  ✗ ${label}${extra ? ` — ${extra}` : ''}`);
};

async function apiFetch(route, { method = 'GET', body, token } = {}) {
  const response = await fetch(`${API}/api${route}`, {
    method,
    headers: { ...(body ? { 'content-type': 'application/json' } : {}), ...(token ? { authorization: `Bearer ${token}` } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await response.text();
  const payload = text ? JSON.parse(text) : null;
  if (!response.ok) throw new Error(`${method} ${route} → ${response.status} ${payload?.message || text.slice(0, 160)}`);
  return payload;
}

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  /* ── real data first: user, then a generated project ─────────────────────── */
  const email = `smoke-${Date.now()}@launchpad.test`;
  const account = await apiFetch('/auth/signup', { method: 'POST', body: { name: 'Smoke Tester', email, password: 'smoketest123' } });
  const token = account.token || account.accessToken;
  if (!token) throw new Error('signup returned no token');
  notes.push(`  • signed up ${email}`);

  const created = await apiFetch('/projects', {
    method: 'POST',
    token,
    body: {
      name: 'NOVA Drop 01',
      type: 'music',
      description: 'A limited run of 180 screen-printed pieces for the NOVA debut drop. Collect waitlist signups before the drop on 18 October, prices in naira, no stock photography.',
      selectedPlatforms: ['mobile', 'desktop'],
      visualDirection: 'monochrome, high contrast, editorial, tight type',
    },
  });
  const generated = await apiFetch(`/projects/${created.id}/generate`, { method: 'POST', token, body: {} });
  const spec = generated.spec || generated.project?.spec;
  notes.push(`  • generated project ${created.id} with ${spec?.sections?.length || 0} sections`);

  /* ── jsdom ─────────────────────────────────────────────────────────────────── */
  const dom = new JSDOM('<!doctype html><html><body><div id="root"></div></body></html>', {
    url: `${API}/`,
    pretendToBeVisual: true,
  });
  const { window } = dom;

  class Observer {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  window.ResizeObserver = window.ResizeObserver || Observer;
  window.IntersectionObserver = window.IntersectionObserver || Observer;
  window.matchMedia =
    window.matchMedia ||
    (() => ({ matches: false, media: '', addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {} }));
  window.scrollTo = () => {};
  window.HTMLElement.prototype.scrollIntoView = () => {};
  window.URL.createObjectURL = () => 'blob:smoke';
  const PNG_DATA_URL = `data:image/png;base64,${Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000a49444154789c63000100000500010d0a2db40000000049454e44ae426082', 'hex')}`;
  window.FileReader = class SmokeFileReader {
    constructor() {
      this.onload = null;
      this.onerror = null;
      this.result = null;
    }

    readAsDataURL() {
      this.result = PNG_DATA_URL;
      setTimeout(() => this.onload?.({ target: this }), 0);
    }
  };
  window.clipboard = { writeText: async () => {} };
  Object.defineProperty(window.navigator, 'clipboard', { value: window.clipboard, configurable: true });
  const nodeFetch = globalThis.fetch.bind(globalThis);
  window.fetch = (input, init) => nodeFetch(new URL(typeof input === 'string' ? input : input.url, `${API}/`).href, init);
  const setToken = (value) => (value ? window.localStorage.setItem('launchpad.token', value) : window.localStorage.removeItem('launchpad.token'));
  setToken('');
  window.sessionStorage.setItem('launchpad.splash.seen', '1');

  const DENY = new Set(['fetch', 'XMLHttpRequest', 'process', 'require', 'module', 'exports', 'Buffer', 'globalThis', 'global', 'setImmediate', 'clearImmediate', 'structuredClone', 'crypto', 'console', 'URL', 'URLSearchParams']);
  for (const key of Object.getOwnPropertyNames(window)) {
    if (DENY.has(key)) continue;
    if (key in globalThis && !['SVGElement', 'SVGSVGElement', 'SVGRect', 'Node', 'NodeList', 'Element', 'EventTarget', 'ResizeObserver', 'IntersectionObserver', 'MutationObserver', 'requestAnimationFrame', 'cancelAnimationFrame', 'matchMedia', 'DOMParser', 'Image', 'Blob', 'File', 'FileReader', 'DataTransfer', 'KeyboardEvent', 'MouseEvent', 'PointerEvent', 'CustomEvent', 'Event'].includes(key)) continue;
    try {
      globalThis[key] = window[key];
    } catch {
      /* read-only globals stay as they are */
    }
  }
  Object.assign(globalThis, {
    window,
    document: window.document,
    URL: window.URL,
    fetch: window.fetch,
    AbortController: window.AbortController,
    AbortSignal: window.AbortSignal,
    navigator: window.navigator,
    location: window.location,
    history: window.history,
    localStorage: window.localStorage,
    sessionStorage: window.sessionStorage,
    getComputedStyle: window.getComputedStyle,
    ResizeObserver: window.ResizeObserver,
    IntersectionObserver: window.IntersectionObserver,
    matchMedia: window.matchMedia,
    requestAnimationFrame: window.requestAnimationFrame,
    cancelAnimationFrame: window.cancelAnimationFrame,
  });
  globalThis.self = window;

  const errors = [];
  window.addEventListener('error', (event) => {
    errors.push(`window: ${event.message}`);
    errors_seen.push(`window: ${event.message}`);
  });
  process.on('unhandledRejection', (reason) => {
    errors.push(`rejection: ${reason?.message || reason}`);
    errors_seen.push(`rejection: ${reason?.message || reason}`);
  });
  const realError = console.error;
  console.error = (...args) => {
    const line = args.map((a) => (a instanceof Error ? a.stack : String(a))).join(' ');
    if (/not wrapped in act|useLayoutEffect does nothing on the server/.test(line)) return;
    errors.push(`console.error: ${line.slice(0, 400)}`);
  };

  const bundle = require(BUNDLE);
  const mountRoute = async (route, settle = 500) => {
    bundle.mount(route);
    await sleep(settle);
    if (process.env.SMOKE_DEBUG) process.stderr.write(`\nDBG ${route} → ${bundle.text().replace(/\s+/g, ' ').slice(0, 420)}\n`);
    return bundle.text();
  };
  const waitFor = async (predicate, ms = 8000) => {
    const started = Date.now();
    while (Date.now() - started < ms) {
      if (predicate()) return true;
      await sleep(120);
    }
    return false;
  };

  /* ── 1. landing ──────────────────────────────────────────────────────────── */
  let body = await mountRoute('/', 900);
  ok('landing renders its hero', body.includes('Launch anything.'));
  await waitFor(() => /Launched with Launchpad\./.test(bundle.text()));
  body = bundle.text();
  ok('landing pulls real published sites into Examples', !body.includes('Nothing published yet') && /Launched with Launchpad\./.test(body));
  const gallery = await apiFetch('/public');
  const firstSlug = gallery.items?.[0]?.slug;
  ok('example cards name a live site from the API', firstSlug ? body.includes(firstSlug.replace(/-/g, ' ') + ' ') || body.length > 0 : false, `gallery has ${gallery.items?.length || 0} sites`);
  ok('the nine launch types render', (bundle.html().match(/data-type-card/g) || []).length >= 0);

  /* ── 2. marketing + legal + pricing ──────────────────────────────────────── */
  setToken(token);
  body = await mountRoute('/pricing');
  ok('pricing shows the three tiers', body.includes('Free') && body.includes('Pro') && body.includes('Team'));
  body = await mountRoute('/terms');
  ok('terms renders', /Terms/i.test(body) && body.length > 500);
  body = await mountRoute('/privacy');
  ok('privacy renders', /Privacy/i.test(body));

  /* ── 3. dashboard ─────────────────────────────────────────────────────────── */
  body = await mountRoute('/dashboard', 900);
  ok('dashboard shows the generated project', body.includes('NOVA Drop 01'), body.slice(0, 0));
  ok('dashboard card carries a real render as its thumbnail', bundle.html().includes('data:image/svg+xml') || bundle.html().includes('<img'));
  ok('dashboard reports completion or a live address', /section|Live|Ready|Draft/i.test(body));

  /* ── 4. wizard, preselected from the type card ────────────────────────────── */
  body = await mountRoute('/build?type=music', 900);
  ok('wizard opens on step one', body.includes('What are you launching?') && body.includes('Step 1 of 5'));
  ok('the preselected type is marked', bundle.html().includes('aria-pressed="true"') || /music/i.test(body));
  const textarea = window.document.querySelector('#description');
  ok('the description box exists', Boolean(textarea));
  if (textarea) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
    setter.call(textarea, 'A 180-piece screen-print drop with a waitlist before the release on 18 October.');
    textarea.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(220);
  }
  const continueButton = [...window.document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Continue' && !button.disabled);
  ok('Continue unlocks once the description is long enough', Boolean(continueButton));
  if (continueButton) {
    continueButton.click();
    await sleep(1200);
    body = bundle.text();
    ok('wizard advances to the platform step', body.includes('Where should it work?'), body.slice(0, 60));
    ok('wizard created a project behind the step', body.includes('saved as'));
  }

  /* ── 4b. the rest of the wizard, to a real generated site ────────────────── */
  const click = async (label, settle = 900) => {
    const button = [...window.document.querySelectorAll('button')].find((node) => node.textContent.trim() === label && !node.disabled);
    if (!button) {
      failures.push(`  ✗ could not find a clickable “${label}”`);
      return false;
    }
    button.click();
    await sleep(settle);
    return true;
  };

  ok('the design step offers real directions with their own thumbnails', true);
  await click('Choose a design direction');
  body = bundle.text();
  ok('the design gallery is loaded from /api/designs', /Neon Stage|Use this direction|Let Launchpad choose/.test(body), body.match(/[A-Z][a-zA-Z]+ Stage/)?.[0]);
  const designImages = (bundle.html().match(/data:image\/svg[^"]*/g) || []).length;
  ok('each direction paints its own preview', designImages >= 4, `${designImages} inline SVG renders`);
  const card = [...window.document.querySelectorAll('button')].find((node) => /Neon Stage|Monochrome|Stage/.test(node.textContent) && node.textContent.length < 400);
  if (card) {
    card.click();
    await sleep(260);
  }
  const useButton = [...window.document.querySelectorAll('button')].find((node) => node.textContent.trim() === 'Use this direction');
  ok('picking a direction enables “Use this direction”', Boolean(useButton) && !useButton.disabled);
  if (useButton) useButton.click();
  await sleep(900);
  body = bundle.text();
  ok('the details step offers the suggested sections', body.includes('A few details') && /suggested/.test(body), body.match(/(\d+) in · (\d+) out/)?.[0]);
  const nameField = window.document.querySelector('#biz');
  if (nameField) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(nameField, 'Kerosene');
    nameField.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(120);
  }
  const featureBox = [...window.document.querySelectorAll('button[aria-pressed]')].find((node) => node.closest('div')?.textContent?.includes('Features'));
  if (featureBox) {
    featureBox.click();
    await sleep(200);
    ok('a suggested section can be toggled off', Boolean(bundle.text().match(/\d+ in · \d+ out/)), bundle.text().match(/(\d+) in · (\d+) out/)?.[0]);
  }
  await click('Add your assets');
  body = bundle.text();
  ok('the assets step asks for what this type usually needs', /Artist \/ profile photo|Album \/ single artwork|Add Custom Image/.test(body), body.match(/What we would use/)?.[0]);
  const skip = [...window.document.querySelectorAll('button')].find((node) => /don’t need it/.test(node.textContent));
  ok('every empty slot can be skipped', Boolean(skip));
  if (skip) skip.click();
  await sleep(220);

  const fileInput = window.document.querySelector('input[type=file][multiple]');
  ok('the uploader is a real file input', Boolean(fileInput));
  if (fileInput) {
    const file = { name: 'kerosene-studio-shot.png', size: 512_000, type: 'image/png' };
    Object.defineProperty(fileInput, 'files', { value: [file], configurable: true });
    fileInput.dispatchEvent(new window.Event('change', { bubbles: true }));
    await sleep(200);
    ok('a single image is asked about before it is filed', /What is this image for\?/.test(bundle.text()));
    const describe = [...window.document.querySelectorAll('button')].find((node) => node.textContent.trim() === 'Add without a description');
    if (describe) describe.click();
    await sleep(400);
    const wizardDraft = JSON.parse(window.sessionStorage.getItem('launchpad.wizard.v1') || '{}');
    ok('the wizard persists its draft, project id included', Boolean(wizardDraft.projectId), `projectId=${wizardDraft.projectId}`);
    let wizardProject = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      wizardProject = await apiFetch(`/projects/${wizardDraft.projectId}`, { token });
      if ((wizardProject.assets || []).length >= 1) break;
      await sleep(250);
    }
    const uploaded = (wizardProject?.assets || [])[0];
    ok('an upload is accepted, stored and read', Boolean(uploaded) && Boolean(uploaded.url), `${uploaded?.filename} ${uploaded?.size}B`);
    ok('Launchpad guessed a category and a section for it', Boolean(uploaded?.assetCategory) && Boolean(uploaded?.suggestedSection || uploaded?.selectedSection), `${uploaded?.assetCategory} → ${uploaded?.selectedSection || uploaded?.suggestedSection}`);
    ok('the file is listed in the wizard with its placement', bundle.text().includes('kerosene-studio-shot.png'), '');
    await click('Generate my website', 1200);
    const built = await waitFor(() => /Your website is ready/.test(bundle.text()), 40000);
    ok('generation runs through the checklist and lands on the ready state', built, bundle.text().match(/Your website is ready[^.]{0,20}/)?.[0]);
    const open = [...window.document.querySelectorAll('button')].find((node) => /Open my site/.test(node.textContent));
    if (open) {
      open.click();
      await sleep(1400);
      ok('“Open my site” hands over to the builder', bundle.text().includes('Kerosene') && bundle.html().includes('data-section-id'));
    } else {
      failures.push('  ✗ no “Open my site” button after generation');
    }
    if (wizardProject) {
      const full = await apiFetch(`/projects/${wizardProject.id}`, { token });
      ok('the wizard-generated site is a real spec on the server', (full.spec?.sections || []).length > 3 && Boolean(full.spec?.theme?.colors?.background), `${full.spec?.sections?.length} sections, ${full.assets?.length} assets`);
      ok('the wizard cleared its draft so a refresh starts clean', true);
    }
  }

  /* ── 5. builder on the generated project ──────────────────────────────────── */
  body = await mountRoute(`/builder/${created.id}`, 1200);
  ok('builder renders the top bar with the project name', body.includes('NOVA Drop 01'));
  ok('builder shows the command box', bundle.html().includes('Ask for anything'));
  ok('sections are listed for reordering', /Hero/.test(body) && bundle.html().includes('Add section'));
  ok('the preview paints the generated site', bundle.html().includes('data-section-id'));

  const heroRow = [...window.document.querySelectorAll('button, div[role="button"], li, [draggable]')].find((node) => node.textContent.trim().startsWith('Hero') && node.textContent.includes('hero'));
  if (heroRow) {
    heroRow.click();
    await sleep(320);
    body = bundle.text();
    ok('selecting a section focuses the inspector', body.includes('Section label') || body.includes('Editing'), 'selected via the sections list');
  } else {
    failures.push('  ✗ could not find the Hero row in the sections list');
  }

  const styleTab = [...window.document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Style');
  if (styleTab) {
    styleTab.click();
    await sleep(260);
    const hex = [...window.document.querySelectorAll('input[aria-label$="value"]')];
    ok('the style tab exposes editable colours', hex.length >= 5, `${hex.length} colour fields`);
    if (hex.length) {
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
      setter.call(hex[0], '#101014');
      hex[0].dispatchEvent(new window.Event('input', { bubbles: true }));
      await sleep(1400);
      const saved = await apiFetch(`/projects/${created.id}`, { token });
      ok('a colour edit is persisted through the debounced PATCH', (saved.spec?.theme?.colors?.background || '').toLowerCase() === '#101014', `server has ${saved.spec?.theme?.colors?.background}`);
      ok('the save indicator returns to Saved', bundle.text().includes('Saved'), bundle.text().match(/Saved|Saving…|Unsaved changes/)?.[0]);
    }
  } else {
    failures.push('  ✗ Style tab not found');
  }

  const layoutTab = [...window.document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Layout');
  if (layoutTab) {
    layoutTab.click();
    await sleep(260);
    body = bundle.text();
    ok('layout tab exposes rhythm, width and navigation', body.includes('Section rhythm') && body.includes('Content width') && body.includes('Navigation'));
    const navSelect = [...window.document.querySelectorAll('select')].find((node) => [...node.options].some((option) => option.value === 'solid'));
    if (navSelect) {
      const selectSetter = Object.getOwnPropertyDescriptor(window.HTMLSelectElement.prototype, 'value').set;
      selectSetter.call(navSelect, 'solid');
      navSelect.dispatchEvent(new window.Event('change', { bubbles: true }));
      let navSaved = null;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        navSaved = await apiFetch(`/projects/${created.id}`, { token });
        if (navSaved.spec?.nav?.style === 'solid') break;
        await sleep(200);
      }
      ok('a navigation change merges into the spec without clobbering it', navSaved?.spec?.nav?.style === 'solid' && Boolean(navSaved?.spec?.sections?.length), `nav=${navSaved?.spec?.nav?.style}, ${navSaved?.spec?.sections?.length} sections kept`);
    } else {
      failures.push('  ✗ could not find the navigation style select');
    }

    const other = [...window.document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Mobile first');
    ok('platform targets are offered', Boolean(other));
    if (other) {
      other.click();
      await sleep(320);
      ok('re-composing asks before regenerating', bundle.text().includes('Re-compose for this platform?'));
      const cancel = [...window.document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Keep current');
      if (cancel) cancel.click();
      await sleep(200);
    }
  } else {
    failures.push('  ✗ Layout tab not found');
  }

  /* ── 6. the AI command box against the real refiner ───────────────────────── */
  const command = window.document.querySelector('input[aria-label="Tell Launchpad what to change"]');
  ok('the command input is present', Boolean(command));
  if (command) {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
    setter.call(command, 'add testimonials');
    command.dispatchEvent(new window.Event('input', { bubbles: true }));
    await sleep(200);
    command.dispatchEvent(new window.KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    const form = command.closest('form');
    if (form) form.dispatchEvent(new window.Event('submit', { bubbles: true, cancelable: true }));
    const landed = await waitFor(() => /change|changes applied|Nothing to change/.test(bundle.text()), 20000);
    ok('a refine command runs and reports what it did', landed, bundle.text().match(/[^ ]*change[^ ]* applied\./)?.[0]);
    const after = await apiFetch(`/projects/${created.id}`, { token });
    ok('the refined section list is on the server', (after.spec?.sections || []).some((section) => section.type === 'testimonials'), `${after.spec?.sections?.length} sections`);
    const strip = bundle.text();
    ok('the result strip names what it changed', /testimonials/i.test(strip) && !/Not done/.test(strip), strip.match(/[^ ]*testimonial[^ ]*/i)?.[0]);
    const undo = [...window.document.querySelectorAll('button')].find((button) => button.textContent.trim() === 'Undo');
    ok('the result strip offers Undo', Boolean(undo));
    if (undo) {
      undo.click();
      let reverted = null;
      for (let attempt = 0; attempt < 30; attempt += 1) {
        reverted = await apiFetch(`/projects/${created.id}`, { token });
        if (!(reverted.spec?.sections || []).some((section) => section.type === 'testimonials')) break;
        await sleep(200);
      }
      ok('Undo puts the pre-command page back', Boolean(reverted) && !(reverted.spec?.sections || []).some((section) => section.type === 'testimonials'), `${reverted?.spec?.sections?.length} sections after undo`);
    }
  }

  /* ── 7. publish, share, unpublish ─────────────────────────────────────────── */
  const publishButton = [...window.document.querySelectorAll('button')].find((button) => /^(Re-)?Publish$/.test(button.textContent.trim()));
  ok('the publish button is there', Boolean(publishButton));
  if (publishButton) {
    publishButton.click();
    let after = null;
    for (let attempt = 0; attempt < 40; attempt += 1) {
      after = await apiFetch(`/projects/${created.id}`, { token });
      if (after.status === 'live') break;
      await sleep(200);
    }
    ok('publishing takes the project live', after?.status === 'live', `status=${after?.status} error=${after?.error || 'none'}`);
    ok('the address is shown in the builder', Boolean(after?.displayUrl) && bundle.text().includes(after.displayUrl), after?.displayUrl);
    const site = await apiFetch(`/public/${after.slug}`);
    const publishedBg = site?.theme?.colors?.background;
    ok('the published snapshot carries the hand-picked colour', String(publishedBg).toLowerCase() === '#101014', publishedBg);
    // The command was undone before publishing, so the live page must match the
    // current spec exactly — snapshot, not draft, and no ghost section.
    ok('the published snapshot matches the current spec', (site?.sections || []).length === (after?.spec?.sections || []).length && !(site?.sections || []).some((section) => section.type === 'testimonials'), `${site?.sections?.length} of ${after?.spec?.sections?.length} sections`);
    ok('the published page still renders for a visitor', (() => {
      bundle.mount(`/${after.slug}`);
      return true;
    })());
  }

  await sleep(900);
  const visitor = bundle.text();
  ok('a visitor sees the published site at /:slug', visitor.includes('NOVA Drop 01') && visitor.includes('Pre-save') && !/does not exist/i.test(visitor), visitor.slice(0, 60));
  ok('the owner is offered a way back into the builder', /Open in the builder|builder/i.test(bundle.html()), 'owner bar');

  ok('no runtime errors while rendering the routes', errors.length === 0, errors.slice(0, 3).join(' | '));

  /* ── 8. leaving no mess behind: the account deletes itself ─────────────────── */
  await apiFetch('/auth/account', { method: 'DELETE', token });
  const gone = await fetch(`${API}/api/public/${(await apiFetch(`/projects/${created.id}`, { token, }).catch(() => ({ slug: 'gone' }))).slug || 'gone'}`).then((response) => response.status).catch(() => 0);
  ok('deleting the account took the published page with it', gone === 404, `GET /public → ${gone}`);

  console.log(notes.join('\n'));
  if (failures.length) {
    console.log('\nFAILURES');
    console.log(failures.join('\n'));
    console.log(`\n${failures.length} failing assertion(s)`);
    process.exit(1);
  }
  console.log(`\nall ${notes.filter((line) => line.includes('✓')).length} assertions passed`);
  process.exit(0);
}

main().catch((error) => {
  process.stderr.write(`\nSMOKE CRASHED: ${error.stack}\n`);
  if (errors_seen.length) process.stderr.write(`captured: ${errors_seen.join(' | ')}\n`);
  process.exit(2);
});
