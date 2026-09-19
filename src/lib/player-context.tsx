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
import { getDownloadedUrl, getDownloadedUrlSync } from "@/lib/downloads";
import { useToast } from "@/lib/toast";

// 5-band equalizer centre frequencies (Hz).
const EQ_FREQS = [60, 230, 910, 3600, 14000];

type RepeatMode = "off" | "all" | "one";

// Minimal YouTube IFrame Player API surface (avoids needing @types/youtube).
interface YTVideoOptions {
  videoId: string;
  startSeconds?: number;
  endSeconds?: number;
  suggestedQuality?: string;
}

interface YTPlayer {
  loadVideoById: (args: string | YTVideoOptions, startSeconds?: number) => void;
  cueVideoById: (args: string | YTVideoOptions, startSeconds?: number) => void;
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
  playbackRate: number;
  playerHidden: boolean;
}

interface PlayerActions {
  playQueue: (tracks: Track[], startIndex?: number) => void;
  addToQueue: (item: Track | Track[]) => void;
  playNext: (item: Track | Track[]) => void;
  removeFromQueue: (index: number) => void;
  reorderQueue: (fromIndex: number, toIndex: number) => void;
  clearQueue: () => void;
  togglePlay: () => void;
  next: (auto?: boolean) => void;
  previous: () => void;
  seek: (time: number) => void;
  setVolume: (v: number) => void;
  setPlaybackRate: (rate: number) => void;
  toggleMute: () => void;
  toggleShuffle: () => void;
  toggleBooster: () => void;
  toggleFullTrack: () => void;
  setFullTrackMode: (val: boolean) => void;
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
  playbackRate: 1.0,
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
  onTime: (_el: HTMLAudioElement, _t: number) => {},
  onPlay: (_el: HTMLAudioElement) => {},
  onPause: (_el: HTMLAudioElement) => {},
  onWaiting: (_el: HTMLAudioElement) => {},
  onPlaying: (_el: HTMLAudioElement) => {},
  onEnded: (_el: HTMLAudioElement) => {},
  onError: (_el: HTMLAudioElement, _e?: Event) => {},
};

// YouTube videos that refuse to embed (error 101/150). Tracked PER VIDEO so one
// un-embeddable upload never forces every later song onto the preview fallback.
const failedEmbedVideoIds = new Set<string>();

// Generates a proper 3-second silent 8kHz 8-bit mono PCM WAV.
// Looping a 3-second buffer avoids hardware buffer-underrun deadlocks in Android AudioTrack/OpenSL ES
// when the smartphone screen locks or Chrome is put in the background.
let cachedSilentUrl = "";
function isSilentAudioSrc(src: string | null | undefined): boolean {
  if (!src) return false;
  return src.startsWith("data:audio/wav") || src.startsWith("blob:") || src.startsWith("data:");
}

function getSilentAudioUrl(): string {
  if (cachedSilentUrl) return cachedSilentUrl;
  const sampleRate = 8000;
  const numChannels = 1;
  const bitsPerSample = 8;
  const durationSeconds = 30; // 30 seconds: exceeds Chrome's 5s threshold for persistent MediaSession
  const dataSize = sampleRate * numChannels * durationSeconds;
  const fileSize = 36 + dataSize;
  const buffer = new Uint8Array(fileSize + 8);
  const view = new DataView(buffer.buffer);

  buffer.set([0x52, 0x49, 0x46, 0x46], 0); // "RIFF"
  view.setUint32(4, fileSize, true);
  buffer.set([0x57, 0x41, 0x56, 0x45], 8); // "WAVE"
  buffer.set([0x66, 0x6d, 0x74, 0x20], 12); // "fmt "
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true); // PCM
  view.setUint16(22, numChannels, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * numChannels * (bitsPerSample / 8), true);
  view.setUint16(32, numChannels * (bitsPerSample / 8), true);
  view.setUint16(34, bitsPerSample, true);
  buffer.set([0x64, 0x61, 0x74, 0x61], 36); // "data"
  view.setUint32(40, dataSize, true);
  buffer.fill(0x80, 44); // 8-bit PCM silence (128 = 0 amplitude)

  if (typeof window !== "undefined" && typeof URL !== "undefined" && typeof Blob !== "undefined") {
    const blob = new Blob([buffer], { type: "audio/wav" });
    cachedSilentUrl = URL.createObjectURL(blob);
  } else {
    let binary = "";
    const len = buffer.byteLength;
    for (let i = 0; i < len; i++) {
      binary += String.fromCharCode(buffer[i]);
    }
    cachedSilentUrl = `data:audio/wav;base64,${btoa(binary)}`;
  }
  return cachedSilentUrl;
}

// Idempotent: safe to call repeatedly on the same element.
function wireAudioListeners(audio: HTMLAudioElement) {
  if (audio.dataset.wired === "1") return;
  audio.dataset.wired = "1";
  audio.addEventListener("timeupdate", () => audioDispatch.onTime(audio, audio.currentTime));
  audio.addEventListener("play", () => audioDispatch.onPlay(audio));
  audio.addEventListener("pause", () => audioDispatch.onPause(audio));
  audio.addEventListener("waiting", () => audioDispatch.onWaiting(audio));
  audio.addEventListener("playing", () => audioDispatch.onPlaying(audio));
  audio.addEventListener("ended", () => audioDispatch.onEnded(audio));
  audio.addEventListener("error", (e) => audioDispatch.onError(audio, e));
}

