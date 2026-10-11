# Family Media Site — Project Plan

Oct 11, 2026 · @Jim Shobe

## Overview

A private, visual website for sharing our family's photos and videos with friends and family. It replaces the old blog on my existing domain. Older photos from previous years will be backfilled, so the site covers our whole life, not one chapter of it.

- **Audience:** invited friends and family only. No public access, no monetizing, no growth goals.
- **Content:** kids, motorcycle trips, travel, everyday scenes, and food.
- **Writing:** a sentence or two per post at most. This is not a blog.

Guiding principles:

1. **Visual first.** Media is the content; text is a caption.
2. **Post from the iPhone in seconds.** If posting needs a laptop, it won't happen.
3. **Only post what's fine for everyone who can see the site.** Locations are exact.
4. **Free or nearly free to run**, with low maintenance. It's a hobby.

## Look and feel

Dark background, plain white terminal-style monospace font, simple `outofbreathed.com` title at the top. Minimal and unadorned. The working prototype is `mocks/index.html` (map + timeline); build to match it.

## Views and features

Every photo or video is a **moment** with a date, a place, a category, an optional caption and a privacy setting. The site offers several views of the same collection.

**Map view**

- A dark 3D globe (MapLibre globe projection) that opens centered on Australia; zooming in fades in coastlines, roads and parks.
- Moments cluster on a map and spread apart as you zoom in.
- Each place label has two actions: the name opens **my photos** from that place; `[i]` opens **about**, a Wikipedia summary plus a few photos of the area from Wikimedia Commons (article images first, then nearby geotagged photos, credited with author and license).
- **About content is cached, not stored.** A Worker endpoint fetches Wikipedia/Commons on demand and keeps the result in Cloudflare's edge cache for about a week, so it stays current and costs no D1 storage or reads. Images are never copied; they load from Wikimedia by URL. Only my overrides live in D1 (see `place_info` below), and they are applied before caching.
- Motorcycle rides can show the actual route as a line, from a GPX file recorded on a ride app (later phase).

**Timeline view**

- A straight chronological scroll, newest first, grouped by month and year.
- **Sets** group an event's photos ("Perth", "Mum's 70th"): one card at the set's first date with a cover, a few thumbnails and "+N", then `title · dates · count · places` and the set's caption. It opens the set's page. Sets are named on the post page when uploading; a moment belongs to at most one set. No single event (like the move to Australia) is treated as a starting point or given special framing.

**Category lenses**

- Filters that work on both views: misc, family, travel, moto, food.

**Extras (later)**

- **On this day:** the home page shows what we were doing a year ago.

## Posting from iPhone

**Current approach:** posting happens on the owner-only `/post` page, saved to the iPhone home screen as a "post" app. It shows each picked photo's date and whether a location was found before uploading (Safari strips location unless **Options → Location** is on in the photo picker). The Shortcut below is paused until the upload API settles.

Original plan: posting happens from the Photos app share sheet through an iOS Shortcut, with a private post page as backup. Both are free; no App Store app or Apple developer account is needed.

**Main flow: "Post to outofbreathed" Shortcut** (posts to outofbreathed.com only; unrelated to the family app)

1. Select one or more photos or videos in Photos, tap Share, choose the Shortcut.
2. The Shortcut reads each item's date and GPS location directly from the photo. This matters because iPhones often strip location when uploading through a web page.
3. It asks for one or more categories and an optional caption.
4. For a long ride video, it asks for an optional YouTube link instead of uploading the file.
5. It compresses videos on the phone (Encode Media), then uploads each file straight to storage, retrying on a weak connection.
6. The moment appears on the site immediately; no rebuild step.

**Backup: private post page**

- An owner-only page saved to the iPhone home screen.
- Used for editing captions, changing categories or privacy, deleting posts, and posting when the Shortcut isn't handy.

**Security**

- The Shortcut authenticates with a long secret token stored on the phone (a Cloudflare Access service token or similar), never a password.
- Only my account can open the post page.

