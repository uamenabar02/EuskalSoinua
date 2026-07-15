"use client";

import { useEffect, useState, useCallback } from "react";
import { usePlayer } from "@/lib/player-context";
import { CoverArt } from "@/components/cover";
import { Search as SearchIcon, Loader2, Radio as RadioIcon, Globe2, X } from "lucide-react";
import { clsx } from "@/lib/utils";
import type { RadioStation } from "@/lib/radio-stations";

interface RadioData {
  curated: RadioStation[];
  browse: RadioStation[];
}

const COUNTRY_OPTIONS = [
  { code: "", name: "All countries" },
  { code: "ES", name: "🇪🇸 España" },
  { code: "FR", name: "🇫🇷 France" },
  { code: "GB", name: "🇬🇧 UK" },
  { code: "US", name: "🇺🇸 USA" },
  { code: "DE", name: "🇩🇪 Alemania" },
  { code: "IT", name: "🇮🇹 Italia" },
  { code: "PT", name: "🇵🇹 Portugal" },
  { code: "MX", name: "🇲🇽 México" },
  { code: "AR", name: "🇦🇷 Argentina" },
];

export default function RadioPage() {
  const { playLiveRadio, isLiveRadio, radioStation, isPlaying, togglePlay } = usePlayer();
  const radioPlayingId = isLiveRadio ? radioStation?.id : null;

  const [data, setData] = useState<RadioData | null>(null);
  const [browseQuery, setBrowseQuery] = useState("");
  const [country, setCountry] = useState("");
  const [browse, setBrowse] = useState<RadioStation[]>([]);
  const [browsing, setBrowsing] = useState(false);

  useEffect(() => {
    fetch("/api/radio-stations")
      .then((r) => r.json())
      .then(setData)
      .catch(() => {});
  }, []);

  const runBrowse = useCallback(() => {
    setBrowsing(true);
    const params = new URLSearchParams();
    if (browseQuery.trim()) params.set("q", browseQuery.trim());
    if (country) params.set("country", country);
    fetch(`/api/radio-stations?${params.toString()}`)
      .then((r) => r.json())
      .then((d) => setBrowse(d.browse ?? []))
      .finally(() => setBrowsing(false));
  }, [browseQuery, country]);

  if (!data)
    return (
      <div className="grid place-items-center py-32 text-textdim">
        <Loader2 className="animate-spin-slow" />
      </div>
    );

  // Group curated stations by region
  const regions = groupByRegion(data.curated);

  return (
    <div className="px-4 sm:px-6 pt-6 max-w-[1600px] mx-auto pb-10">
      {/* Header */}
      <header className="mb-8 animate-fade-up">
        <div className="flex items-center gap-3 mb-1">
          <span
            className="grid place-items-center h-12 w-12 rounded-xl shrink-0"
            style={{ background: "linear-gradient(135deg,#ee5a3a,#f59e0b)" }}
          >
            <RadioIcon size={26} className="text-white" />
          </span>
          <div>
            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight">Live Radio</h1>
            <p className="text-textdim text-sm mt-0.5">
              Basque &amp; international live radio stations — Iratxo bizia! 🎙️
            </p>
          </div>
        </div>
      </header>

      {/* Now playing radio banner */}
      {isLiveRadio && radioStation ? (
        <div className="mb-6 flex items-center gap-3 rounded-xl bg-accent/10 border border-accent/30 p-3 animate-fade-up">
          <span className="relative flex h-3 w-3">
            <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
            <span className="relative inline-flex h-3 w-3 rounded-full bg-red-500" />
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-bold truncate">{radioStation.name}</div>
            <div className="text-xs text-textdim">
              {radioStation.category} • LIVE
            </div>
          </div>
          <button
            onClick={togglePlay}
            className="bg-accent text-black font-bold text-sm px-4 py-1.5 rounded-full"
          >
            {isPlaying ? "Pause" : "Play"}
          </button>
        </div>
      ) : null}

      {/* Curated stations by region */}
      {regions.map(({ region, stations }) => (
        <section key={region} className="mb-8">
          <h2 className="text-lg sm:text-xl font-bold mb-3 flex items-center gap-2">
            {region === "Euskadi" ? "🟠" : region === "España" ? "🇪🇸" : "🌍"} {region}
            <span className="text-textfaint font-normal text-sm">({stations.length})</span>
          </h2>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {stations.map((s) => (
              <StationCard
                key={s.id}
                station={s}
                playing={radioPlayingId === s.id && isPlaying}
                onClick={() =>
                  radioPlayingId === s.id ? togglePlay() : playLiveRadio(s)
                }
              />
            ))}
          </div>
        </section>
      ))}

      {/* Browser — Radio Browser API */}
      <section className="mt-8">
        <h2 className="text-lg sm:text-xl font-bold mb-3 flex items-center gap-2">
          <Globe2 size={20} className="text-accent" /> Browse 50,000+ stations
        </h2>
        <div className="flex flex-col sm:flex-row gap-2 mb-4">
          <div className="relative flex-1">
            <SearchIcon size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-textdim" />
            <input
              value={browseQuery}
              onChange={(e) => setBrowseQuery(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && runBrowse()}
              placeholder="Search any station, genre, city…"
              className="w-full bg-white/10 rounded-full pl-11 pr-10 py-3 text-sm outline-none placeholder:text-textdim"
            />
            {browseQuery ? (
              <button
                onClick={() => setBrowseQuery("")}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-textdim hover:text-white"
              >
                <X size={16} />
              </button>
            ) : null}
          </div>
          <select
            value={country}
            onChange={(e) => {
              setCountry(e.target.value);
              setTimeout(runBrowse, 50);
            }}
            className="bg-white/10 rounded-full px-4 py-3 text-sm outline-none cursor-pointer"
          >
            {COUNTRY_OPTIONS.map((c) => (
              <option key={c.code} value={c.code} className="bg-bg-soft">
                {c.name}
              </option>
            ))}
          </select>
          <button
            onClick={runBrowse}
            disabled={browsing}
            className="bg-accent text-black font-bold text-sm px-5 py-3 rounded-full hover:scale-105 transition disabled:opacity-50 whitespace-nowrap"
          >
            {browsing ? "Searching…" : "Search"}
          </button>
        </div>

        {browse.length > 0 ? (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3">
            {browse.map((s) => (
              <StationCard
                key={s.id}
                station={s}
                playing={radioPlayingId === s.id && isPlaying}
                onClick={() =>
                  radioPlayingId === s.id ? togglePlay() : playLiveRadio(s)
                }
                compact
              />
            ))}
          </div>
        ) : browsing ? (
          <div className="py-12 grid place-items-center text-textdim">
            <Loader2 className="animate-spin-slow" />
          </div>
        ) : (
          <p className="text-textdim text-sm px-1">
            Search to discover thousands of live stations worldwide via the
            community Radio Browser directory.
          </p>
        )}
      </section>
    </div>
  );
}

function StationCard({
  station,
  playing,
  onClick,
  compact,
}: {
  station: RadioStation;
  playing: boolean;
  onClick: () => void;
  compact?: boolean;
}) {
  return (
    <button
      onClick={onClick}
      className={clsx(
        "group relative flex items-center gap-3 rounded-xl p-3 transition text-left",
        playing ? "bg-accent/15 ring-1 ring-accent/40" : "bg-panel hover:bg-panel-hover",
      )}
    >
      <div className="relative shrink-0">
        {station.favicon ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={station.favicon}
            alt=""
            referrerPolicy="no-referrer"
            className="h-14 w-14 rounded-lg object-cover bg-white/5"
          />
        ) : (
          <CoverArt
            seed={station.name}
            label={station.name}
            rounded="rounded-lg"
            className="h-14 w-14"
          />
        )}
        {playing ? (
          <span className="absolute inset-0 grid place-items-center rounded-lg bg-black/50">
            <span className="flex gap-[2px] items-end h-4">
              {[0, 1, 2, 3].map((i) => (
                <span key={i} className="eq-bar h-full" style={{ animationDelay: `${i * 0.15}s` }} />
              ))}
            </span>
          </span>
        ) : null}
      </div>
      <div className="min-w-0 flex-1">
        <div className={clsx("font-semibold text-sm truncate", playing && "text-accent")}>
          {station.name}
        </div>
        {!compact ? (
          <div className="text-xs text-textdim truncate">
            {station.tags?.slice(0, 2).join(" • ") || station.category}
            {station.bitrate ? ` • ${station.bitrate}k` : ""}
          </div>
        ) : (
          <div className="text-xs text-textfaint truncate">
            {station.country}
            {station.bitrate ? ` • ${station.bitrate}k` : ""}
          </div>
        )}
        {playing ? (
          <span className="text-[10px] font-bold text-red-500 uppercase tracking-wide flex items-center gap-1 mt-0.5">
            <span className="h-1.5 w-1.5 rounded-full bg-red-500" /> LIVE
          </span>
        ) : null}
      </div>
    </button>
  );
}

function groupByRegion(stations: RadioStation[]) {
  const order = ["Euskadi", "España", "France", "United Kingdom"];
  const map = new Map<string, RadioStation[]>();
  for (const s of stations) {
    const key = s.region || s.country || "Other";
    if (!map.has(key)) map.set(key, []);
    map.get(key)!.push(s);
  }
  return [...map.entries()]
    .map(([region, sts]) => ({ region, stations: sts }))
    .sort((a, b) => {
      const ai = order.indexOf(a.region);
      const bi = order.indexOf(b.region);
      if (ai !== -1 && bi !== -1) return ai - bi;
      if (ai !== -1) return -1;
      if (bi !== -1) return 1;
      return a.region.localeCompare(b.region);
    });
}


