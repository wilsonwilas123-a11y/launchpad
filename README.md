# Launchpad

Describe it once, get a real website with a live URL, and change it in plain English.

Launchpad is a small, complete AI website studio: a five-step wizard (idea → platform → design direction → details → assets), a generation engine, a builder with a live preview, and published sites that are served from the same renderer the builder uses. There is no template gallery and no page builder canvas — the output is a **spec**, and the spec is the product.

```
description + design direction + your assets
        → master prompt → generator → spec (JSON)
        → <SiteRenderer spec={…}/>  → the same markup in preview, in the builder and on the live URL
```

---

## Run it

```bash
npm install

npm run check          # everything at once: starts the API, seeds, unit tests, e2e, browser smoke
npm run dev            # API on :4000 and the web app on :5173, concurrently
```

`npm run check` is the one-command path from a fresh extraction. It reads `.env` to find the port, reuses a dev server you already have running (and starts/stops its own otherwise), skips seeding when the gallery already has content, and prints a ✓/✗ summary. Nothing else has to be started by hand — the browser smoke renders the app in jsdom against the API, so no Vite server is involved.

```bash
npm run check -- --keep        # leave the API it started running, to browse afterwards
npm run check -- --no-serve    # never start anything; fail if the API is not up
npm run check -- --only=e2e    # one step: test | seed | e2e | smoke (comma-separated)
```

Then open **http://localhost:5173** from `npm run dev`. Sign up, or use *Try it with a demo account* — no email verification, no card.

Postgres is optional. The API tries `postgres://launchpad@127.0.0.1:5432/launchpad` and falls back to a JSON file store at `apps/api/storage/launchpad.json` if it cannot connect, so `npm run dev` works on a bare machine.

```bash
npm run api            # just the API (Nest + Express), in this terminal — alias of dev:api
npm run dev:web        # just Vite
npm run seed           # demo user + a few finished launches, so the gallery is not empty
npm run build          # production bundle in apps/web/dist
```

### Windows

Nothing here needs WSL. Requirements are Node 20 or newer (`node -v`) and npm; `npm run dev` works in cmd or PowerShell. Two details worth knowing:

- The test scripts are `node --test` with no path argument, because newer Node (22, 24) no longer accepts a directory there and fails with `Cannot find module '...\tests'`. Auto-discovery works on 20 through 24.
- Scripts and the dev proxy talk to `127.0.0.1`, not `localhost`: Node's `fetch` can try the IPv6 `::1` first while the API binds IPv4, and that reads as a connection refused on a machine where the server is fine.

### Generation

