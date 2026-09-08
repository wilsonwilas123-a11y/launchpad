# Running every part of Launchpad, and deploying it

Every command here is the real one for this repo. It is an npm-workspaces repo:
install once at the root, and `npm run <script> -w <package>` reaches into a
workspace. The commands below were run against Node 20 on this project; on
Windows they work in PowerShell and cmd as written (the scripts use `127.0.0.1`,
not `localhost`, and `node --test` with no path argument).

---

## 0. What runs where

| Piece | Command | Address | What it is |
| --- | --- | --- | --- |
| API | `npm run dev:api` | `http://127.0.0.1:4000` | NestJS (plain JS) under `/api`, plus static `/uploads` |
| Web | `npm run dev:web` | `http://127.0.0.1:5173` | Vite dev server, proxying `/api` and `/uploads` to :4000 |
| Both | `npm run dev` | — | `concurrently -k` |
| Database | none required | — | Postgres when `DATABASE_URL`/`PG*` are set, else a JSON file store |
| Model server | optional | LM Studio `:1234`, Ollama `:11434` | With neither, the built-in spec compiler writes the site |

The browser only ever calls same-origin `/api`. That is deliberate: the built
bundle contains no API host at all, so one artefact is deployable anywhere and
deployment is only a proxy question.

---

## 1. First-time setup

```bash
cd launchpad
node -v                      # v20 or newer
npm install                  # both workspaces, from the root lockfile
cp .env.example .env          # every value in it is optional
npm run check                 # unit tests + seed + e2e + browser smoke, one command
```

`npm run check` starts the API if nothing answers on :4000, seeds demo content if
the gallery is empty, runs the suites, then shuts down the API it started. Flags:

```bash
npm run check -- --keep             # leave that API running and print both addresses
npm run check -- --no-serve         # run the suites only, never start anything
npm run check -- --only=test        # one step: test | seed | e2e | smoke
npm run check -- --only=e2e,smoke   # several steps
```

---

## 2. Backend — `apps/api`

```bash
npm run dev:api              # node src/main.js  (no watcher: restart after API edits)
npm run test:api             # node --test, 63 tests, all offline
npm run seed                 # demo account + four reference launches, through the real pipeline
```

Direct equivalents, if you prefer to be explicit:

```bash
cd apps/api
node src/main.js
node src/seed/run.js
node --test
node --test tests/google.test.js          # one file
node --test tests/lmstudio.test.js         # one file
```

`npm run seed` is idempotent and destructive only to the demo account's own
projects: it deletes the demo user's previous projects, then regenerates them
from scratch (that is why the reference sites are real specs and not fixtures).
It prints the demo login at the end: `demo@launchpad.app / launchpad`.

Ports, host, origins:

```bash
PORT=4100 npm run dev:api                                  # or LAUNCHPAD_API_PORT=4100
HOST=127.0.0.1 npm run dev:api                             # bind locally only
LAUNCHPAD_WEB_ORIGIN=https://my-app.vercel.app npm run dev:api   # where OAuth comes back to
LAUNCHPAD_PUBLIC_HOST=my-app.vercel.app npm run dev:api         # how published links are displayed
```

### Storage

```bash
LAUNCHPAD_STORE=file     npm run dev:api   # JSON file under apps/api/storage
LAUNCHPAD_STORE=postgres npm run dev:api   # start only if Postgres answers
LAUNCHPAD_STORE=auto     npm run dev:api   # Postgres first, file store otherwise (default)
LAUNCHPAD_STORAGE_DIR=/tmp/lp npm run dev:api          # move the JSON store + uploads
LAUNCHPAD_UPLOADS_DIR=/tmp/lp-uploads npm run dev:api   # uploads only
```

Either connection style works. Discrete fields for a local server — `PGHOST`
`PGPORT` `PGUSER` `PGPASSWORD` `PGDATABASE` `LAUNCHPAD_PG_SSL=true` — or the
single string every hosted provider gives you, `DATABASE_URL` (also accepted:
`LAUNCHPAD_PG_URL`). When a URL is present the discrete fields are ignored
on purpose: their defaults (`127.0.0.1`, user `launchpad`) would otherwise
outrank the real host and the app would happily create its tables in the wrong
database. The boot log prints `host:port/database` and never the password.

