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

## Commands

```sh
npm install
npm run dev          # Astro dev server at localhost:4321
npm run build        # production build (Vercel adapter)
npm test             # vitest run (also runs as the husky pre-commit hook)
npx vitest run src/components/__tests__/Admin.test.tsx   # single file
npx vitest run -t "test name"                            # single test by name
```

Node >= 22.12 required.

## Current architecture (pre-rebuild)

Astro 5 in `output: 'server'` mode with React islands, deployed on Vercel. Firebase is the backend.

- **Two Firebase clients:** `src/lib/firebase.ts` (browser SDK — auth via Google sign-in, Firestore, Storage; used by React components) and `src/lib/firebase-admin.ts` (Admin SDK, server-only; used by `.astro` pages and `src/pages/api/*`). Server code bypasses Firestore rules, so it must filter `published == true` itself.
- **Most data access happens client-side** in React components talking directly to Firestore, so `firestore.rules` / `storage.rules` are the real authorization layer. The admin is a hardcoded UID in the rules and `PUBLIC_ADMIN_UID` in code.
- **Roles:** `users/{uid}.role` is `pending` | `member` | `contributor`; invites are keyed by email in `invites/`. Signup in `AccountMenu.tsx` checks for an invite and notifies the admin via `/api/notify`.
- **Home page** (`LifeStream.tsx`) merges `/api/posts.json` with Mastodon and Bluesky feeds (accounts in `src/config.ts`) client-side, with category filtering. Categories are dynamic, stored in Firestore `config`, falling back to `DEFAULT_CATEGORIES` in `src/types/categories.ts`.
- **Post pages** (`src/pages/posts/[...slug].astro`) render stored HTML server-side, post-process `<img>` runs into `.prose-gallery` grids by regex, and pull Mastodon statuses tagged with the post's `mastodon_tag`.
- **API routes** `invite.ts` / `notify.ts` send email via Resend. Note `invite.ts` authorizes by comparing a client-supplied `callerUid` to the admin UID (not a verified token).
- `firestore.rules` also contains rules for an unrelated "family app" (`families/`) sharing this Firebase project.

Env vars (`.env`, gitignored): `PUBLIC_FIREBASE_API_KEY`, `PUBLIC_FIREBASE_AUTH_DOMAIN`, `PUBLIC_FIREBASE_PROJECT_ID`, `PUBLIC_FIREBASE_APP_ID`, `PUBLIC_ADMIN_UID`, `FIREBASE_CLIENT_EMAIL`, `FIREBASE_PRIVATE_KEY`, `RESEND_API_KEY`.

## Tests

Vitest + jsdom + Testing Library (`src/test/setup.ts`). Component tests mock `firebase/*` modules and `src/lib/firebase` with `vi.mock`; shared fakes (snapshots, mock users, sentinel refs for `onSnapshot`) are in `src/test/firebase-mocks.ts`. TipTap needs browser API stubs — see `PostEditor.test.tsx`.
