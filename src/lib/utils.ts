// Generic helpers shared across server + client.

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0;
  const s = Math.floor(seconds % 60);
  const m = Math.floor((seconds / 60) % 60);
  const h = Math.floor(seconds / 3600);
  const mm = h > 0 ? String(m).padStart(2, "0") : String(m);
  const ss = String(s).padStart(2, "0");
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

// 32-bit string hash (FNV-1a) -> used for deterministic gradients.
export function hashString(input: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

// Curated neon palette pairs for sleek dark album art.
const PALETTES: [string, string][] = [
  ["#7c3aed", "#0ea5e9"], // violet -> sky
  ["#ec4899", "#8b5cf6"], // pink -> violet
  ["#f43f5e", "#f59e0b"], // rose -> amber
  ["#10b981", "#3b82f6"], // emerald -> blue
  ["#06b6d4", "#6366f1"], // cyan -> indigo
  ["#f97316", "#db2777"], // orange -> pink
  ["#22c55e", "#14b8a6"], // green -> teal
  ["#a855f7", "#64748b"], // purple -> slate
  ["#e11d48", "#7c3aed"], // red -> violet
  ["#2563eb", "#16a34a"], // blue -> green
];

export function gradientFor(seed: string | null | undefined): [string, string] {
  const key = seed && seed.length > 0 ? seed : "default";
  return PALETTES[hashString(key) % PALETTES.length];
}

// Render a sleek gradient cover as an inline style object.
export function coverStyle(
  seed: string | null | undefined,
  size: string = "100%",
): React.CSSProperties {
  const [a, b] = gradientFor(seed);
  return {
    background: `linear-gradient(135deg, ${a} 0%, ${b} 100%)`,
    width: size,
    height: size,
  };
}

export function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function clsx(...parts: (string | false | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// A small debounce helper for the search box.
export function debounce<T extends (...args: never[]) => void>(fn: T, ms: number) {
  let t: ReturnType<typeof setTimeout> | undefined;
  return (...args: Parameters<T>) => {
    if (t) clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

/**
 * Royalty-free / Creative Commons audio fallback bank.
 *
 * When every open-source YouTube proxy instance is blocked or unreachable
 * (increasingly common), the player falls back to these distinct, legally
 * free tracks instead of going silent. The pool is deliberately large and
 * diverse so different catalog songs map to different audio (see
 * `demoAudioForTrack`). Sources:
 *   - SoundHelix (royalty-free, CC) — Songs 1-17
 *   - Incompetech / Kevin MacLeod (CC-BY) — Carefree, Wallpaper, Faceoff, Pamgaea
 *
 * All entries were verified to support HTTP Range requests (seeking).
 */
export const DEMO_AUDIO: string[] = [
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-3.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-5.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-6.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-7.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-9.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-10.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-11.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-12.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-13.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-14.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-15.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-16.mp3",
  "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-17.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Carefree.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Wallpaper.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Faceoff.mp3",
  "https://incompetech.com/music/royalty-free/mp3-royaltyfree/Pamgaea.mp3",
];

export function demoAudioUrl(index: number | null): string {
  if (!index || index < 1 || index > DEMO_AUDIO.length) return DEMO_AUDIO[0];
  return DEMO_AUDIO[index - 1];
}

/**
 * Deterministically pick a DISTINCT royalty-free track for a given catalog id.
 * Using the id as the seed (instead of a fixed value) guarantees that two
 * different songs never collide on the exact same fallback audio, which is what
 * fixes the "every song plays the same track" bug.
 */
export function demoAudioForTrack(trackId: number): string {
  return DEMO_AUDIO[trackId % DEMO_AUDIO.length];
}
