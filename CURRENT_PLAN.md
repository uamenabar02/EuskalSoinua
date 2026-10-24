# CURRENT PLAN — Updated

## Status of Previous Plan (Robust YouTube Resolution & Offline Playback)
- [x] Implement `isShortOrCommonTitle` in `src/lib/sources/streaming.ts`
- [x] Enforce strict artist verification in `scoreHit` for short/common titles
- [x] Implement Basque label & Topic queries
- [x] Implement duration sanity filter
- [x] Increase resolution timeout and pass duration to `resolveVideoIdForTrack`
- [x] Create `src/lib/playback-cache.ts` with IndexedDB LRU buffer
- [x] Wire background auto-buffering in `src/lib/player-context.tsx`
- [x] Add offline fallback logic in `player-context.tsx`
- [x] Add lock screen / background media resilience
- [x] Add translation strings for offline buffering
- [x] Ensure mobile touch targets meet `>= 44px`
- [x] Unit tests (`youtube-resolution.test.ts`, 21 tests) — 44/44 passed
- [x] Integration tests (`playback-cache.test.ts`)
- [x] Full test suite (`npm test`), lint (`lint_applet`), build (`compile_applet`) — all passed

## Active Issue — "Loco" by Vendetta (Full Track Mode Resolution)
- Song: Vendetta — "Loco"
- Problem: Even with correct metadata, playing the song sometimes loads a different track instead of the authentic Basque ska-punk song.
- Root causes addressed:
  - `VIDEO_ID_CACHE` isolation improved (`::d:${duration}::r:${region}` in key).
  - `clearVideoIdCache()` added and called when YouTube embed errors (`101`/`150`/`100`) occur, forcing fresh resolution.
  - Strict `scoreHit` already rejects unrelated hits (`Anuel AA - Loco`) with `-999`.
- Action: Monitor playback of "Loco" after edit; if wrong video still loads, verify the DB `externalId` for the track and check `loadTrackViaYouTube` routing.

## New Compulsory Requirements (Both PC & Smartphone)
- [x] FULL TRACK MODE ON: Always try `loadTrackViaYouTube`. No demo fallback.
- [x] FULL TRACK MODE ON: If song cannot load, show error and try next song (`handleFullTrackError` → `goNext`).
- [x] Maintain aesthetics/theme (professional dark glass theme).
- [x] Navigation buttons easily accessible (PC sidebar + smartphone bottom nav, `>= 44px` touch targets).
- [x] Main app language is English (`en`).
- [x] App instructions file generated (`APP_GENERAL_INSTRUCTIONS.md`).
