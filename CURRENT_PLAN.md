# CURRENT PLAN: Robust YouTube Resolution & Smartphone Offline Playback

## 1. Algorithmic YouTube Resolution Upgrade (Streaming & Playback)
- [x] Implement `isShortOrCommonTitle` detection in `src/lib/sources/streaming.ts`
- [x] Enforce strict artist verification in `scoreHit` for short/common titles (rejecting unrelated videos like generic "Loco" hits)
- [x] Implement Basque record labels & YouTube Music official topic (`- Topic`, `Gor Discos`, `Elkar`, `Baga-Biga`, `Mauka`, `Gaztea`) targeted queries
- [x] Implement duration sanity filter (rejecting YouTube shorts <35s and hour-long mixes >15m)
- [x] Increase resolution timeout ceiling and pass duration to `resolveVideoIdForTrack` in `src/lib/playback.ts`

## 2. Background Auto-Buffering & Offline Queue Playback
- [x] Create `src/lib/playback-cache.ts` with IndexedDB LRU audio buffer for pre-caching upcoming queue tracks
- [x] Wire background auto-buffering in `src/lib/player-context.tsx` to pre-resolve and pre-buffer the next 2-3 tracks in queue
- [x] Add offline fallback logic in `player-context.tsx`: if internet drops during Full Track Mode, seamlessly play cached audio before skipping
- [x] Add lock screen / background media resilience for mobile playback

## 3. Localization & Touch Accessibility
- [x] Add translation strings for offline buffering and playback status in `src/lib/i18n/locales/en.ts`, `eu.ts`, and `es.ts`
- [x] Ensure mobile player controls and offline indicators meet the $\ge 44\text{px}$ touch target standard

## 4. Verification & Testing
- [x] Unit tests for YouTube short-title disambiguation, Basque query generation, and duration filters in `tests/youtube-resolution.test.ts` (21 tests)
- [x] Integration tests for queue pre-buffering and offline fallback in `tests/playback-cache.test.ts`
- [x] Run full test suite (`npm test`: 44/44 passed across 8 test suites), lint check (`lint_applet`: 0 errors), and build check (`compile_applet`: build succeeded)
