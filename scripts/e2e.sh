#!/usr/bin/env bash
# End-to-end walk of the core product loop against a running API (default :4000).
#   describe → platform → design → generate → refine → publish → public URL
set -euo pipefail
API="${API:-http://localhost:4000/api}"
J() { python3 -c "import json,sys;d=json.load(sys.stdin);print($1)"; }

echo "── health"
curl -s "$API/health" | J "d['database']+' | ai='+d['ai']['provider']+' | '+str(d['ai']['reachable'])"

echo "── sign in as the demo account"
TOKEN=$(curl -s -X POST "$API/auth/login" -H 'content-type: application/json' \
  -d '{"email":"demo@launchpad.app","password":"launchpad"}' | J "d['token']")
AUTH="authorization: Bearer $TOKEN"
echo "   token acquired (${#TOKEN} chars)"

echo "── dashboard list"
curl -s "$API/projects" -H "$AUTH" | J "str(len(d['items']))+' projects: '+', '.join(i['name']+'('+i['status']+')' for i in d['items'])"

echo "── clear leftovers from previous runs"
curl -s "$API/projects" -H "$AUTH" | python3 -c "
import json,sys,subprocess
for item in json.load(sys.stdin)['items']:
    if item['name'] == 'KRO':
        subprocess.run(['curl','-s','-X','DELETE',f'$API/projects/{item["id"]}','-H','$AUTH'], capture_output=True)
        print('   removed stale KRO draft')
" >/dev/null 2>&1 || true

echo "── create draft (type + platform + design + description)"
PID=$(curl -s -X POST "$API/projects" -H "$AUTH" -H 'content-type: application/json' -d '{
  "type":"product",
  "name":"KRO",
  "description":"I am launching a premium sneaker brand called KRO. Futuristic black website with huge product photography, a countdown to the drop, product information and a waitlist.",
  "selectedPlatforms":["mobile","desktop"],
  "selectedDesign":{"id":"futuristic-04"},
  "designDetails":{"businessName":"KRO","tagline":"Made in runs of 200","desiredSections":["hero","countdown","productShowcase","waitlist"],"excludedSections":[]},
  "visualDirection":"Futuristic, black, cinematic"
}' | J "d['id']")
echo "   project $PID"
curl -s "$API/projects/$PID" -H "$AUTH" | J "d['name']+' status='+d['status']+' label='+d['statusLabel']"

echo "── upload an asset (1x1 png as data url)"
PNG="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8DwHwAFAAH/q842iQAAAABJRU5ErkJggg=="
curl -s -X POST "$API/projects/$PID/assets" -H "$AUTH" -H 'content-type: application/json' -d "{
  \"files\":[{\"filename\":\"kro-runner.png\",\"dataUrl\":\"$PNG\",\"slot\":\"product\",\"description\":\"KRO Runner sneaker, hero product shot\",\"caption\":\" matte black, glow sole\"}]
}" | J "'stored '+str(d['added'])+' asset: '+d['assets'][0]['filename']+' → '+d['assets'][0]['assetCategory']+' (suggests '+d['assets'][0]['suggestedSection']+')'"

echo "── generate"
curl -s -X POST "$API/projects/$PID/generate" -H "$AUTH" -H 'content-type: application/json' -d '{}' > /tmp/gen.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/gen.json'))
g, s = d['generation'], d['spec']
print(f"   provider={g['provider']} elapsed={g['elapsedMs']}ms pacing={g['pacing']['totalMs']}ms status={d['status']}")
print(f"   {s['name']} · {len(s['sections'])} sections: {' → '.join(x['type'] for x in s['sections'])}")
print(f"   hero: {s['sections'][0]['content']['headline']}")
print(f"   accent={s['theme']['colors']['accent']} bg={s['theme']['colors']['background']} platform={s['platform']['label']}")
print(f"   asset placement: {[(m['filename'], m['section']) for m in s['assetMap']]}")
PY

echo "── natural-language edit: colours + countdown date"
curl -s -X POST "$API/projects/$PID/refine" -H "$AUTH" -H 'content-type: application/json' \
  -d '{"command":"Make the colors black and purple and add a countdown to 12 December"}' > /tmp/refine.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/refine.json'))
print(f"   source={d['source']} changed={d['changed']} summary={d['summary']}")
print(f"   read as: {d.get('readAs')}")
print(f"   accent={d['spec']['theme']['colors']['accent']}")
cd = [s for s in d['spec']['sections'] if s['type'] == 'countdown']
print(f"   countdown target: {cd[0]['content']['targetIso'] if cd else 'MISSING'}")
PY

echo "── publish → automatic URL"
curl -s -X POST "$API/projects/$PID/publish" -H "$AUTH" -H 'content-type: application/json' -d '{}' > /tmp/pub.json
python3 - <<'PY'
import json
d = json.load(open('/tmp/pub.json'))
p = d['publish']
print(f"   status={d['status']} url={p['displayUrl']} available on: {p['availableOn']} firstTime={p['firstTime']}")
with open('/tmp/slug', 'w') as f:
    f.write(p['slug'])
PY
SLUG=$(cat /tmp/slug)

echo "── public site is live and independent of the builder"
curl -s "$API/public/$SLUG" | J "'sections='+str(len(d['sections']))+' name='+d['name']+' rev='+str(d['revision'])+' ownerView='+str(d['ownerView'])"
curl -s -o /dev/null -w "   404 for an unknown slug: %{http_code}\n" "$API/public/definitely-not-here-$RANDOM"

echo "── visitor submits the waitlist form"
curl -s -X POST "$API/public/$SLUG/signups" -H 'content-type: application/json' \
  -d '{"kind":"waitlist","email":"early.fan@example.com"}' | J "'captured: '+d['kind']+' position '+str(d['position'])"
curl -s "$API/projects/$PID/signups" -H "$AUTH" | J "'owner sees '+str(d['total'])+' captures'"

echo "── re-publish updates the SAME url (no new link)"
curl -s -X PATCH "$API/projects/$PID" -H "$AUTH" -H 'content-type: application/json' -d '{"name":"KRO"}' > /dev/null
curl -s -X POST "$API/projects/$PID/publish" -H "$AUTH" -H 'content-type: application/json' -d '{}' | J "'slug still '+d['publish']['slug']+' revision '+str(d['publish']['revision'])+' changed='+str(d['publish']['firstTime']==False)"

echo "── slug collision is auto-resolved"
ALT=$(curl -s -X POST "$API/projects" -H "$AUTH" -H 'content-type: application/json' -d '{"type":"product","name":"KRO","description":"A second launch also called KRO."}' | J "d['id']")
curl -s -X POST "$API/projects/$ALT/generate" -H "$AUTH" -H 'content-type: application/json' -d '{}' > /dev/null
curl -s -X POST "$API/projects/$ALT/publish" -H "$AUTH" -H 'content-type: application/json' -d "{\"slug\":\"$SLUG\"}" | J "'requested $SLUG → got '+d['publish']['slug']"

echo "── cleanup"
curl -s -X DELETE "$API/projects/$ALT" -H "$AUTH" | J "'deleted '+str(d['ok'])"
curl -s -X DELETE "$API/projects/$PID" -H "$AUTH" | J "'deleted '+str(d['ok'])"
echo "done."