Everything works with **no model installed**: the compiler builds a real spec from your description and assets. If [Ollama](https://ollama.com) is reachable on `http://127.0.0.1:11434`, the generator asks it for the spec instead and repairs/validates the reply before using it.

```bash
OLLAMA_MODEL=llama3.1:8b npm run dev:api
```

`GET /api/health` reports which one you are on. When the model is unreachable the UI says so out loud — the dashboard shows *"Local model · generation runs on this machine"* rather than pretending to be a hosted service.

---

## Layout

| Path | What lives there |
| --- | --- |
| `apps/web` | React 18 + Vite + Tailwind + Framer Motion. Marketing site, wizard, builder, dashboard, published pages. |
| `apps/api` | Node API: auth, projects, generation, assets, public site hosting. Nest primitives (`@nestjs/common`, `platform-express`) with a small decorator/wiring layer in `src/common/js-decorators.js`, so there is no TypeScript build step or annotation ceremony. |
| `apps/api/src/generator` | The engine: prompt building, Ollama call, JSON repair, normalisation, section compiler, asset scoring, refinement commands. |
| `apps/api/src/catalog` | Design directions, the section vocabulary, the twelve launch types and their asset plans. |
| `apps/web/src/components/site` | `SiteRenderer` and the section renderers. Used by the builder preview, `/preview/:id` and the published URL — one implementation, so a preview cannot lie. |
| `scripts/` | `e2e.sh` (HTTP walk-through) and `web-smoke.mjs` (jsdom render of the real app). |

---

## Frontend routes

| URL | Screen |
| --- | --- |
| `/` | Landing. First visit plays the splash, then the hero carries a **live** mini-site you can click into. Examples come from `GET /api/public`. |
| `/how-it-works` | Same page, opened at the seven-step section. |
| `/start` `/start?type=music` | The wizard. Signed-out visitors are sent to sign-up and returned here with the type kept. |
| `/build` | The wizard, when you are already signed in. |
| `/dashboard` | Launches with thumbnails that are actual renders of the chosen theme, progress against the seven steps, publish/share/delete. |
| `/builder/:id` | Command box, sections rail, live preview, inspector, publish bar. |
| `/preview/:id` | The generated site full-screen at the chosen device, not editable. |
| `/:slug` | A published site. `?v=0…4` re-composes it for a different viewer without a rebuild. |
| `/pricing` `/account` `/terms` `/privacy` | The obvious ones. |

---

## API

All JSON, all under `/api`. Auth is `Authorization: Bearer <token>` (token from `signup`/`login`/`demo`, held in `localStorage`).

| Route | Notes |
| --- | --- |
| `GET /health` | Store, environment and AI reachability. |
| `GET /catalog` | Launch types, section vocabulary, design directions, effects. |
| `GET /designs[?category=]` · `GET /designs/:id` | The design gallery, with `thumbnailUrl` as inline SVG data — no image files to ship. |
| `GET /asset-plan?type=` | The recommended slots for that kind of launch. A recommendation, never a gate. |
| `POST /auth/signup` · `/auth/login` · `/auth/demo` | `{ token, user }`. |
| `GET`/`PATCH /auth/me` · `POST /auth/password` · `POST /auth/password/forgot` · `DELETE /auth/account` | Reset emails are not sent; in development the token is returned so the flow can be walked. |
| `POST /projects` · `GET /projects` · `GET/PATCH/DELETE /projects/:id` | `PATCH` accepts `name, type, description, visualDirection, targetAudience, goal, selectedPlatforms, selectedDesign, designDetails, theme, sections, nav, platform`. `theme`, `nav` and `platform` are merged; `sections` is replaced and re-validated. |
| `POST /projects/:id/generate` | Returns the spec plus `stages`, `pacing` and the `masterPrompt` that was used. |
| `POST /projects/preview` | Generate without saving — used by the landing hero. |
| `POST /projects/:id/refine` | `{ command: "add pricing" }` → `{ summary, changes[], needs[], spec, diff, undoToken, project }`. |
| `POST /projects/:id/publish` · `/unpublish` | Publish keeps the address; re-publish updates it and bumps `revision`. |
| `POST /projects/:id/assets` · `PATCH/DELETE /projects/:id/assets/:assetId` · `POST /projects/:id/assets/remap` | Files arrive as data URLs, are written to `apps/api/storage/uploads`, then scored and placed. |
| `GET /projects/:id/signups` | Whatever visitors submitted through the live page. |
| `GET /public` | The gallery of recent live sites for the landing page. |
| `GET /public/:slug` · `POST /public/:slug/signups` · `GET /public/:slug/status` | Serves the **published snapshot**, not the draft, so editing never breaks a page people are reading. |

---

## What the generator actually does

1. **Understanding** — the description is read for brand, audience, tone and the one action the page must drive.
2. **Planning** — a promise for the page, then which sections carry it. Twelve launch types bias the selection; `designDetails.desiredSections` / `excludedSections` override it.
3. **Layout** — hero, rhythm and density for the target screens, with a type scale and one accent colour.
4. **Assets** — every uploaded file is scored into a category (filename, then your one-line description, then the launch type) and assigned to a section. Nothing is rejected; unmatched files stay in the library.
5. **Optimisation** — the composition is re-tuned per platform: 480 / 768 / 1024 / 1440.
6. **Publish** — a slug, kept forever, and a snapshot of the spec.

With Ollama the spec comes from the model, repaired up to `LAUNCHPAD_JSON_REPAIR_RETRIES` times and then normalised against the section vocabulary; anything unusable falls back to the local compiler and the response says which path was taken. `POST /projects/:id/refine` never re-rolls the whole page: each command resolves to section-level edits (`commands.js`), the ones the vocabulary cannot express come back as `rejected` and are shown as *Not done*. The builder keeps the spec from before each command, so **Undo** puts that exact version back.

The generation checklist you watch is driven by the last measured run, not a hard-coded timer.

---

## Assets

Uploads go to `apps/api/storage/uploads/` and are served from `/uploads/*`. Per file: `filename`, `size`, `mime`, `category`, `description`, `caption`, `selectedSection`.

- A file is never refused because it does not match an expectation. Unmatched images stay in the library and can be placed by hand.
- Every slot in the asset list has a **Skip this for now** control.
- Use · Replace · Move · Remove · Change section · Edit description are all available in the wizard and the builder, and images can be dragged onto a section.
- "What is this image for?" is asked once per custom upload. It can be skipped, and it is the only thing needed to place the file well.

---

## Verify

```bash
npm run check         # the three below, plus seeding, against an API it starts itself
npm test              # 16 API tests + 15 web helper tests, no server needed
npm run e2e           # HTTP walk of the whole loop against a running API
npm run smoke         # renders the real app in jsdom against a running API
```

Both scripts are plain Node (`scripts/e2e.mjs`, `scripts/web-smoke.mjs`) — no bash, curl or python, so they run identically in cmd, PowerShell or a shell. Each prints a line per step and exits non-zero on the first failure. `e2e` defaults to `http://127.0.0.1:4000/api` and `smoke` to `http://127.0.0.1:4000`; override with `API=` / `SMOKE_API=`.

`npm run smoke` is the interesting one: it drives the app the way a person does — clicks a section in the rail, edits a hex field and reads it back from the server, submits a refine command, publishes, then loads the published page as a visitor. It catches contract mismatches between a component and a route, which is where this kind of product usually breaks. Run `npm run dev` first; it talks to the live API on `:4000`.

---

## Environment

| Variable | Default | Meaning |
| --- | --- | --- |
| `PORT` / `LAUNCHPAD_API_PORT` | `4000` | API port. |
| `LAUNCHPAD_STORE` | `auto` | `postgres` · `file` · `auto`. |
| `PGHOST` `PGPORT` `PGUSER` `PGPASSWORD` `PGDATABASE` | local `launchpad` | Postgres connection. |
| `LAUNCHPAD_STORAGE_DIR` | `apps/api/storage` | Uploads and the JSON store live here. |
| `LAUNCHPAD_AI_PROVIDER` | `auto` | `auto` · `ollama` (required) · `local` (never call out). |
| `OLLAMA_HOST` `OLLAMA_MODEL` | `127.0.0.1:11434`, first model found | Model endpoint. |
| `LAUNCHPAD_OLLAMA_TIMEOUT_MS` | `240000` | Local models are slow; the call waits. |
| `LAUNCHPAD_JSON_REPAIR_RETRIES` | `2` | Repair attempts before falling back. |
| `LAUNCHPAD_PUBLIC_HOST` | `launchpad.app` | The host shown on live links. |
| `LAUNCHPAD_AUTH_SECRET` | dev secret | **Change this.** Tokens are signed with it. |

Copy `.env.example` to `.env` to change any of these — the API reads `.env` from the repository root, and every value already has the default above.

---

## Deliberate limits

- **Plans are a preference, not a quota.** Pricing describes Free / Pro / Team and the account page switches between them, but the API does not enforce limits and no card is ever charged.
- **No mail.** Password reset returns its token in development instead of pretending to send one.
- **One page per launch.** A launch is a single scrolling page with anchored sections; multi-page sites are out of scope.
- **The builder edits the spec, not the DOM.** Text, colour, type, spacing, alignment, section order, visibility and image placement are all real controls on stored data. Anything the renderer cannot express is not offered.
- **Uploads are trusted input from the owner.** Files are typed, size-capped (25 MB) and stored outside the source tree, but nothing is virus-scanned or transcoded.
- `apps/api/src/main.js` serves uploads only; put `apps/web/dist` behind any static host and point it at the API, or keep using the Vite dev proxy.
