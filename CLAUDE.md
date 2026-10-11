# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project direction

**Read `PLAN.md` first.** This repo is being rebuilt from a public-ish blog (current code) into a private family photo/video site on Cloudflare (Workers + D1 + R2 + Access), built in five phases. The plan defines the data model ("moments"), privacy rules (Private flag, location rounding, private zones, no kids' media off-site), iPhone Shortcut posting flow, and free-tier constraints. Work one phase at a time.

**The approved UI is the prototype in `mocks/index.html`** (with `mocks/shared.js` mock data). Build to match it: black background, plain white system monospace, `outofbreathed.com` title, a MapLibre 5 globe opening on Australia, and a plain chronological timeline. The site is not about the move to Australia; don't add move-centric features (day counters, "two homes", before/after framing). Preview it with `python3 -m http.server 8765` from `mocks/` (real family photos in `mocks/content/` are gitignored and must never be committed).

MapLibre gotchas found while prototyping: GeoJSON source URLs must be absolute (the worker can't resolve relative paths), and headless Chrome screenshots fire before GeoJSON workers finish, so delay capture when verifying map rendering.

Migration facts not in the plan:
- Domain is `outofbreathed.com`. DNS is currently on Vercel (`ns1/ns2.vercel-dns.com`), which also hosts the site. Email uses Forward Email (MX `mx1/mx2.forwardemail.net`) and Resend sends from `jim@outofbreathed.com` — preserve MX/TXT/SPF/DKIM records when moving DNS to Cloudflare.
- Existing content lives in Firebase (project `outofbreathed-42932`), not in this repo: Firestore `posts` (HTML `content` from TipTap) and Storage bucket `outofbreathed-42932-storage` under `posts/`. Back these up before decommissioning.
- **A separate "family app" shares this Firebase project and must keep working.** It uses `families/` (with `tasks`, `events`), Firebase Auth, and the shared `users/{uid}` docs (`familyId` field). Never delete the Firebase project, `users` docs, or Auth users; never deploy `firestore.rules` without the `families` rules and `isInFamily`. Retire only the blog's own pieces (`posts`, `comments`, `invites`, Storage `posts/`); `config` is read by both apps. Cloudflare Access must cover only the new site's hostnames, not anything the family app is served from.
  - Family app repo: `github.com/jimshobe/family` (cloned at `../family`). Vite/React PWA + Vercel functions, served at `family.outofbreathed.com` (CNAME `cname.vercel-dns.com`), with a daily Vercel cron (`/api/digest`).
  - Its email ingest relies on the apex TXT record `forward-email=add:https://family.outofbreathed.com/api/email-ingest?token=…` plus the `forward-email=jimshobe@gmail.com` TXT and Forward Email MX records. The `family` CNAME and both TXT records must be copied exactly when DNS moves to Cloudflare; set the `family` record to DNS-only (grey cloud) so it keeps pointing at Vercel.
  - Both repos contain a `firestore.rules` for the same project and deploying either overwrites the other. The family repo's version lacks the blog's collections; this repo's version is a superset. Don't deploy rules from either without merging; once the blog is retired, the family repo owns the rules.

## Branches

`rebuild` holds the new Cloudflare app. `main` still holds the old Firebase/Vercel blog, which Vercel serves at outofbreathed.com until the domain cutover; consult it (e.g. `git show main:src/lib/firebase-admin.ts`) when exporting old content.

## Commands

```sh
npm install
npx astro dev --background       # dev server at localhost:4321 (astro dev stop / status / logs)
npm run check                    # astro check (type-check)
npm run build && npx wrangler deploy        # deploy to https://outofbreathed.jimshobe.workers.dev
npx wrangler types               # regenerate worker-configuration.d.ts after editing wrangler.jsonc
npx wrangler d1 migrations apply outofbreathed --local|--remote   # schema changes live in migrations/
npx wrangler d1 execute outofbreathed --remote --command "SELECT ..."
```

No test suite yet. Astro 7 + `@astrojs/cloudflare` 14 on Node >= 22.12 (Homebrew Node 26 is installed).

## Architecture

Astro 7, `output: 'server'`, on Cloudflare Workers (`wrangler.jsonc`). Bindings come from `import { env } from 'cloudflare:workers'`, not `Astro.locals.runtime`.

- **Auth is Cloudflare Access, enforced twice.** Access (team `twilight-tree-a1dc`, attached to the Worker itself, session 7 days, policy currently "Cloudflare account" members only) redirects signed-out visitors at the edge. `src/middleware.ts` also verifies the `Cf-Access-Jwt-Assertion` JWT against `ACCESS_TEAM_DOMAIN`/`ACCESS_AUD` (`src/lib/access.ts`) and returns 403 if it's missing or invalid, so the site fails closed. In `astro dev` the check is skipped. The AUD is the `kid` query param in the Access login redirect (`curl -sI` the site signed-out). Static assets in `dist/` bypass middleware; never put private content there.
- **D1 `DB`** holds `moments` (`migrations/0001_moments.sql`, mirrors PLAN.md's data model). There is no Private flag, and locations are exact except inside **privacy zones** (`zones` table, `src/lib/zones.ts`, pure logic in `zone-math.ts`): there `display_lat/lng` is the zone's suburb centre and `moments.zone_id` is set. **All viewer queries must read the `moments_public` view**, which swaps a zoned moment's place name for the suburb and omits exact lat/lng; `recomputeZones()` reapplies zones after any zone change. Image files still have all location metadata stripped. Place names come from Nominatim reverse at zoom 18: "Venue, Suburb" when OSM names one, else the suburb. Categories: `moment_categories` holds all of a moment's categories (`moments.category` is the primary). `taken_at` is the camera's local time with offset; display the date part as written rather than converting zones.
- **Sets** (`sets` table, `moments.set_id`) group an event's moments; one set per moment. `src/lib/timeline.ts` (pure, unit-tested) turns moments + sets into timeline entries: a set is one entry at its first date. Set pages are `/sets/[id]`; set CRUD is `/api/sets`. Ungrouping deletes the set, never its moments.
- **Timeline paging** (`timelinePage` in `src/lib/moments.ts`, `assemblePage` in `src/lib/timeline.ts`): ~120 moments per page extended to whole months via a `?before=<month start>` cursor; a set is shown whole on the page holding its first moment and left out of newer pages. Category filter `?c=` matches a moment's categories or any moment in its set (so sets stay whole). The year row jumps via `before=<year+1>-01-01T00:00:00`.
- **Lightbox** (`src/scripts/lightbox.ts`): pages embed photo lists with `LightboxData` (`<script type=application/json data-lb-group>`) and mark openers with `data-lb-open`/`data-lb-id`. Browser scripts must cast DOM lookups (the Worker types in the shared tsconfig redefine `Element`).
- **Map** (`src/pages/map/`, `src/scripts/map.ts`): MapLibre 5 bundled from npm (globe projection), places = ~100 m spots (`round(display, 3)`, computed in SQL everywhere so keys match), pinned at their average position, embedded as JSON. Viewer JSON endpoints live under `/map/` (not `/api/`, which is owner-only): `place.json` (moments in a cell) and `about.json` (Wikipedia/Commons via `src/lib/about.ts`, cached with the Cache API, which only works on a custom domain). The about lookup uses the spot's average position (`spotLookupPoint`). Markers are an HTML overlay anchored on their 7px square (anchoring on the whole element shifts them by half the label width).
- **Videos are YouTube-only** (unlisted links, embedded via youtube-nocookie); the upload API rejects video files. Posts without GPS (YouTube links, Safari-stripped photos) get their position by geocoding a typed place name (`geocodePlace` in `src/lib/geo.ts`, Nominatim).
- **R2 `MEDIA`** holds photos, served only via `src/pages/media/[...key].ts` (behind middleware, Range support for video, `Cache-Control: private`). Never hand out public R2 URLs.
- The adapter also provisioned a `SESSION` KV namespace and an `IMAGES` binding on first deploy; they're unused so far.
- Seed/test data lives in gitignored `.wrangler/seed/`. The only moment so far is `test-0001` (`test/forest.jpg`), a placeholder.