export function PlayerProvider({ children }: { children: ReactNode }) {
  const { toast } = useToast();
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

  // Cache for preloaded track stream info to allow synchronous track switching in background/lock screen
  const streamInfoCacheRef = useRef<Map<number, { provider: string; videoId: string | null }>>(new Map());

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
    previous: () => {},
    flushListen: (completed: boolean, skipped: boolean) => {},
    loadTrackViaAudio: (track: Track, startTime?: number) => {},
    handleFullTrackError: (track: Track, reason?: string) => {},
    triggerCrossfade: (t: number, duration: number) => {},
    cancelCrossfade: () => {},
    completeCrossfade: () => {},
    toggleShuffle: () => {},
    cycleRepeat: () => {},
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
  const bgResumeLockRef = useRef(false);
  // Explicitly track intentional user pause vs browser/OS auto-pause to prevent accidental restarts
  const userPausedRef = useRef(false);
  // Guard against spurious YouTube pause states while a track transition or initial video load is in flight
  const isTransitioningTrackRef = useRef(false);
  // Track sponsor segments already skipped for the current song to avoid repeated seeking
  const skippedSegmentsRef = useRef<Set<string>>(new Set());

  // Keep an active silent audio loop running on audioRef to anchor the Android Chrome
  // MediaSession notification and prevent the OS from killing background audio playback.
  const ensureSilentAnchor = useCallback(() => {
    const audio = audioRef.current;
    if (!audio) return;
    try {
      const silentUrl = getSilentAudioUrl();
      if (!silentUrl) return;
      if (!isSilentAudioSrc(audio.src) || audio.src !== silentUrl) {
        audio.src = silentUrl;
      }
      audio.loop = true;
      if (audio.paused) {
        const p = audio.play();
        if (p && typeof p.catch === "function") {
          p.catch(() => {});
        }
      }
    } catch {
      /* noop */
    }
  }, []);

  const pauseSilentAnchor = useCallback(() => {
    try {
      const audio = audioRef.current;
      if (audio && isSilentAudioSrc(audio.src)) {
        audio.pause();
      }
    } catch {
      /* noop */
    }
  }, []);

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
        enablejsapi: 1,
        origin: typeof window !== "undefined" ? window.location.origin : undefined,
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
          // If a video was queued while the player was still initializing,
          // load it now that the player is actually ready.
          if (ytPendingVideoId.current) {
            const pending = ytPendingVideoId.current;
            ytPendingVideoId.current = null;
            try {
              ytRef.current?.loadVideoById(pending);
              ytRef.current?.playVideo();
            } catch {
              /* noop */
            }
          } else if (initialVideoId) {
            try {
              ytRef.current?.loadVideoById(initialVideoId);
              ytRef.current?.playVideo();
            } catch {
              /* noop */
            }
          }
          try {
            const iframe = ytContainerRef.current?.querySelector("iframe");
            if (iframe) {
              iframe.setAttribute("allow", "autoplay; encrypted-media; picture-in-picture");
            }
          } catch {}
        },
        onStateChange: (e: { data: number }) => {
          const st = e.data;
          // 0 ENDED, 1 PLAYING, 2 PAUSED, 3 BUFFERING, 5 CUED
          if (st === 1) {
            isTransitioningTrackRef.current = false;
            // Only reset the background transition lock when the tab is in foreground
            if (typeof document !== "undefined" && !document.hidden) {
              bgResumeLockRef.current = false;
            }
            userPausedRef.current = false;
            // Keep silent anchor alive on top-level audio element so Android Chrome
            // maintains background media priority and does not kill the MediaSession.
            ensureSilentAnchor();
            setState((p) => ({ ...p, isPlaying: true, buffering: false }));
            if ("mediaSession" in navigator) {
              navigator.mediaSession.playbackState = "playing";
            }
          }
          else if (st === 2) {
            // Ignore temporary pause events fired by YouTube during track transitions
            if (isTransitioningTrackRef.current) {
              return;
            }

            // If user explicitly paused, or isPlaying is already false: keep it paused!
            if (userPausedRef.current || !stateRef.current.isPlaying) {
              pauseSilentAnchor();
              if ("mediaSession" in navigator) {
                navigator.mediaSession.playbackState = "paused";
              }
              setState((p) => ({ ...p, isPlaying: false }));
              return;
            }

            // Mobile Chrome pauses background iframes automatically (document.hidden = true).
            // Do NOT call loadVideoById here (which would reload the audio stream in an infinite loop!).
            // Merely invoke playVideo() to keep audio playback running without restarting the song.
            if (typeof document !== "undefined" && document.hidden) {
              if (stateRef.current.isPlaying && stateRef.current.engine === "youtube" && !userPausedRef.current) {
                ensureSilentAnchor();
                try {
                  ytRef.current?.playVideo();
                } catch {}
              }
            } else {
              setState((p) => ({ ...p, isPlaying: false }));
              if ("mediaSession" in navigator) {
                navigator.mediaSession.playbackState = "paused";
              }
              pauseSilentAnchor();
            }
          }
          else if (st === 3) {
            setState((p) => ({ ...p, buffering: true }));
          }
          else if (st === 5) {
            // CUED: on mobile devices, initiate playback automatically if not paused by user
            if (stateRef.current.isPlaying && !userPausedRef.current) {
              try {
                ensureSilentAnchor();
                ytRef.current?.playVideo();
              } catch {}
            }
          }
          else if (st === 0) {
            isTransitioningTrackRef.current = false;
            bgResumeLockRef.current = false;
            userPausedRef.current = false;
            dispatchRef.current.flushListen(true, false);
            dispatchRef.current.goNext(true);
          }
        },
        onError: (e: { data: number }) => {
          // 101/150 = embedding disabled for THIS video -> record it
          const errCode = e?.data;
          const vid = ytVideoIdRef.current;
          if (vid && (errCode === 101 || errCode === 150 || errCode === 100)) {
            failedEmbedVideoIds.add(vid);
          }
          const t = stateRef.current.current;
          if (t) {
            if (stateRef.current.fullTrackMode) {
              dispatchRef.current.handleFullTrackError(t, `YouTube playback error (${errCode})`);
            } else {
              dispatchRef.current.loadTrackViaAudio(t);
            }
          }
        },
      },
    });
    return ytRef.current;
  }, [ensureSilentAnchor, loadYouTubeApi, pauseSilentAnchor]);

  // Eagerly pre-warm YouTube IFrame API & player container on mount
  // so playback starts instantly when the user clicks any track
  useEffect(() => {
    const timer = setTimeout(() => {
      loadYouTubeApi()
        .then(() => {
          ensureYTPlayer().catch(() => {});
        })
        .catch(() => {});
    }, 400);
    return () => clearTimeout(timer);
  }, [loadYouTubeApi, ensureYTPlayer]);

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
    audioDispatch.onTime = (el: HTMLAudioElement, t: number) => {
      if (el !== audioRef.current) return;
      if (stateRef.current.engine === "youtube") return;
      if (isSilentAudioSrc(el?.src)) return;

      const dur = el?.duration || 0;
      setState((p) => ({ ...p, currentTime: t, duration: dur }));
      // keep the (optional) EQ audio context alive — resume if the browser
      // suspended it (e.g. after the tab was backgrounded)
      if (ctxRef.current && ctxRef.current.state === "suspended") {
        ctxRef.current.resume().catch(() => {});
      }
      if (listenRef.current) listenRef.current.maxPos = Math.max(listenRef.current.maxPos, t);
      if (stateRef.current.sponsorblockEnabled && stateRef.current.segments.length) {
        const seg = stateRef.current.segments.find(
          (s) => t >= s.start && t < s.end - 0.3 && !skippedSegmentsRef.current.has(`${s.start}-${s.end}`),
        );
        if (seg) {
          skippedSegmentsRef.current.add(`${seg.start}-${seg.end}`);
          el.currentTime = seg.end;
          setState((p) => ({ ...p, activeSegment: seg, currentTime: seg.end }));
          return;
        }
      }
      setState((p) => ({ ...p, activeSegment: null }));
      // Crossfade trigger: when approaching the end of a track
      dispatchRef.current.triggerCrossfade(t, dur);
    };
    audioDispatch.onPlay = (el: HTMLAudioElement) => {
      if (el !== audioRef.current) return;
      if (stateRef.current.engine === "youtube") return;
      if (isSilentAudioSrc(el?.src)) return;
      setState((p) => ({ ...p, isPlaying: true, buffering: false }));
    };
    audioDispatch.onPause = (el: HTMLAudioElement) => {
      if (el !== audioRef.current) return;
      if (stateRef.current.engine === "youtube") return;
      if (isSilentAudioSrc(el?.src)) return;
      setState((p) => ({ ...p, isPlaying: false }));
    };
    audioDispatch.onWaiting = (el: HTMLAudioElement) => {
      if (el !== audioRef.current) return;
      if (stateRef.current.engine === "youtube") return;
      if (isSilentAudioSrc(el?.src)) return;
      setState((p) => ({ ...p, buffering: true }));
    };
    audioDispatch.onPlaying = (el: HTMLAudioElement) => {
      if (el !== audioRef.current) return;
      if (stateRef.current.engine === "youtube") return;
      if (isSilentAudioSrc(el?.src)) return;
      setState((p) => ({ ...p, buffering: false }));
    };
    audioDispatch.onEnded = (el: HTMLAudioElement) => {
      if (el !== audioRef.current) return;
      if (stateRef.current.engine === "youtube") return;
      if (isSilentAudioSrc(el?.src)) return;

      // If a crossfade is active, complete it (swap elements) instead of goNext
      if (crossfadeRef.current.active) {
        dispatchRef.current.completeCrossfade();
        return;
      }
      dispatchRef.current.flushListen(true, false);
      dispatchRef.current.goNext(true);
    };
    audioDispatch.onError = (el: HTMLAudioElement) => {
      if (el !== audioRef.current) return;
      if (stateRef.current.engine === "youtube") return;
      if (isSilentAudioSrc(el?.src)) return;

      setState((p) => ({ ...p, buffering: false }));

      // If playback/loading failed, recover automatically so background playback never crashes
      const cur = stateRef.current.current;
      if (cur && !el.src.includes("fallback=1")) {
        const fallbackSrc = `/api/stream?trackId=${cur.id}&mode=preview&fallback=1`;
        el.src = fallbackSrc;
        el.load();
        el.play().catch(() => {
          setTimeout(() => {
            dispatchRef.current.goNext(true);
          }, 800);
        });
      } else {
        setTimeout(() => {
          dispatchRef.current.goNext(true);
        }, 1000);
      }
    };

    // IMPORTANT: no teardown that pauses/destroys the audio. The singleton must
    // keep playing across route changes, so we intentionally do nothing here.
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
  // all playback paths so the UI and SponsorBlock stay consistent.
  const loadTrackMeta = useCallback(
    (track: Track) => {
      setState((p) => ({ ...p, lyricsLoading: true }));
      fetch(`/api/lyrics?trackId=${track.id}`)
        .then((r) => r.json())
        .then((l: { lines: LyricLine[]; synced: boolean }) =>
          setState((p) => ({ ...p, lyrics: l.lines ?? [], lyricsLoading: false })),
        )
        .catch(() => setState((p) => ({ ...p, lyricsLoading: false })));

      // Resolve stream info and SponsorBlock segments in background
      const mode = stateRef.current.fullTrackMode ? "full" : "preview";
      fetch(`/api/stream-info?trackId=${track.id}&mode=${mode}`)
        .then((r) => r.json())
        .then((info: { provider?: string; videoId?: string | null }) => {
          if (stateRef.current.current?.id === track.id) {
            setState((p) => ({
              ...p,
              provider: info.provider ?? (stateRef.current.fullTrackMode ? "youtube" : "preview"),
              streamingConfigured: true,
            }));
          }
          const vid = info.videoId || track.externalId;
          if (
            stateRef.current.sponsorblockEnabled &&
            vid &&
            /^[\w-]{11}$/.test(vid)
          ) {
            fetch(`/api/sponsorblock?videoId=${vid}`)
              .then((r) => r.json())
              .then((d: { segments: SponsorSegment[] }) => {
                if (stateRef.current.current?.id === track.id) {
                  setState((p) => ({ ...p, segments: d.segments ?? [] }));
                }
              })
              .catch(() => {});
          }
        })
        .catch(() => {});
    },
    [],
  );

  // Compulsory handler for Full Track Mode errors:
  // Showcases loading error and automatically attempts to load the next song in the queue.
  const handleFullTrackError = useCallback(
    (failedTrack: Track, reason?: string) => {
      console.warn(`[Player] Full track failed for "${failedTrack.title}":`, reason);
      isTransitioningTrackRef.current = false;
      toast(`Could not load "${failedTrack.title}" via YouTube. Skipping to next song in queue…`, "⚠️");
      setState((p) => ({
        ...p,
        buffering: false,
        isPlaying: false,
      }));
      // Advance to next song in the queue after a brief moment
      setTimeout(() => {
        dispatchRef.current.goNext(false);
      }, 700);
    },
    [toast],
  );

  // Play a track through the persistent HTML5 <audio> element (full stream or preview).
  // This engine survives screen locking and backgrounding on Android Chrome and iOS.
  const loadTrackViaAudio = useCallback(
    (track: Track, startTime = 0) => {
      // In FULL TRACK MODE, we strictly do NOT allow falling back to royalty-free audio!
      if (stateRef.current.fullTrackMode) {
        dispatchRef.current.handleFullTrackError(track, "Audio fallback blocked in Full Track Mode");
        return;
      }

      const audio = audioRef.current;
      if (!audio) return;
      dispatchRef.current.cancelCrossfade();
      try {
        ytRef.current?.pauseVideo();
      } catch {
        /* noop */
      }
      setState((p) => ({ ...p, engine: "audio", isPlaying: true }));

      const playWithSrc = (src: string) => {
        if (!audioRef.current) return;
        audioRef.current.src = src;
        audioRef.current.loop = false;
        audioRef.current.playbackRate = stateRef.current.playbackRate || 1.0;
        audioRef.current.load();
        if (startTime > 0) {
          audioRef.current.currentTime = startTime;
        }
        if (stateRef.current.eqEnabled) {
          ensureAudioGraph();
          if (ctxRef.current?.state === "suspended") ctxRef.current.resume();
        }
        const playPromise = audioRef.current.play();
        if (playPromise !== undefined) {
          playPromise.catch((err) => {
            if (err?.name !== "AbortError") {
              setState((p) => ({ ...p, isPlaying: false, buffering: false }));
            }
          });
        }
      };

      // Crucial for iOS/Android background audio: we must call .play() synchronously.
      // Therefore we DO NOT await IndexedDB here if we are online. We play the network stream instantly.
      const mode = stateRef.current.fullTrackMode ? "full" : "preview";
      const offlineUrl = getDownloadedUrlSync(track.id);
      if (offlineUrl) {
        playWithSrc(offlineUrl);
      } else {
        playWithSrc(`/api/stream?trackId=${track.id}&mode=${mode}`);
      }
    },
    [ensureAudioGraph],
  );

  // Official YouTube IFrame player (Full song)
  const loadTrackViaYouTube = useCallback(
    async (videoId: string) => {
      isTransitioningTrackRef.current = true;
      userPausedRef.current = false;
      bgResumeLockRef.current = false;
      ytVideoIdRef.current = videoId;
      setState((p) => ({ ...p, engine: "youtube", provider: "youtube", isPlaying: true }));
      // Play silent audio synchronously to bind MediaSession to parent window
      ensureSilentAnchor();
      const existed = !!ytRef.current;
      const player = await ensureYTPlayer(videoId);
      if (!player) {
        const t = stateRef.current.current;
        if (t) {
          if (stateRef.current.fullTrackMode) {
            handleFullTrackError(t, "YouTube player failed to initialize");
          } else {
            loadTrackViaAudio(t);
          }
        }
        return;
      }
      if (existed) {
        if (ytReadyRef.current) {
          try {
            player.loadVideoById(videoId);
            player.playVideo();
          } catch {
            const t = stateRef.current.current;
            if (t) {
              if (stateRef.current.fullTrackMode) {
                handleFullTrackError(t, "Failed to load video on YouTube");
              } else {
                loadTrackViaAudio(t);
              }
            }
          }
        } else {
          ytPendingVideoId.current = videoId;
        }
      } else {
        if (ytReadyRef.current) {
          try {
            player.loadVideoById(videoId);
            player.playVideo();
          } catch {}
        } else {
          ytPendingVideoId.current = videoId;
        }
      }
    },
    [ensureSilentAnchor, ensureYTPlayer, handleFullTrackError, loadTrackViaAudio],
  );

  const loadTrack = useCallback(
    async (track: Track) => {
      isTransitioningTrackRef.current = true;
      skippedSegmentsRef.current.clear();
      // Synchronously clear segment and time state in stateRef to prevent previous track segment clashes
      stateRef.current = {
        ...stateRef.current,
        segments: [],
        activeSegment: null,
        currentTime: 0,
      };

      const currentAudio = audioRef.current;
      if (!currentAudio) return;
      // record previous track outcome
      flushListen(false, listenRef.current ? true : false);
      listenRef.current = { trackId: track.id, maxPos: 0 };

      // Save to localStorage recent tracks cache and dispatch event for immediate UI updates
      try {
        const stored = localStorage.getItem("euskalsoinua_recent_tracks");
        const list: Track[] = stored ? JSON.parse(stored) : [];
        const nextList = [track, ...list.filter((t) => t.id !== track.id)].slice(0, 20);
        localStorage.setItem("euskalsoinua_recent_tracks", JSON.stringify(nextList));
        window.dispatchEvent(new CustomEvent("track-played", { detail: track }));
      } catch (e) {}

      // Log initial listen event immediately to server
      fetch("/api/play", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          trackId: track.id,
          completed: false,
          skipped: false,
          listenSeconds: 1,
        }),
      }).catch(() => {});

      const isYTEnabled = stateRef.current.fullTrackMode;
      if (isYTEnabled) {
        userPausedRef.current = false;
        ensureSilentAnchor();
      }

      setState((p) => ({
        ...p,
        current: track,
        currentTime: 0,
        duration: track.duration,
        segments: [],
        activeSegment: null,
        lyrics: [],
        provider: isYTEnabled ? "youtube" : "demo",
        engine: isYTEnabled ? "youtube" : "audio",
        isLiveRadio: false,
        radioStation: null,
      }));

      // Lyrics and stream info load in background.
      loadTrackMeta(track);

      // Pre-resolve stream info for the NEXT track in queue in background so transitions are instant
      setTimeout(() => {
        const q = stateRef.current.queue;
        const currentIdx = q.findIndex((t) => t.id === track.id);
        if (currentIdx >= 0 && currentIdx + 1 < q.length) {
          const nextT = q[currentIdx + 1];
          if (nextT && !streamInfoCacheRef.current.has(nextT.id)) {
            fetch(`/api/stream-info?trackId=${nextT.id}&mode=${stateRef.current.fullTrackMode ? "full" : "preview"}`)
              .then((r) => r.json())
              .then((info) => {
                if (info?.videoId || !stateRef.current.fullTrackMode) {
                  streamInfoCacheRef.current.set(nextT.id, info);
                }
              })
              .catch(() => {});
          }
        }
      }, 600);

      const cached = streamInfoCacheRef.current.get(track.id);
      const knownVideoId = (cached?.videoId && /^[\w-]{11}$/.test(cached.videoId) && !failedEmbedVideoIds.has(cached.videoId))
        ? cached.videoId
        : (track.externalId && /^[\w-]{11}$/.test(track.externalId) && !failedEmbedVideoIds.has(track.externalId))
          ? track.externalId
          : null;

      if (isYTEnabled && knownVideoId) {
        // Immediate full-track playback via official YouTube player (no preview hijacking)
        ensureSilentAnchor();
        setState((p) => ({
          ...p,
          engine: "youtube",
          provider: "youtube",
          streamingConfigured: true,
          buffering: false,
          isPlaying: true,
        }));
        if (stateRef.current.sponsorblockEnabled) {
          fetch(`/api/sponsorblock?videoId=${knownVideoId}`)
            .then((r) => r.json())
            .then((d: { segments: SponsorSegment[] }) => {
              if (stateRef.current.current?.id === track.id) {
                setState((p) => ({ ...p, segments: d.segments ?? [] }));
              }
            })
            .catch(() => {});
        }
        loadTrackViaYouTube(knownVideoId);
        return;
      }

      if (isYTEnabled && !knownVideoId) {
        // Full Track Mode is ON, but video ID is not cached yet:
        // Keep silent anchor playing so the document has active audio privileges
        ensureSilentAnchor();
        setState((p) => ({ ...p, buffering: true, engine: "youtube", provider: "youtube", isPlaying: true }));
        fetch(`/api/stream-info?trackId=${track.id}&mode=full`)
          .then((r) => r.json())
          .then((info: { provider?: string; videoId?: string | null }) => {
            if (stateRef.current.current?.id !== track.id) return;
            const resolvedVideoId = info?.videoId;
            if (resolvedVideoId && /^[\w-]{11}$/.test(resolvedVideoId) && !failedEmbedVideoIds.has(resolvedVideoId)) {
              streamInfoCacheRef.current.set(track.id, { provider: "youtube", videoId: resolvedVideoId });
              loadTrackViaYouTube(resolvedVideoId);
            } else {
              // Compulsory for Full Track Mode:
              // Cannot fall back to royalty free alternatives.
              // Showcase loading error and try to load the next song in the queue.
              dispatchRef.current.handleFullTrackError(track, "Track unavailable on YouTube");
            }
          })
          .catch(() => {
            if (stateRef.current.current?.id === track.id) {
              dispatchRef.current.handleFullTrackError(track, "Network error resolving YouTube stream");
            }
          });
        return;
      }

      // Fast slot swap to pre-buffered standby element if available
      const shadow = getShadowEl();
      let alreadyPlayingAudio = false;

      if (
        shadow &&
        shadow.dataset.preloadedTrackId === String(track.id)
      ) {
        try {
          dispatchRef.current.cancelCrossfade();
          try {
            ytRef.current?.pauseVideo();
          } catch {}

          currentAudio.pause();
          activeSlotRef.current = activeSlotRef.current === "A" ? "B" : "A";
          audioRef.current = shadow;
          shadow.dataset.preloadedTrackId = "";
          shadow.volume = stateRef.current.muted ? 0 : stateRef.current.volume;
          shadow.muted = stateRef.current.muted;
          shadow.currentTime = 0;

          if (stateRef.current.eqEnabled) {
            ensureAudioGraph();
            if (ctxRef.current?.state === "suspended") ctxRef.current.resume().catch(() => {});
          }

          alreadyPlayingAudio = true;
          shadow.play().catch(() => {
            loadTrackViaAudio(track);
          });
        } catch {
          alreadyPlayingAudio = false;
        }
      }

      if (!alreadyPlayingAudio) {
        loadTrackViaAudio(track);
      }
    },
    [ensureAudioGraph, ensureSilentAnchor, flushListen, getShadowEl, loadTrackMeta, loadTrackViaAudio, loadTrackViaYouTube],
  );

  const preWarmAudio = useCallback(() => {
    const audioA = elARef.current;
    const audioB = elBRef.current;
    const silentUrl = getSilentAudioUrl();
    if (audioA) {
      const isDummyA = !audioA.src || isSilentAudioSrc(audioA.src);
      if (isDummyA) {
        audioA.src = silentUrl;
        audioA.play().catch(() => {});
      }
    }
    if (audioB) {
      const isDummyB = !audioB.src || isSilentAudioSrc(audioB.src);
      if (isDummyB) {
        audioB.src = silentUrl;
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

      // 1. Immediately warm up the stream cache synchronously for tracks with known YouTube IDs
      tracks.forEach((t) => {
        if (!streamInfoCacheRef.current.has(t.id)) {
          if (t.externalId) {
            streamInfoCacheRef.current.set(t.id, {
              provider: "youtube",
              videoId: t.externalId,
            });
          }
        }
      });

      setState((p) => ({ ...p, queue: tracks, index: i }));
      loadTrack(tracks[i]);

      // 2. Identify any upcoming tracks that still lack metadata, and fetch in one deferred batch
      const upcoming = tracks.slice(i + 1, i + 35);
      const unseeded = upcoming.filter((t) => !streamInfoCacheRef.current.has(t.id));
      if (unseeded.length > 0) {
        // Defer background fetch by 400ms so the active track's stream request has initial priority
        setTimeout(() => {
          const idsToBatch = unseeded.slice(0, 30).map((t) => t.id).join(",");
          fetch(`/api/stream-info?trackIds=${idsToBatch}`)
            .then((r) => r.json())
            .then((data) => {
              if (data?.items) {
                for (const [idStr, info] of Object.entries(data.items as Record<string, any>)) {
                  if (info?.videoId || !stateRef.current.fullTrackMode) {
                    streamInfoCacheRef.current.set(Number(idStr), info);
                  }
                }
              }
            })
            .catch(() => {});
        }, 400);
      }
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
      audio.loop = false;
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
        if (st === 1 || stateRef.current.isPlaying) {
          // User explicitly paused playback
          userPausedRef.current = true;
          bgResumeLockRef.current = true;
          stateRef.current = { ...stateRef.current, isPlaying: false };
          try {
            ytRef.current.pauseVideo();
          } catch {}
          pauseSilentAnchor();
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "paused";
          }
          setState((p) => ({ ...p, isPlaying: false }));
        } else {
          // User resumed playback
          userPausedRef.current = false;
          bgResumeLockRef.current = false;
          stateRef.current = { ...stateRef.current, isPlaying: true };
          ensureSilentAnchor();
          try {
            ytRef.current.playVideo();
          } catch {
            const vid = ytVideoIdRef.current;
            const cur = ytRef.current.getCurrentTime() || stateRef.current.currentTime || 0;
            if (vid) {
              ytRef.current.loadVideoById({
                videoId: vid,
                startSeconds: Math.max(0, Math.floor(cur)),
              });
              ytRef.current.playVideo();
            }
          }
          if ("mediaSession" in navigator) {
            navigator.mediaSession.playbackState = "playing";
          }
          setState((p) => ({ ...p, isPlaying: true }));
        }
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
      userPausedRef.current = false;
      bgResumeLockRef.current = false;
      audio.play().catch(() => {});
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "playing";
      }
      setState((p) => ({ ...p, isPlaying: true }));
    } else {
      userPausedRef.current = true;
      bgResumeLockRef.current = true;
      audio.pause();
      if ("mediaSession" in navigator) {
        navigator.mediaSession.playbackState = "paused";
      }
      setState((p) => ({ ...p, isPlaying: false }));
    }
  }, [ensureAudioGraph, ensureSilentAnchor, pauseSilentAnchor, preWarmAudio]);

  const goNext = useCallback(
    (auto = false) => {
      isTransitioningTrackRef.current = true;
      userPausedRef.current = false;
      bgResumeLockRef.current = false;
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
    isTransitioningTrackRef.current = true;
    userPausedRef.current = false;
    bgResumeLockRef.current = false;
    preWarmAudio();
    dispatchRef.current.cancelCrossfade();
    flushListen(false, true);
    goNext(false);
  }, [goNext, flushListen, preWarmAudio]);

  const previous = useCallback(() => {
    isTransitioningTrackRef.current = true;
    userPausedRef.current = false;
    bgResumeLockRef.current = false;
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
    preWarmAudio();
    setState((p) => {
      const fullTrackMode = !p.fullTrackMode;
      stateRef.current = { ...stateRef.current, fullTrackMode };
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
  }, [loadTrack, preWarmAudio]);

  const setFullTrackMode = useCallback((val: boolean) => {
    preWarmAudio();
    setState((p) => {
      if (p.fullTrackMode === val) return p;
      stateRef.current = { ...stateRef.current, fullTrackMode: val };
      fetch("/api/settings", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ full_track: val }),
      }).catch(() => {});
      // reload current track through the new engine
      if (p.current) {
        setTimeout(() => loadTrack(p.current!), 0);
      }
      return { ...p, fullTrackMode: val };
    });
  }, [loadTrack, preWarmAudio]);

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

  // Playback Speed
  const setPlaybackRate = useCallback((rate: number) => {
    setState((p) => ({ ...p, playbackRate: rate }));
    if (audioRef.current) {
      audioRef.current.playbackRate = rate;
    }
  }, []);

  // Queue Management
  const addToQueue = useCallback((item: Track | Track[]) => {
    const newTracks = Array.isArray(item) ? item : [item];
    if (!newTracks.length) return;
    setState((p) => {
      const updatedQueue = [...p.queue, ...newTracks];
      if (p.index === -1 || !p.current) {
        const nextTrack = updatedQueue[0];
        setTimeout(() => loadTrack(nextTrack), 0);
        return {
          ...p,
          queue: updatedQueue,
          index: 0,
          current: nextTrack,
          isPlaying: true,
        };
      }
      return { ...p, queue: updatedQueue };
    });
  }, [loadTrack]);

  const playNext = useCallback((item: Track | Track[]) => {
    const newTracks = Array.isArray(item) ? item : [item];
    if (!newTracks.length) return;
    setState((p) => {
      if (p.index === -1 || !p.current) {
        setTimeout(() => loadTrack(newTracks[0]), 0);
        return {
          ...p,
          queue: newTracks,
          index: 0,
          current: newTracks[0],
          isPlaying: true,
        };
      }
      const updatedQueue = [
        ...p.queue.slice(0, p.index + 1),
        ...newTracks,
        ...p.queue.slice(p.index + 1),
      ];
      return { ...p, queue: updatedQueue };
    });
  }, [loadTrack]);

  const removeFromQueue = useCallback((removeIdx: number) => {
    setState((p) => {
      if (removeIdx < 0 || removeIdx >= p.queue.length) return p;
      const updatedQueue = p.queue.filter((_, i) => i !== removeIdx);
      let newIdx = p.index;
      if (removeIdx < p.index) {
        newIdx -= 1;
      } else if (removeIdx === p.index) {
        if (updatedQueue.length > 0) {
          const nextIdx = Math.min(removeIdx, updatedQueue.length - 1);
          const nextTrack = updatedQueue[nextIdx];
          setTimeout(() => loadTrack(nextTrack), 0);
          return { ...p, queue: updatedQueue, index: nextIdx, current: nextTrack };
        } else {
          return { ...p, queue: [], index: -1, current: null, isPlaying: false };
        }
      }
      return { ...p, queue: updatedQueue, index: newIdx };
    });
  }, [loadTrack]);

  const reorderQueue = useCallback((fromIdx: number, toIdx: number) => {
    setState((p) => {
      if (
        fromIdx < 0 ||
        fromIdx >= p.queue.length ||
        toIdx < 0 ||
        toIdx >= p.queue.length ||
        fromIdx === toIdx
      ) {
        return p;
      }
      const newQueue = [...p.queue];
      const [moved] = newQueue.splice(fromIdx, 1);
      newQueue.splice(toIdx, 0, moved);

      let newCurrentIndex = p.index;
      if (p.index === fromIdx) {
        newCurrentIndex = toIdx;
      } else if (fromIdx < p.index && toIdx >= p.index) {
        newCurrentIndex -= 1;
      } else if (fromIdx > p.index && toIdx <= p.index) {
        newCurrentIndex += 1;
      }

      return { ...p, queue: newQueue, index: newCurrentIndex };
    });
  }, []);

  const clearQueue = useCallback(() => {
    setState((p) => {
      if (p.index === -1) return { ...p, queue: [] };
      const newQueue = p.queue.slice(0, p.index + 1);
      return { ...p, queue: newQueue };
    });
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
      (() => {
        const downloadedUrl = getDownloadedUrlSync(nextTrack.id);
        if (!crossfadeRef.current.active) return; // cancelled while loading
        const mode = s.fullTrackMode ? "full" : "preview";
        shadow.src = downloadedUrl ?? `/api/stream?trackId=${nextTrack.id}&mode=${mode}`;
        shadow.loop = false;
        shadow.volume = 0;
        shadow.play().catch(() => {});
      })();

      // Volume ramp with background screen-lock resilience
      const ramp = () => {
        const cf = crossfadeRef.current;
        if (!cf.active) return;
        // If document is hidden / screen locked in background, complete crossfade immediately
        if (typeof document !== "undefined" && document.hidden) {
          dispatchRef.current.completeCrossfade();
          return;
        }
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

      if (typeof document !== "undefined" && document.hidden) {
        dispatchRef.current.completeCrossfade();
      } else {
        crossfadeRef.current.raf = requestAnimationFrame(ramp);
      }
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
    dispatchRef.current.previous = previous;
    dispatchRef.current.flushListen = flushListen;
    dispatchRef.current.loadTrackViaAudio = loadTrackViaAudio;
    dispatchRef.current.handleFullTrackError = handleFullTrackError;
    dispatchRef.current.triggerCrossfade = triggerCrossfade;
    dispatchRef.current.cancelCrossfade = cancelCrossfade;
    dispatchRef.current.completeCrossfade = completeCrossfade;
    dispatchRef.current.toggleShuffle = toggleShuffle;
    dispatchRef.current.cycleRepeat = cycleRepeat;
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
        const artwork: MediaImage[] = [];
        const artSrc = c.thumbnail || c.artworkUrl;
        if (artSrc) {
          const abs = getAbsoluteUrl(artSrc);
          artwork.push(
            { src: abs, sizes: "96x96" },
            { src: abs, sizes: "128x128" },
            { src: abs, sizes: "192x192" },
            { src: abs, sizes: "256x256" },
            { src: abs, sizes: "384x384" },
            { src: abs, sizes: "512x512" },
          );
        }

        const baseAlbum = c.albumName ?? "EuskalSoinua";
        const shuffleBadge = state.shuffle ? "🔀 Shuffle" : null;
        const repeatBadge =
          state.repeat === "one"
            ? "🔁 Repeat 1"
            : state.repeat === "all"
            ? "🔁 Repeat All"
            : null;
        const badges = [shuffleBadge, repeatBadge].filter(Boolean).join(" • ");
        const displayAlbum = badges ? `${baseAlbum} (${badges})` : baseAlbum;

        ms.metadata = new MediaMetadata({
          title: c.title,
          artist: c.artistName,
          album: displayAlbum,
          artwork: artwork.length > 0 ? artwork : undefined,
        });
        ms.playbackState = state.isPlaying ? "playing" : "paused";

        if ("setPositionState" in ms && state.duration > 0 && Number.isFinite(state.currentTime)) {
          try {
            ms.setPositionState({
              duration: Math.max(state.duration, 1),
              playbackRate: state.isPlaying ? (state.playbackRate || 1) : 0,
              position: Math.max(0, Math.min(state.currentTime, state.duration)),
            });
          } catch {}
        }
      }

      ms.setActionHandler("play", () => {
        userPausedRef.current = false;
        bgResumeLockRef.current = false;
        stateRef.current = { ...stateRef.current, isPlaying: true };
        preWarmAudio();
        const s = stateRef.current;
        if (s.eqEnabled) {
          ensureAudioGraph();
          if (ctxRef.current?.state === "suspended") ctxRef.current.resume().catch(() => {});
        }
        if (s.engine === "youtube" && ytRef.current) {
          ensureSilentAnchor();
          try {
            ytRef.current.playVideo();
          } catch {
            const vid = ytVideoIdRef.current;
            const cur = ytRef.current.getCurrentTime() || stateRef.current.currentTime || 0;
            if (vid) {
              ytRef.current.loadVideoById({
                videoId: vid,
                startSeconds: Math.max(0, Math.floor(cur)),
              });
              ytRef.current.playVideo();
            }
          }
        } else {
          audioRef.current?.play().catch(() => {});
        }
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "playing";
        }
        setState((p) => ({ ...p, isPlaying: true }));
      });

      ms.setActionHandler("pause", () => {
        userPausedRef.current = true;
        bgResumeLockRef.current = true;
        stateRef.current = { ...stateRef.current, isPlaying: false };
        const s = stateRef.current;
        if (s.engine === "youtube" && ytRef.current) {
          try {
            ytRef.current.pauseVideo();
          } catch {}
        }
        pauseSilentAnchor();
        if ("mediaSession" in navigator) {
          navigator.mediaSession.playbackState = "paused";
        }
        setState((p) => ({ ...p, isPlaying: false }));
      });

      ms.setActionHandler("previoustrack", () => {
        userPausedRef.current = false;
        bgResumeLockRef.current = false;
        dispatchRef.current.previous();
      });

      ms.setActionHandler("nexttrack", () => {
        userPausedRef.current = false;
        bgResumeLockRef.current = false;
        dispatchRef.current.goNext(false);
      });

      ms.setActionHandler("seekto", (d) => {
        if (d.seekTime != null) seek(d.seekTime);
      });

      // Clear seekbackward / seekforward so Android System MediaStyle Notification
      // prioritizes PREVIOUS and NEXT actions instead of 10s skip buttons in the compact notification view!
      try {
        ms.setActionHandler("seekbackward", null);
        ms.setActionHandler("seekforward", null);
      } catch {}

      // Register draft or vendor-supported actions safely without breaking standard handlers
      try {
        (ms as any).setActionHandler("toggleshuffle", () => {
          dispatchRef.current.toggleShuffle();
        });
      } catch {}

      try {
        (ms as any).setActionHandler("togglerepeat", () => {
          dispatchRef.current.cycleRepeat();
        });
      } catch {}
    } catch (e) {
      console.warn("MediaSession API block or failure:", e);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state.current, state.isPlaying, state.shuffle, state.repeat]);

  // Preload upcoming tracks (up to 35) + previous track in the queue when active song changes to eliminate buffering wait
  useEffect(() => {
    if (state.queue.length === 0 || state.index < 0) return;
    const upcoming = state.queue.slice(state.index + 1, state.index + 36);
    const prevTrack = state.index > 0 ? state.queue[state.index - 1] : null;
    const adjacent = [...upcoming, prevTrack].filter((t): t is Track => Boolean(t));

    // 1. Immediately warm client stream cache for tracks with known metadata
    adjacent.forEach((track) => {
      if (!streamInfoCacheRef.current.has(track.id)) {
        if (track.externalId) {
          streamInfoCacheRef.current.set(track.id, {
            provider: "youtube",
            videoId: track.externalId,
          });
        }
      }
    });

    // 2. Fetch lyrics for immediate next track in background
    if (upcoming[0]) {
      fetch(`/api/lyrics?trackId=${upcoming[0].id}`).catch(() => {});
    }

    // 3. Batch query any tracks still unseeded after a 1200ms grace period so active playback has priority
    const needed = adjacent.filter((t) => !streamInfoCacheRef.current.has(t.id));
    let timer: NodeJS.Timeout | null = null;
    if (needed.length > 0) {
      timer = setTimeout(() => {
        const ids = needed.slice(0, 30).map((t) => t.id).join(",");
        fetch(`/api/stream-info?trackIds=${ids}`)
          .then((r) => r.json())
          .then((data) => {
            if (data?.items) {
              for (const [idStr, info] of Object.entries(data.items as Record<string, any>)) {
                streamInfoCacheRef.current.set(Number(idStr), info);
              }
            }
          })
          .catch(() => {});
      }, 1200);
    }

    // Gapless pre-buffer: put the immediate next track's URL into the standby element
    // so the browser OS media pipeline downloads it ahead of time.
    if (upcoming[0] && state.crossfadeSeconds === 0) {
      const shadow = activeSlotRef.current === "A" ? elBRef.current : elARef.current;
      if (shadow) {
        const targetSrc = `/api/stream?trackId=${upcoming[0].id}&mode=${state.fullTrackMode ? "full" : "preview"}`;
        if (shadow.dataset.preloadedTrackId !== String(upcoming[0].id)) {
          shadow.dataset.preloadedTrackId = String(upcoming[0].id);
          shadow.src = targetSrc;
          shadow.loop = false;
          shadow.preload = "auto";
          shadow.load();
        }
      }
    }

    return () => {
      if (timer) clearTimeout(timer);
    };
  }, [state.queue, state.index, state.crossfadeSeconds, state.fullTrackMode]);

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
        const seg = stateRef.current.segments.find(
          (s) => t >= s.start && t < s.end - 0.3 && !skippedSegmentsRef.current.has(`${s.start}-${s.end}`),
        );
        if (seg) {
          skippedSegmentsRef.current.add(`${seg.start}-${seg.end}`);
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

  // Seamless background audio hand-off and lockscreen handling for mobile Google Chrome
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (typeof document === "undefined") return;
      if (document.hidden) {
        // App is hidden / screen turned off: restart active song to keep background YouTube playback alive
        if (stateRef.current.engine === "youtube" && stateRef.current.isPlaying && !userPausedRef.current) {
          ensureSilentAnchor();
          if (!bgResumeLockRef.current) {
            bgResumeLockRef.current = true;
            setTimeout(() => {
              try {
                if (stateRef.current.isPlaying && stateRef.current.engine === "youtube" && !userPausedRef.current && ytRef.current) {
                  const vid = ytVideoIdRef.current;
                  const cur = ytRef.current.getCurrentTime() || stateRef.current.currentTime || 0;
                  if (vid) {
                    ytRef.current.loadVideoById({
                      videoId: vid,
                      startSeconds: Math.max(0, Math.floor(cur)),
                    });
                    ytRef.current.playVideo();
                  }
                }
              } catch {}
            }, 350);
          }
        }
        if (ctxRef.current && ctxRef.current.state === "suspended") {
          ctxRef.current.resume().catch(() => {});
        }
      } else {
        // App returned to foreground: reset background lock so future screen-locks work cleanly
        bgResumeLockRef.current = false;
        if (ctxRef.current && ctxRef.current.state === "suspended") {
          ctxRef.current.resume().catch(() => {});
        }
        if (stateRef.current.isPlaying && !userPausedRef.current && stateRef.current.engine === "youtube" && ytRef.current) {
          try {
            const st = ytRef.current.getPlayerState();
            if (st !== 1) ytRef.current.playVideo();
          } catch {}
        }
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => document.removeEventListener("visibilitychange", handleVisibilityChange);
  }, [ensureSilentAnchor]);

  const value: PlayerState & PlayerActions = {
    ...state,
    playQueue,
    addToQueue,
    playNext,
    removeFromQueue,
    reorderQueue,
    clearQueue,
    togglePlay,
    next,
    previous,
    seek,
    setVolume,
    setPlaybackRate,
    toggleMute,
    toggleShuffle,
    toggleBooster,
    toggleFullTrack,
    setFullTrackMode,
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
      <audio
        ref={attachAudioRef}
        preload="auto"
        playsInline
        controls
        style={{ position: "fixed", width: 1, height: 1, opacity: 0.01, pointerEvents: "none", zIndex: -100 }}
      />
      {/* Second audio element for crossfade transitions (overlapping A/B). */}
      <audio
        ref={attachAudioBRef}
        preload="auto"
        playsInline
        controls
        style={{ position: "fixed", width: 1, height: 1, opacity: 0.01, pointerEvents: "none", zIndex: -100 }}
      />
      {/* Hidden host for the YouTube IFrame player (full-track mode). Kept
          off-screen rather than display:none so the browser doesn't throttle
          its audio. The inner div uses a ref (NOT an id) and the YT iframe is
          created imperatively inside it — React never touches it, so it can't
          be destroyed during re-renders/navigation. */}
      {/* Official YouTube IFrame player container. Kept in the active paint tree with pointerEvents: none
          so mobile Chrome in Desktop Mode (PC view) does not cull or throttle background media rendering. */}
      <div
        aria-hidden
        style={{
          position: "fixed",
          bottom: 0,
          right: 0,
          width: 240,
          height: 240,
          opacity: 0.02,
          pointerEvents: "none",
          zIndex: 10,
          overflow: "hidden",
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