Postgres in Docker, matching the local defaults:

```bash
docker run -d --name launchpad-pg -p 5432:5432 \
  -e POSTGRES_USER=launchpad -e POSTGRES_PASSWORD=launchpad -e POSTGRES_DB=launchpad \
  postgres:16-alpine
npm run seed            # the schema is created on boot by the app itself
docker exec -it launchpad-pg psql -U launchpad -d launchpad -c 'select count(*) from projects;'
```

### Model server

```bash
npm run dev:api                                       # auto: LAUNCHPAD_LLM_BASE_URL, then LM Studio, then Ollama, then compiler
LAUNCHPAD_AI_PROVIDER=lmstudio npm run dev:api         # require LM Studio on :1234
LAUNCHPAD_AI_PROVIDER=ollama   npm run dev:api         # require Ollama — exits at boot if it is not answering
LAUNCHPAD_AI_PROVIDER=local    npm run dev:api         # never call out: deterministic compiler only
LMSTUDIO_MODEL=qwen3-30b-a3b   npm run dev:api         # pin one of several loaded models
LAUNCHPAD_LM_MAX_TOKENS=1400   npm run dev:api         # smaller, faster spec
LAUNCHPAD_LM_TIMEOUT_MS=600000 npm run dev:api         # more patience for a slow box
LAUNCHPAD_LM_JSON_MODE=1       npm run dev:api         # also send response_format (some GGUF builds answer 400)
LAUNCHPAD_LMSTUDIO=off         npm run dev:api         # stop probing :1234 at all
LAUNCHPAD_LLM_BASE_URL=http://192.168.0.20:8000/v1 npm run dev:api   # vLLM / llama.cpp / a LAN box
LAUNCHPAD_JSON_REPAIR_RETRIES=3 npm run dev:api        # more attempts before falling back
```

### Examples from outside (optional)

```bash
BEHANCE_API_KEY=*** npm run dev:api                  # fills the row under the dashboard
LAUNCHPAD_BEHANCE_USERS=studionorth,ada-p npm run dev:api   # whose work to show (recommended)
LAUNCHPAD_BEHANCE_FIELD=web-design npm run dev:api          # or the site-wide feed, by field
LAUNCHPAD_BEHANCE_SORT=appreciations npm run dev:api        # appreciations · views · recent
LAUNCHPAD_BEHANCE_PER_PAGE=8 npm run dev:api                 # 12 at most
LAUNCHPAD_BEHANCE_TIMEOUT_MS=6000 npm run dev:api            # it never blocks longer than this
LAUNCHPAD_BEHANCE_TTL_MS=900000 npm run dev:api              # 15 minutes of cache
LAUNCHPAD_INSPIRATION=off npm run dev:api                     # never call out, key or no key
LAUNCHPAD_EXAMPLE_COUNT=6 npm run dev:api                     # how many of your own to show
curl -s http://127.0.0.1:4000/api/inspiration | head -c 400  # the row as the browser gets it
curl -s http://127.0.0.1:4000/api/health | grep -o '"inspiration":{[^}]*}'
```

Section 11 explains what that row is, why it is empty by default, and what the
state of the Behance API actually is.

`LAUNCHPAD_AI_PROVIDER=ollama` and `=lmstudio` differ in one useful way: Ollama
is checked at boot and the process exits with the command to fix it, so a
misconfigured deploy fails loudly rather than quietly generating with the
compiler.

### Talking to a running API by hand

```bash
curl -s http://127.0.0.1:4000/api/health | head -c 400
curl -s "http://127.0.0.1:4000/api/health?refresh=1"   # re-probe the model server now
curl -s http://127.0.0.1:4000/api/catalog | head -c 200
curl -s http://127.0.0.1:4000/api/designs | head -c 200
curl -s 'http://127.0.0.1:4000/api/asset-plan?type=product' | head -c 200
curl -s http://127.0.0.1:4000/api/auth/google/status   # {enabled,redirect,clientId,authUrl}
curl -s -X POST http://127.0.0.1:4000/api/auth/demo -H 'content-type: application/json' -d '{}'
```

