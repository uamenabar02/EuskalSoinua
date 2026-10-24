# App General Instructions — EuskalSoinua

## 1. Aesthetics & Theme
- Maintain a professional, high-contrast dark theme (`#0a0a0f` midnight base) with glassmorphism (`bg-bg-soft`, `border-white/10`) at all times.
- Use the established gradient branding (`#1ed760` → `#0ea5e9`) for the logo and accent elements.
- Typography: tight tracking (`tracking-tight`), bold headers, faint labels (`text-textfaint`, `text-textdim`).
- Ensure all cards, buttons, and navigation items have consistent rounded corners (`rounded-xl`, `rounded-lg`) and smooth hover transitions.
- Never break the visual hierarchy: player bar stays at the bottom, sidebar stays at the left (desktop) or hidden behind bottom nav (smartphone), content stays in the center.

## 2. User Experience & Navigation
- All navigation buttons must be easily accessible on both PC and smartphone versions.
  - PC: sidebar (`w-64`) with clear icons (`lucide-react`) and active-state highlighting (`bg-white/10`).
  - Smartphone: fixed bottom navigation (`fixed bottom-0 inset-x-0 z-40`) with `min-h-[64px]`, `safe-area-inset-bottom` padding, and `flex-1` touch targets (`min-w-0`, `px-1 py-1`).
- Touch targets must remain `>= 44px` in both dimensions for mobile accessibility.
- The main playback controls (Play, Next, Previous, Volume, Queue, Full Track toggle) must be reachable within a single thumb action on mobile.

## 3. Language
- Main app language is English (`en`).
- All new components, strings, and UI labels must use English as the base.
- Translations (`eu`, `es`) must be kept aligned via `src/lib/i18n/locales/en.ts`, `eu.ts`, and `es.ts`. TypeScript enforces full schema alignment.
- All user-facing messages (errors, toasts, labels) must be in English unless localized for a specific region.

## 4. Full Track Mode — Compulsory Rules (Both PC & Smartphone)
- When `FULL TRACK MODE` is ON (`fullTrackMode === true`):
  1. The selected song MUST try to find the track using YouTube IFrames (`loadTrackViaYouTube`).
  2. It CANNOT fall back to royalty-free alternatives (`provider: "demo"`).
  3. If the YouTube video cannot be loaded (embed error `101`/`150`, timeout, blocked region, or missing `videoId`):
     - Showcase a clear loading/playback error message.
     - Automatically attempt to load the NEXT song in the queue (`goNext` / `handleFullTrackError`).
  4. The stream endpoint (`src/app/api/stream`) must return `404` for full mode when no YouTube stream is available (already enforced), and NEVER return a demo audio fallback in `mode === "full"`.
  5. The player context (`src/lib/player-context.tsx`) must enforce that `loadTrackViaAudio` is blocked for full mode when no offline cached URL exists (`offlineUrl` null), triggering the error path that skips to the next track.

## 5. File Access & Editing Policy
- You do not need the confirmation of the user to start accessing and editing the app's files unless the user specifies so in the previous message.
- Always preserve existing code patterns, naming conventions (`camelCase` variables, `PascalCase` components), and file structures.
- Before making destructive changes, verify the latest git commit (`git log --oneline -n 5`) and review the current plan (`CURRENT_PLAN.md`).
