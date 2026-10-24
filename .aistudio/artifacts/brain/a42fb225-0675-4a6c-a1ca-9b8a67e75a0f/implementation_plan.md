# Robust Track Resolution & Smartphone Offline Playback Plan

## 1. Problem Diagnosis & Root Causes

### A. YouTube IFrame Resolution Failures & False Positive Matches
1. **Short/Common Title False Positives (e.g., "Vendetta - Loco")**:
   - In `src/lib/sources/streaming.ts`, `matchesTitle()` accepted plain substring matches `h.includes(t)`. For short single-word titles like "Loco" (or "Su", "Gaua", "Intro", "Hegoak"), any video containing the substring matched with maximum base score (80 points).
   - In `scoreHit()`, when the artist was absent, only 30 points were deducted (80 - 30 = 50 points), which still exceeded the minimum acceptance threshold ($\ge 45$ points). As a result, viral videos like popular reggaeton songs or movie clips named "Loco" scored 50 and were mistakenly chosen over the authentic Basque ska-punk track by Vendetta.
2. **Niche Basque Track Resolution Failures**:
   - `resolveTrackForPlayback()` had an aggressive 3,500ms race timeout, abandoning query retries prematurely on slower mobile networks.
   - Query generation restricted Basque term additions to tracks with an explicit `track.region === "eu"` tag, missing many catalog tracks where `region` was undefined.
   - Queries lacked Basque music ecosystem patterns: major Basque labels (*Elkar*, *Gor Discos*, *Baga-Biga*, *Mauka*, *Gaztea*, *Panda Artist*) and official YouTube auto-generated art tracks (*"Artist - Topic"*).
   - Missing duration validation allowed YouTube Shorts (<45s) or full-album compilations (>30m) to beat authentic 3-4 minute song tracks.

### B. Smartphone Playback Interruption on Mobile Network Drops
1. Track transitions currently trigger on-demand HTTP calls to `/api/stream-info` and YouTube. If internet drops or stutters during a walk or in the background, requests abort or timeout, stopping playback entirely.
2. While `src/lib/downloads.ts` supports manual track downloads to IndexedDB, it is not connected to automatic playback caching for upcoming queue tracks.

---

## 2. Proposed Architectural Solution

### Phase 1: Universal YouTube Resolution Engine (`src/lib/sources/streaming.ts` & `src/lib/playback.ts`)
1. **Strict Artist Verification for Short/Common Titles**:
   - Define dynamic detection: Titles with $\le 2$ words, $< 6$ characters, or matching common words (e.g., "Loco", "Intro", "Live", "Outro", "Remix", "Gaua", "Su") require **strict artist presence** in either the video title, description, or channel/uploader name.
   - If artist is not found on a short-title track, reduce score by 75 points or disqualify immediately, preventing unrelated viral hits from ever passing the threshold.
2. **Basque Music Ecosystem Search Strategy**:
   - For all Basque catalog tracks or Basque-language queries, generate targeted query variants:
     - `"${artist}" "${title}"` (exact quotes for high-precision search)
     - `"${artist} - ${title} (Audio Oficial)"`
     - `"${artist} - Topic ${title}"` (official YouTube Music auto-generated metadata)
     - `"${artist} ${title} (Gor Discos OR Elkar OR Baga-Biga OR Mauka OR Gaztea)"`
3. **Duration Bounds Checking**:
   - When track duration is known (or estimated at ~3m30s), penalize results whose duration differs by $> 150$ seconds, preventing YouTube Shorts and multi-hour mixes from being selected.
4. **Resilient Timeout & Multi-Candidate Evaluation**:
   - Increase timeout ceiling to 6,500ms on mobile.
   - Rank multiple candidates and keep fallback video IDs ready if the top candidate is region-blocked or fails playback event triggers.

---

### Phase 2: Mobile Background Auto-Buffering & Offline Cache (`src/lib/playback-cache.ts` & `src/lib/player-context.tsx`)
1. **Queue Pre-Resolver & Cache Worker**:
   - When a track starts playing, automatically pre-resolve YouTube video IDs and pre-fetch audio streams for the **next 2 tracks in the queue**.
   - Store resolved stream metadata and audio blobs in an LRU IndexedDB/CacheStorage buffer (`PlaybackCache`), keeping up to 10 recently played/upcoming tracks ready for immediate playback.
2. **Seamless Offline Fallback**:
   - In Full Track Mode, if network drops:
     - Check `PlaybackCache` or `DownloadedTracks` for the current or next song.
     - If local audio is cached, route the HTML5 `<audio>` element to the cached object URL seamlessly and render a subtle "Offline Playing" status badge.
     - If no cached audio exists and YouTube IFrame reports an error (`code: 100`, `101`, `150`, or network offline), display a clean non-intrusive toast and immediately advance to the next playable track in the queue without crashing or freezing.
3. **Mobile & Background Playback Optimization**:
   - Configure `navigator.mediaSession` with full metadata (title, artist, album, artwork, playback state) so playback controls and audio keep running smoothly in lock screen and background states.

---

### Phase 3: Internationalization & UX Consistency
1. Update `src/lib/i18n/locales/en.ts`, `eu.ts`, and `es.ts` with localized strings for:
   - Network offline status & offline playback indicators.
   - YouTube resolution status messages (e.g., "Playing cached version", "Skipping unplayable track").
2. Ensure touch targets on mobile player controls maintain $\ge 44\text{px}$ accessibility standards.

---

## 3. Verification & Testing Plan

1. **Automated Unit & Integration Tests**:
   - `tests/youtube-resolution.test.ts`:
     - Test short title disambiguation (e.g., "Vendetta - Loco" rejects generic "Loco" hits and accepts authentic "Vendetta - Loco").
     - Test Basque label query generation and Basque artist ground truth tracks (Bengo, ZETAK, La Txama, Izaro, Anari, Streetwise, Bizardunak, Olaia Inziarte, Tatta, Belako).
     - Test duration filter rejecting shorts and album mixes.
   - `tests/playback-cache.test.ts`:
     - Verify pre-buffering of upcoming queue items.
     - Verify offline playback retrieval when `navigator.onLine === false`.
2. **Regression & Quality Checks**:
   - Run `npm test` across all 7+ test suites to ensure 100% pass rate.
   - Run `lint_applet` and `compile_applet` to confirm clean builds.