`/api/health` answers `{"ok":true,"service":"launchpad-api","env":"development",
"database":"file","ai":{"provider":"local","label":"Local spec compiler","model":
null,"reachable":false,"reason":"llm: no base url configured …","endpoint":null},
"auth":{"google":"not configured"}}` — one call that tells you which store, which
model server and which sign-in doors are live.

A full loop, from a shell. `POST /api/projects/:id/generate` answers with the
project (its `spec` is what was written, and `spec.meta.generatedBy` names who
wrote it), and publishing gives you the slug the public route reads:

```bash
TOKEN=35bbe6160d1d4e28.aW52YWxpZA   # (paste what /auth/demo returned)
curl -s -X POST http://127.0.0.1:4000/api/projects -H "authorization: Bearer $TOKEN" \
  -H 'content-type: application/json' \
  -d '{"name":"NOVA","description":"A streetwear drop site with a countdown and a waitlist","type":"product"}'
curl -s -X POST "http://127.0.0.1:4000/api/projects/<id>/generate" -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}'
curl -s -X POST "http://127.0.0.1:4000/api/projects/<id>/publish"  -H "authorization: Bearer $TOKEN" -H 'content-type: application/json' -d '{}'
curl -s "http://127.0.0.1:4000/api/public/<slug>/status"     # {"slug":"nova","published":true,"status":"live","revision":1}
```

The same loop with no shell quoting to get wrong — Node is already installed, so
this is the version to use on Windows, and it prints what each step produced:

```bash
node -e "
const B='http://127.0.0.1:4000/api';
const j=(r)=>r.json();
const post=(p,b,t)=>fetch(B+p,{method:'POST',headers:{'content-type':'application/json',...(t?{authorization:'Bearer '+t}:{})},body:JSON.stringify(b||{})}).then(j);
(async()=>{
  const {token}=await post('/auth/demo',{});
  const p=await post('/projects',{name:'NOVA',description:'A streetwear drop site with a countdown and a waitlist',type:'product'},token);
  const g=await post('/projects/'+p.id+'/generate',{},token);
  console.log('project', p.id, '| sections', g.spec.sections.length, '| written by', g.spec.meta.generatedBy);
  const r=await post('/projects/'+p.id+'/refine',{command:'make the hero headline shorter'},token);
  console.log('refine | changed', r.changed, '|', (r.summary||'').slice(0,70));
  const pub=await post('/projects/'+p.id+'/publish',{},token);
  const st=await fetch(B+'/public/'+pub.slug+'/status').then(j);
  console.log('published', st.slug, st.status, 'revision', st.revision);
})();"
```

Run it twice: the second call to `/refine` answers from the rules layer when the
model is not running, which is the fallback doing its job rather than a failure.

---

## 3. Frontend — `apps/web`

```bash
npm run dev:web              # Vite on :5173, proxies /api and /uploads to :4000
npm run build                # vite build → apps/web/dist
npm run preview              # serves dist on :4173, with the same proxy
npm run test:web             # node --test, 47 tests (source contracts, layout, a11y)
```

A production-shaped local run — the real bundle, the real API, no dev server.
The preview server proxies too, so this is a genuine end-to-end check:

```bash
npm run build
npm run preview                      # http://127.0.0.1:4173   (in another terminal: npm run dev:api)
curl -s http://127.0.0.1:4173/api/health | head -c 80    # proxied → real JSON
```

Dev-server knobs. `dev:web` hops through npm workspaces, so extra flags need a
second `--` for the inner run — with one dash, `--host 0.0.0.0` arrives at vite as
a bare `0.0.0.0` positional and vite takes it as the project root instead:

```bash
npm run dev:web -- -- --port 5200
npm run dev:web -- -- --host 0.0.0.0      # open on your LAN, e.g. to test a phone
LAUNCHPAD_API_ORIGIN=http://127.0.0.1:4100 npm run dev:web   # where /api is proxied (dev and preview)
cd apps/web && npx vite --port 5200                          # or skip the workspace hop
```

---

## 4. Tests, and what each one proves

```bash
npm test                     # API suite, then web suite
npm run test:api             # 63: generators, spec compiler, Google token trust, model-server clients, Postgres config, the Behance row
npm run test:web             # 47: source contracts for layout, sign-in row, narrow screens, the model chip, the examples row
npm run e2e                  # the product loop over HTTP — needs the API on :4000
npm run smoke                # jsdom renders every route against the running API (101 assertions)
npm run check                # all four, starting and stopping an API as needed
```

`e2e` and `smoke` talk to a live API on `127.0.0.1:4000`. If it is not up they
fail at the first request, so either start one first or use `npm run check`,
which manages that for you. None of the four needs an internet connection: the
Google tests generate a throwaway RSA key pair and answer as Google's key
server, and the LM Studio tests run against a local stub server.

---

## 5. Deploying the API to Render

The API is a long-lived Node process with an `/uploads` directory, which is what
Render's Web Service is for. (Vercel's request functions have a read-only,
ephemeral filesystem, so the API does not belong there.)

**`render.yaml` is already in the repo.** Dashboard → New → Blueprint → pick the
repo: it creates the web service, the Postgres database, the disk, and every
environment variable below, generating the secret and leaving the origins for
you to fill in.

Setting it up by hand instead (New → Web Service):

| Field | Value |
| --- | --- |
| Runtime | Node |
| Build command | `npm ci` |
| Start command | `npm start -w @launchpad/api` |
| Health check path | `/api/health` |
| Instance type | Starter or better — the free tier has no disk |
| Disk | 1 GB at `/opt/render/project/src/apps/api/storage` |
| Node version | 20 (also read from `.nvmrc`) |

Environment variables:

```
NODE_ENV=production
LAUNCHPAD_STORE=postgres
DATABASE_URL=<Render's Postgres "Internal connection string">
LAUNCHPAD_AUTH_SECRET=<64 random characters; never ship the dev default>
LAUNCHPAD_WEB_ORIGIN=https://<your-app>.vercel.app
LAUNCHPAD_PUBLIC_HOST=<your-app>.vercel.app
GOOGLE_CLIENT_ID=<optional>
GOOGLE_CLIENT_SECRET=<optional>
GOOGLE_REDIRECT_URI=https://<your-app>.vercel.app/api/auth/google/callback
LAUNCHPAD_AI_PROVIDER=local
```

The four things that cost people an hour:

- **The disk.** Uploaded images live in `apps/api/storage/uploads`. With no disk
  mounted there, every deploy or restart empties them and the sites show broken
  image slots.
- **`DATABASE_URL` beats the `PG*` fields.** If you set `LAUNCHPAD_STORE=file` on
  Render "just to try it", say it out loud in the service description: that data
  disappears with the container.
- **`LAUNCHPAD_AI_PROVIDER=local`.** LM Studio and Ollama on your laptop are not
  reachable from Render. Generation still works — the built-in compiler writes the
  spec — and the API says which path it took on every project. Point
  `LAUNCHPAD_LLM_BASE_URL` at a model server Render *can* reach if you want the
  model pass in production.
- **Google needs the frontend origin.** With the Vercel proxy below, the browser
  is on `https://<your-app>.vercel.app`, so that must be an Authorized JavaScript
  origin and `GOOGLE_REDIRECT_URI` must be
  `https://<your-app>.vercel.app/api/auth/google/callback` (which Vercel forwards
  to this service), not the `onrender.com` URL.

After the deploy:

```bash
curl -s https://<service>.onrender.com/api/health
curl -s "https://<service>.onrender.com/api/health?refresh=1"
```

`"database":"postgres"` means the schema was created on boot (`create table if
not exists` — an empty Render database is the normal state). Then either open the
app and use the demo/seed content, or in Render's shell (Service → Shell):

