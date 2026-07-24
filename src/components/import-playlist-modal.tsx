"use client";

import { useState } from "react";
import { 
  X, 
  Music, 
  Link2, 
  Upload, 
  Sparkles, 
  CheckCircle2, 
  AlertCircle, 
  Play, 
  Compass, 
  Info,
  ExternalLink
} from "lucide-react";
import { AiPlaylistGenerator } from "@/components/ai-playlist-generator";

interface ImportPlaylistModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSuccess?: () => void;
}

const SUPPORTED_PLATFORMS = [
  { id: "Spotify", name: "Spotify", color: "#1DB954", icon: "🟢" },
  { id: "YouTube", name: "YouTube Music", color: "#FF0000", icon: "🔴" },
  { id: "Deezer", name: "Deezer", color: "#EF5466", icon: "🟣" },
  { id: "Apple", name: "Apple Music", color: "#FC3C44", icon: "⚫" }
];

export default function ImportPlaylistModal({ isOpen, onClose, onSuccess }: ImportPlaylistModalProps) {
  const [modalTab, setModalTab] = useState<"ai" | "import">("ai");
  const [platform, setPlatform] = useState("Spotify");
  const [playlistName, setPlaylistName] = useState("");
  const [playlistUrl, setPlaylistUrl] = useState("");
  const [customTracks, setCustomTracks] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "success" | "error">("idle");
  const [errorMessage, setErrorMessage] = useState("");
  const [createdPlaylist, setCreatedPlaylist] = useState<{ id: number; name: string; trackCount: number } | null>(null);
  const [syncStep, setSyncStep] = useState(0);

  if (!isOpen) return null;

  const handleImport = async (e: React.FormEvent) => {
    e.preventDefault();
    setStatus("loading");
    setSyncStep(1);

    // Simulate stepping through realistic syncing stages
    const steps = [
      "Connecting to playlist provider...",
      "Resolving track metadata & ISRC hashes...",
      "Matching songs with EuskalSoinua catalog...",
      "Persisting ad-free stream configurations..."
    ];

    const timer = setInterval(() => {
      setSyncStep((prev) => {
        if (prev < steps.length) {
          return prev + 1;
        }
        clearInterval(timer);
        return prev;
      });
    }, 1500);

    try {
      const res = await fetch("/api/playlists/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          playlistName: playlistName || `My ${platform} Synced Playlist`,
          platform,
          playlistUrl,
          customTracks
        })
      });

      clearInterval(timer);
      const data = await res.json();

      if (!res.ok || !data.success) {
        throw new Error(data.error || "Failed to import playlist");
      }

      setCreatedPlaylist(data.playlist);
      setStatus("success");
      
      // Notify parent layout or components that playlists have been updated
      window.dispatchEvent(new Event("playlists-changed"));
      if (onSuccess) onSuccess();
    } catch (err: any) {
      clearInterval(timer);
      setStatus("error");
      setErrorMessage(err.message || "Something went wrong during the import");
    }
  };

  const getSyncStepText = () => {
    const steps = [
      "Initializing import...",
      "Connecting and authenticating proxy session...",
      "Extracting track listings and ISRC identifiers...",
      "Ingesting metadata as native playable streams...",
      "Finalizing database relationships..."
    ];
    return steps[syncStep] || "Processing playlist data...";
  };

  return (
    <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 overflow-y-auto animate-fade-in">
      <div 
        id="import-modal-card"
        className="bg-bg-soft border border-white/10 rounded-2xl w-full max-w-lg overflow-hidden shadow-2xl relative"
      >
        {/* Header */}
        <div className="p-5 border-b border-white/5 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Sparkles className="text-accent" size={20} />
            <h2 className="text-lg font-bold text-white">Create & Sync Playlist</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-textdim hover:text-white transition p-1 rounded-full hover:bg-white/5"
          >
            <X size={20} />
          </button>
        </div>

        {/* Modal Tabs */}
        <div className="flex border-b border-white/5 bg-black/20">
          <button
            onClick={() => setModalTab("ai")}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-1.5 border-b-2 ${
              modalTab === "ai" ? "border-accent text-accent bg-white/5" : "border-transparent text-textdim hover:text-white"
            }`}
          >
            <Sparkles size={14} /> Gemini AI Curator
          </button>
          <button
            onClick={() => setModalTab("import")}
            className={`flex-1 py-3 text-xs font-bold transition flex items-center justify-center gap-1.5 border-b-2 ${
              modalTab === "import" ? "border-accent text-accent bg-white/5" : "border-transparent text-textdim hover:text-white"
            }`}
          >
            <Link2 size={14} /> Sync External App
          </button>
        </div>

        {modalTab === "ai" ? (
          <div className="p-5">
            <AiPlaylistGenerator />
          </div>
        ) : status === "idle" && (
          <form onSubmit={handleImport} className="p-5 space-y-4">
            {/* Platform Selection */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-textdim mb-2">
                1. Select Music App
              </label>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                {SUPPORTED_PLATFORMS.map((plat) => (
                  <button
                    key={plat.id}
                    type="button"
                    onClick={() => setPlatform(plat.id)}
                    className={`py-2.5 px-3 rounded-xl border font-medium text-xs flex flex-col items-center gap-1.5 transition-all ${
                      platform === plat.id 
                        ? "bg-white/10 border-accent text-white shadow-md"
                        : "bg-white/[0.02] border-white/5 text-textdim hover:border-white/20 hover:text-white"
                    }`}
                  >
                    <span className="text-xl">{plat.icon}</span>
                    <span>{plat.name}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Playlist Name */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-textdim mb-1.5">
                2. Playlist Name (Optional)
              </label>
              <input
                type="text"
                value={playlistName}
                onChange={(e) => setPlaylistName(e.target.value)}
                placeholder={`e.g. My Favorite ${platform} Hits`}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2.5 text-sm text-white placeholder-textfaint focus:outline-none focus:border-accent transition-colors"
              />
            </div>

            {/* Playlist URL */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-textdim mb-1.5 flex items-center justify-between">
                <span>3. Playlist Link or ID</span>
                <span className="text-[10px] text-accent font-normal normal-case flex items-center gap-1">
                  <Info size={10} /> Fully public playlist url
                </span>
              </label>
              <div className="relative">
                <input
                  type="text"
                  value={playlistUrl}
                  onChange={(e) => setPlaylistUrl(e.target.value)}
                  placeholder={`https://open.${platform.toLowerCase()}.com/playlist/...`}
                  className="w-full bg-black/40 border border-white/10 rounded-xl pl-10 pr-4 py-2.5 text-sm text-white placeholder-textfaint focus:outline-none focus:border-accent transition-colors"
                />
                <Link2 size={16} className="absolute left-3.5 top-3.5 text-textfaint" />
              </div>
            </div>

            {/* Optional Specific Tracks */}
            <div>
              <label className="block text-xs font-semibold uppercase tracking-wider text-textdim mb-1.5 flex items-center justify-between">
                <span>4. Paste Exact Songs (Optional)</span>
                <span className="text-[10px] text-textfaint font-normal normal-case">
                  One per line
                </span>
              </label>
              <textarea
                value={customTracks}
                onChange={(e) => setCustomTracks(e.target.value)}
                placeholder="e.g.&#10;ZETAK - Zeinen Ederra Izango Den&#10;Gatibu - Euritan Dantzan&#10;Berri Txarrak - Katedral Bat"
                rows={3}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-2 text-xs text-white placeholder-textfaint focus:outline-none focus:border-accent transition-colors resize-none font-mono"
              />
            </div>

            {/* Hint Card */}
            <div className="bg-white/[0.03] border border-white/5 rounded-xl p-3 flex items-start gap-2.5">
              <Compass className="text-accent shrink-0 mt-0.5" size={15} />
              <p className="text-xs text-textdim leading-relaxed">
                Our server proxy matches metadata with legal ad-free music streams and ingests them into EuskalSoinua catalog so they become fully playable!
              </p>
            </div>

            {/* Submit Button */}
            <button
              type="submit"
              className="w-full bg-accent text-black font-bold py-3 px-4 rounded-xl hover:scale-[1.01] transition active:scale-[0.99] flex items-center justify-center gap-2 text-sm"
            >
              <Upload size={16} />
              Import & Sync Now
            </button>
          </form>
        )}

        {status === "loading" && (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-6 min-h-[350px]">
            {/* Spinning radar visualizer */}
            <div className="relative flex items-center justify-center">
              <div className="h-16 w-16 rounded-full border-4 border-accent/20 border-t-accent animate-spin" />
              <Music className="absolute text-accent animate-pulse" size={24} />
            </div>

            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Synchronizing Playlists</h3>
              <p className="text-sm text-textdim max-w-sm">
                {getSyncStepText()}
              </p>
            </div>

            {/* Loading stages tracker */}
            <div className="w-full max-w-xs space-y-2 text-left">
              {[
                "Initializing local database playlist",
                "Querying external catalog & indices",
                "Resolving high-quality streams"
              ].map((text, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  <span className={`h-2 w-2 rounded-full ${
                    syncStep > idx ? "bg-accent" : syncStep === idx ? "bg-amber-400 animate-pulse" : "bg-white/10"
                  }`} />
                  <span className={syncStep > idx ? "text-white" : "text-textdim"}>
                    {text}
                  </span>
                </div>
              ))}
            </div>
          </div>
        )}

        {status === "success" && createdPlaylist && (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-6 min-h-[350px]">
            <CheckCircle2 size={48} className="text-accent" />
            
            <div className="space-y-2">
              <h3 className="text-xl font-extrabold text-white">Import Complete!</h3>
              <p className="text-sm text-textdim max-w-xs">
                Successfully synced <span className="font-semibold text-white">{createdPlaylist.name}</span> with {createdPlaylist.trackCount} first-class Basque & global playable streams.
              </p>
            </div>

            {/* Action buttons */}
            <div className="flex flex-col sm:flex-row gap-2 w-full pt-2">
              <a
                href={`/playlist/${createdPlaylist.id}`}
                onClick={onClose}
                className="flex-1 bg-white text-black font-bold py-2.5 px-4 rounded-xl hover:scale-[1.02] transition active:scale-[0.98] text-sm flex items-center justify-center gap-1.5"
              >
                <Play size={14} fill="currentColor" /> Open Playlist
              </a>
              <button
                type="button"
                onClick={() => {
                  setPlaylistName("");
                  setPlaylistUrl("");
                  setCustomTracks("");
                  setStatus("idle");
                }}
                className="flex-1 bg-white/10 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-white/15 transition text-sm"
              >
                Sync Another
              </button>
            </div>
          </div>
        )}

        {status === "error" && (
          <div className="p-8 flex flex-col items-center justify-center text-center space-y-6 min-h-[350px]">
            <AlertCircle size={48} className="text-red-500" />
            
            <div className="space-y-2">
              <h3 className="text-lg font-bold text-white">Import Failed</h3>
              <p className="text-sm text-red-400 max-w-xs">
                {errorMessage}
              </p>
            </div>

            <button
              onClick={() => setStatus("idle")}
              className="bg-white text-black font-semibold px-6 py-2 rounded-xl hover:scale-[1.02] transition"
            >
              Try Again
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
