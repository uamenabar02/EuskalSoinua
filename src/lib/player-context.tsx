"use client";

import {
  createContext,
  useContext,
  useEffect,
  useRef,
  useState,
  useCallback,
  type ReactNode,
} from "react";
import type { Track, SponsorSegment, LyricLine } from "@/lib/types";
import { getDownloadedUrl } from "@/lib/downloads";

// 5-band equalizer centre frequencies (Hz).
const EQ_FREQS = [60, 230, 910, 3600, 14000];

type RepeatMode = "off" | "all" | "one";

// Minimal YouTube IFrame Player API surface (avoids needing @types/youtube).
interface YTPlayer {
  loadVideoById: (id: string) => void;
  cueVideoById: (id: string) => void;
  playVideo: () => void;
  pauseVideo: () => void;
  seekTo: (seconds: number, allowSeekAhead: boolean) => void;
  setVolume: (volume: number) => void;
  mute: () => void;
  unMute: () => void;
  getCurrentTime: () => number;
  getDuration: () => number;
  getPlayerState: () => number;
  destroy: () => void;
}

declare global {
  interface Window {
    YT?: { Player: new (el: HTMLElement | string, opts: unknown) => YTPlayer };
    onYouTubeIframeAPIReady?: () => void;
  }
}

interface PlayerState {
  current: Track | null;
  queue: Track[];
  index: number;
  isPlaying: boolean;
  currentTime: number;
  duration: number;
  volume: number;
  muted: boolean;
  shuffle: boolean;
  repeat: RepeatMode;
  eqEnabled: boolean;
  eqBands: number[];
  sponsorblockEnabled: boolean;
  segments: SponsorSegment[];
  activeSegment: SponsorSegment | null;
  lyrics: LyricLine[];
  lyricsLoading: boolean;
  nowPlayingOpen: boolean;
  buffering: boolean;
  provider: string;
  streamingConfigured: boolean;
  basqueBooster: boolean;
  fullTrackMode: boolean;
  engine: "audio" | "youtube";
  isLiveRadio: boolean;
  radioStation: { id: string; name: string; streamUrl: string; category: string } | null;
  sleepTimerMinutes: number | null;
  sleepTimerEnds: number | null;
  crossfadeSeconds: number;
  playerHidden: boolean;
}

interface PlayerActions {
  playQueue: (tracks: Track[], startIndex?: number) => void;
  togglePlay: () => void;
  next: (auto?: boolean) => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleBooster: () => void;
  toggleFullTrack: () => void;
  playRadio: (trackId: number) => Promise<number | null>;
  playLiveRadio: (station: { id: string; name: string; streamUrl: string; category: string }) => void;
  cycleRepeat: () => void;
  setEqBand: (i: number, v: number) => void;
  applyEqBands: (bands: number[]) => void;
  toggleEq: () => void;
  toggleSponsorblock: () => void;
  openNowPlaying: () => void;
  closeNowPlaying: () => void;
  setSleepTimer: (minutes: number) => void;
  cancelSleepTimer: () => void;
  setCrossfade: (seconds: number) => void;
  togglePlayerHidden: () => void;
}

const PlayerContext = createContext<(PlayerState & PlayerActions) | null>(null);

const EMPTY_STATE: PlayerState = {
  current: null,
  queue: [],
  index: -1,
  isPlaying: false,
  currentTime: 0,
  duration: 0,
  volume: 0.85,
  muted: false,
  shuffle: false,
  repeat: "off",
  eqEnabled: false,
  eqBands: [0, 0, 0, 0, 0],
  sponsorblockEnabled: true,
  segments: [],
  activeSegment: null,
  lyrics: [],
  lyricsLoading: false,
  nowPlayingOpen: false,
  buffering: false,
  provider: "demo",
  streamingConfigured: false,
  basqueBooster: false,
  fullTrackMode: false,
  engine: "audio",
  isLiveRadio: false,
  radioStation: null,
  sleepTimerMinutes: null,
  sleepTimerEnds: null,
  crossfadeSeconds: 0,
  playerHidden: false,
};

/**
 * PERSISTENT <audio> ELEMENT
 * --------------------------------------------------------------------------
 * The <audio> element is rendered as JSX INSIDE the root-layout PlayerProvider
 * (see the return below). Because the root layout persists across client-side
 * route changes, this element is NEVER destroyed or paused by navigation — it
 * stays mounted for the whole session, guaranteeing uninterrupted playback.
 *
 * (A manually-created element appended to <body> can be evicted by React's
 * reconciliation; rendering it inside the persistent tree is bulletproof.)
 *
 * Event listeners are wired once (idempotent) and dispatched through mutable
 * hooks so they always invoke the latest closures without being re-attached.
 */

// Dispatch hooks — the element's listeners call these; the provider updates
// them so they always reference fresh state/closures.
const audioDispatch = {
  onTime: (_t: number) => {},
  onPlay: () => {},
  onPause: () => {},
  onWaiting: () => {},
  onPlaying: () => {},
  onEnded: () => {},
};

// YouTube videos that refuse to embed (error 101/150). Tracked PER VIDEO so one
// un-embeddable upload never forces every later song onto the preview fallback.
const failedEmbedVideoIds = new Set<string>();