```bash
npm run seed          # real generated reference sites, so the galleries are not empty
```

Logs: Service → Logs. A `LAUNCHPAD_AI_PROVIDER=ollama but … is not responding`
line means the boot check refused to start — that is the designed failure, and
the fix is to install/point the model server or set the provider to `local`.

---

## 6. Deploying the frontend to Vercel

`vercel.json` is at the repo root and holds the four settings that matter, plus
the proxy. **Edit the two `destination` hosts to your Render origin** and nothing
else is required — no environment variables, because the bundle has no API host
in it:

```json
{
  "framework": "vite",
  "installCommand": "npm ci",
  "buildCommand": "npm run build -w @launchpad/web",
  "outputDirectory": "apps/web/dist",
  "rewrites": [
    { "source": "/api/:path*", "destination": "https://<launchpad-api>.onrender.com/api/:path*" },
    { "source": "/uploads/:path*", "destination": "https://<launchpad-api>.onrender.com/uploads/:path*" },
    { "source": "/(.*)", "destination": "/index.html" }
  ]
}
```

The last rewrite is what makes `/dashboard` and a published `/<slug>` load the
SPA instead of 404; Vercel still serves the real hashed asset files first.

Dashboard route: Projects → Add New → Import Git Repository → Framework preset
**Vite** → Root Directory stays at the repo **root** (that is what lets `npm ci`
see the workspace lockfile) → Build command `npm run build -w @launchpad/web` →
Output directory `apps/web/dist` → no environment variables → Deploy.

CLI route (the standard Vercel CLI; the dashboard forms do exactly the same):

```bash
npm install -g vercel
vercel login
vercel link                 # attach this folder to a project, or create one
vercel                    # a preview deployment, prints its URL
vercel --prod              # promote to production
vercel ls                  # deployments
vercel inspect <url>       # build output and runtime logs for one deployment
vercel logs <url> --follow
vercel rollback            # send production back to the previous deployment
```

If you would rather not keep the origin in `vercel.json`, Vercel also reads
redirects/rewrites from `next.config`-style headers or an Edge middleware — but a
literal destination here is the shortest thing that works, and it keeps one build
deployable to any staging origin.

Then, in the Google Cloud console: add `https://<your-app>.vercel.app` under
Authorized JavaScript origins and
`https://<your-app>.vercel.app/api/auth/google/callback` under Authorized redirect
URIs, and set the same value as `GOOGLE_REDIRECT_URI` on Render. Google compares
the redirect URI character by character; `redirect_uri_mismatch` is always that,
and `origin_mismatch` is the JavaScript origins list.

---

## 7. One platform only

**Everything on Render.** The API can serve the built frontend itself, on one
origin, with a flag — no Express edits, no second service:

```bash
npm run build                                     # apps/web/dist
LAUNCHPAD_SERVE_WEB=1 npm start -w @launchpad/api  # the API serves it too
```

What that does, checked against a running API: `GET /`, `GET /dashboard` and
`GET /any-published-slug` return the app shell (`200 text/html`); hashed assets
come back `200` with `cache-control: public, max-age=3600`; `/api/*` and
`/uploads/*` stay with the API (`GET /api/nope` is the API's own JSON `404`, not
an HTML page) and non-`GET` requests are never swallowed by the fallback. If
`apps/web/dist/index.html` is missing the boot log says
`LAUNCHPAD_SERVE_WEB is on but … is missing — run npm run build first` and the
API still serves normally.

In `render.yaml`, add `npm run build -w @launchpad/web` to the build command and
set `LAUNCHPAD_SERVE_WEB=1`, then point the Google origins and
`GOOGLE_REDIRECT_URI` at the Render URL (`https://<service>.onrender.com/api/auth/google/callback`)
and drop `LAUNCHPAD_WEB_ORIGIN`/`LAUNCHPAD_PUBLIC_HOST` to that same host.

**Everything on Vercel** is not a configuration change: the API keeps uploaded
files on disk and can use a JSON file store, and Vercel's filesystem is read-only
and per-invocation. To go that way you would move uploads to object storage and
always run Postgres, then adapt the server entry to a request handler.