## Privacy and access

The whole site sits behind a login. There is no per-post privacy setting: I only publish what I'm comfortable with every invited person seeing.

**Login for everyone**

- Cloudflare Access in front of the whole site. Visitors enter their email and get a one-time code; no passwords.
- An allow-list of invited emails. The site is marked `noindex` so search engines skip it.
- Media files are served only through the site after checking the viewer is signed in. A copied file link doesn't work outside the login.

**Location: exact**

- Every moment shows where it was actually taken, so travel and food posts show the exact beach, lookout or restaurant. Place names include the venue when OpenStreetMap knows it ("Burleigh Beach Pavillion, Burleigh Heads").
- On the map, photos within ~100 m share one pin (a "place"); the Wikipedia "about" panel describes the surrounding suburb or town.
- GPS and other metadata are still stripped from the image files people view and download, since files can be forwarded beyond the site.
- display\_lat/lng stay separate from lat/lng so a position could be shown differently later (e.g. a home zone).

**Known limit:** no site can stop an allowed viewer from screenshotting. The real control is who gets invited and what gets posted.

## Video strategy

All videos live on YouTube as **Unlisted** uploads and are embedded; the site stores no video files.

- Free, no length or storage limits, adaptive quality on slow connections. No paid streaming service.
- Post a video by pasting its YouTube link on `/post`, with a date and a typed place (e.g. "Springbrook, QLD"). The place is looked up on OpenStreetMap so the video still appears on the map.
- Embeds use privacy-enhanced mode (`youtube-nocookie.com`), play inline, and limit end-of-video suggestions to the same channel.
- Use Unlisted, not Private, or embeds won't play. Unlisted links can be forwarded by anyone who has them, so only post videos that are fine to leak.
- The upload API rejects video files with a pointer to YouTube.

## Data model

One main table of moments in D1, with media files in R2. A starting sketch for Claude Code to refine:

| Field | Type | Notes |
| --- | --- | --- |
| id | text | Unique id |
| kind | text | photo or video |
| taken\_at | datetime | From the photo's metadata |
| lat, lng | number | Exact location as recorded |
| display\_lat, display\_lng | number | What the map shows: currently the exact position |
| place\_name | text | Suburb or place, looked up once on upload |
| category | text | Primary category: misc, family, travel, moto, food. All of a moment's categories (it can have several) live in `moment_categories`. |
| caption | text | Optional, a sentence or two |
| visibility | text | Unused (always everyone); kept in case audience levels are wanted later |
| source | text | site or youtube |
| media\_key | text | R2 file path (site media) |
| youtube\_id | text | For YouTube videos |
| thumb\_key | text | Small preview image in R2 |
| width, height, duration | number | For layout and players |
| set\_id | text | Optional: the set (event/trip) this moment belongs to; one set per moment |
| created\_at | datetime | When posted |

Supporting tables: **sets** (title, caption, cover; dates and places derived from its moments; GPX route later for rides), **place\_info** (my overrides only: chosen Wikipedia article title and hidden Commons photos per place; the Wikipedia content itself lives in the edge cache).

## Costs

Expected cost is $0 a month at first, rising to about $1–2 a month as video builds up, plus the domain renewal I already pay.

| Piece | Free allowance | Beyond free |
| --- | --- | --- |
| Cloudflare Access (login) | Up to 50 users, indefinitely | $7 per user per month |
| R2 (photo and video storage) | 10 GB-month, free egress | $0.015 per GB-month |
| D1 (database) | 5M rows read and 100K rows written per day, 5 GB storage | Workers Paid plan |
| Workers (site and API) | Free plan | Workers Paid plan |
| YouTube (long ride videos) | Free | n/a |
| iOS Shortcut | Free | n/a |

Staying in the free tier:

- Store web-sized copies only; originals stay in iCloud.
- Compress video on the phone before upload; send long videos to YouTube.
- Since September 1, 2026, D1 strictly enforces its free daily limits: queries fail until midnight UTC. Use indexed queries and cache pages so normal traffic stays far below the limit, and show a friendly message if it's ever hit.
- Watch the 50-user Access cap when inviting people.