// Idempotent: safe to call repeatedly on the same element.
function wireAudioListeners(audio: HTMLAudioElement) {
  if (audio.dataset.wired === "1") return;
  audio.dataset.wired = "1";
  audio.addEventListener("timeupdate", () => audioDispatch.onTime(audio.currentTime));
  audio.addEventListener("play", () => audioDispatch.onPlay());
  audio.addEventListener("pause", () => audioDispatch.onPause());
  audio.addEventListener("waiting", () => audioDispatch.onWaiting());
  audio.addEventListener("playing", () => audioDispatch.onPlaying());
  audio.addEventListener("ended", () => audioDispatch.onEnded());
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  // Two persistent audio elements for crossfade (A/B swap). audioRef always
  // points to the ACTIVE element; the standby is used during the fade.
  const elARef = useRef<HTMLAudioElement | null>(null);
  const elBRef = useRef<HTMLAudioElement | null>(null);
  const activeSlotRef = useRef<"A" | "B">("A");
  const crossfadeRef = useRef<{
    active: boolean;
    raf: number | null;
    startedAt: number;
    durationMs: number;
    nextIndex: number;
    nextTrack: Track | null;
  }>({ active: false, raf: null, startedAt: 0, durationMs: 0, nextIndex: -1, nextTrack: null });

  const ctxRef = useRef<AudioContext | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const filtersRef = useRef<BiquadFilterNode[]>([]);
  const gainRef = useRef<GainNode | null>(null);

  const [state, setState] = useState<PlayerState>(EMPTY_STATE);
  const stateRef = useRef(state);

  // listen-event tracking
  const listenRef = useRef<{ trackId: number; maxPos: number } | null>(null);
  const pendingFlush = useRef<Promise<void> | null>(null);

  // ---- YouTube IFrame engine (full-track mode) ----
  const ytRef = useRef<YTPlayer | null>(null);
  const ytApiPromise = useRef<Promise<void> | null>(null);
  const ytVideoIdRef = useRef<string | null>(null);
  // Stable mutable container for latest callback versions, bypassing React 19 render-phase ref restrictions
  const dispatchRef = useRef({
    goNext: (auto?: boolean) => {},
    flushListen: (completed: boolean, skipped: boolean) => {},
    loadTrackViaAudio: (track: Track) => {},
    triggerCrossfade: (t: number, duration: number) => {},
    cancelCrossfade: () => {},
    completeCrossfade: () => {},
  });
  // YouTube player readiness + the video queued while the player was still
  // initializing. This fixes the "first song plays preview only" bug, which
  // happened because loadVideoById() was called before onReady fired.
  const ytReadyRef = useRef(false);
  const ytPendingVideoId = useRef<string | null>(null);
  // Persistent container for the YouTube IFrame. React owns this div but NEVER
  // its children — the YT API's iframe is appended imperatively, so React can't
  // destroy it during re-renders/navigation.
  const ytContainerRef = useRef<HTMLDivElement | null>(null);

  // -----------------------------------------------------------------------
  // Equalizer graph (lazily built on first user gesture)
  // -----------------------------------------------------------------------
  const ensureAudioGraph = useCallback(() => {
    const audio = audioRef.current;
    if (!audio || sourceRef.current) return;
    try {
      const Ctx =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext })
          .webkitAudioContext;
      const ctx = new Ctx();
      const source = ctx.createMediaElementSource(audio);
      const filters = EQ_FREQS.map((freq, i) => {
        const f = ctx.createBiquadFilter();
        f.frequency.value = freq;
        f.Q.value = 1.1;
        if (i === 0) f.type = "lowshelf";
        else if (i === EQ_FREQS.length - 1) f.type = "highshelf";
        else f.type = "peaking";
        f.gain.value = stateRef.current.eqEnabled
          ? stateRef.current.eqBands[i]
          : 0;
        return f;
      });
      const gain = ctx.createGain();
      gain.gain.value = 1;

      source.connect(filters[0]);
      for (let i = 0; i < filters.length - 1; i++) {
        filters[i].connect(filters[i + 1]);
      }
      filters[filters.length - 1].connect(gain);
      gain.connect(ctx.destination);

      ctxRef.current = ctx;
      sourceRef.current = source;
      filtersRef.current = filters;
      gainRef.current = gain;
    } catch {
      // AudioContext unavailable; plain <audio> still works.
    }
  }, []);

  // load persisted prefs
  useEffect(() => {
    fetch("/api/settings")
      .then((r) => r.json())
      .then((s) => {
        let localHidden = false;
        try {
          localHidden = localStorage.getItem("euskalsoinua-player-hidden") === "true";
        } catch (e) {}
        setState((p) => ({
          ...p,
          basqueBooster: s.basque_booster,
          sponsorblockEnabled: s.sponsorblock,
          shuffle: s.shuffle,
          fullTrackMode: s.full_track === true,
          crossfadeSeconds: s.crossfade ?? 0,
          playerHidden: localHidden,
        }));
      })
      .catch(() => {
        try {
          const localHidden = localStorage.getItem("euskalsoinua-player-hidden") === "true";
          setState((p) => ({ ...p, playerHidden: localHidden }));
        } catch (e) {}
      });
  }, []);

  // ---- YouTube IFrame API loader (lazy) ----
  const loadYouTubeApi = useCallback((): Promise<void> => {
    if (window.YT?.Player) return Promise.resolve();
    if (ytApiPromise.current) return ytApiPromise.current;
    ytApiPromise.current = new Promise<void>((resolve) => {
      const tag = document.createElement("script");
      tag.src = "https://www.youtube.com/iframe_api";
      const prev = window.onYouTubeIframeAPIReady;
      window.onYouTubeIframeAPIReady = () => {
        prev?.();
        resolve();
      };
      document.head.appendChild(tag);
    });
    return ytApiPromise.current;
  }, []);

  // create/ensure the hidden YT player instance. `initialVideoId` is the FIRST
  // video — passed straight to the constructor so it auto-plays on ready and
  // never misses the onReady window (which is what caused the first-song bug).
  const ensureYTPlayer = useCallback(async (initialVideoId?: string) => {
    if (ytRef.current) return ytRef.current;
    await loadYouTubeApi();
    if (!window.YT) return null;
    // Use a REF'd container and create the player div imperatively inside it.
    // This avoids the classic React/DOM desync where the YT API replaces a
    // React-managed div with an iframe — which React could then wipe on a
    // re-render, killing playback. The child div is never touched by React.
    const container = ytContainerRef.current;
    if (!container) return null;
    const host = document.createElement("div");
    container.appendChild(host);
    ytReadyRef.current = false;
    ytRef.current = new window.YT.Player(host, {
      // cue the first video immediately so it begins as soon as onReady fires
      videoId: initialVideoId || "",
      width: "200",
      height: "200",
      playerVars: {
        autoplay: 1,
        controls: 0,
        disablekb: 1,
        modestbranding: 1,
        playsinline: 1,
        rel: 0,
      },
      events: {
        onReady: () => {
          ytReadyRef.current = true;
          const v = stateRef.current.muted ? 0 : stateRef.current.volume;
          try {
            ytRef.current?.setVolume(Math.round(v * 100));
          } catch {
            /* noop */
          }
          // if a video was queued while the player was still initializing,
          // load it now that the player is actually ready.
          if (ytPendingVideoId.current) {
            const pending = ytPendingVideoId.current;
            ytPendingVideoId.current = null;
            try {
              ytRef.current?.loadVideoById(pending);
            } catch {
              /* noop */
            }
          }
        },
        onStateChange: (e: { data: number }) => {
          const st = e.data;
          // 0 ENDED, 1 PLAYING, 2 PAUSED, 3 BUFFERING, 5 CUED
          if (st === 1) setState((p) => ({ ...p, isPlaying: true, buffering: false }));
          else if (st === 2) setState((p) => ({ ...p, isPlaying: false }));
          else if (st === 3) setState((p) => ({ ...p, buffering: true }));
          else if (st === 0) {
            dispatchRef.current.flushListen(true, false);
            dispatchRef.current.goNext(true);
          }
        },
        onError: () => {
          // 101/150 = embedding disabled for THIS video -> record it and fall
          // back to the ad-free preview. Other songs still get full-track mode.
          const vid = ytVideoIdRef.current;
          if (vid) failedEmbedVideoIds.add(vid);
          const t = stateRef.current.current;
          if (t) dispatchRef.current.loadTrackViaAudio(t);
        },
      },
    });
    return ytRef.current;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadYouTubeApi]);

  // -----------------------------------------------------------------------
  // Audio element wiring — the element is the JSX <audio> below (persistent).
  // A callback ref captures it; this effect wires the dispatch hooks once.
  // -----------------------------------------------------------------------
  const attachAudioRef = useCallback((el: HTMLAudioElement | null) => {
    elARef.current = el;
    if (activeSlotRef.current === "A") audioRef.current = el;
    if (el) wireAudioListeners(el);
  }, []);

  // Callback ref for the SECOND audio element (crossfade standby).
  const attachAudioBRef = useCallback((el: HTMLAudioElement | null) => {
    elBRef.current = el;
    if (activeSlotRef.current === "B") audioRef.current = el;
    if (el) wireAudioListeners(el);
  }, []);

  /** Returns the inactive (standby) audio element for crossfade. */
  const getShadowEl = useCallback(() => {
    return activeSlotRef.current === "A" ? elBRef.current : elARef.current;
  }, []);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return; // element not mounted yet
    wireAudioListeners(audio);

    // Point the dispatch hooks at fresh closures. These run for the life of the
    // app; updating the object each render keeps them referencing latest state.
    audioDispatch.onTime = (t: number) => {
      const activeEl = audioRef.current;
      const dur = activeEl?.duration || 0;
      setState((p) => ({ ...p, currentTime: t, duration: dur }));
      // keep the (optional) EQ audio context alive — resume if the browser
      // suspended it (e.g. after the tab was backgrounded)
      if (ctxRef.current && ctxRef.current.state === "suspended") {
        ctxRef.current.resume().catch(() => {});
      }
      if (listenRef.current) listenRef.current.maxPos = Math.max(listenRef.current.maxPos, t);
      if (stateRef.current.sponsorblockEnabled && stateRef.current.segments.length) {
        const seg = stateRef.current.segments.find(
          (s) => t >= s.start && t < s.end - 0.3,
        );
        if (seg) {
          if (activeEl) activeEl.currentTime = seg.end;
          setState((p) => ({ ...p, activeSegment: seg, currentTime: seg.end }));
          return;
        }
      }
      setState((p) => ({ ...p, activeSegment: null }));
      // Crossfade trigger: when approaching the end of a track
      dispatchRef.current.triggerCrossfade(t, dur);
    };
    audioDispatch.onPlay = () => setState((p) => ({ ...p, isPlaying: true, buffering: false }));
    audioDispatch.onPause = () => setState((p) => ({ ...p, isPlaying: false }));
    audioDispatch.onWaiting = () => setState((p) => ({ ...p, buffering: true }));
    audioDispatch.onPlaying = () => setState((p) => ({ ...p, buffering: false }));
    audioDispatch.onEnded = () => {
      // If a crossfade is active, complete it (swap elements) instead of goNext
      if (crossfadeRef.current.active) {
        dispatchRef.current.completeCrossfade();
        return;
      }
      dispatchRef.current.flushListen(true, false);
      dispatchRef.current.goNext(true);
    };

    // IMPORTANT: no teardown that pauses/destroys the audio. The singleton must
    // keep playing across route changes, so we intentionally do nothing here.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // -----------------------------------------------------------------------
  // Listen event flush
  // -----------------------------------------------------------------------
  const flushListen = useCallback((completed: boolean, skipped: boolean) => {
    const rec = listenRef.current;
    if (!rec) return;
    listenRef.current = null;
    const finalCompleted = completed || rec.maxPos > 30;
    pendingFlush.current = fetch("/api/play", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        trackId: rec.trackId,
        completed: finalCompleted,
        skipped: skipped && !finalCompleted,
        listenSeconds: Math.round(rec.maxPos),
      }),
    }).then(() => {
      pendingFlush.current = null;
    });
  }, []);

  // -----------------------------------------------------------------------
  // Core playback
  // -----------------------------------------------------------------------

  // Resolve metadata: videoId + provider + sponsorblock + lyrics. Shared by
  // both engines so the UI is consistent regardless of playback path.
  const loadTrackMeta = useCallback(
    (track: Track) => {
      setState((p) => ({ ...p, lyricsLoading: true }));
      fetch(`/api/lyrics?trackId=${track.id}`)
        .then((r) => r.json())
        .then((l: { lines: LyricLine[]; synced: boolean }) =>
          setState((p) => ({ ...p, lyrics: l.lines ?? [], lyricsLoading: false })),
        )
        .catch(() => setState((p) => ({ ...p, lyricsLoading: false })));
    },
    [],
  );

  // Play a track through the <audio> element (ad-free preview / extracted
  // stream). Pauses the YouTube engine if it was running.
  const loadTrackViaAudio = useCallback(
    (track: Track) => {
      const audio = audioRef.current;
      if (!audio) return;
      dispatchRef.current.cancelCrossfade();
      try {
        ytRef.current?.pauseVideo();
      } catch {
        /* noop */
      }
      setState((p) => ({ ...p, engine: "audio" }));

      const playWithSrc = (src: string) => {
        if (!audioRef.current) return;
        audioRef.current.src = src;
        audioRef.current.load();
        if (stateRef.current.eqEnabled) {
          ensureAudioGraph();
          if (ctxRef.current?.state === "suspended") ctxRef.current.resume();
        }
        audioRef.current.play().catch(() => {
          setState((p) => ({ ...p, isPlaying: false }));
        });
      };

      // Crucial for iOS/Android background audio: we must call .play() synchronously.
      // Therefore we DO NOT await IndexedDB here if we are online. We play the network stream instantly.
      if (typeof navigator !== "undefined" && !navigator.onLine) {
        getDownloadedUrl(track.id)
          .then((url) => playWithSrc(url ?? `/api/stream?trackId=${track.id}`))
          .catch(() => playWithSrc(`/api/stream?trackId=${track.id}`));
      } else {
        playWithSrc(`/api/stream?trackId=${track.id}`);
      }
    },
    [ensureAudioGraph],
  );

  // Play a track through the official YouTube IFrame player (FULL song, with
  // ads — the legal trade-off the user opts into via "Full Track mode").
  const loadTrackViaYouTube = useCallback(
    async (videoId: string) => {
      ytVideoIdRef.current = videoId;
      setState((p) => ({ ...p, engine: "youtube" }));
      // pause the audio element so engines don't overlap
      try {
        audioRef.current?.pause();
      } catch {
        /* noop */
      }
      // First-time creation: pass the videoId to the constructor so it begins
      // playing as soon as onReady fires (no missed-command race).
      const existed = !!ytRef.current;
      const player = await ensureYTPlayer(videoId);
      if (!player) {
        // API couldn't load -> fall back to audio
        const t = stateRef.current.current;
        if (t) loadTrackViaAudio(t);
        return;
      }
      // If the player already existed, load the new video. If it was JUST
      // created with this videoId, the constructor already cued it — but if the
      // player somehow isn't ready yet, queue it for onReady to pick up.
      if (existed) {
        if (ytReadyRef.current) {
          try {
            player.loadVideoById(videoId);
          } catch {
            const t = stateRef.current.current;
            if (t) loadTrackViaAudio(t);
          }
        } else {
          ytPendingVideoId.current = videoId;
        }
      }
    },
    [ensureYTPlayer, loadTrackViaAudio],
  );

  const loadTrack = useCallback(
    async (track: Track) => {
      const audio = audioRef.current;
      if (!audio) return;
      // record previous track outcome
      flushListen(false, listenRef.current ? true : false);
      listenRef.current = { trackId: track.id, maxPos: 0 };

      setState((p) => ({
        ...p,
        current: track,
        currentTime: 0,
        duration: track.duration,
        segments: [],
        activeSegment: null,
        lyrics: [],
        provider: "demo",
        engine: "audio",
        isLiveRadio: false,
        radioStation: null,
      }));

      // Lyrics always load.
      loadTrackMeta(track);

      // Start audio immediately if we know we won't use YT
      // This preserves iOS Safari's synchronous execution privilege across tracks
      const isYTEnabled = stateRef.current.fullTrackMode;
      let alreadyPlayingAudio = false;
      if (!isYTEnabled) {
        alreadyPlayingAudio = true;
        loadTrackViaAudio(track);
      }

      // Resolve videoId + provider first (needed to choose the engine).
      let videoId = track.externalId;
      let provider = "demo";
      try {
        const info = await fetch(`/api/stream-info?trackId=${track.id}`).then((r) => r.json()) as {
          provider: string;
          videoId: string | null;
        };
        videoId = info.videoId ?? videoId;
        provider = info.provider;
        setState((p) => ({ ...p, provider, streamingConfigured: true }));
        if (
          stateRef.current.sponsorblockEnabled &&
          info.videoId &&
          /^[\w-]{11}$/.test(info.videoId)
        ) {
          fetch(`/api/sponsorblock?videoId=${info.videoId}`)
            .then((r) => r.json())
            .then((d: { segments: SponsorSegment[] }) =>
              setState((p) => ({ ...p, segments: d.segments ?? [] })),
            )
            .catch(() => {});
        }
      } catch {
        /* keep defaults */
      }

      // Choose engine: full-track YouTube when enabled + we have a real id +
      // THIS video hasn't previously refused embedding. Each track gets a fresh
      // attempt, so one un-embeddable upload no longer breaks full-track mode.
      const useYT =
        isYTEnabled &&
        !!videoId &&
        /^[\w-]{11}$/.test(videoId) &&
        !failedEmbedVideoIds.has(videoId);
      if (useYT && videoId) {
        await loadTrackViaYouTube(videoId);
      } else if (!alreadyPlayingAudio) {
        await loadTrackViaAudio(track);
      }
    },
    [flushListen, loadTrackMeta, loadTrackViaAudio, loadTrackViaYouTube],
  );

  const preWarmAudio = useCallback(() => {
    const audioA = elARef.current;
    const audioB = elBRef.current;
    if (audioA) {
      const isDummyA = !audioA.src || audioA.src.startsWith("data:");
      if (isDummyA) {
        audioA.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA";
        audioA.play().catch(() => {});
      }
    }
    if (audioB) {
      const isDummyB = !audioB.src || audioB.src.startsWith("data:");
      if (isDummyB) {
        audioB.src = "data:audio/wav;base64,UklGRigAAABXQVZFZm10IBIAAAABAAEARKwAAIhYAQACABAAAABkYXRhAgAAAAAA";
        audioB.play().catch(() => {});
      }
    }
    if (ctxRef.current && ctxRef.current.state === "suspended") {
      ctxRef.current.resume().catch(() => {});
    }
  }, []);

  const playQueue = useCallback(
    (tracks: Track[], startIndex = 0) => {
      if (tracks.length === 0) return;
      preWarmAudio();
      const i = Math.max(0, Math.min(startIndex, tracks.length - 1));
      setState((p) => ({ ...p, queue: tracks, index: i }));
      loadTrack(tracks[i]);
    },
    [loadTrack, preWarmAudio],
  );

  // Song radio: build a Spotify-style radio playlist (saved to DB), play it,
  // and return the playlist id so the caller can navigate to its page.
  const playRadio = useCallback(
    async (trackId: number): Promise<number | null> => {
      try {
        const res = await fetch(`/api/radio?trackId=${trackId}`);
        const data = (await res.json()) as {
          tracks: Track[];
          playlistId: number;
        };
        if (data.tracks && data.tracks.length && data.playlistId) {
          playQueue(data.tracks, 0);
          return data.playlistId;
        }
      } catch {
        /* ignore */
      }
      return null;
    },
    [playQueue],
  );

  // LIVE RADIO: play a live radio stream through the audio element. Radio is a
  // continuous live stream (no duration, no seeking, no next/previous).
  const playLiveRadio = useCallback(
    (station: { id: string; name: string; streamUrl: string; category: string }) => {
      preWarmAudio();
      const audio = audioRef.current;
      if (!audio) return;
      dispatchRef.current.cancelCrossfade();
      // stop any YouTube playback
      try {
        ytRef.current?.pauseVideo();
      } catch {
        /* noop */
      }
      // flush the previous track's listen event
      flushListen(false, true);
      listenRef.current = null;

      setState((p) => ({
        ...p,
        current: null, // no track — it's a radio station
        radioStation: {
          id: station.id,
          name: station.name,
          streamUrl: station.streamUrl,
          category: station.category,
        },
        isLiveRadio: true,
        engine: "audio",
        isPlaying: false,
        buffering: true,
        currentTime: 0,
        duration: 0,
        segments: [],
        lyrics: [],
        queue: [],
        index: -1,
        provider: "live-radio",
      }));

      // Route through our HTTPS proxy to bypass mixed-content blocking
      // (most radio streams are HTTP-only; the app is HTTPS).
      const proxyUrl = `/api/radio-stream?url=${encodeURIComponent(station.streamUrl)}&name=${encodeURIComponent(station.name)}`;
      audio.src = proxyUrl;
      audio.load();
      if (stateRef.current.eqEnabled) {
        ensureAudioGraph();
        if (ctxRef.current?.state === "suspended") ctxRef.current.resume();
      }
      audio.play().catch(() => {
        setState((p) => ({ ...p, isPlaying: false, buffering: false }));
      });
    },
    [ensureAudioGraph, flushListen, preWarmAudio],
  );

  const togglePlay = useCallback(() => {
    preWarmAudio();
    // YouTube engine
    if (stateRef.current.engine === "youtube" && ytRef.current) {
      try {
        const st = ytRef.current.getPlayerState();
        if (st === 1) ytRef.current.pauseVideo();
        else ytRef.current.playVideo();
        return;
      } catch {
        /* fall through to audio */
      }
    }
    const audio = audioRef.current;
    if (!audio) return;
    // resume the Web Audio context only when the EQ graph exists
    if (stateRef.current.eqEnabled) {
      ensureAudioGraph();
      if (ctxRef.current?.state === "suspended") ctxRef.current.resume();
    }
    if (audio.paused) {
      audio.play().catch(() => {});
    } else {
      audio.pause();
    }
  }, [ensureAudioGraph, preWarmAudio]);

  const goNext = useCallback(
    (auto = false) => {
      const p = stateRef.current;
      const { queue, index, shuffle, repeat } = p;
      if (repeat === "one" && auto) {
        // replay current
        const audio = audioRef.current;
        if (audio) {
          audio.currentTime = 0;
          audio.play().catch(() => {});
        }
        return;
      }
      let nextIndex = index + 1;
      if (shuffle && queue.length > 1) {
        nextIndex = Math.floor(Math.random() * queue.length);
      }
      if (nextIndex >= queue.length) {
        if (repeat === "all") nextIndex = 0;
        else {
          nextIndex = -1;
        }
      }
      if (nextIndex >= 0 && queue[nextIndex]) {
        loadTrack(queue[nextIndex]);
        setState((prev) => ({ ...prev, index: nextIndex }));
      } else {
        setState((prev) => ({ ...prev, index: -1, isPlaying: false }));
      }
    },
    [loadTrack],
  );

  const next = useCallback(() => {
    preWarmAudio();
    dispatchRef.current.cancelCrossfade();
    flushListen(false, true);
    goNext(false);
  }, [goNext, flushListen, preWarmAudio]);

  const previous = useCallback(() => {
    preWarmAudio();
    const audio = audioRef.current;
    dispatchRef.current.cancelCrossfade();
    if (stateRef.current.engine === "youtube" && ytRef.current) {
      try {
        if (ytRef.current.getCurrentTime() > 3) {
          ytRef.current.seekTo(0, true);
          return;
        }
      } catch {
        /* fall through */
      }
    }
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return;
    }
    flushListen(false, true);

    const p = stateRef.current;
    const prevIndex = p.index - 1;
    if (prevIndex >= 0 && p.queue[prevIndex]) {
      loadTrack(p.queue[prevIndex]);
      setState((prev) => ({ ...prev, index: prevIndex }));
    } else {
      if (audio) audio.currentTime = 0;
    }
  }, [flushListen, loadTrack, preWarmAudio]);

  const seek = useCallback((time: number) => {
    if (stateRef.current.engine === "youtube" && ytRef.current) {
      try {
        ytRef.current.seekTo(time, true);
      } catch {
        /* noop */
      }
    }
    const audio = audioRef.current;
    if (audio) audio.currentTime = time;
    setState((p) => ({ ...p, currentTime: time }));
  }, []);

  const setVolume = useCallback((v: number) => {
    const audio = audioRef.current;
    if (audio) audio.volume = v;
    try {
      ytRef.current?.setVolume(Math.round(v * 100));
    } catch {
      /* noop */
    }
    setState((p) => ({ ...p, volume: v, muted: v === 0 }));
  }, []);

  const toggleMute = useCallback(() => {
    setState((p) => {
      const muted = !p.muted;
      const audio = audioRef.current;
      if (audio) audio.muted = muted;
      try {
        if (muted) ytRef.current?.mute();
        else ytRef.current?.unMute();
      } catch {
        /* noop */
      }
      return { ...p, muted };
    });
  }, []);

  const toggleShuffle = useCallback(() => {
    setState((p) => {
      const shuffle = !p.shuffle;
      fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ shuffle }),
      }).catch(() => {});
      return { ...p, shuffle };
    });
  }, []);

  const toggleBooster = useCallback(() => {
    setState((p) => {
      const basqueBooster = !p.basqueBooster;
      fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ basque_booster: basqueBooster }),
      }).catch(() => {});
      return { ...p, basqueBooster };
    });
  }, []);

  const cycleRepeat = useCallback(() => {
    setState((p) => ({
      ...p,
      repeat:
        p.repeat === "off" ? "all" : p.repeat === "all" ? "one" : "off",
    }));
  }, []);

  // Toggle full-track playback (official YouTube player: FULL songs, with ads).
  // Reloads the current track through the newly-selected engine.
  const toggleFullTrack = useCallback(() => {
    setState((p) => {
      const fullTrackMode = !p.fullTrackMode;
      fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ full_track: fullTrackMode }),
      }).catch(() => {});
      // reload current track through the new engine
      if (p.current) {
        setTimeout(() => loadTrack(p.current!), 0);
      }
      return { ...p, fullTrackMode };
    });
  }, [loadTrack]);

  // apply EQ band gains to the filter nodes
  const applyEqBandsInternal = useCallback((bands: number[], enabled: boolean) => {
    filtersRef.current.forEach((f, i) => {
      f.gain.value = enabled ? bands[i] ?? 0 : 0;
    });
  }, []);

  const setEqBand = useCallback(
    (i: number, v: number) => {
      setState((p) => {
        const bands = [...p.eqBands];
        bands[i] = v;
        applyEqBandsInternal(bands, p.eqEnabled);
        return { ...p, eqBands: bands };
      });
    },
    [applyEqBandsInternal],
  );

  const applyEqBands = useCallback(
    (bands: number[]) => {
      setState((p) => {
        applyEqBandsInternal(bands, p.eqEnabled);
        return { ...p, eqBands: bands };
      });
    },
    [applyEqBandsInternal],
  );

  const toggleEq = useCallback(() => {
    const enabled = !stateRef.current.eqEnabled;
    // The Web Audio graph is created lazily HERE (when the user enables the EQ)
    // rather than on every track. This is the only path that builds the graph,
    // so with the EQ off the <audio> element plays directly and never suspends.
    ensureAudioGraph();
    if (ctxRef.current?.state === "suspended") ctxRef.current.resume();
    // apply the gains AFTER the graph exists so the EQ is audible immediately
    applyEqBandsInternal(stateRef.current.eqBands, enabled);
    setState((p) => ({ ...p, eqEnabled: enabled }));
  }, [applyEqBandsInternal, ensureAudioGraph]);

  const toggleSponsorblock = useCallback(() => {
    setState((p) => {
      const sponsorblockEnabled = !p.sponsorblockEnabled;
      fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sponsorblock: sponsorblockEnabled }),
      }).catch(() => {});
      return { ...p, sponsorblockEnabled };
    });
  }, []);

  const openNowPlaying = useCallback(() => setState((p) => ({ ...p, nowPlayingOpen: true })), []);
  const closeNowPlaying = useCallback(() => setState((p) => ({ ...p, nowPlayingOpen: false })), []);

  // Sleep timer — pause playback after N minutes.
  const sleepTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const setSleepTimer = useCallback((minutes: number) => {
    if (sleepTimerRef.current) clearTimeout(sleepTimerRef.current);
    const ms = minutes * 60 * 1000;
    sleepTimerRef.current = setTimeout(() => {
      // pause whichever engine is active
      if (ytRef.current && stateRef.current.engine === "youtube") {
        try { ytRef.current.pauseVideo(); } catch { /* noop */ }
      }
      audioRef.current?.pause();
      setState((p) => ({ ...p, sleepTimerMinutes: null, sleepTimerEnds: null, isPlaying: false }));
    }, ms);
    setState((p) => ({
      ...p,
      sleepTimerMinutes: minutes,
      sleepTimerEnds: Date.now() + ms,
    }));
  }, []);

  const cancelSleepTimer = useCallback(() => {
    if (sleepTimerRef.current) {
      clearTimeout(sleepTimerRef.current);
      sleepTimerRef.current = null;
    }
    setState((p) => ({ ...p, sleepTimerMinutes: null, sleepTimerEnds: null }));
  }, []);

  // -----------------------------------------------------------------------
  // CROSSFADE — overlap the end of one song with the start of the next using
  // a second <audio> element. Volumes ramp in opposite directions over the
  // configured duration, then the elements swap roles.
  // -----------------------------------------------------------------------

  const completeCrossfade = useCallback(() => {
    const cf = crossfadeRef.current;
    if (!cf.active) return;
    if (cf.raf) cancelAnimationFrame(cf.raf);
    cf.active = false;
    cf.raf = null;

    const oldEl = audioRef.current;
    const nextTrack = cf.nextTrack;
    const nextIndex = cf.nextIndex;
    const targetVol = stateRef.current.muted ? 0 : stateRef.current.volume;

    // Flush listen event for the outgoing track
    dispatchRef.current.flushListen(true, false);

    // Pause + reset the old element
    if (oldEl) {
      oldEl.pause();
      oldEl.volume = targetVol;
    }

    // Swap: shadow becomes the new active element
    activeSlotRef.current = activeSlotRef.current === "A" ? "B" : "A";
    audioRef.current = activeSlotRef.current === "A" ? elARef.current : elBRef.current;

    // Update React state to the new track
    if (nextTrack) {
      listenRef.current = { trackId: nextTrack.id, maxPos: 0 };
      setState((p) => ({
        ...p,
        current: nextTrack,
        index: nextIndex,
        currentTime: 0,
        duration: nextTrack.duration,
        segments: [],
        activeSegment: null,
        lyrics: [],
        provider: "demo",
        engine: "audio",
        isLiveRadio: false,
        radioStation: null,
      }));
      loadTrackMeta(nextTrack);
      // async: resolve provider + sponsorblock for the new track
      fetch(`/api/stream-info?trackId=${nextTrack.id}`)
        .then((r) => r.json())
        .then((info: { provider: string; videoId: string | null }) => {
          setState((p) => ({ ...p, provider: info.provider }));
          if (
            stateRef.current.sponsorblockEnabled &&
            info.videoId &&
            /^[\w-]{11}$/.test(info.videoId)
          ) {
            fetch(`/api/sponsorblock?videoId=${info.videoId}`)
              .then((r) => r.json())
              .then((d: { segments: SponsorSegment[] }) =>
                setState((p) => ({ ...p, segments: d.segments ?? [] })),
              )
              .catch(() => {});
          }
        })
        .catch(() => {});
    }
    cf.nextTrack = null;
  }, [loadTrackMeta]);

  /** Cancel any active crossfade (manual track change / seek / radio). */
  const cancelCrossfade = useCallback(() => {
    const cf = crossfadeRef.current;
    if (!cf.active) return;
    if (cf.raf) cancelAnimationFrame(cf.raf);
    cf.active = false;
    cf.raf = null;
    cf.nextTrack = null;
    const targetVol = stateRef.current.muted ? 0 : stateRef.current.volume;
    if (audioRef.current) audioRef.current.volume = targetVol;
    const shadow = getShadowEl();
    if (shadow) {
      shadow.pause();
      shadow.volume = targetVol;
    }
  }, [getShadowEl]);

  /** Check whether to start a crossfade (called on every timeupdate). */
  const triggerCrossfade = useCallback(
    (t: number, duration: number) => {
      const s = stateRef.current;
      if (
        s.engine !== "audio" ||
        s.isLiveRadio ||
        s.crossfadeSeconds <= 0 ||
        crossfadeRef.current.active ||
        !s.current
      )
        return;
      if (!duration || duration < s.crossfadeSeconds * 3) return;
      if (t < duration - s.crossfadeSeconds) return;

      // Determine the next track (mirror goNext logic)
      const { queue, index, shuffle, repeat } = s;
      let nextIndex = index + 1;
      if (shuffle && queue.length > 1) {
        nextIndex = Math.floor(Math.random() * queue.length);
      }
      if (nextIndex >= queue.length) {
        if (repeat === "all") nextIndex = 0;
        else return; // nothing to crossfade into
      }
      const nextTrack = queue[nextIndex];
      if (!nextTrack) return;

      // Begin crossfade
      crossfadeRef.current.active = true;
      crossfadeRef.current.startedAt = Date.now();
      crossfadeRef.current.durationMs = s.crossfadeSeconds * 1000;
      crossfadeRef.current.nextIndex = nextIndex;
      crossfadeRef.current.nextTrack = nextTrack;

      const shadow = getShadowEl();
      const activeEl = audioRef.current;
      if (!shadow || !activeEl) {
        crossfadeRef.current.active = false;
        return;
      }
      const targetVol = s.muted ? 0 : s.volume;

      // Load the next track on the shadow element (async, non-blocking)
      (async () => {
        const downloadedUrl = await getDownloadedUrl(nextTrack.id).catch(() => null);
        if (!crossfadeRef.current.active) return; // cancelled while loading
        shadow.src = downloadedUrl ?? `/api/stream?trackId=${nextTrack.id}`;
        shadow.volume = 0;
        shadow.play().catch(() => {});
      })();

      // Volume ramp via rAF
      const ramp = () => {
        const cf = crossfadeRef.current;
        if (!cf.active) return;
        const elapsed = Date.now() - cf.startedAt;
        const progress = Math.min(1, elapsed / cf.durationMs);
        activeEl.volume = targetVol * (1 - progress);
        shadow.volume = targetVol * progress;
        if (progress >= 1) {
          dispatchRef.current.completeCrossfade();
        } else {
          cf.raf = requestAnimationFrame(ramp);
        }
      };
      crossfadeRef.current.raf = requestAnimationFrame(ramp);
    },
    [getShadowEl],
  );

  /** Set the crossfade duration (0 = off). */
  const setCrossfade = useCallback((seconds: number) => {
    setState((p) => ({ ...p, crossfadeSeconds: seconds }));
    fetch("/api/settings", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ crossfade: seconds }),
    }).catch(() => {});
    if (seconds === 0) dispatchRef.current.cancelCrossfade();
  }, []);

  const togglePlayerHidden = useCallback(() => {
    setState((p) => {
      const nextHidden = !p.playerHidden;
      try {
        localStorage.setItem("euskalsoinua-player-hidden", String(nextHidden));
      } catch (e) {}
      return { ...p, playerHidden: nextHidden };
    });
  }, []);

  // Keep refs up-to-date with latest values safely inside an effect to avoid React 19 render-phase ref mutation warnings.
  useEffect(() => {
    stateRef.current = state;
    dispatchRef.current.goNext = goNext;
    dispatchRef.current.flushListen = flushListen;
    dispatchRef.current.loadTrackViaAudio = loadTrackViaAudio;
    dispatchRef.current.triggerCrossfade = triggerCrossfade;
    dispatchRef.current.cancelCrossfade = cancelCrossfade;
    dispatchRef.current.completeCrossfade = completeCrossfade;
  });

  // -----------------------------------------------------------------------
  // Media Session API — lock-screen + notification controls (background play)
  // -----------------------------------------------------------------------
  useEffect(() => {
    try {
      if (!("mediaSession" in navigator)) return;
      const ms = navigator.mediaSession;
      const c = state.current;
      if (c) {
        const getAbsoluteUrl = (url: string) => {
          if (!url) return "";
          if (url.startsWith("http")) return url;
          return window.location.origin + (url.startsWith("/") ? "" : "/") + url;
        };
        const artwork = [];
        if (c.thumbnail) artwork.push({ src: getAbsoluteUrl(c.thumbnail), sizes: '512x512', type: 'image/jpeg' });
        else if (c.artworkUrl) artwork.push({ src: getAbsoluteUrl(c.artworkUrl), sizes: '512x512', type: 'image/jpeg' });

        ms.metadata = new MediaMetadata({
          title: c.title,
          artist: c.artistName,
          album: c.albumName ?? "EuskalSoinua",
          artwork: artwork.length > 0 ? artwork : undefined,
        });
        ms.playbackState = state.isPlaying ? "playing" : "paused";

        if ("setPositionState" in ms && state.duration > 0 && Number.isFinite(state.currentTime)) {
          ms.setPositionState({
            duration: state.duration,
            playbackRate: 1,
            position: Math.max(0, Math.min(state.currentTime, state.duration)),
          });
        }
      }
      ms.setActionHandler("play", () => togglePlay());
      ms.setActionHandler("pause", () => togglePlay());
      ms.setActionHandler("previoustrack", () => previous());
      ms.setActionHandler("nexttrack", () => goNext(false));
      ms.setActionHandler("seekto", (d) => {
        if (d.seekTime != null) seek(d.seekTime);
      });
      ms.setActionHandler("seekbackward", () => seek(state.currentTime - 10));
      ms.setActionHandler("seekforward", () => seek(state.currentTime + 10));
    } catch (e) {
      console.warn("MediaSession API block or failure:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.current, state.isPlaying]);

  // Preload next 4 tracks in the queue when active song changes to eliminate buffering wait
  useEffect(() => {
    if (state.queue.length === 0 || state.index < 0) return;
    const next4 = state.queue.slice(state.index + 1, state.index + 5);
    next4.forEach((track) => {
      if (!track) return;
      // Fetch stream-info (which resolves and database-caches the video ID and preview urls on the server)
      // and lyrics in the background so they are ready instantly.
      fetch(`/api/stream-info?trackId=${track.id}`).catch(() => {});
      fetch(`/api/lyrics?trackId=${track.id}`).catch(() => {});
    });

    // Gapless pre-buffer: put the immediate next track's URL into the standby element
    // so the browser OS media pipeline downloads it ahead of time.
    if (next4[0] && state.crossfadeSeconds === 0) {
      const shadow = activeSlotRef.current === "A" ? elBRef.current : elARef.current;
      if (shadow) {
        shadow.src = `/api/stream?trackId=${next4[0].id}`;
        shadow.load();
      }
    }
  }, [state.current, state.queue, state.index, state.crossfadeSeconds]);

  // keep audio volume in sync
  useEffect(() => {
    if (audioRef.current) audioRef.current.volume = state.muted ? 0 : state.volume;
    try {
      ytRef.current?.setVolume(Math.round((state.muted ? 0 : state.volume) * 100));
    } catch {
      /* noop */
    }
  }, [state.volume, state.muted]);

  // YouTube time polling (the YT API has no timeupdate event).
  useEffect(() => {
    if (state.engine !== "youtube") return;
    const id = setInterval(() => {
      const yt = ytRef.current;
      if (!yt) return;
      let t = 0;
      let d = 0;
      try {
        t = yt.getCurrentTime();
        d = yt.getDuration();
      } catch {
        return;
      }
      setState((p) => ({ ...p, currentTime: t, duration: d || p.duration }));
      if (listenRef.current) listenRef.current.maxPos = Math.max(listenRef.current.maxPos, t);
      // SponsorBlock auto-skip
      if (stateRef.current.sponsorblockEnabled && stateRef.current.segments.length) {
        const seg = stateRef.current.segments.find((s) => t >= s.start && t < s.end - 0.3);
        if (seg) {
          try {
            yt.seekTo(seg.end, true);
          } catch {
            /* noop */
          }
          setState((p) => ({ ...p, activeSegment: seg, currentTime: seg.end }));
          return;
        }
      }
      setState((p) => ({ ...p, activeSegment: null }));
    }, 250);
    return () => clearInterval(id);
  }, [state.engine]);

  const value: PlayerState & PlayerActions = {
    ...state,
    playQueue,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    toggleMute,
    toggleShuffle,
    toggleBooster,
    toggleFullTrack,
    playRadio,
    playLiveRadio,
    cycleRepeat,
    setEqBand,
    applyEqBands,
    toggleEq,
    toggleSponsorblock,
    openNowPlaying,
    closeNowPlaying,
    setSleepTimer,
    cancelSleepTimer,
    setCrossfade,
    togglePlayerHidden,
  };

  return (
    <PlayerContext.Provider value={value}>
      {children}
      {/*
        The persistent <audio> element. Rendered in the root-layout tree so it
        survives all client-side navigation — this is what keeps music playing
        while the user browses. No `controls` => invisible; listeners wired via
        the callback ref above.
      */}
      <audio ref={attachAudioRef} preload="auto" playsInline controls style={{ display: "none" }} />
      {/* Second audio element for crossfade transitions (overlapping A/B). */}
      <audio ref={attachAudioBRef} preload="auto" playsInline controls style={{ display: "none" }} />
      {/* Hidden host for the YouTube IFrame player (full-track mode). Kept
          off-screen rather than display:none so the browser doesn't throttle
          its audio. The inner div uses a ref (NOT an id) and the YT iframe is
          created imperatively inside it — React never touches it, so it can't
          be destroyed during re-renders/navigation. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          width: 1,
          height: 1,
          left: -9999,
          top: -9999,
          opacity: 0,
          pointerEvents: "none",
        }}
      >
        <div ref={ytContainerRef} />
      </div>
    </PlayerContext.Provider>
  );
}

export function usePlayer() {
  const ctx = useContext(PlayerContext);
  if (!ctx) throw new Error("usePlayer must be used within PlayerProvider");
  return ctx;
}