---

## 8. Checking a deployment

```bash
curl -s https://<app>/api/health                       # ok:true, database:postgres, ai.provider
curl -s https://<app>/api/auth/google/status | head -c 200
curl -s https://<app>/api/public | head -c 300          # what the landing page's gallery reads
curl -s -o /dev/null -w '%{http_code}\n' https://<app>/<slug>          # 200 — the SPA serves it
curl -s https://<app>/api/public/<slug>/status                          # {"published":true,…}
curl -s -o /dev/null -w '%{http_code}\n' https://<app>/uploads/<file>   # 200 only while the disk is there
```

In the browser: sign up, run the five-step wizard, publish, open the link, then
reload the page after a redeploy — that is the sequence that catches a missing
disk, a proxy that is not rewriting `/uploads`, or `LAUNCHPAD_WEB_ORIGIN` pointing
somewhere else.

Note that `POST /api/auth/demo` works in production too: it is the app's own demo
door, and it creates or reuses one account named "Launchpad Demo". If you do not
want that on a public deployment, run the seed once and then delete the demo user
from the database, or do not expose the sign-in screen's demo button — the route
itself has no env switch.

---

## 9. When something is wrong

| Symptom | What it actually is |
| --- | --- |
| `"google":"not configured"` in `/api/health` | `.env` is not at the repo root or `apps/api/.env`, or the variable has a typo. Restart the API after editing; nothing hot-reloads. |
| The Google button says "not set up on this API" | Same, seen from the browser. Working as designed. |
| Google: `origin_mismatch` | The frontend origin is not in Authorized JavaScript origins. |
| Google: `redirect_uri_mismatch` | `GOOGLE_REDIRECT_URI` and the console's list disagree — including scheme and trailing slash. |
| `/account` asks for a current password a Google account does not have | It does not: with `hasPassword:false` the panel says "Choose a password". If it does not, that deploy predates the change. |
| Render 502 right after a deploy | Start command must be `npm start -w @launchpad/api`. Check Logs for the AI-provider boot refusal. |
| Uploaded images 404 after a redeploy | No disk at `apps/api/storage`, or `LAUNCHPAD_STORE=file` on ephemeral storage. |
| Header chip says "generation runs on this machine" | No model server reachable — expected on Render with `LAUNCHPAD_AI_PROVIDER=local`. Locally: LM Studio's server is not started, or the model is loaded in the Chat tab but not the Server tab. `curl http://127.0.0.1:1234/v1/models` should list it. |
| `EADDRINUSE :4000` | An API is already running. Stop it (its terminal, or `npm run check -- --keep` reuses it), or set `PORT`. |
| `Cannot find module '@nestjs/common'` | Run `npm install` at the repo **root**, not inside `apps/api` — the workspaces share one `node_modules`. |
| `Cannot find module '.../tests'` from `npm test` | Node 22+/24 stopped accepting a directory for `--test`; this repo calls plain `node --test`, which auto-discovers. If you edited the script, put it back. |
| Vercel build: `vite: not found` | Root Directory was set to `apps/web`; leave it at the repo root so the workspace install happens. |
| `npm run preview` shows an empty page | The preview server proxies only when `vite.config.js` has the `preview.proxy` block (this repo does). If you replaced the config, that is the missing piece. |

## 10. Handy combinations

```bash
npm run check -- --keep && curl -s localhost:4000/api/health   # green, then leave the API up
node scripts/e2e.mjs | tail -3                                 # just the product loop
LAUNCHPAD_STORE=file LAUNCHPAD_STORAGE_DIR=/tmp/lp npm run dev:api   # a throwaway database to break in
LAUNCHPAD_AI_PROVIDER=lmstudio npm run dev:api                 # watch it name your LM Studio model at boot
PORT=4100 npm run dev:api & npm run dev:web                    # two ports, if 4000 is taken
curl -s localhost:4000/api/health | grep -o '"ai":{[^}]*}'    # what is writing your sites, right now
```