Sources: [R2 pricing](https://developers.cloudflare.com/r2/pricing), [D1 free tier enforcement](https://developers.cloudflare.com/changelog/post/2026-09-01-d1-free-tier-limit-enforcement/), [D1 daily limits](https://tproger.ru/news/cloudflare-nachala-otklyuchat-d1-na-besplatnom-plane-pri-prevyweni), [Zero Trust free plan](https://zerotrustcost.com/cloudflare-zero-trust-pricing). Verify current pricing before relying on it.

## Domain migration

The new site replaces the old blog on my existing domain. The domain's DNS needs to be managed by Cloudflare so Access and Workers can sit in front of it; the registration itself can stay where it is.

1. **Back up the old blog** first: its content, images and any database export.
2. **Note what the domain already does,** especially email. Copy all DNS records (MX, TXT, SPF/DKIM) before changing anything so email keeps working.
3. **Add the domain to Cloudflare** (free plan) and switch the nameservers at the registrar. Check the imported DNS records match.
4. **Build and test on a free `workers.dev` address** while the old blog stays live.
5. **Cut over:** point the domain at the new Worker and turn on Access for it.
6. **Optional:** redirect old blog URLs to the home page, or keep the old posts in an archive section.

Open question: where is the domain registered, and is it used for email?

## Build phases

Build in five phases, each ending with something usable. Phase 2 is the most important: once posting from the phone works, the site fills itself.

1. **Foundation**
   - Cloudflare account, Worker, D1 database, R2 bucket, Access login on a `workers.dev` address.
   - Done when: a signed-in family member sees a test photo; a signed-out visitor sees nothing.
2. **Posting from iPhone**
   - Upload API, the Shortcut, metadata extraction, thumbnails, the private post page.
   - Done when: I share three photos from Photos and they appear on the site in under a minute.
3. **Timeline view**
   - Month-grouped scroll, category filters, photo and video viewer.
   - Built: sets (event groups with captions and covers), full-screen lightbox (swipe, keys, back gesture, `#p-ID` links), set pages as thumbnail grids, month-aligned paging with "older" and a year jump row.
   - Done when: the site is worth sending to family.
4. **Map view and privacy**
   - Globe map with clustering, place panels (my photos + cached Wikipedia "about").
   - Done when: the map works on phone and desktop.
   - Built: places are ~100 m spots (exact positions grouped), named after their most common place name (venue or suburb); globe from the prototype; panel with photos (lightbox) and [i] about (Wikipedia article found via OpenStreetMap's own wikipedia/wikidata tags, Commons photos, edge-cached a week); timeline place names link to `/map#@lat,lng`. Wikipedia overrides (`place_info`) not built yet.
5. **Video and extras**
   - YouTube embeds, ride routes, On this day.
   - Then: move the domain over and invite everyone.

## Getting started in Claude Code

Development happens in Claude Code in the terminal, working in a local project folder with git and Cloudflare's `wrangler` command-line tool.

1. Install Claude Code, create a project folder, run `git init`.
2. Export this plan as Markdown and save it in the folder as `PLAN.md`.
3. Start `claude` in the folder and run `/init`. Ask it to reference `PLAN.md` from the generated `CLAUDE.md`.
4. Kick off Phase 1 with a prompt like: *"Read PLAN.md. Set up Phase 1 using Astro on Cloudflare Workers with D1, R2 and Access. Walk me through the Cloudflare account steps I need to do myself."*
5. Work one phase at a time. Commit after each working step, and ask Claude to run the dev server and check its work.
6. Ask Claude to build the iOS Shortcut steps as a checklist, since Shortcuts are assembled on the phone itself.

- [ ] Install Claude Code and log in
- [ ] Create a Cloudflare account
- [ ] Back up the old blog
- [ ] Confirm domain registrar and email use
- [ ] Start Phase 1
