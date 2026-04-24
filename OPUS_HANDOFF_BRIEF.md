# Content Hub — Opus Handoff Brief

## Goal
Fix Facebook live metrics fetching in the Content Hub desktop app.

## Current issue
The app successfully fetches Instagram and TikTok live metrics, but Facebook reel/post URLs currently return zeros for all metrics in the app.

Example failing URL:
- `https://www.facebook.com/reel/992821160364122`

## What already works
- App builds successfully on Windows
- Windows installer builds successfully via Tauri
- GitHub Actions builds macOS artifacts
- Instagram live metrics fetch works
- TikTok live metrics fetch works
- Facebook URLs are now accepted in platform selection and reporting
- Separate Instagram and Facebook live URL fields were added in the job detail / posted job flow

## What has already been changed
### Facebook platform support added
- Facebook added as an intended posting platform across the app
- Facebook added into reports / overview / charts where reporting is generated
- Facebook added to live metrics backend routing

### Separate Instagram / Facebook URL support added
The app previously used one shared `live_url` field. It now has:
- `instagram_live_url`
- `facebook_live_url`
- `platform_metrics_json`

The UI in `JobDetail.tsx` now supports:
- separate Instagram URL input
- separate Facebook URL input
- one fetch button that attempts both
- separate displayed metric blocks per platform

## Suspected root cause
The Facebook Apify actor response schema is likely different from what the Rust backend parser expects.

Current behavior suggests:
- scrape call is accepted
- dataset item may be returned
- parser falls back to zero because it does not find the correct fields

A direct exact mapping to the real response payload for a Facebook reel is needed.

## Files most relevant to inspect
### Backend / scrape parsing
- `src-tauri/src/main.rs`

Relevant functions in there:
- `detect_platform`
- `run_apify_actor`
- `fetch_facebook_metrics`
- `fetch_metrics_with_ai`
- `debug_fetch_facebook_post` (recently added to help inspect raw payloads)

### Frontend metrics UI
- `src/components/JobDetail.tsx`

### Reporting aggregation
- `src/components/ReportsPage.tsx`

### Data model / DB layer
- `src/types/index.ts`
- `src/services/database.ts`

## Current Facebook parser status
`fetch_facebook_metrics` has already been expanded to try multiple possible field names for:
- views
- likes / reactions
- comments
- shares

It also includes helper functions:
- `get_u64_path`
- `sum_object_u64`

But it still likely needs mapping against the exact real Apify response for Facebook reels.

## Important constraints
- Keep all existing features working
- Do not remove the Instagram/TikTok live metrics support
- Preserve current UI changes for separate Instagram and Facebook live URLs
- Keep reporting support intact
- Prefer minimal targeted changes over large refactors

## Desired end state
When a posted job contains a Facebook reel/post URL:
1. Clicking **Fetch Live Metrics** should retrieve real Facebook numbers
2. Those numbers should populate the job’s Facebook metric block
3. Those metrics should flow into reports/overview/charts just like Instagram/TikTok metrics do
4. No regression to Instagram/TikTok fetching

## Suggested debugging approach for Opus
1. Inspect `debug_fetch_facebook_post` in `src-tauri/src/main.rs`
2. Run it against the failing Facebook reel URL
3. Capture the exact returned JSON payload
4. Update `fetch_facebook_metrics` to map the actual response keys, not guessed ones
5. If needed, support multiple Facebook result shapes (reels vs posts vs videos)
6. Verify frontend receives real non-zero metrics
7. Confirm reports still aggregate correctly
8. Build and test the app

## Repo / build context
Project path:
- `C:\Users\deano\Projects\content-hub`

Build commands:
- frontend build: `npm run build`
- Windows desktop build: `npm run tauri-build`

Windows installer output:
- `src-tauri\target\release\bundle\nsis\Content Hub_0.1.0_x64-setup.exe`

## Recent relevant commits
These may help understand the change history:
- `bf7da0a` — add facebook live metrics and reporting
- `d741fd0` — support separate instagram and facebook live urls
- `e3a4165` — improve facebook metrics parsing

## Request to Opus
Please:
- inspect the Facebook scraper response shape
- fix the Facebook metrics parser so real values populate
- keep the separate Instagram/Facebook URL workflow intact
- rebuild and verify the app
- explain exactly what the real Facebook response fields were

## Deliverables requested from Opus
1. Summary of root cause
2. Files changed
3. Exact parser fix applied
4. Build result
5. Any remaining caveats for Facebook URLs / reels
